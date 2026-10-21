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
		topic = true
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
		`---\ntitle: Fixture article\ncategory: Test\npublished: true\n---\n[Topic](${target})\n`
	);
	if (topic) write(`src/lib/topics/${filename}.md`, `---\n${frontmatter}\n---\nTopic text.\n`);
	if (handler) write('src/routes/topics/[slug]/+page.svelte', '<h1>Topic</h1>\n');
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
