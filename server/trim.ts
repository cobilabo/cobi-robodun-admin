import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export type TrimResult = {
  before: { width: number; height: number };
  after: { width: number; height: number };
  trimmed: boolean;
  outputPath: string;
};

/** Trim transparent padding (alpha bbox) from a PNG. */
export async function trimTransparentPng(
  inputPath: string,
  outputPath?: string,
): Promise<TrimResult> {
  const dest = outputPath ?? inputPath;
  const input = sharp(inputPath);
  const meta = await input.metadata();
  const before = {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };

  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * channels + (channels - 1)];
      if (a > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    // fully transparent — keep 1x1
    await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toFile(dest + '.tmp');
    fs.renameSync(dest + '.tmp', dest);
    return {
      before,
      after: { width: 1, height: 1 },
      trimmed: true,
      outputPath: dest,
    };
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const trimmed = cropW !== width || cropH !== height || minX !== 0 || minY !== 0;

  if (!trimmed && path.resolve(inputPath) === path.resolve(dest)) {
    return { before, after: before, trimmed: false, outputPath: dest };
  }

  await sharp(inputPath)
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .png()
    .toFile(dest + '.tmp');
  fs.renameSync(dest + '.tmp', dest);

  return {
    before,
    after: { width: cropW, height: cropH },
    trimmed,
    outputPath: dest,
  };
}
