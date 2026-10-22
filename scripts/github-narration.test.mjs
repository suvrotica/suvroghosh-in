import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parse } from 'yaml';
import { digest } from './lib/google-tts.mjs';
import {
	REPOSITORY,
	GOOGLE_PROJECT,
	HOSTING_PROJECT,
	HOSTING_TEAM,
	GIT_STATUS_ARGS,
	publicChildEnvironment,
	browserLaunchOptions,
	browserContextOptions,
	assertHostedConfiguration,
	allowedPublicationPath,
	expectedGitRemote,
	parseStatus,
	parsePrioritySlugs,
	generationRoutes,
	assertStorageBudget,
	listDeliveries,
	runCommand,
	waitForProduction,
	verifyLiveArticle,
	githubReadClient,
	runGithubNarration
} from './github-narration.mjs';

const BASE = 'a'.repeat(40);
const NEXT = 'b'.repeat(40);
const KEY = 'unit-test-provider-key';
const initial = ['a-trapezoid-in-low-light', 'stupidly-hopeful', 'august-fifteenth'];

async function fixture(t) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'github-narration-test-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const env = {
		GITHUB_REPOSITORY: REPOSITORY,
		GITHUB_REF: 'refs/heads/main',
		GITHUB_EVENT_NAME: 'workflow_dispatch',
		GEMINI_API_KEY: KEY,
		GEMINI_TTS_VOICE: 'achird',
		GEMINI_TTS_MODEL: 'gemini-3.8-flash-tts',
		NARRATION_GOOGLE_PROJECT_ID: GOOGLE_PROJECT,
		NARRATION_GOOGLE_KEY_SHA256: digest(KEY),
		NARRATION_FREE_TIERS_CONFIRMED: 'true',
		NARRATION_HOSTED_ENABLED: 'true',
		GITHUB_TOKEN: 'fixture-github-token',
		NARRATION_STATE_KEY: '0'.repeat(64)
	};
	const data = {
		projectId: GOOGLE_PROJECT,
		keyHash: digest(KEY),
		hosting: {
			projectId: HOSTING_PROJECT,
			teamId: HOSTING_TEAM,
			plan: 'hobby',
			verifiedAt: '2026-10-21T10:00:00Z'
		},
		publication: null
	};
	const events = [];
	const sources = new Map();
	const deliveries = new Map();
	const articles = new Map(
		[...initial, 'new-story', 'recovered-story'].map((slug) => [
			slug,
			{
				slug,
				title: slug,
				pathname: `/blog/personal-essay/${slug}`,
				text: `The full article ${slug}.`
			}
		])
	);
	async function delivery(slug) {
		const audio = Buffer.from(`ID3${slug}${'m'.repeat(200)}`);
		const audioHash = digest(audio);
		const article = articles.get(slug);
		const manifest = {
			version: 1,
			textHash: digest(article.text),
			fingerprint: 'f'.repeat(64),
			voice: 'achird',
			language: 'en-US',
			articlePath: article.pathname,
			model: 'gemini-3.8-flash-tts',
			format: 'audio/wav',
			style: 'fixture',
			segments: [
				{
					src: `/audio/articles/${slug}/${audioHash}.mp3`,
					textStart: 0,
					textEnd: article.text.length,
					duration: 1
				}
			],
			delivery: {
				format: 'audio/mpeg',
				encoderVersion: 'older-windows-ffmpeg',
				segments: [{ audioHash, bytes: audio.length }]
			}
		};
		const directory = path.join(root, 'static/audio/articles', slug);
		await fs.mkdir(directory, { recursive: true });
		await fs.writeFile(path.join(directory, `${audioHash}.mp3`), audio);
		await fs.writeFile(
			path.join(directory, 'manifest.json'),
			`${JSON.stringify(manifest, null, 2)}\n`
		);
		deliveries.set(slug, manifest);
		return manifest;
	}
	async function source(slug, valid = true) {
		const manifest = { slug, valid };
		sources.set(slug, manifest);
		const directory = path.join(root, '.codex-artifacts/narration-sources', slug);
		await fs.mkdir(directory, { recursive: true });
		await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
	}
	for (const slug of initial) await delivery(slug);
	const state = {
		data,
		async restore() {
			events.push('restore');
			return data;
		},
		async saveQuota() {
			events.push('saveQuota');
		},
		async saveCheckpoint() {
			events.push('saveCheckpoint');
		},
		async savePublication(value) {
			events.push(`publication:${value.status}`);
			data.publication = value;
		},
		async dropPublishedSources(slugs) {
			events.push('prune');
			for (const slug of slugs) sources.delete(slug);
		}
	};
	const dependencies = {
		createState: async () => state,
		prepare: async () => {
			events.push('prepare');
			return BASE;
		},
		storage: async () => {
			events.push('storage');
		},
		preview: async () => {
			events.push('preview');
			return {
				close: async () => {
					events.push('close');
				}
			};
		},
		inventory: async () => [...articles.values()],
		article: async (article) => article,
		deliveries: async () => new Map(deliveries),
		complete: async () => [...sources.keys()],
		deliveryReady: async (manifest, article) =>
			Boolean(
				manifest && manifest.voice === 'achird' && manifest.textHash === digest(article.text)
			),
		sourceReady: async (manifest) => Boolean(manifest?.valid),
		generate: async () => {
			events.push('generate');
			return { generated: 0, failed: 0, paused: 'DAILY_LIMIT' };
		},
		compress: async (slugs) => {
			events.push(`compress:${slugs.join(',')}`);
			for (const slug of slugs) await delivery(slug);
		},
		test: async () => {
			events.push('tests');
		},
		publish: async (_base, slugs) => {
			events.push('buildAndCommit');
			return slugs.some((slug) => !initial.includes(slug)) ? NEXT : BASE;
		},
		push: async () => {
			events.push('push');
		},
		probe: async () => {
			events.push('probe');
			return NEXT;
		},
		verify: async (commit, manifests) => {
			events.push(`verify:${commit}:${[...manifests.keys()].join(',')}`);
		},
		summary: async () => {
			events.push('summary');
		}
	};
	return {
		root,
		env,
		data,
		events,
		state,
		dependencies,
		source,
		delivery,
		articles,
		sources,
		deliveries
	};
}

