import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	ARP_STEP_COUNT,
	cloneSynthPatch,
	decodePatchHash,
	encodePatchHash,
	FACTORY_PRESETS,
	getFactoryPreset,
	loadUserPatches,
	MAX_PATCH_HASH_LENGTH,
	MAX_USER_PATCHES,
	PATCH_BOUNDS,
	PATCH_CATEGORIES,
	saveUserPatches,
	SYNTH_PATCH_VERSION,
	SYNTH_STORAGE_KEY,
	validateSynthPatch,
	type StorageLike,
	type SynthPatch
} from './synth-patch';

describe('synth-patch schema, presets, serialization, and storage', () => {
	it('runs cleanly in Node without browser globals', () => {
		expect(typeof window).toBe('undefined');
		expect(typeof localStorage).toBe('undefined');
		expect(loadUserPatches()).toEqual([]);
		expect(saveUserPatches([FACTORY_PRESETS[0]])).toBe(false);
	});

	it('exports 14 deeply frozen factory presets covering all categories and Preset 01 invariants', () => {
		expect(FACTORY_PRESETS).toHaveLength(14);
		expect(Object.isFrozen(FACTORY_PRESETS)).toBe(true);

		const categories = new Set(FACTORY_PRESETS.map((p) => p.category));
		for (const cat of PATCH_CATEGORIES) expect(categories.has(cat)).toBe(true);

		const ids = new Set(FACTORY_PRESETS.map((p) => p.id));
		const names = new Set(FACTORY_PRESETS.map((p) => p.name));
		expect(ids.size).toBe(14);
		expect(names.size).toBe(14);

		for (const preset of FACTORY_PRESETS) {
			expect(preset.version).toBe(SYNTH_PATCH_VERSION);
			expect(Object.isFrozen(preset)).toBe(true);
			expect(Object.isFrozen(preset.osc1)).toBe(true);
			expect(Object.isFrozen(preset.modMatrix)).toBe(true);
			expect(preset.modMatrix.every(Object.isFrozen)).toBe(true);
			expect(Object.isFrozen(preset.arpSeq.steps)).toBe(true);
			expect(preset.arpSeq.steps.every(Object.isFrozen)).toBe(true);
			expect(preset.arpSeq.steps).toHaveLength(ARP_STEP_COUNT);

			const hash = encodePatchHash(preset);
			expect(hash.startsWith('#patch=')).toBe(true);
			expect(hash.length).toBeLessThanOrEqual(MAX_PATCH_HASH_LENGTH);
			const decoded = decodePatchHash(hash);
			expect(decoded.ok).toBe(true);
			expect(decoded.patch).toEqual(preset);
		}

		// Preset 01 Forgiving Grand browser audio audit invariants (5 oscillators, 0 LFO, bypassed FX)
		const grand = FACTORY_PRESETS[0];
		expect(grand.id).toBe('01-forgiving-grand');
		expect(grand.name).toBe('01 Forgiving Grand');
		expect(grand.osc1.wave).toBe('5-partial');
		expect(grand.mix).toEqual({ osc1: 1, osc2: 0, sub: 0, noise: 0 });
		expect(grand.lfo1.depth).toBe(0);
		expect(grand.lfo2.depth).toBe(0);
		expect(grand.modMatrix.flat().every((v) => v === 0)).toBe(true);
		expect(grand.fx.chorus.bypass).toBe(true);
		expect(grand.fx.chorus.mix).toBe(0);
		expect(grand.fx.crush.bypass).toBe(true);
		expect(grand.fx.crush.mix).toBe(0);
		expect(grand.fx.delay.bypass).toBe(true);
		expect(grand.fx.delay.mix).toBe(0);
		expect(grand.fx.reverb).toEqual({ room: 'off', mix: 0 });
		expect(grand.voiceMode).toBe('poly');
		expect(grand.glideMs).toBe(0);
		expect(grand.chordMemory).toBe('off');
		expect(grand.arpSeq.engine).toBe('off');
	});

	it('looks up factory presets by index or id and returns mutable clones', () => {
		const p0 = getFactoryPreset(0);
		const p2 = getFactoryPreset('02-electric-tines');
		const fallback = getFactoryPreset('non-existent');
		expect(p0).toEqual(FACTORY_PRESETS[0]);
		expect(p2).toEqual(FACTORY_PRESETS[1]);
		expect(fallback).toEqual(FACTORY_PRESETS[0]);
		expect(Object.isFrozen(p0)).toBe(false);
		p0.name = 'Modified';
		expect(FACTORY_PRESETS[0].name).toBe('01 Forgiving Grand');
	});

	it('strictly excludes session fields and prevents prototype pollution', () => {
		const rawWithSession = {
			...cloneSynthPatch(FACTORY_PRESETS[0]),
			volume: 0.25,
			muted: true,
			audioEnabled: true,
			midiEnabled: true,
			harmonicMode: 'wander',
			extraUnknown: 'ignored'
		};
		const cleaned = validateSynthPatch(rawWithSession) as unknown as Record<string, unknown>;
		for (const forbidden of [
			'volume',
			'muted',
			'audioEnabled',
			'midiEnabled',
			'harmonicMode',
			'extraUnknown'
		]) {
			expect(Object.prototype.hasOwnProperty.call(cleaned, forbidden)).toBe(false);
		}

		const pollutedJson =
			'{"version":1,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted2":true}},"volume":0.5}';
		const parsedPolluted: unknown = JSON.parse(pollutedJson);
		validateSynthPatch(parsedPolluted);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		expect(({} as Record<string, unknown>).polluted2).toBeUndefined();

		const hash = encodePatchHash(cleaned as unknown as SynthPatch);
		const decoded = decodePatchHash(hash).patch as unknown as Record<string, unknown>;
		expect(Object.prototype.hasOwnProperty.call(decoded, 'volume')).toBe(false);
	});

	it('clamps out-of-range numbers, swing [0, 1], and arbitrary fuzz inputs safely', () => {
		const extreme = validateSynthPatch({
			id: '  \u0000bad\u001f-id  ',
			name: 'x'.repeat(100),
			osc1: { oct: 99, semi: -99, fine: 999, shape: -5, fmRatio: 99 },
			osc2: { oct: -9, semi: 99, fine: -999, shape: 9, ringMod: 'yes' },
			sub: { oct: -5 },
			mix: { osc1: 2, osc2: -1, sub: NaN, noise: Infinity },
			filter: { cutoffHz: 50000, resonance: -10, drive: 5, envAmt: -3, keyTrack: 2 },
			ampEnv: { attack: 0, decay: 99, sustain: -1, release: 99 },
			fx: {
				crush: { bitDepth: 1, toneHz: 100 },
				delay: { timeMs: 10, feedback: 0.99, toneHz: 50000 }
			},
			unisonVoices: 3,
			unisonSpreadCt: 100,
			glideMs: 5000,
			arpSeq: {
				octaves: 9,
				gate: 0,
				swing: 1,
				bpm: 999,
				steps: [{ active: true, note: 200, noteOffset: -99, gate: 5, tie: true, accent: true }]
			}
		});

		expect(extreme.id).toBe('bad-id');
		expect(extreme.name).toHaveLength(PATCH_BOUNDS.maxTextLength);
		expect(extreme.osc1.oct).toBe(2);
		expect(extreme.osc1.semi).toBe(-12);
		expect(extreme.osc1.fine).toBe(50);
		expect(extreme.osc1.shape).toBe(0);
		expect(extreme.osc1.fmRatio).toBe(8);
		expect(extreme.osc2.oct).toBe(-1);
		expect(extreme.osc2.semi).toBe(12);
		expect(extreme.osc2.fine).toBe(-50);
		expect(extreme.osc2.shape).toBe(1);
		expect(extreme.osc2.ringMod).toBe(false);
		expect(extreme.sub.oct).toBe(-2);
		expect(extreme.mix).toEqual({ osc1: 1, osc2: 0, sub: 0, noise: 0 });
		expect(extreme.filter.cutoffHz).toBe(18000);
		expect(extreme.filter.resonance).toBe(0.5);
		expect(extreme.filter.drive).toBe(1);
		expect(extreme.filter.envAmt).toBe(-1);
		expect(extreme.filter.keyTrack).toBe(1);
		expect(extreme.fx.crush.bitDepth).toBe(3);
		expect(extreme.fx.delay.feedback).toBe(0.88);
		expect(extreme.unisonVoices).toBe(3);
		expect(extreme.arpSeq.octaves).toBe(3);
		expect(extreme.arpSeq.gate).toBe(0.05);
		expect(extreme.arpSeq.swing).toBe(1);
		expect(extreme.arpSeq.bpm).toBe(220);
		expect(extreme.arpSeq.steps).toHaveLength(16);
		expect(extreme.arpSeq.steps[0]).toEqual({
			active: true,
			note: 127,
			noteOffset: -24,
			gate: 1,
			tie: true,
			accent: true
		});
		expect(extreme.arpSeq.steps[1].note).toBeNull();

		fc.assert(
			fc.property(fc.anything(), (arbitrary) => {
				const p = validateSynthPatch(arbitrary);
				expect(p.version).toBe(1);
				expect(p.arpSeq.steps).toHaveLength(16);
				expect(p.arpSeq.swing).toBeGreaterThanOrEqual(0);
				expect(p.arpSeq.swing).toBeLessThanOrEqual(1);
				expect(p.fx.delay.feedback).toBeLessThanOrEqual(0.88);
				expect(Number.isFinite(p.filter.cutoffHz)).toBe(true);
			}),
			{ numRuns: 100 }
		);
	});

	it('keeps worst-case populated patch hash strictly <= 4096 chars and roundtrips non-null step notes', () => {
		const worst = cloneSynthPatch(FACTORY_PRESETS[13]);
		worst.id = 'worst-case-id-0123456789-abcdefghijklmnopqrstuv';
		worst.name = 'Worst Case Patch 🎹✨ 0123456789 ABCDEFGHIJKLMN';
		worst.osc1.fine = -49.1234;
		worst.osc1.shape = 0.8765;
		worst.osc1.fmRatio = 7.6543;
		worst.osc2.fine = 49.9876;
		worst.osc2.shape = 0.4321;
		worst.filter.cutoffHz = 17999.1234;
		worst.filter.resonance = 19.8765;
		worst.filter.drive = 0.9876;
		worst.filter.envAmt = -0.9876;
		worst.filter.keyTrack = 0.6543;
		worst.ampEnv = { attack: 3.9876, decay: 5.9876, sustain: 0.9876, release: 5.9876 };
		worst.filterEnv = { attack: 3.1234, decay: 5.1234, sustain: 0.5432, release: 5.4321 };
		worst.modMatrix = [
			[-0.9876, 0.8765, -0.7654, 0.6543, -0.5432],
			[0.9876, -0.8765, 0.7654, -0.6543, 0.5432],
			[-0.1234, 0.2345, -0.3456, 0.4567, -0.5678],
			[0.1234, -0.2345, 0.3456, -0.4567, 0.5678],
			[-0.9999, 0.9999, -0.8888, 0.8888, -0.7777]
		];
		worst.arpSeq.swing = 0.9876;
		worst.arpSeq.gate = 0.9876;
		worst.arpSeq.steps = worst.arpSeq.steps.map((_, idx) => ({
			active: true,
			note: 36 + idx,
			noteOffset: -24,
			gate: 0.9876,
			tie: true,
			accent: true
		}));

		const hash = encodePatchHash(worst);
		expect(hash.length).toBeLessThanOrEqual(MAX_PATCH_HASH_LENGTH);
		const decoded = decodePatchHash(hash);
		expect(decoded.ok).toBe(true);
		expect(decoded.patch.arpSeq.steps[0].note).toBe(36);
		expect(decoded.patch.arpSeq.steps[15].note).toBe(51);
		expect(decoded.patch.name).toBe(worst.name.slice(0, PATCH_BOUNDS.maxTextLength));
	});

	it('keeps multi-byte UTF-8, emoji, and quote-escaped worst-case hashes well under 4096 chars and roundtrips losslessly', () => {
		const base = cloneSynthPatch(FACTORY_PRESETS[13]);
		base.osc1.fine = -49.1234;
		base.osc1.shape = 0.8765;
		base.osc1.fmRatio = 7.6543;
		base.osc2.fine = 49.9876;
		base.osc2.shape = 0.4321;
		base.mix = { osc1: 0.9876, osc2: 0.8765, sub: 0.7654, noise: 0.6543 };
		base.filter.cutoffHz = 17999.1234;
		base.filter.resonance = 19.8765;
		base.filter.drive = 0.9876;
		base.filter.envAmt = -0.9876;
		base.filter.keyTrack = 0.6543;
		base.ampEnv = { attack: 3.9876, decay: 5.9876, sustain: 0.9876, release: 5.9876 };
		base.filterEnv = { attack: 3.1234, decay: 5.1234, sustain: 0.5432, release: 5.4321 };
		base.lfo1 = {
			wave: 'sh',
			rateHz: 24.1234,
			syncDiv: '1/16',
			depth: 0.9876,
			bpmSync: true,
			keySync: true
		};
		base.lfo2 = {
			wave: 'square',
			rateHz: 23.4567,
			syncDiv: '4/1',
			depth: 0.8765,
			bpmSync: true,
			keySync: true
		};
		base.modMatrix = [
			[-0.9876, 0.8765, -0.7654, 0.6543, -0.5432],
			[0.9876, -0.8765, 0.7654, -0.6543, 0.5432],
			[-0.1234, 0.2345, -0.3456, 0.4567, -0.5678],
			[0.1234, -0.2345, 0.3456, -0.4567, 0.5678],
			[-0.9999, 0.9999, -0.8888, 0.8888, -0.7777]
		];
		base.fx = {
			chorus: { bypass: false, rateHz: 4.1234, depth: 0.9876, mix: 0.8765 },
			crush: { bypass: false, drive: 0.9876, bitDepth: 3, toneHz: 15999.1234, mix: 0.8765 },
			delay: {
				bypass: false,
				timeMs: 899.1234,
				bpmSync: true,
				syncDiv: '1/16',
				feedback: 0.8765,
				toneHz: 15999.1234,
				mix: 0.9876
			},
			reverb: { room: 'canyon', mix: 0.9876 }
		};
		base.voiceMode = 'unison';
		base.unisonVoices = 3;
		base.unisonSpreadCt = 39.1234;
		base.glideMs = 599.1234;
		base.chordMemory = 'latch';
		base.arpSeq = {
			engine: 'seq',
			arpMode: 'up-down',
			octaves: 3,
			division: '1/16t',
			gate: 0.9876,
			swing: 0.9876,
			bpm: 220,
			hold: true,
			steps: Array.from({ length: ARP_STEP_COUNT }, () => ({
				active: true,
				note: 127,
				noteOffset: -24,
				gate: 0.9876,
				tie: true,
				accent: true
			}))
		};

		const cases: Array<[string, string]> = [
			['ক'.repeat(48), 'খ'.repeat(48)],
			['中'.repeat(48), '龍'.repeat(48)],
			['🎹'.repeat(24), '🌊'.repeat(24)],
			['"'.repeat(48), '\\'.repeat(48)]
		];

		for (const [id, name] of cases) {
			const p = validateSynthPatch({ ...base, id, name });
			const hash = encodePatchHash(p);
			expect(hash.length).toBeLessThanOrEqual(2500);
			expect(hash.length).toBeLessThanOrEqual(MAX_PATCH_HASH_LENGTH);
			const decoded = decodePatchHash(hash);
			expect(decoded.ok).toBe(true);
			expect(decoded.patch).toEqual(p);
		}
	});

	it('truncates text without splitting surrogate pairs, strips lone surrogates, normalizes -0, and survives hostile getters/proxies', () => {
		const splitEmoji = validateSynthPatch({
			id: 'a'.repeat(47) + '🎹',
			name: 'x'.repeat(46) + '🌊' + 'z'
		});
		expect(splitEmoji.id).toBe('a'.repeat(47));
		expect(splitEmoji.id.length).toBe(47);
		expect(splitEmoji.name).toBe('x'.repeat(46) + '🌊');
		expect(splitEmoji.name.length).toBe(48);

		const loneSurrogates = validateSynthPatch({
			id: '\ud83c'.repeat(10),
			name: 'ok-\ud83c-mid-\udfff-end'
		});
		expect(loneSurrogates.id).toBe(FACTORY_PRESETS[0].id);
		expect(loneSurrogates.name).toBe('ok--mid--end');
		expect(decodePatchHash(encodePatchHash(loneSurrogates)).ok).toBe(true);

		const negZero = validateSynthPatch({
			osc1: { semi: -0.1, fine: -0 },
			osc2: { semi: -0, fine: -0 },
			filter: { drive: -0, envAmt: -0, keyTrack: -0 },
			modMatrix: [[-0, -0, 0, 0, 0]],
			arpSeq: { swing: -0, steps: [{ noteOffset: -0.2 }] }
		});
		expect(Object.is(negZero.osc1.semi, -0)).toBe(false);
		expect(Object.is(negZero.osc1.fine, -0)).toBe(false);
		expect(Object.is(negZero.osc2.semi, -0)).toBe(false);
		expect(Object.is(negZero.filter.envAmt, -0)).toBe(false);
		expect(Object.is(negZero.modMatrix[0][0], -0)).toBe(false);
		expect(Object.is(negZero.arpSeq.swing, -0)).toBe(false);
		expect(Object.is(negZero.arpSeq.steps[0].noteOffset, -0)).toBe(false);

		const roundtripped = decodePatchHash(encodePatchHash(negZero));
		expect(roundtripped.ok).toBe(true);
		expect(Object.is(roundtripped.patch.osc1.semi, 0)).toBe(true);
		expect(Object.is(roundtripped.patch.osc1.fine, 0)).toBe(true);
		expect(Object.is(roundtripped.patch.filter.envAmt, 0)).toBe(true);

		const hostileGetters = {
			get osc1() {
				throw new Error('getter boom');
			}
		};
		expect(validateSynthPatch(hostileGetters)).toEqual(FACTORY_PRESETS[0]);

		const hostileProxy = new Proxy(
			{},
			{
				get() {
					throw new Error('proxy get trap');
				},
				getOwnPropertyDescriptor() {
					throw new Error('proxy descriptor trap');
				}
			}
		);
		expect(validateSynthPatch(hostileProxy)).toEqual(FACTORY_PRESETS[0]);
	});

	it('handles malformed, oversized, non-UTF8, and wrong-version #patch= hashes gracefully', () => {
		const validNoHashPrefix = encodePatchHash(FACTORY_PRESETS[2]).slice(1);
		expect(decodePatchHash(validNoHashPrefix).ok).toBe(true);

		// Legacy verbose v1 JSON payload still decodes cleanly
		const legacyJson = JSON.stringify({
			version: SYNTH_PATCH_VERSION,
			id: 'legacy-v1',
			name: 'Legacy V1',
			osc1: { wave: 'saw', semi: -3 }
		});
		const legacyB64 = Buffer.from(legacyJson, 'utf-8').toString('base64url');
		const legacyDecoded = decodePatchHash(`#patch=${legacyB64}`);
		expect(legacyDecoded.ok).toBe(true);
		expect(legacyDecoded.patch.id).toBe('legacy-v1');
		expect(legacyDecoded.patch.osc1.wave).toBe('saw');
		expect(legacyDecoded.patch.osc1.semi).toBe(-3);

		expect(decodePatchHash('')).toMatchObject({ ok: false });
		expect(decodePatchHash('#patch=')).toMatchObject({ ok: false });
		expect(decodePatchHash('#other=abc')).toMatchObject({ ok: false });
		expect(decodePatchHash('#patch=' + 'A'.repeat(MAX_PATCH_HASH_LENGTH))).toMatchObject({
			ok: false
		});
		expect(decodePatchHash('#patch=!!!invalid!!!')).toMatchObject({ ok: false });
		expect(decodePatchHash('#patch=A')).toMatchObject({ ok: false }); // len % 4 === 1
		expect(decodePatchHash('#patch=__8')).toMatchObject({ ok: false }); // invalid UTF-8 bytes
		expect(decodePatchHash('#patch=bm90LWpzb24')).toMatchObject({ ok: false }); // "not-json"
		expect(decodePatchHash('#patch=WzEsMiwzXQ')).toMatchObject({ ok: false }); // [1,2,3]
		expect(decodePatchHash('#patch=eyJ2ZXJzaW9uIjo5OX0')).toMatchObject({ ok: false }); // {"version":99}
	});

	it('loads and saves user patches safely via StorageLike and enforces MAX_USER_PATCHES', () => {
		const mem = new Map<string, string>();
		const store: StorageLike = {
			getItem: (k) => mem.get(k) ?? null,
			setItem: (k, v) => {
				mem.set(k, v);
			}
		};

		const many = Array.from({ length: MAX_USER_PATCHES + 5 }, (_, i) => {
			const p = cloneSynthPatch(FACTORY_PRESETS[i % FACTORY_PRESETS.length]);
			p.id = `user-${i}`;
			return p;
		});
		expect(saveUserPatches(many, store)).toBe(true);
		const loaded = loadUserPatches(store);
		expect(loaded).toHaveLength(MAX_USER_PATCHES);
		expect(loaded[0].id).toBe('user-0');

		// Corrupted JSON recovers cleanly
		mem.set(SYNTH_STORAGE_KEY, '{not-valid-json');
		expect(loadUserPatches(store)).toEqual([]);
		mem.set(SYNTH_STORAGE_KEY, '{"not":"array"}');
		expect(loadUserPatches(store)).toEqual([]);

		// SecurityError / QuotaExceededError safety
		const throwingStore: StorageLike = {
			getItem: () => {
				throw new Error('SecurityError');
			},
			setItem: () => {
				throw new Error('QuotaExceededError');
			}
		};
		expect(loadUserPatches(throwingStore)).toEqual([]);
		expect(saveUserPatches([FACTORY_PRESETS[0]], throwingStore)).toBe(false);
	});
});
