import { describe, expect, it } from 'vitest';
import {
	CLOCK_TARGET_MINUTES,
	PROJECTOR_FOCUS_SWEET_SPOT,
	PROJECTOR_REQUIRED_ROUTE,
	RADIO_TUNING_SWEET_SPOT,
	createInitialClockState,
	createInitialProjectorState,
	createInitialRadioState,
	deriveClockJobStatus,
	deriveProjectorJobStatus,
	deriveRadioJobStatus,
	fastenClockBackScrew,
	fastenRadioBackScrew,
	fitSpareProjectorBelt,
	getBenchTrayItems,
	getRepairHint,
	inspectProjectorComponent,
	inspectRadioComponent,
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
	toggleRadioBatteryClip,
	toggleRadioPower,
	traceClockGearTrain,
	turnClockInput,
	unscrewClockBack,
	unscrewRadioBack,
	unthreadLastProjectorGuide
} from './repairs';
import { createInitialUnlocks } from './state';

describe('Portable radio repair rules', () => {
	it('requires observing the closed-case symptom with power off safety before opening, prevents blind seating without inspection, and completes cleanly', () => {
		let radio = createInitialRadioState();
		const unlocks = createInitialUnlocks();
		expect(deriveRadioJobStatus('accepted', radio)).toBe('accepted');

		// Cannot unscrew before closed-case symptom test
		const prematureUnscrew = unscrewRadioBack(radio);
		expect(prematureUnscrew.screwsRemoved).toBe(0);
		expect(prematureUnscrew.lastFeedback).toContain('closed-case test');

		// Switch on and run closed-case test
		radio = toggleRadioPower(radio);
		expect(radio.powerOn).toBe(true);
		radio = runRadioClosedTest(radio);
		expect(radio.closedTestRun).toBe(true);
		expect(radio.closedTestSawCutout).toBe(true);
		expect(radio.lastFeedback).toContain('power light stays steadily lit');
		expect(deriveRadioJobStatus('accepted', radio)).toBe('inspected');

		// Safety: cannot unscrew while powered on
		const poweredUnscrew = unscrewRadioBack(radio);
		expect(poweredUnscrew.screwsRemoved).toBe(0);

		// Switch off and open back cover
		radio = toggleRadioPower(radio);
		radio = unscrewRadioBack(radio);
		radio = unscrewRadioBack(radio);
		expect(radio.screwsRemoved).toBe(2);
		radio = toggleRadioBackCover(radio);
		expect(radio.coverOpen).toBe(true);

		// Tray holds both screws and cover
		expect(
			getBenchTrayItems(
				'radio',
				radio,
				createInitialClockState(),
				createInitialProjectorState(),
				unlocks
			)
		).toHaveLength(3);

		// Inspect intact battery pack (reversible unclip/reclip)
		radio = inspectRadioComponent(radio, 'battery-pack');
		expect(radio.lastFeedback).toContain('fresh 1.5V D-cells');
		radio = toggleRadioBatteryClip(radio);
		expect(radio.batteryClipSeated).toBe(false);
		// Cannot close cover while batteries are left out in the tray
		expect(toggleRadioBackCover(radio).coverOpen).toBe(true);
		radio = toggleRadioBatteryClip(radio);
		expect(radio.batteryClipSeated).toBe(true);

		// Blindly calling seatRadioSpeakerConnector before inspecting inspects first rather than silently solving
		const firstSpeakerClick = seatRadioSpeakerConnector(radio);
		expect(firstSpeakerClick.speakerConnectorSeated).toBe(false);
		expect(firstSpeakerClick.inspectedParts).toContain('speaker-connector');
		expect(firstSpeakerClick.lastFeedback).toContain('This connector is loose');

		// Second intentional action seats the connector
		radio = seatRadioSpeakerConnector(firstSpeakerClick);
		expect(radio.speakerConnectorSeated).toBe(true);
		expect(deriveRadioJobStatus('accepted', radio)).toBe('repaired');

		// Close cover and fasten screws
		radio = toggleRadioBackCover(radio);
		radio = fastenRadioBackScrew(radio);
		radio = fastenRadioBackScrew(radio);
		expect(radio.coverOpen).toBe(false);
		expect(radio.screwsRemoved).toBe(0);

		// Power on and tune station
		radio = toggleRadioPower(radio);
		radio = setRadioTuningDial(radio, RADIO_TUNING_SWEET_SPOT.target);
		expect(radio.stationTuned).toBe(true);
		expect(radio.verifiedClosedWorking).toBe(true);
		expect(deriveRadioJobStatus('accepted', radio)).toBe('tested');
	});
});

