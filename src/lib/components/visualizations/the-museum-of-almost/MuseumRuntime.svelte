<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import Cabinet from './Cabinet.svelte';
	import CollectionLedger from './CollectionLedger.svelte';
	import Comparison from './Comparison.svelte';
	import SourceReferences from './SourceReferences.svelte';
	import { ARCHIVE } from '$lib/visualizations/the-museum-of-almost/fixtures';
	import {
		CLOSED_SELECTION,
		collectionLabel,
		collectionTally,
		decodeSelection,
		DEMONSTRATION_LABEL,
		encodeSelection,
		formatCost,
		normaliseSelection,
		OUTCOME_LABEL,
		selectSpecimen,
		type Selection,
		type View
	} from '$lib/visualizations/the-museum-of-almost/model';
	let host: HTMLElement;
	const tally = collectionTally(ARCHIVE);
	let selection = $state<Selection>({ ...CLOSED_SELECTION });
	let beat = $state(0);
	let cabinet: Cabinet;
	let progress = ARCHIVE.specimens.map(() => 0);
	let still = $state(true);
	let live = $state(`${tally.total} records. ${collectionLabel(ARCHIVE)}. Choose any drawer.`);
	let copyStatus = $state('');
	let compact = $state(false);
	let visible = false;
	let mounted = false;
	let frame = 0;
	let previousTime = 0;
	const current = $derived(
		ARCHIVE.specimens.find((record) => record.id === selection.selectedSpecimenId)
	);
	const selectedClaim = $derived(
		current &&
			[...current.observations, ...current.interpretations].find(
				(claim) => claim.id === selection.selectedClaimId
			)
	);
	const comparison = $derived(
		current?.onwardLinks.find((link) => link.id === selection.selectedComparisonId)
	);
	const comparisonTarget = $derived(
		ARCHIVE.targets.find((target) => target.id === comparison?.targetId)
	);
	const BEATS = [
		{
			title: 'The closed cabinet',
			question: 'Which of these left something useful behind?',
			note: 'Choose any drawer, or follow the five short steps. Every record can be explored in any order.'
		},
		{
			title: 'The promise',
			question: 'Meet the object. Then find the trouble spot.',
			note: 'A good intention is the beginning of a record. It does not tell us what actually happened.'
		},
		{
			title: 'The record',
			question: 'What do we actually know?',
			note: 'Keep an observed event, a possible explanation and an unknown in separate fields.'
		},
		{
			title: 'What happened next',
			question: 'Follow only the supported link.',
			note: `${tally.testedReuse} tested reuse; ${tally.untestedPossibilities} untested possibilities; ${tally.withoutDemonstratedReuse} records without demonstrated reuse. Each keeps its recorded ending.`
		},
		{
			title: 'The cost and the decision',
			question: 'What is the most defensible next step?',
			note: 'Keep what you can support. Leave the rest unresolved.'
		}
	];
	function stopFrame() {
		cancelAnimationFrame(frame);
		frame = 0;
		previousTime = 0;
	}
	function targetProgress(id = selection.selectedSpecimenId) {
		return ARCHIVE.specimens.map((record) => (record.id === id ? 1 : 0));
	}
	function animate(time: number) {
		frame = 0;
		if (!mounted || !visible || document.hidden) {
			previousTime = 0;
			return;
		}
		const target = targetProgress();
		if (still) {
			progress = target;
			cabinet?.setPose(progress);
			previousTime = 0;
			return;
		}
		const dt = previousTime ? Math.min(0.05, (time - previousTime) / 1000) : 0;
		previousTime = time;
		const oldOpen = progress.some((value, index) => value > 0 && target[index] === 0);
		progress = progress.map((value, index) =>
			target[index] === 0
				? Math.max(0, value - dt * 2.2)
				: oldOpen
					? value
					: Math.min(1, value + dt * 2.2)
		);
		cabinet?.setPose(progress);
		if (progress.some((value, index) => value !== target[index]))
			frame = requestAnimationFrame(animate);
		else previousTime = 0;
	}
	function requestTransition(targetId = selection.selectedSpecimenId, instant = still) {
		if (!mounted) return;
		if (instant) {
			stopFrame();
			progress = targetProgress(targetId);
			cabinet?.setPose(progress);
		} else if (visible && !document.hidden && !frame) frame = requestAnimationFrame(animate);
	}
	$effect(() => requestTransition(selection.selectedSpecimenId, still));
	function open(id: string) {
		selection = selectSpecimen(ARCHIVE, id);
		beat = 1;
		copyStatus = '';
		const record = ARCHIVE.specimens.find((item) => item.id === id)!;
		live = `${record.title}. ${record.contentStatus === 'demonstration' ? 'Fictional demonstration record.' : 'Verified record; see the public sources.'} ${OUTCOME_LABEL[record.outcome]}.`;
	}
	async function close() {
		const id = selection.selectedSpecimenId;
		selection = { ...CLOSED_SELECTION };
		beat = 0;
		live = `Drawer closed. ${tally.total} records remain available. ${collectionLabel(ARCHIVE)}.`;
		await tick();
		host.querySelector<HTMLButtonElement>(`[data-drawer="${id}"]`)?.focus();
	}
	function changeView(view: View) {
		selection = normaliseSelection(ARCHIVE, {
			...selection,
			activeView: view,
			selectedPartId: null,
			selectedClaimId: null,
			selectedComparisonId: null
		});
		beat = view === 'object' ? 1 : view === 'evidence' ? 2 : 3;
	}
	function tabKey(event: KeyboardEvent, view: View) {
		const views: View[] = ['object', 'evidence', 'aftermath'];
		const index = views.indexOf(view);
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? 2
					: event.key === 'ArrowRight'
						? (index + 1) % 3
						: event.key === 'ArrowLeft'
							? (index + 2) % 3
							: -1;
		if (next < 0) return;
		event.preventDefault();
		changeView(views[next]);
		host.querySelector<HTMLButtonElement>(`#ma-tab-${views[next]}`)?.focus();
	}
	function nextBeat(next: number) {
		beat = Math.max(0, Math.min(4, next));
		if (beat === 0) {
			void close();
			return;
		}
		if (!current) selection = selectSpecimen(ARCHIVE, ARCHIVE.specimens[0].id);
		selection = normaliseSelection(ARCHIVE, {
			...selection,
			activeView: beat === 1 ? 'object' : beat === 2 ? 'evidence' : 'aftermath',
			selectedPartId: null,
			selectedClaimId: null,
			selectedComparisonId: null
		});
	}
	function nextSpecimen(direction: number) {
		const index = ARCHIVE.specimens.findIndex((record) => record.id === current?.id);
		open(
			ARCHIVE.specimens[(index + direction + ARCHIVE.specimens.length) % ARCHIVE.specimens.length]
				.id
		);
	}
	async function share() {
		const encoded = encodeSelection(selection);
		if (!encoded) return;
		const url = new SvelteURL(location.href);
		url.searchParams.set('museum', encoded);
		url.hash = '';
		try {
			await navigator.clipboard.writeText(url.toString());
			copyStatus = 'Selection link copied.';
		} catch {
			copyStatus = 'The browser could not copy the link. Your selection remains open.';
		}
	}
	onMount(() => {
		mounted = true;
		const reduced = matchMedia('(prefers-reduced-motion: reduce)');
		const narrow = matchMedia('(max-width: 700px)');
		const motion = () => {
			still = reduced.matches || document.documentElement.dataset.motion === 'still';
			requestTransition();
		};
		const resize = () => {
			compact = narrow.matches;
		};
		const visibility = () => {
			if (document.hidden) stopFrame();
			else requestTransition();
		};
		const preference = new MutationObserver(motion);
		preference.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		const observer = new IntersectionObserver(
			(entries) => {
				visible = entries[entries.length - 1]?.isIntersecting ?? false;
				if (visible) requestTransition();
				else stopFrame();
			},
			{ threshold: 0.02 }
		);
		observer.observe(host);
		reduced.addEventListener('change', motion);
		narrow.addEventListener('change', resize);
		document.addEventListener('visibilitychange', visibility);
		motion();
		resize();
		selection = decodeSelection(ARCHIVE, new URL(location.href).searchParams.get('museum'));
		if (selection.selectedSpecimenId)
			beat = selection.activeView === 'object' ? 1 : selection.activeView === 'evidence' ? 2 : 3;
		return () => {
			mounted = false;
			stopFrame();
			observer.disconnect();
			preference.disconnect();
			reduced.removeEventListener('change', motion);
			narrow.removeEventListener('change', resize);
			document.removeEventListener('visibilitychange', visibility);
		};
	});
