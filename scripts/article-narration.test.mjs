import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
	createGoogleClient,
	googleConfig,
	digest,
	inspectWav,
	assertFreeTier,
	DEFAULT_STYLE,
	GoogleTTSError
} from './lib/google-tts.mjs';
import {
	parseArgs,
	segmentNarration,
	fingerprint,
	chooseVoice,
	generateArticle,
	manifestIsReady,
	lockGeneration,
	discoverArticles,
	getNarrationSourceRoot,
	readNarrationSourceManifests,
	deliveredManifestIsReady,
	createNarrationPersistenceHooks,
	selectNarrationArticles,
	runNarration,
	narrationBrowserEnvironment
} from './article-narration.mjs';
import { hashNarration } from '../src/lib/components/blog/tts/narration.mjs';
import {
	SEGMENTATION_POLICY,
	LEGACY_SEGMENTATION_POLICY,
	segmentWithinBounds
} from './lib/narration-segments.mjs';

const config = { ...googleConfig({}), voice: 'verified-us-narrator' };
const env = { GEMINI_API_KEY: 'unit-test-secret', GEMINI_TTS_FREE_TIER_CONFIRMED: 'true' };

function wav(seconds = 0.1) {
	const samples = Math.round(24_000 * seconds);
	const output = Buffer.alloc(44 + samples * 2);
	output.write('RIFF', 0);
	output.writeUInt32LE(output.length - 8, 4);
	output.write('WAVEfmt ', 8);
	output.writeUInt32LE(16, 16);
	output.writeUInt16LE(1, 20);
	output.writeUInt16LE(1, 22);
	output.writeUInt32LE(24_000, 24);
	output.writeUInt32LE(48_000, 28);
	output.writeUInt16LE(2, 32);
	output.writeUInt16LE(16, 34);
	output.write('data', 36);
	output.writeUInt32LE(samples * 2, 40);
	return output;
}

function interaction(audio = wav(), extra = {}) {
	return {
		status: 'completed',
		steps: [
			{
				type: 'model_output',
				content: [{ type: 'audio', mime_type: 'audio/wav', data: audio.toString('base64') }]
			}
		],
		...extra
	};
}

function json(value, status = 200) {
	return new Response(JSON.stringify(value), { status });
}

async function temporary(t) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'article-narration-test-'));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	return directory;
}

async function deliveryFixture(
	t,
	{ text = 'A complete article with a natural pause.', segmentation = SEGMENTATION_POLICY } = {}
) {
	const root = await temporary(t);
	const outputRoot = path.join(root, 'delivery');
	const article = {
		slug: 'delivered-article',
		title: 'Delivered article',
		pathname: '/blog/personal/delivered-article',
		text
	};
	const directory = path.join(outputRoot, article.slug);
	await fs.mkdir(directory, { recursive: true });
	const parts = segmentNarration(text, segmentation === LEGACY_SEGMENTATION_POLICY ? 1800 : 6000);
	const manifest = {
		version: 1,
		segmentation,
		textHash: digest(text),
		fingerprint: fingerprint(text, config),
		...config,
		title: article.title,
		articlePath: article.pathname,
		generatedAt: '2026-10-21T00:00:00.000Z',
		totalDuration: parts.length * 0.1,
		segments: [],
		delivery: {
			version: 1,
			format: 'audio/mpeg',
			codec: 'mp3',
			bitrate: 64_000,
			sampleRate: 24_000,
			channels: 1,
			encoderVersion: 'ffmpeg version 5.1-old-platform',
			encodedAt: '2026-10-21T00:01:00.000Z',
			segments: []
		}
	};
	for (const [index, part] of parts.entries()) {
		const audio = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(197, index + 1)]);
		const audioHash = digest(audio);
		await fs.writeFile(path.join(directory, `${audioHash}.mp3`), audio);
		manifest.segments.push({
			src: `/audio/articles/${article.slug}/${audioHash}.mp3`,
			duration: 0.1,
			textStart: part.textStart,
			textEnd: part.textEnd
		});
		manifest.delivery.segments.push({
			sourceFingerprint: fingerprint(part.text, config),
			sourceAudioHash: digest(wav()),
			sourceBytes: wav().length,
			audioHash,
			bytes: audio.length,
			decodedPCMHash: digest(Buffer.alloc(4800)),
			decodedDuration: 0.1
		});
	}
	await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
	return { root, outputRoot, directory, article, manifest };
}

test('CLI is bounded, loopback-only and rejects ambiguous modes/path traversal', () => {
	assert.equal(parseArgs(['--missing', '--dry-run']).origin, 'http://127.0.0.1:4218');
	assert.equal(parseArgs(['--stale', '--offset', '20']).offset, 20);
	assert.equal(
		parseArgs(['--slug', 'democracy_on_installments']).slug,
		'democracy_on_installments'
	);
	for (const args of [
		[],
		['--slug', '../private'],
		['--missing', '--stale'],
		['--sample', '--limit', '21'],
		['--sample', '--offset', '-1'],
		['--sample', '--max-requests', '100'],
		['--sample', '--origin', 'https://example.com'],
		['--sample', '--origin', 'http://user:password@localhost:4218'],
		['--sample', '--origin', 'http://localhost:4218/path']
	])
		assert.throws(() => parseArgs(args));
});

