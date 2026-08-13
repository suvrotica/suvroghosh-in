<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		formatNumber,
		type ComplexSpectrumView,
		type EnsemblePointView,
		type TheoryView
	} from './types';

	let {
		eigen,
		theory,
		theoryVisible = true,
		symmetric = false,
		ensemblePoints = [],
		highContrast = false,
		selectedIndex = 0,
		onselect = () => undefined
	}: {
		eigen?: ComplexSpectrumView;
		theory?: TheoryView;
		theoryVisible?: boolean;
		symmetric?: boolean;
		ensemblePoints?: readonly EnsemblePointView[];
		highContrast?: boolean;
		selectedIndex?: number;
		onselect?: (index: number) => void;
	} = $props();

	let plotHost: HTMLElement;
	let chartWidth = $state(760);
	let zoom = $state(1);
	let panReal = $state(0);
	let panImaginary = $state(0);
	let dragging = false;
	let dragPointer = -1;
	let previousClientX = 0;
	let previousClientY = 0;

	let eigenCount = $derived(Math.min(eigen?.real.length ?? 0, eigen?.imaginary.length ?? 0));
	let safeSelectedIndex = $derived(
		Math.max(0, Math.min(Math.max(0, eigenCount - 1), selectedIndex))
	);
	let selectedReal = $derived(eigen?.real[safeSelectedIndex] ?? 0);
	let selectedImaginary = $derived(eigen?.imaginary[safeSelectedIndex] ?? 0);
	let selectedMagnitude = $derived(Math.hypot(selectedReal, selectedImaginary));
	let selectedAngle = $derived(Math.atan2(selectedImaginary, selectedReal));
	let maximumImaginary = $derived(maxAbsolute(eigen?.imaginary));
	let entirelyReal = $derived(eigenCount > 0 && maximumImaginary <= 1e-10);
	let oneDimensional = $derived(symmetric);
	let spectralRadius = $derived(calculateSpectralRadius());
	let circularTheoryRadius = $derived(theoryRadius());
	let baseRadius = $derived(calculateBaseRadius());
	let densityBins = $derived(calculateDensityBins(22));
	let realHistogram = $derived(calculateRealHistogram(42));
	let chart = $derived(chartGeometry(chartWidth));
	let narrowPlot = $derived(chartWidth < 500);

	function chartGeometry(width: number) {
		const safeWidth = Math.max(280, Math.min(900, width));
		const height = Math.max(300, Math.min(500, safeWidth * 0.66));
		const left = safeWidth < 500 ? 48 : 62;
		return { width: safeWidth, height, left, right: safeWidth - 18, top: 24, bottom: height - 58 };
	}

	function maxAbsolute(values: Float64Array | undefined): number {
		let maximum = 0;
		if (!values) return maximum;
		for (const value of values) maximum = Math.max(maximum, Math.abs(value));
		return maximum;
	}

	function calculateSpectralRadius(): number {
		let maximum = 0;
		for (let index = 0; index < eigenCount; index += 1) {
			maximum = Math.max(
				maximum,
				Math.hypot(eigen?.real[index] ?? 0, eigen?.imaginary[index] ?? 0)
			);
		}
		return maximum;
	}

	function theoryRadius(): number {
		return typeof theory?.radius === 'number' && Number.isFinite(theory.radius)
			? Math.max(0, theory.radius)
			: 1;
	}

	function calculateBaseRadius(): number {
		let radius = Math.max(1e-6, spectralRadius, theory?.radius ?? 0);
		if (typeof theory?.supportMinimum === 'number')
			radius = Math.max(radius, Math.abs(theory.supportMinimum));
		if (typeof theory?.supportMaximum === 'number')
			radius = Math.max(radius, Math.abs(theory.supportMaximum));
		for (const point of ensemblePoints)
			radius = Math.max(radius, Math.hypot(point.real, point.imaginary));
		return radius * 1.15;
	}

	function viewRadius(): number {
		return Math.max(1e-9, baseRadius / zoom);
	}

	function geometricScale(): number {
		return Math.min(chart.right - chart.left, chart.bottom - chart.top) / (2 * viewRadius());
	}

	function sx(value: number): number {
		return (chart.left + chart.right) / 2 + (value - panReal) * geometricScale();
	}

	function sy(value: number): number {
		return (chart.top + chart.bottom) / 2 - (value - panImaginary) * geometricScale();
	}

	function tickValues(): readonly number[] {
		const radius = viewRadius();
		const roughStep = (radius * 2) / (narrowPlot ? 3 : 5);
		const exponent = 10 ** Math.floor(Math.log10(Math.max(roughStep, 1e-12)));
		const fraction = roughStep / exponent;
		const step = (fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10) * exponent;
		const minimum = Math.floor((panReal - radius) / step) * step;
		const ticks: number[] = [];
		for (let value = minimum; value <= panReal + radius + step * 0.5; value += step)
			ticks.push(value);
		return ticks.slice(0, 12);
	}

	function yTickValues(): readonly number[] {
		const radius = viewRadius();
		const xTicks = tickValues();
		const step = Math.abs((xTicks[1] ?? radius) - (xTicks[0] ?? 0)) || radius / 2;
		const minimum = Math.floor((panImaginary - radius) / step) * step;
		const ticks: number[] = [];
		for (let value = minimum; value <= panImaginary + radius + step * 0.5; value += step)
			ticks.push(value);
		return ticks.slice(0, 12);
	}

	function calculateDensityBins(
		binCount: number
	): readonly { x: number; y: number; count: number }[] {
		if (ensemblePoints.length < 24) return [];
		const counts = new SvelteMap<string, number>();
		const radius = Math.max(baseRadius, 1e-9);
		for (const point of ensemblePoints) {
			const x = Math.floor(((point.real + radius) / (2 * radius)) * binCount);
			const y = Math.floor(((point.imaginary + radius) / (2 * radius)) * binCount);
			if (x < 0 || x >= binCount || y < 0 || y >= binCount) continue;
			const key = `${x}:${y}`;
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		return Array.from(counts, ([key, count]) => {
			const [x, y] = key.split(':').map(Number);
			return {
				x: -radius + ((x + 0.5) / binCount) * 2 * radius,
				y: -radius + ((y + 0.5) / binCount) * 2 * radius,
				count
			};
		});
	}

	function densityMaximum(): number {
		return Math.max(1, ...densityBins.map((bin) => bin.count));
	}

	function densityCellSize(): number {
		return (2 * baseRadius * geometricScale()) / 22;
	}

	function calculateRealHistogram(binCount: number): readonly number[] {
		const counts = Array.from({ length: binCount }, () => 0);
		const support = realDomain();
		const values: number[] = [];
		if (ensemblePoints.length > 0) values.push(...ensemblePoints.map((point) => point.real));
		else if (eigen) values.push(...Array.from(eigen.real));
		for (const value of values) {
			const fraction = (value - support[0]) / Math.max(Number.EPSILON, support[1] - support[0]);
			const index = Math.max(0, Math.min(binCount - 1, Math.floor(fraction * binCount)));
			counts[index] += 1;
		}
		return counts;
	}

	function realDomain(): readonly [number, number] {
		let minimum = Number.POSITIVE_INFINITY;
		let maximum = Number.NEGATIVE_INFINITY;
		if (eigen) {
			for (const value of eigen.real) {
				minimum = Math.min(minimum, value);
				maximum = Math.max(maximum, value);
			}
		}
		for (const point of ensemblePoints) {
			minimum = Math.min(minimum, point.real);
			maximum = Math.max(maximum, point.real);
		}
		if (typeof theory?.supportMinimum === 'number')
			minimum = Math.min(minimum, theory.supportMinimum);
		if (typeof theory?.supportMaximum === 'number')
			maximum = Math.max(maximum, theory.supportMaximum);
		if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return [-1, 1];
		if (minimum === maximum) return [minimum - 1, maximum + 1];
		const padding = (maximum - minimum) * 0.08;
		return [minimum - padding, maximum + padding];
	}

	function histogramPath(): string {
		const maximum = Math.max(1, ...realHistogram);
		const left = chart.left;
		const width = chart.right - chart.left;
		return realHistogram
			.map((count, index) => {
				const x = left + ((index + 0.5) / realHistogram.length) * width;
				const y = chart.bottom - (count / maximum) * (chart.bottom - chart.top) * 0.82;
				return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	}

	function theoryDensityPath(): string {
		if (
			!theoryVisible ||
			!theory ||
			(theory.kind !== 'semicircle' && theory.kind !== 'marchenko-pastur')
		)
			return '';
		if (theory.x && theory.density && theory.x.length > 1 && theory.density.length > 1) {
			const count = Math.min(theory.x.length, theory.density.length);
			let maximumDensity = 0;
			for (let index = 0; index < count; index += 1) {
				maximumDensity = Math.max(maximumDensity, theory.density[index] ?? 0);
			}
			maximumDensity = Math.max(maximumDensity, Number.EPSILON);
			return Array.from({ length: count }, (_, index) => {
				const x = realPointX(theory.x?.[index] ?? 0);
				const density = Math.max(0, theory.density?.[index] ?? 0);
				const y = chart.bottom - (density / maximumDensity) * (chart.bottom - chart.top) * 0.72;
				return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
			}).join(' ');
		}
		const [minimum, maximum] = [theory.supportMinimum ?? -2, theory.supportMaximum ?? 2];
		const centre = (minimum + maximum) / 2;
		const radius = Math.max(Number.EPSILON, (maximum - minimum) / 2);
		const domain = realDomain();
		const points: string[] = [];
		for (let index = 0; index <= 100; index += 1) {
			const value = minimum + (index / 100) * (maximum - minimum);
			const density =
				(2 / (Math.PI * radius * radius)) *
				Math.sqrt(Math.max(0, radius * radius - (value - centre) ** 2));
			const x =
				chart.left + ((value - domain[0]) / (domain[1] - domain[0])) * (chart.right - chart.left);
			const y = chart.bottom - density * radius * (chart.bottom - chart.top) * 0.72;
			points.push(`${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
		}
		return points.join(' ');
	}

	function zeroAtomHeight(): number {
		return Math.max(0, Math.min(0.92, theory?.atomAtZero ?? 0)) * (chart.bottom - chart.top) * 0.78;
	}

	function realPointX(value: number): number {
		const domain = realDomain();
		return (
			chart.left + ((value - domain[0]) / (domain[1] - domain[0])) * (chart.right - chart.left)
		);
	}

	function select(index: number, moveFocus = false): void {
		if (eigenCount <= 0) return;
		const nextIndex = (index + eigenCount) % eigenCount;
		onselect(nextIndex);
		if (moveFocus) {
			queueMicrotask(() => {
				plotHost?.querySelector<SVGElement>(`[data-eigen-index="${nextIndex}"]`)?.focus();
			});
		}
	}

	function pointDescription(index: number): string {
		const real = eigen?.real[index] ?? 0;
		const imaginary = eigen?.imaginary[index] ?? 0;
		return `Eigenvalue ${index + 1}: real ${formatNumber(real, 6)}, imaginary ${formatNumber(imaginary, 6)}, magnitude ${formatNumber(Math.hypot(real, imaginary), 6)}, angle ${formatNumber(Math.atan2(imaginary, real), 6)} radians`;
	}

	function panBy(horizontal: number, vertical: number): void {
		const distance = viewRadius() * 0.18;
		panReal += horizontal * distance;
		panImaginary += vertical * distance;
	}

	function pointKeydown(event: KeyboardEvent): void {
		const currentIndex = Number((event.currentTarget as SVGElement).dataset.eigenIndex);
		if (!oneDimensional && event.shiftKey && event.key === 'ArrowLeft') panBy(-1, 0);
		else if (!oneDimensional && event.shiftKey && event.key === 'ArrowRight') panBy(1, 0);
		else if (!oneDimensional && event.shiftKey && event.key === 'ArrowUp') panBy(0, 1);
		else if (!oneDimensional && event.shiftKey && event.key === 'ArrowDown') panBy(0, -1);
		else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
			select(currentIndex + 1, true);
		else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') select(currentIndex - 1, true);
		else if (event.key === 'Home') select(0, true);
		else if (event.key === 'End') select(eigenCount - 1, true);
		else if (event.key === 'Enter' || event.key === ' ') select(currentIndex, true);
		else return;
		event.preventDefault();
	}

	function wheel(event: WheelEvent): void {
		event.preventDefault();
		zoom = Math.max(0.75, Math.min(20, zoom * Math.exp(-event.deltaY * 0.002)));
	}

	function panStart(event: PointerEvent): void {
		if ((event.target as Element).closest('.eigen-point')) return;
		dragging = true;
		dragPointer = event.pointerId;
		previousClientX = event.clientX;
		previousClientY = event.clientY;
		(event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
	}

	function panMove(event: PointerEvent): void {
		if (!dragging || event.pointerId !== dragPointer) return;
		const svg = event.currentTarget as SVGSVGElement;
		const bounds = svg.getBoundingClientRect();
		const ratioX = chart.width / Math.max(1, bounds.width);
		const ratioY = chart.height / Math.max(1, bounds.height);
		panReal -= ((event.clientX - previousClientX) * ratioX) / geometricScale();
		panImaginary += ((event.clientY - previousClientY) * ratioY) / geometricScale();
		previousClientX = event.clientX;
		previousClientY = event.clientY;
	}

	function panEnd(event: PointerEvent): void {
		if (event.pointerId !== dragPointer) return;
		dragging = false;
		dragPointer = -1;
	}

	function resetView(): void {
		zoom = 1;
		panReal = 0;
		panImaginary = 0;
	}

	onMount(() => {
		const observer = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width;
			if (width && width > 0) chartWidth = width;
		});
		if (plotHost) observer.observe(plotHost);
		return () => observer.disconnect();
	});
</script>

<section
	class="spectral-sky lens-panel"
	class:high-contrast={highContrast}
	data-matrix-symmetric={symmetric ? 'true' : 'false'}
	aria-labelledby="spectral-sky-heading"
>
	<header class="lens-header">
		<div>
			<p class="eyebrow">LENS 02 · EIGENVALUES</p>
			<h3 id="spectral-sky-heading">Spectral sky</h3>
			<p>
				{oneDimensional
					? 'Symmetry keeps the spectrum real, so density is plotted on one axis.'
					: 'Real and imaginary axes use exactly the same geometric scale.'}
			</p>
		</div>
		<div class="spectral-radius">
			<span>Spectral radius ρ(A)</span>
			<strong>{formatNumber(spectralRadius, 5)}</strong>
		</div>
	</header>

	{#if entirelyReal && !symmetric}
		<p class="real-spectrum-note">
			This particular nonsymmetric matrix happens to have an entirely real spectrum; no imaginary
			parts were discarded.
		</p>
	{/if}

	<div class="plot-toolbar">
		<span
			>{ensemblePoints.length > 0
				? `${ensemblePoints.length.toLocaleString('en-GB')} accumulated eigenvalues`
				: `${eigenCount} eigenvalues from one matrix`}</span
		>
		{#if !oneDimensional}
			<button
				type="button"
				onclick={() => panBy(-1, 0)}
				aria-label="Pan spectral plot left"
				aria-keyshortcuts="Shift+ArrowLeft">←</button
			>
			<button
				type="button"
				onclick={() => panBy(0, 1)}
				aria-label="Pan spectral plot up"
				aria-keyshortcuts="Shift+ArrowUp">↑</button
			>
			<button
				type="button"
				onclick={() => panBy(0, -1)}
				aria-label="Pan spectral plot down"
				aria-keyshortcuts="Shift+ArrowDown">↓</button
			>
			<button
				type="button"
				onclick={() => panBy(1, 0)}
				aria-label="Pan spectral plot right"
				aria-keyshortcuts="Shift+ArrowRight">→</button
			>
			<button type="button" onclick={() => (zoom = Math.min(20, zoom * 1.4))} aria-label="Zoom in"
				>＋</button
			>
			<button
				type="button"
				onclick={() => (zoom = Math.max(0.75, zoom / 1.4))}
				aria-label="Zoom out">−</button
			>
			<button type="button" onclick={resetView}>Reset view</button>
		{/if}
	</div>
	{#if !oneDimensional}
		<p class="keyboard-instructions" id="spectral-keyboard-instructions">
			Pan with the arrow buttons, or hold Shift and press an arrow key while an eigenvalue is
			focused. Arrow keys alone move between eigenvalues.
		</p>
	{/if}

	<figure bind:this={plotHost} data-export-surface class:narrow={narrowPlot}>
		<svg
			viewBox={`0 0 ${chart.width} ${chart.height}`}
			role="img"
			aria-labelledby="spectral-plot-title spectral-plot-description"
			aria-describedby={oneDimensional ? undefined : 'spectral-keyboard-instructions'}
			onwheel={oneDimensional ? undefined : wheel}
			onpointerdown={oneDimensional ? undefined : panStart}
			onpointermove={oneDimensional ? undefined : panMove}
			onpointerup={oneDimensional ? undefined : panEnd}
			onpointercancel={oneDimensional ? undefined : panEnd}
		>
			<title id="spectral-plot-title"
				>{oneDimensional ? 'Real eigenvalue density' : 'Eigenvalues in the complex plane'}</title
			>
			<desc id="spectral-plot-description">
				{oneDimensional
					? `A density view of ${eigenCount} real eigenvalues. The theoretical curve is an asymptotic reference.`
					: `${eigenCount} eigenvalues plotted with equal real and imaginary scale. Select a point for its numerical coordinates.`}
			</desc>
			<defs>
				<clipPath id="random-matrix-spectral-clip"
					><rect
						x={chart.left}
						y={chart.top}
						width={chart.right - chart.left}
						height={chart.bottom - chart.top}
					/></clipPath
				>
			</defs>
			<rect
				class="plot-background"
				x={chart.left}
				y={chart.top}
				width={chart.right - chart.left}
				height={chart.bottom - chart.top}
			/>
			{#if oneDimensional}
				<line class="axis" x1={chart.left} x2={chart.right} y1={chart.bottom} y2={chart.bottom} />
				<path class="density-line" d={histogramPath()} />
				{#if theoryDensityPath()}<path class="theory-density" d={theoryDensityPath()} />{/if}
				{#if theoryVisible && (theory?.atomAtZero ?? 0) > 0}
					<line
						class="zero-atom"
						x1={realPointX(0)}
						x2={realPointX(0)}
						y1={chart.bottom}
						y2={chart.bottom - zeroAtomHeight()}
					/>
					<circle
						class="zero-atom-marker"
						cx={realPointX(0)}
						cy={chart.bottom - zeroAtomHeight()}
						r="5"
					/>
					<text class="atom-label" x={realPointX(0) + 7} y={chart.bottom - zeroAtomHeight() - 7}
						>zero atom {(theory?.atomAtZero ?? 0).toFixed(3)}</text
					>
				{/if}
				{#if theoryVisible && theory?.supportMinimum !== undefined && theory.supportMaximum !== undefined}
					<line
						class="support"
						x1={realPointX(theory.supportMinimum)}
						x2={realPointX(theory.supportMaximum)}
						y1={chart.bottom - 6}
						y2={chart.bottom - 6}
					/>
				{/if}
				{#each Array.from(eigen?.real ?? []) as value, index (index)}
					<circle
						class="rug-point"
						class:selected={index === safeSelectedIndex}
						cx={realPointX(value)}
						cy={chart.bottom}
						r={index === safeSelectedIndex ? 5 : 2.5}
						tabindex={index === safeSelectedIndex ? 0 : -1}
						role="button"
						data-eigen-index={index}
						aria-label={pointDescription(index)}
						onclick={() => select(index)}
						onkeydown={pointKeydown}
					>
						<title>{pointDescription(index)}</title>
					</circle>
				{/each}
				<text
					class="axis-label"
					x={(chart.left + chart.right) / 2}
					y={chart.height - 8}
					text-anchor="middle">real eigenvalue λ</text
				>
			{:else}
				<g clip-path="url(#random-matrix-spectral-clip)">
					{#each densityBins as bin (`${bin.x}:${bin.y}`)}
						<rect
							class="density-cell"
							x={sx(bin.x) - densityCellSize() / 2}
							y={sy(bin.y) - densityCellSize() / 2}
							width={densityCellSize() + 0.5}
							height={densityCellSize() + 0.5}
							opacity={0.08 + 0.62 * Math.sqrt(bin.count / densityMaximum())}
						></rect>
					{/each}
					{#if theoryVisible && theory?.kind === 'circular-law'}
						<circle
							class="theory-boundary"
							cx={sx(0)}
							cy={sy(0)}
							r={circularTheoryRadius * geometricScale()}
						/>
					{/if}
					{#each tickValues() as tick (tick)}
						<line
							class:zero={Math.abs(tick) < 1e-12}
							class="gridline"
							x1={sx(tick)}
							x2={sx(tick)}
							y1={chart.top}
							y2={chart.bottom}
						/>
					{/each}
					{#each yTickValues() as tick (tick)}
						<line
							class:zero={Math.abs(tick) < 1e-12}
							class="gridline"
							x1={chart.left}
							x2={chart.right}
							y1={sy(tick)}
							y2={sy(tick)}
						/>
					{/each}
					{#each ensemblePoints.slice(-6000) as point, index (`${point.sample}:${index}`)}
						<circle class="ensemble-point" cx={sx(point.real)} cy={sy(point.imaginary)} r="1.1" />
					{/each}
					{#each Array.from({ length: eigenCount }, (_, index) => index) as index (index)}
						<circle
							class="eigen-point"
							class:selected={index === safeSelectedIndex}
							cx={sx(eigen?.real[index] ?? 0)}
							cy={sy(eigen?.imaginary[index] ?? 0)}
							r={index === safeSelectedIndex ? 5.5 : 3.2}
							tabindex={index === safeSelectedIndex ? 0 : -1}
							role="button"
							data-eigen-index={index}
							aria-label={pointDescription(index)}
							aria-describedby="spectral-keyboard-instructions"
							onclick={() => select(index)}
							onkeydown={pointKeydown}
						>
							<title>{pointDescription(index)}</title>
						</circle>
					{/each}
				</g>
				{#each tickValues() as tick (tick)}
					<text class="tick-label" x={sx(tick)} y={chart.bottom + 18} text-anchor="middle"
						>{formatNumber(tick, 2)}</text
					>
				{/each}
				{#each yTickValues() as tick (tick)}
					<text class="tick-label" x={chart.left - 8} y={sy(tick) + 3} text-anchor="end"
						>{formatNumber(tick, 2)}</text
					>
				{/each}
				<text
					class="axis-label"
					x={(chart.left + chart.right) / 2}
					y={chart.height - 8}
					text-anchor="middle">Re(λ)</text
				>
				<text
					class="axis-label"
					transform={`translate(16 ${(chart.top + chart.bottom) / 2}) rotate(-90)`}
					text-anchor="middle">Im(λ)</text
				>
			{/if}
		</svg>
		<figcaption>
			{#if theoryVisible && theory?.kind && theory.kind !== 'none'}
				{#if theory.kind === 'circular-law'}
					The dashed circular-law disk has radius r = {formatNumber(
						circularTheoryRadius,
						6
					)}{#if theory.note}
						({theory.note}){/if}. It is a large-n theoretical reference—not an exact finite-matrix
					boundary.
				{:else if theory.kind === 'semicircle'}
					The dashed semicircle curve{#if theory.note}
						({theory.note}){/if} is a large-n theoretical reference—not an exact finite-matrix boundary.
				{:else}
					The dashed Marchenko–Pastur density and support{#if theory.note}
						({theory.note}){/if} are a large-n theoretical reference—not an exact finite-matrix boundary.
				{/if}
				{#if theory.kind === 'marchenko-pastur' && theory.gamma !== undefined}
					Here γ = {formatNumber(theory.gamma, 4)}.{#if (theory.atomAtZero ?? 0) > 0}
						Because γ &gt; 1, the reference includes a point mass {(theory.atomAtZero ?? 0).toFixed(
							3
						)} at zero; the continuous density carries the remaining mass.
					{/if}
				{/if}
			{:else}
				No theoretical overlay is valid for the current normalisation and ensemble.
			{/if}
		</figcaption>
	</figure>

	<div class="selection-card" aria-live="polite">
		<div><span>Selected</span><strong>λ{safeSelectedIndex + 1}</strong></div>
		<div><span>Real part</span><strong>{formatNumber(selectedReal, 7)}</strong></div>
		<div><span>Imaginary part</span><strong>{formatNumber(selectedImaginary, 7)}</strong></div>
		<div>
			<span>Magnitude</span><strong>{formatNumber(selectedMagnitude, 7)}</strong>
		</div>
		<div>
			<span>Angle</span><strong>{formatNumber(selectedAngle, 5)} rad</strong>
		</div>
		<div><span>Residual</span><strong>{formatNumber(eigen?.residual, 3)}</strong></div>
	</div>
</section>

<style>
	.lens-header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
	}
	.lens-header p,
	.lens-header h3,
	figure,
	figcaption,
	.real-spectrum-note {
		margin: 0;
	}
	.eyebrow {
		color: var(--rm-accent);
		font: 750 0.6875rem var(--rm-mono);
		letter-spacing: 0.11em;
	}
	.lens-header h3 {
		margin-top: 0.12rem;
		font-size: clamp(1.1rem, 2vw, 1.45rem);
	}
	.lens-header p:last-child {
		max-width: 48rem;
		margin-top: 0.22rem;
		color: var(--rm-muted);
		font-size: 0.78rem;
		line-height: 1.45;
	}
	.spectral-radius {
		min-width: 9rem;
		border-left: 1px solid var(--rm-rule);
		padding-left: 0.8rem;
		text-align: right;
	}
	.spectral-radius span,
	.spectral-radius strong {
		display: block;
	}
	.spectral-radius span {
		color: var(--rm-muted);
		font-size: 0.6875rem;
	}
	.spectral-radius strong {
		margin-top: 0.15rem;
		font: 800 1rem var(--rm-mono);
	}
	.real-spectrum-note {
		margin-top: 0.65rem;
		border-left: 3px solid var(--rm-accent);
		background: color-mix(in srgb, var(--rm-accent) 7%, transparent);
		padding: 0.48rem 0.65rem;
		font-size: 0.74rem;
		line-height: 1.4;
	}
	.plot-toolbar {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.75rem;
		border-block: 1px solid var(--rm-rule);
		padding: 0.45rem 0;
	}
	.plot-toolbar span {
		margin-right: auto;
		color: var(--rm-muted);
		font: 650 0.7rem var(--rm-mono);
	}
	.plot-toolbar button {
		min-height: 2.75rem;
		border: 1px solid var(--rm-control);
		border-radius: 0.35rem;
		background: var(--rm-paper);
		padding: 0.35rem 0.6rem;
		color: var(--rm-ink);
		font: 750 0.74rem var(--rm-sans);
		cursor: pointer;
	}
	.keyboard-instructions {
		margin: 0.45rem 0 0;
		color: var(--rm-muted);
		font-size: 0.72rem;
		line-height: 1.45;
	}
	figure {
		min-width: 0;
		margin-top: 0.65rem;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		touch-action: none;
		user-select: none;
	}
	.plot-background {
		fill: var(--rm-plot-paper);
		stroke: var(--rm-rule);
	}
	.gridline {
		stroke: color-mix(in srgb, var(--rm-rule) 72%, transparent);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.gridline.zero,
	.axis {
		stroke: var(--rm-ink);
		stroke-width: 1.4;
	}
	.theory-boundary {
		fill: color-mix(in srgb, var(--rm-accent) 4%, transparent);
		stroke: var(--rm-theory);
		stroke-width: 2;
		stroke-dasharray: 9 6;
		vector-effect: non-scaling-stroke;
	}
	.density-cell {
		fill: var(--rm-density);
	}
	.ensemble-point {
		fill: var(--rm-density);
		opacity: 0.18;
	}
	.eigen-point,
	.rug-point {
		fill: var(--rm-point);
		stroke: var(--rm-plot-paper);
		stroke-width: 1;
		cursor: pointer;
		vector-effect: non-scaling-stroke;
	}
	.eigen-point.selected,
	.rug-point.selected {
		fill: var(--rm-selected);
		stroke: var(--rm-ink);
		stroke-width: 2;
	}
	.eigen-point:focus-visible,
	.rug-point:focus-visible,
	button:focus-visible {
		outline: 3px solid var(--rm-focus);
		outline-offset: 2px;
	}
	.density-line {
		fill: color-mix(in srgb, var(--rm-density) 15%, transparent);
		stroke: var(--rm-point);
		stroke-width: 2.2;
		vector-effect: non-scaling-stroke;
	}
	.theory-density {
		fill: none;
		stroke: var(--rm-theory);
		stroke-width: 2.2;
		stroke-dasharray: 10 6;
		vector-effect: non-scaling-stroke;
	}
	.zero-atom {
		stroke: var(--rm-theory);
		stroke-width: 4;
		vector-effect: non-scaling-stroke;
	}
	.zero-atom-marker {
		fill: var(--rm-theory);
		stroke: var(--rm-plot-paper);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.atom-label {
		fill: var(--rm-theory);
		font: 700 11px var(--rm-mono);
	}
	.support {
		stroke: var(--rm-theory);
		stroke-width: 4;
		stroke-linecap: round;
	}
	.tick-label,
	.axis-label {
		fill: var(--rm-muted);
		font-family: var(--rm-mono);
	}
	.tick-label {
		font-size: 11px;
	}
	.axis-label {
		font-size: 12px;
		font-weight: 700;
	}
	figure.narrow .tick-label {
		font-size: 11px;
	}
	figure.narrow .axis-label {
		font-size: 12px;
	}
	figcaption {
		margin-top: 0.4rem;
		color: var(--rm-muted);
		font-size: 0.72rem;
		line-height: 1.45;
	}
	.selection-card {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		margin-top: 0.7rem;
		border: 1px solid var(--rm-rule);
		border-radius: 0.35rem;
	}
	.selection-card > div {
		min-width: 0;
		border-right: 1px solid var(--rm-rule);
		padding: 0.55rem;
	}
	.selection-card > div:last-child {
		border-right: 0;
	}
	.selection-card span,
	.selection-card strong {
		display: block;
	}
	.selection-card span {
		color: var(--rm-muted);
		font-size: 0.6875rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.selection-card strong {
		overflow-wrap: anywhere;
		margin-top: 0.16rem;
		font: 750 0.72rem var(--rm-mono);
	}
	.high-contrast .eigen-point,
	.high-contrast .rug-point {
		stroke-width: 2;
	}
	@media (max-width: 48rem) {
		.selection-card {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.selection-card > div:nth-child(3) {
			border-right: 0;
		}
		.selection-card > div:nth-child(-n + 3) {
			border-bottom: 1px solid var(--rm-rule);
		}
	}
	@media (max-width: 32rem) {
		.lens-header {
			flex-direction: column;
		}
		.spectral-radius {
			width: 100%;
			border-top: 1px solid var(--rm-rule);
			border-left: 0;
			padding-top: 0.45rem;
			padding-left: 0;
			text-align: left;
		}
		.plot-toolbar {
			flex-wrap: wrap;
		}
		.plot-toolbar span {
			width: 100%;
		}
		.selection-card {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.selection-card > div,
		.selection-card > div:nth-child(3) {
			border-right: 1px solid var(--rm-rule);
			border-bottom: 1px solid var(--rm-rule);
		}
		.selection-card > div:nth-child(even) {
			border-right: 0;
		}
		.selection-card > div:nth-last-child(-n + 2) {
			border-bottom: 0;
		}
	}
	@media (forced-colors: active) {
		.plot-background,
		.plot-toolbar,
		.plot-toolbar button,
		.selection-card,
		.selection-card > div {
			border-color: CanvasText;
		}
		.eigen-point,
		.rug-point,
		.density-line,
		.theory-boundary,
		.theory-density {
			fill: Canvas;
			stroke: CanvasText;
		}
		.eigen-point.selected,
		.rug-point.selected {
			fill: Highlight;
		}
	}
</style>
