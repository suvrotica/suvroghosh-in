<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
	import PaintingStudio from '$lib/components/visualizations/bengali-impressionism/PaintingStudio.svelte';
	import {
		STUDIO_PATH,
		STUDIO_TITLE
	} from '$lib/visualizations/bengali-impressionism/studio-state';
</script>

<SEO
	title={STUDIO_TITLE + ' | Painting Studio | Suvro Ghosh'}
	description="Paint an ordinary scene from Calcutta and Bengal. Change the brush size, stroke density, light, and edges while the scene stays fixed."
	canonicalUrl={siteUrl + STUDIO_PATH}
	ogImageUrl={siteUrl + '/images/visualizations/bengali-impressionism/street-fine.webp'}
	ogImageAlt="A pedestrian carrying a shopping bag past a produce stall in a painted Calcutta lane"
	ogImageWidth={1200}
	ogImageHeight={800}
/>
<PaintingStudio title={STUDIO_TITLE} />
