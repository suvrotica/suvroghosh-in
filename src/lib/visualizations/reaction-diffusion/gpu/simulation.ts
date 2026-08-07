import { NUMERICAL_SAFETY_ABS_LIMIT } from '../constants';
import { assertValidFieldState } from '../initial';
import { orderedInterventions, shouldApplyIntervention } from '../interventions';
import { assertValidSetup } from '../setup';
import type {
	BrushIntervention,
	BrushTarget,
	FieldState,
	GrayScottSetup,
	Intervention
} from '../types';
import {
	createReactionDiffusionContext,
	probeFloatRenderTargets,
	type FloatFramebufferFormat,
	type ReactionDiffusionGpuCapabilities
} from './capabilities';
import { ReactionDiffusionGpuRenderer, type ReactionDiffusionRenderOptions } from './renderer';
import {
	correctorFragmentSource,
	fullscreenVertexSource,
	interventionFragmentSource,
	predictorFragmentSource
} from './shaders';
import {
	createFloatTextureTarget,
	createProgram,
	deleteFloatTextureTarget,
	requiredUniform,
	type FloatTextureTarget
} from './webgl-utils';

interface ProgramSet {
	readonly predictor: WebGLProgram;
	readonly corrector: WebGLProgram;
	readonly intervention: WebGLProgram;
}

export interface ReactionDiffusionGpuClock {
	readonly step: number;
	readonly modelTime: number;
}

export interface GpuNumericalInspection {
	readonly healthy: boolean;
	readonly firstFailureIndex: number | null;
	readonly maximumAbsoluteValue: number;
	readonly reason: string;
}

export interface ReactionDiffusionContextRestoration {
	readonly recovered: boolean;
	readonly checkpointStep: number;
	readonly reason: string;
}

export interface ReactionDiffusionGpuCallbacks {
	onContextLost?: (clock: ReactionDiffusionGpuClock) => void;
	onContextRestored?: (result: ReactionDiffusionContextRestoration) => void;
}

export interface ReactionDiffusionGpuOptions {
	readonly callbacks?: ReactionDiffusionGpuCallbacks;
	readonly comparisonTarget?: BrushTarget;
	readonly contextAttributes?: WebGLContextAttributes;
}

export class FloatFramebufferUnavailableError extends Error {
	readonly capabilities: ReactionDiffusionGpuCapabilities;

	constructor(capabilities: ReactionDiffusionGpuCapabilities) {
		super(capabilities.message);
		this.name = 'FloatFramebufferUnavailableError';
		this.capabilities = capabilities;
	}
}

/**
 * Float-only WebGL2 Gray–Scott solver. Each model step is predictor → corrector;
 * display rendering is a third, state-independent pass. Row zero is the top row
 * of all uploaded/read arrays, matching normalized domain brush coordinates.
 */
export class ReactionDiffusionGpuEngine {
	readonly canvas: HTMLCanvasElement;
	readonly gl: WebGL2RenderingContext;
	readonly callbacks: ReactionDiffusionGpuCallbacks;
	readonly comparisonTarget: BrushTarget;

	capabilities: ReactionDiffusionGpuCapabilities;
	private format: FloatFramebufferFormat;
	private programs: ProgramSet | null = null;
	private renderer: ReactionDiffusionGpuRenderer | null = null;
	private vao: WebGLVertexArrayObject | null = null;
	private current: FloatTextureTarget | null = null;
	private next: FloatTextureTarget | null = null;
	private predicted: FloatTextureTarget | null = null;
	private setup: GrayScottSetup | null = null;
	private stepIndex = 0;
	private elapsedModelTime = 0;
	private contextLost = false;
	private disposed = false;
	private recoveryState: FieldState | null = null;
	private recoverySetup: GrayScottSetup | null = null;
	private recoveryClock: ReactionDiffusionGpuClock = { step: 0, modelTime: 0 };

