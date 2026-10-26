import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = parse(
	readFileSync(new URL('../.github/workflows/feature-artifacts.yml', import.meta.url), 'utf8')
);
const criticalWorkflow = parse(
	readFileSync(new URL('../.github/workflows/critical-boundaries.yml', import.meta.url), 'utf8')
);
const featureChecks = [
	'strange-matter:assets:check',
	'living-systems:assets:check',
	'lens-mirror:samples:check',
	'lens-mirror:poster:check',
	'http-tcp:geometry',
	'http-tcp:assets:check',
	'maker-collection:geometry',
	'maker-collection:assets:check',
	'shape-of-waiting:assets:check',
	'probabilistic-piano:assets:check',
	'barnum-lab:surface-bank',
	'barnum-lab:editorial-review',
	'barnum-lab:surface-audit:check',
	'bias-archipelago:data:validate',
	'bias-archipelago:sources:check',
	'bias-archipelago:layout:check',
	'bz:assets:check',
	'bz:checkpoint-posters:check',
	'bz:manifest:check',
	'prior-authorization:assets:check',
	'strange-attractor-orchestra:assets:check',
	'mrinmoyee:assets:check',
	'scale-elevator:assets:check'
];

// Resolve reachable npm scripts, including npm's automatic pre/post lifecycle hooks.
// This catches indirect additions to content:generate as well as top-level command changes.
function npmExecution(name, stack = []) {
	assert.ok(scripts[name], `Missing npm script: ${name}`);
	assert.ok(!stack.includes(name), `Recursive npm invocation: ${[...stack, name].join(' -> ')}`);
	const next = [...stack, name];
	const executeBody = (scriptName) => [
		{ script: scriptName },
		...scripts[scriptName].split(/\s+&&\s+/u).flatMap((command) => {
			const invocation = /^npm run ([a-z0-9:-]+)$/u.exec(command);
			return invocation ? npmExecution(invocation[1], next) : [{ command }];
		})
	];
	return [
		...(scripts[`pre${name}`] ? executeBody(`pre${name}`) : []),
		...executeBody(name),
		...(scripts[`post${name}`] ? executeBody(`post${name}`) : [])
	];
}

function matchesPaths(file, patterns) {
	let included = false;
	for (const pattern of patterns) {
		const excluded = pattern.startsWith('!');
		if (posix.matchesGlob(file, excluded ? pattern.slice(1) : pattern)) included = !excluded;
	}
	return included;
}

function browserConfig(environment, file = 'playwright.http-tcp.config.ts') {
	const env = { ...process.env };
	for (const name of ['CI', 'PLAYWRIGHT_CHANNEL']) delete env[name];
	Object.assign(env, environment);
	const result = spawnSync(
		process.execPath,
		[
			'--input-type=module',
			'-e',
			`import config from './${file}';
			 console.log(JSON.stringify(config.use));`
		],
		{ cwd: new URL('..', import.meta.url), env, encoding: 'utf8', timeout: 10_000 }
	);
	assert.equal(result.status, 0, result.error?.message ?? result.stderr);
	return JSON.parse(result.stdout);
}

test('feature browser selection matches the full Chromium installed by feature CI', () => {
	const steps = workflow.jobs['feature-artifacts'].steps;
	const install = steps.findIndex((step) => /playwright install/u.test(step.run ?? ''));
	assert.ok(install >= 0, 'feature CI must install its browser');
	assert.match(steps[install].run, /--no-shell\b/u);
	assert.match(steps[install].run, /\bchromium\b/u);
	for (const script of [
		'links:browser:test',
		'http-tcp:browser:test',
		'living-systems:browser:test',
		'strange-matter:browser:test'
	]) {
		assert.ok(
			steps.findIndex((step) => step.run === `npm run ${script}`) > install,
			`${script} must run after browser installation`
		);
	}
	for (const file of [
		'playwright.http-tcp.config.ts',
		'playwright.living-systems.config.ts',
		'playwright.strange-matter.config.ts'
	]) {
		for (const environment of [{ CI: '1' }, { CI: '1', PLAYWRIGHT_CHANNEL: '  ' }]) {
			const use = browserConfig(environment, file);
			assert.equal(use.browserName, 'chromium');
			assert.equal(use.headless, true);
			assert.equal(use.channel, 'chromium', '--no-shell requires the full Chromium channel');
		}
		assert.equal(browserConfig({}, file).channel, 'chrome', 'local runs retain installed Chrome');
		assert.equal(
			browserConfig({ CI: '1', PLAYWRIGHT_CHANNEL: ' msedge ' }, file).channel,
			'msedge',
			'explicit channel overrides remain supported and trimmed'
		);
	}
});

