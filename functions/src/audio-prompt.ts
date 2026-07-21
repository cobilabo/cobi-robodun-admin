/** World-consistent style card + default prompt helpers for game audio. */

export type AudioKind = 'bgm' | 'se' | 'ui' | 'ambience';

/** Shared sonic identity for Robodun (English for model prompts). */
export const ROBODUN_AUDIO_STYLE = [
  'Audio for Robodun: a Japanese indie match-3 robot dungeon crawler.',
  'World: chunky friendly robots, warm amber/cyan neon lab-dungeons, whimsical sci-fi with light humor.',
  'Sonic palette: chiptune-adjacent lead melody, soft analog pads, light industrial clicks, clean short SFX.',
  'Hard avoid: pop vocals, lyrics, trap/EDM festival drops, horror drones, generic corporate royalty-free music.',
].join(' ');

/** Short style for ElevenLabs SFX (API text max 450 chars). */
export const ROBODUN_SFX_STYLE =
  'Robodun game SFX: whimsical robot sci-fi, short one-shot, no music/melody/vocals.';

type CuePromptEn = { en: string; durationSeconds?: number };

const CUE_DEFAULTS: Record<string, CuePromptEn> = {
  bgm_title: {
    durationSeconds: 80,
    en: [
      ROBODUN_AUDIO_STYLE,
      'Cue: title / home BGM (looping).',
      'Mood: curious, welcoming, light adventure anticipation — not combat urgency.',
      'Tempo: about 100–112 BPM.',
      'Form: short memorable hook into a calm looping body; keep intro brief.',
      'Instruments: bright synth lead, warm pads, light kick/hats; subtle distant machine hum only.',
      'Must: fully instrumental, seamless loop-friendly, no big drops, no vocals.',
    ].join(' '),
  },
  bgm_battle: {
    durationSeconds: 90,
    en: [
      ROBODUN_AUDIO_STYLE,
      'Cue: standard battle BGM during match-3 combat (looping).',
      'Mood: puzzle urgency + playful robot fighting — tense but fun, never horror.',
      'Tempo: about 120–132 BPM.',
      'Form: 8–16 bar loop-friendly body; short entry; no long fade-out ending.',
      'Instruments: catchy chiptune-adjacent lead, punchy synth bass, light industrial percussion, subtle gear/servo texture.',
      'Must: fully instrumental, motif that can loop for minutes without fatigue, no vocals.',
    ].join(' '),
  },
  bgm_boss: {
    durationSeconds: 100,
    en: [
      ROBODUN_AUDIO_STYLE,
      'Cue: BOSS battle BGM (looping) — must feel clearly different from standard battle BGM.',
      'Mood: uptempo, cool, heroic climax — flashy robot-vs-giant-boss arena energy; drive and swagger over grim pressure.',
      'Tempo: about 142–156 BPM (noticeably faster than normal battle ~120–132).',
      'Form: driving beat, catchy soaring motif, short build into a punchy drop; loop-first; NO slow/heavy sections or quiet breaks.',
      'Instruments: racing kick/snare, thick sidechained synth bass, sparkling lead/arps, metallic percussion accents.',
      'Differentiation: not “battle BGM but thicker” — think final-arena rush / boss-rush hype, not puzzle-urgency midfight.',
      'Must: fully instrumental; avoid horror, dissonance, dark drones; keep playful sci-fi brightness.',
    ].join(' '),
  },
  bgm_gameover: {
    durationSeconds: 10,
    en: [
      ROBODUN_AUDIO_STYLE,
      'Cue: game-over sting (one-shot, not looping).',
      'Mood: soft defeat with a touch of humor — disappointed but not bleak.',
      'Length: about 6–12 seconds with a clean ending.',
      'Instruments: short descending melody, soft synths, subtle power-down machine feel.',
      'Must: fully instrumental, no long tail, no vocals, single phrase then stop.',
    ].join(' '),
  },
  se_match: {
    durationSeconds: 1.2,
    en: [
      ROBODUN_SFX_STYLE,
      'SFX: match success when tiles align.',
      'Bright synth chime / digital sparkle; 0.6–1.4s; fast attack, quick decay.',
    ].join(' '),
  },
  se_clear: {
    durationSeconds: 0.9,
    en: [
      ROBODUN_SFX_STYLE,
      'SFX: tiles clearing / disappearing.',
      'Soft digital pop / tiny crystal shatter; 0.4–1.0s; quieter than match success.',
    ].join(' '),
  },
  se_hit: {
    durationSeconds: 0.8,
    en: [
      ROBODUN_SFX_STYLE,
      'SFX: projectile / attack hit on an enemy.',
      'Short punchy robot hit; light laser impact + metallic click; 0.3–0.9s.',
    ].join(' '),
  },
  se_player_hit: {
    durationSeconds: 0.9,
    en: [
      ROBODUN_SFX_STYLE,
      'SFX: player taking damage.',
      'Warning thud; low electric zap / dull armor knock; 0.4–1.0s; not harsh.',
    ].join(' '),
  },
  ui_ok: {
    durationSeconds: 0.5,
    en: [
      ROBODUN_SFX_STYLE,
      'UI: confirm / OK.',
      'Soft higher electronic beep; 0.2–0.6s; very short tail.',
    ].join(' '),
  },
  ui_back: {
    durationSeconds: 0.5,
    en: [
      ROBODUN_SFX_STYLE,
      'UI: back / cancel.',
      'Soft lower beep; 0.2–0.6s; softer than confirm, not negative.',
    ].join(' '),
  },
};

