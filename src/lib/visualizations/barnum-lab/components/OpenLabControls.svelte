<script lang="ts">
	import type { OpenLabSettings } from './ui-types';

	export type OpenLabExperiment = 'demographics' | 'many-guesses' | 'feedback' | 'hedges';

	const EXPERIMENTS: readonly {
		id: OpenLabExperiment;
		label: string;
		description: string;
	}[] = [
		{
			id: 'demographics',
			label: 'Same deck, different demographics',
			description: 'Change several surface clues while holding the original deck fixed.'
		},
		{
			id: 'many-guesses',
			label: 'One guess versus many',
			description: 'See how multiplicity creates more chances for an endorsed match.'
		},
		{
			id: 'feedback',
			label: 'Feedback off versus on',
			description: 'Compare the sealed reading with explicitly audited derivatives.'
		},
		{
			id: 'hedges',
			label: 'Hedges off versus on',
			description: 'Expose how qualifiers widen a sentence’s room to fit.'
		}
	];

	let {
		settings,
		activeExperiment,
		replayCode,
		onchange,
		onexperiment,
		onreplay,
		onloadreplay,
		onnewseed,
		oncounterfactual,
		counterfactualAvailable = true,
		onselfreportcounterfactual,
		onreset
	}: {
		settings: OpenLabSettings;
		activeExperiment: OpenLabExperiment;
		replayCode: string;
		onchange: (settings: OpenLabSettings) => void;
		onexperiment: (experiment: OpenLabExperiment) => void;
		onreplay: () => void;
		onloadreplay: (code: string) => string | undefined;
		onnewseed: () => void;
		oncounterfactual: () => void;
		counterfactualAvailable?: boolean;
		onselfreportcounterfactual: () => void;
		onreset: () => void;
	} = $props();

	let replayInput = $state('');
	let replayFeedback = $state('');
	let lastPresentedReplayCode = '';

	$effect(() => {
		if (replayCode === lastPresentedReplayCode) return;
		lastPresentedReplayCode = replayCode;
		replayInput = replayCode;
		replayFeedback = '';
	});

	function patchSettings(patch: Partial<OpenLabSettings>): void {
		onchange({ ...settings, ...patch });
	}

	function loadReplay(): void {
		const error = onloadreplay(replayInput);
		replayFeedback =
			error ?? 'Reproducibility code loaded locally. No answers or ratings were read from it.';
	}
</script>

