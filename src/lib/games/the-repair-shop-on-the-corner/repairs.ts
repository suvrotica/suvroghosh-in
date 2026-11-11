import type {
	BenchTrayItem,
	ClockGearId,
	ClockMotionTrace,
	ClockShaftId,
	ClockSlotId,
	ClockState,
	JobId,
	JobStatus,
	NeighbourhoodUnlocks,
	ProjectorComponentId,
	ProjectorGuideId,
	ProjectorState,
	RadioComponentId,
	RadioState
} from './types';

export const RADIO_TUNING_SWEET_SPOT = { min: 62, max: 78, target: 70 } as const;
export const CLOCK_TARGET_MINUTES = { min: 260, max: 280, target: 270 } as const; // 4:30
export const PROJECTOR_FOCUS_SWEET_SPOT = { min: 54, max: 64, target: 59 } as const;

export const PROJECTOR_REQUIRED_ROUTE: readonly ProjectorGuideId[] = [
	'top-roller',
	'film-gate',
	'sprocket-wheel',
	'snubber-roller',
	'takeup-spool'
] as const;

export const CLOCK_GEOMETRY = {
	mainspring: { x: -0.45, y: -0.12, radius: 0.12, teeth: 18, label: 'Mainspring barrel' },
	'shaft-1': { x: -0.17, y: -0.06, label: 'Left arbor (Shaft 1)' },
	'shaft-2': { x: 0.07, y: 0.1, label: 'Centre arbor (Shaft 2)' },
	'shaft-3': { x: 0.28, y: 0.06, label: 'Right arbor (Shaft 3)' },
	hands: { x: 0.45, y: 0.16, radius: 0.108, teeth: 15, label: 'Hands wheel' }
} as const;

export const CLOCK_GEARS: Record<
	ClockGearId,
	{
		id: ClockGearId;
		label: string;
		shortLabel: string;
		shapeCue: string;
		radius: number;
		teeth: number;
	}
> = {
	'gear-large': {
		id: 'gear-large',
		label: 'Large 3-spoke wheel (24 teeth)',
		shortLabel: 'Large 3-spoke',
		shapeCue: 'Three wide spokes, largest diameter',
		radius: 0.165,
		teeth: 24
	},
	'gear-medium': {
		id: 'gear-medium',
		label: 'Medium 4-hole wheel (18 teeth)',
		shortLabel: 'Medium 4-hole',
		shapeCue: 'Four round cutouts, medium diameter',
		radius: 0.125,
		teeth: 18
	},
	'gear-small': {
		id: 'gear-small',
		label: 'Small solid pinion (12 teeth)',
		shortLabel: 'Small solid',
		shapeCue: 'Solid brass disc, smallest diameter',
		radius: 0.09,
		teeth: 12
	}
};

const MESH_TOLERANCE = 0.016;

function dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createInitialRadioState(): RadioState {
	return {
		powerOn: false,
		closedTestRun: false,
		closedTestSawCutout: false,
		screwsRemoved: 0,
		coverOpen: false,
		inspectedParts: [],
		batteryClipSeated: true,
		speakerConnectorSeated: false,
		tuningDial: 34,
		stationTuned: false,
		verifiedClosedWorking: false,
		selectedPart: null,
		hintLevel: 0,
		lastFeedback:
			'Bapi says the power light stays on, yet the sound disappears whenever the radio moves. Switch it on and run a closed-case test first.'
	};
}

export function createInitialClockState(): ClockState {
	return {
		screwsRemoved: 0,
		backOpen: false,
		inspected: false,
		inputTurned: false,
		gearPlacements: {
			'gear-small': 'shaft-1',
			'gear-large': 'shaft-2',
			'gear-medium': 'tray'
		},
		mechanismTested: false,
		handsMinutes: 195, // 3:15
		handsSet: false,
		verifiedWorking: false,
		selectedPart: null,
		selectedGearForPlacement: null,
		hintLevel: 0,
		lastFeedback:
			'Mala wound the clock and felt healthy spring tension, yet the hands stayed at 3:15. Unscrew the brass thumbscrews and open the back plate.'
	};
}

export function createInitialProjectorState(): ProjectorState {
	return {
		powerOn: false,
		coverOpen: false,
		inspected: false,
		beltState: 'worn',
		threadedGuides: ['top-roller', 'sprocket-wheel'],
		manualCheckPassed: false,
		poweredTransportVerified: false,
		focusDial: 24,
		focusLocked: false,
		verifiedWorking: false,
		selectedPart: null,
		hintLevel: 0,
		lastFeedback:
			'Ruma says the lamp lights up, but the reels barely twitch and the film slips out of path. Make sure the power is off, then open the side cover.'
	};
}

export function isRadioTuned(dial: number): boolean {
	return dial >= RADIO_TUNING_SWEET_SPOT.min && dial <= RADIO_TUNING_SWEET_SPOT.max;
}

export function radioSignalStrength(state: RadioState): number {
	if (!state.powerOn || !state.batteryClipSeated) return 0;
	const distance = Math.abs(state.tuningDial - RADIO_TUNING_SWEET_SPOT.target);
	return Math.max(0.08, Math.min(1, 1 - distance / 36));
}

export function isClockHandsOnTarget(minutes: number): boolean {
	const normalized = ((Math.round(minutes) % 720) + 720) % 720;
	return normalized >= CLOCK_TARGET_MINUTES.min && normalized <= CLOCK_TARGET_MINUTES.max;
}

export function formatClockMinutes(minutes: number): string {
	const normalized = ((Math.round(minutes) % 720) + 720) % 720;
	const rawHour = Math.floor(normalized / 60);
	const hour = rawHour === 0 ? 12 : rawHour;
	const min = normalized % 60;
	return `${hour}:${String(min).padStart(2, '0')}`;
}

export function isProjectorFocused(focusDial: number): boolean {
	return focusDial >= PROJECTOR_FOCUS_SWEET_SPOT.min && focusDial <= PROJECTOR_FOCUS_SWEET_SPOT.max;
}

export function projectorFocusSharpness(focusDial: number): number {
	const distance = Math.abs(focusDial - PROJECTOR_FOCUS_SWEET_SPOT.target);
	return Math.max(0, Math.min(1, 1 - distance / 38));
}

export function gearOnShaft(
	placements: Record<ClockGearId, ClockSlotId>,
	shaft: ClockShaftId
): ClockGearId | null {
	for (const gearId of ['gear-large', 'gear-medium', 'gear-small'] as const) {
		if (placements[gearId] === shaft) return gearId;
	}
	return null;
}

