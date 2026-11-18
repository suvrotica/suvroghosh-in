import { clamp, lerp, lerpHex } from './prng';
import type { Vec3 } from './types';

export interface AtmosphereSample {
	skyTopHex: string;
	skyHorizonHex: string;
	fogHex: string;
	fogDensity: number;
	sunPosition: Vec3;
	sunColorHex: string;
	sunIntensity: number;
	hemiSkyHex: string;
	hemiGroundHex: string;
	hemiIntensity: number;
	rimColorHex: string;
	rimIntensity: number;
	windowGlow: number; // 0..1+ interior warm illumination
	lanternGlow: number; // 0..1+ exterior street/chain lanterns
	starOpacity: number; // 0..1 night stars
	waterDeepHex: string;
	waterShallowHex: string;
}

interface Keyframe {
	hour: number;
	skyTop: string;
	skyHorizon: string;
	fog: string;
	fogDensity: number;
	sunColor: string;
	sunIntensity: number;
	hemiSky: string;
	hemiGround: string;
	hemiIntensity: number;
	rimColor: string;
	rimIntensity: number;
	windowGlow: number;
	lanternGlow: number;
	starOpacity: number;
	waterDeep: string;
	waterShallow: string;
}

const KEYFRAMES: Keyframe[] = [
	{
		hour: 0,
		skyTop: '#0b1124',
		skyHorizon: '#1c2947',
		fog: '#17223b',
		fogDensity: 0.0085,
		sunColor: '#7b99d4',
		sunIntensity: 0.55,
		hemiSky: '#354c7c',
		hemiGround: '#241c18',
		hemiIntensity: 0.62,
		rimColor: '#f5a94c',
		rimIntensity: 0.48,
		windowGlow: 1.25,
		lanternGlow: 1.35,
		starOpacity: 0.95,
		waterDeep: '#10283b',
		waterShallow: '#1f4d63'
	},
	{
		hour: 5.5,
		skyTop: '#24355c',
		skyHorizon: '#b97b7c',
		fog: '#7f6c7c',
		fogDensity: 0.0078,
		sunColor: '#f4a97b',
		sunIntensity: 1.05,
		hemiSky: '#8c9ec4',
		hemiGround: '#3d312a',
		hemiIntensity: 0.78,
		rimColor: '#ffd1a3',
		rimIntensity: 0.45,
		windowGlow: 0.72,
		lanternGlow: 0.8,
		starOpacity: 0.25,
		waterDeep: '#1d465e',
		waterShallow: '#3d7d90'
	},
	{
		hour: 9.25,
		skyTop: '#5c9cd1',
		skyHorizon: '#e8dfc9',
		fog: '#dfd9cb',
		fogDensity: 0.0052,
		sunColor: '#fff4dc',
		sunIntensity: 2.15,
		hemiSky: '#b7daf5',
		hemiGround: '#7a634c',
		hemiIntensity: 1.05,
		rimColor: '#cde4f7',
		rimIntensity: 0.42,
		windowGlow: 0.18,
		lanternGlow: 0.12,
		starOpacity: 0,
		waterDeep: '#24667d',
		waterShallow: '#48a9b5'
	},
	{
		hour: 13.5,
		skyTop: '#4c8ec9',
		skyHorizon: '#e5e2d3',
		fog: '#ddd9cc',
		fogDensity: 0.0048,
		sunColor: '#fff7e5',
		sunIntensity: 2.25,
		hemiSky: '#c2dff7',
		hemiGround: '#826a52',
		hemiIntensity: 1.1,
		rimColor: '#dcebf7',
		rimIntensity: 0.38,
		windowGlow: 0.14,
		lanternGlow: 0.08,
		starOpacity: 0,
		waterDeep: '#226880',
		waterShallow: '#4db3bd'
	},
	{
		hour: 16.75,
		skyTop: '#486fa3',
		skyHorizon: '#f0b882',
		fog: '#d8b493',
		fogDensity: 0.0062,
		sunColor: '#ffbe73',
		sunIntensity: 2.05,
		hemiSky: '#efb88b',
		hemiGround: '#5c4333',
		hemiIntensity: 0.92,
		rimColor: '#ffd296',
		rimIntensity: 0.56,
		windowGlow: 0.52,
		lanternGlow: 0.48,
		starOpacity: 0.02,
		waterDeep: '#21546b',
		waterShallow: '#49989e'
	},
	{
		hour: 19.1,
		skyTop: '#1c2a52',
		skyHorizon: '#9e6278',
		fog: '#473c5c',
		fogDensity: 0.0076,
		sunColor: '#de8a6f',
		sunIntensity: 0.85,
		hemiSky: '#636fa8',
		hemiGround: '#322522',
		hemiIntensity: 0.74,
		rimColor: '#f7ad5c',
		rimIntensity: 0.52,
		windowGlow: 1.08,
		lanternGlow: 1.15,
		starOpacity: 0.55,
		waterDeep: '#16364d',
		waterShallow: '#2c687c'
	},
	{
		hour: 22.0,
		skyTop: '#0d142b',
		skyHorizon: '#203054',
		fog: '#192540',
		fogDensity: 0.0084,
		sunColor: '#82a0db',
		sunIntensity: 0.58,
		hemiSky: '#3b5387',
		hemiGround: '#261e19',
		hemiIntensity: 0.64,
		rimColor: '#f5aa4e',
		rimIntensity: 0.5,
		windowGlow: 1.25,
		lanternGlow: 1.35,
		starOpacity: 0.92,
		waterDeep: '#11293d',
		waterShallow: '#215066'
	},
	{
		hour: 24.0,
		skyTop: '#0b1124',
		skyHorizon: '#1c2947',
		fog: '#17223b',
		fogDensity: 0.0085,
		sunColor: '#7b99d4',
		sunIntensity: 0.55,
		hemiSky: '#354c7c',
		hemiGround: '#241c18',
		hemiIntensity: 0.62,
		rimColor: '#f5a94c',
		rimIntensity: 0.48,
		windowGlow: 1.25,
		lanternGlow: 1.35,
		starOpacity: 0.95,
		waterDeep: '#10283b',
		waterShallow: '#1f4d63'
	}
];

