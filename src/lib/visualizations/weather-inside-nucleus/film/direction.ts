export type MillisecondWindow = readonly [startMs: number, endMs: number];
export type ModelWindow = readonly [startModelMinutes: number, endModelMinutes: number];

export type DirectedBeatId =
	| 'boundary'
	| 'relay'
	| 'nuclear-activity'
	| 'scale-cut'
	| 'separate-histories'
	| 'closer-still-silent'
	| 'one-possible-burst'
	| 'probability-not-obedience';

export type ActorId =
	| 'membrane'
	| 'egf'
	| 'egfr'
	| 'intracellular-activity'
	| 'nuclear-envelope'
	| 'nuclear-activity'
	| 'scale-card'
	| 'chromosome-territory'
	| 'locus'
	| 'chromatin'
	| 'enhancer'
	| 'promoter'
	| 'modeled-gene'
	| 'signal-history'
	| 'contact-propensity'
	| 'promoter-state'
	| 'initiation-trace'
	| 'initiation-event'
	| 'history-field'
	| 'comparison-summary';

export type CameraViewId =
	| 'membrane-boundary'
	| 'intracellular-relay'
	| 'nuclear-envelope'
	| 'chromosome-territory'
	| 'locked-locus'
	| 'ensemble-field';

export type CameraOrientation =
	| 'exterior-left-interior-right'
	| 'locus-locked'
	| 'ensemble-orthographic';

export type CameraMove = Readonly<{
	from: CameraViewId;
	to: CameraViewId;
	windowMs: MillisecondWindow;
	easing: 'critically-damped';
	maximumAngularSpeedDegreesPerSecond: number;
}>;

export type CameraShot = Readonly<{
	view: CameraViewId;
	orientation: CameraOrientation;
	move: CameraMove | null;
	settledByMs: number;
}>;

export type ModelTimeSegment = Readonly<{
	filmWindowMs: MillisecondWindow;
	modelWindow: ModelWindow;
	interpolation: 'hold' | 'linear';
}>;

export type ModelTimePlan =
	| Readonly<{
			kind: 'anchor';
			modelTime: number;
	  }>
	| Readonly<{
			kind: 'window';
			modelWindow: ModelWindow;
			filmWindowMs: MillisecondWindow;
	  }>
	| Readonly<{
			kind: 'piecewise';
			modelWindow: ModelWindow;
			entryModelTime: number;
			timeCut: Readonly<{
				atMs: number;
				fromModelTime: number;
				toModelTime: number;
				label: string;
			}> | null;
			segments: readonly ModelTimeSegment[];
	  }>
	| Readonly<{
			kind: 'ensemble';
			modelWindow: ModelWindow;
	  }>;

export type DirectedEventKind =
	| 'emphasis'
	| 'activity-change'
	| 'state-change'
	| 'semantic-cut'
	| 'geometry-change'
	| 'initiation'
	| 'layout-change'
	| 'condition-change';

export type DirectedEventCue = Readonly<{
	id: string;
	kind: DirectedEventKind;
	actor: ActorId;
	atMs: number;
	untilMs: number;
	description: string;
	modelTime?: number;
}>;

export type DirectedTextCue = Readonly<{
	id: string;
	kind: 'label' | 'caption' | 'card';
	text: string;
	atMs: number;
	untilMs: number;
	actor?: ActorId;
	precedesEventId?: string;
}>;

export type BeatTiming = Readonly<{
	anticipationMs: MillisecondWindow;
	actionMs: MillisecondWindow;
	reactionMs: MillisecondWindow;
	explanatoryHoldMs: MillisecondWindow;
	transitionMs: MillisecondWindow | null;
}>;

export type PauseTableau = Readonly<{
	id: string;
	description: string;
	cameraView: CameraViewId;
	focalActor: ActorId | null;
	visibleActors: readonly ActorId[];
	model:
		| Readonly<{
				kind: 'trace';
				modelTime: number;
				boundary: 'at' | 'before' | 'after';
		  }>
		| Readonly<{
				kind: 'ensemble';
				modelWindow: ModelWindow;
		  }>;
}>;

export type DirectedBeat = Readonly<{
	id: DirectedBeatId;
	number: number;
	title: string;
	cue: string;
	newClaim: string;
	accessibleSummary: string;
	autoplayDurationMs: number;
	minimumHoldMs: number;
	model: ModelTimePlan;
	camera: CameraShot;
	visibleActors: readonly ActorId[];
	focalActor: ActorId | null;
	caption: string;
	transition: 'cut' | 'aperture' | 'dissolve' | 'none';
	pauseTableau: PauseTableau;
	reducedMotionFrame: string;
	timing: BeatTiming;
	events: readonly DirectedEventCue[];
	textCues: readonly DirectedTextCue[];
	permittedMotion: readonly string[];
	mutuallyExclusiveMotion: readonly string[];
}>;

