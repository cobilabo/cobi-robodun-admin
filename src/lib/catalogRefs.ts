import { rowLabel } from './fieldInfer';

export type RefOption = {
  id: string;
  /** id — 表示名 */
  label: string;
  name: string;
};

export function rowsToRefOptions(rows: Record<string, unknown>[]): RefOption[] {
  return rows
    .map((row) => {
      const id = String(row.id ?? '').trim();
      if (!id) return null;
      const name = String(row.nameJa ?? row.name ?? row.descriptionJa ?? '').trim();
      const code = String(row.code ?? '').trim();
      const detail = [name, code ? `(${code})` : ''].filter(Boolean).join(' ');
      return {
        id,
        name,
        label: detail ? `${id} — ${detail}` : id,
      } satisfies RefOption;
    })
    .filter((x): x is RefOption => x != null)
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
}

export function labelForOption(
  options: RefOption[],
  id: string,
): string {
  const hit = options.find((o) => o.id === id);
  return hit?.label ?? id;
}

const ASSET_KEYS = new Set([
  'icon',
  'portrait',
  'file',
  'asset',
  'image',
  'relativepath',
]);

function looksLikeAssetPath(value: string): boolean {
  const v = value.replace(/\\/g, '/');
  if (!v || v.includes('..')) return false;
  return (
    /\.(png|jpe?g|webp|gif|ogg|wav|mp3|m4a)$/i.test(v) ||
    v.startsWith('UI/') ||
    v.startsWith('audio/')
  );
}

function visitValue(value: unknown, key: string | null, out: string[]) {
  if (typeof value === 'string') {
    const k = (key ?? '').toLowerCase();
    if (
      ASSET_KEYS.has(k) ||
      k.endsWith('icon') ||
      k.endsWith('asset') ||
      k.endsWith('path') ||
      k === 'file' ||
      looksLikeAssetPath(value)
    ) {
      const p = value.replace(/\\/g, '/').trim();
      if (p && looksLikeAssetPath(p)) out.push(p);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) visitValue(item, key, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      visitValue(v, k, out);
    }
  }
}

/** Count how many times each project asset path is referenced from catalogs. */
export function countAssetRefs(
  catalogs: Record<string, unknown>,
): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (path: string) => {
    const p = path.replace(/\\/g, '/');
    counts.set(p, (counts.get(p) ?? 0) + 1);
  };

  for (const [catalogId, data] of Object.entries(catalogs)) {
    if (catalogId === 'audio') {
      const cues = (data as { cues?: unknown[] })?.cues;
      if (Array.isArray(cues)) {
        for (const cue of cues) {
          const found: string[] = [];
          visitValue(cue, null, found);
          for (const p of found) bump(p);
        }
      }
      continue;
    }
    if (!Array.isArray(data)) continue;
    for (const row of data) {
      const found: string[] = [];
      visitValue(row, null, found);
      for (const p of found) bump(p);
    }
  }
  return counts;
}

export function catalogTitle(id: string): string {
  const map: Record<string, string> = {
    skills: 'スキル',
    equipment: '装備',
    effects: '効果',
    behaviors: '行動',
    characters: 'キャラ',
    enemies: '敵',
    bosses: 'ボス',
    audio: '音声',
  };
  return map[id] ?? id;
}

export { rowLabel };
