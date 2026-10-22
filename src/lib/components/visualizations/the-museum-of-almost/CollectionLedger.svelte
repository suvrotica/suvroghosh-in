<script lang="ts">
	import { ARCHIVE } from '$lib/visualizations/the-museum-of-almost/fixtures';
	import { collectionTally } from '$lib/visualizations/the-museum-of-almost/model';
	const tally = collectionTally(ARCHIVE);
</script>

<div class="ma-static-ledger">
	<span class="ma-kicker">THE COLLECTION</span>
	<p>
		<strong>{tally.total}</strong>
		{tally.demonstration === tally.total ? 'fictional cases' : tally.total === 1 ? 'case' : 'cases'}
	</p>
	{#if tally.verified > 0}
		<p><strong>{tally.verified}</strong> verified {tally.verified === 1 ? 'record' : 'records'}</p>
		{#if tally.demonstration > 0}<p>
				<strong>{tally.demonstration}</strong> fictional demonstration {tally.demonstration === 1
					? 'record'
					: 'records'}
			</p>{/if}
	{/if}
	<p><strong>{tally.testedReuse}</strong> tested reuse</p>
	<p>
		<strong>{tally.untestedPossibilities}</strong> untested {tally.untestedPossibilities === 1
			? 'possibility'
			: 'possibilities'}
	</p>
	<p>
		<strong>{tally.withoutDemonstratedReuse}</strong>
		{tally.withoutDemonstratedReuse === 1 ? 'record' : 'records'} without demonstrated reuse
	</p>
</div>
