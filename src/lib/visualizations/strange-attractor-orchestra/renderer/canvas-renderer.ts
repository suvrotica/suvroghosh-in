import { qualityProfile, surfaceSize, wakeSampleStride } from './quality';
import {
	EVENT_PULSE_OFFSET,
	EVENT_PULSE_STRIDE,
	FEATURE_OFFSET,
	FEATURE_STRIDE,
	POSITION_STRIDE,
	writeRenderLayerMixes,
	writeVisiblePointRange
} from './render-packet';
import type { MutableRenderLayerMixes, MutableVisiblePointRange } from './render-packet';
import type {
	OrchestraQualityTier,
	OrchestraRenderer,
	OrchestraRendererOptions,
	OrchestraRendererStatus,
	OrchestraRenderPacket,
	OrchestraRenderStats,
	OrchestraSurfaceSize
} from './types';

const CANVAS_POINT_CAP = 18_000;
const PATH_BATCH_SIZE = 128;
const EMPTY_DASH: number[] = [];
const RAW_DASH: number[] = [2, 5];
const REGION_DASH: number[] = [5, 3];
const ENGRAVED_DASH: number[] = [1, 3];

type Projection = Readonly<{
	centreX: number;
	centreY: number;
	scale: number;
}>;

type MutableProjection = {
	centreX: number;
	centreY: number;
	scale: number;
};

type MutableRenderStats = {
	readonly kind: 'canvas2d';
	pointCount: number;
	eventCount: number;
	drawCalls: number;
	readonly skipped: false;
};

type MutableSkippedStats = {
	readonly kind: 'canvas2d';
	pointCount: number;
	eventCount: number;
	readonly drawCalls: 0;
	readonly skipped: true;
	reason: 'suspended' | 'disposed' | 'empty';
};

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const amount = clamp01((value - edge0) / Math.max(Number.EPSILON, edge1 - edge0));
	return amount * amount * (3 - 2 * amount);
}

function writeProjection(surface: OrchestraSurfaceSize, target: MutableProjection): void {
	target.centreX = surface.cssWidth * 0.5;
	target.centreY = surface.cssHeight * 0.5;
	target.scale = Math.min(surface.cssWidth, surface.cssHeight) * 0.9;
}

function projectedX(positions: Float32Array, point: number, projection: Projection): number {
	return projection.centreX + (positions[point * POSITION_STRIDE] - 0.5) * projection.scale;
}

function projectedY(positions: Float32Array, point: number, projection: Projection): number {
	return projection.centreY - (positions[point * POSITION_STRIDE + 1] - 0.5) * projection.scale;
}

function rgb(background: readonly [number, number, number] | undefined): string {
	if (!background) return 'rgb(3 5 11)';
	const scale = Math.max(...background) <= 1 ? 255 : 1;
	const red = Math.round(clamp01(background[0] / (scale === 1 ? 255 : 1)) * 255);
	const green = Math.round(clamp01(background[1] / (scale === 1 ? 255 : 1)) * 255);
	const blue = Math.round(clamp01(background[2] / (scale === 1 ? 255 : 1)) * 255);
	return `rgb(${red} ${green} ${blue})`;
}

function restrainedColour(
	noise01: number,
	curvature01: number,
	region: number,
	cache: Map<number, string>
): string {
	const noise = clamp01(noise01);
	const curvature = clamp01(curvature01);
	let red: number;
	let green: number;
	let blue: number;
	if (noise < 0.5) {
		const mix = noise * 2;
		red = 61 + (150 - 61) * mix;
		green = 79 + (97 - 79) * mix;
		blue = 120 + (69 - 120) * mix;
	} else {
		const mix = (noise - 0.5) * 2;
		red = 150 + (92 - 150) * mix;
		green = 97 + (173 - 97) * mix;
		blue = 69 + (178 - 69) * mix;
	}
	const luminance = 0.84 + (Math.max(0, Math.round(region)) % 3) * 0.055;
	red *= luminance;
	green *= luminance;
	blue *= luminance;
	red += (227 - red) * curvature * 0.48;
	green += (222 - green) * curvature * 0.48;
	blue += (199 - blue) * curvature * 0.48;
	const roundedRed = Math.round(red);
	const roundedGreen = Math.round(green);
	const roundedBlue = Math.round(blue);
	const key = (roundedRed << 16) | (roundedGreen << 8) | roundedBlue;
	const cached = cache.get(key);
	if (cached !== undefined) return cached;
	const colour = `rgb(${roundedRed} ${roundedGreen} ${roundedBlue})`;
	cache.set(key, colour);
	return colour;
}

