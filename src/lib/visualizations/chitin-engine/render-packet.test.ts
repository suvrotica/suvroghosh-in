import { describe, expect, it } from 'vitest';
import { DEFAULT_GENOME } from './genome';
import { buildCreaturePhenotype } from './phenotype-builder';
import { createCreaturePose } from './pose';
import {
	CAPSULE_KIND,
	clearRenderPacket,
	createRenderPacket,
	fillRenderPacket,
	RENDER_LAYER
} from './render-packet';
import type { BodyPlate, CreatureGenome, CreaturePhenotype, CreaturePose, Vec2 } from './types';
import {
	CAPSULE_INSTANCE_OFFSET,
	CAPSULE_INSTANCE_STRIDE,
	deriveRenderBounds,
	PLATE_INSTANCE_OFFSET,
	PLATE_INSTANCE_STRIDE
} from './webgl-renderer';

function fixturePhenotype(): CreaturePhenotype {
	const genome: CreatureGenome = {
		...DEFAULT_GENOME,
		seed: 'packet-fixture',
		bodyLength: 2,
		bodyWidth: 0.5,
		walkingLegPairs: 1,
		graspingPairs: 0,
		legLength: 0.8,
		stanceWidth: 0.45,
		cadence: 1,
		stanceRatio: 0.7,
		swingHeight: 0.14,
		legThickness: 0.045,
		membraneTranslucency: 0.42,
		eyeEmission: 0.8,
		gait: 'tripod'
	};
	const plates = [
		{
			id: 'plate-0',
			segmentIndex: 0,
			region: 0,
			center: { x: -0.35, y: 0 },
			tangent: { x: 1, y: 0 },
			normal: { x: 0, y: 1 },
			width: 0.72,
			height: 0.42,
			rotation: 0,
			depth: -0.03,
			exponent: 2.5,
			lobeAmplitude: 0.04,
			lobeCount: 4,
			ridge: 0.4,
			seed: 0.1,
			damage: 0
		},
		{
			id: 'plate-1',
			segmentIndex: 1,
			region: 1,
			center: { x: 0.35, y: 0.04 },
			tangent: { x: 1, y: 0 },
			normal: { x: 0, y: 1 },
			width: 0.68,
			height: 0.38,
			rotation: 0.03,
			depth: 0.04,
			exponent: 2.2,
			lobeAmplitude: 0.02,
			lobeCount: 3,
			ridge: 0.3,
			seed: 0.2,
			damage: 0.1
		}
	] as const;
	return {
		genome,
		baseGenome: genome,
		graph: { nodes: [], edges: [], sockets: [], regionBoundaries: [0, 1] },
		axis: [
			{
				s: 0,
				position: { x: -0.35, y: 0 },
				tangent: { x: 1, y: 0 },
				normal: { x: 0, y: 1 },
				depth: -0.03
			},
			{
				s: 1,
				position: { x: 0.35, y: 0.04 },
				tangent: { x: 1, y: 0 },
				normal: { x: 0, y: 1 },
				depth: 0.04
			}
		],
		plates,
		limbs: [
			{
				id: 'far-leg',
				kind: 'walking',
				rootSegment: 0,
				side: -1,
				pairIndex: 0,
				rootOffset: 0.03,
				boneLengths: [0.3, 0.26, 0.18],
				thicknesses: [0.04, 0.03, 0.02, 0.01],
				preferredBend: -1,
				phaseOffset: 0,
				clawCount: 2,
				depth: -0.18
			},
			{
				id: 'near-leg',
				kind: 'walking',
				rootSegment: 0,
				side: 1,
				pairIndex: 0,
				rootOffset: 0.03,
				boneLengths: [0.3, 0.26, 0.18],
				thicknesses: [0.04, 0.03, 0.02, 0.01],
				preferredBend: 1,
				phaseOffset: 0,
				clawCount: 2,
				depth: 0.18
			}
		],
		eyes: [
			{
				id: 'eye-0',
				segmentIndex: 0,
				local: { x: -0.2, y: -0.25 },
				radius: 0.045,
				depth: 0.25,
				seed: 0.42
			}
		],
		flexibleAppendages: [
			{
				id: 'palp-0',
				kind: 'palp',
				rootSegment: 0,
				side: 1,
				lengths: [0.1, 0.09, 0.08],
				depth: 0.2
			}
		],
		wings: [
			{
				id: 'wing-0',
				rootSegment: 1,
				side: -1,
				outline: [
					{ x: 0.2, y: 0 },
					{ x: 0.85, y: -0.45 },
					{ x: 0.65, y: 0.05 }
				],
				veins: [
					[
						{ x: 0.25, y: 0 },
						{ x: 0.74, y: -0.3 }
					]
				],
				depth: -0.3
			}
		],
		surfaceSamples: [
			{ plateIndex: 1, local: { x: 0.1, y: 0.2 }, kind: 'pore', scale: 0.018, angle: 0 },
			{
				plateIndex: 1,
				local: { x: -0.25, y: -0.15 },
				kind: 'bristle',
				scale: 0.025,
				angle: 0.7
			}
		],
		archiveDesignation: 'PACKET-001',
		informalName: 'Packet Fixture',
		habitatNote: 'Test chamber',
		proceduralSummary: 'A packet test phenotype.',
		fingerprint: 'packet-fixture-fingerprint'
	};
}

