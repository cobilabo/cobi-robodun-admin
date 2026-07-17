/**
 * Seed local GAME_ROOT / LIBRARY_ROOT into Firebase (cloud mode SoT).
 *
 * Usage:
 *   GAME_ROOT=... LIBRARY_ROOT=... npm run seed:firebase
 *   SEED_SCOPE=library npm run seed:firebase   # library only
 *   SEED_SCOPE=project npm run seed:firebase   # catalogs + project assets
 *   CONCURRENCY=12 SKIP_EXISTING=1 npm run seed:firebase
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  applicationDefault,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const root = process.env.GAME_ROOT || path.resolve(__dirname, '../../cobi-arcanote');
const libraryRoot = process.env.LIBRARY_ROOT?.trim() || '';
const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'cobi-robodun-admin';
const storageBucket =
  process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
const scope = (process.env.SEED_SCOPE || 'all').toLowerCase(); // all | project | library
const concurrency = Math.max(1, Number(process.env.CONCURRENCY || 10));
const skipExisting = process.env.SKIP_EXISTING !== '0';

function walk(dir, base, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).replace(/\\/g, '/'));
  }
}

function guessType(rel) {
  const lower = rel.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  return 'application/octet-stream';
}

async function mapPool(items, limit, fn) {
  let i = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
      done++;
      if (done % 50 === 0 || done === items.length) {
        console.log(`  progress ${done}/${items.length}`);
      }
    }
  });
  await Promise.all(workers);
}

async function uploadTree(bucket, localDir, destPrefix, label) {
  if (!fs.existsSync(localDir)) {
    console.warn(`skip ${label}: missing ${localDir}`);
    return 0;
  }
  const files = [];
  walk(localDir, localDir, files);
  console.log(`${label}: ${files.length} files → gs://${bucket.name}/${destPrefix}/`);

  let uploaded = 0;
  let skipped = 0;
  await mapPool(files, concurrency, async (rel) => {
    const local = path.join(localDir, rel);
    const dest = `${destPrefix}/${rel}`;
    const file = bucket.file(dest);
    if (skipExisting) {
      const [exists] = await file.exists();
      if (exists) {
        skipped++;
        return;
      }
    }
    await bucket.upload(local, {
      destination: dest,
      metadata: { contentType: guessType(rel) },
      resumable: false,
    });
    uploaded++;
  });
  console.log(`${label}: uploaded ${uploaded}, skipped ${skipped}`);
  return uploaded;
}

async function seedCatalogs(db) {
  const dataDir = path.join(root, 'data');
  const catalogs = [
    'characters',
    'enemies',
    'bosses',
    'skills',
    'equipment',
    'effects',
    'behaviors',
    'audio',
  ];

  for (const id of catalogs) {
    const file = path.join(dataDir, `${id}.json`);
    if (!fs.existsSync(file)) {
      console.warn('skip missing', file);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    await db.collection('catalogs').doc(id).set(
      {
        data,
        updatedAt: new Date(),
        updatedBy: 'seed-script',
      },
      { merge: true },
    );
    console.log('catalog', id);
  }
}

async function main() {
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      storageBucket,
      projectId,
    });
  }

  const db = getFirestore();
  const bucket = getStorage().bucket();
  console.log('seed', { projectId, storageBucket, scope, concurrency, skipExisting, root, libraryRoot });

  if (scope === 'all' || scope === 'project') {
    await seedCatalogs(db);
    await uploadTree(bucket, path.join(root, 'assets'), 'project/assets', 'project assets');
  }

  if (scope === 'all' || scope === 'library') {
    if (!libraryRoot) {
      console.warn('LIBRARY_ROOT unset — skip library seed');
    } else {
      await uploadTree(bucket, libraryRoot, 'library', 'library');
    }
  }

  console.log('done →', projectId, storageBucket);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
