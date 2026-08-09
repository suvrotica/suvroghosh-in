import { describe, expect, it } from 'vitest';
import type { FoodEffectId, FoodKind, FoodModifiers } from './food';
import { FOOD_MESSAGES, GHUGNI_MESSAGES } from './game-data';
import { DEFAULT_GAME_SETTINGS } from './settings';
import {
	SpatialStreetSimulation,
	type SpatialEntity,
	type SpatialMovementIntent
} from './spatial-simulation';
import {
	CALCUTTA_SPATIAL_WORLD,
	edgePolyline,
	getSpatialEdge,
	getSpatialNode,
	pathToDestination
} from './spatial-world';

const REST: SpatialMovementIntent = { mode: 'simple' };

function simulation(seed: string): SpatialStreetSimulation {
	return new SpatialStreetSimulation(seed, {
		...DEFAULT_GAME_SETTINGS,
		tutorialEnabled: true,
		controlScheme: 'simple'
	});
}

function activateFoodEffect(
	value: SpatialStreetSimulation,
	id: FoodEffectId,
	source: FoodKind,
	modifiers: Partial<FoodModifiers>,
	durationMs = 5_000
): void {
	value.food = {
		...value.food,
		metrics: value.metrics,
		activeEffects: [
			...value.food.activeEffects.filter((effect) => effect.id !== id),
			{
				id,
				source,
				startedAtMs: value.elapsedMs,
				expiresAtMs: value.elapsedMs + durationMs,
				modifiers
			}
		]
	};
}

function placeOnFirstSegment(value: SpatialStreetSimulation, edgeId = 'spine-3-4') {
	const edge = getSpatialEdge(edgeId);
	const points = edgePolyline(edge);
	const start = points[0];
	const end = points[1];
	value.player.x = start.x + (end.x - start.x) * 0.5;
	value.player.z = start.z + (end.z - start.z) * 0.5;
	value.player.heading = Math.atan2(end.x - start.x, end.z - start.z);
	return { x: value.player.x, z: value.player.z, heading: value.player.heading };
}

function removeStreetInterference(value: SpatialStreetSimulation): void {
	for (const entity of value.entities) {
		entity.active = false;
		entity.spawnAtMs = Number.POSITIVE_INFINITY;
		entity.resolvesAtMs = undefined;
		entity.blocksEdgeId = undefined;
	}
	value.blockedEdgeIds.clear();
}

function runFor(
	value: SpatialStreetSimulation,
	seconds: number,
	intent: SpatialMovementIntent = REST
): void {
	for (let frame = 0; frame < Math.ceil(seconds * 60); frame += 1) {
		value.update(1 / 60, intent);
	}
}

function runUntil(
	value: SpatialStreetSimulation,
	predicate: () => boolean,
	maximumSeconds: number,
	intent: SpatialMovementIntent = REST
): void {
	for (let frame = 0; frame < maximumSeconds * 60 && !predicate(); frame += 1) {
		value.update(1 / 60, intent);
	}
}

function entityDigest(entity: SpatialEntity) {
	return {
		id: entity.id,
		kind: entity.kind,
		subtype: entity.subtype,
		x: Number(entity.x.toFixed(4)),
		z: Number(entity.z.toFixed(4)),
		edgeId: entity.edgeId,
		spawnAtMs: Number(entity.spawnAtMs.toFixed(2)),
		resolvesAtMs: entity.resolvesAtMs ? Number(entity.resolvesAtMs.toFixed(2)) : null,
		visible: entity.visible ?? null,
		severe: entity.severe ?? null,
		lateralOffsetM:
			entity.lateralOffsetM === undefined ? null : Number(entity.lateralOffsetM.toFixed(4)),
		hallucinated: entity.hallucinated ?? null,
		stallCrowd: entity.stallCrowd ?? null
	};
}

