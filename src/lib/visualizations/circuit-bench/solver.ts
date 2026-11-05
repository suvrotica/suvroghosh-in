import {
	CIRCUIT_LIMITS,
	type CircuitComponent,
	type CircuitDiagnostic,
	type CircuitDocument,
	type ComponentMeasurement,
	type ReactiveState,
	type ScopeChannelTarget,
	type ScopeSample,
	type SimulationSnapshot,
	type SolverBatchResult,
	type WireEndpoint
} from './types';
import { endpointKey, getComponentTerminals } from './model';

/**
 * Evaluate source voltage at time tSec.
 */
export function evaluateSourceVoltage(component: CircuitComponent, timeSec: number): number {
	const p = component.params;
	switch (component.kind) {
		case 'dc_voltage':
			return p.voltage ?? 5;
		case 'sine_voltage': {
			const amp = p.amplitude ?? 5;
			const freq = p.frequency ?? 100;
			const offset = p.offset ?? 0;
			const phaseRad = ((p.phaseDeg ?? 0) * Math.PI) / 180;
			return offset + amp * Math.sin(2 * Math.PI * freq * timeSec + phaseRad);
		}
		case 'square_voltage': {
			const amp = p.amplitude ?? 5;
			const freq = p.frequency ?? 10;
			const offset = p.offset ?? 0;
			const duty = Math.min(0.95, Math.max(0.05, (p.dutyPercent ?? 50) / 100));
			if (freq <= 0) return offset + amp;
			const period = 1 / freq;
			const phase = ((timeSec % period) + period) % period;
			return offset + (phase < duty * period ? amp : -amp);
		}
		default:
			return 0;
	}
}

class DisjointSet {
	private parent = new Map<string, string>();

	add(key: string): void {
		if (!this.parent.has(key)) {
			this.parent.set(key, key);
		}
	}

	find(key: string): string {
		this.add(key);
		let curr = key;
		while (this.parent.get(curr) !== curr) {
			curr = this.parent.get(curr)!;
		}
		let walk = key;
		while (this.parent.get(walk) !== curr) {
			const next = this.parent.get(walk)!;
			this.parent.set(walk, curr);
			walk = next;
		}
		return curr;
	}

	union(a: string, b: string): void {
		const ra = this.find(a);
		const rb = this.find(b);
		if (ra !== rb) {
			this.parent.set(rb, ra);
		}
	}

	keys(): string[] {
		return [...this.parent.keys()];
	}
}

interface NetlistAnalysis {
	diagnostics: CircuitDiagnostic[];
	/** Map from endpointKey to electrical node index (0 = ground, 1..N = active nodes) */
	endpointToNode: Map<string, number>;
	nodeCount: number;
	activeComponents: CircuitComponent[];
}

/**
 * Build the electrical netlist from components, junctions, and wires, checking for
 * missing ground, floating terminals, ungrounded islands, and conflicting voltage loops.
 */
export function analyzeTopology(doc: CircuitDocument): NetlistAnalysis {
	const diagnostics: CircuitDiagnostic[] = [];

	if (
		doc.components.length > CIRCUIT_LIMITS.MAX_COMPONENTS ||
		doc.wires.length > CIRCUIT_LIMITS.MAX_WIRES ||
		doc.junctions.length > CIRCUIT_LIMITS.MAX_JUNCTIONS
	) {
		diagnostics.push({
			code: 'complexity_limit',
			severity: 'error',
			message: `Circuit exceeds solver complexity bounds (${CIRCUIT_LIMITS.MAX_COMPONENTS} components, ${CIRCUIT_LIMITS.MAX_WIRES} wires).`,
			affectedComponentIds: [],
			affectedLabels: []
		});
		return { diagnostics, endpointToNode: new Map(), nodeCount: 0, activeComponents: [] };
	}

	const nonGroundComponents = doc.components.filter((c) => c.kind !== 'ground');
	if (nonGroundComponents.length === 0) {
		diagnostics.push({
			code: 'empty_circuit',
			severity: 'error',
			message: 'Add components from the library and wire them to Ground to begin simulating.',
			affectedComponentIds: [],
			affectedLabels: []
		});
		return { diagnostics, endpointToNode: new Map(), nodeCount: 0, activeComponents: [] };
	}

	const grounds = doc.components.filter((c) => c.kind === 'ground');
	if (grounds.length === 0) {
		diagnostics.push({
			code: 'missing_ground',
			severity: 'error',
			message: 'Missing ground reference. Add a Ground (0 V) component and wire it to the circuit.',
			affectedComponentIds: [],
			affectedLabels: []
		});
		return { diagnostics, endpointToNode: new Map(), nodeCount: 0, activeComponents: [] };
	}

	const dsu = new DisjointSet();
	const wiredEndpoints = new Set<string>();

	for (const comp of doc.components) {
		for (const term of getComponentTerminals(comp)) {
			dsu.add(`terminal:${comp.id}:${term.id}`);
		}
	}
	for (const junc of doc.junctions) {
		dsu.add(`junction:${junc.id}`);
	}
	for (const wire of doc.wires) {
		const fk = endpointKey(wire.from);
		const tk = endpointKey(wire.to);
		wiredEndpoints.add(fk);
		wiredEndpoints.add(tk);
		dsu.union(fk, tk);
	}

	// Check that at least one ground is wired
	const wiredGrounds = grounds.filter((g) => wiredEndpoints.has(`terminal:${g.id}:A`));
	if (wiredGrounds.length === 0) {
		diagnostics.push({
			code: 'missing_ground',
			severity: 'error',
			message: `Ground component (${grounds.map((g) => g.label).join(', ')}) is not connected to any wire.`,
			affectedComponentIds: grounds.map((g) => g.id),
			affectedLabels: grounds.map((g) => g.label)
		});
		return { diagnostics, endpointToNode: new Map(), nodeCount: 0, activeComponents: [] };
	}

	// Unify all wired ground terminals into the single Ground reference root
	const groundRootKey = `terminal:${wiredGrounds[0].id}:A`;
	for (const g of wiredGrounds.slice(1)) {
		dsu.union(groundRootKey, `terminal:${g.id}:A`);
	}
	const groundRep = dsu.find(groundRootKey);

	// Check for unwired required terminals on components
	const floatingComps: CircuitComponent[] = [];
	const floatingDetails: string[] = [];

	for (const comp of nonGroundComponents) {
		const terms = getComponentTerminals(comp);
		if (comp.kind === 'switch_spdt') {
			const comWired = wiredEndpoints.has(`terminal:${comp.id}:common`);
			const aWired = wiredEndpoints.has(`terminal:${comp.id}:throwA`);
			const bWired = wiredEndpoints.has(`terminal:${comp.id}:throwB`);
			const activeThrow = comp.params.position === 'B' ? 'throwB' : 'throwA';
			const activeWired = activeThrow === 'throwB' ? bWired : aWired;
			if (!comWired || !activeWired) {
				floatingComps.push(comp);
				floatingDetails.push(
					`${comp.label} (${!comWired ? 'COM' : activeThrow === 'throwB' ? 'Throw B' : 'Throw A'})`
				);
			}
		} else {
			for (const t of terms) {
				const key = `terminal:${comp.id}:${t.id}`;
				if (!wiredEndpoints.has(key)) {
					floatingComps.push(comp);
					floatingDetails.push(`${comp.label} (${t.label})`);
				}
			}
		}
	}

	if (floatingComps.length > 0) {
		const uniqueComps = [...new Map(floatingComps.map((c) => [c.id, c])).values()];
		diagnostics.push({
			code: 'floating_node',
			severity: 'error',
			message: `Unconnected terminal at ${floatingDetails.join(', ')}. Connect every active component terminal to complete the circuit.`,
			affectedComponentIds: uniqueComps.map((c) => c.id),
			affectedLabels: uniqueComps.map((c) => c.label)
		});
		return { diagnostics, endpointToNode: new Map(), nodeCount: 0, activeComponents: [] };
	}

	// Assign node indices: 0 = ground, 1..N = non-ground nets
	const repToNode = new Map<string, number>();
	repToNode.set(groundRep, 0);
	let nextNode = 1;
	const endpointToNode = new Map<string, number>();

	for (const key of dsu.keys()) {
		if (!wiredEndpoints.has(key)) continue;
		const rep = dsu.find(key);
		if (!repToNode.has(rep)) {
			repToNode.set(rep, nextNode++);
		}
		endpointToNode.set(key, repToNode.get(rep)!);
	}

	const nodeCount = nextNode - 1;

	// Check that every electrical node has a path to Ground (0) through passive/source/switch branches
	// First check structural graph (treating switches as potentially conducting so an open switch in series with a grounded resistor doesn't false-trigger if the other side is grounded;
	// then check active graph where open switches are open).
	const adjActive = new Map<number, Set<number>>();
	const adjStructural = new Map<number, Set<number>>();
	for (let i = 0; i <= nodeCount; i += 1) {
		adjActive.set(i, new Set());
		adjStructural.set(i, new Set());
	}

	const addEdge = (map: Map<number, Set<number>>, u: number, v: number) => {
		map.get(u)?.add(v);
		map.get(v)?.add(u);
	};

	for (const comp of nonGroundComponents) {
		if (comp.kind === 'probe_voltage') continue;
		if (comp.kind === 'switch_spdt') {
			const nCom = endpointToNode.get(`terminal:${comp.id}:common`);
			const nA = endpointToNode.get(`terminal:${comp.id}:throwA`);
			const nB = endpointToNode.get(`terminal:${comp.id}:throwB`);
			if (nCom !== undefined && nA !== undefined) {
				addEdge(adjStructural, nCom, nA);
				if (comp.params.position !== 'B') addEdge(adjActive, nCom, nA);
			}
			if (nCom !== undefined && nB !== undefined) {
				addEdge(adjStructural, nCom, nB);
				if (comp.params.position === 'B') addEdge(adjActive, nCom, nB);
			}
			continue;
		}
		const terms = getComponentTerminals(comp);
		if (terms.length === 2) {
			const n1 = endpointToNode.get(`terminal:${comp.id}:${terms[0].id}`);
			const n2 = endpointToNode.get(`terminal:${comp.id}:${terms[1].id}`);
			if (n1 !== undefined && n2 !== undefined) {
				addEdge(adjStructural, n1, n2);
				if (comp.kind !== 'switch_spst' || comp.params.closed !== false) {
					addEdge(adjActive, n1, n2);
				}
			}
		}
	}

	// BFS from node 0 in structural graph
	const visitedStructural = new Set<number>([0]);
	const queue = [0];
	while (queue.length > 0) {
		const curr = queue.shift()!;
		for (const nb of adjStructural.get(curr) ?? []) {
			if (!visitedStructural.has(nb)) {
				visitedStructural.add(nb);
				queue.push(nb);
			}
		}
	}

	const ungroundedComps: CircuitComponent[] = [];
	for (const comp of nonGroundComponents) {
		for (const t of getComponentTerminals(comp)) {
			const n = endpointToNode.get(`terminal:${comp.id}:${t.id}`);
			if (n !== undefined && !visitedStructural.has(n)) {
				ungroundedComps.push(comp);
			}
		}
	}

	if (ungroundedComps.length > 0) {
		const unique = [...new Map(ungroundedComps.map((c) => [c.id, c])).values()];
		diagnostics.push({
			code: 'floating_node',
			severity: 'error',
			message: `Floating circuit island at ${unique.map((c) => c.label).join(', ')} has no electrical path to Ground.`,
			affectedComponentIds: unique.map((c) => c.id),
			affectedLabels: unique.map((c) => c.label)
		});
		return { diagnostics, endpointToNode, nodeCount, activeComponents: nonGroundComponents };
	}

	return {
		diagnostics,
		endpointToNode,
		nodeCount,
		activeComponents: nonGroundComponents
	};
}

