import { describe, expect, it } from 'vitest';
import { StrangeAttractorAudioEngine } from './audio-engine';
import type { SchedulerTimerHost } from './scheduler';

class FakeAudioParam {
	value: number;

	constructor(value = 0) {
		this.value = value;
	}

	cancelScheduledValues(): this {
		return this;
	}

	setValueAtTime(value: number): this {
		this.value = value;
		return this;
	}

	linearRampToValueAtTime(value: number): this {
		this.value = value;
		return this;
	}

	exponentialRampToValueAtTime(value: number): this {
		this.value = value;
		return this;
	}

	setTargetAtTime(value: number): this {
		this.value = value;
		return this;
	}
}

class FakeAudioNode {
	connect<TDestination>(destination: TDestination): TDestination {
		return destination;
	}

	disconnect(): void {}
}

class FakeGainNode extends FakeAudioNode {
	readonly gain = new FakeAudioParam(1);
}

class FakeBiquadFilterNode extends FakeAudioNode {
	type = 'lowpass';
	readonly frequency = new FakeAudioParam(350);
	readonly Q = new FakeAudioParam(1);
	readonly gain = new FakeAudioParam(0);
}

class FakeDynamicsCompressorNode extends FakeAudioNode {
	readonly threshold = new FakeAudioParam();
	readonly knee = new FakeAudioParam();
	readonly ratio = new FakeAudioParam();
	readonly attack = new FakeAudioParam();
	readonly release = new FakeAudioParam();
}

class FakeWaveShaperNode extends FakeAudioNode {
	curve: Float32Array<ArrayBuffer> | null = null;
	oversample = 'none';
}

class FakeStereoPannerNode extends FakeAudioNode {
	readonly pan = new FakeAudioParam();
}

class FakeDelayNode extends FakeAudioNode {
	readonly delayTime = new FakeAudioParam();
}

class FakeAudioBuffer {
	readonly duration: number;
	private readonly channels: Float32Array<ArrayBuffer>[];

	constructor(
		readonly numberOfChannels: number,
		readonly length: number,
		readonly sampleRate: number
	) {
		this.duration = length / sampleRate;
		this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
	}

	copyToChannel(source: Float32Array<ArrayBufferLike>, channel: number): void {
		this.channels[channel]?.set(source.subarray(0, this.length));
	}
}

class FakeAudioBufferSourceNode extends FakeAudioNode {
	buffer: FakeAudioBuffer | null = null;
	loop = false;

	start(): void {}
	stop(): void {}
}

class FakeOscillatorNode extends FakeAudioNode {
	type = 'sine';
	readonly frequency = new FakeAudioParam(440);
	readonly detune = new FakeAudioParam();

	addEventListener(): void {}
	start(): void {}
	stop(): void {}
}

class FakeAudioContext {
	currentTime = 0;
	readonly sampleRate = 48_000;
	state: AudioContextState = 'running';
	readonly destination = new FakeAudioNode();

	createGain(): FakeGainNode {
		return new FakeGainNode();
	}

	createBiquadFilter(): FakeBiquadFilterNode {
		return new FakeBiquadFilterNode();
	}

	createDynamicsCompressor(): FakeDynamicsCompressorNode {
		return new FakeDynamicsCompressorNode();
	}

	createWaveShaper(): FakeWaveShaperNode {
		return new FakeWaveShaperNode();
	}

	createStereoPanner(): FakeStereoPannerNode {
		return new FakeStereoPannerNode();
	}

	createDelay(): FakeDelayNode {
		return new FakeDelayNode();
	}

	createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
		return new FakeAudioBuffer(channels, length, sampleRate);
	}

	createBufferSource(): FakeAudioBufferSourceNode {
		return new FakeAudioBufferSourceNode();
	}

	createOscillator(): FakeOscillatorNode {
		return new FakeOscillatorNode();
	}

	async resume(): Promise<void> {
		this.state = 'running';
	}

	async suspend(): Promise<void> {
		this.state = 'suspended';
	}

	async close(): Promise<void> {
		this.state = 'closed';
	}
}

const inertTimers: SchedulerTimerHost = {
	setInterval() {
		return Symbol('scheduler');
	},
	clearInterval() {}
};

function score(size: number) {
	return Object.freeze(
		Array.from({ length: size }, (_, index) =>
			Object.freeze({
				id: `event-${index}`,
				time: index * 0.001,
				type: index % 2 === 0 ? ('fold' as const) : ('recurrence' as const),
				curvature: (index % 7) / 6,
				stretching: (index % 5) / 4,
				noise: 0.5
			})
		)
	);
}

