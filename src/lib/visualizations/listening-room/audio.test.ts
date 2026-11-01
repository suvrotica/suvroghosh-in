import { describe, expect, it } from 'vitest';
import { LocalAudioEngine } from './audio';
import {
	EQ_FREQUENCIES,
	createDemoWav,
	dbToGain,
	eqResponseDb,
	gainToDb,
	headroomDb,
	measureSamples,
	normalizeAudioSettings,
	stereoMatrix
} from './dsp';

describe('local audio signal calculations', () => {
	it('bounds corrupt saved settings and fills missing bands without sharing arrays', () => {
		const bad = normalizeAudioSettings({
			eq: [NaN, 99, -99],
			volume: Infinity,
			width: -2,
			balance: 5
		});
		expect(bad.eq).toEqual([0, 6, -6, 0, 0, 0, 0, 0, 0, 0]);
		expect(bad.volume).toBe(70);
		expect(bad.width).toBe(0);
		expect(bad.balance).toBe(1);
		const a = normalizeAudioSettings();
		a.eq[0] = 6;
		expect(normalizeAudioSettings().eq[0]).toBe(0);
	});

	it('treats malformed JSON-shaped preferences as neutral defaults without coercion', () => {
		const defaults = normalizeAudioSettings();
		for (const value of [null, undefined, false, true, 7, 'loud', [], [1, 2, 3]]) {
			expect(normalizeAudioSettings(value)).toEqual(defaults);
		}
		expect(
			normalizeAudioSettings({
				eq: { 0: 6 },
				volume: '100',
				width: null,
				trimDb: [],
				balance: {},
				mono: 'true',
				bypass: 1
			})
		).toEqual(defaults);
		expect(normalizeAudioSettings({ eq: [null, '6', {}, [], Infinity, -Infinity] }).eq).toEqual(
			defaults.eq
		);
	});

	it('preserves stereo identity, mono summing and attenuation-only balance', () => {
		expect(stereoMatrix(1)).toEqual({ ll: 1, lr: 0, rl: 0, rr: 1 });
		expect(stereoMatrix(1.25, 0, true)).toEqual({ ll: 0.5, lr: 0.5, rl: 0.5, rr: 0.5 });
		expect(stereoMatrix(1, -1)).toEqual({ ll: 1, lr: 0, rl: 0, rr: 0 });
		expect(stereoMatrix(1, 1)).toEqual({ ll: 0, lr: 0, rl: 0, rr: 1 });
		const wide = stereoMatrix(1.25);
		expect(wide.ll + wide.lr).toBe(1); // Center content retains unity.
		expect(wide.ll - wide.lr).toBe(1.25); // Side content receives width gain.
	});

	it('has a flat neutral response and the stated gain at an isolated band center', () => {
		expect(eqResponseDb(Array(10).fill(0), 48000).every((value) => value === 0)).toBe(true);
		for (const gain of [-6, 6]) {
			const eq = Array(10).fill(0);
			eq[5] = gain;
			expect(eqResponseDb(eq, 48000, [1000])[0]).toBeCloseTo(gain, 8);
		}
	});

	it('compensates combined EQ/width/trim boosts with a margin and honours bypass', () => {
		const neutral = normalizeAudioSettings();
		expect(headroomDb(neutral)).toBe(0);
		const boosted = normalizeAudioSettings({
			eq: EQ_FREQUENCIES.map(() => 6),
			width: 1.25,
			trimDb: 6
		});
		const headroom = headroomDb(boosted);
		const dense = Array.from({ length: 2048 }, (_, i) => 20 * 1000 ** (i / 2047));
		const maximum = Math.max(...eqResponseDb(boosted.eq, 48000, dense));
		expect(maximum + gainToDb(1.25) + boosted.trimDb + headroom).toBeLessThan(-0.95);
		expect(headroomDb({ ...boosted, bypass: true })).toBe(0);
		expect(headroomDb(normalizeAudioSettings({ trimDb: -6 }))).toBe(0);
	});

	it('measures real sample peaks and RMS without hiding overload', () => {
		expect(measureSamples(new Float32Array([1, -1, 1, -1]))).toEqual({ peak: 1, rms: 1 });
		expect(measureSamples(new Float32Array([0, 0]))).toEqual({ peak: 0, rms: 0 });
		expect(measureSamples(new Float32Array([1.25])).peak).toBe(1.25);
		expect(dbToGain(-6.020599913)).toBeCloseTo(0.5, 8);
		expect(gainToDb(0)).toBe(-160);
	});

	it('does not create browser audio resources until resume is requested', async () => {
		const element = { pause() {} } as HTMLAudioElement;
		const engine = new LocalAudioEngine(element);
		engine.setSettings(normalizeAudioSettings({ eq: [6] }));
		expect(engine.getSnapshot().sampleRate).toBe(0);
		expect(engine.getSnapshot().spectrum.every((value) => value === 0)).toBe(true);
		engine.destroy();
		engine.destroy();
		await expect(engine.resume()).rejects.toThrow('closed');
	});

	it('creates a bounded twelve-second stereo WAV with distinct channels and no clipping', async () => {
		const blob = createDemoWav();
		const view = new DataView(await blob.arrayBuffer());
		expect(blob.type).toBe('audio/wav');
		expect(view.byteLength).toBe(44 + 12 * 44100 * 4);
		expect(view.getUint16(22, true)).toBe(2);
		expect(view.getUint32(24, true)).toBe(44100);
		let peak = 0;
		let different = 0;
		for (let offset = 44; offset < view.byteLength; offset += 4) {
			const left = view.getInt16(offset, true);
			const right = view.getInt16(offset + 2, true);
			peak = Math.max(peak, Math.abs(left), Math.abs(right));
			if (left !== right) different++;
		}
		expect(peak).toBeGreaterThan(5000);
		expect(peak).toBeLessThan(20000);
		expect(different).toBeGreaterThan(100000);
	});
});
