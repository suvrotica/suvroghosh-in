<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import SplatStudio from '$lib/components/visualizations/splat-studio/SplatStudio.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
</script>

<SEO
	title="Splat Studio — A Playground for Colour & Form | Suvro Ghosh"
	description="Sculpt luminous, colourful 3D splats. Explore six procedural worlds, tune every detail, share a reproducible scene and export your own artwork."
	canonicalUrl={`${siteUrl}/tools/splat-studio`}
	ogImageUrl={`${siteUrl}/images/visualizations/splat-studio/social.png`}
	ogImageAlt="Luminous cyan, violet, pink and gold splats form the interwoven ribbons of Aurora Knot in Splat Studio."
	ogImageWidth={1136}
	ogImageHeight={730}
/>
<SplatStudio />
