<script lang="ts">
	import { onMount } from 'svelte';
	import { resolveMotion } from '$lib/motion/preferences';
	import {
		ASSUMPTIONS as A,
		calculateWorkshop,
		countedBundles,
		formatMinutes,
		normaliseInput,
		originalSetup,
		resetWorkshop,
		type Area,
		type WorkshopInput
	} from '$lib/visualizations/build-one-build-a-thousand/model';
	import WorkshopScene from './WorkshopScene.svelte';
	const beats = [
		{
			tag: 'ONE',
			title: 'Make one.',
			text: 'Three pieces. A phone held upright. Assemble the stand, then look at the time your hands have spent on it.',
			quantity: 1,
			area: 'cutting'
		},
		{
			tag: 'TEN',
			title: 'Make the same thing again.',
			text: 'Will the cutting guide help already? Try it. The preparation appears immediately, before a single later saving.',
			quantity: 10,
			area: 'cutting'
		},
		{
			tag: 'ONE HUNDRED',
			title: 'The bench has neighbours.',
			text: 'The stock covers twenty stands. This order empties the rack. After material arrives, illustrated instructions can reduce assembly work and workshop fixes.',
			quantity: 100,
			area: 'material'
		},
		{
			tag: 'ONE THOUSAND',
			title: 'Finished here is not finished for them.',
			text: 'The promise has to reach another person. Protective packing takes longer here and reduces the separate illustrative delivery-problem count.',
			quantity: 1000,
			area: 'packing'
		},
		{
			tag: 'THE PROCESS',
			title: 'Design the way it gets made.',
			text: 'Prepare a thousand stands. Compare every choice with the original setup at the same quantity. One maker still has only 420 productive minutes each working day.',
			quantity: 1000,
			area: 'assembly'
		}
	] as const;
	const areas: ReadonlyArray<{ id: Area; label: string }> = [
		{ id: 'cutting', label: 'Cutting & preparation' },
		{ id: 'material', label: 'Material stock' },
		{ id: 'assembly', label: 'Assembly & fixes' },
		{ id: 'packing', label: 'Packing' },
		{ id: 'customer', label: 'Customer shelf' }
	];
	let input = $state<WorkshopInput>(resetWorkshop());
	let beat = $state(0);
	let exploring = $state(false);
	let selected = $state<Area>('cutting');
	let differences = $state(false);
	let comparing = $state(false);
	let assembly = 0;
	let dispatch = 0;
	let animationMode: 'assembly' | 'dispatch' = 'assembly';
	let dispatchTarget = 0;
	let animating = $state(false);
	let scene: WorkshopScene;
	let assemblyTarget = $state(0);
	let paused = $state(false);
	let speed = $state(1);
	let still = $state(false);
	let visible = true;
	let frame = 0;
	let last = 0;
	let host: HTMLDivElement;
	let announcement = $state('');
	let announcementTimer: ReturnType<typeof setTimeout> | undefined;
	const snapshot = $derived(calculateWorkshop(input));
	const baseline = $derived(originalSetup(input));
	const bundles = $derived(countedBundles(input.quantity));
	const current = $derived(beats[beat]);
	const expandedBeat = $derived(
		Math.max(
			exploring ? 4 : beat,
			input.quantity > 100 ? 3 : input.quantity > 20 ? 2 : input.quantity > 1 ? 1 : 0
		)
	);
	function update(changes: Partial<WorkshopInput>) {
		input = normaliseInput({ ...input, ...changes });
		clearTimeout(announcementTimer);
		announcementTimer = setTimeout(() => {
			announcement = `${input.quantity.toLocaleString('en-GB')} ${input.quantity === 1 ? 'stand' : 'stands'}. ${formatMinutes(snapshot.handsOnMinutes)} of hands-on work. Ready to send: working day ${snapshot.readyToSendDay}.`;
		}, 500);
	}
	function navigate(next: number) {
		beat = Math.max(0, Math.min(4, next));
		exploring = false;
		selected = beats[beat].area;
		update({ quantity: beats[beat].quantity });
		if (beat > 0) {
			assemblyTarget = 1;
			assembly = 1;
			dispatch = dispatchTarget;
			stopFrames();
			scene?.present(assembly, dispatch);
		}
	}
	function inspect(area: Area) {
		selected = area;
		if (['packing', 'customer'].includes(area) && beat < 3) exploring = true;
		if (['material', 'assembly'].includes(area) && beat < 2) exploring = true;
	}
	function stopFrames() {
		cancelAnimationFrame(frame);
		frame = 0;
		last = 0;
		animating = false;
	}
	function tick(now: number) {
		frame = 0;
		if (paused || still || !visible || document.hidden) {
			last = 0;
			return;
		}
		const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 0;
		last = now;
		const step = (dt * speed) / 0.9;
		if (animationMode === 'assembly')
			assembly =
				assemblyTarget > assembly
					? Math.min(assemblyTarget, assembly + step)
					: Math.max(assemblyTarget, assembly - step);
		else dispatch = Math.min(dispatchTarget, dispatch + step);
		scene?.present(assembly, dispatch);
		if (
			(animationMode === 'assembly' && assembly !== assemblyTarget) ||
			(animationMode === 'dispatch' && dispatch !== dispatchTarget)
		)
			frame = requestAnimationFrame(tick);
		else {
			last = 0;
			animating = false;
		}
	}
	function animateAssembly() {
		dispatch = dispatchTarget;
		assemblyTarget = assemblyTarget ? 0 : 1;
		animationMode = 'assembly';
		paused = false;
		stopFrames();
		if (still || !visible) {
			assembly = assemblyTarget;
			scene?.present(assembly, dispatch);
		} else {
			animating = true;
			frame = requestAnimationFrame(tick);
		}
	}
	function sendParcels() {
		stopFrames();
		assembly = assemblyTarget;
		dispatch = 0;
		dispatchTarget = 1;
		scene?.present(assembly, dispatch);
		animationMode = 'dispatch';
		paused = false;
		selected = 'customer';
		if (still || !visible) {
			dispatch = 1;
			scene?.present(assembly, dispatch);
		} else {
			animating = true;
			frame = requestAnimationFrame(tick);
		}
	}
	function pauseMotion() {
		paused = !paused;
		stopFrames();
		animating = true;
		if (!paused) frame = requestAnimationFrame(tick);
	}
	function reset() {
		input = resetWorkshop();
		selected = current.area;
		comparing = false;
		differences = false;
		assemblyTarget = beat ? 1 : 0;
		assembly = assemblyTarget;
		dispatch = 0;
		dispatchTarget = 0;
		paused = false;
		stopFrames();
		scene?.present(assembly, dispatch);
		clearTimeout(announcementTimer);
		announcement =
			'Workshop reset to one stand with all three decisions off. Your current chapter is kept.';
	}
	onMount(() => {
		const query = matchMedia('(prefers-reduced-motion: reduce)');
		const motion = () => {
			still = resolveMotion(document.documentElement.dataset.motion, query.matches) === 'still';
			if (still) {
				assembly = assemblyTarget;
				dispatch = dispatchTarget;
				stopFrames();
				scene?.present(assembly, dispatch);
			}
		};
		motion();
		query.addEventListener('change', motion);
		const preference = new MutationObserver(motion);
		preference.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		const observer = new IntersectionObserver((entries) => {
			visible = entries.at(-1)?.isIntersecting ?? false;
			if (!visible) {
				stopFrames();
				assembly = assemblyTarget;
				dispatch = dispatchTarget;
				scene?.present(assembly, dispatch);
			}
		});
		observer.observe(host);
		const visibility = () => {
			if (document.hidden) {
				stopFrames();
				assembly = assemblyTarget;
				dispatch = dispatchTarget;
				scene?.present(assembly, dispatch);
			}
		};
		document.addEventListener('visibilitychange', visibility);
		return () => {
			stopFrames();
			clearTimeout(announcementTimer);
			observer.disconnect();
			preference.disconnect();
			query.removeEventListener('change', motion);
			document.removeEventListener('visibilitychange', visibility);
		};
	});
