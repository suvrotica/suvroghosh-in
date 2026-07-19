import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { parseDocument } from 'yaml';

const root = process.cwd();
const postsDir = path.join(root, 'src', 'lib', 'posts');
const manifestPath = path.join(root, 'scripts', 'post-tags-manifest.json');
const generatorVersion = '2026-07-13.1';
const defaultMaxTags = 10;
const minimumTags = 1;

// RAKE-style phrase scoring works locally and deterministically. It needs no model,
// network request, title, filename, category, description, or existing tag value.
const stopwords = new Set(
	`a about above after again against all am an and any are aren't as at be because been before being below
	between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each
	few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself
	him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself just let's me more most
	mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't
	she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then
	there there's these they they'd they'll they're they've this those through to too under until up very was wasn't
	we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's
	will with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves also although among
	another around away back became become becomes becoming came come comes coming could day days did does done even
	ever every felt few first get gets getting got had happen happened happens having here however inside knew know
	known knows last later least left like likely little look looked looking looks made make makes making many may
	might much must nearly never new next often old once one ones only perhaps quite rather really right said say
	saying says see seen seems several since small somehow someone something still take taken takes taking tell tells
	than thing things think thinking thinks though three told took toward two use used uses using want wanted wants
	way ways well went whatever within without word words world worlds would yet now need needs needed bad behind
	stand stands stop stops almost nobody near somewhere
	article articles author blog body category chapter content description essay essays image images markdown page
	paragraph post posts published reader readers section sections site story stories tag tags text title video videos
	suvro suvroghosh suvroghosh.in`.split(/\s+/)
);

const weakTerms = new Set(
	`amount answer area case change changes example fact form forms idea ideas kind kinds level matter part parts
	place point points problem problems question questions reason reasons result results sense side sides sort times
	type types value values year years man men person people life lives city accept acceptable applies apply awake
	badly better comment contains defeat especially expect explaining gives hear helps improving increasingly let
	mean please proceed remains shall soon starts strong understand useful wanting worse
	room house hand hands head face voice water light sound moment moments morning night today`.split(
		/\s+/
	)
);

const acronymDisplay = new Map(
	Object.entries({
		agi: 'AGI',
		ai: 'AI',
		api: 'API',
		apis: 'APIs',
		aqi: 'AQI',
		aws: 'AWS',
		cds: 'CDS',
		cpu: 'CPU',
		csv: 'CSV',
		d3: 'D3',
		ehr: 'EHR',
		etl: 'ETL',
		fhir: 'FHIR',
		gdp: 'GDP',
		gpu: 'GPU',
		hie: 'HIE',
		hipaa: 'HIPAA',
		hl7: 'HL7',
		html: 'HTML',
		http: 'HTTP',
		https: 'HTTPS',
		icd: 'ICD',
		json: 'JSON',
		llm: 'LLM',
		llms: 'LLMs',
		loinc: 'LOINC',
		ml: 'ML',
		mlops: 'MLOps',
		mumps: 'MUMPS',
		nlp: 'NLP',
		nih: 'NIH',
		oauth: 'OAuth',
		pacs: 'PACS',
		pm10: 'PM10',
		pm25: 'PM2.5',
		rag: 'RAG',
		rest: 'REST',
		snomed: 'SNOMED',
		sql: 'SQL',
		ui: 'UI',
		upi: 'UPI',
		url: 'URL',
		urls: 'URLs',
		usa: 'USA',
		va: 'VA',
		vae: 'VAE',
		xml: 'XML'
	})
);

