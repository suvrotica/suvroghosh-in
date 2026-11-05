import { zlibSync, unzlibSync, strToU8, strFromU8 } from 'fflate';
import {
	CIRCUIT_LIMITS,
	type CircuitComponent,
	type CircuitDocument,
	type CircuitJunction,
	type CircuitWire,
	type ComponentKind,
	type ComponentParams,
	type RotationDeg,
	type ScopeChannelTarget,
	type ScopeSample,
	type SimulationSnapshot,
	type TerminalDef,
	type WireEndpoint
} from './types';
import { formatEngineeringValue, formatMeasurement, PARAMETER_BOUNDS } from './notation';

export interface ComponentCatalogItem {
	kind: ComponentKind;
	name: string;
	shortName: string;
	prefix: string;
	description: string;
	defaultParams: ComponentParams;
	defaultRotation: RotationDeg;
}

export const COMPONENT_CATALOG: ComponentCatalogItem[] = [
	{
		kind: 'resistor',
		name: 'Resistor',
		shortName: 'Resistor',
		prefix: 'R',
		description: 'Opposes current in proportion to voltage (V = I × R).',
		defaultParams: { resistance: 1000 },
		defaultRotation: 0
	},
	{
		kind: 'capacitor',
		name: 'Capacitor',
		shortName: 'Capacitor',
		prefix: 'C',
		description: 'Stores charge in an electric field (I = C × dV/dt).',
		defaultParams: { capacitance: 0.001, initialVoltage: 0 },
		defaultRotation: 90
	},
	{
		kind: 'inductor',
		name: 'Inductor',
		shortName: 'Inductor',
		prefix: 'L',
		description: 'Opposes changes in current via a magnetic field (V = L × dI/dt).',
		defaultParams: { inductance: 0.1, initialCurrent: 0 },
		defaultRotation: 0
	},
	{
		kind: 'dc_voltage',
		name: 'DC Supply',
		shortName: 'DC Supply',
		prefix: 'V',
		description: 'Maintains a steady potential difference between + and −.',
		defaultParams: { voltage: 5 },
		defaultRotation: 0
	},
	{
		kind: 'sine_voltage',
		name: 'Sine Source',
		shortName: 'Sine AC',
		prefix: 'V',
		description: 'Produces a sinusoidal alternating voltage.',
		defaultParams: { amplitude: 5, frequency: 100, offset: 0, phaseDeg: 0 },
		defaultRotation: 0
	},
	{
		kind: 'square_voltage',
		name: 'Square Source',
		shortName: 'Square Wave',
		prefix: 'V',
		description: 'Alternates between +V and −V at a set frequency and duty cycle.',
		defaultParams: { amplitude: 5, frequency: 10, offset: 0, dutyPercent: 50 },
		defaultRotation: 0
	},
	{
		kind: 'switch_spst',
		name: 'On/Off Switch',
		shortName: 'SPST Switch',
		prefix: 'S',
		description: 'Opens or closes a single circuit path.',
		defaultParams: { closed: true },
		defaultRotation: 0
	},
	{
		kind: 'switch_spdt',
		name: 'Changeover Switch',
		shortName: 'SPDT Switch',
		prefix: 'S',
		description: 'Routes a common terminal between throw A and throw B.',
		defaultParams: { position: 'A' },
		defaultRotation: 0
	},
	{
		kind: 'probe_voltage',
		name: 'Voltage Probe',
		shortName: 'V Probe',
		prefix: 'P',
		description: 'Measures node voltage relative to ground or differential V(pos) − V(neg).',
		defaultParams: { probeMode: 'node' },
		defaultRotation: 0
	},
	{
		kind: 'ground',
		name: 'Ground (0 V)',
		shortName: 'Ground',
		prefix: 'GND',
		description: 'Defines the 0 V reference potential for the circuit.',
		defaultParams: {},
		defaultRotation: 0
	}
];

export function getComponentTerminals(
	component: Pick<CircuitComponent, 'kind' | 'params'>
): TerminalDef[] {
	switch (component.kind) {
		case 'ground':
			return [{ id: 'A', label: '0 V', dx: 0, dy: -1 }];
		case 'probe_voltage':
			if (component.params.probeMode === 'differential') {
				return [
					{ id: 'pos', label: '+', dx: -1, dy: 1 },
					{ id: 'neg', label: '−', dx: 1, dy: 1 }
				];
			}
			return [{ id: 'pos', label: 'Probe', dx: 0, dy: 1 }];
		case 'dc_voltage':
		case 'sine_voltage':
		case 'square_voltage':
			return [
				{ id: 'pos', label: '+', dx: 0, dy: -2 },
				{ id: 'neg', label: '−', dx: 0, dy: 2 }
			];
		case 'switch_spdt':
			return [
				{ id: 'common', label: 'COM', dx: -2, dy: 0 },
				{ id: 'throwA', label: 'A', dx: 2, dy: -1 },
				{ id: 'throwB', label: 'B', dx: 2, dy: 1 }
			];
		case 'resistor':
		case 'capacitor':
		case 'inductor':
		case 'switch_spst':
		default:
			return [
				{ id: 'A', label: 'A', dx: -2, dy: 0 },
				{ id: 'B', label: 'B', dx: 2, dy: 0 }
			];
	}
}

export function rotateOffset(
	dx: number,
	dy: number,
	rotation: RotationDeg
): { dx: number; dy: number } {
	switch (rotation) {
		case 90:
			return { dx: -dy, dy: dx };
		case 180:
			return { dx: -dx, dy: -dy };
		case 270:
			return { dx: dy, dy: -dx };
		case 0:
		default:
			return { dx, dy };
	}
}