</script>

<div class="bott-runtime" data-maker-ready="true" data-still={still} bind:this={host}>
	<div class="bott-story-top">
		<div>
			<span class="bott-kicker"
				>{exploring
					? 'OPEN WORKSHOP'
					: `${String(beat + 1).padStart(2, '0')} / 05 · ${current.tag}`}</span
			>
			<h2>{exploring ? 'Your order. Your process.' : current.title}</h2>
			<p>
				{exploring
					? 'Change the quantity, choose the work you prepare, and inspect any area. The drawing and every result use the same teaching model.'
					: current.text}
			</p>
		</div>
		<div class="bott-opening-actions">
			<button class="bott-primary" onclick={animateAssembly}
				>{assemblyTarget ? 'Separate the three pieces' : 'Assemble the stand'}</button
			><button
				class="bott-explore"
				onclick={() => {
					exploring = !exploring;
					assembly = 1;
					assemblyTarget = 1;
					dispatch = dispatchTarget;
					stopFrames();
					scene?.present(assembly, dispatch);
				}}>{exploring ? 'Return to guided story' : 'Explore the workshop'}</button
			>
		</div>
	</div>
	<div class="bott-guide" aria-label="Guided workshop story">
		<button disabled={beat === 0} onclick={() => navigate(beat - 1)}>← Previous</button>
		<div class="bott-beats">
			{#each beats as item, index (item.tag)}<button
					class:current={beat === index && !exploring}
					aria-label={`Chapter ${index + 1}: ${item.title}`}
					aria-current={beat === index && !exploring ? 'step' : undefined}
					onclick={() => navigate(index)}>{index + 1}</button
				>{/each}
		</div>
		<button disabled={beat === 4} onclick={() => navigate(beat + 1)}>Next →</button>
	</div>
	<div class="bott-workspace">
		<div class="bott-stage-column">
			<WorkshopScene
				{snapshot}
				beat={expandedBeat}
				initialAssembly={0}
				{selected}
				{differences}
				bind:this={scene}
			/>
			<div class="bott-stage-actions">
				{#if animating}<button onclick={pauseMotion}
						>{paused ? 'Resume assembly' : 'Pause assembly'}</button
					>{/if}<button
					aria-pressed={differences}
					onclick={() => {
						differences = !differences;
						selected = 'cutting';
					}}>Show the differences</button
				>{#if expandedBeat >= 3}<button onclick={sendParcels}>Send parcels to the shelf</button
					>{/if}
				<label class="bott-speed"
					>Movement <select aria-label="Assembly movement speed" bind:value={speed}
						><option value={0.5}>Slower</option><option value={1}>Calm</option><option value={2}
							>Faster</option
						></select
					></label
				>
			</div>
			<div class="bott-bundles">
				<span>EXACT COUNT</span>
				<div class="bott-bundle-tokens" aria-label="Counted bundles">
					{#each bundles as bundle, index (index)}<span
							><b>{bundle.count.toLocaleString('en-GB')}</b><small
								>{bundle.count === 1 ? 'stand' : 'stands'}</small
							></span
						>{/each}
				</div>
				<p>
					{input.quantity.toLocaleString('en-GB')}
					{input.quantity === 1 ? 'stand' : 'stands'} = {bundles
						.map((bundle) => bundle.count.toLocaleString('en-GB'))
						.join(' + ')}{input.quantity > 10
						? ' · each number is one counted bundle'
						: input.quantity === 1
							? ' · one individual stand'
							: ' · individual stands'}
				</p>
			</div>
		</div>
		<aside class="bott-controls" aria-label="Workshop choices">
			<fieldset>
				<legend>How many have you promised?</legend>
				<div class="bott-presets">
					{#each [1, 10, 100, 1000] as q (q)}<button
							aria-pressed={input.quantity === q}
							onclick={() => update({ quantity: q })}>{q.toLocaleString('en-GB')}</button
						>{/each}
				</div>
				<label for="bott-quantity"
					>Order quantity <span
						>{input.quantity.toLocaleString('en-GB')}
						{input.quantity === 1 ? 'stand' : 'stands'}</span
					></label
				><input
					id="bott-quantity"
					type="range"
					min="1"
					max="1000"
					step="1"
					value={input.quantity}
					oninput={(event) => update({ quantity: +event.currentTarget.value })}
				/><label class="bott-number"
					>Exact quantity<input
						aria-label="Exact order quantity"
						type="number"
						min="1"
						max="1000"
						step="1"
						value={input.quantity}
						onchange={(event) => update({ quantity: +event.currentTarget.value })}
					/></label
				>
			</fieldset>
			<fieldset class="bott-decisions">
				<legend>Prepare the process</legend><label
					><input
						type="checkbox"
						checked={input.cuttingGuide}
						onchange={(event) => {
							selected = 'cutting';
							update({ cuttingGuide: event.currentTarget.checked });
						}}
					/><span
						><strong>Cutting guide</strong><small
							>{A.cutting.preparation} min preparing; cutting {A.cutting.guide} rather than {A
								.cutting.original} min per stand.</small
						></span
					></label
				><label
					><input
						type="checkbox"
						checked={input.instructions}
						onchange={(event) => {
							inspect('assembly');
							update({ instructions: event.currentTarget.checked });
						}}
					/><span
						><strong>Illustrated instructions</strong><small
							>{A.assembly.preparation} min preparing; assembly {A.assembly.instructions} rather than
							{A.assembly.original} min. Fewer workshop fixes.</small
						></span
					></label
				><label
					><input
						type="checkbox"
						checked={input.protectivePackaging}
						onchange={(event) => {
							inspect('packing');
							update({ protectivePackaging: event.currentTarget.checked });
						}}
					/><span
						><strong>Protective packaging</strong><small
							>{A.packing.protective} rather than {A.packing.original} min packing; fewer illustrative
							delivery problems.</small
						></span
					></label
				>
			</fieldset>
			<p class="bott-model-label">
				INVENTED TEACHING MODEL<br /><span>One maker · 420 productive minutes per working day</span>
			</p>
		</aside>
	</div>
	<div class="bott-results" aria-label="Batch results">
		<button onclick={() => inspect('cutting')}
			><span>HANDS-ON WORK</span><strong>{formatMinutes(snapshot.handsOnMinutes)}</strong><small
				>Includes {snapshot.preparationMinutes} min preparing and {snapshot.fixMinutes} min fixing</small
			></button
		><button onclick={() => inspect('material')}
			><span>WAITING FOR MATERIAL</span><strong
				>{snapshot.materialWaitDays} <em>working days</em></strong
			><small
				>{snapshot.materialWaitDays
					? 'Before any production begins'
					: 'Within the starting stock of twenty'}</small
			></button
		><button onclick={() => inspect('assembly')}
			><span>READY TO SEND</span><strong>Working day {snapshot.readyToSendDay}</strong><small
				>{snapshot.workingDayCapacityUsed.toFixed(2)} days of productive capacity, plus material wait</small
			></button
		>
	</div>
	<div class="bott-inspection">
		<nav aria-label="Inspect work areas">
			{#each areas as area (area.id)}<button
					aria-pressed={selected === area.id}
					onclick={() => inspect(area.id)}>{area.label}</button
				>{/each}
		</nav>
		<div class="bott-inspector">
			<span class="bott-kicker"
				>ON THE BENCH / {areas.find((area) => area.id === selected)?.label}</span
			>
			{#if selected === 'cutting'}<h3>Before the saving, the preparation.</h3>
				<p>
					Cutting uses {snapshot.cuttingMinutes} minutes per stand. {input.cuttingGuide
						? `The guide first takes ${A.cutting.preparation} minutes to make. That time is charged to this batch immediately.`
						: 'The maker cuts without a prepared guide.'} Total hands-on work is {snapshot.preparationMinutes}
					min preparing + {input.quantity.toLocaleString('en-GB')} × {snapshot.unitMinutes} min making
					and packing + {snapshot.fixMinutes} min fixing = {snapshot.handsOnMinutes.toLocaleString(
						'en-GB'
					)} min.
				</p>
				{#if input.quantity === 10}<p class="bott-callout">
						At ten: {formatMinutes(snapshot.handsOnMinutes)} now, against {formatMinutes(
							baseline.handsOnMinutes
						)} in the original setup. With only the guide on, the batch needs ten extra minutes. Preparation
						has a cost.
					</p>{/if}
			{:else if selected === 'material'}<h3>
					{snapshot.materialWaitDays
						? 'The empty rack has a consequence.'
						: 'This order fits the stock on hand.'}
				</h3>
				<p>
					The starting material covers {A.stockCapacity} stands. Quantity {input.quantity.toLocaleString(
						'en-GB'
					)}
					{snapshot.materialWaitDays
						? `adds ${snapshot.materialWaitDays} working days before production starts.`
						: 'adds no material wait.'} Instructions, guides and packing cannot change that stock rule.
					All required material arrives before work begins; supply and production do not overlap here.
				</p>
			{:else if selected === 'assembly'}<h3>Instructions change the work and the fixes.</h3>
				<p>
					Assembly uses {snapshot.assemblyMinutes} minutes per stand. This batch has {snapshot.workshopFixes}
					workshop fixes: the whole-number part of {input.quantity} ÷ {input.instructions
						? A.fixEvery.instructions
						: A.fixEvery.original}. Each takes {A.fixMinutes} minutes. All {snapshot.fixMinutes} fixing
					minutes are included before sending.
				</p>
				<p>
					Ready to send is the {snapshot.materialWaitDays}-day material wait plus the hands-on work
					divided by {A.productiveMinutesPerDay}, rounded up to its working-day number. A one-hour
					order can be ready on working day 1 without using that entire day.
				</p>
			{:else if selected === 'packing'}<h3>A little more work before the parcel leaves.</h3>
				<p>
					Packing takes {snapshot.packingMinutes} minutes per stand: {formatMinutes(
						snapshot.packingMinutes * input.quantity
					)} for this batch. {input.protectivePackaging
						? 'The fitted protective liner is present. It costs three extra minutes for every stand.'
						: 'Ordinary packing is quicker at the bench.'} The separate delivery scenario assumes {snapshot.deliveryProblems}
					problems after sending.
				</p>
			{:else}<h3>Sending is the edge of this model.</h3>
				<p>
					<span class="bott-damage" aria-hidden="true">◇</span>
					{snapshot.deliveryProblems} illustrative delivery problems: the whole-number part of {input.quantity}
					÷ {input.protectivePackaging
						? A.deliveryProblemEvery.protective
						: A.deliveryProblemEvery.original}. These are fixed scenario rules, not measured rates,
					forecasts or sampled outcomes. They add no production or return-handling time here.
					Arrival time is unknown.
				</p>{/if}
		</div>
	</div>
	<div class="bott-tools">
		<button aria-pressed={comparing} onclick={() => (comparing = !comparing)}
			>{comparing ? 'Close comparison' : 'Compare with original setup'}</button
		><button onclick={reset}>Reset workshop</button>
	</div>
	{#if comparing}<div class="bott-comparison">
			<h3>The same {input.quantity.toLocaleString('en-GB')} stands. The same stock rule.</h3>
			<table>
				<caption
					>Original setup has all three decisions off · model version {snapshot.version}</caption
				><thead
					><tr
						><th scope="col">Batch result</th><th scope="col">Original setup</th><th scope="col"
							>Your process</th
						></tr
					></thead
				><tbody
					><tr
						><th scope="row">Hands-on work</th><td>{formatMinutes(baseline.handsOnMinutes)}</td><td
							>{formatMinutes(snapshot.handsOnMinutes)}</td
						></tr
					><tr
						><th scope="row">Ready to send</th><td>Working day {baseline.readyToSendDay}</td><td
							>Working day {snapshot.readyToSendDay}</td
						></tr
					><tr
						><th scope="row">Workshop fixes, before sending</th><td>{baseline.workshopFixes}</td><td
							>{snapshot.workshopFixes}</td
						></tr
					><tr
						><th scope="row">Illustrative delivery problems, afterwards</th><td
							>{baseline.deliveryProblems}</td
						><td>{snapshot.deliveryProblems}</td></tr
					></tbody
				>
			</table>
			<p>
				After-shipping problems add no work in this limited model. This comparison is a teaching
				scenario, not a delivery estimate.
			</p>
		</div>{/if}
	<details class="bott-assumptions">
		<summary>Show the assumptions and calculation</summary>
		<p>
			Invented teaching assumptions for one maker; these are not measured rates, a quote or Suvro
			Ghosh's production history. The whole batch is sent together.
		</p>
		<table>
			<caption>Minutes per stand and one-off preparation</caption><thead
				><tr><th>Work</th><th>Original</th><th>Choice enabled</th><th>Preparing this batch</th></tr
				></thead
			><tbody
				><tr
					><th>Cutting</th><td>{A.cutting.original} min</td><td>{A.cutting.guide} min</td><td
						>{A.cutting.preparation} min</td
					></tr
				><tr
					><th>Assembly</th><td>{A.assembly.original} min</td><td>{A.assembly.instructions} min</td
					><td>{A.assembly.preparation} min</td></tr
				><tr
					><th>Finishing</th><td>{A.finishing} min</td><td>{A.finishing} min</td><td>0 min</td></tr
				><tr
					><th>Packing</th><td>{A.packing.original} min</td><td>{A.packing.protective} min</td><td
						>0 min</td
					></tr
				></tbody
			>
		</table>
		<p>
			Workshop fixes: floor(quantity ÷ {A.fixEvery.original}), or floor(quantity ÷ {A.fixEvery
				.instructions}) with instructions; {A.fixMinutes} minutes each. Delivery problems: floor(quantity
			÷ {A.deliveryProblemEvery.original}), or floor(quantity ÷ {A.deliveryProblemEvery.protective})
			with protection. No after-shipping labour is included.
		</p>
		<p>
			Hands-on minutes = preparing + quantity × minutes per stand + fixing. Productive capacity used
			= hands-on minutes ÷ {A.productiveMinutesPerDay}. Ready-to-send working day = material waiting
			+ productive capacity rounded upwards. Orders above {A.stockCapacity} wait {A.materialWaitDays}
			working days for material.
		</p>
		<p>
			No weekends, holidays, overlapping supply and production, transport duration, cash flow,
			wages, safety, returns handling or actual supplier reliability are modelled. Slot differences
			are explanatory illustrations, not a measured dimensional dataset.
		</p>
	</details>
	<p class="bott-ending">
		Making the object was the first invention.<br /><em>Making it repeatable was the second.</em
		><span>What would need to change before one person could promise this delivery?</span>
	</p>
	<p class="bott-live" role="status" aria-live="polite">{announcement}</p>
</div>
