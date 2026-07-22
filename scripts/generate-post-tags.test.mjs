import assert from 'node:assert/strict';
import test from 'node:test';
import {
	bodyHash,
	extractTags,
	freshnessIssue,
	mergePinnedTags,
	postRevisionHash,
	replaceTags,
	splitPost
} from './generate-post-tags.mjs';

const corpus = {
	documentCount: 3,
	documentFrequency: new Map([
		['healthcare', 2],
		['data', 2],
		['interoperability', 1],
		['fhir', 1]
	])
};

test('frontmatter text cannot influence generated tags', () => {
	const raw = `---
title: Forbidden Lobster Metaphor
description: Forbidden frontmatter language
date: "2026-07-13"
category: Test
tags: ["Old"]
published: true
---

Healthcare data interoperability matters. Healthcare data interoperability connects systems.
FHIR supports healthcare data exchange. FHIR improves healthcare interoperability and data exchange.
FHIR keeps healthcare data exchange explicit across clinical systems.
Healthcare data must remain meaningful across healthcare systems and clinical workflows.
`;
	const post = splitPost(raw, 'fixture.md');
	const tags = extractTags(post.body, 10, corpus);

	assert.ok(tags.includes('FHIR'));
	assert.ok(tags.some((tag) => tag.includes('Healthcare')));
	assert.ok(!tags.some((tag) => /lobster|forbidden/i.test(tag)));
});

test('only the tags block is replaced and the body is byte-stable', () => {
	const raw = `---\r
title: 'Formatting stays'\r
description: 'Untouched'\r
date: '2026-07-13'\r
category: 'Test'\r
tags:\r
  [\r
    'Old tag',\r
    'Another old tag'\r
  ]\r
published: true\r
color: '#123456'\r
---\r
\r
Body text remains exactly the same.\r
`;
	const post = splitPost(raw, 'fixture.md');
	const updated = replaceTags(post, ['FHIR', 'Healthcare Data']);
	const reparsed = splitPost(updated, 'fixture.md');

	assert.deepEqual(reparsed.metadata.tags, ['FHIR', 'Healthcare Data']);
	assert.equal(reparsed.body, post.body);
	assert.match(updated, /title: 'Formatting stays'/);
	assert.match(updated, /color: '#123456'/);
	assert.ok(updated.includes('\r\n'));
});

test('body hashes ignore frontmatter-only changes', () => {
	const first = splitPost(`---\ntitle: First\ntags: [One]\n---\nSame body.\n`, 'first.md');
	const second = splitPost(`---\ntitle: Second\ntags: [Two]\n---\nSame body.\n`, 'second.md');

	assert.equal(bodyHash(first.body), bodyHash(second.body));
});

test('revision hashes ignore generated metadata but track meaningful post changes', () => {
	const first = splitPost(
		`---\ntitle: First\ndescription: Original\ntags: [One]\ndateModified: '2026-07-22'\n---\nSame body.\n`,
		'first.md'
	);
	const generatedMetadataOnly = splitPost(
		`---\ntitle: First\ndescription: Original\ntags: [Two]\ndateModified: '2026-07-23'\n---\nSame body.\n`,
		'second.md'
	);
	const meaningfulEdit = splitPost(
		`---\ntitle: First\ndescription: Revised\ntags: [Two]\ndateModified: '2026-07-23'\n---\nSame body.\n`,
		'third.md'
	);

	assert.equal(postRevisionHash(first), postRevisionHash(generatedMetadataOnly));
	assert.notEqual(postRevisionHash(first), postRevisionHash(meaningfulEdit));
});

test('changed published content must add or advance dateModified', () => {
	const previous = splitPost(
		`---\ntitle: First\ntags: [One]\ndateModified: '2026-07-22'\npublished: true\n---\nOld body.\n`,
		'previous.md'
	);
	const previousCache = {
		bodyHash: bodyHash(previous.body),
		revisionHash: postRevisionHash(previous),
		dateModified: '2026-07-22'
	};
	const withoutDate = splitPost(
		`---\ntitle: First\ntags: [One]\npublished: true\n---\nNew body.\n`,
		'without-date.md'
	);
	const unchangedDate = splitPost(
		`---\ntitle: First\ntags: [One]\ndateModified: '2026-07-22'\npublished: true\n---\nNew body.\n`,
		'unchanged-date.md'
	);
	const advancedDate = splitPost(
		`---\ntitle: First\ntags: [One]\ndateModified: '2026-07-23'\npublished: true\n---\nNew body.\n`,
		'advanced-date.md'
	);

	assert.match(
		freshnessIssue(
			previousCache,
			withoutDate,
			bodyHash(withoutDate.body),
			postRevisionHash(withoutDate)
		),
		/add dateModified/
	);
	assert.match(
		freshnessIssue(
			previousCache,
			unchangedDate,
			bodyHash(unchangedDate.body),
			postRevisionHash(unchangedDate),
			'2026-07-23'
		),
		/advance it to the edit date/
	);
	assert.equal(
		freshnessIssue(
			previousCache,
			unchangedDate,
			bodyHash(unchangedDate.body),
			postRevisionHash(unchangedDate),
			'2026-07-22'
		),
		null
	);
	assert.equal(
		freshnessIssue(
			previousCache,
			advancedDate,
			bodyHash(advancedDate.body),
			postRevisionHash(advancedDate)
		),
		null
	);
});

test('short visualization technology names keep their canonical display form', () => {
	const body = `
D3 maps data to marks. D3 scales translate values. D3 selections update SVG.
Observable cells use D3 to render data, and D3 keeps the document data-driven.
`;
	const tags = extractTags(body, 10, corpus);

	assert.ok(tags.includes('D3'));
});

test('authored pinned tags survive ahead of deterministic body-derived tags', () => {
	assert.deepEqual(
		mergePinnedTags(
			['Simulation', 'Pigment', 'Brush', 'Painting'],
			['Shaders', 'WebGL', 'Watercolor', 'Simulation', 'Interactive Art'],
			7
		),
		['Shaders', 'WebGL', 'Watercolor', 'Simulation', 'Interactive Art', 'Pigment', 'Brush']
	);
	assert.throws(() => mergePinnedTags(['Data'], 'not-an-array'), /array of strings/);
	assert.throws(() => mergePinnedTags(['Data'], [''], 10), /non-empty strings/);
});
