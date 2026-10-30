import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, loadConfigFromFile } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the configured SSR sanitizer loads without require(ESM) and preserves SVG boundaries', async (t) => {
	const loaded = await loadConfigFromFile(
		{ command: 'build', mode: 'production', isSsrBuild: true },
		path.join(root, 'vite.config.ts'),
		root,
		'silent'
	);
	assert.ok(loaded, 'The actual application Vite configuration must load.');
	const cache = path.join(root, 'node_modules/.cache');
	await mkdir(cache, { recursive: true });
	const cacheRoot = await realpath(cache);
	const output = await mkdtemp(path.join(cacheRoot, 'security-ssr-sanitizer-'));
	t.after(async () => {
		const resolved = await realpath(output);
		assert.ok(resolved.startsWith(cacheRoot + path.sep), 'Cleanup must stay in the owned cache.');
		await rm(resolved, { recursive: true, force: true });
	});

	// Exercise the application's SSR dependency boundary without running its full build/plugins.
	// Loading the installed package directly under normal Node would hide the deployed loader bug.
	const result = await build({
		configFile: false,
		envDir: false,
		root,
		logLevel: 'silent',
		ssr: loaded.config.ssr,
		build: {
			ssr: path.join(root, 'src/lib/visualizations/post-to-uml/plantuml/security.ts'),
			outDir: output,
			emptyOutDir: false,
			minify: false,
			commonjsOptions: loaded.config.build?.commonjsOptions,
			rollupOptions: { output: { entryFileNames: 'security.mjs' } }
		}
	});
	const bundles = Array.isArray(result) ? result : [result];
	const externalParserImports = bundles.flatMap((bundle) =>
		bundle.output.flatMap((item) =>
			item.type === 'chunk'
				? item.imports.filter((specifier) =>
						/^(?:htmlparser2|domhandler|domutils|domelementtype|entities|dom-serializer)(?:\/|$)/.test(
							specifier
						)
					)
				: []
		)
	);
	assert.deepEqual(
		externalParserImports,
		[],
		'The sanitizer parser closure must stay bundled: bare imports can resolve other installed major versions.'
	);

	const entry = pathToFileURL(path.join(output, 'security.mjs')).href;
	const child = spawnSync(
		process.execPath,
		[
			'--no-experimental-require-module',
			'--input-type=module',
			'-e',
			String.raw`
import assert from 'node:assert/strict';
const { sanitizeSvg, checkPlantUmlSecurity } = await import(${JSON.stringify(entry)});
const safe = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><marker id="arrow"><polygon points="0,0 1,1 0,2"/></marker></defs><path d="M0 0L10 10" marker-end="url(#arrow)" stroke="#123456"/><text>Safe &amp; readable</text></svg>');
assert.match(safe, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
assert.match(safe, /viewBox="0 0 100 100"/);
assert.match(safe, /marker-end="url\(#arrow\)"/);
assert.match(safe, /<polygon points="0,0 1,1 0,2"/);
assert.match(safe, /stroke="#123456"/);
assert.match(safe, /Safe &amp; readable/);
const unsafe = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><style>@import "https://bad.invalid/a";</style><foreignObject><iframe src="https://bad.invalid/frame"></iframe></foreignObject><script>alert(2)</script><image href="https://bad.invalid/pixel"/><animate attributeName="href"/><rect fill="url(&#104;ttps://bad.invalid/x)" style="fill:red;stroke-width:2"/><text>still readable</text></svg>');
assert.doesNotMatch(unsafe, /<script|<foreignObject|<iframe|<animate|<image|onload|bad\.invalid|@import/);
assert.match(unsafe, /fill:red/);
assert.match(unsafe, /still readable/);
assert.equal(checkPlantUmlSecurity('@startuml\n!include https://bad.invalid/source\n@enduml').safe, false);
console.log('Strict-loader import and SVG preservation/rejection checks passed.');
`
		],
		{ cwd: root, encoding: 'utf8', timeout: 30_000, shell: false }
	);
	assert.equal(child.error, undefined, child.error?.message);
	assert.equal(child.status, 0, `SSR sanitizer failed in the strict loader:\n${child.stderr}`);
	assert.match(child.stdout, /Strict-loader import and SVG preservation\/rejection checks passed/);
});
