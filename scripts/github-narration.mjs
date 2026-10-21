import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { digest, googleConfig } from './lib/google-tts.mjs';
import { getNarrationSourceRoot, discoverArticles, manifestIsReady } from './article-narration.mjs';
import { compressComplete } from './compress-narration.mjs';
import { extractNarration } from '../src/lib/components/blog/tts/narration.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPOSITORY = 'suvrotica/suvroghosh-in';
export const GOOGLE_PROJECT = 'gen-lang-client-0296473115';
export const HOSTING_PROJECT = 'prj_IxNpapfOcZwq4zRwlK56DPCRwQnc';
export const HOSTING_TEAM = 'team_PxbH7s87MnRH1xfa9cA6QIfp';
export const PUBLIC_ORIGIN = 'https://www.suvroghosh.in';
const LOCAL_ORIGIN = 'http://127.0.0.1:4218';
const SLUG = /^[a-z0-9_-]{1,200}$/i;
const HASH = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
export const GIT_STATUS_ARGS = Object.freeze([
	'status',
	'--porcelain=v1',
	'-z',
	'--untracked-files=all'
]);
const INITIAL_ARTICLES = ['a-trapezoid-in-low-light', 'stupidly-hopeful', 'august-fifteenth'];
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Provider/encryption/GitHub credentials never enter builds, tests, previews or git hooks. */
export function publicChildEnvironment(env = process.env) {
	return Object.fromEntries(
		Object.entries(env).filter(
			([key]) =>
				!/^GEMINI_/i.test(key) &&
				!/^GIT_CONFIG_/i.test(key) &&
				!/^(?:GH_TOKEN|GITHUB_TOKEN|NARRATION_STATE_KEY|VERCEL_TOKEN|VERCEL_AUTOMATION_BYPASS_SECRET)$/i.test(
					key
				)
		)
	);
}

export function assertHostedConfiguration(state, env = process.env) {
	if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== 'refs/heads/main')
		throw new Error('Hosted narration requires the trusted repository main branch.');
	if (env.NARRATION_FREE_TIERS_CONFIRMED !== 'true')
		throw new Error(
			'Hosted narration requires the recorded billing-disabled Free-tier and Hobby attestation.'
		);
	if (
		env.NARRATION_GOOGLE_PROJECT_ID !== GOOGLE_PROJECT ||
		state?.projectId !== GOOGLE_PROJECT ||
		!HASH.test(env.NARRATION_GOOGLE_KEY_SHA256 ?? '') ||
		state?.keyHash !== env.NARRATION_GOOGLE_KEY_SHA256 ||
		digest(env.GEMINI_API_KEY?.trim() || '') !== state.keyHash
	)
		throw new Error('Google project/key pin verification failed. No synthesis permitted.');
	if (
		state.hosting?.projectId !== HOSTING_PROJECT ||
		state.hosting?.teamId !== HOSTING_TEAM ||
		state.hosting?.plan !== 'hobby' ||
		!Number.isFinite(Date.parse(state.hosting?.verifiedAt))
	)
		throw new Error('The recorded hosting target is not the attested Hobby project.');
	const config = googleConfig(env);
	if (config.voice !== 'achird' || config.model !== 'gemini-3.8-flash-tts')
		throw new Error('Hosted narration must retain the reviewed Achird model and voice.');
	return config;
}

