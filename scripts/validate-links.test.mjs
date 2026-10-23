import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const validator = fileURLToPath(new URL('./validate-links.mjs', import.meta.url));
const fixturePrefix = 'suvro-validate-links-';

function validateFixture(
	t,
	{
		target = '/topics/valid-topic',
		filename = 'valid-topic',
		frontmatter = 'slug: valid-topic\npublished: true',
		handler = true,
		topic = true,
		body = `[Topic](${target})\n`,
		topicBody = 'Topic text.\n',
		files = {}
	} = {}
) {
	const temporaryRoot = fs.realpathSync(os.tmpdir());
	const directory = fs.mkdtempSync(path.join(temporaryRoot, fixturePrefix));
	const resolvedFixture = fs.realpathSync(directory);
	t.after(() => {
		const cleanupTarget = fs.realpathSync(directory);
		assert.equal(cleanupTarget, resolvedFixture);
		assert.equal(path.dirname(cleanupTarget), temporaryRoot);
		assert.ok(path.basename(cleanupTarget).startsWith(fixturePrefix));
		fs.rmSync(cleanupTarget, { recursive: true, force: true });
	});

	function write(relativePath, text) {
		const filename = path.join(directory, relativePath);
		fs.mkdirSync(path.dirname(filename), { recursive: true });
		fs.writeFileSync(filename, text, 'utf8');
	}

	write('src/lib/content/posts.ts', 'export const postPathAliases = {};\n');
	write('src/lib/topics/README.md', '# Topic authoring documentation\n');
	write(
		'src/lib/posts/example.md',
		`---\ntitle: Fixture article\ncategory: Test\npublished: true\n---\n${body}`
	);
	if (topic) write(`src/lib/topics/${filename}.md`, `---\n${frontmatter}\n---\n${topicBody}`);
	if (handler) write('src/routes/topics/[slug]/+page.svelte', '<h1>Topic</h1>\n');
	for (const [filename, text] of Object.entries(files)) write(filename, text);
	const result = spawnSync(process.execPath, [validator], {
		cwd: directory,
		encoding: 'utf8',
		timeout: 10_000
	});
	assert.ifError(result.error);
	return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

for (const frontmatter of ['slug: valid-topic\npublished: true', 'slug: valid-topic']) {
	test(`accepts a published canonical topic backed by the dynamic route: ${frontmatter}`, (t) => {
		const result = validateFixture(t, { frontmatter });
		assert.equal(result.status, 0, result.output);
		assert.match(result.output, /1 published topic routes/);
	});
}

test('rejects a missing topic instead of allowing arbitrary dynamic topic paths', (t) => {
	const result = validateFixture(t, { topic: false });
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /internal link \/topics\/valid-topic has no matching route/);
});

test('rejects an unpublished topic', (t) => {
	const result = validateFixture(t, { frontmatter: 'slug: valid-topic\npublished: false' });
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /internal link \/topics\/valid-topic has no matching route/);
});

test('rejects a topic without its actual dynamic page handler', (t) => {
	const result = validateFixture(t, { handler: false });
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /internal link \/topics\/valid-topic has no matching route/);
});

test('does not treat a valid topic as permission for arbitrary nested paths', (t) => {
	const result = validateFixture(t, { target: '/topics/valid-topic/unknown' });
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /internal link \/topics\/valid-topic\/unknown has no matching route/);
});

test('does not invent a public topic route for the authoring README', (t) => {
	const result = validateFixture(t, { target: '/topics/README' });
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /internal link \/topics\/README has no matching route/);
	assert.doesNotMatch(result.output, /README\.md must begin with/);
});

for (const fixture of [
	{ frontmatter: 'slug: other-topic' },
	{ frontmatter: 'title: Missing slug' },
	{ filename: 'Invalid-Topic', frontmatter: 'slug: Invalid-Topic' }
]) {
	test(`rejects invalid topic slug metadata: ${fixture.frontmatter}`, (t) => {
		const result = validateFixture(t, fixture);
		assert.equal(result.status, 1, result.output);
		assert.match(result.output, /topic slug must match its lowercase kebab-case filename/);
	});
}

test('rejects invalid topic YAML rather than silently inventing a route', (t) => {
	const result = validateFixture(t, {
		frontmatter: 'slug: valid-topic\nslug: duplicate-topic'
	});
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /has invalid YAML frontmatter/);
});

