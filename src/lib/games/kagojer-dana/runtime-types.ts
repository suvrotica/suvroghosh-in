import type { QualityMode } from './settings';

export type FlightPhase = 'loading' | 'playing' | 'paused' | 'ended' | 'error';
export type AltitudeRegister = 'Low city' | 'Roofline and river air' | 'Soaring city';

export interface FlightHudSnapshot {
	phase: FlightPhase;
	seed: string;
	district: string;
	register: AltitudeRegister;
	altitudeMetres: number;
	airspeedMps: number;
	verticalSpeedMps: number;
	windLabel: string;
	hazard: string;
	tutorialCue: string;
	marginalNote: string;
	flightPhrase: string;
	score: number;
	creaseLevel: number;
	elapsedSeconds: number;
	quality: QualityMode;
	fps: number;
	chunkCount: number;
	drawCalls: number;
	triangleCount: number;
	activeSoundVoices: number;
	simulationTime: number;
}

export interface FlightTracePoint {
	x: number;
	y: number;
	z: number;
	atSeconds: number;
	district: string;
}

export interface AltitudeTracePoint {
	atSeconds: number;
	altitudeMetres: number;
}

export interface FlightFolioResult {
	seed: string;
	mode: 'curated' | 'free';
	elapsedSeconds: number;
	score: number;
	path: readonly FlightTracePoint[];
	altitudeProfile: readonly AltitudeTracePoint[];
	windsBorrowed: readonly string[];
	closestPassage: string;
	districts: readonly string[];
	soundscapes: readonly string[];
	landmarks: readonly string[];
	landing: string;
	worldSignature: string;
}

export type FlightCommand = 'pause' | 'mute' | 'fullscreen' | 'relaunch' | 'finish' | 'resume';

export interface FlightCallbacks {
	onReady(): void;
	onHud(snapshot: FlightHudSnapshot): void;
	onPhase(phase: FlightPhase): void;
	onResult(result: FlightFolioResult): void;
	onError(message: string): void;
	onCommand(command: FlightCommand): void;
	onCaption(message: string): void;
	onAssistanceOffer(): void;
}

export interface FlightEngineOptions {
	seed: string;
	mode: 'curated' | 'free';
	settings: import('./settings').KagojerDanaSettings;
	audioContext?: AudioContext;
	callbacks: FlightCallbacks;
}

export interface FlightEngineApi {
	start(): void;
	pause(byVisibility?: boolean): void;
	resume(): void;
	resize(): void;
	setMuted(muted: boolean): void;
	enableAudioFromGesture(context: AudioContext): Promise<boolean>;
	setQuality(quality: QualityMode): void;
	setSettings(settings: import('./settings').KagojerDanaSettings): void;
	setTouchVector(bank: number, pitch: number): void;
	relaunch(): void;
	finish(): void;
	destroy(): void;
}

export function emptyHud(seed = ''): FlightHudSnapshot {
	return {
		phase: 'loading',
		seed,
		district: 'North Calcutta roofs',
		register: 'Low city',
		altitudeMetres: 18,
		airspeedMps: 9.5,
		verticalSpeedMps: 0,
		windLabel: 'A light southerly crosswind',
		hazard: 'Clear flight corridor',
		tutorialCue: 'Lower the nose gently to gather speed.',
		marginalNote: '',
		flightPhrase: '',
		score: 0,
		creaseLevel: 0,
		elapsedSeconds: 0,
		quality: 'auto',
		fps: 0,
		chunkCount: 0,
		drawCalls: 0,
		triangleCount: 0,
		activeSoundVoices: 0,
		simulationTime: 0
	};
}
