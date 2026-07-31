<script lang="ts">
	import { replaceState as replaceNavigationState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { track } from '@vercel/analytics';
	import { onMount, tick } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import AccessibleCityReport from './AccessibleCityReport.svelte';
	import AdvancedSettings from './AdvancedSettings.svelte';
	import AnchorPalette from './AnchorPalette.svelte';
	import ChallengePanel from './ChallengePanel.svelte';
	import CityCanvas from './CityCanvas.svelte';
	import CityInspector from './CityInspector.svelte';
	import CityToolbar from './CityToolbar.svelte';
	import GuidedTrials from './GuidedTrials.svelte';
	import MunicipalReport from './MunicipalReport.svelte';
	import ScorePanel from './ScorePanel.svelte';
	import {
		ANCHORS,
		CANONICAL_CITY_REPORT,
		DEFAULT_CITY_CONFIG,
		GUIDED_TRIALS,
		createCityExport,
		createCityWorkerClient,
		dimensionsForConfig,
		generateCity,
		parseCityConfig,
		serializeCityConfig,
		type AnchorId,
		type CellCoordinate,
		type CityConfig,
		type CityConfigIssue,
		type CityResult,
		type CityWorkerClient,
		type CityWorkerResponse,
		type GenerationEvent,
		type GuidedTrial,
		type Rotation
	} from '$lib/visualizations/city-master-plan';
	import {
		anchorFootprintSize,
		rotateAnchorFootprint
	} from '$lib/visualizations/city-master-plan/engine/anchors';
	import {
		renderCityToBlob,
		type CityAppearance,
		type CityPlacementPreview
	} from '$lib/visualizations/city-master-plan/render';
	import {
		copyText,
		downloadBlob,
		safeFilename,
		shareCity
	} from '$lib/visualizations/city-master-plan/export/browser';

	type PlaybackState = 'preparing' | 'placing' | 'revealing' | 'paused' | 'complete' | 'error';
	type PresentationMode = 'play' | 'lab';
	type ChallengeKind = 'functional' | 'calamity' | 'anchor';
	type GenerationSource =
		| 'canonical'
		| 'shared'
		| 'placement'
		| 'settings'
		| 'trial'
		| 'new-seed'
		| 'retry';
	type ActiveGeneration = {
		generationId: number;
		jobId: number;
		source: GenerationSource;
	};
	type ActiveChallenge = {
		generationId: number;
		jobId: number | null;
	};
	type CanvasController = {
		fit: () => void;
		focus: () => void;
	};
	type AggregateProperties = Record<string, string | number | boolean | null | undefined>;

	const POSTER = '/images/the-city-that-refuses-a-master-plan.webp';
	const REVEAL_DURATION_MS = 6_500;
	const CITY_ROUTE_PARAMS = {
		category: 'visualizations',
		slug: 'the-city-that-refuses-a-master-plan'
	};
	const CITY_PARAMETER_KEYS = [
		'v',
		'seed',
		'anchor',
		'ax',
		'ay',
		'r',
		'size',
		'patience',
		'guarantees',
		'density',
		'landmarks',
		'appetite',
		'tram'
	] as const;

	let laboratory: HTMLElement;
	let inspectorRegion = $state<HTMLElement | undefined>();
	let applicationErrorRegion = $state<HTMLElement | undefined>();
	let canvasController: CanvasController | undefined;
	let mainWorker: CityWorkerClient | null = null;
	let challengeWorker: CityWorkerClient | null = null;
	let unsubscribeMainWorker: (() => void) | null = null;
	let unsubscribeChallengeWorker: (() => void) | null = null;
	let frameHandle: number | null = null;
	let intersectionObserver: IntersectionObserver | null = null;
	let rootObserver: MutationObserver | null = null;
	let motionQuery: MediaQueryList | null = null;
	let lastFrameTime = 0;
	let revealAccumulator = 0;
	let statusUpdatedAt = 0;
	let randomSeedCounter = 0;

	let config = $state<CityConfig>(cloneConfig(DEFAULT_CITY_CONFIG));
	let result = $state<CityResult | null>(null);
	let playbackState = $state<PlaybackState>('preparing');
	let mode = $state<PresentationMode>('play');
	let revealEventCount = $state(0);
	let computeProgress = $state(0);
	let revealSpeed = $state(1);
	let selectedCell = $state<CellCoordinate | null>(null);
	let placementCell = $state<CellCoordinate | null>(null);
	let placementCommitted = $state(false);
	let draftAnchorId = $state<AnchorId>(DEFAULT_CITY_CONFIG.anchor.id);
	let draftRotation = $state<Rotation>(DEFAULT_CITY_CONFIG.anchor.rotation);
	let activeTrial = $state<string | null>(null);
	let showEntropy = $state(false);
	let showEdges = $state(false);
	let ambientMotion = $state(true);
	let entropySnapshot = $state<Array<number | null>>([]);
	let candidateSnapshot = $state<Array<number | null>>([]);
	let liveStatus = $state('The canonical survey is ready; local construction will begin shortly.');
	let actionStatus = $state('');
	let appError = $state('');
	let challengeError = $state('');
	let urlIssues = $state<string[]>([]);
	let appearance = $state<CityAppearance>('paper');
	let reducedMotion = $state(false);
	let siteMotionStill = $state(false);
	let documentHidden = $state(false);
	let laboratoryVisible = $state(true);
	let generationSequence = 0;
	let challengeSequence = 0;
	let activeGeneration = $state<ActiveGeneration | null>(null);
	let activeChallenge = $state<ActiveChallenge | null>(null);
	let challengeKind = $state<ChallengeKind | null>(null);
	let challengerConfig = $state<CityConfig | null>(null);
	let challengerResult = $state<CityResult | null>(null);
	let urlCommitted = false;
	let enhanced = $state(false);
	let inspectorExpanded = $state(true);

	let panelResult = $derived(playbackState === 'complete' ? result : null);
	let motionAllowed = $derived(!reducedMotion && !siteMotionStill);
	let canvasAnimated = $derived(
		ambientMotion &&
			motionAllowed &&
			laboratoryVisible &&
			!documentHidden &&
			playbackState === 'complete'
	);
	let revealProgress = $derived(
		result?.events.length
			? Math.min(1, revealEventCount / result.events.length)
			: playbackState === 'complete'
				? 1
				: computeProgress
	);
	let currentEvent = $derived(
		result && revealEventCount > 0 ? result.events[revealEventCount - 1] : null
	);
	let canGenerate = $derived(
		playbackState === 'placing' && placementCommitted && Boolean(mainWorker)
	);
	let draftAnchor = $derived(ANCHORS.find((anchor) => anchor.id === draftAnchorId) ?? ANCHORS[0]);
	let placementPreview = $derived.by((): CityPlacementPreview | null => {
		if (playbackState !== 'placing') return null;
		const origin = placementCell ?? {
			x: config.anchor.x,
			y: config.anchor.y
		};
		return {
			active: true,
			anchorId: draftAnchorId,
			rotation: draftRotation,
			origin,
			footprint: rotateAnchorFootprint(draftAnchor.footprint, draftRotation),
			validity: placementValidity(origin),
			label: draftAnchor.label
		};
	});
	let placementGuidance = $derived.by(() => {
		if (!placementPreview) return '';
		switch (placementPreview.validity) {
			case 'invalid':
				return 'Invalid footprint: crossed outline. Move it inside the survey boundary.';
			case 'conditional':
				return 'Conditionally valid: dashed outline. The new city will renegotiate this substrate.';
			default:
				return 'Valid footprint: solid outline. Place it to commit the starting condition.';
		}
	});
	let visibleLog = $derived.by(() => {
		if (!result) return [] as GenerationEvent[];
		return result.events
			.slice(0, revealEventCount)
			.filter((event) => event.type !== 'propagate' || event.removedCandidates > 0)
			.slice(-8)
			.reverse();
	});
	let selectedDescription = $derived.by(() => describeSelectedCell(result, selectedCell));

	function cloneConfig(value: CityConfig): CityConfig {
		return { ...value, anchor: { ...value.anchor } };
	}

	function trackAggregate(name: string, properties?: AggregateProperties): void {
		try {
			track(name, properties);
		} catch {
			// Analytics is deliberately non-essential. Generation and export must remain local.
		}
	}

	function exceptionBand(count: number): string {
		if (count === 0) return 'none';
		if (count <= 3) return 'one-to-three';
		return 'four-or-more';
	}

	function connectMainWorker(): boolean {
		disconnectMainWorker();
		try {
			mainWorker = createCityWorkerClient();
			unsubscribeMainWorker = mainWorker.subscribe(handleMainWorkerMessage);
			return true;
		} catch (error) {
			mainWorker = null;
			failApplication(
				error instanceof Error ? error.message : 'The city generation Worker could not be started.'
			);
			return false;
		}
	}

	function connectChallengeWorker(): boolean {
		disconnectChallengeWorker();
		try {
			challengeWorker = createCityWorkerClient();
			unsubscribeChallengeWorker = challengeWorker.subscribe(handleChallengeWorkerMessage);
			return true;
		} catch {
			challengeWorker = null;
			return false;
		}
	}

	function disconnectMainWorker(): void {
		unsubscribeMainWorker?.();
		unsubscribeMainWorker = null;
		try {
			mainWorker?.dispose();
		} catch {
			// Worker termination is idempotent from the laboratory's perspective.
		}
		mainWorker = null;
		activeGeneration = null;
	}

	function disconnectChallengeWorker(): void {
		unsubscribeChallengeWorker?.();
		unsubscribeChallengeWorker = null;
		try {
			challengeWorker?.dispose();
		} catch {
			// A failed comparison Worker has no state worth preserving.
		}
		challengeWorker = null;
		activeChallenge = null;
	}

	function startGeneration(source: GenerationSource, commitTopology = true): void {
		cancelReplayFrame();
		if (activeGeneration) {
			// A synchronous Worker job cannot consume a queued CANCEL until it returns.
			// Terminating it is the genuine hard-cancellation path.
			if (!connectMainWorker()) return;
		}
		if (!mainWorker && !connectMainWorker()) return;

		if (commitTopology) commitCurrentUrl();
		const generationId = ++generationSequence;
		let jobId: number;
		try {
			jobId = mainWorker!.generate(cloneConfig(config));
		} catch (error) {
			failApplication(
				error instanceof Error ? error.message : 'The city could not be sent to its Worker.'
			);
			return;
		}

		activeGeneration = { generationId, jobId, source };
		playbackState = 'preparing';
		result = null;
		selectedCell = null;
		revealEventCount = 0;
		computeProgress = 0;
		entropySnapshot = [];
		candidateSnapshot = [];
		appError = '';
		liveStatus =
			source === 'shared'
				? 'Recomputing the exact shared city in a local Worker.'
				: 'The neighbourhood is negotiating lanes, addresses, and precedents.';
		trackAggregate('City generation started', {
			source,
			anchor: config.anchor.id,
			size: config.size,
			mode
		});
	}

	function handleMainWorkerMessage(response: CityWorkerResponse): void {
		const active = activeGeneration;
		if (!active || response.jobId !== active.jobId || active.generationId !== generationSequence) {
			return;
		}

		switch (response.type) {
			case 'PROGRESS':
				handleProgressBatch(response.events);
				break;
			case 'COMPLETE': {
				activeGeneration = null;
				computeProgress = 1;
				const completed = response.result;
				config = cloneConfig(completed.config);
				beginReplay(completed);
				trackAggregate('City generation completed', {
					source: active.source,
					anchor: completed.anchor.id,
					size: completed.config.size,
					exceptions: exceptionBand(completed.municipalPatches.length)
				});
				break;
			}
			case 'ERROR':
				activeGeneration = null;
				failApplication(response.message);
				break;
			case 'CANCELLED':
			case 'DISPOSED':
				break;
		}
	}

	function handleProgressBatch(events: readonly GenerationEvent[]): void {
		const last = events.at(-1);
		if (!last) return;
		computeProgress = Math.max(computeProgress, last.progress);
		const now = performance.now();
		const important = events.findLast(
			(event) =>
				event.type === 'phase' ||
				event.type === 'contradiction' ||
				event.type === 'backtrack' ||
				event.type === 'patch'
		);
		if (important || now - statusUpdatedAt > 350) {
			liveStatus = important ? generationEventText(important) : generationEventText(last);
			statusUpdatedAt = now;
		}
	}

	function beginReplay(completed: CityResult): void {
		result = completed;
		revealEventCount = 0;
		revealAccumulator = 0;
		lastFrameTime = 0;
		entropySnapshot = Array<number | null>(completed.width * completed.height).fill(null);
		candidateSnapshot = Array<number | null>(completed.width * completed.height).fill(null);
		playbackState = 'revealing';
		liveStatus = `Survey complete. Replaying ${completed.events.length.toLocaleString()} genuine decisions.`;
		void tick().then(() => canvasController?.fit());

		if (!motionAllowed || completed.events.length === 0) {
			finishReplay(true);
			return;
		}
		scheduleReplayFrame();
	}

	function scheduleReplayFrame(): void {
		if (
			frameHandle !== null ||
			playbackState !== 'revealing' ||
			documentHidden ||
			!laboratoryVisible
		) {
			return;
		}
		frameHandle = requestAnimationFrame(runReplayFrame);
	}

	function runReplayFrame(timestamp: number): void {
		frameHandle = null;
		if (playbackState !== 'revealing' || documentHidden || !laboratoryVisible || !result) {
			lastFrameTime = 0;
			return;
		}

		if (lastFrameTime === 0) lastFrameTime = timestamp;
		const elapsed = Math.min(80, Math.max(0, timestamp - lastFrameTime));
		lastFrameTime = timestamp;
		const eventsPerMillisecond =
			result.events.length / Math.max(1, REVEAL_DURATION_MS / revealSpeed);
		revealAccumulator += elapsed * eventsPerMillisecond;
		const advance = Math.floor(revealAccumulator);
		if (advance > 0) {
			revealAccumulator -= advance;
			advanceRevealTo(Math.min(result.events.length, revealEventCount + advance));
		}

		if (revealEventCount >= result.events.length) {
			finishReplay();
		} else {
			scheduleReplayFrame();
		}
	}

	function advanceRevealTo(nextCount: number): void {
		if (!result) return;
		const bounded = Math.max(
			revealEventCount,
			Math.min(result.events.length, Math.round(nextCount))
		);
		if (bounded === revealEventCount) return;
		const nextEntropy = [...entropySnapshot];
		const nextCandidates = [...candidateSnapshot];
		for (let index = revealEventCount; index < bounded; index += 1) {
			const event = result.events[index];
			if (event.type !== 'observe') continue;
			const cellIndex = event.cell.y * result.width + event.cell.x;
			nextEntropy[cellIndex] = event.entropy;
			nextCandidates[cellIndex] = event.candidateCount;
		}
		entropySnapshot = nextEntropy;
		candidateSnapshot = nextCandidates;
		revealEventCount = bounded;
	}

	function pauseOrResumeReplay(): void {
		if (playbackState === 'revealing') {
			playbackState = 'paused';
			cancelReplayFrame();
			liveStatus = 'Negotiations paused. No decision order has changed.';
			return;
		}
		if (playbackState === 'paused') {
			if (!motionAllowed) {
				finishReplay();
				return;
			}
			playbackState = 'revealing';
			lastFrameTime = 0;
			liveStatus = 'Negotiations resumed from the same event.';
			scheduleReplayFrame();
		}
	}

	function stepReplay(): void {
		if (playbackState !== 'paused' || !result) return;
		let target = revealEventCount;
		let foundObservation = false;
		while (target < result.events.length) {
			const event = result.events[target];
			if (event.type === 'observe' && foundObservation) break;
			target += 1;
			if (event.type === 'observe') foundObservation = true;
		}
		if (!foundObservation) target = Math.min(result.events.length, revealEventCount + 1);
		advanceRevealTo(target);
		if (revealEventCount >= result.events.length) finishReplay();
		else liveStatus = 'One observation and its resulting propagation have been approved.';
	}

	function finishReplay(quiet = false): void {
		if (!result) return;
		cancelReplayFrame();
		advanceRevealTo(result.events.length);
		playbackState = 'complete';
		computeProgress = 1;
		if (!selectedCell) selectedCell = { x: result.anchor.x, y: result.anchor.y };
		if (!quiet) {
			liveStatus = `${result.cityName} is complete. Fingerprint ${result.fingerprint}.`;
		} else {
			liveStatus = `${result.cityName} is complete; motion preferences skipped the animated replay.`;
		}
	}

	function cancelReplayFrame(): void {
		if (frameHandle !== null) cancelAnimationFrame(frameHandle);
		frameHandle = null;
		lastFrameTime = 0;
	}

	function makeOwnCity(): void {
		if (!result || playbackState === 'preparing') {
			actionStatus = 'Wait for the current local survey before placing another anchor.';
			return;
		}
		cancelReplayFrame();
		playbackState = 'placing';
		draftAnchorId = config.anchor.id;
		draftRotation = config.anchor.rotation;
		placementCell = { x: config.anchor.x, y: config.anchor.y };
		placementCommitted = false;
		selectedCell = null;
		activeTrial = null;
		liveStatus =
			'Choose one object, move its footprint over the map, rotate if useful, then place it.';
		void tick().then(() => canvasController?.focus());
	}

	function chooseAnchor(id: AnchorId): void {
		const definition = ANCHORS.find((anchor) => anchor.id === id);
		if (!definition) return;
		draftAnchorId = id;
		draftRotation = definition.rotations[0];
		placementCommitted = false;
		trackAggregate('City anchor selected', { anchor: id });
	}

	function rotateDraftAnchor(): void {
		if (playbackState !== 'placing') return;
		const rotations = draftAnchor.rotations;
		const index = rotations.indexOf(draftRotation);
		draftRotation = rotations[(index + 1) % rotations.length];
		placementCommitted = false;
		liveStatus = `${draftAnchor.label} rotated to ${draftRotation * 90} degrees.`;
	}

	function updatePlacementHover(cell: CellCoordinate | null): void {
		if (playbackState === 'placing') placementCell = cell;
	}

	function placeAnchor(cell: CellCoordinate, rotation: Rotation = draftRotation): void {
		if (playbackState !== 'placing') return;
		draftRotation = rotation;
		const validity = placementValidity(cell);
		if (validity === 'invalid') {
			placementCell = cell;
			placementCommitted = false;
			liveStatus = 'That footprint crosses the survey boundary. Choose another cell.';
			return;
		}
		config = {
			...config,
			anchor: {
				id: draftAnchorId,
				x: cell.x,
				y: cell.y,
				rotation: draftRotation
			}
		};
		placementCell = { ...cell };
		placementCommitted = true;
		commitCurrentUrl();
		liveStatus =
			validity === 'conditional'
				? `${draftAnchor.label} placed at column ${cell.x + 1}, row ${cell.y + 1}. The substrate is conditional and will be renegotiated.`
				: `${draftAnchor.label} placed at column ${cell.x + 1}, row ${cell.y + 1}.`;
	}

	function placementIsValid(cell: CellCoordinate): boolean {
		const dimensions = dimensionsForConfig(config);
		const size = anchorFootprintSize(draftAnchor, draftRotation);
		return (
			Number.isInteger(cell.x) &&
			Number.isInteger(cell.y) &&
			cell.x >= 0 &&
			cell.y >= 0 &&
			cell.x + size.width <= dimensions.width &&
			cell.y + size.height <= dimensions.height
		);
	}

	function placementValidity(cell: CellCoordinate): NonNullable<CityPlacementPreview['validity']> {
		if (!placementIsValid(cell)) return 'invalid';
		if (!result || !draftAnchor.requiredSubstrate?.length) return 'valid';
		const footprint = rotateAnchorFootprint(draftAnchor.footprint, draftRotation);
		const substrateMatches = footprint.every((footprintCell) => {
			const x = cell.x + footprintCell.dx;
			const y = cell.y + footprintCell.dy;
			const fabric = result?.fabricTiles[y * result.width + x];
			return draftAnchor.requiredSubstrate?.some((tag) => fabric?.tags.includes(tag));
		});
		return substrateMatches ? 'valid' : 'conditional';
	}

	function inspectCell(cell: CellCoordinate): void {
		selectCell(cell);
		inspectorExpanded = true;
		void tick().then(() => inspectorRegion?.focus());
	}

	function generatePlacedCity(): void {
		if (!placementCommitted) {
			liveStatus = 'Place the selected anchor on a valid cell first.';
			return;
		}
		startGeneration('placement');
	}

	function updateTopologyConfig(
		patch: Partial<Omit<CityConfig, 'anchor' | 'generatorVersion'>>
	): void {
		const candidate = {
			...config,
			...patch,
			anchor: { ...config.anchor }
		};
		const parsed = parseCityConfig(serializeCityConfig(candidate));
		config = cloneConfig(parsed.config);
		activeTrial = null;
		urlIssues = parsed.issues.map(formatConfigIssue);
		commitCurrentUrl();
		startGeneration('settings', false);
	}

	function applyGuidedTrial(trial: GuidedTrial): void {
		config = cloneConfig(trial.config);
		activeTrial = trial.id;
		challengeError = '';
		commitCurrentUrl();
		trackAggregate('City guided trial selected', {
			trial: trial.id,
			anchor: trial.config.anchor.id,
			size: trial.config.size
		});
		startGeneration('trial', false);
	}

	function tryAnotherMunicipality(): void {
		const base = result ? cloneConfig(result.config) : cloneConfig(config);
		base.seed = makeLocalSeed();
		config = base;
		activeTrial = null;
		commitCurrentUrl();
		startGeneration('new-seed', false);
	}

	function makeLocalSeed(): string {
		randomSeedCounter += 1;
		const values = new Uint32Array(2);
		if (globalThis.crypto?.getRandomValues) {
			globalThis.crypto.getRandomValues(values);
			return `municipality-${values[0].toString(36)}-${values[1].toString(36)}`;
		}
		return `municipality-${Date.now().toString(36)}-${randomSeedCounter.toString(36)}`;
	}

	function changeMode(nextMode: PresentationMode): void {
		mode = nextMode;
		if (mode === 'lab' && !showEntropy) showEntropy = true;
		liveStatus =
			mode === 'lab'
				? 'Lab mode exposes the genuine observation and propagation history.'
				: 'Play mode keeps the same generated city and simplifies its presentation.';
		trackAggregate('City presentation mode changed', { mode });
	}

	function selectCell(cell: CellCoordinate): void {
		if (!result) return;
		selectedCell = {
			x: Math.max(0, Math.min(result.width - 1, Math.round(cell.x))),
			y: Math.max(0, Math.min(result.height - 1, Math.round(cell.y)))
		};
	}

	function handleLaboratoryKeydown(event: KeyboardEvent): void {
		if (event.defaultPrevented) return;
		const target = event.target as HTMLElement | null;
		if (event.key === 'Escape') {
			if (
				inspectorExpanded &&
				inspectorRegion?.contains(target) &&
				window.matchMedia('(max-width: 700px)').matches
			) {
				event.preventDefault();
				inspectorExpanded = false;
				liveStatus = 'The mobile cell inspector was collapsed; the city remains selected.';
				void tick().then(() => canvasController?.focus());
				return;
			}
			const openPanels = [...laboratory.querySelectorAll<HTMLDetailsElement>('details[open]')];
			const panel = openPanels.at(-1);
			if (panel) {
				event.preventDefault();
				panel.open = false;
				panel.querySelector<HTMLElement>('summary')?.focus();
				liveStatus = 'Temporary panel closed; the city remains unchanged.';
				return;
			}
			if (playbackState === 'placing' && result) {
				event.preventDefault();
				playbackState = 'complete';
				placementCommitted = false;
				liveStatus = 'Anchor placement cancelled; the existing city remains unchanged.';
				void tick().then(() => canvasController?.focus());
				return;
			}
		}
		if (target?.matches('input, select, textarea, button, summary, [contenteditable="true"]')) {
			return;
		}
		if (playbackState === 'placing' && event.key.toLowerCase() === 'r') {
			event.preventDefault();
			rotateDraftAnchor();
		}
	}

	function failApplication(message: string): void {
		cancelReplayFrame();
		activeGeneration = null;
		playbackState = 'error';
		appError = message || 'The interactive laboratory stopped unexpectedly.';
		liveStatus = `Application error. ${appError}`;
		void tick().then(() => applicationErrorRegion?.focus());
	}

	function retryGeneration(): void {
		appError = '';
		if (!connectMainWorker()) return;
		startGeneration('retry', false);
	}

	function recoverUnsupportedUrl(): void {
		config = cloneConfig(DEFAULT_CITY_CONFIG);
		challengeKind = null;
		challengerConfig = null;
		challengerResult = null;
		urlIssues = [];
		appError = '';
		urlCommitted = false;
		if (!mainWorker && !connectMainWorker()) return;
		replaceNavigationState(resolve('/blog/[category]/[slug]', CITY_ROUTE_PARAMS), {});
		startGeneration('canonical', false);
	}

	function buildPermanentParameters(cityConfig = config): URLSearchParams {
		const params = serializeCityConfig(cityConfig);
		if (challengeKind && challengerConfig) {
			params.set('challenge', challengeKind);
			for (const [key, value] of serializeCityConfig(challengerConfig)) {
				params.set(`c_${key}`, value);
			}
		}
		return params;
	}

	function permanentUrl(cityConfig = config): string {
		const parameters = buildPermanentParameters(cityConfig).toString();
		const path = resolve('/blog/[category]/[slug]', CITY_ROUTE_PARAMS);
		return `${window.location.origin}${path}${parameters ? `?${parameters}` : ''}`;
	}

	function commitCurrentUrl(): void {
		if (typeof window === 'undefined') return;
		const parameters = buildPermanentParameters();
		const suffix = parameters.size ? `?${parameters.toString()}` : '';
		let resolvedLocation = resolve('/blog/[category]/[slug]', CITY_ROUTE_PARAMS);
		resolvedLocation += suffix;
		replaceNavigationState(resolvedLocation, {});
		urlCommitted = true;
	}

	async function copyPermanentUrl(): Promise<void> {
		if (!panelResult) return;
		config = cloneConfig(panelResult.config);
		commitCurrentUrl();
		try {
			await copyText(permanentUrl(panelResult.config));
			actionStatus = 'Permanent URL copied. It contains the exact version and topology settings.';
			trackAggregate('City permanent URL copied', {
				anchor: panelResult.anchor.id,
				size: panelResult.config.size
			});
		} catch (error) {
			actionStatus =
				error instanceof Error
					? `${error.message} The exact URL is now in the address bar.`
					: 'Copy failed. The exact URL is now in the address bar.';
		}
	}

	async function shareCompletedCity(): Promise<void> {
		if (!panelResult) return;
		config = cloneConfig(panelResult.config);
		commitCurrentUrl();
		try {
			const outcome = await shareCity(panelResult, permanentUrl(panelResult.config));
			actionStatus =
				outcome === 'shared'
					? 'The city was handed to the device share sheet.'
					: 'Native sharing was unavailable, so the exact city text and URL were copied.';
			trackAggregate(
				outcome === 'shared' ? 'City native share invoked' : 'City share fallback copied',
				{ anchor: panelResult.anchor.id, size: panelResult.config.size }
			);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				actionStatus = 'Sharing was cancelled; the city is unchanged.';
				return;
			}
			actionStatus = error instanceof Error ? error.message : 'The city could not be shared.';
		}
	}

	async function copyMunicipalReport(): Promise<void> {
		if (!panelResult) return;
		const text = `${panelResult.cityName}\n${panelResult.report}\nFunctional ${panelResult.scores.functional}/100 · Calamity ${panelResult.scores.calamity}/100\nFingerprint ${panelResult.fingerprint}\nFictional neighbourhood generated from local rules. Not a map of a real place.`;
		try {
			await copyText(text);
			actionStatus = 'Municipal report copied.';
		} catch (error) {
			actionStatus = error instanceof Error ? error.message : 'The report could not be copied.';
		}
	}

	function downloadCityJson(): void {
		if (!panelResult) return;
		try {
			const payload = createCityExport(panelResult);
			const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
				type: 'application/json;charset=utf-8'
			});
			downloadBlob(blob, `${safeFilename(panelResult.cityName)}-${panelResult.fingerprint}.json`);
			actionStatus = 'Versioned city JSON downloaded.';
			trackAggregate('City JSON downloaded', {
				anchor: panelResult.anchor.id,
				size: panelResult.config.size
			});
		} catch (error) {
			actionStatus =
				error instanceof Error ? error.message : 'The JSON export could not be created.';
		}
	}

	async function downloadCityPng(kind: 'social' | 'map'): Promise<void> {
		if (!panelResult) return;
		actionStatus =
			kind === 'map'
				? 'Composing a separate metadata-complete 3200 × 2400 map poster…'
				: 'Composing a separate 1600 × 1200 social card…';
		try {
			const blob =
				kind === 'map'
					? await renderCityToBlob(panelResult, {
							kind: 'map',
							appearance
						})
					: await renderCityToBlob(panelResult, {
							kind: 'social',
							appearance,
							width: 1_600,
							height: 1_200,
							maxDimension: 2_400,
							siteLabel: 'SuvroGhosh.In',
							title: 'The City That Refuses a Master Plan'
						});
			downloadBlob(
				blob,
				`${safeFilename(panelResult.cityName)}-${panelResult.fingerprint}-${kind}.png`
			);
			actionStatus =
				kind === 'map' ? 'High-resolution map PNG downloaded.' : 'Social PNG downloaded.';
			trackAggregate('City PNG downloaded', {
				kind,
				anchor: panelResult.anchor.id,
				size: panelResult.config.size
			});
		} catch (error) {
			actionStatus =
				error instanceof Error ? error.message : 'The PNG export could not be created.';
		}
	}

	async function beginChallenge(kind: ChallengeKind): Promise<void> {
		if (!panelResult) return;
		const challenger = panelResult;
		challengeKind = kind;
		challengerConfig = cloneConfig(challenger.config);
		challengerResult = null;
		challengeError = '';
		config = createChallengeRecipientConfig(kind, challenger);
		commitCurrentUrl();
		const url = permanentUrl(config);
		const copyOperation = copyText(url);
		startChallengeGeneration(challengerConfig);
		startGeneration(kind === 'anchor' ? 'placement' : 'new-seed', false);
		trackAggregate('City challenge started', {
			kind,
			anchor: challenger.anchor.id,
			size: challenger.config.size
		});
		try {
			await copyOperation;
			actionStatus =
				kind === 'anchor'
					? 'Challenge URL copied. A different anchor is being tried under the same seed.'
					: 'Challenge URL copied. A deterministic reply seed is being generated under the same settings.';
		} catch (error) {
			actionStatus =
				error instanceof Error
					? `${error.message} The challenge URL is in the address bar.`
					: 'Copy failed. The challenge URL is in the address bar.';
		}
	}

	function createChallengeRecipientConfig(kind: ChallengeKind, challenger: CityResult): CityConfig {
		const recipient = cloneConfig(challenger.config);
		if (kind === 'anchor') {
			const currentIndex = Math.max(
				0,
				ANCHORS.findIndex((anchor) => anchor.id === challenger.anchor.id)
			);
			const nextAnchor = ANCHORS[(currentIndex + 1) % ANCHORS.length];
			recipient.anchor = {
				...recipient.anchor,
				id: nextAnchor.id,
				rotation: nextAnchor.rotations[0]
			};
			return recipient;
		}

		const replySeed = `rematch-${challenger.fingerprint.toLowerCase()}-${challenger.seed}`.slice(
			0,
			80
		);
		recipient.seed =
			replySeed === challenger.seed ? `${challenger.seed.slice(0, 70)}-rematch` : replySeed;
		return recipient;
	}

	function startChallengeGeneration(opponent: CityConfig): void {
		challengerResult = null;
		challengeError = '';
		if (activeChallenge) connectChallengeWorker();
		const generationId = ++challengeSequence;

		if (challengeWorker || connectChallengeWorker()) {
			try {
				const jobId = challengeWorker!.generate(cloneConfig(opponent));
				activeChallenge = { generationId, jobId };
				actionStatus = 'Recomputing the challenger in a separate local Worker.';
				return;
			} catch {
				disconnectChallengeWorker();
			}
		}

		activeChallenge = { generationId, jobId: null };
		actionStatus =
			'Web Workers are unavailable for the opponent. Running one engine-bounded local comparison.';
		window.setTimeout(() => {
			if (activeChallenge?.generationId !== generationId) return;
			try {
				const completed = generateCity(cloneConfig(opponent));
				if (activeChallenge?.generationId !== generationId) return;
				activeChallenge = null;
				challengerResult = completed;
				actionStatus =
					'Opponent recomputed locally with the engine hard-step budget; no supplied score was trusted.';
				trackAggregate('City challenge completed', {
					kind: challengeKind ?? 'functional',
					size: completed.config.size,
					exceptions: exceptionBand(completed.municipalPatches.length)
				});
			} catch (error) {
				activeChallenge = null;
				challengeError =
					error instanceof Error
						? error.message
						: 'The bounded local challenge could not be computed.';
			}
		}, 0);
	}

	function handleChallengeWorkerMessage(response: CityWorkerResponse): void {
		const active = activeChallenge;
		if (
			!active ||
			active.jobId === null ||
			response.jobId !== active.jobId ||
			active.generationId !== challengeSequence
		) {
			return;
		}
		switch (response.type) {
			case 'COMPLETE':
				activeChallenge = null;
				challengerResult = response.result;
				actionStatus =
					'Opponent recomputed from seed and settings in a local Worker; supplied scores were ignored.';
				trackAggregate('City challenge completed', {
					kind: challengeKind ?? 'functional',
					size: response.result.config.size,
					exceptions: exceptionBand(response.result.municipalPatches.length)
				});
				break;
			case 'ERROR':
				activeChallenge = null;
				challengeError = response.message;
				break;
			case 'PROGRESS':
			case 'CANCELLED':
			case 'DISPOSED':
				break;
		}
	}

	function initialiseFromUrl(): boolean {
		const raw = new SvelteURLSearchParams(window.location.search);
		const hasCityParameters = CITY_PARAMETER_KEYS.some((key) => raw.has(key));
		urlCommitted = hasCityParameters;
		const parsed = hasCityParameters
			? parseCityConfig(raw)
			: {
					config: cloneConfig(DEFAULT_CITY_CONFIG),
					issues: [] as readonly CityConfigIssue[],
					unsupportedVersion: false
				};
		config = cloneConfig(parsed.config);
		urlIssues = parsed.issues.map(formatConfigIssue);

		if (parsed.unsupportedVersion) {
			appError =
				'This permanent URL requests an unsupported generator version. Its settings were not silently reinterpreted.';
			playbackState = 'error';
			liveStatus = appError;
			return false;
		}

		const challengeValue = raw.get('challenge');
		if (challengeValue) {
			if (
				challengeValue === 'functional' ||
				challengeValue === 'calamity' ||
				challengeValue === 'anchor'
			) {
				challengeKind = challengeValue;
				const challengeParameters = extractPrefixedParameters(raw, 'c_');
				const hasOpponentParameters = CITY_PARAMETER_KEYS.some((key) =>
					challengeParameters.has(key)
				);
				if (hasOpponentParameters) {
					const opponent = parseCityConfig(challengeParameters);
					urlIssues = [
						...urlIssues,
						...opponent.issues.map(
							(issue) => `Challenger ${formatConfigIssue(issue).toLowerCase()}`
						)
					];
					if (opponent.unsupportedVersion) {
						challengeError =
							'The challenger uses an unsupported generator version, so it was not reinterpreted.';
						challengeKind = null;
					} else {
						challengerConfig = cloneConfig(opponent.config);
					}
				} else {
					challengerConfig = cloneConfig(config);
				}
			} else {
				urlIssues = [...urlIssues, 'Unknown challenge type was ignored.'];
			}
		}

		// SvelteKit's client router finishes initialising immediately after component
		// hydration. Defer normalising a shared URL until that boundary; calling
		// replaceState synchronously from onMount aborts hydration on a hard reload.
		if (urlCommitted || challengeKind) {
			window.setTimeout(() => commitCurrentUrl(), 0);
		}
		return true;
	}

	function extractPrefixedParameters(source: URLSearchParams, prefix: string): URLSearchParams {
		const extracted = new SvelteURLSearchParams();
		for (const [key, value] of source) {
			if (key.startsWith(prefix)) extracted.set(key.slice(prefix.length), value);
		}
		return extracted;
	}

	function formatConfigIssue(issue: CityConfigIssue): string {
		return `${issue.parameter}: ${issue.message}`;
	}

	function generationEventText(event: GenerationEvent): string {
		switch (event.type) {
			case 'phase':
			case 'contradiction':
			case 'backtrack':
			case 'patch':
				return event.message;
			case 'observe':
				return `${event.pass} observation ${event.step}: ${event.candidateCount} candidates at column ${event.cell.x + 1}, row ${event.cell.y + 1}.`;
			case 'propagate':
				return `${event.pass} propagation removed ${event.removedCandidates} candidates across ${event.changedCells.length} cells and forced ${event.forcedCells.length} cells to one possibility.`;
			case 'complete':
				return `Local generation complete. Fingerprint ${event.fingerprint}.`;
		}
	}

	function describeSelectedCell(city: CityResult | null, cell: CellCoordinate | null): string {
		if (!city || !cell) return 'No map cell is selected.';
		const index = cell.y * city.width + cell.x;
		const fabric = city.fabricTiles[index];
		const occupation = city.occupationTiles[index];
		if (!fabric || !occupation) return 'The selected coordinate is outside the city.';
		const patch = city.municipalPatches.find(
			(item) => item.cell.x === cell.x && item.cell.y === cell.y
		);
		return `Column ${cell.x + 1}, row ${cell.y + 1}: ${fabric.prototypeId.replaceAll('-', ' ')} beneath ${occupation.prototypeId.replaceAll('-', ' ')}${patch ? `, with ${patch.anomalyType.replaceAll('-', ' ')}` : ''}.`;
	}

	function updateRootPreferences(): void {
		const theme = document.documentElement.dataset.theme;
		appearance =
			theme === 'night' || theme === 'light' || theme === 'high-contrast' ? theme : 'paper';
		siteMotionStill = document.documentElement.dataset.motion === 'still';
		if ((reducedMotion || siteMotionStill) && playbackState === 'revealing') {
			finishReplay(true);
		}
	}

	function updateEnvironmentPause(): void {
		if (documentHidden || !laboratoryVisible) {
			cancelReplayFrame();
			if (playbackState === 'revealing') {
				liveStatus = 'The reveal is waiting while the laboratory is not visible.';
			}
		} else if (playbackState === 'revealing') {
			lastFrameTime = 0;
			liveStatus = 'The same reveal has resumed now that the laboratory is visible.';
			scheduleReplayFrame();
		}
	}

	function fitMap(): void {
		canvasController?.fit();
	}

	function handleCanvasError(message: string): void {
		failApplication(`The city renderer stopped unexpectedly. ${message}`);
	}

	onMount(() => {
		enhanced = true;
		motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			reducedMotion = motionQuery?.matches ?? false;
			updateRootPreferences();
		};
		const updateVisibility = () => {
			documentHidden = document.hidden;
			updateEnvironmentPause();
		};
		updateMotion();
		updateVisibility();

		rootObserver = new MutationObserver(updateRootPreferences);
		rootObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme', 'data-motion']
		});
		intersectionObserver =
			typeof IntersectionObserver === 'undefined'
				? null
				: new IntersectionObserver(
						(entries) => {
							const entry = entries.at(-1);
							if (!entry) return;
							laboratoryVisible = entry.isIntersecting;
							updateEnvironmentPause();
						},
						{ rootMargin: '160px 0px', threshold: 0.01 }
					);
		intersectionObserver?.observe(laboratory);
		motionQuery.addEventListener('change', updateMotion);
		document.addEventListener('visibilitychange', updateVisibility);

		if (initialiseFromUrl() && connectMainWorker()) {
			startGeneration(urlCommitted ? 'shared' : 'canonical', false);
			if (challengeKind && challengerConfig) {
				startChallengeGeneration(challengerConfig);
			}
		}

		return () => {
			cancelReplayFrame();
			intersectionObserver?.disconnect();
			rootObserver?.disconnect();
			motionQuery?.removeEventListener('change', updateMotion);
			document.removeEventListener('visibilitychange', updateVisibility);
			disconnectMainWorker();
			disconnectChallengeWorker();
		};
	});
