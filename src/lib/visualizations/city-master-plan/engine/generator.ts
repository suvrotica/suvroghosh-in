import { createRandomStreams, type SeededRandom } from '../../../utils/seeded-random';
import { analyseCity } from './analysis';
import {
	ANCHOR_BY_ID,
	anchorCells,
	anchorFrontageDirection,
	clampAnchorPlacement,
	meetsRequiredSubstrate,
	providesPedestrianFrontage
} from './anchors';
import { applyAnchorWeightInfluence } from './anchorInfluence';
import { BitSet } from './bitset';
import { createFabricCatalog, createOccupationCatalog, findVariant } from './catalog';
import { CITY_GRID_PRESETS, CIVIC_PATIENCE_BUDGETS, HARD_STEP_MULTIPLIER } from './constants';
import { DIRECTION_DELTAS, indexForCoordinate, neighbourIndex } from './directions';
import { createElevationField } from './elevation';
import { createCityFingerprint, createCityName, createMunicipalReport } from './identity';
import { generateInfrastructure } from './infrastructure';
import { scoreCity } from './scoring';
import { normalizeCityConfig } from './serialize';
import type {
	CityConfig,
	CityResult,
	CityTile,
	Direction,
	GenerationEvent,
	GenerationProgressCallback,
	Portal,
	Rotation,
	TileVariant
} from './types';
import { createInitialWave, runWaveCollapse } from './wave';

const STREAM_NAMES = [
	'boundary',
	'fabric',
	'occupation',
	'infrastructure',
	'repair',
	'details',
	'name'
] as const;

