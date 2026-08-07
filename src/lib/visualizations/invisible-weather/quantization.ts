import type { AngleMode } from './types';

export const TAU = Math.PI * 2;

export function wrapAngle(angle: number): number {
	if (!Number.isFinite(angle)) return 0;
	return ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

export function angleStep(mode: AngleMode, x = 0, y = 0): number | null {
	if (mode === 'free') return null;
	if (mode === 'orthogonal') return Math.PI / 2;
	if (mode === 'hexagonal') return Math.PI / 3;
	if (mode === 'diagonal' || mode === 'soft') return Math.PI / 4;
	const parity = (Math.floor(x * 8) + Math.floor(y * 8)) & 1;
	return parity === 0 ? Math.PI / 2 : Math.PI / 4;
}

export function nearestQuantizedAngle(angle: number, step: number): number {
	if (!Number.isFinite(step) || step <= 0) return wrapAngle(angle);
	return wrapAngle(Math.round(wrapAngle(angle) / step) * step);
}

export function interpolateAngles(from: number, to: number, amount: number): number {
	const bounded = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0));
	const difference = wrapAngle(to - from);
	return wrapAngle(from + difference * bounded);
}

export function quantizeAngle(
	angle: number,
	mode: AngleMode,
	options: Readonly<{ x?: number; y?: number; softness?: number }> = {}
): number {
	const wrapped = wrapAngle(angle);
	const step = angleStep(mode, options.x, options.y);
	if (step === null) return wrapped;
	const target = nearestQuantizedAngle(wrapped, step);
	if (mode !== 'soft') return target;
	return interpolateAngles(wrapped, target, options.softness ?? 0.5);
}

export function isAngleMultiple(angle: number, step: number, tolerance = 1e-9): boolean {
	if (!Number.isFinite(angle) || !Number.isFinite(step) || step <= 0) return false;
	return Math.abs(wrapAngle(angle - nearestQuantizedAngle(angle, step))) <= tolerance;
}
