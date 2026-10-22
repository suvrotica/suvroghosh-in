<script lang="ts">
	import { tick } from 'svelte';
	import Palace from './Palace.svelte';
	import {
		LANDMARKS,
		MAX_INPUT,
		MAX_UNITS,
		LOCI_PER_ROUTE,
		parseInput,
		gradeWord,
		exportStudySheet,
		createAttempts,
		recordAttempt,
		practiceResults,
		type InputMode,
		type Delimiter,
		type MemoryUnit,
		type Attempt
	} from '$lib/visualizations/memory-palace/model';
	import { WORD_EXAMPLE, CONCEPT_EXAMPLE } from '$lib/visualizations/memory-palace/examples';
	type Phase = 'prepare' | 'build' | 'study' | 'recall' | 'review';
	let phase = $state<Phase>('prepare');
	let mode = $state<InputMode>('words');
	let delimiter = $state<Delimiter>('comma');
	let text = $state(WORD_EXAMPLE.text);
	let units = $state<MemoryUnit[]>(WORD_EXAMPLE.units.map((unit) => ({ ...unit })));
	let selected = $state(0);
	let route = $state(0);
	let tour = $state(false);
	let reviewed = $state(false);
	let error = $state('');
	let notice = $state('');
	let splitText = $state('');
	let selectedSource = $state('');
	let attempts = $state<Attempt[]>([]);
	let practiceIds = $state<string[]>([]);
	let practiceIndex = $state(0);
	let draftAnswer = $state('');
	let nextId = 1000;
	let answerInput = $state<HTMLTextAreaElement>();
	let panel: HTMLDivElement;
	const phases: { id: Phase; title: string }[] = [
		{ id: 'prepare', title: '1. Prepare' },
		{ id: 'build', title: '2. Make scenes' },
		{ id: 'study', title: '3. Walk' },
		{ id: 'recall', title: '4. Recall' },
		{ id: 'review', title: '5. Review' }
	];
	const active = $derived(units[selected]);
	const practiceUnit = $derived(units.find((unit) => unit.id === practiceIds[practiceIndex]));
	const attempt = $derived(attempts.find((item) => item.unitId === practiceUnit?.id));
	const routeCount = $derived(Math.max(1, Math.ceil(units.length / LOCI_PER_ROUTE)));
	const visibleUnits = $derived(
		units.filter((unit) => Math.floor(unit.locus / LOCI_PER_ROUTE) === route)
	);
	const sceneCount = $derived(units.filter((unit) => unit.scene.trim()).length);
	const result = $derived(practiceResults(attempts));
	const currentLocus = $derived(
		phase === 'recall' && practiceUnit
			? practiceUnit.locus % LOCI_PER_ROUTE
			: tour
				? selected % LOCI_PER_ROUTE
				: active?.locus % LOCI_PER_ROUTE || 0
	);
	const recallVisible = $derived(Boolean(attempt?.hinted || attempt?.revealed));
	const stepTitle = $derived(phases.find((step) => step.id === phase)!.title.slice(3));

	function invalidate(
		message = 'Learning material changed; previous practice results were cleared.'
	) {
		attempts = [];
		reviewed = false;
		error = '';
		notice = message;
	}
	function selectUnit(index: number) {
		tour = false;
		selected = index;
		route = Math.floor(units[index].locus / LOCI_PER_ROUTE);
		splitText = '';
	}
	function selectLocus(index: number) {
		if (phase === 'recall') return;
		if (tour || phase === 'prepare') {
			tour = true;
			selected = index;
			return;
		}
		const found = units.findIndex((unit) => unit.locus === route * LOCI_PER_ROUTE + index);
		if (found >= 0) selectUnit(found);
	}
	function example(kind: InputMode) {
		const sample = kind === 'words' ? WORD_EXAMPLE : CONCEPT_EXAMPLE;
		mode = kind;
		delimiter = 'comma';
		text = sample.text;
		units = sample.units.map((unit) => ({ ...unit }));
		selected = 0;
		route = 0;
		tour = false;
		invalidate('Worked example loaded. Review the units, then personalise its scenes.');
	}
	function changeSource(value: string) {
		selectedSource = '';
		text = value;
		units = [];
		selected = 0;
		route = 0;
		invalidate('Source changed. Create a new breakdown to continue.');
	}
	function prepare() {
		try {
			units = parseInput(text, mode, delimiter);
			selected = 0;
			route = 0;
			invalidate('Suggested units ready. Edit their meaning and order before confirming.');
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Please check the input.';
		}
	}
	function edit(
		field: keyof Pick<MemoryUnit, 'label' | 'meaning' | 'scene' | 'why' | 'prop' | 'relationship'>,
		value: string
	) {
		units = units.map((unit, index) => (index === selected ? { ...unit, [field]: value } : unit));
		invalidate();
	}
	function relocus(next: MemoryUnit[]) {
		units = next.map((unit, index) => ({ ...unit, locus: index }));
		selected = Math.min(selected, units.length - 1);
		invalidate('Units updated. Check the new route order before continuing.');
	}
	function move(direction: number) {
		const destination = selected + direction;
		if (destination < 0 || destination >= units.length) return;
		const next = [...units];
		[next[selected], next[destination]] = [next[destination], next[selected]];
		selected = destination;
		relocus(next);
		selectUnit(destination);
	}
	function remove() {
		relocus(units.filter((_, index) => index !== selected));
		if (units.length) selectUnit(Math.max(0, selected));
	}
	function merge() {
		if (!active || !units[selected + 1]) return;
		const second = units[selected + 1];
		if (active.label.length + second.label.length + 3 > 600) {
			error =
				'The grouped label would exceed 600 characters. Shorten its labels first; both units are still intact.';
			return;
		}
		const merged = {
			...active,
			label: `${active.label} + ${second.label}`,
			meaning: `${active.meaning}\n${second.meaning}`,
			source: `${active.source}\n${second.source}`,
			scene: [active.scene, second.scene].filter(Boolean).join(' '),
			why: [active.why, second.why].filter(Boolean).join(' '),
			relationship: [active.relationship, second.relationship].filter(Boolean).join('\n')
		};
		relocus([...units.slice(0, selected), merged, ...units.slice(selected + 2)]);
	}
	function split() {
		const parts = splitText
			.split('|')
			.map((part) => part.trim())
			.filter(Boolean);
		if (!active || parts.length < 2) {
			error = 'Enter at least two units separated by |.';
			return;
		}
		if (units.length - 1 + parts.length > MAX_UNITS || parts.some((part) => part.length > 600)) {
			error = `Keep at most ${MAX_UNITS} units and 600 characters per new unit.`;
			return;
		}
		const additions = parts.map((label) => ({
			...active,
			id: `edited-${nextId++}`,
			label,
			meaning: label,
			scene: '',
			why: '',
			relationship: ''
		}));
		relocus([...units.slice(0, selected), ...additions, ...units.slice(selected + 1)]);
		splitText = '';
	}
	function addSelection() {
		if (text.length > MAX_INPUT) {
			error = `Use at most ${MAX_INPUT.toLocaleString()} source characters. Nothing has been discarded.`;
			return;
		}
		if (!selectedSource.trim() || !text.includes(selectedSource)) {
			error = 'Select a passage in the source box first.';
			return;
		}
		if (units.length >= MAX_UNITS || selectedSource.length > 600) {
			error = `Use a passage of at most 600 characters and at most ${MAX_UNITS} units.`;
			return;
		}
		relocus([
			...units,
			{
				id: `selected-${nextId++}`,
				label: selectedSource,
				meaning: selectedSource,
				source: selectedSource,
				scene: '',
				why: '',
				prop: 'object',
				relationship: '',
				locus: units.length
			}
		]);
		selectUnit(units.length - 1);
		selectedSource = '';
	}
	function changePhase(next: Phase) {
		phase = next;
		tour = false;
		notice = '';
		error = '';
		void tick().then(() => panel?.focus());
	}
	function beginPractice(ids = units.map((unit) => unit.id)) {
		practiceIds = ids;
		attempts = createAttempts(units.filter((unit) => ids.includes(unit.id)));
		practiceIndex = 0;
		draftAnswer = '';
		const first = units.find((unit) => unit.id === ids[0]);
		if (first) route = Math.floor(first.locus / LOCI_PER_ROUTE);
		changePhase('recall');
		void tick().then(() => answerInput?.focus());
	}
	function updateAttempt(patch: Partial<Attempt>) {
		if (practiceUnit) attempts = recordAttempt(attempts, practiceUnit.id, patch);
	}
	function submit() {
		if (!practiceUnit || !attempt || !draftAnswer.trim() || attempt.revealed) return;
		updateAttempt({
			answer: draftAnswer,
			submitted: true,
			...(mode === 'words'
				? {
						result: gradeWord(draftAnswer, practiceUnit.label)
							? ('remembered' as const)
							: ('missed' as const),
						revealed: true
					}
				: {})
		});
		notice =
			mode === 'words'
				? 'Answer checked. Compare your answer with the target.'
				: 'Attempt recorded. Reveal the idea, then assess its meaning and relationships.';
	}
	function reveal() {
		updateAttempt({ revealed: true, answer: attempt?.answer || draftAnswer });
	}
	function advance() {
		if (practiceIndex >= practiceIds.length - 1) {
			changePhase('review');
			return;
		}
		practiceIndex++;
		draftAnswer = '';
		const next = units.find((unit) => unit.id === practiceIds[practiceIndex]);
		if (next) route = Math.floor(next.locus / LOCI_PER_ROUTE);
		notice = '';
		void tick().then(() => answerInput?.focus());
	}
	function download() {
		const url = URL.createObjectURL(
			new Blob([exportStudySheet(units, mode)], { type: 'text/markdown;charset=utf-8' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'my-memory-palace.md';
		link.click();
		URL.revokeObjectURL(url);
		notice = 'Study sheet downloaded. Keep it somewhere private if your material is personal.';
	}
	function clearSession() {
		text = '';
		units = [];
		attempts = [];
		practiceIds = [];
		draftAnswer = '';
		selectedSource = '';
		selected = 0;
		route = 0;
		reviewed = false;
		changePhase('prepare');
		notice = 'Session cleared.';
	}
</script>

<div class="mp-runtime" data-memory-ready="true">
	<nav class="mp-steps" aria-label="Memory palace stages">
		{#each phases as step (step.id)}<span
				class:current={phase === step.id}
				aria-current={phase === step.id ? 'step' : undefined}>{step.title}</span
			>{/each}
	</nav>
	<div class="mp-workspace">
		<div class="mp-map-column">
			<div class="mp-figure" data-memory-capture>
				<div class="mp-figure-top">
					<span>FIG. 01 / THE HOUSE OF CUES</span><span
						>{phase === 'recall'
							? 'RETRIEVAL WALK'
							: tour
								? 'LEARN THE LANDMARKS'
								: 'A ROUTE THROUGH A CALCUTTA HOUSE'}</span
					>
				</div>
				<Palace
					selected={currentLocus}
					occupied={phase === 'prepare' || tour
						? []
						: visibleUnits.map((unit) => unit.locus % LOCI_PER_ROUTE)}
					recall={phase === 'recall'}
					onselect={selectLocus}
					routeNumber={route + 1}
					sceneProp={phase === 'recall'
						? recallVisible
							? practiceUnit?.prop
							: undefined
						: phase === 'study' || phase === 'build'
							? active?.prop
							: undefined}
					sceneVisible={phase === 'recall' ? recallVisible : phase === 'study' || phase === 'build'}
				/>
				<div class="mp-figure-bottom">
					<span
						>{phase === 'recall'
							? 'Picture the scene before asking for a hint.'
							: 'Choose a numbered landmark. Follow the same order.'}</span
					><strong>{currentLocus + 1} / 12</strong>
				</div>
			</div>
			{#if routeCount > 1 && phase !== 'recall'}<label class="mp-route-choice"
					>Practice batch <select
						value={route}
						onchange={(event) => {
							route = Number(event.currentTarget.value);
							const first = units.findIndex((unit) => Math.floor(unit.locus / 12) === route);
							if (first >= 0) selected = first;
						}}
						>{#each Array(routeCount).keys() as index (index)}<option value={index}
								>Batch {index + 1} of {routeCount}</option
							>{/each}</select
					></label
				>
				<p class="mp-fine">
					Each batch uses this same illustrated route. Practise one batch at a time; use distinct
					familiar places for long-term learning to reduce interference.
				</p>{/if}
			{#if phase === 'prepare' || tour}
				<div class="mp-route-lesson">
					<p class="mp-kicker">FIRST, GIVE THE ROUTE A LITTLE ATTENTION</p>
					<h3>{LANDMARKS[currentLocus].name}</h3>
					<p>{LANDMARKS[currentLocus].hint}</p>
					<div class="mp-actions">
						<button
							onclick={() => {
								tour = true;
								selected = (currentLocus + 11) % 12;
							}}>Previous landmark</button
						><button
							onclick={() => {
								tour = true;
								selected = (currentLocus + 1) % 12;
							}}>Next landmark</button
						>
					</div>
				</div>
			{/if}
			<details class="mp-linear" open={phase === 'recall'}>
				<summary>Text route · all 12 landmarks</summary>
				<ol>
					{#each LANDMARKS as landmark, index (landmark.name)}<li>
							<button
								class:active={currentLocus === index}
								disabled={phase === 'recall'}
								onclick={() => selectLocus(index)}>{landmark.name}</button
							>
						</li>{/each}
				</ol>
			</details>
			<p class="mp-privacy">
				Your text stays in this browser tab. Export a study sheet to keep it; this instrument does
				not save your session.
			</p>
		</div>
		<div class="mp-panel" tabindex="-1" bind:this={panel} aria-label={stepTitle}>
			{#if phase === 'prepare'}
				<p class="mp-kicker">01 / GIVE THE IDEAS A SHAPE</p>
				<h3>What would you like to remember?</h3>
				<div class="mp-actions">
					<button onclick={() => example('words')}>Try the word list</button><button
						onclick={() => example('concepts')}>Try the concept paragraph</button
					>
				</div>
				<label
					>Material type<select
						value={mode}
						onchange={(event) => {
							mode = event.currentTarget.value as InputMode;
							changeSource(text);
						}}
						><option value="words">An ordered word list</option><option value="concepts"
							>A paragraph of concepts</option
						></select
					></label
				>
				{#if mode === 'words'}<label
						>Split items at<select
							value={delimiter}
							onchange={(event) => {
								delimiter = event.currentTarget.value as Delimiter;
								changeSource(text);
							}}
							><option value="comma">Commas · keeps multiword phrases</option><option
								value="newline">Line breaks · keeps multiword phrases</option
							><option value="space">Whitespace · individual words</option><option value="auto"
								>Automatic · commas, then lines, then spaces</option
							></select
						></label
					>{/if}
				<label
					>Original material<textarea
						class="mp-source"
						value={text}
						oninput={(event) => changeSource(event.currentTarget.value)}
						onselect={(event) => {
							selectedSource = event.currentTarget.value.slice(
								event.currentTarget.selectionStart,
								event.currentTarget.selectionEnd
							);
						}}
					></textarea></label
				>
				<p class="mp-fine">
					{text.length.toLocaleString()} / {MAX_INPUT.toLocaleString()} characters · at most {MAX_UNITS}
					units, 12 per practice batch. These are interface limits.
				</p>
				<div class="mp-actions">
					<button class="mp-primary" onclick={prepare}>Suggest a breakdown</button
					>{#if mode === 'concepts'}<button onclick={addSelection}
							>Add selected passage as a unit</button
						>{/if}
				</div>
				{#if mode === 'concepts'}<p class="mp-note">
						Sentence and clause suggestions are a starting point. Review the ideas yourself,
						preserving “not”, “only if”, causes, and exceptions. A short label alone cannot carry
						the whole explanation.
					</p>{/if}
				{#if units.length}<div class="mp-unit-list" aria-label="Proposed memory units">
						{#each units as unit, index (unit.id)}<button
								class:active={selected === index}
								onclick={() => selectUnit(index)}><span>{index + 1}</span>{unit.label}</button
							>{/each}
					</div>
					{#if active}<div class="mp-edit-card">
							<label
								>Unit label<input
									value={active.label}
									maxlength="600"
									oninput={(event) => edit('label', event.currentTarget.value)}
								/></label
							>{#if mode === 'concepts'}<label
									>What this idea means<textarea
										value={active.meaning}
										maxlength="1200"
										oninput={(event) => edit('meaning', event.currentTarget.value)}
									></textarea></label
								><label
									>Relationship or condition<input
										value={active.relationship}
										maxlength="400"
										oninput={(event) => edit('relationship', event.currentTarget.value)}
										placeholder="For example: cooling enables condensation"
									/></label
								>{/if}
							<details>
								<summary>Source passage</summary>
								<blockquote>{active.source}</blockquote>
							</details>
							<div class="mp-actions">
								<button disabled={selected === 0} onclick={() => move(-1)}>Move earlier</button
								><button disabled={selected === units.length - 1} onclick={() => move(1)}
									>Move later</button
								><button disabled={selected === units.length - 1} onclick={merge}
									>Group with next</button
								><button onclick={remove}>Remove unit</button>
							</div>
							<label
								>Split into units using |<input
									bind:value={splitText}
									maxlength="1800"
									placeholder="First idea | second idea"
								/></label
							><button onclick={split}>Split this unit</button>
						</div>{/if}
					<label class="mp-check"
						><input type="checkbox" bind:checked={reviewed} />I have reviewed the units, meaning,
						and route order.</label
					><button
						class="mp-primary"
						disabled={!reviewed || units.some((unit) => !unit.label.trim())}
						onclick={() => {
							selected = 0;
							route = 0;
							changePhase('build');
						}}>Confirm units and make scenes</button
					>
				{/if}
			{:else if phase === 'build' && active}
				<p class="mp-kicker">02 / ONE UNIT, ONE LOCATION</p>
				<h3>{LANDMARKS[active.locus % 12].name}</h3>
				<div class="mp-target">
					<span>REMEMBER</span>
					<h4>{active.label}</h4>
					{#if mode === 'concepts'}<p>{active.meaning}</p>
						{#if active.relationship}<p>
								<strong>Keep this relationship:</strong>
								{active.relationship}
							</p>{/if}{/if}
				</div>
				<label
					>Your memorable scene<textarea
						value={active.scene}
						maxlength="800"
						oninput={(event) => edit('scene', event.currentTarget.value)}
						placeholder={`At the ${LANDMARKS[active.locus % 12].name.toLowerCase()}, imagine an object or character doing something that reminds you of this unit.`}
					></textarea></label
				>
				<label
					>Why does this remind you of the idea?<textarea
						value={active.why}
						maxlength="600"
						oninput={(event) => edit('why', event.currentTarget.value)}
						placeholder="Connect each important part of the scene to the meaning."
					></textarea></label
				>
				<label
					>Scene token<select
						value={active.prop}
						onchange={(event) => edit('prop', event.currentTarget.value)}
						><option value="object">An object</option><option value="plant">A growing thing</option
						><option value="water">Water</option><option value="light">Light</option><option
							value="sound">Sound</option
						><option value="motion">Motion</option>
						{#if !['object', 'plant', 'water', 'light', 'sound', 'motion'].includes(active.prop)}<option
								value={active.prop}>Worked-example token · {active.prop}</option
							>{/if}</select
					></label
				>
				<p class="mp-fine">
					The token marks your association; your own scene supplies its meaning. Visual detail,
					words, sounds, and spatial cues are all welcome.
				</p>
				<div class="mp-actions">
					<button disabled={selected === 0} onclick={() => selectUnit(selected - 1)}
						>Previous unit</button
					><button disabled={selected === units.length - 1} onclick={() => selectUnit(selected + 1)}
						>Next unit</button
					>
				</div>
				<p class="mp-progress">{sceneCount} / {units.length} scenes prepared</p>
				<button
					class="mp-primary"
					disabled={sceneCount !== units.length}
					onclick={() => {
						selected = 0;
						route = 0;
						changePhase('study');
					}}>Walk my route</button
				><button class="mp-link" onclick={() => changePhase('prepare')}
					>Edit units and source</button
				>
			{:else if phase === 'study' && active}
				<p class="mp-kicker">03 / FOLLOW THE SAME PATH</p>
				<h3>{LANDMARKS[active.locus % 12].name}</h3>
				<div class="mp-target">
					<span>{active.locus + 1} / {units.length} · REMEMBER</span>
					<h4>{active.label}</h4>
					{#if mode === 'concepts'}<p>{active.meaning}</p>
						<p>{active.relationship}</p>{/if}
				</div>
				<p class="mp-scene">{active.scene}</p>
				{#if active.why}<p><strong>The connection:</strong> {active.why}</p>{/if}
				<p class="mp-note">
					Look away for a moment. Imagine being here, then recall what the scene represents.
				</p>
				<div class="mp-actions">
					<button disabled={selected === 0} onclick={() => selectUnit(selected - 1)}
						>Previous stop</button
					><button disabled={selected === units.length - 1} onclick={() => selectUnit(selected + 1)}
						>Next stop</button
					>
				</div>
				<button
					class="mp-primary"
					onclick={() => beginPractice(visibleUnits.map((unit) => unit.id))}
					>Practise recall{routeCount > 1 ? ` · batch ${route + 1}` : ''}</button
				><button class="mp-link" onclick={() => changePhase('build')}>Revise my scenes</button
				><button class="mp-link" onclick={download}>Download study sheet</button>
			{:else if phase === 'recall' && practiceUnit && attempt}
				<p class="mp-kicker">04 / RETRIEVE BEFORE YOU REVEAL</p>
				<h3>{LANDMARKS[practiceUnit.locus % 12].name}</h3>
				<p class="mp-progress">
					Attempt {practiceIndex + 1} of {practiceIds.length} · original route position {practiceUnit.locus +
						1}
				</p>
				<label
					>{mode === 'words'
						? 'Which word or phrase belongs here?'
						: 'Explain the idea and its important relationships.'}<textarea
						bind:this={answerInput}
						bind:value={draftAnswer}
						maxlength="1600"
						disabled={attempt.submitted || attempt.revealed}
						placeholder="Try remembering before checking…"
					></textarea></label
				>
				<div class="mp-actions">
					<button
						class="mp-primary"
						disabled={!draftAnswer.trim() || attempt.submitted || attempt.revealed}
						onclick={submit}>Record my answer</button
					><button
						disabled={attempt.hinted || attempt.revealed || attempt.submitted}
						onclick={() => updateAttempt({ hinted: true })}>Give me a scene hint</button
					><button disabled={attempt.revealed} onclick={reveal}>Reveal the target</button>
				</div>
				{#if recallVisible}<div class="mp-hint">
						<span>{attempt.revealed ? 'FEEDBACK' : 'SCENE HINT · ASSISTED'}</span>
						<p>{practiceUnit.scene}</p>
						{#if attempt.revealed}<h4>{practiceUnit.label}</h4>
							{#if mode === 'concepts'}<p>{practiceUnit.meaning}</p>
								<p>
									<strong>Relationship / condition:</strong>
									{practiceUnit.relationship || 'Compare the full explanation with your answer.'}
								</p>{/if}
							<p>{practiceUnit.why}</p>
							{#if attempt.answer}<blockquote>
									Your answer: {attempt.answer}
								</blockquote>{/if}{#if mode === 'words'}<p>
									<strong
										>{attempt.result === 'remembered'
											? 'Matched this occurrence at this position.'
											: attempt.result === 'missed'
												? 'The wording did not match this position.'
												: 'Target revealed before a checked answer.'}</strong
									>
								</p>
								<p class="mp-fine">
									Comparison normalises Unicode, case, and whitespace (including repeated spaces).
									Spelling, accents, punctuation, and word order must match.
								</p>{:else}<p>Assess the meaning and relationships yourself:</p>
								<div class="mp-actions">
									{#each [{ id: 'remembered', name: 'Remembered' }, { id: 'partial', name: 'Partly remembered' }, { id: 'missed', name: 'Missed' }] as assessment (assessment.id)}<button
											aria-pressed={attempt.result === assessment.id}
											onclick={() => updateAttempt({ result: assessment.id as Attempt['result'] })}
											>{assessment.name}</button
										>{/each}
								</div>{/if}{/if}
					</div>{/if}
				<div class="mp-actions">
					<button onclick={advance}
						>{practiceIndex === practiceIds.length - 1
							? 'Finish and review'
							: attempt.result
								? 'Next location'
								: 'Skip for now'}</button
					><button class="mp-link" onclick={() => changePhase('review')}
						>End practice and review</button
					>
				</div>
			{:else if phase === 'review'}
				<p class="mp-kicker">05 / NOTICE WHAT NEEDS A BETTER CUE</p>
				<h3>Your walk, remembered.</h3>
				<div class="mp-results">
					<div><strong>{result.remembered}</strong><span>remembered</span></div>
					<div><strong>{result.partial}</strong><span>partial</span></div>
					<div><strong>{result.unassisted}</strong><span>without a hint</span></div>
				</div>
				<p class="mp-fine">
					{mode === 'concepts'
						? 'Concept ratings are your own assessment, not an automatic test of understanding.'
						: 'Results check each occurrence at its original route position.'} Revealing before an attempt
					is recorded cannot count as unassisted.
				</p>
				<div class="mp-review-list">
					{#each attempts as item (item.unitId)}{@const unit = units.find(
							(entry) => entry.id === item.unitId
						)!}
						<article>
							<p class="mp-kicker">
								{unit.locus + 1} · {LANDMARKS[unit.locus % 12].name} · {item.result ||
									'unrated / skipped'}
							</p>
							<h4>{unit.label}</h4>
							<p>Your answer: {item.answer || 'No recorded answer'}</p>
							{#if mode === 'concepts'}<p>Meaning: {unit.meaning}</p>
								<p>{unit.relationship}</p>{/if}
							<p class="mp-fine">
								Scene hint: {item.hinted ? 'used' : 'not used'} · Target: {item.revealed
									? 'revealed'
									: 'not revealed'}
							</p>
						</article>{/each}
				</div>
				<div class="mp-actions">
					<button
						class="mp-primary"
						disabled={!attempts.some((item) => item.result !== 'remembered')}
						onclick={() =>
							beginPractice(
								attempts.filter((item) => item.result !== 'remembered').map((item) => item.unitId)
							)}>Practise weak or skipped items</button
					><button
						onclick={() =>
							beginPractice(
								units.filter((unit) => Math.floor(unit.locus / 12) === route).map((unit) => unit.id)
							)}>Try this batch again</button
					>
				</div>
				<p class="mp-note">
					Keep the original locations when revisiting weak items. Try another recall later today,
					tomorrow, and after a longer interval; adjust those intervals to what you forget.
				</p>
				<div class="mp-actions">
					<button
						onclick={() => {
							selected = 0;
							route = 0;
							changePhase('build');
						}}>Revise associations</button
					><button onclick={download}>Download study sheet</button><button
						onclick={() => changePhase('prepare')}>Return to preparation</button
					>
				</div>
			{/if}
			{#if error}<p class="mp-error" role="alert">{error}</p>{/if}
			<button class="mp-link" onclick={clearSession}>Clear session and start over</button>
			<p class="mp-status" role="status" aria-live="polite">{notice}</p>
		</div>
	</div>
</div>
