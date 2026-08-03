import { SeededRandom } from './prng';
import { normalizedToWorld, sampleTerrainHeight } from './terrain';
import { add, clamp, length, normalize, scale, subtract } from './vectors';
import type { ChargePocket, FlashType, SerializableAtlasState, TerrainData, Vec3 } from './types';

export function createChargePockets(
	state: SerializableAtlasState,
	terrain: TerrainData
): ChargePocket[] {
	const storm = normalizedToWorld(state.stormPosition, terrain.widthMetres, terrain.depthMetres);
	const surface = sampleTerrainHeight(terrain, storm.x, storm.z);
	const cloudBase = surface + state.storm.cloudBaseMetres;
	const separation = 380 + state.storm.chargeSeparation * 820;
	const strength = 0.45 + state.storm.chargeStrength * 0.9;
	const windRadians = (state.environment.windDirection * Math.PI) / 180;
	const drift = {
		x: Math.sin(windRadians) * state.environment.windSpeed,
		y: 0,
		z: Math.cos(windRadians) * state.environment.windSpeed
	};
	// A deterministic snapshot displacement makes wind part of the causal charge geometry.
	// The multiplier is a model timescale, not a forecast of cloud advection.
	const driftOffset = scale(drift, 12);

	if (state.terrain === 'volcanic-island') {
		return [
			{
				id: 'ash-lower-negative',
				polarity: -1,
				center: add({ x: storm.x - 90, y: cloudBase + 220, z: storm.z + 40 }, driftOffset),
				radii: { x: 680, y: 520, z: 600 },
				strength: strength * 0.9,
				softness: 420,
				drift
			},
			{
				id: 'ash-upper-positive',
				polarity: 1,
				center: add(
					{ x: storm.x + 120, y: cloudBase + 970, z: storm.z - 70 },
					scale(driftOffset, 0.7)
				),
				radii: { x: 780, y: 620, z: 690 },
				strength: strength * 0.72,
				softness: 500,
				drift: scale(drift, 0.7)
			},
			{
				id: 'ash-screening-positive',
				polarity: 1,
				center: add({ x: storm.x + 40, y: cloudBase + 80, z: storm.z + 60 }, driftOffset),
				radii: { x: 420, y: 220, z: 420 },
				strength: strength * 0.3,
				softness: 300,
				drift
			}
		];
	}

	const pockets: ChargePocket[] = [
		{
			id: 'main-negative',
			polarity: -1,
			center: add({ x: storm.x, y: cloudBase + 430, z: storm.z }, driftOffset),
			radii: { x: 1_150, y: 460, z: 920 },
			strength,
			softness: 520,
			drift
		},
		{
			id: 'upper-positive',
			polarity: 1,
			center: add(
				{
					x: storm.x + separation * 0.18,
					y: cloudBase + 430 + separation,
					z: storm.z - separation * 0.12
				},
				scale(driftOffset, 1.15)
			),
			radii: { x: 1_350, y: 620, z: 1_050 },
			strength: strength * 0.8,
			softness: 620,
			drift: scale(drift, 1.15)
		}
	];

	if (state.storm.lowerPositiveCharge) {
		pockets.push({
			id: 'lower-positive-screening',
			polarity: 1,
			center: add({ x: storm.x - 160, y: cloudBase + 80, z: storm.z + 120 }, driftOffset),
			radii: { x: 720, y: 240, z: 620 },
			strength: strength * 0.26,
			softness: 360,
			drift
		});
	}
	return pockets;
}

export function potentialProxy(position: Vec3, pockets: readonly ChargePocket[]): number {
	let potential = 0;
	for (const pocket of pockets) {
		const difference = subtract(position, pocket.center);
		const scaledDistance = Math.hypot(
			difference.x / Math.max(1, pocket.radii.x),
			difference.y / Math.max(1, pocket.radii.y),
			difference.z / Math.max(1, pocket.radii.z)
		);
		potential +=
			(pocket.polarity * pocket.strength) /
			Math.sqrt(scaledDistance * scaledDistance + pocket.softness / 1_000);
	}
	return clamp(potential / Math.max(1, pockets.length), -1, 1);
}

export function electricFieldProxy(position: Vec3, pockets: readonly ChargePocket[]): Vec3 {
	let field: Vec3 = { x: 0, y: -0.08, z: 0 };
	for (const pocket of pockets) {
		const difference = subtract(position, pocket.center);
		const softened = Math.max(100, length(difference) + pocket.softness);
		const influence = (pocket.polarity * pocket.strength * 780_000) / (softened * softened);
		field = add(field, scale(normalize(difference), influence));
	}
	return field;
}

export function fieldStrengthProxy(position: Vec3, pockets: readonly ChargePocket[]): number {
	return clamp(length(electricFieldProxy(position, pockets)) / 2.4, 0, 1);
}

export function selectFlashType(
	state: SerializableAtlasState,
	strikeIndex: number,
	random = new SeededRandom(`${state.seed}|storm-schedule|${strikeIndex}`)
): FlashType {
	if (state.flashType !== 'storm-decides') return state.flashType;
	const value = random.nextFloat();
	const positiveThreshold = state.storm.lowerPositiveCharge ? 0.065 : 0.045;
	const intraCloudThreshold = 0.23 + (1 - state.storm.chargeSeparation) * 0.12;
	if (value < positiveThreshold) return 'positive-cg';
	if (value < positiveThreshold + intraCloudThreshold) return 'intra-cloud';
	return 'negative-cg';
}

export function rootForFlash(
	type: FlashType,
	pockets: readonly ChargePocket[],
	random: SeededRandom
): Vec3 {
	const pocket =
		type === 'positive-cg'
			? (pockets.find((candidate) => candidate.id.includes('upper-positive')) ?? pockets[0])
			: (pockets.find((candidate) => candidate.polarity === -1) ?? pockets[0]);
	return {
		x: pocket.center.x + random.normal(0, pocket.radii.x * 0.18),
		y: pocket.center.y + random.normal(0, pocket.radii.y * 0.12),
		z: pocket.center.z + random.normal(0, pocket.radii.z * 0.18)
	};
}

export function intraCloudDestination(
	pockets: readonly ChargePocket[],
	start: Vec3,
	random: SeededRandom
): Vec3 {
	const positive =
		pockets.find((candidate) => candidate.polarity === 1) ?? pockets[pockets.length - 1];
	const destination = {
		x: positive.center.x + random.normal(0, positive.radii.x * 0.22),
		y: positive.center.y + random.normal(0, positive.radii.y * 0.15),
		z: positive.center.z + random.normal(0, positive.radii.z * 0.22)
	};
	return length(subtract(destination, start)) < 500
		? add(destination, { x: 680, y: 160, z: -420 })
		: destination;
}