export function getTerminalGridPosition(
	component: CircuitComponent,
	terminalId: string
): { x: number; y: number } | null {
	const def = getComponentTerminals(component).find((t) => t.id === terminalId);
	if (!def) return null;
	const rot = rotateOffset(def.dx, def.dy, component.rotation);
	return {
		x: component.x + rot.dx,
		y: component.y + rot.dy
	};
}

export function getEndpointGridPosition(
	doc: Pick<CircuitDocument, 'components' | 'junctions'>,
	endpoint: WireEndpoint
): { x: number; y: number } | null {
	if (endpoint.type === 'junction') {
		const j = doc.junctions.find((item) => item.id === endpoint.junctionId);
		return j ? { x: j.x, y: j.y } : null;
	}
	const comp = doc.components.find((item) => item.id === endpoint.componentId);
	if (!comp) return null;
	return getTerminalGridPosition(comp, endpoint.terminalId);
}

export function endpointsEqual(a: WireEndpoint, b: WireEndpoint): boolean {
	if (a.type !== b.type) return false;
	if (a.type === 'junction' && b.type === 'junction') {
		return a.junctionId === b.junctionId;
	}
	if (a.type === 'terminal' && b.type === 'terminal') {
		return a.componentId === b.componentId && a.terminalId === b.terminalId;
	}
	return false;
}

export function endpointKey(endpoint: WireEndpoint): string {
	return endpoint.type === 'junction'
		? `junction:${endpoint.junctionId}`
		: `terminal:${endpoint.componentId}:${endpoint.terminalId}`;
}

/**
 * Format the primary component value for schematic labels such as "R1 · 1 kΩ" or "C1 · 1,000 µF".
 */
export function formatComponentSummary(component: CircuitComponent): string {
	const p = component.params;
	switch (component.kind) {
		case 'resistor':
			return `${component.label} · ${formatEngineeringValue(p.resistance ?? 1000, 'Ω')}`;
		case 'capacitor':
			return `${component.label} · ${formatEngineeringValue(p.capacitance ?? 0.001, 'F')}`;
		case 'inductor':
			return `${component.label} · ${formatEngineeringValue(p.inductance ?? 0.1, 'H')}`;
		case 'dc_voltage':
			return `${component.label} · ${formatEngineeringValue(p.voltage ?? 5, 'V')}`;
		case 'sine_voltage':
			return `${component.label} · ${formatEngineeringValue(p.amplitude ?? 5, 'V')} @ ${formatEngineeringValue(p.frequency ?? 100, 'Hz')}`;
		case 'square_voltage':
			return `${component.label} · ${formatEngineeringValue(p.amplitude ?? 5, 'V')} sq ${formatEngineeringValue(p.frequency ?? 10, 'Hz')}`;
		case 'switch_spst':
			return `${component.label} · ${p.closed !== false ? 'Closed' : 'Open'}`;
		case 'switch_spdt':
			return `${component.label} · Pos ${p.position === 'B' ? 'B' : 'A'}`;
		case 'probe_voltage':
			return `${component.label} · ${p.probeMode === 'differential' ? 'ΔV' : 'V'}`;
		case 'ground':
			return 'GND';
	}
}

export function formatComponentValueOnly(component: CircuitComponent): string {
	const p = component.params;
	switch (component.kind) {
		case 'resistor':
			return formatEngineeringValue(p.resistance ?? 1000, 'Ω');
		case 'capacitor':
			return formatEngineeringValue(p.capacitance ?? 0.001, 'F');
		case 'inductor':
			return formatEngineeringValue(p.inductance ?? 0.1, 'H');
		case 'dc_voltage':
			return formatEngineeringValue(p.voltage ?? 5, 'V');
		case 'sine_voltage':
			return `${formatEngineeringValue(p.amplitude ?? 5, 'V')} · ${formatEngineeringValue(p.frequency ?? 100, 'Hz')}`;
		case 'square_voltage':
			return `${formatEngineeringValue(p.amplitude ?? 5, 'V')} · ${formatEngineeringValue(p.frequency ?? 10, 'Hz')}`;
		case 'switch_spst':
			return p.closed !== false ? 'Closed' : 'Open';
		case 'switch_spdt':
			return `Throw ${p.position === 'B' ? 'B' : 'A'}`;
		case 'probe_voltage':
			return p.probeMode === 'differential' ? 'V(+) − V(−)' : 'Node V';
		case 'ground':
			return '0 V';
	}
}

/**
 * Compute orthogonal grid points for a wire between its two endpoints.
 */
export function getWirePolylineGridPoints(
	doc: Pick<CircuitDocument, 'components' | 'junctions'>,
	wire: CircuitWire
): Array<{ x: number; y: number }> {
	const start = getEndpointGridPosition(doc, wire.from);
	const end = getEndpointGridPosition(doc, wire.to);
	if (!start || !end) return [];
	if (start.x === end.x && start.y === end.y) {
		return [start];
	}
	if (start.x === end.x || start.y === end.y) {
		return [start, end];
	}
	const bend = wire.bend ?? 'hv';
	const corner = bend === 'hv' ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
	return [start, corner, end];
}

export function cloneCircuitDocument(doc: CircuitDocument): CircuitDocument {
	return JSON.parse(JSON.stringify(doc)) as CircuitDocument;
}

