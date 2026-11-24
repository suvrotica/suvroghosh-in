import {
	ARP_DIVISIONS,
	ARP_ENGINES,
	ARP_MODES,
	ARP_STEP_COUNT,
	type ArpDivision,
	type ArpEngine,
	type ArpMode,
	type SeqStep
} from './synth-patch';

export {
	ARP_DIVISIONS,
	ARP_ENGINES,
	ARP_MODES,
	type ArpDivision,
	type ArpEngine,
	type ArpMode,
	type SeqStep
};

export const SCHEDULER_TICK_MS = 25;
export const SCHEDULER_LOOKAHEAD_SECONDS = 0.1;
export const SCHEDULER_STEP_COUNT = ARP_STEP_COUNT;
export const SCHEDULER_MIN_BPM = 40;
export const SCHEDULER_MAX_BPM = 220;
export const SCHEDULER_MIN_GATE = 0.05;
export const SCHEDULER_MAX_GATE = 1;

export type SchedulerSource = 'arp' | 'seq' | 'chord';
export type SchedulerPlayMode = ArpEngine;
export type ArpPatternMode = ArpMode;
export type SequencerStep = SeqStep;

export interface ChordProgressionStep {
	voicing: readonly number[];
}

export interface ChordProgressionConfig {
	enabled: boolean;
	chords: readonly ChordProgressionStep[];
	currentIndex: number;
	intervalSeconds: number;
	accompaniment: boolean;
	velocity?: number;
	durationSeconds?: number;
}

export interface ScheduledPhraseEvent {
	pitch: number;
	at: number;
	duration: number;
	velocity: number;
}

export interface SchedulerConfig {
	playMode: SchedulerPlayMode;
	bpm: number;
	division: ArpDivision;
	gate: number;
	swing: number;
	velocity: number;
	arpMode: ArpPatternMode;
	arpOctaves: 1 | 2 | 3;
	hold: boolean;
	rootPitch: number;
	seed: number;
	stepRec: boolean;
	steps: readonly SequencerStep[];
	chordProgression?: ChordProgressionConfig;
}

export interface SchedulerOptions {
	nowSeconds: () => number;
	scheduleNoteAt: (
		pitch: number,
		velocity: number,
		whenSeconds: number,
		durationSeconds: number,
		source: SchedulerSource
	) => void;
	onStep?: (stepIndex: number, whenSeconds?: number) => void;
	onChordChange?: (chordIndex: number, whenSeconds: number) => void;
	onStepRecord?: (stepIndex: number, step: SequencerStep) => void;
	autoTimer?: boolean;
	setIntervalFn?: (cb: () => void, ms: number) => ReturnType<typeof setInterval>;
	clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void;
}

export interface SchedulerSnapshot {
	running: boolean;
	disposed: boolean;
	stepIndex: number;
	recordCursor: number;
	chordIndex: number;
	heldNotes: readonly number[];
	config: SchedulerConfig;
}

export interface SynthScheduler {
	start(): void;
	stop(): void;
	dispose(): void;
	tick(nowSecondsOverride?: number): void;
	setConfig(partial: Partial<SchedulerConfig>): void;
	setHeldNotes(pitches: readonly number[]): void;
	clearLatch(): void;
	recordStep(
		pitch: number,
		options?: Partial<Pick<SequencerStep, 'gate' | 'tie' | 'accent' | 'noteOffset'>>
	): number | null;
	setRecordCursor(stepIndex: number): void;
	startPhrase(
		events: readonly ScheduledPhraseEvent[],
		callbacks?: {
			onEvent?: (index: number, whenSeconds: number) => void;
			onComplete?: () => void;
		}
	): void;
	stopPhrase(): void;
	tapTempo(nowSecondsOverride?: number): number | null;
	snapshot(): SchedulerSnapshot;
}

const DIVISION_BEATS: Readonly<Record<ArpDivision, number>> = {
	'1/4': 1,
	'1/8': 0.5,
	'1/8t': 1 / 3,
	'1/16': 0.25,
	'1/16t': 1 / 6,
	'1/32': 0.125
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, value));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.round(value)));
}

function clampMidi(pitch: number): number {
	return Math.min(127, Math.max(0, Math.round(pitch)));
}