test('extraction browsers receive runtime settings without authoring or Git credentials', () => {
	const input = {
		PATH: '/usr/bin:/bin',
		CI: 'true',
		PLAYWRIGHT_CHANNEL: 'chromium',
		GEMINI_API_KEY: 'provider-secret',
		GEMINI_TTS_VOICE: 'achird',
		gemini_future_secret: 'private',
		GH_TOKEN: 'gh-secret',
		github_token: 'github-secret',
		NARRATION_STATE_KEY: 'encryption-secret',
		VERCEL_TOKEN: 'deployment-secret',
		VERCEL_AUTOMATION_BYPASS_SECRET: 'bypass-secret',
		GIT_CONFIG_COUNT: '1',
		GIT_CONFIG_KEY_0: 'http.extraheader',
		GIT_CONFIG_VALUE_0: 'authorization-secret',
		git_config_global: '/private/credentials.gitconfig',
		OPTIONAL: undefined
	};
	assert.deepEqual(narrationBrowserEnvironment(input), {
		PATH: input.PATH,
		CI: input.CI,
		PLAYWRIGHT_CHANNEL: input.PLAYWRIGHT_CHANNEL
	});
	assert.equal(
		input.GEMINI_API_KEY,
		'provider-secret',
		'Sanitizing a child environment must not mutate the authoring process.'
	);
	assert.equal(input.GIT_CONFIG_VALUE_0, 'authorization-secret');
});

test('free-tier confirmation and credentials fail closed before any transport', async () => {
	let calls = 0;
	for (const invalid of [
		{},
		{ GEMINI_API_KEY: 'secret' },
		{ GEMINI_TTS_FREE_TIER_CONFIRMED: 'true' }
	]) {
		const client = createGoogleClient({
			env: invalid,
			fetchImpl: async () => {
				calls += 1;
				return json({});
			}
		});
		await assert.rejects(() => client.listVoices(), /No Google request made/);
	}
	assert.equal(calls, 0);
	assert.doesNotThrow(() => assertFreeTier(env));
	assert.throws(
		() => googleConfig({ GEMINI_TTS_MODEL: 'expensive-unverified-model' }),
		/allowlist/
	);
	assert.equal(config.language, 'en-US');
	assert.equal(googleConfig({}).voice, 'achird');
	assert.match(DEFAULT_STYLE, /natural US English/);
});

test('persistent reservation precedes transport and quota rejection blocks transport', async () => {
	const events = [];
	const client = createGoogleClient({
		env,
		beforeRequest: async () => events.push('reserve'),
		onQuota: async () => events.push('block-next-day'),
		fetchImpl: async () => {
			events.push('transport');
			return json({}, 429);
		}
	});
	await assert.rejects(
		() => client.listVoices(),
		(error) => error.code === 'QUOTA'
	);
	assert.deepEqual(events, ['reserve', 'transport', 'block-next-day']);
	assert.equal(client.requests, 1);
	const blocked = createGoogleClient({
		env,
		beforeRequest: async () => {
			throw new GoogleTTSError('DAILY_LIMIT', 'Already reserved today.');
		},
		fetchImpl: async () => assert.fail('Must not send a blocked request')
	});
	await assert.rejects(
		() => blocked.listVoices(),
		(error) => error.code === 'DAILY_LIMIT'
	);
	assert.equal(blocked.requests, 0);
});

test('durable hooks await local reservation and remote persistence before transport', async () => {
	const events = [];
	let release;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	let entered;
	const started = new Promise((resolve) => {
		entered = resolve;
	});
	const persistence = createNarrationPersistenceHooks(
		{
			beforeRequest: async () => {
				events.push('local-reserved');
			},
			markQuota: async () => {
				events.push('local-blocked');
			}
		},
		{
			beforeRequest: async () => {
				events.push('remote-started');
				entered();
				await gate;
				events.push('remote-persisted');
			},
			onQuota: async () => {
				events.push('remote-blocked');
			}
		}
	);
	const client = createGoogleClient({
		env,
		...persistence,
		fetchImpl: async () => {
			events.push('transport');
			return json({}, 429);
		}
	});
	const result = client.listVoices();
	await started;
	assert.deepEqual(events, ['local-reserved', 'remote-started']);
	assert.equal(client.requests, 0);
	release();
	await assert.rejects(result, (error) => error.code === 'QUOTA');
	assert.deepEqual(events, [
		'local-reserved',
		'remote-started',
		'remote-persisted',
		'transport',
		'local-blocked',
		'remote-blocked'
	]);
	for (const failLocal of [false, true]) {
		let fetches = 0;
		const hooks = createNarrationPersistenceHooks(
			{
				beforeRequest: async () => {
					if (failLocal) throw new GoogleTTSError('STATE', 'Local write failed.');
				},
				markQuota: async () => {}
			},
			{
				beforeRequest: async () => {
					throw new Error('Remote token must not be logged: unit-test-secret');
				}
			}
		);
		const blocked = createGoogleClient({
			env,
			...hooks,
			fetchImpl: async () => {
				fetches++;
				return json({});
			}
		});
		await assert.rejects(
			() => blocked.listVoices(),
			(error) => error.code === 'STATE' && !error.message.includes('unit-test-secret')
		);
		assert.equal(fetches, 0);
		assert.equal(blocked.requests, 0);
	}
});