function redactDiagnostics(value) {
	let result = stripVTControlCharacters(value);
	for (const key of ['GEMINI_API_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'NARRATION_STATE_KEY']) {
		const secret = process.env[key];
		if (!secret) continue;
		result = result.replaceAll(secret, '[redacted]');
		if (key === 'GITHUB_TOKEN' || key === 'GH_TOKEN')
			result = result.replaceAll(
				Buffer.from(`x-access-token:${secret}`).toString('base64'),
				'[redacted]'
			);
	}
	return result;
}

export function runCommand(
	command,
	args,
	{
		root = ROOT,
		env = process.env,
		timeoutMs = 20 * 60_000,
		maximum = 16 * 1024 * 1024,
		publicLog = false
	} = {}
) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: root,
			env,
			shell: false,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		const chunks = [];
		const diagnostics = [];
		let bytes = 0;
		let failure;
		const fail = (message) => {
			failure ??= new Error(message);
			child.kill('SIGKILL');
		};
		const timer = setTimeout(() => fail('Narration subprocess exceeded its deadline.'), timeoutMs);
		child.stdout.on('data', (chunk) => {
			bytes += chunk.length;
			if (bytes > maximum) fail('Narration subprocess output exceeded its limit.');
			else {
				chunks.push(chunk);
				if (publicLog) diagnostics.push(chunk);
			}
		});
		child.stderr.on('data', (chunk) => {
			bytes += chunk.length;
			if (bytes > maximum) fail('Narration subprocess output exceeded its limit.');
			else if (publicLog) diagnostics.push(chunk);
		});
		child.once('error', () => {
			failure ??= new Error(`Could not start narration subprocess: ${path.basename(command)}.`);
		});
		child.once('close', async (code) => {
			clearTimeout(timer);
			try {
				let diagnostic = '';
				if (publicLog) {
					const text = redactDiagnostics(Buffer.concat(diagnostics).toString('utf8'));
					const directory = path.join(root, '.codex-artifacts', 'narration-job-logs');
					await fs.mkdir(directory, { recursive: true });
					const log = path.join(
						directory,
						`${path.basename(command).replace(/[^a-z0-9_-]/giu, '-')}-${process.pid}-${Date.now()}.log`
					);
					await fs.writeFile(log, text);
					diagnostic = `\nPublic subprocess log: ${log}\n${text.slice(-6000)}`;
				}
				if (failure) reject(new Error(`${failure.message}${diagnostic}`));
				else if (code !== 0)
					reject(
						new Error(
							`Narration subprocess failed: ${path.basename(command)} ${args[0] ?? ''} (exit ${code}).${diagnostic}`
						)
					);
				else resolve(Buffer.concat(chunks).toString('utf8'));
			} catch (error) {
				reject(error);
			}
		});
	});
}

function gitEnvironment(env, write = false) {
	const result = publicChildEnvironment(env);
	result.GIT_TERMINAL_PROMPT = '0';
	if (write) {
		const token = env.GH_TOKEN || env.GITHUB_TOKEN;
		if (!token) throw new Error('GitHub publication token is unavailable.');
		result.GIT_CONFIG_COUNT = '1';
		result.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
		result.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
	}
	return result;
}

export function allowedPublicationPath(file, slugs) {
	const match =
		/^static\/audio\/articles\/([a-z0-9_-]{1,200})\/(manifest\.json|[a-f0-9]{64}\.mp3)$/i.exec(
			file
		);
	if (match) return slugs.includes(match[1]);
	return new Set([
		'scripts/post-tags-manifest.json',
		'scripts/image-optimization-manifest.json',
		'scripts/sketch-generation-manifest.json',
		'src/lib/generated/music-posts.ts',
		'src/lib/generated/sketch-manifest.ts',
		'src/lib/generated/media-gallery.ts',
		'src/lib/server/generated/image-dimensions.js'
	]).has(file);
}

export function expectedGitRemote(value) {
	return (
		typeof value === 'string' &&
		value.trim().replace(/\.git$/u, '') === `https://github.com/${REPOSITORY}`
	);
}

export function parseStatus(output) {
	return output
		.split('\0')
		.filter(Boolean)
		.map((entry) => {
			if (entry.length < 4 || /[RC]/u.test(entry.slice(0, 2)))
				throw new Error('Unexpected rename/copy in automatic narration publication.');
			return { status: entry.slice(0, 2), file: entry.slice(3) };
		});
}

/** Quota is shared across every route; the daily window eventually checks all saved delivery. */
export function generationRoutes({
	staleSources = [],
	articles,
	deliveredSlugs,
	completeSlugs,
	now = Date.now()
}) {
	const routes = [...new Set(staleSources)].slice(0, 20).map((slug) => ({ slug }));
	const present = new Set([...deliveredSlugs, ...completeSlugs]);
	if (articles.some((article) => !present.has(article.slug))) routes.push({ mode: 'missing' });
	else if (articles.length) {
		const windows = Math.ceil(articles.length / 20);
		const offset = (Math.floor(now / 86_400_000) % windows) * 20;
		routes.push({ mode: 'stale', offset });
	}
	return routes;
}

