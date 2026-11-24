import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ARP_DIVISIONS,
	buildArpPattern,
	createDefaultSchedulerConfig,
	createDefaultSequencerSteps,
	createSynthScheduler,
	SCHEDULER_MAX_BPM,
	SCHEDULER_MIN_BPM,
	SCHEDULER_STEP_COUNT,
	stepDurationSeconds,
	type SchedulerSource
} from './synth-scheduler';

interface EmittedNote {
	pitch: number;
	velocity: number;
	whenSeconds: number;
	durationSeconds: number;
	source: SchedulerSource;
}

function makeHarness(autoTimer = false, initialNow = 10.0) {
	let now = initialNow;
	const notes: EmittedNote[] = [];
	const steps: number[] = [];
	const chords: number[] = [];
	const scheduler = createSynthScheduler({
		nowSeconds: () => now,
		scheduleNoteAt: (pitch, velocity, whenSeconds, durationSeconds, source) => {
			notes.push({ pitch, velocity, whenSeconds, durationSeconds, source });
		},
		onStep: (stepIndex) => steps.push(stepIndex),
		onChordChange: (chordIndex) => chords.push(chordIndex),
		autoTimer
	});
	return {
		scheduler,
		notes,
		steps,
		chords,
		setNow: (t: number) => {
			now = t;
		}
	};
}

