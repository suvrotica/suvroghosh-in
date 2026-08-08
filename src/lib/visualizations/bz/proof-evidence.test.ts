import { describe, expect, it } from 'vitest';
import fieldViewsSource from '../../components/visualizations/bz/BZProofFieldViews.svelte?raw';
import proofSource from '../../components/visualizations/bz/BZProofV2.svelte?raw';
import experienceSource from '../../components/visualizations/bz/BZExperienceV2.svelte?raw';
import { BZ_V2_CALIBRATION_MANIFEST } from './calibration/manifest';
import { bzProofSpiralTrace, bzProofTargetTrace } from './proof-evidence';

function calibration(presetId: string) {
	const record = BZ_V2_CALIBRATION_MANIFEST.calibrations.find(
		(candidate) => candidate.presetId === presetId
	);
	expect(record, `${presetId} calibration`).toBeDefined();
	return record!;
}

describe('BZ V2 proof evidence', () => {
	it('extracts the published outward target tracks without recomputing them', () => {
		const trace = bzProofTargetTrace(calibration('classic-target-rings'));
		expect(trace).not.toBeNull();
		expect(trace?.tracks).toHaveLength(4);
		expect(trace?.tracks.every((track) => track.endRadius > track.startRadius)).toBe(true);
		expect(trace?.tracks.every((track) => track.outwardFraction >= 0.98)).toBe(true);
	});

	it('extracts the persistent core path and finite rotation interval', () => {
		const trace = bzProofSpiralTrace(calibration('persistent-single-spiral'));
		expect(trace).not.toBeNull();
		expect(trace?.samples.length).toBeGreaterThanOrEqual(2);
		expect(trace?.tracks).toHaveLength(1);
		expect(trace?.tracks[0]?.samples).toBe(241);
		expect(trace?.tracks[0]?.rotations).toBeGreaterThan(3);
		expect(trace?.periodMean).toBeGreaterThan(0);
	});

	it('extracts all three finite garden rotation tracks', () => {
		const trace = bzProofSpiralTrace(calibration('spiral-garden'));
		expect(trace).not.toBeNull();
		expect(trace?.tracks).toHaveLength(3);
		expect(trace?.tracks.every((track) => track.rotations > 3)).toBe(true);
	});

	it('authenticates and renders only stored checkpoint state in the lazy Proof view', () => {
		expect(fieldViewsSource).toContain('decodeBZCheckpointV1');
		expect(fieldViewsSource).toContain('checkpointStateToBZFieldState');
		expect(fieldViewsSource).toContain('renderBZToCanvasV2');
		expect(fieldViewsSource).toContain('detectBZPhaseCores');
		expect(fieldViewsSource).toContain('bz-v2-bz-versus-turing-plate');
		expect(fieldViewsSource).toContain('if (!active');
		expect(fieldViewsSource).not.toMatch(/readState\s*\(/u);
		expect(fieldViewsSource).not.toMatch(/\.snapshot\s*\(/u);
	});

	it('passes Proof visibility explicitly so checkpoint work stays lazy', () => {
		expect(proofSource).toContain('<BZProofFieldViews');
		expect(experienceSource).toContain("active={layer === 'proof'}");
	});
});