describe('metre-based spatial walking simulation', () => {
	it('is deterministic for a seed while keeping named subsystem streams independent', () => {
		const first = simulation('spatial-determinism');
		const second = simulation('spatial-determinism');
		const other = simulation('spatial-determinism-other');

		expect(first.entities.map(entityDigest)).toEqual(second.entities.map(entityDigest));
		expect(first.entities.map(entityDigest)).not.toEqual(other.entities.map(entityDigest));

		const intent: SpatialMovementIntent = { mode: 'simple', moveForward: 1 };
		runFor(first, 12, intent);
		runFor(second, 12, intent);

		expect(first.snapshot()).toEqual(second.snapshot());
		expect(first.audioSources()).toEqual(second.audioSources());
	});

	it('walks at a plausible human pace and exposes renderer-friendly motion state', () => {
		const value = simulation('human-pace');
		removeStreetInterference(value);
		const target = getSpatialNode('spine-1').position;

		expect(value.walkTo(target)).toMatchObject({ accepted: true, reason: 'accepted' });
		let peakSpeed = 0;
		for (let frame = 0; frame < 7 * 60; frame += 1) {
			value.update(1 / 60, REST);
			peakSpeed = Math.max(peakSpeed, value.player.speed);
		}

		const snapshot = value.snapshot();
		expect(peakSpeed).toBeGreaterThan(1.3);
		expect(peakSpeed).toBeLessThan(1.55);
		expect(value.player.speed).toBeGreaterThan(0.75);
		expect(value.player.speed).toBeLessThan(1.55);
		expect(value.metrics.distance).toBeGreaterThan(7);
		expect(value.metrics.distance).toBeLessThan(11);
		expect(value.metrics.distance / 7).toBeGreaterThan(1);
		expect(value.metrics.distance / 7).toBeLessThan(1.5);
		expect(snapshot.player.headingRadians).toBe(snapshot.player.heading);
		expect(snapshot.player.velocity).toEqual({ x: snapshot.player.vx, z: snapshot.player.vz });
		expect(snapshot.cameraTarget.heightM).toBeGreaterThanOrEqual(3);
		expect(snapshot.cameraTarget.distanceBehindM).toBeGreaterThan(1.7);
		expect(snapshot.cameraTarget.distanceBehindM).toBeLessThan(2.6);
	});

	it('moves materially toward the destination from held simple forward intent with ordinary entities', () => {
		const value = simulation('manual-forward-acceptance');
		const start = { x: value.player.x, z: value.player.z };
		const initialDestinationMetres = value.hud().destinationMetres;

		runFor(value, 1.5, { mode: 'simple', moveForward: 1 });

		const displacement = Math.hypot(value.player.x - start.x, value.player.z - start.z);
		expect(displacement).toBeGreaterThan(1.25);
		expect(value.metrics.distance).toBeGreaterThan(1.25);
		expect(initialDestinationMetres - value.hud().destinationMetres).toBeGreaterThan(1);
	});

	it('makes hurry an edge-triggered burst with a post-burst cooldown and stamina gate', () => {
		const value = simulation('hurry-burst');
		removeStreetInterference(value);
		const heldHurry: SpatialMovementIntent = {
			mode: 'simple',
			moveForward: 1,
			hurry: true
		};
		let peakSpeed = 0;

		for (let frame = 0; frame < 60; frame += 1) {
			value.update(1 / 60, heldHurry);
			peakSpeed = Math.max(peakSpeed, value.player.speed);
		}

		expect(peakSpeed).toBeGreaterThan(1.85);
		expect(value.counters.recklessDashes).toBe(1);
		expect(value.player.hurryRemainingS).toBeGreaterThan(0.45);
		expect(value.player.hurryRemainingS).toBeLessThan(0.55);
		expect(value.hud()).toMatchObject({ hurryActive: true, hurryReady: false });

		runFor(value, 0.55, heldHurry);
		expect(value.player.hurryRemainingS).toBe(0);
		expect(value.player.hurryCooldownRemainingS).toBeGreaterThan(2.7);
		expect(value.player.hurryCooldownRemainingS).toBeLessThanOrEqual(2.8);

		// Keeping the button held through the entire cooldown must not auto-repeat the burst.
		runFor(value, 3, heldHurry);
		expect(value.player.hurryCooldownRemainingS).toBe(0);
		expect(value.counters.recklessDashes).toBe(1);
		expect(value.player.hurryRemainingS).toBe(0);

		value.update(1 / 60, { mode: 'simple', moveForward: 1, hurry: false });
		value.update(1 / 60, heldHurry);
		expect(value.counters.recklessDashes).toBe(2);
		expect(value.player.hurryRemainingS).toBeGreaterThan(1.45);

		const gated = simulation('hurry-gated');
		removeStreetInterference(gated);
		gated.metrics = {
			...gated.metrics,
			stamina: gated.hurryStaminaThreshold - 0.1
		};
		gated.food = { ...gated.food, metrics: gated.metrics };
		gated.update(1 / 60, heldHurry);
		expect(gated.player.hurryRemainingS).toBe(0);
		expect(gated.counters.recklessDashes).toBe(0);
		expect(gated.hud().hurryReady).toBe(false);

		gated.metrics = { ...gated.metrics, stamina: 100 };
		gated.food = { ...gated.food, metrics: gated.metrics };
		runFor(gated, 0.2, heldHurry);
		expect(gated.counters.recklessDashes).toBe(0);
		gated.update(1 / 60, { ...heldHurry, hurry: false });
		gated.update(1 / 60, heldHurry);
		expect(gated.counters.recklessDashes).toBe(1);
	});

	it('applies food responsiveness, fine-control jitter, and reversed manual controls', () => {
		const baseline = simulation('food-controls');
		const responsive = simulation('food-controls');
		removeStreetInterference(baseline);
		removeStreetInterference(responsive);
		activateFoodEffect(responsive, 'tea-sharpness', 'tea', {
			responsivenessMultiplier: 1.2
		});

		baseline.update(1 / 60, { mode: 'simple', moveForward: 1 });
		responsive.update(1 / 60, { mode: 'simple', moveForward: 1 });
		expect(responsive.player.speed).toBeGreaterThan(baseline.player.speed * 1.15);
		expect(responsive.metrics.reflex).toBeCloseTo(1.2);

		const normalDirection = simulation('food-reversal');
		const reversedDirection = simulation('food-reversal');
		removeStreetInterference(normalDirection);
		removeStreetInterference(reversedDirection);
		const normalStart = placeOnFirstSegment(normalDirection);
		const reversedStart = placeOnFirstSegment(reversedDirection);
		activateFoodEffect(reversedDirection, 'ghugni-reversed-controls', 'ghugni', {
			reversedControls: true
		});
		runFor(normalDirection, 0.8, { mode: 'simple', moveForward: 1 });
		runFor(reversedDirection, 0.8, { mode: 'simple', moveForward: 1 });
		const normalAlong =
			(normalDirection.player.x - normalStart.x) * Math.sin(normalStart.heading) +
			(normalDirection.player.z - normalStart.z) * Math.cos(normalStart.heading);
		const reversedAlong =
			(reversedDirection.player.x - reversedStart.x) * Math.sin(reversedStart.heading) +
			(reversedDirection.player.z - reversedStart.z) * Math.cos(reversedStart.heading);
		expect(normalAlong).toBeGreaterThan(0.55);
		expect(reversedAlong).toBeLessThan(-0.25);

		const steady = simulation('food-jitter');
		const jittered = simulation('food-jitter');
		const repeatedJitter = simulation('food-jitter');
		for (const value of [steady, jittered, repeatedJitter]) {
			removeStreetInterference(value);
			placeOnFirstSegment(value);
		}
		for (const value of [jittered, repeatedJitter]) {
			activateFoodEffect(value, 'tea-jitters', 'tea', { fineControlMultiplier: 0.68 });
		}
		let peakDifference = 0;
		for (let frame = 0; frame < 72; frame += 1) {
			steady.update(1 / 60, { mode: 'simple', moveForward: 1 });
			jittered.update(1 / 60, { mode: 'simple', moveForward: 1 });
			repeatedJitter.update(1 / 60, { mode: 'simple', moveForward: 1 });
			peakDifference = Math.max(
				peakDifference,
				Math.hypot(jittered.player.x - steady.player.x, jittered.player.z - steady.player.z)
			);
		}
		expect(peakDifference).toBeGreaterThan(0.008);
		expect(jittered.snapshot()).toEqual(repeatedJitter.snapshot());
	});

	it('uses food warning lead time and renders deterministic non-colliding hallucinated potholes', () => {
		const baseline = simulation('food-warning');
		const teaAssisted = simulation('food-warning');
		for (const value of [baseline, teaAssisted]) removeStreetInterference(value);
		activateFoodEffect(teaAssisted, 'tea-sharpness', 'tea', {
			warningTimeMultiplier: 1.22
		});
		for (const value of [baseline, teaAssisted]) {
			const vehicle = value.entities.find((entity) => entity.kind === 'motorbike')!;
			vehicle.active = true;
			vehicle.x = value.player.x + Math.sin(value.player.heading) * 40;
			vehicle.z = value.player.z + Math.cos(value.player.heading) * 40;
			vehicle.vx = -Math.sin(value.player.heading) * 4.8;
			vehicle.vz = -Math.cos(value.player.heading) * 4.8;
		}
		expect(baseline.hud().warning).toBeNull();
		expect(teaAssisted.hud().warning).toMatchObject({ kind: 'motorbike', direction: 'ahead' });

		const first = simulation('food-hallucinations');
		const second = simulation('food-hallucinations');
		for (const value of [first, second]) {
			removeStreetInterference(value);
			activateFoodEffect(
				value,
				'ghugni-duplicate-potholes',
				'ghugni',
				{ hallucinatedPotholes: true },
				300
			);
			value.update(1 / 60, REST);
		}
		const firstHallucinations = first.entities.filter((entity) => entity.hallucinated);
		const secondHallucinations = second.entities.filter((entity) => entity.hallucinated);
		expect(firstHallucinations.map(entityDigest)).toEqual(secondHallucinations.map(entityDigest));
		expect(firstHallucinations).toHaveLength(3);
		expect(firstHallucinations.every((entity) => entity.active && !entity.solid)).toBe(true);

		const phantom = firstHallucinations[0];
		first.player.x = phantom.x;
		first.player.z = phantom.z;
		first.update(1 / 60, REST);
		expect(first.counters.potholesEntered).toBe(0);
		runFor(first, 0.35);
		expect(firstHallucinations.every((entity) => !entity.active)).toBe(true);
	});

	it('applies food morale protection and wakes nearby dogs exactly once', () => {
		const unprotected = simulation('food-morale');
		const protectedRun = simulation('food-morale');
		for (const value of [unprotected, protectedRun]) {
			removeStreetInterference(value);
			const pothole = value.entities.find(
				(entity) => entity.kind === 'pothole' && !entity.hallucinated
			)!;
			pothole.active = true;
			pothole.x = value.player.x;
			pothole.z = value.player.z;
		}
		activateFoodEffect(protectedRun, 'ghugni-morale-immunity', 'ghugni', {
			moraleLossMultiplier: 0
		});
		const initialMorale = protectedRun.metrics.morale;
		unprotected.update(1 / 60, REST);
		protectedRun.update(1 / 60, REST);
		expect(unprotected.metrics.morale).toBeLessThan(initialMorale);
		expect(protectedRun.metrics.morale).toBe(initialMorale);
		expect(protectedRun.metrics.stamina).toBeLessThan(100);
		expect(protectedRun.counters.potholesEntered).toBe(1);

		const dogs = simulation('food-dogs');
		removeStreetInterference(dogs);
		const dog = dogs.entities.find((entity) => entity.kind === 'dog')!;
		dog.active = true;
		dog.state = 'sleeping';
		dog.x = dogs.player.x + Math.sin(dogs.player.heading) * 5;
		dog.z = dogs.player.z + Math.cos(dogs.player.heading) * 5;
		activateFoodEffect(dogs, 'ghugni-wake-nearby-dogs', 'ghugni', { wakeNearbyDogs: true }, 750);
		const update = dogs.update(1 / 60, REST);
		expect(dog.state).toBe('awake');
		expect(dogs.counters.dogsAwakened).toBe(1);
		expect(update.audioEvents.some((event) => event.kind === 'bark')).toBe(true);
		runFor(dogs, 0.5);
		expect(dogs.counters.dogsAwakened).toBe(1);
	});

	it('click-paths into a branch, turns around smoothly, and backtracks to the start', () => {
		const value = simulation('branch-and-backtrack');
		removeStreetInterference(value);
		const branch = getSpatialNode('res-1').position;
		const start = getSpatialNode(CALCUTTA_SPATIAL_WORLD.startNodeId).position;
		const outbound = value.walkTo(branch);

		expect(outbound.accepted).toBe(true);
		expect(outbound.path?.edgeIds).toContain('res-entry');
		runUntil(value, () => value.goal === null, 70);
		expect(Math.hypot(value.player.x - branch.x, value.player.z - branch.z)).toBeLessThan(0.8);

		const beforeTurn = value.player.heading;
		value.turnAround();
		runFor(value, 2.2);
		expect(Math.abs(Math.abs(value.player.heading - beforeTurn) - Math.PI)).toBeLessThan(0.18);
		expect(value.annotations.some((annotation) => annotation.kind === 'turn-around')).toBe(true);

		const homeward = value.walkTo(start);
		expect(homeward.accepted).toBe(true);
		expect(homeward.path?.edgeIds).toContain('res-entry');
		runUntil(value, () => value.goal === null, 70);
		expect(Math.hypot(value.player.x - start.x, value.player.z - start.z)).toBeLessThan(0.8);
		expect(value.counters.turnArounds).toBe(1);
		expect(value.visitedEdgeIds.has('spine-south-1')).toBe(true);
		expect(value.visitedEdgeIds.has('res-entry')).toBe(true);
		expect(value.pathHistory.length).toBeGreaterThan(20);
	});

	it('constrains every vehicle to a street wide enough for its real-scale profile', () => {
		const value = simulation('width-constraints');
		const vehicleKinds = ['bicycle', 'motorbike', 'rickshaw', 'handcart', 'car'] as const;

		for (const kind of vehicleKinds) {
			const matching = value.entities.filter((entity) => entity.kind === kind);
			expect(matching.length).toBeGreaterThan(0);
			for (const entity of matching) {
				const edge = getSpatialEdge(entity.edgeId);
				expect(entity.edgeWidthM).toBe(edge.widthM);
				expect(entity.edgeWidthM).toBeGreaterThanOrEqual(entity.minimumRoadWidthM);
				if (kind === 'car') expect(edge.archetype).toBe('wider-road');
			}
		}
	});

	it('authors deterministic visible drains beside a safe centre-line route', () => {
		const first = simulation('visible-drains');
		const second = simulation('visible-drains');
		const drains = first.entities.filter((entity) => entity.kind === 'drain');
		const repeated = second.entities.filter((entity) => entity.kind === 'drain');

		expect(drains.map(entityDigest)).toEqual(repeated.map(entityDigest));
		expect(drains).toHaveLength(5);
		for (const drain of drains) {
			expect(drain).toMatchObject({
				active: true,
				visible: true,
				solid: false,
				dangerous: true
			});
			expect(typeof drain.severe).toBe('boolean');
			expect(Math.abs(drain.lateralOffsetM ?? 0)).toBeGreaterThan(
				first.player.radiusM + drain.radiusM + 0.2
			);
		}
		expect(
			pathToDestination(first.player, {
				world: first.world,
				blockedEdgeIds: first.blockedEdgeIds,
				radiusM: first.player.radiusM
			})
		).not.toBeNull();

		let severeCount = 0;
		let drainCount = 0;
		for (let index = 0; index < 80; index += 1) {
			const seeded = simulation(`rare-drain-${index}`);
			for (const drain of seeded.entities.filter((entity) => entity.kind === 'drain')) {
				drainCount += 1;
				if (drain.severe) severeCount += 1;
			}
		}
		expect(severeCount).toBeGreaterThan(0);
		expect(severeCount / drainCount).toBeLessThan(0.1);
	});

	it('counts drain entries and returns route evidence for a telegraphed severe failure', () => {
		const value = simulation('severe-drain-result');
		removeStreetInterference(value);
		const drain = value.entities.find((entity) => entity.kind === 'drain')!;
		drain.active = true;
		drain.visible = true;
		drain.severe = true;
		drain.subtype = 'deep-open-drain';
		drain.x = value.player.x;
		drain.z = value.player.z;

		value.update(1 / 60, REST);

		const result = value.result();
		expect(value.counters.drainsEntered).toBe(1);
		expect(value.player.motion).toBe('failed');
		expect(result).toMatchObject({
			won: false,
			reason: 'Entered a deep roadside drain.',
			counters: { drainsEntered: 1 }
		});
		expect(result!.route.length).toBeGreaterThan(1);
		expect(
			result!.routeSummary.annotations.some(
				(annotation) =>
					annotation.kind === 'incident' && annotation.label.includes('open roadside drain')
			)
		).toBe(true);
	});

	it('returns a deterministic loss when morale reaches zero', () => {
		const first = simulation('morale-failure');
		const second = simulation('morale-failure');
		for (const value of [first, second]) {
			removeStreetInterference(value);
			value.metrics = { ...value.metrics, morale: 0 };
			value.food = { ...value.food, metrics: value.metrics };
			value.update(1 / 60, REST);
		}

		expect(first.result()).toMatchObject({ won: false, reason: 'Morale reached zero.' });
		expect(first.result()!.message).toBe(second.result()!.message);
		expect(first.player.motion).toBe('failed');
		expect(
			first
				.result()!
				.routeSummary.annotations.some(
					(annotation) => annotation.kind === 'incident' && annotation.label.includes('Morale')
				)
		).toBe(true);
	});

	it('accepts failed-run assistance in both constructor forms without changing the world contract', () => {
		const settings = {
			...DEFAULT_GAME_SETTINGS,
			tutorialEnabled: true,
			controlScheme: 'simple' as const
		};
		const baseline = new SpatialStreetSimulation('assisted-run', settings, CALCUTTA_SPATIAL_WORLD);
		const thirdArgument = new SpatialStreetSimulation('assisted-run', settings, 3);
		const fourthArgument = new SpatialStreetSimulation(
			'assisted-run',
			settings,
			CALCUTTA_SPATIAL_WORLD,
			3
		);

		expect(thirdArgument.world).toBe(CALCUTTA_SPATIAL_WORLD);
		expect(fourthArgument.world).toBe(CALCUTTA_SPATIAL_WORLD);
		expect(thirdArgument.previousFailedRuns).toBe(3);
		expect(thirdArgument.metrics.morale).toBeGreaterThan(baseline.metrics.morale);
		expect(thirdArgument.hurryStaminaThreshold).toBeLessThan(baseline.hurryStaminaThreshold);
		expect(thirdArgument.entities.map(entityDigest)).toEqual(
			fourthArgument.entities.map(entityDigest)
		);

		const baselineObstruction = baseline.entities.find(
			(entity) => entity.id === 'timed-obstruction-1'
		)!;
		const assistedObstruction = thirdArgument.entities.find(
			(entity) => entity.id === 'timed-obstruction-1'
		)!;
		const baselineDuration = baselineObstruction.resolvesAtMs! - baselineObstruction.spawnAtMs;
		const assistedDuration = assistedObstruction.resolvesAtMs! - assistedObstruction.spawnAtMs;
		expect(assistedDuration).toBeLessThan(baselineDuration);
	});

	it('physically pauses at a nearby food stall and can reuse the authored stall', () => {
		const value = simulation('stall-reuse');
		removeStreetInterference(value);
		const tea = value.entities.find(
			(entity) => entity.kind === 'food-stall' && entity.subtype === 'tea'
		)!;
		tea.active = true;
		value.player.x = tea.x;
		value.player.z = tea.z;

		const first = value.interact();
		expect(first).toMatchObject({ accepted: true, kind: 'tea', stallId: tea.id });
		runFor(value, 1);
		expect(value.player.motion).toBe('interacting');
		expect(value.player.speed).toBe(0);
		expect(value.food.consumed.tea).toBe(0);

		runFor(value, 2.4);
		expect(value.food.consumed.tea).toBe(1);
		expect(value.counters.teaStops).toBe(1);
		expect(tea.interactionCount).toBe(1);
		expect(value.metrics.reflex).toBeCloseTo(1.2);
		expect(value.hud().interactionPrompt).toBe('Chaa: warnings arrive earlier for eight seconds.');

		runFor(value, 4.1);
		const second = value.interact();
		expect(second.accepted).toBe(true);
		runFor(value, 3.3);
		expect(value.food.consumed.tea).toBe(2);
		expect(value.counters.teaStops).toBe(2);
		expect(tea.interactionCount).toBe(2);
		expect(value.annotations.filter((annotation) => annotation.kind === 'food')).toHaveLength(2);
	});

	it('materialises a temporary fuchka crowd and reports the seeded ghugni consequence truthfully', () => {
		const fuchkaRun = simulation('food-stall-crowd');
		removeStreetInterference(fuchkaRun);
		const fuchka = fuchkaRun.entities.find(
			(entity) => entity.kind === 'food-stall' && entity.subtype === 'fuchka'
		)!;
		fuchka.active = true;
		fuchkaRun.player.x = fuchka.x;
		fuchkaRun.player.z = fuchka.z;
		expect(fuchkaRun.interact().accepted).toBe(true);
		runFor(fuchkaRun, 2.7);
		const crowd = fuchkaRun.entities.filter((entity) => entity.stallCrowd);
		expect(crowd).toHaveLength(3);
		expect(crowd.every((entity) => entity.active && entity.state === 'buying')).toBe(true);
		expect(fuchkaRun.hud().interactionPrompt).toBe(FOOD_MESSAGES.fuchka);
		runFor(fuchkaRun, 2.6);
		expect(crowd.every((entity) => !entity.active)).toBe(true);
		expect(
			fuchkaRun.annotations.some(
				(annotation) => annotation.kind === 'food' && annotation.label.includes('crowd dispersed')
			)
		).toBe(true);

		const consumeGhugni = () => {
			const value = simulation('truthful-ghugni');
			removeStreetInterference(value);
			const stall = value.entities.find(
				(entity) => entity.kind === 'food-stall' && entity.subtype === 'ghugni'
			)!;
			stall.active = true;
			value.player.x = stall.x;
			value.player.z = stall.z;
			expect(value.interact().accepted).toBe(true);
			runFor(value, 2.9);
			return value;
		};
		const first = consumeGhugni();
		const second = consumeGhugni();
		const outcome = first.food.lastGhugniOutcome!;
		const expected = `Roadside ghugni: ${GHUGNI_MESSAGES[outcome]}`;
		expect(outcome).toBe(second.food.lastGhugniOutcome);
		expect(first.hud().interactionPrompt).toBe(expected);
		expect(first.hud().interactionPrompt).not.toContain('pending');
		expect(
			first.annotations.some(
				(annotation) => annotation.kind === 'food' && annotation.label === expected
			)
		).toBe(true);
	});

	it('stages the first forty seconds, then creates and resolves a fair timed obstruction', () => {
		const value = simulation('eventual-fair-obstruction');
		const timed = value.entities.find((entity) => entity.id === 'timed-obstruction-1')!;
		const firstHuman = value.entities.find((entity) => entity.id === 'human-1')!;
		const firstPothole = value.entities.find((entity) => entity.id === 'pothole-1')!;
		const firstBicycle = value.entities.find((entity) => entity.kind === 'bicycle')!;

		expect(value.hud().onboardingCue).toContain('Click or tap');
		expect(timed.active).toBe(false);
		runFor(value, 4.5);
		expect(firstHuman.active).toBe(false);
		expect(firstPothole.active).toBe(false);
		expect(firstBicycle.active).toBe(false);
		runFor(value, 4);
		expect(firstHuman.active).toBe(true);
		expect(firstPothole.active).toBe(false);
		runFor(value, 3.5);
		expect(firstPothole.active).toBe(true);
		expect(firstBicycle.active).toBe(false);
		runFor(value, 5);
		expect(firstBicycle.active).toBe(true);
		runFor(value, 22.5);
		expect(value.hud().onboardingCue).not.toBe('');
		expect(timed.active).toBe(false);
		runFor(value, 1);
		expect(value.hud().onboardingCue).toBe('');

		runUntil(value, () => timed.active, 15);
		expect(timed.active).toBe(true);
		expect(value.blockedEdgeIds.has(timed.edgeId)).toBe(true);
		expect(
			pathToDestination(value.player, {
				blockedEdgeIds: value.blockedEdgeIds,
				radiusM: value.player.radiusM
			})
		).not.toBeNull();

		runUntil(value, () => !timed.active, 22);
		expect(timed.active).toBe(false);
		expect(value.blockedEdgeIds.has(timed.edgeId)).toBe(false);
		expect(
			value.annotations.filter(
				(annotation) => annotation.kind === 'obstruction' && annotation.label.includes('moved on')
			)
		).toHaveLength(1);

		runUntil(value, () => value.weather.state === 'rain', 20);
		expect(value.weather.state).toBe('rain');
		expect(value.annotations.some((annotation) => annotation.kind === 'rain')).toBe(true);
	});

	it('arrives through the authored network and returns route and annotation evidence', () => {
		const value = simulation('arrival-route');
		removeStreetInterference(value);
		const destination = getSpatialNode(CALCUTTA_SPATIAL_WORLD.destinationNodeId).position;
		const accepted = value.walkTo(destination, 'destination');

		expect(accepted.accepted).toBe(true);
		expect(accepted.path?.points.length).toBeGreaterThan(10);
		runUntil(value, () => value.result() !== null, 240);

		const result = value.result();
		expect(result).not.toBeNull();
		expect(result).toMatchObject({ won: true, reason: 'Destination reached.' });
		expect(result!.distanceMetres).toBeGreaterThan(180);
		expect(result!.route.length).toBeGreaterThan(30);
		expect(result!.routeSummary.points.length).toBeGreaterThan(30);
		expect(result!.routeSummary.visitedEdgeIds.length).toBeGreaterThan(5);
		expect(result!.routeSummary.detourDistanceM).toBeGreaterThanOrEqual(0);
		expect(
			result!.routeSummary.annotations.some((annotation) => annotation.kind === 'arrival')
		).toBe(true);
		expect(result!.destination).toEqual({
			x: destination.x,
			z: destination.z,
			label: 'Destination pharmacy'
		});
		expect(value.player.motion).toBe('arrived');
	}, 20_000);
});
