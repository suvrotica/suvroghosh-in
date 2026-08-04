<script lang="ts">
	import { GaussianSampler } from '$lib/visualizations/brownian-motion/gaussian';
	import { SeededRandom } from '$lib/utils/seeded-random';

	interface Point {
		readonly time: number;
		readonly value: number;
	}

	const WIDTH = 800;
	const HEIGHT = 244;
	const PAD_X = 28;
	const PAD_Y = 24;
	const DIFFUSION = 1;

	let seed = $state('wiggle-1827');
	let level = $state(6);
	let centre = $state(0.5);
	let dragging = $state(false);
	let status = $state('Drag the brass window, then magnify it.');

	function clamp(value: number, minimum: number, maximum: number): number {
		return Math.max(minimum, Math.min(maximum, value));
	}

	/**
	 * Coordinate-addressed Brownian-bridge refinement. Every midpoint has its
	 * own stream, so requesting another level or visiting intervals in another
	 * order cannot alter any endpoint already on screen.
	 */
	function brownianBridge(refinementLevel: number): Point[] {
		const count = 2 ** refinementLevel;
		const values = new Float64Array(count + 1);
		for (let currentLevel = 1; currentLevel <= refinementLevel; currentLevel += 1) {
			const intervalCount = 2 ** (currentLevel - 1);
			const gridStride = count / intervalCount;
			const halfStride = gridStride / 2;
			const intervalDuration = 1 / intervalCount;
			for (let interval = 0; interval < intervalCount; interval += 1) {
				const left = interval * gridStride;
				const right = left + gridStride;
				const midpoint = left + halfStride;
				const sampler = new GaussianSampler(
					new SeededRandom(`${seed}:level:${currentLevel}:interval:${interval}:axis:y`)
				);
				values[midpoint] =
					(values[left] + values[right]) / 2 +
					Math.sqrt((DIFFUSION * intervalDuration) / 2) * sampler.next();
			}
		}
		return Array.from(values, (value, index) => ({ time: index / count, value }));
	}

	function range(points: readonly Point[]): { minimum: number; maximum: number } {
		let minimum = Number.POSITIVE_INFINITY;
		let maximum = Number.NEGATIVE_INFINITY;
		for (const point of points) {
			minimum = Math.min(minimum, point.value);
			maximum = Math.max(maximum, point.value);
		}
		const padding = Math.max(0.12, (maximum - minimum) * 0.12);
		return { minimum: minimum - padding, maximum: maximum + padding };
	}

	function polyline(
		points: readonly Point[],
		timeMinimum: number,
		timeMaximum: number,
		valueMinimum: number,
		valueMaximum: number
	): string {
		return points
			.map((point) => {
				const x =
					PAD_X +
					((point.time - timeMinimum) / Math.max(Number.EPSILON, timeMaximum - timeMinimum)) *
						(WIDTH - PAD_X * 2);
				const y =
					HEIGHT -
					PAD_Y -
					((point.value - valueMinimum) / Math.max(Number.EPSILON, valueMaximum - valueMinimum)) *
						(HEIGHT - PAD_Y * 2);
				return `${x.toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	}

	let path = $derived(brownianBridge(level));
	let pathRange = $derived(range(path));
	let windowWidth = $derived(Math.max(2 ** -(level - 3), 2 ** -9));
	let windowStart = $derived(clamp(centre - windowWidth / 2, 0, 1 - windowWidth));
	let windowEnd = $derived(windowStart + windowWidth);
	let detailedPath = $derived(brownianBridge(Math.min(14, level + 3)));
	let selectedPath = $derived(
		detailedPath.filter((point) => point.time >= windowStart && point.time <= windowEnd)
	);
	let selectedRange = $derived(range(selectedPath));
	let fullPoints = $derived(polyline(path, 0, 1, pathRange.minimum, pathRange.maximum));
	let selectedPoints = $derived(
		polyline(selectedPath, windowStart, windowEnd, selectedRange.minimum, selectedRange.maximum)
	);
	let apparentVelocity = $derived.by(() => {
		const count = 2 ** Math.min(14, level + 3);
		const index = clamp(Math.floor(centre * count), 0, count - 1);
		const left = detailedPath[index];
		const right = detailedPath[index + 1];
		return (right.value - left.value) / (right.time - left.time);
	});

	function setCentreFromPointer(event: PointerEvent): void {
		const target = event.currentTarget as SVGSVGElement;
		const bounds = target.getBoundingClientRect();
		const position = clamp((event.clientX - bounds.left) / Math.max(1, bounds.width), 0, 1);
		centre = clamp(position, windowWidth / 2, 1 - windowWidth / 2);
		status = `Magnifying an interval centred at t = ${centre.toFixed(4)}.`;
	}

	function pointerDown(event: PointerEvent): void {
		dragging = true;
		(event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
		setCentreFromPointer(event);
	}

	function pointerMove(event: PointerEvent): void {
		if (dragging) setCentreFromPointer(event);
	}

	function pointerUp(event: PointerEvent): void {
		dragging = false;
		(event.currentTarget as SVGSVGElement).releasePointerCapture(event.pointerId);
	}

	function magnify(): void {
		if (level >= 12) {
			status = 'The implemented refinement limit has been reached.';
			return;
		}
		level += 1;
		status = `Refinement level ${level}: old endpoints stayed fixed while new midpoints appeared.`;
	}

	function stepBack(): void {
		level = Math.max(5, level - 1);
		status = `Refinement level ${level}.`;
	}
</script>

<section class="wiggle not-prose" aria-labelledby="infinite-wiggle-title">
	<header>
		<div>
			<p class="eyebrow">Signature experiment</p>
			<h2 id="infinite-wiggle-title">The Infinite Wiggle</h2>
			<p>Magnification reveals fresh structure without rewriting a single old endpoint.</p>
		</div>
		<div class="scale">
			<span>selected time scale</span>
			<strong>{windowWidth.toExponential(2)} s</strong>
		</div>
	</header>

	<div class="toolbar" aria-label="Infinite Wiggle controls">
		<button type="button" onclick={stepBack} disabled={level <= 5}>Zoom out</button>
		<button type="button" class="primary" onclick={magnify} disabled={level >= 12}
			>Magnify ×2</button
		>
		<label>
			<span>Refinement level</span>
			<input type="range" min="5" max="12" step="1" bind:value={level} />
		</label>
		<label class="seed">
			<span>Seed</span>
			<input maxlength="48" bind:value={seed} />
		</label>
	</div>

	<div class="panels">
		<figure>
			<figcaption>Main Brownian-bridge segment — drag the selection window</figcaption>
			<svg
				viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
				role="img"
				aria-label="Brownian bridge with a draggable magnifying window"
				onpointerdown={pointerDown}
				onpointermove={pointerMove}
				onpointerup={pointerUp}
				onpointercancel={() => (dragging = false)}
			>
				<rect class="paper" x="0" y="0" width={WIDTH} height={HEIGHT} />
				<g class="grid" aria-hidden="true">
					{#each [0.25, 0.5, 0.75] as fraction (fraction)}
						<line x1={WIDTH * fraction} x2={WIDTH * fraction} y1="0" y2={HEIGHT} />
					{/each}
				</g>
				<polyline class="brownian" points={fullPoints} />
				<rect
					class="magnifier"
					x={PAD_X + windowStart * (WIDTH - PAD_X * 2)}
					y="8"
					width={windowWidth * (WIDTH - PAD_X * 2)}
					height={HEIGHT - 16}
				/>
			</svg>
		</figure>

		<figure>
			<figcaption>Selected interval — Brownian detail and a smooth comparison</figcaption>
			<svg
				viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
				role="img"
				aria-label="Magnified Brownian detail compared with a differentiable smooth curve"
			>
				<rect class="paper" x="0" y="0" width={WIDTH} height={HEIGHT} />
				<polyline class="brownian" points={selectedPoints} />
				<path
					class="smooth"
					d={`M ${PAD_X} ${HEIGHT / 2} C ${WIDTH * 0.3} ${HEIGHT * 0.18}, ${WIDTH * 0.7} ${HEIGHT * 0.82}, ${WIDTH - PAD_X} ${HEIGHT / 2}`}
				/>
				<text x={PAD_X + 8} y={HEIGHT - 12}>solid: Brownian refinement</text>
				<text class="smooth-label" x={WIDTH - PAD_X - 8} y={HEIGHT - 12} text-anchor="end"
					>dashed: smooth curve</text
				>
			</svg>
		</figure>
	</div>

	<div class="readouts">
		<div>
			<span>Smallest displayed Δt</span><strong
				>{(2 ** -Math.min(14, level + 3)).toExponential(2)} s</strong
			>
		</div>
		<div><span>Local Δx/Δt</span><strong>{apparentVelocity.toFixed(2)}</strong></div>
		<div>
			<span>Generated points</span><strong
				>{(2 ** Math.min(14, level + 3) + 1).toLocaleString('en-IN')}</strong
			>
		</div>
	</div>

	<p class="status" role="status">{status}</p>
	<p class="disclaimer">
		<strong>Finite-resolution instrument.</strong> The browser does not draw infinitely many points. It
		reveals a deterministic hierarchy with Brownian-bridge statistics down to level 14. The apparent velocity
		becomes unstable under refinement; that is evidence against ordinary differentiability, not a measurement
		of a hidden physical speed.
	</p>
</section>

<style>
	.wiggle {
		--lab-accent: #6f7fa8;
		--lab-rust: #9b5f48;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		box-sizing: border-box;
		width: min(84rem, calc(100vw - 1rem));
		margin: 2.5rem 0;
		transform: translateX(-50%);
		border: 1px solid var(--rule, #c8c1b2);
		border-radius: 0.65rem;
		background: var(--paper-raised, #f6f2e8);
		color: var(--ink, #242a32);
		font-family: Roboto, system-ui, sans-serif;
		overflow: hidden;
	}
	header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 1rem 1.2rem;
	}
	header h2,
	header p {
		margin: 0.2rem 0 0;
	}
	header > div > p:last-child {
		color: var(--ink-muted, #68707a);
		font-family: 'Source Serif 4', Georgia, serif;
	}
	.eyebrow {
		color: var(--lab-rust);
		font:
			700 0.68rem 'Courier Prime',
			monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.scale {
		min-width: 10rem;
		text-align: right;
	}
	.scale span,
	.readouts span {
		display: block;
		color: var(--ink-muted, #68707a);
		font-size: 0.66rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}
	.scale strong,
	.readouts strong {
		display: block;
		margin-top: 0.25rem;
		font:
			700 0.92rem 'Courier Prime',
			monospace;
	}
	.toolbar {
		display: flex;
		align-items: end;
		gap: 0.55rem;
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 0.7rem 1rem;
		background: var(--paper-soft, #ece6da);
	}
	button,
	input {
		font: inherit;
	}
	button,
	.seed input {
		min-height: 2.75rem;
		border: 1px solid var(--rule, #aaa293);
		border-radius: 0.35rem;
		background: var(--paper, #f7f2e8);
		padding: 0.5rem 0.75rem;
		color: var(--ink, #242a32);
	}
	button {
		font-weight: 700;
		cursor: pointer;
	}
	button.primary {
		background: var(--lab-accent);
		color: white;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--lab-accent) 72%, white);
		outline-offset: 2px;
	}
	.toolbar label {
		display: grid;
		min-width: 10rem;
		gap: 0.25rem;
		font-size: 0.7rem;
		font-weight: 700;
	}
	.toolbar label:nth-of-type(1) {
		flex: 1;
	}
	.seed input {
		box-sizing: border-box;
		width: 11rem;
		font-family: 'Courier Prime', monospace;
	}
	.panels {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
		padding: 0.8rem;
	}
	figure {
		min-width: 0;
		margin: 0;
	}
	figcaption {
		min-height: 2.4rem;
		padding: 0.2rem 0.25rem;
		color: var(--ink-muted, #68707a);
		font-size: 0.74rem;
		font-weight: 700;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		border: 1px solid var(--rule, #c8c1b2);
		touch-action: none;
		cursor: crosshair;
	}
	.paper {
		fill: color-mix(in srgb, var(--paper, #f4f0e6) 94%, var(--lab-accent));
	}
	.grid line {
		stroke: color-mix(in srgb, var(--rule, #c8c1b2) 60%, transparent);
	}
	.brownian,
	.smooth {
		fill: none;
		vector-effect: non-scaling-stroke;
	}
	.brownian {
		stroke: var(--lab-accent);
		stroke-width: 2;
	}
	.smooth {
		stroke: var(--lab-rust);
		stroke-width: 1.7;
		stroke-dasharray: 7 6;
	}
	.magnifier {
		fill: color-mix(in srgb, var(--lab-rust) 13%, transparent);
		stroke: var(--lab-rust);
		stroke-width: 3;
		vector-effect: non-scaling-stroke;
	}
	text {
		fill: var(--lab-accent);
		font:
			12px 'Courier Prime',
			monospace;
	}
	text.smooth-label {
		fill: var(--lab-rust);
	}
	.readouts {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border-top: 1px solid var(--rule, #c8c1b2);
		border-bottom: 1px solid var(--rule, #c8c1b2);
	}
	.readouts div {
		border-right: 1px solid var(--rule, #c8c1b2);
		padding: 0.7rem 1rem;
	}
	.readouts div:last-child {
		border-right: 0;
	}
	.status,
	.disclaimer {
		margin: 0;
		padding: 0.65rem 1rem;
		color: var(--ink-muted, #68707a);
		font-size: 0.78rem;
	}
	.disclaimer {
		border-top: 1px solid var(--rule, #c8c1b2);
		font-family: 'Source Serif 4', Georgia, serif;
		line-height: 1.5;
	}
	@media (max-width: 48rem) {
		.panels {
			grid-template-columns: 1fr;
		}
		.toolbar {
			flex-wrap: wrap;
		}
		.toolbar label {
			flex: 1 1 12rem;
		}
		.seed input {
			width: 100%;
		}
	}
	@media (max-width: 34rem) {
		.wiggle {
			width: calc(100vw - 0.5rem);
		}
		header {
			display: block;
		}
		.scale {
			margin-top: 0.75rem;
			text-align: left;
		}
		.readouts {
			grid-template-columns: 1fr;
		}
		.readouts div {
			border-right: 0;
			border-bottom: 1px solid var(--rule, #c8c1b2);
		}
	}
</style>
