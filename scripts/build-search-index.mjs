import fs from 'node:fs/promises';
import path from 'node:path';
import * as pagefind from 'pagefind';
import YAML from 'yaml';
import { parsePostFrontmatter } from './lib/post-metadata.mjs';

const root = process.cwd();
const postsDir = path.join(root, 'src', 'lib', 'posts');
const topicsDir = path.join(root, 'src', 'lib', 'topics');
const comicSeriesDir = path.join(root, 'src', 'lib', 'comics', 'the-last-analog-town');
const comicEpisodeDir = path.join(comicSeriesDir, 'episodes', '001-the-efficiency-inspector');
const staticDir = path.resolve(root, 'static');
const outputDir = path.resolve(staticDir, 'pagefind');
const taxonomy = JSON.parse(
	await fs.readFile(path.join(root, 'src', 'lib', 'content', 'sections.json'), 'utf8')
);

if (path.dirname(outputDir) !== staticDir) {
	throw new Error(`Refusing to write Pagefind files outside ${staticDir}`);
}

function splitMarkdownSource(source, sourceLabel) {
	const metadata = parsePostFrontmatter(source, sourceLabel);
	const match = source.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)([\s\S]*)$/);
	if (!match) throw new Error(`${sourceLabel} is missing content after its YAML frontmatter.`);
	return { metadata, body: match[1] };
}

function slugify(value = 'uncategorized') {
	return String(value)
		.toLowerCase()
		.trim()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function searchableText(markdown) {
	return markdown
		.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
		.replace(/^\s*(?:import|export)\s+.+$/gm, ' ')
		.replace(/```[^\n]*\n([\s\S]*?)```/g, ' $1 ')
		.replace(/~~~[^\n]*\n([\s\S]*?)~~~/g, ' $1 ')
		.replace(/<[A-Z][A-Za-z0-9_.:-]*(?:\s+[^<>]*)?\/>/g, ' ')
		.replace(/!\[([^\]]*)]\([^)]+\)/g, ' $1 ')
		.replace(/\[([^\]]+)]\([^)]+\)/g, ' $1 ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/[`*_>#~{}]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function stringArray(value) {
	if (Array.isArray(value))
		return value
			.map(String)
			.map((item) => item.trim())
			.filter(Boolean);
	return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

function languageCode(value) {
	const code = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 2) : 'en';
	return /^[a-z]{2}$/.test(code) ? code : 'en';
}

function topicSearchableText(metadata, body) {
	const glossary = Array.isArray(metadata.glossary)
		? metadata.glossary.flatMap((entry) => [entry?.term, entry?.definition])
		: [];
	const faqs = Array.isArray(metadata.faqs)
		? metadata.faqs.flatMap((entry) => [entry?.question, entry?.answer])
		: [];
	const contrarian = metadata.contrarianView;
	const contrarianText =
		contrarian && typeof contrarian === 'object'
			? [contrarian.heading, ...stringArray(contrarian.paragraphs)]
			: [];

	return searchableText(
		[metadata.description, body, ...glossary, ...faqs, ...contrarianText]
			.filter((value) => typeof value === 'string' && value.trim())
			.join('\n\n')
	);
}

async function redirectedSlugs() {
	const helpers = await fs.readFile(path.join(root, 'src', 'lib', 'content', 'posts.ts'), 'utf8');
	const aliases = helpers.match(/export const postPathAliases[\s\S]*?=\s*\{([\s\S]*?)\};/);
	if (!aliases) throw new Error('Could not read postPathAliases from src/lib/content/posts.ts');

	return new Set(
		Array.from(aliases[1].matchAll(/['"]([^'"]+)['"]\s*:/g)).map((match) =>
			match[1].split('/').slice(1).join('/')
		)
	);
}

async function directorySize(directory) {
	let bytes = 0;
	let files = 0;
	for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			const nested = await directorySize(entryPath);
			bytes += nested.bytes;
			files += nested.files;
		} else {
			bytes += (await fs.stat(entryPath)).size;
			files += 1;
		}
	}
	return { bytes, files };
}

const { errors: createErrors, index } = await pagefind.createIndex({
	forceLanguage: 'en',
	writePlayground: false,
	verbose: false
});

if (createErrors.length > 0 || !index) {
	throw new Error(`Pagefind index creation failed: ${createErrors.join('; ')}`);
}

