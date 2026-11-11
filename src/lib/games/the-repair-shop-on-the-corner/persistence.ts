import { createInitialCharacterMemories } from './characters';
import {
	PROJECTOR_REQUIRED_ROUTE,
	createInitialClockState,
	createInitialProjectorState,
	createInitialRadioState
} from './repairs';
import {
	createInitialGameState,
	createInitialUnlocks,
	getActiveBenchJobs,
	syncDerivedState,
	workbenchPresetView
} from './state';
import type {
	CharacterId,
	CharacterMemory,
	ClockGearId,
	ClockSlotId,
	ClockState,
	JobId,
	JobStatus,
	NeighbourhoodUnlocks,
	ProjectorGuideId,
	ProjectorState,
	RadioComponentId,
	RadioState,
	RepairShopGameState,
	RepairShopSettings
} from './types';
import { KEY_PLACES, SAFE_SPAWN_POS, clampToWalkable } from './world';

export const SAVE_STORAGE_KEY = 'the-repair-shop-on-the-corner.save.v1';
export const SETTINGS_STORAGE_KEY = 'the-repair-shop-on-the-corner.settings.v1';
export const SAVE_FORMAT_VERSION = 1;

export const DEFAULT_REPAIR_SHOP_SETTINGS: RepairShopSettings = {
	soundEnabled: false,
	masterVolume: 0.72,
	reducedMotion: false,
	highContrastLabels: false
};

export type SavedRepairShopEnvelope = {
	version: number;
	savedAtIso: string;
	playerPos: { x: number; z: number };
	playerHeading: number;
	resumeWorkbenchJob: JobId | null;
	jobs: Record<JobId, JobStatus>;
	returnedObjects: JobId[];
	radio: RadioState;
	clock: ClockState;
	projector: ProjectorState;
	characters: Record<CharacterId, CharacterMemory>;
	unlocks: NeighbourhoodUnlocks;
	settings: RepairShopSettings;
};

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

const VALID_JOB_STATUSES = new Set<JobStatus>([
	'not_started',
	'accepted',
	'inspected',
	'repaired',
	'tested',
	'returned'
]);

const VALID_RADIO_PARTS = new Set<RadioComponentId>([
	'back-screws',
	'back-cover',
	'battery-pack',
	'tuning-capacitor',
	'power-board',
	'speaker-connector'
]);

const VALID_CLOCK_SLOTS = new Set<ClockSlotId>(['shaft-1', 'shaft-2', 'shaft-3', 'tray']);
const VALID_PROJECTOR_GUIDES = new Set<ProjectorGuideId>(PROJECTOR_REQUIRED_ROUTE);

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number, min?: number, max?: number): number {
	const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
	const lo = min !== undefined ? Math.max(min, n) : n;
	return max !== undefined ? Math.min(max, lo) : lo;
}

