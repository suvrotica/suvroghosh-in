import { strToU8, zipSync } from 'fflate';
import { getUmlDiagramMeta } from './catalog';
import { slugifyTitle } from './generator';
import { contentRevision, isPublicationReady, type AuthoringDiagram } from './authoring';
import { sanitizeSvg } from './plantuml/security';

const MAX_EXPORT_BYTES = 64 * 1024 * 1024;
const MAX_EXPORT_FIGURES = 28;
export const MAX_PNG_PIXELS = 16_000_000;

export interface UmlAssetPaths {
	slug: string;
	svgPublicPath: string;
	svgRepoPath: string;
	pumlPublicPath: string;
	pumlRepoPath: string;
	pngPublicPath: string;
	pngRepoPath: string;
	pngFilename: string;
}

export function getDiagramAssetPaths(
	postSlug: string,
	diagramType: string,
	diagramId?: string
): UmlAssetPaths {
	const cleanSlug = slugifyTitle(postSlug);
	const cleanType = slugifyTitle(diagramType);
	const suffix =
		diagramId && diagramId !== `uml-${diagramType}` ? `-${contentRevision(diagramId)}` : '';
	const baseName = `${cleanSlug}-${cleanType}${suffix}`;
	return {
		slug: cleanSlug,
		svgPublicPath: `/images/uml/${cleanSlug}/${baseName}.svg`,
		svgRepoPath: `static/images/uml/${cleanSlug}/${baseName}.svg`,
		pumlPublicPath: `/uml/${cleanSlug}/${baseName}.puml`,
		pumlRepoPath: `static/uml/${cleanSlug}/${baseName}.puml`,
		pngPublicPath: `/images/uml/${cleanSlug}/${baseName}.png`,
		pngRepoPath: `static/images/uml/${cleanSlug}/${baseName}.png`,
		pngFilename: `${baseName}.png`
	};
}

// HTML entities protect both quoted attributes and mdsvex/Svelte expression delimiters.
function escapeAttr(value: string): string {
	return (value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/{/g, '&#123;')
		.replace(/}/g, '&#125;')
		.replace(/\r?\n/g, ' ')
		.trim();
}

export function buildSingleDiagramBlogEmbed(diagram: AuthoringDiagram, postSlug: string): string {
	if (!isPublicationReady(diagram))
		return '<!-- Figure requires a current successful render and metadata review. -->';
	const paths = getDiagramAssetPaths(postSlug, diagram.type, diagram.id);
	const meta = getUmlDiagramMeta(diagram.type);
	const assumptionsAttr = diagram.assumptions.length
		? `\n\tassumptions="${escapeAttr(diagram.assumptions.join(' '))}"`
		: '';
	const limitationsAttr = diagram.notationLimitations.length
		? `\n\tnotationNote="${escapeAttr(diagram.notationLimitations.join(' '))}"`
		: '';
	return `<UmlFigure
	src="${paths.svgPublicPath}"
	sourceHref="${paths.pumlPublicPath}"
	diagramType="${diagram.type}"
	family="${escapeAttr(meta.familyBadge)}"
	title="${escapeAttr(diagram.title)}"
	alt="${escapeAttr(diagram.altText || diagram.title)}"
	caption="${escapeAttr(diagram.caption || diagram.explanation)}"
	conceptual={${diagram.isConceptual ? 'true' : 'false'}}${assumptionsAttr}${limitationsAttr}
/>`;
}

export function buildDiagramSectionBlogEmbed(
	diagrams: readonly AuthoringDiagram[],
	postSlug: string
): string {
	const rendered = diagrams.filter(isPublicationReady);
	if (!rendered.length) return '<!-- No reviewed, current UML diagrams available to embed. -->';
	return `## Architectural & Conceptual UML Diagrams\n\n${rendered.map((d) => buildSingleDiagramBlogEmbed(d, postSlug)).join('\n\n')}`;
}

export function buildFullPostWithUmlMarkdown(
	originalText: string,
	diagrams: readonly AuthoringDiagram[],
	postSlug: string
): string {
	// Deliberately preserve whitespace, line endings and all original source bytes.
	return `${originalText}\n\n---\n\n${buildDiagramSectionBlogEmbed(diagrams, postSlug)}\n`;
}

export interface UmlExportBundleFile {
	path: string;
	content: string;
}
export interface UmlExportParams {
	postSlug: string;
	title: string;
	originalText: string;
	diagrams: readonly AuthoringDiagram[];
	pngAssets?: Readonly<Record<string, Uint8Array>>;
}

