<script lang="ts">
	import type { ActiveDialogue } from '$lib/games/the-repair-shop-on-the-corner/types';

	let {
		dialogue,
		highContrast = false,
		onChoose
	}: {
		dialogue: ActiveDialogue;
		highContrast?: boolean;
		onChoose: (choiceId: string) => void;
	} = $props();

	let firstChoiceBtn = $state<HTMLButtonElement | undefined>();

	$effect(() => {
		const _key = `${dialogue.speakerId}:${dialogue.lines[0] ?? ''}`;
		if (_key && firstChoiceBtn) {
			const id = requestAnimationFrame(() => firstChoiceBtn?.focus({ preventScroll: true }));
			return () => cancelAnimationFrame(id);
		}
	});
</script>

<div class="dialogue-backdrop" role="presentation">
	<div
		class="dialogue-card"
		class:high-contrast={highContrast}
		role="dialog"
		aria-modal="false"
		aria-labelledby="dialogue-speaker-heading"
	>
		<header class="dialogue-header">
			<div>
				<p class="speaker-role">{dialogue.speakerRole}</p>
				<h2 id="dialogue-speaker-heading" class="speaker-name">{dialogue.speakerName}</h2>
			</div>
			<button
				type="button"
				class="skip-btn"
				onclick={() => onChoose('close')}
				aria-label="Close conversation"
			>
				Done (Esc)
			</button>
		</header>

		<div class="dialogue-lines">
			{#each dialogue.lines as line, idx (idx)}
				<p>{line}</p>
			{/each}
		</div>

		<div class="dialogue-choices" role="group" aria-label="Conversation replies">
			{#each dialogue.choices as choice, idx (choice.id)}
				{#if idx === 0}
					<button
						bind:this={firstChoiceBtn}
						type="button"
						class="choice-btn"
						class:primary={choice.id !== 'close'}
						onclick={() => onChoose(choice.id)}
					>
						{choice.label}
					</button>
				{:else}
					<button
						type="button"
						class="choice-btn"
						class:primary={choice.id !== 'close' && idx === 0}
						onclick={() => onChoose(choice.id)}
					>
						{choice.label}
					</button>
				{/if}
			{/each}
		</div>
	</div>
</div>

<style>
	.dialogue-backdrop {
		position: absolute;
		inset: 0;
		z-index: 25;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding: 0.9rem;
		pointer-events: none;
	}

	.dialogue-card {
		pointer-events: auto;
		width: min(680px, 100%);
		max-height: min(78vh, 520px);
		overflow-y: auto;
		border-radius: 16px;
		border: 1px solid rgba(244, 214, 168, 0.34);
		background: rgba(29, 23, 18, 0.96);
		color: #f8efe0;
		padding: 1rem 1.15rem;
		box-shadow: 0 18px 44px rgba(0, 0, 0, 0.52);
	}

	.dialogue-card.high-contrast {
		background: #120f0c;
		border: 2px solid #ffd584;
		color: #ffffff;
	}

	.dialogue-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid rgba(244, 214, 168, 0.16);
		padding-bottom: 0.6rem;
	}

	.speaker-role {
		margin: 0;
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #ebb76c;
	}

	.speaker-name {
		margin: 0.15rem 0 0;
		font-size: 1.2rem;
		font-weight: 800;
		color: #fff6e6;
	}

	.skip-btn {
		min-height: 40px;
		padding: 0.35rem 0.75rem;
		border-radius: 10px;
		border: 1px solid rgba(244, 214, 168, 0.28);
		background: rgba(255, 255, 255, 0.06);
		color: #f3e6cf;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
	}

	.skip-btn:hover,
	.skip-btn:focus-visible {
		background: rgba(255, 255, 255, 0.14);
		outline: 2px solid #ffd584;
		outline-offset: 2px;
	}

	.dialogue-lines {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.dialogue-lines p {
		margin: 0;
		font-size: 0.98rem;
		line-height: 1.55;
		color: #f6ecdc;
	}

	.dialogue-choices {
		margin-top: 0.95rem;
		display: flex;
		flex-direction: column;
		gap: 0.48rem;
	}

	.choice-btn {
		min-height: 44px;
		width: 100%;
		text-align: left;
		padding: 0.62rem 0.9rem;
		border-radius: 11px;
		border: 1px solid rgba(244, 214, 168, 0.28);
		background: rgba(255, 248, 236, 0.07);
		color: #fdf4e5;
		font-size: 0.92rem;
		font-weight: 700;
		cursor: pointer;
		transition: background 120ms ease;
	}

	.choice-btn.primary {
		background: #c87b28;
		border-color: #f3b86b;
		color: #1b130a;
	}

	.choice-btn:hover,
	.choice-btn:focus-visible {
		outline: 2px solid #ffd584;
		outline-offset: 2px;
		filter: brightness(1.08);
	}
</style>
