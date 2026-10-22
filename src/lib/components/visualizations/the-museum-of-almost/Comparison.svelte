<script lang="ts">
	import SourceReferences from './SourceReferences.svelte';
	import {
		DEMONSTRATION_LABEL,
		type OnwardLink,
		type Specimen,
		type Target
	} from '$lib/visualizations/the-museum-of-almost/model';
	let { record, link, target }: { record: Specimen; link: OnwardLink; target: Target } = $props();
</script>

<section class="ma-comparison" aria-label="Supported connector comparison">
	<p class="ma-demonstration">
		{record.contentStatus === 'demonstration' || target.contentStatus === 'demonstration'
			? DEMONSTRATION_LABEL
			: 'Verified comparison — see source evidence'}
	</p>
	<div class="ma-connector-bench">
		<div>
			<span class="ma-kicker">ORIGINAL</span><svg
				viewBox="0 0 220 125"
				role="img"
				aria-label="Two matching-looking rectangular connectors can be confused"
				><title
					>Original {record.contentStatus === 'demonstration' ? 'fictional' : 'verified'} connector</title
				><path class="ma-detail-side" d="M25 32h66l12 12v54H37L25 86Z" /><path
					class="ma-detail-top"
					d="m25 32 12 12h66L91 32Z"
				/><path class="ma-detail-face" d="M37 44h66v54H37Z" /><path
					class="ma-detail-socket"
					d="M54 59h31v22H54Z"
				/><path class="ma-detail-side" d="M125 32h66l12 12v54h-66l-12-12Z" /><path
					class="ma-detail-top"
					d="m125 32 12 12h66l-12-12Z"
				/><path class="ma-detail-face" d="M137 44h66v54h-66Z" /><path
					class="ma-detail-socket"
					d="M154 59h31v22h-31Z"
				/></svg
			>
			<p>Similar-looking parts leave orientation unclear.</p>
		</div>
		<div>
			<span class="ma-kicker">SPECIFIC REVISION</span><svg
				viewBox="0 0 220 125"
				role="img"
				aria-label="A connector with an offset key and a matching socket fits one way"
				><title
					>Offset keyed {target.contentStatus === 'demonstration' ? 'fictional' : 'verified'} connector
					revision</title
				><path class="ma-detail-side" d="M25 32h66l12 12v54H37L25 86Z" /><path
					class="ma-detail-top"
					d="m25 32 12 12h66L91 32Z"
				/><path class="ma-detail-face" d="M37 44h66v54H37Z" /><path
					class="ma-detail-key"
					d="M54 59h12V49h10v10h9v22H54Z"
				/><path class="ma-detail-side" d="M125 32h66l12 12v54h-66l-12-12Z" /><path
					class="ma-detail-top"
					d="m125 32 12 12h66l-12-12Z"
				/><path class="ma-detail-face" d="M137 44h66v54h-66Z" /><path
					class="ma-detail-key"
					d="M154 59h12V49h10v10h9v22h-31Z"
				/></svg
			>
			<p>The offset key has one matching orientation.</p>
		</div>
	</div>
	<p><strong>Transferred element:</strong> {link.element}.</p>
	<p>
		<strong>{link.status === 'tested' ? '✓ Tested reuse' : link.status}:</strong>
		{target.title}. {target.summary}
	</p>
	{#each link.evidenceIds as id (id)}
		{@const evidence = record.evidence.find((item) => item.id === id)}
		{#if evidence}<p class="ma-source">
				<strong>{evidence.label} · {evidence.status}</strong><br />{evidence.summary}
			</p>
			<SourceReferences {record} {evidence} />{/if}
	{/each}
</section>
