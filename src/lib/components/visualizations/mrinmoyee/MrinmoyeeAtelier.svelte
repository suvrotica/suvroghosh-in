<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AtelierViewport from './AtelierViewport.svelte';
	import {
		CAMERA_VIEWS,
		DEFAULT_DESIGN,
		DEFAULT_LOCKS,
		MATERIALS,
		PRESETS,
		STAGES,
		normalizeDesign
	} from '$lib/visualizations/mrinmoyee/config';
	import {
		createVariation,
		designFromUrl,
		designToUrl,
		exportDesign,
		importDesign,
		readSavedDesigns,
		saveDesigns
	} from '$lib/visualizations/mrinmoyee/state';
	import { AtelierSound } from '$lib/visualizations/mrinmoyee/audio';
	import type {
		AtelierDesign,
		AtelierViewportHandle,
		CameraBookmark,
		CameraView,
		DesignGroup,
		DesignLocks,
		SavedDesign
	} from '$lib/visualizations/mrinmoyee/types';
	import './atelier.css';

	type NumericKey =
		| 'faceWidth'
		| 'eyeScale'
		| 'headTilt'
		| 'crownScale'
		| 'ornamentDensity'
		| 'lampIntensity'
		| 'lightWarmth'
		| 'lightAngle'
		| 'exposure'
		| 'atmosphere';
	type ChoiceKey = 'face' | 'pose' | 'sariPattern' | 'crown' | 'garland' | 'halo' | 'backdrop';
	type ColourKey = 'skinColor' | 'sariColor' | 'borderColor' | 'blouseColor';
	type AtelierPath = `/blog/visualizations/mrinmoyee-the-durga-atelier${string}`;
	const tabs = [
		{ id: 'inspiration', label: 'Inspiration', numeral: '01' },
		{ id: 'sculpt', label: 'Sculpt & dress', numeral: '02' },
		{ id: 'setting', label: 'Light & setting', numeral: '03' },
		{ id: 'collection', label: 'Your collection', numeral: '04' }
	];
	const regionNotes: Record<string, { title: string; text: string; camera: CameraBookmark }> = {
		face: {
			title: 'A still centre',
			text: 'Painted eyes, a third eye and a softly modelled face anchor the composition. Small changes to width and expression preserve the sculpted identity.',
			camera: 'face'
		},
		crown: {
			title: 'Light through ornament',
			text: 'Layered petal forms and repeated filigree create depth in the crown. The white treatment takes inspiration from the delicacy of shola ornament.',
			camera: 'crown'
		},
		dress: {
			title: 'The weight of cloth',
			text: 'The sari is a layered three-dimensional surface. Pleats, borders and repeated motifs belong to the dress, so changing the light preserves its design.',
			camera: 'three-quarter'
		},
		ornament: {
			title: 'Details held in place',
			text: 'Necklaces, bangles and decorative forms are attached to the sculpture. Density changes their arrangement without changing the pose.',
			camera: 'face'
		},
		lion: {
			title: 'A composed companion',
			text: 'The stylised lion balances the pedestal and the sweep of the arms. This is an original sculptural interpretation, rather than a reproduction of a historical idol.',
			camera: 'whole'
		},
		bell: {
			title: 'A little resonance',
			text: 'Touch a hanging bell to set it swinging. Enable sound to hear an original, softly synthesized bell tone.',
			camera: 'whole'
		}
	};
	let root: HTMLElement;
	let viewport: AtelierViewportHandle | undefined;
	let exportDialog: HTMLDialogElement;
	let design = $state<AtelierDesign>(normalizeDesign(DEFAULT_DESIGN));
	let history = $state<AtelierDesign[]>([normalizeDesign(DEFAULT_DESIGN)]);
	let historyIndex = $state(0);
	let locks = $state<DesignLocks>({ ...DEFAULT_LOCKS });
	let activeTab = $state('inspiration');
	let toolsOpen = $state(true);
	let presentation = $state(false);
	let autoRotate = $state(false);
	let reducedMotion = $state(false);
	let motion = $state(false);
	let posterMode = $state(false);
	let fullscreen = $state(false);
	let fullscreenSupported = $state(false);
	let quality = $state<'auto' | 'high' | 'low'>('auto');
	let status = $state<'loading' | 'ready' | 'fallback'>('loading');
	let message = $state('Preparing your atelier.');
	let saved = $state<SavedDesign[]>([]);
	let designName = $state('My Durga composition');
	let comparisonId = $state('');
	let comparing = $state(false);
	let variationSerial = 0;
	let selectedRegion = $state('');
	let shareLink = $state('');
	let soundEnabled = $state(false);
	let soundBusy = $state(false);
	let soundRequest = 0;
	let soundMode = $state<'bells' | 'dhak'>('bells');
	let volume = $state(0.16);
	let audio: AtelierSound | undefined;
	let importInput: HTMLInputElement;
	let exportFormat = $state<'portrait' | 'square' | 'landscape'>('portrait');
	let exportResolution = $state<'standard' | 'high'>('standard');
	let transparent = $state(false);
	let exportTitle = $state('');
	let signature = $state('');
	let exporting = $state(false);
	let mounted = false;
	let urlTimer: ReturnType<typeof setTimeout> | undefined;
	let focusBeforePresentation: HTMLElement | null = null;
	let currentPreset = $derived(PRESETS.find((preset) => preset.id === design.presetId));
	let comparison = $derived(saved.find((entry) => entry.id === comparisonId));
	let visibleDesign = $derived(
		comparing && comparison ? { ...comparison.design, camera: design.camera } : design
	);
	let note = $derived(regionNotes[selectedRegion]);

	function syncUrl() {
		if (!mounted) return;
		if (urlTimer) clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			const next = new URL(designToUrl(new URL(window.location.href), design));
			const path = `${next.pathname}${next.search}${next.hash}` as AtelierPath;
			replaceState(resolve(path), page.state);
		}, 250);
	}

	function checkpoint() {
		if (JSON.stringify(history[historyIndex]) === JSON.stringify(design)) return;
		history = [...history.slice(0, historyIndex + 1), normalizeDesign(design)].slice(-50);
		historyIndex = history.length - 1;
	}

	function apply(next: AtelierDesign, record = true) {
		design = normalizeDesign(next);
		comparing = false;
		if (record) checkpoint();
		syncUrl();
	}

	function patch(values: Partial<AtelierDesign>, record = true) {
		apply({ ...design, ...values, presetId: 'custom' }, record);
	}

	function undo(direction: -1 | 1) {
		if (direction === -1) checkpoint();
		const index = historyIndex + direction;
		if (index < 0 || index >= history.length) return;
		historyIndex = index;
		apply(history[index], false);
		message = direction < 0 ? 'Previous design restored.' : 'Next design restored.';
	}

	function choosePreset(id: string) {
		const preset = PRESETS.find((item) => item.id === id);
		if (!preset) return;
		apply(preset.design);
		selectedRegion = '';
		message = `${preset.name}. ${preset.description}`;
	}

	function cameraChanged(camera: CameraView) {
		design = { ...design, camera };
		syncUrl();
	}

	function bookmark(name: CameraBookmark) {
		apply({ ...design, camera: CAMERA_VIEWS[name] });
	}

	function inspect(region: string) {
		selectedRegion = region;
		if (regionNotes[region]) bookmark(regionNotes[region].camera);
	}

	function vary() {
		if (Object.values(locks).every(Boolean)) {
			message = 'All details are locked. Unlock a group to create a variation.';
			return;
		}
		apply(createVariation(design, locks, ++variationSerial));
		message = 'A new variation. Your locked details have been kept.';
	}

	function lock(group: DesignGroup) {
		locks = { ...locks, [group]: !locks[group] };
	}

	function download(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function filename() {
		return (
			designName
				.toLowerCase()
				.replace(/[^a-z0-9-]+/g, '-')
				.replace(/^-|-$/g, '')
				.slice(0, 50) || 'mrinmoyee'
		);
	}

	function save() {
		try {
			const entry: SavedDesign = {
				id: crypto.randomUUID(),
				name: designName.trim().slice(0, 64) || 'Untitled composition',
				savedAt: new Date().toISOString(),
				thumbnail: viewport?.thumbnail(),
				design: normalizeDesign(visibleDesign)
			};
			const records = [entry, ...saved].slice(0, 12);
			saveDesigns(localStorage, records);
			saved = records;
			comparisonId = entry.id;
			message = `“${entry.name}” saved on this device.`;
		} catch {
			message = 'This browser could not save the design. Download its JSON file to keep it.';
		}
	}

	function removeSaved(id: string) {
		try {
			const records = saved.filter((entry) => entry.id !== id);
			saveDesigns(localStorage, records);
			saved = records;
			if (comparisonId === id) {
				comparisonId = '';
				comparing = false;
			}
			message = 'Design removed from this device.';
		} catch {
			message = 'The collection could not be updated.';
		}
	}

	async function share() {
		shareLink = designToUrl(new URL(window.location.href), visibleDesign);
		try {
			await navigator.clipboard.writeText(shareLink);
			message = 'Design link copied. It includes the sculpture, setting and camera.';
		} catch {
			message = 'Select and copy the design link below.';
		}
	}

	async function readImport(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			if (file.size > 24 * 1024) throw new Error('Choose a design JSON file smaller than 24 KiB.');
			apply(importDesign(await file.text()));
			message = 'Imported design restored.';
		} catch (error) {
			message = error instanceof Error ? error.message : 'Unable to read this design.';
		}
		importInput.value = '';
	}

	async function exportImage() {
		if (!viewport || exporting) return;
		exporting = true;
		message = 'Preparing your artwork…';
		try {
			const scale = exportResolution === 'high' ? 2 : 1;
			const dimensions = { portrait: [1200, 1600], square: [1600, 1600], landscape: [1800, 1200] }[
				exportFormat
			];
			const blob = await viewport.exportImage({
				width: dimensions[0] * scale,
				height: dimensions[1] * scale,
				transparent,
				title: exportTitle,
				signature
			});
			download(blob, `${filename()}-${exportFormat}.png`);
			message = `${dimensions[0] * scale} × ${dimensions[1] * scale} artwork downloaded.`;
			exportDialog.close();
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: 'Artwork export failed. Please try a smaller size.';
		} finally {
			exporting = false;
		}
	}

	async function toggleSound() {
		if (soundBusy) return;
		soundBusy = true;
		const request = ++soundRequest;
		try {
			if (soundEnabled) {
				await audio?.stop();
				soundEnabled = false;
			} else {
				audio ??= new AtelierSound();
				audio.setVolume(volume);
				audio.setMode(soundMode);
				await audio.start();
				if (!mounted || request !== soundRequest || document.hidden) {
					soundEnabled = false;
					return;
				}
				soundEnabled = true;
			}
			message = soundEnabled
				? 'Sound enabled. Original synthesized tones at a quiet volume.'
				: 'Sound muted.';
		} catch {
			soundEnabled = false;
			message = 'Audio is unavailable in this browser.';
		} finally {
			soundBusy = false;
		}
	}

	async function present() {
		if (!presentation) focusBeforePresentation = document.activeElement as HTMLElement | null;
		presentation = !presentation;
		await tick();
		if (presentation) root.querySelector<HTMLButtonElement>('[data-presentation-return]')?.focus();
		if (!presentation) {
			autoRotate = false;
			focusBeforePresentation?.focus();
		}
	}

	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await root.requestFullscreen();
		} catch {
			message = 'Fullscreen is unavailable. Use presentation mode for an uncluttered view.';
		}
	}

	function handleKey(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (presentation) present();
			comparing = false;
			selectedRegion = '';
			return;
		}
		if ((event.target as HTMLElement).closest('input, select, textarea, button, summary, dialog'))
			return;
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			undo(event.shiftKey ? 1 : -1);
		}
	}

	function restoreLink(url: URL) {
		if (!url.hash.startsWith('#atelier=')) return;
		const next = designFromUrl(url);
		if (!next) {
			message = 'This design link is invalid. Your current design is safe.';
			return;
		}
		if (JSON.stringify(next) === JSON.stringify(normalizeDesign(design))) return;
		if (urlTimer) clearTimeout(urlTimer);
		design = next;
		history = [normalizeDesign(next)];
		historyIndex = 0;
		comparing = false;
		message = 'Shared composition restored.';
	}

	afterNavigate(() => {
		if (mounted) restoreLink(new URL(window.location.href));
	});

	onMount(() => {
		mounted = true;
		const url = new URL(window.location.href);
		posterMode = url.searchParams.get('atelier_poster') === '1';
		const imported = designFromUrl(url);
		if (imported) {
			design = imported;
			history = [normalizeDesign(imported)];
		} else if (url.hash.startsWith('#atelier='))
			message = 'This design link is invalid. Showing the atelier default.';
		try {
			saved = readSavedDesigns(localStorage);
			comparisonId = saved[0]?.id ?? '';
		} catch {
			/* JSON download remains available. */
		}
		const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = motionQuery.matches;
		const onMotion = () => {
			reducedMotion = motionQuery.matches;
			if (reducedMotion) {
				motion = false;
				autoRotate = false;
			}
		};
		motionQuery.addEventListener('change', onMotion);
		const onFullscreen = () => {
			fullscreen = document.fullscreenElement === root;
		};
		document.addEventListener('fullscreenchange', onFullscreen);
		fullscreenSupported = document.fullscreenEnabled;
		root.addEventListener('keydown', handleKey);
		const onHashChange = () => restoreLink(new URL(window.location.href));
		window.addEventListener('hashchange', onHashChange);
		const onVisibility = () => {
			if (document.hidden) {
				soundRequest++;
				void audio?.stop().catch(() => {});
				soundEnabled = false;
			}
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			mounted = false;
			if (urlTimer) clearTimeout(urlTimer);
			audio?.dispose();
			motionQuery.removeEventListener('change', onMotion);
			document.removeEventListener('fullscreenchange', onFullscreen);
			document.removeEventListener('visibilitychange', onVisibility);
			root.removeEventListener('keydown', handleKey);
			window.removeEventListener('hashchange', onHashChange);
		};
	});
