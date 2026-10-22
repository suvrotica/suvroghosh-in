<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import { resolveMotion } from '$lib/motion/preferences';
	import {
		BEATS,
		compileScenario,
		DEFAULT_SETTINGS,
		MODEL_VERSION,
		type Settings,
		type TaskId
	} from '$lib/visualizations/the-six-week-shadow/model';
	import {
		decodeSettings,
		encodeSettings
	} from '$lib/visualizations/the-six-week-shadow/url-state';
	import ShadowScene from './ShadowScene.svelte';
	import ConsequenceObject from './ConsequenceObject.svelte';
	let settings = $state<Settings>({ ...DEFAULT_SETTINGS, changed: false });
	let beat = $state(0);
	let selected = $state('A');
	let emphasis = $state<'all' | 'work' | 'wait'>('all');
	let showPrerequisites = $state(false);
	let explore = $state(false);
	let playing = $state(false);
	let still = $state(false);
	let visible = $state(true);
	let pageVisible = $state(true);
	let replayDay = $state<number | null>(null);
	let speed = $state(1);
	let notice = $state('');
	let host: HTMLDivElement;
	let scene: { renderReplayMarker: (day: number) => void } | undefined;
	let replayReadout: HTMLSpanElement;
	let replayClock = 0;
	const schedule = $derived(compileScenario(settings));
	const task = $derived(schedule.tasks.find((t) => t.id === selected) ?? schedule.tasks[0]);
	const waitingDays = $derived(
		schedule.tasks.filter((t) => t.kind === 'wait').reduce((s, t) => s + t.durationWorkingDays, 0)
	);
	const description = $derived(
		!settings.changed
			? 'No change proposed. The existing business continues; this ruler concerns only the proposed change project.'
			: `${settings.scenario === 'batch' ? 'Next production batch' : 'One workshop prototype'}: ${schedule.elapsedWorkingDays} elapsed working days, ${schedule.activeEffortPersonDays} person-days of active effort. ${waitingDays} days waiting for slots. Some days contain work. Other days contain waiting.`
	);
	function stop() {
		playing = false;
	}
	function move() {
		stop();
		settings = { ...settings, changed: !settings.changed };
		selected = 'A';
		showPrerequisites = false;
		beat = 0;
		replayDay = null;
		notice = '';
		if (settings.changed && !still && !explore) {
			replayClock = 0;
			replayDay = 0;
			playing = true;
		}
	}
	function chooseBeat(value: number) {
		stop();
		beat = Math.max(0, Math.min(4, value));
		selected = BEATS[beat].task;
		showPrerequisites = false;
		replayDay = null;
	}
	function inspect(id: TaskId | string) {
		stop();
		selected = id;
		showPrerequisites = false;
	}
	function updateWait(key: 'supplierWait' | 'productionWait', raw: string) {
		const n = Number(raw);
		const max = key === 'supplierWait' ? 20 : 15;
		if (!Number.isFinite(n)) return;
		stop();
		replayDay = null;
		settings = { ...settings, [key]: Math.min(max, Math.max(0, Math.round(n))) };
	}
	function scenario(value: 'batch' | 'prototype') {
		stop();
		replayDay = null;
		settings = { ...settings, scenario: value };
		selected = value === 'prototype' ? 'B' : 'H';
		showPrerequisites = false;
	}
	function reset() {
		stop();
		settings = { ...DEFAULT_SETTINGS, changed: false };
		beat = 0;
		selected = 'A';
		emphasis = 'all';
		explore = false;
		showPrerequisites = false;
		replayDay = null;
		notice = 'Workshop reset. No change proposed.';
	}
	function play() {
		if (playing) {
			stop();
			return;
		}
		if (!settings.changed) settings = { ...settings, changed: true };
		if (still) {
			beat = 4;
			replayDay = null;
			notice =
				'Still mode shows the complete state immediately. Use Previous and Next to read each beat.';
			return;
		}
		if (replayDay === null || replayDay >= schedule.elapsedWorkingDays) {
			replayClock = 0;
			replayDay = 0;
			beat = 0;
		}
		explore = false;
		playing = true;
	}
	function skip() {
		stop();
		explore = true;
		beat = 4;
		replayDay = null;
		notice = 'The complete workshop is available.';
	}
	async function copyReplay() {
		const url = new SvelteURL(location.href);
		url.search = '';
		url.search = encodeSettings(settings);
		try {
			await navigator.clipboard.writeText(url.href);
			notice = 'Replay link copied. It restores the same scenario and wait settings.';
		} catch {
			notice = 'The browser could not copy the replay link. Your settings remain here.';
		}
	}
	onMount(() => {
		const saved = decodeSettings(location.search);
		if (saved) {
			settings = saved;
			beat = 4;
			explore = true;
		}
		const media = matchMedia('(prefers-reduced-motion: reduce)');
		const motion = () => {
			still = resolveMotion(document.documentElement.dataset.motion, media.matches) === 'still';
			if (still) {
				stop();
				replayDay = null;
			}
		};
		motion();
		media.addEventListener('change', motion);
		const preference = new MutationObserver(motion);
		preference.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		const observer = new IntersectionObserver(
			(entries) => {
				visible = entries.at(-1)?.isIntersecting ?? false;
			},
			{ threshold: 0.01 }
		);
		observer.observe(host);
		const visibility = () => {
			pageVisible = !document.hidden;
		};
		visibility();
		document.addEventListener('visibilitychange', visibility);
		return () => {
			media.removeEventListener('change', motion);
			preference.disconnect();
			observer.disconnect();
			document.removeEventListener('visibilitychange', visibility);
		};
	});
	$effect(() => {
		if (!playing || still || !visible || !pageVisible) return;
		const end = schedule.elapsedWorkingDays;
		if (!end) return;
		let frame = 0,
			previous = 0;
		function tick(now: number) {
			const dt = previous ? Math.min((now - previous) / 1000, 0.1) : 0;
			previous = now;
			replayClock = Math.min(end, replayClock + ((dt * end) / 15) * speed);
			// Per-frame interpolation belongs to owned DOM refs. Reactive task and
			// chapter state changes only at meaningful whole-day/beat boundaries.
			scene?.renderReplayMarker(replayClock);
			if (replayReadout)
				// eslint-disable-next-line svelte/no-dom-manipulating -- Presentation-only owned text ref; model totals and live announcements stay in Svelte state.
				replayReadout.textContent = `Compressed replay · working day ${replayClock.toFixed(1)} of ${end}.`;
			const settledDay = Math.floor(replayClock);
			if (replayDay !== settledDay) replayDay = settledDay;
			const nextBeat = Math.min(4, Math.floor((replayClock / end) * 5));
			if (beat !== nextBeat) beat = nextBeat;
			if (replayClock >= end) {
				playing = false;
				replayDay = null;
				beat = 4;
				notice = 'Reveal complete. Inspect any task or adjust the waits.';
				return;
			}
			frame = requestAnimationFrame(tick);
		}
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});
</script>