export function computeAtmosphereAtTime(hours: number): AtmosphereSample {
	const h = ((hours % 24) + 24) % 24;
	let k0 = KEYFRAMES[0];
	let k1 = KEYFRAMES[KEYFRAMES.length - 1];
	for (let i = 0; i < KEYFRAMES.length - 1; i++) {
		if (h >= KEYFRAMES[i].hour && h <= KEYFRAMES[i + 1].hour) {
			k0 = KEYFRAMES[i];
			k1 = KEYFRAMES[i + 1];
			break;
		}
	}
	const span = Math.max(k1.hour - k0.hour, 1e-4);
	const t = clamp((h - k0.hour) / span, 0, 1);
	const smooth = t * t * (3 - 2 * t);

	// Sun/Moon arc across the diorama sky so shadows rake dramatically
	const isDay = h >= 5.75 && h <= 19.4;
	let azimuth: number;
	let elevation: number;
	if (isDay) {
		const dayU = (h - 5.75) / (19.4 - 5.75);
		azimuth = lerp(-1.15, 1.25, dayU);
		elevation = lerp(0.22, 1.08, Math.sin(dayU * Math.PI));
	} else {
		const nightH = h < 5.75 ? h + 24 : h;
		const nightU = (nightH - 19.4) / (29.75 - 19.4);
		azimuth = lerp(-0.85, 0.85, nightU);
		elevation = lerp(0.55, 0.92, Math.sin(nightU * Math.PI));
	}

	const r = 46;
	const sunY = Math.max(8.5, Math.sin(elevation) * r);
	const horiz = Math.cos(elevation) * r;
	const sunX = Math.sin(azimuth) * horiz;
	const sunZ = Math.cos(azimuth) * horiz * 0.85 + 10;

	return {
		skyTopHex: lerpHex(k0.skyTop, k1.skyTop, smooth),
		skyHorizonHex: lerpHex(k0.skyHorizon, k1.skyHorizon, smooth),
		fogHex: lerpHex(k0.fog, k1.fog, smooth),
		fogDensity: lerp(k0.fogDensity, k1.fogDensity, smooth),
		sunPosition: [sunX, sunY, sunZ],
		sunColorHex: lerpHex(k0.sunColor, k1.sunColor, smooth),
		sunIntensity: lerp(k0.sunIntensity, k1.sunIntensity, smooth),
		hemiSkyHex: lerpHex(k0.hemiSky, k1.hemiSky, smooth),
		hemiGroundHex: lerpHex(k0.hemiGround, k1.hemiGround, smooth),
		hemiIntensity: lerp(k0.hemiIntensity, k1.hemiIntensity, smooth),
		rimColorHex: lerpHex(k0.rimColor, k1.rimColor, smooth),
		rimIntensity: lerp(k0.rimIntensity, k1.rimIntensity, smooth),
		windowGlow: lerp(k0.windowGlow, k1.windowGlow, smooth),
		lanternGlow: lerp(k0.lanternGlow, k1.lanternGlow, smooth),
		starOpacity: lerp(k0.starOpacity, k1.starOpacity, smooth),
		waterDeepHex: lerpHex(k0.waterDeep, k1.waterDeep, smooth),
		waterShallowHex: lerpHex(k0.waterShallow, k1.waterShallow, smooth)
	};
}