function kindFallbackEn(input: {
  kind: AudioKind;
  code?: string;
  trigger?: string;
  noteJa?: string;
  loop?: boolean;
}): string {
  const label =
    [input.noteJa, input.code, input.trigger].filter(Boolean).join(' / ') ||
    input.kind;
  const loopHint = input.loop
    ? 'Seamless loop suitable for continuous gameplay playback.'
    : 'Single one-shot phrase with a clean ending.';

  if (input.kind === 'bgm') {
    return [
      ROBODUN_AUDIO_STYLE,
      `BGM cue: ${label}.`,
      'Instrumental looping game music, medium energy, memorable motif, no vocals.',
      loopHint,
    ].join(' ');
  }
  if (input.kind === 'ambience') {
    return [
      ROBODUN_AUDIO_STYLE,
      `Ambience cue: ${label}.`,
      'Soft atmospheric bed, subtle mechanical hum and distant dungeon air, low distraction.',
      loopHint,
    ].join(' ');
  }
  if (input.kind === 'ui') {
    return [
      ROBODUN_SFX_STYLE,
      `UI sound: ${label}.`,
      'Short clean interface click/confirm beep, soft synthetic, under 1 second.',
    ].join(' ');
  }
  return [
    ROBODUN_SFX_STYLE,
    `Sound effect: ${label}.`,
    'Short punchy game SFX, clear attack and quick decay.',
  ].join(' ');
}

export function defaultDurationSeconds(
  kind: AudioKind,
  code?: string,
): number {
  const coded = code?.trim() ? CUE_DEFAULTS[code.trim()]?.durationSeconds : undefined;
  if (typeof coded === 'number') return coded;
  switch (kind) {
    case 'bgm':
      return 90;
    case 'ambience':
      return 30;
    case 'se':
      return 1.5;
    case 'ui':
      return 0.8;
    default:
      return 2;
  }
}

export function resolveProvider(
  kind: AudioKind,
  provider: 'auto' | 'stable-audio' | 'elevenlabs',
): 'stable-audio' | 'elevenlabs' {
  if (provider === 'stable-audio' || provider === 'elevenlabs') return provider;
  return kind === 'bgm' || kind === 'ambience' ? 'stable-audio' : 'elevenlabs';
}

export function buildDefaultPrompt(input: {
  kind: AudioKind;
  code?: string;
  trigger?: string;
  noteJa?: string;
  loop?: boolean;
}): string {
  const code = input.code?.trim();
  if (code && CUE_DEFAULTS[code]) return CUE_DEFAULTS[code].en;
  return kindFallbackEn(input);
}
