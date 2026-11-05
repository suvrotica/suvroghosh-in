<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		CIRCUIT_LIMITS,
		type CircuitComponent,
		type CircuitDiagnostic,
		type CircuitDocument,
		type ComponentKind,
		type ScopeSample,
		type SimulationSnapshot,
		type TraceMarker,
		type WireEndpoint
	} from '$lib/visualizations/circuit-bench/types';
	import {
		COMPONENT_CATALOG,
		addComponent,
		cloneCircuitDocument,
		connectEndpoints,
		decodeShareUrlParam,
		deleteSelection,
		duplicateComponents,
		encodeShareUrl,
		endpointKey,
		endpointsEqual,
		exportCircuitJson,
		exportSchematicSvg,
		exportWaveformCsv,
		formatComponentSummary,
		getComponentTerminals,
		getEndpointGridPosition,
		getTerminalGridPosition,
		getWirePolylineGridPoints,
		importCircuitJson,
		moveComponents,
		rotateComponents,
		splitWireWithJunction,
		voltageToWireColor
	} from '$lib/visualizations/circuit-bench/model';
	import { CIRCUIT_EXAMPLES, getExampleCircuit } from '$lib/visualizations/circuit-bench/examples';
	import {
		PARAMETER_BOUNDS,
		formatEngineeringValue,
		formatMeasurement
	} from '$lib/visualizations/circuit-bench/notation';
	import {
		evaluateCircuitAtInstant,
		snapshotToScopeSample,
		syncSimulationTimingToCircuit
	} from '$lib/visualizations/circuit-bench/solver';
	import { CircuitWorkerClient } from '$lib/visualizations/circuit-bench/worker-client';
	import {
		loadCircuitFromStorage,
		saveCircuitToStorage
	} from '$lib/visualizations/circuit-bench/storage';
	import RotaryControl from './RotaryControl.svelte';
	import AnalogueMeter from './AnalogueMeter.svelte';
	import Oscilloscope from './Oscilloscope.svelte';

	const GRID_PX = 28;

	// Initial circuit: "How long does a capacitor take to charge?" paused at t = 0 s with C1 uncharged (0 V)
	const initialDoc = getExampleCircuit('rc-charging');
	const initialEval = evaluateCircuitAtInstant(initialDoc, 0);
	const initialSnap = initialEval.ok ? initialEval.snapshot : null;

	let doc = $state<CircuitDocument>(initialDoc);
	let snapshot = $state<SimulationSnapshot | null>(initialSnap);
	let diagnostics = $state<CircuitDiagnostic[]>(initialEval.ok ? [] : initialEval.diagnostics);
	let samples = $state<ScopeSample[]>(
		initialSnap ? [snapshotToScopeSample(initialDoc, initialSnap)] : []
	);
	let markers = $state<TraceMarker[]>([]);

	let running = $state(false);
	let selectedIds = $state<string[]>(['r1']);
	let multiSelectMode = $state(false);
	let panMode = $state(false);
	let pendingWireStart = $state<WireEndpoint | null>(null);
	let pointerGridPos = $state<{ x: number; y: number } | null>(null);

	let showLeftPanel = $state(true);
	let showRightPanel = $state(true);
	let mobileDrawer = $state<'none' | 'library' | 'inspector'>('none');
	let showOverflowMenu = $state(false);
	let showKeyboardList = $state(false);

	let showVoltageColor = $state(true);
	let showCurrentDots = $state(true);
	let reducedMotion = $state(false);
	let animPhase = $state(0);

	// Viewport camera in schematic SVG coordinates
	let viewBoxX = $state(0);
	let viewBoxY = $state(0);
	let viewBoxW = $state(620);
	let viewBoxH = $state(360);
	let zoomLevel = $state(1);

	// Undo / Redo stacks
	let undoStack = $state<CircuitDocument[]>([]);
	let redoStack = $state<CircuitDocument[]>([]);

	// Banners & status messages
	let saveStatusText = $state('Ready · local storage available');
	let actionAnnouncement = $state('');
	let wireConfirmBanner = $state('');
	let importErrorBanner = $state('');
	let valueEditNote = $state('');

	// Keyboard connection form state
	let kbFromEndpoint = $state('');
	let kbToEndpoint = $state('');

	let fileInputEl: HTMLInputElement | undefined = $state();
	let svgEl: SVGSVGElement | undefined = $state();

	let workerClient: CircuitWorkerClient | null = null;
	let rafId: number | null = null;
	let lastFrameTime = 0;
	let simAccumulatorSec = 0;
	let batchInFlight = false;
	let draggingCompId: string | null = null;
	let dragLastGrid: { x: number; y: number } | null = null;
	let draggingPan = false;
	let panStartClient: { x: number; y: number; vx: number; vy: number } | null = null;

	const statusLabel = $derived<'Running' | 'Paused' | 'Needs attention'>(
		diagnostics.length > 0 ? 'Needs attention' : running ? 'Running' : 'Paused'
	);

	const primarySelectedComponent = $derived(
		doc.components.find((c) => selectedIds.includes(c.id)) ?? null
	);

	const selectedMeasurement = $derived(
		primarySelectedComponent && snapshot
			? (snapshot.components[primarySelectedComponent.id] ?? null)
			: null
	);

	// Compute RC time constant if circuit is a simple first-order RC network (no inductors)
	const rcTimeConstantSec = $derived.by(() => {
		const resistors = doc.components.filter((c) => c.kind === 'resistor');
		const capacitors = doc.components.filter((c) => c.kind === 'capacitor');
		const inductors = doc.components.filter((c) => c.kind === 'inductor');
		if (resistors.length === 1 && capacitors.length === 1 && inductors.length === 0) {
			const r = resistors[0].params.resistance ?? 1000;
			const c = capacitors[0].params.capacitance ?? 0.001;
			return r * c;
		}
		return null;
	});

	// Compute dynamic RC checkpoints from the actual solved topology at t = 0+ (respecting switch positions, R1, C1, V1, and V(0))
	const rcCheckpoints = $derived.by(() => {
		const resistors = doc.components.filter((c) => c.kind === 'resistor');
		const capacitors = doc.components.filter((c) => c.kind === 'capacitor');
		const inductors = doc.components.filter((c) => c.kind === 'inductor');
		const dcSources = doc.components.filter((c) => c.kind === 'dc_voltage');
		if (
			resistors.length === 1 &&
			capacitors.length === 1 &&
			inductors.length === 0 &&
			dcSources.length === 1
		) {
			const r = Math.max(1e-6, resistors[0].params.resistance ?? 1000);
			const c = Math.max(1e-12, capacitors[0].params.capacitance ?? 0.001);
			const tau = r * c;
			const eval0 = evaluateCircuitAtInstant(doc, 0);
			if (!eval0.ok) return null;
			const capMeas = eval0.snapshot.components[capacitors[0].id];
			const v0 = capMeas ? capMeas.voltageDrop : (capacitors[0].params.initialVoltage ?? 0);
			const rawI0 = capMeas ? capMeas.current : 0;
			const i0 = Math.abs(rawI0) < 1e-11 ? 0 : rawI0;
			const vTarget = v0 + i0 * r;
			const vAt1s = vTarget + (v0 - vTarget) * Math.exp(-1 / tau);
			const iAt1s = i0 * Math.exp(-1 / tau);
			const vAt5s = vTarget + (v0 - vTarget) * Math.exp(-5 / tau);
			return { tau, v0, i0, vAt1s, iAt1s, vAt5s };
		}
		return null;
	});

	const affectedIdSet = $derived(new Set(diagnostics.flatMap((d) => d.affectedComponentIds)));

	// Count connections at each junction or terminal so explicit junctions with >=2 wires show clearly
	const allAvailableEndpoints = $derived.by(() => {
		const list: Array<{ key: string; label: string; endpoint: WireEndpoint }> = [];
		for (const comp of doc.components) {
			for (const term of getComponentTerminals(comp)) {
				const endpoint: WireEndpoint = {
					type: 'terminal',
					componentId: comp.id,
					terminalId: term.id
				};
				list.push({
					key: endpointKey(endpoint),
					label: `${comp.label} · ${term.label}`,
					endpoint
				});
			}
		}
		for (const junc of doc.junctions) {
			const endpoint: WireEndpoint = { type: 'junction', junctionId: junc.id };
			list.push({
				key: endpointKey(endpoint),
				label: `Junction (${junc.x}, ${junc.y})`,
				endpoint
			});
		}
		return list;
	});

	function announce(msg: string): void {
		actionAnnouncement = msg;
	}

	function fitToCircuit(): void {
		if (doc.components.length === 0) {
			viewBoxX = 0;
			viewBoxY = 0;
			viewBoxW = 620;
			viewBoxH = 360;
			zoomLevel = 1;
			return;
		}
		let minX = Infinity;
		let maxX = -Infinity;
		let minY = Infinity;
		let maxY = -Infinity;
		for (const c of doc.components) {
			minX = Math.min(minX, (c.x - 3) * GRID_PX);
			maxX = Math.max(maxX, (c.x + 3) * GRID_PX);
			minY = Math.min(minY, (c.y - 3) * GRID_PX);
			maxY = Math.max(maxY, (c.y + 3) * GRID_PX);
		}
		for (const j of doc.junctions) {
			minX = Math.min(minX, (j.x - 1) * GRID_PX);
			maxX = Math.max(maxX, (j.x + 1) * GRID_PX);
			minY = Math.min(minY, (j.y - 1) * GRID_PX);
			maxY = Math.max(maxY, (j.y + 1) * GRID_PX);
		}
		const pad = 56;
		const contentW = Math.max(360, maxX - minX + pad * 2);
		const contentH = Math.max(240, maxY - minY + pad * 2);
		const targetAspect = 620 / 360;
		let finalW = contentW;
		let finalH = contentH;
		if (finalW / finalH > targetAspect) {
			finalH = finalW / targetAspect;
		} else {
			finalW = finalH * targetAspect;
		}
		const cx = (minX + maxX) / 2;
		const cy = (minY + maxY) / 2;
		viewBoxX = cx - finalW / 2;
		viewBoxY = cy - finalH / 2;
		viewBoxW = finalW;
		viewBoxH = finalH;
		zoomLevel = Number((620 / finalW).toFixed(2));
	}

	function adjustZoom(factor: number): void {
		const nextW = Math.min(1400, Math.max(260, viewBoxW / factor));
		const nextH = nextW * (360 / 620);
		const cx = viewBoxX + viewBoxW / 2;
		const cy = viewBoxY + viewBoxH / 2;
		viewBoxX = cx - nextW / 2;
		viewBoxY = cy - nextH / 2;
		viewBoxW = nextW;
		viewBoxH = nextH;
		zoomLevel = Number((620 / nextW).toFixed(2));
	}

	function evaluateAndResetSimulation(targetDoc: CircuitDocument): void {
		running = false;
		workerClient?.cancelActive();
		batchInFlight = false;
		simAccumulatorSec = 0;
		markers = [];
		valueEditNote = '';

		const res = evaluateCircuitAtInstant(targetDoc, 0);
		if (res.ok) {
			diagnostics = [];
			snapshot = res.snapshot;
			samples = [snapshotToScopeSample(targetDoc, res.snapshot)];
		} else {
			diagnostics = res.diagnostics;
			snapshot = null;
			samples = [];
		}
	}

	function pushHistory(previousDoc: CircuitDocument): void {
		undoStack = [...undoStack.slice(-29), cloneCircuitDocument(previousDoc)];
		redoStack = [];
		saveStatusText = 'Unsaved changes';
	}

	/**
	 * Apply a topology change (add, delete, connect, disconnect).
	 * Automatically pauses before topology changes as required.
	 */
	function applyTopologyEdit(nextDoc: CircuitDocument, description: string): void {
		const wasRunning = running;
		if (wasRunning) {
			running = false;
			workerClient?.cancelActive();
		}
		pushHistory(doc);
		doc = nextDoc;
		const currentTime = snapshot?.timeSec ?? 0;
		const preservedState = currentTime > 0 ? snapshot?.reactiveState : undefined;
		const res = evaluateCircuitAtInstant(nextDoc, currentTime, preservedState);
		if (res.ok) {
			diagnostics = [];
			snapshot = res.snapshot;
			if (currentTime === 0 || samples.length === 0) {
				samples = [snapshotToScopeSample(nextDoc, res.snapshot)];
			}
		} else {
			diagnostics = res.diagnostics;
			snapshot = null;
		}
		announce(wasRunning ? `${description}. Simulation paused for circuit edit.` : description);
	}

	/**
	 * Apply a component value or switch change while preserving the current capacitor and inductor state
	 * and visibly marking the change on the oscilloscope trace.
	 */
	function applyValueEdit(componentId: string, mutator: (comp: CircuitComponent) => string): void {
		const nextDoc = cloneCircuitDocument(doc);
		const comp = nextDoc.components.find((c) => c.id === componentId);
		if (!comp) return;
		pushHistory(doc);
		const changeDesc = mutator(comp);
		if (comp.kind === 'probe_voltage' && comp.params.probeMode !== 'differential') {
			nextDoc.wires = nextDoc.wires.filter(
				(w) =>
					!(
						w.from.type === 'terminal' &&
						w.from.componentId === comp.id &&
						w.from.terminalId === 'neg'
					) &&
					!(
						w.to.type === 'terminal' &&
						w.to.componentId === comp.id &&
						w.to.terminalId === 'neg'
					)
			);
		}
		syncSimulationTimingToCircuit(nextDoc);
		doc = nextDoc;

		const currentTime = snapshot?.timeSec ?? 0;
		const preservedReactive = currentTime > 0 ? snapshot?.reactiveState : undefined;
		const res = evaluateCircuitAtInstant(nextDoc, currentTime, preservedReactive);

		if (res.ok) {
			diagnostics = [];
			snapshot = res.snapshot;
			const newSample = snapshotToScopeSample(nextDoc, res.snapshot);
			if (currentTime > 0 && samples.length > 0) {
				markers = [
					...markers.slice(-15),
					{
						id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
						timeSec: currentTime,
						label: changeDesc,
						detail: `${changeDesc} at t = ${currentTime.toFixed(2)} s`,
						componentId
					}
				];
				samples = [...samples.slice(-(CIRCUIT_LIMITS.MAX_STORED_SAMPLES - 1)), newSample];
				valueEditNote = `${changeDesc} applied at t = ${currentTime.toFixed(2)} s (capacitor/inductor state preserved). Press Restart to run from t = 0 s.`;
			} else {
				samples = [newSample];
				valueEditNote = `${changeDesc} applied at t = 0.00 s. Press Run to simulate.`;
			}
		} else {
			diagnostics = res.diagnostics;
			snapshot = null;
			running = false;
		}
		announce(`Updated ${changeDesc}`);
	}

	function handleUndo(): void {
		if (undoStack.length === 0) return;
		running = false;
		workerClient?.cancelActive();
		const prev = undoStack[undoStack.length - 1];
		undoStack = undoStack.slice(0, -1);
		redoStack = [...redoStack, cloneCircuitDocument(doc)];
		doc = prev;
		const currentTime = snapshot?.timeSec ?? 0;
		const preservedReactive = currentTime > 0 ? snapshot?.reactiveState : undefined;
		const res = evaluateCircuitAtInstant(doc, currentTime, preservedReactive);
		if (res.ok) {
			diagnostics = [];
			snapshot = res.snapshot;
			const newSample = snapshotToScopeSample(doc, res.snapshot);
			samples =
				currentTime > 0 && samples.length > 0
					? [...samples.slice(0, -1), newSample]
					: [newSample];
		} else {
			diagnostics = res.diagnostics;
			snapshot = null;
		}
		announce('Undid last circuit edit.');
	}

	function handleRedo(): void {
		if (redoStack.length === 0) return;
		running = false;
		workerClient?.cancelActive();
		const next = redoStack[redoStack.length - 1];
		redoStack = redoStack.slice(0, -1);
		undoStack = [...undoStack, cloneCircuitDocument(doc)];
		doc = next;
		const currentTime = snapshot?.timeSec ?? 0;
		const preservedReactive = currentTime > 0 ? snapshot?.reactiveState : undefined;
		const res = evaluateCircuitAtInstant(doc, currentTime, preservedReactive);
		if (res.ok) {
			diagnostics = [];
			snapshot = res.snapshot;
			const newSample = snapshotToScopeSample(doc, res.snapshot);
			samples =
				currentTime > 0 && samples.length > 0
					? [...samples.slice(0, -1), newSample]
					: [newSample];
		} else {
			diagnostics = res.diagnostics;
			snapshot = null;
		}
		announce('Redid circuit edit.');
	}

	function handleSelectExample(exampleId: string): void {
		const loaded = getExampleCircuit(exampleId);
		undoStack = [];
		redoStack = [];
		pendingWireStart = null;
		wireConfirmBanner = '';
		importErrorBanner = '';
		doc = loaded;
		const firstComp = loaded.components.find((c) => c.kind !== 'ground') ?? loaded.components[0];
		selectedIds = firstComp ? [firstComp.id] : [];
		evaluateAndResetSimulation(loaded);
		fitToCircuit();
		announce(`Loaded example: ${loaded.title}`);
	}

	function handleRestartSimulation(): void {
		evaluateAndResetSimulation(doc);
		announce('Simulation restarted at t = 0.00 s with edited circuit preserved.');
	}

	function handleRestoreExample(): void {
		const exId = doc.exampleId || 'rc-charging';
		handleSelectExample(exId);
		announce('Restored original example circuit and values.');
	}

	function handleToggleRun(): void {
		if (running) {
			running = false;
			workerClient?.cancelActive();
			batchInFlight = false;
			announce(`Simulation paused at t = ${(snapshot?.timeSec ?? 0).toFixed(2)} s.`);
			return;
		}
		// Validate circuit before starting Run
		const check = evaluateCircuitAtInstant(doc, snapshot?.timeSec ?? 0, snapshot?.reactiveState);
		if (!check.ok) {
			diagnostics = check.diagnostics;
			snapshot = null;
			running = false;
			announce(`Needs attention: ${check.diagnostics[0]?.message ?? 'Invalid circuit'}`);
			return;
		}
		diagnostics = [];
		snapshot = check.snapshot;
		if (samples.length === 0) {
			samples = [snapshotToScopeSample(doc, check.snapshot)];
		}
		lastFrameTime = performance.now();
		simAccumulatorSec = 0;
		running = true;
		announce('Simulation running.');
	}

	function handleSaveLocally(): void {
		const status = saveCircuitToStorage(doc);
		saveStatusText = status.message;
		announce(status.message);
	}

	function storedCanLoad(
		res: { ok: true; doc: CircuitDocument } | { ok: false; available: boolean }
	): res is { ok: true; doc: CircuitDocument } {
		return res.ok;
	}

	function handleAddFromLibrary(kind: ComponentKind): void {
		const res = addComponent(doc, kind);
		if ('error' in res) {
			importErrorBanner = res.error;
			announce(res.error);
			return;
		}
		selectedIds = [res.added.id];
		applyTopologyEdit(res.doc, `Added ${res.added.label} (${kind})`);
		if (mobileDrawer === 'library') {
			mobileDrawer = 'none';
		}
	}

	function handleTerminalTap(endpoint: WireEndpoint, label: string): void {
		importErrorBanner = '';
		if (!pendingWireStart) {
			pendingWireStart = endpoint;
			wireConfirmBanner = `Wiring from ${label} — click or tap another terminal or wire to connect, or press Escape to cancel.`;
			announce(`Selected wire start at ${label}`);
			return;
		}
		if (endpointsEqual(pendingWireStart, endpoint)) {
			pendingWireStart = null;
			wireConfirmBanner = '';
			return;
		}
		const connected = connectEndpoints(doc, pendingWireStart, endpoint);
		pendingWireStart = null;
		if ('error' in connected) {
			wireConfirmBanner = '';
			importErrorBanner = connected.error;
			announce(connected.error);
			return;
		}
		const startLabel =
			allAvailableEndpoints.find((e) => endpointsEqual(e.endpoint, connected.wire.from))?.label ??
			'start';
		wireConfirmBanner = `Connected ${startLabel} to ${label}.`;
		applyTopologyEdit(connected.doc, `Connected wire from ${startLabel} to ${label}`);
	}

	function handleWireClick(wireId: string, event: MouseEvent): void {
		event.stopPropagation();
		if (pendingWireStart && svgEl) {
			// Split the clicked wire with an explicit connected junction and connect pendingWireStart to it!
			const pt = clientToGrid(event.clientX, event.clientY);
			const split = splitWireWithJunction(doc, wireId, pt.x, pt.y);
			if ('error' in split) {
				importErrorBanner = split.error;
				pendingWireStart = null;
				return;
			}
			const juncEp: WireEndpoint = { type: 'junction', junctionId: split.junction.id };
			const conn = connectEndpoints(split.doc, pendingWireStart, juncEp);
			pendingWireStart = null;
			if ('error' in conn) {
				importErrorBanner = conn.error;
				return;
			}
			wireConfirmBanner = `Created explicit junction at (${split.junction.x}, ${split.junction.y}) and connected wire.`;
			applyTopologyEdit(conn.doc, wireConfirmBanner);
			return;
		}

		if (multiSelectMode || event.shiftKey) {
			selectedIds = selectedIds.includes(wireId)
				? selectedIds.filter((id) => id !== wireId)
				: [...selectedIds, wireId];
		} else {
			selectedIds = [wireId];
		}
	}

	function clientToGrid(clientX: number, clientY: number): { x: number; y: number } {
		if (!svgEl) return { x: 8, y: 6 };
		const rect = svgEl.getBoundingClientRect();
		const svgX = viewBoxX + ((clientX - rect.left) / Math.max(1, rect.width)) * viewBoxW;
		const svgY = viewBoxY + ((clientY - rect.top) / Math.max(1, rect.height)) * viewBoxH;
		return {
			x: Math.round(svgX / GRID_PX),
			y: Math.round(svgY / GRID_PX)
		};
	}

	function handleComponentPointerDown(comp: CircuitComponent, event: PointerEvent): void {
		event.stopPropagation();
		if (panMode) return;

		if (multiSelectMode || event.shiftKey) {
			selectedIds = selectedIds.includes(comp.id)
				? selectedIds.filter((id) => id !== comp.id)
				: [...selectedIds, comp.id];
		} else if (!selectedIds.includes(comp.id)) {
			selectedIds = [comp.id];
		}

		const target = event.currentTarget as Element;
		target.setPointerCapture(event.pointerId);
		draggingCompId = comp.id;
		dragLastGrid = clientToGrid(event.clientX, event.clientY);
	}

	function handleComponentPointerMove(event: PointerEvent): void {
		if (!draggingCompId || !dragLastGrid) return;
		const currentGrid = clientToGrid(event.clientX, event.clientY);
		const dx = currentGrid.x - dragLastGrid.x;
		const dy = currentGrid.y - dragLastGrid.y;
		if (dx !== 0 || dy !== 0) {
			const idsToMove = selectedIds.includes(draggingCompId) ? selectedIds : [draggingCompId];
			doc = moveComponents(doc, idsToMove, dx, dy);
			dragLastGrid = currentGrid;
			saveStatusText = 'Unsaved changes';
		}
	}

	function handleComponentPointerUp(event: PointerEvent): void {
		if (!draggingCompId) return;
		const target = event.currentTarget as Element;
		if (target.hasPointerCapture(event.pointerId)) {
			target.releasePointerCapture(event.pointerId);
		}
		draggingCompId = null;
		dragLastGrid = null;
	}

	function handleCanvasPointerDown(event: PointerEvent): void {
		if (panMode || event.button === 1) {
			const target = event.currentTarget as Element;
			target.setPointerCapture(event.pointerId);
			draggingPan = true;
			panStartClient = {
				x: event.clientX,
				y: event.clientY,
				vx: viewBoxX,
				vy: viewBoxY
			};
			return;
		}
		if (pendingWireStart) {
			pendingWireStart = null;
			wireConfirmBanner = '';
		}
	}

	function handleCanvasPointerMove(event: PointerEvent): void {
		if (pendingWireStart) {
			pointerGridPos = clientToGrid(event.clientX, event.clientY);
		}
		if (!draggingPan || !panStartClient || !svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		const dx = ((event.clientX - panStartClient.x) / Math.max(1, rect.width)) * viewBoxW;
		const dy = ((event.clientY - panStartClient.y) / Math.max(1, rect.height)) * viewBoxH;
		viewBoxX = panStartClient.vx - dx;
		viewBoxY = panStartClient.vy - dy;
	}

	function handleCanvasPointerUp(event: PointerEvent): void {
		if (!draggingPan) return;
		draggingPan = false;
		panStartClient = null;
		const target = event.currentTarget as Element;
		if (target.hasPointerCapture(event.pointerId)) {
			target.releasePointerCapture(event.pointerId);
		}
	}

	function handleRotateSelection(): void {
		if (selectedIds.length === 0) return;
		pushHistory(doc);
		doc = rotateComponents(doc, selectedIds);
		announce('Rotated selected component 90 degrees.');
	}

	function handleDuplicateSelection(): void {
		if (selectedIds.length === 0) return;
		const res = duplicateComponents(doc, selectedIds);
		if ('error' in res) {
			importErrorBanner = res.error;
			return;
		}
		selectedIds = res.newIds;
		applyTopologyEdit(res.doc, 'Duplicated selected component');
	}

	function handleDeleteSelection(): void {
		if (selectedIds.length === 0) return;
		const nextDoc = deleteSelection(doc, selectedIds);
		selectedIds = [];
		applyTopologyEdit(nextDoc, 'Deleted selected items');
	}

	function toggleSwitchComponent(comp: CircuitComponent): void {
		if (comp.kind === 'switch_spst') {
			applyValueEdit(comp.id, (c) => {
				c.params.closed = c.params.closed === false;
				return `${c.label} ${c.params.closed ? 'Closed' : 'Opened'}`;
			});
		} else if (comp.kind === 'switch_spdt') {
			applyValueEdit(comp.id, (c) => {
				c.params.position = c.params.position === 'B' ? 'A' : 'B';
				return `${c.label} → Pos ${c.params.position}`;
			});
		}
	}

	function handleKeyboardConnect(): void {
		const fromObj = allAvailableEndpoints.find((e) => e.key === kbFromEndpoint);
		const toObj = allAvailableEndpoints.find((e) => e.key === kbToEndpoint);
		if (!fromObj || !toObj) {
			importErrorBanner = 'Select both a start terminal and an end terminal to connect.';
			return;
		}
		const res = connectEndpoints(doc, fromObj.endpoint, toObj.endpoint);
		if ('error' in res) {
			importErrorBanner = res.error;
			return;
		}
		wireConfirmBanner = `Connected ${fromObj.label} to ${toObj.label}.`;
		applyTopologyEdit(res.doc, wireConfirmBanner);
	}

	function downloadTextFile(filename: string, content: string, mimeType: string): void {
		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1500);
	}

	function handleExportJson(): void {
		downloadTextFile(
			`${doc.id || 'circuit'}.circuit.json`,
			exportCircuitJson(doc),
			'application/json'
		);
		showOverflowMenu = false;
		announce('Exported circuit JSON.');
	}

	function handleExportSvg(): void {
		const svg = exportSchematicSvg(doc, snapshot, { showVoltageColor });
		downloadTextFile(`${doc.id || 'circuit'}.svg`, svg, 'image/svg+xml;charset=utf-8');
		showOverflowMenu = false;
		announce('Exported schematic SVG.');
	}

	function handleExportPng(): void {
		const svg = exportSchematicSvg(doc, snapshot, { showVoltageColor });
		const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = 1280;
			canvas.height = 800;
			const ctx = canvas.getContext('2d');
			if (ctx) {
				ctx.fillStyle = '#0B0F12';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
				canvas.toBlob((pngBlob) => {
					if (!pngBlob) return;
					const pngUrl = URL.createObjectURL(pngBlob);
					const a = document.createElement('a');
					a.href = pngUrl;
					a.download = `${doc.id || 'circuit'}.png`;
					document.body.appendChild(a);
					a.click();
					a.remove();
					setTimeout(() => URL.revokeObjectURL(pngUrl), 1500);
				}, 'image/png');
			}
			URL.revokeObjectURL(url);
		};
		img.src = url;
		showOverflowMenu = false;
		announce('Exported schematic PNG.');
	}

	function handleExportCsv(): void {
		const csv = exportWaveformCsv(doc, samples);
		downloadTextFile(`${doc.id || 'circuit'}-waveforms.csv`, csv, 'text/csv;charset=utf-8');
		showOverflowMenu = false;
		announce('Exported waveform samples as CSV.');
	}

	async function handleShareUrl(): Promise<void> {
		showOverflowMenu = false;
		const originPath =
			typeof window !== 'undefined'
				? `${window.location.origin}${window.location.pathname}`
				: 'https://www.suvroghosh.in/blog/visualizations/circuit-bench';
		const encoded = encodeShareUrl(doc, originPath);
		if (!encoded.ok) {
			importErrorBanner = encoded.error;
			announce(encoded.error);
			return;
		}
		if (typeof window !== 'undefined') {
			window.history.replaceState({}, '', `?circuit=${encoded.param}`);
		}
		try {
			await navigator.clipboard.writeText(encoded.url);
			wireConfirmBanner = 'Copied shareable circuit link to clipboard.';
			announce('Copied shareable circuit link to clipboard.');
		} catch {
			wireConfirmBanner = `Share link ready in address bar (${encoded.url.length} chars).`;
		}
	}

	async function handleImportFileChange(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (file.size > CIRCUIT_LIMITS.MAX_IMPORT_BYTES) {
			importErrorBanner = `Import rejected: file exceeds ${Math.round(CIRCUIT_LIMITS.MAX_IMPORT_BYTES / 1024)} KiB limit. Existing circuit preserved.`;
			announce(importErrorBanner);
			return;
		}
		const text = await file.text();
		const validated = importCircuitJson(text);
		if (!validated.ok) {
			importErrorBanner = `Import rejected: ${validated.error} Existing circuit preserved.`;
			announce(importErrorBanner);
			return;
		}
		importErrorBanner = '';
		pushHistory(doc);
		doc = validated.doc;
		selectedIds = doc.components[0] ? [doc.components[0].id] : [];
		evaluateAndResetSimulation(doc);
		fitToCircuit();
		wireConfirmBanner = `Imported circuit “${doc.title}”.`;
		announce(wireConfirmBanner);
	}

	function handleWorkspaceKeydown(event: KeyboardEvent): void {
		const tag = (event.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

		if (event.key === 'Escape') {
			pendingWireStart = null;
			wireConfirmBanner = '';
			showOverflowMenu = false;
		} else if (event.key === 'r' || event.key === 'R') {
			event.preventDefault();
			handleRotateSelection();
		} else if (event.key === 'd' || event.key === 'D') {
			event.preventDefault();
			handleDuplicateSelection();
		} else if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			handleDeleteSelection();
		} else if (event.key === ' ') {
			event.preventDefault();
			handleToggleRun();
		}
	}

	async function stepSimulationLoop(now: number): Promise<void> {
		if (!running) return;
		const dtWallSec = Math.min(0.08, Math.max(0, (now - lastFrameTime) / 1000));
		lastFrameTime = now;

		if (!reducedMotion && showCurrentDots) {
			animPhase = (animPhase + dtWallSec * 28) % 24;
		}

		simAccumulatorSec += dtWallSec * doc.simulation.playbackSpeed;
		const dt = doc.simulation.dtSec;
		const stepsNeeded = Math.min(
			CIRCUIT_LIMITS.MAX_STEPS_PER_BATCH,
			Math.floor(simAccumulatorSec / dt)
		);

		if (stepsNeeded > 0 && !batchInFlight && workerClient) {
			simAccumulatorSec -= stepsNeeded * dt;
			batchInFlight = true;
			const lastSampleTime = samples.length > 0 ? samples[samples.length - 1].timeSec : -Infinity;
			try {
				const res = await workerClient.runBatch(doc, snapshot, stepsNeeded, lastSampleTime);
				batchInFlight = false;
				if (!running) return;
				if (!res.ok) {
					diagnostics = res.diagnostics;
					snapshot = null;
					running = false;
					announce(`Simulation halted: ${res.diagnostics[0]?.message ?? 'Error'}`);
					return;
				}
				snapshot = res.snapshot;
				if (res.samples.length > 0) {
					const combined = [...samples, ...res.samples];
					samples =
						combined.length > CIRCUIT_LIMITS.MAX_STORED_SAMPLES
							? combined.slice(combined.length - CIRCUIT_LIMITS.MAX_STORED_SAMPLES)
							: combined;
				}
			} catch {
				batchInFlight = false;
			}
		}

		if (running) {
			rafId = requestAnimationFrame((t) => {
				void stepSimulationLoop(t);
			});
		}
	}

	$effect(() => {
		if (running && typeof requestAnimationFrame !== 'undefined') {
			lastFrameTime = performance.now();
			rafId = requestAnimationFrame((t) => {
				void stepSimulationLoop(t);
			});
			return () => {
				if (rafId !== null) {
					cancelAnimationFrame(rafId);
					rafId = null;
				}
			};
		}
	});

	onMount(() => {
		workerClient = new CircuitWorkerClient();

		// Check reduced-motion preference & site motion dataset
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotionPref = () => {
			const siteStill = document.documentElement.dataset.motion === 'still';
			reducedMotion = mq.matches || siteStill;
		};
		updateMotionPref();
		mq.addEventListener('change', updateMotionPref);

		// Check URL parameter ?circuit=... first, otherwise keep default RC charging example
		// (If a saved circuit exists in localStorage, let the user restore it or note its presence without overriding the required opening RC example unless ?circuit= is in URL)
		const params = new URLSearchParams(window.location.search);
		const urlCircuit = params.get('circuit');
		if (urlCircuit) {
			const decoded = decodeShareUrlParam(urlCircuit);
			if (decoded.ok) {
				doc = decoded.doc;
				selectedIds = doc.components[0] ? [doc.components[0].id] : [];
				evaluateAndResetSimulation(doc);
			} else {
				importErrorBanner = `URL circuit parameter invalid: ${decoded.error} Loaded default RC example.`;
			}
		} else {
			const stored = loadCircuitFromStorage();
			if (stored.ok) {
				doc = stored.doc;
				selectedIds = doc.components[0] ? [doc.components[0].id] : [];
				evaluateAndResetSimulation(doc);
				saveStatusText = 'Restored saved circuit from browser storage';
			} else if (!stored.available) {
				saveStatusText = 'Local storage unavailable · session only';
			}
		}

		fitToCircuit();

		const handleVisibilityChange = () => {
			if (document.hidden && running) {
				running = false;
				workerClient?.cancelActive();
				announce('Simulation paused while tab is hidden.');
			}
		};
		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			mq.removeEventListener('change', updateMotionPref);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			if (rafId !== null) cancelAnimationFrame(rafId);
			workerClient?.dispose();
			workerClient = null;
		};
	});

	onDestroy(() => {
		if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
			cancelAnimationFrame(rafId);
		}
		workerClient?.dispose();
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="cb-enclosure {!showLeftPanel && !showRightPanel ? 'cb-expanded' : ''}"
	id="circuit-bench-app"
	data-ready="true"
	role="application"
	aria-label="Circuit Bench interactive electronic circuit simulator"
	onkeydown={handleWorkspaceKeydown}
>
	<div class="cb-sr-only" aria-live="polite">{actionAnnouncement}</div>

	<input
		bind:this={fileInputEl}
		type="file"
		accept=".json,application/json"
		class="cb-sr-only"
		aria-label="Import circuit JSON file"
		onchange={handleImportFileChange}
	/>

	<!-- 1. Compact Top Toolbar -->
	<header class="cb-toolbar">
		<div class="cb-toolbar-group">
			<div class="cb-brand">
				<span class="cb-brand-mark" aria-hidden="true"></span>
				<span class="cb-brand-title">Circuit Bench</span>
			</div>

			<label style="display:inline-flex;align-items:center;gap:6px;">
				<span style="font-size:12px;color:var(--cb-muted);font-weight:600;">Examples:</span>
				<select
					class="cb-select"
					aria-label="Select a prepared circuit example"
					value={doc.exampleId ?? 'rc-charging'}
					onchange={(e) => handleSelectExample((e.currentTarget as HTMLSelectElement).value)}
				>
					{#each CIRCUIT_EXAMPLES as ex (ex.id)}
						<option value={ex.id}>{ex.shortTitle}</option>
					{/each}
				</select>
			</label>

			<button
				type="button"
				class="cb-btn cb-btn-primary"
				onclick={handleToggleRun}
				aria-label={running ? 'Pause simulation' : 'Run simulation'}
			>
				{running ? 'Pause' : 'Run'}
			</button>

			<button
				type="button"
				class="cb-btn"
				onclick={handleRestartSimulation}
				title="Reset time, traces, and configured initial conditions while preserving the edited circuit"
			>
				Restart
			</button>

			<button
				type="button"
				class="cb-btn"
				onclick={handleUndo}
				disabled={undoStack.length === 0}
				aria-label="Undo circuit edit"
			>
				Undo
			</button>

			<button
				type="button"
				class="cb-btn"
				onclick={handleRedo}
				disabled={redoStack.length === 0}
				aria-label="Redo circuit edit"
			>
				Redo
			</button>

			<button
				type="button"
				class="cb-btn"
				onclick={handleSaveLocally}
				aria-label="Save current circuit locally in this browser"
			>
				Save
			</button>
		</div>

		<div class="cb-toolbar-group">
			<div class="cb-status-readout" role="status" aria-label="Simulation status and clock">
				<span class="cb-status-pill" data-status={statusLabel}>{statusLabel}</span>
				<span class="cb-time-readout">
					t = {snapshot ? snapshot.timeSec.toFixed(3) : '0.000'} s
				</span>
			</div>

			<span class="cb-save-badge" title="Local persistence status">{saveStatusText}</span>

			<div class="cb-overflow-wrap">
				<button
					type="button"
					class="cb-btn"
					aria-expanded={showOverflowMenu}
					aria-haspopup="menu"
					aria-label="More circuit actions"
					onclick={() => {
						showOverflowMenu = !showOverflowMenu;
					}}
				>
					More ▾
				</button>

				{#if showOverflowMenu}
					<div class="cb-overflow-panel" role="menu" aria-label="Additional actions">
						<button type="button" class="cb-btn" role="menuitem" onclick={handleRestoreExample}>
							Restore example (original circuit & values)
						</button>
						<button
							type="button"
							class="cb-btn"
							role="menuitem"
							onclick={() => {
								showOverflowMenu = false;
								handleSelectExample('blank');
							}}
						>
							Blank circuit
						</button>
						<button
							type="button"
							class="cb-btn"
							role="menuitem"
							onclick={() => {
								showOverflowMenu = false;
								fitToCircuit();
							}}
						>
							Fit to circuit
						</button>
						<button
							type="button"
							class="cb-btn"
							role="menuitem"
							onclick={() => {
								const expand = showLeftPanel || showRightPanel;
								showLeftPanel = !expand;
								showRightPanel = !expand;
								showOverflowMenu = false;
							}}
						>
							{showLeftPanel || showRightPanel ? 'Expand workspace' : 'Show library & inspector'}
						</button>
						<button type="button" class="cb-btn" role="menuitem" onclick={handleShareUrl}>
							Copy shareable link
						</button>
						<button
							type="button"
							class="cb-btn"
							role="menuitem"
							onclick={() => {
								showOverflowMenu = false;
								fileInputEl?.click();
							}}
						>
							Import circuit JSON…
						</button>
						<button type="button" class="cb-btn" role="menuitem" onclick={handleExportJson}>
							Export circuit JSON
						</button>
						<button type="button" class="cb-btn" role="menuitem" onclick={handleExportSvg}>
							Export schematic SVG
						</button>
						<button type="button" class="cb-btn" role="menuitem" onclick={handleExportPng}>
							Export schematic PNG
						</button>
						<button type="button" class="cb-btn" role="menuitem" onclick={handleExportCsv}>
							Export waveform CSV
						</button>
						<button
							type="button"
							class="cb-btn"
							role="menuitem"
							onclick={() => {
								const saved = loadCircuitFromStorage();
								showOverflowMenu = false;
								if (storedCanLoad(saved)) {
									doc = saved.doc;
									evaluateAndResetSimulation(doc);
									fitToCircuit();
									wireConfirmBanner = 'Loaded saved circuit from browser storage.';
								} else {
									importErrorBanner = 'No saved circuit found in local storage.';
								}
							}}
						>
							Load saved circuit from browser
						</button>
					</div>
				{/if}
			</div>
		</div>
	</header>

	<!-- Concise Example Question & Instruction Strip -->
	<div class="cb-prompt-strip">
		<div class="cb-prompt-main">
			<h2 class="cb-prompt-title">{doc.title}</h2>
			<p class="cb-prompt-instruction">{doc.instruction}</p>
			<p class="cb-prompt-note">{doc.explanation}</p>
		</div>

		{#if rcTimeConstantSec !== null}
			<div class="cb-checkpoints" aria-label="Expected RC transient checkpoints">
				<span class="cb-checkpoint-chip">
					Time constant τ: <strong>{formatMeasurement(rcTimeConstantSec, 's')}</strong>
				</span>
				{#if rcCheckpoints}
					<span class="cb-checkpoint-chip">
						t = 0 s: <strong>{formatMeasurement(rcCheckpoints.v0, 'V')} · {formatMeasurement(rcCheckpoints.i0, 'A')}</strong>
					</span>
					<span class="cb-checkpoint-chip">
						t = 1 s: <strong>≈ {formatMeasurement(rcCheckpoints.vAt1s, 'V')} · {formatMeasurement(rcCheckpoints.iAt1s, 'A')}</strong>
					</span>
					<span class="cb-checkpoint-chip">
						t = 5 s: <strong>≈ {formatMeasurement(rcCheckpoints.vAt5s, 'V')}</strong>
					</span>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Narrow-screen Drawer Toggles -->
	<div class="cb-mobile-drawer-bar" role="toolbar" aria-label="Mobile panel drawers">
		<button
			type="button"
			class="cb-btn {mobileDrawer === 'library' ? 'cb-btn-active' : ''}"
			onclick={() => {
				mobileDrawer = mobileDrawer === 'library' ? 'none' : 'library';
			}}
		>
			{mobileDrawer === 'library' ? 'Hide Components' : 'Components Drawer'}
		</button>
		<button
			type="button"
			class="cb-btn {mobileDrawer === 'inspector' ? 'cb-btn-active' : ''}"
			onclick={() => {
				mobileDrawer = mobileDrawer === 'inspector' ? 'none' : 'inspector';
			}}
		>
			{mobileDrawer === 'inspector' ? 'Hide Inspector' : 'Inspector Drawer'}
		</button>
		<button
			type="button"
			class="cb-btn {showKeyboardList ? 'cb-btn-active' : ''}"
			onclick={() => {
				showKeyboardList = !showKeyboardList;
			}}
		>
			{showKeyboardList ? 'Hide Keyboard List' : 'Keyboard List'}
		</button>
	</div>

	<!-- Main Workbench Grid: Library (Left) | Dominant Circuit Workspace (Centre) | Inspector (Right) -->
	<div
		class="cb-workbench-grid {!showLeftPanel ? 'cb-hide-left' : ''} {!showRightPanel
			? 'cb-hide-right'
			: ''}"
	>
		<!-- 2. Narrow Component Library on the Left -->
		{#if showLeftPanel}
			<aside
				class="cb-panel cb-panel-library"
				data-mobile-open={mobileDrawer === 'library'}
				aria-label="Component library"
			>
				<div class="cb-panel-header">
					<span>Components</span>
					<button
						type="button"
						class="cb-btn cb-btn-compact"
						onclick={() => {
							showLeftPanel = false;
						}}
						aria-label="Collapse component library"
					>
						Hide
					</button>
				</div>
				<div class="cb-library-list">
					{#each COMPONENT_CATALOG as item (item.kind)}
						<button
							type="button"
							class="cb-lib-item"
							onclick={() => handleAddFromLibrary(item.kind)}
							title={item.description}
							aria-label={`Add ${item.name} to circuit`}
						>
							<span class="cb-lib-name">+ {item.name}</span>
							<span class="cb-lib-badge">{item.prefix}</span>
						</button>
					{/each}
				</div>
			</aside>
		{/if}

		<!-- 3. Large Circuit Workspace in the Centre -->
		<div class="cb-panel cb-workspace-panel">
			<div class="cb-workspace-controls">
				<div class="cb-toolbar-group">
					{#if !showLeftPanel}
						<button
							type="button"
							class="cb-btn cb-btn-compact"
							onclick={() => {
								showLeftPanel = true;
							}}
						>
							Show Library
						</button>
					{/if}

					<button
						type="button"
						class="cb-btn cb-btn-compact"
						onclick={handleRotateSelection}
						disabled={selectedIds.length === 0}
						aria-label="Rotate selected component 90 degrees"
					>
						Rotate
					</button>

					<button
						type="button"
						class="cb-btn cb-btn-compact"
						onclick={handleDuplicateSelection}
						disabled={selectedIds.length === 0}
						aria-label="Duplicate selected component"
					>
						Duplicate
					</button>

					<button
						type="button"
						class="cb-btn cb-btn-compact"
						onclick={handleDeleteSelection}
						disabled={selectedIds.length === 0}
						aria-label="Delete selected component or wire"
					>
						Delete
					</button>

					<button
						type="button"
						class="cb-btn cb-btn-compact {multiSelectMode ? 'cb-btn-active' : ''}"
						onclick={() => {
							multiSelectMode = !multiSelectMode;
						}}
						aria-pressed={multiSelectMode}
						title="Toggle multi-selection mode"
					>
						Multi-select
					</button>
				</div>

				<div class="cb-toolbar-group">
					<button
						type="button"
						class="cb-btn cb-btn-compact {showVoltageColor ? 'cb-btn-active' : ''}"
						aria-pressed={showVoltageColor}
						onclick={() => {
							showVoltageColor = !showVoltageColor;
						}}
					>
						Voltage colour: {showVoltageColor ? 'On' : 'Off'}
					</button>

					<button
						type="button"
						class="cb-btn cb-btn-compact {showCurrentDots ? 'cb-btn-active' : ''}"
						aria-pressed={showCurrentDots}
						onclick={() => {
							showCurrentDots = !showCurrentDots;
						}}
					>
						Current dots: {showCurrentDots ? 'On' : 'Off'}
					</button>

					<button
						type="button"
						class="cb-btn cb-btn-compact {panMode ? 'cb-btn-active' : ''}"
						aria-pressed={panMode}
						onclick={() => {
							panMode = !panMode;
						}}
						title="Toggle canvas pan mode (distinguishes panning from page scroll on touch devices)"
					>
						{panMode ? 'Pan: Active' : 'Pan'}
					</button>

					<button
						type="button"
						class="cb-btn cb-btn-compact"
						onclick={() => adjustZoom(1 / 1.2)}
						aria-label="Zoom out"
					>
						−
					</button>
					<button
						type="button"
						class="cb-btn cb-btn-compact"
						onclick={fitToCircuit}
						aria-label="Fit circuit in workspace"
					>
						Fit ({Math.round(zoomLevel * 100)}%)
					</button>
					<button
						type="button"
						class="cb-btn cb-btn-compact"
						onclick={() => adjustZoom(1.2)}
						aria-label="Zoom in"
					>
						+
					</button>

					<button
						type="button"
						class="cb-btn cb-btn-compact {showKeyboardList ? 'cb-btn-active' : ''}"
						aria-pressed={showKeyboardList}
						onclick={() => {
							showKeyboardList = !showKeyboardList;
						}}
					>
						Component list
					</button>

					{#if !showRightPanel}
						<button
							type="button"
							class="cb-btn cb-btn-compact"
							onclick={() => {
								showRightPanel = true;
							}}
						>
							Show Inspector
						</button>
					{/if}
				</div>
			</div>

			<!-- Diagnostic / Confirmation Banners -->
			{#if diagnostics.length > 0}
				<div class="cb-banner cb-banner-error" role="alert">
					<div>
						<strong>Needs attention:</strong>
						{diagnostics.map((d) => d.message).join(' ')}
					</div>
					<button type="button" class="cb-btn cb-btn-compact" onclick={handleRestoreExample}>
						Restore example
					</button>
				</div>
			{/if}

			{#if importErrorBanner}
				<div class="cb-banner cb-banner-error" role="alert">
					<span>{importErrorBanner}</span>
					<button
						type="button"
						class="cb-btn cb-btn-compact"
						onclick={() => {
							importErrorBanner = '';
						}}
					>
						Dismiss
					</button>
				</div>
			{/if}

			{#if wireConfirmBanner}
				<div class="cb-banner cb-banner-wire" role="status">
					<span>{wireConfirmBanner}</span>
					<button
						type="button"
						class="cb-btn cb-btn-compact"
						onclick={() => {
							pendingWireStart = null;
							wireConfirmBanner = '';
						}}
					>
						{pendingWireStart ? 'Cancel wire' : 'Dismiss'}
					</button>
				</div>
			{/if}

			{#if valueEditNote}
				<div class="cb-banner cb-banner-info" role="status">
					<span>{valueEditNote}</span>
					<button type="button" class="cb-btn cb-btn-compact" onclick={handleRestartSimulation}>
						Restart from t = 0 s
					</button>
				</div>
			{/if}

			<!-- Recessed Schematic Canvas -->
			<div class="cb-canvas-recess">
				<svg
					bind:this={svgEl}
					class="cb-schematic-svg"
					data-pan-mode={panMode}
					viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`}
					role="group"
					aria-label="Circuit schematic workspace. Click a component to inspect or click two terminals to connect a wire."
					onpointerdown={handleCanvasPointerDown}
					onpointermove={handleCanvasPointerMove}
					onpointerup={handleCanvasPointerUp}
				>
					<defs>
						<pattern
							id="cb-grid-pattern"
							width={GRID_PX}
							height={GRID_PX}
							patternUnits="userSpaceOnUse"
						>
							<circle cx="0" cy="0" r="1.15" fill="#2A3138" />
						</pattern>
					</defs>

					<rect
						x={viewBoxX - 1000}
						y={viewBoxY - 1000}
						width={viewBoxW + 2000}
						height={viewBoxH + 2000}
						fill="url(#cb-grid-pattern)"
					/>

					<!-- Wires -->
					{#each doc.wires as wire (wire.id)}
						{@const pts = getWirePolylineGridPoints(doc, wire)}
						{#if pts.length >= 2}
							{@const d = pts
								.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x * GRID_PX} ${p.y * GRID_PX}`)
								.join(' ')}
							{@const wireV = snapshot?.wireVoltages[wire.id]}
							{@const wireI = snapshot?.wireCurrents[wire.id] ?? 0}
							{@const wireColor = voltageToWireColor(wireV, showVoltageColor, 5)}
							{@const isWireSelected = selectedIds.includes(wire.id)}

							<g class="cb-wire-group">
								<!-- Wide invisible click/touch target for wire -->
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<path
									{d}
									fill="none"
									stroke="transparent"
									stroke-width="18"
									style="cursor:pointer;"
									onclick={(e) => handleWireClick(wire.id, e)}
								/>

								{#if isWireSelected}
									<path
										{d}
										fill="none"
										stroke="#EF762F"
										stroke-width="6"
										stroke-linecap="round"
										stroke-linejoin="round"
										opacity="0.4"
									/>
								{/if}

								<path
									{d}
									fill="none"
									stroke={wireColor}
									stroke-width="2.6"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>

								<!-- Conventional Current Dots or Reduced-Motion Static Direction Indicators -->
								{#if showCurrentDots && snapshot && Math.abs(wireI) > 1e-6}
									{@const dirSign = wireI >= 0 ? 1 : -1}
									{#if !reducedMotion && running}
										<path
											{d}
											fill="none"
											stroke="#F1EEE7"
											stroke-width="3.4"
											stroke-linecap="round"
											stroke-dasharray="2 16"
											stroke-dashoffset={-dirSign * animPhase}
										/>
									{:else}
										<!-- Static directional chevron at midpoint of longest segment -->
										{@const pA = pts[0]}
										{@const pB = pts[1]}
										{@const mx = ((pA.x + pB.x) / 2) * GRID_PX}
										{@const my = ((pA.y + pB.y) / 2) * GRID_PX}
										{@const angle =
											(Math.atan2((pB.y - pA.y) * dirSign, (pB.x - pA.x) * dirSign) * 180) /
											Math.PI}
										<g transform={`translate(${mx} ${my}) rotate(${angle})`}>
											<polygon points="-4,-3.5 5,0 -4,3.5" fill="#F1EEE7" />
										</g>
									{/if}
								{/if}
							</g>
						{/if}
					{/each}

					<!-- Preview wire while connecting -->
					{#if pendingWireStart && pointerGridPos}
						{@const startPos = getEndpointGridPosition(doc, pendingWireStart)}
						{#if startPos}
							<path
								d={`M ${startPos.x * GRID_PX} ${startPos.y * GRID_PX} L ${pointerGridPos.x * GRID_PX} ${startPos.y * GRID_PX} L ${pointerGridPos.x * GRID_PX} ${pointerGridPos.y * GRID_PX}`}
								fill="none"
								stroke="#EF762F"
								stroke-width="2"
								stroke-dasharray="5 4"
							/>
						{/if}
					{/if}

					<!-- Explicit Connected Junctions -->
					{#each doc.junctions as junc (junc.id)}
						{@const jv = snapshot?.junctionVoltages[junc.id]}
						{@const jColor = voltageToWireColor(jv, showVoltageColor, 5)}
						{@const jEp: WireEndpoint = { type: 'junction', junctionId: junc.id }}
						{@const isPendingStart =
							pendingWireStart !== null && endpointsEqual(pendingWireStart, jEp)}
						<g transform={`translate(${junc.x * GRID_PX} ${junc.y * GRID_PX})`}>
							<!-- Touch target -->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<circle
								cx="0"
								cy="0"
								r="14"
								fill="transparent"
								style="cursor:pointer;"
								onclick={(e) => {
									e.stopPropagation();
									handleTerminalTap(jEp, `Junction (${junc.x}, ${junc.y})`);
								}}
							/>
							<circle
								cx="0"
								cy="0"
								r={isPendingStart ? 6.5 : 4.8}
								fill={isPendingStart ? '#EF762F' : jColor}
								stroke="#0B0F12"
								stroke-width="1.6"
							/>
						</g>
					{/each}

					<!-- Circuit Components -->
					{#each doc.components as comp (comp.id)}
						{@const cx = comp.x * GRID_PX}
						{@const cy = comp.y * GRID_PX}
						{@const isSelected = selectedIds.includes(comp.id)}
						{@const hasError = affectedIdSet.has(comp.id)}
						{@const meas = snapshot?.components[comp.id]}
						{@const terms = getComponentTerminals(comp)}

						<g class="cb-comp-node" data-comp-id={comp.id} data-comp-label={comp.label}>
							<!-- Component symbol rotated around (cx, cy) -->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<g
								transform={`translate(${cx} ${cy}) rotate(${comp.rotation})`}
								style="cursor:pointer;"
								onpointerdown={(e) => handleComponentPointerDown(comp, e)}
								onpointermove={handleComponentPointerMove}
								onpointerup={handleComponentPointerUp}
								onpointercancel={handleComponentPointerUp}
								onclick={(e) => {
									e.stopPropagation();
									if (comp.kind === 'switch_spst' || comp.kind === 'switch_spdt') {
										toggleSwitchComponent(comp);
									}
								}}
							>
								<!-- Selection / Error Halo -->
								{#if isSelected || hasError}
									<rect
										x="-44"
										y="-24"
										width="88"
										height="48"
										rx="6"
										fill={hasError ? 'rgba(239, 104, 104, 0.12)' : 'rgba(239, 118, 47, 0.1)'}
										stroke={hasError ? '#EF6868' : '#EF762F'}
										stroke-width="1.6"
										stroke-dasharray={hasError ? '4 2' : undefined}
									/>
								{/if}

								<!-- Hit box -->
								<rect x="-42" y="-22" width="84" height="44" fill="transparent" />

								{#if comp.kind === 'resistor'}
									<!-- Lead wires + IEC / Zig-zag Resistor Symbol -->
									<line
										x1={-2 * GRID_PX}
										y1="0"
										x2="-28"
										y2="0"
										stroke="#F1EEE7"
										stroke-width="2.4"
									/>
									<line
										x1="28"
										y1="0"
										x2={2 * GRID_PX}
										y2="0"
										stroke="#F1EEE7"
										stroke-width="2.4"
									/>
									<polyline
										points="-28,0 -23,-10 -14,10 -5,-10 5,10 14,-10 23,10 28,0"
										fill="none"
										stroke="#F1EEE7"
										stroke-width="2.4"
										stroke-linejoin="round"
									/>
									<!-- Reference current direction arrow A -> B -->
									<polygon points="-4,-15 4,-12 -4,-9" fill="#B8BFC5" />
								{:else if comp.kind === 'capacitor'}
									<line
										x1={-2 * GRID_PX}
										y1="0"
										x2="-7"
										y2="0"
										stroke="#F1EEE7"
										stroke-width="2.4"
									/>
									<line x1="7" y1="0" x2={2 * GRID_PX} y2="0" stroke="#F1EEE7" stroke-width="2.4" />
									<line x1="-7" y1="-16" x2="-7" y2="16" stroke="#F1EEE7" stroke-width="3" />
									<line x1="7" y1="-16" x2="7" y2="16" stroke="#F1EEE7" stroke-width="3" />
									<text
										x="-16"
										y="-10"
										fill="#EF762F"
										font-size="11"
										font-family="IBM Plex Mono, monospace"
										font-weight="700">+</text
									>
								{:else if comp.kind === 'inductor'}
									<line
										x1={-2 * GRID_PX}
										y1="0"
										x2="-28"
										y2="0"
										stroke="#F1EEE7"
										stroke-width="2.4"
									/>
									<line
										x1="28"
										y1="0"
										x2={2 * GRID_PX}
										y2="0"
										stroke="#F1EEE7"
										stroke-width="2.4"
									/>
									<path
										d="M -28 0 A 7 9 0 0 1 -14 0 A 7 9 0 0 1 0 0 A 7 9 0 0 1 14 0 A 7 9 0 0 1 28 0"
										fill="none"
										stroke="#F1EEE7"
										stroke-width="2.4"
									/>
									<polygon points="-4,-15 4,-12 -4,-9" fill="#B8BFC5" />
								{:else if comp.kind === 'dc_voltage' || comp.kind === 'sine_voltage' || comp.kind === 'square_voltage'}
									<line
										x1="0"
										y1={-2 * GRID_PX}
										x2="0"
										y2="-22"
										stroke="#F1EEE7"
										stroke-width="2.4"
									/>
									<line
										x1="0"
										y1="22"
										x2="0"
										y2={2 * GRID_PX}
										stroke="#F1EEE7"
										stroke-width="2.4"
									/>
									<circle cx="0" cy="0" r="22" fill="#161A1E" stroke="#F1EEE7" stroke-width="2.3" />
									<text
										x="0"
										y="-7"
										text-anchor="middle"
										fill="#EF762F"
										font-family="IBM Plex Mono, monospace"
										font-size="13"
										font-weight="700">+</text
									>
									<text
										x="0"
										y="16"
										text-anchor="middle"
										fill="#5BA4CF"
										font-family="IBM Plex Mono, monospace"
										font-size="13"
										font-weight="700">−</text
									>
									{#if comp.kind === 'sine_voltage'}
										<path
											d="M -9 2 Q -4.5 -5 0 2 T 9 2"
											fill="none"
											stroke="#F1EEE7"
											stroke-width="1.8"
										/>
									{:else if comp.kind === 'square_voltage'}
										<polyline
											points="-9,4 -9,-2 0,-2 0,4 9,4 9,-2"
											fill="none"
											stroke="#F1EEE7"
											stroke-width="1.6"
										/>
									{/if}
								{:else if comp.kind === 'switch_spst'}
									<line
										x1={-2 * GRID_PX}
										y1="0"
										x2="-20"
										y2="0"
										stroke="#F1EEE7"
										stroke-width="2.4"
									/>
									<line
										x1="20"
										y1="0"
										x2={2 * GRID_PX}
										y2="0"
										stroke="#F1EEE7"
										stroke-width="2.4"
									/>
									<circle
										cx="-20"
										cy="0"
										r="3.5"
										fill="#161A1E"
										stroke="#F1EEE7"
										stroke-width="2"
									/>
									<circle cx="20" cy="0" r="3.5" fill="#161A1E" stroke="#F1EEE7" stroke-width="2" />
									{#if comp.params.closed !== false}
										<line x1="-17" y1="0" x2="17" y2="0" stroke="#9EC985" stroke-width="2.8" />
									{:else}
										<line x1="-17" y1="-1" x2="15" y2="-16" stroke="#EF762F" stroke-width="2.8" />
									{/if}
								{:else if comp.kind === 'switch_spdt'}
									<line
										x1={-2 * GRID_PX}
										y1="0"
										x2="-18"
										y2="0"
										stroke="#F1EEE7"
										stroke-width="2.4"
									/>
									<line
										x1="18"
										y1={-GRID_PX}
										x2={2 * GRID_PX}
										y2={-GRID_PX}
										stroke="#F1EEE7"
										stroke-width="2.4"
									/>
									<line
										x1="18"
										y1={GRID_PX}
										x2={2 * GRID_PX}
										y2={GRID_PX}
										stroke="#F1EEE7"
										stroke-width="2.4"
									/>
									<circle
										cx="-18"
										cy="0"
										r="3.5"
										fill="#161A1E"
										stroke="#F1EEE7"
										stroke-width="2"
									/>
									<circle
										cx="18"
										cy={-GRID_PX}
										r="3.5"
										fill="#161A1E"
										stroke="#F1EEE7"
										stroke-width="2"
									/>
									<circle
										cx="18"
										cy={GRID_PX}
										r="3.5"
										fill="#161A1E"
										stroke="#F1EEE7"
										stroke-width="2"
									/>
									<line
										x1="-15"
										y1="0"
										x2="15"
										y2={comp.params.position === 'B' ? GRID_PX : -GRID_PX}
										stroke="#EF762F"
										stroke-width="2.8"
									/>
								{:else if comp.kind === 'probe_voltage'}
									<line x1="0" y1={GRID_PX} x2="0" y2="6" stroke="#EF762F" stroke-width="2.4" />
									<rect
										x="-24"
										y="-18"
										width="48"
										height="24"
										rx="4"
										fill="#1B1E21"
										stroke="#EF762F"
										stroke-width="2"
									/>
									<text
										x="0"
										y="-2"
										text-anchor="middle"
										fill="#EF762F"
										font-family="IBM Plex Mono, monospace"
										font-size="11"
										font-weight="700"
									>
										{comp.label}
									</text>
								{:else if comp.kind === 'ground'}
									<line x1="0" y1={-GRID_PX} x2="0" y2="0" stroke="#9EC985" stroke-width="2.4" />
									<line x1="-16" y1="0" x2="16" y2="0" stroke="#9EC985" stroke-width="2.6" />
									<line x1="-10" y1="6" x2="10" y2="6" stroke="#9EC985" stroke-width="2.2" />
									<line x1="-4" y1="12" x2="4" y2="12" stroke="#9EC985" stroke-width="2" />
								{/if}
							</g>

							<!-- Unrotated legible component label & live measurement badge -->
							{#if comp.kind !== 'ground'}
								{@const labelOffsetY = comp.rotation === 90 || comp.rotation === 270 ? -4 : -26}
								{@const labelOffsetX = comp.rotation === 90 || comp.rotation === 270 ? 26 : 0}
								{@const textAnchor =
									comp.rotation === 90 || comp.rotation === 270 ? 'start' : 'middle'}
								<text
									x={cx + labelOffsetX}
									y={cy + labelOffsetY}
									text-anchor={textAnchor}
									fill="#F1EEE7"
									font-family="IBM Plex Mono, monospace"
									font-size="12"
									font-weight="700"
								>
									{formatComponentSummary(comp)}
								</text>
								{#if meas}
									<text
										x={cx + labelOffsetX}
										y={cy + (comp.rotation === 90 || comp.rotation === 270 ? 12 : 34)}
										text-anchor={textAnchor}
										fill="#B8BFC5"
										font-family="IBM Plex Mono, monospace"
										font-size="10.5"
									>
										{comp.kind === 'probe_voltage'
											? formatMeasurement(meas.voltageDrop, 'V')
											: `${formatMeasurement(meas.voltageDrop, 'V')} · ${formatMeasurement(meas.current, 'A')}`}
									</text>
								{/if}
							{/if}

							<!-- Terminal Connection Targets (Tap-to-Connect & Drag-to-Connect) -->
							{#each terms as term (term.id)}
								{@const tPos = getTerminalGridPosition(comp, term.id)}
								{#if tPos}
									{@const tEp: WireEndpoint = {
										type: 'terminal',
										componentId: comp.id,
										terminalId: term.id
									}}
									{@const isPending =
										pendingWireStart !== null && endpointsEqual(pendingWireStart, tEp)}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<g
										transform={`translate(${tPos.x * GRID_PX} ${tPos.y * GRID_PX})`}
										style="cursor:crosshair;"
										onclick={(e) => {
											e.stopPropagation();
											handleTerminalTap(tEp, `${comp.label} (${term.label})`);
										}}
									>
										<!-- 44px touch target -->
										<circle cx="0" cy="0" r="16" fill="transparent" />
										<circle
											cx="0"
											cy="0"
											r={isPending ? 7 : 4.5}
											fill={isPending ? '#EF762F' : '#1B1E21'}
											stroke={isPending ? '#F1EEE7' : '#EF762F'}
											stroke-width="2"
										/>
									</g>
								{/if}
							{/each}
						</g>
					{/each}
				</svg>
			</div>

			<!-- Workspace Legend & Reference Note Footer -->
			<div class="cb-workspace-footer">
				<div class="cb-voltage-legend" aria-label="Wire voltage colour legend">
					<span>Wire voltage scale:</span>
					<span class="cb-legend-swatch">
						<span class="cb-legend-dot" style="background:#5BA4CF;"></span> −5 V
					</span>
					<span class="cb-legend-swatch">
						<span class="cb-legend-dot" style="background:#9EC985;"></span> 0 V (GND)
					</span>
					<span class="cb-legend-swatch">
						<span class="cb-legend-dot" style="background:#EF762F;"></span> +5 V
					</span>
				</div>

				<div>
					Moving dots show conventional current direction. Their speed is adjusted for visibility.
				</div>
			</div>

			<!-- Keyboard & Screen-Reader Accessible Component & Connection List -->
			{#if showKeyboardList}
				<div
					class="cb-a11y-list-panel"
					role="region"
					aria-label="Keyboard component and connection list"
				>
					<div
						style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;"
					>
						<strong style="color:var(--cb-text);font-size:12.5px;">
							Component & Wiring List (Keyboard Operation)
						</strong>
						<span style="color:var(--cb-muted);font-size:11.5px;">
							Node voltage is relative to Ground (0 V). Differential voltage is V(A) − V(B).
						</span>
					</div>

					<table class="cb-a11y-table">
						<thead>
							<tr>
								<th>Component</th>
								<th>Value</th>
								<th>Voltage V(A)−V(B)</th>
								<th>Current (A→B / out of +)</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each doc.components as comp (comp.id)}
								{@const m = snapshot?.components[comp.id]}
								<tr>
									<td><strong>{comp.label}</strong> ({comp.kind})</td>
									<td>{formatComponentSummary(comp)}</td>
									<td style="font-family:'IBM Plex Mono',monospace;">
										{m ? formatMeasurement(m.voltageDrop, 'V') : '—'}
									</td>
									<td style="font-family:'IBM Plex Mono',monospace;">
										{m ? formatMeasurement(m.current, 'A') : '—'}
									</td>
									<td>
										<button
											type="button"
											class="cb-btn cb-btn-compact"
											onclick={() => {
												selectedIds = [comp.id];
											}}
										>
											Inspect {comp.label}
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>

					<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding-top:4px;">
						<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;">
							<span>Connect from:</span>
							<select
								class="cb-select"
								bind:value={kbFromEndpoint}
								aria-label="Start terminal for wire"
							>
								<option value="">Select terminal…</option>
								{#each allAvailableEndpoints as ep (ep.key)}
									<option value={ep.key}>{ep.label}</option>
								{/each}
							</select>
						</label>
						<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;">
							<span>To:</span>
							<select
								class="cb-select"
								bind:value={kbToEndpoint}
								aria-label="End terminal for wire"
							>
								<option value="">Select terminal…</option>
								{#each allAvailableEndpoints as ep (ep.key)}
									<option value={ep.key}>{ep.label}</option>
								{/each}
							</select>
						</label>
						<button type="button" class="cb-btn cb-btn-compact" onclick={handleKeyboardConnect}>
							Connect wire
						</button>
					</div>
				</div>
			{/if}
		</div>

		<!-- 4. Contextual Inspector on the Right -->
		{#if showRightPanel}
			<aside
				class="cb-panel cb-panel-inspector"
				data-mobile-open={mobileDrawer === 'inspector'}
				aria-label="Component inspector"
			>
				<div class="cb-panel-header">
					<span>Inspector</span>
					<button
						type="button"
						class="cb-btn cb-btn-compact"
						onclick={() => {
							showRightPanel = false;
						}}
						aria-label="Collapse inspector"
					>
						Hide
					</button>
				</div>

				<div class="cb-inspector-body">
					{#if primarySelectedComponent}
						{@const comp = primarySelectedComponent}
						<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
							<h3 style="margin:0;font-size:14px;font-weight:700;color:var(--cb-text);">
								{formatComponentSummary(comp)}
							</h3>
							<span style="font-size:11.5px;color:var(--cb-muted);text-transform: capitalize;">
								{comp.kind.replace('_', ' ')}
							</span>
						</div>

						<!-- Recessed Analogue + Digital Meter Window -->
						{#if comp.kind !== 'ground'}
							<AnalogueMeter
								label={`Voltage across ${comp.label}`}
								value={selectedMeasurement ? selectedMeasurement.voltageDrop : null}
								unit="V"
								min={comp.kind === 'sine_voltage' || comp.kind === 'square_voltage' ? -6 : 0}
								max={doc.id === 'rlc-response' ? 10 : 6}
							/>
						{/if}

						<!-- Parameter Controls -->
						{#if comp.kind === 'resistor'}
							<RotaryControl
								label="Resistance"
								paramKey="resistance"
								value={comp.params.resistance ?? 1000}
								bounds={PARAMETER_BOUNDS.resistance}
								onchange={(val) =>
									applyValueEdit(comp.id, (c) => {
										c.params.resistance = val;
										return `${c.label} = ${formatEngineeringValue(val, 'Ω')}`;
									})}
							/>
						{:else if comp.kind === 'capacitor'}
							<RotaryControl
								label="Capacitance"
								paramKey="capacitance"
								value={comp.params.capacitance ?? 0.001}
								bounds={PARAMETER_BOUNDS.capacitance}
								onchange={(val) =>
									applyValueEdit(comp.id, (c) => {
										c.params.capacitance = val;
										return `${c.label} = ${formatEngineeringValue(val, 'F')}`;
									})}
							/>
							<RotaryControl
								label="Initial voltage (at t = 0 s)"
								paramKey="initialVoltage"
								value={comp.params.initialVoltage ?? 0}
								bounds={PARAMETER_BOUNDS.initialVoltage}
								onchange={(val) =>
									applyValueEdit(comp.id, (c) => {
										c.params.initialVoltage = val;
										return `${c.label} V(0) = ${formatEngineeringValue(val, 'V')}`;
									})}
							/>
						{:else if comp.kind === 'inductor'}
							<RotaryControl
								label="Inductance"
								paramKey="inductance"
								value={comp.params.inductance ?? 0.1}
								bounds={PARAMETER_BOUNDS.inductance}
								onchange={(val) =>
									applyValueEdit(comp.id, (c) => {
										c.params.inductance = val;
										return `${c.label} = ${formatEngineeringValue(val, 'H')}`;
									})}
							/>
							<RotaryControl
								label="Initial current (at t = 0 s)"
								paramKey="initialCurrent"
								value={comp.params.initialCurrent ?? 0}
								bounds={PARAMETER_BOUNDS.initialCurrent}
								onchange={(val) =>
									applyValueEdit(comp.id, (c) => {
										c.params.initialCurrent = val;
										return `${c.label} I(0) = ${formatEngineeringValue(val, 'A')}`;
									})}
							/>
						{:else if comp.kind === 'dc_voltage'}
							<RotaryControl
								label="Supply voltage"
								paramKey="voltage"
								value={comp.params.voltage ?? 5}
								bounds={PARAMETER_BOUNDS.voltage}
								onchange={(val) =>
									applyValueEdit(comp.id, (c) => {
										c.params.voltage = val;
										return `${c.label} = ${formatEngineeringValue(val, 'V')}`;
									})}
							/>
						{:else if comp.kind === 'sine_voltage'}
							<RotaryControl
								label="Peak amplitude"
								paramKey="amplitude"
								value={comp.params.amplitude ?? 5}
								bounds={PARAMETER_BOUNDS.amplitude}
								onchange={(val) =>
									applyValueEdit(comp.id, (c) => {
										c.params.amplitude = val;
										return `${c.label} amp = ${formatEngineeringValue(val, 'V')}`;
									})}
							/>
							<RotaryControl
								label="Frequency"
								paramKey="frequency"
								value={comp.params.frequency ?? 100}
								bounds={PARAMETER_BOUNDS.frequency}
								onchange={(val) =>
									applyValueEdit(comp.id, (c) => {
										c.params.frequency = val;
										return `${c.label} freq = ${formatEngineeringValue(val, 'Hz')}`;
									})}
							/>
							<RotaryControl
								label="DC offset"
								paramKey="offset"
								value={comp.params.offset ?? 0}
								bounds={PARAMETER_BOUNDS.offset}
								onchange={(val) =>
									applyValueEdit(comp.id, (c) => {
										c.params.offset = val;
										return `${c.label} offset = ${formatEngineeringValue(val, 'V')}`;
									})}
							/>
							<RotaryControl
								label="Phase angle"
								paramKey="phaseDeg"
								value={comp.params.phaseDeg ?? 0}
								bounds={PARAMETER_BOUNDS.phaseDeg}
								onchange={(val) =>
									applyValueEdit(comp.id, (c) => {
										c.params.phaseDeg = val;
										return `${c.label} phase = ${val}°`;
									})}
							/>
						{:else if comp.kind === 'square_voltage'}
							<RotaryControl
								label="Peak amplitude"
								paramKey="amplitude"
								value={comp.params.amplitude ?? 5}
								bounds={PARAMETER_BOUNDS.amplitude}
								onchange={(val) =>
									applyValueEdit(comp.id, (c) => {
										c.params.amplitude = val;
										return `${c.label} amp = ${formatEngineeringValue(val, 'V')}`;
									})}
							/>
							<RotaryControl
								label="Frequency"
								paramKey="frequency"
								value={comp.params.frequency ?? 10}
								bounds={PARAMETER_BOUNDS.frequency}
								onchange={(val) =>
									applyValueEdit(comp.id, (c) => {
										c.params.frequency = val;
										return `${c.label} freq = ${formatEngineeringValue(val, 'Hz')}`;
									})}
							/>
							<RotaryControl
								label="DC offset"
								paramKey="offset"
								value={comp.params.offset ?? 0}
								bounds={PARAMETER_BOUNDS.offset}
								onchange={(val) =>
									applyValueEdit(comp.id, (c) => {
										c.params.offset = val;
										return `${c.label} offset = ${formatEngineeringValue(val, 'V')}`;
									})}
							/>
							<RotaryControl
								label="Duty cycle"
								paramKey="dutyPercent"
								value={comp.params.dutyPercent ?? 50}
								bounds={PARAMETER_BOUNDS.dutyPercent}
								onchange={(val) =>
									applyValueEdit(comp.id, (c) => {
										c.params.dutyPercent = val;
										return `${c.label} duty = ${val}%`;
									})}
							/>
						{:else if comp.kind === 'probe_voltage'}
							<button
								type="button"
								class="cb-btn cb-btn-compact"
								onclick={() =>
									applyValueEdit(comp.id, (c) => {
										const nextMode =
											c.params.probeMode === 'differential' ? 'node' : 'differential';
										c.params.probeMode = nextMode;
										return `${c.label} mode: ${nextMode === 'differential' ? 'Differential V(+) − V(−)' : 'Node V (to 0 V)'}`;
									})}
							>
								Probe mode: {comp.params.probeMode === 'differential'
									? 'Differential V(+) − V(−)'
									: 'Node V (to 0 V)'} — Switch mode
							</button>
						{:else if comp.kind === 'switch_spst'}
							<button
								type="button"
								class="cb-btn cb-btn-primary"
								onclick={() => toggleSwitchComponent(comp)}
							>
								Switch state: {comp.params.closed !== false
									? 'Closed (Conducting)'
									: 'Open (Disconnected)'} — Toggle
							</button>
						{:else if comp.kind === 'switch_spdt'}
							<button
								type="button"
								class="cb-btn cb-btn-primary"
								onclick={() => toggleSwitchComponent(comp)}
							>
								Active throw: Position {comp.params.position === 'B' ? 'B' : 'A'} — Flip switch
							</button>
						{/if}

						<!-- Live Component Measurements Readout -->
						<div class="cb-meas-grid" aria-label={`Live measurements for ${comp.label}`}>
							{#if comp.kind === 'resistor'}
								<div class="cb-meas-row">
									<span class="cb-meas-label">Resistance:</span>
									<span class="cb-meas-val">
										{formatEngineeringValue(comp.params.resistance ?? 1000, 'Ω')}
									</span>
								</div>
							{:else if comp.kind === 'capacitor'}
								<div class="cb-meas-row">
									<span class="cb-meas-label">Capacitance:</span>
									<span class="cb-meas-val">
										{formatEngineeringValue(comp.params.capacitance ?? 0.001, 'F')}
									</span>
								</div>
							{:else if comp.kind === 'inductor'}
								<div class="cb-meas-row">
									<span class="cb-meas-label">Inductance:</span>
									<span class="cb-meas-val">
										{formatEngineeringValue(comp.params.inductance ?? 0.1, 'H')}
									</span>
								</div>
							{/if}

							{#if rcTimeConstantSec !== null && (comp.kind === 'resistor' || comp.kind === 'capacitor')}
								<div class="cb-meas-row">
									<span class="cb-meas-label">RC time constant (τ):</span>
									<span class="cb-meas-val">{formatMeasurement(rcTimeConstantSec, 's')}</span>
								</div>
							{/if}

							<div class="cb-meas-row">
								<span class="cb-meas-label">Voltage across {comp.label}:</span>
								<span class="cb-meas-val">
									{selectedMeasurement
										? formatMeasurement(selectedMeasurement.voltageDrop, 'V')
										: '—'}
								</span>
							</div>

							{#if comp.kind !== 'probe_voltage' && comp.kind !== 'ground'}
								<div class="cb-meas-row">
									<span class="cb-meas-label">
										Current through {comp.label} ({comp.kind.includes('voltage')
											? 'out of +'
											: comp.kind === 'switch_spdt'
												? `COM → ${comp.params.position === 'B' ? 'B' : 'A'}`
												: 'A → B'}):
									</span>
									<span class="cb-meas-val">
										{selectedMeasurement
											? formatMeasurement(selectedMeasurement.current, 'A')
											: '—'}
									</span>
								</div>
								<div class="cb-meas-row">
									<span class="cb-meas-label">
										{#if comp.kind === 'capacitor' || comp.kind === 'inductor'}
											{selectedMeasurement && selectedMeasurement.power < -1e-12
												? 'Reactive power (releasing):'
												: selectedMeasurement && selectedMeasurement.power > 1e-12
													? 'Reactive power (storing):'
													: 'Instantaneous power:'}
										{:else if comp.kind.includes('voltage')}
											{selectedMeasurement && selectedMeasurement.power > 1e-12
												? 'Power absorbed:'
												: 'Power supplied:'}
										{:else}
											Power dissipated:
										{/if}
									</span>
									<span class="cb-meas-val">
										{selectedMeasurement
											? formatMeasurement(
													comp.kind.includes('voltage')
														? Math.abs(selectedMeasurement.power)
														: selectedMeasurement.power,
													'W'
												)
											: '—'}
									</span>
								</div>
							{/if}

							{#if selectedMeasurement?.storedEnergy !== undefined}
								<div class="cb-meas-row">
									<span class="cb-meas-label">Stored energy:</span>
									<span class="cb-meas-val">
										{formatMeasurement(selectedMeasurement.storedEnergy, 'J')}
									</span>
								</div>
							{/if}
						</div>

						<!-- Suggested change next to the relevant control -->
						{#if doc.suggestedChange}
							<div
								style="padding:8px 10px;background:#14181C;border:1px solid #2A3138;border-radius:5px;font-size:11.5px;color:var(--cb-muted);"
							>
								<strong style="color:var(--cb-text);">Try this:</strong>
								{doc.suggestedChange}
							</div>
						{/if}
					{:else}
						<p style="margin:0;color:var(--cb-muted);font-size:12px;">
							Select any component in the workspace or component list to inspect its live voltage,
							current, power, and adjust its value.
						</p>
					{/if}

					<!-- Distinct Restart simulation vs Restore example actions -->
					<div
						style="margin-top:auto;padding-top:8px;border-top:1px solid var(--cb-border);display:flex;flex-direction:column;gap:6px;"
					>
						<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
							<button
								type="button"
								class="cb-btn cb-btn-compact"
								onclick={handleRestartSimulation}
								title="Reset time, traces, and configured initial conditions while preserving your edited circuit"
							>
								Restart simulation
							</button>
							<button
								type="button"
								class="cb-btn cb-btn-compact"
								onclick={handleRestoreExample}
								title="Restore the example’s original circuit and values"
							>
								Restore example
							</button>
						</div>
						<p style="margin:0;font-size:11px;color:var(--cb-muted);">
							<strong>Restart simulation</strong> keeps your edited values and resets t = 0 s.
							<strong>Restore example</strong> resets the circuit and values to the original example.
						</p>
					</div>
				</div>
			</aside>
		{/if}
	</div>

	<!-- 5. Two-Channel Oscilloscope Beneath Workspace -->
	<Oscilloscope
		{doc}
		{samples}
		{markers}
		{running}
		ontoggleRun={handleToggleRun}
		onupdateChannel={(ch, target) => {
			const nextDoc = cloneCircuitDocument(doc);
			nextDoc.scope[ch] = target;
			doc = nextDoc;
			if (snapshot) {
				samples = [snapshotToScopeSample(nextDoc, snapshot)];
			}
		}}
		onupdateTimeSpan={(spanSec) => {
			const nextDoc = cloneCircuitDocument(doc);
			nextDoc.scope.timeSpanSec = spanSec;
			doc = nextDoc;
		}}
		ontoggleScaleMode={() => {
			const nextDoc = cloneCircuitDocument(doc);
			nextDoc.scope.verticalScaleMode =
				nextDoc.scope.verticalScaleMode === 'fixed' ? 'auto' : 'fixed';
			doc = nextDoc;
		}}
		onexportCsv={handleExportCsv}
	/>
</div>
