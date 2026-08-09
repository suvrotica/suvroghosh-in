<script lang="ts">
	type Props = {
		shot: number;
		progress: number;
		paused: boolean;
		reducedMotion: boolean;
		onpause: () => void;
		onskip: () => void;
		onprevious: () => void;
		onnext: () => void;
	};

	let { shot, progress, paused, reducedMotion, onpause, onskip, onprevious, onnext }: Props =
		$props();

	const shots = [
		{ act: 'Orbit', text: 'This curve is deterministic. It is not rolling dice.' },
		{ act: 'Weather', text: 'We place the orbit inside a seeded field of smooth noise.' },
		{ act: 'Bend', text: 'The field bends what we observe, not the underlying equation.' },
		{ act: 'Voice', text: 'A return becomes rhythm. A region becomes pitch.' },
		{ act: 'Orchestra', text: 'Now conduct it.' }
	] as const;
	let current = $derived(shots[Math.max(0, Math.min(shots.length - 1, shot))] ?? shots[0]);
</script>

<div class="choreography" data-shot={shot} data-testid="sa-choreography">
	<div class="copy">
		<p>Act {shot + 1} of 5 · {current.act}</p>
		<h2>{current.text}</h2>
	</div>
	<div class="timeline" aria-label={`Introduction: ${current.act}`}>
		<span style={`--progress:${Math.max(0, Math.min(1, progress))}`}></span>
	</div>
	<div class="actions">
		{#if reducedMotion}
			<button type="button" disabled={shot === 0} onclick={onprevious}>Previous still</button>
			<button type="button" disabled={shot === 4} onclick={onnext}>Next still</button>
		{:else}
			<button type="button" onclick={onpause}
				>{paused ? 'Resume introduction' : 'Pause introduction'}</button
			>
		{/if}
		<button type="button" onclick={onskip}>Skip introduction</button>
	</div>
</div>

<style>
	.choreography {
		position: absolute;
		z-index: 9;
		inset: auto clamp(0.8rem, 3vw, 2rem) clamp(0.8rem, 3vw, 2rem);
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.7rem 1rem;
		align-items: end;
		border: 1px solid rgb(226 220 199 / 22%);
		border-radius: 0.6rem;
		background: rgb(4 8 10 / 86%);
		padding: 0.9rem 1rem;
		backdrop-filter: blur(14px);
	}

	.copy p,
	.copy h2 {
		margin: 0;
	}

	.copy p {
		color: #76c9cc;
		font: 700 0.6rem/1.3 var(--font-mono, monospace);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.copy h2 {
		max-width: 38ch;
		margin-top: 0.25rem;
		color: #f1ecdf;
		font: 700 clamp(1.05rem, 2.4vw, 1.65rem) / 1.25 var(--font-serif, serif);
		letter-spacing: -0.025em;
		text-wrap: balance;
	}

	.timeline {
		grid-column: 1 / -1;
		height: 2px;
		overflow: hidden;
		background: rgb(216 211 194 / 15%);
	}

	.timeline span {
		display: block;
		width: calc(var(--progress) * 100%);
		height: 100%;
		background: #c58f67;
		transition: width 100ms linear;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.4rem;
	}

	button {
		min-height: 2.75rem;
		border: 1px solid rgb(224 219 201 / 28%);
		border-radius: 999px;
		background: #090f12;
		padding: 0.6rem 0.8rem;
		color: #d8d5c9;
		font: 680 0.67rem/1 var(--font-sans, sans-serif);
		cursor: pointer;
	}

	button:focus-visible {
		outline: 3px solid #8ee8eb;
		outline-offset: 2px;
	}

	button:disabled {
		opacity: 0.4;
	}

	@media (max-width: 720px) {
		.choreography {
			grid-template-columns: 1fr;
		}

		.actions {
			justify-content: flex-start;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.timeline span {
			transition: none;
		}
	}
</style>
