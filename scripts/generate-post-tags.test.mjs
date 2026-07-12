import assert from 'node:assert/strict';
import test from 'node:test';
import { bodyHash, extractTags, replaceTags, splitPost } from './generate-post-tags.mjs';

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