describe('pure lookahead synth-scheduler', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('runs cleanly in Node without browser globals or Math.random', () => {
		expect(typeof window).toBe('undefined');
		const random = vi.spyOn(Math, 'random').mockImplementation(() => {
			throw new Error('Math.random forbidden in synth-scheduler');
		});
		const { scheduler, notes } = makeHarness(false, 0);
		scheduler.setConfig({
			playMode: 'arp',
			arpMode: 'random',
			bpm: 120,
			division: '1/16',
			seed: 42
		});
		scheduler.setHeldNotes([60, 64, 67]);
		scheduler.start();
		for (let t = 0.025; t <= 0.5; t += 0.025) scheduler.tick(t);
		expect(notes.length).toBeGreaterThan(3);
		expect(notes.every((n) => [60, 64, 67].includes(n.pitch))).toBe(true);
		random.mockRestore();
	});

	it('schedules 25ms ticks with 100ms lookahead and wraps steps 0..15 cleanly', () => {
		// 120 BPM, 1/16 -> stepDur = 0.125 s
		const { scheduler, notes, steps, setNow } = makeHarness(false, 10.0);
		scheduler.setConfig({ playMode: 'arp', arpMode: 'up', bpm: 120, division: '1/16', gate: 0.8 });
		scheduler.setHeldNotes([60, 64, 67]);
		scheduler.start(); // ticks at 10.0 -> schedules step 0 (10.0) only, since 10.125 > 10.1

		expect(steps).toEqual([0]);
		expect(notes.map((n) => [n.pitch, n.whenSeconds])).toEqual([[60, 10.0]]);

		setNow(10.025);
		scheduler.tick(); // lookahead 10.125 >= 10.125 -> schedules step 1 (10.125)
		expect(steps).toEqual([0, 1]);
		expect(notes[1].pitch).toBe(64);
		expect(notes[1].whenSeconds).toBeCloseTo(10.125, 9);

		setNow(10.15);
		scheduler.tick(); // lookahead 10.25 -> schedules step 2 (10.25)
		expect(steps).toEqual([0, 1, 2]);
		expect(notes[2].pitch).toBe(67);
		expect(notes[2].whenSeconds).toBeCloseTo(10.25, 9);

		// Advance through step 15 -> wraps back to 0
		for (let t = 10.2; t <= 12.1; t += 0.05) {
			setNow(t);
			scheduler.tick();
		}
		expect(steps.slice(0, 17)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0]);
	});

	it('drives 25ms interval via fake timers and clears handles on stop/dispose', () => {
		vi.useFakeTimers();
		let clock = 0;
		const notes: number[] = [];
		const scheduler = createSynthScheduler({
			nowSeconds: () => clock,
			scheduleNoteAt: (pitch) => notes.push(pitch)
		});
		scheduler.setConfig({ playMode: 'arp', bpm: 120, division: '1/16' });
		scheduler.setHeldNotes([60, 67]);
		scheduler.start();
		expect(notes).toEqual([60]);

		clock = 0.025;
		vi.advanceTimersByTime(25);
		expect(notes).toEqual([60, 67]);

		scheduler.stop();
		clock = 0.25;
		vi.advanceTimersByTime(250);
		expect(notes).toEqual([60, 67]);

		scheduler.dispose();
		scheduler.start(); // inert after dispose
		vi.advanceTimersByTime(250);
		expect(notes).toEqual([60, 67]);
	});

	it('builds exact arp patterns across all 6 modes and Oct 1..3 clamped <= 127', () => {
		expect(buildArpPattern([64, 60, 67], 'up', 1)).toEqual([60, 64, 67]);
		expect(buildArpPattern([64, 60, 67], 'down', 2)).toEqual([79, 76, 72, 67, 64, 60]);
		expect(buildArpPattern([64, 60, 67], 'up-down', 1)).toEqual([60, 64, 67, 64]);
		expect(buildArpPattern([64, 60, 67], 'order', 2)).toEqual([64, 60, 67, 76, 72, 79]);
		expect(buildArpPattern([120, 125], 'up', 3)).toEqual([120, 125]);

		// Chord mode triggers all pattern notes simultaneously on each step
		const hChord = makeHarness(false, 0);
		hChord.scheduler.setConfig({ playMode: 'arp', arpMode: 'chord', arpOctaves: 1 });
		hChord.scheduler.setHeldNotes([64, 60, 67]);
		hChord.scheduler.start();
		expect(hChord.notes.map((n) => n.pitch)).toEqual([60, 64, 67]);
		expect(new Set(hChord.notes.map((n) => n.whenSeconds)).size).toBe(1);

		// Random mode is deterministic per seed and varies across seeds
		const runSeed = (seed: number) => {
			const h = makeHarness(false, 0);
			h.scheduler.setConfig({
				playMode: 'arp',
				arpMode: 'random',
				seed,
				bpm: 120,
				division: '1/16'
			});
			h.scheduler.setHeldNotes([60, 64, 67, 71]);
			h.scheduler.start();
			for (let t = 0.025; t <= 1.0; t += 0.025) h.scheduler.tick(t);
			return h.notes.map((n) => n.pitch);
		};
		expect(runSeed(12345)).toEqual(runSeed(12345));
		expect(runSeed(12345)).not.toEqual(runSeed(99999));
	});

	it('computes all 6 divisions accurately and applies swing to odd steps without drift', () => {
		expect(ARP_DIVISIONS).toEqual(['1/4', '1/8', '1/8t', '1/16', '1/16t', '1/32']);
		expect(stepDurationSeconds(120, '1/4')).toBeCloseTo(0.5, 9);
		expect(stepDurationSeconds(120, '1/8')).toBeCloseTo(0.25, 9);
		expect(stepDurationSeconds(120, '1/8t')).toBeCloseTo(1 / 6, 9);
		expect(stepDurationSeconds(120, '1/16')).toBeCloseTo(0.125, 9);
		expect(stepDurationSeconds(120, '1/16t')).toBeCloseTo(1 / 12, 9);
		expect(stepDurationSeconds(120, '1/32')).toBeCloseTo(0.0625, 9);

		// Swing = 0.5 at 120 BPM 1/16 (stepDur = 0.125s): odd step shifted by 0.5 * 0.4 * 0.125 = 0.025s
		const { scheduler, notes } = makeHarness(false, 0);
		scheduler.setConfig({ playMode: 'arp', arpMode: 'up', bpm: 120, division: '1/16', swing: 0.5 });
		scheduler.setHeldNotes([60, 64]);
		scheduler.start();
		for (let t = 0.025; t <= 0.4; t += 0.025) scheduler.tick(t);

		expect(notes[0].whenSeconds).toBeCloseTo(0.0, 9);
		expect(notes[1].whenSeconds).toBeCloseTo(0.15, 9);
		expect(notes[2].whenSeconds).toBeCloseTo(0.25, 9);
		expect(notes[3].whenSeconds).toBeCloseTo(0.4, 9);
	});

	it('maintains hold/latch across physical release and replaces cleanly on new press', () => {
		const { scheduler, notes } = makeHarness(false, 0);
		scheduler.setConfig({ playMode: 'arp', arpMode: 'up', hold: true, bpm: 120, division: '1/16' });
		scheduler.setHeldNotes([60, 64]);
		scheduler.setHeldNotes([]); // release physical keys -> latch persists
		expect(scheduler.snapshot().heldNotes).toEqual([60, 64]);

		scheduler.start();
		scheduler.tick(0.125);
		expect(notes.map((n) => n.pitch)).toEqual([60, 64]);

		// Pressing [67] after physical release replaces old latch buffer
		scheduler.setHeldNotes([67]);
		expect(scheduler.snapshot().heldNotes).toEqual([67]);

		// Turning hold off while physically empty clears latch
		scheduler.setHeldNotes([]);
		scheduler.setConfig({ hold: false });
		expect(scheduler.snapshot().heldNotes).toEqual([]);
	});

	it('handles empty arp held notes safely and triggers immediately when pressed', () => {
		const { scheduler, notes } = makeHarness(false, 0);
		scheduler.setConfig({ playMode: 'arp', bpm: 120, division: '1/16' });
		scheduler.start();
		scheduler.tick(0.5);
		expect(notes).toEqual([]);

		scheduler.setHeldNotes([60]);
		scheduler.tick(0.525);
		expect(notes).toHaveLength(1);
		expect(notes[0].whenSeconds).toBeCloseTo(0.525, 9);
	});

	it('supports 16-step sequencer ties, accents, noteOffset, and step recording', () => {
		const steps = createDefaultSequencerSteps();
		steps[0] = { active: true, note: null, noteOffset: 0, gate: 0.8, tie: true, accent: true };
		steps[1] = { active: true, note: null, noteOffset: 0, gate: 0.8, tie: true, accent: false };
		steps[2] = { active: true, note: null, noteOffset: 0, gate: 0.5, tie: false, accent: false };
		steps[3] = { active: false, note: null, noteOffset: 0, gate: 0.8, tie: false, accent: false };
		steps[4] = { active: true, note: 72, noteOffset: -2, gate: 0.6, tie: false, accent: false };

		const { scheduler, notes, steps: stepEvents } = makeHarness(false, 0);
		scheduler.setConfig({
			playMode: 'seq',
			bpm: 120,
			division: '1/16', // 0.125 s
			rootPitch: 60,
			velocity: 0.7,
			steps
		});
		scheduler.start();
		for (let t = 0.025; t <= 0.6; t += 0.025) scheduler.tick(t);

		// Steps 0..2 emit 1 tied note with duration = 2*0.125 + 0.5*0.125 = 0.3125s; step 4 emits 70
		expect(stepEvents.slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
		expect(notes).toHaveLength(2);
		expect(notes[0].pitch).toBe(60);
		expect(notes[0].velocity).toBeGreaterThan(0.7);
		expect(notes[0].durationSeconds).toBeCloseTo(0.3125, 9);
		expect(notes[1].pitch).toBe(70);
		expect(notes[1].durationSeconds).toBeCloseTo(0.075, 9);

		// All-16-steps-tied terminates cleanly at 16 steps and retriggers next cycle
		const allTied = createDefaultSequencerSteps().map((s) => ({ ...s, active: true, tie: true }));
		const hTied = makeHarness(false, 0);
		hTied.scheduler.setConfig({ playMode: 'seq', bpm: 120, division: '1/16', steps: allTied });
		hTied.scheduler.start();
		for (let t = 0.025; t <= 2.1; t += 0.025) hTied.scheduler.tick(t);
		expect(hTied.notes).toHaveLength(2); // step 0 of bar 1 and step 0 of bar 2
		expect(hTied.notes[0].durationSeconds).toBeCloseTo(15 * 0.125 + 0.75 * 0.125, 9);

		// Step recording
		expect(scheduler.recordStep(67)).toBeNull(); // stepRec is false
		scheduler.setConfig({ stepRec: true });
		for (let i = 0; i < SCHEDULER_STEP_COUNT; i++) {
			expect(scheduler.recordStep(60 + i, { accent: i === 0 })).toBe(i);
		}
		expect(scheduler.recordStep(76)).toBe(0); // wraps around 16 -> 0
		expect(scheduler.snapshot().config.steps[0].note).toBe(76);
	});

	it('schedules chord progression accompaniment, one-shot phrases, and tapTempo', () => {
		const onComplete = vi.fn();
		const { scheduler, notes, chords, setNow } = makeHarness(false, 1.0);
		scheduler.setConfig({
			playMode: 'off',
			chordProgression: {
				enabled: true,
				chords: [{ voicing: [48, 52, 57] }, { voicing: [50, 53, 60] }],
				currentIndex: 0,
				intervalSeconds: 1.0,
				accompaniment: true,
				velocity: 0.3,
				durationSeconds: 0.8
			}
		});
		scheduler.start();
		expect(chords).toEqual([0]);
		expect(notes.map((n) => n.pitch)).toEqual([48, 52, 57]);

		setNow(1.95);
		scheduler.tick();
		expect(chords).toEqual([0, 1]);
		expect(notes.slice(3).map((n) => n.pitch)).toEqual([50, 53, 60]);

		scheduler.startPhrase(
			[
				{ pitch: 60, at: 0, duration: 0.2, velocity: 0.6 },
				{ pitch: 64, at: 0.25, duration: 0.2, velocity: 0.7 }
			],
			{ onComplete }
		);
		setNow(2.0);
		scheduler.tick();
		setNow(2.25);
		scheduler.tick();
		setNow(2.6);
		scheduler.tick();
		expect(onComplete).toHaveBeenCalledTimes(1);

		// Tap tempo (0.5s intervals -> 120 BPM), stale gap (>2.5s) resets buffer, clamps [40..220]
		expect(scheduler.tapTempo(10.0)).toBeNull();
		expect(scheduler.tapTempo(10.5)).toBe(120);
		expect(scheduler.tapTempo(11.0)).toBe(120);
		expect(scheduler.tapTempo(20.0)).toBeNull();
		expect(scheduler.tapTempo(20.1)).toBe(SCHEDULER_MAX_BPM);
		expect(scheduler.tapTempo(25.0)).toBeNull();
		expect(scheduler.tapTempo(27.0)).toBe(SCHEDULER_MIN_BPM);
	});

	it('clamps malformed parameters and recovers from backwards/stale clock jumps without burst', () => {
		const { scheduler, notes } = makeHarness(false, 10.0);
		scheduler.setConfig({
			playMode: 'arp',
			bpm: NaN,
			gate: 99,
			swing: -2,
			velocity: Infinity,
			arpOctaves: 9 as 1,
			rootPitch: -10
		});
		const snap = scheduler.snapshot().config;
		expect(snap.bpm).toBe(120);
		expect(snap.gate).toBe(1);
		expect(snap.swing).toBe(0);
		expect(snap.velocity).toBe(0.72);
		expect(snap.arpOctaves).toBe(3);
		expect(snap.rootPitch).toBe(0);

		const def = createDefaultSchedulerConfig();
		expect(def.steps).toHaveLength(16);

		scheduler.setHeldNotes([60, 64]);
		scheduler.start();
		expect(notes).toHaveLength(1);

		// Far-forward clock jump (+40s) should recover without emitting 320 catch-up notes
		scheduler.tick(50.0);
		expect(notes.length).toBeLessThanOrEqual(3);

		// Backwards clock jump (50.0 -> 2.0) recovers cleanly
		const before = notes.length;
		scheduler.tick(2.0);
		expect(notes.length - before).toBeLessThanOrEqual(2);
		expect(notes.at(-1)!.whenSeconds).toBeGreaterThanOrEqual(2.0);
	});

	it('responds immediately to mid-run bpm/division speedup without stalling and maintains <1e-7s 10k-tick drift', () => {
		const { scheduler, notes, steps, setNow } = makeHarness(false, 0);
		scheduler.setConfig({ playMode: 'arp', arpMode: 'up', bpm: 40, division: '1/4' });
		scheduler.setHeldNotes([60, 64]);
		scheduler.start();
		expect(steps).toEqual([0]);

		setNow(0.1);
		scheduler.setConfig({ bpm: 220, division: '1/32' });
		for (let t = 0.125; t <= 1.0 + 1e-9; t += 0.025) {
			setNow(t);
			scheduler.tick();
		}
		// Must fire next step within <= 0.1s of the 0.1s speedup (no 1.4s stall)
		expect(notes.length).toBeGreaterThan(20);
		expect(notes[1].whenSeconds).toBeLessThanOrEqual(0.2);

		// 10,000-tick steady-state drift check at 220 BPM 1/32, swing 1.0
		const driftH = makeHarness(false, 0);
		driftH.scheduler.setConfig({
			playMode: 'arp',
			arpMode: 'up',
			bpm: 220,
			division: '1/32',
			swing: 1.0
		});
		driftH.scheduler.setHeldNotes([60, 64]);
		driftH.scheduler.start();
		for (let i = 1; i <= 10000; i++) {
			driftH.scheduler.tick(i * 0.025);
		}
		const stepDur = stepDurationSeconds(220, '1/32');
		let maxDrift = 0;
		for (let i = 0; i < driftH.notes.length; i++) {
			const expected = i * stepDur + (i % 2 === 1 ? 0.4 * stepDur : 0);
			maxDrift = Math.max(maxDrift, Math.abs(driftH.notes[i].whenSeconds - expected));
		}
		expect(driftH.notes.length).toBeGreaterThan(7000);
		expect(maxDrift).toBeLessThan(1e-7);
	});

	it('clears tiedSkipRemaining on playMode transitions and steps replacement', () => {
		const allTied = createDefaultSequencerSteps().map((s) => ({
			...s,
			active: true,
			note: 60,
			tie: true
		}));
		const untied72 = createDefaultSequencerSteps().map((s) => ({
			...s,
			active: true,
			note: 72,
			tie: false
		}));

		// Case A: seq (all tied) -> arp -> seq
		const hMode = makeHarness(false, 0);
		hMode.scheduler.setConfig({ playMode: 'seq', bpm: 120, division: '1/16', steps: allTied });
		hMode.scheduler.setHeldNotes([64]);
		hMode.scheduler.start();
		hMode.scheduler.tick(0.125);
		hMode.scheduler.setConfig({ playMode: 'arp' });
		hMode.scheduler.tick(0.25);
		hMode.scheduler.setConfig({ playMode: 'seq', steps: untied72 });
		hMode.scheduler.tick(0.375);
		const seqNotesAfter = hMode.notes.filter((n) => n.source === 'seq' && n.pitch === 72);
		expect(seqNotesAfter.length).toBeGreaterThanOrEqual(1);

		// Case B: mid-tie setConfig({ steps }) while staying in seq
		const hSteps = makeHarness(false, 0);
		hSteps.scheduler.setConfig({ playMode: 'seq', bpm: 120, division: '1/16', steps: allTied });
		hSteps.scheduler.start();
		hSteps.scheduler.setConfig({ steps: untied72 });
		hSteps.scheduler.tick(0.025);
		hSteps.scheduler.tick(0.15);
		expect(hSteps.notes.map((n) => n.pitch)).toEqual([60, 72, 72]);
	});

	it('does not drop pending odd step on mid-run swing reduction', () => {
		// 120 BPM 1/4 -> stepDur = 0.5s; swing 1.0 puts step 1 at 0.7s
		const { scheduler, notes, steps, setNow } = makeHarness(false, 0);
		scheduler.setConfig({
			playMode: 'arp',
			arpMode: 'up',
			bpm: 120,
			division: '1/4',
			swing: 1.0
		});
		scheduler.setHeldNotes([60, 64]);
		scheduler.start();
		expect(steps).toEqual([0]);

		setNow(0.59);
		scheduler.tick();
		expect(steps).toEqual([0]);

		scheduler.setConfig({ swing: 0.0 });
		setNow(0.615);
		scheduler.tick();
		expect(steps).toEqual([0, 1]);
		expect(notes.map((n) => n.pitch)).toEqual([60, 64]);
		expect(notes[1].whenSeconds).toBeCloseTo(0.615, 9);
	});

	it('plays chord index 0 first when chordProgression transitions from empty to populated mid-run', () => {
		const { scheduler, notes, chords, setNow } = makeHarness(false, 10.0);
		scheduler.setConfig({
			playMode: 'off',
			chordProgression: {
				enabled: true,
				chords: [],
				currentIndex: 0,
				intervalSeconds: 1.0,
				accompaniment: true
			}
		});
		scheduler.start();
		setNow(10.1);
		scheduler.tick();
		expect(chords).toEqual([]);

		scheduler.setConfig({
			chordProgression: {
				enabled: true,
				chords: [{ voicing: [60, 64] }, { voicing: [62, 65] }],
				currentIndex: 0,
				intervalSeconds: 1.0,
				accompaniment: true
			}
		});
		setNow(10.125);
		scheduler.tick();
		expect(chords).toEqual([0]);
		expect(notes.map((n) => n.pitch)).toEqual([60, 64]);
	});

	it('preserves pending odd step on mid-run bpm/division speedup while swing > 0', () => {
		const { scheduler, notes, steps, setNow } = makeHarness(false, 0);
		scheduler.setConfig({
			playMode: 'arp',
			arpMode: 'up',
			bpm: 120,
			division: '1/4',
			swing: 1.0
		});
		scheduler.setHeldNotes([60, 64]);
		scheduler.start();
		expect(steps).toEqual([0]);

		setNow(0.59);
		scheduler.tick();
		expect(steps).toEqual([0]);

		scheduler.setConfig({ bpm: 220, division: '1/32' });
		setNow(0.615);
		scheduler.tick();
		expect(steps.slice(0, 2)).toEqual([0, 1]);
		expect(notes[1].pitch).toBe(64);
		expect(notes[1].whenSeconds).toBeGreaterThanOrEqual(0.615);
	});

	it('starts cleanly at step 0 when playMode switches from off to seq or arp mid-run', () => {
		const seqSteps = createDefaultSequencerSteps().map((s, i) => ({
			...s,
			active: true,
			note: 60 + i
		}));
		const hSeq = makeHarness(false, 0);
		hSeq.scheduler.setConfig({
			playMode: 'off',
			bpm: 120,
			division: '1/16',
			steps: seqSteps
		});
		hSeq.scheduler.start();
		for (let t = 0.025; t <= 0.225 + 1e-9; t += 0.025) {
			hSeq.setNow(t);
			hSeq.scheduler.tick();
		}
		expect(hSeq.steps).toEqual([]);

		hSeq.setNow(0.24);
		hSeq.scheduler.setConfig({ playMode: 'seq' });
		hSeq.setNow(0.25);
		hSeq.scheduler.tick();
		expect(hSeq.steps[0]).toBe(0);
		expect(hSeq.notes[0].pitch).toBe(60);

		const hArp = makeHarness(false, 0);
		hArp.scheduler.setConfig({ playMode: 'off', bpm: 120, division: '1/16' });
		hArp.scheduler.setHeldNotes([60, 64]);
		hArp.scheduler.start();
		for (let t = 0.025; t <= 0.225 + 1e-9; t += 0.025) {
			hArp.setNow(t);
			hArp.scheduler.tick();
		}
		hArp.setNow(0.24);
		hArp.scheduler.setConfig({ playMode: 'arp' });
		hArp.setNow(0.25);
		hArp.scheduler.tick();
		expect(hArp.steps[0]).toBe(0);
		expect(hArp.notes[0].pitch).toBe(60);
	});

	it('handles re-entrant stop, setConfig, and stopPhrase inside callbacks without ghost notes or stale tempo', () => {
		// 1. stop() inside onStep(0) at 220 BPM 1/32
		const stopNotes: number[] = [];
		const stopSteps: number[] = [];
		const sStop = createSynthScheduler({
			nowSeconds: () => 0,
			scheduleNoteAt: (pitch) => stopNotes.push(pitch),
			onStep: (stepIdx) => {
				stopSteps.push(stepIdx);
				if (stepIdx === 0) sStop.stop();
			},
			autoTimer: false
		});
		sStop.setConfig({ playMode: 'arp', bpm: 220, division: '1/32' });
		sStop.setHeldNotes([60, 64]);
		sStop.start();
		expect(stopSteps).toEqual([0]);
		expect(stopNotes).toEqual([]);
		expect(sStop.snapshot().running).toBe(false);
		expect(sStop.snapshot().stepIndex).toBe(0);

		// 2. setConfig({ playMode: 'off' }) inside onStep(0) at 220 BPM 1/32
		const offNotes: number[] = [];
		const offSteps: number[] = [];
		const sOff = createSynthScheduler({
			nowSeconds: () => 0,
			scheduleNoteAt: (pitch) => offNotes.push(pitch),
			onStep: (stepIdx) => {
				offSteps.push(stepIdx);
				if (stepIdx === 0) sOff.setConfig({ playMode: 'off' });
			},
			autoTimer: false
		});
		sOff.setConfig({ playMode: 'arp', bpm: 220, division: '1/32' });
		sOff.setHeldNotes([60, 64]);
		sOff.start();
		expect(offSteps).toEqual([0]);
		expect(offNotes).toEqual([]);

		// 3. setConfig({ bpm: 220, division: '1/32' }) inside onStep(0) from 40 BPM 1/4
		let fastClock = 0;
		const fastNotes: EmittedNote[] = [];
		const sFast = createSynthScheduler({
			nowSeconds: () => fastClock,
			scheduleNoteAt: (pitch, velocity, whenSeconds, durationSeconds, source) => {
				fastNotes.push({ pitch, velocity, whenSeconds, durationSeconds, source });
			},
			onStep: (stepIdx) => {
				if (stepIdx === 0) sFast.setConfig({ bpm: 220, division: '1/32' });
			},
			autoTimer: false
		});
		sFast.setConfig({ playMode: 'arp', bpm: 40, division: '1/4' });
		sFast.setHeldNotes([60, 64]);
		sFast.start();
		fastClock = 0.025;
		sFast.tick();
		fastClock = 0.05;
		sFast.tick();
		expect(fastNotes.length).toBeGreaterThanOrEqual(3);
		expect(fastNotes[0].durationSeconds).toBeLessThan(0.1);

		// 4. stopPhrase() inside onEvent(0) cancels remaining in-lookahead events
		let phraseClock = 0;
		const phraseNotes: number[] = [];
		const onComplete = vi.fn();
		const sPhrase = createSynthScheduler({
			nowSeconds: () => phraseClock,
			scheduleNoteAt: (pitch) => phraseNotes.push(pitch),
			autoTimer: false
		});
		sPhrase.setConfig({ playMode: 'off' });
		sPhrase.start();
		sPhrase.startPhrase(
			[
				{ pitch: 60, at: 0, duration: 0.2, velocity: 0.6 },
				{ pitch: 64, at: 0.02, duration: 0.2, velocity: 0.6 }
			],
			{
				onEvent: (idx) => {
					if (idx === 0) sPhrase.stopPhrase();
				},
				onComplete
			}
		);
		phraseClock = 0.05;
		sPhrase.tick();
		phraseClock = 0.4;
		sPhrase.tick();
		expect(phraseNotes).toEqual([60]);
		expect(onComplete).not.toHaveBeenCalled();
	});

	it('applies tapTempo speedup immediately while running without stalling', () => {
		const { scheduler, notes, setNow } = makeHarness(false, 0);
		scheduler.setConfig({ playMode: 'arp', arpMode: 'up', bpm: 40, division: '1/4' });
		scheduler.setHeldNotes([60, 64]);
		scheduler.start();
		expect(notes).toHaveLength(1);

		expect(scheduler.tapTempo(0.1)).toBeNull();
		expect(scheduler.tapTempo(0.3727)).toBe(220);

		for (let t = 0.4; t <= 1.0 + 1e-9; t += 0.025) {
			setNow(t);
			scheduler.tick();
		}
		expect(notes.length).toBeGreaterThanOrEqual(3);
		expect(notes[1].whenSeconds).toBeLessThanOrEqual(0.7);
	});

	it('never leaks autoTimer intervals when initial chord callbacks call dispose or stop', () => {
		const createTimerSpy = () => {
			let nextId = 1;
			let created = 0;
			let cleared = 0;
			const activeIds = new Set<number>();
			return {
				setIntervalFn: (() => {
					const id = nextId++;
					created++;
					activeIds.add(id);
					return id as unknown as ReturnType<typeof setInterval>;
				}) as NonNullable<Parameters<typeof createSynthScheduler>[0]['setIntervalFn']>,
				clearIntervalFn: ((id: ReturnType<typeof setInterval>) => {
					const numId = id as unknown as number;
					if (activeIds.delete(numId)) {
						cleared++;
					}
				}) as NonNullable<Parameters<typeof createSynthScheduler>[0]['clearIntervalFn']>,
				stats: () => ({ created, cleared, activeSize: activeIds.size })
			};
		};

		// 1. onChordChange calls dispose() during initial start()
		const spyDispose = createTimerSpy();
		const sDispose = createSynthScheduler({
			nowSeconds: () => 0,
			scheduleNoteAt: () => {},
			onChordChange: () => sDispose.dispose(),
			autoTimer: true,
			setIntervalFn: spyDispose.setIntervalFn,
			clearIntervalFn: spyDispose.clearIntervalFn
		});
		sDispose.setConfig({
			playMode: 'off',
			chordProgression: {
				enabled: true,
				chords: [{ voicing: [48, 52, 57] }],
				currentIndex: 0,
				intervalSeconds: 1.0,
				accompaniment: true
			}
		});
		sDispose.start();
		expect(sDispose.snapshot().disposed).toBe(true);
		expect(sDispose.snapshot().running).toBe(false);
		expect(spyDispose.stats().created - spyDispose.stats().cleared).toBe(0);
		expect(spyDispose.stats().activeSize).toBe(0);

		// 2. scheduleNoteAt calls dispose() during initial chord emission in start()
		const spyNoteDispose = createTimerSpy();
		const noteOnChordChange = vi.fn();
		const sNoteDispose = createSynthScheduler({
			nowSeconds: () => 0,
			scheduleNoteAt: () => sNoteDispose.dispose(),
			onChordChange: noteOnChordChange,
			autoTimer: true,
			setIntervalFn: spyNoteDispose.setIntervalFn,
			clearIntervalFn: spyNoteDispose.clearIntervalFn
		});
		sNoteDispose.setConfig({
			playMode: 'off',
			chordProgression: {
				enabled: true,
				chords: [{ voicing: [48, 52, 57] }],
				currentIndex: 0,
				intervalSeconds: 1.0,
				accompaniment: true
			}
		});
		sNoteDispose.start();
		expect(noteOnChordChange).not.toHaveBeenCalled();
		expect(spyNoteDispose.stats().created - spyNoteDispose.stats().cleared).toBe(0);
		expect(spyNoteDispose.stats().activeSize).toBe(0);

		// 3. onChordChange calls stop() on first start(), then restarts and disposes cleanly
		const spyRestart = createTimerSpy();
		let stopOnce = true;
		let restartClock = 0;
		const restartChords: number[] = [];
		const sRestart = createSynthScheduler({
			nowSeconds: () => restartClock,
			scheduleNoteAt: () => {},
			onChordChange: (idx) => {
				restartChords.push(idx);
				if (stopOnce) {
					stopOnce = false;
					sRestart.stop();
				} else if (restartChords.length === 2) {
					// Updating intervalSeconds inside onChordChange takes effect immediately
					sRestart.setConfig({
						chordProgression: {
							enabled: true,
							chords: [{ voicing: [48, 52] }, { voicing: [50, 53] }],
							currentIndex: 0,
							intervalSeconds: 0.5,
							accompaniment: true
						}
					});
				}
			},
			autoTimer: true,
			setIntervalFn: spyRestart.setIntervalFn,
			clearIntervalFn: spyRestart.clearIntervalFn
		});
		sRestart.setConfig({
			playMode: 'off',
			chordProgression: {
				enabled: true,
				chords: [{ voicing: [48, 52] }, { voicing: [50, 53] }],
				currentIndex: 0,
				intervalSeconds: 2.0,
				accompaniment: true
			}
		});
		sRestart.start();
		expect(sRestart.snapshot().running).toBe(false);
		expect(spyRestart.stats().activeSize).toBe(0);

		sRestart.start();
		expect(sRestart.snapshot().running).toBe(true);
		expect(spyRestart.stats().activeSize).toBe(1);
		restartClock = 0.45;
		sRestart.tick();
		expect(restartChords).toEqual([0, 0, 1]);

		sRestart.dispose();
		expect(spyRestart.stats().created - spyRestart.stats().cleared).toBe(0);
		expect(spyRestart.stats().activeSize).toBe(0);
	});

	it('aborts stale chord voicing and skips onChordChange when chordProgression is replaced mid-voicing', () => {
		let now = 0;
		const emittedPitches: number[] = [];
		const chordCallbacks: number[] = [];
		const scheduler = createSynthScheduler({
			nowSeconds: () => now,
			scheduleNoteAt: (pitch) => {
				emittedPitches.push(pitch);
				if (pitch === 50) {
					scheduler.setConfig({
						chordProgression: {
							enabled: true,
							chords: [{ voicing: [72] }],
							currentIndex: 0,
							intervalSeconds: 1.0,
							accompaniment: true
						}
					});
				}
			},
			onChordChange: (idx) => chordCallbacks.push(idx),
			autoTimer: false
		});

		scheduler.setConfig({
			playMode: 'off',
			chordProgression: {
				enabled: true,
				chords: [{ voicing: [48, 52, 57] }, { voicing: [50, 53, 60] }],
				currentIndex: 0,
				intervalSeconds: 1.0,
				accompaniment: true
			}
		});
		scheduler.start();
		expect(emittedPitches).toEqual([48, 52, 57]);
		expect(chordCallbacks).toEqual([0]);

		now = 0.95;
		scheduler.tick();
		expect(emittedPitches).toEqual([48, 52, 57, 50]);
		expect(chordCallbacks).toEqual([0]);
	});

	it('uses runEpoch guard to prevent double-emit on synchronous stop(); start() inside callbacks', () => {
		// 1. onStep(0) calls stop(); start(); at t = 0
		let clock = 0;
		const stepNotes: EmittedNote[] = [];
		const stepCalls: number[] = [];
		let restartedStep = false;
		const sStep = createSynthScheduler({
			nowSeconds: () => clock,
			scheduleNoteAt: (pitch, velocity, whenSeconds, durationSeconds, source) => {
				stepNotes.push({ pitch, velocity, whenSeconds, durationSeconds, source });
			},
			onStep: (stepIdx) => {
				stepCalls.push(stepIdx);
				if (stepIdx === 0 && !restartedStep) {
					restartedStep = true;
					sStep.stop();
					sStep.start();
				}
			},
			autoTimer: false
		});
		sStep.setConfig({ playMode: 'arp', arpMode: 'up', bpm: 120, division: '1/16' });
		sStep.setHeldNotes([60, 64, 67]);
		sStep.start();
		expect(stepCalls).toEqual([0, 0]);
		expect(stepNotes.map((n) => n.pitch)).toEqual([60]);
		expect(sStep.snapshot().running).toBe(true);
		expect(sStep.snapshot().stepIndex).toBe(1);

		clock = 0.05;
		sStep.tick();
		expect(stepNotes.map((n) => n.pitch)).toEqual([60, 64]);

		// 2. onChordChange(0) during start() calls stop(); start();
		const chordPitches: number[] = [];
		const chordIndices: number[] = [];
		let restartedChord = false;
		const sChord = createSynthScheduler({
			nowSeconds: () => 0,
			scheduleNoteAt: (pitch) => chordPitches.push(pitch),
			onChordChange: (idx) => {
				chordIndices.push(idx);
				if (!restartedChord) {
					restartedChord = true;
					sChord.stop();
					sChord.start();
				}
			},
			autoTimer: false
		});
		sChord.setConfig({
			playMode: 'off',
			chordProgression: {
				enabled: true,
				chords: [{ voicing: [48, 52] }, { voicing: [50, 53] }],
				currentIndex: 0,
				intervalSeconds: 1.0,
				accompaniment: true
			}
		});
		sChord.start();
		expect(chordIndices).toEqual([0, 0]);
		expect(chordPitches).toEqual([48, 52, 48, 52]);
		expect(sChord.snapshot().running).toBe(true);

		// 3. onEvent(0) inside phrase calls stop(); start(); and cancels remaining phrase events
		let phraseClock = 0;
		const phraseNotes: number[] = [];
		const onComplete = vi.fn();
		let restartedPhrase = false;
		const sPhrase = createSynthScheduler({
			nowSeconds: () => phraseClock,
			scheduleNoteAt: (pitch) => phraseNotes.push(pitch),
			autoTimer: false
		});
		sPhrase.setConfig({ playMode: 'off' });
		sPhrase.start();
		sPhrase.startPhrase(
			[
				{ pitch: 60, at: 0, duration: 0.2, velocity: 0.6 },
				{ pitch: 64, at: 0.02, duration: 0.2, velocity: 0.6 }
			],
			{
				onEvent: (idx) => {
					if (idx === 0 && !restartedPhrase) {
						restartedPhrase = true;
						sPhrase.stop();
						sPhrase.start();
					}
				},
				onComplete
			}
		);
		phraseClock = 0.05;
		sPhrase.tick();
		phraseClock = 0.4;
		sPhrase.tick();
		expect(phraseNotes).toEqual([60]);
		expect(onComplete).not.toHaveBeenCalled();
	});
});

