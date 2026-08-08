import { normalizeFlowerConfig } from './config';
import { getPreset } from './presets';
import { createSeededRandom, deriveBloomSeeds, deriveSeed, hashString32, hashToHex } from './seed';
import type {
	BloomBounds,
	BloomGeometry,
	FlowerConfig,
	PetalGeometry,
	PetalRibbon,
	Point2D,
	TipStyle,
	WhorlGeometry
} from './types';

const TAU = Math.PI * 2;
const MIN_GEOMETRY_SAMPLES = 8;
const MAX_GEOMETRY_SAMPLES = 256;

export type BloomGeometryOptions = Readonly<{
	samplesPerPetal?: number;
}>;

function vector(x: number, y: number): Point2D {
	return { x, y };
}

function normalizedVector(x: number, y: number, fallback: Point2D): Point2D {
	const length = Math.hypot(x, y);
	return length > 1e-12 ? vector(x / length, y / length) : fallback;
}

export function estimateTangents(points: readonly Point2D[]): readonly Point2D[] {
	if (points.length < 2) throw new RangeError('A petal centerline needs at least two points.');
	const tangents: Point2D[] = [];
	let fallback = vector(1, 0);
	for (let index = 0; index < points.length; index += 1) {
		const before = points[Math.max(0, index - 1)];
		const after = points[Math.min(points.length - 1, index + 1)];
		const tangent = normalizedVector(after.x - before.x, after.y - before.y, fallback);
		tangents.push(tangent);
		fallback = tangent;
	}
	return tangents;
}

export function normalsFromTangents(tangents: readonly Point2D[]): readonly Point2D[] {
	return tangents.map((tangent) => normalizedVector(-tangent.y, tangent.x, vector(0, 1)));
}

/**
 * Builds a closed membrane around a sampled centerline. Callers may supply cached tangents and
 * normals; otherwise stable finite-difference tangents are calculated once here.
 */
export function buildPetalRibbon(
	centerline: readonly Point2D[],
	halfWidths: readonly number[],
	tangents: readonly Point2D[] = estimateTangents(centerline),
	normals: readonly Point2D[] = normalsFromTangents(tangents)
): PetalRibbon {
	if (centerline.length < 2) throw new RangeError('A petal centerline needs at least two points.');
	if (
		halfWidths.length !== centerline.length ||
		tangents.length !== centerline.length ||
		normals.length !== centerline.length
	) {
		throw new RangeError('Petal centerline, widths, tangents and normals must have equal lengths.');
	}
	const safeWidths = halfWidths.map((width) => (Number.isFinite(width) ? Math.max(0, width) : 0));
	const safeTangents = tangents.map((tangent) =>
		normalizedVector(tangent.x, tangent.y, vector(1, 0))
	);
	const safeNormals = normals.map((normal, index) =>
		normalizedVector(normal.x, normal.y, vector(-safeTangents[index].y, safeTangents[index].x))
	);
	const leftEdge = centerline.map((point, index) =>
		vector(
			point.x + safeNormals[index].x * safeWidths[index],
			point.y + safeNormals[index].y * safeWidths[index]
		)
	);
	const rightEdge = centerline.map((point, index) =>
		vector(
			point.x - safeNormals[index].x * safeWidths[index],
			point.y - safeNormals[index].y * safeWidths[index]
		)
	);
	const ribbon = [...leftEdge, ...[...rightEdge].reverse(), leftEdge[0]];
	return {
		centerline: [...centerline],
		tangents: safeTangents,
		normals: safeNormals,
		halfWidths: safeWidths,
		leftEdge,
		rightEdge,
		ribbon
	};
}

/** Negative inside the square, zero on its wall and positive outside. */
export function squareSignedDistance(point: Point2D, halfSize: number): number {
	const safeHalfSize = Number.isFinite(halfSize) ? Math.max(0, halfSize) : 0;
	return Math.max(Math.abs(point.x), Math.abs(point.y)) - safeHalfSize;
}

export const distanceToSquare = squareSignedDistance;

function smoothstep(edge0: number, edge1: number, value: number): number {
	if (edge0 === edge1) return value < edge0 ? 0 : 1;
	const normalized = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
	return normalized * normalized * (3 - 2 * normalized);
}

function radialEase(value: number): number {
	return 1 - Math.pow(1 - value, 1.38);
}

function tipWidthMultiplier(value: number, style: TipStyle): number {
	switch (style) {
		case 'rounded':
			return 0.9 + 0.18 * smoothstep(0.55, 0.82, value);
		case 'pointed':
			return 1 - 0.38 * smoothstep(0.58, 1, value);
		case 'split':
			return 1 - 0.3 * smoothstep(0.72, 0.94, value);
		case 'filamented':
			return 1 - 0.58 * smoothstep(0.62, 0.95, value);
		case 'recurved':
		default:
			return 1 - 0.12 * smoothstep(0.72, 1, value);
	}
}