export function generateCity(
	requestedConfig: CityConfig,
	progressCallback?: GenerationProgressCallback
): CityResult {
	const parsed = normalizeCityConfig(requestedConfig);
	if (parsed.unsupportedVersion) {
		throw new RangeError(
			`Generator version ${requestedConfig.generatorVersion} is unsupported; this engine implements version 1.`
		);
	}
	const config = parsed.config;
	const dimensions = CITY_GRID_PRESETS[config.size];
	config.anchor = clampAnchorPlacement(config.anchor, dimensions.width, dimensions.height);
	const { width, height } = dimensions;
	const cellCount = width * height;
	const hardStepBudget = cellCount * HARD_STEP_MULTIPLIER;
	const streams = createRandomStreams(config.seed, STREAM_NAMES);
	const events: GenerationEvent[] = [];
	const emit = (event: GenerationEvent) => {
		events.push(event);
		progressCallback?.(event);
	};
	const timingStart = now();

	emit({
		type: 'phase',
		pass: 'fabric',
		message: 'Negotiating lanes, parcels, ponds, and boundary exits.',
		progress: 0
	});
	const fabricStart = now();
	const portals = chooseBoundaryPortals(config, width, height, streams.boundary);
	const fabricCatalog = createFabricCatalog(config);
	const fabricWave = createInitialWave(cellCount, fabricCatalog.length);
	applyAnchorWeightInfluence(config, fabricWave, fabricCatalog, width);
	applyBoundaryConstraints(fabricWave, fabricCatalog, width, height, portals);
	applyFabricAnchorConstraints(config, fabricWave, fabricCatalog, width, height);
	if (config.minimumGuarantees) {
		applyMinimumGuarantees(config, fabricWave, fabricCatalog, width, height);
	}
	const fabricResult = runWaveCollapse({
		width,
		height,
		pass: 'fabric',
		variants: fabricCatalog,
		initialWave: fabricWave,
		random: streams.fabric,
		tieBreakerSeed: `${config.seed}/fabric`,
		maxBacktracks: CIVIC_PATIENCE_BUDGETS[config.civicPatience],
		hardStepBudget,
		conflictTags: (index, wave) =>
			conflictTagsForWave(index, wave, fabricCatalog, width, height, config),
		emit
	});
	const fabricTiles = variantsToTiles(fabricResult.variantIndices, fabricCatalog);
	const fabricMs = now() - fabricStart;

	emit({
		type: 'phase',
		pass: 'occupation',
		message: 'Finding addresses for houses, stalls, landmarks, and useful obstructions.',
		progress: 0.48
	});
	const occupationStart = now();
	const occupationCatalog = createOccupationCatalog(config);
	const occupationWave = createOccupationWave(
		config,
		width,
		height,
		fabricTiles,
		occupationCatalog
	);
	applyAnchorWeightInfluence(config, occupationWave, occupationCatalog, width);
	applyOccupationAnchorConstraints(
		config,
		occupationWave,
		occupationCatalog,
		fabricTiles,
		width,
		height
	);
	const occupationResult = runWaveCollapse({
		width,
		height,
		pass: 'occupation',
		variants: occupationCatalog,
		initialWave: occupationWave,
		random: streams.occupation,
		tieBreakerSeed: `${config.seed}/occupation`,
		maxBacktracks: CIVIC_PATIENCE_BUDGETS[config.civicPatience],
		hardStepBudget,
		existingPatches: fabricResult.patches,
		conflictTags: (index, wave) => [
			...fabricTiles[index].tags,
			...conflictTagsForWave(index, wave, occupationCatalog, width, height, config)
		],
		emit
	});
	const occupationTiles = variantsToTiles(occupationResult.variantIndices, occupationCatalog);
	const occupationMs = now() - occupationStart;

	emit({
		type: 'phase',
		pass: 'infrastructure',
		message: 'Laying drains and wires, with gravity invited to comment.',
		progress: 0.84
	});
	const infrastructureStart = now();
	const elevation = createElevationField(config.seed, width, height, portals);
	const basePatches = [...fabricResult.patches, ...occupationResult.patches];
	const infrastructureResult = generateInfrastructure(
		config,
		width,
		height,
		fabricTiles,
		occupationTiles,
		elevation,
		portals,
		basePatches
	);
	for (const patch of infrastructureResult.patches) {
		emit({
			type: 'patch',
			pass: 'infrastructure',
			step: fabricResult.steps + occupationResult.steps,
			patch,
			message: patchMessage(patch.anomalyType),
			progress: 0.9
		});
	}
	const municipalPatches = [...basePatches, ...infrastructureResult.patches];
	const infrastructureMs = now() - infrastructureStart;

	emit({
		type: 'phase',
		pass: 'analysis',
		message: 'Inspecting what the local agreements add up to.',
		progress: 0.94
	});
	const analysisStart = now();
	const analysis = analyseCity(
		width,
		height,
		fabricTiles,
		occupationTiles,
		infrastructureResult.details,
		municipalPatches,
		portals
	);
	const scores = scoreCity(analysis, municipalPatches);
	const fingerprint = createCityFingerprint(
		config,
		fabricTiles,
		occupationTiles,
		infrastructureResult.details,
		municipalPatches
	);
	const cityName = createCityName(config.seed, fingerprint);
	const report = createMunicipalReport(
		cityName,
		config,
		width,
		height,
		analysis,
		scores,
		municipalPatches,
		fingerprint
	);
	const analysisMs = now() - analysisStart;
	const complete: GenerationEvent = {
		type: 'complete',
		progress: 1,
		fingerprint,
		functionalScore: scores.functional,
		calamityScore: scores.calamity
	};
	emit(complete);

	return {
		schema: 'suvro-city-result-v1',
		generatorVersion: 1,
		config,
		seed: config.seed,
		cityName,
		width,
		height,
		anchor: { ...config.anchor },
		portals,
		fabricTiles,
		occupationTiles,
		infrastructure: infrastructureResult.details,
		elevation,
		municipalPatches,
		analysis,
		scores,
		report,
		fingerprint,
		events,
		statistics: {
			steps: fabricResult.steps + occupationResult.steps,
			fabricSteps: fabricResult.steps,
			occupationSteps: occupationResult.steps,
			backtracks: fabricResult.backtracks + occupationResult.backtracks,
			contradictions: fabricResult.contradictions + occupationResult.contradictions,
			propagatedCells: fabricResult.propagatedCells + occupationResult.propagatedCells,
			removedCandidates: fabricResult.removedCandidates + occupationResult.removedCandidates,
			hardStepBudget: hardStepBudget * 2
		},
		timing: {
			totalMs: now() - timingStart,
			fabricMs,
			occupationMs,
			infrastructureMs,
			analysisMs
		}
	};
}