export function nextComponentLabel(doc: CircuitDocument, kind: ComponentKind): string {
	const catalogItem = COMPONENT_CATALOG.find((item) => item.kind === kind);
	const prefix = catalogItem?.prefix ?? 'X';
	const usedNumbers = new Set<number>();
	for (const comp of doc.components) {
		if (comp.label.startsWith(prefix)) {
			const rest = comp.label.slice(prefix.length);
			const num = Number.parseInt(rest, 10);
			if (Number.isFinite(num)) usedNumbers.add(num);
		}
	}
	let candidate = 1;
	while (usedNumbers.has(candidate)) candidate += 1;
	return `${prefix}${candidate}`;
}

export function addComponent(
	doc: CircuitDocument,
	kind: ComponentKind,
	gridPos?: { x: number; y: number }
): { doc: CircuitDocument; added: CircuitComponent } | { error: string } {
	if (doc.components.length >= CIRCUIT_LIMITS.MAX_COMPONENTS) {
		return {
			error: `Circuit Bench supports up to ${CIRCUIT_LIMITS.MAX_COMPONENTS} components per circuit.`
		};
	}
	const catalogItem = COMPONENT_CATALOG.find((item) => item.kind === kind);
	if (!catalogItem) {
		return { error: `Unsupported component type: ${kind}` };
	}
	const next = cloneCircuitDocument(doc);
	const label = nextComponentLabel(next, kind);
	const id = `comp_${label.toLowerCase()}_${Date.now().toString(36).slice(-4)}`;

	// Find a non-overlapping grid position if not explicitly given
	let x = gridPos ? Math.round(gridPos.x) : 8;
	let y = gridPos ? Math.round(gridPos.y) : 6;
	if (!gridPos) {
		let attempts = 0;
		while (
			next.components.some((c) => Math.abs(c.x - x) < 3 && Math.abs(c.y - y) < 3) &&
			attempts < 24
		) {
			x += 3;
			if (x > 20) {
				x = 6;
				y += 3;
			}
			attempts += 1;
		}
	}

	const added: CircuitComponent = {
		id,
		kind,
		label,
		x: Math.min(CIRCUIT_LIMITS.GRID_MAX, Math.max(CIRCUIT_LIMITS.GRID_MIN, x)),
		y: Math.min(CIRCUIT_LIMITS.GRID_MAX, Math.max(CIRCUIT_LIMITS.GRID_MIN, y)),
		rotation: catalogItem.defaultRotation,
		params: { ...catalogItem.defaultParams }
	};

	next.components.push(added);
	return { doc: next, added };
}

export function moveComponents(
	doc: CircuitDocument,
	ids: string[],
	dx: number,
	dy: number
): CircuitDocument {
	if (dx === 0 && dy === 0) return doc;
	const next = cloneCircuitDocument(doc);
	const idSet = new Set(ids);
	for (const comp of next.components) {
		if (idSet.has(comp.id)) {
			comp.x = Math.min(
				CIRCUIT_LIMITS.GRID_MAX,
				Math.max(CIRCUIT_LIMITS.GRID_MIN, Math.round(comp.x + dx))
			);
			comp.y = Math.min(
				CIRCUIT_LIMITS.GRID_MAX,
				Math.max(CIRCUIT_LIMITS.GRID_MIN, Math.round(comp.y + dy))
			);
		}
	}
	for (const j of next.junctions) {
		if (idSet.has(j.id)) {
			j.x = Math.min(
				CIRCUIT_LIMITS.GRID_MAX,
				Math.max(CIRCUIT_LIMITS.GRID_MIN, Math.round(j.x + dx))
			);
			j.y = Math.min(
				CIRCUIT_LIMITS.GRID_MAX,
				Math.max(CIRCUIT_LIMITS.GRID_MIN, Math.round(j.y + dy))
			);
		}
	}
	return next;
}

export function rotateComponents(doc: CircuitDocument, ids: string[]): CircuitDocument {
	const next = cloneCircuitDocument(doc);
	const idSet = new Set(ids);
	for (const comp of next.components) {
		if (idSet.has(comp.id)) {
			comp.rotation = ((comp.rotation + 90) % 360) as RotationDeg;
		}
	}
	return next;
}

export function duplicateComponents(
	doc: CircuitDocument,
	ids: string[]
): { doc: CircuitDocument; newIds: string[] } | { error: string } {
	const toCopy = doc.components.filter((c) => ids.includes(c.id));
	if (toCopy.length === 0) return { doc, newIds: [] };
	if (doc.components.length + toCopy.length > CIRCUIT_LIMITS.MAX_COMPONENTS) {
		return {
			error: `Cannot duplicate: circuit limit of ${CIRCUIT_LIMITS.MAX_COMPONENTS} components reached.`
		};
	}
	const next = cloneCircuitDocument(doc);
	const newIds: string[] = [];
	for (const comp of toCopy) {
		const label = nextComponentLabel(next, comp.kind);
		const id = `comp_${label.toLowerCase()}_${Math.random().toString(36).slice(2, 6)}`;
		const clone: CircuitComponent = {
			id,
			kind: comp.kind,
			label,
			x: Math.min(CIRCUIT_LIMITS.GRID_MAX, comp.x + 3),
			y: Math.min(CIRCUIT_LIMITS.GRID_MAX, comp.y + 2),
			rotation: comp.rotation,
			params: { ...comp.params }
		};
		next.components.push(clone);
		newIds.push(id);
	}
	return { doc: next, newIds };
}

