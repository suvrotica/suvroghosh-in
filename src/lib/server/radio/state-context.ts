import { AsyncLocalStorage } from 'node:async_hooks';
import type { RadioStoreState } from './store';

interface RadioRequestState {
	state: RadioStoreState;
	rollback: Array<() => Promise<void>>;
	mediaEnabled: boolean;
	aborted: boolean;
	closedRooms: Set<string>;
}

const requests = new AsyncLocalStorage<RadioRequestState>();
let fixtureState: RadioStoreState | undefined;

export function currentRadioState(): RadioStoreState {
	const request = requests.getStore();
	if (request?.aborted) throw new Error('Radio transaction is no longer active.');
	const state = request?.state;
	if (state) return state;
	if (process.env.NODE_ENV === 'test' && fixtureState) return fixtureState;
	throw new Error('Radio state accessed outside an authorised persistence transaction.');
}

/** Retains existing store contracts while binding every Map/array to its request snapshot. */
export function radioStateCollection<K extends keyof RadioStoreState>(key: K): RadioStoreState[K] {
	return new Proxy({} as RadioStoreState[K] & object, {
		get(_target, property) {
			const collection = currentRadioState()[key] as object;
			const value = Reflect.get(collection, property, collection);
			return typeof value === 'function' ? value.bind(collection) : value;
		},
		set(_target, property, value) {
			return Reflect.set(currentRadioState()[key] as object, property, value);
		}
	}) as RadioStoreState[K];
}

export async function withRadioState<T>(
	state: RadioStoreState,
	action: () => Promise<T>,
	mediaEnabled = false
): Promise<T> {
	return requests.run(
		{ state, rollback: [], mediaEnabled, aborted: false, closedRooms: new Set() },
		action
	);
}

export function radioMediaEnabledForRequest(): boolean {
	return requests.getStore()?.mediaEnabled === true;
}

export function markRadioRoomClosed(roomId: string): void {
	requests.getStore()?.closedRooms.add(roomId);
}

export function wasRadioRoomClosed(roomId: string): boolean {
	return requests.getStore()?.closedRooms.has(roomId) === true;
}

/** Compensate externally granted media privileges if the durable commit fails. */
export function registerRadioRollback(action: () => Promise<void>): void {
	const request = requests.getStore();
	if (request?.aborted) {
		void action().catch(() => undefined);
		throw new Error('Radio transaction expired before media authorization completed.');
	}
	if (request) request.rollback.push(action);
	else if (process.env.NODE_ENV !== 'test') {
		throw new Error('Radio media mutation outside persistence transaction.');
	}
}

export async function rollbackRadioEffects(): Promise<void> {
	const request = requests.getStore();
	if (request) request.aborted = true;
	const actions = request?.rollback.splice(0).reverse() ?? [];
	await Promise.allSettled(actions.map((action) => action()));
}

export function setRadioFixtureState(state: RadioStoreState): void {
	if (process.env.NODE_ENV !== 'test') throw new Error('Radio fixture state is test-only.');
	fixtureState = state;
}
