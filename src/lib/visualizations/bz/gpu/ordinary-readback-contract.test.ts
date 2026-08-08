import { describe, expect, it } from 'vitest';
import dishStageSource from '../../../components/visualizations/bz/BZDishStage.svelte?raw';
import simulationSource from './simulation.ts?raw';
import telemetrySource from './telemetry.ts?raw';

function between(source: string, start: string, end: string): string {
	const startIndex = source.indexOf(start);
	const endIndex = source.indexOf(end, startIndex + start.length);
	if (startIndex < 0 || endIndex < 0)
		throw new Error(`Could not find contract section ${start}…${end}.`);
	return source.slice(startIndex, endIndex);
}

describe('BZ ordinary GPU readback source contract', () => {
	it('publishes ordinary GPU frames from telemetry and a bounded probe, never readState', () => {
		const publishFrame = between(
			dishStageSource,
			'function publishFrame',
			'function resizeCanvases'
		);
		expect(publishFrame).toContain('gpu.sampleTelemetry(now)');
		expect(publishFrame).toContain('gpu.readPoint(selected)');
		expect(publishFrame).toContain('const field = gpu ? null');
		expect(publishFrame).not.toContain('readState(');
		expect(publishFrame).toContain('now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS');
		expect(publishFrame).toContain('now - lastProbeAt >= PROBE_INTERVAL_MS');
		expect(dishStageSource).toContain('const FRAME_CALLBACK_INTERVAL_MS = 100');
		expect(dishStageSource).toContain('const TELEMETRY_INTERVAL_MS = 300');
		expect(dishStageSource).toContain('const PROBE_INTERVAL_MS = 100');
	});

	it('keeps the full read behind an explicitly labelled export method', () => {
		const snapshot = between(
			dishStageSource,
			'export function snapshot',
			'export function interventions'
		);
		expect(snapshot).toContain("gpu.readState('export')");
		const readState = between(simulationSource, 'readState(reason:', '/** Reads exactly one texel');
		expect(readState).toContain("kind: 'full-field'");
		expect(readState).toContain('reason');
		expect(readState.indexOf('assertBZGpuFullReadReason(reason)')).toBeLessThan(
			readState.indexOf('new Float32Array')
		);
		expect(readState).not.toContain('= true');
	});

	it('uses reductions for numerical inspection instead of silently doing a full read', () => {
		const inspection = between(simulationSource, '\n\tinspectNumerics(', 'estimateTextureMemory()');
		expect(inspection).toContain('sampleTelemetry');
		expect(inspection).not.toContain('readState(');
	});

	it('cleans reduction targets, programs and vertex arrays during normal disposal', () => {
		const destroy = between(telemetrySource, 'destroy(contextLost', 'private runMode');
		expect(destroy).toContain('deleteBZFloatTextureTarget');
		expect(destroy).toContain('deleteVertexArray');
		expect(destroy).toContain('deleteProgram(this.initialProgram)');
		expect(destroy).toContain('deleteProgram(this.reductionProgram)');
		const release = between(
			simulationSource,
			'private releaseGpuResources',
			'private handleContextLost'
		);
		expect(release).toContain('this.telemetryReducer?.destroy()');
		expect(release).toContain('this.telemetryReducer = null');
	});
});
