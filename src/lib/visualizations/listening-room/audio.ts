import {
	DEFAULT_AUDIO_SETTINGS,
	EQ_FREQUENCIES,
	EQ_Q,
	SPECTRUM_FREQUENCIES,
	dbToGain,
	eqResponseDb,
	headroomDb,
	measureSamples,
	normalizeAudioSettings,
	stereoMatrix,
	type AudioSettings
} from './dsp';

export {
	DEFAULT_AUDIO_SETTINGS,
	EQ_FREQUENCIES,
	EQ_PRESETS,
	RESPONSE_FREQUENCIES,
	SPECTRUM_FREQUENCIES,
	createDemoWav,
	normalizeAudioSettings,
	type AudioSettings
} from './dsp';

export interface AudioSnapshot {
	sampleRate: number;
	headroomDb: number;
	/** Linear sample amplitudes, not LUFS or true-peak measurements. Peaks may exceed 1. */
	peakLeft: number;
	peakRight: number;
	rmsLeft: number;
	rmsRight: number;
	/** 48 log-spaced bands scaled from -90..0 dB to 0..1. */
	spectrum: number[];
}

/** One instance for one mounted media element; initialize/resume only in a user gesture. */
export class LocalAudioEngine {
	private context: AudioContext | null = null;
	private source: MediaElementAudioSourceNode | null = null;
	private nodes: AudioNode[] = [];
	private trim: GainNode | null = null;
	private filters: BiquadFilterNode[] = [];
	private matrix: GainNode[] = [];
	private volume: GainNode | null = null;
	private spectrumAnalyser: AnalyserNode | null = null;
	private leftAnalyser: AnalyserNode | null = null;
	private rightAnalyser: AnalyserNode | null = null;
	private frequencyData = new Float32Array(1024);
	private rightFrequencyData = new Float32Array(1024);
	private leftData = new Float32Array(2048);
	private rightData = new Float32Array(2048);
	private settings = normalizeAudioSettings(DEFAULT_AUDIO_SETTINGS);
	private currentHeadroom = 0;
	private destroyed = false;

	constructor(private readonly audio: HTMLAudioElement) {}

	async resume(): Promise<void> {
		if (this.destroyed) throw new Error('This audio player has been closed.');
		if (!this.context) this.initialize();
		if (this.context?.state !== 'running') await this.context?.resume();
	}

	private initialize(): void {
		const context = new AudioContext();
		this.context = context;
		try {
			this.source = context.createMediaElementSource(this.audio);
			this.audio.volume = 1;
			this.trim = context.createGain();
			this.filters = EQ_FREQUENCIES.map((frequency) => {
				const filter = context.createBiquadFilter();
				filter.type = 'peaking';
				filter.frequency.value = Math.min(frequency, context.sampleRate * 0.49);
				filter.Q.value = EQ_Q;
				return filter;
			});
			const splitter = context.createChannelSplitter(2);
			const merger = context.createChannelMerger(2);
			// Speaker interpretation duplicates mono input into L/R before the explicit matrix.
			this.trim.channelCount = 2;
			this.trim.channelCountMode = 'explicit';
			this.trim.channelInterpretation = 'speakers';
			this.matrix = Array.from({ length: 4 }, () => context.createGain());
			this.volume = context.createGain();
			this.spectrumAnalyser = context.createAnalyser();
			this.leftAnalyser = context.createAnalyser();
			this.rightAnalyser = context.createAnalyser();
			const meters = context.createChannelSplitter(2);
			for (const analyser of [this.spectrumAnalyser, this.leftAnalyser, this.rightAnalyser]) {
				analyser.fftSize = 2048;
				analyser.smoothingTimeConstant = 0.75;
			}
			this.nodes = [
				this.source,
				this.trim,
				...this.filters,
				splitter,
				...this.matrix,
				merger,
				this.volume,
				this.spectrumAnalyser,
				meters,
				this.leftAnalyser,
				this.rightAnalyser
			];
			this.source.connect(this.trim);
			let previous: AudioNode = this.trim;
			for (const filter of this.filters) {
				previous.connect(filter);
				previous = filter;
			}
			previous.connect(splitter);
			// ll, lr, rl, rr: explicit M/S encode, width, decode collapsed to a 2x2 matrix.
			const channels = [
				[0, 0],
				[1, 0],
				[0, 1],
				[1, 1]
			];
			channels.forEach(([input, output], i) => {
				splitter.connect(this.matrix[i], input);
				this.matrix[i].connect(merger, 0, output);
			});
			merger.connect(this.volume);
			this.volume.connect(this.spectrumAnalyser);
			this.spectrumAnalyser.connect(context.destination);
			this.volume.connect(meters);
			meters.connect(this.leftAnalyser, 0);
			meters.connect(this.rightAnalyser, 1);
			this.applySettings(true);
		} catch (error) {
			this.destroy();
			throw error;
		}
	}

