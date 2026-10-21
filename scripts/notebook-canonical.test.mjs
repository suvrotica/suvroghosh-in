import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { readPostFrontmatter } from './lib/post-metadata.mjs';

const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const notebookSlugs = ['perceptron-from-scratch-in-mojo', 'xor-with-multiple-perceptrons-in-mojo'];

test('embedded notebook exports identify their actual published parent articles without conflicting directives', () => {
	for (const slug of notebookSlugs) {
		const metadata = readPostFrontmatter(`src/lib/posts/${slug}.md`);
		assert.notEqual(metadata.published, false);
		const category = metadata.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
		const source = `/notebooks/${slug}.html`;
		const policy = config.headers.filter((entry) => entry.source === source);
		assert.equal(policy.length, 1);
		assert.deepEqual(policy[0].headers, [
			{
				key: 'Link',
				value: `<https://www.suvroghosh.in/blog/${category}/${slug}>; rel="canonical"`
			}
		]);
		const html = fs.readFileSync(`static${source}`, 'utf8');
		assert.doesNotMatch(html, /<link\b[^>]*\brel=["']canonical["']/i);
		assert.doesNotMatch(html, /<meta\b[^>]*\bcontent=["'][^"']*noindex/i);
		assert.equal(metadata.notebook, slug);
	}
});

test('notebook policy preserves the existing global security and static cache headers', () => {
	const global = config.headers.find((entry) => entry.source === '/(.*)');
	assert.deepEqual(Object.fromEntries(global.headers.map(({ key, value }) => [key, value])), {
		'X-Frame-Options': 'DENY',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
	});
	const cache = config.headers.find(
		(entry) => entry.source === '/(thumbnail|wordcloud|notebooks)/(.*)'
	);
	assert.ok(
		cache.headers.some(({ key, value }) => key === 'Cache-Control' && value.includes('s-maxage='))
	);
});
