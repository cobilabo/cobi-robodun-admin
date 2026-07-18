import sharp from 'sharp';

export type ImageShape = 'square' | 'portrait' | 'landscape';

export type PostprocessOptions = {
  /** Target canvas size after postprocess. */
  width: number;
  height: number;
  /** Magenta chroma-key + alpha pipeline. */
  transparentBackground: boolean;
  /**
   * Bottom-align trimmed sprite on transparent canvas (character sprites).
   * Only applied when transparentBackground and square output.
   */
  spriteAlign: boolean;
};

type PostprocessEnv = {
  hex: string;
  tolerance: number;
  quality: number;
  alphaQuality: number;
  effort: number;
  bottomPad: number;
  alphaTrimMin: number;
  trimPad: number;
};

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

function readPostprocessEnv(): PostprocessEnv {
  const hex = process.env.IMAGE_CHROMA_KEY_HEX?.trim() || 'FF00FF';
  const tolRaw = Number(process.env.IMAGE_CHROMA_TOLERANCE ?? '120');
  const tolerance = Number.isFinite(tolRaw)
    ? Math.min(120, Math.max(0, tolRaw))
    : 120;
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
    quality,
    alphaQuality,
    effort,
    bottomPad,
    alphaTrimMin,
    trimPad,
  };
}

/** OpenAI images/edits size strings. */
export const OPENAI_SIZE_BY_SHAPE: Record<ImageShape, string> = {
  square: '1024x1024',
  portrait: '1024x1536',
  landscape: '1536x1024',
};

/** Native OpenAI pixel sizes (used as opaque output by default). */
export const NATIVE_PIXELS_BY_SHAPE: Record<
  ImageShape,
  { width: number; height: number }
> = {
  square: { width: 1024, height: 1024 },
  portrait: { width: 1024, height: 1536 },
  landscape: { width: 1536, height: 1024 },
};

/**
 * Sprite-oriented output: short edge = IMAGE_OUTPUT_SIZE (default 512).
 * portrait ≈ 9:16, landscape ≈ 16:9.
 */
export function spriteOutputPixels(shape: ImageShape): {
  width: number;
  height: number;
} {
  const sizeRaw = Number(process.env.IMAGE_OUTPUT_SIZE ?? '512');
  const s =
    Number.isFinite(sizeRaw) && sizeRaw > 0
      ? Math.min(2048, Math.round(sizeRaw))
      : 512;
  if (shape === 'portrait') {
    return { width: s, height: Math.round((s * 16) / 9) };
  }
  if (shape === 'landscape') {
    return { width: Math.round((s * 16) / 9), height: s };
  }
  return { width: s, height: s };
}

export function resolveOutputPixels(
  shape: ImageShape,
  transparentBackground: boolean,
): { width: number; height: number } {
  if (transparentBackground) return spriteOutputPixels(shape);
  return NATIVE_PIXELS_BY_SHAPE[shape];
}

export function parseImageShape(raw: unknown): ImageShape {
  if (raw === 'portrait' || raw === 'landscape' || raw === 'square') return raw;
  return 'square';
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

async function toWebp(
  input: sharp.Sharp,
  env: PostprocessEnv,
  withAlpha: boolean,
): Promise<Buffer> {
  return input
    .webp({
      quality: env.quality,
      alphaQuality: withAlpha ? env.alphaQuality : undefined,
      effort: env.effort,
    })
    .toBuffer();
}

async function resizeCoverWebp(
  pngOrRaw: Buffer,
  rawMeta: { width: number; height: number } | null,
  outW: number,
  outH: number,
  env: PostprocessEnv,
  withAlpha: boolean,
): Promise<Buffer> {
  const pipeline = rawMeta
    ? sharp(pngOrRaw, {
        raw: { width: rawMeta.width, height: rawMeta.height, channels: 4 },
      })
    : sharp(pngOrRaw);
  return toWebp(
    pipeline.resize(outW, outH, {
      fit: 'cover',
      position: 'center',
      kernel: sharp.kernel.lanczos3,
    }),
    env,
    withAlpha,
  );
}

async function fitInsideTransparentCanvas(
  rgba: Buffer,
  width: number,
  height: number,
  outW: number,
  outH: number,
  env: PostprocessEnv,
  bottomAlign: boolean,
): Promise<Buffer> {
  const box = findAlphaBoundingBox(rgba, width, height, env.alphaTrimMin);
  if (!box || box.width < 1 || box.height < 1) {
    return resizeCoverWebp(rgba, { width, height }, outW, outH, env, true);
  }

  const left = Math.max(0, box.left - env.trimPad);
  const top = Math.max(0, box.top - env.trimPad);
  const right = Math.min(width, box.left + box.width + env.trimPad);
  const bottom = Math.min(height, box.top + box.height + env.trimPad);
  const cw = right - left;
  const ch = bottom - top;
  if (cw < 1 || ch < 1) {
    return resizeCoverWebp(rgba, { width, height }, outW, outH, env, true);
  }

  const maxH = bottomAlign ? Math.max(1, outH - env.bottomPad) : outH;

  const extractedPng = await sharp(rgba, {
    raw: { width, height, channels: 4 },
  })
    .extract({ left, top, width: cw, height: ch })
    .png()
    .toBuffer();

  const scaledPng = await sharp(extractedPng)
    .resize(outW, maxH, {
      fit: 'inside',
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  const meta = await sharp(scaledPng).metadata();
  const sw = meta.width ?? 0;
  const sh = meta.height ?? 0;
  if (sw < 1 || sh < 1) {
    return resizeCoverWebp(rgba, { width, height }, outW, outH, env, true);
  }

  const leftX = Math.round((outW - sw) / 2);
  const topY = bottomAlign
    ? Math.max(0, outH - env.bottomPad - sh)
    : Math.round((outH - sh) / 2);

  return toWebp(
    sharp({
      create: {
        width: outW,
        height: outH,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).composite([{ input: scaledPng, left: leftX, top: topY }]),
    env,
    true,
  );
}

function applyChromaKey(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  env: PostprocessEnv,
): Buffer {
  const key = parseRgbHex(env.hex);
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
  return out;
}

/**
 * Postprocess generated PNG → WebP.
 * - transparent: chroma-key (+ optional sprite bottom-align on square)
 * - opaque: resize/cover only (backgrounds etc.)
 */
export async function postprocessGeneratedImage(
  pngBuffer: Buffer,
  options: PostprocessOptions,
): Promise<Buffer> {
  const env = readPostprocessEnv();
  const outW = Math.max(1, Math.round(options.width));
  const outH = Math.max(1, Math.round(options.height));

  if (!options.transparentBackground) {
    return resizeCoverWebp(pngBuffer, null, outW, outH, env, false);
  }

  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (!width || !height || channels < 3) {
    throw new Error('画像をデコードできませんでした。');
  }

  const keyed = applyChromaKey(data, width, height, channels, env);
  const bottomAlign = options.spriteAlign && outW === outH;

  return fitInsideTransparentCanvas(
    keyed,
    width,
    height,
    outW,
    outH,
    env,
    bottomAlign,
  );
}
