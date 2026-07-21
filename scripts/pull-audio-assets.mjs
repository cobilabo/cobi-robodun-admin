/**
 * Pull active audio files referenced by data/audio.json from Firebase Storage
 * into GAME_ROOT/assets/.
 *
 * Usage:
 *   npm run pull:audio-assets
 *   GAME_ROOT=../cobi-arcanote npm run pull:audio-assets
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'cobi-robodun-admin';
const bucketName =
  process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
const gameRoot =
  process.env.GAME_ROOT || path.resolve(__dirname, '../../cobi-arcanote');
const includeCandidates = process.env.INCLUDE_CANDIDATES === '1';

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), storageBucket: bucketName });
}
const bucket = getStorage().bucket();

const audioPath = path.join(gameRoot, 'data', 'audio.json');
const audio = JSON.parse(fs.readFileSync(audioPath, 'utf8').replace(/^\uFEFF/, ''));
const files = new Set();
for (const c of audio.cues || []) {
  if (c.file) files.add(String(c.file).replace(/\\/g, '/'));
  if (includeCandidates) {
    for (const cand of c.candidates || []) {
      if (cand?.file) files.add(String(cand.file).replace(/\\/g, '/'));
    }
  }
}

let ok = 0;
let fail = 0;
for (const rel of [...files].sort()) {
  const dest = path.join(gameRoot, 'assets', ...rel.split('/'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const storagePath = `project/assets/${rel.replace(/^\/+/, '')}`;
  try {
    await bucket.file(storagePath).download({ destination: dest });
    console.log('OK', rel, fs.statSync(dest).size);
    ok++;
  } catch (e) {
    console.warn('FAIL', storagePath, e.message);
    fail++;
  }
}
console.log({ ok, fail, total: files.size, gameRoot });