test('checks canonical and apex absolute URLs and same-site protocol-relative URLs', (t) => {
	const targets = [
		'https://www.suvroghosh.in/missing-canonical?from=footer#item',
		'https://suvroghosh.in/missing-apex',
		'//www.suvroghosh.in/missing-protocol-relative',
		'//suvroghosh.in/missing-protocol-relative-apex'
	];
	const result = validateFixture(t, {
		body: targets.map((target) => `[Broken](${target})`).join('\n')
	});
	assert.equal(result.status, 1, result.output);
	for (const target of targets)
		assert.ok(
			result.output.includes(`internal link ${target} has no matching route`),
			result.output
		);
});

test('resolves relative Markdown/reference links and preserves encoded filenames and balanced parentheses', (t) => {
	const result = validateFixture(t, {
		body: [
			'[Same category](example?mode=reading#heading)',
			'[Topic](../../topics/valid-topic)',
			'[Download][spec]',
			'[Encoded](/files/caf%C3%A9%20notes.pdf)',
			'[Protocol relative](//suvroghosh.in/topics/valid-topic/)',
			'[Absolute](https://www.suvroghosh.in/topics/valid-topic?from=footer#heading)',
			'',
			'[spec]: /files/spec(v1).pdf "Specification"'
		].join('\n'),
		files: {
			'static/files/spec(v1).pdf': 'fixture',
			'static/files/café notes.pdf': 'fixture'
		}
	});
	assert.equal(result.status, 0, result.output);
	assert.match(result.output, /6 references/);
});

test('does not mistake Markdown examples, escaped links, unused definitions or comments for navigation', (t) => {
	const result = validateFixture(t, {
		body: [
			'[Topic](/topics/valid-topic)',
			'`[Example](/inline-code-example)`',
			'\\[Escaped](/escaped-example)',
			'',
			'```html',
			'<a href="/fenced-code-example">Example</a>',
			'[Code](/fenced-markdown-example)',
			'```',
			'',
			'<!-- <a href="/comment-example">Example</a> -->',
			'',
			'[unused]: /unused-definition-example'
		].join('\n')
	});
	assert.equal(result.status, 0, result.output);
	assert.match(result.output, /1 references/);
});

test('reports reference-link errors at the source use, and checks literal HTML links in Markdown', (t) => {
	const result = validateFixture(t, {
		body: '[Used][target]\n\n[target]: /missing-reference-target\n\n<a href="/missing-html-target">Broken</a>\n',
		topicBody: '[Missing in topic](/missing-topic-body)\n',
		frontmatter:
			'slug: valid-topic\nreadingPaths:\n  beginner:\n    items:\n      - /missing-topic-metadata'
	});
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /posts\/example\.md:6: internal link \/missing-reference-target/);
	for (const target of ['missing-html-target', 'missing-topic-body', 'missing-topic-metadata']) {
		assert.ok(
			result.output.includes(`internal link /${target} has no matching route`),
			result.output
		);
	}
});

test('checks literal navigation in Svelte/TypeScript and config/data/content registries', (t) => {
	const result = validateFixture(t, {
		files: {
			'src/routes/about/+page.svelte':
				'<a href="../missing-relative">Broken</a><a href={"/missing-expression"}>Broken</a><a href={resolve("/missing-resolve")}>Broken</a>',
			'src/lib/components/Footer.svelte':
				'<script>const links = [{href: "/missing-footer-array"}];</script><a href="https://suvroghosh.in/missing-footer-absolute">Broken</a>',
			'src/lib/config/navigation.ts':
				'export const navigation = {href: "/missing-config", url: "//suvroghosh.in/missing-config-url"};',
			'src/lib/content/navigation.ts': 'export const navigation = {path: "/missing-content"};',
			'src/lib/data/navigation.ts': 'export const navigation = {action: "/missing-data"};',
			'src/lib/data/links.json': '{"links":[{"href":"/missing-json"}]}',
			'src/routes/redirect/+page.server.ts': 'redirect(308, "/missing-redirect");'
		}
	});
	assert.equal(result.status, 1, result.output);
	for (const target of [
		'../missing-relative',
		'/missing-expression',
		'/missing-resolve',
		'/missing-footer-array',
		'https://suvroghosh.in/missing-footer-absolute',
		'/missing-config',
		'//suvroghosh.in/missing-config-url',
		'/missing-content',
		'/missing-data',
		'/missing-json',
		'/missing-redirect'
	])
		assert.ok(
			result.output.includes(`internal link ${target} has no matching route`),
			result.output
		);
});

