import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
	compressArticle,
	compressComplete,
	DELIVERY_SETTINGS,
	parseArgs,
	readSourceArticle,
	resolveFFmpegExecutable,
	runEncoderProcess
} from './compress-narration.mjs';
import { generateArticle, getNarrationSourceRoot, lockGeneration } from './article-narration.mjs';
import { digest, googleConfig } from './lib/google-tts.mjs';

function wav(seconds = 0.1) {
	const output = Buffer.alloc(44 + Math.round(24_000 * seconds) * 2);
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
	output.writeUInt32LE(output.length - 44, 40);
	return output;
}

function fakeEncoder() {
	const decodings = new Map();
	return {
		version: 'ffmpeg version fixture-1',
		calls: 0,
		async encode({ input, output }) {
			this.calls += 1;
			const source = await fs.readFile(input);
			const mp3 = Buffer.from(`ID3${digest(source)}${'m'.repeat(150)}`);
			decodings.set(digest(mp3), source.subarray(44));
			await fs.writeFile(output, mp3);
		},
		async decode(file) {
			const decoded = decodings.get(digest(await fs.readFile(file)));
			if (!decoded) throw new Error('Invalid test MP3.');
			return decoded;
		}
	};
}

async function fixture(
	t,
	{ text = 'A complete editorial narration.', slug = 'example-article' } = {}
) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'narration-compression-test-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const sourceRoot = getNarrationSourceRoot(root);
	const outputRoot = path.join(root, 'static', 'audio', 'articles');
	const sourceManifest = await generateArticle({
		article: { slug, text, title: 'Example article', pathname: `/blog/personal-essay/${slug}` },
		config: googleConfig({}),
		client: { synthesize: async () => ({ audio: wav() }) },
		outputRoot: sourceRoot
	});
	const encoder = fakeEncoder();
	return { root, sourceRoot, outputRoot, sourceManifest, encoder, slug };
}

function sourceFile(f, extension = 'wav', index = 0) {
	const name = path.basename(f.sourceManifest.segments[index].src, '.wav');
	return path.join(f.sourceRoot, f.slug, `${name}.${extension}`);
}

async function outputManifest(f) {
	return JSON.parse(await fs.readFile(path.join(f.outputRoot, f.slug, 'manifest.json'), 'utf8'));
}

test('CLI accepts explicit articles or all complete sources and rejects traversal/ambiguous modes', () => {
	assert.deepEqual(parseArgs(['--slug', 'one', '--slug', 'two', '--slug', 'one']).slugs, [
		'one',
		'two'
	]);
	assert.equal(parseArgs(['--all']).all, true);
	assert.equal(parseArgs(['--help']).help, true);
	for (const args of [
		[],
		['--slug'],
		['--slug', '../secret'],
		['--slug', '_audition'],
		['--slug', '_AUDITION'],
		['--slug', '--all'],
		['--all', '--slug', 'one'],
		['--unknown']
	])
		assert.throws(() => parseArgs(args));
});

test('published mixed-case, leading-hyphen and leading-underscore slugs retain exact identity', async (t) => {
	for (const slug of [
		'the-AI-Alignment-and-Human-Learning-Calcutta',
		'-leading-hyphen',
		'_leading-underscore'
	]) {
		assert.deepEqual(parseArgs(['--slug', slug]).slugs, [slug]);
		const f = await fixture(t, { slug });
		f.sourceManifest.articlePath = `/blog/Personal-Essay/${slug}`;
		await fs.writeFile(
			path.join(f.sourceRoot, slug, 'manifest.json'),
			JSON.stringify(f.sourceManifest)
		);
		const result = await compressArticle(f);
		assert.equal(result.slug, slug);
		assert.equal(result.manifest.articlePath, `/blog/Personal-Essay/${slug}`);
		assert.ok(result.manifest.segments[0].src.startsWith(`/audio/articles/${slug}/`));
		assert.deepEqual(
			(await compressComplete({ root: f.root, all: true, encoder: f.encoder })).map(
				(article) => article.slug
			),
			[slug]
		);
	}
});

