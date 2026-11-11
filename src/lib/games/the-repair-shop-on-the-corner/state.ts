import { buildCharacterDialogue, createInitialCharacterMemories } from './characters';
import {
	createInitialClockState,
	createInitialProjectorState,
	createInitialRadioState,
	deriveClockJobStatus,
	deriveProjectorJobStatus,
	deriveRadioJobStatus
} from './repairs';
import type {
	AfternoonPhase,
	CharacterId,
	JobId,
	JobStatus,
	NearbyPrompt,
	NeighbourhoodUnlocks,
	RepairShopGameState,
	Vec2,
	WorkbenchCameraPreset
} from './types';
import {
	KEY_PLACES,
	SAFE_SPAWN_POS,
	clampToWalkable,
	distance2D,
	findWalkPath,
	getCharacterWorldPosition
} from './world';

export const SCREENING_DURATION_SECONDS = 36;

export function createInitialUnlocks(): NeighbourhoodUnlocks {
	return {
		teaStallRadioPlaying: false,
		spareBeltDiscovered: false,
		spareBeltInDrawer: false,
		shopClockTicking: false,
		courtyardChairsPlaced: false,
		projectorAtCourtyard: false,
		screeningStarted: false,
		screeningCompleted: false
	};
}

export function createInitialGameState(): RepairShopGameState {
	return {
		mode: 'explore',
		afternoonPhase: 'early_afternoon',
		playerPos: { ...SAFE_SPAWN_POS },
		playerHeading: 0,
		walkTarget: null,
		walkPath: [],
		jobs: {
			radio: 'not_started',
			clock: 'not_started',
			projector: 'not_started'
		},
		radio: createInitialRadioState(),
		clock: createInitialClockState(),
		projector: createInitialProjectorState(),
		characters: createInitialCharacterMemories(),
		unlocks: createInitialUnlocks(),
		workbench: null,
		activeDialogue: null,
		drawerMessage: null,
		screeningElapsedSeconds: 0,
		statusCaption:
			'Your rolling shutter is up for the afternoon. Bapi from the tea stall is waiting at the doorway.'
	};
}

export function deriveAfternoonPhase(
	jobs: Record<JobId, JobStatus>,
	unlocks: NeighbourhoodUnlocks
): AfternoonPhase {
	const returnedCount = (['radio', 'clock', 'projector'] as const).filter(
		(id) => jobs[id] === 'returned'
	).length;

	if (returnedCount < 3) {
		if (returnedCount === 0) return 'early_afternoon';
		if (returnedCount === 1) return 'mid_afternoon';
		return 'golden_hour';
	}

	if (unlocks.screeningCompleted) return 'afterglow';
	if (unlocks.screeningStarted) return 'screening';
	return 'evening_ready';
}

export function syncDerivedState(state: RepairShopGameState): RepairShopGameState {
	const jobs: Record<JobId, JobStatus> = {
		radio: deriveRadioJobStatus(state.jobs.radio, state.radio),
		clock: deriveClockJobStatus(state.jobs.clock, state.clock),
		projector: deriveProjectorJobStatus(state.jobs.projector, state.projector)
	};

	const unlocks: NeighbourhoodUnlocks = {
		...state.unlocks,
		teaStallRadioPlaying: jobs.radio === 'returned',
		shopClockTicking: jobs.clock === 'returned',
		courtyardChairsPlaced: jobs.clock === 'returned',
		projectorAtCourtyard: jobs.projector === 'returned'
	};

	const afternoonPhase = deriveAfternoonPhase(jobs, unlocks);

	return {
		...state,
		jobs,
		unlocks,
		afternoonPhase
	};
}

export function getActiveBenchJobs(jobs: Record<JobId, JobStatus>): JobId[] {
	return (['radio', 'clock', 'projector'] as const).filter(
		(id) => jobs[id] !== 'not_started' && jobs[id] !== 'returned'
	);
}

