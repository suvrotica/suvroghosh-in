import { createHash } from 'node:crypto';
import { segmentWithinBounds } from './narration-segments.mjs';

export const DEFAULT_MODEL = 'gemini-3.8-flash-tts';
export const DEFAULT_VOICE = 'achird';
export const DEFAULT_STYLE =
	'Warm, clear editorial narration in natural US English. Relaxed pacing, natural sentence emphasis, and sensible pauses. Preserve Bengali pronunciation in Bengali passages. Read the transcript verbatim.';
export const VERIFIED_FREE_MODELS = new Set(['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']);
const API = 'https://generativelanguage.googleapis.com/v1beta/';
const MAX_RESPONSE_BYTES = 48 * 1024 * 1024;

export class GoogleTTSError extends Error {
	constructor(code, message) {
		super(message);
		this.name = 'GoogleTTSError';
		this.code = code;
	}
}

export function digest(value) {
	return createHash('sha256').update(value).digest('hex');
}

export function googleConfig(env = process.env) {
	const model = env.GEMINI_TTS_MODEL?.trim() || DEFAULT_MODEL;
	if (!VERIFIED_FREE_MODELS.has(model)) {
		throw new GoogleTTSError(
			'CONFIG',
			'Model is not in the verified free-tier TTS allowlist; review official pricing before adding it.'
		);
	}
	return {
		model,
		language: 'en-US',
		voice: env.GEMINI_TTS_VOICE?.trim() || DEFAULT_VOICE,
		style: DEFAULT_STYLE,
		format: 'audio/wav',
		sampleRate: 24_000
	};
}

export function assertFreeTier(env = process.env) {
	if (env.GEMINI_TTS_FREE_TIER_CONFIRMED !== 'true') {
		throw new GoogleTTSError(
			'FREE_TIER',
			'No Google request made. Confirm in AI Studio that this API key belongs to a free-tier project, then set GEMINI_TTS_FREE_TIER_CONFIRMED=true. This is operator confirmation, not an API billing-tier check.'
		);
	}
	if (!env.GEMINI_API_KEY?.trim()) {
		throw new GoogleTTSError(
			'CREDENTIALS',
			'No Google request made. Set the private GEMINI_API_KEY for the confirmed free-tier project.'
		);
	}
}

async function readBoundedJson(response, maximum) {
	const reader = response.body?.getReader();
	if (!reader) throw new GoogleTTSError('RESPONSE', 'Google returned an empty response.');
	let size = 0;
	const buffers = [];
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maximum) {
				await reader.cancel();
				throw new GoogleTTSError(
					'RESPONSE',
					'Google response exceeded the bounded audio response size.'
				);
			}
			buffers.push(Buffer.from(value));
		}
		return JSON.parse(Buffer.concat(buffers).toString('utf8'));
	} catch (error) {
		if (error instanceof GoogleTTSError) throw error;
		throw new GoogleTTSError('RESPONSE', 'Google returned invalid or interrupted JSON.');
	} finally {
		reader.releaseLock();
	}
}

