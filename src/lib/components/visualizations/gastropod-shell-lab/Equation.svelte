<script lang="ts">
	import katex from 'katex';

	interface Props {
		formula: string;
		plain: string;
		display?: boolean;
	}

	let { formula, plain, display = false }: Props = $props();

	type RenderOptions = { formula: string; display: boolean };

	function renderMath(node: HTMLDivElement, options: RenderOptions) {
		function render(next: RenderOptions) {
			katex.render(next.formula, node, {
				displayMode: next.display,
				throwOnError: false,
				output: 'htmlAndMathml',
				strict: 'ignore'
			});
		}

		render(options);
		return { update: render };
	}
</script>

<figure class:display class="equation">
	<div class="math" aria-hidden="true" use:renderMath={{ formula, display }}></div>
	<figcaption>{plain}</figcaption>
</figure>

<style>
	.equation {
		margin: 0;
	}

	.math {
		color: var(--cyan);
		overflow-x: auto;
		overflow-y: hidden;
	}

	.equation :global(.katex) {
		font-size: 0.92em;
	}

	.equation.display :global(.katex) {
		font-size: 1.04em;
	}

	figcaption {
		margin-top: 0.32rem;
		font-size: 0.67rem;
		line-height: 1.45;
		color: var(--muted);
	}
</style>
