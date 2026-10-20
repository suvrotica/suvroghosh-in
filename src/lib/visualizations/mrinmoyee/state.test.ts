import { describe, expect, it } from 'vitest';
import { CAMERA_VIEWS, DEFAULT_DESIGN, DEFAULT_LOCKS, normalizeDesign, PRESETS } from './config';
import {
	createVariation,
	designFromUrl,
	designToUrl,
	exportDesign,
	importDesign,
	MAX_DESIGN_BYTES,
	readSavedDesigns,
	SAVED_DESIGNS_KEY,
	saveDesigns
} from './state';
import type { SavedDesign } from './types';

describe('Durga Atelier portable state', () => {
	it('round-trips complete designs including Unicode and a chosen camera through links', () => {
		const original = normalizeDesign({
			...PRESETS[4].design,
			presetId: 'custom',
			seed: 'শারদীয়া 🌸',
			camera: CAMERA_VIEWS['three-quarter'],
			lampIntensity: 0.42,
			stage: 3
		});
		const url = new URL(
			'https://suvroghosh.in/blog/visualizations/mrinmoyee-the-durga-atelier?from=gallery#reading'
		);
		const shared = new URL(designToUrl(url, original));
		expect(shared.origin).toBe(url.origin);
		expect(shared.pathname).toBe(url.pathname);
		expect(shared.search).toBe('?from=gallery');
		expect(url.hash).toBe('#reading');
		expect(designFromUrl(shared)).toEqual(original);
		expect(importDesign(exportDesign(original))).toEqual(original);
		expect(original.presetId).toBe('custom');
	});

	it('returns no shared design for invalid, oversize or unsupported fragments', () => {
		for (const fragment of [
			'',
			'#intro',
			'#atelier=%22bad',
			'#atelier=!!!!',
			`#atelier=${'a'.repeat(MAX_DESIGN_BYTES)}`
		]) {
			expect(designFromUrl(new URL(`https://example.com/${fragment}`))).toBeNull();
		}
		const future = new URL('https://example.com/');
		future.hash = `atelier=${btoa(JSON.stringify({ ...DEFAULT_DESIGN, version: 2 }))}`;
		expect(designFromUrl(future)).toBeNull();
		expect(() => designToUrl(new URL('javascript:alert(1)'), DEFAULT_DESIGN)).toThrow('HTTP');
	});

	it('rejects malformed files before restoring bounded supported values', () => {
		expect(() => importDesign('{')).toThrow('valid JSON');
		expect(() => importDesign(JSON.stringify({ version: 7 }))).toThrow('version 1');
		expect(() => importDesign(JSON.stringify({ version: 1, seed: 'incomplete' }))).toThrow(
			'complete'
		);
		expect(() =>
			importDesign(
				JSON.stringify({ ...DEFAULT_DESIGN, camera: { position: [1, 2], target: [0, 0, 0] } })
			)
		).toThrow('complete');
		expect(() => importDesign(' '.repeat(MAX_DESIGN_BYTES + 1))).toThrow('24 KiB');
		expect(() =>
			importDesign(JSON.stringify({ ...DEFAULT_DESIGN, seed: 'দ'.repeat(9000) }))
		).toThrow('24 KiB');
		expect(
			importDesign(JSON.stringify({ ...DEFAULT_DESIGN, headTilt: 999, stage: -5 }))
		).toMatchObject({ headTilt: 8, stage: 0 });
	});

	it('does not let extra properties alter the returned object prototype', () => {
		const text = JSON.stringify(DEFAULT_DESIGN).replace(
			'"version":1',
			'"version":1,"__proto__":{"polluted":true}'
		);
		const design = importDesign(text);
		expect(Object.hasOwn(design, '__proto__')).toBe(false);
		expect(Object.getPrototypeOf(design)).toBe(Object.prototype);
	});
});

