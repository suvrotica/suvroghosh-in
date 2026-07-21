import type { PigmentProperties } from './types';

export function hexToRgb(hex: string): [number, number, number] {
	const normalized = hex.trim().replace(/^#/, '');
	const expanded =
		normalized.length === 3
			? normalized
					.split('')
					.map((character) => character + character)
					.join('')
			: normalized;
	if (!/^[0-9a-f]{6}$/i.test(expanded)) return [0, 0, 0];
	return [0, 2, 4].map(
		(offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255
	) as [number, number, number];
}

export function srgbToLinear(value: number) {
	const finite = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
	return finite <= 0.04045 ? finite / 12.92 : ((finite + 0.055) / 1.055) ** 2.4;
}

export function colorToAbsorption(hex: string): [number, number, number] {
	return hexToRgb(hex).map((channel) => {
		const linear = Math.max(0.018, srgbToLinear(channel));
		return Math.min(4, Math.max(0.025, -Math.log(linear)));
	}) as [number, number, number];
}

function pigment(
	id: string,
	name: string,
	hex: `#${string}`,
	diffusion: number,
	granulation: number,
	staining: number,
	density: number
): PigmentProperties {
	return {
		id,
		name,
		hex,
		absorption: colorToAbsorption(hex),
		diffusion,
		granulation,
		staining,
		density
	};
}

export const PIGMENTS: readonly PigmentProperties[] = [
	pigment('ultramarine', 'Ultramarine', '#315a96', 1.08, 0.92, 0.35, 0.78),
	pigment('cobalt', 'Cobalt', '#3978a8', 1.02, 0.7, 0.38, 0.68),
	pigment('cerulean', 'Cerulean', '#4d98b5', 1.16, 0.62, 0.42, 0.58),
	pigment('viridian', 'Viridian', '#23766a', 0.86, 0.48, 0.72, 0.72),
	pigment('sap-green', 'Sap Green', '#607541', 0.92, 0.3, 0.65, 0.66),
	pigment('yellow-ochre', 'Yellow Ochre', '#b9853c', 0.72, 0.74, 0.44, 0.82),
	pigment('burnt-sienna', 'Burnt Sienna', '#9a4f35', 0.76, 0.62, 0.58, 0.88),
	pigment('burnt-umber', 'Burnt Umber', '#62463b', 0.68, 0.7, 0.55, 0.94),
	pigment('alizarin', 'Alizarin Crimson', '#9d2947', 1.04, 0.22, 0.9, 0.64),
	pigment('cadmium-red', 'Cadmium Red', '#c43b2f', 0.72, 0.42, 0.74, 0.86),
	pigment('indian-yellow', 'Indian Yellow', '#d79a29', 1.12, 0.18, 0.7, 0.56),
	pigment('paynes-grey', "Payne's Grey", '#354957', 0.82, 0.56, 0.7, 0.83),
	pigment('lamp-black', 'Lamp Black', '#26282b', 0.56, 0.84, 0.88, 1),
	pigment('titanium-white', 'Titanium White', '#eee9dc', 0.48, 0.32, 0.68, 1.08)
];

const pigmentMap = new Map(PIGMENTS.map((entry) => [entry.id, entry]));

export function getPigment(id: string) {
	return pigmentMap.get(id) ?? PIGMENTS[0];
}

export function customPigment(hex: string): PigmentProperties {
	return {
		id: 'custom',
		name: 'Custom pigment',
		hex: (/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#315a96') as `#${string}`,
		absorption: colorToAbsorption(hex),
		diffusion: 0.9,
		granulation: 0.45,
		staining: 0.58,
		density: 0.72
	};
}

export function mixAbsorption(
	first: readonly [number, number, number],
	second: readonly [number, number, number],
	amount: number
): [number, number, number] {
	const t = Math.min(1, Math.max(0, Number.isFinite(amount) ? amount : 0));
	return first.map((value, index) => value * (1 - t) + second[index] * t) as [
		number,
		number,
		number
	];
}