export function traceClockGearTrain(
	placements: Record<ClockGearId, ClockSlotId>
): ClockMotionTrace {
	const g1 = gearOnShaft(placements, 'shaft-1');
	const g2 = gearOnShaft(placements, 'shaft-2');
	const g3 = gearOnShaft(placements, 'shaft-3');

	if (!g1) {
		return {
			spinningNodes: ['mainspring'],
			stoppedAt: 'Left arbor (Shaft 1) is empty.',
			jammedAt: null,
			reachesHands: false,
			explanation:
				'The mainspring barrel turns, but Left arbor (Shaft 1) has no wheel to pick up the motion.'
		};
	}

	const r1 = CLOCK_GEARS[g1].radius;
	const d01 = dist2D(CLOCK_GEOMETRY.mainspring, CLOCK_GEOMETRY['shaft-1']);
	const sum01 = CLOCK_GEOMETRY.mainspring.radius + r1;
	if (sum01 < d01 - MESH_TOLERANCE) {
		return {
			spinningNodes: ['mainspring'],
			stoppedAt: 'Gap between Mainspring barrel and Left arbor (Shaft 1).',
			jammedAt: null,
			reachesHands: false,
			explanation: `The gears stop turning here: ${CLOCK_GEARS[g1].shortLabel} on Shaft 1 is too small to reach the mainspring barrel teeth.`
		};
	}
	if (sum01 > d01 + MESH_TOLERANCE) {
		return {
			spinningNodes: [],
			stoppedAt: 'Teeth bind at Left arbor (Shaft 1).',
			jammedAt: 'shaft-1',
			reachesHands: false,
			explanation: `${CLOCK_GEARS[g1].shortLabel} crowds the mainspring barrel on Shaft 1.`
		};
	}

	if (!g2) {
		return {
			spinningNodes: ['mainspring', 'shaft-1'],
			stoppedAt: 'Centre arbor (Shaft 2) is empty.',
			jammedAt: null,
			reachesHands: false,
			explanation:
				'Shaft 1 turns smoothly with the mainspring, but Centre arbor (Shaft 2) is empty so motion stops there.'
		};
	}

	const r2 = CLOCK_GEARS[g2].radius;
	const d12 = dist2D(CLOCK_GEOMETRY['shaft-1'], CLOCK_GEOMETRY['shaft-2']);
	const sum12 = r1 + r2;
	if (sum12 < d12 - MESH_TOLERANCE) {
		return {
			spinningNodes: ['mainspring', 'shaft-1'],
			stoppedAt: 'Gap between Shaft 1 and Shaft 2.',
			jammedAt: null,
			reachesHands: false,
			explanation: `The gears stop turning between Shaft 1 and Shaft 2: ${CLOCK_GEARS[g2].shortLabel} leaves an air gap.`
		};
	}
	if (sum12 > d12 + MESH_TOLERANCE) {
		return {
			spinningNodes: [],
			stoppedAt: 'Teeth jam between Shaft 1 and Shaft 2.',
			jammedAt: 'shaft-2',
			reachesHands: false,
			explanation: `The teeth bind between ${CLOCK_GEARS[g1].shortLabel} on Shaft 1 and ${CLOCK_GEARS[g2].shortLabel} on Shaft 2.`
		};
	}

	if (!g3) {
		return {
			spinningNodes: ['mainspring', 'shaft-1', 'shaft-2'],
			stoppedAt: 'Right arbor (Shaft 3) is empty.',
			jammedAt: null,
			reachesHands: false,
			explanation:
				'Motion reaches Centre arbor (Shaft 2), but Right arbor (Shaft 3) still needs a pinion to bridge to the hands.'
		};
	}

	const r3 = CLOCK_GEARS[g3].radius;
	const d23 = dist2D(CLOCK_GEOMETRY['shaft-2'], CLOCK_GEOMETRY['shaft-3']);
	const sum23 = r2 + r3;
	if (sum23 < d23 - MESH_TOLERANCE) {
		return {
			spinningNodes: ['mainspring', 'shaft-1', 'shaft-2'],
			stoppedAt: 'Gap between Shaft 2 and Shaft 3.',
			jammedAt: null,
			reachesHands: false,
			explanation: `The gears stop turning before Shaft 3: ${CLOCK_GEARS[g3].shortLabel} does not reach Shaft 2.`
		};
	}
	if (sum23 > d23 + MESH_TOLERANCE) {
		return {
			spinningNodes: [],
			stoppedAt: 'Teeth jam at Right arbor (Shaft 3).',
			jammedAt: 'shaft-3',
			reachesHands: false,
			explanation: `${CLOCK_GEARS[g3].shortLabel} is too wide for the tight spacing at Right arbor (Shaft 3) and binds against Shaft 2.`
		};
	}

	const d34 = dist2D(CLOCK_GEOMETRY['shaft-3'], CLOCK_GEOMETRY.hands);
	const sum34 = r3 + CLOCK_GEOMETRY.hands.radius;
	if (sum34 < d34 - MESH_TOLERANCE) {
		return {
			spinningNodes: ['mainspring', 'shaft-1', 'shaft-2', 'shaft-3'],
			stoppedAt: 'Gap before the hands wheel.',
			jammedAt: null,
			reachesHands: false,
			explanation: 'Shaft 3 spins, but its teeth fall short of the hands wheel.'
		};
	}
	if (sum34 > d34 + MESH_TOLERANCE) {
		return {
			spinningNodes: [],
			stoppedAt: 'Teeth bind against the hands wheel.',
			jammedAt: 'shaft-3',
			reachesHands: false,
			explanation: `${CLOCK_GEARS[g3].shortLabel} binds against the hands wheel arbor.`
		};
	}

	return {
		spinningNodes: ['mainspring', 'shaft-1', 'shaft-2', 'shaft-3', 'hands'],
		stoppedAt: null,
		jammedAt: null,
		reachesHands: true,
		explanation:
			'Every wheel meshes cleanly from the mainspring barrel to the hands arbor. The escapement ticks steadily.'
	};
}

export function diagnoseProjectorRoute(
	beltState: ProjectorState['beltState'],
	route: readonly ProjectorGuideId[]
): { ok: boolean; issue: string } {
	if (beltState === 'worn') {
		return {
			ok: false,
			issue:
				'The stretched drive belt slips on the brass motor pulley, so the take-up reel cannot pull film steadily.'
		};
	}
	if (beltState === 'removed') {
		return {
			ok: false,
			issue: 'No drive belt connects the motor pulley to the reel pulley yet.'
		};
	}
	if (route.length === 0) {
		return {
			ok: false,
			issue: 'The film leader is still wound on the upper supply spool and has not been threaded.'
		};
	}
	if (route[0] !== 'top-roller') {
		return {
			ok: false,
			issue:
				'The film skips the upper guide roller, pulling down at a steep angle where it rubs the gate frame.'
		};
	}
	if (!route.includes('film-gate')) {
		return {
			ok: false,
			issue:
				'The film is missing the aperture gate between the lamp and lens — only an empty white square would project.'
		};
	}
	if (route[1] !== 'film-gate') {
		return {
			ok: false,
			issue:
				'After the upper guide roller, the film must pass straight through the aperture gate before the lower rollers.'
		};
	}
	if (!route.includes('sprocket-wheel')) {
		return {
			ok: false,
			issue:
				'The film bypasses the toothed lower drive sprocket, so nothing advances each frame cleanly.'
		};
	}
	if (route[2] !== 'sprocket-wheel') {
		return {
			ok: false,
			issue:
				'The film reaches the tension roller before the toothed drive sprocket — thread the drive sprocket right below the gate.'
		};
	}
	if (!route.includes('snubber-roller')) {
		return {
			ok: false,
			issue:
				'The film is missing the lower tension guide before the take-up spool, leaving slack under the sprocket.'
		};
	}
	if (route[3] !== 'snubber-roller') {
		return {
			ok: false,
			issue:
				'Pass the film around the lower tension guide before anchoring it onto the take-up spool.'
		};
	}
	if (route[4] !== 'takeup-spool' || route.length !== PROJECTOR_REQUIRED_ROUTE.length) {
		return {
			ok: false,
			issue: 'Finish threading by anchoring the film leader onto the lower take-up spool hub.'
		};
	}
	return {
		ok: true,
		issue:
			'The new belt grips firmly and the film glides smoothly through the upper roller, gate, drive sprocket, tension guide, and take-up spool.'
	};
}

