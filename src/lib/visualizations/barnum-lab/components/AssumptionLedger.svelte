<script lang="ts">
	import type { LedgerGroup, LedgerRow } from './ui-types';

	const GROUPS: readonly { id: LedgerGroup; label: string; note: string }[] = [
		{
			id: 'demo-defaults',
			label: 'Demo starting values',
			note: 'Prefilled by the page and not yet confirmed.'
		},
		{
			id: 'selected',
			label: 'You explicitly selected',
			note: 'Choices you touched or confirmed.'
		},
		{
			id: 'unknowns',
			label: 'The machine has not learned',
			note: 'No observation or validated personality model supplies these facts.'
		}
	];

	let {
		rows,
		revealed = false,
		canUseDemoValues = false,
		onusedemovalues
	}: {
		rows: readonly LedgerRow[];
		revealed?: boolean;
		canUseDemoValues?: boolean;
		onusedemovalues?: () => void;
	} = $props();

	function rowsFor(group: LedgerGroup): readonly LedgerRow[] {
		return rows.filter((row) => row.group === group);
	}

	function valueFor(id: string, fallback: string): string {
		return rows.find((row) => row.id === id)?.value ?? fallback;
	}
</script>

<section class="ledger" aria-labelledby="barnum-ledger-heading" data-testid="assumption-ledger">
	<header>
		<div>
			<p class="eyebrow">Visible before the reading</p>
			<h2 id="barnum-ledger-heading">What the page is assuming</h2>
		</div>
		<p class="privacy-chip"><span aria-hidden="true"></span>Current tab memory only</p>
	</header>

	{#if revealed}
		<div class="wide-ledger" aria-label="Assumptions in play">
			{#each GROUPS as group (group.id)}
				<section aria-labelledby={`ledger-${group.id}`}>
					<div class="group-heading">
						<h3 id={`ledger-${group.id}`}>{group.label}</h3>
						<p>{group.note}</p>
					</div>
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									<th scope="col">Current item</th>
									<th scope="col">Value</th>
									<th scope="col">Origin</th>
									<th scope="col">Permitted use</th>
								</tr>
							</thead>
							<tbody>
								{#each rowsFor(group.id) as row (row.id)}
									<tr>
										<th scope="row">{row.label}</th>
										<td>{row.value}</td>
										<td>{row.origin}</td>
										<td>{row.useAfterReveal ?? row.permittedUse}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			{/each}
		</div>

		<div class="narrow-ledger">
			{#each GROUPS as group (group.id)}
				<section aria-labelledby={`ledger-mobile-${group.id}`}>
					<div class="group-heading">
						<h3 id={`ledger-mobile-${group.id}`}>{group.label}</h3>
						<p>{group.note}</p>
					</div>
					<dl>
						{#each rowsFor(group.id) as row (row.id)}
							<div>
								<dt>{row.label}</dt>
								<dd class="value">{row.value}</dd>
								<dd><strong>Origin:</strong> {row.origin}</dd>
								<dd><strong>Use:</strong> {row.useAfterReveal ?? row.permittedUse}</dd>
							</div>
						{/each}
					</dl>
				</section>
			{/each}
		</div>

		<p class="unknown-line">
			The page still does not know your character, motives, intelligence, health, relationships,
			history, beliefs, or private behavior.
		</p>
	{:else}
		<div class="summary-ledger">
			<div class="summary-copy">
				<p>
					{valueFor('country', 'India')} <strong>(demo value)</strong> · {valueFor(
						'city_context',
						'Kolkata'
					)} <strong>(demo value)</strong> · {valueFor('language', 'Bengali + English')}
					<strong>(demo value)</strong>
				</p>
				<p>Age not given · Gender not given · No name · no lookup · nothing saved</p>
			</div>
			<div class="summary-actions">
				<details>
					<summary>See the full assumption list</summary>
					<ul>
						{#each rows as row (row.id)}
							<li><strong>{row.label}:</strong> {row.value} <span>({row.origin})</span></li>
						{/each}
					</ul>
				</details>
				{#if canUseDemoValues && rows.some((row) => row.group === 'demo-defaults') && onusedemovalues}
					<button type="button" data-testid="barnum-use-demo-values" onclick={onusedemovalues}>
						Use the shown demo values
					</button>
				{/if}
			</div>
		</div>
	{/if}
</section>
