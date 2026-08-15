export type RayDiagramPoint = {
	step: number;
	t: number;
	distance: number;
	x: number;
	y: number;
	hit: boolean;
};

export const RAY_DIAGRAM_SAFETY = 0.82;
export const RAY_DIAGRAM_EPSILON = 0.02;
export const RAY_DIAGRAM_SPHERE = { x: 2.2, y: 0.25, radius: 1.25 } as const;
export const RAY_DIAGRAM_CAMERA = { x: -2.8, y: 1.2 } as const;

function length(x: number, y: number): number {
	return Math.hypot(x, y);
}

export function buildRayDiagramPoints(maxSteps = 8): readonly RayDiagramPoint[] {
	const toCentreX = RAY_DIAGRAM_SPHERE.x - RAY_DIAGRAM_CAMERA.x;
	const toCentreY = RAY_DIAGRAM_SPHERE.y - RAY_DIAGRAM_CAMERA.y;
	const directionLength = length(toCentreX, toCentreY);
	const directionX = toCentreX / directionLength;
	const directionY = toCentreY / directionLength;
	const points: RayDiagramPoint[] = [];
	let t = 0;

	for (let step = 0; step < maxSteps; step += 1) {
		const x = RAY_DIAGRAM_CAMERA.x + directionX * t;
		const y = RAY_DIAGRAM_CAMERA.y + directionY * t;
		const distance =
			length(x - RAY_DIAGRAM_SPHERE.x, y - RAY_DIAGRAM_SPHERE.y) - RAY_DIAGRAM_SPHERE.radius;
		const hit = distance < RAY_DIAGRAM_EPSILON;
		points.push({ step, t, distance, x, y, hit });
		if (hit) break;
		t += Math.max(distance * RAY_DIAGRAM_SAFETY, 0.01);
	}

	return points;
}

export const RAY_DIAGRAM_POINTS = buildRayDiagramPoints();

export function diagramX(worldX: number): number {
	return 270 + worldX * 42;
}

export function diagramY(worldY: number): number {
	return 164 - worldY * 42;
}

export function diagramRadius(worldDistance: number): number {
	return Math.max(0, worldDistance * 42);
}
