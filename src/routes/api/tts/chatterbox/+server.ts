import { env } from '$env/dynamic/private';
import { json, type RequestHandler } from '@sveltejs/kit';

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

export const POST: RequestHandler = async ({ request }) => {
	const endpoint = env.CHATTERBOX_TTS_ENDPOINT?.trim();

	if (!endpoint) {
		return json(
			{
				error:
					'Chatterbox TTS is not configured. Set CHATTERBOX_TTS_ENDPOINT to a local or self-hosted backend.'
			},
			{ status: 501 }
		);
	}

	const payload = await parseJson(request);
	if (!payload.ok) {
		return json({ error: payload.error }, { status: 400 });
	}

	const normalized = normalizePayload(payload.value);
	if (!normalized.ok) {
		return json({ error: normalized.error }, { status: 400 });
	}

	const backendRequest = buildBackendRequest(endpoint, normalized.value);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const backendResponse = await fetch(endpoint, {
			method: 'POST',
			headers: backendHeaders(),
			body: JSON.stringify(backendRequest),
			signal: controller.signal
		});

		if (!backendResponse.ok) {
			return json(
				{
					error:
						'Chatterbox backend could not generate audio. It may not support the requested model or voice.',
					backendStatus: backendResponse.status,
					detail: await readBackendError(backendResponse)
				},
				{ status: 502 }
			);
		}

		const backendContentType = backendResponse.headers.get('content-type') ?? '';
		if (!isAudioContentType(backendContentType)) {
			return json(
				{
					error: 'Chatterbox backend did not return audio.',
					backendStatus: backendResponse.status,
					detail: await readBackendError(backendResponse)
				},
				{ status: 502 }
			);
		}

		const audio = await backendResponse.arrayBuffer();
		return new Response(audio, {
			headers: {
				'Content-Type': contentTypeFor(normalized.value.format, backendContentType),
				'Cache-Control': 'no-store'
			}
		});
	} catch (err) {
		const message =
			err instanceof DOMException && err.name === 'AbortError'
				? 'Chatterbox backend timed out before audio was generated.'
				: 'Chatterbox backend is unreachable or failed before returning audio.';

		return json({ error: message }, { status: 502 });
	} finally {
		clearTimeout(timeout);
	}
};

async function parseJson(request: Request): Promise<
	| {
			ok: true;
			value: ChatterboxRequest;
	  }
	| {
			ok: false;
			error: string;
	  }
> {
	try {
		return { ok: true, value: (await request.json()) as ChatterboxRequest };
	} catch {
		return { ok: false, error: 'Request body must be valid JSON.' };
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

async function readBackendError(response: Response) {
	const contentType = response.headers.get('content-type') ?? '';
	const text = contentType.includes('application/json')
		? JSON.stringify(await response.json().catch(() => ({})))
		: await response.text().catch(() => '');

	return text.slice(0, 500);
}
