import fs from 'node:fs';
import path from 'node:path';
import { assetsDir, ensureWithin } from './paths.js';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const AUDIO_EXT = new Set(['.ogg', '.wav', '.mp3', '.m4a']);

export type AssetEntry = {
  relativePath: string;
  name: string;
  category: string;
  kind: 'image' | 'audio' | 'other';
  size: number;
  mtimeMs: number;
};

function walkFiles(dir: string, base: string, out: string[]) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, base, out);
    else out.push(path.relative(base, full).replace(/\\/g, '/'));
  }
}

function categoryOf(rel: string): string {
  const parts = rel.split('/');
  if (parts[0] === 'UI' && parts.length >= 2) return parts[1];
  if (parts[0] === 'audio' && parts.length >= 2) return `audio/${parts[1]}`;
  if (parts[0] === 'fonts') return 'fonts';
  return parts[0] || 'root';
}

function kindOf(rel: string): AssetEntry['kind'] {
  const ext = path.extname(rel).toLowerCase();
  if (IMAGE_EXT.has(ext)) return 'image';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return 'other';
}

export function listAssets(root: string, sub = ''): AssetEntry[] {
  const base = assetsDir(root);
  const start = sub
    ? ensureWithin(base, path.join(base, sub.replace(/\//g, path.sep)))
    : base;
  const rels: string[] = [];
  walkFiles(start, base, rels);
  return rels
    .map((relativePath) => {
      const full = path.join(base, relativePath.replace(/\//g, path.sep));
      const st = fs.statSync(full);
      return {
        relativePath,
        name: path.basename(relativePath),
        category: categoryOf(relativePath),
        kind: kindOf(relativePath),
        size: st.size,
        mtimeMs: st.mtimeMs,
      } satisfies AssetEntry;
    })
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function listExternalLibrary(libRoot: string): AssetEntry[] {
  const rels: string[] = [];
  walkFiles(libRoot, libRoot, rels);
  return rels
    .filter((r) => IMAGE_EXT.has(path.extname(r).toLowerCase()))
    .map((relativePath) => {
      const full = path.join(libRoot, relativePath.replace(/\//g, path.sep));
      const st = fs.statSync(full);
      return {
        relativePath,
        name: path.basename(relativePath),
        category: relativePath.split('/')[0] || 'lib',
        kind: 'image' as const,
        size: st.size,
        mtimeMs: st.mtimeMs,
      };
    })
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function importLibraryFile(
  libRoot: string,
  libRel: string,
  gameRoot: string,
  destRelUnderAssets: string,
): string {
  const src = ensureWithin(
    libRoot,
    path.join(libRoot, libRel.replace(/\//g, path.sep)),
  );
  const destRel = destRelUnderAssets.replace(/\\/g, '/').replace(/^\/+/, '');
  const dest = ensureWithin(
    assetsDir(gameRoot),
    path.join(assetsDir(gameRoot), destRel.replace(/\//g, path.sep)),
  );
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return destRel;
}

export function resolveAssetFile(root: string, rel: string): string {
  return ensureWithin(
    assetsDir(root),
    path.join(assetsDir(root), rel.replace(/\//g, path.sep)),
  );
}
