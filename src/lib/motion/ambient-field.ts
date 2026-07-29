import { createRouteRandom } from './seed';
import {
	isCompactAmbientSurface,
	resolveAmbientFrameRate,
	resolveAmbientPixelRatio
} from './quality';
import type { MotionIntensity, ResolvedMotion, RouteBiome } from './types';

export type AmbientFieldState = 'off' | 'paused' | 'running';

export interface AmbientFieldOptions {
	pathname: string;
	biome: RouteBiome;
	intensity: MotionIntensity;
	motion: ResolvedMotion;
	active?: boolean;
}

export interface AmbientFieldController {
	update(options: AmbientFieldOptions): void;
	destroy(): void;
}

type AmbientNode = {
	baseX: number;
	baseY: number;
	amplitudeX: number;
	amplitudeY: number;
	phase: number;
	speed: number;
	radius: number;
};

type AmbientEdge = {
	from: number;
	to: number;
	controlX: number;
	controlY: number;
	phase: number;
};

type AmbientPulse = {
	edge: number;
	offset: number;
	speed: number;
	radius: number;
};

type Dialect = {
	desktopNodes: number;
	mobileNodes: number;
	linksPerNode: number;
	pulses: number;
	curve: number;
	drift: number;
	speed: number;
	nodeScale: number;
};

const DIALECTS: Record<Exclude<RouteBiome, 'off'>, Dialect> = {
	home: {
		desktopNodes: 40,
		mobileNodes: 20,
		linksPerNode: 1.25,
		pulses: 3,
		curve: 0.34,
		drift: 1,
		speed: 1,
		nodeScale: 1
	},
	writing: {
		desktopNodes: 28,
		mobileNodes: 14,
		linksPerNode: 0.8,
		pulses: 2,
		curve: 0.54,
		drift: 0.82,
		speed: 0.72,
		nodeScale: 0.82
	},
	healthcare: {
		desktopNodes: 36,
		mobileNodes: 18,
		linksPerNode: 1.15,
		pulses: 3,
		curve: 0.18,
		drift: 0.54,
		speed: 0.9,
		nodeScale: 0.94
	},
	calcutta: {
		desktopNodes: 30,
		mobileNodes: 15,
		linksPerNode: 0.9,
		pulses: 2,
		curve: 0.62,
		drift: 0.76,
		speed: 0.68,
		nodeScale: 0.9
	},
	lab: {
		desktopNodes: 34,
		mobileNodes: 17,
		linksPerNode: 1.05,
		pulses: 3,
		curve: 0.44,
		drift: 0.68,
		speed: 0.9,
		nodeScale: 0.9
	},
	notes: {
		desktopNodes: 20,
		mobileNodes: 12,
		linksPerNode: 0.55,
		pulses: 1,
		curve: 0.48,
		drift: 0.48,
		speed: 0.5,
		nodeScale: 0.72
	},
	quiet: {
		desktopNodes: 16,
		mobileNodes: 10,
		linksPerNode: 0.42,
		pulses: 1,
		curve: 0.42,
		drift: 0.36,
		speed: 0.38,
		nodeScale: 0.66
	}
};

const INTENSITY_DENSITY: Record<MotionIntensity, number> = {
	off: 0,
	minimal: 0.52,
	quiet: 0.72,
	'header-only': 0.58,
	standard: 1
};

function dialectFor(biome: RouteBiome): Dialect {
	return biome === 'off' ? DIALECTS.quiet : DIALECTS[biome];
}

function sameGraph(left: AmbientFieldOptions, right: AmbientFieldOptions): boolean {
	return (
		left.pathname === right.pathname &&
		left.biome === right.biome &&
		left.intensity === right.intensity &&
		left.motion === right.motion
	);
}

