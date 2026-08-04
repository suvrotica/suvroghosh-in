import { FEATURE_LABELS, terrainPreset } from './config';
import { Noise2D } from './noise';
import { SeededRandom } from './prng';
import { clamp } from './vectors';
import type {
	AttachmentCandidate,
	AttachmentKind,
	PlacedFeature,
	PlaceableFeatureKind,
	TerrainData,
	TerrainPresetId,
	Vec3
} from './types';

const WORLD_WIDTH_METRES = 8_000;
const WORLD_DEPTH_METRES = 6_000;
const DEFAULT_RESOLUTION = 65;

type TerrainSample = {
	height: number;
	water: boolean;
	material: number;
	wetness: number;
};

type FeatureSpecification = {
	height: number;
	prominence: number;
	isolation: number;
	tip: number;
	conductivity: number;
	threshold: number;
};

const FEATURE_SPECIFICATIONS: Record<PlaceableFeatureKind, FeatureSpecification> = {
	tree: {
		height: 31,
		prominence: 0.62,
		isolation: 0.58,
		tip: 0.72,
		conductivity: 0.48,
		threshold: 0.52
	},
	'tree-cluster': {
		height: 24,
		prominence: 0.32,
		isolation: 0.22,
		tip: 0.42,
		conductivity: 0.46,
		threshold: 0.62
	},
	'radio-mast': {
		height: 92,
		prominence: 0.88,
		isolation: 0.9,
		tip: 0.98,
		conductivity: 0.96,
		threshold: 0.27
	},
	'lightning-rod': {
		height: 22,
		prominence: 0.72,
		isolation: 0.55,
		tip: 1,
		conductivity: 1,
		threshold: 0.22
	},
	'low-building': {
		height: 18,
		prominence: 0.32,
		isolation: 0.28,
		tip: 0.48,
		conductivity: 0.62,
		threshold: 0.66
	},
	'high-rise': {
		height: 122,
		prominence: 0.84,
		isolation: 0.68,
		tip: 0.78,
		conductivity: 0.9,
		threshold: 0.31
	},
	'water-tower': {
		height: 48,
		prominence: 0.7,
		isolation: 0.76,
		tip: 0.58,
		conductivity: 0.8,
		threshold: 0.43
	},
	'wind-turbine': {
		height: 138,
		prominence: 0.84,
		isolation: 0.78,
		tip: 0.84,
		conductivity: 0.88,
		threshold: 0.3
	},
	'transmission-tower': {
		height: 64,
		prominence: 0.65,
		isolation: 0.52,
		tip: 0.82,
		conductivity: 0.94,
		threshold: 0.36
	},
	lighthouse: {
		height: 54,
		prominence: 0.78,
		isolation: 0.86,
		tip: 0.88,
		conductivity: 0.86,
		threshold: 0.34
	}
};

const presetFeatures: Record<
	TerrainPresetId,
	Array<{ kind: AttachmentKind; label: string; x: number; z: number; height?: number }>
