<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
	import DripPaintingStudio from '$lib/components/visualizations/drip-painting-studio/DripPaintingStudio.svelte';
</script>

<SEO
	title="Abstract Expressionist Drip Painting: Corruption in India — Interactive Painting Studio | Suvro Ghosh"
	description="Generate deterministic non-figurative Abstract Expressionist drip paintings on unprimed cotton-duck cloth. Vary passes, paint flow, sweep width, and paint layers, inspect dried enamel ridges close up, and export a 4096 px PNG."
	canonicalUrl={`${siteUrl}/tools/drip-painting-studio`}
	ogImageUrl={`${siteUrl}/images/visualizations/drip-painting-studio/social.png`}
	ogImageAlt="A non-figurative Abstract Expressionist drip painting on warm unbleached cotton-duck cloth showing sweeping ribbons, slow-turn matte pools, and spatter droplets in carbon-stamp black, file-tape red, ledger ochre, and chalky lime-whitewash."
	ogImageWidth={1200}
	ogImageHeight={630}
/>
<DripPaintingStudio />
