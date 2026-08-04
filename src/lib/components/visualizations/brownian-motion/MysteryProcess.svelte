<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import { generateFractionalBrownianPaths } from '$lib/visualizations/brownian-motion/advanced/fractional-brownian';
	import { GaussianSampler } from '$lib/visualizations/brownian-motion/gaussian';
	import { SeededRandom } from '$lib/utils/seeded-random';

	type Difficulty = 'easy' | 'medium' | 'hard';
	type MysteryId =
		| 'brownian'
		| 'drift'
		| 'harmonic'
		| 'active'
		| 'fractional-low'
		| 'fractional-high'
		| 'levy';
	type Diagnostic = 'trajectory' | 'msd' | 'increments';

	interface MysteryDefinition {
		readonly id: MysteryId;
		readonly label: string;
		readonly equation: string;
		readonly clue: string;
		readonly trap: string;
		readonly decisive: string;
	}

	interface Ensemble {
		readonly x: Float64Array;
		readonly y: Float64Array;
		readonly count: number;
		readonly points: number;
		readonly duration: number;
	}

	interface PlotPoint {
		readonly x: number;
		readonly y: number;
	}

	const DEFINITIONS: readonly MysteryDefinition[] = [
		{
			id: 'brownian',
			label: 'Free Brownian motion',
			equation: 'dX = √(2D) dW',
			clue: 'The mean stays put, increments decorrelate, and MSD grows linearly.',
			trap: 'A single lucky excursion can masquerade as drift.',
			decisive: 'The ensemble MSD has slope one on log–log axes while the increment mean is zero.'
		},
		{
			id: 'drift',
			label: 'Drift–diffusion',
			equation: 'dX = μ dt + √(2D) dW',
			clue: 'The whole cloud travels while its variance broadens as ordinary diffusion.',
			trap: 'One Brownian path can wander persistently in one direction by chance.',
			decisive: 'The ensemble mean grows linearly but centred variance retains the Brownian law.'
		},
		{
			id: 'harmonic',
			label: 'Harmonic confinement',
			equation: 'dX = −λX dt + √(2D) dW',
			clue: 'Excursions are pulled home and the long-time spread saturates.',
			trap: 'A short confined path can look exactly like free diffusion.',
			decisive: 'MSD bends toward a plateau and positions retain a restoring autocorrelation.'
		},
		{
			id: 'active',
			label: 'Active Brownian motion',
			equation: 'dX = v₀n(θ)dt + √(2Dₜ)dW; dθ = √(2Dᵣ)dWθ',
			clue: 'Short segments persist in a direction before rotational noise turns them.',
			trap: 'Persistent motion is not proof of an external drift.',
			decisive: 'Short-time displacement is ballistic but its direction eventually decorrelates.'
		},
		{
			id: 'fractional-low',
			label: 'Fractional Brownian, H < ½',
			equation: 'E((X(t)−X(0))²) ∝ t²ᴴ, H < ½',
			clue: 'Increments tend to reverse sign and the path spreads sublinearly.',
			trap: 'Tight wandering alone does not prove a confining force.',
			decisive: 'Negative increment correlations coexist with scale-free sublinear MSD.'
		},
		{
			id: 'fractional-high',
			label: 'Fractional Brownian, H > ½',
			equation: 'E((X(t)−X(0))²) ∝ t²ᴴ, H > ½',
			clue: 'Successive increments tend to keep their sign, without a fixed drift direction.',
			trap: 'A persistent section can be confused with active propulsion.',
			decisive:
				'Positive long-range increment correlation and superlinear MSD persist across scales.'
		},
		{
			id: 'levy',
			label: 'Lévy flight',
			equation: 'ΔX follows a symmetric α-stable law, 1 < α < 2',
			clue: 'Most steps are modest but rare jumps dwarf the local motion.',
			trap: 'One dramatic jump could be an outlier or a plotting accident.',
			decisive: 'The heavy-tailed increment histogram is stable; ordinary variance is not defined.'
		}
	];

	const STEPS = 256;
	const DURATION = 4;
	const PAD = 28;
	const WIDTH = 760;
	const HEIGHT = 270;

	let seed = $state('sealed-envelope-73');
	let difficulty = $state<Difficulty>('medium');
	let particleCount = $state(1);
	let diagnostic = $state<Diagnostic>('trajectory');
	let guess = $state<MysteryId>('brownian');
	let revealed = $state(false);
	let correct = $state(0);
	let attempts = $state(0);
	let status = $state('The model is hidden. Open one diagnostic at a time and make a case.');

	function modelIndex(): number {
		return new SeededRandom(`mystery-model:${seed}:${difficulty}`).integer(
			0,
			DEFINITIONS.length - 1
		);
	}

	let answer = $derived(DEFINITIONS[modelIndex()]);
	let ensemble = $derived(generateEnsemble(answer.id, seed, difficulty, particleCount));
	let trajectoryLines = $derived(makeTrajectoryLines(ensemble));
	let msd = $derived(measureMsd(ensemble));
	let incrementBins = $derived(measureIncrementHistogram(ensemble));

	function parameters(level: Difficulty): {
		diffusion: number;
		drift: number;
		lambda: number;
		speed: number;
		rotational: number;
		hLow: number;
		hHigh: number;
		alpha: number;
	} {
		if (level === 'easy')
			return {
				diffusion: 0.38,
				drift: 1.1,
				lambda: 1.5,
				speed: 2.1,
				rotational: 0.28,
				hLow: 0.24,
				hHigh: 0.79,
				alpha: 1.25
			};
		if (level === 'hard')
			return {
				diffusion: 0.65,
				drift: 0.22,
				lambda: 0.3,
				speed: 0.62,
				rotational: 1.5,
				hLow: 0.43,
				hHigh: 0.57,
				alpha: 1.82
			};
		return {
			diffusion: 0.5,
			drift: 0.55,
			lambda: 0.75,
			speed: 1.2,
			rotational: 0.72,
			hLow: 0.34,
			hHigh: 0.68,
			alpha: 1.55
		};
	}

	function stableIncrement(random: SeededRandom, alpha: number, scale: number): number {
		const angle = Math.PI * (random.next() - 0.5);
		const exponential = -Math.log(Math.max(Number.EPSILON, 1 - random.next()));
		const first = Math.sin(alpha * angle) / Math.cos(angle) ** (1 / alpha);
		const second = (Math.cos((1 - alpha) * angle) / exponential) ** ((1 - alpha) / alpha);
		return scale * first * second;
	}

	function generateEnsemble(
		id: MysteryId,
		rootSeed: string,
		level: Difficulty,
		count: number
	): Ensemble {
		const points = STEPS + 1;
		const x = new Float64Array(count * points);
		const y = new Float64Array(count * points);
		const options = parameters(level);
		if (id === 'fractional-low' || id === 'fractional-high') {
			const generated = generateFractionalBrownianPaths({
				seed: `mystery-path:${rootSeed}`,
				hurst: id === 'fractional-low' ? options.hLow : options.hHigh,
				scale: Math.sqrt(options.diffusion * 2),
				duration: DURATION,
				pointCount: points,
				trajectoryCount: count
			});
			return { x: generated.x, y: generated.y, count, points, duration: DURATION };
		}

		const dt = DURATION / STEPS;
		for (let particle = 0; particle < count; particle += 1) {
			const random = new SeededRandom(`mystery-path:${rootSeed}:particle:${particle}`);
			const normal = new GaussianSampler(random.fork('gaussian'));
			let orientation = random.range(-Math.PI, Math.PI);
			for (let step = 1; step <= STEPS; step += 1) {
				const offset = particle * points + step;
				const previous = offset - 1;
				let deltaX: number;
				let deltaY: number;
				if (id === 'levy') {
					const scale = 0.24 * dt ** (1 / options.alpha);
					deltaX = stableIncrement(random, options.alpha, scale);
					deltaY = stableIncrement(random, options.alpha, scale);
				} else {
					const noiseScale = Math.sqrt(2 * options.diffusion * dt);
					deltaX = noiseScale * normal.next();
					deltaY = noiseScale * normal.next();
					if (id === 'drift') deltaX += options.drift * dt;
					if (id === 'harmonic') {
						deltaX -= options.lambda * x[previous] * dt;
						deltaY -= options.lambda * y[previous] * dt;
					}
					if (id === 'active') {
						orientation += Math.sqrt(2 * options.rotational * dt) * normal.next();
						deltaX += options.speed * Math.cos(orientation) * dt;
						deltaY += options.speed * Math.sin(orientation) * dt;
					}
				}
				x[offset] = x[previous] + deltaX;
				y[offset] = y[previous] + deltaY;
			}
		}
		return { x, y, count, points, duration: DURATION };
	}

	function ensembleBounds(value: Ensemble): {
		minX: number;
		maxX: number;
		minY: number;
		maxY: number;
	} {
		let minX = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;
		for (let index = 0; index < value.x.length; index += 1) {
			if (!Number.isFinite(value.x[index]) || !Number.isFinite(value.y[index])) continue;
			minX = Math.min(minX, value.x[index]);
			maxX = Math.max(maxX, value.x[index]);
			minY = Math.min(minY, value.y[index]);
			maxY = Math.max(maxY, value.y[index]);
		}
		const span = Math.max(maxX - minX, maxY - minY, 1);
		return {
			minX: (minX + maxX) / 2 - span * 0.58,
			maxX: (minX + maxX) / 2 + span * 0.58,
			minY: (minY + maxY) / 2 - span * 0.58,
			maxY: (minY + maxY) / 2 + span * 0.58
		};
	}

	function makeTrajectoryLines(value: Ensemble): string[] {
		const bounds = ensembleBounds(value);
		return Array.from({ length: value.count }, (_, particle) => {
			const offset = particle * value.points;
			const stride = value.count > 32 ? 2 : 1;
			const coordinates: string[] = [];
			for (let point = 0; point < value.points; point += stride) {
				const index = offset + point;
				const px =
					PAD + ((value.x[index] - bounds.minX) / (bounds.maxX - bounds.minX)) * (WIDTH - PAD * 2);
				const py =
					HEIGHT -
					PAD -
					((value.y[index] - bounds.minY) / (bounds.maxY - bounds.minY)) * (HEIGHT - PAD * 2);
				coordinates.push(`${px.toFixed(1)},${py.toFixed(1)}`);
			}
			return coordinates.join(' ');
		});
	}

	function measureMsd(value: Ensemble): PlotPoint[] {
		const output: PlotPoint[] = [];
		for (let point = 0; point < value.points; point += 8) {
			let sum = 0;
			for (let particle = 0; particle < value.count; particle += 1) {
				const index = particle * value.points + point;
				sum += value.x[index] ** 2 + value.y[index] ** 2;
			}
			output.push({ x: (point / (value.points - 1)) * value.duration, y: sum / value.count });
		}
		return output;
	}

	function measureIncrementHistogram(value: Ensemble): PlotPoint[] {
		const increments: number[] = [];
		for (let particle = 0; particle < value.count; particle += 1) {
			const offset = particle * value.points;
			for (let point = 1; point < value.points; point += 1) {
				increments.push(value.x[offset + point] - value.x[offset + point - 1]);
			}
		}
		increments.sort((a, b) => a - b);
		const lower = increments[Math.floor(increments.length * 0.01)] ?? -1;
		const upper = increments[Math.ceil(increments.length * 0.99)] ?? 1;
		const width = Math.max(Number.EPSILON, (upper - lower) / 25);
		const counts = new Uint32Array(25);
		for (const increment of increments) {
			const index = Math.floor((increment - lower) / width);
			if (index >= 0 && index < counts.length) counts[index] += 1;
		}
		return Array.from(counts, (count, index) => ({
			x: lower + (index + 0.5) * width,
			y: count / increments.length
		}));
	}

	function linePath(points: readonly PlotPoint[]): string {
		const maximumX = Math.max(...points.map((point) => point.x), 1);
		const maximumY = Math.max(...points.map((point) => point.y), Number.EPSILON);
		return points
			.map((point, index) => {
				const x = PAD + (point.x / maximumX) * (WIDTH - PAD * 2);
				const y = HEIGHT - PAD - (point.y / maximumY) * (HEIGHT - PAD * 2);
				return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
			})
			.join(' ');
	}

	function reveal(): void {
		if (revealed) return;
		revealed = true;
		attempts += 1;
		if (guess === answer.id) {
			correct += 1;
			status = 'Correct. The most useful clue is identified below.';
		} else {
			status = `A plausible guess, but this was ${answer.label}.`;
		}
		localStorage.setItem('brownian-mystery-score-v1', JSON.stringify({ correct, attempts }));
	}

	function resetChallenge(nextSeed: string): void {
		seed = nextSeed;
		revealed = false;
		particleCount = 1;
		diagnostic = 'trajectory';
		guess = 'brownian';
		status = 'New sealed envelope. The seed fixes the evidence, not your guess.';
	}

	function newChallenge(): void {
		const values = new Uint32Array(2);
		crypto.getRandomValues(values);
		resetChallenge(`case-${values[0].toString(36)}-${values[1].toString(36)}`);
	}

	function challengeToken(): string {
		const raw = JSON.stringify({ s: seed, d: difficulty });
		return btoa(unescape(encodeURIComponent(raw)))
			.replaceAll('+', '-')
			.replaceAll('/', '_')
			.replace(/=+$/, '');
	}

	function parseChallenge(token: string): { seed: string; difficulty: Difficulty } | null {
		try {
			const normalized = token.replaceAll('-', '+').replaceAll('_', '/');
			const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
			const value = JSON.parse(decodeURIComponent(escape(atob(normalized + padding)))) as {
				s?: unknown;
				d?: unknown;
			};
			if (typeof value.s !== 'string' || value.s.length < 1 || value.s.length > 64) return null;
			if (value.d !== 'easy' && value.d !== 'medium' && value.d !== 'hard') return null;
			return { seed: value.s, difficulty: value.d };
		} catch {
			return null;
		}
	}

	async function copyChallenge(): Promise<void> {
		const url = new SvelteURL(window.location.href);
		url.searchParams.set('mystery', challengeToken());
		url.hash = 'mystery-process';
		await navigator.clipboard.writeText(url.toString());
		status = 'Challenge link copied. Its token contains the seed and difficulty, not the answer.';
	}

	onMount(() => {
		const token = new URLSearchParams(window.location.search).get('mystery');
		if (token) {
			const restored = parseChallenge(token);
			if (restored) {
				seed = restored.seed;
				difficulty = restored.difficulty;
				status = 'A shared sealed envelope was restored from its challenge token.';
			}
		}
		try {
			const stored = JSON.parse(localStorage.getItem('brownian-mystery-score-v1') ?? '{}') as {
				correct?: unknown;
				attempts?: unknown;
			};
			if (typeof stored.correct === 'number') correct = Math.max(0, Math.floor(stored.correct));
			if (typeof stored.attempts === 'number') attempts = Math.max(0, Math.floor(stored.attempts));
		} catch {
			// A corrupt score is non-scientific state; safely begin from zero.
		}
	});