> = {
	'kalbaisakhi-bengal': [
		{ kind: 'tree', label: 'Storm-facing palm', x: 0.47, z: 0.61, height: 29 },
		{ kind: 'tree-cluster', label: 'Village mango grove', x: 0.66, z: 0.73 },
		{ kind: 'transmission-tower', label: 'Field-edge transmission tower', x: 0.31, z: 0.52 },
		{ kind: 'low-building', label: 'Low village rooftop', x: 0.58, z: 0.43 },
		{ kind: 'water-tower', label: 'Distant municipal water tower', x: 0.76, z: 0.34 }
	],
	'monsoon-delta': [
		{ kind: 'water-tower', label: 'Distant water tower', x: 0.71, z: 0.38 },
		{ kind: 'radio-mast', label: 'Communications mast', x: 0.28, z: 0.58 },
		{ kind: 'tree', label: 'Isolated palm', x: 0.51, z: 0.63, height: 27 },
		{ kind: 'tree-cluster', label: 'Village tree cluster', x: 0.62, z: 0.77 }
	],
	'himalayan-ridge': [
		{ kind: 'radio-mast', label: 'Ridge relay mast', x: 0.42, z: 0.52, height: 36 },
		{ kind: 'ridge', label: 'Eastern exposed summit', x: 0.72, z: 0.33 },
		{ kind: 'ridge', label: 'Lower storm-facing ridge', x: 0.52, z: 0.57 }
	],
	'coastal-shelf': [
		{ kind: 'lighthouse', label: 'Cliff lighthouse', x: 0.58, z: 0.42 },
		{ kind: 'low-building', label: 'Coastal settlement roof', x: 0.72, z: 0.65 },
		{ kind: 'ocean-surface', label: 'Nearshore water', x: 0.32, z: 0.54 }
	],
	'forest-basin': [
		{ kind: 'tree', label: 'Emergent sal tree', x: 0.48, z: 0.43, height: 42 },
		{ kind: 'tree', label: 'Western emergent tree', x: 0.32, z: 0.6, height: 37 },
		{ kind: 'tree-cluster', label: 'Closed canopy', x: 0.65, z: 0.62 }
	],
	'desert-escarpment': [
		{ kind: 'transmission-tower', label: 'Isolated utility tower', x: 0.44, z: 0.62 },
		{ kind: 'ridge', label: 'Mesa rim', x: 0.62, z: 0.39 },
		{ kind: 'ridge', label: 'Dry escarpment', x: 0.76, z: 0.68 }
	],
	'urban-plain': [
		{ kind: 'high-rise', label: 'Central high-rise', x: 0.54, z: 0.5 },
		{ kind: 'radio-mast', label: 'Communications tower', x: 0.7, z: 0.34 },
		{ kind: 'lightning-rod', label: 'Rooftop lightning rod', x: 0.37, z: 0.54 },
		{ kind: 'water-tower', label: 'Rooftop water tank', x: 0.62, z: 0.7, height: 30 },
		{ kind: 'transmission-tower', label: 'Transmission structure', x: 0.22, z: 0.66 }
	],
	'open-ocean': [
		{ kind: 'offshore-platform', label: 'Offshore platform', x: 0.62, z: 0.47, height: 82 },
		{ kind: 'ship', label: 'Ship mast', x: 0.34, z: 0.61, height: 44 },
		{ kind: 'ocean-surface', label: 'Open water', x: 0.49, z: 0.35 }
	],
	'volcanic-island': [
		{ kind: 'volcanic-cone', label: 'Crater rim', x: 0.52, z: 0.48 },
		{ kind: 'tree', label: 'Isolated island tree', x: 0.69, z: 0.61, height: 22 },
		{ kind: 'ocean-surface', label: 'Island shelf water', x: 0.26, z: 0.56 }
	]
};

