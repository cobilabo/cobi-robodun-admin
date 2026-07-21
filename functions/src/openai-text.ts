import { ROBODUN_AUDIO_STYLE, type AudioKind } from './audio-prompt';

function getApiKey(): string {
  const apiKey =
    process.env.OPEN_AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'OPEN_AI_API_KEY が未設定です。Secret Manager を確認してください。',
    );
  }
  return apiKey;
}

function getChatModel(): string {
  return process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4.1-mini';
}

/**
 * Japanese (or mixed) audio intent → English prompt for Stable Audio / ElevenLabs / Flow Music.
 */
export async function translateAudioPromptToEnglish(input: {
  japanese: string;
  kind?: AudioKind;
  code?: string;
  trigger?: string;
  noteJa?: string;
  loop?: boolean;
}): Promise<string> {
  const japanese = input.japanese.trim();
  if (!japanese) throw new Error('日本語プロンプトが空です');

  const meta = [
    input.kind ? `kind=${input.kind}` : '',
    input.code ? `code=${input.code}` : '',
    input.trigger ? `trigger=${input.trigger}` : '',
    input.noteJa ? `noteJa=${input.noteJa}` : '',
    typeof input.loop === 'boolean' ? `loop=${input.loop}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const system = [
    'You convert Japanese game-audio directions into a single English prompt.',
    'Output ONLY the English prompt text. No quotes, no markdown, no preamble.',
    'Keep it usable for Stable Audio, ElevenLabs Sound Effects, or Google Flow Music.',
    'Preserve musical/SFX intent, instruments, mood, tempo, loopability, and constraints.',
    'If the user asks for BGM: instrumental, no vocals/lyrics unless they explicitly want vocals.',
    'If SE/UI: keep it short and concrete.',
    'Weave in this world style unless the user clearly overrides it:',
    ROBODUN_AUDIO_STYLE,
  ].join('\n');

  const user = [
    meta ? `Cue metadata: ${meta}` : '',
    'Japanese direction:',
    japanese,
  ]
    .filter(Boolean)
    .join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getChatModel(),
      temperature: 0.35,
      max_tokens: 700,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI 翻訳失敗 (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim() || '';
  if (!text) throw new Error('OpenAI 翻訳結果が空です');
  return text.replace(/^["']|["']$/g, '').trim();
}
