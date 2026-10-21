import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { parsePostFrontmatter } from './lib/post-metadata.mjs';
import {
	createGoogleClient,
	googleConfig,
	digest,
	inspectWav,
	assertFreeTier,
	GoogleTTSError
} from './lib/google-tts.mjs';
import { extractNarration, NARRATION_VERSION } from '../src/lib/components/blog/tts/narration.mjs';
import { createNarrationQuota } from './lib/narration-quota.mjs';
import {
	segmentNarration,
	SEGMENTATION_POLICY,
	LEGACY_SEGMENTATION_POLICY
} from './lib/narration-segments.mjs';
export { segmentNarration };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ORIGIN = 'http://127.0.0.1:4218';
const SLUG = /^[a-z0-9_-]{1,200}$/i;
const HELP = `Generate reusable US English article narration through Google's confirmed free tier.

Start a local server: npm run dev -- --host 127.0.0.1 --port 4218
Preview work (no Google requests): npm run narration:generate -- --missing --dry-run --limit 5
Generate one article: npm run narration:generate -- --slug ARTICLE_SLUG
Resume missing audio: npm run narration:generate -- --missing --limit 1 --max-requests 5
Refresh stale audio: npm run narration:generate -- --stale --limit 1
Audition the narrator: npm run narration:generate -- --sample
List verified US voices: npm run narration:generate -- --list-voices
Inspect coverage: npm run narration:generate -- --status

Options:
  --origin URL       Loopback local site only (default ${DEFAULT_ORIGIN})
  --limit N          Maximum articles inspected/generated, 1–20 (default 1)
  --offset N         Skip N eligible articles when auditing later stale windows (default 0)
  --max-requests N   Total Google calls including voice catalogue, 1–50 (default 5)
  --dry-run         No Google calls, file writes, or credentials required
  --status          Count source coverage and delivered manifests without synthesizing

Generation requires private GEMINI_API_KEY and GEMINI_TTS_FREE_TIER_CONFIRMED=true.
Use a free-tier project without billing; the flag is operator confirmation, not an API
billing-tier check. A persistent local ledger caps all runs at 10 calls per Pacific day,
spaces requests by at least 65 seconds, and blocks until the next day after HTTP 429.
Sequential requests stop on quota, deadline, or budget exhaustion.
Existing complete segments are reused after WAV and checksum validation. Normal site
builds and visitor playback never call Google. The npm command loads optional .env.local;
direct node callers supply the environment or use --env-file-if-exists=.env.local.
Validated WAV sources and resumable manifests remain private in
.codex-artifacts/narration-sources; compression publishes separate delivery assets.`;

/** Authoring sources never enter SvelteKit's automatically copied public static tree. */
export function getNarrationSourceRoot(root = ROOT) {
	return path.join(root, '.codex-artifacts', 'narration-sources');
}

export async function readNarrationSourceManifests(articles, root = ROOT) {
	const sourceRoot = getNarrationSourceRoot(root);
	return new Map(
		await Promise.all(
			articles.map(async (article) => [
				article.slug,
				await readJson(path.join(sourceRoot, article.slug, 'manifest.json'))
			])
		)
	);
}

