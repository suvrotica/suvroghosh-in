import { BZ_SAFE_LIMITS } from '../constants';
import type { BZFieldMetrics } from '../types';
import type { BZFloatFramebufferFormat } from './capabilities';
import telemetryInitialFragmentSource from './shaders/telemetry-initial.frag?raw';
import telemetryReduceFragmentSource from './shaders/telemetry-reduce.frag?raw';
import fullscreenVertexSource from './shaders/fullscreen.vert?raw';
import {
	createBZFloatTextureTarget,
	createBZProgram,
	deleteBZFloatTextureTarget,
	requiredBZUniform,
	type BZFloatTextureTarget
} from './webgl-utils';

export { telemetryInitialFragmentSource, telemetryReduceFragmentSource };

export const BZ_GPU_TELEMETRY_READ_TEXELS = 5 as const;
export const BZ_GPU_TELEMETRY_FINAL_TEXTURE = Object.freeze([1, 1] as const);

const MODE_STATISTIC_U = 0;
const MODE_STATISTIC_V = 1;
const MODE_RANGE = 2;
const MODE_HEALTH = 3;
const MODE_EXCITED = 4;
const FLOAT32_EPSILON = 2 ** -23;

const TELEMETRY_FORMAT = (gl: WebGL2RenderingContext): BZFloatFramebufferFormat => ({
	id: 'rgba32f',
	label: 'RGBA32F',
	internalFormat: gl.RGBA32F,
	uploadType: gl.FLOAT,
	readType: gl.FLOAT,
	bytesPerComponent: 4
});

export interface BZGpuTelemetryReduction {
	readonly metrics: BZFieldMetrics;
	readonly healthy: boolean;
	readonly maximumAbsoluteValue: number;
	readonly materiallyNegativeCells: number;
	readonly nonFiniteCells: number;
	readonly finiteActiveCells: number;
	readonly excitationVarianceResolved: boolean;
	readonly reason: string;
	readonly reductionPasses: number;
	readonly reductionReadbacks: typeof BZ_GPU_TELEMETRY_READ_TEXELS;
	readonly finalTexture: typeof BZ_GPU_TELEMETRY_FINAL_TEXTURE;
}

export interface BZGpuTelemetryMemoryEstimate {
	readonly targetCount: number;
	readonly textureBytes: number;
	readonly format: 'RGBA32F';
}

type ReadFinalPixel = (framebuffer: WebGLFramebuffer, output: Float32Array) => void;

export function bzGpuTelemetryPyramidSizes(sourceSize: number): readonly number[] {
	if (!Number.isSafeInteger(sourceSize) || sourceSize < 2) {
		throw new RangeError('BZ telemetry source size must be an integer of at least two.');
	}
	const sizes: number[] = [];
	let size = sourceSize;
	do {
		size = Math.ceil(size / 2);
		sizes.push(size);
	} while (size > 1);
	return sizes;
}

export function estimateBZGpuTelemetryTextureBytes(sourceSize: number): number {
	return bzGpuTelemetryPyramidSizes(sourceSize).reduce(
		(total, size) => total + size * size * 4 * 4,
		0
	);
}

/**
 * Reusable RGBA32F 2×2 reduction pyramid. Five modes are evaluated at each
 * telemetry sample, but JavaScript reads only five final 1×1 pixels. The
 * scientific state texture is sampled read-only and is never rebound as an
 * output target.
 */
export class BZGpuTelemetryReducer {
	private readonly initialProgram: WebGLProgram;
	private readonly reductionProgram: WebGLProgram;
	private readonly vao: WebGLVertexArrayObject;
	private readonly targets: readonly BZFloatTextureTarget[];
	private readonly targetSizes: readonly number[];
	private destroyed = false;