try {
	const aliases = await redirectedSlugs();
	const filenames = (await fs.readdir(postsDir)).filter((file) => file.endsWith('.md')).sort();
	let indexedPosts = 0;
	let indexedTopics = 0;
	let indexedComics = 0;

	for (const filename of filenames) {
		const slug = filename.replace(/\.md$/, '');
		if (aliases.has(slug)) continue;

		const source = await fs.readFile(path.join(postsDir, filename), 'utf8');
		const { metadata, body } = splitMarkdownSource(source, filename);
		if (metadata.published === false) continue;

		const title = String(metadata.title ?? '').trim();
		const description = String(metadata.description ?? '').trim();
		const date = String(metadata.date ?? '').trim();
		const category = String(metadata.category ?? '').trim();
		const categorySlug = slugify(category);
		const sectionSlug =
			taxonomy.postSectionOverrides[slug] ?? taxonomy.legacyCategoryToSection[categorySlug];
		const section = taxonomy.sections[sectionSlug];
		const tags = stringArray(metadata.tags);
		const year = /^\d{4}/.exec(date)?.[0] ?? '';
		const timestamp = Date.parse(date);

		if (!title || !description || !date || !category || !section || tags.length === 0 || !year) {
			throw new Error(`${filename} is missing metadata required for the search index`);
		}

		const filters = {
			section: [sectionSlug],
			category: [categorySlug],
			year: [year],
			tag: tags,
			content_type: ['post']
		};
		const series = stringArray(metadata.series);
		if (series.length > 0) filters.series = series;

		const meta = {
			title,
			slug,
			description,
			category,
			category_slug: categorySlug,
			section,
			section_slug: sectionSlug,
			date,
			year,
			tags: tags.join(', '),
			content_type: 'post'
		};
		if (metadata.thumbnail) meta.image = String(metadata.thumbnail);
		if (metadata.thumbnailAlt) meta.image_alt = String(metadata.thumbnailAlt);

		const { errors } = await index.addCustomRecord({
			url: `/blog/${categorySlug}/${encodeURIComponent(slug)}`,
			content: searchableText(body),
			language: languageCode(metadata.language),
			meta,
			filters,
			sort: {
				date: Number.isNaN(timestamp) ? date : String(timestamp)
			}
		});

		if (errors.length > 0) {
			throw new Error(`${filename} could not be indexed: ${errors.join('; ')}`);
		}
		indexedPosts += 1;
	}

	const topicFilenames = (await fs.readdir(topicsDir))
		.filter((file) => file.endsWith('.md') && file.toLowerCase() !== 'readme.md')
		.sort();

	for (const filename of topicFilenames) {
		const source = await fs.readFile(path.join(topicsDir, filename), 'utf8');
		const { metadata, body } = splitMarkdownSource(source, filename);
		const title = String(metadata.title ?? '').trim();
		const slug = String(metadata.slug ?? '').trim();
		const description = String(metadata.description ?? '').trim();
		const publishedDate = String(metadata.date ?? '').trim();
		const date = String(metadata.dateModified ?? '').trim();
		const tags = stringArray(metadata.sourceTags);
		const year = /^\d{4}/.exec(date)?.[0] ?? '';
		const timestamp = Date.parse(date);

		if (!title || !slug || !description || !publishedDate || !date || tags.length === 0 || !year) {
			throw new Error(`${filename} is missing metadata required for the search index`);
		}
		if (filename !== `${slug}.md`) {
			throw new Error(`${filename} must match its Topic Headquarters slug "${slug}"`);
		}

		const { errors } = await index.addCustomRecord({
			url: `/topics/${encodeURIComponent(slug)}`,
			content: topicSearchableText(metadata, body),
			language: 'en',
			meta: {
				title,
				slug,
				description,
				date,
				date_published: publishedDate,
				year,
				tags: tags.join(', '),
				content_type: 'topic'
			},
			filters: {
				year: [year],
				tag: tags,
				content_type: ['topic']
			},
			sort: {
				date: Number.isNaN(timestamp) ? date : String(timestamp)
			}
		});

		if (errors.length > 0) {
			throw new Error(`${filename} could not be indexed: ${errors.join('; ')}`);
		}
		indexedTopics += 1;
	}

	const comicSeries = JSON.parse(
		await fs.readFile(path.join(comicSeriesDir, 'data', 'series.json'), 'utf8')
	);
	const comicCharactersSource = JSON.parse(
		await fs.readFile(path.join(comicSeriesDir, 'data', 'characters.json'), 'utf8')
	);
	const comicLocationsSource = JSON.parse(
		await fs.readFile(path.join(comicSeriesDir, 'data', 'locations.json'), 'utf8')
	);
	const comicCharacters = Array.isArray(comicCharactersSource)
		? comicCharactersSource
		: (comicCharactersSource.characters ?? comicCharactersSource.items ?? []);
	const comicLocations = Array.isArray(comicLocationsSource)
		? comicLocationsSource
		: (comicLocationsSource.locations ?? comicLocationsSource.items ?? []);
	const episodeMetadata = YAML.parse(
		await fs.readFile(path.join(comicEpisodeDir, 'episode.yaml'), 'utf8')
	);
	const compiledEpisode = JSON.parse(
		await fs.readFile(path.join(comicEpisodeDir, 'generated', 'episode.json'), 'utf8')
	);
	const runtimeEpisode =
		compiledEpisode.metadata && Array.isArray(compiledEpisode.pages)
			? compiledEpisode
			: compiledEpisode.data;
	if (!runtimeEpisode?.metadata || !Array.isArray(runtimeEpisode.pages)) {
		throw new Error('Compiled Comic episode is missing metadata or pages.');
	}
	const runtimeMetadata = runtimeEpisode.metadata ?? episodeMetadata;
	const comicDate = String(runtimeMetadata.dateModified ?? runtimeMetadata.date);
	const comicYear = /^\d{4}/.exec(comicDate)?.[0] ?? '';
	const comicTimestamp = Date.parse(comicDate);
	const characterNames = comicCharacters.map((character) => character.name).filter(Boolean);
	const locationNames = comicLocations.map((location) => location.name).filter(Boolean);
	const seriesTags = [
		'Comic',
		'The Last Analog Town',
		'Golmohar Junction',
		...(comicSeries.themes ?? [])
	];

	const { errors: seriesErrors } = await index.addCustomRecord({
		url: comicSeries.routes.series,
		content: searchableText(
			[
				comicSeries.description,
				comicSeries.setting?.notRealPlaceStatement,
				...(comicSeries.themes ?? []),
				...characterNames,
				...locationNames
			].join('\n')
		),
		language: 'en',
		meta: {
			title: comicSeries.title,
			slug: comicSeries.id,
			description: comicSeries.description,
			category: 'Comic',
			category_slug: 'comic',
			section: 'Comic',
			date: comicDate,
			year: comicYear,
			tags: seriesTags.join(', '),
			content_type: 'comic-series',
			content_label: 'Comic series',
			production_status: comicSeries.publication?.status ?? 'unpublished'
		},
		filters: {
			category: ['comic'],
			year: [comicYear],
			tag: seriesTags,
			content_type: ['comic-series']
		},
		sort: {
			date: Number.isNaN(comicTimestamp) ? comicDate : String(comicTimestamp)
		}
	});
	if (seriesErrors.length > 0) {
		throw new Error(`Comic series could not be indexed: ${seriesErrors.join('; ')}`);
	}
	indexedComics += 1;

	if (runtimeMetadata.published || runtimeMetadata.productionPreview) {
		const transcriptText = (runtimeEpisode.pages ?? []).flatMap((page) =>
			(page.panels ?? []).flatMap((panel) => [
				panel.action,
				panel.accessibility?.description,
				panel.caption,
				panel.visualJoke,
				...(panel.overlays ?? []).map((overlay) => overlay.text),
				...(panel.dialogue ?? []).map((dialogue) => `${dialogue.speaker}: ${dialogue.text}`),
				...(panel.soundEffects ?? []).flatMap((effect) => [effect.text, effect.description])
			])
		);
		const productionEndMatter = runtimeEpisode.frontMatter?.productionEndMatter ?? {};
		const endMatterText = [
			productionEndMatter.heading,
			productionEndMatter.publicEditionText,
			productionEndMatter.hybridRulesHeading,
			...(productionEndMatter.hybridRules ?? []),
			productionEndMatter.secondAlbumPromise
		];
		const episodeTags = stringArray(runtimeMetadata.tags);
		const { errors: episodeErrors } = await index.addCustomRecord({
			url: runtimeMetadata.canonicalPath,
			content: searchableText(
				[
					runtimeMetadata.description,
					...(comicSeries.themes ?? []),
					...characterNames,
					...locationNames,
					...transcriptText,
					...endMatterText
				]
					.filter(Boolean)
					.join('\n')
			),
			language: languageCode(runtimeMetadata.language),
			meta: {
				title: runtimeMetadata.title,
				slug: runtimeMetadata.slug,
				description: runtimeMetadata.description,
				category: 'Comic',
				category_slug: 'comic',
				section: 'Comic',
				date: runtimeMetadata.date,
				year: /^\d{4}/.exec(runtimeMetadata.date)?.[0] ?? comicYear,
				tags: episodeTags.join(', '),
				content_type: 'comic-episode',
				content_label: 'Comic episode',
				production_status: runtimeMetadata.published ? 'published' : 'production preview'
			},
			filters: {
				category: ['comic'],
				year: [/^\d{4}/.exec(runtimeMetadata.date)?.[0] ?? comicYear],
				tag: episodeTags,
				content_type: ['comic-episode']
			},
			sort: {
				date: Number.isNaN(Date.parse(runtimeMetadata.date))
					? runtimeMetadata.date
					: String(Date.parse(runtimeMetadata.date))
			}
		});
		if (episodeErrors.length > 0) {
			throw new Error(`Comic episode could not be indexed: ${episodeErrors.join('; ')}`);
		}
		indexedComics += 1;
	}

	await fs.rm(outputDir, { recursive: true, force: true });
	const { errors: writeErrors } = await index.writeFiles({ outputPath: outputDir });
	if (writeErrors.length > 0) {
		throw new Error(`Pagefind output failed: ${writeErrors.join('; ')}`);
	}

	const size = await directorySize(outputDir);
	console.log(
		`Pagefind: indexed ${indexedPosts} posts, ${indexedTopics} Topic Headquarters, and ${indexedComics} comic records into ${size.files} files (${(size.bytes / 1024).toFixed(1)} KiB).`
	);
} finally {
	await index.deleteIndex();
	await pagefind.close();
}
