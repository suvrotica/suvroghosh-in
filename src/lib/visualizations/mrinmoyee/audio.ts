/** Original synthesized tones; instantiated only after the visitor enables sound. */
export class AtelierSound {
	private context?: AudioContext;
	private gain?: GainNode;
	private timer?: ReturnType<typeof setTimeout>;
	private enabled = false;
	private disposed = false;
	private generation = 0;
	private beat = 0;
	private mode: 'bells' | 'dhak' = 'bells';
	private volume = 0.16;

	async start(): Promise<void> {
		if (this.disposed) return;
		const generation = ++this.generation;
		this.context ??= new AudioContext();
		if (!this.gain) {
			this.gain = this.context.createGain();
			this.gain.gain.value = this.volume;
			this.gain.connect(this.context.destination);
		}
		await this.context.resume();
		if (this.disposed || generation !== this.generation) return;
		if (this.timer) clearTimeout(this.timer);
		this.enabled = true;
		this.schedule();
	}

	setVolume(value: number): void {
		this.volume = Math.max(0, Math.min(0.35, value));
		if (this.context && this.gain)
			this.gain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.05);
	}

	setMode(mode: 'bells' | 'dhak'): void {
		this.mode = mode;
		this.beat = 0;
		if (this.timer) clearTimeout(this.timer);
		this.schedule();
	}

	bell(): void {
		if (!this.enabled || !this.context || !this.gain) return;
		const time = this.context.currentTime;
		[523.25, 1048.5, 1466, 2178].forEach((frequency, index) => {
			const oscillator = this.context!.createOscillator();
			const envelope = this.context!.createGain();
			oscillator.type = 'sine';
			oscillator.frequency.value = frequency;
			envelope.gain.setValueAtTime(0.0001, time);
			envelope.gain.exponentialRampToValueAtTime(0.18 / (index + 1), time + 0.008);
			envelope.gain.exponentialRampToValueAtTime(0.0001, time + 2.6 - index * 0.35);
			oscillator.connect(envelope);
			envelope.connect(this.gain!);
			oscillator.start(time);
			oscillator.stop(time + 2.8);
			oscillator.onended = () => {
				oscillator.disconnect();
				envelope.disconnect();
			};
		});
	}

	private drum(): void {
		if (!this.enabled || !this.context || !this.gain) return;
		const time = this.context.currentTime;
		const oscillator = this.context.createOscillator();
		const envelope = this.context.createGain();
		const accent = this.beat % 4 === 0;
		oscillator.frequency.setValueAtTime(accent ? 140 : 200, time);
		oscillator.frequency.exponentialRampToValueAtTime(accent ? 52 : 85, time + 0.12);
		envelope.gain.setValueAtTime(accent ? 0.34 : 0.14, time);
		envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
		oscillator.connect(envelope);
		envelope.connect(this.gain);
		oscillator.start(time);
		oscillator.stop(time + 0.3);
		oscillator.onended = () => {
			oscillator.disconnect();
			envelope.disconnect();
		};
	}

	private schedule(): void {
		if (!this.enabled) return;
		if (this.mode === 'dhak') this.drum();
		else if (this.beat % 8 === 0) this.bell();
		this.beat += 1;
		this.timer = setTimeout(() => this.schedule(), this.mode === 'dhak' ? 480 : 1100);
	}

	async stop(): Promise<void> {
		this.generation++;
		this.enabled = false;
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
		if (this.context && this.context.state !== 'closed') await this.context.suspend();
	}

	dispose(): void {
		this.disposed = true;
		this.generation++;
		this.enabled = false;
		if (this.timer) clearTimeout(this.timer);
		if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
		this.context = undefined;
		this.gain = undefined;
	}
}