export const PEDAGOGICAL_SEED = 0;
export const TOUR_DURATION_MS = 78_000;
export const MINIMUM_CAMERA_EVENT_SEPARATION_MS = 600;
export const MINIMUM_LABEL_LEAD_MS = 500;
export const MINIMUM_LABEL_LINGER_MS = 1_500;

export const SEED_0_CONTACT_TRANSITION_MODEL_TIMES = Object.freeze([
	9.9266879215, 12.8353867666, 13.0616583243, 19.9229721234
] as const);
export const SELECTED_SILENT_NEAR_INTERVAL_INDEX = 1;
export const SELECTED_SILENT_NEAR_START_TRANSITION_INDEX = SELECTED_SILENT_NEAR_INTERVAL_INDEX * 2;
export const SELECTED_SILENT_NEAR_START_MODEL_TIME =
	SEED_0_CONTACT_TRANSITION_MODEL_TIMES[SELECTED_SILENT_NEAR_START_TRANSITION_INDEX];
export const SELECTED_SILENT_NEAR_END_MODEL_TIME =
	SEED_0_CONTACT_TRANSITION_MODEL_TIMES[SELECTED_SILENT_NEAR_START_TRANSITION_INDEX + 1];
export const BURST_START_MODEL_TIME = 24.8093746775;
export const BURST_END_MODEL_TIME = 27.6782023014;
export const INITIATION_EVENT_MODEL_TIMES = Object.freeze([
	24.9461097944, 25.7179468874, 26.3428133612
] as const);
export const ENSEMBLE_MODEL_WINDOW = Object.freeze([0, 60] as const);

function mapLinear(
	value: number,
	input: readonly [number, number],
	output: readonly [number, number]
): number {
	return output[0] + ((value - input[0]) / (input[1] - input[0])) * (output[1] - output[0]);
}

const BEAT_6_NEAR_FILM_TIME = 1_600;
const BEAT_7_PROMOTER_ON_FILM_TIME = mapLinear(
	BURST_START_MODEL_TIME,
	[24.65, 24.85],
	[2_200, 3_200]
);
const beat7InitiationFilmTime = (modelTime: number): number =>
	mapLinear(modelTime, [24.85, BURST_END_MODEL_TIME], [4_000, 7_000]);

