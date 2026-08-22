import { describe, expect, it } from 'vitest';
import { createDefaultExplorerState } from './url-state';
import { pngMetadata, wrapPngText, type PngExportOptions } from './export';

function options(overrides: Partial<PngExportOptions> = {}): PngExportOptions {
	return {
		source: { width: 800, height: 600 } as HTMLCanvasElement,
		state: createDefaultExplorerState(),
		functionLabel: 'f(z) = z',
		heightDefinition: 'explicit selected transform',
		...overrides
	};
}

describe('domain-colouring PNG metadata', () => {
	it('requires and preserves the explicit selected height definition', () => {
		const metadata = pngMetadata(
			options({
				heightDefinition: 'hᴄ(z) = sᴄ · clip(Qₐ(Im f(z)), −Kᴄ, Kᴄ), a = 0.5, sᴄ = 2, Kᴄ = 4'
			})
		);

		expect(metadata.heightDefinition).toContain('Im f(z)');
		expect(metadata.heightDefinition).toContain('a = 0.5');
		expect(metadata.heightDefinition).not.toContain('log cap');
	});

	it('preserves explicit sheet indices and inner/outer radial bounds', () => {
		const metadata = pngMetadata(
			options({
				domainLabel: 'Sheet indices k = −3, …, +3 · radial bounds r = 0.12…3.5',
				heightDefinition: 'Log sheet projection: height (theta + 2πk)/π; colour ln r.'
			})
		);

		expect(metadata.domainLabel).toBe('Sheet indices k = −3, …, +3 · radial bounds r = 0.12…3.5');
	});

	it('wraps a maximum-length expression and ellipsizes instead of clipping it', () => {
		const expression = `f(z) = ${'sin(z)+'.repeat(24)}cos(z)`;
		const measure = (value: string) => value.length * 8;
		const lines = wrapPngText(expression, 240, measure, 2);

		expect(lines).toHaveLength(2);
		expect(lines[1]).toMatch(/…$/);
		for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(240);
		expect(lines.join('').length).toBeGreaterThan(30);
	});
});
