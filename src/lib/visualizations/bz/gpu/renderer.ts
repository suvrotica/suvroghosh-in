import { recoveredStateForSetup } from '../reactions';
import {
	createBZDivergingLutV2,
	createBZPaletteLutV2,
	createBZPhaseLutV2,
	type BZRenderProfileV2
} from '../v2-display';
import type { BZDisplayState, BZPalette, BZSetup, BZViewMode } from '../types';
import {
	bloomBlurFragmentSource,
	bloomCompositeFragmentSource,
	bloomExtractFragmentSource,
	displayFragmentSource,
	fullscreenVertexSource
} from './shaders';
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
	/** Fixed-range, linear-light V2 publication display. Omit for the legacy laboratory view. */
	readonly v2Profile?: Readonly<BZRenderProfileV2> | null;
}

interface BZPublicationTargets {
	readonly width: number;
	readonly height: number;
	readonly bloomWidth: number;
	readonly bloomHeight: number;
	readonly baseTexture: WebGLTexture;
	readonly baseFramebuffer: WebGLFramebuffer;
	readonly bloomTextureA: WebGLTexture;
	readonly bloomFramebufferA: WebGLFramebuffer;
	readonly bloomTextureB: WebGLTexture;
	readonly bloomFramebufferB: WebGLFramebuffer;
}

export class BZGpuRenderer {
	private readonly program: WebGLProgram;
	private readonly bloomExtractProgram: WebGLProgram;
	private readonly bloomBlurProgram: WebGLProgram;
	private readonly bloomCompositeProgram: WebGLProgram;
	private readonly phaseLut: WebGLTexture;
	private readonly paletteLut: WebGLTexture;
	private readonly divergingLut: WebGLTexture;
	private paletteLutKey = '';
	private publicationTargets: BZPublicationTargets | null = null;
	private destroyed = false;

