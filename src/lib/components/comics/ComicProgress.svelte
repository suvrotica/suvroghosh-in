<script lang="ts">
	let {
		current,
		total,
		label
	}: {
		current: number;
		total: number;
		label: string;
	} = $props();

	const percentage = $derived(total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0);
</script>

<div class="comic-progress">
	<div class="comic-progress__label">
		<span>{label}</span>
		<span>{Math.round(percentage)}%</span>
	</div>
	<div
		class="comic-progress__track"
		role="progressbar"
		aria-valuemin="0"
		aria-valuemax={total}
		aria-valuenow={current}
		aria-label={label}
	>
		<span style={`width:${percentage}%`}></span>
	</div>
</div>

<style>
	.comic-progress {
		min-width: min(18rem, 100%);
		font-family: Roboto, Arial, sans-serif;
	}

	.comic-progress__label {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.28rem;
		color: #f8efdd;
		font-size: 0.72rem;
		font-weight: 650;
	}

	.comic-progress__track {
		height: 0.36rem;
		overflow: hidden;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.2);
	}

	.comic-progress__track span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--comic-caption, #f1d996);
		transition: width 160ms ease-out;
	}

	@media (prefers-reduced-motion: reduce) {
		.comic-progress__track span {
			transition: none;
		}
	}
</style>
