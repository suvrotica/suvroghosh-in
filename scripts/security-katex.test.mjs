import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import katex from 'katex';
import { compile as compileMarkdown } from 'mdsvex';
import remarkMath from 'remark-math';
import rehypeKatexSvelte from 'rehype-katex-svelte';
import { compile as compileSvelte } from 'svelte/compiler';

const require = createRequire(import.meta.url);
// The unsafe URL is rendered to a string only. No browser or network is involved.
const untrustedExpression = String.raw`\href{javascript:alert(1)}{example}`;
const hasUnsafeLink = (html) => /<a\b[^>]*\bhref\s*=\s*["']javascript:/i.test(html);

function withInheritedProperty(name, value, run) {
	const previous = Object.getOwnPropertyDescriptor(Object.prototype, name);
	try {
		Object.defineProperty(Object.prototype, name, { value, writable: true, configurable: true });
		return run();
	} finally {
		if (previous) Object.defineProperty(Object.prototype, name, previous);
		else delete Object.prototype[name];
	}
}

function bridgeRender(expression) {
	const node = {
		type: 'element',
		tagName: 'span',
		properties: { className: ['math', 'math-inline'] },
		children: [{ type: 'text', value: expression }]
	};
	rehypeKatexSvelte()({ type: 'root', children: [node] });
	const directive = node.children[0].value;
	assert.match(directive, /^\{@html [\s\S]+\}$/);
	return JSON.parse(directive.slice('{@html '.length, -1));
}

test('KaTeX rejects trust inherited through a renderer options prototype', () => {
	const html = katex.renderToString(untrustedExpression, Object.create({ trust: true }));
	assert.equal(hasUnsafeLink(html), false);
});

test('KaTeX keeps dangerous commands disabled under inherited settings and metadata pollution', () => {
	for (const [name, value, options] of [
		['trust', true, undefined],
		['default', true, undefined],
		['processor', () => true, { trust: false }]
	]) {
		withInheritedProperty(name, value, () => {
			assert.equal(hasUnsafeLink(katex.renderToString(untrustedExpression, options)), false, name);
		});
	}
});

test('KaTeX rejects an inherited macro definition', () => {
	withInheritedProperty('\\securityfixture', 'x', () => {
		assert.throws(() => katex.renderToString('\\securityfixture'), { name: 'ParseError' });
	});
});

test('the installed Markdown bridge uses a renderer that rejects inherited trust', () => {
	withInheritedProperty('trust', true, () => {
		assert.equal(hasUnsafeLink(bridgeRender(untrustedExpression)), false);
	});
});

test('inline and display math survive the Markdown bridge and compile as Svelte', async () => {
	const source = String.raw`Inline $\frac{x^2}{y}+\sqrt{z}$.

$$
\begin{pmatrix}1&2\\3&4\end{pmatrix}
$$

Untrusted $\href{javascript:alert(1)}{link}$.
`;
	const result = await compileMarkdown(source, {
		remarkPlugins: [remarkMath],
		rehypePlugins: [rehypeKatexSvelte]
	});
	assert.ok(result?.code);
	assert.match(result.code, /katex-display/);
	assert.match(result.code, /encoding=\\"application\/x-tex/);
	assert.doesNotMatch(result.code, /<a\b[^>]*href=\\"javascript:/i);
	assert.doesNotThrow(() =>
		compileSvelte(result.code, { filename: 'security-math-fixture.svelte', generate: 'server' })
	);
});

test('KaTeX stylesheet imports resolve all referenced font assets', async () => {
	const stylesheet = require.resolve('katex/dist/katex.min.css');
	const css = await readFile(stylesheet, 'utf8');
	const fonts = [
		...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1].replace(/["']/g, '')))
	];
	assert.ok(fonts.length > 0, 'the stylesheet must include its math fonts');
	for (const font of fonts) await access(path.resolve(path.dirname(stylesheet), font));
});