export function parseArgs(argv) {
	const options = {
		origin: DEFAULT_ORIGIN,
		limit: 1,
		offset: 0,
		maxRequests: 5,
		dryRun: false,
		missing: false,
		stale: false,
		sample: false,
		listVoices: false,
		status: false,
		help: false,
		slug: ''
	};
	const flags = {
		'--dry-run': 'dryRun',
		'--missing': 'missing',
		'--stale': 'stale',
		'--sample': 'sample',
		'--list-voices': 'listVoices',
		'--status': 'status',
		'--help': 'help'
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (flags[arg]) {
			options[flags[arg]] = true;
			continue;
		}
		if (!['--slug', '--origin', '--limit', '--offset', '--max-requests'].includes(arg))
			throw new Error(`Unknown argument: ${arg}`);
		const value = argv[++index];
		if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
		if (arg === '--slug') options.slug = value;
		if (arg === '--origin') options.origin = value;
		if (arg === '--limit') options.limit = Number(value);
		if (arg === '--offset') options.offset = Number(value);
		if (arg === '--max-requests') options.maxRequests = Number(value);
	}
	if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 20)
		throw new Error('--limit must be an integer from 1 to 20.');
	if (!Number.isInteger(options.offset) || options.offset < 0 || options.offset > 100_000)
		throw new Error('--offset must be an integer from 0 to 100000.');
	if (!Number.isInteger(options.maxRequests) || options.maxRequests < 1 || options.maxRequests > 50)
		throw new Error('--max-requests must be an integer from 1 to 50.');
	if (options.slug && !SLUG.test(options.slug)) throw new Error('Invalid article slug.');
	const origin = new URL(options.origin);
	if (
		!['http:', 'https:'].includes(origin.protocol) ||
		!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) ||
		origin.username ||
		origin.password ||
		origin.pathname !== '/' ||
		origin.search ||
		origin.hash
	)
		throw new Error('--origin must be a plain loopback HTTP(S) origin.');
	options.origin = origin.origin;
	const modes = [
		options.slug,
		options.missing,
		options.stale,
		options.sample,
		options.listVoices,
		options.status
	].filter(Boolean);
	if (!options.help && modes.length !== 1)
		throw new Error(
			'Choose exactly one of --slug, --missing, --stale, --sample, --list-voices, or --status.'
		);
	return options;
}

export function fingerprint(text, config) {
	return digest(JSON.stringify({ version: NARRATION_VERSION, text, ...config }));
}

export function chooseVoice(voices, configured = '') {
	if (configured) {
		const voice = voices.find((entry) => entry.id === configured);
		if (!voice)
			throw new GoogleTTSError(
				'VOICES',
				'Configured GEMINI_TTS_VOICE was absent from the verified US English/American prebuilt catalogue.'
			);
		return voice;
	}
	const score = (voice) => {
		const description = `${voice.display_name ?? ''} ${voice.description ?? ''}`;
		return (
			(/(warm|clear|natural|narrat)/i.test(description) ? 10 : 0) -
			(/(robot|character|cartoon|gravel|whisper)/i.test(description) ? 20 : 0)
		);
	};
	return [...voices].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0];
}

