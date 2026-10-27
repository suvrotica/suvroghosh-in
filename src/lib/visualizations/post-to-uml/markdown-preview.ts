import { escapeXml } from './plantuml/security';

function formatSafeInlineMarkdown(escapedLine: string): string {
	let out = escapedLine;

	// Inline code `code`
	out = out.replace(/`([^`]+)`/g, '<code>$1</code>');

	// Safe Markdown links [label](url) - allow only http://, https://, or relative /
	out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, rawUrl: string) => {
		const trimmedUrl = rawUrl.trim();
		if (/^(https?:\/\/|\/[A-Za-z0-9_./#-]*$)/i.test(trimmedUrl)) {
			return `<a href="${trimmedUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
		}
		return `${label}`;
	});

	// Bold **text**
	out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	// Italic *text*
	out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

	return out;
}

export function renderSafeMarkdownPreview(rawMarkdown: string): string {
	const normalized = (rawMarkdown ?? '')
		.replace(/\r\n/g, '\n')
		.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
	if (!normalized.trim()) {
		return '<p class="uml-preview-empty">No article text entered yet.</p>';
	}

	// First escape all raw HTML/Svelte tags so `<script>`, `<svelte:...`, `<img onerror=...>` cannot execute
	const lines = normalized.split('\n');
	const htmlBlocks: string[] = [];

	let inCodeBlock = false;
	let codeBuffer: string[] = [];
	let listBuffer: string[] = [];
	let paragraphBuffer: string[] = [];

	const flushParagraph = () => {
		if (paragraphBuffer.length === 0) return;
		const joined = paragraphBuffer.join(' ');
		paragraphBuffer = [];
		htmlBlocks.push(`<p>${formatSafeInlineMarkdown(escapeXml(joined))}</p>`);
	};

	const flushList = () => {
		if (listBuffer.length === 0) return;
		const items = listBuffer
			.map((item) => `<li>${formatSafeInlineMarkdown(escapeXml(item))}</li>`)
			.join('');
		listBuffer = [];
		htmlBlocks.push(`<ul>${items}</ul>`);
	};

	for (const rawLine of lines) {
		const trimmed = rawLine.trim();

		if (trimmed.startsWith('```')) {
			flushParagraph();
			flushList();
			if (inCodeBlock) {
				htmlBlocks.push(`<pre><code>${escapeXml(codeBuffer.join('\n'))}</code></pre>`);
				codeBuffer = [];
				inCodeBlock = false;
			} else {
				inCodeBlock = true;
			}
			continue;
		}

		if (inCodeBlock) {
			codeBuffer.push(rawLine);
			continue;
		}

		if (!trimmed) {
			flushParagraph();
			flushList();
			continue;
		}

		const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
		if (headingMatch) {
			flushParagraph();
			flushList();
			const level = Math.min(4, Math.max(2, headingMatch[1].length + 1));
			htmlBlocks.push(
				`<h${level}>${formatSafeInlineMarkdown(escapeXml(headingMatch[2].trim()))}</h${level}>`
			);
			continue;
		}

		const listMatch = trimmed.match(/^(?:[-*+]|\d+\.)\s+(.+)$/);
		if (listMatch) {
			flushParagraph();
			listBuffer.push(listMatch[1].trim());
			continue;
		}

		if (trimmed.startsWith('>')) {
			flushParagraph();
			flushList();
			const quoteBody = trimmed.replace(/^>\s*/, '');
			htmlBlocks.push(
				`<blockquote><p>${formatSafeInlineMarkdown(escapeXml(quoteBody))}</p></blockquote>`
			);
			continue;
		}

		flushList();
		paragraphBuffer.push(trimmed);
	}

	if (inCodeBlock && codeBuffer.length > 0) {
		htmlBlocks.push(`<pre><code>${escapeXml(codeBuffer.join('\n'))}</code></pre>`);
	}
	flushParagraph();
	flushList();

	return htmlBlocks.join('\n');
}
