import { describe, expect, it, vi } from 'vitest';
import {
	decide,
	DEMO,
	MIDI_MIN,
	MIDI_MAX,
	MODEL_VERSION,
	noteName,
	PRESETS,
	type Chord,
	type DecisionInput,
	type Mode
} from './model';

const pond = PRESETS[0].chords[0];
const defaults: DecisionInput = {
	pitch: 61,
	chord: pond,
	mode: 'nearest',
	temperature: 0.7,
	seed: 20261021,
	eventIndex: 0
};
const modes: Mode[] = ['nearest', 'wander', 'raw'];
const equalTie: Chord = {
	id: 'tie',
	name: 'Equal C/D fixture',
	tones: [
		{ pc: 0, label: 'C', role: 1 },
		{ pc: 2, label: 'D', role: 1 }
	],
	voicing: [60, 62]
};

describe('probabilistic piano authored harmony', () => {
	it('runs server-side and labels middle C unambiguously', () => {
		expect(typeof window).toBe('undefined');
		expect(MODEL_VERSION).toBe('1');
		expect(noteName(48)).toBe('C3');
		expect(noteName(60)).toBe('C4');
		expect(noteName(84)).toBe('C6');
		expect(noteName(61)).toBe('C♯4');
		expect(() => noteName(60.5)).toThrow(RangeError);
	});
	it('uses explicit chord palettes and accompaniment tones, rather than a universal scale', () => {
		expect(PRESETS.map((preset) => preset.chords.map((chord) => chord.name))).toEqual([
			['C6/9'],
			['Dm9', 'G13', 'Cmaj9'],
			['Fmaj9', 'Fm6', 'C6/9']
		]);
		const classes: Record<string, number[]> = {
			c69: [0, 2, 4, 7, 9],
			dm9: [0, 2, 4, 5, 9],
			g13: [2, 4, 5, 7, 9, 11],
			cmaj9: [0, 2, 4, 7, 11],
			fmaj9: [0, 4, 5, 7, 9],
			fm6: [0, 2, 5, 8]
		};
		for (const preset of PRESETS)
			for (const chord of preset.chords) {
				expect(chord.tones.map((tone) => tone.pc).sort((a, b) => a - b)).toEqual(classes[chord.id]);
				expect(chord.voicing.every((pitch) => classes[chord.id].includes(pitch % 12))).toBe(true);
				expect(Object.isFrozen(chord)).toBe(true);
			}
	});
	it('honours preservation, literal nearest, Wander bounds and normalisation exhaustively', () => {
		for (const preset of PRESETS)
			for (const chord of preset.chords) {
				for (let pitch = MIDI_MIN; pitch <= MIDI_MAX; pitch++)
					for (const mode of modes) {
						for (const temperature of [0, 0.000001, 0.7, 2]) {
							const decision = decide({
								...defaults,
								pitch,
								chord,
								mode,
								temperature,
								lastPitch: 72,
								recent: [60, 60, 64],
								active: [60, 61, 66]
							});
							const isEligible = chord.tones.some((tone) => tone.pc === pitch % 12);
							const nearest = Math.min(
								...decision.eligible.map((value) => Math.abs(value - pitch))
							);
							expect(decision.output).toBeGreaterThanOrEqual(MIDI_MIN);
							expect(decision.output).toBeLessThanOrEqual(MIDI_MAX);
							expect(decision.shift).toBe(decision.output - pitch);
							expect(decision.chord).toBe(chord.name);
							expect(
								decision.candidates.every(
									(candidate) =>
										Number.isFinite(candidate.score) &&
										Number.isFinite(candidate.probability) &&
										candidate.probability >= 0 &&
										candidate.probability <= 1
								)
							).toBe(true);
							expect(
								decision.candidates.reduce((sum, candidate) => sum + candidate.probability, 0)
							).toBeCloseTo(1, 12);
							if (mode === 'raw' || isEligible) {
								expect(decision.output).toBe(pitch);
								expect(decision.candidates).toHaveLength(1);
								expect(decision.candidates[0].probability).toBe(1);
							} else {
								expect(decision.eligible).toContain(decision.output);
								const bound = nearest + (mode === 'wander' ? 1 : 0);
								expect(decision.candidates.map((candidate) => candidate.pitch)).toEqual(
									decision.eligible.filter((value) => Math.abs(value - pitch) <= bound)
								);
							}
						}
					}
			}
	});
	it('matches the article C♯4 worked example exactly', () => {
		const decision = decide(defaults);
		expect(decision.candidates.map((candidate) => candidate.pitch)).toEqual([60, 62]);
		expect(decision.candidates[0].score).toBeCloseTo(-1.25, 14);
		expect(decision.candidates[1].score).toBeCloseTo(-1.39, 14);
		expect(decision.candidates[0].probability).toBeCloseTo(0.549833997312478, 12);
		expect(decision.candidates[1].probability).toBeCloseTo(0.450166002687522, 12);
	});
	it('breaks exact score ties at zero temperature by lower MIDI, independent of seed', () => {
		for (const seed of [0, 1, 31, 20261021, 0xffffffff]) {
			const decision = decide({ ...defaults, chord: equalTie, temperature: 0, seed });
			expect(decision.output).toBe(60);
			expect(decision.candidates.map((candidate) => candidate.probability)).toEqual([1, 0]);
		}
	});
	it('allows the extra nearby Wander note but never redirects an eligible leap', () => {
		const nearest = decide({ ...defaults, pitch: 65 });
		const wander = decide({ ...defaults, pitch: 65, mode: 'wander' });
		expect(nearest.candidates.map((candidate) => candidate.pitch)).toEqual([64]);
		expect(wander.candidates.map((candidate) => candidate.pitch)).toEqual([64, 67]);
		expect(
			decide({ ...defaults, pitch: 84, lastPitch: 48, mode: 'wander', active: [83] }).output
		).toBe(84);
	});
	it('bounds voice-leading, repeated-note and active-voice preferences without delaying a press', () => {
		const initial = decide({ ...defaults, chord: equalTie });
		const history = decide({
			...defaults,
			chord: equalTie,
			lastPitch: 84,
			recent: Array(8).fill(60),
			active: Array(16).fill(61)
		});
		expect(history.candidates[0].score - initial.candidates[0].score).toBeCloseTo(
			-0.42 - 0.36 - 0.3,
			12
		);
		expect(history.candidates[1].score - initial.candidates[1].score).toBeCloseTo(-0.42 - 0.3, 12);
		const oldRepeats = decide({
			...defaults,
			chord: equalTie,
			recent: [60, 60, 60, ...Array(8).fill(64)]
		});
		expect(oldRepeats.candidates).toEqual(initial.candidates);
	});
	it('gives raw notes their own honest one-choice outcome while retaining the chord palette', () => {
		const decision = decide({ ...defaults, mode: 'raw' });
		expect(decision.output).toBe(61);
		expect(decision.eligible).not.toContain(61);
		expect(decision.candidates).toEqual([{ pitch: 61, score: 0, probability: 1 }]);
		expect(decision.reason).toContain('outside');
	});
});

