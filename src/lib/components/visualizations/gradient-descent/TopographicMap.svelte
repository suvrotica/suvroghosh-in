<script lang="ts">
	import { onMount } from 'svelte';
	import type { HeightMapping } from '$lib/visualizations/gradient-descent';
	import { normalizeLossForDisplay } from '$lib/visualizations/gradient-descent/loss-display-scale';
	import { contourLevels, marchingSquares } from './marching-squares';
	import {
		clampPoint,
		domainBounds,
		finitePoint,
		minimumPoint,
		objectPoint,
		pointX,
		pointY,
		type BasinGridLike,
		type DomainLike,
		type GradientFieldSample,
		type HistoryRecord,
		type KnownMinimum,
		type ObjectPoint,
		type PointLike,
		type SampledGrid,
		type TerrainRun
	} from './types';

	type Particle =
		| PointLike
		| { readonly point: PointLike; readonly outcome?: number | null; readonly settled?: boolean };

	type Props = {
		grid: SampledGrid | null;
		domain: DomainLike;
		history?: readonly HistoryRecord[];
		runs?: readonly TerrainRun[];
		currentStepIndex?: number;
		transitionProgress?: number;
		start: PointLike;
		defaultStart?: PointLike;
		probe?: PointLike | null;
		knownMinima?: readonly KnownMinimum[];
		gradientField?: readonly GradientFieldSample[];
		basin?: BasinGridLike | null;
		particles?: readonly Particle[];
		parameterLabels?: readonly [string, string];
		heightMapping?: HeightMapping;
		showContours?: boolean;
		showGradientField?: boolean;
		showBasin?: boolean;
		showParticles?: boolean;
		showPathMarkers?: boolean;
		fieldDirection?: 'gradient' | 'descent';
		contourCount?: number;
		editable?: boolean;
		onstartchange?: (point: ObjectPoint) => void;
		onbasinlaunch?: (point: ObjectPoint) => void;
		onprobe?: (point: ObjectPoint) => void;
		lossAt?: (point: ObjectPoint) => number | null;
		onselectstep?: (index: number) => void;
	};

	let {
		grid,
		domain,
		history = [],
		runs = [],
		currentStepIndex = -1,
		transitionProgress = 1,
		start,
		defaultStart,
		probe = null,
		knownMinima = [],
		gradientField = [],
		basin = null,
		particles = [],
		parameterLabels = ['θ₁', 'θ₂'],
		heightMapping = 'log-compressed',
		showContours = true,
		showGradientField = false,
		showBasin = false,
		showParticles = false,
		showPathMarkers = true,
		fieldDirection = 'descent',
		contourCount = 13,
		editable = true,
		onstartchange = () => undefined,
		onbasinlaunch = () => undefined,
		onprobe = () => undefined,
		lossAt = () => null,
		onselectstep = () => undefined
	}: Props = $props();

	let host: HTMLDivElement;
	let baseCanvas: HTMLCanvasElement;
	let overlayCanvas: HTMLCanvasElement;
	let width = 640;
	let height = 520;
	let pixelRatio = 1;
	let mounted = false;
	let baseFrame = 0;
	let overlayFrame = 0;
	let localProbe = $state<ObjectPoint | null>(null);
	let localStart = $state<ObjectPoint | null>(null);
	let pointerMode: 'idle' | 'start' | 'probe' = 'idle';
	let pointerId = -1;
	let lastExternalProbeKey = '';
	let status = $state('Click or drag to place the optimizer. Shift-click probes the loss map.');
	let liveStatus = $state('');
	let pendingPointerAnnouncement = '';
	let announcementTimer = 0;
	let canvasAvailable = $state(true);
	let renderedSize = $state(false);
	let touchEditMode = $state(false);

	const basinColours = ['#5f8f88', '#a96d55', '#8c79a5', '#b39355', '#6f84a6', '#977b67'];
	const runColours = ['#e7bd68', '#75b9b0', '#cc8976', '#b6a0d2', '#b8c979', '#86a7cb'];

	function runColour(run: TerrainRun, fallbackIndex: number): string {
		const canonicalIndex =
			run.id === 'gd'
				? 0
				: run.id === 'momentum'
					? 1
					: run.id === 'rmsprop'
						? 2
						: run.id === 'adam'
							? 3
							: fallbackIndex % runColours.length;
		return runColours[canonicalIndex];
	}

	function currentProbe(): PointLike | null {
		return localProbe ?? probe;
	}

	function sampledLossAt(point: PointLike | null): number | null {
		if (!grid || !point || grid.width < 1 || grid.height < 1 || !finitePoint(point)) return null;
		const bounds = domainBounds(domain);
		const column =
			((pointX(point) - bounds.xMin) / Math.max(Number.EPSILON, bounds.xMax - bounds.xMin)) *
			(grid.width - 1);
		const row =
			((pointY(point) - bounds.yMin) / Math.max(Number.EPSILON, bounds.yMax - bounds.yMin)) *
			(grid.height - 1);
		const x0 = Math.max(0, Math.min(grid.width - 1, Math.floor(column)));
		const y0 = Math.max(0, Math.min(grid.height - 1, Math.floor(row)));
		const x1 = Math.min(grid.width - 1, x0 + 1);
		const y1 = Math.min(grid.height - 1, y0 + 1);
		const tx = Math.max(0, Math.min(1, column - x0));
		const ty = Math.max(0, Math.min(1, row - y0));
		const value = (x: number, y: number) => Number(grid.values[y * grid.width + x]);
		const low = value(x0, y0) * (1 - tx) + value(x1, y0) * tx;
		const high = value(x0, y1) * (1 - tx) + value(x1, y1) * tx;
		const result = low * (1 - ty) + high * ty;
		return Number.isFinite(result) ? result : null;
	}

	function probeReadoutText(): string {
		const point = currentProbe();
		if (!point || !finitePoint(point)) return '';
		const exactLoss = lossAt(objectPoint(point));
		const loss = exactLoss ?? sampledLossAt(point);
		const format = (value: number) =>
			value !== 0 && (Math.abs(value) >= 10_000 || Math.abs(value) < 0.001)
				? value.toExponential(3)
				: value.toLocaleString('en-GB', { maximumFractionDigits: 6 });
		return `${parameterLabels[0]} ${format(pointX(point))} · ${parameterLabels[1]} ${format(pointY(point))} · ${exactLoss === null ? 'sampled fallback L' : 'raw exact L'} ${loss === null ? '—' : format(loss)}`;
	}

	function formatMapValue(value: number | null | undefined): string {
		if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
		return value !== 0 && (Math.abs(value) >= 10_000 || Math.abs(value) < 0.001)
			? value.toExponential(3)
			: value.toLocaleString('en-GB', { maximumFractionDigits: 5 });
	}

	function worldToCanvas(point: PointLike): ObjectPoint {
		const bounds = domainBounds(domain);
		return {
			x:
				((pointX(point) - bounds.xMin) / Math.max(Number.EPSILON, bounds.xMax - bounds.xMin)) *
				width,
			y:
				((bounds.yMax - pointY(point)) / Math.max(Number.EPSILON, bounds.yMax - bounds.yMin)) *
				height
		};
	}

	function canvasToWorld(x: number, y: number): ObjectPoint {
		const bounds = domainBounds(domain);
		return clampPoint(
			{
				x: bounds.xMin + (x / Math.max(1, width)) * (bounds.xMax - bounds.xMin),
				y: bounds.yMax - (y / Math.max(1, height)) * (bounds.yMax - bounds.yMin)
			},
			domain
		);
	}

	function eventPoint(event: PointerEvent): ObjectPoint {
		const rectangle = overlayCanvas.getBoundingClientRect();
		return canvasToWorld(event.clientX - rectangle.left, event.clientY - rectangle.top);
	}

	function palette(name: string, fallback: string): string {
		return getComputedStyle(host).getPropertyValue(name).trim() || fallback;
	}

	function configureContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
		const context = canvas.getContext('2d');
		if (!context) return null;
		context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
		context.lineCap = 'round';
		context.lineJoin = 'round';
		return context;
	}

	function gridPointToCanvas(point: readonly [number, number]): ObjectPoint {
		if (!grid) return { x: 0, y: 0 };
		return {
			x: (point[0] / Math.max(1, grid.width - 1)) * width,
			y: height - (point[1] / Math.max(1, grid.height - 1)) * height
		};
	}

	function drawLossField(context: CanvasRenderingContext2D): void {
		if (!grid || grid.width < 1 || grid.height < 1) return;
		const columnStride = Math.max(1, Math.ceil(grid.width / Math.max(40, Math.floor(width / 5))));
		const rowStride = Math.max(1, Math.ceil(grid.height / Math.max(32, Math.floor(height / 5))));
		const cellWidth = (width * columnStride) / Math.max(1, grid.width - 1);
		const cellHeight = (height * rowStride) / Math.max(1, grid.height - 1);
		for (let row = 0; row < grid.height; row += rowStride) {
			for (let column = 0; column < grid.width; column += columnStride) {
				const value = Number(grid.values[row * grid.width + column]);
				const normalized = Number.isFinite(value)
					? normalizeLossForDisplay(value, grid, heightMapping)
					: 0;
				const lightness = 10 + Math.pow(normalized, 0.56) * 24;
				const saturation = 6 + normalized * 8;
				context.fillStyle = `hsl(155 ${saturation}% ${lightness}%)`;
				context.fillRect(
					(column / Math.max(1, grid.width - 1)) * width,
					height - (row / Math.max(1, grid.height - 1)) * height - cellHeight,
					cellWidth + 1,
					cellHeight + 1
				);
			}
		}
	}

	function basinOutcome(index: number): number | null {
		if (!basin) return null;
		if (basin.outcomes && index < basin.outcomes.length) {
			const outcome = Number(basin.outcomes[index]);
			return Number.isFinite(outcome) && outcome >= 0 ? outcome : null;
		}
		const outcome = basin.cells?.[index]?.minimumIndex;
		return typeof outcome === 'number' && outcome >= 0 ? outcome : null;
	}

	function basinOutcomeKind(index: number): 'destination' | 'escaped' | 'diverged' | 'unresolved' {
		if (basinOutcome(index) !== null) return 'destination';
		const cellStatus = basin?.cells?.[index]?.status;
		if (cellStatus === 'escaped-domain') return 'escaped';
		if (cellStatus === 'numerically-diverged') return 'diverged';
		return 'unresolved';
	}

	function drawDestinationMark(
		context: CanvasRenderingContext2D,
		x: number,
		y: number,
		cellWidth: number,
		cellHeight: number,
		outcome: number,
		markColour: string
	): void {
		const variant = outcome % 4;
		context.strokeStyle = markColour;
		context.fillStyle = context.strokeStyle;
		context.lineWidth = 0.55;
		context.beginPath();
		if (variant === 0) {
			context.arc(
				x + cellWidth / 2,
				y + cellHeight / 2,
				Math.min(1.25, cellWidth / 4),
				0,
				Math.PI * 2
			);
			context.fill();
			return;
		}
		if (variant === 1 || variant === 3) {
			context.moveTo(x, y + cellHeight / 2);
			context.lineTo(x + cellWidth, y + cellHeight / 2);
		}
		if (variant === 2 || variant === 3) {
			context.moveTo(x + cellWidth / 2, y);
			context.lineTo(x + cellWidth / 2, y + cellHeight);
		}
		context.stroke();
	}

	function drawBasins(context: CanvasRenderingContext2D): void {
		if (!showBasin || !basin || basin.width < 1 || basin.height < 1) return;
		const cellWidth = width / basin.width;
		const cellHeight = height / basin.height;
		const styles = getComputedStyle(host);
		const colour = (name: string, fallback: string) =>
			styles.getPropertyValue(name).trim() || fallback;
		const escapedColour = colour('--gd-map-escaped', '#7b5938');
		const divergedColour = colour('--gd-map-diverged', '#773d36');
		const unresolvedColour = colour('--gd-map-unresolved', '#676b65');
		const unresolvedLineColour = colour('--gd-map-unresolved-line', '#d4d0c4');
		const destinationMarkColour = colour('--gd-map-destination-mark', '#17201d');
		context.save();
		context.globalAlpha = 0.46;
		for (let row = 0; row < basin.height; row += 1) {
			for (let column = 0; column < basin.width; column += 1) {
				const cellIndex = row * basin.width + column;
				const outcome = basinOutcome(cellIndex);
				const kind = basinOutcomeKind(cellIndex);
				const x = column * cellWidth;
				const y = height - (row + 1) * cellHeight;
				context.fillStyle =
					outcome !== null
						? basinColours[outcome % basinColours.length]
						: kind === 'escaped'
							? escapedColour
							: kind === 'diverged'
								? divergedColour
								: unresolvedColour;
				context.fillRect(x, y, cellWidth + 1, cellHeight + 1);
				if (outcome !== null) {
					drawDestinationMark(context, x, y, cellWidth, cellHeight, outcome, destinationMarkColour);
				} else {
					context.strokeStyle = unresolvedLineColour;
					context.lineWidth = 0.45;
					context.beginPath();
					if (kind === 'unresolved') {
						context.arc(
							x + cellWidth / 2,
							y + cellHeight / 2,
							Math.min(1.2, cellWidth / 4),
							0,
							Math.PI * 2
						);
					} else {
						context.moveTo(x, y + cellHeight);
						context.lineTo(x + cellWidth, y);
						if (kind === 'diverged') {
							context.moveTo(x, y);
							context.lineTo(x + cellWidth, y + cellHeight);
						}
					}
					context.stroke();
				}
			}
		}
		context.restore();
	}

	function drawContours(context: CanvasRenderingContext2D): void {
		if (!grid || !showContours) return;
		const segments = marchingSquares(grid, contourLevels(grid, contourCount, heightMapping));
		context.save();
		context.strokeStyle = palette('--gd-map-contour', '#d8cfbb');
		context.globalAlpha = 0.46;
		context.lineWidth = 0.85;
		context.beginPath();
		for (const segment of segments) {
			const from = gridPointToCanvas(segment.from);
			const to = gridPointToCanvas(segment.to);
			context.moveTo(from.x, from.y);
			context.lineTo(to.x, to.y);
		}
		context.stroke();
		context.restore();
	}

	function drawAxes(context: CanvasRenderingContext2D): void {
		const bounds = domainBounds(domain);
		context.save();
		context.strokeStyle = palette('--gd-map-grid', 'rgba(216, 207, 187, 0.14)');
		context.lineWidth = 1;
		context.beginPath();
		for (let index = 1; index < 5; index += 1) {
			const x = (index / 5) * width;
			const y = (index / 5) * height;
			context.moveTo(Math.round(x) + 0.5, 0);
			context.lineTo(Math.round(x) + 0.5, height);
			context.moveTo(0, Math.round(y) + 0.5);
			context.lineTo(width, Math.round(y) + 0.5);
		}
		context.stroke();
		context.fillStyle = palette('--gd-map-muted', '#aaa498');
		context.font = '11px ui-monospace, monospace';
		context.textBaseline = 'top';
		context.fillText(bounds.xMin.toPrecision(3), 7, height - 20);
		context.textAlign = 'right';
		context.fillText(bounds.xMax.toPrecision(3), width - 7, height - 20);
		context.textBaseline = 'middle';
		context.fillText(bounds.yMax.toPrecision(3), width - 7, 12);
		context.fillText(bounds.yMin.toPrecision(3), width - 7, height - 33);
		context.restore();
	}

	function drawBase(): void {
		baseFrame = 0;
		if (!mounted) return;
		const context = configureContext(baseCanvas);
		if (!context) {
			canvasAvailable = false;
			return;
		}
		canvasAvailable = true;
		context.clearRect(0, 0, width, height);
		context.fillStyle = palette('--gd-map-background', '#0d1110');
		context.fillRect(0, 0, width, height);
		drawLossField(context);
		drawBasins(context);
		drawAxes(context);
		drawContours(context);
	}

	function drawArrow(
		context: CanvasRenderingContext2D,
		from: ObjectPoint,
		to: ObjectPoint,
		colour: string,
		widthValue = 1.2
	): void {
		const angle = Math.atan2(to.y - from.y, to.x - from.x);
		context.save();
		context.strokeStyle = colour;
		context.fillStyle = colour;
		context.lineWidth = widthValue;
		context.beginPath();
		context.moveTo(from.x, from.y);
		context.lineTo(to.x, to.y);
		context.stroke();
		context.beginPath();
		context.moveTo(to.x, to.y);
		context.lineTo(to.x - Math.cos(angle - 0.55) * 4.2, to.y - Math.sin(angle - 0.55) * 4.2);
		context.lineTo(to.x - Math.cos(angle + 0.55) * 4.2, to.y - Math.sin(angle + 0.55) * 4.2);
		context.closePath();
		context.fill();
		context.restore();
	}

	function drawGradientField(context: CanvasRenderingContext2D): void {
		if (!showGradientField || gradientField.length === 0) return;
		const bounds = domainBounds(domain);
		const span = Math.min(width, height) * 0.038;
		const finiteMagnitudes = gradientField
			.map((sample) => Math.hypot(pointX(sample.gradient), pointY(sample.gradient)))
			.filter((magnitude) => magnitude > 0 && Number.isFinite(magnitude))
			.map((magnitude) => Math.log1p(magnitude));
		const minimumMagnitude = Math.min(...finiteMagnitudes);
		const maximumMagnitude = Math.max(...finiteMagnitudes);
		context.save();
		for (const sample of gradientField) {
			if (!finitePoint(sample.point) || !finitePoint(sample.gradient)) continue;
			const magnitude = Math.hypot(pointX(sample.gradient), pointY(sample.gradient));
			if (!(magnitude > 0)) continue;
			const from = worldToCanvas(sample.point);
			const sign = fieldDirection === 'descent' ? -1 : 1;
			const dx =
				(sign * pointX(sample.gradient) * span) /
				((magnitude * Math.max(Number.EPSILON, bounds.xMax - bounds.xMin)) / width);
			const dy =
				(-sign * pointY(sample.gradient) * span) /
				((magnitude * Math.max(Number.EPSILON, bounds.yMax - bounds.yMin)) / height);
			const scale = span / Math.max(Number.EPSILON, Math.hypot(dx, dy));
			const magnitudeLevel =
				(Math.log1p(magnitude) - minimumMagnitude) /
				Math.max(Number.EPSILON, maximumMagnitude - minimumMagnitude);
			context.globalAlpha = 0.24 + magnitudeLevel * 0.66;
			drawArrow(
				context,
				from,
				{ x: from.x + dx * scale, y: from.y + dy * scale },
				palette('--gd-map-field', '#9cb9ae'),
				0.65 + magnitudeLevel * 1.15
			);
		}
		context.restore();
	}

	function drawHistory(context: CanvasRenderingContext2D): void {
		const records = history.filter((record) => finitePoint(record.theta));
		if (records.length === 0) return;
		const pathColour = palette('--gd-map-active-path', '#f1eadb');
		context.save();
		context.lineWidth = 2.2;
		for (let index = 1; index < records.length; index += 1) {
			const from = worldToCanvas(records[index - 1].theta);
			const to = worldToCanvas(records[index].theta);
			context.globalAlpha = 0.18 + (index / Math.max(1, records.length - 1)) * 0.82;
			context.strokeStyle = pathColour;
			context.beginPath();
			context.moveTo(from.x, from.y);
			context.lineTo(to.x, to.y);
			context.stroke();
			if (showPathMarkers && index % Math.max(1, Math.ceil(records.length / 28)) === 0) {
				context.fillStyle = pathColour;
				context.beginPath();
				context.arc(to.x, to.y, 1.65, 0, Math.PI * 2);
				context.fill();
			}
		}
		const selectedIndex = Math.max(
			0,
			Math.min(records.length - 1, currentStepIndex < 0 ? records.length - 1 : currentStepIndex)
		);
		const selected = records[selectedIndex];
		let selectedPoint = worldToCanvas(selected.theta);
		if (selectedIndex === records.length - 1 && selectedIndex > 0 && transitionProgress < 1) {
			const previousPoint = worldToCanvas(records[selectedIndex - 1].theta);
			const progress = Math.max(0, Math.min(1, transitionProgress));
			selectedPoint = {
				x: previousPoint.x + (selectedPoint.x - previousPoint.x) * progress,
				y: previousPoint.y + (selectedPoint.y - previousPoint.y) * progress
			};
		}
		context.globalAlpha = 1;
		context.fillStyle = pathColour;
		context.strokeStyle = '#0c100f';
		context.lineWidth = 1.4;
		context.beginPath();
		context.moveTo(selectedPoint.x, selectedPoint.y - 6);
		context.lineTo(selectedPoint.x + 6, selectedPoint.y);
		context.lineTo(selectedPoint.x, selectedPoint.y + 6);
		context.lineTo(selectedPoint.x - 6, selectedPoint.y);
		context.closePath();
		context.fill();
		context.stroke();
		context.restore();
	}

	function drawRunMarker(
		context: CanvasRenderingContext2D,
		position: ObjectPoint,
		marker: TerrainRun['marker'],
		colour: string
	): void {
		context.save();
		context.translate(position.x, position.y);
		context.fillStyle = colour;
		context.strokeStyle = '#0c100f';
		context.lineWidth = 1.2;
		context.beginPath();
		if (marker === 'square') context.rect(-4.5, -4.5, 9, 9);
		else if (marker === 'triangle') {
			context.moveTo(0, -5.8);
			context.lineTo(5.4, 4.5);
			context.lineTo(-5.4, 4.5);
			context.closePath();
		} else if (marker === 'circle') context.arc(0, 0, 4.8, 0, Math.PI * 2);
		else {
			context.moveTo(0, -5.5);
			context.lineTo(5.5, 0);
			context.lineTo(0, 5.5);
			context.lineTo(-5.5, 0);
			context.closePath();
		}
		context.fill();
		context.stroke();
		context.restore();
	}

	function drawRaceRuns(context: CanvasRenderingContext2D): void {
		if (runs.length === 0) return;
		context.save();
		for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
			const run = runs[runIndex];
			const records = run.history.filter((record) => finitePoint(record.theta));
			if (records.length === 0) continue;
			const colour = runColour(run, runIndex);
			const dash =
				run.pattern === 'dashed'
					? [8, 5]
					: run.pattern === 'dotted'
						? [2, 4]
						: run.pattern === 'dash-dot'
							? [9, 4, 2, 4]
							: [];
			context.setLineDash(dash);
			context.strokeStyle = colour;
			context.globalAlpha = 0.82;
			context.lineWidth = 1.7;
			context.beginPath();
			for (let index = 0; index < records.length; index += 1) {
				const position = worldToCanvas(records[index].theta);
				if (index === 0) context.moveTo(position.x, position.y);
				else context.lineTo(position.x, position.y);
			}
			context.stroke();
			context.setLineDash([]);
			context.globalAlpha = 1;
			const markerIndex = records.length - 1;
			if (!run.id.startsWith('walker-')) {
				drawRunMarker(context, worldToCanvas(records[markerIndex].theta), run.marker, colour);
			}
		}
		context.restore();
	}

	function particlePoint(particle: Particle): PointLike {
		return 'point' in Object(particle)
			? (particle as { point: PointLike }).point
			: (particle as PointLike);
	}

	function drawParticles(context: CanvasRenderingContext2D): void {
		if (!showParticles || particles.length === 0) return;
		context.save();
		const unclassifiedColour = palette('--gd-particle-unclassified', '#e3d8c2');
		const unresolvedColour = palette('--gd-particle-unresolved', '#292d2a');
		for (let index = 0; index < particles.length; index += 1) {
			const point = particlePoint(particles[index]);
			if (!finitePoint(point)) continue;
			const position = worldToCanvas(point);
			const outcome =
				'outcome' in Object(particles[index])
					? Number((particles[index] as { outcome?: number }).outcome)
					: Number.NaN;
			const settled =
				'settled' in Object(particles[index])
					? Boolean((particles[index] as { settled?: boolean }).settled)
					: false;
			context.fillStyle = Number.isFinite(outcome)
				? basinColours[outcome % basinColours.length]
				: unclassifiedColour;
			context.globalAlpha = settled ? 0.46 : 0.82;
			context.beginPath();
			const outcomeVariant = Number.isFinite(outcome) ? outcome % 4 : -1;
			if (outcomeVariant === 1) context.rect(position.x - 2.1, position.y - 2.1, 4.2, 4.2);
			else if (outcomeVariant === 2) {
				context.moveTo(position.x, position.y - 2.8);
				context.lineTo(position.x + 2.6, position.y + 2.1);
				context.lineTo(position.x - 2.6, position.y + 2.1);
				context.closePath();
			} else if (outcomeVariant === 3) {
				context.moveTo(position.x, position.y - 2.8);
				context.lineTo(position.x + 2.8, position.y);
				context.lineTo(position.x, position.y + 2.8);
				context.lineTo(position.x - 2.8, position.y);
				context.closePath();
			} else context.arc(position.x, position.y, 2.2, 0, Math.PI * 2);
			context.fill();
			if (settled && !Number.isFinite(outcome)) {
				context.strokeStyle = unresolvedColour;
				context.lineWidth = 1;
				context.beginPath();
				context.moveTo(position.x - 2, position.y - 2);
				context.lineTo(position.x + 2, position.y + 2);
				context.moveTo(position.x + 2, position.y - 2);
				context.lineTo(position.x - 2, position.y + 2);
				context.stroke();
			}
		}
		context.restore();
	}

	function drawMinima(context: CanvasRenderingContext2D): void {
		context.save();
		context.font = '10px ui-monospace, monospace';
		context.textBaseline = 'middle';
		for (let index = 0; index < knownMinima.length; index += 1) {
			const point = minimumPoint(knownMinima[index]);
			if (!point || !finitePoint(point)) continue;
			const position = worldToCanvas(point);
			context.strokeStyle = palette('--gd-map-minimum', '#f1e9d9');
			context.fillStyle = palette('--gd-map-label', '#e2dacb');
			context.lineWidth = 1.35;
			context.beginPath();
			context.arc(position.x, position.y, 5.2, 0, Math.PI * 2);
			context.moveTo(position.x - 7, position.y);
			context.lineTo(position.x + 7, position.y);
			context.moveTo(position.x, position.y - 7);
			context.lineTo(position.x, position.y + 7);
			context.stroke();
			if (knownMinima[index].label) {
				context.fillText(knownMinima[index].label ?? '', position.x + 9, position.y - 8);
			}
		}
		context.restore();
	}

	function drawStartAndProbe(context: CanvasRenderingContext2D): void {
		const startPosition = worldToCanvas(localStart ?? start);
		context.save();
		context.fillStyle = palette('--gd-map-start', '#f1eadb');
		context.strokeStyle = '#111514';
		context.lineWidth = 1.4;
		context.beginPath();
		context.moveTo(startPosition.x, startPosition.y - 7);
		context.lineTo(startPosition.x + 6.3, startPosition.y + 5.5);
		context.lineTo(startPosition.x - 6.3, startPosition.y + 5.5);
		context.closePath();
		context.fill();
		context.stroke();

		const selectedProbe = currentProbe();
		if (selectedProbe && finitePoint(selectedProbe)) {
			const probePosition = worldToCanvas(selectedProbe);
			context.strokeStyle = palette('--gd-map-probe', '#75b9b0');
			context.lineWidth = 1;
			context.setLineDash([3, 3]);
			context.beginPath();
			context.moveTo(0, probePosition.y);
			context.lineTo(width, probePosition.y);
			context.moveTo(probePosition.x, 0);
			context.lineTo(probePosition.x, height);
			context.stroke();
			context.lineWidth = 1.7;
			context.beginPath();
			context.arc(probePosition.x, probePosition.y, 7, 0, Math.PI * 2);
			context.stroke();
			context.setLineDash([]);
		}
		context.restore();
	}

	function drawOverlay(): void {
		overlayFrame = 0;
		if (!mounted) return;
		const context = configureContext(overlayCanvas);
		if (!context) {
			canvasAvailable = false;
			return;
		}
		context.clearRect(0, 0, width, height);
		drawGradientField(context);
		drawParticles(context);
		drawRaceRuns(context);
		drawHistory(context);
		drawMinima(context);
		drawStartAndProbe(context);
	}

	function scheduleBase(): void {
		if (!mounted) return;
		cancelAnimationFrame(baseFrame);
		baseFrame = requestAnimationFrame(drawBase);
	}

	function scheduleOverlay(): void {
		if (!mounted) return;
		cancelAnimationFrame(overlayFrame);
		overlayFrame = requestAnimationFrame(drawOverlay);
	}

	function resize(): void {
		const rectangle = host.getBoundingClientRect();
		if (rectangle.width < 1) return;
		renderedSize = true;
		width = Math.max(280, Math.round(rectangle.width));
		height = Math.max(300, Math.round(Math.min(670, Math.max(360, width * 0.76))));
		const compact = width < 620;
		pixelRatio = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.75);
		for (const canvas of [baseCanvas, overlayCanvas]) {
			canvas.width = Math.max(1, Math.round(width * pixelRatio));
			canvas.height = Math.max(1, Math.round(height * pixelRatio));
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
		}
		scheduleBase();
		scheduleOverlay();
	}

	function nearestHistoryIndex(point: ObjectPoint): number {
		let best = -1;
		let bestDistance = 12;
		for (let index = 0; index < history.length; index += 1) {
			if (!finitePoint(history[index].theta)) continue;
			const position = worldToCanvas(history[index].theta);
			const distance = Math.hypot(position.x - point.x, position.y - point.y);
			if (distance < bestDistance) {
				best = index;
				bestDistance = distance;
			}
		}
		return best;
	}

	function queueAnnouncement(message: string): void {
		if (announcementTimer !== 0) window.clearTimeout(announcementTimer);
		// Clearing first lets assistive technology receive the same action again later.
		liveStatus = '';
		announcementTimer = window.setTimeout(() => {
			liveStatus = message;
			announcementTimer = 0;
		}, 140);
	}

	function basinCellAt(
		point: ObjectPoint
	): { start: ObjectPoint; kind: ReturnType<typeof basinOutcomeKind> } | null {
		if (!showBasin || !basin || basin.width < 1 || basin.height < 1) return null;
		const column = Math.max(
			0,
			Math.min(basin.width - 1, Math.floor((point.x / width) * basin.width))
		);
		const rowFromTop = Math.max(
			0,
			Math.min(basin.height - 1, Math.floor((point.y / height) * basin.height))
		);
		const row = basin.height - 1 - rowFromTop;
		const index = row * basin.width + column;
		const storedStart = basin.cells?.[index]?.start;
		const start =
			storedStart && finitePoint(storedStart)
				? objectPoint(storedStart)
				: canvasToWorld(
						((column + 0.5) / basin.width) * width,
						((rowFromTop + 0.5) / basin.height) * height
					);
		return { start, kind: basinOutcomeKind(index) };
	}

	function applyPointer(point: ObjectPoint): void {
		if (pointerMode === 'probe') {
			localProbe = point;
			status = `Probe at ${point.x.toPrecision(4)}, ${point.y.toPrecision(4)}.`;
			pendingPointerAnnouncement = status;
		} else if (pointerMode === 'start' && editable) {
			localStart = point;
			status = `Starting point ${point.x.toPrecision(4)}, ${point.y.toPrecision(4)}.`;
			pendingPointerAnnouncement = status;
		}
		scheduleOverlay();
	}

	function handlePointerDown(event: PointerEvent): void {
		if (event.button !== 0) return;
		if (event.pointerType === 'touch' && !touchEditMode) return;
		overlayCanvas.focus();
		const rectangle = overlayCanvas.getBoundingClientRect();
		const canvasPoint = { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
		const basinCell = !event.shiftKey && !event.altKey ? basinCellAt(canvasPoint) : null;
		if (basinCell) {
			onbasinlaunch(basinCell.start);
			status = `Launched basin cell at ${basinCell.start.x.toPrecision(4)}, ${basinCell.start.y.toPrecision(4)}; surveyed outcome ${basinCell.kind}.`;
			pendingPointerAnnouncement = '';
			queueAnnouncement(status);
			pointerMode = 'idle';
			scheduleOverlay();
			return;
		}
		const nearest = nearestHistoryIndex(canvasPoint);
		if (!event.shiftKey && !event.altKey && nearest >= 0) {
			onselectstep(nearest);
			status = `Selected optimizer step ${history[nearest].iteration}.`;
			pendingPointerAnnouncement = '';
			queueAnnouncement(status);
			pointerMode = 'idle';
			scheduleOverlay();
			return;
		}
		pointerMode = event.shiftKey || event.altKey || !editable ? 'probe' : 'start';
		pointerId = event.pointerId;
		pendingPointerAnnouncement = '';
		localStart = null;
		overlayCanvas.setPointerCapture(event.pointerId);
		applyPointer(eventPoint(event));
	}

	function handlePointerMove(event: PointerEvent): void {
		if (pointerMode === 'idle' || event.pointerId !== pointerId) return;
		applyPointer(eventPoint(event));
	}

	function handlePointerUp(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;
		const finalAnnouncement = pendingPointerAnnouncement;
		const completedMode = pointerMode;
		pointerMode = 'idle';
		pointerId = -1;
		pendingPointerAnnouncement = '';
		if (overlayCanvas.hasPointerCapture(event.pointerId))
			overlayCanvas.releasePointerCapture(event.pointerId);
		if (completedMode === 'start' && localStart) onstartchange(localStart);
		else if (completedMode === 'probe' && localProbe) onprobe(localProbe);
		localStart = null;
		if (finalAnnouncement) queueAnnouncement(finalAnnouncement);
	}

	function handlePointerCancel(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;
		pointerMode = 'idle';
		pointerId = -1;
		pendingPointerAnnouncement = '';
		localStart = null;
		localProbe = probe ? objectPoint(probe) : null;
		if (overlayCanvas.hasPointerCapture(event.pointerId))
			overlayCanvas.releasePointerCapture(event.pointerId);
	}

	function handleKeydown(event: KeyboardEvent): void {
		const bounds = domainBounds(domain);
		const scale = event.shiftKey ? 0.01 : 0.035;
		const stepX = (bounds.xMax - bounds.xMin) * scale;
		const stepY = (bounds.yMax - bounds.yMin) * scale;
		let next = objectPoint(start);
		if (event.key.toLocaleLowerCase('en') === 'l' && showBasin && basin) {
			event.preventDefault();
			const cell = basinCellAt(worldToCanvas(start));
			if (cell) {
				onbasinlaunch(cell.start);
				status = `Launched the focused basin cell at ${cell.start.x.toPrecision(4)}, ${cell.start.y.toPrecision(4)}.`;
				queueAnnouncement(status);
				scheduleOverlay();
			}
			return;
		}
		if (event.key === 'ArrowLeft') next = { ...next, x: next.x - stepX };
		else if (event.key === 'ArrowRight') next = { ...next, x: next.x + stepX };
		else if (event.key === 'ArrowUp') next = { ...next, y: next.y + stepY };
		else if (event.key === 'ArrowDown') next = { ...next, y: next.y - stepY };
		else if (event.key === 'Home' && defaultStart) next = objectPoint(defaultStart);
		else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			localProbe = objectPoint(start);
			onprobe(localProbe);
			status = `Probe fixed at the starting point ${localProbe.x.toPrecision(4)}, ${localProbe.y.toPrecision(4)}.`;
			queueAnnouncement(status);
			scheduleOverlay();
			return;
		} else if (event.key === 'PageUp' && history.length > 0) {
			event.preventDefault();
			onselectstep(Math.max(0, (currentStepIndex < 0 ? history.length - 1 : currentStepIndex) - 1));
			return;
		} else if (event.key === 'PageDown' && history.length > 0) {
			event.preventDefault();
			onselectstep(Math.min(history.length - 1, Math.max(0, currentStepIndex + 1)));
			return;
		} else return;
		event.preventDefault();
		next = clampPoint(next, domain);
		if (editable) onstartchange(next);
		status = `Starting point ${next.x.toPrecision(4)}, ${next.y.toPrecision(4)}.`;
		scheduleOverlay();
	}

	onMount(() => {
		mounted = true;
		const resizeObserver = new ResizeObserver(resize);
		const themeObserver = new MutationObserver(() => {
			scheduleBase();
			scheduleOverlay();
		});
		const touchActionObserver = new MutationObserver(() => {
			const desiredTouchAction = touchEditMode ? 'none' : 'pan-y pinch-zoom';
			if (overlayCanvas.style.touchAction !== desiredTouchAction) {
				overlayCanvas.style.touchAction = desiredTouchAction;
			}
		});
		resizeObserver.observe(host);
		touchActionObserver.observe(overlayCanvas, {
			attributes: true,
			attributeFilter: ['style']
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'data-theme']
		});
		resize();
		return () => {
			mounted = false;
			resizeObserver.disconnect();
			themeObserver.disconnect();
			touchActionObserver.disconnect();
			cancelAnimationFrame(baseFrame);
			cancelAnimationFrame(overlayFrame);
			if (announcementTimer !== 0) window.clearTimeout(announcementTimer);
		};
	});

	$effect(() => {
		void grid;
		void domain;
		void heightMapping;
		void showContours;
		void showBasin;
		void basin;
		void contourCount;
		scheduleBase();
	});

	$effect(() => {
		const nextProbeKey = probe ? `${pointX(probe)}:${pointY(probe)}` : 'none';
		if (nextProbeKey !== lastExternalProbeKey) {
			lastExternalProbeKey = nextProbeKey;
			if (pointerMode === 'idle') localProbe = probe ? objectPoint(probe) : null;
		}
	});

	$effect(() => {
		void history;
		void runs;
		void currentStepIndex;
		void transitionProgress;
		void start;
		void localStart;
		void probe;
		void knownMinima;
		void gradientField;
		void particles;
		void showGradientField;
		void showParticles;
		void showPathMarkers;
		void fieldDirection;
		scheduleOverlay();
	});
