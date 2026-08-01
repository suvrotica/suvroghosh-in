<script lang="ts">
	let re = $state(0.72);
	let im = $state(0.46);
	const c = { re: -0.55, im: 0.28 };

	let squared = $derived({ re: re * re - im * im, im: 2 * re * im });
	let translated = $derived({ re: squared.re + c.re, im: squared.im + c.im });
	let magnitude = $derived(Math.hypot(re, im));
	let angle = $derived((Math.atan2(im, re) * 180) / Math.PI);

	const scale = 50;
	const origin = 100;

	function pointX(value: number) {
		return origin + value * scale;
	}

	function pointY(value: number) {
		return origin - value * scale;
	}

	function updateFromPointer(event: PointerEvent) {
		const svg = event.currentTarget as SVGSVGElement;
		const bounds = svg.getBoundingClientRect();
		re = Math.max(-1.7, Math.min(1.7, ((event.clientX - bounds.left) / bounds.width) * 4 - 2));
		im = Math.max(-1.7, Math.min(1.7, 2 - ((event.clientY - bounds.top) / bounds.height) * 4));
	}

	function beginDrag(event: PointerEvent) {
		(event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
		updateFromPointer(event);
	}

	function format(value: number) {
		return Number(value.toFixed(3)).toString();
	}
</script>

<figure class="complex-demo not-prose" aria-labelledby="complex-demo-heading">
	<div class="plot-wrap">
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<svg
			viewBox="0 0 200 200"
			role="application"
			aria-labelledby="complex-demo-heading"
			aria-describedby="complex-demo-description"
			tabindex="0"
			onpointerdown={beginDrag}
			onpointermove={(event) => {
				if (event.buttons) updateFromPointer(event);
			}}
		>
			<title id="complex-demo-heading">Squaring and translating one complex number</title>
			<desc id="complex-demo-description">
				Drag the point z. A second point shows z squared, and a third shows z squared plus the fixed
				parameter c.
			</desc>
			<rect width="200" height="200" class="plot-bg" />
			{#each [-1.5, -1, -0.5, 0.5, 1, 1.5] as tick (tick)}
				<line x1={pointX(tick)} y1="0" x2={pointX(tick)} y2="200" class="grid" />
				<line x1="0" y1={pointY(tick)} x2="200" y2={pointY(tick)} class="grid" />
			{/each}
			<line x1="0" y1="100" x2="200" y2="100" class="axis" />
			<line x1="100" y1="0" x2="100" y2="200" class="axis" />
			<line
				x1={pointX(re)}
				y1={pointY(im)}
				x2={pointX(squared.re)}
				y2={pointY(squared.im)}
				class="transform-line"
			/>
			<line
				x1={pointX(squared.re)}
				y1={pointY(squared.im)}
				x2={pointX(translated.re)}
				y2={pointY(translated.im)}
				class="translation-line"
			/>
			<circle cx={pointX(re)} cy={pointY(im)} r="6.5" class="point point-z" />
			<text x={pointX(re) + 8} y={pointY(im) - 8}>z</text>
			<circle cx={pointX(squared.re)} cy={pointY(squared.im)} r="5.5" class="point point-square" />
			<text x={pointX(squared.re) + 8} y={pointY(squared.im) - 7}>z²</text>
			<circle
				cx={pointX(translated.re)}
				cy={pointY(translated.im)}
				r="5.5"
				class="point point-result"
			/>
			<text x={pointX(translated.re) + 8} y={pointY(translated.im) - 7}>z²+c</text>
			<text x="183" y="94" class="axis-label">Re</text>
			<text x="105" y="12" class="axis-label">Im</text>
		</svg>
		<p class="gesture-note">Drag anywhere in the plane</p>
	</div>
	<div class="instrument">
		<p class="eyebrow">Complex-plane transformer</p>
		<h2>One point, three addresses</h2>
		<div class="inputs">
			<label>
				<span>Re(z)</span>
				<input type="number" min="-1.7" max="1.7" step="0.01" bind:value={re} />
			</label>
			<label>
				<span>Im(z)</span>
				<input type="number" min="-1.7" max="1.7" step="0.01" bind:value={im} />
			</label>
		</div>
		<dl>
			<div>
				<dt>z</dt>
				<dd>{format(re)} {im < 0 ? '−' : '+'} {format(Math.abs(im))}i</dd>
			</div>
			<div>
				<dt>|z|</dt>
				<dd>{format(magnitude)}</dd>
			</div>
			<div>
				<dt>angle</dt>
				<dd>{format(angle)}°</dd>
			</div>
			<div>
				<dt>z²</dt>
				<dd>{format(squared.re)} {squared.im < 0 ? '−' : '+'} {format(Math.abs(squared.im))}i</dd>
			</div>
			<div>
				<dt>fixed c</dt>
				<dd>−0.55 + 0.28i</dd>
			</div>
			<div>
				<dt>z²+c</dt>
				<dd>
					{format(translated.re)}
					{translated.im < 0 ? '−' : '+'}
					{format(Math.abs(translated.im))}i
				</dd>
			</div>
		</dl>
		<p>
			Squaring doubles the angle. Adding c translates the squared point by one fixed complex
			address.
		</p>
	</div>
</figure>

<style>
	.complex-demo {
		display: grid;
		grid-template-columns: minmax(17rem, 1fr) minmax(16rem, 0.85fr);
		gap: 1.2rem;
		margin: 1.7rem 0;
		border: 1px solid var(--rule);
		border-radius: 0.65rem;
		background: var(--paper-raised);
		padding: clamp(1rem, 3vw, 1.4rem);
	}

	.plot-wrap {
		position: relative;
		min-width: 0;
	}

	svg {
		display: block;
		width: 100%;
		max-height: 30rem;
		border: 1px solid #3f3a57;
		border-radius: 0.45rem;
		touch-action: none;
		cursor: crosshair;
	}

	.plot-bg {
		fill: #0a0b13;
	}

	.grid {
		stroke: #27283a;
		stroke-width: 0.6;
	}

	.axis {
		stroke: #9e98b3;
		stroke-width: 1;
	}

	.transform-line {
		stroke: #6fc4da;
		stroke-width: 1.2;
		stroke-dasharray: 3 2;
	}

	.translation-line {
		stroke: #d6a85f;
		stroke-width: 1.2;
	}

	.point {
		stroke: #0a0b13;
		stroke-width: 2;
	}

	.point-z {
		fill: #e26a55;
	}

	.point-square {
		fill: #6fc4da;
	}

	.point-result {
		fill: #d6a85f;
	}

	svg text {
		fill: #f0e8d7;
		font: 8px var(--font-mono);
		pointer-events: none;
	}

	.axis-label {
		fill: #aaa5b7;
	}

	.gesture-note {
		position: absolute;
		right: 0.55rem;
		bottom: 0.45rem;
		margin: 0;
		border-radius: 999px;
		background: rgb(5 6 11 / 80%);
		padding: 0.25rem 0.45rem;
		color: #d5d0df;
		font: 0.62rem/1.2 var(--font-sans);
	}

	.instrument {
		min-width: 0;
	}

	.eyebrow {
		margin: 0;
		color: var(--essay-ink);
		font: 700 0.68rem/1.2 var(--font-sans);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0.35rem 0 0.9rem;
		font: 750 1.35rem/1.15 var(--font-sans);
	}

	.inputs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}

	label {
		display: grid;
		gap: 0.3rem;
		font: 650 0.7rem/1.2 var(--font-sans);
	}

	input {
		min-height: 2.75rem;
		min-width: 0;
		border: 1px solid var(--control-border);
		border-radius: 0.3rem;
		background: var(--paper);
		padding: 0.45rem 0.55rem;
		color: var(--ink);
		font: 0.8rem/1.2 var(--font-mono);
	}

	dl {
		display: grid;
		gap: 0;
		margin: 0.9rem 0;
		border: 1px solid var(--rule);
		border-radius: 0.4rem;
	}

	dl div {
		display: grid;
		grid-template-columns: 4.4rem minmax(0, 1fr);
		gap: 0.5rem;
		border-bottom: 1px solid var(--rule);
		padding: 0.42rem 0.55rem;
		font: 0.7rem/1.35 var(--font-mono);
	}

	dl div:last-child {
		border-bottom: 0;
	}

	dt {
		color: var(--ink-muted);
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.instrument > p:last-child {
		margin: 0;
		color: var(--ink-muted);
		font: 0.78rem/1.5 var(--font-sans);
	}

	@media (max-width: 44rem) {
		.complex-demo {
			grid-template-columns: 1fr;
		}
	}
</style>
