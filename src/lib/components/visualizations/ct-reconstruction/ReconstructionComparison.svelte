<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { ReconstructionMetrics } from '$lib/visualizations/ct-reconstruction';
	import ReconstructionView from './ReconstructionView.svelte';

	type ViewMode = 'truth' | 'backprojection' | 'filtered' | 'error' | 'compare';
	type CompactLayout = 'desktop' | 'tablet' | 'phone';

	type ViewOption = {
		id: ViewMode;
		label: string;
		shortLabel: string;
		controls: string;
	};

	type Props = {
		groundTruth: Float32Array;
		backprojection?: Float32Array | null;
		filteredBackprojection?: Float32Array | null;
		size: number;
		filterLabel: string;
		partial?: boolean;
		progress?: number;
		backprojectionMetrics?: ReconstructionMetrics | null;
		filteredMetrics?: ReconstructionMetrics | null;
		autoWindow?: boolean;
		windowCenter?: number;
		windowWidth?: number;
		zoom?: number;
	};

	let {
		groundTruth,
		backprojection = null,
		filteredBackprojection = null,
		size,
		filterLabel,
		partial = false,
		progress = 0,
		backprojectionMetrics = null,
		filteredMetrics = null,
		autoWindow = true,
		windowCenter = 0.5,
		windowWidth = 1,
		zoom = 1
	}: Props = $props();

	const STANDARD_VIEWS: ViewOption[] = [
		{
			id: 'truth',
			label: 'Ground truth',
			shortLabel: 'Truth',
			controls: 'ct-reconstruction-truth-panel'
		},
		{
			id: 'backprojection',
			label: 'Ordinary back-projection',
			shortLabel: 'Back-projection',
			controls: 'ct-reconstruction-backprojection-panel'
		},
		{
			id: 'filtered',
			label: 'Filtered back-projection',
			shortLabel: 'Filtered',
			controls: 'ct-reconstruction-filtered-panel'
		},
		{
			id: 'error',
			label: 'Filtered error',
			shortLabel: 'Error',
			controls: 'ct-reconstruction-error-panel'
		}
	];
	const COMPARE_VIEW: ViewOption = {
		id: 'compare',
		label: 'Compare ordinary and filtered back-projection',
		shortLabel: 'Compare BP ↔ FBP',
		controls: 'ct-reconstruction-backprojection-panel ct-reconstruction-filtered-panel'
	};
	const PHONE_MAX_REM = 40;
	const TABLET_MAX_REM = 56;
	const COMPARE_MIN_REM = 34;

	let comparisonElement: HTMLElement;
	let comparisonHeading: HTMLHeadingElement;
	let viewSwitcherElement: HTMLDivElement;
	let activeView = $state<ViewMode>('filtered');
	let compactLayout = $state<CompactLayout>('desktop');
	let comparisonWidth = $state(0);
	let compareMinWidth = $state(COMPARE_MIN_REM * 16);
	let userSelectedView = $state(false);
	let responsiveUpdateId = 0;
	let viewOptions = $derived(
		comparisonWidth >= compareMinWidth ? [...STANDARD_VIEWS, COMPARE_VIEW] : STANDARD_VIEWS
	);

	function scaleInvariantDifference(
		truth: Float32Array,
		estimate: Float32Array | null
	): Float32Array | null {
		if (!estimate || estimate.length !== truth.length) return null;
		let dot = 0;
		let energy = 0;
		for (let index = 0; index < truth.length; index += 1) {
			const value = estimate[index];
			if (!Number.isFinite(value)) continue;
			dot += truth[index] * value;
			energy += value * value;
		}
		const scale = energy > 1e-12 ? dot / energy : 0;
		const difference = new Float32Array(truth.length);
		for (let index = 0; index < truth.length; index += 1) {
			difference[index] = estimate[index] * scale - truth[index];
		}
		return difference;
	}

	let difference = $derived(scaleInvariantDifference(groundTruth, filteredBackprojection));

	function metric(value: number | undefined, digits = 3) {
		return value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
	}

	function selectView(view: ViewMode, userInitiated = true) {
		if (view === 'compare' && comparisonWidth < compareMinWidth) return;
		activeView = view;
		if (userInitiated) userSelectedView = true;
	}

	function handleViewKeydown(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
			return;
		}

		const tablist = event.currentTarget as HTMLElement;
		const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
		const currentIndex = tabs.indexOf(event.target as HTMLButtonElement);
		if (currentIndex < 0 || tabs.length === 0) return;

		event.preventDefault();
		let nextIndex: number;
		if (event.key === 'Home') nextIndex = 0;
		else if (event.key === 'End') nextIndex = tabs.length - 1;
		else if (event.key === 'ArrowRight') {
			nextIndex = (currentIndex + 1) % tabs.length;
		} else {
			nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
		}

		const nextTab = tabs[nextIndex];
		nextTab.focus();
		selectView(nextTab.dataset.view as ViewMode);
	}

	function responsiveThresholds() {
		const rootFontSize =
			Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
		return {
			phoneMaxWidth: PHONE_MAX_REM * rootFontSize,
			tabletMaxWidth: TABLET_MAX_REM * rootFontSize,
			compareMinWidth: COMPARE_MIN_REM * rootFontSize
		};
	}

	async function updateResponsiveLayout(width: number) {
		const updateId = ++responsiveUpdateId;
		const thresholds = responsiveThresholds();
		const activeElement = document.activeElement;
		const focusWasInSwitcher =
			activeElement instanceof HTMLElement && viewSwitcherElement?.contains(activeElement);
		const focusedView =
			activeElement instanceof HTMLElement
				? (activeElement.dataset.view as ViewMode | undefined)
				: undefined;

		comparisonWidth = width;
		compareMinWidth = thresholds.compareMinWidth;
		const nextLayout: CompactLayout =
			width <= thresholds.phoneMaxWidth
				? 'phone'
				: width <= thresholds.tabletMaxWidth
					? 'tablet'
					: 'desktop';

		if (activeView === 'compare' && width < thresholds.compareMinWidth) {
			activeView = 'filtered';
		}
		if (nextLayout !== compactLayout && !userSelectedView) {
			activeView = nextLayout === 'tablet' ? 'compare' : 'filtered';
		}
		compactLayout = nextLayout;

		if (!focusWasInSwitcher) return;
		await tick();
		if (updateId !== responsiveUpdateId) return;
		if (nextLayout === 'desktop') {
			comparisonHeading.focus({ preventScroll: true });
			return;
		}
		if (focusedView === 'compare' && width < thresholds.compareMinWidth) {
			document.getElementById('ct-reconstruction-filtered-tab')?.focus({ preventScroll: true });
		}
	}

	onMount(() => {
		const refreshResponsiveLayout = () => {
			void updateResponsiveLayout(comparisonElement.getBoundingClientRect().width);
		};
		const resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) void updateResponsiveLayout(entry.contentRect.width);
		});
		const rootObserver = new MutationObserver(refreshResponsiveLayout);
		resizeObserver.observe(comparisonElement);
		rootObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'style']
		});
		window.addEventListener('resize', refreshResponsiveLayout);
		window.visualViewport?.addEventListener('resize', refreshResponsiveLayout);
		refreshResponsiveLayout();
		return () => {
			resizeObserver.disconnect();
			rootObserver.disconnect();
			window.removeEventListener('resize', refreshResponsiveLayout);
			window.visualViewport?.removeEventListener('resize', refreshResponsiveLayout);
		};
	});
