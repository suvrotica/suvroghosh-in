import { BIAS_SIMILARITY_WEIGHTS, biasSimilarity } from './bias-similarity.ts';
import type {
	Bias,
	BiasLayout,
	BiasNeighbour,
	BiasPoint,
	LayoutLabel,
	TerrainGrid
} from './bias-types';

export interface EmbeddingCoordinate {
	x: number;
	y: number;
}

export type BiasCoordinates = Record<string, EmbeddingCoordinate>;
export type ManualPinMap = Readonly<Record<string, Readonly<EmbeddingCoordinate>>>;

export interface EmbeddingOptions {
	seed?: string;
	iterations?: number;
	margin?: number;
	pins?: ManualPinMap;
}

export interface TerrainOptions {
	width?: number;
	height?: number;
	sigma?: number;
}

export interface BiasLayoutOptions extends EmbeddingOptions, TerrainOptions {
	neighbourCount?: number;
	minimumNeighbourSimilarity?: number;
	familyLabels?: Readonly<Record<string, string>>;
	formationForFamily?: Readonly<Record<string, string>>;
	formationLabels?: Readonly<Record<string, string>>;
}

export const DEFAULT_EMBEDDING_SEED = 'bias-archipelago-layout-v1';
export const DEFAULT_EMBEDDING_ITERATIONS = 4_000;
export const DEFAULT_EMBEDDING_MARGIN = 0.06;
export const PRIMARY_LABEL_MINIMUM_DISTANCE = 0.13;

export const TERRAIN_HEIGHT_MEANING =
	'Height represents the density of related constructs, not severity, prevalence, irrationality, or empirical importance.';

/**
 * Curated anchors keep the principal regions readable. Unknown IDs are ignored,
 * so the map can be generated safely while the corpus is still being assembled.
 */
export const DEFAULT_REGION_PINS: ManualPinMap = Object.freeze({
	'availability-heuristic': { x: 0.18, y: 0.22 },
	'mere-exposure-effect': { x: 0.43, y: 0.14 },
	'hindsight-bias': { x: 0.12, y: 0.51 },
	'representativeness-heuristic': { x: 0.23, y: 0.79 },
	'confirmation-bias': { x: 0.43, y: 0.43 },
	'anchoring-effect': { x: 0.72, y: 0.34 },
	'loss-aversion': { x: 0.84, y: 0.5 },
	'self-serving-bias': { x: 0.77, y: 0.79 },
	'in-group-bias': { x: 0.54, y: 0.85 },
	groupthink: { x: 0.62, y: 0.68 },
	'fundamental-attribution-error': { x: 0.42, y: 0.68 },
	'present-bias': { x: 0.86, y: 0.17 }
});

function compareIds(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, places = 6): number {
	const scale = 10 ** places;
	return Math.round(value * scale) / scale;
}

