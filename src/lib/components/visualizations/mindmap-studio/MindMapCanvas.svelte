<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type MindElixir from 'mind-elixir';
	import type {
		NodeObj,
		MindElixirData,
		Theme,
		Topic,
		MainLineParams,
		SubLineParams
	} from 'mind-elixir';
	import type { StudioProject, StudioNode } from '$lib/visualizations/mindmap-studio/types';
	import { validateProject } from '$lib/visualizations/mindmap-studio/model';
	import {
		branchColours,
		BRANCH_COLOURS,
		NIGHT_BRANCH_COLOURS,
		canvasFilename,
		downloadCanvasBlob,
		type CanvasCommand
	} from '$lib/visualizations/mindmap-studio/render';

	let {
		project,
		selectedId = null,
		onselect,
		onchange,
		readonly = false,
		command,
		onerror
	}: {
		project: StudioProject;
		selectedId?: string | null;
		onselect: (id: string) => void;
		onchange: (project: StudioProject) => void;
		readonly?: boolean;
		command?: CanvasCommand;
		onerror?: (message: string) => void;
	} = $props();
	let host: HTMLDivElement;
	let instance = $state.raw<MindElixir | null>(null);
	let loading = $state(true);
	let failure = $state('');
	let zoomPercent = $state(100);
	let exporting = $state(false);
	let mounted = false;
	let refreshing = false;
	let lastApplied = '';
	let seenCommand = 0;
	let shouldFit = true;
	let observer: ResizeObserver | undefined;
	let decorateFrame = 0;
	let releasePanListeners: (() => void) | undefined;
	const signature = $derived(mapSignature(project));

	function mapSignature(value: StudioProject) {
		return JSON.stringify([
			value.id,
			value.theme,
			value.nodes.map(({ id, label, parentId, collapsed, status, color }) => [
				id,
				label,
				parentId,
				collapsed,
				status,
				color
			])
		]);
	}
	function theme(value: StudioProject): Theme {
		const dark = value.theme === 'night';
		return {
			name: dark ? 'Studio · Night' : 'Studio · Paper',
			type: dark ? 'dark' : 'light',
			palette: dark ? NIGHT_BRANCH_COLOURS : BRANCH_COLOURS,
			cssVar: {
				'--bgcolor': dark ? '#202724' : '#f7f2e7',
				'--color': dark ? '#f2ecdf' : '#2b241c',
				'--main-color': dark ? '#d9e7d9' : '#355f50',
				'--main-bgcolor': dark ? '#29342f' : '#fdfaf3',
				'--main-bgcolor-transparent': dark ? '#29342fe6' : '#fdfaf3e6',
				'--main-border': `1px solid ${dark ? '#758d7b' : '#b0bfae'}`,
				'--root-color': '#fffaf0',
				'--root-bgcolor': dark ? '#466e5b' : '#355f50',
				'--root-border-color': dark ? '#a4c4af' : '#355f50',
				'--root-radius': '18px',
				'--main-radius': '10px',
				'--selected': dark ? '#e5c789' : '#8b6427',
				'--accent-color': dark ? '#c8d9bf' : '#355f50',
				'--node-gap-x': '27px',
				'--node-gap-y': '6px',
				'--main-gap-x': '72px',
				'--main-gap-y': '18px',
				'--topic-padding': '6px 12px',
				'--map-padding': '55px',
				'--panel-color': dark ? '#f2ecdf' : '#2b241c',
				'--panel-bgcolor': dark ? '#29342f' : '#fdfaf3',
				'--panel-border-color': dark ? '#46534b' : '#ded7c9'
			}
		};
	}
	function curvedBranch({
		pT,
		pL,
		pW,
		pH,
		cT,
		cL,
		cW,
		cH,
		direction
	}: MainLineParams | SubLineParams) {
		const left = direction === 'lhs';
		const x1 = left ? pL : pL + pW,
			y1 = pT + pH / 2;
		const x2 = left ? cL + cW : cL,
			y2 = cT + cH / 2;
		const bend = Math.max(24, Math.abs(x2 - x1) * 0.56);
		return `M${x1},${y1} C${x1 + (left ? -bend : bend)},${y1} ${x2 + (left ? bend : -bend)},${y2} ${x2},${y2}`;
	}
	function toMindData(value: StudioProject): MindElixirData {
		const colours = branchColours(value);
		const dark = value.theme === 'night';
		const children = new SvelteMap<string, StudioNode[]>();
		for (const node of value.nodes)
			if (node.parentId)
				children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
		let branchNumber = 0;
		const convert = (node: StudioNode, depth: number): NodeObj => {
			const colour = colours.get(node.id) ?? BRANCH_COLOURS[0];
			const result: NodeObj = {
				id: node.id,
				topic: node.label,
				expanded: !node.collapsed,
				branchColor: colour,
				style: {
					fontSize: depth === 0 ? '25px' : depth === 1 ? '17px' : '15px',
					fontWeight: depth <= 1 ? '600' : '450',
					...(depth > 0
						? {
								color: dark ? '#f2ecdf' : '#2b241c',
								background: dark ? '#29342f' : '#fdfaf3',
								border: `1px ${node.status === 'explicit' ? 'solid' : 'dashed'} ${colour}${depth === 1 ? '' : '80'}`
							}
						: {})
				},
				children: (children.get(node.id) ?? []).map((child) => convert(child, depth + 1))
			};
			if (depth === 1) {
				result.direction = branchNumber % 2 === 0 ? 1 : 0;
				branchNumber++;
			}
			return result;
		};
		const root = value.nodes.find((node) => node.id === value.rootId)!;
		return { nodeData: convert(root, 0), direction: 2, theme: theme(value) };
	}
	function decorate() {
		if (!instance || !host) return;
		cancelAnimationFrame(decorateFrame);
		decorateFrame = requestAnimationFrame(() => {
			if (!instance) return;
			const lookup = new Map(project.nodes.map((node) => [node.id, node]));
			for (const element of host.querySelectorAll<Topic>('me-tpc, .me-tpc')) {
				const node = lookup.get(element.nodeObj?.id);
				if (!node) continue;
				element.tabIndex = 0;
				element.setAttribute('role', 'button');
				element.setAttribute(
					'aria-label',
					`${node.label}. ${node.status}. Select to inspect${readonly ? '.' : '; F2 to rename.'}`
				);
				element.setAttribute('aria-pressed', String(node.id === selectedId));
				element.dataset.studioStatus = node.status;
				element.dataset.studioNode = node.id;
				const expander = element.parentElement.querySelector<HTMLElement>('me-epd, .me-epd');
				if (expander) {
					expander.setAttribute('role', 'button');
					expander.setAttribute(
						'aria-label',
						`${element.nodeObj.expanded === false ? 'Expand' : 'Collapse'} ${node.label}`
					);
					expander.tabIndex = 0;
				}
			}
		});
	}
	function readChanges() {
		if (!instance || refreshing || readonly) return;
		const prior = new Map(project.nodes.map((node) => [node.id, node]));
		const nodes: StudioNode[] = [];
		const walk = (node: NodeObj, parentId: string | null) => {
			const existing = prior.get(node.id);
			const label = node.topic.trim().slice(0, 240) || 'Untitled idea';
			const changedMeaning = existing && existing.label !== label;
			nodes.push(
				existing
					? {
							...existing,
							label,
							parentId,
							collapsed: node.expanded === false,
							...(changedMeaning ? { reviewed: false, status: 'inferred' as const } : {})
						}
					: {
							id: node.id,
							parentId,
							label,
							description:
								'An idea added in the editor. Add supporting evidence or notes before treating it as a source claim.',
							category: 'concept',
							status: 'inferred',
							evidence: [],
							notes: '',
							reviewed: false,
							collapsed: node.expanded === false
						}
			);
			for (const child of node.children ?? []) walk(child, node.id);
		};
		walk(instance.getData().nodeData, null);
		const ids = new Set(nodes.map((node) => node.id));
		const next: StudioProject = {
			...project,
			title: nodes[0]?.label !== prior.get(project.rootId)?.label ? nodes[0].label : project.title,
			nodes,
			edges: project.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
			updatedAt: new Date().toISOString()
		};
		try {
			validateProject(next);
			lastApplied = mapSignature(next);
			onchange(next);
		} catch (error) {
			refreshing = true;
			try {
				instance.refresh(toMindData(project));
			} finally {
				refreshing = false;
			}
			onerror?.(error instanceof Error ? error.message : 'This edit exceeds the project limits.');
		}
		decorate();
	}
	function fit(initial = false) {
		if (!instance) return;
		instance.scaleFit();
		// A complete overview on a phone can reduce labels below four pixels.
		// Start close enough to read, retaining the full overview on explicit Fit.
		if (initial && host.clientWidth < 600) instance.scale(Math.max(0.55, instance.scaleVal));
		instance.toCenter();
		zoomPercent = Math.round(instance.scaleVal * 100);
		shouldFit = initial;
	}
	function zoom(factor: number) {
		if (!instance) return;
		shouldFit = false;
		instance.scale(Math.max(0.15, Math.min(2.5, instance.scaleVal * factor)));
		zoomPercent = Math.round(instance.scaleVal * 100);
	}
	function enableBackgroundPan(map: MindElixir) {
		let pointer: { id: number; x: number; y: number } | null = null;
		const down = (event: PointerEvent) => {
			if (event.pointerType !== 'mouse' || event.button !== 0 || event.target !== map.container)
				return;
			pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
			shouldFit = false;
			map.container.setPointerCapture(event.pointerId);
			event.stopPropagation();
		};
		const move = (event: PointerEvent) => {
			if (!pointer || event.pointerId !== pointer.id) return;
			map.move(event.clientX - pointer.x, event.clientY - pointer.y);
			pointer.x = event.clientX;
			pointer.y = event.clientY;
			event.stopPropagation();
		};
		const up = (event: PointerEvent) => {
			if (!pointer || event.pointerId !== pointer.id) return;
			if (map.container.hasPointerCapture(event.pointerId))
				map.container.releasePointerCapture(event.pointerId);
			pointer = null;
			event.stopPropagation();
		};
		host.addEventListener('pointerdown', down, true);
		host.addEventListener('pointermove', move, true);
		host.addEventListener('pointerup', up, true);
		host.addEventListener('pointercancel', up, true);
		return () => {
			host.removeEventListener('pointerdown', down, true);
			host.removeEventListener('pointermove', move, true);
			host.removeEventListener('pointerup', up, true);
			host.removeEventListener('pointercancel', up, true);
		};
	}
	function select(id: string, centre = false) {
		if (!instance) return;
		refreshing = true;
		try {
			const ancestors: string[] = [];
			let current = project.nodes.find((node) => node.id === id);
			while (current?.parentId) {
				ancestors.unshift(current.parentId);
				current = project.nodes.find((node) => node.id === current!.parentId);
			}
			for (const ancestor of ancestors) {
				const element = instance.findEle(ancestor);
				if (element?.nodeObj.expanded === false) instance.expandNode(element, true);
			}
			const element = instance.findEle(id);
			if (element) {
				instance.selectNode(element);
				if (centre) instance.scrollIntoView(element);
			}
		} finally {
			refreshing = false;
		}
		decorate();
	}
	async function exportImage() {
		if (!instance || exporting) return;
		exporting = true;
		try {
			const { exportImageBlob } = await import('@mind-elixir/export-mindmap');
			const width = instance.nodes.scrollWidth,
				height = instance.nodes.scrollHeight;
			const scale = Math.min(
				2,
				8192 / Math.max(width, height),
				Math.sqrt(24_000_000 / Math.max(1, width * height))
			);
			const blob = await exportImageBlob(instance, 'png', { watermarkEnabled: false, scale });
			downloadCanvasBlob(blob, canvasFilename(project.title, 'mind-map.png'));
		} catch (error) {
			onerror?.(error instanceof Error ? error.message : 'Mind-map image export failed.');
		} finally {
			exporting = false;
		}
	}
	function keyboard(event: KeyboardEvent) {
		if (
			!instance ||
			(event.target as Element).closest('#input-box, input, textarea, [contenteditable="true"]')
		)
			return;
		const target = (event.target as Element).closest<Topic>('me-tpc, .me-tpc');
		const expander = (event.target as Element).closest('me-epd, .me-epd');
		if (expander && (event.key === 'Enter' || event.key === ' ')) {
			event.preventDefault();
			instance.expandNode(expander.previousElementSibling as Topic);
			return;
		}
		if (target && target.nodeObj.id !== selectedId) {
			instance.selectNode(target);
			onselect(target.nodeObj.id);
		}
		if (
			(event.key === 'Enter' || event.key === ' ') &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.shiftKey &&
			target
		) {
			event.preventDefault();
			onselect(target.nodeObj.id);
			return;
		}
		if (event.key === 'F2' && !readonly && target) {
			event.preventDefault();
			void instance.beginEdit(target);
			return;
		}
		if (
			event.key === 'Enter' &&
			!readonly &&
			target &&
			(event.ctrlKey || event.metaKey || event.shiftKey)
		) {
			event.preventDefault();
			if (event.shiftKey) void instance.insertSibling('after', target);
			else void instance.addChild(target);
			return;
		}
		if (event.key === 'Delete' && !readonly && target && target.nodeObj.id !== project.rootId) {
			event.preventDefault();
			void instance.removeNodes([target]);
			return;
		}
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			zoom(1.2);
		} else if (event.key === '-') {
			event.preventDefault();
			zoom(1 / 1.2);
		} else if (event.key === '0') {
			event.preventDefault();
			fit();
		} else if (event.key.startsWith('Arrow')) {
			event.preventDefault();
			shouldFit = false;
			instance.move(
				event.key === 'ArrowLeft' ? 70 : event.key === 'ArrowRight' ? -70 : 0,
				event.key === 'ArrowUp' ? 70 : event.key === 'ArrowDown' ? -70 : 0
			);
		}
	}

	onMount(() => {
		mounted = true;
		void (async () => {
			try {
				const [{ default: Constructor }] = await Promise.all([
					import('mind-elixir'),
					import('mind-elixir/style.css')
				]);
				if (!mounted) return;
				const map = new Constructor({
					el: host,
					direction: Constructor.SIDE,
					editable: !readonly,
					contextMenu: false,
					toolBar: false,
					keypress: false,
					allowUndo: false,
					// In 5.15 this option also disables pointer interaction; CSS clips the viewport.
					overflowHidden: false,
					alignment: 'nodes',
					compact: false,
					mouseSelectionButton: 2,
					scaleMin: 0.15,
					scaleMax: 2.5,
					theme: theme(project),
					generateMainBranch: curvedBranch,
					generateSubBranch: curvedBranch,
					newTopicName: 'New idea'
				});
				const error = map.init(toMindData(project));
				if (error) throw error;
				host.style.position = 'absolute';
				instance = map;
				releasePanListeners = enableBackgroundPan(map);
				lastApplied = mapSignature(project);
				map.bus.addListener('operation', (operation) => {
					if (operation.name !== 'beginEdit') readChanges();
				});
				map.bus.addListener('expandNode', () => {
					readChanges();
					decorate();
				});
				map.bus.addListener('selectNodes', (nodes) => {
					if (!refreshing && nodes[0]) {
						shouldFit = false;
						onselect(nodes[0].id);
					}
					decorate();
				});
				map.bus.addListener('selectNewNode', (node) => {
					if (!refreshing) {
						shouldFit = false;
						onselect(node.id);
					}
					decorate();
				});
				map.bus.addListener('scale', (scale) => {
					zoomPercent = Math.round(scale * 100);
				});
				map.container.setAttribute(
					'aria-label',
					'Mind map. Tab to concepts and press Enter to inspect. F2 renames; Control Enter adds a child; Shift Enter adds a sibling. Arrow keys pan; plus and minus zoom; zero fits the map.'
				);
				map.container.setAttribute('role', 'group');
				map.container.tabIndex = 0;
				observer = new ResizeObserver(() => {
					if (shouldFit && mounted) fit(true);
				});
				observer.observe(host);
				loading = false;
				decorate();
				fit(true);
				void document.fonts.ready.then(() => {
					if (mounted && instance && shouldFit) {
						instance.refresh();
						decorate();
						fit(true);
					}
				});
			} catch (error) {
				failure = error instanceof Error ? error.message : 'The mind map could not be loaded.';
				loading = false;
				onerror?.(failure);
			}
		})();
		return () => {
			mounted = false;
			observer?.disconnect();
			releasePanListeners?.();
			cancelAnimationFrame(decorateFrame);
			instance?.destroy();
			instance = null;
		};
	});
	$effect(() => {
		const key = signature;
		if (!instance || key === lastApplied) return;
		untrack(() => {
			if (!instance) return;
			const newProject = project.id !== JSON.parse(lastApplied || '[""]')[0];
			refreshing = true;
			try {
				instance.changeTheme(theme(project), false);
				instance.refresh(toMindData(project));
				lastApplied = key;
				decorate();
				if (selectedId) select(selectedId);
				if (newProject) fit(true);
			} finally {
				refreshing = false;
			}
		});
	});
	$effect(() => {
		const id = selectedId;
		if (instance && id) untrack(() => select(id, true));
	});
	$effect(() => {
		if (instance) {
			if (readonly) instance.disableEdit();
			else instance.enableEdit();
		}
	});
	$effect(() => {
		if (!instance || !command || command.serial === seenCommand) return;
		seenCommand = command.serial;
		const action = command.type;
		untrack(() => {
			if (action === 'fit') fit();
			else if (action === 'zoom-in') zoom(1.2);
			else if (action === 'zoom-out') zoom(1 / 1.2);
			else if (action === 'export-png') void exportImage();
			else
				onerror?.(
					'Use PNG to export this mind map, or switch to Knowledge graph for a portable SVG.'
				);
		});
	});
