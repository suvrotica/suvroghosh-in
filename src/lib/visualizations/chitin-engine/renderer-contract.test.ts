import { describe, expect, it, vi } from 'vitest';
import {
	createFallbackProjection,
	deriveFallbackBounds,
	generalizedSuperellipsePoint,
	projectFallbackPoint,
	renderFallbackFrame
} from './fallback-renderer';
import {
	CAPSULE_FRAGMENT_SHADER,
	CAPSULE_VERTEX_SHADER,
	CHAMBER_FRAGMENT_SHADER,
	CHAMBER_VERTEX_SHADER,
	PLATE_FRAGMENT_SHADER,
	PLATE_VERTEX_SHADER
} from './shader-sources';
import type {
	CreaturePhenotype,
	CreaturePose,
	ExhibitState,
	PaletteDefinition,
	RenderPacket
} from './types';
import {
	CAPSULE_INSTANCE_OFFSET,
	CAPSULE_INSTANCE_STRIDE,
	deriveRenderBounds,
	deriveRenderProjection,
	formatShaderFailure,
	materialIndex,
	normalizeCellularScale,
	normalizeInstanceSeed,
	normalizePaletteColour,
	PLATE_INSTANCE_OFFSET,
	PLATE_INSTANCE_STRIDE,
	resolveRenderCounts,
	viewModeIndex
} from './webgl-renderer';