test('compression preserves source narration identity, PCM durations, offsets and metadata', async (t) => {
	const f = await fixture(t, { text: 'This is a paragraph. '.repeat(400) });
	const result = await compressArticle(f);
	assert.ok(result.encoded > 1);
	const manifest = await outputManifest(f);
	for (const [key, value] of Object.entries(f.sourceManifest)) {
		if (key !== 'segments') assert.deepEqual(manifest[key], value, key);
	}
	for (const [key, value] of Object.entries(DELIVERY_SETTINGS))
		assert.equal(manifest.delivery[key], value);
	assert.equal(manifest.voice, 'achird');
	assert.equal(manifest.format, 'audio/wav');
	assert.equal(manifest.delivery.encoderVersion, f.encoder.version);
	for (let index = 0; index < manifest.segments.length; index += 1) {
		const segment = manifest.segments[index];
		const metadata = manifest.delivery.segments[index];
		assert.equal(segment.duration, f.sourceManifest.segments[index].duration);
		assert.equal(segment.textStart, f.sourceManifest.segments[index].textStart);
		assert.equal(segment.textEnd, f.sourceManifest.segments[index].textEnd);
		assert.equal(segment.src, `/audio/articles/${f.slug}/${metadata.audioHash}.mp3`);
		assert.equal(
			metadata.sourceFingerprint,
			path.basename(f.sourceManifest.segments[index].src, '.wav')
		);
		const bytes = await fs.readFile(path.join(f.outputRoot, f.slug, path.basename(segment.src)));
		assert.equal(digest(bytes), metadata.audioHash);
		assert.equal(bytes.length, metadata.bytes);
	}
	assert.ok(result.deliveryBytes < result.sourceBytes);
	assert.deepEqual(
		JSON.parse(await fs.readFile(path.join(f.sourceRoot, f.slug, 'manifest.json'), 'utf8')),
		f.sourceManifest
	);
});

test('unchanged validated compression is idempotent and does not rewrite the ready manifest', async (t) => {
	const f = await fixture(t);
	await compressArticle(f);
	const file = path.join(f.outputRoot, f.slug, 'manifest.json');
	const before = await fs.readFile(file);
	const modified = (await fs.stat(file)).mtimeMs;
	const rerun = await compressArticle(f);
	assert.equal(f.encoder.calls, 1);
	assert.equal(rerun.encoded, 0);
	assert.equal(rerun.reused, 1);
	assert.deepEqual(await fs.readFile(file), before);
	assert.equal((await fs.stat(file)).mtimeMs, modified);
});

test('missing and corrupt compressed delivery files are repaired from unchanged local sources', async (t) => {
	const f = await fixture(t);
	const first = await compressArticle(f);
	const audio = path.join(f.outputRoot, f.slug, path.basename(first.manifest.segments[0].src));
	await fs.rm(audio);
	assert.equal((await compressArticle(f)).encoded, 1);
	await fs.writeFile(audio, Buffer.from(`ID3${'bad'.repeat(60)}`));
	assert.equal((await compressArticle(f)).encoded, 1);
	assert.equal(digest(await fs.readFile(audio)), first.manifest.delivery.segments[0].audioHash);
});

test('source checksum tampering and truncated WAVs cannot publish a delivery manifest', async (t) => {
	for (const truncate of [false, true]) {
		const f = await fixture(t);
		const source = await fs.readFile(sourceFile(f));
		if (truncate) await fs.writeFile(sourceFile(f), source.subarray(0, source.length - 2));
		else {
			source[source.length - 1] ^= 1;
			await fs.writeFile(sourceFile(f), source);
		}
		await assert.rejects(compressArticle(f), /checksum|WAV/u);
		await assert.rejects(fs.access(path.join(f.outputRoot, f.slug, 'manifest.json')), {
			code: 'ENOENT'
		});
		assert.equal(f.encoder.calls, 0);
	}
});

test('source checkpoint byte length and duration must agree with inspected PCM data', async (t) => {
	for (const field of ['bytes', 'duration', 'audioHash']) {
		const f = await fixture(t);
		const checkpoint = JSON.parse(await fs.readFile(sourceFile(f, 'json'), 'utf8'));
		checkpoint[field] = field === 'audioHash' ? '0'.repeat(64) : 123;
		await fs.writeFile(sourceFile(f, 'json'), JSON.stringify(checkpoint));
		await assert.rejects(compressArticle(f), /checksum, length, or duration/u);
	}
});

test('remote sources, traversal, noncontiguous offsets, unknown policy and incomplete metadata fail closed', async (t) => {
	const edits = [
		(m) => {
			m.segments[0].src = 'https://example.com/remote.wav';
		},
		(m) => {
			m.segments[0].src = `/audio/articles/${m.title}/../secret.wav`;
		},
		(m) => {
			m.segments[0].textStart = 3;
		},
		(m) => {
			m.segments[0].textEnd = 0;
		},
		(m) => {
			m.segmentation = 'unknown';
		},
		(m) => {
			m.totalDuration += 1;
		},
		(m) => {
			m.segments = [];
		},
		(m) => {
			m.segments = Array.from({ length: 1001 }, () => ({ ...m.segments[0] }));
		},
		(m) => {
			delete m.textHash;
		},
		(m) => {
			m.articlePath = '/blog/personal-essay/other-article';
		}
	];
	for (const edit of edits) {
		const f = await fixture(t);
		edit(f.sourceManifest);
		await fs.writeFile(
			path.join(f.sourceRoot, f.slug, 'manifest.json'),
			JSON.stringify(f.sourceManifest)
		);
		await assert.rejects(compressArticle(f), /manifest|segment|duration/u);
		assert.equal(f.encoder.calls, 0);
	}
	await assert.rejects(readSourceArticle({ slug: '../escape', sourceRoot: os.tmpdir() }), /slug/u);
	for (const slug of ['_audition', '_AUDITION'])
		await assert.rejects(readSourceArticle({ slug, sourceRoot: os.tmpdir() }), /slug/u);
});

