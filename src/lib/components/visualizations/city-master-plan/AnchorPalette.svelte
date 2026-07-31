<script lang="ts">
	import type { AnchorDefinition, AnchorId, Rotation } from '$lib/visualizations/city-master-plan';

	type Props = {
		anchors: readonly AnchorDefinition[];
		selected: AnchorId;
		rotation: Rotation;
		disabled?: boolean;
		onselect: (id: AnchorId) => void;
		onrotate: () => void;
	};

	let { anchors, selected, rotation, disabled = false, onselect, onrotate }: Props = $props();

	function revealFocusedButton(event: FocusEvent) {
		(event.currentTarget as HTMLButtonElement).scrollIntoView({
			block: 'nearest',
			inline: 'center'
		});
	}
</script>

<section class="anchor-palette" aria-labelledby="city-anchor-heading">
	<div class="palette-heading">
		<div>
			<p>One local condition</p>
			<h3 id="city-anchor-heading">Choose the first object</h3>
		</div>
		<button
			type="button"
			class="rotate"
			{disabled}
			onclick={onrotate}
			aria-label={`Rotate anchor clockwise. Current rotation ${rotation * 90} degrees`}
		>
			Rotate · R
		</button>
	</div>

	<div class="anchor-row" role="group" aria-label="Anchor objects">
		{#each anchors as anchor (anchor.id)}
			<button
				type="button"
				class="anchor"
				class:selected={selected === anchor.id}
				aria-pressed={selected === anchor.id}
				{disabled}
				onfocus={revealFocusedButton}
				onclick={() => onselect(anchor.id)}
			>
				<span class="marker" aria-hidden="true">{anchor.shortLabel.slice(0, 2)}</span>
				<span>
					<strong>{anchor.label}</strong>
					<small>{anchor.possibilityEffect}</small>
				</span>
			</button>
		{/each}
	</div>
</section>

<style>
	.anchor-palette {
		border-top: 1px solid var(--rule);
		background: var(--paper-soft);
		padding: 0.85rem;
	}
	.palette-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.7rem;
	}
	.palette-heading p,
	.palette-heading h3 {
		margin: 0;
	}
	.palette-heading p {
		margin-bottom: 0.15rem;
		font-family: ui-monospace, monospace;
		font-size: 0.6875rem;
		font-weight: 800;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.palette-heading h3 {
		font-size: 0.95rem;
		color: var(--ink);
	}
	.rotate {
		min-height: 2.75rem;
		flex: none;
		border: 1px solid var(--control-border);
		border-radius: 0.45rem;
		background: var(--paper-raised);
		padding: 0.45rem 0.7rem;
		font: inherit;
		font-size: 0.75rem;
		font-weight: 800;
		color: var(--ink);
		cursor: pointer;
	}
	.anchor-row {
		display: grid;
		grid-auto-columns: minmax(12rem, 1fr);
		grid-auto-flow: column;
		gap: 0.55rem;
		overflow-x: auto;
		padding: 0.1rem 0.05rem 0.35rem;
		scroll-snap-type: x proximity;
	}
	.anchor {
		display: grid;
		grid-template-columns: 2.15rem 1fr;
		gap: 0.55rem;
		min-height: 5.4rem;
		align-items: start;
		scroll-snap-align: start;
		border: 1px solid var(--control-border);
		border-radius: 0.55rem;
		background: var(--paper-raised);
		padding: 0.65rem;
		font: inherit;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.anchor:hover,
	.anchor.selected {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.marker {
		display: grid;
		width: 2.15rem;
		height: 2.15rem;
		place-items: center;
		border: 1px solid var(--accent);
		border-radius: 50% 50% 46% 48%;
		background: color-mix(in srgb, var(--accent) 12%, var(--paper));
		font-family: ui-monospace, monospace;
		font-size: 0.68rem;
		font-weight: 900;
		letter-spacing: 0.05em;
		color: var(--accent);
	}
	.anchor strong,
	.anchor small {
		display: block;
	}
	.anchor strong {
		margin-bottom: 0.25rem;
		font-size: 0.78rem;
	}
	.anchor small {
		font-size: 0.7rem;
		line-height: 1.35;
		color: var(--ink-muted);
	}
	button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.52;
	}
	@media (max-width: 640px) {
		.anchor-palette {
			padding-inline: 0.7rem;
		}
		.anchor-row {
			grid-auto-columns: minmax(11rem, 74vw);
		}
	}
</style>
