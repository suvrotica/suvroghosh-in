import { env } from '$env/dynamic/private';
import { json as kitJson, type RequestHandler } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { BodyReadError, readBoundedBody, withDeadline } from '$lib/server/http/body';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import { reserveTtsUsage, ttsQuotaConfig, type TtsQuotaConfig } from '$lib/server/tts/quota';

export const config = { maxDuration: 150 };

type LogicalModel = 'turbo' | 'original' | 'multilingual';
type AudioFormat = 'wav' | 'mp3' | 'opus';

type ChatterboxRequest = {
	text?: unknown;
	model?: unknown;
	voice?: unknown;
	format?: unknown;
	exaggeration?: unknown;
	cfgWeight?: unknown;
	allowExpressiveTags?: unknown;
};

type NormalizedRequest = {
	text: string;
	model: LogicalModel;
	backendModel: string;
	voice: string;
	format: AudioFormat;
	exaggeration: number;
	cfgWeight: number;
	allowExpressiveTags: boolean;
};

const MAX_TEXT_LENGTH = 3000;
const REQUEST_TIMEOUT_MS = 120000;
const MAX_REQUEST_BYTES = 64 * 1024;
const BODY_TIMEOUT_MS = 10000;
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
const admitRequest = createLocalAdmission({
	attempts: 3,
	globalAttempts: 12,
	windowMs: 60000,
	concurrency: 2,
	maxKeys: 2048
});

const BACKEND_MODEL_BY_LOGICAL: Record<LogicalModel, string> = {
	turbo: 'chatterbox-turbo',
	original: 'chatterbox',
	multilingual: 'chatterbox-multilingual'
};

const AUDIO_CONTENT_TYPE_BY_FORMAT: Record<AudioFormat, string> = {
	wav: 'audio/wav',
	mp3: 'audio/mpeg',
	opus: 'audio/opus'
};

const EXPRESSIVE_TAGS = new Set(['laugh', 'sigh', 'pause', 'cough', 'breath']);

function json(data: unknown, init?: ResponseInit) {
	const headers = new Headers(init?.headers);
	headers.set('Cache-Control', 'no-store');
	return kitJson(data, { ...init, headers });
}

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	if (request.headers.get('origin') !== url.origin) {
		return json({ error: 'A same-origin request is required.' }, { status: 403 });
	}
	if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
		return json({ error: 'Request body must use application/json.' }, { status: 415 });
	}
	const endpoint = env.CHATTERBOX_TTS_ENDPOINT?.trim();

	if (!endpoint) {
		return json(
			{
				error: 'Chatterbox TTS is not available. Use device speech instead.'
			},
			{ status: 501 }
		);
	}
	const quotaConfig = ttsQuotaConfig(env);
	if (!quotaConfig) {
		return json({ error: 'Chatterbox TTS is temporarily unavailable.' }, { status: 503 });
	}
	let address: string;
	try {
		address = getClientAddress();
		if (!address || address.length > 256) throw new Error('Missing address');
	} catch {
		// No trusted identity means no durable client quota, so do not invoke the provider.
		return json({ error: 'Chatterbox TTS is temporarily unavailable.' }, { status: 503 });
	}
	const admission = admitRequest(createHash('sha256').update(address).digest('hex'));
	if (!admission.allowed) {
		return json(
			{ error: 'Too many audio requests. Please try again later.' },
			{
				status: 429,
				headers: { 'Retry-After': String(admission.retryAfterSeconds) }
			}
		);
	}
	try {
		return await generateAudio(request, endpoint, address, quotaConfig);
	} finally {
		admission.release();
	}
};