test('article and quota persistence failures are fail-closed state errors', async () => {
	const events = [];
	const hooks = createNarrationPersistenceHooks(
		{
			beforeRequest: async () => {},
			markQuota: async () => {
				events.push('local-quota');
			}
		},
		{
			onQuota: async () => {
				events.push('remote-quota');
				throw new Error('Remote state unavailable.');
			},
			onArticle: async () => {
				throw new Error('Remote publication unavailable.');
			}
		}
	);
	await assert.rejects(hooks.onQuota(), (error) => error.code === 'STATE');
	assert.deepEqual(events, ['local-quota', 'remote-quota']);
	await assert.rejects(
		hooks.onArticle({ slug: 'article', manifest: {} }),
		(error) => error.code === 'STATE'
	);
	await assert.rejects(() => runNarration(['--unknown-option']), /Unknown argument/);
});

test('segments preserve every Unicode character, paragraph and article ending', () => {
	const text = `Opening paragraph. A question?\n\n${'কলকাতা 🙂 '.repeat(450)}\n\n${'Unbroken'.repeat(250)} The very last sentence.`;
	const parts = segmentNarration(text);
	assert.equal(parts.map((part) => part.text).join(''), text);
	assert.equal(parts.at(-1).textEnd, text.length);
	for (let index = 0; index < parts.length; index += 1) {
		assert.ok(segmentWithinBounds(parts[index].text));
		assert.equal(parts[index].textStart, index ? parts[index - 1].textEnd : 0);
		assert.equal(parts[index].text, text.slice(parts[index].textStart, parts[index].textEnd));
		assert.equal(/[\uD800-\uDBFF]$/u.test(parts[index].text), false);
	}
});

test('larger segments bound UTF-16 characters, UTF-8 bytes and words without losing text', () => {
	for (const text of [
		'English narration with natural sentence endings. '.repeat(400).trim(),
		'কলকাতার আকাশ পরিষ্কার। 🙂 '.repeat(500).trim(),
		'a '.repeat(2000).trim(),
		'🙂'.repeat(4000),
		'x'.repeat(16_000)
	]) {
		const parts = segmentNarration(text);
		assert.equal(parts.map((part) => part.text).join(''), text);
		assert.ok(parts.every((part) => segmentWithinBounds(part.text)));
		assert.ok(parts.every((part) => !/[\uD800-\uDBFF]$/u.test(part.text)));
		assert.ok(parts.length <= segmentNarration(text, 1800).length);
	}
	const single = 'A clear, complete sentence. '.repeat(120).trim();
	assert.equal(segmentNarration(single).length, 1);
	assert.ok(segmentNarration(single, 1800).length > 1);
	for (const maximum of [15, 6001, 16.5]) assert.throws(() => segmentNarration(single, maximum));
});

test('fingerprints invalidate text, extraction version inputs, voice, style, model and format', async () => {
	const base = fingerprint('Article', config);
	for (const variant of [
		{ ...config, voice: 'another-voice' },
		{ ...config, model: 'gemini-3.8-flash-lite-tts' },
		{ ...config, style: 'New style' },
		{ ...config, format: 'audio/l16' },
		{ ...config, sampleRate: 16_000 }
	])
		assert.notEqual(fingerprint('Article', variant), base);
	assert.notEqual(fingerprint('Changed Article', config), base);
	assert.equal(await hashNarration('কলকাতা 🙂'), digest('কলকাতা 🙂'));
});

test('voice selection prefers a stable natural narrator and verifies configured catalogue ID', () => {
	const voices = [
		{ id: 'robot', description: 'Robotic character whisper' },
		{ id: 'warm', description: 'Warm clear natural narrator' },
		{ id: 'bright', description: 'Bright' }
	];
	assert.equal(chooseVoice(voices).id, 'warm');
	assert.equal(chooseVoice(voices, 'bright').id, 'bright');
	assert.throws(() => chooseVoice(voices, 'not-in-catalogue'), /absent/);
});

test('voice catalogue verifies US metadata without exact accent or context overfiltering', async () => {
	let observed;
	const client = createGoogleClient({
		env,
		fetchImpl: async (url, options) => {
			observed = { url, options };
			return json({
				voices: [
					{ id: 'us', language_code: 'en-US', accent: 'American' },
					{
						id: 'achernar',
						language_code: 'en-US',
						accent: 'General American',
						region_code: 'US',
						context: 'Content & Media'
					},
					{ id: 'uk', language_code: 'en-GB', accent: 'British' },
					{ id: 'india', language_code: 'en-US', accent: 'Indian' },
					{ id: 'wrong-region', language_code: 'en-US', accent: 'American', region_code: 'GB' },
					{ id: 'unknown-accent', language_code: 'en-US', region_code: 'US' },
					null
				]
			});
		}
	});
	assert.deepEqual(
		(await client.listVoices()).map((voice) => voice.id),
		['us', 'achernar']
	);
	assert.equal(observed.url.searchParams.get('language_code'), 'en-US');
	assert.equal(observed.url.searchParams.get('region_code'), 'US');
	assert.equal(observed.url.searchParams.has('accent'), false);
	assert.equal(observed.url.searchParams.has('context'), false);
	assert.equal(observed.url.searchParams.get('type'), 'prebuilt');
	assert.equal(observed.url.searchParams.get('page_size'), '1000');
	assert.equal(observed.options.headers['x-goog-api-key'], env.GEMINI_API_KEY);
	assert.equal(observed.url.href.includes(env.GEMINI_API_KEY), false);
});

