<script lang="ts">
	import { tick } from 'svelte';
	import type { ShellGenerationResult } from '$lib/visualizations/gastropod-shell-lab/shell/engine';
	import {
		classifyShellRecipe,
		type ShellRecipe
	} from '$lib/visualizations/gastropod-shell-lab/shell/model';
	import {
		downloadRecipeJson,
		downloadRingHistoryCsv,
		openRecipeSheet
	} from '$lib/visualizations/gastropod-shell-lab/export/client-exports';
	import type { ViewportExportCommand } from './Viewport3D.svelte';

	interface Props {
		open: boolean;
		recipe: ShellRecipe;
		result?: ShellGenerationResult;
		geometryValid?: boolean;
		diagnosticMessages?: string[];
		onclose: () => void;
		onviewportexport: (command: Omit<ViewportExportCommand, 'id'>) => void;
	}

	let {
		open,
		recipe,
		result,
		geometryValid = true,
		diagnosticMessages = [],
		onclose,
		onviewportexport
	}: Props = $props();
	let dialog: HTMLDialogElement;
	let pngScale = $state<1 | 2 | 4>(2);
	let transparent = $state(false);

	const triangleEstimate = $derived(result ? Math.round(result.mesh.indices.length / 3) : 0);
	const binaryEstimate = $derived(
		result
			? result.mesh.positions.byteLength +
					result.mesh.normals.byteLength +
					result.mesh.indices.byteLength
			: 0
	);
	const canExportGeometry = $derived(geometryValid && Boolean(result?.diagnostics.valid));
	const recipeClassification = $derived(classifyShellRecipe(recipe));

	function humanBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			void tick().then(() => dialog.showModal());
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});
</script>

<dialog
	bind:this={dialog}
	aria-labelledby="export-title"
	{onclose}
	oncancel={(event) => {
		event.preventDefault();
		onclose();
	}}
>
	<header class="dialog-header">
		<div>
			<p class="panel-title">Same recipe · appropriate tessellation</p>
			<h2 id="export-title">Export the specimen</h2>
		</div>
		<button class="icon-button" type="button" aria-label="Close export dialog" onclick={onclose}
			>×</button
		>
	</header>

	<div class="dialog-body">
		<div class="estimate">
			<div>
				<span>{geometryValid ? 'Current surface' : 'Last valid surface retained'}</span><strong
					class="number">{triangleEstimate.toLocaleString()} triangles</strong
				>
			</div>
			<div>
				<span>Raw mesh buffers</span><strong class="number">≈ {humanBytes(binaryEstimate)}</strong>
			</div>
			<div>
				<span>Topology</span><strong
					>{result?.mesh.topology.manifold
						? `Manifold visual surface · ${result.mesh.topology.boundaryLoopCount} open boundary`
						: 'Visual surface · topology warning'}</strong
				>
			</div>
		</div>

		<section>
			<div class="section-title">
				<div>
					<h3>Image</h3>
					<p>Studio render from the current camera.</p>
				</div>
				<span class="badge cyan">PNG</span>
			</div>
			<div class="png-options">
				<label
					>Resolution
					<select bind:value={pngScale}
						><option value={1}>1× viewport</option><option value={2}>2× viewport</option><option
							value={4}>4× viewport</option
						></select
					>
				</label>
				<label class="check"
					><input type="checkbox" bind:checked={transparent} /> Transparent background</label
				>
				<button
					class="primary-button"
					type="button"
					disabled={!canExportGeometry}
					onclick={() => onviewportexport({ type: 'png', scale: pngScale, transparent })}
					>Download PNG</button
				>
			</div>
		</section>

		<section>
			<div class="section-title">
				<div>
					<h3>3D exchange</h3>
					<p>Open outer surface with the adult aperture intentionally unsealed.</p>
				</div>
				<span class="badge amber">Geometry</span>
			</div>
			<div class="export-grid">
				<button
					class="export-card"
					type="button"
					disabled={!canExportGeometry}
					onclick={() => onviewportexport({ type: 'glb' })}
				>
					<strong>GLB</strong><span>Primary compact 3D exchange format</span>
				</button>
				<button
					class="export-card"
					type="button"
					disabled={!canExportGeometry}
					onclick={() => onviewportexport({ type: 'obj' })}
				>
					<strong>OBJ</strong><span>Compatibility surface mesh</span>
				</button>
			</div>
			<div class="stl-absent">
				<strong>STL intentionally absent</strong>
				<p>
					This release does not claim that the open visual surface is watertight. A printable STL
					requires a separate inner wall, joined lip, closed apex, orientation, manifold, thickness,
					and intersection validation. No misleading STL button is exposed.
				</p>
			</div>
		</section>

		<section>
			<div class="section-title">
				<div>
					<h3>Recipe & data</h3>
					<p>Deterministic, versioned records of the model and aperture history.</p>
				</div>
				<span class="badge">Data</span>
			</div>
			<div class="export-grid three">
				<button class="export-card" type="button" onclick={() => downloadRecipeJson(recipe)}
					><strong>.shell.json</strong><span>Validated versioned recipe</span></button
				>
				<button
					class="export-card"
					type="button"
					disabled={!canExportGeometry}
					onclick={() => result?.diagnostics.valid && downloadRingHistoryCsv(recipe, result)}
					><strong>CSV</strong><span>Ring centres, frames, scale and recipe context</span></button
				>
				<button
					class="export-card"
					type="button"
					onclick={() =>
						openRecipeSheet(recipe, {
							classification: `${recipeClassification.label}. Scope: ${recipeClassification.appliesTo}; finite rendered shell strictly similar: no.`,
							diagnostics:
								diagnosticMessages.length > 0
									? diagnosticMessages
									: result
										? [...result.diagnostics.warnings, ...result.diagnostics.errors]
										: []
						})}
					><strong>Recipe sheet</strong><span>Print or save as PDF from the browser</span></button
				>
			</div>
		</section>
	</div>
	<footer class="dialog-footer">
		<button class="quiet-button" type="button" onclick={onclose}>Done</button>
	</footer>