export function chooseBoundaryPortals(
	config: CityConfig,
	width: number,
	height: number,
	random: SeededRandom
): readonly Portal[] {
	const tramRequired = config.anchor.id === 'tram-stop' || config.tramPreference === 'high';
	const count = config.minimumGuarantees ? 3 : random.chance(0.52) ? 3 : 2;
	const sides = random.shuffle([0, 1, 2, 3] as const).slice(0, count);
	return sides.map((direction, index) => {
		const horizontal = direction === 0 || direction === 2;
		const coordinate = horizontal
			? {
					x: random.integer(Math.min(2, width - 1), Math.max(2, width - 3)),
					y: direction === 0 ? 0 : height - 1
				}
			: {
					x: direction === 1 ? width - 1 : 0,
					y: random.integer(Math.min(2, height - 1), Math.max(2, height - 3))
				};
		const passage: Portal['passage'] =
			tramRequired && index < 2 ? 'tram' : index % 2 === 0 ? 'lane' : 'road';
		return {
			...coordinate,
			direction,
			passage,
			drainOutlet: index === 0
		};
	});
}

function applyBoundaryConstraints(
	wave: BitSet[],
	variants: readonly TileVariant[],
	width: number,
	height: number,
	portals: readonly Portal[]
): void {
	const portalMap = new Map(
		portals.map((portal) => [`${portal.x},${portal.y},${portal.direction}`, portal])
	);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
			const index = indexForCoordinate(x, y, width);
			for (let rawDirection = 0; rawDirection < 4; rawDirection += 1) {
				const direction = rawDirection as Direction;
				const delta = DIRECTION_DELTAS[direction];
				const outside =
					x + delta.x < 0 || y + delta.y < 0 || x + delta.x >= width || y + delta.y >= height;
				if (!outside) continue;
				const portal = portalMap.get(`${x},${y},${direction}`);
				const allowed = BitSet.from(
					variants.length,
					variants
						.filter((variant) => {
							const signature = variant.edges[direction];
							if (signature.water !== 'dry') return false;
							return portal ? signature.passage === portal.passage : signature.passage === 'closed';
						})
						.map((variant) => variant.index)
				);
				wave[index].intersect(allowed);
			}
		}
	}
}

function applyFabricAnchorConstraints(
	config: CityConfig,
	wave: BitSet[],
	variants: readonly TileVariant[],
	width: number,
	height: number
): void {
	const definition = ANCHOR_BY_ID[config.anchor.id];
	const cells = anchorCells(config.anchor);
	for (const cell of cells) {
		const index = indexForCoordinate(cell.x, cell.y, width);
		let matching = variants.filter((variant) => meetsRequiredSubstrate(definition, variant.tags));
		if (config.anchor.id === 'pond') {
			if (cell.role === 'water') {
				matching = matching.filter((variant) => variant.prototypeId === 'pond-interior');
			} else {
				const rotation = config.anchor.rotation;
				matching = matching.filter(
					(variant) => variant.prototypeId === 'pond-bank' && variant.rotation === rotation
				);
			}
		} else if (config.anchor.id === 'tram-stop') {
			const rotation = (config.anchor.rotation % 2) as Rotation;
			matching = matching.filter(
				(variant) => variant.prototypeId === 'tram-road-straight' && variant.rotation === rotation
			);
		}
		wave[index].intersect(
			BitSet.from(
				variants.length,
				matching.map((variant) => variant.index)
			)
		);
	}

	if (definition.frontageRequired) {
		const frontage = anchorFrontageDirection(config.anchor);
		const anchorIndex = indexForCoordinate(config.anchor.x, config.anchor.y, width);
		const neighbour = neighbourIndex(anchorIndex, frontage, width, height);
		if (neighbour >= 0) {
			const matching = variants.filter((variant) =>
				config.anchor.id === 'garage'
					? variant.tags.includes('vehicle-access')
					: providesPedestrianFrontage(variant.tags)
			);
			wave[neighbour].intersect(
				BitSet.from(
					variants.length,
					matching.map((variant) => variant.index)
				)
			);
		}
	}
}

