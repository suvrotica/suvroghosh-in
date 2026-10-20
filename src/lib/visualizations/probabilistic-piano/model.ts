/**
 * The musical stream is pure and independent of painting, browser clocks and audio.
 * Palettes and score preferences are authored choices, not learned probabilities.
 * Chord vocabulary: https://viva.pressbooks.pub/openmusictheory/chapter/chord-symbols/
 * Interval construction: https://musictheory.pugetsound.edu/mt21c/JazzChordBasics.html
 * Voicing principles: https://online.berklee.edu/takenote/basic-piano-voicing-techniques/
 */
export const MODEL_VERSION = '1' as const;
export const MIDI_MIN = 48;
export const MIDI_MAX = 84;
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_SEED = 20261021;

export type Mode = 'nearest' | 'wander' | 'raw';
export interface Tone {
	pc: number;
	/** Pitch spelling and chord role; enharmonic keyboard labels are separate. */
	label: string;
	/** Authored role preference, bounded to [0, 1]. */
	role: number;
}
export interface Chord {
	id: string;
	name: string;
	tones: readonly Tone[];
	voicing: readonly number[];
}
export interface Preset {
	id: string;
	name: string;
	subtitle: string;
	chords: readonly Chord[];
	colours: readonly string[];
}
export interface Candidate {
	pitch: number;
	probability: number;
	score: number;
}
export interface Decision {
	input: number;
	output: number;
	shift: number;
	chord: string;
	mode: Mode;
	candidates: Candidate[];
	/** Full chord palette in the output range, distinct from admitted candidates. */
	eligible: number[];
	reason: string;
	index: number;
}
export interface DecisionInput {
	pitch: number;
	chord: Chord;
	mode: Mode;
	temperature: number;
	seed: number;
	eventIndex: number;
	lastPitch?: number;
	recent?: readonly number[];
	active?: readonly number[];
}
export interface PhraseEvent {
	pitch: number;
	/** Seconds relative to the explicit replay start; silence stays silence. */
	at: number;
	duration: number;
	velocity: number;
}
/** A replay event freezes settings at note-on; note-off reuses its selected voice. */
export interface ReplayEvent extends PhraseEvent {
	version: typeof MODEL_VERSION;
	index: number;
	chord: Chord;
	mode: Mode;
	temperature: number;
	seed: number;
}

export const SCORE_WEIGHTS = Object.freeze({
	distance: 1.6,
	voiceLeading: 0.035,
	role: 0.35,
	repetition: 0.12,
	active: 0.1
});