export function deriveRadioJobStatus(current: JobStatus, state: RadioState): JobStatus {
	if (current === 'not_started' || current === 'returned') return current;
	if (
		state.verifiedClosedWorking &&
		state.speakerConnectorSeated &&
		state.batteryClipSeated &&
		!state.coverOpen &&
		state.screwsRemoved === 0 &&
		state.stationTuned
	) {
		return 'tested';
	}
	if (state.speakerConnectorSeated && state.batteryClipSeated) {
		return 'repaired';
	}
	if (state.closedTestRun || state.inspectedParts.includes('speaker-connector')) {
		return 'inspected';
	}
	return 'accepted';
}

export function deriveClockJobStatus(current: JobStatus, state: ClockState): JobStatus {
	if (current === 'not_started' || current === 'returned') return current;
	const trace = traceClockGearTrain(state.gearPlacements);
	if (
		state.verifiedWorking &&
		trace.reachesHands &&
		!state.backOpen &&
		state.screwsRemoved === 0 &&
		state.handsSet
	) {
		return 'tested';
	}
	if (trace.reachesHands && state.mechanismTested) {
		return 'repaired';
	}
	if (state.backOpen || state.inputTurned || state.inspected) {
		return 'inspected';
	}
	return 'accepted';
}

export function deriveProjectorJobStatus(current: JobStatus, state: ProjectorState): JobStatus {
	if (current === 'not_started' || current === 'returned') return current;
	const routeCheck = diagnoseProjectorRoute(state.beltState, state.threadedGuides);
	if (
		state.verifiedWorking &&
		routeCheck.ok &&
		!state.coverOpen &&
		state.poweredTransportVerified &&
		state.focusLocked
	) {
		return 'tested';
	}
	if (routeCheck.ok && state.manualCheckPassed) {
		return 'repaired';
	}
	if (state.coverOpen || state.inspected) {
		return 'inspected';
	}
	return 'accepted';
}

// --- Radio Actions ---

export function toggleRadioPower(state: RadioState): RadioState {
	const nextPower = !state.powerOn;
	if (nextPower && !state.batteryClipSeated) {
		return {
			...state,
			powerOn: true,
			lastFeedback:
				'Switched on, but neither light nor speaker responds because the battery pack is unclipped in the tray.'
		};
	}
	if (nextPower && !state.speakerConnectorSeated) {
		return {
			...state,
			powerOn: true,
			lastFeedback: state.coverOpen
				? 'Power light glows steadily, while the loose speaker lug crackles and drops out. Switch off before handling internal leads.'
				: 'The red power light comes on steadily. Run “Test & tilt radio” to check Bapi’s symptom.'
		};
	}
	if (nextPower && state.speakerConnectorSeated) {
		const tuned = isRadioTuned(state.tuningDial);
		const closedComplete = !state.coverOpen && state.screwsRemoved === 0;
		return {
			...state,
			powerOn: true,
			stationTuned: tuned,
			verifiedClosedWorking: state.verifiedClosedWorking || (closedComplete && tuned),
			lastFeedback: closedComplete
				? tuned
					? 'Steady power light and clear afternoon broadcast — even when the case moves.'
					: 'Steady power light and warm carrier hum! Turn the tuning dial until the station locks in clearly.'
				: 'The speaker holds steady now! Switch off, replace the back cover and both screws, then run the closed test.'
		};
	}
	return {
		...state,
		powerOn: false,
		lastFeedback: 'Switched radio power off. Safe to open or close the casing.'
	};
}

export function runRadioClosedTest(state: RadioState): RadioState {
	if (state.coverOpen || state.screwsRemoved > 0) {
		return {
			...state,
			lastFeedback:
				'Refit the back cover and fasten both brass screws before running a proper closed-case check.'
		};
	}
	if (!state.powerOn) {
		return {
			...state,
			lastFeedback:
				'Switch the radio on first so you can observe the power light and sound together.'
		};
	}
	if (!state.batteryClipSeated) {
		return {
			...state,
			lastFeedback: 'No power reaches the lamp or speaker while the batteries are disconnected.'
		};
	}
	if (!state.speakerConnectorSeated) {
		return {
			...state,
			closedTestRun: true,
			closedTestSawCutout: true,
			lastFeedback:
				'Evidence observed: The red power light stays steadily lit while you tilt the radio, yet the audio cuts out completely. Battery supply is healthy — check the internal speaker connection with the power off.'
		};
	}
	const tuned = isRadioTuned(state.tuningDial);
	return {
		...state,
		closedTestRun: true,
		stationTuned: tuned,
		verifiedClosedWorking: tuned,
		lastFeedback: tuned
			? 'Closed-case test passed: the power light stays bright, the afternoon music holds rock-steady when tilted, and the station is tuned cleanly. Ready to return to Bapi.'
			: 'Good news: tilting the case no longer cuts the audio! Now turn the tuning dial gently until a clear station locks in.'
	};
}

export function unscrewRadioBack(state: RadioState): RadioState {
	if (state.powerOn) {
		return {
			...state,
			lastFeedback: 'Switch the radio off before unscrewing the back cover.'
		};
	}
	if (!state.closedTestRun) {
		return {
			...state,
			lastFeedback:
				'Switch the radio on and run a brief closed-case test first so you see Bapi’s exact symptom before opening it.'
		};
	}
	if (state.screwsRemoved >= 2) {
		return {
			...state,
			selectedPart: 'back-cover',
			lastFeedback: 'Both brass screws are already in the bench tray. Lift off the back cover.'
		};
	}
	const nextCount = state.screwsRemoved + 1;
	return {
		...state,
		screwsRemoved: nextCount,
		selectedPart: nextCount === 2 ? 'back-cover' : 'back-screws',
		lastFeedback:
			nextCount === 1
				? 'First brass screw placed in the bench tray. One screw remains.'
				: 'Both back screws are safely in the bench tray. You can open the back cover now.'
	};
}

export function fastenRadioBackScrew(state: RadioState): RadioState {
	if (state.coverOpen) {
		return {
			...state,
			lastFeedback: 'Place the back cover onto the radio before fastening the brass screws.'
		};
	}
	if (state.screwsRemoved <= 0) {
		return {
			...state,
			lastFeedback: 'Both back screws are already fastened.'
		};
	}
	const nextCount = state.screwsRemoved - 1;
	return {
		...state,
		screwsRemoved: nextCount,
		lastFeedback:
			nextCount === 1
				? 'Fastened one brass screw from the tray. Fasten the second screw to secure the case.'
				: 'Back cover fastened snugly. Switch the radio on to test and tune a station.'
	};
}

