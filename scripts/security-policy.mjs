import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { parseDocument } from 'yaml';

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function checkCsp(config) {
	const failures = [];
	const csp = config?.kit?.csp;
	if (csp?.mode !== 'auto') failures.push('CSP must retain automatic nonce/hash handling.');
	for (const [directive, expected] of Object.entries({
		'default-src': ['self'],
		'script-src': ['self', 'https://va.vercel-scripts.com'],
		'object-src': ['none'],
		'base-uri': ['self'],
		'form-action': ['self'],
		'frame-ancestors': ['none']
	})) {
		const actual = csp?.directives?.[directive];
		if (
			!Array.isArray(actual) ||
			actual.length !== expected.length ||
			expected.some((value) => !actual.includes(value))
		) {
			failures.push(
				`CSP ${directive} changed; review the resource requirement and its policy check.`
			);
		}
	}
	return failures;
}

export function checkDeploymentHeaders(config) {
	const failures = [];
	const headers = new Map(
		(config?.headers ?? [])
			.filter((rule) => rule.source === '/(.*)')
			.flatMap((rule) => rule.headers ?? [])
			.map(({ key, value }) => [key.toLowerCase(), value])
	);
	for (const [name, value] of Object.entries({
		'x-frame-options': 'DENY',
		'x-content-type-options': 'nosniff',
		'referrer-policy': 'strict-origin-when-cross-origin',
		'permissions-policy': 'camera=(), microphone=(), geolocation=()'
	})) {
		if (headers.get(name) !== value)
			failures.push(`Deployment header ${name} is missing or changed.`);
	}
	return failures;
}

export function isServerModule(path) {
	return (
		path.startsWith('src/lib/server/') ||
		/(?:^|\/)\+server\.[cm]?[jt]s$/.test(path) ||
		/\.server\.[cm]?[jt]s$/.test(path)
	);
}

function isTypeOnly(node) {
	if (ts.isImportDeclaration(node)) {
		const clause = node.importClause;
		return (
			clause?.isTypeOnly ||
			(!clause?.name &&
				clause?.namedBindings &&
				ts.isNamedImports(clause.namedBindings) &&
				clause.namedBindings.elements.length > 0 &&
				clause.namedBindings.elements.every((item) => item.isTypeOnly))
		);
	}
	return (
		node.isTypeOnly ||
		(node.exportClause &&
			ts.isNamedExports(node.exportClause) &&
			node.exportClause.elements.length > 0 &&
			node.exportClause.elements.every((item) => item.isTypeOnly))
	);
}

