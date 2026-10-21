import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { atomicWrite, getNarrationSourceRoot, lockGeneration } from './article-narration.mjs';
import { digest, inspectWav } from './lib/google-tts.mjs';
import { SEGMENTATION_POLICY, LEGACY_SEGMENTATION_POLICY } from './lib/narration-segments.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = /^[a-z0-9_-]{1,200}$/i;
const HASH = /^[a-f0-9]{64}$/;
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
const MAX_MP3_BYTES = 10 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
export const DELIVERY_SETTINGS = Object.freeze({
	version: 1,
	format: 'audio/mpeg',
	codec: 'mp3',
	bitrate: 64_000,
	sampleRate: 24_000,
	channels: 1
});
const HELP = `Compress validated local narration sources without calling Google.

  node scripts/compress-narration.mjs --slug ARTICLE_SLUG [--slug ANOTHER_SLUG]
  node scripts/compress-narration.mjs --all

Reads complete WAV manifests and checkpoints from .codex-artifacts/narration-sources.
Writes content-hashed 64 kbps mono MP3 files and complete manifests to static/audio/articles.
Uses private FFMPEG_PATH, or ffmpeg from PATH. This command does not load .env.local,
read Gemini credentials, spend TTS quota, upload files, or deploy the site.`;

function isArticleSlug(value) {
	return typeof value === 'string' && SLUG.test(value) && value.toLowerCase() !== '_audition';
}

export function parseArgs(argv) {
	const options = { slugs: [], all: false, help: false };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === '--all') options.all = true;
		else if (argument === '--help') options.help = true;
		else if (argument === '--slug') {
			const value = argv[++index];
			if (!isArticleSlug(value) || value.startsWith('--'))
				throw new Error('Invalid narration article slug.');
			options.slugs.push(value);
		} else throw new Error(`Unknown compression argument: ${argument}`);
	}
	if (!options.help && options.all === Boolean(options.slugs.length))
		throw new Error('Choose --all or one or more --slug values.');
	options.slugs = [...new Set(options.slugs)];
	return options;
}

async function readBounded(file, maximum) {
	const handle = await fs.open(file, 'r');
	try {
		const stat = await handle.stat();
		if (!stat.isFile() || stat.size < 1 || stat.size > maximum)
			throw new Error('Narration file is empty, oversized, or not a regular file.');
		// Read at most maximum + 1 bytes even if a local file grows after stat.
		const bytes = Buffer.alloc(stat.size + 1);
		const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
		if (bytesRead !== stat.size) throw new Error('Narration file changed while being read.');
		return bytes.subarray(0, bytesRead);
	} finally {
		await handle.close();
	}
}

async function readJson(file, maximum = MAX_MANIFEST_BYTES) {
	return JSON.parse((await readBounded(file, maximum)).toString('utf8'));
}

function record(value) {
	return value && typeof value === 'object' && !Array.isArray(value);
}

