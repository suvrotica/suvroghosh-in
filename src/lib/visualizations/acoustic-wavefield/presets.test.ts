import { describe, expect, it } from 'vitest';
import { fftRadix2 } from './metrics';
import { PRESETS } from './presets';
import { createSimulation, rebuildMaterialProperties, runSynchronousRirCapture } from './solver';
import { FS_SIM, GRID_NX, MAT_AIR, MAT_WALL } from './types';

function unnormalizedSpectrum(rir: Float32Array, minHz: number, maxHz: number) {
	const fftSize = 16384;
	const re = new Float64Array(fftSize);
	const im = new Float64Array(fftSize);
	for (let i = 0; i < Math.min(rir.length, fftSize); i++) re[i] = rir[i];
	fftRadix2(re, im);
	const df = FS_SIM / fftSize;
	const kMin = Math.max(1, Math.floor(minHz / df));
	const kMax = Math.ceil(maxHz / df);
	const freqsHz: number[] = [];
	const magDb: number[] = [];
	for (let k = kMin; k <= kMax; k++) {
		freqsHz.push(k * df);
		magDb.push(20 * Math.log10(Math.max(Math.hypot(re[k], im[k]), 1e-12)));
	}
	return { freqsHz, magDb };
}

describe('acoustic-wavefield presets', () => {
	it('places S and L strictly inside valid AIR cells with non-zero separation across all 7 presets', () => {
		expect(PRESETS).toHaveLength(7);
		for (const preset of PRESETS) {
			const sim = createSimulation(preset.id);
			const sIdx = Math.round(sim.source.y) * GRID_NX + Math.round(sim.source.x);
			const lIdx = Math.round(sim.listener.y) * GRID_NX + Math.round(sim.listener.x);
			expect(sim.material[sIdx]).toBe(MAT_AIR);
			expect(sim.material[lIdx]).toBe(MAT_AIR);
			const sep = Math.hypot(sim.listener.x - sim.source.x, sim.listener.y - sim.source.y);
			expect(sep).toBeGreaterThan(20);
		}
	});

	it(
		'exhibits a genuine Helmholtz transmission notch near 245 Hz relative to 420 Hz in Preset #7',
		{ timeout: 25_000 },
		() => {
			const withHelmholtz = createSimulation('helmholtz-trap');
			const rirWith = runSynchronousRirCapture({
				material: withHelmholtz.material,
				perimeter: withHelmholtz.perimeter,
				source: withHelmholtz.source,
				listener: withHelmholtz.listener,
				steps: 5000
			});

			// Reference plain straight duct (same duct, cavity sealed off with WALL)
			const plainDuct = createSimulation('helmholtz-trap');
			for (let y = 73; y <= 78; y++) {
				for (let x = 108; x <= 115; x++) {
					plainDuct.material[y * GRID_NX + x] = MAT_WALL;
				}
			}
			rebuildMaterialProperties(plainDuct);
			const rirRef = runSynchronousRirCapture({
				material: plainDuct.material,
				perimeter: plainDuct.perimeter,
				source: plainDuct.source,
				listener: plainDuct.listener,
				steps: 5000
			});

			const specWith = unnormalizedSpectrum(rirWith, 80, 650);
			const specRef = unnormalizedSpectrum(rirRef, 80, 650);

			const bandDiffDb = (centerHz: number, halfWidthHz = 12) => {
				let sumWith = 0;
				let sumRef = 0;
				let count = 0;
				for (let i = 0; i < specWith.freqsHz.length; i++) {
					const f = specWith.freqsHz[i];
					if (Math.abs(f - centerHz) <= halfWidthHz) {
						sumWith += Math.pow(10, specWith.magDb[i] / 10);
						sumRef += Math.pow(10, specRef.magDb[i] / 10);
						count++;
					}
				}
				if (count === 0 || sumRef <= 0) return 0;
				return 10 * Math.log10(sumWith / sumRef);
			};

			let minBandDb = Infinity;
			let notchHz = 0;
			for (let f = 140; f <= 460; f += 10) {
				const d = bandDiffDb(f, 10);
				if (f >= 180 && f <= 310 && d < minBandDb) {
					minBandDb = d;
					notchHz = f;
				}
			}
			const pass420Db = bandDiffDb(420, 12);

			expect(notchHz).toBeGreaterThanOrEqual(215);
			expect(notchHz).toBeLessThanOrEqual(275);
			expect(minBandDb).toBeLessThan(-2.5);
			expect(pass420Db - minBandDb).toBeGreaterThan(2.5);
		}
	);
});