export function toggleRadioBackCover(state: RadioState): RadioState {
	if (!state.coverOpen) {
		if (state.powerOn) {
			return {
				...state,
				lastFeedback: 'Switch the radio off before opening the back cover.'
			};
		}
		if (!state.closedTestRun) {
			return {
				...state,
				lastFeedback:
					'Run a quick closed-case test first so you can compare the symptom with what you find inside.'
			};
		}
		if (state.screwsRemoved < 2) {
			return {
				...state,
				selectedPart: 'back-screws',
				lastFeedback: 'Unscrew both brass screws before lifting the back cover.'
			};
		}
		return {
			...state,
			coverOpen: true,
			selectedPart: null,
			lastFeedback:
				'Back cover lifted and set aside. Inspect the batteries, circuit board, tuning vanes, and speaker leads.'
		};
	}

	if (!state.batteryClipSeated) {
		return {
			...state,
			lastFeedback:
				'The D-cell battery holder is still unclipped in the bench tray — clip it back in before closing the cover.'
		};
	}

	return {
		...state,
		coverOpen: false,
		selectedPart: 'back-screws',
		lastFeedback: 'Back cover seated flush. Fasten the two brass screws from the bench tray.'
	};
}

export function inspectRadioComponent(state: RadioState, part: RadioComponentId): RadioState {
	if (!state.coverOpen && part !== 'back-screws' && part !== 'back-cover') {
		return {
			...state,
			selectedPart: part,
			lastFeedback: 'Open the back cover first to inspect the internal components.'
		};
	}
	const inspectedParts = state.inspectedParts.includes(part)
		? state.inspectedParts
		: [...state.inspectedParts, part];

	let message = '';
	switch (part) {
		case 'back-screws':
			message =
				state.screwsRemoved === 2
					? 'Both slotted brass screws are resting in your bench tray.'
					: `${2 - state.screwsRemoved} slotted brass screw(s) currently hold the back cover.`;
			break;
		case 'back-cover':
			message = state.coverOpen
				? 'Vented walnut-and-cream back cover resting beside the tray.'
				: 'Vented back cover protecting the chassis.';
			break;
		case 'battery-pack':
			message = state.batteryClipSeated
				? 'Two fresh 1.5V D-cells sit tight against clean brass springs. That matches the steady power light you saw.'
				: 'The battery holder is unclipped in the tray — clip it back in so power reaches the board.';
			break;
		case 'tuning-capacitor':
			message =
				'Air-spaced brass tuning vanes and braided dial cord move smoothly together. Nothing here is cutting out on movement.';
			break;
		case 'power-board':
			message =
				'Clean resin solder joints run from the power switch to the indicator lamp. No cracked trace or burnt resistor.';
			break;
		case 'speaker-connector':
			message = state.speakerConnectorSeated
				? 'The brass spade connector is now pushed firmly onto the speaker terminal.'
				: 'This connector is loose. One brass spade lug has worked halfway off the speaker terminal — the slightest nudge breaks audio contact.';
			break;
	}

	return {
		...state,
		selectedPart: part,
		inspectedParts,
		lastFeedback: message
	};
}

export function toggleRadioBatteryClip(state: RadioState): RadioState {
	if (!state.coverOpen) {
		return { ...state, lastFeedback: 'Open the back cover before touching the battery holder.' };
	}
	if (state.powerOn) {
		return { ...state, lastFeedback: 'Switch the radio off before disconnecting battery leads.' };
	}
	const next = !state.batteryClipSeated;
	return {
		...state,
		batteryClipSeated: next,
		verifiedClosedWorking: false,
		lastFeedback: next
			? 'Battery holder clipped back into place cleanly.'
			: 'Unclipped the battery holder into the tray. Remember the power light was steady, so the cells themselves were not the fault.'
	};
}

export function seatRadioSpeakerConnector(state: RadioState): RadioState {
	if (!state.coverOpen) {
		return {
			...state,
			lastFeedback: 'Open the back cover to reach the speaker terminal.'
		};
	}
	if (state.powerOn) {
		return {
			...state,
			lastFeedback: 'Switch the radio off first so the speaker doesn’t pop while seating the lug.'
		};
	}
	if (!state.inspectedParts.includes('speaker-connector')) {
		return inspectRadioComponent(state, 'speaker-connector');
	}
	if (state.speakerConnectorSeated) {
		return {
			...state,
			selectedPart: 'speaker-connector',
			lastFeedback: 'The speaker spade connector is already seated firmly on its terminal.'
		};
	}
	return {
		...state,
		selectedPart: 'speaker-connector',
		speakerConnectorSeated: true,
		lastFeedback:
			'Pushed the brass spade connector squarely onto the speaker lug with a firm click. Close the back cover, fasten both screws, and test it.'
	};
}

export function setRadioTuningDial(state: RadioState, value: number): RadioState {
	const clamped = Math.max(0, Math.min(100, Math.round(value)));
	const tuned = isRadioTuned(clamped);
	const closedComplete =
		!state.coverOpen &&
		state.screwsRemoved === 0 &&
		state.powerOn &&
		state.batteryClipSeated &&
		state.speakerConnectorSeated;

	let feedback = `Tuning dial at ${(550 + clamped * 10.5).toFixed(0)} kHz.`;
	if (!state.powerOn) {
		feedback = `${feedback} Switch the radio on to hear and read the signal meter.`;
	} else if (!state.speakerConnectorSeated) {
		feedback = `${feedback} The loose speaker connection still cuts the audio.`;
	} else if (tuned && closedComplete) {
		feedback = `Signal locked cleanly at ${(550 + clamped * 10.5).toFixed(0)} kHz: warm afternoon melodies and cricket scores, steady even when moved. Ready to return to Bapi!`;
	} else if (tuned) {
		feedback = `Strong station signal at ${(550 + clamped * 10.5).toFixed(0)} kHz — close and screw the back cover shut to finish verification.`;
	} else {
		const direction = clamped < RADIO_TUNING_SWEET_SPOT.min ? 'higher' : 'lower';
		feedback = `${feedback} Gentle band hiss — sweep slightly ${direction} on the dial.`;
	}

	return {
		...state,
		tuningDial: clamped,
		stationTuned: state.powerOn && state.speakerConnectorSeated && tuned,
		verifiedClosedWorking: state.verifiedClosedWorking || (closedComplete && tuned),
		lastFeedback: feedback
	};
}

// --- Clock Actions ---

export function unscrewClockBack(state: ClockState): ClockState {
	if (state.screwsRemoved >= 2) {
		return {
			...state,
			selectedPart: 'back-plate',
			lastFeedback: 'Both knurled thumbscrews are in the tray. Lift off the brass back plate.'
		};
	}
	const next = state.screwsRemoved + 1;
	return {
		...state,
		screwsRemoved: next,
		selectedPart: next === 2 ? 'back-plate' : 'thumbscrews',
		lastFeedback:
			next === 1
				? 'Unscrewed one knurled brass thumbscrew into the tray.'
				: 'Both thumbscrews are in the bench tray. Open the brass back plate to see the movement.'
	};
}

export function fastenClockBackScrew(state: ClockState): ClockState {
	if (state.backOpen) {
		return {
			...state,
			lastFeedback: 'Close the brass back plate before fastening the thumbscrews.'
		};
	}
	if (state.screwsRemoved <= 0) {
		return { ...state, lastFeedback: 'Both thumbscrews are already snug.' };
	}
	const next = state.screwsRemoved - 1;
	const trace = traceClockGearTrain(state.gearPlacements);
	const ready = next === 0 && trace.reachesHands && state.mechanismTested && state.handsSet;
	return {
		...state,
		screwsRemoved: next,
		verifiedWorking: state.verifiedWorking || ready,
		lastFeedback:
			next === 1
				? 'Fastened the first knurled thumbscrew.'
				: ready
					? 'Back plate secured and hands ticking accurately around 4:30. Ready to return to Mala Sen!'
					: 'Back plate secured. Use the hand-setting knob to set the clock near 4:30 for Mala.'
	};
}