function tipBend(value: number, style: TipStyle, direction: number): number {
	const tip = smoothstep(0.68, 1, value);
	switch (style) {
		case 'recurved':
			return direction * 0.16 * tip * tip;
		case 'split':
			return direction * 0.055 * tip * tip;
		case 'filamented':
			return direction * 0.08 * tip * tip;
		default:
			return 0;
	}
}

function sampleCount(config: Readonly<FlowerConfig>, requested?: number): number {
	const defaultCount = config.quality === 'low' ? 24 : config.quality === 'high' ? 56 : 40;
	const candidate = Number.isFinite(requested) ? Math.round(requested as number) : defaultCount;
	return Math.max(MIN_GEOMETRY_SAMPLES, Math.min(MAX_GEOMETRY_SAMPLES, candidate));
}

function whorlScale(index: number, count: number): number {
	if (count <= 1) return 1;
	return 0.38 + (0.62 * index) / (count - 1);
}

function geometryBounds(petals: readonly PetalGeometry[]): BloomBounds {
	let minX = 0;
	let minY = 0;
	let maxX = 0;
	let maxY = 0;
	for (const petal of petals) {
		for (const point of petal.ribbon) {
			minX = Math.min(minX, point.x);
			minY = Math.min(minY, point.y);
			maxX = Math.max(maxX, point.x);
			maxY = Math.max(maxY, point.y);
		}
	}
	return { minX, minY, maxX, maxY };
}

function morphologyRecord(config: Readonly<FlowerConfig>): Readonly<Record<string, unknown>> {
	return {
		version: 1,
		seed: config.seed,
		petals: config.petals,
		whorls: config.whorls,
		bloomScale: config.bloomScale,
		petalLength: config.petalLength,
		petalWidth: config.petalWidth,
		widthProfile: config.widthProfile,
		curl: config.curl,
		symmetry: config.symmetry,
		asymmetry: config.asymmetry,
		tipStyle: config.tipStyle,
		noiseStrength: config.noiseStrength,
		noiseScale: config.noiseScale,
		domainWarp: config.domainWarp,
		octaves: config.octaves,
		falloff: config.falloff,
		boxSize: config.boxSize,
		constraint: config.constraint,
		ruptureThreshold: config.ruptureThreshold,
		breakout: config.breakout,
		boundaryPhysics: config.boundaryPhysics
	};
}

export function morphologyHash(input: Readonly<FlowerConfig>): string {
	const config = normalizeFlowerConfig(input);
	return `pb1-${hashToHex(hashString32(JSON.stringify(morphologyRecord(config))))}`;
}

export const getMorphologyHash = morphologyHash;

