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
  /** cloud: download URL; local: unused (proxy path used instead) */
  url?: string;
};

export type TrimOneResult = {
  ok: boolean;
  before: { width: number; height: number };
  after: { width: number; height: number };
  trimmed: boolean;
};

export type TrimBatchResult = {
  ok: boolean;
  trimmedCount: number;
  unchangedCount: number;
  failedCount: number;
  results: {
    path: string;
    ok: boolean;
    trimmed?: boolean;
    before?: { width: number; height: number };
    after?: { width: number; height: number };
    error?: string;
  }[];
};

export type AdminApi = {
  health: () => Promise<{
    ok: boolean;
    mode: 'local' | 'cloud';
    gameRoot: string | null;
    libraryRoot: string | null;
    projectOk: boolean;
  }>;
  dashboard: () => Promise<{
    ok: boolean;
    gameRoot: string;
    counts: Record<string, number>;
    issues: Issue[];
    contentVersion: string | null;
  }>;
  catalogs: () => Promise<{
    ok: boolean;
    catalogs: { id: string; file: string; exists: boolean; count: number }[];
  }>;
  getCatalog: (name: string) => Promise<{ ok: boolean; file: string; data: unknown }>;
  saveCatalog: (
    name: string,
    data: unknown,
  ) => Promise<{ ok: boolean; backupPath: string | null; issues: Issue[] }>;
  validate: () => Promise<{ ok: boolean; issues: Issue[] }>;
  assets: (sub?: string) => Promise<{ ok: boolean; assets: AssetEntry[] }>;
  library: () => Promise<{
    ok: boolean;
    libraryRoot: string | null;
    assets: AssetEntry[];
  }>;
  /** cloud: resolve Storage download URLs for listing thumbs (local: no-op paths) */
  resolveAssetUrls: (
    paths: string[],
    source: 'project' | 'library',
  ) => Promise<{ ok: boolean; urls: Record<string, string> }>;
  importAsset: (
    libraryPath: string,
    destPath: string,
  ) => Promise<{ ok: boolean; path: string }>;
  trimAsset: (
    path: string,
    source?: 'project' | 'library',
  ) => Promise<TrimOneResult>;
  trimBatch: (
    paths: string[],
    source?: 'project' | 'library',
  ) => Promise<TrimBatchResult>;
  bumpContentVersion: () => Promise<{ ok: boolean; from: string; to: string }>;
  uploadAsset: (
    destPath: string,
    file: Blob,
    contentType?: string,
  ) => Promise<{ ok: boolean; path: string }>;
  /** Upload one file into library/ (cloud) or LIBRARY_ROOT (local). */
  uploadLibraryFile: (
    relativePath: string,
    file: Blob,
    contentType?: string,
  ) => Promise<{ ok: boolean; path: string }>;
  /** Legacy JSON-only catalog dump */
  exportBundle: () => Promise<Blob>;
  /**
   * Game sync ZIP: data/*.json + assets/** at archive root.
   * Extract and merge into cobi-robodun repo root.
   */
  exportGameZip: (
    onProgress?: (message: string) => void,
  ) => Promise<Blob>;
};