describe('Tier 5: synth-scheduler live progression & wrap-around swing ties', () => {
	it('updates chordProgression intervalSeconds and currentIndex immediately while already enabled', () => {
		const { scheduler, chords, setNow } = makeHarness(false, 0);
		const threeChords = [{ voicing: [48, 52] }, { voicing: [50, 53] }, { voicing: [55, 59] }];
		scheduler.setConfig({
			playMode: 'off',
			chordProgression: {
				enabled: true,
				chords: threeChords,
				currentIndex: 0,
				intervalSeconds: 10.0,
				accompaniment: true
			}
		});
		scheduler.start();
		expect(chords).toEqual([0]);

		setNow(0.2);
		scheduler.setConfig({
			chordProgression: {
				enabled: true,
				chords: threeChords,
				currentIndex: 2,
				intervalSeconds: 0.5,
				accompaniment: true
			}
		});
		for (let t = 0.25; t <= 0.8 + 1e-9; t += 0.025) {
			setNow(t);
			scheduler.tick();
		}
		// Advances from 2 -> 0 within 0.5s (not stalled for 10s, and not 0 -> 1)
		expect(chords).toEqual([0, 0]);
	});

	it('handles wrap-around sequencer tie (step 15 -> step 0) accurately under swing > 0', () => {
		const steps = createDefaultSequencerSteps();
		steps[15] = { active: true, note: 60, noteOffset: 0, gate: 0.8, tie: true, accent: false };
		steps[0] = { active: true, note: 62, noteOffset: 0, gate: 0.5, tie: false, accent: false };
		const { scheduler, notes, setNow } = makeHarness(false, 0);
		scheduler.setConfig({
			playMode: 'seq',
			bpm: 120,
			division: '1/16',
			swing: 0.5,
			steps
		});
		scheduler.start();
		for (let t = 0.025; t <= 2.2 + 1e-9; t += 0.025) {
			setNow(t);
			scheduler.tick();
		}
		// Step 0 of bar 1 emits 62; step 15 ties across into step 0 of bar 2 (skips bar-2 step 0)
		const stepDur = stepDurationSeconds(120, '1/16'); // 0.125s
		const slot15 = stepDur * (1 - 0.5 * 0.4); // 0.10s
		const slot0 = stepDur * (1 + 0.5 * 0.4); // 0.15s
		expect(notes.map((n) => n.pitch)).toEqual([62, 60]);
		expect(notes[1].durationSeconds).toBeCloseTo(slot15 + slot0 * 0.5, 9);
	});
});