export function deleteSelection(doc: CircuitDocument, selectedIds: string[]): CircuitDocument {
	if (selectedIds.length === 0) return doc;
	const idSet = new Set(selectedIds);
	const next = cloneCircuitDocument(doc);

	next.components = next.components.filter((c) => !idSet.has(c.id));
	next.junctions = next.junctions.filter((j) => !idSet.has(j.id));
	next.wires = next.wires.filter((w) => {
		if (idSet.has(w.id)) return false;
		if (w.from.type === 'terminal' && idSet.has(w.from.componentId)) return false;
		if (w.to.type === 'terminal' && idSet.has(w.to.componentId)) return false;
		if (w.from.type === 'junction' && idSet.has(w.from.junctionId)) return false;
		if (w.to.type === 'junction' && idSet.has(w.to.junctionId)) return false;
		return true;
	});

	// Clean up scope channel targets pointing to deleted components
	for (const chKey of ['channel1', 'channel2'] as const) {
		const target = next.scope[chKey];
		if (target.kind !== 'none' && idSet.has(target.componentId)) {
			next.scope[chKey] = { kind: 'none' };
		}
	}

	return next;
}

export function connectEndpoints(
	doc: CircuitDocument,
	from: WireEndpoint,
	to: WireEndpoint,
	bend: 'hv' | 'vh' = 'hv'
): { doc: CircuitDocument; wire: CircuitWire } | { error: string } {
	if (endpointsEqual(from, to)) {
		return { error: 'Choose two different terminals or junctions to connect a wire.' };
	}
	if (doc.wires.length >= CIRCUIT_LIMITS.MAX_WIRES) {
		return { error: `Wire limit of ${CIRCUIT_LIMITS.MAX_WIRES} reached.` };
	}
	const exists = doc.wires.some(
		(w) =>
			(endpointsEqual(w.from, from) && endpointsEqual(w.to, to)) ||
			(endpointsEqual(w.from, to) && endpointsEqual(w.to, from))
	);
	if (exists) {
		return { error: 'Those two points are already connected by a wire.' };
	}
	const next = cloneCircuitDocument(doc);
	const wire: CircuitWire = {
		id: `wire_${next.wires.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
		from,
		to,
		bend
	};
	next.wires.push(wire);
	return { doc: next, wire };
}

/**
 * Split an existing wire at grid coordinates (x, y) by inserting an explicit connected junction.
 */
export function splitWireWithJunction(
	doc: CircuitDocument,
	wireId: string,
	x: number,
	y: number
): { doc: CircuitDocument; junction: CircuitJunction } | { error: string } {
	const wireIndex = doc.wires.findIndex((w) => w.id === wireId);
	if (wireIndex === -1) return { error: 'Wire not found.' };
	if (doc.junctions.length >= CIRCUIT_LIMITS.MAX_JUNCTIONS) {
		return { error: `Junction limit of ${CIRCUIT_LIMITS.MAX_JUNCTIONS} reached.` };
	}
	if (doc.wires.length + 1 > CIRCUIT_LIMITS.MAX_WIRES) {
		return { error: `Wire limit of ${CIRCUIT_LIMITS.MAX_WIRES} reached.` };
	}

	const next = cloneCircuitDocument(doc);
	const gx = Math.round(x);
	const gy = Math.round(y);

	// Check if an explicit junction already sits at (gx, gy)
	const existingJunction = next.junctions.find((j) => j.x === gx && j.y === gy);
	const junction: CircuitJunction = existingJunction ?? {
		id: `junc_${next.junctions.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
		x: gx,
		y: gy
	};
	if (!existingJunction) {
		next.junctions.push(junction);
	}

	const original = next.wires[wireIndex];
	const juncEndpoint: WireEndpoint = { type: 'junction', junctionId: junction.id };
	if (endpointsEqual(original.from, juncEndpoint) || endpointsEqual(original.to, juncEndpoint)) {
		return { doc: next, junction };
	}

	next.wires.splice(
		wireIndex,
		1,
		{
			id: `${original.id}_a`,
			from: original.from,
			to: juncEndpoint,
			bend: original.bend
		},
		{
			id: `${original.id}_b`,
			from: juncEndpoint,
			to: original.to,
			bend: original.bend
		}
	);

	return { doc: next, junction };
}

/**
 * Check if a point (gx, gy) lies strictly on the interior of a wire segment.
 */
export function isGridPointOnWireInterior(
	doc: Pick<CircuitDocument, 'components' | 'junctions'>,
	wire: CircuitWire,
	gx: number,
	gy: number
): boolean {
	const pts = getWirePolylineGridPoints(doc, wire);
	if (pts.length < 2) return false;
	const first = pts[0];
	const last = pts[pts.length - 1];
	if ((gx === first.x && gy === first.y) || (gx === last.x && gy === last.y)) {
		return false;
	}
	for (let i = 0; i < pts.length - 1; i += 1) {
		const a = pts[i];
		const b = pts[i + 1];
		if (a.x === b.x && gx === a.x) {
			const minY = Math.min(a.y, b.y);
			const maxY = Math.max(a.y, b.y);
			if (gy >= minY && gy <= maxY) return true;
		} else if (a.y === b.y && gy === a.y) {
			const minX = Math.min(a.x, b.x);
			const maxX = Math.max(a.x, b.x);
			if (gx >= minX && gx <= maxX) return true;
		}
	}
	return false;
}

/**
 * Validate an imported or decoded CircuitDocument before replacing the active circuit.
 */
export function validateCircuitDocument(
	input: unknown
): { ok: true; doc: CircuitDocument } | { ok: false; error: string } {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return { ok: false, error: 'Circuit file must be a JSON object.' };
	}
	const raw = input as Record<string, unknown>;
	if (raw.schemaVersion !== 1) {
		return {
			ok: false,
			error: `Unsupported circuit schemaVersion (${String(raw.schemaVersion)}). Expected version 1.`
		};
	}
	if (typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 120) {
		return { ok: false, error: 'Circuit document is missing a valid id.' };
	}
	if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 200) {
		return { ok: false, error: 'Circuit document is missing a valid title.' };
	}
	if (!Array.isArray(raw.components)) {
		return { ok: false, error: 'Circuit document must contain a components array.' };
	}
	if (raw.components.length > CIRCUIT_LIMITS.MAX_COMPONENTS) {
		return {
			ok: false,
			error: `Circuit exceeds the maximum of ${CIRCUIT_LIMITS.MAX_COMPONENTS} components.`
		};
	}
	if (!Array.isArray(raw.wires)) {
		return { ok: false, error: 'Circuit document must contain a wires array.' };
	}
	if (raw.wires.length > CIRCUIT_LIMITS.MAX_WIRES) {
		return {
			ok: false,
			error: `Circuit exceeds the maximum of ${CIRCUIT_LIMITS.MAX_WIRES} wires.`
		};
	}
	const rawJunctions = Array.isArray(raw.junctions) ? raw.junctions : [];
	if (rawJunctions.length > CIRCUIT_LIMITS.MAX_JUNCTIONS) {
		return {
			ok: false,
			error: `Circuit exceeds the maximum of ${CIRCUIT_LIMITS.MAX_JUNCTIONS} junctions.`
		};
	}

	const validKinds = new Set(COMPONENT_CATALOG.map((c) => c.kind));
	const validRotations = new Set([0, 90, 180, 270]);
	const componentIds = new Set<string>();
	const components: CircuitComponent[] = [];

	for (const [idx, item] of raw.components.entries()) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			return { ok: false, error: `Component #${idx + 1} is invalid.` };
		}
		const c = item as Record<string, unknown>;
		if (typeof c.id !== 'string' || !c.id.trim() || c.id.length > 80) {
			return { ok: false, error: `Component #${idx + 1} has an invalid id.` };
		}
		if (componentIds.has(c.id)) {
			return { ok: false, error: `Duplicate component id “${c.id}”.` };
		}
		componentIds.add(c.id);

		if (typeof c.kind !== 'string' || !validKinds.has(c.kind as ComponentKind)) {
			return { ok: false, error: `Component “${c.id}” has unsupported kind “${String(c.kind)}”.` };
		}
		if (typeof c.label !== 'string' || !c.label.trim() || c.label.length > 32) {
			return { ok: false, error: `Component “${c.id}” has an invalid label.` };
		}
		if (
			typeof c.x !== 'number' ||
			!Number.isFinite(c.x) ||
			c.x < CIRCUIT_LIMITS.GRID_MIN ||
			c.x > CIRCUIT_LIMITS.GRID_MAX ||
			typeof c.y !== 'number' ||
			!Number.isFinite(c.y) ||
			c.y < CIRCUIT_LIMITS.GRID_MIN ||
			c.y > CIRCUIT_LIMITS.GRID_MAX
		) {
			return { ok: false, error: `Component “${c.label}” has out-of-bounds grid coordinates.` };
		}
		if (typeof c.rotation !== 'number' || !validRotations.has(c.rotation)) {
			return { ok: false, error: `Component “${c.label}” has an invalid rotation.` };
		}

		const rawParams =
			c.params && typeof c.params === 'object' && !Array.isArray(c.params)
				? (c.params as Record<string, unknown>)
				: {};
		const params: ComponentParams = {};
		for (const [paramKey, bounds] of Object.entries(PARAMETER_BOUNDS)) {
			if (rawParams[paramKey] !== undefined) {
				const v = rawParams[paramKey];
				if (typeof v !== 'number' || !Number.isFinite(v)) {
					return {
						ok: false,
						error: `Component “${c.label}” parameter ${paramKey} is not finite.`
					};
				}
				if (v < bounds.min - 1e-18 || v > bounds.max + 1e-9) {
					return {
						ok: false,
						error: `Component “${c.label}” parameter ${paramKey} is outside supported bounds.`
					};
				}
				(params as Record<string, number>)[paramKey] = v;
			}
		}
		if (typeof rawParams.closed === 'boolean') params.closed = rawParams.closed;
		if (rawParams.position === 'A' || rawParams.position === 'B')
			params.position = rawParams.position;
		if (rawParams.probeMode === 'node' || rawParams.probeMode === 'differential') {
			params.probeMode = rawParams.probeMode;
		}

		components.push({
			id: c.id,
			kind: c.kind as ComponentKind,
			label: c.label.trim(),
			x: Math.round(c.x),
			y: Math.round(c.y),
			rotation: c.rotation as RotationDeg,
			params
		});
	}

	const junctionIds = new Set<string>();
	const junctions: CircuitJunction[] = [];
	for (const [idx, item] of rawJunctions.entries()) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			return { ok: false, error: `Junction #${idx + 1} is invalid.` };
		}
		const j = item as Record<string, unknown>;
		if (typeof j.id !== 'string' || !j.id.trim() || junctionIds.has(j.id)) {
			return { ok: false, error: `Junction #${idx + 1} has an invalid or duplicate id.` };
		}
		if (
			typeof j.x !== 'number' ||
			!Number.isFinite(j.x) ||
			typeof j.y !== 'number' ||
			!Number.isFinite(j.y)
		) {
			return { ok: false, error: `Junction “${j.id}” has invalid coordinates.` };
		}
		junctionIds.add(j.id);
		junctions.push({
			id: j.id,
			x: Math.round(j.x),
			y: Math.round(j.y)
		});
	}

	function validateEndpoint(ep: unknown, context: string): WireEndpoint | null {
		if (!ep || typeof ep !== 'object' || Array.isArray(ep)) return null;
		const e = ep as Record<string, unknown>;
		if (e.type === 'junction') {
			if (typeof e.junctionId === 'string' && junctionIds.has(e.junctionId)) {
				return { type: 'junction', junctionId: e.junctionId };
			}
			return null;
		}
		if (e.type === 'terminal') {
			if (typeof e.componentId !== 'string' || typeof e.terminalId !== 'string') return null;
			const comp = components.find((c) => c.id === e.componentId);
			if (!comp) return null;
			const validTerms = getComponentTerminals(comp);
			if (!validTerms.some((t) => t.id === e.terminalId)) return null;
			return { type: 'terminal', componentId: e.componentId, terminalId: e.terminalId };
		}
		void context;
		return null;
	}

	const wireIds = new Set<string>();
	const wires: CircuitWire[] = [];
	for (const [idx, item] of raw.wires.entries()) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			return { ok: false, error: `Wire #${idx + 1} is invalid.` };
		}
		const w = item as Record<string, unknown>;
		if (typeof w.id !== 'string' || !w.id.trim() || wireIds.has(w.id)) {
			return { ok: false, error: `Wire #${idx + 1} has an invalid or duplicate id.` };
		}
		const from = validateEndpoint(w.from, `wire ${w.id} from`);
		const to = validateEndpoint(w.to, `wire ${w.id} to`);
		if (!from || !to || endpointsEqual(from, to)) {
			return { ok: false, error: `Wire “${w.id}” references missing or identical endpoints.` };
		}
		wireIds.add(w.id);
		wires.push({
			id: w.id,
			from,
			to,
			bend: w.bend === 'vh' ? 'vh' : 'hv'
		});
	}

	const rawScope =
		raw.scope && typeof raw.scope === 'object' && !Array.isArray(raw.scope)
			? (raw.scope as Record<string, unknown>)
			: {};
	const rawSim =
		raw.simulation && typeof raw.simulation === 'object' && !Array.isArray(raw.simulation)
			? (raw.simulation as Record<string, unknown>)
			: {};

	function sanitizeChannel(ch: unknown): ScopeChannelTarget {
		if (!ch || typeof ch !== 'object' || Array.isArray(ch)) return { kind: 'none' };
		const c = ch as Record<string, unknown>;
		if (
			(c.kind === 'component_voltage' ||
				c.kind === 'component_current' ||
				c.kind === 'probe_voltage') &&
			typeof c.componentId === 'string' &&
			componentIds.has(c.componentId)
		) {
			return {
				kind: c.kind,
				componentId: c.componentId,
				label: typeof c.label === 'string' ? c.label.slice(0, 60) : undefined
			};
		}
		if (
			c.kind === 'node_voltage' &&
			typeof c.componentId === 'string' &&
			typeof c.terminalId === 'string' &&
			componentIds.has(c.componentId)
		) {
			return {
				kind: 'node_voltage',
				componentId: c.componentId,
				terminalId: c.terminalId,
				label: typeof c.label === 'string' ? c.label.slice(0, 60) : undefined
			};
		}
		return { kind: 'none' };
	}

	const timeSpanSec =
		typeof rawScope.timeSpanSec === 'number' &&
		Number.isFinite(rawScope.timeSpanSec) &&
		rawScope.timeSpanSec >= 0.001 &&
		rawScope.timeSpanSec <= 120
			? rawScope.timeSpanSec
			: 5;

	const dtSec =
		typeof rawSim.dtSec === 'number' &&
		Number.isFinite(rawSim.dtSec) &&
		rawSim.dtSec >= 1e-6 &&
		rawSim.dtSec <= 0.1
			? rawSim.dtSec
			: 0.002;

	const sampleIntervalSec =
		typeof rawSim.sampleIntervalSec === 'number' &&
		Number.isFinite(rawSim.sampleIntervalSec) &&
		rawSim.sampleIntervalSec >= dtSec &&
		rawSim.sampleIntervalSec <= 1
			? rawSim.sampleIntervalSec
			: Math.max(dtSec, timeSpanSec / 500);

	const playbackSpeed =
		typeof rawSim.playbackSpeed === 'number' &&
		Number.isFinite(rawSim.playbackSpeed) &&
		rawSim.playbackSpeed >= 0.0005 &&
		rawSim.playbackSpeed <= 20
			? rawSim.playbackSpeed
			: 1;

	const doc: CircuitDocument = {
		schemaVersion: 1,
		id: raw.id.trim(),
		title: raw.title.trim(),
		question: typeof raw.question === 'string' ? raw.question.slice(0, 300) : '',
		instruction: typeof raw.instruction === 'string' ? raw.instruction.slice(0, 400) : '',
		explanation: typeof raw.explanation === 'string' ? raw.explanation.slice(0, 600) : '',
		suggestedChange:
			typeof raw.suggestedChange === 'string' ? raw.suggestedChange.slice(0, 400) : '',
		exampleId: typeof raw.exampleId === 'string' ? raw.exampleId.slice(0, 80) : undefined,
		components,
		junctions,
		wires,
		scope: {
			channel1: sanitizeChannel(rawScope.channel1),
			channel2: sanitizeChannel(rawScope.channel2),
			timeSpanSec,
			verticalScaleMode: rawScope.verticalScaleMode === 'fixed' ? 'fixed' : 'auto',
			channel1Range:
				Array.isArray(rawScope.channel1Range) &&
				rawScope.channel1Range.length === 2 &&
				typeof rawScope.channel1Range[0] === 'number' &&
				typeof rawScope.channel1Range[1] === 'number' &&
				rawScope.channel1Range[0] < rawScope.channel1Range[1]
					? [rawScope.channel1Range[0], rawScope.channel1Range[1]]
					: [-1, 6],
			channel2Range:
				Array.isArray(rawScope.channel2Range) &&
				rawScope.channel2Range.length === 2 &&
				typeof rawScope.channel2Range[0] === 'number' &&
				typeof rawScope.channel2Range[1] === 'number' &&
				rawScope.channel2Range[0] < rawScope.channel2Range[1]
					? [rawScope.channel2Range[0], rawScope.channel2Range[1]]
					: [-0.001, 0.006]
		},
		simulation: {
			dtSec,
			sampleIntervalSec,
			playbackSpeed
		}
	};

	return { ok: true, doc };
}

