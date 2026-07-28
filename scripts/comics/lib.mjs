import crypto from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseDocument, stringify as stringifyYaml } from 'yaml';

export const COMIC_PANEL_STATUSES = [
	'missing',
	'draft',
	'needs-review',
	'approved',
	'rejected',
	'final'
];

export const COMIC_BALLOON_STYLES = [
	'speech',
	'thought',
	'whisper',
	'robot',
	'system',
	'off-panel'
];

const COMIC_PAGE_SIZES = ['small', 'medium', 'wide', 'tall', 'half-page', 'splash'];
const PANEL_COUNT_MIN = 4;
const PANEL_COUNT_MAX = 9;
const PROMPT_VARIANT_LIMIT = 5;
const WEB_EXPORT_WIDTHS = [640, 1280];
const WEB_PROMOTION_PANEL_COUNT = 338;
const STRUCTURED_EXTENSIONS = new Set(['.json', '.yaml', '.yml']);
const RASTER_EXTENSIONS = new Set([
	'.avif',
	'.gif',
	'.jpeg',
	'.jpg',
	'.png',
	'.tif',
	'.tiff',
	'.webp'
]);
const SUPERSEDED_CANON = [
	{ pattern: /\bBellwether\b/gi, label: 'Bellwether' },
	{ pattern: /\bMira Dutta\b/gi, label: 'Mira Dutta' },
	{ pattern: /\bPiku Sen\b/gi, label: 'Piku Sen' }
];
const NAMED_IMITATION_PATTERN =
	/\b(?:in\s+the\s+style\s+of|drawn\s+(?:like|as)|copy(?:ing)?(?:\s+the\s+style\s+of)?|imitat(?:e|ing)\s+)(?:Herg[eé]|Albert\s+Uderzo|Uderzo|Disney|Pixar|Tintin|Ast[eé]rix)\b/gi;
const NAMED_REFERENCE_PATTERN =
	/\b(?:Herg[eé]|Albert\s+Uderzo|Uderzo|Disney|Pixar|Tintin|Ast[eé]rix)\b/gi;
const REQUIRED_NEGATIVE_GUIDANCE = [
	'embedded dialogue or lettering',
	'speech balloons',
	'watermarks',
	'signatures',
	'copyrighted logos',
	'extra limbs'
];
const HUMAN_CULTURAL_CHECKLIST = [
	'No real locality is used in a defamatory fictional role.',
	'Caste and religious identities are neither stereotype nor decorative shorthand.',
	'Class difference is observed without contempt or mockery of poverty.',
	'Gender, disability, age, skin tone, and accents are not punchlines.',
	'Residents are not portrayed as uniformly irrational.',
	'Foreign characters are not portrayed as uniformly cold, superior, or culturally neutral.',
	'Technology is shown as locally produced and adopted where the story requires it.',
	'Calcutta is not reduced to traffic, dirt, crowds, and picturesque disorder.',
	'Religious and political symbols appear only for a narrative reason.',
	'Bengali details are not mixed with unrelated Indian cultural details.',
	'Clothing, architecture, food, and transport are plausible for fictional Greater Calcutta.',
	'Every Bengali sign uses correct Unicode text and has a named human reviewer and review date.',
	'Political symbols remain fictional where party neutrality is intended.',
	'Jokes remain legible without knowledge of a transient current controversy.',
	'The target of every harsh joke is clear and is not the ordinary victim of the system.'
];

const METADATA_KEYS = new Set([
	'id',
	'slug',
	'seriesId',
	'seriesSlug',
	'title',
	'subtitle',
	'description',
	'category',
	'tags',
	'date',
	'dateModified',
	'published',
	'productionPreview',
	'storyPageCount',
	'readingDirection',
	'language',
	'contentGuidance',
	'credits',
	'canonicalPath',
	'transcriptPath',
	'printPath',
	'cover',
	'coverAlt'
]);

const PAGE_KEYS = new Set([
	'page',
	'title',
	'purpose',
	'location',
	'time',
	'layout',
	'panelCount',
	'dialogueGoal',
	'pageTurn',
	'visualMotif',
	'continuity',
	'panels'
]);

const PANEL_KEYS = new Set([
	'id',
	'panel',
	'size',
	'aspectRatio',
	'camera',
	'location',
	'time',
	'characters',
	'props',
	'foreground',
	'middleGround',
	'background',
	'action',
	'dialogue',
	'caption',
	'soundEffects',
	'visualJoke',
	'continuity',
	'prompt',
	'accessibility',
	'art'
]);

const CHARACTER_BEAT_KEYS = new Set(['id', 'position', 'emotion', 'pose', 'facing']);
const DIALOGUE_KEYS = new Set([
	'id',
	'speaker',
	'text',
	'style',
	'readingOrder',
	'narrationOrder',
	'balloon'
]);
const BALLOON_KEYS = new Set([
	'x',
	'y',
	'width',
	'height',
	'z',
	'tailTarget',
	'tailDirection',
	'fontScale',
	'manualBreaks'
]);
const PROMPT_KEYS = new Set(['lighting', 'palette', 'composition', 'balloonSafeAreas', 'negative']);
const ACCESSIBILITY_KEYS = new Set(['alt', 'description']);
const ART_KEYS = new Set(['status', 'revision', 'source', 'final', 'width', 'height', 'anchor']);
const ART_ANCHORS = new Set(['top', 'center', 'bottom']);
const SOUND_EFFECT_KEYS = new Set(['text', 'description', 'narrationOrder', 'position']);
const SOUND_EFFECT_POSITION_KEYS = new Set(['x', 'y', 'z']);
const NORMALIZED_POINT_KEYS = new Set(['x', 'y']);
const TEXT_OVERLAY_PLACEMENT_KEYS = new Set([
	'panelId',
	'x',
	'y',
	'width',
	'height',
	'kind',
	'textVariant'
]);
const BALLOON_TAIL_DIRECTIONS = ['up', 'down', 'left', 'right', 'none'];
const LETTERING_GEOMETRY_FORMAT = 'suvroghosh-comic-lettering-geometry';
const LETTERING_GEOMETRY_VERSION = 1;
const LETTERING_GEOMETRY_KEYS = new Set(['format', 'formatVersion', 'panels']);
const LETTERING_PANEL_STATUSES = new Set(['needs-review', 'approved']);
const LETTERING_PANEL_KEYS = new Set(['status', 'speakerAnchors', 'protectedZones']);
const LETTERING_ZONE_KEYS = new Set([
	'id',
	'kind',
	'characterId',
	'x',
	'y',
	'width',
	'height',
	'padding',
	'protect'
]);
const LETTERING_ZONE_KINDS = new Set(['face', 'body', 'critical-prop', 'no-balloon', 'no-tail']);
const LETTERING_ZONE_PROTECTIONS = new Set(['balloon', 'tail', 'both']);

export class ComicToolError extends Error {
	constructor(message, details = []) {
		super(message);
		this.name = 'ComicToolError';
		this.details = details;
	}
}

export function parseCliArgs(argv = process.argv.slice(2)) {
	const options = { _: [] };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (!argument.startsWith('--')) {
			options._.push(argument);
			continue;
		}

		const equals = argument.indexOf('=');
		if (equals > 2) {
			options[argument.slice(2, equals)] = argument.slice(equals + 1);
			continue;
		}

		const key = argument.slice(2);
		const next = argv[index + 1];
		if (next !== undefined && !next.startsWith('--')) {
			options[key] = next;
			index += 1;
		} else {
			options[key] = true;
		}
	}
	return options;
}

export function requireCliOption(options, key, usage) {
	const value = options[key];
	if (typeof value !== 'string' || value.trim() === '') {
		throw new ComicToolError(
			`Missing required --${key} option.${usage ? `\nUsage: ${usage}` : ''}`
		);
	}
	return value.trim();
}

export function positiveIntegerOption(value, fallback, label) {
	if (value === undefined || value === false) return fallback;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new ComicToolError(`${label} must be a positive integer.`);
	}
	return parsed;
}

export function slugify(value) {
	return String(value)
		.normalize('NFKD')
		.toLocaleLowerCase('en')
		.replace(/[’']/g, '')
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export function pad(value, width = 3) {
	return String(value).padStart(width, '0');
}

export function sha256(value) {
	return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalize(value) {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort((left, right) => left.localeCompare(right, 'en'))
			.map((key) => [key, canonicalize(value[key])])
	);
}

export function stableJson(value) {
	return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function normalizeNewlines(value) {
	return String(value).replace(/\r\n?/g, '\n');
}

function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
	return typeof value === 'string' && value.trim() !== '' && value === value.trim();
}

function isCalendarDate(value) {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function pathExists(filename) {
	try {
		await fs.access(filename);
		return true;
	} catch {
		return false;
	}
}

async function readUtf8(filename) {
	return normalizeNewlines(await fs.readFile(filename, 'utf8'));
}

export async function readStructuredFile(filename) {
	const extension = path.extname(filename).toLocaleLowerCase('en');
	const source = await readUtf8(filename);
	if (extension === '.json') {
		try {
			return { value: JSON.parse(source), source };
		} catch (error) {
			throw new ComicToolError(
				`${filename} contains invalid JSON: ${error instanceof Error ? error.message : error}`
			);
		}
	}
	if (extension !== '.yaml' && extension !== '.yml') {
		throw new ComicToolError(`${filename} is not a supported YAML or JSON source.`);
	}

	const document = parseDocument(source, {
		prettyErrors: true,
		strict: true,
		uniqueKeys: true
	});
	const issues = [...document.errors, ...document.warnings];
	if (issues.length > 0) {
		throw new ComicToolError(
			`${filename} contains invalid YAML: ${issues.map((issue) => issue.message).join('; ')}`
		);
	}
	const value = document.toJS();
	if (value === undefined) {
		throw new ComicToolError(`${filename} is empty.`);
	}
	return { value, source };
}

export async function writeFileIfChanged(filename, value) {
	const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
	try {
		const current = await fs.readFile(filename);
		if (current.equals(bytes)) return false;
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error;
	}
	await fs.mkdir(path.dirname(filename), { recursive: true });
	await fs.writeFile(filename, bytes);
	return true;
}

function toPosix(value) {
	return value.split(path.sep).join('/');
}

function relativeToRoot(root, filename) {
	const relative = path.relative(root, filename);
	return toPosix(relative || '.');
}

async function structuredFiles(directory) {
	if (!(await pathExists(directory))) return [];
	const entries = await fs.readdir(directory, { withFileTypes: true });
	return entries
		.filter(
			(entry) =>
				entry.isFile() &&
				STRUCTURED_EXTENSIONS.has(path.extname(entry.name).toLocaleLowerCase('en'))
		)
		.map((entry) => path.join(directory, entry.name))
		.sort((left, right) => left.localeCompare(right, 'en'));
}

async function resolveEpisodeByMetadata(episodesDirectory, episode) {
	if (!(await pathExists(episodesDirectory))) return [];
	const entries = await fs.readdir(episodesDirectory, { withFileTypes: true });
	const matches = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
		if (!entry.isDirectory()) continue;
		const directory = path.join(episodesDirectory, entry.name);
		const metadataFile = path.join(directory, 'episode.yaml');
		if (!(await pathExists(metadataFile))) continue;
		if (entry.name === episode || entry.name.startsWith(`${episode}-`)) {
			matches.push(directory);
			continue;
		}
		try {
			const { value } = await readStructuredFile(metadataFile);
			if (value?.id === episode || value?.slug === episode) matches.push(directory);
		} catch {
			// The source loader will report malformed metadata after a directory is selected.
		}
	}
	return matches;
}

export async function resolveEpisodeContext({
	root = process.cwd(),
	series = 'the-last-analog-town',
	episode = '001',
	episodeDir
} = {}) {
	const repositoryRoot = path.resolve(root);
	let resolvedEpisodeDirectory;
	if (episodeDir) {
		resolvedEpisodeDirectory = path.resolve(repositoryRoot, episodeDir);
	} else {
		const directCandidate = path.resolve(repositoryRoot, episode);
		if (await pathExists(path.join(directCandidate, 'episode.yaml'))) {
			resolvedEpisodeDirectory = directCandidate;
		} else {
			const episodesDirectory = path.join(
				repositoryRoot,
				'src',
				'lib',
				'comics',
				series,
				'episodes'
			);
			const matches = await resolveEpisodeByMetadata(episodesDirectory, String(episode));
			if (matches.length === 0) {
				throw new ComicToolError(
					`Could not find comic episode "${episode}" under ${relativeToRoot(repositoryRoot, episodesDirectory)}.`
				);
			}
			if (matches.length > 1) {
				throw new ComicToolError(
					`Episode selector "${episode}" is ambiguous: ${matches
						.map((match) => relativeToRoot(repositoryRoot, match))
						.join(', ')}.`
				);
			}
			[resolvedEpisodeDirectory] = matches;
		}
	}

	const metadataFile = path.join(resolvedEpisodeDirectory, 'episode.yaml');
	if (!(await pathExists(metadataFile))) {
		throw new ComicToolError(
			`Comic episode directory ${resolvedEpisodeDirectory} has no episode.yaml.`
		);
	}
	const episodesDirectory = path.dirname(resolvedEpisodeDirectory);
	const seriesDirectory = path.dirname(episodesDirectory);
	return {
		root: repositoryRoot,
		seriesDirectory,
		episodesDirectory,
		episodeDirectory: resolvedEpisodeDirectory,
		metadataFile,
		pagesDirectory: path.join(resolvedEpisodeDirectory, 'script', 'pages'),
		letteringGeometryFile: path.join(resolvedEpisodeDirectory, 'lettering', 'geometry.yaml')
	};
}

function mergeDataRecord(data, key, value, source, sourceMap) {
	if (Object.hasOwn(data, key)) {
		throw new ComicToolError(
			`Comic data key "${key}" is defined more than once (${sourceMap.get(key)} and ${source}).`
		);
	}
	data[key] = value;
	sourceMap.set(key, source);
}

async function loadDataDirectories(context) {
	const data = {};
	const sourceMap = new Map();
	const sources = [];
	for (const directory of [
		path.join(context.seriesDirectory, 'data'),
		path.join(context.episodeDirectory, 'data')
	]) {
		for (const filename of await structuredFiles(directory)) {
			const key = path.basename(filename, path.extname(filename));
			const parsed = await readStructuredFile(filename);
			mergeDataRecord(data, key, parsed.value, relativeToRoot(context.root, filename), sourceMap);
			sources.push({ filename, source: parsed.source });
		}
	}
	return { data, sources };
}

async function loadPageSources(context) {
	if (!(await pathExists(context.pagesDirectory))) return { pages: [], sources: [] };
	const entries = await fs.readdir(context.pagesDirectory, { withFileTypes: true });
	const pageFiles = entries
		.filter((entry) => entry.isFile() && /^page-\d{3}\.ya?ml$/i.test(entry.name))
		.map((entry) => path.join(context.pagesDirectory, entry.name))
		.sort((left, right) => left.localeCompare(right, 'en'));
	const pages = [];
	const sources = [];
	for (const filename of pageFiles) {
		const parsed = await readStructuredFile(filename);
		pages.push(parsed.value);
		sources.push({ filename, source: parsed.source, page: parsed.value });
	}
	return { pages, sources };
}

function exceptionReason(exceptions, pageNumber) {
	const panelCounts = exceptions?.panelCounts ?? exceptions?.panelCountExceptions;
	if (Array.isArray(panelCounts)) {
		const match = panelCounts.find((entry) => Number(entry?.page) === pageNumber);
		return isNonEmptyString(match?.reason) ? match.reason : '';
	}
	if (isPlainObject(panelCounts)) {
		for (const key of [String(pageNumber), pad(pageNumber, 3)]) {
			const entry = panelCounts[key];
			if (isNonEmptyString(entry)) return entry;
			if (isNonEmptyString(entry?.reason)) return entry.reason;
		}
	}
	return '';
}

export async function loadEpisodeSources(options = {}) {
	const context = options.episodeDirectory
		? await resolveEpisodeContext({
				root: options.root,
				episodeDir: options.episodeDirectory
			})
		: await resolveEpisodeContext(options);
	const metadataParsed = await readStructuredFile(context.metadataFile);
	if (!isPlainObject(metadataParsed.value)) {
		throw new ComicToolError(`${context.metadataFile} must contain a metadata object.`);
	}
	const pageResult = await loadPageSources(context);
	const dataResult = await loadDataDirectories(context);
	const exceptionsFile = path.join(context.episodeDirectory, 'script', 'exceptions.yaml');
	const exceptionsParsed =
		dataResult.data.exceptions === undefined && (await pathExists(exceptionsFile))
			? await readStructuredFile(exceptionsFile)
			: null;
	const frontMatterFile = path.join(context.episodeDirectory, 'front-and-end-matter.yaml');
	const frontMatterParsed = (await pathExists(frontMatterFile))
		? await readStructuredFile(frontMatterFile)
		: null;
	const letteringGeometryParsed = (await pathExists(context.letteringGeometryFile))
		? await readStructuredFile(context.letteringGeometryFile)
		: null;
	const exceptions = dataResult.data.exceptions ?? exceptionsParsed?.value ?? {};
	const sources = [
		{ filename: context.metadataFile, source: metadataParsed.source },
		...dataResult.sources,
		...(exceptionsParsed ? [{ filename: exceptionsFile, source: exceptionsParsed.source }] : []),
		...(frontMatterParsed ? [{ filename: frontMatterFile, source: frontMatterParsed.source }] : []),
		...pageResult.sources.map(({ filename, source }) => ({ filename, source }))
	].sort((left, right) => left.filename.localeCompare(right.filename, 'en'));
	const sourceDigest = sha256(
		sources
			.map(
				({ filename, source }) =>
					`${relativeToRoot(context.root, filename)}\0${normalizeNewlines(source)}`
			)
			.join('\0')
	);
	const letteringDigest = sha256(
		letteringGeometryParsed
			? normalizeNewlines(letteringGeometryParsed.source)
			: `${LETTERING_GEOMETRY_FORMAT}\0missing`
	);

	return {
		...context,
		metadata: metadataParsed.value,
		pages: pageResult.pages,
		pageSources: pageResult.sources,
		data: dataResult.data,
		exceptions,
		frontMatter: frontMatterParsed?.value ?? null,
		letteringGeometry: letteringGeometryParsed?.value ?? null,
		letteringGeometrySource: letteringGeometryParsed?.source ?? null,
		letteringDigest,
		sources,
		sourceDigest
	};
}

function flattenStrings(value, output = []) {
	if (typeof value === 'string') {
		output.push(value);
	} else if (Array.isArray(value)) {
		for (const item of value) flattenStrings(item, output);
	} else if (isPlainObject(value)) {
		for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right, 'en'))) {
			flattenStrings(value[key], output);
		}
	}
	return output;
}

function collectionCandidates(data, key) {
	const direct = data[key];
	if (direct === undefined) return [];
	if (Array.isArray(direct)) return direct;
	if (isPlainObject(direct) && Array.isArray(direct[key])) return direct[key];
	if (isPlainObject(direct) && Array.isArray(direct.items)) return direct.items;
	if (isPlainObject(direct) && Array.isArray(direct.entries)) return direct.entries;
	if (isPlainObject(direct)) {
		return Object.entries(direct).map(([recordKey, record]) =>
			isPlainObject(record)
				? { id: record.id ?? recordKey, ...record }
				: { id: recordKey, value: record }
		);
	}
	return [];
}

function collectionRecords(data, key) {
	return collectionCandidates(data, key).filter((entry) => isPlainObject(entry));
}

function collectionIdSet(data, key) {
	return new Set(
		collectionRecords(data, key)
			.map((entry) => entry.id)
			.filter(isNonEmptyString)
	);
}

function collectionRecord(data, key, id) {
	return collectionRecords(data, key).find((entry) => entry.id === id);
}

function bengaliSignText(sign) {
	return sign.languages?.bn ?? sign.bn ?? sign.bengali;
}

function bengaliSignApproval(sign) {
	return {
		reviewer: sign.review?.reviewer ?? sign.reviewer,
		reviewDate: sign.review?.date ?? sign.reviewDate ?? sign.reviewedAt,
		reviewState:
			sign.review?.status ?? sign.status ?? sign.translationState ?? sign.translationStatus,
		publicationAllowed: sign.review?.publicationAllowed ?? sign.publicationAllowed
	};
}

function bengaliSignIsApproved(sign) {
	const approval = bengaliSignApproval(sign);
	return (
		isNonEmptyString(approval.reviewer) &&
		isCalendarDate(approval.reviewDate) &&
		['approved', 'human-approved', 'approved-for-publication'].includes(approval.reviewState) &&
		approval.publicationAllowed !== false
	);
}

function signVariantText(sign, textVariant) {
	if (textVariant === 'english') return { text: sign.english, language: 'en' };
	if (textVariant === 'bengali') return { text: bengaliSignText(sign), language: 'bn' };
	if (textVariant === 'bilingual') {
		return {
			text: [sign.english, bengaliSignText(sign)].filter(isNonEmptyString).join('\n'),
			language: 'mixed'
		};
	}
	if (textVariant.startsWith('variant:')) {
		const selector = textVariant.slice('variant:'.length);
		const variants = Array.isArray(sign.variants) ? sign.variants : [];
		const numeric = Number(selector);
		const variant = Number.isInteger(numeric)
			? variants[numeric - 1]
			: variants.find(
					(entry) =>
						entry?.id === selector ||
						entry?.source === selector ||
						entry?.key === selector ||
						entry?.script === selector
				);
		return {
			text: variant?.text,
			language: /bengali/i.test(String(variant?.script ?? '')) ? 'bn' : 'en'
		};
	}
	const direct = sign[textVariant];
	return { text: typeof direct === 'string' ? direct : null, language: 'en' };
}

function deterministicTextEntries(data) {
	const entries = [];
	for (const sign of collectionRecords(data, 'signage')) {
		if (!Array.isArray(sign.placements)) continue;
		for (const [index, placement] of sign.placements.entries()) {
			const textVariant = placement?.textVariant ?? 'english';
			const resolved = isNonEmptyString(textVariant)
				? signVariantText(sign, textVariant)
				: { text: null, language: 'en' };
			const containsBengali =
				resolved.language === 'bn' ||
				resolved.language === 'mixed' ||
				/[\u0980-\u09ff]/u.test(String(resolved.text ?? ''));
			entries.push({
				id: `${sign.id ?? 'unknown'}--${placement?.panelId ?? 'unknown'}--${pad(index + 1, 2)}`,
				signId: sign.id ?? null,
				panelId: placement?.panelId ?? null,
				placementIndex: index + 1,
				kind: placement?.kind ?? 'sign',
				textVariant,
				text: resolved.text ?? null,
				language: resolved.language,
				x: placement?.x,
				y: placement?.y,
				width: placement?.width,
				height: placement?.height,
				z: 8,
				reviewRequired: containsBengali,
				reviewState: containsBengali
					? (bengaliSignApproval(sign).reviewState ?? 'needs-human-review')
					: 'not-required',
				publicationAllowed: containsBengali ? bengaliSignIsApproved(sign) : true
			});
		}
	}
	return entries.sort(
		(left, right) =>
			String(left.panelId).localeCompare(String(right.panelId), 'en') ||
			left.placementIndex - right.placementIndex ||
			String(left.signId).localeCompare(String(right.signId), 'en')
	);
}

function deterministicTextOverlays(data, panelId) {
	return deterministicTextEntries(data).filter((entry) => entry.panelId === panelId);
}

function letteringManifestObject(sources) {
	const entries = deterministicTextEntries(sources.data);
	return {
		format: 'suvroghosh-comic-lettering',
		formatVersion: 1,
		episodeId: sources.metadata.id,
		seriesSlug: sources.metadata.seriesSlug,
		episodeSlug: sources.metadata.slug,
		sourceDigest: sources.sourceDigest,
		entryCount: entries.length,
		entries
	};
}

