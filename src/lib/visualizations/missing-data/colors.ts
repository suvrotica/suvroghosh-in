export type Colour = [number, number, number];
const TEAL: Colour = [87, 196, 184];
const IVORY: Colour = [238, 224, 184];
const CORAL: Colour = [245, 132, 110];

export function normalizeScore(value: number): number {
	return (value - 50) / 12;
}

/** Fixed 14 → 50 → 86 point scale; clipping affects colour, never analysis. */
export function matrixColor(value: number): Colour {
	const v = Math.max(-3, Math.min(3, Number.isFinite(value) ? normalizeScore(value) : 0));
	const a = v < 0 ? TEAL : IVORY;
	const b = v < 0 ? IVORY : CORAL;
	const t = v < 0 ? (v + 3) / 3 : v / 3;
	return a.map((channel, i) => Math.round(channel + (b[i] - channel) * t)) as Colour;
}
