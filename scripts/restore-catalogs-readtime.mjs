/**
 * Restore Firestore catalogs from a past readTime (1h retention without PITR).
 *
 * Usage:
 *   node scripts/restore-catalogs-readtime.mjs
 *   READ_TIME=2026-07-18T08:48:00Z DRY_RUN=1 node scripts/restore-catalogs-readtime.mjs
 */
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'cobi-robodun-admin';
const readTimeIso = process.env.READ_TIME || '2026-07-18T08:48:00.000Z';
const dryRun = process.env.DRY_RUN === '1';

/** Accidentally overwritten by seed; restore these. Keep effects/behaviors/skills (intentional refresh). */
const RESTORE_IDS = ['characters', 'enemies', 'bosses', 'equipment', 'audio', 'hud'];

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId });
}

const db = getFirestore();
const readTime = Timestamp.fromDate(new Date(readTimeIso));

function summarize(data) {
  if (Array.isArray(data)) return `array(${data.length})`;
  if (data && typeof data === 'object') return `map(keys=${Object.keys(data).length})`;
  return typeof data;
}

async function main() {
  console.log({ projectId, readTimeIso, dryRun, restore: RESTORE_IDS });

  for (const id of RESTORE_IDS) {
    const ref = db.collection('catalogs').doc(id);
    const past = await ref.get({ readTime });
    if (!past.exists) {
      console.error('MISSING at readTime', id);
      continue;
    }
    const pastData = past.data();
    const current = await ref.get();
    const curData = current.exists ? current.data() : null;

    console.log(
      id,
      'past:',
      pastData?.updatedBy,
      pastData?.updatedAt?.toDate?.()?.toISOString?.() ?? pastData?.updatedAt,
      summarize(pastData?.data),
      '| current:',
      curData?.updatedBy,
      curData?.updatedAt?.toDate?.()?.toISOString?.() ?? curData?.updatedAt,
      summarize(curData?.data),
    );

    if (dryRun) continue;

    await ref.set(
      {
        data: pastData.data,
        updatedAt: pastData.updatedAt ?? new Date(),
        updatedBy: pastData.updatedBy ?? 'restore-readtime',
        restoredAt: new Date(),
        restoredFromReadTime: readTimeIso,
      },
      { merge: false },
    );
    console.log('  restored', id);
  }

  console.log(dryRun ? 'dry-run done' : 'restore done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
