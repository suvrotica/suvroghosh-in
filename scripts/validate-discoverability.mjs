/**
 * validate:discoverability
 *
 * Build-time checks for conventional- and generative-search discoverability.
 *
 * Layer 1 checks every published post's frontmatter.
 * Layer 2 builds the site (if needed), serves the production build locally, and
 * inspects the actual server-rendered HTML of representative routes: JSON-LD
 * validity, single H1, canonical URLs (including pagination), stable
 * Person/WebSite entity IDs, article and project creator linkage, publication
 * proof, breadcrumb presence, and visible-FAQ/schema agreement.
 *
 * Exits non-zero and names the affected route/post on any genuine defect.
 *
 * Usage: node scripts/validate-discoverability.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readPostFrontmatter } from './lib/post-metadata.mjs';

const root = process.cwd();
const postsDir = path.join(root, 'src', 'lib', 'posts');
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const SITE = 'https://www.suvroghosh.in';
const PERSON_ID = `${SITE}/#person`;
const WEBSITE_ID = `${SITE}/#website`;
const PREVIEW_PORT = 40000 + (process.pid % 20000);
const TOPIC_RENDER_ROUTES = [
	'/topics',
	'/topics/calcutta',
	'/topics/hl7-fhir',
	'/topics/bipolar-depression'
];
const TOPIC_DETAIL_ROUTES = new Set(TOPIC_RENDER_ROUTES.filter((route) => route !== '/topics'));
const EXPLICITLY_ALLOWED_CRAWLERS = [
	'OAI-SearchBot',
	'GPTBot',
	'ChatGPT-User',
	'Claude-SearchBot',
	'ClaudeBot',
	'Claude-User',
	'PerplexityBot',
	'Perplexity-User',
	'Kimi-SearchBot',
	'KimiBot',
	'Kimi-User',
	'CCBot',
	'Baiduspider',
	'Sogou web spider',
	'Sogou inst spider',
	'yisouspider'
];

const errors = [];
const fail = (msg) => errors.push(msg);

function slugifyCategory(category = 'uncategorized') {
	return String(category)
		.toLowerCase()
		.trim()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function postPath(metadata, slug) {
	return `/blog/${slugifyCategory(metadata.category)}/${encodeURIComponent(slug)}`;
}

/* -------------------------------------------------------------------------- */
/* 1. Frontmatter checks                                                        */
/* -------------------------------------------------------------------------- */

const postFiles = fs.readdirSync(postsDir).filter((f) => f.endsWith('.md'));
const published = [];
const descriptions = new Map();

for (const file of postFiles) {
	const slug = file.replace(/\.md$/, '');
	let metadata;
	try {
		metadata = readPostFrontmatter(path.join(postsDir, file));
	} catch (error) {
		fail(error instanceof Error ? error.message : `${file}: invalid frontmatter.`);
		continue;
	}
	if (metadata.published === false) continue;

	for (const field of ['title', 'description', 'date', 'category']) {
		if (typeof metadata[field] !== 'string' || metadata[field].trim() === '') {
			fail(`${file}: missing required field "${field}".`);
		}
	}
	if (!Array.isArray(metadata.tags) || metadata.tags.length === 0) {
		fail(`${file}: published post must declare at least one tag.`);
	}

	const publishedTime = Date.parse(metadata.date);
	if (Number.isNaN(publishedTime)) fail(`${file}: invalid date "${metadata.date}".`);
	if (metadata.dateModified != null) {
		const modifiedTime = Date.parse(metadata.dateModified);
		if (Number.isNaN(modifiedTime)) {
			fail(`${file}: invalid dateModified "${metadata.dateModified}".`);
		} else if (!Number.isNaN(publishedTime) && modifiedTime < publishedTime) {
			fail(
				`${file}: dateModified (${metadata.dateModified}) precedes date (${metadata.date}); a modified date cannot be earlier than publication.`
			);
		}
	}

	if (typeof metadata.description === 'string') {
		const length = metadata.description.trim().length;
		if (length < 40)
			fail(`${file}: description is very short (${length} chars); keep it substantive.`);
		if (length > 320)
			fail(`${file}: description is extremely long (${length} chars); tighten toward ~160-300.`);
		const key = metadata.description.trim().toLowerCase();
		if (!descriptions.has(key)) descriptions.set(key, []);
		descriptions.get(key).push(file);
	}

	if (metadata.thumbnail != null && !/^(\/|https?:\/\/)/.test(String(metadata.thumbnail))) {
		fail(`${file}: thumbnail must be a root-relative or absolute URL: ${metadata.thumbnail}`);
	}

	if (metadata.faq != null) {
		if (!Array.isArray(metadata.faq) || metadata.faq.length === 0) {
			fail(`${file}: faq must be a non-empty array when present.`);
		} else {
			metadata.faq.forEach((item, index) => {
				if (
					!item ||
					typeof item.question !== 'string' ||
					!item.question.trim() ||
					typeof item.answer !== 'string' ||
					!item.answer.trim()
				) {
					fail(`${file}: faq[${index}] needs non-empty question and answer.`);
				}
			});
		}
	}

	published.push({ file, slug, metadata, path: postPath(metadata, slug) });
}