export function deriveCurrentObjective(state: RepairShopGameState): string {
	const { jobs, unlocks, afternoonPhase } = state;

	if (jobs.radio === 'not_started') {
		return 'Speak with Bapi at the shop doorway about his portable radio.';
	}
	if (jobs.radio === 'tested') {
		return 'Carry the working radio down the lane to Bapi’s tea stall.';
	}
	if (jobs.radio !== 'returned') {
		return 'Diagnose, repair, and tune Bapi’s portable radio on the workbench.';
	}

	// Radio is returned! Check tested items ready to return first
	if (jobs.clock === 'tested') {
		return 'Return the ticking wind-up clock to Mala at Sen Brothers next door.';
	}
	if (jobs.projector === 'tested') {
		return 'Carry the focused film projector to Ruma in the shared courtyard.';
	}

	// Check if player needs the spare belt for an open projector repair
	if (
		jobs.projector !== 'not_started' &&
		jobs.projector !== 'returned' &&
		state.projector.coverOpen &&
		state.projector.beltState !== 'spare_fitted' &&
		!unlocks.spareBeltInDrawer
	) {
		return 'Ask Bapi at the tea stall about a spare rubber drive belt for the projector.';
	}

	const activeOnBench = getActiveBenchJobs(jobs);
	if (activeOnBench.length > 0) {
		const names: Record<JobId, string> = {
			radio: 'portable radio',
			clock: 'wind-up clock',
			projector: 'film projector'
		};
		return `Repair and test the ${names[activeOnBench[0]]} at the shop workbench.`;
	}

	if (jobs.clock === 'not_started' && jobs.projector === 'not_started') {
		return 'Visit Mala at Sen Brothers next door or Ruma in the courtyard for the next job.';
	}
	if (jobs.clock === 'not_started') {
		return 'Speak with Mala at the Sen Brothers counter next door about her wind-up clock.';
	}
	if (jobs.projector === 'not_started') {
		return 'Speak with Ruma in the courtyard about the evening film projector.';
	}

	if (afternoonPhase === 'evening_ready') {
		return 'Step up to the courtyard projector table to start the evening film screening.';
	}
	if (afternoonPhase === 'screening') {
		return 'Enjoy the courtyard screening with the neighbours (or press Finish Screening anytime).';
	}
	return 'Evening on Kusumtala Lane — explore the neighbourhood or replay the courtyard projector.';
}

export function openWorkbenchForJob(
	state: RepairShopGameState,
	preferredJob?: JobId
): RepairShopGameState {
	const available = getActiveBenchJobs(state.jobs);
	if (available.length === 0) {
		return {
			...state,
			mode: 'explore',
			workbench: null,
			statusCaption:
				'Your workbench mat is clear right now. Speak with a neighbour to accept an object that needs attention.'
		};
	}
	const activeJob = preferredJob && available.includes(preferredJob) ? preferredJob : available[0];
	const defaultPreset: WorkbenchCameraPreset =
		activeJob === 'radio' && !state.radio.closedTestRun ? 'front' : 'inside';

	return {
		...state,
		mode: 'workbench',
		walkTarget: null,
		walkPath: [],
		activeDialogue: null,
		drawerMessage: null,
		workbench: workbenchPresetView(activeJob, defaultPreset)
	};
}

export function workbenchPresetView(
	activeJob: JobId,
	preset: WorkbenchCameraPreset
): NonNullable<RepairShopGameState['workbench']> {
	switch (preset) {
		case 'front':
			return { activeJob, yawOffset: 0, pitchOffset: 0.06, zoom: 1.0, preset };
		case 'inside':
			return {
				activeJob,
				yawOffset: activeJob === 'projector' ? 0.12 : Math.PI,
				pitchOffset: 0.1,
				zoom: 1.08,
				preset
			};
		case 'detail':
			return {
				activeJob,
				yawOffset: activeJob === 'projector' ? 0.08 : Math.PI * 0.96,
				pitchOffset: 0.04,
				zoom: 1.3,
				preset
			};
		case 'angle':
			return { activeJob, yawOffset: 0.52, pitchOffset: 0.18, zoom: 0.96, preset };
	}
}

export function openCharacterConversation(
	rawState: RepairShopGameState,
	speakerId: CharacterId
): RepairShopGameState {
	const state = syncDerivedState(rawState);
	const nextCharacters = {
		...state.characters,
		[speakerId]: {
			...state.characters[speakerId],
			met: true
		}
	};
	const nextState: RepairShopGameState = {
		...state,
		mode: 'dialogue',
		walkTarget: null,
		walkPath: [],
		drawerMessage: null,
		characters: nextCharacters
	};
	return {
		...nextState,
		activeDialogue: buildCharacterDialogue(speakerId, nextState, 'root')
	};
}

