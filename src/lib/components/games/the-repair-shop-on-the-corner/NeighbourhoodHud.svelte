<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		SCREENING_DURATION_SECONDS,
		deriveCurrentObjective,
		getActiveBenchJobs,
		getNearbyPrompts
	} from '$lib/games/the-repair-shop-on-the-corner/state';
	import type {
		JobId,
		JobStatus,
		RepairShopGameState,
		RepairShopSettings
	} from '$lib/games/the-repair-shop-on-the-corner/types';
	import { getAfternoonLighting } from '$lib/games/the-repair-shop-on-the-corner/world';

	let {
		state: gameState,
		settings,
		fullscreenSupported = false,
		isFullscreen = false,
		onInteract,
		onOpenBenchJob,
		onCloseDrawer,
		onFinishScreening,
		onToggleMute,
		onToggleFullscreen,
		onOpenPause
	}: {
		state: RepairShopGameState;
		settings: RepairShopSettings;
		fullscreenSupported?: boolean;
		isFullscreen?: boolean;
		onInteract: (targetId: string) => void;
		onOpenBenchJob: (job: JobId) => void;
		onCloseDrawer: () => void;
		onFinishScreening: () => void;
		onToggleMute: () => void;
		onToggleFullscreen: () => void;
		onOpenPause: () => void;
	} = $props();

	let showJobLedger = $state(false);
	let showAllPlaces = $state(false);

	const lighting = $derived(getAfternoonLighting(gameState.afternoonPhase));
	const objective = $derived(deriveCurrentObjective(gameState));
	const prompts = $derived(getNearbyPrompts(gameState));
	const inReachPrompts = $derived(prompts.filter((p) => p.inReach));
	const benchJobs = $derived(getActiveBenchJobs(gameState.jobs));
	const returnedCount = $derived(
		(['radio', 'clock', 'projector'] as const).filter((j) => gameState.jobs[j] === 'returned')
			.length
	);

	const jobMeta: Record<JobId, { title: string; customer: string; place: string }> = {
		radio: {
			title: 'Portable Battery Radio',
			customer: 'Bapi Mondal',
			place: 'Tea stall'
		},
		clock: {
			title: 'Wind-Up Wall Clock',
			customer: 'Mala Sen',
			place: 'Sen Brothers'
		},
		projector: {
			title: '8mm Film Projector',
			customer: 'Ruma Chatterjee',
			place: 'Shared courtyard'
		}
	};

	function formatStatus(status: JobStatus): { icon: string; text: string } {
		switch (status) {
			case 'not_started':
				return { icon: '○', text: 'Not yet accepted' };
			case 'accepted':
				return { icon: '◐', text: 'On workbench' };
			case 'inspected':
				return { icon: '◑', text: 'Inspected' };
			case 'repaired':
				return { icon: '◕', text: 'Repaired — test next' };
			case 'tested':
				return { icon: '★', text: 'Tested — ready to return' };
			case 'returned':
				return { icon: '✓', text: 'Returned & working' };
		}
	}

	const screeningSceneCaption = $derived.by(() => {
		const loopT =
			((gameState.screeningElapsedSeconds % SCREENING_DURATION_SECONDS) +
				SCREENING_DURATION_SECONDS) %
			SCREENING_DURATION_SECONDS;
		if (loopT < 6) {
			return 'On screen: Title card — “Afternoon Across the Roofs · বিকেলের ছাদ” (Reel I).';
		}
		if (loopT < 15) {
			return 'On screen: Red and teal paper kites dip above sunlit Calcutta parapet roofs and shuttered windows.';
		}
		if (loopT < 24) {
			return 'On screen: Steam curls from a clay bhaar tea cup beside a singing portable radio.';
		}
		if (loopT < 31.5) {
			return 'On screen: A warm-lit yellow tram glides quietly beneath overhead wires at dusk.';
		}
		return 'On screen: “সমাপ্ত · End of Reel — Radio · Clock · Projector Working Again.”';
	});

	const ambientSoundCue = $derived.by(() => {
		const cues: string[] = [];
		if (gameState.unlocks.teaStallRadioPlaying) cues.push('Tea-stall radio humming gently');
		if (gameState.unlocks.shopClockTicking) cues.push('Sen Brothers clock ticking');
		if (gameState.mode === 'screening') cues.push('8mm projector shutter purring');
		return cues.join(' · ');
	});