export function createAmbientField(
	canvas: HTMLCanvasElement,
	initialOptions: AmbientFieldOptions
): AmbientFieldController {
	const context = canvas.getContext('2d', { alpha: true });
	let options = { ...initialOptions };
	let nodes: AmbientNode[] = [];
	let edges: AmbientEdge[] = [];
	let pulses: AmbientPulse[] = [];
	let drawX = new Float32Array(0);
	let drawY = new Float32Array(0);
	let width = 0;
	let height = 0;
	let pixelRatio = 1;
	let elapsed = 0;
	let previousTimestamp = 0;
	let previousDrawTimestamp = 0;
	let frameId = 0;
	let state: AmbientFieldState | null = null;
	let lineColour = '';
	let nodeColour = '';
	let pulseColour = '';
	let destroyed = false;

	const coarsePointerQuery = window.matchMedia('(pointer: coarse)');
	let coarsePointer = coarsePointerQuery.matches;

	function setState(nextState: AmbientFieldState) {
		if (state === nextState) return;
		state = nextState;
		canvas.dataset.ambientState = nextState;
	}

	function canvasAcceptsColour(value: string): boolean {
		if (
			!context ||
			!value ||
			typeof CSS === 'undefined' ||
			typeof CSS.supports !== 'function' ||
			!CSS.supports('color', value)
		) {
			return false;
		}

		const previous = context.fillStyle;
		context.fillStyle = '#010203';
		const sentinel = context.fillStyle;
		context.fillStyle = value;
		const accepted = context.fillStyle !== sentinel;
		context.fillStyle = previous;
		return accepted;
	}

	function canvasColour(styles: CSSStyleDeclaration, property: string, fallback: string): string {
		const candidate = styles.getPropertyValue(property).trim();
		return canvasAcceptsColour(candidate) ? candidate : fallback;
	}

	function refreshPalette() {
		const styles = getComputedStyle(canvas);
		lineColour = canvasColour(styles, '--ambient-line', styles.color);
		nodeColour = canvasColour(styles, '--ambient-node', styles.borderTopColor || styles.color);
		pulseColour = canvasColour(styles, '--ambient-pulse', styles.outlineColor || styles.color);
	}

	function canAnimate() {
		return (
			!destroyed &&
			context !== null &&
			options.active !== false &&
			options.biome !== 'off' &&
			options.intensity !== 'off' &&
			options.motion !== 'still' &&
			width > 0 &&
			height > 0
		);
	}

	function rebuildGraph(resetTimeline = false) {
		if (!context || width <= 0 || height <= 0) return;

		if (options.biome === 'off' || options.intensity === 'off') {
			nodes = [];
			edges = [];
			pulses = [];
			drawX = new Float32Array(0);
			drawY = new Float32Array(0);
			context.clearRect(0, 0, width, height);
			return;
		}

		const dialect = dialectFor(options.biome);
		const random = createRouteRandom(options.pathname, options.biome);
		const mobile = isCompactAmbientSurface(width, coarsePointer);
		const density = INTENSITY_DENSITY[options.intensity] * (options.motion === 'alive' ? 1.12 : 1);
		const nodeCount = Math.max(
			8,
			Math.round((mobile ? dialect.mobileNodes : dialect.desktopNodes) * density)
		);
		const nextNodes: AmbientNode[] = [];
		const healthcareColumns = Math.max(3, Math.round(Math.sqrt(nodeCount * 1.5)));
		const healthcareRows = Math.max(3, Math.ceil(nodeCount / healthcareColumns));

		for (let index = 0; index < nodeCount; index += 1) {
			let baseX = (0.04 + random() * 0.92) * width;
			let baseY = (0.03 + random() * 0.94) * height;

			if (options.biome === 'healthcare') {
				const column = index % healthcareColumns;
				const row = Math.floor(index / healthcareColumns);
				baseX = ((column + 0.42 + (random() - 0.5) * 0.16) / healthcareColumns) * width;
				baseY = ((row + 0.5 + (random() - 0.5) * 0.14) / healthcareRows) * height;
			}

			nextNodes.push({
				baseX,
				baseY,
				amplitudeX: (2.5 + random() * 6.5) * dialect.drift,
				amplitudeY: (2 + random() * 5.5) * dialect.drift,
				phase: random() * Math.PI * 2,
				speed: (0.035 + random() * 0.055) * dialect.speed,
				radius: (0.7 + random() * 1.45) * dialect.nodeScale
			});
		}

		const minimumEdges = options.biome === 'quiet' ? 2 : 4;
		const edgeCount = Math.max(minimumEdges, Math.round(nodeCount * dialect.linksPerNode));
		const nextEdges: AmbientEdge[] = [];
		for (let index = 0; index < edgeCount; index += 1) {
			const from = index % nodeCount;
			const minimumStride =
				options.biome === 'writing' || options.biome === 'calcutta'
					? Math.max(3, Math.floor(nodeCount * 0.24))
					: 2;
			const stride = minimumStride + Math.floor(random() * Math.max(2, nodeCount * 0.42));
			const to = (from + stride) % nodeCount;
			const fromNode = nextNodes[from];
			const toNode = nextNodes[to];
			const midX = (fromNode.baseX + toNode.baseX) * 0.5;
			const midY = (fromNode.baseY + toNode.baseY) * 0.5;
			const perpendicularX = toNode.baseY - fromNode.baseY;
			const perpendicularY = fromNode.baseX - toNode.baseX;
			const curveDirection = random() > 0.5 ? 1 : -1;
			const curveAmount = (0.05 + random() * dialect.curve) * curveDirection;

			nextEdges.push({
				from,
				to,
				controlX: midX + perpendicularX * curveAmount,
				controlY: midY + perpendicularY * curveAmount,
				phase: random() * Math.PI * 2
			});
		}

		const pulseCount =
			options.intensity === 'minimal'
				? 0
				: Math.min(
						nextEdges.length,
						Math.max(
							1,
							Math.round(dialect.pulses * density * (options.motion === 'alive' ? 1.25 : 1))
						)
					);
		const nextPulses: AmbientPulse[] = [];
		for (let index = 0; index < pulseCount; index += 1) {
			nextPulses.push({
				edge: Math.floor(random() * nextEdges.length),
				offset: random(),
				speed: (0.015 + random() * 0.022) * dialect.speed,
				radius: 1.2 + random() * 1.6
			});
		}

		nodes = nextNodes;
		edges = nextEdges;
		pulses = nextPulses;
		drawX = new Float32Array(nodes.length);
		drawY = new Float32Array(nodes.length);
		if (resetTimeline) elapsed = 0;
		previousTimestamp = 0;
		previousDrawTimestamp = 0;
	}

	function resize(): boolean {
		if (destroyed) return false;
		const bounds = canvas.getBoundingClientRect();
		const nextWidth = Math.max(1, Math.round(bounds.width));
		const nextHeight = Math.max(1, Math.round(bounds.height));
		const nextPixelRatio = resolveAmbientPixelRatio({
			width: nextWidth,
			height: nextHeight,
			devicePixelRatio: window.devicePixelRatio,
			coarsePointer
		});
		const frameRate = resolveAmbientFrameRate(options.motion, nextWidth, coarsePointer);
		canvas.dataset.ambientFrameCap = String(frameRate);

		if (nextWidth === width && nextHeight === height && nextPixelRatio === pixelRatio) {
			canvas.dataset.ambientBackingPixels = String(canvas.width * canvas.height);
			return false;
		}

		width = nextWidth;
		height = nextHeight;
		pixelRatio = nextPixelRatio;
		canvas.width = Math.max(1, Math.floor(width * pixelRatio));
		canvas.height = Math.max(1, Math.floor(height * pixelRatio));
		canvas.dataset.ambientBackingPixels = String(canvas.width * canvas.height);
		context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
		rebuildGraph();
		schedule();
		return true;
	}

	function drawDialectAccents(dialect: Dialect) {
		if (!context) return;
		context.save();
		context.strokeStyle = lineColour;
		context.globalAlpha = options.motion === 'alive' ? 0.12 : 0.08;
		context.lineWidth = 0.65;

		if (options.biome === 'lab') {
			const centreX = width * 0.74;
			const centreY = height * 0.28;
			const baseRadius = Math.min(width, height) * 0.13;
			for (let index = 0; index < 3; index += 1) {
				context.beginPath();
				context.arc(
					centreX,
					centreY,
					baseRadius * (1 + index * 0.46),
					0.35 + index * 0.24,
					Math.PI * (1.35 + index * 0.08)
				);
				context.stroke();
			}
		} else if (options.biome === 'calcutta') {
			for (let index = 0; index < 4; index += 1) {
				const x = width * (0.12 + index * 0.24);
				context.beginPath();
				context.moveTo(x, -height * 0.06);
				context.bezierCurveTo(
					x - width * 0.08,
					height * 0.28,
					x + width * 0.1,
					height * 0.62,
					x - width * 0.03,
					height * 1.05
				);
				context.stroke();
			}
		} else if (options.biome === 'home') {
			const radius = Math.min(width, height) * 0.34;
			context.beginPath();
			context.arc(width * 0.82, height * 0.16, radius, 0.62, Math.PI * 1.56);
			context.stroke();
		} else if (options.biome === 'writing') {
			context.beginPath();
			context.moveTo(-width * 0.04, height * 0.68);
			context.bezierCurveTo(
				width * 0.28,
				height * 0.46,
				width * 0.58,
				height * 0.84,
				width * 1.04,
				height * 0.54
			);
			context.stroke();
		}

		context.restore();
		context.lineWidth = dialect.nodeScale;
	}

	function render() {
		if (!context) return;
		const dialect = dialectFor(options.biome);

		context.clearRect(0, 0, width, height);
		drawDialectAccents(dialect);

		for (let index = 0; index < nodes.length; index += 1) {
			const node = nodes[index];
			drawX[index] = node.baseX + Math.sin(elapsed * node.speed + node.phase) * node.amplitudeX;
			drawY[index] =
				node.baseY + Math.cos(elapsed * node.speed * 0.82 + node.phase) * node.amplitudeY;
		}

		context.strokeStyle = lineColour;
		context.lineWidth = options.biome === 'healthcare' ? 0.8 : 0.65;
		context.lineCap = 'round';
		for (let index = 0; index < edges.length; index += 1) {
			const edge = edges[index];
			const opacityBreath = 0.5 + Math.sin(elapsed * 0.035 + edge.phase) * 0.18;
			context.globalAlpha =
				(options.motion === 'alive' ? 0.22 : 0.16) * Math.max(0.28, opacityBreath);
			context.beginPath();
			context.moveTo(drawX[edge.from], drawY[edge.from]);
			context.quadraticCurveTo(edge.controlX, edge.controlY, drawX[edge.to], drawY[edge.to]);
			context.stroke();
		}

		context.fillStyle = nodeColour;
		context.globalAlpha = options.motion === 'alive' ? 0.44 : 0.34;
		for (let index = 0; index < nodes.length; index += 1) {
			context.beginPath();
			context.arc(drawX[index], drawY[index], nodes[index].radius, 0, Math.PI * 2);
			context.fill();
		}

		context.fillStyle = pulseColour;
		context.globalAlpha = options.motion === 'alive' ? 0.74 : 0.58;
		for (let index = 0; index < pulses.length; index += 1) {
			const pulse = pulses[index];
			const edge = edges[pulse.edge];
			if (!edge) continue;
			const t = (pulse.offset + elapsed * pulse.speed) % 1;
			const inverse = 1 - t;
			const x =
				inverse * inverse * drawX[edge.from] +
				2 * inverse * t * edge.controlX +
				t * t * drawX[edge.to];
			const y =
				inverse * inverse * drawY[edge.from] +
				2 * inverse * t * edge.controlY +
				t * t * drawY[edge.to];
			context.beginPath();
			context.arc(x, y, pulse.radius, 0, Math.PI * 2);
			context.fill();
		}

		context.globalAlpha = 1;
	}

	function frame(timestamp: number) {
		frameId = 0;
		if (!canAnimate()) {
			setState(context ? 'paused' : 'off');
			previousTimestamp = 0;
			return;
		}

		const frameRate = resolveAmbientFrameRate(options.motion, width, coarsePointer);
		const frameInterval = frameRate > 0 ? 1000 / frameRate : 0;
		if (frameInterval > 0 && timestamp - previousDrawTimestamp < frameInterval) {
			frameId = requestAnimationFrame(frame);
			return;
		}

		const delta =
			previousTimestamp === 0
				? 0
				: Math.min(Math.max((timestamp - previousTimestamp) / 1000, 0), 0.05);
		previousTimestamp = timestamp;
		previousDrawTimestamp = timestamp;
		elapsed += delta;
		render();
		setState('running');
		frameId = requestAnimationFrame(frame);
	}

	function schedule() {
		if (!canAnimate()) {
			if (frameId !== 0) cancelAnimationFrame(frameId);
			frameId = 0;
			previousTimestamp = 0;
			setState(context ? 'paused' : 'off');
			return;
		}

		if (frameId === 0) frameId = requestAnimationFrame(frame);
	}

	function handleMediaChange() {
		const pointerChanged = coarsePointer !== coarsePointerQuery.matches;
		coarsePointer = coarsePointerQuery.matches;
		const resized = resize();
		if (pointerChanged && !resized) rebuildGraph();
		schedule();
	}

	const rootObserver =
		typeof MutationObserver === 'undefined'
			? null
			: new MutationObserver(() => {
					refreshPalette();
				});
	rootObserver?.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['class', 'data-theme']
	});

	window.addEventListener('resize', resize, { passive: true });
	coarsePointerQuery.addEventListener('change', handleMediaChange);

	refreshPalette();
	resize();
	schedule();

	return {
		update(nextOptions) {
			if (destroyed) return;
			const rebuild = !sameGraph(options, nextOptions);
			const routeChanged =
				options.pathname !== nextOptions.pathname || options.biome !== nextOptions.biome;
			options = { ...nextOptions };
			refreshPalette();
			canvas.dataset.ambientFrameCap = String(
				resolveAmbientFrameRate(options.motion, width, coarsePointer)
			);
			if (rebuild) rebuildGraph(routeChanged);
			schedule();
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			if (frameId !== 0) cancelAnimationFrame(frameId);
			frameId = 0;
			rootObserver?.disconnect();
			window.removeEventListener('resize', resize);
			coarsePointerQuery.removeEventListener('change', handleMediaChange);
			setState('off');
		}
	};
}
