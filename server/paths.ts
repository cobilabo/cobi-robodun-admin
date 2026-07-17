import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export function gameRoot(): string | null {
  const raw = process.env.GAME_ROOT?.trim();
  if (!raw) return null;
  const resolved = path.resolve(raw);
  return fs.existsSync(resolved) ? resolved : null;
}

export function libraryRoot(): string | null {
  const raw = process.env.LIBRARY_ROOT?.trim();
  if (!raw) return null;
  const resolved = path.resolve(raw);
  return fs.existsSync(resolved) ? resolved : null;
}

export function isProjectRoot(root: string): boolean {
  return (
    fs.existsSync(path.join(root, 'data')) &&
    fs.existsSync(path.join(root, 'scenes')) &&
    fs.existsSync(path.join(root, 'assets', 'UI', 'tiles'))
  );
}

export function dataDir(root: string): string {
  return path.join(root, 'data');
}

export function assetsDir(root: string): string {
  return path.join(root, 'assets');
}

export function ensureWithin(root: string, target: string): string {
  const resolved = path.resolve(target);
  const rootResolved = path.resolve(root);
  if (
    resolved !== rootResolved &&
    !resolved.startsWith(rootResolved + path.sep)
  ) {
    throw new Error('Path escapes root');
  }
  return resolved;
}

export const CATALOG_FILES = [
  'characters.json',
  'enemies.json',
  'bosses.json',
  'skills.json',
  'equipment.json',
  'effects.json',
  'behaviors.json',
  'audio.json',
  'hud.json',
] as const;

export type CatalogFile = (typeof CATALOG_FILES)[number];

/** Non-array catalog documents (object root). */
export const OBJECT_CATALOG_FILES = ['audio.json', 'hud.json'] as const;
