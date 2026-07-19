/**
 * Pull Firestore catalogs → local GAME_ROOT/data/*.json
 *
 * READ-ONLY against Firebase (never writes to cloud).
 * Existing local JSON is copied to GAME_ROOT/.admin-backup/pull-<stamp>/ first.
 *
 * Usage:
 *   npm run pull:catalogs
 *   GAME_ROOT=../cobi-robodun npm run pull:catalogs
 *   PULL_IDS=characters,hud npm run pull:catalogs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'cobi-robodun-admin';
const gameRoot =
  process.env.GAME_ROOT || path.resolve(__dirname, '../../cobi-robodun');
const dataDir = path.join(gameRoot, 'data');
const allIds = [
  'characters',
  'enemies',
  'bosses',
  'skills',
  'equipment',
  'effects',
  'behaviors',
  'audio',
  'hud',
];
const pullIds = (process.env.PULL_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ids = pullIds.length ? pullIds : allIds;

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId });
}
const db = getFirestore();

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  if (!fs.existsSync(dataDir)) {
    throw new Error(`data dir missing: ${dataDir}`);
  }

  console.log({ projectId, gameRoot, ids, mode: 'cloud→local (read-only cloud)' });

  const backupRoot = path.join(gameRoot, '.admin-backup', `pull-${stamp()}`);
  fs.mkdirSync(backupRoot, { recursive: true });

  for (const id of ids) {
    const snap = await db.collection('catalogs').doc(id).get();
    if (!snap.exists) {
      console.warn(`skip ${id}: not in Firestore`);
      continue;
    }
    const data = snap.data()?.data;
    const localPath = path.join(dataDir, `${id}.json`);
    if (fs.existsSync(localPath)) {
      fs.copyFileSync(localPath, path.join(backupRoot, `${id}.json`));
    }
    const text = `${JSON.stringify(data, null, 2)}\n`;
    fs.writeFileSync(localPath, text, 'utf8');
    const n = Array.isArray(data)
      ? data.length
      : data && typeof data === 'object'
        ? Object.keys(data).length
        : '?';
    const by = snap.data()?.updatedBy ?? '?';
    console.log(`OK ${id}.json  n=${n}  updatedBy=${by}`);
  }

  console.log(`local backup: ${backupRoot}`);
  console.log('done (Firestore untouched)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
