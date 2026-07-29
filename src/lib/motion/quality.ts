import type { ResolvedMotion } from './types';

export const AMBIENT_BACKING_PIXEL_BUDGET = {
	desktop: 4_000_000,
	compact: 1_250_000
} as const;

export const AMBIENT_FRAME_RATE_CAP = {
	gentle: 30,
	aliveDesktop: 60,
	aliveCompact: 45
} as const;

export function isCompactAmbientSurface(width: number, coarsePointer: boolean): boolean {
	return width < 768 || coarsePointer;
}

export function resolveAmbientFrameRate(
	motion: ResolvedMotion,
	width: number,
	coarsePointer: boolean
): number {
	if (motion === 'still') return 0;
	if (motion === 'gentle') return AMBIENT_FRAME_RATE_CAP.gentle;
	return isCompactAmbientSurface(width, coarsePointer)
		? AMBIENT_FRAME_RATE_CAP.aliveCompact
		: AMBIENT_FRAME_RATE_CAP.aliveDesktop;
}

export function resolveAmbientPixelRatio({
	width,
	height,
	devicePixelRatio,
	coarsePointer
}: {
	width: number;
	height: number;
	devicePixelRatio: number;
	coarsePointer: boolean;
}): number {
	const compact = isCompactAmbientSurface(width, coarsePointer);
	const deviceCap = compact ? 1.5 : 2;
	const pixelBudget = compact
		? AMBIENT_BACKING_PIXEL_BUDGET.compact
		: AMBIENT_BACKING_PIXEL_BUDGET.desktop;
	const cssPixels = Math.max(1, width) * Math.max(1, height);
	const budgetRatio = Math.sqrt(pixelBudget / cssPixels);
	const safeDeviceRatio =
		Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;

	return Math.min(safeDeviceRatio, deviceCap, budgetRatio);
}
