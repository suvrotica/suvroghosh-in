<script lang="ts">
	import { onMount } from 'svelte';
	import {
		classifyThreshold,
		createPrng,
		deriveSubseed,
		fieldAngle,
		maskWeight,
		quantizeAngle,
		sampleField,
		type FieldSettings,
		type ThresholdSettings
	} from '$lib/visualizations/invisible-weather';

	type AnatomyStage = 1 | 2 | 3 | 4;
	type Panel = Readonly<{ x: number; y: number; width: number; height: number }>;
	type CanvasPalette = Readonly<{
		background: string;
		panel: string;
		panelEdge: string;
		ink: string;
		mutedInk: string;
		accent: string;
		accentInk: string;
		river: string;
		riverInk: string;
	}>;

	const uid = $props.id();
	const SHARED_SEED = 'field-anatomy-monsoon-1847';
	const FIELD_TIME = 0.317;
	const PLAIN_FIELD: FieldSettings = {
		noiseMode: 'gradient',
		depth: 1,
		frequency: 2.15,
		warpStrength: 0,
		timeScale: 0,
		seed: SHARED_SEED
	};
	const WARPED_FIELD: FieldSettings = {
		...PLAIN_FIELD,
		depth: 3,
		warpStrength: 0.82
	};
	const RIVER_THRESHOLD: ThresholdSettings = {
		mode: 'river',
		centre: 0.5,
		width: 0.13,
		tail: 0.22
	};
	const stages = [
		{
			id: 1,
			short: 'Plain field',
			title: 'Plain coherent noise',
			description:
				'Nearby coordinates receive nearby values. The result is a smooth landscape, not television snow.',
			observation:
				'Look for broad hills and valleys. Every later panel measures this same seeded weather.'
		},
		{
			id: 2,
			short: 'Warped field',
			title: 'Weather folded through itself',
			description:
				'Nested sampling bends the coordinates with earlier noise before asking for the final value.',
			observation: 'The field stays coherent, but channels pinch, curl and gather local structure.'
		},
		{
			id: 3,
			short: 'Directions',
			title: 'Free and quantized directions',
			description:
				'The field first supplies unrestricted angles. The right half snaps the same directions to a 45° alphabet.',
			observation: 'No weather changed. Only the permitted directional grammar changed.'
		},
		{
			id: 4,
			short: 'Clipped print',
			title: 'A boundary, paths and a river band',
			description:
				'Paths follow the quantized field inside an arch. Values near one half become the dark river-like band.',
			observation:
				'The field becomes an object only when a boundary and a threshold decide what may appear.'
		}
	] as const;

	let canvasHost: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let selectedStage = $state<AnatomyStage>(1);
	let highContrast = $state(false);
	let reducedMotion = $state(false);
	let mounted = false;
	let drawFrame = 0;
	let lastWidth = 0;
	let currentStage = $derived(stages[selectedStage - 1]);

	function clamp(value: number, minimum = 0, maximum = 1): number {
		return Math.min(maximum, Math.max(minimum, value));
	}

	function mixChannel(from: number, to: number, amount: number): number {
		return Math.round(from + (to - from) * clamp(amount));
	}

	function noiseColour(value: number, contrast: boolean): string {
		const level = clamp(value);
		if (contrast) {
			const shade = level < 0.34 ? 18 : level < 0.67 ? 128 : 244;
			return `rgb(${shade} ${shade} ${shade})`;
		}
		const low = [31, 42, 47] as const;
		const high = [226, 216, 190] as const;
		return `rgb(${mixChannel(low[0], high[0], level)} ${mixChannel(low[1], high[1], level)} ${mixChannel(low[2], high[2], level)})`;
	}

	function canvasPalette(): CanvasPalette {
		if (highContrast) {
			return {
				background: '#ffffff',
				panel: '#ffffff',
				panelEdge: '#000000',
				ink: '#000000',
				mutedInk: '#333333',
				accent: '#000000',
				accentInk: '#ffffff',
				river: '#000000',
				riverInk: '#ffffff'
			};
		}
		return {
			background: '#e7e0d3',
			panel: '#f4efe4',
			panelEdge: '#786e61',
			ink: '#172729',
			mutedInk: '#625d54',
			accent: '#143f46',
			accentInk: '#f7f1e4',
			river: '#172f35',
			riverInk: '#eee4cd'
		};
	}

	function canvasHeight(width: number): number {
		if (width < 560) {
			const panelHeight = clamp(width * 0.53, 160, 218);
			return Math.round(18 + panelHeight * 4 + 12 * 3 + 18);
		}
		const panelWidth = (width - 48) / 2;
		const panelHeight = clamp(panelWidth * 0.66, 210, 300);
		return Math.round(18 + panelHeight * 2 + 14 + 18);
	}

	function panelsFor(width: number, height: number): readonly Panel[] {
		const padding = 18;
		if (width < 560) {
			const gap = 12;
			const panelHeight = (height - padding * 2 - gap * 3) / 4;
			return Array.from({ length: 4 }, (_, index) => ({
				x: padding,
				y: padding + index * (panelHeight + gap),
				width: width - padding * 2,
				height: panelHeight
			}));
		}
		const columnGap = 12;
		const rowGap = 14;
		const panelWidth = (width - padding * 2 - columnGap) / 2;
		const panelHeight = (height - padding * 2 - rowGap) / 2;
		return Array.from({ length: 4 }, (_, index) => ({
			x: padding + (index % 2) * (panelWidth + columnGap),
			y: padding + Math.floor(index / 2) * (panelHeight + rowGap),
			width: panelWidth,
			height: panelHeight
		}));
	}

	function inset(panel: Panel, top = 42, side = 12, bottom = 12): Panel {
		return {
			x: panel.x + side,
			y: panel.y + top,
			width: Math.max(1, panel.width - side * 2),
			height: Math.max(1, panel.height - top - bottom)
		};
	}

	function roundedRect(
		context: CanvasRenderingContext2D,
		x: number,
		y: number,
		width: number,
		height: number,
		radius: number
	): void {
		const r = Math.min(radius, width / 2, height / 2);
		context.beginPath();
		context.moveTo(x + r, y);
		context.arcTo(x + width, y, x + width, y + height, r);
		context.arcTo(x + width, y + height, x, y + height, r);
		context.arcTo(x, y + height, x, y, r);
		context.arcTo(x, y, x + width, y, r);
		context.closePath();
	}

	function drawPanelFrame(
		context: CanvasRenderingContext2D,
		panel: Panel,
		index: number,
		palette: CanvasPalette
	): void {
		const active = selectedStage === index + 1;
		context.save();
		roundedRect(context, panel.x, panel.y, panel.width, panel.height, 10);
		context.fillStyle = palette.panel;
		context.fill();
		context.lineWidth = active ? 4 : 1.25;
		context.strokeStyle = active ? palette.accent : palette.panelEdge;
		context.stroke();

		context.beginPath();
		context.arc(panel.x + 21, panel.y + 21, 13, 0, Math.PI * 2);
		context.fillStyle = active ? palette.accent : palette.panel;
		context.fill();
		context.lineWidth = 1.5;
		context.strokeStyle = active ? palette.accent : palette.panelEdge;
		context.stroke();
		context.fillStyle = active ? palette.accentInk : palette.ink;
		context.font = '700 12px system-ui, sans-serif';
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillText(String(index + 1), panel.x + 21, panel.y + 21.5);

		context.fillStyle = palette.ink;
		context.font = '700 12px system-ui, sans-serif';
		context.textAlign = 'left';
		context.fillText(stages[index].short, panel.x + 42, panel.y + 21.5);
		context.restore();
	}

	function drawNoise(
		context: CanvasRenderingContext2D,
		area: Panel,
		settings: FieldSettings
	): void {
		context.save();
		roundedRect(context, area.x, area.y, area.width, area.height, 5);
		context.clip();
		const sampleSize = area.width < 320 ? 4 : 5;
		for (let y = 0; y < area.height; y += sampleSize) {
			for (let x = 0; x < area.width; x += sampleSize) {
				const u = (x + sampleSize * 0.5) / Math.max(1, area.width);
				const v = (y + sampleSize * 0.5) / Math.max(1, area.height);
				const value = sampleField(u, v, FIELD_TIME, settings);
				context.fillStyle = noiseColour(value, highContrast);
				context.fillRect(area.x + x, area.y + y, sampleSize + 0.5, sampleSize + 0.5);
			}
		}
		context.restore();
	}

	function drawArrow(
		context: CanvasRenderingContext2D,
		x: number,
		y: number,
		angle: number,
		length: number,
		colour: string,
		lineWidth: number
	): void {
		const half = length / 2;
		const fromX = x - Math.cos(angle) * half;
		const fromY = y - Math.sin(angle) * half;
		const toX = x + Math.cos(angle) * half;
		const toY = y + Math.sin(angle) * half;
		const head = Math.max(2.5, length * 0.18);
		context.beginPath();
		context.moveTo(fromX, fromY);
		context.lineTo(toX, toY);
		context.moveTo(toX, toY);
		context.lineTo(
			toX - Math.cos(angle - Math.PI / 5) * head,
			toY - Math.sin(angle - Math.PI / 5) * head
		);
		context.moveTo(toX, toY);
		context.lineTo(
			toX - Math.cos(angle + Math.PI / 5) * head,
			toY - Math.sin(angle + Math.PI / 5) * head
		);
		context.strokeStyle = colour;
		context.lineWidth = lineWidth;
		context.lineCap = 'round';
		context.lineJoin = 'round';
		context.stroke();
	}

	function drawDirections(
		context: CanvasRenderingContext2D,
		area: Panel,
		palette: CanvasPalette
	): void {
		context.save();
		roundedRect(context, area.x, area.y, area.width, area.height, 5);
		context.clip();
		context.fillStyle = highContrast ? '#ffffff' : '#e9e1d2';
		context.fillRect(area.x, area.y, area.width, area.height);

		const divider = area.x + area.width / 2;
		context.setLineDash([4, 5]);
		context.strokeStyle = palette.panelEdge;
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(divider, area.y + 5);
		context.lineTo(divider, area.y + area.height - 5);
		context.stroke();
		context.setLineDash([]);

		context.fillStyle = palette.mutedInk;
		context.font = '700 10px system-ui, sans-serif';
		context.textBaseline = 'top';
		context.fillText('FREE', area.x + 8, area.y + 7);
		context.fillText('45°', divider + 8, area.y + 7);

		const columns = area.width < 310 ? 8 : 10;
		const rows = area.height < 150 ? 4 : 5;
		const top = area.y + 27;
		const usableHeight = Math.max(20, area.height - 34);
		for (let row = 0; row < rows; row += 1) {
			for (let column = 0; column < columns; column += 1) {
				const u = (column + 0.5) / columns;
				const v = (row + 0.5) / rows;
				const x = area.x + u * area.width;
				const y = top + v * usableHeight;
				const angle = fieldAngle(u, v, FIELD_TIME, WARPED_FIELD);
				const shown =
					x < divider ? angle : quantizeAngle(angle, 'diagonal', { x: u, y: v, softness: 0 });
				drawArrow(
					context,
					x,
					y,
					shown,
					Math.min(area.width / columns, usableHeight / rows) * 0.67,
					x < divider ? palette.mutedInk : palette.accent,
					x < divider ? 1.15 : 1.75
				);
			}
		}
		context.restore();
	}

	function drawRiverBand(
		context: CanvasRenderingContext2D,
		area: Panel,
		palette: CanvasPalette
	): void {
		const cell = area.width < 320 ? 4 : 5;
		for (let y = 0; y < area.height; y += cell) {
			for (let x = 0; x < area.width; x += cell) {
				const u = (x + cell * 0.5) / Math.max(1, area.width);
				const v = (y + cell * 0.5) / Math.max(1, area.height);
				const boundary = maskWeight('arch', u, v);
				if (boundary <= 0.02) continue;
				const classification = classifyThreshold(
					sampleField(u, v, FIELD_TIME, WARPED_FIELD),
					RIVER_THRESHOLD
				);
				if (!classification.selected) continue;
				context.globalAlpha = clamp(classification.weight * boundary, 0.2, 1);
				context.fillStyle = palette.river;
				context.fillRect(area.x + x, area.y + y, cell + 0.5, cell + 0.5);
			}
		}
		context.globalAlpha = 1;
	}

	function drawPrint(context: CanvasRenderingContext2D, area: Panel, palette: CanvasPalette): void {
		context.save();
		roundedRect(context, area.x, area.y, area.width, area.height, 5);
		context.clip();
		context.fillStyle = palette.panel;
		context.fillRect(area.x, area.y, area.width, area.height);
		drawRiverBand(context, area, palette);

		const random = createPrng(deriveSubseed(SHARED_SEED, 'field-anatomy-paths'));
		const pathCount = Math.round(clamp((area.width * area.height) / 440, 90, 250));
		const stepLength = area.width < 320 ? 0.018 : 0.014;
		for (let pathIndex = 0; pathIndex < pathCount; pathIndex += 1) {
			let u = random.float(0.04, 0.96);
			let v = random.float(0.05, 0.95);
			if (maskWeight('arch', u, v) <= 0.1) continue;
			const initial = classifyThreshold(
				sampleField(u, v, FIELD_TIME, WARPED_FIELD),
				RIVER_THRESHOLD
			);
			context.beginPath();
			context.moveTo(area.x + u * area.width, area.y + v * area.height);
			let points = 0;
			for (let step = 0; step < 20; step += 1) {
				const angle = quantizeAngle(fieldAngle(u, v, FIELD_TIME, WARPED_FIELD), 'diagonal', {
					x: u,
					y: v,
					softness: 0
				});
				u += Math.cos(angle) * stepLength;
				v += Math.sin(angle) * stepLength * (area.width / Math.max(1, area.height));
				if (u < 0 || u > 1 || v < 0 || v > 1 || maskWeight('arch', u, v) <= 0.02) break;
				context.lineTo(area.x + u * area.width, area.y + v * area.height);
				points += 1;
			}
			if (points === 0) continue;
			context.strokeStyle = initial.selected ? palette.riverInk : palette.ink;
			context.globalAlpha = initial.selected ? 0.9 : 0.56;
			context.lineWidth = initial.selected ? 1.25 : 0.8;
			context.lineCap = 'round';
			context.stroke();
		}
		context.globalAlpha = 1;

		context.beginPath();
		for (let index = 0; index <= 96; index += 1) {
			const angle = Math.PI - (Math.PI * index) / 96;
			const u = 0.5 + Math.cos(angle) * 0.42;
			const v = 0.47 - Math.sin(angle) * 0.42;
			const x = area.x + u * area.width;
			const y = area.y + v * area.height;
			if (index === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		}
		context.lineTo(area.x + area.width * 0.92, area.y + area.height * 0.94);
		context.lineTo(area.x + area.width * 0.08, area.y + area.height * 0.94);
		context.closePath();
		context.strokeStyle = palette.ink;
		context.lineWidth = highContrast ? 2.4 : 1.4;
		context.stroke();
		context.restore();
	}

	function draw(): void {
		drawFrame = 0;
		if (!canvas || !canvasHost) return;
		const context = canvas.getContext('2d');
		if (!context) return;
		const width = Math.max(1, Math.round(canvasHost.clientWidth));
		const height = canvasHeight(width);
		const density = Math.min(window.devicePixelRatio || 1, width < 560 ? 1.25 : 1.5);
		const pixelWidth = Math.max(1, Math.round(width * density));
		const pixelHeight = Math.max(1, Math.round(height * density));
		if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
			canvas.width = pixelWidth;
			canvas.height = pixelHeight;
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
		}
		context.setTransform(density, 0, 0, density, 0, 0);
		context.clearRect(0, 0, width, height);
		const palette = canvasPalette();
		context.fillStyle = palette.background;
		context.fillRect(0, 0, width, height);
		const panels = panelsFor(width, height);
		for (let index = 0; index < panels.length; index += 1) {
			drawPanelFrame(context, panels[index], index, palette);
			const area = inset(panels[index]);
			if (index === 0) drawNoise(context, area, PLAIN_FIELD);
			else if (index === 1) drawNoise(context, area, WARPED_FIELD);
			else if (index === 2) drawDirections(context, area, palette);
			else drawPrint(context, area, palette);
		}
	}

	function scheduleDraw(): void {
		if (!mounted || drawFrame !== 0) return;
		drawFrame = window.requestAnimationFrame(draw);
	}

	function selectStage(value: number): void {
		selectedStage = Math.round(clamp(value, 1, 4)) as AnatomyStage;
	}

	$effect(() => {
		void selectedStage;
		void highContrast;
		if (mounted) scheduleDraw();
	});

	onMount(() => {
		mounted = true;
		canvas.setAttribute('role', 'img');
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const contrastQuery = window.matchMedia('(forced-colors: active)');
		let resizeObserver: ResizeObserver | null = null;
		let themeObserver: MutationObserver | null = null;

		const syncPreferences = () => {
			reducedMotion = motionQuery.matches || document.documentElement.dataset.motion === 'still';
			highContrast =
				contrastQuery.matches || document.documentElement.dataset.theme === 'high-contrast';
			scheduleDraw();
		};
		const resize = () => {
			const width = Math.round(canvasHost.clientWidth);
			if (width === lastWidth) return;
			lastWidth = width;
			scheduleDraw();
		};

		syncPreferences();
		if (typeof ResizeObserver === 'undefined') window.addEventListener('resize', resize);
		else {
			resizeObserver = new ResizeObserver(resize);
			resizeObserver.observe(canvasHost);
		}
		themeObserver = new MutationObserver(syncPreferences);
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme', 'data-motion']
		});
		motionQuery.addEventListener('change', syncPreferences);
		contrastQuery.addEventListener('change', syncPreferences);
		window.addEventListener('site-motion-change', syncPreferences);
		scheduleDraw();

		return () => {
			mounted = false;
			if (drawFrame !== 0) window.cancelAnimationFrame(drawFrame);
			drawFrame = 0;
			resizeObserver?.disconnect();
			themeObserver?.disconnect();
			window.removeEventListener('resize', resize);
			motionQuery.removeEventListener('change', syncPreferences);
			contrastQuery.removeEventListener('change', syncPreferences);
			window.removeEventListener('site-motion-change', syncPreferences);
		};
	});
