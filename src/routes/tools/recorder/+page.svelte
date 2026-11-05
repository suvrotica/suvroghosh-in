<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
	import RecorderApp from '$lib/components/recorder/RecorderApp.svelte';
</script>

<SEO
	title="Recorder — Personal Audio Studio & Sound Enhancer | Suvro Ghosh"
	description="Record speech, music, or ambience locally, reduce background fan noise and hum while keeping the original safe, trim non-destructively, and export compact MP4."
	canonicalUrl={`${siteUrl}/tools/recorder`}
	ogImageUrl={`${siteUrl}/images/visualizations/recorder/social.png`}
	ogImageAlt="Dark tactile portable audio recorder interface showing a high-contrast waveform, elapsed timecode, rotary enhancement dial, and MP4 export controls."
	ogImageWidth={1200}
	ogImageHeight={760}
/>

<RecorderApp />
