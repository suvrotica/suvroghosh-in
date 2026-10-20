export interface DiagnosticPoint {
	readonly x: number;
	readonly y: number;
}

export function isPlottablePoint(point: DiagnosticPoint, logarithmic: boolean): boolean {
	return (
		Number.isFinite(point.x) &&
		Number.isFinite(point.y) &&
		(!logarithmic || (point.x > 0 && point.y > 0))
	);
}

/** Bounds are in plotting coordinates; logarithmic axes exclude zero rather than inventing epsilon data. */
export function diagnosticExtent(
	values: readonly number[],
	logarithmic: boolean
): [number, number] {
	const finite = values.filter((value) => Number.isFinite(value) && (!logarithmic || value > 0));
	if (!finite.length) return [0, 1];
	if (!logarithmic) return [Math.min(0, ...finite), Math.max(1, ...finite)];
	const transformed = finite.map(Math.log10);
	const minimum = Math.min(...transformed);
	const maximum = Math.max(...transformed);
	return minimum === maximum ? [minimum - 0.5, maximum + 0.5] : [minimum, maximum];
}