export async function atomicWrite(file, content) {
	await fs.mkdir(path.dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
	try {
		await fs.writeFile(temporary, content, { flag: 'wx' });
		await fs.rename(temporary, file);
	} finally {
		await fs.rm(temporary, { force: true });
	}
}

async function readJson(file) {
	try {
		return JSON.parse(await fs.readFile(file, 'utf8'));
	} catch (error) {
		if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
		throw error;
	}
}

export async function readCachedSegment(directory, name) {
	try {
		const [audio, checkpoint] = await Promise.all([
			fs.readFile(path.join(directory, `${name}.wav`)),
			readJson(path.join(directory, `${name}.json`))
		]);
		const info = inspectWav(audio);
		return checkpoint?.audioHash === info.audioHash ? info : null;
	} catch (error) {
		if (error.code === 'ENOENT' || error instanceof GoogleTTSError) return null;
		throw error;
	}
}

export async function selectArticleSegments({ article, config, outputRoot }) {
	const legacy = segmentNarration(article.text, 1800);
	const legacyCheckpoint = legacy[0]
		? await readCachedSegment(
				path.join(outputRoot, article.slug),
				fingerprint(legacy[0].text, config)
			)
		: null;
	return {
		segmentation: legacyCheckpoint ? LEGACY_SEGMENTATION_POLICY : SEGMENTATION_POLICY,
		parts: legacyCheckpoint ? legacy : segmentNarration(article.text)
	};
}

export async function generateArticle({
	article,
	config,
	client,
	outputRoot,
	onSegment = () => {}
}) {
	if (!SLUG.test(article.slug) && article.slug !== '_audition')
		throw new Error('Invalid article slug.');
	const directory = path.join(outputRoot, article.slug);
	const textHash = digest(article.text);
	const articleFingerprint = fingerprint(article.text, config);
	const { segmentation, parts } = await selectArticleSegments({ article, config, outputRoot });
	const segments = [];
	for (const part of parts) {
		const name = fingerprint(part.text, config);
		let cached = await readCachedSegment(directory, name);
		if (!cached) {
			const result = await client.synthesize(part.text.trim(), config);
			// Decode/validate again at the persistence boundary, including injected clients in tests.
			cached = inspectWav(result.audio);
			await atomicWrite(path.join(directory, `${name}.wav`), result.audio);
			await atomicWrite(path.join(directory, `${name}.json`), JSON.stringify(cached));
			onSegment({ reused: false, name });
		} else onSegment({ reused: true, name });
		segments.push({
			src: `/audio/articles/${article.slug}/${name}.wav`,
			duration: cached.duration,
			textStart: part.textStart,
			textEnd: part.textEnd
		});
	}
	if (!segments.length) throw new Error('Article contains no narration text.');
	const manifest = {
		version: NARRATION_VERSION,
		segmentation,
		textHash,
		fingerprint: articleFingerprint,
		language: config.language,
		model: config.model,
		voice: config.voice,
		style: config.style,
		format: config.format,
		title: article.title,
		articlePath: article.pathname,
		generatedAt: new Date().toISOString(),
		totalDuration: segments.reduce((sum, part) => sum + part.duration, 0),
		segments
	};
	await atomicWrite(
		path.join(directory, 'manifest.json'),
		`${JSON.stringify(manifest, null, 2)}\n`
	);
	return manifest;
}

export async function manifestIsReady(manifest, article, config, outputRoot) {
	if (
		['language', 'model', 'voice', 'style', 'format'].some(
			(field) => manifest?.[field] !== config[field]
		)
	)
		return false;
	if (
		!manifest ||
		manifest.version !== NARRATION_VERSION ||
		manifest.textHash !== digest(article.text) ||
		manifest.fingerprint !== fingerprint(article.text, config) ||
		!Array.isArray(manifest.segments) ||
		!manifest.segments.length
	)
		return false;
	const segmentation =
		manifest.segmentation === undefined ? LEGACY_SEGMENTATION_POLICY : manifest.segmentation;
	if (![SEGMENTATION_POLICY, LEGACY_SEGMENTATION_POLICY].includes(segmentation)) return false;
	const expected = segmentNarration(
		article.text,
		segmentation === LEGACY_SEGMENTATION_POLICY ? 1800 : 6000
	);
	if (expected.length !== manifest.segments.length) return false;
	for (let index = 0; index < expected.length; index += 1) {
		const name = fingerprint(expected[index].text, config);
		const actual = manifest.segments[index];
		if (
			!actual ||
			typeof actual !== 'object' ||
			Array.isArray(actual) ||
			actual.src !== `/audio/articles/${article.slug}/${name}.wav` ||
			actual.textStart !== expected[index].textStart ||
			actual.textEnd !== expected[index].textEnd
		)
			return false;
		const cached = await readCachedSegment(path.join(outputRoot, article.slug), name);
		if (!cached || cached.duration !== actual.duration) return false;
	}
	return true;
}

/** The sitemap uses the canonical published-post registry; source metadata adds a future-date guard. */
export async function discoverArticles(origin, root = ROOT, now = new Date()) {
	const response = await fetch(`${origin}/sitemap.xml`, {
		signal: AbortSignal.timeout(120_000),
		redirect: 'error'
	});
	if (!response.ok)
		throw new Error(
			`Local sitemap unavailable (HTTP ${response.status}). Start the local server first.`
		);
	const xml = await response.text();
	if (Buffer.byteLength(xml) > 4 * 1024 * 1024)
		throw new Error('Local sitemap exceeded its size bound.');
	const articles = [];
	const seen = new Set();
	for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
		const url = new URL(match[1].replaceAll('&amp;', '&'));
		const parts = url.pathname.split('/').filter(Boolean);
		if (parts.length !== 3 || parts[0] !== 'blog') continue;
		const slug = decodeURIComponent(parts[2]);
		if (!SLUG.test(slug) || seen.has(slug)) continue;
		let source;
		try {
			source = await fs.readFile(path.join(root, 'src/lib/posts', `${slug}.md`), 'utf8');
		} catch (error) {
			if (error.code === 'ENOENT') continue;
			throw error;
		}
		const metadata = parsePostFrontmatter(source, slug);
		const publishedAt = new Date(metadata.date).getTime();
		if (
			metadata.published === false ||
			metadata.status === 'draft' ||
			!Number.isFinite(publishedAt) ||
			publishedAt > now.getTime()
		)
			continue;
		seen.add(slug);
		articles.push({
			slug,
			pathname: url.pathname,
			title: metadata.title,
			date: metadata.date,
			interactiveGame: parts[1] === 'games'
		});
	}
	return articles.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export async function lockGeneration(root, { lockDirectory = os.tmpdir() } = {}) {
	const file = path.join(lockDirectory, `article-narration-${digest(root).slice(0, 20)}.lock`);
	let handle;
	try {
		handle = await fs.open(file, 'wx');
	} catch (error) {
		if (error.code !== 'EEXIST') throw error;
		// Serialize stale-lock inspection and replacement. This marker deliberately
		// has no automatic recovery: a crash here requires inspecting it manually.
		const recoveryFile = `${file}.recovery`;
		let recovery;
		try {
			recovery = await fs.open(recoveryFile, 'wx');
		} catch (recoveryError) {
			throw new Error(
				`Narration lock recovery is already reserved. If no narration command is running, inspect and remove this recovery marker manually: ${recoveryFile}`,
				{ cause: recoveryError }
			);
		}
		try {
			// Re-read under the recovery marker; never delete using an earlier owner snapshot.
			const previous = await readJson(file);
			const stat = await fs.stat(file);
			const validOwner = Number.isInteger(previous?.pid) && previous.pid > 0;
			// wx creates the file before writing owner metadata. Preserve that window.
			if (!validOwner && Date.now() - stat.mtimeMs < 60_000)
				throw new Error(
					'Another narration command is initializing its generation lock; retry later.',
					{ cause: error }
				);
			let alive = false;
			if (validOwner) {
				try {
					process.kill(previous.pid, 0);
					alive = true;
				} catch (probeError) {
					if (probeError.code !== 'ESRCH')
						throw new Error(
							'Cannot verify the existing narration lock owner; refusing to replace it.',
							{ cause: probeError }
						);
				}
			}
			if (alive)
				throw new Error('Another narration command is running for this repository.', {
					cause: error
				});
			await fs.rm(file, { force: true });
			// A normal creator may win the missing-file window. wx then fails safely;
			// never unlink its newly acquired lock in an attempt to retry.
			handle = await fs.open(file, 'wx');
		} finally {
			await recovery.close();
			await fs.rm(recoveryFile, { force: true });
		}
	}
	await handle.writeFile(JSON.stringify({ pid: process.pid }));
	await handle.close();
	return () => fs.rm(file, { force: true });
}

async function main(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);
	if (options.help) {
		console.log(HELP);
		return;
	}
	const config = googleConfig();
	if (options.listVoices || options.sample) {
		if (options.dryRun) {
			console.log(
				`Dry run: ${options.sample ? 'audition' : 'US voice catalogue'}; model=${config.model}, language=en-US. No Google requests or file writes.`
			);
			return;
		}
		assertFreeTier();
	}
	const outputRoot = getNarrationSourceRoot();
	let release;
	let browser;
	try {
		if (!options.dryRun && !options.status) release = await lockGeneration(ROOT);
		const quota = createNarrationQuota({
			stateFile: path.join(ROOT, '.codex-artifacts/narration-quota.json'),
			onProgress: ({ type, remainingMs }) => {
				if (type === 'wait')
					console.log(
						`Free-tier pacing: next request in ${Math.ceil(remainingMs / 1000)} seconds.`
					);
			}
		});
		const client = createGoogleClient({
			maxRequests: options.maxRequests,
			beforeRequest: () => quota.beforeRequest(),
			onQuota: () => quota.markQuota()
		});
		if (options.listVoices || options.sample) {
			const voices = await client.listVoices();
			if (options.listVoices) {
				console.log(
					JSON.stringify(
						voices.map(({ id, display_name, language_code, accent, description }) => ({
							id,
							display_name,
							language_code,
							accent,
							description
						})),
						null,
						2
					)
				);
				return;
			}
			config.voice = chooseVoice(voices, config.voice).id;
			const audition = {
				slug: '_audition',
				title: 'US English narrator audition',
				pathname: '',
				text: 'A quiet morning begins in Calcutta. What makes a familiar place feel like home?\n\n"Pay attention to the small things," the traveller said. Suvro Ghosh walked past Howrah Bridge and thought of Rabindranath Tagore.\n\nআজ কলকাতার আকাশ পরিষ্কার। The story continues, with room to breathe between sentences.'
			};
			const result = await generateArticle({ article: audition, config, client, outputRoot });
			console.log(
				JSON.stringify(
					{
						audition: path.join(outputRoot, '_audition', 'manifest.json'),
						audio: path.join(outputRoot, '_audition', path.basename(result.segments[0].src)),
						localPath: path.join(outputRoot, '_audition/manifest.json'),
						voice: config.voice,
						requests: client.requests,
						seconds: result.totalDuration
					},
					null,
					2
				)
			);
			return;
		}
		const inventory = await discoverArticles(options.origin);
		// Dedicated games render an application rather than an article reading region.
		const narratable = inventory.filter((article) => !article.interactiveGame);
		const manifests = await readNarrationSourceManifests(inventory);
		const missing = narratable.filter((article) => !manifests.get(article.slug)).length;
		if (!config.voice) {
			const prior =
				[...manifests.values()].find(
					(manifest) =>
						manifest?.version === NARRATION_VERSION &&
						manifest.language === 'en-US' &&
						typeof manifest.voice === 'string'
				) ?? (await readJson(path.join(outputRoot, '_audition', 'manifest.json')));
			if (prior?.language === 'en-US' && typeof prior.voice === 'string')
				config.voice = prior.voice;
		}
		if (options.status) {
			const delivered = await Promise.all(
				narratable.map((article) =>
					readJson(path.join(ROOT, 'static/audio/articles', article.slug, 'manifest.json'))
				)
			);
			console.log(
				JSON.stringify(
					{
						published: inventory.length,
						narratable: narratable.length,
						excludedInteractiveGames: inventory.length - narratable.length,
						missing,
						presentUnverified: narratable.length - missing,
						deliveredPresentUnverified: delivered.filter(Boolean).length,
						ready: 0,
						stale: 'Run --stale --dry-run to verify rendered text and cached audio.',
						note: 'Missing/present counts describe private WAV sources; delivery is counted separately. Manifest presence alone does not prove full, current narration.'
					},
					null,
					2
				)
			);
			return;
		}
		let selected = options.slug
			? narratable.filter((article) => article.slug === options.slug)
			: narratable.filter((article) =>
					options.missing ? !manifests.get(article.slug) : Boolean(manifests.get(article.slug))
				);
		if (options.slug && !selected.length)
			throw new Error(
				'Slug is absent from the canonical published, non-future prose inventory (interactive games are excluded).'
			);
		const pendingUninspected =
			selected.length - Math.min(Math.max(0, selected.length - options.offset), options.limit);
		selected = selected.slice(options.offset, options.offset + options.limit);
		const summary = {
			published: inventory.length,
			narratable: narratable.length,
			excludedInteractiveGames: inventory.length - narratable.length,
			inspected: 0,
			ready: 0,
			missing,
			stale: 0,
			generated: 0,
			failed: 0,
			paused: null,
			pending: pendingUninspected,
			estimatedRequests: 0,
			estimatedWavMiB: 0,
			requests: 0,
			dryRun: options.dryRun
		};
		async function reportSummary() {
			summary.requests = client.requests;
			summary.estimatedWavMiB = Math.round(summary.estimatedWavMiB * 10) / 10;
			if (!options.dryRun)
				await atomicWrite(
					path.join(ROOT, '.codex-artifacts/narration-last-batch.json'),
					`${JSON.stringify({ updatedAt: new Date().toISOString(), voice: config.voice, model: config.model, ...summary, quota: await quota.inspect() }, null, 2)}\n`
				);
			console.log(JSON.stringify(summary, null, 2));
		}
		if (!selected.length) {
			await reportSummary();
			return;
		}
		browser = await chromium.launch({
			channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
			headless: true
		});
		const context = await browser.newContext({
			javaScriptEnabled: false,
			viewport: { width: 1440, height: 1000 }
		});
		// SSR only: do not execute embedded applications or load article media during extraction.
		await context.route('**/*', (route) =>
			route.request().isNavigationRequest() &&
			new URL(route.request().url()).origin === options.origin
				? route.continue()
				: route.abort()
		);
		const page = await context.newPage();
		let configured = false;
		for (const article of selected) {
			try {
				const response = await page.goto(`${options.origin}${article.pathname}`, {
					waitUntil: 'domcontentloaded',
					timeout: 45_000
				});
				if (!response?.ok() || new URL(page.url()).pathname !== article.pathname)
					throw new Error('Article did not resolve to its canonical published route.');
				article.text = await page.evaluate(extractNarration);
				if (!article.text.trim()) throw new Error('Article has no readable SSR narration region.');
				summary.inspected += 1;
				const current = manifests.get(article.slug);
				// A previous catalogue-selected voice remains stable until explicitly reconfigured.
				const comparisonConfig = { ...config, voice: config.voice || current?.voice || '' };
				if (await manifestIsReady(current, article, comparisonConfig, outputRoot)) {
					summary.ready += 1;
					continue;
				}
				if (current) summary.stale += 1;
				const { parts, segmentation } = await selectArticleSegments({
					article,
					config,
					outputRoot
				});
				const pendingSegments = (
					await Promise.all(
						parts.map((part) =>
							readCachedSegment(path.join(outputRoot, article.slug), fingerprint(part.text, config))
						)
					)
				).filter((cached) => !cached).length;
				const words = article.text.split(/\s+/u).length;
				const estimate = ((words / 150) * 60 * 48_000) / (1024 * 1024);
				summary.estimatedRequests += pendingSegments;
				summary.estimatedWavMiB += estimate;
				console.log(
					`${options.dryRun ? 'Plan' : 'Narrate'} ${article.slug}: ${parts.length} segments (${pendingSegments} pending; ${segmentation}); approximately ${estimate.toFixed(1)} MiB WAV at 150 words/minute.`
				);
				if (options.dryRun) {
					summary.pending += 1;
					continue;
				}
				if (!configured) {
					assertFreeTier();
					const voices = await client.listVoices();
					config.voice = chooseVoice(voices, config.voice || current?.voice || '').id;
					configured = true;
				}
				await generateArticle({ article, config, client, outputRoot });
				summary.generated += 1;
				if (!current) summary.missing -= 1;
			} catch (error) {
				console.error(`${article.slug}: ${error.message}`);
				if (error instanceof GoogleTTSError) {
					const paused = ['BUDGET', 'DAILY_LIMIT', 'QUOTA_BLOCKED', 'QUOTA'].includes(error.code);
					if (paused) summary.paused = error.code;
					else summary.failed += 1;
					summary.pending += selected.length - summary.generated - summary.ready;
					if (!paused) process.exitCode = 1;
					break;
				}
				summary.failed += 1;
				process.exitCode = 1;
			}
		}
		await reportSummary();
	} finally {
		await browser?.close();
		await release?.();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