function bool(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

export function sanitizeSettings(raw: unknown, prefersReducedMotion = false): RepairShopSettings {
	const base: RepairShopSettings = {
		...DEFAULT_REPAIR_SHOP_SETTINGS,
		reducedMotion: prefersReducedMotion
	};
	if (!isRecord(raw)) return base;
	return {
		soundEnabled: bool(raw.soundEnabled, base.soundEnabled),
		masterVolume: finiteNumber(raw.masterVolume, base.masterVolume, 0, 1),
		reducedMotion: bool(raw.reducedMotion, base.reducedMotion),
		highContrastLabels: bool(raw.highContrastLabels, base.highContrastLabels)
	};
}

function sanitizeRadio(raw: unknown): RadioState {
	const def = createInitialRadioState();
	if (!isRecord(raw)) return def;

	const inspectedParts = Array.isArray(raw.inspectedParts)
		? raw.inspectedParts.filter(
				(p): p is RadioComponentId =>
					typeof p === 'string' && VALID_RADIO_PARTS.has(p as RadioComponentId)
			)
		: def.inspectedParts;

	const screwsRemoved = Math.round(finiteNumber(raw.screwsRemoved, def.screwsRemoved, 0, 2));
	const coverOpen = screwsRemoved === 2 ? bool(raw.coverOpen, def.coverOpen) : false;
	const hintRaw = Math.round(finiteNumber(raw.hintLevel, 0, 0, 3)) as 0 | 1 | 2 | 3;

	return {
		powerOn: bool(raw.powerOn, def.powerOn),
		closedTestRun: bool(raw.closedTestRun, def.closedTestRun),
		closedTestSawCutout: bool(raw.closedTestSawCutout, def.closedTestSawCutout),
		screwsRemoved,
		coverOpen,
		inspectedParts: [...new Set(inspectedParts)],
		batteryClipSeated: bool(raw.batteryClipSeated, def.batteryClipSeated),
		speakerConnectorSeated: bool(raw.speakerConnectorSeated, def.speakerConnectorSeated),
		tuningDial: Math.round(finiteNumber(raw.tuningDial, def.tuningDial, 0, 100)),
		stationTuned: bool(raw.stationTuned, def.stationTuned),
		verifiedClosedWorking: bool(raw.verifiedClosedWorking, def.verifiedClosedWorking),
		selectedPart: null,
		hintLevel: hintRaw,
		lastFeedback:
			typeof raw.lastFeedback === 'string' && raw.lastFeedback.trim()
				? raw.lastFeedback.slice(0, 320)
				: def.lastFeedback
	};
}

function sanitizeClock(raw: unknown): ClockState {
	const def = createInitialClockState();
	if (!isRecord(raw)) return def;

	const screwsRemoved = Math.round(finiteNumber(raw.screwsRemoved, def.screwsRemoved, 0, 2));
	const backOpen = screwsRemoved === 2 ? bool(raw.backOpen, def.backOpen) : false;

	let gearPlacements = { ...def.gearPlacements };
	if (isRecord(raw.gearPlacements)) {
		const candidate: Record<ClockGearId, ClockSlotId> = {
			'gear-large': VALID_CLOCK_SLOTS.has(raw.gearPlacements['gear-large'] as ClockSlotId)
				? (raw.gearPlacements['gear-large'] as ClockSlotId)
				: 'tray',
			'gear-medium': VALID_CLOCK_SLOTS.has(raw.gearPlacements['gear-medium'] as ClockSlotId)
				? (raw.gearPlacements['gear-medium'] as ClockSlotId)
				: 'tray',
			'gear-small': VALID_CLOCK_SLOTS.has(raw.gearPlacements['gear-small'] as ClockSlotId)
				? (raw.gearPlacements['gear-small'] as ClockSlotId)
				: 'tray'
		};
		// Guard against malformed saves placing two gears on the same shaft
		const occupiedShafts = new Set<string>();
		for (const g of ['gear-large', 'gear-medium', 'gear-small'] as const) {
			const slot = candidate[g];
			if (slot !== 'tray') {
				if (occupiedShafts.has(slot)) {
					candidate[g] = 'tray';
				} else {
					occupiedShafts.add(slot);
				}
			}
		}
		gearPlacements = candidate;
	}

	const hintRaw = Math.round(finiteNumber(raw.hintLevel, 0, 0, 3)) as 0 | 1 | 2 | 3;

	return {
		screwsRemoved,
		backOpen,
		inspected: bool(raw.inspected, def.inspected),
		inputTurned: bool(raw.inputTurned, def.inputTurned),
		gearPlacements,
		mechanismTested: bool(raw.mechanismTested, def.mechanismTested),
		handsMinutes:
			((Math.round(finiteNumber(raw.handsMinutes, def.handsMinutes)) % 720) + 720) % 720,
		handsSet: bool(raw.handsSet, def.handsSet),
		verifiedWorking: bool(raw.verifiedWorking, def.verifiedWorking),
		selectedPart: null,
		selectedGearForPlacement: null,
		hintLevel: hintRaw,
		lastFeedback:
			typeof raw.lastFeedback === 'string' && raw.lastFeedback.trim()
				? raw.lastFeedback.slice(0, 320)
				: def.lastFeedback
	};
}

function sanitizeProjector(raw: unknown): ProjectorState {
	const def = createInitialProjectorState();
	if (!isRecord(raw)) return def;

	const beltState =
		raw.beltState === 'worn' || raw.beltState === 'removed' || raw.beltState === 'spare_fitted'
			? raw.beltState
			: def.beltState;

	const threadedGuides: ProjectorGuideId[] = [];
	if (Array.isArray(raw.threadedGuides)) {
		for (const item of raw.threadedGuides) {
			if (
				typeof item === 'string' &&
				VALID_PROJECTOR_GUIDES.has(item as ProjectorGuideId) &&
				!threadedGuides.includes(item as ProjectorGuideId)
			) {
				threadedGuides.push(item as ProjectorGuideId);
			}
		}
	} else {
		threadedGuides.push(...def.threadedGuides);
	}

	const coverOpen = bool(raw.coverOpen, def.coverOpen);
	const powerOn = coverOpen ? false : bool(raw.powerOn, def.powerOn);
	const hintRaw = Math.round(finiteNumber(raw.hintLevel, 0, 0, 3)) as 0 | 1 | 2 | 3;

	return {
		powerOn,
		coverOpen,
		inspected: bool(raw.inspected, def.inspected),
		beltState,
		threadedGuides,
		manualCheckPassed: bool(raw.manualCheckPassed, def.manualCheckPassed),
		poweredTransportVerified: bool(raw.poweredTransportVerified, def.poweredTransportVerified),
		focusDial: Math.round(finiteNumber(raw.focusDial, def.focusDial, 0, 100)),
		focusLocked: bool(raw.focusLocked, def.focusLocked),
		verifiedWorking: bool(raw.verifiedWorking, def.verifiedWorking),
		selectedPart: null,
		hintLevel: hintRaw,
		lastFeedback:
			typeof raw.lastFeedback === 'string' && raw.lastFeedback.trim()
				? raw.lastFeedback.slice(0, 320)
				: def.lastFeedback
	};
}

function sanitizeCharacters(raw: unknown): Record<CharacterId, CharacterMemory> {
	const base = createInitialCharacterMemories();
	if (!isRecord(raw)) return base;
	for (const id of ['bapi', 'mala', 'ruma', 'nikhil', 'sabita'] as const) {
		const entry = raw[id];
		if (!isRecord(entry)) continue;
		base[id] = {
			met: bool(entry.met, false),
			jobAccepted: bool(entry.jobAccepted, false),
			symptomClarified: bool(entry.symptomClarified, false),
			faultDiscoveredNoted: bool(entry.faultDiscoveredNoted, false),
			objectReturned: bool(entry.objectReturned, false),
			practicalHelpOffered: bool(entry.practicalHelpOffered, false)
		};
	}
	return base;
}

function sanitizeUnlocks(raw: unknown): NeighbourhoodUnlocks {
	const base = createInitialUnlocks();
	if (!isRecord(raw)) return base;
	return {
		teaStallRadioPlaying: bool(raw.teaStallRadioPlaying, false),
		spareBeltDiscovered: bool(raw.spareBeltDiscovered, false),
		spareBeltInDrawer: bool(raw.spareBeltInDrawer, false),
		shopClockTicking: bool(raw.shopClockTicking, false),
		courtyardChairsPlaced: bool(raw.courtyardChairsPlaced, false),
		projectorAtCourtyard: bool(raw.projectorAtCourtyard, false),
		screeningStarted: bool(raw.screeningStarted, false),
		screeningCompleted: bool(raw.screeningCompleted, false)
	};
}

export function serializeSaveData(
	state: RepairShopGameState,
	settings: RepairShopSettings
): string {
	const returnedObjects = (['radio', 'clock', 'projector'] as const).filter(
		(id) => state.jobs[id] === 'returned'
	);
	const envelope: SavedRepairShopEnvelope = {
		version: SAVE_FORMAT_VERSION,
		savedAtIso: new Date().toISOString(),
		playerPos: {
			x: Number(state.playerPos.x.toFixed(3)),
			z: Number(state.playerPos.z.toFixed(3))
		},
		playerHeading: Number(state.playerHeading.toFixed(3)),
		resumeWorkbenchJob:
			state.mode === 'workbench' && state.workbench ? state.workbench.activeJob : null,
		jobs: { ...state.jobs },
		returnedObjects,
		radio: state.radio,
		clock: state.clock,
		projector: state.projector,
		characters: state.characters,
		unlocks: state.unlocks,
		settings
	};
	return JSON.stringify(envelope);
}

export type ParseSaveResult =
	| {
			ok: true;
			migrated: boolean;
			state: RepairShopGameState;
			settings: RepairShopSettings;
	  }
	| {
			ok: false;
			reason: 'empty' | 'malformed' | 'unsupported_version';
	  };

export function parseSaveData(
	rawJson: string | null | undefined,
	prefersReducedMotion = false
): ParseSaveResult {
	if (!rawJson || typeof rawJson !== 'string' || !rawJson.trim()) {
		return { ok: false, reason: 'empty' };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(rawJson);
	} catch {
		return { ok: false, reason: 'malformed' };
	}

	if (!isRecord(parsed)) {
		return { ok: false, reason: 'malformed' };
	}

	// Accept version 1, or migrate older version 0 / missing-version draft saves gracefully.
	// Reject unknown future major versions (> SAVE_FORMAT_VERSION) cleanly.
	const version = parsed.version === undefined ? 0 : parsed.version;
	if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
		return { ok: false, reason: 'malformed' };
	}
	if (version > SAVE_FORMAT_VERSION) {
		return { ok: false, reason: 'unsupported_version' };
	}

	const base = createInitialGameState();
	const rawJobs = isRecord(parsed.jobs) ? parsed.jobs : {};
	const returnedList = Array.isArray(parsed.returnedObjects) ? parsed.returnedObjects : [];

	const parseJobStatus = (id: JobId): JobStatus => {
		const val = rawJobs[id];
		if (typeof val === 'string' && VALID_JOB_STATUSES.has(val as JobStatus)) {
			return val as JobStatus;
		}
		if (returnedList.includes(id)) return 'returned';
		return 'not_started';
	};

	const jobs: Record<JobId, JobStatus> = {
		radio: parseJobStatus('radio'),
		clock: parseJobStatus('clock'),
		projector: parseJobStatus('projector')
	};

	const radio = sanitizeRadio(parsed.radio);
	const clock = sanitizeClock(parsed.clock);
	const projector = sanitizeProjector(parsed.projector);
	const characters = sanitizeCharacters(parsed.characters);
	const unlocks = sanitizeUnlocks(parsed.unlocks);

	// Ensure character flags remain coherent with job states
	if (jobs.radio !== 'not_started') characters.bapi.jobAccepted = true;
	if (jobs.radio === 'returned') characters.bapi.objectReturned = true;
	if (jobs.clock !== 'not_started') characters.mala.jobAccepted = true;
	if (jobs.clock === 'returned') {
		characters.mala.objectReturned = true;
		characters.mala.practicalHelpOffered = true;
	}
	if (jobs.projector !== 'not_started') characters.ruma.jobAccepted = true;
	if (jobs.projector === 'returned') {
		characters.ruma.objectReturned = true;
		characters.ruma.practicalHelpOffered = true;
	}
	// If projector already has spare belt fitted, spareBeltInDrawer must have been obtained
	if (projector.beltState === 'spare_fitted') {
		unlocks.spareBeltDiscovered = true;
		unlocks.spareBeltInDrawer = true;
	}

	// Safe player coordinate restoration
	const rawPos = isRecord(parsed.playerPos)
		? {
				x: finiteNumber(parsed.playerPos.x, SAFE_SPAWN_POS.x),
				z: finiteNumber(parsed.playerPos.z, SAFE_SPAWN_POS.z)
			}
		: SAFE_SPAWN_POS;
	const safePos = clampToWalkable(rawPos, SAFE_SPAWN_POS);
	const heading = finiteNumber(parsed.playerHeading, 0, -Math.PI * 2, Math.PI * 2);

	let state: RepairShopGameState = syncDerivedState({
		...base,
		playerPos: safePos,
		playerHeading: heading,
		jobs,
		radio,
		clock,
		projector,
		characters,
		unlocks,
		statusCaption:
			'Welcome back to Kusumtala Corner. Your bench and tools are right where you left them.'
	});

	// If saved during a workbench repair and that job is still active, restore onto the workbench cleanly
	const resumeJob = parsed.resumeWorkbenchJob;
	const activeBench = getActiveBenchJobs(state.jobs);
	if (
		(resumeJob === 'radio' || resumeJob === 'clock' || resumeJob === 'projector') &&
		activeBench.includes(resumeJob)
	) {
		state = {
			...state,
			mode: 'workbench',
			playerPos: { ...KEY_PLACES.workbench },
			workbench: workbenchPresetView(
				resumeJob,
				resumeJob === 'radio' && !state.radio.closedTestRun ? 'front' : 'inside'
			),
			statusCaption: 'Resumed your repair at the workbench.'
		};
	}

	const settings = sanitizeSettings(parsed.settings, prefersReducedMotion);

	return {
		ok: true,
		migrated: version < SAVE_FORMAT_VERSION,
		state,
		settings
	};
}

