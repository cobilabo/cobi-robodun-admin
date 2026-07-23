import { getDataMode, isCloudMode } from './mode';
import { localApi } from './localApi';
import type { AdminApi, AssetEntry, Issue } from './apiTypes';

export type { AssetEntry, Issue };

let cached: AdminApi | null = null;

async function apiImpl(): Promise<AdminApi> {
  if (cached) return cached;
  if (isCloudMode()) {
    const mod = await import('./cloudApi');
    cached = mod.cloudApi;
  } else {
    cached = localApi;
  }
  return cached;
}

type AsyncApi = {
  [K in keyof Required<AdminApi>]: NonNullable<AdminApi[K]> extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : never;
};

function wrap(): AsyncApi {
  const handler = {} as AsyncApi;
  const methods = [
    'health',
    'dashboard',
    'catalogs',
    'getCatalog',
    'saveCatalog',
    'listCatalogHistory',
    'getCatalogRevision',
    'validate',
    'assets',
    'library',
    'resolveAssetUrls',
    'importAsset',
    'trimAsset',
    'trimBatch',
    'bumpContentVersion',
    'uploadAsset',
    'uploadLibraryFile',
    'deleteAsset',
    'copyLibraryAsset',
    'moveAsset',
    'createCategory',
    'deleteCategory',
    'renameCategory',
    'generateLibraryImage',
    'translateAudioPrompt',
    'generateProjectAudio',
    'normalizeProjectAudio',
    'exportBundle',
    'exportGameZip',
  ] as const;

  for (const key of methods) {
    (handler as Record<string, unknown>)[key] = async (...args: unknown[]) => {
      const impl = await apiImpl();
      const fn = impl[key] as ((...a: unknown[]) => unknown) | undefined;
      if (!fn) {
        throw new Error(`${key} はこのモードでは利用できません`);
      }
      return fn(...args);
    };
  }
  return handler;
}

export const api = wrap();

export function assetUrl(rel: string, entry?: AssetEntry) {
  if (entry?.url) return entry.url;
  if (isCloudMode()) return '';
  return `/api/asset-file?path=${encodeURIComponent(rel)}`;
}

export function libraryUrl(rel: string, entry?: AssetEntry) {
  if (entry?.url) return entry.url;
  if (isCloudMode()) return '';
  return `/api/library-file?path=${encodeURIComponent(rel)}`;
}

export function currentMode() {
  return getDataMode();
}
