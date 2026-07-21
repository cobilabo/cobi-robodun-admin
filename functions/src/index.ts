import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import {
  buildDefaultPrompt,
  defaultDurationSeconds,
  resolveProvider,
  type AudioKind,
} from './audio-prompt';
import {
  generateElevenLabsSfx,
  generateStableAudio,
} from './audio-providers';
import { convertBufferToOgg } from './ffmpeg-audio';
import {
  buildEditPrompt,
  editImagesWithReferences,
  imageBufferToPngBuffer,
} from './openai-image';
import { translateAudioPromptToEnglish } from './openai-text';
import {
  parseImageShape,
  postprocessGeneratedImage,
  resolveOutputPixels,
} from './sprite-postprocess';

initializeApp();
setGlobalOptions({ region: 'asia-northeast1' });

const openAiApiKey = defineSecret('OPEN_AI_API_KEY');
const stabilityApiKey = defineSecret('STABILITY_API_KEY');
const elevenLabsApiKey = defineSecret('ELEVENLABS_API_KEY');

const LIBRARY_PREFIX = 'library';
const PROJECT_PREFIX = 'project/assets';
const MAX_REFS = 4;
const AUDIO_KINDS = new Set<AudioKind>(['bgm', 'se', 'ui', 'ambience']);

function normalizeLibraryPath(raw: string): string {
  return raw
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((s) => s && s !== '.' && s !== '..')
    .join('/');
}

export const generateLibraryImage = onCall(
  {
    secrets: [openAiApiKey],
    timeoutSeconds: 300,
    memory: '1GiB',
    maxInstances: 4,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ログインが必要です');
    }

    const referencePathsRaw = request.data?.referencePaths;
    const promptRaw = request.data?.prompt;
    const destPathRaw = request.data?.destPath;
    const shape = parseImageShape(request.data?.shape);
    const transparentBackground = request.data?.transparentBackground !== false;

    if (!Array.isArray(referencePathsRaw) || referencePathsRaw.length === 0) {
      throw new HttpsError('invalid-argument', 'referencePaths が必要です');
    }
    if (typeof promptRaw !== 'string' || !promptRaw.trim()) {
      throw new HttpsError('invalid-argument', 'prompt が必要です');
    }
    if (typeof destPathRaw !== 'string' || !destPathRaw.trim()) {
      throw new HttpsError('invalid-argument', 'destPath が必要です');
    }

    const referencePaths = [
      ...new Set(
        referencePathsRaw
          .map((p) => normalizeLibraryPath(String(p)))
          .filter(Boolean),
      ),
    ].slice(0, MAX_REFS);

    let destPath = normalizeLibraryPath(destPathRaw);
    if (!destPath.toLowerCase().endsWith('.webp')) {
      destPath = `${destPath.replace(/\.[^.]+$/, '')}.webp`;
    }
    if (!destPath || referencePaths.length === 0) {
      throw new HttpsError('invalid-argument', 'パスが不正です');
    }

    // Secret → process.env for openai-image helpers
    process.env.OPEN_AI_API_KEY = openAiApiKey.value();

    const bucket = getStorage().bucket();
    const pngRefs: Buffer[] = [];

    for (const rel of referencePaths) {
      const file = bucket.file(`${LIBRARY_PREFIX}/${rel}`);
      const [exists] = await file.exists();
      if (!exists) {
        throw new HttpsError('not-found', `参照画像が見つかりません: ${rel}`);
      }
      const [buf] = await file.download();
      pngRefs.push(await imageBufferToPngBuffer(buf));
    }

    const prompt = buildEditPrompt(promptRaw, transparentBackground);
    const generatedPng = await editImagesWithReferences(pngRefs, prompt, {
      shape,
      transparentBackground,
    });

    const { width, height } = resolveOutputPixels(shape, transparentBackground);
    const webp = await postprocessGeneratedImage(generatedPng, {
      width,
      height,
      transparentBackground,
      spriteAlign: transparentBackground && shape === 'square',
    });

    const destFile = bucket.file(`${LIBRARY_PREFIX}/${destPath}`);
    await destFile.save(webp, {
      contentType: 'image/webp',
      metadata: {
        metadata: {
          generatedBy: request.auth.token.email ?? request.auth.uid,
          sourceRefs: referencePaths.join(','),
          shape,
          transparentBackground: String(transparentBackground),
          outputSize: `${width}x${height}`,
        },
      },
    });

    return {
      ok: true,
      path: destPath,
      shape,
      transparentBackground,
      width,
      height,
    };
  },
);

/**
 * Japanese audio direction → English prompt (for Stable Audio / ElevenLabs / Flow Music).
 */
