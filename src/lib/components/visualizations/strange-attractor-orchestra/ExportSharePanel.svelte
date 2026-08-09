<script lang="ts">
	type ExportKind = 'poster' | 'snapshot' | 'score' | 'wav';
	type Props = {
		busy?: ExportKind | null;
		disabled?: boolean;
		progress?: number;
		message?: string;
		oncopylink: () => void;
		onexport: (kind: ExportKind) => void;
		oncancel: () => void;
	};

	let {
		busy = null,
		disabled = false,
		progress = 0,
		message = '',
		oncopylink,
		onexport,
		oncancel
	}: Props = $props();
</script>

<section class="exports" aria-labelledby="sa-export-title">
	<div class="heading">
		<div>
			<p>Reproducible output</p>
			<h3 id="sa-export-title">Take this weather with you.</h3>
		</div>
		<button class="share" type="button" disabled={Boolean(busy)} onclick={oncopylink}
			>Copy deterministic URL</button
		>
	</div>
	<div class="actions">
		<button type="button" disabled={Boolean(busy) || disabled} onclick={() => onexport('poster')}
			>PNG poster</button
		>
		<button type="button" disabled={Boolean(busy) || disabled} onclick={() => onexport('snapshot')}
			>State JSON</button
		>
		<button type="button" disabled={Boolean(busy) || disabled} onclick={() => onexport('score')}
			>Score JSON</button
		>
		<button type="button" disabled={Boolean(busy) || disabled} onclick={() => onexport('wav')}
			>WAV composition</button
		>
	</div>
	{#if busy}
		<div class="progress" role="status">
			<label for="sa-export-progress">Rendering {busy}</label>
			<progress id="sa-export-progress" max="1" value={progress}
				>{Math.round(progress * 100)}%</progress
			>
			<button type="button" onclick={oncancel}>Cancel export</button>
		</div>
	{/if}
	<p class="status" aria-live="polite">{message}</p>
	<p class="note">
		The URL and JSON reproduce the quantized orbit–feature–score stream in this implementation.
		Browser-native filters may not produce byte-identical audio elsewhere.
	</p>
</section>

<style>
	.exports {
		border-top: 1px solid rgb(218 212 192 / 16%);
		padding-top: 1rem;
	}

	.heading,
	.actions,
	.progress {
		display: flex;
		align-items: center;
	}

	.heading {
		justify-content: space-between;
		gap: 1rem;
	}

	.heading p,
	.heading h3 {
		margin: 0;
	}

	.heading p {
		color: #85918e;
		font: 700 0.61rem/1.3 var(--font-mono, monospace);
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	.heading h3 {
		color: #ede7d9;
		font: 700 1.05rem/1.35 var(--font-serif, serif);
	}

	.actions {
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.75rem;
	}

	button {
		min-height: 2.75rem;
		border: 1px solid rgb(222 217 199 / 22%);
		border-radius: 0.4rem;
		background: #0a1013;
		padding: 0.65rem 0.8rem;
		color: #d8d5ca;
		font: 680 0.7rem/1 var(--font-sans, sans-serif);
		cursor: pointer;
	}

	button.share {
		border-color: rgb(118 202 205 / 45%);
		color: #c9f1f0;
	}

	button:focus-visible,
	progress:focus-visible {
		outline: 3px solid #8ee8eb;
		outline-offset: 2px;
	}

	button:disabled {
		cursor: wait;
		opacity: 0.5;
	}

	.progress {
		flex-wrap: wrap;
		gap: 0.55rem;
		margin-top: 0.75rem;
		color: #aaa99f;
		font: 0.68rem/1.4 var(--font-mono, monospace);
	}

	progress {
		min-width: min(100%, 14rem);
		accent-color: #75c9cc;
	}

	.status {
		min-height: 1.4em;
		margin: 0.55rem 0 0;
		color: #9dc9c8;
		font: 0.68rem/1.4 var(--font-sans, sans-serif);
	}

	.note {
		max-width: 62rem;
		margin: 0.35rem 0 0;
		color: #747b78;
		font: 0.62rem/1.45 var(--font-mono, monospace);
	}

	@media (max-width: 620px) {
		.heading {
			align-items: flex-start;
			flex-direction: column;
		}

		.actions {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