describe('seeded sampling and snapshots', () => {
	it('replays identically and changes across seeds when alternatives exist', () => {
		const replay = () =>
			DEMO.map((event, eventIndex) => decide({ ...defaults, pitch: event.pitch, eventIndex }));
		expect(replay()).toEqual(replay());
		const outputs = new Set(
			Array.from({ length: 64 }, (_, seed) => decide({ ...defaults, seed }).output)
		);
		expect([...outputs].sort()).toEqual([60, 62]);
		expect(DEMO).toHaveLength(12);
		expect(DEMO[5].pitch).toBe(DEMO[4].pitch);
		expect(
			DEMO.every(
				(event, i) =>
					event.duration > 0 &&
					event.velocity > 0 &&
					event.velocity <= 1 &&
					(!i || event.at > DEMO[i - 1].at)
			)
		).toBe(true);
	});
	it('agrees empirically with displayed probabilities over 40000 fixed events', () => {
		const expected = decide(defaults).candidates[0].probability;
		let lowerCount = 0;
		const count = 40000;
		for (let eventIndex = 0; eventIndex < count; eventIndex++) {
			if (decide({ ...defaults, eventIndex }).output === 60) lowerCount++;
		}
		// 0.012 is >4.8 standard errors at p≈.55 and n=40000; fixed sequence, no flakiness.
		expect(Math.abs(lowerCount / count - expected)).toBeLessThan(0.012);
	});
	it('never reads the visual/global random stream', () => {
		const before = decide(defaults);
		const random = vi.spyOn(Math, 'random').mockImplementation(() => {
			throw new Error('Visual RNG read');
		});
		try {
			expect(decide(defaults)).toEqual(before);
		} finally {
			random.mockRestore();
		}
	});
	it('copies the note-on harmony snapshot without retaining mutable caller arrays', () => {
		const chord = structuredClone(equalTie);
		const decision = decide({ ...defaults, chord });
		chord.name = 'changed';
		(chord.tones as { pc: number; label: string; role: number }[]).splice(0, 1);
		expect(decision.chord).toBe('Equal C/D fixture');
		expect(decision.eligible).toContain(60);
		expect(decision.candidates.map((candidate) => candidate.pitch)).toEqual([60, 62]);
	});
});

