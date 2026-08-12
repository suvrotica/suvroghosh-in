<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import type {
		ShellGenerationResult,
		MeshResolution
	} from '$lib/visualizations/gastropod-shell-lab/shell/engine';
	import type { ShellRecipe } from '$lib/visualizations/gastropod-shell-lab/shell/model';
	import { decomposeAccretionVelocity } from '$lib/visualizations/gastropod-shell-lab/shell/math';
	import type {
		OverlayPreferences,
		ProjectionMode,
		SurfaceMode,
		ViewportQuality
	} from '$lib/visualizations/gastropod-shell-lab/state/preferences-state.svelte';
	import {
		GeometryBroker,
		StaleGeometryError
	} from '$lib/visualizations/gastropod-shell-lab/workers/geometry-broker';

	export type CameraAction = 'reset' | 'frame' | 'aperture' | 'apex' | 'side' | 'top';
	export interface CameraCommand {
		id: number;
		action: CameraAction;
	}
	export interface ViewportExportCommand {
		id: number;
		type: 'png' | 'glb' | 'obj';
		scale?: 1 | 2 | 4;
		transparent?: boolean;
	}
	export interface ViewportPerformance {
		workerDurationMs: number;
		triangleCount: number;
		vertexCount: number;
		resolution: MeshResolution;
		requestId: number;
	}

	interface Props {
		recipe: ShellRecipe;
		age: number;
		quality: ViewportQuality;
		projection: ProjectionMode;
		surfaceMode: SurfaceMode;
		overlays: OverlayPreferences;
		compareRecipe?: ShellRecipe;
		cameraCommand?: CameraCommand;
		exportCommand?: ViewportExportCommand;
		/** Emitted only after a result has replaced the visible primary mesh. */
		onresult?: (result: ShellGenerationResult) => void;
		/** Reports a rejected request while the previous valid mesh remains visible. */
		oninvalid?: (result: ShellGenerationResult) => void;
		onperformance?: (performance: ViewportPerformance) => void;
		onstatus?: (
			status: 'preparing' | 'ready' | 'recovering' | 'fallback' | 'error',
			message?: string
		) => void;
		onexportcomplete?: (message: { id: number; type: string; ok: boolean; error?: string }) => void;
	}

	let {
		recipe,
		age,
		quality,
		projection,
		surfaceMode,
		overlays,
		compareRecipe,
		cameraCommand,
		exportCommand,
		onresult,
		oninvalid,
		onperformance,
		onstatus,
		onexportcomplete
	}: Props = $props();

	let host: HTMLDivElement;
	let rendererCanvas = $state<HTMLCanvasElement>();
	let fallbackCanvas = $state<HTMLCanvasElement>();
	let fallback = $state(false);
	let fallbackReason = $state(
		'WebGL is unavailable. Showing the analytic centreline and aperture.'
	);
	let busy = $state(true);
	let progressLabel = $state('Depositing aperture rings…');
	let contextLost = $state(false);
	let currentResult: ShellGenerationResult | undefined;
	let renderer: THREE.WebGLRenderer | undefined;
	let scene: THREE.Scene | undefined;
	let perspectiveCamera: THREE.PerspectiveCamera | undefined;
	let orthographicCamera: THREE.OrthographicCamera | undefined;
	let activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera | undefined;
	let controls: OrbitControls | undefined;
	let shellMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined;
	let compareMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial> | undefined;
	let overlayGroup: THREE.Group | undefined;
	let grid: THREE.GridHelper | undefined;
	let ground: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial> | undefined;
	let resizeObserver: ResizeObserver | undefined;
	let raf = 0;
	let refineTimer: ReturnType<typeof setTimeout> | undefined;
	let mounted = false;
	let lastCameraCommand = -1;
	let lastExportCommand = -1;
	let lastRecipeToken = '';
	let lastCompareToken = '';
	let originalCameraPosition = new THREE.Vector3(3.6, 2.4, 3.8);
	let originalTarget = new THREE.Vector3(0, 0, 0);
	const clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
	const broker = new GeometryBroker((status) => {
		busy = status === 'working';
	});
	const compareBroker = new GeometryBroker();

	interface LivingApertureDiagnostics {
		mounts: number;
		unmounts: number;
		activeRenderers: number;
		activeCanvases: number;
		activeControls: number;
		activeObservers: number;
		activeListenerSets: number;
		activeWorkers: number;
		activeRafs: number;
		renderCount: number;
		geometryRequests: number;
		acceptedRequestId: number;
		visibleRingCount: number;
		drawIndexCount: number;
		workerDurationMs: number;
		contextLosses: number;
		contextRestores: number;
	}

	function updateDiagnostics(mutator: (diagnostics: LivingApertureDiagnostics) => void): void {
		if (typeof window === 'undefined') return;
		const diagnosticsWindow = window as typeof window & {
			__LIVING_APERTURE_DIAGNOSTICS__?: LivingApertureDiagnostics;
		};
		diagnosticsWindow.__LIVING_APERTURE_DIAGNOSTICS__ ??= {
			mounts: 0,
			unmounts: 0,
			activeRenderers: 0,
			activeCanvases: 0,
			activeControls: 0,
			activeObservers: 0,
			activeListenerSets: 0,
			activeWorkers: 0,
			activeRafs: 0,
			renderCount: 0,
			geometryRequests: 0,
			acceptedRequestId: 0,
			visibleRingCount: 0,
			drawIndexCount: 0,
			workerDurationMs: 0,
			contextLosses: 0,
			contextRestores: 0
		};
		mutator(diagnosticsWindow.__LIVING_APERTURE_DIAGNOSTICS__);
	}

	function supportsWebGL(): boolean {
		try {
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
			context?.getExtension('WEBGL_lose_context')?.loseContext();
			return Boolean(context);
		} catch {
			return false;
		}
	}

	function invalidate(): void {
		if (!mounted || !renderer || !scene || !activeCamera || contextLost || raf) return;
		updateDiagnostics((diagnostics) => (diagnostics.activeRafs += 1));
		raf = requestAnimationFrame(() => {
			raf = 0;
			updateDiagnostics(
				(diagnostics) => (diagnostics.activeRafs = Math.max(0, diagnostics.activeRafs - 1))
			);
			if (!renderer || !scene || !activeCamera || document.hidden || contextLost) return;
			renderer.render(scene, activeCamera);
			updateDiagnostics((diagnostics) => (diagnostics.renderCount += 1));
		});
	}

	function resolutionFor(targetQuality: ViewportQuality, preview: boolean): MeshResolution {
		const mobile = host?.clientWidth < 700;
		let base: MeshResolution;
		if (preview)
			base = mobile
				? { growthRings: 160, apertureSamples: 40 }
				: { growthRings: 240, apertureSamples: 56 };
		else
			switch (targetQuality) {
				case 'low':
					base = { growthRings: 240, apertureSamples: 56 };
					break;
				case 'balanced':
					base = mobile
						? { growthRings: 400, apertureSamples: 72 }
						: { growthRings: 640, apertureSamples: 96 };
					break;
				case 'fine':
					base = mobile
						? { growthRings: 560, apertureSamples: 88 }
						: { growthRings: 900, apertureSamples: 128 };
					break;
				case 'auto':
					base = mobile
						? { growthRings: 320, apertureSamples: 64 }
						: { growthRings: 560, apertureSamples: 88 };
					break;
			}
		if (!preview && recipe.ornament.hierarchy.enabled && recipe.ornament.hierarchy.depth >= 4) {
			if (targetQuality === 'auto') {
				base = mobile
					? { growthRings: 280, apertureSamples: 56 }
					: { growthRings: 340, apertureSamples: 64 };
			} else if (targetQuality === 'balanced') {
				base = mobile
					? { growthRings: 340, apertureSamples: 64 }
					: { growthRings: 420, apertureSamples: 72 };
			}
		}
		const profileMode = Math.max(
			recipe.aperture.profile === 'lobed' ? recipe.aperture.lobes : 0,
			recipe.aperture.profile === 'rounded-polygon' ? recipe.aperture.polygonSides : 0,
			recipe.aperture.profile === 'fourier'
				? Math.max(0, ...recipe.aperture.fourier.map((term) => term.harmonic))
				: 0,
			recipe.ornament.cords.enabled ? recipe.ornament.cords.count : 0,
			recipe.ornament.spines.enabled ? recipe.ornament.spines.countAroundAperture : 0,
			recipe.ornament.buckling.enabled ? recipe.ornament.buckling.mode : 0,
			recipe.ornament.imperfection.enabled ? recipe.ornament.imperfection.bandLimit : 0
		);
		const requestedSamples = Math.min(256, Math.max(base.apertureSamples, 2 * profileMode + 8));
		return { ...base, apertureSamples: requestedSamples };
	}

	function sceneBackground(): THREE.Color | null {
		if (recipe.appearance.background === 'transparent') return null;
		return new THREE.Color(recipe.appearance.background === 'warm-light' ? 0xeee8dc : 0x0b0e0e);
	}

	function configureMicrodetail(material: THREE.MeshStandardMaterial, amount: number): void {
		const microdetail = { value: amount };
		material.userData.microdetail = microdetail;
		material.onBeforeCompile = (shader) => {
			shader.uniforms.uMicrodetail = microdetail;
			shader.vertexShader = shader.vertexShader
				.replace('#include <common>', '#include <common>\nvarying vec3 vMicroPosition;')
				.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMicroPosition = position;');
			shader.fragmentShader = shader.fragmentShader
				.replace(
					'#include <common>',
					'#include <common>\nvarying vec3 vMicroPosition;\nuniform float uMicrodetail;'
				)
				.replace(
					'#include <roughnessmap_fragment>',
					'#include <roughnessmap_fragment>\nfloat shellGrain = 0.5 + 0.5 * sin(vMicroPosition.x * 173.0 + sin(vMicroPosition.y * 127.0) + vMicroPosition.z * 91.0);\nroughnessFactor = clamp(roughnessFactor + uMicrodetail * (shellGrain - 0.5) * 0.28, 0.04, 1.0);'
				);
		};
		material.customProgramCacheKey = () => 'living-aperture-microdetail-v1';
	}

	function recipeToken(value: ShellRecipe | undefined): string {
		if (!value) return '';
		return JSON.stringify(value);
	}

	function disposeObject(object: THREE.Object3D): void {
		object.traverse((child) => {
			if (
				child instanceof THREE.Mesh ||
				child instanceof THREE.Line ||
				child instanceof THREE.LineSegments
			) {
				child.geometry.dispose();
				const materials = Array.isArray(child.material) ? child.material : [child.material];
				for (const material of materials) material.dispose();
			}
		});
	}

	function replaceShell(
		result: ShellGenerationResult,
		requestId: number,
		durationMs: number
	): void {
		if (!scene) return;
		if (!result.diagnostics.valid) {
			busy = false;
			progressLabel = 'Invalid edit — keeping the last valid shell';
			oninvalid?.(result);
			onstatus?.(
				'error',
				`${result.diagnostics.errors[0] ?? 'The requested profile is undefined.'} The last valid viewport geometry remains visible.`
			);
			return;
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(result.mesh.positions, 3));
		geometry.setAttribute('normal', new THREE.BufferAttribute(result.mesh.normals, 3));
		geometry.setAttribute('uv', new THREE.BufferAttribute(result.mesh.uvs, 2));
		const colours = new Float32Array(result.mesh.positions.length);
		const base = new THREE.Color(recipe.appearance.shellColor);
		const accent = new THREE.Color(recipe.appearance.growthColor);
		for (let vertex = 0; vertex < result.mesh.positions.length / 3; vertex += 1) {
			const proxy = Math.min(
				1,
				Math.max(
					0,
					vertex < result.history.instabilityProxy.length
						? result.history.instabilityProxy[vertex]
						: 0
				)
			);
			const colour = base.clone().lerp(accent, proxy * 0.82);
			colours[vertex * 3] = colour.r;
			colours[vertex * 3 + 1] = colour.g;
			colours[vertex * 3 + 2] = colour.b;
		}
		geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
		geometry.setIndex(new THREE.BufferAttribute(result.mesh.indices, 1));
		geometry.computeBoundingSphere();
		const material = new THREE.MeshStandardMaterial({
			color: recipe.appearance.shellColor,
			roughness: recipe.appearance.roughness,
			metalness: recipe.appearance.metalness,
			vertexColors: surfaceMode === 'instability',
			wireframe: surfaceMode === 'wireframe',
			side: THREE.DoubleSide,
			clippingPlanes: overlays.cutaway ? [clippingPlane] : [],
			clipShadows: true
		});
		configureMicrodetail(material, recipe.appearance.microdetail);
		const nextMesh = new THREE.Mesh(geometry, material);
		nextMesh.name = 'Living aperture shell';
		nextMesh.castShadow = true;
		nextMesh.receiveShadow = true;
		if (shellMesh) {
			scene.remove(shellMesh);
			disposeObject(shellMesh);
		}
		shellMesh = nextMesh;
		scene.add(nextMesh);
		currentResult = result;
		updateDiagnostics((diagnostics) => {
			diagnostics.acceptedRequestId = requestId;
			diagnostics.workerDurationMs = durationMs;
		});
		applyAge();
		rebuildOverlays();
		busy = false;
		progressLabel = 'Geometry ready';
		onresult?.(result);
		onperformance?.({
			workerDurationMs: durationMs,
			triangleCount: result.mesh.indices.length / 3,
			vertexCount: result.mesh.positions.length / 3,
			resolution: result.resolution,
			requestId
		});
		onstatus?.('ready');
		invalidate();
	}

	async function buildGeometry(refine = false): Promise<void> {
		if (!mounted || fallback) return;
		const resolution = resolutionFor(quality, !refine);
		busy = true;
		progressLabel = refine ? 'Refining deposited surface…' : 'Depositing preview rings…';
		onstatus?.('preparing', progressLabel);
		try {
			updateDiagnostics((diagnostics) => (diagnostics.geometryRequests += 1));
			const pending = broker.request(recipe, { resolution, age });
			updateDiagnostics((diagnostics) => {
				diagnostics.activeWorkers = Number(broker.hasWorker) + Number(compareBroker.hasWorker);
			});
			const response = await pending;
			replaceShell(response.result, response.requestId, response.durationMs);
		} catch (error) {
			if (error instanceof StaleGeometryError) return;
			busy = false;
			onstatus?.('error', error instanceof Error ? error.message : 'Geometry generation failed.');
		}
	}

	function scheduleGeometry(): void {
		if (!mounted || fallback) return;
		if (refineTimer !== undefined) clearTimeout(refineTimer);
		void buildGeometry(false);
		const preview = resolutionFor(quality, true);
		const refined = resolutionFor(quality, false);
		if (
			preview.growthRings !== refined.growthRings ||
			preview.apertureSamples !== refined.apertureSamples
		) {
			refineTimer = setTimeout(() => void buildGeometry(true), 240);
		}
	}

	function applyAge(): void {
		if (!shellMesh || !currentResult) return;
		const ring = Math.min(
			currentResult.mesh.ringCount - 1,
			Math.max(0, Math.floor(Math.max(0, Math.min(1, age)) * (currentResult.mesh.ringCount - 1)))
		);
		const count = currentResult.mesh.stripIndexEnds[ring] ?? currentResult.mesh.indices.length;
		shellMesh.geometry.setDrawRange(0, count);
		updateDiagnostics((diagnostics) => {
			diagnostics.visibleRingCount = ring + 1;
			diagnostics.drawIndexCount = count;
		});
		rebuildOverlays();
		invalidate();
	}

	function lineMaterial(color: string, opacity = 1): THREE.LineBasicMaterial {
		return new THREE.LineBasicMaterial({
			color,
			transparent: opacity < 1,
			opacity,
			depthTest: opacity >= 0.5
		});
	}

	function makeLine(
		points: Float32Array | number[],
		color: string,
		closed = false,
		opacity = 1
	): THREE.Line {
		const values = points instanceof Float32Array ? Array.from(points) : [...points];
		if (closed && values.length >= 3) values.push(values[0], values[1], values[2]);
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
		return new THREE.Line(geometry, lineMaterial(color, opacity));
	}

	function ringPoints(result: ShellGenerationResult, ring: number): Float32Array {
		const samples = result.history.samplesPerRing;
		const start = ring * samples * 3;
		return result.history.ringPositions.slice(start, start + samples * 3);
	}

	function rebuildOverlays(): void {
		if (!scene || !currentResult) return;
		if (overlayGroup) {
			scene.remove(overlayGroup);
			disposeObject(overlayGroup);
		}
		const group = new THREE.Group();
		group.name = 'Scientific overlays';
		const cyan = recipe.appearance.overlayColor;
		const amber = recipe.appearance.growthColor;
		const visibleRing = Math.min(
			currentResult.history.ringCount - 1,
			Math.max(0, Math.floor(age * (currentResult.history.ringCount - 1)))
		);
		if (overlays.centerline) {
			const centers = currentResult.history.centers.slice(0, (visibleRing + 1) * 3);
			group.add(makeLine(Float32Array.from(centers), cyan, false, 0.85));
		}
		if (overlays.aperture) {
			const aperture = makeLine(ringPoints(currentResult, visibleRing), amber, true, 1);
			aperture.renderOrder = 10;
			group.add(aperture);
		}
		if (overlays.recentRings) {
			const stride = Math.max(1, Math.floor(currentResult.history.ringCount / 40));
			for (let ring = Math.max(0, visibleRing - stride * 5); ring < visibleRing; ring += stride) {
				group.add(
					makeLine(
						ringPoints(currentResult, ring),
						amber,
						true,
						0.28 + (ring / Math.max(1, visibleRing)) * 0.28
					)
				);
			}
		}
		if (overlays.historicalApertures) {
			const stride = Math.max(1, Math.floor(currentResult.history.ringCount / 18));
			for (let ring = 0; ring <= visibleRing; ring += stride) {
				group.add(makeLine(ringPoints(currentResult, ring), cyan, true, 0.14));
			}
		}
		if (overlays.frame) {
			const scale = currentResult.mesh.bounds.diagonal * 0.075;
			const centerOffset = visibleRing * 3;
			const center = new THREE.Vector3(
				currentResult.history.centers[centerOffset],
				currentResult.history.centers[centerOffset + 1],
				currentResult.history.centers[centerOffset + 2]
			);
			const vectors: Array<{ values: Float64Array; color: number }> = [
				{ values: currentResult.history.tangents, color: 0xe0a45a },
				{ values: currentResult.history.frameE1, color: 0x69c8c2 },
				{ values: currentResult.history.frameE2, color: 0xa98bd6 }
			];
			for (const vector of vectors) {
				const direction = new THREE.Vector3(
					vector.values[centerOffset],
					vector.values[centerOffset + 1],
					vector.values[centerOffset + 2]
				).normalize();
				group.add(
					new THREE.ArrowHelper(direction, center, scale, vector.color, scale * 0.24, scale * 0.12)
				);
			}
		}
		if (overlays.accretionVectors && visibleRing > 0) {
			const samples = currentResult.history.samplesPerRing;
			const pointAt = (ring: number, sample: number) => {
				const wrapped = (sample + samples) % samples;
				const offset = (ring * samples + wrapped) * 3;
				return {
					x: currentResult!.history.ringPositions[offset],
					y: currentResult!.history.ringPositions[offset + 1],
					z: currentResult!.history.ringPositions[offset + 2]
				};
			};
			const field = decomposeAccretionVelocity(
				pointAt(visibleRing - 1, 0),
				pointAt(visibleRing, 0),
				pointAt(visibleRing, -1),
				pointAt(visibleRing, 1),
				currentResult.history.ages[visibleRing] - currentResult.history.ages[visibleRing - 1]
			);
			const originValue = pointAt(visibleRing, 0);
			const origin = new THREE.Vector3(originValue.x, originValue.y, originValue.z);
			const components = [
				{ basis: field.apertureTangent, value: field.components.tangential, color: 0xe0a45a },
				{ basis: field.growthDirection, value: field.components.growth, color: 0x69c8c2 },
				{ basis: field.surfaceNormal, value: field.components.normal, color: 0xa98bd6 }
			];
			const maximum = Math.max(1e-10, ...components.map((component) => Math.abs(component.value)));
			const scale = currentResult.mesh.bounds.diagonal * 0.09;
			for (const component of components) {
				if (Math.abs(component.value) < maximum * 1e-5) continue;
				const direction = new THREE.Vector3(
					component.basis.x,
					component.basis.y,
					component.basis.z
				).multiplyScalar(Math.sign(component.value));
				const length = scale * Math.max(0.18, Math.abs(component.value) / maximum);
				group.add(
					new THREE.ArrowHelper(
						direction,
						origin,
						length,
						component.color,
						length * 0.25,
						length * 0.13
					)
				);
			}
		}
		if (overlays.axis) {
			const length = currentResult.mesh.bounds.diagonal * 0.7;
			group.add(makeLine([0, 0, -length / 2, 0, 0, length / 2], cyan, false, 0.42));
		}
		overlayGroup = group;
		scene.add(group);
	}

	function setProjection(mode: ProjectionMode): void {
		if (!perspectiveCamera || !orthographicCamera || !controls) return;
		const previous = activeCamera;
		const next = mode === 'perspective' ? perspectiveCamera : orthographicCamera;
		if (previous && previous !== next) {
			next.position.copy(previous.position);
			next.quaternion.copy(previous.quaternion);
			if (previous instanceof THREE.PerspectiveCamera) {
				orthographicCamera.zoom = Math.max(
					0.1,
					4 / Math.max(0.5, previous.position.distanceTo(controls.target))
				);
				orthographicCamera.updateProjectionMatrix();
			}
		}
		activeCamera = next;
		controls.object = next;
		controls.update();
		invalidate();
	}

	function resize(): void {
		if (!renderer || !host || !perspectiveCamera || !orthographicCamera) return;
		const width = Math.max(1, host.clientWidth);
		const height = Math.max(1, host.clientHeight);
		const aspect = width / height;
		perspectiveCamera.aspect = aspect;
		perspectiveCamera.updateProjectionMatrix();
		const size = 2.25;
		orthographicCamera.left = -size * aspect;
		orthographicCamera.right = size * aspect;
		orthographicCamera.top = size;
		orthographicCamera.bottom = -size;
		orthographicCamera.updateProjectionMatrix();
		renderer.setPixelRatio(Math.min(width < 700 ? 1.5 : 2, window.devicePixelRatio || 1));
		renderer.setSize(width, height, false);
		invalidate();
	}

	function frameShell(): void {
		if (!currentResult || !activeCamera || !controls) return;
		const bounds = currentResult.mesh.bounds;
		const center = new THREE.Vector3(...bounds.center);
		const distance = Math.max(1.4, bounds.diagonal * 1.45);
		const direction = activeCamera.position.clone().sub(controls.target).normalize();
		activeCamera.position.copy(center.clone().add(direction.multiplyScalar(distance)));
		controls.target.copy(center);
		if (activeCamera instanceof THREE.OrthographicCamera) {
			activeCamera.zoom = Math.max(0.25, 3.6 / Math.max(0.2, bounds.diagonal));
			activeCamera.updateProjectionMatrix();
		}
		controls.update();
		invalidate();
	}

	function cameraView(action: CameraAction): void {
		if (!activeCamera || !controls) return;
		const center = currentResult
			? new THREE.Vector3(...currentResult.mesh.bounds.center)
			: new THREE.Vector3();
		const distance = currentResult ? Math.max(2.4, currentResult.mesh.bounds.diagonal * 1.35) : 4;
		if (action === 'frame') return frameShell();
		if (action === 'reset') {
			activeCamera.position.copy(originalCameraPosition);
			controls.target.copy(originalTarget);
		} else if (action === 'top') {
			activeCamera.position.copy(center.clone().add(new THREE.Vector3(0, 0, distance)));
			activeCamera.up.set(0, 1, 0);
			controls.target.copy(center);
		} else if (action === 'side') {
			activeCamera.position.copy(
				center.clone().add(new THREE.Vector3(distance, 0, 0.15 * distance))
			);
			activeCamera.up.set(0, 0, 1);
			controls.target.copy(center);
		} else if (action === 'apex') {
			activeCamera.position.copy(
				center.clone().add(new THREE.Vector3(0.15 * distance, 0, distance))
			);
			activeCamera.up.set(0, 1, 0);
			controls.target.copy(center);
		} else if (action === 'aperture') {
			activeCamera.position.copy(
				center.clone().add(new THREE.Vector3(distance * 0.9, -distance * 0.75, distance * 0.35))
			);
			activeCamera.up.set(0, 0, 1);
			controls.target.copy(center);
		}
		controls.update();
		invalidate();
	}

	function updateMaterial(): void {
		if (!shellMesh) return;
		shellMesh.material.color.set(recipe.appearance.shellColor);
		shellMesh.material.roughness = recipe.appearance.roughness;
		shellMesh.material.metalness = recipe.appearance.metalness;
		shellMesh.material.wireframe = surfaceMode === 'wireframe';
		shellMesh.material.vertexColors = surfaceMode === 'instability';
		const microdetail = shellMesh.material.userData.microdetail as { value: number } | undefined;
		if (microdetail) microdetail.value = recipe.appearance.microdetail;
		shellMesh.material.clippingPlanes = overlays.cutaway ? [clippingPlane] : [];
		shellMesh.material.needsUpdate = true;
		if (scene) scene.background = sceneBackground();
		if (grid) grid.visible = overlays.grid;
		if (ground) ground.visible = overlays.groundShadow;
		rebuildOverlays();
		invalidate();
	}

	async function rebuildCompare(): Promise<void> {
		if (!scene) return;
		if (!compareRecipe) {
			if (compareMesh) {
				scene.remove(compareMesh);
				disposeObject(compareMesh);
				compareMesh = undefined;
			}
			return invalidate();
		}
		try {
			const pending = compareBroker.request(compareRecipe, {
				resolution: { growthRings: 260, apertureSamples: 56 },
				age: 1
			});
			updateDiagnostics((diagnostics) => {
				diagnostics.activeWorkers = Number(broker.hasWorker) + Number(compareBroker.hasWorker);
			});
			const response = await pending;
			if (!response.result.diagnostics.valid) {
				onstatus?.(
					'error',
					'Comparison recipe is invalid; the previous valid comparison remains visible.'
				);
				return;
			}
			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute(
				'position',
				new THREE.BufferAttribute(response.result.mesh.positions, 3)
			);
			geometry.setAttribute('normal', new THREE.BufferAttribute(response.result.mesh.normals, 3));
			geometry.setIndex(new THREE.BufferAttribute(response.result.mesh.indices, 1));
			const material = new THREE.MeshPhysicalMaterial({
				color: compareRecipe.appearance.overlayColor,
				transparent: true,
				opacity: 0.2,
				depthWrite: false,
				roughness: 0.45,
				side: THREE.DoubleSide
			});
			const nextCompareMesh = new THREE.Mesh(geometry, material);
			nextCompareMesh.renderOrder = -1;
			if (compareMesh) {
				scene.remove(compareMesh);
				disposeObject(compareMesh);
			}
			compareMesh = nextCompareMesh;
			scene.add(nextCompareMesh);
			invalidate();
		} catch (error) {
			if (!(error instanceof StaleGeometryError))
				onstatus?.('error', 'Comparison geometry could not be built.');
		}
	}

	function downloadBlob(blob: Blob, filename: string): void {
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function safeFilename(extension: string): string {
		const base =
			recipe.name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '') || 'living-aperture';
		return `${base}.${extension}`;
	}

	async function exportViewport(command: ViewportExportCommand): Promise<void> {
		if (!renderer || !scene || !activeCamera || !shellMesh)
			throw new Error('The specimen is not ready to export.');
		if (command.type === 'png') {
			const width = Math.max(1, host.clientWidth);
			const height = Math.max(1, host.clientHeight);
			const scale = command.scale ?? 1;
			const oldBackground = scene.background;
			if (command.transparent) scene.background = null;
			renderer.setPixelRatio(1);
			renderer.setSize(width * scale, height * scale, false);
			renderer.render(scene, activeCamera);
			const blob = await new Promise<Blob>((resolve, reject) =>
				renderer?.domElement.toBlob(
					(value) => (value ? resolve(value) : reject(new Error('PNG encoding failed.'))),
					'image/png'
				)
			);
			downloadBlob(blob, safeFilename('png'));
			scene.background = oldBackground;
			resize();
			return;
		}
		const previousDrawRange = { ...shellMesh.geometry.drawRange };
		shellMesh.geometry.setDrawRange(0, Infinity);
		try {
			if (command.type === 'glb') {
				const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
				const exporter = new GLTFExporter();
				const data = await exporter.parseAsync(shellMesh, { binary: true, onlyVisible: true });
				if (!(data instanceof ArrayBuffer))
					throw new Error('GLB exporter returned text unexpectedly.');
				downloadBlob(new Blob([data], { type: 'model/gltf-binary' }), safeFilename('glb'));
			} else {
				const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js');
				const data = new OBJExporter().parse(shellMesh);
				downloadBlob(new Blob([data], { type: 'text/plain' }), safeFilename('obj'));
			}
		} finally {
			shellMesh.geometry.setDrawRange(previousDrawRange.start, previousDrawRange.count);
		}
	}

	function drawFallback(): void {
		if (!fallbackCanvas) return;
		fallbackCanvas.tabIndex = 0;
		const width = fallbackCanvas.clientWidth;
		const height = fallbackCanvas.clientHeight;
		const ratio = Math.min(2, window.devicePixelRatio || 1);
		fallbackCanvas.width = width * ratio;
		fallbackCanvas.height = height * ratio;
		const context = fallbackCanvas.getContext('2d');
		if (!context) return;
		context.scale(ratio, ratio);
		context.clearRect(0, 0, width, height);
		context.strokeStyle = recipe.appearance.shellColor;
		context.lineWidth = 2;
		context.beginPath();
		const turns = recipe.coiling.turns;
		const a = Math.log(recipe.coiling.whorlExpansion) / (Math.PI * 2);
		for (let i = 0; i < 360; i += 1) {
			const tau = (i / 359) * age;
			const theta = (tau - 1) * turns * Math.PI * 2;
			const radius = Math.exp(a * theta) * Math.min(width, height) * 0.34;
			const x = width / 2 + radius * Math.cos(theta);
			const y = height / 2 + radius * Math.sin(theta) * 0.7;
			if (i === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		}
		context.stroke();
		context.fillStyle = recipe.appearance.growthColor;
		context.font = '12px system-ui';
		context.fillText(
			'Static centreline fallback · aperture accretion description remains available below',
			16,
			height - 18
		);
	}

	onMount(() => {
		mounted = true;
		updateDiagnostics((diagnostics) => (diagnostics.mounts += 1));
		if (!supportsWebGL()) {
			fallback = true;
			busy = false;
			updateDiagnostics((diagnostics) => (diagnostics.activeCanvases = 1));
			onstatus?.('fallback', fallbackReason);
			requestAnimationFrame(drawFallback);
			return () => {
				mounted = false;
				broker.dispose();
				compareBroker.dispose();
				updateDiagnostics((diagnostics) => {
					diagnostics.unmounts += 1;
					diagnostics.activeWorkers = 0;
					diagnostics.activeCanvases = 0;
				});
			};
		}

		scene = new THREE.Scene();
		scene.background = sceneBackground();
		perspectiveCamera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
		perspectiveCamera.position.copy(originalCameraPosition);
		orthographicCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 100);
		orthographicCamera.position.copy(originalCameraPosition);
		activeCamera = projection === 'orthographic' ? orthographicCamera : perspectiveCamera;
		if (!rendererCanvas) throw new Error('The shell renderer canvas was not mounted.');
		renderer = new THREE.WebGLRenderer({
			canvas: rendererCanvas,
			antialias: true,
			alpha: true,
			preserveDrawingBuffer: true
		});
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.05;
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFShadowMap;
		renderer.localClippingEnabled = true;
		renderer.domElement.tabIndex = 0;
		renderer.domElement.style.touchAction = 'none';
		updateDiagnostics((diagnostics) => {
			diagnostics.activeRenderers += 1;
			diagnostics.activeCanvases = 1;
		});
		controls = new OrbitControls(activeCamera, renderer.domElement);
		updateDiagnostics((diagnostics) => (diagnostics.activeControls += 1));
		controls.enableDamping = false;
		controls.target.copy(originalTarget);
		controls.minDistance = 0.35;
		controls.maxDistance = 30;
		controls.addEventListener('change', invalidate);
		controls.update();

		const hemisphere = new THREE.HemisphereLight(0xcde5e2, 0x251b13, 1.55);
		scene.add(hemisphere);
		const key = new THREE.DirectionalLight(0xffe3bb, 3.3);
		key.position.set(4, -3, 6);
		key.castShadow = true;
		key.shadow.mapSize.set(1024, 1024);
		scene.add(key);
		const fill = new THREE.DirectionalLight(0x7ec8cf, 1.2);
		fill.position.set(-4, 2, 1);
		scene.add(fill);
		const rim = new THREE.PointLight(0xe4a15a, 1.8, 20);
		rim.position.set(-2, -4, 3);
		scene.add(rim);

		grid = new THREE.GridHelper(6, 24, 0x3e7773, 0x29332f);
		grid.rotation.x = Math.PI / 2;
		grid.position.z = -1.45;
		grid.visible = overlays.grid;
		scene.add(grid);
		ground = new THREE.Mesh(
			new THREE.PlaneGeometry(8, 8),
			new THREE.ShadowMaterial({ opacity: 0.25, color: 0x000000 })
		);
		ground.position.z = -1.5;
		ground.receiveShadow = true;
		ground.visible = overlays.groundShadow;
		scene.add(ground);

		renderer.domElement.addEventListener('webglcontextlost', (event) => {
			event.preventDefault();
			contextLost = true;
			updateDiagnostics((diagnostics) => (diagnostics.contextLosses += 1));
			onstatus?.(
				'recovering',
				'The 3D context was lost. Recipe state is safe; rebuilding the view…'
			);
		});
		renderer.domElement.addEventListener('webglcontextrestored', () => {
			contextLost = false;
			updateDiagnostics((diagnostics) => (diagnostics.contextRestores += 1));
			onstatus?.('ready', 'The 3D view was restored without changing the recipe.');
			scheduleGeometry();
		});
		document.addEventListener('visibilitychange', invalidate);
		updateDiagnostics((diagnostics) => (diagnostics.activeListenerSets += 1));
		resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(host);
		updateDiagnostics((diagnostics) => (diagnostics.activeObservers += 1));
		resize();
		lastRecipeToken = `${recipeToken(recipe)}|${quality}`;
		scheduleGeometry();

		return () => {
			mounted = false;
			if (refineTimer !== undefined) clearTimeout(refineTimer);
			if (raf) {
				cancelAnimationFrame(raf);
				raf = 0;
				updateDiagnostics(
					(diagnostics) => (diagnostics.activeRafs = Math.max(0, diagnostics.activeRafs - 1))
				);
			}
			resizeObserver?.disconnect();
			document.removeEventListener('visibilitychange', invalidate);
			broker.dispose();
			compareBroker.dispose();
			controls?.removeEventListener('change', invalidate);
			controls?.dispose();
			if (scene) disposeObject(scene);
			renderer?.dispose();
			renderer?.forceContextLoss();
			scene?.clear();
			updateDiagnostics((diagnostics) => {
				diagnostics.unmounts += 1;
				diagnostics.activeRenderers = Math.max(0, diagnostics.activeRenderers - 1);
				diagnostics.activeCanvases = 0;
				diagnostics.activeControls = Math.max(0, diagnostics.activeControls - 1);
				diagnostics.activeObservers = Math.max(0, diagnostics.activeObservers - 1);
				diagnostics.activeListenerSets = Math.max(0, diagnostics.activeListenerSets - 1);
				diagnostics.activeWorkers = 0;
			});
		};
	});

	$effect(() => {
		const token = `${recipeToken(recipe)}|${quality}`;
		if (!mounted || fallback || token === lastRecipeToken) return;
		lastRecipeToken = token;
		scheduleGeometry();
	});

	$effect(() => {
		void age;
		if (fallback) requestAnimationFrame(drawFallback);
		else applyAge();
	});

	$effect(() => {
		void projection;
		if (mounted && !fallback) setProjection(projection);
	});

	$effect(() => {
		void surfaceMode;
		void overlays;
		void recipe.appearance;
		if (mounted && !fallback) updateMaterial();
	});

	$effect(() => {
		const token = recipeToken(compareRecipe);
		if (!mounted || fallback || token === lastCompareToken) return;
		lastCompareToken = token;
		void rebuildCompare();
	});

	$effect(() => {
		if (!cameraCommand || cameraCommand.id === lastCameraCommand || !mounted || fallback) return;
		lastCameraCommand = cameraCommand.id;
		cameraView(cameraCommand.action);
	});

	$effect(() => {
		if (!exportCommand || exportCommand.id === lastExportCommand || !mounted || fallback) return;
		lastExportCommand = exportCommand.id;
		void exportViewport(exportCommand)
			.then(() => onexportcomplete?.({ id: exportCommand.id, type: exportCommand.type, ok: true }))
			.catch((error) =>
				onexportcomplete?.({
					id: exportCommand.id,
					type: exportCommand.type,
					ok: false,
					error: error instanceof Error ? error.message : 'Export failed.'
				})
			);
	});
