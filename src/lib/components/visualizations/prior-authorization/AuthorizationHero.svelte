<script lang="ts">
	import PathwaySelector from './PathwaySelector.svelte';
	import ThreeClocks from './ThreeClocks.svelte';
	import type { UiClockSnapshot, UiPathwayId } from './ui-types';

	type Props = {
		pathway: UiPathwayId;
		clock: UiClockSnapshot;
		loading?: boolean;
		canBegin?: boolean;
		onpathwaychange?: (value: UiPathwayId) => void;
		onbegin?: () => void;
	};

	let {
		pathway,
		clock,
		loading = false,
		canBegin = true,
		onpathwaychange,
		onbegin
	}: Props = $props();
</script>

<header class="hero" aria-labelledby="pa-machine-title">
	<a class="skip-link" href="#pa-text-journey">Read the text version</a>
	<div class="hero-grid">
		<div class="patient-card">
			<div class="patient-mark" aria-hidden="true"><span>MS</span></div>
			<div>
				<p class="eyebrow">The Patient Through the Machine · Part 1 · Wait</p>
				<h1 id="pa-machine-title">
					The Prior Authorization Machine: <span
						>a patient, an MRI, and the invisible decisions between them</span
					>
				</h1>
				<p class="case-line"><strong>Maya Sen</strong> · Lumbar MRI ordered</p>
				<p class="synthetic">Fictional patient · synthetic case · no real health data</p>
			</div>
		</div>

		<div class="thesis">
			<p>The MRI has been ordered. Nothing has happened yet—except that the clock has started.</p>
			<p class="machine-dormant" aria-label="The administrative machine is dormant">
				<span aria-hidden="true">01</span>
				<i aria-hidden="true"></i>
				<span aria-hidden="true">12</span>
				<strong>Dormant</strong>
			</p>
		</div>
	</div>

	<ThreeClocks {clock} zeroState={clock.patientElapsedMinutes === 0} />

	<div class="entry-controls">
		<PathwaySelector
			value={pathway}
			name="pa-pathway-hero"
			onchange={onpathwaychange}
			disabled={!canBegin || loading}
		/>
		<div class="begin-block">
			<button type="button" class="begin" disabled={!canBegin || loading} onclick={onbegin}>
				{loading ? 'Preparing the machine…' : 'Begin the journey'}
			</button>
			<p>Nothing advances until you begin.</p>
		</div>
	</div>
</header>

<style>
	.hero {
		position: relative;
		display: grid;
		gap: clamp(1rem, 2.5vw, 1.6rem);
		min-height: 33rem;
		align-content: center;
		border: 1px solid var(--rule);
		border-radius: 1rem;
		background:
			linear-gradient(
				120deg,
				color-mix(in oklab, var(--paper-raised) 94%, var(--accent) 6%),
				var(--paper)
			),
			repeating-linear-gradient(
				90deg,
				transparent 0 3.8rem,
				color-mix(in oklab, var(--rule) 45%, transparent) 3.8rem 3.86rem
			);
		padding: clamp(1rem, 4vw, 3.25rem);
		box-shadow: var(--shadow-overlay);
		color: var(--ink);
	}

	.skip-link {
		position: absolute;
		top: 0.7rem;
		left: 0.7rem;
		z-index: 2;
		transform: translateY(-180%);
		border-radius: 0.35rem;
		background: var(--ink);
		padding: 0.55rem 0.75rem;
		color: var(--paper);
		font: 720 0.78rem/1 var(--font-sans, sans-serif);
	}

	.skip-link:focus {
		transform: none;
	}

	.hero-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(16rem, 0.9fr);
		align-items: center;
		gap: clamp(1.5rem, 5vw, 5rem);
	}

	.patient-card {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: start;
		gap: 1rem;
	}

	.patient-mark {
		display: grid;
		width: clamp(3.25rem, 7vw, 4.8rem);
		aspect-ratio: 1;
		place-items: center;
		border: 2px solid var(--ink);
		border-radius: 50% 50% 46% 54%;
		background: var(--paper);
		box-shadow: 0.3rem 0.35rem 0 color-mix(in oklab, var(--accent) 46%, transparent);
	}

	.patient-mark span {
		font: 800 0.86rem/1 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
	}

	.eyebrow,
	h1,
	.case-line,
	.synthetic,
	.thesis p,
	.begin-block p {
		margin: 0;
	}

	.eyebrow {
		font: 780 0.67rem/1.35 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--accent);
	}

	h1 {
		max-width: 15ch;
		margin-top: 0.45rem;
		font: 780 clamp(2.5rem, 7vw, 6.8rem) / 0.86 var(--font-sans, sans-serif);
		letter-spacing: -0.065em;
		text-wrap: balance;
		overflow-wrap: normal;
		word-break: normal;
		hyphens: none;
	}

	h1 span {
		display: block;
		max-width: 32ch;
		margin-top: 0.65rem;
		font: 680 clamp(1rem, 2vw, 1.45rem) / 1.25 var(--font-serif, serif);
		letter-spacing: -0.018em;
	}

	.case-line {
		margin-top: 1.2rem;
		font: 1rem/1.4 var(--font-sans, sans-serif);
	}

	.synthetic {
		margin-top: 0.25rem;
		font: 700 0.67rem/1.4 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.thesis {
		display: grid;
		gap: 1.4rem;
	}

	.thesis > p:first-child {
		font: 680 clamp(1.15rem, 2.5vw, 1.8rem) / 1.35 var(--font-serif, serif);
		letter-spacing: -0.02em;
		text-wrap: balance;
	}

	.machine-dormant {
		display: grid;
		grid-template-columns: auto minmax(3rem, 1fr) auto;
		grid-template-rows: auto auto;
		align-items: center;
		gap: 0.35rem 0.6rem;
		color: var(--ink-muted);
	}

	.machine-dormant span,
	.machine-dormant strong {
		font: 760 0.65rem/1 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.machine-dormant i {
		height: 1px;
		background: repeating-linear-gradient(90deg, var(--rule) 0 0.35rem, transparent 0.35rem 0.6rem);
	}

	.machine-dormant strong {
		grid-column: 1 / -1;
		justify-self: center;
	}

	.entry-controls {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: 1rem;
	}

	.begin-block {
		display: grid;
		justify-items: end;
		gap: 0.4rem;
	}

	.begin {
		min-height: 3.25rem;
		border: 1px solid var(--accent);
		border-radius: 999px;
		background: var(--accent);
		padding: 0.75rem 1.25rem;
		font: 790 0.85rem/1 var(--font-sans, sans-serif);
		color: var(--accent-foreground);
		cursor: pointer;
	}

	.begin:disabled {
		cursor: wait;
		opacity: 0.6;
	}

	.begin:focus-visible,
	.skip-link:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 3px;
	}

	.begin-block p {
		font: 0.68rem/1.35 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	@media (max-width: 68.74rem) {
		.hero {
			min-height: 0;
		}

		.hero-grid,
		.entry-controls {
			grid-template-columns: 1fr;
		}

		.begin-block {
			justify-items: stretch;
		}

		.begin-block p {
			text-align: center;
		}
	}

	@media (max-width: 34rem) {
		.patient-card {
			grid-template-columns: 1fr;
		}

		h1 {
			font-size: clamp(2.4rem, 16vw, 4.6rem);
		}
	}

	@media (forced-colors: active) {
		.hero,
		.patient-mark,
		.begin {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		.begin {
			background: Highlight;
			color: HighlightText;
		}
	}
</style>