test('resolves static route-relative links and excludes source comments, test fixtures, types and computed route IDs', (t) => {
	const result = validateFixture(t, {
		files: {
			'src/routes/guide/chapter/+page.svelte':
				'<script>const route = resolve("/blog/[category]/[slug]", {category: "test", slug: "example"});</script><!-- <a href="/comment">Example</a> --><a href="destination?mode=read#heading">Next</a><a href={"../about"}>About</a>',
			'src/routes/guide/destination/+page.svelte': '<h1>Destination</h1>',
			'src/routes/about/+page.svelte': '<h1>About</h1>',
			'src/lib/config/navigation.ts':
				'// const link = {href: "/comment-example"};\ntype Link = {href: "/type-example"};\nconst link = {href: `/about`};',
			'src/lib/data/navigation.test.ts': 'export const fixture = {href: "/intentional-test-error"};'
		}
	});
	assert.equal(result.status, 0, result.output);
});

test('ignores JSON command action strings in TypeScript, Svelte scripts and inline handlers', (t) => {
	const result = validateFixture(t, {
		files: {
			'src/routes/commands/+page.server.ts':
				'export const payloads = [{action: "moderate"}, {"action": `read`}, {action: "reply"}];',
			'src/routes/commands/+page.svelte':
				'<script lang="ts">const payload = {action: "moderate"}; const command = {"action": `read`}; const send = (data: unknown) => data;</script><button onclick={() => send({action: "reply"})}>Reply</button>',
			'src/lib/data/commands.json':
				'{"commands":[{"action":"moderate"},{"action":"read"},{"action":"reply"}]}'
		}
	});
	assert.equal(result.status, 0, result.output);
	assert.match(result.output, /1 references/);
});

test('still checks path-like action properties and all literal DOM form action destinations', (t) => {
	const result = validateFixture(t, {
		body: '<form action="missing-markdown-submit"><button>Send</button></form>',
		files: {
			'src/routes/commands/+page.server.ts':
				'export const destinations = [{action: "/missing-action-root"}, {action: "./missing-action-relative"}, {action: "../missing-action-parent"}, {action: "https://suvroghosh.in/missing-action-absolute"}, {action: "//suvroghosh.in/missing-action-protocol-relative"}, {href: "missing-href"}, {path: "missing-path"}, {url: "missing-url"}];',
			'src/routes/commands/+page.svelte':
				'<script>const destination = {action: "/missing-svelte-action"}; const query = {action: "?view=pending"};</script><button onclick={() => ({action: "./missing-inline-action"})}>Submit</button><form action="missing-form-submit"><button>Send</button></form><form action={"missing-form-expression"}><button>Send</button></form>'
		}
	});
	assert.equal(result.status, 1, result.output);
	for (const target of [
		'/missing-action-root',
		'./missing-action-relative',
		'../missing-action-parent',
		'https://suvroghosh.in/missing-action-absolute',
		'//suvroghosh.in/missing-action-protocol-relative',
		'missing-href',
		'missing-path',
		'missing-url',
		'/missing-svelte-action',
		'./missing-inline-action',
		'missing-form-submit',
		'missing-form-expression',
		'missing-markdown-submit'
	]) {
		assert.ok(
			result.output.includes(`internal link ${target} has no matching route`),
			result.output
		);
	}
	assert.doesNotMatch(result.output, /internal link \?view=pending/);
});

test('does not accept a static directory as a downloadable file', (t) => {
	const result = validateFixture(t, {
		target: '/files',
		files: { 'static/files/download.pdf': 'fixture' }
	});
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /internal link \/files has no matching route or static file/);
});

test('static destinations require exact directory and filename case on every operating system', (t) => {
	const result = validateFixture(t, {
		body: [
			'[Exact](/files/Guide.PDF)',
			'[Wrong filename](/files/guide.pdf)',
			'[Wrong directory](/Files/Guide.PDF)'
		].join('\n'),
		files: { 'static/files/Guide.PDF': 'fixture' }
	});
	assert.equal(result.status, 1, result.output);
	assert.match(
		result.output,
		/internal link \/files\/guide.pdf has no matching route or static file/
	);
	assert.match(
		result.output,
		/internal link \/Files\/Guide.PDF has no matching route or static file/
	);
	assert.ok(!result.output.includes('internal link /files/Guide.PDF'), result.output);
	assert.match(result.output, /failed with 2 issue\(s\)/);
});

test('rejects malformed percent encoding and encoded path separators instead of accepting another route', (t) => {
	const result = validateFixture(t, {
		body: '[Malformed](/files/%ZZ.pdf)\n[Encoded separator](/topics%2Fvalid-topic)\n'
	});
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /malformed internal link \/files\/%ZZ.pdf/);
	assert.match(result.output, /malformed internal link \/topics%2Fvalid-topic/);
});

