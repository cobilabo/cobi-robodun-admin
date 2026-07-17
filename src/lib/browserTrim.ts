const ALPHA_THRESHOLD = 8;

export type BrowserTrimResult = {
  blob: Blob | null;
  before: { width: number; height: number };
  after: { width: number; height: number };
  trimmed: boolean;
};

/** Trim transparent padding in the browser (for Firebase Storage uploads). */
export async function trimImageBlob(blob: Blob): Promise<BrowserTrimResult> {
  const bmp = await createImageBitmap(blob);
  const width = bmp.width;
  const height = bmp.height;
  const before = { width, height };

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bmp, 0, 0);
  bmp.close();

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
    const out = document.createElement('canvas');
    out.width = 1;
    out.height = 1;
    const outBlob = await canvasToPng(out);
    return {
      blob: outBlob,
      before,
      after: { width: 1, height: 1 },
      trimmed: true,
    };
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const trimmed = cropW !== width || cropH !== height || minX !== 0 || minY !== 0;
  if (!trimmed) {
    return { blob: null, before, after: before, trimmed: false };
  }

  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('Canvas unavailable');
  octx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  const outBlob = await canvasToPng(out);
  return {
    blob: outBlob,
    before,
    after: { width: cropW, height: cropH },
    trimmed: true,
  };
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png',
    );
  });
}