const BEATS = [
	{
		id: 'boundary',
		number: 1,
		title: 'The boundary',
		cue: 'The signal stops.',
		newClaim: 'EGF remains outside while EGFR begins the response on the cell-facing side.',
		accessibleSummary:
			'EGF remains outside. The receptor’s cell-facing end brightens, beginning the inside response.',
		autoplayDurationMs: 6_000,
		minimumHoldMs: 4_000,
		model: { kind: 'anchor', modelTime: 3.5 },
		camera: {
			view: 'membrane-boundary',
			orientation: 'exterior-left-interior-right',
			move: null,
			settledByMs: 0
		},
		visibleActors: ['membrane', 'egf', 'egfr', 'intracellular-activity'],
		focalActor: 'egfr',
		caption: 'EGF stays outside. EGFR relays the news.',
		transition: 'none',
		pauseTableau: {
			id: 'boundary-held',
			description:
				'EGF is docked outside, EGFR spans the boundary, and the first local inside response is held.',
			cameraView: 'membrane-boundary',
			focalActor: 'egfr',
			visibleActors: ['membrane', 'egf', 'egfr', 'intracellular-activity'],
			model: { kind: 'trace', modelTime: 3.5, boundary: 'at' }
		},
		reducedMotionFrame: 'boundary-egf-docked',
		timing: {
			anticipationMs: [0, 1_100],
			actionMs: [1_600, 1_800],
			reactionMs: [1_800, 2_000],
			explanatoryHoldMs: [2_000, 6_000],
			transitionMs: null
		},
		events: [
			{
				id: 'boundary-receptor-emphasis',
				kind: 'emphasis',
				actor: 'egfr',
				atMs: 1_600,
				untilMs: 1_800,
				description:
					'Emphasize the receptor’s outside-to-inside continuity without replaying docking.'
			}
		],
		textCues: [
			{
				id: 'boundary-outside',
				kind: 'label',
				text: 'outside the cell',
				atMs: 200,
				untilMs: 6_000
			},
			{
				id: 'boundary-inside',
				kind: 'label',
				text: 'cell interior',
				atMs: 500,
				untilMs: 6_000
			},
			{
				id: 'boundary-egf',
				kind: 'label',
				text: 'outside signal · EGF',
				actor: 'egf',
				atMs: 800,
				untilMs: 6_000
			},
			{
				id: 'boundary-egfr',
				kind: 'label',
				text: 'surface receptor · EGFR',
				actor: 'egfr',
				atMs: 1_100,
				untilMs: 6_000,
				precedesEventId: 'boundary-receptor-emphasis'
			},
			{
				id: 'boundary-caption',
				kind: 'caption',
				text: 'EGF stays outside. EGFR relays the news.',
				atMs: 2_000,
				untilMs: 6_000
			}
		],
		permittedMotion: ['One local receptor emphasis after all spatial labels are established.'],
		mutuallyExclusiveMotion: [
			'Ligand travel, camera travel, relay activity, and scale change remain absent.'
		]
	},
	{
		id: 'relay',
		number: 2,
		title: 'The relay',
		cue: 'Watch regions change.',
		newClaim:
			'Changes in lumped intracellular activity carry the consequence inward; EGF itself does not travel.',
		accessibleSummary:
			'Several separate regions inside the cell brighten in sequence; no object travels between them.',
		autoplayDurationMs: 8_000,
		minimumHoldMs: 4_000,
		model: { kind: 'window', modelWindow: [3.5, 5.5], filmWindowMs: [2_800, 3_800] },
		camera: {
			view: 'intracellular-relay',
			orientation: 'exterior-left-interior-right',
			move: {
				from: 'membrane-boundary',
				to: 'intracellular-relay',
				windowMs: [0, 1_700],
				easing: 'critically-damped',
				maximumAngularSpeedDegreesPerSecond: 12
			},
			settledByMs: 1_700
		},
		visibleActors: ['membrane', 'egfr', 'intracellular-activity', 'nuclear-envelope'],
		focalActor: 'intracellular-activity',
		caption: 'This is a compressed relay, not traveling EGF.',
		transition: 'none',
		pauseTableau: {
			id: 'relay-held',
			description:
				'Separate local activity regions are held between the dim receptor landmark and the nucleus.',
			cameraView: 'intracellular-relay',
			focalActor: 'intracellular-activity',
			visibleActors: ['membrane', 'egfr', 'intracellular-activity', 'nuclear-envelope'],
			model: { kind: 'trace', modelTime: 5.5, boundary: 'at' }
		},
		reducedMotionFrame: 'relay-local-activity-regions',
		timing: {
			anticipationMs: [0, 2_300],
			actionMs: [2_800, 3_800],
			reactionMs: [3_800, 4_000],
			explanatoryHoldMs: [4_000, 8_000],
			transitionMs: null
		},
		events: [
			{
				id: 'relay-local-changes',
				kind: 'activity-change',
				actor: 'intracellular-activity',
				atMs: 2_800,
				untilMs: 3_800,
				description:
					'Separated local regions respond in sequence with dark gaps and no moving front.'
			}
		],
		textCues: [
			{
				id: 'relay-proxy-label',
				kind: 'label',
				text: 'inside-cell activity · many steps omitted · model proxy',
				actor: 'intracellular-activity',
				atMs: 2_300,
				untilMs: 8_000,
				precedesEventId: 'relay-local-changes'
			},
			{
				id: 'relay-caption',
				kind: 'caption',
				text: 'This is a compressed relay, not traveling EGF.',
				atMs: 4_000,
				untilMs: 8_000
			}
		],
		permittedMotion: ['A region may remain subdued while the adjacent region responds.'],
		mutuallyExclusiveMotion: [
			'Camera motion and relay activity never overlap.',
			'No point, arrow, ray, or continuous luminous front travels toward the nucleus.'
		]
	},
	{
		id: 'nuclear-activity',
		number: 3,
		title: 'Nuclear regulatory activity',
		cue: 'At the nucleus.',
		newClaim:
			'The intracellular response is followed by a change in the modeled regulatory state inside the nucleus.',
		accessibleSummary:
			'A combined activity indicator inside the nucleus brightens after the inside-cell activity changes.',
		autoplayDurationMs: 7_000,
		minimumHoldMs: 4_000,
		model: { kind: 'window', modelWindow: [5.5, 9], filmWindowMs: [2_500, 3_000] },
		camera: {
			view: 'nuclear-envelope',
			orientation: 'exterior-left-interior-right',
			move: {
				from: 'intracellular-relay',
				to: 'nuclear-envelope',
				windowMs: [0, 1_400],
				easing: 'critically-damped',
				maximumAngularSpeedDegreesPerSecond: 12
			},
			settledByMs: 1_400
		},
		visibleActors: ['intracellular-activity', 'nuclear-envelope', 'nuclear-activity'],
		focalActor: 'nuclear-activity',
		caption: 'Downstream activity changes the nuclear regulatory climate.',
		transition: 'none',
		pauseTableau: {
			id: 'nuclear-activity-held',
			description:
				'The nuclear envelope is settled with downstream activity outside and a labeled proxy inside.',
			cameraView: 'nuclear-envelope',
			focalActor: 'nuclear-activity',
			visibleActors: ['intracellular-activity', 'nuclear-envelope', 'nuclear-activity'],
			model: { kind: 'trace', modelTime: 9, boundary: 'at' }
		},
		reducedMotionFrame: 'nuclear-activity-proxy-response',
		timing: {
			anticipationMs: [0, 2_000],
			actionMs: [2_500, 2_750],
			reactionMs: [2_750, 3_000],
			explanatoryHoldMs: [3_000, 7_000],
			transitionMs: null
		},
		events: [
			{
				id: 'nuclear-proxy-response',
				kind: 'activity-change',
				actor: 'nuclear-activity',
				atMs: 2_500,
				untilMs: 3_000,
				description: 'The nuclear proxy responds after the already-grounded intracellular activity.'
			}
		],
		textCues: [
			{
				id: 'nuclear-proxy-label',
				kind: 'label',
				text: 'combined activity indicator · nuclear activity proxy · many pathways omitted',
				actor: 'nuclear-activity',
				atMs: 2_000,
				untilMs: 7_000,
				precedesEventId: 'nuclear-proxy-response'
			},
			{
				id: 'nuclear-caption',
				kind: 'caption',
				text: 'Downstream activity changes the nuclear regulatory climate.',
				atMs: 3_000,
				untilMs: 7_000
			}
		],
		permittedMotion: [
			'The downstream state may remain dimly visible while the nuclear proxy responds.'
		],
		mutuallyExclusiveMotion: [
			'Camera motion, pore-crossing particles, promoter state, and locus reveal remain absent.'
		]
	},
	{
		id: 'scale-cut',
		number: 4,
		title: 'The honest scale cut',
		cue: 'Change of view, not travel.',
		newClaim: 'The move from cell to locus is a semantic model-view cut, not biological travel.',
		accessibleSummary:
			'Motion stops. A card announces a cut from cell to nucleus to one modeled DNA region, not a continuous zoom.',
		autoplayDurationMs: 9_000,
		minimumHoldMs: 4_000,
		model: { kind: 'anchor', modelTime: 9 },
		camera: {
			view: 'chromosome-territory',
			orientation: 'locus-locked',
			move: null,
			settledByMs: 4_000
		},
		visibleActors: ['scale-card', 'chromosome-territory', 'locus'],
		focalActor: 'locus',
		caption: 'We cut to one modeled DNA region—not through continuous distance.',
		transition: 'aperture',
		pauseTableau: {
			id: 'scale-cut-held',
			description:
				'A selected locus is resolved inside one dim territory while the semantic-scale badge remains visible.',
			cameraView: 'chromosome-territory',
			focalActor: 'locus',
			visibleActors: ['scale-card', 'chromosome-territory', 'locus'],
			model: { kind: 'trace', modelTime: 9, boundary: 'at' }
		},
		reducedMotionFrame: 'semantic-scale-cut-locus',
		timing: {
			anticipationMs: [0, 600],
			actionMs: [600, 3_100],
			reactionMs: [3_100, 5_000],
			explanatoryHoldMs: [5_000, 9_000],
			transitionMs: [600, 4_000]
		},
		events: [
			{
				id: 'semantic-scale-cut',
				kind: 'semantic-cut',
				actor: 'scale-card',
				atMs: 3_100,
				untilMs: 4_000,
				description: 'Cut discontinuously from the nuclear view to one chromosome territory.'
			},
			{
				id: 'resolve-selected-locus',
				kind: 'emphasis',
				actor: 'locus',
				atMs: 4_500,
				untilMs: 5_000,
				description: 'Resolve one synthetic locus after the new view is settled.'
			}
		],
		textCues: [
			{
				id: 'scale-card',
				kind: 'card',
				text: 'CELL → NUCLEUS → LOCUS · MODEL VIEW CHANGE · NOT A CONTINUOUS ZOOM',
				actor: 'scale-card',
				atMs: 1_100,
				untilMs: 9_000,
				precedesEventId: 'semantic-scale-cut'
			},
			{
				id: 'locus-label',
				kind: 'label',
				text: 'locus · one modeled DNA region',
				actor: 'locus',
				atMs: 4_000,
				untilMs: 9_000,
				precedesEventId: 'resolve-selected-locus'
			},
			{
				id: 'scale-caption',
				kind: 'caption',
				text: 'We cut to one modeled DNA region—not through continuous distance.',
				atMs: 5_000,
				untilMs: 9_000
			}
		],
		permittedMotion: ['Aperture closure, a discontinuous cut, and exposure recovery may overlap.'],
		mutuallyExclusiveMotion: [
			'Model time, biological state, chromatin motion, and camera flight remain frozen.'
		]
	},
	{
		id: 'separate-histories',
		number: 5,
		title: 'Two histories, separate until the promoter',
		cue: 'Two separate histories.',
		newClaim: 'Signal history and folded-DNA geometry change independently in this model.',
		accessibleSummary:
			'A signal-history indicator changes while folded DNA moves independently; an enhancer and promoter are labeled on the DNA.',
		autoplayDurationMs: 10_000,
		minimumHoldMs: 4_000,
		model: { kind: 'window', modelWindow: [9, 9.75], filmWindowMs: [2_500, 3_500] },
		camera: {
			view: 'locked-locus',
			orientation: 'locus-locked',
			move: null,
			settledByMs: 0
		},
		visibleActors: [
			'locus',
			'chromatin',
			'enhancer',
			'promoter',
			'modeled-gene',
			'signal-history',
			'contact-propensity'
		],
		focalActor: 'chromatin',
		caption: 'Signaling and geometry are separate histories.',
		transition: 'none',
		pauseTableau: {
			id: 'separate-histories-held',
			description:
				'The locus is locked with enhancer, promoter, gene, and signal history spatially separated.',
			cameraView: 'locked-locus',
			focalActor: 'chromatin',
			visibleActors: [
				'locus',
				'chromatin',
				'enhancer',
				'promoter',
				'modeled-gene',
				'signal-history',
				'contact-propensity'
			],
			model: { kind: 'trace', modelTime: 9.75, boundary: 'at' }
		},
		reducedMotionFrame: 'locus-two-independent-histories',
		timing: {
			anticipationMs: [0, 2_500],
			actionMs: [2_500, 3_250],
			reactionMs: [3_250, 3_600],
			explanatoryHoldMs: [6_000, 10_000],
			transitionMs: null
		},
		events: [
			{
				id: 'separate-history-changes',
				kind: 'geometry-change',
				actor: 'chromatin',
				atMs: 2_500,
				untilMs: 3_500,
				description:
					'Geometry and signal history receive separate, sequential emphasis without one deforming the other.'
			}
		],
		textCues: [
			{
				id: 'chromatin-label',
				kind: 'label',
				text: 'folded DNA · chromatin',
				actor: 'chromatin',
				atMs: 0,
				untilMs: 10_000
			},
			{
				id: 'enhancer-label',
				kind: 'label',
				text: 'enhancer · control region',
				actor: 'enhancer',
				atMs: 500,
				untilMs: 10_000
			},
			{
				id: 'promoter-label',
				kind: 'label',
				text: 'promoter · modeled gene start',
				actor: 'promoter',
				atMs: 1_000,
				untilMs: 10_000
			},
			{
				id: 'gene-label',
				kind: 'label',
				text: 'modeled gene',
				actor: 'modeled-gene',
				atMs: 1_500,
				untilMs: 10_000
			},
			{
				id: 'signal-history-label',
				kind: 'label',
				text: 'signal history',
				actor: 'signal-history',
				atMs: 2_000,
				untilMs: 10_000,
				precedesEventId: 'separate-history-changes'
			},
			{
				id: 'separate-histories-caption',
				kind: 'caption',
				text: 'Signaling and geometry are separate histories.',
				atMs: 3_600,
				untilMs: 10_000
			},
			{
				id: 'histories-meet-caption',
				kind: 'caption',
				text: 'They meet only in the promoter’s odds.',
				atMs: 6_000,
				untilMs: 10_000
			}
		],
		permittedMotion: ['One history may receive focal emphasis while the other remains subdued.'],
		mutuallyExclusiveMotion: [
			'High-salience geometry and signal-history motion never overlap.',
			'Signaling never pushes, attracts, folds, or tugs chromatin.'
		]
	},
	{
		id: 'closer-still-silent',
		number: 6,
		title: 'Closer. Still silent.',
		cue: 'Closer. Still silent.',
		newClaim: 'A close enhancer–promoter configuration does not guarantee gene activity.',
		accessibleSummary:
			'The enhancer and promoter are close, but the promoter stays OFF and no RNA-start event occurs.',
		autoplayDurationMs: 11_000,
		minimumHoldMs: 3_500,
		model: {
			kind: 'piecewise',
			modelWindow: [SELECTED_SILENT_NEAR_START_MODEL_TIME, SELECTED_SILENT_NEAR_END_MODEL_TIME],
			entryModelTime: 13,
			timeCut: null,
			segments: [
				{ filmWindowMs: [0, 1_000], modelWindow: [13, 13], interpolation: 'hold' },
				{
					filmWindowMs: [1_000, 1_600],
					modelWindow: [13, SELECTED_SILENT_NEAR_START_MODEL_TIME],
					interpolation: 'linear'
				},
				{
					filmWindowMs: [1_600, 7_500],
					modelWindow: [SELECTED_SILENT_NEAR_START_MODEL_TIME, SELECTED_SILENT_NEAR_END_MODEL_TIME],
					interpolation: 'linear'
				},
				{
					filmWindowMs: [7_500, 11_000],
					modelWindow: [SELECTED_SILENT_NEAR_END_MODEL_TIME, SELECTED_SILENT_NEAR_END_MODEL_TIME],
					interpolation: 'hold'
				}
			]
		},
		camera: {
			view: 'locked-locus',
			orientation: 'locus-locked',
			move: null,
			settledByMs: 0
		},
		visibleActors: [
			'locus',
			'chromatin',
			'enhancer',
			'promoter',
			'contact-propensity',
			'promoter-state',
			'initiation-trace'
		],
		focalActor: 'promoter-state',
		caption: 'Contact changes odds. It does not command the gene.',
		transition: 'none',
		pauseTableau: {
			id: 'closer-still-silent-held',
			description:
				'Enhancer and promoter are held close, the promoter is patterned OFF, and the initiation trace is empty.',
			cameraView: 'locked-locus',
			focalActor: 'promoter-state',
			visibleActors: [
				'locus',
				'chromatin',
				'enhancer',
				'promoter',
				'contact-propensity',
				'promoter-state',
				'initiation-trace'
			],
			model: {
				kind: 'trace',
				modelTime: SELECTED_SILENT_NEAR_END_MODEL_TIME,
				boundary: 'before'
			}
		},
		reducedMotionFrame: 'close-encounter-promoter-off',
		timing: {
			anticipationMs: [0, 1_000],
			actionMs: [1_000, 1_600],
			reactionMs: [1_600, 1_800],
			explanatoryHoldMs: [7_500, 11_000],
			transitionMs: null
		},
		events: [
			{
				id: 'contact-enters-near',
				kind: 'geometry-change',
				actor: 'contact-propensity',
				atMs: BEAT_6_NEAR_FILM_TIME,
				untilMs: 1_600,
				description:
					'The authentic trace crosses into its near state while the promoter stays OFF.',
				modelTime: SELECTED_SILENT_NEAR_START_MODEL_TIME
			}
		],
		textCues: [
			{
				id: 'close-encounter-label',
				kind: 'label',
				text: 'close modeled encounter',
				actor: 'contact-propensity',
				atMs: 500,
				untilMs: 11_000,
				precedesEventId: 'contact-enters-near'
			},
			{
				id: 'closer-text',
				kind: 'caption',
				text: 'Closer.',
				atMs: 1_800,
				untilMs: 11_000
			},
			{
				id: 'still-silent-text',
				kind: 'caption',
				text: 'Still silent.',
				atMs: 3_800,
				untilMs: 11_000
			},
			{
				id: 'silent-caption',
				kind: 'caption',
				text: 'Contact changes odds. It does not command the gene.',
				atMs: 5_800,
				untilMs: 11_000
			}
		],
		permittedMotion: ['One modeled geometry change may coincide with its contact-state indicator.'],
		mutuallyExclusiveMotion: [
			'Camera, decorative motion, promoter switching, initiation flares, and trace ticks remain absent.'
		]
	},
	{
		id: 'one-possible-burst',
		number: 7,
		title: 'One possible burst',
		cue: 'One possible history.',
		newClaim: 'A briefly active promoter can produce a cluster of RNA-start events in one history.',
		accessibleSummary:
			'The promoter briefly turns ON. Irregular RNA-start events appear at the locus with matching marks on the history trace.',
		autoplayDurationMs: 11_000,
		minimumHoldMs: 4_000,
		model: {
			kind: 'piecewise',
			modelWindow: [24.65, BURST_END_MODEL_TIME],
			entryModelTime: SELECTED_SILENT_NEAR_END_MODEL_TIME,
			timeCut: {
				atMs: 1_000,
				fromModelTime: SELECTED_SILENT_NEAR_END_MODEL_TIME,
				toModelTime: 24.65,
				label: 'later in the same history · seed 0'
			},
			segments: [
				{
					filmWindowMs: [0, 1_000],
					modelWindow: [SELECTED_SILENT_NEAR_END_MODEL_TIME, SELECTED_SILENT_NEAR_END_MODEL_TIME],
					interpolation: 'hold'
				},
				{ filmWindowMs: [1_000, 2_200], modelWindow: [24.65, 24.65], interpolation: 'hold' },
				{ filmWindowMs: [2_200, 3_200], modelWindow: [24.65, 24.85], interpolation: 'linear' },
				{ filmWindowMs: [3_200, 4_000], modelWindow: [24.85, 24.85], interpolation: 'hold' },
				{
					filmWindowMs: [4_000, 7_000],
					modelWindow: [24.85, BURST_END_MODEL_TIME],
					interpolation: 'linear'
				},
				{
					filmWindowMs: [7_000, 11_000],
					modelWindow: [BURST_END_MODEL_TIME, BURST_END_MODEL_TIME],
					interpolation: 'hold'
				}
			]
		},
		camera: {
			view: 'locked-locus',
			orientation: 'locus-locked',
			move: null,
			settledByMs: 0
		},
		visibleActors: [
			'locus',
			'chromatin',
			'enhancer',
			'promoter',
			'promoter-state',
			'initiation-trace',
			'initiation-event'
		],
		focalActor: 'promoter-state',
		caption: 'The promoter becomes permissive—for a while.',
		transition: 'dissolve',
		pauseTableau: {
			id: 'one-possible-burst-held',
			description:
				'The unchanged locus frame holds the completed ON interval and three authenticated initiation ticks.',
			cameraView: 'locked-locus',
			focalActor: 'initiation-trace',
			visibleActors: [
				'locus',
				'chromatin',
				'enhancer',
				'promoter',
				'promoter-state',
				'initiation-trace',
				'initiation-event'
			],
			model: { kind: 'trace', modelTime: BURST_END_MODEL_TIME, boundary: 'after' }
		},
		reducedMotionFrame: 'one-history-three-initiation-events',
		timing: {
			anticipationMs: [0, 2_200],
			actionMs: [2_200, 7_000],
			reactionMs: [BEAT_7_PROMOTER_ON_FILM_TIME, 7_000],
			explanatoryHoldMs: [7_000, 11_000],
			transitionMs: [1_000, 1_400]
		},
		events: [
			{
				id: 'promoter-enters-on',
				kind: 'state-change',
				actor: 'promoter-state',
				atMs: BEAT_7_PROMOTER_ON_FILM_TIME,
				untilMs: 3_200,
				description: 'The real trace enters its first promoter-ON interval.',
				modelTime: BURST_START_MODEL_TIME
			},
			...INITIATION_EVENT_MODEL_TIMES.map((modelTime, index) => ({
				id: `initiation-${index + 1}`,
				kind: 'initiation' as const,
				actor: 'initiation-event' as const,
				atMs: beat7InitiationFilmTime(modelTime),
				untilMs: beat7InitiationFilmTime(modelTime) + 300,
				description: `Authentic initiation event ${index + 1}; its flare and trace tick are one cue.`,
				modelTime
			})),
			{
				id: 'promoter-returns-off',
				kind: 'state-change',
				actor: 'promoter-state',
				atMs: 7_000,
				untilMs: 7_150,
				description: 'The real promoter-ON interval ends; no completed transcript flies away.',
				modelTime: BURST_END_MODEL_TIME
			}
		],
		textCues: [
			{
				id: 'later-same-history-card',
				kind: 'card',
				text: 'later in the same history · seed 0',
				atMs: 500,
				untilMs: 2_200
			},
			{
				id: 'initiation-label',
				kind: 'label',
				text: 'one modeled start of RNA production · initiation event',
				actor: 'initiation-event',
				atMs: 1_800,
				untilMs: 11_000,
				precedesEventId: 'initiation-1'
			},
			{
				id: 'burst-caption',
				kind: 'caption',
				text: 'The promoter becomes permissive—for a while.',
				atMs: 3_300,
				untilMs: 11_000
			},
			{
				id: 'one-history-caption',
				kind: 'caption',
				text: 'This is one possible history.',
				atMs: 7_000,
				untilMs: 11_000
			}
		],
		permittedMotion: ['Each locus flare and its matching trace tick occur simultaneously.'],
		mutuallyExclusiveMotion: [
			'Time cut, camera, caption change, initiation flare, and decorative particles never compete.',
			'No initiation is scripted outside the trace and no event flies away as mature RNA.'
		]
	},
	{
		id: 'probability-not-obedience',
		number: 8,
		title: 'Probability, not obedience',
		cue: 'Now compare many.',
		newClaim:
			'Increasing contact propensity changes the distribution of outcomes, not every individual outcome.',
		accessibleSummary:
			'One history becomes a 48-run grid. Baseline has 26 bursting histories; increased contact has 41, while 7 changed histories remain silent.',
		autoplayDurationMs: 16_000,
		minimumHoldMs: 5_000,
		model: { kind: 'ensemble', modelWindow: ENSEMBLE_MODEL_WINDOW },
		camera: {
			view: 'ensemble-field',
			orientation: 'ensemble-orthographic',
			move: null,
			settledByMs: 1_000
		},
		visibleActors: ['history-field', 'comparison-summary'],
		focalActor: 'history-field',
		caption: 'More favorable contact raises the frequency.',
		transition: 'none',
		pauseTableau: {
			id: 'probability-not-obedience-held',
			description:
				'A paired 6×8 field preserves seed positions and shows baseline bursts, changed bursts, and changed silent histories.',
			cameraView: 'ensemble-field',
			focalActor: 'comparison-summary',
			visibleActors: ['history-field', 'comparison-summary'],
			model: { kind: 'ensemble', modelWindow: ENSEMBLE_MODEL_WINDOW }
		},
		reducedMotionFrame: 'paired-48-history-comparison',
		timing: {
			anticipationMs: [0, 1_600],
			actionMs: [1_600, 6_900],
			reactionMs: [6_900, 7_000],
			explanatoryHoldMs: [11_000, 16_000],
			transitionMs: null
		},
		events: [
			{
				id: 'unfold-history-field',
				kind: 'layout-change',
				actor: 'history-field',
				atMs: 0,
				untilMs: 1_000,
				description: 'The known locus becomes one tile before the remaining 47 tiles appear.'
			},
			{
				id: 'reveal-baseline-field',
				kind: 'condition-change',
				actor: 'history-field',
				atMs: 2_100,
				untilMs: 2_400,
				description: 'Reveal all 48 baseline outcomes without running 48 miniature nuclei.'
			},
			{
				id: 'reveal-contact-field',
				kind: 'condition-change',
				actor: 'history-field',
				atMs: 6_500,
				untilMs: 6_900,
				description: 'Use one comparison wipe while every grid position retains the same seed.'
			}
		],
		textCues: [
			{
				id: 'baseline-label',
				kind: 'label',
				text: 'usual setting · baseline · 26 of 48 burst',
				actor: 'history-field',
				atMs: 1_600,
				untilMs: 16_000,
				precedesEventId: 'reveal-baseline-field'
			},
			{
				id: 'many-histories-caption',
				kind: 'caption',
				text: 'Same model. Forty-eight possible histories.',
				atMs: 2_400,
				untilMs: 16_000
			},
			{
				id: 'contact-setting-label',
				kind: 'label',
				text: 'increased-contact setting · 41 of 48 burst · 7 remain silent',
				actor: 'history-field',
				atMs: 6_000,
				untilMs: 16_000,
				precedesEventId: 'reveal-contact-field'
			},
			{
				id: 'frequency-caption',
				kind: 'caption',
				text: 'More favorable contact raises the frequency.',
				atMs: 7_000,
				untilMs: 16_000
			},
			{
				id: 'final-caption',
				kind: 'caption',
				text: 'The odds moved. The outcome did not obey.',
				atMs: 11_000,
				untilMs: 16_000
			}
		],
		permittedMotion: ['One layout unfold and one clearly presentational comparison wipe.'],
		mutuallyExclusiveMotion: [
			'Layout unfold, baseline reveal, and intervention reveal never overlap.',
			'No tile plays an individual burst animation during the ensemble comparison.'
		]
	}
] satisfies DirectedBeat[];

function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	return Object.freeze(value);
}

export const DIRECTED_BEATS: readonly DirectedBeat[] = deepFreeze(BEATS);

export const DIRECTED_BEAT_BY_ID: Readonly<Record<DirectedBeatId, DirectedBeat>> = deepFreeze(
	Object.fromEntries(DIRECTED_BEATS.map((beat) => [beat.id, beat])) as Record<
		DirectedBeatId,
		DirectedBeat
	>
);