test('routine builds retain publishing checks without reaching feature audits or notebook rendering', () => {
	const events = npmExecution('build');
	const reached = events.flatMap((event) => (event.script ? [event.script] : []));
	for (const expected of [
		'content:generate',
		'tags:generate',
		'music:generate',
		'images:optimize',
		'sketches:generate',
		'gallery:generate',
		'validate:content',
		'validate:resources',
		'validate:contrast',
		'validate:seo',
		'validate:media',
		'search:index',
		'validate:links',
		'validate:discoverability'
	]) {
		assert.ok(reached.includes(expected), `Routine build must retain ${expected}`);
	}
	for (const excluded of [...featureChecks, 'features:check', 'barnum-lab:route-assets']) {
		assert.ok(!reached.includes(excluded), `Routine build must not reach ${excluded}`);
	}
	assert.equal(reached.filter((name) => name === 'prebuild').length, 1);
	assert.equal(events.filter((event) => event.command === 'vite build').length, 1);
	assert.ok(events.some((event) => event.command === 'python scripts/prebuild_wordclouds.py'));
	assert.ok(!events.some((event) => /notebook/iu.test(event.script ?? event.command)));
	assert.ok(
		events.findIndex((event) => event.command === 'vite build') <
			events.findIndex((event) => event.script === 'validate:discoverability')
	);
});

test('Google narration remains an explicit authoring command outside automatic build/dev lifecycles', () => {
	assert.match(scripts['narration:generate'], /node .*scripts\/article-narration\.mjs/u);
	for (const entry of ['dev', 'build', 'build:full', 'preview']) {
		const events = npmExecution(entry);
		assert.ok(
			!events.some((event) =>
				/article-narration\.mjs|narration:generate/u.test(event.script ?? event.command)
			),
			`${entry} must never generate speech or spend Google's free-tier quota`
		);
	}
});

test('full builds run every existing feature check and notebook preparation around one routine build', () => {
	const events = npmExecution('build:full');
	const reached = events.flatMap((event) => (event.script ? [event.script] : []));
	assert.deepEqual(
		npmExecution('features:check').flatMap((event) =>
			featureChecks.includes(event.script) ? [event.script] : []
		),
		featureChecks
	);
	for (const name of [...featureChecks, 'notebooks:prepare', 'prebuild', 'build:site']) {
		assert.equal(reached.filter((value) => value === name).length, 1, `${name} runs once`);
	}
	assert.equal(events.filter((event) => event.command === 'vite build').length, 1);
	assert.equal(
		events.filter((event) => event.command === 'python scripts/prebuild_notebooks.py').length,
		1
	);
	assert.ok(reached.indexOf('features:check') < reached.indexOf('notebooks:prepare'));
	assert.ok(reached.indexOf('notebooks:prepare') < reached.indexOf('prebuild'));
	assert.ok(
		reached.indexOf('validate:discoverability') < reached.indexOf('barnum-lab:route-assets')
	);
});

test('ordinary articles and their generated catalogs do not activate full feature CI', () => {
	assert.deepEqual(workflow.on.push.paths, workflow.on.pull_request.paths);
	for (const file of [
		'docs/architecture/ARCHITECTURE.md',
		'AGENTS.md',
		'README.md',
		'src/lib/posts/a-new-text-and-image-article.md',
		'static/images/a-new-text-and-image-article.png',
		'static/wordcloud/a-new-text-and-image-article.svg',
		'static/wordcloud/manifest.json',
		'scripts/image-optimization-manifest.json',
		'scripts/post-tags-manifest.json',
		'src/lib/generated/music-posts.ts',
		'src/lib/generated/media-gallery.ts',
		'src/lib/server/generated/image-dimensions.js'
	]) {
		assert.equal(matchesPaths(file, workflow.on.pull_request.paths), false, file);
	}
});

