<script lang="ts">
	import { MAX_SEED_LENGTH, type FlowerConfig } from '$lib/visualizations/perlin-bloom';

	type PresetChoice = {
		id: FlowerConfig['preset'];
		name: string;
	};

	type Props = {
		titleId: string;
		config: FlowerConfig;
		presets: readonly PresetChoice[];
		presetName: string;
		paletteName: string;
		morphologyHash: string;
		paused: boolean;
		posterMode?: boolean;
		onPreset: (preset: FlowerConfig['preset']) => void;
		onSeed: (seed: string) => void;
		onNewBloom: () => void;
	};

	let {
		titleId,
		config,
		presets,
		presetName,
		paletteName,
		morphologyHash,
		paused,
		posterMode = false,
		onPreset,
		onSeed,
		onNewBloom
	}: Props = $props();

	function value(event: Event) {
		return (event.currentTarget as HTMLInputElement | HTMLSelectElement).value;
	}
</script>

<header class:poster-mode={posterMode} class="identity-shell">
	<div class="identity-header">
		<div class="title-block">
			<p>Generative botany · specimen PB–01</p>
			<h1 id={titleId}>Thinking Outside the Box</h1>
			<strong>The Perlin Bloom Engine</strong>
		</div>

		<div class="identity-ledger" aria-label="Current bloom identity">
			<span><small>Anatomy</small><strong>{presetName}</strong></span>
			<span><small>Light</small><strong>{paletteName}</strong></span>
			<span class="hash-entry">
				<small>Morphology</small>
				<strong data-testid="perlin-bloom-morphology-hash">{morphologyHash}</strong>
			</span>
		</div>
	</div>

	<div class="seed-console" aria-label="Bloom seed and preset">
		<label class="preset-field">
			<span>Preset</span>
			<select
				value={config.preset}
				onchange={(event) => onPreset(value(event) as FlowerConfig['preset'])}
			>
				{#each presets as preset (preset.id)}
					<option value={preset.id}>{preset.name}</option>
				{/each}
			</select>
		</label>

		<button type="button" class="new-bloom" onclick={onNewBloom} title="New bloom · R">
			New bloom
		</button>

		<label class="seed-field">
			<span>Seed</span>
			<input
				type="text"
				value={config.seed}
				maxlength={MAX_SEED_LENGTH}
				spellcheck="false"
				autocomplete="off"
				onchange={(event) => onSeed(value(event))}
			/>
		</label>

		<div class="motion-state" aria-label="Current motion state">
			<span class:active={!paused}></span>
			<strong>{paused ? 'Still specimen' : 'Living field'}</strong>
		</div>
	</div>
</header>

<style>
	.identity-shell {
		border-bottom: 1px solid var(--pb-line);
		background: linear-gradient(100deg, rgb(74 25 115 / 12%), rgb(4 7 20 / 72%) 58%);
	}

	.identity-shell.poster-mode {
		display: none;
	}

	.identity-header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1.25rem;
		padding: 0.9rem 1.05rem 0.75rem;
	}

	.title-block p,
	.title-block h1,
	.title-block strong {
		margin: 0;
	}

	.title-block p {
		margin-bottom: 0.28rem;
		color: var(--pb-cyan);
		font: 780 0.68rem/1 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.title-block h1 {
		color: var(--pb-ink);
		font: 620 clamp(1.4rem, 2.5vw, 2.3rem)/1 var(--font-serif, serif);
		letter-spacing: -0.035em;
	}

	.title-block > strong {
		display: block;
		margin-top: 0.28rem;
		color: var(--pb-muted);
		font: 550 0.8rem/1.2 var(--font-sans, sans-serif);
		letter-spacing: 0.03em;
	}

	.identity-ledger {
		display: flex;
		align-items: end;
		gap: 0.9rem;
		border-left: 1px solid var(--pb-line);
		padding-left: 1rem;
	}

	.identity-ledger span {
		display: grid;
		min-width: 0;
		gap: 0.2rem;
	}

	.identity-ledger small {
		color: var(--pb-muted);
		font: 650 0.68rem/1.1 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.identity-ledger strong {
		max-width: 12rem;
		overflow: hidden;
		color: #dcecff;
		font: 680 0.78rem/1.2 var(--font-sans, sans-serif);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hash-entry strong {
		color: var(--pb-cyan);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.7rem;
	}

	.seed-console {
		display: grid;
		grid-template-areas: 'preset seed new motion';
		grid-template-columns: minmax(10rem, 0.7fr) minmax(14rem, 1.3fr) auto auto;
		align-items: end;
		gap: 0.55rem;
		border-top: 1px solid var(--pb-line);
		padding: 0.55rem 0.75rem;
		background: rgb(4 7 20 / 55%);
	}

	.seed-console label {
		display: grid;
		gap: 0.25rem;
		color: var(--pb-muted);
		font: 720 0.75rem/1 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.preset-field {
		grid-area: preset;
	}

	.seed-field {
		grid-area: seed;
	}

	.seed-console select,
	.seed-console input {
		width: 100%;
		min-height: 2.75rem;
		border: 1px solid rgb(143 211 255 / 23%);
		border-radius: 0.58rem;
		background: rgb(13 18 42 / 88%);
		padding: 0.55rem 0.7rem;
		color: var(--pb-ink);
		font: 620 0.78rem/1 var(--font-sans, sans-serif);
	}

	.seed-console input {
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	.new-bloom {
		grid-area: new;
		min-height: 2.75rem;
		border: 1px solid rgb(123 241 255 / 56%);
		border-radius: 0.65rem;
		background: linear-gradient(120deg, #166b88, #72237f);
		box-shadow: 0 0 1.2rem rgb(80 218 255 / 12%);
		padding: 0.5rem 0.85rem;
		color: #fff;
		font: 750 0.78rem/1 var(--font-sans, sans-serif);
		cursor: pointer;
		white-space: nowrap;
	}

	.new-bloom:hover {
		border-color: rgb(165 248 255 / 82%);
		filter: brightness(1.12);
	}

	.new-bloom:focus-visible,
	.seed-console select:focus-visible,
	.seed-console input:focus-visible {
		outline: 2px solid var(--pb-cyan);
		outline-offset: 2px;
	}

	.motion-state {
		display: flex;
		grid-area: motion;
		align-items: center;
		gap: 0.45rem;
		min-height: 2.75rem;
		border: 1px solid rgb(143 211 255 / 15%);
		border-radius: 0.58rem;
		padding: 0.5rem 0.7rem;
		color: var(--pb-muted);
		white-space: nowrap;
	}

	.motion-state > span {
		width: 0.48rem;
		height: 0.48rem;
		border-radius: 50%;
		background: #677087;
		box-shadow: 0 0 0.6rem rgb(113 127 155 / 35%);
	}

	.motion-state > span.active {
		background: #75f5ff;
		box-shadow: 0 0 0.8rem rgb(76 236 255 / 82%);
	}

	.motion-state strong {
		font: 700 0.75rem/1 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	:global(html[data-theme='high-contrast']) .identity-shell,
	:global(html[data-theme='high-contrast']) .seed-console select,
	:global(html[data-theme='high-contrast']) .seed-console input,
	:global(html[data-theme='high-contrast']) .new-bloom {
		border-width: 2px;
		box-shadow: none;
	}

	@media (max-width: 68rem) {
		.identity-header {
			align-items: start;
		}

		.identity-ledger {
			display: grid;
			gap: 0.28rem;
		}

		.identity-ledger span {
			display: flex;
			justify-content: space-between;
			gap: 0.75rem;
		}
	}

	@media (max-width: 48rem) {
		.identity-header {
			display: grid;
			gap: 0.55rem;
			padding: 0.72rem 0.75rem 0.55rem;
		}

		.identity-ledger {
			display: flex;
			width: 100%;
			flex-wrap: wrap;
			gap: 0.4rem 0.85rem;
			border-top: 1px solid var(--pb-line);
			border-left: 0;
			padding-top: 0.45rem;
			padding-left: 0;
		}

		.identity-ledger span {
			display: flex;
			align-items: baseline;
			gap: 0.35rem;
		}

		.hash-entry {
			margin-left: auto;
		}

		.seed-console {
			grid-template-areas:
				'preset new'
				'seed seed';
			grid-template-columns: minmax(0, 1fr) auto;
			padding: 0.5rem;
		}

		.motion-state {
			display: none;
		}
	}

	@media (max-width: 27rem) {
		.title-block p {
			font-size: 0.62rem;
		}

		.identity-ledger small {
			font-size: 0.6rem;
			letter-spacing: 0.06em;
		}

		.identity-ledger strong {
			font-size: 0.72rem;
		}

		.hash-entry {
			display: none !important;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.new-bloom {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.identity-shell,
		.seed-console,
		.seed-console select,
		.seed-console input,
		.new-bloom {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
			box-shadow: none;
		}

		.new-bloom {
			background: Highlight;
			color: HighlightText;
		}

		.motion-state > span {
			background: CanvasText;
			box-shadow: none;
		}
	}
</style>
