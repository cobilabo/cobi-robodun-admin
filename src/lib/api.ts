export type Issue = {
  level: 'error' | 'warning';
  catalog?: string;
  id?: string;
  message: string;
};

export type AssetEntry = {
  relativePath: string;
  name: string;
  category: string;
  kind: 'image' | 'audio' | 'other';
  size: number;
  mtimeMs: number;
};

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || res.statusText);
  }
  return data as T;
}

export const api = {
  health: () =>
    req<{
      ok: boolean;
      gameRoot: string | null;
      libraryRoot: string | null;
      projectOk: boolean;
    }>('/api/health'),

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

  getCatalog: (name: string) =>
    req<{ ok: boolean; file: string; data: unknown }>(`/api/catalogs/${name}`),

  saveCatalog: (name: string, data: unknown) =>
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

  importAsset: (libraryPath: string, destPath: string) =>
    req<{ ok: boolean; path: string }>('/api/assets/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ libraryPath, destPath }),
    }),

  trimAsset: (path: string, source: 'project' | 'library' = 'project') =>
    req<{
      ok: boolean;
      before: { width: number; height: number };
      after: { width: number; height: number };
      trimmed: boolean;
    }>('/api/assets/trim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, source }),
    }),

  bumpContentVersion: () =>
    req<{ ok: boolean; from: string; to: string }>(
      '/api/ops/bump-content-version',
      { method: 'POST' },
    ),
};

export function assetUrl(rel: string) {
  return `/api/asset-file?path=${encodeURIComponent(rel)}`;
}

export function libraryUrl(rel: string) {
  return `/api/library-file?path=${encodeURIComponent(rel)}`;
}
