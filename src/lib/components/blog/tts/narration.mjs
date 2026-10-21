/** Increment when the reading/extraction contract changes. Shared by the player and offline CLI. */
export const NARRATION_VERSION = 1;

/**
 * Extract the same deterministic text from SSR and the hydrated article. Keep this function
 * self-contained: the offline generator also passes it directly to Playwright's page.evaluate.
 * CSS visibility is intentionally ignored; responsive folios retain their authored DOM order.
 * @param {ParentNode} root
 * @returns {string}
 */
export function extractNarration(root = document) {
	const region =
		root instanceof Element && root.matches('[data-article-reading-region], .prose')
			? root
			: (root.querySelector('[data-article-reading-region]') ?? root.querySelector('.prose'));
	if (!region) return '';
	const excluded =
		'[data-tts-exclude], .no-read, [hidden], [aria-hidden="true"], [inert], button, nav, aside, audio, video, iframe, script, style, noscript, pre, code, kbd, samp, svg, canvas, input, select, textarea, [role="application"]';
	const blocks = new Set([
		'ADDRESS',
		'ARTICLE',
		'BLOCKQUOTE',
		'DIV',
		'DL',
		'DT',
		'DD',
		'FIGCAPTION',
		'FIGURE',
		'H1',
		'H2',
		'H3',
		'H4',
		'H5',
		'H6',
		'LI',
		'OL',
		'P',
		'SECTION',
		'TABLE',
		'TR',
		'UL'
	]);
	/** @type {string[]} */
	const parts = [];
	/** @param {Node} node */
	function visit(node) {
		if (node.nodeType === 3) {
			parts.push((node.textContent ?? '').replace(/\s+/gu, ' '));
			return;
		}
		if (!(node instanceof Element) || node.matches(excluded)) return;
		if (node.tagName === 'BR' || node.tagName === 'HR') {
			parts.push('\n\n');
			return;
		}
		const block = blocks.has(node.tagName);
		if (block) parts.push('\n\n');
		for (const child of node.childNodes) visit(child);
		if (block) parts.push('\n\n');
	}
	visit(region);
	return parts
		.join('')
		.split(/\n+/u)
		.map((part) => part.replace(/\s+/gu, ' ').trim())
		.filter(Boolean)
		.join('\n\n');
}

/** @param {string} text @returns {Promise<string>} */
export async function hashNarration(text) {
	const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
		''
	);
}
