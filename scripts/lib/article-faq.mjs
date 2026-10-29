import { parseHTML } from 'linkedom';

const nonContentElements = new Set([
	'SCRIPT',
	'STYLE',
	'TEMPLATE',
	'NOSCRIPT',
	'HEAD',
	'META',
	'LINK'
]);

/** Normalize presentation whitespace, preserving the actual wording and punctuation. */
function normalizeText(value) {
	return String(value).normalize('NFC').replace(/\s+/gu, ' ').trim();
}

function isExcluded(element) {
	if (nonContentElements.has(element.tagName)) return true;
	if (element.hasAttribute('hidden') || element.hasAttribute('inert')) return true;
	if (element.getAttribute('aria-hidden')?.toLowerCase() === 'true') return true;
	if (['hidden', 'invisible', 'sr-only'].some((name) => element.classList.contains(name)))
		return true;
	return /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|content-visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0*)?)\s*(?:!important\s*)?(?:;|$)/i.test(
		element.getAttribute('style') ?? ''
	);
}

function isReaderContent(element) {
	for (let current = element; current; current = current.parentElement) {
		if (isExcluded(current)) return false;
	}
	return true;
}

function readerText(node) {
	if (node.nodeType === 3) return node.textContent ?? '';
	if (node.nodeType !== 1 || isExcluded(node)) return '';
	if (node.tagName === 'BR') return ' ';
	return [...node.childNodes].map(readerText).join('');
}

/**
 * Check the authored FAQ against article DOM and the parsed JSON-LD graph.
 * Native details content is allowed: readers can reveal it without JavaScript.
 * This detects explicit HTML hiding; browser tests cover stylesheet visibility.
 * Markers identify existing content and never add a second copy for crawlers.
 */
export function validateArticleFaq({ html, declaredFaq = [], faqPages = [], pageUrl }) {
	const errors = [];
	const { document } = parseHTML(html);
	const items = [...document.querySelectorAll('article [data-article-faq] [data-faq-item]')].filter(
		isReaderContent
	);
	const visibleFaq = items.map((item, index) => {
		const read = (field) => {
			const matches = [...item.querySelectorAll(`[data-faq-${field}]`)].filter(isReaderContent);
			if (matches.length !== 1) {
				errors.push(`visible FAQ ${index + 1} must contain exactly one readable ${field}.`);
				return '';
			}
			return normalizeText(readerText(matches[0]));
		};
		return { question: read('question'), answer: read('answer') };
	});
	const authoredFaq = declaredFaq.map((item) => ({
		question: normalizeText(item.question),
		answer: normalizeText(item.answer)
	}));

	if (faqPages.length !== (authoredFaq.length ? 1 : 0)) {
		errors.push(
			`expected ${authoredFaq.length ? 'one' : 'no'} FAQPage entity for the authored FAQ; found ${faqPages.length}.`
		);
	}
	const schemaFaq = [];
	for (const page of faqPages) {
		if (page['@id'] !== `${pageUrl}#faq` || page.isPartOf?.['@id'] !== pageUrl) {
			errors.push('FAQPage identity and isPartOf must reference the canonical article URL.');
		}
		if (!Array.isArray(page.mainEntity)) {
			errors.push('FAQPage.mainEntity must be an array of questions.');
			continue;
		}
		for (const item of page.mainEntity) {
			if (
				item?.['@type'] !== 'Question' ||
				typeof item.name !== 'string' ||
				item.acceptedAnswer?.['@type'] !== 'Answer' ||
				typeof item.acceptedAnswer.text !== 'string'
			) {
				errors.push('FAQPage contains a malformed question or accepted answer.');
				continue;
			}
			schemaFaq.push({
				question: normalizeText(item.name),
				answer: normalizeText(item.acceptedAnswer.text)
			});
		}
	}
	for (const [label, entries] of [
		['authored', authoredFaq],
		['visible', visibleFaq],
		['schema', schemaFaq]
	]) {
		if (entries.some((item) => !item.question || !item.answer)) {
			errors.push(`${label} FAQ contains an empty question or answer.`);
		}
		if (new Set(entries.map((item) => item.question)).size !== entries.length) {
			errors.push(`${label} FAQ contains duplicate questions.`);
		}
	}
	for (const [label, entries] of [
		['visible', visibleFaq],
		['schema', schemaFaq]
	]) {
		if (JSON.stringify(entries) !== JSON.stringify(authoredFaq)) {
			errors.push(
				`${label} FAQ must match the authored ordered questions and answers exactly (authored ${authoredFaq.length}, ${label} ${entries.length}).`
			);
		}
	}
	return errors;
}
