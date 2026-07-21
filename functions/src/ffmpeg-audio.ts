import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

function ffmpegBin(): string {
  const p = ffmpegStatic;
  if (!p) throw new Error('ffmpeg-static バイナリが見つかりません');
  return p;
}

/**
 * Convert audio buffer to Ogg Vorbis (q≈5, good game BGM/SE balance).
 */
export async function convertBufferToOgg(
  input: Buffer,
  inputExt: string,
): Promise<Buffer> {
  const ext = inputExt.replace(/^\./, '').toLowerCase() || 'bin';
  if (ext === 'ogg') return input;

  const id = randomBytes(8).toString('hex');
  const inPath = join(tmpdir(), `robodun-in-${id}.${ext}`);
  const outPath = join(tmpdir(), `robodun-out-${id}.ogg`);

  await fs.writeFile(inPath, input);
  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inPath,
        '-vn',
        '-c:a',
        'libvorbis',
        '-q:a',
        '5',
        outPath,
      ];
      const child = spawn(ffmpegBin(), args, { windowsHide: true });
      let err = '';
      child.stderr.on('data', (d: Buffer) => {
        err += d.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg 失敗 (code ${code}): ${err.slice(0, 400)}`));
      });
    });
    return await fs.readFile(outPath);
  } finally {
    await fs.unlink(inPath).catch(() => undefined);
    await fs.unlink(outPath).catch(() => undefined);
  }
}
