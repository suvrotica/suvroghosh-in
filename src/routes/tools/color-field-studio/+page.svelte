<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
	import ColorFieldStudio from '$lib/components/visualizations/color-field-studio/ColorFieldStudio.svelte';
</script>

<SEO
	title="Color Field Painting — Color, Edges, and Space — Interactive Painting Studio | Suvro Ghosh"
	description="Generate deterministic non-figurative Color Field paintings over woven cotton-duck canvas. Adjust color areas, area size, edge softness, and paint transparency, inspect the canvas weave close up, and export a 4096 px PNG."
	canonicalUrl={`${siteUrl}/tools/color-field-studio`}
	ogImageUrl={`${siteUrl}/images/visualizations/color-field-studio/social.png`}
	ogImageAlt="A non-figurative Color Field painting on warm unbleached cotton-duck canvas showing softly feathered horizontal areas of charcoal umber, Venetian maroon, and pale gold haze layered with translucent glazes."
	ogImageWidth={1200}
	ogImageHeight={630}
/>
<ColorFieldStudio />