describe('Durga Atelier variation locks', () => {
	it('repeats a chosen variation and keeps the complete design when all groups are locked', () => {
		const design = normalizeDesign(PRESETS[3].design);
		const locks = { face: true, pose: true, dress: true, ornament: true, setting: true };
		expect(createVariation(design, locks, 7)).toEqual(design);
		expect(createVariation(design, DEFAULT_LOCKS, 5)).toEqual(
			createVariation(design, DEFAULT_LOCKS, 5)
		);
		expect(createVariation(design, DEFAULT_LOCKS, 5)).not.toEqual(
			createVariation(design, DEFAULT_LOCKS, 6)
		);
		expect(createVariation(design, DEFAULT_LOCKS, 5).presetId).toBe('custom');
	});

	it('keeps face, pose and ornament details while allowing cloth and lighting to change', () => {
		const design = normalizeDesign({
			...DEFAULT_DESIGN,
			eyeScale: 1.07,
			headTilt: 4,
			crownScale: 1.14,
			garland: 'hibiscus'
		});
		const locks = { ...DEFAULT_LOCKS, face: true, pose: true, ornament: true };
		for (let serial = 0; serial < 10; serial++) {
			const variation = createVariation(design, locks, serial);
			for (const field of [
				'face',
				'faceWidth',
				'eyeScale',
				'headTilt',
				'skinColor',
				'pose',
				'crown',
				'crownScale',
				'ornamentDensity',
				'garland',
				'halo',
				'flowers',
				'seed',
				'camera'
			] as const) {
				expect(variation[field]).toEqual(design[field]);
			}
			expect(variation.lightAngle).not.toBe(design.lightAngle);
			expect(normalizeDesign(variation)).toEqual(variation);
		}
	});
});

describe('Durga Atelier device gallery', () => {
	const record = (id = 'first'): SavedDesign => ({
		id,
		name: 'My evening composition',
		savedAt: '2026-10-20T10:00:00.000Z',
		design: normalizeDesign(DEFAULT_DESIGN),
		thumbnail: 'data:image/jpeg;base64,YWJj'
	});

	it('bounds records, filters malformed entries and drops unsafe or oversize thumbnails', () => {
		const records: unknown[] = [
			{ ...record('invalid-date'), savedAt: 'yesterday' },
			{ ...record('impossible-date'), savedAt: '2026-02-31T10:00:00.000Z' },
			{ ...record('bad-id'), id: '__bad id' },
			{ ...record('bad-design'), design: { version: 2 } },
			{
				...record('clean'),
				name: '\u0000 Good design ',
				thumbnail: 'data:image/svg+xml;base64,YWJj'
			},
			{ ...record('large'), thumbnail: `data:image/png;base64,${'A'.repeat(51 * 1024)}` },
			record('duplicate'),
			record('duplicate'),
			...Array.from({ length: 20 }, (_, index) => record(`record-${index}`))
		];
		const gallery = readSavedDesigns({ getItem: () => JSON.stringify(records) });
		expect(gallery).toHaveLength(12);
		expect(gallery[0]).toMatchObject({ id: 'clean', name: 'Good design' });
		expect(gallery[0].thumbnail).toBeUndefined();
		expect(gallery[1].thumbnail).toBeUndefined();
		expect(gallery.filter(({ id }) => id === 'duplicate')).toHaveLength(1);
	});

	it('recovers from denied reads and malformed or oversized storage', () => {
		expect(
			readSavedDesigns({
				getItem: () => {
					throw new Error('Storage unavailable');
				}
			})
		).toEqual([]);
		expect(readSavedDesigns({ getItem: () => '{invalid' })).toEqual([]);
		expect(readSavedDesigns({ getItem: () => ' '.repeat(800 * 1024) })).toEqual([]);
	});

	it('retries a quota-limited save without thumbnails and reports a continuing failure', () => {
		let calls = 0;
		let value = '';
		saveDesigns(
			{
				setItem: (key, text) => {
					expect(key).toBe(SAVED_DESIGNS_KEY);
					calls++;
					if (calls === 1) throw new Error('Quota full');
					value = text;
				}
			},
			[record()]
		);
		expect(calls).toBe(2);
		expect(readSavedDesigns({ getItem: () => value })[0].thumbnail).toBeUndefined();
		expect(readSavedDesigns({ getItem: () => value })[0].design).toEqual(DEFAULT_DESIGN);
		expect(() =>
			saveDesigns(
				{
					setItem: () => {
						throw new Error('Storage denied');
					}
				},
				[record()]
			)
		).toThrow('Storage denied');
	});
});