const c69: Chord = {
	id: 'c69',
	name: 'C6/9',
	tones: [
		{ pc: 0, label: 'C · root', role: 1 },
		{ pc: 2, label: 'D · ninth', role: 0.6 },
		{ pc: 4, label: 'E · third', role: 1 },
		{ pc: 7, label: 'G · fifth', role: 0.7 },
		{ pc: 9, label: 'A · sixth', role: 0.9 }
	],
	voicing: [48, 52, 57, 62, 67]
};
const dm9: Chord = {
	id: 'dm9',
	name: 'Dm9',
	tones: [
		{ pc: 2, label: 'D · root', role: 1 },
		{ pc: 4, label: 'E · ninth', role: 0.6 },
		{ pc: 5, label: 'F · minor third', role: 1 },
		{ pc: 9, label: 'A · fifth', role: 0.7 },
		{ pc: 0, label: 'C · minor seventh', role: 0.9 }
	],
	voicing: [50, 53, 60, 64, 69]
};
const g13: Chord = {
	id: 'g13',
	name: 'G13',
	// The natural eleventh C is deliberately omitted in this authored palette.
	tones: [
		{ pc: 7, label: 'G · root', role: 1 },
		{ pc: 9, label: 'A · ninth', role: 0.6 },
		{ pc: 11, label: 'B · third', role: 1 },
		{ pc: 2, label: 'D · fifth', role: 0.7 },
		{ pc: 4, label: 'E · thirteenth', role: 0.65 },
		{ pc: 5, label: 'F · minor seventh', role: 0.9 }
	],
	voicing: [55, 59, 65, 69, 76]
};
const cmaj9: Chord = {
	id: 'cmaj9',
	name: 'Cmaj9',
	tones: [
		{ pc: 0, label: 'C · root', role: 1 },
		{ pc: 2, label: 'D · ninth', role: 0.6 },
		{ pc: 4, label: 'E · third', role: 1 },
		{ pc: 7, label: 'G · fifth', role: 0.7 },
		{ pc: 11, label: 'B · major seventh', role: 0.9 }
	],
	voicing: [48, 52, 59, 62, 67]
};
const fmaj9: Chord = {
	id: 'fmaj9',
	name: 'Fmaj9',
	tones: [
		{ pc: 5, label: 'F · root', role: 1 },
		{ pc: 7, label: 'G · ninth', role: 0.6 },
		{ pc: 9, label: 'A · third', role: 1 },
		{ pc: 0, label: 'C · fifth', role: 0.7 },
		{ pc: 4, label: 'E · major seventh', role: 0.9 }
	],
	voicing: [53, 57, 64, 67, 72]
};
const fm6: Chord = {
	id: 'fm6',
	name: 'Fm6',
	tones: [
		{ pc: 5, label: 'F · root', role: 1 },
		{ pc: 8, label: 'A♭ · minor third', role: 1 },
		{ pc: 0, label: 'C · fifth', role: 0.7 },
		{ pc: 2, label: 'D · sixth', role: 0.9 }
	],
	voicing: [53, 56, 62, 72]
};

/** Original sparse voicings: root, defining third/6th/7th, and named colour. */
export const PRESETS: readonly Preset[] = [
	{
		id: 'pond',
		name: 'Moonlit pond',
		subtitle: 'C6/9 · one still pool of harmony',
		chords: [c69],
		colours: ['#7ac6bf', '#b4a0d9', '#f4d8a3', '#eea2a0']
	},
	{
		id: 'walk',
		name: 'Night walk',
		subtitle: 'Dm9 → G13 → Cmaj9 · a returning path',
		chords: [dm9, g13, cmaj9],
		colours: ['#90a5e2', '#71c3b8', '#eeb4c4', '#f4d69a']
	},
	{
		id: 'dusk',
		name: 'The blue hour',
		subtitle: 'Fmaj9 → Fm6 → C6/9 · light becoming shadow',
		chords: [fmaj9, fm6, c69],
		colours: ['#eab0b2', '#c09cdd', '#87b7c9', '#edcea1']
	}
];
// Exported presets cannot become accidental shared per-visitor mutable state.
for (const preset of PRESETS) {
	for (const chord of preset.chords) {
		for (const tone of chord.tones) Object.freeze(tone);
		Object.freeze(chord.tones);
		Object.freeze(chord.voicing);
		Object.freeze(chord);
	}
	Object.freeze(preset.chords);
	Object.freeze(preset.colours);
	Object.freeze(preset);
}
Object.freeze(PRESETS);