test('voice catalogue permits omitted empty voices while preserving pagination and regional checks', async () => {
	const requests = [];
	const client = createGoogleClient({
		env,
		maxRequests: 2,
		fetchImpl: async (url) => {
			requests.push(url);
			return requests.length === 1
				? json({ next_page_token: 'next-page' })
				: json({
						voices: [
							{
								id: 'achernar',
								language_code: 'en-US',
								accent: 'General American',
								region_code: 'US'
							}
						]
					});
		}
	});
	assert.equal((await client.listVoices())[0].id, 'achernar');
	assert.equal(requests[1].searchParams.get('page_token'), 'next-page');
	assert.equal(client.requests, 2);
	for (const body of [{}, { voices: [] }]) {
		const empty = createGoogleClient({ env, fetchImpl: async () => json(body) });
		await assert.rejects(() => empty.listVoices(), /No catalogue voice.*American accent/);
	}
	for (const body of [{ voices: {} }, { voices: null }, []]) {
		const malformed = createGoogleClient({ env, fetchImpl: async () => json(body) });
		await assert.rejects(() => malformed.listVoices(), /no verifiable US English voice catalogue/);
	}
});

test('provider uses Interactions speech metadata with verbatim text and complete WAV', async () => {
	let observed;
	const audio = wav(0.5);
	const client = createGoogleClient({
		env,
		fetchImpl: async (url, options) => {
			observed = { url, options };
			return json(interaction(audio));
		}
	});
	const result = await client.synthesize('Read this exactly. বাংলা।', config);
	const body = JSON.parse(observed.options.body);
	assert.equal(observed.url.pathname, '/v1beta/interactions');
	assert.equal(body.input[0].content[0].text, 'Read this exactly. বাংলা।');
	assert.deepEqual(body.input[0].content[0].annotations, [
		{ type: 'speech_metadata', style: config.style }
	]);
	assert.equal(body.generation_config.speech_config[0].voice, config.voice);
	assert.equal(body.response_format.mime_type, 'audio/wav');
	assert.equal(body.store, false);
	assert.equal(result.duration, 0.5);
	assert.deepEqual(result.audio, audio);
});

test('provider rejects empty/malformed audio, unexpected formats and incomplete interactions', async () => {
	const cases = [
		{},
		interaction(wav(), { status: 'in_progress' }),
		interaction(wav(), { status: undefined }),
		interaction(wav(), { status: null }),
		interaction(wav(), { status: 'complete' }),
		interaction(wav(), { steps: [] }),
		interaction(wav(), {
			steps: [{ type: 'model_output', content: [{ type: 'audio', data: '!!!=' }] }]
		}),
		interaction(wav(), {
			steps: [
				{
					type: 'model_output',
					content: [{ type: 'audio', data: wav().toString('base64'), mime_type: 'audio/l16' }]
				}
			]
		}),
		interaction(wav().subarray(0, 100))
	];
	for (const body of cases) {
		const client = createGoogleClient({ env, fetchImpl: async () => json(body) });
		await assert.rejects(() => client.synthesize('Article.', config), GoogleTTSError);
	}
});

test('WAV parser rejects truncated containers, empty audio and wrong sample layouts', () => {
	assert.equal(inspectWav(wav(1)).duration, 1);
	assert.equal(inspectWav(wav(360)).duration, 360);
	assert.throws(() => inspectWav(Buffer.alloc(44)), /WAV/);
	assert.throws(() => inspectWav(wav(0)), /samples/);
	const wrongRate = wav();
	wrongRate.writeUInt32LE(16_000, 24);
	assert.throws(() => inspectWav(wrongRate), /24 kHz/);
	const invalidChunk = wav();
	invalidChunk.writeUInt32LE(0xffffffff, 40);
	assert.throws(() => inspectWav(invalidChunk), /truncated/);
});

test('provider rejects larger transcripts exceeding any segment bound before transport', async () => {
	const client = createGoogleClient({
		env,
		fetchImpl: async () => assert.fail('Oversized transcript must not reach Google')
	});
	for (const text of ['x'.repeat(6001), 'ক'.repeat(2500), 'a '.repeat(901)])
		await assert.rejects(client.synthesize(text, config), { code: 'INPUT' });
	assert.equal(client.requests, 0);
});

test('quota and request budget stop immediately without retries or paid fallback', async () => {
	let calls = 0;
	const quotaClient = createGoogleClient({
		env,
		fetchImpl: async () => {
			calls += 1;
			return json({ error: 'secret upstream message' }, 429);
		}
	});
	await assert.rejects(
		() => quotaClient.synthesize('Article.', config),
		(error) => error.code === 'QUOTA' && !error.message.includes('secret upstream')
	);
	assert.equal(calls, 1);
	const budgetClient = createGoogleClient({
		env,
		maxRequests: 1,
		fetchImpl: async () => {
			calls += 1;
			return json(interaction());
		}
	});
	await budgetClient.synthesize('One.', config);
	await assert.rejects(
		() => budgetClient.synthesize('Two.', config),
		(error) => error.code === 'BUDGET'
	);
	assert.equal(budgetClient.requests, 1);
});

