/** Client-side defaults mirroring functions/src/audio-prompt.ts */

export type AudioKind = 'bgm' | 'se' | 'ui' | 'ambience';

/** Shared sonic identity (English, for model prompts). */
export const ROBODUN_AUDIO_STYLE = [
  'Audio for Robodun: a Japanese indie match-3 robot dungeon crawler.',
  'World: chunky friendly robots, warm amber/cyan neon lab-dungeons, whimsical sci-fi with light humor.',
  'Sonic palette: chiptune-adjacent lead melody, soft analog pads, light industrial clicks, clean short SFX.',
  'Hard avoid: pop vocals, lyrics, trap/EDM festival drops, horror drones, generic corporate royalty-free music.',
].join(' ');

/** Short style for ElevenLabs SFX (API text max 450 chars). */
export const ROBODUN_SFX_STYLE =
  'Robodun game SFX: whimsical robot sci-fi, short one-shot, no music/melody/vocals.';

/** ElevenLabs Sound Effects API text limit. */
export const ELEVENLABS_SFX_TEXT_MAX = 450;

const STYLE_JA = [
  '作品: ロボダン（マッチ3 × ロボットダンジョンの日本インディーゲーム）',
  '世界観: ごつごつした親しみやすいロボット、暖色〜シアンのネオンラボ風ダンジョン、コミカルSF、緊張とユーモアの同居',
  '音色: チップチューン寄りのメロディ、柔らかいシンセパッド、軽い機械クリック、短く明瞭な効果音',
  '禁止: ボーカル/歌詞、トラップやEDMドロップ、ホラー、ありきたりな企業向けBGM',
].join('\n');

type CuePrompt = { ja: string; en: string; durationSeconds?: number };

/**
 * Per-cue optimized defaults. Keys = audio.json `code`.
 * Japanese is what editors write; English is ready for Stable Audio / ElevenLabs / Flow Music.
 */
