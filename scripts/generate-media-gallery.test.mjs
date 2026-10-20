import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
	appendFile,
	copyFile,
	mkdtemp,
	mkdir,
	readFile,
	realpath,
	rm,
	stat,
	unlink,
	utimes,
	writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { test } from 'node:test';

const fixturePrefix = 'suvro-media-gallery-test-';
const generator = resolve(import.meta.dirname, 'generate-media-gallery.mjs');

async function fixture(t) {
	const directory = await mkdtemp(join(tmpdir(), fixturePrefix));
	t.after(async () => {
		const target = await realpath(directory);
		const temporaryRoot = await realpath(tmpdir());
		assert.ok(isAbsolute(target));
		assert.equal(dirname(target), temporaryRoot);
		assert.ok(basename(target).startsWith(fixturePrefix));
		await rm(target, { recursive: true, force: true });
	});
	const script = join(directory, 'scripts', 'generate-media-gallery.mjs');
	const manifest = join(directory, 'scripts', 'image-optimization-manifest.json');
	const image = join(directory, 'static', 'images', 'fixture.png');
	const outputs = [
		join(directory, 'src', 'lib', 'generated', 'media-gallery.ts'),
		join(directory, 'src', 'lib', 'server', 'generated', 'image-dimensions.js')
	];
	await mkdir(dirname(script), { recursive: true });
	for (const name of ['images', 'photos', 'thumbnail']) {
		await mkdir(join(directory, 'static', name), { recursive: true });
	}
	await copyFile(generator, script);
	// This generator reads dimensions from the manifest and size from stat; it
	// never decodes image pixels. Arbitrary fixture bytes keep the test isolated.
	await writeFile(image, 'fixture image bytes');
	await writeFile(
		manifest,
		JSON.stringify({ files: { 'static/images/fixture.png': { width: 640, height: 480 } } })
	);
	const run = (environment = {}) =>
		execFileSync(process.execPath, [script], {
			cwd: directory,
			encoding: 'utf8',
			stdio: 'pipe',
			env: {
				...process.env,
				VERCEL: '0',
				IMAGE_OPTIMIZE_VERIFY_ONLY: '0',
				...environment
			}
		});
	run();
	return { directory, image, manifest, outputs, run };
}

async function outputSnapshots(paths) {
	return Promise.all(
		paths.map(async (path) => ({
			path,
			bytes: await readFile(path),
			mtime: (await stat(path, { bigint: true })).mtimeNs
		}))
	);
}

async function assertUnchanged(snapshots) {
	for (const { path, bytes, mtime } of snapshots) {
		assert.deepEqual(await readFile(path), bytes);
		assert.equal((await stat(path, { bigint: true })).mtimeNs, mtime);
	}
}

function assertVerificationFailure(run, label) {
	assert.throws(
		() => run({ IMAGE_OPTIMIZE_VERIFY_ONLY: '1' }),
		(error) => {
			assert.equal(error.status, 1);
			assert.match(error.stderr, new RegExp(`${label} is missing or stale`));
			return true;
		}
	);
}

for (const flag of ['IMAGE_OPTIMIZE_VERIFY_ONLY', 'VERCEL']) {
	test(`${flag} accepts CRLF outputs without rewriting bytes or modification times`, async (t) => {
		const f = await fixture(t);
		const original = await readFile(f.outputs[0], 'utf8');
		assert.match(original, /"width": 640/);
		assert.match(original, /"height": 480/);
		assert.match(original, /"bytes": 19/);
		for (const path of f.outputs) {
			const contents = await readFile(path, 'utf8');
			assert.ok(contents.includes('\n'));
			assert.ok(!contents.includes('\r\n'));
			await writeFile(path, contents.replaceAll('\n', '\r\n'));
			await utimes(path, new Date('2020-01-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z'));
		}
		const before = await outputSnapshots(f.outputs);
		assert.match(f.run({ [flag]: '1' }), /Verified media gallery/);
		await assertUnchanged(before);
		// Ordinary generation must also leave equivalent Windows checkouts intact.
		assert.match(f.run(), /Verified server image dimensions/);
		await assertUnchanged(before);
	});
}

test('changed manifest dimensions fail verification without overwriting either output', async (t) => {
	const f = await fixture(t);
	const before = await outputSnapshots(f.outputs);
	const manifest = JSON.parse(await readFile(f.manifest, 'utf8'));
	manifest.files['static/images/fixture.png'].width = 641;
	await writeFile(f.manifest, JSON.stringify(manifest));
	assertVerificationFailure(f.run, 'Media gallery');
	await assertUnchanged(before);
});

test('changed image sizes fail verification without overwriting either output', async (t) => {
	const f = await fixture(t);
	const before = await outputSnapshots(f.outputs);
	await appendFile(f.image, 'changed');
	assertVerificationFailure(f.run, 'Media gallery');
	await assertUnchanged(before);
});

test('a stale dimensions map fails even when the gallery is current', async (t) => {
	const f = await fixture(t);
	const dimensions = await readFile(f.outputs[1], 'utf8');
	await writeFile(f.outputs[1], dimensions.replace('[640,480]', '[641,480]'));
	const before = await outputSnapshots(f.outputs);
	assertVerificationFailure(f.run, 'Image dimensions map');
	await assertUnchanged(before);
});

for (const [index, label] of [
	[0, 'Media gallery'],
	[1, 'Image dimensions map']
]) {
	test(`missing ${label} fails verification without recreating it`, async (t) => {
		const f = await fixture(t);
		await unlink(f.outputs[index]);
		const before = await outputSnapshots(f.outputs.filter((_, position) => position !== index));
		assertVerificationFailure(f.run, label);
		await assert.rejects(readFile(f.outputs[index]), { code: 'ENOENT' });
		await assertUnchanged(before);
	});
}

test('content whitespace differences remain significant during verification', async (t) => {
	const f = await fixture(t);
	const gallery = await readFile(f.outputs[0], 'utf8');
	await writeFile(f.outputs[0], gallery.replace('export const', 'export  const'));
	const before = await outputSnapshots(f.outputs);
	assertVerificationFailure(f.run, 'Media gallery');
	await assertUnchanged(before);
});
