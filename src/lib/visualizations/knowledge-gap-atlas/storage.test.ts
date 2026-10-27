import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	analysisSignature,
	addSources,
	removeSource,
	deleteProject,
	invalidateAnalysis,
	evidenceWindow,
	sourceSignature,
	mergeCounts,
	mergeEvidence,
	splitText,
	storageError,
	utf8ByteLength
} from './storage';
import { DEFAULT_SETTINGS, type SourceRecord } from './types';

afterEach(() => vi.unstubAllGlobals());

describe('streamed source storage contracts', () => {
	it('preserves every original UTF-16 unit across arbitrarily small chunks', () => {
		const text = 'রৌদ্রের শহর ☀️ A\r\nB\u0301 C𐐀 repeated. '.repeat(20);
		for (let size = 1; size < 60; size++) expect([...splitText(text, size)].join('')).toBe(text);
	});
	it('counts bytes without allocating an encoded copy of the whole string', () => {
		for (const text of ['', 'Calcutta', 'বাংলা', 'A\ud800B', '☀️👨‍👩‍👧‍👦', '\uFEFFhello'])
			expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).byteLength);
	});
	it('merges exact counts while bounding representative evidence independently', () => {
		expect(mergeCounts({ a: 4, b: 3 }, { b: 5, c: 10 })).toEqual({ a: 4, b: 8, c: 10 });
		const evidence = Array.from({ length: 12 }, (_, start) => ({
			sourceId: 'a',
			start,
			end: start + 1
		}));
		expect(mergeEvidence(evidence.slice(0, 4), evidence)).toEqual(evidence.slice(0, 6));
		const reference = { sourceId: 'reference', start: 40, end: 60 };
		expect(mergeEvidence(evidence, [reference])).toContainEqual(reference);
	});
	it('invalidates checkpoints when analytical settings or source content changes', () => {
		const original = analysisSignature(DEFAULT_SETTINGS, []);
		expect(analysisSignature({ ...DEFAULT_SETTINGS, window: 7 }, [])).not.toBe(original);
		expect(analysisSignature({ ...DEFAULT_SETTINGS }, [])).toBe(original);
	});
	it('explains quota failure without suggesting that incomplete work is complete', () => {
		expect(storageError(new DOMException('No space', 'QuotaExceededError'))).toContain(
			'committed data is preserved'
		);
		expect(() => [...splitText('text', 0)]).toThrow('Invalid chunk size');
	});
	it('refuses every source mutation while the same project lock is held', async () => {
		const request = vi.fn(
			async (_key: string, _options: unknown, callback: (lock: null) => Promise<unknown>) =>
				callback(null)
		);
		vi.stubGlobal('navigator', { locks: { request } });
		for (const action of [
			() => addSources('busy-atlas', []),
			() => removeSource('busy-atlas', 'source'),
			() => deleteProject('busy-atlas'),
			() => invalidateAnalysis('busy-atlas')
		])
			await expect(action()).rejects.toThrow('busy in another tab');
		expect(request).toHaveBeenCalledTimes(4);
		expect(request.mock.calls.every(([key]) => key === 'knowledge-gap-atlas:busy-atlas')).toBe(
			true
		);
	});
	it('bounds enormous evidence spans without changing original offsets', () => {
		const ref = { sourceId: 's', start: 2000, end: 1_000_000 };
		expect(evidenceWindow(ref, 2_000_000)).toEqual({
			sourceStart: 1840,
			length: 4000,
			clipped: true
		});
		expect(ref.end).toBe(1_000_000);
		expect(evidenceWindow({ sourceId: 's', start: 100, end: 110 }, 200)).toEqual({
			sourceStart: 0,
			length: 200,
			clipped: false
		});
		expect(() => evidenceWindow({ sourceId: 's', start: 0, end: 300 }, 200)).toThrow('outside');
	});
	it('matches source snapshots independently of ordering and detects corpus mutations', () => {
		const source: SourceRecord = {
			id: 'a',
			projectId: 'p',
			name: 'One',
			role: 'target',
			bytes: 10,
			chars: 10,
			words: 2,
			processedBytes: 10,
			status: 'complete',
			hash: 'fingerprint'
		};
		const second = { ...source, id: 'b' };
		expect(sourceSignature([source, second])).toBe(sourceSignature([second, source]));
		expect(sourceSignature([source])).not.toBe(sourceSignature([source, second]));
		expect(sourceSignature([source])).not.toBe(sourceSignature([{ ...source, hash: 'changed' }]));
	});
});
