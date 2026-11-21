import { describe, expect, it } from 'vitest';
import { computeAcousticMetrics, computeReciprocityCorrelation } from './metrics';
import { PRESETS } from './presets';
import {
	computeFieldEnergy,
	createSimulation,
	rebuildMaterialProperties,
	runSynchronousRirCapture,
	stepSimulation,
	triggerExcitation
} from './solver';
import { CELL_COUNT, DX, FS_SIM, GRID_NX, GRID_NY, MAT_ABSORBER, MAT_AIR, MAT_WALL } from './types';

describe('acoustic-wavefield FDTD solver', () => {
	it(
		'remains finite with zero NaN/Infinity after 5,000 steps across all 7 presets',
		{ timeout: 120_000 },
		() => {
			for (const preset of PRESETS) {
				const sim = createSimulation(preset.id, { chladniEnabled: false });
				triggerExcitation(sim, 'clap', true);
				stepSimulation(sim, 5000, false);

				for (let i = 0; i < CELL_COUNT; i++) {
					expect(Number.isFinite(sim.p[i])).toBe(true);
					expect(Number.isFinite(sim.eRms[i])).toBe(true);
				}
			}
		}
	);

	it(
		'retains energy in rigid stone box while anechoic foam chamber decays rapidly',
		{ timeout: 30_000 },
		() => {
			const bath = createSimulation('stone-bathhouse', { chladniEnabled: false });
			triggerExcitation(bath, 'clap', true);
			stepSimulation(bath, 600, false);
			const bathEarly = computeFieldEnergy(bath);
			stepSimulation(bath, 2400, false);
			const bathLate = computeFieldEnergy(bath);

			const anechoic = createSimulation('anechoic-chamber', { chladniEnabled: false });
			triggerExcitation(anechoic, 'clap', true);
			stepSimulation(anechoic, 600, false);
			const anechoicEarly = computeFieldEnergy(anechoic);
			stepSimulation(anechoic, 2400, false);
			const anechoicLate = computeFieldEnergy(anechoic);

			expect(bathEarly).toBeGreaterThan(0.1);
			expect(bathLate / bathEarly).toBeGreaterThan(0.7);
			expect(anechoicEarly).toBeGreaterThan(0.05);
			expect(anechoicLate / anechoicEarly).toBeLessThan(0.05);
		}
	);

	it(
		'blocks transmission across axial and 1-cell diagonal Neumann wall partitions',
		{ timeout: 20_000 },
		() => {
			// 1-cell thin diagonal wall splitting a closed box from bottom-left to top-right
			const sim = createSimulation('stone-bathhouse', { chladniEnabled: false });
			sim.material.fill(MAT_AIR);
			for (let i = 0; i < GRID_NX; i++) {
				sim.material[i] = MAT_WALL;
				sim.material[(GRID_NY - 1) * GRID_NX + i] = MAT_WALL;
			}
			for (let j = 0; j < GRID_NY; j++) {
				sim.material[j * GRID_NX] = MAT_WALL;
				sim.material[j * GRID_NX + (GRID_NX - 1)] = MAT_WALL;
			}
			// 1-cell diagonal partition: x - y = 40 (only diagonal cells, zero axial continuity!)
			for (let y = 1; y < GRID_NY - 1; y++) {
				const x = y + 40;
				if (x >= 1 && x < GRID_NX - 1) {
					sim.material[y * GRID_NX + x] = MAT_WALL;
				}
			}
			sim.source = { x: 40, y: 80 }; // strictly left/below diagonal
			sim.listener = { x: 160, y: 40 }; // strictly right/above diagonal
			rebuildMaterialProperties(sim);

			triggerExcitation(sim, 'clap', true);
			stepSimulation(sim, 2200, false);

			// Check energy on the far side of the 1-cell diagonal barrier (x > y + 40)
			let farSideMax = 0;
			for (let y = 1; y < GRID_NY - 1; y++) {
				for (let x = y + 42; x < GRID_NX - 1; x++) {
					const a = Math.abs(sim.p[y * GRID_NX + x]);
					if (a > farSideMax) farSideMax = a;
				}
			}
			expect(farSideMax).toBeLessThan(1e-6);
		}
	);

	it(
		'satisfies exact acoustic reciprocity (rho > 0.98) when swapping S <-> L in asymmetric hall',
		{ timeout: 30_000 },
		() => {
			const hall = createSimulation('shoebox-concert-hall', { chladniEnabled: false });
			const s = { x: 38, y: 60 };
			const l = { x: 162, y: 88 };

			const rirForward = runSynchronousRirCapture({
				material: hall.material,
				perimeter: hall.perimeter,
				source: s,
				listener: l,
				steps: 4500
			});
			const rirReverse = runSynchronousRirCapture({
				material: hall.material,
				perimeter: hall.perimeter,
				source: l,
				listener: s,
				steps: 4500
			});

			const rho = computeReciprocityCorrelation(rirForward, rirReverse);
			expect(rho).toBeGreaterThanOrEqual(0.99999);
		}
	);

	it(
		'matches reference stepSimulation on t0, C80, RT60, and waveform correlation across all 7 presets',
		{ timeout: 120_000 },
		() => {
			const steps = 4500;
			for (const preset of PRESETS) {
				const sim = createSimulation(preset.id, { chladniEnabled: false });
				triggerExcitation(sim, 'clap', true);
				stepSimulation(sim, steps, false);
				const refRir = sim.liveRir.subarray(0, steps);

				const fastRir = runSynchronousRirCapture({
					material: sim.material,
					perimeter: sim.perimeter,
					source: sim.source,
					listener: sim.listener,
					steps
				});

				const fastRev = runSynchronousRirCapture({
					material: sim.material,
					perimeter: sim.perimeter,
					source: sim.listener,
					listener: sim.source,
					steps
				});

				const waveRho = computeReciprocityCorrelation(fastRir, refRir);
				expect(waveRho).toBeGreaterThanOrEqual(0.99999);

				const recipRho = computeReciprocityCorrelation(fastRir, fastRev);
				expect(recipRho).toBeGreaterThanOrEqual(0.99999);

				const distM = Math.hypot(
					(sim.listener.x - sim.source.x) * DX,
					(sim.listener.y - sim.source.y) * DX
				);
				const refMetrics = computeAcousticMetrics(refRir, FS_SIM, distM);
				const fastMetrics = computeAcousticMetrics(fastRir, FS_SIM, distM);

				expect(Math.abs(fastMetrics.directArrivalMs - refMetrics.directArrivalMs)).toBeLessThan(
					0.1
				);
				if (refMetrics.clarityC80Db !== null && fastMetrics.clarityC80Db !== null) {
					expect(Math.abs(fastMetrics.clarityC80Db - refMetrics.clarityC80Db)).toBeLessThan(0.05);
				} else {
					expect(fastMetrics.clarityC80Db).toBe(refMetrics.clarityC80Db);
				}
				if (refMetrics.rt60Ms !== null && fastMetrics.rt60Ms !== null) {
					expect(Math.abs(fastMetrics.rt60Ms - refMetrics.rt60Ms)).toBeLessThan(2);
				} else {
					expect(fastMetrics.rt60Ms).toBe(refMetrics.rt60Ms);
				}
			}
		}
	);

	it(
		'drives Chladni sand grains toward lower RMS pressure and keeps them strictly inside valid AIR/fluid cells',
		{ timeout: 25_000 },
		() => {
			const sim = createSimulation('stone-bathhouse');
			sim.toneHz = 245;
			triggerExcitation(sim, 'tone', true);
			// Build up standing wave field first
			stepSimulation(sim, 900, false);

			const sampleParticleMeanRms = () => {
				let sum = 0;
				for (let k = 0; k < sim.chladniX.length; k++) {
					const ix = Math.round(sim.chladniX[k]);
					const iy = Math.round(sim.chladniY[k]);
					sum += sim.eRms[iy * GRID_NX + ix];
				}
				return sum / sim.chladniX.length;
			};

			const initialParticleE = sampleParticleMeanRms();
			// Advance with Chladni drift enabled
			for (let f = 0; f < 180; f++) {
				stepSimulation(sim, 6, true);
			}
			const settledParticleE = sampleParticleMeanRms();

			expect(settledParticleE).toBeLessThan(initialParticleE * 0.85);

			// Verify zero grains sit inside WALL or ABSORBER cells
			for (let k = 0; k < sim.chladniX.length; k++) {
				const ix = Math.round(sim.chladniX[k]);
				const iy = Math.round(sim.chladniY[k]);
				const mat = sim.material[iy * GRID_NX + ix];
				expect(mat).not.toBe(MAT_WALL);
				expect(mat).not.toBe(MAT_ABSORBER);
			}
		}
	);
});