function terrainSample(
	preset: TerrainPresetId,
	x: number,
	z: number,
	noise: Noise2D,
	baseWetness: number
): TerrainSample {
	const radial = Math.hypot(x, z);
	const broad = noise.fbm(x * 1.8 + 4.2, z * 1.8 - 2.4, 5);
	const detail = noise.fbm(x * 6.2 - 8.1, z * 6.2 + 5.3, 4);

	switch (preset) {
		case 'kalbaisakhi-bengal': {
			const fieldDrain = Math.abs(z + 0.52 - 0.08 * Math.sin(x * 7.2 + 0.4));
			const pond = Math.hypot(x + 0.58, z - 0.22);
			const water = fieldDrain < 0.026 || pond < 0.115;
			const fieldRidges = Math.abs(Math.sin((x + detail * 0.04) * 15)) * 1.8;
			return {
				height: water ? -2 + detail * 0.7 : 13 + broad * 9 + detail * 2.6 + fieldRidges,
				water,
				material: water ? 1 : 0,
				wetness: clamp(baseWetness + (water ? 0.14 : detail * 0.035), 0, 1)
			};
		}
		case 'monsoon-delta': {
			const channelA = Math.abs(z - 0.27 * Math.sin(x * 4.8 + noise.value(x * 1.4, 1.2)));
			const channelB = Math.abs(z + 0.44 - 0.18 * Math.sin(x * 6.3 - 1.6));
			const channel = Math.min(channelA, channelB);
			const water = channel < 0.065 || (broad < -0.48 && z > 0.2);
			return {
				height: water ? -5 + detail * 1.2 : 11 + broad * 15 + Math.max(0, channel - 0.08) * 5,
				water,
				material: water ? 1 : 0,
				wetness: clamp(baseWetness + (water ? 0.18 : detail * 0.06), 0, 1)
			};
		}
		case 'himalayan-ridge': {
			const directional = noise.ridged(x * 2.2 + z * 0.55, z * 4.2, 6);
			const uplift = Math.max(0, 1 - Math.abs(x + 0.08) * 0.66);
			return {
				height: 240 + directional * 1_620 * uplift + broad * 260 + detail * 80,
				water: false,
				material: 2,
				wetness: clamp(baseWetness - Math.max(0, directional - 0.72) * 0.2, 0, 1)
			};
		}
		case 'coastal-shelf': {
			const shore = -0.17 + noise.fbm(z * 1.1, 3.4, 3) * 0.1;
			const signed = x - shore;
			const water = signed < 0;
			const cliff = signed > 0 ? Math.min(1, signed * 3.6) : 0;
			return {
				height: water ? -18 - Math.abs(signed) * 52 : 16 + cliff * 190 + broad * 35,
				water,
				material: water ? 1 : 2,
				wetness: clamp(baseWetness + (water ? 0.3 : -signed * 0.08), 0, 1)
			};
		}
		case 'forest-basin': {
			const basin = -Math.max(0, 1 - radial * 1.18) * 110;
			return {
				height: 230 + basin + broad * 145 + detail * 32,
				water: false,
				material: 4,
				wetness: clamp(baseWetness + (1 - radial) * 0.08 + detail * 0.05, 0, 1)
			};
		}
		case 'desert-escarpment': {
			const warped = noise.warped(x * 2.1, z * 2.1, 0.7);
			const terraced = Math.floor(clamp((warped + 1) * 4.2, 0, 8)) / 8;
			const dryChannel = Math.abs(z - 0.2 * Math.sin(x * 3.2 + 0.7));
			return {
				height: 90 + terraced * 690 + detail * 26 - Math.max(0, 0.08 - dryChannel) * 430,
				water: false,
				material: 2,
				wetness: clamp(baseWetness + detail * 0.025, 0, 1)
			};
		}
		case 'urban-plain': {
			const drainage = Math.abs(z + 0.7 - 0.05 * Math.sin(x * 8));
			return {
				height: 23 + broad * 11 + detail * 3 - Math.max(0, 0.035 - drainage) * 120,
				water: drainage < 0.025,
				material: drainage < 0.025 ? 1 : 3,
				wetness: clamp(baseWetness + detail * 0.04, 0, 1)
			};
		}
		case 'open-ocean':
			return { height: -4 + broad * 1.6, water: true, material: 1, wetness: 1 };
		case 'volcanic-island': {
			const islandRadius = 0.78 + noise.value(z * 1.2, x * 1.2) * 0.08;
			const water = radial > islandRadius;
			const cone = Math.max(0, 1 - radial / islandRadius);
			const crater = Math.exp(-Math.pow(radial / 0.12, 2)) * 330;
			return {
				height: water
					? -22 - (radial - islandRadius) * 95
					: cone * cone * 1_540 - crater + detail * 58,
				water,
				material: water ? 1 : 5,
				wetness: clamp(baseWetness + (water ? 0.64 : broad * 0.05), 0, 1)
			};
		}
	}
}

export function normalizedToWorld(
	position: { x: number; z: number },
	widthMetres = WORLD_WIDTH_METRES,
	depthMetres = WORLD_DEPTH_METRES
): { x: number; z: number } {
	return {
		x: (clamp(position.x, 0, 1) - 0.5) * widthMetres,
		z: (clamp(position.z, 0, 1) - 0.5) * depthMetres
	};
}

export function worldToNormalized(
	position: { x: number; z: number },
	widthMetres = WORLD_WIDTH_METRES,
	depthMetres = WORLD_DEPTH_METRES
): { x: number; z: number } {
	return {
		x: clamp(position.x / widthMetres + 0.5, 0, 1),
		z: clamp(position.z / depthMetres + 0.5, 0, 1)
	};
}