function engineWithFakeContext(
	options: ConstructorParameters<typeof StrangeAttractorAudioEngine>[0] = {}
) {
	const context = new FakeAudioContext();
	const engine = new StrangeAttractorAudioEngine({
		...options,
		contextFactory: () => context as unknown as AudioContext,
		timerHost: inertTimers,
		visibilityDocument: null
	});
	return { context, engine };
}

describe('real-time ephemeral performance contracts', () => {
	it('moves from silence to texture to one voice to the complete score', async () => {
		const { engine } = engineWithFakeContext();
		const canonicalScore = score(12);
		const before = JSON.stringify(canonicalScore);
		engine.setScore(canonicalScore, 'guided-test');
		engine.setGuidedIntroStage('shot-1');
		await engine.start();

		expect(engine.debugSnapshot()).toMatchObject({
			guidedIntroStage: 'shot-1',
			scheduledVoices: 0,
			guidedTextureActive: false
		});
		engine.setGuidedIntroStage('shot-2');
		expect(engine.debugSnapshot().scheduledVoices).toBe(0);

		engine.setGuidedIntroStage('shot-3');
		expect(engine.debugSnapshot()).toMatchObject({
			guidedIntroStage: 'shot-3',
			scheduledVoices: 0,
			guidedTextureActive: true,
			guidedTextureTargetGain: 0.00055
		});

		engine.setGuidedIntroStage('shot-4');
		expect(engine.debugSnapshot()).toMatchObject({
			guidedIntroStage: 'shot-4',
			scheduledVoices: 1,
			guidedTextureActive: false
		});

		engine.setGuidedIntroStage('shot-5');
		expect(engine.debugSnapshot().scheduledVoices).toBe(13);
		engine.setGuidedIntroStage('free');
		expect(engine.debugSnapshot().scheduledVoices).toBe(25);
		expect(JSON.stringify(canonicalScore)).toBe(before);
		await engine.dispose();
	});

	it('applies Lower intensity before start and composes with view and conducting', async () => {
		const canonicalScore = score(48);
		const before = JSON.stringify(canonicalScore);
		const standard = engineWithFakeContext();
		const lower = engineWithFakeContext({ voiceCap: 3 });
		standard.engine.setScore(canonicalScore, 'intensity-test');
		lower.engine.setScore(canonicalScore, 'intensity-test');

		lower.engine.setObservationView('raw');
		lower.engine.setConducting(0.4, -0.35, true);
		expect(lower.engine.setIntensityMode('lower')).toBe('lower');
		expect(lower.engine.debugSnapshot()).toMatchObject({
			contextConstructed: false,
			observationView: 'raw',
			intensityMode: 'lower',
			masterVolume: 0.23,
			voiceCap: 3
		});

		await standard.engine.start();
		await lower.engine.start();
		const standardSnapshot = standard.engine.debugSnapshot();
		const lowerSnapshot = lower.engine.debugSnapshot();
		expect(lowerSnapshot.scheduledVoices).toBeGreaterThan(0);
		expect(lowerSnapshot.scheduledVoices).toBeLessThan(standardSnapshot.scheduledVoices);
		expect(lowerSnapshot.peakVoices).toBeLessThanOrEqual(3);
		expect(lowerSnapshot.polyphonyGainScale).toBeCloseTo(1 / Math.sqrt(3), 6);
		expect(lowerSnapshot.intensityToneGainDb).toBeLessThan(0);
		expect(lowerSnapshot.makeupGain).toBe(96);
		expect(lowerSnapshot.effect.feedback).toBeLessThan(standardSnapshot.effect.feedback);
		expect(lowerSnapshot.effect.wetGain).toBeLessThan(standardSnapshot.effect.wetGain);
		expect(lowerSnapshot.masterVolume).toBe(standardSnapshot.masterVolume);
		expect(JSON.stringify(canonicalScore)).toBe(before);

		await standard.engine.dispose();
		await lower.engine.dispose();
	});

	it('stores stage, intensity, and portrait voice cap without constructing audio early', async () => {
		let factoryCalls = 0;
		const engine = new StrangeAttractorAudioEngine({
			voiceCap: 2,
			contextFactory() {
				factoryCalls += 1;
				throw new Error('unexpected context');
			}
		});
		engine.setGuidedIntroStage('shot-3');
		engine.setIntensityMode('lower');
		expect(factoryCalls).toBe(0);
		expect(engine.debugSnapshot()).toMatchObject({
			contextConstructed: false,
			guidedIntroStage: 'shot-3',
			intensityMode: 'lower',
			voiceCap: 2,
			scheduledVoices: 0
		});
		await engine.dispose();
		expect(() => engine.setIntensityMode('standard')).toThrow(/disposed/iu);
	});
});