export function buildBloomGeometry(
	input: Readonly<FlowerConfig>,
	options: BloomGeometryOptions = {}
): BloomGeometry {
	const config = normalizeFlowerConfig(input);
	const samples = sampleCount(config, options.samplesPerPetal);
	const seeds = deriveBloomSeeds(config.seed);
	const rootRandom = createSeededRandom(seeds.morphology);
	const petals: PetalGeometry[] = [];
	const whorls: WhorlGeometry[] = [];
	const petalStep = TAU / config.petals;

	for (let whorlIndex = 0; whorlIndex < config.whorls; whorlIndex += 1) {
		const scale = whorlScale(whorlIndex, config.whorls);
		const angularOffset = (whorlIndex * petalStep * 0.47) % TAU;
		const petalIndices: number[] = [];
		for (let indexInWhorl = 0; indexInWhorl < config.petals; indexInWhorl += 1) {
			const index = petals.length;
			const random = rootRandom.fork(`whorl-${whorlIndex}:petal-${indexInWhorl}`);
			const disorder = config.asymmetry * (1 - config.symmetry * 0.65);
			const angleJitter = random.float(-1, 1) * disorder * 0.42;
			const angle = indexInWhorl * petalStep + angularOffset + angleJitter;
			const lengthVariation = 1 + random.float(-1, 1) * disorder * 0.48;
			const widthVariation = 1 + random.float(-1, 1) * disorder * 0.42;
			const outerFactor = config.whorls <= 1 ? 1 : whorlIndex / (config.whorls - 1);
			const length =
				config.bloomScale *
				config.petalLength *
				scale *
				lengthVariation *
				(1 + config.breakout * 0.08 * outerFactor);
			const maximumHalfWidth =
				config.bloomScale * config.petalWidth * (0.46 + 0.54 * scale) * widthVariation * 0.5;
			const bendPhase = random.float(0, TAU);
			const warpPhase = random.float(0, TAU);
			const tipDirection = random.boolean() ? 1 : -1;
			const centerline: Point2D[] = [];
			const halfWidths: number[] = [];
			for (let sample = 0; sample < samples; sample += 1) {
				const u = sample / (samples - 1);
				const envelope = Math.pow(Math.max(0, Math.sin(Math.PI * u)), config.widthProfile);
				const coherentWidth =
					1 + config.noiseStrength * 0.18 * Math.sin(Math.PI * u * 2 + bendPhase) * envelope;
				halfWidths.push(
					maximumHalfWidth * envelope * tipWidthMultiplier(u, config.tipStyle) * coherentWidth
				);

				const radialDistance = 0.025 * scale + length * radialEase(u);
				const baseBend = config.curl * Math.sin(Math.PI * u) * (0.55 + 0.45 * scale);
				const coherentBend =
					config.noiseStrength *
					(0.025 + disorder * 0.12) *
					Math.sin(Math.PI * u * 2 + bendPhase) *
					Math.sin(Math.PI * u);
				const warpedBend =
					config.domainWarp *
					config.noiseStrength *
					0.035 *
					Math.sin(Math.PI * u * 3 + warpPhase) *
					Math.sin(Math.PI * u);
				const localAngle =
					angle + baseBend + coherentBend + warpedBend + tipBend(u, config.tipStyle, tipDirection);
				centerline.push(
					vector(radialDistance * Math.cos(localAngle), radialDistance * Math.sin(localAngle))
				);
			}
			// Exact zero widths at both ends prevent balloon-like bases and leave a closed tip.
			halfWidths[0] = 0;
			halfWidths[halfWidths.length - 1] = 0;
			const ribbon = buildPetalRibbon(centerline, halfWidths);
			const boundaryDistances = centerline.map((point) =>
				squareSignedDistance(point, config.boxSize)
			);
			const outlineDistances = ribbon.ribbon.map((point) =>
				squareSignedDistance(point, config.boxSize)
			);
			const crossesBoundary =
				outlineDistances.some((distance) => distance <= 0) &&
				outlineDistances.some((distance) => distance > 0);
			petals.push({
				id: `w${whorlIndex + 1}-p${indexInWhorl + 1}`,
				index,
				whorlIndex,
				indexInWhorl,
				angle,
				length,
				maximumHalfWidth,
				...ribbon,
				boundaryDistances,
				crossesBoundary
			});
			petalIndices.push(index);
		}
		whorls.push({ index: whorlIndex, scale, angularOffset, petalIndices });
	}

	return {
		seedHash: seeds.base,
		morphologyHash: morphologyHash(config),
		center: vector(0, 0),
		petals,
		whorls,
		bounds: geometryBounds(petals)
	};
}

export function geometrySignature(geometry: Readonly<BloomGeometry>): string {
	let signature = geometry.morphologyHash;
	for (const petal of geometry.petals) {
		signature += `|${petal.id}`;
		for (const point of petal.centerline) {
			signature += `:${Math.round(point.x * 1_000_000)},${Math.round(point.y * 1_000_000)}`;
		}
	}
	return `pbg-${hashToHex(hashString32(signature))}`;
}

export function describeBloom(
	input: Readonly<FlowerConfig>,
	geometry: Readonly<BloomGeometry> = buildBloomGeometry(input)
): string {
	const config = normalizeFlowerConfig(input);
	const preset = getPreset(config.preset);
	const palette = getPreset(config.palette);
	const outerIndex = Math.max(0, config.whorls - 1);
	const outerCrossings = geometry.petals.filter(
		(petal) => petal.whorlIndex === outerIndex && petal.crossesBoundary
	).length;
	const noise =
		config.noiseStrength < 0.12 ? 'low' : config.noiseStrength < 0.28 ? 'moderate' : 'high';
	const warp = config.domainWarp < 0.25 ? 'low' : config.domainWarp < 0.6 ? 'moderate' : 'high';
	const crossingText =
		outerCrossings === 0
			? 'Its reconstructed base morphology keeps the outer petals inside the square boundary.'
			: `In its reconstructed base morphology, ${outerCrossings} outer ${outerCrossings === 1 ? 'petal crosses' : 'petals cross'} the square boundary.`;
	const paletteText =
		config.palette === config.preset ? '' : ` It is lit with the ${palette.name} palette.`;
	return `Seed ${config.seed} produces a ${config.petals}-petal-per-whorl, ${config.whorls}-whorl ${preset.name} bloom. ${crossingText} Noise strength is ${noise} and domain warping is ${warp}.${paletteText}`;
}

/** Stable labelled seed for renderer details such as individual vein systems. */
export function geometryDetailSeed(config: Readonly<FlowerConfig>, label: string): number {
	return deriveSeed(morphologyHash(config), label);
}