export function saveToStorage(
	storage: StorageLike | null | undefined,
	state: RepairShopGameState,
	settings: RepairShopSettings
): boolean {
	if (!storage) return false;
	try {
		storage.setItem(SAVE_STORAGE_KEY, serializeSaveData(state, settings));
		storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
		return true;
	} catch {
		return false;
	}
}

export function loadFromStorage(
	storage: StorageLike | null | undefined,
	prefersReducedMotion = false
): {
	hasSave: boolean;
	recoveredFromInvalid: boolean;
	state: RepairShopGameState;
	settings: RepairShopSettings;
} {
	const fallbackSettings = sanitizeSettings(null, prefersReducedMotion);
	if (!storage) {
		return {
			hasSave: false,
			recoveredFromInvalid: false,
			state: createInitialGameState(),
			settings: fallbackSettings
		};
	}

	let storedSettings = fallbackSettings;
	try {
		const rawSettings = storage.getItem(SETTINGS_STORAGE_KEY);
		if (rawSettings) {
			storedSettings = sanitizeSettings(JSON.parse(rawSettings), prefersReducedMotion);
		}
	} catch {
		storedSettings = fallbackSettings;
	}

	let rawSave: string | null;
	try {
		rawSave = storage.getItem(SAVE_STORAGE_KEY);
	} catch {
		return {
			hasSave: false,
			recoveredFromInvalid: false,
			state: createInitialGameState(),
			settings: storedSettings
		};
	}

	const parsed = parseSaveData(rawSave, prefersReducedMotion);
	if (parsed.ok) {
		return {
			hasSave: true,
			recoveredFromInvalid: false,
			state: parsed.state,
			settings: parsed.settings
		};
	}

	return {
		hasSave: false,
		recoveredFromInvalid: parsed.reason === 'malformed' || parsed.reason === 'unsupported_version',
		state: createInitialGameState(),
		settings: storedSettings
	};
}

export function clearSavedProgress(storage: StorageLike | null | undefined): boolean {
	if (!storage) return false;
	try {
		storage.removeItem(SAVE_STORAGE_KEY);
		return true;
	} catch {
		return false;
	}
}
