<script lang="ts">
	import {
		STANDARDS_MANIFEST,
		STANDARDS_VERIFIED_LABEL,
		STANDARDS_VERIFIED_ON
	} from '$lib/visualizations/prior-authorization';
</script>

<section class="standards-manifest" aria-labelledby="standards-manifest-heading">
	<h3 id="standards-manifest-heading">Standards manifest</h3>
	<p>
		Verified <time datetime={STANDARDS_VERIFIED_ON}>{STANDARDS_VERIFIED_LABEL}</time> against stable CMS
		and HL7 publications.
	</p>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (A labelled native scroll region must be keyboard-focusable.) -->
	<div class="table-scroll" role="region" aria-label="Standards versions" tabindex="0">
		<table>
			<thead>
				<tr>
					<th scope="col">Reference frame</th>
					<th scope="col">FHIR</th>
					<th scope="col">CRD</th>
					<th scope="col">DTR</th>
					<th scope="col">PAS</th>
					<th scope="col">Status on this page</th>
				</tr>
			</thead>
			<tbody>
				{#each STANDARDS_MANIFEST as row (row.id)}
					<tr data-manifest-row={row.id} data-verified-on={row.verifiedOn}>
						<th scope="row">{row.label}</th>
						<td>{row.fhir}</td>
						<td>{row.crd}</td>
						<td>{row.dtr}</td>
						<td>{row.pas}</td>
						<td>{row.note}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<style>
	.standards-manifest {
		margin-block: 1.5rem;
	}

	h3,
	p {
		margin: 0;
	}

	p {
		margin-top: 0.45rem;
	}

	.table-scroll {
		margin-top: 0.75rem;
		overflow-x: auto;
		overscroll-behavior-inline: contain;
	}

	.table-scroll:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	table {
		width: 100%;
		min-width: 48rem;
		border-collapse: collapse;
		font: 0.82rem/1.45 var(--font-sans, sans-serif);
		color: var(--ink);
	}

	th,
	td {
		border-block: 1px solid var(--rule);
		padding: 0.6rem;
		text-align: left;
		vertical-align: top;
	}

	thead th {
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	tbody th {
		min-width: 13rem;
	}

	td:last-child {
		min-width: 20rem;
	}

	@media (forced-colors: active) {
		th,
		td {
			border-color: CanvasText;
		}
	}
</style>
