<script lang="ts">
	import type { InkEditorState } from '$lib/notes/editor-state.svelte';
	import type { DrawingTool, PaperStyle, Tool } from '$lib/notes/model';

	type Props = {
		editor: InkEditorState;
		onfit: () => void;
		onfullscreen: () => void;
		onaddtile: () => void;
		onimage: (file: File) => void;
		onimport: (file: File) => void;
		onexport: (format: 'source' | 'svg' | 'png' | 'pdf') => void;
	};

	let { editor, onfit, onfullscreen, onaddtile, onimage, onimport, onexport }: Props = $props();
	let expanded = $state(false);
	let imageInput: HTMLInputElement;
	let importInput: HTMLInputElement;

	const primaryTools: Array<{ tool: Tool; label: string; short: string }> = [
		{ tool: 'select', label: 'Select and move', short: 'Select' },
		{ tool: 'lasso', label: 'Lasso select', short: 'Lasso' },
		{ tool: 'hand', label: 'Pan canvas', short: 'Pan' },
		{ tool: 'charcoal', label: 'Charcoal pen', short: 'Charcoal' },
		{ tool: 'pencil', label: 'Pencil', short: 'Pencil' },
		{ tool: 'fountain', label: 'Fountain pen', short: 'Fountain' },
		{ tool: 'marker', label: 'Marker', short: 'Marker' },
		{ tool: 'highlighter', label: 'Highlighter', short: 'Highlight' },
		{ tool: 'eraser', label: 'Object eraser', short: 'Erase' }
	];

	const objectTools: Array<{ tool: Tool; label: string; short: string }> = [
		{ tool: 'line', label: 'Line', short: 'Line' },
		{ tool: 'arrow', label: 'Arrow', short: 'Arrow' },
		{ tool: 'rectangle', label: 'Rectangle', short: 'Rect' },
		{ tool: 'ellipse', label: 'Ellipse', short: 'Ellipse' },
		{ tool: 'text', label: 'Text box', short: 'Text' },
		{ tool: 'sticky', label: 'Sticky note', short: 'Sticky' }
	];

	function imageSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) onimage(file);
		input.value = '';
	}

	function importSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) onimport(file);
		input.value = '';
	}

	function updateBrush(
		key: 'size' | 'opacity' | 'texture' | 'smoothing' | 'pressure' | 'pressureCurve',
		value: number
	) {
		const tool: DrawingTool =
			editor.tool === 'pencil' ||
			editor.tool === 'fountain' ||
			editor.tool === 'marker' ||
			editor.tool === 'highlighter'
				? editor.tool
				: 'charcoal';
		editor.setBrush(tool, { [key]: value });
	}

	function activeBrushTool(): DrawingTool {
		return editor.tool === 'pencil' ||
			editor.tool === 'fountain' ||
			editor.tool === 'marker' ||
			editor.tool === 'highlighter'
			? editor.tool
			: 'charcoal';
	}
</script>

