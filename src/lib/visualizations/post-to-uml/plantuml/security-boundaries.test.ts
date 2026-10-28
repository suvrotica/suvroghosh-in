import { describe, expect, it } from 'vitest';
import { sanitizeSvg, checkPlantUmlSecurity } from './security';
import { validateAndRepairPlantUml } from './repair';
import { renderSafeMarkdownPreview } from '../markdown-preview';

describe('UML source and asset boundaries', () => {
	it('strips executable SVG, external references, CSS imports, and animation', () => {
		const result = sanitizeSvg(
			`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><style>@import 'https://example.invalid/a';</style><foreignObject><iframe src="https://example.invalid"></iframe></foreignObject><script>alert(2)</script><image href="https://example.invalid/pixel"/><animate attributeName="href"/><rect fill="url(https://example.invalid/x)" style="fill:red;stroke-width:2"/><text>safe &amp; readable</text></svg>`
		);
		expect(result).not.toMatch(
			/<script|<foreignObject|<iframe|<animate|<image|onload|https:\/\/example|@import/
		);
		expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
		expect(result).toContain('safe &amp; readable');
		expect(result).toContain('fill:red');
	});
	it('keeps internal arrow markers while removing external and encoded references', () => {
		const result = sanitizeSvg(
			'<svg><path marker-end="url(#arrow)" fill="url(&#104;ttps://bad.invalid/x)"/><defs><marker id="arrow"><polygon points="0,0 1,1 0,2"/></marker></defs></svg>'
		);
		expect(result).toContain('marker-end="url(#arrow)"');
		expect(result).not.toContain('bad.invalid');
	});
	it.each([
		'!function $run()',
		'!theme remote',
		'%load_json("secret")',
		'<img:file://secret>',
		'[[https://example.invalid]]'
	])('blocks resource-capable source: %s', (line) => {
		expect(checkPlantUmlSecurity(`@startuml\n${line}\n@enduml`).safe).toBe(false);
	});
	it('does not repair unsupported syntax by silently deleting it', () => {
		const result = validateAndRepairPlantUml(
			'@startuml\nclass A\nunrecognized but important statement\n@enduml',
			'class'
		);
		expect(result.validationStatus).toBe('invalid');
		expect(result.sourceCode).not.toContain("' unrecognized");
		expect(result.sourceCode).toContain('unrecognized but important statement');
	});
	it('preserves inert article code including event attributes as visible text', () => {
		const result = renderSafeMarkdownPreview('Example: `<img onerror="explain()">`');
		expect(result).toContain('onerror=&quot;explain()&quot;');
		expect(result).not.toContain('<img');
	});
});
