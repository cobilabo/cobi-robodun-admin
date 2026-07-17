import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const root = process.env.GAME_ROOT;
if (!root) {
  console.error('GAME_ROOT is required');
  process.exit(1);
}
const p = path.join(root, 'src', 'Robodun.Android', 'GameContentInstaller.cs');
const text = fs.readFileSync(p, 'utf8');
const m = text.match(/ContentVersion\s*=\s*"(\d+)"/);
if (!m) {
  console.error('ContentVersion not found');
  process.exit(1);
}
const next = String(Number(m[1]) + 1);
fs.writeFileSync(
  p,
  text.replace(/ContentVersion\s*=\s*"\d+"/, `ContentVersion = "${next}"`),
  'utf8',
);
console.log(`ContentVersion ${m[1]} -> ${next}`);