/**
 * Solve linear system A * x = b using Gaussian elimination with partial pivoting.
 */
function solveLinearSystem(
	A: number[][],
	b: number[]
): { ok: true; x: number[] } | { ok: false; pivotIndex: number } {
	const n = b.length;
	if (n === 0) return { ok: true, x: [] };

	const M = A.map((row) => [...row]);
	const rhs = [...b];

	for (let col = 0; col < n; col += 1) {
		let maxRow = col;
		let maxVal = Math.abs(M[col][col]);
		for (let row = col + 1; row < n; row += 1) {
			const val = Math.abs(M[row][col]);
			if (val > maxVal) {
				maxVal = val;
				maxRow = row;
			}
		}

		if (maxVal < 1e-14) {
			return { ok: false, pivotIndex: col };
		}

		if (maxRow !== col) {
			const tmpRow = M[col];
			M[col] = M[maxRow];
			M[maxRow] = tmpRow;
			const tmpRhs = rhs[col];
			rhs[col] = rhs[maxRow];
			rhs[maxRow] = tmpRhs;
		}

		const pivot = M[col][col];
		for (let row = col + 1; row < n; row += 1) {
			const factor = M[row][col] / pivot;
			if (factor === 0) continue;
			for (let k = col; k < n; k += 1) {
				M[row][k] -= factor * M[col][k];
			}
			rhs[row] -= factor * rhs[col];
		}
	}

	const x = new Array<number>(n).fill(0);
	for (let row = n - 1; row >= 0; row -= 1) {
		let sum = rhs[row];
		for (let col = row + 1; col < n; col += 1) {
			sum -= M[row][col] * x[col];
		}
		x[row] = sum / M[row][row];
		if (!Number.isFinite(x[row]) || Math.abs(x[row]) > 1e12) {
			return { ok: false, pivotIndex: row };
		}
	}

	return { ok: true, x };
}

interface BranchEquation {
	component: CircuitComponent;
	nodeA: number;
	nodeB: number;
	kind: 'voltage_source' | 'closed_switch' | 'capacitor' | 'inductor';
}

/**
 * Check for conflicting ideal voltage loops (e.g. shorted voltage source, two different voltage sources in parallel,
 * or ideal voltage source in parallel with an initial-voltage capacitor at t = 0+).
 */
function checkVoltageConstraintLoops(
	branches: Array<{
		comp: CircuitComponent;
		nodeA: number;
		nodeB: number;
		voltage: number;
		strictAtZeroOnly?: boolean;
	}>,
	includeCapacitors: boolean
): CircuitDiagnostic | null {
	const filtered = branches.filter((b) => includeCapacitors || !b.strictAtZeroOnly);
	// Track spanning forest of voltage constraints with relative potential from root
	const parent = new Map<number, { parent: number; deltaV: number; via: CircuitComponent }>();

	function findRoot(node: number): {
		root: number;
		potentialFromRoot: number;
		path: CircuitComponent[];
	} {
		let curr = node;
		let totalV = 0;
		const path: CircuitComponent[] = [];
		while (parent.has(curr)) {
			const entry = parent.get(curr)!;
			totalV += entry.deltaV;
			path.push(entry.via);
			curr = entry.parent;
		}
		return { root: curr, potentialFromRoot: totalV, path };
	}

	for (const b of filtered) {
		if (b.nodeA === b.nodeB) {
			return {
				code: 'conflicting_sources',
				severity: 'error',
				message: `${b.comp.label} has both terminals shorted together in a direct wire loop.`,
				affectedComponentIds: [b.comp.id],
				affectedLabels: [b.comp.label]
			};
		}
		const rA = findRoot(b.nodeA);
		const rB = findRoot(b.nodeB);
		if (rA.root === rB.root) {
			// Cycle of ideal voltage constraints!
			const involved = [
				...new Map([b.comp, ...rA.path, ...rB.path].map((c) => [c.id, c])).values()
			];
			const expectedDiff = rA.potentialFromRoot - rB.potentialFromRoot;
			const mismatch = Math.abs(expectedDiff - b.voltage) > 1e-6;
			return {
				code: 'conflicting_sources',
				severity: 'error',
				message: mismatch
					? `Conflicting voltage loop involving ${involved.map((c) => c.label).join(', ')}. Ideal voltage sources or fixed-voltage branches cannot force different voltages across the same nodes.`
					: `Redundant ideal voltage loop involving ${involved.map((c) => c.label).join(', ')}. Add series resistance to make the branch currents uniquely solvable.`,
				affectedComponentIds: involved.map((c) => c.id),
				affectedLabels: involved.map((c) => c.label)
			};
		}
		// Merge rA.root into rB.root: V(nodeA) - V(nodeB) = b.voltage
		// Since V(nodeA) = V(rA.root) + rA.potentialFromRoot and V(nodeB) = V(rB.root) + rB.potentialFromRoot:
		// V(rA.root) - V(rB.root) = b.voltage - rA.potentialFromRoot + rB.potentialFromRoot
		parent.set(rA.root, {
			parent: rB.root,
			deltaV: b.voltage - rA.potentialFromRoot + rB.potentialFromRoot,
			via: b.comp
		});
	}

	return null;
}

/**
 * Compute signed currents along each individual wire segment using KCL on each electrical net's wire graph.
 */
