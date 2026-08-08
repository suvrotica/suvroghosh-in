import { BZ_SAFE_LIMITS } from '../constants';
import { assertValidBZFieldState, cloneBZFieldState } from '../initial-conditions';
import {
	assertValidBZIntervention,
	interventionAppliesAtStep,
	orderedBZInterventions
} from '../interventions';
import { recoveredStateForSetup } from '../reactions';
import type { BZFieldState, BZIntervention, BZSetup, ProbeReading } from '../types';
import { assertValidBZSetup, cloneBZSetup } from '../validation';
import type { BZTelemetryFrame } from '../v2-types';
import {
	createBZGpuContext,
	probeBZGpuCapabilities,
	type BZFloatFramebufferFormat,
	type BZGpuCapabilities
} from './capabilities';
import { BZGpuRenderer, type BZGpuActiveMeans, type BZGpuRenderOptions } from './renderer';
import {
	BZGpuReadbackLedger,
	assertBZGpuFullReadReason,
	type BZGpuFullReadReason,
	type BZGpuReadbackAccounting
} from './readback-accounting';
import {
	fullscreenVertexSource,
	interventionFragmentSource,
	mixFragmentSource,
	oregonatorCorrectorFragmentSource,
	oregonatorPredictorFragmentSource,
	schnakenbergCorrectorFragmentSource,
	schnakenbergPredictorFragmentSource
} from './shaders';
import {
	createBZFloatTextureTarget,
	createBZProgram,
	deleteBZFloatTextureTarget,
	requiredBZUniform,
	type BZFloatTextureTarget
} from './webgl-utils';
import { BZGpuTelemetryReducer, type BZGpuTelemetryReduction } from './telemetry';

interface BZProgramSet {
	readonly oregonatorPredictor: WebGLProgram;
	readonly oregonatorCorrector: WebGLProgram;
	readonly schnakenbergPredictor: WebGLProgram;
	readonly schnakenbergCorrector: WebGLProgram;
	readonly intervention: WebGLProgram;
	readonly mix: WebGLProgram;
}

type BZReadbackKind =
	| { readonly kind: 'full-field'; readonly reason: BZGpuFullReadReason }
	| { readonly kind: 'probe' }
	| { readonly kind: 'reduction' };

export interface BZGpuClock {
	readonly step: number;
	readonly modelTime: number;
}

export interface BZGpuPrecision {
	readonly textureFormat: 'RGBA16F' | 'RGBA32F';
	readonly bytesPerComponent: 2 | 4;
	readonly fragmentHighpBits: number;
	readonly fragmentHighpRange: readonly [number, number];
}

export interface BZGpuTextureMemoryEstimate {
	readonly gridSize: number;
	readonly targetCount: 3;
	readonly channelsPerTexel: 4;
	readonly bytesPerComponent: 2 | 4;
	/** Compatibility alias for the three scientific state textures. */
	readonly textureBytes: number;
	readonly scientificTextureBytes: number;
	readonly telemetryTargetCount: number;
	readonly telemetryTextureBytes: number;
	readonly totalTrackedTextureBytes: number;
	readonly caveat: string;
}

export interface BZGpuNumericalInspection extends BZGpuActiveMeans {
	readonly healthy: boolean;
	readonly firstFailureIndex: number | null;
	readonly maximumAbsoluteValue: number;
	readonly activeCells: number;
	readonly finiteActiveCells: number;
	readonly excitationVarianceResolved: boolean;
	readonly meanU: number;
	readonly meanV: number;
	readonly varianceU: number;
	readonly varianceV: number;
	readonly minimumU: number;
	readonly maximumU: number;
	readonly minimumV: number;
	readonly maximumV: number;
	readonly reason: string;
}

export interface BZGpuTelemetrySample extends BZTelemetryFrame {
	readonly inspection: BZGpuNumericalInspection;
	readonly readbacks: BZGpuReadbackAccounting;
	readonly reductionPasses: number;
	readonly reductionReadbacks: number;
}

export interface BZGpuContextRestoration {
	readonly recovered: boolean;
	readonly checkpointStep: number;
	readonly reason: string;
}

export interface BZGpuCallbacks {
	onContextLost?: (clock: BZGpuClock) => void;
	onContextRestored?: (result: BZGpuContextRestoration) => void;
}

export interface BZGpuOptions {
	readonly callbacks?: BZGpuCallbacks;
	readonly contextAttributes?: WebGLContextAttributes;
}

export class BZFloatFramebufferUnavailableError extends Error {
	readonly capabilities: BZGpuCapabilities;

	constructor(capabilities: BZGpuCapabilities) {
		super(capabilities.message);
		this.name = 'BZFloatFramebufferUnavailableError';
		this.capabilities = capabilities;
	}
}

/**
 * Float-only WebGL2 BZ solver. Packed texels are (u, v, active mask, domain
 * mask). Typed-array row zero remains texture row zero; only the display pass
 * flips vertically so CPU row/normalized intervention coordinates are exact.
 */
