import { zipSync, strToU8 } from 'fflate';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getBlob, getDownloadURL, list, ref, uploadBytes } from 'firebase/storage';
import {
  getDb,
  getFirebaseAuth,
  getFirebaseStorage,
} from '../firebase/config';
import { trimImageBlob } from './browserTrim';
import type { AdminApi, AssetEntry } from './apiTypes';
import { catalogEntryCount, DEFAULT_HUD } from './catalogRegistry';
import { CATALOG_IDS, validateCatalogBundle } from './validateContent';

const PROJECT_PREFIX = 'project/assets';
const LIBRARY_PREFIX = 'library';

type ListedItem = {
  relativePath: string;
  fullPath: string;
  size: number;
  updated: number;
};

const listCache = new Map<string, { at: number; items: ListedItem[] }>();
const LIST_CACHE_MS = 5 * 60 * 1000;
const downloadUrlCache = new Map<string, string>();

function requireUser() {
  const u = getFirebaseAuth().currentUser;
  if (!u) throw new Error('ログインが必要です');
  return u;
}

function categoryOf(rel: string): string {
  const parts = rel.split('/');
  if (parts[0] === 'UI' && parts.length >= 2) return parts[1];
  if (parts[0] === 'audio' && parts.length >= 2) return `audio/${parts[1]}`;
  return parts[0] || 'root';
}

function kindOf(rel: string): AssetEntry['kind'] {
  const ext = rel.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  if (['ogg', 'wav', 'mp3', 'm4a'].includes(ext)) return 'audio';
  return 'other';
}

async function listStorageTree(prefix: string): Promise<ListedItem[]> {
  const hit = listCache.get(prefix);
  if (hit && Date.now() - hit.at < LIST_CACHE_MS) return hit.items;

  const rootRef = ref(getFirebaseStorage(), prefix);
  const out: ListedItem[] = [];

  async function walk(folder: ReturnType<typeof ref>) {
    let pageToken: string | undefined;
    const childPrefixes: ReturnType<typeof ref>[] = [];
    do {
      const listed = await list(folder, { maxResults: 1000, pageToken });
      for (const item of listed.items) {
        const relativePath = item.fullPath
          .slice(prefix.length)
          .replace(/^\//, '');
        out.push({
          relativePath,
          fullPath: item.fullPath,
          size: 0,
          updated: Date.now(),
        });
      }
      childPrefixes.push(...listed.prefixes);
      pageToken = listed.nextPageToken;
    } while (pageToken);
    // Walk child folders in parallel (library has many category dirs)
    await Promise.all(childPrefixes.map((p) => walk(p)));
  }

  try {
    await walk(rootRef);
  } catch {
    // empty bucket / no permission
  }
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  listCache.set(prefix, { at: Date.now(), items: out });
  return out;
}

async function resolveUrlsBatch(
  fullPaths: { relativePath: string; fullPath: string }[],
  concurrency = 24,
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  const pending: { relativePath: string; fullPath: string }[] = [];

  for (const item of fullPaths) {
    const cached = downloadUrlCache.get(item.fullPath);
    if (cached) urls[item.relativePath] = cached;
    else pending.push(item);
  }

  let i = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, pending.length) },
    async () => {
      while (i < pending.length) {
        const idx = i++;
        const item = pending[idx];
        try {
          const url = await getDownloadURL(
            ref(getFirebaseStorage(), item.fullPath),
          );
          downloadUrlCache.set(item.fullPath, url);
          urls[item.relativePath] = url;
        } catch {
          // missing / denied
        }
      }
    },
  );
  await Promise.all(workers);
  return urls;
}

async function loadAllCatalogs(): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const id of CATALOG_IDS) {
    const snap = await getDoc(doc(getDb(), 'catalogs', id));
    if (!snap.exists()) {
      result[id] =
        id === 'audio'
          ? { version: 1, cues: [] }
          : id === 'hud'
            ? { ...DEFAULT_HUD, equipmentSlots: [...DEFAULT_HUD.equipmentSlots] }
            : [];
    } else {
      result[id] = snap.data().data;
    }
  }
  return result;
}