describe('Chitin WebGL source contract', () => {
	it('keeps each instance record aligned to documented vec4 attributes', () => {
		expect(PLATE_INSTANCE_STRIDE).toBe(20);
		expect(CAPSULE_INSTANCE_STRIDE).toBe(16);
		expect(Object.values(PLATE_INSTANCE_OFFSET).sort((a, b) => a - b)).toEqual(
			Array.from({ length: PLATE_INSTANCE_STRIDE }, (_, index) => index)
		);
		expect(Object.values(CAPSULE_INSTANCE_OFFSET).sort((a, b) => a - b)).toEqual(
			Array.from({ length: CAPSULE_INSTANCE_STRIDE }, (_, index) => index)
		);
		expect(PLATE_VERTEX_SHADER).toContain('layout(location = 5) in vec4 aMetadata');
		expect(CAPSULE_VERTEX_SHADER).toContain('layout(location = 4) in vec4 aMetadata');
	});

	it('uses bounded implicit primitives, derivatives, and fixed 3x3 object-local Worley', () => {
		for (const source of [
			CHAMBER_VERTEX_SHADER,
			CHAMBER_FRAGMENT_SHADER,
			PLATE_VERTEX_SHADER,
			PLATE_FRAGMENT_SHADER,
			CAPSULE_VERTEX_SHADER,
			CAPSULE_FRAGMENT_SHADER
		]) {
			expect(source.trimStart()).toMatch(/^#version 300 es/);
		}
		expect(PLATE_FRAGMENT_SHADER).toContain('superellipseField');
		expect(PLATE_FRAGMENT_SHADER).toContain('fwidth(field)');
		expect(PLATE_FRAGMENT_SHADER).toContain('worleyF1Gap');
		expect(PLATE_FRAGMENT_SHADER).toContain('for (int y = -1; y <= 1; ++y)');
		expect(PLATE_FRAGMENT_SHADER).toContain('for (int x = -1; x <= 1; ++x)');
		expect(PLATE_FRAGMENT_SHADER).toContain('max(0.0, f2 - f1)');
		expect(CAPSULE_FRAGMENT_SHADER).toContain('mix(max(vGeometry.x');
		expect(CAPSULE_FRAGMENT_SHADER).toContain('dot(vWorld - a, segment) / denominator');
		expect(CAPSULE_FRAGMENT_SHADER).toContain('fwidth(field)');
		expect(PLATE_VERTEX_SHADER).toContain('aCorner * bound');
		expect(CAPSULE_VERTEX_SHADER).toContain('aCorner.x * axialExtent');
		expect(PLATE_FRAGMENT_SHADER).not.toContain('uPrimitiveCount');
		expect(CAPSULE_FRAGMENT_SHADER).not.toContain('uPrimitiveCount');
	});

	it('exposes all seven stable view modes and material identifiers', () => {
		expect([
			viewModeIndex('specimen'),
			viewModeIndex('anatomy'),
			viewModeIndex('gait'),
			viewModeIndex('surface'),
			viewModeIndex('silhouette'),
			viewModeIndex('fluorescence'),
			viewModeIndex('depth')
		]).toEqual([0, 1, 2, 3, 4, 5, 6]);
		expect(materialIndex('obsidian-iridescent')).toBe(0);
		expect(materialIndex('reactor-enamel')).toBe(6);
	});

	it('keeps production shader failures concise and development failures actionable', () => {
		const production = formatShaderFailure('plate fragment', 'ERROR: 0:7', 'bad shader', false);
		const development = formatShaderFailure('plate fragment', 'ERROR: 0:7', 'first\nsecond', true);
		expect(production.message).toBe('The plate fragment shader could not be compiled.');
		expect(production.message).not.toContain('ERROR');
		expect(development.message).toContain('ERROR: 0:7');
		expect(development.message).toContain('   2 | second');
	});
});

describe('Chitin packet safety and fit', () => {
	it('caps requested counts to both array capacity and renderer budgets', () => {
		const packet = packetFixture(6, 5, 99, 99);
		const counts = resolveRenderCounts(packet, { plates: 4, capsules: 3 });
		expect(counts).toMatchObject({
			requestedPlates: 99,
			requestedCapsules: 99,
			availablePlates: 6,
			availableCapsules: 5,
			plates: 4,
			capsules: 3,
			truncated: true
		});
	});

	it('treats invalid counts as zero without inspecting invalid memory', () => {
		const negative = packetFixture(1, 1, -4, Number.NaN);
		expect(resolveRenderCounts(negative)).toMatchObject({ plates: 0, capsules: 0 });
	});

	it('derives finite conservative bounds and an aspect-correct fit', () => {
		const packet = packetFixture(1, 1, 1, 1);
		packet.plates.set([2, -1, 0.5, 0.25, 0, 0, 2.4, 0.1, 4, 0.5, 0.31, 0, 1, 1, 0, 0, 2, 0, 1, 0]);
		packet.capsules.set([0, -2, 3, -2, 0.1, 0.08, -0.1, 0.04, 1, 0.4, 1, 0, 0, 0, 0, 1]);
		const bounds = deriveRenderBounds(packet);
		expect(bounds.minX).toBeLessThan(-0.1);
		expect(bounds.maxX).toBeGreaterThan(3.1);
		expect(bounds.minY).toBeLessThan(-2.1);
		const projection = deriveRenderProjection(packet, 1200, 600);
		expect(Object.values(projection).every(Number.isFinite)).toBe(true);
		expect(projection.scaleY / projection.scaleX).toBeCloseTo(2, 10);
	});

	it('normalizes both unit and byte palettes without mutating inputs', () => {
		const unit = [0.1, 0.4, 0.9] as const;
		const bytes = [10, 128, 255] as const;
		expect(normalizePaletteColour(unit)).toEqual(unit);
		expect(normalizePaletteColour(bytes)).toEqual([10 / 255, 128 / 255, 1]);
		expect(bytes).toEqual([10, 128, 255]);
	});

	it('normalizes integer phenotype hashes to stable object-local shader seeds', () => {
		expect(normalizeInstanceSeed(0.25)).toBe(0.25);
		expect(normalizeInstanceSeed(0xffff_ffff)).toBeCloseTo(1, 8);
		expect(normalizeInstanceSeed(Number.NaN)).toBe(0);
		expect(normalizeInstanceSeed(-4.75)).toBe(0.25);
	});

	it('maps the full authored cellular-scale range instead of saturating it', () => {
		expect(normalizeCellularScale(2.5)).toBe(0);
		expect(normalizeCellularScale(10.25)).toBe(0.5);
		expect(normalizeCellularScale(18)).toBe(1);
		expect(normalizeCellularScale(30)).toBe(1);
	});
});

describe('Chitin Canvas2D fallback', () => {
	it('samples deterministic lobed generalized superellipses without entropy', () => {
		const first = generalizedSuperellipsePoint(0.72, 2.8, 0.12, 5, 0.4);
		const repeat = generalizedSuperellipsePoint(0.72, 2.8, 0.12, 5, 0.4);
		const changedSeed = generalizedSuperellipsePoint(0.72, 2.8, 0.12, 5, 0.8);
		expect(first).toEqual(repeat);
		expect(changedSeed).not.toEqual(first);
		expect(Object.values(first).every(Number.isFinite)).toBe(true);
	});

	it('fits body and posed limb extents and projects camera depth deterministically', () => {
		const { phenotype, pose, state } = fallbackFixture();
		const bounds = deriveFallbackBounds(phenotype, pose);
		expect(bounds.minX).toBeLessThan(-0.9);
		expect(bounds.maxX).toBeGreaterThan(1.4);
		const projection = createFallbackProjection(bounds, 800, 400);
		const first = projectFallbackPoint({ x: 0.4, y: 0.2 }, 0.3, projection, state);
		const repeat = projectFallbackPoint({ x: 0.4, y: 0.2 }, 0.3, projection, state);
		expect(first).toEqual(repeat);
		expect(Object.values(first).every(Number.isFinite)).toBe(true);
	});

	it('draws chamber, plates, limbs, eyes, marks, labels and overlays in Node', () => {
		const { context, calls } = mockCanvasContext();
		const { phenotype, pose, state, palette } = fallbackFixture();
		const stats = renderFallbackFrame(context, phenotype, pose, state, {
			palette,
			width: 900,
			height: 560,
			pixelRatio: 1,
			exportSafe: true,
			selectedSegment: 0
		});
		expect(stats).toMatchObject({ width: 900, height: 560, plates: 1, limbs: 1, eyes: 1 });
		expect(calls).toContain('fillRect');
		expect(calls).toContain('lineTo');
		expect(calls).toContain('arc');
		expect(calls).toContain('fill');
		expect(calls).toContain('stroke');
		expect(calls).toContain('fillText');
	});
});

function packetFixture(
	plateCapacity: number,
	capsuleCapacity: number,
	plateCount: number,
	capsuleCount: number
): RenderPacket {
	return {
		plates: new Float32Array(plateCapacity * PLATE_INSTANCE_STRIDE),
		plateCount,
		capsules: new Float32Array(capsuleCapacity * CAPSULE_INSTANCE_STRIDE),
		capsuleCount,
		view: 'specimen',
		selectedSegment: -1
	};
}

function fallbackFixture(): {
	phenotype: CreaturePhenotype;
	pose: CreaturePose;
	state: ExhibitState;
	palette: PaletteDefinition;
} {
	const plate = {
		id: 'plate-0',
		segmentIndex: 0,
		region: 0,
		center: { x: 0, y: 0 },
		tangent: { x: 1, y: 0 },
		normal: { x: 0, y: 1 },
		width: 1.4,
		height: 0.8,
		rotation: 0.08,
		depth: 0.1,
		exponent: 2.5,
		lobeAmplitude: 0.08,
		lobeCount: 4,
		ridge: 0.5,
		seed: 0.32,
		damage: 0.1
	};
	const phenotype = {
		plates: [plate],
		limbs: [
			{
				id: 'limb-0',
				kind: 'walking',
				rootSegment: 0,
				side: 1,
				pairIndex: 0,
				rootOffset: 0,
				boneLengths: [0.6, 0.7],
				thicknesses: [0.08, 0.05, 0.025],
				preferredBend: 1,
				phaseOffset: 0,
				clawCount: 2,
				depth: 0.2
			}
		],
		eyes: [
			{
				id: 'eye-0',
				segmentIndex: 0,
				local: { x: -0.2, y: 0.15 },
				radius: 0.08,
				depth: 0.2,
				seed: 0.4
			}
		],
		flexibleAppendages: [],
		wings: [],
		surfaceSamples: [
			{ plateIndex: 0, local: { x: 0.2, y: -0.1 }, kind: 'pit', scale: 0.03, angle: 0 }
		],
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
				position: { x: 0.5, y: 0 },
				tangent: { x: 1, y: 0 },
				normal: { x: 0, y: 1 },
				depth: 0
			}
		],
		archiveDesignation: 'CE-XENO-0042',
		informalName: 'Test crawler',
		fingerprint: 'fixture-fingerprint-0001'
	} as unknown as CreaturePhenotype;
	const pose = {
		time: 2.5,
		limbs: [
			{
				id: 'limb-0',
				joints: [
					{ x: -0.3, y: 0 },
					{ x: 0.7, y: -0.8 },
					{ x: 1.5, y: -1.1 }
				],
				target: { x: 1.5, y: -1.1 },
				phase: 0.4,
				planted: true
			}
		],
		flexible: new Map(),
		bodyOffset: { x: 0, y: 0 },
		threat: 0,
		startle: 0
	} satisfies CreaturePose;
	const state = {
		view: 'anatomy',
		cameraYaw: 0.16,
		cameraPitch: -0.08,
		cameraRoll: 0.03,
		scannerIntensity: 0.5,
		bloom: 0.4,
		grain: 0,
		chromaticFault: 0
	} as ExhibitState;
	const palette = {
		id: 'ultraviolet-petrol',
		name: 'Fixture',
		background: [5, 8, 11],
		chamber: [18, 29, 33],
		shellA: [34, 70, 75],
		shellB: [104, 139, 116],
		membrane: [30, 45, 49],
		emission: [151, 242, 205],
		eye: [215, 239, 225],
		corrosion: [130, 94, 46]
	} satisfies PaletteDefinition;
	return { phenotype, pose, state, palette };
}

