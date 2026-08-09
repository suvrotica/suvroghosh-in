import { describe, expect, it } from 'vitest';
import { OrchestraCanvasRenderer } from './canvas-renderer';
import { createRenderPacket, fillRenderPacket } from './render-packet';
import type { OrchestraRenderPacketSource } from './types';

type DrawCounters = {
	arc: number;
	arcSignature: number;
	fill: number;
	fillRect: number;
	lineTo: number;
	stroke: number;
	strokeAlphaSignature: number;
};

function packetSource(pointCount = 32): OrchestraRenderPacketSource {
	const raw = new Float64Array(pointCount * 3);
	const warped = new Float64Array(pointCount * 3);
	const noise = new Float64Array(pointCount);
	const curvature = new Float64Array(pointCount);
	const density = new Float64Array(pointCount);
	const recurrence = new Float64Array(pointCount);
	const curlAngle = new Float64Array(pointCount);
	const region = new Uint8Array(pointCount);
	for (let point = 0; point < pointCount; point += 1) {
		const progress = point / Math.max(1, pointCount - 1);
		const offset = point * 3;
		raw[offset] = 0.12 + progress * 0.76;
		raw[offset + 1] = 0.5 + Math.sin(progress * Math.PI * 4) * 0.24;
		raw[offset + 2] = 0.5;
		warped[offset] = Math.min(0.96, raw[offset] + Math.sin(progress * 7) * 0.035);
		warped[offset + 1] = Math.min(0.96, Math.max(0.04, raw[offset + 1] + 0.025));
		warped[offset + 2] = 0.5;
		noise[point] = progress;
		curvature[point] = point % 7 === 0 ? 0.9 : 0.25;
		density[point] = 0.35 + (point % 4) * 0.15;
		recurrence[point] = point % 9 === 0 ? 0.92 : 0.1;
		curlAngle[point] = progress;
		region[point] = point % 3;
	}
	return {
		rawPositions: raw,
		warpedPositions: warped,
		pointCount,
		features: {
			noiseValue01: noise,
			curvature01: curvature,
			density01: density,
			recurrence01: recurrence,
			curlAngle01: curlAngle,
			region
		},
		view: 'braided',
		lens: 'warp',
		quality: 'high'
	};
}

function harness() {
	const counters: DrawCounters = {
		arc: 0,
		arcSignature: 0,
		fill: 0,
		fillRect: 0,
		lineTo: 0,
		stroke: 0,
		strokeAlphaSignature: 0
	};
	const contextObject = {
		arc: (x: number, y: number, radius: number) => {
			counters.arc += 1;
			counters.arcSignature += x * 0.17 + y * 0.31 + radius * 0.53;
		},
		beginPath: () => undefined,
		closePath: () => undefined,
		fill: () => {
			counters.fill += 1;
		},
		fillRect: () => {
			counters.fillRect += 1;
		},
		fillStyle: '',
		globalAlpha: 1,
		lineCap: 'round',
		lineJoin: 'round',
		lineTo: () => {
			counters.lineTo += 1;
		},
		lineWidth: 1,
		moveTo: () => undefined,
		rect: () => undefined,
		restore: () => undefined,
		save: () => undefined,
		setLineDash: () => undefined,
		setTransform: () => undefined,
		stroke: () => {
			counters.stroke += 1;
			counters.strokeAlphaSignature += contextObject.globalAlpha;
		},
		strokeStyle: ''
	};
	const context = contextObject as unknown as CanvasRenderingContext2D;
	const canvas = {
		clientHeight: 600,
		clientWidth: 800,
		height: 0,
		style: { height: '', width: '' },
		width: 0
	} as unknown as HTMLCanvasElement;
	const renderer = new OrchestraCanvasRenderer(canvas, context, {
		devicePixelRatio: 3,
		quality: 'high'
	});
	return { canvas, counters, renderer };
}

function reset(counters: DrawCounters): void {
	counters.arc = 0;
	counters.arcSignature = 0;
	counters.fill = 0;
	counters.fillRect = 0;
	counters.lineTo = 0;
	counters.stroke = 0;
	counters.strokeAlphaSignature = 0;
}

