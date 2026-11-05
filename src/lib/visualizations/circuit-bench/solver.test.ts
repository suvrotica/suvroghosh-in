import { describe, expect, it } from 'vitest';
import { getExampleCircuit, CIRCUIT_EXAMPLES } from './examples';
import { evaluateCircuitAtInstant, runSimulationBatch, stepTransientMna } from './solver';
import { formatMeasurement } from './notation';
import { addComponent, connectEndpoints, deleteSelection } from './model';
import { CircuitWorkerClient } from './worker-client';

describe('Circuit Bench MNA & Transient Solver', () => {
	it('verifies Ohm’s law: 5 V across 1 kΩ produces 5 mA and 25 mW', () => {
		const doc = getExampleCircuit('ohms-law');
		const res = evaluateCircuitAtInstant(doc, 0);
		expect(res.ok).toBe(true);
		if (!res.ok) return;

		const r1 = res.snapshot.components['r1'];
		const v1 = res.snapshot.components['v1'];
		expect(r1.voltageDrop).toBeCloseTo(5.0, 9);
		expect(r1.current).toBeCloseTo(0.005, 9); // 5 mA
		expect(r1.power).toBeCloseTo(0.025, 9); // 25 mW
		expect(v1.current).toBeCloseTo(0.005, 9);
		expect(formatMeasurement(r1.current, 'A')).toBe('5.00 mA');
		expect(formatMeasurement(r1.power, 'W')).toBe('25.00 mW');
	});

	it('verifies unloaded voltage divider: two equal 1 kΩ resistors divide 5 V in half', () => {
		const doc = getExampleCircuit('voltage-divider');
		const res = evaluateCircuitAtInstant(doc, 0);
		expect(res.ok).toBe(true);
		if (!res.ok) return;

		const r1 = res.snapshot.components['r1'];
		const r2 = res.snapshot.components['r2'];
		const p1 = res.snapshot.components['p1'];
		expect(r1.voltageDrop).toBeCloseTo(2.5, 9);
		expect(r2.voltageDrop).toBeCloseTo(2.5, 9);
		expect(p1.voltageDrop).toBeCloseTo(2.5, 9);
		expect(r1.current).toBeCloseTo(0.0025, 9);
	});

	it('verifies loaded voltage divider: 1 kΩ load pulls midpoint down to 5/3 V (1.67 V)', () => {
		const doc = getExampleCircuit('loaded-divider');
		const res = evaluateCircuitAtInstant(doc, 0);
		expect(res.ok).toBe(true);
		if (!res.ok) return;

		const p1 = res.snapshot.components['p1'];
		const r3 = res.snapshot.components['r3'];
		expect(p1.voltageDrop).toBeCloseTo(5 / 3, 6);
		expect(r3.current).toBeCloseTo(5 / 3000, 6);
		expect(formatMeasurement(p1.voltageDrop, 'V')).toBe('1.67 V');
	});

	it('verifies parallel and series resistors: 10 mA in parallel, 5 mA single, and 2.5 mA in series', () => {
		const doc = getExampleCircuit('series-parallel');
		const res = evaluateCircuitAtInstant(doc, 0);
		expect(res.ok).toBe(true);
		if (!res.ok) return;

		const v1 = res.snapshot.components['v1'];
		const r1 = res.snapshot.components['r1'];
		const r2 = res.snapshot.components['r2'];
		expect(r1.current).toBeCloseTo(0.005, 9);
		expect(r2.current).toBeCloseTo(0.005, 9);
		expect(v1.current).toBeCloseTo(0.01, 9); // 10 mA total

		// Opening S1 disconnects parallel branch R2 and drops total current to 5 mA
		const s1 = doc.components.find((c) => c.id === 's1')!;
		s1.params.closed = false;
		const openRes = evaluateCircuitAtInstant(doc, 0);
		expect(openRes.ok).toBe(true);
		if (!openRes.ok) return;
		expect(openRes.snapshot.components['v1'].current).toBeCloseTo(0.005, 9);
		expect(openRes.snapshot.components['r2'].current).toBeCloseTo(0, 9);

		// Opening bypass switch S2 places R1 and R3 in series (2 kΩ total -> 2.5 mA, 2.5 V across each)
		const s2 = doc.components.find((c) => c.id === 's2')!;
		s2.params.closed = false;
		const seriesRes = evaluateCircuitAtInstant(doc, 0);
		expect(seriesRes.ok).toBe(true);
		if (!seriesRes.ok) return;
		expect(seriesRes.snapshot.components['v1'].current).toBeCloseTo(0.0025, 9);
		expect(seriesRes.snapshot.components['r1'].current).toBeCloseTo(0.0025, 9);
		expect(seriesRes.snapshot.components['r3'].current).toBeCloseTo(0.0025, 9);
		expect(seriesRes.snapshot.components['r1'].voltageDrop).toBeCloseTo(2.5, 9);
		expect(seriesRes.snapshot.components['r3'].voltageDrop).toBeCloseTo(2.5, 9);
	});

	it('verifies default RC charging example against analytical curve at t = 0, 1 s, and 5 s', () => {
		const doc = getExampleCircuit('rc-charging');
		// At t = 0+, capacitor is explicitly uncharged (0 V) and initial current is 5 mA
		const init = evaluateCircuitAtInstant(doc, 0);
		expect(init.ok).toBe(true);
		if (!init.ok) return;

		expect(init.snapshot.components['c1'].voltageDrop).toBeCloseTo(0, 9);
		expect(init.snapshot.components['r1'].current).toBeCloseTo(0.005, 9);
		expect(init.snapshot.components['c1'].current).toBeCloseTo(0.005, 9);

		// Run to t = 1.000 s (500 steps of dt = 0.002 s)
		const batch1s = runSimulationBatch(doc, init.snapshot, 500, 0);
		expect(batch1s.ok).toBe(true);
		const snap1s = batch1s.snapshot!;
		expect(snap1s.timeSec).toBeCloseTo(1.0, 6);

		const exactVc1s = 5 * (1 - Math.exp(-1)); // 3.16060279 V
		const exactIr1s = 0.005 * Math.exp(-1); // 0.001839397 A
		expect(snap1s.components['c1'].voltageDrop).toBeCloseTo(exactVc1s, 4);
		expect(snap1s.components['r1'].current).toBeCloseTo(exactIr1s, 6);
		expect(formatMeasurement(snap1s.components['c1'].voltageDrop, 'V')).toBe('3.16 V');
		expect(formatMeasurement(snap1s.components['r1'].current, 'A')).toBe('1.84 mA');
		expect(formatMeasurement(snap1s.components['r1'].power, 'W')).toBe('3.38 mW');

		// Continue from 1 s to 5 s (4 batches of 500 steps = 2000 steps of 0.002 s)
		let snap = snap1s;
		for (let i = 0; i < 4; i += 1) {
			const b = runSimulationBatch(doc, snap, 500, snap.timeSec);
			expect(b.ok).toBe(true);
			snap = b.snapshot!;
		}
		expect(snap.timeSec).toBeCloseTo(5.0, 6);
		const exactVc5s = 5 * (1 - Math.exp(-5)); // 4.96631027 V
		expect(snap.components['c1'].voltageDrop).toBeCloseTo(exactVc5s, 4);
		expect(formatMeasurement(snap.components['c1'].voltageDrop, 'V')).toBe('4.97 V');
	});

	it('verifies doubling resistance in RC charging doubles time constant and halves initial current', () => {
		const doc = getExampleCircuit('rc-charging');
		const r1 = doc.components.find((c) => c.id === 'r1')!;
		r1.params.resistance = 2000; // Double from 1 kΩ to 2 kΩ (tau = 2 s)

		const init = evaluateCircuitAtInstant(doc, 0);
		expect(init.ok).toBe(true);
		if (!init.ok) return;
		expect(init.snapshot.components['r1'].current).toBeCloseTo(0.0025, 9); // Halved to 2.5 mA

		// Run to t = 2.0 s (1 time constant of the doubled resistance: 1000 steps of 0.002 s)
		const b1 = runSimulationBatch(doc, init.snapshot, 500, 0);
		const b2 = runSimulationBatch(doc, b1.snapshot, 500, 1);
		expect(b2.snapshot!.timeSec).toBeCloseTo(2.0, 6);
		expect(b2.snapshot!.components['c1'].voltageDrop).toBeCloseTo(5 * (1 - Math.exp(-1)), 4);
	});

	it('verifies second-order convergence as the time step dt is reduced', () => {
		const targetTime = 1.0;
		const exactVc = 5 * (1 - Math.exp(-1));
		const dts = [0.04, 0.02, 0.01];
		const errors: number[] = [];

		for (const dt of dts) {
			const doc = getExampleCircuit('rc-charging');
			doc.simulation.dtSec = dt;
			const init = evaluateCircuitAtInstant(doc, 0);
			if (!init.ok) throw new Error('Init failed');
			let snap = init.snapshot;
			const steps = Math.round(targetTime / dt);
			for (let i = 0; i < steps; i += 1) {
				const next = stepTransientMna(doc, snap, dt, 'trap');
				if (!next.ok) throw new Error('Step failed');
				snap = next.snapshot;
			}
			errors.push(Math.abs(snap.components['c1'].voltageDrop - exactVc));
		}

		// Halving dt should reduce Trapezoidal error by ~4x
		expect(errors[1]).toBeLessThan(errors[0] * 0.3);
		expect(errors[2]).toBeLessThan(errors[1] * 0.3);
	});

	it('verifies underdamped RLC step response against analytical damped sinusoid reference', () => {
		const doc = getExampleCircuit('rlc-response');
		// Vs = 5 V, R = 20 Ω, L = 0.1 H, C = 10 uF
		const Vs = 5;
		const R = 20;
		const L = 0.1;
		const C = 10e-6;
		const alpha = R / (2 * L); // 100 s^-1
		const omega0 = 1 / Math.sqrt(L * C); // 1000 rad/s
		const omegad = Math.sqrt(omega0 * omega0 - alpha * alpha); // ~994.987 rad/s

		const init = evaluateCircuitAtInstant(doc, 0);
		expect(init.ok).toBe(true);
		if (!init.ok) return;

		let snap = init.snapshot;
		const dt = doc.simulation.dtSec; // 20 us
		// Step to first peak at t = pi / omegad ≈ 3.157 ms (~158 steps)
		const stepsToPeak = Math.round(Math.PI / omegad / dt);
		for (let i = 0; i < stepsToPeak; i += 1) {
			const next = stepTransientMna(doc, snap, dt, 'trap');
			expect(next.ok).toBe(true);
			if (!next.ok) return;
			snap = next.snapshot;
		}

		const t = snap.timeSec;
		const exactVc =
			Vs *
			(1 - Math.exp(-alpha * t) * (Math.cos(omegad * t) + (alpha / omegad) * Math.sin(omegad * t)));
		const exactIl = (Vs / (L * omegad)) * Math.exp(-alpha * t) * Math.sin(omegad * t);

		expect(snap.components['c1'].voltageDrop).toBeCloseTo(exactVc, 2);
		expect(snap.components['l1'].current).toBeCloseTo(exactIl, 3);
		expect(snap.components['c1'].voltageDrop).toBeGreaterThan(8.6);
	});

	it('verifies sine source, square source, SPDT changeover switch, and differential probe models', () => {
		// 1. SPDT changeover switch charging then discharging
		const spdtDoc = getExampleCircuit('rc-charge-discharge');
		const initSpdt = evaluateCircuitAtInstant(spdtDoc, 0);
		expect(initSpdt.ok).toBe(true);
		if (!initSpdt.ok) return;
		expect(initSpdt.snapshot.components['r1'].current).toBeCloseTo(0.005, 6);

		// Charge for 1 s, then flip S1 to position B while preserving capacitor voltage
		const charged = runSimulationBatch(spdtDoc, initSpdt.snapshot, 500, 0);
		expect(charged.ok).toBe(true);
		const vCharged = charged.snapshot!.components['c1'].voltageDrop;
		expect(vCharged).toBeCloseTo(3.1606, 3);

		const s1 = spdtDoc.components.find((c) => c.id === 's1')!;
		s1.params.position = 'B';
		const afterFlip = evaluateCircuitAtInstant(
			spdtDoc,
			charged.snapshot!.timeSec,
			charged.snapshot!.reactiveState
		);
		expect(afterFlip.ok).toBe(true);
		if (!afterFlip.ok) return;
		// Capacitor voltage is preserved, and resistor current immediately reverses to -Vc / R!
		expect(afterFlip.snapshot.components['c1'].voltageDrop).toBeCloseTo(vCharged, 6);
		expect(afterFlip.snapshot.components['r1'].current).toBeCloseTo(-vCharged / 1000, 6);

		// 2. Sine and square wave sources + differential probe
		const acDoc = getExampleCircuit('ohms-law');
		const v1 = acDoc.components.find((c) => c.id === 'v1')!;
		v1.kind = 'square_voltage';
		v1.params = { amplitude: 4, frequency: 10, offset: 1, dutyPercent: 50 };

		// Add differential probe across R1
		const addedProbe = addComponent(acDoc, 'probe_voltage', { x: 15, y: 6 });
		if ('error' in addedProbe) throw new Error(addedProbe.error);
		const diffDoc = addedProbe.doc;
		const probe = diffDoc.components.find((c) => c.id === addedProbe.added.id)!;
		probe.params.probeMode = 'differential';
		const w1 = connectEndpoints(
			diffDoc,
			{ type: 'terminal', componentId: probe.id, terminalId: 'pos' },
			{ type: 'terminal', componentId: 'r1', terminalId: 'A' }
		);
		if ('error' in w1) throw new Error(w1.error);
		const w2 = connectEndpoints(
			w1.doc,
			{ type: 'terminal', componentId: probe.id, terminalId: 'neg' },
			{ type: 'terminal', componentId: 'r1', terminalId: 'B' }
		);
		if ('error' in w2) throw new Error(w2.error);

		// High phase of square wave (t = 0.01 s -> +5 V)
		const highSnap = evaluateCircuitAtInstant(w2.doc, 0.01);
		expect(highSnap.ok).toBe(true);
		if (highSnap.ok) {
			expect(highSnap.snapshot.components[probe.id].voltageDrop).toBeCloseTo(5, 6);
		}
		// Low phase of square wave (t = 0.07 s -> 1 - 4 = -3 V)
		const lowSnap = evaluateCircuitAtInstant(w2.doc, 0.07);
		expect(lowSnap.ok).toBe(true);
		if (lowSnap.ok) {
			expect(lowSnap.snapshot.components[probe.id].voltageDrop).toBeCloseTo(-3, 6);
		}
	});

	it('identifies missing ground, floating terminals, and conflicting voltage loops with specific element labels', () => {
		// Missing ground
		const noGroundDoc = deleteSelection(getExampleCircuit('ohms-law'), ['gnd1']);
		const noGroundRes = evaluateCircuitAtInstant(noGroundDoc, 0);
		expect(noGroundRes.ok).toBe(false);
		if (!noGroundRes.ok) {
			expect(noGroundRes.diagnostics[0].code).toBe('missing_ground');
		}

		// Floating terminal (delete top wire between V1 and R1)
		const floatingDoc = deleteSelection(getExampleCircuit('ohms-law'), ['w_top']);
		const floatingRes = evaluateCircuitAtInstant(floatingDoc, 0);
		expect(floatingRes.ok).toBe(false);
		if (!floatingRes.ok) {
			expect(floatingRes.diagnostics[0].code).toBe('floating_node');
			expect(floatingRes.diagnostics[0].affectedLabels).toContain('V1');
			expect(floatingRes.diagnostics[0].affectedLabels).toContain('R1');
		}

		// Conflicting ideal voltage sources in parallel
		const baseDoc = getExampleCircuit('ohms-law');
		const addedV2 = addComponent(baseDoc, 'dc_voltage', { x: 8, y: 6 });
		if ('error' in addedV2) throw new Error(addedV2.error);
		const v2 = addedV2.added;
		v2.params.voltage = 9;
		const c1 = connectEndpoints(
			addedV2.doc,
			{ type: 'terminal', componentId: v2.id, terminalId: 'pos' },
			{ type: 'terminal', componentId: 'v1', terminalId: 'pos' }
		);
		if ('error' in c1) throw new Error(c1.error);
		const c2 = connectEndpoints(
			c1.doc,
			{ type: 'terminal', componentId: v2.id, terminalId: 'neg' },
			{ type: 'terminal', componentId: 'v1', terminalId: 'neg' }
		);
		if ('error' in c2) throw new Error(c2.error);

		const conflictRes = evaluateCircuitAtInstant(c2.doc, 0);
		expect(conflictRes.ok).toBe(false);
		if (!conflictRes.ok) {
			expect(conflictRes.diagnostics[0].code).toBe('conflicting_sources');
			expect(conflictRes.diagnostics[0].affectedLabels).toContain('V1');
			expect(conflictRes.diagnostics[0].affectedLabels).toContain('V2');
		}
	});

	it('solves all prepared examples cleanly and supports worker client execution and cancellation', async () => {
		for (const ex of CIRCUIT_EXAMPLES) {
			if (ex.id === 'blank') continue;
			const doc = getExampleCircuit(ex.id);
			const res = evaluateCircuitAtInstant(doc, 0);
			expect(res.ok, `Example ${ex.id} should evaluate cleanly`).toBe(true);
		}

		const client = new CircuitWorkerClient({ forceSync: true });
		const doc = getExampleCircuit('rc-charging');
		const init = await client.evaluateInstant(doc, 0);
		expect(init.ok).toBe(true);
		const batch = await client.runBatch(doc, init.snapshot, 50, 0);
		expect(batch.ok).toBe(true);
		expect(batch.samples.length).toBeGreaterThan(0);
		client.cancelActive();
		client.dispose();
	});

	it('prevents trapezoidal ringing when C1 is reduced to 100 nF or 1 pF in RC charging (F-01)', () => {
		for (const capValue of [100e-9, 1e-12]) {
			const doc = getExampleCircuit('rc-charging');
			const c1 = doc.components.find((c) => c.id === 'c1')!;
			c1.params.capacitance = capValue;

			const init = evaluateCircuitAtInstant(doc, 0);
			expect(init.ok).toBe(true);
			if (!init.ok) return;

			let snap = init.snapshot;
			let prevVc = snap.components['c1'].voltageDrop;
			for (let i = 0; i < 10; i += 1) {
				const next = stepTransientMna(doc, snap, doc.simulation.dtSec, 'trap');
				expect(next.ok).toBe(true);
				if (!next.ok) return;
				snap = next.snapshot;
				const vc = snap.components['c1'].voltageDrop;
				expect(vc).toBeGreaterThanOrEqual(prevVc - 1e-12);
				expect(vc).toBeLessThanOrEqual(5.000001);
				prevVc = vc;
			}
			expect(snap.components['c1'].voltageDrop).toBeCloseTo(5.0, 5);
		}
	});

	it('adapts simulation dtSec and sampleIntervalSec for 20 kHz and 100 kHz AC sources without aliasing (F-02)', () => {
		for (const freqHz of [20000, 100000]) {
			const doc = getExampleCircuit('rc-low-pass');
			const v1 = doc.components.find((c) => c.id === 'v1')!;
			v1.params.frequency = freqHz;

			const stepsPerCycle = 1 / (freqHz * doc.simulation.dtSec);
			const scopeSamplesPerCycle = 1 / (freqHz * doc.simulation.sampleIntervalSec);
			expect(stepsPerCycle).toBeGreaterThanOrEqual(40);
			expect(scopeSamplesPerCycle).toBeGreaterThanOrEqual(20);

			const init = evaluateCircuitAtInstant(doc, 0);
			expect(init.ok).toBe(true);
			if (!init.ok) return;

			const batch = runSimulationBatch(doc, init.snapshot, 80, 0);
			expect(batch.ok).toBe(true);
			const peakInput = Math.max(...batch.samples.map((s) => Math.abs(s.ch2 ?? 0)));
			expect(peakInput).toBeGreaterThan(4.9);
		}
	});

	it('measures 2.50 V unloaded divider midpoint on P1 when load switch S1 is opened (F-03)', () => {
		const doc = getExampleCircuit('loaded-divider');
		const s1 = doc.components.find((c) => c.id === 's1')!;
		s1.params.closed = false;

		const res = evaluateCircuitAtInstant(doc, 0);
		expect(res.ok).toBe(true);
		if (!res.ok) return;

		expect(res.snapshot.components['p1'].voltageDrop).toBeCloseTo(2.5, 6);
		expect(res.snapshot.components['r3'].current).toBeCloseTo(0, 9);
	});

	it('conserves total instantaneous power across sources and loads and formats millivolt readouts (F-07, F-11)', () => {
		const doc = getExampleCircuit('ohms-law');
		const res = evaluateCircuitAtInstant(doc, 0);
		expect(res.ok).toBe(true);
		if (!res.ok) return;

		const v1Power = res.snapshot.components['v1'].power;
		const r1Power = res.snapshot.components['r1'].power;
		expect(v1Power).toBeCloseTo(-0.025, 12);
		expect(r1Power).toBeCloseTo(0.025, 12);
		const totalPower = Object.values(res.snapshot.components).reduce((acc, c) => acc + c.power, 0);
		expect(Math.abs(totalPower)).toBeLessThan(1e-12);

		expect(formatMeasurement(0.01234, 'V')).toBe('12.34 mV');
		expect(formatMeasurement(0.085, 'V')).toBe('85.00 mV');
	});

	it('accurately integrates high-frequency RLC oscillation when C1 is set to 1 pF (3.39 V at 60 µs, 8.90 V at 120 µs) and 100 nF (5.318 V at 9.600 ms)', () => {
		const doc1p = getExampleCircuit('rlc-response');
		doc1p.components.find((c) => c.id === 'c1')!.params.capacitance = 1e-12; // 1 pF

		const init1p = evaluateCircuitAtInstant(doc1p, 0);
		expect(init1p.ok).toBe(true);
		if (!init1p.ok) return;

		const batch1p = runSimulationBatch(doc1p, init1p.snapshot, 6, 0);
		expect(batch1p.ok).toBe(true);
		expect(batch1p.samples.length).toBe(2);

		const sample60us = batch1p.samples[0];
		const sample120us = batch1p.samples[1];
		expect(sample60us.timeSec).toBeCloseTo(60e-6, 9);
		expect(sample120us.timeSec).toBeCloseTo(120e-6, 9);
		expect(sample60us.ch1).toBeCloseTo(3.390757, 4);
		expect(sample120us.ch1).toBeCloseTo(8.90459, 4);

		// C1 = 100 nF over 480 steps (9.600 ms): analytical Vc(9.600 ms) = 5.317537 V (zero accumulated phase error)
		const doc100n = getExampleCircuit('rlc-response');
		doc100n.components.find((c) => c.id === 'c1')!.params.capacitance = 100e-9; // 100 nF

		const init100n = evaluateCircuitAtInstant(doc100n, 0);
		expect(init100n.ok).toBe(true);
		if (!init100n.ok) return;

		const batch100n = runSimulationBatch(doc100n, init100n.snapshot, 480, 0);
		expect(batch100n.ok).toBe(true);
		const sample9600us = batch100n.samples.find((s) => Math.abs(s.timeSec - 0.0096) < 1e-9);
		expect(sample9600us).toBeDefined();
		expect(sample9600us!.ch1).toBeCloseTo(5.317537, 4);
	});

	it('accurately integrates AC low-pass filter when C1 is set to 1 nF (0.311 V and 3.14 µA at 100 µs)', () => {
		const doc = getExampleCircuit('rc-low-pass');
		const c1 = doc.components.find((c) => c.id === 'c1')!;
		c1.params.capacitance = 1e-9; // 1 nF (tau = 1 µs << dt = 50 µs)

		const init = evaluateCircuitAtInstant(doc, 0);
		expect(init.ok).toBe(true);
		if (!init.ok) return;

		const step1 = stepTransientMna(doc, init.snapshot, doc.simulation.dtSec, 'trap');
		expect(step1.ok).toBe(true);
		if (!step1.ok) return;

		const step2 = stepTransientMna(doc, step1.snapshot, doc.simulation.dtSec, 'trap');
		expect(step2.ok).toBe(true);
		if (!step2.ok) return;

		expect(step2.snapshot.timeSec).toBeCloseTo(100e-6, 9);
		// Analytical exact at t = 100 µs for R = 1 kΩ, C = 1 nF, V(t) = 5 sin(2π * 100 * t):
		// Vc(100 µs) = 0.310817 V, I(100 µs) = 3.1357 µA
		expect(step2.snapshot.components['c1'].voltageDrop).toBeCloseTo(0.310817, 5);
		expect(step2.snapshot.components['c1'].current).toBeCloseTo(3.1357e-6, 9);
		expect(step2.snapshot.components['r1'].current).toBeCloseTo(3.1357e-6, 9);
	});

	it('splits transient steps at exact square-wave switching edges (123 Hz square wave, 1 kΩ, 100 nF gives 2.050 V at 4.100 ms)', () => {
		const doc = getExampleCircuit('rc-low-pass');
		const v1 = doc.components.find((c) => c.id === 'v1')!;
		v1.kind = 'square_voltage';
		v1.params = { amplitude: 5, frequency: 123, offset: 0, dutyPercent: 50 };
		const c1 = doc.components.find((c) => c.id === 'c1')!;
		c1.params.capacitance = 100e-9; // 100 nF (tau = 100 µs)

		const init = evaluateCircuitAtInstant(doc, 0);
		expect(init.ok).toBe(true);
		if (!init.ok) return;

		// Step 82 times at dt = 50 µs to reach t = 4.100 ms (just after falling edge at 0.5 / 123 = 4.06504065 ms)
		let snap = init.snapshot;
		for (let i = 0; i < 82; i += 1) {
			const next = stepTransientMna(doc, snap, doc.simulation.dtSec, 'trap');
			expect(next.ok).toBe(true);
			if (!next.ok) return;
			snap = next.snapshot;
		}
		expect(snap.timeSec).toBeCloseTo(0.0041, 9);
		const tEdge = 0.5 / 123;
		const exactVc = -5 + 10 * Math.exp(-(0.0041 - tEdge) / 100e-6);
		expect(exactVc).toBeCloseTo(2.049746, 5);
		expect(snap.components['c1'].voltageDrop).toBeCloseTo(exactVc, 5);
	});
});