export async function assertStorageBudget(root = ROOT, run = runCommand, limits = {}) {
	const maximumMp3 = limits.mp3 ?? 6 * 1024 ** 3;
	const maximumRoot = limits.root ?? 8 * 1024 ** 3;
	const files = (
		await run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
			root,
			env: publicChildEnvironment()
		})
	)
		.split('\0')
		.filter(Boolean);
	let mp3Bytes = 0;
	let rootBytes = 0;
	for (const file of new Set(files)) {
		const absolute = path.resolve(root, file);
		if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`))
			throw new Error('Unexpected path outside the checkout.');
		const stat = await fs.lstat(absolute);
		if (!stat.isFile()) continue;
		rootBytes += stat.size;
		if (/^static\/audio\/articles\/.*\.mp3$/iu.test(file)) mp3Bytes += stat.size;
	}
	if (mp3Bytes > maximumMp3 || rootBytes > maximumRoot)
		throw new Error(
			'Free-hosting storage budget reached. Preserve checkpoints and review storage; do not upgrade automatically.'
		);
	const disk = await fs.statfs(root);
	if (Number(disk.bavail) * Number(disk.bsize) < 2 * 1024 ** 3)
		throw new Error('Insufficient free runner disk for safe narration publication.');
	return { mp3Bytes, rootBytes };
}

async function readJson(file) {
	try {
		return JSON.parse(await fs.readFile(file, 'utf8'));
	} catch (error) {
		if (error.code === 'ENOENT') return null;
		throw error;
	}
}

export async function listDeliveries(root = ROOT) {
	const base = path.join(root, 'static/audio/articles');
	let entries;
	try {
		entries = await fs.readdir(base, { withFileTypes: true });
	} catch (error) {
		if (error.code === 'ENOENT') return new Map();
		throw error;
	}
	const results = new Map();
	for (const entry of entries) {
		if (!entry.isDirectory() || !SLUG.test(entry.name) || entry.name.toLowerCase() === '_audition')
			continue;
		const manifest = await readJson(path.join(base, entry.name, 'manifest.json'));
		if (manifest) results.set(entry.name, manifest);
	}
	return results;
}

async function completeSources(root) {
	const base = getNarrationSourceRoot(root);
	let entries;
	try {
		entries = await fs.readdir(base, { withFileTypes: true });
	} catch (error) {
		if (error.code === 'ENOENT') return [];
		throw error;
	}
	const slugs = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || !SLUG.test(entry.name) || entry.name.toLowerCase() === '_audition')
			continue;
		if (await readJson(path.join(base, entry.name, 'manifest.json'))) slugs.push(entry.name);
	}
	return slugs.sort();
}

async function responseBytes(response, maximum) {
	if (!response.body || Number(response.headers.get('content-length')) > maximum)
		throw new Error('Live narration response is empty or oversized.');
	const reader = response.body.getReader();
	const chunks = [];
	let size = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maximum) throw new Error('Live narration exceeded its bounded response size.');
			chunks.push(Buffer.from(value));
		}
		return Buffer.concat(chunks);
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

export function githubReadClient({ env = process.env, fetchImpl = fetch } = {}) {
	return async (pathname) => {
		if (!pathname.startsWith(`/repos/${REPOSITORY}/`))
			throw new Error('Unexpected GitHub verification target.');
		const response = await fetchImpl(`https://api.github.com${pathname}`, {
			headers: {
				Authorization: `Bearer ${env.GH_TOKEN || env.GITHUB_TOKEN}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28'
			},
			redirect: 'error',
			signal: AbortSignal.timeout(30_000)
		});
		if (!response.ok) {
			await response.body?.cancel();
			throw new Error(`GitHub deployment verification failed (HTTP ${response.status}).`);
		}
		return JSON.parse((await responseBytes(response, 2 * 1024 * 1024)).toString('utf8'));
	};
}

export async function waitForProduction(
	commit,
	{ request, now = Date.now, wait = sleep, timeoutMs = 25 * 60_000 } = {}
) {
	if (!SHA.test(commit)) throw new Error('Invalid deployment commit.');
	const deadline = now() + timeoutMs;
	do {
		const deployments = await request(
			`/repos/${REPOSITORY}/deployments?sha=${commit}&per_page=100`
		);
		if (!Array.isArray(deployments)) throw new Error('Invalid GitHub deployments response.');
		for (const deployment of deployments) {
			if (
				deployment.sha !== commit ||
				!/^production$/iu.test(deployment.environment ?? '') ||
				!Number.isSafeInteger(deployment.id)
			)
				continue;
			const statuses = await request(
				`/repos/${REPOSITORY}/deployments/${deployment.id}/statuses?per_page=10`
			);
			if (!Array.isArray(statuses)) throw new Error('Invalid GitHub deployment statuses.');
			if (statuses[0]?.state === 'success') return deployment;
			if (['error', 'failure'].includes(statuses[0]?.state))
				throw new Error(
					'The exact narration commit failed its production deployment. Checkpoints remain available.'
				);
		}
		if (now() >= deadline) break;
		await wait(Math.min(20_000, deadline - now()));
	} while (now() <= deadline);
	throw new Error(
		'Production deployment was not verified before its deadline. Keep pending narration for the next run.'
	);
}

export async function verifyLiveArticle({
	slug,
	manifest,
	root = ROOT,
	commit,
	origin = PUBLIC_ORIGIN,
	fetchImpl = fetch
}) {
	if (!SLUG.test(slug) || !SHA.test(commit) || origin !== PUBLIC_ORIGIN)
		throw new Error('Invalid live narration verification target.');
	const request = (pathname, headers = {}) =>
		fetchImpl(`${origin}${pathname}`, {
			headers,
			redirect: 'error',
			signal: AbortSignal.timeout(30_000)
		});
	const manifestResponse = await request(
		`/audio/articles/${slug}/manifest.json?narrationCommit=${commit}`,
		{ 'Cache-Control': 'no-cache' }
	);
	if (
		manifestResponse.status !== 200 ||
		!/application\/json/iu.test(manifestResponse.headers.get('content-type') ?? '') ||
		!/max-age=0|no-cache|must-revalidate/iu.test(
			manifestResponse.headers.get('cache-control') ?? ''
		)
	)
		throw new Error(`Live narration manifest or revalidation policy failed for ${slug}.`);
	const remoteBytes = await responseBytes(manifestResponse, 131_072);
	const localBytes = await fs.readFile(
		path.join(root, 'static/audio/articles', slug, 'manifest.json')
	);
	if (digest(remoteBytes) !== digest(localBytes))
		throw new Error(`Live narration manifest differs from the published commit for ${slug}.`);
	for (let index = 0; index < manifest.segments.length; index += 1) {
		const segment = manifest.segments[index];
		const metadata = manifest.delivery?.segments?.[index];
		if (
			!metadata ||
			!HASH.test(metadata.audioHash ?? '') ||
			segment.src !== `/audio/articles/${slug}/${metadata.audioHash}.mp3` ||
			!Number.isInteger(metadata.bytes) ||
			metadata.bytes < 100
		)
			throw new Error('Delivery metadata is incomplete for live verification.');
		const response = await request(segment.src);
		if (
			response.status !== 200 ||
			!/^audio\/mpeg(?:;|$)/iu.test(response.headers.get('content-type') ?? '') ||
			!/immutable/iu.test(response.headers.get('cache-control') ?? '')
		)
			throw new Error(`Live MP3 delivery headers failed for ${slug}.`);
		const bytes = await responseBytes(response, 10 * 1024 * 1024);
		if (bytes.length !== metadata.bytes || digest(bytes) !== metadata.audioHash)
			throw new Error(`Live MP3 checksum failed for ${slug}.`);
		const end = Math.min(1023, bytes.length - 1);
		const range = await request(segment.src, { Range: `bytes=0-${end}` });
		if (
			range.status !== 206 ||
			range.headers.get('content-range') !== `bytes 0-${end}/${bytes.length}` ||
			!(await responseBytes(range, end + 1)).equals(bytes.subarray(0, end + 1))
		)
			throw new Error(`Live MP3 byte-range playback failed for ${slug}.`);
	}
}

export function browserLaunchOptions(env = process.env) {
	// The workflow installs full Chromium with --no-shell. An explicit channel
	// prevents Playwright from looking for the separate headless-shell binary.
	return {
		headless: true,
		channel: env.PLAYWRIGHT_CHANNEL?.trim() || 'chromium',
		env: publicChildEnvironment(env)
	};
}

export function browserContextOptions(overrides = {}) {
	// Production verification must not install the site's offline cache or let
	// a worker issue requests outside the smoke test's explicit navigation.
	return { ...overrides, serviceWorkers: 'block' };
}

async function browserSmoke(manifests, { origin = PUBLIC_ORIGIN, env = process.env } = {}) {
	const { chromium } = await import('@playwright/test');
	const browser = await chromium.launch(browserLaunchOptions(env));
	let providerRequests = 0;
	try {
		const context = await browser.newContext(browserContextOptions());
		await context.route(
			/https:\/\/(?:generativelanguage|texttospeech)\.googleapis\.com\//u,
			(route) => {
				providerRequests += 1;
				return route.abort();
			}
		);
		await context.addInitScript(() => {
			const NativeAudio = window.Audio;
			window.__narrationAudios = [];
			window.Audio = function (source) {
				const audio = new NativeAudio(source);
				window.__narrationAudios.push(audio);
				return audio;
			};
			window.Audio.prototype = NativeAudio.prototype;
		});
		const page = await context.newPage();
		for (const manifest of manifests.values()) {
			await page.goto(`${origin}${manifest.articlePath}`, {
				waitUntil: 'networkidle',
				timeout: 60_000
			});
			const text = await page.evaluate(extractNarration);
			if (digest(text) !== manifest.textHash)
				throw new Error('Live article transcript does not match its narration.');
			const player = page.locator('[data-testid="article-tts"]');
			await player
				.getByText('Google narration', { exact: true })
				.waitFor({ state: 'attached', timeout: 20_000 });
			await player.getByRole('button', { name: 'Listen to article', exact: true }).click();
			await page.waitForFunction(
				() => window.__narrationAudios.some((audio) => audio.currentTime > 0 && !audio.paused),
				undefined,
				{ timeout: 20_000 }
			);
			await player.getByLabel('Playback speed').selectOption('1.25');
			await page.waitForFunction(() => window.__narrationAudios[0]?.playbackRate === 1.25);
			const position = Math.min(
				12,
				manifest.segments.reduce((sum, part) => sum + part.duration, 0) / 2
			);
			await player.getByLabel('Playback position').evaluate((input, seconds) => {
				input.value = String(seconds);
				input.dispatchEvent(new Event('change', { bubbles: true }));
			}, position);
			await page.waitForFunction(
				(seconds) =>
					window.__narrationAudios.length === 1 &&
					Math.abs(window.__narrationAudios[0].currentTime - seconds) < 2,
				position
			);
			await player.getByRole('button', { name: 'Pause article audio', exact: true }).click();
			await player.getByRole('button', { name: 'Resume article audio', exact: true }).waitFor();
			await page.waitForFunction(() => window.__narrationAudios[0]?.paused === true);
			const pausedAt = await page.evaluate(() => window.__narrationAudios[0].currentTime);
			await player.getByRole('button', { name: 'Resume article audio', exact: true }).click();
			await page.waitForFunction(
				(seconds) =>
					!window.__narrationAudios[0].paused &&
					window.__narrationAudios[0].currentTime > seconds + 0.05,
				pausedAt
			);
			await player.getByRole('button', { name: 'Stop article audio', exact: true }).click();
		}
		const fallback = await browser.newContext(browserContextOptions());
		await fallback.route(
			/https:\/\/(?:generativelanguage|texttospeech)\.googleapis\.com\//u,
			(route) => {
				providerRequests += 1;
				return route.abort();
			}
		);
		await fallback.route('**/audio/articles/*/manifest.json', (route) =>
			route.fulfill({ status: 404, body: '' })
		);
		await fallback.addInitScript(() => {
			window.__deviceNarration = false;
			window.SpeechSynthesisUtterance = class {
				constructor(text) {
					this.text = text;
					this.lang = '';
					this.voice = null;
					this.rate = 1;
				}
			};
			Object.defineProperty(window.speechSynthesis, 'getVoices', {
				value: () => [
					{
						voiceURI: 'ci-us',
						name: 'CI US English',
						lang: 'en-US',
						default: true,
						localService: true
					}
				]
			});
			Object.defineProperty(window.speechSynthesis, 'speak', {
				value: (utterance) => {
					window.__deviceNarration = utterance.lang === 'en-US';
					utterance.onstart?.({});
				}
			});
		});
		const fallbackPage = await fallback.newPage();
		await fallbackPage.goto(`${origin}${manifests.values().next().value.articlePath}`, {
			waitUntil: 'networkidle',
			timeout: 60_000
		});
		await fallbackPage
			.locator('[data-testid="article-tts"]')
			.getByRole('button', { name: 'Listen to article', exact: true })
			.click();
		await fallbackPage.waitForFunction(() => window.__deviceNarration === true, undefined, {
			timeout: 10_000
		});
		if (providerRequests)
			throw new Error('Browser narration unexpectedly attempted provider access.');
	} finally {
		await browser.close();
	}
}

async function startPreview(root, env) {
	const child = spawn(
		process.execPath,
		[
			'node_modules/vite/bin/vite.js',
			'preview',
			'--host',
			'127.0.0.1',
			'--port',
			'4218',
			'--strictPort'
		],
		{ cwd: root, env: publicChildEnvironment(env), windowsHide: true, stdio: 'ignore' }
	);
	let failed = false;
	child.on('error', () => {
		failed = true;
	});
	child.on('exit', () => {
		failed = true;
	});
	const close = async () => {
		if (child.exitCode !== null) return;
		child.kill('SIGTERM');
		await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(5000)]);
		if (child.exitCode === null) child.kill('SIGKILL');
	};
	try {
		for (let attempt = 0; attempt < 60; attempt += 1) {
			if (failed) throw new Error('The fresh local preview failed to start.');
			try {
				const response = await fetch(`${LOCAL_ORIGIN}/robots.txt`, {
					signal: AbortSignal.timeout(2000)
				});
				await response.body?.cancel();
				if (response.ok) return { close };
			} catch {
				/* Wait for local listener. */
			}
			await sleep(1000);
		}
		throw new Error('The fresh local preview did not become ready.');
	} catch (error) {
		await close();
		throw error;
	}
}

async function defaultDependencies(root, env) {
	const { createGithubNarrationState } = await import('./lib/github-narration-state.mjs');
	const { runNarration, deliveredManifestIsReady } = await import('./article-narration.mjs');
	const childEnv = publicChildEnvironment(env);
	const run = (command, args, options = {}) =>
		runCommand(command, args, { root, env: childEnv, publicLog: true, ...options });
	const git = (args, write = false) =>
		run('git', args, { env: gitEnvironment(env, write), publicLog: false, timeoutMs: 120_000 });
	return {
		createState: () => createGithubNarrationState({ root, env }),
		async prepare() {
			if ((await git(GIT_STATUS_ARGS)).length)
				throw new Error('Automatic narration requires a clean checkout; preserve concurrent work.');
			if (!expectedGitRemote(await git(['remote', 'get-url', 'origin'])))
				throw new Error('Unexpected narration Git remote.');
			await git(['fetch', 'origin', 'main']);
			const base = (await git(['rev-parse', 'HEAD'])).trim();
			if (base !== (await git(['rev-parse', 'origin/main'])).trim())
				throw new Error('Checkout is no longer the latest main; retry without overwriting work.');
			return base;
		},
		storage: () => assertStorageBudget(root, run),
		async preview() {
			await run('npm', ['run', 'build:site']);
			return startPreview(root, env);
		},
		async inventory() {
			return discoverArticles(LOCAL_ORIGIN, root);
		},
		async article(article) {
			const { chromium } = await import('@playwright/test');
			const browser = await chromium.launch(browserLaunchOptions(env));
			try {
				const context = await browser.newContext(
					browserContextOptions({ javaScriptEnabled: false })
				);
				await context.route('**/*', (route) =>
					route.request().isNavigationRequest() &&
					new URL(route.request().url()).origin === LOCAL_ORIGIN
						? route.continue()
						: route.abort()
				);
				const page = await context.newPage();
				const response = await page.goto(`${LOCAL_ORIGIN}${article.pathname}`, {
					waitUntil: 'domcontentloaded',
					timeout: 45_000
				});
				if (!response?.ok() || new URL(page.url()).pathname !== article.pathname)
					throw new Error('Current article does not resolve canonically.');
				return { ...article, text: await page.evaluate(extractNarration) };
			} finally {
				await browser.close();
			}
		},
		deliveries: () => listDeliveries(root),
		complete: () => completeSources(root),
		deliveryReady: (manifest, article, config) =>
			deliveredManifestIsReady(manifest, article, config, path.join(root, 'static/audio/articles')),
		sourceReady: (manifest, article, config) =>
			manifestIsReady(manifest, article, config, getNarrationSourceRoot(root)),
		generate: (hooks, route = { mode: 'missing' }) =>
			runNarration(
				[
					...(route.slug
						? ['--slug', route.slug]
						: [
								`--${route.mode}`,
								'--limit',
								'20',
								...(route.mode === 'stale' ? ['--offset', String(route.offset)] : [])
							]),
					'--max-requests',
					'10',
					'--origin',
					LOCAL_ORIGIN
				],
				hooks
			),
		compress: (slugs) => compressComplete({ root, slugs }),
		async test() {
			await run('npm', ['run', 'narration:browser:test'], {
				env: { ...childEnv, PLAYWRIGHT_REUSE_SERVER: '1' }
			});
		},
		async publish(base, slugs) {
			if (!(await git(GIT_STATUS_ARGS)).length) return base;
			await run('npm', ['run', 'build']);
			const status = parseStatus(await git(GIT_STATUS_ARGS));
			if (!status.length) return base;
			if (
				status.some(
					({ file, status: code }) => !allowedPublicationPath(file, slugs) || /D/u.test(code)
				)
			)
				throw new Error(
					'Unexpected build changes require review; narration checkpoints are preserved.'
				);
			await git(['diff', '--check']);
			await git(['fetch', 'origin', 'main']);
			if ((await git(['rev-parse', 'origin/main'])).trim() !== base)
				throw new Error(
					'main advanced during generation; preserve the batch and retry on latest main.'
				);
			await git(['add', '--', ...status.map(({ file }) => file)]);
			await git([
				'-c',
				'user.name=github-actions[bot]',
				'-c',
				'user.email=41898282+github-actions[bot]@users.noreply.github.com',
				'commit',
				'-m',
				`Publish Achird narration for ${slugs.length} article(s)`
			]);
			return (await git(['rev-parse', 'HEAD'])).trim();
		},
		async probe(base) {
			await git(['fetch', 'origin', 'main']);
			if ((await git(['rev-parse', 'origin/main'])).trim() !== base)
				throw new Error('main advanced before the one-time deployment probe.');
			await git([
				'-c',
				'user.name=github-actions[bot]',
				'-c',
				'user.email=41898282+github-actions[bot]@users.noreply.github.com',
				'commit',
				'--allow-empty',
				'-m',
				'Verify hosted Achird publication connection'
			]);
			return (await git(['rev-parse', 'HEAD'])).trim();
		},
		async push(commit) {
			await git(['push', 'origin', 'HEAD:refs/heads/main'], true);
			if (!(await git(['ls-remote', 'origin', 'refs/heads/main'])).startsWith(`${commit}\t`))
				throw new Error('Remote main changed after publication; verify before continuing.');
		},
		async verify(commit, manifests) {
			await waitForProduction(commit, { request: githubReadClient({ env }) });
			for (const [slug, manifest] of manifests)
				await verifyLiveArticle({ slug, manifest, root, commit });
			await browserSmoke(manifests, { env });
		},
		async summary(report) {
			if (env.GITHUB_STEP_SUMMARY)
				await fs.appendFile(
					env.GITHUB_STEP_SUMMARY,
					`## Daily Achird narration\n\n${JSON.stringify(report, null, 2)}\n\nFree-tier status is the pinned operator attestation, not a live billing API audit.\n`
				);
		}
	};
}

