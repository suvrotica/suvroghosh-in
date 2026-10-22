import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { atomicWrite } from '../article-narration.mjs';

export const NARRATION_REPOSITORY = 'suvrotica/suvroghosh-in';
export const NARRATION_STATE_BRANCH = 'codex/narration-state';
export const NARRATION_PROJECT = 'gen-lang-client-0296473115';
const RELEASE_TAG = 'narration-checkpoints';
const HASH = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const SLUG = /^[a-z0-9_-]{1,200}$/i;
const FILE = /^([a-z0-9_-]{1,200})\/(manifest\.json|[a-f0-9]{64}\.(?:wav|json))$/i;
const ASSET_NAME = /^narration-checkpoint-v1-[a-f0-9]{64}\.bin$/;
const MAX_RAW = 384 * 1024 * 1024;
const MAX_ARCHIVE = 512 * 1024 * 1024;
const MAX_JSON = 600 * 1024 * 1024;
const MAGIC = Buffer.from('NARRATION1');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => {
	if (!condition) throw new Error(message);
};
const integer = (value) => Number.isSafeInteger(value) && value >= 0;

function stateApiOperation(route, method, upload) {
	// Describe only known endpoint categories. Never log a URL, query, request
	// payload, response body, or upstream message from this credentialed client.
	const endpoint = route.slice(`/repos/${NARRATION_REPOSITORY}`.length).split('?', 1)[0];
	const categories = [
		[/^\/git\/ref\/heads\/codex\/narration-state$/, 'state reference read'],
		[/^\/contents\/state\.json$/, 'state metadata read'],
		[/^\/git\/commits\/[a-f0-9]{40}$/, 'state parent commit read'],
		[/^\/git\/trees$/, 'state tree creation'],
		[/^\/git\/commits$/, 'state commit creation'],
		[/^\/git\/refs\/heads\/codex\/narration-state$/, 'state reference update'],
		[/^\/git\/refs$/, 'state reference creation'],
		[/^\/releases\/tags\/narration-checkpoints$/, 'checkpoint release read'],
		[/^\/releases$/, 'checkpoint release creation'],
		[/^\/releases\/[0-9]+\/assets$/, upload ? 'checkpoint asset upload' : 'checkpoint asset list'],
		[/^\/releases\/assets\/[0-9]+$/, 'checkpoint asset deletion']
	];
	const category =
		categories.find(([pattern]) => pattern.test(endpoint))?.[1] ?? 'other state endpoint';
	const safeMethod = ['GET', 'POST', 'PATCH', 'DELETE'].includes(method) ? method : 'OTHER';
	return `${safeMethod} ${category}`;
}

export function validateHostedQuota(quota) {
	assert(
		quota?.version === 1 && /^\d{4}-\d{2}-\d{2}$/.test(quota.day ?? ''),
		'Missing or invalid hosted quota ledger.'
	);
	assert(integer(quota.used) && quota.used <= 10, 'Invalid hosted quota count.');
	assert(
		integer(quota.createdAt) && integer(quota.updatedAt) && quota.createdAt <= quota.updatedAt,
		'Invalid hosted quota timestamps.'
	);
	assert(
		quota.lastRequestAt === null ||
			(integer(quota.lastRequestAt) && quota.lastRequestAt <= quota.updatedAt),
		'Invalid hosted request timestamp.'
	);
	assert(integer(quota.blockedUntil), 'Invalid hosted quota block.');
	assert(
		new Date(`${quota.day}T00:00:00.000Z`).toISOString().slice(0, 10) === quota.day,
		'Invalid hosted quota date.'
	);
	assert(
		/^\d{4}-\d{2}-\d{2}$/.test(quota.initialUsage?.day ?? '') &&
			integer(quota.initialUsage?.used) &&
			quota.initialUsage.used <= 10,
		'Invalid initial hosted usage.'
	);
	return quota;
}

