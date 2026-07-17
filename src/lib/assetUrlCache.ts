import { api } from './api';

const urlCache = new Map<string, string>();

type Waiter = {
  source: 'project' | 'library';
  path: string;
  resolve: (url: string | undefined) => void;
};

let queue: Waiter[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function keyOf(source: 'project' | 'library', path: string) {
  return `${source}:${path}`;
}

function scheduleFlush() {
  if (flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, 40);
}

async function flushQueue() {
  const batch = queue;
  queue = [];
  if (batch.length === 0) return;

  const bySource = new Map<'project' | 'library', Waiter[]>();
  for (const w of batch) {
    const list = bySource.get(w.source) ?? [];
    list.push(w);
    bySource.set(w.source, list);
  }

  for (const [source, waiters] of bySource) {
    const need: string[] = [];
    const seen = new Set<string>();

    for (const w of waiters) {
      const cached = urlCache.get(keyOf(source, w.path));
      if (cached) {
        w.resolve(cached);
        continue;
      }
      if (!seen.has(w.path)) {
        seen.add(w.path);
        need.push(w.path);
      }
    }

    let urls: Record<string, string> = {};
    if (need.length > 0) {
      try {
        const r = await api.resolveAssetUrls(need, source);
        urls = r.urls ?? {};
        for (const [path, url] of Object.entries(urls)) {
          urlCache.set(keyOf(source, path), url);
        }
      } catch {
        urls = {};
      }
    }

    for (const w of waiters) {
      const cached = urlCache.get(keyOf(source, w.path));
      w.resolve(cached ?? urls[w.path]);
    }
  }
}

/** Resolve download URL with memory cache + short request batching. */
export function ensureAssetUrl(
  path: string,
  source: 'project' | 'library',
): Promise<string | undefined> {
  const key = keyOf(source, path);
  const cached = urlCache.get(key);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    queue.push({ source, path, resolve });
    scheduleFlush();
  });
}

export function peekAssetUrl(
  path: string,
  source: 'project' | 'library',
): string | undefined {
  return urlCache.get(keyOf(source, path));
}

export function putAssetUrl(
  path: string,
  source: 'project' | 'library',
  url: string,
) {
  urlCache.set(keyOf(source, path), url);
}

export function forgetAssetUrl(
  path: string,
  source: 'project' | 'library',
) {
  urlCache.delete(keyOf(source, path));
}

export function clearAssetUrlCache() {
  urlCache.clear();
}