export function sampleTerrainHeight(terrain: TerrainData, x: number, z: number): number {
	const u = clamp(x / terrain.widthMetres + 0.5, 0, 1) * (terrain.resolution - 1);
	const v = clamp(z / terrain.depthMetres + 0.5, 0, 1) * (terrain.resolution - 1);
	const x0 = Math.floor(u);
	const z0 = Math.floor(v);
	const x1 = Math.min(terrain.resolution - 1, x0 + 1);
	const z1 = Math.min(terrain.resolution - 1, z0 + 1);
	const tx = u - x0;
	const tz = v - z0;
	const a = terrain.heights[z0 * terrain.resolution + x0];
	const b = terrain.heights[z0 * terrain.resolution + x1];
	const c = terrain.heights[z1 * terrain.resolution + x0];
	const d = terrain.heights[z1 * terrain.resolution + x1];
	return a + (b - a) * tx + (c + (d - c) * tx - (a + (b - a) * tx)) * tz;
}

export function sampleTerrainWetness(terrain: TerrainData, x: number, z: number): number {
	const u = clamp(x / terrain.widthMetres + 0.5, 0, 1) * (terrain.resolution - 1);
	const v = clamp(z / terrain.depthMetres + 0.5, 0, 1) * (terrain.resolution - 1);
	const x0 = Math.floor(u);
	const z0 = Math.floor(v);
	const x1 = Math.min(terrain.resolution - 1, x0 + 1);
	const z1 = Math.min(terrain.resolution - 1, z0 + 1);
	const tx = u - x0;
	const tz = v - z0;
	const a = terrain.wetness[z0 * terrain.resolution + x0];
	const b = terrain.wetness[z0 * terrain.resolution + x1];
	const c = terrain.wetness[z1 * terrain.resolution + x0];
	const d = terrain.wetness[z1 * terrain.resolution + x1];
	return clamp(a + (b - a) * tx + (c + (d - c) * tx - (a + (b - a) * tx)) * tz, 0, 1);
}

function maskAt(terrain: TerrainData, x: number, z: number): number {
	const u = Math.round(clamp(x / terrain.widthMetres + 0.5, 0, 1) * (terrain.resolution - 1));
	const v = Math.round(clamp(z / terrain.depthMetres + 0.5, 0, 1) * (terrain.resolution - 1));
	return terrain.waterMask[v * terrain.resolution + u];
}

function attachmentSpecification(
	kind: AttachmentKind,
	overrideHeight?: number
): FeatureSpecification {
	if (kind in FEATURE_SPECIFICATIONS) {
		const specification = FEATURE_SPECIFICATIONS[kind as PlaceableFeatureKind];
		return overrideHeight ? { ...specification, height: overrideHeight } : specification;
	}

	if (kind === 'ship')
		return {
			height: overrideHeight ?? 44,
			prominence: 0.7,
			isolation: 0.82,
			tip: 0.76,
			conductivity: 0.9,
			threshold: 0.4
		};
	if (kind === 'offshore-platform')
		return {
			height: overrideHeight ?? 82,
			prominence: 0.82,
			isolation: 0.88,
			tip: 0.9,
			conductivity: 0.94,
			threshold: 0.31
		};
	if (kind === 'volcanic-cone')
		return {
			height: overrideHeight ?? 0,
			prominence: 0.94,
			isolation: 0.94,
			tip: 0.54,
			conductivity: 0.5,
			threshold: 0.36
		};
	if (kind === 'ridge')
		return {
			height: overrideHeight ?? 0,
			prominence: 0.72,
			isolation: 0.68,
			tip: 0.46,
			conductivity: 0.42,
			threshold: 0.47
		};
	if (kind === 'ocean-surface')
		return {
			height: 0,
			prominence: 0.12,
			isolation: 0.2,
			tip: 0.12,
			conductivity: 0.72,
			threshold: 0.72
		};
	return {
		height: 0,
		prominence: 0.35,
		isolation: 0.35,
		tip: 0.28,
		conductivity: 0.42,
		threshold: 0.62
	};
}