export function toggleClockBackPlate(state: ClockState): ClockState {
	if (!state.backOpen) {
		if (state.screwsRemoved < 2) {
			return {
				...state,
				selectedPart: 'thumbscrews',
				lastFeedback: 'Unfasten both knurled brass thumbscrews first.'
			};
		}
		return {
			...state,
			backOpen: true,
			inspected: true,
			selectedPart: null,
			lastFeedback:
				'Opened the brass back plate. Turn the winding key slowly to see where motion stops along the three arbors.'
		};
	}

	const trayGear = (['gear-large', 'gear-medium', 'gear-small'] as const).find(
		(g) => state.gearPlacements[g] === 'tray'
	);
	if (trayGear) {
		return {
			...state,
			lastFeedback: `${CLOCK_GEARS[trayGear].label} is still sitting in your bench tray — place all three wheels onto the arbors before closing the case.`
		};
	}
	const trace = traceClockGearTrain(state.gearPlacements);
	if (!trace.reachesHands) {
		return {
			...state,
			lastFeedback: `The hands still will not turn if you close it now: ${trace.explanation}`
		};
	}
	if (!state.mechanismTested) {
		return {
			...state,
			lastFeedback:
				'Turn the input winding key once to verify the full gear train ticks smoothly before closing the back.'
		};
	}

	return {
		...state,
		backOpen: false,
		selectedGearForPlacement: null,
		selectedPart: 'thumbscrews',
		lastFeedback:
			'Closed the brass back plate over the ticking movement. Fasten both thumbscrews and set the hands near 4:30.'
	};
}

export function turnClockInput(state: ClockState): ClockState {
	if (!state.backOpen) {
		const trace = traceClockGearTrain(state.gearPlacements);
		if (trace.reachesHands && state.screwsRemoved === 0 && state.handsSet) {
			return {
				...state,
				inputTurned: true,
				mechanismTested: true,
				verifiedWorking: true,
				lastFeedback:
					'A crisp, steady tick-tock! Both hands advance smoothly from 4:30. Ready to return to Sen Brothers.'
			};
		}
		return {
			...state,
			inputTurned: true,
			lastFeedback: trace.reachesHands
				? 'The movement ticks inside! Fasten any remaining thumbscrews and set the hands near 4:30.'
				: 'You wind the key half a turn: the spring takes tension, yet the hands on the dial remain still. Open the back plate to inspect the gears.'
		};
	}

	const trace = traceClockGearTrain(state.gearPlacements);
	return {
		...state,
		inspected: true,
		inputTurned: true,
		mechanismTested: trace.reachesHands,
		lastFeedback: trace.explanation
	};
}

export function selectClockGear(state: ClockState, gearId: ClockGearId | null): ClockState {
	if (!state.backOpen) {
		return {
			...state,
			lastFeedback: 'Open the brass back plate to rearrange the gears.'
		};
	}
	if (!gearId) {
		return {
			...state,
			selectedGearForPlacement: null,
			selectedPart: null,
			lastFeedback: 'Cleared gear selection.'
		};
	}
	const currentSlot = state.gearPlacements[gearId];
	return {
		...state,
		selectedPart: gearId,
		selectedGearForPlacement: gearId,
		lastFeedback: `Selected ${CLOCK_GEARS[gearId].label} (${CLOCK_GEARS[gearId].shapeCue}), currently in ${currentSlot === 'tray' ? 'the bench tray' : CLOCK_GEOMETRY[currentSlot].label}. Choose a shaft or move it to the tray.`
	};
}

export function placeClockGear(
	state: ClockState,
	gearId: ClockGearId,
	targetSlot: ClockSlotId
): ClockState {
	if (!state.backOpen) {
		return {
			...state,
			lastFeedback: 'Open the brass back plate before moving gears.'
		};
	}
	const previousSlot = state.gearPlacements[gearId];
	if (previousSlot === targetSlot) {
		return {
			...state,
			selectedGearForPlacement: null,
			lastFeedback: `${CLOCK_GEARS[gearId].shortLabel} is already in ${targetSlot === 'tray' ? 'the bench tray' : CLOCK_GEOMETRY[targetSlot].label}.`
		};
	}

	const nextPlacements = { ...state.gearPlacements };
	let displacedNote = '';

	if (targetSlot !== 'tray') {
		const occupant = gearOnShaft(state.gearPlacements, targetSlot);
		if (occupant && occupant !== gearId) {
			nextPlacements[occupant] = previousSlot;
			displacedNote =
				previousSlot === 'tray'
					? ` Moved ${CLOCK_GEARS[occupant].shortLabel} into the bench tray.`
					: ` Swapped with ${CLOCK_GEARS[occupant].shortLabel}.`;
		}
	}
	nextPlacements[gearId] = targetSlot;

	const trace = traceClockGearTrain(nextPlacements);
	let placementFeedback =
		targetSlot === 'tray'
			? `Placed ${CLOCK_GEARS[gearId].label} into the bench tray.`
			: `Fitted ${CLOCK_GEARS[gearId].label} onto ${CLOCK_GEOMETRY[targetSlot].label}.${displacedNote}`;

	if (trace.jammedAt) {
		placementFeedback += ` Note: ${trace.explanation}`;
	} else if (trace.reachesHands) {
		placementFeedback +=
			' All three arbors now look cleanly bridged! Turn the winding key slowly to test the motion.';
	}

	return {
		...state,
		inspected: true,
		gearPlacements: nextPlacements,
		mechanismTested: false,
		verifiedWorking: false,
		selectedPart: gearId,
		selectedGearForPlacement: null,
		lastFeedback: placementFeedback
	};
}

export function setClockHandsMinutes(state: ClockState, minutes: number): ClockState {
	const normalized = ((Math.round(minutes) % 720) + 720) % 720;
	const trace = traceClockGearTrain(state.gearPlacements);
	const onTarget = isClockHandsOnTarget(normalized);
	const closedReady =
		!state.backOpen && state.screwsRemoved === 0 && trace.reachesHands && state.mechanismTested;

	const timeLabel = formatClockMinutes(normalized);
	let feedback = `Hands set to ${timeLabel}.`;
	if (!trace.reachesHands || !state.mechanismTested) {
		feedback = `${feedback} Repair and test the internal gear train first so the clock can keep time.`;
	} else if (state.backOpen || state.screwsRemoved > 0) {
		feedback = `${feedback} Close the brass back plate and fasten both thumbscrews to finish.`;
	} else if (onTarget) {
		feedback = `Hands set to ${timeLabel} — right around Mala’s 4:30 mark, with a steady escapement tick! Ready to return to Sen Brothers.`;
	} else {
		feedback = `${feedback} Mala asked for roughly half past four (4:30) before the afternoon rush.`;
	}

	return {
		...state,
		handsMinutes: normalized,
		handsSet: onTarget,
		verifiedWorking: closedReady && onTarget,
		lastFeedback: feedback
	};
}

// --- Projector Actions ---

