<script lang="ts">
	import { thunderText } from '$lib/visualizations/lightning-atlas/audio/thunder';
	import type { LightningFlash } from '$lib/visualizations/lightning-atlas/types';

	type Props = {
		flash: LightningFlash | null;
		phaseLabel: string;
		playing: boolean;
	};

	let { flash, phaseLabel, playing }: Props = $props();

	const metres = (value: number) =>
		value >= 1_000 ? `${(value / 1_000).toFixed(2)} km` : `${Math.round(value)} m`;
	const title = (value: string) =>
		value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
</script>

<aside class="inspector" aria-labelledby="strike-inspector-heading">
	<div class="heading-row">
		<div>
			<p>Strike inspector</p>
			<h3 id="strike-inspector-heading">
				{flash ? `Flash ${flash.strikeIndex + 1}` : 'No completed flash'}
			</h3>
		</div>
		{#if flash}<code>{flash.channelHash}</code>{/if}
	</div>

	{#if flash}
		<dl>
			<div>
				<dt>Flash family</dt>
				<dd>{title(flash.type)}</dd>
			</div>
			<div>
				<dt>Polarity</dt>
				<dd>
					{flash.type === 'positive-cg'
						? 'Positive'
						: flash.type === 'negative-cg'
							? 'Negative'
							: 'Cloud-to-cloud regions'}
				</dd>
			</div>
			<div>
				<dt>Current phase</dt>
				<dd>{phaseLabel}</dd>
			</div>
			<div>
				<dt>Replay</dt>
				<dd>{playing ? 'Playing' : 'Paused'}</dd>
			</div>
			<div>
				<dt>Attachment</dt>
				<dd>{flash.attachment?.label ?? 'No ground attachment'}</dd>
			</div>
			<div>
				<dt>Attachment type</dt>
				<dd>{flash.attachment ? title(flash.attachment.kind) : 'Not applicable'}</dd>
			</div>
			<div>
				<dt>Elevation</dt>
				<dd>{flash.attachment ? metres(flash.attachment.elevationMetres) : '—'}</dd>
			</div>
			<div>
				<dt>Relative intensity</dt>
				<dd>{Math.round(flash.relativeIntensity * 100)} / 100</dd>
			</div>
			<div>
				<dt>Total channel</dt>
				<dd>{metres(flash.channelLengthMetres)}</dd>
			</div>
			<div>
				<dt>Main channel</dt>
				<dd>{metres(flash.mainChannelLengthMetres)}</dd>
			</div>
			<div>
				<dt>Visible branches</dt>
				<dd>{flash.branchCount}</dd>
			</div>
			<div>
				<dt>Maximum branch depth</dt>
				<dd>{flash.maximumBranchDepth}</dd>
			</div>
			<div>
				<dt>Attempted streamers</dt>
				<dd>{flash.streamers.length}</dd>
			</div>
			<div>
				<dt>Observer distance</dt>
				<dd>{metres(flash.observerDistanceMetres)}</dd>
			</div>
			<div>
				<dt>Thunder delay</dt>
				<dd>{flash.thunderDelaySeconds.toFixed(1)} s</dd>
			</div>
		</dl>

		<div class="narrative">
			<strong>Replay account</strong>
			<p>{flash.narrative}</p>
			<p class="sound-text">Sound alternative: {thunderText(flash)}.</p>
		</div>
	{:else}
		<p class="empty">
			Call a strike to inspect its immutable channel, attachment decision and thunder path.
		</p>
	{/if}

	<p class="disclaimer">
		These values come from this procedural model, not a lightning-detection network.
	</p>
</aside>

<style>
	.inspector {
		height: 100%;
		overflow: auto;
		border-left: 1px solid var(--atlas-line);
		background: var(--atlas-panel);
		padding: 1rem;
		color: var(--atlas-text);
	}

	.heading-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--atlas-line);
	}

	.heading-row p,
	.heading-row h3 {
		margin: 0;
	}

	.heading-row p {
		color: var(--atlas-muted);
		font-family: 'Courier Prime', monospace;
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.heading-row h3 {
		margin-top: 0.12rem;
		font-size: 1rem;
	}

	code {
		color: var(--atlas-accent);
		font-size: 0.68rem;
	}

	dl {
		display: grid;
		grid-template-columns: 1fr 1fr;
		margin: 0;
	}

	dl div {
		min-width: 0;
		padding: 0.58rem 0.35rem;
		border-bottom: 1px solid color-mix(in srgb, var(--atlas-line) 72%, transparent);
	}

	dt {
		color: var(--atlas-muted);
		font-size: 0.66rem;
		letter-spacing: 0.03em;
	}

	dd {
		margin: 0.16rem 0 0;
		font-size: 0.78rem;
		font-weight: 650;
		line-height: 1.3;
		word-break: break-word;
	}

	.narrative {
		margin-top: 0.85rem;
		border: 1px solid var(--atlas-line);
		border-radius: 0.4rem;
		background: var(--atlas-control);
		padding: 0.7rem;
		font-size: 0.75rem;
		line-height: 1.5;
	}

	.narrative p {
		margin: 0.35rem 0 0;
	}

	.sound-text {
		color: var(--atlas-muted);
	}

	.empty {
		color: var(--atlas-muted);
		font-size: 0.82rem;
		line-height: 1.55;
	}

	.disclaimer {
		margin: 0.9rem 0 0;
		color: var(--atlas-muted);
		font-size: 0.68rem;
		line-height: 1.45;
	}

	@media (max-width: 960px) {
		.inspector {
			border-top: 1px solid var(--atlas-line);
			border-left: 0;
		}
	}
</style>
