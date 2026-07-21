import { zipSync, strToU8 } from 'fflate';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  deleteObject,
  getBlob,
  getDownloadURL,
  list,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  getDb,
  getFirebaseApp,
  getFirebaseAuth,
  getFirebaseStorage,
} from '../firebase/config';
import {
  categoryKeepPath,
  categoryStoragePrefix,
  isCategoryKeepPath,
  normalizeCategoryName,
  rewritePathCategory,
} from './assetCategory';
import { trimImageBlob } from './browserTrim';
import type { AdminApi, AssetEntry } from './apiTypes';
import { orderCatalogData, stringifyCatalog } from './catalogOrder';
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

/** Firestore throws if any field is `undefined`. */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)) as T;
  }
  if (value !== null && typeof value === 'object') {
    // Keep Firestore Timestamp / Date / FieldValue as-is
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

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
      result[id] = orderCatalogData(
        id,
        id === 'audio'
          ? { version: 1, cues: [] }
          : id === 'hud'
            ? { ...DEFAULT_HUD, assetSlots: [...DEFAULT_HUD.assetSlots] }
            : [],
      );
    } else {
      result[id] = orderCatalogData(id, snap.data().data);
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
              ? { ...DEFAULT_HUD, assetSlots: [...DEFAULT_HUD.assetSlots] }
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
      const data = orderCatalogData(
        name,
        name === 'audio'
          ? { version: 1, cues: [] }
          : name === 'hud'
            ? { ...DEFAULT_HUD, assetSlots: [...DEFAULT_HUD.assetSlots] }
            : [],
      );
      return {
        ok: true,
        file: `${name}.json`,
        data,
      };
    }
    return {
      ok: true,
      file: `${name}.json`,
      data: orderCatalogData(name, snap.data().data),
    };
  },

  async saveCatalog(name, data) {
    const user = requireUser();
    // Firestore rejects `undefined` anywhere in the document.
    const ordered = stripUndefinedDeep(orderCatalogData(name, data));
    const db = getDb();
    const catalogRef = doc(db, 'catalogs', name);

    // 上書き前の内容を履歴へ（クラウド側の誤消対策）
    let backupPath: string | null = null;
    try {
      const prev = await getDoc(catalogRef);
      if (prev.exists()) {
        const prevData = prev.data();
        const now = Timestamp.now();
        const revRef = await addDoc(collection(db, 'catalogHistory', name, 'revisions'), {
          data: prevData.data ?? null,
          savedAt: now,
          savedAtServer: serverTimestamp(),
          savedBy: user.email ?? user.uid,
          sourceUpdatedAt: prevData.updatedAt ?? null,
          sourceUpdatedBy: prevData.updatedBy ?? null,
        });
        backupPath = `catalogHistory/${name}/revisions/${revRef.id}`;

        // 直近 30 件を超えた古い履歴を削除
        const histQ = query(
          collection(db, 'catalogHistory', name, 'revisions'),
          orderBy('savedAt', 'desc'),
          limit(40),
        );
        const histSnap = await getDocs(histQ);
        const stale = histSnap.docs.slice(30);
        await Promise.all(stale.map((d) => deleteDoc(d.ref)));
      }
    } catch (err) {
      console.warn('catalog history backup failed', err);
    }

    await setDoc(
      catalogRef,
      {
        data: ordered,
        updatedAt: serverTimestamp(),
        updatedBy: user.email ?? user.uid,
      },
      { merge: true },
    );
    const catalogs = await loadAllCatalogs();
    catalogs[name] = ordered;
    const paths = await assetPathList();
    const issues = validateCatalogBundle(catalogs, paths);
    return { ok: true, backupPath, issues };
  },

  async validate() {
    requireUser();
    const catalogs = await loadAllCatalogs();
    const paths = await assetPathList();
    return { ok: true, issues: validateCatalogBundle(catalogs, paths) };
  },

  async assets(sub = '') {
    requireUser();
    // Always re-list: Storage may change outside this tab (CLI / other device).
    invalidateListCache(PROJECT_PREFIX);
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
    // Always re-list: Storage may change outside this tab (CLI / other device).
    invalidateListCache(LIBRARY_PREFIX);
    const items = await listStorageTree(LIBRARY_PREFIX);
    // Include .keep placeholders so empty categories remain visible
    const assets = await toAssetEntries(
      items.filter(
        (i) =>
          kindOf(i.relativePath) === 'image' ||
          isCategoryKeepPath(i.relativePath),
      ),
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
    const storageRef = ref(getFirebaseStorage(), full);
    // getBlob uses the SDK auth channel (avoids CORS issues with download URLs)
    const blob = await getBlob(storageRef);
    const result = await trimImageBlob(blob);
    if (result.trimmed && result.blob) {
      await uploadBytes(storageRef, result.blob, {
        contentType: 'image/png',
      });
      downloadUrlCache.delete(full);
      invalidateListCache(source === 'library' ? LIBRARY_PREFIX : PROJECT_PREFIX);
      // Warm a fresh download URL (token may be unchanged; client still cache-busts).
      try {
        const fresh = await getDownloadURL(storageRef);
        downloadUrlCache.set(full, fresh);
      } catch {
        /* ignore */
      }
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

  async deleteAsset(path, source = 'project') {
    requireUser();
    const relative = path.replace(/\\/g, '/').replace(/^\/+/, '');
    const full = await resolveStoragePath(relative, source);
    await deleteObject(ref(getFirebaseStorage(), full));
    downloadUrlCache.delete(full);
    invalidateListCache(source === 'library' ? LIBRARY_PREFIX : PROJECT_PREFIX);
    if (source === 'project') {
      try {
        await deleteDoc(doc(getDb(), 'assets', relative.replace(/\//g, '__')));
      } catch {
        /* index doc が無い場合もある */
      }
    }
    return { ok: true, path: relative };
  },

  async copyLibraryAsset(srcPath, destPath) {
    requireUser();
    const src = srcPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const dest = destPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!src || !dest) throw new Error('srcPath / destPath が必要です');
    if (src === dest) throw new Error('複製先が複製元と同じです');
    const blob = await getBlob(ref(getFirebaseStorage(), `${LIBRARY_PREFIX}/${src}`));
    await uploadBytes(ref(getFirebaseStorage(), `${LIBRARY_PREFIX}/${dest}`), blob, {
      contentType: blob.type || 'application/octet-stream',
    });
    invalidateListCache(LIBRARY_PREFIX);
    return { ok: true, path: dest };
  },

  async moveAsset(srcPath, destPath, source = 'project') {
    requireUser();
    const src = srcPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const dest = destPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!src || !dest) throw new Error('srcPath / destPath が必要です');
    if (src === dest) return { ok: true, path: dest };

    const prefix = source === 'library' ? LIBRARY_PREFIX : PROJECT_PREFIX;
    const storage = getFirebaseStorage();
    const srcRef = ref(storage, `${prefix}/${src}`);
    const destRef = ref(storage, `${prefix}/${dest}`);
    const blob = await getBlob(srcRef);
    await uploadBytes(destRef, blob, {
      contentType: blob.type || 'application/octet-stream',
    });
    await deleteObject(srcRef);
    downloadUrlCache.delete(`${prefix}/${src}`);
    downloadUrlCache.delete(`${prefix}/${dest}`);
    invalidateListCache(prefix);

    if (source === 'project') {
      try {
        await deleteDoc(doc(getDb(), 'assets', src.replace(/\//g, '__')));
      } catch {
        /* optional index */
      }
      await setDoc(
        doc(getDb(), 'assets', dest.replace(/\//g, '__')),
        {
          path: dest,
          updatedAt: serverTimestamp(),
          updatedBy: getFirebaseAuth().currentUser?.email ?? null,
        },
        { merge: true },
      );
    }
    return { ok: true, path: dest };
  },

  async createCategory(category, source = 'project') {
    requireUser();
    const cat = normalizeCategoryName(category);
    const keepRel = categoryKeepPath(cat, source);
    const prefix = source === 'library' ? LIBRARY_PREFIX : PROJECT_PREFIX;
    const storagePrefix = categoryStoragePrefix(cat, source);
    const items = await listStorageTree(prefix);
    const existing = items.filter((i) =>
      i.relativePath.startsWith(storagePrefix),
    );
    if (existing.length > 0) {
      return { ok: true, category: cat, path: keepRel };
    }
    await uploadBytes(
      ref(getFirebaseStorage(), `${prefix}/${keepRel}`),
      new Blob([''], { type: 'text/plain' }),
      { contentType: 'text/plain' },
    );
    invalidateListCache(prefix);
    return { ok: true, category: cat, path: keepRel };
  },

  async deleteCategory(category, source = 'project') {
    requireUser();
    const cat = normalizeCategoryName(category);
    const prefix = source === 'library' ? LIBRARY_PREFIX : PROJECT_PREFIX;
    const storagePrefix = categoryStoragePrefix(cat, source);
    const items = await listStorageTree(prefix);
    const under = items.filter((i) =>
      i.relativePath.startsWith(storagePrefix),
    );
    const images = under.filter(
      (i) =>
        kindOf(i.relativePath) === 'image' &&
        !isCategoryKeepPath(i.relativePath),
    );
    if (images.length > 0) {
      throw new Error(
        `カテゴリ「${cat}」には画像が ${images.length} 件あるため削除できません`,
      );
    }
    if (under.length === 0) {
      throw new Error(`カテゴリ「${cat}」が見つかりません`);
    }
    for (const item of under) {
      await deleteObject(ref(getFirebaseStorage(), item.fullPath));
      downloadUrlCache.delete(item.fullPath);
      if (source === 'project') {
        try {
          await deleteDoc(
            doc(getDb(), 'assets', item.relativePath.replace(/\//g, '__')),
          );
        } catch {
          /* optional */
        }
      }
    }
    invalidateListCache(prefix);
    return { ok: true, category: cat, deleted: under.length };
  },

  async renameCategory(fromCategory, toCategory, source = 'project') {
    requireUser();
    const from = normalizeCategoryName(fromCategory);
    const to = normalizeCategoryName(toCategory);
    if (from === to) return { ok: true, from, to, moved: 0 };

    const prefix = source === 'library' ? LIBRARY_PREFIX : PROJECT_PREFIX;
    const fromPrefix = categoryStoragePrefix(from, source);
    const toPrefix = categoryStoragePrefix(to, source);
    const items = await listStorageTree(prefix);
    const under = items.filter((i) =>
      i.relativePath.startsWith(fromPrefix),
    );
    if (under.length === 0) {
      throw new Error(`カテゴリ「${from}」が見つかりません`);
    }
    const destClash = items.filter(
      (i) =>
        i.relativePath.startsWith(toPrefix) &&
        !i.relativePath.startsWith(fromPrefix),
    );
    if (destClash.length > 0) {
      throw new Error(
        `移動先カテゴリ「${to}」には既に ${destClash.length} 件のファイルがあります`,
      );
    }

    const storage = getFirebaseStorage();
    let moved = 0;
    for (const item of under) {
      const destRel = rewritePathCategory(
        item.relativePath,
        from,
        to,
        source,
      );
      const blob = await getBlob(ref(storage, item.fullPath));
      await uploadBytes(ref(storage, `${prefix}/${destRel}`), blob, {
        contentType: blob.type || 'application/octet-stream',
      });
      await deleteObject(ref(storage, item.fullPath));
      downloadUrlCache.delete(item.fullPath);
      downloadUrlCache.delete(`${prefix}/${destRel}`);
      if (source === 'project') {
        try {
          await deleteDoc(
            doc(getDb(), 'assets', item.relativePath.replace(/\//g, '__')),
          );
        } catch {
          /* optional */
        }
        await setDoc(
          doc(getDb(), 'assets', destRel.replace(/\//g, '__')),
          {
            path: destRel,
            updatedAt: serverTimestamp(),
            updatedBy: getFirebaseAuth().currentUser?.email ?? null,
          },
          { merge: true },
        );
      }
      moved++;
    }
    invalidateListCache(prefix);
    return { ok: true, from, to, moved };
  },

  async generateLibraryImage(referencePaths, prompt, destPath, options) {
    requireUser();
    const fn = httpsCallable(
      getFunctions(getFirebaseApp(), 'asia-northeast1'),
      'generateLibraryImage',
    );
    const shape = options?.shape ?? 'square';
    const transparentBackground = options?.transparentBackground !== false;
    const result = await fn({
      referencePaths,
      prompt,
      destPath,
      shape,
      transparentBackground,
    });
    const data = result.data as {
      ok?: boolean;
      path?: string;
      shape?: string;
      transparentBackground?: boolean;
      width?: number;
      height?: number;
    };
    if (!data?.path) throw new Error('生成結果のパスがありません');
    invalidateListCache(LIBRARY_PREFIX);
    return {
      ok: true,
      path: data.path,
      shape: data.shape,
      transparentBackground: data.transparentBackground,
      width: data.width,
      height: data.height,
    };
  },

  async translateAudioPrompt(input) {
    requireUser();
    const fn = httpsCallable(
      getFunctions(getFirebaseApp(), 'asia-northeast1'),
      'translateAudioPrompt',
    );
    const result = await fn(input);
    const data = result.data as {
      ok?: boolean;
      english?: string;
      japanese?: string;
    };
    if (!data?.english) throw new Error('英語プロンプトの変換結果がありません');
    return {
      ok: true,
      english: data.english,
      japanese: data.japanese ?? input.japanese,
    };
  },

  async generateProjectAudio(input) {
    requireUser();
    const fn = httpsCallable(
      getFunctions(getFirebaseApp(), 'asia-northeast1'),
      'generateProjectAudio',
      { timeout: 540_000 },
    );
    const result = await fn(input);
    const data = result.data as {
      ok?: boolean;
      path?: string;
      originalPath?: string;
      originalFormat?: string;
      provider?: 'stable-audio' | 'elevenlabs';
      kind?: string;
      durationSeconds?: number;
      prompt?: string;
      contentType?: string;
    };
    if (!data?.path || !data.provider) {
      throw new Error('音声生成結果のパスがありません');
    }
    invalidateListCache(PROJECT_PREFIX);
    return {
      ok: true,
      path: data.path,
      originalPath: data.originalPath,
      originalFormat: data.originalFormat,
      provider: data.provider,
      kind: data.kind ?? input.kind,
      durationSeconds: data.durationSeconds ?? input.durationSeconds ?? 0,
      prompt: data.prompt ?? input.prompt ?? '',
      contentType: data.contentType,
    };
  },

  async normalizeProjectAudio(input) {
    requireUser();
    const fn = httpsCallable(
      getFunctions(getFirebaseApp(), 'asia-northeast1'),
      'normalizeProjectAudio',
      { timeout: 300_000 },
    );
    const result = await fn(input);
    const data = result.data as {
      ok?: boolean;
      path?: string;
      originalPath?: string;
      originalFormat?: string;
      contentType?: string;
    };
    if (!data?.path || !data.originalPath || !data.originalFormat) {
      throw new Error('音声正規化結果がありません');
    }
    invalidateListCache(PROJECT_PREFIX);
    return {
      ok: true,
      path: data.path,
      originalPath: data.originalPath,
      originalFormat: data.originalFormat,
      contentType: data.contentType,
    };
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
    const orderedData: Record<string, unknown> = {};
    for (const id of CATALOG_IDS) {
      orderedData[id] = orderCatalogData(id, catalogs[id]);
    }
    return new Blob(
      [JSON.stringify({ ...payload, data: orderedData }, null, 2)],
      { type: 'application/json' },
    );
  },

  async exportGameZip(onProgress) {
    requireUser();
    onProgress?.('カタログを収集中…');
    const catalogs = await loadAllCatalogs();
    const files: Record<string, Uint8Array> = {};

    for (const id of CATALOG_IDS) {
      files[`data/${id}.json`] = strToU8(
        stringifyCatalog(
          id,
          catalogs[id] ?? (id === 'audio' ? { version: 1, cues: [] } : []),
        ),
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
