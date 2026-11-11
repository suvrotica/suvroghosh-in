<script lang="ts">
	import {
		CLOCK_GEARS,
		CLOCK_GEOMETRY,
		formatClockMinutes,
		getActiveToolForJob,
		getBenchTrayItems,
		getRepairHint,
		guideLabel,
		projectorFocusSharpness,
		radioSignalStrength,
		traceClockGearTrain
	} from '$lib/games/the-repair-shop-on-the-corner/repairs';
	import type { WorkbenchActionPayload } from '$lib/games/the-repair-shop-on-the-corner/runtime';
	import { getActiveBenchJobs } from '$lib/games/the-repair-shop-on-the-corner/state';
	import type {
		ClockSlotId,
		JobId,
		ProjectorGuideId,
		RadioComponentId,
		RepairShopGameState,
		RepairShopSettings,
		WorkbenchCameraPreset
	} from '$lib/games/the-repair-shop-on-the-corner/types';

	let {
		state: gameState,
		settings,
		onAction,
		onReturnToCustomer
	}: {
		state: RepairShopGameState;
		settings: RepairShopSettings;
		onAction: (action: WorkbenchActionPayload) => void;
		onReturnToCustomer: (job: JobId) => void;
	} = $props();

	let confirmReset = $state(false);

	const activeJob = $derived<JobId>(gameState.workbench?.activeJob ?? 'radio');
	const activePreset = $derived<WorkbenchCameraPreset>(gameState.workbench?.preset ?? 'front');
	const benchJobs = $derived(getActiveBenchJobs(gameState.jobs));
	const jobStatus = $derived(gameState.jobs[activeJob]);

	const activeTool = $derived(
		getActiveToolForJob(activeJob, gameState.radio, gameState.clock, gameState.projector)
	);
	const trayItems = $derived(
		getBenchTrayItems(
			activeJob,
			gameState.radio,
			gameState.clock,
			gameState.projector,
			gameState.unlocks
		)
	);

	const feedbackText = $derived(
		activeJob === 'radio'
			? gameState.radio.lastFeedback
			: activeJob === 'clock'
				? gameState.clock.lastFeedback
				: gameState.projector.lastFeedback
	);

	const currentHintLevel = $derived(
		activeJob === 'radio'
			? gameState.radio.hintLevel
			: activeJob === 'clock'
				? gameState.clock.hintLevel
				: gameState.projector.hintLevel
	);

	const hintText = $derived(
		currentHintLevel > 0
			? getRepairHint(
					activeJob,
					gameState.radio,
					gameState.clock,
					gameState.projector,
					currentHintLevel as 1 | 2 | 3,
					gameState.unlocks
				)
			: null
	);

	const clockTrace = $derived(traceClockGearTrain(gameState.clock.gearPlacements));
	const radioSignalPct = $derived(Math.round(radioSignalStrength(gameState.radio) * 100));
	const projectorSharpPct = $derived(
		Math.round(projectorFocusSharpness(gameState.projector.focusDial) * 100)
	);

	const jobTitles: Record<JobId, { name: string; customer: string }> = {
		radio: { name: 'Portable Battery Radio', customer: 'Bapi Mondal' },
		clock: { name: 'Wind-Up Wall Clock', customer: 'Mala Sen' },
		projector: { name: '8mm Film Projector', customer: 'Ruma Chatterjee' }
	};

	const radioInspectTargets: readonly { id: RadioComponentId; label: string }[] = [
		{ id: 'battery-pack', label: '1.5V D-cell battery pack' },
		{ id: 'power-board', label: 'Power switch & lamp board' },
		{ id: 'tuning-capacitor', label: 'Brass tuning capacitor' },
		{ id: 'speaker-connector', label: 'Speaker spade connector' }
	];

	const projectorGuides: readonly { id: ProjectorGuideId; label: string }[] = [
		{ id: 'top-roller', label: 'Upper guide roller' },
		{ id: 'film-gate', label: 'Aperture gate' },
		{ id: 'sprocket-wheel', label: 'Toothed drive sprocket' },
		{ id: 'snubber-roller', label: 'Lower tension guide' },
		{ id: 'takeup-spool', label: 'Take-up spool hub' }
	];

	function slotName(slot: ClockSlotId): string {
		if (slot === 'tray') return 'Bench tray';
		return CLOCK_GEOMETRY[slot].label;
	}

	function triggerTrayItemAction(itemId: string) {
		if (itemId.startsWith('radio-screw')) {
			onAction({ type: 'radio-fasten-screw' });
		} else if (itemId === 'radio-cover') {
			onAction({ type: 'radio-toggle-cover' });
		} else if (itemId === 'radio-batteries') {
			onAction({ type: 'radio-toggle-battery' });
		} else if (itemId.startsWith('clock-screw')) {
			onAction({ type: 'clock-fasten-screw' });
		} else if (itemId === 'clock-back') {
			onAction({ type: 'clock-toggle-back' });
		} else if (itemId === 'gear-large' || itemId === 'gear-medium' || itemId === 'gear-small') {
			onAction({ type: 'clock-select-gear', gear: itemId });
		} else if (itemId === 'spare-belt') {
			onAction({ type: 'projector-fit-belt' });
		}
	}