<section class="controls" aria-labelledby="open-controls-heading">
	<header>
		<p>Open laboratory</p>
		<h3 id="open-controls-heading">Remove one trick at a time</h3>
		<span>Every control acts locally on the current in-memory session.</span>
	</header>

	<div class="experiments" role="group" aria-label="Named laboratory experiments">
		{#each EXPERIMENTS as experiment (experiment.id)}
			<button
				type="button"
				data-testid={`barnum-experiment-${experiment.id}`}
				aria-pressed={activeExperiment === experiment.id}
				onclick={() => onexperiment(experiment.id)}
			>
				<strong>{experiment.label}</strong>
				<span>{experiment.description}</span>
			</button>
		{/each}
	</div>

	<details>
		<summary>Advanced controls</summary>
		<div class="advanced">
			<fieldset>
				<legend>Deck</legend>
				<div class="button-row">
					<button type="button" data-testid="barnum-replay-same-deck" onclick={onreplay}>
						Replay same sealed deck
					</button>
					<button type="button" onclick={onnewseed}>Create a new seed</button>
				</div>
				<label class="replay-entry" for="barnum-replay-code">
					<span>Reproducibility code</span>
					<input
						id="barnum-replay-code"
						data-testid="barnum-replay-code"
						type="text"
						spellcheck="false"
						autocomplete="off"
						value={replayInput}
						oninput={(event) => (replayInput = event.currentTarget.value)}
					/>
				</label>
				<button
					class="load-replay"
					type="button"
					data-testid="barnum-load-replay"
					disabled={!replayInput.trim()}
					onclick={loadReplay}>Load this code</button
				>
				{#if replayFeedback}<p class="replay-feedback" data-testid="barnum-replay-feedback">
						{replayFeedback}
					</p>{/if}
				<p class="replay-note">
					Encodes a seed, engine/corpus versions, corpus manifest, and checksum. It contains no
					answers or ratings and is not a cryptographic proof.
				</p>
				<label class="range" for="open-statement-count">
					<span>Statement count, 1–15</span>
					<input
						id="open-statement-count"
						type="range"
						min="1"
						max="15"
						step="1"
						value={settings.statementCount}
						oninput={(event) =>
							patchSettings({ statementCount: Number(event.currentTarget.value) })}
					/>
					<output for="open-statement-count">{settings.statementCount}</output>
				</label>
			</fieldset>

			<fieldset>
				<legend>Mechanisms</legend>
				{#each [{ key: 'surfaceAdaptation', label: 'Surface context dressing' }, { key: 'directEchoes', label: 'Direct echoes' }, { key: 'feedbackAdaptation', label: 'Feedback adaptation' }, { key: 'oppositePairs', label: 'Opposite-pair statements' }, { key: 'showProvenance', label: 'Show statement X-rays' }, { key: 'showNonFits', label: 'Show non-fits in polished summary' }] as toggle (toggle.key)}
					<label class="toggle">
						<input
							type="checkbox"
							data-testid={`barnum-toggle-${toggle.key}`}
							checked={Boolean(settings[toggle.key as keyof OpenLabSettings])}
							onchange={(event) => patchSettings({ [toggle.key]: event.currentTarget.checked })}
						/>
						<span>{toggle.label}</span>
					</label>
				{/each}
				<p>
					Hiding non-fits affects only the derived polished panel. Counts and the audit stay
					visible.
				</p>
			</fieldset>

			<fieldset>
				<legend>Wording</legend>
				<label>
					<span>Hedges</span>
					<select
						value={settings.hedges}
						onchange={(event) =>
							patchSettings({ hedges: event.currentTarget.value as OpenLabSettings['hedges'] })}
					>
						<option value="none">None</option>
						<option value="low">Low</option>
						<option value="high">High</option>
					</select>
				</label>
				<label>
					<span>Wording breadth</span>
					<select
						value={settings.breadth}
						onchange={(event) =>
							patchSettings({ breadth: event.currentTarget.value as OpenLabSettings['breadth'] })}
					>
						<option value="very-broad">Very broad</option>
						<option value="broad">Broad</option>
						<option value="moderate">Moderate</option>
					</select>
				</label>
			</fieldset>

			<fieldset>
				<legend>Counterfactuals and memory</legend>
				<div class="button-row vertical">
					<button
						type="button"
						data-testid="barnum-open-counterfactual"
						disabled={!counterfactualAvailable}
						onclick={oncounterfactual}
					>
						{counterfactualAvailable
							? 'Change several surface clues'
							: 'Surface clues already changed'}
					</button>
					<button
						type="button"
						data-testid="barnum-self-report-counterfactual"
						onclick={onselfreportcounterfactual}>Change one self-report</button
					>
					<button type="button" class="danger" onclick={onreset}>Reset all in-memory data</button>
				</div>
			</fieldset>
		</div>
	</details>
</section>

<style>
	.controls {
		display: grid;
		gap: 0.75rem;
	}

	header p,
	header h3,
	header span,
	fieldset p {
		margin: 0;
	}

	header p {
		color: var(--barnum-vermilion-text);
		font: 760 0.7rem/1.2 var(--barnum-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	header h3 {
		margin-top: 0.12rem;
		font: 810 1.05rem/1.2 var(--barnum-sans);
	}

	header span {
		display: block;
		margin-top: 0.18rem;
		color: var(--barnum-muted);
		font: 0.72rem/1.45 var(--barnum-sans);
	}

	.experiments {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.experiments button {
		display: grid;
		min-height: 8rem;
		align-content: start;
		gap: 0.35rem;
		border: 1px solid var(--barnum-control);
		border-top: 3px solid var(--barnum-rule);
		border-radius: 0.45rem;
		background: var(--barnum-raised);
		padding: 0.65rem;
		color: var(--barnum-ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.experiments button[aria-pressed='true'] {
		border-color: var(--barnum-blue);
		border-top-color: var(--barnum-blue);
		box-shadow: inset 0 0 0 1px var(--barnum-blue);
	}

	.experiments strong {
		font: 780 0.75rem/1.35 var(--barnum-sans);
	}

	.experiments span {
		color: var(--barnum-muted);
		font: 0.72rem/1.45 var(--barnum-sans);
	}

	details {
		border: 1px solid var(--barnum-rule);
		border-radius: 0.45rem;
		background: var(--barnum-soft);
	}

	details > summary {
		min-height: 3.25rem;
		padding: 0.75rem;
		font: 770 0.71rem/1.3 var(--barnum-sans);
		cursor: pointer;
	}

	.advanced {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
		border-top: 1px solid var(--barnum-rule);
		padding: 0.65rem;
	}

	fieldset {
		display: grid;
		align-content: start;
		gap: 0.48rem;
		min-width: 0;
		margin: 0;
		border: 1px solid var(--barnum-rule);
		border-radius: 0.4rem;
		background: var(--barnum-raised);
		padding: 0.65rem;
	}

	legend {
		padding-inline: 0.2rem;
		font: 770 0.75rem/1.35 var(--barnum-sans);
	}

	.button-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.button-row.vertical {
		align-items: stretch;
		flex-direction: column;
	}

	.button-row button {
		min-height: 2.75rem;
		border: 1px solid var(--barnum-control);
		border-radius: 0.35rem;
		background: var(--barnum-paper);
		padding: 0.48rem 0.58rem;
		color: var(--barnum-ink);
		font: 740 0.72rem/1.35 var(--barnum-sans);
		cursor: pointer;
	}

	.button-row button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.replay-entry {
		display: grid;
		gap: 0.3rem;
		font: 700 0.72rem/1.35 var(--barnum-sans);
	}

	.replay-entry input {
		width: 100%;
		min-height: 2.75rem;
		box-sizing: border-box;
		border: 1px solid var(--barnum-control);
		border-radius: 0.35rem;
		background: var(--barnum-paper);
		padding: 0.48rem 0.58rem;
		color: var(--barnum-ink);
		font: 0.7rem/1.35 var(--barnum-mono);
	}

	.load-replay {
		min-height: 2.75rem;
		border: 1px solid var(--barnum-control);
		border-radius: 0.35rem;
		background: var(--barnum-paper);
		padding: 0.48rem 0.58rem;
		color: var(--barnum-ink);
		font: 740 0.72rem/1.35 var(--barnum-sans);
		cursor: pointer;
	}

	.load-replay:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.replay-feedback,
	.replay-note {
		margin: 0;
		color: var(--barnum-muted);
		font: 0.7rem/1.45 var(--barnum-sans);
	}

	.button-row button.danger {
		border-color: var(--barnum-vermilion);
	}

	.range {
		display: grid;
		grid-template-columns: minmax(7rem, auto) minmax(4rem, 1fr) 2rem;
		align-items: center;
		gap: 0.45rem;
		font: 700 0.72rem/1.35 var(--barnum-sans);
	}

	.range output {
		font: 750 0.72rem/1 var(--barnum-mono);
		text-align: right;
	}

	.toggle,
	fieldset > label:not(.range) {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font: 700 0.72rem/1.35 var(--barnum-sans);
	}

	.toggle {
		justify-content: flex-start;
	}

	.toggle input {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--barnum-blue);
	}

	select {
		min-height: 2.75rem;
		border: 1px solid var(--barnum-control);
		border-radius: 0.35rem;
		background: var(--barnum-paper);
		padding: 0.45rem;
		color: var(--barnum-ink);
		font: 700 0.72rem/1.35 var(--barnum-sans);
	}

	fieldset p {
		color: var(--barnum-muted);
		font: 0.7rem/1.45 var(--barnum-sans);
	}

	button:focus-visible,
	input:focus-visible,
	select:focus-visible,
	details > summary:focus-visible {
		outline: 3px solid var(--barnum-focus);
		outline-offset: 2px;
	}

	@media (max-width: 60rem) {
		.experiments {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 38rem) {
		.experiments,
		.advanced {
			grid-template-columns: 1fr;
		}

		.experiments button {
			min-height: 0;
		}
	}

	@media (forced-colors: active) {
		.experiments button,
		details,
		.advanced,
		fieldset,
		.button-row button,
		select {
			border-color: CanvasText;
		}
	}
</style>