function hashString(value: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

function seededUnit(value: string): number {
	let state = hashString(value);
	state = (state + 0x6d2b79f5) | 0;
	let mixed = state;
	mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
	mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
	return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000;
}

function assertUniqueBiasIds(biases: readonly Bias[]): void {
	const ids = new Set<string>();
	for (const bias of biases) {
		if (ids.has(bias.id)) throw new Error(`Duplicate bias ID in embedding input: ${bias.id}`);
		ids.add(bias.id);
	}
}

function rawFromNormalized(value: number, margin: number): number {
	return ((value - margin) / (1 - margin * 2)) * 2 - 1;
}

function normalizedFromRaw(value: number, margin: number): number {
	return margin + ((value + 1) / 2) * (1 - margin * 2);
}

function checkedMargin(value: number | undefined): number {
	const margin = value ?? DEFAULT_EMBEDDING_MARGIN;
	if (!Number.isFinite(margin) || margin < 0 || margin >= 0.25) {
		throw new RangeError('Embedding margin must be a finite number in [0, 0.25).');
	}
	return margin;
}

function initialPosition(
	seed: string,
	id: string,
	index: number,
	count: number
): EmbeddingCoordinate {
	const jitter = (seededUnit(`${seed}|${id}|angle`) - 0.5) * (Math.PI / Math.max(3, count));
	const angle = (index / Math.max(1, count)) * Math.PI * 2 + jitter;
	const radius = 0.24 + Math.sqrt(seededUnit(`${seed}|${id}|radius`)) * 0.6;
	return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function deterministicDirection(left: string, right: string): EmbeddingCoordinate {
	const angle = seededUnit(`${left}|${right}|separation`) * Math.PI * 2;
	return { x: Math.cos(angle), y: Math.sin(angle) };
}

function targetDistance(similarity: number): number {
	return 0.06 + (1 - similarity) ** 3 * 1.2;
}

function stressWeight(similarity: number): number {
	return 0.05 + similarity * 12;
}

/**
 * Deterministic weighted-stress embedding used only by the development-time
 * generator. Biases are sorted by ID, initialized from a fixed seed, and moved
 * by full-batch gradient descent towards distances derived from weighted
 * Jaccard similarity. Pins never move. A fixed affine transform from the
 * working square [-1, 1] to normalized map coordinates avoids data-order and
 * extrema-dependent normalization.
 */
export function createBiasEmbedding(
	biases: readonly Bias[],
	options: EmbeddingOptions = {}
): BiasCoordinates {
	assertUniqueBiasIds(biases);
	const ordered = [...biases].sort((left, right) => compareIds(left.id, right.id));
	if (ordered.length === 0) return {};

	const seed = options.seed ?? DEFAULT_EMBEDDING_SEED;
	const iterations = Math.max(
		0,
		Math.min(4_000, Math.round(options.iterations ?? DEFAULT_EMBEDDING_ITERATIONS))
	);
	const margin = checkedMargin(options.margin);
	const pins = options.pins ?? {};
	const positions = ordered.map((bias, index) =>
		initialPosition(seed, bias.id, index, ordered.length)
	);
	const pinned = new Uint8Array(ordered.length);

	for (let index = 0; index < ordered.length; index += 1) {
		const pin = pins[ordered[index].id];
		if (!pin) continue;
		if (
			!Number.isFinite(pin.x) ||
			!Number.isFinite(pin.y) ||
			pin.x < margin ||
			pin.x > 1 - margin ||
			pin.y < margin ||
			pin.y > 1 - margin
		) {
			throw new RangeError(
				`Manual pin for ${ordered[index].id} must be within the normalized map margin.`
			);
		}
		positions[index] = {
			x: rawFromNormalized(pin.x, margin),
			y: rawFromNormalized(pin.y, margin)
		};
		pinned[index] = 1;
	}

	const similarities = Array.from(
		{ length: ordered.length },
		() => new Float64Array(ordered.length)
	);
	for (let left = 0; left < ordered.length; left += 1) {
		for (let right = left + 1; right < ordered.length; right += 1) {
			const similarity = biasSimilarity(ordered[left], ordered[right]);
			similarities[left][right] = similarity;
			similarities[right][left] = similarity;
		}
	}

	const gradientScale = 1 / Math.max(1, ordered.length - 1);
	for (let iteration = 0; iteration < iterations; iteration += 1) {
		const gradientX = new Float64Array(ordered.length);
		const gradientY = new Float64Array(ordered.length);

		for (let left = 0; left < ordered.length; left += 1) {
			for (let right = left + 1; right < ordered.length; right += 1) {
				let dx = positions[left].x - positions[right].x;
				let dy = positions[left].y - positions[right].y;
				let distance = Math.hypot(dx, dy);
				if (distance < 1e-9) {
					const direction = deterministicDirection(ordered[left].id, ordered[right].id);
					dx = direction.x * 1e-6;
					dy = direction.y * 1e-6;
					distance = 1e-6;
				}

				const similarity = similarities[left][right];
				const desiredDistance = targetDistance(similarity);
				const pairWeight = stressWeight(similarity);
				const factor = pairWeight * (distance - desiredDistance) * gradientScale;
				const gx = factor * (dx / distance);
				const gy = factor * (dy / distance);
				gradientX[left] += gx;
				gradientY[left] += gy;
				gradientX[right] -= gx;
				gradientY[right] -= gy;
			}
		}

		const progress = iterations <= 1 ? 1 : iteration / (iterations - 1);
		const learningRate = 0.22 * (1 - progress * 0.88);
		for (let index = 0; index < ordered.length; index += 1) {
			if (pinned[index]) continue;
			const stepX = clamp(-gradientX[index] * learningRate, -0.05, 0.05);
			const stepY = clamp(-gradientY[index] * learningRate, -0.05, 0.05);
			positions[index].x = clamp(positions[index].x + stepX, -1, 1);
			positions[index].y = clamp(positions[index].y + stepY, -1, 1);
		}
	}

	const result: BiasCoordinates = {};
	for (let index = 0; index < ordered.length; index += 1) {
		result[ordered[index].id] = {
			x: round(normalizedFromRaw(positions[index].x, margin)),
			y: round(normalizedFromRaw(positions[index].y, margin))
		};
	}
	return result;
}

/** Weighted stress score, useful for transparent regression tests and diagnostics. */
export function embeddingStress(
	biases: readonly Bias[],
	coordinates: Readonly<BiasCoordinates>,
	margin = DEFAULT_EMBEDDING_MARGIN
): number {
	const ordered = [...biases].sort((left, right) => compareIds(left.id, right.id));
	const checked = checkedMargin(margin);
	let weightedError = 0;
	let totalWeight = 0;
	for (let left = 0; left < ordered.length; left += 1) {
		const leftPoint = coordinates[ordered[left].id];
		if (!leftPoint) throw new Error(`Missing coordinate for ${ordered[left].id}.`);
		for (let right = left + 1; right < ordered.length; right += 1) {
			const rightPoint = coordinates[ordered[right].id];
			if (!rightPoint) throw new Error(`Missing coordinate for ${ordered[right].id}.`);
			const dx = rawFromNormalized(leftPoint.x, checked) - rawFromNormalized(rightPoint.x, checked);
			const dy = rawFromNormalized(leftPoint.y, checked) - rawFromNormalized(rightPoint.y, checked);
			const similarity = biasSimilarity(ordered[left], ordered[right]);
			const desiredDistance = targetDistance(similarity);
			const pairWeight = stressWeight(similarity);
			const error = Math.hypot(dx, dy) - desiredDistance;
			weightedError += pairWeight * error * error;
			totalWeight += pairWeight;
		}
	}
	return totalWeight === 0 ? 0 : weightedError / totalWeight;
}

export function buildBiasNeighbourhoods(
	biases: readonly Bias[],
	count = 6,
	minimumSimilarity = 0.05
): Record<string, BiasNeighbour[]> {
	const ordered = [...biases].sort((left, right) => compareIds(left.id, right.id));
	const maximum = Math.max(0, Math.round(count));
	const result: Record<string, BiasNeighbour[]> = {};
	for (const bias of ordered) result[bias.id] = [];

	for (let left = 0; left < ordered.length; left += 1) {
		for (let right = left + 1; right < ordered.length; right += 1) {
			const similarity = biasSimilarity(ordered[left], ordered[right]);
			if (similarity < minimumSimilarity) continue;
			result[ordered[left].id].push({ id: ordered[right].id, similarity: round(similarity) });
			result[ordered[right].id].push({ id: ordered[left].id, similarity: round(similarity) });
		}
	}

	for (const neighbours of Object.values(result)) {
		neighbours.sort(
			(left, right) => right.similarity - left.similarity || compareIds(left.id, right.id)
		);
		neighbours.splice(maximum);
	}
	return result;
}

export function createGaussianTerrain(
	points: readonly EmbeddingCoordinate[],
	options: TerrainOptions = {}
): TerrainGrid {
	const width = Math.max(2, Math.min(512, Math.round(options.width ?? 96)));
	const height = Math.max(2, Math.min(512, Math.round(options.height ?? 64)));
	const sigma = options.sigma ?? 0.068;
	if (!Number.isFinite(sigma) || sigma <= 0 || sigma > 0.5) {
		throw new RangeError('Terrain sigma must be a finite number in (0, 0.5].');
	}

	const values = new Array<number>(width * height);
	const denominator = 2 * sigma * sigma;
	let minimum = Number.POSITIVE_INFINITY;
	let maximum = Number.NEGATIVE_INFINITY;
	for (let row = 0; row < height; row += 1) {
		const y = row / (height - 1);
		for (let column = 0; column < width; column += 1) {
			const x = column / (width - 1);
			let elevation = 0;
			for (const point of points) {
				const dx = x - point.x;
				const dy = y - point.y;
				elevation += Math.exp(-(dx * dx + dy * dy) / denominator);
			}
			const value = round(elevation < 0.0000005 ? 0 : elevation);
			values[row * width + column] = value;
			minimum = Math.min(minimum, value);
			maximum = Math.max(maximum, value);
		}
	}

	return {
		width,
		height,
		sigma: round(sigma),
		values,
		min: Number.isFinite(minimum) ? minimum : 0,
		max: Number.isFinite(maximum) ? maximum : 0,
		meaning: TERRAIN_HEIGHT_MEANING
	};
}

function sampleGrid(grid: TerrainGrid, point: EmbeddingCoordinate): number {
	const x = clamp(point.x, 0, 1) * (grid.width - 1);
	const y = clamp(point.y, 0, 1) * (grid.height - 1);
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const x1 = Math.min(grid.width - 1, x0 + 1);
	const y1 = Math.min(grid.height - 1, y0 + 1);
	const tx = x - x0;
	const ty = y - y0;
	const top = grid.values[y0 * grid.width + x0] * (1 - tx) + grid.values[y0 * grid.width + x1] * tx;
	const bottom =
		grid.values[y1 * grid.width + x0] * (1 - tx) + grid.values[y1 * grid.width + x1] * tx;
	return top * (1 - ty) + bottom * ty;
}

function humanize(id: string): string {
	return id
		.split('-')
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join(' ');
}

function buildLabels(
	biases: readonly Bias[],
	coordinates: Readonly<BiasCoordinates>,
	valueForBias: (bias: Bias) => readonly string[],
	labels: Readonly<Record<string, string>> | undefined
): LayoutLabel[] {
	const members = new Map<string, string[]>();
	for (const bias of biases) {
		for (const value of new Set(valueForBias(bias))) {
			const group = members.get(value) ?? [];
			group.push(bias.id);
			members.set(value, group);
		}
	}

	return [...members.entries()]
		.sort(([left], [right]) => compareIds(left, right))
		.map(([id, rawMembers]) => {
			const sortedMembers = rawMembers.sort(compareIds);
			let x = 0;
			let y = 0;
			for (const member of sortedMembers) {
				x += coordinates[member].x;
				y += coordinates[member].y;
			}
			return {
				id,
				label: labels?.[id] ?? humanize(id),
				colour: '#496f78',
				symbol: 'circle',
				x: round(x / sortedMembers.length),
				y: round(y / sortedMembers.length),
				members: sortedMembers
			};
		});
}

export function buildBiasLayout(
	biases: readonly Bias[],
	options: BiasLayoutOptions = {}
): BiasLayout {
	const seed = options.seed ?? DEFAULT_EMBEDDING_SEED;
	const iterations = Math.max(
		0,
		Math.min(4_000, Math.round(options.iterations ?? DEFAULT_EMBEDDING_ITERATIONS))
	);
	const pins = options.pins ?? DEFAULT_REGION_PINS;
	const coordinates = createBiasEmbedding(biases, { ...options, seed, iterations, pins });
	const neighbourhoods = buildBiasNeighbourhoods(
		biases,
		options.neighbourCount,
		options.minimumNeighbourSimilarity
	);
	const ordered = [...biases].sort((left, right) => compareIds(left.id, right.id));
	const terrain = createGaussianTerrain(
		ordered.map((bias) => coordinates[bias.id]),
		options
	);
	const scoredPoints = ordered.map((bias) => {
		const coordinate = coordinates[bias.id];
		const elevation = terrain.max > 0 ? sampleGrid(terrain, coordinate) / terrain.max : 0;
		const neighbours = neighbourhoods[bias.id];
		const centrality = neighbours.length
			? neighbours.reduce((sum, neighbour) => sum + neighbour.similarity, 0) / neighbours.length
			: 0;
		return {
			point: {
				id: bias.id,
				x: coordinate.x,
				y: coordinate.y,
				elevation: round(elevation),
				labelPriority: 2 as const,
				neighbours,
				family: bias.family
			},
			score: clamp(elevation * 0.68 + centrality * 0.32, 0, 1)
		};
	});

	const ids = new Set(ordered.map((bias) => bias.id));
	const pinnedIds = Object.keys(pins)
		.filter((id) => ids.has(id))
		.sort(compareIds);
	const pinnedSet = new Set(pinnedIds);
	const prominenceOrder = [...scoredPoints].sort(
		(left, right) => right.score - left.score || compareIds(left.point.id, right.point.id)
	);
	const primaryLabelCount = Math.max(1, Math.ceil(prominenceOrder.length * 0.2));
	const secondaryLabelCount = Math.max(primaryLabelCount, Math.ceil(prominenceOrder.length * 0.55));
	const priorityById = new Map<string, 0 | 1 | 2>();
	const pointById = new Map(scoredPoints.map(({ point }) => [point.id, point]));
	const primaryIds = new Set(pinnedSet);
	for (const entry of prominenceOrder) {
		if (primaryIds.size >= primaryLabelCount) break;
		if (primaryIds.has(entry.point.id)) continue;
		const separated = [...primaryIds].every((id) => {
			const other = pointById.get(id);
			return (
				!other ||
				Math.hypot(entry.point.x - other.x, entry.point.y - other.y) >=
					PRIMARY_LABEL_MINIMUM_DISTANCE
			);
		});
		if (separated) primaryIds.add(entry.point.id);
	}
	for (const entry of prominenceOrder) {
		if (primaryIds.size >= primaryLabelCount) break;
		primaryIds.add(entry.point.id);
	}
	for (const id of primaryIds) priorityById.set(id, 0);
	let primaryAndSecondaryAssigned = primaryIds.size;
	for (const entry of prominenceOrder) {
		if (primaryIds.has(entry.point.id)) continue;
		if (primaryAndSecondaryAssigned < secondaryLabelCount) {
			priorityById.set(entry.point.id, 1);
			primaryAndSecondaryAssigned += 1;
		} else {
			priorityById.set(entry.point.id, 2);
		}
	}
	const points: BiasPoint[] = scoredPoints.map(({ point }) => ({
		...point,
		labelPriority: priorityById.get(point.id) ?? 2
	}));

	return {
		version: 2,
		seed,
		algorithm: {
			name: 'weighted-jaccard-stress-v2',
			iterations,
			weights: { ...BIAS_SIMILARITY_WEIGHTS },
			pinnedIds
		},
		points,
		families: buildLabels(biases, coordinates, (bias) => [bias.family], options.familyLabels),
		formations: buildLabels(
			biases,
			coordinates,
			(bias) => [options.formationForFamily?.[bias.family] ?? bias.family],
			options.formationLabels
		),
		terrain
	};
}