function parseArguments(argv) {
	const options = { dryRun: false, force: false, maxTags: defaultMaxTags, files: [] };

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === '--dry-run') options.dryRun = true;
		else if (argument === '--force') options.force = true;
		else if (argument === '--file') {
			const value = argv[++index];
			if (!value) throw new Error('--file requires a filename or slug.');
			options.files.push(value.replace(/\.md$/i, ''));
		} else if (argument === '--max-tags') {
			const value = Number(argv[++index]);
			if (!Number.isInteger(value) || value < minimumTags || value > 20) {
				throw new Error(`--max-tags must be an integer from ${minimumTags} to 20.`);
			}
			options.maxTags = value;
		} else if (argument === '--help') {
			console.log(`Usage: node scripts/generate-post-tags.mjs [options]

Options:
  --dry-run           Analyse and print tags without writing files or the manifest.
  --force             Reanalyse selected posts even when their cache entries are current.
  --file <slug>       Process one post. May be repeated.
  --max-tags <count>  Generate 1–20 tags per post (default: ${defaultMaxTags}).`);
			process.exit(0);
		} else {
			throw new Error(`Unknown argument: ${argument}`);
		}
	}

	return options;
}

function splitPost(rawText, source) {
	const match = rawText.match(/^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))([\s\S]*)$/);
	if (!match) throw new Error(`${source} must begin with a complete YAML frontmatter block.`);

	const [, opening, frontmatter, closing, body] = match;
	const document = parseDocument(frontmatter, {
		prettyErrors: true,
		strict: true,
		uniqueKeys: true
	});
	const issues = [...document.errors, ...document.warnings];
	if (issues.length > 0) {
		throw new Error(
			`${source} has invalid YAML: ${issues.map((issue) => issue.message).join('; ')}`
		);
	}
	const metadata = document.toJS();
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		throw new Error(`${source} frontmatter must be a key-value object.`);
	}

	return { opening, frontmatter, closing, body, metadata };
}

function bodyHash(body) {
	return crypto.createHash('sha256').update(body, 'utf8').digest('hex');
}

