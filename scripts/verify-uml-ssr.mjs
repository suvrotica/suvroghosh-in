import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import { build, loadConfigFromFile } from 'vite';

const root = process.cwd();
const output = path.join(root, '.tmp/uml-ssr');
const loaded = await loadConfigFromFile(
	{ command: 'build', mode: 'production' },
	path.join(root, 'vite.config.ts')
);
assert.ok(loaded, 'The application Vite configuration must load.');

const entry = 'virtual:uml-ssr-runtime-probe';
const unsafeSource = ['@startuml', '!includeurl https://example.invalid', '@enduml'].join('\n');
const source = path
	.join(root, 'src/lib/visualizations/post-to-uml/plantuml/security.ts')
	.replaceAll('\\', '/');
const result = await build({
	configFile: false,
	root,
	logLevel: 'warn',
	ssr: loaded.config.ssr,
	plugins: [
		{
			name: 'uml-ssr-runtime-probe',
			resolveId(id) {
				if (id === entry) return `\0${entry}`;
			},
			load(id) {
				if (id !== `\0${entry}`) return;
				return `
import assert from 'node:assert/strict';
import { sanitizeSvg, checkPlantUmlSecurity } from ${JSON.stringify(source)};
const safe = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>bad()</script><text>Safe label</text></svg>');
assert.match(safe, /Safe label/);
assert.ok(safe.includes('xmlns="http://www.w3.org/2000/svg"'));
assert.doesNotMatch(safe, /onload|script/);
assert.ok(!safe.includes('bad()'));
assert.equal(checkPlantUmlSecurity(${JSON.stringify(unsafeSource)}).safe, false);
console.log('Restricted Node loader: sanitizer import and safety boundaries passed.');
`;
			}
		}
	],
	build: {
		ssr: true,
		outDir: output,
		emptyOutDir: true,
		minify: false,
		rollupOptions: { input: entry, output: { entryFileNames: 'probe.mjs' } }
	}
});

// A bare external would resolve from the output root and could select a different,
// hoisted dependency version. Keep the sanitizer's locked closure in the bundle.
for (const bundle of Array.isArray(result) ? result : [result]) {
	for (const chunk of bundle.output) {
		if (chunk.type !== 'chunk') continue;
		for (const dependency of [...chunk.imports, ...chunk.dynamicImports]) {
			assert.ok(isBuiltin(dependency), `Unexpected external sanitizer dependency: ${dependency}`);
		}
	}
}

// The Vercel loader rejected CommonJS require(ESM), although normal local Node
// permits it. Exercise that stricter boundary rather than merely importing locally.
execFileSync(
	process.execPath,
	['--no-experimental-require-module', path.join(output, 'probe.mjs')],
	{
		stdio: 'inherit'
	}
);