test('a short MP3 decode cannot publish partial or truncated speech', async (t) => {
	const f = await fixture(t);
	f.encoder.decode = async () => Buffer.alloc(48_000);
	await assert.rejects(compressArticle(f), /decoded duration/u);
	await assert.rejects(fs.access(path.join(f.outputRoot, f.slug, 'manifest.json')), {
		code: 'ENOENT'
	});
	assert.deepEqual(await fs.readdir(path.join(f.outputRoot, f.slug)), []);
});

test('failure after an encoded first segment never publishes an incomplete ready manifest', async (t) => {
	const f = await fixture(t, { text: 'First. '.repeat(1800) });
	const encode = f.encoder.encode.bind(f.encoder);
	f.encoder.encode = async (input) => {
		if (f.encoder.calls === 1) throw new Error('Encoder interrupted.');
		await encode(input);
	};
	await assert.rejects(compressArticle(f), /interrupted/u);
	const files = await fs.readdir(path.join(f.outputRoot, f.slug));
	assert.equal(files.length, 1);
	assert.match(files[0], /^[a-f0-9]{64}\.mp3$/u);
	assert.equal(files.includes('manifest.json'), false);
});

test('re-encoding validates changed encoder settings and repairs tampered delivery checksums', async (t) => {
	const f = await fixture(t);
	await compressArticle(f);
	f.encoder.version = 'ffmpeg version fixture-2';
	assert.equal((await compressArticle(f)).encoded, 1);
	const manifest = await outputManifest(f);
	manifest.delivery.segments[0].decodedPCMHash = '1'.repeat(64);
	await fs.writeFile(path.join(f.outputRoot, f.slug, 'manifest.json'), JSON.stringify(manifest));
	assert.equal((await compressArticle(f)).encoded, 1);
});

test('all-complete mode skips pending sources and auditions, makes no provider calls, and leaves quota untouched', async (t) => {
	const f = await fixture(t);
	await fs.mkdir(path.join(f.sourceRoot, 'pending-article'));
	await fs.mkdir(path.join(f.sourceRoot, '_audition'));
	await fs.writeFile(
		path.join(f.sourceRoot, '_audition', 'manifest.json'),
		'{invalid intentionally'
	);
	const quotaFile = path.join(f.root, '.codex-artifacts', 'narration-quota.json');
	const quota = '{"day":"2026-10-21","requests":10}';
	await fs.writeFile(quotaFile, quota);
	const originalFetch = globalThis.fetch;
	let calls = 0;
	globalThis.fetch = () => {
		calls += 1;
		throw new Error('Network calls forbidden in compression.');
	};
	t.after(() => {
		globalThis.fetch = originalFetch;
	});
	const results = await compressComplete({ root: f.root, all: true, encoder: f.encoder });
	assert.deepEqual(
		results.map((result) => result.slug),
		[f.slug]
	);
	assert.equal(calls, 0);
	assert.equal(await fs.readFile(quotaFile, 'utf8'), quota);
});

test('compression shares the generation lock and cannot race a provider batch', async (t) => {
	const f = await fixture(t);
	const release = await lockGeneration(f.root);
	try {
		await assert.rejects(
			compressComplete({ root: f.root, all: true, encoder: f.encoder }),
			/Another narration command/u
		);
	} finally {
		await release();
	}
	assert.equal((await compressComplete({ root: f.root, all: true, encoder: f.encoder })).length, 1);
});

test('encoder discovery honors private overrides, ignored local tools, and PATH fallback', async (t) => {
	const f = await fixture(t);
	assert.equal(
		await resolveFFmpegExecutable({
			root: f.root,
			env: { FFMPEG_PATH: ' C:/private tools/ffmpeg.exe ' }
		}),
		'C:/private tools/ffmpeg.exe'
	);
	assert.equal(await resolveFFmpegExecutable({ root: f.root, env: {} }), 'ffmpeg');
	const file = path.join(
		f.root,
		'.codex-artifacts',
		'narration-tools',
		'node_modules',
		'ffmpeg-static',
		process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
	);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, 'fixture');
	assert.equal(await resolveFFmpegExecutable({ root: f.root, env: {} }), file);
});

test('native encoder process bounds output, failures and time without requiring FFmpeg in CI', async () => {
	assert.equal(
		(await runEncoderProcess(process.execPath, ['-e', 'process.stdout.write("ok")'])).toString(),
		'ok'
	);
	await assert.rejects(
		runEncoderProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(5000))']),
		/bounded/u
	);
	await assert.rejects(
		runEncoderProcess(process.execPath, ['-e', 'process.exit(2)']),
		/successfully/u
	);
	await assert.rejects(
		runEncoderProcess(process.execPath, ['-e', 'setTimeout(()=>{},5000)'], { timeoutMs: 20 }),
		/deadline/u
	);
});
