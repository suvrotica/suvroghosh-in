import {
	DISPLAY_MODE_INDEX,
	DISPLAY_MODE_METADATA,
	PALETTE_INDEX,
	normalizeDiagnosticScale,
	type ReactionDiffusionRenderOptions
} from '../display';
import type { GrayScottSetup } from '../types';
import { fullscreenVertexSource, renderFragmentSource } from './shaders';
import { createProgram, requiredUniform } from './webgl-utils';

export { DISPLAY_MODE_METADATA };
export type { DisplayModeMetadata, ReactionDiffusionRenderOptions } from '../display';

export class ReactionDiffusionGpuRenderer {
	private readonly program: WebGLProgram;

	constructor(private readonly gl: WebGL2RenderingContext) {
		this.program = createProgram(
			gl,
			fullscreenVertexSource,
			renderFragmentSource,
			'reaction–diffusion display'
		);
	}

	render(
		state: WebGLTexture,
		setup: GrayScottSetup,
		options: ReactionDiffusionRenderOptions
	): void {
		const gl = this.gl;
		const spacing = setup.domainWidth / setup.gridSize;
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.SCISSOR_TEST);
		gl.useProgram(this.program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, state);
		gl.uniform1i(requiredUniform(gl, this.program, 'uState'), 0);
		gl.uniform1i(requiredUniform(gl, this.program, 'uGridSize'), setup.gridSize);
		gl.uniform1i(requiredUniform(gl, this.program, 'uBoundary'), boundaryIndex(setup.boundary));
		gl.uniform1i(
			requiredUniform(gl, this.program, 'uDisplayMode'),
			DISPLAY_MODE_INDEX[options.mode]
		);
		gl.uniform1i(requiredUniform(gl, this.program, 'uPalette'), PALETTE_INDEX[options.palette]);
		gl.uniform1f(
			requiredUniform(gl, this.program, 'uInverseSpacingSquared'),
			1 / (spacing * spacing)
		);
		gl.uniform1f(requiredUniform(gl, this.program, 'uDiffusionV'), setup.diffusionV);
		gl.uniform1f(requiredUniform(gl, this.program, 'uFeed'), setup.feed);
		gl.uniform1f(requiredUniform(gl, this.program, 'uKill'), setup.kill);
		gl.uniform1f(
			requiredUniform(gl, this.program, 'uDiagnosticScale'),
			normalizeDiagnosticScale(options.diagnosticScale)
		);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	dispose(): void {
		this.gl.deleteProgram(this.program);
	}
}

function boundaryIndex(boundary: GrayScottSetup['boundary']): number {
	if (boundary === 'periodic') return 0;
	if (boundary === 'no-flux') return 1;
	return 2;
}
