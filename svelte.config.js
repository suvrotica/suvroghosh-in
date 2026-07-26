import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import remarkMath from 'remark-math';
import rehypeBengaliLang from './scripts/lib/rehype-bengali-lang.mjs';
import rehypeKatexSvelte from 'rehype-katex-svelte';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { enrichPostImageMarkup, loadImageManifest } from './scripts/lib/post-image-metadata.mjs';
import { parsePostFrontmatter } from './scripts/lib/post-metadata.mjs';

const imageManifest = loadImageManifest(
	new URL('./scripts/image-optimization-manifest.json', import.meta.url)
);

const globalImports = `
import Pi from '$lib/components/blog/PostImage.svelte';
import Yt from '$lib/components/blog/YouTube.svelte';
import Yc from '$lib/components/blog/YtCredit.svelte';
import Dl from '$lib/components/blog/Doggerel.svelte';
import TTS from '$lib/components/blog/TTS.svelte';
import ChatterboxTTS from '$lib/components/tts/ChatterboxTTS.svelte';
import Vid from '$lib/components/blog/PostVideo.svelte';
import Notebook from '$lib/components/blog/Notebook.svelte';
`;

const autoImport = {
	name: 'auto-import',
	markup: ({ content, filename }) => {
		if (!filename || !filename.endsWith('.md')) return;
		const metadata = parsePostFrontmatter(content, filename);
		const thumbnailAlt =
			typeof metadata.thumbnailAlt === 'string' ? metadata.thumbnailAlt.trim() : '';
		const title = typeof metadata.title === 'string' ? metadata.title.trim() : '';
		const enrichedContent = enrichPostImageMarkup(content, imageManifest, {
			// Authored visual descriptions win. Legacy posts receive a useful title-based fallback;
			// validate:seo requires thumbnailAlt whenever a post is newly published or updated.
			leadAlt: thumbnailAlt || title
		});
		if (enrichedContent.includes('<script>')) {
			return { code: enrichedContent.replace('<script>', `<script>\n${globalImports}`) };
		}
		return { code: enrichedContent + `\n<script>\n${globalImports}\n</script>` };
	}
};

function rehypeSquareBrackets() {
	return (tree) => {
		function walk(node) {
			// Skip code blocks, inline code, and links to avoid altering their contents
			if (node.tagName === 'code' || node.tagName === 'pre' || node.tagName === 'a') return;

			if (node.children) {
				for (let i = 0; i < node.children.length; i++) {
					const child = node.children[i];

					// Look for text nodes containing '['
					if (child.type === 'text' && child.value && child.value.includes('[')) {
						// Split by [...] keeping the bracketed text intact in the array
						const parts = child.value.split(/(\[.*?\])/);

						const newNodes = parts
							.map((part) => {
								// If the chunk is our bracketed text, wrap it in a styled span
								if (part.startsWith('[') && part.endsWith(']')) {
									return {
										type: 'element',
										tagName: 'span',
										// Changed to muted grays to sink closer into the background
										properties: {
											className: ['font-semibold', 'text-neutral-400', 'dark:text-neutral-500']
										},
										children: [{ type: 'text', value: part }]
									};
								}
								// Otherwise, leave it as normal text
								return { type: 'text', value: part };
							})
							.filter((n) => n.type !== 'text' || n.value !== ''); // Drop empty string nodes

						// Replace the original text node with our new mixed nodes
						node.children.splice(i, 1, ...newNodes);
						i += newNodes.length - 1; // Adjust loop index after splice
					} else {
						walk(child); // Recursively walk down the AST
					}
				}
			}
		}
		walk(tree);
	};
}

function rehypeDemotePostH1() {
	return (tree) => {
		function walk(node) {
			if (node.tagName === 'h1') {
				node.tagName = 'h2';
			}
			if (node.children) {
				for (const child of node.children) {
					walk(child);
				}
			}
		}
		walk(tree);
	};
}

function headingText(node) {
	if (node.type === 'text') return node.value ?? '';
	if (!node.children) return '';
	return node.children.map(headingText).join('');
}

function rehypeCollectHeadings() {
	return (tree, vFile) => {
		const headings = [];

		function walk(node) {
			if (node.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
				const id = typeof node.properties?.id === 'string' ? node.properties.id : '';
				const text = headingText(node).replace(/\s+/g, ' ').trim();
				if (id && text) {
					headings.push({ id, text, level: Number(node.tagName.slice(1)) });
				}
			}

			if (node.children) {
				for (const child of node.children) walk(child);
			}
		}

		walk(tree);
		if (vFile.data.fm) vFile.data.fm.headings = headings;
	};
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [
		autoImport,
		vitePreprocess(),
		mdsvex({
			extensions: ['.md'],
			remarkPlugins: [remarkMath],
			rehypePlugins: [
				rehypeSlug,
				[rehypeAutolinkHeadings, { behavior: 'wrap' }],
				rehypeKatexSvelte,
				rehypeDemotePostH1,
				rehypeCollectHeadings,
				rehypeBengaliLang,
				rehypeSquareBrackets // 2. Inject the custom plugin here
			]
		})
	],
	extensions: ['.svelte', '.md'],
	kit: {
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self', 'https://va.vercel-scripts.com'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:', 'https:'],
				'font-src': ['self', 'data:'],
				'connect-src': [
					'self',
					'https://*.supabase.co',
					'wss://*.supabase.co',
					'https://va.vercel-scripts.com',
					'https://vitals.vercel-insights.com'
				],
				'worker-src': ['self', 'blob:'],
				'frame-src': ['self', 'https://www.youtube.com'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none']
			}
		},
		prerender: {
			handleHttpError: ({ path, message }) => {
				// Vercel provides this optimizer endpoint after deployment, not during prerender crawling.
				if (path === '/_vercel/image') return;
				throw new Error(message);
			}
		},
		adapter: adapter({
			images: {
				// Keep in sync with RESPONSIVE_WIDTHS in PostImage.svelte.
				sizes: [320, 480, 640, 768, 960, 1200, 1600, 1920],
				domains: [],
				formats: ['image/webp'],
				minimumCacheTTL: 2678400
			}
		})
	}
};

export default config;