export function toggleProjectorPower(state: ProjectorState): ProjectorState {
	const nextPower = !state.powerOn;
	if (nextPower && state.coverOpen) {
		return {
			...state,
			powerOn: false,
			lastFeedback: 'Close the side mechanism cover before switching the lamp and motor on.'
		};
	}
	if (!nextPower) {
		return {
			...state,
			powerOn: false,
			lastFeedback:
				'Switched projector off. Safe to open the side cover and handle the belt or film.'
		};
	}

	const check = diagnoseProjectorRoute(state.beltState, state.threadedGuides);
	if (!check.ok || !state.manualCheckPassed) {
		return {
			...state,
			powerOn: true,
			poweredTransportVerified: false,
			verifiedWorking: false,
			lastFeedback: !check.ok
				? `The projection lamp glows, but transport fails: ${check.issue} Switch off and inspect inside.`
				: 'Switch off, open the cover briefly, and run the manual hand-wheel check once so you know the film will not snag under power.'
		};
	}

	const focused = isProjectorFocused(state.focusDial);
	return {
		...state,
		powerOn: true,
		poweredTransportVerified: true,
		focusLocked: focused,
		verifiedWorking: focused,
		lastFeedback: focused
			? 'Lamp bright, reels turning smoothly, and the Kusumtala test card is pin-sharp! Ready to carry to the courtyard.'
			: 'The new belt and film loop run smoothly! Now turn the brass focus barrel until the test card lines and lettering are crisp.'
	};
}

export function toggleProjectorCover(state: ProjectorState): ProjectorState {
	if (!state.coverOpen) {
		if (state.powerOn) {
			return {
				...state,
				lastFeedback: 'Switch the projector off before unlatching the side mechanism cover.'
			};
		}
		return {
			...state,
			coverOpen: true,
			inspected: true,
			lastFeedback:
				'Side mechanism cover swung open. Examine the drive belt on the lower pulleys and the film path past the lens gate.'
		};
	}

	const check = diagnoseProjectorRoute(state.beltState, state.threadedGuides);
	if (!check.ok) {
		return {
			...state,
			lastFeedback: `Not ready to close yet: ${check.issue}`
		};
	}
	if (!state.manualCheckPassed) {
		return {
			...state,
			lastFeedback:
				'Turn the hand-wheel manually once before closing the cover to be sure the film advances without snagging.'
		};
	}

	return {
		...state,
		coverOpen: false,
		selectedPart: 'focus-barrel',
		lastFeedback:
			'Latched the side cover shut. Switch the projector on and focus the test card on the bench target.'
	};
}

export function inspectProjectorComponent(
	state: ProjectorState,
	part: ProjectorComponentId
): ProjectorState {
	if (!state.coverOpen && part !== 'side-cover' && part !== 'focus-barrel') {
		return {
			...state,
			selectedPart: part,
			lastFeedback: 'Switch off and open the side cover to inspect the internal transport.'
		};
	}

	let feedback = '';
	switch (part) {
		case 'side-cover':
			feedback = state.coverOpen
				? 'Cast-aluminium side cover resting open on its hinge.'
				: 'Latched side cover shielding the belt and rollers.';
			break;
		case 'drive-belt':
			feedback =
				state.beltState === 'worn'
					? 'This rubber belt is perished and slack — the brass motor pulley spins inside it without driving the reel.'
					: state.beltState === 'removed'
						? 'The pulleys are bare. Fit the square-section spare rubber belt over both brass pulleys.'
						: 'Fresh square-section rubber belt tensioned cleanly across the motor and reel pulleys.';
			break;
		case 'lamp-housing':
			feedback =
				'The 50W projection bulb and condenser lens are clean and intact — Ruma was right that illumination works.';
			break;
		case 'top-roller':
			feedback =
				'Step 1 in the film path: upper guide roller that aligns film leaving the supply spool above the gate.';
			break;
		case 'film-gate':
			feedback =
				'Step 2 in the film path: polished chrome aperture gate directly between the condenser lamp and lens.';
			break;
		case 'sprocket-wheel':
			feedback =
				'Step 3 in the film path: toothed brass drive sprocket below the gate that pulls each perforation steadily.';
			break;
		case 'snubber-roller':
			feedback =
				'Step 4 in the film path: sprung lower tension roller smoothing the loop before the take-up spool.';
			break;
		case 'takeup-spool':
			feedback =
				'Step 5 in the film path: lower take-up spool hub that winds projected film neatly.';
			break;
		case 'focus-barrel':
			feedback =
				'Knurled brass projection lens barrel. Once transport runs under power, rotate it until the test card sharpens.';
			break;
	}

	return {
		...state,
		inspected: true,
		selectedPart: part,
		lastFeedback: feedback
	};
}

export function removeWornProjectorBelt(state: ProjectorState): ProjectorState {
	if (!state.coverOpen || state.powerOn) {
		return {
			...state,
			lastFeedback: 'Switch off and open the side cover before removing the belt.'
		};
	}
	if (state.beltState !== 'worn') {
		return {
			...state,
			lastFeedback:
				state.beltState === 'removed'
					? 'The perished belt is already set aside in your bench tray.'
					: 'The new spare drive belt is already fitted.'
		};
	}
	return {
		...state,
		inspected: true,
		beltState: 'removed',
		manualCheckPassed: false,
		poweredTransportVerified: false,
		verifiedWorking: false,
		selectedPart: 'drive-belt',
		lastFeedback:
			'Slipped the stretched, perished belt off the pulleys into the bench tray. Fit a firm replacement belt.'
	};
}

export function fitSpareProjectorBelt(
	state: ProjectorState,
	hasSpareBelt: boolean
): ProjectorState {
	if (!state.coverOpen || state.powerOn) {
		return {
			...state,
			lastFeedback: 'Switch off and open the side cover to fit the drive belt.'
		};
	}
	if (state.beltState === 'worn') {
		return {
			...state,
			selectedPart: 'drive-belt',
			lastFeedback: 'Remove the slack perished belt from the pulleys first.'
		};
	}
	if (state.beltState === 'spare_fitted') {
		return {
			...state,
			lastFeedback: 'The fresh spare rubber belt is already seated tautly on both pulleys.'
		};
	}
	if (!hasSpareBelt) {
		return {
			...state,
			selectedPart: 'drive-belt',
			lastFeedback:
				'You do not have a replacement belt on the bench yet. Check the labelled Rubber Belts drawer or ask Bapi at the tea stall — he mentioned keeping an old cassette-repair tin.'
		};
	}
	return {
		...state,
		beltState: 'spare_fitted',
		manualCheckPassed: false,
		selectedPart: 'drive-belt',
		lastFeedback:
			'Stretched the fresh rubber belt from Bapi’s tin over the motor and reel pulleys — snug, even tension! Now check the film threading path.'
	};
}

export function threadProjectorGuide(
	state: ProjectorState,
	guide: ProjectorGuideId
): ProjectorState {
	if (!state.coverOpen || state.powerOn) {
		return {
			...state,
			lastFeedback: 'Switch off and open the side cover before threading film.'
		};
	}
	if (state.threadedGuides.includes(guide)) {
		return {
			...state,
			selectedPart: guide,
			lastFeedback: `The film already passes ${guideLabel(guide)}. Use “Undo last guide” or “Rewind film leader” if you want to reroute it.`
		};
	}

	const nextRoute = [...state.threadedGuides, guide];
	return {
		...state,
		inspected: true,
		threadedGuides: nextRoute,
		manualCheckPassed: false,
		poweredTransportVerified: false,
		verifiedWorking: false,
		selectedPart: guide,
		lastFeedback: `Threaded film leader through ${guideLabel(guide)} (${nextRoute.length} of ${PROJECTOR_REQUIRED_ROUTE.length} guides). Turn the hand-wheel manually whenever you want to test the path.`
	};
}