function computeWireVoltagesAndCurrents(
	doc: CircuitDocument,
	endpointToNode: Map<string, number>,
	nodeVoltages: number[],
	terminalNetInjections: Map<string, number>
): {
	terminalVoltages: Record<string, number>;
	junctionVoltages: Record<string, number>;
	wireVoltages: Record<string, number>;
	wireCurrents: Record<string, number>;
} {
	const terminalVoltages: Record<string, number> = {};
	const junctionVoltages: Record<string, number> = {};
	const wireVoltages: Record<string, number> = {};
	const wireCurrents: Record<string, number> = {};

	const getV = (nodeIdx: number | undefined): number => {
		if (nodeIdx === undefined || nodeIdx === 0) return 0;
		return nodeVoltages[nodeIdx - 1] ?? 0;
	};

	for (const comp of doc.components) {
		for (const term of getComponentTerminals(comp)) {
			const key = `terminal:${comp.id}:${term.id}`;
			const shortKey = `${comp.id}:${term.id}`;
			terminalVoltages[shortKey] = getV(endpointToNode.get(key));
		}
	}

	for (const junc of doc.junctions) {
		const key = `junction:${junc.id}`;
		junctionVoltages[junc.id] = getV(endpointToNode.get(key));
	}

	// Group wires by their electrical node
	const wiresByNode = new Map<number, typeof doc.wires>();
	for (const wire of doc.wires) {
		const n = endpointToNode.get(endpointKey(wire.from)) ?? 0;
		wireVoltages[wire.id] = getV(n);
		if (!wiresByNode.has(n)) wiresByNode.set(n, []);
		wiresByNode.get(n)!.push(wire);
	}

	// For each net, solve a small resistive KCL problem on its wire graph to distribute terminal currents cleanly
	for (const [, netWires] of wiresByNode.entries()) {
		if (netWires.length === 0) continue;
		const endpoints: string[] = [];
		const epIndex = new Map<string, number>();
		const addEp = (ep: WireEndpoint) => {
			const k = endpointKey(ep);
			if (!epIndex.has(k)) {
				epIndex.set(k, endpoints.length);
				endpoints.push(k);
			}
		};
		for (const w of netWires) {
			addEp(w.from);
			addEp(w.to);
		}

		// Determine reference endpoint(s): any ground terminal on this net absorbs the slack current
		const groundEpIndices = endpoints
			.map((k, idx) => {
				if (!k.startsWith('terminal:')) return -1;
				const compId = k.split(':')[1];
				const comp = doc.components.find((c) => c.id === compId);
				return comp?.kind === 'ground' ? idx : -1;
			})
			.filter((idx) => idx >= 0);

		const refIndices = groundEpIndices.length > 0 ? new Set(groundEpIndices) : new Set([0]);
		const m = endpoints.length;
		const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
		const rhs = new Array<number>(m).fill(0);

		for (const w of netWires) {
			const u = epIndex.get(endpointKey(w.from))!;
			const v = epIndex.get(endpointKey(w.to))!;
			if (u === v) continue;
			A[u][u] += 1;
			A[v][v] += 1;
			A[u][v] -= 1;
			A[v][u] -= 1;
		}

		for (let i = 0; i < m; i += 1) {
			if (refIndices.has(i)) {
				for (let j = 0; j < m; j += 1) A[i][j] = 0;
				A[i][i] = 1;
				rhs[i] = 0;
			} else {
				rhs[i] = terminalNetInjections.get(endpoints[i]) ?? 0;
			}
		}

		const solved = solveLinearSystem(A, rhs);
		if (solved.ok) {
			for (const w of netWires) {
				const u = epIndex.get(endpointKey(w.from))!;
				const v = epIndex.get(endpointKey(w.to))!;
				const current = solved.x[u] - solved.x[v];
				wireCurrents[w.id] = Math.abs(current) < 1e-12 ? 0 : current;
			}
		} else {
			for (const w of netWires) wireCurrents[w.id] = 0;
		}
	}

	return {
		terminalVoltages,
		junctionVoltages,
		wireVoltages,
		wireCurrents
	};
}

/**
 * Evaluate the instantaneous circuit state at `timeSec` given the current reactive state
 * (capacitor voltages and inductor currents).
 * At t = 0, this uses each capacitor's configured `initialVoltage` (default 0 V) and each
 * inductor's configured `initialCurrent` (default 0 A) — never solving the final DC operating point first!
 */
