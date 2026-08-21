import { paceMultiplier, type Pace } from './shared';

export type TimingKind =
	| 'computer-roll'
	| 'die'
	| 'decision'
	| 'ludo-step'
	| 'landing'
	| 'transport'
	| 'no-move'
	| 'turn';

const NORMAL_TIMINGS: Record<TimingKind, number> = {
	'computer-roll': 760,
	die: 520,
	decision: 480,
	'ludo-step': 105,
	landing: 410,
	transport: 720,
	'no-move': 680,
	turn: 280
};

export function timing(kind: TimingKind, pace: Pace, reducedMotion = false) {
	if (reducedMotion) {
		return kind === 'computer-roll' || kind === 'decision' ? 180 : 60;
	}
	return Math.round(NORMAL_TIMINGS[kind] * paceMultiplier(pace));
}

type TimerHandle = ReturnType<typeof setTimeout>;

/** Cancels stale presentation work without changing committed game state. */
export class EffectScheduler {
	#generation = 0;
	#handles = new Set<TimerHandle>();
	#activeKey: string | null = null;

	get generation() {
		return this.#generation;
	}

	get activeKey() {
		return this.#activeKey;
	}

	schedule(key: string, delay: number, callback: () => void) {
		if (this.#activeKey === key) return false;
		this.cancel();
		const generation = this.#generation;
		this.#activeKey = key;
		const handle = setTimeout(
			() => {
				this.#handles.delete(handle);
				if (generation !== this.#generation || this.#activeKey !== key) return;
				this.#activeKey = null;
				callback();
			},
			Math.max(0, delay)
		);
		this.#handles.add(handle);
		return true;
	}

	sequence<T>(
		key: string,
		steps: readonly T[],
		delay: number,
		onStep: (step: T, index: number) => void,
		onDone: () => void
	) {
		if (this.#activeKey === key) return false;
		this.cancel();
		const generation = this.#generation;
		this.#activeKey = key;
		let index = 0;
		const advance = () => {
			if (generation !== this.#generation || this.#activeKey !== key) return;
			if (index >= steps.length) {
				this.#activeKey = null;
				onDone();
				return;
			}
			onStep(steps[index], index);
			index += 1;
			const handle = setTimeout(
				() => {
					this.#handles.delete(handle);
					advance();
				},
				Math.max(0, delay)
			);
			this.#handles.add(handle);
		};
		advance();
		return true;
	}

	cancel() {
		this.#generation += 1;
		for (const handle of this.#handles) clearTimeout(handle);
		this.#handles.clear();
		this.#activeKey = null;
	}
}
