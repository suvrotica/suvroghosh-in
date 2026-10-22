import { MIDI_MAX, MIDI_MIN } from './model';

/** Geometry is relative to the complete keyboard, independent of its scroll/zoom viewport. */
export type PianoKey = Readonly<{
	pitch: number;
	black: boolean;
	left: number;
	width: number;
	centre: number;
}>;

export const WHITE_KEY_COUNT = 52;
export const BLACK_KEY_COUNT = 36;
const BLACK_WIDTH_RATIO = 0.62;
const BLACK_CLASSES = new Set([1, 3, 6, 8, 10]);

/**
 * A0 and B0 form the partial lowest octave, followed by seven complete C–B
 * octaves and the final C8.
 * Black keys straddle their neighbouring white-key boundary. Every consumer
 * uses these same percentages for keys, hit targets, overview and paint marks.
 */
export const PIANO_KEYS: readonly PianoKey[] = Object.freeze(
	Array.from({ length: MIDI_MAX - MIDI_MIN + 1 }, (_, index) => MIDI_MIN + index).map(
		(pitch, index, pitches) => {
			const black = BLACK_CLASSES.has(pitch % 12);
			const whitesBefore = pitches
				.slice(0, index)
				.filter((note) => !BLACK_CLASSES.has(note % 12)).length;
			const width = ((black ? BLACK_WIDTH_RATIO : 1) / WHITE_KEY_COUNT) * 100;
			const left = ((whitesBefore - (black ? BLACK_WIDTH_RATIO / 2 : 0)) / WHITE_KEY_COUNT) * 100;
			return Object.freeze({ pitch, black, left, width, centre: left + width / 2 });
		}
	)
);