function compactRecord(record, maximum = 900) {
	if (!record) return '';
	const ignored = new Set(['id', 'prompt', 'history', 'notes']);
	const selected = Object.fromEntries(
		Object.entries(record).filter(
			([key, value]) =>
				!ignored.has(key) &&
				(typeof value === 'string' ||
					typeof value === 'number' ||
					typeof value === 'boolean' ||
					Array.isArray(value))
		)
	);
	const text = stableJson(selected).trim();
	return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

function dialogueInReadingOrder(panel) {
	return [...(Array.isArray(panel.dialogue) ? panel.dialogue : [])].sort(
		(left, right) => Number(left.readingOrder) - Number(right.readingOrder)
	);
}

function panelNarrationInReadingOrder(panel) {
	const dialogue = dialogueInReadingOrder(panel).map((entry, index) => ({
		kind: 'dialogue',
		entry,
		sourceIndex: index
	}));
	const soundEffects = (Array.isArray(panel.soundEffects) ? panel.soundEffects : []).map(
		(entry, index) => ({
			kind: 'sound',
			entry,
			sourceIndex: index
		})
	);
	const combined = [...dialogue, ...soundEffects];
	if (!combined.some(({ entry }) => entry.narrationOrder !== undefined)) {
		return combined;
	}
	return combined.sort(
		(left, right) =>
			Number(left.entry.narrationOrder) - Number(right.entry.narrationOrder) ||
			(left.kind === right.kind
				? left.sourceIndex - right.sourceIndex
				: left.kind.localeCompare(right.kind))
	);
}

function letteringGeometryPanel(sources, panelId) {
	const panels = sources.letteringGeometry?.panels;
	return isPlainObject(panels) && isPlainObject(panels[panelId]) ? panels[panelId] : null;
}

function finiteNormalized(value) {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function normalizedGeometryBox(value) {
	if (!isPlainObject(value)) return null;
	if (!['x', 'y', 'width', 'height'].every((field) => finiteNormalized(value[field]))) {
		return null;
	}
	if (value.width <= 0 || value.height <= 0) return null;
	if (value.x + value.width > 1 + Number.EPSILON) return null;
	if (value.y + value.height > 1 + Number.EPSILON) return null;
	return {
		x: Number(value.x),
		y: Number(value.y),
		width: Number(value.width),
		height: Number(value.height)
	};
}

function normalizedGeometryPoint(value) {
	if (!isPlainObject(value) || !finiteNormalized(value.x) || !finiteNormalized(value.y)) {
		return null;
	}
	return { x: Number(value.x), y: Number(value.y) };
}

function geometryProtectedZones(panelGeometry) {
	return Array.isArray(panelGeometry?.protectedZones)
		? panelGeometry.protectedZones
				.map((zone) => {
					const box = normalizedGeometryBox(zone);
					return box ? { ...zone, ...box } : null;
				})
				.filter(Boolean)
		: [];
}

function geometrySpeakerAnchor(panelGeometry, speakerId) {
	return normalizedGeometryPoint(panelGeometry?.speakerAnchors?.[speakerId]);
}

function panelArtGeometryTransform(panel, placement) {
	if (
		!placement ||
		!Number.isFinite(placement.width) ||
		!Number.isFinite(placement.height) ||
		placement.width <= 0 ||
		placement.height <= 0
	) {
		return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
	}
	const artWidth = Number(panel.art?.width);
	const artHeight = Number(panel.art?.height);
	const authoredRatioParts = String(panel.aspectRatio ?? '4:3')
		.split(':')
		.map(Number);
	const authoredRatio =
		authoredRatioParts.length === 2 &&
		Number.isFinite(authoredRatioParts[0]) &&
		Number.isFinite(authoredRatioParts[1]) &&
		authoredRatioParts[0] > 0 &&
		authoredRatioParts[1] > 0
			? authoredRatioParts[0] / authoredRatioParts[1]
			: 4 / 3;
	const sourceRatio =
		Number.isFinite(artWidth) && Number.isFinite(artHeight) && artWidth > 0 && artHeight > 0
			? artWidth / artHeight
			: authoredRatio;
	const viewportRatio = placement.width / placement.height;
	if (Math.abs(sourceRatio - viewportRatio) < 0.0001) {
		return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
	}
	if (sourceRatio > viewportRatio) {
		const scaleX = sourceRatio / viewportRatio;
		return {
			scaleX,
			scaleY: 1,
			offsetX: (1 - scaleX) / 2,
			offsetY: 0
		};
	}
	const scaleY = viewportRatio / sourceRatio;
	const verticalAnchor = panel.art?.anchor;
	const offsetY =
		verticalAnchor === 'top' ? 0 : verticalAnchor === 'bottom' ? 1 - scaleY : (1 - scaleY) / 2;
	return { scaleX: 1, scaleY, offsetX: 0, offsetY };
}

function transformGeometryPoint(point, transform) {
	if (!point) return null;
	return {
		x: roundNormalized(Math.max(0, Math.min(1, transform.offsetX + point.x * transform.scaleX))),
		y: roundNormalized(Math.max(0, Math.min(1, transform.offsetY + point.y * transform.scaleY)))
	};
}

function transformGeometryZone(zone, transform) {
	const left = Math.max(0, transform.offsetX + zone.x * transform.scaleX);
	const top = Math.max(0, transform.offsetY + zone.y * transform.scaleY);
	const right = Math.min(1, transform.offsetX + (zone.x + zone.width) * transform.scaleX);
	const bottom = Math.min(1, transform.offsetY + (zone.y + zone.height) * transform.scaleY);
	if (right <= left || bottom <= top) return null;
	return {
		...zone,
		x: roundNormalized(left),
		y: roundNormalized(top),
		width: roundNormalized(right - left),
		height: roundNormalized(bottom - top),
		padding: roundNormalized(
			Math.max(0, Number(zone.padding) || 0) * Math.max(transform.scaleX, transform.scaleY)
		)
	};
}

function zoneProtection(zone) {
	if (LETTERING_ZONE_PROTECTIONS.has(zone?.protect)) return zone.protect;
	switch (zone?.kind) {
		case 'critical-prop':
		case 'no-balloon':
			return 'balloon';
		case 'no-tail':
			return 'tail';
		default:
			return 'both';
	}
}

function zoneProtects(zone, target) {
	const protection = zoneProtection(zone);
	return protection === 'both' || protection === target;
}

function expandedNormalizedBox(box, padding = 0) {
	const amount = Math.max(0, Number(padding) || 0);
	const x = Math.max(0, box.x - amount);
	const y = Math.max(0, box.y - amount);
	const right = Math.min(1, box.x + box.width + amount);
	const bottom = Math.min(1, box.y + box.height + amount);
	return { x, y, width: right - x, height: bottom - y };
}

function normalizedBoxesOverlap(left, right, gap = 0) {
	const a = expandedNormalizedBox(left, Math.max(0, Number(gap) || 0));
	return !(
		a.x + a.width <= right.x ||
		right.x + right.width <= a.x ||
		a.y + a.height <= right.y ||
		right.y + right.height <= a.y
	);
}

function normalizedPointInsideBox(point, box) {
	return (
		point.x > box.x &&
		point.x < box.x + box.width &&
		point.y > box.y &&
		point.y < box.y + box.height
	);
}

function roundNormalized(value) {
	return Number(Number(value).toFixed(4));
}

function candidateBalloonBoxes(balloon) {
	const preferred = {
		x: Number(balloon.x),
		y: Number(balloon.y),
		width: Number(balloon.width),
		height: Number(balloon.height)
	};
	const margin = 0.012;
	const maximumX = Math.max(margin, 1 - preferred.width - margin);
	const maximumY = Math.max(margin, 1 - preferred.height - margin);
	const candidates = new Map();
	const add = (x, y) => {
		const candidate = {
			x: roundNormalized(Math.max(margin, Math.min(maximumX, x))),
			y: roundNormalized(Math.max(margin, Math.min(maximumY, y))),
			width: preferred.width,
			height: preferred.height
		};
		candidates.set(`${candidate.x}:${candidate.y}`, candidate);
	};
	add(preferred.x, preferred.y);
	const step = 0.025;
	for (let offsetY = -0.35; offsetY <= 0.3501; offsetY += step) {
		for (let offsetX = -0.35; offsetX <= 0.3501; offsetX += step) {
			add(preferred.x + offsetX, preferred.y + offsetY);
		}
	}
	return [...candidates.values()];
}

function balloonCandidateScore(candidate, preferred, previous, speakerAnchor) {
	const displacement = (candidate.x - preferred.x) ** 2 * 1.15 + (candidate.y - preferred.y) ** 2;
	const centre = {
		x: candidate.x + candidate.width / 2,
		y: candidate.y + candidate.height / 2
	};
	const tailDistance = speakerAnchor
		? (centre.x - speakerAnchor.x) ** 2 + (centre.y - speakerAnchor.y) ** 2
		: 0;
	const readingOrderPenalty =
		previous && candidate.y + 0.02 < previous.y ? (previous.y - candidate.y) * 0.45 : 0;
	return displacement * 100 + tailDistance * 0.4 + readingOrderPenalty;
}

function chooseBalloonBox(balloon, zones, placed, speakerAnchor) {
	const preferred = {
		x: Number(balloon.x),
		y: Number(balloon.y),
		width: Number(balloon.width),
		height: Number(balloon.height)
	};
	const protectedForBalloons = zones
		.filter((zone) => zoneProtects(zone, 'balloon'))
		.map((zone) => expandedNormalizedBox(zone, zone.padding ?? 0.008));
	const previous = placed.at(-1)?.balloon ?? null;
	const ranked = candidateBalloonBoxes(balloon)
		.map((candidate) => ({
			candidate,
			score: balloonCandidateScore(candidate, preferred, previous, speakerAnchor)
		}))
		.sort(
			(left, right) =>
				left.score - right.score ||
				left.candidate.y - right.candidate.y ||
				left.candidate.x - right.candidate.x
		);
	for (const { candidate } of ranked) {
		if (protectedForBalloons.some((zone) => normalizedBoxesOverlap(candidate, zone))) continue;
		if (placed.some((entry) => normalizedBoxesOverlap(candidate, entry.balloon, 0.008))) continue;
		return { balloon: candidate, safe: true };
	}
	return { balloon: preferred, safe: false };
}

function readableBalloonBox(dialogue, placement, minimumFontSize = 16) {
	const original = {
		x: Number(dialogue.balloon.x),
		y: Number(dialogue.balloon.y),
		width: Number(dialogue.balloon.width),
		height: Number(dialogue.balloon.height)
	};
	if (!placement) {
		return {
			balloon: original,
			fits: true,
			fontSize: null,
			resized: false
		};
	}
	const widthGrowth = [0, 0.025, 0.05, 0.08, 0.12, 0.17, 0.23, 0.3];
	const heightGrowth = [0, 0.025, 0.05, 0.08, 0.12, 0.17, 0.23, 0.3];
	const candidates = [];
	for (const addWidth of widthGrowth) {
		for (const addHeight of heightGrowth) {
			const width = roundNormalized(Math.min(0.92, original.width + addWidth));
			const height = roundNormalized(Math.min(0.58, original.height + addHeight));
			const fitted = fittedDialogueText(
				{
					...dialogue,
					balloon: { ...dialogue.balloon, width, height }
				},
				placement
			);
			const areaGrowth = width * height - original.width * original.height;
			const shapePenalty = Math.max(0, height / Math.max(width, 0.001) - 0.72) * 0.08;
			candidates.push({
				balloon: { ...original, width, height },
				fitted,
				score: areaGrowth + addWidth * 0.02 + addHeight * 0.012 + shapePenalty
			});
		}
	}
	const readable = candidates
		.filter((candidate) => candidate.fitted.fits && candidate.fitted.fontSize >= minimumFontSize)
		.sort(
			(left, right) =>
				left.score - right.score ||
				right.fitted.fontSize - left.fitted.fontSize ||
				left.balloon.height - right.balloon.height ||
				left.balloon.width - right.balloon.width
		)[0];
	const best =
		readable ??
		candidates.sort(
			(left, right) =>
				Number(right.fitted.fits) - Number(left.fitted.fits) ||
				right.fitted.fontSize - left.fitted.fontSize ||
				left.score - right.score
		)[0];
	return {
		balloon: best.balloon,
		fits: best.fitted.fits,
		fontSize: best.fitted.fontSize,
		resized: best.balloon.width !== original.width || best.balloon.height !== original.height
	};
}

function rayExitFromBox(point, toward, box) {
	const direction = { x: toward.x - point.x, y: toward.y - point.y };
	const candidates = [];
	const addCandidate = (distance) => {
		if (!Number.isFinite(distance) || distance < 0) return;
		const candidate = {
			x: point.x + direction.x * distance,
			y: point.y + direction.y * distance
		};
		if (
			candidate.x >= box.x - 0.0001 &&
			candidate.x <= box.x + box.width + 0.0001 &&
			candidate.y >= box.y - 0.0001 &&
			candidate.y <= box.y + box.height + 0.0001
		) {
			candidates.push({ distance, point: candidate });
		}
	};
	if (direction.x > 0) addCandidate((box.x + box.width - point.x) / direction.x);
	if (direction.x < 0) addCandidate((box.x - point.x) / direction.x);
	if (direction.y > 0) addCandidate((box.y + box.height - point.y) / direction.y);
	if (direction.y < 0) addCandidate((box.y - point.y) / direction.y);
	candidates.sort((left, right) => left.distance - right.distance);
	return candidates[0]?.point ?? point;
}

function speakerTailEndpoint(anchor, speakerFace, balloon, placement, clearAirPixels = 12) {
	if (!speakerFace) return anchor;
	const protectedFace = expandedNormalizedBox(
		speakerFace,
		Math.max(0.008, Number(speakerFace.padding) || 0)
	);
	const balloonCentre = {
		x: balloon.x + balloon.width / 2,
		y: balloon.y + balloon.height / 2
	};
	const origin = normalizedPointInsideBox(anchor, protectedFace)
		? anchor
		: {
				x: Math.max(protectedFace.x, Math.min(protectedFace.x + protectedFace.width, anchor.x)),
				y: Math.max(protectedFace.y, Math.min(protectedFace.y + protectedFace.height, anchor.y))
			};
	const boundary = rayExitFromBox(origin, balloonCentre, protectedFace);
	const panelWidth = Number(placement?.width);
	const panelHeight = Number(placement?.height);
	if (
		Number.isFinite(panelWidth) &&
		panelWidth > 0 &&
		Number.isFinite(panelHeight) &&
		panelHeight > 0
	) {
		const pixelDelta = {
			x: (balloonCentre.x - boundary.x) * panelWidth,
			y: (balloonCentre.y - boundary.y) * panelHeight
		};
		const pixelLength = Math.hypot(pixelDelta.x, pixelDelta.y) || 1;
		const appliedClearAirPixels = Math.min(clearAirPixels, pixelLength * 0.45);
		return {
			x: roundNormalized(
				boundary.x + (pixelDelta.x / pixelLength) * (appliedClearAirPixels / panelWidth)
			),
			y: roundNormalized(
				boundary.y + (pixelDelta.y / pixelLength) * (appliedClearAirPixels / panelHeight)
			)
		};
	}
	const length = Math.hypot(balloonCentre.x - boundary.x, balloonCentre.y - boundary.y) || 1;
	const normalizedClearAir = clearAirPixels / 400;
	return {
		x: roundNormalized(
			boundary.x + ((balloonCentre.x - boundary.x) / length) * normalizedClearAir
		),
		y: roundNormalized(
			boundary.y + ((balloonCentre.y - boundary.y) / length) * normalizedClearAir
		)
	};
}

function balloonBoundaryCandidates(balloon) {
	const fractions = [0.2, 0.35, 0.5, 0.65, 0.8];
	return [
		...fractions.map((fraction) => ({
			x: balloon.x + balloon.width * fraction,
			y: balloon.y,
			side: 'up'
		})),
		...fractions.map((fraction) => ({
			x: balloon.x + balloon.width * fraction,
			y: balloon.y + balloon.height,
			side: 'down'
		})),
		...fractions.map((fraction) => ({
			x: balloon.x,
			y: balloon.y + balloon.height * fraction,
			side: 'left'
		})),
		...fractions.map((fraction) => ({
			x: balloon.x + balloon.width,
			y: balloon.y + balloon.height * fraction,
			side: 'right'
		}))
	];
}

function quadraticPoint(start, control, end, progress) {
	const inverse = 1 - progress;
	return {
		x:
			inverse * inverse * start.x +
			2 * inverse * progress * control.x +
			progress * progress * end.x,
		y:
			inverse * inverse * start.y + 2 * inverse * progress * control.y + progress * progress * end.y
	};
}

function curveHitsProtectedZone(start, control, end, zones) {
	for (let index = 1; index < 24; index += 1) {
		const point = quadraticPoint(start, control, end, index / 24);
		if (
			zones.some((zone) =>
				normalizedPointInsideBox(point, expandedNormalizedBox(zone, zone.padding ?? 0.004))
			)
		) {
			return true;
		}
	}
	return false;
}

function chooseTailRoute(balloon, endpoint, zones, preferredDirection) {
	const protectedForTails = zones.filter((zone) => zoneProtects(zone, 'tail'));
	const routes = [];
	for (const start of balloonBoundaryCandidates(balloon)) {
		const distance = Math.hypot(endpoint.x - start.x, endpoint.y - start.y);
		if (distance < 0.005) continue;
		const midpoint = {
			x: (start.x + endpoint.x) / 2,
			y: (start.y + endpoint.y) / 2
		};
		const perpendicular = {
			x: -(endpoint.y - start.y) / distance,
			y: (endpoint.x - start.x) / distance
		};
		for (const bend of [
			0, 0.08, -0.08, 0.16, -0.16, 0.24, -0.24, 0.36, -0.36, 0.5, -0.5, 0.7, -0.7, 0.9, -0.9
		]) {
			const control = {
				x: roundNormalized(midpoint.x + perpendicular.x * distance * bend),
				y: roundNormalized(midpoint.y + perpendicular.y * distance * bend)
			};
			if (control.x < 0.005 || control.x > 0.995 || control.y < 0.005 || control.y > 0.995) {
				continue;
			}
			if (curveHitsProtectedZone(start, control, endpoint, protectedForTails)) continue;
			const directionPenalty =
				preferredDirection && preferredDirection !== 'none' && start.side !== preferredDirection
					? 0.04
					: 0;
			routes.push({
				start: { x: roundNormalized(start.x), y: roundNormalized(start.y) },
				control,
				end: endpoint,
				side: start.side,
				score: distance + Math.abs(bend) * distance * 0.8 + directionPenalty
			});
		}
	}
	routes.sort(
		(left, right) =>
			left.score - right.score || left.start.y - right.start.y || left.start.x - right.start.x
	);
	if (routes[0]) return { ...routes[0], safe: true };
	const fallbackStart = balloonBoundaryCandidates(balloon).sort(
		(left, right) =>
			Math.hypot(endpoint.x - left.x, endpoint.y - left.y) -
			Math.hypot(endpoint.x - right.x, endpoint.y - right.y)
	)[0];
	return {
		start: { x: fallbackStart.x, y: fallbackStart.y },
		control: {
			x: (fallbackStart.x + endpoint.x) / 2,
			y: (fallbackStart.y + endpoint.y) / 2
		},
		end: endpoint,
		side: fallbackStart.side,
		safe: false
	};
}

export function planPanelLettering(sources, panel, options = {}) {
	const panelGeometry = letteringGeometryPanel(sources, panel.id);
	const geometryTransform = panelArtGeometryTransform(panel, options.placement);
	const zones = geometryProtectedZones(panelGeometry)
		.map((zone) => transformGeometryZone(zone, geometryTransform))
		.filter(Boolean);
	const placed = [];
	const issues = [];
	for (const dialogue of dialogueInReadingOrder(panel)) {
		const speakerAnchor = transformGeometryPoint(
			geometrySpeakerAnchor(panelGeometry, dialogue.speaker),
			geometryTransform
		);
		const speakerFace =
			zones.find((zone) => zone.kind === 'face' && zone.characterId === dialogue.speaker) ?? null;
		const readable = readableBalloonBox(dialogue, options.placement, options.minimumFontSize ?? 16);
		if (!readable.fits || (readable.fontSize !== null && readable.fontSize < 14)) {
			issues.push({
				code: 'balloon-text-unreadable',
				panelId: panel.id,
				dialogueId: dialogue.id,
				message: 'No readable balloon size was found within the bounded automatic growth limits.'
			});
		}
		const automatic = Boolean(
			readable.resized || (panelGeometry && (zones.length > 0 || speakerAnchor))
		);
		const selected = automatic
			? chooseBalloonBox(readable.balloon, zones, placed, speakerAnchor)
			: {
					balloon: readable.balloon,
					safe: true
				};
		if (!selected.safe) {
			issues.push({
				code: 'balloon-collision',
				panelId: panel.id,
				dialogueId: dialogue.id,
				message: 'No collision-free balloon position was found inside the panel.'
			});
		}
		let tailRoute = null;
		if (dialogue.balloon.tailDirection !== 'none' && speakerAnchor) {
			const tailProtectedZones = [
				...zones,
				...placed.map((entry) => ({
					id: `placed-balloon-${entry.dialogue.id}`,
					kind: 'previous-balloon',
					x: entry.balloon.x,
					y: entry.balloon.y,
					width: entry.balloon.width,
					height: entry.balloon.height,
					padding: 0.006,
					protect: 'tail'
				}))
			];
			for (const clearAirPixels of [12, 10, 8, 6, 4]) {
				const endpoint = speakerTailEndpoint(
					speakerAnchor,
					speakerFace,
					selected.balloon,
					options.placement,
					clearAirPixels
				);
				tailRoute = chooseTailRoute(
					selected.balloon,
					endpoint,
					tailProtectedZones,
					dialogue.balloon.tailDirection
				);
				if (tailRoute.safe) break;
			}
			if (!tailRoute.safe) {
				issues.push({
					code: 'tail-collision',
					panelId: panel.id,
					dialogueId: dialogue.id,
					message: 'No collision-free tail route was found to the authored speaker anchor.'
				});
			}
		}
		if (
			panelGeometry &&
			!speakerAnchor &&
			!['system', 'off-panel'].includes(dialogue.style) &&
			dialogue.balloon.tailDirection !== 'none'
		) {
			issues.push({
				code: 'speaker-anchor-missing',
				panelId: panel.id,
				dialogueId: dialogue.id,
				message: `Speaker "${dialogue.speaker}" has no lettering speaker anchor.`
			});
		}
		if (
			panelGeometry &&
			speakerAnchor &&
			!speakerFace &&
			!['system', 'off-panel'].includes(dialogue.style)
		) {
			issues.push({
				code: 'speaker-face-missing',
				panelId: panel.id,
				dialogueId: dialogue.id,
				message: `Speaker "${dialogue.speaker}" has no protected face zone, so the tail cannot stop outside the head.`
			});
		}
		placed.push({
			dialogue,
			balloon: selected.balloon,
			tailRoute,
			automatic,
			autoSized: readable.resized,
			fontSize: readable.fontSize
		});
	}
	return {
		panelId: panel.id,
		geometryStatus: panelGeometry?.status ?? 'missing',
		entries: placed,
		issues
	};
}

function validateLetteringGeometryStructure(sources) {
	const issues = [];
	const geometry = sources.letteringGeometry;
	const add = (code, pathValue, message) => issues.push({ code, path: pathValue, message });
	if (geometry === null) {
		add(
			'geometry-missing',
			'lettering/geometry.yaml',
			'The collision-aware lettering geometry file has not been scaffolded.'
		);
		return issues;
	}
	if (!isPlainObject(geometry)) {
		add('geometry-record', 'lettering/geometry.yaml', 'Lettering geometry must be an object.');
		return issues;
	}
	for (const key of unknownKeys(geometry, LETTERING_GEOMETRY_KEYS)) {
		add('geometry-unknown-field', 'lettering/geometry.yaml', `Unknown field "${key}".`);
	}
	if (geometry.format !== LETTERING_GEOMETRY_FORMAT) {
		add(
			'geometry-format',
			'lettering/geometry.yaml',
			`format must be "${LETTERING_GEOMETRY_FORMAT}".`
		);
	}
	if (geometry.formatVersion !== LETTERING_GEOMETRY_VERSION) {
		add(
			'geometry-version',
			'lettering/geometry.yaml',
			`formatVersion must be ${LETTERING_GEOMETRY_VERSION}.`
		);
	}
	if (!isPlainObject(geometry.panels)) {
		add(
			'geometry-panels',
			'lettering/geometry.yaml',
			'panels must be an object keyed by panel id.'
		);
		return issues;
	}
	const panelById = new Map(
		sources.pages.flatMap((page) => page.panels).map((panel) => [panel.id, panel])
	);
	for (const [panelId, panelGeometry] of Object.entries(geometry.panels)) {
		const panelPath = `lettering/geometry.yaml panels.${panelId}`;
		const panel = panelById.get(panelId);
		if (!panel) {
			add('geometry-panel-ref', panelPath, `Unknown panel "${panelId}".`);
			continue;
		}
		if (!isPlainObject(panelGeometry)) {
			add('geometry-panel-record', panelPath, 'Panel geometry must be an object.');
			continue;
		}
		for (const key of unknownKeys(panelGeometry, LETTERING_PANEL_KEYS)) {
			add('geometry-panel-unknown-field', panelPath, `Unknown field "${key}".`);
		}
		if (!LETTERING_PANEL_STATUSES.has(panelGeometry.status)) {
			add('geometry-panel-status', panelPath, 'status must be needs-review or approved.');
		}
		if (!isPlainObject(panelGeometry.speakerAnchors)) {
			add('geometry-speaker-anchors', panelPath, 'speakerAnchors must be an object.');
		} else {
			const presentCharacters = new Set(panel.characters.map((character) => character.id));
			for (const [characterId, anchor] of Object.entries(panelGeometry.speakerAnchors)) {
				if (!presentCharacters.has(characterId)) {
					add(
						'geometry-speaker-ref',
						`${panelPath}.speakerAnchors.${characterId}`,
						`Speaker anchor references character "${characterId}" who is not present in the panel.`
					);
				}
				if (!normalizedGeometryPoint(anchor)) {
					add(
						'geometry-speaker-anchor',
						`${panelPath}.speakerAnchors.${characterId}`,
						'Speaker anchor must be a normalized {x, y} point.'
					);
				}
			}
		}
		if (!Array.isArray(panelGeometry.protectedZones)) {
			add('geometry-protected-zones', panelPath, 'protectedZones must be an array.');
			continue;
		}
		const zoneIds = new Set();
		for (const [zoneIndex, zone] of panelGeometry.protectedZones.entries()) {
			const zonePath = `${panelPath}.protectedZones[${zoneIndex}]`;
			if (!isPlainObject(zone)) {
				add('geometry-zone-record', zonePath, 'Protected zone must be an object.');
				continue;
			}
			for (const key of unknownKeys(zone, LETTERING_ZONE_KEYS)) {
				add('geometry-zone-unknown-field', zonePath, `Unknown field "${key}".`);
			}
			if (!isNonEmptyString(zone.id) || zoneIds.has(zone.id)) {
				add(
					'geometry-zone-id',
					zonePath,
					'Protected zone id must be non-empty and unique within the panel.'
				);
			}
			zoneIds.add(zone.id);
			if (!LETTERING_ZONE_KINDS.has(zone.kind)) {
				add(
					'geometry-zone-kind',
					zonePath,
					`kind must be one of ${[...LETTERING_ZONE_KINDS].join(', ')}.`
				);
			}
			if (!normalizedGeometryBox(zone)) {
				add(
					'geometry-zone-bounds',
					zonePath,
					'Protected zone must have normalized x, y, width, and height inside the panel.'
				);
			}
			if (zone.padding !== undefined && (!finiteNormalized(zone.padding) || zone.padding > 0.1)) {
				add('geometry-zone-padding', zonePath, 'padding must be a normalized value from 0 to 0.1.');
			}
			if (zone.protect !== undefined && !LETTERING_ZONE_PROTECTIONS.has(zone.protect)) {
				add('geometry-zone-protect', zonePath, 'protect must be balloon, tail, or both.');
			}
			if (
				zone.characterId !== undefined &&
				!panel.characters.some((character) => character.id === zone.characterId)
			) {
				add(
					'geometry-zone-character',
					zonePath,
					`characterId "${zone.characterId}" is not present in the panel.`
				);
			}
			if (zone.kind === 'face' && !isNonEmptyString(zone.characterId)) {
				add(
					'geometry-face-character',
					zonePath,
					'Face zones require characterId so tails can target the correct speaker.'
				);
			}
		}
	}
	return issues;
}

export function auditLettering(sources, options = {}) {
	const structureIssues = validateLetteringGeometryStructure(sources);
	const panels = [];
	const missingPanels = [];
	const unapprovedPanels = [];
	const layoutIssues = [];
	for (const page of [...sources.pages].sort((left, right) => left.page - right.page)) {
		const placements = new Map(
			panelPlacements(page).map((placement) => [placement.panel.id, placement])
		);
		for (const panel of page.panels) {
			if ((panel.dialogue?.length ?? 0) === 0) continue;
			const geometry = letteringGeometryPanel(sources, panel.id);
			if (!geometry) missingPanels.push(panel.id);
			if (geometry && geometry.status !== 'approved') unapprovedPanels.push(panel.id);
			const plan = planPanelLettering(sources, panel, {
				placement: placements.get(panel.id)
			});
			layoutIssues.push(...plan.issues);
			panels.push({
				page: page.page,
				panelId: panel.id,
				dialogueCount: panel.dialogue.length,
				status: geometry?.status ?? 'missing',
				issueCount: plan.issues.length
			});
		}
	}
	const requireApproved = options.requireApproved === true;
	const ready =
		structureIssues.length === 0 &&
		layoutIssues.length === 0 &&
		missingPanels.length === 0 &&
		(!requireApproved || unapprovedPanels.length === 0);
	return {
		format: 'suvroghosh-comic-lettering-audit',
		formatVersion: 1,
		episodeId: sources.metadata.id,
		sourceDigest: sources.sourceDigest,
		letteringDigest: sources.letteringDigest,
		requireApproved,
		ready,
		summary: {
			dialoguePanels: panels.length,
			missingGeometry: missingPanels.length,
			unapprovedGeometry: unapprovedPanels.length,
			structureIssues: structureIssues.length,
			layoutIssues: layoutIssues.length
		},
		missingPanels,
		unapprovedPanels,
		structureIssues,
		layoutIssues,
		panels
	};
}

export function formatLetteringAudit(audit) {
	const lines = [
		'# Comic lettering audit',
		'',
		`- Episode: ${audit.episodeId}`,
		`- Source digest: \`${audit.sourceDigest}\``,
		`- Lettering geometry digest: \`${audit.letteringDigest}\``,
		`- Dialogue panels: ${audit.summary.dialoguePanels}`,
		`- Missing geometry: ${audit.summary.missingGeometry}`,
		`- Awaiting geometry approval: ${audit.summary.unapprovedGeometry}`,
		`- Structure issues: ${audit.summary.structureIssues}`,
		`- Collision or routing issues: ${audit.summary.layoutIssues}`,
		`- Ready: ${audit.ready ? 'yes' : 'no'}`,
		''
	];
	if (audit.missingPanels.length > 0) {
		lines.push(
			'## Missing panel geometry',
			'',
			audit.missingPanels.map((id) => `- ${id}`).join('\n'),
			''
		);
	}
	if (audit.unapprovedPanels.length > 0) {
		lines.push(
			'## Awaiting lettering approval',
			'',
			audit.unapprovedPanels.map((id) => `- ${id}`).join('\n'),
			''
		);
	}
	if (audit.structureIssues.length > 0) {
		lines.push(
			'## Geometry structure issues',
			'',
			...audit.structureIssues.map(
				(issue) => `- **${issue.code}** — ${issue.path}: ${issue.message}`
			),
			''
		);
	}
	if (audit.layoutIssues.length > 0) {
		lines.push(
			'## Balloon and tail routing issues',
			'',
			...audit.layoutIssues.map(
				(issue) => `- **${issue.code}** — ${issue.panelId}/${issue.dialogueId}: ${issue.message}`
			),
			''
		);
	}
	lines.push(
		'## Approval rule',
		'',
		'Clean artwork and lettering are separate states. Publication requires every dialogue panel to have approved speaker anchors and protected zones, with zero balloon or tail collisions.',
		''
	);
	return `${lines.join('\n')}\n`;
}

export async function scaffoldLetteringGeometry(sources, options = {}) {
	const blank = {
		format: LETTERING_GEOMETRY_FORMAT,
		formatVersion: LETTERING_GEOMETRY_VERSION,
		panels: {}
	};
	const existingIssues =
		sources.letteringGeometry === null ? [] : validateLetteringGeometryStructure(sources);
	if (existingIssues.length > 0 && !options.force) {
		throw new ComicToolError(
			'Existing lettering geometry is invalid. Repair it or pass --force to replace it.',
			existingIssues.map((issue) => ({ severity: 'error', ...issue }))
		);
	}
	const existing =
		existingIssues.length === 0 &&
		isPlainObject(sources.letteringGeometry) &&
		isPlainObject(sources.letteringGeometry.panels)
			? sources.letteringGeometry
			: blank;
	const panels = { ...existing.panels };
	for (const page of sources.pages) {
		for (const panel of page.panels) {
			if ((panel.dialogue?.length ?? 0) === 0 || panels[panel.id]) continue;
			panels[panel.id] = {
				status: 'needs-review',
				speakerAnchors: {},
				protectedZones: []
			};
		}
	}
	const value = {
		format: LETTERING_GEOMETRY_FORMAT,
		formatVersion: LETTERING_GEOMETRY_VERSION,
		panels: Object.fromEntries(
			Object.entries(panels).sort(([left], [right]) => left.localeCompare(right, 'en'))
		)
	};
	const source = stringifyYaml(value, { lineWidth: 100 });
	const changed = await writeFileIfChanged(sources.letteringGeometryFile, source);
	return {
		file: sources.letteringGeometryFile,
		value,
		changed,
		panelCount: Object.keys(value.panels).length
	};
}

export function renderTranscript(metadata, pages, data = {}) {
	const seriesTitle =
		isPlainObject(data.series) && isNonEmptyString(data.series.title)
			? data.series.title
			: String(metadata.seriesSlug ?? metadata.seriesId ?? 'Comic series')
					.split('-')
					.map((part) => `${part.slice(0, 1).toLocaleUpperCase('en')}${part.slice(1)}`)
					.join(' ');
	const lines = [
		`# ${metadata.title} — accessible transcript`,
		'',
		`**Series:** ${seriesTitle}  `,
		`**Album:** ${metadata.id}  `,
		`**Category:** ${metadata.category}  `,
		`**Story pages:** ${metadata.storyPageCount}  `,
		`**Reading direction:** Left to right`,
		'',
		'This transcript follows the canonical page and panel order. Visual descriptions and dialogue are presented once for accessible reading.',
		''
	];

	for (const page of [...pages].sort((left, right) => Number(left.page) - Number(right.page))) {
		lines.push(`## Page ${page.page} — ${page.title}`, '');
		for (const panel of [...(page.panels ?? [])].sort(
			(left, right) => Number(left.panel) - Number(right.panel)
		)) {
			lines.push(`### Panel ${panel.panel} (${panel.id})`, '');
			lines.push(
				panel.accessibility?.description || panel.accessibility?.alt || panel.action || '',
				''
			);
			for (const overlay of panel.overlays ?? deterministicTextOverlays(data, panel.id)) {
				lines.push(`**Visible text (${overlay.kind}):** ${overlay.text}`, '');
			}
			if (panel.caption) lines.push(`**Caption:** ${panel.caption}`, '');
			for (const narration of panelNarrationInReadingOrder(panel)) {
				if (narration.kind === 'dialogue') {
					const dialogue = narration.entry;
					const speaker =
						collectionRecord(data, 'characters', dialogue.speaker)?.name ?? dialogue.speaker;
					lines.push(`**${speaker}:** ${dialogue.text}`, '');
				} else {
					const soundEffect = narration.entry;
					lines.push(
						`**Sound:** ${soundEffect.text}${soundEffect.description ? ` — ${soundEffect.description}` : ''}`,
						''
					);
				}
			}
			if (panel.visualJoke) lines.push(`**Visual note:** ${panel.visualJoke}`, '');
		}
	}
	return `${lines.join('\n').trimEnd()}\n`;
}

function compiledSafeTailRoute(route) {
	const points = [route?.start, route?.control, route?.end];
	if (
		route?.safe !== true ||
		!['up', 'down', 'left', 'right'].includes(route.side) ||
		!points.every(
			(point) => isPlainObject(point) && finiteNormalized(point.x) && finiteNormalized(point.y)
		)
	) {
		return null;
	}
	return {
		start: { x: route.start.x, y: route.start.y },
		control: { x: route.control.x, y: route.control.y },
		end: { x: route.end.x, y: route.end.y },
		side: route.side,
		safe: true
	};
}

function compiledEpisodeObject(sources) {
	const lettering = letteringManifestObject(sources);
	const overlaysByPanel = new Map();
	for (const entry of lettering.entries) {
		const entries = overlaysByPanel.get(entry.panelId) ?? [];
		entries.push(entry);
		overlaysByPanel.set(entry.panelId, entries);
	}
	return {
		format: 'suvroghosh-comic-episode',
		formatVersion: 1,
		sourceDigest: sources.sourceDigest,
		letteringDigest: sources.letteringDigest,
		generatedFrom: sources.sources.map(({ filename, source }) => ({
			path: relativeToRoot(sources.root, filename),
			sha256: sha256(normalizeNewlines(source))
		})),
		metadata: sources.metadata,
		data: sources.data,
		exceptions: sources.exceptions,
		frontMatter: sources.frontMatter,
		lettering,
		pages: [...sources.pages]
			.sort((left, right) => Number(left.page) - Number(right.page))
			.map((page) => {
				const placements = new Map(
					panelPlacements(page).map((placement) => [placement.panel.id, placement])
				);
				return {
					...page,
					panels: (page.panels ?? []).map((panel) => {
						const placement = placements.get(panel.id);
						const plan = planPanelLettering(sources, panel, { placement });
						const plannedByDialogue = new Map(
							plan.entries.map((entry) => [entry.dialogue.id, entry])
						);
						const suppressedTailDialogueIds = new Set(
							plan.entries
								.filter(
									(entry, index) =>
										plan.entries[index + 1]?.dialogue.speaker === entry.dialogue.speaker
								)
								.map((entry) => entry.dialogue.id)
						);
						return {
							...panel,
							dialogue: (panel.dialogue ?? []).map((dialogue) => {
								const planned = plannedByDialogue.get(dialogue.id);
								const tailRoute = compiledSafeTailRoute(planned?.tailRoute);
								const resolvedDialogue = {
									...dialogue,
									balloon: {
										...dialogue.balloon,
										...(planned?.balloon ?? {}),
										...(tailRoute ? { tailRoute } : {}),
										...(suppressedTailDialogueIds.has(dialogue.id) ? { tailDirection: 'none' } : {})
									}
								};
								const fitted = placement ? fittedDialogueText(resolvedDialogue, placement) : null;
								return {
									...resolvedDialogue,
									balloon: {
										...resolvedDialogue.balloon,
										...(fitted ? { renderScale: fitted.renderScale } : {})
									}
								};
							}),
							overlays: overlaysByPanel.get(panel.id) ?? []
						};
					})
				};
			})
	};
}

export async function compileEpisode(options = {}) {
	const sources = options.sources ?? (await loadEpisodeSources(options));
	const compiled = compiledEpisodeObject(sources);
	const transcript = renderTranscript(compiled.metadata, compiled.pages, compiled.data);
	const compiledPath =
		options.compiledPath ?? path.join(sources.episodeDirectory, 'generated', 'episode.json');
	const transcriptPath =
		options.transcriptFile ?? path.join(sources.episodeDirectory, 'transcript.md');
	const letteringManifestPath =
		options.letteringManifestPath ??
		path.join(sources.episodeDirectory, 'generated', 'lettering-manifest.json');
	const compiledChanged = await writeFileIfChanged(compiledPath, stableJson(compiled));
	const transcriptChanged = await writeFileIfChanged(transcriptPath, transcript);
	const letteringManifestChanged = await writeFileIfChanged(
		letteringManifestPath,
		stableJson(compiled.lettering)
	);
	return {
		sources,
		compiled,
		transcript,
		compiledPath,
		transcriptPath,
		letteringManifestPath,
		changed: [
			compiledChanged ? compiledPath : null,
			transcriptChanged ? transcriptPath : null,
			letteringManifestChanged ? letteringManifestPath : null
		].filter(Boolean)
	};
}

function unknownKeys(value, allowed) {
	if (!isPlainObject(value)) return [];
	return Object.keys(value).filter((key) => !allowed.has(key));
}

function balancedDialogueQuotes(value) {
	const text = String(value);
	const straight = (text.match(/"/g) ?? []).length;
	const opening = (text.match(/“/g) ?? []).length;
	const closing = (text.match(/”/g) ?? []).length;
	return straight % 2 === 0 && opening === closing;
}

function validateStringArray(value) {
	return (
		Array.isArray(value) &&
		value.every(isNonEmptyString) &&
		new Set(value.map((item) => item.toLocaleLowerCase('en'))).size === value.length
	);
}

function normalizeIssuePath(value) {
	return value || 'episode';
}

function issueSummary(issue) {
	return `${issue.severity.toUpperCase()} ${issue.code} ${issue.path}: ${issue.message}`;
}

function sourceTextForCanonScan(sources) {
	return sources.sources
		.filter(({ filename }) => !/\bmigration\b/i.test(path.basename(filename)))
		.map(({ filename, source }) => ({
			path: relativeToRoot(sources.root, filename),
			text: normalizeNewlines(source)
		}));
}

function promptTextForPanel(panel) {
	return flattenStrings(panel.prompt ?? {}).join('\n');
}

function validateNormalizedBox(balloon, add, issuePath) {
	for (const key of unknownKeys(balloon, BALLOON_KEYS)) {
		add('error', 'balloon-unknown-field', issuePath, `Unknown ComicBalloon field "${key}".`);
	}
	for (const field of ['x', 'y', 'width', 'height']) {
		const value = balloon?.[field];
		if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
			add(
				'error',
				'balloon-bounds',
				issuePath,
				`${field} must be a finite normalized value from 0 to 1.`
			);
		}
	}
	if (
		typeof balloon?.x === 'number' &&
		typeof balloon?.width === 'number' &&
		balloon.x + balloon.width > 1 + Number.EPSILON
	) {
		add('error', 'balloon-bounds', issuePath, 'x + width must not exceed 1.');
	}
	if (
		typeof balloon?.y === 'number' &&
		typeof balloon?.height === 'number' &&
		balloon.y + balloon.height > 1 + Number.EPSILON
	) {
		add('error', 'balloon-bounds', issuePath, 'y + height must not exceed 1.');
	}
	if (!Number.isInteger(balloon?.z) || balloon.z < 0) {
		add('error', 'balloon-z', issuePath, 'z must be a non-negative integer.');
	}
	if (balloon?.tailTarget !== undefined) {
		if (!isPlainObject(balloon.tailTarget)) {
			add('error', 'balloon-tail', issuePath, 'tailTarget must be a normalized {x, y} point.');
		} else {
			for (const key of unknownKeys(balloon.tailTarget, NORMALIZED_POINT_KEYS)) {
				add('error', 'balloon-tail-unknown-field', issuePath, `Unknown tailTarget field "${key}".`);
			}
		}
		for (const field of ['x', 'y']) {
			const value = balloon.tailTarget?.[field];
			if (typeof value !== 'number' || value < 0 || value > 1) {
				add(
					'error',
					'balloon-tail',
					issuePath,
					`tailTarget.${field} must be a normalized value from 0 to 1.`
				);
			}
		}
	}
	if (
		balloon?.tailDirection !== undefined &&
		!BALLOON_TAIL_DIRECTIONS.includes(balloon.tailDirection)
	) {
		add(
			'error',
			'balloon-tail-direction',
			issuePath,
			`tailDirection must be one of ${BALLOON_TAIL_DIRECTIONS.join(', ')}.`
		);
	}
	if (
		balloon?.fontScale !== undefined &&
		(typeof balloon.fontScale !== 'number' ||
			!Number.isFinite(balloon.fontScale) ||
			balloon.fontScale < 0.5 ||
			balloon.fontScale > 2)
	) {
		add('error', 'balloon-font-scale', issuePath, 'fontScale must be between 0.5 and 2.');
	}
}

function artIsGenerated(status) {
	return status !== 'missing';
}

function publicStaticSource(value) {
	return (
		typeof value === 'string' &&
		(/(?:^|[\\/])static[\\/]/i.test(value) ||
			/^\/(?:images|photos|thumbnail|sketch)\//i.test(value))
	);
}

async function loadPromptManifest(sources) {
	const manifestPath = path.join(sources.episodeDirectory, 'prompts', 'manifest.json');
	if (!(await pathExists(manifestPath))) return { manifest: null, manifestPath };
	try {
		return { manifest: JSON.parse(await readUtf8(manifestPath)), manifestPath };
	} catch (error) {
		return {
			manifest: null,
			manifestPath,
			error: `Prompt manifest is invalid JSON: ${error instanceof Error ? error.message : error}`
		};
	}
}

async function verifyPromptCoverage(sources, panels, add, options) {
	if (options.checkPromptManifest === false) return;
	const loaded = await loadPromptManifest(sources);
	if (loaded.error) {
		add(
			'error',
			'prompt-manifest',
			relativeToRoot(sources.root, loaded.manifestPath),
			loaded.error
		);
		return;
	}
	const manifest = loaded.manifest;
	const generatedPanels = panels.filter((panel) => artIsGenerated(panel.art?.status));
	if (!manifest) {
		if (options.requirePromptsForArt !== false && generatedPanels.length > 0) {
			add(
				'error',
				'prompt-coverage',
				'prompts/manifest.json',
				`${generatedPanels.length} panel(s) have generated art state but no prompt manifest exists.`
			);
		} else if (options.reportMissingPromptManifest !== false) {
			add(
				'warning',
				'prompt-manifest-missing',
				'prompts/manifest.json',
				'Prompt generation has not produced a manifest yet.'
			);
		}
		return;
	}

	if (!Array.isArray(manifest.entries)) {
		add('error', 'prompt-manifest', 'prompts/manifest.json', 'entries must be an array.');
		return;
	}
	if (
		manifest.format !== 'suvroghosh-comic-prompts' ||
		manifest.formatVersion !== 1 ||
		manifest.episodeId !== sources.metadata.id ||
		manifest.seriesSlug !== sources.metadata.seriesSlug ||
		manifest.episodeSlug !== sources.metadata.slug
	) {
		add(
			'error',
			'prompt-manifest-identity',
			'prompts/manifest.json',
			'Prompt manifest format, version, series, or episode identity does not match the canonical episode.'
		);
	}
	if (manifest.sourceDigest !== sources.sourceDigest) {
		add(
			'error',
			'prompt-manifest-stale',
			'prompts/manifest.json',
			'Prompt manifest sourceDigest is stale relative to canonical sources.'
		);
	}
	if (manifest.entryCount !== panels.length || manifest.entries.length !== panels.length) {
		add(
			'error',
			'prompt-manifest-count',
			'prompts/manifest.json',
			`Prompt manifest must declare exactly ${panels.length} entries.`
		);
	}
	const canonicalPanels = new Map();
	for (const page of sources.pages) {
		for (const panel of page.panels ?? []) canonicalPanels.set(panel.id, { page, panel });
	}
	const byPanel = new Map();
	for (const [index, entry] of manifest.entries.entries()) {
		if (!isNonEmptyString(entry?.panelId)) {
			add(
				'error',
				'prompt-entry',
				`prompts/manifest.json entries[${index}]`,
				'panelId must be a non-empty string.'
			);
			continue;
		}
		if (byPanel.has(entry.panelId)) {
			add(
				'error',
				'prompt-duplicate',
				`prompts/manifest.json entries[${index}]`,
				`panelId ${entry.panelId} is duplicated.`
			);
		}
		byPanel.set(entry.panelId, entry);
	}

	let stalePromptCount = 0;
	for (const panel of panels) {
		const entry = byPanel.get(panel.id);
		if (!entry) {
			add(
				'error',
				'prompt-coverage',
				panel.id,
				'Every panel must have exactly one prompt manifest entry once a manifest exists.'
			);
			continue;
		}
		const canonical = canonicalPanels.get(panel.id);
		const expectedReferences = {
			characters: panel.characters.map((character) => character.id),
			location: panel.location,
			props: panel.props
		};
		if (
			entry.page !== canonical?.page.page ||
			entry.panel !== panel.panel ||
			entry.version !== 1 ||
			stableJson(entry.referenceIds ?? null) !== stableJson(expectedReferences)
		) {
			add(
				'error',
				'prompt-entry-canon',
				panel.id,
				'Prompt entry page, panel, version, or canonical reference IDs are stale.'
			);
		}
		if (!isNonEmptyString(entry.file) || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '')) {
			add(
				'error',
				'prompt-entry',
				panel.id,
				'Prompt entry requires a relative file and SHA-256 hash.'
			);
			continue;
		}
		const promptPath = path.resolve(sources.episodeDirectory, entry.file);
		const relativePrompt = path.relative(sources.episodeDirectory, promptPath);
		if (relativePrompt.startsWith('..') || path.isAbsolute(relativePrompt)) {
			add(
				'error',
				'prompt-path',
				panel.id,
				`Prompt path escapes the episode directory: ${entry.file}.`
			);
			continue;
		}
		if (!(await pathExists(promptPath))) {
			add('error', 'prompt-file', panel.id, `Prompt file does not exist: ${entry.file}.`);
			continue;
		}
		const prompt = await readUtf8(promptPath);
		if (sha256(prompt) !== entry.sha256) {
			add('error', 'prompt-hash', panel.id, `Prompt hash is stale for ${entry.file}.`);
		}
		if (canonical && prompt !== panelPromptText(sources, canonical.page, canonical.panel)) {
			stalePromptCount += 1;
		}
		NAMED_REFERENCE_PATTERN.lastIndex = 0;
		if (NAMED_REFERENCE_PATTERN.test(prompt)) {
			add(
				'error',
				'named-style-reference',
				panel.id,
				'Generated prompt contains a named artist or franchise reference.'
			);
		}
	}
	for (const panelId of byPanel.keys()) {
		if (!panels.some((panel) => panel.id === panelId)) {
			add('error', 'prompt-orphan', panelId, 'Prompt manifest entry has no canonical panel.');
		}
	}
	if (stalePromptCount > 0) {
		add(
			'error',
			'prompt-content-stale',
			'prompts/manifest.json',
			`${stalePromptCount} prompt file(s) do not exactly match their current canonical panel inputs.`
		);
	}
}

function approvedCredit(credits, rolePattern) {
	const credit = Array.isArray(credits)
		? credits.find((entry) => rolePattern.test(String(entry?.role ?? '')))
		: null;
	return Boolean(
		credit &&
		isNonEmptyString(credit.name) &&
		['approved', 'complete', 'final', 'human-approved', 'approved-for-publication'].includes(
			credit.state
		)
	);
}

async function publishedStaticFile(sources, value) {
	if (!isNonEmptyString(value) || !value.startsWith('/')) return null;
	const staticRoot = path.join(sources.root, 'static');
	const filename = path.resolve(staticRoot, ...value.split('/').filter(Boolean));
	if (!isInside(staticRoot, filename) || !(await pathExists(filename))) return null;
	return filename;
}

async function verifyPublicationReadiness(sources, panels, add) {
	const frontMatterPath = path.join(sources.episodeDirectory, 'front-and-end-matter.yaml');
	let frontMatter;
	try {
		frontMatter = (await readStructuredFile(frontMatterPath)).value;
	} catch (error) {
		add(
			'error',
			'publication-front-matter',
			'front-and-end-matter.yaml',
			error instanceof Error ? error.message : String(error)
		);
	}
	if (!isPlainObject(frontMatter)) {
		add(
			'error',
			'publication-front-matter',
			'front-and-end-matter.yaml',
			'Published episodes require structured front/end matter and release approvals.'
		);
		frontMatter = {};
	}

	const gate = frontMatter.publicationGate;
	const requiredGateFields = [
		'coverApproved',
		'allPanelsFinal',
		'dialogueApproved',
		'letteringApproved',
		'allRightsRecorded',
		'bengaliReviewed',
		'culturalReviewApproved',
		'accessibilityApproved',
		'responsiveReaderApproved',
		'printApproved',
		'epubApproved',
		'finalEditorApproved'
	];
	if (!isPlainObject(gate)) {
		add(
			'error',
			'publication-gate',
			'front-and-end-matter.yaml',
			'publicationGate must be an object of explicit human release decisions.'
		);
	} else {
		const incomplete = requiredGateFields.filter((field) => gate[field] !== true);
		if (incomplete.length > 0) {
			add(
				'error',
				'publication-gate',
				'front-and-end-matter.yaml',
				`Publication approvals are not true: ${incomplete.join(', ')}.`
			);
		}
	}

	const letteringAudit = auditLettering(sources, { requireApproved: true });
	if (!letteringAudit.ready) {
		add(
			'error',
			'publication-lettering',
			'lettering/geometry.yaml',
			`Collision-aware lettering is not publication-ready: ${letteringAudit.summary.missingGeometry} panel(s) lack geometry, ${letteringAudit.summary.unapprovedGeometry} await approval, ${letteringAudit.summary.structureIssues} structure issue(s), and ${letteringAudit.summary.layoutIssues} collision or routing issue(s).`
		);
	}

	const credits = frontMatter.credits;
	for (const [label, pattern] of [
		['final art', /final art/i],
		['Bengali-language review', /Bengali.*review/i],
		['cultural review', /cultural review/i],
		['final publication editor', /final publication editor/i]
	]) {
		if (!approvedCredit(credits, pattern)) {
			add(
				'error',
				'publication-human-approval',
				'front-and-end-matter.yaml',
				`The ${label} credit requires a named human and an approved state.`
			);
		}
	}

	const unapprovedSigns = collectionRecords(sources.data, 'signage').filter(
		(sign) => bengaliSignText(sign) && !bengaliSignIsApproved(sign)
	);
	if (unapprovedSigns.length > 0) {
		add(
			'error',
			'publication-signage',
			'data/signage.yaml',
			`${unapprovedSigns.length} Bengali signage record(s) lack named, dated approval and publication permission: ${unapprovedSigns
				.slice(0, 5)
				.map((sign) => sign.id ?? 'unknown')
				.join(', ')}${unapprovedSigns.length > 5 ? ', …' : ''}.`
		);
	}

	const missingPublicPanelFiles = [];
	for (const panel of panels) {
		if (!(await publishedStaticFile(sources, panel.art?.final)))
			missingPublicPanelFiles.push(panel.id);
	}
	if (missingPublicPanelFiles.length > 0) {
		add(
			'error',
			'publication-public-art',
			'episode.yaml',
			`${missingPublicPanelFiles.length} final panel path(s) are not existing root-relative public derivatives: ${missingPublicPanelFiles
				.slice(0, 5)
				.join(', ')}${missingPublicPanelFiles.length > 5 ? ', …' : ''}.`
		);
	}
	if (!(await publishedStaticFile(sources, sources.metadata.cover))) {
		add(
			'error',
			'publication-cover',
			'episode.yaml',
			'Published metadata.cover must reference an existing root-relative public derivative.'
		);
	}
	if (!(await publishedStaticFile(sources, sources.metadata.printPath))) {
		add(
			'error',
			'publication-print',
			'episode.yaml',
			'Published metadata.printPath must reference an existing reviewed PDF under static.'
		);
	}

	const provenancePath = path.join(sources.episodeDirectory, 'provenance.json');
	let provenance;
	try {
		provenance = JSON.parse(await readUtf8(provenancePath));
	} catch (error) {
		add(
			'error',
			'publication-provenance',
			'provenance.json',
			`Published episodes require a valid provenance ledger: ${error instanceof Error ? error.message : error}`
		);
		return;
	}
	if (
		provenance.format !== 'suvroghosh-comic-provenance' ||
		provenance.formatVersion !== 1 ||
		provenance.episodeId !== sources.metadata.id ||
		provenance.episodeSlug !== sources.metadata.slug ||
		provenance.seriesSlug !== sources.metadata.seriesSlug ||
		provenance.sourceDigest !== sources.sourceDigest
	) {
		add(
			'error',
			'publication-provenance-stale',
			'provenance.json',
			'Provenance format, identity, or sourceDigest is stale relative to canonical sources.'
		);
	}
	if (provenance.publicationReady !== true || provenance.cover?.rightsReady !== true) {
		add(
			'error',
			'publication-rights',
			'provenance.json',
			'Cover and panel provenance must declare publicationReady with cover rights approval.'
		);
	}
	if (provenance.cover?.finalPath !== sources.metadata.cover) {
		add(
			'error',
			'publication-cover-provenance',
			'provenance.json',
			'Cover provenance finalPath must match metadata.cover.'
		);
	}
	const provenancePanels = Array.isArray(provenance.panels) ? provenance.panels : [];
	const byPanel = new Map(provenancePanels.map((entry) => [entry?.panelId, entry]));
	const invalidProvenance = panels.filter((panel) => {
		const entry = byPanel.get(panel.id);
		return (
			!entry ||
			entry.rightsReady !== true ||
			entry.status !== 'final' ||
			entry.revision !== panel.art.revision ||
			entry.finalPath !== panel.art.final ||
			!/^[a-f0-9]{64}$/.test(entry.finalSha256 ?? '') ||
			!isNonEmptyString(entry.approvalBy) ||
			!isNonEmptyString(entry.approvalDate)
		);
	});
	if (
		invalidProvenance.length > 0 ||
		provenancePanels.length !== panels.length ||
		byPanel.size !== panels.length
	) {
		add(
			'error',
			'publication-panel-provenance',
			'provenance.json',
			`Every canonical panel needs one matching, approved, hashed rights record; ${invalidProvenance.length} record(s) are invalid.`
		);
	}
}

export async function validateEpisode(options = {}) {
	const sources = options.sources ?? (await loadEpisodeSources(options));
	const issues = [];
	const add = (severity, code, issuePath, message) =>
		issues.push({ severity, code, path: normalizeIssuePath(issuePath), message });
	const metadata = sources.metadata;

	if (!isPlainObject(metadata)) {
		add('error', 'metadata-type', 'episode.yaml', 'Episode metadata must be an object.');
	} else {
		for (const key of unknownKeys(metadata, METADATA_KEYS)) {
			add('error', 'metadata-unknown-field', 'episode.yaml', `Unknown metadata field "${key}".`);
		}
		const requiredStrings = [
			'id',
			'slug',
			'seriesId',
			'seriesSlug',
			'title',
			'subtitle',
			'description',
			'category',
			'date',
			'dateModified',
			'readingDirection',
			'language',
			'canonicalPath',
			'transcriptPath',
			'printPath',
			'coverAlt'
		];
		for (const field of requiredStrings) {
			if (!isNonEmptyString(metadata[field])) {
				add(
					'error',
					'metadata-required',
					'episode.yaml',
					`${field} must be a trimmed non-empty string.`
				);
			}
		}
		if (!/^\d{3}$/.test(metadata.id ?? '')) {
			add('error', 'episode-id', 'episode.yaml', 'id must be exactly three digits.');
		}
		for (const field of ['slug', 'seriesId', 'seriesSlug']) {
			if (metadata[field] !== slugify(metadata[field] ?? '')) {
				add(
					'error',
					'metadata-slug',
					'episode.yaml',
					`${field} must be a canonical lowercase slug.`
				);
			}
		}
		if (metadata.category !== 'Comic') {
			add('error', 'category', 'episode.yaml', 'category must be exactly "Comic".');
		}
		if (metadata.readingDirection !== 'ltr') {
			add('error', 'reading-direction', 'episode.yaml', 'readingDirection must be "ltr".');
		}
		if (metadata.language !== 'en') {
			add('error', 'language', 'episode.yaml', 'language must be "en".');
		}
		for (const field of ['published', 'productionPreview']) {
			if (typeof metadata[field] !== 'boolean') {
				add('error', 'metadata-boolean', 'episode.yaml', `${field} must be true or false.`);
			}
		}
		if (!Number.isInteger(metadata.storyPageCount) || metadata.storyPageCount <= 0) {
			add(
				'error',
				'story-page-count',
				'episode.yaml',
				'storyPageCount must be a positive integer.'
			);
		}
		for (const field of ['tags', 'contentGuidance']) {
			if (!validateStringArray(metadata[field])) {
				add(
					'error',
					'metadata-string-array',
					'episode.yaml',
					`${field} must be a unique array of trimmed non-empty strings.`
				);
			}
		}
		if (Array.isArray(metadata.tags) && !metadata.tags.includes('Comic')) {
			add('error', 'comic-tag', 'episode.yaml', 'tags must include "Comic".');
		}
		if (
			!Array.isArray(metadata.credits) ||
			metadata.credits.length === 0 ||
			metadata.credits.some(
				(credit) => !isNonEmptyString(credit?.role) || !isNonEmptyString(credit?.name)
			)
		) {
			add('error', 'credits', 'episode.yaml', 'credits must contain role/name pairs.');
		}
		for (const field of ['date', 'dateModified']) {
			if (!isCalendarDate(metadata[field])) {
				add('error', 'metadata-date', 'episode.yaml', `${field} must be YYYY-MM-DD.`);
			}
		}
		if (
			isCalendarDate(metadata.date) &&
			isCalendarDate(metadata.dateModified) &&
			metadata.dateModified < metadata.date
		) {
			add('error', 'metadata-date-order', 'episode.yaml', 'dateModified must not precede date.');
		}
		const expectedCanonical = `/blog/comic/${metadata.seriesSlug}/${metadata.slug}`;
		if (metadata.canonicalPath !== expectedCanonical) {
			add('error', 'canonical-path', 'episode.yaml', `canonicalPath must be ${expectedCanonical}.`);
		}
		if (metadata.transcriptPath !== `${expectedCanonical}#transcript`) {
			add(
				'error',
				'transcript-path',
				'episode.yaml',
				`transcriptPath must be ${expectedCanonical}#transcript.`
			);
		}
		if (!/^\/[^\s?#]+\.pdf$/i.test(metadata.printPath ?? '')) {
			add('error', 'print-path', 'episode.yaml', 'printPath must be a root-relative PDF path.');
		}
		if (
			metadata.cover !== null &&
			metadata.cover !== undefined &&
			!isNonEmptyString(metadata.cover)
		) {
			add('error', 'cover', 'episode.yaml', 'cover must be null or a trimmed path.');
		}
		if (metadata.seriesSlug === 'the-last-analog-town' && metadata.id === '001') {
			if (metadata.title !== 'The Efficiency Inspector') {
				add(
					'error',
					'album-one-title',
					'episode.yaml',
					'The Last Analog Town album 001 title is locked as "The Efficiency Inspector".'
				);
			}
			if (metadata.storyPageCount !== 62) {
				add(
					'error',
					'album-one-page-count',
					'episode.yaml',
					'The Last Analog Town album 001 must contain exactly 62 numbered story pages.'
				);
			}
		}
	}

	const frontMatter = sources.frontMatter;
	if (frontMatter !== null) {
		if (!isPlainObject(frontMatter)) {
			add(
				'error',
				'front-matter',
				'front-and-end-matter.yaml',
				'Front/end matter must be an object.'
			);
		} else {
			if (
				frontMatter.episodeId !== metadata.id ||
				frontMatter.category !== 'Comic' ||
				frontMatter.countsOutsideStoryPages !== true
			) {
				add(
					'error',
					'front-matter-identity',
					'front-and-end-matter.yaml',
					'Front/end matter must match the episode, use category Comic, and remain outside the numbered story pages.'
				);
			}
			const storyEntry = Array.isArray(frontMatter.readingOrder)
				? frontMatter.readingOrder.find((entry) => entry?.type === 'story-pages')
				: null;
			if (
				!storyEntry ||
				storyEntry.firstPage !== 1 ||
				storyEntry.lastPage !== metadata.storyPageCount
			) {
				add(
					'error',
					'front-matter-order',
					'front-and-end-matter.yaml',
					'readingOrder must place story pages 1 through storyPageCount as one ordered section.'
				);
			}
			const endMatter = frontMatter.productionEndMatter;
			for (const field of [
				'heading',
				'publicEditionText',
				'secondAlbumPromise',
				'hybridRulesHeading'
			]) {
				if (!isNonEmptyString(endMatter?.[field])) {
					add(
						'error',
						'front-matter-content',
						'front-and-end-matter.yaml',
						`productionEndMatter.${field} must be authored.`
					);
				}
			}
			if (!validateStringArray(endMatter?.hybridRules)) {
				add(
					'error',
					'front-matter-rules',
					'front-and-end-matter.yaml',
					'productionEndMatter.hybridRules must be a unique array of authored rules.'
				);
			} else if (
				metadata.seriesSlug === 'the-last-analog-town' &&
				metadata.id === '001' &&
				endMatter.hybridRules.length !== 11
			) {
				add(
					'error',
					'front-matter-rules',
					'front-and-end-matter.yaml',
					'Album 001 end matter must preserve all eleven binding operating conditions.'
				);
			}
		}
	} else if (metadata.seriesSlug === 'the-last-analog-town' && metadata.id === '001') {
		add(
			'error',
			'front-matter-missing',
			'front-and-end-matter.yaml',
			'Album 001 requires cover/title/credits/end-matter structure outside its 62 story pages.'
		);
	}

	const pages = [...sources.pages].sort((left, right) => Number(left.page) - Number(right.page));
	const expectedPageCount = Number(metadata.storyPageCount);
	if (pages.length !== expectedPageCount) {
		add(
			'error',
			'page-count',
			'script/pages',
			`Expected exactly ${expectedPageCount} canonical story pages; found ${pages.length}.`
		);
	}
	const actualPageNumbers = pages.map((page) => Number(page.page));
	const expectedPageNumbers = Array.from({ length: expectedPageCount }, (_, index) => index + 1);
	if (
		actualPageNumbers.length !== expectedPageNumbers.length ||
		actualPageNumbers.some((value, index) => value !== expectedPageNumbers[index])
	) {
		const missing = expectedPageNumbers.filter((value) => !actualPageNumbers.includes(value));
		const duplicates = actualPageNumbers.filter(
			(value, index) => actualPageNumbers.indexOf(value) !== index
		);
		add(
			'error',
			'page-sequence',
			'script/pages',
			`Page numbers must be sequential 1–${expectedPageCount}; missing [${missing.join(', ')}], duplicates [${[
				...new Set(duplicates)
			].join(', ')}].`
		);
	}

	const characterIds = collectionIdSet(sources.data, 'characters');
	const locationIds = collectionIdSet(sources.data, 'locations');
	const propIds = collectionIdSet(sources.data, 'props');
	if (characterIds.size === 0) {
		add('error', 'character-data', 'data/characters', 'No canonical character IDs were loaded.');
	}
	if (locationIds.size === 0) {
		add('error', 'location-data', 'data/locations', 'No canonical location IDs were loaded.');
	}
	if (propIds.size === 0) {
		add('error', 'prop-data', 'data/props', 'No canonical prop IDs were loaded.');
	}

	const seenPanelIds = new Set();
	const seenDialogueIds = new Set();
	const allPanels = [];
	for (const [pageIndex, page] of pages.entries()) {
		const pageNumber = Number(page.page);
		const pagePath = `page ${pageNumber || pageIndex + 1}`;
		if (!isPlainObject(page)) {
			add('error', 'page-type', pagePath, 'Page must be an object.');
			continue;
		}
		const sourceEntry = sources.pageSources.find((entry) => entry.page === page);
		const expectedFilename = `page-${pad(pageNumber)}.yaml`;
		if (!sourceEntry || path.basename(sourceEntry.filename) !== expectedFilename) {
			add(
				'error',
				'page-filename',
				pagePath,
				`Canonical page ${pageNumber} must be stored as script/pages/${expectedFilename}.`
			);
		}
		for (const key of unknownKeys(page, PAGE_KEYS)) {
			add('error', 'page-unknown-field', pagePath, `Unknown ComicPage field "${key}".`);
		}
		for (const field of [
			'title',
			'purpose',
			'location',
			'time',
			'layout',
			'dialogueGoal',
			'pageTurn',
			'visualMotif'
		]) {
			if (!isNonEmptyString(page[field])) {
				add('error', 'page-required', pagePath, `${field} must be a trimmed non-empty string.`);
			}
		}
		if (!locationIds.has(page.location)) {
			add('error', 'page-location-ref', pagePath, `Unknown page location "${page.location}".`);
		}
		if (!validateStringArray(page.continuity) || page.continuity.length === 0) {
			add(
				'error',
				'page-continuity',
				pagePath,
				'continuity must contain at least one unique note.'
			);
		}
		if (!Array.isArray(page.panels)) {
			add('error', 'page-panels', pagePath, 'panels must be an array.');
			continue;
		}
		if (page.panelCount !== page.panels.length) {
			add(
				'error',
				'panel-count-field',
				pagePath,
				`panelCount is ${page.panelCount}; panels contains ${page.panels.length}.`
			);
		}
		const assemblyPlacements = new Map(
			panelPlacements(page).map((placement) => [placement.panel.id, placement])
		);
		const countException = exceptionReason(sources.exceptions, pageNumber);
		if (
			(page.panels.length < PANEL_COUNT_MIN || page.panels.length > PANEL_COUNT_MAX) &&
			!countException
		) {
			add(
				'error',
				'panel-count-guideline',
				pagePath,
				`${page.panels.length} panels is outside ${PANEL_COUNT_MIN}–${PANEL_COUNT_MAX}; declare a reason in script/exceptions.yaml.`
			);
		}
		if (
			page.panels.length >= PANEL_COUNT_MIN &&
			page.panels.length <= PANEL_COUNT_MAX &&
			countException
		) {
			add(
				'warning',
				'panel-count-exception-unused',
				pagePath,
				'Panel-count exception is declared although the page is inside the standard guideline.'
			);
		}

		const panelNumbers = page.panels.map((panel) => Number(panel?.panel));
		if (panelNumbers.some((value, index) => value !== index + 1)) {
			add('error', 'panel-sequence', pagePath, 'Panel numbers must be sequential in source order.');
		}
		for (const [panelIndex, panel] of page.panels.entries()) {
			const panelPath = `${pagePath} panel ${panelIndex + 1}`;
			if (!isPlainObject(panel)) {
				add('error', 'panel-type', panelPath, 'Panel must be an object.');
				continue;
			}
			allPanels.push(panel);
			for (const key of unknownKeys(panel, PANEL_KEYS)) {
				add('error', 'panel-unknown-field', panelPath, `Unknown ComicPanel field "${key}".`);
			}
			const expectedPanelId = `p${pad(pageNumber, 2)}-${pad(panelIndex + 1, 2)}`;
			if (panel.id !== expectedPanelId) {
				add('error', 'panel-id', panelPath, `Panel id must be ${expectedPanelId}.`);
			}
			if (seenPanelIds.has(panel.id)) {
				add('error', 'panel-id-duplicate', panelPath, `Panel id ${panel.id} is duplicated.`);
			}
			seenPanelIds.add(panel.id);
			if (!COMIC_PAGE_SIZES.includes(panel.size)) {
				add('error', 'panel-size', panelPath, `Unknown panel size "${panel.size}".`);
			}
			if (!/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(panel.aspectRatio ?? '')) {
				add(
					'error',
					'aspect-ratio',
					panelPath,
					'aspectRatio must use a numeric width:height form.'
				);
			}
			for (const field of [
				'camera',
				'location',
				'time',
				'foreground',
				'middleGround',
				'background',
				'action'
			]) {
				if (!isNonEmptyString(panel[field])) {
					add('error', 'panel-required', panelPath, `${field} must be a trimmed non-empty string.`);
				}
			}
			for (const field of ['caption', 'visualJoke']) {
				if (
					panel[field] !== undefined &&
					panel[field] !== null &&
					!isNonEmptyString(panel[field])
				) {
					add(
						'error',
						'panel-optional-string',
						panelPath,
						`${field} must be null, omitted, or a trimmed non-empty string.`
					);
				}
			}
			if (!locationIds.has(panel.location)) {
				add('error', 'panel-location-ref', panelPath, `Unknown location "${panel.location}".`);
			}
			if (!Array.isArray(panel.characters)) {
				add('error', 'panel-characters', panelPath, 'characters must be an array.');
			}
			const presentCharacterIds = new Set();
			for (const [characterIndex, character] of (panel.characters ?? []).entries()) {
				const characterPath = `${panelPath} characters[${characterIndex}]`;
				if (!isPlainObject(character) || !isNonEmptyString(character.id)) {
					add('error', 'character-beat', characterPath, 'Character beat requires an id.');
					continue;
				}
				for (const key of unknownKeys(character, CHARACTER_BEAT_KEYS)) {
					add(
						'error',
						'character-unknown-field',
						characterPath,
						`Unknown ComicCharacterBeat field "${key}".`
					);
				}
				if (presentCharacterIds.has(character.id)) {
					add(
						'error',
						'character-duplicate',
						characterPath,
						`Character ${character.id} appears twice.`
					);
				}
				presentCharacterIds.add(character.id);
				if (!characterIds.has(character.id)) {
					add('error', 'character-ref', characterPath, `Unknown character "${character.id}".`);
				}
				for (const field of ['position', 'emotion', 'pose']) {
					if (!isNonEmptyString(character[field])) {
						add('error', 'character-beat', characterPath, `${field} must be non-empty.`);
					}
				}
				if (
					character.facing !== undefined &&
					!['left', 'right', 'front', 'away'].includes(character.facing)
				) {
					add('error', 'character-facing', characterPath, `Unknown facing "${character.facing}".`);
				}
			}
			if (!validateStringArray(panel.props)) {
				add('error', 'panel-props', panelPath, 'props must be a unique array of IDs.');
			} else {
				for (const prop of panel.props) {
					if (!propIds.has(prop)) add('error', 'prop-ref', panelPath, `Unknown prop "${prop}".`);
				}
			}
			if (!validateStringArray(panel.continuity) || panel.continuity.length === 0) {
				add(
					'error',
					'panel-continuity',
					panelPath,
					'continuity must contain at least one unique note.'
				);
			}
			if (!isPlainObject(panel.prompt)) {
				add('error', 'panel-prompt', panelPath, 'prompt must be an object.');
			} else {
				for (const key of unknownKeys(panel.prompt, PROMPT_KEYS)) {
					add('error', 'prompt-unknown-field', panelPath, `Unknown panel prompt field "${key}".`);
				}
				for (const field of ['lighting', 'palette', 'composition']) {
					if (!isNonEmptyString(panel.prompt[field])) {
						add('error', 'panel-prompt', panelPath, `prompt.${field} must be non-empty.`);
					}
				}
				for (const field of ['balloonSafeAreas', 'negative']) {
					if (!validateStringArray(panel.prompt[field])) {
						add(
							'error',
							'panel-prompt',
							panelPath,
							`prompt.${field} must be a unique string array.`
						);
					}
				}
				const promptText = promptTextForPanel(panel);
				NAMED_REFERENCE_PATTERN.lastIndex = 0;
				if (NAMED_REFERENCE_PATTERN.test(promptText)) {
					add(
						'error',
						'named-style-reference',
						panelPath,
						'Prompt fields contain a named artist or franchise reference.'
					);
				}
				const normalizedNegative = (panel.prompt.negative ?? []).join(' ').toLocaleLowerCase('en');
				for (const requirement of REQUIRED_NEGATIVE_GUIDANCE) {
					if (!normalizedNegative.includes(requirement.toLocaleLowerCase('en'))) {
						add(
							'warning',
							'negative-guidance',
							panelPath,
							`Prompt negative guidance does not mention "${requirement}".`
						);
					}
				}
			}
			if (
				!isPlainObject(panel.accessibility) ||
				!isNonEmptyString(panel.accessibility.alt) ||
				!isNonEmptyString(panel.accessibility.description)
			) {
				add(
					'error',
					'panel-accessibility',
					panelPath,
					'accessibility.alt and accessibility.description are required.'
				);
			} else {
				for (const key of unknownKeys(panel.accessibility, ACCESSIBILITY_KEYS)) {
					add(
						'error',
						'accessibility-unknown-field',
						panelPath,
						`Unknown accessibility field "${key}".`
					);
				}
				if (panel.accessibility.alt.length < 20) {
					add('warning', 'alt-short', panelPath, 'Accessibility alt text is unusually short.');
				}
				if (panel.accessibility.description.length < panel.accessibility.alt.length) {
					add(
						'warning',
						'description-short',
						panelPath,
						'Expanded description is shorter than the panel alt text.'
					);
				}
			}
			if (!isPlainObject(panel.art) || !COMIC_PANEL_STATUSES.includes(panel.art.status)) {
				add(
					'error',
					'art-status',
					panelPath,
					`art.status must be one of ${COMIC_PANEL_STATUSES.join(', ')}.`
				);
			} else {
				for (const key of unknownKeys(panel.art, ART_KEYS)) {
					add('error', 'art-unknown-field', panelPath, `Unknown art field "${key}".`);
				}
				if (!Number.isInteger(panel.art.revision) || panel.art.revision < 0) {
					add('error', 'art-revision', panelPath, 'art.revision must be a non-negative integer.');
				}
				for (const field of ['source', 'final']) {
					if (
						panel.art[field] !== undefined &&
						panel.art[field] !== null &&
						!isNonEmptyString(panel.art[field])
					) {
						add(
							'error',
							'art-path',
							panelPath,
							`art.${field} must be null, omitted, or a trimmed non-empty path.`
						);
					}
				}
				for (const field of ['width', 'height']) {
					if (
						panel.art[field] !== undefined &&
						panel.art[field] !== null &&
						(!Number.isInteger(panel.art[field]) || panel.art[field] <= 0)
					) {
						add(
							'error',
							'art-dimensions',
							panelPath,
							`art.${field} must be null, omitted, or a positive integer.`
						);
					}
				}
				if (panel.art.anchor !== undefined && !ART_ANCHORS.has(panel.art.anchor)) {
					add(
						'error',
						'art-anchor',
						panelPath,
						'art.anchor must be one of top, center, or bottom when provided.'
					);
				}
				if (publicStaticSource(panel.art.source)) {
					add(
						'error',
						'raw-art-public',
						panelPath,
						'art.source must stay outside static/public asset roots.'
					);
				}
				if (
					['draft', 'needs-review', 'rejected'].includes(panel.art.status) &&
					!isNonEmptyString(panel.art.source)
				) {
					add('error', 'art-source', panelPath, `${panel.art.status} art requires art.source.`);
				}
				if (['approved', 'final'].includes(panel.art.status)) {
					if (!isNonEmptyString(panel.art.final)) {
						add('error', 'art-final', panelPath, `${panel.art.status} art requires art.final.`);
					}
					for (const field of ['width', 'height']) {
						if (!Number.isInteger(panel.art[field]) || panel.art[field] <= 0) {
							add(
								'error',
								'art-dimensions',
								panelPath,
								`${panel.art.status} art requires positive integer ${field}.`
							);
						}
					}
				}
				if (artIsGenerated(panel.art.status) && panel.art.revision < 1) {
					add('error', 'art-revision', panelPath, 'Generated art states require revision >= 1.');
				}
			}

			if (!Array.isArray(panel.dialogue)) {
				add('error', 'dialogue', panelPath, 'dialogue must be an array.');
			} else {
				const placement = assemblyPlacements.get(panel.id);
				const letteringPlan = planPanelLettering(sources, panel, { placement });
				const plannedDialogueById = new Map(
					letteringPlan.entries.map((entry) => [entry.dialogue.id, entry])
				);
				const orders = panel.dialogue.map((dialogue) => Number(dialogue?.readingOrder));
				if (orders.some((order, index) => order !== index + 1)) {
					add(
						'error',
						'dialogue-order',
						panelPath,
						'Dialogue source order and readingOrder must both be sequential from 1.'
					);
				}
				for (const [dialogueIndex, dialogue] of panel.dialogue.entries()) {
					const dialoguePath = `${panelPath} dialogue[${dialogueIndex}]`;
					const expectedDialogueId = `${panel.id}-d${pad(dialogueIndex + 1, 2)}`;
					if (!isPlainObject(dialogue)) {
						add('error', 'dialogue-record', dialoguePath, 'Dialogue must be an object.');
						continue;
					}
					for (const key of unknownKeys(dialogue, DIALOGUE_KEYS)) {
						add(
							'error',
							'dialogue-unknown-field',
							dialoguePath,
							`Unknown ComicDialogue field "${key}".`
						);
					}
					if (dialogue?.id !== expectedDialogueId) {
						add('error', 'dialogue-id', dialoguePath, `Dialogue id must be ${expectedDialogueId}.`);
					}
					if (seenDialogueIds.has(dialogue?.id)) {
						add(
							'error',
							'dialogue-id-duplicate',
							dialoguePath,
							`Dialogue id ${dialogue?.id} is duplicated.`
						);
					}
					seenDialogueIds.add(dialogue?.id);
					if (!presentCharacterIds.has(dialogue?.speaker)) {
						add(
							'error',
							'dialogue-speaker',
							dialoguePath,
							`Speaker "${dialogue?.speaker}" is not present in the panel.`
						);
					}
					if (!isNonEmptyString(dialogue?.text)) {
						add('error', 'dialogue-text', dialoguePath, 'Dialogue text must be non-empty.');
					} else if (!balancedDialogueQuotes(dialogue.text)) {
						add(
							'error',
							'dialogue-quotes',
							dialoguePath,
							'Dialogue contains unbalanced quotation marks.'
						);
					}
					if (!COMIC_BALLOON_STYLES.includes(dialogue?.style)) {
						add(
							'error',
							'dialogue-style',
							dialoguePath,
							`Unknown balloon style "${dialogue?.style}".`
						);
					}
					if (!isPlainObject(dialogue?.balloon)) {
						add('error', 'balloon', dialoguePath, 'Dialogue requires a balloon object.');
					} else {
						validateNormalizedBox(dialogue.balloon, add, dialoguePath);
						if (
							dialogue.balloon.manualBreaks !== undefined &&
							!validateStringArray(dialogue.balloon.manualBreaks)
						) {
							add(
								'error',
								'balloon-breaks',
								dialoguePath,
								'manualBreaks must be a unique array of non-empty lines.'
							);
						} else if (
							Array.isArray(dialogue.balloon.manualBreaks) &&
							dialogue.balloon.manualBreaks.join(' ').replace(/\s+/g, ' ').trim() !==
								dialogue.text.replace(/\s+/g, ' ').trim()
						) {
							add(
								'error',
								'balloon-breaks-parity',
								dialoguePath,
								'manualBreaks must preserve the dialogue text exactly, changing line boundaries only.'
							);
						}
						if (
							placement &&
							['x', 'y', 'width', 'height'].every(
								(field) =>
									typeof dialogue.balloon[field] === 'number' &&
									Number.isFinite(dialogue.balloon[field])
							)
						) {
							const planned = plannedDialogueById.get(dialogue.id);
							const fitted = fittedDialogueText(
								{
									...dialogue,
									balloon: {
										...dialogue.balloon,
										...(planned?.balloon ?? {})
									}
								},
								placement
							);
							if (!fitted.fits) {
								add(
									'error',
									'balloon-text-fit',
									dialoguePath,
									`Dialogue needs ${Math.ceil(fitted.requiredHeight)}px at the 12px hard minimum but the authored balloon provides ${Math.floor(fitted.availableHeight)}px in deterministic SVG assembly.`
								);
							} else if (fitted.fontSize < 14) {
								add(
									'warning',
									'balloon-text-small',
									dialoguePath,
									`Dialogue fits only at ${fitted.fontSize}px; inspect this balloon at print and responsive-reader sizes.`
								);
							}
						}
					}
				}
			}

			if (panel.soundEffects !== undefined) {
				if (!Array.isArray(panel.soundEffects)) {
					add('error', 'sound-effects', panelPath, 'soundEffects must be an array.');
				} else {
					for (const [effectIndex, effect] of panel.soundEffects.entries()) {
						const effectPath = `${panelPath} soundEffects[${effectIndex}]`;
						if (!isPlainObject(effect)) {
							add('error', 'sound-effect', effectPath, 'Sound effect must be an object.');
							continue;
						}
						for (const key of unknownKeys(effect, SOUND_EFFECT_KEYS)) {
							add(
								'error',
								'sound-effect-unknown-field',
								effectPath,
								`Unknown ComicSoundEffect field "${key}".`
							);
						}
						if (!isNonEmptyString(effect?.text) || !isNonEmptyString(effect?.description)) {
							add('error', 'sound-effect', effectPath, 'Sound effect needs text and description.');
						}
						if (
							!isPlainObject(effect?.position) ||
							typeof effect.position.x !== 'number' ||
							effect.position.x < 0 ||
							effect.position.x > 1 ||
							typeof effect.position.y !== 'number' ||
							effect.position.y < 0 ||
							effect.position.y > 1 ||
							!Number.isInteger(effect.position.z) ||
							effect.position.z < 0
						) {
							add(
								'error',
								'sound-effect-position',
								effectPath,
								'Sound effect position requires normalized x/y and non-negative integer z.'
							);
						}
						if (isPlainObject(effect.position)) {
							for (const key of unknownKeys(effect.position, SOUND_EFFECT_POSITION_KEYS)) {
								add(
									'error',
									'sound-effect-position-unknown-field',
									effectPath,
									`Unknown sound-effect position field "${key}".`
								);
							}
						}
					}
				}
			}

			const narrationRecords = [
				...(Array.isArray(panel.dialogue)
					? panel.dialogue.map((record, index) => ({
							kind: 'dialogue',
							record,
							sourceIndex: index
						}))
					: []),
				...(Array.isArray(panel.soundEffects)
					? panel.soundEffects.map((record, index) => ({
							kind: 'sound effect',
							record,
							sourceIndex: index
						}))
					: [])
			];
			if (
				narrationRecords.some(
					({ record }) => isPlainObject(record) && record.narrationOrder !== undefined
				)
			) {
				const invalidRecord = narrationRecords.find(
					({ record }) =>
						!isPlainObject(record) ||
						!Number.isInteger(record.narrationOrder) ||
						record.narrationOrder <= 0
				);
				const orders = narrationRecords.map(({ record }) => Number(record?.narrationOrder));
				const sortedOrders = [...orders].sort((left, right) => left - right);
				const hasGapOrDuplicate = sortedOrders.some((order, index) => order !== index + 1);
				const sourceOrderMismatch = ['dialogue', 'sound effect'].some((kind) => {
					const kindOrders = narrationRecords
						.filter((entry) => entry.kind === kind)
						.map(({ record }) => Number(record?.narrationOrder));
					return kindOrders.some((order, index) => index > 0 && order <= kindOrders[index - 1]);
				});
				if (invalidRecord || hasGapOrDuplicate || sourceOrderMismatch) {
					add(
						'error',
						'narration-order',
						panelPath,
						'When mixed narrationOrder metadata is used, every dialogue and sound effect needs a positive integer; the combined order must be contiguous from 1 without duplicates, and each source array must remain in increasing order.'
					);
				}
			}
		}
	}

	const panelById = new Map(allPanels.map((panel) => [panel.id, panel]));
	const panelAssemblyPlacementById = new Map(
		pages.flatMap((page) =>
			panelPlacements(page).map((placement) => [placement.panel.id, placement])
		)
	);
	for (const sign of collectionRecords(sources.data, 'signage')) {
		if (sign.placements === undefined) continue;
		if (!Array.isArray(sign.placements)) {
			add(
				'error',
				'lettering-placements',
				`signage ${sign.id ?? 'unknown'}`,
				'placements must be an array.'
			);
			continue;
		}
		for (const [index, placement] of sign.placements.entries()) {
			const placementPath = `signage ${sign.id ?? 'unknown'} placements[${index}]`;
			if (!isPlainObject(placement)) {
				add('error', 'lettering-placement', placementPath, 'Placement must be an object.');
				continue;
			}
			for (const key of unknownKeys(placement, TEXT_OVERLAY_PLACEMENT_KEYS)) {
				add(
					'error',
					'lettering-placement-unknown-field',
					placementPath,
					`Unknown lettering placement field "${key}".`
				);
			}
			if (!isNonEmptyString(placement.panelId) || !panelById.has(placement.panelId)) {
				add(
					'error',
					'lettering-panel-ref',
					placementPath,
					`Unknown canonical panel "${placement.panelId ?? ''}".`
				);
			}
			if (!isNonEmptyString(placement.kind)) {
				add('error', 'lettering-kind', placementPath, 'kind must be a non-empty string.');
			} else if (placement.kind !== slugify(placement.kind)) {
				add('error', 'lettering-kind', placementPath, 'kind must be a lowercase hyphenated slug.');
			}
			let resolvedText = null;
			if (!isNonEmptyString(placement.textVariant)) {
				add(
					'error',
					'lettering-text-variant',
					placementPath,
					'textVariant must name an authored signage text field.'
				);
			} else {
				const resolved = signVariantText(sign, placement.textVariant);
				resolvedText = resolved.text;
				if (!isNonEmptyString(resolved.text)) {
					add(
						'error',
						'lettering-text-variant',
						placementPath,
						`textVariant "${placement.textVariant}" does not resolve to authored text.`
					);
				}
			}
			for (const field of ['x', 'y', 'width', 'height']) {
				const value = placement[field];
				if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
					add(
						'error',
						'lettering-bounds',
						placementPath,
						`${field} must be a finite normalized value from 0 to 1.`
					);
				}
			}
			if (
				typeof placement.x === 'number' &&
				typeof placement.width === 'number' &&
				placement.x + placement.width > 1 + Number.EPSILON
			) {
				add('error', 'lettering-bounds', placementPath, 'x + width must not exceed 1.');
			}
			if (
				typeof placement.y === 'number' &&
				typeof placement.height === 'number' &&
				placement.y + placement.height > 1 + Number.EPSILON
			) {
				add('error', 'lettering-bounds', placementPath, 'y + height must not exceed 1.');
			}
			const panel = panelById.get(placement.panelId);
			const panelPlacement = panelAssemblyPlacementById.get(placement.panelId);
			if (
				panelPlacement &&
				isNonEmptyString(resolvedText) &&
				['x', 'y', 'width', 'height'].every(
					(field) => typeof placement[field] === 'number' && Number.isFinite(placement[field])
				)
			) {
				const fitted = fittedOverlayText(
					{ text: resolvedText },
					placement.width * panelPlacement.width,
					placement.height * panelPlacement.height
				);
				if (!fitted.fits) {
					add(
						'error',
						'lettering-text-fit',
						placementPath,
						`Overlay text needs ${Math.ceil(fitted.requiredHeight)}px at the 7px hard minimum but provides ${Math.floor(fitted.availableHeight)}px.`
					);
				} else if (fitted.fontSize < 10) {
					add(
						'warning',
						'lettering-text-small',
						placementPath,
						`Overlay fits only at ${fitted.fontSize}px; inspect print and responsive editions.`
					);
				}
			}
			if (panel && isNonEmptyString(sign.locationId) && sign.locationId !== panel.location) {
				add(
					'warning',
					'lettering-location',
					placementPath,
					`Sign location "${sign.locationId}" differs from panel location "${panel.location}".`
				);
			}
		}
	}

	if (metadata.seriesSlug === 'the-last-analog-town' && metadata.id === '001') {
		const openingText = flattenStrings(pages.find((page) => Number(page.page) === 1) ?? {})
			.join(' ')
			.toLocaleLowerCase('en');
		if (
			!openingText.includes('going forward together') ||
			!openingText.includes('billboard') ||
			!/(?:blocks?|blocking)\s+(?:one|a)\s+traffic\s+lane/.test(openingText)
		) {
			add(
				'error',
				'locked-opening',
				'page 1',
				'Page 1 must open on the “GOING FORWARD TOGETHER” billboard blocking one traffic lane.'
			);
		}
		const endingText = flattenStrings(pages.find((page) => Number(page.page) === 62) ?? {})
			.join(' ')
			.toLocaleLowerCase('en');
		if (
			!endingText.includes('golmohar junction remains noncompliant') ||
			!endingText.includes('off-level') ||
			!endingText.includes('wall is still standing')
		) {
			add(
				'error',
				'locked-ending',
				'page 62',
				'Page 62 must preserve Vale’s noncompliance report and the off-level frame / standing-wall exchange.'
			);
		}
	}

	for (const source of sourceTextForCanonScan(sources)) {
		for (const banned of SUPERSEDED_CANON) {
			banned.pattern.lastIndex = 0;
			if (banned.pattern.test(source.text)) {
				add(
					'error',
					'superseded-canon',
					source.path,
					`Superseded canonical name "${banned.label}" appears outside a migration note.`
				);
			}
		}
		NAMED_IMITATION_PATTERN.lastIndex = 0;
		if (NAMED_IMITATION_PATTERN.test(source.text)) {
			add(
				'error',
				'named-style-imitation',
				source.path,
				'Source requests imitation of a named artist, studio, or franchise.'
			);
		}
	}

	await verifyPromptCoverage(sources, allPanels, add, options);

	const expectedTranscript = renderTranscript(metadata, pages, sources.data);
	const transcriptPath = path.join(sources.episodeDirectory, 'transcript.md');
	if (options.requireTranscript !== false) {
		if (!(await pathExists(transcriptPath))) {
			add('error', 'transcript-missing', 'transcript.md', 'Compiled transcript.md does not exist.');
		} else if ((await readUtf8(transcriptPath)) !== expectedTranscript) {
			add(
				'error',
				'transcript-stale',
				'transcript.md',
				'Transcript does not exactly match canonical page/panel/dialogue order.'
			);
		}
	}

	if (options.checkCompiled !== false) {
		const compiledPath = path.join(sources.episodeDirectory, 'generated', 'episode.json');
		if (!(await pathExists(compiledPath))) {
			add(
				'warning',
				'compiled-missing',
				'generated/episode.json',
				'Compiled episode JSON does not exist.'
			);
		} else {
			try {
				const actual = JSON.parse(await readUtf8(compiledPath));
				if (stableJson(actual) !== stableJson(compiledEpisodeObject(sources))) {
					add(
						'error',
						'compiled-stale',
						'generated/episode.json',
						'Compiled episode JSON is stale relative to canonical sources.'
					);
				}
			} catch (error) {
				add(
					'error',
					'compiled-invalid',
					'generated/episode.json',
					`Compiled JSON is invalid: ${error instanceof Error ? error.message : error}`
				);
			}
			const letteringPath = path.join(
				sources.episodeDirectory,
				'generated',
				'lettering-manifest.json'
			);
			if (!(await pathExists(letteringPath))) {
				add(
					'error',
					'lettering-manifest-missing',
					'generated/lettering-manifest.json',
					'Compiled episode exists without its deterministic lettering manifest.'
				);
			} else {
				try {
					const actualLettering = JSON.parse(await readUtf8(letteringPath));
					if (stableJson(actualLettering) !== stableJson(letteringManifestObject(sources))) {
						add(
							'error',
							'lettering-manifest-stale',
							'generated/lettering-manifest.json',
							'Lettering manifest is stale relative to canonical signage placements.'
						);
					}
				} catch (error) {
					add(
						'error',
						'lettering-manifest-invalid',
						'generated/lettering-manifest.json',
						`Lettering manifest is invalid: ${error instanceof Error ? error.message : error}`
					);
				}
			}
		}
	}

	if (metadata.published === true) {
		if (metadata.productionPreview !== false) {
			add(
				'error',
				'publication-preview-state',
				'episode.yaml',
				'Published episodes must set productionPreview to false.'
			);
		}
		const unfinished = allPanels.filter((panel) => panel.art?.status !== 'final');
		if (unfinished.length > 0) {
			add(
				'error',
				'publication-gate',
				'episode.yaml',
				`Published episode still has ${unfinished.length} non-final panel(s).`
			);
		}
		await verifyPublicationReadiness(sources, allPanels, add);
	}

	const errors = issues.filter((issue) => issue.severity === 'error');
	const warnings = issues.filter((issue) => issue.severity === 'warning');
	return {
		valid: errors.length === 0,
		errors,
		warnings,
		issues,
		sources,
		summary: {
			pages: pages.length,
			panels: allPanels.length,
			dialogue: allPanels.reduce((total, panel) => total + (panel.dialogue?.length ?? 0), 0),
			errors: errors.length,
			warnings: warnings.length
		}
	};
}

export function formatValidationReport(result) {
	const lines = [
		`# Comic validation — ${result.sources.metadata.title}`,
		'',
		`- Result: **${result.valid ? 'PASS' : 'FAIL'}**`,
		`- Pages: ${result.summary.pages}`,
		`- Panels: ${result.summary.panels}`,
		`- Dialogue records: ${result.summary.dialogue}`,
		`- Errors: ${result.summary.errors}`,
		`- Warnings: ${result.summary.warnings}`,
		''
	];
	if (result.issues.length === 0) {
		lines.push('No validation findings.', '');
	} else {
		lines.push('## Findings', '');
		for (const finding of result.issues) lines.push(`- ${issueSummary(finding)}`);
		lines.push('');
	}
	return `${lines.join('\n').trimEnd()}\n`;
}

function defaultVisualLanguage(data) {
	const candidate = data['visual-language'] ?? data.visualLanguage;
	const source = flattenStrings(candidate).join(' ');
	return (
		source ||
		'Original European-inspired adventure-comic visual language; crisp confident contours, clean silhouettes, flat nuanced colour, restrained texture, expressive anatomy, readable staging, environmental detail, and clear foreground/middle-ground/background separation.'
	);
}

function panelPromptText(sources, page, panel) {
	const characterLines = (panel.characters ?? []).map((beat) => {
		const reference = compactRecord(collectionRecord(sources.data, 'characters', beat.id));
		return `- ${beat.id}: ${beat.position}; ${beat.emotion}; ${beat.pose}${beat.facing ? `; facing ${beat.facing}` : ''}${reference ? `.\n  Canonical reference: ${reference}` : ''}`;
	});
	const locationReference = compactRecord(
		collectionRecord(sources.data, 'locations', panel.location)
	);
	const propLines = (panel.props ?? []).map((id) => {
		const reference = compactRecord(collectionRecord(sources.data, 'props', id), 500);
		return `- ${id}${reference ? `: ${reference}` : ''}`;
	});
	const overlayLines = deterministicTextOverlays(sources.data, panel.id).map(
		(overlay) =>
			`- Keep ${overlay.kind} substrate ${overlay.signId} blank and legible at x ${overlay.x}, y ${overlay.y}, width ${overlay.width}, height ${overlay.height}; text will be composed later.`
	);
	const negative = [
		...(panel.prompt?.negative ?? []),
		'no photorealism',
		'no embedded dialogue or lettering',
		'no speech balloons or caption boxes',
		'no fake Bengali-looking glyphs',
		'no signatures or watermarks',
		'no copyrighted logos or characters',
		'no accidental extra limbs or duplicated characters',
		'no unexplained costume or prop changes'
	];
	const uniqueNegative = [...new Set(negative.map((item) => item.trim()).filter(Boolean))];
	const lines = [
		`THE LAST ANALOG TOWN — ${sources.metadata.title}`,
		`Page ${page.page}, panel ${panel.panel} (${panel.id}).`,
		'',
		'VISUAL LANGUAGE',
		defaultVisualLanguage(sources.data),
		'',
		`FORMAT AND CAMERA`,
		`${panel.size} panel, aspect ratio ${panel.aspectRatio}; ${panel.camera}.`,
		'',
		`LOCATION AND TIME`,
		`${panel.location}, ${panel.time}.${locationReference ? `\nCanonical location reference: ${locationReference}` : ''}`,
		'',
		'VISIBLE CHARACTERS',
		...(characterLines.length > 0 ? characterLines : ['- No visible character.']),
		'',
		'ACTION AND STAGING',
		panel.action,
		`Foreground: ${panel.foreground}`,
		`Middle ground: ${panel.middleGround}`,
		`Background: ${panel.background}`,
		`Composition: ${panel.prompt.composition}`,
		`Lighting: ${panel.prompt.lighting}`,
		`Palette: ${panel.prompt.palette}`,
		...(panel.visualJoke ? [`Visual comedy: ${panel.visualJoke}`] : []),
		'',
		'PROPS',
		...(propLines.length > 0 ? propLines : ['- None.']),
		'',
		'CONTINUITY',
		...(panel.continuity ?? []).map((note) => `- ${note}`),
		'',
		'LETTERING RESERVES',
		'Generated artwork must contain no final words, dialogue, captions, signs, logos, signatures, or watermarks. Preserve clean negative-space zones for deterministic lettering.',
		...(panel.prompt.balloonSafeAreas ?? []).map((area) => `- ${area}`),
		...overlayLines,
		'',
		'NEGATIVE GUIDANCE',
		...uniqueNegative.map((item) => `- ${item}`),
		''
	];
	return normalizeNewlines(lines.join('\n'));
}

export async function generatePrompts(options = {}) {
	const sources = options.sources ?? (await loadEpisodeSources(options));
	const validation = await validateEpisode({
		sources,
		requireTranscript: false,
		checkCompiled: false,
		checkPromptManifest: false,
		requirePromptsForArt: false,
		reportMissingPromptManifest: false
	});
	if (!validation.valid) {
		throw new ComicToolError(
			`Cannot generate prompts: canonical comic sources have ${validation.errors.length} validation error(s).`,
			validation.errors
		);
	}
	const promptsDirectory =
		options.outputDirectory ?? path.join(sources.episodeDirectory, 'prompts');
	const entries = [];
	const changed = [];
	for (const page of [...sources.pages].sort((left, right) => left.page - right.page)) {
		for (const panel of [...page.panels].sort((left, right) => left.panel - right.panel)) {
			const prompt = panelPromptText(sources, page, panel);
			const relativeFile = toPosix(
				path.join('prompts', `page-${pad(page.page)}`, `panel-${pad(panel.panel)}.txt`)
			);
			const outputFile = path.join(
				promptsDirectory,
				`page-${pad(page.page)}`,
				`panel-${pad(panel.panel)}.txt`
			);
			if (await writeFileIfChanged(outputFile, prompt)) changed.push(outputFile);
			entries.push({
				page: page.page,
				panel: panel.panel,
				panelId: panel.id,
				version: 1,
				file:
					promptsDirectory === path.join(sources.episodeDirectory, 'prompts')
						? relativeFile
						: toPosix(path.relative(sources.episodeDirectory, outputFile)),
				sha256: sha256(prompt),
				referenceIds: {
					characters: panel.characters.map((character) => character.id),
					location: panel.location,
					props: panel.props
				}
			});
		}
	}
	const manifest = {
		format: 'suvroghosh-comic-prompts',
		formatVersion: 1,
		episodeId: sources.metadata.id,
		seriesSlug: sources.metadata.seriesSlug,
		episodeSlug: sources.metadata.slug,
		sourceDigest: sources.sourceDigest,
		entryCount: entries.length,
		entries
	};
	const manifestPath = path.join(promptsDirectory, 'manifest.json');
	if (await writeFileIfChanged(manifestPath, stableJson(manifest))) changed.push(manifestPath);
	return { sources, promptsDirectory, manifest, manifestPath, changed };
}

function wordCount(value) {
	return String(value ?? '')
		.trim()
		.split(/\s+/)
		.filter(Boolean).length;
}

function severityOrder(value) {
	return { error: 0, warning: 1, info: 2 }[value] ?? 3;
}

function stableFindings(findings) {
	return findings
		.map((finding, index) => ({ id: `D${pad(index + 1)}`, ...finding }))
		.sort(
			(left, right) =>
				severityOrder(left.severity) - severityOrder(right.severity) ||
				Number(left.page ?? Number.MAX_SAFE_INTEGER) -
					Number(right.page ?? Number.MAX_SAFE_INTEGER) ||
				left.code.localeCompare(right.code, 'en')
		)
		.map((finding, index) => ({ ...finding, id: `D${pad(index + 1)}` }));
}

export function directorFindings(sources) {
	const findings = [];
	const add = (severity, code, page, panel, message) =>
		findings.push({ severity, code, page, panel, message });
	const seenPurposes = new Map();
	for (const page of [...sources.pages].sort((left, right) => left.page - right.page)) {
		const purposeKey = page.purpose?.toLocaleLowerCase('en');
		if (purposeKey && seenPurposes.has(purposeKey)) {
			add(
				'warning',
				'repeated-purpose',
				page.page,
				null,
				`Purpose duplicates page ${seenPurposes.get(purposeKey)}; verify that the situation changes.`
			);
		}
		if (purposeKey) seenPurposes.set(purposeKey, page.page);
		const pageWords = page.panels.reduce(
			(total, panel) =>
				total +
				(panel.dialogue ?? []).reduce((sum, dialogue) => sum + wordCount(dialogue.text), 0) +
				wordCount(panel.caption),
			0
		);
		if (pageWords > 120) {
			add(
				'error',
				'dialogue-density',
				page.page,
				null,
				`${pageWords} words may make the page unreadable.`
			);
		} else if (pageWords > 80) {
			add(
				'warning',
				'dialogue-density',
				page.page,
				null,
				`${pageWords} words needs a lettering and rhythm review.`
			);
		}
		if (!page.panels.some((panel) => isNonEmptyString(panel.visualJoke))) {
			add(
				'warning',
				'visual-comedy',
				page.page,
				null,
				'No panel declares a visual joke; verify that the page still carries the album’s comic identity.'
			);
		}
		if (!isNonEmptyString(page.pageTurn)) {
			add('error', 'page-turn', page.page, null, 'Page-turn function is missing.');
		}
		if (page.panels.length < PANEL_COUNT_MIN || page.panels.length > PANEL_COUNT_MAX) {
			const reason = exceptionReason(sources.exceptions, page.page);
			add(
				reason ? 'info' : 'error',
				'panel-rhythm-exception',
				page.page,
				null,
				reason
					? `Nonstandard panel count is declared: ${reason}`
					: 'Nonstandard panel count has no declared exception.'
			);
		}
		const panelLocations = new Set(page.panels.map((panel) => panel.location));
		if (page.location && !panelLocations.has(page.location)) {
			add(
				'warning',
				'page-location',
				page.page,
				null,
				`Page location "${page.location}" is not used by any panel.`
			);
		}
		for (const panel of page.panels) {
			const dialogueWords = (panel.dialogue ?? []).reduce(
				(total, dialogue) => total + wordCount(dialogue.text),
				0
			);
			if (dialogueWords > 45) {
				add(
					'warning',
					'panel-dialogue-density',
					page.page,
					panel.id,
					`${dialogueWords} dialogue words may crowd this panel.`
				);
			}
			if ((panel.continuity ?? []).length === 0) {
				add('error', 'continuity', page.page, panel.id, 'Panel has no continuity note.');
			}
			const thesisText = `${panel.action} ${(panel.dialogue ?? [])
				.map((dialogue) => dialogue.text)
				.join(' ')}`;
			if (/\bhumans?\s+(?:are\s+)?good\b.*\bmachines?\s+(?:are\s+)?bad\b/i.test(thesisText)) {
				add(
					'error',
					'binary-thesis',
					page.page,
					panel.id,
					'Panel states the prohibited “humans good, machines bad” simplification.'
				);
			}
			if (/\b(?:evil|malicious|sentient)\s+(?:algorithm|machine|system)\b/i.test(thesisText)) {
				add(
					'warning',
					'system-villainy',
					page.page,
					panel.id,
					'System appears intentionally evil; verify that harm follows ordinary designed operation.'
				);
			}
			if (
				panel.visualJoke &&
				/\b(?:poverty|poor people|disabled|disability|beggar|accent|skin colour|skin color)\b/i.test(
					panel.visualJoke
				)
			) {
				add(
					'error',
					'joke-target',
					page.page,
					panel.id,
					'Visual joke may target a protected trait or ordinary victim; human review required.'
				);
			}
		}
	}
	if (!sources.pages.some((page) => page.panels.some((panel) => panel.dialogue.length === 0))) {
		findings.push({
			severity: 'info',
			code: 'silent-beat',
			page: null,
			panel: null,
			message:
				'No silent panel exists; consider whether one visual beat can carry story without dialogue.'
		});
	}
	return stableFindings(findings);
}

function markdownFindingsTable(findings) {
	if (findings.length === 0) return 'No deterministic findings.\n';
	const lines = [
		'| ID | Severity | Page | Panel | Check | Finding |',
		'| --- | --- | ---: | --- | --- | --- |'
	];
	for (const finding of findings) {
		lines.push(
			`| ${finding.id} | ${finding.severity} | ${finding.page ?? '—'} | ${finding.panel ?? '—'} | ${finding.code} | ${String(
				finding.message
			).replace(/\|/g, '\\|')} |`
		);
	}
	return `${lines.join('\n')}\n`;
}

export function renderDirectorReport(sources, findings = directorFindings(sources)) {
	const counts = {
		error: findings.filter((finding) => finding.severity === 'error').length,
		warning: findings.filter((finding) => finding.severity === 'warning').length,
		info: findings.filter((finding) => finding.severity === 'info').length
	};
	return `# Deterministic comic director report

**Series:** The Last Analog Town  
**Episode:** ${sources.metadata.id} — ${sources.metadata.title}  
**Source digest:** \`${sources.sourceDigest}\`

## Summary

- Errors: ${counts.error}
- Warnings: ${counts.warning}
- Information notes: ${counts.info}
- Pages inspected: ${sources.pages.length}
- This report detects measurable rhythm, density, satire-target, and continuity risks. It does not replace editorial judgment.

## Findings

${markdownFindingsTable(findings)}
## Human editorial questions

- Does every page alter the situation rather than restate it?
- Are system benefits visible before system coupling creates harm?
- Does Riju make consequential choices, mistakes, and repairs?
- Is Vale capable and sincere even while enforcing damaging assumptions?
- Do serious harms receive enough emotional space before the next joke?
- Does the ending preserve the negotiated hybrid solution and final off-level frame joke?
`;
}

export async function generateDirectorReport(options = {}) {
	const sources = options.sources ?? (await loadEpisodeSources(options));
	const findings = directorFindings(sources);
	const report = renderDirectorReport(sources, findings);
	const reportPath =
		options.outputFile ?? path.join(sources.episodeDirectory, 'reports', 'director.md');
	const changed = await writeFileIfChanged(reportPath, report);
	return { sources, findings, report, reportPath, changed };
}

function culturalFindings(sources) {
	const findings = [];
	const add = (severity, code, page, panel, message) =>
		findings.push({ severity, code, page, panel, message });
	const realLocalityPattern =
		/\b(?:Howrah|Ballygunge|Barrackpore|Barasat|Dum Dum|Kamarhati|Serampore|Salt Lake|Rajarhat)\b/gi;
	const realPartyPattern = /\b(?:BJP|TMC|Trinamool|CPI\s*\(M\)|Indian National Congress)\b/gi;
	for (const page of sources.pages) {
		for (const panel of page.panels ?? []) {
			const narrative = flattenStrings(panel).join(' ');
			realLocalityPattern.lastIndex = 0;
			const localities = [
				...new Set(Array.from(narrative.matchAll(realLocalityPattern), (match) => match[0]))
			];
			if (localities.length > 0) {
				add(
					'warning',
					'real-locality',
					page.page,
					panel.id,
					`Real locality reference(s) ${localities.join(', ')} need a defamation and setting review.`
				);
			}
			realPartyPattern.lastIndex = 0;
			const parties = [
				...new Set(Array.from(narrative.matchAll(realPartyPattern), (match) => match[0]))
			];
			if (parties.length > 0) {
				add(
					'warning',
					'real-party',
					page.page,
					panel.id,
					`Real political identifier(s) ${parties.join(', ')} need an editorial necessity review.`
				);
			}
			if (
				/\b(?:all|every)\s+(?:Bengalis?|residents?|villagers?|poor people|women|men)\s+(?:are|do|have)\b/i.test(
					narrative
				)
			) {
				add(
					'error',
					'group-generalization',
					page.page,
					panel.id,
					'Broad group generalization may create a stereotype.'
				);
			}
			if (
				panel.visualJoke &&
				/\b(?:poverty|beggar|slum|disabled|disability|accent|dark skin|fair skin)\b/i.test(
					panel.visualJoke
				)
			) {
				add(
					'error',
					'joke-target',
					page.page,
					panel.id,
					'Visual joke includes a victim-class or protected-trait marker.'
				);
			}
			if (/[\u0980-\u09ff]/u.test(narrative)) {
				add(
					'info',
					'bengali-text',
					page.page,
					panel.id,
					'Bengali text appears in canonical panel data; verify it is deterministic lettering, not requested generated art.'
				);
			}
		}
	}

	const signage = collectionRecords(sources.data, 'signage');
	for (const sign of signage) {
		const bengali = bengaliSignText(sign);
		if (!bengali) continue;
		if (!bengaliSignIsApproved(sign)) {
			findings.push({
				severity: 'error',
				code: 'signage-review',
				page: null,
				panel: null,
				message: `Signage "${sign.id ?? 'unknown'}" has Bengali text without named, dated human approval and publication permission.`
			});
		}
	}
	return stableFindings(findings);
}

export function renderCulturalReview(sources, findings = culturalFindings(sources)) {
	const blocking = findings.filter((finding) => finding.severity === 'error').length;
	const warnings = findings.filter((finding) => finding.severity === 'warning').length;
	return `# Comic cultural review

**Episode:** ${sources.metadata.id} — ${sources.metadata.title}  
**Source digest:** \`${sources.sourceDigest}\`  
**Automated blocking findings:** ${blocking}  
**Automated warnings:** ${warnings}  
**Publication status:** **NEEDS NAMED HUMAN REVIEW**

Deterministic checks can locate risky words and missing review records; they cannot establish context, accuracy, satire target, or cultural plausibility.

## Deterministic findings

${markdownFindingsTable(findings)}
## Required human checklist

${HUMAN_CULTURAL_CHECKLIST.map((item) => `- [ ] ${item}`).join('\n')}

## Human sign-off

- Reviewer:
- Review date:
- Panels or records changed:
- Remaining concerns:
- Decision: needs changes / approved for publication
`;
}

export async function generateCulturalReview(options = {}) {
	const sources = options.sources ?? (await loadEpisodeSources(options));
	const findings = culturalFindings(sources);
	const report = renderCulturalReview(sources, findings);
	const reportPath =
		options.outputFile ?? path.join(sources.episodeDirectory, 'reports', 'cultural-review.md');
	const changed = await writeFileIfChanged(reportPath, report);
	return { sources, findings, report, reportPath, changed };
}

function scaffoldDate(options) {
	if (options.date) {
		if (!isCalendarDate(options.date)) throw new ComicToolError('--date must be YYYY-MM-DD.');
		return options.date;
	}
	if (process.env.SOURCE_DATE_EPOCH) {
		const date = new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000);
		if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
	}
	return new Date().toISOString().slice(0, 10);
}

async function nextEpisodeId(episodesDirectory) {
	if (!(await pathExists(episodesDirectory))) return '001';
	const entries = await fs.readdir(episodesDirectory, { withFileTypes: true });
	const ids = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => /^(\d{3})(?:-|$)/.exec(entry.name)?.[1])
		.filter(Boolean)
		.map(Number);
	return pad((ids.length > 0 ? Math.max(...ids) : 0) + 1);
}

export async function scaffoldEpisode(options = {}) {
	const root = path.resolve(options.root ?? process.cwd());
	const seriesSlug = slugify(options.series ?? 'the-last-analog-town');
	const title = isNonEmptyString(options.title) ? options.title : '';
	if (!title) throw new ComicToolError('A non-empty episode title is required.');
	const episodeSlug = slugify(options.slug ?? title);
	const episodesDirectory = path.join(root, 'src', 'lib', 'comics', seriesSlug, 'episodes');
	const id = options.id
		? pad(positiveIntegerOption(options.id, 1, '--id'))
		: await nextEpisodeId(episodesDirectory);
	const episodeDirectory = path.join(episodesDirectory, `${id}-${episodeSlug}`);
	if (await pathExists(episodeDirectory)) {
		throw new ComicToolError(
			`Refusing to overwrite existing episode directory ${episodeDirectory}.`
		);
	}
	const date = scaffoldDate(options);
	const storyPageCount = positiveIntegerOption(
		options.storyPageCount ?? options['story-pages'],
		62,
		'--story-pages'
	);
	const metadata = {
		id,
		slug: episodeSlug,
		seriesId: seriesSlug,
		seriesSlug,
		title,
		subtitle: `A new Golmohar Junction adventure`,
		description: 'Replace this production description before publication.',
		category: 'Comic',
		tags: [
			'Comic',
			'Satire',
			'Artificial Intelligence',
			'Bureaucracy',
			'Technology',
			'Bengal',
			'Calcutta'
		],
		date,
		dateModified: date,
		published: false,
		productionPreview: true,
		storyPageCount,
		readingDirection: 'ltr',
		language: 'en',
		contentGuidance: ['Political and technological satire'],
		credits: [{ role: 'Created and written by', name: 'Suvro Ghosh' }],
		canonicalPath: `/blog/comic/${seriesSlug}/${episodeSlug}`,
		transcriptPath: `/blog/comic/${seriesSlug}/${episodeSlug}#transcript`,
		printPath: `/downloads/comics/${seriesSlug}/${id}-${episodeSlug}.pdf`,
		cover: null,
		coverAlt: 'Replace with an authored cover description before publication.'
	};
	const directories = [
		'script/pages',
		'data',
		'prompts',
		'references/characters',
		'references/locations',
		'references/props',
		'panels/raw',
		'panels/approved',
		'panels/rejected',
		'pages/working',
		'pages/web',
		'pages/print',
		'generated',
		'reports',
		'exports/web'
	];
	for (const directory of directories) {
		await fs.mkdir(path.join(episodeDirectory, directory), { recursive: true });
	}
	const files = {
		'episode.yaml': stringifyYaml(metadata, { lineWidth: 100 }),
		'cover.yaml': stringifyYaml(
			{
				schemaVersion: '1.0.0',
				episodeId: id,
				title,
				category: 'Comic',
				status: 'artwork-pending',
				artPrompt: {
					positive:
						'Replace after the premise, ending, cast references, location references, and cover composition are locked.',
					negative: [
						'embedded letters, words, numerals, signs, logos or interface text',
						'speech balloons, captions or title lettering',
						'watermark, signature or artist mark',
						'named-artist, studio, franchise, film or existing-comic imitation'
					],
					letteringPolicy:
						'Add all title, series, credit, sign, and badge text through deterministic composition.'
				},
				accessibility: {
					alt: metadata.coverAlt,
					description: 'Replace with an expanded authored cover description before publication.'
				},
				provenance: {
					sourceType: null,
					provider: null,
					promptRevision: 0,
					sourcePath: null,
					sourceSha256: null,
					rightsNotes: null,
					humanApproval: {
						status: 'pending',
						approvedBy: null,
						approvedAt: null
					}
				}
			},
			{ lineWidth: 100 }
		),
		'front-and-end-matter.yaml': stringifyYaml(
			{
				schemaVersion: '1.0.0',
				episodeId: id,
				category: 'Comic',
				countsOutsideStoryPages: true,
				readingOrder: [
					{ id: 'cover', type: 'cover', source: 'cover.yaml' },
					{ id: 'title-credits', type: 'title-and-credits' },
					{ id: 'story', type: 'story-pages', firstPage: 1, lastPage: storyPageCount },
					{ id: 'production-note', type: 'end-matter' },
					{ id: 'transcript', type: 'accessible-transcript' }
				],
				publicationGate: {
					coverApproved: false,
					allPanelsFinal: false,
					dialogueApproved: false,
					letteringApproved: false,
					allRightsRecorded: false,
					bengaliReviewed: false,
					culturalReviewApproved: false,
					accessibilityApproved: false,
					responsiveReaderApproved: false,
					printApproved: false,
					epubApproved: false,
					finalEditorApproved: false
				}
			},
			{ lineWidth: 100 }
		),
		'outline.md': `# ${title} — outline\n\nStatus: scaffolded; premise and ending must be locked before page scripting.\n`,
		'director-notes.md': `# ${title} — director notes\n\nDeterministic reports are written under \`reports/\`.\n`,
		'continuity-report.md': `# ${title} — continuity report\n\nGenerated after canonical pages exist.\n`,
		'script/exceptions.yaml':
			'# Declare only justified pages outside the 4–9 panel guideline.\npanelCounts: {}\n',
		'provenance.json': stableJson({
			format: 'suvroghosh-comic-provenance',
			formatVersion: 1,
			episodeId: id,
			panels: []
		})
	};
	const created = [];
	for (const [relative, content] of Object.entries(files)) {
		const filename = path.join(episodeDirectory, relative);
		await writeFileIfChanged(filename, content);
		created.push(filename);
	}
	return { root, episodeDirectory, metadata, created };
}

async function readRevisionManifest(episodeDirectory) {
	const filename = path.join(episodeDirectory, 'prompts', 'revisions', 'manifest.json');
	if (!(await pathExists(filename))) {
		return {
			filename,
			manifest: {
				format: 'suvroghosh-comic-prompt-revisions',
				formatVersion: 1,
				revisions: []
			}
		};
	}
	try {
		const manifest = JSON.parse(await readUtf8(filename));
		if (!Array.isArray(manifest.revisions)) throw new Error('revisions must be an array');
		return { filename, manifest };
	} catch (error) {
		throw new ComicToolError(
			`Prompt revision manifest is invalid: ${error instanceof Error ? error.message : error}`
		);
	}
}

export async function revisePrompt(options = {}) {
	const sources = options.sources ?? (await loadEpisodeSources(options));
	const panelId = isNonEmptyString(options.panel) ? options.panel : '';
	const note = isNonEmptyString(options.note) ? options.note : '';
	if (!panelId) throw new ComicToolError('A canonical --panel id is required.');
	if (!note)
		throw new ComicToolError('A bounded --note describing the identified problem is required.');
	const variants = positiveIntegerOption(options.variants, 3, '--variants');
	if (variants > PROMPT_VARIANT_LIMIT) {
		throw new ComicToolError(`--variants may not exceed ${PROMPT_VARIANT_LIMIT}.`);
	}
	const promptManifestPath = path.join(sources.episodeDirectory, 'prompts', 'manifest.json');
	if (!(await pathExists(promptManifestPath))) {
		throw new ComicToolError('Run comic prompts before revising a panel prompt.');
	}
	const promptManifest = JSON.parse(await readUtf8(promptManifestPath));
	const baseEntry = promptManifest.entries?.find((entry) => entry.panelId === panelId);
	if (!baseEntry) throw new ComicToolError(`Prompt manifest has no panel ${panelId}.`);
	const baseFile = path.resolve(sources.episodeDirectory, baseEntry.file);
	const basePrompt = await readUtf8(baseFile);
	if (sha256(basePrompt) !== baseEntry.sha256) {
		throw new ComicToolError(`Base prompt hash for ${panelId} is stale.`);
	}
	const revisionState = await readRevisionManifest(sources.episodeDirectory);
	const prior = revisionState.manifest.revisions.filter((entry) => entry.panelId === panelId);
	const revision =
		prior.reduce((maximum, entry) => Math.max(maximum, Number(entry.revision) || 0), 0) + 1;
	const focuses = [
		'composition clarity and readable silhouettes',
		'character performance, pose, and emotional specificity',
		'environmental continuity and prop fidelity',
		'visual-comedy timing without weakening the human consequence',
		'accessibility, uncluttered action, and lettering-safe negative space'
	];
	const outputDirectory = path.join(
		sources.episodeDirectory,
		'prompts',
		'revisions',
		panelId,
		`v${pad(revision)}`
	);
	const variantEntries = [];
	const changed = [];
	for (let index = 0; index < variants; index += 1) {
		const content = `${basePrompt.trimEnd()}

REVISION BRIEF — v${pad(revision)} variant ${index + 1}
Identified problem: ${note}
Variant focus: ${focuses[index]}
Retain every canonical character, location, prop, continuity, lettering-reserve, and negative-guidance constraint not explicitly changed above.
`;
		const filename = path.join(outputDirectory, `variant-${pad(index + 1, 2)}.txt`);
		if (await writeFileIfChanged(filename, content)) changed.push(filename);
		variantEntries.push({
			variant: index + 1,
			file: toPosix(path.relative(sources.episodeDirectory, filename)),
			sha256: sha256(content),
			focus: focuses[index]
		});
	}
	const revisionEntry = {
		panelId,
		revision,
		basePromptSha256: baseEntry.sha256,
		problem: note,
		variants: variantEntries
	};
	revisionState.manifest.revisions.push(revisionEntry);
	revisionState.manifest.revisions.sort(
		(left, right) =>
			left.panelId.localeCompare(right.panelId, 'en') || left.revision - right.revision
	);
	if (await writeFileIfChanged(revisionState.filename, stableJson(revisionState.manifest))) {
		changed.push(revisionState.filename);
	}
	return {
		sources,
		panelId,
		revision,
		revisionEntry,
		variants: revisionEntry.variants,
		manifestPath: revisionState.filename,
		changed
	};
}

function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function contextualPlaceholderMarkup(page, panel) {
	const cast =
		(panel.characters ?? []).map((character) => character.id).join(', ') || 'no visible cast';
	return `<div class="placeholder" role="img" aria-label="${escapeHtml(panel.accessibility?.alt)}">
	<strong>${escapeHtml(panel.id)} · ${escapeHtml(panel.art?.status ?? 'missing')}</strong>
	<span>${escapeHtml(panel.camera)} · ${escapeHtml(cast)}</span>
	<p>${escapeHtml(panel.action)}</p>
</div>`;
}

function contactSheetImageSource(sources, outputFile, panel) {
	const artPath = panel.art?.final || panel.art?.source;
	if (!isNonEmptyString(artPath)) return '';
	const absolute = resolveArtSource(sources, artPath);
	if (!absolute) return '';
	return toPosix(path.relative(path.dirname(outputFile), absolute));
}

export function renderContactSheetHtml(sources, outputFile) {
	const cards = [];
	for (const page of sources.pages) {
		for (const panel of page.panels ?? []) {
			const imageSource = contactSheetImageSource(sources, outputFile, panel);
			const overlaySummary = deterministicTextOverlays(sources.data, panel.id)
				.map((overlay) => `${overlay.kind}: ${overlay.text}`)
				.join(' · ');
			cards.push(`<article class="card" data-status="${escapeHtml(panel.art?.status)}">
	<header><span>Page ${page.page} · Panel ${panel.panel}</span><strong>${escapeHtml(panel.id)}</strong></header>
	${
		imageSource
			? `<img src="${escapeHtml(imageSource)}" alt="${escapeHtml(panel.accessibility.alt)}" loading="lazy">`
			: contextualPlaceholderMarkup(page, panel)
	}
	<dl>
		<div><dt>Status</dt><dd>${escapeHtml(panel.art?.status)}</dd></div>
		<div><dt>Camera</dt><dd>${escapeHtml(panel.camera)}</dd></div>
		<div><dt>Location</dt><dd>${escapeHtml(panel.location)}</dd></div>
		<div><dt>Action</dt><dd>${escapeHtml(panel.action)}</dd></div>
		${overlaySummary ? `<div><dt>Text</dt><dd>${escapeHtml(overlaySummary)}</dd></div>` : ''}
	</dl>
</article>`);
		}
	}
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${escapeHtml(sources.metadata.title)} — production contact sheet</title>
	<style>
		:root{color-scheme:light dark;font-family:system-ui,sans-serif}body{margin:0;padding:24px;background:#e9e2d5;color:#201d18}h1{margin:0}.meta{margin:.4rem 0 1.5rem}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}.card{background:#fff;border:1px solid #6f685c;border-radius:8px;overflow:hidden;break-inside:avoid}.card header{display:flex;justify-content:space-between;gap:8px;padding:10px 12px;background:#25221d;color:#fff}.card img,.placeholder{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}.placeholder{box-sizing:border-box;padding:18px;background:repeating-linear-gradient(135deg,#d8d0c2,#d8d0c2 12px,#c8bfaf 12px,#c8bfaf 24px);color:#201d18}.placeholder span{display:block;margin-top:8px;font-size:.85rem}.placeholder p{font-size:.9rem;line-height:1.35}dl{margin:0;padding:12px;font-size:.85rem}dl div{display:grid;grid-template-columns:65px 1fr;gap:8px;margin:.25rem 0}dt{font-weight:700}dd{margin:0}@media print{body{padding:8mm}.grid{grid-template-columns:repeat(3,1fr);gap:5mm}.card{font-size:8pt}}
	</style>
</head>
<body>
	<h1>${escapeHtml(sources.metadata.title)}</h1>
	<p class="meta">Episode ${escapeHtml(sources.metadata.id)} · ${sources.pages.length} pages · Source <code>${sources.sourceDigest}</code></p>
	<main class="grid">${cards.join('\n')}</main>
</body>
</html>
`;
}

export async function generateContactSheet(options = {}) {
	const sources = options.sources ?? (await loadEpisodeSources(options));
	const outputFile =
		options.outputFile ?? path.join(sources.episodeDirectory, 'exports', 'contact-sheet.html');
	const html = renderContactSheetHtml(sources, outputFile);
	const changed = await writeFileIfChanged(outputFile, html);
	return { sources, outputFile, html, changed };
}

function escapeXml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function wrapWords(value, maximumCharacters) {
	const words = String(value ?? '')
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	const lines = [];
	let current = '';
	for (const word of words) {
		if (!current) current = word;
		else if (`${current} ${word}`.length <= maximumCharacters) current += ` ${word}`;
		else {
			lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines;
}

function textLinesSvg(lines, x, y, lineHeight, attributes = '') {
	return `<text x="${x}" y="${y}" ${attributes}>${lines
		.map(
			(line, index) =>
				`<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
		)
		.join('')}</text>`;
}

function panelRows(panels) {
	const rows = [];
	let pending = [];
	const flushPending = () => {
		while (pending.length > 0) {
			const count = pending.length === 3 ? 3 : pending.length > 3 ? 2 : pending.length;
			rows.push(pending.splice(0, count).map((panel) => ({ panel, span: 1 })));
		}
	};
	for (const panel of panels) {
		const span = ['wide', 'half-page', 'splash'].includes(panel.size) ? 2 : 1;
		if (span === 2) {
			flushPending();
			rows.push([{ panel, span }]);
		} else {
			pending.push(panel);
		}
	}
	flushPending();
	return rows;
}

function numericAspectRatio(panel) {
	const [width, height] = String(panel.aspectRatio ?? '4:3')
		.split(':')
		.map(Number);
	return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
		? width / height
		: 4 / 3;
}

function panelPlacements(page, dimensions = { width: 1600, height: 2400 }) {
	const margin = 48;
	const header = 10;
	const footer = 44;
	const gap = 24;
	const rows = panelRows(page.panels ?? []);
	const usableWidth = dimensions.width - margin * 2;
	const usableHeight = dimensions.height - margin * 2 - header - footer;
	const columnWidth = (usableWidth - gap) / 2;
	const rowGapTotal = Math.max(0, rows.length - 1) * gap;
	const contentHeight = usableHeight - rowGapTotal;
	const naturalHeights = rows.map((row) => {
		if (row.length === 1) {
			const width = row[0].span === 2 ? usableWidth : columnWidth;
			return width / numericAspectRatio(row[0].panel);
		}
		const horizontalGaps = (row.length - 1) * gap;
		const aspectTotal = row.reduce((total, item) => total + numericAspectRatio(item.panel), 0);
		return (usableWidth - horizontalGaps) / aspectTotal;
	});
	const naturalTotal = naturalHeights.reduce((total, height) => total + height, 0) || 1;
	const placements = [];
	let y = margin + header;
	for (const [rowIndex, row] of rows.entries()) {
		const height = (contentHeight * naturalHeights[rowIndex]) / naturalTotal;
		const horizontalGaps = (row.length - 1) * gap;
		const availableRowWidth = usableWidth - horizontalGaps;
		const aspectTotal = row.reduce((total, item) => total + numericAspectRatio(item.panel), 0);
		let x =
			row.length === 1 && row[0].span === 1
				? margin + (usableWidth - Math.min(usableWidth, height * aspectTotal)) / 2
				: margin;
		for (const item of row) {
			const width =
				row.length === 1
					? item.span === 2
						? usableWidth
						: Math.min(usableWidth, height * numericAspectRatio(item.panel))
					: (availableRowWidth * numericAspectRatio(item.panel)) / aspectTotal;
			placements.push({ panel: item.panel, x, y, width, height });
			x += width + gap;
		}
		y += height + gap;
	}
	return placements;
}

function svgImageHref(sources, outputFile, panel) {
	const candidate = panel.art?.final || panel.art?.source;
	if (!isNonEmptyString(candidate)) return '';
	const absolute = resolveArtSource(sources, candidate);
	return absolute ? toPosix(path.relative(path.dirname(outputFile), absolute)) : '';
}

function balloonTailAnchor(balloon, bx, by, bw, bh) {
	switch (balloon.tailDirection ?? 'down') {
		case 'up':
			return { x: bx + bw / 2, y: by };
		case 'left':
			return { x: bx, y: by + bh / 2 };
		case 'right':
			return { x: bx + bw, y: by + bh / 2 };
		case 'none':
			return null;
		default:
			return { x: bx + bw / 2, y: by + bh };
	}
}

function balloonTailPath(balloon, bx, by, bw, bh, targetX, targetY) {
	const anchor = balloonTailAnchor(balloon, bx, by, bw, bh);
	if (!anchor) return '';
	const halfBase = 6;
	const vertical = ['up', 'down'].includes(balloon.tailDirection ?? 'down');
	const first = vertical
		? { x: anchor.x - halfBase, y: anchor.y }
		: { x: anchor.x, y: anchor.y - halfBase };
	const second = vertical
		? { x: anchor.x + halfBase, y: anchor.y }
		: { x: anchor.x, y: anchor.y + halfBase };
	return `<path d="M ${first.x} ${first.y} L ${targetX} ${targetY} L ${second.x} ${second.y} Z" fill="#fffdf7" stroke="#171512" stroke-width="4" stroke-linejoin="round"/>`;
}

function routedBalloonTailPath(route, placement, dialogue) {
	if (!route) return '';
	const start = {
		x: placement.x + route.start.x * placement.width,
		y: placement.y + route.start.y * placement.height
	};
	const control = {
		x: placement.x + route.control.x * placement.width,
		y: placement.y + route.control.y * placement.height
	};
	const end = {
		x: placement.x + route.end.x * placement.width,
		y: placement.y + route.end.y * placement.height
	};
	const tangent = { x: control.x - start.x, y: control.y - start.y };
	const length = Math.hypot(tangent.x, tangent.y) || 1;
	const halfBase = dialogue.style === 'robot' ? 6 : 8;
	const perpendicular = {
		x: (-tangent.y / length) * halfBase,
		y: (tangent.x / length) * halfBase
	};
	const first = { x: start.x + perpendicular.x, y: start.y + perpendicular.y };
	const second = { x: start.x - perpendicular.x, y: start.y - perpendicular.y };
	return `<g class="comic-balloon-tail" data-dialogue-id="${escapeXml(dialogue.id)}" data-speaker-id="${escapeXml(dialogue.speaker)}" data-route-safe="${route.safe ? 'true' : 'false'}">
<path d="M ${first.x} ${first.y} Q ${control.x} ${control.y} ${end.x} ${end.y} Q ${control.x} ${control.y} ${second.x} ${second.y} Z" fill="#fffdf7" stroke="#171512" stroke-width="4" stroke-linejoin="round"/>
</g>`;
}

function softWrapText(value, maximumCharacters) {
	return normalizeNewlines(value)
		.split('\n')
		.flatMap((line) => wrapWords(line, maximumCharacters));
}

function fittedDialogueText(dialogue, placement) {
	const balloon = dialogue.balloon ?? {};
	const width = Number(balloon.width) * placement.width;
	const height = Number(balloon.height) * placement.height;
	const preferredFontSize = Math.max(12, Math.min(34, 28 * (Number(balloon.fontScale) || 1)));
	const minimumFontSize = 12;
	const authoredLines =
		Array.isArray(balloon.manualBreaks) && balloon.manualBreaks.length > 0
			? balloon.manualBreaks
			: [dialogue.text];
	let fontSize = preferredFontSize;
	let lines = [];
	let requiredHeight = Number.POSITIVE_INFINITY;
	while (fontSize >= minimumFontSize) {
		const maximumCharacters = Math.max(5, Math.floor(Math.max(1, width - 36) / (fontSize * 0.58)));
		lines = authoredLines.flatMap((line) => softWrapText(line, maximumCharacters));
		requiredHeight = lines.length * fontSize * 1.14 + 24;
		if (requiredHeight <= height) {
			return {
				fits: true,
				lines,
				fontSize,
				preferredFontSize,
				renderScale: Number((fontSize / preferredFontSize).toFixed(4)),
				requiredHeight,
				availableHeight: height
			};
		}
		fontSize -= 0.5;
	}
	return {
		fits: false,
		lines,
		fontSize: minimumFontSize,
		preferredFontSize,
		renderScale: Number((minimumFontSize / preferredFontSize).toFixed(4)),
		requiredHeight,
		availableHeight: height
	};
}

function fittedOverlayText(overlay, width, height) {
	const text = String(overlay.text ?? '');
	let fontSize = 24;
	let lines = [];
	let fits = false;
	while (fontSize >= 7) {
		lines = softWrapText(text, Math.max(5, Math.floor((width - 12) / (fontSize * 0.58))));
		if (lines.length * fontSize * 1.12 <= height - 8) {
			fits = true;
			break;
		}
		fontSize -= 1;
	}
	const resolvedFontSize = Math.max(7, fontSize);
	return {
		fits,
		lines,
		fontSize: resolvedFontSize,
		lineHeight: Math.max(8, resolvedFontSize * 1.12),
		requiredHeight: lines.length * resolvedFontSize * 1.12 + 8,
		availableHeight: height
	};
}

function renderSvgTextOverlay(placement, overlay) {
	const { x, y, width, height } = placement;
	const ox = x + overlay.x * width;
	const oy = y + overlay.y * height;
	const ow = overlay.width * width;
	const oh = overlay.height * height;
	const clipId = `overlay-clip-${overlay.id}`;
	const { lines, fontSize, lineHeight } = fittedOverlayText(overlay, ow, oh);
	const interfaceStyle = /interface|system/i.test(overlay.kind);
	const reportStyle = /report|document/i.test(overlay.kind);
	const fill = interfaceStyle ? '#e7f0f1' : reportStyle ? '#fffdf7' : '#f7edcc';
	const stroke = interfaceStyle ? '#315f72' : '#171512';
	const family =
		overlay.language === 'bn' || overlay.language === 'mixed'
			? "'Noto Serif Bengali','Noto Sans Bengali',serif"
			: 'system-ui,sans-serif';
	const totalHeight = Math.max(lineHeight, lines.length * lineHeight);
	const firstBaseline = oy + Math.max(fontSize + 3, (oh - totalHeight) / 2 + fontSize);
	return `<g class="deterministic-text-overlay" data-sign-id="${escapeXml(overlay.signId)}" data-kind="${escapeXml(overlay.kind)}">
<clipPath id="${escapeXml(clipId)}"><rect x="${ox}" y="${oy}" width="${ow}" height="${oh}" rx="3"/></clipPath>
<rect x="${ox}" y="${oy}" width="${ow}" height="${oh}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
<g clip-path="url(#${escapeXml(clipId)})">${textLinesSvg(
		lines,
		ox + 6,
		firstBaseline,
		lineHeight,
		`font-family="${family}" font-size="${fontSize}" font-weight="700" fill="#111"`
	)}</g>
</g>`;
}

function renderSvgPanel(sources, outputFile, placement) {
	const { panel, x, y, width, height } = placement;
	const clipId = `clip-${panel.id}`;
	const imageHref = svgImageHref(sources, outputFile, panel);
	const parts = [
		`<g id="${escapeXml(panel.id)}">`,
		`<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6"/></clipPath>`,
		`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="#d5cdbc" stroke="#171512" stroke-width="8"/>`
	];
	if (imageHref) {
		const verticalAnchor =
			panel.art?.anchor === 'top' ? 'YMin' : panel.art?.anchor === 'bottom' ? 'YMax' : 'YMid';
		parts.push(
			`<image href="${escapeXml(imageHref)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMid${verticalAnchor} slice" clip-path="url(#${clipId})"/>`
		);
	} else {
		parts.push(
			`<rect x="${x + 8}" y="${y + 8}" width="${width - 16}" height="${height - 16}" fill="#c9c0af" stroke="#766e61" stroke-dasharray="18 12"/>`,
			textLinesSvg(
				[
					`${panel.id} · ${panel.art?.status ?? 'missing art'}`,
					`${panel.camera} · ${(panel.characters ?? []).map((character) => character.id).join(', ') || 'no visible cast'}`,
					...wrapWords(panel.action, Math.max(24, Math.floor(width / 20))).slice(0, 5)
				],
				x + 30,
				y + 50,
				32,
				'font-family="system-ui,sans-serif" font-size="24" fill="#211e19"'
			),
			`<text x="${x + 30}" y="${y + height - 24}" font-family="system-ui,sans-serif" font-size="18" fill="#7b2f24">CONTEXTUAL PRODUCTION PLACEHOLDER</text>`
		);
	}
	for (const overlay of deterministicTextOverlays(sources.data, panel.id)) {
		parts.push(renderSvgTextOverlay(placement, overlay));
	}
	const letteringPlan = planPanelLettering(sources, panel, { placement });
	const dialogues = letteringPlan.entries;
	for (const [dialogueIndex, planned] of dialogues.entries()) {
		const dialogue = planned.dialogue;
		const balloon = { ...dialogue.balloon, ...planned.balloon };
		const plannedDialogue = { ...dialogue, balloon };
		const bx = x + balloon.x * width;
		const by = y + balloon.y * height;
		const bw = balloon.width * width;
		const bh = balloon.height * height;
		const fitted = fittedDialogueText(plannedDialogue, placement);
		const fontSize = fitted.fontSize;
		const manualLines = fitted.lines;
		const lineHeight = fontSize * 1.14;
		const textBlockHeight = Math.max(lineHeight, manualLines.length * lineHeight);
		const firstBaseline = by + Math.max(fontSize + 6, (bh - textBlockHeight) / 2 + fontSize);
		const nextDialogue = dialogues[dialogueIndex + 1]?.dialogue;
		const continuesWithSameSpeaker = nextDialogue?.speaker === dialogue.speaker;
		if (!continuesWithSameSpeaker) {
			const tail = planned.tailRoute
				? routedBalloonTailPath(planned.tailRoute, placement, dialogue)
				: balloon.tailTarget
					? balloonTailPath(
							balloon,
							bx,
							by,
							bw,
							bh,
							x + balloon.tailTarget.x * width,
							y + balloon.tailTarget.y * height
						)
					: '';
			if (tail) parts.push(tail);
		}
		parts.push(
			`<rect class="comic-balloon" data-dialogue-id="${escapeXml(dialogue.id)}" data-speaker-id="${escapeXml(dialogue.speaker)}" data-auto-layout="${planned.automatic ? 'true' : 'false'}" data-auto-sized="${planned.autoSized ? 'true' : 'false'}" x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${dialogue.style === 'robot' ? 8 : Math.min(32, bh / 2)}" fill="#fffdf7" stroke="#171512" stroke-width="5"/>`,
			textLinesSvg(
				manualLines,
				bx + 18,
				firstBaseline,
				lineHeight,
				`font-family="Arial,'Noto Sans',sans-serif" font-size="${fontSize}" fill="#111"`
			)
		);
	}
	if (panel.caption) {
		const lines = wrapWords(panel.caption, Math.max(20, Math.floor(width / 22))).slice(0, 4);
		const boxHeight = 34 + lines.length * 26;
		parts.push(
			`<rect x="${x + 16}" y="${y + height - boxHeight - 16}" width="${width - 32}" height="${boxHeight}" fill="#fff4c7" stroke="#171512" stroke-width="4"/>`,
			textLinesSvg(
				lines,
				x + 32,
				y + height - boxHeight + 20,
				26,
				'font-family="Georgia,serif" font-size="22" fill="#111"'
			)
		);
	}
	for (const effect of panel.soundEffects ?? []) {
		const effectX = x + effect.position.x * width;
		const availableWidth = Math.max(1, x + width - effectX - 16);
		const effectFontSize = Math.max(
			18,
			Math.min(48, availableWidth / Math.max(1, String(effect.text).length * 0.68))
		);
		parts.push(
			`<text x="${effectX}" y="${y + effect.position.y * height}" font-family="system-ui,sans-serif" font-size="${effectFontSize}" font-weight="900" fill="#8d2119" stroke="#fff" stroke-width="2" paint-order="stroke">${escapeXml(effect.text)}</text>`
		);
	}
	parts.push(
		`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="none" stroke="#171512" stroke-width="8"/>`,
		'</g>'
	);
	return parts.join('\n');
}

export function renderPageSvg(sources, page, outputFile) {
	const dimensions = { width: 1600, height: 2400 };
	const panels = panelPlacements(page, dimensions)
		.map((placement) => renderSvgPanel(sources, outputFile, placement))
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}" role="img" aria-labelledby="title description">
	<title id="title">${escapeXml(sources.metadata.title)}, page ${page.page}</title>
	<desc id="description">${escapeXml(page.purpose)}</desc>
	<rect width="1600" height="2400" fill="#f7f0df"/>
	${panels}
	<text x="800" y="2376" text-anchor="middle" font-family="Arial,'Noto Sans',sans-serif" font-size="20" fill="#514b42">${page.page}</text>
</svg>
`;
}

export async function assemblePages(options = {}) {
	const sources = options.sources ?? (await loadEpisodeSources(options));
	const outputDirectory =
		options.outputDirectory ?? path.join(sources.episodeDirectory, 'pages', 'working');
	const entries = [];
	const changed = [];
	for (const page of [...sources.pages].sort((left, right) => left.page - right.page)) {
		const filename = path.join(outputDirectory, `page-${pad(page.page)}.svg`);
		const svg = renderPageSvg(sources, page, filename);
		if (await writeFileIfChanged(filename, svg)) changed.push(filename);
		entries.push({
			page: page.page,
			file: toPosix(path.relative(sources.episodeDirectory, filename)),
			sha256: sha256(svg),
			panelIds: page.panels.map((panel) => panel.id),
			letteringIds: page.panels.flatMap((panel) =>
				deterministicTextOverlays(sources.data, panel.id).map((overlay) => overlay.id)
			)
		});
	}
	const manifest = {
		format: 'suvroghosh-comic-assembled-pages',
		formatVersion: 1,
		episodeId: sources.metadata.id,
		sourceDigest: sources.sourceDigest,
		letteringDigest: sources.letteringDigest,
		letteringEntryCount: deterministicTextEntries(sources.data).length,
		entries
	};
	const manifestPath = path.join(outputDirectory, 'manifest.json');
	if (await writeFileIfChanged(manifestPath, stableJson(manifest))) changed.push(manifestPath);
	return { sources, outputDirectory, manifest, manifestPath, changed };
}

const RASTER_MIME_TYPES = new Map([
	['.avif', 'image/avif'],
	['.gif', 'image/gif'],
	['.jpeg', 'image/jpeg'],
	['.jpg', 'image/jpeg'],
	['.png', 'image/png'],
	['.tif', 'image/tiff'],
	['.tiff', 'image/tiff'],
	['.webp', 'image/webp']
]);

async function embedSvgRasterImages(svg, svgFile) {
	const hrefPattern = /(<image\b[^>]*\bhref=")([^"]+)("[^>]*>)/g;
	const matches = [...svg.matchAll(hrefPattern)];
	if (matches.length === 0) return svg;
	const replacements = new Map();
	for (const match of matches) {
		const href = match[2];
		if (href.startsWith('data:')) continue;
		const sourceFile = path.resolve(path.dirname(svgFile), href);
		const extension = path.extname(sourceFile).toLocaleLowerCase('en');
		const mimeType = RASTER_MIME_TYPES.get(extension);
		if (!mimeType) {
			throw new ComicToolError(
				`Cannot embed unsupported assembled-page image ${toPosix(path.relative(path.dirname(svgFile), sourceFile))}.`
			);
		}
		if (!(await pathExists(sourceFile))) {
			throw new ComicToolError(
				`Assembled-page image is missing: ${toPosix(path.relative(path.dirname(svgFile), sourceFile))}.`
			);
		}
		const bytes = await fs.readFile(sourceFile);
		replacements.set(href, `data:${mimeType};base64,${bytes.toString('base64')}`);
	}
	return svg.replace(hrefPattern, (whole, prefix, href, suffix) =>
		replacements.has(href) ? `${prefix}${replacements.get(href)}${suffix}` : whole
	);
}

export async function renderPagePreviews(options = {}) {
	const sources = options.sources ?? (await loadEpisodeSources(options));
	const inputDirectory =
		options.inputDirectory ?? path.join(sources.episodeDirectory, 'pages', 'working');
	const outputDirectory =
		options.outputDirectory ?? path.join(sources.episodeDirectory, 'pages', 'previews');
	const requestedPages = Array.isArray(options.pages) ? new Set(options.pages) : null;
	let sharp;
	try {
		({ default: sharp } = await import('sharp'));
	} catch (error) {
		throw new ComicToolError(
			`Sharp is required for assembled-page previews: ${error instanceof Error ? error.message : error}`
		);
	}
	const entries = [];
	const changed = [];
	for (const page of [...sources.pages].sort((left, right) => left.page - right.page)) {
		if (requestedPages && !requestedPages.has(page.page)) continue;
		const svgFile = path.join(inputDirectory, `page-${pad(page.page)}.svg`);
		if (!(await pathExists(svgFile))) {
			throw new ComicToolError(
				`Assembled page is missing: ${toPosix(path.relative(sources.episodeDirectory, svgFile))}. Run comic:assemble first.`
			);
		}
		const svg = await fs.readFile(svgFile, 'utf8');
		const embeddedSvg = await embedSvgRasterImages(svg, svgFile);
		const png = await sharp(Buffer.from(embeddedSvg), { density: options.density ?? 72 })
			.png({ compressionLevel: 9, adaptiveFiltering: true })
			.toBuffer();
		const outputFile = path.join(outputDirectory, `page-${pad(page.page)}.png`);
		if (await writeFileIfChanged(outputFile, png)) changed.push(outputFile);
		entries.push({
			page: page.page,
			file: toPosix(path.relative(sources.episodeDirectory, outputFile)),
			bytes: png.length,
			sha256: sha256(png),
			source: toPosix(path.relative(sources.episodeDirectory, svgFile)),
			sourceSha256: sha256(svg)
		});
	}
	const manifest = {
		format: 'suvroghosh-comic-page-previews',
		formatVersion: 1,
		episodeId: sources.metadata.id,
		sourceDigest: sources.sourceDigest,
		letteringDigest: sources.letteringDigest,
		entries
	};
	const manifestPath = path.join(outputDirectory, 'manifest.json');
	if (await writeFileIfChanged(manifestPath, stableJson(manifest))) changed.push(manifestPath);
	return { sources, inputDirectory, outputDirectory, manifest, manifestPath, changed };
}

export async function renderLetteredCover(options = {}) {
	const sources = options.sources ?? (await loadEpisodeSources(options));
	const coverFile = path.join(sources.episodeDirectory, 'cover.yaml');
	const cover = (await readStructuredFile(coverFile)).value;
	const sourceValue =
		options.source ?? cover.provenance?.sourcePath ?? 'panels/approved/cover__r1.png';
	const sourceFile = resolveArtSource(sources, sourceValue);
	if (!sourceFile || !(await pathExists(sourceFile))) {
		throw new ComicToolError(
			`Cover source is missing: ${sourceValue}. Generate or import the unlettered cover first.`
		);
	}
	let sharp;
	try {
		({ default: sharp } = await import('sharp'));
	} catch (error) {
		throw new ComicToolError(
			`Sharp is required for cover composition: ${error instanceof Error ? error.message : error}`
		);
	}
	const original = await fs.readFile(sourceFile);
	const metadata = await sharp(original, { animated: false, failOn: 'error' }).metadata();
	if (!metadata.width || !metadata.height) {
		throw new ComicToolError('Cover source has no readable raster dimensions.');
	}
	const width = metadata.width;
	const height = Math.round((width * 297) / 210);
	const lettering = cover.deterministicLettering ?? {};
	const creator =
		sources.metadata.credits?.find((entry) => entry.role === 'Created and written by')?.name ??
		'Suvro Ghosh';
	const titleBandHeight = Math.round(height * 0.235);
	const footerHeight = Math.max(26, Math.round(height * 0.022));
	const overlay =
		Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect x="0" y="0" width="${width}" height="${titleBandHeight}" fill="#f7f0df" opacity=".12"/>
<text x="${width * 0.055}" y="${height * 0.038}" font-family="Arial,'Noto Sans',sans-serif" font-size="${width * 0.025}" font-weight="700" letter-spacing="${width * 0.0045}" fill="#8d2d24">${escapeXml(lettering.seriesTitle ?? sources.metadata.seriesId)}</text>
<text x="${width * 0.945}" y="${height * 0.038}" text-anchor="end" font-family="Arial,'Noto Sans',sans-serif" font-size="${width * 0.018}" font-weight="700" letter-spacing="${width * 0.0015}" fill="#283a45">${escapeXml(creator.toUpperCase())}</text>
<text x="${width / 2}" y="${height * 0.105}" text-anchor="middle" font-family="'Arial Black',Arial,'Noto Sans',sans-serif" font-size="${width * 0.071}" font-weight="900" letter-spacing="${width * 0.001}" fill="#203643" stroke="#f7f0df" stroke-width="3" paint-order="stroke">${escapeXml((lettering.albumTitle ?? sources.metadata.title).replace(/\s+INSPECTOR$/i, ''))}</text>
<text x="${width / 2}" y="${height * 0.174}" text-anchor="middle" font-family="'Arial Black',Arial,'Noto Sans',sans-serif" font-size="${width * 0.09}" font-weight="900" letter-spacing="${width * 0.002}" fill="#203643" stroke="#f7f0df" stroke-width="3" paint-order="stroke">INSPECTOR</text>
<line x1="${width * 0.26}" y1="${height * 0.193}" x2="${width * 0.74}" y2="${height * 0.193}" stroke="#8d2d24" stroke-width="${Math.max(5, width * 0.007)}"/>
<rect x="${width * 0.382}" y="${height * 0.202}" width="${width * 0.236}" height="${height * 0.034}" rx="${width * 0.01}" fill="#203643"/>
<text x="${width / 2}" y="${height * 0.226}" text-anchor="middle" font-family="Arial,'Noto Sans',sans-serif" font-size="${width * 0.02}" font-weight="800" letter-spacing="${width * 0.002}" fill="#f7f0df">${escapeXml(`${lettering.category ?? 'COMIC'} · ${lettering.albumNumber ?? 'ALBUM 001'}`)}</text>
<g transform="rotate(-5 ${width * 0.775} ${height * 0.39})">
<text x="${width * 0.775}" y="${height * 0.372}" text-anchor="middle" font-family="Arial,'Noto Sans',sans-serif" font-size="${width * 0.025}" font-weight="900" letter-spacing="${width * 0.0015}" fill="#f7f0df" opacity=".9">GOING FORWARD</text>
<text x="${width * 0.775}" y="${height * 0.398}" text-anchor="middle" font-family="Arial,'Noto Sans',sans-serif" font-size="${width * 0.025}" font-weight="900" letter-spacing="${width * 0.0015}" fill="#f7f0df" opacity=".9">TOGETHER</text>
</g>
<rect x="0" y="${height - footerHeight}" width="${width}" height="${footerHeight}" fill="#8d2d24" opacity=".94"/>
<text x="${width / 2}" y="${height - footerHeight * 0.28}" text-anchor="middle" font-family="Arial,'Noto Sans',sans-serif" font-size="${footerHeight * 0.42}" font-weight="800" letter-spacing="${footerHeight * 0.08}" fill="#f7f0df">${escapeXml(lettering.productionLabel ?? 'UNPUBLISHED PRODUCTION EDITION')}</text>
</svg>`);
	const trimmed = await sharp(original, { animated: false, failOn: 'error' })
		.resize(width, height, { fit: 'cover', position: 'centre' })
		.png()
		.toBuffer();
	const composed = await sharp(trimmed)
		.composite([{ input: overlay, blend: 'over' }])
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();
	const outputFile =
		options.outputFile ??
		path.join(sources.episodeDirectory, 'panels', 'approved', 'cover__lettered__r1.png');
	const changed = await writeFileIfChanged(outputFile, composed);
	return {
		sources,
		cover,
		sourceFile,
		outputFile,
		width,
		height,
		bytes: composed.length,
		sha256: sha256(composed),
		changed
	};
}

function isInside(parent, candidate) {
	const relative = path.relative(path.resolve(parent), path.resolve(candidate));
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveArtSource(sources, value) {
	if (!isNonEmptyString(value)) return '';
	if (path.isAbsolute(value) && !value.startsWith('/')) return value;
	if (/^\/(?:images|photos|thumbnail|sketch)\//i.test(value)) {
		return path.join(sources.root, 'static', ...value.split('/').filter(Boolean));
	}
	return path.resolve(sources.episodeDirectory, value);
}

function contextualPlaceholderSvg(page, panel) {
	const cast =
		(panel.characters ?? []).map((character) => character.id).join(', ') || 'No visible cast';
	const actionLines = wrapWords(panel.action, 52).slice(0, 7);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" role="img" aria-labelledby="t d">
<title id="t">${escapeXml(panel.accessibility?.alt || panel.id)}</title>
<desc id="d">${escapeXml(panel.accessibility?.description || panel.action)}</desc>
<rect width="1200" height="900" fill="#d8cfbe"/>
<path d="M0 0L1200 900M1200 0L0 900" stroke="#b6aa98" stroke-width="16"/>
<rect x="60" y="60" width="1080" height="780" rx="20" fill="#efe7d8" stroke="#29251f" stroke-width="8" stroke-dasharray="24 14"/>
<text x="100" y="140" font-family="system-ui,sans-serif" font-size="48" font-weight="800" fill="#211e19">${escapeXml(panel.id)} · ${escapeXml(panel.art?.status ?? 'missing')}</text>
<text x="100" y="205" font-family="system-ui,sans-serif" font-size="28" fill="#514b42">Page ${page.page}, panel ${panel.panel} · ${escapeXml(panel.camera)}</text>
<text x="100" y="260" font-family="system-ui,sans-serif" font-size="28" fill="#514b42">${escapeXml(cast)}</text>
${textLinesSvg(actionLines, 100, 350, 48, 'font-family="system-ui,sans-serif" font-size="34" fill="#211e19"')}
<text x="100" y="790" font-family="system-ui,sans-serif" font-size="24" fill="#7b2f24">CONTEXTUAL PRODUCTION PLACEHOLDER — ART NOT PUBLIC</text>
</svg>
`;
}

async function outputFileRecord(filename, episodeDirectory) {
	const bytes = await fs.readFile(filename);
	return {
		file: toPosix(path.relative(episodeDirectory, filename)),
		bytes: bytes.length,
		sha256: sha256(bytes)
	};
}

export async function exportWeb(options = {}) {
	const sources = options.sources ?? (await loadEpisodeSources(options));
	const outputDirectory =
		options.outputDirectory ?? path.join(sources.episodeDirectory, 'exports', 'web');
	if (isInside(path.join(sources.root, 'static'), outputDirectory)) {
		throw new ComicToolError(
			'Web export is a staging operation and refuses to write directly into static. Publish reviewed derivatives in a separate step.'
		);
	}
	const widths = options.widths ?? WEB_EXPORT_WIDTHS;
	if (!Array.isArray(widths) || widths.some((width) => !Number.isInteger(width) || width <= 0)) {
		throw new ComicToolError('Web export widths must be positive integers.');
	}
	let sharp;
	try {
		({ default: sharp } = await import('sharp'));
	} catch (error) {
		throw new ComicToolError(
			`Sharp is required for raster web export: ${error instanceof Error ? error.message : error}`
		);
	}
	const entries = [];
	const changed = [];
	for (const page of [...sources.pages].sort((left, right) => left.page - right.page)) {
		for (const panel of [...page.panels].sort((left, right) => left.panel - right.panel)) {
			const lettering = deterministicTextOverlays(sources.data, panel.id);
			const candidate = panel.art?.final || panel.art?.source;
			const sourceFile = resolveArtSource(sources, candidate);
			if (
				!sourceFile ||
				!(await pathExists(sourceFile)) ||
				!RASTER_EXTENSIONS.has(path.extname(sourceFile).toLocaleLowerCase('en'))
			) {
				const placeholder = contextualPlaceholderSvg(page, panel);
				const filename = path.join(outputDirectory, 'placeholders', `${panel.id}.svg`);
				if (await writeFileIfChanged(filename, placeholder)) changed.push(filename);
				entries.push({
					page: page.page,
					panel: panel.panel,
					panelId: panel.id,
					status: panel.art?.status ?? 'missing',
					lettering,
					placeholder: await outputFileRecord(filename, sources.episodeDirectory),
					assets: []
				});
				continue;
			}

			const original = await fs.readFile(sourceFile);
			const originalHash = sha256(original);
			const metadata = await sharp(original, { animated: false, failOn: 'error' }).metadata();
			const sourceWidth = metadata.width;
			const effectiveWidths = [
				...new Set([
					...widths.filter((width) => !sourceWidth || width <= sourceWidth),
					...(sourceWidth && widths.every((width) => width > sourceWidth) ? [sourceWidth] : [])
				])
			].sort((left, right) => left - right);
			const assets = [];
			for (const width of effectiveWidths) {
				for (const format of ['webp', 'avif']) {
					const filename = path.join(
						outputDirectory,
						'assets',
						`${panel.id}-${originalHash.slice(0, 12)}-${width}w.${format}`
					);
					await fs.mkdir(path.dirname(filename), { recursive: true });
					const pipeline = sharp(original, { animated: false, failOn: 'error' })
						.rotate()
						.resize({ width, withoutEnlargement: true });
					const encoded =
						format === 'webp'
							? await pipeline.webp({ quality: 82, effort: 5 }).toBuffer()
							: await pipeline.avif({ quality: 55, effort: 5 }).toBuffer();
					if (await writeFileIfChanged(filename, encoded)) changed.push(filename);
					assets.push({
						format,
						width,
						...(await outputFileRecord(filename, sources.episodeDirectory))
					});
				}
			}
			entries.push({
				page: page.page,
				panel: panel.panel,
				panelId: panel.id,
				status: panel.art.status,
				lettering,
				source: {
					path: toPosix(path.relative(sources.root, sourceFile)),
					bytes: original.length,
					sha256: originalHash,
					width: metadata.width ?? null,
					height: metadata.height ?? null
				},
				assets
			});
		}
	}
	const manifest = {
		format: 'suvroghosh-comic-web-export',
		formatVersion: 1,
		episodeId: sources.metadata.id,
		sourceDigest: sources.sourceDigest,
		widths,
		letteringEntryCount: deterministicTextEntries(sources.data).length,
		entries
	};
	const manifestPath = path.join(outputDirectory, 'manifest.json');
	if (await writeFileIfChanged(manifestPath, stableJson(manifest))) changed.push(manifestPath);
	return { sources, outputDirectory, manifest, manifestPath, changed };
}

function promotionEpisodePanels(value) {
	return Array.isArray(value?.pages)
		? value.pages.flatMap((page) => (Array.isArray(page?.panels) ? page.panels : []))
		: [];
}

function stagedWebpFile(sources, inputDirectory, assetFile) {
	if (
		!isNonEmptyString(assetFile) ||
		path.isAbsolute(assetFile) ||
		assetFile.includes('\\') ||
		path.extname(assetFile).toLocaleLowerCase('en') !== '.webp'
	) {
		throw new ComicToolError(`Staged WebP path "${assetFile ?? ''}" is invalid.`);
	}
	const candidates = [
		path.resolve(sources.episodeDirectory, ...assetFile.split('/')),
		path.resolve(inputDirectory, ...assetFile.split('/'))
	];
	const selected = candidates.find((candidate) => isInside(inputDirectory, candidate));
	if (!selected) {
		throw new ComicToolError(`Staged WebP path "${assetFile}" escapes the selected input staging.`);
	}
	return selected;
}

function isWebp(bytes) {
	return (
		bytes.length >= 12 &&
		bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
		bytes.subarray(8, 12).toString('ascii') === 'WEBP'
	);
}

async function verifyExistingPromotedAsset(filename, expected) {
	try {
		const bytes = await fs.readFile(filename);
		if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256 || !isWebp(bytes)) {
			throw new ComicToolError(
				`Refusing to overwrite differing promoted asset ${filename}. Remove or reconcile it explicitly.`
			);
		}
		return true;
	} catch (error) {
		if (error?.code === 'ENOENT') return false;
		throw error;
	}
}

export async function promoteWebAssets(options = {}) {
	const sources = options.sources ?? (await loadEpisodeSources(options));
	const inputDirectory = path.resolve(
		options.inputDirectory ?? path.join(sources.episodeDirectory, 'exports', 'web')
	);
	const manifestPath = path.join(inputDirectory, 'manifest.json');
	const compiledPath =
		options.compiledPath ?? path.join(sources.episodeDirectory, 'generated', 'episode.json');
	if (!(await pathExists(manifestPath))) {
		throw new ComicToolError(
			`Web staging manifest is missing: ${manifestPath}. Run comic:export:web first.`
		);
	}
	if (!(await pathExists(compiledPath))) {
		throw new ComicToolError(
			`Compiled episode is missing: ${compiledPath}. Run comic:compile first.`
		);
	}
	const [{ value: manifest }, { value: compiled }] = await Promise.all([
		readStructuredFile(manifestPath),
		readStructuredFile(compiledPath)
	]);
	if (!isPlainObject(compiled) || compiled.sourceDigest !== sources.sourceDigest) {
		throw new ComicToolError(
			'Compiled episode sourceDigest is stale. Run comic:compile before promoting web assets.'
		);
	}
	if (
		!isPlainObject(manifest) ||
		manifest.format !== 'suvroghosh-comic-web-export' ||
		manifest.formatVersion !== 1 ||
		manifest.sourceDigest !== compiled.sourceDigest
	) {
		throw new ComicToolError(
			'Web staging manifest is invalid or stale relative to the current compiled sourceDigest.'
		);
	}

	const sourcePanels = promotionEpisodePanels(sources);
	const compiledPanels = promotionEpisodePanels(compiled);
	for (const [label, panels] of [
		['canonical source', sourcePanels],
		['compiled episode', compiledPanels]
	]) {
		if (
			panels.length !== WEB_PROMOTION_PANEL_COUNT ||
			panels.some((panel) => panel?.art?.status !== 'final')
		) {
			throw new ComicToolError(
				`Web promotion requires exactly ${WEB_PROMOTION_PANEL_COUNT} final panels in the ${label}.`
			);
		}
	}
	const sourcePanelIds = sourcePanels.map((panel) => panel.id);
	const compiledPanelIds = compiledPanels.map((panel) => panel.id);
	if (
		new Set(sourcePanelIds).size !== WEB_PROMOTION_PANEL_COUNT ||
		new Set(compiledPanelIds).size !== WEB_PROMOTION_PANEL_COUNT ||
		sourcePanelIds.some((panelId) => !compiledPanelIds.includes(panelId))
	) {
		throw new ComicToolError('Canonical and compiled panel identities do not match exactly.');
	}
	if (
		manifest.episodeId !== sources.metadata.id ||
		!Array.isArray(manifest.entries) ||
		manifest.entries.length !== WEB_PROMOTION_PANEL_COUNT
	) {
		throw new ComicToolError(
			`Web staging manifest must contain exactly ${WEB_PROMOTION_PANEL_COUNT} entries for episode ${sources.metadata.id}.`
		);
	}
	if (manifest.entries.some((entry) => Object.hasOwn(entry ?? {}, 'placeholder'))) {
		throw new ComicToolError('Web promotion refuses staging manifests containing placeholders.');
	}

	const manifestByPanel = new Map();
	for (const entry of manifest.entries) {
		if (
			!isPlainObject(entry) ||
			!sourcePanelIds.includes(entry.panelId) ||
			manifestByPanel.has(entry.panelId) ||
			entry.status !== 'final'
		) {
			throw new ComicToolError(
				'Web staging entries must uniquely cover every canonical panel with status final.'
			);
		}
		manifestByPanel.set(entry.panelId, entry);
	}
	if (manifestByPanel.size !== WEB_PROMOTION_PANEL_COUNT) {
		throw new ComicToolError('Web staging does not cover every canonical panel exactly once.');
	}

	const seriesSlug = sources.metadata.seriesSlug;
	const episodeSlug = sources.metadata.slug;
	if (slugify(seriesSlug) !== seriesSlug || slugify(episodeSlug) !== episodeSlug) {
		throw new ComicToolError('Series and episode slugs must be canonical before web promotion.');
	}
	const staticDirectory = path.join(sources.root, 'static');
	const destinationDirectory = path.join(
		staticDirectory,
		'images',
		'comics',
		seriesSlug,
		episodeSlug
	);
	const plans = [];
	for (const panelId of sourcePanelIds) {
		const entry = manifestByPanel.get(panelId);
		const webpAssets = (Array.isArray(entry.assets) ? entry.assets : [])
			.filter((asset) => asset?.format === 'webp')
			.sort(
				(left, right) =>
					Number(right.width) - Number(left.width) ||
					String(left.file).localeCompare(String(right.file), 'en')
			);
		const selected = webpAssets[0];
		if (
			!isPlainObject(selected) ||
			!Number.isInteger(selected.width) ||
			selected.width <= 0 ||
			!Number.isInteger(selected.bytes) ||
			selected.bytes <= 0 ||
			!/^[a-f0-9]{64}$/.test(selected.sha256 ?? '')
		) {
			throw new ComicToolError(`Panel ${panelId} has no valid staged WebP derivative.`);
		}
		const sourceFile = stagedWebpFile(sources, inputDirectory, selected.file);
		let bytes;
		try {
			bytes = await fs.readFile(sourceFile);
		} catch (error) {
			throw new ComicToolError(
				`Cannot read staged WebP for ${panelId}: ${error instanceof Error ? error.message : error}`
			);
		}
		if (bytes.length !== selected.bytes || sha256(bytes) !== selected.sha256 || !isWebp(bytes)) {
			throw new ComicToolError(
				`Staged WebP for ${panelId} does not match its declared bytes, SHA-256, and WebP signature.`
			);
		}
		const destinationFile = path.join(destinationDirectory, `${panelId}-${selected.sha256}.webp`);
		const url = `/${toPosix(path.relative(staticDirectory, destinationFile))}`;
		plans.push({
			panelId,
			sourceFile,
			destinationFile,
			url,
			bytes: selected.bytes,
			sha256: selected.sha256,
			width: selected.width,
			exists: false
		});
	}

	for (const plan of plans) {
		plan.exists = await verifyExistingPromotedAsset(plan.destinationFile, plan);
	}
	const runtimeMap = {
		format: 'suvroghosh-comic-web-runtime-map',
		formatVersion: 1,
		seriesSlug,
		episodeId: sources.metadata.id,
		episodeSlug,
		sourceDigest: compiled.sourceDigest,
		panels: Object.fromEntries(plans.map((plan) => [plan.panelId, plan.url]))
	};
	const runtimeMapPath =
		options.runtimeMapPath ??
		path.join(sources.episodeDirectory, 'generated', 'web-runtime-map.json');
	const runtimeMapSource = stableJson(runtimeMap);
	const copied = [];
	let runtimeMapChanged = false;
	if (options.confirm === true) {
		for (const plan of plans) {
			if (plan.exists) continue;
			await fs.mkdir(path.dirname(plan.destinationFile), { recursive: true });
			try {
				await fs.copyFile(plan.sourceFile, plan.destinationFile, fsConstants.COPYFILE_EXCL);
				copied.push(plan.destinationFile);
			} catch (error) {
				if (error?.code !== 'EEXIST') throw error;
				await verifyExistingPromotedAsset(plan.destinationFile, plan);
			}
		}
		runtimeMapChanged = await writeFileIfChanged(runtimeMapPath, runtimeMapSource);
	}
	return {
		sources,
		confirmed: options.confirm === true,
		inputDirectory,
		destinationDirectory,
		manifestPath,
		compiledPath,
		runtimeMap,
		runtimeMapPath,
		panelCount: plans.length,
		copyCount: plans.filter((plan) => !plan.exists).length,
		existingCount: plans.filter((plan) => plan.exists).length,
		copied,
		runtimeMapChanged,
		changed: [...copied, ...(runtimeMapChanged ? [runtimeMapPath] : [])]
	};
}

export function validationConsoleSummary(result) {
	const heading = result.valid ? 'Comic validation passed' : 'Comic validation failed';
	const detail = `${result.summary.pages} page(s), ${result.summary.panels} panel(s), ${result.summary.errors} error(s), ${result.summary.warnings} warning(s).`;
	const findings = result.issues.map(issueSummary);
	return [heading, detail, ...findings].join('\n');
}
