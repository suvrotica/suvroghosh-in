<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
	import MondrianStudio from '$lib/components/visualizations/mondrian-studio/MondrianStudio.svelte';
</script>

<SEO
	title="Piet Mondrian: A Pioneer of Abstract Art — Interactive Painting Studio | Suvro Ghosh"
	description="Explore how Piet Mondrian shaped geometric abstraction by adjusting proportions, primary color balance, line weight, and oil brushwork in a fullscreen studio."
	canonicalUrl={`${siteUrl}/tools/mondrian-studio`}
	ogImageUrl={`${siteUrl}/images/visualizations/mondrian-studio/social.png`}
	ogImageAlt="A procedurally painted composition of fourteen warm-white, red, yellow, and blue rectangles separated by near-black horizontal and vertical boundaries with directional oil brushwork."
	ogImageWidth={1200}
	ogImageHeight={630}
/>
<MondrianStudio />
