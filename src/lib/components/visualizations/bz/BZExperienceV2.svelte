<script lang="ts">
	import { onMount, tick } from 'svelte';
	import BZGalleryV2 from './BZGalleryV2.svelte';
	import BZLaboratory from './BZLaboratory.svelte';
	import BZParityProbe from './BZParityProbe.svelte';
	import BZProofV2 from './BZProofV2.svelte';
	import BZV2ModeTabs from './BZV2ModeTabs.svelte';
	import {
		bzV2HeroPreset,
		hasCompleteValidatedBZV2HeroSet,
		type BZV2SharedSessionSnapshot
	} from './v2-experience-model';
	import { BZ_V2_CALIBRATION_MANIFEST } from '$lib/visualizations/bz/calibration/manifest';
	import type { BZV2HeroId, BZV2Layer } from '$lib/visualizations/bz/v2-types';

	const completeHeroSet = hasCompleteValidatedBZV2HeroSet(BZ_V2_CALIBRATION_MANIFEST);
	const initialLayer: BZV2Layer = completeHeroSet ? 'gallery' : 'laboratory';
	let layer = $state<BZV2Layer>(initialLayer);
	let experience: HTMLElement | undefined = $state();
	let parityProbe = $state(false);
	let laboratoryVisited = $state(initialLayer === 'laboratory');
	let selectedHeroId = $state<BZV2HeroId>('persistent-single-spiral');
	let laboratoryHeroId = $state<BZV2HeroId | null>(null);
	let laboratoryRequestRevision = $state(0);
	let sharedSession = $state.raw<BZV2SharedSessionSnapshot | null>(null);
	let laboratoryPreset = $derived(
		bzV2HeroPreset(BZ_V2_CALIBRATION_MANIFEST, laboratoryHeroId ?? selectedHeroId)
	);

	onMount(() => {
		parityProbe = new URLSearchParams(window.location.search).get('bz_v2_parity') === '1';
	});

	function selectLayer(next: BZV2Layer) {
		if (next === 'laboratory') requestLaboratorySetup(selectedHeroId, false);
		layer = next;
	}

	function requestLaboratorySetup(heroId: BZV2HeroId, force: boolean) {
		laboratoryVisited = true;
		if (!force && laboratoryHeroId === heroId) return;
		laboratoryHeroId = heroId;
		if (bzV2HeroPreset(BZ_V2_CALIBRATION_MANIFEST, heroId)) laboratoryRequestRevision += 1;
	}

	function handleGallerySession(next: Readonly<BZV2SharedSessionSnapshot>) {
		sharedSession = next;
		selectedHeroId = next.heroId;
	}

	async function openLaboratory(heroId: BZV2HeroId) {
		selectedHeroId = heroId;
		requestLaboratorySetup(heroId, true);
		layer = 'laboratory';
		await tick();
		experience?.querySelector<HTMLElement>('#bz-v2-panel-laboratory')?.focus();
	}
</script>

<section
	class="experience"
	bind:this={experience}
	data-testid="bz-v2-experience"
	data-layer={layer}
	aria-labelledby="bz-v2-experience-title"
