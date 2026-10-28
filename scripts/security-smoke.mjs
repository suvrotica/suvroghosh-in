import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { repositoryRoot } from './security-policy.mjs';

// Keep network-capable provider credentials out of local regression children.
const env = { ...process.env };
for (const key of Object.keys(env)) {
	if (
		/^(?:(?:SUPABASE_|NOTES_|CHATTERBOX_|RESEND_|CONTACT_|PROMPT_ATLAS_|AI_GATEWAY_|GOOGLE_|GEMINI_|SYNTHETIC_DATA_|ENQUIRY_DEMO_|COMMENTS_|KV_|UPSTASH_)|(?:VERCEL_OIDC_TOKEN|BLOB_READ_WRITE_TOKEN|CRON_SECRET)$)/i.test(
			key
		)
	)
		delete env[key];
}
env.NODE_ENV = 'test';
const jobs = [
	[
		'Security checker and math-renderer regression fixtures',
		[
			'--test',
			'scripts/security-policy.test.mjs',
			'scripts/security-audit.test.mjs',
			'scripts/security-katex.test.mjs'
		]
	],
	[
		'Offline request and provider boundary tests',
		[
			join(repositoryRoot, 'node_modules/vitest/vitest.mjs'),
			'run',
			'--config',
			'vitest.security.config.ts'
		]
	]
];
let failed = false;
for (const [label, args] of jobs) {
	console.log(`\n${label}`);
	const result = spawnSync(process.execPath, args, {
		cwd: repositoryRoot,
		env,
		stdio: 'inherit',
		timeout: 300_000,
		shell: false
	});
	if (result.error || result.status !== 0) {
		console.error(
			`${label} failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}.`
		);
		failed = true;
	}
}
console.log(
	'\nScope: local mocked regression tests; hosted settings, database roles and deployed headers require separate verification.'
);
process.exitCode = failed ? 1 : 0;
