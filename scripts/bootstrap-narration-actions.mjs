import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
	createGithubNarrationState,
	NARRATION_REPOSITORY,
	NARRATION_PROJECT,
	NARRATION_STATE_BRANCH,
	validateHostedQuota
} from './lib/github-narration-state.mjs';

// This explicitly invoked, one-time local migration sends the existing key straight to
// GitHub's encrypted secret store. No credentials are printed or included in Git state.
const defaultGh = (args, input) =>
	execFileSync('gh', args, {
		input,
		encoding: 'utf8',
		maxBuffer: 2 * 1024 * 1024,
		windowsHide: true,
		stdio: ['pipe', 'pipe', 'pipe']
	}).trim();
export async function bootstrapNarrationActions({
	root = process.cwd(),
	env = process.env,
	gh = defaultGh,
	createState = createGithubNarrationState
} = {}) {
	if (env.GITHUB_ACTIONS === 'true')
		throw new Error('Hosted jobs cannot bootstrap or reset quota state.');
	const repository = JSON.parse(gh(['api', `repos/${NARRATION_REPOSITORY}`]));
	if (repository.private || repository.id !== 1201239670 || repository.default_branch !== 'main')
		throw new Error('Unexpected repository visibility, identity or default branch.');
	// Never rotate the encryption secret before discovering an existing checkpoint.
	// A retry from another computer must not strand the authoritative encrypted state.
	for (const route of [
		`git/ref/heads/${NARRATION_STATE_BRANCH}`,
		'releases/tags/narration-checkpoints'
	]) {
		let absent = false;
		try {
			gh(['api', `repos/${NARRATION_REPOSITORY}/${route}`, '--silent']);
		} catch (error) {
			if (String(error.stderr ?? '').includes('(HTTP 404)')) absent = true;
			else throw error;
		}
		if (!absent)
			throw new Error(
				'Hosted narration is already configured or partially initialized. Preserve its existing secrets and recover the state; do not bootstrap again.'
			);
	}
	const apiKey = env.GEMINI_API_KEY?.trim();
	if (!apiKey || env.GEMINI_TTS_FREE_TIER_CONFIRMED !== 'true' || env.GEMINI_TTS_VOICE !== 'achird')
		throw new Error('The existing verified Achird Free-tier authoring configuration is required.');
	const keyHash = createHash('sha256').update(apiKey).digest('hex');
	const quota = validateHostedQuota(
		JSON.parse(await fs.readFile(path.join(root, '.codex-artifacts/narration-quota.json'), 'utf8'))
	);
	const keyFile = path.join(root, '.codex-artifacts/narration-state-key');
	let encryptionKey;
	try {
		encryptionKey = (await fs.readFile(keyFile, 'utf8')).trim();
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
		encryptionKey = randomBytes(32).toString('hex');
		await fs.writeFile(keyFile, `${encryptionKey}\n`, { flag: 'wx', mode: 0o600 });
	}
	if (!/^[a-f0-9]{64}$/.test(encryptionKey))
		throw new Error('Invalid existing local checkpoint encryption key.');
	// Keep hosted generation disabled while the old schedule remains active during validation.
	for (const [name, value] of Object.entries({
		NARRATION_HOSTED_ENABLED: 'false',
		NARRATION_FREE_TIERS_CONFIRMED: 'true',
		NARRATION_GOOGLE_PROJECT_ID: NARRATION_PROJECT,
		NARRATION_GOOGLE_KEY_SHA256: keyHash
	}))
		gh(['variable', 'set', name, '--repo', NARRATION_REPOSITORY, '--body', value]);
	gh(['secret', 'set', 'GEMINI_API_KEY', '--repo', NARRATION_REPOSITORY], apiKey);
	gh(['secret', 'set', 'NARRATION_STATE_KEY', '--repo', NARRATION_REPOSITORY], encryptionKey);
	const token = gh(['auth', 'token']);
	const client = await createState({
		root,
		env: {
			...env,
			GH_TOKEN: token,
			NARRATION_STATE_KEY: encryptionKey,
			NARRATION_GOOGLE_PROJECT_ID: NARRATION_PROJECT,
			NARRATION_GOOGLE_KEY_SHA256: keyHash
		}
	});
	await client.bootstrap(quota);
	return {
		configured: true,
		repository: NARRATION_REPOSITORY,
		project: NARRATION_PROJECT,
		quotaDay: quota.day,
		used: quota.used,
		encryptedCheckpointBytes: client.data.checkpoint.bytes,
		hostedGenerationEnabled: false,
		providerRequests: 0
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	try {
		if (process.argv.slice(2).join(' ') !== '--confirm-free-project-and-hobby')
			throw new Error(
				'Run locally with --confirm-free-project-and-hobby only after verifying the exact Google project is billing-unlinked and Vercel is on Hobby.'
			);
		console.log(JSON.stringify(await bootstrapNarrationActions()));
	} catch (error) {
		// Child-process stderr or request data can contain sensitive setup context; do not echo it.
		console.error(
			error?.status !== undefined
				? 'GitHub CLI setup failed. Inspect authentication/repository permissions without printing secrets.'
				: error.message
		);
		process.exitCode = 1;
	}
}
