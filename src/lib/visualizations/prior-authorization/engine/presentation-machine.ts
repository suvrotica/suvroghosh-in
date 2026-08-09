import { MILESTONE_DEFINITIONS } from './scenario-schema.ts';
import type { FailureId, PathwayId, PerspectiveId } from './types.ts';
import type { PriorAuthorizationViewId } from './url-state.ts';

export const PLAYBACK_SPEEDS = [0.5, 1, 1.5] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
export type PresentationMode = 'ready' | 'playing' | 'paused' | 'complete' | 'error';

export type PresentationState = Readonly<{
	mode: PresentationMode;
	milestoneIndex: number;
	pathway: PathwayId;
	view: PriorAuthorizationViewId;
	failureId: FailureId;
	perspective: PerspectiveId;
	speed: PlaybackSpeed;
	compact: boolean;
	fullStage: boolean;
	replayToken: number;
	errorMessage: string | null;
}>;

export type PresentationCommand =
	| { type: 'BEGIN' }
	| { type: 'PLAY'; progressionIndices?: readonly number[] }
	| { type: 'PAUSE' }
	| { type: 'ADVANCE'; progressionIndices?: readonly number[] }
	| { type: 'NEXT'; progressionIndices?: readonly number[] }
	| { type: 'PREVIOUS'; progressionIndices?: readonly number[] }
	| { type: 'SET_STEP'; milestoneIndex: number }
	| { type: 'REPLAY_CURRENT' }
	| { type: 'REPLAY_JOURNEY'; progressionIndices?: readonly number[] }
	| { type: 'RESET' }
	| { type: 'SET_PATHWAY'; pathway: PathwayId }
	| { type: 'SET_VIEW'; view: PriorAuthorizationViewId }
	| { type: 'SELECT_FAILURE'; failureId: FailureId; rewindIndex: number }
	| { type: 'SET_PERSPECTIVE'; perspective: PerspectiveId }
	| { type: 'SET_SPEED'; speed: PlaybackSpeed }
	| { type: 'SET_COMPACT'; compact: boolean }
	| { type: 'SET_FULL_STAGE'; fullStage: boolean }
	| { type: 'ERROR'; message: string }
	| { type: 'CLEAR_ERROR' };

const LAST_MILESTONE_INDEX = MILESTONE_DEFINITIONS.length - 1;
const DEFAULT_PROGRESSION_INDICES = Object.freeze(
	MILESTONE_DEFINITIONS.map((milestone) => milestone.index)
);

function clampStep(step: number): number {
	return Math.max(0, Math.min(LAST_MILESTONE_INDEX, Math.trunc(step)));
}

function normalizeProgressionIndices(indices?: readonly number[]): readonly number[] {
	const normalized = [
		...new Set(
			(indices?.length ? indices : DEFAULT_PROGRESSION_INDICES)
				.filter(Number.isFinite)
				.map(clampStep)
		)
	].sort((left, right) => left - right);
	return normalized.length ? normalized : [0];
}

function nextProgressionIndex(current: number, indices: readonly number[]): number | undefined {
	return indices.find((index) => index > current);
}

function previousProgressionIndex(current: number, indices: readonly number[]): number | undefined {
	return [...indices].reverse().find((index) => index < current);
}

export const INITIAL_PRESENTATION_STATE: PresentationState = Object.freeze({
	mode: 'ready',
	milestoneIndex: 0,
	pathway: 'portal-fax',
	view: 'journey',
	failureId: 'none',
	perspective: 'patient',
	speed: 1,
	compact: false,
	fullStage: false,
	replayToken: 0,
	errorMessage: null
});

export function createInitialPresentationState(
	overrides: Partial<PresentationState> = {}
): PresentationState {
	return {
		...INITIAL_PRESENTATION_STATE,
		...overrides,
		milestoneIndex: clampStep(overrides.milestoneIndex ?? 0),
		mode: overrides.mode ?? 'ready',
		errorMessage: overrides.errorMessage ?? null
	};
}