export class BZGpuEngine {
	readonly canvas: HTMLCanvasElement;
	readonly gl: WebGL2RenderingContext;
	readonly callbacks: BZGpuCallbacks;

	private capabilitiesValue: BZGpuCapabilities;
	private format: BZFloatFramebufferFormat;
	private programs: BZProgramSet | null = null;
	private renderer: BZGpuRenderer | null = null;
	private vao: WebGLVertexArrayObject | null = null;
	private current: BZFloatTextureTarget | null = null;
	private next: BZFloatTextureTarget | null = null;
	private predictor: BZFloatTextureTarget | null = null;
	private telemetryReducer: BZGpuTelemetryReducer | null = null;
	private setup: BZSetup | null = null;
	private stepIndex = 0;
	private elapsedModelTime = 0;
	private contextLost = false;
	private destroyed = false;
	private recoveryState: BZFieldState | null = null;
	private recoverySetup: BZSetup | null = null;
	private recoveryClock: BZGpuClock = { step: 0, modelTime: 0 };
	private activeMeansValue: BZGpuActiveMeans = { u: 0, v: 0 };
	private readonly latestProbeValues: ProbeReading[] = [];
	private readonly readbackLedger = new BZGpuReadbackLedger();

	constructor(canvas: HTMLCanvasElement, options: BZGpuOptions = {}) {
		this.canvas = canvas;
		this.callbacks = options.callbacks ?? {};
		const context = createBZGpuContext(canvas, options.contextAttributes);
		this.gl = context.gl;
		this.capabilitiesValue = context.capabilities;
		if (!context.capabilities.selectedFormat) {
			throw new BZFloatFramebufferUnavailableError(context.capabilities);
		}
		this.format = context.capabilities.selectedFormat;
		canvas.addEventListener('webglcontextlost', this.handleContextLost);
		canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
	}

	get clock(): BZGpuClock {
		return { step: this.stepIndex, modelTime: this.elapsedModelTime };
	}

	get precision(): BZGpuPrecision {
		return {
			textureFormat: this.format.label,
			bytesPerComponent: this.format.bytesPerComponent,
			fragmentHighpBits: this.capabilitiesValue.fragmentHighp.precisionBits,
			fragmentHighpRange: [
				this.capabilitiesValue.fragmentHighp.rangeMin,
				this.capabilitiesValue.fragmentHighp.rangeMax
			]
		};
	}

	get capabilities(): BZGpuCapabilities {
		return this.capabilitiesValue;
	}

	get currentSetup(): BZSetup | null {
		return this.setup ? cloneBZSetup(this.setup) : null;
	}

	get isContextLost(): boolean {
		return this.contextLost;
	}

	get activeMeans(): BZGpuActiveMeans {
		return { ...this.activeMeansValue };
	}

	get lastProbeReadings(): readonly ProbeReading[] {
		return this.latestProbeValues.map((reading) => ({ ...reading }));
	}

	get readbackAccounting(): BZGpuReadbackAccounting {
		return this.readbackLedger.snapshot();
	}

	initialize(
		setup: Readonly<BZSetup>,
		state: Readonly<BZFieldState>,
		clock: Readonly<BZGpuClock> = { step: 0, modelTime: 0 }
	): void {
		this.assertUsable();
		validateSetupAndState(setup, state);
		validateClock(clock);
		if (setup.gridSize > this.capabilitiesValue.maximumTextureSize) {
			throw new Error(
				`BZ grid ${setup.gridSize} exceeds this GPU's maximum texture size ${this.capabilitiesValue.maximumTextureSize}.`
			);
		}

		const packed = packBZFieldState(state);
		this.releaseGpuResources();
		this.createGpuResources(setup.gridSize, packed);
		this.setup = cloneBZSetup(setup);
		this.stepIndex = clock.step;
		this.elapsedModelTime = clock.modelTime;
		this.latestProbeValues.length = 0;
		this.activeMeansValue = activeMeansFromState(state);
		this.rememberRecovery(state, setup, clock);
	}

	uploadState(state: Readonly<BZFieldState>, clock: Readonly<BZGpuClock> = this.clock): void {
		this.assertReady();
		validateSetupAndState(this.setup!, state);
		validateClock(clock);
		const packed = packBZFieldState(state);
		this.uploadTarget(this.current!, packed);
		this.uploadTarget(this.next!, packed);
		this.stepIndex = clock.step;
		this.elapsedModelTime = clock.modelTime;
		this.latestProbeValues.length = 0;
		this.activeMeansValue = activeMeansFromState(state);
		this.rememberRecovery(state, this.setup!, clock);
	}

	updateSetup(setup: Readonly<BZSetup>): void {
		this.assertReady();
		assertValidBZSetup(setup);
		const previous = this.setup!;
		if (setup.gridSize !== previous.gridSize) {
			throw new Error('Changing the BZ GPU grid requires initialize() with a matching field.');
		}
		if (
			setup.geometry !== previous.geometry ||
			setup.domainSize !== previous.domainSize ||
			setup.activeRadius !== previous.activeRadius ||
			setup.maskPreset !== previous.maskPreset
		) {
			throw new Error(
				'Changing BZ domain geometry or mask metadata requires initialize() so the immutable domain mask stays consistent.'
			);
		}
		this.setup = cloneBZSetup(setup);
	}