function applyMinimumGuarantees(
	config: CityConfig,
	wave: BitSet[],
	variants: readonly TileVariant[],
	width: number,
	height: number
): void {
	const candidates = [
		{ x: Math.floor(width * 0.25), y: Math.floor(height * 0.28) },
		{ x: Math.floor(width * 0.72), y: Math.floor(height * 0.68) },
		{ x: Math.floor(width * 0.7), y: Math.floor(height * 0.25) }
	];
	const anchorCellsSet = new Set(anchorCells(config.anchor).map((cell) => `${cell.x},${cell.y}`));
	const seed = candidates.find((cell) => !anchorCellsSet.has(`${cell.x},${cell.y}`));
	if (!seed) return;
	const open = findVariant(variants, 'open-patch');
	if (!open) return;
	const index = indexForCoordinate(seed.x, seed.y, width);
	wave[index].intersect(BitSet.from(variants.length, [open.index]));
}

function createOccupationWave(
	config: CityConfig,
	width: number,
	height: number,
	fabric: readonly CityTile[],
	variants: readonly TileVariant[]
): BitSet[] {
	return fabric.map((substrate, index) => {
		const allowed: number[] = [];
		for (const variant of variants) {
			if (
				variant.allowedSubstrates &&
				!variant.allowedSubstrates.some((tag) => substrate.tags.includes(tag))
			) {
				continue;
			}
			if (variant.forbiddenSubstrates?.some((tag) => substrate.tags.includes(tag))) {
				continue;
			}
			if (variant.orientation !== undefined) {
				const neighbour = neighbourIndex(index, variant.orientation, width, height);
				if (neighbour < 0) continue;
				const frontage = fabric[neighbour];
				const needsVehicle = variant.tags.includes('vehicle-frontage');
				if (
					needsVehicle
						? !frontage.tags.includes('vehicle-access')
						: !providesPedestrianFrontage(frontage.tags)
				) {
					continue;
				}
			}
			allowed.push(variant.index);
		}
		if (allowed.length === 0) {
			const empty = variants.find((variant) => variant.prototypeId === 'empty');
			if (empty) allowed.push(empty.index);
		}
		return BitSet.from(variants.length, allowed);
	});
}