test('trusted hosted pins enforce key/project, Achird, Hobby and explicit free-tier attestation', async (t) => {
	const f = await fixture(t);
	assert.equal(assertHostedConfiguration(f.data, f.env).voice, 'achird');
	for (const [key, value] of [
		['GITHUB_REF', 'refs/heads/untrusted'],
		['GITHUB_REPOSITORY', 'other/repo'],
		['NARRATION_FREE_TIERS_CONFIRMED', 'false'],
		['NARRATION_GOOGLE_PROJECT_ID', 'different'],
		['NARRATION_GOOGLE_KEY_SHA256', '1'.repeat(64)],
		['GEMINI_API_KEY', 'other-key'],
		['GEMINI_TTS_VOICE', 'other-voice']
	])
		assert.throws(() => assertHostedConfiguration(f.data, { ...f.env, [key]: value }));
	assert.throws(() =>
		assertHostedConfiguration({ ...f.data, hosting: { ...f.data.hosting, plan: 'pro' } }, f.env)
	);
});

test('child builds/tests/previews receive no provider, GitHub or encryption credentials', () => {
	const child = publicChildEnvironment({
		PATH: '/bin',
		PUBLIC_FEATURE: 'yes',
		GEMINI_API_KEY: KEY,
		GEMINI_TTS_FREE_TIER_CONFIRMED: 'true',
		GH_TOKEN: 'private',
		GITHUB_TOKEN: 'private',
		NARRATION_STATE_KEY: 'private',
		VERCEL_TOKEN: 'private',
		GIT_CONFIG_COUNT: '1',
		GIT_CONFIG_VALUE_0: 'AUTHORIZATION: private'
	});
	assert.deepEqual(child, { PATH: '/bin', PUBLIC_FEATURE: 'yes' });
	assert.deepEqual(
		browserLaunchOptions({
			PATH: '/bin',
			GEMINI_API_KEY: KEY,
			GITHUB_TOKEN: 'private',
			NARRATION_STATE_KEY: 'private',
			GIT_CONFIG_VALUE_0: 'AUTHORIZATION: private'
		}),
		{ headless: true, channel: 'chromium', env: { PATH: '/bin' } }
	);
	assert.deepEqual(browserLaunchOptions({ PATH: '/bin', PLAYWRIGHT_CHANNEL: ' chrome ' }), {
		headless: true,
		channel: 'chrome',
		env: { PATH: '/bin', PLAYWRIGHT_CHANNEL: ' chrome ' }
	});
});

test('narration browser contexts block offline-worker requests in live and script-free checks', () => {
	assert.deepEqual(browserContextOptions(), { serviceWorkers: 'block' });
	assert.deepEqual(browserContextOptions({ javaScriptEnabled: false, serviceWorkers: 'allow' }), {
		javaScriptEnabled: false,
		serviceWorkers: 'block'
	});
});