	/** Applies scheduled events immediately before the current numbered model step. */
	step(interventions: readonly Readonly<BZIntervention>[] = []): BZGpuClock {
		const ordered = orderedBZInterventions(interventions);
		this.stepOrdered(ordered);
		return this.clock;
	}

	advance(steps: number, interventionLog: readonly Readonly<BZIntervention>[] = []): BZGpuClock {
		this.assertReady();
		if (!Number.isSafeInteger(steps) || steps < 0) {
			throw new RangeError('BZ GPU step count must be a non-negative safe integer.');
		}
		const ordered = orderedBZInterventions(interventionLog);
		for (let count = 0; count < steps; count += 1) this.stepOrdered(ordered);
		return this.clock;
	}

	/** Immediate pass for UI tools; a pacemaker event here means one pulse. */
	applyIntervention(
		intervention: Readonly<BZIntervention>,
		suppliedMeans?: Readonly<BZGpuActiveMeans>
	): ProbeReading | null {
		this.assertReady();
		assertValidBZIntervention(intervention);
		if (intervention.kind === 'probe') return this.readPoint(intervention.point);
		if (intervention.kind === 'mix') {
			const means = suppliedMeans ?? this.inspectNumerics();
			this.mix({ u: means.u, v: means.v }, intervention.fraction);
			return null;
		}
		this.interventionPass(intervention);
		return null;
	}