async function generateAudio(
	request: Request,
	endpoint: string,
	address: string,
	quotaConfig: TtsQuotaConfig
) {
	const payload = await parseJson(request);
	if (!payload.ok) {
		return json({ error: payload.error }, { status: payload.status });
	}

	const normalized = normalizePayload(payload.value);
	if (!normalized.ok) {
		return json({ error: normalized.error }, { status: 400 });
	}
	try {
		const quota = await reserveTtsUsage(
			quotaConfig,
			address,
			normalized.value.text.length,
			request.signal
		);
		if (!quota.allowed) {
			return json(
				{ error: 'The audio usage limit has been reached. Try later or use device speech.' },
				{ status: 429, headers: { 'Retry-After': String(quota.retryAfterSeconds) } }
			);
		}
	} catch {
		// Never log the RPC body, credential, visitor identity, or user-supplied text.
		console.warn('chatterbox_quota_unavailable');
		return json({ error: 'Chatterbox TTS is temporarily unavailable.' }, { status: 503 });
	}

	const backendRequest = buildBackendRequest(endpoint, normalized.value);
	try {
		return await withDeadline(async (deadline) => {
			const signal = AbortSignal.any([deadline, request.signal]);
			signal.throwIfAborted();
			const backendResponse = await fetch(endpoint, {
				method: 'POST',
				redirect: 'error',
				headers: backendHeaders(),
				body: JSON.stringify(backendRequest),
				signal
			});

			if (!backendResponse.ok) {
				console.warn('chatterbox_provider_failed', {
					kind: 'http',
					status: backendResponse.status
				});
				void backendResponse.body?.cancel().catch(() => {});
				return json(
					{
						error: 'Chatterbox backend could not generate audio. Please try again later.'
					},
					{ status: 502 }
				);
			}

			const backendContentType = backendResponse.headers.get('content-type') ?? '';
			if (!isAudioContentType(backendContentType)) {
				console.warn('chatterbox_provider_failed', { kind: 'content_type' });
				void backendResponse.body?.cancel().catch(() => {});
				return json(
					{
						error: 'Chatterbox backend did not return audio.'
					},
					{ status: 502 }
				);
			}

			const audio = await readBoundedBody(
				backendResponse,
				MAX_AUDIO_BYTES,
				REQUEST_TIMEOUT_MS,
				signal
			);
			if (audio.byteLength === 0) {
				return json({ error: 'Chatterbox backend returned empty audio.' }, { status: 502 });
			}
			return new Response(audio, {
				headers: {
					'Content-Type': contentTypeFor(normalized.value.format, backendContentType),
					'Cache-Control': 'no-store'
				}
			});
		}, REQUEST_TIMEOUT_MS);
	} catch (err) {
		const message =
			(err instanceof BodyReadError && err.kind !== 'too-large') ||
			(err instanceof DOMException && err.name === 'AbortError')
				? 'Chatterbox backend timed out before audio was generated.'
				: err instanceof BodyReadError && err.kind === 'too-large'
					? 'Chatterbox backend returned too much audio.'
					: 'Chatterbox backend is unreachable or failed before returning audio.';

		return json({ error: message }, { status: 502 });
	}
}

async function parseJson(request: Request): Promise<
	| {
			ok: true;
			value: ChatterboxRequest;
	  }
	| {
			ok: false;
			error: string;
			status: number;
	  }
> {
	try {
		const bytes = await readBoundedBody(
			request,
			MAX_REQUEST_BYTES,
			BODY_TIMEOUT_MS,
			request.signal
		);
		const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return { ok: false, error: 'Request body must be a JSON object.', status: 400 };
		}
		return { ok: true, value: value as ChatterboxRequest };
	} catch (error) {
		if (error instanceof BodyReadError) {
			return {
				ok: false,
				error:
					error.kind === 'too-large' ? 'Request body is too large.' : 'Request body timed out.',
				status: error.kind === 'too-large' ? 413 : 408
			};
		}
		return { ok: false, error: 'Request body must be valid JSON.', status: 400 };
	}
}

function normalizePayload(payload: ChatterboxRequest):
	| {
			ok: true;
			value: NormalizedRequest;
	  }
	| {
			ok: false;
			error: string;
	  } {
	if (
		payload.allowExpressiveTags !== undefined &&
		typeof payload.allowExpressiveTags !== 'boolean'
	) {
		return { ok: false, error: 'Expressive tags must be enabled with a boolean.' };
	}
	const rawText = typeof payload.text === 'string' ? payload.text : '';
	const allowExpressiveTags = payload.allowExpressiveTags === true;
	const text = cleanText(rawText, allowExpressiveTags);

	if (!text) {
		return { ok: false, error: 'Please provide article text for Chatterbox TTS.' };
	}

	const model = parseModel(payload.model);
	if (!model) {
		return {
			ok: false,
			error: 'Unsupported Chatterbox model option. Choose turbo, original, or multilingual.'
		};
	}

	const voice = parseVoice(payload.voice);
	if (!voice) {
		return { ok: false, error: 'Voice must be a backend-configured voice name.' };
	}

	const format = parseFormat(payload.format);
	if (!format) {
		return { ok: false, error: 'Unsupported audio format. Choose wav, mp3, or opus.' };
	}

	const exaggeration = parseNumber(payload.exaggeration, 0.5, 0, 2);
	if (exaggeration === null) {
		return { ok: false, error: 'Exaggeration must be a number between 0 and 2.' };
	}

	const cfgWeight = parseNumber(payload.cfgWeight, 0.5, 0, 1);
	if (cfgWeight === null) {
		return { ok: false, error: 'CFG weight must be a number between 0 and 1.' };
	}

	return {
		ok: true,
		value: {
			text,
			model,
			backendModel: backendModelFor(model),
			voice,
			format,
			exaggeration,
			cfgWeight,
			allowExpressiveTags
		}
	};
}