test('automatic publication paths reject prose, credentials, source WAV and unrelated assets', () => {
	assert.equal(expectedGitRemote(`https://github.com/${REPOSITORY}`), true);
	assert.equal(expectedGitRemote(`https://github.com/${REPOSITORY}.git\n`), true);
	for (const remote of [
		`https://token@github.com/${REPOSITORY}.git`,
		`https://github.com/${REPOSITORY}-other.git`,
		`https://evil.example/${REPOSITORY}.git`
	])
		assert.equal(expectedGitRemote(remote), false);
	assert.equal(
		allowedPublicationPath('static/audio/articles/new-story/manifest.json', ['new-story']),
		true
	);
	assert.equal(
		allowedPublicationPath(`static/audio/articles/new-story/${'f'.repeat(64)}.mp3`, ['new-story']),
		true
	);
	assert.equal(allowedPublicationPath('src/lib/generated/media-gallery.ts', []), true);
	for (const file of [
		'src/lib/posts/new-story.md',
		'.env.local',
		'static/audio/articles/new-story/source.wav',
		'static/audio/articles/other/manifest.json',
		'static/images/user.jpg',
		'.github/workflows/other.yml'
	])
		assert.equal(allowedPublicationPath(file, ['new-story']), false, file);
	assert.deepEqual(
		parseStatus(
			'?? static/audio/articles/new-story/manifest.json\0 M scripts/post-tags-manifest.json\0'
		).map(({ file }) => file),
		['static/audio/articles/new-story/manifest.json', 'scripts/post-tags-manifest.json']
	);
	assert.throws(() => parseStatus('R  before\0after\0'), /rename/u);
});

test('real Git publication enumerates every file in a newly completed article directory', async (t) => {
	const f = await fixture(t);
	const git = (args) => runCommand('git', args, { root: f.root, env: publicChildEnvironment() });
	await git(['init', '--quiet']);
	await git(['add', '--', 'static/audio/articles']);
	await git([
		'-c',
		'user.name=Narration test',
		'-c',
		'user.email=narration-test@example.invalid',
		'commit',
		'--quiet',
		'-m',
		'Fixture published narration'
	]);
	await f.delivery('new-story');
	const status = parseStatus(await git(GIT_STATUS_ARGS));
	assert.equal(status.length, 2);
	assert.deepEqual(
		status.map(({ file }) => file).sort(),
		[
			`static/audio/articles/new-story/${f.deliveries.get('new-story').delivery.segments[0].audioHash}.mp3`,
			'static/audio/articles/new-story/manifest.json'
		].sort()
	);
	assert.ok(
		status.every(
			({ status: code, file }) => code === '??' && allowedPublicationPath(file, ['new-story'])
		)
	);
});

test('generation routes repair stale private completions first, continue missing, and rotate full-coverage audits', () => {
	const articles = Array.from({ length: 45 }, (_, index) => ({ slug: `article-${index}` }));
	assert.deepEqual(
		generationRoutes({
			staleSources: ['article-1', 'article-1'],
			articles,
			deliveredSlugs: [],
			completeSlugs: ['article-1'],
			now: 0
		}),
		[{ slug: 'article-1' }, { mode: 'missing' }]
	);
	const deliveredSlugs = articles.map((article) => article.slug);
	assert.deepEqual(generationRoutes({ articles, deliveredSlugs, completeSlugs: [], now: 0 }), [
		{ mode: 'stale', offset: 0 }
	]);
	assert.deepEqual(
		generationRoutes({ articles, deliveredSlugs, completeSlugs: [], now: 86_400_000 }),
		[{ mode: 'stale', offset: 20 }]
	);
	assert.deepEqual(
		generationRoutes({ articles, deliveredSlugs, completeSlugs: [], now: 2 * 86_400_000 }),
		[{ mode: 'stale', offset: 40 }]
	);
	assert.deepEqual(
		generationRoutes({ articles, deliveredSlugs, completeSlugs: [], now: 3 * 86_400_000 }),
		[{ mode: 'stale', offset: 0 }]
	);
});

test('priority configuration is bounded, trims entries and preserves first-listed order', () => {
	assert.deepEqual(parsePrioritySlugs(), []);
	assert.deepEqual(parsePrioritySlugs('  '), []);
	assert.deepEqual(parsePrioritySlugs(' new-story, recovered-story, new-story '), [
		'new-story',
		'recovered-story'
	]);
	for (const value of [
		null,
		[],
		'new-story,,recovered-story',
		',new-story',
		'new-story,',
		'not/a/slug',
		'x'.repeat(201),
		' '.repeat(4097),
		Array.from({ length: 21 }, (_, index) => `article-${index}`).join(',')
	])
		assert.throws(() => parsePrioritySlugs(value), /NARRATION_PRIORITY_SLUGS/u);
});

test('priority routes precede source repair and background work without duplicate targets', () => {
	assert.deepEqual(
		generationRoutes({
			articles: ['first', 'second', 'repair', 'background'].map((slug) => ({ slug })),
			prioritySlugs: ['first', 'second'],
			readyPrioritySlugs: ['second'],
			staleSources: ['first', 'repair', 'repair'],
			deliveredSlugs: ['second'],
			completeSlugs: ['repair'],
			now: 0
		}),
		[{ slug: 'first' }, { slug: 'repair' }, { mode: 'missing' }]
	);
});