for (const [desc, files] of descriptions) {
	if (files.length > 1) {
		fail(
			`description is shared by multiple posts (${files.join(', ')}): "${desc.slice(0, 60)}..."`
		);
	}
}

const seenPaths = new Map();
for (const post of published) {
	const key = post.path.toLowerCase();
	if (seenPaths.has(key)) {
		fail(`canonical collision: ${seenPaths.get(key)} and ${post.file} both map to ${post.path}`);
	}
	seenPaths.set(key, post.file);
}

const postRoutingSource = fs.readFileSync(
	path.join(root, 'src', 'lib', 'content', 'posts.ts'),
	'utf8'
);
const aliasBlock = postRoutingSource.match(
	/export const postPathAliases[\s\S]*?=\s*\{([\s\S]*?)\};/
);
if (!aliasBlock) {
	fail('src/lib/content/posts.ts: could not inspect postPathAliases for canonical render samples.');
}
const redirectAliasRoutes = new Set(
	aliasBlock
		? Array.from(aliasBlock[1].matchAll(/["']([^"']+)["']\s*:/g), ([, source]) => `/blog/${source}`)
		: []
);
const indexablePublished = published.filter((post) => !redirectAliasRoutes.has(post.path));

/* -------------------------------------------------------------------------- */
/* 2. robots.txt + sitemap source checks                                       */
/* -------------------------------------------------------------------------- */

