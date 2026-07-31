import type { CityAppearance } from './types';

export interface CityPalette {
	canvas: string;
	paper: string;
	paperEdge: string;
	ink: string;
	inkSoft: string;
	grid: string;
	parcel: readonly [string, string, string, string];
	openGround: string;
	courtyard: string;
	plaster: readonly [string, string, string, string, string];
	roof: readonly [string, string, string, string];
	mint: string;
	oxide: string;
	yellow: string;
	road: string;
	lane: string;
	footpath: string;
	steel: string;
	pond: string;
	pondDeep: string;
	algae: string;
	drain: string;
	tarpaulin: string;
	tree: string;
	treeDark: string;
	sand: string;
	wood: string;
	glass: string;
	selection: string;
	current: string;
	propagation: string;
	valid: string;
	conditional: string;
	invalid: string;
	entropy: readonly [string, string, string, string, string];
	shadow: string;
	wash: string;
}

const paper: CityPalette = {
	canvas: '#171813',
	paper: '#cbbf9f',
	paperEdge: '#5c5545',
	ink: '#28251f',
	inkSoft: 'rgba(40, 37, 31, 0.48)',
	grid: 'rgba(40, 37, 31, 0.18)',
	parcel: ['#cfc09e', '#c7b997', '#d4c6a6', '#c2b18d'],
	openGround: '#b6a77f',
	courtyard: '#c8b990',
	plaster: ['#d7c7a7', '#cbb28e', '#d8b99d', '#b9c2a2', '#c6b7a9'],
	roof: ['#9f6f50', '#866553', '#a65742', '#7d786b'],
	mint: '#789884',
	oxide: '#a65742',
	yellow: '#d0a23a',
	road: '#797269',
	lane: '#978b78',
	footpath: '#aa9c82',
	steel: '#667177',
	pond: '#587966',
	pondDeep: '#3f645a',
	algae: '#788657',
	drain: '#39443f',
	tarpaulin: '#466d86',
	tree: '#506c4d',
	treeDark: '#354c38',
	sand: '#c5a568',
	wood: '#5c4334',
	glass: '#77949a',
	selection: '#f4d35e',
	current: '#f08f46',
	propagation: '#5f9d91',
	valid: '#4f7e58',
	conditional: '#c58d27',
	invalid: '#b44838',
	entropy: [
		'rgba(72, 112, 81, 0.13)',
		'rgba(94, 130, 91, 0.19)',
		'rgba(185, 151, 65, 0.23)',
		'rgba(181, 101, 53, 0.28)',
		'rgba(139, 58, 47, 0.34)'
	],
	shadow: 'rgba(29, 25, 20, 0.24)',
	wash: 'rgba(245, 231, 191, 0.055)'
};

const light: CityPalette = {
	...paper,
	canvas: '#e7e1d3',
	paper: '#eee5cf',
	paperEdge: '#756b57',
	ink: '#25231f',
	inkSoft: 'rgba(37, 35, 31, 0.46)',
	grid: 'rgba(37, 35, 31, 0.15)',
	parcel: ['#e8ddc5', '#ded2b8', '#eee2c9', '#d9ccb0'],
	openGround: '#cfbf9a',
	courtyard: '#ded0ae',
	plaster: ['#eadabc', '#ddc3a0', '#e5c3a6', '#c9d3b6', '#d8c9b9'],
	road: '#8a8378',
	lane: '#a89a84',
	footpath: '#b9aa8e',
	pond: '#659080',
	pondDeep: '#48766c',
	shadow: 'rgba(35, 31, 25, 0.2)',
	wash: 'rgba(255, 249, 228, 0.08)'
};

const night: CityPalette = {
	canvas: '#080d0d',
	paper: '#17201d',
	paperEdge: '#7b715d',
	ink: '#ddd0b2',
	inkSoft: 'rgba(221, 208, 178, 0.42)',
	grid: 'rgba(221, 208, 178, 0.14)',
	parcel: ['#292c27', '#30312b', '#272c28', '#343129'],
	openGround: '#35352c',
	courtyard: '#3b382d',
	plaster: ['#827960', '#766957', '#81665b', '#647467', '#756c68'],
	roof: ['#6e493c', '#5b4a42', '#794236', '#54544f'],
	mint: '#638a78',
	oxide: '#b9664e',
	yellow: '#c79a3f',
	road: '#484b48',
	lane: '#5d5a50',
	footpath: '#686252',
	steel: '#87959b',
	pond: '#315b52',
	pondDeep: '#244840',
	algae: '#596640',
	drain: '#182522',
	tarpaulin: '#3c6882',
	tree: '#36543d',
	treeDark: '#263c2c',
	sand: '#9c8555',
	wood: '#49362d',
	glass: '#6f9296',
	selection: '#ffe169',
	current: '#ff9c54',
	propagation: '#70b4a8',
	valid: '#6aa978',
	conditional: '#e0a33a',
	invalid: '#e45f50',
	entropy: [
		'rgba(75, 137, 94, 0.15)',
		'rgba(71, 142, 126, 0.22)',
		'rgba(198, 161, 61, 0.25)',
		'rgba(202, 105, 61, 0.31)',
		'rgba(190, 67, 57, 0.38)'
	],
	shadow: 'rgba(0, 0, 0, 0.42)',
	wash: 'rgba(220, 199, 153, 0.025)'
};

const highContrast: CityPalette = {
	canvas: '#000000',
	paper: '#080808',
	paperEdge: '#ffffff',
	ink: '#ffffff',
	inkSoft: 'rgba(255, 255, 255, 0.78)',
	grid: 'rgba(255, 255, 255, 0.38)',
	parcel: ['#141414', '#1e1e1e', '#101010', '#242424'],
	openGround: '#2c2c2c',
	courtyard: '#202020',
	plaster: ['#f2f2f2', '#cfcfcf', '#ffffff', '#bdbdbd', '#dedede'],
	roof: ['#6d6d6d', '#474747', '#8a8a8a', '#575757'],
	mint: '#3bd6a0',
	oxide: '#ff654f',
	yellow: '#ffdf3d',
	road: '#4b4b4b',
	lane: '#707070',
	footpath: '#969696',
	steel: '#d9e8ee',
	pond: '#087c74',
	pondDeep: '#00534e',
	algae: '#80b329',
	drain: '#000000',
	tarpaulin: '#2a9fe0',
	tree: '#2b9d46',
	treeDark: '#126529',
	sand: '#e5b741',
	wood: '#8f5e3d',
	glass: '#67d9ed',
	selection: '#fff000',
	current: '#ff7a00',
	propagation: '#00e5c4',
	valid: '#32ef62',
	conditional: '#ffd000',
	invalid: '#ff3b30',
	entropy: [
		'rgba(0, 255, 92, 0.15)',
		'rgba(0, 229, 196, 0.22)',
		'rgba(255, 240, 0, 0.28)',
		'rgba(255, 122, 0, 0.34)',
		'rgba(255, 59, 48, 0.42)'
	],
	shadow: 'rgba(0, 0, 0, 0.78)',
	wash: 'rgba(255, 255, 255, 0.035)'
};

export const CITY_PALETTES: Readonly<Record<CityAppearance, CityPalette>> = {
	paper,
	light,
	night,
	'high-contrast': highContrast
};

export function cityPalette(appearance: CityAppearance): CityPalette {
	return CITY_PALETTES[appearance];
}
