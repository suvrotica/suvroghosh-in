import { describe, expect, it } from 'vitest';
import {
	calciumProfiles,
	formatElapsed,
	intervalMinutesFromFrequency,
	measurementRows,
	patternLabel,
	profileById,
	sampleCalcium,
	sourceEvidence,
	spatialSnapshot
} from './profiles';

describe('fertilization calcium evidence ledger', () => {
	it('keeps the requested species and separates the two ascidians', () => {
		expect(calciumProfiles.map((profile) => profile.id)).toEqual([
			'human',
			'mouse',
			'hamster',
			'xenopus',
			'phallusia',
			'ciona',
			'sea-urchin'
		]);
		expect(profileById('phallusia').peakUM?.value).toBe(7);
		expect(profileById('ciona').peakUM?.value).toBe(10);
	});

	it('marks the human ceiling as a maximum and preserves the response subset caveat', () => {
		const human = profileById('human');
		expect(human.peakUM?.status).toBe('reported-maximum');
		expect(human.peakUM?.note).toMatch(/not a population mean/i);
		expect(human.sampleSummary).toMatch(/3 and 7/);
		expect(human.caveats.join(' ')).toMatch(/not.*fertilization-success rate/i);
		expect(human.visualModel.spatialMode).toBe('whole-cell-schematic');
	});

	it('derives the mouse interval only from its separately reported frequency', () => {
		const mouse = profileById('mouse');
		expect(intervalMinutesFromFrequency(5.2)).toBeCloseTo(11.538, 3);
		expect(mouse.intervalMin?.value).toBeCloseTo(11.538, 3);
		expect(mouse.intervalMin?.status).toBe('derived');
		expect(mouse.spikeFrequencyPerHour?.value).toEqual({ mean: 5.2, sem: 0.3 });
		expect(mouse.caveats.join(' ')).toMatch(/separate experiments/i);
	});

	it('does not invent a hamster recurrence interval or a sea-urchin amplitude', () => {
		expect(profileById('hamster').intervalMin).toBeUndefined();
		expect(profileById('sea-urchin').peakUM).toBeUndefined();
		expect(patternLabel(profileById('hamster'))).toBe('repeated responses · first event shown');
	});

	it('keeps Xenopus rise, recovery, and speed definitions separate', () => {
		const xenopus = profileById('xenopus');
		expect(xenopus.transientSec).toBeUndefined();
		expect(xenopus.riseSec?.value).toBe(120);
		expect(xenopus.recoverySec?.value).toBe(600);
		expect(xenopus.waveSpeedUMs?.value).toBe(9.7);
		expect(xenopus.waveSpeedUMs?.note).toMatch(/9\.7 ± 1\.5/);
	});

	it('gives every displayed evidence row local provenance and an explicit status', () => {
		for (const profile of calciumProfiles) {
			for (const row of measurementRows(profile)) {
				expect(row.label.length).toBeGreaterThan(0);
				expect(row.display).not.toMatch(/NaN|Infinity/);
				expect(row.evidence.status).toMatch(
					/^(reported|reported-range|reported-maximum|derived|schematic)$/
				);
				expect(row.evidence.sourceLabel.length).toBeGreaterThan(0);
				expect(row.evidence.sourceUrl).toMatch(
					/^(https:\/\/doi\.org\/|#fertilization-calcium-method)/
				);
			}
			expect(sourceEvidence(profile).length).toBeGreaterThan(0);
		}
	});
});

describe('deterministic schematic curves', () => {
	it('stays finite and inside a relative zero-to-one domain across every profile', () => {
		for (const profile of calciumProfiles) {
			for (let index = 0; index <= 1_000; index += 1) {
				const time = (profile.visualModel.windowSec.value * index) / 1_000;
				const first = sampleCalcium(profile, time);
				const second = sampleCalcium(profile, time);
				expect(Number.isFinite(first)).toBe(true);
				expect(first).toBeGreaterThanOrEqual(0);
				expect(first).toBeLessThanOrEqual(1);
				expect(second).toBe(first);

				const spatial = spatialSnapshot(profile, time);
				expect(Number.isFinite(spatial.front)).toBe(true);
				expect(Number.isFinite(spatial.intensity)).toBe(true);
				expect(spatial.front).toBeGreaterThanOrEqual(0);
				expect(spatial.front).toBeLessThanOrEqual(1);
			}
		}
	});

	it('retains an actual single wave for Xenopus and repeated pulses for mammals and ascidians', () => {
		const xenopus = profileById('xenopus');
		expect(sampleCalcium(xenopus, 0)).toBe(0);
		expect(sampleCalcium(xenopus, 120)).toBe(1);
		expect(sampleCalcium(xenopus, 720)).toBe(0);

		const mouse = profileById('mouse');
		const mouseSamples = Array.from({ length: 361 }, (_, index) =>
			sampleCalcium(mouse, index * 10)
		);
		expect(mouseSamples.filter((value) => value > 0.8).length).toBeGreaterThan(3);

		const phallusia = profileById('phallusia');
		const phallusiaSamples = Array.from({ length: 751 }, (_, index) =>
			sampleCalcium(phallusia, index * 2)
		);
		expect(phallusiaSamples.filter((value) => value > 0.3).length).toBeGreaterThan(20);
	});

	it('formats biological elapsed time without invalid values', () => {
		expect(formatElapsed(45)).toBe('45 s');
		expect(formatElapsed(720)).toBe('12 min 00 s');
		expect(formatElapsed(4_200)).toBe('1 h 10 min 00 s');
		expect(formatElapsed(Number.NaN)).toBe('0 s');
	});

	it('separates an active spatial front from a calcium signal that has already spread', () => {
		const mouse = profileById('mouse');
		expect(spatialSnapshot(mouse, 0)).toMatchObject({ active: false, front: 0 });
		expect(spatialSnapshot(mouse, 27).active).toBe(true);
		expect(spatialSnapshot(mouse, 31)).toMatchObject({ active: false, front: 1 });
		expect(spatialSnapshot(mouse, 120)).toMatchObject({ active: false, front: 0 });

		const xenopus = profileById('xenopus');
		expect(spatialSnapshot(xenopus, 60).active).toBe(true);
		expect(spatialSnapshot(xenopus, 300)).toMatchObject({ active: false, front: 1 });
		expect(spatialSnapshot(xenopus, 721)).toMatchObject({ active: false, front: 0 });
	});
});