	/** Blends active cells only; mask, obstacles, and exterior storage are untouched. */
	mix(activeMeans: Readonly<BZGpuActiveMeans>, fraction: number): void {
		this.assertReady();
		if (!Number.isFinite(activeMeans.u) || !Number.isFinite(activeMeans.v)) {
			throw new RangeError('Supplied BZ active means must be finite.');
		}
		if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
			throw new RangeError('BZ mix fraction must lie in [0, 1].');
		}
		if (fraction === 0) return;
		const gl = this.gl;
		const program = this.programs!.mix;
		this.prepareComputePass(program, this.next!);
		this.bindTexture(program, 'uState', this.current!.texture, 0);
		gl.uniform2f(requiredBZUniform(gl, program, 'uActiveMean'), activeMeans.u, activeMeans.v);
		gl.uniform1f(requiredBZUniform(gl, program, 'uFraction'), fraction);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		[this.current, this.next] = [this.next, this.current];
		this.activeMeansValue = { ...activeMeans };
	}

	render(options: BZGpuRenderOptions): void {
		this.assertReady();
		this.gl.bindVertexArray(this.vao);
		this.renderer!.render(this.current!.texture, this.setup!, options, this.activeMeansValue);
		this.gl.bindVertexArray(null);
	}

	setDisplaySize(cssWidth: number, cssHeight: number, density = 1): boolean {
		this.assertUsable();
		if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight)) {
			throw new RangeError('BZ display dimensions must be finite.');
		}
		const safeDensity = Number.isFinite(density) ? Math.min(2, Math.max(0.5, density)) : 1;
		const width = Math.max(1, Math.round(cssWidth * safeDensity));
		const height = Math.max(1, Math.round(cssHeight * safeDensity));
		if (this.canvas.width === width && this.canvas.height === height) return false;
		this.canvas.width = width;
		this.canvas.height = height;
		return true;
	}

	/**
	 * Explicit expensive path. Ordinary rendering, telemetry and probing cannot
	 * call this method without choosing an auditable full-read reason.
	 */
	readState(reason: BZGpuFullReadReason): BZFieldState {
		this.assertReady();
		assertBZGpuFullReadReason(reason);
		const size = this.setup!.gridSize;
		const packed = new Float32Array(size * size * 4);
		this.readPixels(this.current!.framebuffer, 0, 0, size, size, packed, {
			kind: 'full-field',
			reason
		});
		const state = unpackBZFieldState(size, packed);
		const means = activeMeansFromState(state);
		if (Number.isFinite(means.u) && Number.isFinite(means.v)) this.activeMeansValue = means;
		// Any explicit field read is a valid later recovery point, but its reason is
		// retained independently in the accounting ledger.
		this.rememberRecovery(state, this.setup!, this.clock);
		return state;
	}

	/** Reads exactly one texel; normalized y follows CPU row order and is not display-flipped. */
	readPoint(point: readonly [number, number]): ProbeReading {
		this.assertReady();
		validatePoint(point);
		const size = this.setup!.gridSize;
		const column = Math.min(size - 1, Math.floor(point[0] * size));
		const row = Math.min(size - 1, Math.floor(point[1] * size));
		const packed = new Float32Array(4);
		this.readPixels(this.current!.framebuffer, column, row, 1, 1, packed, { kind: 'probe' });
		const active = packed[2] >= 0.5 && packed[3] >= 0.5;
		return {
			row,
			column,
			index: row * size + column,
			active,
			u: active ? packed[0] : null,
			v: active ? packed[1] : null
		};
	}

	sampleTelemetry(
		sampledAt = typeof performance === 'undefined' ? Date.now() : performance.now(),
		absoluteLimit = BZ_SAFE_LIMITS.stateAbsoluteMaximum
	): BZGpuTelemetrySample {
		this.assertReady();
		if (!Number.isFinite(sampledAt) || sampledAt < 0) {
			throw new RangeError('BZ telemetry sample time must be finite and non-negative.');
		}
		const reduction = this.telemetryReducer!.sample(
			this.current!.texture,
			absoluteLimit,
			BZ_SAFE_LIMITS.negativeTolerance
		);
		this.readbackLedger.recordTelemetrySample();
		const inspection = numericalInspectionFromReduction(reduction);
		this.activeMeansValue = { u: reduction.metrics.meanU, v: reduction.metrics.meanV };
		const readbacks = this.readbackLedger.snapshot();
		return {
			kind: 'telemetry',
			step: this.stepIndex,
			modelTime: this.elapsedModelTime,
			sampledAt,
			metrics: reduction.metrics,
			engine: this.format.label === 'RGBA32F' ? 'gpu-f32' : 'gpu-f16',
			telemetryTexture: reduction.finalTexture,
			fullStateReadbacks: readbacks.fullFieldReadbacks,
			inspection,
			readbacks,
			reductionPasses: reduction.reductionPasses,
			reductionReadbacks: reduction.reductionReadbacks
		};
	}

	inspectNumerics(absoluteLimit = BZ_SAFE_LIMITS.stateAbsoluteMaximum): BZGpuNumericalInspection {
		if (!Number.isFinite(absoluteLimit) || absoluteLimit <= 0) {
			throw new RangeError('BZ numerical safety magnitude must be finite and positive.');
		}
		return this.sampleTelemetry(undefined, absoluteLimit).inspection;
	}

	estimateTextureMemory(): BZGpuTextureMemoryEstimate {
		const gridSize = this.setup?.gridSize ?? 0;
		const scientificTextureBytes = gridSize * gridSize * 4 * this.format.bytesPerComponent * 3;
		const telemetry = this.telemetryReducer?.memoryEstimate ?? {
			targetCount: 0,
			textureBytes: 0,
			format: 'RGBA32F' as const
		};
		return {
			gridSize,
			targetCount: 3,
			channelsPerTexel: 4,
			bytesPerComponent: this.format.bytesPerComponent,
			textureBytes: scientificTextureBytes,
			scientificTextureBytes,
			telemetryTargetCount: telemetry.targetCount,
			telemetryTextureBytes: telemetry.textureBytes,
			totalTrackedTextureBytes: scientificTextureBytes + telemetry.textureBytes,
			caveat:
				'This counts three scientific state textures and the reusable RGBA32F telemetry pyramid; driver, framebuffer, shader, canvas, display-pass, and transient readback overhead are implementation-dependent.'
		};
	}

	/** Captures and retains an explicit CPU checkpoint for context restoration. */
	checkpoint(): BZFieldState {
		return this.readState('checkpoint');
	}

	rebuild(
		setup: Readonly<BZSetup>,
		state: Readonly<BZFieldState>,
		clock: Readonly<BZGpuClock>
	): void {
		this.initialize(setup, state, clock);
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
		this.releaseGpuResources();
		this.setup = null;
		this.recoveryState = null;
		this.recoverySetup = null;
		this.latestProbeValues.length = 0;
	}

	/** Compatibility alias for consumers that use the common disposable convention. */
	dispose(): void {
		this.destroy();
	}

	private stepOrdered(ordered: readonly Readonly<BZIntervention>[]): void {
		this.assertReady();
		this.latestProbeValues.length = 0;
		for (const intervention of ordered) {
			if (!interventionAppliesAtStep(intervention, this.stepIndex)) continue;
			const probe = this.applyIntervention(intervention);
			if (probe) this.latestProbeValues.push(probe);
		}
		this.predictorPass();
		this.correctorPass();
		[this.current, this.next] = [this.next, this.current];
		this.stepIndex += 1;
		this.elapsedModelTime += this.setup!.timestep;
	}

	private createGpuResources(size: number, packed: Float32Array): void {
		const gl = this.gl;
		let oregonatorPredictor: WebGLProgram | null = null;
		let oregonatorCorrector: WebGLProgram | null = null;
		let schnakenbergPredictor: WebGLProgram | null = null;
		let schnakenbergCorrector: WebGLProgram | null = null;
		let intervention: WebGLProgram | null = null;
		let mix: WebGLProgram | null = null;
		let renderer: BZGpuRenderer | null = null;
		let vao: WebGLVertexArrayObject | null = null;
		let current: BZFloatTextureTarget | null = null;
		let next: BZFloatTextureTarget | null = null;
		let predictor: BZFloatTextureTarget | null = null;
		let telemetryReducer: BZGpuTelemetryReducer | null = null;

		try {
			oregonatorPredictor = createBZProgram(
				gl,
				fullscreenVertexSource,
				oregonatorPredictorFragmentSource,
				'Oregonator predictor'
			);
			oregonatorCorrector = createBZProgram(
				gl,
				fullscreenVertexSource,
				oregonatorCorrectorFragmentSource,
				'Oregonator Heun corrector'
			);
			schnakenbergPredictor = createBZProgram(
				gl,
				fullscreenVertexSource,
				schnakenbergPredictorFragmentSource,
				'Schnakenberg predictor'
			);
			schnakenbergCorrector = createBZProgram(
				gl,
				fullscreenVertexSource,
				schnakenbergCorrectorFragmentSource,
				'Schnakenberg Heun corrector'
			);
			intervention = createBZProgram(
				gl,
				fullscreenVertexSource,
				interventionFragmentSource,
				'BZ intervention'
			);
			mix = createBZProgram(gl, fullscreenVertexSource, mixFragmentSource, 'BZ active-area mix');
			renderer = new BZGpuRenderer(gl);
			vao = gl.createVertexArray();
			if (!vao) throw new Error('Could not allocate the BZ fullscreen-triangle vertex array.');
			current = createBZFloatTextureTarget(gl, this.format, size, packed);
			next = createBZFloatTextureTarget(gl, this.format, size, packed);
			predictor = createBZFloatTextureTarget(gl, this.format, size);
			if (
				!this.capabilitiesValue.attempts.some(
					(attempt) => attempt.id === 'rgba32f' && attempt.writeReadPassed
				)
			) {
				throw new Error(
					'RGBA32F reduction targets are unavailable, so bounded GPU telemetry cannot be verified. Use the CPU reference instead of ordinary whole-field GPU readback.'
				);
			}
			telemetryReducer = new BZGpuTelemetryReducer(gl, size, (framebuffer, output) => {
				this.readPixels(framebuffer, 0, 0, 1, 1, output, { kind: 'reduction' });
			});
			this.programs = {
				oregonatorPredictor,
				oregonatorCorrector,
				schnakenbergPredictor,
				schnakenbergCorrector,
				intervention,
				mix
			};
			this.renderer = renderer;
			this.vao = vao;
			this.current = current;
			this.next = next;
			this.predictor = predictor;
			this.telemetryReducer = telemetryReducer;
		} catch (error) {
			telemetryReducer?.destroy();
			deleteBZFloatTextureTarget(gl, current);
			deleteBZFloatTextureTarget(gl, next);
			deleteBZFloatTextureTarget(gl, predictor);
			for (const program of [
				oregonatorPredictor,
				oregonatorCorrector,
				schnakenbergPredictor,
				schnakenbergCorrector,
				intervention,
				mix
			]) {
				if (program) gl.deleteProgram(program);
			}
			renderer?.destroy();
			if (vao) gl.deleteVertexArray(vao);
			throw error;
		}
	}

	private predictorPass(): void {
		const gl = this.gl;
		const program =
			this.setup!.model === 'oregonator'
				? this.programs!.oregonatorPredictor
				: this.programs!.schnakenbergPredictor;
		this.prepareComputePass(program, this.predictor!);
		this.bindTexture(program, 'uState', this.current!.texture, 0);
		this.setPhysicsUniforms(program);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	private correctorPass(): void {
		const gl = this.gl;
		const program =
			this.setup!.model === 'oregonator'
				? this.programs!.oregonatorCorrector
				: this.programs!.schnakenbergCorrector;
		this.prepareComputePass(program, this.next!);
		this.bindTexture(program, 'uOriginalState', this.current!.texture, 0);
		this.bindTexture(program, 'uPredictedState', this.predictor!.texture, 1);
		this.setPhysicsUniforms(program);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	private interventionPass(intervention: Exclude<BZIntervention, { kind: 'mix' | 'probe' }>): void {
		const gl = this.gl;
		const program = this.programs!.intervention;
		const uniforms = interventionUniforms(intervention);
		const recovered = recoveredStateForSetup(this.setup!);
		this.prepareComputePass(program, this.next!);
		this.bindTexture(program, 'uState', this.current!.texture, 0);
		gl.uniform1i(requiredBZUniform(gl, program, 'uGridSize'), this.setup!.gridSize);
		gl.uniform1i(requiredBZUniform(gl, program, 'uPeriodic'), periodicIndex(this.setup!));
		gl.uniform1i(requiredBZUniform(gl, program, 'uKind'), uniforms.kind);
		gl.uniform2f(requiredBZUniform(gl, program, 'uFrom'), uniforms.from[0], uniforms.from[1]);
		gl.uniform2f(requiredBZUniform(gl, program, 'uTo'), uniforms.to[0], uniforms.to[1]);
		gl.uniform1f(requiredBZUniform(gl, program, 'uRadius'), uniforms.radius);
		gl.uniform1f(requiredBZUniform(gl, program, 'uCellWidth'), 1 / this.setup!.gridSize);
		gl.uniform1f(requiredBZUniform(gl, program, 'uAmount'), uniforms.amount);
		gl.uniform2f(requiredBZUniform(gl, program, 'uTarget'), uniforms.target[0], uniforms.target[1]);
		gl.uniform1f(requiredBZUniform(gl, program, 'uStrength'), uniforms.strength);
		gl.uniform2f(requiredBZUniform(gl, program, 'uRecovered'), recovered.u, recovered.v);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		[this.current, this.next] = [this.next, this.current];
	}

	private prepareComputePass(program: WebGLProgram, target: BZFloatTextureTarget): void {
		const gl = this.gl;
		gl.bindVertexArray(this.vao);
		gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
		gl.viewport(0, 0, this.setup!.gridSize, this.setup!.gridSize);
		gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.SCISSOR_TEST);
		gl.useProgram(program);
	}

	private bindTexture(
		program: WebGLProgram,
		uniformName: string,
		texture: WebGLTexture,
		unit: number
	): void {
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.uniform1i(requiredBZUniform(gl, program, uniformName), unit);
	}

	private setPhysicsUniforms(program: WebGLProgram): void {
		const gl = this.gl;
		const setup = this.setup!;
		const spacing = setup.domainSize / setup.gridSize;
		gl.uniform1i(requiredBZUniform(gl, program, 'uGridSize'), setup.gridSize);
		gl.uniform1i(requiredBZUniform(gl, program, 'uPeriodic'), periodicIndex(setup));
		gl.uniform1f(requiredBZUniform(gl, program, 'uSpacingSquared'), spacing * spacing);
		gl.uniform1f(requiredBZUniform(gl, program, 'uDiffusionU'), setup.diffusionU);
		gl.uniform1f(requiredBZUniform(gl, program, 'uDiffusionV'), setup.diffusionV);
		gl.uniform1f(requiredBZUniform(gl, program, 'uTimestep'), setup.timestep);
		if (setup.model === 'oregonator') {
			gl.uniform1f(requiredBZUniform(gl, program, 'uEpsilon'), setup.parameters.epsilon);
			gl.uniform1f(requiredBZUniform(gl, program, 'uQ'), setup.parameters.q);
			gl.uniform1f(requiredBZUniform(gl, program, 'uF'), setup.parameters.f);
		} else {
			gl.uniform1f(requiredBZUniform(gl, program, 'uA'), setup.parameters.a);
			gl.uniform1f(requiredBZUniform(gl, program, 'uB'), setup.parameters.b);
			gl.uniform1f(requiredBZUniform(gl, program, 'uGamma'), setup.parameters.gamma);
		}
	}

	private uploadTarget(target: BZFloatTextureTarget, packed: Float32Array): void {
		const gl = this.gl;
		const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
		const previousUnpackBuffer = gl.getParameter(
			gl.PIXEL_UNPACK_BUFFER_BINDING
		) as WebGLBuffer | null;
		drainErrors(gl);
		let error: number;
		try {
			gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
			gl.bindTexture(gl.TEXTURE_2D, target.texture);
			gl.texSubImage2D(
				gl.TEXTURE_2D,
				0,
				0,
				0,
				this.setup!.gridSize,
				this.setup!.gridSize,
				gl.RGBA,
				this.format.uploadType,
				packed
			);
			error = gl.getError();
		} finally {
			gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, previousUnpackBuffer);
			gl.bindTexture(gl.TEXTURE_2D, previousTexture);
		}
		if (error !== gl.NO_ERROR) {
			throw new Error(`BZ state upload failed with WebGL error 0x${error.toString(16)}.`);
		}
	}

	private readPixels(
		framebuffer: WebGLFramebuffer,
		x: number,
		y: number,
		width: number,
		height: number,
		output: Float32Array,
		readback: Readonly<BZReadbackKind>
	): void {
		const gl = this.gl;
		const previousReadFramebuffer = gl.getParameter(
			gl.READ_FRAMEBUFFER_BINDING
		) as WebGLFramebuffer | null;
		const previousReadBuffer = Number(gl.getParameter(gl.READ_BUFFER));
		const previousPackBuffer = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer | null;
		let error: number;
		try {
			drainErrors(gl);
			gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
			gl.readBuffer(gl.COLOR_ATTACHMENT0);
			gl.readPixels(x, y, width, height, gl.RGBA, this.format.readType, output);
			error = gl.getError();
		} finally {
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousReadFramebuffer);
			gl.readBuffer(previousReadBuffer);
			gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previousPackBuffer);
		}
		if (error !== gl.NO_ERROR) {
			throw new Error(`BZ float readback failed with WebGL error 0x${error.toString(16)}.`);
		}
		const texels = width * height;
		if (readback.kind === 'full-field') {
			this.readbackLedger.recordFullField(readback.reason, texels, this.stepIndex);
		} else if (readback.kind === 'probe') {
			this.readbackLedger.recordProbe(texels);
		} else {
			this.readbackLedger.recordReduction(texels);
		}
	}

	private rememberRecovery(
		state: Readonly<BZFieldState>,
		setup: Readonly<BZSetup>,
		clock: Readonly<BZGpuClock>
	): void {
		this.recoveryState = cloneBZFieldState(state);
		this.recoverySetup = cloneBZSetup(setup);
		this.recoveryClock = { ...clock };
	}

	private releaseGpuResources(): void {
		if (this.contextLost) {
			this.telemetryReducer?.destroy(true);
			this.telemetryReducer = null;
			this.programs = null;
			this.renderer = null;
			this.vao = null;
			this.current = null;
			this.next = null;
			this.predictor = null;
			return;
		}
		const gl = this.gl;
		this.telemetryReducer?.destroy();
		this.telemetryReducer = null;
		deleteBZFloatTextureTarget(gl, this.current);
		deleteBZFloatTextureTarget(gl, this.next);
		deleteBZFloatTextureTarget(gl, this.predictor);
		this.current = null;
		this.next = null;
		this.predictor = null;
		if (this.programs) {
			for (const program of Object.values(this.programs)) gl.deleteProgram(program);
			this.programs = null;
		}
		this.renderer?.destroy();
		this.renderer = null;
		if (this.vao) gl.deleteVertexArray(this.vao);
		this.vao = null;
	}

	private handleContextLost = (event: Event): void => {
		if (this.destroyed) return;
		event.preventDefault();
		this.contextLost = true;
		this.callbacks.onContextLost?.(this.clock);
	};

	private handleContextRestored = (): void => {
		if (this.destroyed) return;
		this.contextLost = false;
		try {
			this.capabilitiesValue = probeBZGpuCapabilities(this.gl);
			if (!this.capabilitiesValue.selectedFormat) {
				throw new BZFloatFramebufferUnavailableError(this.capabilitiesValue);
			}
			this.format = this.capabilitiesValue.selectedFormat;
			this.programs = null;
			this.renderer = null;
			this.vao = null;
			this.current = null;
			this.next = null;
			this.predictor = null;
			this.telemetryReducer = null;
			if (!this.recoverySetup || !this.recoveryState) {
				throw new Error('No BZ CPU checkpoint is available for context restoration.');
			}
			const checkpointStep = this.recoveryClock.step;
			this.initialize(this.recoverySetup, this.recoveryState, this.recoveryClock);
			this.callbacks.onContextRestored?.({
				recovered: true,
				checkpointStep,
				reason: 'BZ float resources were rebuilt from the latest explicit CPU checkpoint.'
			});
		} catch (error) {
			this.callbacks.onContextRestored?.({
				recovered: false,
				checkpointStep: this.recoveryClock.step,
				reason:
					error instanceof Error
						? error.message
						: 'The restored context could not rebuild the BZ solver.'
			});
		}
	};

	private assertUsable(): void {
		if (this.destroyed) throw new Error('The BZ GPU engine has been destroyed.');
		if (this.contextLost || this.gl.isContextLost()) {
			throw new Error('The BZ WebGL context is lost; wait for restoration or use the CPU solver.');
		}
	}

	private assertReady(): void {
		this.assertUsable();
		if (
			!this.setup ||
			!this.programs ||
			!this.renderer ||
			!this.vao ||
			!this.current ||
			!this.next ||
			!this.predictor ||
			!this.telemetryReducer
		) {
			throw new Error('Initialize the BZ GPU engine before using it.');
		}
	}
}