test('malformed priorities stop before restoring quota or touching provider state', async (t) => {
	const f = await fixture(t);
	f.env.NARRATION_PRIORITY_SLUGS = 'new-story,,recovered-story';
	await assert.rejects(runGithubNarration(f), /NARRATION_PRIORITY_SLUGS/u);
	assert.deepEqual(f.events, []);
});

test('unknown, unpublished and interactive-game priorities fail before provider requests, including verify-only', async (t) => {
	for (const slug of ['unknown-story', 'draft-story', 'queue-game']) {
		const f = await fixture(t);
		f.env.NARRATION_PRIORITY_SLUGS = slug;
		f.articles.set('queue-game', { slug: 'queue-game', interactiveGame: true });
		if (slug === 'draft-story') {
			f.env.NARRATION_VERIFY_ONLY = 'true';
			f.env.NARRATION_HOSTED_ENABLED = 'false';
		}
		await assert.rejects(runGithubNarration(f), /not a published narratable article/u);
		assert.equal(f.events.includes('generate'), false);
		assert.equal(f.events.includes('saveQuota'), false);
		assert.equal(f.events.includes('push'), false);
	}
});

test('a validated current priority delivery is skipped while background work continues', async (t) => {
	const f = await fixture(t);
	f.env.NARRATION_PRIORITY_SLUGS = initial[0];
	const inspected = [];
	f.dependencies.article = async (article) => {
		inspected.push(article.slug);
		return article;
	};
	const result = await runGithubNarration(f);
	assert.deepEqual(result.prioritySlugs, [initial[0]]);
	assert.deepEqual(result.skippedPriorities, [initial[0]]);
	assert.deepEqual(result.generationRoutes, [{ mode: 'missing' }]);
	assert.deepEqual(inspected, [initial[0]]);
	assert.equal(f.events.includes('saveQuota'), false);
	assert.equal(
		f.events.some((event) => event.startsWith('verify:')),
		false
	);
});

test('a stale priority delivery is not skipped by presence and still reserves shared quota before transport', async (t) => {
	const f = await fixture(t);
	f.env.NARRATION_PRIORITY_SLUGS = initial[0];
	f.articles.get(initial[0]).text += ' The article has changed.';
	const calls = [];
	f.dependencies.generate = async (hooks, route) => {
		calls.push(route);
		await hooks.beforeRequest();
		f.events.push('provider');
		return { failed: 0, paused: 'DAILY_LIMIT' };
	};
	const result = await runGithubNarration(f);
	assert.deepEqual(result.skippedPriorities, []);
	assert.deepEqual(calls, [{ slug: initial[0] }]);
	assert.deepEqual(result.generationRoutes, calls);
	assert.equal(result.paused, 'DAILY_LIMIT');
	assert.ok(f.events.indexOf('saveQuota') < f.events.indexOf('provider'));
});

test('a priority quota pause preserves remaining priorities and background work for another run', async (t) => {
	const f = await fixture(t);
	f.env.NARRATION_PRIORITY_SLUGS = 'new-story,recovered-story';
	const calls = [];
	f.dependencies.generate = async (_hooks, route) => {
		calls.push(route);
		return { failed: 0, paused: 'DAILY_LIMIT' };
	};
	const result = await runGithubNarration(f);
	assert.deepEqual(calls, [{ slug: 'new-story' }]);
	assert.deepEqual(result.prioritySlugs, ['new-story', 'recovered-story']);
	assert.equal(result.paused, 'DAILY_LIMIT');
	assert.equal(f.events.includes('saveQuota'), false);
	assert.equal(f.events.includes('push'), false);
});

test('verify-only restores and verifies existing three without synthesis, compression, mutation or pruning', async (t) => {
	const f = await fixture(t);
	f.env.NARRATION_VERIFY_ONLY = 'true';
	f.env.NARRATION_HOSTED_ENABLED = 'false';
	const result = await runGithubNarration(f);
	assert.equal(result.verifyOnly, true);
	assert.deepEqual(
		f.events.filter((event) => event.startsWith('verify:')),
		[`verify:${BASE}:${initial.join(',')}`]
	);
	for (const event of [
		'generate',
		'compress:',
		'saveQuota',
		'saveCheckpoint',
		'prune',
		'buildAndCommit',
		'push',
		'probe'
	])
		assert.equal(
			f.events.some((value) => value.startsWith(event)),
			false,
			event
		);
	assert.equal(f.events.filter((event) => event === 'close').length, 1);
});