</script>

<div
	bind:this={host}
	class="topographic-map"
	class:touch-edit-mode={touchEditMode}
	data-testid="gradient-topographic-map"
	data-render-ready={renderedSize}
>
	<button
		type="button"
		class="touch-edit-toggle"
		aria-pressed={touchEditMode}
		onclick={() => (touchEditMode = !touchEditMode)}
	>
		{touchEditMode ? 'Finish touch editing' : 'Enable touch editing'}
	</button>
	<canvas class="base-canvas" bind:this={baseCanvas} aria-hidden="true"></canvas>
	<canvas
		class="overlay-canvas"
		bind:this={overlayCanvas}
		style:touch-action={touchEditMode ? 'none' : 'pan-y pinch-zoom'}
		tabindex="0"
		aria-label={`Topographic loss map. ${parameterLabels[0]} is horizontal and ${parameterLabels[1]} is vertical. ${showBasin && basin ? 'Click a surveyed basin cell, or press L at the current start, to launch its stored starting point. ' : 'Click or drag to change the starting point. '}Shift-click probes. Click the optimizer trail to select a step. Arrow keys move the start; Enter probes; Page Up and Page Down inspect steps.`}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerCancel}
		onkeydown={handleKeydown}
	>
		Topographic loss map. The accessible run table reports the same optimizer path numerically.
	</canvas>
	<div class="map-label x-label" aria-hidden="true">{parameterLabels[0]}</div>
	<div class="map-label y-label" aria-hidden="true">{parameterLabels[1]}</div>
	{#if probeReadoutText()}
		<output class="local-probe-readout" aria-live="off">
			{probeReadoutText()} · release to pin
		</output>
	{/if}
	<div
		class="map-legend"
		role="group"
		aria-label={`Map colour encodes raw loss from the true floor ${formatMapValue(grid?.rawFloor)} to the robust 97th-percentile display ceiling ${formatMapValue(grid?.displayCeiling)}.`}
	>
		<span>floor · {formatMapValue(grid?.rawFloor)}</span><i aria-hidden="true"></i><span
			>97% ceiling · {formatMapValue(grid?.displayCeiling)}</span
		>
	</div>
	{#if showBasin && basin}
		<div class="basin-key" aria-label="Basin outcome key">
			{#each knownMinima as minimum, index (minimum.id ?? minimum.label ?? index)}
				<span
					><i class={`destination outcome-${index % 4}`}></i>minimum {minimum.label ??
						index + 1}</span
				>
			{/each}
			<span><i class="escaped"></i>escaped domain</span>
			<span><i class="diverged"></i>numerically diverged</span>
			<span><i class="unresolved"></i>budget-limited or unresolved</span>
		</div>
	{/if}
	{#if showGradientField}
		<p class="field-key">
			Arrow direction is literal {fieldDirection === 'descent' ? 'descent' : 'gradient'}; length is
			normalized, while opacity and weight encode log gradient magnitude.
		</p>
	{/if}
	<p class="map-status">{status}</p>
	<p class="sr-only" aria-live="polite" aria-atomic="true">{liveStatus}</p>
	{#if !canvasAvailable}
		<p class="map-fallback" role="alert">
			The topographic canvas could not start. Use the metrics, microscope, and accessible run table
			below.
		</p>
	{/if}
	<noscript>
		<p class="map-fallback">
			The live map requires JavaScript; the article and terrain poster remain.
		</p>
	</noscript>
</div>

<style>
	.topographic-map {
		--gd-map-background: #0d1110;
		--gd-map-grid: rgb(216 207 187 / 14%);
		--gd-map-contour: #d8cfbb;
		--gd-map-muted: #aaa498;
		--gd-map-field: #9cb9ae;
		--gd-map-path: #e7bd68;
		--gd-map-start: #f1eadb;
		--gd-map-probe: #75b9b0;
		--gd-map-minimum: #f1e9d9;
		--gd-map-label: #e2dacb;
		--gd-map-escaped: #7b5938;
		--gd-map-diverged: #773d36;
		--gd-map-unresolved: #676b65;
		--gd-map-unresolved-line: #d4d0c4;
		--gd-map-destination-mark: #17201d;
		position: relative;
		min-width: 0;
		min-height: 22rem;
		overflow: hidden;
		background: var(--gd-map-background);
		color: #e7e0d2;
	}

	canvas {
		display: block;
		width: 100%;
		min-height: 22rem;
	}

	.base-canvas {
		position: relative;
	}

	.overlay-canvas {
		position: absolute;
		z-index: 2;
		inset: 0;
		/* Preserve vertical page scrolling and pinch zoom while retaining tap/horizontal interaction. */
		touch-action: pan-y pinch-zoom;
		cursor: crosshair;
	}

	.touch-edit-mode .overlay-canvas {
		touch-action: none;
	}

	.touch-edit-toggle {
		position: absolute;
		z-index: 6;
		top: 2rem;
		left: 0.6rem;
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

	.overlay-canvas:focus-visible {
		outline: 3px solid #f0cf88;
		outline-offset: -4px;
	}

	.map-label,
	.map-legend,
	.basin-key,
	.map-status,
	.local-probe-readout {
		position: absolute;
		z-index: 3;
		margin: 0;
		color: #cfc7b8;
		font: 0.66rem/1.35 var(--font-mono, monospace);
		pointer-events: none;
	}

	.local-probe-readout {
		left: 0.6rem;
		bottom: 2.2rem;
		max-width: calc(100% - 1.2rem);
		border: 1px solid rgb(117 185 176 / 45%);
		background: rgb(6 12 11 / 88%);
		padding: 0.3rem 0.45rem;
		color: #bce0da;
	}

	.x-label {
		right: 0.55rem;
		bottom: 2.25rem;
	}

	.y-label {
		top: 0.6rem;
		left: 0.65rem;
	}

	.map-legend {
		top: 0.55rem;
		right: 0.6rem;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		border: 1px solid rgb(216 207 187 / 22%);
		background: rgb(7 10 9 / 78%);
		padding: 0.3rem 0.42rem;
	}

	.map-legend i {
		display: block;
		width: 4.5rem;
		height: 0.42rem;
		background: linear-gradient(90deg, hsl(155 6% 10%), hsl(155 14% 34%));
	}
	.basin-key {
		position: absolute;
		z-index: 3;
		top: 2.35rem;
		right: 0.6rem;
		display: grid;
		gap: 0.25rem;
		border: 1px solid rgb(216 207 187 / 22%);
		background: rgb(7 10 9 / 82%);
		padding: 0.35rem 0.45rem;
		color: #d6cec0;
		font: 0.57rem/1.3 var(--font-mono, monospace);
		pointer-events: none;
	}
	.basin-key span {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.basin-key i {
		display: inline-block;
		width: 1.2rem;
		height: 0.65rem;
		border: 1px solid rgb(255 255 255 / 30%);
	}
	.basin-key .destination {
		background: #577a6d;
	}
	.basin-key .outcome-0 {
		background: radial-gradient(circle, #18211e 1.5px, #577a6d 2px);
	}
	.basin-key .outcome-1 {
		background: repeating-linear-gradient(0deg, #577a6d 0 3px, #18211e 3px 4px);
	}
	.basin-key .outcome-2 {
		background: repeating-linear-gradient(90deg, #577a6d 0 3px, #18211e 3px 4px);
	}
	.basin-key .outcome-3 {
		background:
			linear-gradient(90deg, transparent 43%, #18211e 44% 56%, transparent 57%),
			linear-gradient(#577a6d 43%, #18211e 44% 56%, #577a6d 57%);
	}
	.basin-key .escaped {
		background: repeating-linear-gradient(135deg, #7b5938 0 4px, #d3c6a7 4px 5px);
	}
	.basin-key .diverged {
		background:
			linear-gradient(45deg, transparent 43%, #dfc4ba 44% 56%, transparent 57%),
			linear-gradient(-45deg, #773d36 43%, #dfc4ba 44% 56%, #773d36 57%);
	}
	.basin-key .unresolved {
		background: radial-gradient(circle, #d3cec2 1px, #666a64 1.5px) 0 0 / 5px 5px;
	}
	.field-key {
		position: absolute;
		z-index: 3;
		bottom: 2.25rem;
		left: 0.55rem;
		max-width: min(30rem, calc(100% - 1.1rem));
		margin: 0;
		border: 1px solid rgb(216 207 187 / 18%);
		background: rgb(7 10 9 / 82%);
		padding: 0.3rem 0.4rem;
		color: #d3ccbf;
		font: 0.57rem/1.35 var(--font-mono, monospace);
		pointer-events: none;
	}

	.map-status {
		right: 0.5rem;
		bottom: 0.45rem;
		left: 0.5rem;
		overflow: hidden;
		border: 1px solid rgb(216 207 187 / 18%);
		background: rgb(7 10 9 / 82%);
		padding: 0.36rem 0.48rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.map-fallback {
		position: absolute;
		z-index: 5;
		inset: 0;
		display: grid;
		place-content: center;
		margin: 0;
		background: #0d1110;
		padding: 1.5rem;
		color: #e7e0d2;
		text-align: center;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 44rem) {
		.topographic-map,
		canvas {
			min-height: 24rem;
		}

		.map-legend {
			max-width: calc(100% - 1.2rem);
			gap: 0.25rem;
			font-size: 0.5rem;
		}
		.map-legend i {
			width: min(3.5rem, 18vw);
		}
		.basin-key {
			left: 0.55rem;
			right: auto;
		}
	}

	@media (forced-colors: active) {
		.topographic-map {
			border: 2px solid CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		canvas,
		.map-legend {
			forced-color-adjust: none;
		}

		.map-status,
		.map-label,
		.map-legend {
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
