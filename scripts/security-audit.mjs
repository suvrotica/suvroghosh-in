import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryRoot, runPolicy } from './security-policy.mjs';

export function interpretAudit(result) {
	if (result.error || result.signal || result.status === null) {
		return {
			ok: false,
			message: 'Dependency audit failed to run or exceeded its deadline.',
			findings: []
		};
	}
	let report;
	try {
		report = JSON.parse(result.stdout);
	} catch {
		return {
			ok: false,
			message: 'Dependency audit returned invalid JSON; coverage is unavailable.',
			findings: []
		};
	}
	const counts = report.metadata?.vulnerabilities;
	if (report.error || !counts || !Number.isSafeInteger(counts.total)) {
		return {
			ok: false,
			message: 'Dependency audit did not return vulnerability metadata; coverage is unavailable.',
			findings: []
		};
	}
	const findings = Object.entries(report.vulnerabilities ?? {}).map(([name, finding]) => ({
		name,
		severity: finding.severity,
		advisories: (finding.via ?? [])
			.filter((item) => typeof item === 'object')
			.map((item) => item.url)
	}));
	return {
		ok: result.status === 0 && counts.total === 0 && findings.length === 0,
		message: `Dependency audit (including development/build dependencies): ${counts.total} vulnerable packages; exit ${result.status}.`,
		findings
	};
}

export function auditDependencies(run = spawnSync) {
	const npmCli =
		process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
	const usingCli = existsSync(npmCli);
	return interpretAudit(
		run(
			usingCli ? process.execPath : 'npm',
			[...(usingCli ? [npmCli] : []), 'audit', '--json', '--audit-level=low'],
			{
				cwd: repositoryRoot,
				encoding: 'utf8',
				timeout: 120_000,
				maxBuffer: 16 * 1024 * 1024,
				shell: false
			}
		)
	);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	let failed = false;
	try {
		const policy = await runPolicy();
		for (const failure of policy.failures) console.error(failure);
		console.log(
			`Security policy: ${policy.modules} source modules, ${policy.workflows} workflows; ${policy.failures.length} violations.`
		);
		failed ||= policy.failures.length > 0;
	} catch (error) {
		console.error(`Security policy could not complete: ${error.message}`);
		failed = true;
	}
	const audit = auditDependencies();
	console.log(audit.message);
	for (const finding of audit.findings) {
		console.error(
			`${finding.severity}: ${finding.name}${finding.advisories.length ? ` (${finding.advisories.join(', ')})` : ''}`
		);
	}
	process.exitCode = failed || !audit.ok ? 1 : 0;
}