export function transitionPresentation(
	state: PresentationState,
	command: PresentationCommand
): PresentationState {
	switch (command.type) {
		case 'BEGIN':
			return state.mode === 'ready'
				? { ...state, mode: 'paused', milestoneIndex: 0, errorMessage: null }
				: state;
		case 'PLAY':
			if (state.mode === 'error') return state;
			{
				const progression = normalizeProgressionIndices(command.progressionIndices);
				const last = progression[progression.length - 1]!;
				const current = progression.includes(state.milestoneIndex)
					? state.milestoneIndex
					: (nextProgressionIndex(state.milestoneIndex, progression) ?? last);
				return {
					...state,
					milestoneIndex: current,
					mode: current >= last ? 'complete' : 'playing'
				};
			}
		case 'PAUSE':
			return state.mode === 'playing' ? { ...state, mode: 'paused' } : state;
		case 'ADVANCE': {
			if (state.mode !== 'playing') return state;
			const progression = normalizeProgressionIndices(command.progressionIndices);
			const last = progression[progression.length - 1]!;
			const next = nextProgressionIndex(state.milestoneIndex, progression);
			if (next === undefined) return { ...state, milestoneIndex: last, mode: 'complete' };
			return {
				...state,
				milestoneIndex: next,
				mode: next >= last ? 'complete' : 'playing'
			};
		}
		case 'NEXT': {
			const progression = normalizeProgressionIndices(command.progressionIndices);
			const last = progression[progression.length - 1]!;
			const next = nextProgressionIndex(state.milestoneIndex, progression);
			if (next === undefined) return { ...state, milestoneIndex: last, mode: 'complete' };
			return {
				...state,
				milestoneIndex: next,
				mode: next >= last ? 'complete' : 'paused'
			};
		}
		case 'PREVIOUS': {
			const progression = normalizeProgressionIndices(command.progressionIndices);
			const first = progression[0]!;
			return {
				...state,
				milestoneIndex: previousProgressionIndex(state.milestoneIndex, progression) ?? first,
				mode: 'paused'
			};
		}
		case 'SET_STEP': {
			const milestoneIndex = clampStep(command.milestoneIndex);
			return {
				...state,
				milestoneIndex,
				// Direct scrubber/keyboard inspection may deliberately select a bypassed
				// conceptual state. Completion belongs to progression, not inspection.
				mode: 'paused'
			};
		}
		case 'REPLAY_CURRENT':
			return { ...state, mode: 'paused', replayToken: state.replayToken + 1 };
		case 'REPLAY_JOURNEY': {
			const progression = normalizeProgressionIndices(command.progressionIndices);
			const first = progression[0]!;
			return {
				...state,
				mode: progression.length === 1 ? 'complete' : 'playing',
				milestoneIndex: first,
				replayToken: state.replayToken + 1,
				errorMessage: null
			};
		}
		case 'RESET':
			return INITIAL_PRESENTATION_STATE;
		case 'SET_PATHWAY':
			return { ...state, pathway: command.pathway, mode: 'paused' };
		case 'SET_VIEW':
			return { ...state, view: command.view, mode: 'paused' };
		case 'SELECT_FAILURE':
			return {
				...state,
				failureId: command.failureId,
				milestoneIndex: clampStep(command.rewindIndex),
				mode: 'paused'
			};
		case 'SET_PERSPECTIVE':
			return { ...state, perspective: command.perspective };
		case 'SET_SPEED':
			return { ...state, speed: command.speed };
		case 'SET_COMPACT':
			return {
				...state,
				compact: command.compact,
				fullStage: command.compact ? false : state.fullStage
			};
		case 'SET_FULL_STAGE':
			return {
				...state,
				fullStage: state.compact ? false : command.fullStage,
				mode: command.fullStage ? state.mode : state.mode === 'playing' ? 'paused' : state.mode
			};
		case 'ERROR':
			return { ...state, mode: 'error', errorMessage: command.message, fullStage: false };
		case 'CLEAR_ERROR':
			return { ...state, mode: 'paused', errorMessage: null };
	}
}