</script>

<aside
	class="workbench-panel"
	class:high-contrast={settings.highContrastLabels}
	aria-label="Workbench repair controls"
>
	<header class="bench-header">
		<div class="bench-title-row">
			<div>
				<p class="eyebrow">Shop Workbench · {jobTitles[activeJob].customer}</p>
				<h2>{jobTitles[activeJob].name}</h2>
			</div>
			<button type="button" class="step-back-btn" onclick={() => onAction({ type: 'leave-bench' })}>
				Step back (Esc)
			</button>
		</div>

		{#if benchJobs.length > 1}
			<div class="job-tabs" role="tablist" aria-label="Switch object on workbench">
				{#each benchJobs as jId (jId)}
					<button
						type="button"
						role="tab"
						aria-selected={activeJob === jId}
						class="job-tab"
						class:active={activeJob === jId}
						onclick={() => {
							confirmReset = false;
							onAction({ type: 'set-job', job: jId });
						}}
					>
						{jobTitles[jId].name}
					</button>
				{/each}
			</div>
		{/if}

		<div class="camera-strip" role="group" aria-label="Workbench camera view and zoom">
			{#each [['front', 'Front'], ['inside', activeJob === 'projector' ? 'Side' : 'Back'], ['detail', 'Close-up'], ['angle', 'Angle']] as const as [presetId, presetLabel] (presetId)}
				<button
					type="button"
					class="cam-btn"
					class:active={activePreset === presetId}
					onclick={() => onAction({ type: 'camera-preset', preset: presetId })}
				>
					{presetLabel}
				</button>
			{/each}
			<button
				type="button"
				class="cam-btn"
				aria-label="Rotate object left"
				onclick={() => onAction({ type: 'camera-nudge', dyaw: -0.32 })}
			>
				↺
			</button>
			<button
				type="button"
				class="cam-btn"
				aria-label="Rotate object right"
				onclick={() => onAction({ type: 'camera-nudge', dyaw: 0.32 })}
			>
				↻
			</button>
			<button
				type="button"
				class="cam-btn"
				aria-label="Zoom in"
				onclick={() => onAction({ type: 'camera-nudge', dzoom: 0.14 })}
			>
				+
			</button>
			<button
				type="button"
				class="cam-btn"
				aria-label="Zoom out"
				onclick={() => onAction({ type: 'camera-nudge', dzoom: -0.14 })}
			>
				−
			</button>
		</div>
	</header>

	<div class="bench-body">
		<div class="feedback-box" class:ready={jobStatus === 'tested'} aria-live="polite">
			<p class="feedback-label">
				{#if jobStatus === 'tested'}
					★ Repair Verified & Tested
				{:else if jobStatus === 'repaired'}
					◕ Fault Repaired — Reassemble & Test
				{:else}
					Observation & Bench Notes
				{/if}
			</p>
			<p class="feedback-text">{feedbackText}</p>
			{#if jobStatus === 'tested'}
				<button
					type="button"
					class="return-customer-btn"
					onclick={() => onReturnToCustomer(activeJob)}
				>
					Carry back to {jobTitles[activeJob].customer} →
				</button>
			{/if}
		</div>

		<div class="tool-banner">
			<span class="tool-tag">Tool at hand:</span>
			<strong>{activeTool.name}</strong>
			<small>{activeTool.purpose}</small>
		</div>

		{#if activeJob === 'radio'}
			{@const r = gameState.radio}
			<section class="control-group" aria-labelledby="radio-case-heading">
				<h3 id="radio-case-heading">1. Power, Case & Closed Test</h3>
				<div class="btn-grid">
					<button
						type="button"
						class="action-btn"
						class:toggled={r.powerOn}
						onclick={() => onAction({ type: 'radio-toggle-power' })}
					>
						{r.powerOn ? 'Power: ON (Switch off)' : 'Switch power on'}
					</button>
					<button
						type="button"
						class="action-btn"
						onclick={() => onAction({ type: 'radio-closed-test' })}
					>
						Test & tilt radio
					</button>
					{#if !r.coverOpen && r.screwsRemoved < 2}
						<button
							type="button"
							class="action-btn"
							onclick={() => onAction({ type: 'radio-unscrew' })}
						>
							Unscrew back screw ({2 - r.screwsRemoved} left)
						</button>
					{/if}
					{#if !r.coverOpen && r.screwsRemoved > 0}
						<button
							type="button"
							class="action-btn"
							onclick={() => onAction({ type: 'radio-fasten-screw' })}
						>
							Fasten screw ({r.screwsRemoved} in tray)
						</button>
					{/if}
					<button
						type="button"
						class="action-btn"
						onclick={() => onAction({ type: 'radio-toggle-cover' })}
					>
						{r.coverOpen ? 'Close back cover' : 'Open back cover'}
					</button>
				</div>
			</section>

			<section class="control-group" aria-labelledby="radio-inside-heading">
				<h3 id="radio-inside-heading">
					2. Internal Components {r.coverOpen ? '(Open)' : '(Open back cover to reach)'}
				</h3>
				<div class="part-list">
					{#each radioInspectTargets as item (item.id)}
						{@const seen = r.inspectedParts.includes(item.id)}
						<button
							type="button"
							class="part-btn"
							class:selected={r.selectedPart === item.id}
							onclick={() => onAction({ type: 'radio-inspect', part: item.id })}
						>
							<span>{seen ? '✓' : '○'} Inspect {item.label}</span>
							{#if item.id === 'speaker-connector' && seen}
								<small>{r.speakerConnectorSeated ? 'Firmly seated' : 'Loose on lug!'}</small>
							{:else if item.id === 'battery-pack' && seen}
								<small>{r.batteryClipSeated ? 'Healthy 3.0V' : 'In tray'}</small>
							{/if}
						</button>
					{/each}
				</div>

				{#if r.coverOpen}
					<div class="btn-grid sub-actions">
						{#if r.inspectedParts.includes('speaker-connector') && !r.speakerConnectorSeated}
							<button
								type="button"
								class="action-btn highlight"
								onclick={() => onAction({ type: 'radio-seat-speaker' })}
							>
								Seat speaker connector firmly
							</button>
						{/if}
						<button
							type="button"
							class="action-btn"
							onclick={() => onAction({ type: 'radio-toggle-battery' })}
						>
							{r.batteryClipSeated ? 'Unclip battery pack' : 'Clip batteries back in'}
						</button>
					</div>
				{/if}
			</section>

			<section class="control-group" aria-labelledby="radio-tune-heading">
				<h3 id="radio-tune-heading">
					3. Tuning Dial ({(550 + r.tuningDial * 10.5).toFixed(0)} kHz)
				</h3>
				<label class="range-control">
					<span class="range-meta">
						<span>Signal clarity: {radioSignalPct}%</span>
						<span>{r.stationTuned ? '★ Station locked' : 'Sweep for clear broadcast'}</span>
					</span>
					<input
						type="range"
						min="0"
						max="100"
						step="1"
						value={r.tuningDial}
						aria-label="Radio tuning dial"
						oninput={(e) =>
							onAction({
								type: 'radio-tune',
								value: Number((e.currentTarget as HTMLInputElement).value)
							})}
					/>
					<div class="meter-track" aria-hidden="true">
						<div class="meter-fill" style={`width: ${radioSignalPct}%`}></div>
					</div>
				</label>
			</section>
		{:else if activeJob === 'clock'}
			{@const c = gameState.clock}
			<section class="control-group" aria-labelledby="clock-case-heading">
				<h3 id="clock-case-heading">1. Brass Case & Winding Check</h3>
				<div class="btn-grid">
					{#if !c.backOpen && c.screwsRemoved < 2}
						<button
							type="button"
							class="action-btn"
							onclick={() => onAction({ type: 'clock-unscrew' })}
						>
							Unscrew thumbscrew ({2 - c.screwsRemoved} left)
						</button>
					{/if}
					{#if !c.backOpen && c.screwsRemoved > 0}
						<button
							type="button"
							class="action-btn"
							onclick={() => onAction({ type: 'clock-fasten-screw' })}
						>
							Fasten thumbscrew ({c.screwsRemoved} in tray)
						</button>
					{/if}
					<button
						type="button"
						class="action-btn"
						onclick={() => onAction({ type: 'clock-toggle-back' })}
					>
						{c.backOpen ? 'Close brass back plate' : 'Open brass back plate'}
					</button>
					<button
						type="button"
						class="action-btn highlight"
						onclick={() => onAction({ type: 'clock-turn-input' })}
					>
						Turn winding key slowly
					</button>
				</div>

				{#if c.backOpen && c.inputTurned}
					<p class="trace-note">
						<strong>Motion check:</strong>
						{clockTrace.reachesHands
							? 'Mainspring → Shaft 1 → Shaft 2 → Shaft 3 → Hands wheel all turning!'
							: (clockTrace.stoppedAt ?? clockTrace.explanation)}
					</p>
				{/if}
			</section>

			<section class="control-group" aria-labelledby="clock-gears-heading">
				<h3 id="clock-gears-heading">
					2. Arrange Brass Wheels {c.backOpen
						? '(Select wheel, then choose arbor)'
						: '(Open back first)'}
				</h3>
				<div class="part-list">
					{#each ['gear-large', 'gear-medium', 'gear-small'] as const as gId (gId)}
						{@const gear = CLOCK_GEARS[gId]}
						{@const isSelected = c.selectedGearForPlacement === gId}
						<div class="gear-card" class:selected={isSelected}>
							<div class="gear-card-top">
								<div>
									<strong>{gear.label}</strong>
									<small>{gear.shapeCue} · Currently: {slotName(c.gearPlacements[gId])}</small>
								</div>
								<button
									type="button"
									class="mini-select-btn"
									disabled={!c.backOpen}
									onclick={() =>
										onAction({
											type: 'clock-select-gear',
											gear: isSelected ? null : gId
										})}
								>
									{isSelected ? 'Selected' : 'Move…'}
								</button>
							</div>
							{#if isSelected && c.backOpen}
								<div
									class="slot-row"
									role="group"
									aria-label={`Destination for ${gear.shortLabel}`}
								>
									{#each [['shaft-1', 'Shaft 1 (Left)'], ['shaft-2', 'Shaft 2 (Centre)'], ['shaft-3', 'Shaft 3 (Right)'], ['tray', 'Tray']] as const as [slotId, slotLbl] (slotId)}
										<button
											type="button"
											class="slot-btn"
											class:current={c.gearPlacements[gId] === slotId}
											onclick={() =>
												onAction({ type: 'clock-place-gear', gear: gId, slot: slotId })}
										>
											{slotLbl}
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</section>

			<section class="control-group" aria-labelledby="clock-hands-heading">
				<h3 id="clock-hands-heading">
					3. Set Front Hands ({formatClockMinutes(c.handsMinutes)} · target ~4:30)
				</h3>
				<label class="range-control">
					<span class="range-meta">
						<span>Dial reading: {formatClockMinutes(c.handsMinutes)}</span>
						<span>{c.handsSet ? '★ Set near 4:30' : 'Turn to ~4:30'}</span>
					</span>
					<input
						type="range"
						min="0"
						max="715"
						step="5"
						value={c.handsMinutes}
						aria-label="Set clock hands time"
						oninput={(e) =>
							onAction({
								type: 'clock-set-hands',
								minutes: Number((e.currentTarget as HTMLInputElement).value)
							})}
					/>
				</label>
			</section>
		{:else}
			{@const p = gameState.projector}
			<section class="control-group" aria-labelledby="proj-case-heading">
				<h3 id="proj-case-heading">1. Power, Housing & Drive Belt</h3>
				<div class="btn-grid">
					<button
						type="button"
						class="action-btn"
						class:toggled={p.powerOn}
						onclick={() => onAction({ type: 'projector-toggle-power' })}
					>
						{p.powerOn ? 'Projector: ON (Switch off)' : 'Switch projector on'}
					</button>
					<button
						type="button"
						class="action-btn"
						onclick={() => onAction({ type: 'projector-toggle-cover' })}
					>
						{p.coverOpen ? 'Close side cover' : 'Open side cover'}
					</button>
					<button
						type="button"
						class="action-btn"
						onclick={() => onAction({ type: 'projector-inspect', part: 'lamp-housing' })}
					>
						Inspect lamp housing
					</button>
					<button
						type="button"
						class="action-btn"
						onclick={() => onAction({ type: 'projector-inspect', part: 'drive-belt' })}
					>
						Inspect drive belt ({p.beltState === 'spare_fitted'
							? 'Fresh belt'
							: p.beltState === 'removed'
								? 'Removed'
								: 'Perished'})
					</button>
					{#if p.coverOpen && !p.powerOn && p.beltState === 'worn'}
						<button
							type="button"
							class="action-btn highlight"
							onclick={() => onAction({ type: 'projector-remove-belt' })}
						>
							Remove perished belt
						</button>
					{/if}
					{#if p.coverOpen && !p.powerOn && p.beltState === 'removed'}
						<button
							type="button"
							class="action-btn highlight"
							onclick={() => onAction({ type: 'projector-fit-belt' })}
						>
							{gameState.unlocks.spareBeltInDrawer
								? 'Fit spare belt from Bapi'
								: 'Check spare belt availability'}
						</button>
					{/if}
				</div>
			</section>

			<section class="control-group" aria-labelledby="proj-thread-heading">
				<h3 id="proj-thread-heading">2. Film Threading & Manual Advance</h3>
				<p class="route-readout">
					<strong>Current film path ({p.threadedGuides.length}/5):</strong>
					{p.threadedGuides.length > 0
						? p.threadedGuides.map((g) => guideLabel(g)).join(' → ')
						: 'Rewound at supply spool'}
				</p>

				<div class="part-list">
					{#each projectorGuides as g (g.id)}
						{@const orderIdx = p.threadedGuides.indexOf(g.id)}
						<button
							type="button"
							class="part-btn"
							class:selected={orderIdx !== -1}
							disabled={!p.coverOpen || p.powerOn}
							onclick={() => onAction({ type: 'projector-thread', guide: g.id })}
						>
							<span>{orderIdx !== -1 ? `#${orderIdx + 1}` : '+'} Thread {g.label}</span>
							<small>{orderIdx !== -1 ? 'Threaded' : 'Tap to route'}</small>
						</button>
					{/each}
				</div>

				<div class="btn-grid sub-actions">
					<button
						type="button"
						class="action-btn"
						disabled={!p.coverOpen || p.powerOn || p.threadedGuides.length === 0}
						onclick={() => onAction({ type: 'projector-undo-guide' })}
					>
						Undo last guide
					</button>
					<button
						type="button"
						class="action-btn"
						disabled={!p.coverOpen || p.powerOn || p.threadedGuides.length === 0}
						onclick={() => onAction({ type: 'projector-rewind' })}
					>
						Rewind film leader
					</button>
					<button
						type="button"
						class="action-btn highlight"
						disabled={!p.coverOpen || p.powerOn}
						onclick={() => onAction({ type: 'projector-manual-turn' })}
					>
						Turn mechanism manually
					</button>
				</div>
			</section>

			<section class="control-group" aria-labelledby="proj-focus-heading">
				<h3 id="proj-focus-heading">
					3. Focus Lens Barrel (Test Card Clarity: {projectorSharpPct}%)
				</h3>
				<label class="range-control">
					<span class="range-meta">
						<span>Optical sharpness: {projectorSharpPct}%</span>
						<span>{p.focusLocked ? '★ Test card pin-sharp' : 'Run closed & focus test card'}</span>
					</span>
					<input
						type="range"
						min="0"
						max="100"
						step="1"
						value={p.focusDial}
						aria-label="Projector lens focus barrel"
						oninput={(e) =>
							onAction({
								type: 'projector-focus',
								value: Number((e.currentTarget as HTMLInputElement).value)
							})}
					/>
					<div class="meter-track" aria-hidden="true">
						<div class="meter-fill" style={`width: ${projectorSharpPct}%`}></div>
					</div>
				</label>
			</section>
		{/if}

		<section class="control-group tray-section" aria-labelledby="bench-tray-heading">
			<h3 id="bench-tray-heading">Bench Parts Tray ({trayItems.length})</h3>
			{#if trayItems.length === 0}
				<p class="empty-tray">
					Tray empty — removed screws and spare parts automatically rest here.
				</p>
			{:else}
				<ul class="tray-list">
					{#each trayItems as item (item.id)}
						<li class="tray-item">
							<span>{item.label}</span>
							{#if item.actionLabel}
								<button
									type="button"
									class="tray-action-btn"
									onclick={() => triggerTrayItemAction(item.id)}
								>
									{item.actionLabel}
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="control-group hint-section" aria-label="Hints and repair reset">
			<div class="hint-row">
				<button type="button" class="hint-btn" onclick={() => onAction({ type: 'ask-hint' })}>
					{currentHintLevel === 0
						? 'Need a hint? (1/3 · Gentle clue)'
						: currentHintLevel === 1
							? 'More specific hint (2/3 · Area)'
							: currentHintLevel === 2
								? 'Exact next action (3/3)'
								: 'Showing clearest hint (3/3)'}
				</button>

				{#if !confirmReset}
					<button type="button" class="reset-bench-btn" onclick={() => (confirmReset = true)}>
						Reset this repair
					</button>
				{:else}
					<div class="inline-confirm">
						<button
							type="button"
							class="reset-confirm-btn"
							onclick={() => {
								confirmReset = false;
								onAction({ type: 'reset-repair', job: activeJob });
							}}
						>
							Confirm reset
						</button>
						<button type="button" class="cam-btn" onclick={() => (confirmReset = false)}>
							Cancel
						</button>
					</div>
				{/if}
			</div>

			{#if hintText}
				<p class="hint-callout" role="status">
					<strong>Hint ({currentHintLevel}/3):</strong>
					{hintText}
				</p>
			{/if}
		</section>
	</div>
</aside>

<style>
	.workbench-panel {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-height: 0;
		background: #1d1712;
		border-left: 1px solid rgba(244, 214, 168, 0.24);
		color: #f7eedf;
		overflow: hidden;
	}

	.workbench-panel.high-contrast {
		background: #0d0a08;
		border-color: #ffd584;
		color: #ffffff;
	}

	.bench-header {
		flex-shrink: 0;
		padding: 0.75rem 0.9rem 0.65rem;
		border-bottom: 1px solid rgba(244, 214, 168, 0.16);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: rgba(255, 255, 255, 0.02);
	}

	.bench-title-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.6rem;
	}

	.eyebrow {
		margin: 0;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: #ebb76c;
	}

	h2 {
		margin: 0.1rem 0 0;
		font-size: 1.08rem;
		font-weight: 800;
	}

	.step-back-btn {
		min-height: 40px;
		padding: 0.35rem 0.72rem;
		border-radius: 9px;
		border: 1px solid rgba(244, 214, 168, 0.32);
		background: rgba(255, 255, 255, 0.07);
		color: #f8efe0;
		font-size: 0.8rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
	}

	.job-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.job-tab {
		min-height: 36px;
		padding: 0.28rem 0.65rem;
		border-radius: 8px;
		border: 1px solid rgba(244, 214, 168, 0.25);
		background: transparent;
		color: #e2d3bc;
		font-size: 0.76rem;
		font-weight: 700;
		cursor: pointer;
	}

	.job-tab.active {
		background: #ce7f28;
		border-color: #f4be72;
		color: #191108;
	}

	.camera-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.cam-btn {
		min-height: 36px;
		min-width: 36px;
		padding: 0.24rem 0.55rem;
		border-radius: 8px;
		border: 1px solid rgba(244, 214, 168, 0.24);
		background: rgba(255, 255, 255, 0.05);
		color: #f4e8d4;
		font-size: 0.76rem;
		font-weight: 700;
		cursor: pointer;
	}

	.cam-btn.active {
		border-color: #f2bc70;
		background: rgba(216, 137, 46, 0.26);
		color: #ffe5bc;
	}

	.bench-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0.75rem 0.9rem 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.feedback-box {
		padding: 0.65rem 0.8rem;
		border-radius: 12px;
		background: rgba(240, 181, 98, 0.11);
		border: 1px solid rgba(240, 181, 98, 0.36);
	}

	.feedback-box.ready {
		background: rgba(68, 158, 102, 0.2);
		border-color: #7ad39c;
	}

	.feedback-label {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #f0be73;
	}

	.feedback-box.ready .feedback-label {
		color: #a9f0c3;
	}

	.feedback-text {
		margin: 0.22rem 0 0;
		font-size: 0.86rem;
		line-height: 1.45;
		color: #faf1e4;
	}

	.return-customer-btn {
		margin-top: 0.55rem;
		min-height: 44px;
		width: 100%;
		border-radius: 10px;
		border: 1px solid #96eab5;
		background: #2f8b54;
		color: #f6fff9;
		font-size: 0.88rem;
		font-weight: 800;
		cursor: pointer;
	}

	.tool-banner {
		padding: 0.48rem 0.7rem;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(244, 214, 168, 0.16);
		font-size: 0.8rem;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.35rem;
	}

	.tool-tag {
		color: #e7b56c;
		font-weight: 700;
	}

	.tool-banner small {
		display: block;
		width: 100%;
		color: #d2c1a9;
		font-size: 0.75rem;
	}

	.control-group {
		padding: 0.65rem 0.75rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.035);
		border: 1px solid rgba(244, 214, 168, 0.15);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.control-group h3 {
		margin: 0;
		font-size: 0.84rem;
		font-weight: 800;
		color: #f3d6a7;
	}

	.btn-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
		gap: 0.42rem;
	}

	.sub-actions {
		margin-top: 0.2rem;
	}

	.action-btn {
		min-height: 44px;
		padding: 0.45rem 0.7rem;
		border-radius: 10px;
		border: 1px solid rgba(244, 214, 168, 0.28);
		background: rgba(255, 248, 236, 0.07);
		color: #f9f0e2;
		font-size: 0.81rem;
		font-weight: 700;
		text-align: center;
		cursor: pointer;
	}

	.action-btn:disabled,
	.part-btn:disabled,
	.mini-select-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.action-btn.toggled {
		background: rgba(212, 74, 52, 0.28);
		border-color: #f29483;
	}

	.action-btn.highlight {
		background: #cf8028;
		border-color: #f5c176;
		color: #191108;
		font-weight: 800;
	}

	.part-list {
		display: flex;
		flex-direction: column;
		gap: 0.36rem;
	}

	.part-btn {
		min-height: 42px;
		padding: 0.42rem 0.68rem;
		border-radius: 9px;
		border: 1px solid rgba(244, 214, 168, 0.22);
		background: rgba(255, 255, 255, 0.05);
		color: #f7eedf;
		font-size: 0.8rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		cursor: pointer;
		text-align: left;
	}

	.part-btn.selected {
		border-color: #f2bc70;
		background: rgba(216, 137, 46, 0.2);
	}

	.part-btn small {
		font-size: 0.73rem;
		color: #eac184;
	}

	.gear-card {
		padding: 0.5rem 0.65rem;
		border-radius: 10px;
		border: 1px solid rgba(244, 214, 168, 0.22);
		background: rgba(255, 255, 255, 0.04);
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.gear-card.selected {
		border-color: #f3bd71;
		background: rgba(216, 137, 46, 0.16);
	}

	.gear-card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.gear-card-top strong {
		display: block;
		font-size: 0.81rem;
	}

	.gear-card-top small {
		display: block;
		font-size: 0.73rem;
		color: #d6c5ad;
	}

	.mini-select-btn {
		min-height: 38px;
		padding: 0.3rem 0.65rem;
		border-radius: 8px;
		border: 1px solid rgba(244, 214, 168, 0.32);
		background: rgba(255, 255, 255, 0.09);
		color: #faf0e1;
		font-size: 0.76rem;
		font-weight: 700;
		cursor: pointer;
		flex-shrink: 0;
	}

	.slot-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.35rem;
	}

	.slot-btn {
		min-height: 38px;
		padding: 0.3rem 0.5rem;
		border-radius: 8px;
		border: 1px solid #f0b96b;
		background: #c87b26;
		color: #191108;
		font-size: 0.76rem;
		font-weight: 800;
		cursor: pointer;
	}

	.slot-btn.current {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(244, 214, 168, 0.28);
		color: #e6d7c1;
	}

	.trace-note,
	.route-readout {
		margin: 0;
		font-size: 0.79rem;
		line-height: 1.4;
		color: #eedec6;
	}

	.range-control {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.range-meta {
		display: flex;
		justify-content: space-between;
		font-size: 0.77rem;
		color: #ead8be;
	}

	.range-control input[type='range'] {
		width: 100%;
		min-height: 32px;
		accent-color: #df8f33;
	}

	.meter-track {
		height: 7px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.1);
		overflow: hidden;
	}

	.meter-fill {
		height: 100%;
		background: linear-gradient(90deg, #c97824, #6fd095);
		transition: width 120ms ease;
	}

	.empty-tray {
		margin: 0;
		font-size: 0.78rem;
		color: #cbb9a0;
	}

	.tray-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.tray-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.36rem 0.55rem;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.05);
		font-size: 0.79rem;
	}

	.tray-action-btn {
		min-height: 34px;
		padding: 0.22rem 0.58rem;
		border-radius: 7px;
		border: 1px solid #f0b96b;
		background: rgba(216, 137, 46, 0.25);
		color: #ffe5bc;
		font-size: 0.74rem;
		font-weight: 700;
		cursor: pointer;
	}

	.hint-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.45rem;
	}

	.hint-btn,
	.reset-bench-btn,
	.reset-confirm-btn {
		min-height: 40px;
		padding: 0.38rem 0.72rem;
		border-radius: 9px;
		font-size: 0.79rem;
		font-weight: 700;
		cursor: pointer;
	}

	.hint-btn {
		border: 1px solid rgba(244, 214, 168, 0.34);
		background: rgba(255, 255, 255, 0.08);
		color: #faf0e1;
	}

	.reset-bench-btn {
		border: 1px solid rgba(244, 152, 130, 0.45);
		background: transparent;
		color: #ffc5b8;
	}

	.reset-confirm-btn {
		border: 1px solid #f59488;
		background: #b5382a;
		color: #ffffff;
	}

	.inline-confirm {
		display: flex;
		gap: 0.35rem;
	}

	.hint-callout {
		margin: 0;
		padding: 0.52rem 0.68rem;
		border-radius: 9px;
		background: rgba(235, 183, 108, 0.14);
		border: 1px solid rgba(235, 183, 108, 0.38);
		font-size: 0.81rem;
		line-height: 1.42;
		color: #fff3de;
	}

	@media (max-width: 899px) {
		.workbench-panel {
			border-left: none;
			border-top: 1px solid rgba(244, 214, 168, 0.28);
		}

		.bench-header {
			padding: 0.55rem 0.75rem;
		}

		.bench-body {
			padding: 0.6rem 0.75rem 0.9rem;
		}
	}
</style>
