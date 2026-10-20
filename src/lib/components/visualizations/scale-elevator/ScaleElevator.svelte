<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { asset, resolve } from '$app/paths';
	import {
		FLOORS,
		SCENARIOS,
		DEFAULT_STATE,
		normaliseState,
		evaluateModel,
		readingFor,
		floorAt,
		parseState,
		encodeState,
		tourProgress,
		TOUR_DURATION
	} from '$lib/visualizations/scale-elevator/core';
	import type {
		ElevatorState,
		Measurement,
		ScenarioId
	} from '$lib/visualizations/scale-elevator/types';
	import ScaleStage from './ScaleStage.svelte';
	import ScaleChart from './ScaleChart.svelte';
	import './scale-elevator.css';

	let root: HTMLElement;
	let view = $state<ElevatorState>({ ...DEFAULT_STATE });
	let floor = $state(0);
	let time = $state(0);
	let playing = $state(false);
	let animating = $state(false);
	let reduced = $state(false);
	let status = $state('loading');
	let hydrated = $state(false);
	let captureMode = $state(false);
	let message = $state('');
	let tourSeconds = 0;
	let mounted = false;
	let visible = true;
	let frame = 0;
	let lastFrame = 0;
	let urlTimer: ReturnType<typeof setTimeout> | undefined;
	let messageTimer: ReturnType<typeof setTimeout> | undefined;
	let transition: { from: number; to: number; elapsed: number; duration: number } | null = null;
	let model = $derived(evaluateModel({ ...view, progress: floor }));
	let reading = $derived(readingFor(floor, view, model));
	let current = $derived(FLOORS[floor]);
	let scenario = $derived(SCENARIOS.find((s) => s.id === view.scenario) ?? SCENARIOS[0]);
	let renderState = $derived({ ...view, time, model });
	let dialValue = $derived(
		[
			view.control >= 0.5 ? 'Bound' : 'Unbound',
			`${(10 + 90 * view.control).toFixed(1)} mmHg`,
			`${model.gradient.toFixed(2)} relative units`,
			`${model.uptake.toFixed(2)} × demand`,
			`${model.perfusion.toFixed(2)} × perfusion`,
			`${model.perfusion.toFixed(2)} × regional flow`,
			`${model.cardiacOutput.toFixed(1)} L blood/min`,
			`Minute ${Math.round(view.control * 11)}`,
			`${(0.6 + 0.8 * view.control).toFixed(2)} × source draw`,
			`${model.wardCapacities[2].toFixed(0)} L/min`,
			`${model.citySupply.toFixed(0)} L/min`
		][floor]
	);
	const fmt = (m: Measurement) =>
		m.value === null
			? '—'
			: m.value.toLocaleString('en-GB', {
					maximumFractionDigits: m.precision,
					minimumFractionDigits: m.precision
				});
	function persist() {
		if (!mounted || captureMode) return;
		clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			const url = new URL(location.href);
			for (const key of [...url.searchParams.keys()])
				if (key.startsWith('se-')) url.searchParams.delete(key);
			for (const [key, value] of new URLSearchParams(encodeState(view)))
				url.searchParams.set(key, value);
			const path =
				`${url.pathname}${url.search}${url.hash}` as `/blog/visualizations/the-scale-elevator-from-ion-to-city${string}`;
			replaceState(resolve(path), page.state);
		}, 250);
	}
	function progress(next: number) {
		view = normaliseState({ ...view, progress: next });
		floor = floorAt(view.progress, floor);
	}
	function schedule() {
		if (
			!mounted ||
			frame ||
			!visible ||
			document.hidden ||
			reduced ||
			captureMode ||
			!(playing || animating || transition)
		)
			return;
		lastFrame = performance.now();
		frame = requestAnimationFrame(advance);
	}
	function advance(now: number) {
		frame = 0;
		if (!mounted || !visible || document.hidden || reduced || captureMode) return;
		const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
		time += dt;
		if (playing) {
			tourSeconds = Math.min(TOUR_DURATION, tourSeconds + dt);
			progress(tourProgress(tourSeconds));
			if (tourSeconds >= TOUR_DURATION) {
				playing = false;
				persist();
			}
		} else if (transition) {
			transition.elapsed += dt;
			const p = Math.min(1, transition.elapsed / transition.duration);
			const eased = p * p * (3 - 2 * p);
			progress(transition.from + (transition.to - transition.from) * eased);
			if (p === 1) {
				transition = null;
				persist();
			}
		}
		schedule();
	}
	function go(next: number) {
		playing = false;
		const to = Math.max(0, Math.min(10, next));
		if (reduced) {
			transition = null;
			progress(to);
			persist();
		} else {
			transition = {
				from: view.progress,
				to,
				elapsed: 0,
				duration: Math.min(2, 0.65 + Math.abs(to - view.progress) * 0.12)
			};
			schedule();
		}
	}
	function scrub(value: string) {
		playing = false;
		transition = null;
		progress(Number(value));
		persist();
	}
	function play(replay = false) {
		if (reduced) return;
		transition = null;
		if (playing && !replay) {
			playing = false;
			persist();
			return;
		}
		if (replay || view.progress >= 9.99) {
			tourSeconds = 0;
			progress(0);
			time = 0;
		} else {
			// Invert the canonical tour clock so Play can start at any scrubbed position.
			let lo = 0,
				hi = TOUR_DURATION;
			for (let i = 0; i < 25; i++) {
				const mid = (lo + hi) / 2;
				if (tourProgress(mid) < view.progress) lo = mid;
				else hi = mid;
			}
			tourSeconds = lo;
		}
		playing = true;
		schedule();
	}
	function chooseScenario(id: ScenarioId) {
		view = normaliseState({ ...view, scenario: id });
		persist();
	}
	function inspect(index: number) {
		view = normaliseState({ ...view, selected: index });
		persist();
	}
	function announce(text: string) {
		message = text;
		clearTimeout(messageTimer);
		messageTimer = setTimeout(() => (message = ''), 4000);
	}
	async function share() {
		const url = new URL(location.href);
		for (const key of [...url.searchParams.keys()])
			if (key.startsWith('se-')) url.searchParams.delete(key);
		for (const [key, value] of new URLSearchParams(encodeState(view)))
			url.searchParams.set(key, value);
		try {
			await navigator.clipboard.writeText(url.href);
			announce('A link to this floor and scenario has been copied.');
		} catch {
			persist();
			announce('The address bar contains this view’s share link.');
		}
	}
	function keyboard(event: KeyboardEvent) {
		if (event.target !== event.currentTarget) return;
		if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
			event.preventDefault();
			go(floor + 1);
		}
		if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
			event.preventDefault();
			go(floor - 1);
		}
		if (event.key === 'Home') {
			event.preventDefault();
			go(0);
		}
		if (event.key === 'End') {
			event.preventDefault();
			go(10);
		}
	}
	onMount(() => {
		mounted = true;
		view = parseState(location.search);
		floor = floorAt(view.progress);
		captureMode = new URLSearchParams(location.search).get('se-capture') === '1';
		const media = matchMedia('(prefers-reduced-motion: reduce)');
		function motion() {
			reduced =
				media.matches ||
				document.documentElement.dataset.motion === 'still' ||
				new URLSearchParams(location.search).get('motion') === 'reduce';
			if (reduced) {
				playing = false;
				animating = false;
				transition = null;
				cancelAnimationFrame(frame);
				frame = 0;
			}
		}
		motion();
		media.addEventListener('change', motion);
		const preferences = new MutationObserver(motion);
		preferences.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		const viewport = new IntersectionObserver((entries) => {
			const entry = entries.at(-1);
			if (!entry) return;
			visible = entry.isIntersecting;
			if (!visible) {
				cancelAnimationFrame(frame);
				frame = 0;
			} else schedule();
		});
		viewport.observe(root);
		function visibility() {
			if (document.hidden) {
				cancelAnimationFrame(frame);
				frame = 0;
			} else schedule();
		}
		document.addEventListener('visibilitychange', visibility);
		function capture(event: Event) {
			if (!captureMode || !(event instanceof CustomEvent)) return;
			playing = false;
			animating = false;
			transition = null;
			view = normaliseState({ ...view, ...event.detail });
			floor = floorAt(view.progress);
			time =
				typeof event.detail.time === 'number' && Number.isFinite(event.detail.time)
					? Math.max(0, event.detail.time)
					: 0;
		}
		root.addEventListener('scale-capture', capture);
		function pop() {
			view = parseState(location.search);
			floor = floorAt(view.progress);
			playing = false;
			transition = null;
		}
		window.addEventListener('popstate', pop);
		hydrated = true;
		return () => {
			mounted = false;
			cancelAnimationFrame(frame);
			clearTimeout(urlTimer);
			clearTimeout(messageTimer);
			media.removeEventListener('change', motion);
			preferences.disconnect();
			viewport.disconnect();
			document.removeEventListener('visibilitychange', visibility);
			root.removeEventListener('scale-capture', capture);
			window.removeEventListener('popstate', pop);
		};
	});
