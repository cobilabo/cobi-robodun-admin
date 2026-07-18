import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import {
  buildEditPrompt,
  editImagesWithReferences,
  imageBufferToPngBuffer,
} from './openai-image';
import {
  parseImageShape,
  postprocessGeneratedImage,
  resolveOutputPixels,
} from './sprite-postprocess';

initializeApp();
setGlobalOptions({ region: 'asia-northeast1' });

const openAiApiKey = defineSecret('OPEN_AI_API_KEY');

const LIBRARY_PREFIX = 'library';
const MAX_REFS = 4;

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