function resourceMarkdown({ published = true, body = 'Resource text.\n' } = {}) {
	return `---
title: Fixture prompt
description: A useful fixture prompt description with at least fifty characters.
date: '2026-10-22'
kind: prompt
tags: [Fixture]
published: ${published}
thumbnail: /images/resources/fixture.webp
thumbnailAlt: An illustrated fixture notebook on a wooden table
estimatedLength: 1 prompt
language: en
---
${body}`;
}

test('recognises only published canonical resource paths with their actual handler', (t) => {
	const result = validateFixture(t, {
		target: '/resources/prompts/fixture',
		files: {
			'src/lib/prompts/fixture.md': resourceMarkdown(),
			'src/routes/resources/[kind=resourceKind]/[slug]/+page.svelte': '<h1>Resource</h1>'
		}
	});
	assert.equal(result.status, 0, result.output);
	assert.match(result.output, /1 published resource routes/);
});

test('checks published resource body links and rejects unpublished, missing and nested resource paths', (t) => {
	const result = validateFixture(t, {
		body: '[Unpublished](/resources/prompts/unpublished)\n[Missing](/resources/prompts/missing)\n[Nested](/resources/prompts/fixture/missing)\n',
		files: {
			'src/lib/prompts/fixture.md': resourceMarkdown({
				body: '[Broken](/missing-resource-body)\n'
			}),
			'src/lib/prompts/unpublished.md': resourceMarkdown({
				published: false,
				body: '[Draft](/ignored-draft-body)\n'
			}),
			'src/routes/resources/[kind=resourceKind]/[slug]/+page.svelte': '<h1>Resource</h1>'
		}
	});
	assert.equal(result.status, 1, result.output);
	for (const target of [
		'/resources/prompts/unpublished',
		'/resources/prompts/missing',
		'/resources/prompts/fixture/missing',
		'/missing-resource-body'
	]) {
		assert.ok(
			result.output.includes(`internal link ${target} has no matching route`),
			result.output
		);
	}
	assert.doesNotMatch(result.output, /ignored-draft-body/);
});

test('does not invent resource routes when the dynamic handler is missing', (t) => {
	const result = validateFixture(t, {
		target: '/resources/prompts/fixture',
		files: { 'src/lib/prompts/fixture.md': resourceMarkdown() }
	});
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /internal link \/resources\/prompts\/fixture has no matching route/);
});

test('rejects redirect aliases, wrong post categories, unpublished posts and sources outside runtime globs', (t) => {
	const result = validateFixture(t, {
		body: [
			'[Legacy](https://www.suvroghosh.in/blog/test/legacy)',
			'[Wrong category](/blog/other/example)',
			'[Draft](/blog/test/draft)',
			'[Archived source](/blog/test/archived)',
			'[Nested resource source](/resources/prompts/nested)'
		].join('\n'),
		files: {
			'src/lib/content/posts.ts':
				'export const postPathAliases = {"test/legacy":"/blog/test/example"};',
			'src/lib/posts/draft.md':
				'---\ncategory: Test\npublished: false\n---\n[Draft link](/ignored-unpublished-post-link)',
			'src/lib/posts/archive/archived.md':
				'---\ncategory: Test\npublished: true\n---\n[Archived link](/ignored-archive-link)',
			'src/lib/prompts/archive/nested.md': resourceMarkdown(),
			'src/routes/resources/[kind=resourceKind]/[slug]/+page.svelte': '<h1>Resource</h1>'
		}
	});
	assert.equal(result.status, 1, result.output);
	assert.match(
		result.output,
		/uses a redirect alias; use the canonical destination \/blog\/test\/example/
	);
	assert.match(
		result.output,
		/non-canonical post link \/blog\/other\/example; use \/blog\/test\/example/
	);
	for (const target of ['/blog/test/draft', '/blog/test/archived', '/resources/prompts/nested']) {
		assert.ok(
			result.output.includes(`internal link ${target} has no matching route`),
			result.output
		);
	}
	assert.doesNotMatch(result.output, /ignored-unpublished-post-link|ignored-archive-link/);
});

test('does not classify other hosts, external protocols or fragments as internal destinations', (t) => {
	const result = validateFixture(t, {
		body: [
			'[External](https://example.org/topics/missing)',
			'[Lookalike host](https://www.suvroghosh.in.example.org/missing)',
			'[Subdomain](https://record.suvroghosh.in/guide/)',
			'[Protocol relative external](//example.org/missing)',
			'[Email](mailto:contact@suvroghosh.in)',
			'[Telephone](tel:+910000000000)',
			'[Fragment](#heading)'
		].join('\n')
	});
	assert.equal(result.status, 0, result.output);
	assert.match(result.output, /0 references/);
	assert.match(
		result.output,
		/Fragments, computed URLs and shared-component relative links require the rendered navigation audit/
	);
});
