import * as THREE from 'three';
import { districtNodeForChunk, type WorldQualityTier } from '../world/AssetGrammar';
import { DistrictChunkManager, type ActiveDistrictChunk } from '../world/ChunkManager';
import type { WorldCollisionShape } from '../world/CollisionGrammar';
import {
	generateDistrictRoute,
	type DistrictId,
	type DistrictRoute,
	type LandmarkId
} from '../world/DistrictGraph';
import { PaperPlaneCameraRig, type FlightCameraFrame, type Vector3Like } from './CameraRig';
import { CharcoalPipeline } from './CharcoalPipeline';
import { DistrictChunkVisualFactory } from './DistrictChunkVisuals';
import { PaperPlaneVisual } from './PaperPlane';
import { WindMarkVisual } from './WindMarks';

export interface KagojerDanaWorldOptions {
	readonly seed: string | number;
	readonly quality?: WorldQualityTier;
	readonly calmCamera?: boolean;
	readonly onChunkActivate?: (chunk: ActiveDistrictChunk) => void;
	readonly onChunkDeactivate?: (chunk: ActiveDistrictChunk) => void;
}

export interface KagojerDanaRenderFrame extends FlightCameraFrame {
	readonly creaseLevel?: number;
	readonly apparentWind?: Vector3Like;
}

export interface KagojerDanaWorldMetrics {
	readonly routeSignature: string;
	readonly currentDistrict: DistrictId;
	readonly activeChunkCount: number;
	readonly activeColliderCount: number;
	readonly drawCalls: number;
	readonly triangles: number;
	readonly quality: WorldQualityTier;
	readonly visualOrigin: { readonly x: number; readonly z: number };
}

export interface VisibleHeroLandmark {
	readonly id: LandmarkId;
	readonly inView: boolean;
	readonly distanceM: number;
}

interface ActiveHeroLandmark {
	readonly id: LandmarkId;
	readonly chunkIndex: number;
	readonly object: THREE.Object3D;
	readonly anchor: THREE.Object3D;
	readonly radiusM: number;
}

const FLOATING_ORIGIN_STEP_M = 512;

