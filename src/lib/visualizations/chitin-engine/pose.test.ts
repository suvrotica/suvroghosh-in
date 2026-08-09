import { describe, expect, it } from 'vitest';
import { DEFAULT_GENOME } from './genome';
import { createCreaturePose, updateCreaturePose } from './pose';
import type { CreatureGenome, CreaturePhenotype } from './types';

function fixturePhenotype(): CreaturePhenotype {
	const genome: CreatureGenome = {
		...DEFAULT_GENOME,
		seed: 'pose-fixture',
		bodyLength: 2,
		bodyWidth: 0.42,
		walkingLegPairs: 1,
		graspingPairs: 0,
		legLength: 0.9,
		stanceWidth: 0.48,
		cadence: 1,
		stanceRatio: 0.7,
		swingHeight: 0.16,
		bodyBob: 0.2,
		idleMotion: 0.2,
		appendageLag: 0.3,
		startle: 0.8,
		threatIntensity: 0.7,
		gait: 'tripod'
	};
	return {
		genome,
		baseGenome: genome,
		graph: { nodes: [], edges: [], sockets: [], regionBoundaries: [0, 1] },
		axis: [
			{
				s: 0,
				position: { x: -0.5, y: 0 },
				tangent: { x: 1, y: 0 },
				normal: { x: 0, y: 1 },
				depth: 0
			},
			{
				s: 1,
				position: { x: 0.5, y: 0.04 },
				tangent: { x: 0.999, y: 0.04 },
				normal: { x: -0.04, y: 0.999 },
				depth: 0.05
			}
		],
		plates: [],
		limbs: [
			{
				id: 'leg-left',
				kind: 'walking',
				rootSegment: 0,
				side: -1,
				pairIndex: 0,
				rootOffset: 0.04,
				boneLengths: [0.34, 0.31, 0.22],
				thicknesses: [0.04, 0.03, 0.02, 0.012],
				preferredBend: -1,
				phaseOffset: 0,
				clawCount: 2,
				depth: -0.1
			},
			{
				id: 'leg-right',
				kind: 'walking',
				rootSegment: 0,
				side: 1,
				pairIndex: 0,
				rootOffset: 0.04,
				boneLengths: [0.34, 0.31, 0.22],
				thicknesses: [0.04, 0.03, 0.02, 0.012],
				preferredBend: 1,
				phaseOffset: 0,
				clawCount: 2,
				depth: 0.1
			}
		],
		eyes: [],
		flexibleAppendages: [
			{
				id: 'antenna-left',
				kind: 'antenna',
				rootSegment: 0,
				side: -1,
				lengths: [0.12, 0.11, 0.1, 0.08],
				depth: 0.12
			}
		],
		wings: [],
		surfaceSamples: [],
		archiveDesignation: 'POSE-001',
		informalName: 'Pose Fixture',
		habitatNote: 'Test chamber',
		proceduralSummary: 'A bounded test phenotype.',
		fingerprint: 'pose-fixture-fingerprint'
	};
}

function distance(
	left: Readonly<{ x: number; y: number }>,
	right: Readonly<{ x: number; y: number }>
): number {
	return Math.hypot(right.x - left.x, right.y - left.y);
}

describe('Chitin creature pose', () => {
	it('creates finite bounded limb and flexible-chain state from a phenotype', () => {
		const phenotype = fixturePhenotype();
		const pose = createCreaturePose(phenotype, { genomeTime: 2, gaitTime: 0, idleTime: 1 });
		expect(pose.genomeTime).toBe(2);
		expect(pose.gaitTime).toBe(0);
		expect(pose.limbs).toHaveLength(2);
		expect(pose.flexible.size).toBe(1);
		for (const [limbIndex, limbPose] of pose.limbs.entries()) {
			const limb = phenotype.limbs[limbIndex];
			expect(limbPose.joints).toHaveLength(limb.boneLengths.length + 1);
			for (let bone = 0; bone < limb.boneLengths.length; bone += 1) {
				expect(distance(limbPose.joints[bone], limbPose.joints[bone + 1])).toBeCloseTo(
					limb.boneLengths[bone],
					5
				);
			}
			expect(limbPose.joints.flatMap((joint) => [joint.x, joint.y]).every(Number.isFinite)).toBe(
				true
			);
		}
		const chain = pose.flexible.get('antenna-left');
		expect(chain?.positions).toBeInstanceOf(Float32Array);
		expect(chain?.positions.every(Number.isFinite)).toBe(true);
	});

	it('clamps frame gaps, reuses chain storage, and keeps a stance foot planted', () => {
		const phenotype = fixturePhenotype();
		const pose = createCreaturePose(phenotype);
		const planted = pose.limbs.find((limb) => limb.id === 'leg-left');
		expect(planted?.planted).toBe(true);
		const initialTarget = { ...planted!.target };
		const chain = pose.flexible.get('antenna-left')!;
		const positions = chain.positions;
		const result = updateCreaturePose(pose, phenotype, { deltaTime: 20 });
		expect(result.pose).toBe(pose);
		expect(result.deltaTime).toBe(0.05);
		expect(pose.genomeTime).toBeCloseTo(0.05);
		expect(pose.gaitTime).toBeCloseTo(0.05);
		expect(pose.flexible.get('antenna-left')).toBe(chain);
		expect(chain.positions).toBe(positions);
		const nextPlanted = pose.limbs.find((limb) => limb.id === 'leg-left')!;
		expect(nextPlanted.planted).toBe(true);
		expect(nextPlanted.target).toEqual(initialTarget);
	});

	it('freezes while paused but supports one bounded presentation step', () => {
		const phenotype = fixturePhenotype();
		const pose = createCreaturePose(phenotype, { paused: true });
		const beforePositions = Array.from(pose.flexible.get('antenna-left')!.positions);
		const paused = updateCreaturePose(pose, phenotype, {
			deltaTime: 1,
			paused: true,
			threat: true
		});
		expect(paused.advanced).toBe(false);
		expect(pose.genomeTime).toBe(0);
		expect(Array.from(pose.flexible.get('antenna-left')!.positions)).toEqual(beforePositions);
		expect(pose.threat).toBe(0);

		const stepped = updateCreaturePose(pose, phenotype, {
			deltaTime: 0,
			paused: true,
			singleStep: true,
			fixedStep: 1 / 30
		});
		expect(stepped.advanced).toBe(true);
		expect(stepped.deltaTime).toBeCloseTo(1 / 30);
		expect(pose.genomeTime).toBeCloseTo(1 / 30);
	});

	it('eases threat and startle state instead of hard-toggling', () => {
		const phenotype = fixturePhenotype();
		const pose = createCreaturePose(phenotype);
		updateCreaturePose(pose, phenotype, { deltaTime: 1 / 60, threat: true, startle: true });
		expect(pose.threat).toBeGreaterThan(0);
		expect(pose.threat).toBeLessThan(1);
		expect(pose.startle).toBeGreaterThan(0);
		expect(pose.startle).toBeLessThanOrEqual(phenotype.genome.startle);
		const firstThreat = pose.threat;
		const firstStartle = pose.startle;
		updateCreaturePose(pose, phenotype, { deltaTime: 1 / 60 });
		expect(pose.threat).toBeGreaterThan(firstThreat);
		expect(pose.startle).toBeLessThan(firstStartle);
	});
});