>
	<header class="experience-header">
		<div class="title-copy">
			<p>BZ Laboratory V2 · numerical exhibit</p>
			<h2 id="bz-v2-experience-title">Chemical waves, spectacle with receipts</h2>
			<span>
				One numerical state can be viewed as a luminous dish, inspected as raw fields, and audited
				against its calibration record.
			</span>
		</div>
		<div class="header-side">
			<span class="readiness" data-ready={completeHeroSet}>
				<i></i>{completeHeroSet ? 'Three validated heroes' : 'Validation boundary active'}
			</span>
			<BZV2ModeTabs value={layer} onchange={selectLayer} />
		</div>
	</header>

	{#if parityProbe}
		<BZParityProbe />
	{/if}

	<div
		id="bz-v2-panel-gallery"
		role="tabpanel"
		aria-labelledby="bz-v2-tab-gallery"
		tabindex={layer === 'gallery' ? 0 : -1}
		class="mode-panel"
		hidden={layer !== 'gallery'}
	>
		<BZGalleryV2
			onopenlaboratory={openLaboratory}
			onselectionchange={(heroId) => (selectedHeroId = heroId)}
			onsessionchange={handleGallerySession}
		/>
	</div>

	<div
		id="bz-v2-panel-laboratory"
		role="tabpanel"
		aria-labelledby="bz-v2-tab-laboratory"
		tabindex={layer === 'laboratory' ? 0 : -1}
		class="mode-panel lab-panel"
		hidden={layer !== 'laboratory'}
	>
		{#if !completeHeroSet}
			<div class="boundary-note" role="note">
				<b>The Gallery is not promoted yet.</b>
				<span>
					The public V2 manifest does not contain all three validated hero regimes. This established
					laboratory remains available for candidate experiments without relabelling them as proof.
				</span>
			</div>
		{/if}
		{#if laboratoryPreset}
			<div class="handoff-note" role="note">
				<b>{laboratoryPreset.title} · shared setup hand-off</b>
				<span>
					Laboratory opens the exact manifest setup plus
					{laboratoryPreset.initialInterventions.length} declared intervention{laboratoryPreset
						.initialInterventions.length === 1
						? ''
						: 's'} at genesis. The mature Gallery solver remains mounted and unchanged.
				</span>
			</div>
		{/if}
		{#if laboratoryVisited}
			<BZLaboratory
				requestedV2Preset={laboratoryPreset}
				requestRevision={laboratoryRequestRevision}
			/>
		{/if}
	</div>

	<div
		id="bz-v2-panel-proof"
		role="tabpanel"
		aria-labelledby="bz-v2-tab-proof"
		tabindex={layer === 'proof' ? 0 : -1}
		class="mode-panel"
		hidden={layer !== 'proof'}
	>
		<BZProofV2 session={sharedSession} active={layer === 'proof'} />
	</div>

	<footer>
		<p>
			Dimensionless numerical model, not a reagent recipe. Display interpolation, representative
			colour and bloom never feed back into the reaction–diffusion state.
		</p>
	</footer>
</section>

<style>
	.experience {
		--v2-paper: #edf0e8;
		--v2-muted: rgb(237 240 232 / 0.62);
		--v2-wine: #8e4b55;
		--v2-cyan: #267f93;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: min(82rem, calc(100vw - 2rem));
		margin-block: 2rem 3rem;
		transform: translateX(-50%);
		overflow: clip;
		border: 1px solid #35413f;
		border-radius: clamp(1rem, 2.5vw, 1.6rem);
		background: #101719;
		color: var(--v2-paper);
		box-shadow: 0 2rem 5rem rgb(7 11 12 / 0.26);
	}
	.experience-header {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(25rem, 0.95fr);
		gap: clamp(1rem, 3vw, 2rem);
		align-items: end;
		padding: clamp(1rem, 3vw, 1.6rem);
		border-bottom: 1px solid rgb(255 255 255 / 0.1);
		background:
			radial-gradient(circle at 83% -10%, rgb(38 127 147 / 0.2), transparent 36%),
			radial-gradient(circle at 15% 0%, rgb(142 75 85 / 0.25), transparent 43%), #121a1c;
	}
	.title-copy > p {
		margin: 0 0 0.35rem;
		color: #e1a78b;
		font:
			700 0.64rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.title-copy h2 {
		max-width: 20ch;
		margin: 0;
		font-family: var(--font-serif, 'Source Serif 4', serif);
		font-size: clamp(1.45rem, 3.4vw, 2.8rem);
		line-height: 1;
		letter-spacing: -0.035em;
	}
	.title-copy > span {
		display: block;
		max-width: 62ch;
		margin-top: 0.65rem;
		color: var(--v2-muted);
		font-size: 0.76rem;
		line-height: 1.5;
	}
	.header-side {
		display: grid;
		gap: 0.5rem;
		min-width: 0;
	}
	.readiness {
		display: inline-flex;
		justify-self: end;
		align-items: center;
		gap: 0.45rem;
		color: #ffdf93;
		font:
			700 0.6rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.readiness i {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: #ffce63;
		box-shadow: 0 0 0 3px rgb(255 206 99 / 0.15);
	}
	.readiness[data-ready='true'] {
		color: #9cd6c4;
	}
	.readiness[data-ready='true'] i {
		background: #61b69d;
		box-shadow: 0 0 0 3px rgb(97 182 157 / 0.16);
	}
	.mode-panel {
		min-width: 0;
		outline: none;
	}
	.mode-panel:focus-visible {
		box-shadow: inset 0 0 0 3px #ffce63;
	}
	.boundary-note {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.75rem;
		align-items: start;
		margin: 1rem clamp(1rem, 3vw, 2rem) 0;
		border: 1px solid rgb(255 206 99 / 0.34);
		border-left-width: 4px;
		border-radius: 0.7rem;
		background: rgb(255 206 99 / 0.055);
		color: #ffdf93;
		padding: 0.7rem 0.85rem;
		font-size: 0.69rem;
		line-height: 1.5;
	}
	.boundary-note span {
		color: rgb(255 223 147 / 0.72);
	}
	.handoff-note {
		display: flex;
		gap: 0.75rem;
		align-items: baseline;
		margin: 1rem clamp(1rem, 3vw, 2rem) 0;
		border-left: 3px solid rgb(38 127 147 / 0.7);
		background: rgb(38 127 147 / 0.07);
		padding: 0.65rem 0.8rem;
		color: rgb(237 240 232 / 0.68);
		font-size: 0.66rem;
		line-height: 1.45;
	}
	.handoff-note b {
		color: #80c9d7;
		white-space: nowrap;
	}
	.lab-panel :global(.laboratory) {
		left: auto;
		width: 100%;
		margin: 0;
		transform: none;
		border: 0;
		border-radius: 0;
		box-shadow: none;
	}
	footer {
		border-top: 1px solid rgb(255 255 255 / 0.08);
		background: #0d1416;
		padding: 0.7rem clamp(1rem, 3vw, 1.6rem);
	}
	footer p {
		margin: 0;
		color: rgb(237 240 232 / 0.45);
		font-size: 0.62rem;
		line-height: 1.5;
	}
	@media (max-width: 900px) {
		.experience-header {
			grid-template-columns: minmax(0, 1fr);
		}
		.readiness {
			justify-self: start;
		}
	}
	@media (max-width: 680px) {
		.experience {
			width: calc(100vw - 1rem);
			margin-block: 1rem 2rem;
			border-radius: 0.9rem;
		}
		.experience-header {
			padding: 0.85rem;
		}
		.title-copy > span {
			font-size: 0.7rem;
		}
		.boundary-note {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.2rem;
			margin-inline: 0.85rem;
		}
		.handoff-note {
			display: grid;
			gap: 0.2rem;
			margin-inline: 0.85rem;
		}
		.handoff-note b {
			white-space: normal;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.experience,
		.experience * {
			scroll-behavior: auto;
		}
	}
	:global(html[data-motion='still']) .experience * {
		transition: none !important;
		animation: none !important;
	}
</style>