export function applyDialogueChoice(
	state: RepairShopGameState,
	choiceId: string
): RepairShopGameState {
	const dialogue = state.activeDialogue;
	if (!dialogue) return state;
	const speaker = dialogue.speakerId;

	if (choiceId === 'close') {
		return {
			...state,
			mode: 'explore',
			activeDialogue: null
		};
	}

	if (choiceId === 'clarify' || choiceId === 'ask-belt' || choiceId === 'report-fault') {
		const updatedMem = {
			...state.characters[speaker],
			symptomClarified: choiceId === 'clarify' ? true : state.characters[speaker].symptomClarified,
			faultDiscoveredNoted:
				choiceId === 'report-fault' ? true : state.characters[speaker].faultDiscoveredNoted
		};
		const nextState: RepairShopGameState = {
			...state,
			characters: {
				...state.characters,
				[speaker]: updatedMem
			}
		};
		return {
			...nextState,
			activeDialogue: buildCharacterDialogue(speaker, nextState, choiceId)
		};
	}

	if (choiceId === 'accept-radio' && state.jobs.radio === 'not_started') {
		const next = syncDerivedState({
			...state,
			mode: 'workbench',
			playerPos: { ...KEY_PLACES.workbench },
			playerHeading: Math.PI,
			activeDialogue: null,
			jobs: { ...state.jobs, radio: 'accepted' },
			characters: {
				...state.characters,
				bapi: { ...state.characters.bapi, met: true, jobAccepted: true }
			},
			workbench: workbenchPresetView('radio', 'front'),
			statusCaption:
				'Placed Bapi’s portable radio on the bench mat. Switch it on and run a closed-case test first.'
		});
		return next;
	}

	if (choiceId === 'accept-clock' && state.jobs.clock === 'not_started') {
		const next = syncDerivedState({
			...state,
			mode: 'workbench',
			playerPos: { ...KEY_PLACES.workbench },
			playerHeading: Math.PI,
			activeDialogue: null,
			jobs: { ...state.jobs, clock: 'accepted' },
			characters: {
				...state.characters,
				mala: { ...state.characters.mala, met: true, jobAccepted: true }
			},
			workbench: workbenchPresetView('clock', 'inside'),
			statusCaption:
				'Set Mala’s brass-bezel clock under the bench lamp. Open the back plate to inspect the gears.'
		});
		return next;
	}

	if (choiceId === 'accept-projector' && state.jobs.projector === 'not_started') {
		const next = syncDerivedState({
			...state,
			mode: 'workbench',
			playerPos: { ...KEY_PLACES.workbench },
			playerHeading: Math.PI,
			activeDialogue: null,
			jobs: { ...state.jobs, projector: 'accepted' },
			characters: {
				...state.characters,
				ruma: { ...state.characters.ruma, met: true, jobAccepted: true }
			},
			workbench: workbenchPresetView('projector', 'inside'),
			statusCaption:
				'Set Ruma’s 8mm film projector on the bench. Open the side cover to inspect the belt and film guides.'
		});
		return next;
	}

	if (choiceId === 'return-radio' && state.jobs.radio === 'tested') {
		return syncDerivedState({
			...state,
			mode: 'explore',
			activeDialogue: null,
			jobs: { ...state.jobs, radio: 'returned' },
			characters: {
				...state.characters,
				bapi: {
					...state.characters.bapi,
					objectReturned: true
				}
			},
			statusCaption:
				'Bapi set the radio beside his kettle — afternoon music drifts quietly across the tea stall. Mala next door and Ruma in the courtyard are ready when you are.'
		});
	}

	if (choiceId === 'take-belt' && state.jobs.radio === 'returned') {
		return syncDerivedState({
			...state,
			mode: 'explore',
			activeDialogue: null,
			characters: {
				...state.characters,
				bapi: {
					...state.characters.bapi,
					practicalHelpOffered: true
				}
			},
			unlocks: {
				...state.unlocks,
				spareBeltDiscovered: true,
				spareBeltInDrawer: true
			},
			statusCaption:
				'Received Haripada’s tin of square rubber drive belts from Bapi. They are ready in your shop tray and drawer.'
		});
	}

	if (choiceId === 'return-clock' && state.jobs.clock === 'tested') {
		return syncDerivedState({
			...state,
			mode: 'explore',
			activeDialogue: null,
			jobs: { ...state.jobs, clock: 'returned' },
			characters: {
				...state.characters,
				mala: {
					...state.characters.mala,
					objectReturned: true,
					practicalHelpOffered: true
				}
			},
			statusCaption:
				'Mala hung the ticking clock behind Sen Brothers’ counter and sent four folding chairs into the courtyard.'
		});
	}

	if (choiceId === 'return-projector' && state.jobs.projector === 'tested') {
		const next = syncDerivedState({
			...state,
			mode: 'explore',
			activeDialogue: null,
			jobs: { ...state.jobs, projector: 'returned' },
			characters: {
				...state.characters,
				ruma: {
					...state.characters.ruma,
					objectReturned: true,
					practicalHelpOffered: true
				}
			},
			statusCaption:
				state.jobs.clock === 'returned'
					? 'Placed the repaired projector on the courtyard table. Step up to the table whenever you want to start the evening film!'
					: 'Placed the repaired projector on the courtyard table. Once Mala’s clock is returned too, everyone can gather for the film.'
		});
		return next;
	}

	if (choiceId === 'start-screening') {
		return startCourtyardScreening(state);
	}

	return state;
}

