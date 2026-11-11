<script lang="ts">
	import { resolve } from '$app/paths';
	import type { JobId, RepairShopSettings } from '$lib/games/the-repair-shop-on-the-corner/types';

	let {
		settings,
		activeRepairJob,
		onUpdateSettings,
		onResetCurrentRepair,
		onStartNewGame,
		onResume
	}: {
		settings: RepairShopSettings;
		activeRepairJob: JobId | null;
		onUpdateSettings: (next: RepairShopSettings) => void;
		onResetCurrentRepair: (job: JobId) => void;
		onStartNewGame: () => void;
		onResume: () => void;
	} = $props();

	let resumeBtn = $state<HTMLButtonElement | undefined>();
	let confirmingNewGame = $state(false);

	const jobNames: Record<JobId, string> = {
		radio: 'portable radio',
		clock: 'wind-up clock',
		projector: 'film projector'
	};

	$effect(() => {
		if (resumeBtn) {
			const id = requestAnimationFrame(() => resumeBtn?.focus({ preventScroll: true }));
			return () => cancelAnimationFrame(id);
		}
	});
</script>

<div class="modal-backdrop" role="presentation">
	<div
		class="pause-modal"
		class:high-contrast={settings.highContrastLabels}
		role="dialog"
		aria-modal="true"
		aria-labelledby="pause-modal-heading"
	>
		<header class="modal-header">
			<div>
				<p class="eyebrow">Kusumtala Corner · Paused</p>
				<h2 id="pause-modal-heading">Workshop Options</h2>
			</div>
			<button bind:this={resumeBtn} type="button" class="primary-btn" onclick={onResume}>
				Resume (Esc)
			</button>
		</header>

		<div class="settings-grid">
			<label class="toggle-row">
				<span>
					<strong>Soundscape & repair audio</strong>
					<small>Every symptom and clue also appears as visible text when muted.</small>
				</span>
				<input
					type="checkbox"
					checked={settings.soundEnabled}
					onchange={(e) =>
						onUpdateSettings({
							...settings,
							soundEnabled: (e.currentTarget as HTMLInputElement).checked
						})}
				/>
			</label>

			<label class="slider-row">
				<span>
					<strong>Master volume ({Math.round(settings.masterVolume * 100)}%)</strong>
				</span>
				<input
					type="range"
					min="0"
					max="100"
					step="5"
					value={Math.round(settings.masterVolume * 100)}
					oninput={(e) =>
						onUpdateSettings({
							...settings,
							masterVolume: Number((e.currentTarget as HTMLInputElement).value) / 100
						})}
				/>
			</label>

			<label class="toggle-row">
				<span>
					<strong>Reduced motion</strong>
					<small>Steadies camera movement, ceiling fan spin, and film frame cadence.</small>
				</span>
				<input
					type="checkbox"
					checked={settings.reducedMotion}
					onchange={(e) =>
						onUpdateSettings({
							...settings,
							reducedMotion: (e.currentTarget as HTMLInputElement).checked
						})}
				/>
			</label>

			<label class="toggle-row">
				<span>
					<strong>High-contrast labels</strong>
					<small>Uses crisp dark cards and bright borders across HUD and bench controls.</small>
				</span>
				<input
					type="checkbox"
					checked={settings.highContrastLabels}
					onchange={(e) =>
						onUpdateSettings({
							...settings,
							highContrastLabels: (e.currentTarget as HTMLInputElement).checked
						})}
				/>
			</label>
		</div>

		<div class="reset-section">
			{#if activeRepairJob}
				<div class="reset-row">
					<div>
						<strong>Reset current repair only</strong>
						<p>
							Restores the {jobNames[activeRepairJob]} on your bench without losing finished neighbourhood
							jobs.
						</p>
					</div>
					<button
						type="button"
						class="secondary-btn"
						onclick={() => {
							onResetCurrentRepair(activeRepairJob);
							onResume();
						}}
					>
						Reset {jobNames[activeRepairJob]}
					</button>
				</div>
			{/if}

			<div class="reset-row">
				<div>
					<strong>Start new afternoon</strong>
					<p>Clears saved progress in this browser and begins fresh from Bapi’s visit.</p>
				</div>
				{#if !confirmingNewGame}
					<button
						type="button"
						class="danger-outline-btn"
						onclick={() => (confirmingNewGame = true)}
					>
						Start new game…
					</button>
				{:else}
					<div class="confirm-pair">
						<button
							type="button"
							class="danger-btn"
							onclick={() => {
								confirmingNewGame = false;
								onStartNewGame();
							}}
						>
							Confirm new game
						</button>
						<button type="button" class="secondary-btn" onclick={() => (confirmingNewGame = false)}>
							Keep save
						</button>
					</div>
				{/if}
			</div>
		</div>

		<footer class="modal-footer">
			<a href={resolve('/blog/games')} class="games-link">← Return to Games</a>
			<a href="#about-the-game" class="games-link" onclick={onResume}>About & controls ↓</a>
		</footer>
	</div>
</div>

<style>
	.modal-backdrop {
		position: absolute;
		inset: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: rgba(12, 10, 8, 0.72);
		backdrop-filter: blur(4px);
	}

	.pause-modal {
		width: min(560px, 100%);
		max-height: min(88vh, 680px);
		overflow-y: auto;
		border-radius: 18px;
		border: 1px solid rgba(244, 214, 168, 0.32);
		background: #201a15;
		color: #f7eedf;
		padding: 1.15rem 1.25rem;
		box-shadow: 0 24px 56px rgba(0, 0, 0, 0.65);
	}

	.pause-modal.high-contrast {
		background: #0f0c09;
		border: 2px solid #ffd584;
		color: #ffffff;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid rgba(244, 214, 168, 0.16);
		padding-bottom: 0.75rem;
	}

	.eyebrow {
		margin: 0;
		font-size: 0.74rem;
		font-weight: 700;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: #eab568;
	}

	h2 {
		margin: 0.15rem 0 0;
		font-size: 1.3rem;
		font-weight: 800;
	}

	.settings-grid {
		margin-top: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.9rem;
		padding: 0.6rem 0.75rem;
		border-radius: 11px;
		background: rgba(255, 255, 255, 0.04);
		cursor: pointer;
	}

	.toggle-row span {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.toggle-row strong,
	.slider-row strong {
		font-size: 0.92rem;
	}

	.toggle-row small {
		font-size: 0.8rem;
		color: #d6c5ad;
		line-height: 1.35;
	}

	.toggle-row input[type='checkbox'] {
		width: 22px;
		height: 22px;
		accent-color: #df8f33;
		flex-shrink: 0;
	}

	.slider-row {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.6rem 0.75rem;
		border-radius: 11px;
		background: rgba(255, 255, 255, 0.04);
	}

	.slider-row input[type='range'] {
		width: 100%;
		accent-color: #df8f33;
	}

	.reset-section {
		margin-top: 0.95rem;
		padding-top: 0.85rem;
		border-top: 1px solid rgba(244, 214, 168, 0.16);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.reset-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
	}

	.reset-row strong {
		font-size: 0.9rem;
	}

	.reset-row p {
		margin: 0.15rem 0 0;
		font-size: 0.8rem;
		color: #d6c5ad;
		max-width: 320px;
	}

	.confirm-pair {
		display: flex;
		gap: 0.45rem;
	}

	.primary-btn,
	.secondary-btn,
	.danger-outline-btn,
	.danger-btn {
		min-height: 44px;
		padding: 0.5rem 0.9rem;
		border-radius: 10px;
		font-size: 0.86rem;
		font-weight: 700;
		cursor: pointer;
	}

	.primary-btn {
		background: #d8892e;
		border: 1px solid #f6c077;
		color: #191108;
	}

	.secondary-btn {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(244, 214, 168, 0.3);
		color: #f7eedf;
	}

	.danger-outline-btn {
		background: transparent;
		border: 1px solid rgba(244, 143, 120, 0.55);
		color: #ffbeb0;
	}

	.danger-btn {
		background: #b93829;
		border: 1px solid #f59488;
		color: #fff8f6;
	}

	.modal-footer {
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid rgba(244, 214, 168, 0.16);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.games-link {
		min-height: 40px;
		display: inline-flex;
		align-items: center;
		color: #f3c47d;
		font-size: 0.88rem;
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 4px;
	}
</style>