describe('orchestra Canvas 2D fallback', () => {
	it('draws visible [0, 1] geometry in raw, noise, and braided modes at capped DPR', () => {
		const { canvas, counters, renderer } = harness();
		const packet = createRenderPacket({ pointCapacity: 64, quality: 'high' });
		fillRenderPacket(packet, packetSource());
		expect(renderer.surface.pixelRatio).toBe(1.5);
		expect(canvas.width).toBe(1_200);

		for (const view of ['raw', 'noise', 'braided'] as const) {
			reset(counters);
			packet.view = view;
			const stats = renderer.render(packet);
			expect(stats.skipped).toBe(false);
			expect(stats.drawCalls).toBeGreaterThan(0);
			expect(counters.fillRect).toBe(1);
			expect(counters.lineTo).toBeGreaterThan(0);
			expect(counters.stroke).toBeGreaterThan(0);
		}
	});

	it('adds bounded deterministic Wake marks without changing packet channels', () => {
		const { counters, renderer } = harness();
		const packet = createRenderPacket({ pointCapacity: 64, quality: 'high' });
		const source = packetSource();
		fillRenderPacket(packet, {
			...source,
			view: 'noise',
			features: {
				...source.features,
				curvature01: new Float64Array(32),
				density01: new Float64Array(32),
				recurrence01: new Float64Array(32)
			}
		});
		const rawBefore = packet.rawPositions.slice();
		const warpedBefore = packet.warpedPositions.slice();
		const featuresBefore = packet.features.slice();

		packet.lens = 'warp';
		const ordinaryDrawCalls = renderer.render(packet).drawCalls;
		reset(counters);
		packet.lens = 'wake';
		const firstWakeDrawCalls = renderer.render(packet).drawCalls;
		const firstWakeArcs = counters.arc;
		const firstWakeSignature = counters.arcSignature;
		reset(counters);
		const secondWakeDrawCalls = renderer.render(packet).drawCalls;
		const secondWakeSignature = counters.arcSignature;
		reset(counters);
		packet.simulationTime += 0.25;
		renderer.render(packet);
		const advancedWakeSignature = counters.arcSignature;

		expect(firstWakeDrawCalls).toBeGreaterThan(ordinaryDrawCalls);
		expect(secondWakeDrawCalls).toBe(firstWakeDrawCalls);
		expect(firstWakeArcs).toBeGreaterThan(0);
		expect(firstWakeArcs).toBeLessThanOrEqual(512);
		expect(secondWakeSignature).toBeCloseTo(firstWakeSignature, 8);
		expect(advancedWakeSignature).not.toBeCloseTo(firstWakeSignature, 4);
		expect(packet.rawPositions).toEqual(rawBefore);
		expect(packet.warpedPositions).toEqual(warpedBefore);
		expect(packet.features).toEqual(featuresBefore);
	});

	it('deterministically phases weather luminance while leaving the raw orbit unchanged', () => {
		const { counters, renderer } = harness();
		const packet = createRenderPacket({ pointCapacity: 64, quality: 'high' });
		fillRenderPacket(packet, { ...packetSource(), view: 'noise', lens: 'warp' });

		packet.simulationTime = 20;
		const firstStats = renderer.render(packet);
		const firstWeatherSignature = counters.strokeAlphaSignature;
		reset(counters);
		const secondStats = renderer.render(packet);
		const repeatedWeatherSignature = counters.strokeAlphaSignature;
		reset(counters);
		packet.simulationTime += 4;
		renderer.render(packet);
		const shiftedWeatherSignature = counters.strokeAlphaSignature;

		expect(secondStats).toBe(firstStats);
		expect(repeatedWeatherSignature).toBeCloseTo(firstWeatherSignature, 10);
		expect(shiftedWeatherSignature).not.toBeCloseTo(firstWeatherSignature, 5);

		packet.view = 'raw';
		packet.simulationTime = 20;
		reset(counters);
		renderer.render(packet);
		const firstRawSignature = counters.strokeAlphaSignature;
		packet.simulationTime += 4;
		reset(counters);
		renderer.render(packet);
		expect(counters.strokeAlphaSignature).toBeCloseTo(firstRawSignature, 10);
	});

	it('skips drawing while suspended and resumes from the same packet', () => {
		const { renderer } = harness();
		const packet = createRenderPacket({ pointCapacity: 64 });
		fillRenderPacket(packet, packetSource());
		renderer.setSuspended(true);
		expect(renderer.render(packet)).toMatchObject({ skipped: true, reason: 'suspended' });
		renderer.setSuspended(false);
		expect(renderer.render(packet).skipped).toBe(false);
	});
});