export function evaluateCircuitAtInstant(
	doc: CircuitDocument,
	timeSec = 0,
	existingReactive?: Partial<ReactiveState>
): { ok: true; snapshot: SimulationSnapshot } | { ok: false; diagnostics: CircuitDiagnostic[] } {
	syncSimulationTimingToCircuit(doc);
	const topo = analyzeTopology(doc);
	if (topo.diagnostics.length > 0) {
		return { ok: false, diagnostics: topo.diagnostics };
	}

	const { endpointToNode, nodeCount, activeComponents } = topo;

	// Build list of voltage-constrained branches at this instant (sources + closed switches + capacitors)
	const constraintCheckList: Array<{
		comp: CircuitComponent;
		nodeA: number;
		nodeB: number;
		voltage: number;
		strictAtZeroOnly?: boolean;
	}> = [];

	const branches: BranchEquation[] = [];

	for (const comp of activeComponents) {
		if (
			comp.kind === 'dc_voltage' ||
			comp.kind === 'sine_voltage' ||
			comp.kind === 'square_voltage'
		) {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:pos`) ?? 0;
			const nodeB = endpointToNode.get(`terminal:${comp.id}:neg`) ?? 0;
			const v = evaluateSourceVoltage(comp, timeSec);
			constraintCheckList.push({ comp, nodeA, nodeB, voltage: v });
			branches.push({ component: comp, nodeA, nodeB, kind: 'voltage_source' });
		} else if (comp.kind === 'switch_spst' && comp.params.closed !== false) {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nodeB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			constraintCheckList.push({ comp, nodeA, nodeB, voltage: 0 });
			branches.push({ component: comp, nodeA, nodeB, kind: 'closed_switch' });
		} else if (comp.kind === 'switch_spdt') {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:common`) ?? 0;
			const activeTerm = comp.params.position === 'B' ? 'throwB' : 'throwA';
			const nodeB = endpointToNode.get(`terminal:${comp.id}:${activeTerm}`) ?? 0;
			constraintCheckList.push({ comp, nodeA, nodeB, voltage: 0 });
			branches.push({ component: comp, nodeA, nodeB, kind: 'closed_switch' });
		} else if (comp.kind === 'capacitor') {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nodeB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			const vCap =
				existingReactive?.capacitorVoltages?.[comp.id] ?? comp.params.initialVoltage ?? 0;
			constraintCheckList.push({ comp, nodeA, nodeB, voltage: vCap, strictAtZeroOnly: true });
			branches.push({ component: comp, nodeA, nodeB, kind: 'capacitor' });
		} else if (comp.kind === 'inductor') {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nodeB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			branches.push({ component: comp, nodeA, nodeB, kind: 'inductor' });
		}
	}

	const loopError = checkVoltageConstraintLoops(constraintCheckList, true);
	if (loopError) {
		return { ok: false, diagnostics: [loopError] };
	}

	const dim = nodeCount + branches.length;
	if (dim > CIRCUIT_LIMITS.MAX_MATRIX_DIMENSION) {
		return {
			ok: false,
			diagnostics: [
				{
					code: 'complexity_limit',
					severity: 'error',
					message: 'Circuit matrix dimension exceeds solver limit.',
					affectedComponentIds: [],
					affectedLabels: []
				}
			]
		};
	}

	const A = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
	const rhs = new Array<number>(dim).fill(0);

	// Track which nodes have conductive/voltage-constrained paths so nodes isolated behind an open switch
	// or between two inductors can be identified cleanly
	const nodeHasConductanceOrVoltage = new Array<boolean>(nodeCount + 1).fill(false);
	nodeHasConductanceOrVoltage[0] = true;

	// Stamp resistors
	for (const comp of activeComponents) {
		if (comp.kind === 'resistor') {
			const r = Math.max(1e-6, comp.params.resistance ?? 1000);
			const g = 1 / r;
			const nA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			nodeHasConductanceOrVoltage[nA] = true;
			nodeHasConductanceOrVoltage[nB] = true;
			if (nA > 0) A[nA - 1][nA - 1] += g;
			if (nB > 0) A[nB - 1][nB - 1] += g;
			if (nA > 0 && nB > 0) {
				A[nA - 1][nB - 1] -= g;
				A[nB - 1][nA - 1] -= g;
			}
		} else if (comp.kind === 'switch_spst' && comp.params.closed === false) {
			// Open switch: high-impedance open circuit bleed (1 TΩ) only so a component behind an open switch
			// resolves to its connected partner's reference voltage with 0.00 A current.
			const gOpen = 1e-14;
			const nA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			if (nA > 0) A[nA - 1][nA - 1] += gOpen;
			if (nB > 0) A[nB - 1][nB - 1] += gOpen;
			if (nA > 0 && nB > 0) {
				A[nA - 1][nB - 1] -= gOpen;
				A[nB - 1][nA - 1] -= gOpen;
			}
		} else if (comp.kind === 'switch_spdt') {
			// Inactive throw of SPDT switch also has open-circuit bleed
			const gOpen = 1e-14;
			const nCom = endpointToNode.get(`terminal:${comp.id}:common`) ?? 0;
			const inactiveTerm = comp.params.position === 'B' ? 'throwA' : 'throwB';
			const nInactive = endpointToNode.get(`terminal:${comp.id}:${inactiveTerm}`) ?? 0;
			if (nCom > 0) A[nCom - 1][nCom - 1] += gOpen;
			if (nInactive > 0) A[nInactive - 1][nInactive - 1] += gOpen;
			if (nCom > 0 && nInactive > 0) {
				A[nCom - 1][nInactive - 1] -= gOpen;
				A[nInactive - 1][nCom - 1] -= gOpen;
			}
		}
	}

	// Stamp branch equations
	for (const [bIdx, br] of branches.entries()) {
		const row = nodeCount + bIdx;
		const { nodeA, nodeB, component, kind } = br;

		// KCL contributions: branch current flows from nodeA to nodeB inside component
		if (nodeA > 0) A[nodeA - 1][row] += 1;
		if (nodeB > 0) A[nodeB - 1][row] -= 1;

		if (kind === 'voltage_source') {
			nodeHasConductanceOrVoltage[nodeA] = true;
			nodeHasConductanceOrVoltage[nodeB] = true;
			if (nodeA > 0) A[row][nodeA - 1] += 1;
			if (nodeB > 0) A[row][nodeB - 1] -= 1;
			rhs[row] = evaluateSourceVoltage(component, timeSec);
		} else if (kind === 'closed_switch') {
			nodeHasConductanceOrVoltage[nodeA] = true;
			nodeHasConductanceOrVoltage[nodeB] = true;
			if (nodeA > 0) A[row][nodeA - 1] += 1;
			if (nodeB > 0) A[row][nodeB - 1] -= 1;
			rhs[row] = 0;
		} else if (kind === 'capacitor') {
			nodeHasConductanceOrVoltage[nodeA] = true;
			nodeHasConductanceOrVoltage[nodeB] = true;
			const v0 =
				existingReactive?.capacitorVoltages?.[component.id] ?? component.params.initialVoltage ?? 0;
			if (nodeA > 0) A[row][nodeA - 1] += 1;
			if (nodeB > 0) A[row][nodeB - 1] -= 1;
			rhs[row] = v0;
		} else if (kind === 'inductor') {
			const i0 =
				existingReactive?.inductorCurrents?.[component.id] ?? component.params.initialCurrent ?? 0;
			// At the instantaneous evaluation, I_L = i0
			A[row][row] = 1;
			rhs[row] = i0;
		}
	}

	const solved = solveLinearSystem(A, rhs);
	if (!solved.ok) {
		const inductors = activeComponents.filter((c) => c.kind === 'inductor');
		if (inductors.length > 0) {
			return {
				ok: false,
				diagnostics: [
					{
						code: 'inductor_cutset',
						severity: 'error',
						message: `Inductor current path conflict involving ${inductors.map((c) => c.label).join(', ')}. Inductors in series or connected to an open switch must share a consistent current path.`,
						affectedComponentIds: inductors.map((c) => c.id),
						affectedLabels: inductors.map((c) => c.label)
					}
				]
			};
		}
		return {
			ok: false,
			diagnostics: [
				{
					code: 'singular_system',
					severity: 'error',
					message:
						'Singular circuit equations: check for floating subcircuits, ideal source loops, or open current paths.',
					affectedComponentIds: activeComponents.map((c) => c.id),
					affectedLabels: activeComponents.map((c) => c.label)
				}
			]
		};
	}

	const nodeVoltages = solved.x.slice(0, nodeCount);
	const branchCurrents = solved.x.slice(nodeCount);

	return buildSnapshotFromSolution(
		doc,
		timeSec,
		endpointToNode,
		activeComponents,
		branches,
		nodeVoltages,
		branchCurrents
	);
}

function buildSnapshotFromSolution(
	doc: CircuitDocument,
	timeSec: number,
	endpointToNode: Map<string, number>,
	activeComponents: CircuitComponent[],
	branches: BranchEquation[],
	nodeVoltages: number[],
	branchCurrents: number[]
): { ok: true; snapshot: SimulationSnapshot } | { ok: false; diagnostics: CircuitDiagnostic[] } {
	const getV = (nodeIdx: number | undefined): number => {
		if (!nodeIdx || nodeIdx <= 0) return 0;
		return nodeVoltages[nodeIdx - 1] ?? 0;
	};

	const branchCurrentByCompId = new Map<string, number>();
	for (const [bIdx, br] of branches.entries()) {
		branchCurrentByCompId.set(br.component.id, branchCurrents[bIdx] ?? 0);
	}

	const components: Record<string, ComponentMeasurement> = {};
	const terminalNetInjections = new Map<string, number>();
	const addInjection = (epKey: string, currentIntoNet: number) => {
		terminalNetInjections.set(epKey, (terminalNetInjections.get(epKey) ?? 0) + currentIntoNet);
	};

	const reactiveState: ReactiveState = {
		capacitorVoltages: {},
		capacitorCurrents: {},
		inductorCurrents: {},
		inductorVoltages: {}
	};

	for (const comp of doc.components) {
		if (comp.kind === 'ground') {
			components[comp.id] = {
				componentId: comp.id,
				terminalVoltages: { A: 0 },
				voltageDrop: 0,
				current: 0,
				power: 0
			};
			continue;
		}

		if (comp.kind === 'probe_voltage') {
			const vPos = getV(endpointToNode.get(`terminal:${comp.id}:pos`));
			const vNeg =
				comp.params.probeMode === 'differential'
					? getV(endpointToNode.get(`terminal:${comp.id}:neg`))
					: 0;
			const vDrop = vPos - vNeg;
			components[comp.id] = {
				componentId: comp.id,
				terminalVoltages:
					comp.params.probeMode === 'differential' ? { pos: vPos, neg: vNeg } : { pos: vPos },
				voltageDrop: vDrop,
				current: 0,
				power: 0
			};
			continue;
		}

		if (comp.kind === 'switch_spdt') {
			const vCom = getV(endpointToNode.get(`terminal:${comp.id}:common`));
			const vA = getV(endpointToNode.get(`terminal:${comp.id}:throwA`));
			const vB = getV(endpointToNode.get(`terminal:${comp.id}:throwB`));
			const activeTerm = comp.params.position === 'B' ? 'throwB' : 'throwA';
			const vActive = activeTerm === 'throwB' ? vB : vA;
			const current = branchCurrentByCompId.get(comp.id) ?? 0;
			addInjection(`terminal:${comp.id}:common`, -current);
			addInjection(`terminal:${comp.id}:${activeTerm}`, current);
			components[comp.id] = {
				componentId: comp.id,
				terminalVoltages: { common: vCom, throwA: vA, throwB: vB },
				voltageDrop: vCom - vActive,
				current,
				power: 0
			};
			continue;
		}

		const terms = getComponentTerminals(comp);
		const t1 = terms[0].id;
		const t2 = terms[1].id;
		const k1 = `terminal:${comp.id}:${t1}`;
		const k2 = `terminal:${comp.id}:${t2}`;
		const v1 = getV(endpointToNode.get(k1));
		const v2 = getV(endpointToNode.get(k2));
		const vDrop = v1 - v2;

		let current = 0;
		let storedEnergy: number | undefined;

		if (comp.kind === 'resistor') {
			const r = Math.max(1e-6, comp.params.resistance ?? 1000);
			current = vDrop / r;
		} else if (comp.kind === 'switch_spst') {
			current = comp.params.closed !== false ? (branchCurrentByCompId.get(comp.id) ?? 0) : 0;
		} else if (
			comp.kind === 'dc_voltage' ||
			comp.kind === 'sine_voltage' ||
			comp.kind === 'square_voltage'
		) {
			// In MNA, the branch current unknown enters nodeA (pos) from the wire network and exits nodeB (neg).
			// Conventional current delivered out of the + terminal corresponds to -I_mna,
			// while current from + to - through the branch is +I_mna.
			// For sources, let `current` represent the conventional current delivered by the source (+ terminal out into circuit),
			// which is -branchCurrent, so a 5 V supply driving a 1 kΩ resistor reports +5.00 mA!
			const mnaCurrent = branchCurrentByCompId.get(comp.id) ?? 0;
			current = -mnaCurrent;
			// Passive sign convention per types.ts: positive power = dissipated/absorbed, negative power = supplied
			const rawPower = -vDrop * current;
			// Since `current` leaves `pos` into the wire net and enters `neg` from the wire net:
			addInjection(k1, current);
			addInjection(k2, -current);
			components[comp.id] = {
				componentId: comp.id,
				terminalVoltages: { [t1]: v1, [t2]: v2 },
				voltageDrop: Math.abs(vDrop) < 1e-13 ? 0 : vDrop,
				current: Math.abs(current) < 1e-13 ? 0 : current,
				power: Math.abs(rawPower) < 1e-15 ? 0 : rawPower
			};
			continue;
		} else if (comp.kind === 'capacitor') {
			current = branchCurrentByCompId.get(comp.id) ?? 0;
			const c = Math.max(1e-12, comp.params.capacitance ?? 0.001);
			storedEnergy = 0.5 * c * vDrop * vDrop;
			reactiveState.capacitorVoltages[comp.id] = vDrop;
			reactiveState.capacitorCurrents[comp.id] = current;
		} else if (comp.kind === 'inductor') {
			current = branchCurrentByCompId.get(comp.id) ?? 0;
			const l = Math.max(1e-9, comp.params.inductance ?? 0.1);
			storedEnergy = 0.5 * l * current * current;
			reactiveState.inductorCurrents[comp.id] = current;
			reactiveState.inductorVoltages[comp.id] = vDrop;
		}

		if (!Number.isFinite(vDrop) || !Number.isFinite(current)) {
			return {
				ok: false,
				diagnostics: [
					{
						code: 'non_finite_result',
						severity: 'error',
						message: `Non-finite numerical result at ${comp.label}. Check for extreme component values.`,
						affectedComponentIds: [comp.id],
						affectedLabels: [comp.label]
					}
				]
			};
		}

		// Passive current flows from t1 (A) into component and out of t2 (B) into wire net
		addInjection(k1, -current);
		addInjection(k2, current);

		components[comp.id] = {
			componentId: comp.id,
			terminalVoltages: { [t1]: v1, [t2]: v2 },
			voltageDrop: Math.abs(vDrop) < 1e-13 ? 0 : vDrop,
			current: Math.abs(current) < 1e-13 ? 0 : current,
			power: Math.abs(vDrop * current) < 1e-15 ? 0 : vDrop * current,
			storedEnergy
		};
	}

	const wireData = computeWireVoltagesAndCurrents(
		doc,
		endpointToNode,
		nodeVoltages,
		terminalNetInjections
	);

	return {
		ok: true,
		snapshot: {
			timeSec,
			terminalVoltages: wireData.terminalVoltages,
			junctionVoltages: wireData.junctionVoltages,
			wireVoltages: wireData.wireVoltages,
			wireCurrents: wireData.wireCurrents,
			components,
			reactiveState
		}
	};
}