/** Original demonstration, including outside notes, a leap, repeats and a rest. */
export const DEMO: readonly PhraseEvent[] = Object.freeze(
	[
		{ pitch: 60, at: 0, duration: 0.36, velocity: 0.62 },
		{ pitch: 61, at: 0.5, duration: 0.31, velocity: 0.68 },
		{ pitch: 64, at: 1, duration: 0.48, velocity: 0.6 },
		{ pitch: 66, at: 1.75, duration: 0.2, velocity: 0.5 },
		{ pitch: 67, at: 2, duration: 0.23, velocity: 0.63 },
		{ pitch: 67, at: 2.35, duration: 0.23, velocity: 0.55 },
		{ pitch: 70, at: 2.75, duration: 0.52, velocity: 0.57 },
		{ pitch: 74, at: 3.5, duration: 0.6, velocity: 0.7 },
		{ pitch: 63, at: 4.5, duration: 0.26, velocity: 0.53 },
		{ pitch: 62, at: 4.85, duration: 0.26, velocity: 0.6 },
		{ pitch: 59, at: 5.25, duration: 0.35, velocity: 0.52 },
		{ pitch: 60, at: 5.8, duration: 0.9, velocity: 0.56 }
	].map((event) => Object.freeze(event))
);

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export function noteName(pitch: number): string {
	if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127)
		throw new RangeError('A note name needs an integer MIDI pitch from 0 to 127.');
	return `${NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

function validatePitch(pitch: number, name: string): void {
	if (!Number.isInteger(pitch) || pitch < MIDI_MIN || pitch > MIDI_MAX)
		throw new RangeError(`${name} must be an integer MIDI pitch from C3 (48) to C6 (84).`);
}
function validateUint(value: number, name: string): void {
	if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
		throw new RangeError(`${name} must be an integer from 0 to 4294967295.`);
}
function validateChord(chord: Chord): void {
	if (
		!chord ||
		typeof chord.id !== 'string' ||
		chord.id.length < 1 ||
		chord.id.length > 64 ||
		typeof chord.name !== 'string' ||
		chord.name.length < 1 ||
		chord.name.length > 80 ||
		!Array.isArray(chord.tones) ||
		chord.tones.length < 1 ||
		chord.tones.length > 12
	)
		throw new RangeError('Choose a named, nonempty chord palette with at most twelve tones.');
	const classes = new Set<number>();
	for (const tone of chord.tones) {
		if (
			!tone ||
			!Number.isInteger(tone.pc) ||
			tone.pc < 0 ||
			tone.pc > 11 ||
			classes.has(tone.pc) ||
			typeof tone.label !== 'string' ||
			tone.label.length < 1 ||
			tone.label.length > 64 ||
			!Number.isFinite(tone.role) ||
			tone.role < 0 ||
			tone.role > 1
		)
			throw new RangeError(
				'Each palette tone needs a unique pitch class, role in [0, 1] and label.'
			);
		classes.add(tone.pc);
	}
	if (!Array.isArray(chord.voicing) || chord.voicing.length < 1 || chord.voicing.length > 8)
		throw new RangeError('A chord needs a bounded accompaniment voicing of one to eight notes.');
	for (const pitch of chord.voicing) {
		validatePitch(pitch, 'Voicing pitch');
		if (!classes.has(pitch % 12))
			throw new RangeError('A voicing note must belong to its chord palette.');
	}
}
function boundedHistory(
	history: readonly number[] | undefined,
	limit: number,
	name: string
): number[] {
	if (history === undefined) return [];
	if (!Array.isArray(history) || history.length > 64)
		throw new RangeError(`${name} must contain at most 64 pitches.`);
	for (const pitch of history) validatePitch(pitch, name);
	return history.slice(-limit);
}

/** Per-event hash, with its own music salt. No shared RNG state or Math.random. */
function musicalDraw(seed: number, eventIndex: number): number {
	let value = (seed ^ Math.imul(eventIndex + 1, 0x9e3779b9) ^ 0x4d555349) >>> 0;
	value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
	value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
	return ((value ^ (value >>> 15)) >>> 0) / 0x100000000;
}

/**
 * Each distance is in semitones; role is dimensionless. The previous-note
 * penalty is zero initially and capped at twelve semitones (0.42 score units).
 * Repeat cost counts exact MIDI repeats in the last eight, capped at three.
 * Active cost is 0.25 for an exact duplicate, 1 for a semitone neighbour, 0.5
 * for a tritone, and 0 otherwise; its total is capped at 3 (0.3 score units).
 * These small preferences never expand the Nearest/Wander distance boundary.
 */
export function decide(input: DecisionInput): Decision {
	const { pitch, chord, mode, temperature, seed, eventIndex, lastPitch } = input;
	validatePitch(pitch, 'Input pitch');
	validateChord(chord);
	if (mode !== 'nearest' && mode !== 'wander' && mode !== 'raw')
		throw new RangeError('Choose Nearest, Wander or Raw mode.');
	if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)
		throw new RangeError('Temperature must be finite and between 0 and 2.');
	validateUint(seed, 'Seed');
	validateUint(eventIndex, 'Event index');
	if (lastPitch !== undefined) validatePitch(lastPitch, 'Previous melody pitch');
	const recent = boundedHistory(input.recent, 8, 'Recent history');
	const active = boundedHistory(input.active, 16, 'Active voices');
	// Copy the note-on snapshot; neither the sound nor painting chooses again.
	const roles = new Map(chord.tones.map((tone) => [tone.pc, tone.role]));
	const eligible = Array.from({ length: MIDI_MAX - MIDI_MIN + 1 }, (_, i) => i + MIDI_MIN).filter(
		(candidate) => roles.has(candidate % 12)
	);
	const preserved = eligible.includes(pitch);
	const minimum = Math.min(...eligible.map((candidate) => Math.abs(candidate - pitch)));
	const bound = minimum + (mode === 'wander' ? 1 : 0);
	const admitted =
		mode === 'raw' || preserved
			? [pitch]
			: eligible.filter((candidate) => Math.abs(candidate - pitch) <= bound);
	const candidates = admitted.map((candidate): Candidate => {
		const voiceLeading =
			lastPitch === undefined ? 0 : Math.min(12, Math.abs(candidate - lastPitch));
		const repetition = Math.min(3, recent.filter((previous) => previous === candidate).length);
		const compatibility = Math.min(
			3,
			active.reduce((sum, held) => {
				const gap = Math.abs(held - candidate);
				return sum + (gap === 0 ? 0.25 : gap === 1 ? 1 : gap === 6 ? 0.5 : 0);
			}, 0)
		);
		return {
			pitch: candidate,
			probability: 0,
			score:
				mode === 'raw'
					? 0
					: -SCORE_WEIGHTS.distance * Math.abs(candidate - pitch) -
						SCORE_WEIGHTS.voiceLeading * voiceLeading +
						SCORE_WEIGHTS.role * roles.get(candidate % 12)! -
						SCORE_WEIGHTS.repetition * repetition -
						SCORE_WEIGHTS.active * compatibility
		};
	});
	const maximum = Math.max(...candidates.map((candidate) => candidate.score));
	let selected: Candidate;
	if (temperature === 0 || candidates.length === 1) {
		// Sorted MIDI order supplies an exact-score tie's deterministic lower note.
		selected = candidates.find((candidate) => candidate.score === maximum)!;
		selected.probability = 1;
	} else {
		const masses = candidates.map((candidate) =>
			Math.exp((candidate.score - maximum) / temperature)
		);
		const total = masses.reduce((sum, mass) => sum + mass, 0);
		candidates.forEach((candidate, i) => {
			candidate.probability = masses[i] / total;
		});
		const draw = musicalDraw(seed, eventIndex);
		let cumulative = 0;
		selected = candidates[candidates.length - 1];
		for (const candidate of candidates) {
			cumulative += candidate.probability;
			if (draw < cumulative) {
				selected = candidate;
				break;
			}
		}
	}
	const reason =
		mode === 'raw'
			? `Raw: ${noteName(pitch)} unchanged, ${preserved ? 'inside' : 'outside'} the ${chord.name} palette.`
			: preserved
				? `Unchanged: ${noteName(pitch)} already belongs to the ${chord.name} palette.`
				: `${mode === 'nearest' ? `Nearest distance ${minimum}` : `Wander distance at most ${bound}`} semitone${bound === 1 ? '' : 's'}; ${candidates.length === 1 ? 'one possibility, probability 1' : temperature === 0 ? 'maximum score; exact ties choose lower MIDI' : 'seeded selection from the displayed probabilities'}.`;
	return {
		input: pitch,
		output: selected.pitch,
		shift: selected.pitch - pitch,
		chord: chord.name,
		mode,
		candidates,
		eligible,
		reason,
		index: eventIndex
	};
}
