import * as THREE from 'three';
import { createChargePockets, electricFieldProxy } from '../charge-field';
import { SeededRandom } from '../prng';
import { normalizedToWorld, sampleTerrainHeight, worldToNormalized } from '../terrain';
import { clamp, normalize } from '../vectors';
import type {
	AttachmentCandidate,
	LightningFlash,
	LightningSegment,
	QualityTier,
	SerializableAtlasState,
	TerrainData
} from '../types';
import type { LightningRenderer, LightningRendererCallbacks, RendererPlayback } from './types';
import { updateProgressiveSegmentPositions } from './progression';

const NIGHT_SKY = new THREE.Color('#07101f');
const MAP_SKY = new THREE.Color('#d8d1bd');

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
	for (const entry of Array.isArray(material) ? material : [material]) {
		for (const value of Object.values(entry)) {
			if (value instanceof THREE.Texture) value.dispose();
		}
		entry.dispose();
	}
}

function disposeObject(object: THREE.Object3D) {
	object.traverse((child) => {
		if (
			child instanceof THREE.Mesh ||
			child instanceof THREE.Line ||
			child instanceof THREE.Points
		) {
			child.geometry?.dispose();
			disposeMaterial(child.material);
		}
	});
}

function materialColor(material: number, wetness: number, heightRatio: number, fieldMap: boolean) {
	if (fieldMap) {
		const base = material === 1 ? new THREE.Color('#9fb7b4') : new THREE.Color('#d4c9aa');
		return base.lerp(new THREE.Color('#6d6554'), heightRatio * 0.48);
	}
	const colors = [
		new THREE.Color('#263f3b'),
		new THREE.Color('#173d51'),
		new THREE.Color('#4b463f'),
		new THREE.Color('#343b46'),
		new THREE.Color('#1f3b2c'),
		new THREE.Color('#42312d')
	];
	const color = (colors[material] ?? colors[0]).clone();
	color.lerp(new THREE.Color('#82949e'), clamp(heightRatio * 0.5, 0, 0.45));
	color.lerp(new THREE.Color('#152c36'), wetness * 0.22);
	return color;
}

