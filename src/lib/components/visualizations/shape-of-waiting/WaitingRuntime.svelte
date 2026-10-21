<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { resolveMotion } from '$lib/motion/preferences';
	import { snapshotAt, normalizeSettings } from '$lib/visualizations/shape-of-waiting/engine';
	import {
		DEMO_SETTINGS,
		MODEL_VERSION,
		POLICY_LABELS,
		PRESETS
	} from '$lib/visualizations/shape-of-waiting/presets';
	import { OPENING_SETTINGS } from '$lib/visualizations/shape-of-waiting/presentation';
	import { histogramCeiling } from '$lib/visualizations/shape-of-waiting/drawing';
	import { encodeReplay, decodeReplay } from '$lib/visualizations/shape-of-waiting/serialization';
	import type {
		Run,
		Settings,
		ScenarioId,
		Policy
	} from '$lib/visualizations/shape-of-waiting/types';
	import QueueStage from './QueueStage.svelte';
	import WaitDistribution from './WaitDistribution.svelte';

	let settings = $state<Settings>({ ...OPENING_SETTINGS });
	let baselineSettings = $state<Settings | null>(null);
	let run = $state<Run | null>(null);
	let baseline = $state<Run | null>(null);
	let time = $state(0);
	let playing = $state(false);
	let still = $state(false);
	let visible = $state(true);
	let busy = $state(true);
	let speed = $state(18);
	let selected = $state<number | null>(null);
	let following = $state(false);
	let message = $state('');
	let shareLink = $state('');
	let error = $state('');
	let host: HTMLDivElement;
	let viewport: HTMLDivElement;
	let worker: Worker | null = null;
	let request = 0;
	let mounted = false;
	let disposed = false;
	let pending: ReturnType<typeof setTimeout> | undefined;
	let pendingTime: number | null = null;
	const exportUrls = new SvelteMap<string, ReturnType<typeof setTimeout>>();
	const snapshot = $derived(run ? snapshotAt(run, time) : null);
	const baseSnapshot = $derived(baseline ? snapshotAt(baseline, time) : null);
	const metrics = $derived(snapshot?.metrics);
	const preset = $derived(PRESETS.find((item) => item.id === settings.scenario) ?? PRESETS[0]);
	const duration = $derived(Math.max(run?.endTime ?? settings.window, baseline?.endTime ?? 0));
	const inspected = $derived(snapshot?.people.find((person) => person.id === selected) ?? null);
	const commonScale = $derived(
		Math.max(
			30,
			Math.ceil(
				Math.max(
					0,
					...[...(snapshot?.people ?? []), ...(baseSnapshot?.people ?? [])].map(
						(person) => person.wait
					)
				) / 10
			) * 10
		)
	);
	const sharedY = $derived(
		Math.max(
			snapshot ? histogramCeiling(snapshot, commonScale) : 1,
			baseSnapshot ? histogramCeiling(baseSnapshot, commonScale) : 1
		)
	);
	const paired = $derived(
		!baselineSettings ||
			[
				'scenario',
				'seed',
				'arrivalRate',
				'meanService',
				'variability',
				'window',
				'burst',
				'noShow',
				'patience'
			].every((key) => settings[key as keyof Settings] === baselineSettings![key as keyof Settings])
	);
	const comparisonMessage = $derived.by(() => {
		if (!metrics || !baseSnapshot) return '';
		const b = baseSnapshot.metrics;
		if (!paired)
			return 'Demand settings differ. This comparison changes the day as well as its rule.';
		if (!snapshot?.final || !baseSnapshot.final)
			return 'A shared clock, the same demand. These results are provisional while people remain unresolved.';
		if (
			metrics.mean !== null &&
			b.mean !== null &&
			metrics.max !== null &&
			b.max !== null &&
			metrics.mean < b.mean &&
			metrics.max > b.max
		)
			return 'The average improved. The longest wait did not.';
		return 'The same arrivals, different rules. Follow a ticket to see who gained time and who lost it.';
	});
	function fmt(value: number | null | undefined) {
		return value == null ? '—' : value.toFixed(1);
	}
	function pct(value: number) {
		return `${(value * 100).toFixed(1)}%`;
	}
	function ticket(id: number) {
		return String(id + 1).padStart(3, '0');
	}
	function select(id: number) {
		selected = id;
		following = false;
	}
	function fail(reason: string) {
		worker?.terminate();
		worker = null;
		busy = false;
		playing = false;
		run = null;
		baseline = null;
		selected = null;
		following = false;
		shareLink = '';
		message = '';
		error = reason;
	}
	function update(changes: Partial<Settings>, restoreTime: number | null = null) {
		settings = normalizeSettings({ ...settings, ...changes });
		playing = false;
		pendingTime = restoreTime;
		message = '';
		shareLink = '';
		if (!mounted) return;
		clearTimeout(pending);
		busy = true;
		request++;
		worker?.terminate();
		pending = setTimeout(launch, 100);
	}
	function launch() {
		if (disposed) return;
		worker?.terminate();
		busy = true;
		error = '';
		const id = ++request;
		const target = pendingTime;
		pendingTime = null;
		try {
			worker = new Worker(
				new URL('../../../visualizations/shape-of-waiting/worker.ts', import.meta.url),
				{ type: 'module' }
			);
			worker.onmessage = (
				event: MessageEvent<{ id: number; run: Run; baseline: Run | null; error?: string }>
			) => {
				if (disposed || event.data.id !== request) return;
				if (event.data.error) {
					fail(event.data.error);
					return;
				}
				run = event.data.run;
				baseline = baselineSettings ? event.data.baseline : null;
				time =
					target === -1
						? Math.max(run.endTime, baseline?.endTime ?? 0)
						: target === null
							? Math.min(settings.window * 0.78, run.endTime)
							: Math.min(target, Math.max(run.endTime, baseline?.endTime ?? 0));
				busy = false;
				worker?.terminate();
				worker = null;
			};
			worker.onerror = () => {
				if (!disposed && id === request) {
					fail(
						'The simulation worker could not run. Change a setting to retry; the article and static plate remain available.'
					);
				}
			};
			worker.postMessage({
				id,
				settings: $state.snapshot(settings),
				baseline: baselineSettings ? $state.snapshot(baselineSettings) : null
			});
		} catch {
			fail(
				'This browser could not start the simulation worker. The explanation below remains available.'
			);
		}
	}
	function scenario(id: ScenarioId) {
		const next = PRESETS.find((item) => item.id === id);
		if (!next) return;
		baselineSettings = null;
		baseline = null;
		selected = null;
		following = false;
		update(next.settings);
	}
	function keepBaseline() {
		baselineSettings = { ...settings };
		baseline = run;
		playing = false;
		time = Math.min(time, run?.endTime ?? settings.window);
		shareLink = '';
		message = 'Baseline kept. Change staffing or the rule to compare the same day.';
	}
	function closeComparison() {
		baselineSettings = null;
		baseline = null;
		playing = false;
		time = Math.min(time, run?.endTime ?? settings.window);
		shareLink = '';
		message = 'Comparison closed.';
	}
	function guide(kind: 'staff' | 'variation' | 'tail') {
		if (kind === 'tail') {
			baselineSettings = { ...DEMO_SETTINGS, policy: 'fifo', patience: 0, noShow: 0, batchSize: 1 };
			selected = null;
			update({ ...baselineSettings, policy: 'priority' }, -1);
		} else if (kind === 'staff') {
			baselineSettings = { ...settings };
			update({ servers: Math.min(8, settings.servers + 1) }, -1);
		} else {
			baselineSettings = { ...settings, variability: 0.25 };
			update({ variability: 2 }, -1);
		}
	}
	function followOldest() {
		following = !following;
		if (following && snapshot?.oldest) selected = snapshot.oldest.id;
	}
	function restart() {
		playing = false;
		time = 0;
		selected = null;
		following = false;
	}
	function finish() {
		playing = false;
		time = duration;
	}
	function replayUrl() {
		return `${location.origin}/blog/visualizations/the-shape-of-waiting#waiting=${encodeReplay({ version: MODEL_VERSION, settings: { ...settings }, baseline: baselineSettings ? { ...baselineSettings } : null, time })}`;
	}
	async function copyReplay() {
		playing = false;
		shareLink = replayUrl();
		try {
			await navigator.clipboard.writeText(shareLink);
			message = 'Replay link copied. It includes the rule, seed, baseline and simulated time.';
		} catch {
			message = 'Copy the replay link below.';
		}
	}
	async function download(format: 'png' | 'json') {
		if (!run) return;
		playing = false;
		const frozenRun = $state.snapshot(run);
		const frozenBase = baseline ? $state.snapshot(baseline) : null;
		const frozenTime = time;
		const frozenFinal = snapshot?.final ?? false;
		const url = replayUrl();
		try {
			const exporter = await import('$lib/visualizations/shape-of-waiting/export');
			const blob =
				format === 'png'
					? await exporter.receiptPng(frozenRun, frozenBase, frozenTime, url)
					: new Blob(
							[
								JSON.stringify(
									exporter.receiptReport(frozenRun, frozenBase, frozenTime, url),
									null,
									2
								)
							],
							{ type: 'application/json' }
						);
			if (disposed) return;
			const objectUrl = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = objectUrl;
			anchor.download = `the-shape-of-waiting-${frozenRun.settings.seed}.${format}`;
			anchor.click();
			exportUrls.set(
				objectUrl,
				setTimeout(() => {
					URL.revokeObjectURL(objectUrl);
					exportUrls.delete(objectUrl);
				}, 1000)
			);
			message = `Waiting receipt downloaded as ${format.toUpperCase()}. ${frozenFinal ? 'Closed cohort.' : 'Provisional snapshot; unresolved people are reported.'}`;
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'The receipt could not be created.';
		}
	}
	onMount(() => {
		mounted = true;
		const raw = location.hash.startsWith('#waiting=') ? location.hash.slice(9) : '';
		if (raw) {
			const replay = decodeReplay(raw);
			if (replay) {
				settings = replay.settings;
				baselineSettings = replay.baseline;
				pendingTime = replay.time;
				message = 'Replaying the saved configuration and simulated time.';
			} else
				message =
					'This replay is malformed or uses an unsupported version. The default day is shown.';
		}
		launch();
		const query = matchMedia('(prefers-reduced-motion: reduce)');
		const motion = () => {
			still = resolveMotion(document.documentElement.dataset.motion, query.matches) === 'still';
			if (still) playing = false;
		};
		motion();
		query.addEventListener('change', motion);
		const preference = new MutationObserver(motion);
		preference.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		const visibility = () => {
			if (document.hidden) playing = false;
		};
		document.addEventListener('visibilitychange', visibility);
		const observer = new IntersectionObserver((entries) => {
			visible = entries.some((entry) => entry.isIntersecting);
			if (!visible) playing = false;
		});
		observer.observe(viewport);
		const timer = setInterval(() => {
			if (!playing || busy || !visible || document.hidden || still || !run) return;
			time = Math.min(duration, time + speed / 10);
			if (time >= duration) playing = false;
		}, 100);
		return () => {
			disposed = true;
			mounted = false;
			clearTimeout(pending);
			clearInterval(timer);
			worker?.terminate();
			for (const [url, timer] of exportUrls) {
				clearTimeout(timer);
				URL.revokeObjectURL(url);
			}
			exportUrls.clear();
			observer.disconnect();
			preference.disconnect();
			query.removeEventListener('change', motion);
			document.removeEventListener('visibilitychange', visibility);
		};
	});