</script>

{#snippet openedRecord()}
	{#if current}
		<section class="ma-record" id="ma-open-record" aria-label={`${current.title} opened record`}>
			<div class="ma-record-heading">
				<div>
					<p class="ma-demonstration">
						{current.contentStatus === 'demonstration'
							? DEMONSTRATION_LABEL
							: 'Verified record — see explicit source provenance'}
					</p>
					<span class="ma-kicker"
						>RECORD {String(ARCHIVE.specimens.indexOf(current) + 1).padStart(2, '0')} / {current.version.toUpperCase()}</span
					>
					<h3>{current.title}</h3>
					<p class="ma-outcome">{OUTCOME_LABEL[current.outcome]}</p>
				</div>
				<button type="button" onclick={close} aria-label={`Close ${current.title} drawer`}
					>Close drawer ×</button
				>
			</div>
			<div class="ma-tabs" role="tablist" aria-label="Specimen views">
				{#each [['object', 'The object'], ['evidence', 'What do we actually know?'], ['aftermath', 'What happened next?']] as [view, label] (view)}
					<button
						role="tab"
						id={`ma-tab-${view}`}
						aria-selected={selection.activeView === view}
						aria-controls={`ma-panel-${view}`}
						tabindex={selection.activeView === view ? 0 : -1}
						onclick={() => changeView(view as View)}
						onkeydown={(event) => tabKey(event, view as View)}>{label}</button
					>
				{/each}
			</div>
			<div
				class="ma-panel"
				id={`ma-panel-${selection.activeView}`}
				role="tabpanel"
				aria-labelledby={`ma-tab-${selection.activeView}`}
				tabindex="0"
			>
				{#if selection.activeView === 'object'}
					<div class="ma-record-columns">
						<div>
							<span class="ma-kicker">THE PROMISE</span>
							<p class="ma-lead">{current.purpose}</p>
							<span class="ma-kicker">WHAT HAPPENED</span>
							<p>{current.observations[0].text}</p>
						</div>
						<div class="ma-trouble">
							<button
								type="button"
								aria-pressed={selection.selectedPartId === current.partId}
								onclick={() => {
									selection = normaliseSelection(ARCHIVE, {
										...selection,
										selectedPartId: selection.selectedPartId ? null : current!.partId
									});
								}}>Inspect the trouble spot</button
							>
							<h4>{current.partLabel}</h4>
							<p>
								{selection.selectedPartId
									? current.partExplanation
									: 'Open the inspection to highlight the relevant part and read what the drawing can establish.'}
							</p>
						</div>
					</div>
				{:else if selection.activeView === 'evidence'}
					<div class="ma-evidence-fields">
						<section>
							<h4>Observed</h4>
							{#each current.observations as claim (claim.id)}<button
									class="ma-claim"
									type="button"
									aria-pressed={selection.selectedClaimId === claim.id}
									onclick={() => {
										selection = normaliseSelection(ARCHIVE, {
											...selection,
											selectedClaimId: claim.id
										});
									}}>{claim.text}<span>Read the exact record →</span></button
								>{/each}
						</section>
						<section>
							<h4>Possible explanation</h4>
							{#each current.interpretations as claim (claim.id)}<button
									class="ma-claim"
									type="button"
									aria-pressed={selection.selectedClaimId === claim.id}
									onclick={() => {
										selection = normaliseSelection(ARCHIVE, {
											...selection,
											selectedClaimId: claim.id
										});
									}}>{claim.text}<span>Read its limits →</span></button
								>{:else}<p>No causal explanation is supplied.</p>{/each}
						</section>
						<section>
							<h4>Still unknown</h4>
							<ul>
								{#each current.unknowns as unknown (unknown)}<li>{unknown}</li>{/each}
							</ul>
						</section>
					</div>
					{#if selectedClaim}<aside class="ma-evidence-detail">
							<span class="ma-kicker"
								>{current.observations.some((claim) => claim.id === selectedClaim.id)
									? 'OBSERVATION'
									: 'INTERPRETATION · NOT AN ESTABLISHED CAUSE'}</span
							>
							<p>{selectedClaim.text}</p>
							{#each selectedClaim.evidenceIds as id (id)}{@const evidence = current.evidence.find(
									(item) => item.id === id
								)}{#if evidence}<p>
										<strong>{evidence.label} · {evidence.status}</strong><br />{evidence.summary}
									</p>
									<SourceReferences record={current} {evidence} />{/if}{/each}
						</aside>{/if}
					<details>
						<summary>All evidence records and alternatives</summary
						>{#each current.evidence as evidence (evidence.id)}<p>
								<strong>{evidence.label} · {evidence.status} · {evidence.purpose}</strong><br
								/>{evidence.summary}
							</p>
							<SourceReferences
								record={current}
								{evidence}
							/>{/each}{#if current.alternatives.length}<p>
								<strong>Alternatives still open:</strong>
								{current.alternatives.join(' · ')}
							</p>{/if}
					</details>
				{:else}
					<p class="ma-lead">{current.aftermath}</p>
					{#if current.outcome === 'untested'}<div class="ma-proposal">
							<span>◇ UNTESTED</span>
							<p>A paper proposal: larger, separated controls.</p>
							<div
								class="ma-control-sketch"
								aria-label="Three proposed larger separated controls, an untested layout"
							>
								<span></span><span></span><span></span>
							</div>
							<p>No later successful product is asserted.</p>
						</div>{:else if current.outcome === 'closed'}<p class="ma-closed-stamp">
							■ CLOSED RECORD · NO REUSE RECORDED
						</p>{:else if current.outcome === 'unresolved'}<div class="ma-unresolved">
							<strong>? Explanations remain open</strong>
							<p>{current.alternatives.join(' · ')}</p>
							<p>The trial did not isolate these. No single cause is claimed.</p>
						</div>{/if}
					{#each current.onwardLinks as link (link.id)}<button
							type="button"
							onclick={() => {
								selection = normaliseSelection(ARCHIVE, {
									...selection,
									selectedComparisonId: selection.selectedComparisonId === link.id ? null : link.id
								});
							}}
							aria-expanded={selection.selectedComparisonId === link.id}
							>Compare the supported connector revision</button
						>{/each}
					{#if comparison && comparisonTarget}<Comparison
							record={current}
							link={comparison}
							target={comparisonTarget}
						/>{/if}
				{/if}
			</div>
			{#if beat === 4 || selection.activeView === 'aftermath'}<section class="ma-decision">
					<span class="ma-kicker">THE COST AND THE RECORDED DECISION</span>
					<dl>
						<div>
							<dt>Time</dt>
							<dd>{formatCost(current, 'time')}</dd>
						</div>
						<div>
							<dt>Money</dt>
							<dd>{formatCost(current, 'money')}</dd>
						</div>
						<div>
							<dt>Material</dt>
							<dd>{formatCost(current, 'material')}</dd>
						</div>
					</dl>
					<p>{current.decision}</p>
					<p class="ma-muted">
						Unknown means not supplied. The absence of a cost is not a cost of zero.
					</p>
				</section>{/if}
			<footer class="ma-record-footer">
				<nav aria-label="Specimen navigation">
					<button type="button" onclick={() => nextSpecimen(-1)}>← Previous specimen</button><button
						type="button"
						onclick={() => nextSpecimen(1)}>Next specimen →</button
					>
				</nav>
				<button type="button" onclick={share}>Copy selection link</button>
				<p role="status">{copyStatus}</p>
			</footer>
		</section>
	{/if}
{/snippet}

<div class="ma-runtime" data-maker-ready="true" data-still={still} bind:this={host}>
	<div data-maker-capture>
		<header class="ma-masthead">
			<div class="ma-edition">
				<span>THE EVERYDAY SYSTEMS COLLECTION</span><span>03 / AN INSPECTABLE ARCHIVE</span>
			</div>
			<p class="ma-demonstration">{collectionLabel(ARCHIVE)}</p>
			<h1>The Museum<br />of <em>Almost.</em></h1>
			<p class="ma-question">These things did not work out.<br />What, if anything, survived?</p>
			<button class="ma-first-action" type="button" onclick={() => open(ARCHIVE.specimens[0].id)}
				>Open the {ARCHIVE.specimens[0].illustration === 'page'
					? 'page'
					: ARCHIVE.specimens[0].illustration} drawer →</button
			>
		</header>
		<div class="ma-overview">
			<div class="ma-art iso-plate">
				<Cabinet
					bind:this={cabinet}
					selectedId={selection.selectedSpecimenId}
					selectedPartId={selection.selectedPartId}
				/>
			</div>
			<CollectionLedger />
		</div>
		<p class="ma-static-caption">
			An object’s purpose is a promise. Its record asks how much of the story we can support.
		</p>
	</div>
	<div class="ma-guided">
		<div>
			<span class="ma-kicker">A FIVE-STEP VISIT · {beat + 1} / 5</span>
			<h3>{BEATS[beat].title}</h3>
			<p>{BEATS[beat].question}</p>
			<p class="ma-muted">{BEATS[beat].note}</p>
		</div>
		<nav aria-label="Guided museum visit">
			<button type="button" onclick={() => nextBeat(beat - 1)} disabled={beat === 0}
				>← Previous</button
			><button type="button" onclick={() => nextBeat(beat + 1)} disabled={beat === 4}
				>{beat === 0 ? 'Start guided visit →' : 'Next →'}</button
			>
		</nav>
	</div>
	<div class="ma-drawers" aria-label="Choose a specimen">
		{#each ARCHIVE.specimens as record, i (record.id)}
			<div class="ma-drawer-entry">
				<button
					class="ma-drawer-button"
					class:ma-open={selection.selectedSpecimenId === record.id}
					type="button"
					data-drawer={record.id}
					aria-expanded={selection.selectedSpecimenId === record.id}
					aria-controls="ma-open-record"
					onclick={() => open(record.id)}
					><span class="ma-drawer-number">0{i + 1}</span><span
						><strong>{record.title}</strong><small
							>{record.version} · {record.contentStatus === 'demonstration'
								? 'fictional'
								: 'verified'}</small
						></span
					><span class="ma-open-word"
						>{selection.selectedSpecimenId === record.id ? 'Open −' : 'Open +'}</span
					></button
				>
				{#if compact && selection.selectedSpecimenId === record.id}<div class="ma-mobile-tray">
						<Cabinet selectedId={record.id} selectedPartId={selection.selectedPartId} compact />
						<p>{OUTCOME_LABEL[record.outcome]}</p>
						<a href="#ma-open-record">Read this record ↓</a>
					</div>
					{@render openedRecord()}{/if}
			</div>
		{/each}
	</div>
	{#if current && !compact}
		{@render openedRecord()}
	{:else if !current}
		<div class="ma-invitation">
			<span class="ma-kicker">EXPLORE STRAIGHT AWAY</span>
			<p>
				Each drawer contains a promise, a record and the limits of its ending. Open whichever object
				catches your eye.
			</p>
		</div>
	{/if}
	<div class="ma-bottom">
		<p>
			Reuse is one possible outcome. Stopping can protect the time or money that remains. Keeping an
			uncertain record open can be more honest than giving it a lesson.
		</p>
		<button
			type="button"
			onclick={() => {
				void close();
				copyStatus = '';
			}}>Reset cabinet</button
		>
	</div>
	<p class="ma-live" aria-live="polite">{live}</p>
</div>
