const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export class TimelineState {
	age = $state(1);
	playing = $state(false);
	loop = $state(false);
	speed = $state(1);
	private timer: ReturnType<typeof setInterval> | undefined;
	private lastTime = 0;

	setAge(value: number): void {
		this.age = clamp01(value);
	}

	step(direction: -1 | 1, ringCount = 320): void {
		this.pause();
		this.setAge(this.age + direction / Math.max(2, ringCount - 1));
	}

	restart(play = false): void {
		this.pause();
		this.age = 0;
		if (play) this.play();
	}

	play(): void {
		if (this.playing || typeof window === 'undefined') return;
		if (this.age >= 1) this.age = 0;
		this.playing = true;
		this.lastTime = performance.now();
		this.timer = setInterval(() => {
			const now = performance.now();
			const elapsed = Math.min(0.1, (now - this.lastTime) / 1000);
			this.lastTime = now;
			const next = this.age + elapsed * 0.075 * this.speed;
			if (next >= 1) {
				if (this.loop) this.age = next % 1;
				else {
					this.age = 1;
					this.pause();
				}
			} else {
				this.age = next;
			}
		}, 24);
	}

	pause(): void {
		this.playing = false;
		if (this.timer !== undefined) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	toggle(): void {
		if (this.playing) this.pause();
		else this.play();
	}

	destroy(): void {
		this.pause();
	}
}
