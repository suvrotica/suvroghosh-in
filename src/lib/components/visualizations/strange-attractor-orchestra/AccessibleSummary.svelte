<script lang="ts">
	type Row = { label: string; value: string };
	type Props = {
		status: string;
		rows?: readonly Row[];
	};

	let { status, rows = [] }: Props = $props();
</script>

<section class="accessible-summary" aria-labelledby="sa-accessible-title">
	<h3 id="sa-accessible-title">Text view of the instrument</h3>
	<p>{status}</p>
	<table>
		<caption>Low-rate state summary</caption>
		<tbody>
			{#each rows as row (row.label)}
				<tr><th scope="row">{row.label}</th><td>{row.value}</td></tr>
			{/each}
		</tbody>
	</table>
	<details>
		<summary>Read the complete orbit → weather → voice mapping</summary>
		<ul>
			<li>Crossings and registered extrema excite notes or resonators.</li>
			<li>Return intervals shape rhythm and decay; region changes choose pitch direction.</li>
			<li>Speed changes compressed intensity; curvature brightens and sharpens the attack.</li>
			<li>Local stretching lifts filter brightness and controlled harmonic tension.</li>
			<li>Near recurrence brings back an earlier motif; density thickens the texture.</li>
			<li>Noise value colours the resonator; its gradient shapes breath and crackle.</li>
			<li>Curl direction moves gently through stereo; a cellular boundary makes an accent.</li>
		</ul>
	</details>
</section>

<style>
	.accessible-summary {
		border: 1px solid rgb(222 217 199 / 15%);
		border-radius: 0.5rem;
		background: #080d0f;
		padding: 1rem;
	}

	h3 {
		margin: 0 0 0.35rem;
		color: #e8e3d6;
		font: 700 0.95rem/1.3 var(--font-sans, sans-serif);
	}

	p,
	li,
	table,
	summary {
		font: 0.72rem/1.55 var(--font-sans, sans-serif);
	}

	p {
		margin: 0 0 0.75rem;
		color: #a9aeaa;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		color: #c7c5bb;
	}

	caption {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}

	th,
	td {
		border-bottom: 1px solid rgb(222 217 199 / 10%);
		padding: 0.35rem 0;
		text-align: left;
	}

	th {
		width: 42%;
		color: #7e8a87;
		font-weight: 600;
	}

	details {
		margin-top: 0.7rem;
	}

	summary {
		min-height: 2.75rem;
		padding-block: 0.65rem;
		color: #82cdd0;
		font-weight: 700;
		cursor: pointer;
	}

	ul {
		margin: 0.4rem 0 0;
		padding-left: 1.2rem;
		color: #aaa99f;
	}
</style>