export function unthreadLastProjectorGuide(state: ProjectorState): ProjectorState {
	if (!state.coverOpen || state.powerOn) {
		return {
			...state,
			lastFeedback: 'Switch off and open the side cover before adjusting the film.'
		};
	}
	if (state.threadedGuides.length === 0) {
		return {
			...state,
			lastFeedback: 'The film leader is already back at the upper supply spool.'
		};
	}
	const removed = state.threadedGuides[state.threadedGuides.length - 1];
	const nextRoute = state.threadedGuides.slice(0, -1);
	return {
		...state,
		threadedGuides: nextRoute,
		manualCheckPassed: false,
		poweredTransportVerified: false,
		verifiedWorking: false,
		lastFeedback: `Gently lifted the film off ${guideLabel(removed)} without creasing a perforation.`
	};
}

export function rewindProjectorLeader(state: ProjectorState): ProjectorState {
	if (!state.coverOpen || state.powerOn) {
		return {
			...state,
			lastFeedback: 'Switch off and open the side cover before rewinding the leader.'
		};
	}
	return {
		...state,
		threadedGuides: [],
		manualCheckPassed: false,
		poweredTransportVerified: false,
		verifiedWorking: false,
		lastFeedback:
			'Wound the film leader cleanly back onto the upper supply spool. Ready to thread from Step 1 (Upper guide roller).'
	};
}

export function manualAdvanceProjector(state: ProjectorState): ProjectorState {
	if (!state.coverOpen || state.powerOn) {
		return {
			...state,
			lastFeedback: 'Open the side cover with power off to turn the hand-wheel manually.'
		};
	}
	const check = diagnoseProjectorRoute(state.beltState, state.threadedGuides);
	return {
		...state,
		inspected: true,
		manualCheckPassed: check.ok,
		lastFeedback: check.ok
			? `Manual turn passed: ${check.issue} Close the side cover to run a powered lamp and focus test.`
			: `Manual turn check: ${check.issue}`
	};
}

export function setProjectorFocus(state: ProjectorState, value: number): ProjectorState {
	const clamped = Math.max(0, Math.min(100, Math.round(value)));
	const focused = isProjectorFocused(clamped);
	if (!state.powerOn || state.coverOpen || !state.poweredTransportVerified) {
		return {
			...state,
			focusDial: clamped,
			focusLocked: false,
			lastFeedback:
				'Lens barrel turned, though you need the side cover closed and the projector running on the bench test card to judge sharpness.'
		};
	}
	const sharpnessPct = Math.round(projectorFocusSharpness(clamped) * 100);
	return {
		...state,
		focusDial: clamped,
		focusLocked: focused,
		verifiedWorking: focused,
		lastFeedback: focused
			? `Focus locked (${sharpnessPct}% crisp): the Kusumtala Film Club test rings and corner crosshairs are razor-sharp! Ready to carry to Ruma in the courtyard.`
			: clamped < PROJECTOR_FOCUS_SWEET_SPOT.min
				? `Test card edges are still soft (${sharpnessPct}% clarity) — turn the brass lens barrel forward slightly.`
				: `Slightly past optimal focal plane (${sharpnessPct}% clarity) — ease the lens barrel back a touch.`
	};
}

export function guideLabel(guide: ProjectorGuideId): string {
	switch (guide) {
		case 'top-roller':
			return 'Upper guide roller';
		case 'film-gate':
			return 'Aperture gate';
		case 'sprocket-wheel':
			return 'Toothed drive sprocket';
		case 'snubber-roller':
			return 'Lower tension guide';
		case 'takeup-spool':
			return 'Take-up spool hub';
	}
}

export function getBenchTrayItems(
	job: JobId,
	radio: RadioState,
	clock: ClockState,
	projector: ProjectorState,
	unlocks: NeighbourhoodUnlocks
): BenchTrayItem[] {
	const items: BenchTrayItem[] = [];
	if (job === 'radio') {
		for (let i = 0; i < radio.screwsRemoved; i += 1) {
			items.push({
				id: `radio-screw-${i + 1}`,
				label: `Brass back screw #${i + 1}`,
				kind: 'screw',
				actionLabel: !radio.coverOpen ? 'Fasten screw' : undefined
			});
		}
		if (radio.coverOpen) {
			items.push({
				id: 'radio-cover',
				label: 'Vented back cover',
				kind: 'cover',
				actionLabel: radio.batteryClipSeated ? 'Close cover' : undefined
			});
		}
		if (!radio.batteryClipSeated) {
			items.push({
				id: 'radio-batteries',
				label: '2 × 1.5V D-cell pack',
				kind: 'battery',
				actionLabel: radio.coverOpen && !radio.powerOn ? 'Clip batteries in' : undefined
			});
		}
	} else if (job === 'clock') {
		for (let i = 0; i < clock.screwsRemoved; i += 1) {
			items.push({
				id: `clock-screw-${i + 1}`,
				label: `Knurled thumbscrew #${i + 1}`,
				kind: 'screw',
				actionLabel: !clock.backOpen ? 'Fasten screw' : undefined
			});
		}
		if (clock.backOpen) {
			items.push({
				id: 'clock-back',
				label: 'Brass movement cover',
				kind: 'cover',
				actionLabel: clock.mechanismTested ? 'Close cover' : undefined
			});
		}
		for (const gearId of ['gear-large', 'gear-medium', 'gear-small'] as const) {
			if (clock.gearPlacements[gearId] === 'tray') {
				items.push({
					id: gearId,
					label: CLOCK_GEARS[gearId].label,
					kind: 'gear',
					actionLabel: clock.backOpen ? 'Select gear' : undefined
				});
			}
		}
	} else if (job === 'projector') {
		if (projector.beltState !== 'worn') {
			items.push({
				id: 'perished-belt',
				label: 'Perished old belt (set aside)',
				kind: 'belt'
			});
		}
		if (unlocks.spareBeltInDrawer && projector.beltState !== 'spare_fitted') {
			items.push({
				id: 'spare-belt',
				label: 'Fresh square rubber belt (from Bapi)',
				kind: 'belt',
				actionLabel:
					projector.coverOpen && !projector.powerOn && projector.beltState === 'removed'
						? 'Fit belt'
						: undefined
			});
		}
	}
	return items;
}

export function getActiveToolForJob(
	job: JobId,
	radio: RadioState,
	clock: ClockState,
	projector: ProjectorState
): { name: string; purpose: string } {
	if (job === 'radio') {
		if (!radio.coverOpen) {
			return {
				name: 'Brass flathead screwdriver',
				purpose: 'Within reach for the two slotted back-cover screws.'
			};
		}
		return {
			name: 'Insulated brass tweezers',
			purpose: 'Ready for checking battery springs and seating spade terminals cleanly.'
		};
	}
	if (job === 'clock') {
		if (!clock.backOpen) {
			return {
				name: 'Brass winding & hand key',
				purpose: 'Within reach for testing spring input and setting the dial hands.'
			};
		}
		return {
			name: 'Clockmaker’s brass tweezers & key',
			purpose: 'Ready for lifting wheels between arbors and turning the barrel slowly.'
		};
	}
	if (projector.coverOpen) {
		return {
			name: 'Belt hook & smooth film guide stick',
			purpose: 'Within reach for slipping rubber belts onto pulleys and threading perforations.'
		};
	}
	return {
		name: 'Lens cloth & focus gauge card',
		purpose: 'Set up in front of the projector to bring the test frame into crisp focus.'
	};
}