class ThreeLightningRenderer implements LightningRenderer {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(43, 1, 2, 30_000);
	private readonly desiredCameraTarget = new THREE.Vector3();
	private readonly flashLight = new THREE.PointLight('#c8ddff', 0, 5_500, 1.65);
	private readonly world = new THREE.Group();
	private readonly stormGroup = new THREE.Group();
	private readonly lightningGroup = new THREE.Group();
	private readonly analyticalGroup = new THREE.Group();
	private readonly raycaster = new THREE.Raycaster();
	private readonly pointer = new THREE.Vector2();
	private readonly callbacks: LightningRendererCallbacks;
	private terrainMesh: THREE.Mesh | null = null;
	private waterMesh: THREE.Mesh | null = null;
	private cloudMesh: THREE.InstancedMesh | null = null;
	private cloudMaterial: THREE.MeshStandardMaterial | null = null;
	private rain: THREE.Points | null = null;
	private rainTop = 3_200;
	private chargeGroup = new THREE.Group();
	private fieldGroup = new THREE.Group();
	private contourGroup = new THREE.Group();
	private featureGroup = new THREE.Group();
	private decorationGroup = new THREE.Group();
	private observerMarker: THREE.Group | null = null;
	private lightningLines: THREE.LineSegments[] = [];
	private returnStrokeLines: THREE.LineSegments[] = [];
	private lightningSegments: LightningSegment[] = [];
	private leaderSegmentCount = 0;
	private attachmentSegmentCount = 0;
	private returnStrokeSegmentCount = 0;
	private streamerLines: THREE.LineSegments | null = null;
	private streamerTargetPositions: Float32Array | null = null;
	private streamerProgress = -1;
	private groundRings: THREE.Mesh[] = [];
	private state: SerializableAtlasState | null = null;
	private terrain: TerrainData | null = null;
	private flash: LightningFlash | null = null;
	private playback: RendererPlayback = { phase: 'charging', phaseProgress: 0, time: 0 };
	private terrainSignature = '';
	private featureSignature = '';
	private decorationSignature = '';
	private cloudSignature = '';
	private rainSignature = '';
	private analyticalSignature = '';
	private observerSignature = '';
	private stormPlacementSignature = '';
	private presentationSignature = '';
	private flashSignature = '';
	private elapsed = 0;
	private yaw = 0.74;
	private pitch = 0.48;
	private radius = 6_800;
	private cameraTarget = new THREE.Vector3(0, 260, 0);
	private dragging = false;
	private dragX = 0;
	private dragY = 0;
	private quality: QualityTier = 'low';
	private frameSamples: number[] = [];
	private disposed = false;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		callbacks: LightningRendererCallbacks
	) {
		this.callbacks = callbacks;
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: false,
			alpha: false,
			powerPreference: 'high-performance',
			preserveDrawingBuffer: false
		});
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 0.82;
		this.scene.add(this.world, this.stormGroup, this.lightningGroup, this.analyticalGroup);
		this.scene.add(new THREE.HemisphereLight('#7c92ba', '#18221e', 1.1));
		const moon = new THREE.DirectionalLight('#9eb7df', 1.35);
		moon.position.set(-2_500, 4_600, 1_800);
		this.scene.add(moon);
		this.flashLight.name = 'flash-light';
		this.scene.add(this.flashLight);
		this.canvas.addEventListener('pointerdown', this.onPointerDown);
		window.addEventListener('pointermove', this.onPointerMove);
		window.addEventListener('pointerup', this.onPointerUp);
		window.addEventListener('pointercancel', this.onPointerUp);
		this.canvas.addEventListener('lostpointercapture', this.onPointerUp);
		this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
		this.canvas.addEventListener('webglcontextlost', this.onContextLost);
		this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
		this.callbacks.onStatus?.('ready');
	}

	setScene(state: SerializableAtlasState, terrain: TerrainData) {
		if (this.disposed) return;
		this.state = state;
		this.terrain = terrain;
		const previousQuality = this.quality;
		this.resolveQuality(state.quality);
		if (previousQuality !== this.quality) {
			this.frameSamples = [];
			this.resize();
		}

		const terrainShapeIdentity = [
			terrain.seed,
			terrain.preset,
			terrain.resolution,
			terrain.widthMetres.toFixed(1),
			terrain.depthMetres.toFixed(1),
			terrain.minHeight.toFixed(2),
			terrain.maxHeight.toFixed(2)
		].join('|');
		const candidateIdentity = terrain.candidates
			.map(
				(candidate) =>
					`${candidate.id}:${candidate.kind}:${candidate.position.x.toFixed(2)}:${candidate.position.y.toFixed(2)}:${candidate.position.z.toFixed(2)}:${candidate.baseElevation.toFixed(2)}:${candidate.absoluteHeight.toFixed(2)}:${(candidate.rotation ?? 0).toFixed(1)}`
			)
			.join(',');

		const terrainSignature = [
			terrainShapeIdentity,
			state.displayMode,
			this.quality,
			state.environment.surfaceWetness.toFixed(3)
		].join('|');
		if (terrainSignature !== this.terrainSignature) {
			this.terrainSignature = terrainSignature;
			this.buildTerrain();
		}

		const featureSignature = [terrainShapeIdentity, candidateIdentity, state.displayMode].join('|');
		if (featureSignature !== this.featureSignature) {
			this.featureSignature = featureSignature;
			this.buildFeatures();
		}

		const decorationSignature = [terrainShapeIdentity, this.quality].join('|');
		if (decorationSignature !== this.decorationSignature) {
			this.decorationSignature = decorationSignature;
			this.buildDecorations();
		}

		const cloudSignature = [
			state.seed,
			terrain.preset,
			state.displayMode,
			this.quality,
			state.storm.cloudBaseMetres.toFixed(1)
		].join('|');
		if (cloudSignature !== this.cloudSignature) {
			this.cloudSignature = cloudSignature;
			this.buildClouds();
		}

		const rainSignature = [
			state.seed,
			terrain.preset,
			state.displayMode,
			this.quality,
			state.storm.cloudBaseMetres.toFixed(1)
		].join('|');
		if (rainSignature !== this.rainSignature) {
			this.rainSignature = rainSignature;
			this.buildRain();
		}
		this.updateRainPresentation();

		const analyticalSignature = [
			terrainShapeIdentity,
			state.displayMode,
			state.stormPosition.x.toFixed(4),
			state.stormPosition.z.toFixed(4),
			state.storm.chargeStrength.toFixed(4),
			state.storm.chargeSeparation.toFixed(4),
			state.storm.cloudBaseMetres.toFixed(1),
			state.storm.lowerPositiveCharge ? 1 : 0,
			state.environment.windSpeed.toFixed(2),
			state.environment.windDirection.toFixed(1)
		].join('|');
		if (analyticalSignature !== this.analyticalSignature) {
			this.analyticalSignature = analyticalSignature;
			this.buildAnalyticalLayers();
		}
		const observerSignature = [
			terrainShapeIdentity,
			state.observer.x.toFixed(4),
			state.observer.z.toFixed(4)
		].join('|');
		if (observerSignature !== this.observerSignature) {
			this.observerSignature = observerSignature;
			this.buildObserver();
		}

		const stormPlacementSignature = [
			terrainShapeIdentity,
			state.stormPosition.x.toFixed(4),
			state.stormPosition.z.toFixed(4)
		].join('|');
		if (stormPlacementSignature !== this.stormPlacementSignature) {
			this.stormPlacementSignature = stormPlacementSignature;
			this.updateStormPlacement();
		}

		const presentationSignature = [
			state.displayMode,
			state.environment.visibility.toFixed(3),
			state.environment.timeOfDay.toFixed(3),
			state.visibleLayers.includes('charge') ? 1 : 0,
			state.visibleLayers.includes('field') ? 1 : 0,
			state.visibleLayers.includes('contours') ? 1 : 0
		].join('|');
		if (presentationSignature !== this.presentationSignature) {
			this.presentationSignature = presentationSignature;
			this.updatePresentation();
		}
		this.refreshLightningGeometry();
	}

	setFlash(flash: LightningFlash | null) {
		this.flash = flash;
		this.refreshLightningGeometry();
	}

	private refreshLightningGeometry() {
		const signature = this.flash
			? [
					this.flash.channelHash,
					this.terrain?.preset ?? '',
					this.state?.visibleLayers.includes('branches') ? 1 : 0,
					this.state?.visibleLayers.includes('streamers') ? 1 : 0,
					this.state?.visibleLayers.includes('ground-current') ? 1 : 0
				].join('|')
			: '';
		if (signature === this.flashSignature) return;
		this.flashSignature = signature;
		this.buildLightning();
	}

	setPlayback(playback: RendererPlayback) {
		this.playback = playback;
		this.updateLightningPlayback();
	}

	resize() {
		if (this.disposed) return;
		const width = Math.max(1, Math.round(this.canvas.clientWidth));
		const height = Math.max(1, Math.round(this.canvas.clientHeight));
		const previousQuality = this.quality;
		if (
			this.state?.quality === 'auto' &&
			this.isConstrainedAutoQuality() &&
			this.quality === 'high'
		) {
			this.quality = 'medium';
		}
		const cap = this.quality === 'high' ? 1.75 : this.quality === 'medium' ? 1.35 : 1;
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		if (previousQuality !== this.quality && this.state && this.terrain) {
			this.frameSamples = [];
			this.setScene(this.state, this.terrain);
		}
	}

	render(deltaSeconds: number, options?: { snapCamera?: boolean }) {
		if (this.disposed || !this.state || !this.terrain) return;
		const frameStartedAt = performance.now();
		const delta = clamp(deltaSeconds, 0, 0.1);
		this.elapsed += delta;
		this.updateRain(delta);
		this.updateClouds();
		this.updateCamera(options?.snapCamera === true);
		this.updateLightningPlayback();
		this.renderer.render(this.scene, this.camera);
		if (deltaSeconds > 0) this.trackFrameTime(performance.now() - frameStartedAt);
	}

	pickNormalized(clientX: number, clientY: number) {
		if (!this.terrainMesh || !this.terrain) return null;
		const bounds = this.canvas.getBoundingClientRect();
		this.pointer.set(
			((clientX - bounds.left) / bounds.width) * 2 - 1,
			-((clientY - bounds.top) / bounds.height) * 2 + 1
		);
		this.raycaster.setFromCamera(this.pointer, this.camera);
		const hit = this.raycaster.intersectObject(this.terrainMesh, false)[0];
		if (!hit) return null;
		return worldToNormalized(hit.point, this.terrain.widthMetres, this.terrain.depthMetres);
	}

	captureCanvas() {
		this.renderer.render(this.scene, this.camera);
		return this.canvas;
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.canvas.removeEventListener('pointerdown', this.onPointerDown);
		window.removeEventListener('pointermove', this.onPointerMove);
		window.removeEventListener('pointerup', this.onPointerUp);
		window.removeEventListener('pointercancel', this.onPointerUp);
		this.canvas.removeEventListener('lostpointercapture', this.onPointerUp);
		this.canvas.removeEventListener('wheel', this.onWheel);
		this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
		disposeObject(this.scene);
		this.renderer.renderLists.dispose();
		this.renderer.dispose();
		this.renderer.forceContextLoss();
	}

	private buildTerrain() {
		if (!this.terrain || !this.state) return;
		if (this.terrainMesh) {
			this.world.remove(this.terrainMesh);
			disposeObject(this.terrainMesh);
		}
		if (this.waterMesh) {
			this.world.remove(this.waterMesh);
			disposeObject(this.waterMesh);
			this.waterMesh = null;
		}
		const { resolution, heights, materialMask, wetness } = this.terrain;
		const geometry = new THREE.BufferGeometry();
		const positions = new Float32Array(resolution * resolution * 3);
		const colors = new Float32Array(resolution * resolution * 3);
		const indices: number[] = [];
		const heightSpan = Math.max(1, this.terrain.maxHeight - this.terrain.minHeight);
		for (let z = 0; z < resolution; z += 1) {
			for (let x = 0; x < resolution; x += 1) {
				const index = z * resolution + x;
				const offset = index * 3;
				positions[offset] = (x / (resolution - 1) - 0.5) * this.terrain.widthMetres;
				positions[offset + 1] = heights[index];
				positions[offset + 2] = (z / (resolution - 1) - 0.5) * this.terrain.depthMetres;
				const color = materialColor(
					materialMask[index],
					wetness[index],
					(heights[index] - this.terrain.minHeight) / heightSpan,
					this.state.displayMode === 'field-map'
				);
				colors[offset] = color.r;
				colors[offset + 1] = color.g;
				colors[offset + 2] = color.b;
				if (x < resolution - 1 && z < resolution - 1) {
					const a = index;
					const b = index + 1;
					const c = index + resolution;
					const d = c + 1;
					indices.push(a, c, b, b, c, d);
				}
			}
		}
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		geometry.setIndex(indices);
		geometry.computeVertexNormals();
		const material = new THREE.MeshStandardMaterial({
			vertexColors: true,
			roughness: this.state.displayMode === 'field-map' ? 1 : 0.72,
			metalness: 0.02,
			flatShading: this.quality === 'low'
		});
		this.terrainMesh = new THREE.Mesh(geometry, material);
		this.terrainMesh.name = 'procedural-terrain';
		this.world.add(this.terrainMesh);

		if (this.terrain.waterMask.some((value) => value === 1)) {
			const waterGeometry = new THREE.PlaneGeometry(
				this.terrain.widthMetres * 1.04,
				this.terrain.depthMetres * 1.04,
				1,
				1
			);
			waterGeometry.rotateX(-Math.PI / 2);
			const waterMaterial = new THREE.MeshStandardMaterial({
				color: this.state.displayMode === 'field-map' ? '#8ca7a7' : '#143f58',
				transparent: true,
				opacity: this.state.displayMode === 'field-map' ? 0.72 : 0.62,
				roughness: 0.28,
				metalness: 0.08,
				depthWrite: false
			});
			this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
			this.waterMesh.position.y = 0;
			this.waterMesh.name = 'water-surface';
			this.world.add(this.waterMesh);
		}
	}

	private buildFeatures() {
		if (!this.terrain || !this.state) return;
		this.world.remove(this.featureGroup);
		disposeObject(this.featureGroup);
		this.featureGroup = new THREE.Group();
		this.featureGroup.name = 'semantic-features';
		const material = new THREE.MeshStandardMaterial({
			color: this.state.displayMode === 'field-map' ? '#5d584c' : '#2c3236',
			roughness: 0.76,
			metalness: 0.24
		});
		const warmMaterial = new THREE.MeshStandardMaterial({
			color: this.state.displayMode === 'field-map' ? '#75684f' : '#5b4939',
			emissive: this.state.displayMode === 'field-map' ? '#000000' : '#251509',
			emissiveIntensity: 0.45,
			roughness: 0.88
		});
		for (const candidate of this.terrain.candidates) {
			if (['terrain', 'ridge', 'ocean-surface', 'volcanic-cone'].includes(candidate.kind)) continue;
			this.addFeatureGeometry(candidate, material, warmMaterial);
		}
		this.world.add(this.featureGroup);
	}

	private addFeatureGeometry(
		candidate: AttachmentCandidate,
		metal: THREE.MeshStandardMaterial,
		warm: THREE.MeshStandardMaterial
	) {
		const height = Math.max(12, candidate.absoluteHeight - candidate.baseElevation);
		const group = new THREE.Group();
		group.position.set(candidate.position.x, candidate.baseElevation, candidate.position.z);
		group.rotation.y = ((candidate.rotation ?? 0) * Math.PI) / 180;
		if (candidate.kind === 'tree' || candidate.kind === 'tree-cluster') {
			const trunk = new THREE.Mesh(
				new THREE.CylinderGeometry(2.4, 4, height * 0.45, 6),
				warm.clone()
			);
			trunk.position.y = height * 0.225;
			const crown = new THREE.Mesh(
				new THREE.ConeGeometry(height * 0.22, height * 0.68, 8),
				new THREE.MeshStandardMaterial({ color: '#183929', roughness: 1 })
			);
			crown.position.y = height * 0.64;
			group.add(trunk, crown);
		} else if (candidate.kind === 'low-building' || candidate.kind === 'high-rise') {
			const width = candidate.kind === 'high-rise' ? 44 : 70;
			const building = new THREE.Mesh(
				new THREE.BoxGeometry(width, height, width * 0.72),
				warm.clone()
			);
			building.position.y = height / 2;
			group.add(building);
		} else if (candidate.kind === 'water-tower') {
			const stem = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, height * 0.7, 8), metal.clone());
			stem.position.y = height * 0.35;
			const tank = new THREE.Mesh(new THREE.SphereGeometry(height * 0.13, 10, 7), metal.clone());
			tank.scale.y = 0.65;
			tank.position.y = height * 0.82;
			group.add(stem, tank);
		} else if (candidate.kind === 'ship' || candidate.kind === 'offshore-platform') {
			const deck = new THREE.Mesh(new THREE.BoxGeometry(115, 15, 48), warm.clone());
			deck.position.y = 8;
			const mast = new THREE.Mesh(new THREE.CylinderGeometry(2, 3.5, height, 7), metal.clone());
			mast.position.y = height / 2;
			group.add(deck, mast);
		} else {
			const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 5.5, height, 7), metal.clone());
			stem.position.y = height / 2;
			group.add(stem);
			if (candidate.kind === 'wind-turbine') {
				const hub = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), metal.clone());
				hub.position.y = height * 0.92;
				group.add(hub);
				for (let index = 0; index < 3; index += 1) {
					const blade = new THREE.Mesh(new THREE.BoxGeometry(3, height * 0.32, 2), metal.clone());
					blade.position.y = height * 0.92;
					blade.rotation.z = (index * Math.PI * 2) / 3;
					blade.translateY(height * 0.14);
					group.add(blade);
				}
			}
		}
		this.featureGroup.add(group);
	}

	private buildDecorations() {
		if (!this.terrain || !this.state) return;
		this.world.remove(this.decorationGroup);
		disposeObject(this.decorationGroup);
		this.decorationGroup = new THREE.Group();
		const random = new SeededRandom(
			`${this.terrain.seed}|decorative-instances|${this.terrain.preset}`
		);
		if (this.terrain.preset === 'forest-basin' || this.terrain.preset === 'monsoon-delta') {
			const count =
				this.terrain.preset === 'forest-basin' ? (this.quality === 'low' ? 90 : 220) : 48;
			const geometry = new THREE.ConeGeometry(15, 54, 5);
			const material = new THREE.MeshStandardMaterial({ color: '#173526', roughness: 1 });
			const trees = new THREE.InstancedMesh(geometry, material, count);
			const matrix = new THREE.Matrix4();
			for (let index = 0; index < count; index += 1) {
				const x = (random.nextFloat() - 0.5) * this.terrain.widthMetres;
				const z = (random.nextFloat() - 0.5) * this.terrain.depthMetres;
				const y = sampleTerrainHeight(this.terrain, x, z) + 26;
				matrix.compose(
					new THREE.Vector3(x, y, z),
					new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random.nextFloat() * Math.PI, 0)),
					new THREE.Vector3(
						0.65 + random.nextFloat() * 0.7,
						0.65 + random.nextFloat() * 0.7,
						0.65 + random.nextFloat() * 0.7
					)
				);
				trees.setMatrixAt(index, matrix);
			}
			trees.instanceMatrix.needsUpdate = true;
			this.decorationGroup.add(trees);
		}
		if (this.terrain.preset === 'urban-plain') {
			const count = this.quality === 'low' ? 42 : 86;
			const geometry = new THREE.BoxGeometry(70, 1, 65);
			const material = new THREE.MeshStandardMaterial({ color: '#323943', roughness: 0.88 });
			const buildings = new THREE.InstancedMesh(geometry, material, count);
			const matrix = new THREE.Matrix4();
			for (let index = 0; index < count; index += 1) {
				const x = (random.nextFloat() - 0.5) * this.terrain.widthMetres * 0.86;
				const z = (random.nextFloat() - 0.5) * this.terrain.depthMetres * 0.86;
				const height = 20 + random.nextFloat() * 75;
				const y = sampleTerrainHeight(this.terrain, x, z) + height / 2;
				matrix.compose(
					new THREE.Vector3(x, y, z),
					new THREE.Quaternion(),
					new THREE.Vector3(0.75 + random.nextFloat(), height, 0.75 + random.nextFloat())
				);
				buildings.setMatrixAt(index, matrix);
			}
			buildings.instanceMatrix.needsUpdate = true;
			this.decorationGroup.add(buildings);
		}
		this.world.add(this.decorationGroup);
	}

	private buildClouds() {
		if (!this.state || !this.terrain) return;
		if (this.cloudMesh) {
			this.stormGroup.remove(this.cloudMesh);
			disposeObject(this.cloudMesh);
			this.cloudMesh = null;
			this.cloudMaterial = null;
		}
		const count = this.quality === 'high' ? 62 : this.quality === 'medium' ? 38 : 20;
		const geometry = new THREE.IcosahedronGeometry(1, this.quality === 'low' ? 1 : 2);
		this.cloudMaterial = new THREE.MeshStandardMaterial({
			color: this.state.displayMode === 'field-map' ? '#8d8d86' : '#222b3e',
			emissive: '#8096c7',
			emissiveIntensity: 0.04,
			transparent: true,
			opacity: this.state.displayMode === 'field-map' ? 0.46 : 0.72,
			roughness: 1,
			depthWrite: false
		});
		this.cloudMesh = new THREE.InstancedMesh(geometry, this.cloudMaterial, count);
		const random = new SeededRandom(`${this.state.seed}|cloud-form|${this.terrain.preset}`);
		const matrix = new THREE.Matrix4();
		for (let index = 0; index < count; index += 1) {
			const angle = random.nextFloat() * Math.PI * 2;
			const radius = Math.pow(random.nextFloat(), 0.65) * 1_450;
			const scaleX = 270 + random.nextFloat() * 520;
			const scaleY = 120 + random.nextFloat() * 270;
			const scaleZ = 240 + random.nextFloat() * 480;
			matrix.compose(
				new THREE.Vector3(
					Math.cos(angle) * radius,
					this.state.storm.cloudBaseMetres + 340 + random.nextFloat() * 720,
					Math.sin(angle) * radius * 0.74
				),
				new THREE.Quaternion(),
				new THREE.Vector3(scaleX, scaleY, scaleZ)
			);
			this.cloudMesh.setMatrixAt(index, matrix);
		}
		this.cloudMesh.instanceMatrix.needsUpdate = true;
		this.stormGroup.add(this.cloudMesh);
	}

	private buildRain() {
		if (!this.state || !this.terrain) return;
		if (this.rain) {
			this.stormGroup.remove(this.rain);
			disposeObject(this.rain);
			this.rain = null;
		}
		const count = this.quality === 'high' ? 1_600 : this.quality === 'medium' ? 900 : 360;
		const positions = new Float32Array(count * 3);
		const random = new SeededRandom(`${this.state.seed}|decorative-rain|${this.quality}`);
		this.rainTop = this.state.storm.cloudBaseMetres + 1_300;
		for (let index = 0; index < count; index += 1) {
			positions[index * 3] = (random.nextFloat() - 0.5) * 5_200;
			positions[index * 3 + 1] = random.nextFloat() * this.rainTop;
			positions[index * 3 + 2] = (random.nextFloat() - 0.5) * 4_200;
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		const material = new THREE.PointsMaterial({
			color: this.state.displayMode === 'field-map' ? '#6d7e80' : '#7997b2',
			size: this.quality === 'low' ? 7 : 5,
			transparent: true,
			opacity: 0.32 * this.state.environment.rainIntensity,
			depthWrite: false
		});
		this.rain = new THREE.Points(geometry, material);
		this.stormGroup.add(this.rain);
	}

	private updateRainPresentation() {
		if (!this.rain || !this.state) return;
		(this.rain.material as THREE.PointsMaterial).opacity =
			0.32 * this.state.environment.rainIntensity;
		this.rain.visible = this.state.environment.rainIntensity > 0;
	}

	private updateStormPlacement() {
		if (!this.state || !this.terrain) return;
		const storm = normalizedToWorld(
			this.state.stormPosition,
			this.terrain.widthMetres,
			this.terrain.depthMetres
		);
		this.stormGroup.position.set(
			storm.x,
			sampleTerrainHeight(this.terrain, storm.x, storm.z),
			storm.z
		);
	}

	private buildAnalyticalLayers() {
		if (!this.state || !this.terrain) return;
		this.analyticalGroup.remove(this.chargeGroup, this.fieldGroup, this.contourGroup);
		disposeObject(this.chargeGroup);
		disposeObject(this.fieldGroup);
		disposeObject(this.contourGroup);
		this.chargeGroup = new THREE.Group();
		this.fieldGroup = new THREE.Group();
		this.contourGroup = this.buildTerrainContours();
		const pockets = createChargePockets(this.state, this.terrain);
		for (const pocket of pockets) {
			const geometry = new THREE.SphereGeometry(1, 14, 9);
			const material = new THREE.MeshBasicMaterial({
				color: pocket.polarity > 0 ? '#df9f77' : '#81a8e7',
				wireframe: true,
				transparent: true,
				opacity: 0.3,
				depthWrite: false
			});
			const sphere = new THREE.Mesh(geometry, material);
			sphere.position.set(pocket.center.x, pocket.center.y, pocket.center.z);
			sphere.scale.set(pocket.radii.x, pocket.radii.y, pocket.radii.z);
			this.chargeGroup.add(sphere);
		}

		const fieldPositions: number[] = [];
		for (let zIndex = 0; zIndex < 5; zIndex += 1) {
			for (let xIndex = 0; xIndex < 7; xIndex += 1) {
				const x = (xIndex / 6 - 0.5) * this.terrain.widthMetres * 0.82;
				const z = (zIndex / 4 - 0.5) * this.terrain.depthMetres * 0.82;
				const y = sampleTerrainHeight(this.terrain, x, z) + 210;
				const field = normalize(electricFieldProxy({ x, y, z }, pockets));
				fieldPositions.push(x, y, z, x + field.x * 210, y + field.y * 210, z + field.z * 210);
			}
		}
		const fieldGeometry = new THREE.BufferGeometry();
		fieldGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fieldPositions, 3));
		this.fieldGroup.add(
			new THREE.LineSegments(
				fieldGeometry,
				new THREE.LineBasicMaterial({ color: '#b7a276', transparent: true, opacity: 0.44 })
			)
		);
		this.chargeGroup.visible = this.state.visibleLayers.includes('charge');
		this.fieldGroup.visible = this.state.visibleLayers.includes('field');
		this.contourGroup.visible = this.state.visibleLayers.includes('contours');
		this.analyticalGroup.add(this.chargeGroup, this.fieldGroup, this.contourGroup);
	}

	private buildTerrainContours() {
		const group = new THREE.Group();
		if (!this.terrain || this.terrain.maxHeight - this.terrain.minHeight < 1) return group;
		const { resolution, heights, widthMetres, depthMetres, minHeight, maxHeight } = this.terrain;
		const positions: number[] = [];
		const levels = Array.from(
			{ length: 7 },
			(_, index) => minHeight + ((index + 1) / 8) * (maxHeight - minHeight)
		);
		const point = (xIndex: number, zIndex: number) => ({
			x: (xIndex / (resolution - 1) - 0.5) * widthMetres,
			y: heights[zIndex * resolution + xIndex],
			z: (zIndex / (resolution - 1) - 0.5) * depthMetres
		});
		for (const level of levels) {
			for (let zIndex = 0; zIndex < resolution - 1; zIndex += 1) {
				for (let xIndex = 0; xIndex < resolution - 1; xIndex += 1) {
					const corners = [
						point(xIndex, zIndex),
						point(xIndex + 1, zIndex),
						point(xIndex + 1, zIndex + 1),
						point(xIndex, zIndex + 1)
					];
					const intersections: Array<{ x: number; y: number; z: number }> = [];
					for (const [startIndex, endIndex] of [
						[0, 1],
						[1, 2],
						[2, 3],
						[3, 0]
					] as const) {
						const start = corners[startIndex];
						const end = corners[endIndex];
						if (!((start.y < level && end.y >= level) || (end.y < level && start.y >= level))) {
							continue;
						}
						const mix = (level - start.y) / Math.max(1e-6, end.y - start.y);
						intersections.push({
							x: start.x + (end.x - start.x) * mix,
							y: level + 4,
							z: start.z + (end.z - start.z) * mix
						});
					}
					for (let index = 0; index + 1 < intersections.length; index += 2) {
						const start = intersections[index];
						const end = intersections[index + 1];
						positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
					}
				}
			}
		}
		if (!positions.length) return group;
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		group.add(
			new THREE.LineSegments(
				geometry,
				new THREE.LineBasicMaterial({
					color: this.state?.displayMode === 'field-map' ? '#5e5948' : '#8a94a2',
					transparent: true,
					opacity: 0.36
				})
			)
		);
		return group;
	}

	private buildObserver() {
		if (!this.state || !this.terrain) return;
		if (this.observerMarker) {
			this.world.remove(this.observerMarker);
			disposeObject(this.observerMarker);
		}
		const position = normalizedToWorld(
			this.state.observer,
			this.terrain.widthMetres,
			this.terrain.depthMetres
		);
		const y = sampleTerrainHeight(this.terrain, position.x, position.z);
		const marker = new THREE.Group();
		const stem = new THREE.Mesh(
			new THREE.CylinderGeometry(3, 3, 42, 8),
			new THREE.MeshBasicMaterial({ color: '#f4c96b' })
		);
		stem.position.y = 21;
		const head = new THREE.Mesh(
			new THREE.SphereGeometry(8, 10, 7),
			new THREE.MeshBasicMaterial({ color: '#fff0b0' })
		);
		head.position.y = 49;
		marker.add(stem, head);
		marker.position.set(position.x, y, position.z);
		marker.name = 'observer';
		this.observerMarker = marker;
		this.world.add(marker);
	}

	private buildLightning() {
		disposeObject(this.lightningGroup);
		this.lightningGroup.clear();
		this.lightningLines = [];
		this.returnStrokeLines = [];
		this.lightningSegments = [];
		this.leaderSegmentCount = 0;
		this.attachmentSegmentCount = 0;
		this.returnStrokeSegmentCount = 0;
		this.streamerLines = null;
		this.streamerTargetPositions = null;
		this.streamerProgress = -1;
		this.groundRings = [];
		if (!this.flash || !this.state) return;
		const visibleSegments = this.state.visibleLayers.includes('branches')
			? this.flash.segments
			: this.flash.segments.filter((segment) => segment.isMainChannel);
		const leaderSegments = visibleSegments.filter((segment) => !segment.isAttachmentConnection);
		const attachmentSegments = visibleSegments.filter((segment) => segment.isAttachmentConnection);
		this.lightningSegments = [...leaderSegments, ...attachmentSegments];
		this.leaderSegmentCount = leaderSegments.length;
		this.attachmentSegmentCount = attachmentSegments.length;
		const positions = new Float32Array(this.lightningSegments.length * 6);
		for (let index = 0; index < this.lightningSegments.length; index += 1) {
			const segment = this.lightningSegments[index];
			const offset = index * 6;
			positions[offset] = segment.start.x;
			positions[offset + 1] = segment.start.y;
			positions[offset + 2] = segment.start.z;
			positions[offset + 3] = segment.end.x;
			positions[offset + 4] = segment.end.y;
			positions[offset + 5] = segment.end.z;
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		const baseLineStyles = [
			['#d6e4ff', 1],
			['#8199ff', 0.52],
			['#5b63d2', 0.22]
		] as const;
		for (let index = 0; index < baseLineStyles.length; index += 1) {
			const [color, opacity] = baseLineStyles[index];
			const line = new THREE.LineSegments(
				index === 0 ? geometry : geometry.clone(),
				new THREE.LineBasicMaterial({
					color,
					transparent: true,
					opacity,
					blending: THREE.AdditiveBlending,
					depthWrite: false
				})
			);
			line.geometry.setDrawRange(0, 0);
			this.lightningLines.push(line);
			this.lightningGroup.add(line);
		}

		if (this.flash.attachment && this.flash.mainPath.length) {
			const returnPositions = new Float32Array(this.flash.mainPath.length * 6);
			let returnIndex = 0;
			for (let pathIndex = this.flash.mainPath.length - 1; pathIndex >= 0; pathIndex -= 1) {
				const segment = this.flash.segments[this.flash.mainPath[pathIndex]];
				if (!segment) continue;
				const offset = returnIndex * 6;
				returnPositions[offset] = segment.end.x;
				returnPositions[offset + 1] = segment.end.y;
				returnPositions[offset + 2] = segment.end.z;
				returnPositions[offset + 3] = segment.start.x;
				returnPositions[offset + 4] = segment.start.y;
				returnPositions[offset + 5] = segment.start.z;
				returnIndex += 1;
			}
			this.returnStrokeSegmentCount = returnIndex;
			const returnGeometry = new THREE.BufferGeometry();
			returnGeometry.setAttribute('position', new THREE.BufferAttribute(returnPositions, 3));
			const returnLineColors = ['#fff8df', '#d8e8ff', '#829cff'] as const;
			for (let index = 0; index < returnLineColors.length; index += 1) {
				const color = returnLineColors[index];
				const line = new THREE.LineSegments(
					index === 0 ? returnGeometry : returnGeometry.clone(),
					new THREE.LineBasicMaterial({
						color,
						transparent: true,
						opacity: 0,
						blending: THREE.AdditiveBlending,
						depthWrite: false
					})
				);
				line.renderOrder = 3 + index;
				line.geometry.setDrawRange(0, 0);
				this.returnStrokeLines.push(line);
				this.lightningGroup.add(line);
			}
		}

		if (this.flash.streamers.length && this.state.visibleLayers.includes('streamers')) {
			const streamerPositions = new Float32Array(this.flash.streamers.length * 6);
			this.streamerTargetPositions = new Float32Array(this.flash.streamers.length * 6);
			for (let index = 0; index < this.flash.streamers.length; index += 1) {
				const streamer = this.flash.streamers[index];
				this.streamerTargetPositions.set(
					[
						streamer.start.x,
						streamer.start.y,
						streamer.start.z,
						streamer.end.x,
						streamer.end.y,
						streamer.end.z
					],
					index * 6
				);
			}
			updateProgressiveSegmentPositions(this.streamerTargetPositions, streamerPositions, 0);
			const streamerGeometry = new THREE.BufferGeometry();
			streamerGeometry.setAttribute('position', new THREE.BufferAttribute(streamerPositions, 3));
			this.streamerLines = new THREE.LineSegments(
				streamerGeometry,
				new THREE.LineBasicMaterial({
					color: '#d5b9ff',
					transparent: true,
					opacity: 0,
					blending: THREE.AdditiveBlending,
					depthWrite: false
				})
			);
			this.lightningGroup.add(this.streamerLines);
		}

		if (this.flash.attachment && this.state.visibleLayers.includes('ground-current')) {
			for (let index = 0; index < 3; index += 1) {
				const ring = new THREE.Mesh(
					new THREE.RingGeometry(0.92, 1, 72),
					new THREE.MeshBasicMaterial({
						color: this.terrain?.preset === 'open-ocean' ? '#82c8df' : '#c4b87b',
						transparent: true,
						opacity: 0,
						side: THREE.DoubleSide,
						depthWrite: false
					})
				);
				ring.rotation.x = -Math.PI / 2;
				ring.position.set(
					this.flash.attachment.position.x,
					this.flash.attachment.position.y + 2 + index,
					this.flash.attachment.position.z
				);
				ring.visible = false;
				this.groundRings.push(ring);
				this.lightningGroup.add(ring);
			}
		}
		this.updateLightningPlayback();
	}

	private updateLightningPlayback() {
		if (!this.flash || !this.state) return;
		const { phase, phaseProgress, time } = this.playback;
		const progress = clamp(phaseProgress, 0, 1);
		const completeSegmentCount = this.leaderSegmentCount + this.attachmentSegmentCount;
		let visibleSegments = 0;
		let baseIntensity = 0.12;
		let returnStrokeSegments = 0;
		let returnStrokeIntensity = 0;
		if (phase === 'cloud-breakdown' && this.flash.type === 'intra-cloud') {
			visibleSegments = Math.floor(this.leaderSegmentCount * progress * 0.16);
		}
		if (phase === 'leader') {
			visibleSegments = Math.floor(this.leaderSegmentCount * progress);
			baseIntensity = this.state.displayMode === 'field-map' ? 0.58 : 0.32;
		}
		if (phase === 'streamers') {
			visibleSegments = this.leaderSegmentCount;
			baseIntensity = 0.42;
		}
		if (phase === 'attachment') {
			visibleSegments =
				this.leaderSegmentCount +
				(progress > 0 ? Math.ceil(this.attachmentSegmentCount * progress) : 0);
			baseIntensity = 0.42;
		}
		if (phase === 'return-stroke') {
			visibleSegments = completeSegmentCount;
			baseIntensity = this.state.displayMode === 'field-map' ? 0.34 : 0.24;
			returnStrokeSegments = progress > 0 ? Math.ceil(this.returnStrokeSegmentCount * progress) : 0;
			returnStrokeIntensity = 0.82 + progress * 0.18;
		}
		if (phase === 'in-cloud-pulse') {
			visibleSegments = completeSegmentCount;
			baseIntensity = 0.82 + progress * 0.18;
		}
		if (phase === 'subsequent-stroke') {
			visibleSegments = completeSegmentCount;
			baseIntensity = this.state.displayMode === 'field-map' ? 0.32 : 0.22;
			returnStrokeSegments = this.returnStrokeSegmentCount;
			returnStrokeIntensity = this.state.flashSafe ? 0.72 : 0.76 + Math.sin(time * 18) * 0.2;
		}
		if (phase === 'afterglow') {
			visibleSegments = completeSegmentCount;
			baseIntensity = 0.1;
			returnStrokeSegments = this.returnStrokeSegmentCount;
			returnStrokeIntensity = 0.45 * (1 - progress) + 0.1;
		}
		if (phase === 'thunder-pending' || phase === 'recharging') {
			visibleSegments = completeSegmentCount;
			baseIntensity = 0.07;
		}
		for (let index = 0; index < this.lightningLines.length; index += 1) {
			const line = this.lightningLines[index];
			line.geometry.setDrawRange(0, visibleSegments * 2);
			const material = line.material as THREE.LineBasicMaterial;
			const layerOpacity = index === 0 ? 1 : index === 1 ? 0.58 : 0.28;
			material.opacity = baseIntensity * layerOpacity;
		}
		for (let index = 0; index < this.returnStrokeLines.length; index += 1) {
			const line = this.returnStrokeLines[index];
			line.geometry.setDrawRange(0, returnStrokeSegments * 2);
			const material = line.material as THREE.LineBasicMaterial;
			const layerOpacity = index === 0 ? 1 : index === 1 ? 0.68 : 0.3;
			material.opacity = returnStrokeIntensity * layerOpacity;
		}
		if (this.streamerLines) {
			const nextStreamerProgress =
				phase === 'streamers' ? progress : phase === 'attachment' ? 1 : 0;
			if (
				this.streamerTargetPositions &&
				Math.abs(nextStreamerProgress - this.streamerProgress) > 0.000_001
			) {
				const attribute = this.streamerLines.geometry.getAttribute(
					'position'
				) as THREE.BufferAttribute;
				updateProgressiveSegmentPositions(
					this.streamerTargetPositions,
					attribute.array as Float32Array,
					nextStreamerProgress
				);
				attribute.needsUpdate = true;
				this.streamerProgress = nextStreamerProgress;
			}
			const material = this.streamerLines.material as THREE.LineBasicMaterial;
			material.opacity =
				phase === 'streamers'
					? progress > 0
						? 0.28 + progress * 0.64
						: 0
					: phase === 'attachment'
						? 0.72
						: 0;
		}
		if (this.cloudMaterial) {
			const dischargeIntensity = Math.max(baseIntensity, returnStrokeIntensity);
			this.cloudMaterial.emissiveIntensity =
				phase === 'return-stroke' || phase === 'in-cloud-pulse' || phase === 'subsequent-stroke'
					? (this.state.flashSafe ? 0.42 : 0.62) * dischargeIntensity
					: this.flash.type === 'intra-cloud' && phase === 'leader'
						? 0.18 * progress
						: 0.04;
		}
		this.flashLight.intensity =
			phase === 'return-stroke' || phase === 'in-cloud-pulse'
				? Math.max(baseIntensity, returnStrokeIntensity) * (this.state.flashSafe ? 4 : 6)
				: 0;
		const lightAnchor = this.flash.attachment?.position ?? this.flash.segments[0]?.start;
		if (lightAnchor) {
			this.flashLight.position.set(lightAnchor.x, lightAnchor.y + 250, lightAnchor.z);
		}
		for (let index = 0; index < this.groundRings.length; index += 1) {
			const ring = this.groundRings[index];
			const active =
				phase === 'return-stroke' || phase === 'subsequent-stroke' || phase === 'afterglow';
			ring.visible = active;
			const ringProgress = phase === 'afterglow' ? 0.72 + progress : progress;
			const radius = 150 + (index + ringProgress * 2.4) * 280;
			ring.scale.setScalar(radius);
			(ring.material as THREE.MeshBasicMaterial).opacity = active
				? Math.max(0, 0.26 - index * 0.055 - ringProgress * 0.12)
				: 0;
		}
	}

	private updateRain(delta: number) {
		if (!this.rain || !this.state || this.state.environment.rainIntensity <= 0) return;
		const attribute = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
		const windRadians = (this.state.environment.windDirection * Math.PI) / 180;
		const fall = (520 + this.state.environment.rainIntensity * 680) * delta;
		const driftX = Math.sin(windRadians) * this.state.environment.windSpeed * delta * 4;
		const driftZ = Math.cos(windRadians) * this.state.environment.windSpeed * delta * 4;
		for (let index = 0; index < attribute.count; index += 1) {
			let x = attribute.getX(index) + driftX;
			let y = attribute.getY(index) - fall;
			let z = attribute.getZ(index) + driftZ;
			if (y < -80) y += this.rainTop;
			if (x > 2_700) x -= 5_400;
			if (x < -2_700) x += 5_400;
			if (z > 2_200) z -= 4_400;
			if (z < -2_200) z += 4_400;
			attribute.setXYZ(index, x, y, z);
		}
		attribute.needsUpdate = true;
	}

	private updateClouds() {
		if (!this.state) return;
		const windRadians = (this.state.environment.windDirection * Math.PI) / 180;
		this.cloudMesh?.rotation.set(0, Math.sin(this.elapsed * 0.025) * 0.025, 0);
		if (this.cloudMesh) {
			this.cloudMesh.position.x = Math.sin(windRadians) * Math.sin(this.elapsed * 0.035) * 90;
			this.cloudMesh.position.z = Math.cos(windRadians) * Math.sin(this.elapsed * 0.035) * 90;
		}
		if (this.waterMesh) {
			(this.waterMesh.material as THREE.MeshStandardMaterial).opacity =
				(this.state.displayMode === 'field-map' ? 0.7 : 0.58) +
				Math.sin(this.elapsed * 0.7) * 0.025;
		}
	}

	private updateCamera(snap = false) {
		if (!this.state || !this.terrain) return;
		this.desiredCameraTarget.set(0, Math.max(180, this.terrain.maxHeight * 0.22), 0);
		if (this.state.cameraPreset === 'observer') {
			const observerX = (clamp(this.state.observer.x, 0, 1) - 0.5) * this.terrain.widthMetres;
			const observerZ = (clamp(this.state.observer.z, 0, 1) - 0.5) * this.terrain.depthMetres;
			this.desiredCameraTarget.set(
				observerX,
				sampleTerrainHeight(this.terrain, observerX, observerZ) + 120,
				observerZ
			);
		} else if (this.state.cameraPreset === 'attachment' && this.flash?.attachment) {
			this.desiredCameraTarget.set(
				this.flash.attachment.position.x,
				this.flash.attachment.position.y + 170,
				this.flash.attachment.position.z
			);
		} else if (
			this.state.cameraPreset === 'follow' &&
			this.flash &&
			this.playback.phase === 'leader'
		) {
			const main = this.flash.mainPath;
			const index =
				main[Math.min(main.length - 1, Math.floor(this.playback.phaseProgress * main.length))];
			const point = this.flash.segments[index]?.end;
			if (point) this.desiredCameraTarget.set(point.x, point.y, point.z);
		}
		if (snap) this.cameraTarget.copy(this.desiredCameraTarget);
		else
			this.cameraTarget.lerp(
				this.desiredCameraTarget,
				this.state.cameraPreset === 'follow' ? 0.08 : 0.045
			);
		const cosPitch = Math.cos(this.pitch);
		this.camera.position.set(
			this.cameraTarget.x + Math.cos(this.yaw) * cosPitch * this.radius,
			this.cameraTarget.y + Math.sin(this.pitch) * this.radius,
			this.cameraTarget.z + Math.sin(this.yaw) * cosPitch * this.radius
		);
		this.camera.position.y = Math.max(this.camera.position.y, this.terrain.minHeight + 80);
		this.camera.lookAt(this.cameraTarget);
	}

	private updatePresentation() {
		if (!this.state) return;
		const fieldMap = this.state.displayMode === 'field-map';
		this.scene.background = fieldMap ? MAP_SKY : NIGHT_SKY;
		const visibilityDensity = 1.45 - this.state.environment.visibility * 0.75;
		this.scene.fog = new THREE.FogExp2(
			fieldMap ? MAP_SKY : NIGHT_SKY,
			(fieldMap ? 0.000055 : 0.000085) * visibilityDensity
		);
		this.renderer.toneMappingExposure =
			(fieldMap ? 1.08 : 0.82) * (0.86 + this.state.environment.timeOfDay * 0.18);
		this.chargeGroup.visible = this.state.visibleLayers.includes('charge');
		this.fieldGroup.visible = this.state.visibleLayers.includes('field');
		this.contourGroup.visible = this.state.visibleLayers.includes('contours');
	}

	private resolveQuality(choice: SerializableAtlasState['quality']) {
		if (choice !== 'auto') {
			this.quality = choice;
			return;
		}
		if (this.isConstrainedAutoQuality() && this.quality === 'high') this.quality = 'medium';
	}

	private isConstrainedAutoQuality() {
		const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
		const canvasWidth = this.canvas.clientWidth;
		return (
			window.innerWidth <= 760 ||
			(canvasWidth > 0 && canvasWidth <= 760) ||
			(typeof deviceMemory === 'number' && deviceMemory <= 4)
		);
	}

	private trackFrameTime(frameMs: number) {
		if (this.state?.quality !== 'auto') return;
		this.frameSamples.push(frameMs);
		if (this.frameSamples.length < 120) return;
		const average =
			this.frameSamples.reduce((sum, value) => sum + value, 0) / this.frameSamples.length;
		this.frameSamples = [];
		let next: QualityTier =
			average > 29
				? 'low'
				: average > 23 && this.quality === 'high'
					? 'medium'
					: average < 16 && this.quality === 'low'
						? 'medium'
						: average < 17 && this.quality === 'medium'
							? 'high'
							: this.quality;
		if (next === 'high' && this.isConstrainedAutoQuality()) next = 'medium';
		if (next !== this.quality) {
			this.quality = next;
			this.resize();
			if (this.state && this.terrain) this.setScene(this.state, this.terrain);
			this.callbacks.onQualityChange?.(next, average);
		}
	}

	private invalidateResourceSignatures() {
		this.terrainSignature = '';
		this.featureSignature = '';
		this.decorationSignature = '';
		this.cloudSignature = '';
		this.rainSignature = '';
		this.analyticalSignature = '';
		this.observerSignature = '';
		this.stormPlacementSignature = '';
		this.presentationSignature = '';
		this.flashSignature = '';
	}

	private onPointerDown = (event: PointerEvent) => {
		if (event.button !== 0) return;
		this.dragging = true;
		this.dragX = event.clientX;
		this.dragY = event.clientY;
		this.canvas.setPointerCapture?.(event.pointerId);
	};

	private onPointerMove = (event: PointerEvent) => {
		if (!this.dragging) return;
		const dx = event.clientX - this.dragX;
		const dy = event.clientY - this.dragY;
		this.dragX = event.clientX;
		this.dragY = event.clientY;
		this.yaw -= dx * 0.006;
		this.pitch = clamp(this.pitch + dy * 0.004, 0.12, 1.22);
		this.callbacks.onManualCamera?.();
	};

	private onPointerUp = () => {
		this.dragging = false;
	};

	private onWheel = (event: WheelEvent) => {
		event.preventDefault();
		this.radius = clamp(this.radius * Math.exp(event.deltaY * 0.001), 650, 11_500);
		this.callbacks.onManualCamera?.();
	};

	private onContextLost = (event: Event) => {
		event.preventDefault();
		this.callbacks.onStatus?.(
			'context-lost',
			'The three-dimensional context was interrupted. The analytical views remain available.'
		);
	};

	private onContextRestored = () => {
		this.invalidateResourceSignatures();
		if (this.state && this.terrain) this.setScene(this.state, this.terrain);
		this.callbacks.onStatus?.('ready', 'Three-dimensional context restored.');
	};
}

export function createLightningRenderer(
	canvas: HTMLCanvasElement,
	callbacks: LightningRendererCallbacks = {}
): LightningRenderer {
	return new ThreeLightningRenderer(canvas, callbacks);
}