test('no-work routine run makes no production verification requests or smoke-browser launch', async (t) => {
	const f = await fixture(t);
	f.env.GITHUB_EVENT_NAME = 'schedule';
	f.data.publication = { commit: BASE, slugs: [...initial], status: 'verified' };
	let productionRequests = 0;
	let productionBrowsers = 0;
	f.dependencies.verify = async () => {
		productionRequests += 1;
		productionBrowsers += 1;
	};
	const result = await runGithubNarration(f);
	assert.equal(result.generated, 0);
	assert.deepEqual(result.published, []);
	assert.equal(result.commit, BASE);
	assert.equal(productionRequests, 0);
	assert.equal(productionBrowsers, 0);
	assert.equal(f.events.includes('prune'), false);
	assert.equal(
		f.events.some((event) => event.startsWith('publication:')),
		false
	);
	assert.equal(f.events.includes('push'), false);
});

test('routine run retries an unverified published delivery without unrelated initial articles', async (t) => {
	const f = await fixture(t);
	await f.delivery('recovered-story');
	f.data.publication = { commit: BASE, slugs: ['recovered-story'], status: 'pushed' };
	await runGithubNarration(f);
	assert.deepEqual(
		f.events.filter((event) => event.startsWith('verify:')),
		[`verify:${BASE}:recovered-story`]
	);
	assert.ok(f.events.findIndex((event) => event.startsWith('verify:')) < f.events.indexOf('prune'));
	assert.equal(f.events.includes('publication:verified'), true);
});

test('manual deployment probe pushes exactly one empty connection commit with no Google generation', async (t) => {
	const f = await fixture(t);
	f.env.NARRATION_VERIFY_ONLY = 'true';
	f.env.NARRATION_DEPLOYMENT_PROBE = 'true';
	const result = await runGithubNarration(f);
	assert.equal(result.commit, NEXT);
	assert.equal(f.events.filter((event) => event === 'probe').length, 1);
	assert.equal(f.events.filter((event) => event === 'push').length, 1);
	assert.ok(f.events.indexOf('publication:pending') < f.events.indexOf('push'));
	assert.ok(
		f.events.indexOf('publication:pushed') <
			f.events.findIndex((event) => event.startsWith('verify:'))
	);
	assert.equal(f.events.includes('publication:verified'), true);
	assert.deepEqual(
		f.events.filter((event) => event.startsWith('verify:')),
		[`verify:${NEXT}:${initial.join(',')}`]
	);
	assert.equal(f.events.includes('generate'), false);
	assert.equal(f.events.includes('prune'), false);
});

test('deployment probe cannot run from schedule or ordinary generation', async (t) => {
	const f = await fixture(t);
	f.env.NARRATION_DEPLOYMENT_PROBE = 'true';
	await assert.rejects(runGithubNarration(f), /manual verify-only/u);
	f.env.NARRATION_VERIFY_ONLY = 'true';
	f.env.GITHUB_EVENT_NAME = 'schedule';
	await assert.rejects(runGithubNarration(f), /manual verify-only/u);
	assert.deepEqual(f.events, []);
});

test('inactive or untrusted runs stop before restoring state or touching Google', async (t) => {
	const f = await fixture(t);
	f.env.NARRATION_HOSTED_ENABLED = 'false';
	await assert.rejects(runGithubNarration(f), /not activated/u);
	f.env.NARRATION_VERIFY_ONLY = 'true';
	f.env.GITHUB_REF = 'refs/heads/untrusted';
	await assert.rejects(runGithubNarration(f), /trusted main/u);
	assert.deepEqual(f.events, []);
});

test('missing/corrupt remote state fails before any build or provider attempt', async (t) => {
	const f = await fixture(t);
	f.state.restore = async () => {
		throw new Error('Remote state missing.');
	};
	await assert.rejects(runGithubNarration(f), /Remote state missing/u);
	assert.deepEqual(f.events, []);
});

test('quota-paused run recovers and publishes complete saved sources without new Google synthesis', async (t) => {
	const f = await fixture(t);
	await f.source('recovered-story');
	const result = await runGithubNarration(f);
	assert.deepEqual(result.published, ['recovered-story']);
	assert.equal(result.paused, 'DAILY_LIMIT');
	assert.ok(f.events.indexOf('compress:recovered-story') < f.events.indexOf('generate'));
	assert.ok(f.events.indexOf('publication:pending') < f.events.indexOf('push'));
	assert.ok(
		f.events.findIndex((event) => event.startsWith(`verify:${NEXT}`)) < f.events.indexOf('prune')
	);
	assert.equal(f.events.includes('saveQuota'), false);
	assert.deepEqual(
		f.events.filter((event) => event.startsWith('verify:')),
		[`verify:${NEXT}:recovered-story`]
	);
});