export function createGoogleClient({
	env = process.env,
	fetchImpl = fetch,
	timeoutMs = 240_000,
	maxRequests = 5,
	beforeRequest = async () => {},
	onQuota = async () => {}
} = {}) {
	let requests = 0;
	async function request(path, body, maximum = MAX_RESPONSE_BYTES) {
		assertFreeTier(env);
		if (requests >= maxRequests)
			throw new GoogleTTSError(
				'BUDGET',
				'Request budget reached; rerun explicitly to resume saved segments.'
			);
		// The caller owns the persistent project budget and holds the generation lock.
		// Reserve before transport: interrupted and failed attempts still consume the budget.
		await beforeRequest();
		requests += 1;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetchImpl(new URL(path, API), {
				method: body ? 'POST' : 'GET',
				headers: {
					'x-goog-api-key': env.GEMINI_API_KEY.trim(),
					...(body ? { 'Content-Type': 'application/json' } : {})
				},
				body: body ? JSON.stringify(body) : undefined,
				signal: controller.signal,
				redirect: 'error'
			});
			if (!response.ok) {
				await response.body?.cancel();
				if (response.status === 429) {
					await onQuota();
					throw new GoogleTTSError(
						'QUOTA',
						'Google free-tier quota/rate limit reached (HTTP 429). Stopped without retry; resume later after the project quota resets.'
					);
				}
				throw new GoogleTTSError(
					'HTTP',
					`Google TTS request failed (HTTP ${response.status}); no automatic paid fallback or retry was attempted.`
				);
			}
			return await readBoundedJson(response, maximum);
		} catch (error) {
			if (controller.signal.aborted)
				throw new GoogleTTSError(
					'TIMEOUT',
					'Google TTS request exceeded its deadline; saved work can be resumed.'
				);
			if (error instanceof GoogleTTSError) throw error;
			// Never include transport messages, URLs, request bodies or keys in errors/logs.
			throw new GoogleTTSError(
				'NETWORK',
				'Google TTS request failed before a complete response was received.'
			);
		} finally {
			clearTimeout(timer);
		}
	}
	return {
		get requests() {
			return requests;
		},
		async listVoices() {
			const voices = [];
			let token = '';
			do {
				const query = new URLSearchParams({
					language_code: 'en-US',
					region_code: 'US',
					type: 'prebuilt',
					page_size: '1000'
				});
				if (token) query.set('page_token', token);
				const result = await request(`voices?${query}`, undefined, 2 * 1024 * 1024);
				if (
					!result ||
					typeof result !== 'object' ||
					Array.isArray(result) ||
					(result.voices !== undefined && !Array.isArray(result.voices))
				)
					throw new GoogleTTSError(
						'VOICES',
						'Google returned no verifiable US English voice catalogue.'
					);
				voices.push(
					// The catalogue omits an empty voices field. Accent/context filters use
					// exact matches; verify regional metadata without excluding descriptions
					// such as "General American" or "Content & Media" at the API boundary.
					...(result.voices ?? []).filter(
						(voice) =>
							voice &&
							typeof voice.id === 'string' &&
							voice.id.length <= 200 &&
							voice.language_code?.toLowerCase() === 'en-us' &&
							/american/i.test(voice.accent ?? '') &&
							(!voice.region_code || voice.region_code.toUpperCase() === 'US')
					)
				);
				token = typeof result.next_page_token === 'string' ? result.next_page_token : '';
			} while (token);
			if (!voices.length)
				throw new GoogleTTSError(
					'VOICES',
					'No catalogue voice with language en-US and an American accent was found. No synthesis attempted.'
				);
			return voices;
		},
		async synthesize(text, config) {
			if (!VERIFIED_FREE_MODELS.has(config.model) || !config.voice || config.language !== 'en-US')
				throw new GoogleTTSError(
					'CONFIG',
					'Synthesis requires an allowed free-tier model and a verified US English voice.'
				);
			if (!segmentWithinBounds(text) || !text.trim())
				throw new GoogleTTSError(
					'INPUT',
					'Synthesis transcript must contain readable text within 6000 UTF-16 code units, 7000 UTF-8 bytes and 900 words.'
				);
			const result = await request('interactions', {
				model: config.model,
				input: [
					{
						type: 'user_input',
						content: [
							{
								type: 'text',
								text,
								annotations: [{ type: 'speech_metadata', style: config.style }]
							}
						]
					}
				],
				response_format: { type: 'audio', mime_type: 'audio/wav', sample_rate: 24_000 },
				generation_config: { speech_config: [{ voice: config.voice }] },
				store: false
			});
			if (!result || typeof result !== 'object' || !Array.isArray(result.steps))
				throw new GoogleTTSError('RESPONSE', 'Google returned an invalid interaction shape.');
			if (result.status !== 'completed')
				throw new GoogleTTSError(
					'INCOMPLETE',
					'Google returned an incomplete interaction; no complete article manifest was published.'
				);
			if (
				result.steps.some(
					(step) => step?.finish_reason && !['STOP', 'stop'].includes(step.finish_reason)
				)
			)
				throw new GoogleTTSError(
					'INCOMPLETE',
					'Google did not complete the full transcript; no complete article manifest was published.'
				);
			const blocks = result.steps
				.filter((step) => step?.type === 'model_output')
				.flatMap((step) => (Array.isArray(step.content) ? step.content : []))
				.filter((block) => block?.type === 'audio');
			if (blocks.length !== 1)
				throw new GoogleTTSError('AUDIO', 'Expected one complete WAV audio block from Google.');
			const block = blocks[0];
			if (block.mime_type && !['audio/wav', 'audio/x-wav'].includes(block.mime_type))
				throw new GoogleTTSError('AUDIO', 'Google returned an unexpected audio format.');
			if (
				typeof block.data !== 'string' ||
				!block.data.length ||
				block.data.length % 4 ||
				!/^[A-Za-z0-9+/]+={0,2}$/.test(block.data)
			)
				throw new GoogleTTSError('AUDIO', 'Google returned empty or malformed base64 audio.');
			const audio = Buffer.from(block.data, 'base64');
			return { audio, ...inspectWav(audio) };
		}
	};
}

/** Validate the complete container before reuse; do not add another WAV header. */
export function inspectWav(audio) {
	if (
		audio.length < 44 ||
		audio.toString('ascii', 0, 4) !== 'RIFF' ||
		audio.toString('ascii', 8, 12) !== 'WAVE' ||
		audio.readUInt32LE(4) + 8 !== audio.length
	)
		throw new GoogleTTSError('AUDIO', 'WAV container is missing, truncated or inconsistent.');
	let byteRate = 0;
	let dataBytes = 0;
	let formatSeen = false;
	for (let offset = 12; offset + 8 <= audio.length; ) {
		const tag = audio.toString('ascii', offset, offset + 4);
		const length = audio.readUInt32LE(offset + 4);
		const end = offset + 8 + length;
		if (end > audio.length)
			throw new GoogleTTSError('AUDIO', 'WAV contains a truncated audio chunk.');
		if (tag === 'fmt ') {
			if (
				length < 16 ||
				audio.readUInt16LE(offset + 8) !== 1 ||
				audio.readUInt16LE(offset + 10) !== 1 ||
				audio.readUInt32LE(offset + 12) !== 24_000 ||
				audio.readUInt16LE(offset + 22) !== 16
			)
				throw new GoogleTTSError('AUDIO', 'Expected 24 kHz mono 16-bit PCM WAV.');
			byteRate = audio.readUInt32LE(offset + 16);
			if (byteRate !== 48_000 || audio.readUInt16LE(offset + 20) !== 2)
				throw new GoogleTTSError('AUDIO', 'WAV sample layout is inconsistent.');
			formatSeen = true;
		}
		if (tag === 'data') dataBytes += length;
		offset = end + (length % 2);
	}
	if (!formatSeen || !dataBytes || dataBytes % 2)
		throw new GoogleTTSError('AUDIO', 'WAV contains no complete PCM samples.');
	const duration = dataBytes / byteRate;
	if (duration > 600)
		throw new GoogleTTSError('AUDIO', 'Narration segment exceeded the ten-minute safety limit.');
	return { duration, bytes: audio.length, audioHash: digest(audio) };
}