</script>

<div class="hud-layer" class:high-contrast={settings.highContrastLabels}>
	<header class="hud-top">
		<div class="hud-brand-group">
			<a href={resolve('/blog/games')} class="top-pill link-pill" aria-label="Back to Games">
				← Games
			</a>
			<div class="objective-banner">
				<p class="time-kicker">{lighting.timeLabel} · Kusumtala Corner</p>
				<p class="objective-line"><strong>Next:</strong> {objective}</p>
			</div>
		</div>

		<div class="hud-actions">
			<button
				type="button"
				class="top-pill"
				aria-expanded={showJobLedger}
				onclick={() => (showJobLedger = !showJobLedger)}
			>
				Jobs ({returnedCount}/3)
			</button>
			<button
				type="button"
				class="top-pill"
				aria-pressed={!settings.soundEnabled}
				onclick={onToggleMute}
			>
				{settings.soundEnabled ? 'Sound: On' : 'Muted'}
			</button>
			{#if fullscreenSupported}
				<button type="button" class="top-pill hide-narrow" onclick={onToggleFullscreen}>
					{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
				</button>
			{/if}
			<button type="button" class="top-pill" onclick={onOpenPause}>Options</button>
		</div>
	</header>

	{#if showJobLedger}
		<aside class="job-ledger" aria-label="Repair job list">
			<div class="ledger-head">
				<h2>Afternoon Repair Ledger</h2>
				<button type="button" class="mini-close" onclick={() => (showJobLedger = false)}>
					Close
				</button>
			</div>
			<ul class="ledger-list">
				{#each ['radio', 'clock', 'projector'] as const as jobId (jobId)}
					{@const st = formatStatus(gameState.jobs[jobId])}
					<li class="ledger-item">
						<div>
							<strong>{jobMeta[jobId].title}</strong>
							<small>{jobMeta[jobId].customer} · {jobMeta[jobId].place}</small>
						</div>
						<div class="ledger-right">
							<span class="status-badge" data-status={gameState.jobs[jobId]}>
								<span aria-hidden="true">{st.icon}</span>
								{st.text}
							</span>
							{#if benchJobs.includes(jobId)}
								<button
									type="button"
									class="ledger-bench-btn"
									onclick={() => {
										showJobLedger = false;
										onOpenBenchJob(jobId);
									}}
								>
									Open on bench
								</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</aside>
	{/if}

	{#if gameState.mode === 'drawer' && gameState.drawerMessage}
		<div class="centre-card-wrap">
			<div class="drawer-card" role="dialog" aria-labelledby="drawer-heading">
				<p class="eyebrow">Workshop Storage</p>
				<h2 id="drawer-heading">Labelled Wooden Drawers</h2>
				<p class="drawer-body">{gameState.drawerMessage}</p>
				<ul class="drawer-grid">
					<li><strong>Drawer 1:</strong> Slotted & knurled brass screws — stocked</li>
					<li><strong>Drawer 2:</strong> Contact springs & spade lugs — stocked</li>
					<li><strong>Drawer 3:</strong> Felt pads & fuse wire — stocked</li>
					<li>
						<strong>Drawer 4:</strong> Square rubber drive belts —
						{gameState.unlocks.spareBeltInDrawer
							? 'Haripada’s tin from Bapi (ready)'
							: 'Empty (note mentions Bapi at the tea stall)'}
					</li>
				</ul>
				<button type="button" class="primary-action" onclick={onCloseDrawer}>
					Close drawer (Esc)
				</button>
			</div>
		</div>
	{:else if gameState.mode === 'screening'}
		<div class="screening-bar">
			<div class="screening-caption" aria-live="polite">
				<p class="eyebrow">
					Kusumtala Courtyard Screening · {gameState.unlocks.screeningCompleted
						? 'Chapter Complete (Reel Looping)'
						: 'Playing Live on Cloth Screen'}
				</p>
				<p class="screening-text">{screeningSceneCaption}</p>
				{#if ambientSoundCue}
					<p class="sound-caption">Soundscape: {ambientSoundCue}</p>
				{/if}
			</div>
			<button type="button" class="primary-action" onclick={onFinishScreening}>
				Step back & explore lane
			</button>
		</div>
	{:else if gameState.mode === 'explore'}
		<div class="hud-bottom">
			<div class="caption-strip" aria-live="polite">
				<span>{gameState.statusCaption}</span>
				{#if ambientSoundCue}
					<small class="sound-caption">Audio cue: {ambientSoundCue}</small>
				{/if}
			</div>

			<div class="interact-strip" role="region" aria-label="Nearby and neighbourhood actions">
				<div class="nearby-buttons">
					{#each inReachPrompts.slice(0, 2) as prompt (prompt.id)}
						<button type="button" class="primary-action" onclick={() => onInteract(prompt.id)}>
							{prompt.label}
						</button>
					{/each}

					<button
						type="button"
						class="walk-toggle-btn"
						aria-expanded={showAllPlaces}
						onclick={() => (showAllPlaces = !showAllPlaces)}
					>
						{showAllPlaces ? 'Hide Walk & Visit' : 'Walk & Visit…'}
					</button>
				</div>

				{#if showAllPlaces || inReachPrompts.length === 0}
					<div class="quick-walk-row" role="group" aria-label="Walk to a person or place">
						{#each prompts as item (item.id)}
							<button
								type="button"
								class="place-chip"
								class:in-reach={item.inReach}
								onclick={() => {
									showAllPlaces = false;
									onInteract(item.id);
								}}
							>
								<span>{item.label}</span>
								<small
									>{item.inReach
										? 'Here'
										: `${Math.max(1, Math.round(item.distanceMetres))}m`}</small
								>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.hud-layer {
		position: absolute;
		inset: 0;
		z-index: 15;
		pointer-events: none;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 0.7rem 0.85rem;
		gap: 0.65rem;
	}

	.hud-top {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.55rem;
	}

	.hud-brand-group {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.55rem;
		pointer-events: auto;
		max-width: min(720px, 100%);
	}

	.objective-banner {
		padding: 0.45rem 0.8rem;
		border-radius: 12px;
		background: rgba(24, 19, 15, 0.86);
		border: 1px solid rgba(244, 214, 168, 0.28);
		backdrop-filter: blur(6px);
	}

	.hud-layer.high-contrast .objective-banner,
	.hud-layer.high-contrast .top-pill,
	.hud-layer.high-contrast .caption-strip,
	.hud-layer.high-contrast .job-ledger,
	.hud-layer.high-contrast .drawer-card,
	.hud-layer.high-contrast .screening-bar {
		background: #0e0b08;
		border: 2px solid #ffd584;
		color: #ffffff;
	}

	.time-kicker {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #edb86f;
	}

	.objective-line {
		margin: 0.12rem 0 0;
		font-size: 0.88rem;
		line-height: 1.35;
		color: #f9f0e1;
	}

	.hud-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.42rem;
		pointer-events: auto;
	}

	.top-pill {
		min-height: 44px;
		padding: 0.42rem 0.78rem;
		border-radius: 11px;
		border: 1px solid rgba(244, 214, 168, 0.3);
		background: rgba(24, 19, 15, 0.86);
		color: #f8efe0;
		font-size: 0.83rem;
		font-weight: 700;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		backdrop-filter: blur(6px);
	}

	.top-pill:hover,
	.top-pill:focus-visible {
		background: rgba(48, 38, 29, 0.95);
		outline: 2px solid #ffd584;
		outline-offset: 2px;
	}

	.job-ledger {
		pointer-events: auto;
		align-self: flex-end;
		width: min(460px, 100%);
		border-radius: 14px;
		border: 1px solid rgba(244, 214, 168, 0.32);
		background: rgba(25, 20, 16, 0.95);
		padding: 0.85rem 1rem;
		color: #f8efe0;
		box-shadow: 0 16px 38px rgba(0, 0, 0, 0.5);
	}

	.ledger-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.55rem;
	}

	.ledger-head h2 {
		margin: 0;
		font-size: 0.96rem;
		font-weight: 800;
	}

	.mini-close {
		min-height: 36px;
		padding: 0.25rem 0.65rem;
		border-radius: 8px;
		border: 1px solid rgba(244, 214, 168, 0.28);
		background: transparent;
		color: #f3e4cd;
		font-size: 0.78rem;
		font-weight: 700;
		cursor: pointer;
	}

	.ledger-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.ledger-item {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.55rem 0.65rem;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.05);
	}

	.ledger-item strong {
		display: block;
		font-size: 0.88rem;
	}

	.ledger-item small {
		font-size: 0.76rem;
		color: #d6c5ad;
	}

	.ledger-right {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	.status-badge {
		font-size: 0.78rem;
		font-weight: 700;
		padding: 0.22rem 0.52rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		color: #f6e7cf;
	}

	.status-badge[data-status='tested'] {
		background: rgba(226, 152, 54, 0.28);
		border: 1px solid #f2b866;
		color: #ffe3b3;
	}

	.status-badge[data-status='returned'] {
		background: rgba(74, 158, 108, 0.26);
		border: 1px solid #7cd19e;
		color: #dcfae7;
	}

	.ledger-bench-btn {
		min-height: 36px;
		padding: 0.28rem 0.6rem;
		border-radius: 8px;
		border: 1px solid #f0b665;
		background: #cf8028;
		color: #191108;
		font-size: 0.76rem;
		font-weight: 800;
		cursor: pointer;
	}

	.centre-card-wrap {
		pointer-events: auto;
		margin: auto;
		width: min(520px, 100%);
	}

	.drawer-card {
		border-radius: 16px;
		border: 1px solid rgba(244, 214, 168, 0.35);
		background: rgba(26, 20, 15, 0.96);
		padding: 1rem 1.15rem;
		color: #f8efe0;
		box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55);
	}

	.eyebrow {
		margin: 0;
		font-size: 0.73rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #edb86f;
	}

	.drawer-card h2 {
		margin: 0.18rem 0 0.55rem;
		font-size: 1.18rem;
	}

	.drawer-body {
		margin: 0 0 0.65rem;
		font-size: 0.9rem;
		line-height: 1.48;
	}

	.drawer-grid {
		margin: 0 0 0.9rem;
		padding-left: 1.1rem;
		font-size: 0.84rem;
		line-height: 1.5;
		color: #eadbc6;
	}

	.hud-bottom {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: 0.48rem;
		align-items: flex-start;
	}

	.caption-strip {
		pointer-events: auto;
		max-width: min(680px, 100%);
		padding: 0.48rem 0.8rem;
		border-radius: 11px;
		background: rgba(22, 18, 14, 0.84);
		border: 1px solid rgba(244, 214, 168, 0.24);
		color: #f7ecdc;
		font-size: 0.85rem;
		line-height: 1.4;
		display: flex;
		flex-direction: column;
		gap: 0.16rem;
	}

	.sound-caption {
		font-size: 0.75rem;
		color: #e6be84;
	}

	.interact-strip {
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		width: 100%;
	}

	.nearby-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.primary-action {
		min-height: 44px;
		padding: 0.52rem 0.95rem;
		border-radius: 11px;
		border: 1px solid #f5c176;
		background: #d38329;
		color: #191108;
		font-size: 0.88rem;
		font-weight: 800;
		cursor: pointer;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.34);
	}

	.walk-toggle-btn {
		min-height: 44px;
		padding: 0.5rem 0.85rem;
		border-radius: 11px;
		border: 1px solid rgba(244, 214, 168, 0.34);
		background: rgba(24, 19, 15, 0.88);
		color: #f8efe0;
		font-size: 0.84rem;
		font-weight: 700;
		cursor: pointer;
	}

	.quick-walk-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.38rem;
		max-width: 920px;
	}

	.place-chip {
		min-height: 42px;
		padding: 0.38rem 0.72rem;
		border-radius: 10px;
		border: 1px solid rgba(244, 214, 168, 0.28);
		background: rgba(26, 20, 15, 0.9);
		color: #f6ecdc;
		font-size: 0.8rem;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		cursor: pointer;
	}

	.place-chip.in-reach {
		border-color: #f2bc71;
		background: rgba(66, 45, 24, 0.94);
	}

	.place-chip small {
		font-size: 0.72rem;
		color: #e2ba80;
	}

	.screening-bar {
		pointer-events: auto;
		margin-top: auto;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-radius: 14px;
		background: rgba(20, 16, 13, 0.9);
		border: 1px solid rgba(244, 214, 168, 0.3);
	}

	.screening-caption {
		max-width: 680px;
	}

	.screening-text {
		margin: 0.18rem 0 0;
		font-size: 0.9rem;
		color: #faf0e1;
	}

	@media (max-width: 640px) {
		.hide-narrow {
			display: none;
		}

		.hud-layer {
			padding: 0.5rem 0.6rem;
		}

		.objective-line {
			font-size: 0.81rem;
		}
	}
</style>