test('durable quota reservation precedes Google transport; segment/article persistence precedes publication', async (t) => {
	const f = await fixture(t);
	f.dependencies.generate = async (hooks) => {
		await hooks.onSegment({ slug: 'new-story', name: 'cached', reused: true });
		assert.equal(f.events.includes('saveCheckpoint'), false);
		await hooks.beforeRequest();
		f.events.push('provider');
		await f.source('new-story');
		await hooks.onSegment({ slug: 'new-story', name: 'saved', reused: false });
		await hooks.onArticle({ slug: 'new-story', manifest: {} });
		return { failed: 0, paused: 'DAILY_LIMIT' };
	};
	const result = await runGithubNarration(f);
	assert.equal(result.generated, 1);
	assert.ok(f.events.indexOf('saveQuota') < f.events.indexOf('provider'));
	assert.ok(f.events.indexOf('saveCheckpoint') < f.events.indexOf('buildAndCommit'));
	assert.ok(f.events.indexOf('close') < f.events.indexOf('buildAndCommit'));
	assert.deepEqual(result.published, ['new-story']);
});

test('durable quota save failure stops before provider transport and preserves checkpoint state', async (t) => {
	const f = await fixture(t);
	f.state.saveQuota = async () => {
		throw new Error('CAS conflict.');
	};
	f.dependencies.generate = async (hooks) => {
		await hooks.beforeRequest();
		f.events.push('provider');
	};
	await assert.rejects(runGithubNarration(f), /CAS conflict/u);
	assert.equal(f.events.includes('provider'), false);
	assert.equal(f.events.includes('push'), false);
	assert.ok(f.events.includes('saveCheckpoint'));
});

test('provider real failure and deployment failure preserve sources without pruning', async (t) => {
	for (const failure of ['generation', 'deployment']) {
		const f = await fixture(t);
		await f.source('recovered-story');
		if (failure === 'generation') f.dependencies.generate = async () => ({ failed: 1 });
		else
			f.dependencies.verify = async () => {
				throw new Error('Production failed.');
			};
		await assert.rejects(runGithubNarration(f), /failure|failed/u);
		assert.equal(f.events.includes('prune'), false);
		assert.equal(f.sources.has('recovered-story'), true);
		assert.equal(f.events.at(-1), 'summary');
	}
});

test('verified publication saves its pruned checkpoint once without an implicit second write', async (t) => {
	const f = await fixture(t);
	await f.source(initial[0]);
	let saves = 0;
	f.state.saveCheckpoint = async () => {
		f.events.push('saveCheckpoint');
		if (++saves > 1) throw new Error('Redundant final checkpoint write.');
	};
	await runGithubNarration(f);
	assert.equal(saves, 1);
	assert.equal(f.data.publication.status, 'verified');
	assert.ok(f.events.indexOf('prune') < f.events.indexOf('saveCheckpoint'));
	assert.equal(f.events.at(-1), 'summary');
});

test('a failed final checkpoint remains the original error and is not blindly retried', async (t) => {
	const f = await fixture(t);
	await f.source(initial[0]);
	const failure = new Error('Checkpoint ref update failed.');
	let saves = 0;
	f.state.saveCheckpoint = async () => {
		saves++;
		throw failure;
	};
	await assert.rejects(runGithubNarration(f), (error) => error === failure);
	assert.equal(saves, 1);
	assert.equal(f.data.publication.status, 'verified');
	assert.equal(f.events.at(-1), 'summary');
});

test('generation and checkpoint failures are both retained while the summary still runs', async (t) => {
	const f = await fixture(t);
	const generation = new Error('Original generation failure.');
	const checkpoint = new Error('Final checkpoint failure.');
	f.dependencies.generate = async () => {
		throw generation;
	};
	f.state.saveCheckpoint = async () => {
		throw checkpoint;
	};
	await assert.rejects(runGithubNarration(f), (error) => {
		assert(error instanceof AggregateError);
		assert.deepEqual(error.errors, [generation, checkpoint]);
		assert.match(error.message, /Original generation failure.*Final checkpoint failure/u);
		return true;
	});
	assert.equal(f.events.includes('push'), false);
	assert.equal(f.events.at(-1), 'summary');
});

test('preview cleanup failure cannot prevent checkpoint preservation or the run summary', async (t) => {
	const f = await fixture(t);
	const generation = new Error('Generation stopped.');
	const close = new Error('Preview cleanup stopped.');
	f.dependencies.generate = async () => {
		throw generation;
	};
	f.dependencies.preview = async () => ({
		close: async () => {
			throw close;
		}
	});
	await assert.rejects(runGithubNarration(f), (error) => {
		assert(error instanceof AggregateError);
		assert.deepEqual(error.errors, [generation, close]);
		return true;
	});
	assert.equal(f.events.includes('saveCheckpoint'), true);
	assert.equal(f.events.at(-1), 'summary');
});

test('already published valid MP3s keep older encoder identity and can prune matching saved WAVs', async (t) => {
	const f = await fixture(t);
	await f.source(initial[0]);
	const result = await runGithubNarration(f);
	assert.equal(
		f.events.some((event) => event.startsWith('compress:')),
		false
	);
	assert.equal(result.commit, BASE);
	assert.equal(f.events.includes('push'), false);
	assert.equal(f.sources.has(initial[0]), false);
});

