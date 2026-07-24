import type { Complex } from './types';

export type RgbColor = {
	r: number;
	g: number;
	b: number;
	kind: 'finite' | 'zero' | 'pole' | 'undefined';
};

const tau = Math.PI * 2;

function fract(value: number): number {
	return value - Math.floor(value);
}

function hsvToRgb(hue: number, saturation: number, value: number) {
	const scaled = fract(hue) * 6;
	const sector = Math.floor(scaled);
	const fraction = scaled - sector;
	const p = value * (1 - saturation);
	const q = value * (1 - fraction * saturation);
	const t = value * (1 - (1 - fraction) * saturation);
	const channels = [
		[value, t, p],
		[q, value, p],
		[p, value, t],
		[p, q, value],
		[t, p, value],
		[value, p, q]
	][sector % 6];
	return { r: channels[0], g: channels[1], b: channels[2] };
}

export function hueFromPhase(phase: number): number {
	return fract(phase / tau + 1);
}

export function domainColor(value: Complex): RgbColor {
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		return { r: 0.18, g: 0.18, b: 0.2, kind: 'undefined' };
	}

	const magnitude = Math.hypot(value.re, value.im);
	const logMagnitude = Math.log(Math.max(magnitude, 1e-30));
	const logBand = fract(logMagnitude / Math.LN2);
	const magnitudeLineDistance = Math.min(logBand, 1 - logBand);
	const phase = Math.atan2(value.im, value.re);
	const phaseBand = fract(hueFromPhase(phase) * 12);
	const phaseLineDistance = Math.min(phaseBand, 1 - phaseBand);
	const lightnessBand = 0.78 + 0.16 * Math.cos(tau * logBand);
	const contour =
		(magnitudeLineDistance < 0.045 ? 0.62 : 1) * (phaseLineDistance < 0.022 ? 0.76 : 1);
	const base = hsvToRgb(hueFromPhase(phase), 0.84, lightnessBand * contour);

	if (logMagnitude < -16) {
		const fade = Math.max(0, Math.min(1, (logMagnitude + 22) / 6));
		return {
			r: base.r * fade,
			g: base.g * fade,
			b: base.b * fade + 0.025 * (1 - fade),
			kind: 'zero'
		};
	}

	if (logMagnitude > 16) {
		const fade = Math.max(0, Math.min(1, (logMagnitude - 16) / 6));
		return {
			r: base.r + (1 - base.r) * fade,
			g: base.g + (0.96 - base.g) * fade,
			b: base.b + (0.88 - base.b) * fade,
			kind: 'pole'
		};
	}

	return { ...base, kind: 'finite' };
}
