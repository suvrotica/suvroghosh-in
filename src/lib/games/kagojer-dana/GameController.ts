import { ACESFilmicToneMapping, Euler, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { Soundscape } from './audio/Soundscape';
import { CollisionSystem, type CollisionCollider } from './engine/CollisionSystem';
import { FixedStep } from './engine/FixedStep';
import { FlightLessonTracker, FlightPhraseTracker } from './engine/FlightGuidance';
import {
	DEFAULT_FLIGHT_TUNING,
	clonePlaneState,
	createPlaneState,
	FlightModel
} from './engine/FlightModel';
import {
	NearMissSystem,
	type NearMissObservation,
	type NearMissTargetKind
} from './engine/NearMissSystem';
import {
	QualityManager,
	qualityHintsFromBrowser,
	type QualityProfile
} from './engine/QualityManager';
import { FlightFolioRecorder, RunDirector } from './engine/RunDirector';
import { WindField } from './engine/WindField';
import { FlightInputController } from './InputController';
import { createKagojerDanaWorldScene, type VisibleHeroLandmark } from './render/WorldScene';
import type { FlightEngineApi, FlightEngineOptions, FlightHudSnapshot } from './runtime-types';
import type { KagojerDanaSettings, QualityMode } from './settings';
import type { PlaneState } from './types';
import { DISTRICT_CHUNK_LENGTH_M } from './world/AssetGrammar';
import type { DistrictId, LandmarkId } from './world/DistrictGraph';

const HUD_INTERVAL_SECONDS = 0.1;
const NEAR_MISS_INTERVAL_SECONDS = 1 / 12;
const TRACE_INTERVAL_SECONDS = 0.5;
const LOW_REGISTER_MAX_M = 28;
const MIDDLE_REGISTER_MAX_M = 150;
const OPENING_LAUNCH_HEIGHT_M = 24;
const DEVELOPMENT_CAPTURE_MODES = [
	'north',
	'howrah',
	'maidan',
	'newtown',
	'low',
	'middle',
	'high'
] as const;

type DevelopmentCaptureMode = (typeof DEVELOPMENT_CAPTURE_MODES)[number];

const DISTRICT_LABELS: Readonly<Record<DistrictId, string>> = {
	'north-calcutta': 'North Calcutta roofs',
	kumartuli: 'Kumartuli and riverward lanes',
	'college-street': 'College Street paper canyon',
	esplanade: 'Esplanade and Dharamtala',
	'maidan-victoria': 'Maidan and Victoria',
	'park-street': 'Park Street nocturne',
	hooghly: 'Hooghly and bridge country',
	'new-town': 'Salt Lake and New Town'
};

const DISTRICT_GUIDANCE: Readonly<Record<DistrictId, string>> = {
	'north-calcutta': 'Read the laundry and shaded lanes before choosing the open roofline.',
	kumartuli: 'Follow the river light beyond the workshop tarpaulins.',
	'college-street': 'Let loose pages disclose the air between bookstalls.',
	esplanade: 'Keep bus roofs beneath one wing and the tram wires in sight.',
	'maidan-victoria': 'Give the paper room to breathe above the Maidan grass.',
	'park-street': 'Skim the rain-dark awnings, then leave the close air cleanly.',
	hooghly: 'Borrow the river breeze; let the bridge remain monumental beside you.',
	'new-town': 'Read the tower wake, then find the landscaped air beyond it.'
};

const LANDMARK_LABELS: Readonly<Record<LandmarkId, string>> = {
	'howrah-bridge': 'Howrah Bridge',
	'vidyasagar-setu': 'Vidyasagar Setu',
	'victoria-memorial': 'Victoria Memorial',
	'biswa-bangla-gate': 'Biswa Bangla Gate',
	'new-market-clock-tower': 'New Market clock tower',
	'shaheed-minar': 'Shaheed Minar',
	'st-pauls-cathedral': "St Paul's Cathedral"
};

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
	architecture: 'Cornice, by half a wing.',
	wire: 'The tram wire kept its opinion.',
	branch: 'The rain tree declined to move.',
	'bridge-member': 'The truss passed close enough to darken the paper.',
	vehicle: 'The bus roof kept the lower line.',
	landmark: 'The monument remained a landmark, not a gate.',
	water: 'The river passed close underneath.'
};

const scratchWind = new Vector3();
const scratchApparentWind = new Vector3();
const scratchCameraRight = new Vector3();
const scratchCameraForward = new Vector3();
const scratchCameraUp = new Vector3();
const scratchHitNormal = new Vector3();
const scratchForward = new Vector3();
const scratchEuler = new Euler(0, 0, 0, 'YXZ');

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function altitudeRegister(altitudeMetres: number): FlightHudSnapshot['register'] {
	if (altitudeMetres < LOW_REGISTER_MAX_M) return 'Low city';
	if (altitudeMetres < MIDDLE_REGISTER_MAX_M) return 'Roofline and river air';
	return 'Soaring city';
}

