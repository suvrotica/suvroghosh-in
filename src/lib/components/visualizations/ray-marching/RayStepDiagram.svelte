<script lang="ts">
	import {
		RAY_DIAGRAM_CAMERA,
		RAY_DIAGRAM_EPSILON,
		RAY_DIAGRAM_POINTS,
		RAY_DIAGRAM_SAFETY,
		RAY_DIAGRAM_SPHERE,
		diagramRadius,
		diagramX,
		diagramY
	} from './ray-diagram';

	const uid = $props.id();
	let selectedStep = $state(0);
	let current = $derived(RAY_DIAGRAM_POINTS[selectedStep] ?? RAY_DIAGRAM_POINTS[0]);

	function selectStep(next: number): void {
		selectedStep = Math.max(0, Math.min(RAY_DIAGRAM_POINTS.length - 1, next));
	}

	function number(value: number): string {
		return value.toFixed(3);
	}
</script>

<figure
	class="ray-step-diagram not-prose my-10 overflow-hidden rounded-xl border border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900"
	aria-labelledby={`${uid}-title`}
>
	<header class="border-b border-neutral-300 px-4 py-4 sm:px-5 dark:border-neutral-700">
		<p
			class="m-0 text-left text-xs font-bold tracking-[0.14em] text-cyan-700 uppercase dark:text-cyan-300"
		>
			Sphere tracing, one reply at a time
		</p>
		<h2 id={`${uid}-title`} class="mt-1 mb-0 text-xl text-neutral-950 dark:text-white">
			How far may the ray walk safely?
		</h2>
		<p
			class="mt-2 mb-0 max-w-3xl text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-300"
		>
			The circle at each sample has the radius returned by the signed-distance function. This
			diagram advances by {RAY_DIAGRAM_SAFETY.toFixed(2)} times that value, leaving a conservative margin
			until the returned distance falls below {RAY_DIAGRAM_EPSILON.toFixed(2)}.
		</p>
	</header>

	<div class="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
		<div
			class="min-w-0 border-b border-neutral-300 p-3 sm:p-5 lg:border-r lg:border-b-0 dark:border-neutral-700"
		>
			<svg
				viewBox="0 0 720 320"
				class="block h-auto w-full rounded-lg bg-[#07111d]"
				aria-hidden="true"
			>
				<defs>
					<linearGradient id={`${uid}-ray`} x1="0" x2="1">
						<stop offset="0" stop-color="#67e8f9" />
						<stop offset="1" stop-color="#fbbf24" />
					</linearGradient>
					<radialGradient id={`${uid}-surface`} cx="35%" cy="30%">
						<stop offset="0" stop-color="#26394b" />
						<stop offset="0.72" stop-color="#0b1119" />
						<stop offset="1" stop-color="#020407" />
					</radialGradient>
				</defs>

				<path d="M 0 259 H 720" stroke="#274156" stroke-width="1" stroke-dasharray="7 8" />
				<circle
					cx={diagramX(RAY_DIAGRAM_SPHERE.x)}
					cy={diagramY(RAY_DIAGRAM_SPHERE.y)}
					r={diagramRadius(RAY_DIAGRAM_SPHERE.radius)}
					fill={`url(#${uid}-surface)`}
					stroke="#d9e8ef"
					stroke-width="2"
				/>
				<text
					x={diagramX(RAY_DIAGRAM_SPHERE.x)}
					y={diagramY(RAY_DIAGRAM_SPHERE.y) + 5}
					text-anchor="middle"
					fill="#a8bac7"
					font-size="14">surface</text
				>

				<line
					x1={diagramX(RAY_DIAGRAM_CAMERA.x)}
					y1={diagramY(RAY_DIAGRAM_CAMERA.y)}
					x2="640"
					y2="184"
					stroke={`url(#${uid}-ray)`}
					stroke-width="3"
					stroke-linecap="round"
				/>
				<path
					d={`M ${diagramX(RAY_DIAGRAM_CAMERA.x) - 18} ${diagramY(RAY_DIAGRAM_CAMERA.y) - 18} L ${diagramX(RAY_DIAGRAM_CAMERA.x) + 8} ${diagramY(RAY_DIAGRAM_CAMERA.y)} L ${diagramX(RAY_DIAGRAM_CAMERA.x) - 18} ${diagramY(RAY_DIAGRAM_CAMERA.y) + 18} Z`}
					fill="#e6f7ff"
				/>
				<text
					x={diagramX(RAY_DIAGRAM_CAMERA.x) - 4}
					y={diagramY(RAY_DIAGRAM_CAMERA.y) - 28}
					fill="#d8f8ff"
					font-size="14">camera</text
				>

				{#each RAY_DIAGRAM_POINTS as point (point.step)}
					<circle
						cx={diagramX(point.x)}
						cy={diagramY(point.y)}
						r={diagramRadius(point.distance)}
						fill="none"
						stroke={point.step === selectedStep ? '#fbbf24' : '#67e8f9'}
						stroke-width={point.step === selectedStep ? 2.5 : 1}
						stroke-opacity={point.step === selectedStep ? 0.92 : 0.22}
						stroke-dasharray={point.step === selectedStep ? 'none' : '5 6'}
					/>
					<circle
						cx={diagramX(point.x)}
						cy={diagramY(point.y)}
						r={point.step === selectedStep ? 6 : 4}
						fill={point.hit ? '#fbbf24' : '#67e8f9'}
						stroke="#07111d"
						stroke-width="2"
					/>
					<text
						x={diagramX(point.x)}
						y={diagramY(point.y) - 12}
						text-anchor="middle"
						fill={point.step === selectedStep ? '#fde68a' : '#a5c7d4'}
						font-size="13">p{point.step}</text
					>
				{/each}
			</svg>

			<div class="mt-4 grid gap-3">
				<label
					for={`${uid}-step`}
					class="flex items-baseline justify-between gap-3 text-sm font-bold text-neutral-800 dark:text-neutral-100"
				>
					<span>Current sample</span>
					<output
						for={`${uid}-step`}
						class="font-mono text-xs text-neutral-600 dark:text-neutral-300"
					>
						Step {selectedStep + 1} of {RAY_DIAGRAM_POINTS.length}
					</output>
				</label>
				<input
					id={`${uid}-step`}
					type="range"
					min="0"
					max={RAY_DIAGRAM_POINTS.length - 1}
					step="1"
					value={selectedStep}
					oninput={(event) => selectStep(Number(event.currentTarget.value))}
					class="h-11 w-full cursor-pointer accent-cyan-700 dark:accent-cyan-300"
				/>
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						disabled={selectedStep === 0}
						onclick={() => selectStep(selectedStep - 1)}
						class="min-h-11 rounded-md border border-neutral-400 px-4 py-2 text-sm font-bold text-neutral-800 disabled:opacity-45 dark:border-neutral-600 dark:text-neutral-100"
					>
						Previous step
					</button>
					<button
						type="button"
						disabled={selectedStep === RAY_DIAGRAM_POINTS.length - 1}
						onclick={() => selectStep(selectedStep + 1)}
						class="min-h-11 rounded-md border border-neutral-400 px-4 py-2 text-sm font-bold text-neutral-800 disabled:opacity-45 dark:border-neutral-600 dark:text-neutral-100"
					>
						Next step
					</button>
				</div>
			</div>
		</div>

		<div class="min-w-0 p-4 sm:p-5">
			<p
				class="mt-0 mb-3 text-left text-sm leading-relaxed text-neutral-700 dark:text-neutral-200"
				aria-live="polite"
			>
				At <strong>p{current.step}</strong>, the accumulated distance is
				<strong>{number(current.t)}</strong>. The field returns
				<strong>{number(current.distance)}</strong>. {current.hit
					? 'That is inside the hit threshold, so the walk stops.'
					: `The next safe advance is ${number(current.distance * RAY_DIAGRAM_SAFETY)}.`}
			</p>
			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-left text-sm">
					<caption class="sr-only">
						Sphere-tracing samples with accumulated ray distance, returned distance and hit state
					</caption>
					<thead>
						<tr class="border-b border-neutral-300 dark:border-neutral-700">
							<th scope="col" class="px-2 py-2">Step</th>
							<th scope="col" class="px-2 py-2"><var>t</var></th>
							<th scope="col" class="px-2 py-2">Returned <var>d</var></th>
							<th scope="col" class="px-2 py-2">State</th>
						</tr>
					</thead>
					<tbody>
						{#each RAY_DIAGRAM_POINTS as point (point.step)}
							<tr
								class="border-b border-neutral-200 dark:border-neutral-800 {point.step ===
								selectedStep
									? 'bg-cyan-50 dark:bg-cyan-950'
									: ''}"
							>
								<th scope="row" class="px-2 py-2 font-mono">{point.step}</th>
								<td class="px-2 py-2 font-mono">{number(point.t)}</td>
								<td class="px-2 py-2 font-mono">{number(point.distance)}</td>
								<td class="px-2 py-2">{point.hit ? 'Hit' : 'Walking'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</div>

	<noscript>
		<p
			class="border-t border-neutral-300 p-4 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
		>
			The table above is the complete non-animated explanation. JavaScript only changes which row
			and safe-distance circle are highlighted.
		</p>
	</noscript>

	<figcaption
		class="border-t border-neutral-300 px-4 py-3 text-sm leading-relaxed text-neutral-600 sm:px-5 dark:border-neutral-700 dark:text-neutral-300"
	>
		The drawing is a two-dimensional slice through one exact sphere SDF. The Cathedral uses the same
		walking rule with a conservative bound for its composed scene.
	</figcaption>
</figure>
