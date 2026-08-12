<script lang="ts">
	import { onMount } from 'svelte';
	import {
		constantLaw,
		evaluateGrowthLaw,
		type GrowthLaw
	} from '$lib/visualizations/gastropod-shell-lab/shell/model/growth-law';

	interface Props {
		id: string;
		label: string;
		symbol: string;
		law: GrowthLaw;
		unit?: string;
		equation: string;
		defaultValue: number;
		defaultLabel?: string;
		resetLabel?: string;
		explanation?: string;
		onchange: (law: GrowthLaw) => void;
	}

	let {
		id,
		label,
		symbol,
		law,
		unit = 'dimensionless',
		equation,
		defaultValue,
		defaultLabel = 'default',
		resetLabel = 'Reset to default',
		explanation,
		onchange
	}: Props = $props();
	let canvas: HTMLCanvasElement;
	let open = $state(false);
	const MAX_SINUSOID_CYCLES = 128;
	const SUMMARY_SAMPLES = 1025;

	function lawRange(current: GrowthLaw): { start: number; end: number; auxiliary: number } {
		switch (current.type) {
			case 'constant':
				return { start: current.value, end: current.value, auxiliary: 0 };
			case 'linear':
				return { start: current.start, end: current.end, auxiliary: 0 };
			case 'hermite':
				return { start: current.start, end: current.end, auxiliary: current.endSlope };
			case 'step':
				return {
					start: current.base,
					end: current.episodes[0]?.value ?? current.base,
					auxiliary: current.episodes[0]?.start ?? 0.65
				};
			case 'sinusoid':
				return { start: current.offset, end: current.amplitude, auxiliary: current.cycles };
			case 'keyframes':
				return {
					start: current.points[0]?.value ?? 0,
					end: current.points.at(-1)?.value ?? 0,
					auxiliary: current.points.length
				};
		}
	}

	let range = $derived(lawRange(law));
	let currentSummary = $derived.by(() => {
		const values = Array.from({ length: SUMMARY_SAMPLES }, (_, index) =>
			evaluateGrowthLaw(law, index / (SUMMARY_SAMPLES - 1))
		);
		return {
			start: values[0],
			end: values.at(-1) ?? values[0],
			minimum: Math.min(...values),
			maximum: Math.max(...values)
		};
	});

	function constantRepresentation(type: GrowthLaw['type'], value: number): GrowthLaw {
		switch (type) {
			case 'constant':
				return constantLaw(value);
			case 'linear':
				return { type, start: value, end: value };
			case 'hermite':
				return {
					type,
					start: value,
					end: value,
					startSlope: 0,
					endSlope: 0,
					clampOvershoot: true
				};
			case 'step':
				return { type, base: value, episodes: [] };
			case 'sinusoid':
				return {
					type,
					offset: value,
					amplitude: 0,
					cycles: 1,
					phase: 0
				};
			case 'keyframes':
				return {
					type,
					interpolation: 'linear',
					points: [
						{ age: 0, value },
						{ age: 1, value }
					]
				};
		}
	}

	function constantEquivalentValue(current: GrowthLaw): number | undefined {
		const close = (left: number, right: number): boolean =>
			Math.abs(left - right) <= 1e-12 * Math.max(1, Math.abs(left), Math.abs(right));
		switch (current.type) {
			case 'constant':
				return current.value;
			case 'linear':
				return close(current.start, current.end) ? current.start : undefined;
			case 'hermite':
				return close(current.start, current.end) &&
					(current.clampOvershoot || (close(current.startSlope, 0) && close(current.endSlope, 0)))
					? current.start
					: undefined;
			case 'step':
				return current.episodes.every((episode) => close(episode.value, current.base))
					? current.base
					: undefined;
			case 'sinusoid':
				return close(current.amplitude, 0) || close(current.cycles, 0)
					? evaluateGrowthLaw(current, 0)
					: undefined;
			case 'keyframes': {
				const value = current.points[0]?.value;
				return value !== undefined && current.points.every((point) => close(point.value, value))
					? value
					: undefined;
			}
		}
	}

	function lossyRepresentation(type: GrowthLaw['type'], current: GrowthLaw): GrowthLaw {
		const start = evaluateGrowthLaw(current, 0);
		const end = evaluateGrowthLaw(current, 1);
		const values = Array.from({ length: SUMMARY_SAMPLES }, (_, index) =>
			evaluateGrowthLaw(current, index / (SUMMARY_SAMPLES - 1))
		);
		const minimum = Math.min(...values);
		const maximum = Math.max(...values);
		switch (type) {
			case 'constant':
				return constantLaw(start);
			case 'linear':
				return { type, start, end };
			case 'hermite':
				return { type, start, end, startSlope: 0, endSlope: 0, clampOvershoot: true };
			case 'step':
				return {
					type,
					base: start,
					episodes: [{ start: 0.65, end: 0.8, value: end }]
				};
			case 'sinusoid':
				return {
					type,
					offset: (minimum + maximum) / 2,
					amplitude: (maximum - minimum) / 2,
					cycles: 1,
					phase: 0
				};
			case 'keyframes':
				return {
					type,
					interpolation: 'smooth',
					points: Array.from({ length: 5 }, (_, index) => {
						const age = index / 4;
						return { age, value: evaluateGrowthLaw(current, age) };
					})
				};
		}
	}

	function changeFamily(event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		const type = select.value as GrowthLaw['type'];
		if (type === law.type) return;
		const constantValue = constantEquivalentValue(law);
		if (constantValue !== undefined) {
			onchange(constantRepresentation(type, constantValue));
			return;
		}
		const confirmed = window.confirm(
			`Changing ${label} from ${law.type} to ${type} cannot preserve every authored detail. Continue with a sampled approximation?`
		);
		if (!confirmed) {
			select.value = law.type;
			return;
		}
		onchange(lossyRepresentation(type, law));
	}

	function commitNumber(
		event: Event,
		fallback: number,
		update: (value: number) => boolean | void
	): void {
		const input = event.currentTarget as HTMLInputElement;
		const raw = input.value.trim();
		const value = raw === '' ? Number.NaN : Number(raw);
		if (!Number.isFinite(value) || update(value) === false) input.value = String(fallback);
	}

	function changeStart(value: number): void {
		switch (law.type) {
			case 'constant':
				onchange({ ...law, value });
				break;
			case 'linear':
				onchange({ ...law, start: value });
				break;
			case 'hermite':
				onchange({ ...law, start: value });
				break;
			case 'step':
				onchange({ ...law, base: value });
				break;
			case 'sinusoid':
				onchange({ ...law, offset: value });
				break;
			case 'keyframes':
				onchange({
					...law,
					points: law.points.map((point, index) => (index === 0 ? { ...point, value } : point))
				});
				break;
		}
	}

	function changeEnd(value: number): void {
		switch (law.type) {
			case 'constant':
				return;
			case 'linear':
				onchange({ ...law, end: value });
				break;
			case 'hermite':
				onchange({ ...law, end: value });
				break;
			case 'step':
				onchange({
					...law,
					episodes: law.episodes.length
						? law.episodes.map((episode, index) => (index === 0 ? { ...episode, value } : episode))
						: [{ start: 0.65, end: 0.8, value }]
				});
				break;
			case 'sinusoid':
				onchange({ ...law, amplitude: value });
				break;
			case 'keyframes':
				onchange({
					...law,
					points: law.points.map((point, index) =>
						index === law.points.length - 1 ? { ...point, value } : point
					)
				});
				break;
		}
	}

	function changeAuxiliary(value: number): void {
		switch (law.type) {
			case 'hermite':
				onchange({ ...law, endSlope: value });
				break;
			case 'step': {
				const episode = law.episodes[0];
				if (!episode) {
					const start = Math.max(0, Math.min(1, value));
					onchange({
						...law,
						episodes: [{ start, end: Math.min(1, start + 0.15), value: law.base }]
					});
					return;
				}
				const duration = episode.end - episode.start;
				const start = Math.max(0, Math.min(1, value));
				onchange({
					...law,
					episodes: [
						{ ...episode, start, end: Math.min(1, start + duration) },
						...law.episodes.slice(1)
					]
				});
				break;
			}
			case 'sinusoid':
				onchange({
					...law,
					cycles: Math.min(MAX_SINUSOID_CYCLES, Math.max(0, value))
				});
				break;
			default:
				break;
		}
	}

	function updateKeyframe(index: number, field: 'age' | 'value', value: number): boolean {
		if (law.type !== 'keyframes') return false;
		if (field === 'age') {
			const previous = law.points[index - 1]?.age;
			const next = law.points[index + 1]?.age;
			if (
				value < 0 ||
				value > 1 ||
				(previous !== undefined && value <= previous) ||
				(next !== undefined && value >= next)
			) {
				return false;
			}
		}
		onchange({
			...law,
			points: law.points.map((point, pointIndex) =>
				pointIndex === index ? { ...point, [field]: value } : point
			)
		});
		return true;
	}

	function addFirstStepEpisode(): void {
		if (law.type !== 'step' || law.episodes.length > 0) return;
		onchange({ ...law, episodes: [{ start: 0.65, end: 0.8, value: law.base }] });
	}

	function draw(): void {
		if (!canvas) return;
		const ratio = window.devicePixelRatio || 1;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		canvas.width = Math.max(1, Math.round(width * ratio));
		canvas.height = Math.max(1, Math.round(height * ratio));
		const context = canvas.getContext('2d');
		if (!context) return;
		context.scale(ratio, ratio);
		context.clearRect(0, 0, width, height);
		const style = getComputedStyle(canvas);
		const grid = style.getPropertyValue('--line').trim() || '#39413e';
		const cyan = style.getPropertyValue('--cyan').trim() || '#69c8c2';
		context.strokeStyle = grid;
		context.lineWidth = 1;
		context.beginPath();
		for (let i = 0; i <= 4; i += 1) {
			const x = 6 + ((width - 12) * i) / 4;
			context.moveTo(x, 6);
			context.lineTo(x, height - 6);
		}
		for (let i = 0; i <= 2; i += 1) {
			const y = 6 + ((height - 12) * i) / 2;
			context.moveTo(6, y);
			context.lineTo(width - 6, y);
		}
		context.stroke();

		const values = Array.from({ length: 121 }, (_, index) => evaluateGrowthLaw(law, index / 120));
		let minimum = Math.min(...values);
		let maximum = Math.max(...values);
		if (Math.abs(maximum - minimum) < 1e-9) {
			minimum -= 0.5;
			maximum += 0.5;
		}
		const pad = (maximum - minimum) * 0.12;
		minimum -= pad;
		maximum += pad;
		context.strokeStyle = cyan;
		context.lineWidth = 2;
		context.beginPath();
		values.forEach((value, index) => {
			const x = 6 + ((width - 12) * index) / (values.length - 1);
			const y = height - 6 - ((value - minimum) / (maximum - minimum)) * (height - 12);
			if (index === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		});
		context.stroke();
	}

	onMount(() => {
		draw();
		const observer = new ResizeObserver(draw);
		observer.observe(canvas);
		return () => observer.disconnect();
	});

	$effect(() => {
		void law;
		if (typeof window !== 'undefined') requestAnimationFrame(draw);
	});
</script>

<section class="curve-editor" aria-labelledby={`${id}-curve-title`}>
	<div class="curve-heading">
		<div>
			<h3 id={`${id}-curve-title`}>{label} <em>{symbol}</em></h3>
			<p>
				{law.type} · endpoints {currentSummary.start.toFixed(4)} → {currentSummary.end.toFixed(4)}
				· sampled range {currentSummary.minimum.toFixed(4)}…{currentSummary.maximum.toFixed(4)}
				{unit}
				· {defaultLabel}
				{defaultValue.toFixed(4)}
			</p>
			<p class="affected-equation">changes <code>{equation}</code></p>
			{#if explanation}<p class="curve-explanation">{explanation}</p>{/if}
		</div>
		<div class="curve-actions">
			<button
				class="quiet-button"
				type="button"
				disabled={law.type === 'constant' && Math.abs(law.value - defaultValue) < 1e-12}
				onclick={() => onchange(constantLaw(defaultValue))}>{resetLabel}</button
			>
			<button class="quiet-button" type="button" aria-expanded={open} onclick={() => (open = !open)}
				>{open ? 'Close law' : 'Edit law'}</button
			>
		</div>
	</div>
	<canvas bind:this={canvas} aria-label={`${label} growth law over normalized age`}></canvas>
	<div class="axis-labels" aria-hidden="true">
		<span>protoconch · τ=0</span><span>adult · τ=1</span>
	</div>

	{#if open}
		<div class="editor-fields">
			<label>
				<span>Law family</span>
				<select value={law.type} onchange={changeFamily}>
					<option value="constant">Constant</option>
					<option value="linear">Linear ramp</option>
					<option value="hermite">Smooth Hermite</option>
					<option value="step">Episodic step</option>
					<option value="sinusoid">Sinusoid</option>
					<option value="keyframes">Keyframes</option>
				</select>
			</label>
			<label>
				<span>{law.type === 'sinusoid' ? 'Offset' : law.type === 'step' ? 'Base' : 'Start'}</span>
				<input
					type="number"
					step="0.001"
					value={range.start}
					required
					onchange={(event) => commitNumber(event, range.start, changeStart)}
				/>
			</label>
			<label>
				<span
					>{law.type === 'sinusoid'
						? 'Amplitude'
						: law.type === 'step'
							? 'Episode value'
							: 'End'}</span
				>
				<input
					type="number"
					step="0.001"
					value={range.end}
					disabled={law.type === 'constant'}
					required
					onchange={(event) => commitNumber(event, range.end, changeEnd)}
				/>
			</label>
			<label>
				<span
					>{law.type === 'sinusoid'
						? 'Cycles'
						: law.type === 'step'
							? 'Event start τ'
							: 'End slope / detail'}</span
				>
				<input
					type="number"
					step="0.01"
					min={law.type === 'sinusoid' || law.type === 'step' ? 0 : undefined}
					max={law.type === 'sinusoid' ? MAX_SINUSOID_CYCLES : law.type === 'step' ? 1 : undefined}
					value={range.auxiliary}
					disabled={law.type === 'constant' || law.type === 'linear' || law.type === 'keyframes'}
					required
					onchange={(event) => commitNumber(event, range.auxiliary, changeAuxiliary)}
				/>
			</label>
		</div>
		{#if law.type === 'step' && law.episodes.length === 0}
			<div class="empty-step">
				<span>This constant step law has no episodes yet.</span>
				<button class="quiet-button" type="button" onclick={addFirstStepEpisode}
					>Add first episode</button
				>
			</div>
		{/if}
		{#if law.type === 'keyframes'}
			<div class="point-editor" aria-label={`${label} keyframe points`}>
				<label
					>Interpolation <select
						value={law.interpolation}
						onchange={(event) =>
							onchange({
								...law,
								interpolation: (event.currentTarget as HTMLSelectElement).value as
									| 'linear'
									| 'smooth'
									| 'step'
							})}
						><option value="linear">Linear</option><option value="smooth">Smooth</option><option
							value="step">Step</option
						></select
					></label
				>
				{#each law.points as point, index (index)}
					<div>
						<span>Point {index + 1}</span><label
							>age τ <input
								type="number"
								min="0"
								max="1"
								step="0.001"
								value={point.age}
								required
								onchange={(event) =>
									commitNumber(event, point.age, (value) => updateKeyframe(index, 'age', value))}
							/></label
						><label
							>value <input
								type="number"
								step="0.001"
								value={point.value}
								required
								onchange={(event) =>
									commitNumber(event, point.value, (value) =>
										updateKeyframe(index, 'value', value)
									)}
							/></label
						>
					</div>
				{/each}
			</div>
		{/if}
		<p class="equation">
			Changes <code>{equation}</code>. Same-family edits retain unexposed authored details. A family
			change asks before replacing a non-constant history; keyframe ages must remain strictly
			ordered.
		</p>
	{/if}
</section>

<style>
	.curve-editor {
		padding: 0.72rem 0.8rem;
		border-bottom: 1px solid var(--line);
	}

	.curve-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	h3,
	p {
		margin: 0;
	}

	h3 {
		font-size: 0.76rem;
		font-weight: 640;
	}

	h3 em {
		margin-left: 0.3rem;
		font-family: Georgia, serif;
		font-weight: 400;
		color: var(--cyan);
	}

	.curve-heading p {
		margin-top: 0.18rem;
		font-size: 0.58rem;
		color: var(--faint);
	}

	.affected-equation code {
		color: var(--cyan);
	}
	.curve-explanation {
		max-width: 68ch;
		line-height: 1.4;
	}
	.curve-actions {
		display: flex;
		gap: 0.35rem;
	}
	.empty-step {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		margin-top: 0.55rem;
		padding: 0.5rem;
		border: 1px dashed var(--line);
		border-radius: 5px;
		font-size: 0.56rem;
		color: var(--muted);
	}
	.point-editor {
		display: grid;
		gap: 0.45rem;
		margin-top: 0.65rem;
		padding: 0.55rem;
		border: 1px solid var(--line);
		border-radius: 6px;
	}
	.point-editor > label,
	.point-editor > div {
		display: grid;
		grid-template-columns: minmax(70px, 1fr) 1fr 1fr;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.56rem;
		color: var(--muted);
	}
	.point-editor > label {
		grid-template-columns: 1fr 2fr;
	}
	.point-editor label {
		display: grid;
		gap: 0.18rem;
	}
	.point-editor input,
	.point-editor select {
		width: 100%;
		min-height: 32px;
		padding: 0.25rem;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--bg);
		color: var(--text);
	}

	canvas {
		display: block;
		width: 100%;
		height: 68px;
		margin-top: 0.55rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg);
	}

	.axis-labels {
		display: flex;
		justify-content: space-between;
		margin-top: 0.2rem;
		font-size: 0.52rem;
		color: var(--faint);
	}

	.editor-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		margin-top: 0.65rem;
	}

	.editor-fields label {
		display: grid;
		gap: 0.22rem;
		font-size: 0.58rem;
		color: var(--muted);
	}

	.editor-fields input,
	.editor-fields select {
		width: 100%;
		min-height: 34px;
		padding: 0.3rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--bg);
		color: var(--text);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.65rem;
	}

	.equation {
		margin-top: 0.6rem;
		font-size: 0.6rem;
		line-height: 1.45;
		color: var(--muted);
	}

	.equation code {
		color: var(--cyan);
	}

	@media (max-width: 720px) {
		canvas {
			height: 84px;
		}

		.editor-fields input,
		.editor-fields select {
			min-height: 44px;
		}
	}
</style>