export function exportCircuitJson(doc: CircuitDocument): string {
	return JSON.stringify(doc, null, 2) + '\n';
}

export function importCircuitJson(
	rawText: string
): { ok: true; doc: CircuitDocument } | { ok: false; error: string } {
	if (typeof rawText !== 'string') {
		return { ok: false, error: 'Circuit import must be text.' };
	}
	const byteLength = new TextEncoder().encode(rawText).byteLength;
	if (byteLength > CIRCUIT_LIMITS.MAX_IMPORT_BYTES) {
		return {
			ok: false,
			error: `Circuit file exceeds the ${Math.round(CIRCUIT_LIMITS.MAX_IMPORT_BYTES / 1024)} KiB limit.`
		};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawText);
	} catch {
		return { ok: false, error: 'File is not valid JSON.' };
	}
	return validateCircuitDocument(parsed);
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(b64: string): Uint8Array {
	const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
	const padLen = (4 - (padded.length % 4)) % 4;
	const binary = atob(padded + '='.repeat(padLen));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/**
 * Encode a CircuitDocument into a compact URL parameter string, enforcing size limits.
 */
export function encodeShareUrl(
	doc: CircuitDocument,
	originAndPath = 'https://www.suvroghosh.in/blog/visualizations/circuit-bench'
): { ok: true; param: string; url: string } | { ok: false; error: string } {
	const compact = JSON.stringify(doc);
	const compressed = zlibSync(strToU8(compact), { level: 9 });
	const param = `z1.${bytesToBase64Url(compressed)}`;
	const url = `${originAndPath}?circuit=${param}`;
	if (url.length > CIRCUIT_LIMITS.MAX_SHARE_URL_LENGTH) {
		return {
			ok: false,
			error: `This circuit exceeds the ${CIRCUIT_LIMITS.MAX_SHARE_URL_LENGTH}-character shareable URL limit. Export a circuit JSON file instead.`
		};
	}
	return { ok: true, param, url };
}

export function decodeShareUrlParam(
	param: string
): { ok: true; doc: CircuitDocument } | { ok: false; error: string } {
	if (!param || typeof param !== 'string') {
		return { ok: false, error: 'Empty circuit link parameter.' };
	}
	const trimmed = param.trim();
	if (trimmed.length > CIRCUIT_LIMITS.MAX_SHARE_URL_LENGTH) {
		return { ok: false, error: 'Share link exceeds the maximum permitted length.' };
	}
	try {
		if (trimmed.startsWith('z1.')) {
			const compressed = base64UrlToBytes(trimmed.slice(3));
			const decompressed = unzlibSync(compressed);
			if (decompressed.byteLength > CIRCUIT_LIMITS.MAX_IMPORT_BYTES) {
				return { ok: false, error: 'Decoded circuit exceeds maximum size.' };
			}
			return importCircuitJson(strFromU8(decompressed));
		}
		const bytes = base64UrlToBytes(trimmed);
		return importCircuitJson(strFromU8(bytes));
	} catch {
		return { ok: false, error: 'Share link could not be decoded.' };
	}
}

export function describeScopeChannel(doc: CircuitDocument, target: ScopeChannelTarget): string {
	if (target.kind === 'none') return 'Off';
	if (target.label) return target.label;
	const comp = doc.components.find((c) => c.id === target.componentId);
	const label = comp?.label ?? target.componentId;
	switch (target.kind) {
		case 'component_voltage':
			return `V(${label})`;
		case 'component_current':
			return `I(${label})`;
		case 'probe_voltage':
			return `Probe ${label}`;
		case 'node_voltage':
			return `V(${label}.${target.terminalId})`;
	}
}

export function getScopeChannelUnit(target: ScopeChannelTarget): 'V' | 'A' {
	return target.kind === 'component_current' ? 'A' : 'V';
}

/**
 * Export recorded waveform samples as CSV.
 */
export function exportWaveformCsv(doc: CircuitDocument, samples: ScopeSample[]): string {
	const ch1Name = describeScopeChannel(doc, doc.scope.channel1).replace(/,/g, ' ');
	const ch2Name = describeScopeChannel(doc, doc.scope.channel2).replace(/,/g, ' ');
	const ch1Unit = getScopeChannelUnit(doc.scope.channel1);
	const ch2Unit = getScopeChannelUnit(doc.scope.channel2);

	const header = `time_s,"${ch1Name} (${ch1Unit})","${ch2Name} (${ch2Unit})"`;
	const rows = samples.map((s) => {
		const t = s.timeSec.toFixed(6);
		const v1 = s.ch1 !== null && Number.isFinite(s.ch1) ? s.ch1.toPrecision(7) : '';
		const v2 = s.ch2 !== null && Number.isFinite(s.ch2) ? s.ch2.toPrecision(7) : '';
		return `${t},${v1},${v2}`;
	});
	return [header, ...rows].join('\n') + '\n';
}

function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function voltageToWireColor(
	voltage: number | undefined,
	enabled: boolean,
	maxRef = 5
): string {
	if (!enabled || voltage === undefined || !Number.isFinite(voltage)) {
		return '#B8BFC5';
	}
	const scale = Math.max(1, maxRef);
	const norm = Math.max(-1, Math.min(1, voltage / scale));
	if (Math.abs(norm) < 0.04) {
		return '#9EC985'; // Neutral ground reference colour
	}
	if (norm > 0) {
		// Positive voltage: warm amber/orange (#EF762F at full scale)
		return norm > 0.5 ? '#EF762F' : '#E59A54';
	}
	// Negative voltage: cool cyan/blue
	return norm < -0.5 ? '#5BA4CF' : '#7CB5D6';
}

/**
 * Export a standalone, escaped SVG schematic of the current circuit.
 */
export function exportSchematicSvg(
	doc: CircuitDocument,
	snapshot: SimulationSnapshot | null,
	options: { showVoltageColor?: boolean } = {}
): string {
	const gridPx = 28;
	const pad = 72;
	let minX = 2;
	let maxX = 18;
	let minY = 2;
	let maxY = 12;

	for (const c of doc.components) {
		minX = Math.min(minX, c.x - 3);
		maxX = Math.max(maxX, c.x + 3);
		minY = Math.min(minY, c.y - 3);
		maxY = Math.max(maxY, c.y + 3);
	}
	for (const j of doc.junctions) {
		minX = Math.min(minX, j.x - 1);
		maxX = Math.max(maxX, j.x + 1);
		minY = Math.min(minY, j.y - 1);
		maxY = Math.max(maxY, j.y + 1);
	}

	const width = Math.max(640, (maxX - minX) * gridPx + pad * 2);
	const height = Math.max(400, (maxY - minY) * gridPx + pad * 2);
	const toPxX = (gx: number) => pad + (gx - minX) * gridPx;
	const toPxY = (gy: number) => pad + (gy - minY) * gridPx;

	const wireElements: string[] = [];
	for (const wire of doc.wires) {
		const pts = getWirePolylineGridPoints(doc, wire);
		if (pts.length < 2) continue;
		const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toPxX(p.x)} ${toPxY(p.y)}`).join(' ');
		const v = snapshot?.wireVoltages[wire.id];
		const stroke = voltageToWireColor(v, options.showVoltageColor !== false, 5);
		wireElements.push(
			`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`
		);
	}

	const junctionElements = doc.junctions.map((j) => {
		const v = snapshot?.junctionVoltages[j.id];
		const fill = voltageToWireColor(v, options.showVoltageColor !== false, 5);
		return `<circle cx="${toPxX(j.x)}" cy="${toPxY(j.y)}" r="4.5" fill="${fill}" stroke="#0B0F12" stroke-width="1.5" />`;
	});

	const compElements = doc.components.map((c) => {
		const cx = toPxX(c.x);
		const cy = toPxY(c.y);
		const summary = escapeXml(formatComponentSummary(c));
		const meas = snapshot?.components[c.id];
		const subLabel =
			meas && c.kind !== 'ground'
				? escapeXml(
						`${formatMeasurement(meas.voltageDrop, 'V')} · ${formatMeasurement(meas.current, 'A')}`
					)
				: '';

		const terms = getComponentTerminals(c)
			.map((t) => {
				const pos = getTerminalGridPosition(c, t.id);
				if (!pos) return '';
				return `<circle cx="${toPxX(pos.x)}" cy="${toPxY(pos.y)}" r="3.5" fill="#F1EEE7" stroke="#0B0F12" stroke-width="1.5" />`;
			})
			.join('');

		return `<g>
			<rect x="${cx - 32}" y="${cy - 18}" width="64" height="36" rx="4" fill="#1B1E21" stroke="#F1EEE7" stroke-width="1.75" />
			<text x="${cx}" y="${cy - 24}" text-anchor="middle" fill="#F1EEE7" font-family="IBM Plex Mono, monospace" font-size="12" font-weight="600">${summary}</text>
			${subLabel ? `<text x="${cx}" y="${cy + 32}" text-anchor="middle" fill="#B8BFC5" font-family="IBM Plex Mono, monospace" font-size="10">${subLabel}</text>` : ''}
			${terms}
		</g>`;
	});

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
	<rect width="${width}" height="${height}" fill="#0B0F12" />
	<text x="24" y="32" fill="#F1EEE7" font-family="Archivo, Arial, sans-serif" font-size="16" font-weight="600">${escapeXml(doc.title)}</text>
	<text x="24" y="52" fill="#B8BFC5" font-family="IBM Plex Mono, monospace" font-size="12">Circuit Bench · t = ${snapshot ? snapshot.timeSec.toFixed(3) : '0.000'} s</text>
	${wireElements.join('\n\t')}
	${junctionElements.join('\n\t')}
	${compElements.join('\n\t')}
</svg>\n`;
}
