export type SpatialAudioBus =
	| 'ambience'
	| 'traffic'
	| 'people'
	| 'animals'
	| 'interaction'
	| 'weather';

export type SpatialSoundKind =
	| 'motorbike'
	| 'bicycle'
	| 'rickshaw'
	| 'handcart'
	| 'car'
	| 'crowd'
	| 'tea-stall'
	| 'dog'
	| 'workshop';

export type SpatialOneShot =
	| 'bell'
	| 'horn'
	| 'footstep'
	| 'splash'
	| 'stumble'
	| 'tea'
	| 'snack'
	| 'bark'
	| 'reaction'
	| 'arrival';

export interface AudioListenerFrame {
	x: number;
	y: number;
	z: number;
	heading: number;
	vx: number;
	vz: number;
	enclosure: number;
	raining: boolean;
}

export interface MovingAudioSource {
	id: string;
	kind: SpatialSoundKind;
	x: number;
	y?: number;
	z: number;
	vx: number;
	vz: number;
	active: boolean;
	occluded: boolean;
}

export interface SpatialAudioDebugSource {
	id: string;
	distance: number;
	gain: number;
	occluded: boolean;
	radialVelocity: number;
	doppler: number;
}

export interface SpatialAudioDebugSnapshot {
	contextState: AudioContextState | 'unavailable';
	activeNodes: number;
	listener: AudioListenerFrame | null;
	sources: readonly SpatialAudioDebugSource[];
}

export interface AcousticZoneMix {
	enclosure: number;
	ambienceGain: number;
	ambienceLowpassHz: number;
	weatherGain: number;
	weatherLowpassHz: number;
	rainLayerGain: number;
}

export interface SpatialOneShotCandidate {
	id: string;
	kind: SpatialOneShot;
	category: 'traffic' | 'people' | 'animals' | 'interaction' | 'weather';
	priority: 'ambient' | 'normal' | 'important';
}

type SharedAudioGraph = {
	context: AudioContext;
	master: GainNode;
	compressor: DynamicsCompressorNode;
	buses: Record<SpatialAudioBus, GainNode>;
	zoneFilters: {
		ambience: BiquadFilterNode;
		weather: BiquadFilterNode;
	};
};

type SourceVoice = {
	id: string;
	kind: SpatialSoundKind;
	baseFrequency: number;
	oscillator: OscillatorNode;
	secondOscillator: OscillatorNode | null;
	filter: BiquadFilterNode;
	panner: PannerNode;
	gain: GainNode;
	lastX: number;
	lastZ: number;
	doppler: number;
	debug: SpatialAudioDebugSource;
};

export const DOPPLER_RATE_RANGE = { minimum: 0.92, maximum: 1.08 } as const;
export const OMNIDIRECTIONAL_CONE = {
	innerAngle: 360,
	outerAngle: 360,
	outerGain: 1
} as const;
export const MAX_SPATIAL_ONE_SHOTS_PER_FRAME = 4;

const SOURCE_IMPORTANCE: Record<SpatialSoundKind, number> = {
	motorbike: 130,
	car: 125,
	rickshaw: 95,
	bicycle: 85,
	handcart: 70,
	dog: 35,
	crowd: 28,
	'tea-stall': 20,
	workshop: 20
};

const ONE_SHOT_PRIORITY: Record<SpatialOneShotCandidate['priority'], number> = {
	ambient: 0,
	normal: 150,
	important: 300
};

const ONE_SHOT_CATEGORY: Record<SpatialOneShotCandidate['category'], number> = {
	traffic: 60,
	animals: 35,
	interaction: 25,
	weather: 15,
	people: 10
};

const ONE_SHOT_URGENCY: Record<SpatialOneShot, number> = {
	horn: 250,
	bell: 230,
	stumble: 210,
	arrival: 130,
	bark: 70,
	splash: 60,
	tea: 30,
	snack: 30,
	reaction: 10,
	footstep: 0
};

function finiteUnit(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}

/** Maps the current street enclosure to restrained, audible ambience and rain coloration. */
export function acousticZoneMix(enclosureValue: number, raining: boolean): AcousticZoneMix {
	const enclosure = finiteUnit(enclosureValue);
	return {
		enclosure,
		ambienceGain: 0.25 - enclosure * 0.05,
		ambienceLowpassHz: 7_200 - enclosure * 3_900,
		weatherGain: 0.24 - enclosure * 0.045,
		weatherLowpassHz: 6_800 - enclosure * 3_200,
		rainLayerGain: raining ? 0.29 - enclosure * 0.13 : 0
	};
}

