import { describe, expect, it } from 'vitest';
import {
	Soundscape,
	altitudeSoundWeights,
	createMajorAudioSchedule,
	majorAudioScheduleSignature
} from './Soundscape';

class FakeAudioParam {
	value = 0;
	readonly targets: Array<{ value: number; at: number; smoothing: number }> = [];

	setTargetAtTime(value: number, at: number, smoothing: number): FakeAudioParam {
		this.value = value;
		this.targets.push({ value, at, smoothing });
		return this;
	}
}

class FakeAudioNode {
	readonly connections: unknown[] = [];
	disconnected = false;

	connect(destination: unknown): unknown {
		this.connections.push(destination);
		return destination;
	}

	disconnect(): void {
		this.disconnected = true;
	}
}

class FakeGain extends FakeAudioNode {
	readonly gain = new FakeAudioParam();
}

class FakeCompressor extends FakeAudioNode {
	readonly threshold = new FakeAudioParam();
	readonly knee = new FakeAudioParam();
	readonly ratio = new FakeAudioParam();
	readonly attack = new FakeAudioParam();
	readonly release = new FakeAudioParam();
}

class FakeFilter extends FakeAudioNode {
	type = 'lowpass';
	readonly frequency = new FakeAudioParam();
	readonly Q = new FakeAudioParam();
}

class FakePanner extends FakeAudioNode {
	panningModel = 'HRTF';
	distanceModel = 'inverse';
	refDistance = 1;
	maxDistance = 10;
	rolloffFactor = 1;
	readonly positionX = new FakeAudioParam();
	readonly positionY = new FakeAudioParam();
	readonly positionZ = new FakeAudioParam();
}

class FakeStereoPanner extends FakeAudioNode {
	readonly pan = new FakeAudioParam();
}

class FakeBufferSource extends FakeAudioNode {
	buffer: unknown = null;
	loop = false;
	readonly playbackRate = new FakeAudioParam();
	started = false;
	stopped = false;
	private ended: (() => void) | null = null;

	start(): void {
		this.started = true;
	}

	stop(): void {
		this.stopped = true;
	}

	addEventListener(type: string, callback: () => void): void {
		if (type === 'ended') this.ended = callback;
	}

	finish(): void {
		this.ended?.();
	}
}

class FakeAudioContext {
	state: AudioContextState = 'suspended';
	currentTime = 2;
	readonly destination = new FakeAudioNode();
	readonly listener = {
		positionX: new FakeAudioParam(),
		positionY: new FakeAudioParam(),
		positionZ: new FakeAudioParam(),
		forwardX: new FakeAudioParam(),
		forwardY: new FakeAudioParam(),
		forwardZ: new FakeAudioParam(),
		upX: new FakeAudioParam(),
		upY: new FakeAudioParam(),
		upZ: new FakeAudioParam()
	};
	readonly sources: FakeBufferSource[] = [];
	resumeCalls = 0;
	suspendCalls = 0;
	closeCalls = 0;

	createGain(): FakeGain {
		return new FakeGain();
	}

	createDynamicsCompressor(): FakeCompressor {
		return new FakeCompressor();
	}

	createBiquadFilter(): FakeFilter {
		return new FakeFilter();
	}

	createPanner(): FakePanner {
		return new FakePanner();
	}

	createStereoPanner(): FakeStereoPanner {
		return new FakeStereoPanner();
	}

	createBufferSource(): FakeBufferSource {
		const source = new FakeBufferSource();
		this.sources.push(source);
		return source;
	}

	async resume(): Promise<void> {
		this.resumeCalls += 1;
		this.state = 'running';
	}

	async suspend(): Promise<void> {
		this.suspendCalls += 1;
		this.state = 'suspended';
	}

	async close(): Promise<void> {
		this.closeCalls += 1;
		this.state = 'closed';
	}
}

