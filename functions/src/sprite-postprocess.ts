import sharp from 'sharp';

function parseRgbHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace(/^#/, '').trim();
  if (!/^[\da-fA-F]{6}$/.test(h)) {
    throw new Error('IMAGE_CHROMA_KEY_HEX は 6 桁の16進（例: FF00FF）で指定してください。');
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

type PostprocessEnv = {
  hex: string;
  tolerance: number;
  outputSize: number;
  quality: number;
  alphaQuality: number;
  effort: number;
  alignEnabled: boolean;
  bottomPad: number;
  alphaTrimMin: number;
  trimPad: number;
};

function readPostprocessEnv(): PostprocessEnv {
  const hex = process.env.IMAGE_CHROMA_KEY_HEX?.trim() || 'FF00FF';
  const tolRaw = Number(process.env.IMAGE_CHROMA_TOLERANCE ?? '120');
  const tolerance = Number.isFinite(tolRaw)
    ? Math.min(120, Math.max(0, tolRaw))
    : 120;
  const sizeRaw = Number(process.env.IMAGE_OUTPUT_SIZE ?? '512');
  const outputSize =
    Number.isFinite(sizeRaw) && sizeRaw > 0
      ? Math.min(2048, Math.round(sizeRaw))
      : 512;
  const qRaw = Number(process.env.IMAGE_WEBP_QUALITY ?? '74');
  const quality = Number.isFinite(qRaw)
    ? Math.min(100, Math.max(1, Math.round(qRaw)))
    : 74;
  const aqRaw = process.env.IMAGE_WEBP_ALPHA_QUALITY;
  const alphaQuality =
    aqRaw === undefined || aqRaw === ''
      ? Math.min(100, quality + 4)
      : (() => {
          const n = Number(aqRaw);
          return Number.isFinite(n)
            ? Math.min(100, Math.max(1, Math.round(n)))
            : Math.min(100, quality + 4);
        })();
  const effRaw = Number(process.env.IMAGE_WEBP_EFFORT ?? '5');
  const effort = Number.isFinite(effRaw)
    ? Math.min(6, Math.max(1, Math.round(effRaw)))
    : 5;

  const alignRaw = (process.env.IMAGE_SPRITE_ALIGN_ENABLED ?? 'true')
    .trim()
    .toLowerCase();
  const alignEnabled = alignRaw !== 'false' && alignRaw !== '0';

  const bpRaw = Number(process.env.IMAGE_SPRITE_ALIGN_BOTTOM_PADDING_PX ?? '10');
  const bottomPad = Number.isFinite(bpRaw)
    ? Math.max(0, Math.min(256, Math.round(bpRaw)))
    : 10;

  const amRaw = Number(process.env.IMAGE_SPRITE_ALPHA_TRIM_MIN ?? '16');
  const alphaTrimMin = Number.isFinite(amRaw)
    ? Math.max(0, Math.min(255, Math.round(amRaw)))
    : 16;

  const tpRaw = Number(process.env.IMAGE_SPRITE_TRIM_PAD_PX ?? '1');
  const trimPad = Number.isFinite(tpRaw)
    ? Math.max(0, Math.min(32, Math.round(tpRaw)))
    : 1;

  return {
    hex,
    tolerance,
    outputSize,
    quality,
    alphaQuality,
    effort,
    alignEnabled,
    bottomPad,
    alphaTrimMin,
    trimPad,
  };
}

function findAlphaBoundingBox(
  data: Buffer,
  width: number,
  height: number,
  alphaMin: number,
): { left: number; top: number; width: number; height: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const a = data[row + x * 4 + 3]!;
      if (a >= alphaMin) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function rgbaToLegacyCoverWebp(
  rgba: Buffer,
  width: number,
  height: number,
  env: PostprocessEnv,
): Promise<Buffer> {
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .resize(env.outputSize, env.outputSize, {
      fit: 'cover',
      position: 'center',
      kernel: sharp.kernel.lanczos3,
    })
    .webp({
      quality: env.quality,
      alphaQuality: env.alphaQuality,
      effort: env.effort,
    })
    .toBuffer();
}

async function rgbaRawToAlignedWebp(
  rgba: Buffer,
  width: number,
  height: number,
  env: PostprocessEnv,
): Promise<Buffer> {
  if (!env.alignEnabled) {
    return rgbaToLegacyCoverWebp(rgba, width, height, env);
  }

  const maxH = env.outputSize - env.bottomPad;
  if (maxH < 1) {
    throw new Error(
      'IMAGE_SPRITE_ALIGN_BOTTOM_PADDING_PX が大きすぎます（出力サイズより小さくしてください）。',
    );
  }

  const box = findAlphaBoundingBox(rgba, width, height, env.alphaTrimMin);
  if (!box || box.width < 1 || box.height < 1) {
    return rgbaToLegacyCoverWebp(rgba, width, height, env);
  }

  const left = Math.max(0, box.left - env.trimPad);
  const top = Math.max(0, box.top - env.trimPad);
  const right = Math.min(width, box.left + box.width + env.trimPad);
  const bottom = Math.min(height, box.top + box.height + env.trimPad);
  const cw = right - left;
  const ch = bottom - top;
  if (cw < 1 || ch < 1) {
    return rgbaToLegacyCoverWebp(rgba, width, height, env);
  }

  const extractedPng = await sharp(rgba, {
    raw: { width, height, channels: 4 },
  })
    .extract({ left, top, width: cw, height: ch })
    .png()
    .toBuffer();

  const scaledPng = await sharp(extractedPng)
    .resize(env.outputSize, maxH, {
      fit: 'inside',
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  const meta = await sharp(scaledPng).metadata();
  const sw = meta.width ?? 0;
  const sh = meta.height ?? 0;
  if (sw < 1 || sh < 1) {
    return rgbaToLegacyCoverWebp(rgba, width, height, env);
  }

  const leftX = Math.round((env.outputSize - sw) / 2);
  const topY = env.outputSize - env.bottomPad - sh;
  const safeTop = Math.max(0, topY);

  return sharp({
    create: {
      width: env.outputSize,
      height: env.outputSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaledPng, left: leftX, top: safeTop }])
    .webp({
      quality: env.quality,
      alphaQuality: env.alphaQuality,
      effort: env.effort,
    })
    .toBuffer();
}

/** Magenta chroma-key → trim/align → WebP (eve-compatible defaults). */
export async function postprocessGeneratedImage(
  pngBuffer: Buffer,
): Promise<Buffer> {
  const env = readPostprocessEnv();
  const key = parseRgbHex(env.hex);
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (!width || !height || channels < 3) {
    throw new Error('画像をデコードできませんでした。');
  }

  const px = width * height;
  const out = Buffer.alloc(px * 4);
  const tolSq = env.tolerance * env.tolerance;

  for (let i = 0; i < px; i++) {
    const src = i * channels;
    const r = data[src]!;
    const g = data[src + 1]!;
    const b = data[src + 2]!;
    const aIn = channels >= 4 ? data[src + 3]! : 255;

    const dr = r - key.r;
    const dg = g - key.g;
    const db = b - key.b;
    const distSq = dr * dr + dg * dg + db * db;

    const dst = i * 4;
    if (distSq <= tolSq) {
      out[dst] = 0;
      out[dst + 1] = 0;
      out[dst + 2] = 0;
      out[dst + 3] = 0;
    } else {
      out[dst] = r;
      out[dst + 1] = g;
      out[dst + 2] = b;
      out[dst + 3] = aIn;
    }
  }

  return rgbaRawToAlignedWebp(out, width, height, env);
}