/**
 * Ranks continuous sources by proximity, intrinsic importance and closing speed. Approaching
 * traffic therefore survives a crowded voice budget without making distant, receding engines
 * permanently displace nearby street life.
 */
export function continuousSourcePriority(
	source: MovingAudioSource,
	listener: Pick<AudioListenerFrame, 'x' | 'z' | 'vx' | 'vz'>
): number {
	if (!source.active) return Number.NEGATIVE_INFINITY;
	const dx = source.x - listener.x;
	const dz = source.z - listener.z;
	const distance = Math.max(0.001, Math.hypot(dx, dz));
	const separationVelocity =
		((source.vx - listener.vx) * dx + (source.vz - listener.vz) * dz) / distance;
	const closingSpeed = Math.max(0, -separationVelocity);
	const proximity = Math.max(0, 60 - distance) * 2.4;
	return SOURCE_IMPORTANCE[source.kind] + proximity + closingSpeed * 32;
}

/** Selects a deterministic, bounded one-shot mix for a simulation frame. */
export function selectSpatialOneShotsForFrame<Event extends SpatialOneShotCandidate>(
	events: readonly Event[],
	limit = MAX_SPATIAL_ONE_SHOTS_PER_FRAME
): Event[] {
	const cap = Number.isFinite(limit)
		? Math.max(0, Math.floor(limit))
		: MAX_SPATIAL_ONE_SHOTS_PER_FRAME;
	return events
		.map((event, index) => ({
			event,
			index,
			score:
				ONE_SHOT_PRIORITY[event.priority] +
				ONE_SHOT_CATEGORY[event.category] +
				ONE_SHOT_URGENCY[event.kind]
		}))
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.slice(0, cap)
		.map(({ event }) => event);
}

/** Positive separation velocity is receding; negative is approaching. */
export function dopplerRateForRadialVelocity(
	separationVelocityMps: number,
	speedOfSoundMps = 343
): number {
	if (
		!Number.isFinite(separationVelocityMps) ||
		!Number.isFinite(speedOfSoundMps) ||
		speedOfSoundMps <= 0
	) {
		return 1;
	}
	const raw =
		speedOfSoundMps / Math.max(speedOfSoundMps * 0.72, speedOfSoundMps + separationVelocityMps);
	return Math.max(DOPPLER_RATE_RANGE.minimum, Math.min(DOPPLER_RATE_RANGE.maximum, raw));
}

export function distanceFilterFrequency(distanceM: number, occluded: boolean): number {
	const distance = Number.isFinite(distanceM) ? Math.max(0, distanceM) : 88;
	const distanceRollOff = Math.max(0.18, 1 - distance / 88);
	const openFrequency = 900 + 5_500 * distanceRollOff;
	return occluded ? Math.min(1_050, openFrequency) : openFrequency;
}

let sharedGraph: SharedAudioGraph | null = null;