interface InterventionUniforms {
	readonly kind: 0 | 1 | 2 | 3 | 4 | 5 | 6;
	readonly from: readonly [number, number];
	readonly to: readonly [number, number];
	readonly radius: number;
	readonly amount: number;
	readonly target: readonly [number, number];
	readonly strength: number;
}

function interventionUniforms(
	intervention: Exclude<BZIntervention, { kind: 'mix' | 'probe' }>
): InterventionUniforms {
	if (
		intervention.kind === 'excite' ||
		intervention.kind === 'inhibit' ||
		intervention.kind === 'pacemaker'
	) {
		if (intervention.kind === 'pacemaker' && intervention.sourceMode === 'state-reset') {
			return {
				kind: 6,
				from: intervention.center,
				to: intervention.center,
				radius: intervention.radius,
				amount: 0,
				target: [intervention.targetU!, intervention.targetV!],
				strength: intervention.strength ?? 1
			};
		}
		return {
			kind: intervention.kind === 'inhibit' ? 1 : 0,
			from: intervention.center,
			to: intervention.center,
			radius: intervention.radius,
			amount: intervention.amount,
			target: [0, 0],
			strength: 0
		};
	}
	if (intervention.kind === 'cut') {
		return {
			kind: 2,
			from: intervention.from,
			to: intervention.to,
			radius: intervention.width,
			amount: 0,
			target: [intervention.targetU, intervention.targetV],
			strength: intervention.strength
		};
	}
	if (intervention.kind === 'obstacle') {
		return {
			kind: 3,
			from: intervention.from,
			to: intervention.to,
			radius: intervention.radius,
			amount: 0,
			target: [0, 0],
			strength: 0
		};
	}
	return {
		kind: intervention.initialization === 'recovered' ? 4 : 5,
		from: intervention.from,
		to: intervention.to,
		radius: intervention.radius,
		amount: 0,
		target: [0, 0],
		strength: 0
	};
}