function layers(array: Float32Array, count: number, stride: number, layerOffset: number): number[] {
	return Array.from({ length: count }, (_, index) => array[index * stride + layerOffset]);
}

function transformedLocal(plate: BodyPlate, pose: CreaturePose, local: Vec2): Vec2 {
	const cosine = Math.cos(plate.rotation);
	const sine = Math.sin(plate.rotation);
	return {
		x: plate.center.x + pose.bodyOffset.x + local.x * cosine - local.y * sine,
		y: plate.center.y + pose.bodyOffset.y + local.x * sine + local.y * cosine
	};
}

describe('Chitin render packet builder', () => {
	it('fills reusable arrays at the renderer-exported strides in deliberate layer order', () => {
		const phenotype = fixturePhenotype();
		const pose = createCreaturePose(phenotype);
		const packet = createRenderPacket({
			plateCapacity: 64,
			capsuleCapacity: 128,
			view: 'gait'
		});
		const plateArray = packet.plates;
		const capsuleArray = packet.capsules;
		const stats = fillRenderPacket(packet, phenotype, pose, {
			view: 'gait',
			selectedSegment: 1
		});

		expect(packet.plates).toBe(plateArray);
		expect(packet.capsules).toBe(capsuleArray);
		expect(packet.plates.length).toBe(64 * PLATE_INSTANCE_STRIDE);
		expect(packet.capsules.length).toBe(128 * CAPSULE_INSTANCE_STRIDE);
		expect(stats.truncated).toBe(false);
		expect(packet.selectedSegment).toBe(1);
		const plateLayers = layers(
			packet.plates,
			packet.plateCount,
			PLATE_INSTANCE_STRIDE,
			PLATE_INSTANCE_OFFSET.layer
		);
		const capsuleLayers = layers(
			packet.capsules,
			packet.capsuleCount,
			CAPSULE_INSTANCE_STRIDE,
			CAPSULE_INSTANCE_OFFSET.layer
		);
		expect(plateLayers).toEqual([...plateLayers].sort((left, right) => left - right));
		expect(capsuleLayers).toEqual([...capsuleLayers].sort((left, right) => left - right));
	});

	it('packs membranes, selection, joints, claws, samples, eyes, and view overlays', () => {
		const phenotype = fixturePhenotype();
		const pose = createCreaturePose(phenotype);
		const packet = createRenderPacket({ plateCapacity: 64, capsuleCapacity: 128 });
		fillRenderPacket(packet, phenotype, pose, { view: 'gait', selectedSegment: 1 });

		const plateRecords = Array.from({ length: packet.plateCount }, (_, index) =>
			packet.plates.subarray(index * PLATE_INSTANCE_STRIDE, (index + 1) * PLATE_INSTANCE_STRIDE)
		);
		const capsuleRecords = Array.from({ length: packet.capsuleCount }, (_, index) =>
			packet.capsules.subarray(
				index * CAPSULE_INSTANCE_STRIDE,
				(index + 1) * CAPSULE_INSTANCE_STRIDE
			)
		);
		expect(plateRecords.some((record) => record[PLATE_INSTANCE_OFFSET.membrane] === 1)).toBe(true);
		expect(
			plateRecords.some(
				(record) =>
					record[PLATE_INSTANCE_OFFSET.segmentIndex] === 1 &&
					record[PLATE_INSTANCE_OFFSET.selected] === 1 &&
					record[PLATE_INSTANCE_OFFSET.layer] === RENDER_LAYER.body
			)
		).toBe(true);
		expect(
			plateRecords.some(
				(record) =>
					record[PLATE_INSTANCE_OFFSET.layer] === RENDER_LAYER.eye &&
					record[PLATE_INSTANCE_OFFSET.emission] > 0
			)
		).toBe(true);
		expect(
			plateRecords.some((record) => record[PLATE_INSTANCE_OFFSET.layer] === RENDER_LAYER.overlay)
		).toBe(true);
		expect(capsuleRecords.some((record) => record[CAPSULE_INSTANCE_OFFSET.jointEmphasis] > 0)).toBe(
			true
		);
		expect(
			capsuleRecords.some((record) => record[CAPSULE_INSTANCE_OFFSET.kind] === CAPSULE_KIND.claw)
		).toBe(true);
		expect(
			capsuleRecords.some((record) => record[CAPSULE_INSTANCE_OFFSET.kind] === CAPSULE_KIND.surface)
		).toBe(true);

		fillRenderPacket(packet, phenotype, pose, { view: 'anatomy' });
		expect(
			Array.from(
				{ length: packet.capsuleCount },
				(_, index) =>
					packet.capsules[index * CAPSULE_INSTANCE_STRIDE + CAPSULE_INSTANCE_OFFSET.kind]
			).some((kind) => kind === CAPSULE_KIND.overlay)
		).toBe(true);
	});

	it('honours world-unit plate-local eyes/samples and transforms root-local wing geometry', () => {
		const phenotype = fixturePhenotype();
		const pose = createCreaturePose(phenotype);
		const packet = createRenderPacket({ plateCapacity: 64, capsuleCapacity: 128 });
		fillRenderPacket(packet, phenotype, pose, {
			view: 'specimen',
			includeOverlays: false
		});

		const eye = phenotype.eyes[0];
		const eyePlate = phenotype.plates.find((plate) => plate.segmentIndex === eye.segmentIndex)!;
		const expectedEye = transformedLocal(eyePlate, pose, eye.local);
		const eyeRecord = Array.from({ length: packet.plateCount }, (_, index) => index).find(
			(index) =>
				packet.plates[index * PLATE_INSTANCE_STRIDE + PLATE_INSTANCE_OFFSET.layer] ===
				RENDER_LAYER.eye
		)!;
		expect(
			packet.plates[eyeRecord * PLATE_INSTANCE_STRIDE + PLATE_INSTANCE_OFFSET.centerX]
		).toBeCloseTo(expectedEye.x, 6);
		expect(
			packet.plates[eyeRecord * PLATE_INSTANCE_STRIDE + PLATE_INSTANCE_OFFSET.centerY]
		).toBeCloseTo(expectedEye.y, 6);

		const sample = phenotype.surfaceSamples.find((candidate) => candidate.kind === 'pore')!;
		const samplePlate = phenotype.plates[sample.plateIndex];
		const expectedSample = transformedLocal(samplePlate, pose, sample.local);
		const sampleRecord = Array.from({ length: packet.plateCount }, (_, index) => index).find(
			(index) =>
				packet.plates[index * PLATE_INSTANCE_STRIDE + PLATE_INSTANCE_OFFSET.layer] ===
				RENDER_LAYER.surface
		)!;
		expect(
			packet.plates[sampleRecord * PLATE_INSTANCE_STRIDE + PLATE_INSTANCE_OFFSET.centerX]
		).toBeCloseTo(expectedSample.x, 6);
		expect(
			packet.plates[sampleRecord * PLATE_INSTANCE_STRIDE + PLATE_INSTANCE_OFFSET.centerY]
		).toBeCloseTo(expectedSample.y, 6);

		const wing = phenotype.wings[0];
		const wingRoot = phenotype.plates.find((plate) => plate.segmentIndex === wing.rootSegment)!;
		const transformedOutline = wing.outline.map((point) => transformedLocal(wingRoot, pose, point));
		const expectedWingCenter = {
			x:
				(Math.min(...transformedOutline.map((point) => point.x)) +
					Math.max(...transformedOutline.map((point) => point.x))) /
				2,
			y:
				(Math.min(...transformedOutline.map((point) => point.y)) +
					Math.max(...transformedOutline.map((point) => point.y))) /
				2
		};
		const wingRecord = Array.from({ length: packet.plateCount }, (_, index) => index).find(
			(index) =>
				packet.plates[index * PLATE_INSTANCE_STRIDE + PLATE_INSTANCE_OFFSET.layer] ===
				RENDER_LAYER.farWing
		)!;
		expect(
			packet.plates[wingRecord * PLATE_INSTANCE_STRIDE + PLATE_INSTANCE_OFFSET.centerX]
		).toBeCloseTo(expectedWingCenter.x, 6);
		expect(
			packet.plates[wingRecord * PLATE_INSTANCE_STRIDE + PLATE_INSTANCE_OFFSET.centerY]
		).toBeCloseTo(expectedWingCenter.y, 6);

		const veinRecord = Array.from({ length: packet.capsuleCount }, (_, index) => index).find(
			(index) =>
				packet.capsules[index * CAPSULE_INSTANCE_STRIDE + CAPSULE_INSTANCE_OFFSET.kind] ===
				CAPSULE_KIND.wingVein
		)!;
		const expectedVeinStart = transformedLocal(wingRoot, pose, wing.veins[0][0]);
		const expectedVeinEnd = transformedLocal(wingRoot, pose, wing.veins[0][1]);
		expect(
			packet.capsules[veinRecord * CAPSULE_INSTANCE_STRIDE + CAPSULE_INSTANCE_OFFSET.startX]
		).toBeCloseTo(expectedVeinStart.x, 6);
		expect(
			packet.capsules[veinRecord * CAPSULE_INSTANCE_STRIDE + CAPSULE_INSTANCE_OFFSET.startY]
		).toBeCloseTo(expectedVeinStart.y, 6);
		expect(
			packet.capsules[veinRecord * CAPSULE_INSTANCE_STRIDE + CAPSULE_INSTANCE_OFFSET.endX]
		).toBeCloseTo(expectedVeinEnd.x, 6);
		expect(
			packet.capsules[veinRecord * CAPSULE_INSTANCE_STRIDE + CAPSULE_INSTANCE_OFFSET.endY]
		).toBeCloseTo(expectedVeinEnd.y, 6);
	});

	it('hard-caps hostile capacity requests and reports truncation', () => {
		const phenotype = fixturePhenotype();
		const pose = createCreaturePose(phenotype);
		const packet = createRenderPacket({ plateCapacity: 2, capsuleCapacity: 3 });
		const stats = fillRenderPacket(packet, phenotype, pose, { view: 'surface' });
		expect(packet.plateCount).toBe(2);
		expect(packet.capsuleCount).toBe(3);
		expect(stats.requestedPlateCount).toBeGreaterThan(packet.plateCount);
		expect(stats.requestedCapsuleCount).toBeGreaterThan(packet.capsuleCount);
		expect(stats.truncated).toBe(true);
		expect(packet.plates.every(Number.isFinite)).toBe(true);
		expect(packet.capsules.every(Number.isFinite)).toBe(true);
	});

	it('keeps dimensionless bristle scale proportional to its owning plate', () => {
		const phenotype = fixturePhenotype();
		const pose = createCreaturePose(phenotype);
		const packet = createRenderPacket({ plateCapacity: 64, capsuleCapacity: 128 });
		fillRenderPacket(packet, phenotype, pose, { includeOverlays: false });
		const bristleIndex = Array.from({ length: packet.capsuleCount }, (_, index) => index).find(
			(index) =>
				packet.capsules[index * CAPSULE_INSTANCE_STRIDE + CAPSULE_INSTANCE_OFFSET.kind] ===
				CAPSULE_KIND.surface
		);
		expect(bristleIndex).toBeDefined();
		const offset = (bristleIndex ?? 0) * CAPSULE_INSTANCE_STRIDE;
		const length = Math.hypot(
			packet.capsules[offset + CAPSULE_INSTANCE_OFFSET.endX] -
				packet.capsules[offset + CAPSULE_INSTANCE_OFFSET.startX],
			packet.capsules[offset + CAPSULE_INSTANCE_OFFSET.endY] -
				packet.capsules[offset + CAPSULE_INSTANCE_OFFSET.startY]
		);
		const plate =
			phenotype.plates[
				phenotype.surfaceSamples.find((sample) => sample.kind === 'bristle')!.plateIndex
			];
		expect(length).toBeLessThan(Math.min(plate.width, plate.height) * 0.2);
	});

	it('prevents surface ornaments from dominating the default camera fit', () => {
		const phenotype = buildCreaturePhenotype(DEFAULT_GENOME);
		const pose = createCreaturePose(phenotype, { paused: true, genomeTime: 1.84 });
		const packet = createRenderPacket();
		fillRenderPacket(packet, phenotype, pose, { includeOverlays: false });
		const bounds = deriveRenderBounds(packet);
		expect(bounds.maxX - bounds.minX).toBeLessThan(3);
		expect(bounds.maxY - bounds.minY).toBeLessThan(3);
	});

	it('clears used records while retaining backing capacity', () => {
		const phenotype = fixturePhenotype();
		const pose = createCreaturePose(phenotype);
		const packet = createRenderPacket({ plateCapacity: 16, capsuleCapacity: 32 });
		fillRenderPacket(packet, phenotype, pose);
		const plates = packet.plates;
		const capsules = packet.capsules;
		clearRenderPacket(packet);
		expect(packet.plateCount).toBe(0);
		expect(packet.capsuleCount).toBe(0);
		expect(packet.plates).toBe(plates);
		expect(packet.capsules).toBe(capsules);
		expect(packet.plates.every((value) => value === 0)).toBe(true);
		expect(packet.capsules.every((value) => value === 0)).toBe(true);
	});
});
