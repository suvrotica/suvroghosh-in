<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import { resolveMotion } from '$lib/motion/preferences';
	import {
		COMPONENTS,
		SCENARIOS,
		compileRun,
		MODEL_VERSION,
		SOURCES,
		encodeReplay,
		decodeReplay,
		exchangeReceipt,
		type ComponentId,
		type ScenarioId,
		type Settings,
		type Lens
	} from '$lib/visualizations/openhie';
	import Instrument from './Instrument.svelte';
	let scenario = $state<ScenarioId>('success');
	let overrides = $state<Partial<Settings>>({});
	let step = $state(0);
	let lens = $state<Lens>('patient');
	let mode = $state<'guided' | 'explore'>('guided');
	let selected = $state<ComponentId | null>(null);
	let inspectedTransaction = $state<string | null>(null);
	let playing = $state(false);
	let started = $state(false);
	let still = $state(false);
	let visible = $state(true);
	let speed = $state(1);
	let notice = $state('');
	let host: HTMLDivElement;
	const run = $derived(compileRun(scenario, overrides));
	const snapshot = $derived(run.snapshots[Math.min(step, run.snapshots.length - 1)]);
	const preset = $derived(SCENARIOS.find((item) => item.id === scenario)!);
	const component = $derived(
		COMPONENTS.find((item) => item.id === (selected ?? snapshot.activeComponent))!
	);
	const transaction = $derived(
		snapshot.trace.find((event) => event.id === inspectedTransaction) ?? snapshot.trace.at(-1)
	);
	const blocked = $derived(['blocked', 'denied', 'unavailable'].includes(snapshot.status));
	const chapterNames = [
		'Find the person',
		'Preserve the meaning',
		'Share selected information',
		'Retrieve it elsewhere'
	];
	const settingLabels: { key: keyof Settings; title: string; detail: string }[] = [
		{
			key: 'identityKnown',
			title: 'Identity link confirmed',
			detail: 'A reviewed link exists between the local and exchange identities.'
		},
		{
			key: 'terminologyMapped',
			title: 'Lab-code mapping available',
			detail: 'An explicit versioned teaching mapping is configured.'
		},
		{
			key: 'authorized',
			title: 'Hospital B may read',
			detail: 'This example policy permits the hospital’s clinical query.'
		},
		{
			key: 'serviceAvailable',
			title: 'Shared-record service available',
			detail: 'This preset fails before commit when the service is unavailable.'
		}
	];
	function chooseScenario(id: ScenarioId) {
		playing = false;
		scenario = id;
		overrides = {};
		step = 0;
		started = false;
		selected = null;
		inspectedTransaction = null;
		notice = '';
	}
	function seek(value: number) {
		playing = false;
		step = Math.min(Math.max(0, Math.floor(value)), run.snapshots.length - 1);
		inspectedTransaction = null;
	}
	function play() {
		if (still) return;
		started = true;
		if (step >= run.snapshots.length - 1) step = 0;
		playing = !playing;
	}
	function retry() {
		playing = false;
		const previousStep = step;
		const gate: keyof Settings | undefined =
			snapshot.activeComponent === 'client'
				? 'identityKnown'
				: snapshot.activeComponent === 'terminology'
					? 'terminologyMapped'
					: snapshot.status === 'unavailable'
						? 'serviceAvailable'
						: snapshot.status === 'denied'
							? 'authorized'
							: undefined;
		if (!gate) return;
		overrides = { ...overrides, [gate]: true };
		step = previousStep;
		notice =
			'The configured prerequisite is now satisfied. Continue the same synthetic journey; earlier events retain their identifiers.';
	}
	function changeSetting(key: keyof Settings, checked: boolean) {
		playing = false;
		overrides = { ...overrides, [key]: checked };
		step = 0;
		notice =
			'One condition changed. The same patient and source events are replayed from the beginning.';
	}
	function download() {
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(exchangeReceipt(run, step), null, 2)], { type: 'application/json' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = `openhie-${scenario}-event-${step}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}
	async function share() {
		const url = new SvelteURL(location.href);
		url.search = encodeReplay(scenario, run.settings, step);
		url.hash = 'exchange';
		// Keep SvelteKit's navigation/scroll state while adding this local replay selection.
		history.replaceState(history.state, '', url);
		try {
			await navigator.clipboard.writeText(url.toString());
			notice = 'Replay link copied. It reproduces these synthetic settings and this event.';
		} catch {
			notice = `Replay link: ${url.toString()}`;
		}
	}
	onMount(() => {
		const saved = decodeReplay(location.search);
		if (saved) {
			scenario = saved.scenario;
			overrides = saved.settings;
			step = Math.min(saved.step, compileRun(saved.scenario, saved.settings).snapshots.length - 1);
			started = true;
		}
		const media = matchMedia('(prefers-reduced-motion: reduce)');
		const motion = () => {
			still = resolveMotion(document.documentElement.dataset.motion, media.matches) === 'still';
			if (still) playing = false;
		};
		motion();
		const preferenceObserver = new MutationObserver(motion);
		preferenceObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		media.addEventListener('change', motion);
		const observer = new IntersectionObserver(
			(entries) => {
				visible = entries[0]?.isIntersecting ?? false;
				if (!visible) playing = false;
			},
			{ threshold: 0.05 }
		);
		observer.observe(host);
		const visibility = () => {
			if (document.hidden) playing = false;
		};
		document.addEventListener('visibilitychange', visibility);
		return () => {
			preferenceObserver.disconnect();
			media.removeEventListener('change', motion);
			observer.disconnect();
			document.removeEventListener('visibilitychange', visibility);
		};
	});
	$effect(() => {
		if (!playing || still || !visible) return;
		if (step >= run.snapshots.length - 1 || blocked) {
			playing = false;
			return;
		}
		const timer = setTimeout(() => {
			step += 1;
			inspectedTransaction = null;
		}, 6500 / speed);
		return () => clearTimeout(timer);
	});
</script>

<div
	class="ohie-runtime"
	id="exchange"
	bind:this={host}
	data-ohie-ready="true"
	data-step={step}
	data-status={snapshot.status}
	data-scenario={scenario}
	data-still={still}
>
	<div class="ohie-toolbar">
		<label class="ohie-scenario"
			><span class="ohie-kicker">CHANGE THE QUESTION</span><span class="ohie-sr">Scenario</span
			><select
				aria-label="Scenario"
				value={scenario}
				onchange={(event) => chooseScenario(event.currentTarget.value as ScenarioId)}
				>{#each SCENARIOS as item (item.id)}<option value={item.id}>{item.title}</option
					>{/each}</select
			></label
		>
		<p>{preset.description}</p>
		<div class="ohie-segment" role="group" aria-label="Learning mode">
			<button type="button" aria-pressed={mode === 'guided'} onclick={() => (mode = 'guided')}
				>Guided</button
			><button
				type="button"
				aria-pressed={mode === 'explore'}
				onclick={() => {
					mode = 'explore';
					playing = false;
				}}>Explore</button
			>
		</div>
	</div>
	{#if mode === 'explore'}
		<fieldset class="ohie-settings">
			<legend>Change one agreement. Replay the same person.</legend
			>{#each settingLabels as setting (setting.key)}<label
					><input
						type="checkbox"
						checked={run.settings[setting.key]}
						onchange={(event) => changeSetting(setting.key, event.currentTarget.checked)}
					/><span><strong>{setting.title}</strong><small>{setting.detail}</small></span></label
				>{/each}
		</fieldset>
	{/if}
	<div class="ohie-capture">
		<div class="ohie-figure-heading">
			<span>FIG. 01 / THE EXCHANGE INSTRUMENT</span><span>OPENHIE · A PATIENT BETWEEN SYSTEMS</span>
		</div>
		<div class="ohie-stage-layout">
			<div class="ohie-stage">
				<Instrument {snapshot} {selected} onselect={(id) => (selected = id)} />
				<p class="ohie-machine-note">
					An explanatory machine. Inspect its responsibilities with the component list below.
				</p>
			</div>
			<aside class="ohie-patient" aria-label="Asha’s information journey">
				<div class="ohie-patient-head">
					<span class="ohie-person" aria-hidden="true">A</span>
					<div>
						<span class="ohie-kicker">THE PERSON IN THIS SYSTEM</span>
						<h2>Asha</h2>
						<span>Fictional patient / two institutions</span>
					</div>
				</div>
				<p class="ohie-patient-thought">{snapshot.patient}</p>
				<dl class="ohie-patient-facts">
					<div>
						<dt>Identity</dt>
						<dd>
							{snapshot.identity.state === 'linked'
								? 'Linked across systems'
								: snapshot.identity.state === 'review'
									? 'Waiting for review'
									: 'Local identity only'}
						</dd>
					</div>
					<div>
						<dt>In the shared record</dt>
						<dd>
							{snapshot.persistedCount} selected event{snapshot.persistedCount === 1 ? '' : 's'}
						</dd>
					</div>
					<div>
						<dt>Delivered to Hospital B</dt>
						<dd>
							{snapshot.returnedEvents.length} clinical event{snapshot.returnedEvents.length === 1
								? ''
								: 's'}
						</dd>
					</div>
				</dl>
				<div class="ohie-next">
					<span class="ohie-kicker">WHAT HAPPENS NEXT</span>
					<p>{snapshot.nextAction}</p>
				</div>
			</aside>
		</div>
		<div class="ohie-readout" data-readout>
			<span class="ohie-status" data-status={snapshot.status}
				>{snapshot.status === 'blocked'
					? 'REVIEW REQUIRED'
					: snapshot.status === 'unavailable'
						? 'SERVICE UNAVAILABLE'
						: snapshot.status.toUpperCase()}</span
			><span>{snapshot.title}</span><span>{snapshot.transactionStatus.replaceAll('-', ' ')}</span>
		</div>
	</div>
	<div class="ohie-transport">
		<div class="ohie-playback">
			<button type="button" class="ohie-primary" disabled={still} onclick={play}
				>{playing ? 'Pause' : !started && !still ? 'Start guided tour' : 'Play'}</button
			><button
				type="button"
				aria-label="Previous event"
				disabled={step === 0}
				onclick={() => seek(step - 1)}>← <span>Previous</span></button
			><button
				type="button"
				aria-label="Next event"
				disabled={step >= run.snapshots.length - 1}
				onclick={() => seek(step + 1)}><span>Next event</span> →</button
			><button type="button" onclick={() => chooseScenario(scenario)}>Reset</button>
		</div>
		<label class="ohie-speed"
			>Pace <select aria-label="Animation speed" bind:value={speed}
				><option value={0.5}>½×</option><option value={1}>1×</option><option value={2}>2×</option
				></select
			></label
		>
		<span class="ohie-small"
			>{still
				? 'Still mode · step through at your own pace'
				: 'Playback pace changes the picture, not the result.'}</span
		>
	</div>
	<div class="ohie-timeline">
		<label
			><span>Journey event <strong>{step + 1} / {run.snapshots.length}</strong></span><input
				type="range"
				aria-label="Journey event"
				min="0"
				max={run.snapshots.length - 1}
				step="1"
				value={step}
				oninput={(event) => seek(Number(event.currentTarget.value))}
			/></label
		>
		<div class="ohie-chapters">
			{#each chapterNames as name, i (name)}<button
					type="button"
					class:current={snapshot.chapter === i}
					disabled={!run.snapshots.some((item) => item.chapter === i)}
					onclick={() => seek(run.snapshots.findIndex((item) => item.chapter === i))}
					><span>0{i + 1}</span>{name}</button
				>{/each}
		</div>
	</div>
	<div class="ohie-explanation" aria-live="polite" aria-atomic="true">
		<div>
			<span class="ohie-kicker">{chapterNames[snapshot.chapter]} / EVENT {step + 1}</span>
			<h2>{snapshot.title}</h2>
			<p>{snapshot.explanation}</p>
		</div>
		<div class="ohie-why">
			<span class="ohie-kicker">WHY THIS STEP EXISTS</span>
			<p>{snapshot.why}</p>
			<span class="ohie-kicker">WHAT CHANGED</span>
			<p>{snapshot.changed}</p>
		</div>
		{#if blocked}<div class="ohie-recovery">
				<p>{snapshot.nextAction}</p>
				<button type="button" class="ohie-primary" onclick={retry}>Resolve and retry</button><small
					>This applies the declared prerequisite in a synthetic case. The button represents a
					decision made elsewhere by an authorized person.</small
				>
			</div>{/if}
	</div>
	<div class="ohie-lensbar">
		<span class="ohie-kicker">THREE VIEWS / ONE EVENT HISTORY</span>
		<div class="ohie-segment" role="group" aria-label="Perspective">
			{#each ['patient', 'clinician', 'architect'] as view (view)}<button
					type="button"
					aria-pressed={lens === view}
					onclick={() => (lens = view as Lens)}>{view[0].toUpperCase() + view.slice(1)}</button
				>{/each}
		</div>
	</div>
	<div class="ohie-lens">
		<p>{snapshot[lens]}</p>
		{#if lens === 'architect'}<div class="ohie-id-links">
				<span>CLINIC A<br /><code>{snapshot.identity.clinicLocalId}</code></span><span
					>EXCHANGE IDENTITY<br /><code>{snapshot.identity.exchangeId ?? 'unresolved'}</code></span
				><span>HOSPITAL B<br /><code>{snapshot.identity.hospitalLocalId}</code></span>
			</div>
			<div class="ohie-payloads">
				<div>
					<h3>Current response or operation payload</h3>
					<pre data-ohie-response>{JSON.stringify(snapshot.payload, null, 2)}</pre>
				</div>
				<div>
					<h3>Selected transaction</h3>
					<label
						>Event <select
							aria-label="Inspect transaction"
							value={transaction?.id ?? ''}
							onchange={(event) => (inspectedTransaction = event.currentTarget.value)}
							>{#each snapshot.trace as item (item.id)}<option value={item.id}
									>{item.id} · {item.direction}</option
								>{/each}</select
						></label
					>
					<p>{transaction?.summary ?? 'No exchange has been sent.'}</p>
					{#if transaction}<p class="ohie-transaction-route">
							<strong>{transaction.direction}</strong> · {COMPONENTS.find(
								(part) => part.id === transaction.from
							)?.title} → {COMPONENTS.find((part) => part.id === transaction.to)?.title}<br
							/>Outcome: {transaction.status}
						</p>{/if}
					<pre>{JSON.stringify(transaction?.payload ?? null, null, 2)}</pre>
				</div>
			</div>{/if}
	</div>
	<div class="ohie-components">
		<div class="ohie-components-heading">
			<span class="ohie-kicker">INSIDE THE INSTRUMENT</span>{#if selected}<button
					type="button"
					class="ohie-text-button"
					onclick={() => (selected = null)}>Follow active part</button
				>{/if}
		</div>
		<div class="ohie-component-list">
			{#each COMPONENTS as item, i (item.id)}<button
					type="button"
					aria-label={item.title}
					aria-pressed={component.id === item.id}
					onclick={() => (selected = item.id)}
					><span>{String(i + 1).padStart(2, '0')}</span>{item.title}</button
				>{/each}
		</div>
		<div class="ohie-component-detail">
			<div>
				<span class="ohie-kicker">{component.title}</span>
				<h3>{component.plain}</h3>
				<p>{component.role}</p>
			</div>
			<div>
				<span class="ohie-kicker">THE MECHANISM AND ITS LIMIT</span>
				<p>{component.metaphor}</p>
				<p>{component.limits}</p>
			</div>
		</div>
	</div>
	<details class="ohie-records">
		<summary>Inspect the records and their provenance</summary>
		<p>
			The source originals, shared copies and Hospital B’s returned subset are separate collections
			in this synthetic model.
		</p>
		<div class="ohie-record-columns">
			{#each [{ title: 'Local source originals', records: snapshot.localEvents }, { title: 'Shared clinical subset', records: snapshot.sharedEvents }, { title: 'Returned to Hospital B', records: snapshot.returnedEvents }] as collection (collection.title)}<section
				>
					<h3>{collection.title} · {collection.records.length}</h3>
					{#each collection.records as record (record.id)}<details>
							<summary>{record.title}</summary>
							<pre>{JSON.stringify(record, null, 2)}</pre>
						</details>{:else}<p>No clinical events in this collection.</p>{/each}
				</section>{/each}
		</div>
	</details>
	<details class="ohie-assumptions">
		<summary>Model assumptions, wider architecture and sources</summary>
		<p>
			OpenHIE Architecture Specification 5.2 is the architectural reference. This is a local
			teaching implementation, with fictional people, codes, policies and times. It is not a
			healthcare system or a conformance test.
		</p>
		<ul>
			{#each run.assumptions as assumption (assumption)}<li>{assumption}</li>{/each}
		</ul>
		<p>
			The wider OpenHIE architecture also describes health management information, logistics,
			product catalogue, and finance and insurance services. They have separate purposes and are
			outside this selected clinical save/query journey.
		</p>
		<p>
			The machine’s carriage is a progress indicator. Its length is not network distance or elapsed
			clinical time. Its drawers stand for a selected shared subset; retrieving a copy does not
			empty them.
		</p>
		<ul>
			{#each SOURCES as source (source.url)}<li>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Allowlisted absolute links to official OpenHIE sources. -->
					<a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
				</li>{/each}
		</ul>
	</details>
	<footer class="ohie-receipt">
		<div>
			<span class="ohie-kicker">TAKE THE ACCOUNT WITH YOU</span>
			<p>These settings. This event. The assumptions attached.</p>
		</div>
		<button type="button" onclick={download}>Download exchange receipt</button><button
			type="button"
			onclick={share}>Copy replay link</button
		><span>{MODEL_VERSION}</span>
	</footer>
	{#if notice}<p class="ohie-notice" role="status">{notice}</p>{/if}
</div>