export function inspectPartsDrawer(state: RepairShopGameState): RepairShopGameState {
	const hasBelt = state.unlocks.spareBeltInDrawer;
	const message = hasBelt
		? 'Labelled wooden drawers: Brass screws (stocked), Contact springs (stocked), Felt pads (stocked), Rubber drive belts (Haripada’s tin from Bapi — stocked and ready).'
		: state.jobs.radio === 'returned'
			? 'Labelled wooden drawers: Brass screws, springs, and felt pads are full. “Rubber drive belts” is empty — a note inside says Bapi at the tea stall kept Haripada’s belt tin.'
			: 'Labelled wooden drawers: Brass screws, contact springs, fuse wire, and felt pads neatly sorted. “Rubber drive belts” is currently empty.';

	return {
		...state,
		mode: 'drawer',
		walkTarget: null,
		walkPath: [],
		activeDialogue: null,
		unlocks: {
			...state.unlocks,
			spareBeltDiscovered: true
		},
		drawerMessage: message,
		statusCaption: message
	};
}

export function startCourtyardScreening(state: RepairShopGameState): RepairShopGameState {
	if (
		state.jobs.radio !== 'returned' ||
		state.jobs.clock !== 'returned' ||
		state.jobs.projector !== 'returned'
	) {
		return {
			...state,
			statusCaption:
				'Finish and return all three neighbourhood repairs before starting the evening courtyard screening.'
		};
	}

	const unlocks: NeighbourhoodUnlocks = {
		...state.unlocks,
		screeningStarted: true,
		screeningCompleted: false
	};

	return syncDerivedState({
		...state,
		mode: 'screening',
		playerPos: { ...KEY_PLACES.courtyardTable },
		playerHeading: 0,
		walkTarget: null,
		walkPath: [],
		activeDialogue: null,
		drawerMessage: null,
		workbench: null,
		unlocks,
		screeningElapsedSeconds: 0,
		statusCaption:
			'The projector shutter purrs to life, throwing warm afternoon-memory frames across the courtyard cloth while the lane gathers.'
	});
}

export function finishCourtyardScreening(state: RepairShopGameState): RepairShopGameState {
	if (!state.unlocks.screeningStarted) return state;
	const unlocks: NeighbourhoodUnlocks = {
		...state.unlocks,
		screeningCompleted: true
	};
	return syncDerivedState({
		...state,
		mode: 'explore',
		unlocks,
		statusCaption:
			'First chapter complete. The reel loops gently in the courtyard — stay and explore Kusumtala Lane as long as you like.'
	});
}

export function resetSingleRepair(state: RepairShopGameState, job: JobId): RepairShopGameState {
	const currentStatus = state.jobs[job];
	if (currentStatus === 'not_started' || currentStatus === 'returned') {
		return state;
	}

	if (job === 'radio') {
		return syncDerivedState({
			...state,
			jobs: { ...state.jobs, radio: 'accepted' },
			radio: createInitialRadioState(),
			workbench:
				state.mode === 'workbench' ? workbenchPresetView('radio', 'front') : state.workbench,
			statusCaption: 'Reset the portable radio repair back to its initial state on the workbench.'
		});
	}
	if (job === 'clock') {
		return syncDerivedState({
			...state,
			jobs: { ...state.jobs, clock: 'accepted' },
			clock: createInitialClockState(),
			workbench:
				state.mode === 'workbench' ? workbenchPresetView('clock', 'inside') : state.workbench,
			statusCaption: 'Reset the wind-up clock back to its initial state on the workbench.'
		});
	}
	return syncDerivedState({
		...state,
		jobs: { ...state.jobs, projector: 'accepted' },
		projector: createInitialProjectorState(),
		workbench:
			state.mode === 'workbench' ? workbenchPresetView('projector', 'inside') : state.workbench,
		statusCaption: 'Reset the film projector back to its initial state on the workbench.'
	});
}