<div class:expanded class:quiet={editor.distractionFree} class="ink-toolbar-shell">
	<div class="toolbar-primary" role="toolbar" aria-label="Canvas tools">
		<button
			type="button"
			class="toolbar-toggle"
			aria-expanded={expanded}
			aria-controls="ink-more-tools"
			onclick={() => (expanded = !expanded)}
		>
			<span aria-hidden="true">☰</span>
			<span class="sr-only">Show or hide more canvas tools</span>
		</button>

		{#each primaryTools as item (item.tool)}
			<button
				type="button"
				class:active={editor.tool === item.tool}
				aria-pressed={editor.tool === item.tool}
				title={item.label}
				onclick={() => editor.setTool(item.tool)}
			>
				<span>{item.short}</span>
			</button>
		{/each}

		<span class="toolbar-separator" aria-hidden="true"></span>

		<button
			type="button"
			title="Undo (Ctrl/Command Z)"
			disabled={!editor.canUndo}
			onclick={() => editor.undo()}
		>
			Undo
		</button>
		<button
			type="button"
			title="Redo (Ctrl/Command Shift Z)"
			disabled={!editor.canRedo}
			onclick={() => editor.redo()}
		>
			Redo
		</button>
	</div>

	<div id="ink-more-tools" class="toolbar-more" hidden={!expanded}>
		<section aria-labelledby="add-items-heading">
			<h2 id="add-items-heading">Add</h2>
			<div class="button-grid">
				{#each objectTools as item (item.tool)}
					<button
						type="button"
						class:active={editor.tool === item.tool}
						aria-pressed={editor.tool === item.tool}
						onclick={() => editor.setTool(item.tool)}
					>
						{item.short}
					</button>
				{/each}
				<button type="button" onclick={onaddtile}>Blank writing tile</button>
				<button type="button" onclick={() => imageInput.click()}>Image</button>
				{#if editor.activeTileId}
					<button type="button" onclick={() => editor.leaveActiveTile()}>Finish active tile</button>
				{/if}
			</div>
			{#if editor.activeTileId}
				<p class="active-tile-status" role="status">
					New writing, shapes, text, and images will move with the active tile.
				</p>
			{/if}
			<input
				bind:this={imageInput}
				class="sr-only"
				type="file"
				accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
				onchange={imageSelected}
			/>
		</section>

		<section aria-labelledby="brush-heading">
			<h2 id="brush-heading">Brush</h2>
			<div class="brush-controls">
				<label>
					<span>Colour</span>
					<input
						type="color"
						value={editor.brushes[activeBrushTool()].color}
						oninput={(event) =>
							editor.setBrush(activeBrushTool(), {
								color: (event.currentTarget as HTMLInputElement).value
							})}
					/>
				</label>
				<label>
					<span>Size</span>
					<input
						type="range"
						min="1"
						max="64"
						step="0.5"
						value={editor.brushes[activeBrushTool()].size}
						oninput={(event) =>
							updateBrush('size', Number((event.currentTarget as HTMLInputElement).value))}
					/>
				</label>
				<label>
					<span>Opacity</span>
					<input
						type="range"
						min="0.05"
						max="1"
						step="0.01"
						value={editor.brushes[activeBrushTool()].opacity}
						oninput={(event) =>
							updateBrush('opacity', Number((event.currentTarget as HTMLInputElement).value))}
					/>
				</label>
				<label>
					<span>Texture</span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={editor.brushes[activeBrushTool()].texture}
						oninput={(event) =>
							updateBrush('texture', Number((event.currentTarget as HTMLInputElement).value))}
					/>
				</label>
				<label>
					<span>Pressure</span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={editor.brushes[activeBrushTool()].pressure}
						oninput={(event) =>
							updateBrush('pressure', Number((event.currentTarget as HTMLInputElement).value))}
					/>
				</label>
				<label>
					<span>Pressure curve</span>
					<input
						type="range"
						min="0.25"
						max="3"
						step="0.05"
						value={editor.brushes[activeBrushTool()].pressureCurve}
						oninput={(event) =>
							updateBrush('pressureCurve', Number((event.currentTarget as HTMLInputElement).value))}
					/>
				</label>
				<label>
					<span>Smoothing</span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={editor.brushes[activeBrushTool()].smoothing}
						oninput={(event) =>
							updateBrush('smoothing', Number((event.currentTarget as HTMLInputElement).value))}
					/>
				</label>
			</div>
		</section>

		<section aria-labelledby="paper-heading">
			<h2 id="paper-heading">Paper &amp; view</h2>
			<div class="field-row">
				<label>
					<span>Paper</span>
					<select
						value={editor.document.background}
						onchange={(event) =>
							editor.setPaper((event.currentTarget as HTMLSelectElement).value as PaperStyle)}
					>
						<option value="blank">Blank</option>
						<option value="dots">Dotted</option>
						<option value="grid">Grid</option>
						<option value="lined">Lined</option>
					</select>
				</label>
				<label class="check">
					<input
						type="checkbox"
						checked={editor.document.snapToGrid}
						onchange={(event) =>
							editor.setCanvasSettings({
								snapToGrid: (event.currentTarget as HTMLInputElement).checked
							})}
					/>
					Snap
				</label>
				<label class="check">
					<input
						type="checkbox"
						checked={editor.document.showGuides}
						onchange={(event) =>
							editor.setCanvasSettings({
								showGuides: (event.currentTarget as HTMLInputElement).checked
							})}
					/>
					Guides
				</label>
				<label class="check">
					<input
						type="checkbox"
						checked={editor.showMinimap}
						onchange={(event) =>
							(editor.showMinimap = (event.currentTarget as HTMLInputElement).checked)}
					/>
					Minimap
				</label>
				<label>
					<span>Paper colour</span>
					<input
						type="color"
						value={editor.document.backgroundColor}
						oninput={(event) =>
							editor.setCanvasSettings({
								backgroundColor: (event.currentTarget as HTMLInputElement).value
							})}
					/>
				</label>
			</div>
			<div class="button-grid">
				<button type="button" onclick={onfit}>Fit content</button>
				<button type="button" onclick={onfullscreen}>Fullscreen</button>
				<button
					type="button"
					aria-pressed={editor.fingerInkEnabled}
					onclick={() => (editor.fingerInkEnabled = !editor.fingerInkEnabled)}
				>
					{editor.fingerInkEnabled ? 'Finger ink on' : 'Finger ink off'}
				</button>
				<button
					type="button"
					aria-pressed={editor.editTileContents}
					onclick={() => (editor.editTileContents = !editor.editTileContents)}
				>
					{editor.editTileContents ? 'Move tile items' : 'Move whole tiles'}
				</button>
				<button
					type="button"
					aria-pressed={editor.distractionFree}
					onclick={() => (editor.distractionFree = !editor.distractionFree)}
				>
					{editor.distractionFree ? 'Show controls' : 'Focus mode'}
				</button>
			</div>
			{#if editor.fingerInkEnabled}
				<p class="active-tile-status" role="status">
					Finger ink is on. Switch it off or choose Pan before using touch gestures.
				</p>
			{/if}
			{#if editor.editTileContents}
				<p class="active-tile-status" role="status">
					Tile-item mode is on. Select and drag writing or images to rearrange them inside a tile;
					switch it off to move the tile as one unit.
				</p>
			{/if}
		</section>

		{#if editor.selectedIds.length > 0}
			<section aria-labelledby="selection-heading">
				<h2 id="selection-heading">Selection ({editor.selectedIds.length})</h2>
				<div class="button-grid">
					<button type="button" onclick={() => editor.duplicateSelection()}>Duplicate</button>
					<button type="button" onclick={() => void editor.copySelection()}>Copy</button>
					<button type="button" onclick={() => void editor.copySelection(true)}>Cut</button>
					<button type="button" onclick={() => void editor.paste()}>Paste</button>
					<button type="button" onclick={() => editor.makeTileFromSelection('Writing tile')}
						>Make tile</button
					>
					<button type="button" onclick={() => editor.groupSelection()}>Group</button>
					<button type="button" onclick={() => editor.ungroupSelection()}>Ungroup</button>
					<button type="button" onclick={() => editor.toggleLockSelection()}>Lock / unlock</button>
					<button type="button" onclick={() => editor.reorderSelection('front')}>To front</button>
					<button type="button" onclick={() => editor.reorderSelection('back')}>To back</button>
					<button class="danger" type="button" onclick={() => editor.deleteSelection()}
						>Delete</button
					>
				</div>
				{#if editor.selectedObjects.length === 1}
					{@const selected = editor.selectedObjects[0]}
					<div class="transform-grid">
						<label>
							<span>Width</span>
							<input
								type="number"
								min="1"
								max="32768"
								value={Math.round(selected.width)}
								onchange={(event) =>
									editor.updateSelectionTransform({
										width: Number((event.currentTarget as HTMLInputElement).value)
									})}
							/>
						</label>
						<label>
							<span>Height</span>
							<input
								type="number"
								min="1"
								max="32768"
								value={Math.round(selected.height)}
								onchange={(event) =>
									editor.updateSelectionTransform({
										height: Number((event.currentTarget as HTMLInputElement).value)
									})}
							/>
						</label>
						<label>
							<span>Rotate</span>
							<input
								type="number"
								min="-360"
								max="360"
								value={Math.round(selected.rotation)}
								onchange={(event) =>
									editor.updateSelectionTransform({
										rotation: Number((event.currentTarget as HTMLInputElement).value)
									})}
							/>
						</label>
					</div>
				{/if}
				{#if editor.selectedObjects.filter((object) => object.type === 'image').length === 1}
					{@const selectedImage = editor.selectedObjects.find((object) => object.type === 'image')}
					{#if selectedImage?.type === 'image'}
						<label class="image-alt">
							<span>Image text alternative</span>
							<textarea
								rows="3"
								maxlength="2000"
								value={selectedImage.alt}
								placeholder="Describe the image’s meaning and relevant details"
								disabled={selectedImage.locked}
								onchange={(event) =>
									editor.setSelectedImageAlt((event.currentTarget as HTMLTextAreaElement).value)}
							></textarea>
						</label>
					{/if}
				{/if}
			</section>
		{/if}

		<section aria-labelledby="files-heading">
			<h2 id="files-heading">Import &amp; export</h2>
			<div class="button-grid">
				<button type="button" onclick={() => importInput.click()}>Import editable</button>
				<button type="button" onclick={() => onexport('source')}>Editable source</button>
				<button type="button" onclick={() => onexport('svg')}>SVG</button>
				<button type="button" onclick={() => onexport('png')}>PNG</button>
				<button type="button" onclick={() => onexport('pdf')}>PDF</button>
			</div>
			<input
				bind:this={importInput}
				class="sr-only"
				type="file"
				accept=".json,.ink.json,application/json"
				onchange={importSelected}
			/>
		</section>
	</div>
</div>

<style>
	.ink-toolbar-shell {
		position: absolute;
		inset: auto 0 max(0.65rem, env(safe-area-inset-bottom));
		z-index: 30;
		display: flex;
		flex-direction: column-reverse;
		align-items: center;
		gap: 0.5rem;
		pointer-events: none;
	}

	.toolbar-primary,
	.toolbar-more {
		pointer-events: auto;
		border: 1px solid rgb(108 95 76 / 42%);
		background: rgb(255 250 240 / 94%);
		box-shadow: 0 8px 28px rgb(43 36 28 / 18%);
		backdrop-filter: blur(14px);
	}

	.toolbar-primary {
		display: flex;
		max-width: calc(100vw - 1rem);
		align-items: center;
		gap: 0.2rem;
		overflow-x: auto;
		padding: 0.35rem;
		border-radius: 0.7rem;
		scrollbar-width: thin;
	}

	button,
	select,
	input {
		font: inherit;
	}

	button {
		min-width: 2.75rem;
		min-height: 2.75rem;
		border: 1px solid transparent;
		border-radius: 0.42rem;
		padding: 0.42rem 0.65rem;
		background: transparent;
		color: #463d31;
		font-size: 0.75rem;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
	}

	button:hover {
		background: #eee4d2;
	}

	button:focus-visible {
		outline: 3px solid #2f6b60;
		outline-offset: 2px;
	}

	button.active,
	button[aria-pressed='true'] {
		border-color: #2f6b60;
		background: #dce9e3;
		color: #1f4e46;
	}

	button:disabled {
		opacity: 0.38;
		cursor: not-allowed;
	}

	button.danger {
		color: #8d201d;
	}

	.toolbar-toggle {
		min-width: 2.75rem;
		font-size: 1rem;
	}

	.toolbar-separator {
		width: 1px;
		height: 1.9rem;
		flex: 0 0 1px;
		background: #c9bca7;
	}

	.toolbar-more {
		display: grid;
		width: min(58rem, calc(100vw - 1rem));
		max-height: min(62vh, 34rem);
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0;
		overflow: auto;
		border-radius: 0.75rem;
	}

	.toolbar-more[hidden] {
		display: none;
	}

	.toolbar-more section {
		min-width: 0;
		padding: 0.75rem;
		border-right: 1px solid #d8ccb7;
		border-bottom: 1px solid #d8ccb7;
	}

	.toolbar-more h2 {
		margin: 0 0 0.55rem;
		color: #6b5d49;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.button-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
	}

	.button-grid button {
		border-color: #d2c5af;
	}

	.active-tile-status {
		margin: 0.5rem 0 0;
		border-left: 3px solid #2f6b60;
		padding-left: 0.55rem;
		color: #5a4e3e;
		font-size: 0.72rem;
		line-height: 1.45;
	}

	.brush-controls,
	.transform-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.brush-controls label,
	.transform-grid label,
	.field-row label {
		display: grid;
		gap: 0.2rem;
		color: #5a4e3e;
		font-size: 0.7rem;
		font-weight: 700;
	}

	input[type='range'] {
		width: 100%;
		accent-color: #2f6b60;
	}

	input[type='color'] {
		width: 100%;
		min-height: 2rem;
		border: 1px solid #aa9a81;
		border-radius: 0.3rem;
		background: transparent;
	}

	input[type='number'],
	select {
		min-height: 2.5rem;
		width: 100%;
		border: 1px solid #aa9a81;
		border-radius: 0.35rem;
		background: #fffdf7;
		padding: 0.35rem 0.5rem;
		color: #332a22;
	}

	.image-alt {
		display: grid;
		gap: 0.3rem;
		margin-top: 0.65rem;
		color: #5e5242;
		font-size: 0.72rem;
		font-weight: 750;
	}

	.image-alt textarea {
		width: 100%;
		border: 1px solid #9c8d76;
		border-radius: 0.35rem;
		background: #fffdf7;
		padding: 0.5rem;
		color: #2b241c;
		font: inherit;
		resize: vertical;
	}

	.image-alt textarea:disabled {
		opacity: 0.58;
		cursor: not-allowed;
	}

	.field-row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.65rem;
		margin-bottom: 0.55rem;
	}

	.field-row .check {
		display: flex;
		min-height: 2.5rem;
		align-items: center;
		gap: 0.35rem;
	}

	.quiet .toolbar-primary {
		opacity: 0.18;
		transition: opacity 160ms ease;
	}

	.quiet .toolbar-primary:hover,
	.quiet .toolbar-primary:focus-within {
		opacity: 1;
	}

	@media (max-width: 52rem) {
		.toolbar-more {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.toolbar-primary button span {
			max-width: 4.5rem;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}

	@media (max-width: 38rem) {
		.ink-toolbar-shell {
			align-items: stretch;
			padding-inline: max(0.35rem, env(safe-area-inset-left));
		}

		.toolbar-primary {
			max-width: none;
			border-radius: 0.6rem;
		}

		.toolbar-more {
			width: 100%;
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.quiet .toolbar-primary {
			transition: none;
		}
	}
</style>