test('voice catalogue calls count against the same generation budget', async () => {
	let calls = 0;
	const client = createGoogleClient({
		env,
		maxRequests: 1,
		fetchImpl: async () => {
			calls += 1;
			return json({ voices: [{ id: 'us', language_code: 'en-US', accent: 'American' }] });
		}
	});
	await client.listVoices();
	await assert.rejects(
		() => client.synthesize('Article.', config),
		(error) => error.code === 'BUDGET'
	);
	assert.equal(calls, 1);
});

test('malformed catalogue/interaction shapes and oversized streamed responses fail safely', async () => {
	for (const value of [null, [], { steps: {} }, { steps: [null] }]) {
		const client = createGoogleClient({ env, fetchImpl: async () => json(value) });
		await assert.rejects(() => client.synthesize('Article.', config), GoogleTTSError);
	}
	const malformed = createGoogleClient({ env, fetchImpl: async () => json(null) });
	await assert.rejects(() => malformed.listVoices(), GoogleTTSError);
	let cancelled = false;
	const oversized = createGoogleClient({
		env,
		fetchImpl: async () =>
			new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new Uint8Array(3 * 1024 * 1024));
					},
					cancel() {
						cancelled = true;
					}
				})
			)
	});
	await assert.rejects(() => oversized.listVoices(), /exceeded/);
	assert.equal(cancelled, true);
});