function applyOccupationAnchorConstraints(
	config: CityConfig,
	wave: BitSet[],
	variants: readonly TileVariant[],
	fabric: readonly CityTile[],
	width: number,
	height: number
): void {
	const definition = ANCHOR_BY_ID[config.anchor.id];
	if (definition.pass === 'occupation' && definition.forcedPrototypeId) {
		const anchorIndex = indexForCoordinate(config.anchor.x, config.anchor.y, width);
		const preferredRotation =
			definition.rotations.length === 1 ? undefined : config.anchor.rotation;
		const variant =
			findVariant(variants, definition.forcedPrototypeId, preferredRotation) ??
			findVariant(variants, definition.forcedPrototypeId);
		if (variant) wave[anchorIndex].intersect(BitSet.from(variants.length, [variant.index]));
	}

	// The deliberately collision-prone tram trial needs two real local facts, not a seed-name
	// special case: a tram stop and one garage whose shutter faces an adjacent rail segment.
	if (
		config.anchor.id !== 'tram-stop' ||
		config.tramPreference !== 'high' ||
		config.anomalyAppetite !== 'enthusiastic'
	) {
		return;
	}
	const candidates: Array<{ index: number; direction: Direction; distance: number }> = [];
	for (let index = 0; index < fabric.length; index += 1) {
		if (!fabric[index].tags.includes('buildable')) continue;
		for (let rawDirection = 0; rawDirection < 4; rawDirection += 1) {
			const direction = rawDirection as Direction;
			const neighbour = neighbourIndex(index, direction, width, height);
			if (neighbour < 0 || !fabric[neighbour].tags.includes('tram')) continue;
			const x = index % width;
			const y = Math.floor(index / width);
			candidates.push({
				index,
				direction,
				distance: Math.abs(x - config.anchor.x) + Math.abs(y - config.anchor.y)
			});
			break;
		}
	}
	candidates.sort(
		(first, second) =>
			first.distance - second.distance ||
			first.index - second.index ||
			first.direction - second.direction
	);
	const collision = candidates[0];
	if (!collision) return;
	const garage =
		findVariant(variants, 'garage', collision.direction) ?? findVariant(variants, 'garage');
	if (garage) wave[collision.index].intersect(BitSet.from(variants.length, [garage.index]));
}

function conflictTagsForWave(
	index: number,
	wave: readonly BitSet[],
	variants: readonly TileVariant[],
	width: number,
	height: number,
	config: CityConfig
): readonly string[] {
	const tags = new Set<string>();
	if (index === config.anchor.y * width + config.anchor.x) {
		tags.add(config.anchor.id);
		if (config.anchor.id === 'flyover-pillar') tags.add('pillar');
		if (config.anchor.id === 'sand-pile') tags.add('sand');
	}
	for (let direction = 0; direction < 4; direction += 1) {
		const neighbour = neighbourIndex(index, direction as Direction, width, height);
		if (neighbour < 0) continue;
		for (const candidate of wave[neighbour].values()) {
			for (const tag of variants[candidate].tags) tags.add(tag);
			if (tags.size > 18) break;
		}
	}
	return [...tags];
}

function variantsToTiles(
	indices: Int32Array,
	variants: readonly TileVariant[]
): readonly CityTile[] {
	return Array.from(indices, (variantIndex) => {
		const variant = variants[variantIndex] ?? variants[0];
		return {
			id: variant.id,
			prototypeId: variant.prototypeId,
			rotation: variant.rotation,
			renderer: variant.renderer,
			tags: [...variant.tags],
			edges: [
				{ ...variant.edges[0] },
				{ ...variant.edges[1] },
				{ ...variant.edges[2] },
				{ ...variant.edges[3] }
			]
		};
	});
}

function patchMessage(type: string): string {
	const messages: Record<string, string> = {
		'balcony-over-lane': 'Balcony regularised after construction.',
		'lane-through-bedroom': 'The lane has acquired an indoor section.',
		'pole-through-verandah': 'Electrical clearance waived because the pole arrived first.',
		'uphill-drain': 'Drainage gradient reclassified as aspirational.',
		'tram-through-garage': 'The tram is making representations to the garage.',
		'pond-lane-bridge': 'A bamboo crossing has been entered as local precedent.',
		'permanent-sand-occupation':
			'Sand remains temporary for the thirty-seventh consecutive season.',
		'building-around-pillar': 'The pillar has been retained and the room has adapted.',
		'construction-tarpaulin': 'A temporary arrangement has been approved.'
	};
	return messages[type] ?? 'Local precedent has been applied.';
}

function now(): number {
	return typeof performance !== 'undefined' && typeof performance.now === 'function'
		? performance.now()
		: Date.now();
}
