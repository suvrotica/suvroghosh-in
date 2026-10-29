import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const validator = fileURLToPath(new URL('./validate-content.mjs', import.meta.url));
const article = {
	title: 'A useful interoperability explanation',
	description: 'An explanation of healthcare data exchange and the agreements between systems.',
	date: '2026-04-25',
	dateModified: '2026-10-30',
	category: 'Healthcare IT',
	tags: ['Interoperability'],
	published: true
};
const question = {
	question: 'Does a shared format guarantee shared meaning?',
	answer: 'No. Systems still need shared terminology and workflow agreements.'
};

function validate(metadata) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suvro-content-validation-'));
	try {
		const postsDirectory = path.join(directory, 'src/lib/posts');
		const contentDirectory = path.join(directory, 'src/lib/content');
		fs.mkdirSync(postsDirectory, { recursive: true });
		fs.mkdirSync(contentDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(contentDirectory, 'sections.json'),
			JSON.stringify({
				sections: {
					technology: 'Technology',
					science: 'Science',
					fiction: 'Fiction',
					life: 'Life',
					art: 'Art',
					play: 'Play'
				},
				legacyCategoryToSection: { 'healthcare-it': 'technology', fiction: 'fiction' },
				postSectionOverrides: {}
			})
		);
		fs.writeFileSync(
			path.join(postsDirectory, 'article.md'),
			`---\n${JSON.stringify(metadata)}\n---\nThe original article remains useful on its own.\n`
		);
		return spawnSync(process.execPath, [validator], {
			cwd: directory,
			encoding: 'utf8',
			windowsHide: true
		});
	} finally {
		const actual = fs.realpathSync(directory);
		const temporaryRoot = fs.realpathSync(os.tmpdir());
		assert.equal(path.dirname(actual), temporaryRoot);
		assert.ok(path.basename(actual).startsWith('suvro-content-validation-'));
		fs.rmSync(actual, { recursive: true, force: true });
	}
}

for (const [name, optionalFields] of [
	['no answer metadata', {}],
	['empty optional collections', { keyTerms: [], faq: [] }],
	['a summary alone', { inPlainEnglish: 'Shared formats still require shared meaning.' }],
	['one key term alone', { keyTerms: ['Interoperability'] }],
	['one FAQ alone', { faq: [question] }],
	[
		'a short authored answer section',
		{
			inPlainEnglish: 'Shared formats still require shared meaning.',
			keyTerms: ['Interoperability', 'Terminology'],
			faq: [question]
		}
	]
]) {
	test(`an updated healthcare article accepts ${name}`, () => {
		const result = validate({ ...article, ...optionalFields });
		assert.equal(result.error, undefined);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Content validation passed: 1 files checked/);
	});
}

test('a fiction article does not require answer metadata', () => {
	const result = validate({ ...article, category: 'Fiction' });
	assert.equal(result.status, 0, result.stderr);
});

for (const [name, optionalFields, expectedError] of [
	['a non-string summary', { inPlainEnglish: 4 }, /inPlainEnglish must be a non-empty string/],
	['a null summary', { inPlainEnglish: null }, /inPlainEnglish must be a non-empty string/],
	['an empty summary', { inPlainEnglish: ' ' }, /inPlainEnglish must be a non-empty string/],
	[
		'a padded summary',
		{ inPlainEnglish: ' A summary ' },
		/inPlainEnglish has surrounding whitespace/
	],
	['non-array key terms', { keyTerms: 'FHIR' }, /keyTerms must be an array of strings/],
	['null key terms', { keyTerms: null }, /keyTerms must be an array of strings/],
	['a non-string key term', { keyTerms: [4] }, /keyTerms\[0\] must be a non-empty string/],
	['an empty key term', { keyTerms: [' '] }, /keyTerms\[0\] must be a non-empty string/],
	['a padded key term', { keyTerms: [' FHIR '] }, /keyTerms\[0\] has surrounding whitespace/],
	['duplicate key terms', { keyTerms: ['FHIR', 'fhir'] }, /keyTerms contains the duplicate value/],
	['a non-array FAQ', { faq: question }, /faq must be an array/],
	['a null FAQ', { faq: null }, /faq must be an array/],
	['a non-object FAQ entry', { faq: ['Question'] }, /faq\[0\] must contain non-empty/],
	['a null FAQ entry', { faq: [null] }, /faq\[0\] must contain non-empty/],
	['a missing FAQ answer', { faq: [{ question: 'Question?' }] }, /faq\[0\] must contain non-empty/],
	[
		'a non-string FAQ answer',
		{ faq: [{ ...question, answer: 4 }] },
		/faq\[0\] must contain non-empty/
	],
	[
		'a blank FAQ question',
		{ faq: [{ ...question, question: ' ' }] },
		/faq\[0\] must contain non-empty/
	],
	['a blank FAQ answer', { faq: [{ ...question, answer: '' }] }, /faq\[0\] must contain non-empty/]
]) {
	test(`supplied answer metadata rejects ${name}`, () => {
		const result = validate({ ...article, ...optionalFields });
		assert.equal(result.status, 1, result.stdout);
		assert.match(result.stderr, expectedError);
	});
}

test('optional answer sections do not relax required article metadata', () => {
	const withoutTitle = { ...article };
	delete withoutTitle.title;
	const result = validate(withoutTitle);
	assert.equal(result.status, 1, result.stdout);
	assert.match(result.stderr, /missing required frontmatter field “title”/);
});

test('optional answer sections do not relax editorial date validation', () => {
	const result = validate({ ...article, dateModified: '2026-04-24' });
	assert.equal(result.status, 1, result.stdout);
	assert.match(result.stderr, /dateModified must not be earlier than date/);
});
