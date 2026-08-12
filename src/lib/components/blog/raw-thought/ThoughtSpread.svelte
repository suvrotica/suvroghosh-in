<script lang="ts">
	import { getContext } from 'svelte';
	import {
		THOUGHT_FOLIO_CONTEXT,
		type ThoughtFolioContext,
		type ThoughtFolioChildren
	} from './thought-folio-context';

	let { id, children }: ThoughtFolioChildren & { id: string } = $props();
	const { manifest } = getContext<ThoughtFolioContext>(THOUGHT_FOLIO_CONTEXT);
	let spread = $derived.by(() => {
		const match = manifest.spreads.find((candidate) => candidate.id === id);
		if (!match) throw new Error(`Unknown thought-folio spread: ${id}`);
		return match;
	});
</script>

<section
	class="thought-spread"
	id={spread.id}
	data-spread={spread.number}
	data-tone={spread.tone}
	aria-label={`${spread.number}. ${spread.title}`}
>
	<div class="thought-spread__rail" aria-hidden="true" data-tts-exclude>
		<span>{manifest.issue}</span>
		<span>{spread.number}</span>
		<span>{spread.kicker}</span>
	</div>
	<div class="thought-spread__leaves">
		{@render children()}
	</div>
</section>