function makeCandidate(
	id: string,
	kind: AttachmentKind,
	label: string,
	normalizedX: number,
	normalizedZ: number,
	terrain: TerrainData,
	height?: number,
	userPlaced = false,
	rotation = 0
): AttachmentCandidate {
	const world = normalizedToWorld(
		{ x: normalizedX, z: normalizedZ },
		terrain.widthMetres,
		terrain.depthMetres
	);
	const baseElevation = sampleTerrainHeight(terrain, world.x, world.z);
	const specification = attachmentSpecification(kind, height);
	const semanticHeight = kind === 'ridge' || kind === 'volcanic-cone' ? 0 : specification.height;
	return {
		id,
		kind,
		label,
		position: { x: world.x, y: baseElevation + semanticHeight, z: world.z },
		baseElevation,
		absoluteHeight: baseElevation + semanticHeight,
		localProminence: specification.prominence,
		isolation: specification.isolation,
		tipFactor: specification.tip,
		conductivityFactor: specification.conductivity,
		streamerThreshold: specification.threshold,
		userPlaced,
		rotation: ((rotation % 360) + 360) % 360
	};
}

function terrainCandidates(terrain: TerrainData, random: SeededRandom): AttachmentCandidate[] {
	if (terrain.preset === 'open-ocean') {
		return Array.from({ length: 12 }, (_, index) => {
			const x = 0.12 + (index % 4) * 0.25 + random.fork(`water-${index}`).nextFloat() * 0.05;
			const z =
				0.18 + Math.floor(index / 4) * 0.29 + random.fork(`water-z-${index}`).nextFloat() * 0.05;
			return makeCandidate(
				`water-${index}`,
				'ocean-surface',
				`Open-water cell ${index + 1}`,
				x,
				z,
				terrain
			);
		});
	}

	const candidates: AttachmentCandidate[] = [];
	const cells = 5;
	for (let cellZ = 0; cellZ < cells; cellZ += 1) {
		for (let cellX = 0; cellX < cells; cellX += 1) {
			let bestHeight = Number.NEGATIVE_INFINITY;
			let bestX = 0;
			let bestZ = 0;
			const gridStartX = Math.floor((cellX / cells) * (terrain.resolution - 1));
			const gridEndX = Math.floor(((cellX + 1) / cells) * (terrain.resolution - 1));
			const gridStartZ = Math.floor((cellZ / cells) * (terrain.resolution - 1));
			const gridEndZ = Math.floor(((cellZ + 1) / cells) * (terrain.resolution - 1));
			for (let z = gridStartZ; z <= gridEndZ; z += 1) {
				for (let x = gridStartX; x <= gridEndX; x += 1) {
					const index = z * terrain.resolution + x;
					if (terrain.waterMask[index] || terrain.heights[index] <= bestHeight) continue;
					bestHeight = terrain.heights[index];
					bestX = x;
					bestZ = z;
				}
			}
			if (!Number.isFinite(bestHeight)) continue;
			const normalizedX = bestX / (terrain.resolution - 1);
			const normalizedZ = bestZ / (terrain.resolution - 1);
			const world = normalizedToWorld(
				{ x: normalizedX, z: normalizedZ },
				terrain.widthMetres,
				terrain.depthMetres
			);
			const radius = Math.max(2, Math.floor(terrain.resolution / 14));
			let neighbourhood = 0;
			let samples = 0;
			for (let dz = -radius; dz <= radius; dz += 1) {
				for (let dx = -radius; dx <= radius; dx += 1) {
					const sx = clamp(bestX + dx, 0, terrain.resolution - 1);
					const sz = clamp(bestZ + dz, 0, terrain.resolution - 1);
					neighbourhood += terrain.heights[sz * terrain.resolution + sx];
					samples += 1;
				}
			}
			const prominenceMetres = Math.max(0, bestHeight - neighbourhood / samples);
			candidates.push({
				id: `terrain-${cellX}-${cellZ}`,
				kind:
					terrain.preset === 'himalayan-ridge' || terrain.preset === 'desert-escarpment'
						? 'ridge'
						: 'terrain',
				label:
					terrain.preset === 'himalayan-ridge' ? 'Exposed ridge point' : 'Prominent terrain point',
				position: { x: world.x, y: bestHeight, z: world.z },
				baseElevation: bestHeight,
				absoluteHeight: bestHeight,
				localProminence: clamp(
					0.25 + prominenceMetres / Math.max(80, terrain.maxHeight - terrain.minHeight),
					0.18,
					0.92
				),
				isolation: clamp(0.3 + random.fork(`isolation-${cellX}-${cellZ}`).nextFloat() * 0.42, 0, 1),
				tipFactor: 0.3 + random.fork(`tip-${cellX}-${cellZ}`).nextFloat() * 0.22,
				conductivityFactor: terrain.preset === 'desert-escarpment' ? 0.28 : 0.45,
				streamerThreshold: 0.5 + random.fork(`threshold-${cellX}-${cellZ}`).nextFloat() * 0.18
			});
		}
	}
	return candidates;
}

