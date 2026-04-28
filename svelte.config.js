import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import remarkMath from 'remark-math';
import rehypeKatexSvelte from 'rehype-katex-svelte';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

const globalImports = `
import Pi from '$lib/components/blog/PostImage.svelte';
import Yt from '$lib/components/blog/YouTube.svelte';
import Yc from '$lib/components/blog/YtCredit.svelte';
import Dl from '$lib/components/blog/Doggerel.svelte';
import TTS from '$lib/components/blog/TTS.svelte';
import Vid from '$lib/components/blog/Vid.svelte';
`;

const autoImport = {
	name: 'auto-import',
	markup: ({ content, filename }) => {
		if (!filename || !filename.endsWith('.md')) return;
		if (content.includes('<script>')) {
			return { code: content.replace('<script>', `<script>\n${globalImports}`) };
		}
		return { code: content + `\n<script>\n${globalImports}\n</script>` };
	}
};

// 1. Define a custom rehype plugin to darken text inside square brackets
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
						
						const newNodes = parts.map(part => {
							// If the chunk is our bracketed text, wrap it in a styled span
							if (part.startsWith('[') && part.endsWith(']')) {
								return {
		type: 'element',
		tagName: 'span',
		// Changed to muted grays to sink closer into the background
		properties: { className: ['font-semibold', 'text-neutral-400', 'dark:text-neutral-600'] },
		children: [{ type: 'text', value: part }]
	};
							}
							// Otherwise, leave it as normal text
							return { type: 'text', value: part };
						}).filter(n => n.type !== 'text' || n.value !== ''); // Drop empty string nodes
						
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

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [
		autoImport,
		vitePreprocess(),
		mdsvex({
			extensions: ['.md', '.svx'],
			remarkPlugins: [remarkMath],
			rehypePlugins: [
				rehypeSlug,
				[rehypeAutolinkHeadings, { behavior: 'wrap' }],
				rehypeKatexSvelte,
				rehypeSquareBrackets // 2. Inject the custom plugin here
			]
		})
	],
	extensions: ['.svelte', '.md', '.svx'],
	kit: {
		adapter: adapter(),
		alias: {
			$components: 'src/lib/components',
			$assets: 'src/lib/assets'
		}
	}
};

export default config;
