export interface MassPoint {
	x: number;
	count: number;
	probability: number;
	baselineCount: number;
	baselineProbability: number;
	modelProbability?: number;
}

/** Empirical point probabilities on shared support; no density/bin-width conversion. */
export function probabilityMassSeries(
	values: number[],
	baseline: number[] = [],
	model: { x: number; y: number }[] = [],
	maxSupport = 80
) {
	const observed = values.filter(Number.isFinite);
	const old = baseline.filter(Number.isFinite);
	const counts = new Map<number, number>();
	const oldCounts = new Map<number, number>();
	const modelMass = new Map<number, number>();
	for (const value of observed) counts.set(value, (counts.get(value) ?? 0) + 1);
	for (const value of old) oldCounts.set(value, (oldCounts.get(value) ?? 0) + 1);
	for (const point of model) {
		if (Number.isFinite(point.x) && Number.isFinite(point.y) && point.y >= 0)
			modelMass.set(point.x, (modelMass.get(point.x) ?? 0) + point.y);
	}
	const support = [...new Set([...counts.keys(), ...oldCounts.keys(), ...modelMass.keys()])];
	const all: MassPoint[] = support.map((x) => ({
		x,
		count: counts.get(x) ?? 0,
		probability: (counts.get(x) ?? 0) / Math.max(1, observed.length),
		baselineCount: oldCounts.get(x) ?? 0,
		baselineProbability: (oldCounts.get(x) ?? 0) / Math.max(1, old.length),
		modelProbability: modelMass.get(x)
	}));
	const limit = Math.max(1, Math.min(200, Math.floor(maxSupport)));
	// Keep the most probable support points, then put them back in numerical order.
	// Crucially, omitted points are never renormalized into the displayed masses.
	const points = all
		.sort(
			(a, b) =>
				b.probability +
					b.baselineProbability +
					(b.modelProbability ?? 0) -
					(a.probability + a.baselineProbability + (a.modelProbability ?? 0)) || a.x - b.x
		)
		.slice(0, limit)
		.sort((a, b) => a.x - b.x);
	const displayed = new Set(points.map((point) => point.x));
	const omitted = all.filter((point) => !displayed.has(point.x));
	return {
		points,
		supportCount: support.length,
		omittedProbability: omitted.reduce((sum, p) => sum + p.probability, 0),
		omittedBaselineProbability: omitted.reduce((sum, p) => sum + p.baselineProbability, 0),
		omittedModelProbability: omitted.reduce((sum, p) => sum + (p.modelProbability ?? 0), 0)
	};
}

export function isMassColumn(
	densityKind: string | undefined,
	columnType: string | undefined,
	values: number[]
) {
	return (
		densityKind === 'pmf' ||
		(columnType === 'integer' && values.length > 0 && values.every(Number.isInteger))
	);
}