	constructor(canvas: HTMLCanvasElement, options: ReactionDiffusionGpuOptions = {}) {
		this.canvas = canvas;
		this.callbacks = options.callbacks ?? {};
		this.comparisonTarget = options.comparisonTarget ?? 'both';
		const context = createReactionDiffusionContext(canvas, options.contextAttributes);
		this.gl = context.gl;
		this.capabilities = context.capabilities;
		if (!context.capabilities.selectedFormat) {
			throw new FloatFramebufferUnavailableError(context.capabilities);
		}
		this.format = context.capabilities.selectedFormat;
		canvas.addEventListener('webglcontextlost', this.handleContextLost);
		canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
	}

	get textureFormat(): 'RGBA16F' | 'RGBA32F' {
		return this.format.label;
	}

	get clock(): ReactionDiffusionGpuClock {
		return { step: this.stepIndex, modelTime: this.elapsedModelTime };
	}

	get currentSetup(): GrayScottSetup | null {
		return this.setup ? { ...this.setup } : null;
	}

	get isContextLost(): boolean {
		return this.contextLost;
	}

	initialize(
		setup: GrayScottSetup,
		state: FieldState,
		clock: ReactionDiffusionGpuClock = { step: 0, modelTime: 0 }
	): void {
		this.assertUsable();
		validateSetupAndState(setup, state);
		const maximumTextureSize = Number(this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE));
		if (setup.gridSize > maximumTextureSize) {
			throw new Error(
				`Grid size ${setup.gridSize} exceeds this GPU's maximum texture size ${maximumTextureSize}.`
			);
		}
		validateClock(clock);
		this.releaseGpuResources();
		this.createGpuResources(setup.gridSize, packFieldState(state));
		this.setup = { ...setup };
		this.stepIndex = clock.step;
		this.elapsedModelTime = clock.modelTime;
		this.rememberRecovery(state, setup, clock);
	}

	uploadState(state: FieldState, clock: ReactionDiffusionGpuClock = this.clock): void {
		this.assertReady();
		validateSetupAndState(this.setup!, state);
		validateClock(clock);
		const packed = packFieldState(state);
		this.uploadTarget(this.current!, packed);
		this.uploadTarget(this.next!, packed);
		this.stepIndex = clock.step;
		this.elapsedModelTime = clock.modelTime;
		this.rememberRecovery(state, this.setup!, clock);
	}

	updateSetup(setup: GrayScottSetup): void {
		this.assertReady();
		if (setup.gridSize !== this.setup!.gridSize) {
			throw new Error(
				'Changing the GPU grid size requires initialize() with a matching field state.'
			);
		}
		assertValidSetup(setup);
		this.setup = { ...setup };
	}

	/** Applies all supplied interventions immediately before this numbered model step. */
	step(interventions: readonly Intervention[] = []): ReactionDiffusionGpuClock {
		this.assertReady();
		for (const intervention of orderedInterventions(interventions)) {
			if (intervention.step !== this.stepIndex) continue;
			if (!shouldApplyIntervention(intervention, this.comparisonTarget)) continue;
			this.applyIntervention(intervention);
		}

		this.predictorPass();
		this.correctorPass();
		[this.current, this.next] = [this.next, this.current];
		this.stepIndex += 1;
		this.elapsedModelTime += this.setup!.timestep;
		return this.clock;
	}

	advance(steps: number, eventLog: readonly Intervention[] = []): ReactionDiffusionGpuClock {
		if (!Number.isSafeInteger(steps) || steps < 0)
			throw new Error('Step count must be a non-negative integer.');
		const eventsByStep = groupInterventions(eventLog);
		for (let index = 0; index < steps; index += 1) {
			this.step(eventsByStep.get(this.stepIndex) ?? []);
		}
		return this.clock;
	}

	render(options: ReactionDiffusionRenderOptions): void {
		this.assertReady();
		this.gl.bindVertexArray(this.vao);
		this.renderer!.render(this.current!.texture, this.setup!, options);
		this.gl.bindVertexArray(null);
	}

	setDisplaySize(cssWidth: number, cssHeight: number, density = 1): boolean {
		this.assertUsable();
		const safeDensity = Number.isFinite(density) ? Math.min(2, Math.max(0.5, density)) : 1;
		const width = Math.max(1, Math.round(cssWidth * safeDensity));
		const height = Math.max(1, Math.round(cssHeight * safeDensity));
		if (this.canvas.width === width && this.canvas.height === height) return false;
		this.canvas.width = width;
		this.canvas.height = height;
		return true;
	}

	readState(rememberAsRecoveryCheckpoint = true): FieldState {
		this.assertReady();
		const size = this.setup!.gridSize;
		const packed = new Float32Array(size * size * 4);
		const previousFramebuffer = this.gl.getParameter(
			this.gl.FRAMEBUFFER_BINDING
		) as WebGLFramebuffer | null;
		const previousPackBuffer = this.gl.getParameter(
			this.gl.PIXEL_PACK_BUFFER_BINDING
		) as WebGLBuffer | null;
		this.gl.bindBuffer(this.gl.PIXEL_PACK_BUFFER, null);
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.current!.framebuffer);
		this.gl.readPixels(0, 0, size, size, this.gl.RGBA, this.format.readType, packed);
		const error = this.gl.getError();
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, previousFramebuffer);
		this.gl.bindBuffer(this.gl.PIXEL_PACK_BUFFER, previousPackBuffer);
		if (error !== this.gl.NO_ERROR) {
			throw new Error(
				`Floating-point state readback failed with WebGL error 0x${error.toString(16)}.`
			);
		}

		const state = unpackFieldState(size, packed);
		if (rememberAsRecoveryCheckpoint) this.rememberRecovery(state, this.setup!, this.clock);
		return state;
	}

	/** A throttled diagnostics/spectrum helper; this performs a synchronous GPU readback. */
	readVField(downsampleSize = this.setup?.gridSize ?? 0): Float32Array {
		const state = this.readState(false);
		if (
			!Number.isSafeInteger(downsampleSize) ||
			downsampleSize < 1 ||
			downsampleSize > state.size
		) {
			throw new Error(
				'Downsample size must be an integer between one and the simulation grid size.'
			);
		}
		const result = new Float32Array(downsampleSize * downsampleSize);
		for (let row = 0; row < downsampleSize; row += 1) {
			const sourceRow = Math.min(
				state.size - 1,
				Math.floor(((row + 0.5) * state.size) / downsampleSize)
			);
			for (let column = 0; column < downsampleSize; column += 1) {
				const sourceColumn = Math.min(
					state.size - 1,
					Math.floor(((column + 0.5) * state.size) / downsampleSize)
				);
				result[row * downsampleSize + column] = state.v[sourceRow * state.size + sourceColumn];
			}
		}
		return result;
	}

	inspectNumerics(absoluteLimit = NUMERICAL_SAFETY_ABS_LIMIT): GpuNumericalInspection {
		if (!Number.isFinite(absoluteLimit) || absoluteLimit <= 0) {
			throw new Error('The numerical safety limit must be finite and positive.');
		}
		const state = this.readState(false);
		let maximumAbsoluteValue = 0;
		for (let index = 0; index < state.u.length; index += 1) {
			if (state.mask[index] === 0) continue;
			const u = state.u[index];
			const v = state.v[index];
			if (!Number.isFinite(u) || !Number.isFinite(v)) {
				return {
					healthy: false,
					firstFailureIndex: index,
					maximumAbsoluteValue: Number.POSITIVE_INFINITY,
					reason: 'A concentration became non-finite; the solver state was not repaired.'
				};
			}
			maximumAbsoluteValue = Math.max(maximumAbsoluteValue, Math.abs(u), Math.abs(v));
			if (maximumAbsoluteValue > absoluteLimit) {
				return {
					healthy: false,
					firstFailureIndex: index,
					maximumAbsoluteValue,
					reason: `A concentration exceeded the documented safety magnitude ${absoluteLimit}; the solver state was not clamped.`
				};
			}
		}
		return {
			healthy: true,
			firstFailureIndex: null,
			maximumAbsoluteValue,
			reason:
				'All active-cell concentrations are finite and within the diagnostic safety magnitude.'
		};
	}

	/** Explicit rebuild hook for a CPU checkpoint or deterministic replay result. */
	rebuild(setup: GrayScottSetup, state: FieldState, clock: ReactionDiffusionGpuClock): void {
		this.initialize(setup, state, clock);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
		this.releaseGpuResources();
		this.recoveryState = null;
		this.recoverySetup = null;
	}

	private createGpuResources(size: number, packed: Float32Array): void {
		const gl = this.gl;
		let predictorProgram: WebGLProgram | null = null;
		let correctorProgram: WebGLProgram | null = null;
		let interventionProgram: WebGLProgram | null = null;
		let renderer: ReactionDiffusionGpuRenderer | null = null;
		let vao: WebGLVertexArrayObject | null = null;
		let current: FloatTextureTarget | null = null;
		let next: FloatTextureTarget | null = null;
		let predicted: FloatTextureTarget | null = null;
		try {
			predictorProgram = createProgram(
				gl,
				fullscreenVertexSource,
				predictorFragmentSource,
				'Gray–Scott predictor'
			);
			correctorProgram = createProgram(
				gl,
				fullscreenVertexSource,
				correctorFragmentSource,
				'Gray–Scott Heun corrector'
			);
			interventionProgram = createProgram(
				gl,
				fullscreenVertexSource,
				interventionFragmentSource,
				'reaction–diffusion intervention'
			);
			renderer = new ReactionDiffusionGpuRenderer(gl);
			vao = gl.createVertexArray();
			if (!vao) throw new Error('Could not allocate the fullscreen-triangle vertex array.');
			current = createFloatTextureTarget(gl, this.format, size, packed);
			next = createFloatTextureTarget(gl, this.format, size, packed);
			predicted = createFloatTextureTarget(gl, this.format, size);
			this.programs = {
				predictor: predictorProgram,
				corrector: correctorProgram,
				intervention: interventionProgram
			};
			this.renderer = renderer;
			this.vao = vao;
			this.current = current;
			this.next = next;
			this.predicted = predicted;
		} catch (error) {
			deleteFloatTextureTarget(gl, current);
			deleteFloatTextureTarget(gl, next);
			deleteFloatTextureTarget(gl, predicted);
			if (predictorProgram) gl.deleteProgram(predictorProgram);
			if (correctorProgram) gl.deleteProgram(correctorProgram);
			if (interventionProgram) gl.deleteProgram(interventionProgram);
			renderer?.dispose();
			if (vao) gl.deleteVertexArray(vao);
			throw error;
		}
	}

	private predictorPass(): void {
		const gl = this.gl;
		const program = this.programs!.predictor;
		this.prepareComputePass(program, this.predicted!);
		this.bindTexture(program, 'uState', this.current!.texture, 0);
		this.setPhysicsUniforms(program);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	private correctorPass(): void {
		const gl = this.gl;
		const program = this.programs!.corrector;
		this.prepareComputePass(program, this.next!);
		this.bindTexture(program, 'uOriginalState', this.current!.texture, 0);
		this.bindTexture(program, 'uPredictedState', this.predicted!.texture, 1);
		this.setPhysicsUniforms(program);
		gl.uniform1i(
			requiredUniform(gl, program, 'uIntegrator'),
			this.setup!.integrator === 'heun' ? 1 : 0
		);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	private applyIntervention(intervention: Intervention): void {
		const gl = this.gl;
		const program = this.programs!.intervention;
		this.prepareComputePass(program, this.next!);
		this.bindTexture(program, 'uState', this.current!.texture, 0);
		gl.uniform1i(requiredUniform(gl, program, 'uGridSize'), this.setup!.gridSize);
		gl.uniform1i(requiredUniform(gl, program, 'uKind'), intervention.kind === 'mask' ? 1 : 0);
		gl.uniform1i(requiredUniform(gl, program, 'uTool'), interventionToolIndex(intervention));
		gl.uniform1i(requiredUniform(gl, program, 'uShape'), interventionShapeIndex(intervention));
		gl.uniform2f(requiredUniform(gl, program, 'uFrom'), intervention.from[0], intervention.from[1]);
		gl.uniform2f(requiredUniform(gl, program, 'uTo'), intervention.to[0], intervention.to[1]);
		gl.uniform1f(requiredUniform(gl, program, 'uRadius'), Math.max(0, intervention.radius));
		gl.uniform1f(
			requiredUniform(gl, program, 'uStrength'),
			intervention.kind === 'brush' ? intervention.strength : 1
		);
		gl.uniform1f(
			requiredUniform(gl, program, 'uFalloff'),
			intervention.kind === 'brush' ? intervention.falloff : 0
		);
		gl.uniform1i(
			requiredUniform(gl, program, 'uMaskActive'),
			intervention.kind === 'mask' && intervention.active ? 1 : 0
		);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		[this.current, this.next] = [this.next, this.current];
	}

	private prepareComputePass(program: WebGLProgram, target: FloatTextureTarget): void {
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
		gl.uniform1i(requiredUniform(gl, program, uniformName), unit);
	}

	private setPhysicsUniforms(program: WebGLProgram): void {
		const gl = this.gl;
		const setup = this.setup!;
		const spacing = setup.domainWidth / setup.gridSize;
		gl.uniform1i(requiredUniform(gl, program, 'uGridSize'), setup.gridSize);
		gl.uniform1i(requiredUniform(gl, program, 'uBoundary'), boundaryIndex(setup.boundary));
		gl.uniform1f(requiredUniform(gl, program, 'uInverseSpacingSquared'), 1 / (spacing * spacing));
		gl.uniform1f(requiredUniform(gl, program, 'uDiffusionU'), setup.diffusionU);
		gl.uniform1f(requiredUniform(gl, program, 'uDiffusionV'), setup.diffusionV);
		gl.uniform1f(requiredUniform(gl, program, 'uFeed'), setup.feed);
		gl.uniform1f(requiredUniform(gl, program, 'uKill'), setup.kill);
		gl.uniform1f(requiredUniform(gl, program, 'uTimestep'), setup.timestep);
	}

	private uploadTarget(target: FloatTextureTarget, packed: Float32Array): void {
		const gl = this.gl;
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
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	private rememberRecovery(
		state: FieldState,
		setup: GrayScottSetup,
		clock: ReactionDiffusionGpuClock
	): void {
		this.recoveryState = cloneFieldState(state);
		this.recoverySetup = { ...setup };
		this.recoveryClock = { ...clock };
	}

	private releaseGpuResources(): void {
		if (this.contextLost) {
			this.programs = null;
			this.renderer = null;
			this.vao = null;
			this.current = null;
			this.next = null;
			this.predicted = null;
			return;
		}

		const gl = this.gl;
		deleteFloatTextureTarget(gl, this.current);
		deleteFloatTextureTarget(gl, this.next);
		deleteFloatTextureTarget(gl, this.predicted);
		this.current = null;
		this.next = null;
		this.predicted = null;
		if (this.programs) {
			gl.deleteProgram(this.programs.predictor);
			gl.deleteProgram(this.programs.corrector);
			gl.deleteProgram(this.programs.intervention);
			this.programs = null;
		}
		this.renderer?.dispose();
		this.renderer = null;
		if (this.vao) gl.deleteVertexArray(this.vao);
		this.vao = null;
	}

	private handleContextLost = (event: Event): void => {
		if (this.disposed) return;
		event.preventDefault();
		this.contextLost = true;
		this.callbacks.onContextLost?.(this.clock);
	};

	private handleContextRestored = (): void => {
		if (this.disposed) return;
		this.contextLost = false;
		try {
			this.capabilities = probeFloatRenderTargets(this.gl);
			if (!this.capabilities.selectedFormat)
				throw new FloatFramebufferUnavailableError(this.capabilities);
			this.format = this.capabilities.selectedFormat;
			this.programs = null;
			this.renderer = null;
			this.vao = null;
			this.current = null;
			this.next = null;
			this.predicted = null;
			if (!this.recoverySetup || !this.recoveryState) {
				throw new Error('No CPU checkpoint is available for rebuilding the restored context.');
			}
			this.initialize(this.recoverySetup, this.recoveryState, this.recoveryClock);
			this.callbacks.onContextRestored?.({
				recovered: true,
				checkpointStep: this.recoveryClock.step,
				reason: 'Floating-point resources were rebuilt from the latest CPU checkpoint.'
			});
		} catch (error) {
			this.callbacks.onContextRestored?.({
				recovered: false,
				checkpointStep: this.recoveryClock.step,
				reason:
					error instanceof Error
						? error.message
						: 'The restored context could not rebuild the floating-point solver.'
			});
		}
	};

	private assertUsable(): void {
		if (this.disposed) throw new Error('The reaction–diffusion GPU engine has been disposed.');
		if (this.contextLost || this.gl.isContextLost()) {
			throw new Error('The WebGL context is lost; wait for restoration or switch to CPU mode.');
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
			!this.predicted
		) {
			throw new Error('Initialize the reaction–diffusion GPU engine before using it.');
		}
	}
}

function validateSetupAndState(setup: GrayScottSetup, state: FieldState): void {
	assertValidSetup(setup);
	assertValidFieldState(state);
	if (state.size !== setup.gridSize) throw new Error('Field size must match setup.gridSize.');
}

function validateClock(clock: ReactionDiffusionGpuClock): void {
	if (!Number.isSafeInteger(clock.step) || clock.step < 0)
		throw new Error('Clock step is invalid.');
	if (!Number.isFinite(clock.modelTime) || clock.modelTime < 0)
		throw new Error('Clock model time is invalid.');
}

function packFieldState(state: FieldState): Float32Array {
	const packed = new Float32Array(state.size * state.size * 4);
	for (let index = 0; index < state.u.length; index += 1) {
		if (!Number.isFinite(state.u[index]) || !Number.isFinite(state.v[index])) {
			throw new Error(`Initial concentration at index ${index} is not finite.`);
		}
		if (state.mask[index] !== 0 && state.mask[index] !== 1) {
			throw new Error(`Mask entry at index ${index} must be zero or one.`);
		}
		const offset = index * 4;
		packed[offset] = state.u[index];
		packed[offset + 1] = state.v[index];
		packed[offset + 2] = state.mask[index] === 0 ? 0 : 1;
		packed[offset + 3] = 1;
	}
	return packed;
}

function unpackFieldState(size: number, packed: Float32Array): FieldState {
	const length = size * size;
	const u = new Float64Array(length);
	const v = new Float64Array(length);
	const mask = new Uint8Array(length);
	for (let index = 0; index < length; index += 1) {
		const offset = index * 4;
		u[index] = packed[offset];
		v[index] = packed[offset + 1];
		mask[index] = packed[offset + 2] >= 0.5 ? 1 : 0;
	}
	return { size, u, v, mask };
}

function cloneFieldState(state: FieldState): FieldState {
	return {
		size: state.size,
		u: state.u.slice(),
		v: state.v.slice(),
		mask: state.mask.slice()
	};
}

function groupInterventions(
	interventions: readonly Intervention[]
): ReadonlyMap<number, readonly Intervention[]> {
	const groups = new Map<number, Intervention[]>();
	for (const intervention of orderedInterventions(interventions)) {
		const group = groups.get(intervention.step) ?? [];
		group.push(intervention);
		groups.set(intervention.step, group);
	}
	return groups;
}

function interventionToolIndex(intervention: Intervention): number {
	if (intervention.kind === 'mask') return 0;
	const indices: Record<BrushIntervention['tool'], number> = {
		'add-v': 0,
		'add-u': 1,
		'mixed-pulse': 2,
		'restore-feed': 3,
		'paint-obstacle': 4,
		'erase-obstacle': 5
	};
	return indices[intervention.tool];
}

function interventionShapeIndex(intervention: Intervention): number {
	if (intervention.kind === 'mask') return 3;
	const indices: Record<BrushIntervention['shape'], number> = {
		'soft-disk': 0,
		'hard-disk': 1,
		ring: 2,
		line: 3
	};
	return indices[intervention.shape];
}

function boundaryIndex(boundary: GrayScottSetup['boundary']): number {
	if (boundary === 'periodic') return 0;
	if (boundary === 'no-flux') return 1;
	return 2;
}