export function getNearbyPrompts(state: RepairShopGameState): NearbyPrompt[] {
	const prompts: NearbyPrompt[] = [];
	const player = state.playerPos;
	const reach = 2.55;

	// Workbench
	const benchJobs = getActiveBenchJobs(state.jobs);
	const benchDist = distance2D(player, KEY_PLACES.workbench);
	prompts.push({
		id: 'workbench',
		label: benchJobs.length > 0 ? `Inspect ${benchJobs[0]} on workbench` : 'Inspect workbench',
		sublabel:
			benchJobs.length > 0
				? `${benchJobs.length} active job${benchJobs.length > 1 ? 's' : ''} under task lamp`
				: 'Bench mat ready for repairs',
		kind: 'workbench',
		position: KEY_PLACES.workbench,
		distanceMetres: benchDist,
		inReach: benchDist <= reach
	});

	// Spare-parts drawers
	const drawerDist = distance2D(player, KEY_PLACES.drawers);
	prompts.push({
		id: 'drawers',
		label: 'Check labelled parts drawers',
		sublabel: state.unlocks.spareBeltInDrawer
			? 'Screws, springs, felt & Bapi’s rubber belts'
			: 'Brass screws, springs, fuse wire & belt drawer',
		kind: 'drawer',
		position: KEY_PLACES.drawers,
		distanceMetres: drawerDist,
		inReach: drawerDist <= reach
	});

	// Courtyard projector table when ready for screening or replay
	if (state.unlocks.projectorAtCourtyard) {
		const tableDist = distance2D(player, KEY_PLACES.courtyardTable);
		const allReady =
			state.jobs.radio === 'returned' &&
			state.jobs.clock === 'returned' &&
			state.jobs.projector === 'returned';
		prompts.push({
			id: 'courtyard-screening',
			label: state.unlocks.screeningCompleted
				? 'Replay courtyard film screening'
				: allReady
					? 'Start courtyard film screening'
					: 'Inspect projector on courtyard table',
			sublabel: allReady
				? 'All three repairs complete · Neighbours gathered'
				: 'Waiting on remaining neighbourhood repair',
			kind: 'courtyard',
			position: KEY_PLACES.courtyardTable,
			distanceMetres: tableDist,
			inReach: tableDist <= reach + 0.25
		});
	}

	// Characters
	for (const charId of ['bapi', 'mala', 'ruma', 'nikhil', 'sabita'] as const) {
		const charPlacement = getCharacterWorldPosition(charId, state);
		const d = distance2D(player, charPlacement.interactStandPos);
		const rawDist = Math.min(d, distance2D(player, charPlacement.pos));
		let actionLabel: string;
		let sub: string;

		if (charId === 'bapi') {
			actionLabel =
				state.jobs.radio === 'tested'
					? 'Return radio to Bapi'
					: state.jobs.radio === 'not_started'
						? 'Talk to Bapi (Portable radio)'
						: !state.unlocks.spareBeltInDrawer && state.jobs.radio === 'returned'
							? 'Ask Bapi about rubber belts'
							: 'Speak with Bapi';
			sub = state.jobs.radio === 'not_started' ? 'At your shop doorway' : 'Bapi’s Tea Stall';
		} else if (charId === 'mala') {
			actionLabel =
				state.jobs.clock === 'tested'
					? 'Return clock to Mala'
					: state.jobs.clock === 'not_started' && state.jobs.radio === 'returned'
						? 'Talk to Mala (Wind-up clock)'
						: 'Speak with Mala Sen';
			sub = 'Sen Brothers Counter';
		} else if (charId === 'ruma') {
			actionLabel =
				state.jobs.projector === 'tested'
					? 'Return projector to Ruma'
					: state.jobs.projector === 'not_started' && state.jobs.radio === 'returned'
						? 'Talk to Ruma (Film projector)'
						: 'Speak with Ruma';
			sub = 'Shared Courtyard';
		} else if (charId === 'nikhil') {
			actionLabel = 'Greet Nikhil-babu';
			sub = 'Lane verandah';
		} else {
			actionLabel = 'Greet Sabita';
			sub = 'Courtyard plants';
		}

		prompts.push({
			id: `char:${charId}`,
			label: actionLabel,
			sublabel: sub,
			kind: 'character',
			position: charPlacement.interactStandPos,
			distanceMetres: rawDist,
			inReach: rawDist <= reach + 0.35
		});
	}

	return prompts.sort((a, b) => a.distanceMetres - b.distanceMetres);
}

export function setWalkDestination(state: RepairShopGameState, target: Vec2): RepairShopGameState {
	const clampedTarget = clampToWalkable(target, state.playerPos);
	const path = findWalkPath(state.playerPos, clampedTarget);
	return {
		...state,
		mode: 'explore',
		activeDialogue: null,
		drawerMessage: null,
		walkTarget: path.length > 0 ? path[path.length - 1] : null,
		walkPath: path
	};
}
