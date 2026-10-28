import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { compile as compileMarkdown } from 'mdsvex';
import { compile as compileSvelte, parse } from 'svelte/compiler';
import { renderedFixture } from './authoring-fixture';
import {
	buildExportBundleFiles,
	buildExportZipBytesWithPng,
	buildFullPostWithUmlMarkdown,
	buildSingleDiagramBlogEmbed,
	getDiagramAssetPaths
} from './export';

const metadataAttributes = ['title', 'alt', 'caption', 'assumptions', 'notationNote'] as const;

function diagramWithMetadata(value: string) {
	return {
		...renderedFixture(),
		title: value,
		explanation: value,
		caption: value,
		altText: value,
		assumptions: [value],
		notationLimitations: [value]
	};
}

async function compiledMetadata(markdown: string) {
	const result = await compileMarkdown(markdown);
	if (!result) throw new Error('MDsveX did not produce a component.');
	// Exercise the actual authoring pipeline, then inspect the expression boundary.
	compileSvelte(result.code, { filename: 'uml-export-fixture.svelte', generate: 'server' });
	const ast = parse(result.code, { modern: true });
	expect(ast.instance).toBeUndefined();
	expect(ast.module).toBeUndefined();
	const figure = ast.fragment.nodes.find(
		(node) => node.type === 'Component' && node.name === 'UmlFigure'
	);
	if (!figure || figure.type !== 'Component') throw new Error('Missing UML figure.');
	expect(
		figure.attributes.some(
			(attribute) => attribute.type === 'Attribute' && attribute.name === 'sourceCode'
		)
	).toBe(false);
	return Object.fromEntries(
		metadataAttributes.map((name) => {
			const attribute = figure.attributes.find(
				(candidate) => candidate.type === 'Attribute' && candidate.name === name
			);
			if (!attribute || attribute.type !== 'Attribute' || !Array.isArray(attribute.value)) {
				throw new Error(`Missing quoted ${name} attribute.`);
			}
			const text = attribute.value
				.map((part) => {
					// An ExpressionTag here would execute when an author compiles the export.
					expect(part.type, name).toBe('Text');
					if (part.type !== 'Text') throw new Error(`${name} contains an expression.`);
					return part.data;
				})
				.join('');
			return [name, text];
		})
	);
}