describe('altitude sound crossfades', () => {
	it('stays smooth, non-negative and normalised through both register boundaries', () => {
		let previous = altitudeSoundWeights(0);
		for (let altitude = 0.25; altitude <= 240; altitude += 0.25) {
			const current = altitudeSoundWeights(altitude);
			expect(current.low + current.middle + current.high).toBeCloseTo(1, 10);
			expect(Math.abs(current.low - previous.low)).toBeLessThan(0.04);
			expect(Math.abs(current.middle - previous.middle)).toBeLessThan(0.04);
			expect(Math.abs(current.high - previous.high)).toBeLessThan(0.04);
			previous = current;
		}
		expect(altitudeSoundWeights(5).low).toBeGreaterThan(0.9);
		expect(altitudeSoundWeights(90).middle).toBeGreaterThan(0.9);
		expect(altitudeSoundWeights(230).high).toBeGreaterThan(0.9);
	});

	it('restores close-flight detail beside high architecture', () => {
		expect(altitudeSoundWeights(200, 1)).toEqual({ low: 0.55, middle: 0.4, high: 0.05 });
	});
});

describe('major sound scheduling', () => {
	it('is deterministic, bounded, sorted and district-plausible', () => {
		const first = createMajorAudioSchedule({
			seed: 'winter-haze',
			district: 'hooghly',
			durationSeconds: 180
		});
		const again = createMajorAudioSchedule({
			seed: 'winter-haze',
			district: 'hooghly',
			durationSeconds: 180
		});
		expect(first).toEqual(again);
		expect(majorAudioScheduleSignature(first)).toBe(majorAudioScheduleSignature(again));
		expect(first.length).toBeGreaterThan(3);
		expect(first.every((event) => event.kind === 'ferry-horn' || event.kind === 'train')).toBe(
			true
		);
		for (let index = 1; index < first.length; index += 1) {
			expect(first[index].atSeconds).toBeGreaterThan(first[index - 1].atSeconds);
		}
	});
});

describe('lazy central soundscape lifecycle', () => {
	it('constructs and fetches nothing for silent play', async () => {
		let factoryCalls = 0;
		let loaderCalls = 0;
		const soundscape = new Soundscape({
			contextFactory: () => {
				factoryCalls += 1;
				return new FakeAudioContext() as unknown as AudioContext;
			},
			bufferLoader: async () => {
				loaderCalls += 1;
				return {} as AudioBuffer;
			}
		});

		expect(soundscape.debugSnapshot().contextConstructed).toBe(false);
		expect(await soundscape.activateFromUserGesture({ audible: false })).toBe(false);
		expect(factoryCalls).toBe(0);
		expect(loaderCalls).toBe(0);
		expect(soundscape.debugSnapshot()).toMatchObject({
			graphConstructed: false,
			silentMode: true
		});
		await soundscape.destroy();
	});

	it('adopts a gesture-created context, loads the local bed, and tears everything down', async () => {
		const context = new FakeAudioContext();
		const loadedUrls: string[] = [];
		const soundscape = new Soundscape({
			bufferLoader: async (url) => {
				loadedUrls.push(url);
				return {} as AudioBuffer;
			}
		});
		soundscape.attachContext(context as unknown as AudioContext);
		expect(await soundscape.activateFromUserGesture()).toBe(true);
		expect(loadedUrls).toEqual(['/games/kagojer-dana/audio/calcutta-bed.wav']);
		expect(context.sources.some((source) => source.loop && source.started)).toBe(true);
		expect(soundscape.debugSnapshot()).toMatchObject({
			contextConstructed: true,
			graphConstructed: true,
			activated: true,
			loadedAssets: ['cityBed']
		});

		soundscape.setMuted(true);
		expect(soundscape.debugSnapshot().muted).toBe(true);
		await soundscape.pause();
		expect(context.state).toBe('suspended');
		await soundscape.resume();
		expect(context.state).toBe('running');
		await soundscape.destroy();
		expect(context.closeCalls).toBe(1);
		expect(context.sources.every((source) => source.stopped)).toBe(true);
	});
});
