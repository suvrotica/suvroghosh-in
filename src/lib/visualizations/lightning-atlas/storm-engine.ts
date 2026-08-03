import { PHASE_LABELS } from './config';
import { clamp } from './vectors';
import type { LightningFlash, StormPhase } from './types';

const flashDuration = (flash: LightningFlash) => flash.phaseEvents.at(-1)?.endTime ?? 0;
const phaseAtTime = (flash: LightningFlash, time: number) => {
	const bounded = clamp(time, 0, flashDuration(flash));
	return (
		flash.phaseEvents.find((event) => bounded >= event.startTime && bounded < event.endTime) ??
		flash.phaseEvents.at(-1)
	);
};

export type PlaybackSnapshot = {
	time: number;
	duration: number;
	phase: StormPhase;
	phaseLabel: string;
	phaseProgress: number;
	playing: boolean;
	chargeReservoir: number;
};

export class StormPlaybackEngine {
	readonly fixedStep = 1 / 60;
	private accumulator = 0;
	private time = 0;
	private playing = false;
	private speed = 1;
	private flash: LightningFlash | null = null;

	load(flash: LightningFlash, autoplay = true) {
		this.flash = flash;
		this.time = 0;
		this.accumulator = 0;
		this.playing = autoplay;
	}

	setSpeed(speed: number) {
		this.speed = clamp(speed, 0.25, 4);
	}

	play() {
		if (this.flash && this.time >= flashDuration(this.flash)) this.time = 0;
		this.playing = Boolean(this.flash);
	}

	pause() {
		this.playing = false;
	}

	toggle() {
		if (this.playing) this.pause();
		else this.play();
	}

	seek(time: number) {
		this.time = clamp(time, 0, this.flash ? flashDuration(this.flash) : 0);
		this.accumulator = 0;
	}

	stepPhase(direction: -1 | 1) {
		if (!this.flash) return;
		const events = this.flash.phaseEvents;
		const foundIndex = events.findIndex(
			(event) => this.time >= event.startTime && this.time < event.endTime
		);
		const currentIndex =
			foundIndex >= 0
				? foundIndex
				: this.time >= (events.at(-1)?.endTime ?? 0)
					? events.length - 1
					: 0;
		const nextIndex = clamp(currentIndex + direction, 0, events.length - 1);
		this.seek(events[nextIndex].startTime + 0.001);
		this.pause();
	}

	advance(wallDeltaSeconds: number) {
		if (!this.flash || !this.playing) return this.snapshot();
		this.accumulator += clamp(wallDeltaSeconds, 0, 0.25) * this.speed;
		while (this.accumulator >= this.fixedStep) {
			this.time += this.fixedStep;
			this.accumulator -= this.fixedStep;
		}
		const duration = flashDuration(this.flash);
		if (this.time >= duration) {
			this.time = duration;
			this.playing = false;
		}
		return this.snapshot();
	}

	snapshot(): PlaybackSnapshot {
		const duration = this.flash ? flashDuration(this.flash) : 0;
		const event = this.flash ? phaseAtTime(this.flash, this.time) : undefined;
		const phase = event?.phase ?? 'charging';
		const eventDuration = Math.max(0.001, (event?.endTime ?? 1) - (event?.startTime ?? 0));
		const phaseProgress = clamp((this.time - (event?.startTime ?? 0)) / eventDuration, 0, 1);
		let chargeReservoir = 0.35 + phaseProgress * 0.55;
		if (phase === 'return-stroke' || phase === 'in-cloud-pulse' || phase === 'subsequent-stroke')
			chargeReservoir = 0.18;
		if (phase === 'afterglow' || phase === 'thunder-pending') chargeReservoir = 0.12;
		if (phase === 'recharging') chargeReservoir = 0.12 + phaseProgress * 0.42;
		return {
			time: this.time,
			duration,
			phase,
			phaseLabel: event?.label ?? PHASE_LABELS[phase],
			phaseProgress,
			playing: this.playing,
			chargeReservoir
		};
	}
}
