import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const gate = fileURLToPath(new URL('./check-architecture.mjs', import.meta.url));
const architecture = 'docs/architecture/ARCHITECTURE.md';
const noImpact = 'Architecture impact: no\nArchitecture rationale: Ordinary article content only.';

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), 'architecture-gate-'));
	t.after(() => {
		if (
			dirname(resolve(root)) !== resolve(tmpdir()) ||
			!basename(root).startsWith('architecture-gate-')
		) {
			throw new Error('Refusing to clean up outside the architecture fixture directory.');
		}
		rmSync(root, { recursive: true, force: true });
	});
	const git = (...args) =>
		execFileSync('git', args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		}).trim();
	const write = (file, content = 'Example content.\n') => {
		mkdirSync(dirname(join(root, file)), { recursive: true });
		writeFileSync(join(root, file), content);
	};
	const commit = () => {
		git('add', '-A');
		git(
			'-c',
			'user.name=Architecture fixture',
			'-c',
			'user.email=fixture@example.test',
			'-c',
			'commit.gpgsign=false',
			'-c',
			'core.hooksPath=.git/no-hooks',
			'commit',
			'--allow-empty',
			'-m',
			'Fixture'
		);
		return git('rev-parse', 'HEAD');
	};
	git('init', '-q');
	git('config', 'core.autocrlf', 'false');
	write(architecture, '# Architecture\n\nExisting implementation.\n');
	write('docs/architecture/FORENSIC_AUDIT.md', '# Audit\n\nExisting findings.\n');
	write('CONTRIBUTING.md', '# Contribution policy\n');
	write(
		'README.md',
		'[Architecture](docs/architecture/ARCHITECTURE.md)\n[Audit](docs/architecture/FORENSIC_AUDIT.md)\n'
	);
	write('src/lib/components/Example.svelte', '<p>Example</p>\n');
	write('src/lib/posts/existing-post.md');
	const base = commit();
	const run = ({ body, baseRef = base, extra = [] } = {}) => {
		const args = [gate, '--base', baseRef, ...extra];
		if (body !== undefined) {
			const event = join(root, '.git', 'architecture-event.json');
			writeFileSync(event, JSON.stringify({ pull_request: { body } }));
			args.push('--event', event);
		}
		const env = { ...process.env };
		delete env.GITHUB_EVENT_PATH;
		const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8' });
		if (result.error) throw result.error;
		return { status: result.status, output: `${result.stdout}${result.stderr}` };
	};
	return { root, git, write, commit, base, run };
}

test('ordinary post/component/test changes do not force a document diff', (t) => {
	const f = fixture(t);
	f.write('src/lib/posts/new-post.md');
	f.write('src/lib/components/Example.svelte', '<p>Updated</p>\n');
	f.write('src/lib/components/Example.test.ts');
	f.commit();
	assert.equal(f.run({ body: noImpact }).status, 0);
});

test('declared impact requires a real canonical document change', (t) => {
	const f = fixture(t);
	const body =
		'Architecture impact: yes\nArchitecture rationale: Introduces a shared rendering boundary.';
	f.write('src/lib/components/Example.svelte', '<p>Updated</p>\n');
	f.commit();
	assert.match(f.run({ body }).output, /Update affected sections/);
	// Rewriting identical bytes does not satisfy the gate.
	f.write(architecture, readFileSync(join(f.root, architecture), 'utf8'));
	f.commit();
	assert.equal(f.run({ body }).status, 1);
	f.write(architecture, '# Architecture\n\nUpdated rendering boundary.\n');
	f.commit();
	assert.equal(f.run({ body }).status, 0);
});

test('foundational config changes require documentation despite a no declaration', (t) => {
	const f = fixture(t);
	f.write('svelte.config.js', 'export default {};\n');
	f.commit();
	const result = f.run({ body: noImpact });
	assert.equal(result.status, 1);
	assert.match(result.output, /Detected structural change: svelte\.config\.js/);
});

