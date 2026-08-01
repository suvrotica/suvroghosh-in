<script lang="ts">
	import type { ColoringMode, FractalFamily } from '$lib/visualizations/fractal-atlas/types';

	type Props = {
		label: string;
		preset?: string;
		family?: FractalFamily;
		exponent?: number;
		coloring?: ColoringMode;
		panel?: 'orbit' | 'colour' | 'precision' | 'presets';
		command?: 'step' | 'tour';
	};

	let { label, preset, family, exponent, coloring, panel, command }: Props = $props();

	function activate() {
		window.dispatchEvent(
			new CustomEvent('fractal-atlas-command', {
				detail: { preset, family, exponent, coloring, panel, action: command }
			})
		);
	}
</script>

<button class="fractal-jump not-prose" type="button" onclick={activate}>
	<span aria-hidden="true">↗</span>
	{label}
</button>

<style>
	.fractal-jump {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.55rem;
		margin: 0.7rem 0.35rem 0.7rem 0;
		border: 1px solid color-mix(in oklab, var(--essay-ink) 55%, var(--rule));
		border-radius: 999px;
		background: color-mix(in oklab, var(--essay-ink) 9%, var(--paper-raised));
		padding: 0.55rem 0.9rem;
		color: var(--ink);
		font: 700 0.82rem/1.2 var(--font-sans);
		letter-spacing: 0.01em;
		cursor: pointer;
		transition:
			transform var(--motion-fast) var(--ease-standard),
			background var(--motion-fast) var(--ease-standard);
	}

	.fractal-jump:hover {
		background: color-mix(in oklab, var(--essay-ink) 16%, var(--paper-raised));
		transform: translateY(-1px);
	}

	@media (prefers-reduced-motion: reduce) {
		.fractal-jump {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.fractal-jump {
			border: 2px solid ButtonText;
			background: ButtonFace;
			color: ButtonText;
		}
	}
</style>