/**
 * Compute characteristic reactive time constants and maximum AC source frequency in `doc`
 * so the transient integrator can avoid trapezoidal ringing (dt > 2*tau) and Nyquist aliasing.
 */
export function computeCircuitTimeScales(doc: Pick<CircuitDocument, 'components'>): {
	minTauSec: number;
	maxFreqHz: number;
	maxSafeDtSec: number;
} {
	const resistors = doc.components.filter((c) => c.kind === 'resistor');
	const capacitors = doc.components.filter((c) => c.kind === 'capacitor');
	const inductors = doc.components.filter((c) => c.kind === 'inductor');

	let maxFreqHz = 0;
	for (const comp of doc.components) {
		if (comp.kind === 'sine_voltage') {
			maxFreqHz = Math.max(maxFreqHz, comp.params.frequency ?? 100);
		} else if (comp.kind === 'square_voltage') {
			maxFreqHz = Math.max(maxFreqHz, comp.params.frequency ?? 10);
		}
	}

	let minTauSec = Infinity;
	if (inductors.length > 0 && capacitors.length > 0) {
		const minL = Math.min(...inductors.map((l) => Math.max(1e-9, l.params.inductance ?? 0.1)));
		const minC = Math.min(...capacitors.map((c) => Math.max(1e-12, c.params.capacitance ?? 0.001)));
		const maxR =
			resistors.length > 0
				? Math.max(...resistors.map((r) => Math.max(1e-6, r.params.resistance ?? 1000)))
				: 0;
		const alpha = maxR / (2 * minL);
		const omega0 = 1 / Math.sqrt(minL * minC);
		const maxEigenMag = alpha + Math.sqrt(alpha * alpha + omega0 * omega0);
		minTauSec = Math.min(minTauSec, 1 / maxEigenMag);
	} else if (resistors.length > 0 && capacitors.length > 0) {
		const minR = Math.min(...resistors.map((r) => Math.max(1e-6, r.params.resistance ?? 1000)));
		const minC = Math.min(...capacitors.map((c) => Math.max(1e-12, c.params.capacitance ?? 0.001)));
		minTauSec = Math.min(minTauSec, minR * minC);
	} else if (resistors.length > 0 && inductors.length > 0) {
		const maxR = Math.max(...resistors.map((r) => Math.max(1e-6, r.params.resistance ?? 1000)));
		const minL = Math.min(...inductors.map((l) => Math.max(1e-9, l.params.inductance ?? 0.1)));
		minTauSec = Math.min(minTauSec, minL / maxR);
	}

	const freqDtLimit = maxFreqHz > 0 ? 1 / (40 * maxFreqHz) : Infinity;
	const tauDtLimit = Number.isFinite(minTauSec) ? 0.25 * minTauSec : Infinity;
	const maxSafeDtSec = Math.min(freqDtLimit, tauDtLimit);

	return { minTauSec, maxFreqHz, maxSafeDtSec };
}

/**
 * Synchronise simulation `dtSec` and `sampleIntervalSec` when an AC source frequency
 * requires finer sampling to prevent Nyquist aliasing.
 */
export function syncSimulationTimingToCircuit(doc: CircuitDocument): void {
	const { maxFreqHz } = computeCircuitTimeScales(doc);
	if (maxFreqHz > 0) {
		const maxAllowedDt = Math.max(1e-7, 1 / (40 * maxFreqHz));
		const maxAllowedSample = Math.max(maxAllowedDt, 1 / (20 * maxFreqHz));
		if (doc.simulation.dtSec > maxAllowedDt) {
			doc.simulation.dtSec = maxAllowedDt;
		}
		if (doc.simulation.sampleIntervalSec > maxAllowedSample) {
			doc.simulation.sampleIntervalSec = maxAllowedSample;
		}
	}
}

/**
 * Execute a single elementary MNA transient step of size `dt` using `'trap'` or `'be'`.
 */
