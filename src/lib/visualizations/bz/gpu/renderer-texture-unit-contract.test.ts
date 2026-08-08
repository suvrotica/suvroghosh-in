import { describe, expect, it } from 'vitest';
import rendererSource from './renderer.ts?raw';

function between(source: string, start: string, end: string): string {
	const startIndex = source.indexOf(start);
	const endIndex = source.indexOf(end, startIndex + start.length);
	if (startIndex < 0 || endIndex < 0) {
		throw new Error(`Could not find renderer contract section ${start}…${end}.`);
	}
	return source.slice(startIndex, endIndex);
}

describe('BZ V2 renderer texture-unit binding contract', () => {
	it('uploads and binds changed LUTs before binding the scientific state to unit 0', () => {
		const render = between(rendererSource, '\n\trender(', '\n\tprivate renderPublicationBloom');
		const bindLuts = render.indexOf('this.bindV2Luts(v2Profile)');
		const bindState = render.indexOf('gl.bindTexture(gl.TEXTURE_2D, state)');
		const draw = render.indexOf('gl.drawArrays(gl.TRIANGLES, 0, 3)');

		expect(bindLuts).toBeGreaterThanOrEqual(0);
		expect(bindState).toBeGreaterThan(bindLuts);
		expect(draw).toBeGreaterThan(bindState);
		expect(render.slice(bindLuts, bindState)).toContain('gl.activeTexture(gl.TEXTURE0)');

		// Once unit 0 receives the scientific texture, no LUT upload or rebinding may
		// displace it before the display draw consumes uState.
		const stateBindingToDraw = render.slice(bindState, draw);
		expect(stateBindingToDraw.match(/bindTexture\(/gu)).toHaveLength(1);
		expect(stateBindingToDraw).not.toContain('bindV2Luts');
		expect(stateBindingToDraw).not.toContain('uploadLinearLutTexture');
	});

	it('returns LUT binding to texture unit 0 without binding a replacement there', () => {
		const bindV2Luts = between(rendererSource, '\n\tprivate bindV2Luts(', '\n\tdestroy(): void');
		const upload = bindV2Luts.indexOf('uploadLinearLutTexture');
		const phaseUnit = bindV2Luts.indexOf('this.gl.activeTexture(this.gl.TEXTURE1)');
		const returnToStateUnit = bindV2Luts.lastIndexOf('this.gl.activeTexture(this.gl.TEXTURE0)');

		expect(upload).toBeGreaterThanOrEqual(0);
		expect(phaseUnit).toBeGreaterThan(upload);
		expect(returnToStateUnit).toBeGreaterThan(phaseUnit);
		expect(bindV2Luts.slice(returnToStateUnit)).not.toContain('bindTexture');
	});
});