export const translateAudioPrompt = onCall(
  {
    secrets: [openAiApiKey],
    timeoutSeconds: 60,
    memory: '256MiB',
    maxInstances: 8,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ログインが必要です');
    }

    const japanese =
      typeof request.data?.japanese === 'string' ? request.data.japanese.trim() : '';
    if (!japanese) {
      throw new HttpsError('invalid-argument', 'japanese が必要です');
    }

    const kindRaw = request.data?.kind;
    let kind: AudioKind | undefined;
    if (kindRaw != null && String(kindRaw).trim()) {
      kind = parseAudioKind(kindRaw);
    }

    process.env.OPEN_AI_API_KEY = openAiApiKey.value();

    try {
      const english = await translateAudioPromptToEnglish({
        japanese,
        kind,
        code: typeof request.data?.code === 'string' ? request.data.code : undefined,
        trigger:
          typeof request.data?.trigger === 'string' ? request.data.trigger : undefined,
        noteJa:
          typeof request.data?.noteJa === 'string' ? request.data.noteJa : undefined,
        loop:
          typeof request.data?.loop === 'boolean' ? request.data.loop : undefined,
      });
      return { ok: true, english, japanese };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('未設定')) {
        throw new HttpsError('failed-precondition', msg);
      }
      throw new HttpsError('internal', msg);
    }
  },
);

function normalizeProjectAssetPath(raw: string): string {
  return raw
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^assets\//, '')
    .split('/')
    .filter((s) => s && s !== '.' && s !== '..')
    .join('/');
}

function sanitizeFileStem(raw: string): string {
  const s = raw
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return s || 'audio';
}

function parseAudioKind(raw: unknown): AudioKind {
  const k = String(raw || '').trim() as AudioKind;
  if (!AUDIO_KINDS.has(k)) {
    throw new HttpsError('invalid-argument', 'kind は bgm / se / ui / ambience のいずれかです');
  }
  return k;
}

/**
 * Generate game audio into project/assets (audio/...).
 * - bgm / ambience → Stability Stable Audio (default)
 * - se / ui → ElevenLabs Sound Effects (default)
 */
export const generateProjectAudio = onCall(
  {
    secrets: [stabilityApiKey, elevenLabsApiKey],
    timeoutSeconds: 540,
    memory: '1GiB',
    maxInstances: 4,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ログインが必要です');
    }

    const kind = parseAudioKind(request.data?.kind);
    const providerIn = String(request.data?.provider || 'auto').trim() as
      | 'auto'
      | 'stable-audio'
      | 'elevenlabs';
    if (!['auto', 'stable-audio', 'elevenlabs'].includes(providerIn)) {
      throw new HttpsError(
        'invalid-argument',
        'provider は auto / stable-audio / elevenlabs のいずれかです',
      );
    }

    const code =
      typeof request.data?.code === 'string' ? request.data.code.trim() : '';
    const trigger =
      typeof request.data?.trigger === 'string' ? request.data.trigger.trim() : '';
    const noteJa =
      typeof request.data?.noteJa === 'string' ? request.data.noteJa.trim() : '';
    const loop = Boolean(request.data?.loop);
    const promptRaw =
      typeof request.data?.prompt === 'string' ? request.data.prompt.trim() : '';
    const destPathRaw =
      typeof request.data?.destPath === 'string' ? request.data.destPath.trim() : '';

    const provider = resolveProvider(kind, providerIn);
    const defaultDur = defaultDurationSeconds(kind, code || undefined);
    let durationSeconds =
      typeof request.data?.durationSeconds === 'number' &&
      Number.isFinite(request.data.durationSeconds)
        ? Number(request.data.durationSeconds)
        : defaultDur;

    if (provider === 'elevenlabs') {
      durationSeconds = Math.max(0.5, Math.min(30, durationSeconds));
    } else {
      durationSeconds = Math.max(1, Math.min(190, Math.round(durationSeconds)));
    }

    const prompt =
      promptRaw ||
      buildDefaultPrompt({ kind, code, trigger, noteJa, loop });

    const stem = sanitizeFileStem(code || kind);
    let oggPath = destPathRaw
      ? normalizeProjectAssetPath(destPathRaw)
      : `audio/${kind}/${stem}.ogg`;
    if (!oggPath.toLowerCase().endsWith('.ogg')) {
      oggPath = `${oggPath.replace(/\.[^.]+$/, '')}.ogg`;
    }
    if (!oggPath.startsWith('audio/')) {
      oggPath = `audio/${oggPath}`;
    }

    try {
      let rawBuffer: Buffer;
      let rawExt: 'mp3' | 'wav';
      let rawContentType: string;
      let usedProvider: 'stable-audio' | 'elevenlabs';

      if (provider === 'stable-audio') {
        const out = await generateStableAudio(stabilityApiKey.value(), {
          prompt,
          durationSeconds,
          outputFormat: 'mp3',
        });
        rawBuffer = out.buffer;
        rawExt = out.ext;
        rawContentType = out.contentType;
        usedProvider = 'stable-audio';
      } else {
        const out = await generateElevenLabsSfx(elevenLabsApiKey.value(), {
          text: prompt,
          durationSeconds,
          loop: kind === 'ambience' ? true : loop && kind !== 'ui',
          promptInfluence: 0.45,
        });
        rawBuffer = out.buffer;
        rawExt = out.ext;
        rawContentType = out.contentType;
        usedProvider = 'elevenlabs';
      }

      const originalPath = `${oggPath.replace(/\.ogg$/i, '')}.${rawExt}`;
      const oggBuffer = await convertBufferToOgg(rawBuffer, rawExt);

      const bucket = getStorage().bucket();
      const metaBase = {
        generatedBy: request.auth.token.email ?? request.auth.uid,
        provider: usedProvider,
        kind,
        prompt: prompt.slice(0, 500),
        durationSeconds: String(durationSeconds),
      };

      await bucket.file(`${PROJECT_PREFIX}/${originalPath}`).save(rawBuffer, {
        contentType: rawContentType,
        metadata: { metadata: { ...metaBase, role: 'original' } },
      });
      await bucket.file(`${PROJECT_PREFIX}/${oggPath}`).save(oggBuffer, {
        contentType: 'audio/ogg',
        metadata: { metadata: { ...metaBase, role: 'ogg' } },
      });

      return {
        ok: true,
        path: oggPath,
        originalPath,
        originalFormat: rawExt,
        provider: usedProvider,
        kind,
        durationSeconds,
        prompt,
        contentType: 'audio/ogg',
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('未設定')) {
        throw new HttpsError('failed-precondition', msg);
      }
      throw new HttpsError('internal', msg);
    }
  },
);