</script>

<svelte:window onkeydown={handleLaboratoryKeydown} />

<section
	bind:this={laboratory}
	class="city-laboratory article-breakout not-prose"
	class:lab-mode={mode === 'lab'}
	aria-labelledby="city-master-plan-heading"
	data-testid="city-master-plan-lab"
	data-state={playbackState}
	data-mode={mode}
	data-tts-exclude
>
	<header class="laboratory-header">
		<div>
			<p>Procedural city laboratory · Generator v1</p>
			<h2 id="city-master-plan-heading">Place one thing. The neighbourhood negotiates the rest.</h2>
		</div>
		<div class="header-facts" aria-label="Laboratory facts">
			<span>Local Worker</span>
			<span>Deterministic</span>
			<span>No real map data</span>
		</div>
	</header>

	<div class="global-status">
		<p data-testid="city-status" role="status" aria-live="polite">{liveStatus}</p>
		{#if activeGeneration}
			<span>Job {activeGeneration.jobId} · generation {activeGeneration.generationId}</span>
		{/if}
	</div>

	{#if urlIssues.length}
		<aside class="input-notice" aria-labelledby="city-url-notice-heading">
			<h3 id="city-url-notice-heading">Shared-link adjustments</h3>
			<ul>
				{#each urlIssues as issue (issue)}
					<li>{issue}</li>
				{/each}
			</ul>
		</aside>
	{/if}

	{#if appError}
		<div bind:this={applicationErrorRegion} class="application-error" role="alert" tabindex="-1">
			<div>
				<strong>The interactive laboratory could not continue.</strong>
				<p>{appError}</p>
			</div>
			{#if appError.includes('unsupported generator version')}
				<button type="button" onclick={recoverUnsupportedUrl}>Load the published v1 demo</button>
			{:else}
				<button type="button" onclick={retryGeneration}>Restart the local Worker</button>
			{/if}
		</div>
	{/if}

	<div class="workbench" inert={!enhanced} aria-hidden={!enhanced}>
		<div class="map-column">
			<CityToolbar
				state={playbackState}
				{mode}
				progress={revealProgress}
				{canGenerate}
				onmake={makeOwnCity}
				ongenerate={generatePlacedCity}
				onpause={pauseOrResumeReplay}
				onstep={stepReplay}
				onfinish={() => finishReplay()}
				onnewseed={tryAnotherMunicipality}
				onfit={fitMap}
				onmode={changeMode}
			/>

			<div
				class="map-stage"
				class:computing={playbackState === 'preparing'}
				aria-busy={playbackState === 'preparing'}
			>
				<img
					class="static-poster"
					class:superseded={Boolean(result)}
					src={POSTER}
					alt={result
						? ''
						: 'Illustrated fictional neighbourhood survey with lanes, ponds, trees, tram steel, ochre roofs, and a stamped municipal exception'}
					aria-hidden={Boolean(result)}
					loading="eager"
					decoding="async"
				/>
				<CityCanvas
					bind:this={canvasController}
					{result}
					{revealEventCount}
					{mode}
					selected={selectedCell}
					showEntropy={mode === 'lab' && showEntropy}
					showSockets={mode === 'lab' && showEdges}
					animate={canvasAnimated}
					placement={placementPreview}
					event={currentEvent}
					entropy={entropySnapshot}
					candidateCounts={candidateSnapshot}
					{appearance}
					poster={POSTER}
					showGrid={mode === 'lab' || playbackState === 'placing'}
					disabled={playbackState === 'preparing' || playbackState === 'error'}
					onselect={selectCell}
					oninspect={inspectCell}
					onplace={placeAnchor}
					onhover={updatePlacementHover}
					onrotate={rotateDraftAnchor}
					onerror={handleCanvasError}
				/>
				{#if playbackState === 'preparing'}
					<div class="computing-card">
						<span class="survey-mark" aria-hidden="true">WFC</span>
						<strong>Computing locally</strong>
						<small>The illustrated reveal begins only after the genuine result arrives.</small>
					</div>
				{/if}
			</div>

			{#if playbackState === 'placing'}
				<div class="placement-instructions">
					<p>
						<strong>Place the first local condition.</strong>
						Move over the survey, click or tap a valid cell, or focus the map and use the keyboard. Press
						<kbd>R</kbd> to rotate.
					</p>
					<span class:ready={placementCommitted}>
						{placementCommitted
							? 'Placement committed. The permanent URL now records it.'
							: placementGuidance}
					</span>
				</div>
				<AnchorPalette
					anchors={ANCHORS}
					selected={draftAnchorId}
					rotation={draftRotation}
					disabled={playbackState !== 'placing'}
					onselect={chooseAnchor}
					onrotate={rotateDraftAnchor}
				/>
			{/if}

			{#if mode === 'lab'}
				<section class="decision-ledger" aria-labelledby="city-decision-ledger-heading">
					<div class="ledger-heading">
						<div>
							<p>Genuine event replay</p>
							<h3 id="city-decision-ledger-heading">What the neighbourhood decided</h3>
						</div>
						{#if result}
							<dl>
								<div>
									<dt>Events shown</dt>
									<dd>{revealEventCount}/{result.events.length}</dd>
								</div>
								<div>
									<dt>Backtracks</dt>
									<dd>{result.statistics.backtracks}</dd>
								</div>
								<div>
									<dt>Contradictions</dt>
									<dd>{result.statistics.contradictions}</dd>
								</div>
							</dl>
						{/if}
					</div>
					{#if visibleLog.length}
						<ol class="event-log">
							{#each visibleLog as event, index (`${revealEventCount}-${index}-${event.type}`)}
								<li data-kind={event.type}>
									<span>{event.type}</span>
									<p>{generationEventText(event)}</p>
								</li>
							{/each}
						</ol>
					{:else}
						<p class="ledger-empty">
							Worker events will appear here when the completed result begins its replay.
						</p>
					{/if}
				</section>
			{/if}

			<GuidedTrials trials={GUIDED_TRIALS} active={activeTrial} onapply={applyGuidedTrial} />
		</div>

		<aside class="report-rail" aria-label="City outcomes and controls">
			<ScorePanel result={panelResult} />

			{#if result && selectedCell}
				<div
					bind:this={inspectorRegion}
					class="inspector-focus-region"
					data-expanded={inspectorExpanded}
					tabindex="-1"
					aria-label="Selected cell inspector"
				>
					<button
						class="mobile-inspector-toggle"
						type="button"
						aria-expanded={inspectorExpanded}
						onclick={() => (inspectorExpanded = !inspectorExpanded)}
					>
						<span>Cell {selectedCell.x + 1}, {selectedCell.y + 1}</span>
						<span aria-hidden="true">{inspectorExpanded ? 'Collapse ↓' : 'Open ↑'}</span>
					</button>
					<div class="inspector-content">
						<CityInspector {result} selected={selectedCell} {revealEventCount} />
					</div>
				</div>
			{/if}

			<MunicipalReport
				result={panelResult}
				{actionStatus}
				oncopyurl={copyPermanentUrl}
				onshare={shareCompletedCity}
				onpng={downloadCityPng}
				onjson={downloadCityJson}
				oncopyreport={copyMunicipalReport}
				onchallenge={beginChallenge}
			/>

			{#if challengeError}
				<p class="challenge-error" role="alert">{challengeError}</p>
			{/if}
			<ChallengePanel
				kind={challengeKind}
				challenger={challengerResult}
				city={panelResult}
				onrematch={() => challengeKind && beginChallenge(challengeKind)}
			/>

			<AdvancedSettings
				{config}
				{revealSpeed}
				{showEntropy}
				{showEdges}
				{ambientMotion}
				disabled={playbackState === 'preparing' || playbackState === 'placing'}
				onconfig={updateTopologyConfig}
				onrevealspeed={(value) => (revealSpeed = value)}
				onentropy={(value) => (showEntropy = value)}
				onedges={(value) => (showEdges = value)}
				onambient={(value) => (ambientMotion = value)}
			/>

			<AccessibleCityReport {result} {selectedDescription} />
		</aside>
	</div>

	<footer class="fiction-notice">
		<strong>Fictional neighbourhood generated from local rules.</strong>
		<span
			>Not a map of a real place. The two scores describe this toy model, not urban quality.</span
		>
	</footer>

	<noscript>
		<section class="no-script-report" aria-labelledby="canonical-city-report-heading">
			<img
				class="no-script-poster"
				src={POSTER}
				alt="Illustrated poster for the fixed sweet-shop demonstration city"
				width="1200"
				height="800"
			/>
			<p class="eyebrow">Canonical no-JavaScript city report</p>
			<h3 id="canonical-city-report-heading">The published sweet-shop demonstration</h3>
			<p>
				This checked v{CANONICAL_CITY_REPORT.generatorVersion} survey uses seed
				<code>{CANONICAL_CITY_REPORT.seed}</code> on a 24 × 18 grid. A sweet shop is anchored at column
				13, row 10, facing north. Civic patience permits eight returns; density, landmarks, and anomaly
				appetite are balanced; minimum civic guarantees remain off.
			</p>
			<dl>
				<div>
					<dt>City and fingerprint</dt>
					<dd>
						{CANONICAL_CITY_REPORT.cityName} · <code>{CANONICAL_CITY_REPORT.fingerprint}</code>
					</dd>
				</div>
				<div>
					<dt>Transparent scores</dt>
					<dd>
						Function {CANONICAL_CITY_REPORT.functional}/100 · calamity
						{CANONICAL_CITY_REPORT.calamity}/100
					</dd>
				</div>
				<div>
					<dt>Walkable network</dt>
					<dd>
						{CANONICAL_CITY_REPORT.largestWalkableComponent} of
						{CANONICAL_CITY_REPORT.walkableCells} cells in the largest of
						{CANONICAL_CITY_REPORT.walkableComponents} components; all
						{CANONICAL_CITY_REPORT.borderExits} exits reached
					</dd>
				</div>
				<div>
					<dt>Frontage and services</dt>
					<dd>
						{CANONICAL_CITY_REPORT.accessible} of {CANONICAL_CITY_REPORT.occupied} occupations have access;
						{CANONICAL_CITY_REPORT.reachableServices} of
						{CANONICAL_CITY_REPORT.serviceCount} services reach the main network
					</dd>
				</div>
				<div>
					<dt>Drainage</dt>
					<dd>
						All {CANONICAL_CITY_REPORT.drainSegments} segments reach an outlet;
						{CANONICAL_CITY_REPORT.uphillDrains} are uphill, with none broken or trapped
					</dd>
				</div>
				<div>
					<dt>Recorded exceptions</dt>
					<dd>
						{CANONICAL_CITY_REPORT.exceptions.length} lane-through-bedroom findings, at
						{CANONICAL_CITY_REPORT.exceptions
							.map((item) => `column ${item.column}, row ${item.row}`)
							.join(' and ')}
					</dd>
				</div>
			</dl>
			<p>
				With scripting disabled the poster and this verified canonical result remain available. The
				cell inspector, exports, placement, animation, and shared-city recomputation run locally
				when JavaScript and Web Workers are available.
			</p>
		</section>
	</noscript>
</section>

<style>
	.city-laboratory {
		--city-oxide: #a65742;
		--city-green: #587966;
		--city-yellow: #d0a23a;
		position: relative;
		width: min(78rem, calc(100vw - 1.25rem));
		margin: 2.5rem 0;
		overflow: hidden;
		transform: translateX(-50%);
		border: 1px solid var(--rule);
		border-radius: 0.9rem;
		background: var(--paper);
		box-shadow: var(--shadow-overlay);
		color: var(--ink);
	}

	.laboratory-header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid var(--rule);
		background:
			linear-gradient(
				135deg,
				color-mix(in srgb, var(--city-oxide) 7%, transparent),
				transparent 46%
			),
			var(--paper-raised);
		padding: 1rem 1.1rem;
	}

	.laboratory-header p,
	.laboratory-header h2,
	.global-status p,
	.input-notice h3,
	.input-notice ul,
	.application-error p,
	.placement-instructions p,
	.ledger-heading p,
	.ledger-heading h3,
	.ledger-heading dl,
	.event-log,
	.event-log p,
	.ledger-empty,
	.fiction-notice *,
	.no-script-report :where(p, h3, dl),
	.challenge-error {
		margin: 0;
	}

	.laboratory-header p,
	.eyebrow {
		margin-bottom: 0.2rem;
		font-family: ui-monospace, monospace;
		font-size: 0.68rem;
		font-weight: 900;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--city-oxide);
	}

	.laboratory-header h2 {
		max-width: 44rem;
		font-size: clamp(1.2rem, 2.3vw, 1.8rem);
		line-height: 1.12;
		color: var(--ink);
	}

	.header-facts {
		display: flex;
		max-width: 23rem;
		flex-wrap: wrap;
		justify-content: end;
		gap: 0.35rem;
	}

	.header-facts span {
		border: 1px solid var(--rule);
		border-radius: 999px;
		background: var(--paper);
		padding: 0.28rem 0.48rem;
		font-family: ui-monospace, monospace;
		font-size: 0.61rem;
		font-weight: 800;
		color: var(--ink-muted);
	}

	.global-status {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid var(--rule);
		background: var(--paper-soft);
		padding: 0.55rem 0.8rem;
	}

	.global-status p {
		font-size: 0.72rem;
		line-height: 1.35;
		color: var(--ink);
	}

	.global-status span {
		flex: none;
		font-family: ui-monospace, monospace;
		font-size: 0.6rem;
		color: var(--ink-muted);
	}

	.input-notice,
	.application-error {
		border-bottom: 1px solid var(--rule);
		padding: 0.75rem 0.9rem;
	}

	.input-notice {
		background: color-mix(in srgb, var(--city-yellow) 12%, var(--paper));
	}

	.input-notice h3 {
		font-size: 0.76rem;
		color: var(--ink);
	}

	.input-notice ul {
		margin-top: 0.3rem;
		padding-left: 1.1rem;
		font-size: 0.68rem;
		line-height: 1.45;
		color: var(--ink-muted);
	}

	.application-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		background: color-mix(in srgb, var(--city-oxide) 13%, var(--paper));
		color: var(--ink);
	}

	.application-error strong {
		font-size: 0.8rem;
	}

	.application-error p {
		margin-top: 0.15rem;
		font-size: 0.7rem;
		line-height: 1.4;
	}

	.application-error button {
		min-height: 2.75rem;
		flex: none;
		border: 1px solid var(--city-oxide);
		border-radius: 0.45rem;
		background: var(--paper-raised);
		padding: 0.45rem 0.7rem;
		font: inherit;
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--city-oxide);
		cursor: pointer;
	}

	.workbench {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 22rem);
		align-items: start;
	}

	.map-column {
		min-width: 0;
		border-right: 1px solid var(--rule);
	}

	.map-stage {
		position: relative;
		isolation: isolate;
		min-height: clamp(24rem, 53vw, 43rem);
		overflow: hidden;
		background:
			linear-gradient(color-mix(in srgb, var(--rule) 32%, transparent) 1px, transparent 1px),
			linear-gradient(90deg, color-mix(in srgb, var(--rule) 32%, transparent) 1px, transparent 1px),
			var(--paper-soft);
		background-size: 2rem 2rem;
	}

	.static-poster {
		position: absolute;
		inset: 0;
		z-index: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 1;
		transition: opacity 220ms ease;
	}

	.static-poster.superseded {
		opacity: 0;
		pointer-events: none;
	}

	.map-stage :global(.city-canvas) {
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.computing-card {
		position: absolute;
		z-index: 3;
		top: 50%;
		left: 50%;
		display: grid;
		width: min(19rem, calc(100% - 2rem));
		justify-items: center;
		gap: 0.25rem;
		transform: translate(-50%, -50%);
		border: 1px solid var(--control-border);
		border-radius: 0.65rem;
		background: color-mix(in srgb, var(--paper-raised) 92%, transparent);
		padding: 0.85rem;
		box-shadow: var(--shadow-overlay);
		text-align: center;
		backdrop-filter: blur(4px);
	}

	.survey-mark {
		display: grid;
		width: 3rem;
		height: 3rem;
		place-items: center;
		border: 2px dashed var(--city-oxide);
		border-radius: 50%;
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		font-weight: 900;
		color: var(--city-oxide);
		transform: rotate(-4deg);
	}

	.computing-card strong {
		font-size: 0.84rem;
		color: var(--ink);
	}

	.computing-card small {
		font-size: 0.67rem;
		line-height: 1.4;
		color: var(--ink-muted);
	}

	.placement-instructions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-top: 1px solid var(--rule);
		background: color-mix(in srgb, var(--city-yellow) 8%, var(--paper-raised));
		padding: 0.65rem 0.85rem;
	}

	.placement-instructions p {
		font-size: 0.7rem;
		line-height: 1.4;
		color: var(--ink);
	}

	.placement-instructions span {
		max-width: 16rem;
		flex: none;
		font-size: 0.64rem;
		line-height: 1.35;
		text-align: right;
		color: var(--ink-muted);
	}

	.placement-instructions span.ready {
		font-weight: 800;
		color: var(--city-green);
	}

	kbd {
		border: 1px solid var(--control-border);
		border-bottom-width: 2px;
		border-radius: 0.25rem;
		background: var(--paper);
		padding: 0.08rem 0.28rem;
		font-family: ui-monospace, monospace;
		font-size: 0.66rem;
	}

	.decision-ledger {
		border-top: 1px solid var(--rule);
		background: var(--paper-raised);
		padding: 0.85rem;
	}

	.ledger-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}

	.ledger-heading p {
		font-family: ui-monospace, monospace;
		font-size: 0.64rem;
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--city-oxide);
	}

	.ledger-heading h3 {
		margin-top: 0.15rem;
		font-size: 0.9rem;
		color: var(--ink);
	}

	.ledger-heading dl {
		display: flex;
		gap: 0.8rem;
	}

	.ledger-heading dl div {
		text-align: right;
	}

	.ledger-heading dt {
		font-size: 0.57rem;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.ledger-heading dd {
		margin: 0.12rem 0 0;
		font-family: ui-monospace, monospace;
		font-size: 0.68rem;
		color: var(--ink);
	}

	.event-log {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.42rem;
		margin-top: 0.7rem;
		padding: 0;
		list-style: none;
	}

	.event-log li {
		display: grid;
		grid-template-columns: 5rem 1fr;
		gap: 0.45rem;
		border: 1px solid var(--rule);
		border-left: 3px solid var(--city-green);
		border-radius: 0.38rem;
		background: var(--paper);
		padding: 0.45rem;
	}

	.event-log li[data-kind='contradiction'],
	.event-log li[data-kind='backtrack'],
	.event-log li[data-kind='patch'] {
		border-left-color: var(--city-oxide);
	}

	.event-log span {
		font-family: ui-monospace, monospace;
		font-size: 0.58rem;
		font-weight: 900;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.event-log p,
	.ledger-empty {
		font-size: 0.64rem;
		line-height: 1.35;
		color: var(--ink);
	}

	.ledger-empty {
		margin-top: 0.7rem;
		color: var(--ink-muted);
	}

	.report-rail {
		display: grid;
		gap: 0.7rem;
		padding: 0.75rem;
	}

	.inspector-focus-region {
		outline: none;
	}

	.inspector-focus-region:focus-visible {
		box-shadow: 0 0 0 3px var(--focus);
	}

	.mobile-inspector-toggle {
		display: none;
	}

	.challenge-error {
		border: 1px solid var(--city-oxide);
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--city-oxide) 9%, var(--paper));
		padding: 0.65rem;
		font-size: 0.68rem;
		line-height: 1.4;
		color: var(--ink);
	}

	.fiction-notice {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-top: 1px solid var(--rule);
		background: var(--paper-soft);
		padding: 0.7rem 0.85rem;
	}

	.fiction-notice strong {
		font-size: 0.7rem;
		color: var(--ink);
	}

	.fiction-notice span {
		font-size: 0.65rem;
		text-align: right;
		color: var(--ink-muted);
	}

	.no-script-report {
		border-top: 4px double var(--control-border);
		background: var(--paper-raised);
		padding: 1rem;
	}

	.no-script-poster {
		display: block;
		width: 100%;
		height: auto;
		margin-bottom: 0.85rem;
		border: 1px solid var(--rule);
		border-radius: 0.55rem;
	}

	.no-script-report h3 {
		font-size: 1rem;
		color: var(--ink);
	}

	.no-script-report > p:not(.eyebrow) {
		margin-top: 0.55rem;
		font-size: 0.75rem;
		line-height: 1.55;
		color: var(--ink);
	}

	.no-script-report dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
		margin-top: 0.65rem;
	}

	.no-script-report dl div {
		border: 1px solid var(--rule);
		background: var(--paper);
		padding: 0.55rem;
	}

	.no-script-report dt {
		font-family: ui-monospace, monospace;
		font-size: 0.61rem;
		font-weight: 900;
		text-transform: uppercase;
		color: var(--city-oxide);
	}

	.no-script-report dd {
		margin: 0.18rem 0 0;
		font-size: 0.68rem;
		line-height: 1.35;
		color: var(--ink);
	}

	button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	@media (scripting: none) {
		.workbench {
			display: none;
		}
	}

	:global(html[data-theme='high-contrast']) .city-laboratory {
		--city-oxide: #ffff00;
		--city-green: #00ffff;
		--city-yellow: #ffff00;
		border-width: 2px;
	}

	@media (max-width: 960px) {
		.workbench {
			grid-template-columns: 1fr;
		}

		.map-column {
			border-right: 0;
			border-bottom: 1px solid var(--rule);
		}

		.report-rail {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.report-rail :global(.advanced-settings),
		.report-rail :global(.accessible-report),
		.report-rail :global(.challenge-panel),
		.report-rail .inspector-focus-region {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 700px) {
		.city-laboratory {
			width: calc(100vw - 0.75rem);
			margin-block: 1.75rem;
			border-radius: 0.65rem;
		}

		.laboratory-header {
			align-items: start;
			flex-direction: column;
			padding: 0.85rem;
		}

		.header-facts {
			justify-content: start;
		}

		.global-status {
			align-items: start;
			flex-direction: column;
			gap: 0.2rem;
		}

		.application-error,
		.placement-instructions,
		.fiction-notice {
			align-items: stretch;
			flex-direction: column;
		}

		.application-error button {
			width: 100%;
		}

		.placement-instructions span,
		.fiction-notice span {
			max-width: none;
			text-align: left;
		}

		.map-stage {
			min-height: clamp(23rem, 112vw, 34rem);
		}

		.ledger-heading {
			align-items: start;
			flex-direction: column;
		}

		.ledger-heading dl {
			width: 100%;
			justify-content: space-between;
		}

		.ledger-heading dl div {
			text-align: left;
		}

		.event-log,
		.report-rail,
		.no-script-report dl {
			grid-template-columns: 1fr;
		}

		.event-log li {
			grid-template-columns: 4.5rem 1fr;
		}

		.report-rail {
			padding: 0.65rem;
		}

		.inspector-focus-region {
			position: sticky;
			bottom: 0.5rem;
			z-index: 8;
			border: 1px solid var(--rule);
			background: var(--paper-raised);
			box-shadow: 0 -0.45rem 1.3rem color-mix(in srgb, var(--ink) 14%, transparent);
		}

		.mobile-inspector-toggle {
			display: flex;
			width: 100%;
			min-height: 2.75rem;
			align-items: center;
			justify-content: space-between;
			gap: 0.75rem;
			border: 0;
			border-bottom: 1px solid var(--rule);
			background: var(--paper-raised);
			padding: 0.55rem 0.7rem;
			color: var(--ink);
			font:
				800 0.7rem/1.2 ui-monospace,
				monospace;
			letter-spacing: 0.04em;
			text-transform: uppercase;
		}

		.inspector-focus-region[data-expanded='false'] .mobile-inspector-toggle {
			border-bottom: 0;
		}

		.inspector-focus-region[data-expanded='false'] .inspector-content {
			display: none;
		}

		.inspector-content :global(.inspector) {
			border: 0;
			border-radius: 0;
		}
	}

	@media (max-width: 390px) {
		.city-laboratory {
			width: 100vw;
			border-right: 0;
			border-left: 0;
			border-radius: 0;
		}

		.header-facts span {
			min-height: 2.75rem;
			display: inline-flex;
			align-items: center;
		}

		.map-stage {
			min-height: 25rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.static-poster {
			transition: none;
		}
	}

	:global(html[data-motion='still']) .static-poster {
		transition: none;
	}
</style>
