import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	browserChunks,
	chooseDeviceVoice,
	claimPlayback,
	readManifest,
	releasePlayback,
	timelinePosition,
	validArticleSlug,
	validateManifest
} from './playback';

const hash = 'a'.repeat(64);
const text = 'First paragraph.\n\nSecond paragraph.';
const manifest = () => ({
	version: 1,
	textHash: hash,
	language: 'en-US',
	model: 'test-model',
	voice: 'test-voice',
	style: 'warm',
	segments: [
		{ src: `/audio/articles/test/${'b'.repeat(64)}.wav`, duration: 10, textStart: 0, textEnd: 16 },
		{
			src: `/audio/articles/test/${'c'.repeat(64)}.wav`,
			duration: 20,
			textStart: 18,
			textEnd: text.length
		}
	]
});
const owner = {};
afterEach(() => releasePlayback(owner));

describe('saved narration validation', () => {
	it('accepts complete, matching same-origin article audio', () => {
		expect(validateManifest(manifest(), 'test', text, hash, 1)).not.toBeNull();
		expect(validArticleSlug('democracy_on_installments')).toBe(true);
		expect(validArticleSlug('-a-read-this-first')).toBe(true);
		expect(validArticleSlug('../test')).toBe(false);
	});
	it('rejects remote files, traversal, stale text, language mismatches, and empty audio', () => {
		for (const src of [
			'https://example.com/audio.wav',
			['/audio/articles/test/', '../secret.wav'].join(''),
			'/audio/articles/another/' + hash + '.wav'
		]) {
			const input = manifest();
			input.segments[0].src = src;
			expect(validateManifest(input, 'test', text, hash, 1)).toBeNull();
		}
		expect(validateManifest(manifest(), 'test', text, 'wrong', 1)).toBeNull();
		expect(
			validateManifest({ ...manifest(), language: 'en-IN' }, 'test', text, hash, 1)
		).toBeNull();
		expect(validateManifest({ ...manifest(), segments: [] }, 'test', text, hash, 1)).toBeNull();
	});
	it('requires complete text coverage with only whitespace gaps and sane durations', () => {
		const incomplete = manifest();
		incomplete.segments.pop();
		expect(validateManifest(incomplete, 'test', text, hash, 1)).toBeNull();
		const gap = manifest();
		gap.segments[1].textStart++;
		expect(validateManifest(gap, 'test', text, hash, 1)).toBeNull();
		const overlap = manifest();
		overlap.segments[1].textStart = 1;
		expect(validateManifest(overlap, 'test', text, hash, 1)).toBeNull();
		for (const duration of [NaN, Infinity, 0, -2, 100_000]) {
			const bad = manifest();
			bad.segments[0].duration = duration;
			expect(validateManifest(bad, 'test', text, hash, 1)).toBeNull();
		}
	});
	it('limits the actual streamed manifest bytes even without a content-length', async () => {
		await expect(readManifest(new Response(JSON.stringify({ ready: true })))).resolves.toEqual({
			ready: true
		});
		await expect(readManifest(new Response('x'.repeat(100)), 20)).rejects.toThrow(
			'Manifest too large'
		);
		await expect(readManifest(new Response('broken'))).rejects.toThrow();
		await expect(readManifest(new Response('missing', { status: 404 }))).rejects.toThrow(
			'Narration unavailable'
		);
	});
	it('maps seeking to segment boundaries and clamps endpoints', () => {
		const segments = manifest().segments;
		expect(timelinePosition(segments, 9)).toEqual({ index: 0, offset: 9 });
		expect(timelinePosition(segments, 10)).toEqual({ index: 1, offset: 0 });
		expect(timelinePosition(segments, 35)).toEqual({ index: 1, offset: 20 });
		expect(timelinePosition(segments, -20)).toEqual({ index: 0, offset: 0 });
	});
});

describe('device fallback', () => {
	it('prefers a US voice over the first available accent and honors an available saved voice', () => {
		const voices = [
			{ voiceURI: 'india', name: 'Google India', lang: 'en-IN', default: true },
			{ voiceURI: 'us-basic', name: 'US basic', lang: 'en-US', default: false },
			{ voiceURI: 'us-natural', name: 'Aria Natural', lang: 'en-US', default: false },
			{ voiceURI: 'bn', name: 'Bangla', lang: 'bn-IN', default: false }
		];
		expect(chooseDeviceVoice(voices)?.voiceURI).toBe('us-natural');
		expect(chooseDeviceVoice(voices, 'us-basic')?.voiceURI).toBe('us-basic');
		expect(chooseDeviceVoice(voices, 'removed')?.voiceURI).toBe('us-natural');
		expect(chooseDeviceVoice(voices, '', 'bn-BD')?.voiceURI).toBe('bn');
		expect(chooseDeviceVoice([], 'removed')).toBeNull();
	});
	it('covers long Unicode text without truncation or surrogate splitting', () => {
		const input = 'A natural opening. ' + 'বাংলা বাক্য। '.repeat(90) + '🙂'.repeat(200) + ' End.';
		const chunks = browserChunks(input);
		expect(chunks.length).toBeGreaterThan(5);
		expect(
			chunks
				.map((chunk) => chunk.text)
				.join('')
				.replace(/\s/gu, '')
		).toBe(input.replace(/\s/gu, ''));
		for (const chunk of chunks) {
			expect(input.slice(chunk.start, chunk.end)).toBe(chunk.text);
			expect(chunk.text.length).toBeLessThanOrEqual(180);
			expect(chunk.text.isWellFormed()).toBe(true);
		}
	});
	it('stops an earlier owner while old cleanup cannot release the new owner', () => {
		const oldOwner = {};
		const oldStop = vi.fn();
		const stop = vi.fn();
		claimPlayback(oldOwner, oldStop);
		claimPlayback(owner, stop);
		expect(oldStop).toHaveBeenCalledOnce();
		releasePlayback(oldOwner);
		claimPlayback({}, () => {});
		expect(stop).toHaveBeenCalledOnce();
	});
});
