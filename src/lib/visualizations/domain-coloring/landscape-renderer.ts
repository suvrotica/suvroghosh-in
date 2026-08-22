import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { evaluateExpressionDiagnostic } from './complex';
import { expressionToGlsl } from './expression';
import { DOMAIN_GLSL_LIBRARY } from './glsl';
import { sampleHeight } from './height';
import { createLandscapeMesh } from './mesh';
import { createLogSheetMesh, createRootSheetMesh, type SheetMesh } from './sheets';
import { viewportBounds } from './viewport';
import type {
	CameraOrientation,
	CameraProjection,
	CameraState,
	Complex,
	DomainColoringPreset,
	ExpressionNode,
	ExplorerState
} from './types';

export type LandscapeRendererStatus = 'ready' | 'context-lost' | 'error';

export type LandscapeRendererCallbacks = {
	onStatus?: (status: LandscapeRendererStatus, message: string) => void;
	onCameraChange?: (camera: CameraState) => void;
	onMeshStats?: (message: string) => void;
};

export type LandscapeRenderState = {
	node: ExpressionNode;
	preset?: DomainColoringPreset;
	explorer: ExplorerState;
	pinnedPoint?: Complex | null;
};

const surfaceVertex = `
attribute vec2 a_domain;
varying vec2 v_domain;
varying vec3 v_normal;
varying float v_height;

void main() {
	v_domain = a_domain;
	v_normal = normalize(normalMatrix * normal);
	v_height = position.y;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function surfaceFragment(expression: string) {
	return `
precision highp float;
varying vec2 v_domain;
varying vec3 v_normal;
varying float v_height;
uniform bool u_contours;
uniform bool u_lighting;
uniform bool u_caps;
uniform float u_cap_height;

${DOMAIN_GLSL_LIBRARY}

