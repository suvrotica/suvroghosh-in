export type ActiveGameStatus = 'tutorial' | 'playing';

export type GameState =
	| { status: 'loading'; attempt: number }
	| { status: 'title' }
	| { status: 'tutorial'; seed: string }
	| { status: 'playing'; seed: string }
	| { status: 'paused'; seed: string; resumeTo: ActiveGameStatus }
	| { status: 'won'; seed: string }
	| { status: 'lost'; seed: string; reason: string }
	| { status: 'restarting'; seed: string; nextStatus: ActiveGameStatus }
	| { status: 'error'; message: string; retryAttempt: number };

export type GameEvent =
	| { type: 'loaded' }
	| { type: 'failed'; message: string }
	| { type: 'start'; seed: string; tutorial: boolean }
	| { type: 'tutorial-complete' }
	| { type: 'pause' }
	| { type: 'resume' }
	| { type: 'win' }
	| { type: 'lose'; reason: string }
	| { type: 'restart'; seed?: string; tutorial: boolean }
	| { type: 'restart-ready' }
	| { type: 'retry' }
	| { type: 'return-to-title' };

export class InvalidGameTransitionError extends Error {
	readonly state: GameState['status'];
	readonly event: GameEvent['type'];

	constructor(state: GameState['status'], event: GameEvent['type']) {
		super(`Cannot handle "${event}" while the game is "${state}".`);
		this.name = 'InvalidGameTransitionError';
		this.state = state;
		this.event = event;
	}
}

export function createInitialGameState(): GameState {
	return { status: 'loading', attempt: 1 };
}

function runSeed(state: GameState): string | null {
	switch (state.status) {
		case 'tutorial':
		case 'playing':
		case 'paused':
		case 'won':
		case 'lost':
		case 'restarting':
			return state.seed;
		default:
			return null;
	}
}

function restartState(state: GameState, event: Extract<GameEvent, { type: 'restart' }>): GameState {
	const seed = event.seed ?? runSeed(state);
	if (seed === null) throw new InvalidGameTransitionError(state.status, event.type);
	return {
		status: 'restarting',
		seed,
		nextStatus: event.tutorial ? 'tutorial' : 'playing'
	};
}

function errorState(state: GameState, message: string): GameState {
	const retryAttempt =
		state.status === 'loading' ? state.attempt : state.status === 'error' ? state.retryAttempt : 1;
	return {
		status: 'error',
		message: message.trim() || 'The street failed to assemble itself.',
		retryAttempt
	};
}

export function transitionGameState(state: GameState, event: GameEvent): GameState {
	if (event.type === 'failed') return errorState(state, event.message);
	if (event.type === 'return-to-title' && state.status !== 'loading') return { status: 'title' };

	switch (state.status) {
		case 'loading':
			if (event.type === 'loaded') return { status: 'title' };
			break;
		case 'title':
			if (event.type === 'start') {
				return event.tutorial
					? { status: 'tutorial', seed: event.seed }
					: { status: 'playing', seed: event.seed };
			}
			break;
		case 'tutorial':
			if (event.type === 'tutorial-complete') return { status: 'playing', seed: state.seed };
			if (event.type === 'pause') {
				return { status: 'paused', seed: state.seed, resumeTo: 'tutorial' };
			}
			if (event.type === 'restart') return restartState(state, event);
			break;
		case 'playing':
			if (event.type === 'pause') {
				return { status: 'paused', seed: state.seed, resumeTo: 'playing' };
			}
			if (event.type === 'win') return { status: 'won', seed: state.seed };
			if (event.type === 'lose') {
				return {
					status: 'lost',
					seed: state.seed,
					reason: event.reason.trim() || 'The pavement has been reassigned.'
				};
			}
			if (event.type === 'restart') return restartState(state, event);
			break;
		case 'paused':
			if (event.type === 'resume') {
				return { status: state.resumeTo, seed: state.seed };
			}
			if (event.type === 'restart') return restartState(state, event);
			break;
		case 'won':
		case 'lost':
			if (event.type === 'restart') return restartState(state, event);
			break;
		case 'restarting':
			if (event.type === 'restart-ready') {
				return { status: state.nextStatus, seed: state.seed };
			}
			break;
		case 'error':
			if (event.type === 'retry') {
				return { status: 'loading', attempt: state.retryAttempt + 1 };
			}
			break;
	}

	throw new InvalidGameTransitionError(state.status, event.type);
}

export class GameStateMachine {
	private current: GameState;

	constructor(initialState: GameState = createInitialGameState()) {
		this.current = initialState;
	}

	get state(): GameState {
		return this.current;
	}

	dispatch(event: GameEvent): GameState {
		this.current = transitionGameState(this.current, event);
		return this.current;
	}
}