export function validateHostedState(state, { projectId, keyHash } = {}) {
	assert(
		state?.version === 1 && state.repository === NARRATION_REPOSITORY,
		'Unexpected narration state repository/version.'
	);
	assert(
		state.projectId === NARRATION_PROJECT && (!projectId || state.projectId === projectId),
		'Unexpected Gemini project in hosted state.'
	);
	assert(
		HASH.test(state.keyHash ?? '') && (!keyHash || state.keyHash === keyHash),
		'Gemini key does not match the verified project attestation.'
	);
	assert(
		state.hosting?.projectId === 'prj_IxNpapfOcZwq4zRwlK56DPCRwQnc' &&
			state.hosting?.teamId === 'team_PxbH7s87MnRH1xfa9cA6QIfp' &&
			state.hosting?.plan === 'hobby',
		'Unexpected free hosting configuration.'
	);
	validateHostedQuota(state.quota);
	if (state.checkpoint !== null) {
		const checkpoint = state.checkpoint;
		assert(
			integer(checkpoint?.assetId) &&
				checkpoint.assetId > 0 &&
				integer(checkpoint.releaseId) &&
				checkpoint.releaseId > 0 &&
				HASH.test(checkpoint.sha256 ?? '') &&
				ASSET_NAME.test(checkpoint.name ?? '') &&
				integer(checkpoint.bytes) &&
				checkpoint.bytes > 0 &&
				checkpoint.bytes <= MAX_ARCHIVE,
			'Invalid encrypted checkpoint pointer.'
		);
	}
	if (state.publication) {
		assert(
			SHA.test(state.publication.commit ?? '') &&
				Array.isArray(state.publication.slugs) &&
				state.publication.slugs.length <= 1000 &&
				state.publication.slugs.every(
					(slug) => SLUG.test(slug) && slug.toLowerCase() !== '_audition'
				) &&
				['pending', 'pushed', 'verified'].includes(state.publication.status),
			'Invalid narration publication receipt.'
		);
	}
	return state;
}

function encryptionKey(value) {
	assert(
		/^[a-f0-9]{64}$/i.test(value ?? ''),
		'NARRATION_STATE_KEY must contain 32 random bytes encoded as hex.'
	);
	return Buffer.from(value, 'hex');
}

function validateEntries(entries) {
	assert(Array.isArray(entries) && entries.length <= 20_000, 'Invalid checkpoint entries.');
	const seen = new Set();
	let total = 0;
	for (const entry of entries) {
		const match = FILE.exec(entry?.path ?? '');
		assert(
			match && match[1].toLowerCase() !== '_audition' && !seen.has(entry.path),
			'Unsafe or duplicate checkpoint path.'
		);
		seen.add(entry.path);
		assert(
			integer(entry.bytes) &&
				entry.bytes > 0 &&
				entry.bytes <= 32 * 1024 * 1024 &&
				HASH.test(entry.sha256 ?? '') &&
				typeof entry.data === 'string' &&
				entry.data.length <= Math.ceil((32 * 1024 * 1024) / 3) * 4 &&
				/^[A-Za-z0-9+/]*={0,2}$/.test(entry.data),
			'Invalid checkpoint file metadata.'
		);
		const bytes = Buffer.from(entry.data, 'base64');
		assert(
			bytes.length === entry.bytes &&
				bytes.toString('base64') === entry.data &&
				digest(bytes) === entry.sha256,
			'Checkpoint file checksum mismatch.'
		);
		total += entry.bytes;
		assert(total <= MAX_RAW, 'Unpublished source checkpoint exceeds the 384 MiB safety limit.');
	}
	return entries;
}

export function encodeCheckpoint(entries, keyValue, iv = randomBytes(12)) {
	validateEntries(entries);
	const compressed = gzipSync(Buffer.from(JSON.stringify({ version: 1, files: entries })));
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(keyValue), iv);
	cipher.setAAD(MAGIC);
	const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
	const result = Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
	assert(result.length <= MAX_ARCHIVE, 'Encrypted checkpoint exceeds its size limit.');
	return result;
}

