#!/usr/bin/env node

/**
 * Deterministic, repository-only content-corpus audit.
 *
 * This script intentionally makes no network requests and uses no model or embedding API. Content
 * modes, scores, intent overlap, and treatments are conservative heuristics for editorial review;
 * they are not measurements of search demand or substitutes for Search Console/Bing data.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parsePostFrontmatter } from './lib/post-metadata.mjs';

export const CONTENT_MODES = Object.freeze([
	'professional authority',
	'search-oriented technical explainer',
	'search-oriented scientific explainer',
	'interactive visualization',
	'current-affairs analysis',
	'evidence-sensitive medical or healthcare information',
	'evergreen essay',
	'personal essay',
	'satire',
	'fiction',
	'project documentation',
	'archival or private-value writing'
]);

export const OUTPUT_FILENAMES = Object.freeze([
	'CONTENT_INVENTORY.csv',
	'CONTENT_CLASSIFICATION.csv',
	'DUPLICATION_AND_CANNIBALIZATION.csv',
	'EVIDENCE_AUDIT.csv',
	'CONTENT_REMEDIATION_QUEUE.md'
]);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_AUDIT_DATE = '2026-08-06';
const DEFAULT_SITE_ORIGIN = 'https://www.suvroghosh.in';
const HEURISTIC_STATUS = 'HEURISTIC_INFERENCE — REQUIRES EDITORIAL REVIEW';
const SEARCH_METRICS_STATUS = 'UNVERIFIED — AUTHENTICATED SEARCH DATA NOT PROVIDED';
const INDEX_STATUS = 'UNVERIFIED — REQUIRES AUTHENTICATED SEARCH CONSOLE OR BING EVIDENCE';
const OFFLINE_LINK_STATUS = 'UNVERIFIED — OFFLINE AUDIT MADE NO HTTP REQUESTS';
const UUID_PATH_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const REDACTED_UUID_PATH = '[REDACTED-UUID-PATH]';
const REDACTED_UNPUBLISHED_SOURCE = '[REDACTED-UNPUBLISHED-SOURCE-AGGREGATE]';

const STOPWORDS = new Set(
	`a about above after again against all am an and any are aren't as at be because been before being
	below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down
	during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here
	here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself
	let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves
	out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their
	theirs them themselves then there there's these they they'd they'll they're they've this those through to
	too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where
	where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your
	yours yourself yourselves also one two may might much many make makes made using use used like just even
	still well way thing things post article reader readers section site suvro ghosh`.split(/\s+/)
);

const MODE_DEFAULTS = Object.freeze({
	'professional authority': {
		audience: 'healthcare, technology, or professional practitioners',
		outcome: 'understand a practitioner-informed system or professional decision',
		business: 5,
		search: 4,
		originality: 4,
		evidence: 4
	},
	'search-oriented technical explainer': {
		audience: 'technical practitioners, students, and technically curious readers',
		outcome: 'understand or apply a technical concept',
		business: 3,
		search: 5,
		originality: 3,
		evidence: 4
	},
	'search-oriented scientific explainer': {
		audience: 'science or mathematics learners and technically curious readers',
		outcome: 'build an accurate conceptual understanding of a scientific topic',
		business: 2,
		search: 5,
		originality: 3,
		evidence: 4
	},
	'interactive visualization': {
		audience: 'visual learners, educators, students, and technical readers',
		outcome: 'explore a concept through an interactive or visual model',
		business: 3,
		search: 4,
		originality: 5,
		evidence: 4
	},
	'current-affairs analysis': {
		audience: 'readers seeking contextual analysis of public events',
		outcome: 'understand an event, policy, or geopolitical development in context',
		business: 1,
		search: 3,
		originality: 3,
		evidence: 5
	},
	'evidence-sensitive medical or healthcare information': {
		audience: 'healthcare readers, patients, caregivers, or clinical-data practitioners',
		outcome:
			'understand a health, clinical, or public-health subject without treating it as personal medical advice',
		business: 4,
		search: 5,
		originality: 3,
		evidence: 5
	},
	'evergreen essay': {
		audience: 'general readers interested in ideas, society, culture, or reflection',
		outcome: 'consider an enduring argument or perspective',
		business: 1,
		search: 2,
		originality: 4,
		evidence: 2
	},
	'personal essay': {
		audience: 'direct, subscriber, social, and recommendation-driven readers',
		outcome: 'share in a first-person experience or reflection',
		business: 1,
		search: 1,
		originality: 5,
		evidence: 1
	},
	satire: {
		audience: 'direct, subscriber, social, and recommendation-driven readers',
		outcome: 'experience social or cultural critique through satire',
		business: 0,
		search: 0,
		originality: 5,
		evidence: 0
	},
	fiction: {
		audience:
			'fiction readers reached through direct, subscriber, social, and recommendation channels',
		outcome: 'experience an original story',
		business: 0,
		search: 0,
		originality: 5,
		evidence: 0
	},
	'project documentation': {
		audience: 'developers, project evaluators, learners, and potential collaborators',
		outcome: 'understand, reproduce, or evaluate a project',
		business: 4,
		search: 3,
		originality: 5,
		evidence: 3
	},
	'archival or private-value writing': {
		audience: 'existing readers and people seeking the author’s archive',
		outcome: 'preserve or revisit a personal, media, or time-specific record',
		business: 0,
		search: 0,
		originality: 4,
		evidence: 1
	}
});

const HEALTHCARE_PATTERN =
	/\b(health(?:care)?|clinical|medical|patient|hospital|ehr|fhir|hl7|disease|diagnos|treatment|medication|public health|mental health)\b/i;
const TECHNICAL_PATTERN =
	/\b(technology|software|database|algorithm|computer|programming|code|api|artificial intelligence|machine learning|\bai\b|cybersecurity|data|fhir|hl7|sql|vector|model)\b/i;
const SCIENCE_PATTERN =
	/\b(science|mathematics|statistics|physics|chemistry|biology|neuroscience|astronomy|geometry|calculus|probability|equation|fractal|chaos|quantum|evolution)\b/i;
const CURRENT_AFFAIRS_PATTERN =
	/\b(politics?|geopolitics?|election|war|policy|government|demonetization|economy|sanction|conflict|ukraine|iran|india|current affairs?)\b/i;
const FIRST_PERSON_PATTERN = /\b(i|i'm|i’ve|i've|my|mine|me|we|we’re|we've|our|ours)\b/gi;
const EXPERIENCE_PATTERN =
	/\b(in my (?:work|career|experience)|i (?:worked|built|managed|led|learned|saw|found)|my years|first-hand|firsthand|from experience|at the va|veterans affairs)\b/gi;
const METHODOLOGY_PATTERN =
	/\b(method(?:ology)?|approach|procedure|experiment(?:al)?|we measured|i measured|dataset|sample size|assumption|limitations?|protocol|reproduc)\b/i;
const CALCULATION_PATTERN =
	/(?:\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\b(?:calculate|calculation|derive|derivation|equation|formula)\b)/i;
const DATA_PATTERN =
	/\b(dataset|data source|download data|csv|json|repository|github|notebook|measurements?)\b/i;
const DISTINCTION_PATTERN =
	/\b(in my opinion|opinion|inference|infer(?:red|ence)?|speculat(?:e|ion)|satire|fiction|not medical advice|hypothesis|uncertain(?:ty)?)\b/i;

function asString(value) {
	if (value === undefined || value === null) return '';
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	return String(value);
}

function unique(values) {
	return [...new Set(values.filter(Boolean))];
}

function clampScore(value) {
	return Math.max(0, Math.min(5, Math.round(value)));
}

function normalizeWhitespace(value) {
	return asString(value).replace(/\s+/g, ' ').trim();
}

function truncate(value, length = 240) {
	const normalized = normalizeWhitespace(value);
	return normalized.length <= length ? normalized : `${normalized.slice(0, length - 1)}…`;
}

function slugifyCategory(category = 'uncategorized') {
	return asString(category)
		.toLowerCase()
		.trim()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function normalizeTag(value) {
	return asString(value)
		.normalize('NFKC')
		.toLocaleLowerCase('en')
		.replace(/&/g, ' and ')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function extractBody(source) {
	const frontmatter = source.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
	if (!frontmatter) return '';
	return source.slice(frontmatter[0].length);
}

function stripMarkdown(markdown) {
	return markdown
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/~~~[\s\S]*?~~~/g, ' ')
		.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/^\s{0,3}#{1,6}\s+/gm, '')
		.replace(/^\s{0,3}(?:[-*+] |\d+[.)] |> ?)/gm, '')
		.replace(/[`*_~]/g, '')
		.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function tokenize(value) {
	return (
		normalizeWhitespace(value)
			.toLocaleLowerCase('en')
			.match(/[\p{L}\p{N}]+/gu) ?? []
	).filter((token) => token.length > 2 && !STOPWORDS.has(token) && !/^\d{1,2}$/.test(token));
}

function normalizedBodyHash(visibleText) {
	const normalized = tokenize(visibleText).join(' ');
	return crypto.createHash('sha256').update(normalized).digest('hex');
}

function csvEscape(value) {
	const string = asString(value);
	return /[",\r\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

export function rowsToCsv(headers, rows) {
	return `${[headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))]
		.map((values) => values.map(csvEscape).join(','))
		.join('\n')}\n`;
}

export function markdownLinkRecords(body) {
	const records = [];
	const markdownLink = /(?<!!)\[([^\]]+)\]\(/g;
	for (const match of body.matchAll(markdownLink)) {
		const destinationStart = (match.index ?? 0) + match[0].length;
		let destinationEnd = destinationStart;
		let nestedParentheses = 0;
		let escaped = false;
		for (; destinationEnd < body.length; destinationEnd += 1) {
			const character = body[destinationEnd];
			if (escaped) {
				escaped = false;
				continue;
			}
			if (character === '\\') {
				escaped = true;
				continue;
			}
			if (character === '(') nestedParentheses += 1;
			else if (character === ')' && nestedParentheses > 0) nestedParentheses -= 1;
			else if (character === ')') break;
		}
		if (destinationEnd >= body.length) continue;
		let destination = body.slice(destinationStart, destinationEnd).trim();
		if (destination.startsWith('<') && destination.includes('>')) {
			destination = destination.slice(1, destination.indexOf('>'));
		} else {
			destination = destination.split(/\s+["']/)[0];
		}
		records.push({ anchor: stripMarkdown(match[1]), destination, index: match.index ?? 0 });
	}
	for (const match of body.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
		records.push({
			anchor: stripMarkdown(match[2]),
			destination: match[1],
			index: match.index ?? 0
		});
	}
	return records.sort(
		(left, right) => left.index - right.index || left.destination.localeCompare(right.destination)
	);
}

function classifyLink(destination, siteOrigin) {
	const value = destination.trim();
	if (!value || value.startsWith('#') || /^(?:mailto|tel|javascript|data):/i.test(value))
		return 'other';
	if (value.startsWith('/')) return 'internal';
	try {
		const url = new URL(value, `${siteOrigin}/`);
		return url.origin === new URL(siteOrigin).origin ? 'internal' : 'external';
	} catch {
		return 'malformed';
	}
}

function referenceSectionStart(body) {
	const match = /^#{1,6}\s+(?:sources?|references?|further reading|bibliography|notes)\s*$/im.exec(
		body
	);
	return match?.index ?? -1;
}

function externalDomain(destination) {
	try {
		return new URL(destination).hostname.toLocaleLowerCase('en').replace(/^www\./, '');
	} catch {
		return '';
	}
}

export function sanitizedLinkTarget(destination, siteOrigin) {
	try {
		const url = new URL(destination, `${siteOrigin}/`);
		// Credentials, query parameters, and fragments are unnecessary for this corpus-level report and
		// can contain private or ephemeral values. UUID-bearing paths on external services can likewise
		// identify private/shared artifacts, so retain their origin evidence but redact the entire path.
		if (url.origin !== new URL(siteOrigin).origin && UUID_PATH_PATTERN.test(url.pathname)) {
			return `${url.origin}/${REDACTED_UUID_PATH}`;
		}
		// Otherwise preserve only the stable origin/path evidence.
		return destination.startsWith('/') ? url.pathname : `${url.origin}${url.pathname}`;
	} catch {
		return '';
	}
}

function institutionalDomain(domain) {
	return (
		/(?:^|\.)(?:gov|gov\.in|edu|ac\.in)$/i.test(domain) ||
		/(?:who\.int|nih\.gov|cdc\.gov|nhs\.uk|worldbank\.org|oecd\.org|un\.org|europa\.eu|rfc-editor\.org|w3\.org|ietf\.org|nist\.gov)$/i.test(
			domain
		)
	);
}

function extractHeadings(body) {
	return [...body.matchAll(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/gm)].map((match) => ({
		level: match[1].length,
		text: stripMarkdown(match[2])
	}));
}

function extractOpeningParagraph(body) {
	const withoutCode = body
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/~~~[\s\S]*?~~~/g, ' ')
		.replace(/^\s*<[^>]+>\s*$/gm, ' ');
	for (const block of withoutCode.split(/\r?\n\s*\r?\n/)) {
		if (/^\s*(?:#{1,6}|[-*+] |\d+[.)] |>)/.test(block)) continue;
		const visible = stripMarkdown(block);
		if (visible.length >= 40) return truncate(visible, 360);
	}
	return '';
}

function extractRepeatedPassageCandidates(body) {
	return body
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/~~~[\s\S]*?~~~/g, ' ')
		.split(/\r?\n\s*\r?\n/)
		.map((block) => ({
			raw: stripMarkdown(block),
			normalized: tokenize(stripMarkdown(block)).join(' ')
		}))
		.filter(({ raw, normalized }) => raw.length >= 180 && normalized.split(' ').length >= 25)
		.filter(({ raw }) => !/^(?:acronyms expanded|table of contents|related reading)\b/i.test(raw));
}

function countPattern(value, pattern) {
	const flags = unique([...pattern.flags.replace('g', ''), 'g']).join('');
	return [...value.matchAll(new RegExp(pattern.source, flags))].length;
}

function termOverlap(left, right) {
	const leftSet = new Set(tokenize(left));
	const rightSet = new Set(tokenize(right));
	if (leftSet.size === 0) return 0;
	let shared = 0;
	for (const token of leftSet) if (rightSet.has(token)) shared += 1;
	return shared / leftSet.size;
}

function riskCues(post) {
	const haystack = `${post.metadata.category} ${post.metadata.tags.join(' ')} ${post.metadata.title} ${post.visibleText}`;
	const cues = [];
	if (HEALTHCARE_PATTERN.test(haystack)) cues.push('medical_or_healthcare');
	if (SCIENCE_PATTERN.test(haystack)) cues.push('scientific_or_mathematical');
	if (TECHNICAL_PATTERN.test(haystack)) cues.push('technical');
	if (CURRENT_AFFAIRS_PATTERN.test(haystack)) cues.push('political_financial_or_current_affairs');
	if (/\b\d+(?:\.\d+)?\s*%/.test(haystack)) cues.push('percentage_claims');
	if (/\b(?:19|20)\d{2}\b/.test(post.visibleText)) cues.push('dated_claims');
	if (
		/\b(?:study|research|report|survey|data (?:show|shows|suggest)|evidence (?:show|shows|suggest)|according to)\b/i.test(
			haystack
		)
	) {
		cues.push('attributed_or_research_claims');
	}
	return cues;
}

function claimCandidates(visibleText) {
	const candidates = visibleText
		.split(/(?<=[.!?])\s+/)
		.map(normalizeWhitespace)
		.filter((sentence) => sentence.length >= 45 && sentence.length <= 500)
		.filter((sentence) =>
			/(?:\b\d+(?:\.\d+)?\s*%|\b(?:19|20)\d{2}\b|\b(?:causes?|increases?|reduces?|prevents?|proves?|shows?|demonstrates?|associated with|more likely|less likely|research|study|data)\b)/i.test(
				sentence
			)
		);
	return {
		count: candidates.length,
		samples: candidates.slice(0, 3).map((item) => truncate(item, 180))
	};
}

function sourceYears(post) {
	if (post.referenceStart < 0) return [];
	return unique(post.body.slice(post.referenceStart).match(/\b(?:19|20)\d{2}\b/g) ?? []).sort();
}

function medicalIsPersonal(category, post) {
	return (
		/personal|memoir|life/i.test(category) ||
		(/mental health/i.test(category) && post.firstPersonCount >= 8)
	);
}

export function classifyContentMode(post) {
	const category = asString(post.metadata.category);
	const title = asString(post.metadata.title);
	const tagText = post.metadata.tags.join(' ');
	const metadataText = `${category} ${tagText} ${title}`;
	const lowerCategory = category.toLocaleLowerCase('en');
	const explicitVisualization =
		lowerCategory === 'visualizations' ||
		post.metadata.interactiveFirst === true ||
		(/\b(interactive visualization|visualization|simulator|explorer|laboratory)\b/i.test(
			`${tagText} ${title}`
		) &&
			/(<svelte:component|<iframe|<canvas|interactiveFirst|<Interactive|<Lab\b|<Explorer\b)/i.test(
				post.body
			));

	if (explicitVisualization) {
		return {
			mode: 'interactive visualization',
			confidence: 'HIGH',
			signals: 'explicit visualization metadata or interactive markup'
		};
	}
	if (/^(?:short fiction|fiction)$/i.test(category) || /\bfiction\b/i.test(tagText)) {
		return { mode: 'fiction', confidence: 'HIGH', signals: 'explicit fiction category or tag' };
	}
	if (/satire/i.test(category) || /\bsatire\b/i.test(tagText)) {
		return { mode: 'satire', confidence: 'HIGH', signals: 'explicit satire category or tag' };
	}

	const projectSignals =
		/^(?:engineering blog|mojollm|games)$/i.test(category) ||
		Boolean(post.metadata.notebook) ||
		(/\b(project|building|build|implementation|repository|from scratch)\b/i.test(title) &&
			post.codeFenceCount >= 2);
	if (projectSignals) {
		return {
			mode: 'project documentation',
			confidence: 'MEDIUM',
			signals: 'project/category, notebook, or build-plus-code signals'
		};
	}

	const healthcare = HEALTHCARE_PATTERN.test(metadataText);
	if (healthcare && medicalIsPersonal(category, post)) {
		return {
			mode: 'personal essay',
			confidence: 'MEDIUM',
			signals: 'personal metadata plus strong first-person healthcare context'
		};
	}
	if (
		healthcare &&
		/public health|health$|healthcare$|medical|clinical|neuroscience|psychology/i.test(
			lowerCategory
		)
	) {
		return {
			mode: 'evidence-sensitive medical or healthcare information',
			confidence: 'MEDIUM',
			signals: 'health/clinical/public-health category and vocabulary'
		};
	}

	const professionalExperience = countPattern(post.body, EXPERIENCE_PATTERN) > 0;
	if (
		healthcare &&
		/healthcare(?:-|\s)?it|healthcare ai|healthcare systems|healthcare science/i.test(lowerCategory)
	) {
		if (professionalExperience) {
			return {
				mode: 'professional authority',
				confidence: 'MEDIUM',
				signals: 'healthcare-technology topic plus first-hand professional-experience cues'
			};
		}
		return {
			mode: 'search-oriented technical explainer',
			confidence: 'MEDIUM',
			signals: 'healthcare-technology category without explicit first-hand cue'
		};
	}

	if (
		CURRENT_AFFAIRS_PATTERN.test(metadataText) &&
		/politic|geopolit|econom|climate|india|society/i.test(lowerCategory)
	) {
		return {
			mode: 'current-affairs analysis',
			confidence: 'MEDIUM',
			signals: 'political, economic, geopolitical, or current-event metadata'
		};
	}
	if (
		SCIENCE_PATTERN.test(metadataText) &&
		/science|mathemat|statistics|neuroscience|natural history|psychology/i.test(lowerCategory)
	) {
		return {
			mode: 'search-oriented scientific explainer',
			confidence: 'MEDIUM',
			signals: 'scientific or mathematical category and vocabulary'
		};
	}
	if (
		TECHNICAL_PATTERN.test(metadataText) &&
		/technology|artificial intelligence|\bai\b|computer|cyber|audio|knowledge/i.test(lowerCategory)
	) {
		return {
			mode: 'search-oriented technical explainer',
			confidence: 'MEDIUM',
			signals: 'technical category and vocabulary'
		};
	}
	if (
		/personal essay|^personal$|memoir|personal reflections|calcutta life|life/i.test(lowerCategory)
	) {
		return {
			mode: 'personal essay',
			confidence: 'HIGH',
			signals: 'explicit personal-essay, personal, memoir, or life category'
		};
	}
	if (/^(?:video|ai music song)$/i.test(category) && post.wordCount < 700) {
		return {
			mode: 'archival or private-value writing',
			confidence: 'MEDIUM',
			signals: 'media/archive category with limited accompanying text'
		};
	}
	if (/career/i.test(lowerCategory) && professionalExperience) {
		return {
			mode: 'professional authority',
			confidence: 'MEDIUM',
			signals: 'career category plus professional-experience cues'
		};
	}
	if (
		/essay|society|culture|philosophy|polemic|monologue|social commentary|thinking|ideas|education|art history/i.test(
			lowerCategory
		)
	) {
		return {
			mode: 'evergreen essay',
			confidence: 'MEDIUM',
			signals: 'essay, ideas, society, culture, or commentary category'
		};
	}
	if (post.wordCount < 350) {
		return {
			mode: 'archival or private-value writing',
			confidence: 'LOW',
			signals: 'short uncategorised/fallback source record'
		};
	}
	return {
		mode: 'evergreen essay',
		confidence: 'LOW',
		signals: 'fallback classification; no stronger explicit mode signal'
	};
}

function evidenceQuality(post, evidenceRequirement) {
	let score = 0;
	if (post.externalLinks.length > 0) score = 1;
	if (post.externalLinks.length >= 2) score = 2;
	if (post.referenceLinks.length >= 2 || post.institutionalSourceCount >= 2) score = 3;
	if (post.referenceLinks.length >= 4 && post.institutionalSourceCount >= 2) score = 4;
	if (
		post.referenceLinks.length >= 6 &&
		post.institutionalSourceCount >= 4 &&
		METHODOLOGY_PATTERN.test(post.body)
	)
		score = 5;
	if (
		evidenceRequirement >= 3 &&
		post.codeFenceCount >= 2 &&
		(METHODOLOGY_PATTERN.test(post.body) || CALCULATION_PATTERN.test(post.body))
	) {
		score = Math.max(score, 3);
	}
	return clampScore(score);
}

function recommendedTreatment(post) {
	const mode = post.mode.mode;
	if (mode === 'satire' || mode === 'fiction' || mode === 'personal essay') {
		return `PRESERVE AS ${mode.toUpperCase()}; no search-demand defect inferred; assess through direct, subscriber, recommendation, and social readership`;
	}
	if (post.evidenceRequirement >= 4 && post.evidenceQuality < 3) {
		return 'EDITORIAL REVIEW: map consequential claims to primary/institutional evidence and add a genuine review date; do not add decorative references';
	}
	const factualAge =
		post.metadata.date && post.metadata.date < '2025-01-01' && !post.metadata.dateModified;
	if (factualAge && post.evidenceRequirement >= 3) {
		return 'EDITORIAL REVIEW: verify factual freshness and record a substantive modification/review date only if a real review occurs';
	}
	if (post.searchRelevance >= 4 && post.titleBodyOverlap < 0.16) {
		return 'EDITORIAL REVIEW: check whether a truthful descriptive SEO title or subtitle should clarify the practical subject while preserving the literary H1';
	}
	return 'PRESERVE; no automatic merge, deletion, noindex, or rewrite is justified by repository-only evidence';
}

function preparePost({ file, postsDir, metadata, body, source, siteOrigin, aliasBySource }) {
	const slug = file.replace(/\.md$/i, '');
	const sourceRoute = `/blog/${slugifyCategory(metadata.category)}/${encodeURIComponent(slug)}`;
	const redirectDestination = aliasBySource.get(sourceRoute) ?? '';
	const sourceStatus =
		metadata.published === false
			? 'UNPUBLISHED_NOT_CANONICAL'
			: redirectDestination
				? 'REDIRECT_SOURCE_NOT_CANONICAL'
				: 'CANONICAL_PUBLISHED_ARTICLE';
	const canonicalUrl =
		sourceStatus === 'CANONICAL_PUBLISHED_ARTICLE'
			? `${siteOrigin}${sourceRoute}`
			: redirectDestination
				? `${siteOrigin}${redirectDestination}`
				: '';
	const visibleText = stripMarkdown(body);
	const headings = extractHeadings(body);
	const links = markdownLinkRecords(body);
	const referenceStart = referenceSectionStart(body);
	const internalLinks = links.filter(
		(link) => classifyLink(link.destination, siteOrigin) === 'internal'
	);
	const externalLinks = links.filter(
		(link) => classifyLink(link.destination, siteOrigin) === 'external'
	);
	const malformedLinks = links.filter(
		(link) => classifyLink(link.destination, siteOrigin) === 'malformed'
	);
	const referenceLinks = externalLinks.filter(
		(link) => referenceStart >= 0 && link.index >= referenceStart
	);
	const domains = unique(externalLinks.map((link) => externalDomain(link.destination))).sort();
	const firstPersonCount = countPattern(visibleText, FIRST_PERSON_PATTERN);
	const codeFenceCount = (body.match(/^(?:```|~~~)/gm) ?? []).length / 2;
	const imageAlts = [...body.matchAll(/!\[([^\]]*)\]\([^)]*\)/g)].map((match) => match[1].trim());
	for (const match of body.matchAll(/<(?:Pi|img)\b([^>]*)>/gi)) {
		const alt = /\balt=["']([^"']*)["']/i.exec(match[1])?.[1] ?? '';
		imageAlts.push(alt.trim());
	}
	const post = {
		file,
		fullPath: path.join(postsDir, file),
		sourceFile: path.posix.join('src/lib/posts', file),
		metadata: {
			...metadata,
			title: asString(metadata.title),
			description: asString(metadata.description),
			category: asString(metadata.category),
			date: asString(metadata.date),
			dateModified: asString(metadata.dateModified),
			tags: Array.isArray(metadata.tags) ? metadata.tags.map(asString) : [],
			series: Array.isArray(metadata.series) ? metadata.series.map(asString) : []
		},
		body,
		source,
		slug,
		sourceRoute,
		redirectDestination,
		sourceStatus,
		canonicalUrl,
		siteOrigin,
		visibleText,
		wordCount: visibleText.match(/[\p{L}\p{N}]+/gu)?.length ?? 0,
		bodyHash: normalizedBodyHash(visibleText),
		headings,
		openingParagraph: extractOpeningParagraph(body),
		links,
		internalLinks,
		externalLinks,
		malformedLinks,
		referenceStart,
		referenceLinks,
		domains,
		institutionalSourceCount: externalLinks.filter((link) =>
			institutionalDomain(externalDomain(link.destination))
		).length,
		firstPersonCount,
		codeFenceCount,
		imageAlts,
		titleBodyOverlap: termOverlap(metadata.title, `${metadata.description ?? ''} ${visibleText}`),
		repeatedPassages: extractRepeatedPassageCandidates(body)
	};
	post.mode = classifyContentMode(post);
	const defaults = MODE_DEFAULTS[post.mode.mode];
	const topicalText = `${post.metadata.category} ${post.metadata.tags.join(' ')}`;
	post.businessRelevance = clampScore(
		defaults.business + (HEALTHCARE_PATTERN.test(topicalText) ? 1 : 0)
	);
	post.searchRelevance = clampScore(defaults.search);
	post.originality = clampScore(defaults.originality + (post.firstPersonCount >= 8 ? 1 : 0));
	post.evidenceRequirement = clampScore(defaults.evidence);
	post.evidenceQuality = evidenceQuality(post, post.evidenceRequirement);
	post.riskCues = riskCues(post);
	post.claims = claimCandidates(visibleText);
	post.treatment = recommendedTreatment(post);
	return post;
}

function readAliases(aliasesFile, siteOrigin) {
	if (!aliasesFile || !fs.existsSync(aliasesFile)) return new Map();
	const text = fs.readFileSync(aliasesFile, 'utf8');
	const block = text.match(/export const postPathAliases[\s\S]*?=\s*\{([\s\S]*?)\};/);
	if (!block) throw new Error(`Could not parse postPathAliases in ${aliasesFile}`);
	const aliases = new Map();
	for (const match of block[1].matchAll(/["']([^"']+)["']\s*:\s*["']([^"']+)["']/g)) {
		const source = new URL(`/blog/${match[1]}`, `${siteOrigin}/`).pathname.replace(/\/$/, '');
		const destination = new URL(match[2], `${siteOrigin}/`).pathname.replace(/\/$/, '');
		aliases.set(source, destination);
	}
	return aliases;
}

function classificationRow(post) {
	const secondaryTopic =
		post.metadata.tags.find((tag) => normalizeTag(tag) !== normalizeTag(post.metadata.category)) ??
		'';
	const markdownH1 = post.headings.find((heading) => heading.level === 1)?.text ?? '';
	return {
		source_file: post.sourceFile,
		canonical_url: post.canonicalUrl,
		title: post.metadata.title,
		primary_content_mode: post.mode.mode,
		intended_audience: MODE_DEFAULTS[post.mode.mode].audience,
		intended_user_outcome: MODE_DEFAULTS[post.mode.mode].outcome,
		primary_topic: post.metadata.category,
		secondary_topic: secondaryTopic,
		business_relevance_0_5: post.businessRelevance,
		search_relevance_0_5: post.searchRelevance,
		originality_or_first_hand_value_0_5: post.originality,
		evidence_requirement_0_5: post.evidenceRequirement,
		existing_evidence_quality_0_5: post.evidenceQuality,
		present_internal_link_support:
			post.internalLinks.length > 0
				? `YES — ${post.internalLinks.length} link(s)`
				: 'NO LINKS DETECTED',
		present_external_link_support:
			post.externalLinks.length > 0
				? `YES — ${post.externalLinks.length} link(s)`
				: 'NO LINKS DETECTED',
		impressions: '',
		clicks: '',
		average_position: '',
		click_through_rate: '',
		indexed_status: INDEX_STATUS,
		recommended_treatment: post.treatment,
		classification_confidence: post.mode.confidence,
		mode_signals: post.mode.signals,
		field_provenance: `${HEURISTIC_STATUS}; mode/audience/outcome/topics/scores/treatment inferred from frontmatter and local body text`,
		search_metrics_status: SEARCH_METRICS_STATUS,
		query_language: '',
		query_language_status: SEARCH_METRICS_STATUS,
		seo_title: asString(post.metadata.seoTitle),
		markdown_h1: markdownH1,
		rendered_h1_status:
			'UNVERIFIED — NO RENDER PERFORMED; blank markdown_h1 does not imply a missing rendered H1',
		opening_paragraph: post.openingParagraph,
		headings: post.headings.map((heading) => heading.text).join(' | '),
		internal_anchor_text: unique(
			post.internalLinks.map((link) => normalizeWhitespace(link.anchor))
		).join(' | '),
		search_snippet: '',
		search_snippet_status: SEARCH_METRICS_STATUS,
		title_body_token_overlap_0_1: post.titleBodyOverlap.toFixed(3),
		title_delivery_correspondence_status: 'UNVERIFIED — REQUIRES HUMAN EDITORIAL READING'
	};
}

function inventoryRow(post) {
	return {
		source_file: post.sourceFile,
		source_status: post.sourceStatus,
		source_route: post.sourceRoute,
		canonical_url: post.canonicalUrl,
		redirect_destination: post.redirectDestination,
		title: post.metadata.title,
		seo_title: asString(post.metadata.seoTitle),
		description: post.metadata.description,
		publication_date: post.metadata.date,
		substantive_modification_date: post.metadata.dateModified,
		category: post.metadata.category,
		tags: post.metadata.tags.join(' | '),
		series: post.metadata.series.join(' | '),
		author: asString(post.metadata.author),
		published: post.metadata.published === false ? 'false' : 'true',
		body_sha256_normalized: post.bodyHash,
		approximate_visible_word_count: post.wordCount,
		paragraph_candidate_count: post.repeatedPassages.length,
		markdown_h1: post.headings.find((heading) => heading.level === 1)?.text ?? '',
		headings: post.headings.map((heading) => `H${heading.level}: ${heading.text}`).join(' | '),
		opening_paragraph: post.openingParagraph,
		internal_link_count: post.internalLinks.length,
		external_link_count: post.externalLinks.length,
		source_or_reference_link_count: post.referenceLinks.length,
		external_domains: post.domains.join(' | '),
		internal_link_targets_sanitized: unique(
			post.internalLinks.map((link) => sanitizedLinkTarget(link.destination, post.siteOrigin))
		).join(' | '),
		external_link_targets_sanitized: unique(
			post.externalLinks.map((link) => sanitizedLinkTarget(link.destination, post.siteOrigin))
		).join(' | '),
		source_or_reference_urls_sanitized: unique(
			post.referenceLinks.map((link) => sanitizedLinkTarget(link.destination, post.siteOrigin))
		).join(' | '),
		image_count: post.imageAlts.length,
		empty_image_alt_count: post.imageAlts.filter((alt) => !alt).length,
		code_fence_count: post.codeFenceCount,
		notebook: asString(post.metadata.notebook),
		title_body_token_overlap_0_1_heuristic: post.titleBodyOverlap.toFixed(3),
		impressions: '',
		clicks: '',
		average_position: '',
		click_through_rate: '',
		indexed_status: INDEX_STATUS,
		search_metrics_status: SEARCH_METRICS_STATUS,
		assessment_provenance:
			'Repository source and frontmatter are observed; word/link counts are deterministic local extraction; overlap is heuristic'
	};
}

function publicInventoryRows(posts) {
	const unpublishedPosts = posts.filter(
		(post) => post.sourceStatus === 'UNPUBLISHED_NOT_CANONICAL'
	);
	const rows = posts
		.filter((post) => post.sourceStatus !== 'UNPUBLISHED_NOT_CANONICAL')
		.map(inventoryRow);
	if (unpublishedPosts.length === 0) return rows;
	return [
		...rows,
		{
			source_file: REDACTED_UNPUBLISHED_SOURCE,
			source_status: 'UNPUBLISHED_NOT_CANONICAL',
			published: 'false',
			indexed_status:
				'NOT APPLICABLE — UNPUBLISHED SOURCES ARE OUTSIDE THE CANONICAL PUBLIC CORPUS',
			search_metrics_status:
				'NOT APPLICABLE — UNPUBLISHED SOURCES ARE OUTSIDE THE CANONICAL PUBLIC CORPUS',
			assessment_provenance: `Aggregate status row for ${unpublishedPosts.length} unpublished source(s); identifying metadata and content are redacted from the public audit output`
		}
	];
}

function evidenceRow(post) {
	const experienceCount = countPattern(post.body, EXPERIENCE_PATTERN);
	const firstHandSignal = post.firstPersonCount >= 8 || experienceCount > 0;
	const evidenceGap = Math.max(0, post.evidenceRequirement - post.evidenceQuality);
	const sourceDateValues = sourceYears(post);
	return {
		source_file: post.sourceFile,
		canonical_url: post.canonicalUrl,
		title: post.metadata.title,
		primary_content_mode: post.mode.mode,
		audit_scope:
			post.evidenceRequirement >= 3
				? 'FACTUAL_OR_EVIDENCE_SENSITIVE_REVIEW'
				: 'LOW_REQUIREMENT_CONTEXT — score is not a defect finding',
		evidence_requirement_0_5: post.evidenceRequirement,
		existing_evidence_quality_0_5: post.evidenceQuality,
		factual_risk_cues:
			post.riskCues.length > 0 ? post.riskCues.join(' | ') : 'NONE DETECTED BY HEURISTIC',
		claim_candidate_count_heuristic: post.claims.count,
		claim_candidate_samples_heuristic: post.claims.samples.join(' | '),
		external_link_count: post.externalLinks.length,
		source_or_reference_link_count: post.referenceLinks.length,
		primary_or_institutional_source_count_heuristic: post.institutionalSourceCount,
		source_domains: post.domains.join(' | '),
		external_source_urls_sanitized: unique(
			post.externalLinks.map((link) => sanitizedLinkTarget(link.destination, post.siteOrigin))
		).join(' | '),
		reference_section_urls_sanitized: unique(
			post.referenceLinks.map((link) => sanitizedLinkTarget(link.destination, post.siteOrigin))
		).join(' | '),
		source_dates_detected_in_reference_section: sourceDateValues.join(' | '),
		local_citation_syntax_issue_count: post.malformedLinks.length,
		broken_citation_status: OFFLINE_LINK_STATUS,
		source_to_claim_correspondence_status:
			'UNVERIFIED — URL presence does not prove that a nearby source supports a claim',
		author_experience_signal:
			experienceCount > 0
				? `HEURISTIC YES — ${experienceCount} phrase match(es)`
				: 'NO EXPLICIT PHRASE DETECTED',
		first_hand_example_signal: firstHandSignal
			? `HEURISTIC YES — ${post.firstPersonCount} first-person token(s)`
			: 'NO STRONG SIGNAL DETECTED',
		methodology_signal: METHODOLOGY_PATTERN.test(post.body) ? 'HEURISTIC YES' : 'NOT DETECTED',
		reproducible_calculation_signal: CALCULATION_PATTERN.test(post.body)
			? 'HEURISTIC POSSIBLE — REQUIRES HUMAN VERIFICATION'
			: 'NOT DETECTED',
		code_signal:
			post.codeFenceCount > 0
				? `YES — approximately ${post.codeFenceCount} fenced block(s)`
				: 'NOT DETECTED',
		data_signal: DATA_PATTERN.test(post.body)
			? 'HEURISTIC YES — REQUIRES HUMAN VERIFICATION'
			: 'NOT DETECTED',
		review_date: '',
		review_date_status: 'UNVERIFIED — no dedicated reviewDate frontmatter field exists',
		substantive_modification_date: post.metadata.dateModified,
		fact_inference_opinion_distinction_signal: DISTINCTION_PATTERN.test(post.body)
			? 'EXPLICIT DISTINCTION LANGUAGE DETECTED'
			: 'NOT DETECTED; absence is not proof of ambiguity',
		evidence_gap_0_5_heuristic: evidenceGap,
		recommended_editorial_review:
			evidenceGap >= 2 && post.evidenceRequirement >= 3
				? post.treatment
				: 'No evidence remediation prioritized from local signals alone',
		assessment_status: `${HEURISTIC_STATUS}; link liveness and semantic support were not tested`
	};
}

export function buildTfidfVectors(texts) {
	const termCounts = texts.map((text) => {
		const counts = new Map();
		for (const token of tokenize(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
		return counts;
	});
	const documentFrequency = new Map();
	for (const counts of termCounts) {
		for (const term of counts.keys())
			documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
	}
	return termCounts.map((counts) => {
		const weights = new Map();
		let squaredNorm = 0;
		for (const [term, count] of counts) {
			const tf = 1 + Math.log(count);
			const idf = Math.log((texts.length + 1) / ((documentFrequency.get(term) ?? 0) + 1)) + 1;
			const weight = tf * idf;
			weights.set(term, weight);
			squaredNorm += weight * weight;
		}
		const norm = Math.sqrt(squaredNorm) || 1;
		for (const [term, weight] of weights) weights.set(term, weight / norm);
		return weights;
	});
}

export function cosineSimilarity(left, right) {
	const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
	let dot = 0;
	for (const [term, weight] of smaller) dot += weight * (larger.get(term) ?? 0);
	return dot;
}

function pairKey(left, right) {
	return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function tagOverlap(left, right) {
	const leftTags = new Set(left.metadata.tags.map(normalizeTag).filter(Boolean));
	const rightTags = new Set(right.metadata.tags.map(normalizeTag).filter(Boolean));
	const shared = [...leftTags].filter((tag) => rightTags.has(tag)).sort();
	const union = new Set([...leftTags, ...rightTags]);
	return { shared, jaccard: union.size > 0 ? shared.length / union.size : 0 };
}

function duplicateRelation(type, left, right, details = {}) {
	return {
		issue_type: type,
		source_file_a: left?.sourceFile ?? '',
		url_a: left?.canonicalUrl ?? '',
		title_a: left?.metadata?.title ?? '',
		source_file_b: right?.sourceFile ?? '',
		url_b: right?.canonicalUrl ?? '',
		title_b: right?.metadata?.title ?? '',
		body_cosine_similarity: details.bodyCosine === undefined ? '' : details.bodyCosine.toFixed(4),
		title_cosine_similarity:
			details.titleCosine === undefined ? '' : details.titleCosine.toFixed(4),
		shared_tags: details.sharedTags?.join(' | ') ?? '',
		document_count: details.documentCount ?? 2,
		repeated_passage_excerpt: details.excerpt ?? '',
		detection_rule: details.rule ?? '',
		assessment_status: HEURISTIC_STATUS,
		recommended_editorial_review:
			details.treatment ??
			'Compare side by side; do not merge, redirect, delete, noindex, or rewrite without editorial and search-performance evidence'
	};
}

function taxonomyRelations(posts) {
	const relations = [];
	const categories = new Map();
	for (const post of posts) {
		const slug = slugifyCategory(post.metadata.category);
		const group = categories.get(slug) ?? [];
		group.push(post);
		categories.set(slug, group);
	}
	for (const [categorySlug, group] of categories) {
		if (group.length > 2) continue;
		const [first, second] = group;
		relations.push(
			duplicateRelation('THIN_CATEGORY_CANDIDATE', first, second, {
				documentCount: group.length,
				rule: `canonical source count for /blog/${categorySlug} is ${group.length}; route content/indexability not inspected`,
				treatment:
					'Review taxonomy and rendered category value; a low article count alone does not justify noindexing, merging, or deletion'
			})
		);
	}

	const rawTagVariants = new Map();
	for (const post of posts) {
		for (const tag of post.metadata.tags) {
			const normalized = normalizeTag(tag).replace(/\b([a-z]{4,})s\b/g, '$1');
			if (!normalized) continue;
			const record = rawTagVariants.get(normalized) ?? { labels: new Set(), posts: new Set() };
			record.labels.add(tag);
			record.posts.add(post);
			rawTagVariants.set(normalized, record);
		}
	}
	for (const [normalized, record] of rawTagVariants) {
		const labels = [...record.labels].sort((a, b) => a.localeCompare(b));
		if (labels.length < 2) continue;
		const groupedPosts = [...record.posts].sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));
		relations.push(
			duplicateRelation('TAG_FRAGMENTATION_CANDIDATE', groupedPosts[0], groupedPosts[1], {
				documentCount: groupedPosts.length,
				excerpt: labels.join(' | '),
				rule: `case/punctuation/simple singular normalization converged on “${normalized}”`,
				treatment:
					'Review tag labels and navigation behavior manually; normalization can conflate legitimately different concepts'
			})
		);
	}
	return relations;
}

export function detectDuplication(posts, { nearDuplicateThreshold = 0.72 } = {}) {
	const relations = [];
	const exactGroups = new Map();
	for (const post of posts) {
		if (post.wordCount < 50) continue;
		const group = exactGroups.get(post.bodyHash) ?? [];
		group.push(post);
		exactGroups.set(post.bodyHash, group);
	}
	const exactPairs = new Set();
	for (const group of exactGroups.values()) {
		if (group.length < 2) continue;
		for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
			for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
				const left = group[leftIndex];
				const right = group[rightIndex];
				exactPairs.add(pairKey(posts.indexOf(left), posts.indexOf(right)));
				relations.push(
					duplicateRelation('EXACT_NORMALIZED_BODY', left, right, {
						bodyCosine: 1,
						rule: `identical SHA-256 after deterministic Markdown stripping and token normalization (${left.bodyHash})`
					})
				);
			}
		}
	}

	const bodyVectors = buildTfidfVectors(posts.map((post) => post.visibleText));
	const titleVectors = buildTfidfVectors(posts.map((post) => post.metadata.title));
	for (let leftIndex = 0; leftIndex < posts.length; leftIndex += 1) {
		for (let rightIndex = leftIndex + 1; rightIndex < posts.length; rightIndex += 1) {
			const left = posts[leftIndex];
			const right = posts[rightIndex];
			const bodyCosine = cosineSimilarity(bodyVectors[leftIndex], bodyVectors[rightIndex]);
			const titleCosine = cosineSimilarity(titleVectors[leftIndex], titleVectors[rightIndex]);
			const tags = tagOverlap(left, right);
			const exactPair = exactPairs.has(pairKey(leftIndex, rightIndex));

			if (!exactPair && bodyCosine >= nearDuplicateThreshold) {
				relations.push(
					duplicateRelation('NEAR_DUPLICATE_BODY', left, right, {
						bodyCosine,
						titleCosine,
						sharedTags: tags.shared,
						rule: `local TF-IDF cosine ≥ ${nearDuplicateThreshold.toFixed(2)} after Markdown stripping`
					})
				);
			}
			if (
				titleCosine >= 0.8 &&
				normalizeWhitespace(left.metadata.title).toLowerCase() !==
					normalizeWhitespace(right.metadata.title).toLowerCase()
			) {
				relations.push(
					duplicateRelation('TITLE_VARIANT_CANDIDATE', left, right, {
						bodyCosine,
						titleCosine,
						sharedTags: tags.shared,
						rule: 'local title TF-IDF cosine ≥ 0.80'
					})
				);
			}
			const searchOriented = left.searchRelevance >= 3 && right.searchRelevance >= 3;
			const sameTopic =
				slugifyCategory(left.metadata.category) === slugifyCategory(right.metadata.category) ||
				tags.shared.length >= 2;
			if (
				searchOriented &&
				sameTopic &&
				titleCosine >= 0.52 &&
				tags.jaccard >= 0.35 &&
				tags.shared.length >= 2
			) {
				relations.push(
					duplicateRelation('SAME_SEARCH_INTENT_OR_CANNIBALIZATION_CANDIDATE', left, right, {
						bodyCosine,
						titleCosine,
						sharedTags: tags.shared,
						rule: 'both pages have inferred search relevance ≥ 3, title cosine ≥ 0.52, tag Jaccard ≥ 0.35, and at least two shared tags',
						treatment:
							'Validate query/page performance in Search Console or Bing before deciding whether intent overlaps; source similarity alone does not prove cannibalization'
					})
				);
			}
		}
	}

	const passageGroups = new Map();
	for (const post of posts) {
		for (const passage of post.repeatedPassages) {
			const hash = crypto.createHash('sha256').update(passage.normalized).digest('hex');
			const group = passageGroups.get(hash) ?? { raw: passage.raw, posts: new Map() };
			group.posts.set(post.sourceFile, post);
			passageGroups.set(hash, group);
		}
	}
	for (const [hash, group] of passageGroups) {
		const groupedPosts = [...group.posts.values()].sort((a, b) =>
			a.sourceFile.localeCompare(b.sourceFile)
		);
		if (groupedPosts.length < 2) continue;
		const left = groupedPosts[0];
		const right = groupedPosts[1];
		relations.push(
			duplicateRelation('REPEATED_EXACT_PASSAGE', left, right, {
				documentCount: groupedPosts.length,
				excerpt: truncate(group.raw, 300),
				rule: `identical normalized paragraph of at least 180 characters/25 tokens (SHA-256 ${hash}); all files: ${groupedPosts.map((post) => post.sourceFile).join(' | ')}`,
				treatment:
					'Review the passage in context to distinguish necessary definitions/series framing from stock copy; preserve legitimate repetition'
			})
		);
	}

	relations.push(...taxonomyRelations(posts));
	return relations
		.sort(
			(left, right) =>
				left.issue_type.localeCompare(right.issue_type) ||
				left.source_file_a.localeCompare(right.source_file_a) ||
				left.source_file_b.localeCompare(right.source_file_b) ||
				left.detection_rule.localeCompare(right.detection_rule)
		)
		.map((relation, index) => ({
			candidate_id: `CORPUS-${String(index + 1).padStart(5, '0')}`,
			...relation
		}));
}

function remediationPriority(post) {
	const evidenceGap = Math.max(0, post.evidenceRequirement - post.evidenceQuality);
	const staleFactual =
		post.metadata.date < '2025-01-01' &&
		!post.metadata.dateModified &&
		post.evidenceRequirement >= 3;
	return (
		evidenceGap * 4 + post.businessRelevance * 2 + post.searchRelevance + (staleFactual ? 4 : 0)
	);
}

function flagshipCandidateGroups(posts) {
	const ranked = (items) =>
		items
			.map((post) => ({
				post,
				score:
					post.businessRelevance * 3 +
					post.originality * 2 +
					post.searchRelevance +
					Math.min(post.internalLinks.length, 3)
			}))
			.sort(
				(left, right) =>
					right.score - left.score || left.post.sourceFile.localeCompare(right.post.sourceFile)
			);
	const healthcare = ranked(
		posts.filter((post) =>
			HEALTHCARE_PATTERN.test(`${post.metadata.category} ${post.metadata.tags.join(' ')}`)
		)
	).slice(0, 10);
	const science = ranked(
		posts.filter((post) =>
			['interactive visualization', 'search-oriented scientific explainer'].includes(post.mode.mode)
		)
	).slice(0, 10);
	return { healthcare, science };
}

function markdownTable(headers, rows) {
	const clean = (value) => normalizeWhitespace(value).replace(/\|/g, '\\|');
	return [
		`| ${headers.join(' | ')} |`,
		`| ${headers.map(() => '---').join(' | ')} |`,
		...rows.map((row) => `| ${row.map(clean).join(' | ')} |`)
	].join('\n');
}

function remediationMarkdown({ posts, allPosts, duplication, auditDate, nearDuplicateThreshold }) {
	const modeCounts = new Map();
	for (const post of posts)
		modeCounts.set(post.mode.mode, (modeCounts.get(post.mode.mode) ?? 0) + 1);
	const highPriority = posts
		.filter((post) => remediationPriority(post) >= 15)
		.sort(
			(left, right) =>
				remediationPriority(right) - remediationPriority(left) ||
				left.sourceFile.localeCompare(right.sourceFile)
		)
		.slice(0, 40);
	const duplicateReview = duplication
		.filter((item) =>
			[
				'EXACT_NORMALIZED_BODY',
				'NEAR_DUPLICATE_BODY',
				'SAME_SEARCH_INTENT_OR_CANNIBALIZATION_CANDIDATE'
			].includes(item.issue_type)
		)
		.slice(0, 30);
	const { healthcare, science } = flagshipCandidateGroups(posts);
	const classificationRows = CONTENT_MODES.map((mode) => [mode, modeCounts.get(mode) ?? 0]);
	const queueRows = highPriority.map((post) => [
		remediationPriority(post),
		`[${post.metadata.title}](${post.canonicalUrl})`,
		post.mode.mode,
		`${post.evidenceRequirement}/${post.evidenceQuality}`,
		post.treatment
	]);
	const duplicateRows = duplicateReview.map((item) => [
		item.candidate_id,
		item.issue_type,
		item.title_a,
		item.title_b,
		item.body_cosine_similarity || '—',
		item.title_cosine_similarity || '—'
	]);
	const candidateRows = [
		...healthcare.map((entry) => ['Healthcare/professional', entry]),
		...science.map((entry) => ['Science/visualization', entry])
	].map(([group, entry]) => [
		group,
		`[${entry.post.metadata.title}](${entry.post.canonicalUrl})`,
		entry.post.mode.mode,
		entry.post.businessRelevance,
		entry.post.originality,
		'Source-only candidate; requires authenticated demand/audience evidence before flagship selection'
	]);

	return `# Content remediation queue

Generated: ${auditDate} (Asia/Calcutta)

Generator: \`scripts/audit-content-corpus.mjs\`

> This is a deterministic repository-only triage, not an editorial verdict. Every mode, score, intent overlap, evidence gap, candidate, and treatment is a **heuristic inference requiring human review**. The script made no network requests, used no external embeddings, and made no article edits.

## Scope and verification boundary

- Markdown source files read: **${allPosts.length}**.
- Canonical published articles classified: **${posts.length}**.
- Non-canonical source records retained in \`CONTENT_INVENTORY.csv\` but excluded from classification/similarity: **${allPosts.length - posts.length}**.
- Search impressions, clicks, average position, CTR, query language, snippets, and index status: **${SEARCH_METRICS_STATUS}**. Numeric fields remain blank.
- Citation liveness and source-to-claim correspondence are **unverified by this repository-only pass**. The separate bounded HTTP observations, when completed, are recorded in \`CITATION_LIVENESS.csv\` and \`CITATION_REVIEW.md\`; even a live URL does not prove semantic support. Rendered title-to-delivery correspondence also remains a human editorial check.
- This repository-only pass selects no **final** flagship. A separately joined \`FLAGSHIP_PAGES.csv\`, if produced later in the audit, remains a provisional owner-review cohort while authenticated engine demand is unavailable. No merge, deletion, redirect, noindex, or rewrite is authorized by these reports.

## Content-mode distribution

${markdownTable(['Inferred primary mode', 'Canonical articles'], classificationRows)}

## Repository-only remediation queue

Priority is a transparent heuristic: evidence-gap × 4 + business relevance × 2 + search relevance, with a small factual-freshness review increment. It is not search demand. The full per-page evidence is in \`EVIDENCE_AUDIT.csv\`.

${queueRows.length > 0 ? markdownTable(['Priority', 'Article', 'Mode', 'Evidence required/current', 'Review only'], queueRows) : '_No article crossed the deterministic priority threshold._'}

## Duplication and cannibalization review

Body similarity uses local TF-IDF/cosine with a near-duplicate threshold of **${nearDuplicateThreshold.toFixed(2)}**. Exact repeated passages use normalized paragraph SHA-256. “Cannibalization candidate” means only that two source records have overlapping local language and tags; it does **not** establish competing rankings.

${duplicateRows.length > 0 ? markdownTable(['ID', 'Candidate type', 'Article A', 'Article B', 'Body cosine', 'Title cosine'], duplicateRows) : '_No exact, near-duplicate, or same-intent candidate crossed the configured rules._'}

See \`DUPLICATION_AND_CANNIBALIZATION.csv\` for side-by-side signals, repeated passages, thin-category candidates, and tag-fragmentation candidates. Thin-category detection counts source articles only; it does not inspect or condemn rendered category pages.

## Repository-only candidate pool; final selection deferred

The brief makes Search Console and Bing performance the principal demand evidence. That authenticated evidence was unavailable to this local script, so it does not approve a flagship selection. A later audit join may use these candidates to produce a clearly labelled provisional cohort, but those rows are not proven winners and still require owner editorial review.

The following are defensible **repository-only candidate-pool entries**, based on observable professional/healthcare relevance or unusually original scientific/interactive form. They must be joined to impressions, positions, CTR, external-reference, conversion, and audience evidence before final selection. Essays are not nominated merely from intuition because demonstrated audience potential is unavailable.

${candidateRows.length > 0 ? markdownTable(['Candidate pool', 'Article', 'Inferred mode', 'Business 0–5', 'Originality 0–5', 'Boundary'], candidateRows) : '_No source-only candidate met the deterministic pool rules._'}

## Required editorial and owner follow-up

1. Join authenticated Google Search Console and Bing page/query exports by canonical URL; preserve blanks where the engines provide no row.
2. Review high-risk claims beside their cited primary or institutional source. A decorative reference list is not remediation.
3. Check source dates, live status, and source-to-claim correspondence manually before changing factual pages.
4. Review similarity candidates side by side with engine query data. Preserve legitimate series framing, definitions, literary voice, satire, fiction, and personal writing.
5. Select at most thirty flagships only after demand, audience, conversion, originality, and external-reference evidence is recorded.

## Reproducible method

- Frontmatter: the repository’s existing strict YAML parser.
- Corpus: every \`src/lib/posts/*.md\` file, sorted by filename; canonical status reconciled with local \`postPathAliases\` and \`published\`.
- Exact duplicate: SHA-256 of Markdown-stripped normalized body tokens.
- Near duplicate: local TF-IDF vectors and cosine similarity (no network, API, model, or external embedding).
- Repeated passage: exact SHA-256 of normalized paragraphs with at least 180 characters and 25 tokens.
- Same-intent/cannibalization candidate: deterministic title/tag/body signals, explicitly not ranking evidence.
- Evidence quality: local link/reference/institutional-domain/method/code signals on a 0–5 heuristic scale.
- Factual-risk and treatments: deterministic phrase/category rules; all are flagged as inference.

Regenerate from the repository root:

\`\`\`powershell
node scripts/audit-content-corpus.mjs
node --test scripts/audit-content-corpus.test.mjs
\`\`\`
`;
}

const INVENTORY_HEADERS = [
	'source_file',
	'source_status',
	'source_route',
	'canonical_url',
	'redirect_destination',
	'title',
	'seo_title',
	'description',
	'publication_date',
	'substantive_modification_date',
	'category',
	'tags',
	'series',
	'author',
	'published',
	'body_sha256_normalized',
	'approximate_visible_word_count',
	'paragraph_candidate_count',
	'markdown_h1',
	'headings',
	'opening_paragraph',
	'internal_link_count',
	'external_link_count',
	'source_or_reference_link_count',
	'external_domains',
	'internal_link_targets_sanitized',
	'external_link_targets_sanitized',
	'source_or_reference_urls_sanitized',
	'image_count',
	'empty_image_alt_count',
	'code_fence_count',
	'notebook',
	'title_body_token_overlap_0_1_heuristic',
	'impressions',
	'clicks',
	'average_position',
	'click_through_rate',
	'indexed_status',
	'search_metrics_status',
	'assessment_provenance'
];

const CLASSIFICATION_HEADERS = [
	'source_file',
	'canonical_url',
	'title',
	'primary_content_mode',
	'intended_audience',
	'intended_user_outcome',
	'primary_topic',
	'secondary_topic',
	'business_relevance_0_5',
	'search_relevance_0_5',
	'originality_or_first_hand_value_0_5',
	'evidence_requirement_0_5',
	'existing_evidence_quality_0_5',
	'present_internal_link_support',
	'present_external_link_support',
	'impressions',
	'clicks',
	'average_position',
	'click_through_rate',
	'indexed_status',
	'recommended_treatment',
	'classification_confidence',
	'mode_signals',
	'field_provenance',
	'search_metrics_status',
	'query_language',
	'query_language_status',
	'seo_title',
	'markdown_h1',
	'rendered_h1_status',
	'opening_paragraph',
	'headings',
	'internal_anchor_text',
	'search_snippet',
	'search_snippet_status',
	'title_body_token_overlap_0_1',
	'title_delivery_correspondence_status'
];

const DUPLICATION_HEADERS = [
	'candidate_id',
	'issue_type',
	'source_file_a',
	'url_a',
	'title_a',
	'source_file_b',
	'url_b',
	'title_b',
	'body_cosine_similarity',
	'title_cosine_similarity',
	'shared_tags',
	'document_count',
	'repeated_passage_excerpt',
	'detection_rule',
	'assessment_status',
	'recommended_editorial_review'
];

const EVIDENCE_HEADERS = [
	'source_file',
	'canonical_url',
	'title',
	'primary_content_mode',
	'audit_scope',
	'evidence_requirement_0_5',
	'existing_evidence_quality_0_5',
	'factual_risk_cues',
	'claim_candidate_count_heuristic',
	'claim_candidate_samples_heuristic',
	'external_link_count',
	'source_or_reference_link_count',
	'primary_or_institutional_source_count_heuristic',
	'source_domains',
	'external_source_urls_sanitized',
	'reference_section_urls_sanitized',
	'source_dates_detected_in_reference_section',
	'local_citation_syntax_issue_count',
	'broken_citation_status',
	'source_to_claim_correspondence_status',
	'author_experience_signal',
	'first_hand_example_signal',
	'methodology_signal',
	'reproducible_calculation_signal',
	'code_signal',
	'data_signal',
	'review_date',
	'review_date_status',
	'substantive_modification_date',
	'fact_inference_opinion_distinction_signal',
	'evidence_gap_0_5_heuristic',
	'recommended_editorial_review',
	'assessment_status'
];

export function auditCorpus(options = {}) {
	const root = path.resolve(options.root ?? REPOSITORY_ROOT);
	const postsDir = path.resolve(options.postsDir ?? path.join(root, 'src', 'lib', 'posts'));
	const outputDir = path.resolve(
		options.outputDir ??
			path.join(root, 'docs', 'audits', `traffic-${options.auditDate ?? DEFAULT_AUDIT_DATE}`)
	);
	const aliasesFile =
		options.aliasesFile === null
			? null
			: path.resolve(options.aliasesFile ?? path.join(root, 'src', 'lib', 'content', 'posts.ts'));
	const siteOrigin = (options.siteOrigin ?? DEFAULT_SITE_ORIGIN).replace(/\/$/, '');
	const auditDate = options.auditDate ?? DEFAULT_AUDIT_DATE;
	const nearDuplicateThreshold = Number(options.nearDuplicateThreshold ?? 0.72);
	if (!fs.existsSync(postsDir)) throw new Error(`Posts directory does not exist: ${postsDir}`);
	if (!(nearDuplicateThreshold > 0 && nearDuplicateThreshold <= 1)) {
		throw new Error('nearDuplicateThreshold must be greater than 0 and at most 1.');
	}

	const aliasBySource = readAliases(aliasesFile, siteOrigin);
	const files = fs
		.readdirSync(postsDir)
		.filter((file) => file.endsWith('.md'))
		.sort((a, b) => a.localeCompare(b));
	const allPosts = files.map((file) => {
		const source = fs.readFileSync(path.join(postsDir, file), 'utf8');
		const metadata = parsePostFrontmatter(source, path.posix.join('src/lib/posts', file));
		return preparePost({
			file,
			postsDir,
			metadata,
			body: extractBody(source),
			source,
			siteOrigin,
			aliasBySource
		});
	});
	const posts = allPosts.filter((post) => post.sourceStatus === 'CANONICAL_PUBLISHED_ARTICLE');
	const duplication = detectDuplication(posts, { nearDuplicateThreshold });

	fs.mkdirSync(outputDir, { recursive: true });
	const outputs = new Map([
		['CONTENT_INVENTORY.csv', rowsToCsv(INVENTORY_HEADERS, publicInventoryRows(allPosts))],
		['CONTENT_CLASSIFICATION.csv', rowsToCsv(CLASSIFICATION_HEADERS, posts.map(classificationRow))],
		['DUPLICATION_AND_CANNIBALIZATION.csv', rowsToCsv(DUPLICATION_HEADERS, duplication)],
		['EVIDENCE_AUDIT.csv', rowsToCsv(EVIDENCE_HEADERS, posts.map(evidenceRow))],
		[
			'CONTENT_REMEDIATION_QUEUE.md',
			remediationMarkdown({ posts, allPosts, duplication, auditDate, nearDuplicateThreshold })
		]
	]);
	for (const [filename, contents] of outputs)
		fs.writeFileSync(path.join(outputDir, filename), contents, 'utf8');

	return {
		postsRead: allPosts.length,
		canonicalPosts: posts.length,
		nonCanonicalSources: allPosts.length - posts.length,
		duplicationCandidates: duplication.length,
		outputDir,
		outputFiles: [...outputs.keys()]
	};
}

function parseCliArguments(arguments_) {
	const options = {};
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (argument === '--quiet') options.quiet = true;
		else if (argument === '--posts-dir') options.postsDir = arguments_[++index];
		else if (argument === '--output-dir') options.outputDir = arguments_[++index];
		else if (argument === '--aliases-file') options.aliasesFile = arguments_[++index];
		else if (argument === '--site-origin') options.siteOrigin = arguments_[++index];
		else if (argument === '--audit-date') options.auditDate = arguments_[++index];
		else if (argument === '--near-duplicate-threshold')
			options.nearDuplicateThreshold = Number(arguments_[++index]);
		else throw new Error(`Unknown argument: ${argument}`);
	}
	return options;
}

const isMain =
	process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
	try {
		const options = parseCliArguments(process.argv.slice(2));
		const result = auditCorpus(options);
		if (!options.quiet) {
			console.log(
				`Corpus audit complete: read ${result.postsRead} Markdown files; classified ${result.canonicalPosts} canonical articles; wrote ${result.outputFiles.length} files to ${result.outputDir}.`
			);
			console.log(
				`Search metrics and index status remain ${SEARCH_METRICS_STATUS}; no network requests or external embeddings were used.`
			);
		}
	} catch (error) {
		console.error(error instanceof Error ? (error.stack ?? error.message) : error);
		process.exitCode = 1;
	}
}