function weatherLuminance(simulationTime: number, noise01: number, region: number): number {
	const phase =
		Math.max(0, Number.isFinite(simulationTime) ? simulationTime : 0) * 0.21 +
		clamp01(noise01) * Math.PI * 2 +
		Math.max(0, Math.round(region)) * 0.73;
	return 0.92 + (0.5 + Math.sin(phase) * 0.5) * 0.14;
}

function feature(packet: Readonly<OrchestraRenderPacket>, point: number, offset: number): number {
	return packet.features[point * FEATURE_STRIDE + offset];
}

function pointStride(count: number): number {
	return Math.max(1, Math.ceil(count / CANVAS_POINT_CAP));
}

export class OrchestraCanvasRenderer implements OrchestraRenderer {
	readonly kind = 'canvas2d' as const;
	private currentStatus: OrchestraRendererStatus = 'ready';
	private quality: OrchestraQualityTier;
	private requestedPixelRatio: number;
	private currentSurface: OrchestraSurfaceSize;
	private readonly background: string;
	private readonly visibleRange: MutableVisiblePointRange = {
		first: 0,
		count: 0,
		endExclusive: 0
	};
	private readonly layerMixes: MutableRenderLayerMixes = { raw: 0, warped: 0, voice: 0 };
	private readonly projectionScratch: MutableProjection = { centreX: 0, centreY: 0, scale: 1 };
	private readonly colourCache = new Map<number, string>();
	private colourGeometryRevision = -1;
	private readonly renderedStats: MutableRenderStats = {
		kind: 'canvas2d',
		pointCount: 0,
		eventCount: 0,
		drawCalls: 0,
		skipped: false
	};
	private readonly skippedFrameStats: MutableSkippedStats = {
		kind: 'canvas2d',
		pointCount: 0,
		eventCount: 0,
		drawCalls: 0,
		skipped: true,
		reason: 'empty'
	};

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly context: CanvasRenderingContext2D,
		private readonly options: OrchestraRendererOptions = {}
	) {
		this.quality = options.quality ?? 'low';
		this.requestedPixelRatio = options.devicePixelRatio ?? 1;
		this.background = rgb(options.background);
		this.currentSurface = surfaceSize(
			canvas.clientWidth || canvas.width || 1,
			canvas.clientHeight || canvas.height || 1,
			this.requestedPixelRatio,
			this.quality
		);
		this.applySurface(this.currentSurface);
		this.notify('ready', 'Canvas 2D trajectory renderer ready.');
	}

	get status(): OrchestraRendererStatus {
		return this.currentStatus;
	}

	get surface(): OrchestraSurfaceSize {
		return this.currentSurface;
	}

	resize(
		cssWidth: number,
		cssHeight: number,
		devicePixelRatio = this.requestedPixelRatio,
		quality = this.quality
	): OrchestraSurfaceSize {
		if (this.currentStatus === 'disposed') return this.currentSurface;
		this.requestedPixelRatio = devicePixelRatio;
		this.quality = quality;
		const next = surfaceSize(cssWidth, cssHeight, devicePixelRatio, quality);
		if (
			next.pixelWidth !== this.currentSurface.pixelWidth ||
			next.pixelHeight !== this.currentSurface.pixelHeight ||
			next.cssWidth !== this.currentSurface.cssWidth ||
			next.cssHeight !== this.currentSurface.cssHeight
		) {
			this.currentSurface = next;
			this.applySurface(next);
		}
		return this.currentSurface;
	}

	render(packet: Readonly<OrchestraRenderPacket>): OrchestraRenderStats {
		if (this.currentStatus !== 'ready') {
			return this.skippedStats(
				packet,
				this.currentStatus === 'disposed' ? 'disposed' : 'suspended'
			);
		}
		if (packet.quality !== this.quality) {
			this.resize(
				this.currentSurface.cssWidth,
				this.currentSurface.cssHeight,
				this.requestedPixelRatio,
				packet.quality
			);
		}

		writeVisiblePointRange(packet, this.visibleRange);
		const range = this.visibleRange;
		this.beginFrame();
		if (range.count <= 0) {
			return this.skippedStats(packet, 'empty');
		}

		writeRenderLayerMixes(packet, this.layerMixes);
		writeProjection(this.currentSurface, this.projectionScratch);
		if (this.colourGeometryRevision !== packet.geometryRevision) {
			this.colourCache.clear();
			this.colourGeometryRevision = packet.geometryRevision;
		}
		const mixes = this.layerMixes;
		const view = this.projectionScratch;
		const stride = pointStride(range.count);
		let drawCalls = 0;
		this.context.save();
		this.context.lineCap = 'round';
		this.context.lineJoin = 'round';
		if (mixes.raw > 0.001) {
			drawCalls += this.drawPath(
				packet,
				packet.rawPositions,
				view,
				range.first,
				range.endExclusive,
				stride,
				mixes.raw,
				true
			);
		}
		if (mixes.warped > 0.001) {
			if (qualityProfile(packet.quality).densityHaze) {
				drawCalls += this.drawDensityHaze(
					packet,
					packet.warpedPositions,
					view,
					range.first,
					range.endExclusive,
					mixes.warped
				);
			}
			if (packet.lens === 'wake') {
				drawCalls += this.drawWake(
					packet,
					packet.warpedPositions,
					view,
					range.first,
					range.endExclusive,
					mixes.warped
				);
			}
			drawCalls += this.drawPath(
				packet,
				packet.warpedPositions,
				view,
				range.first,
				range.endExclusive,
				stride,
				mixes.warped,
				false
			);
			drawCalls += this.drawFeatureMarks(
				packet,
				packet.warpedPositions,
				view,
				range.first,
				range.endExclusive,
				mixes.warped
			);
		}
		if (packet.eventCount > 0 && mixes.voice > 0.001) {
			drawCalls += this.drawEvents(packet, view, mixes.voice);
		}
		this.context.restore();
		this.renderedStats.pointCount = Math.ceil(range.count / stride);
		this.renderedStats.eventCount = packet.eventCount;
		this.renderedStats.drawCalls = drawCalls;
		return this.renderedStats;
	}

	setSuspended(suspended: boolean): void {
		if (this.currentStatus === 'disposed') return;
		this.currentStatus = suspended ? 'suspended' : 'ready';
		this.notify(
			this.currentStatus,
			suspended
				? 'Canvas trajectory rendering suspended offscreen.'
				: 'Canvas trajectory rendering resumed.'
		);
	}

	dispose(): void {
		if (this.currentStatus === 'disposed') return;
		this.currentStatus = 'disposed';
		this.notify('disposed', 'Canvas 2D trajectory renderer disposed.');
	}

	private beginFrame(): void {
		this.context.setTransform(
			this.currentSurface.pixelRatio,
			0,
			0,
			this.currentSurface.pixelRatio,
			0,
			0
		);
		this.context.globalAlpha = 1;
		this.context.fillStyle = this.background;
		this.context.fillRect(0, 0, this.currentSurface.cssWidth, this.currentSurface.cssHeight);
	}

	private drawPath(
		packet: Readonly<OrchestraRenderPacket>,
		positions: Float32Array,
		view: Projection,
		first: number,
		endExclusive: number,
		stride: number,
		layerAlpha: number,
		raw: boolean
	): number {
		let drawCalls = 0;
		let batchStart = first;
		while (batchStart < endExclusive - 1) {
			const batchEnd = Math.min(endExclusive, batchStart + PATH_BATCH_SIZE * stride);
			const sample = Math.min(endExclusive - 1, Math.floor((batchStart + batchEnd) * 0.5));
			const age = feature(packet, sample, FEATURE_OFFSET.age01);
			const noise = feature(packet, sample, FEATURE_OFFSET.noiseValue01);
			const curvature = feature(packet, sample, FEATURE_OFFSET.curvature01);
			const density = feature(packet, sample, FEATURE_OFFSET.density01);
			const region = feature(packet, sample, FEATURE_OFFSET.region);
			this.context.beginPath();
			this.context.moveTo(
				projectedX(positions, batchStart, view),
				projectedY(positions, batchStart, view)
			);
			for (let point = batchStart + stride; point < batchEnd; point += stride) {
				this.context.lineTo(projectedX(positions, point, view), projectedY(positions, point, view));
			}
			const pattern = Math.max(0, Math.round(region)) % 3;
			this.context.setLineDash(
				raw ? RAW_DASH : pattern === 0 ? EMPTY_DASH : pattern === 1 ? REGION_DASH : ENGRAVED_DASH
			);
			this.context.strokeStyle = raw
				? 'rgb(178 183 174)'
				: restrainedColour(noise, curvature, region, this.colourCache);
			this.context.lineWidth = raw ? 0.75 : 0.85 + curvature * 1.8;
			this.context.globalAlpha =
				layerAlpha *
				(0.04 + clamp01(age) * 0.82) *
				(0.78 + clamp01(density) * 0.08) *
				(raw ? 1 : weatherLuminance(packet.simulationTime, noise, region));
			this.context.stroke();
			drawCalls += 1;
			batchStart = Math.max(batchStart + stride, batchEnd - stride);
		}
		this.context.setLineDash(EMPTY_DASH);
		this.context.globalAlpha = 1;
		return drawCalls;
	}

	private drawWake(
		packet: Readonly<OrchestraRenderPacket>,
		positions: Float32Array,
		view: Projection,
		first: number,
		endExclusive: number,
		layerAlpha: number
	): number {
		const stride = wakeSampleStride(endExclusive - first, packet.quality);
		let draws = 0;
		for (let lifeBand = 0; lifeBand < 4; lifeBand += 1) {
			this.context.beginPath();
			let marks = 0;
			for (let point = first; point < endExclusive; point += stride) {
				const age = clamp01(feature(packet, point, FEATURE_OFFSET.age01));
				const noise = clamp01(feature(packet, point, FEATURE_OFFSET.noiseValue01));
				const curvature = clamp01(feature(packet, point, FEATURE_OFFSET.curvature01));
				const density = clamp01(feature(packet, point, FEATURE_OFFSET.density01));
				const curlAngle = clamp01(feature(packet, point, FEATURE_OFFSET.curlAngle01));
				const phaseValue =
					Math.max(0, packet.simulationTime) * 0.071 + point * 0.61803398875 + noise * 0.317;
				const particleAge = phaseValue - Math.floor(phaseValue);
				const particleLife =
					smoothstep(0, 0.12, particleAge) * (1 - smoothstep(0.64, 1, particleAge));
				if (particleLife <= 0.002 || Math.min(3, Math.floor(particleLife * 4)) !== lifeBand) {
					continue;
				}
				const angle = curlAngle * Math.PI * 2;
				const reach = (1.8 + noise * 5.5 + density * 3.5) * particleAge * (0.42 + age * 0.58);
				const radius = 0.45 + curvature * 0.8 + noise * 0.42;
				const x = projectedX(positions, point, view) + Math.cos(angle) * reach;
				const y = projectedY(positions, point, view) + Math.sin(angle) * reach;
				this.context.moveTo(x + radius, y);
				this.context.arc(x, y, radius, 0, Math.PI * 2);
				marks += 1;
			}
			if (marks > 0) {
				this.context.fillStyle =
					lifeBand < 2
						? 'rgb(78 101 133)'
						: lifeBand === 2
							? 'rgb(93 141 146)'
							: 'rgb(183 139 104)';
				this.context.globalAlpha = layerAlpha * (0.018 + lifeBand * 0.02);
				this.context.fill();
				draws += 1;
			}
		}
		this.context.globalAlpha = 1;
		return draws;
	}

	private drawDensityHaze(
		packet: Readonly<OrchestraRenderPacket>,
		positions: Float32Array,
		view: Projection,
		first: number,
		endExclusive: number,
		layerAlpha: number
	): number {
		const budget = Math.max(1, qualityProfile(packet.quality).maxDensitySamples);
		const stride = Math.max(1, Math.ceil((endExclusive - first) / budget));
		let draws = 0;
		for (let band = 1; band <= 4; band += 1) {
			this.context.beginPath();
			let marks = 0;
			for (let point = first; point < endExclusive; point += stride) {
				const density = clamp01(feature(packet, point, FEATURE_OFFSET.density01));
				if (Math.ceil(density * 4) !== band) continue;
				const radius = 2 + density * 8;
				this.context.moveTo(
					projectedX(positions, point, view) + radius,
					projectedY(positions, point, view)
				);
				this.context.arc(
					projectedX(positions, point, view),
					projectedY(positions, point, view),
					radius,
					0,
					Math.PI * 2
				);
				marks += 1;
			}
			if (marks > 0) {
				this.context.fillStyle = band < 3 ? 'rgb(68 79 119)' : 'rgb(75 132 137)';
				this.context.globalAlpha = layerAlpha * (0.016 + band * 0.008);
				this.context.fill();
				draws += 1;
			}
		}
		this.context.globalAlpha = 1;
		return draws;
	}

	private drawFeatureMarks(
		packet: Readonly<OrchestraRenderPacket>,
		positions: Float32Array,
		view: Projection,
		first: number,
		endExclusive: number,
		layerAlpha: number
	): number {
		const profile = qualityProfile(packet.quality);
		const stride = Math.max(1, Math.ceil((endExclusive - first) / profile.maxRecurrenceRings));
		let draws = 0;
		let emitted = 0;
		for (
			let point = first;
			point < endExclusive && emitted < profile.maxRecurrenceRings;
			point += stride
		) {
			const recurrence = clamp01(feature(packet, point, FEATURE_OFFSET.recurrence01));
			const curvature = clamp01(feature(packet, point, FEATURE_OFFSET.curvature01));
			if (recurrence < 0.62 && curvature < 0.76) continue;
			const region = Math.max(0, Math.round(feature(packet, point, FEATURE_OFFSET.region)));
			const x = projectedX(positions, point, view);
			const y = projectedY(positions, point, view);
			const radius = 2.2 + recurrence * 5.2;
			this.context.beginPath();
			if (region % 3 === 0) {
				this.context.arc(x, y, radius, 0, Math.PI * 2);
			} else if (region % 3 === 1) {
				this.context.moveTo(x, y - radius);
				this.context.lineTo(x + radius, y);
				this.context.lineTo(x, y + radius);
				this.context.lineTo(x - radius, y);
				this.context.closePath();
			} else {
				this.context.rect(x - radius, y - radius, radius * 2, radius * 2);
			}
			this.context.strokeStyle = 'rgb(235 226 202)';
			this.context.lineWidth = 0.7 + curvature;
			this.context.globalAlpha = layerAlpha * Math.max(recurrence, curvature) * 0.58;
			this.context.stroke();
			draws += 1;
			emitted += 1;
		}
		this.context.globalAlpha = 1;
		return draws;
	}

	private drawEvents(
		packet: Readonly<OrchestraRenderPacket>,
		view: Projection,
		voiceMix: number
	): number {
		let draws = 0;
		for (let event = 0; event < packet.eventCount; event += 1) {
			const offset = event * EVENT_PULSE_STRIDE;
			const intensity = clamp01(packet.eventPulses[offset + EVENT_PULSE_OFFSET.intensity01]);
			const progress = clamp01(packet.eventPulses[offset + EVENT_PULSE_OFFSET.progress01]);
			if (intensity <= 0 || progress >= 1) continue;
			const x =
				view.centreX + (packet.eventPulses[offset + EVENT_PULSE_OFFSET.x01] - 0.5) * view.scale;
			const y =
				view.centreY - (packet.eventPulses[offset + EVENT_PULSE_OFFSET.y01] - 0.5) * view.scale;
			const cause = Math.max(0, Math.round(packet.eventPulses[offset + EVENT_PULSE_OFFSET.cause]));
			const region = Math.max(
				0,
				Math.round(packet.eventPulses[offset + EVENT_PULSE_OFFSET.region])
			);
			const size = clamp01(packet.eventPulses[offset + EVENT_PULSE_OFFSET.size01]);
			const radius = (4 + size * 8) * (1 + progress * 0.65);
			this.context.beginPath();
			if (cause % 4 < 2) {
				this.context.arc(x, y, radius, 0, Math.PI * 2);
				if (cause % 4 === 1) this.context.arc(x, y, radius * 0.62, 0, Math.PI * 2);
			} else if (cause % 4 === 2) {
				this.context.moveTo(x - radius, y);
				this.context.lineTo(x + radius, y);
				this.context.moveTo(x, y - radius);
				this.context.lineTo(x, y + radius);
			} else {
				this.context.moveTo(x, y - radius);
				this.context.lineTo(x + radius, y);
				this.context.lineTo(x, y + radius);
				this.context.lineTo(x - radius, y);
				this.context.closePath();
			}
			this.context.strokeStyle = region % 2 === 0 ? 'rgb(191 117 79)' : 'rgb(145 199 168)';
			this.context.lineWidth = 1 + intensity * 1.4;
			this.context.globalAlpha = voiceMix * intensity * (1 - progress) * 0.82;
			this.context.stroke();
			draws += 1;
		}
		this.context.globalAlpha = 1;
		return draws;
	}

	private applySurface(surface: OrchestraSurfaceSize): void {
		if (this.canvas.width !== surface.pixelWidth) this.canvas.width = surface.pixelWidth;
		if (this.canvas.height !== surface.pixelHeight) this.canvas.height = surface.pixelHeight;
		this.canvas.style.width = `${surface.cssWidth}px`;
		this.canvas.style.height = `${surface.cssHeight}px`;
	}

	private skippedStats(
		packet: Readonly<OrchestraRenderPacket>,
		reason: MutableSkippedStats['reason']
	): OrchestraRenderStats {
		this.skippedFrameStats.pointCount = reason === 'empty' ? 0 : packet.pointCount;
		this.skippedFrameStats.eventCount = packet.eventCount;
		this.skippedFrameStats.reason = reason;
		return this.skippedFrameStats;
	}

	private notify(status: OrchestraRendererStatus, message: string): void {
		this.options.onStatus?.(status, message);
	}
}

export function createCanvasRenderer(
	canvas: HTMLCanvasElement,
	options: OrchestraRendererOptions = {}
): OrchestraCanvasRenderer {
	const context = canvas.getContext('2d', { alpha: false });
	if (!context) throw new Error('Canvas 2D is unavailable for the orchestra fallback renderer.');
	return new OrchestraCanvasRenderer(canvas, context, options);
}
