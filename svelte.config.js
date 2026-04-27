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
import Vid from '$lib/components/blog/PostVideo.svelte';
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
				rehypeKatexSvelte
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
