import { describe, expect, it } from 'vitest';
import { StreetSimulation, type SimulationInput } from './simulation';
import { DEFAULT_GAME_SETTINGS } from './settings';
import type { StreetEntity } from './runtime-types';

const WALK_RIGHT: SimulationInput = { x: 1, y: 0, dash: false, source: 'keyboard' };
const REST: SimulationInput = { x: 0, y: 0, dash: false, source: 'keyboard' };

function isolatedSimulation(seed: string, tutorialEnabled = true): StreetSimulation {
	const simulation = new StreetSimulation(seed, {
		...DEFAULT_GAME_SETTINGS,
		tutorialEnabled
	});
	for (const entity of simulation.entities) entity.active = false;
	return simulation;
}

function blocker(id: string, x: number, y: number, radius: number): StreetEntity {
	return {
		id,
		kind: 'debris',
		x,
		y,
		vx: 0,
		vy: 0,
		radius,
		rotation: 0,
		state: 'idle',
		stateTimer: 0,
		age: 0,
		active: true,
		solid: true,
		dangerous: false
	};
}

describe('live street simulation regressions', () => {
	it('uses a clearance-valid start for the exact director fairness window', () => {
		const simulation = isolatedSimulation('fair-window');
		const { bounds, fairness } = simulation.checkLocalRouteFairness();

		expect(bounds.x).toBeGreaterThan(simulation.player.x);
		expect(fairness).toMatchObject({ fair: true, reason: 'route-available' });
		expect(fairness.path.length).toBeGreaterThan(1);
	});

	it('keeps a held dash short and requires a fresh press before another dash', () => {
		const simulation = isolatedSimulation('dash-edge', false);
		const heldDash: SimulationInput = { ...WALK_RIGHT, dash: true };

		simulation.update(1 / 60, heldDash);
		expect(simulation.player.dashing).toBe(true);

		for (let frame = 0; frame < 90; frame += 1) simulation.update(1 / 60, heldDash);
		expect(simulation.player.dashing).toBe(false);

		simulation.update(1 / 60, WALK_RIGHT);
		simulation.update(1 / 60, heldDash);
		expect(simulation.player.dashing).toBe(true);
		expect(simulation.counters.recklessDashes).toBe(1);
	});

	it('delivers tutorial cues through the accessible HUD and expires them', () => {
		const simulation = isolatedSimulation('tutorial-cue');
		let delivered = '';

		for (let frame = 0; frame < 300 && !delivered; frame += 1) {
			delivered = simulation.update(1 / 60, WALK_RIGHT).tutorialCue;
		}

		expect(delivered).toContain('WASD');
		expect(simulation.hud('tutorial').tutorialCue).toBe(delivered);

		for (let frame = 0; frame < 210; frame += 1) simulation.update(1 / 60, REST);
		expect(simulation.hud('tutorial').tutorialCue).toBe('');
	});

	it('counts a traversable narrow passage once rather than every fixed tick', () => {
		const simulation = isolatedSimulation('narrow-gap', false);
		simulation.entities.push(
			blocker('upper', simulation.player.x, simulation.player.y - 50, 30),
			blocker('lower', simulation.player.x, simulation.player.y + 50, 30)
		);

		simulation.update(1 / 60, REST);
		simulation.update(1 / 60, REST);

		expect(simulation.counters.narrowGaps).toBe(1);
	});

	it('uses failed-run assistance to add a bounded, deterministic food stall', () => {
		const simulation = new StreetSimulation(
			'assisted-food',
			{ ...DEFAULT_GAME_SETTINGS, tutorialEnabled: false },
			3
		);
		for (const entity of simulation.entities) {
			if (entity.kind !== 'food') entity.active = false;
		}
		const originalFoodCount = simulation.entities.filter((entity) => entity.kind === 'food').length;
		simulation.player.x = 1_700;

		simulation.update(1 / 60, REST);

		expect(simulation.entities.filter((entity) => entity.kind === 'food')).toHaveLength(
			originalFoodCount + 1
		);
	});

	it('places enough tea stalls for the third-tea jitter consequence to be reachable', () => {
		const simulation = new StreetSimulation('tea-route', DEFAULT_GAME_SETTINGS);
		const teaStalls = simulation.entities.filter(
			(entity) => entity.kind === 'food' && entity.subtype === 'tea'
		);

		expect(teaStalls.length).toBeGreaterThanOrEqual(3);
	});

	it('can complete the entire continuous route without a hidden terminal-state barrier', () => {
		const simulation = isolatedSimulation('full-walk', false);
		let ending: ReturnType<StreetSimulation['update']>['ended'] = null;

		for (let frame = 0; frame < 15_000 && !ending; frame += 1) {
			for (const entity of simulation.entities) entity.active = false;
			ending = simulation.update(1 / 60, WALK_RIGHT).ended;
		}

		expect(ending).toMatchObject({ won: true, reason: 'Destination reached.' });
		expect(simulation.elapsedMs).toBeGreaterThan(140_000);
		expect(simulation.elapsedMs).toBeLessThan(240_000);
	});
});