</script>

<div class="viewport-host" bind:this={host} class:is-fallback={fallback} class:is-busy={busy}>
	{#if !fallback}
		<canvas
			bind:this={rendererCanvas}
			class="renderer-canvas"
			aria-label="Interactive three-dimensional shell specimen. Drag to orbit, pinch or wheel to zoom. With the viewport focused, use Space to play or pause growth, arrow keys to step, number keys one through four for canonical views, R to reset, and F to frame the shell."
		>
			Interactive three-dimensional shell specimen. A synchronized text description follows the
			viewport.
		</canvas>
	{/if}
	{#if fallback}
		<canvas bind:this={fallbackCanvas} class="fallback-canvas" aria-label={fallbackReason}>
			{fallbackReason}
		</canvas>
		<div class="fallback-notice">
			<strong>Static geometry fallback</strong><span>{fallbackReason}</span>
		</div>
	{/if}
	{#if busy && !fallback}
		<div class="working" role="status" aria-live="polite">
			<span class="spinner" aria-hidden="true"></span>
			<span>{progressLabel}</span>
		</div>
	{/if}
	{#if contextLost}
		<div class="context-lost" role="alert">
			Rebuilding the 3D view. Your shell recipe is unchanged.
		</div>
	{/if}
</div>

<style>
	.viewport-host {
		position: absolute;
		inset: 0;
		min-width: 0;
		min-height: 240px;
		background:
			radial-gradient(circle at 50% 48%, rgba(117, 129, 118, 0.09), transparent 37%),
			linear-gradient(rgba(255, 255, 255, 0.012) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.012) 1px, transparent 1px), var(--bg);
		background-size:
			auto,
			40px 40px,
			40px 40px,
			auto;
		overflow: hidden;
	}

	.renderer-canvas {
		display: block;
		width: 100%;
		height: 100%;
		outline: 0;
	}

	.renderer-canvas:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: -3px;
	}

	.working {
		position: absolute;
		top: 0.75rem;
		left: 50%;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-height: 30px;
		padding: 0.35rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		transform: translateX(-50%);
		background: color-mix(in srgb, var(--panel) 92%, transparent);
		box-shadow: var(--shadow);
		font-size: 0.62rem;
		color: var(--muted);
		pointer-events: none;
	}

	.spinner {
		width: 10px;
		height: 10px;
		border: 1px solid var(--line-bright);
		border-top-color: var(--amber);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.context-lost,
	.fallback-notice {
		position: absolute;
		left: 1rem;
		right: 1rem;
		bottom: 1rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--amber-soft);
		border-radius: 8px;
		background: color-mix(in srgb, var(--panel) 94%, transparent);
		font-size: 0.68rem;
		color: var(--amber);
	}

	.fallback-canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	.fallback-notice {
		display: grid;
		gap: 0.2rem;
		border-color: var(--cyan-soft);
		color: var(--muted);
	}

	.fallback-notice strong {
		color: var(--cyan);
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
			border-color: var(--amber);
		}
	}
</style>