test('stale complete source is not compressed or published as current narration', async (t) => {
	const f = await fixture(t);
	await f.source('recovered-story', false);
	const result = await runGithubNarration(f);
	assert.ok(result.staleSources.includes('recovered-story'));
	assert.equal(
		f.events.some((event) => event.startsWith('compress:')),
		false
	);
	assert.equal(f.sources.has('recovered-story'), true);
	assert.deepEqual(result.generationRoutes, [{ slug: 'recovered-story' }]);
});

test('routine stale initial article uses fallback without blocking new narration publication', async (t) => {
	const f = await fixture(t);
	f.articles.get(initial[0]).text = 'Edited after the original narration.';
	await f.source('recovered-story');
	const result = await runGithubNarration(f);
	assert.deepEqual(result.published, ['recovered-story']);
	assert.equal(result.staleDeliveries.includes(initial[0]), false);
	const verified = f.events.find((event) => event.startsWith('verify:'));
	assert.equal(verified.includes(initial[0]), false);
	assert.equal(verified.includes('recovered-story'), true);
});

test('full delivery coverage selects bounded stale audit instead of an empty missing loop', async (t) => {
	const f = await fixture(t);
	f.articles.delete('new-story');
	f.articles.delete('recovered-story');
	let selected;
	f.dependencies.generate = async (_hooks, route) => {
		selected = route;
		return { failed: 0, paused: null };
	};
	await runGithubNarration(f);
	assert.deepEqual(selected, { mode: 'stale', offset: 0 });
});

test('storage budget stops oversized source/MP3 publication without changing files', async (t) => {
	const f = await fixture(t);
	const files = [...f.deliveries].flatMap(([slug, manifest]) => [
		`static/audio/articles/${slug}/manifest.json`,
		`static${manifest.segments[0].src}`
	]);
	const run = async () => `${files.join('\0')}\0`;
	const result = await assertStorageBudget(f.root, run);
	assert.ok(result.mp3Bytes > 0);
	await assert.rejects(assertStorageBudget(f.root, run, { mp3: 1 }), /storage budget/u);
	await assert.rejects(assertStorageBudget(f.root, run, { root: 1 }), /storage budget/u);
	assert.equal((await listDeliveries(f.root)).size, 3);
});

test('exact-SHA Production polling ignores previews and unrelated successful commits', async () => {
	let now = 0;
	const request = async (url) =>
		url.includes('/statuses')
			? [{ state: now ? 'success' : 'pending' }]
			: [
					{ id: 1, sha: NEXT, environment: 'Production' },
					{ id: 2, sha: BASE, environment: 'Preview' },
					{ id: 3, sha: BASE, environment: 'Production' }
				];
	const deployment = await waitForProduction(BASE, {
		request,
		now: () => now,
		wait: async (ms) => {
			now += ms;
		},
		timeoutMs: 1000
	});
	assert.equal(deployment.id, 3);
	await assert.rejects(
		waitForProduction(BASE, {
			request: async () => [],
			now: () => now,
			wait: async (ms) => {
				now += ms;
			},
			timeoutMs: 1
		}),
		/deadline/u
	);
	await assert.rejects(
		waitForProduction(BASE, {
			request: async (url) =>
				url.includes('/statuses')
					? [{ state: 'error' }]
					: [{ id: 3, sha: BASE, environment: 'Production' }]
		}),
		/failed/u
	);
});

function liveFetch(
	f,
	slug,
	{ corrupt = false, rangeStatus = 206, manifestCache = 'public,max-age=0,must-revalidate' } = {}
) {
	const manifest = f.deliveries.get(slug);
	return async (url, options = {}) => {
		const pathname = new URL(url).pathname;
		const bytes = await fs.readFile(path.join(f.root, 'static', pathname.slice(1)));
		if (pathname.endsWith('/manifest.json'))
			return new Response(bytes, {
				headers: { 'Content-Type': 'application/json', 'Cache-Control': manifestCache }
			});
		if (options.headers?.Range) {
			const end = Number(options.headers.Range.split('-')[1]);
			return new Response(bytes.subarray(0, end + 1), {
				status: rangeStatus,
				headers: { 'Content-Range': `bytes 0-${end}/${bytes.length}` }
			});
		}
		return new Response(corrupt ? Buffer.from('corrupt') : bytes, {
			headers: {
				'Content-Type': 'audio/mpeg',
				'Cache-Control': 'public,max-age=31536000,immutable',
				'Content-Length': String(manifest.delivery.segments[0].bytes)
			}
		});
	};
}