</script>

<section
	class="comparison"
	bind:this={comparisonElement}
	aria-labelledby="ct-reconstruction-heading"
>
	<div class="comparison-heading">
		<div>
			<p>Same sinogram, two operations</p>
			<h3 bind:this={comparisonHeading} id="ct-reconstruction-heading" tabindex="-1">
				Reconstruction comparison
			</h3>
		</div>
		<span>{filterLabel}</span>
	</div>

	<div class="view-switcher" bind:this={viewSwitcherElement}>
		<span id="ct-reconstruction-view-label">Image view</span>
		<div
			class="view-tabs"
			role="tablist"
			aria-labelledby="ct-reconstruction-view-label"
			aria-orientation="horizontal"
			tabindex="-1"
			onkeydown={handleViewKeydown}
		>
			{#each viewOptions as option (option.id)}
				<button
					type="button"
					role="tab"
					id={`ct-reconstruction-${option.id}-tab`}
					class:compare-tab={option.id === 'compare'}
					aria-label={option.label}
					aria-selected={activeView === option.id}
					aria-controls={option.controls}
					tabindex={activeView === option.id ? 0 : -1}
					data-view={option.id}
					onclick={() => selectView(option.id)}
				>
					{option.shortLabel}
				</button>
			{/each}
		</div>
	</div>

	<div class="image-grid" data-view={activeView}>
		<div
			id="ct-reconstruction-truth-panel"
			class="stage stage-truth"
			role={compactLayout === 'desktop' ? undefined : 'tabpanel'}
			aria-labelledby={compactLayout === 'desktop' ? undefined : 'ct-reconstruction-truth-tab'}
		>
			<ReconstructionView
				title="Ground-truth phantom"
				description="The hidden attenuation map. A real scanner never receives this answer image."
				values={groundTruth}
				{size}
				{autoWindow}
				{windowCenter}
				{windowWidth}
				{zoom}
				valueLabel="Synthetic reference attenuation map."
			/>
		</div>
		<div
			id="ct-reconstruction-backprojection-panel"
			class="stage stage-backprojection"
			role={compactLayout === 'desktop' ? undefined : 'tabpanel'}
			aria-labelledby={compactLayout === 'desktop'
				? undefined
				: activeView === 'compare'
					? 'ct-reconstruction-compare-tab'
					: 'ct-reconstruction-backprojection-tab'}
		>
			<ReconstructionView
				title="Ordinary back-projection"
				description="Each detector value is spread along its complete ray, so the object emerges inside a broad blur."
				values={backprojection}
				{size}
				{partial}
				{progress}
				{autoWindow}
				{windowCenter}
				{windowWidth}
				{zoom}
				valueLabel={backprojection
					? `${Math.round(progress * 100)} percent of the scan represented.`
					: 'No back-projection yet.'}
			/>
		</div>
		<div
			id="ct-reconstruction-filtered-panel"
			class="stage stage-filtered"
			role={compactLayout === 'desktop' ? undefined : 'tabpanel'}
			aria-labelledby={compactLayout === 'desktop'
				? undefined
				: activeView === 'compare'
					? 'ct-reconstruction-compare-tab'
					: 'ct-reconstruction-filtered-tab'}
		>
			<ReconstructionView
				title="Filtered back-projection"
				description={`${filterLabel} alters each detector profile before it is spread backwards, restoring edge information.`}
				values={filteredBackprojection}
				{size}
				{partial}
				{progress}
				{autoWindow}
				{windowCenter}
				{windowWidth}
				{zoom}
				valueLabel={filteredBackprojection
					? `${Math.round(progress * 100)} percent of the scan represented using ${filterLabel}.`
					: 'No filtered reconstruction yet.'}
			/>
		</div>
		<div
			id="ct-reconstruction-error-panel"
			class="stage stage-error"
			role={compactLayout === 'desktop' ? undefined : 'tabpanel'}
			aria-labelledby={compactLayout === 'desktop' ? undefined : 'ct-reconstruction-error-tab'}
		>
			<ReconstructionView
				title="Filtered error"
				description="A signed, scale-aligned difference from the known synthetic phantom. Green is near zero; red and blue have opposite signs."
				values={difference}
				{size}
				mode="difference"
				{partial}
				{progress}
				valueLabel={difference
					? 'Signed scale-invariant difference from the synthetic reference.'
					: 'No difference image yet.'}
			/>
		</div>
	</div>

	<details class="comparison-help">
		<summary>How to compare these images</summary>
		<p>
			Follow the same edge through all four panels. Ordinary back-projection spreads it broadly;
			filtering restores sharper transitions but also amplifies inconsistent or noisy measurements.
			The signed error panel is available only because this synthetic experiment knows the answer.
		</p>
	</details>

	<div class="metrics" aria-labelledby="ct-reconstruction-metrics-heading">
		<h4 id="ct-reconstruction-metrics-heading">Synthetic reconstruction quality</h4>
		<div class="metric-cards">
			<section class="metric-card" aria-labelledby="ct-ordinary-bp-metrics">
				<h5 id="ct-ordinary-bp-metrics">Ordinary BP</h5>
				<dl>
					<div>
						<dt>Scale-invariant RMSE</dt>
						<dd><output>{metric(backprojectionMetrics?.scaleInvariantRmse)}</output></dd>
					</div>
					<div>
						<dt>MAE</dt>
						<dd><output>{metric(backprojectionMetrics?.mae)}</output></dd>
					</div>
					<div>
						<dt>Correlation</dt>
						<dd><output>{metric(backprojectionMetrics?.correlation)}</output></dd>
					</div>
				</dl>
			</section>
			<section class="metric-card" aria-labelledby="ct-filtered-bp-metrics">
				<h5 id="ct-filtered-bp-metrics">{filterLabel}</h5>
				<dl>
					<div>
						<dt>Scale-invariant RMSE</dt>
						<dd><output>{metric(filteredMetrics?.scaleInvariantRmse)}</output></dd>
					</div>
					<div>
						<dt>MAE</dt>
						<dd><output>{metric(filteredMetrics?.mae)}</output></dd>
					</div>
					<div>
						<dt>Correlation</dt>
						<dd><output>{metric(filteredMetrics?.correlation)}</output></dd>
					</div>
				</dl>
			</section>
		</div>
		<p>
			These compare with a known synthetic answer inside the field of view. They are teaching
			metrics, not clinical image-quality or diagnostic scores.
		</p>
	</div>
</section>

<style>
	.comparison {
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--rule);
		border-radius: 0.75rem;
		background: var(--paper-soft);
		color: var(--ink);
		container: reconstruction / inline-size;
	}
	.comparison-heading {
		display: flex;
		min-height: 3.65rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.7rem 0.8rem;
	}
	.comparison-heading p,
	.comparison-heading h3,
	.metrics p {
		margin: 0;
	}
	.comparison-heading p {
		margin-bottom: 0.15rem;
		font-family: ui-monospace, monospace;
		font-size: 0.8125rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.comparison-heading h3 {
		font-size: 1rem;
	}
	.comparison-heading > span {
		border: 1px solid var(--control-border);
		border-radius: 999px;
		padding: 0.24rem 0.45rem;
		font-family: ui-monospace, monospace;
		font-size: 0.8125rem;
		color: var(--ink-muted);
	}
	.view-switcher {
		display: none;
		border-top: 1px solid var(--rule);
		padding: 0.65rem;
		background: var(--paper-raised);
	}
	.view-switcher > span {
		display: block;
		margin-bottom: 0.4rem;
		font-family: ui-monospace, monospace;
		font-size: 0.8125rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.view-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.view-tabs button {
		min-height: 2.5rem;
		flex: 1 1 8rem;
		border: 1px solid var(--control-border);
		border-radius: 0.45rem;
		background: var(--paper-raised);
		padding: 0.45rem 0.55rem;
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 700;
		line-height: 1.2;
		color: var(--ink);
		cursor: pointer;
	}
	.view-tabs button:hover {
		border-color: var(--accent);
	}
	.view-tabs button[aria-selected='true'] {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, var(--paper-raised));
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.view-tabs button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.image-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
		padding: 0 0.65rem 0.65rem;
	}
	.stage {
		min-width: 0;
	}
	.stage :global(.image-panel) {
		height: 100%;
	}
	.metrics {
		display: grid;
		gap: 0.6rem;
		border-top: 1px solid var(--rule);
		background: var(--paper-raised);
		padding: 0.7rem 0.8rem;
		font-family: ui-monospace, monospace;
		font-size: 0.8125rem;
	}
	.comparison-help {
		border-top: 1px solid var(--rule);
		background: var(--paper-raised);
		padding: 0.6rem 0.8rem;
		font-size: 0.8125rem;
	}
	.comparison-help summary {
		min-height: 2rem;
		cursor: pointer;
		font-weight: 700;
	}
	.comparison-help summary:focus-visible {
		border-radius: 0.2rem;
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.comparison-help p {
		margin: 0;
		padding: 0.35rem 0 0.25rem;
		line-height: 1.5;
		color: var(--ink-muted);
	}
	.metrics h4,
	.metric-card h5,
	.metric-card dl,
	.metric-card dd {
		margin: 0;
	}
	.metrics h4 {
		font-family: inherit;
		font-size: 0.8125rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.metric-cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}
	.metric-card {
		min-width: 0;
		border: 1px solid var(--rule);
		border-radius: 0.5rem;
		background: var(--paper-soft);
		padding: 0.6rem;
	}
	.metric-card h5 {
		margin-bottom: 0.45rem;
		font-size: 0.8125rem;
		color: var(--ink);
	}
	.metric-card dl {
		display: grid;
		gap: 0.3rem;
	}
	.metric-card dl > div {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.65rem;
		align-items: baseline;
	}
	.metric-card dt {
		min-width: 0;
		color: var(--ink-muted);
	}
	.metric-card dd,
	.metric-card output {
		color: var(--ink);
	}
	.metrics p {
		font-family: inherit;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: var(--ink-muted);
	}
	@container reconstruction (max-width: 56rem) {
		.view-switcher {
			display: block;
		}
		.image-grid {
			grid-template-columns: 1fr;
		}
		.stage {
			display: none;
		}
		.image-grid[data-view='truth'] .stage-truth,
		.image-grid[data-view='backprojection'] .stage-backprojection,
		.image-grid[data-view='filtered'] .stage-filtered,
		.image-grid[data-view='error'] .stage-error,
		.image-grid[data-view='compare'] .stage-backprojection,
		.image-grid[data-view='compare'] .stage-filtered {
			display: block;
		}
		.image-grid[data-view='compare'] {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@container reconstruction (max-width: 40rem) {
		.comparison-heading {
			align-items: flex-start;
		}
		.view-tabs {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.view-tabs button {
			min-width: 0;
		}
		.view-tabs .compare-tab {
			grid-column: 1 / -1;
		}
		.image-grid {
			padding-inline: 0.45rem;
		}
		.metric-cards {
			grid-template-columns: 1fr;
		}
		.metric-card dl > div {
			grid-template-columns: minmax(0, 1fr) minmax(4rem, auto);
		}
	}
	@media (forced-colors: active) {
		.view-tabs button[aria-selected='true'] {
			border-width: 2px;
			background: Canvas;
			box-shadow: none;
		}
	}
</style>
