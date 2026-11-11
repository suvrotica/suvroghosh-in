import type { Mesh } from './config.ts';

/** The surface metric is dm² + ρ(m)² dθ², with m measured from the tip. */
export function surfaceRows(mesh: Mesh) {
	const { rows, columns, capRows, radius, length } = mesh;
	const dTheta = Math.PI / columns;
	const capAngle = Math.PI / (2 * capRows);
	const capWidth = radius * capAngle;
	const cylinderWidth = length / (rows - capRows);
	const joinWidth = (capWidth + cylinderWidth) / 2;

	return Array.from({ length: rows }, (_, row) => {
		const onCap = row < capRows;
		const angle = (row + 0.5) * capAngle;
		const crossRadius = onCap ? radius * Math.sin(angle) : radius;
		const z = onCap ? length + radius * Math.cos(angle) : (rows - row - 0.5) * cylinderWidth;
		// Integrate ρ across the cell to conserve diffusing signal, including at the
		// apex, where the north face has zero length.
		const cellAreaPerRadian = onCap
			? radius ** 2 * (Math.cos(row * capAngle) - Math.cos((row + 1) * capAngle))
			: radius * cylinderWidth;
		return {
			onCap,
			z,
			crossRadius,
			cellAreaPerRadian,
			dx: crossRadius * dTheta,
			northFace: row === 0 ? 0 : onCap ? radius * Math.sin(row * capAngle) : radius,
			southFace: row === rows - 1 ? 0 : onCap ? radius * Math.sin((row + 1) * capAngle) : radius,
			northWidth: row === capRows ? joinWidth : onCap ? capWidth : cylinderWidth,
			southWidth: row === capRows - 1 ? joinWidth : onCap ? capWidth : cylinderWidth
		};
	});
}
