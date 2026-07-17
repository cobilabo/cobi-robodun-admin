export type FieldKind =
  | 'asset'
  | 'idMulti'
  | 'idSingle'
  | 'numberMap'
  | 'number'
  | 'boolean'
  | 'text'
  | 'json';

export function inferFieldKind(key: string, value: unknown): FieldKind {
  const k = key.toLowerCase();
  if (
    k === 'icon' ||
    k === 'portrait' ||
    k.endsWith('icon') ||
    k.endsWith('asset') ||
    k.endsWith('relativepath') ||
    k === 'file'
  ) {
    return 'asset';
  }
  if (Array.isArray(value) || k.endsWith('ids')) return 'idMulti';
  if (k.endsWith('id') && k !== 'id') return 'idSingle';
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (k === 'growth' ||
      Object.values(value as object).every((v) => typeof v === 'number'))
  ) {
    return 'numberMap';
  }
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value && typeof value === 'object') return 'json';
  return 'text';
}

export function refCatalogHint(key: string): string | null {
  const k = key.toLowerCase();
  if (k.includes('skill')) return 'skills';
  if (k.includes('equipment') || k.includes('equip')) return 'equipment';
  if (k.includes('effect')) return 'effects';
  if (k.includes('behavior')) return 'behaviors';
  if (k.includes('character') || k.includes('exclusive')) return 'characters';
  if (k.includes('enem')) return 'enemies';
  if (k.includes('boss')) return 'bosses';
  return null;
}

/** Human-readable field caption including referenced catalog. */
export function fieldCaption(key: string): string {
  const hint = refCatalogHint(key);
  if (!hint) return key;
  const names: Record<string, string> = {
    skills: 'スキル',
    equipment: '装備',
    effects: '効果',
    behaviors: '行動',
    characters: 'キャラ',
    enemies: '敵',
    bosses: 'ボス',
  };
  return `${key}（→ ${names[hint] ?? hint}）`;
}

export function rowLabel(row: Record<string, unknown>): string {
  const id = String(row.id ?? '');
  const name = String(row.nameJa ?? row.name ?? row.descriptionJa ?? '');
  const code = String(row.code ?? '').trim();
  if (!id && !name) return '(no id)';
  const mid = [name, code ? `(${code})` : ''].filter(Boolean).join(' ');
  return mid ? `${id} — ${mid}` : id;
}
