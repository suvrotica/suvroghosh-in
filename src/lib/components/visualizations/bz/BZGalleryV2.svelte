<script lang="ts">
	import { onMount, tick } from 'svelte';
	import BZDishStage, {
		type BZEngineKind,
		type BZStageFrame,
		type BZStagePerformanceSnapshot
	} from './BZDishStage.svelte';
	import {
		BZ_V2_HERO_SLOTS,
		bzV2HeroPreset,
		bzV2HeroStatusLabel,
		createBZV2SharedSessionSnapshot,
		type BZV2ReproducibleRunState,
		type BZV2SharedSessionSnapshot
	} from './v2-experience-model';
	import { BZ_V2_CALIBRATION_MANIFEST } from '$lib/visualizations/bz/calibration/manifest';
	import { buildBZShareUrl, decodeBZUrlState } from '$lib/visualizations/bz';
	import {
		canonicalBZJSONStringify,
		checkpointStateToBZFieldState,
		decodeBZCheckpointV1
	} from '$lib/visualizations/bz/checkpoints/codec';
	import {
		BZ_FERROIN_REFERENCE_PROFILE_V2,
		BZ_LUMINOUS_REFERENCE_PROFILE_V2,
		BZ_PHASE_REFERENCE_PROFILE_V2,
		BZ_SCIENTIFIC_REFERENCE_PROFILE_V2,
		type BZRenderProfileV2
	} from '$lib/visualizations/bz/v2-display';
	import type {
		BZFieldState,
		BZPalette,
		BZViewMode,
		ProbeReading
	} from '$lib/visualizations/bz/types';
	import {
		BZ_V2_SCHEMA_VERSION,
		type BZPresetV2,
		type BZV2ExperimentRecord,
		type BZV2HeroId
	} from '$lib/visualizations/bz/v2-types';

	type Speed = 'observe' | 'normal' | 'fast';
	type DisplayStyle = 'luminous' | 'ferroin' | 'phase' | 'raw-u';
	type Motion = 'still' | 'gentle' | 'alive';
	type SharedRestore = {
		readonly heroId: BZV2HeroId;
		readonly origin: 'checkpoint' | 'genesis';
		readonly step: number;
	};
	type Point = readonly [number, number];
	type GalleryProbeSample = {
		readonly step: number;
		readonly time: number;
		readonly u: number;
		readonly v: number;
	};
	type Props = {
		onopenlaboratory?: (heroId: BZV2HeroId) => void;
		onselectionchange?: (heroId: BZV2HeroId) => void;
		onsessionchange?: (session: Readonly<BZV2SharedSessionSnapshot>) => void;
	};

	const SPEEDS: Readonly<Record<Speed, { label: string; work: number }>> = Object.freeze({
		observe: { label: 'Observe', work: 240 },
		normal: { label: 'Normal', work: 720 },
		fast: { label: 'Fast', work: 1_500 }
	});
	const DISPLAY_STYLES: readonly { id: DisplayStyle; label: string }[] = Object.freeze([
		{ id: 'luminous', label: 'Luminous phase' },
		{ id: 'ferroin', label: 'Ferroin-inspired' },
		{ id: 'phase', label: 'Phase spectrum' },
		{ id: 'raw-u', label: 'Raw u field' }
	]);

	let { onopenlaboratory, onselectionchange, onsessionchange }: Props = $props();
	let selectedId = $state<BZV2HeroId>('persistent-single-spiral');
	let running = $state(false);
	let runOrigin = $state<'checkpoint' | 'genesis'>('checkpoint');
	let checkpointState = $state.raw<BZFieldState | null>(null);
	let checkpointStep = $state(0);
	let stageGeneration = $state(0);
	let loadSequence = 0;
	let busy = $state(false);
	let failure = $state(false);
	let speed = $state<Speed>('normal');
	let displayStyle = $state<DisplayStyle>('luminous');
	let motion = $state<Motion>('gentle');
	let latestFrame = $state.raw<BZStageFrame | null>(null);
	let engine = $state<BZEngineKind>('cpu-f64');
	let status = $state('Choose a pattern to inspect its manifest status.');
	let stage: BZDishStage | undefined = $state();
	let ready = $state(false);
	let autoplayWhenReady = false;
	let resumeAfterMotion = false;
	let gallery: HTMLElement | undefined = $state();
	let latestPerformanceSnapshot = $derived.by(() => {
		// latestFrame is the bounded 10 Hz invalidation source; the counters themselves
		// stay ordinary numbers so animation never drives Svelte DOM work at frame rate.
		void latestFrame?.step;
		return stage?.performanceSnapshot() ?? null;
	});
	let isFullscreen = $state(false);
	let fullscreenAvailable = $state(false);
	let pendingRestore = $state.raw<SharedRestore | null>(null);
	let selectedProbe = $state<Point>([0.5, 0.5]);
	let probeVisible = $state(false);
	let probeTrace = $state<GalleryProbeSample[]>([]);

	let activeSlot = $derived(BZ_V2_HERO_SLOTS.find((slot) => slot.id === selectedId)!);
	let activePreset = $derived(bzV2HeroPreset(BZ_V2_CALIBRATION_MANIFEST, selectedId));
	let activeAsset = $derived(
		BZ_V2_CALIBRATION_MANIFEST.assets.find(
			(asset) => asset.id === `bz-v2-${selectedId}-checkpoint-poster`
		) ?? null
	);
	const heroPosterAsset = (id: BZV2HeroId) =>
		BZ_V2_CALIBRATION_MANIFEST.assets.find(
			(asset) => asset.id === `bz-v2-${id}-checkpoint-poster`
		) ?? null;
	let activeProfile = $derived(
		activePreset
			? (BZ_V2_CALIBRATION_MANIFEST.displayProfiles.find(
					(profile) => profile.id === activePreset?.displayProfileId
				) ?? null)
			: null
	);
	let scientificProfile = $derived(
		BZ_V2_CALIBRATION_MANIFEST.displayProfiles.find(
			(profile) => profile.id === 'oregonator-scientific-publication-v2'
		) ?? BZ_SCIENTIFIC_REFERENCE_PROFILE_V2
	);
	let stageDisplay = $derived.by((): { view: BZViewMode; palette: BZPalette } => {
		if (displayStyle === 'phase') return { view: 'dish', palette: 'phase-spectrum' };
		if (displayStyle === 'raw-u') return { view: 'u', palette: 'scientific' };
		return { view: 'dish', palette: 'ferroin' };
	});
	let stageProfile = $derived.by((): Readonly<BZRenderProfileV2> => {
		const base =
			displayStyle === 'ferroin'
				? BZ_FERROIN_REFERENCE_PROFILE_V2
				: displayStyle === 'phase'
					? BZ_PHASE_REFERENCE_PROFILE_V2
					: displayStyle === 'raw-u'
						? scientificProfile
						: (activeProfile ?? BZ_LUMINOUS_REFERENCE_PROFILE_V2);
		const bloomScale = motion === 'still' ? 0 : motion === 'gentle' ? 0.55 : 1;
		return bloomScale === 1 || base.bloom === 0
			? base
			: { ...base, bloom: base.bloom * bloomScale };
	});
	let workPerSecond = $derived(SPEEDS[speed].work * (motion === 'gentle' ? 0.55 : 1));

	function publicAssetPath(path: string): string {
		const normalized = path.replaceAll('\\', '/').replace(/^static\//u, '');
		return normalized.startsWith('/') ? normalized : `/${normalized}`;
	}

	function sameDocument(left: unknown, right: unknown): boolean {
		return canonicalBZJSONStringify(left) === canonicalBZJSONStringify(right);
	}

	function clearProbeTrace() {
		selectedProbe = [0.5, 0.5];
		probeVisible = false;
		probeTrace = [];
	}

	function appendProbeSample(reading: Readonly<ProbeReading> | null, step: number, time: number) {
		if (!probeVisible || !reading?.active || reading.u === null || reading.v === null) return;
		if (probeTrace.at(-1)?.step === step) return;
		probeTrace = [...probeTrace, { step, time, u: reading.u, v: reading.v }].slice(-48);
	}

	function handleProbe(reading: Readonly<ProbeReading>, point: Point) {
		selectedProbe = point;
		probeVisible = true;
		probeTrace = [];
		appendProbeSample(
			reading,
			stage?.stepIndex() ?? latestFrame?.step ?? 0,
			latestFrame?.modelTime ?? 0
		);
	}

	function probePolyline(field: 'u' | 'v'): string {
		if (probeTrace.length === 0) return '';
		const values = probeTrace.map((sample) => sample[field]);
		const minimum = Math.min(...values);
		const maximum = Math.max(...values);
		const span = Math.max(1e-9, maximum - minimum);
		return values
			.map((value, index) => {
				const x = values.length === 1 ? 56 : (index / (values.length - 1)) * 112;
				const y = 26 - ((value - minimum) / span) * 22;
				return `${x.toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	}

	function sharedHeroId(value: string): BZV2HeroId | null {
		return BZ_V2_HERO_SLOTS.some((slot) => slot.id === value) ? (value as BZV2HeroId) : null;
	}

	function prepareSharedUrlRestore(): BZV2HeroId | null {
		const params = new URLSearchParams(window.location.search);
		if (!params.has('bz_v')) return null;
		const decoded = decodeBZUrlState(params);
		const heroId = sharedHeroId(decoded.state.presetId);
		if (!heroId) return null;
		const preset = bzV2HeroPreset(BZ_V2_CALIBRATION_MANIFEST, heroId);
		if (!preset) return null;
		if (
			decoded.interventionsOmitted ||
			!sameDocument(decoded.state.setup, preset.setup) ||
			!sameDocument(decoded.state.interventions, preset.initialInterventions)
		) {
			status =
				'Shared URL contains a modified or incomplete experiment. Opening Laboratory keeps its exact setup without applying the validated hero label.';
			queueMicrotask(() => onopenlaboratory?.(heroId));
			return heroId;
		}
		const requestedOrigin = params.get('bz_origin');
		const checkpointStep = preset.optionalCheckpoint?.modelStep ?? Number.POSITIVE_INFINITY;
		const origin =
			requestedOrigin === 'genesis' ||
			(requestedOrigin !== 'checkpoint' && decoded.state.step < checkpointStep)
				? 'genesis'
				: 'checkpoint';
		pendingRestore = { heroId, origin, step: decoded.state.step };
		const profileId = params.get('bz_profile');
		const profile = BZ_V2_CALIBRATION_MANIFEST.displayProfiles.find(
			(candidate) => candidate.id === profileId
		);
		displayStyle =
			decoded.state.display.view === 'u'
				? 'raw-u'
				: profile?.style === 'phase-spectrum'
					? 'phase'
					: profile?.style === 'ferroin-proxy'
						? 'ferroin'
						: 'luminous';
		return heroId;
	}

	function selectHero(id: BZV2HeroId) {
		if (id === selectedId && (ready || busy || checkpointState !== null)) return;
		if (pendingRestore && pendingRestore.heroId !== id) pendingRestore = null;
		selectedId = id;
		onselectionchange?.(id);
		running = false;
		ready = false;
		autoplayWhenReady = false;
		resumeAfterMotion = false;
		runOrigin = 'checkpoint';
		checkpointState = null;
		checkpointStep = 0;
		latestFrame = null;
		clearProbeTrace();
		failure = false;
		const preset = bzV2HeroPreset(BZ_V2_CALIBRATION_MANIFEST, id);
		status = preset
			? `${preset.title}: ${preset.validationSummary.headline}`
			: `${BZ_V2_HERO_SLOTS.find((slot) => slot.id === id)?.title} has no promoted V2 manifest record yet.`;
		if (preset) {
			if (pendingRestore?.heroId === id && pendingRestore.origin === 'genesis') {
				void prepareGenesis();
			} else void loadMatureCheckpoint(preset);
		}
	}

	async function loadMatureCheckpoint(preset: Readonly<BZPresetV2>) {
		const descriptor = preset.optionalCheckpoint;
		const sequence = ++loadSequence;
		running = false;
		ready = false;
		autoplayWhenReady = false;
		resumeAfterMotion = false;
		runOrigin = 'checkpoint';
		checkpointState = null;
		checkpointStep = 0;
		busy = true;
		failure = false;
		if (!descriptor) {
			busy = false;
			failure = true;
			status = `${preset.title} has no verified mature checkpoint in the V2 manifest.`;
			return;
		}
		status = `Verifying ${preset.title} checkpoint and provenance.`;
		try {
			const response = await fetch(descriptor.path, { cache: 'force-cache' });
			if (!response.ok) throw new Error(`Checkpoint request returned HTTP ${response.status}.`);
			const decoded = await decodeBZCheckpointV1(new Uint8Array(await response.arrayBuffer()), {
				checkpointId: descriptor.id,
				sourcePresetId: preset.id,
				setup: preset.setup,
				interventions: preset.initialInterventions,
				engineVersion: BZ_V2_CALIBRATION_MANIFEST.engineVersion,
				validationRecordId: preset.calibrationRecordId,
				cpuFloat64StateSha256: descriptor.fieldSha256F64Reference ?? undefined,
				fileSha256: descriptor.sha256
			});
			if (sequence !== loadSequence || selectedId !== preset.id) return;
			checkpointState = checkpointStateToBZFieldState(decoded.state);
			checkpointStep = descriptor.modelStep;
			autoplayWhenReady = pendingRestore === null && motion !== 'still';
			resumeAfterMotion = motion === 'still';
			stageGeneration += 1;
			await tick();
			if (!ready) {
				status =
					motion === 'still'
						? `Verified mature checkpoint at t=${descriptor.modelTime.toFixed(3)}; paused for reduced motion.`
						: `Verified mature checkpoint at t=${descriptor.modelTime.toFixed(3)}; preparing its live numerical engine.`;
			}
		} catch (error) {
			if (sequence !== loadSequence) return;
			failure = true;
			status = `Checkpoint verification failed: ${error instanceof Error ? error.message : 'unknown error'}`;
		} finally {
			if (sequence === loadSequence) busy = false;
		}
	}

	async function replayGenesis() {
		if (!activePreset) return;
		pendingRestore = null;
		await prepareGenesis();
	}

	async function prepareGenesis() {
		loadSequence += 1;
		running = false;
		ready = false;
		busy = true;
		runOrigin = 'genesis';
		checkpointState = null;
		checkpointStep = 0;
		clearProbeTrace();
		autoplayWhenReady = pendingRestore === null && motion !== 'still';
		resumeAfterMotion = motion === 'still';
		stageGeneration += 1;
		status = 'Preparing the declared genesis state and intervention schedule.';
		await tick();
		busy = false;
		if (!ready) {
			status =
				motion === 'still'
					? 'Genesis input is prepared and will remain paused because Still motion is active.'
					: 'Genesis is prepared; its live numerical engine is starting.';
		}
	}

	async function returnToCheckpoint() {
		if (activePreset) await loadMatureCheckpoint(activePreset);
	}

	function toggleRunning() {
		if (!activePreset || !stage || !ready || busy || failure) return;
		autoplayWhenReady = false;
		resumeAfterMotion = false;
		running = !running;
		status = running
			? `${runOrigin === 'checkpoint' ? 'Mature checkpoint continuation' : 'Genesis replay'} is running with fixed numerical steps.`
			: 'Paused at an exact model-time barrier.';
	}

	function stepOnce() {
		if (!stage || !ready || running || busy || failure) return;
		autoplayWhenReady = false;
		resumeAfterMotion = false;
		stage?.manualStep();
		status = 'Advanced by one fixed numerical step.';
	}

	function handleFrame(frame: BZStageFrame) {
		latestFrame = frame;
		engine = frame.engine;
		appendProbeSample(frame.probe, frame.step, frame.modelTime);
	}

	function handleReady(nextEngine: BZEngineKind) {
		engine = nextEngine;
		ready = true;
		if (pendingRestore?.heroId === selectedId) {
			running = false;
			autoplayWhenReady = false;
			void finishSharedUrlRestore();
			return;
		}
		if (autoplayWhenReady && motion !== 'still' && !failure) {
			running = true;
			status = `${runOrigin === 'checkpoint' ? 'Live continuation from the mature checkpoint' : 'Genesis replay'} is running.`;
		} else if (motion === 'still') {
			running = false;
			status = `${runOrigin === 'checkpoint' ? 'Mature checkpoint' : 'Genesis'} is ready and paused for Still motion.`;
		}
		autoplayWhenReady = false;
	}

	async function finishSharedUrlRestore() {
		const restore = pendingRestore;
		if (!restore || !stage || restore.heroId !== selectedId) return;
		try {
			const residentStep = stage.stepIndex();
			if (restore.step < residentStep) {
				throw new RangeError(
					`Shared ${restore.origin} step ${restore.step} precedes resident step ${residentStep}.`
				);
			}
			busy = true;
			status = `Reconstructing the shared run at exact step ${restore.step.toLocaleString()}.`;
			await stage.advanceToStep(restore.step);
			pendingRestore = null;
			status = `Shared ${restore.origin} run restored at exact step ${restore.step.toLocaleString()} with its declared intervention schedule; paused.`;
		} catch (error) {
			pendingRestore = null;
			failure = true;
			status = `Shared run could not be reconstructed: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			busy = false;
		}
	}

	function handleStatus(message: string, nextEngine: BZEngineKind, failed: boolean) {
		engine = nextEngine;
		failure = failed;
		if (failed) {
			running = false;
			ready = false;
			autoplayWhenReady = false;
			resumeAfterMotion = false;
			status = message;
		}
	}

	async function toggleFullscreen() {
		if (!gallery || !fullscreenAvailable) return;
		if (document.fullscreenElement === gallery) await document.exitFullscreen();
		else await gallery.requestFullscreen();
	}

	function downloadBlob(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	async function copyShareUrl() {
		const run = reproducibleRunState();
		if (!run) return;
		try {
			const url = new URL(
				buildBZShareUrl(window.location.href, {
					setup: run.setup,
					presetId: run.presetId,
					step: run.step,
					interventions: run.interventions,
					activeTerms: { reaction: true, diffusion: true },
					display: { view: run.display.view, palette: run.display.palette }
				})
			);
			url.searchParams.set('bz_origin', run.runOrigin);
			url.searchParams.set('bz_profile', run.display.profileId);
			url.searchParams.delete('bz_v2_parity');
			await navigator.clipboard.writeText(url.toString());
			status =
				'Copied an exact setup URL with hero, origin, model step and complete intervention schedule.';
		} catch (error) {
			status = `The setup URL could not be copied: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	function exportExperimentJson() {
		const run = reproducibleRunState();
		if (!run || !activePreset) return;
		const appearanceStatus = BZ_V2_CALIBRATION_MANIFEST.displayProfiles.some(
			(profile) => profile.id === run.display.profileId
		)
			? 'manifest-profile'
			: 'custom-appearance';
		const record = {
			schemaVersion: BZ_V2_SCHEMA_VERSION,
			kind: 'bz-v2-experiment-record',
			engineVersion: BZ_V2_CALIBRATION_MANIFEST.engineVersion,
			displayVersion: BZ_V2_CALIBRATION_MANIFEST.displayVersion,
			title: `${run.title} — BZ Laboratory V2`,
			exportedAt: new Date().toISOString(),
			runOrigin: run.runOrigin,
			modelTime: run.step * run.setup.timestep,
			presetId: run.presetId,
			calibrationRecordId: run.calibrationRecordId,
			validationStatus: activePreset.validationStatus,
			appearanceStatus,
			setup: run.setup,
			checkpointId: run.checkpointId,
			step: run.step,
			interventions: run.interventions,
			activeTerms: { reaction: true, diffusion: true },
			display: {
				view: run.display.view,
				palette: run.display.palette,
				profileId: run.display.profileId
			}
		} satisfies BZV2ExperimentRecord & {
			readonly kind: 'bz-v2-experiment-record';
			readonly engineVersion: string;
			readonly displayVersion: string;
			readonly title: string;
			readonly exportedAt: string;
			readonly runOrigin: 'checkpoint' | 'genesis';
			readonly modelTime: number;
		};
		const serialized = `${JSON.stringify(JSON.parse(canonicalBZJSONStringify(record)), null, 2)}\n`;
		downloadBlob(
			new Blob([serialized], { type: 'application/json' }),
			`bz-v2-${run.presetId}-step-${run.step}.json`
		);
		status =
			'Exported structured V2 experiment JSON with calibration, checkpoint, display profile and complete intervention schedule.';
	}

	async function exportVisiblePng() {
		if (!stage || !ready) return;
		const blob = await stage.visiblePngBlob();
		if (!blob) {
			status = 'The visible display pass could not be encoded as PNG.';
			return;
		}
		downloadBlob(blob, `bz-v2-${selectedId}-${displayStyle}-step-${stage.stepIndex()}.png`);
		status =
			'Exported the exact visible display pass as PNG; the numerical field was not read back.';
	}

	function resolvedMotion(media: MediaQueryList): Motion {
		if (media.matches) return 'still';
		const declared = document.documentElement.dataset.motion;
		return declared === 'still' || declared === 'gentle' || declared === 'alive'
			? declared
			: 'gentle';
	}

	onMount(() => {
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		const syncMotion = () => {
			const previous = motion;
			const next = resolvedMotion(media);
			if (next === previous) return;
			motion = next;
			if (next === 'still') {
				resumeAfterMotion = running || autoplayWhenReady;
				autoplayWhenReady = false;
				running = false;
				if (stage) status = 'Still motion is active; the field remains available to Step or Play.';
			} else if (previous === 'still' && resumeAfterMotion) {
				resumeAfterMotion = false;
				if (ready && !failure) {
					running = true;
					status = `${next === 'alive' ? 'Alive' : 'Gentle'} motion resumed the existing numerical state.`;
				} else {
					autoplayWhenReady = true;
				}
			} else if (running) {
				status = `${next === 'alive' ? 'Alive' : 'Gentle'} motion is active; the same numerical state continues.`;
			}
		};
		const observer = new MutationObserver(syncMotion);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		const fullscreenHandler = () => (isFullscreen = document.fullscreenElement === gallery);
		fullscreenAvailable = Boolean(document.fullscreenEnabled);
		syncMotion();
		media.addEventListener('change', syncMotion);
		window.addEventListener('site-motion-change', syncMotion);
		document.addEventListener('fullscreenchange', fullscreenHandler);
		selectHero(prepareSharedUrlRestore() ?? selectedId);
		return () => {
			observer.disconnect();
			media.removeEventListener('change', syncMotion);
			window.removeEventListener('site-motion-change', syncMotion);
			document.removeEventListener('fullscreenchange', fullscreenHandler);
		};
	});

	export function sessionSnapshot(): BZV2SharedSessionSnapshot {
		return createBZV2SharedSessionSnapshot({
			heroId: selectedId,
			preset: activePreset,
			runOrigin,
			running,
			ready,
			busy,
			failure,
			latestFrame
		});
	}

	/** Complete bounded replay metadata for Copy URL / JSON actions; this performs no field readback. */
	export function reproducibleRunState(): BZV2ReproducibleRunState | null {
		if (!activePreset) return null;
		return {
			title: activePreset.title,
			presetId: selectedId,
			calibrationRecordId: activePreset.calibrationRecordId,
			checkpointId:
				runOrigin === 'checkpoint' ? (activePreset.optionalCheckpoint?.id ?? null) : null,
			runOrigin,
			setup: latestFrame?.setup ?? activePreset.setup,
			step: latestFrame?.step ?? (runOrigin === 'checkpoint' ? checkpointStep : 0),
			interventions: stage?.interventions() ?? activePreset.initialInterventions,
			display: {
				view: stageDisplay.view,
				palette: stageDisplay.palette,
				profileId: stageProfile.id
			}
		};
	}

	/** Explicit export-only full snapshot. Ordinary Gallery/Proof updates never call this method. */
	export function explicitFieldSnapshotForExport(): BZFieldState | null {
		return stage?.snapshot() ?? null;
	}

	/** Explicit bounded performance sample; it never reads the numerical field. */
	export function performanceSnapshot(): BZStagePerformanceSnapshot | null {
		return stage?.performanceSnapshot() ?? null;
	}

	$effect(() => {
		onsessionchange?.(sessionSnapshot());
	});
</script>

<section
	class="gallery"
	class:is-fullscreen={isFullscreen}
	bind:this={gallery}
	data-testid="bz-v2-gallery"
	data-motion={motion}
	aria-labelledby="bz-v2-gallery-title"
>
	{#if latestPerformanceSnapshot}
		<output data-testid="bz-v2-performance-snapshot" hidden
			>{JSON.stringify(latestPerformanceSnapshot)}</output
		>
	{/if}
	<header class="gallery-heading">
		<div>
			<p class="eyebrow">Gallery · calibrated states only</p>
			<h3 id="bz-v2-gallery-title">A dish first. Instruments when you ask.</h3>
		</div>
		<p>
			Mature frames come only from the versioned manifest. Genesis replay remains a separate,
			explicit action.
		</p>
	</header>

	<div class="gallery-layout">
		<div class="dish-column">
			<div class="dish-host" class:live={ready}>
				{#if activePreset && (runOrigin === 'genesis' || checkpointState)}
					{#key `${activePreset.id}:${runOrigin}:${stageGeneration}`}
						<BZDishStage
							bind:this={stage}
							setup={activePreset.setup}
							initialState={runOrigin === 'checkpoint' ? checkpointState : null}
							initialStep={runOrigin === 'checkpoint' ? checkpointStep : 0}
							initialInterventions={activePreset.initialInterventions}
							{running}
							{workPerSecond}
							view={stageDisplay.view}
							palette={stageDisplay.palette}
							displayProfile={stageProfile}
							poster={activeAsset ? publicAssetPath(activeAsset.path) : undefined}
							tool="probe"
							selected={selectedProbe}
							description={`${activePreset.title} ${runOrigin === 'checkpoint' ? 'verified mature checkpoint continuation' : 'genesis replay'}. Arrow keys move the probe; Space toggles playback.`}
							onframe={handleFrame}
							onprobe={handleProbe}
							onselect={(point) => (selectedProbe = point)}
							onstatus={handleStatus}
							onready={handleReady}
							oncommand={(command) => {
								if (command === 'toggle-running') toggleRunning();
								else if (command === 'step') stepOnce();
								else if (command === 'reset') {
									if (runOrigin === 'checkpoint') void returnToCheckpoint();
									else void replayGenesis();
								}
							}}
						/>
					{/key}
				{:else if activeAsset && activePreset?.validationStatus === 'validated'}
					<img
						src={publicAssetPath(activeAsset.path)}
						alt={`${activePreset.title}, generated from its validated V2 solver state using display profile ${activeAsset.displayProfileId}.`}
					/>
					<div class="dish-rim" aria-hidden="true"></div>
				{:else}
					<div
						class="empty-dish"
						role="img"
						aria-label={`${activeSlot.title} has no validated V2 preview state in the current manifest.`}
					>
						<span>Validated field pending</span>
					</div>
				{/if}
				<div class="dish-status" aria-hidden="true">
					<span>{runOrigin === 'genesis' ? 'Genesis replay' : 'Mature checkpoint'}</span>
					<span>{activePreset?.setup.gridSize ?? '—'}²</span>
				</div>
				{#if probeVisible && probeTrace.at(-1)}
					<div class="probe-trace" data-testid="bz-v2-gallery-probe">
						<div>
							<span
								>Local trace · {Math.round(selectedProbe[0] * 100)}%, {Math.round(
									selectedProbe[1] * 100
								)}%</span
							>
							<button type="button" aria-label="Hide local trace" onclick={() => clearProbeTrace()}
								>×</button
							>
						</div>
						<svg viewBox="0 0 112 30" role="img" aria-label="Recent local u and v samples">
							<polyline class="u-line" points={probePolyline('u')}></polyline>
							<polyline class="v-line" points={probePolyline('v')}></polyline>
						</svg>
						<small>
							u {probeTrace.at(-1)?.u.toFixed(4)} · v {probeTrace.at(-1)?.v.toFixed(4)} · t
							{probeTrace.at(-1)?.time.toFixed(3)}
						</small>
					</div>
				{/if}
			</div>

			<div class="compact-status">
				<span class="status-dot" data-failure={failure}></span>
				<p role="status" aria-atomic="true">{status}</p>
				<dl aria-label="Current numerical frame">
					<div>
						<dt>Step</dt>
						<dd>{latestFrame?.step.toLocaleString() ?? '—'}</dd>
					</div>
					<div>
						<dt>Model t</dt>
						<dd>{latestFrame?.modelTime.toFixed(3) ?? '—'}</dd>
					</div>
					<div>
						<dt>Engine</dt>
						<dd>{stage ? engine : busy ? 'verifying' : 'asset'}</dd>
					</div>
				</dl>
			</div>
		</div>

		<aside class="gallery-controls" aria-label="Gallery controls">
			<div class="selected-copy">
				<p class="eyebrow">Selected pattern</p>
				<h4>{activeSlot.title}</h4>
				<p>{activeSlot.criterion}</p>
				<span class="validation-badge" data-status={activePreset?.validationStatus ?? 'missing'}>
					{bzV2HeroStatusLabel(activePreset)}
				</span>
			</div>

			<div class="transport" aria-label="Simulation transport">
				<button
					type="button"
					class="primary"
					onclick={toggleRunning}
					disabled={!ready || !activePreset || busy || failure}
				>
					{running ? 'Pause' : 'Play'}
				</button>
				<button type="button" onclick={stepOnce} disabled={!ready || running || busy || failure}
					>Step</button
				>
				<button type="button" onclick={replayGenesis} disabled={!activePreset || busy}>
					{busy ? 'Preparing…' : 'Replay genesis'}
				</button>
				{#if runOrigin === 'genesis'}
					<button type="button" onclick={returnToCheckpoint} disabled={!activePreset || busy}>
						Return to mature checkpoint
					</button>
				{/if}
			</div>

			<div class="select-grid">
				<label>
					<span>Speed</span>
					<select bind:value={speed} disabled={!ready}>
						{#each Object.entries(SPEEDS) as [id, option] (id)}
							<option value={id}>{option.label}</option>
						{/each}
					</select>
				</label>
				<label>
					<span>Display style</span>
					<select bind:value={displayStyle} disabled={!ready}>
						{#each DISPLAY_STYLES as option (option.id)}
							<option value={option.id}>{option.label}</option>
						{/each}
					</select>
				</label>
			</div>

			<div class="secondary-actions">
				<button type="button" onclick={() => onopenlaboratory?.(selectedId)}>Open laboratory</button
				>
				{#if fullscreenAvailable}
					<button type="button" onclick={toggleFullscreen}>
						{isFullscreen ? 'Exit full screen' : 'Full screen'}
					</button>
				{/if}
			</div>

			<details class="share-actions">
				<summary>Share or export this run</summary>
				<div>
					<button type="button" onclick={copyShareUrl} disabled={!ready || busy || failure}
						>Copy setup URL</button
					>
					<button type="button" onclick={exportExperimentJson} disabled={!ready || busy || failure}
						>Experiment JSON</button
					>
					<button type="button" onclick={exportVisiblePng} disabled={!ready || busy || failure}
						>Visible PNG</button
					>
				</div>
				<small>
					URL and JSON retain the declared source schedule. PNG captures the current display pass;
					it is not a numerical checkpoint.
				</small>
			</details>

			<p class="display-disclosure">
				{activeProfile?.disclosure ??
					'No calibrated display profile is attached to this hero slot in the current manifest.'}
			</p>
		</aside>
	</div>

	<div class="hero-selector" aria-label="Choose one of three V2 hero patterns">
		{#each BZ_V2_HERO_SLOTS as slot, index (slot.id)}
			{@const preset = bzV2HeroPreset(BZ_V2_CALIBRATION_MANIFEST, slot.id)}
			{@const preview = heroPosterAsset(slot.id)}
			<button
				type="button"
				class="hero-card"
				class:active={selectedId === slot.id}
				aria-pressed={selectedId === slot.id}
				onclick={() => selectHero(slot.id)}
			>
				{#if preview}
					<img class="card-preview" src={publicAssetPath(preview.path)} alt="" aria-hidden="true" />
				{/if}
				<span class="number">0{index + 1}</span>
				<span class="card-copy"><b>{slot.title}</b><small>{slot.criterion}</small></span>
				<span class="card-status" data-status={preset?.validationStatus ?? 'missing'}>
					{bzV2HeroStatusLabel(preset)}
				</span>
			</button>
		{/each}
	</div>
</section>

<style>
	.gallery {
		min-width: 0;
		padding: clamp(1rem, 3vw, 2rem);
		background: radial-gradient(circle at 26% 28%, rgb(112 21 54 / 0.17), transparent 34%), #11181b;
		color: #edf0e8;
	}
	.gallery.is-fullscreen {
		width: 100vw;
		height: 100vh;
		overflow: auto;
	}
	.gallery-heading {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}
	.gallery-heading h3,
	.selected-copy h4 {
		margin: 0;
		font-family: var(--font-serif, 'Source Serif 4', serif);
		letter-spacing: -0.025em;
	}
	.gallery-heading h3 {
		font-size: clamp(1.35rem, 3vw, 2.15rem);
	}
	.gallery-heading > p {
		max-width: 49ch;
		margin: 0;
		color: rgb(237 240 232 / 0.63);
		font-size: 0.76rem;
		line-height: 1.5;
	}
	.eyebrow {
		margin: 0 0 0.28rem;
		color: #e1a78b;
		font:
			700 0.63rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.gallery-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 23rem);
		gap: clamp(1rem, 3vw, 2rem);
		align-items: center;
	}
	.dish-column {
		min-width: 0;
	}
	.dish-host {
		position: relative;
		width: min(100%, 47rem);
		aspect-ratio: 1;
		margin-inline: auto;
	}
	.dish-host > img,
	.empty-dish {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: 50%;
	}
	.dish-host > img {
		object-fit: cover;
		background: #070a0d;
		box-shadow: 0 2rem 5rem rgb(0 0 0 / 0.42);
	}
	.dish-host.live :global(.stage-shell) {
		width: 100%;
	}
	.empty-dish {
		display: grid;
		place-items: center;
		border: clamp(6px, 1.1vw, 11px) solid rgb(223 229 222 / 0.16);
		background:
			radial-gradient(circle at 38% 33%, rgb(109 19 49 / 0.24), transparent 28%),
			radial-gradient(circle, #141018 0%, #0b0d12 63%, #05070a 100%);
		box-shadow:
			0 2rem 5rem rgb(0 0 0 / 0.42),
			inset 0 0 3rem rgb(0 0 0 / 0.68),
			inset 0 0 0 1px rgb(255 255 255 / 0.18);
	}
	.empty-dish span {
		border: 1px solid rgb(255 255 255 / 0.15);
		border-radius: 999px;
		background: rgb(7 9 12 / 0.74);
		color: rgb(239 241 235 / 0.58);
		padding: 0.5rem 0.75rem;
		font:
			0.66rem/1 ui-monospace,
			monospace;
	}
	.dish-rim {
		position: absolute;
		inset: 0;
		pointer-events: none;
		border: clamp(6px, 1.1vw, 11px) solid rgb(223 229 222 / 0.16);
		border-radius: 50%;
		box-shadow:
			inset 0 0 0 1px rgb(255 255 255 / 0.22),
			inset 0 0 2.5rem rgb(0 0 0 / 0.42);
	}
	.dish-status {
		position: absolute;
		z-index: 8;
		inset: auto 9% 6%;
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		pointer-events: none;
	}
	.dish-status span {
		border: 1px solid rgb(255 255 255 / 0.13);
		border-radius: 999px;
		background: rgb(4 7 9 / 0.65);
		color: rgb(255 246 215 / 0.68);
		padding: 0.28rem 0.48rem;
		font:
			0.58rem/1 ui-monospace,
			monospace;
		backdrop-filter: blur(7px);
	}
	.probe-trace {
		position: absolute;
		z-index: 9;
		right: 8%;
		bottom: 13%;
		width: min(11rem, 42%);
		border: 1px solid rgb(255 255 255 / 0.16);
		border-radius: 0.65rem;
		background: rgb(5 8 12 / 0.82);
		box-shadow: 0 0.8rem 2rem rgb(0 0 0 / 0.28);
		color: rgb(245 240 225 / 0.82);
		padding: 0.42rem 0.48rem;
		backdrop-filter: blur(8px);
		font:
			0.54rem/1.25 ui-monospace,
			monospace;
	}
	.probe-trace > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
	}
	.probe-trace button {
		display: grid;
		place-items: center;
		width: 1.25rem;
		height: 1.25rem;
		border: 0;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.08);
		color: inherit;
		padding: 0;
		font-size: 0.9rem;
		line-height: 1;
	}
	.probe-trace svg {
		display: block;
		width: 100%;
		height: 1.9rem;
		margin-block: 0.25rem 0.18rem;
		overflow: visible;
	}
	.probe-trace polyline {
		fill: none;
		stroke-width: 1.4;
		vector-effect: non-scaling-stroke;
	}
	.probe-trace .u-line {
		stroke: #ffcf5a;
	}
	.probe-trace .v-line {
		stroke: #6fd9ec;
	}
	.probe-trace small {
		display: block;
		color: rgb(245 240 225 / 0.64);
		white-space: nowrap;
	}
	.compact-status {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.55rem;
		align-items: center;
		width: min(100%, 47rem);
		margin: 0.7rem auto 0;
		color: rgb(237 240 232 / 0.67);
		font:
			0.62rem/1.4 ui-monospace,
			monospace;
	}
	.compact-status p {
		min-width: 0;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.status-dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: #61b69d;
		box-shadow: 0 0 0 3px rgb(97 182 157 / 0.16);
	}
	.status-dot[data-failure='true'] {
		background: #e45468;
		box-shadow: 0 0 0 3px rgb(228 84 104 / 0.17);
	}
	.compact-status dl {
		display: flex;
		gap: 0.7rem;
		margin: 0;
	}
	.compact-status dl div {
		display: flex;
		gap: 0.28rem;
	}
	.compact-status dt {
		opacity: 0.52;
	}
	.compact-status dd {
		margin: 0;
	}
	.gallery-controls {
		display: grid;
		gap: 1rem;
		align-self: center;
		border: 1px solid rgb(255 255 255 / 0.11);
		border-radius: 1rem;
		background: rgb(5 9 12 / 0.58);
		padding: 1rem;
		backdrop-filter: blur(14px);
	}
	.selected-copy h4 {
		font-size: 1.48rem;
	}
	.selected-copy > p:not(.eyebrow) {
		margin: 0.45rem 0 0.7rem;
		color: rgb(237 240 232 / 0.62);
		font-size: 0.73rem;
		line-height: 1.5;
	}
	.validation-badge,
	.card-status {
		display: inline-flex;
		align-items: center;
		min-height: 1.55rem;
		border: 1px solid rgb(255 206 99 / 0.38);
		border-radius: 999px;
		color: #ffdf93;
		padding-inline: 0.5rem;
		font:
			700 0.57rem/1 ui-monospace,
			monospace;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.validation-badge[data-status='validated'],
	.card-status[data-status='validated'] {
		border-color: rgb(97 182 157 / 0.44);
		color: #9cd6c4;
	}
	.validation-badge[data-status='rejected'],
	.card-status[data-status='rejected'] {
		border-color: rgb(228 84 104 / 0.46);
		color: #ff9daf;
	}
	.transport,
	.secondary-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	button,
	select {
		min-height: 2.75rem;
		border: 1px solid rgb(255 255 255 / 0.18);
		border-radius: 0.58rem;
		background: #222b2c;
		color: #f5f2e9;
		font: inherit;
		font-size: 0.72rem;
	}
	button {
		padding: 0.55rem 0.72rem;
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		border-color: rgb(255 255 255 / 0.45);
		background: #2b3637;
	}
	button:disabled,
	select:disabled {
		cursor: default;
		opacity: 0.42;
	}
	button.primary {
		border-color: #e1a78b;
		background: #8e4b55;
		color: #fff8e8;
		font-weight: 800;
	}
	button:focus-visible,
	select:focus-visible {
		outline: 3px solid #ffce63;
		outline-offset: 2px;
	}
	.select-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.55rem;
	}
	label {
		display: grid;
		gap: 0.28rem;
		min-width: 0;
	}
	label span {
		color: rgb(237 240 232 / 0.55);
		font:
			700 0.58rem/1.2 ui-monospace,
			monospace;
		text-transform: uppercase;
	}
	select {
		width: 100%;
		min-width: 0;
		padding-inline: 0.45rem;
	}
	.secondary-actions button:first-child {
		flex: 1 1 9rem;
	}
	.share-actions {
		border: 1px solid rgb(255 255 255 / 0.1);
		border-radius: 0.62rem;
		background: rgb(255 255 255 / 0.025);
	}
	.share-actions summary {
		min-height: 2.6rem;
		cursor: pointer;
		padding: 0.72rem;
		font-size: 0.69rem;
		font-weight: 800;
	}
	.share-actions summary:focus-visible {
		outline: 3px solid #ffce63;
		outline-offset: 2px;
	}
	.share-actions > div {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.35rem;
		border-top: 1px solid rgb(255 255 255 / 0.08);
		padding: 0.55rem;
	}
	.share-actions button {
		min-height: 2.35rem;
		padding: 0.4rem;
		font-size: 0.62rem;
	}
	.share-actions small {
		display: block;
		padding: 0 0.65rem 0.65rem;
		color: rgb(237 240 232 / 0.45);
		font-size: 0.59rem;
		line-height: 1.45;
	}
	.display-disclosure {
		margin: 0;
		border-left: 2px solid rgb(38 127 147 / 0.65);
		color: rgb(237 240 232 / 0.5);
		padding-left: 0.7rem;
		font-size: 0.64rem;
		line-height: 1.45;
	}
	.hero-selector {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.65rem;
		margin-top: 1.4rem;
	}
	.hero-card {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.32rem 0.7rem;
		align-items: start;
		min-height: 6.3rem;
		overflow: hidden;
		padding: 0.8rem;
		text-align: left;
	}
	.card-preview {
		position: absolute;
		inset: 0 0 0 auto;
		width: 48%;
		height: 100%;
		object-fit: cover;
		opacity: 0.3;
		mask-image: linear-gradient(to right, transparent, #000 42%);
		pointer-events: none;
	}
	.hero-card > :not(.card-preview) {
		position: relative;
		z-index: 1;
	}
	.hero-card.active {
		border-color: rgb(225 167 139 / 0.72);
		background: linear-gradient(135deg, rgb(142 75 85 / 0.38), rgb(22 34 38 / 0.85));
	}
	.number {
		grid-row: span 2;
		color: rgb(225 167 139 / 0.72);
		font:
			700 0.66rem/1.2 ui-monospace,
			monospace;
	}
	.card-copy {
		display: grid;
		gap: 0.28rem;
		min-width: 0;
	}
	.card-copy b {
		font-size: 0.8rem;
	}
	.card-copy small {
		color: rgb(237 240 232 / 0.52);
		font-size: 0.63rem;
		line-height: 1.4;
	}
	.card-status {
		grid-column: 2;
		justify-self: start;
	}
	@media (max-width: 940px) {
		.gallery-layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.gallery-controls {
			grid-template-columns: minmax(0, 1.25fr) minmax(15rem, 1fr);
			align-items: end;
		}
		.display-disclosure {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 680px) {
		.gallery {
			padding: 0.85rem;
		}
		.gallery-heading {
			display: block;
		}
		.gallery-heading > p {
			margin-top: 0.55rem;
		}
		.gallery-controls {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
		}
		.display-disclosure {
			grid-column: auto;
		}
		.hero-selector {
			grid-template-columns: minmax(0, 1fr);
		}
		.hero-card {
			min-height: 5.4rem;
		}
		.compact-status {
			grid-template-columns: auto minmax(0, 1fr);
		}
		.compact-status dl {
			display: none;
		}
	}
	@media (max-width: 390px) {
		.select-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.transport button {
			flex: 1 1 auto;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.gallery,
		button {
			scroll-behavior: auto;
			transition: none;
		}
		.gallery-controls {
			backdrop-filter: none;
		}
	}
	:global(html[data-motion='still']) .gallery * {
		transition: none !important;
		animation: none !important;
	}
</style>