void main() {
	vec2 z = v_domain;
	vec2 value = ${expression};
	if (invalid_complex(value)) {
		gl_FragColor = vec4(0.18, 0.18, 0.20, 1.0);
		return;
	}
	vec3 colour = domain_colour(value, u_contours);
	if (u_lighting) {
		vec3 normal = gl_FrontFacing ? normalize(v_normal) : -normalize(v_normal);
		float diffuse = max(0.0, dot(normal, normalize(vec3(0.36, 0.82, 0.44))));
		colour *= 0.78 + 0.22 * diffuse;
	}
	if (u_caps && u_cap_height > 0.0) {
		float capBand = smoothstep(0.94, 0.985, abs(v_height) / u_cap_height);
		colour = mix(colour, mix(colour, vec3(0.96), 0.32), capBand);
	}
	gl_FragColor = vec4(colour, 1.0);
}
`;
}

function disposeObject(object: THREE.Object3D) {
	object.traverse((child) => {
		if (
			!(
				child instanceof THREE.Mesh ||
				child instanceof THREE.Line ||
				child instanceof THREE.LineSegments
			)
		)
			return;
		child.geometry?.dispose();
		const material = child.material;
		if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
		else material?.dispose();
	});
}

function capHeight(state: ExplorerState) {
	if (state.height.lens === 'log-magnitude')
		return state.height.verticalScale * state.height.logCap;
	if (state.height.lens === 'real' || state.height.lens === 'imaginary') {
		return state.height.verticalScale * state.height.componentCap;
	}
	if (state.height.lens === 'phase') return state.height.verticalScale;
	return 0;
}

const CAMERA_PRESET_ANGLES: Record<CameraOrientation, readonly [number, number]> = {
	isometric: [-Math.PI / 4, Math.atan(1 / Math.sqrt(2))],
	top: [0, Math.PI / 2],
	'front-real': [0, 0],
	'front-imaginary': [Math.PI / 2, 0]
};

export function cameraPresetState(state: CameraState, orientation: CameraOrientation): CameraState {
	const [azimuth, elevation] = CAMERA_PRESET_ANGLES[orientation];
	return { ...state, orientation, azimuth, elevation };
}

export class DomainLandscapeRenderer {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly controls: OrbitControls;
	private readonly orthographic = new THREE.OrthographicCamera(-5, 5, 3, -3, 0.01, 500);
	private readonly perspective = new THREE.PerspectiveCamera(38, 1, 0.01, 500);
	private camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
	private surfaceGroup = new THREE.Group();
	private overlayGroup = new THREE.Group();
	private current: LandscapeRenderState | null = null;
	private pixelRatio = 1;
	private disposed = false;
	private manualCameraChange = false;
	private suppressCameraCallback = false;
	private rebuildKey = '';
	private cameraKey = '';
	private readonly lost = (event: Event) => {
		event.preventDefault();
		this.callbacks.onStatus?.(
			'context-lost',
			'The 3D context was interrupted; the 2D field remains available.'
		);
	};
	private readonly restored = () => {
		if (!this.current) return;
		this.rebuild(this.current);
		this.render();
		this.callbacks.onStatus?.('ready', 'The 3D context was restored.');
	};

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly callbacks: LandscapeRendererCallbacks = {}
	) {
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			alpha: false,
			powerPreference: 'high-performance',
			preserveDrawingBuffer: true
		});
		this.renderer.setClearColor(0x05070d, 1);
		this.renderer.shadowMap.enabled = false;
		this.scene.add(this.surfaceGroup, this.overlayGroup);
		this.scene.add(new THREE.HemisphereLight(0xffffff, 0x172033, 1.35));
		this.camera = this.orthographic;
		this.controls = new OrbitControls(this.camera, canvas);
		this.controls.enableDamping = false;
		this.controls.autoRotate = false;
		this.controls.screenSpacePanning = true;
		this.controls.minDistance = 0.4;
		this.controls.maxDistance = 120;
		this.controls.addEventListener('start', () => {
			this.manualCameraChange = true;
			this.markCameraFree();
		});
		this.controls.addEventListener('change', () => {
			this.render();
			if (this.manualCameraChange && !this.suppressCameraCallback) {
				this.callbacks.onCameraChange?.(this.readCameraState());
			}
		});
		this.controls.addEventListener('end', () => {
			if (!this.suppressCameraCallback) this.callbacks.onCameraChange?.(this.readCameraState());
			this.manualCameraChange = false;
		});
		canvas.addEventListener('webglcontextlost', this.lost);
		canvas.addEventListener('webglcontextrestored', this.restored);
		this.callbacks.onStatus?.('ready', 'Three-dimensional landscape ready.');
	}

	setPixelRatio(value: number) {
		this.pixelRatio = Math.max(0.75, Math.min(2, value));
		this.renderer.setPixelRatio(this.pixelRatio);
	}

	setControlsEnabled(enabled: boolean) {
		this.controls.enabled = enabled;
	}

	resize(width = this.canvas.clientWidth, height = this.canvas.clientHeight) {
		if (this.disposed || width < 1 || height < 1) return;
		this.renderer.setSize(width, height, false);
		this.perspective.aspect = width / height;
		this.perspective.updateProjectionMatrix();
		this.updateOrthographicFrustum(width / height);
		this.render();
	}

	setState(state: LandscapeRenderState) {
		this.current = state;
		const nextRebuildKey = JSON.stringify({
			node: state.node,
			presetId: state.preset?.id ?? null,
			explorer: { ...state.explorer, camera: undefined },
			pinnedPoint: state.pinnedPoint ?? null
		});
		if (nextRebuildKey !== this.rebuildKey) {
			this.rebuildKey = nextRebuildKey;
			this.rebuild(state);
			this.updateOrthographicFrustum(
				Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight)
			);
		}
		const nextCameraKey = JSON.stringify(state.explorer.camera);
		if (nextCameraKey !== this.cameraKey) {
			this.cameraKey = nextCameraKey;
			this.suppressCameraCallback = true;
			this.setCameraState(state.explorer.camera);
			this.suppressCameraCallback = false;
		}
		this.render();
	}

	private rebuild(state: LandscapeRenderState) {
		disposeObject(this.surfaceGroup);
		disposeObject(this.overlayGroup);
		this.scene.remove(this.surfaceGroup, this.overlayGroup);
		this.surfaceGroup = new THREE.Group();
		this.overlayGroup = new THREE.Group();
		this.scene.add(this.surfaceGroup, this.overlayGroup);

		if (state.explorer.viewMode === 'sheets' && state.preset?.sheets) this.buildSheets(state);
		else this.buildLandscape(state);
		this.buildOverlays(state);
	}

	private buildLandscape(state: LandscapeRenderState) {
		const meshData = createLandscapeMesh(
			state.node,
			state.explorer.viewport,
			state.explorer.height,
			state.explorer.quality,
			state.preset
		);
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
		geometry.setAttribute('a_domain', new THREE.BufferAttribute(meshData.domain, 2));
		geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
		geometry.computeVertexNormals();
		const uniforms = {
			u_contours: { value: state.explorer.overlays.contours },
			u_lighting: { value: state.explorer.overlays.lighting },
			u_caps: { value: state.explorer.overlays.caps },
			u_cap_height: { value: capHeight(state.explorer) }
		};
		const material = new THREE.ShaderMaterial({
			vertexShader: surfaceVertex,
			fragmentShader: surfaceFragment(expressionToGlsl(state.node)),
			uniforms,
			side: THREE.DoubleSide,
			depthTest: true,
			depthWrite: true
		});
		const mesh = new THREE.Mesh(geometry, material);
		mesh.name = 'domain-landscape';
		this.surfaceGroup.add(mesh);
		if (state.explorer.overlays.mesh) {
			const wireframe = new THREE.LineSegments(
				new THREE.WireframeGeometry(geometry),
				new THREE.LineBasicMaterial({ color: 0xdde7f2, transparent: true, opacity: 0.16 })
			);
			wireframe.name = 'surface-mesh';
			this.surfaceGroup.add(wireframe);
		}
		this.callbacks.onMeshStats?.(
			`${meshData.stats.drawnCells} cells drawn; ${meshData.stats.invalidCells} invalid, ${meshData.stats.cutCells} cut, ${meshData.stats.unresolvedCells} unresolved; ${meshData.stats.evaluations} samples.`
		);
	}

	private buildSheets(state: LandscapeRenderState) {
		const support = state.preset?.sheets;
		if (!support) return;
		let data: SheetMesh;
		if (support.kind === 'log') {
			data = createLogSheetMesh({
				sheetRange: state.explorer.sheetRange,
				radialMin: state.explorer.sheetRadialMin,
				radialMax: state.explorer.sheetRadialMax,
				allSheets: state.explorer.allSheets,
				radialSegments:
					state.explorer.quality === 'low' ? 16 : state.explorer.quality === 'high' ? 40 : 26,
				angularSegmentsPerSheet:
					state.explorer.quality === 'low' ? 32 : state.explorer.quality === 'high' ? 88 : 56
			});
		} else {
			data = createRootSheetMesh({
				degree: support.kind === 'sqrt' ? 2 : 3,
				radialMax: state.explorer.sheetRadialMax,
				allSheets: state.explorer.allSheets,
				radialSegments:
					state.explorer.quality === 'low' ? 16 : state.explorer.quality === 'high' ? 42 : 28,
				angularSegmentsPerSheet:
					state.explorer.quality === 'low' ? 36 : state.explorer.quality === 'high' ? 96 : 60
			});
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
		geometry.setAttribute('a_domain', new THREE.BufferAttribute(data.domain, 2));
		geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
		const colours = new Float32Array(data.sheetIndices.length * 3);
		const colour = new THREE.Color();
		for (let index = 0; index < data.sheetIndices.length; index += 1) {
			const scalar =
				support.kind === 'log'
					? Math.tanh(data.values[index * 2] / 2)
					: Math.tanh(data.values[index * 2 + 1]);
			colour.setHSL(0.55 - scalar * 0.18, 0.72, 0.54);
			colours[index * 3] = colour.r;
			colours[index * 3 + 1] = colour.g;
			colours[index * 3 + 2] = colour.b;
		}
		geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
		geometry.computeVertexNormals();
		const material = state.explorer.overlays.lighting
			? new THREE.MeshLambertMaterial({
					vertexColors: true,
					side: THREE.DoubleSide,
					transparent: true,
					opacity: 0.93
				})
			: new THREE.MeshBasicMaterial({
					vertexColors: true,
					side: THREE.DoubleSide,
					transparent: true,
					opacity: 0.93
				});
		const mesh = new THREE.Mesh(geometry, material);
		mesh.name = 'domain-sheet';
		this.surfaceGroup.add(mesh);
		if (state.explorer.overlays.mesh) {
			const wireframe = new THREE.LineSegments(
				new THREE.WireframeGeometry(geometry),
				new THREE.LineBasicMaterial({ color: 0xdde7f2, transparent: true, opacity: 0.13 })
			);
			wireframe.name = 'sheet-mesh';
			this.surfaceGroup.add(wireframe);
		}
		const addBoundary = (indices: Uint32Array, colour: number, name: string) => {
			if (indices.length === 0) return;
			const boundaryGeometry = new THREE.BufferGeometry();
			boundaryGeometry.setAttribute('position', geometry.getAttribute('position').clone());
			boundaryGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
			const boundary = new THREE.LineSegments(
				boundaryGeometry,
				new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.94 })
			);
			boundary.name = name;
			boundary.renderOrder = 3;
			this.surfaceGroup.add(boundary);
		};
		addBoundary(data.finiteBoundaryIndices, 0xfef08a, 'finite-sheet-boundaries');
		addBoundary(data.cutBoundaryIndices, 0xe879f9, 'principal-cut-boundaries');
		this.callbacks.onMeshStats?.(data.boundaryDescription);
	}

	private buildOverlays(state: LandscapeRenderState) {
		const viewport = state.explorer.viewport;
		const maximumSpan =
			state.explorer.viewMode === 'sheets'
				? state.explorer.sheetRadialMax * 2
				: Math.max(viewport.spanRe, viewport.spanIm);
		if (state.explorer.viewMode !== 'sheets') {
			const plane = new THREE.Mesh(
				new THREE.PlaneGeometry(viewport.spanRe, viewport.spanIm),
				new THREE.MeshBasicMaterial({
					color: 0xcbd5e1,
					transparent: true,
					opacity: 0.07,
					side: THREE.DoubleSide,
					depthWrite: false
				})
			);
			plane.rotateX(-Math.PI / 2);
			plane.position.set(viewport.centerRe, 0, viewport.centerIm);
			plane.name = 'sea-level-plane';
			this.overlayGroup.add(plane);
		}

		if (state.explorer.overlays.grid) {
			const grid = new THREE.GridHelper(maximumSpan, 12, 0xcbd5e1, 0x64748b);
			grid.position.set(
				state.explorer.viewMode === 'sheets' ? 0 : viewport.centerRe,
				0.002,
				state.explorer.viewMode === 'sheets' ? 0 : viewport.centerIm
			);
			const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
			for (const material of materials) {
				material.transparent = true;
				material.opacity = 0.24;
			}
			this.overlayGroup.add(grid);
		}

		if (state.explorer.overlays.markers && state.preset) {
			const bounds = viewportBounds(viewport);
			const generated =
				state.preset.featureFamilies?.flatMap((family) => family.generate(bounds, 24)) ?? [];
			for (const feature of [...state.preset.features, ...generated].slice(0, 32)) {
				const evaluation = evaluateExpressionDiagnostic(state.node, feature.z);
				const semantic =
					feature.kind === 'zero'
						? { ...evaluation, status: 'zero' as const }
						: feature.kind === 'pole'
							? { ...evaluation, status: 'pole' as const }
							: evaluation;
				const height =
					state.explorer.viewMode === 'sheets'
						? 0
						: (sampleHeight(semantic, state.explorer.height).displayed ?? 0);
				const marker = new THREE.Mesh(
					new THREE.SphereGeometry(maximumSpan * 0.018, 12, 8),
					new THREE.MeshBasicMaterial({
						color:
							feature.kind === 'zero'
								? 0x0b1020
								: feature.kind === 'pole'
									? 0xfff1c9
									: feature.kind === 'branch-point'
										? 0xe879f9
										: 0x67e8f9
					})
				);
				marker.position.set(feature.z.re, height, feature.z.im);
				marker.userData.feature = feature;
				this.overlayGroup.add(marker);
			}
		}

		if (state.pinnedPoint) {
			const evaluation = evaluateExpressionDiagnostic(state.node, state.pinnedPoint);
			const height =
				state.explorer.viewMode === 'sheets'
					? 0
					: (sampleHeight(evaluation, state.explorer.height).displayed ?? 0);
			const pin = new THREE.Mesh(
				new THREE.SphereGeometry(maximumSpan * 0.025, 16, 12),
				new THREE.MeshBasicMaterial({ color: 0xfef08a })
			);
			pin.position.set(state.pinnedPoint.re, height + maximumSpan * 0.02, state.pinnedPoint.im);
			pin.name = 'pinned-probe';
			this.overlayGroup.add(pin);
		}

		if (state.explorer.loop && state.explorer.viewMode !== 'sheets') {
			const points: THREE.Vector3[] = [];
			for (let index = 0; index <= 128; index += 1) {
				const angle = (index / 128) * Math.PI * 2;
				const z = {
					re: state.explorer.loop.center.re + state.explorer.loop.radius * Math.cos(angle),
					im: state.explorer.loop.center.im + state.explorer.loop.radius * Math.sin(angle)
				};
				const evaluation = evaluateExpressionDiagnostic(state.node, z);
				const height = sampleHeight(evaluation, state.explorer.height).displayed;
				if (height !== null && Number.isFinite(height))
					points.push(new THREE.Vector3(z.re, height + 0.035 * maximumSpan, z.im));
			}
			if (points.length > 2) {
				const loopGeometry = new THREE.BufferGeometry().setFromPoints(points);
				const loopLine = new THREE.Line(
					loopGeometry,
					new THREE.LineBasicMaterial({ color: 0xfef08a })
				);
				loopLine.name = 'winding-loop';
				this.overlayGroup.add(loopLine);
			}
		}
	}

	setCameraPreset(orientation: CameraOrientation) {
		if (!this.current) return;
		const next = cameraPresetState(this.readCameraState(), orientation);
		this.current = {
			...this.current,
			explorer: { ...this.current.explorer, camera: next }
		};
		this.cameraKey = JSON.stringify(next);
		this.suppressCameraCallback = true;
		this.setCameraState(next);
		this.suppressCameraCallback = false;
		this.render();
		this.callbacks.onCameraChange?.(next);
	}

	resetCamera(state: CameraState) {
		if (!this.current) return;
		this.current = {
			...this.current,
			explorer: { ...this.current.explorer, camera: state }
		};
		this.cameraKey = JSON.stringify(state);
		this.suppressCameraCallback = true;
		this.setCameraState(state);
		this.suppressCameraCallback = false;
		this.render();
		const shared = this.readCameraState();
		this.current = {
			...this.current,
			explorer: { ...this.current.explorer, camera: shared }
		};
		this.cameraKey = JSON.stringify(shared);
		this.callbacks.onCameraChange?.(shared);
	}

	setProjection(projection: CameraProjection) {
		if (!this.current) return;
		const next = { ...this.readCameraState(), projection };
		this.current = {
			...this.current,
			explorer: { ...this.current.explorer, camera: next }
		};
		this.cameraKey = JSON.stringify(next);
		this.suppressCameraCallback = true;
		this.setCameraState(next);
		this.suppressCameraCallback = false;
		this.render();
		this.callbacks.onCameraChange?.(this.readCameraState());
	}

	setCameraState(state: CameraState) {
		const nextCamera = state.projection === 'perspective' ? this.perspective : this.orthographic;
		if (this.camera !== nextCamera) {
			const target = this.controls.target.clone();
			this.controls.object = nextCamera;
			this.controls.target.copy(target);
			this.camera = nextCamera;
		}
		const target = new THREE.Vector3(state.targetX, state.targetY, state.targetZ);
		this.controls.target.copy(target);
		this.camera.zoom = Math.max(0.1, Math.min(12, state.zoom));
		if (state.orientation === 'top') {
			this.camera.position.set(target.x, target.y + state.distance, target.z);
			this.camera.up.set(0, 0, -1);
		} else if (state.orientation === 'front-real') {
			this.camera.position.set(target.x, target.y, target.z + state.distance);
			this.camera.up.set(0, 1, 0);
		} else if (state.orientation === 'front-imaginary') {
			this.camera.position.set(target.x + state.distance, target.y, target.z);
			this.camera.up.set(0, 1, 0);
		} else {
			const horizontal = Math.cos(state.elevation) * state.distance;
			this.camera.position.set(
				target.x + Math.sin(state.azimuth) * horizontal,
				target.y + Math.sin(state.elevation) * state.distance,
				target.z + Math.cos(state.azimuth) * horizontal
			);
			this.camera.up.set(0, 1, 0);
		}
		this.camera.lookAt(target);
		this.camera.updateProjectionMatrix();
		this.controls.update();
	}

	private updateOrthographicFrustum(aspect: number) {
		const explorer = this.current?.explorer;
		const viewport = explorer?.viewport;
		let vertical = viewport ? Math.max(viewport.spanRe, viewport.spanIm) * 0.9 : 8;
		if (explorer?.viewMode === 'sheets' && this.surfaceGroup.children.length) {
			const size = new THREE.Box3().setFromObject(this.surfaceGroup).getSize(new THREE.Vector3());
			vertical = Math.max(size.x, size.y, size.z) * 1.35;
		} else if (explorer) {
			const cap = capHeight(explorer);
			vertical = Math.max(vertical, cap * 2.35);
		}
		this.orthographic.left = (-vertical * aspect) / 2;
		this.orthographic.right = (vertical * aspect) / 2;
		this.orthographic.top = vertical / 2;
		this.orthographic.bottom = -vertical / 2;
		this.orthographic.updateProjectionMatrix();
	}

	private readCameraState(): CameraState {
		const target = this.controls.target;
		const delta = this.camera.position.clone().sub(target);
		const distance = Math.max(0.001, delta.length());
		return {
			orientation: this.current?.explorer.camera.orientation ?? 'isometric',
			projection: this.camera === this.perspective ? 'perspective' : 'orthographic',
			azimuth: Math.atan2(delta.x, delta.z),
			elevation: Math.asin(delta.y / distance),
			distance,
			zoom: this.camera.zoom,
			targetX: target.x,
			targetY: target.y,
			targetZ: target.z
		};
	}

	private markCameraFree() {
		if (!this.current || this.current.explorer.camera.orientation === 'isometric') return;
		this.current = {
			...this.current,
			explorer: {
				...this.current.explorer,
				camera: { ...this.current.explorer.camera, orientation: 'isometric' }
			}
		};
	}

	nudgeCamera(
		action:
			| 'left'
			| 'right'
			| 'up'
			| 'down'
			| 'in'
			| 'out'
			| 'pan-left'
			| 'pan-right'
			| 'pan-up'
			| 'pan-down'
	) {
		this.markCameraFree();
		const target = this.controls.target;
		if (action === 'left' || action === 'right') {
			const angle = action === 'left' ? -0.12 : 0.12;
			this.camera.position
				.sub(target)
				.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
				.add(target);
		} else if (action === 'up' || action === 'down') {
			this.camera.position.y += (action === 'up' ? 1 : -1) * this.readCameraState().distance * 0.08;
		} else if (action === 'in' || action === 'out') {
			if (this.camera instanceof THREE.OrthographicCamera) {
				this.camera.zoom = Math.max(
					0.1,
					Math.min(12, this.camera.zoom * (action === 'in' ? 1.16 : 0.86))
				);
				this.camera.updateProjectionMatrix();
			} else {
				const scale = action === 'in' ? 0.86 : 1.16;
				this.camera.position.sub(target).multiplyScalar(scale).add(target);
			}
		} else if (action === 'pan-left' || action === 'pan-right') {
			const offset = this.readCameraState().distance * (action === 'pan-left' ? -0.05 : 0.05);
			target.x += offset;
			this.camera.position.x += offset;
		} else {
			const offset = this.readCameraState().distance * (action === 'pan-up' ? 0.05 : -0.05);
			target.y += offset;
			this.camera.position.y += offset;
		}
		this.camera.lookAt(target);
		this.controls.update();
		this.render();
		this.callbacks.onCameraChange?.(this.readCameraState());
	}

	pick(clientX: number, clientY: number): Complex | null {
		const rect = this.canvas.getBoundingClientRect();
		if (rect.width < 1 || rect.height < 1) return null;
		const raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(
			new THREE.Vector2(
				((clientX - rect.left) / rect.width) * 2 - 1,
				-((clientY - rect.top) / rect.height) * 2 + 1
			),
			this.camera
		);
		const surface =
			this.surfaceGroup.getObjectByName('domain-sheet') ??
			this.surfaceGroup.getObjectByName('domain-landscape');
		if (!surface) return null;
		const hit = raycaster.intersectObject(surface, false)[0];
		return hit ? { re: hit.point.x, im: hit.point.z } : null;
	}

	render() {
		if (this.disposed || document.hidden || this.renderer.getContext().isContextLost()) return;
		this.renderer.render(this.scene, this.camera);
	}

	captureCanvas() {
		this.render();
		return this.canvas;
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.canvas.removeEventListener('webglcontextlost', this.lost);
		this.canvas.removeEventListener('webglcontextrestored', this.restored);
		this.controls.dispose();
		disposeObject(this.surfaceGroup);
		disposeObject(this.overlayGroup);
		this.scene.clear();
		this.renderer.dispose();
		this.renderer.forceContextLoss();
	}
}

export function createDomainLandscapeRenderer(
	canvas: HTMLCanvasElement,
	callbacks?: LandscapeRendererCallbacks
) {
	return new DomainLandscapeRenderer(canvas, callbacks);
}