const CUE_DEFAULTS: Record<string, CuePrompt> = {
  bgm_title: {
    durationSeconds: 80,
    ja: [
      STYLE_JA,
      '用途: タイトル / ホーム画面 BGM（loop）',
      'ムード: 冒険の入り口、好奇心、ちょっとワクワク。戦闘ほど急かさない',
      'テンポ: だいたい 100–112 BPM',
      '構成: 覚えやすい短いフック → 穏やかなループ本体。イントロは短め',
      '楽器: 明るいシンセリード、温かいパッド、軽いキックとハイハット、遠くの機械ハムは控えめ',
      '必須: インストのみ。シームレスループ向き。派手なドロップなし',
    ].join('\n'),
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
    ja: [
      STYLE_JA,
      '用途: 通常戦闘 BGM（マッチ3プレイ中・loop）',
      'ムード: パズルの切迫感 + ロボット格闘の楽しさ。暗すぎず、ホラーにしない',
      'テンポ: だいたい 120–132 BPM',
      '構成: 8〜16小節でループしやすい本体。イントロは短く、フェードアウト不要',
      '楽器: キャッチーなチップチューン寄りリード、パンチのあるシンセベース、軽い工業パーカッション、控えめなギア/サーボ質感',
      '必須: インストのみ。数分ループしても疲れにくいモチーフ。ボーカルなし',
    ].join('\n'),
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
    ja: [
      STYLE_JA,
      '用途: ボス戦 BGM（loop）— 通常戦闘曲とは明確に別曲種にする',
      'ムード: アップテンポでカッコいいクライマックス。ヒーローロボ対巨大ボスの熱い見せ場。威圧より躍動とクールさを優先',
      'テンポ: だいたい 142–156 BPM（通常戦 120–132 より明らかに速い）',
      '構成: 早いドライブビート、キャッチーな高揚メロディ、短いビルド→ドロップ感。ループ前提。静かなブレイクや重いスロー部は禁止',
      '楽器: 疾走するキック＆スネア、厚めのサイドチェイン・シンセベース、煌びやかなリード／アルペジオ、金属パーカッションのアクセント',
      '差別化: 通常戦のパズル急かし感ではなく、アリーナ決勝・ボスラッシュの華やかさ。同テンポ帯・同フレーズ感の「ちょっと重い戦闘曲」にしない',
      '必須: インストのみ。ホラー／不協和／暗いドローンは避ける。コミカルSFの明るさは残す',
    ].join('\n'),
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
    ja: [
      STYLE_JA,
      '用途: ゲームオーバー短尺ジングル（非ループ）',
      'ムード: 敗北の落ち込み + ちょっとしたユーモア。暗く引きずらない',
      '長さ: 6〜12 秒程度で綺麗に終わる',
      '楽器: 短い下行メロディ、柔らかいシンセ、軽い機械の電源断感',
      '必須: インストのみ。長い余韻やボーカルなし。ワンショットで終了',
    ].join('\n'),
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
    ja: [
      STYLE_JA,
      '用途: マッチ成立 SE（タイルが揃った瞬間）',
      'ムード: 気持ちいい成功感、明るいキラッ',
      '長さ: 0.6〜1.4 秒。アタック速め、減衰早め',
      '音色: 明るいシンセチャイム / 電子スパーク。耳障りなノイズは避ける',
    ].join('\n'),
    en: [
      ROBODUN_SFX_STYLE,
      'SFX: match success when tiles align.',
      'Bright synth chime / digital sparkle; 0.6–1.4s; fast attack, quick decay.',
    ].join(' '),
  },

  se_clear: {
    durationSeconds: 0.9,
    ja: [
      STYLE_JA,
      '用途: タイル消去 SE',
      'ムード: 軽い消滅・はじける感。マッチ成立より控えめ',
      '長さ: 0.4〜1.0 秒',
      '音色: ソフトなデジタルポップ / 小さな結晶が砕けるような電子音',
    ].join('\n'),
    en: [
      ROBODUN_SFX_STYLE,
      'SFX: tiles clearing / disappearing.',
      'Soft digital pop / tiny crystal shatter; 0.4–1.0s; quieter than match success.',
    ].join(' '),
  },

  se_hit: {
    durationSeconds: 0.8,
    ja: [
      STYLE_JA,
      '用途: 敵への着弾 / 攻撃ヒット SE',
      'ムード: 短くパンチのあるヒット。痛々しすぎないロボ戦闘',
      '長さ: 0.3〜0.9 秒',
      '音色: 軽いレーザー着弾 + 金属クリック。爆発音は大げさにしない',
    ].join('\n'),
    en: [
      ROBODUN_SFX_STYLE,
      'SFX: projectile / attack hit on an enemy.',
      'Short punchy robot hit; light laser impact + metallic click; 0.3–0.9s.',
    ].join(' '),
  },

  se_player_hit: {
    durationSeconds: 0.9,
    ja: [
      STYLE_JA,
      '用途: プレイヤー被弾 SE',
      'ムード: ダメージの警告。敵ヒットより少し重く、不快ノイズは避ける',
      '長さ: 0.4〜1.0 秒',
      '音色: 低い電気ショック / 装甲に当たる鈍いクリック',
    ].join('\n'),
    en: [
      ROBODUN_SFX_STYLE,
      'SFX: player taking damage.',
      'Warning thud; low electric zap / dull armor knock; 0.4–1.0s; not harsh.',
    ].join(' '),
  },

  ui_ok: {
    durationSeconds: 0.5,
    ja: [
      STYLE_JA,
      '用途: UI 決定 / 確認',
      'ムード: 清潔でポジティブなクリック',
      '長さ: 0.2〜0.6 秒',
      '音色: 高めのソフト電子ビープ。余韻はごく短く',
    ].join('\n'),
    en: [
      ROBODUN_SFX_STYLE,
      'UI: confirm / OK.',
      'Soft higher electronic beep; 0.2–0.6s; very short tail.',
    ].join(' '),
  },

  ui_back: {
    durationSeconds: 0.5,
    ja: [
      STYLE_JA,
      '用途: UI 戻る / キャンセル',
      'ムード: 決定音より少し低く控えめ',
      '長さ: 0.2〜0.6 秒',
      '音色: 柔らかめの低めビープ。ネガティブすぎない',
    ].join('\n'),
    en: [
      ROBODUN_SFX_STYLE,
      'UI: back / cancel.',
      'Soft lower beep; 0.2–0.6s; softer than confirm, not negative.',
    ].join(' '),
  },
};

function kindFallbackJa(input: {
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
    ? 'ゲーム中にシームレスにループできるように。'
    : 'ワンショットで終わりをきれいに。';

  if (input.kind === 'bgm') {
    return [
      STYLE_JA,
      `用途: BGM（${label}）`,
      'インストのみ。覚えやすいモチーフ、中程度のエネルギー。',
      loopHint,
    ].join('\n');
  }
  if (input.kind === 'ambience') {
    return [
      STYLE_JA,
      `用途: アンビエンス（${label}）`,
      '機械ハムとラボの空気感。邪魔にならない薄めの背景音。',
      loopHint,
    ].join('\n');
  }
  if (input.kind === 'ui') {
    return [
      STYLE_JA,
      `用途: UI（${label}）`,
      '短くクリーンな電子ビープ。1秒未満。',
    ].join('\n');
  }
  return [
    STYLE_JA,
    `用途: SE（${label}）`,
    '短くパンチのあるゲームSFX。アタック明瞭、減衰早め。',
  ].join('\n');
}

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

/** Japanese editing template (user edits this; English via button or init template). */
export function buildDefaultPromptJa(input: {
  kind: AudioKind;
  code?: string;
  trigger?: string;
  noteJa?: string;
  loop?: boolean;
}): string {
  const code = input.code?.trim();
  if (code && CUE_DEFAULTS[code]) return CUE_DEFAULTS[code].ja;
  return kindFallbackJa(input);
}

/** @deprecated Prefer suggestCandidatePaths from audioCandidates. */
export function suggestDestPath(kind: AudioKind, code?: string): string {
  const stem =
    (code || kind)
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || kind;
  return `audio/${kind}/${stem}.ogg`;
}