	constructor(
		private readonly gl: WebGL2RenderingContext,
		readonly sourceSize: number,
		private readonly readFinalPixel: ReadFinalPixel
	) {
		const sizes = bzGpuTelemetryPyramidSizes(sourceSize);
		if (typeof readFinalPixel !== 'function') {
			throw new TypeError('BZ telemetry requires a bounded final-pixel reader.');
		}
		let initialProgram: WebGLProgram | null = null;
		let reductionProgram: WebGLProgram | null = null;
		let vao: WebGLVertexArrayObject | null = null;
		const targets: BZFloatTextureTarget[] = [];
		const targetSizes: number[] = [];
		try {
			initialProgram = createBZProgram(
				gl,
				fullscreenVertexSource,
				telemetryInitialFragmentSource,
				'BZ telemetry initial reduction'
			);
			reductionProgram = createBZProgram(
				gl,
				fullscreenVertexSource,
				telemetryReduceFragmentSource,
				'BZ telemetry pyramid reduction'
			);
			vao = gl.createVertexArray();
			if (!vao) throw new Error('Could not allocate the BZ telemetry vertex array.');
			const format = TELEMETRY_FORMAT(gl);
			for (const size of sizes) {
				targetSizes.push(size);
				targets.push(createBZFloatTextureTarget(gl, format, size));
			}
		} catch (error) {
			for (const target of targets) deleteBZFloatTextureTarget(gl, target);
			if (vao) gl.deleteVertexArray(vao);
			if (initialProgram) gl.deleteProgram(initialProgram);
			if (reductionProgram) gl.deleteProgram(reductionProgram);
			throw error;
		}
		this.initialProgram = initialProgram;
		this.reductionProgram = reductionProgram;
		this.vao = vao;
		this.targets = targets;
		this.targetSizes = targetSizes;
	}

	get memoryEstimate(): BZGpuTelemetryMemoryEstimate {
		return {
			targetCount: this.targets.length,
			textureBytes: this.targetSizes.reduce((total, size) => total + size * size * 4 * 4, 0),
			format: 'RGBA32F'
		};
	}

	sample(
		stateTexture: WebGLTexture,
		absoluteLimit = BZ_SAFE_LIMITS.stateAbsoluteMaximum,
		negativeTolerance = BZ_SAFE_LIMITS.negativeTolerance
	): BZGpuTelemetryReduction {
		this.assertUsable();
		if (!Number.isFinite(absoluteLimit) || absoluteLimit <= 0) {
			throw new RangeError('BZ telemetry absolute limit must be finite and positive.');
		}
		if (!Number.isFinite(negativeTolerance) || negativeTolerance < 0) {
			throw new RangeError('BZ telemetry negative tolerance must be finite and non-negative.');
		}
		const previous = captureGlState(this.gl);
		try {
			this.gl.bindVertexArray(this.vao);
			this.gl.disable(this.gl.BLEND);
			this.gl.disable(this.gl.DEPTH_TEST);
			this.gl.disable(this.gl.SCISSOR_TEST);
			this.gl.disable(this.gl.CULL_FACE);
			this.gl.disable(this.gl.RASTERIZER_DISCARD);
			this.gl.colorMask(true, true, true, true);
			const statisticU = this.runMode(stateTexture, MODE_STATISTIC_U, 0, negativeTolerance, false);
			const statisticV = this.runMode(stateTexture, MODE_STATISTIC_V, 0, negativeTolerance, false);
			const range = this.runMode(stateTexture, MODE_RANGE, 0, negativeTolerance, false);
			const health = this.runMode(stateTexture, MODE_HEALTH, 0, negativeTolerance, false);
			const preliminary = deriveBZGpuTelemetryReduction(
				statisticU,
				statisticV,
				range,
				health,
				new Float32Array([0, 0, 0, 0]),
				absoluteLimit,
				this.targetSizes.length * 4
			);
			const threshold =
				preliminary.metrics.meanU + Math.sqrt(Math.max(0, preliminary.metrics.varianceU));
			const excited = this.runMode(
				stateTexture,
				MODE_EXCITED,
				threshold,
				negativeTolerance,
				preliminary.excitationVarianceResolved
			);
			return deriveBZGpuTelemetryReduction(
				statisticU,
				statisticV,
				range,
				health,
				excited,
				absoluteLimit,
				this.targetSizes.length * 5
			);
		} finally {
			restoreGlState(this.gl, previous);
		}
	}

	destroy(contextLost = false): void {
		if (this.destroyed) return;
		this.destroyed = true;
		if (contextLost) return;
		for (const target of this.targets) deleteBZFloatTextureTarget(this.gl, target);
		this.gl.deleteVertexArray(this.vao);
		this.gl.deleteProgram(this.initialProgram);
		this.gl.deleteProgram(this.reductionProgram);
	}