function validateSetupAndState(setup: Readonly<BZSetup>, state: Readonly<BZFieldState>): void {
	assertValidBZSetup(setup);
	assertValidBZFieldState(state);
	if (state.size !== setup.gridSize)
		throw new RangeError('BZ field size must match setup.gridSize.');
}

function validateClock(clock: Readonly<BZGpuClock>): void {
	if (!Number.isSafeInteger(clock.step) || clock.step < 0) {
		throw new RangeError('BZ GPU clock step must be a non-negative safe integer.');
	}
	if (!Number.isFinite(clock.modelTime) || clock.modelTime < 0) {
		throw new RangeError('BZ GPU model time must be finite and non-negative.');
	}
}

function validatePoint(point: readonly [number, number]): void {
	if (
		!Array.isArray(point) ||
		point.length !== 2 ||
		!Number.isFinite(point[0]) ||
		!Number.isFinite(point[1]) ||
		point[0] < 0 ||
		point[0] > 1 ||
		point[1] < 0 ||
		point[1] > 1
	) {
		throw new RangeError('BZ probe point must lie in normalized [0, 1]² coordinates.');
	}
}

function packBZFieldState(state: Readonly<BZFieldState>): Float32Array {
	const packed = new Float32Array(state.size * state.size * 4);
	for (let index = 0; index < state.u.length; index += 1) {
		const u = state.u[index];
		const v = state.v[index];
		const mask = state.mask[index];
		const domainMask = state.domainMask[index];
		if (!Number.isFinite(u) || !Number.isFinite(v)) {
			throw new RangeError(`BZ concentration at index ${index} is not finite.`);
		}
		if ((mask !== 0 && mask !== 1) || (domainMask !== 0 && domainMask !== 1)) {
			throw new RangeError(`BZ mask values at index ${index} must be zero or one.`);
		}
		if (mask && !domainMask) {
			throw new RangeError(`BZ active mask at index ${index} extends beyond the domain.`);
		}
		const offset = index * 4;
		packed[offset] = u;
		packed[offset + 1] = v;
		packed[offset + 2] = mask;
		packed[offset + 3] = domainMask;
	}
	return packed;
}