</script>

<section
	class="field-anatomy"
	class:reduced-motion={reducedMotion}
	aria-labelledby={`${uid}-title`}
	data-testid="invisible-weather-field-anatomy"
>
	<header>
		<p class="eyebrow">One seed · four mathematical instruments</p>
		<h2 id={`${uid}-title`}>Field anatomy</h2>
		<p id={`${uid}-summary`} class="introduction">
			The four views below share the fixed seed <code>{SHARED_SEED}</code>. Move the stage control
			to highlight each transformation; the diagrams themselves remain still.
		</p>
	</header>

	<div bind:this={canvasHost} class="canvas-host">
		<canvas
			bind:this={canvas}
			aria-label="Four synchronized diagrams: plain coherent noise, nested warped noise, free and 45-degree quantized vectors, and a clipped arch print crossed by a river band"
			aria-describedby={`${uid}-summary ${uid}-active-description`}
		>
			Four synchronized views explain coherent noise, coordinate warping, direction quantization,
			clipping, and river thresholding.
		</canvas>
		<noscript>
			<p>The diagrams require JavaScript, but all four transformations are described below.</p>
		</noscript>
	</div>

	<fieldset class="scrubber">
		<legend>Highlight a stage</legend>
		<label for={`${uid}-stage`}>Stage {selectedStage} of 4: {currentStage.short}</label>
		<input
			id={`${uid}-stage`}
			type="range"
			min="1"
			max="4"
			step="1"
			value={selectedStage}
			oninput={(event) => selectStage(Number(event.currentTarget.value))}
			aria-valuetext={`${selectedStage}. ${currentStage.title}`}
		/>
		<div class="range-labels" aria-hidden="true">
			<span>1</span><span>2</span><span>3</span><span>4</span>
		</div>
	</fieldset>

	<ol class="stage-list" aria-label="Field anatomy stages">
		{#each stages as stage (stage.id)}
			<li class:active={selectedStage === stage.id}>
				<button
					type="button"
					onclick={() => selectStage(stage.id)}
					aria-pressed={selectedStage === stage.id}
					aria-controls={`${uid}-active-description`}
				>
					<span class="stage-number" aria-hidden="true">{stage.id}</span>
					<span><strong>{stage.title}</strong><small>{stage.description}</small></span>
				</button>
			</li>
		{/each}
	</ol>

	<article id={`${uid}-active-description`} class="active-description" aria-live="polite">
		<p class="stage-kicker">Stage {selectedStage} · {currentStage.short}</p>
		<h3>{currentStage.title}</h3>
		<p>{currentStage.description}</p>
		<p class="observation"><strong>What to notice:</strong> {currentStage.observation}</p>
	</article>
</section>

<style>
	.field-anatomy {
		--anatomy-paper: #f1ece2;
		--anatomy-panel: #fbf8f1;
		--anatomy-ink: #182628;
		--anatomy-muted: #665f55;
		--anatomy-line: #c6bcad;
		--anatomy-accent: #15515b;
		--anatomy-accent-soft: #d7e7e4;
		margin: 2.5rem 0;
		padding: clamp(1rem, 3vw, 1.75rem);
		border: 1px solid var(--anatomy-line);
		border-radius: 1rem;
		background: var(--anatomy-paper);
		color: var(--anatomy-ink);
		box-shadow: 0 1rem 2.5rem rgb(41 35 27 / 10%);
	}

	.field-anatomy header {
		max-width: 48rem;
	}

	.eyebrow,
	.stage-kicker {
		margin: 0 0 0.35rem;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--anatomy-accent);
	}

	h2,
	h3,
	p {
		text-align: left;
	}

	h2 {
		margin: 0;
		font-size: clamp(1.65rem, 4vw, 2.4rem);
		line-height: 1.05;
		color: var(--anatomy-ink);
	}

	.introduction {
		margin: 0.75rem 0 0;
		max-width: 44rem;
		line-height: 1.65;
		color: var(--anatomy-muted);
	}

	code {
		padding: 0.08rem 0.3rem;
		border-radius: 0.25rem;
		background: rgb(24 38 40 / 8%);
		font-size: 0.86em;
		overflow-wrap: anywhere;
	}

	.canvas-host {
		position: relative;
		width: 100%;
		min-width: 0;
		margin-top: 1.25rem;
	}

	canvas {
		display: block;
		width: 100%;
		max-width: 100%;
		border-radius: 0.75rem;
		background: #e7e0d3;
	}

	.canvas-host noscript p {
		margin: 0.75rem 0 0;
		padding: 0.75rem;
		border: 1px dashed var(--anatomy-line);
		color: var(--anatomy-muted);
	}

	.scrubber {
		margin: 1.25rem 0 0;
		padding: 0.85rem 1rem 0.7rem;
		border: 1px solid var(--anatomy-line);
		border-radius: 0.75rem;
		background: var(--anatomy-panel);
	}

	.scrubber legend {
		padding: 0 0.35rem;
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--anatomy-muted);
	}

	.scrubber label {
		display: block;
		margin-bottom: 0.55rem;
		font-size: 0.9rem;
		font-weight: 700;
	}

	.scrubber input {
		width: 100%;
		min-height: 2.75rem;
		margin: 0;
		accent-color: var(--anatomy-accent);
		cursor: pointer;
	}

	.range-labels {
		display: flex;
		justify-content: space-between;
		margin-top: -0.45rem;
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--anatomy-muted);
	}

	.stage-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
		margin: 1rem 0 0;
		padding: 0;
		list-style: none;
	}

	.stage-list li,
	.stage-list button {
		min-width: 0;
	}

	.stage-list button {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr);
		align-items: start;
		gap: 0.65rem;
		width: 100%;
		min-height: 4.75rem;
		padding: 0.8rem;
		border: 1px solid var(--anatomy-line);
		border-radius: 0.7rem;
		background: var(--anatomy-panel);
		color: var(--anatomy-ink);
		text-align: left;
		cursor: pointer;
		transition:
			border-color 150ms ease,
			background-color 150ms ease,
			transform 150ms ease;
	}

	.stage-list button:hover {
		border-color: var(--anatomy-accent);
		transform: translateY(-1px);
	}

	.stage-list .active button {
		border-width: 2px;
		border-color: var(--anatomy-accent);
		background: var(--anatomy-accent-soft);
	}

	.stage-number {
		display: grid;
		width: 2rem;
		height: 2rem;
		place-items: center;
		border: 1px solid currentColor;
		border-radius: 999px;
		font-weight: 800;
	}

	.stage-list strong,
	.stage-list small {
		display: block;
	}

	.stage-list strong {
		font-size: 0.88rem;
		line-height: 1.25;
	}

	.stage-list small {
		margin-top: 0.3rem;
		font-size: 0.75rem;
		line-height: 1.38;
		color: var(--anatomy-muted);
	}

	.active-description {
		margin-top: 1rem;
		padding: 1rem;
		border-left: 4px solid var(--anatomy-accent);
		border-radius: 0 0.7rem 0.7rem 0;
		background: var(--anatomy-panel);
	}

	.active-description h3 {
		margin: 0;
		font-size: 1.15rem;
		color: var(--anatomy-ink);
	}

	.active-description p:not(.stage-kicker) {
		margin: 0.45rem 0 0;
		line-height: 1.55;
		color: var(--anatomy-muted);
	}

	.active-description .observation {
		color: var(--anatomy-ink);
	}

	.stage-list button:focus-visible,
	.scrubber input:focus-visible {
		outline: 3px solid var(--anatomy-accent);
		outline-offset: 3px;
	}

	:global(.dark) .field-anatomy,
	:global(html[data-theme='dark']) .field-anatomy {
		--anatomy-paper: #171918;
		--anatomy-panel: #222624;
		--anatomy-ink: #f3eee4;
		--anatomy-muted: #c6beb0;
		--anatomy-line: #625d54;
		--anatomy-accent: #9edbd5;
		--anatomy-accent-soft: #173b3c;
		box-shadow: 0 1rem 2.5rem rgb(0 0 0 / 24%);
	}

	:global(html[data-theme='high-contrast']) .field-anatomy {
		--anatomy-paper: #ffffff;
		--anatomy-panel: #ffffff;
		--anatomy-ink: #000000;
		--anatomy-muted: #000000;
		--anatomy-line: #000000;
		--anatomy-accent: #000000;
		--anatomy-accent-soft: #ffffff;
		border-width: 2px;
		box-shadow: none;
	}

	:global(html[data-theme='high-contrast']) .stage-list .active button {
		outline: 3px double #000000;
		outline-offset: 2px;
	}

	.field-anatomy.reduced-motion .stage-list button {
		transition: none;
	}

	.field-anatomy.reduced-motion .stage-list button:hover {
		transform: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.stage-list button {
			transition: none;
		}

		.stage-list button:hover {
			transform: none;
		}
	}

	@media (forced-colors: active) {
		.field-anatomy,
		.stage-list button,
		.scrubber,
		.active-description {
			forced-color-adjust: auto;
			border-color: CanvasText;
		}

		canvas {
			forced-color-adjust: none;
		}
	}

	@media (max-width: 36rem) {
		.field-anatomy {
			padding: 0.8rem;
			border-radius: 0.75rem;
		}

		.stage-list {
			grid-template-columns: 1fr;
		}

		.stage-list button {
			min-height: 4.25rem;
		}
	}
</style>