function parseModel(value: unknown): LogicalModel | null {
	if (value === undefined || value === null || value === '') {
		return 'turbo';
	}

	if (value === 'turbo' || value === 'original' || value === 'multilingual') {
		return value;
	}

	return null;
}

function backendModelFor(model: LogicalModel) {
	if (model === 'turbo') {
		return env.CHATTERBOX_TTS_DEFAULT_MODEL?.trim() || BACKEND_MODEL_BY_LOGICAL.turbo;
	}

	return BACKEND_MODEL_BY_LOGICAL[model];
}

function parseVoice(value: unknown) {
	if (value !== undefined && value !== null && typeof value !== 'string') return null;
	const voice =
		typeof value === 'string' && value.trim()
			? value.trim()
			: env.CHATTERBOX_TTS_DEFAULT_VOICE?.trim() || 'Emily.wav';

	if (!voice || voice.length > 120 || voice.includes('..') || /[\\/]/.test(voice)) {
		return null;
	}

	if (!/^[\w .-]+$/.test(voice)) {
		return null;
	}

	return voice;
}

function parseFormat(value: unknown): AudioFormat | null {
	if (value === undefined || value === null || value === '') {
		return 'wav';
	}

	if (value === 'wav' || value === 'mp3' || value === 'opus') {
		return value;
	}

	return null;
}

function parseNumber(value: unknown, fallback: number, min: number, max: number) {
	if (value === undefined || value === null || value === '') {
		return fallback;
	}
	if (typeof value !== 'number' && typeof value !== 'string') return null;

	const number = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(number) || number < min || number > max) {
		return null;
	}

	return number;
}

function cleanText(text: string, allowExpressiveTags: boolean) {
	return limitText(
		sanitizeExpressiveTags(
			text
				.replace(/\r/g, '\n')
				.replace(/^\s*---[\s\S]*?---/, ' ')
				.replace(/```[\s\S]*?```/g, ' ')
				.replace(/`[^`]*`/g, ' ')
				.replace(/<\/?(?:TTS|ChatterboxTTS|Pi|Yt|Yc|Dl|Vid)\b[^>]*>/gi, ' ')
				.replace(/<[^>]+>/g, ' ')
				.replace(/\s+/g, ' ')
				.trim(),
			allowExpressiveTags
		)
	);
}

function limitText(text: string) {
	if (text.length <= MAX_TEXT_LENGTH) {
		return text;
	}

	const clipped = text.slice(0, MAX_TEXT_LENGTH);
	const lastSentenceEnd = Math.max(
		clipped.lastIndexOf('.'),
		clipped.lastIndexOf('!'),
		clipped.lastIndexOf('?')
	);

	return clipped.slice(0, lastSentenceEnd > 900 ? lastSentenceEnd + 1 : MAX_TEXT_LENGTH).trim();
}

function sanitizeExpressiveTags(text: string, allowExpressiveTags: boolean) {
	return text.replace(/\[([a-z][a-z -]{0,32})\]/gi, (match, rawTag: string) => {
		const normalized = rawTag.trim().toLowerCase().replace(/\s+/g, ' ');
		const isAllowed = EXPRESSIVE_TAGS.has(normalized);

		if (allowExpressiveTags && isAllowed) {
			return `[${normalized}]`;
		}

		return isAllowed || /^[a-z][a-z -]{0,32}$/i.test(rawTag) ? '' : match;
	});
}

function buildBackendRequest(endpoint: string, request: NormalizedRequest) {
	if (usesNativeChatterboxEndpoint(endpoint)) {
		return {
			text: request.text,
			voice_mode: 'predefined',
			predefined_voice_id: request.voice,
			output_format: request.format,
			split_text: false,
			exaggeration: request.exaggeration,
			cfg_weight: request.cfgWeight
		};
	}

	return {
		model: request.backendModel,
		voice: request.voice,
		input: request.text,
		response_format: request.format
	};
}

function usesNativeChatterboxEndpoint(endpoint: string) {
	try {
		const { pathname } = new URL(endpoint);
		return pathname.replace(/\/+$/, '').endsWith('/tts');
	} catch {
		return false;
	}
}

function backendHeaders() {
	const headers = new Headers({
		'Content-Type': 'application/json',
		Accept: 'audio/*, application/json;q=0.9'
	});
	const apiKey = env.CHATTERBOX_TTS_API_KEY?.trim();

	if (apiKey) {
		headers.set('Authorization', `Bearer ${apiKey}`);
	}

	return headers;
}

function isAudioContentType(contentType: string) {
	return contentType.toLowerCase().startsWith('audio/');
}

function contentTypeFor(format: AudioFormat, backendContentType: string) {
	return isAudioContentType(backendContentType)
		? backendContentType
		: AUDIO_CONTENT_TYPE_BY_FORMAT[format];
}
