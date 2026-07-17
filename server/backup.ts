import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './paths.js';

export function backupDataFile(root: string, fileName: string): string {
  const src = path.join(dataDir(root), fileName);
  if (!fs.existsSync(src)) throw new Error(`File not found: ${fileName}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(root, '.admin-backup', stamp);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, fileName);
  fs.copyFileSync(src, dest);
  return dest;
}