</script>

<section
	bind:this={root}
	class="scale-elevator not-prose"
	class:se-capture-mode={captureMode}
	data-testid="scale-elevator"
	data-hydrated={hydrated}
	data-floor={current.id}
	data-progress={view.progress.toFixed(4)}
	data-scenario={view.scenario}
	data-status={status}
	data-playing={playing}
	aria-label="The Scale Elevator — an oxygen journey"
>
	<div data-testid="scale-capture" class="se-capture-card">
		<header class="se-masthead">
			<div>
				<p class="se-eyebrow">
					<span class="se-oxygen-mark" aria-hidden="true">O₂</span> A field guide to oxygen
					<span class="se-dot">·</span> Eleven scales
				</p>
				<h1 aria-label="The Scale Elevator — From Ion to City">
					The Scale Elevator<span>From Ion to City</span>
				</h1>
			</div>
			<div class="se-masthead-note">
				<span>ONE PHENOMENON.</span><span>ELEVEN WAYS OF SEEING.</span>
				<p>A number needs a place,<br />a denominator, and a clock.</p>
			</div>
		</header>
		<div class="se-workbench">
			<div class="se-stage-column">
				<div
					class="se-stage"
					role="slider"
					aria-valuemin={0}
					aria-valuemax={10}
					aria-valuenow={view.progress}
					aria-valuetext={`${current.name}, floor ${floor + 1} of eleven`}
					tabindex="0"
					aria-label="Scale viewport. Arrow keys change floor; Home goes to ion; End goes to city."
					onkeydown={keyboard}
				>
					<ScaleStage view={renderState} {floor} onstatus={(next) => (status = next)} />
					<div class="se-stage-heading">
						<span class="se-floor-number"
							>{String(floor + 1).padStart(2, '0')}<small>/ 11</small></span
						>
						<div>
							<span class="se-small-label">{current.verb}</span>
							<h2>{current.name}</h2>
						</div>
					</div>
					<div class="se-stage-corner">
						<span class="se-small-label">Viewing context</span><strong>{current.extent}</strong
						><span
							>{current.context === 'organisational'
								? 'Organisational scope'
								: 'Representative view'}</span
						>
					</div>
					<div class="se-stage-caption">
						<span><i aria-hidden="true"></i> Oxygen thread</span><span
							>Schematic geometry · synthetic demonstration</span
						>
					</div>
				</div>
				<div class="se-transition-note">
					<span aria-hidden="true">↗</span>
					<p>{current.transition}</p>
				</div>
			</div>
			<aside class="se-reading" aria-label="Current scale explanation">
				<div class="se-question">
					<span class="se-small-label">At this scale, ask</span>
					<h3>{current.question}</h3>
					<p>{current.description}</p>
				</div>
				<div class="se-primary">
					<span>{reading.primary.label}</span>
					<div>
						<output data-testid="scale-primary">{fmt(reading.primary)}</output><span
							>{reading.primary.unit}</span
						>
					</div>
				</div>
				<ScaleChart
					{floor}
					{model}
					control={view.control}
					selected={view.selected}
					onselect={inspect}
				/>
				<div class="se-secondary">
					{#each reading.secondary as item (item.label)}<div>
							<span>{item.label}</span><strong>{fmt(item)} <small>{item.unit}</small></strong>
						</div>{/each}
				</div>
				<p class="se-takeaway">{reading.insight}</p>
			</aside>
		</div>
		<div class="se-passport" aria-label="Measurement passport">
			<span class="se-small-label">Measurement<br />passport</span>
			<div><span>Quantity / unit</span><strong>{current.quantity} · {current.unit}</strong></div>
			<div><span>Applies to</span><strong>{current.support}</strong></div>
			<div>
				<span>Denominator / interval</span><strong
					>{current.denominator} · {current.interval}</strong
				>
			</div>
			<div><span>Evidence status</span><strong>{current.basis}</strong></div>
		</div>
		<div class="se-capture-signature">
			<span>SUVROGHOSH.IN / VISUALIZATIONS</span><span
				>{scenario.name} · Seed {view.seed} · Model v1</span
			>
		</div>
	</div>
	<div class="se-interactive-tools">
		<nav class="se-floor-rail" aria-label="Eleven scale floors">
			{#each FLOORS as item, index (item.id)}<button
					type="button"
					aria-current={floor === index ? 'step' : undefined}
					onclick={() => go(index)}
					title={item.question}><span>{String(index + 1).padStart(2, '0')}</span>{item.name}</button
				>{/each}
		</nav>
		<div class="se-travel">
			<button
				type="button"
				onclick={() => go(floor - 1)}
				disabled={floor === 0}
				aria-label="Previous floor">←</button
			><label for="se-progress"
				>Travel through scale<input
					id="se-progress"
					type="range"
					min="0"
					max="10"
					step="0.005"
					value={view.progress}
					oninput={(e) => scrub(e.currentTarget.value)}
					aria-valuetext={`${current.name}, floor ${floor + 1} of eleven`}
				/></label
			><button
				type="button"
				onclick={() => go(floor + 1)}
				disabled={floor === 10}
				aria-label="Next floor">→</button
			><button class="se-tour-button" type="button" onclick={() => play()} disabled={reduced}
				>{playing ? 'Ⅱ Pause tour' : '▷ Guided zoom'}</button
			><button
				type="button"
				onclick={() => play(true)}
				disabled={reduced}
				aria-label="Replay continuous tour">↺ Replay</button
			><button
				type="button"
				aria-pressed={animating}
				onclick={() => {
					animating = !animating;
					schedule();
				}}
				disabled={reduced}>Animate this view</button
			>
		</div>
		{#if reduced}<p class="se-motion-note">
				Still mode is active. Step between floors or scrub the scale; every explanation and
				comparison remains available.
			</p>{/if}
		<div class="se-experiments">
			<div class="se-scenario-picker">
				<label class="se-small-label" for="se-scenario">Change one thing</label><select
					id="se-scenario"
					value={view.scenario}
					onchange={(e) => chooseScenario(e.currentTarget.value as ScenarioId)}
					>{#each SCENARIOS as item (item.id)}<option value={item.id}>{item.name}</option
						>{/each}</select
				>
				<p>{scenario.description}</p>
				<p class="se-held">Held constant: {scenario.held}</p>
			</div>
			<div class="se-local-control">
				<label for="se-control">{current.controlLabel}<output>{dialValue}</output></label><input
					id="se-control"
					aria-valuetext={dialValue}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={view.control}
					oninput={(e) => {
						view = normaliseState({ ...view, control: Number(e.currentTarget.value) });
						persist();
					}}
				/>
				<div class="se-control-extents">
					<span>{current.lowLabel}</span><button
						type="button"
						onclick={() => {
							view = { ...view, control: 0.5 };
							persist();
						}}>Reset dial</button
					><span>{current.highLabel}</span>
				</div>
				<p>{reading.effect}</p>
			</div>
		</div>
		{#if floor === 4}<div
				class="se-observation se-region-choice"
				aria-label="Select tissue distance"
			>
				{#each ['Near', 'Middle', 'Far', 'Farthest'] as name, distance (distance)}<button
						type="button"
						aria-pressed={view.selected % 4 === distance}
						onclick={() => inspect(distance)}
						>{name} · {(distance * 0.8).toFixed(1)} relative units</button
					>{/each}
			</div>{/if}
		{#if floor === 5}<div class="se-observation se-region-choice" aria-label="Select organ region">
				{#each [0, 1, 2, 3] as region (region)}<button
						type="button"
						aria-pressed={view.selected % 4 === region}
						onclick={() => inspect(region)}>Region {region + 1}</button
					>{/each}
			</div>{/if}
		{#if floor === 8}<div class="se-observation se-ward-choice" aria-label="Select ward">
				{#each [0, 1, 2] as ward (ward)}<button
						type="button"
						aria-pressed={Math.floor(view.selected / 12) === ward}
						onclick={() => inspect(ward * 12)}
						>Ward {String.fromCharCode(65 + ward)} · {model.wardDemands[ward].toFixed(1)} L/min</button
					>{/each}
			</div>
			<p class="se-selection">
				Ward {String.fromCharCode(65 + Math.floor(view.selected / 12))}, bed {(view.selected % 12) +
					1}: <strong>{model.bedDemands[view.selected]?.toFixed(1)} L/min</strong> source-gas draw. Select
				a bar in the ward diagram to inspect another bed.
			</p>{/if}
		<div class="se-actions">
			<button type="button" onclick={share}>Copy link to this view ↗</button><a
				href={asset(
					`/images/visualizations/scale-elevator/${String(floor + 1).padStart(2, '0')}-${current.id}.jpg`
				)}
				download>Download baseline floor still ↓</a
			><a href={asset('/videos/visualizations/scale-elevator/scale-elevator-tour.mp4')} download
				>Download the continuous tour ↓</a
			><span role="status" aria-live="polite">{message}</span>
		</div>
	</div>
	<details class="se-ledger">
		<summary>Read the eleven-floor field guide</summary>
		<ol>
			{#each FLOORS as item, index (item.id)}<li>
					<div>
						<span class="se-small-label">{String(index + 1).padStart(2, '0')} / {item.extent}</span>
						<h3>{item.name}: {item.question}</h3>
						<p>{item.description} {item.takeaway}</p>
						<p class="se-ledger-measure">
							{item.quantity} · {item.unit} · {item.denominator} · {item.interval}. {item.basis}.
						</p>
					</div>
					<div class="se-ledger-links">
						<a
							href={asset(
								`/images/visualizations/scale-elevator/${String(index + 1).padStart(2, '0')}-${item.id}.jpg`
							)}>Open annotated still ↗</a
						><button
							type="button"
							disabled={!hydrated}
							onclick={() => {
								go(index);
								root.scrollIntoView({ behavior: 'instant', block: 'start' });
							}}>Visit {item.name.toLowerCase()} ↑</button
						>
					</div>
				</li>{/each}
		</ol>
	</details>
	<details class="se-model-disclosure">
		<summary>About this model, its units, and its limits</summary>
		<div>
			<p>
				This is a synthetic educational exhibit. Geometry, molecular motion, local flux, uptake and
				tissue fields are schematic. The haemoglobin content and delivery examples use declared
				physiological equations; the ward and city examples use a separate source-gas accounting
				model.
			</p>
			<p>
				A saturation percentage, an oxygen delivery rate, and a hospital gas flow are different
				quantities. The source network assumes 99% oxygen gas at 20°C and 101.3 kPa throughout.
				Source demand includes device gas use and is not a conversion from a person’s oxygen uptake.
				Inventory is expressed as gas-equivalent litres.
			</p>
			<p>
				There are no real patient records, live capacity feeds, clinical predictions, or treatment
				thresholds. The iron-to-haemoglobin view is followed by an explicit handoff to an adjacent
				tissue cell. Physical extent changes into anatomical and organisational context as the
				journey expands.
			</p>
			<p>
				The local dial applies to the currently interpreted floor. Scenarios hold their declared
				comparison variables constant. The article below gives the equations, assumptions,
				references, and distinctions in full.
			</p>
		</div>
	</details>
	<noscript
		><p class="se-motion-note">
			JavaScript is disabled. Open the field guide above to read all eleven floors. The article,
			baseline stills and recorded journey remain available.
		</p></noscript
	>
</section>