describe('publication exports', () => {
	it('preserves every character of original text and retains unfinished source as a draft', () => {
		const originalText = '\r\n  # বাংলা article\r\n\r\nText.  \r\n\r\n';
		const ready = renderedFixture();
		const draft = {
			...ready,
			id: 'draft',
			sourceCode: '@startuml\nbroken',
			renderStatus: 'error' as const
		};
		const files = buildExportBundleFiles({
			postSlug: 'post',
			title: 'Article',
			originalText,
			diagrams: [ready, draft]
		});
		expect(files.find((file) => file.path === 'post-original.md')?.content).toBe(originalText);
		expect(
			buildFullPostWithUmlMarkdown(originalText, [ready], 'post').startsWith(originalText)
		).toBe(true);
		expect(files.filter((file) => file.path.endsWith('.svg'))).toHaveLength(1);
		expect(files.find((file) => file.path.startsWith('drafts/'))?.content).toBe(draft.sourceCode);
		const manifest = JSON.parse(files.find((file) => file.path === 'manifest.json')!.content);
		expect(manifest.diagramCount).toBe(1);
		expect(manifest.draftCount).toBe(1);
		expect(manifest.diagrams[1].publicationReady).toBe(false);
		expect(manifest.diagrams[1].svgRepoPath).toBeUndefined();
	});

	it('prevents stale images and unreviewed metadata from entering embeds', () => {
		const diagram = renderedFixture();
		expect(
			buildSingleDiagramBlogEmbed({ ...diagram, sourceCode: 'new source' }, 'post')
		).not.toContain('<UmlFigure');
		expect(
			buildSingleDiagramBlogEmbed({ ...diagram, metadataReviewRequired: true }, 'post')
		).not.toContain('<UmlFigure');
	});

	it('produces safe component attributes that compile through mdsvex and Svelte', async () => {
		const diagram = {
			...renderedFixture(),
			title: '" {globalThis.bad()} <script> &',
			caption: '{danger} " <tag>'
		};
		const embed = buildSingleDiagramBlogEmbed(diagram, 'post');
		expect(embed).toContain('&quot;');
		expect(embed).toContain('&#123;globalThis.bad()&#125;');
		expect(embed).not.toContain('sourceCode={');
		const compiled = await compileMarkdown(embed);
		expect(compiled).toBeDefined();
		expect(() => compileSvelte(compiled!.code, { generate: 'server' })).not.toThrow();
	});

	it('uses safe distinct paths for multiple figures of the same concrete type', () => {
		const first = getDiagramAssetPaths('../../unsafe\\name', 'class', 'one');
		const second = getDiagramAssetPaths('../../unsafe\\name', 'class', 'two');
		expect(first.svgRepoPath).not.toContain('..');
		expect(first.svgRepoPath).not.toContain('\\');
		expect(first.svgRepoPath).not.toBe(second.svgRepoPath);
	});

	it('packages sequential PNGs and makes all manifest image paths resolve in the archive', async () => {
		const diagram = renderedFixture();
		const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
		const archive = unzipSync(
			await buildExportZipBytesWithPng(
				{ postSlug: 'post', title: 'Post', originalText: 'Original', diagrams: [diagram] },
				async () => png
			)
		);
		const manifest = JSON.parse(strFromU8(archive['manifest.json']));
		const entry = manifest.diagrams[0];
		expect(archive[entry.pngRepoPath]).toEqual(png);
		expect(strFromU8(archive[entry.pumlRepoPath])).toBe(diagram.sourceCode);
		expect(strFromU8(archive[entry.svgRepoPath])).toContain('Patient');
		expect(entry.sourceRevision).toBe(entry.renderedSourceRevision);
	});

	it('rejects duplicate IDs before building an ambiguous archive', () => {
		const diagram = renderedFixture();
		expect(() =>
			buildExportBundleFiles({
				postSlug: 'post',
				title: 'Post',
				originalText: '',
				diagrams: [diagram, diagram]
			})
		).toThrow('IDs must be unique');
	});
});

describe('UML Markdown export metadata', () => {
	it.each([
		'{globalThis.__umlExportProbe += 1}',
		'Quotation " and apostrophe \' with \\path\\name &amp; &#123; &#x7b; {7 * 7}',
		'"><script>globalThis.__umlExportProbe += 1</script><UmlFigure title="',
		'<!-- comment --> </UmlFigure> <img src=x onerror={7 * 7}> ${literal}'
	])('keeps adversarial metadata as literal text through MDsveX and Svelte: %s', async (value) => {
		const embed = buildSingleDiagramBlogEmbed(diagramWithMetadata(value), 'safe-export');
		const metadata = await compiledMetadata(embed);
		for (const name of metadataAttributes) expect(metadata[name]).toBe(value);
	});

	it('preserves normal Unicode and backslashes while retaining single-line attribute formatting', async () => {
		const value = '  বাংলা \\diagram "A"\r\nnext line  ';
		const metadata = await compiledMetadata(
			buildSingleDiagramBlogEmbed(diagramWithMetadata(value), 'safe-export')
		);
		for (const name of metadataAttributes) {
			expect(metadata[name]).toBe('বাংলা \\diagram "A" next line');
		}
	});

	it('protects both derived Markdown files and caption/alt fallbacks without rewriting the original', async () => {
		const value = '{globalThis.__umlExportProbe += 1} "quoted"';
		const diagram = diagramWithMetadata(value);
		diagram.caption = '';
		diagram.altText = '';
		const originalText = '# Original article\n\nAn unchanged paragraph.';
		const files = buildExportBundleFiles({
			postSlug: 'safe-export',
			title: 'Safe export',
			originalText,
			diagrams: [diagram]
		});
		expect(files.find((file) => file.path === 'safe-export-original.md')?.content).toBe(
			originalText
		);
		const markdown = files.filter(
			(file) => file.path.endsWith('.md') && !file.path.endsWith('-original.md')
		);
		expect(markdown).toHaveLength(2);
		for (const file of markdown) {
			const metadata = await compiledMetadata(file.content);
			for (const name of metadataAttributes) expect(metadata[name]).toBe(value);
		}
	});
});
