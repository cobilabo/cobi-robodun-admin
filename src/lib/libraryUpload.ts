import { unzipSync } from 'fflate';

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;
const ZIP_EXT = /\.zip$/i;
const SKIP_NAME = /(^|\/)(\.DS_Store|Thumbs\.db|__MACOSX)(\/|$)/i;

export type LibraryUploadItem = {
  relativePath: string;
  blob: Blob;
  contentType?: string;
};

type FsFileEntry = {
  isFile: true;
  isDirectory: false;
  name: string;
  fullPath: string;
  file: (ok: (f: File) => void, err?: (e: Error) => void) => void;
};

type FsDirEntry = {
  isFile: false;
  isDirectory: true;
  name: string;
  fullPath: string;
  createReader: () => {
    readEntries: (
      ok: (entries: Array<FsFileEntry | FsDirEntry>) => void,
      err?: (e: Error) => void,
    ) => void;
  };
};

type FsEntry = FsFileEntry | FsDirEntry;

function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}

/** Normalize and reject path traversal. */
export function sanitizeLibraryPath(raw: string): string | null {
  let p = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p || p.includes('\0')) return null;
  const parts = p.split('/').filter((seg) => seg && seg !== '.');
  if (parts.some((seg) => seg === '..')) return null;
  p = parts.join('/');
  if (!p || SKIP_NAME.test(p)) return null;
  return p;
}

function isImagePath(path: string): boolean {
  return IMAGE_EXT.test(path) && !SKIP_NAME.test(path);
}

function isZipFile(file: File): boolean {
  return (
    ZIP_EXT.test(file.name) ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
  );
}

function readZipItems(buf: Uint8Array): LibraryUploadItem[] {
  const entries = unzipSync(buf);
  const out: LibraryUploadItem[] = [];
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    const path = sanitizeLibraryPath(name);
    if (!path || !isImagePath(path)) continue;
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    out.push({
      relativePath: path,
      blob: new Blob([copy], { type: guessContentType(path) }),
      contentType: guessContentType(path),
    });
  }
  return out;
}

/** Expand a ZIP into image files (keeps internal directory structure). */
export async function itemsFromZip(file: File): Promise<LibraryUploadItem[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return readZipItems(buf).sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  );
}

/**
 * Auto-detect images vs ZIP (and folder picks via webkitRelativePath).
 * Mixed selections are supported.
 */
export async function collectUploadItems(
  files: FileList | File[],
): Promise<LibraryUploadItem[]> {
  const list = Array.from(files);
  const out: LibraryUploadItem[] = [];

  for (const file of list) {
    if (isZipFile(file)) {
      out.push(...(await itemsFromZip(file)));
      continue;
    }
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name;
    const path = sanitizeLibraryPath(rel);
    if (!path || !isImagePath(path)) continue;
    out.push({
      relativePath: path,
      blob: file,
      contentType: file.type || guessContentType(path),
    });
  }

  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function readAllDirEntries(
  reader: ReturnType<FsDirEntry['createReader']>,
): Promise<Array<FsFileEntry | FsDirEntry>> {
  return new Promise((resolve, reject) => {
    const all: Array<FsFileEntry | FsDirEntry> = [];
    const pump = () => {
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(all);
          return;
        }
        all.push(...batch);
        pump();
      }, reject);
    };
    pump();
  });
}

async function walkEntry(
  entry: FsEntry,
  prefix: string,
  outFiles: { path: string; file: File }[],
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file(resolve, reject);
    });
    const rel = sanitizeLibraryPath(
      prefix ? `${prefix}/${entry.name}` : entry.name,
    );
    if (rel) outFiles.push({ path: rel, file });
    return;
  }
  if (entry.isDirectory) {
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    const children = await readAllDirEntries(entry.createReader());
    for (const child of children) {
      await walkEntry(child, nextPrefix, outFiles);
    }
  }
}

/** Drag-and-drop: files, ZIP, and directories (preserves tree). */
export async function collectFromDataTransfer(
  dt: DataTransfer,
): Promise<LibraryUploadItem[]> {
  const items = dt.items;
  const collected: { path: string; file: File }[] = [];

  if (items?.length) {
    const entries: FsEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.() as FsEntry | null;
      if (entry) entries.push(entry);
    }
    if (entries.length) {
      for (const entry of entries) {
        await walkEntry(entry, '', collected);
      }
      const files = collected.map((c) => {
        const f = c.file;
        // Preserve relative path for collectUploadItems
        try {
          Object.defineProperty(f, 'webkitRelativePath', {
            value: c.path,
            configurable: true,
          });
        } catch {
          /* ignore */
        }
        return f;
      });
      return collectUploadItems(files);
    }
  }

  if (dt.files?.length) {
    return collectUploadItems(dt.files);
  }
  return [];
}
