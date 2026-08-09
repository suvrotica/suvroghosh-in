import type { SonicEvent } from './contracts';
import { AUDIO_SCHEDULER_INTERVAL_MS, AUDIO_SCHEDULER_LOOKAHEAD_SECONDS, clamp } from './safety';

export type ScheduleEventCallback = (
	event: SonicEvent,
	audioTime: number,
	eventIndex: number
) => void;

export type SchedulerTimerHost = Readonly<{
	setInterval(callback: () => void, intervalMs: number): unknown;
	clearInterval(handle: unknown): void;
}>;

const defaultTimerHost: SchedulerTimerHost = {
	setInterval(callback, intervalMs) {
		return globalThis.setInterval(callback, intervalMs);
	},
	clearInterval(handle) {
		globalThis.clearInterval(handle as ReturnType<typeof setInterval>);
	}
};

type IndexedEvent = Readonly<{ event: SonicEvent; originalIndex: number }>;

export type SchedulerDebugSnapshot = Readonly<{
	playing: boolean;
	playheadSeconds: number;
	nextEventIndex: number;
	queuedEvents: number;
	scheduledEvents: number;
	intervalMs: number;
	lookaheadSeconds: number;
	playbackRate: number;
}>;

function scoreTime(event: SonicEvent): number {
	return Number.isFinite(event.time) ? Math.max(0, event.time) : 0;
}

export class OrchestraLookaheadScheduler {
	readonly intervalMs: number;
	readonly lookaheadSeconds: number;

	private events: IndexedEvent[] = [];
	private nextIndex = 0;
	private timer: unknown = null;
	private playing = false;
	private anchorAudioTime = 0;
	private anchorScoreTime = 0;
	private pausedScoreTime = 0;
	private playbackRate = 1;
	private scheduledCount = 0;
	private disposed = false;

	constructor(
		private readonly audioClock: Pick<BaseAudioContext, 'currentTime'>,
		private readonly scheduleEvent: ScheduleEventCallback,
		private readonly timerHost: SchedulerTimerHost = defaultTimerHost,
		options: { intervalMs?: number; lookaheadSeconds?: number } = {}
	) {
		this.intervalMs = Math.round(clamp(options.intervalMs ?? AUDIO_SCHEDULER_INTERVAL_MS, 10, 100));
		this.lookaheadSeconds = clamp(
			options.lookaheadSeconds ?? AUDIO_SCHEDULER_LOOKAHEAD_SECONDS,
			0.05,
			0.5
		);
	}

	setEvents(events: readonly SonicEvent[]): void {
		this.ensureActive();
		const position = this.position();
		this.events = events
			.map((event, originalIndex) => ({ event, originalIndex }))
			.sort(
				(first, second) =>
					scoreTime(first.event) - scoreTime(second.event) ||
					String(first.event.id).localeCompare(String(second.event.id)) ||
					first.originalIndex - second.originalIndex
			);
		this.seekIndex(position);
	}

	play(scorePosition = this.pausedScoreTime): void {
		this.ensureActive();
		if (this.playing) return;
		this.anchorAudioTime = this.audioClock.currentTime;
		this.anchorScoreTime = Math.max(0, scorePosition);
		this.pausedScoreTime = this.anchorScoreTime;
		this.seekIndex(this.anchorScoreTime);
		this.playing = true;
		this.tick();
		this.timer = this.timerHost.setInterval(() => this.tick(), this.intervalMs);
	}

	pause(): number {
		if (!this.playing) return this.pausedScoreTime;
		this.pausedScoreTime = this.position();
		this.playing = false;
		this.clearTimer();
		this.seekIndex(this.pausedScoreTime);
		return this.pausedScoreTime;
	}

	seek(scorePosition: number): void {
		this.ensureActive();
		const next = Math.max(0, Number.isFinite(scorePosition) ? scorePosition : 0);
		this.pausedScoreTime = next;
		this.anchorScoreTime = next;
		this.anchorAudioTime = this.audioClock.currentTime;
		this.seekIndex(next);
		if (this.playing) this.tick();
	}

	setPlaybackRate(rate: number): number {
		this.ensureActive();
		const position = this.position();
		this.playbackRate = clamp(rate, 0.25, 4);
		this.anchorScoreTime = position;
		this.pausedScoreTime = position;
		this.anchorAudioTime = this.audioClock.currentTime;
		return this.playbackRate;
	}

	position(): number {
		if (!this.playing) return this.pausedScoreTime;
		return Math.max(
			0,
			this.anchorScoreTime +
				(this.audioClock.currentTime - this.anchorAudioTime) * this.playbackRate
		);
	}

	tick(): void {
		if (!this.playing || this.disposed) return;
		const now = this.audioClock.currentTime;
		const scoreNow = this.position();
		const scoreHorizon = scoreNow + this.lookaheadSeconds * this.playbackRate;
		while (this.nextIndex < this.events.length) {
			const indexed = this.events[this.nextIndex];
			const eventTime = scoreTime(indexed.event);
			if (eventTime > scoreHorizon) break;
			const mappedAudioTime =
				this.anchorAudioTime + (eventTime - this.anchorScoreTime) / this.playbackRate;
			this.scheduleEvent(
				indexed.event,
				Math.max(now + 0.003, mappedAudioTime),
				indexed.originalIndex
			);
			this.nextIndex += 1;
			this.scheduledCount += 1;
		}
	}

	debugSnapshot(): SchedulerDebugSnapshot {
		return {
			playing: this.playing,
			playheadSeconds: this.position(),
			nextEventIndex: this.nextIndex,
			queuedEvents: Math.max(0, this.events.length - this.nextIndex),
			scheduledEvents: this.scheduledCount,
			intervalMs: this.intervalMs,
			lookaheadSeconds: this.lookaheadSeconds,
			playbackRate: this.playbackRate
		};
	}

	dispose(): void {
		if (this.disposed) return;
		this.pause();
		this.disposed = true;
		this.events = [];
	}

	private seekIndex(scorePosition: number): void {
		let low = 0;
		let high = this.events.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (scoreTime(this.events[middle].event) < scorePosition - 0.0005) low = middle + 1;
			else high = middle;
		}
		this.nextIndex = low;
	}

	private clearTimer(): void {
		if (this.timer === null) return;
		this.timerHost.clearInterval(this.timer);
		this.timer = null;
	}

	private ensureActive(): void {
		if (this.disposed) throw new Error('The orchestra look-ahead scheduler has been disposed.');
	}
}
