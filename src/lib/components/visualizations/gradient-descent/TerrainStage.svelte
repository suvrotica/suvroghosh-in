<script lang="ts">
	import { onMount } from 'svelte';
	import type p5 from 'p5';
	import { supportsWebGL } from '$lib/visualizations/webgl';
	import {
		domainBounds,
		finitePoint,
		pointX,
		pointY,
		sampleGrid,
		type DomainLike,
		type HistoryRecord,
		type SampledGrid,
		type TerrainRun
	} from './types';

	type CameraPreset = 'perspective' | 'topographic' | 'ravine' | 'side';
	type HeightMapping = 'linear' | 'log-compressed';

	type Props = {
		grid: SampledGrid | null;
		domain: DomainLike;
		history?: readonly HistoryRecord[];
		runs?: readonly TerrainRun[];
		currentStepIndex?: number;
		transitionProgress?: number;
		parameterLabels?: readonly [string, string];
		heightMapping?: HeightMapping;
		cameraPreset?: CameraPreset | string;
		cameraRevision?: number;
		quality?: 'battery' | 'draft' | 'balanced' | 'high';
		paused?: boolean;
		reducedMotion?: boolean;
		autoRotate?: boolean;
		poster?: string;
		posterAlt?: string;
		ariaLabel?: string;
		onstatus?: (status: 'loading' | 'ready' | 'fallback' | 'error', message: string) => void;
		onselectstep?: (index: number) => void;
	};

	let {
		grid,
		domain,
		history = [],
		runs = [],
		currentStepIndex = -1,
		transitionProgress = 1,
		parameterLabels = ['θ₁', 'θ₂'],
		heightMapping = 'log-compressed',
		cameraPreset = 'perspective',
		cameraRevision = 0,
		quality = 'balanced',
		paused = true,
		reducedMotion = false,
		autoRotate = false,
		poster = '/images/gradient-descent-landscapes.png',
		posterAlt = 'A dark topographic loss terrain crossed by an optimizer path',
		ariaLabel = 'Three-dimensional loss terrain. Drag to orbit, use the mouse wheel to zoom, and use Page Up or Page Down to inspect optimizer steps.',
		onstatus = () => undefined,
		onselectstep = () => undefined
	}: Props = $props();

	let host: HTMLDivElement;
	let instance: p5 | null = null;
	let renderState = $state<'loading' | 'ready' | 'fallback' | 'error'>('loading');
	let statusMessage = $state('Preparing the loss terrain…');
	let canvasElement: HTMLCanvasElement | null = null;
	let contextUnavailable = false;
	let meshDirty = true;
	let meshColumns = 0;
	let meshRows = 0;
	let meshPositions = new Float32Array(0);
	let meshNormals = new Float32Array(0);
	let meshLevels = new Float32Array(0);
	let yaw = -0.58;
	let pitch = -0.9;
	let cameraDistance = 430;
	let userInteracted = false;
	let systemReducedMotion = false;
	let documentVisible = true;
	let inspectionMessage = $state('');
	let adaptiveDetailLevel = $state<0 | 1 | 2>(0);
	let adaptiveDetailMessage = $state('');
	let touchEditMode = $state(false);

	const WORLD_WIDTH = 310;
	const WORLD_DEPTH = 238;
	const WORLD_HEIGHT = 138;
	const SLOW_DRAW_THRESHOLD_MS = 30;
	const SLOW_DRAW_STREAK_THRESHOLD = 4;
	const TERRAIN_INSTRUCTIONS_ID = 'gradient-terrain-keyboard-instructions';

	function formatLegendValue(value: number | undefined): string {
		if (value === undefined || !Number.isFinite(value)) return '—';
		if (value !== 0 && (Math.abs(value) >= 10_000 || Math.abs(value) < 0.001)) {
			return value.toExponential(2);
		}
		return value.toLocaleString('en-GB', { maximumFractionDigits: 3 });
	}

	const vertexSource = `
		precision highp float;
		attribute vec3 aPosition;
		attribute vec3 aNormal;
		attribute vec2 aTexCoord;
		uniform mat4 uModelViewMatrix;
		uniform mat4 uProjectionMatrix;
		varying vec3 vNormal;
		varying float vHeight;
		varying float vDepth;
		void main() {
			vec4 viewPosition = uModelViewMatrix * vec4(aPosition, 1.0);
			vNormal = normalize(mat3(uModelViewMatrix) * aNormal);
			vHeight = aTexCoord.y;
			vDepth = clamp((-viewPosition.z - 120.0) / 620.0, 0.0, 1.0);
			gl_Position = uProjectionMatrix * viewPosition;
		}
	`;

	const fragmentSource = `
		precision highp float;
		uniform vec3 uLowColour;
		uniform vec3 uHighColour;
		uniform vec3 uContourColour;
		uniform float uContourCount;
		varying vec3 vNormal;
		varying float vHeight;
		varying float vDepth;
		void main() {
			vec3 lightDirection = normalize(vec3(-0.38, -0.76, 0.53));
			float diffuse = 0.42 + 0.58 * abs(dot(normalize(vNormal), lightDirection));
			vec3 base = mix(uLowColour, uHighColour, smoothstep(0.02, 0.98, vHeight));
			float phase = fract(vHeight * uContourCount);
			float contourDistance = min(phase, 1.0 - phase);
			float contour = 1.0 - smoothstep(0.0, 0.045, contourDistance);
			vec3 colour = mix(base * diffuse, uContourColour, contour * 0.72);
			colour = mix(colour, vec3(0.035, 0.043, 0.043), vDepth * 0.34);
			gl_FragColor = vec4(colour, 1.0);
		}
	`;

	function updateStatus(state: 'loading' | 'ready' | 'fallback' | 'error', message: string): void {
		renderState = state;
		statusMessage = message;
		onstatus(state, message);
	}

	function mappedHeight(value: number): number {
		if (!grid) return 0;
		const minimum = Number.isFinite(grid.min) ? grid.min : 0;
		const maximum = Number.isFinite(grid.max) ? grid.max : minimum + 1;
		const shifted = Math.max(0, value - minimum);
		const range = Math.max(Number.EPSILON, maximum - minimum);
		return heightMapping === 'linear'
			? Math.min(1, shifted / range)
			: Math.min(1, Math.log1p(shifted) / Math.log1p(range));
	}

	function targetGridSize(): readonly [number, number] {
		if (!grid) return [0, 0];
		const compact = host?.clientWidth < 680;
		const lowCore =
			typeof navigator !== 'undefined' &&
			typeof navigator.hardwareConcurrency === 'number' &&
			navigator.hardwareConcurrency <= 4;
		const ceiling =
			quality === 'battery' ? 38 : quality === 'draft' ? 52 : quality === 'high' ? 112 : 82;
		const adaptive = compact || lowCore ? Math.min(ceiling, 58) : ceiling;
		const adaptiveScale = adaptiveDetailLevel === 0 ? 1 : adaptiveDetailLevel === 1 ? 0.72 : 0.5;
		const detailCeiling = Math.max(24, Math.floor(adaptive * adaptiveScale));
		return [
			Math.max(2, Math.min(grid.width, detailCeiling)),
			Math.max(2, Math.min(grid.height, detailCeiling))
		];
	}

	function inspectionHistory(): readonly HistoryRecord[] {
		return runs[0]?.history ?? history;
	}

	function selectInspectionStep(target: 'previous' | 'next' | 'first' | 'last'): void {
		const records = inspectionHistory();
		if (records.length === 0) {
			inspectionMessage = 'There is no optimizer path to inspect yet.';
			return;
		}
		const current =
			currentStepIndex < 0
				? records.length - 1
				: Math.max(0, Math.min(records.length - 1, currentStepIndex));
		const selected =
			target === 'first'
				? 0
				: target === 'last'
					? records.length - 1
					: target === 'previous'
						? Math.max(0, current - 1)
						: Math.min(records.length - 1, current + 1);
		onselectstep(selected);
		inspectionMessage = `Selected path step ${selected + 1} of ${records.length}, iteration ${records[selected].iteration}.`;
		instance?.redraw();
	}

	function rebuildMesh(): void {
		if (!grid || grid.width < 2 || grid.height < 2) {
			meshColumns = 0;
			meshRows = 0;
			meshPositions = new Float32Array(0);
			meshNormals = new Float32Array(0);
			meshLevels = new Float32Array(0);
			meshDirty = false;
			return;
		}

		[meshColumns, meshRows] = targetGridSize();
		const count = meshColumns * meshRows;
		meshPositions = new Float32Array(count * 3);
		meshNormals = new Float32Array(count * 3);
		meshLevels = new Float32Array(count);
		const bounds = domainBounds(domain);

		for (let row = 0; row < meshRows; row += 1) {
			for (let column = 0; column < meshColumns; column += 1) {
				const u = column / Math.max(1, meshColumns - 1);
				const v = row / Math.max(1, meshRows - 1);
				const point = {
					x: bounds.xMin + u * (bounds.xMax - bounds.xMin),
					y: bounds.yMin + v * (bounds.yMax - bounds.yMin)
				};
				const level = mappedHeight(sampleGrid(grid, domain, point));
				const index = row * meshColumns + column;
				meshLevels[index] = level;
				meshPositions[index * 3] = (u - 0.5) * WORLD_WIDTH;
				meshPositions[index * 3 + 1] = -level * WORLD_HEIGHT + WORLD_HEIGHT * 0.42;
				meshPositions[index * 3 + 2] = (0.5 - v) * WORLD_DEPTH;
			}
		}

		const stepX = WORLD_WIDTH / Math.max(1, meshColumns - 1);
		const stepZ = WORLD_DEPTH / Math.max(1, meshRows - 1);
		for (let row = 0; row < meshRows; row += 1) {
			for (let column = 0; column < meshColumns; column += 1) {
				const left = meshLevels[row * meshColumns + Math.max(0, column - 1)];
				const right = meshLevels[row * meshColumns + Math.min(meshColumns - 1, column + 1)];
				const above = meshLevels[Math.max(0, row - 1) * meshColumns + column];
				const below = meshLevels[Math.min(meshRows - 1, row + 1) * meshColumns + column];
				const slopeX = ((right - left) * WORLD_HEIGHT) / Math.max(stepX * 2, Number.EPSILON);
				const slopeZ = ((above - below) * WORLD_HEIGHT) / Math.max(stepZ * 2, Number.EPSILON);
				const magnitude = Math.hypot(slopeX, 1, slopeZ);
				const index = (row * meshColumns + column) * 3;
				meshNormals[index] = slopeX / magnitude;
				meshNormals[index + 1] = -1 / magnitude;
				meshNormals[index + 2] = slopeZ / magnitude;
			}
		}
		meshDirty = false;
	}

	function terrainPoint(record: HistoryRecord): readonly [number, number, number] | null {
		if (!grid || !finitePoint(record.theta)) return null;
		const bounds = domainBounds(domain);
		const u =
			(pointX(record.theta) - bounds.xMin) / Math.max(Number.EPSILON, bounds.xMax - bounds.xMin);
		const v =
			(pointY(record.theta) - bounds.yMin) / Math.max(Number.EPSILON, bounds.yMax - bounds.yMin);
		if (u < -0.01 || u > 1.01 || v < -0.01 || v > 1.01) return null;
		const level = mappedHeight(sampleGrid(grid, domain, record.theta));
		return [
			(u - 0.5) * WORLD_WIDTH,
			-level * WORLD_HEIGHT + WORLD_HEIGHT * 0.42 - 2.8,
			(0.5 - v) * WORLD_DEPTH
		];
	}

	function presetValues(preset: string): readonly [number, number, number] {
		if (preset === 'topographic') return [0, -Math.PI / 2 + 0.08, 470];
		if (preset === 'ravine') return [-0.9, -0.58, 390];
		if (preset === 'side') return [-Math.PI / 2, -0.18, 455];
		return [-0.58, -0.9, 430];
	}

	function resetCamera(): void {
		[yaw, pitch, cameraDistance] = presetValues(cameraPreset);
		instance?.redraw();
	}

	function shouldAnimate(): boolean {
		return autoRotate && !paused && !reducedMotion && !systemReducedMotion && documentVisible;
	}

	function restoreCanvasTouchAction(): void {
		if (!canvasElement) return;
		const desiredTouchAction = touchEditMode ? 'none' : 'pan-y pinch-zoom';
		if (canvasElement.style.touchAction !== desiredTouchAction) {
			canvasElement.style.touchAction = desiredTouchAction;
		}
	}

	onMount(() => {
		let disposed = false;
		let resizeObserver: ResizeObserver | null = null;
		let rootObserver: MutationObserver | null = null;
		let touchActionObserver: MutationObserver | null = null;
		let removeCanvasListeners = () => undefined;
		let adaptiveRedrawFrame = 0;
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

		const syncMotion = () => {
			systemReducedMotion =
				motionQuery.matches || document.documentElement.dataset.motion === 'still';
			if (shouldAnimate()) instance?.loop();
			else {
				instance?.noLoop();
				instance?.redraw();
			}
		};
		const syncVisibility = () => {
			documentVisible = document.visibilityState === 'visible';
			syncMotion();
		};

		motionQuery.addEventListener('change', syncMotion);
		window.addEventListener('site-motion-change', syncMotion);
		document.addEventListener('visibilitychange', syncVisibility);
		rootObserver = new MutationObserver(syncMotion);
		rootObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		syncMotion();

		if (!supportsWebGL()) {
			updateStatus(
				'fallback',
				'3D terrain is unavailable in this browser; the topographic laboratory remains active.'
			);
			return cleanup;
		}

		updateStatus('loading', 'Loading the p5 WebGL terrain renderer…');
		void (async () => {
			try {
				const { default: P5 } = await import('p5');
				if (disposed) return;
				instance = new P5((p) => {
					let terrainShader: p5.Shader;
					let density = 1;
					let dragging = false;
					let pointerId = -1;
					let previousX = 0;
					let previousY = 0;
					let slowDrawStreak = 0;

					function colourVector(name: string, fallback: string): readonly number[] {
						const css = getComputedStyle(host).getPropertyValue(name).trim() || fallback;
						const colour = p.color(css);
						return [p.red(colour) / 255, p.green(colour) / 255, p.blue(colour) / 255];
					}

					function applyDensity(): void {
						const compact = host.clientWidth < 680;
						const lowCore =
							typeof navigator.hardwareConcurrency === 'number' &&
							navigator.hardwareConcurrency <= 4;
						density = Math.min(window.devicePixelRatio || 1, compact || lowCore ? 1 : 1.5);
						p.pixelDensity(density);
					}

					function observeDrawDuration(startedAt: number): void {
						// Measure only execution inside p.draw. p.deltaTime includes time spent
						// idle between manual redraws and would falsely penalise a paused canvas.
						const duration = window.performance.now() - startedAt;
						slowDrawStreak = duration > SLOW_DRAW_THRESHOLD_MS ? slowDrawStreak + 1 : 0;
						if (slowDrawStreak < SLOW_DRAW_STREAK_THRESHOLD || adaptiveDetailLevel >= 2) {
							return;
						}
						adaptiveDetailLevel = adaptiveDetailLevel === 0 ? 1 : 2;
						slowDrawStreak = 0;
						meshDirty = true;
						adaptiveDetailMessage = `Adaptive terrain detail ${
							adaptiveDetailLevel === 1 ? 'reduced' : 'set to minimum'
						} after ${SLOW_DRAW_STREAK_THRESHOLD} consecutive draws exceeded ${SLOW_DRAW_THRESHOLD_MS} milliseconds.`;
						statusMessage = adaptiveDetailMessage;
						onstatus('ready', adaptiveDetailMessage);
						if (adaptiveRedrawFrame === 0) {
							adaptiveRedrawFrame = window.requestAnimationFrame(() => {
								adaptiveRedrawFrame = 0;
								if (!disposed) p.redraw();
							});
						}
					}

					function vertex(index: number): void {
						const offset = index * 3;
						p.normal(meshNormals[offset], meshNormals[offset + 1], meshNormals[offset + 2]);
						p.vertex(
							meshPositions[offset],
							meshPositions[offset + 1],
							meshPositions[offset + 2],
							(index % meshColumns) / Math.max(1, meshColumns - 1),
							meshLevels[index]
						);
					}

					function drawTerrain(): void {
						if (meshDirty) rebuildMesh();
						if (meshColumns < 2 || meshRows < 2) return;
						p.shader(terrainShader);
						terrainShader.setUniform('uLowColour', colourVector('--gd-terrain-low', '#171b1a'));
						terrainShader.setUniform('uHighColour', colourVector('--gd-terrain-high', '#5f665e'));
						terrainShader.setUniform(
							'uContourColour',
							colourVector('--gd-terrain-contour', '#d9cfba')
						);
						terrainShader.setUniform('uContourCount', 18);
						p.noStroke();
						for (let row = 0; row < meshRows - 1; row += 1) {
							p.beginShape(p.TRIANGLE_STRIP);
							for (let column = 0; column < meshColumns; column += 1) {
								vertex(row * meshColumns + column);
								vertex((row + 1) * meshColumns + column);
							}
							p.endShape();
						}
					}

					function pathColour(run: TerrainRun, index: number, active: boolean): p5.Color {
						if (active) {
							return p.color(
								getComputedStyle(host).getPropertyValue('--gd-run-active').trim() || '#f1eadb'
							);
						}
						const names = ['--gd-run-one', '--gd-run-two', '--gd-run-three', '--gd-run-four'];
						const fallbacks = ['#e7bd68', '#75b9b0', '#d78b6c', '#b69bd3'];
						const canonicalIndex =
							run.id === 'gd'
								? 0
								: run.id === 'momentum'
									? 1
									: run.id === 'rmsprop'
										? 2
										: run.id === 'adam'
											? 3
											: index % names.length;
						return p.color(
							getComputedStyle(host).getPropertyValue(names[canonicalIndex]).trim() ||
								fallbacks[canonicalIndex]
						);
					}

					function visibleSegment(pattern: TerrainRun['pattern'], index: number): boolean {
						if (pattern === 'dotted') return index % 3 === 0;
						if (pattern === 'dashed') return index % 7 < 4;
						if (pattern === 'dash-dot') return index % 10 < 5 || index % 10 === 7;
						return true;
					}

					function drawMarker(
						position: readonly [number, number, number],
						marker: TerrainRun['marker'],
						colour: p5.Color
					): void {
						p.push();
						p.translate(position[0], position[1] - 3, position[2]);
						p.noStroke();
						p.fill(colour);
						if (marker === 'circle') p.sphere(4.6, 10, 7);
						else if (marker === 'triangle') p.cone(5.2, 11, 3, 1, true);
						else if (marker === 'square') p.box(7.4);
						else {
							p.rotateZ(Math.PI / 4);
							p.rotateX(Math.PI / 4);
							p.box(6.6);
						}
						p.pop();
					}

					function drawRun(
						run: TerrainRun,
						runIndex: number,
						selected: number,
						active: boolean
					): void {
						const records = run.history.filter((record) => finitePoint(record.theta));
						if (records.length === 0) return;
						const colour = pathColour(run, runIndex, active);
						p.noFill();
						p.strokeWeight(active ? 2.4 : 1.8);
						for (let index = 1; index < records.length; index += 1) {
							if (!visibleSegment(run.pattern, index)) continue;
							const from = terrainPoint(records[index - 1]);
							const to = terrainPoint(records[index]);
							if (!from || !to) continue;
							const age = index / Math.max(1, records.length - 1);
							p.stroke(p.red(colour), p.green(colour), p.blue(colour), 52 + age * 203);
							p.line(from[0], from[1], from[2], to[0], to[1], to[2]);
						}
						const markerIndex = Math.max(0, Math.min(records.length - 1, selected));
						let markerRecord = records[markerIndex];
						if (
							active &&
							markerIndex === records.length - 1 &&
							markerIndex > 0 &&
							transitionProgress < 1
						) {
							const previous = records[markerIndex - 1];
							const progress = Math.max(0, Math.min(1, transitionProgress));
							markerRecord = {
								...markerRecord,
								theta: [
									pointX(previous.theta) +
										(pointX(markerRecord.theta) - pointX(previous.theta)) * progress,
									pointY(previous.theta) +
										(pointY(markerRecord.theta) - pointY(previous.theta)) * progress
								]
							};
						}
						const markerPosition = terrainPoint(markerRecord);
						if (markerPosition) drawMarker(markerPosition, run.marker ?? 'diamond', colour);
					}

					p.setup = () => {
						applyDensity();
						const renderer = p.createCanvas(
							Math.max(1, host.clientWidth),
							Math.max(1, host.clientHeight),
							p.WEBGL
						);
						canvasElement = renderer.elt as HTMLCanvasElement;
						canvasElement.tabIndex = 0;
						canvasElement.setAttribute('role', 'img');
						canvasElement.setAttribute('aria-label', ariaLabel);
						canvasElement.setAttribute('aria-describedby', TERRAIN_INSTRUCTIONS_ID);
						canvasElement.setAttribute(
							'aria-keyshortcuts',
							'PageUp PageDown Home End ArrowLeft ArrowRight ArrowUp ArrowDown 0'
						);
						touchActionObserver = new MutationObserver(restoreCanvasTouchAction);
						touchActionObserver.observe(canvasElement, {
							attributes: true,
							attributeFilter: ['style']
						});
						restoreCanvasTouchAction();
						terrainShader = p.createShader(vertexSource, fragmentSource);
						p.perspective(Math.PI / 3.2, p.width / Math.max(1, p.height), 8, 1800);
						p.noLoop();
						meshDirty = true;
						updateStatus('ready', 'Interactive WebGL terrain ready.');

						const pointerDown = (event: PointerEvent) => {
							if (event.button !== 0) return;
							if (event.pointerType === 'touch' && !touchEditMode) return;
							dragging = true;
							pointerId = event.pointerId;
							previousX = event.clientX;
							previousY = event.clientY;
							userInteracted = true;
							canvasElement?.focus();
							canvasElement?.setPointerCapture(event.pointerId);
						};
						const pointerMove = (event: PointerEvent) => {
							if (!dragging || event.pointerId !== pointerId) return;
							yaw += (event.clientX - previousX) * 0.008;
							pitch = Math.min(-0.12, Math.max(-1.5, pitch + (event.clientY - previousY) * 0.007));
							previousX = event.clientX;
							previousY = event.clientY;
							p.redraw();
						};
						const pointerUp = (event: PointerEvent) => {
							if (event.pointerId !== pointerId) return;
							dragging = false;
							pointerId = -1;
							if (canvasElement?.hasPointerCapture(event.pointerId)) {
								canvasElement.releasePointerCapture(event.pointerId);
							}
						};
						const wheel = (event: WheelEvent) => {
							event.preventDefault();
							userInteracted = true;
							cameraDistance = Math.min(
								760,
								Math.max(250, cameraDistance * Math.exp(event.deltaY * 0.0012))
							);
							p.redraw();
						};
						const keydown = (event: KeyboardEvent) => {
							const amount = event.shiftKey ? 0.035 : 0.09;
							if (event.key === 'ArrowLeft') yaw -= amount;
							else if (event.key === 'ArrowRight') yaw += amount;
							else if (event.key === 'ArrowUp') pitch = Math.max(-1.5, pitch - amount);
							else if (event.key === 'ArrowDown') pitch = Math.min(-0.12, pitch + amount);
							else if (event.key === '+' || event.key === '=')
								cameraDistance = Math.max(250, cameraDistance * 0.9);
							else if (event.key === '-') cameraDistance = Math.min(760, cameraDistance * 1.1);
							else if (event.key === 'PageUp') selectInspectionStep('previous');
							else if (event.key === 'PageDown') selectInspectionStep('next');
							else if (event.key === 'Home') selectInspectionStep('first');
							else if (event.key === 'End') selectInspectionStep('last');
							else if (event.key === '0') resetCamera();
							else return;
							event.preventDefault();
							userInteracted = true;
							p.redraw();
						};
						const contextLost = (event: Event) => {
							event.preventDefault();
							contextUnavailable = true;
							p.noLoop();
							updateStatus(
								'fallback',
								'The WebGL context was lost. Continue with the synchronized topographic map.'
							);
						};

						canvasElement.addEventListener('pointerdown', pointerDown);
						canvasElement.addEventListener('pointermove', pointerMove);
						canvasElement.addEventListener('pointerup', pointerUp);
						canvasElement.addEventListener('pointercancel', pointerUp);
						canvasElement.addEventListener('wheel', wheel, { passive: false });
						canvasElement.addEventListener('keydown', keydown);
						canvasElement.addEventListener('webglcontextlost', contextLost);
						removeCanvasListeners = () => {
							canvasElement?.removeEventListener('pointerdown', pointerDown);
							canvasElement?.removeEventListener('pointermove', pointerMove);
							canvasElement?.removeEventListener('pointerup', pointerUp);
							canvasElement?.removeEventListener('pointercancel', pointerUp);
							canvasElement?.removeEventListener('wheel', wheel);
							canvasElement?.removeEventListener('keydown', keydown);
							canvasElement?.removeEventListener('webglcontextlost', contextLost);
						};

						resizeObserver = new ResizeObserver(() => {
							if (!instance || contextUnavailable) return;
							applyDensity();
							const width = Math.max(1, Math.round(host.clientWidth));
							const height = Math.max(1, Math.round(host.clientHeight));
							p.resizeCanvas(width, height, true);
							p.perspective(Math.PI / 3.2, width / Math.max(1, height), 8, 1800);
							meshDirty = true;
							p.redraw();
						});
						resizeObserver.observe(host);
					};

					p.draw = () => {
						if (contextUnavailable) return;
						const drawStartedAt = window.performance.now();
						if (shouldAnimate() && !userInteracted) yaw += Math.min(34, p.deltaTime) * 0.00008;
						p.background(9, 12, 12);
						p.camera(0, -12, cameraDistance, 0, -12, 0, 0, 1, 0);
						p.push();
						p.rotateX(pitch);
						p.rotateY(yaw);
						drawTerrain();
						p.resetShader();
						const displayedRuns: readonly TerrainRun[] = [
							{ id: 'active', label: 'Active optimizer', history, marker: 'diamond' },
							...runs
						];
						for (let index = 0; index < displayedRuns.length; index += 1) {
							const selected =
								index === 0 && currentStepIndex >= 0
									? currentStepIndex
									: displayedRuns[index].history.length - 1;
							drawRun(displayedRuns[index], index, selected, index === 0);
						}
						p.pop();
						if (!shouldAnimate()) p.noLoop();
						observeDrawDuration(drawStartedAt);
					};
				}, host);
			} catch (error) {
				if (disposed) return;
				updateStatus(
					'error',
					`${error instanceof Error ? error.message : 'The terrain renderer could not start.'} Continue with the synchronized map.`
				);
			}
		})();

		function cleanup() {
			disposed = true;
			resizeObserver?.disconnect();
			rootObserver?.disconnect();
			touchActionObserver?.disconnect();
			motionQuery.removeEventListener('change', syncMotion);
			window.removeEventListener('site-motion-change', syncMotion);
			document.removeEventListener('visibilitychange', syncVisibility);
			removeCanvasListeners();
			if (adaptiveRedrawFrame !== 0) window.cancelAnimationFrame(adaptiveRedrawFrame);
			instance?.remove();
			instance = null;
			canvasElement = null;
		}

		return cleanup;
	});

	$effect(() => {
		void touchEditMode;
		restoreCanvasTouchAction();
	});

	$effect(() => {
		void grid;
		void heightMapping;
		void domain;
		void quality;
		meshDirty = true;
		instance?.redraw();
	});

	$effect(() => {
		void history;
		void runs;
		void currentStepIndex;
		void transitionProgress;
		instance?.redraw();
	});

	$effect(() => {
		void cameraPreset;
		void cameraRevision;
		resetCamera();
	});

	$effect(() => {
		void paused;
		void reducedMotion;
		void autoRotate;
		if (shouldAnimate()) instance?.loop();
		else {
			instance?.noLoop();
			instance?.redraw();
		}
	});