function cleanBody(body) {
	return body
		.normalize('NFC')
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/~~~[\s\S]*?~~~/g, ' ')
		.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[A-Z][A-Za-z0-9_.:-]*(?:\s+[^<>]*)?\/>/g, ' ')
		.replace(/<[A-Z][A-Za-z0-9_.:-]*(?:\s+[^<>]*)?>[\s\S]*?<\/[A-Z][A-Za-z0-9_.:-]*>/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
		.replace(/`[^`]*`/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/^\s{0,3}#{1,6}\s+/gm, '')
		.replace(/^\s{0,3}>\s?/gm, '')
		.replace(/^\s*(?:[-*+] |\d+[.)] )/gm, '')
		.replace(/&(?:nbsp|amp|lt|gt|quot|apos);/gi, ' ')
		.replace(/[\u200B-\u200D\uFEFF]/g, ' ');
}

function normalizeToken(surface) {
	const normalized = surface
		.normalize('NFC')
		.toLocaleLowerCase('en')
		.replace(/[’']s$/u, '')
		.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.+-]+$/gu, '')
		.replace(/\.(?!\d)/g, '');

	if (!normalized || /^\d+(?:\.\d+)?$/u.test(normalized)) return null;
	if (stopwords.has(normalized)) return null;
	if (normalized.length < 3 && !acronymDisplay.has(normalized)) return null;
	return normalized;
}

function tokenMatches(text) {
	return text.match(/[\p{L}\p{N}]+(?:[’'.+-][\p{L}\p{N}]+)*/gu) ?? [];
}

function headingPhrases(body) {
	const phrases = new Set();
	for (const match of body.matchAll(/^\s{0,3}#{1,6}\s+(.+)$/gm)) {
		const keys = tokenMatches(match[1]).map(normalizeToken).filter(Boolean);
		for (let length = 2; length <= Math.min(3, keys.length); length += 1) {
			for (let index = 0; index <= keys.length - length; index += 1) {
				phrases.add(keys.slice(index, index + length).join(' '));
			}
		}
	}
	return phrases;
}

function titleCaseToken(key, surfaces) {
	if (acronymDisplay.has(key)) return acronymDisplay.get(key);
	const surfaceCounts = surfaces.get(key);
	if (surfaceCounts) {
		const preferred = [...surfaceCounts.entries()].sort(
			([leftSurface, leftCount], [rightSurface, rightCount]) =>
				rightCount - leftCount || rightSurface.length - leftSurface.length
		)[0]?.[0];
		if (preferred && /^\p{Lu}[\p{L}\p{N}.'+-]*$/u.test(preferred)) return preferred;
	}
	return key.replace(/(^|[-/])\p{Ll}/gu, (letter) => letter.toLocaleUpperCase('en'));
}

function candidateSimilarity(left, right) {
	const leftSet = new Set(left.keys);
	const rightSet = new Set(right.keys);
	let shared = 0;
	for (const key of leftSet) if (rightSet.has(key)) shared += 1;
	return shared / Math.max(leftSet.size, rightSet.size);
}

function extractTags(body, maxTags, corpus) {
	const cleaned = cleanBody(body);
	const headingKeys = headingPhrases(body);
	const segments = cleaned.split(/[\n.!?;:()[\]{}]|\s+[–—]\s+/u);
	const wordFrequency = new Map();
	const wordDegree = new Map();
	const wordSegments = new Map();
	const wordFirstPosition = new Map();
	const surfaces = new Map();
	const phraseStats = new Map();
	let position = 0;

	for (const [segmentIndex, segment] of segments.entries()) {
		const rawTokens = tokenMatches(segment);
		const candidateRuns = [];
		let run = [];

		for (const surface of rawTokens) {
			const key = normalizeToken(surface);
			if (!key) {
				if (run.length > 0) candidateRuns.push(run);
				run = [];
				continue;
			}

			if (!surfaces.has(key)) surfaces.set(key, new Map());
			const surfaceCounts = surfaces.get(key);
			surfaceCounts.set(surface, (surfaceCounts.get(surface) ?? 0) + 1);
			wordFrequency.set(key, (wordFrequency.get(key) ?? 0) + 1);
			if (!wordFirstPosition.has(key)) wordFirstPosition.set(key, position);
			if (!wordSegments.has(key)) wordSegments.set(key, new Set());
			wordSegments.get(key).add(segmentIndex);
			run.push({ key, position });
			position += 1;
		}
		if (run.length > 0) candidateRuns.push(run);

		for (const candidateRun of candidateRuns) {
			for (const token of candidateRun) {
				wordDegree.set(token.key, (wordDegree.get(token.key) ?? 0) + candidateRun.length - 1);
			}

			for (let length = 2; length <= 3; length += 1) {
				for (let index = 0; index <= candidateRun.length - length; index += 1) {
					const phraseTokens = candidateRun.slice(index, index + length);
					const keys = phraseTokens.map((token) => token.key);
					if (new Set(keys).size !== keys.length) continue;
					const phraseKey = keys.join(' ');
					const existing = phraseStats.get(phraseKey) ?? {
						keys,
						count: 0,
						firstPosition: phraseTokens[0].position,
						segments: new Set()
					};
					existing.count += 1;
					existing.firstPosition = Math.min(existing.firstPosition, phraseTokens[0].position);
					existing.segments.add(segmentIndex);
					phraseStats.set(phraseKey, existing);
				}
			}
		}
	}

	if (position === 0) return [];

	const rakeWordScore = new Map();
	const inverseDocumentFrequency = (key) =>
		Math.log((corpus.documentCount + 1) / ((corpus.documentFrequency.get(key) ?? 0) + 1)) + 1;
	for (const [key, frequency] of wordFrequency) {
		rakeWordScore.set(
			key,
			(((wordDegree.get(key) ?? 0) + frequency) / frequency) * inverseDocumentFrequency(key)
		);
	}

	const phrases = [];
	for (const [key, stats] of phraseStats) {
		const inHeading = headingKeys.has(key);
		if (stats.count < 3 && !inHeading) continue;
		if (stats.keys.some((token) => weakTerms.has(token)) && stats.count < 4 && !inHeading) continue;
		const minimumWordFrequency = Math.min(
			...stats.keys.map((token) => wordFrequency.get(token) ?? stats.count)
		);
		const cohesion = stats.count / minimumWordFrequency;
		const minimumCohesion = stats.keys.length === 3 ? 0.55 : 0.45;
		if (cohesion < minimumCohesion && !inHeading) continue;
		const rakeScore = stats.keys.reduce(
			(total, token) => total + (rakeWordScore.get(token) ?? 0),
			0
		);
		const frequencyBoost = Math.sqrt(stats.count) * Math.pow(cohesion, 1.5);
		const spreadBoost = 1 + Math.min(0.6, stats.segments.size * 0.08);
		const headingBoost = inHeading ? 1.75 : 1;
		const earlyBoost = 1 + 0.2 * (1 - Math.min(1, stats.firstPosition / position));
		phrases.push({
			key,
			keys: stats.keys,
			score: rakeScore * frequencyBoost * spreadBoost * headingBoost * earlyBoost,
			count: stats.count
		});
	}

	const singles = [];
	for (const [key, frequency] of wordFrequency) {
		if (frequency < 3 || weakTerms.has(key)) continue;
		const spread = wordSegments.get(key)?.size ?? 1;
		const firstPosition = wordFirstPosition.get(key) ?? position;
		const earlyBoost = 1 + 0.15 * (1 - Math.min(1, firstPosition / position));
		const specificityBoost = 1 + Math.min(0.3, key.length / 40);
		const acronymBoost = acronymDisplay.has(key) ? 1.35 : 1;
		const corpusBoost = Math.pow(inverseDocumentFrequency(key), 1.4);
		const score =
			frequency *
			(1 + Math.log1p(spread)) *
			earlyBoost *
			specificityBoost *
			acronymBoost *
			corpusBoost;
		singles.push({ key, keys: [key], score, count: frequency });
	}

	const compareCandidates = (left, right) =>
		right.score - left.score || right.count - left.count || left.key.localeCompare(right.key);
	phrases.sort(compareCandidates);
	singles.sort(compareCandidates);

	const selected = [];
	const tokenUsage = new Map();
	const canSelect = (candidate) => {
		if (selected.some((existing) => candidateSimilarity(candidate, existing) >= 0.6)) return false;
		if (candidate.keys.some((key) => (tokenUsage.get(key) ?? 0) >= 2)) return false;
		return true;
	};
	const selectFrom = (candidates, limit) => {
		for (const candidate of candidates) {
			if (selected.length >= limit) break;
			if (!canSelect(candidate)) continue;
			selected.push(candidate);
			for (const key of candidate.keys) tokenUsage.set(key, (tokenUsage.get(key) ?? 0) + 1);
		}
	};

	selectFrom(phrases, Math.min(maxTags, 5));
	selectFrom(singles, maxTags);
	if (selected.length < maxTags) selectFrom(phrases, maxTags);

	return selected
		.slice(0, maxTags)
		.map((candidate) => candidate.keys.map((key) => titleCaseToken(key, surfaces)).join(' '));
}

function replaceTags(post, tags) {
	const eol = post.opening.includes('\r\n') ? '\r\n' : '\n';
	const lines = post.frontmatter.split(/\r?\n/);
	const tagLine = `tags: ${JSON.stringify(tags)}`;
	let start = lines.findIndex((line) => /^tags\s*:/u.test(line));

	if (start === -1) {
		const publishedIndex = lines.findIndex((line) => /^published\s*:/u.test(line));
		start = publishedIndex >= 0 ? publishedIndex : lines.length;
		lines.splice(start, 0, tagLine);
	} else {
		let end = start + 1;
		while (end < lines.length && !/^[A-Za-z_][A-Za-z0-9_-]*\s*:/u.test(lines[end])) end += 1;
		lines.splice(start, end - start, tagLine);
	}

	return post.opening + lines.join(eol) + post.closing + post.body;
}

function tagsEqual(left, right) {
	if (!Array.isArray(left) || left.length !== right.length) return false;
	return left.every((tag, index) => typeof tag === 'string' && tag === right[index]);
}

function loadManifest() {
	if (!fs.existsSync(manifestPath)) return { version: generatorVersion, posts: {} };
	try {
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
		if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error();
		if (!manifest.posts || typeof manifest.posts !== 'object') manifest.posts = {};
		return manifest;
	} catch {
		throw new Error('scripts/post-tags-manifest.json is not valid JSON.');
	}
}

function buildCorpusStatistics(files) {
	const documentFrequency = new Map();
	let documentCount = 0;

	for (const file of files) {
		try {
			const source = path.join(postsDir, file);
			const post = splitPost(fs.readFileSync(source, 'utf8'), file);
			const terms = new Set(tokenMatches(cleanBody(post.body)).map(normalizeToken).filter(Boolean));
			for (const term of terms) {
				documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
			}
			documentCount += 1;
		} catch {
			// The main pass reports the precise source error. Invalid posts do not influence IDF.
		}
	}

	return { documentCount, documentFrequency };
}

function writeAtomic(file, content) {
	const temporary = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(temporary, content, 'utf8');
	try {
		fs.renameSync(temporary, file);
	} finally {
		if (fs.existsSync(temporary)) fs.rmSync(temporary);
	}
}

async function main() {
	const options = parseArguments(process.argv.slice(2));
	const manifest = loadManifest();
	const manifestPosts = manifest.posts;
	const availableFiles = fs
		.readdirSync(postsDir)
		.filter((file) => file.endsWith('.md'))
		.sort();
	const files =
		options.files.length === 0
			? availableFiles
			: availableFiles.filter((file) => options.files.includes(file.replace(/\.md$/i, '')));

	if (options.files.length > 0 && files.length !== new Set(options.files).size) {
		const found = new Set(files.map((file) => file.replace(/\.md$/i, '')));
		const missing = [...new Set(options.files)].filter((file) => !found.has(file));
		throw new Error(`Post file not found: ${missing.join(', ')}`);
	}
	const corpus = buildCorpusStatistics(availableFiles);

	let analysed = 0;
	let updated = 0;
	let skipped = 0;
	let failed = 0;
	const currentSources = new Set();

	for (const file of files) {
		const fullPath = path.join(postsDir, file);
		const source = path.relative(root, fullPath).replaceAll(path.sep, '/');
		currentSources.add(source);
		try {
			const rawText = fs.readFileSync(fullPath, 'utf8');
			const post = splitPost(rawText, source);
			const hash = bodyHash(post.body);
			const cache = manifestPosts[source];
			const cachedTags = cache?.generatedTags;
			if (
				!options.force &&
				cache?.bodyHash === hash &&
				cache?.generatorVersion === generatorVersion &&
				Array.isArray(cachedTags) &&
				tagsEqual(post.metadata.tags, cachedTags)
			) {
				skipped += 1;
				continue;
			}

			const tags = extractTags(post.body, options.maxTags, corpus);
			if (tags.length < minimumTags) {
				throw new Error(`only ${tags.length} meaningful body-derived tags were available`);
			}
			analysed += 1;

			if (options.dryRun) {
				console.log(`${file}: ${JSON.stringify(tags)}`);
				continue;
			}

			if (!tagsEqual(post.metadata.tags, tags)) {
				writeAtomic(fullPath, replaceTags(post, tags));
				updated += 1;
			}
			manifestPosts[source] = {
				bodyHash: hash,
				generatedTags: tags,
				generatorVersion
			};
		} catch (error) {
			failed += 1;
			console.error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	if (!options.dryRun) {
		if (options.files.length === 0) {
			for (const source of Object.keys(manifestPosts)) {
				if (!currentSources.has(source)) delete manifestPosts[source];
			}
		}
		manifest.version = generatorVersion;
		manifest.maxTags = options.maxTags;
		fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
		const prettierConfig = (await resolveConfig(manifestPath)) ?? {};
		const formattedManifest = await format(JSON.stringify(manifest), {
			...prettierConfig,
			filepath: manifestPath
		});
		writeAtomic(manifestPath, formattedManifest);
	}

	console.log(
		`Post tags: scanned ${files.length}, analysed ${analysed}, updated ${updated}, skipped ${skipped}, failed ${failed}${options.dryRun ? ' (dry run)' : ''}.`
	);
	if (failed > 0) process.exitCode = 1;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
	try {
		await main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

export { bodyHash, buildCorpusStatistics, extractTags, replaceTags, splitPost };