</dialog>

<style>
	.dialog-header,
	.dialog-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.85rem 1rem;
		border-bottom: 1px solid var(--line);
	}

	.dialog-footer {
		justify-content: flex-end;
		border-top: 1px solid var(--line);
		border-bottom: 0;
	}

	h2 {
		margin: 0.14rem 0 0;
		font-size: 1.18rem;
	}
	.dialog-body {
		max-height: calc(100dvh - 145px);
		padding: 1rem;
		overflow-y: auto;
	}
	.estimate {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--line);
		overflow: hidden;
	}
	.estimate div {
		display: grid;
		gap: 0.28rem;
		padding: 0.7rem;
		background: var(--panel);
	}
	.estimate span {
		font-size: 0.58rem;
		color: var(--muted);
	}
	.estimate strong {
		font-size: 0.72rem;
		font-weight: 650;
	}
	section {
		padding: 1rem 0;
		border-bottom: 1px solid var(--line);
	}
	section:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}
	.section-title {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.72rem;
	}
	h3 {
		margin: 0;
		font-size: 0.85rem;
	}
	.section-title p {
		margin: 0.2rem 0 0;
		font-size: 0.62rem;
		color: var(--muted);
	}
	.png-options {
		display: flex;
		align-items: end;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.png-options > label:not(.check) {
		display: grid;
		gap: 0.25rem;
		font-size: 0.58rem;
		color: var(--muted);
	}
	select {
		min-height: 38px;
		padding: 0.35rem 0.45rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text);
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 38px;
		font-size: 0.65rem;
		color: var(--muted);
	}
	.check input {
		width: 16px;
		height: 16px;
		accent-color: var(--amber);
	}
	.export-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.55rem;
	}
	.export-grid.three {
		grid-template-columns: repeat(3, 1fr);
	}
	.export-card {
		display: grid;
		gap: 0.26rem;
		min-height: 70px;
		padding: 0.65rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--panel);
		text-align: left;
	}
	.export-card:hover {
		border-color: var(--cyan);
		background: var(--panel-2);
	}
	.export-card strong {
		font-size: 0.75rem;
		color: var(--cyan);
	}
	.export-card span {
		font-size: 0.58rem;
		line-height: 1.4;
		color: var(--muted);
	}
	.stl-absent {
		margin-top: 0.7rem;
		padding: 0.65rem 0.75rem;
		border-left: 2px solid var(--amber);
		background: color-mix(in srgb, var(--amber-soft) 10%, transparent);
	}
	.stl-absent strong {
		font-size: 0.68rem;
		color: var(--amber);
	}
	.stl-absent p {
		margin: 0.3rem 0 0;
		font-size: 0.61rem;
		line-height: 1.5;
		color: var(--muted);
	}
	@media (max-width: 600px) {
		.estimate {
			grid-template-columns: 1fr;
		}
		.export-grid,
		.export-grid.three {
			grid-template-columns: 1fr;
		}
		.dialog-body {
			padding: 0.75rem;
		}
		.png-options > * {
			width: 100%;
		}
	}
</style>