function compassLabel(wind: Readonly<Vector3>): string {
	const speed = Math.hypot(wind.x, wind.z);
	if (speed < 0.35) return 'Air nearly still';
	const points = [
		'north',
		'north-east',
		'east',
		'south-east',
		'south',
		'south-west',
		'west',
		'north-west'
	];
	const angle = Math.atan2(wind.x, wind.z);
	const index = Math.round(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
	return `${points[index]}, ${speed.toFixed(1)} m/s`;
}

function colliderKind(collider: CollisionCollider): NearMissTargetKind {
	if (collider.category === 'wire') return 'wire';
	if (collider.category === 'vehicle') return 'vehicle';
	if (collider.category === 'branch') return 'vegetation';
	return 'architecture';
}

function pointSegmentDistanceSquared(
	point: Readonly<Vector3>,
	start: Readonly<{ x: number; y: number; z: number }>,
	end: Readonly<{ x: number; y: number; z: number }>
): number {
	const abX = end.x - start.x;
	const abY = end.y - start.y;
	const abZ = end.z - start.z;
	const lengthSquared = abX * abX + abY * abY + abZ * abZ;
	const amount =
		lengthSquared <= 1e-9
			? 0
			: clamp(
					((point.x - start.x) * abX + (point.y - start.y) * abY + (point.z - start.z) * abZ) /
						lengthSquared,
					0,
					1
				);
	const dx = point.x - (start.x + abX * amount);
	const dy = point.y - (start.y + abY * amount);
	const dz = point.z - (start.z + abZ * amount);
	return dx * dx + dy * dy + dz * dz;
}

function distanceToCollider(point: Readonly<Vector3>, collider: CollisionCollider): number {
	if (collider.shape === 'sphere') {
		return (
			Math.hypot(
				point.x - collider.center.x,
				point.y - collider.center.y,
				point.z - collider.center.z
			) - collider.radiusM
		);
	}
	if (collider.shape === 'capsule') {
		return (
			Math.sqrt(pointSegmentDistanceSquared(point, collider.start, collider.end)) - collider.radiusM
		);
	}
	const dx = Math.max(collider.min.x - point.x, 0, point.x - collider.max.x);
	const dy = Math.max(collider.min.y - point.y, 0, point.y - collider.max.y);
	const dz = Math.max(collider.min.z - point.z, 0, point.z - collider.max.z);
	if (dx === 0 && dy === 0 && dz === 0) return -0.01;
	return Math.hypot(dx, dy, dz);
}

function qualityTier(profile: QualityProfile): 'high' | 'balanced' | 'battery' {
	if (profile.requestedMode === 'auto') {
		if (profile.autoDegradationStage >= 7) return 'battery';
		if (profile.autoDegradationStage >= 3) {
			return profile.effectiveTier === 'high' ? 'balanced' : 'battery';
		}
	}
	return profile.effectiveTier;
}

function recoveryLaunchState(snapshot: PlaneState, creaseLevel: number): PlaneState {
	const state = clonePlaneState(snapshot);
	state.creaseLevel = clamp(creaseLevel, 0, 1);
	state.angularVelocity.set(0, 0, 0);
	scratchForward.set(0, 0, 1).applyQuaternion(state.orientation);
	scratchForward.y = Math.max(-0.04, scratchForward.y);
	if (scratchForward.lengthSq() < 0.1) scratchForward.set(0, 0, 1);
	state.groundVelocity.copy(scratchForward.normalize()).multiplyScalar(9.5);
	return state;
}

export class KagojerDanaController implements FlightEngineApi {
	private settings: KagojerDanaSettings;
	private readonly renderer: WebGLRenderer;
	private readonly fixedStep = new FixedStep();
	private readonly flight: FlightModel;
	private wind: WindField;
	private readonly input: FlightInputController;
	private readonly collision = new CollisionSystem();
	private readonly nearMiss = new NearMissSystem();
	private readonly lesson = new FlightLessonTracker();
	private readonly phrase = new FlightPhraseTracker();
	private readonly director: RunDirector;
	private readonly folio: FlightFolioRecorder;
	private readonly soundscape: Soundscape;
	private readonly world;
	private readonly quality: QualityManager;
	private profile: QualityProfile;
	private readonly interpolatedState: PlaneState;
	private readonly nearObservations: NearMissObservation[] = [];
	private readonly guidanceSample = {
		deltaSeconds: 0,
		elapsedSeconds: 0,
		altitudeM: OPENING_LAUNCH_HEIGHT_M,
		airspeedMps: 0,
		verticalSpeedMps: 0,
		headingRadians: 0,
		rollRadians: 0,
		pitchInput: 0,
		bankInput: 0,
		upwardWindMps: 0,
		obstacleDistanceM: Number.POSITIVE_INFINITY,
		stalled: false
	};
	private readonly seenLandmarks = new Set<LandmarkId>();
	private readonly borrowedWindLabels = new Set<string>();
	private readonly recentCollisionSeconds: number[] = [];
	private readonly resizeObserver: ResizeObserver;
	private readonly developmentCaptureMode: DevelopmentCaptureMode | null;
	private safeLaunchPose: PlaneState;
	private animationFrame = 0;
	private lastFrameMs = 0;
	private running = false;
	private paused = false;
	private destroyed = false;
	private lastHudAt = Number.NEGATIVE_INFINITY;
	private lastNearMissAt = Number.NEGATIVE_INFINITY;
	private lastTraceAt = Number.NEGATIVE_INFINITY;
	private recoveryUntil = 0;
	private collisionCooldownUntil = 0;
	private lastLanding = 'A North Calcutta rooftop caught the fold.';
	private obstacleDistanceM = Number.POSITIVE_INFINITY;
	private marginalNote = '';
	private marginalNoteUntil = 0;
	private gustWarning = '';
	private gustWarningUntil = 0;
	private lastSoundDistrict: DistrictId | null = null;
	private currentDistrict: DistrictId = 'north-calcutta';
	private openingLaunched = false;
	private lastSafeChunkIndex = Number.NEGATIVE_INFINITY;
	private visibleHeroId: LandmarkId | null = null;
	private visibleHeroDwellSeconds = 0;
	private lastInputAtSeconds = Number.NEGATIVE_INFINITY;
	private lastPressureAtSeconds = 0;
	private assistanceOffered = false;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly host: HTMLElement,
		private readonly options: FlightEngineOptions
	) {
		this.settings = { ...options.settings };
		const requestedCapture = import.meta.env.DEV
			? new URL(window.location.href).searchParams.get('kd_capture')
			: null;
		this.developmentCaptureMode = DEVELOPMENT_CAPTURE_MODES.includes(
			requestedCapture as DevelopmentCaptureMode
		)
			? (requestedCapture as DevelopmentCaptureMode)
			: null;
		const heldPlane = createPlaneState({
			position: new Vector3(0, OPENING_LAUNCH_HEIGHT_M, 4),
			launchSpeed: 0,
			lastSafeLaunchId: 'north-calcutta-windowsill'
		});
		this.flight = new FlightModel({ state: heldPlane });
		this.safeLaunchPose = createPlaneState({
			position: heldPlane.position,
			orientation: heldPlane.orientation,
			launchSpeed: 9.5,
			lastSafeLaunchId: heldPlane.lastSafeLaunchId
		});
		this.interpolatedState = createPlaneState();
		this.wind = this.createWindField();
		this.director = new RunDirector(options.seed, options.mode);
		this.folio = new FlightFolioRecorder(options.seed, options.mode, {
			sampleIntervalSeconds: TRACE_INTERVAL_SECONDS
		});
		const bounds = host.getBoundingClientRect();
		this.quality = new QualityManager(
			this.settings.quality,
			qualityHintsFromBrowser(Math.max(1, bounds.width), Math.max(1, bounds.height))
		);
		this.profile = this.quality.getProfile();
		this.renderer = new WebGLRenderer({
			canvas,
			antialias: this.profile.effectiveTier !== 'battery',
			alpha: false,
			powerPreference: this.profile.effectiveTier === 'battery' ? 'low-power' : 'high-performance'
		});
		this.renderer.outputColorSpace = SRGBColorSpace;
		this.renderer.toneMapping = ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 0.95;
		this.renderer.setClearColor(0xb9ad93, 1);

		try {
			this.world = createKagojerDanaWorldScene({
				seed: options.seed,
				quality: qualityTier(this.profile),
				calmCamera: this.settings.calmCamera || this.settings.calmFlight
			});
		} catch (cause) {
			this.renderer.dispose();
			throw cause;
		}
		this.configureDevelopmentCapture();
		this.world.setStrongWindMarks(
			this.settings.strongWindMarks || this.settings.highContrastCorridor
		);
		try {
			this.soundscape = new Soundscape({
				context: options.audioContext,
				ownsContext: true,
				maxVoices: 8,
				initialVoiceLimit: this.profile.positionalAudioVoices,
				onCaption: (message) => options.callbacks.onCaption(message)
			});
		} catch (cause) {
			this.world.destroy();
			this.renderer.dispose();
			throw cause;
		}
		this.input = new FlightInputController((command) => options.callbacks.onCommand(command), host);
		this.applyFlightAssistance();
		try {
			this.resizeObserver = new ResizeObserver(() => this.resize());
			this.resizeObserver.observe(host);
			this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
			this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
			document.addEventListener('visibilitychange', this.handleVisibilityChange);
		} catch (cause) {
			this.input.destroy();
			void this.soundscape.destroy();
			this.world.destroy();
			this.renderer.dispose();
			throw cause;
		}
		this.applyQualityProfile(this.profile);
		this.resize();
	}

	start(): void {
		if (this.destroyed || this.running) return;
		this.running = true;
		this.recordFolioSample(0, true);
		this.options.callbacks.onReady();
		if (document.hidden) {
			this.paused = true;
			this.input.setActive(false);
			this.fixedStep.setSuspended(true);
			this.options.callbacks.onPhase('paused');
			return;
		}
		this.paused = false;
		this.input.setActive(true);
		this.fixedStep.setSuspended(false);
		if (this.settings.soundEnabled && this.options.audioContext) {
			void this.soundscape
				.activateFromUserGesture({ audible: true })
				.catch(() => this.options.callbacks.onCaption('Calcutta sound was unavailable.'));
		} else {
			void this.soundscape.activateFromUserGesture({ audible: false });
		}
		this.lastFrameMs = performance.now();
		this.options.callbacks.onPhase('playing');
		this.animationFrame = requestAnimationFrame(this.frame);
	}

	pause(byVisibility = false): void {
		if (this.destroyed || this.paused || !this.running) return;
		this.paused = true;
		void byVisibility;
		this.input.setActive(false);
		this.fixedStep.setSuspended(true);
		if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
		this.animationFrame = 0;
		void this.soundscape.pause();
		this.options.callbacks.onPhase('paused');
	}

	resume(): void {
		if (this.destroyed || !this.running || !this.paused || document.hidden) return;
		this.paused = false;
		this.fixedStep.setSuspended(false);
		this.fixedStep.resetAccumulator();
		this.input.setActive(true);
		this.lastFrameMs = performance.now();
		if (this.settings.soundEnabled && this.options.audioContext) {
			void this.soundscape
				.activateFromUserGesture({ audible: true })
				.catch(() => this.options.callbacks.onCaption('Calcutta sound was unavailable.'));
		}
		void this.soundscape.resume();
		this.options.callbacks.onPhase('playing');
		this.animationFrame = requestAnimationFrame(this.frame);
	}

	resize(): void {
		if (this.destroyed) return;
		const bounds = this.host.getBoundingClientRect();
		const width = Math.max(1, Math.round(bounds.width));
		const height = Math.max(1, Math.round(bounds.height));
		this.renderer.setPixelRatio(this.profile.pixelRatio);
		this.renderer.setSize(width, height, false);
		this.world.resize(width, height, this.profile.pixelRatio);
	}

	setMuted(muted: boolean): void {
		this.settings = { ...this.settings, soundEnabled: !muted };
		this.soundscape.setMuted(muted);
	}

	async enableAudioFromGesture(context: AudioContext): Promise<boolean> {
		if (this.destroyed) return false;
		try {
			return await this.soundscape.activateFromUserGesture({
				audible: true,
				context,
				ownsContext: true
			});
		} catch {
			return false;
		}
	}

	setQuality(quality: QualityMode): void {
		this.settings = { ...this.settings, quality };
		this.profile = this.quality.setMode(quality);
		this.applyQualityProfile(this.profile);
	}

	setSettings(settings: KagojerDanaSettings): void {
		const windChanged =
			settings.windMode !== this.settings.windMode ||
			settings.calmFlight !== this.settings.calmFlight;
		this.settings = { ...settings };
		this.setQuality(settings.quality);
		this.soundscape.setMuted(!settings.soundEnabled);
		this.world.setCalmCamera(settings.calmCamera || settings.calmFlight);
		this.world.setStrongWindMarks(settings.strongWindMarks || settings.highContrastCorridor);
		this.applyFlightAssistance();
		if (windChanged) this.wind = this.createWindField();
	}

	setTouchVector(bank: number, pitch: number): void {
		this.input.setTouchVector(bank, pitch);
	}

	relaunch(): void {
		if (this.destroyed) return;
		this.flight.reset(recoveryLaunchState(this.safeLaunchPose, this.flight.state.creaseLevel));
		this.recoveryUntil = 0;
		this.collisionCooldownUntil = this.fixedStep.simulationTime + 0.45;
		this.marginalNote = 'A nearby hand and a patient gust tried again.';
		this.marginalNoteUntil = this.fixedStep.simulationTime + 3.2;
		if (this.paused && !document.hidden) this.resume();
	}

	finish(): void {
		if (this.destroyed || !this.running) return;
		this.recordFolioSample(this.fixedStep.simulationTime, true);
		this.running = false;
		this.paused = true;
		this.input.setActive(false);
		if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
		this.animationFrame = 0;
		void this.soundscape.pause();
		const metrics = this.world.getMetrics();
		const result = this.folio.finish({
			elapsedSeconds: this.fixedStep.simulationTime,
			score: this.nearMiss.totalScore,
			landing: this.lastLanding,
			worldSignature: metrics.routeSignature
		});
		this.options.callbacks.onResult(result);
		this.options.callbacks.onPhase('ended');
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.running = false;
		this.input.destroy();
		this.fixedStep.setSuspended(true);
		if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
		this.animationFrame = 0;
		this.resizeObserver.disconnect();
		document.removeEventListener('visibilitychange', this.handleVisibilityChange);
		this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
		void this.soundscape.destroy();
		this.world.destroy();
		this.renderer.setAnimationLoop(null);
		this.renderer.dispose();
	}

	private frame = (frameMs: number): void => {
		if (this.destroyed || !this.running || this.paused) return;
		const frameDeltaSeconds = clamp((frameMs - this.lastFrameMs) / 1_000, 0, 0.25);
		this.lastFrameMs = frameMs;
		const fixedResult = this.fixedStep.advance(frameDeltaSeconds, (tick) => {
			this.physicsStep(tick.stepSeconds, tick.simulationTime);
		});
		if (!this.running || this.destroyed) return;

		this.flight.getInterpolatedState(fixedResult.alpha, this.interpolatedState);
		const control = this.input.sample();
		const controlMagnitude = Math.hypot(control.bank, control.pitch);
		if (controlMagnitude > 0.025) this.lastInputAtSeconds = fixedResult.simulationTime;
		scratchEuler.setFromQuaternion(this.interpolatedState.orientation);
		const pressure =
			this.flight.telemetry.stalled ||
			this.recoveryUntil > fixedResult.simulationTime ||
			this.obstacleDistanceM < 4 ||
			Boolean(this.gustWarning) ||
			(this.interpolatedState.position.y < LOW_REGISTER_MAX_M &&
				this.interpolatedState.groundVelocity.y < -1.5);
		if (pressure) this.lastPressureAtSeconds = fixedResult.simulationTime;
		const visibleHero = this.world.getVisibleHeroLandmark();
		const scenicDriftAllowed = this.canUseScenicDrift(
			fixedResult.simulationTime,
			controlMagnitude,
			scratchEuler.z,
			visibleHero
		);
		scratchApparentWind.copy(this.flight.telemetry.wind).sub(this.interpolatedState.groundVelocity);
		this.world.update(
			{
				position: this.interpolatedState.position,
				groundVelocity: this.interpolatedState.groundVelocity,
				orientation: this.interpolatedState.orientation,
				airspeed: this.flight.telemetry.airspeed,
				altitudeM: this.interpolatedState.position.y,
				rollRadians: scratchEuler.z,
				obstacleDistanceM: this.obstacleDistanceM,
				gustStrength: this.gustWarning ? 1 : 0,
				apparentWind: scratchApparentWind,
				creaseLevel: this.interpolatedState.creaseLevel,
				elapsedSeconds: fixedResult.simulationTime,
				hasPlayerInput: controlMagnitude > 0.025,
				allowScenicDrift: scenicDriftAllowed,
				dangerousPassage: pressure
			},
			frameDeltaSeconds
		);
		this.updateLandmarkObservation(
			this.world.getVisibleHeroLandmark(),
			frameDeltaSeconds,
			pressure,
			scratchEuler.z
		);
		this.world.render(this.renderer);
		const metrics = this.world.getMetrics();
		this.currentDistrict = metrics.currentDistrict;
		const adjustment = this.quality.update({
			frameMs: frameDeltaSeconds * 1_000,
			deltaSeconds: frameDeltaSeconds,
			drawCalls: metrics.drawCalls,
			triangles: metrics.triangles
		});
		if (adjustment) {
			this.profile = adjustment.profile;
			this.applyQualityProfile(this.profile);
		}
		this.updateSound(fixedResult.simulationTime);
		this.emitHud(fixedResult.simulationTime, frameDeltaSeconds);
		this.animationFrame = requestAnimationFrame(this.frame);
	};

	private physicsStep(stepSeconds: number, simulationTime: number): void {
		if (this.developmentCaptureMode) {
			this.wind.sample(this.flight.state.position, simulationTime, scratchWind);
			this.updateGuidance(stepSeconds, simulationTime, 0, 0, scratchWind.y, true);
			this.updateDistrictAudio(simulationTime);
			return;
		}
		if (this.recoveryUntil > 0 && simulationTime >= this.recoveryUntil) {
			this.flight.reset(recoveryLaunchState(this.safeLaunchPose, this.flight.state.creaseLevel));
			this.recoveryUntil = 0;
			this.collisionCooldownUntil = simulationTime + 0.5;
		}

		const sample = this.input.sample();
		const sensitivity = this.settings.sensitivity * (this.settings.calmFlight ? 0.72 : 1);
		const pitchDirection = this.settings.invertPitch ? -1 : 1;
		const recovering = this.recoveryUntil > simulationTime;
		const pitch = recovering ? 0 : clamp(sample.pitch * pitchDirection * sensitivity, -1, 1);
		const roll = recovering ? 0 : clamp(sample.bank * sensitivity, -1, 1);
		this.wind.sample(this.flight.state.position, simulationTime, scratchWind);
		// The opening North Calcutta street canyon shelters the novice throw from broad crosswind;
		// its visible thermal and along-lane air remain physical, but the first lesson is not a trap.
		if (simulationTime < 70 && this.flight.state.position.z < DISTRICT_CHUNK_LENGTH_M * 3) {
			scratchWind.x *= 0.12;
		}

		if (!this.openingLaunched) {
			if (simulationTime < this.director.definition.openingObservationSeconds) {
				this.updateGuidance(stepSeconds, simulationTime, pitch, roll, scratchWind.y, false);
				this.updateAuthoredClock(simulationTime);
				this.updateDistrictAudio(simulationTime);
				return;
			}
			this.flight.reset(recoveryLaunchState(this.safeLaunchPose, 0));
			this.openingLaunched = true;
			this.collisionCooldownUntil = simulationTime + 0.75;
			this.updateGuidance(stepSeconds, simulationTime, pitch, roll, scratchWind.y, true);
			this.updateAuthoredClock(simulationTime);
			this.updateDistrictAudio(simulationTime);
			return;
		}
		this.flight.step({ pitch, roll }, scratchWind, stepSeconds, simulationTime);
		this.updateGuidance(stepSeconds, simulationTime, pitch, roll, scratchWind.y, true);

		if (simulationTime >= this.collisionCooldownUntil) {
			const hit = this.collision.sweep(
				this.flight.previousState,
				this.flight.state,
				this.world.getColliders() as readonly CollisionCollider[]
			);
			if (hit) this.handleCollision(hit, simulationTime);
		}

		const district = this.currentDistrict;
		this.updateDistrictAudio(simulationTime);
		if (this.flight.state.position.y <= 0.18 && this.recoveryUntil <= simulationTime) {
			this.lastLanding =
				district === 'hooghly'
					? 'The paper floated beside a Hooghly ghat before another throw.'
					: district === 'maidan-victoria'
						? 'The plane settled at the Maidan edge and found another hand.'
						: 'A kind rooftop hand caught the folded nose.';
			this.beginRecovery(simulationTime, district === 'hooghly' ? 1.7 : 1.15);
		}

		this.updateAuthoredClock(simulationTime);

		this.updateGustWarning(simulationTime);
		if (simulationTime - this.lastNearMissAt >= NEAR_MISS_INTERVAL_SECONDS) {
			this.lastNearMissAt = simulationTime;
			this.updateNearMisses(simulationTime, district);
		}
		if (simulationTime - this.lastTraceAt >= TRACE_INTERVAL_SECONDS) {
			this.recordFolioSample(simulationTime);
		}
		this.captureSafeLaunchPose(simulationTime);
	}

	/**
	 * Development-only, query-addressable camera marks used by the asset renderer and
	 * visual-regression pass. They still render the real seeded, streamed world; only
	 * the paper plane's pose is held so a capture cannot drift between machines.
	 */
	private configureDevelopmentCapture(): void {
		const mode = this.developmentCaptureMode;
		if (!mode) return;
		const route = this.world.route;
		let moduleIndex: number;
		let altitudeM: number;
		let lateralM: number;
		let approachM: number;

		const firstMatchingModule = (predicate: (index: number) => boolean): number => {
			const index = route.modules.findIndex((_, candidateIndex) => predicate(candidateIndex));
			return index >= 0 ? index : 0;
		};
		const landmarkOrDistrictModule = (landmark: LandmarkId, district: DistrictId): number => {
			const landmarkIndex = route.modules.findIndex((module) => module.heroLandmark === landmark);
			return landmarkIndex >= 0
				? landmarkIndex
				: firstMatchingModule((index) => route.modules[index].district === district);
		};
		if (mode === 'howrah' || mode === 'middle') {
			moduleIndex = landmarkOrDistrictModule('howrah-bridge', 'hooghly');
			altitudeM = mode === 'middle' ? 92 : 42;
			lateralM = 0;
			approachM = 92;
		} else if (mode === 'maidan' || mode === 'high') {
			moduleIndex = landmarkOrDistrictModule('victoria-memorial', 'maidan-victoria');
			altitudeM = mode === 'high' ? 240 : 76;
			lateralM = 15;
			approachM = mode === 'high' ? 112 : 88;
		} else if (mode === 'newtown') {
			moduleIndex = landmarkOrDistrictModule('biswa-bangla-gate', 'new-town');
			altitudeM = 38;
			lateralM = 0;
			approachM = 70;
		} else {
			moduleIndex = firstMatchingModule(
				(index) => route.modules[index].district === 'north-calcutta'
			);
			altitudeM = mode === 'low' ? 14 : 20;
			lateralM = 0;
			approachM = 30;
		}

		const heroChunkIndex = moduleIndex * 3 + (mode === 'north' || mode === 'low' ? 0 : 1);
		const localFocusZ = mode === 'north' || mode === 'low' ? 36 : 16;
		const focusZ = heroChunkIndex * DISTRICT_CHUNK_LENGTH_M + localFocusZ;
		const state = createPlaneState({
			position: new Vector3(lateralM, altitudeM, Math.max(4, focusZ - approachM)),
			launchSpeed: 9.5,
			lastSafeLaunchId: `development-capture-${mode}`
		});
		if (mode === 'newtown') {
			const headingRadians = Math.atan2(42 - lateralM, approachM);
			state.orientation.setFromAxisAngle(scratchCameraUp.set(0, 1, 0), headingRadians);
			state.groundVelocity.set(Math.sin(headingRadians) * 9.5, 0, Math.cos(headingRadians) * 9.5);
		}
		this.flight.reset(state);
		this.safeLaunchPose = clonePlaneState(state);
		this.openingLaunched = true;
		this.currentDistrict = route.modules[moduleIndex].district;
		this.lastSafeChunkIndex = heroChunkIndex;
	}

	private updateGuidance(
		stepSeconds: number,
		simulationTime: number,
		pitch: number,
		roll: number,
		upwardWindMps: number,
		inFlight: boolean
	): void {
		scratchEuler.setFromQuaternion(this.flight.state.orientation);
		this.guidanceSample.deltaSeconds = stepSeconds;
		this.guidanceSample.elapsedSeconds = simulationTime;
		this.guidanceSample.altitudeM = this.flight.state.position.y;
		this.guidanceSample.airspeedMps = this.flight.telemetry.airspeed;
		this.guidanceSample.verticalSpeedMps = this.flight.state.groundVelocity.y;
		this.guidanceSample.headingRadians = Math.atan2(
			this.flight.state.groundVelocity.x,
			this.flight.state.groundVelocity.z
		);
		this.guidanceSample.rollRadians = scratchEuler.z;
		this.guidanceSample.pitchInput = pitch;
		this.guidanceSample.bankInput = roll;
		this.guidanceSample.upwardWindMps = upwardWindMps;
		this.guidanceSample.obstacleDistanceM = this.obstacleDistanceM;
		this.guidanceSample.stalled = this.flight.telemetry.stalled;
		this.lesson.update(this.guidanceSample);
		if (inFlight) this.phrase.update(this.guidanceSample);
	}

	private updateAuthoredClock(simulationTime: number): void {
		for (const event of this.director.update(simulationTime)) {
			if (event.type === 'curated-flight-complete') this.finish();
		}
	}

	private updateDistrictAudio(simulationTime: number): void {
		if (this.currentDistrict === this.lastSoundDistrict) return;
		this.lastSoundDistrict = this.currentDistrict;
		this.soundscape.setDistrictSchedule({
			seed: this.options.seed,
			district: this.currentDistrict,
			durationSeconds: 38,
			startsAtSeconds: simulationTime
		});
	}

	private canUseScenicDrift(
		simulationTime: number,
		controlMagnitude: number,
		rollRadians: number,
		visibleHero: VisibleHeroLandmark | null
	): boolean {
		return Boolean(
			visibleHero?.inView &&
			visibleHero.id === this.visibleHeroId &&
			this.visibleHeroDwellSeconds >= 2.5 &&
			simulationTime - this.lastInputAtSeconds >= 2.5 &&
			simulationTime - this.lastPressureAtSeconds >= 8 &&
			controlMagnitude <= 0.025 &&
			this.obstacleDistanceM > 12 &&
			!this.flight.telemetry.stalled &&
			!this.gustWarning &&
			this.recoveryUntil <= simulationTime &&
			Math.abs(this.flight.state.groundVelocity.y) < 1.5 &&
			Math.abs(rollRadians) < 0.28
		);
	}

	private updateLandmarkObservation(
		visibleHero: VisibleHeroLandmark | null,
		deltaSeconds: number,
		pressure: boolean,
		rollRadians: number
	): void {
		const readable = Boolean(
			visibleHero?.inView &&
			visibleHero.distanceM <= 600 &&
			!pressure &&
			this.obstacleDistanceM > 8 &&
			Math.abs(this.flight.state.groundVelocity.y) < 2 &&
			Math.abs(rollRadians) < 0.36
		);
		if (!visibleHero || !readable) {
			this.visibleHeroId = null;
			this.visibleHeroDwellSeconds = 0;
			return;
		}
		if (this.visibleHeroId !== visibleHero.id) {
			this.visibleHeroId = visibleHero.id;
			this.visibleHeroDwellSeconds = 0;
		}
		this.visibleHeroDwellSeconds += Math.max(0, Math.min(0.1, deltaSeconds));
		if (this.visibleHeroDwellSeconds >= 8 && !this.seenLandmarks.has(visibleHero.id)) {
			this.seenLandmarks.add(visibleHero.id);
			this.folio.recordLandmarkSeen(LANDMARK_LABELS[visibleHero.id]);
			this.marginalNote = `${LANDMARK_LABELS[visibleHero.id]} stayed long enough to be read.`;
			this.marginalNoteUntil = this.fixedStep.simulationTime + 4;
		}
	}

	private captureSafeLaunchPose(simulationTime: number): void {
		const chunkIndex = Math.floor(
			(this.flight.state.position.z + DISTRICT_CHUNK_LENGTH_M * 0.5) / DISTRICT_CHUNK_LENGTH_M
		);
		if (
			chunkIndex === this.lastSafeChunkIndex ||
			simulationTime < this.collisionCooldownUntil + 1 ||
			this.recoveryUntil > simulationTime ||
			this.flight.telemetry.stalled ||
			this.obstacleDistanceM <= 12 ||
			this.flight.state.position.y < 6 ||
			this.flight.telemetry.airspeed < 7 ||
			this.flight.telemetry.airspeed > 14 ||
			Math.abs(this.flight.state.groundVelocity.y) > 2
		) {
			return;
		}
		this.safeLaunchPose = clonePlaneState(this.flight.state);
		this.safeLaunchPose.lastSafeLaunchId = `clear-throw-${chunkIndex}`;
		this.lastSafeChunkIndex = chunkIndex;
	}

	private handleCollision(
		hit: NonNullable<ReturnType<CollisionSystem['sweep']>>,
		simulationTime: number
	): void {
		this.nearMiss.cancelCollision(hit.colliderId, simulationTime, hit.colliderCategory);
		this.recentCollisionSeconds.push(simulationTime);
		while (
			this.recentCollisionSeconds.length > 0 &&
			simulationTime - this.recentCollisionSeconds[0] > 20
		) {
			this.recentCollisionSeconds.shift();
		}
		if (
			!this.assistanceOffered &&
			this.settings.windMode !== 'gentle' &&
			this.recentCollisionSeconds.length >= 3
		) {
			this.assistanceOffered = true;
			this.options.callbacks.onAssistanceOffer();
		}
		this.collisionCooldownUntil = simulationTime + 0.5;
		const speed = this.flight.telemetry.airspeed;
		const hard = speed >= 10.5 || hit.probeId === 'nose';
		this.flight.state.creaseLevel = clamp(
			this.flight.state.creaseLevel + (hard ? 0.2 : 0.065),
			0,
			1
		);
		this.flight.state.position.copy(this.flight.previousState.position);
		this.flight.state.groundVelocity
			.multiplyScalar(hard ? 0.34 : 0.72)
			.addScaledVector(
				scratchHitNormal.set(hit.normal.x, hit.normal.y, hit.normal.z),
				hard ? 2.6 : 0.8
			);
		const angularScale = this.settings.calmFlight ? 0.22 : 1;
		this.flight.state.angularVelocity.set(
			(hit.probeId === 'left-wingtip' ? 1 : -1) * (hard ? 2.2 : 0.8) * angularScale,
			0.25 * angularScale,
			(hard ? 1.8 : 0.45) * angularScale
		);
		this.marginalNote = hard
			? 'The paper remembered the corner.'
			: 'A graphite crease; the wing remained itself.';
		this.marginalNoteUntil = simulationTime + 3.1;
		const contactLabel =
			hit.colliderCategory === 'wire'
				? 'Wire'
				: hit.colliderCategory === 'landmark'
					? 'Landmark'
					: hit.colliderCategory === 'bridge-member'
						? 'Bridge member'
						: 'Architecture';
		this.options.callbacks.onCaption(`${contactLabel} contact — recovery nearby`);
		if (hard) this.beginRecovery(simulationTime, 1.35);
	}

	private beginRecovery(simulationTime: number, delaySeconds: number): void {
		this.recoveryUntil = simulationTime + Math.min(2.5, Math.max(0.75, delaySeconds));
		this.flight.state.groundVelocity.y = Math.max(this.flight.state.groundVelocity.y, 0.4);
		this.flight.state.position.y = Math.max(-0.3, this.flight.state.position.y);
	}

	private updateNearMisses(simulationTime: number, district: DistrictId): void {
		this.nearObservations.length = 0;
		this.obstacleDistanceM = Number.POSITIVE_INFINITY;
		const colliders = this.world.getColliders() as readonly CollisionCollider[];
		for (const collider of colliders) {
			const distance = distanceToCollider(this.flight.state.position, collider) - 0.46;
			this.obstacleDistanceM = Math.min(this.obstacleDistanceM, Math.max(0, distance));
			if (distance > 1.15 || collider.category === 'landmark') continue;
			this.nearObservations.push({
				id: collider.id,
				category: collider.category,
				kind: colliderKind(collider),
				distanceM: distance,
				haloRadiusM: collider.category === 'wire' ? 0.82 : 0.72,
				basePoints: collider.category === 'wire' ? 145 : 100,
				label: collider.category,
				marginalNote: CATEGORY_LABELS[collider.category]
			});
		}

		if (district === 'hooghly' && this.flight.state.position.y < 1.5) {
			const waterId = `hooghly-water-${Math.floor(this.flight.state.position.z / 96)}`;
			this.nearObservations.push({
				id: waterId,
				category: 'water',
				kind: 'water',
				distanceM: Math.abs(this.flight.state.position.y - 0.35),
				haloRadiusM: 0.9,
				basePoints: 135,
				label: 'river skim',
				marginalNote: CATEGORY_LABELS.water
			});
		}

		for (const event of this.nearMiss.update(this.nearObservations, simulationTime)) {
			if (event.type !== 'awarded') continue;
			this.marginalNote = event.marginalNote ?? CATEGORY_LABELS[event.category] ?? event.label;
			this.marginalNoteUntil = simulationTime + 3.2;
			this.folio.recordCleanPassage({ label: event.label, distanceM: event.closestDistanceM });
			this.soundscape.playNearMiss({
				gain: 0.18,
				caption: `${event.label} — near, clean exit`
			});
		}
	}

	private updateSound(simulationTime: number): void {
		scratchApparentWind.copy(this.flight.telemetry.wind).sub(this.flight.state.groundVelocity);
		scratchCameraRight.set(1, 0, 0).applyQuaternion(this.world.camera.quaternion);
		scratchCameraForward.set(0, 0, -1).applyQuaternion(this.world.camera.quaternion);
		scratchCameraUp.set(0, 1, 0).applyQuaternion(this.world.camera.quaternion);
		const apparentMagnitude = Math.max(0.001, scratchApparentWind.length());
		this.soundscape.update({
			simulationTimeSeconds: simulationTime,
			altitudeM: this.flight.state.position.y,
			closeFlight: clamp(1 - this.obstacleDistanceM / 12, 0, 1),
			apparentWindMps: scratchApparentWind,
			windPan: clamp(scratchApparentWind.dot(scratchCameraRight) / apparentMagnitude, -1, 1),
			listenerPosition: this.world.camera.position,
			listenerForward: scratchCameraForward,
			listenerUp: scratchCameraUp
		});
	}

	private updateGustWarning(simulationTime: number): void {
		const nextGust = [48, 126, 214, 318, 412].find(
			(time) => simulationTime >= time - 1.8 && simulationTime < time
		);
		if (nextGust !== undefined) {
			this.gustWarning = 'Gust approaching from the river';
			this.gustWarningUntil = nextGust + 1.2;
			if (!this.borrowedWindLabels.has(`warning-${nextGust}`)) {
				this.borrowedWindLabels.add(`warning-${nextGust}`);
				this.options.callbacks.onCaption('Gust approaching from the river');
			}
		} else if (simulationTime > this.gustWarningUntil) {
			this.gustWarning = '';
		}
		if (this.flight.telemetry.wind.y > 0.85) {
			const label = this.currentDistrict === 'hooghly' ? 'river breeze' : 'roof thermal';
			if (!this.borrowedWindLabels.has(label)) {
				this.borrowedWindLabels.add(label);
				this.folio.recordBorrowedWind(label);
			}
		}
	}

	private recordFolioSample(simulationTime: number, force = false): void {
		this.lastTraceAt = simulationTime;
		const district = this.currentDistrict;
		this.folio.recordSample(
			{
				atSeconds: simulationTime,
				position: this.flight.state.position,
				altitudeMetres: this.flight.state.position.y,
				district: DISTRICT_LABELS[district],
				soundscape:
					this.flight.state.position.y < LOW_REGISTER_MAX_M
						? 'close city'
						: this.flight.state.position.y < MIDDLE_REGISTER_MAX_M
							? 'roofline air'
							: 'soaring city'
			},
			force
		);
	}

	private emitHud(simulationTime: number, frameDeltaSeconds: number): void {
		if (simulationTime - this.lastHudAt < HUD_INTERVAL_SECONDS) return;
		this.lastHudAt = simulationTime;
		const metrics = this.world.getMetrics();
		const register = altitudeRegister(this.flight.state.position.y);
		const verticalSpeed = this.flight.state.groundVelocity.y;
		let hazard = 'Clear flight corridor';
		if (this.recoveryUntil > simulationTime) hazard = 'Paper recovering — another throw is close';
		else if (this.flight.telemetry.stalled)
			hazard = 'Stall — lower the nose and let the wing recover';
		else if (this.gustWarning) hazard = this.gustWarning;
		else if (this.obstacleDistanceM < 2)
			hazard = `Obstacle ${this.obstacleDistanceM.toFixed(1)} m ahead`;
		else if (verticalSpeed < -2.2) hazard = 'Sinking air — preserve speed';

		const tutorialCue = this.tutorialCue();
		this.options.callbacks.onHud({
			phase: this.paused ? 'paused' : 'playing',
			seed: this.options.seed,
			district: DISTRICT_LABELS[metrics.currentDistrict],
			register,
			altitudeMetres: Math.max(0, this.flight.state.position.y),
			airspeedMps: this.flight.telemetry.airspeed,
			verticalSpeedMps: verticalSpeed,
			windLabel: compassLabel(this.flight.telemetry.wind),
			hazard,
			tutorialCue,
			marginalNote: simulationTime <= this.marginalNoteUntil ? this.marginalNote : '',
			flightPhrase: this.openingLaunched
				? this.phrase.snapshot().label
				: 'Observe — the gust is finding the fold',
			score: this.options.mode === 'free' ? 0 : this.nearMiss.totalScore,
			creaseLevel: this.flight.state.creaseLevel,
			elapsedSeconds: simulationTime,
			quality: this.settings.quality,
			fps: frameDeltaSeconds > 0 ? 1 / frameDeltaSeconds : 0,
			chunkCount: metrics.activeChunkCount,
			drawCalls: metrics.drawCalls,
			triangleCount: metrics.triangles,
			activeSoundVoices: this.soundscape.debugSnapshot().activeVoices,
			simulationTime
		});
	}

	private tutorialCue(): string {
		if (this.lesson.currentStage !== 'complete') return this.lesson.label;
		return DISTRICT_GUIDANCE[this.currentDistrict];
	}

	private createWindField(): WindField {
		const field = new WindField(this.options.seed, {
			difficulty: this.settings.windMode,
			turbulenceScale: this.settings.calmFlight ? 0.72 : 1
		});
		field.addThermal({
			id: 'world/opening-lift',
			center: new Vector3(0, 0, 32),
			radius: 36,
			height: 96,
			strength: 3.15,
			sinkRing: 0.1
		});
		// Covers every streamed module in the curated run, with breathing room for recovery throws.
		for (let index = 0; index < 58; index += 1) {
			field.addThermal({
				id: `world/thermal/${index}`,
				center: new Vector3(((index % 3) - 1) * 22, 0, index * 96 + 46),
				radius: 18 + (index % 4) * 4,
				height: 105 + (index % 3) * 28,
				strength: 2.1 + (index % 4) * 0.46,
				sinkRing: 0.18
			});
		}
		for (const [index, startTime] of [48, 126, 214, 318, 412].entries()) {
			const gustScale = this.settings.calmFlight ? 0.66 : 1;
			field.addGust({
				id: `weather/gust/${index}`,
				center: new Vector3(0, 78, startTime * 9.2),
				radius: new Vector3(86, 100, 145),
				velocity: new Vector3(
					(index % 2 === 0 ? 5.2 : -5.6) * gustScale,
					0.65 * gustScale,
					1.1 * gustScale
				),
				startTime,
				duration: 7.5
			});
		}
		return field;
	}

	private applyFlightAssistance(): void {
		const windAssistance =
			this.settings.windMode === 'gentle'
				? 1.58
				: this.settings.windMode === 'kalbaishakhi'
					? 0.92
					: 1;
		const calmAssistance = this.settings.calmFlight ? 1.22 : 1;
		this.flight.tuning.pitchLevelRate =
			DEFAULT_FLIGHT_TUNING.pitchLevelRate * windAssistance * calmAssistance;
		this.flight.tuning.rollLevelRate =
			DEFAULT_FLIGHT_TUNING.rollLevelRate * windAssistance * calmAssistance;
		this.flight.tuning.angularResponse =
			DEFAULT_FLIGHT_TUNING.angularResponse * (this.settings.windMode === 'gentle' ? 1.12 : 1);
	}

	private applyQualityProfile(profile: QualityProfile): void {
		this.world?.setQuality(qualityTier(profile));
		this.soundscape?.setVoiceLimit(profile.positionalAudioVoices);
		if (this.renderer) this.resize();
	}

	private handleVisibilityChange = (): void => {
		if (document.hidden && this.running && !this.paused) this.pause(true);
	};

	private handleContextLost = (event: Event): void => {
		event.preventDefault();
		this.pause();
		this.options.callbacks.onError(
			'The charcoal drawing lost its graphics context. The poster and article remain available.'
		);
	};

	private handleContextRestored = (): void => {
		this.options.callbacks.onCaption('The drawing returned; resume when ready.');
		this.resize();
	};
}

export function createKagojerDanaController(
	canvas: HTMLCanvasElement,
	host: HTMLElement,
	options: FlightEngineOptions
): FlightEngineApi {
	return new KagojerDanaController(canvas, host, options);
}
