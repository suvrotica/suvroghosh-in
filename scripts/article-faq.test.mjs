import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { validateArticleFaq } from './lib/article-faq.mjs';

const pageUrl = 'https://www.suvroghosh.in/blog/healthcare-it/faq-fixture';
const faq = [
	{ question: 'What are A & B?', answer: 'Two distinct terms, not interchangeable labels.' },
	{ question: 'Is this measured?', answer: 'No. This is an explanation, not an experiment.' }
];
const escapeHtml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const itemsHtml = (items = faq) =>
	items
		.map(
			(item) => `<div data-faq-item><h3 data-faq-question>${escapeHtml(item.question)}</h3>
<p data-faq-answer>${escapeHtml(item.answer)}</p></div>`
		)
		.join('');
const articleHtml = (items = faq) =>
	`<article><section data-article-faq>${itemsHtml(items)}</section></article>`;
const schema = (items = faq) => [
	{
		'@type': 'FAQPage',
		'@id': `${pageUrl}#faq`,
		isPartOf: { '@id': pageUrl },
		mainEntity: items.map((item) => ({
			'@type': 'Question',
			name: item.question,
			acceptedAnswer: { '@type': 'Answer', text: item.answer }
		}))
	}
];
const check = (overrides = {}) =>
	validateArticleFaq({
		html: articleHtml(),
		declaredFaq: faq,
		faqPages: schema(),
		pageUrl,
		...overrides
	});

const componentPath = path.resolve('src/lib/components/blog/ArticleQuickAnswer.svelte');
const cacheDirectory = path.resolve('node_modules/.cache');
fs.mkdirSync(cacheDirectory, { recursive: true });
const modulePath = path.join(cacheDirectory, `article-faq-ssr-${process.pid}.mjs`);
fs.writeFileSync(
	modulePath,
	compile(fs.readFileSync(componentPath, 'utf8'), {
		filename: componentPath,
		generate: 'server'
	}).js.code
);
let ArticleQuickAnswer;
try {
	ArticleQuickAnswer = (await import(pathToFileURL(modulePath).href)).default;
} finally {
	fs.unlinkSync(modulePath);
}

for (const deferred of [false, true]) {
	test(`the actual ${deferred ? 'deferred' : 'standard'} component renders every FAQ once`, () => {
		const { body } = render(ArticleQuickAnswer, { props: { faq, deferred } });
		assert.deepEqual(check({ html: `<article>${body}</article>` }), []);
		assert.equal(body.includes('id="faq"'), deferred);
	});
}

test('absent and empty optional FAQs need neither rendered items nor schema', () => {
	assert.deepEqual(validateArticleFaq({ html: '<article></article>', pageUrl }), []);
	assert.deepEqual(check({ html: '<article></article>', declaredFaq: [], faqPages: [] }), []);
});

test('HTML entities, inline emphasis and whitespace preserve the same wording', () => {
	const html = articleHtml()
		.replace('A &amp; B?', 'A &#38; <em>B</em>?')
		.replace('Two distinct terms,', 'Two\n  distinct\tterms,');
	assert.deepEqual(check({ html }), []);
});

test('native closed details are readable without JavaScript', () => {
	const html = `<article><section data-article-faq>${faq
		.map(
			(item) =>
				`<details data-faq-item><summary data-faq-question>${escapeHtml(item.question)}</summary><p data-faq-answer>${escapeHtml(item.answer)}</p></details>`
		)
		.join('')}</section></article>`;
	assert.deepEqual(check({ html }), []);
});

test('identical questions cannot mask a changed schema answer', () => {
	const altered = faq.map((item, index) => (index ? item : { ...item, answer: 'A false answer.' }));
	assert.ok(
		check({ faqPages: schema(altered) }).some((error) => error.includes('schema FAQ must match'))
	);
});

test('a changed visible answer is detected independently of correct schema', () => {
	const altered = faq.map((item, index) => (index ? item : { ...item, answer: 'A false answer.' }));
	assert.ok(
		check({ html: articleHtml(altered) }).some((error) => error.includes('visible FAQ must match'))
	);
});

for (const [label, changed] of [
	['missing', faq.slice(1)],
	['extra', [...faq, { question: 'Another question?', answer: 'An unreviewed answer.' }]],
	['reordered', [...faq].reverse()],
	['duplicate', [...faq, faq[0]]]
]) {
	test(`${label} visible or schema FAQ items fail agreement`, () => {
		assert.ok(check({ html: articleHtml(changed) }).length);
		assert.ok(check({ faqPages: schema(changed) }).length);
	});
}

test('duplicates fail even when metadata, DOM and schema repeat the same question', () => {
	const duplicated = [...faq, faq[0]];
	assert.ok(
		check({
			declaredFaq: duplicated,
			html: articleHtml(duplicated),
			faqPages: schema(duplicated)
		}).some((error) => error.includes('duplicate questions'))
	);
});

for (const attribute of [
	'hidden',
	'inert',
	'aria-hidden="true"',
	'style="display: none !important"',
	'style="visibility: hidden"',
	'style="opacity: 0"',
	'class="hidden"',
	'class="sr-only"'
]) {
	test(`FAQ text concealed by ${attribute} cannot satisfy the rendered check`, () => {
		assert.ok(
			check({ html: articleHtml().replace('<article>', `<article ${attribute}>`) }).some((error) =>
				error.includes('visible FAQ must match')
			)
		);
	});
}

test('script, template, metadata or unrelated page text cannot substitute for article FAQs', () => {
	for (const html of [
		`<article><script type="application/json">${articleHtml()}</script></article>`,
		`<article><template>${articleHtml()}</template></article>`,
		`<article><meta name="description" content="${faq[0].answer}"></article>`,
		`<aside data-article-faq>${itemsHtml()}</aside><article></article>`
	])
		assert.ok(check({ html }).some((error) => error.includes('visible FAQ must match')));
});

test('hidden or script answer fragments cannot complete a truncated visible answer', () => {
	for (const replacement of [
		'Two <span hidden>distinct terms, not interchangeable labels.</span>',
		'Two <script>distinct terms, not interchangeable labels.</script>'
	])
		assert.ok(check({ html: articleHtml().replace(faq[0].answer, replacement) }).length);
});

test('schema without authored FAQ, multiple FAQ graphs and the wrong canonical all fail', () => {
	assert.ok(check({ declaredFaq: [], html: '<article></article>' }).length);
	assert.ok(check({ faqPages: [...schema(), ...schema()] }).length);
	assert.ok(check({ pageUrl: `${pageUrl}-other` }).some((error) => error.includes('canonical')));
});

test('malformed schema and multiple question/answer DOM nodes produce clear failures', () => {
	assert.ok(
		check({ faqPages: [{ ...schema()[0], mainEntity: {} }] }).some((error) =>
			error.includes('mainEntity')
		)
	);
	assert.ok(
		check({ faqPages: [{ ...schema()[0], mainEntity: [{ name: faq[0].question }] }] }).some(
			(error) => error.includes('malformed')
		)
	);
	assert.ok(
		check({
			html: articleHtml().replace(
				'<h3 data-faq-question>',
				'<h4 data-faq-question>Duplicate</h4><h3 data-faq-question>'
			)
		}).some((error) => error.includes('exactly one readable question'))
	);
});
