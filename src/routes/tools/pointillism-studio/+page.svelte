<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
	import PointillismStudio from '$lib/components/visualizations/pointillism-studio/PointillismStudio.svelte';
</script>

<SEO
	title="Pointillism: San Antonio and Texas in Dots of Color — Interactive Painting Studio | Suvro Ghosh"
	description="Generate everyday San Antonio and Texas Hill Country scenes painted from thousands of individual oil-paint dabs. Inspect dots close up, adjust size and spacing, and export a high-resolution PNG."
	canonicalUrl={`${siteUrl}/tools/pointillism-studio`}
	ogImageUrl={`${siteUrl}/images/visualizations/pointillism-studio/social.png`}
	ogImageAlt="An interpreted San Antonio river path scene painted from thousands of small colored oil dabs showing walkers beside a shaded limestone path, an arched stone bridge, mature bald cypress and live oak trees, and reflected river water."
	ogImageWidth={1200}
	ogImageHeight={630}
/>
<PointillismStudio />
