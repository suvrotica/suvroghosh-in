<script lang="ts">
	type EventLike = {
		type?: string;
		sourceFeature?: string;
		explanation?: string;
		pitchHz?: number;
		velocity01?: number;
	};

	type Props = {
		event?: EventLike | null;
		regionLabel?: string;
		mode?: 'raw' | 'noise' | 'braided';
	};

	let { event = null, regionLabel = 'warming', mode = 'braided' }: Props = $props();
</script>

<section class="causal" aria-labelledby="sa-causal-title" data-testid="sa-causal-legend">
	<div class="heading">
		<p>Why did I hear that?</p>
		<span>{mode} view</span>
	</div>
	<h3 id="sa-causal-title">
		{event?.explanation ?? 'The orbit is warming; the first causal event has not arrived yet.'}
	</h3>
	<div class="ledger" aria-label="Current causal mapping">
		<span><i class="orbit" aria-hidden="true"></i>Orbit <b>{regionLabel}</b></span>
		<span
			><i class="weather" aria-hidden="true"></i>Weather
			<b>{event?.sourceFeature ?? 'sampling'}</b></span
		>
		<span
			><i class="voice" aria-hidden="true"></i>Voice
			<b>{event?.pitchHz ? `${Math.round(event.pitchHz)} Hz` : 'waiting'}</b></span
		>
	</div>
</section>

<style>
	.causal {
		min-width: 0;
		border: 1px solid rgb(216 213 197 / 18%);
		border-radius: 0.55rem;
		background: #090e11;
		padding: 0.85rem 1rem;
	}

	.heading,
	.ledger,
	.ledger span {
		display: flex;
		align-items: center;
	}

	.heading {
		justify-content: space-between;
		gap: 1rem;
	}

	.heading p,
	.heading span {
		margin: 0;
		font: 700 0.62rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.heading p {
		color: #76c9cc;
	}

	.heading span {
		color: #7c8582;
	}

	h3 {
		margin: 0.55rem 0 0.75rem;
		color: #eee9dc;
		font: 680 clamp(1rem, 2.1vw, 1.35rem) / 1.25 var(--font-serif, serif);
		letter-spacing: -0.02em;
	}

	.ledger {
		flex-wrap: wrap;
		gap: 0.42rem 0.9rem;
		color: #858d89;
		font: 600 0.63rem/1.35 var(--font-mono, monospace);
	}

	.ledger span {
		gap: 0.35rem;
	}

	.ledger b {
		color: #c6c5bb;
		font-weight: 600;
	}

	i {
		display: inline-block;
		width: 0.58rem;
		height: 0.58rem;
		border: 1px solid currentColor;
	}

	i.orbit {
		border-radius: 50%;
		color: #d4c8ae;
	}

	i.weather {
		transform: rotate(45deg);
		color: #77c9cd;
	}

	i.voice {
		border-radius: 50% 50% 0 50%;
		color: #c99066;
	}
</style>
