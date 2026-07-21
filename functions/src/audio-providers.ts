/** Stability Stable Audio + ElevenLabs Sound Effects clients. */

export type StableAudioParams = {
  prompt: string;
  durationSeconds: number;
  outputFormat?: 'mp3' | 'wav';
  model?: 'stable-audio-2' | 'stable-audio-2.5';
  steps?: number;
  cfgScale?: number;
  seed?: number;
};

export type ElevenLabsSfxParams = {
  text: string;
  durationSeconds?: number;
  loop?: boolean;
  promptInfluence?: number;
};

function requireKey(envName: string, value: string | undefined): string {
  const key = value?.trim();
  if (!key) {
    throw new Error(`${envName} が未設定です。Secret Manager を確認してください。`);
  }
  return key;
}

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return res.statusText || `HTTP ${res.status}`;
  try {
    const j = JSON.parse(text) as {
      message?: string;
      errors?: { message?: string }[];
      detail?: unknown;
    };
    if (typeof j.message === 'string' && j.message) return j.message;
    if (Array.isArray(j.errors) && j.errors[0]?.message) return j.errors[0].message!;
    if (typeof j.detail === 'string') return j.detail;
    return text.slice(0, 400);
  } catch {
    return text.slice(0, 400);
  }
}

/**
 * Stability AI Stable Audio 2 text-to-audio.
 * POST /v2beta/audio/stable-audio-2/text-to-audio (multipart)
 */
export async function generateStableAudio(
  apiKey: string | undefined,
  params: StableAudioParams,
): Promise<{ buffer: Buffer; contentType: string; ext: 'mp3' | 'wav' }> {
  const key = requireKey('STABILITY_API_KEY', apiKey);
  const outputFormat = params.outputFormat === 'wav' ? 'wav' : 'mp3';
  const duration = Math.max(1, Math.min(190, Math.round(params.durationSeconds)));
  const model = params.model ?? 'stable-audio-2.5';
  const steps = params.steps ?? 50;
  const cfgScale = params.cfgScale ?? 7;

  const form = new FormData();
  form.append('prompt', params.prompt);
  form.append('duration', String(duration));
  form.append('steps', String(steps));
  form.append('cfg_scale', String(cfgScale));
  form.append('model', model);
  form.append('output_format', outputFormat);
  if (typeof params.seed === 'number' && Number.isFinite(params.seed)) {
    form.append('seed', String(Math.floor(params.seed)));
  }

  const res = await fetch(
    'https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'audio/*',
      },
      body: form,
    },
  );

  if (!res.ok) {
    throw new Error(`Stable Audio 失敗 (${res.status}): ${await readErrorMessage(res)}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const j = (await res.json()) as { audio?: string; finish_reason?: string };
    if (!j.audio) {
      throw new Error('Stable Audio: レスポンスに audio がありません');
    }
    return {
      buffer: Buffer.from(j.audio, 'base64'),
      contentType: outputFormat === 'wav' ? 'audio/wav' : 'audio/mpeg',
      ext: outputFormat,
    };
  }

  const ab = await res.arrayBuffer();
  return {
    buffer: Buffer.from(ab),
    contentType:
      contentType.startsWith('audio/')
        ? contentType
        : outputFormat === 'wav'
          ? 'audio/wav'
          : 'audio/mpeg',
    ext: outputFormat,
  };
}

/** ElevenLabs Sound Effects API rejects text longer than this. */
export const ELEVENLABS_SFX_TEXT_MAX = 450;

/**
 * Fit prompt into ElevenLabs SFX limit. Prefer cue-specific tail when a long
 * BGM-style prefix is present; otherwise hard-truncate.
 */
export function clampElevenLabsSfxText(
  text: string,
  max = ELEVENLABS_SFX_TEXT_MAX,
): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;

  // Drop known long BGM style card if present.
  const styleMarker = 'Hard avoid:';
  const idx = t.indexOf(styleMarker);
  if (idx >= 0) {
    const after = t.slice(idx + styleMarker.length);
    const cueStart = after.search(/\b(SFX:|UI:|Sound effect:|UI sound:)/i);
    if (cueStart >= 0) {
      const short =
        'Robodun game SFX: whimsical robot sci-fi, short one-shot, no music/melody/vocals. ' +
        after.slice(cueStart).trim();
      if (short.length <= max) return short;
      return short.slice(0, max);
    }
  }

  return t.slice(0, max);
}

/**
 * ElevenLabs text-to-sound-effects.
 * POST /v1/sound-generation → binary MP3
 */
export async function generateElevenLabsSfx(
  apiKey: string | undefined,
  params: ElevenLabsSfxParams,
): Promise<{ buffer: Buffer; contentType: string; ext: 'mp3' }> {
  const key = requireKey('ELEVENLABS_API_KEY', apiKey);
  const text = clampElevenLabsSfxText(params.text);

  const body: Record<string, unknown> = {
    text,
    model_id: 'eleven_text_to_sound_v2',
  };
  if (typeof params.durationSeconds === 'number' && Number.isFinite(params.durationSeconds)) {
    body.duration_seconds = Math.max(0.5, Math.min(30, params.durationSeconds));
  }
  if (typeof params.loop === 'boolean') body.loop = params.loop;
  if (typeof params.promptInfluence === 'number') {
    body.prompt_influence = Math.max(0, Math.min(1, params.promptInfluence));
  }

  const res = await fetch(
    'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
    {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    throw new Error(`ElevenLabs 失敗 (${res.status}): ${await readErrorMessage(res)}`);
  }

  const ab = await res.arrayBuffer();
  return {
    buffer: Buffer.from(ab),
    contentType: 'audio/mpeg',
    ext: 'mp3',
  };
}
