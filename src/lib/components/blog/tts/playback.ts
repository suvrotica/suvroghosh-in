/** Browser-only playback contracts; deliberately contains no provider configuration or credentials. */
export interface NarrationSegment {
	src: string;
	duration: number;
	textStart: number;
	textEnd: number;
}

export interface NarrationManifest {
	version: number;
	textHash: string;
	language: 'en-US';
	model: string;
	voice: string;
	style: string;
	segments: NarrationSegment[];
}

export interface DeviceVoice {
	voiceURI: string;
	name: string;
	lang: string;
	default: boolean;
}

export function validArticleSlug(slug: string) {
	return slug.length > 0 && slug.length <= 200 && /^[a-z0-9_-]+$/i.test(slug);
}

/** Reject stale, incomplete, remote, or malformed narration before constructing an Audio element. */
export function validateManifest(
	value: unknown,
	slug: string,
	text: string,
	textHash: string,
	version: number
): NarrationManifest | null {
	if (!validArticleSlug(slug) || !value || typeof value !== 'object') return null;
	const data = value as Record<string, unknown>;
	if (
		data.version !== version ||
		data.textHash !== textHash ||
		data.language !== 'en-US' ||
		typeof data.model !== 'string' ||
		typeof data.voice !== 'string' ||
		typeof data.style !== 'string' ||
		!Array.isArray(data.segments) ||
		data.segments.length === 0 ||
		data.segments.length > 1000
	)
		return null;
	const prefix = `/audio/articles/${slug}/`;
	let previousEnd = 0;
	for (const segment of data.segments) {
		if (!segment || typeof segment !== 'object') return null;
		const { src, duration, textStart, textEnd } = segment;
		if (
			typeof src !== 'string' ||
			!src.startsWith(prefix) ||
			!/^[a-f0-9]{64}\.(wav|mp3|ogg)$/.test(src.slice(prefix.length)) ||
			typeof duration !== 'number' ||
			!Number.isFinite(duration) ||
			duration <= 0 ||
			duration > 86_400 ||
			!Number.isInteger(textStart) ||
			!Number.isInteger(textEnd) ||
			textStart < previousEnd ||
			textEnd <= textStart ||
			textEnd > text.length ||
			text.slice(previousEnd, textStart).trim() !== ''
		)
			return null;
		previousEnd = textEnd;
	}
	if (text.slice(previousEnd).trim() !== '') return null;
	return data as unknown as NarrationManifest;
}

export async function readManifest(response: Response, maxBytes = 131_072): Promise<unknown> {
	if (!response.ok || !response.body) throw new Error('Narration unavailable');
	if (Number(response.headers.get('content-length')) > maxBytes)
		throw new Error('Manifest too large');
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let bytes = 0;
	let text = '';
	try {
		while (true) {
			const part = await reader.read();
			if (part.done) break;
			bytes += part.value.byteLength;
			if (bytes > maxBytes) throw new Error('Manifest too large');
			text += decoder.decode(part.value, { stream: true });
		}
		text += decoder.decode();
		return JSON.parse(text);
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

export function chooseDeviceVoice<T extends DeviceVoice>(
	voices: T[],
	savedURI = '',
	language = 'en-US'
): T | null {
	const saved = voices.find((voice) => voice.voiceURI === savedURI);
	if (saved) return saved;
	const target = language.toLowerCase();
	const languageFamily = target.split('-')[0];
	const candidates = voices.filter(
		(voice) => voice.lang.toLowerCase().split('-')[0] === languageFamily
	);
	// Labels are a preference only; they cannot establish perceptual quality across platforms.
	const score = (voice: T) =>
		(voice.lang.toLowerCase() === target ? 100 : 0) +
		(/natural|neural|enhanced|premium/i.test(voice.name) ? 20 : 0) +
		(/Samantha|Aria|Jenny|Ava|Andrew|Guy|Google US English/i.test(voice.name) ? 10 : 0) +
		(voice.default ? 1 : 0);
	return candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export interface SpeechChunk {
	text: string;
	start: number;
	end: number;
}

/** Short browser utterances preserve the existing long-article interruption recovery. */
export function browserChunks(text: string, maxLength = 180): SpeechChunk[] {
	const result: SpeechChunk[] = [];
	let start = 0;
	while (start < text.length) {
		while (start < text.length && /\s/u.test(text[start])) start++;
		if (start >= text.length) break;
		let end = Math.min(text.length, start + maxLength);
		if (end < text.length) {
			const candidate = text.slice(start, end + 1);
			const sentenceEnds = [...candidate.matchAll(/[.!?।][\s]/gu)];
			const sentenceEnd = sentenceEnds.at(-1)?.index;
			const breakAt = sentenceEnd !== undefined ? sentenceEnd + 1 : candidate.lastIndexOf(' ');
			if (breakAt >= maxLength * 0.35) end = start + breakAt;
			// Never split a surrogate pair, even for text without spaces.
			if (/[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
		}
		const part = text.slice(start, end).trimEnd();
		result.push({ text: part, start, end: start + part.length });
		start = end;
	}
	return result;
}

export function timelinePosition(segments: NarrationSegment[], position: number) {
	const total = segments.reduce((sum, segment) => sum + segment.duration, 0);
	let remaining = Math.min(Math.max(0, position), total);
	for (let index = 0; index < segments.length; index++) {
		if (remaining < segments[index].duration || index === segments.length - 1)
			return { index, offset: remaining };
		remaining -= segments[index].duration;
	}
	return { index: 0, offset: 0 };
}

let activePlayback: { owner: object; stop: () => void } | undefined;

export function claimPlayback(owner: object, stop: () => void) {
	if (activePlayback?.owner !== owner) activePlayback?.stop();
	activePlayback = { owner, stop };
}

export function releasePlayback(owner: object) {
	if (activePlayback?.owner === owner) activePlayback = undefined;
}