	private runMode(
		stateTexture: WebGLTexture,
		mode: number,
		excitationThreshold: number,
		negativeTolerance: number,
		excitationEnabled: boolean
	): Float32Array {
		const gl = this.gl;
		const first = this.targets[0];
		gl.bindFramebuffer(gl.FRAMEBUFFER, first.framebuffer);
		gl.viewport(0, 0, this.targetSizes[0], this.targetSizes[0]);
		gl.useProgram(this.initialProgram);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, stateTexture);
		gl.uniform1i(requiredBZUniform(gl, this.initialProgram, 'uState'), 0);
		gl.uniform1i(requiredBZUniform(gl, this.initialProgram, 'uSourceSize'), this.sourceSize);
		gl.uniform1i(requiredBZUniform(gl, this.initialProgram, 'uMode'), mode);
		gl.uniform1f(
			requiredBZUniform(gl, this.initialProgram, 'uExcitationThreshold'),
			excitationThreshold
		);
		gl.uniform1f(
			requiredBZUniform(gl, this.initialProgram, 'uNegativeTolerance'),
			negativeTolerance
		);
		gl.uniform1i(
			requiredBZUniform(gl, this.initialProgram, 'uExcitationEnabled'),
			excitationEnabled ? 1 : 0
		);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		for (let level = 1; level < this.targets.length; level += 1) {
			const source = this.targets[level - 1];
			const target = this.targets[level];
			gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
			gl.viewport(0, 0, this.targetSizes[level], this.targetSizes[level]);
			gl.useProgram(this.reductionProgram);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, source.texture);
			gl.uniform1i(requiredBZUniform(gl, this.reductionProgram, 'uReduction'), 0);
			gl.uniform1i(
				requiredBZUniform(gl, this.reductionProgram, 'uSourceSize'),
				this.targetSizes[level - 1]
			);
			gl.uniform1i(requiredBZUniform(gl, this.reductionProgram, 'uMode'), mode);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		}
		const result = new Float32Array(4);
		this.readFinalPixel(this.targets.at(-1)!.framebuffer, result);
		return result;
	}

	private assertUsable(): void {
		if (this.destroyed) throw new Error('The BZ GPU telemetry reducer has been destroyed.');
	}
}

/** Pure final-pixel decoding, exported for deterministic CPU contract tests. */
export function deriveBZGpuTelemetryReduction(
	statisticU: ArrayLike<number>,
	statisticV: ArrayLike<number>,
	range: ArrayLike<number>,
	health: ArrayLike<number>,
	excited: ArrayLike<number>,
	absoluteLimit: number,
	reductionPasses: number
): BZGpuTelemetryReduction {
	for (const [label, values] of [
		['u statistic', statisticU],
		['v statistic', statisticV],
		['range', range],
		['health', health],
		['excitation', excited]
	] as const) {
		if (values.length !== 4)
			throw new RangeError(`BZ ${label} reduction must contain four values.`);
		for (let index = 0; index < 4; index += 1) {
			if (!Number.isFinite(values[index])) {
				throw new RangeError(`BZ ${label} reduction contains a non-finite value.`);
			}
		}
	}
	if (!Number.isFinite(absoluteLimit) || absoluteLimit <= 0) {
		throw new RangeError('BZ telemetry absolute limit must be finite and positive.');
	}
	if (!Number.isSafeInteger(reductionPasses) || reductionPasses < 1) {
		throw new RangeError('BZ telemetry reduction pass count is invalid.');
	}
	const activeCells = Math.round(health[0]);
	if (activeCells < 1) throw new RangeError('BZ telemetry found no active chemistry cells.');
	const finiteActiveCellsU = Math.round(statisticU[0]);
	const finiteActiveCellsV = Math.round(statisticV[0]);
	if (finiteActiveCellsU !== finiteActiveCellsV) {
		throw new RangeError('BZ telemetry finite-cell statistic counts disagree.');
	}
	const finiteActiveCells = finiteActiveCellsU;
	if (finiteActiveCells < 1 || finiteActiveCells > activeCells) {
		throw new RangeError('BZ telemetry found an invalid finite active-cell count.');
	}
	const meanU = statisticU[1];
	const meanV = statisticV[1];
	const varianceU = Math.max(0, statisticU[2] / finiteActiveCells);
	const varianceV = Math.max(0, statisticV[2] / finiteActiveCells);
	const excitationVarianceResolved = isResolvedFloat32Variance(varianceU, meanU);
	const materiallyNegativeCells = Math.max(0, Math.round(health[2]));
	const nonFiniteCells = Math.max(0, Math.round(health[3]));
	const maximumAbsoluteValue = health[1];
	const healthy =
		nonFiniteCells === 0 && materiallyNegativeCells === 0 && maximumAbsoluteValue <= absoluteLimit;
	const reason =
		nonFiniteCells > 0
			? `${nonFiniteCells} active cells contain non-finite concentrations; aggregate moments describe the remaining ${finiteActiveCells} finite active cells only, and no repair was applied.`
			: materiallyNegativeCells > 0
				? `${materiallyNegativeCells} active cells contain materially negative concentrations; no clamp was applied.`
				: maximumAbsoluteValue > absoluteLimit
					? `An active-cell concentration exceeded ${absoluteLimit}; no clamp was applied.`
					: 'Reduced active-cell concentrations are finite and within the diagnostic safety bounds.';
	return {
		metrics: {
			activeCells,
			meanU,
			meanV,
			varianceU,
			varianceV,
			minimumU: range[0],
			maximumU: range[1],
			minimumV: range[2],
			maximumV: range[3],
			excitedFraction: excitationVarianceResolved
				? Math.min(1, Math.max(0, excited[0] / activeCells))
				: 0
		},
		healthy,
		maximumAbsoluteValue,
		materiallyNegativeCells,
		nonFiniteCells,
		finiteActiveCells,
		excitationVarianceResolved,
		reason,
		reductionPasses,
		reductionReadbacks: BZ_GPU_TELEMETRY_READ_TEXELS,
		finalTexture: BZ_GPU_TELEMETRY_FINAL_TEXTURE
	};
}

