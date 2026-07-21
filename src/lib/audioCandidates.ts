import type { AudioKind } from './audioPrompt';

export type AudioCandidateSource = 'ai' | 'manual' | 'picker';

export type AudioCandidateProvider =
  | 'stable-audio'
  | 'elevenlabs'
  | 'flow-music'
  | 'other';

export type AudioCandidate = {
  id: string;
  /** Game / preview path (usually .ogg). */
  file: string;
  /** Pre-conversion master (wav/mp3/m4a/…). */
  originalFile?: string;
  originalFormat?: string;
  source: AudioCandidateSource;
  provider?: AudioCandidateProvider;
  createdAt: string;
  label?: string;
  promptEn?: string;
};

export type AudioCueWithCandidates = {
  id: string;
  code?: string;
  kind: AudioKind;
  /** 互換用の代表パス（通常は files[0]）。 */
  file?: string;
  /** ゲームがランダム選曲する有効 ogg 一覧。 */
  files?: string[];
  loop?: boolean;
  trigger?: string;
  noteJa?: string;
  promptJa?: string;
  promptEn?: string;
  candidates?: AudioCandidate[];
};

/** 有効パス一覧（files 優先、なければ file）。 */
export function activeFilesOf(cue: AudioCueWithCandidates): string[] {
  const fromFiles = (cue.files ?? [])
    .map((f) => String(f || '').trim())
    .filter(Boolean);
  if (fromFiles.length > 0) return [...new Set(fromFiles)];
  const single = cue.file?.trim() || '';
  return single ? [single] : [];
}

export function isActiveFile(cue: AudioCueWithCandidates, path: string): boolean {
  const p = path.trim();
  if (!p) return false;
  return activeFilesOf(cue).some((f) => f === p);
}

/** files を正規化し、file を先頭と同期。 */
export function withActiveFiles(
  cue: AudioCueWithCandidates,
  files: string[],
): AudioCueWithCandidates {
  const next = [...new Set(files.map((f) => f.trim()).filter(Boolean))];
  return {
    ...cue,
    files: next,
    file: next[0] ?? '',
  };
}

export function toggleActiveFile(
  cue: AudioCueWithCandidates,
  path: string,
): AudioCueWithCandidates {
  const p = path.trim();
  if (!p) return cue;
  const cur = activeFilesOf(cue);
  const has = cur.includes(p);
  if (has) {
    if (cur.length <= 1) return cue; // 最後の1本は外せない
    return withActiveFiles(
      cue,
      cur.filter((f) => f !== p),
    );
  }
  return withActiveFiles(cue, [...cur, p]);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function rand4(): string {
  return Math.random().toString(36).slice(2, 6);
}

function sanitizeStem(raw: string): string {
  return (
    raw
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'audio'
  );
}

/** Version stamp: 20260721_155601 */
export function audioVersionStamp(d = new Date()): string {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_` +
    `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
}

/**
 * Paths for one ingest:
 * - ogg: game canonical
 * - original: same stem + source ext
 */
export function suggestCandidatePaths(
  kind: AudioKind,
  code: string | undefined,
  originalExt: string,
): { stem: string; oggPath: string; originalPath: string } {
  const folder = sanitizeStem(code || kind);
  const stamp = audioVersionStamp();
  const id = rand4();
  const base = `audio/${kind}/${folder}/v${stamp}_${id}`;
  const ext = originalExt.replace(/^\./, '').toLowerCase() || 'bin';
  return {
    stem: base,
    oggPath: `${base}.ogg`,
    originalPath: ext === 'ogg' ? `${base}.ogg` : `${base}.${ext}`,
  };
}

export function newCandidateId(): string {
  return `cand_${Date.now().toString(36)}_${rand4()}`;
}

export function extOfPath(path: string): string {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

/** If file is set but missing from candidates, synthesize one entry. Sync files[]. */
export function migrateCueCandidates<T extends AudioCueWithCandidates>(cue: T): T {
  const files = activeFilesOf(cue);
  const candidates = [...(cue.candidates ?? [])];
  for (const file of files) {
    if (file && !candidates.some((c) => c.file === file)) {
      candidates.unshift({
        id: newCandidateId(),
        file,
        originalFile: file,
        originalFormat: extOfPath(file) || undefined,
        source: 'picker',
        createdAt: new Date().toISOString(),
        label: '既存ファイル',
      });
    }
  }
  const synced = withActiveFiles({ ...cue, candidates }, files);
  return synced as T;
}

export function sortCandidatesNewestFirst(
  candidates: AudioCandidate[] | undefined,
): AudioCandidate[] {
  return [...(candidates ?? [])].sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || ''),
  );
}