export function decodeCheckpoint(bytes, keyValue) {
	assert(
		Buffer.isBuffer(bytes) &&
			bytes.length > MAGIC.length + 28 &&
			bytes.length <= MAX_ARCHIVE &&
			bytes.subarray(0, MAGIC.length).equals(MAGIC),
		'Invalid encrypted checkpoint container.'
	);
	try {
		const offset = MAGIC.length;
		const decipher = createDecipheriv(
			'aes-256-gcm',
			encryptionKey(keyValue),
			bytes.subarray(offset, offset + 12)
		);
		decipher.setAAD(MAGIC);
		decipher.setAuthTag(bytes.subarray(offset + 12, offset + 28));
		const compressed = Buffer.concat([
			decipher.update(bytes.subarray(offset + 28)),
			decipher.final()
		]);
		const payload = JSON.parse(
			gunzipSync(compressed, { maxOutputLength: MAX_JSON }).toString('utf8')
		);
		assert(payload.version === 1, 'Unknown checkpoint schema.');
		return validateEntries(payload.files);
	} catch {
		throw new Error('Checkpoint authentication, decoding or file validation failed.');
	}
}

export async function collectCheckpoint(sourceRoot) {
	const entries = [];
	await fs.mkdir(sourceRoot, { recursive: true });
	const realRoot = await fs.realpath(sourceRoot);
	let total = 0;
	for (const directory of await fs.readdir(sourceRoot, { withFileTypes: true })) {
		if (directory.name.toLowerCase() === '_audition') continue;
		assert(
			directory.isDirectory() && !directory.isSymbolicLink() && SLUG.test(directory.name),
			'Unexpected private source entry.'
		);
		const absolute = path.join(sourceRoot, directory.name);
		assert(
			path.dirname(await fs.realpath(absolute)) === realRoot,
			'Private source path escaped its root.'
		);
		for (const file of await fs.readdir(absolute, { withFileTypes: true })) {
			const relative = `${directory.name}/${file.name}`;
			assert(
				file.isFile() && !file.isSymbolicLink() && FILE.test(relative),
				'Unexpected private source file.'
			);
			const target = path.join(absolute, file.name);
			assert(
				path.dirname(await fs.realpath(target)) === (await fs.realpath(absolute)),
				'Private source file escaped its directory.'
			);
			const info = await fs.stat(target);
			assert(
				info.size > 0 && info.size <= 32 * 1024 * 1024,
				'Private source file exceeds its limit.'
			);
			total += info.size;
			assert(total <= MAX_RAW, 'Unpublished source checkpoint exceeds the 384 MiB safety limit.');
			const bytes = await fs.readFile(target);
			assert(bytes.length === info.size, 'Private source changed during collection.');
			entries.push({
				path: relative,
				bytes: bytes.length,
				sha256: digest(bytes),
				data: bytes.toString('base64')
			});
		}
	}
	return entries.sort((a, b) => a.path.localeCompare(b.path));
}