</script>

<div
	bind:this={host}
	class="terrain-stage"
	class:touch-edit-mode={touchEditMode}
	class:is-fallback={renderState === 'fallback' || renderState === 'error'}
	data-testid="gradient-terrain-stage"
	data-render-state={renderState}
	data-adaptive-detail={adaptiveDetailLevel === 0
		? 'full'
		: adaptiveDetailLevel === 1
			? 'reduced'
			: 'minimum'}
	data-adaptive-detail-level={adaptiveDetailLevel}
>
	<button
		type="button"
		class="touch-edit-toggle"
		aria-pressed={touchEditMode}
		onclick={() => (touchEditMode = !touchEditMode)}
	>
		{touchEditMode ? 'Finish touch orbit' : 'Enable touch orbit'}
	</button>
	{#if poster}
		<img
			class="terrain-poster"
			src={poster}
			alt={renderState === 'ready' ? '' : posterAlt}
			loading="lazy"
			decoding="async"
		/>
	{/if}
	{#if renderState === 'loading'}
		<div class="terrain-loading" role="status">{statusMessage}</div>
	{:else if renderState === 'fallback' || renderState === 'error'}
		<div class="terrain-fallback" role={renderState === 'error' ? 'alert' : 'status'}>
			<strong>Terrain view unavailable</strong>
			<span>{statusMessage}</span>
		</div>
	{/if}
	<div class="terrain-readout" aria-hidden="true">
		<span>{parameterLabels[0]}</span>
		<span>Loss</span>
		<span>{parameterLabels[1]}</span>
	</div>
	{#if adaptiveDetailLevel > 0}
		<p class="terrain-detail" role="status">{adaptiveDetailMessage}</p>
	{/if}
	<div
		class="terrain-colourbar"
		role="group"
		aria-label={`Terrain colour encodes robust sampled raw loss from ${formatLegendValue(grid?.min)} to ${formatLegendValue(grid?.max)}; calculations retain untransformed raw loss.`}
	>
		<span>low · {formatLegendValue(grid?.min)}</span><i aria-hidden="true"></i><span
			>high · {formatLegendValue(grid?.max)}</span
		>
	</div>
	<p class="height-mapping">
		{#if heightMapping === 'log-compressed'}
			Display height: log₁p(max(0, L − robust sampled minimum)), normalized to the sampled range;
			calculations use unshifted raw loss.
		{:else}
			Display height: linear normalization over the robust sampled range; calculations use raw loss.
		{/if}
	</p>
	<p id={TERRAIN_INSTRUCTIONS_ID} class="sr-only">
		Keyboard controls: use the arrow keys to orbit, plus and minus to zoom, and zero to reset the
		camera. Page Up and Page Down inspect the previous and next optimizer steps. Home and End
		inspect the first and latest steps.
	</p>
	<p class="sr-only" aria-live="polite">{inspectionMessage}</p>
	<p class="sr-only" aria-live="polite">{statusMessage}</p>
</div>

<style>
	.terrain-stage {
		--gd-terrain-low: #111615;
		--gd-terrain-high: #60665e;
		--gd-terrain-contour: #d8cfbb;
		--gd-run-one: #e7bd68;
		--gd-run-two: #75b9b0;
		--gd-run-three: #d78b6c;
		--gd-run-four: #b69bd3;
		position: relative;
		min-width: 0;
		min-height: clamp(25rem, 48vw, 43rem);
		overflow: hidden;
		background: #090c0c;
		isolation: isolate;
	}

	.terrain-stage :global(canvas) {
		position: absolute;
		z-index: 2;
		inset: 0;
		display: block;
		width: 100% !important;
		height: 100% !important;
		/* Vertical touch gestures and pinches remain available to the page on compact devices. */
		touch-action: pan-y pinch-zoom;
		cursor: grab;
	}

	.terrain-stage.touch-edit-mode :global(canvas) {
		touch-action: none;
	}

	.touch-edit-toggle {
		position: absolute;
		z-index: 6;
		top: 3rem;
		left: 0.7rem;
		display: none;
		min-height: 2.75rem;
		border: 1px solid #75b9b0;
		border-radius: 0.25rem;
		background: rgb(7 13 12 / 92%);
		padding: 0.55rem 0.7rem;
		color: #c9ebe5;
		font: 700 0.68rem/1.2 var(--font-sans, sans-serif);
	}

	@media (pointer: coarse) {
		.touch-edit-toggle {
			display: block;
		}
	}

	.terrain-stage :global(canvas:active) {
		cursor: grabbing;
	}

	.terrain-stage :global(canvas:focus-visible) {
		outline: 3px solid #f2d28f;
		outline-offset: -4px;
	}

	.terrain-poster {
		position: absolute;
		z-index: 0;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.6;
	}

	.terrain-loading,
	.terrain-fallback {
		position: absolute;
		z-index: 4;
		inset: 0;
		display: grid;
		place-content: center;
		gap: 0.45rem;
		background: rgb(9 12 12 / 68%);
		padding: 1.25rem;
		color: #e8e1d4;
		text-align: center;
		backdrop-filter: blur(3px);
	}

	.terrain-fallback span {
		max-width: 52ch;
		color: #bbb6ac;
		font-size: 0.82rem;
		line-height: 1.5;
	}

	.terrain-readout,
	.terrain-colourbar,
	.height-mapping,
	.terrain-detail {
		position: absolute;
		z-index: 3;
		margin: 0;
		border: 1px solid rgb(215 205 185 / 22%);
		background: rgb(8 11 11 / 76%);
		color: #d8cfbb;
		font: 0.66rem/1.35 var(--font-mono, monospace);
		letter-spacing: 0.035em;
		pointer-events: none;
		backdrop-filter: blur(4px);
	}

	.terrain-readout {
		top: 0.7rem;
		left: 0.7rem;
		display: flex;
		gap: 0.75rem;
		padding: 0.38rem 0.5rem;
	}
	.terrain-detail {
		top: 0.7rem;
		right: 0.7rem;
		max-width: min(24rem, calc(100% - 1.4rem));
		padding: 0.38rem 0.5rem;
		color: #f2d28f;
		text-align: right;
	}
	.terrain-colourbar {
		position: absolute;
		right: 0.8rem;
		bottom: 2.6rem;
		display: grid;
		grid-template-columns: auto minmax(4.5rem, 7rem) auto;
		align-items: center;
		gap: 0.4rem;
		color: #d8d1c4;
		font-size: 0.58rem;
	}
	.terrain-colourbar i {
		display: block;
		height: 0.38rem;
		border: 1px solid rgb(234 226 209 / 28%);
		background: linear-gradient(90deg, #111615, #5d655d);
	}

	.height-mapping {
		right: 0.7rem;
		bottom: 0.7rem;
		max-width: min(28rem, calc(100% - 1.4rem));
		padding: 0.4rem 0.55rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	@media (max-width: 44rem) {
		.terrain-stage {
			min-height: 31rem;
		}

		.height-mapping {
			right: 0.45rem;
			bottom: 0.45rem;
			left: 0.45rem;
			max-width: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.terrain-loading,
		.terrain-fallback {
			backdrop-filter: none;
		}
	}

	@media (forced-colors: active) {
		.terrain-stage {
			border: 2px solid CanvasText;
			background: Canvas;
		}

		.terrain-stage :global(canvas),
		.terrain-poster,
		.terrain-readout {
			display: none;
		}

		.terrain-fallback,
		.terrain-loading,
		.height-mapping,
		.terrain-detail {
			background: Canvas;
			color: CanvasText;
			forced-color-adjust: none;
		}
	}
</style>