const robotsPath = path.join(root, 'static', 'robots.txt');
if (fs.existsSync(robotsPath)) {
	const robots = fs.readFileSync(robotsPath, 'utf8');
	if (!/^Sitemap:\s*https:\/\/www\.suvroghosh\.in\/sitemap\.xml\s*$/im.test(robots)) {
		fail('static/robots.txt is missing an absolute Sitemap: declaration.');
	}

	const groups = robots
		.split(/\r?\n\s*\r?\n/)
		.map((group) =>
			group
				.split(/\r?\n/)
				.map((line) => line.replace(/\s+#.*$/, '').trim())
				.filter((line) => line && !line.startsWith('#'))
		)
		.filter((group) => group.length > 0);

	for (const crawler of EXPLICITLY_ALLOWED_CRAWLERS) {
		const crawlerGroups = groups.filter((lines) =>
			lines.some((line) => line.toLowerCase() === `user-agent: ${crawler}`.toLowerCase())
		);
		if (
			crawlerGroups.length === 0 ||
			!crawlerGroups.some((lines) => lines.some((line) => /^Allow:\s*\/$/i.test(line)))
		) {
			fail(`static/robots.txt should explicitly allow ${crawler} at the site root.`);
		}
		if (crawlerGroups.some((lines) => lines.some((line) => /^Disallow:\s*\S+/i.test(line)))) {
			fail(`static/robots.txt contains a conflicting Disallow rule for ${crawler}.`);
		}
	}
} else {
	fail('static/robots.txt not found.');
}

const llmsPath = path.join(root, 'static', 'llms.txt');
if (fs.existsSync(llmsPath)) {
	const llms = fs.readFileSync(llmsPath, 'utf8');
	const requiredGuideUrls = [
		`${SITE}/resume`,
		`${SITE}/projects`,
		`${SITE}/start-here`,
		`${SITE}/blog`,
		`${SITE}/sitemap.xml`,
		`${SITE}/rss.xml`
	];
	if (!/^# Suvro Ghosh\s*$/m.test(llms)) {
		fail('static/llms.txt should begin with a clear site/author heading.');
	}
	for (const url of requiredGuideUrls) {
		if (!llms.includes(url)) fail(`static/llms.txt is missing the canonical guide URL ${url}.`);
	}
} else {
	fail('static/llms.txt not found.');
}

const sitemapSource = fs.readFileSync(
	path.join(root, 'src', 'routes', 'sitemap.xml', '+server.ts'),
	'utf8'
);
if (!/getPublishedPosts|isIndexablePost|published === false/.test(sitemapSource)) {
	fail('sitemap.xml generator should exclude unpublished posts.');
}
if (!/post\.dateModified\s*\?\?\s*post\.date/.test(sitemapSource)) {
	fail('sitemap.xml post lastmod should prefer dateModified over the publication date.');
}

/* -------------------------------------------------------------------------- */
/* 3. Rendered-output checks                                                   */
/* -------------------------------------------------------------------------- */

function run(cmd, args) {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(cmd, args, { cwd: root, stdio: 'ignore' });
		child.on('exit', (code) =>
			code === 0
				? resolvePromise()
				: rejectPromise(new Error(`${cmd} ${args.join(' ')} exited ${code}`))
		);
		child.on('error', rejectPromise);
	});
}

function newestMtimeMs(target) {
	if (!fs.existsSync(target)) return 0;
	const stat = fs.statSync(target);
	if (!stat.isDirectory()) return stat.mtimeMs;
	let newest = stat.mtimeMs;
	for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
		newest = Math.max(newest, newestMtimeMs(path.join(target, entry.name)));
	}
	return newest;
}

async function waitForServer(url, timeoutMs = 60000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url);
			if (res.ok) return;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`Timed out waiting for ${url}`);
}

function extractJsonLd(html, route) {
	const blocks = [];
	const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
	let match;
	while ((match = re.exec(html))) {
		try {
			blocks.push(JSON.parse(match[1]));
		} catch {
			fail(`${route}: JSON-LD block is not parseable JSON.`);
		}
	}
	return blocks;
}

function flattenGraph(docs) {
	const nodes = [];
	for (const doc of docs) {
		if (doc && Array.isArray(doc['@graph'])) nodes.push(...doc['@graph']);
		else if (doc) nodes.push(doc);
	}
	return nodes;
}

const byType = (nodes, type) => nodes.filter((n) => n && n['@type'] === type);

function htmlAttribute(tag, name) {
	const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
	return match?.[2];
}

function metaPropertyValues(html, property) {
	const values = [];
	for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
		if (htmlAttribute(match[0], 'property') !== property) continue;
		const content = htmlAttribute(match[0], 'content');
		if (content != null) values.push(content);
	}
	return values;
}

