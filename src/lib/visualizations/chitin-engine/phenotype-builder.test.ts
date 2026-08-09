import { describe, expect, it } from 'vitest';
import { validateBodyGraph } from './body-grammar';
import { DEFAULT_GENOME, normalizeGenome } from './genome';
import { buildCreaturePhenotype, regionEnvelopeAt } from './phenotype-builder';
import { createCreaturePose } from './pose';
import { genomeForPreset } from './presets';

describe('Chitin Engine phenotype builder', () => {
	it('replays the same genome as the same complete phenotype', () => {
		const first = buildCreaturePhenotype(DEFAULT_GENOME);
		const second = buildCreaturePhenotype(DEFAULT_GENOME);
		expect(second).toEqual(first);
		expect(first.fingerprint).toMatch(/^ce1-[0-9a-f]{16}$/u);
		expect(first.archiveDesignation).toBe('XN-1847');
		expect(first.informalName).toBe('Glassback Knifemite');
		expect(first.plates).toHaveLength(first.genome.bodySegments);
		expect(first.limbs).toHaveLength(
			(first.genome.walkingLegPairs + first.genome.graspingPairs) * 2
		);
		expect(first.eyes).toHaveLength(first.genome.eyeCount);
		expect(validateBodyGraph(first.graph, first.genome).valid).toBe(true);
	});

	it('uses a smooth piecewise head, central, and terminal envelope', () => {
		const phenotype = buildCreaturePhenotype(DEFAULT_GENOME);
		const boundaries = phenotype.graph.regionBoundaries;
		expect(regionEnvelopeAt(DEFAULT_GENOME, boundaries, 0)).toBeCloseTo(DEFAULT_GENOME.headScale);
		expect(regionEnvelopeAt(DEFAULT_GENOME, boundaries, 0.5)).toBeCloseTo(
			DEFAULT_GENOME.centralScale,
			1
		);
		expect(regionEnvelopeAt(DEFAULT_GENOME, boundaries, 1)).toBeCloseTo(
			DEFAULT_GENOME.terminalScale
		);
	});

	it('keeps geometry finite and appendage chains positive across discipline presets', () => {
		for (const preset of [
			'reactor-mantis',
			'basalt-widow',
			'brine-cathedral-centipede',
			'orbital-hull-mite'
		] as const) {
			const phenotype = buildCreaturePhenotype(genomeForPreset(preset));
			for (const point of phenotype.axis) {
				expect(
					[point.position.x, point.position.y, point.tangent.x, point.tangent.y, point.depth].every(
						Number.isFinite
					)
				).toBe(true);
			}
			for (const plate of phenotype.plates) {
				expect(plate.width).toBeGreaterThan(0);
				expect(plate.height).toBeGreaterThan(0);
			}
			for (const limb of phenotype.limbs) {
				expect(limb.boneLengths.every((length) => Number.isFinite(length) && length > 0)).toBe(
					true
				);
				expect(limb.thicknesses.every((width) => Number.isFinite(width) && width > 0)).toBe(true);
			}
			expect(phenotype.surfaceSamples.length).toBeLessThanOrEqual(phenotype.plates.length * 33);
		}
	});

	it('places mirrored limb roots on opposite sides of the local body axis', () => {
		const phenotype = buildCreaturePhenotype(DEFAULT_GENOME);
		const pose = createCreaturePose(phenotype);
		const left = phenotype.limbs.find((limb) => limb.id === 'walking:0:left');
		const right = phenotype.limbs.find((limb) => limb.id === 'walking:0:right');
		expect(left).toBeDefined();
		expect(right).toBeDefined();
		const leftPose = pose.limbs.find((limb) => limb.id === left?.id);
		const rightPose = pose.limbs.find((limb) => limb.id === right?.id);
		const frame = phenotype.axis[left?.rootSegment ?? 0];
		const signedOffset = (point: { x: number; y: number }) =>
			(point.x - frame.position.x) * frame.normal.x + (point.y - frame.position.y) * frame.normal.y;
		expect(signedOffset(leftPose?.joints[0] ?? frame.position)).toBeLessThan(0);
		expect(signedOffset(rightPose?.joints[0] ?? frame.position)).toBeGreaterThan(0);
	});

	it('closes radial plans without a duplicate terminal plate or open seam', () => {
		const phenotype = buildCreaturePhenotype(genomeForPreset('orbital-hull-mite'));
		const distances = phenotype.axis.map((point, index) => {
			const next = phenotype.axis[(index + 1) % phenotype.axis.length];
			return Math.hypot(next.position.x - point.position.x, next.position.y - point.position.y);
		});
		const seam = distances[distances.length - 1];
		const internalMaximum = Math.max(...distances.slice(0, -1));
		expect(seam).toBeGreaterThan(0);
		expect(seam).toBeLessThanOrEqual(internalMaximum * 1.05);
		expect(phenotype.plates).toHaveLength(phenotype.genome.bodySegments);
	});

	it('makes each non-none wing posture a distinct deterministic phenotype', () => {
		const base = genomeForPreset('reactor-mantis');
		const signatures = (['folded', 'half-open', 'display', 'dormant'] as const).map((wingMode) => {
			const phenotype = buildCreaturePhenotype(normalizeGenome({ ...base, wingMode }, base));
			return JSON.stringify(phenotype.wings.map((wing) => [wing.outline, wing.depth]));
		});
		expect(new Set(signatures).size).toBe(signatures.length);
	});

	it('stores the base genome separately from speculative world-derived geometry', () => {
		const influenced = buildCreaturePhenotype(DEFAULT_GENOME);
		expect(influenced.baseGenome).toEqual(normalizeGenome(DEFAULT_GENOME));
		expect(influenced.genome).not.toEqual(influenced.baseGenome);

		const neutral = normalizeGenome({ ...DEFAULT_GENOME, worldInfluence: 0 });
		const neutralPhenotype = buildCreaturePhenotype(neutral);
		expect(neutralPhenotype.genome).toEqual(neutralPhenotype.baseGenome);
		expect(neutralPhenotype.habitatNote).toContain('Fictional archive habitat');
	});
});