</script>

<div bind:this={host} data-ready={!!run && !busy} data-still={still}>
	<nav class="sow-scenarios" aria-label="Queue setting">
		{#each PRESETS as item (item.id)}<button
				aria-pressed={settings.scenario === item.id}
				onclick={() => scenario(item.id)}>{item.label}</button
			>{/each}
	</nav>
	<div class="sow-topline">
		<div>
			<h2>{preset.label}: a synthetic day</h2>
			<p>{preset.description}</p>
		</div>
		<div class="sow-glance-wrap" aria-busy={busy}>
			<dl class="sow-glance" aria-label="At a glance: wait to service start">
				{#each [{ label: 'MEAN', value: metrics?.mean }, { label: 'MEDIAN', value: metrics?.median }, { label: 'P90', value: metrics?.p90 }] as item (item.label)}
					<div>
						<dt>{item.label}</dt>
						<dd>{fmt(item.value)}<small> min</small></dd>
					</div>
				{/each}
			</dl>
			<p class="sow-glance-note">
				{busy
					? 'Previous snapshot while recalculating.'
					: `${metrics?.started ?? 0} service started · ${metrics?.waiting ?? 0} waiting · ${metrics?.abandoned ?? 0} abandoned`}
			</p>
		</div>
		<div class="sow-clock">
			<strong>{fmt(time)}<small> min</small></strong><span
				>{busy
					? 'Calculating the day…'
					: snapshot?.final
						? 'Closed arrivals cohort · resolved'
						: 'Seeded replay · provisional'}</span
			>
		</div>
	</div>
	{#if error}<p class="sow-error" role="alert">{error}</p>{/if}
	<div class="sow-workbench">
		<div class="sow-main" aria-busy={busy} bind:this={viewport}>
			{#if snapshot}
				<QueueStage {snapshot} settings={run?.settings ?? settings} {selected} onselect={select} />
				<div class="sow-transport">
					<button
						class="sow-solid"
						disabled={busy || still || time >= duration}
						onclick={() => (playing = !playing)}>{playing ? 'Pause' : 'Play'}</button
					>
					<button disabled={busy} onclick={restart}>Restart</button>
					<button
						disabled={busy}
						onclick={() => {
							playing = false;
							time = Math.min(duration, time + 5);
						}}>Step +5 min</button
					>
					<button disabled={busy} onclick={finish}>Run to result</button>
					<label
						>Speed<select aria-label="Playback speed" bind:value={speed}
							><option value={6}>6 min/s</option><option value={18}>18 min/s</option><option
								value={60}>60 min/s</option
							></select
						></label
					>
					<label class="sow-scrub"
						><span class="sow-meta">TIME</span><input
							aria-label="Simulated time"
							type="range"
							min="0"
							max={duration}
							step="0.1"
							value={time}
							oninput={(event) => {
								playing = false;
								time = +event.currentTarget.value;
							}}
						/></label
					>
					<button
						aria-pressed={following}
						disabled={!snapshot.oldest && !following}
						onclick={followOldest}>Follow the oldest</button
					>
				</div>
				{#if still}<p class="sow-population">
						Still mode · Use Step +5 min, the time slider or Run to result. The numerical model is
						unchanged.
					</p>{/if}
				<dl class="sow-dashboard" aria-label="Waiting time dashboard">
					{#each [{ label: 'MEAN', value: metrics?.mean, note: 'wait to service' }, { label: 'MEDIAN', value: metrics?.median, note: 'half wait less' }, { label: '90TH PERCENTILE', value: metrics?.p90, note: '10% wait longer*' }, { label: 'OLDEST WAITING', value: metrics?.oldestAge, note: 'still unresolved' }, { label: 'MAXIMUM', value: metrics?.max, note: 'service has started' }] as metric (metric.label)}
						<div class="sow-metric">
							<dt>{metric.label}</dt>
							<dd>
								{fmt(metric.value)}<small> min</small><small class="sow-metric-note"
									>{metric.note}</small
								>
							</dd>
						</div>
					{/each}
				</dl>
				<div class="sow-population">
					<span><strong>{metrics?.started}</strong> service started (n)</span><span
						><strong>{metrics?.waiting}</strong> still waiting</span
					><span><strong>{metrics?.active}</strong> in service</span><span
						><strong>{metrics?.completed}</strong> completed</span
					><span><strong>{metrics?.abandoned}</strong> abandoned</span><span
						><strong>{metrics?.noShows}</strong> no-shows</span
					>
				</div>
				<WaitDistribution
					{snapshot}
					{selected}
					onselect={select}
					max={commonScale}
					yMax={sharedY}
				/>
				<div class="sow-inspector" aria-live={playing ? 'off' : 'polite'}>
					<div>
						<span class="sow-ticket-label">ONE TICKET, ONE EXPERIENCE</span>
						<h3>{inspected ? `Ticket ${ticket(inspected.id)}` : 'Follow someone.'}</h3>
						<p>
							{inspected
								? `${inspected.state.replace('-', ' ')} · ${metrics?.classes.find((group) => group.classId === inspected.classId)?.label ?? 'Synthetic demand class'}`
								: 'Select a mark in the queue or distribution, or follow the person waiting longest.'}
						</p>
					</div>
					{#if inspected}<div class="sow-ticket-facts">
							<span>Arrived<strong>{fmt(inspected.arrival)} min</strong></span><span
								>{inspected.state === 'waiting'
									? 'Wait so far'
									: inspected.state === 'abandoned'
										? 'Wait before leaving'
										: 'Queue wait'}<strong>{fmt(inspected.wait)} min</strong></span
							><span
								>{inspected.state === 'waiting' || inspected.state === 'abandoned'
									? 'Outcome'
									: 'Overtaken'}<strong
									>{inspected.state === 'waiting'
										? 'Unresolved'
										: inspected.state === 'abandoned'
											? 'Left queue'
											: inspected.overtaken
												? 'Yes'
												: 'No'}</strong
								></span
							>
							{#if inspected.state === 'in-service' || inspected.state === 'completed'}<span
									>Own service work<strong>{fmt(inspected.service)} min</strong></span
								><span>Service started<strong>{fmt(inspected.start)} min</strong></span>{/if}
						</div>{/if}
				</div>
			{:else}<div class="sow-loading">
					<p>
						{error
							? 'No numerical result is available for this configuration. Change a setting to retry.'
							: 'Building a reproducible day, one event at a time…'}
					</p>
				</div>{/if}
		</div>
		<aside class="sow-controls" aria-label="Change the rule">
			<span class="sow-section-title">CHANGE THE RULE / SAME SEED</span>
			<div class="sow-control">
				<label
					><span>STAFF <output>{settings.servers} counters</output></span><input
						aria-label="Staff"
						type="range"
						min="1"
						max="8"
						step="1"
						value={settings.servers}
						oninput={(event) => update({ servers: +event.currentTarget.value })}
					/></label
				>
			</div>
			<div class="sow-control">
				<label
					><span>ARRIVAL RATE <output>{settings.arrivalRate}/hour</output></span><input
						aria-label="Arrival rate"
						type="range"
						min="1"
						max="240"
						step="1"
						value={settings.arrivalRate}
						oninput={(event) => update({ arrivalRate: +event.currentTarget.value })}
					/></label
				>
			</div>
			<div class="sow-control">
				<label
					><span>MEAN SERVICE <output>{settings.meanService} min</output></span><input
						aria-label="Mean service duration"
						type="range"
						min="0.1"
						max="120"
						step="0.1"
						value={settings.meanService}
						oninput={(event) => update({ meanService: +event.currentTarget.value })}
					/></label
				>
			</div>
			<div class="sow-control">
				<label
					><span>VARIABILITY <output>CV {settings.variability}</output></span><input
						aria-label="Service variability"
						type="range"
						min="0"
						max="3"
						step="0.05"
						value={settings.variability}
						oninput={(event) => update({ variability: +event.currentTarget.value })}
					/></label
				><small>Expected service mean stays fixed. A finite day can fluctuate.</small>
			</div>
			<div class="sow-control">
				<label
					><span>QUEUE DISCIPLINE</span><select
						aria-label="Queue discipline"
						value={settings.policy}
						onchange={(event) => update({ policy: event.currentTarget.value as Policy })}
						>{#each Object.entries(POLICY_LABELS) as [value, label] (value)}<option {value}
								>{label}</option
							>{/each}</select
					></label
				>
			</div>
			<button class="sow-solid" disabled={busy || !run} onclick={keepBaseline}
				>Keep as baseline</button
			>
			<details>
				<summary>Advanced settings & assumptions</summary>
				<div class="sow-control">
					<label
						><span>ARRIVALS WINDOW <output>{settings.window} min</output></span><input
							aria-label="Arrivals window"
							type="range"
							min="10"
							max="360"
							step="1"
							value={settings.window}
							oninput={(event) => update({ window: +event.currentTarget.value })}
						/></label
					>
				</div>
				<div class="sow-control">
					<label
						><span>SEED</span><input
							aria-label="Seed"
							type="number"
							min="1"
							max="2147483647"
							value={settings.seed}
							onchange={(event) => update({ seed: +event.currentTarget.value })}
						/></label
					>
				</div>
				<label class="sow-check"
					><input
						type="checkbox"
						checked={settings.burst}
						onchange={(event) => update({ burst: event.currentTarget.checked })}
					/>Concentrated arrivals</label
				>
				<div class="sow-control">
					<label
						><span
							>PATIENCE <output
								>{settings.patience ? `${settings.patience} min mean` : 'Unlimited'}</output
							></span
						><input
							aria-label="Patience"
							type="range"
							min="0"
							max="240"
							step="1"
							value={settings.patience}
							oninput={(event) => update({ patience: +event.currentTarget.value })}
						/></label
					><small>Zero means nobody abandons. Abandonment is a separate outcome.</small>
				</div>
				{#if settings.scenario === 'clinic'}<div class="sow-control">
						<label
							><span>NO-SHOW RATE <output>{pct(settings.noShow)}</output></span><input
								aria-label="No-show rate"
								type="range"
								min="0"
								max="0.8"
								step="0.01"
								value={settings.noShow}
								oninput={(event) => update({ noShow: +event.currentTarget.value })}
							/></label
						><small>Missed appointments never join; capacity is released immediately.</small>
					</div>{/if}
				<div class="sow-control">
					<label
						><span>BATCH SIZE <output>{settings.batchSize}</output></span><input
							aria-label="Batch size"
							type="range"
							min="1"
							max="12"
							step="1"
							value={settings.batchSize}
							oninput={(event) => update({ batchSize: +event.currentTarget.value })}
						/></label
					>
				</div>
				{#if settings.batchSize > 1}<div class="sow-control">
						<label
							><span>BATCH TIMEOUT <output>{settings.batchDelay} min</output></span><input
								aria-label="Batch timeout"
								type="range"
								min="0"
								max="60"
								step="0.1"
								value={settings.batchDelay}
								oninput={(event) => update({ batchDelay: +event.currentTarget.value })}
							/></label
						>
					</div>
					<div class="sow-control">
						<label
							><span>SETUP PER BATCH <output>{settings.setupTime} min</output></span><input
								aria-label="Batch setup"
								type="range"
								min="0"
								max="30"
								step="0.1"
								value={settings.setupTime}
								oninput={(event) => update({ setupTime: +event.currentTarget.value })}
							/></label
						>
					</div>
					<p class="sow-note">
						A batch starts together and occupies one counter for setup plus the sum of its members’
						work. Partial batches flush at timeout, including after closing.
					</p>{/if}
				{#if settings.policy === 'aging'}<div class="sow-control">
						<label
							><span>PRIORITY STRENGTH <output>{settings.priorityStrength}</output></span><input
								aria-label="Priority strength"
								type="range"
								min="0"
								max="5"
								step="0.1"
								value={settings.priorityStrength}
								oninput={(event) => update({ priorityStrength: +event.currentTarget.value })}
							/></label
						><small>Priority weight trades against waiting age. Service is never interrupted.</small
						>
					</div>{/if}
				{#if settings.policy === 'aging'}<div class="sow-control">
						<label
							><span>AGEING INTERVAL <output>{settings.agingMinutes} min</output></span><input
								aria-label="Ageing interval"
								type="range"
								min="1"
								max="120"
								step="1"
								value={settings.agingMinutes}
								oninput={(event) => update({ agingMinutes: +event.currentTarget.value })}
							/></label
						>
					</div>{/if}
				<p class="sow-note">{preset.simplification}</p>
			</details>
		</aside>
	</div>
	<div class="sow-guides" aria-label="Guided experiments">
		<button onclick={() => guide('staff')} disabled={busy || settings.servers >= 8}
			><small>EXPERIMENT 01</small><strong>One more counter</strong><span
				>The same people. A little more capacity.</span
			></button
		><button onclick={() => guide('variation')} disabled={busy}
			><small>EXPERIMENT 02</small><strong>Same mean, more uncertainty</strong><span
				>Change the spread of service times.</span
			></button
		><button onclick={() => guide('tail')} disabled={busy}
			><small>EXPERIMENT 03</small><strong>Better average, worse tail</strong><span
				>A lower mean. A longer wait for someone.</span
			></button
		>
	</div>
	{#if baseline && baseSnapshot && snapshot}
		<section class="sow-comparison" aria-label="Paired queue comparison">
			<div class="sow-comparison-head">
				<div>
					<span class="sow-section-title">TWO VERSIONS OF THE SAME DAY</span>
					<h3>{comparisonMessage}</h3>
					<p class="sow-note">
						{paired
							? 'Paired synthetic demand · identical arrivals, work, classes and patience.'
							: 'Changed demand · the shared seed does not make these demand settings identical.'} Shared
						clock at {fmt(time)} minutes.
					</p>
				</div>
				<button onclick={closeComparison}>Close comparison</button>
			</div>
			<div class="sow-comparison-views">
				<div>
					<div class="sow-compare-title">
						<strong>A / {POLICY_LABELS[baseline.settings.policy]}</strong><span
							>{baseline.settings.servers} counters · CV {baseline.settings.variability} · seed {baseline
								.settings.seed}</span
						>
					</div>
					<QueueStage
						snapshot={baseSnapshot}
						settings={baseline.settings}
						{selected}
						onselect={select}
						compact
						label="Baseline queue"
					/><WaitDistribution
						snapshot={baseSnapshot}
						{selected}
						onselect={select}
						max={commonScale}
						yMax={sharedY}
						compact
						label="Baseline distribution"
					/>
				</div>
				<div>
					<div class="sow-compare-title">
						<strong>B / {POLICY_LABELS[settings.policy]}</strong><span
							>{settings.servers} counters · CV {settings.variability} · seed {settings.seed}</span
						>
					</div>
					<QueueStage
						{snapshot}
						{settings}
						{selected}
						onselect={select}
						compact
						label="Alternative queue"
					/><WaitDistribution
						{snapshot}
						{selected}
						onselect={select}
						max={commonScale}
						yMax={sharedY}
						compact
						label="Alternative distribution"
					/>
				</div>
			</div>
			<table>
				<caption class="sow-note"
					>{snapshot.final && baseSnapshot.final ? 'Closed-cohort results' : 'Provisional results'} ·
					waits among service starters, in minutes</caption
				><thead
					><tr
						><th>Measure</th><th>A / baseline</th><th>B / alternative</th><th>Change B − A</th></tr
					></thead
				><tbody
					>{#each [{ label: 'Mean', a: baseSnapshot.metrics.mean, b: metrics?.mean }, { label: 'Median', a: baseSnapshot.metrics.median, b: metrics?.median }, { label: 'P90', a: baseSnapshot.metrics.p90, b: metrics?.p90 }, { label: 'Maximum', a: baseSnapshot.metrics.max, b: metrics?.max }, { label: 'Abandoned (people)', a: baseSnapshot.metrics.abandoned, b: metrics?.abandoned }, { label: 'Unresolved (people)', a: baseSnapshot.metrics.waiting, b: metrics?.waiting }, { label: 'Class P90 gap', a: baseSnapshot.metrics.classGap, b: metrics?.classGap }] as row (row.label)}<tr
							><td>{row.label}</td><td>{fmt(row.a)}</td><td>{fmt(row.b)}</td><td
								>{row.a != null && row.b != null
									? `${row.b - row.a > 0 ? '+' : ''}${fmt(row.b - row.a)}`
									: '—'}</td
							></tr
						>{/each}</tbody
				>
			</table>
			{#if selected !== null}<p class="sow-note">
					Ticket {ticket(selected)} · A: {fmt(
						baseSnapshot.people.find((person) => person.id === selected)?.wait
					)} min · B: {fmt(inspected?.wait)} min. A dash means this ticket is not present at this time.
				</p>{/if}
		</section>
	{/if}
	{#if snapshot && metrics}
		<div class="sow-lower">
			<section class="sow-fairness" aria-label="Fairness measures">
				<span class="sow-section-title">WHO GETS THE SHORT END?</span>
				<h3>Fair by which measure?</h3>
				<table>
					<caption class="sow-note">Synthetic demand classes · service starters only</caption><thead
						><tr><th>Class</th><th>n</th><th>Median</th><th>P90</th></tr></thead
					><tbody
						>{#each metrics.classes as group (group.classId)}<tr
								><td>{group.label}</td><td>{group.n}</td><td>{fmt(group.median)}</td><td
									>{fmt(group.p90)}</td
								></tr
							>{/each}</tbody
					>
				</table>
				<p class="sow-note">
					Class P90 gap: <strong>{fmt(metrics.classGap)} min</strong>. Overtaken:
					<strong>{pct(metrics.overtakenRate)}</strong> of service starters were passed by a later arrival
					before they began service.
				</p>
				<p class="sow-note">
					Abandonment: <strong>{pct(metrics.abandonmentRate)}</strong> of people who joined; mean
					wait before leaving <strong>{fmt(metrics.meanAbandonWait)} min</strong>. No-shows never
					joined.
				</p>
				<p class="sow-note">
					Equal waits, arrival order and urgent priority are different objectives. These measures
					describe trade-offs; they do not settle them.
				</p>
			</section>
			<section class="sow-receipt" aria-label="Waiting receipt">
				<span class="sow-section-title">TAKE THE EVIDENCE WITH YOU</span>
				<h3>Your waiting receipt.</h3>
				<p>
					A small statistical plate of this exact day. Keep the configuration, compare the
					consequences, and let someone else replay it.
				</p>
				<p class="sow-note">
					Seed {settings.seed} · model {MODEL_VERSION} · {settings.window}-minute arrivals window · {snapshot.final
						? 'Resolved cohort'
						: `${metrics.waiting} unresolved waits at this snapshot`}. Maximum observed wait {fmt(
						metrics.max
					)} min.
				</p>
				<div class="sow-receipt-actions">
					<button disabled={busy} class="sow-solid" onclick={() => download('png')}
						>Download PNG</button
					><button disabled={busy} onclick={() => download('json')}>Download JSON</button><button
						disabled={busy}
						onclick={copyReplay}>Copy replay link</button
					>
				</div>
				<p class="sow-status" role="status">{message}</p>
				{#if shareLink}<label
						><span class="sow-note">Replay URL</span><input
							class="sow-share"
							aria-label="Replay URL"
							readonly
							value={shareLink}
							onclick={(event) => event.currentTarget.select()}
						/></label
					>{/if}
			</section>
		</div>
		<footer class="sow-footnote">
			Every mark is synthetic. Mean, median and P90 measure queue entry to service start, among n = {metrics.started}
			service starters; {metrics.started < 20
				? 'small sample — read quantiles cautiously. '
				: ''}*P90 uses type-7 linear interpolation at (n − 1) × 0.9; sample size and ties affect the
			fraction above it. Waiting ages are lower bounds, not completed waits. Initially empty finite
			sessions are not steady-state estimates. {run?.status === 'limit'
				? `COMPUTATIONAL LIMIT: ${run.limitReason}`
				: ''}
		</footer>
	{/if}
</div>
