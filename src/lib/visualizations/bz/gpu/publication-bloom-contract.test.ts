import { describe, expect, it } from 'vitest';

import rendererSource from './renderer.ts?raw';
import {
	bloomBlurFragmentSource,
	bloomCompositeFragmentSource,
	bloomExtractFragmentSource,
	displayFragmentSource
} from './shaders';

describe('BZ V2 GPU publication bloom contract', () => {
	it('keeps extraction and blur entirely on the GPU', () => {
		expect(bloomExtractFragmentSource).toContain('texelFetch(uLinearBase');
		expect(bloomExtractFragmentSource).toContain('.a * weight');
		expect(bloomBlurFragmentSource).toContain('for (int offset = -12; offset <= 12; offset += 1)');
		expect(bloomBlurFragmentSource).toContain('uDirection * offset');
		expect(bloomExtractFragmentSource).not.toContain('readPixels');
		expect(bloomBlurFragmentSource).not.toContain('readPixels');
		expect(rendererSource).not.toContain('gl.readPixels');
	});

	it('renders a linear base, reduced highlight targets, two blur directions, then composites', () => {
		expect(displayFragmentSource).toContain('uV2OutputLinear');
		expect(displayFragmentSource).toContain('bloomSource');
		expect(rendererSource).toContain('Math.ceil(width / 4)');
		expect(rendererSource).toContain("'uDirection'), 1, 0");
		expect(rendererSource).toContain("'uDirection'), 0, 1");
		expect(rendererSource).toContain(
			'this.renderPublicationBloom(targets, v2Profile, setup, options.glass !== false)'
		);
		expect(bloomCompositeFragmentSource).toContain('warmHighlight * sampleBlurredHighlight(vUv)');
		expect(bloomCompositeFragmentSource).toContain('acesFitted');
		expect(bloomCompositeFragmentSource).toContain('linearToSrgb');
	});

	it('allocates reusable half-float render targets and releases every resource', () => {
		expect(rendererSource).toContain('gl.RGBA16F');
		expect(rendererSource).toContain(
			'if (existing && existing.width === width && existing.height === height)'
		);
		expect(rendererSource).toContain('this.deletePublicationTargets(this.publicationTargets)');
		expect(rendererSource).toContain('this.gl.deleteProgram(this.bloomCompositeProgram)');
	});
});