function mockCanvasContext(): {
	context: CanvasRenderingContext2D;
	calls: string[];
} {
	const calls: string[] = [];
	const method = (name: string) => vi.fn(() => calls.push(name));
	const gradient = () => ({ addColorStop: method('addColorStop') });
	const context = {
		canvas: { width: 900, height: 560 },
		fillStyle: '',
		strokeStyle: '',
		lineWidth: 1,
		lineCap: 'butt',
		lineJoin: 'miter',
		shadowColor: '',
		shadowBlur: 0,
		font: '',
		textAlign: 'start',
		textBaseline: 'alphabetic',
		save: method('save'),
		restore: method('restore'),
		setTransform: method('setTransform'),
		clearRect: method('clearRect'),
		fillRect: method('fillRect'),
		beginPath: method('beginPath'),
		closePath: method('closePath'),
		moveTo: method('moveTo'),
		lineTo: method('lineTo'),
		quadraticCurveTo: method('quadraticCurveTo'),
		arc: method('arc'),
		fill: method('fill'),
		stroke: method('stroke'),
		setLineDash: method('setLineDash'),
		fillText: method('fillText'),
		createLinearGradient: vi.fn(gradient),
		createRadialGradient: vi.fn(gradient)
	} as unknown as CanvasRenderingContext2D;
	return { context, calls };
}
