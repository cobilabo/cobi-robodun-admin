/**
 * Restore catalogs from Firestore REST JSON snapshots (readTime exports).
 *
 * Usage:
 *   node scripts/restore-from-rest-snapshots.mjs
 *   DRY_RUN=1 node scripts/restore-from-rest-snapshots.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'cobi-robodun-admin';
const snapDir =
  process.env.SNAP_DIR || path.resolve(__dirname, '../.restore-tmp');
const dryRun = process.env.DRY_RUN === '1';

const RESTORE_IDS = ['characters', 'enemies', 'bosses', 'equipment', 'audio', 'hud'];

function decodeValue(v) {
  if (v == null) return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Timestamp.fromDate(new Date(v.timestampValue));
  if ('arrayValue' in v) {
    return (v.arrayValue.values || []).map(decodeValue);
  }
  if ('mapValue' in v) {
    const out = {};
    for (const [k, child] of Object.entries(v.mapValue.fields || {})) {
      out[k] = decodeValue(child);
    }
    return out;
  }
  throw new Error(`unsupported value keys: ${Object.keys(v)}`);
}

function summarize(data) {
  if (Array.isArray(data)) {
    const names = data
      .slice(0, 5)
      .map((x) => x?.nameJa || x?.id || '?')
      .join(', ');
    return `array(${data.length}) sample=[${names}]`;
  }
  if (data && typeof data === 'object') return `map(keys=${Object.keys(data).join(',')})`;
  return typeof data;
}

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId });
}
const db = getFirestore();

async function main() {
  console.log({ projectId, snapDir, dryRun, restore: RESTORE_IDS });

  for (const id of RESTORE_IDS) {
    const file = path.join(snapDir, `${id}.raw.json`);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw.error) throw new Error(`${id}: ${JSON.stringify(raw.error)}`);
    const fields = raw.fields || {};
    const data = decodeValue(fields.data);
    const updatedBy = decodeValue(fields.updatedBy);
    const updatedAt = decodeValue(fields.updatedAt);

    console.log(id, 'from snapshot:', raw.updateTime, updatedBy, summarize(data));

    if (dryRun) continue;

    await db.collection('catalogs').doc(id).set(
      {
        data,
        updatedAt: updatedAt || new Date(),
        updatedBy: updatedBy || 'restore-rest-snapshot',
        restoredAt: new Date(),
        restoredFrom: `rest-snapshot:${raw.updateTime}`,
      },
      { merge: false },
    );
    console.log('  wrote', id);
  }

  console.log(dryRun ? 'dry-run done' : 'restore done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