</script>

<section id="mystery-process" class="mystery not-prose" aria-labelledby="mystery-title">
	<header>
		<div>
			<p class="eyebrow">What kind of randomness is this?</p>
			<h2 id="mystery-title">The sealed-envelope challenge</h2>
			<p>Trajectories can bluff. Ask the statistics before you name the process.</p>
		</div>
		<p class="score" aria-label={`Score ${correct} out of ${attempts}`}>{correct}/{attempts}</p>
	</header>

	<div class="challenge-controls">
		<label>
			<span>Difficulty</span>
			<select
				value={difficulty}
				onchange={(event) => {
					difficulty = (event.currentTarget as HTMLSelectElement).value as Difficulty;
					resetChallenge(seed);
				}}
			>
				<option value="easy">Easy</option>
				<option value="medium">Medium</option>
				<option value="hard">Hard</option>
			</select>
		</label>
		<div class="count" role="group" aria-label="Mystery particle count">
			<span>Evidence</span>
			{#each [1, 32, 128] as count (count)}
				<button
					class:active={particleCount === count}
					type="button"
					onclick={() => (particleCount = count)}
					>{count === 1 ? '1 path' : `${count} paths`}</button
				>
			{/each}
		</div>
		<button type="button" onclick={newChallenge}>New case</button>
		<button type="button" onclick={copyChallenge}>Copy challenge</button>
	</div>

	<div class="diagnostic-tabs" role="tablist" aria-label="Open one diagnostic">
		{#each [['trajectory', 'Trajectory'], ['msd', 'MSD'], ['increments', 'Increments']] as item (item[0])}
			<button
				type="button"
				role="tab"
				aria-selected={diagnostic === item[0]}
				class:active={diagnostic === item[0]}
				onclick={() => (diagnostic = item[0] as Diagnostic)}>{item[1]}</button
			>
		{/each}
	</div>

	<div class="plot" role="tabpanel">
		<svg
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			role="img"
			aria-label={`${diagnostic} evidence for the hidden process`}
		>
			<rect class="paper" x="0" y="0" width={WIDTH} height={HEIGHT} />
			<g class="grid" aria-hidden="true">
				{#each [0.25, 0.5, 0.75] as fraction (fraction)}
					<line x1={WIDTH * fraction} x2={WIDTH * fraction} y1="0" y2={HEIGHT} />
					<line x1="0" x2={WIDTH} y1={HEIGHT * fraction} y2={HEIGHT * fraction} />
				{/each}
			</g>
			{#if diagnostic === 'trajectory'}
				{#each trajectoryLines as points, index (`mystery-path-${index}`)}
					<polyline class:focus={index === 0} class="trajectory" {points} />
				{/each}
			{:else if diagnostic === 'msd'}
				<path class="series" d={linePath(msd)} />
				<text x={PAD} y={HEIGHT - 8}>measured ensemble MSD</text>
			{:else}
				{@const maximum = Math.max(...incrementBins.map((bin) => bin.y), Number.EPSILON)}
				{#each incrementBins as bin, index (`increment-${index}`)}
					<rect
						class="bar"
						x={PAD + (index / incrementBins.length) * (WIDTH - PAD * 2)}
						y={HEIGHT - PAD - (bin.y / maximum) * (HEIGHT - PAD * 2)}
						width={(WIDTH - PAD * 2) / incrementBins.length - 2}
						height={(bin.y / maximum) * (HEIGHT - PAD * 2)}
					/>
				{/each}
				<text x={PAD} y={HEIGHT - 8}>measured x-increment frequency (central 98%)</text>
			{/if}
		</svg>
	</div>

	<form
		class="guess"
		onsubmit={(event) => {
			event.preventDefault();
			reveal();
		}}
	>
		<label for="mystery-guess">Your model</label>
		<select id="mystery-guess" bind:value={guess} disabled={revealed}>
			{#each DEFINITIONS as definition (definition.id)}
				<option value={definition.id}>{definition.label}</option>
			{/each}
		</select>
		<button class="primary" type="submit" disabled={revealed}>Open envelope</button>
	</form>

	{#if revealed}
		<aside class:correct={guess === answer.id} class="reveal">
			<p class="verdict">{guess === answer.id ? 'Correct' : 'Not this time'} — {answer.label}</p>
			<p class="equation">{answer.equation}</p>
			<dl>
				<div>
					<dt>Clue</dt>
					<dd>{answer.clue}</dd>
				</div>
				<div>
					<dt>Unreliable impression</dt>
					<dd>{answer.trap}</dd>
				</div>
				<div>
					<dt>Decisive measurement</dt>
					<dd>{answer.decisive}</dd>
				</div>
			</dl>
		</aside>
	{/if}

	<p class="status" role="status">{status}</p>
	<p class="privacy">
		Score is stored only in this browser. The share token is playful concealment, not security.
	</p>
</section>

<style>
	.mystery {
		--lab-accent: #6f7fa8;
		--lab-rust: #9b5f48;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		box-sizing: border-box;
		width: min(76rem, calc(100vw - 1rem));
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
		align-items: flex-start;
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
	.score {
		min-width: 4rem;
		border: 1px solid var(--rule, #c8c1b2);
		border-radius: 999px;
		padding: 0.45rem 0.75rem;
		font:
			700 0.9rem 'Courier Prime',
			monospace;
		text-align: center;
	}
	.challenge-controls,
	.guess {
		display: flex;
		align-items: end;
		gap: 0.55rem;
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 0.7rem 1rem;
		background: var(--paper-soft, #ece6da);
	}
	label,
	.count {
		display: grid;
		gap: 0.25rem;
		font-size: 0.7rem;
		font-weight: 700;
	}
	.count {
		grid-template-columns: repeat(3, auto);
	}
	.count > span {
		grid-column: 1 / -1;
	}
	button,
	select {
		min-height: 2.75rem;
		border: 1px solid var(--rule, #aaa293);
		border-radius: 0.35rem;
		background: var(--paper, #f7f2e8);
		padding: 0.5rem 0.7rem;
		color: var(--ink, #242a32);
		font: inherit;
	}
	button {
		font-weight: 700;
		cursor: pointer;
	}
	button.active {
		box-shadow: inset 0 -3px var(--lab-accent);
		background: color-mix(in srgb, var(--lab-accent) 13%, var(--paper));
	}
	button.primary {
		background: var(--lab-accent);
		color: white;
	}
	button:disabled,
	select:disabled {
		opacity: 0.58;
		cursor: default;
	}
	button:focus-visible,
	select:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--lab-accent) 72%, white);
		outline-offset: 2px;
	}
	.diagnostic-tabs {
		display: flex;
		border-bottom: 1px solid var(--rule, #c8c1b2);
	}
	.diagnostic-tabs button {
		flex: 1;
		border: 0;
		border-right: 1px solid var(--rule, #c8c1b2);
		border-radius: 0;
	}
	.plot {
		padding: 0.75rem;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		max-height: 24rem;
		border: 1px solid var(--rule, #c8c1b2);
	}
	.paper {
		fill: color-mix(in srgb, var(--paper, #f4f0e6) 94%, var(--lab-accent));
	}
	.grid line {
		stroke: color-mix(in srgb, var(--rule, #c8c1b2) 60%, transparent);
	}
	.trajectory,
	.series {
		fill: none;
		stroke: color-mix(in srgb, var(--lab-accent) 34%, transparent);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.trajectory.focus,
	.series {
		stroke: var(--lab-accent);
		stroke-width: 2.2;
	}
	.bar {
		fill: color-mix(in srgb, var(--lab-accent) 70%, transparent);
	}
	text {
		fill: var(--ink-muted, #68707a);
		font:
			11px 'Courier Prime',
			monospace;
	}
	.guess {
		border-top: 1px solid var(--rule, #c8c1b2);
		border-bottom: 0;
	}
	.guess label {
		font-size: 0.78rem;
	}
	.guess select {
		min-width: 14rem;
		margin-left: auto;
	}
	.reveal {
		margin: 0.8rem;
		border: 1px solid var(--lab-rust);
		border-left-width: 4px;
		border-radius: 0.35rem;
		background: color-mix(in srgb, var(--lab-rust) 7%, var(--paper));
		padding: 0.9rem 1rem;
	}
	.reveal.correct {
		border-color: var(--lab-accent);
	}
	.verdict {
		margin: 0;
		font-weight: 800;
	}
	.equation {
		margin: 0.55rem 0;
		font:
			700 0.86rem 'Courier Prime',
			monospace;
	}
	dl {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
		margin: 0;
	}
	dt {
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	dd {
		margin: 0.25rem 0 0;
		color: var(--ink-muted, #68707a);
		font-family: 'Source Serif 4', Georgia, serif;
		font-size: 0.84rem;
		line-height: 1.45;
	}
	.status,
	.privacy {
		margin: 0;
		border-top: 1px solid var(--rule, #c8c1b2);
		padding: 0.6rem 1rem;
		color: var(--ink-muted, #68707a);
		font-size: 0.76rem;
	}
	.privacy {
		border-top: 0;
		padding-top: 0;
		font-family: 'Source Serif 4', Georgia, serif;
	}
	@media (max-width: 48rem) {
		.challenge-controls {
			flex-wrap: wrap;
		}
		dl {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 34rem) {
		.mystery {
			width: calc(100vw - 0.5rem);
		}
		.challenge-controls > button {
			flex: 1;
		}
		.count {
			width: 100%;
		}
		.count button {
			width: 100%;
		}
		.guess {
			align-items: stretch;
			flex-direction: column;
		}
		.guess select {
			width: 100%;
			min-width: 0;
			margin: 0;
		}
	}
</style>
