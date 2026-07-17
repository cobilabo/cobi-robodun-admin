import { unzipSync } from 'fflate';

const AUDIO_EXT = /\.(ogg|wav|mp3|m4a)$/i;
const ZIP_EXT = /\.zip$/i;
const SKIP_NAME = /(^|\/)(\.DS_Store|Thumbs\.db|__MACOSX)(\/|$)/i;

export type AudioUploadItem = {
  relativePath: string;
  blob: Blob;
  contentType?: string;
};

function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  return 'application/octet-stream';
}

function sanitize(raw: string): string | null {
  let p = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p || p.includes('\0')) return null;
  const parts = p.split('/').filter((s) => s && s !== '.');
  if (parts.some((s) => s === '..')) return null;
  p = parts.join('/');
  if (!p || SKIP_NAME.test(p)) return null;
  return p;
}

function isAudioPath(path: string): boolean {
  return AUDIO_EXT.test(path) && !SKIP_NAME.test(path);
}

function isZipFile(file: File): boolean {
  return (
    ZIP_EXT.test(file.name) ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
  );
}

/** Ensure path lives under assets/audio (stored as audio/... relative to assets). */
function toAudioAssetPath(path: string): string {
  let p = path.replace(/^assets\//, '');
  if (!p.startsWith('audio/')) p = `audio/${p}`;
  return p;
}

function itemsFromZipBytes(buf: Uint8Array): AudioUploadItem[] {
  const entries = unzipSync(buf);
  const out: AudioUploadItem[] = [];
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    const path = sanitize(name);
    if (!path || !isAudioPath(path)) continue;
    const dest = toAudioAssetPath(path);
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    out.push({
      relativePath: dest,
      blob: new Blob([copy], { type: guessContentType(dest) }),
      contentType: guessContentType(dest),
    });
  }
  return out;
}

/** Auto-detect audio files / ZIP; paths become assets-relative (audio/...). */
export async function collectAudioUploads(
  files: FileList | File[],
): Promise<AudioUploadItem[]> {
  const out: AudioUploadItem[] = [];
  for (const file of Array.from(files)) {
    if (isZipFile(file)) {
      const buf = new Uint8Array(await file.arrayBuffer());
      out.push(...itemsFromZipBytes(buf));
      continue;
    }
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name;
    const path = sanitize(rel);
    if (!path || !isAudioPath(path)) continue;
    const dest = toAudioAssetPath(path);
    out.push({
      relativePath: dest,
      blob: file,
      contentType: file.type || guessContentType(dest),
    });
  }
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
