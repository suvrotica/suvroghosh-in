import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';

const componentPath = path.resolve('src/lib/components/blog/YouTube.svelte');
const cacheDirectory = path.resolve('node_modules/.cache');
fs.mkdirSync(cacheDirectory, { recursive: true });
const modulePath = path.join(cacheDirectory, `youtube-ssr-${process.pid}.mjs`);
const compiled = compile(fs.readFileSync(componentPath, 'utf8'), {
	filename: componentPath,
	generate: 'server'
});
fs.writeFileSync(modulePath, compiled.js.code, 'utf8');
let YouTube;
try {
	YouTube = (await import(pathToFileURL(modulePath).href)).default;
} finally {
	fs.unlinkSync(modulePath);
}

const props = {
	src: 'https://youtu.be/FkHa3W4pQME',
	title: 'A presentation',
	caption: 'Original caption'
};

test('deferred video preserves accessible content without an iframe or remote resource', () => {
	const { body } = render(YouTube, { props: { ...props, clickToPlay: true } });
	assert.match(body, /<button[^>]*aria-label="Load YouTube video: A presentation"/);
	assert.match(body, /Original caption/);
	assert.match(body, /Watch on YouTube/);
	assert.doesNotMatch(body, /<iframe|<img|<script|<link/);
});

test('existing article embeds keep their original direct-player behavior', () => {
	const { body } = render(YouTube, { props });
	assert.match(body, /<iframe/);
	assert.match(body, /youtube\.com\/embed\/FkHa3W4pQME/);
	assert.match(body, /title="A presentation"/);
	assert.match(body, /Original caption/);
});

test('playlist links remain available in deferred and existing embeds', () => {
	for (const clickToPlay of [false, true]) {
		const { body } = render(YouTube, {
			props: { ...props, src: `${props.src}?list=PLexample`, clickToPlay }
		});
		assert.match(body, /Open Playlist on YouTube/);
		assert.equal(body.includes('<iframe'), !clickToPlay);
	}
});