	constructor(private readonly gl: WebGL2RenderingContext) {
		this.program = createBZProgram(
			gl,
			fullscreenVertexSource,
			displayFragmentSource,
			'BZ scientific display'
		);
		this.bloomExtractProgram = createBZProgram(
			gl,
			fullscreenVertexSource,
			bloomExtractFragmentSource,
			'BZ publication highlight extraction'
		);
		this.bloomBlurProgram = createBZProgram(
			gl,
			fullscreenVertexSource,
			bloomBlurFragmentSource,
			'BZ publication highlight blur'
		);
		this.bloomCompositeProgram = createBZProgram(
			gl,
			fullscreenVertexSource,
			bloomCompositeFragmentSource,
			'BZ publication linear-light composite'
		);
		this.phaseLut = createLinearLutTexture(gl, createBZPhaseLutV2());
		this.paletteLut = createLinearLutTexture(gl, createBZPaletteLutV2('scientific'));
		this.divergingLut = createLinearLutTexture(gl, createBZDivergingLutV2());
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

		const v2Profile = options.v2Profile ?? null;
		const publicationBloom =
			v2Profile !== null &&
			v2Profile.bloom > 0 &&
			options.view === 'dish' &&
			(v2Profile.style === 'luminous-composite' || v2Profile.style === 'ferroin-proxy');
		const targets = publicationBloom
			? this.ensurePublicationTargets(gl.drawingBufferWidth, gl.drawingBufferHeight)
			: null;
		gl.bindFramebuffer(gl.FRAMEBUFFER, targets?.baseFramebuffer ?? null);
		gl.viewport(
			0,
			0,
			targets?.width ?? gl.drawingBufferWidth,
			targets?.height ?? gl.drawingBufferHeight
		);
		gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.SCISSOR_TEST);
		gl.useProgram(this.program);
		// Uploading a changed palette LUT binds on the currently active texture unit.
		// Do that before unit 0 receives the numerical state, then bind the state last.
		this.bindV2Luts(v2Profile);
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
		setV2DisplayUniforms(gl, this.program, v2Profile, targets !== null);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.activeTexture(gl.TEXTURE3);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, null);
		if (targets && v2Profile) {
			this.renderPublicationBloom(targets, v2Profile, setup, options.glass !== false);
		}
	}

	private renderPublicationBloom(
		targets: Readonly<BZPublicationTargets>,
		profile: Readonly<BZRenderProfileV2>,
		setup: Readonly<BZSetup>,
		glass: boolean
	): void {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, targets.bloomFramebufferA);
		gl.viewport(0, 0, targets.bloomWidth, targets.bloomHeight);
		gl.useProgram(this.bloomExtractProgram);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, targets.baseTexture);
		gl.uniform1i(requiredBZUniform(gl, this.bloomExtractProgram, 'uLinearBase'), 0);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		const radius = Math.max(
			1,
			Math.min(
				12,
				Math.round(
					(profile.bloomRadius * Math.min(targets.bloomWidth, targets.bloomHeight)) / setup.gridSize
				)
			)
		);
		gl.useProgram(this.bloomBlurProgram);
		gl.uniform1i(requiredBZUniform(gl, this.bloomBlurProgram, 'uHighlight'), 0);
		gl.uniform1i(requiredBZUniform(gl, this.bloomBlurProgram, 'uRadius'), radius);
		gl.bindFramebuffer(gl.FRAMEBUFFER, targets.bloomFramebufferB);
		gl.bindTexture(gl.TEXTURE_2D, targets.bloomTextureA);
		gl.uniform2i(requiredBZUniform(gl, this.bloomBlurProgram, 'uDirection'), 1, 0);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindFramebuffer(gl.FRAMEBUFFER, targets.bloomFramebufferA);
		gl.bindTexture(gl.TEXTURE_2D, targets.bloomTextureB);
		gl.uniform2i(requiredBZUniform(gl, this.bloomBlurProgram, 'uDirection'), 0, 1);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, targets.width, targets.height);
		gl.useProgram(this.bloomCompositeProgram);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, targets.baseTexture);
		gl.uniform1i(requiredBZUniform(gl, this.bloomCompositeProgram, 'uLinearBase'), 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, targets.bloomTextureA);
		gl.uniform1i(requiredBZUniform(gl, this.bloomCompositeProgram, 'uBlurredHighlight'), 1);
		gl.uniform4f(
			requiredBZUniform(gl, this.bloomCompositeProgram, 'uTreatment'),
			profile.exposure,
			profile.bloom,
			profile.highlight,
			profile.saturation
		);
		gl.uniform2f(
			requiredBZUniform(gl, this.bloomCompositeProgram, 'uShape'),
			profile.contrast,
			profile.gamma
		);
		gl.uniform1i(requiredBZUniform(gl, this.bloomCompositeProgram, 'uGlass'), glass ? 1 : 0);
		gl.uniform1i(
			requiredBZUniform(gl, this.bloomCompositeProgram, 'uGeometry'),
			setup.geometry === 'circular-dish' ? 0 : 1
		);
		gl.uniform1f(
			requiredBZUniform(gl, this.bloomCompositeProgram, 'uActiveRadiusFraction'),
			setup.activeRadius / setup.domainSize
		);
		gl.uniform2f(
			requiredBZUniform(gl, this.bloomCompositeProgram, 'uViewportSize'),
			targets.width,
			targets.height
		);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	private ensurePublicationTargets(width: number, height: number): BZPublicationTargets {
		const existing = this.publicationTargets;
		if (existing && existing.width === width && existing.height === height) return existing;
		if (existing) this.deletePublicationTargets(existing);
		const bloomWidth = Math.max(1, Math.ceil(width / 4));
		const bloomHeight = Math.max(1, Math.ceil(height / 4));
		const base = createRenderTarget(this.gl, width, height, 'linear base');
		const bloomA = createRenderTarget(this.gl, bloomWidth, bloomHeight, 'highlight A');
		const bloomB = createRenderTarget(this.gl, bloomWidth, bloomHeight, 'highlight B');
		this.publicationTargets = {
			width,
			height,
			bloomWidth,
			bloomHeight,
			baseTexture: base.texture,
			baseFramebuffer: base.framebuffer,
			bloomTextureA: bloomA.texture,
			bloomFramebufferA: bloomA.framebuffer,
			bloomTextureB: bloomB.texture,
			bloomFramebufferB: bloomB.framebuffer
		};
		return this.publicationTargets;
	}

	private deletePublicationTargets(targets: Readonly<BZPublicationTargets>): void {
		this.gl.deleteTexture(targets.baseTexture);
		this.gl.deleteFramebuffer(targets.baseFramebuffer);
		this.gl.deleteTexture(targets.bloomTextureA);
		this.gl.deleteFramebuffer(targets.bloomFramebufferA);
		this.gl.deleteTexture(targets.bloomTextureB);
		this.gl.deleteFramebuffer(targets.bloomFramebufferB);
	}

	private bindV2Luts(profile: Readonly<BZRenderProfileV2> | null): void {
		const palette = profile?.palette ?? 'scientific';
		if (palette !== this.paletteLutKey) {
			uploadLinearLutTexture(this.gl, this.paletteLut, createBZPaletteLutV2(palette));
			this.paletteLutKey = palette;
		}
		this.gl.activeTexture(this.gl.TEXTURE1);
		this.gl.bindTexture(this.gl.TEXTURE_2D, this.phaseLut);
		this.gl.activeTexture(this.gl.TEXTURE2);
		this.gl.bindTexture(this.gl.TEXTURE_2D, this.paletteLut);
		this.gl.activeTexture(this.gl.TEXTURE3);
		this.gl.bindTexture(this.gl.TEXTURE_2D, this.divergingLut);
		this.gl.activeTexture(this.gl.TEXTURE0);
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.gl.deleteTexture(this.phaseLut);
		this.gl.deleteTexture(this.paletteLut);
		this.gl.deleteTexture(this.divergingLut);
		if (this.publicationTargets) this.deletePublicationTargets(this.publicationTargets);
		this.publicationTargets = null;
		this.gl.deleteProgram(this.bloomExtractProgram);
		this.gl.deleteProgram(this.bloomBlurProgram);
		this.gl.deleteProgram(this.bloomCompositeProgram);
		this.gl.deleteProgram(this.program);
	}
}

