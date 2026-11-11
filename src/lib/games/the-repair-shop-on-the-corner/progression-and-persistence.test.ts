import { describe, expect, it } from 'vitest';
import {
	CLOCK_TARGET_MINUTES,
	PROJECTOR_FOCUS_SWEET_SPOT,
	PROJECTOR_REQUIRED_ROUTE,
	RADIO_TUNING_SWEET_SPOT,
	fastenClockBackScrew,
	fastenRadioBackScrew,
	fitSpareProjectorBelt,
	manualAdvanceProjector,
	placeClockGear,
	removeWornProjectorBelt,
	rewindProjectorLeader,
	runRadioClosedTest,
	seatRadioSpeakerConnector,
	setClockHandsMinutes,
	setProjectorFocus,
	setRadioTuningDial,
	threadProjectorGuide,
	toggleClockBackPlate,
	toggleProjectorCover,
	toggleProjectorPower,
	toggleRadioBackCover,
	toggleRadioPower,
	turnClockInput,
	unscrewClockBack,
	unscrewRadioBack
} from './repairs';
import {
	SAVE_STORAGE_KEY,
	loadFromStorage,
	parseSaveData,
	saveToStorage,
	type StorageLike
} from './persistence';
import {
	applyDialogueChoice,
	createInitialGameState,
	deriveCurrentObjective,
	finishCourtyardScreening,
	openCharacterConversation,
	resetSingleRepair,
	startCourtyardScreening
} from './state';
import { KEY_PLACES, findWalkPath, isPointInWalkRects } from './world';

function createMemoryStorage(): StorageLike & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (k) => data.get(k) ?? null,
		setItem: (k, v) => {
			data.set(k, v);
		},
		removeItem: (k) => {
			data.delete(k);
		}
	};
}

describe('Neighbourhood progression, dependencies, and courtyard ending', () => {
	it('progresses from early afternoon through all three repairs, unlocks spare belt and chairs without duplicate returns, and runs the screening', () => {
		let state = createInitialGameState();
		expect(state.afternoonPhase).toBe('early_afternoon');
		expect(deriveCurrentObjective(state)).toContain('Bapi');

		// 1. Accept Bapi's radio
		state = openCharacterConversation(state, 'bapi');
		state = applyDialogueChoice(state, 'accept-radio');
		expect(state.jobs.radio).toBe('accepted');
		expect(state.mode).toBe('workbench');

		// Complete radio repair
		let r = toggleRadioPower(state.radio);
		r = runRadioClosedTest(r);
		r = toggleRadioPower(r);
		r = unscrewRadioBack(unscrewRadioBack(r));
		r = toggleRadioBackCover(r);
		r = seatRadioSpeakerConnector(seatRadioSpeakerConnector(r));
		r = toggleRadioBackCover(r);
		r = fastenRadioBackScrew(fastenRadioBackScrew(r));
		r = toggleRadioPower(r);
		r = setRadioTuningDial(r, RADIO_TUNING_SWEET_SPOT.target);
		state = { ...state, radio: r, mode: 'explore' };

		// Return radio to Bapi -> mid_afternoon & teaStallRadioPlaying
		state = openCharacterConversation(state, 'bapi');
		state = applyDialogueChoice(state, 'return-radio');
		expect(state.jobs.radio).toBe('returned');
		expect(state.unlocks.teaStallRadioPlaying).toBe(true);
		expect(state.afternoonPhase).toBe('mid_afternoon');

		// Duplicate return choice cannot re-trigger
		const duplicateAttempt = applyDialogueChoice(state, 'return-radio');
		expect(duplicateAttempt.jobs.radio).toBe('returned');

		// Obtain spare rubber belts from Bapi
		state = openCharacterConversation(state, 'bapi');
		state = applyDialogueChoice(state, 'ask-belt');
		state = applyDialogueChoice(state, 'take-belt');
		expect(state.unlocks.spareBeltInDrawer).toBe(true);

		// 2. Accept and repair Ruma's projector BEFORE clock (verifying free choice after radio!)
		state = openCharacterConversation(state, 'ruma');
		state = applyDialogueChoice(state, 'accept-projector');
		expect(state.jobs.projector).toBe('accepted');

		// Reset single repair leaves radio returned and Bapi's belt intact
		let p = toggleProjectorCover(state.projector);
		p = removeWornProjectorBelt(p);
		state = resetSingleRepair({ ...state, projector: p }, 'projector');
		expect(state.projector.beltState).toBe('worn');
		expect(state.jobs.radio).toBe('returned');
		expect(state.unlocks.spareBeltInDrawer).toBe(true);

		// Complete projector
		p = toggleProjectorCover(state.projector);
		p = removeWornProjectorBelt(p);
		p = fitSpareProjectorBelt(p, state.unlocks.spareBeltInDrawer);
		p = rewindProjectorLeader(p);
		for (const g of PROJECTOR_REQUIRED_ROUTE) p = threadProjectorGuide(p, g);
		p = manualAdvanceProjector(p);
		p = toggleProjectorCover(p);
		p = toggleProjectorPower(p);
		p = setProjectorFocus(p, PROJECTOR_FOCUS_SWEET_SPOT.target);
		state = { ...state, projector: p, mode: 'explore' };

		state = openCharacterConversation(state, 'ruma');
		state = applyDialogueChoice(state, 'return-projector');
		expect(state.jobs.projector).toBe('returned');
		expect(state.afternoonPhase).toBe('golden_hour');

		// Screening cannot start before clock is returned
		expect(startCourtyardScreening(state).afternoonPhase).toBe('golden_hour');

		// 3. Accept and repair Mala's clock
		state = openCharacterConversation(state, 'mala');
		state = applyDialogueChoice(state, 'accept-clock');
		let c = unscrewClockBack(unscrewClockBack(state.clock));
		c = toggleClockBackPlate(c);
		c = placeClockGear(c, 'gear-large', 'shaft-1');
		c = placeClockGear(c, 'gear-medium', 'shaft-2');
		c = placeClockGear(c, 'gear-small', 'shaft-3');
		c = turnClockInput(c);
		c = toggleClockBackPlate(c);
		c = fastenClockBackScrew(fastenClockBackScrew(c));
		c = setClockHandsMinutes(c, CLOCK_TARGET_MINUTES.target);
		state = { ...state, clock: c, mode: 'explore' };

		state = openCharacterConversation(state, 'mala');
		state = applyDialogueChoice(state, 'return-clock');
		expect(state.jobs.clock).toBe('returned');
		expect(state.unlocks.shopClockTicking).toBe(true);
		expect(state.unlocks.courtyardChairsPlaced).toBe(true);
		expect(state.afternoonPhase).toBe('evening_ready');

		// 4. Start and finish courtyard screening -> free exploration in afterglow
		state = startCourtyardScreening(state);
		expect(state.mode).toBe('screening');
		expect(state.afternoonPhase).toBe('screening');

		state = finishCourtyardScreening(state);
		expect(state.mode).toBe('explore');
		expect(state.afternoonPhase).toBe('afterglow');
	});

	it('finds multi-zone walkable paths between the shop interior, tea stall, Sen Brothers, and courtyard', () => {
		const benchToTea = findWalkPath(KEY_PLACES.workbench, KEY_PLACES.teaStall);
		expect(benchToTea.length).toBeGreaterThan(1);
		for (const waypoint of benchToTea) {
			expect(isPointInWalkRects(waypoint)).toBe(true);
		}

		const teaToCourtyard = findWalkPath(KEY_PLACES.teaStall, KEY_PLACES.courtyardRuma);
		expect(teaToCourtyard.length).toBeGreaterThan(1);
		for (const waypoint of teaToCourtyard) {
			expect(isPointInWalkRects(waypoint)).toBe(true);
		}
	});
});

