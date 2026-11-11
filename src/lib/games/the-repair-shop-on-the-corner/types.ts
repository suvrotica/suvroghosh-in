export type JobId = 'radio' | 'clock' | 'projector';

export type JobStatus =
	| 'not_started'
	| 'accepted'
	| 'inspected'
	| 'repaired'
	| 'tested'
	| 'returned';

export type AfternoonPhase =
	| 'early_afternoon'
	| 'mid_afternoon'
	| 'golden_hour'
	| 'evening_ready'
	| 'screening'
	| 'afterglow';

export type PlayMode = 'explore' | 'dialogue' | 'workbench' | 'drawer' | 'screening';

export type CharacterId = 'bapi' | 'mala' | 'ruma' | 'nikhil' | 'sabita';

export type RadioComponentId =
	| 'back-screws'
	| 'back-cover'
	| 'battery-pack'
	| 'tuning-capacitor'
	| 'power-board'
	| 'speaker-connector';

export type RadioState = {
	powerOn: boolean;
	closedTestRun: boolean;
	closedTestSawCutout: boolean;
	screwsRemoved: number; // 0, 1, or 2
	coverOpen: boolean;
	inspectedParts: RadioComponentId[];
	batteryClipSeated: boolean;
	speakerConnectorSeated: boolean;
	/** 0..100 tuning dial; target sweet spot is 64..76 */
	tuningDial: number;
	stationTuned: boolean;
	verifiedClosedWorking: boolean;
	selectedPart: RadioComponentId | null;
	hintLevel: 0 | 1 | 2 | 3;
	lastFeedback: string;
};

export type ClockGearId = 'gear-large' | 'gear-medium' | 'gear-small';
export type ClockShaftId = 'shaft-1' | 'shaft-2' | 'shaft-3';
export type ClockSlotId = ClockShaftId | 'tray';

export type ClockComponentId =
	| 'thumbscrews'
	| 'back-plate'
	| 'mainspring-barrel'
	| 'shaft-1'
	| 'shaft-2'
	| 'shaft-3'
	| 'gear-large'
	| 'gear-medium'
	| 'gear-small'
	| 'hands-arbor';

export type ClockMotionTrace = {
	spinningNodes: ('mainspring' | ClockShaftId | 'hands')[];
	stoppedAt: string | null;
	jammedAt: ClockShaftId | null;
	reachesHands: boolean;
	explanation: string;
};

export type ClockState = {
	screwsRemoved: number; // 0, 1, or 2
	backOpen: boolean;
	inspected: boolean;
	inputTurned: boolean;
	gearPlacements: Record<ClockGearId, ClockSlotId>;
	mechanismTested: boolean;
	/** Minutes past 12:00 (0..719). Target is 4:30 (270 +/- 10 mins) */
	handsMinutes: number;
	handsSet: boolean;
	verifiedWorking: boolean;
	selectedPart: ClockComponentId | null;
	selectedGearForPlacement: ClockGearId | null;
	hintLevel: 0 | 1 | 2 | 3;
	lastFeedback: string;
};

export type ProjectorGuideId =
	| 'top-roller'
	| 'film-gate'
	| 'sprocket-wheel'
	| 'snubber-roller'
	| 'takeup-spool';

export type ProjectorBeltState = 'worn' | 'removed' | 'spare_fitted';

export type ProjectorComponentId =
	| 'side-cover'
	| 'drive-belt'
	| 'lamp-housing'
	| 'top-roller'
	| 'film-gate'
	| 'sprocket-wheel'
	| 'snubber-roller'
	| 'takeup-spool'
	| 'focus-barrel';

export type ProjectorState = {
	powerOn: boolean;
	coverOpen: boolean;
	inspected: boolean;
	beltState: ProjectorBeltState;
	/** Ordered list of guides currently threaded from the supply spool */
	threadedGuides: ProjectorGuideId[];
	manualCheckPassed: boolean;
	poweredTransportVerified: boolean;
	/** 0..100 focus barrel; crisp target is 54..64 */
	focusDial: number;
	focusLocked: boolean;
	verifiedWorking: boolean;
	selectedPart: ProjectorComponentId | null;
	hintLevel: 0 | 1 | 2 | 3;
	lastFeedback: string;
};

export type CharacterMemory = {
	met: boolean;
	jobAccepted: boolean;
	symptomClarified: boolean;
	faultDiscoveredNoted: boolean;
	objectReturned: boolean;
	practicalHelpOffered: boolean;
};

export type NeighbourhoodUnlocks = {
	teaStallRadioPlaying: boolean;
	spareBeltDiscovered: boolean;
	spareBeltInDrawer: boolean;
	shopClockTicking: boolean;
	courtyardChairsPlaced: boolean;
	projectorAtCourtyard: boolean;
	screeningStarted: boolean;
	screeningCompleted: boolean;
};

export type RepairShopSettings = {
	soundEnabled: boolean;
	masterVolume: number; // 0..1
	reducedMotion: boolean;
	highContrastLabels: boolean;
};

export type Vec2 = {
	x: number;
	z: number;
};

export type WorkbenchCameraPreset = 'front' | 'inside' | 'detail' | 'angle';

export type WorkbenchViewState = {
	activeJob: JobId;
	yawOffset: number; // radians, bounded
	pitchOffset: number; // radians, bounded
	zoom: number; // 0.75..1.45
	preset: WorkbenchCameraPreset;
};

export type DialogueChoice = {
	id: string;
	label: string;
};

export type ActiveDialogue = {
	speakerId: CharacterId;
	speakerName: string;
	speakerRole: string;
	lines: string[];
	choices: DialogueChoice[];
};

export type BenchTrayItem = {
	id: string;
	label: string;
	kind: 'screw' | 'cover' | 'gear' | 'belt' | 'battery';
	actionLabel?: string;
};

export type RepairShopGameState = {
	mode: PlayMode;
	afternoonPhase: AfternoonPhase;
	playerPos: Vec2;
	playerHeading: number;
	walkTarget: Vec2 | null;
	walkPath: Vec2[];
	jobs: Record<JobId, JobStatus>;
	radio: RadioState;
	clock: ClockState;
	projector: ProjectorState;
	characters: Record<CharacterId, CharacterMemory>;
	unlocks: NeighbourhoodUnlocks;
	workbench: WorkbenchViewState | null;
	activeDialogue: ActiveDialogue | null;
	drawerMessage: string | null;
	screeningElapsedSeconds: number;
	statusCaption: string;
};

export type NearbyPrompt = {
	id: string;
	label: string;
	sublabel: string;
	kind: 'character' | 'workbench' | 'drawer' | 'counter' | 'courtyard' | 'place';
	position: Vec2;
	distanceMetres: number;
	inReach: boolean;
};
