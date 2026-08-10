import { describe, expect, it } from 'vitest';
import {
	KAGOJER_DANA_PROGRESSION_STORAGE_KEY,
	PROGRESSION_UNLOCK_CATALOG,
	applyFlightProgression,
	createDefaultProgressionState,
	deriveProgressionUnlocks,
	mergeProgressionStates,
	parseProgressionState,
	serializeProgressionState,
	type ProgressionFlightOutcome
} from './Progression';

const quietFlight: ProgressionFlightOutcome = {
	visitedRegisters: ['low'],
	landmarkObservations: [],
	windTransfers: [],
	landing: null
};

describe('Kagojer Dana poetic progression', () => {
	it('starts with one weather, time and throw pattern without touching browser globals', () => {
		const state = createDefaultProgressionState();
		expect(KAGOJER_DANA_PROGRESSION_STORAGE_KEY).toBe('kagojer-dana.progression.v1');
		expect(state).toEqual({
			version: 1,
			unlocked: ['weather:afternoon-heat', 'time:late-afternoon', 'throw:north-window'],
			completedVariants: [],
			flightCount: 0
		});
		expect(PROGRESSION_UNLOCK_CATALOG.every((entry) => entry.poeticNote.length > 20)).toBe(true);
	});

	it('derives weather, time and starting-throw unlocks in fixed catalog order', () => {
		const unlocks = deriveProgressionUnlocks(createDefaultProgressionState(), {
			visitedRegisters: ['high', 'low', 'middle', 'low'],
			landmarkObservations: [{ landmarkId: 'howrah-bridge', visibleSeconds: 12 }],
			windTransfers: [{ from: 'river-breeze', to: 'roof-thermal' }],
			landing: { kind: 'rooftop', graceful: true }
		});

		expect(unlocks.map((unlock) => unlock.id)).toEqual([
			'weather:winter-haze',
			'time:river-evening',
			'weather:approaching-monsoon',
			'throw:rooftop-gust'
		]);
		for (const unlock of unlocks) {
			expect(unlock.title.length).toBeGreaterThan(3);
			expect(unlock.reason.length).toBeGreaterThan(20);
		}
	});

	it('requires a clean landing before unlocking a location throw', () => {
		const collision = {
			...quietFlight,
			landing: { kind: 'ghat', graceful: false }
		} satisfies ProgressionFlightOutcome;
		expect(deriveProgressionUnlocks(createDefaultProgressionState(), collision)).toEqual([]);

		const landing = {
			...collision,
			landing: { kind: 'ghat', graceful: true }
		} satisfies ProgressionFlightOutcome;
		expect(deriveProgressionUnlocks(createDefaultProgressionState(), landing)).toMatchObject([
			{ id: 'throw:ghat-hand', kind: 'throw-pattern' }
		]);
	});

	it('supports the named-variant completion sequence and never re-awards an unlock', () => {
		const first = applyFlightProgression(createDefaultProgressionState(), {
			...quietFlight,
			completedVariant: 'afternoon-heat'
		});
		expect(first.newUnlocks.map((unlock) => unlock.id)).toEqual(['weather:winter-haze']);
		expect(first.state.flightCount).toBe(1);

		const second = applyFlightProgression(first.state, {
			...quietFlight,
			completedVariant: 'winter-haze'
		});
		expect(second.newUnlocks.map((unlock) => unlock.id)).toEqual(['time:river-evening']);

		const repeated = applyFlightProgression(second.state, {
			...quietFlight,
			completedVariant: 'winter-haze'
		});
		expect(repeated.newUnlocks).toEqual([]);
		expect(repeated.state.completedVariants).toEqual(['afternoon-heat', 'winter-haze']);
		expect(repeated.state.flightCount).toBe(3);
	});
});

describe('pure progression persistence', () => {
	it('round-trips a stable localStorage payload', () => {
		const progressed = applyFlightProgression(createDefaultProgressionState(), {
			...quietFlight,
			landing: { kind: 'courtyard', graceful: true }
		}).state;
		const encoded = serializeProgressionState(progressed);
		expect(parseProgressionState(encoded)).toEqual(progressed);
		expect(serializeProgressionState(parseProgressionState(encoded))).toBe(encoded);
	});

	it('recovers safely from malformed, old and contaminated data', () => {
		expect(parseProgressionState('{not-json')).toEqual(createDefaultProgressionState());
		expect(parseProgressionState(JSON.stringify({ version: 99 }))).toEqual(
			createDefaultProgressionState()
		);
		const sanitised = parseProgressionState(
			JSON.stringify({
				version: 1,
				unlocked: ['throw:ghat-hand', 'unknown', 'throw:ghat-hand'],
				completedVariants: ['river-evening', 'not-real'],
				flightCount: 4.9
			})
		);
		expect(sanitised.unlocked).toEqual([
			'weather:afternoon-heat',
			'time:late-afternoon',
			'throw:north-window',
			'throw:ghat-hand'
		]);
		expect(sanitised.completedVariants).toEqual(['river-evening']);
		expect(sanitised.flightCount).toBe(4);
	});

	it('merges snapshots commutatively and idempotently', () => {
		const ghat = applyFlightProgression(createDefaultProgressionState(), {
			...quietFlight,
			landing: { kind: 'ghat', graceful: true }
		}).state;
		const maidan = applyFlightProgression(createDefaultProgressionState(), {
			...quietFlight,
			landing: { kind: 'maidan-edge', graceful: true },
			completedVariant: 'afternoon-heat'
		}).state;
		const forward = mergeProgressionStates(ghat, maidan);
		const reverse = mergeProgressionStates(maidan, ghat);
		expect(forward).toEqual(reverse);
		expect(mergeProgressionStates(forward, forward)).toEqual(forward);
		expect(forward.unlocked).toContain('throw:ghat-hand');
		expect(forward.unlocked).toContain('throw:maidan-crosswind');
		expect(forward.unlocked).toContain('weather:winter-haze');
		expect(forward.flightCount).toBe(1);
	});
});