test('route additions, removals, and renames are topology signals', (t) => {
	const f = fixture(t);
	f.write('src/routes/old/+page.svelte');
	const routeBase = f.commit();
	mkdirSync(join(f.root, 'src/routes/new'), { recursive: true });
	renameSync(
		join(f.root, 'src/routes/old/+page.svelte'),
		join(f.root, 'src/routes/new/+page.svelte')
	);
	f.commit();
	const renamed = f.run({ baseRef: routeBase });
	assert.equal(renamed.status, 1);
	assert.match(renamed.output, /route topology: src\/routes\/old\/\+page\.svelte/);
	assert.match(renamed.output, /route topology: src\/routes\/new\/\+page\.svelte/);
	assert.equal(f.run().status, 1);
});

test('new root library domains are detected without treating ordinary subfolders as domains', (t) => {
	const f = fixture(t);
	f.write('src/lib/components/nested/Example.svelte');
	const nestedHead = f.commit();
	assert.equal(f.run().status, 0);
	f.write('src/lib/services/client.ts');
	f.commit();
	const result = f.run({ baseRef: nestedHead });
	assert.equal(result.status, 1);
	assert.match(result.output, /root library domain added: src\/lib\/services/);
});

test('deleting or renaming required architecture documents fails', (t) => {
	const f = fixture(t);
	renameSync(join(f.root, architecture), join(f.root, 'docs/architecture/OLD.md'));
	f.commit();
	assert.match(f.run().output, /Required architecture entry point is missing or empty/);
	f.write(architecture, '');
	f.commit();
	assert.equal(f.run().status, 1);
});

test('deleting the audit cannot be hidden by changing the canonical architecture document', (t) => {
	const f = fixture(t);
	rmSync(join(f.root, 'docs/architecture/FORENSIC_AUDIT.md'));
	f.write(architecture, '# Architecture\n\nUpdated implementation.\n');
	f.commit();
	assert.equal(f.run().status, 1);
});

test('README architecture links must resolve to the canonical paths', (t) => {
	const f = fixture(t);
	f.write('README.md', '[Architecture](docs/ARCHITECTURE.md)\n');
	f.commit();
	assert.match(f.run().output, /README\.md must link/);
});

test('PR declaration rejects missing, ambiguous, or commented-only impact values', (t) => {
	const f = fixture(t);
	for (const body of [
		'No declaration.',
		'Architecture impact: yes|no\nArchitecture rationale: A useful explanation.',
		`${noImpact}\nArchitecture impact: yes`,
		'<!-- Architecture impact: no -->\nArchitecture rationale: A useful explanation.'
	]) {
		assert.equal(f.run({ body }).status, 1, body);
	}
});

test('PR rationale rejects absent, blank, commented, or template placeholder values', (t) => {
	const f = fixture(t);
	for (const rationale of [
		'',
		'\nTesting: passed',
		'<!-- explain here -->',
		'<explain the impact>',
		'[explanation]',
		'TBD',
		'...'
	]) {
		const result = f.run({ body: `Architecture impact: no\nArchitecture rationale: ${rationale}` });
		assert.equal(result.status, 1, rationale);
		assert.match(result.output, /non-placeholder/);
	}
});

test('missing base revisions and disconnected histories fail closed', (t) => {
	const f = fixture(t);
	assert.equal(f.run({ baseRef: 'does-not-exist' }).status, 1);
	f.git('checkout', '--orphan', 'unrelated');
	f.commit();
	assert.equal(f.run().status, 1);
});

test('shallow repositories fail closed even when both requested commits are present', (t) => {
	const f = fixture(t);
	writeFileSync(join(f.root, '.git', 'shallow'), `${f.base}\n`);
	const result = f.run();
	assert.equal(result.status, 1);
	assert.match(result.output, /Shallow Git history is unsupported/);
});

test('the comparison uses the merge base when the target branch has advanced', (t) => {
	const f = fixture(t);
	f.git('checkout', '-b', 'feature');
	f.write('src/lib/posts/new-post.md');
	const head = f.commit();
	f.git('checkout', '-b', 'advanced-base', f.base);
	f.write('svelte.config.js', 'export default {};\n');
	const advanced = f.commit();
	assert.equal(f.run({ baseRef: advanced, extra: ['--head', head] }).status, 0);
});
