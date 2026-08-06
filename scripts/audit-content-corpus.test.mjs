import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	CONTENT_MODES,
	OUTPUT_FILENAMES,
	auditCorpus,
	buildTfidfVectors,
	cosineSimilarity
} from './audit-content-corpus.mjs';

function fixtureRoot() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-corpus-audit-'));
	fs.mkdirSync(path.join(root, 'src', 'lib', 'posts'), { recursive: true });
	fs.mkdirSync(path.join(root, 'src', 'lib', 'content'), { recursive: true });
	return root;
}

function yamlString(value) {
	return JSON.stringify(value);
}

function writePost(root, slug, options = {}) {
	const title = options.title ?? slug.replace(/-/g, ' ');
	const description =
		options.description ??
		`A fixture description for ${title} with enough detail for deterministic corpus testing.`;
	const category = options.category ?? 'Essay';
	const tags = options.tags ?? ['Fixture', 'Testing'];
	const published = options.published ?? true;
	const body =
		options.body ??
		`This is an original fixture paragraph about ${title}. It contains enough visible words to exercise deterministic local parsing without any network request or private data.`;
	fs.writeFileSync(
		path.join(root, 'src', 'lib', 'posts', `${slug}.md`),
		`---\ntitle: ${yamlString(title)}\ndescription: ${yamlString(description)}\ndate: "2026-08-01"\ncategory: ${yamlString(category)}\ntags: ${JSON.stringify(tags)}\npublished: ${published}\n${options.extraFrontmatter ?? ''}---\n\n${body}\n`,
		'utf8'
	);
}

function writeAliases(root, aliases = {}) {
	const entries = Object.entries(aliases)
		.map(([source, destination]) => `\t${JSON.stringify(source)}: ${JSON.stringify(destination)}`)
		.join(',\n');
	fs.writeFileSync(
		path.join(root, 'src', 'lib', 'content', 'posts.ts'),
		`export const postPathAliases: Record<string, string> = {\n${entries}\n};\n`,
		'utf8'
	);
}

function parseCsv(source) {
	const rows = [];
	let row = [];
	let field = '';
	let quoted = false;
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		if (quoted) {
			if (character === '"' && source[index + 1] === '"') {
				field += '"';
				index += 1;
			} else if (character === '"') quoted = false;
			else field += character;
		} else if (character === '"') quoted = true;
		else if (character === ',') {
			row.push(field);
			field = '';
		} else if (character === '\n') {
			row.push(field.replace(/\r$/, ''));
			rows.push(row);
			row = [];
			field = '';
		} else field += character;
	}
	const [headers, ...values] = rows.filter((values_) => values_.some((value) => value !== ''));
	return values.map((values_) =>
		Object.fromEntries(headers.map((header, index) => [header, values_[index] ?? '']))
	);
}

function readCsv(outputDir, filename) {
	return parseCsv(fs.readFileSync(path.join(outputDir, filename), 'utf8'));
}