describe('visible validation errors instead of invented harmony', () => {
	it.each([
		{ pitch: 47 },
		{ pitch: 85 },
		{ pitch: 60.5 },
		{ pitch: NaN },
		{ temperature: -0.1 },
		{ temperature: 2.1 },
		{ temperature: NaN },
		{ temperature: Infinity },
		{ seed: -1 },
		{ seed: 1.5 },
		{ seed: 0x100000000 },
		{ eventIndex: -1 },
		{ eventIndex: NaN },
		{ mode: 'unknown' },
		{ lastPitch: 85 },
		{ recent: [NaN] },
		{ active: [40] },
		{ recent: Array(65).fill(60) },
		{ active: Array(65).fill(60) }
	])('rejects malformed settings %j', (patch) => {
		expect(() => decide({ ...defaults, ...patch } as DecisionInput)).toThrow(RangeError);
	});
	it.each([
		null,
		{ ...equalTie, name: '' },
		{ ...equalTie, tones: [] },
		{ ...equalTie, tones: [{ pc: -1, label: 'bad', role: 1 }] },
		{ ...equalTie, tones: [{ pc: 12, label: 'bad', role: 1 }] },
		{ ...equalTie, tones: [{ pc: 0.5, label: 'bad', role: 1 }] },
		{ ...equalTie, tones: [{ pc: 0, label: 'bad', role: Infinity }] },
		{ ...equalTie, tones: [{ pc: 0, label: 'bad', role: -1 }] },
		{ ...equalTie, tones: [{ pc: 0, label: 'bad', role: 1.1 }] },
		{ ...equalTie, tones: [{ pc: 0, label: '', role: 1 }] },
		{ ...equalTie, tones: [equalTie.tones[0], equalTie.tones[0]] },
		{ ...equalTie, voicing: [] },
		{ ...equalTie, voicing: [61] },
		{ ...equalTie, voicing: [128] }
	])('rejects empty/malformed palette or voicing %j', (chord) => {
		expect(() => decide({ ...defaults, chord: chord as Chord })).toThrow(RangeError);
	});
	it('supports finite extreme valid settings without NaN probability', () => {
		const decision = decide({
			...defaults,
			chord: equalTie,
			temperature: Number.MIN_VALUE,
			seed: 0xffffffff,
			eventIndex: 0xffffffff,
			lastPitch: 84
		});
		expect(decision.candidates.every((candidate) => Number.isFinite(candidate.probability))).toBe(
			true
		);
		expect(decision.candidates.reduce((sum, candidate) => sum + candidate.probability, 0)).toBe(1);
	});
});