async function assetPathList(): Promise<string[]> {
  const items = await listStorageTree(PROJECT_PREFIX);
  return items.map((i) => i.relativePath);
}

async function toAssetEntries(
  items: { relativePath: string; fullPath: string; size: number; updated: number }[],
  withUrl: boolean,
): Promise<AssetEntry[]> {
  const entries: AssetEntry[] = [];
  for (const item of items) {
    let url: string | undefined;
    if (withUrl) {
      try {
        url = await getDownloadURL(ref(getFirebaseStorage(), item.fullPath));
      } catch {
        url = undefined;
      }
    }
    entries.push({
      relativePath: item.relativePath,
      name: item.relativePath.split('/').pop() ?? item.relativePath,
      category: categoryOf(item.relativePath),
      kind: kindOf(item.relativePath),
      size: item.size,
      mtimeMs: item.updated,
      url,
    });
  }
  return entries;
}

async function resolveStoragePath(
  relativePath: string,
  source: 'project' | 'library',
): Promise<string> {
  const prefix = source === 'library' ? LIBRARY_PREFIX : PROJECT_PREFIX;
  return `${prefix}/${relativePath.replace(/^\/+/, '')}`;
}

function invalidateListCache(prefix?: string) {
  if (prefix) listCache.delete(prefix);
  else listCache.clear();
}

