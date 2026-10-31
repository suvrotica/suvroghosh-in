<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		newTray,
		restore,
		place,
		STORAGE_KEY,
		TYPES,
		type ObjectType,
		type TrayObject,
		type TrayState
	} from '$lib/games/sort-the-tray/model';
	import { objectSvg } from '$lib/games/sort-the-tray/objects';

	const names: Record<ObjectType, string> = { coin: 'Coin', button: 'Button', stone: 'Stone' };
	const turns = [-9, 12, -7, 8, 13, -11];
	// A fixed initial order keeps prerendering and hydration identical. Restore happens on mount.
	let state = $state<TrayState>(newTray(() => 0.5));
	let root: HTMLElement;
	let selected = $state<number | null>(null);
	let status = $state('Choose any object to begin.');
	let saveStatus = $state('Your progress stays in this browser.');
	let optionsOpen = $state(false);
	let hoveredDish = $state<ObjectType | null>(null);
	let draggingId = $state<number | null>(null);
	let ghost = $state<{ object: TrayObject; x: number; y: number } | null>(null);
	let audio: AudioContext | undefined;
	let suppressClickUntil = 0;
	let pointer: {
		id: number;
		object: TrayObject;
		startX: number;
		startY: number;
		button: HTMLButtonElement;
		dragging: boolean;
	} | null = null;
	let complete = $derived(state.sorted.length === 6);

	function save() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
			saveStatus = 'Your tray is saved in this browser. Leave whenever you like.';
		} catch {
			saveStatus = 'You can keep playing. This browser cannot save your tray.';
		}
	}

	function playSound(type: ObjectType) {
		if (!state.sound) return;
		try {
			const Audio =
				window.AudioContext ||
				(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!Audio) return;
			audio ||= new Audio();
			if (audio.state === 'suspended') void audio.resume().catch(() => {});
			const oscillator = audio.createOscillator();
			const gain = audio.createGain();
			const now = audio.currentTime;
			oscillator.type = 'sine';
			oscillator.frequency.setValueAtTime({ coin: 680, button: 450, stone: 280 }[type], now);
			oscillator.frequency.exponentialRampToValueAtTime(180, now + 0.1);
			gain.gain.setValueAtTime(0, now);
			gain.gain.linearRampToValueAtTime(0.055, now + 0.006);
			gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
			oscillator.connect(gain);
			gain.connect(audio.destination);
			oscillator.start(now);
			oscillator.stop(now + 0.15);
			oscillator.onended = () => {
				oscillator.disconnect();
				gain.disconnect();
			};
		} catch {
			/* Sound is optional; unavailable audio never prevents placement. */
		}
	}

	function select(object: TrayObject) {
		selected = selected === object.id ? null : object.id;
		status =
			selected === null ? 'Choose any object.' : `${names[object.type]} selected. Choose its dish.`;
	}

	async function selectFromClick(event: MouseEvent, object: TrayObject) {
		if (pointer?.dragging || performance.now() < suppressClickUntil) return;
		select(object);
		if (event.detail === 0 && selected !== null) {
			await tick();
			root.querySelector<HTMLButtonElement>('.dish')?.focus();
		}
	}

	async function moveTo(type: ObjectType, keyboard = false) {
		if (selected === null) {
			status = 'Choose an object first, then its dish.';
			return;
		}
		const object = state.objects.find((item) => item.id === selected);
		if (!object) return;
		if (!place(state, selected, type)) {
			status = `This is a ${object.type}. Try the ${names[object.type]}s dish.`;
			return;
		}
		selected = null;
		save();
		playSound(type);
		status = state.sorted.length === 6 ? 'Everything is sorted.' : `${names[type]} placed.`;
		if (keyboard) {
			await tick();
			root.querySelector<HTMLButtonElement>('.object, .primary-button')?.focus();
		}
	}

	function dishClick(event: MouseEvent, type: ObjectType) {
		if (pointer?.dragging || performance.now() < suppressClickUntil) return;
		void moveTo(type, event.detail === 0);
	}

	function dropTarget(x: number, y: number): ObjectType | null {
		for (const dish of root.querySelectorAll<HTMLButtonElement>('.dish')) {
			const rect = dish.getBoundingClientRect();
			if (
				x >= rect.left - 9 &&
				x <= rect.right + 9 &&
				y >= rect.top - 10 &&
				y <= rect.bottom + 10
			) {
				return dish.dataset.type as ObjectType;
			}
		}
		return null;
	}

	function pointerDown(event: PointerEvent, object: TrayObject) {
		if (pointer || !event.isPrimary || event.button !== 0) return;
		const button = event.currentTarget as HTMLButtonElement;
		button.setPointerCapture(event.pointerId);
		pointer = {
			id: event.pointerId,
			object,
			startX: event.clientX,
			startY: event.clientY,
			button,
			dragging: false
		};
	}

	function pointerMove(event: PointerEvent) {
		if (!pointer || event.pointerId !== pointer.id) return;
		if (
			!pointer.dragging &&
			Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 7
		)
			return;
		if (!pointer.dragging) {
			pointer.dragging = true;
			selected = null;
			select(pointer.object);
			draggingId = pointer.object.id;
		}
		ghost = { object: pointer.object, x: event.clientX, y: event.clientY };
		hoveredDish = dropTarget(event.clientX, event.clientY);
	}

	function finishPointer(event: PointerEvent | null, cancelled = false) {
		if (!pointer || (event && event.pointerId !== pointer.id)) return;
		const current = pointer;
		pointer = null;
		ghost = null;
		draggingId = null;
		hoveredDish = null;
		if (current.button.hasPointerCapture(current.id))
			current.button.releasePointerCapture(current.id);
		if (current.dragging) {
			suppressClickUntil = performance.now() + 250;
			const type = !cancelled && event ? dropTarget(event.clientX, event.clientY) : null;
			if (type) {
				selected = current.object.id;
				void moveTo(type);
			}
		}
	}

	async function keyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !root || (!root.contains(document.activeElement) && !pointer))
			return;
		if (optionsOpen) {
			const focusedOptions = Boolean(document.activeElement?.closest('.options'));
			optionsOpen = false;
			await tick();
			if (focusedOptions) root.querySelector<HTMLElement>('summary')?.focus();
			return;
		}
		finishPointer(null, true);
		if (selected !== null) {
			const previous = selected;
			const focusInDishes = document.activeElement?.classList.contains('dish');
			selected = null;
			status = 'Choose any object.';
			await tick();
			if (focusInDishes)
				root.querySelector<HTMLButtonElement>(`.object[data-id="${previous}"]`)?.focus();
		}
	}

	function closeOptionsOutside(event: PointerEvent) {
		if (
			optionsOpen &&
			event.target instanceof Node &&
			!root?.querySelector('.options')?.contains(event.target)
		)
			optionsOpen = false;
	}

	async function anotherTray(event: MouseEvent) {
		finishPointer(null, true);
		const { sound, reduceMotion } = state;
		state = { ...newTray(), sound, reduceMotion };
		selected = null;
		status = 'A fresh tray. Choose any object.';
		save();
		if (event.detail === 0) {
			await tick();
			root.querySelector<HTMLButtonElement>('.object')?.focus();
		}
	}

	function toggleSound() {
		state.sound = !state.sound;
		save();
		if (state.sound) playSound('button');
	}
	function toggleMotion(event: Event) {
		state.reduceMotion = (event.currentTarget as HTMLInputElement).checked;
		save();
	}

	onMount(() => {
		let saved: TrayState | null = null;
		try {
			saved = restore(localStorage.getItem(STORAGE_KEY));
		} catch {
			/* Keep a playable tray when storage is unavailable. */
		}
		state = saved ?? newTray();
		if (state.sorted.length === 6) status = 'Everything is sorted.';
		else if (state.sorted.length > 0) status = 'Your tray is just as you left it.';
		save();
		return () => {
			finishPointer(null, true);
			if (audio && audio.state !== 'closed') void audio.close().catch(() => {});
		};
	});