	setSettings(settings: AudioSettings): void {
		this.settings = normalizeAudioSettings(settings);
		if (!this.destroyed) this.applySettings();
	}

	private smooth(param: AudioParam, value: number, immediate: boolean): void {
		const now = this.context?.currentTime ?? 0;
		if (immediate) {
			param.setValueAtTime(value, now);
			return;
		}
		if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
		else {
			param.cancelScheduledValues(now);
			param.setValueAtTime(param.value, now);
		}
		param.setTargetAtTime(value, now, 0.025);
	}

	private applySettings(immediate = false): void {
		if (!this.context || !this.trim || !this.volume) return;
		const s = this.settings;
		this.currentHeadroom = headroomDb(s, this.context.sampleRate);
		this.smooth(
			this.trim.gain,
			dbToGain(s.bypass ? 0 : s.trimDb + this.currentHeadroom),
			immediate
		);
		this.filters.forEach((filter, i) =>
			this.smooth(filter.gain, s.bypass ? 0 : s.eq[i], immediate)
		);
		const matrix = s.bypass ? stereoMatrix(1) : stereoMatrix(s.width, s.balance, s.mono);
		[matrix.ll, matrix.lr, matrix.rl, matrix.rr].forEach((value, i) =>
			this.smooth(this.matrix[i].gain, value, immediate)
		);
		this.smooth(this.volume.gain, s.volume / 100, immediate);
	}

	getFrequencyResponse(): number[] {
		return eqResponseDb(
			this.settings.bypass ? EQ_FREQUENCIES.map(() => 0) : this.settings.eq,
			this.context?.sampleRate ?? 48000
		);
	}

	getSnapshot(): AudioSnapshot {
		const empty: AudioSnapshot = {
			sampleRate: this.context?.sampleRate ?? 0,
			headroomDb: this.currentHeadroom,
			peakLeft: 0,
			peakRight: 0,
			rmsLeft: 0,
			rmsRight: 0,
			spectrum: SPECTRUM_FREQUENCIES.map(() => 0)
		};
		if (
			this.destroyed ||
			this.context?.state !== 'running' ||
			this.audio.paused ||
			!this.leftAnalyser ||
			!this.rightAnalyser ||
			!this.spectrumAnalyser
		)
			return empty;
		this.leftAnalyser.getFloatTimeDomainData(this.leftData);
		this.rightAnalyser.getFloatTimeDomainData(this.rightData);
		// Average channel power instead of downmixing, which would hide opposite-phase sound.
		this.leftAnalyser.getFloatFrequencyData(this.frequencyData);
		this.rightAnalyser.getFloatFrequencyData(this.rightFrequencyData);
		const left = measureSamples(this.leftData);
		const right = measureSamples(this.rightData);
		const binHz = this.context.sampleRate / this.spectrumAnalyser.fftSize;
		const spectrum = SPECTRUM_FREQUENCIES.map((frequency) => {
			const bin = Math.min(
				this.frequencyData.length - 1,
				Math.max(1, Math.round(frequency / binHz))
			);
			const power =
				(10 ** (this.frequencyData[bin] / 10) + 10 ** (this.rightFrequencyData[bin] / 10)) / 2;
			const db = 10 * Math.log10(power);
			return Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 90) / 90)) : 0;
		});
		return {
			...empty,
			peakLeft: left.peak,
			peakRight: right.peak,
			rmsLeft: left.rms,
			rmsRight: right.rms,
			spectrum
		};
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.audio.pause();
		for (const node of this.nodes) node.disconnect();
		this.nodes = [];
		this.source = null;
		const context = this.context;
		this.context = null;
		if (context && context.state !== 'closed') void context.close().catch(() => undefined);
	}
}