test('canonical sitemap inventory excludes drafts, future posts, missing sources and omitted aliases', async (t) => {
	const directory = await temporary(t);
	const postDirectory = path.join(directory, 'src/lib/posts');
	await fs.mkdir(postDirectory, { recursive: true });
	for (const [slug, date, published] of [
		['-published_slug', '2026-10-20', true],
		['game-article', '2026-10-20', true],
		['draft', '2026-10-20', false],
		['future', '2026-10-23', true],
		['invalid', 'not-a-date', true],
		['omitted-alias', '2026-10-20', true]
	]) {
		await fs.writeFile(
			path.join(postDirectory, `${slug}.md`),
			`---\ntitle: Test\ndate: '${date}'\npublished: ${published}\n---\nArticle.`
		);
	}
	const routes = [
		'/blog/personal/-published_slug',
		'/blog/games/game-article',
		'/blog/personal/draft',
		'/blog/personal/future',
		'/blog/personal/invalid',
		'/blog/games/missing-source',
		'/blog/archive/2026',
		'/about'
	];
	const server = http.createServer((_request, response) => {
		response.end(
			`<urlset>${routes.map((route) => `<url><loc>https://suvroghosh.in${route}</loc></url>`).join('')}</urlset>`
		);
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	t.after(() => new Promise((resolve) => server.close(resolve)));
	const origin = `http://127.0.0.1:${server.address().port}`;
	const inventory = await discoverArticles(origin, directory, new Date('2026-10-21T00:00:00Z'));
	assert.deepEqual(
		inventory.map((article) => article.slug),
		['-published_slug', 'game-article']
	);
	assert.equal(inventory.find((article) => article.slug === 'game-article').interactiveGame, true);
	assert.equal(
		inventory.find((article) => article.slug === '-published_slug').interactiveGame,
		false
	);
});

test('request deadline covers transport and errors never disclose keys', async () => {
	const client = createGoogleClient({
		env,
		timeoutMs: 10,
		fetchImpl: async (_url, { signal }) =>
			new Promise((_resolve, reject) =>
				signal.addEventListener('abort', () => reject(new Error(env.GEMINI_API_KEY)))
			)
	});
	await assert.rejects(
		() => client.synthesize('Article.', config),
		(error) => error.code === 'TIMEOUT' && !error.message.includes(env.GEMINI_API_KEY)
	);
	const failed = createGoogleClient({
		env,
		fetchImpl: async () => {
			throw new Error(env.GEMINI_API_KEY);
		}
	});
	await assert.rejects(
		() => failed.synthesize('Article.', config),
		(error) => error.code === 'NETWORK' && !error.message.includes(env.GEMINI_API_KEY)
	);
});

test('generation checkpoints each complete segment and resumes without republishing partial work', async (t) => {
	const directory = await temporary(t);
	const article = {
		slug: 'long-article',
		title: 'Long article',
		pathname: '/blog/personal/long-article',
		text:
			Array.from({ length: 350 }, (_, index) => `Sentence ${index} with a natural pause. `).join(
				''
			) + 'The ending.'
	};
	let calls = 0;
	const first = {
		synthesize: async () => {
			calls += 1;
			if (calls === 2) throw new GoogleTTSError('QUOTA', 'Quota exhausted');
			return { audio: wav() };
		}
	};
	await assert.rejects(
		() => generateArticle({ article, config, client: first, outputRoot: directory }),
		/Quota/
	);
	await assert.rejects(() => fs.readFile(path.join(directory, article.slug, 'manifest.json')), {
		code: 'ENOENT'
	});
	const generated = [];
	const second = {
		synthesize: async () => {
			generated.push(true);
			return { audio: wav() };
		}
	};
	const manifest = await generateArticle({
		article,
		config,
		client: second,
		outputRoot: directory
	});
	assert.equal(generated.length, segmentNarration(article.text).length - 1);
	assert.equal(manifest.segments.at(-1).textEnd, article.text.length);
	assert.equal(manifest.language, 'en-US');
	assert.equal(manifest.segmentation, SEGMENTATION_POLICY);
	assert.equal(await manifestIsReady(manifest, article, config, directory), true);
	assert.equal(
		await manifestIsReady(
			manifest,
			{ ...article, text: `${article.text} New revision.` },
			config,
			directory
		),
		false
	);
	assert.equal(
		await manifestIsReady(manifest, article, { ...config, voice: 'new-voice' }, directory),
		false
	);
	assert.equal(
		(await fs.readdir(path.join(directory, article.slug))).some((file) => file.endsWith('.tmp')),
		false
	);
});

test('generation waits for durable segment acknowledgement and stops after a failed checkpoint push', async (t) => {
	const outputRoot = await temporary(t);
	const article = {
		slug: 'durable-article',
		title: 'Durable article',
		pathname: '/blog/personal/durable-article',
		text: 'A complete paragraph with a natural pause. '.repeat(400)
	};
	assert(segmentNarration(article.text).length > 1);
	let calls = 0;
	let rejectCheckpoint;
	const checkpoint = new Promise((_resolve, reject) => {
		rejectCheckpoint = reject;
	});
	let entered;
	const checkpointStarted = new Promise((resolve) => {
		entered = resolve;
	});
	const hooks = createNarrationPersistenceHooks(
		{ beforeRequest: async () => {}, markQuota: async () => {} },
		{
			onSegment: async (event) => {
				assert.equal(event.slug, article.slug);
				assert.equal(event.reused, false);
				assert.equal(
					JSON.parse(
						await fs.readFile(path.join(outputRoot, article.slug, `${event.name}.json`), 'utf8')
					).audioHash,
					digest(wav())
				);
				entered();
				await checkpoint;
			}
		}
	);
	const generation = generateArticle({
		article,
		config,
		outputRoot,
		client: {
			synthesize: async () => {
				calls++;
				return { audio: wav() };
			}
		},
		onSegment: hooks.onSegment
	});
	await checkpointStarted;
	assert.equal(calls, 1);
	await assert.rejects(fs.readFile(path.join(outputRoot, article.slug, 'manifest.json')), {
		code: 'ENOENT'
	});
	rejectCheckpoint(new Error('Remote checkpoint push failed.'));
	await assert.rejects(generation, (error) => error.code === 'STATE');
	assert.equal(calls, 1, 'No second synthesis may begin after checkpoint persistence fails.');
});

test('complete delivered MP3s remain ready without provisioning private WAV sources', async (t) => {
	const { root, outputRoot, article, manifest } = await deliveryFixture(t);
	const privateRoot = getNarrationSourceRoot(root);
	assert.equal(await deliveredManifestIsReady(manifest, article, config, outputRoot), true);
	const selected = await selectNarrationArticles({
		articles: [article],
		sourceManifests: new Map(),
		deliveredManifests: new Map([[article.slug, manifest]]),
		options: { missing: true },
		outputRoot: privateRoot
	});
	assert.deepEqual(selected, []);
	await assert.rejects(fs.stat(privateRoot), { code: 'ENOENT' });
	assert.deepEqual(
		await selectNarrationArticles({
			articles: [article],
			sourceManifests: new Map(),
			deliveredManifests: new Map([[article.slug, manifest]]),
			options: { stale: true },
			outputRoot: privateRoot
		}),
		[article]
	);
	const oldEncoder = structuredClone(manifest);
	oldEncoder.delivery.encoderVersion = 'ffmpeg version 7.0-another-operating-system';
	assert.equal(await deliveredManifestIsReady(oldEncoder, article, config, outputRoot), true);
});

test('delivered readiness rejects stale generation identities, malformed metadata and corrupt MP3 bytes', async (t) => {
	const { outputRoot, directory, article, manifest } = await deliveryFixture(t);
	assert.equal(
		await deliveredManifestIsReady(
			manifest,
			{ ...article, text: article.text + ' Revised.' },
			config,
			outputRoot
		),
		false
	);
	for (const field of ['language', 'model', 'voice', 'style', 'format'])
		assert.equal(
			await deliveredManifestIsReady(
				manifest,
				article,
				{ ...config, [field]: 'changed' },
				outputRoot
			),
			false
		);
	for (const alter of [
		(copy) => {
			copy.segmentation = 'unknown';
		},
		(copy) => {
			copy.totalDuration += 1;
		},
		(copy) => {
			copy.articlePath = '/blog/personal/another';
		},
		(copy) => {
			copy.segments[0].textStart = 1;
		},
		(copy) => {
			copy.segments[0].src = 'https://other.example/narration.mp3';
		},
		(copy) => {
			copy.delivery.codec = 'other';
		},
		(copy) => {
			copy.delivery.encodedAt = 'invalid';
		},
		(copy) => {
			copy.delivery.segments[0].sourceFingerprint = '0'.repeat(64);
		},
		(copy) => {
			copy.delivery.segments[0].decodedDuration = -0.01;
		},
		(copy) => {
			copy.delivery.segments[0].sourceBytes = 44;
		},
		(copy) => {
			copy.delivery.segments[0].bytes += 1;
		}
	]) {
		const copy = structuredClone(manifest);
		alter(copy);
		assert.equal(await deliveredManifestIsReady(copy, article, config, outputRoot), false);
	}
	const file = path.join(directory, `${manifest.delivery.segments[0].audioHash}.mp3`);
	const corrupt = await fs.readFile(file);
	corrupt[20] ^= 1;
	await fs.writeFile(file, corrupt);
	assert.equal(await deliveredManifestIsReady(manifest, article, config, outputRoot), false);
	await fs.rm(file);
	assert.equal(await deliveredManifestIsReady(manifest, article, config, outputRoot), false);
});

test('delivered legacy boundaries and partial-source queue ordering survive independent runners', async (t) => {
	const { root, outputRoot, article, manifest } = await deliveryFixture(t, {
		text: 'A complete paragraph with a natural pause. '.repeat(240),
		segmentation: LEGACY_SEGMENTATION_POLICY
	});
	assert.equal(await deliveredManifestIsReady(manifest, article, config, outputRoot), true);
	const old = structuredClone(manifest);
	delete old.segmentation;
	assert.equal(await deliveredManifestIsReady(old, article, config, outputRoot), true);
	const privateRoot = getNarrationSourceRoot(root);
	const articles = [
		'newest',
		'private-complete',
		'delivered-article',
		'older-partial',
		'oldest'
	].map((slug) => ({ ...article, slug }));
	const partialDirectory = path.join(privateRoot, 'older-partial');
	await fs.mkdir(partialDirectory, { recursive: true });
	const name = fingerprint('Durable partial.', config);
	await fs.writeFile(path.join(partialDirectory, `${name}.wav`), wav());
	await fs.writeFile(
		path.join(partialDirectory, `${name}.json`),
		JSON.stringify(inspectWav(wav()))
	);
	const sourceManifests = new Map([['private-complete', {}]]);
	const deliveredManifests = new Map([[article.slug, manifest]]);
	const selected = await selectNarrationArticles({
		articles,
		sourceManifests,
		deliveredManifests,
		options: { missing: true },
		outputRoot: privateRoot
	});
	assert.deepEqual(
		selected.map((item) => item.slug),
		['older-partial', 'newest', 'oldest']
	);
	const stale = await selectNarrationArticles({
		articles,
		sourceManifests,
		deliveredManifests,
		options: { stale: true },
		outputRoot: privateRoot
	});
	assert.deepEqual(
		stale.map((item) => item.slug),
		['private-complete', 'delivered-article']
	);
	await assert.rejects(
		() =>
			selectNarrationArticles({
				articles: [{ slug: '../escape' }],
				sourceManifests,
				deliveredManifests,
				options: { missing: true },
				outputRoot: privateRoot
			}),
		/slug/
	);
});

test('private source discovery and reuse preserve compressed delivery without Google requests', async (t) => {
	const root = await temporary(t);
	const article = {
		slug: 'delivered-article',
		title: 'Delivered article',
		pathname: '/blog/personal/delivered-article',
		text: 'A complete article with natural sentence emphasis.'
	};
	const outputRoot = getNarrationSourceRoot(root);
	const source = await generateArticle({
		article,
		config,
		client: { synthesize: async () => ({ audio: wav() }) },
		outputRoot
	});
	const publicDirectory = path.join(root, 'static/audio/articles', article.slug);
	await fs.mkdir(publicDirectory, { recursive: true });
	const delivered = {
		...source,
		format: 'audio/mpeg',
		segments: source.segments.map((segment) => ({
			...segment,
			src: segment.src.replace(/\.wav$/u, '.mp3')
		}))
	};
	const deliveryPath = path.join(publicDirectory, 'manifest.json');
	const deliveryBytes = JSON.stringify(delivered);
	await fs.writeFile(deliveryPath, deliveryBytes);
	// Public delivery alone must never be interpreted as a validated generation source.
	const deliveryOnly = { ...article, slug: 'delivery-only' };
	const deliveryOnlyDirectory = path.join(root, 'static/audio/articles', deliveryOnly.slug);
	await fs.mkdir(deliveryOnlyDirectory, { recursive: true });
	await fs.writeFile(path.join(deliveryOnlyDirectory, 'manifest.json'), deliveryBytes);
	const discovered = await readNarrationSourceManifests([article, deliveryOnly], root);
	assert.deepEqual(discovered.get(article.slug), source);
	assert.equal(discovered.get(deliveryOnly.slug), null);
	assert.equal(
		await manifestIsReady(discovered.get(article.slug), article, config, outputRoot),
		true
	);
	await generateArticle({
		article,
		config,
		client: { synthesize: async () => assert.fail('Validated source must not synthesize again') },
		outputRoot
	});
	assert.equal(await fs.readFile(deliveryPath, 'utf8'), deliveryBytes);
	assert.deepEqual(await fs.readdir(publicDirectory), ['manifest.json']);
	assert.ok(
		(await fs.readdir(path.join(outputRoot, article.slug))).some((file) => file.endsWith('.wav'))
	);
});

test('legacy checkpoint resumes legacy boundaries and old complete manifests remain current', async (t) => {
	const directory = await temporary(t);
	const article = {
		slug: 'legacy-article',
		title: 'Legacy article',
		pathname: '/blog/personal/legacy-article',
		text: Array.from(
			{ length: 240 },
			(_, index) => `Paragraph ${index} with a calm natural pause. `
		)
			.join('')
			.trim()
	};
	const legacy = segmentNarration(article.text, 1800);
	const firstName = fingerprint(legacy[0].text, config);
	const articleDirectory = path.join(directory, article.slug);
	await fs.mkdir(articleDirectory);
	const audio = wav();
	await fs.writeFile(path.join(articleDirectory, `${firstName}.wav`), audio);
	await fs.writeFile(
		path.join(articleDirectory, `${firstName}.json`),
		JSON.stringify(inspectWav(audio))
	);
	let calls = 0;
	const client = {
		synthesize: async () => {
			calls += 1;
			return { audio: wav() };
		}
	};
	const manifest = await generateArticle({ article, config, client, outputRoot: directory });
	assert.equal(manifest.segmentation, LEGACY_SEGMENTATION_POLICY);
	assert.equal(calls, legacy.length - 1);
	assert.equal(manifest.segments.length, legacy.length);
	assert.equal(await manifestIsReady(manifest, article, config, directory), true);
	const oldManifest = { ...manifest };
	delete oldManifest.segmentation;
	assert.equal(await manifestIsReady(oldManifest, article, config, directory), true);
	for (const segmentation of ['unknown', null, 0])
		assert.equal(
			await manifestIsReady({ ...manifest, segmentation }, article, config, directory),
			false
		);
	assert.equal(
		await manifestIsReady(
			{ ...manifest, segmentation: SEGMENTATION_POLICY },
			article,
			config,
			directory
		),
		false
	);
});

test('corrupted cached audio is regenerated and cannot satisfy a ready manifest', async (t) => {
	const directory = await temporary(t);
	const article = {
		slug: 'short-article',
		title: 'Short',
		pathname: '/blog/personal/short-article',
		text: 'A complete paragraph.'
	};
	let calls = 0;
	const client = {
		synthesize: async () => {
			calls += 1;
			return { audio: wav() };
		}
	};
	const manifest = await generateArticle({ article, config, client, outputRoot: directory });
	for (const segment of [null, false, 1, 'invalid', []])
		assert.equal(
			await manifestIsReady({ ...manifest, segments: [segment] }, article, config, directory),
			false
		);
	for (const field of ['language', 'model', 'voice', 'style', 'format'])
		assert.equal(
			await manifestIsReady({ ...manifest, [field]: 'corrupted' }, article, config, directory),
			false
		);
	await generateArticle({ article, config, client, outputRoot: directory });
	assert.equal(calls, 1);
	const file = path.join(directory, article.slug, `${fingerprint(article.text, config)}.wav`);
	const corrupt = wav();
	corrupt[50] = 1;
	await fs.writeFile(file, corrupt);
	assert.equal(await manifestIsReady(manifest, article, config, directory), false);
	await generateArticle({ article, config, client, outputRoot: directory });
	assert.equal(calls, 2);
});

test('generation locking preserves fresh empty/partial owner metadata and live owners', async (t) => {
	const directory = await temporary(t);
	const root = 'isolated-lock-fixture';
	const lockFile = path.join(directory, `article-narration-${digest(root).slice(0, 20)}.lock`);
	for (const partial of ['', '{"pid":']) {
		await fs.writeFile(lockFile, partial);
		await assert.rejects(() => lockGeneration(root, { lockDirectory: directory }), /initializing/);
		assert.equal(await fs.readFile(lockFile, 'utf8'), partial);
	}
	const old = new Date(Date.now() - 120_000);
	await fs.utimes(lockFile, old, old);
	const release = await lockGeneration(root, { lockDirectory: directory });
	assert.equal(JSON.parse(await fs.readFile(lockFile, 'utf8')).pid, process.pid);
	await assert.rejects(
		() => lockGeneration(root, { lockDirectory: directory }),
		/Another narration command is running/
	);
	const probe = t.mock.method(process, 'kill', () => {
		throw Object.assign(new Error('Cannot inspect this process'), { code: 'EPERM' });
	});
	await assert.rejects(
		() => lockGeneration(root, { lockDirectory: directory }),
		/Cannot verify the existing narration lock owner/
	);
	probe.mock.restore();
	assert.equal(JSON.parse(await fs.readFile(lockFile, 'utf8')).pid, process.pid);
	await release();
	await assert.rejects(() => fs.stat(lockFile), { code: 'ENOENT' });
});

test('concurrent stale-lock recovery allows exactly one owner without deleting its new lock', async (t) => {
	const directory = await temporary(t);
	const root = 'concurrent-stale-lock-fixture';
	const lockFile = path.join(directory, `article-narration-${digest(root).slice(0, 20)}.lock`);
	await fs.writeFile(lockFile, JSON.stringify({ pid: 2_147_483_647 }));
	const attempts = await Promise.allSettled([
		lockGeneration(root, { lockDirectory: directory }),
		lockGeneration(root, { lockDirectory: directory })
	]);
	const successful = attempts.filter((attempt) => attempt.status === 'fulfilled');
	assert.equal(successful.length, 1);
	assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1);
	assert.equal(JSON.parse(await fs.readFile(lockFile, 'utf8')).pid, process.pid);
	await successful[0].value();
	await assert.rejects(() => fs.stat(lockFile), { code: 'ENOENT' });
	// A crash during recovery is fail-closed and needs explicit manual inspection.
	await fs.writeFile(lockFile, JSON.stringify({ pid: 2_147_483_647 }));
	await fs.writeFile(`${lockFile}.recovery`, '');
	await assert.rejects(
		() => lockGeneration(root, { lockDirectory: directory }),
		/inspect and remove this recovery marker manually/
	);
	assert.equal(JSON.parse(await fs.readFile(lockFile, 'utf8')).pid, 2_147_483_647);
});