</script>

<svelte:window
	onkeydown={keyDown}
	onblur={() => finishPointer(null, true)}
	onpointerdown={closeOptionsOutside}
/>

<section
	id="game-experience"
	class="sort-tray"
	class:reduce-motion={state.reduceMotion}
	bind:this={root}
	aria-labelledby="sort-the-tray-title"
	data-tts-exclude
>
	<div class="tray-page">
		<header class="masthead">
			<a
				class="wordmark"
				href={resolve('/blog/[category]', { category: 'games' })}
				aria-label="Back to Games"
				><span class="mark" aria-hidden="true"><i></i><i></i><i></i></span><span
					>AT YOUR OWN PACE</span
				></a
			>
			<div class="settings">
				<button
					class="quiet-button sound-toggle"
					aria-pressed={state.sound}
					aria-label="Sound"
					title="Turn quiet placement sounds on or off"
					onclick={toggleSound}
					><span class="sound-icon" aria-hidden="true">♫</span>
					<span>{state.sound ? 'Sound on' : 'Sound off'}</span></button
				>
				<details class="options" bind:open={optionsOpen}>
					<summary class="quiet-button">Options</summary>
					<div class="options-panel">
						<label
							><input type="checkbox" checked={state.reduceMotion} onchange={toggleMotion} /> Reduce motion</label
						>
						<p>Your device’s reduced motion setting is always respected.</p>
						<p>
							<strong>Keyboard</strong><br />Tab to an object and press Enter or Space. Then do the
							same on its dish. Escape clears a selection.
						</p>
						<a class="games-link" href={resolve('/blog/[category]', { category: 'games' })}
							>Back to Games</a
						>
					</div>
				</details>
			</div>
		</header>
		<div class="intro">
			<h1 class="title" id="sort-the-tray-title">Sort the Tray</h1>
			<p id="sort-the-tray-instructions">
				Move each object to its dish.<br /><span>Drag, or tap an object and then its dish.</span>
			</p>
		</div>
		<section class="game" aria-label="Sorting table" aria-describedby="sort-the-tray-instructions">
			<div class="dishes" role="group" aria-label="Dishes">
				{#each TYPES as type (type)}
					{@const placed = state.sorted
						.map((id) => state.objects.find((object) => object.id === id)!)
						.filter((object) => object.type === type)}
					<button
						class="dish"
						class:over={hoveredDish === type}
						data-type={type}
						aria-label={`${names[type]}s dish, ${placed.length} placed`}
						onclick={(event) => dishClick(event, type)}
					>
						<span class="bowl">
							<span class="dish-guide" aria-hidden="true"
								>{#if placed.length === 0}{@html objectSvg(type, 0)}{/if}</span
							>
							<span class="contents" aria-hidden="true"
								>{#each placed as object (object.id)}<span class="placed-object"
										>{@html objectSvg(type, object.variant)}</span
									>{/each}</span
							>
						</span>
						<span class="dish-label">{names[type]}s</span>
					</button>
				{/each}
			</div>
			<div class="tray" class:complete role="group" aria-label="Objects to sort">
				<div class="objects">
					{#each state.objects as object (object.id)}
						<div class="slot">
							{#if !state.sorted.includes(object.id)}
								<button
									class="object"
									class:is-dragging={draggingId === object.id}
									data-id={object.id}
									aria-label={`${names[object.type]} ${object.variant + 1}`}
									aria-pressed={selected === object.id}
									style={`--turn: ${turns[object.id]}deg`}
									onclick={(event) => selectFromClick(event, object)}
									onpointerdown={(event) => pointerDown(event, object)}
									onpointermove={pointerMove}
									onpointerup={(event) => finishPointer(event)}
									onpointercancel={(event) => finishPointer(event, true)}
									onlostpointercapture={(event) => finishPointer(event, true)}
								>
									{@html objectSvg(object.type, object.variant)}
								</button>
							{/if}
						</div>
					{/each}
				</div>
				<span class="tray-caption" aria-hidden="true">A FEW LITTLE THINGS</span>
			</div>
			<div class="after-tray">
				<p class="status" role="status" aria-live="polite" aria-atomic="true">{status}</p>
				{#if complete}<button class="primary-button" onclick={anotherTray}
						>Another tray <span aria-hidden="true">↗</span></button
					>{/if}
			</div>
		</section>
		<footer class="tray-footer">
			<span class="save-dot" aria-hidden="true"></span><span>{saveStatus}</span>
		</footer>
		<noscript
			>This game needs JavaScript to move and save the objects. The instructions and preview remain
			available.</noscript
		>
	</div>
	{#if ghost}<div
			class="drag-ghost"
			aria-hidden="true"
			style={`left:${ghost.x}px;top:${ghost.y}px`}
		>
			{@html objectSvg(ghost.object.type, ghost.object.variant)}
		</div>{/if}
</section>

<style>
	.sort-tray {
		color-scheme: light;
		--paper: #f6f3ec;
		--ink: #343d35;
		--muted: #60685f;
		--accent: #48664e;
		--line: #d9d9cc;
		font-family:
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		color: var(--ink);
		background: var(--paper);
		font-synthesis: none;
	}
	* {
		box-sizing: border-box;
	}
	button,
	input,
	summary {
		-webkit-tap-highlight-color: transparent;
	}
	button {
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
	button,
	summary {
		touch-action: manipulation;
	}
	button:focus-visible,
	summary:focus-visible,
	input:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 5px;
	}
	.tray-page {
		width: min(880px, 100%);
		margin: auto;
		padding: 28px 36px 24px;
	}
	.masthead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.wordmark {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 10px;
		letter-spacing: 1.9px;
		font-weight: 650;
	}
	.mark {
		display: flex;
		gap: 3px;
		align-items: center;
	}
	.mark i {
		display: block;
		width: 6px;
		height: 13px;
		border-radius: 6px;
		background: #91a18b;
		transform: rotate(22deg);
	}
	.mark i:nth-child(2) {
		height: 19px;
		background: #6f876e;
	}
	.mark i:last-child {
		height: 11px;
		background: #b7bd9f;
	}
	.settings {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.quiet-button {
		padding: 10px 12px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 8px;
		color: #515c52;
		font-size: 13px;
		min-height: 44px;
	}
	.quiet-button:hover {
		background: #e9eade;
	}
	.quiet-button[aria-pressed='true'] {
		background: #e4e9de;
	}
	.sound-icon {
		margin-right: 4px;
		font-size: 16px;
	}
	details {
		position: relative;
	}
	summary {
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.options-panel {
		position: absolute;
		right: 0;
		top: 49px;
		z-index: 10;
		width: 275px;
		background: #fffdf7;
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 20px;
		box-shadow: 0 12px 40px #34413215;
		font-size: 14px;
		line-height: 1.6;
	}
	.options-panel label {
		display: flex;
		gap: 10px;
		align-items: center;
		min-height: 36px;
	}
	.options-panel input {
		accent-color: var(--accent);
		width: 18px;
		height: 18px;
	}
	.options-panel p {
		margin: 12px 0 0;
		color: var(--muted);
		font-size: 13px;
	}
	.intro {
		text-align: center;
		padding: 39px 0 23px;
	}
	.title {
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 54px;
		letter-spacing: -1.8px;
		font-weight: 400;
		margin: 0 0 17px;
		line-height: 1.1;
	}
	.intro p {
		font-size: 17px;
		line-height: 1.65;
		margin: 0;
	}
	.intro p span {
		font-size: 14px;
		color: var(--muted);
	}
	.game {
		max-width: 690px;
		margin: auto;
	}
	.dishes {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 22px;
		padding: 7px 27px 27px;
	}
	.dish {
		border: 0;
		background: transparent;
		padding: 5px;
		border-radius: 17px;
		position: relative;
		min-width: 0;
	}
	.bowl {
		display: flex;
		position: relative;
		align-items: center;
		justify-content: center;
		width: 100%;
		aspect-ratio: 1.24;
		border-radius: 50%;
		background: linear-gradient(150deg, #fefcf6 4%, #ece9dc 70%, #e4e1d3);
		border: 1px solid #d4d2c5;
		box-shadow:
			0 6px 5px -5px #5c5b4536,
			inset 0 2px 2px #ffffff;
	}
	.bowl::before {
		content: '';
		position: absolute;
		inset: 12px;
		border-radius: 50%;
		border: 1px solid #dedbce;
		background: linear-gradient(150deg, #e0ddcf, #eeebdf 50%, #f3f0e7);
		box-shadow: inset 1px 3px 7px #807c6615;
	}
	.dish-label {
		display: block;
		margin-top: 15px;
		font-size: 15px;
		font-weight: 550;
		letter-spacing: 0.2px;
	}
	.dish:hover .bowl {
		border-color: #899b80;
	}
	.dish.over .bowl {
		outline: 3px solid #718b67;
		outline-offset: 3px;
	}
	.dish-guide {
		position: relative;
		width: 45px;
		height: 45px;
		opacity: 0.16;
		filter: grayscale(1);
	}
	.dish-guide :global(svg) {
		width: 100%;
		height: 100%;
	}
	.contents {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.placed-object {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 65px;
		height: 65px;
		transform: translate(-50%, -50%) rotate(-10deg);
		filter: drop-shadow(0 3px 2px #323a3220);
	}
	.placed-object:nth-child(2) {
		transform: translate(-25%, -41%) rotate(15deg);
	}
	.contents:has(.placed-object:nth-child(2)) .placed-object:first-child {
		transform: translate(-79%, -61%) rotate(-12deg);
	}
	.tray {
		position: relative;
		border: 1px solid #cec4af;
		border-radius: 26px;
		padding: 18px 30px 32px;
		min-height: 260px;
		background: linear-gradient(125deg, #e9e0cf, #e5dccb 55%, #e0d5c1);
		box-shadow:
			inset 0 0 0 7px #eee6d7,
			inset 0 0 0 8px #d8cdb9,
			0 9px 14px -12px #5a513c66;
	}
	.tray::before {
		position: absolute;
		content: '';
		inset: 14px;
		border: 1px solid #c9bda74d;
		border-radius: 14px;
		pointer-events: none;
	}
	.objects {
		position: relative;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 7px 20px;
		min-height: 208px;
	}
	.slot {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100px;
	}
	.object {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100px;
		height: 94px;
		border: 2px solid transparent;
		border-radius: 22px;
		background: transparent;
		padding: 7px;
		touch-action: none;
		user-select: none;
		position: relative;
		cursor: grab;
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	.object :global(svg) {
		width: 78px;
		height: 78px;
		overflow: visible;
		transform: rotate(var(--turn, 0deg));
		filter: drop-shadow(0 5px 3px #393c3026);
		pointer-events: none;
		transition: transform 0.16s;
	}
	.object:hover {
		background: #fffcf326;
	}
	.object:hover :global(svg) {
		transform: translateY(-3px) rotate(var(--turn, 0deg));
	}
	.object[aria-pressed='true'] {
		background: #f9f8ec66;
		border-color: #6f8264;
	}
	.object.is-dragging {
		opacity: 0.18;
	}
	.drag-ghost {
		width: 80px;
		height: 80px;
		position: fixed;
		pointer-events: none;
		z-index: 20;
		filter: drop-shadow(0 8px 5px #33392e33);
		transform: translate(-50%, -50%) rotate(5deg);
	}
	.tray-caption {
		position: absolute;
		bottom: 15px;
		left: 0;
		right: 0;
		text-align: center;
		letter-spacing: 2.1px;
		font-size: 9px;
		color: #786e5a;
		pointer-events: none;
	}
	.tray.complete .tray-caption {
		opacity: 0.6;
	}
	.after-tray {
		text-align: center;
		min-height: 112px;
		padding: 22px 0 2px;
	}
	.status {
		font-size: 14px;
		line-height: 1.5;
		min-height: 23px;
		margin: 0 0 14px;
		color: #54624f;
	}
	.primary-button {
		padding: 13px 23px;
		border: 1px solid #496447;
		border-radius: 100px;
		background: #4b654c;
		color: #fffef8;
		font-size: 15px;
		min-height: 48px;
	}
	.primary-button:hover {
		background: #3e583f;
	}
	.primary-button span {
		margin-left: 17px;
	}
	.tray-footer {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: #697064;
		font-size: 12px;
		line-height: 1.7;
		text-align: center;
		margin-top: 9px;
	}
	.save-dot {
		flex: none;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #819477;
	}
	.sort-tray.reduce-motion *,
	.sort-tray.reduce-motion *::before {
		transition: none !important;
		animation: none !important;
	}
	.sort-tray.reduce-motion .object:hover :global(svg) {
		transform: rotate(var(--turn, 0deg));
	}
	noscript {
		display: block;
		padding: 20px;
		text-align: center;
	}
	@media (prefers-reduced-motion: reduce) {
		*,
		*::before {
			transition: none !important;
			animation: none !important;
		}
		.object:hover :global(svg) {
			transform: rotate(var(--turn, 0deg));
		}
	}
	@media (max-width: 600px) {
		.tray-page {
			padding: 17px 17px 22px;
		}
		.masthead {
			gap: 7px;
		}
		.wordmark {
			font-size: 8px;
			letter-spacing: 1px;
			gap: 6px;
		}
		.mark {
			gap: 2px;
		}
		.mark i {
			width: 4px;
		}
		.quiet-button {
			font-size: 12px;
			padding: 9px;
		}
		.intro {
			padding: 30px 0 19px;
		}
		.title {
			font-size: 44px;
			letter-spacing: -1.3px;
			margin-bottom: 13px;
		}
		.intro p {
			font-size: 16px;
		}
		.intro p span {
			font-size: 13px;
		}
		.dishes {
			gap: 12px;
			padding: 8px 5px 22px;
		}
		.dish {
			padding: 3px;
		}
		.bowl::before {
			inset: 8px;
		}
		.dish-label {
			font-size: 14px;
			margin-top: 13px;
		}
		.dish-guide {
			width: 34px;
			height: 34px;
		}
		.placed-object {
			width: 48px;
			height: 48px;
		}
		.tray {
			padding: 16px 15px 30px;
			border-radius: 23px;
			min-height: 245px;
		}
		.objects {
			gap: 3px 6px;
			min-height: 196px;
		}
		.slot {
			min-height: 94px;
		}
		.object {
			width: 85px;
			height: 88px;
			padding: 6px;
		}
		.object :global(svg) {
			width: 69px;
			height: 69px;
		}
		.after-tray {
			padding-top: 20px;
			min-height: 104px;
		}
		.tray-footer {
			font-size: 11px;
			margin-top: 4px;
		}
		.options-panel {
			width: 260px;
		}
		.tray-caption {
			font-size: 8px;
		}
	}
	@media (max-width: 350px) {
		.tray-page {
			padding-inline: 10px;
		}
		.wordmark {
			max-width: 114px;
			line-height: 1.5;
		}
		.object {
			width: 73px;
			height: 84px;
		}
		.object :global(svg) {
			width: 61px;
			height: 61px;
		}
		.intro p span {
			font-size: 12px;
		}
		.dishes {
			gap: 7px;
		}
		.dish-label {
			font-size: 13px;
		}
	}

	.sort-tray {
		isolation: isolate;
		text-align: left;
		min-height: 100svh;
		width: 100%;
		font-size: 16px;
		line-height: 1.5;
	}
	.wordmark {
		text-decoration: none;
		color: var(--ink);
	}
	.wordmark:focus-visible,
	.games-link:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 5px;
	}
	.games-link {
		display: inline-block;
		color: var(--accent);
		margin-top: 15px;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.placed-object :global(svg),
	.drag-ghost :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
	:global(html[data-motion='still']) .sort-tray * {
		transition: none !important;
		animation: none !important;
	}
	:global(html[data-motion='still']) .object:hover :global(svg) {
		transform: rotate(var(--turn, 0deg));
	}
	@media (forced-colors: active) {
		.object {
			border: 2px solid ButtonText;
		}
		.bowl {
			border: 2px solid ButtonText;
		}
		.object[aria-pressed='true'] {
			outline: 3px solid Highlight;
		}
		.sort-tray :global(svg) {
			forced-color-adjust: none;
		}
		.primary-button,
		.quiet-button {
			border: 1px solid ButtonText;
		}
	}
</style>
