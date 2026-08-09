import { describe, expect, it } from 'vitest';
import { createCollisionState, resolveCollision } from './collision';
import {
	createDirectorObservation,
	createDirectorState,
	updateDirector,
	type DirectorObservation
} from './director';
import {
	checkRouteFairness,
	checkSpawnAllowed,
	createPlayerSpawnExclusion,
	filterSpawnCandidates
} from './fairness';
import {
	GameStateMachine,
	InvalidGameTransitionError,
	createInitialGameState,
	transitionGameState
} from './game-state';
import { DEFAULT_GAME_SETTINGS, parseSettings, serializeSettings } from './settings';

describe('collision immunity', () => {
	it('suppresses overlapping impacts during the recovery grace period', () => {
		const first = resolveCollision(createCollisionState(), {
			atMs: 1_000,
			sourceId: 'office-commuter',
			severity: 'moderate'
		});
		const overlapping = resolveCollision(first.state, {
			atMs: 1_250,
			sourceId: 'umbrella-17',
			severity: 'severe'
		});
		const recovered = resolveCollision(overlapping.state, {
			atMs: 2_200,
			sourceId: 'rickshaw-4',
			severity: 'minor'
		});

		expect(first.applied).toBe(true);
		expect(overlapping).toMatchObject({
			applied: false,
			reason: 'immune',
			consequences: null
		});
		expect(overlapping.state.acceptedCollisions).toBe(1);
		expect(overlapping.state.suppressedCollisions).toBe(1);
		expect(recovered.applied).toBe(true);
	});

	it('requires an explicit override for a decisive hazard to bypass immunity', () => {
		const first = resolveCollision(createCollisionState(), {
			atMs: 100,
			sourceId: 'pothole',
			severity: 'minor'
		});
		const drain = resolveCollision(first.state, {
			atMs: 150,
			sourceId: 'open-drain',
			severity: 'decisive',
			ignoresImmunity: true
		});

		expect(drain.applied).toBe(true);
		expect(drain.consequences?.fatal).toBe(true);
	});
});

describe('game-state transitions', () => {
	it('follows loading, title, tutorial, play, pause, and win without contradictory flags', () => {
		const machine = new GameStateMachine();
		expect(machine.dispatch({ type: 'loaded' })).toEqual({ status: 'title' });
		expect(machine.dispatch({ type: 'start', seed: 'lane-9', tutorial: true })).toEqual({
			status: 'tutorial',
			seed: 'lane-9'
		});
		expect(machine.dispatch({ type: 'pause' })).toEqual({
			status: 'paused',
			seed: 'lane-9',
			resumeTo: 'tutorial'
		});
		expect(machine.dispatch({ type: 'resume' }).status).toBe('tutorial');
		expect(machine.dispatch({ type: 'tutorial-complete' }).status).toBe('playing');
		expect(machine.dispatch({ type: 'win' })).toEqual({ status: 'won', seed: 'lane-9' });
	});

	it('rejects impossible transitions and supports retrying an error', () => {
		expect(() => transitionGameState(createInitialGameState(), { type: 'win' })).toThrow(
			InvalidGameTransitionError
		);

		const error = transitionGameState(createInitialGameState(), {
			type: 'failed',
			message: 'Canvas unavailable'
		});
		expect(transitionGameState(error, { type: 'retry' })).toEqual({
			status: 'loading',
			attempt: 2
		});
	});
});

describe('settings parsing and migration', () => {
	it('repairs malformed input without reading browser storage', () => {
		expect(parseSettings('{not-json')).toEqual({
			settings: DEFAULT_GAME_SETTINGS,
			migratedFrom: null,
			repaired: true
		});
	});

	it('migrates unversioned legacy names and values', () => {
		const result = parseSettings({
			muted: false,
			reduceMotion: true,
			quality: 'minimal',
			controls: 'arrows',
			joystickHand: 'southpaw',
			showTutorial: false,
			highContrast: true
		});

		expect(result.migratedFrom).toBe(0);
		expect(result.repaired).toBe(true);
		expect(result.settings).toEqual({
			version: 3,
			soundEnabled: true,
			reducedMotion: true,
			detailLevel: 'low',
			controlScheme: 'simple',
			cameraMovement: 'gentle',
			tutorialEnabled: false,
			tutorialCompleted: false,
			highContrastWarnings: true
		});
	});

	it('round-trips current settings without another repair', () => {
		const settings = {
			...DEFAULT_GAME_SETTINGS,
			soundEnabled: true,
			detailLevel: 'high' as const
		};
		expect(parseSettings(serializeSettings(settings))).toEqual({
			settings,
			migratedFrom: null,
			repaired: false
		});
	});

	it('migrates version-one field names while repairing invalid choices', () => {
		const result = parseSettings({
			version: 1,
			soundEnabled: true,
			reducedMotion: false,
			detail: 'full',
			controls: 'joystick',
			joystickSide: 'upside-down',
			tutorial: false,
			highContrastWarnings: true
		});

		expect(result.migratedFrom).toBe(1);
		expect(result.settings).toMatchObject({
			soundEnabled: true,
			detailLevel: 'auto',
			controlScheme: 'simple',
			cameraMovement: 'gentle',
			tutorialEnabled: false,
			highContrastWarnings: true
		});
	});

	it('migrates version-two preferences while preserving an explicit mute', () => {
		const result = parseSettings({
			version: 2,
			soundEnabled: false,
			reducedMotion: false,
			detailLevel: 'high',
			controlScheme: 'keyboard',
			joystickSide: 'left',
			tutorialEnabled: true,
			highContrastWarnings: false
		});

		expect(result.migratedFrom).toBe(2);
		expect(result.settings).toMatchObject({
			version: 3,
			soundEnabled: false,
			detailLevel: 'high',
			controlScheme: 'experienced',
			cameraMovement: 'gentle',
			tutorialCompleted: false
		});
	});
});