function stepSingleTransientMna(
	doc: CircuitDocument,
	prevSnapshot: SimulationSnapshot,
	dt: number,
	method: 'trap' | 'be' = 'trap'
): { ok: true; snapshot: SimulationSnapshot } | { ok: false; diagnostics: CircuitDiagnostic[] } {
	const topo = analyzeTopology(doc);
	if (topo.diagnostics.length > 0) {
		return { ok: false, diagnostics: topo.diagnostics };
	}

	const { endpointToNode, nodeCount, activeComponents } = topo;
	const nextTime = prevSnapshot.timeSec + dt;

	const constraintCheckList: Array<{
		comp: CircuitComponent;
		nodeA: number;
		nodeB: number;
		voltage: number;
	}> = [];
	const branches: BranchEquation[] = [];

	for (const comp of activeComponents) {
		if (
			comp.kind === 'dc_voltage' ||
			comp.kind === 'sine_voltage' ||
			comp.kind === 'square_voltage'
		) {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:pos`) ?? 0;
			const nodeB = endpointToNode.get(`terminal:${comp.id}:neg`) ?? 0;
			const v = evaluateSourceVoltage(comp, nextTime);
			constraintCheckList.push({ comp, nodeA, nodeB, voltage: v });
			branches.push({ component: comp, nodeA, nodeB, kind: 'voltage_source' });
		} else if (comp.kind === 'switch_spst' && comp.params.closed !== false) {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nodeB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			constraintCheckList.push({ comp, nodeA, nodeB, voltage: 0 });
			branches.push({ component: comp, nodeA, nodeB, kind: 'closed_switch' });
		} else if (comp.kind === 'switch_spdt') {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:common`) ?? 0;
			const activeTerm = comp.params.position === 'B' ? 'throwB' : 'throwA';
			const nodeB = endpointToNode.get(`terminal:${comp.id}:${activeTerm}`) ?? 0;
			constraintCheckList.push({ comp, nodeA, nodeB, voltage: 0 });
			branches.push({ component: comp, nodeA, nodeB, kind: 'closed_switch' });
		} else if (comp.kind === 'capacitor') {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nodeB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			branches.push({ component: comp, nodeA, nodeB, kind: 'capacitor' });
		} else if (comp.kind === 'inductor') {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nodeB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			branches.push({ component: comp, nodeA, nodeB, kind: 'inductor' });
		}
	}

	const loopError = checkVoltageConstraintLoops(constraintCheckList, false);
	if (loopError) {
		return { ok: false, diagnostics: [loopError] };
	}

	const dim = nodeCount + branches.length;
	const A = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
	const rhs = new Array<number>(dim).fill(0);

	// Stamp resistors and open-switch bleed
	for (const comp of activeComponents) {
		if (comp.kind === 'resistor') {
			const r = Math.max(1e-6, comp.params.resistance ?? 1000);
			const g = 1 / r;
			const nA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			if (nA > 0) A[nA - 1][nA - 1] += g;
			if (nB > 0) A[nB - 1][nB - 1] += g;
			if (nA > 0 && nB > 0) {
				A[nA - 1][nB - 1] -= g;
				A[nB - 1][nA - 1] -= g;
			}
		} else if (comp.kind === 'switch_spst' && comp.params.closed === false) {
			const gOpen = 1e-14;
			const nA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			if (nA > 0) A[nA - 1][nA - 1] += gOpen;
			if (nB > 0) A[nB - 1][nB - 1] += gOpen;
			if (nA > 0 && nB > 0) {
				A[nA - 1][nB - 1] -= gOpen;
				A[nB - 1][nA - 1] -= gOpen;
			}
		} else if (comp.kind === 'switch_spdt') {
			const gOpen = 1e-14;
			const nCom = endpointToNode.get(`terminal:${comp.id}:common`) ?? 0;
			const inactiveTerm = comp.params.position === 'B' ? 'throwA' : 'throwB';
			const nInactive = endpointToNode.get(`terminal:${comp.id}:${inactiveTerm}`) ?? 0;
			if (nCom > 0) A[nCom - 1][nCom - 1] += gOpen;
			if (nInactive > 0) A[nInactive - 1][nInactive - 1] += gOpen;
			if (nCom > 0 && nInactive > 0) {
				A[nCom - 1][nInactive - 1] -= gOpen;
				A[nInactive - 1][nCom - 1] -= gOpen;
			}
		}
	}

	const prevState = prevSnapshot.reactiveState;

	for (const [bIdx, br] of branches.entries()) {
		const row = nodeCount + bIdx;
		const { nodeA, nodeB, component, kind } = br;

		if (nodeA > 0) A[nodeA - 1][row] += 1;
		if (nodeB > 0) A[nodeB - 1][row] -= 1;

		if (kind === 'voltage_source') {
			if (nodeA > 0) A[row][nodeA - 1] += 1;
			if (nodeB > 0) A[row][nodeB - 1] -= 1;
			rhs[row] = evaluateSourceVoltage(component, nextTime);
		} else if (kind === 'closed_switch') {
			if (nodeA > 0) A[row][nodeA - 1] += 1;
			if (nodeB > 0) A[row][nodeB - 1] -= 1;
			rhs[row] = 0;
		} else if (kind === 'capacitor') {
			const c = Math.max(1e-12, component.params.capacitance ?? 0.001);
			const vPrev =
				prevState.capacitorVoltages[component.id] ?? component.params.initialVoltage ?? 0;
			const iPrev = prevState.capacitorCurrents[component.id] ?? 0;
			if (nodeA > 0) A[row][nodeA - 1] += 1;
			if (nodeB > 0) A[row][nodeB - 1] -= 1;
			if (method === 'be') {
				// Backward Euler: V_{n+1} - (dt/C) I_{n+1} = V_n
				A[row][row] = -(dt / c);
				rhs[row] = vPrev;
			} else {
				// Trapezoidal: V_{n+1} - (dt / 2C) I_{n+1} = V_n + (dt / 2C) I_n
				const halfDtOverC = dt / (2 * c);
				A[row][row] = -halfDtOverC;
				rhs[row] = vPrev + halfDtOverC * iPrev;
			}
		} else if (kind === 'inductor') {
			const l = Math.max(1e-9, component.params.inductance ?? 0.1);
			const iPrev =
				prevState.inductorCurrents[component.id] ?? component.params.initialCurrent ?? 0;
			const vPrev = prevState.inductorVoltages[component.id] ?? 0;
			if (nodeA > 0) A[row][nodeA - 1] += 1;
			if (nodeB > 0) A[row][nodeB - 1] -= 1;
			if (method === 'be') {
				// Backward Euler: V_{n+1} - (L/dt) I_{n+1} = -(L/dt) I_n
				const rEq = l / dt;
				A[row][row] = -rEq;
				rhs[row] = -rEq * iPrev;
			} else {
				// Trapezoidal: V_{n+1} - (2L/dt) I_{n+1} = -( (2L/dt) I_n + V_n )
				const rEq = (2 * l) / dt;
				A[row][row] = -rEq;
				rhs[row] = -(rEq * iPrev + vPrev);
			}
		}
	}

	const solved = solveLinearSystem(A, rhs);
	if (!solved.ok) {
		return {
			ok: false,
			diagnostics: [
				{
					code: 'singular_system',
					severity: 'error',
					message:
						'Singular transient system: check for floating subcircuits or conflicting voltage/current loops.',
					affectedComponentIds: activeComponents.map((c) => c.id),
					affectedLabels: activeComponents.map((c) => c.label)
				}
			]
		};
	}

	const nodeVoltages = solved.x.slice(0, nodeCount);
	const branchCurrents = solved.x.slice(nodeCount);

	return buildSnapshotFromSolution(
		doc,
		nextTime,
		endpointToNode,
		activeComponents,
		branches,
		nodeVoltages,
		branchCurrents
	);
}

/**
 * Advance a reactive MNA circuit over `dt` using binary exponentiation (repeated squaring)
 * of the 2nd-order Trapezoidal MNA companion operator at step size `h = chunkDt / 2^p`.
 * This achieves 2^p (up to 16,777,216) genuine Trapezoidal sub-steps in O(p) tiny matrix
 * multiplications, preserving phase and amplitude accuracy on high-Q / small-C RLC oscillators
 * (e.g. C = 1 pF, L = 100 mH) as well as monotonic decay on stiff RC/RL networks.
 */
