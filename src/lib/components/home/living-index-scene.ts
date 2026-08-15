import * as THREE from 'three';

export type LivingIndexTier = 'A' | 'B';
export type LivingIndexMotion = 'gentle' | 'alive';

export interface LivingIndexPalette {
	background: string;
	line: string;
	node: string;
	system: string;
	human: string;
}

export interface LivingIndexSceneOptions {
	host: HTMLElement;
	diagnostics: HTMLElement;
	tier: LivingIndexTier;
	motion: LivingIndexMotion;
	palette: LivingIndexPalette;
	onFailure: () => void;
}

export interface LivingIndexController {
	setTier(tier: LivingIndexTier): void;
	setMotion(motion: LivingIndexMotion): void;
	setPalette(palette: LivingIndexPalette): void;
	setVisible(visible: boolean): void;
	refreshNarrative(): void;
	dispose(): void;
}

type NarrativeState =
	| 'hero'
	| 'systems'
	| 'laboratory'
	| 'writing'
	| 'calcutta'
	| 'patient'
	| 'guided'
	| 'work'
	| 'latest'
	| 'closing';

interface NarrativeAnchor {
	element: HTMLElement;
	state: NarrativeState;
}

const STATE_ORDER: readonly NarrativeState[] = [
	'hero',
	'systems',
	'laboratory',
	'writing',
	'calcutta',
	'patient',
	'guided',
	'work',
	'latest',
	'closing'
];

const STATE_ALIASES: Readonly<Record<string, NarrativeState>> = {
	hero: 'hero',
	systems: 'systems',
	laboratory: 'laboratory',
	writing: 'writing',
	calcutta: 'calcutta',
	patient: 'patient',
	reading: 'guided',
	guided: 'guided',
	worlds: 'work',
	work: 'work',
	library: 'latest',
	latest: 'latest',
	invitation: 'closing',
	closing: 'closing'
};

const STATE_CAMERA_X: Record<NarrativeState, number> = {
	hero: 0,
	systems: 1.15,
	laboratory: -1.05,
	writing: 0.85,
	calcutta: -0.8,
	patient: 0.35,
	guided: -0.3,
	work: 0.5,
	latest: -0.4,
	closing: 0
};

const STATE_CAMERA_Z: Record<NarrativeState, number> = {
	hero: 10.4,
	systems: 9.7,
	laboratory: 9.25,
	writing: 9.8,
	calcutta: 9.45,
	patient: 8.9,
	guided: 10.55,
	work: 10.2,
	latest: 10.8,
	closing: 11.15
};

const clamp = (value: number, minimum: number, maximum: number): number =>
	Math.min(maximum, Math.max(minimum, value));

const damp = (value: number, target: number, lambda: number, delta: number): number =>
	THREE.MathUtils.damp(value, target, lambda, delta);

function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

function asColour(value: string, fallback: string): THREE.Color {
	const candidate = /^#[\da-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
	return new THREE.Color(candidate);
}