test('live verification binds complete manifest, MP3 bytes, cache headers and byte-range playback', async (t) => {
	const f = await fixture(t);
	const slug = initial[0];
	const parameters = { slug, manifest: f.deliveries.get(slug), root: f.root, commit: BASE };
	await verifyLiveArticle({ ...parameters, fetchImpl: liveFetch(f, slug) });
	await assert.rejects(
		verifyLiveArticle({ ...parameters, fetchImpl: liveFetch(f, slug, { corrupt: true }) }),
		/checksum/u
	);
	await assert.rejects(
		verifyLiveArticle({ ...parameters, fetchImpl: liveFetch(f, slug, { rangeStatus: 200 }) }),
		/byte-range/u
	);
	await assert.rejects(
		verifyLiveArticle({
			...parameters,
			fetchImpl: liveFetch(f, slug, { manifestCache: 'public,max-age=31536000,immutable' })
		}),
		/revalidation/u
	);
	await assert.rejects(
		verifyLiveArticle({
			...parameters,
			origin: 'https://other.example',
			fetchImpl: liveFetch(f, slug)
		}),
		/target/u
	);
});

test('GitHub read verification authenticates only to fixed repository and bounds HTTP failure diagnostics', async () => {
	let seen;
	const request = githubReadClient({
		env: { GITHUB_TOKEN: 'fixture-private-token' },
		fetchImpl: async (url, options) => {
			seen = { url, options };
			return new Response('[]');
		}
	});
	assert.deepEqual(await request(`/repos/${REPOSITORY}/deployments?sha=${BASE}`), []);
	assert.ok(seen.url.startsWith('https://api.github.com/'));
	assert.equal(seen.options.headers.Authorization, 'Bearer fixture-private-token');
	await assert.rejects(request('/repos/other/repo/deployments'), /target/u);
	await assert.rejects(
		githubReadClient({
			fetchImpl: async () => new Response('private body must not appear', { status: 403 })
		})(`/repos/${REPOSITORY}/deployments`),
		/HTTP 403/u
	);
});

test('subprocess runner uses no shell and bounds output/time without builds or provider calls', async () => {
	assert.equal(await runCommand(process.execPath, ['-e', 'process.stdout.write("ok")']), 'ok');
	await assert.rejects(
		runCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(5000))'], {
			maximum: 100
		}),
		/output/u
	);
	await assert.rejects(
		runCommand(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { timeoutMs: 20 }),
		/deadline/u
	);
});

test('public subprocess failures retain useful diagnostics while private transport output stays hidden', async (t) => {
	const f = await fixture(t);
	await assert.rejects(
		runCommand(
			process.execPath,
			['-e', 'process.stderr.write("public freshness validation failed");process.exit(1)'],
			{ root: f.root, publicLog: true }
		),
		/public freshness validation failed/u
	);
	const logs = await fs.readdir(path.join(f.root, '.codex-artifacts/narration-job-logs'));
	assert.equal(logs.length, 1);
	assert.match(
		await fs.readFile(path.join(f.root, '.codex-artifacts/narration-job-logs', logs[0]), 'utf8'),
		/public freshness/u
	);
	await assert.rejects(
		runCommand(
			process.execPath,
			['-e', 'process.stderr.write("private transport secret");process.exit(1)'],
			{ root: f.root }
		),
		(error) => !error.message.includes('private transport secret')
	);
});

test('workflow is main-only, free standard runner, durable-state serialized and secrets scoped to parent step', async () => {
	const workflow = parse(
		await fs.readFile(
			new URL('../.github/workflows/article-narration.yml', import.meta.url),
			'utf8'
		)
	);
	assert.equal(workflow.on.schedule[0].cron, '45 8 * * *');
	assert.equal(workflow.on.pull_request, undefined);
	assert.equal(workflow.concurrency['cancel-in-progress'], false);
	const job = workflow.jobs['narrate-and-publish'];
	assert.equal(job['runs-on'], 'ubuntu-24.04');
	assert.equal(job.env.PLAYWRIGHT_CHANNEL, 'chromium');
	assert.match(job.if, /refs\/heads\/main/u);
	assert.match(job.if, /NARRATION_HOSTED_ENABLED/u);
	assert.deepEqual(job.permissions, { contents: 'write', deployments: 'read' });
	for (const step of job.steps.filter((step) => step.uses))
		assert.match(step.uses, /^actions\/[a-z-]+@[a-f0-9]{40}$/u);
	const secretSteps = job.steps.filter((step) =>
		JSON.stringify(step).includes('secrets.GEMINI_API_KEY')
	);
	assert.equal(secretSteps.length, 1);
	assert.equal(secretSteps[0].run, 'node scripts/github-narration.mjs');
	assert.equal(
		job.steps.some((step) => /upload-artifact|actions\/cache@/u.test(step.uses ?? '')),
		false
	);
	assert.equal(JSON.stringify(job).includes('VERCEL_TOKEN'), false);
});
