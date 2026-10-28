import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { compile as compileMarkdown } from 'mdsvex';
import { compile as compileSvelte } from 'svelte/compiler';
import { renderedFixture } from './authoring-fixture';
import {
	buildExportBundleFiles,
	buildExportZipBytesWithPng,
	buildFullPostWithUmlMarkdown,
	buildSingleDiagramBlogEmbed,
	getDiagramAssetPaths
} from './export';

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