export function generateTerrain(
	presetId: TerrainPresetId,
	seed: string,
	placedFeatures: readonly PlacedFeature[] = [],
	resolution = DEFAULT_RESOLUTION,
	surfaceWetness?: number
): TerrainData {
	const boundedResolution = Math.max(17, Math.min(129, Math.round(resolution) | 1));
	const preset = terrainPreset(presetId);
	const baseWetness = clamp(surfaceWetness ?? preset.defaultWetness, 0, 1);
	const noise = new Noise2D(`${seed}|terrain|${presetId}`);
	const length = boundedResolution * boundedResolution;
	const heights = new Float32Array(length);
	const waterMask = new Uint8Array(length);
	const materialMask = new Uint8Array(length);
	const wetness = new Float32Array(length);
	let minHeight = Number.POSITIVE_INFINITY;
	let maxHeight = Number.NEGATIVE_INFINITY;

	for (let z = 0; z < boundedResolution; z += 1) {
		const normalizedZ = (z / (boundedResolution - 1)) * 2 - 1;
		for (let x = 0; x < boundedResolution; x += 1) {
			const normalizedX = (x / (boundedResolution - 1)) * 2 - 1;
			const sample = terrainSample(presetId, normalizedX, normalizedZ, noise, baseWetness);
			const index = z * boundedResolution + x;
			heights[index] = Number.isFinite(sample.height) ? sample.height : 0;
			waterMask[index] = sample.water ? 1 : 0;
			materialMask[index] = sample.material;
			wetness[index] = clamp(sample.wetness, 0, 1);
			minHeight = Math.min(minHeight, heights[index]);
			maxHeight = Math.max(maxHeight, heights[index]);
		}
	}

	const terrain: TerrainData = {
		preset: presetId,
		seed,
		widthMetres: WORLD_WIDTH_METRES,
		depthMetres: WORLD_DEPTH_METRES,
		resolution: boundedResolution,
		heights,
		waterMask,
		materialMask,
		wetness,
		candidates: [],
		minHeight,
		maxHeight
	};
	const random = new SeededRandom(`${seed}|terrain-candidates|${presetId}`);
	terrain.candidates = terrainCandidates(terrain, random);

	for (const [index, feature] of presetFeatures[presetId].entries()) {
		terrain.candidates.push(
			makeCandidate(
				`preset-${presetId}-${index}`,
				feature.kind,
				feature.label,
				feature.x,
				feature.z,
				terrain,
				feature.height
			)
		);
	}

	for (const feature of placedFeatures.slice(0, 20)) {
		terrain.candidates.push(
			makeCandidate(
				feature.id,
				feature.kind,
				FEATURE_LABELS[feature.kind],
				feature.x,
				feature.z,
				terrain,
				undefined,
				true,
				feature.rotation
			)
		);
	}

	// Keep impossible land/water semantic points out of generated raw candidates without treating water as unsafe.
	terrain.candidates = terrain.candidates.filter((candidate) => {
		const water = maskAt(terrain, candidate.position.x, candidate.position.z) === 1;
		if (
			candidate.kind === 'ocean-surface' ||
			candidate.kind === 'ship' ||
			candidate.kind === 'offshore-platform'
		)
			return water;
		return !water || candidate.userPlaced;
	});

	return terrain;
}

export function candidateTip(candidate: AttachmentCandidate): Vec3 {
	return { ...candidate.position };
}