/** Find forbidden import edges; SvelteKit's build remains the transitive bundle check. */
export function checkSourceBoundary(path, text) {
	path = path.replaceAll('\\', '/');
	if (isServerModule(path) || /\.(?:test|spec|d)\.[cm]?[jt]s$/.test(path)) return [];
	const scripts = path.endsWith('.svelte')
		? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((match) => match[1])
		: [text];
	const failures = new Set();
	for (const script of scripts) {
		const source = ts.createSourceFile(
			path,
			script,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS
		);
		const checkImport = (specifier) => {
			if (!specifier || !ts.isStringLiteralLike(specifier)) return;
			const name = specifier.text;
			const resolved = name.startsWith('.')
				? posix.normalize(posix.join(posix.dirname(path), name))
				: name.replace(/^\$lib\//, 'src/lib/');
			if (
				/^\$env\/(?:static|dynamic)\/private$/.test(name) ||
				name === '$app/server' ||
				resolved === 'src/lib/server' ||
				resolved.startsWith('src/lib/server/') ||
				/\.server(?:\.[cm]?[jt]s)?$/.test(resolved) ||
				/(?:^|\/)\+server(?:\.[cm]?[jt]s)?$/.test(resolved)
			) {
				failures.add(`${path}: browser/universal module imports server-only ${name}.`);
			}
		};
		const visit = (node) => {
			if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && !isTypeOnly(node)) {
				checkImport(node.moduleSpecifier);
			} else if (
				ts.isCallExpression(node) &&
				(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
					(ts.isIdentifier(node.expression) && node.expression.text === 'require'))
			) {
				checkImport(node.arguments[0]);
			} else if (
				ts.isPropertyAccessExpression(node) &&
				node.name.text === 'env' &&
				ts.isIdentifier(node.expression) &&
				node.expression.text === 'process'
			) {
				failures.add(
					`${path}: browser/universal module reads process.env; use public env imports.`
				);
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	return [...failures];
}

export function checkWorkflow(path, document) {
	const failures = [];
	const events = document?.on;
	const target =
		typeof events === 'string'
			? events === 'pull_request_target'
			: Array.isArray(events)
				? events.includes('pull_request_target')
				: events && Object.hasOwn(events, 'pull_request_target');
	if (!document?.jobs || typeof document.jobs !== 'object') return [`${path}: no workflow jobs.`];
	if (!document.permissions || document.permissions === 'write-all') {
		failures.push(`${path}: explicit workflow permissions are required.`);
	}
	if (target && path !== '.github/workflows/architecture.yml') {
		failures.push(`${path}: a new pull_request_target workflow needs a dedicated security review.`);
	}
	for (const [name, job] of Object.entries(document.jobs)) {
		const steps = job.steps ?? [];
		for (const step of [...steps, ...(job.uses ? [job] : [])]) {
			if (typeof step.uses === 'string' && !step.uses.startsWith('./')) {
				const pinned = step.uses.startsWith('docker://')
					? /@sha256:[a-f0-9]{64}$/.test(step.uses)
					: /^[^@\s]+@[a-f0-9]{40}$/.test(step.uses);
				if (!pinned) failures.push(`${path}/${name}: ${step.uses} is not immutably pinned.`);
			}
			if (
				step.uses?.startsWith('actions/checkout@') &&
				step.with?.['persist-credentials'] !== false
			) {
				failures.push(`${path}/${name}: checkout must not persist its token.`);
			}
		}
		if (!target) continue;
		const permissions = job.permissions ?? document.permissions;
		if (
			!permissions ||
			typeof permissions !== 'object' ||
			Object.entries(permissions).some(([scope, value]) => scope !== 'contents' || value !== 'read')
		)
			failures.push(`${path}/${name}: trusted-base gate must retain contents: read only.`);
		const checkouts = steps.filter((step) => step.uses?.startsWith('actions/checkout@'));
		if (
			checkouts.length !== 1 ||
			checkouts[0].with?.ref !== '${{ github.event.pull_request.base.sha }}' ||
			checkouts[0].with?.repository
		)
			failures.push(`${path}/${name}: checkout must select exactly the trusted base revision.`);
		if (/\$\{\{\s*secrets\./.test(JSON.stringify(job))) {
			failures.push(`${path}/${name}: the trusted-base gate must not receive application secrets.`);
		}
		for (const step of steps) {
			if (step.uses && !/^actions\/(?:checkout|setup-node)@/.test(step.uses)) {
				failures.push(`${path}/${name}: unreviewed action in the trusted-base gate.`);
			}
			const run = step.run ?? '';
			if (
				/\b(?:npm|npx|pnpm|yarn)\s/.test(run) ||
				/\bgit\s+(?:checkout|switch|reset|worktree)\b/.test(run) ||
				/\bgit\s*\(\s*['"](?:checkout|switch|reset|worktree)['"]/.test(run) ||
				/\$\{\{\s*github\.event\.pull_request\./.test(run)
			)
				failures.push(`${path}/${name}: trusted-base execution contract changed; review required.`);
		}
	}
	return failures;
}

function filesUnder(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? filesUnder(path) : entry.isFile() ? [path] : [];
	});
}

export async function runPolicy(root = repositoryRoot) {
	const { default: svelte } = await import(pathToFileURL(join(root, 'svelte.config.js')).href);
	const failures = [
		...checkCsp(svelte),
		...checkDeploymentHeaders(JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')))
	];
	let modules = 0;
	for (const file of filesUnder(join(root, 'src'))) {
		if (!/\.(?:[cm]?[jt]s|svelte)$/.test(file)) continue;
		modules++;
		failures.push(...checkSourceBoundary(relative(root, file), readFileSync(file, 'utf8')));
	}
	const workflows = filesUnder(join(root, '.github/workflows')).filter((file) =>
		/\.ya?ml$/.test(file)
	);
	for (const file of workflows) {
		const path = relative(root, file).replaceAll('\\', '/');
		const document = parseDocument(readFileSync(file, 'utf8'), { uniqueKeys: true });
		if (document.errors.length)
			failures.push(`${path}: invalid YAML: ${document.errors[0].message}`);
		else failures.push(...checkWorkflow(path, document.toJS()));
	}
	return { failures, modules, workflows: workflows.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const result = await runPolicy();
		for (const failure of result.failures) console.error(failure);
		console.log(
			`Security policy: ${result.modules} source modules, ${result.workflows} workflows; ${result.failures.length} violations.`
		);
		process.exitCode = result.failures.length ? 1 : 0;
	} catch (error) {
		console.error(`Security policy could not complete: ${error.message}`);
		process.exitCode = 1;
	}
}
