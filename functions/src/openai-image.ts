import sharp from 'sharp';

const GPT_IMAGE_REQUEST_SIZE = '1024x1024';
const OPENAI_IMAGE_MAX_ATTEMPTS = 5;
const OPENAI_IMAGE_BASE_DELAY_MS = 1500;

export const MAGENTA_BG_INSTRUCTION =
  '背景は単色フラット RGB #FF00FF（マゼンタ）のみ。グラデーション・柄・影・地平線・地面なし。被写体以外はその色だけ。';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableOpenAiImageStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function openAiImageRetryDelayMs(attempt: number, res: Response): number {
  if (res.status === 429) {
    const ra = res.headers.get('retry-after');
    if (ra) {
      const s = Number(ra);
      if (Number.isFinite(s) && s > 0) {
        return Math.min(60_000, Math.ceil(s * 1000)) + Math.floor(Math.random() * 500);
      }
    }
  }
  const exp = Math.min(32_000, OPENAI_IMAGE_BASE_DELAY_MS * 2 ** attempt);
  return exp + Math.floor(Math.random() * 1000);
}

function isGptImage2Family(model: string): boolean {
  return model === 'gpt-image-2' || model.startsWith('gpt-image-2-');
}

function backgroundForModel(model: string): 'transparent' | 'auto' {
  return isGptImage2Family(model) ? 'auto' : 'transparent';
}

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

function getModel(): string {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2';
}

export async function imageBufferToPngBuffer(buf: Buffer): Promise<Buffer> {
  return sharp(buf).png().toBuffer();
}

export function buildPromptWithMagenta(userPrompt: string): string {
  const u = userPrompt.trim();
  if (!u) throw new Error('画像生成プロンプトが空です。');
  return `${u}\n\n${MAGENTA_BG_INSTRUCTION}`;
}

/** Reference PNGs → one edited PNG via gpt-image images/edits. */
export async function editImagesWithReferences(
  referencePngBuffers: Buffer[],
  prompt: string,
): Promise<Buffer> {
  if (referencePngBuffers.length === 0) {
    throw new Error('参照画像がありません。');
  }
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error('画像編集プロンプトが空です。');
  }

  const apiKey = getApiKey();
  const model = getModel();

  const buildEditsForm = (): FormData => {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', trimmed);
    form.append('size', GPT_IMAGE_REQUEST_SIZE);
    form.append('output_format', 'png');
    form.append('quality', 'medium');
    form.append('background', backgroundForModel(model));

    for (let i = 0; i < referencePngBuffers.length; i++) {
      const buf = referencePngBuffers[i]!;
      const bytes = Uint8Array.from(buf);
      form.append(
        'image[]',
        new Blob([bytes], { type: 'image/png' }),
        `ref_${i}.png`,
      );
    }
    return form;
  };

  let lastErr = '';
  let json: { data?: Array<{ b64_json?: string }> } | null = null;

  for (let attempt = 0; attempt < OPENAI_IMAGE_MAX_ATTEMPTS; attempt++) {
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: buildEditsForm(),
    });

    if (res.ok) {
      json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
      break;
    }

    const delayMs = openAiImageRetryDelayMs(attempt, res);
    const text = await res.text();
    lastErr = `OpenAI Images edits HTTP ${res.status}: ${text}`;
    const retry =
      attempt < OPENAI_IMAGE_MAX_ATTEMPTS - 1 &&
      isRetryableOpenAiImageStatus(res.status);
    if (!retry) throw new Error(lastErr);
    await sleep(delayMs);
  }

  if (!json) {
    throw new Error(
      lastErr
        ? `${lastErr}（${OPENAI_IMAGE_MAX_ATTEMPTS} 回リトライ後も失敗）`
        : '画像編集 API が応答しませんでした。',
    );
  }

  const b64 = json.data?.[0]?.b64_json;
  if (typeof b64 !== 'string') {
    throw new Error('画像編集 API が b64_json を返しませんでした。');
  }

  return Buffer.from(b64, 'base64');
}
