import type { AdminApi, AssetEntry, Issue } from './apiTypes';
import { CATALOG_IDS } from './catalogRegistry';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || res.statusText);
  }
  return data as T;
}

export const localApi: AdminApi = {
  health: () =>
    req('/api/health').then((d: any) => ({
      ok: true,
      mode: 'local' as const,
      gameRoot: d.gameRoot ?? null,
      libraryRoot: d.libraryRoot ?? null,
      projectOk: Boolean(d.projectOk),
    })),

  dashboard: () =>
    req<{
      ok: boolean;
      gameRoot: string;
      counts: Record<string, number>;
      issues: Issue[];
      contentVersion: string | null;
    }>('/api/dashboard'),

  catalogs: () =>
    req<{
      ok: boolean;
      catalogs: { id: string; file: string; exists: boolean; count: number }[];
    }>('/api/catalogs'),

  getCatalog: (name) =>
    req<{ ok: boolean; file: string; data: unknown }>(`/api/catalogs/${name}`),

  saveCatalog: (name, data) =>
    req<{ ok: boolean; backupPath: string | null; issues: Issue[] }>(
      `/api/catalogs/${name}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      },
    ),

  validate: () => req<{ ok: boolean; issues: Issue[] }>('/api/validate'),

  assets: (sub = '') =>
    req<{ ok: boolean; assets: AssetEntry[] }>(
      `/api/assets${sub ? `?sub=${encodeURIComponent(sub)}` : ''}`,
    ),

  library: () =>
    req<{ ok: boolean; libraryRoot: string | null; assets: AssetEntry[] }>(
      '/api/library',
    ),

  async resolveAssetUrls(paths, source = 'project') {
    const urls: Record<string, string> = {};
    for (const p of paths) {
      urls[p] =
        source === 'library'
          ? `/api/library-file?path=${encodeURIComponent(p)}`
          : `/api/asset-file?path=${encodeURIComponent(p)}`;
    }
    return { ok: true, urls };
  },

  importAsset: (libraryPath, destPath) =>
    req<{ ok: boolean; path: string }>('/api/assets/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ libraryPath, destPath }),
    }),

  trimAsset: (path, source = 'project') =>
    req('/api/assets/trim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, source }),
    }),

  trimBatch: (paths, source = 'project') =>
    req('/api/assets/trim-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, source }),
    }),

  deleteAsset: (path, source = 'project') =>
    req<{ ok: boolean; path: string }>('/api/assets/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, source }),
    }),

  copyLibraryAsset: (srcPath, destPath) =>
    req<{ ok: boolean; path: string }>('/api/library/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ srcPath, destPath }),
    }),

  moveAsset: (srcPath, destPath, source = 'project') =>
    req<{ ok: boolean; path: string }>('/api/assets/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ srcPath, destPath, source }),
    }),

  createCategory: (category, source = 'project') =>
    req<{ ok: boolean; category: string; path: string }>(
      '/api/categories/create',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, source }),
      },
    ),

  deleteCategory: (category, source = 'project') =>
    req<{ ok: boolean; category: string; deleted: number }>(
      '/api/categories/delete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, source }),
      },
    ),

  renameCategory: (fromCategory, toCategory, source = 'project') =>
    req<{ ok: boolean; from: string; to: string; moved: number }>(
      '/api/categories/rename',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromCategory, toCategory, source }),
      },
    ),

  generateLibraryImage: (referencePaths, prompt, destPath) =>
    req<{ ok: boolean; path: string }>('/api/library/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referencePaths, prompt, destPath }),
    }),

  bumpContentVersion: () =>
    req('/api/ops/bump-content-version', { method: 'POST' }),

  async uploadAsset(destPath, file, contentType) {
    const form = new FormData();
    form.append('destPath', destPath);
    form.append('file', file, destPath.split('/').pop() || 'upload.bin');
    if (contentType) form.append('contentType', contentType);
    return req<{ ok: boolean; path: string }>('/api/assets/upload', {
      method: 'POST',
      body: form,
    });
  },

  async uploadLibraryFile(relativePath, file, contentType) {
    const form = new FormData();
    form.append('destPath', relativePath);
    form.append(
      'file',
      file,
      relativePath.split('/').pop() || 'upload.bin',
    );
    if (contentType) form.append('contentType', contentType);
    return req<{ ok: boolean; path: string }>('/api/library/upload', {
      method: 'POST',
      body: form,
    });
  },

  async exportBundle() {
    const catalogs = await Promise.all(
      CATALOG_IDS.map(async (id) => {
        const r = await req<{ data: unknown }>(`/api/catalogs/${id}`);
        return [id, r.data] as const;
      }),
    );
    const data = Object.fromEntries(catalogs);
    return new Blob(
      [
        JSON.stringify(
          {
            manifest: { exportedAt: new Date().toISOString(), mode: 'local' },
            data,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
  },

  async exportGameZip(onProgress) {
    onProgress?.('ZIP を作成中…');
    const res = await fetch('/api/ops/export-game-zip');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }
    onProgress?.('ダウンロード準備完了');
    return res.blob();
  },
};