function normalizeStep(step: Partial<SequencerStep> | undefined): SequencerStep {
	const rawNote = step?.note;
	const note =
		typeof rawNote === 'number' && Number.isFinite(rawNote) ? clampInt(rawNote, 0, 127, 60) : null;
	return {
		active: Boolean(step?.active),
		note,
		noteOffset: clampInt(step?.noteOffset, -24, 24, 0),
		gate: clampNumber(step?.gate, SCHEDULER_MIN_GATE, SCHEDULER_MAX_GATE, 0.75),
		tie: Boolean(step?.tie),
		accent: Boolean(step?.accent)
	};
}

function normalizeSteps(steps: readonly Partial<SequencerStep>[] | undefined): SequencerStep[] {
	return Array.from({ length: SCHEDULER_STEP_COUNT }, (_, i) => normalizeStep(steps?.[i]));
}

function normalizeHeldNotes(pitches: readonly number[]): number[] {
	const seen = new Set<number>();
	const out: number[] = [];
	for (const p of pitches) {
		if (typeof p === 'number' && Number.isInteger(p) && p >= 0 && p <= 127 && !seen.has(p)) {
			seen.add(p);
			out.push(p);
		}
	}
	return out;
}

function normalizeChordProgression(
	input: ChordProgressionConfig | undefined
): ChordProgressionConfig | undefined {
	if (!input) return undefined;
	const chords: ChordProgressionStep[] = Array.isArray(input.chords)
		? input.chords.map((chord) => ({
				voicing: Array.isArray(chord?.voicing)
					? chord.voicing.filter(
							(p: unknown): p is number =>
								typeof p === 'number' && Number.isInteger(p) && p >= 0 && p <= 127
						)
					: []
			}))
		: [];
	const maxIdx = Math.max(0, chords.length - 1);
	return {
		enabled: Boolean(input.enabled),
		chords,
		currentIndex: chords.length > 0 ? clampInt(input.currentIndex, 0, maxIdx, 0) : 0,
		intervalSeconds: clampNumber(input.intervalSeconds, 0.25, 30, 3),
		accompaniment: Boolean(input.accompaniment),
		velocity: clampNumber(input.velocity, 0.05, 1, 0.25),
		durationSeconds: clampNumber(input.durationSeconds, 0.05, 10, 1.4)
	};
}

export function createDefaultSequencerSteps(): SequencerStep[] {
	return normalizeSteps(undefined);
}

export function createDefaultSchedulerConfig(): SchedulerConfig {
	return {
		playMode: 'off',
		bpm: 120,
		division: '1/16',
		gate: 0.75,
		swing: 0,
		velocity: 0.72,
		arpMode: 'up',
		arpOctaves: 1,
		hold: false,
		rootPitch: 60,
		seed: 20261021,
		stepRec: false,
		steps: createDefaultSequencerSteps()
	};
}

export function stepDurationSeconds(bpm: number, division: ArpDivision): number {
	const safeBpm = clampNumber(bpm, SCHEDULER_MIN_BPM, SCHEDULER_MAX_BPM, 120);
	const multiplier = DIVISION_BEATS[division] ?? 0.25;
	return (60 / safeBpm) * multiplier;
}

export function buildArpPattern(
	heldNotes: readonly number[],
	mode: ArpPatternMode,
	octaves: number
): number[] {
	const clean = normalizeHeldNotes(heldNotes);
	if (clean.length === 0) return [];
	const oct = clampInt(octaves, 1, 3, 1);

	if (mode === 'order') {
		const ordered: number[] = [];
		for (let o = 0; o < oct; o++) {
			for (const pitch of clean) {
				const transposed = pitch + o * 12;
				if (transposed <= 127) ordered.push(transposed);
			}
		}
		return ordered;
	}

	const sorted = [...clean].sort((a, b) => a - b);
	const ascending: number[] = [];
	for (let o = 0; o < oct; o++) {
		for (const pitch of sorted) {
			const transposed = pitch + o * 12;
			if (transposed <= 127) ascending.push(transposed);
		}
	}

	if (mode === 'down') {
		return [...ascending].reverse();
	}
	if (mode === 'up-down') {
		if (ascending.length <= 1) return ascending;
		return ascending.concat(ascending.slice(1, -1).reverse());
	}
	// 'up', 'random', and 'chord' use the unique sorted octave-expanded pool
	return ascending;
}

