<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
	import CommLinkRadio from '$lib/components/radio/CommLinkRadio.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SEO
	title="COMM-LINK — Rugged Handheld Audio Conferencing & Push-to-Talk | Suvro Ghosh"
	description="Audio-only WebRTC conferencing and push-to-talk rooms with Google sign-in, explicit microphone controls, and a tactile handheld radio interface."
	canonicalUrl={`${siteUrl}/tools/radio`}
	ogImageUrl={`${siteUrl}/images/visualizations/radio/social.png`}
	ogImageAlt="Rugged charcoal-green and burnt-orange handheld radio interface UNIT-07 with an amber LCD readout, rotary channel selector, orange power switch, and central push-to-talk button."
	ogImageWidth={1200}
	ogImageHeight={630}
	robots="noindex, nofollow, noarchive"
/>

<CommLinkRadio
	initialUser={data.user}
	initialProvider={data.provider}
	allowLocalTestAuth={data.allowLocalTestAuth}
	initialRooms={data.rooms}
	initialPendingInvitation={data.pendingInvitation}
	initialPendingInviteToken={data.pendingInviteToken}
	initialAuthError={data.authError}
/>
