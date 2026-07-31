<script lang="ts">
	import type { CityResult } from '$lib/visualizations/city-master-plan';

	type Props = {
		result: CityResult | null;
		actionStatus: string;
		oncopyurl: () => void;
		onshare: () => void;
		onpng: (kind: 'social' | 'map') => void;
		onjson: () => void;
		oncopyreport: () => void;
		onchallenge: (kind: 'functional' | 'calamity' | 'anchor') => void;
	};

	let {
		result,
		actionStatus,
		oncopyurl,
		onshare,
		onpng,
		onjson,
		oncopyreport,
		onchallenge
	}: Props = $props();
</script>

<section class="municipal-report" aria-labelledby="municipal-report-heading">
	<div class="heading">
		<div>
			<p>Municipal report</p>
			<h3 id="municipal-report-heading">{result?.cityName ?? 'Awaiting construction'}</h3>
		</div>
		{#if result}
			<code data-testid="city-fingerprint">{result.fingerprint}</code>
		{/if}
	</div>

	{#if result}
		<p class="report">{result.report}</p>
		<dl>
			<div>
				<dt>Seed</dt>
				<dd>{result.seed}</dd>
			</div>
			<div>
				<dt>Anchor</dt>
				<dd>{result.anchor.id.replaceAll('-', ' ')}</dd>
			</div>
			<div>
				<dt>Grid</dt>
				<dd>{result.width} × {result.height}</dd>
			</div>
			<div>
				<dt>Exceptions</dt>
				<dd>{result.municipalPatches.length}</dd>
			</div>
		</dl>

		<div class="actions" role="group" aria-label="Share and export city">
			<button type="button" onclick={oncopyurl}>Copy permanent URL</button>
			<button type="button" onclick={onshare}>Share city</button>
			<button type="button" onclick={() => onpng('social')}>Download social PNG</button>
			<button type="button" onclick={() => onpng('map')}>Download high-res PNG</button>
			<button type="button" onclick={onjson}>Download city JSON</button>
			<button type="button" onclick={oncopyreport}>Copy report</button>
		</div>

		<details class="challenge">
			<summary>Challenge a friend</summary>
			<div role="group" aria-label="Challenge type">
				<button type="button" onclick={() => onchallenge('functional')}>Most functional</button>
				<button type="button" onclick={() => onchallenge('calamity')}>Greatest calamity</button>
				<button type="button" onclick={() => onchallenge('anchor')}
					>Same seed, different anchor</button
				>
			</div>
			<p>Scores are recomputed from the seed. No supplied score and no global leaderboard.</p>
		</details>
	{:else}
		<p class="empty">
			The report will use measured route, frontage, drainage, tram, and exception facts.
		</p>
	{/if}

	<p class="status" role="status" aria-live="polite">{actionStatus}</p>
</section>

<style>
	.municipal-report {
		border: 1px solid var(--rule);
		border-radius: 0.65rem;
		background: var(--paper-raised);
		padding: 0.75rem;
	}
	.heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.65rem;
	}
	.heading p,
	.heading h3,
	.report,
	.empty,
	.status,
	.challenge p {
		margin: 0;
	}
	.heading p {
		margin-bottom: 0.15rem;
		font-family: ui-monospace, monospace;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.heading h3 {
		font-size: 0.9rem;
		color: var(--ink);
	}
	code {
		flex: none;
		border: 1px dashed var(--accent);
		border-radius: 0.3rem;
		background: color-mix(in srgb, var(--accent) 7%, var(--paper));
		padding: 0.28rem 0.4rem;
		font-size: 0.65rem;
		color: var(--accent);
		transform: rotate(-1deg);
	}
	.report {
		margin-top: 0.65rem;
		font-size: 0.74rem;
		line-height: 1.55;
		color: var(--ink);
	}
	dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.35rem 0.65rem;
		margin: 0.65rem 0 0;
		border-top: 1px dotted var(--rule);
		padding-top: 0.55rem;
	}
	dt {
		font-family: ui-monospace, monospace;
		font-size: 0.59rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	dd {
		margin: 0.1rem 0 0;
		overflow-wrap: anywhere;
		font-size: 0.68rem;
		color: var(--ink);
	}
	.actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.42rem;
		margin-top: 0.75rem;
	}
	button {
		min-height: 2.75rem;
		border: 1px solid var(--control-border);
		border-radius: 0.42rem;
		background: var(--paper);
		padding: 0.42rem 0.5rem;
		font: inherit;
		font-size: 0.66rem;
		font-weight: 800;
		color: var(--ink);
		cursor: pointer;
	}
	button:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	button:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.challenge {
		margin-top: 0.7rem;
		border-top: 1px solid var(--rule);
		padding-top: 0.55rem;
	}
	.challenge summary {
		min-height: 2.75rem;
		cursor: pointer;
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--accent);
	}
	.challenge div {
		display: grid;
		gap: 0.4rem;
	}
	.challenge p {
		margin-top: 0.4rem;
		font-size: 0.62rem;
		line-height: 1.35;
		color: var(--ink-muted);
	}
	.empty {
		margin-top: 0.65rem;
		font-size: 0.72rem;
		line-height: 1.5;
		color: var(--ink-muted);
	}
	.status {
		min-height: 1.1rem;
		margin-top: 0.55rem;
		font-family: ui-monospace, monospace;
		font-size: 0.62rem;
		color: var(--ink-muted);
	}
	@media (max-width: 420px) {
		.actions,
		dl {
			grid-template-columns: 1fr;
		}
	}
</style>