export function getRepairHint(
	job: JobId,
	radio: RadioState,
	clock: ClockState,
	projector: ProjectorState,
	level: 1 | 2 | 3,
	unlocks: NeighbourhoodUnlocks
): string {
	if (job === 'radio') {
		if (!radio.closedTestRun) {
			if (level === 1)
				return 'Listen to what stays working versus what cuts out before opening the case.';
			if (level === 2)
				return 'Check the power switch and run the closed-case tilt test on the bench.';
			return 'Press “Switch power on”, then press “Test & tilt radio” to record the symptom.';
		}
		if (!radio.speakerConnectorSeated) {
			if (!radio.coverOpen) {
				if (level === 1)
					return 'Now that you saw the power light stay steady, the fault must be inside along the speaker path.';
				if (level === 2)
					return 'Make sure power is off, then remove both back-cover screws and open the cover.';
				return 'Switch power off if on, press “Unscrew back screw” twice, then press “Open back cover”.';
			}
			if (level === 1)
				return 'Since the red lamp never flickered, battery power is healthy — follow the wires going to the speaker cone.';
			if (level === 2) return 'Examine the brass speaker connector on the round speaker terminal.';
			return 'Select “Speaker connector” to inspect it, then press “Seat speaker connector firmly”.';
		}
		if (!radio.batteryClipSeated) {
			if (level === 1) return 'Something you unclipped earlier is still resting in the bench tray.';
			if (level === 2) return 'Look at the D-cell battery holder in the tray.';
			return 'Press “Clip batteries back in” so power reaches the radio again.';
		}
		if (radio.coverOpen || radio.screwsRemoved > 0) {
			if (level === 1)
				return 'The internal connection is sound now; put the casing back together so you can test it properly.';
			if (level === 2)
				return 'Close the vented back cover and fasten both brass screws from the tray.';
			return 'Switch power off if needed, press “Close back cover”, then press “Fasten screw” twice.';
		}
		if (level === 1)
			return 'A repaired radio still needs a clear afternoon broadcast before going back to the tea stall.';
		if (level === 2)
			return 'Switch the radio on and sweep the tuning dial near the middle-upper band.';
		return 'Switch power on, move the Tuning Dial slider into 64–76 (~1250–1320 kHz), and run “Test & tilt radio”.';
	}

	if (job === 'clock') {
		const trace = traceClockGearTrain(clock.gearPlacements);
		if (!clock.backOpen && !trace.reachesHands) {
			if (level === 1)
				return 'The spring winds fine from outside, so the break in motion is hidden behind the brass plate.';
			if (level === 2) return 'Unfasten the two knurled thumbscrews on the back of the clock.';
			return 'Press “Unscrew thumbscrew” twice, then press “Open back plate”.';
		}
		if (!trace.reachesHands) {
			if (level === 1)
				return 'Watch the gaps between the shafts: larger distances need wider wheels, and the tight gap near the hands needs the smallest pinion.';
			if (level === 2)
				return 'Shaft 1 is widest from the mainspring, Shaft 2 sits in the middle, and Shaft 3 sits close beside the hands wheel.';
			return 'Place Large 3-spoke wheel on Shaft 1, Medium 4-hole wheel on Shaft 2, and Small solid pinion on Shaft 3, then press “Turn winding key slowly”.';
		}
		if (!clock.mechanismTested) {
			if (level === 1)
				return 'The wheels look well aligned — give the input a slow turn to see if motion reaches the hands.';
			if (level === 2) return 'Use the winding key test while the back is open.';
			return 'Press “Turn winding key slowly” to verify all wheels mesh cleanly.';
		}
		if (clock.backOpen || clock.screwsRemoved > 0) {
			if (level === 1)
				return 'The gear train ticks right through to the hands; button up the brass case next.';
			if (level === 2)
				return 'Close the back plate and tighten both knurled thumbscrews from the tray.';
			return 'Press “Close back plate”, then press “Fasten thumbscrew” twice.';
		}
		if (level === 1)
			return 'Mala wanted the clock set near the afternoon school rush before it goes back on her shelf.';
		if (level === 2)
			return 'Use the hand-setting control on the front dial to set the time near half past four.';
		return 'Adjust “Set clock hands” to 4:30 (between 4:20 and 4:40).';
	}

	// Projector
	const routeCheck = diagnoseProjectorRoute(projector.beltState, projector.threadedGuides);
	if (!projector.coverOpen && (!routeCheck.ok || !projector.manualCheckPassed)) {
		if (level === 1)
			return 'The lamp works, so the fault lies inside the side transport compartment.';
		if (level === 2)
			return 'Make sure power is switched off, then unlatch the side mechanism cover.';
		return 'Switch power off if on, then press “Open side cover”.';
	}
	if (projector.beltState !== 'spare_fitted') {
		if (!unlocks.spareBeltInDrawer) {
			if (level === 1)
				return 'The old rubber belt has stretched loose, and your shop’s belt drawer was empty earlier.';
			if (level === 2)
				return 'Step outside to Bapi’s tea stall — after getting his radio back, he remembers an old tin of rubber belts.';
			return 'Press “Step back from bench”, walk to Bapi at the tea stall (or check the Rubber Belts drawer), and ask him about spare rubber belts.';
		}
		if (level === 1)
			return 'Swap the slack perished belt on the lower pulleys for the firm square belt from Bapi’s tin.';
		if (level === 2) return 'Examine the drive belt pulleys at the bottom of the projector.';
		return 'Remove the perished belt if still on the pulleys, then press “Fit spare belt from Bapi”.';
	}
	if (!routeCheck.ok || !projector.manualCheckPassed) {
		if (level === 1)
			return 'Follow the film naturally from top to bottom: align above the lens, pass between lamp and lens, engage the toothed sprocket, smooth the tension, then wind onto the lower spool.';
		if (level === 2)
			return 'Rewind the film leader so you can thread all five guides in clean top-to-bottom order, then test with the hand-wheel.';
		return 'Press “Rewind film leader”, then thread: 1) Upper guide roller → 2) Aperture gate → 3) Toothed drive sprocket → 4) Lower tension guide → 5) Take-up spool hub. Then press “Turn mechanism manually”.';
	}
	if (projector.coverOpen) {
		if (level === 1)
			return 'Both belt and film path ran smoothly by hand — close up the housing so you can run the lamp.';
		if (level === 2) return 'Latch the cast side cover before switching power on.';
		return 'Press “Close side cover”, then press “Switch projector on”.';
	}
	if (!projector.powerOn) {
		if (level === 1)
			return 'With the cover latched, run the projector under power to check the projected frame.';
		if (level === 2) return 'Use the projector power switch and watch the test card on the bench.';
		return 'Press “Switch projector on”, then adjust the Focus Barrel slider until the test card is crisp.';
	}
	if (level === 1)
		return 'Watch the concentric rings and lettering on the bench test card as you turn the brass lens barrel.';
	if (level === 2) return 'Ease the Focus Barrel near the middle-upper range until clarity peaks.';
	return 'Move the “Focus lens barrel” slider into 55–63 until the test card reads crisp.';
}
