<script lang="ts">
	import { pushState, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount, tick, type Snippet } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import BiasCompare from './BiasCompare.svelte';
	import BiasDetails from './BiasDetails.svelte';
	import BiasLegend from './BiasLegend.svelte';
	import BiasLensControl from './BiasLensControl.svelte';
	import BiasScenarioRail from './BiasScenarioRail.svelte';
	import BiasStaticIndex from './BiasStaticIndex.svelte';
	import BiasTerrain from './BiasTerrain.svelte';
	import BiasTideControl from './BiasTideControl.svelte';
	import biasesData from '$lib/data/bias-archipelago/biases.json';
	import layoutData from '$lib/data/bias-archipelago/layout.generated.json';
	import lineagesData from '$lib/data/bias-archipelago/lineages.json';
	import mechanismsData from '$lib/data/bias-archipelago/mechanisms.json';
	import relationsData from '$lib/data/bias-archipelago/relations.json';
	import scenariosData from '$lib/data/bias-archipelago/scenarios.json';
	import type {
		Bias,
		BiasLayout,
		BiasLens,
		BiasRelation,
		BiasScenario,
		LegendItem,
		PeakMarker,
		TaxonomyRecord
	} from '$lib/visualizations/bias-archipelago/bias-types';

	const biases = biasesData as Bias[];
	const relations = relationsData as BiasRelation[];
	const layout = layoutData as BiasLayout;
	const mechanisms = configArray(mechanismsData, 'mechanisms');
	const lineages = configArray(lineagesData, 'lineages');
	const scenarios = (
		Array.isArray(scenariosData)
			? scenariosData
			: ((scenariosData as { scenarios?: unknown[] }).scenarios ?? [])
	) as BiasScenario[];
	const biasById = new Map(biases.map((bias) => [bias.id, bias]));
	const conditionOptions = [
		'uncertainty',
		'time-pressure',
		'cognitive-load',
		'identity-threat',
		'emotional-intensity',
		'repeated-exposure',
		'public-commitment',
		'asymmetric-losses',
		'sparse-or-noisy-evidence'
	];
	const allowedLenses = new Set<BiasLens>([
		'none',
		'mechanism',
		'task',
		'lineage',
		'scale',
		'conditions'
	]);
	const taskRecords: TaxonomyRecord[] = [
		{ id: 'noticing', label: 'Noticing', colour: '#d9a441', symbol: 'circle' },
		{ id: 'remembering', label: 'Remembering', colour: '#7e9cb8', symbol: 'square' },
		{ id: 'estimating', label: 'Estimating', colour: '#6eaa92', symbol: 'diamond' },
		{ id: 'testing-belief', label: 'Testing a belief', colour: '#a9789e', symbol: 'triangle' },
		{ id: 'assigning-cause', label: 'Assigning a cause', colour: '#c77862', symbol: 'cross' },
		{ id: 'choosing', label: 'Choosing', colour: '#c5a86a', symbol: 'diamond' },
		{ id: 'acting', label: 'Acting', colour: '#75a5a7', symbol: 'triangle' },
		{
			id: 'evaluating-outcome',
			label: 'Evaluating an outcome',
			colour: '#8f87ba',
			symbol: 'square'
		}
	];
	const scaleRecords: TaxonomyRecord[] = [
		{ id: 'individual', label: 'Individual', colour: '#78a8a3', symbol: 'circle' },
		{ id: 'interpersonal', label: 'Interpersonal', colour: '#c49765', symbol: 'diamond' },
		{ id: 'group', label: 'Group', colour: '#a77b9d', symbol: 'triangle' },
		{ id: 'organization', label: 'Organization', colour: '#b95f54', symbol: 'square' }
	];
	const conditionColours = ['#e8bd63', '#d6815f', '#8ab7ae', '#b383ae', '#d9a065'];
	const guidedScenarioIds = new Set(['project-that-refuses-to-die', 'objective-observer']);
	const initialView = readView(page.url);
	const featuredScenarios = scenarios.filter((scenario) => guidedScenarioIds.has(scenario.id));

	let { children }: { children?: Snippet } = $props();

	let tide = $state(initialView.tide);
	let lens = $state<BiasLens>(initialView.lens);
	let conditions = $state<string[]>(initialView.conditions);
	let selectedId = $state<string | undefined>(initialView.biasId);
	let compareId = $state<string | undefined>(initialView.compareId);
	let comparePicking = $state(false);
	let activeScenarioId = $state<string | undefined>(initialView.scenarioId);
	let activeStep = $state(initialView.step);
	let query = $state('');
	let statusMessage = $state(
		`${biases.length} bias peaks loaded in a curated explanatory terrain.`
	);
	let mounted = $state(false);
	let skipNextUrlWrite = false;
	let pendingHistoryMode: 'replace' | 'push' = 'replace';
	let scenarioObserverPaused = $state(Boolean(page.url.searchParams.get('scenario')));
	let openingMapExpanded = $state(false);
	let guidedMapExpanded = $state(false);
	let urlTimer: ReturnType<typeof setTimeout> | null = null;
	let observerResumeTimer: ReturnType<typeof setTimeout> | null = null;
	let explorer: HTMLElement;
	let freeMap: {
		download: (format: 'png' | 'svg') => Promise<void>;
		focusBias: (id?: string) => void;
		resetView: () => void;
		zoomIn: () => void;
		zoomOut: () => void;
	};

	let selectedBias = $derived(selectedId ? biasById.get(selectedId) : undefined);
	let selectedPoint = $derived(layout.points.find((point) => point.id === selectedId));
	let compareBias = $derived(compareId ? biasById.get(compareId) : undefined);
	let selectedRelations = $derived(
		selectedId
			? relations.filter(
					(relation) => relation.source === selectedId || relation.target === selectedId
				)
			: []
	);
	let comparisonRelation = $derived(
		selectedId && compareId
			? relations.find(
					(relation) =>
						(relation.source === selectedId && relation.target === compareId) ||
						(relation.source === compareId && relation.target === selectedId)
				)
			: undefined
	);
	let featuredActiveScenario = $derived(
		featuredScenarios.find((scenario) => scenario.id === activeScenarioId) ?? featuredScenarios[0]
	);
	let featuredActiveStep = $derived(
		featuredActiveScenario?.id === activeScenarioId ? activeStep : 0
	);
	let featuredHighlightedIds = $derived(highlightsFor(featuredActiveScenario, featuredActiveStep));
	let markerMap = $derived.by(buildMarkerMap);
	let legendItems = $derived.by(buildLegendItems);
	let visibleLabelCount = $derived(
		tide < 0.34
			? layout.points.filter((point) => point.labelPriority === 0).length
			: tide < 0.7
				? layout.points.filter((point) => point.labelPriority <= 1).length
				: layout.points.length
	);

	onMount(() => {
		const initialUrl = new URL(window.location.href);
		mounted = true;
		void navigateToUrlTarget(initialUrl);
		const popstate = () => {
			const url = new URL(window.location.href);
			restoreFromUrl(url);
			void navigateToUrlTarget(url);
		};
		window.addEventListener('popstate', popstate);
		return () => {
			window.removeEventListener('popstate', popstate);
			if (urlTimer) clearTimeout(urlTimer);
			if (observerResumeTimer) clearTimeout(observerResumeTimer);
		};
	});

	$effect(() => {
		void tide;
		void lens;
		void conditions;
		void selectedId;
		void compareId;
		void activeScenarioId;
		void activeStep;
		if (!mounted) return;
		if (skipNextUrlWrite) {
			skipNextUrlWrite = false;
			return;
		}
		scheduleUrlWrite();
	});

	function readView(url: URL) {
		const biasValue = url.searchParams.get('bias') ?? undefined;
		const biasId = biasValue && biasById.has(biasValue) ? biasValue : undefined;
		const compareValue = url.searchParams.get('compare') ?? undefined;
		const compareId =
			compareValue && compareValue !== biasId && biasById.has(compareValue)
				? compareValue
				: undefined;
		const tideParameter = url.searchParams.get('tide');
		const tideValue = tideParameter === null ? Number.NaN : Number(tideParameter);
		const lensValue = url.searchParams.get('lens') as BiasLens | null;
		const scenarioValue = url.searchParams.get('scenario') ?? undefined;
		const scenario =
			scenarios.find(
				(candidate) => candidate.id === scenarioValue && guidedScenarioIds.has(candidate.id)
			) ??
			scenarios.find((candidate) => guidedScenarioIds.has(candidate.id)) ??
			scenarios[0];
		const stepParameter = url.searchParams.get('step');
		const requestedStep =
			stepParameter && /^\d+$/.test(stepParameter) ? Number(stepParameter) - 1 : 0;
		const step = Math.max(
			0,
			Math.min(requestedStep, Math.max(0, (scenario?.steps.length ?? 1) - 1))
		);
		const conditionValue = url.searchParams.get('conditions')?.split(',').filter(Boolean) ?? [];

		return {
			biasId,
			compareId,
			tide: Number.isFinite(tideValue) ? Math.max(0, Math.min(1, tideValue)) : 0.12,
			lens: lensValue && allowedLenses.has(lensValue) ? lensValue : ('none' as BiasLens),
			scenarioId: scenario?.id,
			step,
			conditions: conditionValue.filter((condition) => conditionOptions.includes(condition))
		};
	}

	function highlightsFor(scenario: BiasScenario | undefined, step: number) {
		return scenario
			? Array.from(new Set(scenario.steps.slice(0, step + 1).flatMap((item) => item.biasIds)))
			: [];
	}

	function configArray(value: unknown, key: string): TaxonomyRecord[] {
		let records: unknown[] = [];
		if (Array.isArray(value)) records = value;
		if (value && typeof value === 'object') {
			const nested = (value as Record<string, unknown>)[key];
			if (Array.isArray(nested)) records = nested;
		}
		const colours = ['#719b9c', '#c09361', '#967ca5', '#6f8cad', '#b46f60', '#8b9569'];
		const symbols: TaxonomyRecord['symbol'][] = [
			'circle',
			'diamond',
			'square',
			'triangle',
			'cross'
		];
		return records.flatMap((record, index) => {
			if (typeof record === 'string') {
				return [
					{
						id: record,
						label: humanize(record).replace(/^./, (character) => character.toUpperCase()),
						colour: colours[index % colours.length],
						symbol: symbols[index % symbols.length]
					}
				];
			}
			if (!record || typeof record !== 'object') return [];
			const item = record as Record<string, unknown>;
			const id = typeof item.id === 'string' ? item.id : '';
			if (!id) return [];
			const symbol = symbols.includes(item.symbol as TaxonomyRecord['symbol'])
				? (item.symbol as TaxonomyRecord['symbol'])
				: symbols[index % symbols.length];
			return [
				{
					id,
					label:
						typeof item.label === 'string'
							? item.label
							: typeof item.name === 'string'
								? item.name
								: humanize(id),
					colour:
						typeof item.colour === 'string'
							? item.colour
							: typeof item.color === 'string'
								? item.color
								: colours[index % colours.length],
					symbol,
					description: typeof item.description === 'string' ? item.description : undefined
				}
			];
		});
	}

	function restoreFromUrl(url: URL) {
		if (urlTimer) clearTimeout(urlTimer);
		const restored = readView(url);
		skipNextUrlWrite = true;
		selectedId = restored.biasId;
		compareId = restored.compareId;
		tide = restored.tide;
		lens = restored.lens;
		activeScenarioId = restored.scenarioId;
		activeStep = restored.step;
		conditions = restored.conditions;
	}

	function scheduleUrlWrite() {
		if (urlTimer) clearTimeout(urlTimer);
		const mode = pendingHistoryMode;
		urlTimer = setTimeout(() => {
			writeUrl(mode);
			pendingHistoryMode = 'replace';
		}, 100);
	}

	function viewUrl(share = false) {
		const url = new SvelteURL(window.location.href);
		const hasAtlasHash =
			url.hash === '#bias-archipelago-explorer' || url.hash.startsWith('#scenario-');
		for (const key of ['bias', 'compare', 'tide', 'lens', 'scenario', 'step', 'conditions']) {
			url.searchParams.delete(key);
		}
		if (selectedId) url.searchParams.set('bias', selectedId);
		if (compareId) url.searchParams.set('compare', compareId);
		if (Math.abs(tide - 0.12) > 0.005) url.searchParams.set('tide', tide.toFixed(2));
		if (lens !== 'none') url.searchParams.set('lens', lens);
		const includesScenario = Boolean(
			activeScenarioId && (share || activeScenarioId !== featuredScenarios[0]?.id || activeStep > 0)
		);
		if (includesScenario && activeScenarioId) {
			url.searchParams.set('scenario', activeScenarioId);
			url.searchParams.set('step', String(activeStep + 1));
		}
		if (lens === 'conditions' && conditions.length) {
			url.searchParams.set('conditions', conditions.join(','));
		}
		if (selectedId) url.hash = 'bias-archipelago-explorer';
		else if (includesScenario && activeScenarioId) {
			url.hash = `scenario-${activeScenarioId}-step-${activeStep + 1}`;
		} else if (hasAtlasHash) url.hash = '';
		return url;
	}

	function writeUrl(mode: 'replace' | 'push' = 'replace') {
		if (typeof window === 'undefined') return;
		const url = viewUrl();
		const route =
			`${url.pathname}${url.search}${url.hash}` as '/blog/visualizations/the-bias-archipelago';
		if (mode === 'push') pushState(resolve(route), {});
		else replaceState(resolve(route), {});
	}

	async function navigateToUrlTarget(url: URL) {
		const restored = readView(url);
		if (url.searchParams.has('scenario')) {
			scenarioObserverPaused = true;
			await tick();
			await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
			const target =
				document.getElementById(`scenario-${restored.scenarioId}-step-${restored.step + 1}`) ??
				document.getElementById(`scenario-${restored.scenarioId}`);
			target?.scrollIntoView({ behavior: 'auto', block: 'center' });
			if (observerResumeTimer) clearTimeout(observerResumeTimer);
			observerResumeTimer = setTimeout(() => {
				scenarioObserverPaused = false;
			}, 450);
			return;
		}
		scenarioObserverPaused = false;
		if (url.searchParams.has('bias')) requestAnimationFrame(openExplorer);
	}

	function selectBias(id: string) {
		const bias = biasById.get(id);
		if (!bias) return;
		const openedFromKeyboard = Boolean(document.activeElement?.closest('[data-bias-id]'));
		if (comparePicking && selectedId && id !== selectedId) {
			compareId = id;
			comparePicking = false;
			statusMessage = `${selectedBias?.name} and ${bias.name} opened in sectional comparison.`;
			if (openedFromKeyboard) focusInspector('bias-compare-heading');
			return;
		}
		selectedId = id;
		compareId = undefined;
		comparePicking = false;
		statusMessage = `${bias.name} selected. ${selectedRelations.length} explained relationships available.`;
		if (openedFromKeyboard) focusInspector('bias-details-title');
	}

	function selectFromOverview(id: string) {
		selectBias(id);
		requestAnimationFrame(openExplorer);
	}

	function focusInspector(id: string) {
		requestAnimationFrame(() => document.getElementById(id)?.focus());
	}

	function closeSelection() {
		const previousId = selectedId;
		selectedId = undefined;
		compareId = undefined;
		comparePicking = false;
		statusMessage = 'Selection cleared. All peaks restored.';
		focusMapPeak(previousId);
	}

	function beginComparison() {
		if (!selectedId) return;
		if (comparePicking) {
			comparePicking = false;
			statusMessage = 'Comparison selection cancelled.';
			return;
		}
		compareId = undefined;
		comparePicking = true;
		statusMessage = `Choose a second peak to compare with ${selectedBias?.name}.`;
		focusMapPeak(selectedId);
	}

	function closeComparison() {
		compareId = undefined;
		comparePicking = false;
		statusMessage = `${selectedBias?.name ?? 'First peak'} remains selected.`;
		focusMapPeak(selectedId);
	}

	function focusMapPeak(id?: string) {
		if (!id) return;
		requestAnimationFrame(() => freeMap?.focusBias(id));
	}

	function activateScenario(
		scenarioId: string,
		step: number,
		origin: 'click' | 'observer' = 'click'
	) {
		const scenario = featuredScenarios.find((item) => item.id === scenarioId);
		if (!scenario) return;
		if (origin === 'click') pendingHistoryMode = 'push';
		activeScenarioId = scenarioId;
		activeStep = Math.max(0, Math.min(step, scenario.steps.length - 1));
		statusMessage = `${scenario.title}, step ${activeStep + 1}: ${scenario.steps[
			activeStep
		]?.biasIds
			.map((id) => biasById.get(id)?.name ?? id)
			.join(', ')} highlighted.`;
	}

	function changeLens(next: BiasLens) {
		lens = next;
		if (lens !== 'conditions') conditions = [];
		statusMessage =
			next === 'none'
				? 'Monochrome survey lens restored.'
				: `${next.replaceAll('-', ' ')} lens applied. Colour is paired with marker shape and legend text.`;
	}

	function toggleCondition(condition: string) {
		conditions = conditions.includes(condition)
			? conditions.filter((item) => item !== condition)
			: [...conditions, condition];
		statusMessage = conditions.length
			? `Associated biases brightened for ${conditions.map(humanize).join(', ')}. This is not a psychological test.`
			: 'No environmental condition selected.';
	}

	function runSearch() {
		const normalized = query.trim().toLocaleLowerCase('en');
		if (!normalized) {
			statusMessage = 'Enter a bias name or alias to search.';
			return;
		}
		const match = biases.find(
			(bias) =>
				bias.name.toLocaleLowerCase('en') === normalized ||
				bias.id === normalized.replaceAll(' ', '-') ||
				bias.aliases.some((alias) => alias.toLocaleLowerCase('en') === normalized)
		);
		const fallback = biases.find((bias) =>
			[bias.name, ...bias.aliases].join(' ').toLocaleLowerCase('en').includes(normalized)
		);
		const result = match ?? fallback;
		if (result) {
			selectBias(result.id);
			statusMessage = `${result.name} found and selected.`;
		} else {
			statusMessage = `No bias name or alias matches “${query}”. The textual index can search definitions too.`;
		}
	}

	function searchKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') runSearch();
	}

	async function copyView() {
		const url = viewUrl(true).toString();
		await copyUrl(url, 'Shareable view URL copied.');
	}

	async function copyScenario(scenarioId: string, step: number) {
		const scenario = featuredScenarios.find((item) => item.id === scenarioId);
		if (!scenario) return;
		const url = viewUrl();
		url.searchParams.set('scenario', scenario.id);
		url.searchParams.set(
			'step',
			String(Math.max(0, Math.min(step, scenario.steps.length - 1)) + 1)
		);
		url.hash = `scenario-${scenario.id}-step-${
			Math.max(0, Math.min(step, scenario.steps.length - 1)) + 1
		}`;
		await copyUrl(url.toString(), `Link to “${scenario.title}” copied.`);
	}

	async function copyUrl(url: string, successMessage: string) {
		try {
			await navigator.clipboard.writeText(url);
			statusMessage = successMessage;
		} catch {
			const field = document.createElement('textarea');
			field.value = url;
			document.body.append(field);
			field.select();
			document.execCommand('copy');
			field.remove();
			statusMessage = successMessage;
		}
	}

	function resetMap() {
		tide = 0.12;
		lens = 'none';
		conditions = [];
		selectedId = undefined;
		compareId = undefined;
		comparePicking = false;
		activeScenarioId = scenarios[0]?.id;
		activeStep = 0;
		query = '';
		freeMap?.resetView();
		statusMessage = 'Archipelago reset to the opening survey.';
	}

	function openExplorer() {
		explorer?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
	}

	function reducedMotion() {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	function buildMarkerMap() {
		return Object.fromEntries(
			biases.map((bias) => {
				let record: TaxonomyRecord | undefined;
				if (lens === 'mechanism') record = findRecord(mechanisms, bias.mechanisms[0]);
				if (lens === 'task') record = findRecord(taskRecords, bias.tasks[0]);
				if (lens === 'lineage') {
					const primary = [...bias.lineages].sort((a, b) => b.weight - a.weight)[0]?.tradition;
					record = findRecord(lineages, primary);
				}
				if (lens === 'scale') record = findRecord(scaleRecords, bias.scale[0]);
				if (lens === 'conditions') {
					const matching = bias.conditions.filter((condition) => conditions.includes(condition));
					const active = conditions.length === 0 || matching.length > 0;
					const index = matching.length ? conditionOptions.indexOf(matching[0]) : 0;
					return [
						bias.id,
						{
							colour: active
								? conditionColours[Math.max(0, index) % conditionColours.length]
								: '#49636a',
							symbol: active ? 'cross' : 'circle',
							label: matching.length
								? `Associated with ${matching.map(humanize).join(', ')}`
								: conditions.length
									? 'Not highlighted for the selected conditions'
									: 'Choose a condition to brighten associated peaks'
						} satisfies PeakMarker
					];
				}
				return [
					bias.id,
					{
						colour: record?.colour ?? '#d9d2b9',
						symbol: record?.symbol ?? 'circle',
						label: record?.label ?? 'Survey peak'
					} satisfies PeakMarker
				];
			})
		) as Record<string, PeakMarker>;
	}

	function buildLegendItems(): LegendItem[] {
		if (lens === 'mechanism') return mechanisms.map(asLegend);
		if (lens === 'task') return taskRecords.map(asLegend);
		if (lens === 'lineage') return lineages.map(asLegend);
		if (lens === 'scale') return scaleRecords.map(asLegend);
		if (lens === 'conditions') {
			return conditionOptions.map((condition, index) => ({
				id: condition,
				label: humanize(condition),
				colour: conditionColours[index % conditionColours.length],
				symbol: '✦'
			}));
		}
		return [];
	}

	function asLegend(record: TaxonomyRecord): LegendItem {
		return {
			id: record.id,
			label: record.label,
			colour: record.colour,
			symbol:
				record.symbol === 'diamond'
					? '◇'
					: record.symbol === 'triangle'
						? '△'
						: record.symbol === 'square'
							? '□'
							: record.symbol === 'cross'
								? '＋'
								: '○'
		};
	}

	function findRecord(records: TaxonomyRecord[], value: string | undefined) {
		if (!value) return undefined;
		const normalized = value.toLocaleLowerCase('en').replaceAll(' ', '-');
		return records.find(
			(record) =>
				record.id.toLocaleLowerCase('en') === normalized ||
				record.label.toLocaleLowerCase('en').replaceAll(' ', '-') === normalized
		);
	}

	function humanize(value: string) {
		return value.replaceAll('-', ' ');
	}
</script>

<section
	class="archipelago archipelago-intro article-breakout not-prose"
	aria-labelledby="bias-archipelago-heading"
	data-testid="bias-archipelago"
	data-bias-count={biases.length}
	data-lens={lens}
	data-tts-exclude
>
	<header class="atlas-header">
		<div>
			<p>Curated explanatory model · survey edition 01</p>
			<h2 id="bias-archipelago-heading">The Bias Archipelago</h2>
		</div>
		<div class="header-note">
			<span>{biases.length} constructs</span>
			<span>9 deep formations</span>
			<span>lineage kept separate</span>
		</div>
	</header>

	<section
		class="opening-map"
		class:mobile-expanded={openingMapExpanded}
		aria-label="Opening archipelago survey"
	>
		<BiasTerrain
			id="bias-map-opening"
			{biases}
			{layout}
			{relations}
			{tide}
			{selectedId}
			{compareId}
			highlightedIds={[]}
			markers={markerMap}
			onselect={selectFromOverview}
			onviewchange={(message) => (statusMessage = message)}
		/>
		<div class="opening-copy">
			<p>Lower the water beneath the names.</p>
			<h3>Separate peaks. Shared ground.</h3>
			<span>
				Functional resemblance shapes the land. Academic lineage is a lens laid over it, never an
				ingredient in the geography.
			</span>
			<div class="opening-actions">
				<button type="button" onclick={openExplorer}>Skip to the full survey ↓</button>
				<button
					class="mobile-map-toggle"
					type="button"
					onclick={() => (openingMapExpanded = !openingMapExpanded)}
					aria-pressed={openingMapExpanded}
				>
					{openingMapExpanded ? 'Compact map' : 'Expand map'}
				</button>
			</div>
		</div>
		<div class="opening-tide">
			<BiasTideControl id="bias-tide-opening" {tide} onchange={(value) => (tide = value)} />
		</div>
	</section>

	<section class="guided" aria-label="Guided decision cascades">
		<BiasScenarioRail
			scenarios={featuredScenarios}
			{activeScenarioId}
			{activeStep}
			observerPaused={scenarioObserverPaused}
			onactivate={activateScenario}
			oncopy={copyScenario}
		/>
		<div class="sticky-sounding" class:mobile-expanded={guidedMapExpanded}>
			<div class="sounding-heading">
				<div>
					<span>Current sounding</span>
					<strong>{featuredActiveScenario?.title}</strong>
				</div>
				<button
					class="mobile-map-toggle"
					type="button"
					onclick={() => (guidedMapExpanded = !guidedMapExpanded)}
					aria-pressed={guidedMapExpanded}
				>
					{guidedMapExpanded ? 'Compact map' : 'Expand map'}
				</button>
			</div>
			<BiasTerrain
				id="bias-map-guided"
				{biases}
				{layout}
				{relations}
				{tide}
				{selectedId}
				{compareId}
				highlightedIds={featuredHighlightedIds}
				markers={markerMap}
				compact
				onselect={selectFromOverview}
				onviewchange={(message) => (statusMessage = message)}
			/>
			<p>
				Illuminated peaks accumulate across the passage. The sequence describes a plausible
				coalition—not a causal diagnosis.
			</p>
		</div>
	</section>
</section>

{#if children}{@render children()}{/if}

<section
	class="archipelago archipelago-survey article-breakout not-prose"
	aria-labelledby="bias-explorer-heading"
	data-testid="bias-archipelago-survey"
	data-tts-exclude
>
	<section bind:this={explorer} id="bias-archipelago-explorer" class="free-explorer">
		<header class="explorer-heading">
			<div>
				<p>Free exploration</p>
				<h2 id="bias-explorer-heading">Survey the whole terrain</h2>
			</div>
			<label class="search">
				<span>Find a peak or alias</span>
				<input
					type="search"
					list="bias-search-options"
					bind:value={query}
					onkeydown={searchKeydown}
					onchange={runSearch}
					placeholder="Confirmation bias…"
				/>
				<datalist id="bias-search-options">
					{#each biases as bias (bias.id)}<option value={bias.name}></option>{/each}
				</datalist>
			</label>
		</header>

		<div class="control-deck">
			<BiasTideControl id="bias-tide-explorer" {tide} onchange={(value) => (tide = value)} />
			<BiasLensControl
				{lens}
				{conditions}
				{conditionOptions}
				onlens={changeLens}
				oncondition={toggleCondition}
			/>
			<div class="view-tools" aria-label="Share and export tools">
				<button type="button" onclick={copyView}>⧉ Copy view</button>
				<button type="button" onclick={resetMap}>↺ Reset map</button>
				<button type="button" onclick={() => freeMap?.download('png')}>⇩ PNG</button>
				<button type="button" onclick={() => freeMap?.download('svg')}>⇩ Vector SVG</button>
			</div>
		</div>

		<div class="explorer-layout">
			<div class="map-column">
				<BiasTerrain
					id="bias-map-explorer"
					bind:this={freeMap}
					{biases}
					{layout}
					{relations}
					{tide}
					{selectedId}
					{compareId}
					highlightedIds={[]}
					markers={markerMap}
					onselect={selectBias}
					onviewchange={(message) => (statusMessage = message)}
				/>
				<BiasLegend
					{lens}
					items={legendItems}
					visibleCount={visibleLabelCount}
					totalCount={biases.length}
					selected={selectedBias}
				/>
				<p class="keyboard-guide">
					<strong>Keyboard:</strong> Tab to a peak, arrow between precomputed neighbours, Enter to open
					it. Choose “Compare this peak”, then a second peak, without using a pointer.
				</p>
			</div>

			<div class="inspector-column">
				{#if selectedBias && compareBias}
					<BiasCompare
						first={selectedBias}
						second={compareBias}
						{layout}
						{tide}
						relation={comparisonRelation}
						onselect={selectBias}
						onclose={closeComparison}
					/>
				{:else if selectedBias}
					<BiasDetails
						bias={selectedBias}
						relations={selectedRelations}
						neighbours={selectedPoint?.neighbours ?? []}
						{biasById}
						comparing={comparePicking}
						oncompare={beginComparison}
						onselect={selectBias}
						onclose={closeSelection}
					/>
				{:else}
					<div class="empty-inspector">
						<span aria-hidden="true">⌖</span>
						<h3>Select a peak</h3>
						<p>
							The sheet will show its definition, street-level example, recipe, research lineage,
							evidence note, sources, and only those relationships that can be explained in ordinary
							language.
						</p>
					</div>
				{/if}
			</div>
		</div>
	</section>

	<BiasStaticIndex {biases} />

	<div class="sr-only" aria-live="polite" aria-atomic="true">{statusMessage}</div>
	<noscript>
		<div class="no-script-note">
			<p>
				The animated survey needs JavaScript, but the essay and complete textual bias index remain
				available below. The index includes definitions, examples, mechanisms, and evidence notes
				for every mapped construct.
			</p>
		</div>
	</noscript>
</section>

<style>
	:global(.article-breakout .archipelago *) {
		box-sizing: border-box;
	}

	.archipelago {
		--arch-serif: var(--font-article-body), 'Source Serif 4', Georgia, serif;
		--arch-ink: #0b252c;
		--arch-panel: #12343c;
		--arch-panel-raised: #19434b;
		--arch-rule: #3f6570;
		--arch-text: #eff2e8;
		--arch-muted: #b9c9c5;
		--arch-accent: #b9894e;
		--arch-accent-bright: #e4bf79;
		--arch-land: #d8d0b4;
		--arch-coast: #eadcac;
		--arch-water-deep: #082c36;
		--arch-water-line: #8fb9bb;
		--arch-label: #f0ead8;
		--arch-label-halo: #0a3039;
		--arch-relation: #f0c36c;
		--arch-compare: #f0e3a4;
		--arch-focus: #fff0a6;
		--arch-peak-stroke: #0a2830;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: min(88rem, calc(100vw - 1.5rem));
		margin-block: 3rem 5rem;
		overflow: clip;
		transform: translateX(-50%);
		border: 1px solid #244a55;
		border-radius: 0.85rem;
		background:
			linear-gradient(rgb(255 255 255 / 1.7%) 1px, transparent 1px),
			linear-gradient(90deg, rgb(255 255 255 / 1.2%) 1px, transparent 1px), var(--arch-ink);
		background-size: 28px 28px;
		color: var(--arch-text);
		box-shadow: 0 2rem 5rem rgb(3 22 27 / 32%);
		font-family: var(--font-sans);
	}

	.archipelago-intro {
		margin-block: 3rem;
	}

	.archipelago-survey {
		margin-block: 4rem 5rem;
	}

	.atlas-header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 2rem;
		padding: clamp(1.1rem, 3vw, 2rem);
		border-bottom: 1px solid var(--arch-rule);
	}

	.atlas-header p,
	.explorer-heading p {
		margin: 0 0 0.35rem;
		color: var(--arch-accent-bright);
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.atlas-header h2,
	.explorer-heading h2 {
		margin: 0;
		font-family: var(--arch-serif);
		font-size: clamp(2rem, 5vw, 4.6rem);
		font-weight: 620;
		letter-spacing: -0.035em;
		line-height: 0.94;
	}

	.header-note {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.4rem;
	}

	.header-note span {
		padding: 0.35rem 0.55rem;
		border: 1px solid var(--arch-rule);
		border-radius: 999px;
		color: var(--arch-muted);
		font-size: 0.62rem;
		font-weight: 650;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.opening-map {
		position: relative;
		min-height: min(78dvh, 52rem);
		padding: 0.75rem;
		border-bottom: 1px solid var(--arch-rule);
	}

	.opening-map :global(.viewport) {
		min-height: min(76dvh, 51rem);
	}

	.opening-copy {
		position: absolute;
		z-index: 3;
		top: 2rem;
		left: 2rem;
		width: min(25rem, calc(100% - 4rem));
		padding: 1rem 1.1rem;
		border: 1px solid color-mix(in srgb, var(--arch-rule) 80%, transparent);
		border-radius: 0.55rem;
		background: rgb(5 32 39 / 80%);
		backdrop-filter: blur(0.65rem);
	}

	.opening-copy p {
		margin: 0 0 0.25rem;
		color: var(--arch-accent-bright);
		font-size: 0.65rem;
		font-weight: 750;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.opening-copy h3 {
		margin: 0 0 0.4rem;
		font-family: var(--arch-serif);
		font-size: clamp(1.5rem, 3vw, 2.6rem);
		line-height: 1;
	}

	.opening-copy span {
		display: block;
		color: var(--arch-muted);
		font-size: 0.78rem;
		line-height: 1.5;
	}

	.opening-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-top: 0.8rem;
	}

	.opening-copy button {
		min-height: 2.55rem;
		padding: 0.45rem 0.7rem;
		border: 1px solid var(--arch-accent);
		border-radius: 999px;
		background: color-mix(in srgb, var(--arch-accent) 14%, transparent);
		color: var(--arch-text);
		font: inherit;
		font-size: 0.72rem;
		font-weight: 750;
		cursor: pointer;
	}

	.mobile-map-toggle {
		display: none;
	}

	.opening-tide {
		position: absolute;
		z-index: 3;
		right: 1.5rem;
		bottom: 1.5rem;
		left: 1.5rem;
	}

	.guided {
		display: grid;
		grid-template-columns: minmax(18rem, 0.72fr) minmax(32rem, 1.28fr);
		gap: clamp(1.2rem, 3vw, 2.5rem);
		align-items: start;
		padding: clamp(1rem, 3vw, 2.5rem);
		border-bottom: 1px solid var(--arch-rule);
	}

	.sticky-sounding {
		position: sticky;
		top: 5rem;
		display: grid;
		gap: 0.65rem;
	}

	.sounding-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.sounding-heading > div {
		display: grid;
		gap: 0.2rem;
	}

	.sounding-heading span {
		color: var(--arch-accent-bright);
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.sounding-heading strong {
		display: block;
		font-family: var(--arch-serif);
		font-size: 0.9rem;
	}

	.sticky-sounding > p,
	.keyboard-guide {
		margin: 0;
		color: var(--arch-muted);
		font-size: 0.7rem;
		line-height: 1.5;
	}

	.free-explorer {
		padding: clamp(1rem, 3vw, 2.5rem);
		scroll-margin-top: 4.5rem;
	}

	.explorer-heading {
		display: grid;
		grid-template-columns: 1fr minmax(15rem, 24rem);
		gap: 2rem;
		align-items: end;
		margin-bottom: 1.3rem;
	}

	.explorer-heading h2 {
		font-size: clamp(1.8rem, 4vw, 3.5rem);
	}

	.search {
		display: grid;
		gap: 0.35rem;
		color: var(--arch-muted);
		font-size: 0.68rem;
		font-weight: 700;
	}

	.search input {
		min-height: 2.8rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--arch-rule);
		border-radius: 0.4rem;
		background: var(--arch-panel);
		color: var(--arch-text);
		font: inherit;
	}

	.control-deck {
		display: grid;
		grid-template-columns: minmax(18rem, 1fr) minmax(25rem, 1.4fr) auto;
		gap: 0.75rem;
		align-items: start;
		margin-bottom: 0.85rem;
	}

	.view-tools {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.35rem;
	}

	.view-tools button {
		min-height: 2.55rem;
		padding: 0.4rem 0.55rem;
		border: 1px solid var(--arch-rule);
		border-radius: 0.35rem;
		background: var(--arch-panel);
		color: var(--arch-text);
		font: inherit;
		font-size: 0.68rem;
		font-weight: 700;
		cursor: pointer;
	}

	.view-tools button:hover {
		border-color: var(--arch-accent);
	}

	.explorer-layout {
		display: grid;
		grid-template-columns: minmax(0, 1.65fr) minmax(20rem, 0.75fr);
		gap: 0.8rem;
		align-items: start;
	}

	.map-column {
		display: grid;
		gap: 0.6rem;
		min-width: 0;
	}

	.inspector-column {
		position: sticky;
		top: 5rem;
		min-width: 0;
	}

	.empty-inspector {
		display: grid;
		min-height: 24rem;
		place-content: center;
		padding: 2rem;
		border: 1px dashed var(--arch-rule);
		border-radius: 0.65rem;
		color: var(--arch-muted);
		text-align: center;
	}

	.empty-inspector > span {
		color: var(--arch-accent-bright);
		font-size: 2.4rem;
	}

	.empty-inspector h3 {
		margin: 0.5rem 0;
		color: var(--arch-text);
		font-family: var(--arch-serif);
		font-size: 1.5rem;
	}

	.empty-inspector p {
		max-width: 24rem;
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.55;
	}

	.no-script-note {
		margin: 1rem;
		padding: 1rem;
		border: 1px solid var(--arch-accent);
		color: var(--arch-text);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 70rem) {
		.control-deck {
			grid-template-columns: 1fr 1.4fr;
		}

		.view-tools {
			grid-column: 1 / -1;
			grid-template-columns: repeat(4, 1fr);
		}
	}

	@media (max-width: 61.99rem) {
		.archipelago {
			left: auto;
			width: calc(100% + 3.5rem);
			margin-left: -1.75rem;
			transform: none;
		}

		.guided {
			grid-template-columns: 1fr;
		}

		.sticky-sounding {
			z-index: 8;
			grid-row: 1;
			top: 0.35rem;
			padding: 0.4rem;
			border: 1px solid var(--arch-rule);
			border-radius: 0.65rem;
			background: var(--arch-ink);
		}

		.sticky-sounding :global(.viewport.compact) {
			min-height: 44dvh;
			max-height: 46dvh;
			transition:
				min-height 180ms ease,
				max-height 180ms ease;
		}

		.sticky-sounding.mobile-expanded :global(.viewport.compact) {
			min-height: 70dvh;
			max-height: 74dvh;
		}

		.mobile-map-toggle {
			display: inline-flex;
			min-height: 2.35rem;
			align-items: center;
			justify-content: center;
			padding: 0.35rem 0.6rem;
			border: 1px solid var(--arch-rule);
			border-radius: 999px;
			background: color-mix(in srgb, var(--arch-panel) 88%, transparent);
			color: var(--arch-accent-bright);
			font: inherit;
			font-size: 0.64rem;
			font-weight: 750;
			cursor: pointer;
		}

		.explorer-layout {
			grid-template-columns: 1fr;
		}

		.inspector-column {
			position: static;
		}

		.empty-inspector {
			min-height: 10rem;
		}
	}

	@media (max-width: 47rem) {
		.archipelago {
			margin-block: 2rem 3rem;
			border-radius: 0.6rem;
		}

		.atlas-header,
		.explorer-heading,
		.control-deck {
			grid-template-columns: 1fr;
		}

		.atlas-header {
			align-items: start;
			flex-direction: column;
		}

		.header-note {
			justify-content: flex-start;
		}

		.opening-map,
		.opening-map :global(.viewport) {
			min-height: 44dvh;
			max-height: 46dvh;
			transition:
				min-height 180ms ease,
				max-height 180ms ease;
		}

		.opening-map.mobile-expanded,
		.opening-map.mobile-expanded :global(.viewport) {
			min-height: 70dvh;
			max-height: 74dvh;
		}

		.opening-copy {
			top: 1.2rem;
			left: 1.2rem;
			width: min(21rem, calc(100% - 2.4rem));
		}

		.opening-copy span {
			display: none;
		}

		.opening-tide {
			right: 0.8rem;
			bottom: 0.8rem;
			left: 0.8rem;
		}

		.guided,
		.free-explorer {
			padding: 0.75rem;
		}

		.view-tools {
			grid-column: auto;
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.archipelago *,
		.archipelago *::before,
		.archipelago *::after {
			scroll-behavior: auto !important;
			animation-duration: 0.001ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.001ms !important;
		}
	}

	@media print {
		.archipelago {
			left: 0;
			width: 100%;
			margin: 1rem 0;
			transform: none;
			box-shadow: none;
		}

		.opening-map,
		.guided,
		.free-explorer,
		.view-tools {
			display: none;
		}
	}
</style>