export function buildExportBundleFiles(params: UmlExportParams): UmlExportBundleFile[] {
	if (params.diagrams.length > MAX_EXPORT_FIGURES)
		throw new Error(`Export is limited to ${MAX_EXPORT_FIGURES} figures.`);
	if (new Set(params.diagrams.map((d) => d.id)).size !== params.diagrams.length)
		throw new Error('Figure IDs must be unique before export.');
	const slug = slugifyTitle(params.postSlug || params.title);
	const files: UmlExportBundleFile[] = [];
	const entries = params.diagrams.map((diagram) => {
		const ready = isPublicationReady(diagram);
		const paths = getDiagramAssetPaths(slug, diagram.type, diagram.id);
		const draftSourcePath = `drafts/${slugifyTitle(diagram.type)}-${contentRevision(diagram.id)}.puml`;
		if (diagram.sourceCode)
			files.push({
				path: ready ? paths.pumlRepoPath : draftSourcePath,
				content: diagram.sourceCode
			});
		if (ready) files.push({ path: paths.svgRepoPath, content: sanitizeSvg(diagram.svg!) });
		return {
			id: diagram.id,
			type: diagram.type,
			title: diagram.title,
			sourceRevision: contentRevision(diagram.sourceCode),
			renderedSourceRevision: diagram.lastValidSourceCode
				? contentRevision(diagram.lastValidSourceCode)
				: null,
			publicationReady: ready,
			metadataReviewRequired: Boolean(diagram.metadataReviewRequired),
			generationStatus: diagram.generationStatus,
			validationStatus: diagram.validationStatus,
			renderStatus: diagram.renderStatus,
			error: diagram.renderError || diagram.statusReason,
			caption: diagram.caption,
			altText: diagram.altText,
			isConceptual: diagram.isConceptual,
			assumptions: diagram.assumptions,
			notationLimitations: diagram.notationLimitations,
			supportingReferences: diagram.supportingReferences,
			missingInformation: diagram.missingInformation,
			...(ready
				? {
						svgRepoPath: paths.svgRepoPath,
						svgPublicPath: paths.svgPublicPath,
						pumlRepoPath: paths.pumlRepoPath,
						pumlPublicPath: paths.pumlPublicPath,
						...(params.pngAssets?.[diagram.id]
							? { pngRepoPath: paths.pngRepoPath, pngPublicPath: paths.pngPublicPath }
							: {})
					}
				: { draftSourcePath: diagram.sourceCode ? draftSourcePath : null })
		};
	});
	files.push({ path: `${slug}-original.md`, content: params.originalText });
	files.push({
		path: 'embed-snippet.md',
		content: `${buildDiagramSectionBlogEmbed(params.diagrams, slug)}\n`
	});
	files.push({
		path: `${slug}-with-uml.md`,
		content: buildFullPostWithUmlMarkdown(params.originalText, params.diagrams, slug)
	});
	files.push({
		path: 'manifest.json',
		content: JSON.stringify(
			{
				version: 2,
				slug,
				title: params.title,
				exportedAt: new Date().toISOString(),
				inputRevision: contentRevision(params.originalText),
				originalSourcePath: `${slug}-original.md`,
				diagramCount: entries.filter((d) => d.publicationReady).length,
				draftCount: entries.filter((d) => !d.publicationReady).length,
				diagrams: entries
			},
			null,
			2
		)
	});
	return files;
}

export function buildExportZipBytes(params: UmlExportParams): Uint8Array {
	const archiveEntries: Record<string, Uint8Array> = Object.create(null);
	let size = 0;
	const add = (path: string, bytes: Uint8Array) => {
		if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').includes('..'))
			throw new Error('Unsafe export path.');
		if (archiveEntries[path]) throw new Error(`Duplicate export path: ${path}`);
		size += bytes.byteLength;
		if (size > MAX_EXPORT_BYTES)
			throw new Error('Export exceeds the 64 MiB limit. Export fewer or simpler figures.');
		archiveEntries[path] = bytes;
	};
	for (const file of buildExportBundleFiles(params)) add(file.path, strToU8(file.content));
	for (const diagram of params.diagrams.filter(isPublicationReady)) {
		const png = params.pngAssets?.[diagram.id];
		if (png)
			add(
				getDiagramAssetPaths(params.postSlug || params.title, diagram.type, diagram.id).pngRepoPath,
				png
			);
	}
	return zipSync(archiveEntries, { level: 6 });
}

/** Sequential rasterization bounds canvas memory; callers may inject a rasterizer in tests. */
export async function buildExportZipBytesWithPng(
	params: UmlExportParams,
	rasterize: (svg: string) => Promise<Uint8Array> = rasterizeSvgToPng
): Promise<Uint8Array> {
	const pngAssets: Record<string, Uint8Array> = {};
	let size = 0;
	for (const diagram of params.diagrams.filter(isPublicationReady)) {
		const bytes = await rasterize(sanitizeSvg(diagram.svg!));
		size += bytes.byteLength;
		if (size > MAX_EXPORT_BYTES) throw new Error('PNG export exceeds the 64 MiB limit.');
		pngAssets[diagram.id] = bytes;
	}
	return buildExportZipBytes({ ...params, pngAssets });
}

export function svgImageUrl(svg: string): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitizeSvg(svg))}`;
}

export async function rasterizeSvgToPng(svg: string): Promise<Uint8Array> {
	if (typeof document === 'undefined') throw new Error('PNG export requires a browser.');
	const url = URL.createObjectURL(new Blob([sanitizeSvg(svg)], { type: 'image/svg+xml' }));
	try {
		const image = new Image();
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error('PNG rendering timed out after 10 seconds.')),
				10_000
			);
			image.onload = () => {
				clearTimeout(timeout);
				resolve();
			};
			image.onerror = () => {
				clearTimeout(timeout);
				reject(new Error('Could not rasterize this SVG.'));
			};
			image.src = url;
		});
		const width = image.naturalWidth;
		const height = image.naturalHeight;
		if (!width || !height || width * height > MAX_PNG_PIXELS)
			throw new Error('SVG dimensions exceed the 16 megapixel PNG limit.');
		const scale = Math.min(
			2,
			4096 / Math.max(width, height),
			Math.sqrt(MAX_PNG_PIXELS / (width * height))
		);
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(width * scale));
		canvas.height = Math.max(1, Math.round(height * scale));
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Canvas is unavailable for PNG export.');
		context.fillStyle = '#fcfbf8';
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(value) => (value ? resolve(value) : reject(new Error('PNG encoding failed.'))),
				'image/png'
			)
		);
		canvas.width = 0;
		canvas.height = 0;
		return new Uint8Array(await blob.arrayBuffer());
	} finally {
		URL.revokeObjectURL(url);
	}
}
