/** Firestore catalogHistory の保持件数（古いものは削除）。 */
export const CATALOG_HISTORY_LIMIT = 100;

export type CatalogRevisionMeta = {
  id: string;
  /** このリビジョンが履歴へ退避された時刻（＝新しい版を保存した時刻） */
  savedAt: string | null;
  savedBy: string;
  /** 退避された内容が当時の最新だった時刻 */
  sourceUpdatedAt: string | null;
  sourceUpdatedBy: string | null;
};

export type CatalogLatestMeta = {
  updatedAt: string | null;
  updatedBy: string | null;
};

/** Firestore Timestamp / Date / string → ISO。 */
export function firestoreTimeToIso(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
    } catch {
      /* ignore */
    }
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const sec = Number((value as { seconds: number }).seconds);
    if (Number.isFinite(sec)) return new Date(sec * 1000).toISOString();
  }
  return null;
}

export function formatRevisionLabel(rev: CatalogRevisionMeta): string {
  const when =
    formatJaDateTime(rev.sourceUpdatedAt) ||
    formatJaDateTime(rev.savedAt) ||
    '(日時不明)';
  const who = rev.sourceUpdatedBy || rev.savedBy || 'unknown';
  return `${when} · ${who}`;
}

export function formatJaDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${mo}/${day} ${h}:${mi}`;
}