</script>

<div class="studio-mindmap" class:night={project.theme === 'night'} data-testid="studio-mind-map">
	<!-- svelte-ignore a11y_no_static_element_interactions (Keyboard events are delegated from the engine's labelled, focusable concept buttons.) -->
	<div class="mindmap-host" bind:this={host} onkeydown={keyboard}></div>
	{#if loading}<div class="map-loading" role="status">
			<span class="loading-mark">✳</span>
			<p>Arranging your ideas…</p>
		</div>{/if}
	{#if failure}<div class="map-loading" role="alert">
			<p>The canvas could not open.</p>
			<small>{failure}</small>
			<p>Your ideas are still available in Outline.</p>
		</div>{/if}
	<div class="map-help">
		{exporting
			? 'Preparing image…'
			: readonly
				? 'Select an idea to read more'
				: 'Select to inspect · double-click to edit · drag to rearrange'}
	</div>
	<div class="map-navigation" aria-label="Mind-map navigation">
		<button
			type="button"
			aria-label="Zoom mind map out"
			disabled={!instance}
			onclick={() => zoom(1 / 1.2)}>−</button
		><output aria-label="Mind-map zoom level">{zoomPercent}%</output><button
			type="button"
			aria-label="Zoom mind map in"
			disabled={!instance}
			onclick={() => zoom(1.2)}>+</button
		><button type="button" disabled={!instance} onclick={() => fit()}>Fit map</button>
	</div>
</div>

<style>
	.studio-mindmap {
		--m-paper: #f7f2e7;
		--m-surface: #fdfaf3;
		--m-ink: #2b241c;
		--m-muted: #655e52;
		--m-rule: #ded7c9;
		width: 100%;
		height: 100%;
		min-height: 600px;
		position: relative;
		background: var(--m-paper);
		color: var(--m-ink);
		overflow: hidden;
	}
	.studio-mindmap.night {
		--m-paper: #202724;
		--m-surface: #29342f;
		--m-ink: #f2ecdf;
		--m-muted: #c1c6bc;
		--m-rule: #46534b;
	}
	.mindmap-host {
		position: absolute;
		inset: 0;
		min-height: 600px;
	}
	.mindmap-host :global(.map-container) {
		font-family: var(--font-sans, Arial, sans-serif);
		background-image: radial-gradient(#b6ad973b 0.7px, transparent 0.7px);
		background-size: 24px 24px;
	}
	.night .mindmap-host :global(.map-container) {
		background-image: radial-gradient(#75877930 0.7px, transparent 0.7px);
	}
	.mindmap-host :global(me-tpc),
	.mindmap-host :global(.me-tpc) {
		max-width: 220px !important;
		min-width: 65px;
		line-height: 1.3;
		overflow-wrap: anywhere;
		border-radius: 9px !important;
		box-shadow: 0 2px 5px #443b2510;
	}
	.mindmap-host :global(me-root me-tpc),
	.mindmap-host :global(.me-root .me-tpc) {
		max-width: 290px !important;
		min-width: 200px;
		padding: 22px 28px !important;
		line-height: 1.25;
		text-align: center;
		border-radius: 18px !important;
		font-family: var(--font-serif, Georgia, serif);
		box-shadow: 0 9px 25px #294c3220;
	}
	.mindmap-host :global(me-tpc[data-studio-status='speculative']),
	.mindmap-host :global(.me-tpc[data-studio-status='speculative']) {
		border-style: dotted !important;
	}
	.mindmap-host :global(me-tpc:focus-visible),
	.mindmap-host :global(.me-tpc:focus-visible),
	.mindmap-host :global(me-epd:focus-visible),
	.mindmap-host :global(.me-epd:focus-visible) {
		outline: 3px solid #ad7c37;
		outline-offset: 4px;
	}
	.mindmap-host :global(me-tpc.selected),
	.mindmap-host :global(.me-tpc.selected) {
		outline-offset: 4px !important;
	}
	.mindmap-host :global(.lines path) {
		stroke-width: 2.8px;
	}
	.mindmap-host :global(.subLines path) {
		stroke-width: 1.5px;
		opacity: 0.75;
	}
	.mindmap-host :global(.me-epd.minus),
	.mindmap-host :global(me-epd.minus) {
		opacity: 0.55;
	}
	.map-help {
		position: absolute;
		bottom: 17px;
		left: 16px;
		max-width: calc(100% - 245px);
		font: 11px/1.5 var(--font-mono, monospace);
		color: var(--m-muted);
		padding: 6px 8px;
		background: var(--m-paper);
		border-radius: 5px;
		pointer-events: none;
	}
	.map-navigation {
		position: absolute;
		bottom: 16px;
		right: 16px;
		display: flex;
		gap: 5px;
		align-items: center;
		font: 12px var(--font-sans, sans-serif);
		background: var(--m-surface);
		border: 1px solid var(--m-rule);
		border-radius: 9px;
		padding: 4px;
		box-shadow: 0 3px 12px #2c32250a;
	}
	button {
		border: 0;
		border-radius: 5px;
		padding: 7px 9px;
		background: transparent;
		color: inherit;
		cursor: pointer;
		font: inherit;
		min-width: 30px;
	}
	button:hover {
		background: var(--m-paper);
	}
	button:focus-visible {
		outline: 2px solid #748568;
		outline-offset: 2px;
	}
	button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.map-navigation button:first-child,
	.map-navigation button:nth-child(3) {
		font-size: 18px;
		line-height: 1;
	}
	output {
		min-width: 37px;
		text-align: center;
		font-size: 11px;
		color: var(--m-muted);
	}
	.map-loading {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		background: var(--m-paper);
		padding: 32px;
		text-align: center;
		font: 15px/1.5 var(--font-sans, sans-serif);
	}
	.map-loading p {
		margin: 0;
	}
	.map-loading small {
		max-width: 420px;
		color: var(--m-muted);
	}
	.loading-mark {
		font-size: 45px;
		color: #63806b;
	}
	@media (max-width: 600px) {
		.studio-mindmap,
		.mindmap-host {
			min-height: 560px;
		}
		.map-help {
			bottom: 72px;
			left: 10px;
			right: 10px;
			max-width: none;
			font-size: 10px;
		}
		.map-navigation {
			right: 10px;
			bottom: 12px;
		}
		button {
			min-height: 38px;
			min-width: 38px;
		}
	}
	@media (prefers-contrast: more) {
		.mindmap-host :global(.subLines path) {
			opacity: 1;
			stroke-width: 2px;
		}
	}
	:global([data-theme='high-contrast']) .studio-mindmap {
		--m-paper: #fff;
		--m-surface: #fff;
		--m-ink: #000;
		--m-muted: #222;
		--m-rule: #000;
	}
	:global([data-theme='high-contrast']) .mindmap-host :global(.map-container) {
		background: #fff !important;
	}
	:global([data-theme='high-contrast']) .mindmap-host :global(me-tpc),
	:global([data-theme='high-contrast']) .mindmap-host :global(.me-tpc) {
		background: #fff !important;
		color: #000 !important;
		border-color: #000 !important;
		border-width: 2px !important;
	}
	:global([data-theme='high-contrast']) .mindmap-host :global(.lines path),
	:global([data-theme='high-contrast']) .mindmap-host :global(.subLines path) {
		stroke: #000 !important;
		opacity: 1;
	}
</style>