export const cloudApi: AdminApi = {
  async health() {
    return {
      ok: true,
      mode: 'cloud',
      gameRoot: 'firebase://catalogs+storage',
      libraryRoot: LIBRARY_PREFIX,
      projectOk: true,
    };
  },

  async dashboard() {
    requireUser();
    const catalogs = await loadAllCatalogs();
    const paths = await assetPathList();
    const counts: Record<string, number> = {};
    for (const id of CATALOG_IDS) {
      counts[`${id}.json`] = catalogEntryCount(id, catalogs[id]);
    }
    return {
      ok: true,
      gameRoot: 'Firebase (cloud)',
      counts,
      issues: validateCatalogBundle(catalogs, paths),
      contentVersion: null,
    };
  },

  async catalogs() {
    requireUser();
    const catalogs = await Promise.all(
      CATALOG_IDS.map(async (id) => {
        const snap = await getDoc(doc(getDb(), 'catalogs', id));
        const data = snap.exists()
          ? snap.data().data
          : id === 'audio'
            ? { version: 1, cues: [] }
            : id === 'hud'
              ? { ...DEFAULT_HUD, equipmentSlots: [...DEFAULT_HUD.equipmentSlots] }
              : [];
        return {
          id,
          file: `${id}.json`,
          exists: snap.exists(),
          count: catalogEntryCount(id, data),
        };
      }),
    );
    return { ok: true, catalogs };
  },

  async getCatalog(name) {
    requireUser();
    const snap = await getDoc(doc(getDb(), 'catalogs', name));
    if (!snap.exists()) {
      const data =
        name === 'audio'
          ? { version: 1, cues: [] }
          : name === 'hud'
            ? { ...DEFAULT_HUD, equipmentSlots: [...DEFAULT_HUD.equipmentSlots] }
            : [];
      return {
        ok: true,
        file: `${name}.json`,
        data,
      };
    }
    return { ok: true, file: `${name}.json`, data: snap.data().data };
  },

  async saveCatalog(name, data) {
    const user = requireUser();
    await setDoc(
      doc(getDb(), 'catalogs', name),
      {
        data,
        updatedAt: serverTimestamp(),
        updatedBy: user.email ?? user.uid,
      },
      { merge: true },
    );
    const catalogs = await loadAllCatalogs();
    catalogs[name] = data;
    const paths = await assetPathList();
    const issues = validateCatalogBundle(catalogs, paths);
    return { ok: true, backupPath: null, issues };
  },

  async validate() {
    requireUser();
    const catalogs = await loadAllCatalogs();
    const paths = await assetPathList();
    return { ok: true, issues: validateCatalogBundle(catalogs, paths) };
  },

  async assets(sub = '') {
    requireUser();
    const items = await listStorageTree(PROJECT_PREFIX);
    const filtered = sub
      ? items.filter((i) => i.relativePath.replace(/\\/g, '/').startsWith(sub.replace(/\\/g, '/')))
      : items;
    // Paths only — thumbs resolve via resolveAssetUrls for visible rows
    const assets = await toAssetEntries(filtered, false);
    return { ok: true, assets };
  },

  async library() {
    requireUser();
    const items = await listStorageTree(LIBRARY_PREFIX);
    const assets = await toAssetEntries(
      items.filter((i) => kindOf(i.relativePath) === 'image'),
      false,
    );
    return { ok: true, libraryRoot: 'firebase://library', assets };
  },

  async resolveAssetUrls(paths, source = 'project') {
    requireUser();
    const prefix = source === 'library' ? LIBRARY_PREFIX : PROJECT_PREFIX;
    const uniq = [...new Set(paths.map((p) => p.replace(/\\/g, '/').replace(/^\/+/, '')))];
    const urls = await resolveUrlsBatch(
      uniq.map((relativePath) => ({
        relativePath,
        fullPath: `${prefix}/${relativePath}`,
      })),
    );
    return { ok: true, urls };
  },

  async importAsset(libraryPath, destPath) {
    requireUser();
    const srcRef = ref(getFirebaseStorage(), `${LIBRARY_PREFIX}/${libraryPath}`);
    const blob = await getBlob(srcRef);
    const dest = destPath.replace(/\\/g, '/').replace(/^\/+/, '');
    await uploadBytes(ref(getFirebaseStorage(), `${PROJECT_PREFIX}/${dest}`), blob, {
      contentType: blob.type || 'image/png',
      customMetadata: { importedFrom: libraryPath },
    });
    invalidateListCache(PROJECT_PREFIX);
    // index doc for faster listing (optional)
    await setDoc(
      doc(getDb(), 'assets', dest.replace(/\//g, '__')),
      {
        path: dest,
        updatedAt: serverTimestamp(),
        updatedBy: getFirebaseAuth().currentUser?.email ?? null,
      },
      { merge: true },
    );
    return { ok: true, path: dest };
  },

  async trimAsset(path, source = 'project') {
    requireUser();
    const full = await resolveStoragePath(path, source);
    // getBlob uses the SDK auth channel (avoids CORS issues with download URLs)
    const blob = await getBlob(ref(getFirebaseStorage(), full));
    const result = await trimImageBlob(blob);
    if (result.trimmed && result.blob) {
      await uploadBytes(ref(getFirebaseStorage(), full), result.blob, {
        contentType: 'image/png',
      });
      downloadUrlCache.delete(full);
      invalidateListCache(source === 'library' ? LIBRARY_PREFIX : PROJECT_PREFIX);
    }
    return {
      ok: true,
      before: result.before,
      after: result.after,
      trimmed: result.trimmed,
    };
  },

  async trimBatch(paths, source = 'project') {
    requireUser();
    const results = [];
    for (const p of paths) {
      try {
        const one = await cloudApi.trimAsset(p, source);
        results.push({
          path: p,
          ok: true,
          trimmed: one.trimmed,
          before: one.before,
          after: one.after,
        });
      } catch (e) {
        results.push({ path: p, ok: false, error: String(e) });
      }
    }
    return {
      ok: true,
      trimmedCount: results.filter((r) => r.ok && r.trimmed).length,
      unchangedCount: results.filter((r) => r.ok && !r.trimmed).length,
      failedCount: results.filter((r) => !r.ok).length,
      results,
    };
  },

  async bumpContentVersion() {
    throw new Error(
      'クラウドモードでは ContentVersion バンプはできません。エクスポート後にゲームリポで行ってください。',
    );
  },

  async uploadAsset(destPath, file, contentType) {
    requireUser();
    const dest = destPath.replace(/\\/g, '/').replace(/^\/+/, '');
    await uploadBytes(ref(getFirebaseStorage(), `${PROJECT_PREFIX}/${dest}`), file, {
      contentType: contentType || file.type || 'application/octet-stream',
    });
    invalidateListCache(PROJECT_PREFIX);
    await setDoc(
      doc(getDb(), 'assets', dest.replace(/\//g, '__')),
      {
        path: dest,
        updatedAt: serverTimestamp(),
        updatedBy: getFirebaseAuth().currentUser?.email ?? null,
      },
      { merge: true },
    );
    return { ok: true, path: dest };
  },

  async uploadLibraryFile(relativePath, file, contentType) {
    requireUser();
    const dest = relativePath
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .split('/')
      .filter((s) => s && s !== '.' && s !== '..')
      .join('/');
    if (!dest) throw new Error('不正なパスです');
    await uploadBytes(ref(getFirebaseStorage(), `${LIBRARY_PREFIX}/${dest}`), file, {
      contentType: contentType || file.type || 'application/octet-stream',
    });
    invalidateListCache(LIBRARY_PREFIX);
    downloadUrlCache.delete(`${LIBRARY_PREFIX}/${dest}`);
    return { ok: true, path: dest };
  },

  async exportBundle() {
    requireUser();
    const catalogs = await loadAllCatalogs();
    const manifest = {
      exportedAt: new Date().toISOString(),
      exportedBy: getFirebaseAuth().currentUser?.email ?? null,
      catalogs: Object.keys(catalogs),
    };
    const payload = {
      manifest,
      data: catalogs,
      note: 'ゲーム反映は exportGameZip（data + assets）を推奨します。',
    };
    return new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
  },

  async exportGameZip(onProgress) {
    requireUser();
    onProgress?.('カタログを収集中…');
    const catalogs = await loadAllCatalogs();
    const files: Record<string, Uint8Array> = {};

    for (const id of CATALOG_IDS) {
      files[`data/${id}.json`] = strToU8(
        `${JSON.stringify(catalogs[id] ?? (id === 'audio' ? { version: 1, cues: [] } : []), null, 2)}\n`,
      );
    }

    onProgress?.('アセット一覧を取得中…');
    invalidateListCache(PROJECT_PREFIX);
    const items = await listStorageTree(PROJECT_PREFIX);
    let n = 0;
    for (const item of items) {
      n++;
      if (n % 8 === 0 || n === items.length) {
        onProgress?.(`アセット取得 ${n}/${items.length}…`);
      }
      try {
        const blob = await getBlob(ref(getFirebaseStorage(), item.fullPath));
        files[`assets/${item.relativePath}`] = new Uint8Array(
          await blob.arrayBuffer(),
        );
      } catch {
        /* skip missing */
      }
    }

    files['IMPORT.txt'] = strToU8(
      [
        'Robodun content export',
        '',
        '展開後、この ZIP 直下の data/ と assets/ を',
        'cobi-robodun（ゲームリポ）のルートに上書きコピーしてください。',
        '',
        `exportedAt: ${new Date().toISOString()}`,
        `exportedBy: ${getFirebaseAuth().currentUser?.email ?? ''}`,
        `catalogs: ${CATALOG_IDS.join(', ')}`,
        `assets: ${items.length}`,
        '',
      ].join('\n'),
    );

    onProgress?.('ZIP 圧縮中…');
    const zipped = zipSync(files, { level: 6 });
    return new Blob([zipped], { type: 'application/zip' });
  },
};