function createRenderTarget(
	gl: WebGL2RenderingContext,
	width: number,
	height: number,
	label: string
): { readonly texture: WebGLTexture; readonly framebuffer: WebGLFramebuffer } {
	const texture = gl.createTexture();
	const framebuffer = gl.createFramebuffer();
	if (!texture || !framebuffer) {
		if (texture) gl.deleteTexture(texture);
		if (framebuffer) gl.deleteFramebuffer(framebuffer);
		throw new Error(`Could not allocate the BZ publication ${label} target.`);
	}
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
	const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.bindTexture(gl.TEXTURE_2D, null);
	if (status !== gl.FRAMEBUFFER_COMPLETE) {
		gl.deleteTexture(texture);
		gl.deleteFramebuffer(framebuffer);
		throw new Error(
			`BZ publication ${label} framebuffer is incomplete (0x${status.toString(16)}).`
		);
	}
	return { texture, framebuffer };
}

function createLinearLutTexture(gl: WebGL2RenderingContext, data: Float32Array): WebGLTexture {
	const texture = gl.createTexture();
	if (!texture) throw new Error('The BZ display LUT texture could not be allocated.');
	uploadLinearLutTexture(gl, texture, data);
	return texture;
}

function uploadLinearLutTexture(
	gl: WebGL2RenderingContext,
	texture: WebGLTexture,
	data: Float32Array
): void {
	if (data.length % 3 !== 0 || data.length < 6) {
		throw new RangeError('A BZ display LUT requires at least two RGB samples.');
	}
	const rgba = new Float32Array((data.length / 3) * 4);
	for (let source = 0, target = 0; source < data.length; source += 3, target += 4) {
		rgba[target] = data[source];
		rgba[target + 1] = data[source + 1];
		rgba[target + 2] = data[source + 2];
		rgba[target + 3] = 1;
	}
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, rgba.length / 4, 1, 0, gl.RGBA, gl.FLOAT, rgba);
	gl.bindTexture(gl.TEXTURE_2D, null);
}