function finite(value: number | undefined, fallback = 0): number {
	return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/**
 * Scene-level integration boundary. It creates no WebGLRenderer and can only
 * begin GPU work when the controller passes a renderer to `render()`.
 */
export class KagojerDanaWorldScene {
	readonly scene = new THREE.Scene();
	readonly route: DistrictRoute;
	readonly paperPlane: PaperPlaneVisual;
	readonly camera: THREE.PerspectiveCamera;
	private readonly worldRoot = new THREE.Group();
	private readonly pipeline: CharcoalPipeline;
	private readonly visualFactory: DistrictChunkVisualFactory;
	private readonly chunkManager: DistrictChunkManager;
	private readonly cameraRig: PaperPlaneCameraRig;
	private readonly windMarks: WindMarkVisual;
	private readonly activeColliders: WorldCollisionShape[] = [];
	private readonly cameraCollisionObjects: THREE.Object3D[] = [];
	private readonly activeHeroes: ActiveHeroLandmark[] = [];
	private readonly visibilityFrustum = new THREE.Frustum();
	private readonly visibilityMatrix = new THREE.Matrix4();
	private readonly visibilitySphere = new THREE.Sphere();
	private readonly visibilityCentre = new THREE.Vector3();
	private readonly visibilityDirection = new THREE.Vector3();
	private readonly visibilityRaycaster = new THREE.Raycaster();
	private readonly visibilityHits: THREE.Intersection<THREE.Object3D>[] = [];
	private readonly visibleHeroResult: { id: LandmarkId; inView: boolean; distanceM: number } = {
		id: 'howrah-bridge',
		inView: false,
		distanceM: Number.POSITIVE_INFINITY
	};
	private readonly onChunkActivate?: (chunk: ActiveDistrictChunk) => void;
	private readonly onChunkDeactivate?: (chunk: ActiveDistrictChunk) => void;
	private readonly backgroundColor = new THREE.Color('#bcb7aa');
	private readonly targetBackgroundColor = new THREE.Color('#bcb7aa');
	private readonly neutralSkyColor = new THREE.Color('#a8adb0');
	private readonly districtInkColor = new THREE.Color('#252726');
	private readonly localCameraFrame = {
		position: { x: 0, y: 0, z: 0 },
		groundVelocity: { x: 0, y: 0, z: 0 },
		orientation: { x: 0, y: 0, z: 0, w: 1 },
		airspeed: 0,
		altitudeM: 0,
		rollRadians: 0,
		obstacleDistanceM: Number.POSITIVE_INFINITY,
		gustStrength: 0,
		elapsedSeconds: 0,
		hasPlayerInput: false,
		allowScenicDrift: false,
		dangerousPassage: false
	};
	private readonly paperFrame = { gustLoad: 0, creaseLevel: 0, elapsedSeconds: 0 };
	private readonly windMarkFrame = {
		position: { x: 0, y: 0, z: 0 },
		groundVelocity: { x: 0, y: 0, z: 0 },
		apparentWind: { x: 0, y: 0, z: 0 },
		gustStrength: 0
	};
	private readonly fog: THREE.FogExp2;
	private quality: WorldQualityTier;
	private calmCamera: boolean;
	private visualOriginX = 0;
	private visualOriginZ = 0;
	private currentDistrict: DistrictId = 'north-calcutta';
	private atmosphereChunkIndex = Number.NaN;
	private targetFogDensity = 0.00275;
	private elapsedSeconds = 0;
	private drawCalls = 0;
	private triangles = 0;
	private visibilityLastCheckSeconds = Number.NEGATIVE_INFINITY;
	private visibilityResultAvailable = false;
	private disposed = false;

	constructor(options: KagojerDanaWorldOptions) {
		this.quality = options.quality ?? 'balanced';
		this.calmCamera = options.calmCamera ?? false;
		this.route = generateDistrictRoute(options.seed);
		this.onChunkActivate = options.onChunkActivate;
		this.onChunkDeactivate = options.onChunkDeactivate;
		this.scene.name = 'Kagojer Dana — charcoal Calcutta';
		this.scene.background = this.backgroundColor;
		this.fog = new THREE.FogExp2('#a8aaa3', 0.0025);
		this.scene.fog = this.fog;
		this.worldRoot.name = 'streamed-dream-geography';
		this.scene.add(this.worldRoot);

		const hemisphere = new THREE.HemisphereLight('#d9d4c4', '#504a40', 1.55);
		hemisphere.name = 'paper-sky-fill';
		const sun = new THREE.DirectionalLight('#eee2c6', 2.3);
		sun.name = 'monsoon-broken-sun';
		sun.position.set(-90, 150, -70);
		sun.castShadow = this.quality === 'high';
		sun.shadow.mapSize.set(1_024, 1_024);
		sun.shadow.camera.near = 20;
		sun.shadow.camera.far = 420;
		this.scene.add(hemisphere, sun);

		this.paperPlane = new PaperPlaneVisual({ scale: 0.72, handledAmount: 0.31 });
		this.paperPlane.object.name = 'folded-off-white-paper-plane';
		this.scene.add(this.paperPlane.object);
		this.windMarks = new WindMarkVisual();
		this.scene.add(this.windMarks.object);
		this.cameraRig = new PaperPlaneCameraRig(undefined, { calmCamera: this.calmCamera });
		this.camera = this.cameraRig.camera;
		this.pipeline = new CharcoalPipeline(this.quality);
		this.visualFactory = new DistrictChunkVisualFactory(this.quality);
		this.chunkManager = new DistrictChunkManager({
			route: this.route,
			parent: this.worldRoot,
			visualFactory: this.visualFactory,
			quality: this.quality,
			minimumChunkIndex: 0,
			onActivate: (chunk) => this.handleChunkActivate(chunk),
			onDeactivate: (chunk) => this.handleChunkDeactivate(chunk)
		});
		this.chunkManager.update(0);
	}

	private handleChunkActivate(chunk: ActiveDistrictChunk): void {
		this.activeColliders.push(...chunk.colliders);
		this.cameraCollisionObjects.push(chunk.object);
		chunk.object.traverse((child) => {
			const id = child.userData.landmarkId as LandmarkId | undefined;
			const anchor = child.userData.visibilityAnchor as THREE.Object3D | undefined;
			if (
				child.userData.prominence === 'hero' &&
				id !== undefined &&
				anchor instanceof THREE.Object3D
			) {
				this.activeHeroes.push({
					id,
					chunkIndex: chunk.index,
					object: child,
					anchor,
					radiusM: finite(anchor.userData.visibilityRadiusM, 20)
				});
			}
		});
		this.cameraRig.setCollisionObjects(this.cameraCollisionObjects);
		this.visibilityLastCheckSeconds = Number.NEGATIVE_INFINITY;
		try {
			this.onChunkActivate?.(chunk);
		} catch {
			// Observability callbacks must not destabilize flight.
		}
	}

	private handleChunkDeactivate(chunk: ActiveDistrictChunk): void {
		for (const collider of chunk.colliders) {
			const index = this.activeColliders.indexOf(collider);
			if (index >= 0) this.activeColliders.splice(index, 1);
		}
		const objectIndex = this.cameraCollisionObjects.indexOf(chunk.object);
		if (objectIndex >= 0) this.cameraCollisionObjects.splice(objectIndex, 1);
		for (let index = this.activeHeroes.length - 1; index >= 0; index -= 1) {
			if (this.activeHeroes[index].chunkIndex === chunk.index) this.activeHeroes.splice(index, 1);
		}
		this.cameraRig.setCollisionObjects(this.cameraCollisionObjects);
		this.visibilityLastCheckSeconds = Number.NEGATIVE_INFINITY;
		try {
			this.onChunkDeactivate?.(chunk);
		} catch {
			// Observability callbacks must not destabilize flight.
		}
	}

	update(frame: KagojerDanaRenderFrame, deltaSeconds: number): void {
		if (this.disposed) return;
		const dt = Math.max(0, Math.min(0.1, finite(deltaSeconds)));
		this.elapsedSeconds = Math.max(
			this.elapsedSeconds + dt,
			finite(frame.elapsedSeconds, this.elapsedSeconds + dt)
		);
		const globalX = finite(frame.position.x);
		const globalY = finite(frame.position.y);
		const globalZ = finite(frame.position.z);
		const nextOriginX = Math.round(globalX / FLOATING_ORIGIN_STEP_M) * FLOATING_ORIGIN_STEP_M;
		const nextOriginZ = Math.round(globalZ / FLOATING_ORIGIN_STEP_M) * FLOATING_ORIGIN_STEP_M;
		const originChanged = nextOriginX !== this.visualOriginX || nextOriginZ !== this.visualOriginZ;
		if (originChanged) {
			this.visualOriginX = nextOriginX;
			this.visualOriginZ = nextOriginZ;
			this.chunkManager.setVisualOrigin(this.visualOriginX, this.visualOriginZ);
		}
		this.chunkManager.update(globalZ);

		this.paperPlane.object.position.set(
			globalX - this.visualOriginX,
			globalY,
			globalZ - this.visualOriginZ
		);
		this.paperPlane.object.quaternion.set(
			finite(frame.orientation.x),
			finite(frame.orientation.y),
			finite(frame.orientation.z),
			finite(frame.orientation.w, 1)
		);
		if (this.paperPlane.object.quaternion.lengthSq() < 0.5)
			this.paperPlane.object.quaternion.identity();
		else this.paperPlane.object.quaternion.normalize();
		this.paperFrame.gustLoad = finite(frame.gustStrength);
		this.paperFrame.creaseLevel = finite(frame.creaseLevel);
		this.paperFrame.elapsedSeconds = this.elapsedSeconds;
		this.paperPlane.update(this.paperFrame);
		this.windMarkFrame.position.x = globalX - this.visualOriginX;
		this.windMarkFrame.position.y = globalY;
		this.windMarkFrame.position.z = globalZ - this.visualOriginZ;
		this.windMarkFrame.groundVelocity.x = finite(frame.groundVelocity.x);
		this.windMarkFrame.groundVelocity.y = finite(frame.groundVelocity.y);
		this.windMarkFrame.groundVelocity.z = finite(frame.groundVelocity.z);
		this.windMarkFrame.apparentWind.x = finite(
			frame.apparentWind?.x,
			-this.windMarkFrame.groundVelocity.x
		);
		this.windMarkFrame.apparentWind.y = finite(
			frame.apparentWind?.y,
			-this.windMarkFrame.groundVelocity.y
		);
		this.windMarkFrame.apparentWind.z = finite(
			frame.apparentWind?.z,
			-this.windMarkFrame.groundVelocity.z
		);
		this.windMarkFrame.gustStrength = finite(frame.gustStrength);
		this.windMarks.update(this.windMarkFrame);

		const localCameraFrame = this.localCameraFrame;
		localCameraFrame.position.x = globalX - this.visualOriginX;
		localCameraFrame.position.y = globalY;
		localCameraFrame.position.z = globalZ - this.visualOriginZ;
		localCameraFrame.groundVelocity.x = finite(frame.groundVelocity.x);
		localCameraFrame.groundVelocity.y = finite(frame.groundVelocity.y);
		localCameraFrame.groundVelocity.z = finite(frame.groundVelocity.z);
		localCameraFrame.orientation.x = finite(frame.orientation.x);
		localCameraFrame.orientation.y = finite(frame.orientation.y);
		localCameraFrame.orientation.z = finite(frame.orientation.z);
		localCameraFrame.orientation.w = finite(frame.orientation.w, 1);
		localCameraFrame.airspeed = finite(frame.airspeed);
		localCameraFrame.altitudeM = finite(frame.altitudeM, globalY);
		localCameraFrame.rollRadians = finite(frame.rollRadians);
		localCameraFrame.obstacleDistanceM = finite(frame.obstacleDistanceM, Number.POSITIVE_INFINITY);
		localCameraFrame.gustStrength = finite(frame.gustStrength);
		localCameraFrame.elapsedSeconds = this.elapsedSeconds;
		localCameraFrame.hasPlayerInput = frame.hasPlayerInput === true;
		localCameraFrame.allowScenicDrift = frame.allowScenicDrift === true;
		localCameraFrame.dangerousPassage = frame.dangerousPassage === true;
		if (originChanged) this.cameraRig.reset(localCameraFrame);
		else this.cameraRig.update(localCameraFrame, dt);
		this.visualFactory.updateCharcoal(this.elapsedSeconds, this.calmCamera);
		this.updateDistrictAtmosphere(dt);
	}

	private updateDistrictAtmosphere(deltaSeconds: number): void {
		const chunkIndex = this.chunkManager.currentChunkIndex;
		if (chunkIndex !== this.atmosphereChunkIndex) {
			this.atmosphereChunkIndex = chunkIndex;
			const { node } = districtNodeForChunk(this.route, chunkIndex);
			this.currentDistrict = node.district;
			this.targetBackgroundColor.set(node.palette.paper).lerp(this.neutralSkyColor, 0.26);
			this.districtInkColor.set(node.palette.ink);
			this.targetFogDensity =
				node.district === 'hooghly'
					? 0.00175
					: node.district === 'maidan-victoria' || node.district === 'new-town'
						? 0.00195
						: 0.00275;
		}
		const alpha = 1 - Math.exp(-Math.max(0, deltaSeconds) / 1.8);
		this.backgroundColor.lerp(this.targetBackgroundColor, alpha);
		this.fog.density += (this.targetFogDensity - this.fog.density) * alpha;
		this.fog.color.copy(this.backgroundColor).lerp(this.districtInkColor, 0.13);
	}

	render(renderer: THREE.WebGLRenderer): void {
		if (this.disposed) return;
		const metrics = this.pipeline.render(renderer, this.scene, this.camera);
		this.drawCalls = metrics.drawCalls;
		this.triangles = metrics.triangles;
	}

	resize(width: number, height: number, devicePixelRatio = 1): void {
		if (this.disposed) return;
		this.cameraRig.resize(width, height);
		this.pipeline.resize(width, height, devicePixelRatio);
	}

	setQuality(quality: WorldQualityTier): void {
		if (this.disposed || quality === this.quality) return;
		this.quality = quality;
		this.chunkManager.setQuality(quality);
		this.pipeline.setQuality(quality);
	}

	setCalmCamera(calm: boolean): void {
		this.calmCamera = calm;
		this.cameraRig.setCalmCamera(calm);
	}

	/** Makes airflow marks denser and higher-contrast without touching simulation. */
	setStrongWindMarks(strong: boolean): void {
		this.windMarks.setStrong(strong);
	}

	/** Stable array identity; contents change only on chunk activation/deactivation. */
	getColliders(): readonly WorldCollisionShape[] {
		return this.activeColliders;
	}

	/**
	 * Geometric visibility for folio/scenic dwell gates. A hero must intersect
	 * the camera frustum and have an unobstructed centre ray, so elapsed time
	 * alone can never unlock a landmark.
	 */
	getVisibleHeroLandmark(): VisibleHeroLandmark | null {
		if (this.activeHeroes.length === 0 || this.disposed) {
			this.visibilityResultAvailable = false;
			return null;
		}
		// Raycaster intersections allocate small result records. Caching for one
		// tenth of a second keeps an 8 s dwell gate truthful without doing that
		// work multiple times in the same frame or at display refresh rate.
		if (this.elapsedSeconds - this.visibilityLastCheckSeconds < 0.1)
			return this.visibilityResultAvailable ? this.visibleHeroResult : null;
		this.visibilityLastCheckSeconds = this.elapsedSeconds;
		this.camera.updateMatrixWorld();
		this.visibilityMatrix.multiplyMatrices(
			this.camera.projectionMatrix,
			this.camera.matrixWorldInverse
		);
		this.visibilityFrustum.setFromProjectionMatrix(this.visibilityMatrix);
		let found = false;
		let bestInView = false;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const hero of this.activeHeroes) {
			hero.anchor.getWorldPosition(this.visibilityCentre);
			const distanceM = this.camera.position.distanceTo(this.visibilityCentre);
			this.visibilitySphere.center.copy(this.visibilityCentre);
			this.visibilitySphere.radius = hero.radiusM;
			let inView =
				distanceM <= this.camera.far &&
				this.visibilityFrustum.intersectsSphere(this.visibilitySphere);
			if (inView) {
				this.visibilityDirection
					.subVectors(this.visibilityCentre, this.camera.position)
					.multiplyScalar(1 / Math.max(0.001, distanceM));
				this.visibilityRaycaster.set(this.camera.position, this.visibilityDirection);
				this.visibilityRaycaster.near = this.camera.near;
				this.visibilityRaycaster.far = distanceM;
				this.visibilityHits.length = 0;
				this.visibilityRaycaster.intersectObjects(
					this.cameraCollisionObjects,
					true,
					this.visibilityHits
				);
				const firstHit = this.visibilityHits[0];
				if (
					firstHit &&
					firstHit.distance < distanceM - hero.radiusM * 0.2 &&
					!this.isDescendantOf(firstHit.object, hero.object)
				) {
					inView = false;
				}
			}
			if (
				!found ||
				(inView && !bestInView) ||
				(inView === bestInView && distanceM < bestDistance)
			) {
				found = true;
				bestInView = inView;
				bestDistance = distanceM;
				this.visibleHeroResult.id = hero.id;
				this.visibleHeroResult.inView = inView;
				this.visibleHeroResult.distanceM = distanceM;
			}
		}
		this.visibilityResultAvailable = found;
		return found ? this.visibleHeroResult : null;
	}

	private isDescendantOf(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
		let cursor: THREE.Object3D | null = object;
		while (cursor) {
			if (cursor === ancestor) return true;
			cursor = cursor.parent;
		}
		return false;
	}

	getMetrics(): KagojerDanaWorldMetrics {
		return {
			routeSignature: this.route.signature,
			currentDistrict: this.currentDistrict,
			activeChunkCount: this.chunkManager.activeChunkCount,
			activeColliderCount: this.activeColliders.length,
			drawCalls: this.drawCalls,
			triangles: this.triangles,
			quality: this.quality,
			visualOrigin: { x: this.visualOriginX, z: this.visualOriginZ }
		};
	}

	destroy(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.chunkManager.dispose();
		this.pipeline.dispose();
		this.paperPlane.dispose();
		this.windMarks.dispose();
		this.activeColliders.length = 0;
		this.cameraCollisionObjects.length = 0;
		this.activeHeroes.length = 0;
		this.visibilityResultAvailable = false;
		this.scene.clear();
	}
}

export function createKagojerDanaWorldScene(
	options: KagojerDanaWorldOptions
): KagojerDanaWorldScene {
	return new KagojerDanaWorldScene(options);
}