<div class="shadow-runtime" bind:this={host} data-maker-ready="true" data-still={still}>
	<div data-maker-capture class="shadow-capture">
		<header class="shadow-masthead">
			<p class="shadow-eyebrow">THE EVERYDAY SYSTEMS LABORATORY / 02</p>
			<div class="shadow-heading-row">
				<h1>A ten-minute idea.<br /><em>A six-week shadow.</em></h1>
				<p>
					It took ten minutes to suggest moving the button. What happens before we can send the next
					batch?
				</p>
			</div>
			<span class="shadow-fiction"
				>A fictional dependency model. Thirty working days is the default scenario, not an industry
				benchmark.</span
			>
		</header>
		<div class="shadow-opening-controls">
			<button type="button" class="shadow-primary" onclick={move}
				>{settings.changed ? 'Restore the old position' : 'Move the button'}</button
			>
			<p>
				{settings.changed
					? 'The button moved. Its obligations travelled further.'
					: 'Start with the lamp. Make the small change.'}
			</p>
			<button type="button" onclick={skip}>Explore the complete workshop</button>
		</div>
		<ShadowScene
			bind:this={scene}
			{schedule}
			changed={settings.changed}
			{selected}
			{emphasis}
			beat={explore ? 4 : beat}
			{replayDay}
			{still}
			onselect={inspect}
		/>
		<div class="shadow-headlines" aria-label="Model results">
			<div>
				<span>{settings.changed ? 'ELAPSED TIME' : 'CHANGE PROJECT'}</span><strong
					data-shadow-elapsed>{settings.changed ? schedule.elapsedWorkingDays : 'No change'}</strong
				><small>{settings.changed ? 'working days' : 'proposed'}</small>
			</div>
			<div>
				<span>ACTIVE EFFORT</span><strong data-shadow-effort
					>{settings.changed ? schedule.activeEffortPersonDays : '—'}</strong
				><small>{settings.changed ? 'person-days' : 'No proposed-change schedule'}</small>
			</div>
			<div>
				<span>WAITING FOR SLOTS</span><strong>{settings.changed ? waitingDays : '—'}</strong><small
					>{settings.changed
						? 'working days · no added labour'
						: 'The existing business continues'}</small
				>
			</div>
		</div>
	</div>
	<p class="shadow-account" aria-live="polite">{description}</p>
	{#if settings.changed}<p class="shadow-effort-note">
			{schedule.activeEffortPersonDays === 20
				? "Twenty days of one person's work, shared across the people assumed in this scenario."
				: "Five days of one person's work in this workshop prototype."} Effort and elapsed time answer
			different questions.
		</p>{/if}
	<div class="shadow-guidance">
		<div class="shadow-beat-menu" aria-label="Story beats">
			{#each BEATS as item, i (item.title)}<button
					type="button"
					class:chosen={beat === i && !explore}
					aria-current={beat === i && !explore ? 'step' : undefined}
					onclick={() => {
						explore = false;
						chooseBeat(i);
					}}><span>0{i + 1}</span>{item.title}</button
				>{/each}
		</div>
		<article class="shadow-beat-copy">
			<span class="shadow-eyebrow">{explore ? 'THE WHOLE WORKSHOP' : `BEAT ${beat + 1} OF 5`}</span>
			<h3>{BEATS[beat].question}</h3>
			<p>{BEATS[beat].text}</p>
			{#if beat === 0}<div class="shadow-cutaway">
					<div>
						<span>Before</span><i class="cutaway-old"></i><strong>Opening at the shade</strong
						><small>Route reaches the old switch seat.</small>
					</div>
					<div>
						<span>After</span><i class="cutaway-new"></i><strong>Opening at the base</strong><small
							>Base opening and internal route change together.</small
						>
					</div>
				</div>
				<p class="shadow-small">
					Schematic route comparison only; this fictional lamp is not electrical modification
					guidance.
				</p>{/if}
			<div class="shadow-navigation">
				<button type="button" onclick={() => chooseBeat(beat - 1)} disabled={beat === 0}
					>← Previous</button
				><button type="button" onclick={() => chooseBeat(beat + 1)} disabled={beat === 4}
					>Next →</button
				><button type="button" onclick={play}
					>{playing
						? 'Pause reveal'
						: still
							? 'Show complete state'
							: 'Replay short reveal'}</button
				><button type="button" onclick={skip}>Skip reveal</button><label
					>Replay speed <select bind:value={speed}
						><option value={0.5}>½×</option><option value={1}>1×</option><option value={2}
							>2×</option
						></select
					></label
				>
			</div>
			<p class="shadow-small">
				<span bind:this={replayReadout}
					>{playing
						? `Compressed replay · working day ${(replayDay ?? 0).toFixed(1)} of ${schedule.elapsedWorkingDays}.`
						: still
							? 'Still mode: the same states appear immediately.'
							: 'A full replay compresses the model into fifteen seconds at 1×.'}</span
				> You can inspect and read everything immediately.
			</p>
		</article>
	</div>
	<div class="shadow-explore-layout">
		<aside class="shadow-decisions">
			<h3>The same idea, at a different moment</h3>
			<div class="shadow-scenario" role="group" aria-label="Choose the change context">
				<button
					type="button"
					aria-pressed={settings.scenario === 'prototype'}
					class:chosen={settings.scenario === 'prototype'}
					onclick={() => scenario('prototype')}>One workshop prototype</button
				><button
					type="button"
					aria-pressed={settings.scenario === 'batch'}
					class:chosen={settings.scenario === 'batch'}
					onclick={() => scenario('batch')}>Next production batch</button
				>
			</div>
			<p>
				A prototype needs review and a checked sample. The batch also needs supplier preparation, a
				pilot, setup, references, support and release.
			</p>
			<fieldset disabled={settings.scenario === 'prototype'}>
				<legend>Change the waits</legend>
				<p>
					Whole working days. These settings affect the batch; the prototype does not include either
					wait.
				</p>
				{#each [{ key: 'supplierWait' as const, label: 'Supplier wait', max: 20 }, { key: 'productionWait' as const, label: 'Production wait', max: 15 }] as control (control.key)}<div
						class="shadow-wait-control"
					>
						<label for={`shadow-${control.key}`}
							>{control.label} <strong>{settings[control.key]} days</strong></label
						><input
							id={`shadow-${control.key}`}
							type="range"
							min="0"
							max={control.max}
							step="1"
							value={settings[control.key]}
							oninput={(e) => updateWait(control.key, e.currentTarget.value)}
						/><label class="shadow-number-label" for={`shadow-${control.key}-number`}
							>{control.label}, number</label
						><input
							id={`shadow-${control.key}-number`}
							type="number"
							min="0"
							max={control.max}
							step="1"
							value={settings[control.key]}
							oninput={(e) => updateWait(control.key, e.currentTarget.value)}
						/>
					</div>{/each}
			</fieldset>
			<div class="shadow-buttons">
				<button type="button" onclick={reset}>Reset default scenario</button><button
					type="button"
					onclick={copyReplay}>Copy replay link</button
				>
			</div>
			<p class="shadow-small">
				Reset puts the button back on the shade and restores the 10-day supplier and 5-day
				production waits.
			</p>
		</aside>
		<section class="shadow-task-section" aria-label="Task inspection">
			<div class="shadow-task-toolbar">
				<h3>Inspect the consequences</h3>
				<div role="group" aria-label="Visual emphasis only">
					{#each [{ value: 'all' as const, label: 'All' }, { value: 'work' as const, label: 'Work' }, { value: 'wait' as const, label: 'Waiting' }] as filter (filter.value)}<button
							type="button"
							aria-pressed={emphasis === filter.value}
							class:chosen={emphasis === filter.value}
							onclick={() => {
								emphasis = filter.value;
							}}>{filter.label}</button
						>{/each}
				</div>
			</div>
			<p class="shadow-small">
				Emphasis changes the drawing, never the task calculation. A solid edge marks the path that
				sets release time.
			</p>
			{#if settings.changed}<div class="shadow-task-list">
					{#each schedule.tasks as item (item.id)}<button
							type="button"
							class:chosen={selected === item.id}
							class:controlling={item.controlsCompletion}
							class:task-muted={emphasis !== 'all' && emphasis !== item.kind}
							aria-pressed={selected === item.id}
							onclick={() => inspect(item.id)}
							><span class:wait-mark={item.kind === 'wait'}>{item.id}</span><span
								><strong>{item.label}</strong><small
									>{item.kind === 'wait' ? 'Waiting' : 'Work'} · day {item.start}–{item.finish} · {item.effortPersonDays}
									person-days</small
								></span
							><span class="shadow-task-duration"
								>{item.durationWorkingDays}<small>days</small></span
							></button
						>{/each}
				</div>
				{#if task}<article class="shadow-task-detail">
						<ConsequenceObject taskId={task.id} label={task.label} />
						<span class="shadow-eyebrow"
							>TASK {task.id} / {task.controlsCompletion
								? 'SETS THE RELEASE PATH'
								: 'PARALLEL WORK'}</span
						>
						<h4>{task.label}</h4>
						<p>{task.description}</p>
						<p>
							<strong>Starts after day {task.start}; finishes at day {task.finish}.</strong>
							{task.effortPersonDays} person-days of illustrative effort.
						</p>
						<button
							type="button"
							aria-expanded={showPrerequisites}
							onclick={() => (showPrerequisites = !showPrerequisites)}
							>What must happen first?</button
						>{#if showPrerequisites}<p class="shadow-prerequisites">
								{task.dependencies.length
									? task.dependencies
											.map((id) => {
												const t = schedule.tasks.find((t) => t.id === id)!;
												return `${id}: ${t.label} (finished by day ${t.finish})`;
											})
											.join('; ')
									: 'Nothing in this change project. Review is the starting task.'}
							</p>{/if}
						<p class="shadow-small">
							{task.controlsCompletion
								? 'This task lies on the chain that currently sets the release time. Its latest prerequisite determines when it can begin.'
								: 'This work still adds effort and must finish before release. It sits outside the single path highlighted here; another required branch may finish later or at the same time.'}
						</p>
					</article>{/if}{:else}<div class="shadow-no-change">
					<strong>No change proposed</strong>
					<p>
						Move the button to create the change project. Existing production has its own work; this
						model describes only the consequences of the proposed edit.
					</p>
					<button type="button" class="shadow-primary" onclick={move}>Move the button</button>
				</div>{/if}
		</section>
	</div>
	<details class="shadow-assumptions">
		<summary>Show assumptions and the complete task model</summary>
		<p>
			Fictional local model · {MODEL_VERSION}. The ten-minute suggestion is inside the first day's
			review. Separate people are available for I and J in parallel. Person-days describe
			illustrative labour effort, not fees or measured production norms.
		</p>
		<p>
			Roots start at day zero. Each task starts when its latest prerequisite finishes. Release ends
			after {settings.scenario === 'batch' ? 'H' : 'B'}. A longer parallel branch would delay
			release if it finished later than the other prerequisites.
		</p>
		<div class="shadow-table-wrap">
			<table>
				<caption
					>Included tasks for the selected context {settings.changed
						? ''
						: 'if the change is proposed'}</caption
				><thead
					><tr
						><th>Task</th><th>Duration, working days</th><th>Effort, person-days</th><th
							>Requires</th
						></tr
					></thead
				><tbody
					>{#each compileScenario({ ...settings, changed: true }).tasks as item (item.id)}<tr
							><th scope="row">{item.id} · {item.label}</th><td>{item.durationWorkingDays}</td><td
								>{item.effortPersonDays}</td
							><td>{item.dependencies.join(', ') || 'Start'}</td></tr
						>{/each}</tbody
				>
			</table>
		</div>
		<p>
			Weekends, public holidays, existing backlog outside the two waits, rework, formal compliance
			and actual supplier performance are not modelled. Supplier time is waiting to begin bounded
			preparation, not a shipping guarantee. This fictional object is not a guide to modifying a
			real electrical product.
		</p>
	</details>
	<p class="shadow-closing">
		A small change travels through everything that already depends on the old version.
	</p>
	<p class="shadow-notice" role="status">{notice}</p>
</div>