describe('route fairness', () => {
	const bounds = { x: 0, y: 0, width: 400, height: 200 };

	it('finds a continuous minimum-width route around changing obstacles', () => {
		const result = checkRouteFairness({
			bounds,
			minimumRouteWidth: 30,
			blockers: [
				{ id: 'top-stall', x: 90, y: 0, width: 90, height: 95 },
				{ id: 'bottom-crowd', x: 220, y: 105, width: 90, height: 95 }
			]
		});

		expect(result.fair).toBe(true);
		expect(result.reason).toBe('route-available');
		expect(result.path.length).toBeGreaterThan(2);
	});

	it('rejects a full seal and a gap narrower than the player corridor', () => {
		const sealed = checkRouteFairness({
			bounds,
			minimumRouteWidth: 30,
			blockers: [{ id: 'cow', x: 185, y: 0, width: 30, height: 200 }]
		});
		const tooNarrow = checkRouteFairness({
			bounds,
			minimumRouteWidth: 40,
			blockers: [{ id: 'stall', x: 185, y: 0, width: 30, height: 172 }]
		});

		expect(sealed).toMatchObject({ fair: false, reason: 'route-sealed' });
		expect(tooNarrow.fair).toBe(false);
		expect(tooNarrow.minimumEscapeWidth).toBe(28);
	});

	it('rejects an explicit start point that lacks boundary clearance', () => {
		const result = checkRouteFairness({
			bounds,
			minimumRouteWidth: 40,
			start: { x: 5, y: 100 },
			blockers: []
		});

		expect(result).toMatchObject({ fair: false, reason: 'start-blocked' });
	});
});

describe('spawn exclusion', () => {
	it("keeps high-speed threats out of the player's exclusion radius", () => {
		const zone = createPlayerSpawnExclusion({ x: 300, y: 120, radius: 10 }, 'high-speed-vehicle');
		expect(checkSpawnAllowed({ x: 499, y: 120 }, [zone]).allowed).toBe(false);
		expect(checkSpawnAllowed({ x: 500, y: 120 }, [zone]).allowed).toBe(true);
	});

	it('filters candidates against both exclusions and world bounds', () => {
		const candidates = [
			{ id: 'near', x: 20, y: 20, radius: 4 },
			{ id: 'safe', x: 150, y: 80, radius: 4 },
			{ id: 'outside', x: 205, y: 80, radius: 4 }
		];
		const allowed = filterSpawnCandidates(
			candidates,
			[{ id: 'player', x: 20, y: 20, radius: 30 }],
			{ x: 0, y: 0, width: 200, height: 100 }
		);

		expect(allowed.map((candidate) => candidate.id)).toEqual(['safe']);
	});
});

describe('difficulty director', () => {
	const blockedObservation = (overrides: Partial<DirectorObservation> = {}) =>
		createDirectorObservation({
			routeFair: false,
			availableEscapeWidth: 0,
			requiredEscapeWidth: 48,
			blockers: [
				{ id: 'cow-1', kind: 'cow' },
				{ id: 'customer-1', kind: 'stall-customer' }
			],
			...overrides
		});

	it('waits briefly, then releases the least conspicuous procedural deadlock', () => {
		const detected = updateDirector(createDirectorState(), blockedObservation({ nowMs: 1_000 }));
		const released = updateDirector(detected.state, blockedObservation({ nowMs: 1_750 }));

		expect(detected.release).toBeNull();
		expect(released.release).toEqual({
			type: 'release-deadlock',
			method: 'dismiss-customer',
			targetId: 'customer-1',
			durationMs: 1_800,
			reason: 'procedural-deadlock'
		});
		expect(released.state.interventions).toBe(1);
	});

	it('opens a temporary squeeze gap when no active blocker can move', () => {
		const detected = updateDirector(
			createDirectorState(),
			blockedObservation({
				nowMs: 10,
				blockers: [{ id: 'drain', kind: 'fixed' }]
			})
		);
		const released = updateDirector(
			detected.state,
			blockedObservation({
				nowMs: 800,
				blockers: [{ id: 'drain', kind: 'fixed' }]
			})
		);

		expect(released.release).toMatchObject({
			method: 'open-squeeze-gap',
			targetId: null
		});
	});
});