function unpackBZFieldState(size: number, packed: Float32Array): BZFieldState {
	const length = size * size;
	const u = new Float64Array(length);
	const v = new Float64Array(length);
	const mask = new Uint8Array(length);
	const domainMask = new Uint8Array(length);
	for (let index = 0; index < length; index += 1) {
		const offset = index * 4;
		u[index] = packed[offset];
		v[index] = packed[offset + 1];
		domainMask[index] = packed[offset + 3] >= 0.5 ? 1 : 0;
		mask[index] = packed[offset + 2] >= 0.5 ? 1 : 0;
	}
	const state: BZFieldState = { size, u, v, domainMask, mask };
	assertValidBZFieldState(state);
	return state;
}

function activeMeansFromState(state: Readonly<BZFieldState>): BZGpuActiveMeans {
	let activeCells = 0;
	let meanU = 0;
	let meanV = 0;
	for (let index = 0; index < state.u.length; index += 1) {
		if (!state.mask[index]) continue;
		activeCells += 1;
		meanU += (state.u[index] - meanU) / activeCells;
		meanV += (state.v[index] - meanV) / activeCells;
	}
	return activeCells > 0 ? { u: meanU, v: meanV } : { u: 0, v: 0 };
}

function numericalInspectionFromReduction(
	reduction: Readonly<BZGpuTelemetryReduction>
): BZGpuNumericalInspection {
	const metrics = reduction.metrics;
	return {
		healthy: reduction.healthy,
		// The reduction detects invalid values but deliberately does not perform a
		// whole-field read merely to localize one coordinate.
		firstFailureIndex: null,
		maximumAbsoluteValue: reduction.maximumAbsoluteValue,
		activeCells: metrics.activeCells,
		finiteActiveCells: reduction.finiteActiveCells,
		excitationVarianceResolved: reduction.excitationVarianceResolved,
		u: metrics.meanU,
		v: metrics.meanV,
		meanU: metrics.meanU,
		meanV: metrics.meanV,
		varianceU: metrics.varianceU,
		varianceV: metrics.varianceV,
		minimumU: metrics.minimumU,
		maximumU: metrics.maximumU,
		minimumV: metrics.minimumV,
		maximumV: metrics.maximumV,
		reason: reduction.healthy
			? reduction.reason
			: `${reduction.reason} The bounded reduction does not localize a first-failure index.`
	};
}

function periodicIndex(setup: Readonly<BZSetup>): number {
	return setup.boundary === 'periodic' && setup.geometry === 'square' ? 1 : 0;
}

function drainErrors(gl: WebGL2RenderingContext): void {
	for (let count = 0; count < 16 && gl.getError() !== gl.NO_ERROR; count += 1) {
		// Attribute a later readback error only to that readback.
	}
}
