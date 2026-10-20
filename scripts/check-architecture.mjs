import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ARCHITECTURE = 'docs/architecture/ARCHITECTURE.md';
const AUDIT = 'docs/architecture/FORENSIC_AUDIT.md';
const requiredFiles = [ARCHITECTURE, AUDIT, 'CONTRIBUTING.md', 'README.md'];
const structuralFiles = new Set([
	'package.json',
	'svelte.config.js',
	'vite.config.ts',
	'tsconfig.json',
	'vercel.json',
	'src/hooks.server.ts',
	'src/hooks.client.ts',
	'src/app.d.ts',
	'supabase/config.toml',
	'CONTRIBUTING.md',
	'scripts/check-architecture.mjs',
	'.github/workflows/architecture.yml'
]);

function git(...args) {
	try {
		return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	} catch (error) {
		throw new Error(`git ${args[0]} failed: ${error.stderr?.toString().trim() || error.message}`, {
			cause: error
		});
	}
}

function commit(ref) {
	if (!ref || ref.startsWith('-') || /[\r\n]/.test(ref) || ref.includes('\0')) {
		throw new Error('A valid Git revision is required.');
	}
	return git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim();
}

function readAt(revision, file) {
	return git('show', `${revision}:${file}`);
}

function changedFiles(base, head) {
	const entries = git('diff', '--name-status', '-z', '--find-renames', base, head).split('\0');
	const changes = [];
	for (let index = 0; index < entries.length && entries[index]; ) {
		const status = entries[index++];
		const file = entries[index++];
		if (/^[RC]/.test(status)) {
			changes.push({ status, files: [file, entries[index++]] });
		} else {
			changes.push({ status, files: [file] });
		}
	}
	return changes;
}

function libDomains(revision) {
	if (!git('ls-tree', '-d', '--name-only', revision, '--', 'src/lib').trim()) return new Set();
	return new Set(
		git('ls-tree', '-d', '--name-only', `${revision}:src/lib`).trim().split('\n').filter(Boolean)
	);
}

function structuralReasons(changes, base, head) {
	const reasons = [];
	for (const change of changes) {
		for (const file of change.files) {
			if (
				structuralFiles.has(file) ||
				/^supabase\/migrations\/.*\.sql$/.test(file) ||
				/^src\/lib\/(?:.*\/)?schema\.ts$/.test(file)
			) {
				reasons.push(file);
			} else if (
				/^[ADR]/.test(change.status) &&
				/^src\/routes\/(?:.*\/)?\+(?:page|layout|server)(?:\.server)?\.(?:svelte|ts|js)$/.test(file)
			) {
				reasons.push(`route topology: ${file}`);
			}
		}
	}
	const before = libDomains(base);
	const after = libDomains(head);
	for (const domain of new Set([...before, ...after])) {
		if (before.has(domain) !== after.has(domain)) {
			reasons.push(
				`root library domain ${after.has(domain) ? 'added' : 'removed'}: src/lib/${domain}`
			);
		}
	}
	return [...new Set(reasons)];
}

function prDeclaration(event) {
	if (!event?.pull_request || typeof event.pull_request.body !== 'string') {
		throw new Error(
			'The pull request event must contain a description with architecture declarations.'
		);
	}
	const body = event.pull_request.body.replace(/<!--[\s\S]*?-->/g, '');
	const impacts = [...body.matchAll(/^[\t ]*Architecture impact:[\t ]*([^\r\n]*)$/gim)];
	const rationales = [...body.matchAll(/^[\t ]*Architecture rationale:[\t ]*([^\r\n]*)$/gim)];
	if (impacts.length !== 1 || !/^(yes|no)$/i.test(impacts[0][1].trim())) {
		throw new Error(
			'PR description requires exactly one "Architecture impact: yes|no" declaration.'
		);
	}
	const rationale = rationales.length === 1 ? rationales[0][1].trim() : '';
	if (
		!/[\p{L}\p{N}]/u.test(rationale) ||
		/^(?:tbd|todo|n\/?a|none|placeholder|replace me|explain here|describe here)$/i.test(
			rationale
		) ||
		/^(?:<[^>]*>|\[[^\]]*\])$/.test(rationale)
	) {
		throw new Error(
			'PR description requires one non-placeholder "Architecture rationale: ..." line.'
		);
	}
	return impacts[0][1].trim().toLowerCase() === 'yes';
}

function argumentsFrom(argv) {
	const options = { head: 'HEAD', event: process.env.GITHUB_EVENT_PATH };
	for (let index = 0; index < argv.length; index += 2) {
		const name = argv[index];
		if (!['--base', '--head', '--event'].includes(name) || !argv[index + 1]) {
			throw new Error(
				'Usage: node scripts/check-architecture.mjs --base REF [--head REF] [--event FILE]'
			);
		}
		options[name.slice(2)] = argv[index + 1];
	}
	if (!options.base) throw new Error('--base is required; comparison failures are never skipped.');
	return options;
}

function main() {
	const options = argumentsFrom(process.argv.slice(2));
	if (git('rev-parse', '--is-shallow-repository').trim() === 'true') {
		throw new Error('Shallow Git history is unsupported. Fetch complete comparison history.');
	}
	const base = commit(options.base);
	const head = commit(options.head);
	const ancestor = git('merge-base', base, head).trim();
	if (!ancestor) throw new Error('No merge base is available. Fetch complete comparison history.');
	const changes = changedFiles(ancestor, head);
	const errors = [];
	const contents = new Map();
	for (const file of requiredFiles) {
		try {
			const content = readAt(head, file);
			if (!content.trim()) throw new Error('file is empty');
			contents.set(file, content);
		} catch {
			errors.push(
				`Required architecture entry point is missing or empty in the target revision: ${file}`
			);
		}
	}
	for (const file of [ARCHITECTURE, AUDIT]) {
		const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		if (
			!new RegExp(`\\]\\(<?(?:\\./)?${escaped}(?:#[^)>\\s]+)?>?\\)`).test(
				contents.get('README.md') ?? ''
			)
		) {
			errors.push(`README.md must link to ${file}.`);
		}
	}
	const reasons = structuralReasons(changes, ancestor, head);
	const impact = options.event
		? prDeclaration(JSON.parse(readFileSync(options.event, 'utf8')))
		: false;
	const architectureChanged = changes.some((change) => change.files.includes(ARCHITECTURE));
	if ((impact || reasons.length > 0) && !architectureChanged) {
		errors.push(`Update affected sections of ${ARCHITECTURE} in this change.`);
		if (impact) errors.push('The PR declares architecture impact.');
		for (const reason of reasons) errors.push(`Detected structural change: ${reason}`);
	}
	if (errors.length > 0) throw new Error(errors.join('\n'));
	console.log(
		`Architecture gate passed (${changes.length} changed paths, ${reasons.length} structural signals; ` +
			`${architectureChanged ? 'canonical document changed' : 'no automatic document change required'}).`
	);
	console.log(
		'Reviewers must still assess semantic architecture changes and documentation accuracy.'
	);
}

try {
	main();
} catch (error) {
	console.error(
		`Architecture gate failed: ${error instanceof Error ? error.message : String(error)}`
	);
	process.exitCode = 1;
}