describe('Save format validation, migration, and unavailable storage resilience', () => {
	it('round-trips mid-repair workbench progress and clamps out-of-bounds player positions safely', () => {
		const storage = createMemoryStorage();
		let state = createInitialGameState();
		state = openCharacterConversation(state, 'bapi');
		state = applyDialogueChoice(state, 'accept-radio');
		state = {
			...state,
			playerPos: { x: 999, z: -999 }, // intentionally out-of-bounds
			radio: runRadioClosedTest(toggleRadioPower(state.radio))
		};

		const savedOk = saveToStorage(storage, state, {
			soundEnabled: true,
			masterVolume: 0.55,
			reducedMotion: true,
			highContrastLabels: true
		});
		expect(savedOk).toBe(true);

		const loaded = loadFromStorage(storage, false);
		expect(loaded.hasSave).toBe(true);
		expect(loaded.recoveredFromInvalid).toBe(false);
		expect(loaded.state.mode).toBe('workbench');
		expect(loaded.state.radio.closedTestRun).toBe(true);
		expect(isPointInWalkRects(loaded.state.playerPos)).toBe(true);
		expect(loaded.settings.masterVolume).toBe(0.55);
		expect(loaded.settings.reducedMotion).toBe(true);
	});

	it('recovers gracefully from malformed JSON, duplicate gear shaft corruption, older v0 saves, and throwing storage', () => {
		const storage = createMemoryStorage();
		storage.setItem(SAVE_STORAGE_KEY, '{not-valid-json');
		const malformedLoad = loadFromStorage(storage, true);
		expect(malformedLoad.hasSave).toBe(false);
		expect(malformedLoad.recoveredFromInvalid).toBe(true);
		expect(malformedLoad.settings.reducedMotion).toBe(true);

		// Older v0 save without version field and with two gears assigned to shaft-1
		const v0Raw = JSON.stringify({
			returnedObjects: ['radio'],
			clock: {
				screwsRemoved: 2,
				backOpen: true,
				gearPlacements: {
					'gear-large': 'shaft-1',
					'gear-medium': 'shaft-1',
					'gear-small': 'shaft-2'
				}
			}
		});
		const migrated = parseSaveData(v0Raw, false);
		expect(migrated.ok).toBe(true);
		if (migrated.ok) {
			expect(migrated.migrated).toBe(true);
			expect(migrated.state.jobs.radio).toBe('returned');
			expect(migrated.state.clock.gearPlacements['gear-large']).toBe('shaft-1');
			expect(migrated.state.clock.gearPlacements['gear-medium']).toBe('tray');
		}

		// Throwing storage (e.g. strict browser privacy block)
		const throwingStorage: StorageLike = {
			getItem: () => {
				throw new Error('SecurityError');
			},
			setItem: () => {
				throw new Error('QuotaExceededError');
			},
			removeItem: () => {
				throw new Error('SecurityError');
			}
		};
		expect(
			saveToStorage(throwingStorage, createInitialGameState(), {
				soundEnabled: false,
				masterVolume: 0.7,
				reducedMotion: false,
				highContrastLabels: false
			})
		).toBe(false);
		const safeFallback = loadFromStorage(throwingStorage, false);
		expect(safeFallback.hasSave).toBe(false);
		expect(safeFallback.state.jobs.radio).toBe('not_started');
	});
});
