import { useEffect, useRef, useState } from 'react';
import { ensureAssetUrl } from '../lib/assetUrlCache';

type Props = {
  relativePath: string;
  source: 'project' | 'library';
  initialUrl?: string;
  className?: string;
  /** Bump after overwrite (trim 等) to bypass browser / CDN cache. */
  revision?: string | number;
};

function withCacheBust(url: string, revision?: string | number): string {
  if (revision == null || revision === '') return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}r=${encodeURIComponent(String(revision))}`;
}

/** Resolve Storage URL + load image only when near the viewport. */
export function LazyAssetThumb({
  relativePath,
  source,
  initialUrl,
  className = '',
  revision,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [url, setUrl] = useState(initialUrl ?? '');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrl(initialUrl ?? '');
    setFailed(false);
  }, [initialUrl, relativePath, revision]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setNear(true);
      },
      { rootMargin: '240px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near || url) return;
    let cancelled = false;
    ensureAssetUrl(relativePath, source).then((u) => {
      if (!cancelled && u) setUrl(u);
      else if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [near, url, relativePath, source, revision]);

  const displaySrc = url ? withCacheBust(url, revision) : '';

  return (
    <div
      ref={rootRef}
      className={`aspect-square checkerboard rounded flex items-center justify-center overflow-hidden mb-1 ${className}`}
    >
      {displaySrc ? (
        <img
          key={displaySrc}
          src={displaySrc}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-contain"
          style={{ imageRendering: 'pixelated' }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[9px] text-[var(--muted)] px-1 text-center">
          {failed ? '…' : near ? '…' : ''}
        </span>
      )}
    </div>
  );
}