export async function runGithubNarration({ root = ROOT, env = process.env, dependencies } = {}) {
	const deps = dependencies ?? (await defaultDependencies(root, env));
	const verifyOnly = env.NARRATION_VERIFY_ONLY === 'true';
	const deploymentProbe = env.NARRATION_DEPLOYMENT_PROBE === 'true';
	if (deploymentProbe && (!verifyOnly || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'))
		throw new Error('A deployment probe requires explicit manual verify-only dispatch.');
	if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== 'refs/heads/main')
		throw new Error('Hosted narration requires trusted main.');
	if (!verifyOnly && env.NARRATION_HOSTED_ENABLED !== 'true')
		throw new Error('Hosted narration is not activated.');
	const state = await deps.createState();
	const restored = await state.restore();
	const config = assertHostedConfiguration(restored, env);
	const base = await deps.prepare();
	await deps.storage();
	const report = {
		verifyOnly,
		deploymentProbe,
		generated: 0,
		published: [],
		recovered: [],
		staleSources: [],
		generationRoutes: [],
		staleDeliveries: [],
		paused: null,
		commit: base
	};
	let preview;
	try {
		preview = await deps.preview();
		const inventory = new Map(
			(await deps.inventory())
				.filter((article) => !article.interactiveGame)
				.map((article) => [article.slug, article])
		);
		const currentArticle = async (slug) => {
			const article = inventory.get(slug);
			if (!article)
				throw new Error('A pending narration no longer belongs to the published corpus.');
			return deps.article(article);
		};
		const ready = new Set();
		const recover = async () => {
			const delivered = await deps.deliveries();
			const compress = [];
			for (const slug of await deps.complete()) {
				if (!inventory.has(slug)) continue;
				const article = await currentArticle(slug);
				if (await deps.deliveryReady(delivered.get(slug), article, config)) {
					ready.add(slug);
					continue;
				}
				const manifest = await readJson(
					path.join(getNarrationSourceRoot(root), slug, 'manifest.json')
				);
				if (!(await deps.sourceReady(manifest, article, config))) {
					if (!report.staleSources.includes(slug)) report.staleSources.push(slug);
					continue;
				}
				compress.push(slug);
			}
			if (compress.length && !verifyOnly) {
				await deps.compress(compress);
				for (const slug of compress) {
					const manifest = (await deps.deliveries()).get(slug);
					if (!(await deps.deliveryReady(manifest, await currentArticle(slug), config)))
						throw new Error('Compressed narration failed current transcript verification.');
					ready.add(slug);
				}
			}
			return compress;
		};
		if (!verifyOnly) report.recovered = await recover();
		if (!verifyOnly) {
			const hooks = {
				beforeRequest: () => state.saveQuota(),
				onQuota: () => state.saveQuota(),
				onSegment: ({ reused }) => (reused ? undefined : state.saveCheckpoint()),
				onArticle: async ({ slug }) => {
					report.generated += 1;
					ready.add(slug);
					await state.saveCheckpoint();
				}
			};
			const routes = generationRoutes({
				staleSources: report.staleSources,
				articles: [...inventory.values()],
				deliveredSlugs: [...(await deps.deliveries()).keys()],
				completeSlugs: await deps.complete()
			});
			for (const route of routes) {
				report.generationRoutes.push(route);
				const summary = await deps.generate(hooks, route);
				report.paused = summary?.paused ?? null;
				if (summary?.failed)
					throw new Error(
						'Narration generation reported a real failure. Checkpoints are preserved; no publication attempted.'
					);
				if (report.paused) break;
			}
			await recover();
		}
		const all = await deps.deliveries();
		const verifySlugs = new Set([
			// Initial deliveries are a deliberate manual smoke fixture. Rechecking
			// them daily would launch a production browser even on a no-work run.
			...(verifyOnly ? INITIAL_ARTICLES : []),
			...ready,
			...(restored.publication?.status !== 'verified'
				? (restored.publication?.slugs ?? [])
				: []
			).filter((slug) => all.has(slug))
		]);
		const manifests = new Map();
		for (const slug of verifySlugs) {
			const manifest = all.get(slug);
			if (
				!inventory.has(slug) ||
				!(await deps.deliveryReady(manifest, await currentArticle(slug), config))
			) {
				if (verifyOnly || ready.has(slug))
					throw new Error(
						'Pending delivery is stale or incomplete; browser fallback remains available.'
					);
				report.staleDeliveries.push(slug);
				continue;
			}
			manifests.set(slug, manifest);
		}
		if (!manifests.size && verifyOnly)
			throw new Error(
				'No complete article delivery is available for the initial hosted smoke test.'
			);
		await deps.storage();
		if (!verifyOnly) {
			await deps.test();
			await preview.close();
			preview = null;
			const commit = await deps.publish(base, [...ready]);
			report.commit = commit;
			if (commit !== base) {
				await state.savePublication({ commit, slugs: [...ready], status: 'pending' });
				await state.saveCheckpoint();
				await deps.push(commit);
				await state.savePublication({ commit, slugs: [...ready], status: 'pushed' });
				report.published = [...ready];
			}
		}
		if (deploymentProbe) {
			await preview.close();
			preview = null;
			report.commit = await deps.probe(base);
			await state.savePublication({
				commit: report.commit,
				slugs: [...manifests.keys()],
				status: 'pending'
			});
			await deps.push(report.commit);
			await state.savePublication({
				commit: report.commit,
				slugs: [...manifests.keys()],
				status: 'pushed'
			});
		}
		if (manifests.size) await deps.verify(report.commit, manifests);
		if (deploymentProbe)
			await state.savePublication({
				commit: report.commit,
				slugs: [...manifests.keys()],
				status: 'verified'
			});
		if (!verifyOnly && manifests.size) {
			await state.savePublication({
				commit: report.commit,
				slugs: [...manifests.keys()],
				status: 'verified'
			});
			await state.dropPublishedSources([...manifests.keys()]);
			await state.saveCheckpoint();
		}
		return report;
	} finally {
		await preview?.close();
		if (!verifyOnly) await state.saveCheckpoint();
		await deps.summary(report);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	runGithubNarration()
		.then((report) => console.log(JSON.stringify(report, null, 2)))
		.catch((error) => {
			console.error(error.message);
			process.exitCode = 1;
		});
}