function closeDuration(left, right, tolerance = 0.000_01) {
	return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

async function confinedDirectory(base, slug, { create = false } = {}) {
	if (!isArticleSlug(slug)) throw new Error('Invalid narration article slug.');
	const directory = path.join(base, slug);
	if (create) await fs.mkdir(directory, { recursive: true });
	const [realBase, realDirectory] = await Promise.all([fs.realpath(base), fs.realpath(directory)]);
	if (path.dirname(realDirectory) !== realBase)
		throw new Error('Narration directory must remain inside its source or delivery root.');
	return directory;
}

/** Verify every persisted source before publishing any delivery manifest. */
export async function readSourceArticle({ slug, sourceRoot }) {
	if (!isArticleSlug(slug)) throw new Error('Invalid narration article slug.');
	const directory = await confinedDirectory(sourceRoot, slug);
	const manifest = await readJson(path.join(directory, 'manifest.json'));
	if (
		!record(manifest) ||
		manifest.version !== 1 ||
		!HASH.test(manifest.textHash ?? '') ||
		!HASH.test(manifest.fingerprint ?? '') ||
		manifest.format !== 'audio/wav' ||
		manifest.language !== 'en-US' ||
		!['model', 'voice', 'style', 'title', 'generatedAt'].every(
			(field) => typeof manifest[field] === 'string' && manifest[field].length > 0
		) ||
		!Number.isFinite(Date.parse(manifest.generatedAt)) ||
		typeof manifest.articlePath !== 'string' ||
		!new RegExp(`^/blog/[A-Za-z0-9_-]+/${slug}$`).test(manifest.articlePath) ||
		(manifest.segmentation !== undefined &&
			![SEGMENTATION_POLICY, LEGACY_SEGMENTATION_POLICY].includes(manifest.segmentation)) ||
		!Array.isArray(manifest.segments) ||
		!manifest.segments.length ||
		manifest.segments.length > 1000
	)
		throw new Error(`Invalid complete WAV source manifest for ${slug}.`);
	const sources = [];
	let end = 0;
	for (const segment of manifest.segments) {
		const match =
			typeof segment?.src === 'string' &&
			segment.src.match(new RegExp(`^/audio/articles/${slug}/([a-f0-9]{64})\\.wav$`));
		if (
			!record(segment) ||
			!match ||
			!Number.isInteger(segment.textStart) ||
			!Number.isInteger(segment.textEnd) ||
			segment.textStart !== end ||
			segment.textEnd <= end ||
			segment.textEnd - end > 6000 ||
			!Number.isFinite(segment.duration) ||
			segment.duration <= 0 ||
			segment.duration > 600
		)
			throw new Error(`Invalid WAV segment or transcript offsets for ${slug}.`);
		const sourceFingerprint = match[1];
		const file = path.join(directory, `${sourceFingerprint}.wav`);
		if ((await fs.lstat(file)).isSymbolicLink())
			throw new Error('Narration WAV source must not be a symbolic link.');
		const [audio, checkpoint] = await Promise.all([
			readBounded(file, MAX_AUDIO_BYTES),
			readJson(path.join(directory, `${sourceFingerprint}.json`), 4096)
		]);
		const info = inspectWav(audio);
		if (
			!record(checkpoint) ||
			checkpoint.audioHash !== info.audioHash ||
			checkpoint.bytes !== info.bytes ||
			!closeDuration(checkpoint.duration, info.duration) ||
			!closeDuration(segment.duration, info.duration)
		)
			throw new Error(`WAV checksum, length, or duration mismatch for ${slug}.`);
		sources.push({ file, sourceFingerprint, ...info });
		end = segment.textEnd;
	}
	if (
		!closeDuration(
			manifest.totalDuration,
			sources.reduce((sum, source) => sum + source.duration, 0)
		)
	)
		throw new Error(`Total WAV duration does not match the complete manifest for ${slug}.`);
	return { manifest, sources };
}

/** No shell, bounded pipes, and a deadline for every encoder/decoder invocation. */
export function runEncoderProcess(executable, args, { maximum = 4096, timeoutMs = 120_000 } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(executable, args, {
			shell: false,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		const output = [];
		let size = 0;
		let errors = 0;
		let failure;
		const fail = (message) => {
			failure ??= new Error(message);
			child.kill('SIGKILL');
		};
		const timer = setTimeout(() => fail('FFmpeg exceeded its 120-second deadline.'), timeoutMs);
		child.stdout.on('data', (chunk) => {
			size += chunk.length;
			if (size > maximum) fail('FFmpeg output exceeded its bounded size.');
			else output.push(chunk);
		});
		child.stderr.on('data', (chunk) => {
			errors += chunk.length;
			if (errors > 128 * 1024) fail('FFmpeg diagnostic output exceeded its bounded size.');
		});
		child.once('error', () => {
			failure ??= new Error(
				'Could not run FFmpeg. Set private FFMPEG_PATH or install ffmpeg on PATH.'
			);
		});
		child.once('close', (code) => {
			clearTimeout(timer);
			if (failure) reject(failure);
			else if (code !== 0)
				reject(new Error('FFmpeg did not complete audio processing successfully.'));
			else resolve(Buffer.concat(output));
		});
	});
}

export async function resolveFFmpegExecutable({ root = ROOT, env = process.env } = {}) {
	if (env.FFMPEG_PATH?.trim()) return env.FFMPEG_PATH.trim();
	const bundled = path.join(
		root,
		'.codex-artifacts',
		'narration-tools',
		'node_modules',
		'ffmpeg-static',
		process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
	);
	try {
		await fs.access(bundled);
		return bundled;
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
		return 'ffmpeg';
	}
}

export async function createFFmpegEncoder(executable) {
	executable ??= await resolveFFmpegExecutable();
	const versionText = (await runEncoderProcess(executable, ['-version'], { maximum: 64 * 1024 }))
		.toString('utf8')
		.split(/\r?\n/u)[0];
	if (!/^ffmpeg version \S+/u.test(versionText) || versionText.length > 1000)
		throw new Error('Could not verify the local FFmpeg encoder version.');
	return {
		version: versionText,
		async encode({ input, output }) {
			await runEncoderProcess(executable, [
				'-nostdin',
				'-hide_banner',
				'-loglevel',
				'error',
				'-y',
				'-i',
				input,
				'-map',
				'0:a:0',
				'-vn',
				'-map_metadata',
				'-1',
				'-ac',
				'1',
				'-ar',
				'24000',
				'-c:a',
				'libmp3lame',
				'-b:a',
				'64k',
				'-write_xing',
				'1',
				'-id3v2_version',
				'3',
				'-f',
				'mp3',
				output
			]);
		},
		async decode(file) {
			return runEncoderProcess(
				executable,
				[
					'-nostdin',
					'-hide_banner',
					'-loglevel',
					'error',
					'-xerror',
					'-err_detect',
					'explode',
					'-i',
					file,
					'-map',
					'0:a:0',
					'-vn',
					'-ac',
					'1',
					'-ar',
					'24000',
					'-f',
					's16le',
					'pipe:1'
				],
				{ maximum: MAX_AUDIO_BYTES }
			);
		}
	};
}

async function inspectMp3(file, encoder, duration) {
	const audio = await readBounded(file, MAX_MP3_BYTES);
	if (
		audio.length < 100 ||
		(audio.toString('ascii', 0, 3) !== 'ID3' && !(audio[0] === 255 && (audio[1] & 224) === 224))
	)
		throw new Error('Encoded narration is not a recognizable complete MP3.');
	const pcm = await encoder.decode(file);
	if (!Buffer.isBuffer(pcm) || !pcm.length || pcm.length > MAX_AUDIO_BYTES || pcm.length % 2)
		throw new Error('MP3 did not decode into bounded complete PCM samples.');
	const decodedDuration = pcm.length / 48_000;
	if (!closeDuration(decodedDuration, duration, 0.12))
		throw new Error('MP3 decoded duration differs from the validated WAV source.');
	return {
		audioHash: digest(audio),
		bytes: audio.length,
		decodedPCMHash: digest(pcm),
		decodedDuration
	};
}

function compatibleDelivery(delivery, encoder) {
	return (
		record(delivery) &&
		Object.entries(DELIVERY_SETTINGS).every(([key, value]) => delivery[key] === value) &&
		delivery.encoderVersion === encoder.version
	);
}

/** Caller must hold lockGeneration for a complete multi-article compression run. */
export async function compressArticle({
	slug,
	sourceRoot,
	outputRoot,
	encoder,
	now = () => new Date()
}) {
	const { manifest: sourceManifest, sources } = await readSourceArticle({ slug, sourceRoot });
	if (
		!encoder ||
		typeof encoder.version !== 'string' ||
		!encoder.version ||
		typeof encoder.encode !== 'function' ||
		typeof encoder.decode !== 'function'
	)
		throw new Error('A verified local encoder and decoder are required.');
	const directory = await confinedDirectory(outputRoot, slug, { create: true });
	let previous;
	try {
		previous = await readJson(path.join(directory, 'manifest.json'));
	} catch (error) {
		if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
	}
	const sameSource =
		previous?.fingerprint === sourceManifest.fingerprint &&
		previous?.textHash === sourceManifest.textHash;
	const reusable = sameSource && compatibleDelivery(previous?.delivery, encoder);
	const segments = [];
	const deliverySegments = [];
	let encoded = 0;
	for (let index = 0; index < sources.length; index += 1) {
		const source = sources[index];
		let info;
		let name;
		const old = reusable && previous.delivery.segments?.[index];
		const oldSegment = reusable && previous.segments?.[index];
		if (
			old?.sourceFingerprint === source.sourceFingerprint &&
			old.sourceAudioHash === source.audioHash &&
			old.sourceBytes === source.bytes &&
			HASH.test(old.audioHash ?? '') &&
			oldSegment?.src === `/audio/articles/${slug}/${old.audioHash}.mp3`
		) {
			try {
				const candidate = path.join(directory, `${old.audioHash}.mp3`);
				if ((await fs.lstat(candidate)).isSymbolicLink())
					throw new Error('MP3 delivery cannot be a symbolic link.');
				const verified = await inspectMp3(candidate, encoder, source.duration);
				if (
					['audioHash', 'bytes', 'decodedPCMHash', 'decodedDuration'].every(
						(key) => verified[key] === old[key]
					)
				) {
					info = verified;
					name = `${verified.audioHash}.mp3`;
				}
			} catch {
				// Corrupt or missing delivery assets are repaired from validated local WAV sources.
			}
		}
		if (!info) {
			const temporary = path.join(
				directory,
				`.encoding-${process.pid}-${Math.random().toString(16).slice(2)}.tmp`
			);
			try {
				await encoder.encode({ input: source.file, output: temporary });
				info = await inspectMp3(temporary, encoder, source.duration);
				name = `${info.audioHash}.mp3`;
				await atomicWrite(path.join(directory, name), await readBounded(temporary, MAX_MP3_BYTES));
				encoded += 1;
			} finally {
				await fs.rm(temporary, { force: true });
			}
		}
		segments.push({ ...sourceManifest.segments[index], src: `/audio/articles/${slug}/${name}` });
		deliverySegments.push({
			sourceFingerprint: source.sourceFingerprint,
			sourceAudioHash: source.audioHash,
			sourceBytes: source.bytes,
			...info
		});
	}
	const delivery = {
		...DELIVERY_SETTINGS,
		encoderVersion: encoder.version,
		encodedAt: reusable && encoded === 0 ? previous.delivery.encodedAt : now().toISOString(),
		segments: deliverySegments
	};
	const manifest = { ...sourceManifest, segments, delivery };
	const rendered = `${JSON.stringify(manifest, null, 2)}\n`;
	if (rendered !== `${JSON.stringify(previous, null, 2)}\n`)
		await atomicWrite(path.join(directory, 'manifest.json'), rendered);
	return {
		slug,
		manifest,
		encoded,
		reused: sources.length - encoded,
		sourceBytes: sources.reduce((sum, source) => sum + source.bytes, 0),
		deliveryBytes: deliverySegments.reduce((sum, segment) => sum + segment.bytes, 0)
	};
}

export async function compressComplete({ root = ROOT, slugs = [], all = false, encoder } = {}) {
	const release = await lockGeneration(root);
	try {
		const sourceRoot = getNarrationSourceRoot(root);
		const outputRoot = path.join(root, 'static', 'audio', 'articles');
		if (all) {
			slugs = [];
			for (const entry of await fs.readdir(sourceRoot, { withFileTypes: true })) {
				if (!entry.isDirectory() || !isArticleSlug(entry.name)) continue;
				try {
					await fs.access(path.join(sourceRoot, entry.name, 'manifest.json'));
					slugs.push(entry.name);
				} catch (error) {
					if (error.code !== 'ENOENT') throw error;
				}
			}
			slugs.sort();
		}
		const localEncoder = encoder ?? (await createFFmpegEncoder());
		const results = [];
		for (const slug of slugs)
			results.push(await compressArticle({ slug, sourceRoot, outputRoot, encoder: localEncoder }));
		return results;
	} finally {
		await release();
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(HELP);
		return;
	}
	const results = await compressComplete(options);
	for (const result of results)
		console.log(
			`${result.slug}: ${result.encoded} encoded, ${result.reused} reused; ${result.sourceBytes} WAV bytes → ${result.deliveryBytes} MP3 bytes.`
		);
	console.log(
		`${results.length} complete article manifest(s) published locally. No Google requests or uploads made.`
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