function stepBinaryExponentiatedMna(
	doc: CircuitDocument,
	prevSnapshot: SimulationSnapshot,
	dt: number,
	maxSafeDtSec: number,
	maxFreqHz: number
): { ok: true; snapshot: SimulationSnapshot } | { ok: false; diagnostics: CircuitDiagnostic[] } {
	const topo = analyzeTopology(doc);
	if (topo.diagnostics.length > 0) {
		return { ok: false, diagnostics: topo.diagnostics };
	}

	const { endpointToNode, nodeCount, activeComponents } = topo;
	const nextTime = prevSnapshot.timeSec + dt;

	const constraintCheckList: Array<{
		comp: CircuitComponent;
		nodeA: number;
		nodeB: number;
		voltage: number;
	}> = [];
	const branches: BranchEquation[] = [];

	for (const comp of activeComponents) {
		if (
			comp.kind === 'dc_voltage' ||
			comp.kind === 'sine_voltage' ||
			comp.kind === 'square_voltage'
		) {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:pos`) ?? 0;
			const nodeB = endpointToNode.get(`terminal:${comp.id}:neg`) ?? 0;
			const v = evaluateSourceVoltage(comp, nextTime);
			constraintCheckList.push({ comp, nodeA, nodeB, voltage: v });
			branches.push({ component: comp, nodeA, nodeB, kind: 'voltage_source' });
		} else if (comp.kind === 'switch_spst' && comp.params.closed !== false) {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nodeB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			constraintCheckList.push({ comp, nodeA, nodeB, voltage: 0 });
			branches.push({ component: comp, nodeA, nodeB, kind: 'closed_switch' });
		} else if (comp.kind === 'switch_spdt') {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:common`) ?? 0;
			const activeTerm = comp.params.position === 'B' ? 'throwB' : 'throwA';
			const nodeB = endpointToNode.get(`terminal:${comp.id}:${activeTerm}`) ?? 0;
			constraintCheckList.push({ comp, nodeA, nodeB, voltage: 0 });
			branches.push({ component: comp, nodeA, nodeB, kind: 'closed_switch' });
		} else if (comp.kind === 'capacitor') {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nodeB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			branches.push({ component: comp, nodeA, nodeB, kind: 'capacitor' });
		} else if (comp.kind === 'inductor') {
			const nodeA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nodeB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			branches.push({ component: comp, nodeA, nodeB, kind: 'inductor' });
		}
	}

	const loopError = checkVoltageConstraintLoops(constraintCheckList, false);
	if (loopError) {
		return { ok: false, diagnostics: [loopError] };
	}

	const reactiveBranches: Array<{
		row: number;
		nodeA: number;
		nodeB: number;
		component: CircuitComponent;
		kind: 'capacitor' | 'inductor';
	}> = [];
	const sourceBranches: Array<{ row: number; component: CircuitComponent }> = [];

	for (const [bIdx, br] of branches.entries()) {
		const row = nodeCount + bIdx;
		if (br.kind === 'capacitor' || br.kind === 'inductor') {
			reactiveBranches.push({
				row,
				nodeA: br.nodeA,
				nodeB: br.nodeB,
				component: br.component,
				kind: br.kind
			});
		} else if (br.kind === 'voltage_source') {
			sourceBranches.push({ row, component: br.component });
		}
	}

	const K = reactiveBranches.length;
	if (K === 0) {
		return stepSingleTransientMna(doc, prevSnapshot, dt, 'trap');
	}

	const acChunks = maxFreqHz > 0 ? Math.min(32, Math.max(1, Math.ceil(dt * maxFreqHz * 40))) : 1;
	const chunkDt = dt / acChunks;
	const ratio = chunkDt / Math.max(1e-18, maxSafeDtSec);
	const p = Math.min(28, Math.max(4, Math.ceil(Math.log2(Math.max(1, ratio))) + 12));
	const h = chunkDt / Math.pow(2, p);
	const dTau = Math.pow(2, -p);

	const dim = nodeCount + branches.length;
	const A = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));

	for (const comp of activeComponents) {
		if (comp.kind === 'resistor') {
			const r = Math.max(1e-6, comp.params.resistance ?? 1000);
			const g = 1 / r;
			const nA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			if (nA > 0) A[nA - 1][nA - 1] += g;
			if (nB > 0) A[nB - 1][nB - 1] += g;
			if (nA > 0 && nB > 0) {
				A[nA - 1][nB - 1] -= g;
				A[nB - 1][nA - 1] -= g;
			}
		} else if (comp.kind === 'switch_spst' && comp.params.closed === false) {
			const gOpen = 1e-14;
			const nA = endpointToNode.get(`terminal:${comp.id}:A`) ?? 0;
			const nB = endpointToNode.get(`terminal:${comp.id}:B`) ?? 0;
			if (nA > 0) A[nA - 1][nA - 1] += gOpen;
			if (nB > 0) A[nB - 1][nB - 1] += gOpen;
			if (nA > 0 && nB > 0) {
				A[nA - 1][nB - 1] -= gOpen;
				A[nB - 1][nA - 1] -= gOpen;
			}
		} else if (comp.kind === 'switch_spdt') {
			const gOpen = 1e-14;
			const nCom = endpointToNode.get(`terminal:${comp.id}:common`) ?? 0;
			const inactiveTerm = comp.params.position === 'B' ? 'throwA' : 'throwB';
			const nInactive = endpointToNode.get(`terminal:${comp.id}:${inactiveTerm}`) ?? 0;
			if (nCom > 0) A[nCom - 1][nCom - 1] += gOpen;
			if (nInactive > 0) A[nInactive - 1][nInactive - 1] += gOpen;
			if (nCom > 0 && nInactive > 0) {
				A[nCom - 1][nInactive - 1] -= gOpen;
				A[nInactive - 1][nCom - 1] -= gOpen;
			}
		}
	}

	for (const [bIdx, br] of branches.entries()) {
		const row = nodeCount + bIdx;
		const { nodeA, nodeB, component, kind } = br;
		if (nodeA > 0) {
			A[nodeA - 1][row] += 1;
			A[row][nodeA - 1] += 1;
		}
		if (nodeB > 0) {
			A[nodeB - 1][row] -= 1;
			A[row][nodeB - 1] -= 1;
		}
		if (kind === 'capacitor') {
			const c = Math.max(1e-12, component.params.capacitance ?? 0.001);
			A[row][row] = -(h / (2 * c));
		} else if (kind === 'inductor') {
			const l = Math.max(1e-9, component.params.inductance ?? 0.1);
			A[row][row] = -((2 * l) / h);
		}
	}

	const stateDim = 2 * K;
	const extractNextState = (x: number[]): number[] => {
		const out = new Array<number>(stateDim).fill(0);
		const getV = (n: number) => (n > 0 ? (x[n - 1] ?? 0) : 0);
		for (let r = 0; r < K; r += 1) {
			const rb = reactiveBranches[r];
			const vDrop = getV(rb.nodeA) - getV(rb.nodeB);
			const iBr = x[rb.row] ?? 0;
			if (rb.kind === 'capacitor') {
				out[2 * r] = vDrop;
				out[2 * r + 1] = iBr;
			} else {
				out[2 * r] = iBr;
				out[2 * r + 1] = vDrop;
			}
		}
		return out;
	};

	const baseT = Array.from({ length: stateDim }, () => new Array<number>(stateDim).fill(0));
	for (let r = 0; r < K; r += 1) {
		const rb = reactiveBranches[r];
		if (rb.kind === 'capacitor') {
			const c = Math.max(1e-12, rb.component.params.capacitance ?? 0.001);
			const halfHOverC = h / (2 * c);

			// Basis column 2*r: vPrev = 1
			const rhsV = new Array<number>(dim).fill(0);
			rhsV[rb.row] = 1;
			const solV = solveLinearSystem(A, rhsV);
			if (!solV.ok) return stepSingleTransientMna(doc, prevSnapshot, dt, 'be');
			const colV = extractNextState(solV.x);
			for (let i = 0; i < stateDim; i += 1) {
				baseT[i][2 * r] = colV[i];
				baseT[i][2 * r + 1] = colV[i] * halfHOverC;
			}
		} else {
			const l = Math.max(1e-9, rb.component.params.inductance ?? 0.1);
			const rEq = (2 * l) / h;

			// Basis column 2*r+1: vPrev = 1 (rhs = -1)
			const rhsV = new Array<number>(dim).fill(0);
			rhsV[rb.row] = -1;
			const solV = solveLinearSystem(A, rhsV);
			if (!solV.ok) return stepSingleTransientMna(doc, prevSnapshot, dt, 'be');
			const colV = extractNextState(solV.x);
			for (let i = 0; i < stateDim; i += 1) {
				baseT[i][2 * r] = colV[i] * rEq;
				baseT[i][2 * r + 1] = colV[i];
			}
		}
	}

	const srcColumns: number[][] = [];
	for (const sb of sourceBranches) {
		const rhsS = new Array<number>(dim).fill(0);
		rhsS[sb.row] = 1;
		const solS = solveLinearSystem(A, rhsS);
		if (!solS.ok) return stepSingleTransientMna(doc, prevSnapshot, dt, 'be');
		srcColumns.push(extractNextState(solS.x));
	}

	const augDim = stateDim + 3;
	const mulAugMat = (M1: number[][], M2: number[][]): number[][] =>
		M1.map((row) =>
			M2[0].map((_, j) => {
				let sum = 0;
				for (let k = 0; k < augDim; k += 1) sum += row[k] * M2[k][j];
				return sum;
			})
		);
	const mulAugVec = (M: number[][], v: number[]): number[] =>
		M.map((row) => {
			let sum = 0;
			for (let k = 0; k < augDim; k += 1) sum += row[k] * v[k];
			return sum;
		});

	const prevState = prevSnapshot.reactiveState;
	let s = new Array<number>(stateDim).fill(0);
	for (let r = 0; r < K; r += 1) {
		const rb = reactiveBranches[r];
		const id = rb.component.id;
		if (rb.kind === 'capacitor') {
			s[2 * r] = prevState.capacitorVoltages[id] ?? rb.component.params.initialVoltage ?? 0;
			s[2 * r + 1] = prevState.capacitorCurrents[id] ?? 0;
		} else {
			s[2 * r] = prevState.inductorCurrents[id] ?? rb.component.params.initialCurrent ?? 0;
			s[2 * r + 1] = prevState.inductorVoltages[id] ?? 0;
		}
	}

	for (let chunk = 0; chunk < acChunks; chunk += 1) {
		const t0 = prevSnapshot.timeSec + chunk * chunkDt;
		const tMid = t0 + 0.5 * chunkDt;
		const t1 = t0 + chunkDt;

		const g0 = new Array<number>(stateDim).fill(0);
		const g1 = new Array<number>(stateDim).fill(0);
		const g2 = new Array<number>(stateDim).fill(0);

		for (let idx = 0; idx < sourceBranches.length; idx += 1) {
			const comp = sourceBranches[idx].component;
			const v0 = evaluateSourceVoltage(comp, t0);
			const vMid = evaluateSourceVoltage(comp, tMid);
			const v1 = evaluateSourceVoltage(comp, t1);
			// 3-point Lagrange quadratic interpolant on normalized chunk time tau in [0, 1]
			let c0 = v0;
			let c1 = -3 * v0 + 4 * vMid - v1;
			let c2 = 2 * v0 - 4 * vMid + 2 * v1;
			if (comp.kind === 'square_voltage') {
				c0 = v1;
				c1 = 0;
				c2 = 0;
			}
			const col = srcColumns[idx];
			for (let i = 0; i < stateDim; i += 1) {
				g0[i] += col[i] * c0;
				g1[i] += col[i] * c1;
				g2[i] += col[i] * c2;
			}
		}

		// Build augmented transition matrix M on [s, 1, tau, tau^2]^T for sub-step tau -> tau + dTau
		const M = Array.from({ length: augDim }, () => new Array<number>(augDim).fill(0));
		for (let i = 0; i < stateDim; i += 1) {
			for (let j = 0; j < stateDim; j += 1) {
				M[i][j] = baseT[i][j];
			}
			M[i][stateDim] = g0[i] + g1[i] * dTau + g2[i] * dTau * dTau;
			M[i][stateDim + 1] = g1[i] + 2 * g2[i] * dTau;
			M[i][stateDim + 2] = g2[i];
		}
		M[stateDim][stateDim] = 1;
		M[stateDim + 1][stateDim] = dTau;
		M[stateDim + 1][stateDim + 1] = 1;
		M[stateDim + 2][stateDim] = dTau * dTau;
		M[stateDim + 2][stateDim + 1] = 2 * dTau;
		M[stateDim + 2][stateDim + 2] = 1;

		let u = [...s, 1, 0, 0];
		let curM = M;
		const isLastChunk = chunk === acChunks - 1;
		for (let bit = 0; bit < p; bit += 1) {
			if (isLastChunk) {
				// Accumulate 1 + 2 + ... + 2^(p-1) = 2^p - 1 steps so the final h-step can be solved for full node/wire state
				u = mulAugVec(curM, u);
			}
			if (!isLastChunk || bit < p - 1) {
				curM = mulAugMat(curM, curM);
			}
		}
		if (!isLastChunk) {
			u = mulAugVec(curM, u);
		}
		s = u.slice(0, stateDim);
	}

	const penultimateState: ReactiveState = {
		capacitorVoltages: { ...prevState.capacitorVoltages },
		capacitorCurrents: { ...prevState.capacitorCurrents },
		inductorCurrents: { ...prevState.inductorCurrents },
		inductorVoltages: { ...prevState.inductorVoltages }
	};
	for (let r = 0; r < K; r += 1) {
		const rb = reactiveBranches[r];
		const id = rb.component.id;
		if (rb.kind === 'capacitor') {
			penultimateState.capacitorVoltages[id] = s[2 * r];
			penultimateState.capacitorCurrents[id] = s[2 * r + 1];
		} else {
			penultimateState.inductorCurrents[id] = s[2 * r];
			penultimateState.inductorVoltages[id] = s[2 * r + 1];
		}
	}

	const penultimateSnapshot: SimulationSnapshot = {
		...prevSnapshot,
		timeSec: nextTime - h,
		reactiveState: penultimateState
	};

	return stepSingleTransientMna(doc, penultimateSnapshot, h, 'trap');
}