describe('Wind-up clock mechanical arrangement rules', () => {
	it('reports exact gap and jam locations for wrong gear orders and completes only with valid meshing + set hands', () => {
		let clock = createInitialClockState();
		expect(traceClockGearTrain(clock.gearPlacements).reachesHands).toBe(false);
		expect(traceClockGearTrain(clock.gearPlacements).explanation).toContain('too small to reach');

		// Open back plate
		clock = unscrewClockBack(clock);
		clock = unscrewClockBack(clock);
		clock = toggleClockBackPlate(clock);
		expect(clock.backOpen).toBe(true);

		// Try jamming large wheel on tight Shaft 3 while medium is on Shaft 2
		clock = placeClockGear(clock, 'gear-large', 'shaft-1');
		clock = placeClockGear(clock, 'gear-medium', 'shaft-2');
		// Swap small to tray and try putting large on shaft-3
		const jammedTry = placeClockGear(clock, 'gear-large', 'shaft-3');
		expect(traceClockGearTrain(jammedTry.gearPlacements).reachesHands).toBe(false);

		// Arrange correct mechanical sequence: large -> shaft-1, medium -> shaft-2, small -> shaft-3
		clock = placeClockGear(clock, 'gear-large', 'shaft-1');
		clock = placeClockGear(clock, 'gear-medium', 'shaft-2');
		clock = placeClockGear(clock, 'gear-small', 'shaft-3');

		const validTrace = traceClockGearTrain(clock.gearPlacements);
		expect(validTrace.reachesHands).toBe(true);
		expect(validTrace.spinningNodes).toEqual([
			'mainspring',
			'shaft-1',
			'shaft-2',
			'shaft-3',
			'hands'
		]);

		// Must test input before closing back plate
		expect(toggleClockBackPlate(clock).backOpen).toBe(true);
		clock = turnClockInput(clock);
		expect(clock.mechanismTested).toBe(true);
		expect(deriveClockJobStatus('accepted', clock)).toBe('repaired');

		// Close back plate, fasten screws, set hands near 4:30
		clock = toggleClockBackPlate(clock);
		clock = fastenClockBackScrew(clock);
		clock = fastenClockBackScrew(clock);
		clock = setClockHandsMinutes(clock, CLOCK_TARGET_MINUTES.target);
		expect(clock.verifiedWorking).toBe(true);
		expect(deriveClockJobStatus('accepted', clock)).toBe('tested');
	});
});

describe('Film projector belt, routing, and focus rules', () => {
	it('enforces spare belt availability, non-destructive ordered film routing, manual advance check, and focus', () => {
		let proj = createInitialProjectorState();
		const noBeltUnlocks = createInitialUnlocks();
		const beltUnlocks = { ...noBeltUnlocks, spareBeltDiscovered: true, spareBeltInDrawer: true };

		// Open side cover
		proj = toggleProjectorCover(proj);
		expect(proj.coverOpen).toBe(true);
		proj = inspectProjectorComponent(proj, 'drive-belt');
		expect(proj.lastFeedback).toContain('perished');

		// Remove worn belt
		proj = removeWornProjectorBelt(proj);
		expect(proj.beltState).toBe('removed');

		// Without Bapi's belt, informs player clearly without breaking state
		const missingBeltAttempt = fitSpareProjectorBelt(proj, false);
		expect(missingBeltAttempt.beltState).toBe('removed');
		expect(missingBeltAttempt.lastFeedback).toContain('Bapi');

		// Fit Bapi's spare belt
		proj = fitSpareProjectorBelt(proj, true);
		expect(proj.beltState).toBe('spare_fitted');

		// Wrong initial film route fails manual check non-destructively
		proj = manualAdvanceProjector(proj);
		expect(proj.manualCheckPassed).toBe(false);
		expect(proj.lastFeedback).toContain('missing the aperture gate');

		// Undo and rewind cleanly without consuming film
		proj = unthreadLastProjectorGuide(proj);
		expect(proj.threadedGuides).toEqual(['top-roller']);
		proj = rewindProjectorLeader(proj);
		expect(proj.threadedGuides).toEqual([]);

		// Thread all 5 guides in exact order
		for (const guide of PROJECTOR_REQUIRED_ROUTE) {
			proj = threadProjectorGuide(proj, guide);
		}
		proj = manualAdvanceProjector(proj);
		expect(proj.manualCheckPassed).toBe(true);
		expect(deriveProjectorJobStatus('accepted', proj)).toBe('repaired');

		// Close cover, switch on, adjust focus
		proj = toggleProjectorCover(proj);
		expect(proj.coverOpen).toBe(false);
		proj = toggleProjectorPower(proj);
		expect(proj.poweredTransportVerified).toBe(true);

		// Hints remain helpful at every level
		expect(
			getRepairHint(
				'projector',
				createInitialRadioState(),
				createInitialClockState(),
				proj,
				1,
				beltUnlocks
			)
		).toContain('test card');

		proj = setProjectorFocus(proj, PROJECTOR_FOCUS_SWEET_SPOT.target);
		expect(proj.verifiedWorking).toBe(true);
		expect(deriveProjectorJobStatus('accepted', proj)).toBe('tested');
	});
});