function audioConstructor(): typeof AudioContext | null {
	if (typeof window === 'undefined') return null;
	return (
		window.AudioContext ??
		(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
		null
	);
}

function createSharedGraph(): SharedAudioGraph | null {
	if (sharedGraph && sharedGraph.context.state !== 'closed') return sharedGraph;
	const Constructor = audioConstructor();
	if (!Constructor) return null;
	const context = new Constructor({ latencyHint: 'interactive' });
	const master = context.createGain();
	const compressor = context.createDynamicsCompressor();
	compressor.threshold.value = -16;
	compressor.knee.value = 16;
	compressor.ratio.value = 3;
	compressor.attack.value = 0.012;
	compressor.release.value = 0.24;
	master.gain.value = 0;
	master.connect(compressor);
	compressor.connect(context.destination);

	const initialZone = acousticZoneMix(0.5, false);
	const zoneFilters = {
		ambience: context.createBiquadFilter(),
		weather: context.createBiquadFilter()
	};
	zoneFilters.ambience.type = 'lowpass';
	zoneFilters.ambience.frequency.value = initialZone.ambienceLowpassHz;
	zoneFilters.ambience.Q.value = 0.28;
	zoneFilters.ambience.connect(master);
	zoneFilters.weather.type = 'lowpass';
	zoneFilters.weather.frequency.value = initialZone.weatherLowpassHz;
	zoneFilters.weather.Q.value = 0.28;
	zoneFilters.weather.connect(master);

	const levels: Record<SpatialAudioBus, number> = {
		ambience: initialZone.ambienceGain,
		traffic: 0.34,
		people: 0.2,
		animals: 0.22,
		interaction: 0.3,
		weather: initialZone.weatherGain
	};
	const buses = Object.fromEntries(
		(Object.keys(levels) as SpatialAudioBus[]).map((name) => {
			const gain = context.createGain();
			gain.gain.value = levels[name];
			gain.connect(
				name === 'ambience'
					? zoneFilters.ambience
					: name === 'weather'
						? zoneFilters.weather
						: master
			);
			return [name, gain];
		})
	) as Record<SpatialAudioBus, GainNode>;

	sharedGraph = { context, master, compressor, buses, zoneFilters };
	return sharedGraph;
}

/**
 * Called directly by the Play button. Creating/resuming audio here keeps browser activation tied
 * to the user's click; the world engine can mount a frame later and adopt the primed graph.
 */
export async function primeSpatialAudioFromGesture(): Promise<boolean> {
	const graph = createSharedGraph();
	if (!graph) return false;
	if (graph.context.state === 'suspended') {
		await graph.context.resume().catch(() => undefined);
	}
	return graph.context.state === 'running';
}

function sourceProfile(kind: SpatialSoundKind): {
	bus: SpatialAudioBus;
	frequency: number;
	secondFrequency?: number;
	type: OscillatorType;
	gain: number;
} {
	switch (kind) {
		case 'motorbike':
			return { bus: 'traffic', frequency: 92, secondFrequency: 184, type: 'sawtooth', gain: 0.14 };
		case 'car':
			return { bus: 'traffic', frequency: 68, secondFrequency: 136, type: 'triangle', gain: 0.1 };
		case 'rickshaw':
			return { bus: 'traffic', frequency: 47, secondFrequency: 94, type: 'square', gain: 0.035 };
		case 'handcart':
			return { bus: 'traffic', frequency: 39, secondFrequency: 78, type: 'triangle', gain: 0.022 };
		case 'bicycle':
			return { bus: 'traffic', frequency: 31, type: 'triangle', gain: 0.008 };
		case 'crowd':
			return { bus: 'people', frequency: 118, secondFrequency: 143, type: 'sine', gain: 0.018 };
		case 'tea-stall':
			return { bus: 'people', frequency: 156, secondFrequency: 237, type: 'sine', gain: 0.013 };
		case 'dog':
			return { bus: 'animals', frequency: 43, type: 'sine', gain: 0.006 };
		case 'workshop':
			return {
				bus: 'ambience',
				frequency: 51,
				secondFrequency: 101,
				type: 'sawtooth',
				gain: 0.016
			};
	}
}

function setListenerPosition(
	listener: AudioListener,
	frame: AudioListenerFrame,
	now: number
): void {
	const forwardX = Math.sin(frame.heading);
	const forwardZ = Math.cos(frame.heading);
	listener.positionX.setTargetAtTime(frame.x, now, 0.03);
	listener.positionY.setTargetAtTime(frame.y, now, 0.03);
	listener.positionZ.setTargetAtTime(frame.z, now, 0.03);
	listener.forwardX.setTargetAtTime(forwardX, now, 0.04);
	listener.forwardY.setTargetAtTime(-0.08, now, 0.04);
	listener.forwardZ.setTargetAtTime(forwardZ, now, 0.04);
	listener.upX.setTargetAtTime(0, now, 0.04);
	listener.upY.setTargetAtTime(1, now, 0.04);
	listener.upZ.setTargetAtTime(0, now, 0.04);
}

function makeNoiseBuffer(context: AudioContext, seconds: number, smoothing: number): AudioBuffer {
	const frameCount = Math.max(1, Math.floor(context.sampleRate * seconds));
	const buffer = context.createBuffer(1, frameCount, context.sampleRate);
	const channel = buffer.getChannelData(0);
	let previous = 0;
	for (let index = 0; index < frameCount; index += 1) {
		const white = Math.random() * 2 - 1;
		previous = previous * smoothing + white * (1 - smoothing);
		channel[index] = previous;
	}
	return buffer;
}

export class SpatialStreetAudio {
	private graph: SharedAudioGraph | null = null;
	private enabled = false;
	private destroyed = false;
	private ambienceStarted = false;
	private bedSources: AudioBufferSourceNode[] = [];
	private bedGains: GainNode[] = [];
	private rainGain: GainNode | null = null;
	private voices = new Map<string, SourceVoice>();
	private lastListener: AudioListenerFrame | null = null;
	private lastOcclusionUpdate = 0;
	private footstepClock = 0;

	async setEnabled(enabled: boolean): Promise<boolean> {
		if (this.destroyed) return false;
		this.enabled = enabled;
		this.graph = createSharedGraph();
		if (!this.graph) return false;
		const { context, master } = this.graph;
		if (enabled && context.state === 'suspended') {
			await context.resume().catch(() => undefined);
		}
		master.gain.setTargetAtTime(enabled ? 0.72 : 0, context.currentTime, enabled ? 0.08 : 0.025);
		if (enabled) this.startAmbience();
		return context.state === 'running';
	}

	private startAmbience(): void {
		if (this.ambienceStarted || !this.graph) return;
		this.ambienceStarted = true;
		const { context, buses } = this.graph;
		const layers = [
			{ seconds: 8.7, smoothing: 0.986, frequency: 380, gain: 0.34, bus: buses.ambience },
			{ seconds: 11.3, smoothing: 0.955, frequency: 1250, gain: 0.055, bus: buses.ambience },
			{ seconds: 6.1, smoothing: 0.91, frequency: 2900, gain: 0.16, bus: buses.weather }
		];
		layers.forEach((layer, index) => {
			const source = context.createBufferSource();
			const filter = context.createBiquadFilter();
			const gain = context.createGain();
			source.buffer = makeNoiseBuffer(context, layer.seconds, layer.smoothing);
			source.loop = true;
			filter.type = index === 2 ? 'highpass' : 'lowpass';
			filter.frequency.value = layer.frequency;
			gain.gain.value = index === 2 ? 0 : layer.gain;
			source.connect(filter);
			filter.connect(gain);
			gain.connect(layer.bus);
			source.start(context.currentTime, (index * 1.73) % layer.seconds);
			this.bedSources.push(source);
			this.bedGains.push(gain);
			if (index === 2) this.rainGain = gain;
		});
	}

	private createVoice(source: MovingAudioSource): SourceVoice | null {
		if (!this.graph) return null;
		const { context, buses } = this.graph;
		const profile = sourceProfile(source.kind);
		const oscillator = context.createOscillator();
		oscillator.type = profile.type;
		oscillator.frequency.value = profile.frequency;
		let secondOscillator: OscillatorNode | null = null;
		if (profile.secondFrequency) {
			secondOscillator = context.createOscillator();
			secondOscillator.type = profile.type === 'sawtooth' ? 'triangle' : profile.type;
			secondOscillator.frequency.value = profile.secondFrequency;
		}
		const filter = context.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 5_500;
		const panner = context.createPanner();
		panner.panningModel = 'HRTF';
		panner.distanceModel = 'inverse';
		panner.refDistance = 2.5;
		panner.maxDistance = source.kind === 'motorbike' || source.kind === 'car' ? 82 : 48;
		panner.rolloffFactor = source.kind === 'motorbike' ? 0.72 : 0.95;
		panner.coneInnerAngle = OMNIDIRECTIONAL_CONE.innerAngle;
		panner.coneOuterAngle = OMNIDIRECTIONAL_CONE.outerAngle;
		panner.coneOuterGain = OMNIDIRECTIONAL_CONE.outerGain;
		const gain = context.createGain();
		gain.gain.value = 0.0001;
		oscillator.connect(filter);
		secondOscillator?.connect(filter);
		filter.connect(panner);
		panner.connect(gain);
		gain.connect(buses[profile.bus]);
		oscillator.start();
		secondOscillator?.start();
		return {
			id: source.id,
			kind: source.kind,
			baseFrequency: profile.frequency,
			oscillator,
			secondOscillator,
			filter,
			panner,
			gain,
			lastX: source.x,
			lastZ: source.z,
			doppler: 1,
			debug: {
				id: source.id,
				distance: Number.POSITIVE_INFINITY,
				gain: 0,
				occluded: false,
				radialVelocity: 0,
				doppler: 1
			}
		};
	}

	private destroyVoice(voice: SourceVoice): void {
		try {
			voice.oscillator.stop();
			voice.secondOscillator?.stop();
		} catch {
			// Voice may already have stopped during context teardown.
		}
		voice.oscillator.disconnect();
		voice.secondOscillator?.disconnect();
		voice.filter.disconnect();
		voice.panner.disconnect();
		voice.gain.disconnect();
	}

	update(
		listenerFrame: AudioListenerFrame,
		sources: readonly MovingAudioSource[],
		deltaSeconds: number
	): void {
		if (!this.enabled || this.destroyed || !this.graph) return;
		const { context, buses, zoneFilters } = this.graph;
		const now = context.currentTime;
		setListenerPosition(context.listener, listenerFrame, now);
		this.lastListener = { ...listenerFrame };
		const zone = acousticZoneMix(listenerFrame.enclosure, listenerFrame.raining);
		buses.ambience.gain.setTargetAtTime(zone.ambienceGain, now, 0.32);
		buses.weather.gain.setTargetAtTime(zone.weatherGain, now, 0.32);
		zoneFilters.ambience.frequency.setTargetAtTime(zone.ambienceLowpassHz, now, 0.38);
		zoneFilters.weather.frequency.setTargetAtTime(zone.weatherLowpassHz, now, 0.38);
		this.rainGain?.gain.setTargetAtTime(zone.rainLayerGain, now, 0.24);

		const activeIds = new Set<string>();
		for (const source of sources) {
			if (!source.active) continue;
			activeIds.add(source.id);
			let voice = this.voices.get(source.id);
			if (!voice) {
				voice = this.createVoice(source) ?? undefined;
				if (!voice) continue;
				this.voices.set(source.id, voice);
			}

			const dx = source.x - listenerFrame.x;
			const dz = source.z - listenerFrame.z;
			const distance = Math.max(0.001, Math.hypot(dx, dz));
			const directionX = dx / distance;
			const directionZ = dz / distance;
			const separationVelocity =
				(source.vx - listenerFrame.vx) * directionX + (source.vz - listenerFrame.vz) * directionZ;
			const targetDoppler = dopplerRateForRadialVelocity(separationVelocity);
			voice.doppler += (targetDoppler - voice.doppler) * Math.min(1, deltaSeconds * 4.5);

			const profile = sourceProfile(source.kind);
			voice.oscillator.frequency.setTargetAtTime(voice.baseFrequency * voice.doppler, now, 0.055);
			if (voice.secondOscillator) {
				const ratio = (profile.secondFrequency ?? voice.baseFrequency * 2) / voice.baseFrequency;
				voice.secondOscillator.frequency.setTargetAtTime(
					voice.baseFrequency * ratio * voice.doppler,
					now,
					0.055
				);
			}
			voice.panner.positionX.setTargetAtTime(source.x, now, 0.035);
			voice.panner.positionY.setTargetAtTime(source.y ?? 0.75, now, 0.035);
			voice.panner.positionZ.setTargetAtTime(source.z, now, 0.035);

			const directGain = profile.gain * (source.active ? 1 : 0);
			const occlusionGain = source.occluded ? 0.42 : 1;
			voice.gain.gain.setTargetAtTime(Math.max(0.0001, directGain * occlusionGain), now, 0.08);
			voice.filter.frequency.setTargetAtTime(
				distanceFilterFrequency(distance, source.occluded),
				now,
				0.12
			);
			voice.lastX = source.x;
			voice.lastZ = source.z;
			voice.debug = {
				id: source.id,
				distance,
				gain: directGain * occlusionGain,
				occluded: source.occluded,
				radialVelocity: separationVelocity,
				doppler: voice.doppler
			};
		}

		for (const [id, voice] of this.voices) {
			if (activeIds.has(id)) continue;
			voice.gain.gain.setTargetAtTime(0.0001, now, 0.06);
			this.destroyVoice(voice);
			this.voices.delete(id);
		}
		this.lastOcclusionUpdate += deltaSeconds;
	}

	play(event: SpatialOneShot, position?: { x: number; y?: number; z: number }): void {
		if (!this.enabled || this.destroyed || !this.graph) return;
		const { context, buses } = this.graph;
		const now = context.currentTime;
		const oscillator = context.createOscillator();
		const filter = context.createBiquadFilter();
		const gain = context.createGain();
		let bus: SpatialAudioBus = 'interaction';
		let start = 320;
		let end = 180;
		let duration = 0.18;
		let peak = 0.12;
		switch (event) {
			case 'bell':
				bus = 'traffic';
				start = 1_520;
				end = 840;
				duration = 0.36;
				peak = 0.16;
				break;
			case 'horn':
				bus = 'traffic';
				start = 244;
				end = 224;
				duration = 0.2;
				peak = 0.18;
				break;
			case 'footstep':
				start = 115;
				end = 68;
				duration = 0.09;
				peak = 0.035;
				break;
			case 'splash':
				start = 520;
				end = 74;
				duration = 0.25;
				peak = 0.09;
				break;
			case 'stumble':
				start = 150;
				end = 48;
				duration = 0.28;
				peak = 0.1;
				break;
			case 'tea':
				start = 1_840;
				end = 1_180;
				duration = 0.31;
				peak = 0.08;
				break;
			case 'snack':
				start = 510;
				end = 780;
				duration = 0.16;
				peak = 0.065;
				break;
			case 'bark':
				bus = 'animals';
				start = 190;
				end = 96;
				duration = 0.13;
				peak = 0.14;
				break;
			case 'reaction':
				bus = 'people';
				start = 210;
				end = 165;
				duration = 0.22;
				peak = 0.075;
				break;
			case 'arrival':
				start = 392;
				end = 660;
				duration = 0.55;
				peak = 0.09;
				break;
		}
		oscillator.type = event === 'horn' || event === 'bark' ? 'sawtooth' : 'triangle';
		oscillator.frequency.setValueAtTime(start, now);
		oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, end), now + duration);
		filter.type = 'lowpass';
		filter.frequency.value = 5_600;
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
		oscillator.connect(filter);
		let finalNode: AudioNode = filter;
		let panner: PannerNode | null = null;
		if (position) {
			panner = context.createPanner();
			panner.panningModel = 'HRTF';
			panner.distanceModel = 'inverse';
			panner.refDistance = 2;
			panner.maxDistance = 65;
			panner.rolloffFactor = 0.9;
			panner.positionX.value = position.x;
			panner.positionY.value = position.y ?? 0.8;
			panner.positionZ.value = position.z;
			filter.connect(panner);
			finalNode = panner;
		}
		finalNode.connect(gain);
		gain.connect(buses[bus]);
		oscillator.start(now);
		oscillator.stop(now + duration + 0.02);
		oscillator.addEventListener(
			'ended',
			() => {
				oscillator.disconnect();
				filter.disconnect();
				panner?.disconnect();
				gain.disconnect();
			},
			{ once: true }
		);
	}

	playFootsteps(deltaSeconds: number, speed: number, position: { x: number; z: number }): void {
		if (!this.enabled || speed < 0.1) {
			this.footstepClock = 0;
			return;
		}
		this.footstepClock += deltaSeconds * (speed > 1.8 ? 2.25 : 1.62);
		if (this.footstepClock >= 1) {
			this.footstepClock %= 1;
			this.play('footstep', position);
		}
	}

	debugSnapshot(): SpatialAudioDebugSnapshot {
		return {
			contextState: this.graph?.context.state ?? 'unavailable',
			activeNodes: this.voices.size + this.bedSources.length,
			listener: this.lastListener ? { ...this.lastListener } : null,
			sources: [...this.voices.values()].map((voice) => ({ ...voice.debug }))
		};
	}

	async destroy(): Promise<void> {
		if (this.destroyed) return;
		this.destroyed = true;
		for (const voice of this.voices.values()) this.destroyVoice(voice);
		this.voices.clear();
		for (const source of this.bedSources) {
			try {
				source.stop();
			} catch {
				/* Context may already be closed. */
			}
			source.disconnect();
		}
		for (const gain of this.bedGains) gain.disconnect();
		this.bedSources = [];
		this.bedGains = [];
		this.rainGain = null;
	}
}