function visibleUpdatedDates(html) {
	const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
	return Array.from(
		withoutComments.matchAll(/Updated\s*<time\b[^>]*\bdatetime\s*=\s*(["'])(.*?)\1/gi),
		(match) => match[2]
	);
}

function topicHeaderUpdatedDates(html) {
	const articleStart = html.indexOf('<article');
	if (articleStart < 0) return [];
	const headerStart = html.indexOf('<header', articleStart);
	if (headerStart < 0) return [];
	const headerEnd = html.indexOf('</header>', headerStart);
	if (headerEnd < 0) return [];
	return visibleUpdatedDates(html.slice(headerStart, headerEnd + '</header>'.length));
}

function decodeHtmlEntities(value) {
	const named = {
		amp: '&',
		apos: "'",
		gt: '>',
		lt: '<',
		nbsp: ' ',
		quot: '"'
	};

	return value.replace(/&(#(?:x[\da-f]+|\d+)|amp|apos|gt|lt|nbsp|quot);/gi, (entity, token) => {
		if (token.startsWith('#x') || token.startsWith('#X')) {
			return String.fromCodePoint(Number.parseInt(token.slice(2), 16));
		}
		if (token.startsWith('#')) {
			return String.fromCodePoint(Number.parseInt(token.slice(1), 10));
		}
		return named[token.toLowerCase()] ?? entity;
	});
}

function normalizedText(value) {
	return decodeHtmlEntities(String(value))
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function visibleTopicFaqs(html) {
	const sectionStart = html.search(/<section\b[^>]*\bid\s*=\s*(["'])faq\1[^>]*>/i);
	if (sectionStart < 0) return [];
	const sectionEnd = html.indexOf('</section>', sectionStart);
	if (sectionEnd < 0) return [];
	const faqSection = html.slice(sectionStart, sectionEnd + '</section>'.length);

	return Array.from(faqSection.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi), (match) => {
		const details = match[1];
		const summary = details.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
		const questionSpan = summary?.[1].match(/<span\b[^>]*>([\s\S]*?)<\/span>/i);
		const answer = details
			.slice(summary?.index != null ? summary.index + summary[0].length : 0)
			.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);

		return {
			question: normalizedText(questionSpan?.[1] ?? ''),
			answer: normalizedText(answer?.[1] ?? '')
		};
	});
}

function checkTopicPage(route, html, nodes) {
	const expectedUrl = `${SITE}${route}`;
	const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
	if (canonical?.[1] !== expectedUrl) {
		fail(
			`${route}: canonical should equal the Topic Headquarters URL ${expectedUrl}; found ${canonical?.[1] ?? 'none'}.`
		);
	}

	const collections = byType(nodes, 'CollectionPage');
	if (collections.length !== 1) {
		fail(`${route}: expected exactly one CollectionPage entity, found ${collections.length}.`);
	} else {
		const collection = collections[0];
		if (collection.url !== expectedUrl || collection['@id'] !== expectedUrl) {
			fail(`${route}: CollectionPage URL and @id must equal ${expectedUrl}.`);
		}

		const visibleDates = topicHeaderUpdatedDates(html);
		if (
			typeof collection.dateModified !== 'string' ||
			visibleDates.length !== 1 ||
			visibleDates[0] !== collection.dateModified
		) {
			fail(
				`${route}: visible Updated date and CollectionPage.dateModified must match exactly; found visible ${visibleDates.join(', ') || 'none'} and schema ${collection.dateModified ?? 'none'}.`
			);
		}
	}

	const breadcrumbs = byType(nodes, 'BreadcrumbList');
	if (breadcrumbs.length !== 1) {
		fail(`${route}: expected exactly one BreadcrumbList entity, found ${breadcrumbs.length}.`);
	} else {
		const items = Array.isArray(breadcrumbs[0].itemListElement)
			? breadcrumbs[0].itemListElement
			: [];
		const finalItem = items.at(-1);
		if (finalItem?.item !== expectedUrl) {
			fail(`${route}: final BreadcrumbList item must equal ${expectedUrl}.`);
		}
	}
	if (!/aria-label="Breadcrumb"/.test(html)) {
		fail(`${route}: visible breadcrumb nav not found next to BreadcrumbList schema.`);
	}

	const faqPages = byType(nodes, 'FAQPage');
	const visibleFaqs = visibleTopicFaqs(html);
	if (!TOPIC_DETAIL_ROUTES.has(route)) {
		if (faqPages.length > 0 || visibleFaqs.length > 0) {
			fail(`${route}: the topic index must not emit detail-page FAQ content or FAQPage schema.`);
		}
		return;
	}

	if (faqPages.length !== 1) {
		fail(`${route}: expected exactly one FAQPage entity, found ${faqPages.length}.`);
		return;
	}
	if (faqPages[0]['@id'] !== `${expectedUrl}#faq`) {
		fail(`${route}: FAQPage @id must equal ${expectedUrl}#faq.`);
	}
	if (faqPages[0].isPartOf?.['@id'] !== expectedUrl) {
		fail(`${route}: FAQPage.isPartOf must reference ${expectedUrl}.`);
	}

	const schemaFaqs = Array.isArray(faqPages[0].mainEntity)
		? faqPages[0].mainEntity.map((question) => ({
				question: normalizedText(question?.name ?? ''),
				answer: normalizedText(question?.acceptedAnswer?.text ?? '')
			}))
		: [];
	if (visibleFaqs.length === 0) {
		fail(`${route}: FAQPage schema was emitted without a visible FAQ section.`);
	} else if (JSON.stringify(schemaFaqs) !== JSON.stringify(visibleFaqs)) {
		fail(
			`${route}: visible FAQs and FAQPage schema must have identical ordered questions and answers (visible ${visibleFaqs.length}, schema ${schemaFaqs.length}).`
		);
	}
}

function checkModifiedDateSignals(route, html, posting, metadata) {
	const expected = metadata.dateModified;
	const visibleDates = visibleUpdatedDates(html);
	const openGraphDates = metaPropertyValues(html, 'article:modified_time');
	const hasJsonLdDate =
		posting != null && Object.prototype.hasOwnProperty.call(posting, 'dateModified');

	if (expected == null) {
		if (visibleDates.length > 0) {
			fail(
				`${route}: unmodified article renders a visible Updated date (${visibleDates.join(', ')}).`
			);
		}
		if (openGraphDates.length > 0) {
			fail(
				`${route}: unmodified article emits article:modified_time (${openGraphDates.join(', ')}).`
			);
		}
		if (hasJsonLdDate) {
			fail(`${route}: unmodified BlogPosting emits JSON-LD dateModified.`);
		}
		return;
	}

	if (visibleDates.length !== 1 || visibleDates[0] !== expected) {
		fail(
			`${route}: visible Updated date must exactly match frontmatter dateModified ${expected}; found ${visibleDates.length > 0 ? visibleDates.join(', ') : 'none'}.`
		);
	}
	if (openGraphDates.length !== 1 || openGraphDates[0] !== expected) {
		fail(
			`${route}: article:modified_time must exactly match frontmatter dateModified ${expected}; found ${openGraphDates.length > 0 ? openGraphDates.join(', ') : 'none'}.`
		);
	}
	if (!hasJsonLdDate || posting.dateModified !== expected) {
		fail(
			`${route}: BlogPosting.dateModified must exactly match frontmatter dateModified ${expected}; found ${hasJsonLdDate ? posting.dateModified : 'none'}.`
		);
	}
}

function checkCommon(route, html) {
	const h1Count = (html.match(/<h1[\s>]/g) || []).length;
	if (h1Count !== 1) fail(`${route}: expected exactly one <h1>, found ${h1Count}.`);

	const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
	if (!canonical) {
		fail(`${route}: missing canonical link.`);
	} else if (!canonical[1].startsWith(`${SITE}/`) && canonical[1] !== SITE) {
		fail(`${route}: canonical is not an absolute production URL: ${canonical[1]}`);
	}

	const docs = extractJsonLd(html, route);
	if (docs.length === 0) {
		fail(`${route}: no JSON-LD block emitted.`);
		return [];
	}
	if (docs.length > 1)
		fail(`${route}: expected a single JSON-LD graph block, found ${docs.length}.`);

	const nodes = flattenGraph(docs);
	const people = byType(nodes, 'Person');
	const sites = byType(nodes, 'WebSite');
	if (people.length !== 1 || people[0]['@id'] !== PERSON_ID) {
		fail(`${route}: expected exactly one Person with @id ${PERSON_ID}.`);
	}
	if (people[0]?.image) {
		fail(`${route}: Person.image must remain absent until a verified author portrait is supplied.`);
	}
	if (sites.length !== 1 || sites[0]['@id'] !== WEBSITE_ID) {
		fail(`${route}: expected exactly one WebSite with @id ${WEBSITE_ID}.`);
	}
	return nodes;
}

async function runRenderedChecks() {
	const sample = published.find((p) => p.slug === 'hie-first-principles-openhie') ?? published[0];
	if (!sample) {
		fail('No published posts found to render.');
		return;
	}
	const faqSample = indexablePublished.find(
		(post) => Array.isArray(post.metadata.faq) && post.metadata.faq.length > 0
	);
	const modifiedSamples = indexablePublished.filter((post) => post.metadata.dateModified != null);
	const unmodifiedSample = indexablePublished.find((post) => post.metadata.dateModified == null);
	const renderedPostSamples = [sample, unmodifiedSample, faqSample, ...modifiedSamples].filter(
		(post, index, posts) =>
			post && posts.findIndex((candidate) => candidate?.path === post.path) === index
	);
	const renderedPostByRoute = new Map(renderedPostSamples.map((post) => [post.path, post]));
	const categoryRoute = `/blog/${slugifyCategory(sample.metadata.category)}`;
	const paginatedCategoryRoute = `${categoryRoute}?page=2`;
	const routes = [
		'/',
		...renderedPostByRoute.keys(),
		categoryRoute,
		paginatedCategoryRoute,
		...TOPIC_RENDER_ROUTES,
		'/images/sketches',
		'/resume',
		'/projects'
	];

	const outputEntry = path.join(root, '.svelte-kit', 'output', 'server', 'index.js');
	const newestSource = Math.max(
		newestMtimeMs(path.join(root, 'src')),
		newestMtimeMs(path.join(root, 'svelte.config.js')),
		newestMtimeMs(path.join(root, 'vite.config.ts'))
	);
	if (!fs.existsSync(outputEntry) || fs.statSync(outputEntry).mtimeMs < newestSource) {
		console.log('Building site for rendered-output checks...');
		await run(process.execPath, [viteCli, 'build']);
	}

	const preview = spawn(process.execPath, [viteCli, 'preview', '--port', String(PREVIEW_PORT)], {
		cwd: root,
		stdio: 'ignore'
	});

	try {
		await waitForServer(`http://localhost:${PREVIEW_PORT}/`);

		for (const route of routes) {
			const res = await fetch(`http://localhost:${PREVIEW_PORT}${route}`);
			if (!res.ok) {
				fail(`${route}: rendered page returned HTTP ${res.status}.`);
				continue;
			}
			const html = await res.text();
			const nodes = checkCommon(route, html);

			if (TOPIC_RENDER_ROUTES.includes(route)) {
				checkTopicPage(route, html, nodes);
			}

			const renderedPost = renderedPostByRoute.get(route);
			if (renderedPost) {
				const postings = byType(nodes, 'BlogPosting');
				const posting = postings[0];
				if (postings.length !== 1) {
					fail(`${route}: expected one BlogPosting entity, found ${postings.length}.`);
				} else {
					for (const field of ['headline', 'description', 'datePublished', 'image', 'genre']) {
						if (!posting[field]) fail(`${route}: BlogPosting is missing "${field}".`);
					}
					if (posting.datePublished !== renderedPost.metadata.date) {
						fail(
							`${route}: BlogPosting.datePublished must exactly match frontmatter date ${renderedPost.metadata.date}.`
						);
					}
					if (posting.isAccessibleForFree !== true)
						fail(`${route}: BlogPosting should identify the public article as free to access.`);
					if (posting.author?.['@id'] !== PERSON_ID)
						fail(`${route}: BlogPosting.author must reference ${PERSON_ID}.`);
					if (posting.isPartOf?.['@id'] !== WEBSITE_ID)
						fail(`${route}: BlogPosting.isPartOf must reference ${WEBSITE_ID}.`);
					if (posting.mainEntityOfPage?.['@id'] !== `${SITE}${route}`)
						fail(`${route}: BlogPosting.mainEntityOfPage must equal the canonical article URL.`);
				}
				checkModifiedDateSignals(route, html, posting, renderedPost.metadata);

				if (!/aria-label="Breadcrumb"/.test(html)) {
					fail(`${route}: visible breadcrumb nav not found next to BreadcrumbList schema.`);
				}

				const declaredFaq = Array.isArray(renderedPost.metadata.faq)
					? renderedPost.metadata.faq
					: [];
				const faqPages = byType(nodes, 'FAQPage');
				if (declaredFaq.length > 0) {
					if (faqPages.length !== 1) {
						fail(
							`${route}: post declares ${declaredFaq.length} FAQ item(s) but no FAQPage JSON-LD was emitted.`
						);
					} else {
						const questions = (faqPages[0].mainEntity || []).map((q) => q.name);
						for (const item of declaredFaq) {
							if (!questions.includes(item.question)) {
								fail(
									`${route}: FAQPage schema is missing the visible question "${item.question}".`
								);
							}
						}
					}
				} else if (faqPages.length > 0) {
					fail(`${route}: FAQPage JSON-LD emitted without matching faq frontmatter.`);
				}
			}

			if (route === paginatedCategoryRoute) {
				const expectedUrl = `${SITE}${paginatedCategoryRoute}`;
				const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
				if (canonical?.[1] !== expectedUrl) {
					fail(`${route}: canonical should equal the page-specific URL ${expectedUrl}.`);
				}
				const collections = byType(nodes, 'CollectionPage');
				if (collections.length !== 1) {
					fail(`${route}: expected one CollectionPage entity, found ${collections.length}.`);
				} else if (collections[0].url !== expectedUrl || collections[0]['@id'] !== expectedUrl) {
					fail(`${route}: CollectionPage URL and @id must match its page-specific canonical.`);
				}
			}

			if (route === '/resume') {
				const publications = byType(nodes, 'ScholarlyArticle');
				const publication = publications.find(
					(node) => node['@id'] === 'https://doi.org/10.1097/00115514-200609000-00005'
				);
				const authors = Array.isArray(publication?.author) ? publication.author : [];
				if (!publication || !authors.some((author) => author?.['@id'] === PERSON_ID)) {
					fail(`${route}: verified journal publication must link Suvro Ghosh via ${PERSON_ID}.`);
				}
			}

			if (route === '/projects') {
				const lists = byType(nodes, 'ItemList');
				const works = lists.flatMap((list) =>
					Array.isArray(list.itemListElement)
						? list.itemListElement.map((entry) => entry?.item).filter(Boolean)
						: []
				);
				if (works.length === 0) {
					fail(`${route}: project ItemList has no CreativeWork entries.`);
				} else if (works.some((work) => work.creator?.['@id'] !== PERSON_ID)) {
					fail(`${route}: every listed CreativeWork must link its creator to ${PERSON_ID}.`);
				}
			}
		}
	} finally {
		preview.kill('SIGTERM');
	}
}

/* -------------------------------------------------------------------------- */

try {
	await runRenderedChecks();
} catch (error) {
	fail(`Rendered checks could not complete: ${error instanceof Error ? error.message : error}`);
}

if (errors.length > 0) {
	console.error(`\nDiscoverability validation failed with ${errors.length} issue(s):`);
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log(
	`Discoverability validation passed: ${published.length} published posts checked, representative routes rendered and verified.`
);
