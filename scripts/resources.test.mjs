import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractResourceCopyText } from '../src/lib/content/resources.ts';
import { scanResourceSources, validateResourceSources } from './validate-resources.mjs';

function source({
	slug = 'useful-prompt',
	kind = 'prompt',
	date = '2026-07-30',
	related = [],
	body = `A practical introduction for this reusable resource.

<!-- resource-copy:start -->

## Reusable material

Work carefully with the supplied material and preserve its exact meaning.

<!-- resource-copy:end -->

## Usage notes

Adapt the variables to the situation.`
} = {}) {
	const segment = kind === 'prompt' ? 'prompts' : 'lists';
	return {
		sourcePath: `/virtual/${segment}/${slug}.md`,
		sourceLabel: `src/lib/${segment}/${slug}.md`,
		filename: `${slug}.md`,
		expectedKind: kind,
		rawMarkdown: `---
title: "${slug
			.split('-')
			.map((part) => part[0].toUpperCase() + part.slice(1))
			.join(' ')}"
description: "A carefully prepared reusable resource with enough detail to satisfy the strict description contract."
date: "${date}"
dateModified: "2026-07-30"
kind: "${kind}"
tags:
  - "Testing"
published: true
featured: false
order: 10
thumbnail: "/images/resources/${slug}.webp"
thumbnailAlt: "A labelled field-note card used for resource validation"
estimatedLength: "3 prompt templates"
related:${related.length ? `\n${related.map((item) => `  - "${item}"`).join('\n')}` : ' []'}
language: "en"
---

${body}
`
	};
}

const everyAssetExists = () => true;

test('accepts a valid resource source', () => {
	const result = validateResourceSources([source()], {
		assetExists: everyAssetExists,
		minimumRelated: 0
	});
	assert.deepEqual(result.errors, []);
	assert.equal(result.publishedResources.length, 1);
});

test('rejects a missing copy marker', () => {
	const fixture = source({
		body: 'An introduction with enough text but no author-designated copy region.'
	});
	const result = validateResourceSources([fixture], {
		assetExists: everyAssetExists,
		minimumRelated: 0
	});
	assert.match(result.errors.join('\n'), /exactly one .*resource-copy:start/i);
});

test('rejects duplicate copy markers', () => {
	const fixture = source({
		body: `<!-- resource-copy:start -->
First reusable region has enough content to be plausible and useful.
<!-- resource-copy:end -->
<!-- resource-copy:start -->
Second reusable region must make validation fail clearly.
<!-- resource-copy:end -->`
	});
	const result = validateResourceSources([fixture], {
		assetExists: everyAssetExists,
		minimumRelated: 0
	});
	assert.match(result.errors.join('\n'), /exactly one .*resource-copy:start/i);
});

test('rejects an invalid date', () => {
	const result = validateResourceSources([source({ date: '2026-02-30' })], {
		assetExists: everyAssetExists,
		minimumRelated: 0
	});
	assert.match(result.errors.join('\n'), /date must be a real calendar date/i);
});

test('rejects directory and kind disagreement', () => {
	const fixture = source({ kind: 'prompt' });
	fixture.expectedKind = 'list';
	const result = validateResourceSources([fixture], {
		assetExists: everyAssetExists,
		minimumRelated: 0
	});
	assert.match(result.errors.join('\n'), /does not match its list directory/i);
});

test('rejects broken and self-related references', () => {
	const broken = source({
		slug: 'broken-related',
		related: ['prompts/does-not-exist']
	});
	const selfRelated = source({
		slug: 'self-related',
		related: ['prompts/self-related']
	});
	const result = validateResourceSources([broken, selfRelated], {
		assetExists: everyAssetExists,
		minimumRelated: 0
	});
	assert.match(result.errors.join('\n'), /does-not-exist does not exist/i);
	assert.match(result.errors.join('\n'), /self-related points to itself/i);
});

test('rejects a missing thumbnail', () => {
	const result = validateResourceSources([source()], {
		assetExists: () => false,
		minimumRelated: 0
	});
	assert.match(result.errors.join('\n'), /thumbnail does not exist/i);
});

test('rejects a duplicate slug within one kind', () => {
	const first = source({ slug: 'duplicate-resource' });
	const second = { ...source({ slug: 'duplicate-resource' }), sourceLabel: 'duplicate-copy.md' };
	const result = validateResourceSources([first, second], {
		assetExists: everyAssetExists,
		minimumRelated: 0
	});
	assert.match(result.errors.join('\n'), /duplicate slug within prompts/i);
});

test('rejects editorial placeholder content while allowing prompt variables', () => {
	const fixture = source({
		body: `<!-- resource-copy:start -->
Use [AUDIENCE] and [SOURCE MATERIAL] carefully, but [INSERT CONTENT HERE].
<!-- resource-copy:end -->`
	});
	const result = validateResourceSources([fixture], {
		assetExists: everyAssetExists,
		minimumRelated: 0
	});
	assert.match(result.errors.join('\n'), /editorial bracket placeholder/i);
});

test('preserves Unicode, punctuation, indentation, and internal line breaks exactly', () => {
	const raw = `---
title: test
---
Outside.
<!-- resource-copy:start -->

## বাংলা

অভিমান — abhimān

    [MOOD]: নরম, সংযত

Keep—this punctuation.

<!-- resource-copy:end -->
Outside again.`;
	assert.equal(
		extractResourceCopyText(raw),
		`## বাংলা

অভিমান — abhimān

    [MOOD]: নরম, সংযত

Keep—this punctuation.`
	);
});

test('the launch catalogue has eight prompts, ten lists, valid relationships, and images', () => {
	const result = validateResourceSources(scanResourceSources());
	assert.deepEqual(result.errors, []);
	assert.equal(
		result.publishedResources.filter((resource) => resource.kind === 'prompt').length,
		8
	);
	assert.equal(result.publishedResources.filter((resource) => resource.kind === 'list').length, 10);
});