function isResolvedFloat32Variance(variance: number, mean: number): boolean {
	const concentrationResolution = Math.max(1, Math.abs(mean)) * FLOAT32_EPSILON * 4;
	return variance > concentrationResolution * concentrationResolution;
}

interface CapturedGlState {
	readonly drawFramebuffer: WebGLFramebuffer | null;
	readonly readFramebuffer: WebGLFramebuffer | null;
	readonly program: WebGLProgram | null;
	readonly vao: WebGLVertexArrayObject | null;
	readonly viewport: readonly [number, number, number, number];
	readonly activeTexture: number;
	readonly activeTextureBinding: WebGLTexture | null;
	readonly texture0Binding: WebGLTexture | null;
	readonly blend: boolean;
	readonly depth: boolean;
	readonly scissor: boolean;
	readonly cull: boolean;
	readonly rasterizerDiscard: boolean;
	readonly colourMask: readonly [boolean, boolean, boolean, boolean];
}

function captureGlState(gl: WebGL2RenderingContext): CapturedGlState {
	const activeTexture = Number(gl.getParameter(gl.ACTIVE_TEXTURE));
	const activeTextureBinding = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
	gl.activeTexture(gl.TEXTURE0);
	const texture0Binding = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
	gl.activeTexture(activeTexture);
	const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
	const colourMask = gl.getParameter(gl.COLOR_WRITEMASK) as readonly boolean[];
	return {
		drawFramebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
		readFramebuffer: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
		program: gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null,
		vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null,
		viewport: [viewport[0], viewport[1], viewport[2], viewport[3]],
		activeTexture,
		activeTextureBinding,
		texture0Binding,
		blend: gl.isEnabled(gl.BLEND),
		depth: gl.isEnabled(gl.DEPTH_TEST),
		scissor: gl.isEnabled(gl.SCISSOR_TEST),
		cull: gl.isEnabled(gl.CULL_FACE),
		rasterizerDiscard: gl.isEnabled(gl.RASTERIZER_DISCARD),
		colourMask: [colourMask[0], colourMask[1], colourMask[2], colourMask[3]]
	};
}

function restoreGlState(gl: WebGL2RenderingContext, state: Readonly<CapturedGlState>): void {
	gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, state.drawFramebuffer);
	gl.bindFramebuffer(gl.READ_FRAMEBUFFER, state.readFramebuffer);
	gl.useProgram(state.program);
	gl.bindVertexArray(state.vao);
	gl.viewport(...state.viewport);
	setEnabled(gl, gl.BLEND, state.blend);
	setEnabled(gl, gl.DEPTH_TEST, state.depth);
	setEnabled(gl, gl.SCISSOR_TEST, state.scissor);
	setEnabled(gl, gl.CULL_FACE, state.cull);
	setEnabled(gl, gl.RASTERIZER_DISCARD, state.rasterizerDiscard);
	gl.colorMask(...state.colourMask);
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, state.texture0Binding);
	gl.activeTexture(state.activeTexture);
	gl.bindTexture(gl.TEXTURE_2D, state.activeTextureBinding);
}

function setEnabled(gl: WebGL2RenderingContext, capability: number, enabled: boolean): void {
	if (enabled) gl.enable(capability);
	else gl.disable(capability);
}