async function boundedBody(response, limit) {
	assert(response.body, 'GitHub response has no body.');
	const chunks = [];
	let length = 0;
	for await (const chunk of response.body) {
		length += chunk.length;
		assert(length <= limit, 'GitHub response exceeded its size limit.');
		chunks.push(Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

export async function createGithubNarrationState({
	root = process.cwd(),
	env = process.env,
	fetchImpl = fetch
} = {}) {
	const token = env.GH_TOKEN || env.GITHUB_TOKEN;
	assert(
		typeof token === 'string' && token.length > 10,
		'A repository-scoped GitHub token is required.'
	);
	const keyValue = env.NARRATION_STATE_KEY;
	encryptionKey(keyValue);
	const projectId = env.NARRATION_GOOGLE_PROJECT_ID;
	const keyHash = env.NARRATION_GOOGLE_KEY_SHA256;
	assert(
		projectId === NARRATION_PROJECT && HASH.test(keyHash ?? ''),
		'Verified Google project/key pins must be configured.'
	);
	assert(
		typeof env.GEMINI_API_KEY === 'string' && digest(env.GEMINI_API_KEY.trim()) === keyHash,
		'Gemini secret differs from the attested Free-tier key.'
	);
	const prefix = `/repos/${NARRATION_REPOSITORY}`;
	const sourceRoot = path.join(root, '.codex-artifacts/narration-sources');
	const quotaFile = path.join(root, '.codex-artifacts/narration-quota.json');
	let head;
	let data;
	async function api(route, { method = 'GET', body, binary, upload = false } = {}) {
		assert(route.startsWith(`${prefix}/`), 'Unexpected GitHub API target.');
		const response = await fetchImpl(`https://${upload ? 'uploads' : 'api'}.github.com${route}`, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
				...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
				...(binary ? { 'Content-Type': 'application/octet-stream' } : {})
			},
			body: binary || (body !== undefined ? JSON.stringify(body) : undefined),
			signal: AbortSignal.timeout(120_000),
			redirect: 'error'
		});
		assert(
			response.ok,
			`GitHub narration state operation failed (HTTP ${response.status}; ${stateApiOperation(route, method, upload)}). No provider request may proceed.`
		);
		if (response.status === 204) return null;
		return JSON.parse((await boundedBody(response, 8 * 1024 * 1024)).toString('utf8'));
	}
	async function loadRemote() {
		const ref = await api(`${prefix}/git/ref/heads/${NARRATION_STATE_BRANCH}`);
		assert(SHA.test(ref.object?.sha ?? ''), 'Invalid narration state ref.');
		head = ref.object.sha;
		const file = await api(`${prefix}/contents/state.json?ref=${head}`);
		assert(
			file.encoding === 'base64' && file.type === 'file' && file.size < 2 * 1024 * 1024,
			'Invalid narration state file.'
		);
		data = validateHostedState(JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')), {
			projectId,
			keyHash
		});
		return data;
	}
	async function commit(next, message) {
		assert(head, 'Narration state was not restored.');
		validateHostedState(next, { projectId, keyHash });
		const parent = head;
		const parentCommit = await api(`${prefix}/git/commits/${parent}`);
		assert(SHA.test(parentCommit.tree?.sha ?? ''), 'Invalid narration state tree.');
		const tree = await api(`${prefix}/git/trees`, {
			method: 'POST',
			body: {
				base_tree: parentCommit.tree.sha,
				tree: [
					{
						path: 'state.json',
						mode: '100644',
						type: 'blob',
						content: `${JSON.stringify(next, null, 2)}\n`
					}
				]
			}
		});
		const revision = await api(`${prefix}/git/commits`, {
			method: 'POST',
			body: { message, tree: tree.sha, parents: [parent] }
		});
		assert(SHA.test(revision.sha ?? ''), 'Invalid GitHub state commit.');
		await api(`${prefix}/git/refs/heads/${NARRATION_STATE_BRANCH}`, {
			method: 'PATCH',
			body: { sha: revision.sha, force: false }
		});
		const ref = await api(`${prefix}/git/ref/heads/${NARRATION_STATE_BRANCH}`);
		assert(
			ref.object?.sha === revision.sha,
			'Narration state changed concurrently. No provider request may proceed.'
		);
		head = revision.sha;
		data = next;
		return next;
	}
	async function download(checkpoint) {
		const response = await fetchImpl(
			`https://api.github.com${prefix}/releases/assets/${checkpoint.assetId}`,
			{
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/octet-stream',
					'X-GitHub-Api-Version': '2022-11-28'
				},
				redirect: 'manual',
				signal: AbortSignal.timeout(120_000)
			}
		);
		let binary = response;
		if ([301, 302, 303, 307, 308].includes(response.status)) {
			const location = new URL(response.headers.get('location'));
			assert(
				location.protocol === 'https:' &&
					['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(
						location.hostname
					),
				'Unexpected checkpoint download redirect.'
			);
			binary = await fetchImpl(location, {
				redirect: 'error',
				signal: AbortSignal.timeout(120_000)
			});
		}
		assert(binary.ok, 'Encrypted checkpoint download failed.');
		const bytes = await boundedBody(binary, Math.min(MAX_ARCHIVE, checkpoint.bytes + 1));
		assert(
			bytes.length === checkpoint.bytes && digest(bytes) === checkpoint.sha256,
			'Encrypted checkpoint checksum mismatch.'
		);
		return decodeCheckpoint(bytes, keyValue);
	}
	async function restore() {
		await loadRemote();
		assert(data.checkpoint !== null, 'Hosted checkpoint bootstrap is incomplete.');
		const entries = await download(data.checkpoint);
		// Validate/authenticate the entire archive before any local writes. Fresh runners have no source tree.
		const existing = await fs.readdir(sourceRoot).catch((error) => {
			if (error.code === 'ENOENT') return [];
			throw error;
		});
		assert(
			existing.length === 0,
			'Restore requires an empty runner source directory; preserve existing local sources.'
		);
		await fs.mkdir(sourceRoot, { recursive: true });
		assert(
			(await fs.realpath(sourceRoot)) ===
				path.join(await fs.realpath(root), '.codex-artifacts', 'narration-sources'),
			'Runner source root contains a symbolic link.'
		);
		for (const entry of entries)
			await atomicWrite(
				path.join(sourceRoot, ...entry.path.split('/')),
				Buffer.from(entry.data, 'base64')
			);
		await atomicWrite(quotaFile, `${JSON.stringify(data.quota, null, 2)}\n`);
		return data;
	}
	async function saveQuota() {
		assert(data, 'Narration state was not restored.');
		const quota = validateHostedQuota(JSON.parse(await fs.readFile(quotaFile, 'utf8')));
		assert(
			quota.day >= data.quota.day &&
				quota.createdAt === data.quota.createdAt &&
				quota.updatedAt >= data.quota.updatedAt &&
				(quota.day !== data.quota.day ||
					(quota.used >= data.quota.used && quota.blockedUntil >= data.quota.blockedUntil)),
			'Hosted quota cannot move backwards.'
		);
		return commit(
			{ ...data, quota, updatedAt: new Date().toISOString() },
			'Reserve narration quota before provider transport'
		);
	}
	async function saveCheckpoint() {
		assert(data, 'Narration state was not restored.');
		const bytes = encodeCheckpoint(await collectCheckpoint(sourceRoot), keyValue);
		const sha256 = digest(bytes);
		const name = `narration-checkpoint-v1-${sha256}.bin`;
		const release = await api(`${prefix}/releases/tags/${RELEASE_TAG}`);
		assert(
			release.tag_name === RELEASE_TAG &&
				release.prerelease === true &&
				release.draft === false &&
				integer(release.id),
			'Unexpected checkpoint release.'
		);
		const asset = await api(`${prefix}/releases/${release.id}/assets?name=${name}`, {
			method: 'POST',
			binary: bytes,
			upload: true
		});
		assert(integer(asset.id) && asset.size === bytes.length, 'Checkpoint upload was not complete.');
		const previous = data.checkpoint;
		const checkpoint = {
			releaseId: release.id,
			assetId: asset.id,
			name,
			sha256,
			bytes: bytes.length
		};
		const quota = validateHostedQuota(JSON.parse(await fs.readFile(quotaFile, 'utf8')));
		assert(
			quota.day >= data.quota.day &&
				quota.createdAt === data.quota.createdAt &&
				quota.updatedAt >= data.quota.updatedAt &&
				(quota.day !== data.quota.day ||
					(quota.used >= data.quota.used && quota.blockedUntil >= data.quota.blockedUntil)),
			'Checkpoint cannot rewind hosted quota.'
		);
		await commit(
			{ ...data, quota, checkpoint, updatedAt: new Date().toISOString() },
			'Save encrypted narration checkpoint'
		);
		// Only remove this workflow's older snapshots after the new pointer is durably committed.
		const assets = await api(`${prefix}/releases/${release.id}/assets?per_page=100`);
		assert(
			Array.isArray(assets) && assets.length < 100,
			'Checkpoint asset list exceeds its cleanup bound.'
		);
		for (const old of assets)
			if (ASSET_NAME.test(old.name ?? '') && old.id !== asset.id && old.id !== previous?.assetId)
				await api(`${prefix}/releases/assets/${old.id}`, { method: 'DELETE' });
		return checkpoint;
	}
	async function savePublication(publication) {
		return commit(
			{ ...data, publication, updatedAt: new Date().toISOString() },
			`Narration publication ${publication.status}`
		);
	}
	async function dropPublishedSources(slugs) {
		assert(
			env.GITHUB_ACTIONS === 'true' && data?.publication?.status === 'verified',
			'Source pruning requires a verified hosted publication.'
		);
		const realRoot = await fs.realpath(sourceRoot);
		for (const slug of slugs) {
			assert(
				SLUG.test(slug) &&
					slug.toLowerCase() !== '_audition' &&
					data.publication.slugs.includes(slug),
				'Unexpected source pruning slug.'
			);
			const target = path.join(sourceRoot, slug);
			let realTarget;
			try {
				realTarget = await fs.realpath(target);
			} catch (error) {
				if (error.code === 'ENOENT') continue;
				throw error;
			}
			assert(path.dirname(realTarget) === realRoot, 'Source pruning escaped the runner cache.');
			await fs.rm(target, { recursive: true });
		}
	}
	async function bootstrap(quota) {
		assert(env.GITHUB_ACTIONS !== 'true', 'Hosted jobs cannot bootstrap or reset quota state.');
		validateHostedQuota(quota);
		const initial = {
			version: 1,
			repository: NARRATION_REPOSITORY,
			projectId,
			keyHash,
			verifiedAt: new Date().toISOString(),
			hosting: {
				projectId: 'prj_IxNpapfOcZwq4zRwlK56DPCRwQnc',
				teamId: 'team_PxbH7s87MnRH1xfa9cA6QIfp',
				plan: 'hobby',
				verifiedAt: new Date().toISOString()
			},
			quota,
			checkpoint: null,
			publication: null,
			updatedAt: new Date().toISOString()
		};
		const tree = await api(`${prefix}/git/trees`, {
			method: 'POST',
			body: {
				tree: [
					{
						path: 'state.json',
						mode: '100644',
						type: 'blob',
						content: `${JSON.stringify(initial, null, 2)}\n`
					},
					{
						path: 'vercel.json',
						mode: '100644',
						type: 'blob',
						content: '{"git":{"deploymentEnabled":false}}\n'
					}
				]
			}
		});
		const revision = await api(`${prefix}/git/commits`, {
			method: 'POST',
			body: {
				message: 'Initialize free-tier narration state from the existing local ledger',
				tree: tree.sha,
				parents: []
			}
		});
		await api(`${prefix}/git/refs`, {
			method: 'POST',
			body: { ref: `refs/heads/${NARRATION_STATE_BRANCH}`, sha: revision.sha }
		});
		head = revision.sha;
		data = initial;
		await api(`${prefix}/releases`, {
			method: 'POST',
			body: {
				tag_name: RELEASE_TAG,
				target_commitish: head,
				name: 'Encrypted narration checkpoints',
				body: 'Machine-managed encrypted checkpoints for the daily narration workflow. Credentials are never included. Completed MP3 narration is delivered by the website.',
				prerelease: true,
				draft: false,
				make_latest: 'false'
			}
		});
		await saveCheckpoint();
		return data;
	}
	return {
		get data() {
			return data;
		},
		restore,
		saveQuota,
		saveCheckpoint,
		savePublication,
		dropPublishedSources,
		bootstrap
	};
}