function setV2DisplayUniforms(
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	profile: Readonly<BZRenderProfileV2> | null,
	outputLinear: boolean
): void {
	const range = (key: keyof BZRenderProfileV2['ranges']): readonly [number, number] => {
		const value = profile?.ranges[key];
		return value ? [value.minimum, value.maximum] : [0, 1];
	};
	const uniformRange = (name: string, key: keyof BZRenderProfileV2['ranges']) => {
		const value = range(key);
		gl.uniform2f(requiredBZUniform(gl, program, name), value[0], value[1]);
	};
	gl.uniform1i(requiredBZUniform(gl, program, 'uV2Display'), profile ? 1 : 0);
	gl.uniform1i(
		requiredBZUniform(gl, program, 'uV2Style'),
		profile?.style === 'ferroin-proxy'
			? 1
			: profile?.style === 'phase-spectrum'
				? 2
				: profile?.style === 'scientific'
					? 3
					: 0
	);
	uniformRange('uV2RangeU', 'u');
	uniformRange('uV2RangeV', 'v');
	uniformRange('uV2RangeReaction', 'reaction-u');
	uniformRange('uV2RangeDiffusion', 'diffusion-u');
	uniformRange('uV2RangeNet', 'net-u');
	uniformRange('uV2RangeFront', 'front');
	uniformRange('uV2RangeDifference', 'difference-from-mean');
	gl.uniform4f(
		requiredBZUniform(gl, program, 'uV2Phase'),
		profile?.phase.centreU ?? 0,
		profile?.phase.centreV ?? 0,
		profile?.phase.scaleU ?? 1,
		profile?.phase.scaleV ?? 1
	);
	gl.uniform4f(
		requiredBZUniform(gl, program, 'uV2Treatment'),
		profile?.exposure ?? 1,
		profile?.bloom ?? 0,
		profile?.highlight ?? 0,
		profile?.saturation ?? 1
	);
	gl.uniform4f(
		requiredBZUniform(gl, program, 'uV2LuminousMix'),
		profile?.luminousMix.phaseWeight ?? 1,
		profile?.luminousMix.recoveryWeight ?? 0,
		profile?.luminousMix.frontWeight ?? 0,
		0
	);
	gl.uniform4f(
		requiredBZUniform(gl, program, 'uV2FerroinMix'),
		profile?.ferroinMix.recoveryWeight ?? 0,
		profile?.ferroinMix.activatorLuminanceWeight ?? 0,
		profile?.ferroinMix.gradientHighlightWeight ?? 0,
		0
	);
	gl.uniform3f(
		requiredBZUniform(gl, program, 'uV2Shape'),
		profile?.frontScale ?? 1,
		profile?.contrast ?? 1,
		profile?.gamma ?? 1
	);
	gl.uniform2f(
		requiredBZUniform(gl, program, 'uV2Bloom'),
		profile?.bloomThreshold ?? 0.52,
		profile?.bloomRadius ?? 1
	);
	gl.uniform1i(requiredBZUniform(gl, program, 'uV2OutputLinear'), outputLinear ? 1 : 0);
	gl.uniform1i(requiredBZUniform(gl, program, 'uV2PhaseLut'), 1);
	gl.uniform1i(requiredBZUniform(gl, program, 'uV2PaletteLut'), 2);
	gl.uniform1i(requiredBZUniform(gl, program, 'uV2DivergingLut'), 3);
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
