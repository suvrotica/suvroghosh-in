export type PointerRect = Readonly<{
	left: number;
	top: number;
	width: number;
	height: number;
}>;

export type NormalizedShaderPointer = Readonly<{
	/** Normalized left-to-right coordinate. */
	x: number;
	/** Normalized bottom-to-top shader coordinate. */
	y: number;
	/** Normalized top-to-bottom DOM coordinate, retained for gesture logic. */
	domY: number;
}>;

export const RAY_MARCHING_DRAG_THRESHOLD_PX = 7;

function clampUnit(value: number): number {
	return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5));
}

/** Maps client coordinates through the measured DOM rectangle and flips Y for the shader. */
export function normalizeRayMarchingPointer(
	clientX: number,
	clientY: number,
	rect: PointerRect
): NormalizedShaderPointer {
	const width = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : 1;
	const height = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : 1;
	const left = Number.isFinite(rect.left) ? rect.left : 0;
	const top = Number.isFinite(rect.top) ? rect.top : 0;
	const x = clampUnit((clientX - left) / width);
	const domY = clampUnit((clientY - top) / height);
	return Object.freeze({ x, y: 1 - domY, domY });
}

export function shaderPointerInFramebuffer(
	pointer: NormalizedShaderPointer,
	backingWidth: number,
	backingHeight: number
): readonly [number, number] {
	const width = Number.isFinite(backingWidth) ? Math.max(1, backingWidth) : 1;
	const height = Number.isFinite(backingHeight) ? Math.max(1, backingHeight) : 1;
	return Object.freeze([pointer.x * width, pointer.y * height]);
}

export function isRayMarchingDrag(
	start: Readonly<{ clientX: number; clientY: number }>,
	current: Readonly<{ clientX: number; clientY: number }>,
	thresholdPx = RAY_MARCHING_DRAG_THRESHOLD_PX
): boolean {
	const threshold = Number.isFinite(thresholdPx) ? Math.max(0, thresholdPx) : 0;
	const deltaX = current.clientX - start.clientX;
	const deltaY = current.clientY - start.clientY;
	return deltaX * deltaX + deltaY * deltaY > threshold * threshold;
}