export function createSynthScheduler(options: SchedulerOptions): SynthScheduler {
	let config: SchedulerConfig = createDefaultSchedulerConfig();
	let running = false;
	let disposed = false;
	let runEpoch = 0;
	let timerId: ReturnType<typeof setInterval> | undefined;
	let stepIndex = 0;
	let arpCursor = 0;
	let tiedSkipRemaining = 0;
	let recordCursor = 0;
	let chordIndex = 0;
	let nextStepBaseTime = 0;
	let nextChordTime = 0;
	let lastTickNow: number | null = null;
	let physicalNotes: number[] = [];
	let latchedNotes: number[] = [];
	let arpWasEmpty = true;
	let rngState = config.seed >>> 0;
	let tapTimestamps: number[] = [];

	interface PhraseState {
		epoch: number;
		events: ScheduledPhraseEvent[];
		nextIndex: number;
		endAt: number;
		onEvent?: (index: number, whenSeconds: number) => void;
		onComplete?: () => void;
	}
	let phraseState: PhraseState | null = null;

	const autoTimer = options.autoTimer !== false;
	const setIntervalFn = options.setIntervalFn ?? setInterval;
	const clearIntervalFn = options.clearIntervalFn ?? clearInterval;

	function nextRandomUnit(): number {
		rngState = (rngState + 0x6d2b79f5) >>> 0;
		let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
	}

	function activeHeldNotes(): number[] {
		return config.hold ? latchedNotes : physicalNotes;
	}

	function swingOffset(index: number, stepDur: number): number {
		return index % 2 === 1 ? config.swing * 0.4 * stepDur : 0;
	}

	function slotDuration(index: number, stepDur: number): number {
		return stepDur * (index % 2 === 0 ? 1 + config.swing * 0.4 : 1 - config.swing * 0.4);
	}

	function emitChordStep(idx: number, whenSeconds: number, epoch: number): void {
		const cp = config.chordProgression;
		if (!cp || !cp.enabled || cp.chords.length === 0) return;
		const safeIdx = ((idx % cp.chords.length) + cp.chords.length) % cp.chords.length;
		const chord = cp.chords[safeIdx];
		if (cp.accompaniment && chord) {
			const vel = cp.velocity ?? 0.25;
			const dur = cp.durationSeconds ?? 1.4;
			for (const pitch of chord.voicing) {
				options.scheduleNoteAt(pitch, vel, whenSeconds, dur, 'chord');
				if (!running || disposed || runEpoch !== epoch || config.chordProgression !== cp) {
					return;
				}
			}
		}
		if (!running || disposed || runEpoch !== epoch || config.chordProgression !== cp) return;
		options.onChordChange?.(safeIdx, whenSeconds);
	}

	function clearTimer(): void {
		if (timerId !== undefined) {
			clearIntervalFn(timerId);
			timerId = undefined;
		}
	}

	function currentPlayMode(): SchedulerPlayMode {
		return config.playMode;
	}

	function isStepEngineActive(epoch: number): boolean {
		return running && !disposed && runEpoch === epoch && config.playMode !== 'off';
	}

	function tick(nowSecondsOverride?: number): void {
		if (!running || disposed) return;
		const epoch = runEpoch;
		const now = nowSecondsOverride ?? options.nowSeconds();
		if (typeof now !== 'number' || !Number.isFinite(now)) return;

		const cp = config.chordProgression;
		const chordInterval = cp?.intervalSeconds ?? 3;

		if (lastTickNow !== null && now < lastTickNow) {
			nextStepBaseTime = now;
			nextChordTime = now + chordInterval;
			tiedSkipRemaining = 0;
		}
		if (nextStepBaseTime < now - 0.25) {
			nextStepBaseTime = now;
			tiedSkipRemaining = 0;
		}
		if (cp?.enabled && nextChordTime < now - 0.25) {
			nextChordTime = now;
		}
		lastTickNow = now;

		if (config.playMode !== 'off') {
			const held = activeHeldNotes();

			if (config.playMode === 'arp' && held.length === 0) {
				arpCursor = 0;
				arpWasEmpty = true;
				nextStepBaseTime = Math.max(nextStepBaseTime, now);
			} else {
				if (config.playMode === 'arp' && arpWasEmpty) {
					arpWasEmpty = false;
					nextStepBaseTime = Math.max(nextStepBaseTime, now);
				}
				while (isStepEngineActive(epoch)) {
					const stepDur = stepDurationSeconds(config.bpm, config.division);
					const heldNow = activeHeldNotes();
					if (currentPlayMode() === 'arp' && heldNow.length === 0) {
						arpCursor = 0;
						arpWasEmpty = true;
						nextStepBaseTime = Math.max(nextStepBaseTime, now);
						break;
					}
					const when = nextStepBaseTime + swingOffset(stepIndex, stepDur);
					if (when > now + SCHEDULER_LOOKAHEAD_SECONDS) {
						break;
					}
					nextStepBaseTime += stepDur;

					if (when < now - 0.05) {
						if (tiedSkipRemaining > 0) tiedSkipRemaining--;
						stepIndex = (stepIndex + 1) % SCHEDULER_STEP_COUNT;
						continue;
					}

					const emitAt = Math.max(now, when);
					options.onStep?.(stepIndex, emitAt);
					if (!isStepEngineActive(epoch)) {
						break;
					}

					const activeStepDur = stepDurationSeconds(config.bpm, config.division);
					const activeHeld = activeHeldNotes();
					const mode = currentPlayMode();

					if (mode === 'arp') {
						const pattern = buildArpPattern(activeHeld, config.arpMode, config.arpOctaves);
						if (pattern.length > 0) {
							const slotDur = slotDuration(stepIndex, activeStepDur);
							const noteDur = Math.max(0.015, slotDur * config.gate);
							if (config.arpMode === 'chord') {
								for (const pitch of pattern) {
									options.scheduleNoteAt(pitch, config.velocity, emitAt, noteDur, 'arp');
									if (!isStepEngineActive(epoch) || currentPlayMode() !== 'arp') break;
								}
							} else if (config.arpMode === 'random') {
								const pickIdx = Math.min(
									pattern.length - 1,
									Math.floor(nextRandomUnit() * pattern.length)
								);
								options.scheduleNoteAt(pattern[pickIdx], config.velocity, emitAt, noteDur, 'arp');
							} else {
								const pitch = pattern[arpCursor % pattern.length];
								arpCursor = (arpCursor + 1) % pattern.length;
								options.scheduleNoteAt(pitch, config.velocity, emitAt, noteDur, 'arp');
							}
						}
					} else if (mode === 'seq') {
						if (tiedSkipRemaining > 0) {
							tiedSkipRemaining--;
						} else {
							const step = config.steps[stepIndex];
							if (step.active) {
								let tiedDuration = 0;
								let lastOffset = 0;
								for (let k = 1; k < SCHEDULER_STEP_COUNT; k++) {
									const prevIdx = (stepIndex + k - 1) % SCHEDULER_STEP_COUNT;
									const nextIdx = (stepIndex + k) % SCHEDULER_STEP_COUNT;
									if (config.steps[prevIdx].tie && config.steps[nextIdx].active) {
										tiedDuration += slotDuration(prevIdx, activeStepDur);
										lastOffset = k;
									} else {
										break;
									}
								}
								const lastIdx = (stepIndex + lastOffset) % SCHEDULER_STEP_COUNT;
								const lastStep = config.steps[lastIdx];
								tiedDuration += slotDuration(lastIdx, activeStepDur) * lastStep.gate;
								tiedSkipRemaining = lastOffset;

								const baseNote = step.note ?? config.rootPitch;
								const pitch = clampMidi(baseNote + step.noteOffset);
								const velocity = step.accent
									? Math.min(1, Math.max(config.velocity * 1.35, 0.9))
									: config.velocity;
								options.scheduleNoteAt(
									pitch,
									velocity,
									emitAt,
									Math.max(0.015, tiedDuration),
									'seq'
								);
							}
						}
					}

					if (!isStepEngineActive(epoch)) {
						break;
					}
					stepIndex = (stepIndex + 1) % SCHEDULER_STEP_COUNT;
				}
			}
		}

		while (running && !disposed && runEpoch === epoch) {
			const liveCp = config.chordProgression;
			if (!liveCp?.enabled || liveCp.chords.length === 0) break;
			if (nextChordTime > now + SCHEDULER_LOOKAHEAD_SECONDS) break;
			const emitAt = Math.max(now, nextChordTime);
			chordIndex = (chordIndex + 1) % liveCp.chords.length;
			nextChordTime += liveCp.intervalSeconds;
			emitChordStep(chordIndex, emitAt, epoch);
		}

		if (running && !disposed && runEpoch === epoch && phraseState) {
			const ps = phraseState;
			while (
				running &&
				!disposed &&
				runEpoch === epoch &&
				phraseState === ps &&
				ps.nextIndex < ps.events.length
			) {
				const idx = ps.nextIndex;
				const ev = ps.events[idx];
				const targetAt = ps.epoch + ev.at;
				if (targetAt > now + SCHEDULER_LOOKAHEAD_SECONDS) break;
				ps.nextIndex++;
				if (targetAt >= now - 0.05) {
					const emitAt = Math.max(now, targetAt);
					options.scheduleNoteAt(ev.pitch, ev.velocity, emitAt, ev.duration, 'chord');
					if (!running || disposed || runEpoch !== epoch || phraseState !== ps) break;
					ps.onEvent?.(idx, emitAt);
				}
			}
			if (
				running &&
				!disposed &&
				runEpoch === epoch &&
				phraseState === ps &&
				ps.nextIndex >= ps.events.length &&
				now > ps.endAt + 0.05
			) {
				const done = ps.onComplete;
				phraseState = null;
				done?.();
			}
		}
	}

	function applyConfig(partial: Partial<SchedulerConfig>, nowSecondsOverride?: number): void {
		if (disposed) return;
		const prevPlayMode = config.playMode;
		const prevStepDur = stepDurationSeconds(config.bpm, config.division);
		const prevSwing = config.swing;
		const wasHold = config.hold;
		const prevChordProgression = config.chordProgression;
		const wasChordReady = Boolean(
			prevChordProgression?.enabled && prevChordProgression.chords.length > 0
		);
		const nextPlayMode =
			partial.playMode && (ARP_ENGINES as readonly string[]).includes(partial.playMode)
				? partial.playMode
				: config.playMode;
		const nextDivision =
			partial.division && (ARP_DIVISIONS as readonly string[]).includes(partial.division)
				? partial.division
				: config.division;
		const nextArpMode =
			partial.arpMode && (ARP_MODES as readonly string[]).includes(partial.arpMode)
				? partial.arpMode
				: config.arpMode;
		const nextSeed =
			partial.seed !== undefined ? clampInt(partial.seed, 0, 0xffffffff, config.seed) : config.seed;

		const nextChordProgression =
			partial.chordProgression !== undefined
				? normalizeChordProgression(partial.chordProgression)
				: config.chordProgression;

		config = {
			playMode: nextPlayMode,
			bpm:
				partial.bpm !== undefined
					? clampNumber(partial.bpm, SCHEDULER_MIN_BPM, SCHEDULER_MAX_BPM, 120)
					: config.bpm,
			division: nextDivision,
			gate:
				partial.gate !== undefined
					? clampNumber(partial.gate, SCHEDULER_MIN_GATE, SCHEDULER_MAX_GATE, 0.75)
					: config.gate,
			swing: partial.swing !== undefined ? clampNumber(partial.swing, 0, 1, 0) : config.swing,
			velocity:
				partial.velocity !== undefined
					? clampNumber(partial.velocity, 0.05, 1, 0.72)
					: config.velocity,
			arpMode: nextArpMode,
			arpOctaves:
				partial.arpOctaves !== undefined
					? (clampInt(partial.arpOctaves, 1, 3, 1) as 1 | 2 | 3)
					: config.arpOctaves,
			hold: partial.hold !== undefined ? Boolean(partial.hold) : config.hold,
			rootPitch:
				partial.rootPitch !== undefined
					? clampInt(partial.rootPitch, 0, 127, 60)
					: config.rootPitch,
			seed: nextSeed,
			stepRec: partial.stepRec !== undefined ? Boolean(partial.stepRec) : config.stepRec,
			steps: partial.steps !== undefined ? normalizeSteps(partial.steps) : config.steps,
			chordProgression: nextChordProgression
		};

		if (nextPlayMode !== prevPlayMode || partial.steps !== undefined) {
			tiedSkipRemaining = 0;
		}

		if (partial.seed !== undefined) {
			rngState = nextSeed >>> 0;
		}
		if (wasHold && !config.hold) {
			latchedNotes = [...physicalNotes];
		} else if (!wasHold && config.hold && latchedNotes.length === 0 && physicalNotes.length > 0) {
			latchedNotes = [...physicalNotes];
		}

		if (running) {
			const rawNow = nowSecondsOverride ?? options.nowSeconds();
			const safeNow = typeof rawNow === 'number' && Number.isFinite(rawNow) ? rawNow : 0;
			const newStepDur = stepDurationSeconds(config.bpm, config.division);

			if (prevPlayMode === 'off' && nextPlayMode !== 'off') {
				nextStepBaseTime = safeNow;
				stepIndex = 0;
				arpCursor = 0;
				tiedSkipRemaining = 0;
				arpWasEmpty = true;
			} else {
				if (newStepDur < prevStepDur) {
					nextStepBaseTime = Math.min(nextStepBaseTime, safeNow + newStepDur);
				}
				if (
					(newStepDur < prevStepDur || config.swing < prevSwing) &&
					stepIndex % 2 === 1 &&
					nextStepBaseTime + swingOffset(stepIndex, newStepDur) < safeNow
				) {
					nextStepBaseTime = Math.max(nextStepBaseTime, safeNow);
				}
			}

			if (config.chordProgression?.enabled && config.chordProgression.chords.length > 0) {
				const liveCp = config.chordProgression;
				if (!wasChordReady) {
					const epoch = runEpoch;
					chordIndex = liveCp.currentIndex % liveCp.chords.length;
					emitChordStep(chordIndex, safeNow + 0.03, epoch);
					if (running && !disposed && runEpoch === epoch) {
						nextChordTime =
							safeNow + (config.chordProgression?.intervalSeconds ?? liveCp.intervalSeconds);
					}
				} else if (partial.chordProgression !== undefined) {
					if (
						partial.chordProgression.currentIndex !== undefined &&
						liveCp.currentIndex !== chordIndex
					) {
						chordIndex = liveCp.currentIndex % liveCp.chords.length;
						nextChordTime = safeNow + liveCp.intervalSeconds;
					} else if (liveCp.intervalSeconds !== prevChordProgression?.intervalSeconds) {
						if (liveCp.intervalSeconds < (prevChordProgression?.intervalSeconds ?? Infinity)) {
							nextChordTime = Math.min(nextChordTime, safeNow + liveCp.intervalSeconds);
						} else {
							nextChordTime = Math.max(nextChordTime, safeNow + liveCp.intervalSeconds);
						}
					}
				}
			}
		}
	}

	return {
		start(): void {
			if (disposed || running) return;
			runEpoch++;
			const epoch = runEpoch;
			const now = options.nowSeconds();
			const safeNow = typeof now === 'number' && Number.isFinite(now) ? now : 0;
			running = true;
			stepIndex = 0;
			arpCursor = 0;
			tiedSkipRemaining = 0;
			lastTickNow = null;
			arpWasEmpty = true;
			nextStepBaseTime = safeNow;
			clearTimer();

			const cp = config.chordProgression;
			if (cp?.enabled && cp.chords.length > 0) {
				chordIndex = cp.currentIndex % cp.chords.length;
				emitChordStep(chordIndex, safeNow + 0.03, epoch);
				if (!running || disposed || runEpoch !== epoch) return;
				nextChordTime = safeNow + (config.chordProgression?.intervalSeconds ?? cp.intervalSeconds);
			}

			tick(safeNow);
			if (!running || disposed || runEpoch !== epoch) return;

			if (autoTimer) {
				clearTimer();
				timerId = setIntervalFn(() => tick(), SCHEDULER_TICK_MS);
			}
		},

		stop(): void {
			running = false;
			runEpoch++;
			clearTimer();
			tiedSkipRemaining = 0;
			arpCursor = 0;
			stepIndex = 0;
			lastTickNow = null;
			phraseState = null;
		},

		dispose(): void {
			this.stop();
			disposed = true;
			runEpoch++;
			physicalNotes = [];
			latchedNotes = [];
			tapTimestamps = [];
		},

		tick,

		setConfig(partial: Partial<SchedulerConfig>): void {
			applyConfig(partial);
		},

		setHeldNotes(pitches: readonly number[]): void {
			if (disposed) return;
			const clean = normalizeHeldNotes(pitches);
			if (config.hold) {
				if (clean.length > 0) {
					if (physicalNotes.length === 0) {
						latchedNotes = [...clean];
					} else {
						for (const p of clean) {
							if (!latchedNotes.includes(p)) latchedNotes.push(p);
						}
					}
				}
			} else {
				latchedNotes = [...clean];
			}
			physicalNotes = clean;
		},

		clearLatch(): void {
			latchedNotes = [...physicalNotes];
		},

		recordStep(
			pitch: number,
			stepOptions?: Partial<Pick<SequencerStep, 'gate' | 'tie' | 'accent' | 'noteOffset'>>
		): number | null {
			if (disposed || !config.stepRec) return null;
			if (typeof pitch !== 'number' || !Number.isFinite(pitch)) return null;
			const writtenIndex = recordCursor;
			const nextStep = normalizeStep({
				active: true,
				note: clampMidi(pitch),
				noteOffset: stepOptions?.noteOffset ?? 0,
				gate: stepOptions?.gate ?? config.gate,
				tie: stepOptions?.tie ?? false,
				accent: stepOptions?.accent ?? false
			});
			const nextSteps = config.steps.map((s, idx) => (idx === writtenIndex ? nextStep : { ...s }));
			config = { ...config, steps: nextSteps };
			recordCursor = (recordCursor + 1) % SCHEDULER_STEP_COUNT;
			options.onStepRecord?.(writtenIndex, { ...nextStep });
			return writtenIndex;
		},

		setRecordCursor(stepIndexValue: number): void {
			const safe = clampInt(stepIndexValue, 0, SCHEDULER_STEP_COUNT - 1, 0);
			recordCursor = safe;
		},

		startPhrase(
			events: readonly ScheduledPhraseEvent[],
			callbacks?: {
				onEvent?: (index: number, whenSeconds: number) => void;
				onComplete?: () => void;
			}
		): void {
			if (disposed) return;
			const now = options.nowSeconds();
			const safeNow = typeof now === 'number' && Number.isFinite(now) ? now : 0;
			const cleanEvents: ScheduledPhraseEvent[] = events
				.filter(
					(ev) =>
						ev &&
						Number.isFinite(ev.pitch) &&
						Number.isFinite(ev.at) &&
						ev.at >= 0 &&
						Number.isFinite(ev.duration) &&
						ev.duration > 0 &&
						Number.isFinite(ev.velocity)
				)
				.map((ev) => ({
					pitch: clampMidi(ev.pitch),
					at: ev.at,
					duration: ev.duration,
					velocity: clampNumber(ev.velocity, 0.05, 1, 0.65)
				}))
				.sort((a, b) => a.at - b.at);

			if (cleanEvents.length === 0) {
				phraseState = null;
				callbacks?.onComplete?.();
				return;
			}

			const epoch = safeNow + 0.05;
			let maxEnd = epoch;
			for (const ev of cleanEvents) {
				const end = epoch + ev.at + ev.duration;
				if (end > maxEnd) maxEnd = end;
			}
			phraseState = {
				epoch,
				events: cleanEvents,
				nextIndex: 0,
				endAt: maxEnd,
				onEvent: callbacks?.onEvent,
				onComplete: callbacks?.onComplete
			};
		},

		stopPhrase(): void {
			phraseState = null;
		},

		tapTempo(nowSecondsOverride?: number): number | null {
			if (disposed) return null;
			const now = nowSecondsOverride ?? options.nowSeconds();
			if (typeof now !== 'number' || !Number.isFinite(now)) return null;
			const last = tapTimestamps[tapTimestamps.length - 1];
			if (last !== undefined && (now <= last || now - last > 2.5)) {
				tapTimestamps = [];
			}
			tapTimestamps.push(now);
			if (tapTimestamps.length > 4) tapTimestamps = tapTimestamps.slice(-4);
			if (tapTimestamps.length < 2) return null;

			let totalDelta = 0;
			for (let i = 1; i < tapTimestamps.length; i++) {
				totalDelta += tapTimestamps[i] - tapTimestamps[i - 1];
			}
			const avgDelta = totalDelta / (tapTimestamps.length - 1);
			if (avgDelta <= 0) return null;
			const bpm = clampInt(60 / avgDelta, SCHEDULER_MIN_BPM, SCHEDULER_MAX_BPM, 120);
			applyConfig({ bpm }, now);
			return bpm;
		},

		snapshot(): SchedulerSnapshot {
			return {
				running,
				disposed,
				stepIndex,
				recordCursor,
				chordIndex,
				heldNotes: [...activeHeldNotes()],
				config: {
					...config,
					steps: config.steps.map((s) => ({ ...s })),
					chordProgression: config.chordProgression
						? {
								...config.chordProgression,
								chords: config.chordProgression.chords.map((c) => ({ voicing: [...c.voicing] }))
							}
						: undefined
				}
			};
		}
	};
}
