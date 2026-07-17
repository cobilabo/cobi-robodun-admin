import { useEffect, useRef, useState } from 'react';

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  contentW: number;
  contentH: number;
  padL: number;
  padT: number;
  padR: number;
  padB: number;
  hasPadding: boolean;
};

type Props = {
  src: string;
  className?: string;
  /** bust cache after trim */
  cacheKey?: string | number;
  /** longest side of preview canvas (px). Small sprites are upscaled. */
  maxSide?: number;
};

const ALPHA_THRESHOLD = 8;

function analyze(img: HTMLImageElement): Bounds | null {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width,
      height,
      contentW: 0,
      contentH: 0,
      padL: 0,
      padT: 0,
      padR: 0,
      padB: 0,
      hasPadding: true,
    };
  }

  const contentW = maxX - minX + 1;
  const contentH = maxY - minY + 1;
  const padL = minX;
  const padT = minY;
  const padR = width - 1 - maxX;
  const padB = height - 1 - maxY;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    contentW,
    contentH,
    padL,
    padT,
    padR,
    padB,
    hasPadding: padL + padT + padR + padB > 0,
  };
}

function paintPreview(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  b: Bounds,
  maxSide: number,
) {
  // Allow upscale so small pixel-art icons fill the preview.
  const scale = Math.min(maxSide / b.width, maxSide / b.height);
  const dw = Math.max(1, Math.round(b.width * scale));
  const dh = Math.max(1, Math.round(b.height * scale));
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cell = 8;
  for (let y = 0; y < dh; y += cell) {
    for (let x = 0; x < dw; x += cell) {
      const odd = ((x / cell) | 0) + ((y / cell) | 0);
      ctx.fillStyle = odd % 2 === 0 ? '#1a2230' : '#121820';
      ctx.fillRect(x, y, cell, cell);
    }
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, dw, dh);

  if (b.hasPadding && b.contentW > 0) {
    const x0 = b.minX * scale;
    const y0 = b.minY * scale;
    const x1 = (b.maxX + 1) * scale;
    const y1 = (b.maxY + 1) * scale;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(0, 0, dw, y0);
    ctx.fillRect(0, y1, dw, dh - y1);
    ctx.fillRect(0, y0, x0, y1 - y0);
    ctx.fillRect(x1, y0, dw - x1, y1 - y0);
  }
}

/** Load via <img crossOrigin> so browser HTTP cache (thumbs) can be reused. */
function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

/** Checkerboard + opaque content bbox overlay so transparent padding is visible. */
export function AlphaBoundsPreview({
  src,
  className = '',
  cacheKey,
  maxSide = 360,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    imageRef.current = null;

    if (!src) {
      setError('');
      setBounds(null);
      setLoading(false);
      return;
    }

    setError('');
    setBounds(null);
    setLoading(true);

    (async () => {
      try {
        // Bust only when cacheKey changes (after trim); keep URL stable for HTTP cache hits.
        const url =
          cacheKey != null
            ? `${src}${src.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(cacheKey))}`
            : src;
        const img = await loadImageElement(url);
        if (cancelled) return;
        imageRef.current = img;
        setBounds(analyze(img));
      } catch {
        if (!cancelled) {
          imageRef.current = null;
          setError('プレビューを読み込めませんでした');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      imageRef.current = null;
    };
  }, [src, cacheKey]);

  // Paint after canvas is mounted (must not unmount canvas while loading).
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !bounds) return;
    paintPreview(canvas, img, bounds, maxSide);
  }, [bounds, loading, maxSide]);

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        className="rounded border border-[var(--line)] flex items-center justify-center overflow-hidden checkerboard relative w-full"
        style={{ minHeight: Math.min(maxSide, 420) }}
      >
        <canvas
          ref={canvasRef}
          className={`max-w-full max-h-full ${bounds ? '' : 'invisible'}`}
          style={{ imageRendering: 'pixelated' }}
        />
        {error ? (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-[var(--danger)] p-2">
            {error}
          </span>
        ) : loading && !bounds ? (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)] p-2">
            読み込み中…
          </span>
        ) : null}
      </div>
      {bounds && (
        <div className="text-[11px] text-[var(--muted)] space-y-0.5 font-mono">
          <div>
            画像 {bounds.width}×{bounds.height}
            {bounds.contentW > 0
              ? ` / 不透明 ${bounds.contentW}×${bounds.contentH}`
              : ' / 全面透明'}
          </div>
          {bounds.hasPadding ? (
            <div className="text-[var(--warn)]">
              余白 L{bounds.padL} T{bounds.padT} R{bounds.padR} B{bounds.padB}
              （白味＝トリム対象）
            </div>
          ) : (
            <div className="text-[var(--accent)]">余白なし（トリム不要）</div>
          )}
        </div>
      )}
    </div>
  );
}
