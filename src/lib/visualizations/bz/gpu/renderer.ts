import { recoveredStateForSetup } from '../reactions';
import type { BZDisplayState, BZPalette, BZSetup, BZViewMode } from '../types';
import { displayFragmentSource, fullscreenVertexSource } from './shaders';
import { createBZProgram, requiredBZUniform } from './webgl-utils';

export const BZ_VIEW_MODE_INDEX: Readonly<Record<BZViewMode, number>> = Object.freeze({
	dish: 0,
	u: 1,
	v: 2,
	'reaction-u': 3,
	'diffusion-u': 4,
	'net-u': 5,
	mask: 6,
	'difference-from-mean': 7
});

export const BZ_PALETTE_INDEX: Readonly<Record<BZPalette, number>> = Object.freeze({
	ferroin: 0,
	cerium: 1,
	'phase-spectrum': 2,
	scientific: 3,
	'high-contrast': 4
});

export interface BZGpuActiveMeans {
	readonly u: number;
	readonly v: number;
}

export interface BZGpuRenderOptions extends BZDisplayState {
	/** Fixed display normalization; it never changes scientific state. */
	readonly diagnosticScale?: number;
	readonly exposure?: number;
	readonly gamma?: number;
	readonly glass?: boolean;
	/** Supply measured active-area means for phase and difference views. */
	readonly activeMeans?: Readonly<BZGpuActiveMeans>;
}

export class BZGpuRenderer {
	private readonly program: WebGLProgram;
	private destroyed = false;

	constructor(private readonly gl: WebGL2RenderingContext) {
		this.program = createBZProgram(
			gl,
			fullscreenVertexSource,
			displayFragmentSource,
			'BZ scientific display'
		);
	}

	render(
		state: WebGLTexture,
		setup: Readonly<BZSetup>,
		options: BZGpuRenderOptions,
		fallbackActiveMeans?: Readonly<BZGpuActiveMeans>
	): void {
		if (this.destroyed) throw new Error('The BZ GPU renderer has been destroyed.');
		const gl = this.gl;
		const means = options.activeMeans ?? fallbackActiveMeans ?? recoveredStateForSetup(setup);
		if (!Number.isFinite(means.u) || !Number.isFinite(means.v)) {
			throw new RangeError('BZ display active means must be finite.');
		}
		const diagnosticScale = positiveOr(options.diagnosticScale, 1);
		const exposure = positiveOr(options.exposure, 1);
		const gamma = positiveOr(options.gamma, 1);
		const spacing = setup.domainSize / setup.gridSize;
		const view = BZ_VIEW_MODE_INDEX[options.view];
		const palette = BZ_PALETTE_INDEX[options.palette];
		if (view === undefined || palette === undefined) {
			throw new RangeError('BZ display view or palette is not recognised.');
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.SCISSOR_TEST);
		gl.useProgram(this.program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, state);
		gl.uniform1i(requiredBZUniform(gl, this.program, 'uState'), 0);
		gl.uniform1i(requiredBZUniform(gl, this.program, 'uGridSize'), setup.gridSize);
		gl.uniform1i(requiredBZUniform(gl, this.program, 'uPeriodic'), periodicIndex(setup));
		gl.uniform1i(
			requiredBZUniform(gl, this.program, 'uGeometry'),
			setup.geometry === 'circular-dish' ? 0 : 1
		);
		gl.uniform1i(
			requiredBZUniform(gl, this.program, 'uModel'),
			setup.model === 'oregonator' ? 0 : 1
		);
		gl.uniform1i(requiredBZUniform(gl, this.program, 'uView'), view);
		gl.uniform1i(requiredBZUniform(gl, this.program, 'uPalette'), palette);
		gl.uniform1f(
			requiredBZUniform(gl, this.program, 'uActiveRadiusFraction'),
			setup.activeRadius / setup.domainSize
		);
		gl.uniform1f(requiredBZUniform(gl, this.program, 'uSpacingSquared'), spacing * spacing);
		gl.uniform1f(requiredBZUniform(gl, this.program, 'uDiffusionU'), setup.diffusionU);
		gl.uniform1f(requiredBZUniform(gl, this.program, 'uDiffusionV'), setup.diffusionV);
		setModelUniforms(gl, this.program, setup);
		gl.uniform2f(requiredBZUniform(gl, this.program, 'uActiveMean'), means.u, means.v);
		gl.uniform1f(requiredBZUniform(gl, this.program, 'uDiagnosticScale'), diagnosticScale);
		gl.uniform1f(requiredBZUniform(gl, this.program, 'uExposure'), exposure);
		gl.uniform1f(requiredBZUniform(gl, this.program, 'uGammaDisplay'), gamma);
		gl.uniform1i(requiredBZUniform(gl, this.program, 'uGlass'), options.glass === false ? 0 : 1);
		gl.uniform2f(
			requiredBZUniform(gl, this.program, 'uViewportSize'),
			gl.drawingBufferWidth,
			gl.drawingBufferHeight
		);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.gl.deleteProgram(this.program);
	}
}

function setModelUniforms(
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	setup: Readonly<BZSetup>
): void {
	const oregonator = setup.model === 'oregonator' ? setup.parameters : null;
	const schnakenberg = setup.model === 'schnakenberg' ? setup.parameters : null;
	gl.uniform1f(requiredBZUniform(gl, program, 'uEpsilon'), oregonator?.epsilon ?? 1);
	gl.uniform1f(requiredBZUniform(gl, program, 'uQ'), oregonator?.q ?? 1);
	gl.uniform1f(requiredBZUniform(gl, program, 'uF'), oregonator?.f ?? 0);
	gl.uniform1f(requiredBZUniform(gl, program, 'uA'), schnakenberg?.a ?? 0);
	gl.uniform1f(requiredBZUniform(gl, program, 'uB'), schnakenberg?.b ?? 0);
	gl.uniform1f(requiredBZUniform(gl, program, 'uGamma'), schnakenberg?.gamma ?? 1);
}

function periodicIndex(setup: Readonly<BZSetup>): number {
	return setup.boundary === 'periodic' && setup.geometry === 'square' ? 1 : 0;
}

function positiveOr(value: number | undefined, fallback: number): number {
	return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}