/**
 * Advance the circuit by `dt` from `prevSnapshot` using the 2nd-order implicit Trapezoidal Rule
 * when well-resolved (`dt <= maxSafeDtSec`), or binary-exponentiated Trapezoidal sub-stepping
 * when `dt > maxSafeDtSec` so both stiff RC/RL networks and high-frequency RLC oscillators remain exact.
 */
export function stepTransientMna(
	doc: CircuitDocument,
	prevSnapshot: SimulationSnapshot,
	dt: number,
	method: 'trap' | 'be' = 'trap'
): { ok: true; snapshot: SimulationSnapshot } | { ok: false; diagnostics: CircuitDiagnostic[] } {
	if (method === 'be') {
		return stepSingleTransientMna(doc, prevSnapshot, dt, 'be');
	}

	const { maxSafeDtSec, maxFreqHz } = computeCircuitTimeScales(doc);
	if (dt <= maxSafeDtSec * 1.0001) {
		return stepSingleTransientMna(doc, prevSnapshot, dt, 'trap');
	}

	return stepBinaryExponentiatedMna(doc, prevSnapshot, dt, maxSafeDtSec, maxFreqHz);
}

export function extractScopeChannelValue(
	doc: CircuitDocument,
	snapshot: SimulationSnapshot,
	target: ScopeChannelTarget
): number | null {
	if (target.kind === 'none') return null;
	if (target.kind === 'node_voltage') {
		const v = snapshot.terminalVoltages[`${target.componentId}:${target.terminalId}`];
		return v !== undefined && Number.isFinite(v) ? v : null;
	}
	const meas = snapshot.components[target.componentId];
	if (!meas) return null;
	if (target.kind === 'component_current') {
		return meas.current;
	}
	return meas.voltageDrop;
}

export function snapshotToScopeSample(
	doc: CircuitDocument,
	snapshot: SimulationSnapshot
): ScopeSample {
	return {
		timeSec: snapshot.timeSec,
		ch1: extractScopeChannelValue(doc, snapshot, doc.scope.channel1),
		ch2: extractScopeChannelValue(doc, snapshot, doc.scope.channel2)
	};
}

/**
 * Run a bounded batch of transient steps, separating simulation step `dtSec` from display sample interval `sampleIntervalSec`.
 */
export function runSimulationBatch(
	doc: CircuitDocument,
	startSnapshot: SimulationSnapshot | null,
	requestedSteps: number,
	lastSampleTimeSec = -Infinity
): SolverBatchResult {
	const clampedSteps = Math.min(
		CIRCUIT_LIMITS.MAX_STEPS_PER_BATCH,
		Math.max(0, Math.floor(requestedSteps))
	);

	let currentSnapshot = startSnapshot;
	const samples: ScopeSample[] = [];
	let lastRecorded = lastSampleTimeSec;

	if (!currentSnapshot) {
		const init = evaluateCircuitAtInstant(doc, 0);
		if (!init.ok) {
			return {
				ok: false,
				diagnostics: init.diagnostics,
				snapshot: null,
				samples: [],
				stepsExecuted: 0
			};
		}
		currentSnapshot = init.snapshot;
		samples.push(snapshotToScopeSample(doc, currentSnapshot));
		lastRecorded = currentSnapshot.timeSec;
	}

	syncSimulationTimingToCircuit(doc);
	const dt = Math.max(1e-7, Math.min(0.1, doc.simulation.dtSec));
	const sampleInterval = Math.max(dt, doc.simulation.sampleIntervalSec);

	for (let step = 0; step < clampedSteps; step += 1) {
		const res = stepTransientMna(doc, currentSnapshot, dt, 'trap');
		if (!res.ok) {
			return {
				ok: false,
				diagnostics: res.diagnostics,
				snapshot: null,
				samples,
				stepsExecuted: step
			};
		}
		currentSnapshot = res.snapshot;
		if (
			currentSnapshot.timeSec - lastRecorded >= sampleInterval - 1e-12 ||
			step === clampedSteps - 1
		) {
			samples.push(snapshotToScopeSample(doc, currentSnapshot));
			lastRecorded = currentSnapshot.timeSec;
		}
	}

	return {
		ok: true,
		diagnostics: [],
		snapshot: currentSnapshot,
		samples,
		stepsExecuted: clampedSteps
	};
}
