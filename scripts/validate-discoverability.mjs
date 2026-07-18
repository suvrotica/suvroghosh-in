/**
 * validate:discoverability
 *
 * Build-time checks for conventional- and generative-search discoverability.
 *
 * Layer 1 checks every published post's frontmatter.
 * Layer 2 builds the site (if needed), serves the production build locally, and
 * inspects the actual server-rendered HTML of representative routes: JSON-LD
 * validity, single H1, canonical URLs, stable Person/WebSite entity IDs, article
 * author linkage, breadcrumb presence, and visible-FAQ/schema agreement.
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
const SITE = 'https://www.suvroghosh.in';
const PERSON_ID = `${SITE}/#person`;
const WEBSITE_ID = `${SITE}/#website`;
const PREVIEW_PORT = 4473;

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

/* -------------------------------------------------------------------------- */
/* 2. robots.txt + sitemap source checks                                       */
/* -------------------------------------------------------------------------- */

const robotsPath = path.join(root, 'static', 'robots.txt');
if (fs.existsSync(robotsPath)) {
	const robots = fs.readFileSync(robotsPath, 'utf8');
	if (!/^Sitemap:\s*https:\/\/www\.suvroghosh\.in\/sitemap\.xml\s*$/im.test(robots)) {
		fail('static/robots.txt is missing an absolute Sitemap: declaration.');
	}
} else {
	fail('static/robots.txt not found.');
}

const sitemapSource = fs.readFileSync(
	path.join(root, 'src', 'routes', 'sitemap.xml', '+server.ts'),
	'utf8'
);
if (!/getPublishedPosts|isIndexablePost|published === false/.test(sitemapSource)) {
	fail('sitemap.xml generator should exclude unpublished posts.');
}
if (!/dateModified \?\? post\.date|post\.dateModified/.test(sitemapSource)) {
	fail('sitemap.xml post lastmod should prefer dateModified over the publication date.');
}

/* -------------------------------------------------------------------------- */
/* 3. Rendered-output checks                                                   */
/* -------------------------------------------------------------------------- */

function run(cmd, args) {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(cmd, args, { cwd: root, shell: true, stdio: 'ignore' });
		child.on('exit', (code) =>
			code === 0
				? resolvePromise()
				: rejectPromise(new Error(`${cmd} ${args.join(' ')} exited ${code}`))
		);
		child.on('error', rejectPromise);
	});
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
	const articleRoute = sample.path;
	const categoryRoute = `/blog/${slugifyCategory(sample.metadata.category)}`;
	const routes = ['/', articleRoute, categoryRoute];

	if (!fs.existsSync(path.join(root, '.svelte-kit', 'output'))) {
		console.log('Building site for rendered-output checks...');
		await run('npm', ['run', 'build']);
	}

	const preview = spawn('npm', ['run', 'preview', '--', '--port', String(PREVIEW_PORT)], {
		cwd: root,
		shell: true,
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

			if (route === articleRoute) {
				const postings = byType(nodes, 'BlogPosting');
				if (postings.length !== 1) {
					fail(`${route}: expected one BlogPosting entity, found ${postings.length}.`);
				} else {
					const post = postings[0];
					for (const field of [
						'headline',
						'description',
						'datePublished',
						'dateModified',
						'image'
					]) {
						if (!post[field]) fail(`${route}: BlogPosting is missing "${field}".`);
					}
					if (post.author?.['@id'] !== PERSON_ID)
						fail(`${route}: BlogPosting.author must reference ${PERSON_ID}.`);
					if (post.isPartOf?.['@id'] !== WEBSITE_ID)
						fail(`${route}: BlogPosting.isPartOf must reference ${WEBSITE_ID}.`);
					if (post.mainEntityOfPage?.['@id'] !== `${SITE}${articleRoute}`)
						fail(`${route}: BlogPosting.mainEntityOfPage must equal the canonical article URL.`);
				}

				if (!/aria-label="Breadcrumb"/.test(html)) {
					fail(`${route}: visible breadcrumb nav not found next to BreadcrumbList schema.`);
				}

				const declaredFaq = Array.isArray(sample.metadata.faq) ? sample.metadata.faq : [];
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
