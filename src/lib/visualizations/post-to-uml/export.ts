import { strToU8, zipSync } from 'fflate';
import { getUmlDiagramMeta } from './catalog';
import { slugifyTitle } from './generator';
import type { UmlDiagramRecord } from './types';

export interface UmlAssetPaths {
	slug: string;
	svgPublicPath: string;
	svgRepoPath: string;
	pumlPublicPath: string;
	pumlRepoPath: string;
	pngFilename: string;
}

export function getDiagramAssetPaths(postSlug: string, diagramType: string): UmlAssetPaths {
	const cleanSlug = slugifyTitle(postSlug);
	const cleanType = diagramType.toLowerCase().replace(/[^a-z0-9-]/g, '-');
	const baseName = `${cleanSlug}-${cleanType}`;
	return {
		slug: cleanSlug,
		svgPublicPath: `/images/uml/${cleanSlug}/${baseName}.svg`,
		svgRepoPath: `static/images/uml/${cleanSlug}/${baseName}.svg`,
		pumlPublicPath: `/uml/${cleanSlug}/${baseName}.puml`,
		pumlRepoPath: `static/uml/${cleanSlug}/${baseName}.puml`,
		pngFilename: `${baseName}.png`
	};
}

function escapeAttr(value: string): string {
	return (value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ').trim();
}

export function buildSingleDiagramBlogEmbed(diagram: UmlDiagramRecord, postSlug: string): string {
	const paths = getDiagramAssetPaths(postSlug, diagram.type);
	const meta = getUmlDiagramMeta(diagram.type);
	const assumptionsAttr =
		diagram.assumptions.length > 0
			? `\n\tassumptions="${escapeAttr(diagram.assumptions.join(' '))}"`
			: '';
	const limitationsAttr =
		diagram.notationLimitations.length > 0
			? `\n\tnotationNote="${escapeAttr(diagram.notationLimitations[0])}"`
			: '';

	return `<UmlFigure
	src="${paths.svgPublicPath}"
	sourceHref="${paths.pumlPublicPath}"
	diagramType="${diagram.type}"
	family="${meta.familyBadge}"
	title="${escapeAttr(diagram.title)}"
	alt="${escapeAttr(diagram.altText || diagram.title)}"
	caption="${escapeAttr(diagram.caption || diagram.explanation)}"
	conceptual={${diagram.isConceptual ? 'true' : 'false'}}${assumptionsAttr}${limitationsAttr}
	sourceCode={${JSON.stringify(diagram.sourceCode)}}
/>`;
}

export function buildDiagramSectionBlogEmbed(
	diagrams: readonly UmlDiagramRecord[],
	postSlug: string
): string {
	const rendered = diagrams.filter(
		(d) => d.generationStatus === 'generated' && d.renderStatus === 'rendered'
	);
	if (rendered.length === 0) {
		return '<!-- No rendered UML diagrams available to embed. -->';
	}

	const embeds = rendered.map((d) => buildSingleDiagramBlogEmbed(d, postSlug)).join('\n\n');
	return `## Architectural & Conceptual UML Diagrams\n\n${embeds}`;
}

export function buildFullPostWithUmlMarkdown(
	originalText: string,
	diagrams: readonly UmlDiagramRecord[],
	postSlug: string
): string {
	const trimmedPost = (originalText ?? '').trim();
	const embedSection = buildDiagramSectionBlogEmbed(diagrams, postSlug);
	return `${trimmedPost}\n\n---\n\n${embedSection}\n`;
}

export interface UmlExportBundleFile {
	path: string;
	content: string;
}

export function buildExportBundleFiles(params: {
	postSlug: string;
	title: string;
	originalText: string;
	diagrams: readonly UmlDiagramRecord[];
}): UmlExportBundleFile[] {
	const cleanSlug = slugifyTitle(params.postSlug || params.title);
	const files: UmlExportBundleFile[] = [];

	const renderedDiagrams = params.diagrams.filter(
		(d) => d.generationStatus === 'generated' && d.renderStatus === 'rendered' && d.svg
	);

	for (const diagram of renderedDiagrams) {
		const paths = getDiagramAssetPaths(cleanSlug, diagram.type);
		files.push({
			path: paths.pumlRepoPath,
			content: `${diagram.sourceCode.trim()}\n`
		});
		if (diagram.svg) {
			files.push({
				path: paths.svgRepoPath,
				content: diagram.svg
			});
		}
	}

	const embedSnippet = buildDiagramSectionBlogEmbed(renderedDiagrams, cleanSlug);
	const fullMarkdown = buildFullPostWithUmlMarkdown(
		params.originalText,
		renderedDiagrams,
		cleanSlug
	);

	files.push({
		path: 'embed-snippet.md',
		content: `${embedSnippet}\n`
	});
	files.push({
		path: `${cleanSlug}-with-uml.md`,
		content: fullMarkdown
	});
	files.push({
		path: 'manifest.json',
		content: JSON.stringify(
			{
				slug: cleanSlug,
				title: params.title,
				exportedAt: new Date().toISOString(),
				diagramCount: renderedDiagrams.length,
				diagrams: renderedDiagrams.map((d) => {
					const paths = getDiagramAssetPaths(cleanSlug, d.type);
					return {
						id: d.id,
						type: d.type,
						title: d.title,
						caption: d.caption,
						altText: d.altText,
						isConceptual: d.isConceptual,
						svgRepoPath: paths.svgRepoPath,
						svgPublicPath: paths.svgPublicPath,
						pumlRepoPath: paths.pumlRepoPath,
						pumlPublicPath: paths.pumlPublicPath
					};
				})
			},
			null,
			2
		)
	});

	return files;
}

export function buildExportZipBytes(params: {
	postSlug: string;
	title: string;
	originalText: string;
	diagrams: readonly UmlDiagramRecord[];
}): Uint8Array {
	const files = buildExportBundleFiles(params);
	const archiveEntries: Record<string, Uint8Array> = {};
	for (const file of files) {
		archiveEntries[file.path] = strToU8(file.content);
	}
	return zipSync(archiveEntries, { level: 6 });
}
