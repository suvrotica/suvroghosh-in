<script lang="ts">
	let {
		value,
		canRoll,
		rolling,
		label,
		onroll
	}: {
		value: number | null;
		canRoll: boolean;
		rolling: boolean;
		label: string;
		onroll: () => void;
	} = $props();

	const pipMap: Record<number, number[]> = {
		1: [4],
		2: [0, 8],
		3: [0, 4, 8],
		4: [0, 2, 6, 8],
		5: [0, 2, 4, 6, 8],
		6: [0, 2, 3, 5, 6, 8]
	};
	const pipPositions = Array.from({ length: 9 }, (_, index) => index);

	let shownValue = $derived(value ?? 1);
</script>

<button
	type="button"
	class="die-button"
	class:rolling
	disabled={!canRoll}
	aria-label={canRoll ? label : `Die showing ${value ?? 'no roll'}`}
	onclick={onroll}
>
	<span class="die" aria-hidden="true">
		{#each pipPositions as index (index)}
			<span class:pip={pipMap[shownValue]?.includes(index)}></span>
		{/each}
	</span>
	<span class="die-label">{canRoll ? 'Roll the die' : value ? `Rolled ${value}` : 'Waiting'}</span>
</button>

<style>
	.die-button {
		display: inline-flex;
		min-height: 4.7rem;
		align-items: center;
		gap: 0.8rem;
		padding: 0.5rem 0.9rem;
		border: 1px solid #5e5140;
		border-radius: 0.2rem;
		background: #d8c99e;
		box-shadow: 2px 3px 0 rgb(43 36 31 / 0.22);
		color: #2b241f;
		font-weight: 800;
	}

	.die-button:not(:disabled):hover {
		background: #e7dab5;
	}

	.die-button:disabled {
		cursor: default;
		opacity: 0.78;
	}

	.die-button:focus-visible {
		outline: 3px solid #1f5f80;
		outline-offset: 3px;
	}

	.die {
		display: grid;
		width: 3.35rem;
		aspect-ratio: 1;
		flex: none;
		grid-template-columns: repeat(3, 1fr);
		grid-template-rows: repeat(3, 1fr);
		padding: 0.42rem;
		border: 1px solid #8b8069;
		border-radius: 0.48rem;
		background: #eee2be;
		box-shadow:
			inset -3px -4px 0 rgb(88 74 55 / 0.12),
			inset 1px 1px 0 white,
			1px 2px 1px rgb(43 36 31 / 0.28);
	}

	.die > span {
		place-self: center;
		width: 0.48rem;
		aspect-ratio: 1;
		border-radius: 50%;
	}

	.die > span.pip {
		background: #221d19;
		box-shadow:
			inset 1px 1px 1px rgb(0 0 0 / 0.5),
			0 1px 0 rgb(255 255 255 / 0.3);
	}

	.rolling .die {
		animation: die-tumble 520ms cubic-bezier(0.2, 0.75, 0.25, 1);
	}

	.die-label {
		max-width: 7.5rem;
		text-align: left;
	}

	@keyframes die-tumble {
		0% {
			transform: rotate(0deg) translateY(0);
		}
		35% {
			transform: rotate(13deg) translateY(-5px);
		}
		72% {
			transform: rotate(-7deg) translateY(1px);
		}
		100% {
			transform: rotate(0deg) translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.rolling .die {
			animation: none;
		}
	}

	:global(html[data-motion='still']) .rolling .die {
		animation: none;
	}
</style>