/**
 * Normalize an already-uploaded project audio file to Ogg Vorbis.
 * Keeps the source file as original; writes destOggPath.
 */
export const normalizeProjectAudio = onCall(
  {
    timeoutSeconds: 300,
    memory: '1GiB',
    maxInstances: 4,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ログインが必要です');
    }

    const srcPathRaw =
      typeof request.data?.srcPath === 'string' ? request.data.srcPath.trim() : '';
    const destOggRaw =
      typeof request.data?.destOggPath === 'string'
        ? request.data.destOggPath.trim()
        : '';
    if (!srcPathRaw) {
      throw new HttpsError('invalid-argument', 'srcPath が必要です');
    }

    const srcPath = normalizeProjectAssetPath(srcPathRaw);
    let destOggPath = destOggRaw
      ? normalizeProjectAssetPath(destOggRaw)
      : `${srcPath.replace(/\.[^.]+$/, '')}.ogg`;
    if (!destOggPath.toLowerCase().endsWith('.ogg')) {
      destOggPath = `${destOggPath.replace(/\.[^.]+$/, '')}.ogg`;
    }
    if (!srcPath.startsWith('audio/') || !destOggPath.startsWith('audio/')) {
      throw new HttpsError('invalid-argument', 'audio/ 配下のパスのみ対応です');
    }

    const ext = (srcPath.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
    if (!['ogg', 'wav', 'mp3', 'm4a'].includes(ext)) {
      throw new HttpsError(
        'invalid-argument',
        '対応形式は ogg / wav / mp3 / m4a です',
      );
    }

    try {
      const bucket = getStorage().bucket();
      const srcFile = bucket.file(`${PROJECT_PREFIX}/${srcPath}`);
      const [exists] = await srcFile.exists();
      if (!exists) {
        throw new HttpsError('not-found', `ファイルがありません: ${srcPath}`);
      }
      const [rawBuffer] = await srcFile.download();

      if (ext === 'ogg') {
        if (srcPath !== destOggPath) {
          await bucket.file(`${PROJECT_PREFIX}/${destOggPath}`).save(rawBuffer, {
            contentType: 'audio/ogg',
            metadata: {
              metadata: {
                normalizedBy: request.auth.token.email ?? request.auth.uid,
                role: 'ogg',
                source: srcPath,
              },
            },
          });
        }
        return {
          ok: true,
          path: destOggPath,
          originalPath: srcPath,
          originalFormat: 'ogg',
          contentType: 'audio/ogg',
        };
      }

      const oggBuffer = await convertBufferToOgg(rawBuffer, ext);
      await bucket.file(`${PROJECT_PREFIX}/${destOggPath}`).save(oggBuffer, {
        contentType: 'audio/ogg',
        metadata: {
          metadata: {
            normalizedBy: request.auth.token.email ?? request.auth.uid,
            role: 'ogg',
            source: srcPath,
          },
        },
      });

      return {
        ok: true,
        path: destOggPath,
        originalPath: srcPath,
        originalFormat: ext,
        contentType: 'audio/ogg',
      };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpsError('internal', msg);
    }
  },
);