</script>

{#snippet range(label: string, key: NumericKey, min: number, max: number, step: number)}
	<label class="m-range" for={`m-range-${key}`}>
		<span
			>{label}<output aria-hidden="true"
				>{key === 'headTilt' || key === 'lightAngle'
					? `${Math.round(design[key])}°`
					: `${Math.round(design[key] * 100)}%`}</output
			></span
		>
		<input
			id={`m-range-${key}`}
			aria-label={label}
			aria-valuetext={key === 'headTilt' || key === 'lightAngle'
				? `${Math.round(design[key])} degrees`
				: `${Math.round(design[key] * 100)} per cent`}
			type="range"
			{min}
			{max}
			{step}
			value={design[key]}
			oninput={(event) => patch({ [key]: Number(event.currentTarget.value) }, false)}
			onchange={checkpoint}
		/>
	</label>
{/snippet}

{#snippet choice(label: string, key: ChoiceKey, options: [string, string][])}
	<label class="m-field"
		><span>{label}</span><select
			aria-label={label}
			value={design[key]}
			onchange={(event) => patch({ [key]: event.currentTarget.value })}
		>
			{#each options as [value, title] (value)}<option {value}>{title}</option>{/each}
		</select></label
	>
{/snippet}

{#snippet colour(label: string, key: ColourKey)}
	<label class="m-colour"
		><input
			type="color"
			value={design[key]}
			oninput={(event) => patch({ [key]: event.currentTarget.value }, false)}
			onchange={checkpoint}
		/><span>{label}</span><small>{design[key]}</small></label
	>
{/snippet}

{#snippet lockButton(group: DesignGroup, label: string)}
	<button
		type="button"
		class:locked={locks[group]}
		class="m-lock"
		aria-pressed={locks[group]}
		onclick={() => lock(group)}>{locks[group] ? '●' : '○'} {label}</button
	>
{/snippet}

<section
	bind:this={root}
	class="mrinmoyee"
	class:m-presentation={presentation}
	class:m-poster={posterMode}
	class:m-fullscreen={fullscreen}
	aria-label="Mrinmoyee — The Durga Atelier"
	data-testid="mrinmoyee-atelier"
	data-status={status}
	tabindex="-1"
>
	<header class="m-heading">
		<a class="m-back" href={resolve('/blog/[category]', { category: 'visualizations' })}
			>← Visualizations</a
		>
		<div class="m-edition">
			<span class="m-dot"></span> An interactive sculpture atelier <span>№ 01 / Calcutta</span>
		</div>
		<button
			type="button"
			class="m-quiet"
			onclick={toggleSound}
			disabled={soundBusy}
			aria-pressed={soundEnabled}>{soundEnabled ? '◉ Sound on' : '◎ Sound off'}</button
		>
	</header>

	<div class="m-workspace" class:m-tools-hidden={!toolsOpen}>
		<div class="m-stage">
			<div class="m-stage-title">
				<p class="m-eyebrow">Clay · Cloth · Light</p>
				<h1>Mrinmoyee<span>মৃন্ময়ী</span></h1>
				<p class="m-subtitle">The Durga Atelier</p>
				<p class="m-intro">Shape the details.<br />Compose the light.<br />Make her your own.</p>
			</div>
			<div class="m-canvas-wrap" data-testid="atelier-stage">
				<AtelierViewport
					bind:this={viewport}
					design={visibleDesign}
					{quality}
					presentation={presentation && autoRotate}
					ambientMotion={motion && !posterMode}
					reducedMotion={reducedMotion || posterMode}
					oncamera={cameraChanged}
					onstatus={(next, detail) => {
						status = next;
						if (next === 'ready')
							message = 'Your atelier is ready. Choose a mood, or make it your own.';
						else if (detail) message = detail;
					}}
					onselect={inspect}
					onbell={() => {
						if (soundEnabled) audio?.bell();
					}}
				/>
			</div>
			<div class="m-view-label">
				<span>Original digital sculpture</span><strong
					>{comparing && comparison
						? `Saved · ${comparison.name}`
						: (currentPreset?.name ?? 'Your composition')}</strong
				>
			</div>
			{#if comparing}<div class="m-comparison-label">
					Viewing the saved design <button type="button" onclick={() => (comparing = false)}
						>Return to current →</button
					>
				</div>{/if}
			{#if note && !presentation}<aside class="m-note">
					<button
						class="m-note-close"
						type="button"
						aria-label="Close detail note"
						onclick={() => (selectedRegion = '')}>×</button
					>
					<p class="m-eyebrow">Look closer</p>
					<h3>{note.title}</h3>
					<p>{note.text}</p>
				</aside>{/if}
			<div class="m-camera-bar" role="group" aria-label="Camera views">
				{#each [['whole', 'Full statue'], ['face', 'Face'], ['crown', 'Crown'], ['three-quarter', 'Three-quarter']] as [view, title] (view)}
					<button type="button" onclick={() => bookmark(view as CameraBookmark)}>{title}</button>
				{/each}
			</div>
			<p class="m-gesture">Drag to turn · Scroll to look closer · Select a detail</p>
			{#if presentation}<div class="m-presentation-controls">
					<button type="button" data-presentation-return onclick={present}
						>← Return to atelier</button
					><button
						type="button"
						disabled={reducedMotion}
						aria-pressed={autoRotate}
						onclick={() => {
							autoRotate = !autoRotate;
						}}>{autoRotate ? 'Stop camera' : 'Slow camera orbit'}</button
					>
				</div>{/if}
		</div>

		<aside class="m-tools" aria-label="Design tools" id="mrinmoyee-tools">
			<div class="m-tools-heading">
				<div>
					<p class="m-eyebrow">Your atelier</p>
					<h3>A little of your own.</h3>
				</div>
				<button
					type="button"
					class="m-close-tools"
					aria-label="Close design tools"
					onclick={() => (toolsOpen = false)}>×</button
				>
			</div>
			<div class="m-tabs" role="tablist" aria-label="Design tool groups">
				{#each tabs as tab (tab.id)}<button
						type="button"
						role="tab"
						id={`m-tab-${tab.id}`}
						aria-controls="mrinmoyee-tool-panel"
						aria-selected={activeTab === tab.id}
						tabindex={activeTab === tab.id ? 0 : -1}
						onclick={() => (activeTab = tab.id)}
						onkeydown={(event) => {
							const index = tabs.findIndex((item) => item.id === activeTab);
							if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
								event.preventDefault();
								const next =
									event.key === 'Home'
										? 0
										: event.key === 'End'
											? tabs.length - 1
											: (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
								activeTab = tabs[next].id;
								document.getElementById(`m-tab-${activeTab}`)?.focus();
							}
						}}><span>{tab.numeral}</span>{tab.label}</button
					>{/each}
			</div>
			<div
				class="m-tool-body"
				role="tabpanel"
				id="mrinmoyee-tool-panel"
				aria-labelledby={`m-tab-${activeTab}`}
				tabindex="0"
			>
				{#if activeTab === 'inspiration'}
					<p class="m-panel-intro">Begin with a mood. Stay for the details.</p>
					<div class="m-presets">
						{#each PRESETS as preset (preset.id)}<button
								type="button"
								class="m-preset"
								class:active={design.presetId === preset.id}
								aria-pressed={design.presetId === preset.id}
								onclick={() => choosePreset(preset.id)}
								style={`--preset-a:${preset.colours[0]};--preset-b:${preset.colours[1]};--preset-c:${preset.colours[2]}`}
								><span class="m-preset-art"
									><img
										src={`/images/visualizations/mrinmoyee/preset-${preset.id}.jpg`}
										alt=""
										width="180"
										height="120"
										loading="lazy"
									/></span
								><strong>{preset.name}</strong><span class="m-preset-colours"
									>{#each preset.colours as tone, index (index)}<i style={`background:${tone}`}
										></i>{/each}</span
								></button
							>{/each}
					</div>
					<p class="m-preset-description">
						{currentPreset?.description ??
							'A composition shaped by you. Save it to your collection when it feels right.'}
					</p>
					<div class="m-rule"></div>
					<h4>Keep what you love</h4>
					<p class="m-help">Locks hold these details when you create a variation.</p>
					<div class="m-locks">
						{@render lockButton('face', 'Keep face')}{@render lockButton(
							'pose',
							'Keep pose'
						)}{@render lockButton('dress', 'Keep dress')}{@render lockButton(
							'ornament',
							'Keep ornament'
						)}{@render lockButton('setting', 'Keep setting')}
					</div>
					<button type="button" class="m-primary m-wide" onclick={vary}>✧ Create a variation</button
					>
					<label class="m-field"
						><span>Pattern seed</span><input
							maxlength="64"
							value={design.seed}
							onchange={(event) => patch({ seed: event.currentTarget.value })}
						/></label
					>
				{:else if activeTab === 'sculpt'}
					<details open>
						<summary>Face & form <span>01</span></summary>
						<div class="m-controls">
							{@render choice('Expression', 'face', [
								['serene', 'Serene'],
								['gentle', 'Gentle'],
								['resolute', 'Resolute']
							])}{@render range('Face width', 'faceWidth', 0.9, 1.1, 0.01)}{@render range(
								'Painted eyes',
								'eyeScale',
								0.85,
								1.15,
								0.01
							)}{@render range('Head inclination', 'headTilt', -8, 8, 1)}{@render choice(
								'Arm composition',
								'pose',
								[
									['classic', 'Classic sweep'],
									['open', 'Open sweep']
								]
							)}{@render lockButton('face', 'Keep this face')}{@render lockButton(
								'pose',
								'Lock pose'
							)}
						</div>
					</details>
					<details>
						<summary>Dress & colour <span>02</span></summary>
						<div class="m-controls">
							{@render colour('Sari', 'sariColor')}{@render colour(
								'Border',
								'borderColor'
							)}{@render colour('Blouse', 'blouseColor')}{@render colour(
								'Painted clay',
								'skinColor'
							)}{@render choice('Woven motif', 'sariPattern', [
								['lotus', 'Lotus'],
								['vine', 'Climbing vine'],
								['chevron', 'Chevron']
							])}{@render lockButton('dress', 'Keep this dress')}
						</div>
					</details>
					<details>
						<summary>Crown & ornament <span>03</span></summary>
						<div class="m-controls">
							{@render choice('Crown finish', 'crown', [
								['shola', 'Ivory shola-inspired'],
								['gold', 'Antique gold'],
								['silver', 'Brushed silver']
							])}{@render range('Crown scale', 'crownScale', 0.8, 1.2, 0.02)}{@render range(
								'Ornament density',
								'ornamentDensity',
								0,
								1,
								0.05
							)}{@render choice('Halo', 'halo', [
								['lotus', 'Lotus petals'],
								['sunburst', 'Sunburst'],
								['arch', 'Decorated arch']
							])}{@render lockButton('ornament', 'Keep these ornaments')}
						</div>
					</details>
					<details>
						<summary>Material <span>04</span></summary>
						<div class="m-materials">
							{#each MATERIALS as material (material.id)}<button
									type="button"
									aria-pressed={design.material === material.id}
									onclick={() => patch({ material: material.id })}
									><i class={`m-material-${material.id}`}></i>{material.name}</button
								>{/each}
						</div>
						<p class="m-help">
							The finish changes the sculpture’s response to light. Your face, pose and dress stay
							in place.
						</p>
					</details>
				{:else if activeTab === 'setting'}
					<details open>
						<summary>Compose the light <span>01</span></summary>
						<div class="m-controls">
							{@render range('Warmth', 'lightWarmth', 0, 1, 0.05)}{@render range(
								'Light direction',
								'lightAngle',
								-90,
								90,
								5
							)}{@render range('Exposure', 'exposure', 0.6, 1.8, 0.05)}<button
								type="button"
								class="m-secondary"
								aria-pressed={design.lamps}
								onclick={() => patch({ lamps: !design.lamps })}
								>{design.lamps ? 'Extinguish the lamps' : 'Light the lamps'}</button
							>{@render range('Lamplight', 'lampIntensity', 0, 1, 0.05)}
						</div>
					</details>
					<details open>
						<summary>Flowers & surroundings <span>02</span></summary>
						<div class="m-controls">
							{@render choice('Setting', 'backdrop', [
								['charcoal', 'Charcoal chamber'],
								['atelier', 'Daylight atelier'],
								['indigo', 'Indigo night'],
								['pandal', 'Architectural pandal']
							])}{@render choice('Garland', 'garland', [
								['marigold', 'Marigold'],
								['jasmine', 'Jasmine'],
								['hibiscus', 'Hibiscus']
							])}<label class="m-check"
								><input
									type="checkbox"
									checked={design.flowers}
									onchange={(event) => patch({ flowers: event.currentTarget.checked })}
								/>Flower garlands</label
							><label class="m-check"
								><input
									type="checkbox"
									checked={design.bells}
									onchange={(event) => patch({ bells: event.currentTarget.checked })}
								/>Hanging brass bells</label
							><label class="m-check"
								><input
									type="checkbox"
									checked={design.lion}
									onchange={(event) => patch({ lion: event.currentTarget.checked })}
								/>Lion on the pedestal</label
							>{@render range('Incense & atmosphere', 'atmosphere', 0, 1, 0.05)}<label
								class="m-check"
								><input
									type="checkbox"
									checked={motion}
									disabled={reducedMotion}
									onchange={(event) => (motion = event.currentTarget.checked)}
								/>Gentle ambient movement</label
							>{#if reducedMotion}<p class="m-help">
									Your reduced-motion preference is active.
								</p>{/if}
						</div>
					</details>
					<details>
						<summary>Sound & performance <span>03</span></summary>
						<div class="m-controls">
							<button type="button" class="m-secondary" onclick={toggleSound} disabled={soundBusy}
								>{soundEnabled ? 'Mute all sound' : 'Enable quiet sound'}</button
							><label class="m-field"
								><span>Original synthesized soundscape</span><select
									aria-label="Original synthesized soundscape"
									bind:value={soundMode}
									onchange={(event) =>
										audio?.setMode(event.currentTarget.value as 'bells' | 'dhak')}
									><option value="bells">Bells, with pauses</option><option value="dhak"
										>A dhak-inspired rhythm</option
									></select
								></label
							><label class="m-range" for="mrinmoyee-volume"
								><span
									>Sound volume<output aria-hidden="true"
										>{Math.round((volume / 0.35) * 100)}%</output
									></span
								><input
									type="range"
									id="mrinmoyee-volume"
									aria-label="Sound volume"
									min="0"
									max="0.35"
									step="0.01"
									bind:value={volume}
									oninput={(event) => audio?.setVolume(Number(event.currentTarget.value))}
								/></label
							><label class="m-field"
								><span>Rendering quality</span><select
									aria-label="Rendering quality"
									bind:value={quality}
									><option value="auto">Automatic</option><option value="high">High detail</option
									><option value="low">Lighter on this device</option></select
								></label
							>
						</div>
					</details>
				{:else}
					<p class="m-panel-intro">Keep a composition. Return to it another day.</p>
					<label class="m-field"
						><span>Design name</span><input maxlength="64" bind:value={designName} /></label
					><button
						class="m-primary m-wide"
						type="button"
						onclick={save}
						disabled={status !== 'ready'}>Save on this device</button
					>
					<p class="m-help">
						Up to 12 designs, stored in this browser. Download a design file to keep a separate
						copy.
					</p>
					{#if saved.length}<div class="m-saved-grid">
							{#each saved as entry (entry.id)}<article class="m-saved">
									{#if entry.thumbnail}<img
											src={entry.thumbnail}
											alt={entry.name}
											width="200"
											height="140"
										/>{/if}<strong>{entry.name}</strong>
									<div>
										<button
											type="button"
											onclick={() => {
												apply(entry.design);
												designName = entry.name;
												message = `“${entry.name}” restored.`;
											}}>Open</button
										><button
											type="button"
											onclick={() => {
												comparisonId = entry.id;
												comparing = true;
											}}>Compare</button
										><button
											type="button"
											aria-label={`Remove ${entry.name}`}
											onclick={() => removeSaved(entry.id)}>×</button
										>
									</div>
								</article>{/each}
						</div>{:else}<div class="m-empty">
							Your first composition belongs here.<span
								>Make a few changes, give it a name, and save.</span
							>
						</div>{/if}
					<div class="m-rule"></div>
					<button
						class="m-secondary m-wide"
						type="button"
						onclick={() =>
							download(
								new Blob([exportDesign(visibleDesign)], { type: 'application/json' }),
								`${filename()}.json`
							)}>Download design JSON</button
					><button class="m-quiet m-wide" type="button" onclick={() => importInput.click()}
						>Import a design file →</button
					>
				{/if}
			</div>
			<div class="m-tools-footer">
				<span>Make it yours. Keep it beautiful.</span><button
					type="button"
					onclick={() => {
						apply(DEFAULT_DESIGN);
						message = 'The original composition is restored.';
					}}>Reset design ↺</button
				>
			</div>
		</aside>
	</div>

	<div class="m-action-dock">
		<div class="m-history">
			<button
				type="button"
				aria-label="Undo design change"
				disabled={historyIndex === 0}
				onclick={() => undo(-1)}>↶</button
			><button
				type="button"
				aria-label="Redo design change"
				disabled={historyIndex >= history.length - 1}
				onclick={() => undo(1)}>↷</button
			>
		</div>
		<button
			type="button"
			class="m-tool-toggle"
			aria-expanded={toolsOpen}
			aria-controls="mrinmoyee-tools"
			onclick={() => (toolsOpen = !toolsOpen)}
			>☷ {toolsOpen ? 'Hide tools' : 'Design tools'}</button
		><button
			type="button"
			onclick={() => viewport?.ringBell()}
			disabled={!design.bells || status !== 'ready'}>♧ Ring a bell</button
		><button type="button" onclick={present}>⛶ Present</button>{#if fullscreenSupported}<button
				type="button"
				class="m-fullscreen-action"
				onclick={toggleFullscreen}>{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button
			>{/if}<span class="m-dock-spacer"></span><button type="button" onclick={share}
			>↗ Share design</button
		><button
			type="button"
			class="m-primary"
			disabled={status !== 'ready'}
			onclick={() => exportDialog.showModal()}>Export artwork ↓</button
		>
	</div>
	<div class="m-making">
		<div>
			<span class="m-eyebrow">From clay to celebration</span><strong>{STAGES[design.stage]}</strong>
		</div>
		<label
			><span class="m-sr">Construction stage</span><input
				type="range"
				min="0"
				max="5"
				step="1"
				value={design.stage}
				oninput={(event) => patch({ stage: Number(event.currentTarget.value) }, false)}
				onchange={checkpoint}
			/><span class="m-stage-steps"
				>{#each STAGES as stage (stage)}<span>{stage}</span>{/each}</span
			></label
		>
		<p>An artistic interpretation<br />of the making process.</p>
	</div>
	<footer class="m-status">
		<p role="status" aria-live="polite">{message}</p>
		<span>Designed to be still. Made to be explored.</span>
	</footer>
	{#if shareLink}<label class="m-share-link"
			><span>Your complete design link</span><input
				readonly
				value={shareLink}
				onfocus={(event) => event.currentTarget.select()}
			/><button type="button" aria-label="Close share link" onclick={() => (shareLink = '')}
				>×</button
			></label
		>{/if}
	<input
		type="file"
		accept=".json,application/json"
		bind:this={importInput}
		onchange={readImport}
		class="m-sr"
		tabindex="-1"
		aria-label="Import design JSON file"
	/>
	<dialog
		bind:this={exportDialog}
		class="m-export-dialog"
		aria-labelledby="mrinmoyee-export-title"
		aria-describedby="mrinmoyee-export-description"
		onclose={() => (exporting = false)}
	>
		<div class="m-dialog-top">
			<p class="m-eyebrow">A composition to keep</p>
			<button
				type="button"
				class="m-quiet"
				aria-label="Close artwork export"
				onclick={() => exportDialog.close()}>×</button
			>
		</div>
		<h3 id="mrinmoyee-export-title">Take her with you.</h3>
		<p id="mrinmoyee-export-description">
			Export the current sculpture, materials, light and camera as a clean PNG.
		</p>
		<label class="m-field"
			><span>Composition</span><select aria-label="Composition" bind:value={exportFormat}
				><option value="portrait">Portrait · 3:4</option><option value="square">Square · 1:1</option
				><option value="landscape">Landscape · 3:2</option></select
			></label
		><label class="m-field"
			><span>Resolution</span><select aria-label="Resolution" bind:value={exportResolution}
				><option value="standard">Standard · up to 1800 px</option><option value="high"
					>High · up to 3600 px</option
				></select
			></label
		><label class="m-check"
			><input type="checkbox" bind:checked={transparent} />Transparent background</label
		><label class="m-field"
			><span>Optional title</span><input
				maxlength="80"
				bind:value={exportTitle}
				placeholder="A name for this composition"
			/></label
		><label class="m-field"
			><span>Optional signature</span><input
				maxlength="60"
				bind:value={signature}
				placeholder="Your name"
			/></label
		><button type="button" class="m-primary m-wide" disabled={exporting} onclick={exportImage}
			>{exporting ? 'Composing your image…' : 'Download artwork ↓'}</button
		>
		<p class="m-help">Pixel appearance can vary between graphics hardware.</p>
	</dialog>
</section>