test('feature inputs, notebooks and shared application or build changes activate full feature CI', () => {
	for (const file of [
		'.github/workflows/feature-artifacts.yml',
		'tests/browser/navigation-links.spec.ts',
		'tests/browser/strange-matter.spec.ts',
		'package.json',
		'package-lock.json',
		'svelte.config.js',
		'vite.config.ts',
		'tsconfig.json',
		'.prettierrc',
		'requirements-notebooks.txt',
		'pixi.toml',
		'vercel.json',
		'scripts/prebuild_notebooks.py',
		'scripts/render_notebooks.py',
		'scripts/generate-barnum-surface-bank.ts',
		'scripts/lib/bz-v2-performance-evidence.mjs',
		'scripts/prior-authorization-assets-manifest.json',
		'scripts/strange-attractor-orchestra-assets.manifest.json',
		'scripts/render-scale-elevator-assets.mjs',
		'scripts/render-probabilistic-piano-assets.mjs',
		'src/lib/posts/living-systems.md',
		'src/lib/posts/strange-matter.md',
		'static/images/visualizations/strange-matter/poster.png',
		'static/images/visualizations/living-systems/social.png',
		'src/lib/visualizations/probabilistic-piano/model.ts',
		'src/lib/visualizations/scale-elevator/core.ts',
		'src/lib/visualizations/barnum-lab/core/surface-text.ts',
		'src/lib/data/bias-archipelago/sources.json',
		'src/lib/components/visualizations/prior-authorization/index.ts',
		'src/lib/components/blog/PostImage.svelte',
		'src/routes/blog/[category]/[slug]/+page.svelte',
		'src/lib/posts/the-profile-that-knows-almost-nothing-about-you.md',
		'src/lib/posts/the-shape-of-waiting.md',
		'src/lib/posts/between-a-click-and-a-page.md',
		'src/lib/posts/build-one-build-a-thousand.md',
		'src/lib/posts/the-six-week-shadow.md',
		'src/lib/posts/the-museum-of-almost.md',
		'src/lib/posts/the-bias-archipelago.md',
		'src/lib/posts/through-a-different-glass.md',
		'src/lib/posts/belousov-zhabotinsky-laboratory.md',
		'src/lib/posts/the-prior-authorization-machine.md',
		'src/lib/posts/the-strange-attractor-orchestra.md',
		'src/lib/posts/the-piano-that-forgives.md',
		'src/lib/posts/the-scale-elevator-from-ion-to-city.md',
		'src/lib/posts/perceptron-from-scratch-in-mojo.md',
		'src/lib/posts/xor-with-multiple-perceptrons-in-mojo.md',
		'src/lib/notebooks/example.ipynb',
		'static/notebooks/example.html',
		'static/data/bz-v2/checkpoints/spiral-garden-256-v2.bzcp',
		'static/images/visualizations/strange-attractor-orchestra/langford-poster.png',
		'static/videos/visualizations/scale-elevator/scale-elevator-tour.mp4',
		'static/images/bias-archipelago-2026-08.png',
		'static/fonts/example.woff2',
		'artifacts/bz-v2-search/calibration.json'
	]) {
		assert.equal(matchesPaths(file, workflow.on.pull_request.paths), true, file);
	}
});

test('feature CI verifies committed assets with read-only permissions and no provider credentials', () => {
	assert.deepEqual(workflow.permissions, { contents: 'read' });
	const job = workflow.jobs['feature-artifacts'];
	assert.equal(job.env.IMAGE_OPTIMIZE_VERIFY_ONLY, '1');
	assert.equal(job.env.WORDCLOUD_VERIFY_ONLY, '1');
	assert.equal(
		job.steps.find((step) => step.uses?.startsWith('actions/setup-node@')).with['node-version'],
		24
	);
	assert.ok(job.steps.some((step) => step.uses?.startsWith('actions/setup-python@')));
	assert.ok(job.steps.some((step) => step.run === 'npm ci'));
	assert.ok(job.steps.some((step) => step.run === 'npm run build-workflow:test'));
	assert.ok(job.steps.some((step) => step.run === 'npm run notebooks:test'));
	assert.ok(job.steps.some((step) => step.run === 'npm run strange-matter:test'));
	assert.equal(job.steps.filter((step) => step.run === 'npm run build:full').length, 1);
	assert.equal(
		job.steps.find((step) => step.uses?.startsWith('actions/checkout@')).with[
			'persist-credentials'
		],
		false
	);
	assert.ok(!JSON.stringify(workflow).includes('secrets.'));
});

test('critical CI covers changed application boundaries without running for routine post catalogs', () => {
	assert.deepEqual(criticalWorkflow.on.push.paths, criticalWorkflow.on.pull_request.paths);
	for (const file of [
		'.github/workflows/critical-boundaries.yml',
		'package.json',
		'vitest.config.ts',
		'src/hooks.server.ts',
		'src/lib/server/http/body.ts',
		'src/lib/server/notes/repository.ts',
		'src/lib/notes/autosave.ts',
		'src/routes/api/tts/chatterbox/+server.ts',
		'src/routes/contact/+page.server.ts',
		'src/routes/notes/studio/[id]/+page.server.ts',
		'src/lib/visualizations/meaning-connection-map/lifecycle.ts',
		'src/routes/blog/visualizations/the-meaning-connection-map/+page.svelte'
	]) {
		assert.equal(matchesPaths(file, criticalWorkflow.on.pull_request.paths), true, file);
	}
	for (const file of [
		'src/lib/posts/a-new-text-and-image-article.md',
		'static/images/a-new-text-and-image-article.png',
		'src/lib/generated/media-gallery.ts',
		'src/lib/server/generated/image-dimensions.js',
		'scripts/post-tags-manifest.json'
	]) {
		assert.equal(matchesPaths(file, criticalWorkflow.on.pull_request.paths), false, file);
	}
	assert.deepEqual(criticalWorkflow.permissions, { contents: 'read' });
	const job = criticalWorkflow.jobs['critical-boundaries'];
	assert.equal(
		job.steps.find((step) => step.uses?.startsWith('actions/checkout@')).with[
			'persist-credentials'
		],
		false
	);
	assert.ok(job.steps.some((step) => step.run === 'npm ci'));
	assert.ok(job.steps.some((step) => step.run === 'npm run check'));
	assert.ok(job.steps.some((step) => step.run === 'npm run test:critical'));
	assert.ok(!JSON.stringify(criticalWorkflow).includes('secrets.'));
});