function makeLineGeometry(
	lines: readonly (readonly [number, number, number])[][]
): THREE.BufferGeometry {
	const positions: number[] = [];
	for (const line of lines) {
		for (let index = 1; index < line.length; index += 1) {
			const previous = line[index - 1];
			const current = line[index];
			if (!previous || !current) continue;
			positions.push(...previous, ...current);
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	return geometry;
}

function createContourLines(tier: LivingIndexTier): (readonly [number, number, number])[][] {
	const lineCount = tier === 'A' ? 11 : 7;
	const segmentCount = tier === 'A' ? 46 : 28;
	const lines: [number, number, number][][] = [];
	for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
		const line: [number, number, number][] = [];
		const verticalOffset = -4.7 + lineIndex * (9.4 / Math.max(1, lineCount - 1));
		for (let segment = 0; segment <= segmentCount; segment += 1) {
			const x = -8.6 + segment * (17.2 / segmentCount);
			const y =
				verticalOffset +
				Math.sin(x * 0.56 + lineIndex * 0.83) * 0.22 +
				Math.sin(x * 0.17 - lineIndex) * 0.16;
			const z = -1.35 + Math.sin(lineIndex * 0.61) * 0.22;
			line.push([x, y, z]);
		}
		lines.push(line);
	}
	return lines;
}

const ROUTES: readonly (readonly [number, number, number])[][] = [
	[
		[-8.2, 1.8, -0.4],
		[-5.8, 1.35, -0.15],
		[-3.8, 2.2, 0.05],
		[-1.65, 1.3, 0.24],
		[0.1, 1.65, 0.34],
		[2.4, 0.45, 0.16],
		[5.35, 1.25, -0.12],
		[8.15, 0.55, -0.38]
	],
	[
		[-7.5, -3.45, -0.55],
		[-5.2, -2.15, -0.22],
		[-2.7, -2.45, 0.04],
		[-0.45, -1.15, 0.3],
		[1.6, -1.65, 0.25],
		[4.1, -0.85, -0.06],
		[7.6, -1.8, -0.46]
	],
	[
		[-5.9, 4.15, -0.7],
		[-4.2, 2.65, -0.34],
		[-2.1, 1.1, 0.06],
		[-0.45, -1.15, 0.3],
		[0.4, -3.4, -0.14],
		[2.5, -4.3, -0.55]
	],
	[
		[4.2, 4.15, -0.62],
		[3.7, 2.4, -0.22],
		[2.4, 0.45, 0.16],
		[1.6, -1.65, 0.25],
		[2.5, -4.3, -0.55]
	]
];

function pointAlongRoute(
	route: readonly (readonly [number, number, number])[],
	progress: number,
	target: THREE.Vector3
): THREE.Vector3 {
	const scaled = clamp(progress, 0, 0.999_999) * (route.length - 1);
	const index = Math.floor(scaled);
	const local = scaled - index;
	const start = route[index] ?? route[0] ?? [0, 0, 0];
	const end = route[index + 1] ?? start;
	target.set(
		THREE.MathUtils.lerp(start[0], end[0], local),
		THREE.MathUtils.lerp(start[1], end[1], local),
		THREE.MathUtils.lerp(start[2], end[2], local)
	);
	return target;
}

function easingOutCubic(value: number): number {
	return 1 - Math.pow(1 - clamp(value, 0, 1), 3);
}

export function createLivingIndexScene(options: LivingIndexSceneOptions): LivingIndexController {
	const { host, diagnostics } = options;
	let tier = options.tier;
	let motion = options.motion;
	let palette = options.palette;
	let disposed = false;
	let visible = document.visibilityState === 'visible';
	let contextLost = false;
	let animationFrame = 0;
	let scrollFrame = 0;
	let lastFrameTime = 0;
	let lastDiagnosticsElapsed = -1;
	let elapsed = 0;
	let currentStatePosition = 0;
	let targetStatePosition = 0;
	let sectionProgress = 0;
	let pointerX = 0;
	let pointerY = 0;
	let pointerTargetX = 0;
	let pointerTargetY = 0;
	let narrativeAnchors: NarrativeAnchor[] = [];
	let activeState: NarrativeState = 'hero';

	const renderer = new THREE.WebGLRenderer({
		alpha: true,
		antialias: tier === 'A',
		depth: true,
		stencil: false,
		powerPreference: tier === 'A' ? 'high-performance' : 'low-power',
		preserveDrawingBuffer: false
	});
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.setClearColor(0x000000, 0);
	renderer.domElement.className = 'living-index-canvas';
	renderer.domElement.dataset.livingIndexCanvas = '';
	renderer.domElement.dataset.localAnimationOwner = 'living-index';
	renderer.domElement.setAttribute('aria-hidden', 'true');
	renderer.domElement.setAttribute('role', 'presentation');
	renderer.domElement.style.pointerEvents = 'none';
	host.append(renderer.domElement);

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 40);
	camera.position.set(0, 0, STATE_CAMERA_Z.hero);

	const geometries: THREE.BufferGeometry[] = [];
	const materials: THREE.Material[] = [];
	const random = seededRandom(0x225726);
	const worldGroup = new THREE.Group();
	const fieldGroup = new THREE.Group();
	const behaviourGroup = new THREE.Group();
	worldGroup.add(fieldGroup, behaviourGroup);
	scene.add(worldGroup);

	const contourGeometry = makeLineGeometry(createContourLines('A'));
	const contourVertexCount = contourGeometry.getAttribute('position').count;
	const compactContourVertexCount = Math.floor((contourVertexCount * 0.58) / 2) * 2;
	contourGeometry.setDrawRange(0, tier === 'A' ? contourVertexCount : compactContourVertexCount);
	const contourMaterial = new THREE.LineBasicMaterial({
		color: asColour(palette.line, '#625f58'),
		transparent: true,
		opacity: 0.19,
		depthWrite: false
	});
	geometries.push(contourGeometry);
	materials.push(contourMaterial);
	const contours = new THREE.LineSegments(contourGeometry, contourMaterial);
	fieldGroup.add(contours);

	const routeGeometry = makeLineGeometry(ROUTES);
	const routeMaterial = new THREE.LineBasicMaterial({
		color: asColour(palette.system, '#74b7bb'),
		transparent: true,
		opacity: 0.28,
		depthWrite: false
	});
	geometries.push(routeGeometry);
	materials.push(routeMaterial);
	const routes = new THREE.LineSegments(routeGeometry, routeMaterial);
	fieldGroup.add(routes);

	const pointCount = 180;
	const pointPositions = new Float32Array(pointCount * 3);
	for (let index = 0; index < pointCount; index += 1) {
		pointPositions[index * 3] = (random() - 0.5) * 18;
		pointPositions[index * 3 + 1] = (random() - 0.5) * 11;
		pointPositions[index * 3 + 2] = -1.4 + random() * 1.1;
	}
	const pointGeometry = new THREE.BufferGeometry();
	pointGeometry.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
	pointGeometry.setDrawRange(0, tier === 'A' ? pointCount : 96);
	const pointMaterial = new THREE.PointsMaterial({
		color: asColour(palette.node, '#9ac5b4'),
		size: tier === 'A' ? 0.035 : 0.045,
		transparent: true,
		opacity: 0.42,
		depthWrite: false,
		sizeAttenuation: true
	});
	geometries.push(pointGeometry);
	materials.push(pointMaterial);
	const points = new THREE.Points(pointGeometry, pointMaterial);
	fieldGroup.add(points);

	const signalGeometry = new THREE.CircleGeometry(0.052, 8);
	const signalMaterial = new THREE.MeshBasicMaterial({
		color: asColour(palette.system, '#74b7bb'),
		transparent: true,
		opacity: 0.82,
		depthWrite: false,
		side: THREE.DoubleSide
	});
	geometries.push(signalGeometry);
	materials.push(signalMaterial);
	const signalCount = 30;
	const signals = new THREE.InstancedMesh(signalGeometry, signalMaterial, signalCount);
	signals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
	signals.count = tier === 'A' ? signalCount : 14;
	fieldGroup.add(signals);

	const acknowledgementMaterial = new THREE.MeshBasicMaterial({
		color: asColour(palette.human, '#d16f4d'),
		transparent: true,
		opacity: 0.7,
		depthWrite: false,
		side: THREE.DoubleSide
	});
	materials.push(acknowledgementMaterial);
	const acknowledgements = new THREE.InstancedMesh(signalGeometry, acknowledgementMaterial, 8);
	acknowledgements.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
	acknowledgements.count = tier === 'A' ? 8 : 4;
	fieldGroup.add(acknowledgements);

	const ringGeometry = new THREE.RingGeometry(0.72, 0.735, 64);
	const ringMaterial = new THREE.MeshBasicMaterial({
		color: asColour(palette.system, '#74b7bb'),
		transparent: true,
		opacity: 0,
		depthWrite: false,
		side: THREE.DoubleSide
	});
	geometries.push(ringGeometry);
	materials.push(ringMaterial);
	const labRings = new THREE.Group();
	for (let index = 0; index < 3; index += 1) {
		const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
		materials.push(ring.material);
		ring.position.set(-2.5, 0.4, 0.12 + index * 0.015);
		ring.scale.setScalar(0.8 + index * 0.58);
		labRings.add(ring);
	}
	behaviourGroup.add(labRings);

	const writingGeometry = makeLineGeometry([
		[
			[1.9, 2.5, 0.02],
			[3.15, 2.65, 0.03],
			[4.5, 2.42, 0.02],
			[6.5, 2.58, -0.03]
		],
		[
			[2.4, 1.86, 0.02],
			[3.5, 1.72, 0.03],
			[4.1, 1.96, 0.04],
			[5.7, 1.78, -0.02]
		],
		[
			[2.1, 1.1, 0.02],
			[3.4, 1.2, 0.04],
			[5.1, 1.05, 0.02]
		]
	]);
	const writingMaterial = new THREE.LineBasicMaterial({
		color: asColour(palette.human, '#d16f4d'),
		transparent: true,
		opacity: 0,
		depthWrite: false
	});
	geometries.push(writingGeometry);
	materials.push(writingMaterial);
	const writingStrokes = new THREE.LineSegments(writingGeometry, writingMaterial);
	behaviourGroup.add(writingStrokes);

	const windowCount = 42;
	const windowPositions = new Float32Array(windowCount * 3);
	for (let index = 0; index < windowCount; index += 1) {
		windowPositions[index * 3] = -7.5 + random() * 7.3;
		windowPositions[index * 3 + 1] = -4.1 + random() * 3.6;
		windowPositions[index * 3 + 2] = -0.2 + random() * 0.25;
	}
	const windowGeometry = new THREE.BufferGeometry();
	windowGeometry.setAttribute('position', new THREE.BufferAttribute(windowPositions, 3));
	windowGeometry.setDrawRange(0, tier === 'A' ? windowCount : 22);
	const windowMaterial = new THREE.PointsMaterial({
		color: asColour(palette.human, '#d16f4d'),
		size: 0.065,
		transparent: true,
		opacity: 0,
		depthWrite: false
	});
	geometries.push(windowGeometry);
	materials.push(windowMaterial);
	const windows = new THREE.Points(windowGeometry, windowMaterial);
	behaviourGroup.add(windows);

	const patientGeometry = new THREE.CircleGeometry(0.105, 12);
	const patientMaterial = new THREE.MeshBasicMaterial({
		color: asColour(palette.human, '#d16f4d'),
		transparent: true,
		opacity: 0,
		depthWrite: false,
		side: THREE.DoubleSide
	});
	geometries.push(patientGeometry);
	materials.push(patientMaterial);
	const patientSignal = new THREE.Mesh(patientGeometry, patientMaterial);
	behaviourGroup.add(patientSignal);

	const closingGeometry = new THREE.RingGeometry(0.11, 0.15, 24);
	const closingMaterial = new THREE.MeshBasicMaterial({
		color: asColour(palette.human, '#d16f4d'),
		transparent: true,
		opacity: 0,
		depthWrite: false,
		side: THREE.DoubleSide
	});
	geometries.push(closingGeometry);
	materials.push(closingMaterial);
	const closingPoint = new THREE.Mesh(closingGeometry, closingMaterial);
	closingPoint.position.set(-0.5, -0.6, 0.2);
	behaviourGroup.add(closingPoint);

	const matrix = new THREE.Matrix4();
	const signalPosition = new THREE.Vector3();
	const signalScale = new THREE.Vector3();
	const signalQuaternion = new THREE.Quaternion();
	const cameraTarget = new THREE.Vector3();
	const scaleTarget = new THREE.Vector3(1, 1, 1);
	const scaleZero = new THREE.Vector3(0.001, 0.001, 0.001);

	function stateWeight(state: NarrativeState, spread = 0.85): number {
		const stateIndex = STATE_ORDER.indexOf(state);
		return clamp(1 - Math.abs(currentStatePosition - stateIndex) / spread, 0, 1);
	}

	function setDiagnostics(): void {
		const pixelRatio = renderer.getPixelRatio();
		const width = renderer.domElement.width;
		const height = renderer.domElement.height;
		diagnostics.dataset.sceneTier = tier;
		diagnostics.dataset.sceneStatus = contextLost ? 'context-lost' : visible ? 'running' : 'paused';
		diagnostics.dataset.sceneFrameCap = String(
			tier === 'A' ? (motion === 'alive' ? 60 : 42) : motion === 'alive' ? 30 : 24
		);
		diagnostics.dataset.scenePixelRatio = pixelRatio.toFixed(2);
		diagnostics.dataset.sceneBackingPixels = `${width}x${height}`;
		diagnostics.dataset.sceneState = activeState;
		diagnostics.dataset.sceneProgress = sectionProgress.toFixed(3);
	}

	function resize(): void {
		if (disposed || contextLost) return;
		const rect = host.getBoundingClientRect();
		const width = Math.max(1, Math.round(rect.width));
		const height = Math.max(1, Math.round(rect.height));
		const cap = tier === 'A' ? 1.5 : 1.18;
		const pixelBudget = tier === 'A' ? 4_200_000 : 1_300_000;
		const areaRatio = Math.sqrt(pixelBudget / (width * height));
		const pixelRatio = Math.min(window.devicePixelRatio || 1, cap, areaRatio);
		renderer.setPixelRatio(pixelRatio);
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		// Portrait is a distinct composition: compress the wide field while
		// retaining its depth, so every behaviour remains within the quiet centre.
		worldGroup.scale.set(clamp(camera.aspect / 1.65, 0.26, 1), 1, 1);
		setDiagnostics();
	}

	function refreshNarrative(): void {
		const next: NarrativeAnchor[] = [];
		for (const element of document.querySelectorAll<HTMLElement>(
			'[data-scene-state]:not([data-living-index-scene]), [data-scene-destination]'
		)) {
			const rawState = element.dataset.sceneDestination ?? element.dataset.sceneState;
			const state = rawState ? STATE_ALIASES[rawState] : undefined;
			if (state) next.push({ element, state });
		}
		narrativeAnchors = next;
		measureNarrative();
	}

	function measureNarrative(): void {
		if (disposed || narrativeAnchors.length === 0) return;
		const viewportHeight = Math.max(1, window.innerHeight);
		const focusY = viewportHeight * 0.46;
		let closest = narrativeAnchors[0];
		let closestDistance = Number.POSITIVE_INFINITY;
		let closestRect: DOMRect | null = null;
		for (const anchor of narrativeAnchors) {
			const rect = anchor.element.getBoundingClientRect();
			const centre = rect.top + rect.height * 0.5;
			const distance = Math.abs(centre - focusY);
			if (distance < closestDistance) {
				closest = anchor;
				closestDistance = distance;
				closestRect = rect;
			}
		}
		if (!closest || !closestRect) return;
		activeState = closest.state;
		targetStatePosition = STATE_ORDER.indexOf(closest.state);
		sectionProgress = clamp(
			(viewportHeight - closestRect.top) / (viewportHeight + closestRect.height),
			0,
			1
		);
		setDiagnostics();
	}

	function scheduleNarrativeMeasure(): void {
		if (scrollFrame) return;
		scrollFrame = window.requestAnimationFrame(() => {
			scrollFrame = 0;
			measureNarrative();
		});
	}

	function stateFromDestinationEvent(event: Event): NarrativeState | undefined {
		if (!(event.target instanceof Element)) return undefined;
		const destination = event.target.closest<HTMLElement>('[data-scene-destination]');
		const rawState = destination?.dataset.sceneDestination;
		return rawState ? STATE_ALIASES[rawState] : undefined;
	}

	function activateDestination(event: Event): void {
		const state = stateFromDestinationEvent(event);
		if (!state) return;
		activeState = state;
		targetStatePosition = STATE_ORDER.indexOf(state);
		sectionProgress = 0.5;
		setDiagnostics();
	}

	function releaseDestination(event: FocusEvent | PointerEvent): void {
		if (event.relatedTarget instanceof Element) {
			const nextDestination = event.relatedTarget.closest<HTMLElement>('[data-scene-destination]');
			if (nextDestination) return;
		}
		measureNarrative();
	}

	function updateSignals(time: number, systemWeight: number): void {
		const speed = motion === 'alive' ? 0.115 : 0.075;
		const visibleSignalCount = signals.count;
		for (let index = 0; index < visibleSignalCount; index += 1) {
			const route = ROUTES[index % ROUTES.length] ?? ROUTES[0];
			if (!route) continue;
			const queuePause = index % 7 === 0 ? Math.sin(time * 0.6 + index) * 0.014 * systemWeight : 0;
			const progress = (time * speed + index * 0.137 + queuePause + 1) % 1;
			pointAlongRoute(route, progress, signalPosition);
			const pulse = 0.76 + Math.sin(time * 2.1 + index * 0.71) * 0.18;
			signalScale.setScalar(Math.max(0.001, pulse));
			matrix.compose(signalPosition, signalQuaternion, signalScale);
			signals.setMatrixAt(index, matrix);
		}
		signals.instanceMatrix.needsUpdate = true;

		for (let index = 0; index < acknowledgements.count; index += 1) {
			const route = ROUTES[(index + 1) % ROUTES.length] ?? ROUTES[0];
			if (!route) continue;
			const progress = 1 - ((time * speed * 0.68 + index * 0.23) % 1);
			pointAlongRoute(route, progress, signalPosition);
			signalScale.setScalar(0.58);
			matrix.compose(signalPosition, signalQuaternion, signalScale);
			acknowledgements.setMatrixAt(index, matrix);
		}
		acknowledgements.instanceMatrix.needsUpdate = true;
	}

	function renderFrame(timestamp: number): void {
		animationFrame = 0;
		if (disposed || !visible || contextLost) return;
		const frameCap = tier === 'A' ? (motion === 'alive' ? 60 : 42) : motion === 'alive' ? 30 : 24;
		const minimumInterval = 1000 / frameCap;
		if (lastFrameTime && timestamp - lastFrameTime < minimumInterval - 1) {
			animationFrame = window.requestAnimationFrame(renderFrame);
			return;
		}
		const delta = clamp(lastFrameTime ? (timestamp - lastFrameTime) / 1000 : 1 / frameCap, 0, 0.05);
		lastFrameTime = timestamp;
		elapsed += delta;
		const intro = easingOutCubic(elapsed / 1.6);
		currentStatePosition = damp(currentStatePosition, targetStatePosition, 4.2, delta);
		pointerX = damp(pointerX, pointerTargetX, 3.8, delta);
		pointerY = damp(pointerY, pointerTargetY, 3.8, delta);

		const systemWeight = Math.max(stateWeight('hero', 1.35), stateWeight('systems', 1.2));
		const labWeight = stateWeight('laboratory', 1.15);
		const writingWeight = stateWeight('writing', 1.15);
		const calcuttaWeight = Math.max(stateWeight('calcutta', 1.25), stateWeight('closing', 0.8));
		const patientWeight = stateWeight('patient', 1.1);
		const quietWeight = Math.max(stateWeight('guided', 1.2), stateWeight('latest', 1.2));

		const lowerIndex = clamp(Math.floor(currentStatePosition), 0, STATE_ORDER.length - 1);
		const upperIndex = clamp(Math.ceil(currentStatePosition), 0, STATE_ORDER.length - 1);
		const interpolation = currentStatePosition - lowerIndex;
		const lowerState = STATE_ORDER[lowerIndex] ?? 'hero';
		const upperState = STATE_ORDER[upperIndex] ?? lowerState;
		const targetX = THREE.MathUtils.lerp(
			STATE_CAMERA_X[lowerState],
			STATE_CAMERA_X[upperState],
			interpolation
		);
		const targetZ = THREE.MathUtils.lerp(
			STATE_CAMERA_Z[lowerState],
			STATE_CAMERA_Z[upperState],
			interpolation
		);
		const sectionTravel = sectionProgress - 0.5;
		const parallaxScale = tier === 'A' ? 0.16 : 0;
		camera.position.x = damp(
			camera.position.x,
			targetX + sectionTravel * 0.34 + pointerX * parallaxScale,
			3.2,
			delta
		);
		camera.position.y = damp(camera.position.y, -pointerY * parallaxScale * 0.65, 3.2, delta);
		camera.position.z = damp(camera.position.z, targetZ - sectionTravel * 0.38, 3.2, delta);
		worldGroup.position.y = damp(worldGroup.position.y, sectionTravel * 0.22, 3.2, delta);
		cameraTarget.set(camera.position.x * 0.12, camera.position.y * 0.08, 0);
		camera.lookAt(cameraTarget);

		fieldGroup.scale.lerpVectors(scaleZero, scaleTarget, intro);
		fieldGroup.rotation.z = Math.sin(elapsed * 0.055) * 0.008 * (1 - quietWeight * 0.7);
		contourMaterial.opacity = intro * (0.18 - quietWeight * 0.07 + calcuttaWeight * 0.05);
		routeMaterial.opacity = intro * (0.16 + systemWeight * 0.25 + patientWeight * 0.12);
		pointMaterial.opacity = intro * (0.28 + systemWeight * 0.2 - quietWeight * 0.1);
		signalMaterial.opacity = intro * (0.2 + systemWeight * 0.68 - quietWeight * 0.12);
		acknowledgementMaterial.opacity = intro * systemWeight * 0.72;

		updateSignals(elapsed, systemWeight);

		for (let index = 0; index < labRings.children.length; index += 1) {
			const ring = labRings.children[index] as THREE.Mesh<
				THREE.BufferGeometry,
				THREE.MeshBasicMaterial
			>;
			const phase = elapsed * (0.62 + index * 0.09) + index * 0.9;
			const scale = 0.75 + index * 0.55 + Math.sin(phase) * 0.09;
			ring.scale.setScalar(scale);
			ring.material.opacity = labWeight * (0.15 + (Math.sin(phase + 1.1) + 1) * 0.07);
		}
		writingMaterial.opacity = writingWeight * 0.42;
		writingStrokes.position.x = Math.sin(elapsed * 0.35) * 0.05 * writingWeight;
		windowMaterial.opacity = calcuttaWeight * (0.42 + Math.sin(elapsed * 0.42) * 0.06);

		const patientRoute = ROUTES[1];
		if (patientRoute) {
			const rawPatientProgress = (elapsed * 0.075 + 0.06) % 1;
			const delayedProgress =
				rawPatientProgress > 0.34 && rawPatientProgress < 0.45
					? 0.34 + (rawPatientProgress - 0.34) * 0.2
					: rawPatientProgress;
			pointAlongRoute(patientRoute, delayedProgress, patientSignal.position);
		}
		patientMaterial.opacity = patientWeight * 0.94;
		patientSignal.scale.setScalar(0.88 + Math.sin(elapsed * 2.2) * 0.14);
		closingMaterial.opacity = stateWeight('closing', 1.2) * 0.92;
		closingPoint.scale.setScalar(0.92 + Math.sin(elapsed * 0.85) * 0.08);

		try {
			renderer.render(scene, camera);
		} catch {
			stop();
			options.onFailure();
			return;
		}
		if (elapsed - lastDiagnosticsElapsed >= 0.5) {
			lastDiagnosticsElapsed = elapsed;
			setDiagnostics();
		}
		animationFrame = window.requestAnimationFrame(renderFrame);
	}

	function start(): void {
		if (disposed || !visible || contextLost || animationFrame) return;
		lastFrameTime = 0;
		animationFrame = window.requestAnimationFrame(renderFrame);
	}

	function stop(): void {
		if (animationFrame) window.cancelAnimationFrame(animationFrame);
		animationFrame = 0;
		lastFrameTime = 0;
	}

	function onPointerMove(event: PointerEvent): void {
		if (tier !== 'A') return;
		pointerTargetX = clamp((event.clientX / Math.max(1, window.innerWidth)) * 2 - 1, -1, 1);
		pointerTargetY = clamp((event.clientY / Math.max(1, window.innerHeight)) * 2 - 1, -1, 1);
	}

	function onContextLost(event: Event): void {
		event.preventDefault();
		contextLost = true;
		stop();
		setDiagnostics();
	}

	function onContextRestored(): void {
		if (disposed) return;
		try {
			renderer.resetState();
			contextLost = false;
			resize();
			renderer.render(scene, camera);
			start();
		} catch {
			options.onFailure();
		}
	}

	const resizeObserver =
		typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize());
	resizeObserver?.observe(host);
	window.addEventListener('resize', resize, { passive: true });
	window.addEventListener('scroll', scheduleNarrativeMeasure, { passive: true });
	document.addEventListener('focusin', activateDestination);
	document.addEventListener('focusout', releaseDestination);
	if (window.matchMedia('(pointer: fine)').matches) {
		window.addEventListener('pointermove', onPointerMove, { passive: true });
		document.addEventListener('pointerover', activateDestination);
		document.addEventListener('pointerout', releaseDestination);
	}
	renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);
	renderer.domElement.addEventListener('webglcontextrestored', onContextRestored, false);

	refreshNarrative();
	resize();
	start();

	return {
		setTier(nextTier) {
			if (disposed || tier === nextTier) return;
			tier = nextTier;
			contourGeometry.setDrawRange(
				0,
				tier === 'A' ? contourVertexCount : compactContourVertexCount
			);
			pointGeometry.setDrawRange(0, tier === 'A' ? pointCount : 96);
			windowGeometry.setDrawRange(0, tier === 'A' ? windowCount : 22);
			signals.count = tier === 'A' ? signalCount : 14;
			acknowledgements.count = tier === 'A' ? 8 : 4;
			pointMaterial.size = tier === 'A' ? 0.035 : 0.045;
			resize();
		},
		setMotion(nextMotion) {
			motion = nextMotion;
			setDiagnostics();
		},
		setPalette(nextPalette) {
			palette = nextPalette;
			contourMaterial.color.copy(asColour(palette.line, '#625f58'));
			routeMaterial.color.copy(asColour(palette.system, '#74b7bb'));
			pointMaterial.color.copy(asColour(palette.node, '#9ac5b4'));
			signalMaterial.color.copy(asColour(palette.system, '#74b7bb'));
			acknowledgementMaterial.color.copy(asColour(palette.human, '#d16f4d'));
			writingMaterial.color.copy(asColour(palette.human, '#d16f4d'));
			windowMaterial.color.copy(asColour(palette.human, '#d16f4d'));
			patientMaterial.color.copy(asColour(palette.human, '#d16f4d'));
			closingMaterial.color.copy(asColour(palette.human, '#d16f4d'));
			for (const child of labRings.children) {
				const ring = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
				ring.material.color.copy(asColour(palette.system, '#74b7bb'));
			}
		},
		setVisible(nextVisible) {
			visible = nextVisible;
			if (visible) start();
			else stop();
			setDiagnostics();
		},
		refreshNarrative,
		dispose() {
			if (disposed) return;
			disposed = true;
			stop();
			if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
			scrollFrame = 0;
			resizeObserver?.disconnect();
			window.removeEventListener('resize', resize);
			window.removeEventListener('scroll', scheduleNarrativeMeasure);
			window.removeEventListener('pointermove', onPointerMove);
			document.removeEventListener('focusin', activateDestination);
			document.removeEventListener('focusout', releaseDestination);
			document.removeEventListener('pointerover', activateDestination);
			document.removeEventListener('pointerout', releaseDestination);
			renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
			renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
			for (const geometry of geometries) geometry.dispose();
			for (const material of materials) material.dispose();
			scene.clear();
			renderer.dispose();
			renderer.forceContextLoss();
			renderer.domElement.remove();
			diagnostics.dataset.sceneStatus = 'disposed';
		}
	};
}
