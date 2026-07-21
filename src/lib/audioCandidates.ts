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
  file?: string;
  loop?: boolean;
  trigger?: string;
  noteJa?: string;
  promptJa?: string;
  promptEn?: string;
  candidates?: AudioCandidate[];
};

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

/** If file is set but missing from candidates, synthesize one entry. */
export function migrateCueCandidates<T extends AudioCueWithCandidates>(cue: T): T {
  const file = cue.file?.trim() || '';
  const candidates = [...(cue.candidates ?? [])];
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
  return { ...cue, candidates };
}

export function sortCandidatesNewestFirst(
  candidates: AudioCandidate[] | undefined,
): AudioCandidate[] {
  return [...(candidates ?? [])].sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || ''),
  );
}