test('declares the twelve required content modes exactly once', () => {
	assert.equal(CONTENT_MODES.length, 12);
	assert.equal(new Set(CONTENT_MODES).size, 12);
	assert.deepEqual(CONTENT_MODES, [
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
});

test('inventories every Markdown source but classifies canonical published articles only', (context) => {
	const root = fixtureRoot();
	context.after(() => fs.rmSync(root, { recursive: true, force: true }));
	writePost(root, 'canonical-story', { category: 'Short Fiction', tags: ['Fiction'] });
	writePost(root, 'draft-story', {
		category: 'Short Fiction',
		tags: ['Fiction'],
		published: false
	});
	writePost(root, 'old-story', { category: 'Short Fiction', tags: ['Fiction'] });
	writeAliases(root, { 'short-fiction/old-story': '/blog/short-fiction/canonical-story' });

	const outputDir = path.join(root, 'out');
	const result = auditCorpus({ root, outputDir, auditDate: '2026-08-06' });
	assert.deepEqual(
		{
			postsRead: result.postsRead,
			canonicalPosts: result.canonicalPosts,
			nonCanonicalSources: result.nonCanonicalSources
		},
		{ postsRead: 3, canonicalPosts: 1, nonCanonicalSources: 2 }
	);
	const inventory = readCsv(outputDir, 'CONTENT_INVENTORY.csv');
	assert.equal(inventory.length, 3);
	const unpublished = inventory.find((row) => row.source_status === 'UNPUBLISHED_NOT_CANONICAL');
	assert.equal(unpublished.source_file, '[REDACTED-UNPUBLISHED-SOURCE-AGGREGATE]');
	assert.equal(unpublished.title, '');
	assert.equal(unpublished.description, '');
	assert.equal(unpublished.body_sha256_normalized, '');
	assert.match(unpublished.assessment_provenance, /1 unpublished source/);
	assert.doesNotMatch(JSON.stringify(inventory), /draft-story/i);
	assert.equal(
		inventory.find((row) => row.source_file.endsWith('/old-story.md')).source_status,
		'REDIRECT_SOURCE_NOT_CANONICAL'
	);
	const classification = readCsv(outputDir, 'CONTENT_CLASSIFICATION.csv');
	assert.equal(classification.length, 1);
	assert.equal(classification[0].primary_content_mode, 'fiction');
});

test('collapses multiple unpublished sources into one redacted public status row', (context) => {
	const root = fixtureRoot();
	context.after(() => fs.rmSync(root, { recursive: true, force: true }));
	writePost(root, 'private-draft-one', {
		title: 'Private identifying title one',
		published: false,
		body: 'Private identifying body one with confidential working notes.'
	});
	writePost(root, 'private-draft-two', {
		title: 'Private identifying title two',
		published: false,
		body: 'Private identifying body two with confidential working notes.'
	});
	writeAliases(root);
	const outputDir = path.join(root, 'out');
	auditCorpus({ root, outputDir });
	const inventorySource = fs.readFileSync(path.join(outputDir, 'CONTENT_INVENTORY.csv'), 'utf8');
	const inventory = parseCsv(inventorySource);
	assert.equal(inventory.length, 1);
	assert.equal(inventory[0].source_status, 'UNPUBLISHED_NOT_CANONICAL');
	assert.match(inventory[0].assessment_provenance, /2 unpublished source/);
	assert.doesNotMatch(inventorySource, /private-draft|Private identifying|confidential/i);
});

test('redacts UUID-bearing external paths while retaining origin and domain evidence', (context) => {
	const root = fixtureRoot();
	context.after(() => fs.rmSync(root, { recursive: true, force: true }));
	writePost(root, 'external-artifact-links', {
		body: `A local evidence fixture.

[Shared artifact](https://notebooklm.google.com/notebook/11111111-1111-4111-8111-111111111111/artifact/22222222-2222-4222-8222-222222222222?view=private#fragment)

[Stable public source](https://example.org/research/paper?tracking=discarded#section)`
	});
	writeAliases(root);
	const outputDir = path.join(root, 'out');
	auditCorpus({ root, outputDir });
	const [inventory] = readCsv(outputDir, 'CONTENT_INVENTORY.csv');
	const [evidence] = readCsv(outputDir, 'EVIDENCE_AUDIT.csv');
	for (const value of [
		inventory.external_link_targets_sanitized,
		evidence.external_source_urls_sanitized
	]) {
		assert.match(value, /https:\/\/notebooklm\.google\.com\/\[REDACTED-UUID-PATH\]/);
		assert.match(value, /https:\/\/example\.org\/research\/paper/);
		assert.doesNotMatch(value, /11111111|22222222|view=private|fragment/);
	}
	assert.match(inventory.external_domains, /notebooklm\.google\.com/);
});

test('preserves balanced parentheses in authored Markdown-link destinations', (context) => {
	const root = fixtureRoot();
	context.after(() => fs.rmSync(root, { recursive: true, force: true }));
	writePost(root, 'balanced-doi-link', {
		body: `A scientific fixture with an authored DOI.

[Biophysical Journal paper](https://doi.org/10.1016/S0006-3495(61)86902-6)`
	});
	writeAliases(root);
	const outputDir = path.join(root, 'out');
	auditCorpus({ root, outputDir });
	const [inventory] = readCsv(outputDir, 'CONTENT_INVENTORY.csv');
	const [evidence] = readCsv(outputDir, 'EVIDENCE_AUDIT.csv');
	assert.equal(
		inventory.external_link_targets_sanitized,
		'https://doi.org/10.1016/S0006-3495(61)86902-6'
	);
	assert.equal(
		evidence.external_source_urls_sanitized,
		'https://doi.org/10.1016/S0006-3495(61)86902-6'
	);
});

test('keeps authenticated search fields blank and labels inferred fields and index status', (context) => {
	const root = fixtureRoot();
	context.after(() => fs.rmSync(root, { recursive: true, force: true }));
	writePost(root, 'health-evidence', {
		title: 'How a Clinical Treatment Changes Patient Outcomes',
		category: 'Public Health',
		tags: ['Clinical', 'Patient', 'Treatment'],
		body: 'A treatment can change patient outcomes. In 2024, a study reported a 25% difference. This consequential claim needs direct source review before publication decisions are made.'
	});
	writeAliases(root);
	const outputDir = path.join(root, 'out');
	auditCorpus({ root, outputDir });
	const [row] = readCsv(outputDir, 'CONTENT_CLASSIFICATION.csv');
	assert.equal(row.primary_content_mode, 'evidence-sensitive medical or healthcare information');
	assert.equal(row.impressions, '');
	assert.equal(row.clicks, '');
	assert.equal(row.average_position, '');
	assert.equal(row.click_through_rate, '');
	assert.match(row.indexed_status, /^UNVERIFIED/);
	assert.match(row.field_provenance, /HEURISTIC_INFERENCE/);
	assert.match(row.search_metrics_status, /^UNVERIFIED/);
	assert.ok(Number(row.evidence_requirement_0_5) >= 0 && Number(row.evidence_requirement_0_5) <= 5);
	assert.ok(
		Number(row.existing_evidence_quality_0_5) >= 0 && Number(row.existing_evidence_quality_0_5) <= 5
	);
});

test('detects exact bodies, near-duplicate bodies, and repeated passages with local TF-IDF', (context) => {
	const root = fixtureRoot();
	context.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const sharedParagraph =
		'This deliberately repeated passage describes a local deterministic system in enough detail to cross the passage threshold. It explains architecture, data boundaries, validation, reproducibility, careful evidence, source review, and editorial judgment without claiming that similarity proves search cannibalization or authorizing automatic consolidation.';
	const commonBody = `${sharedParagraph}\n\n${'A carefully observed technical sentence about hospital data architecture and patient context. '.repeat(12)}`;
	writePost(root, 'exact-a', {
		category: 'Technology',
		tags: ['Data Architecture', 'Hospital Systems'],
		body: commonBody
	});
	writePost(root, 'exact-b', {
		category: 'Technology',
		tags: ['Data Architecture', 'Hospital Systems'],
		body: commonBody
	});
	writePost(root, 'near-c', {
		category: 'Technology',
		tags: ['Data Architecture', 'Hospital Systems'],
		body: `${sharedParagraph}\n\n${'A carefully observed technical sentence about hospital data architecture and patient context. '.repeat(11)}One sentence is materially different.`
	});
	writeAliases(root);
	const outputDir = path.join(root, 'out');
	auditCorpus({ root, outputDir, nearDuplicateThreshold: 0.7 });
	const relations = readCsv(outputDir, 'DUPLICATION_AND_CANNIBALIZATION.csv');
	assert.ok(relations.some((row) => row.issue_type === 'EXACT_NORMALIZED_BODY'));
	assert.ok(relations.some((row) => row.issue_type === 'NEAR_DUPLICATE_BODY'));
	assert.ok(relations.some((row) => row.issue_type === 'REPEATED_EXACT_PASSAGE'));
	assert.ok(relations.every((row) => /HEURISTIC_INFERENCE/.test(row.assessment_status)));
	assert.ok(
		relations.every(
			(row) => !/automatic(?:ally)? (?:merge|delete)/i.test(row.recommended_editorial_review)
		)
	);

	const vectors = buildTfidfVectors(['alpha beta gamma delta', 'alpha beta gamma epsilon']);
	assert.ok(cosineSimilarity(vectors[0], vectors[1]) > 0.5);
});

test('writes only the five Phase 5 outputs and is byte-for-byte deterministic', (context) => {
	const root = fixtureRoot();
	context.after(() => fs.rmSync(root, { recursive: true, force: true }));
	writePost(root, 'visual-lab', {
		title: 'An Interactive Geometry Laboratory',
		category: 'Visualizations',
		tags: ['Geometry', 'Visualization'],
		extraFrontmatter: 'interactiveFirst: true\n',
		body: '<GeometryLab />\n\nExplore a geometric construction using an original local interactive model and explanatory notes.'
	});
	writePost(root, 'satirical-note', {
		category: 'Satire',
		tags: ['Satire'],
		body: 'A clearly labelled satirical note for direct readers.'
	});
	writeAliases(root);
	const firstOutput = path.join(root, 'out-a');
	const secondOutput = path.join(root, 'out-b');
	auditCorpus({ root, outputDir: firstOutput, auditDate: '2026-08-06' });
	auditCorpus({ root, outputDir: secondOutput, auditDate: '2026-08-06' });
	assert.deepEqual(fs.readdirSync(firstOutput).sort(), [...OUTPUT_FILENAMES].sort());
	assert.ok(!fs.existsSync(path.join(firstOutput, 'FLAGSHIP_PAGES.csv')));
	for (const filename of OUTPUT_FILENAMES) {
		assert.equal(
			fs.readFileSync(path.join(firstOutput, filename), 'utf8'),
			fs.readFileSync(path.join(secondOutput, filename), 'utf8')
		);
	}
	const remediation = fs.readFileSync(
		path.join(firstOutput, 'CONTENT_REMEDIATION_QUEUE.md'),
		'utf8'
	);
	assert.match(remediation, /final selection deferred/i);
	assert.match(remediation, /no network requests/i);
	assert.match(remediation, /no external embeddings/i);
});

test('implementation contains no network-call primitive or external embedding client', () => {
	const source = fs.readFileSync(new URL('./audit-content-corpus.mjs', import.meta.url), 'utf8');
	assert.doesNotMatch(source, /\bfetch\s*\(/);
	assert.doesNotMatch(source, /\b(?:axios|openai|cohere|voyageai)\b\s*(?:\.|\()/i);
	assert.doesNotMatch(source, /node:https|node:http/);
});
