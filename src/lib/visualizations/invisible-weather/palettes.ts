import { SeededRandom } from './prng';
import type { InkPair, PaletteFamily, PaletteGround } from './types';

export const PALETTE_FAMILIES = [
	{
		id: 'monsoon-ledger',
		name: 'Monsoon Ledger',
		description: 'Plaster, wet green ink, oxblood notes, and a nocturnal inverse.',
		walls: ['#E7DFD0', '#D8CDBC'],
		frames: [
			{ outer: '#46362B', inner: '#B8A88D' },
			{ outer: '#243936', inner: '#9EAA9A' }
		],
		mats: ['#F4ECDD', '#D9D0BC'],
		labelInk: '#242C29',
		accent: '#711F1B',
		traits: ['pale-paper'],
		grounds: [
			{
				id: 'ledger-cream',
				colour: '#F1E8D2',
				pairs: [
					{ primary: '#163B38', secondary: '#711F1B', weight: 2 },
					{ primary: '#263238', secondary: '#62411D', weight: 1 }
				]
			},
			{
				id: 'storm-green',
				colour: '#132B2B',
				pairs: [
					{ primary: '#F7EBCB', secondary: '#FFC857', weight: 2 },
					{ primary: '#DDF1EA', secondary: '#FFB8A7', weight: 1 }
				]
			}
		]
	},
	{
		id: 'indigo-rain',
		name: 'Indigo Rain',
		description: 'Deep indigo and violet against fogged paper or a late storm sky.',
		walls: ['#D7D0C5', '#C8C3C0'],
		frames: [
			{ outer: '#171B2A', inner: '#687085' },
			{ outer: '#382A43', inner: '#A399AF' }
		],
		mats: ['#EEE7DB', '#D9D9E1'],
		labelInk: '#202333',
		accent: '#4B2868',
		grounds: [
			{
				id: 'fog-paper',
				colour: '#F3EBDD',
				pairs: [
					{ primary: '#172A55', secondary: '#5A214B' },
					{ primary: '#26313C', secondary: '#513113' }
				]
			},
			{
				id: 'indigo-night',
				colour: '#111827',
				pairs: [
					{ primary: '#F3EBDD', secondary: '#93C5FD' },
					{ primary: '#E5E7EB', secondary: '#F9A8D4' }
				]
			}
		]
	},
	{
		id: 'tramline-rust',
		name: 'Tramline Rust',
		description: 'Burnt iron, slate, and oxidised orange with a soot-dark inverse.',
		walls: ['#E2D6C5', '#D4C6B4'],
		frames: [
			{ outer: '#4A2B20', inner: '#98725A' },
			{ outer: '#283641', inner: '#89969D' }
		],
		mats: ['#F1E6D4', '#CFC3B0'],
		labelInk: '#2A231E',
		accent: '#6A281B',
		traits: ['colour-vision-friendly'],
		grounds: [
			{
				id: 'ticket-stock',
				colour: '#F4E8D5',
				pairs: [
					{ primary: '#5A2016', secondary: '#213547' },
					{ primary: '#332A20', secondary: '#6B183A' }
				]
			},
			{
				id: 'soot',
				colour: '#271711',
				pairs: [
					{ primary: '#F7E4C4', secondary: '#FFB16A' },
					{ primary: '#E7F0F4', secondary: '#EFB7C8' }
				]
			}
		]
	},
	{
		id: 'jute-and-ink',
		name: 'Jute and Ink',
		description: 'Plant fibre, bottle green, and brick-black archival marks.',
		walls: ['#DED4BD', '#D2C6AA'],
		frames: [
			{ outer: '#332D23', inner: '#806F51' },
			{ outer: '#1F3630', inner: '#7F9580' }
		],
		mats: ['#F2E9D3', '#D3C6A9'],
		labelInk: '#252A23',
		accent: '#5B2921',
		traits: ['pale-paper'],
		grounds: [
			{
				id: 'jute',
				colour: '#EFE6CF',
				pairs: [
					{ primary: '#263127', secondary: '#5B2921' },
					{ primary: '#173B4A', secondary: '#55335F' }
				]
			},
			{
				id: 'bottle-green',
				colour: '#1B281F',
				pairs: [
					{ primary: '#F1E7C9', secondary: '#C6E39B' },
					{ primary: '#E6EEF1', secondary: '#FFBE9D' }
				]
			}
		]
	},
	{
		id: 'storm-glass',
		name: 'Storm Glass',
		description: 'A near-monochrome register of cold glass, petroleum blue, and slate.',
		walls: ['#DCE3E6', '#CBD4D9'],
		frames: [
			{ outer: '#1D2B35', inner: '#778690' },
			{ outer: '#30383D', inner: '#A3ADB3' }
		],
		mats: ['#EDF2F4', '#D3DCE1'],
		labelInk: '#172630',
		accent: '#234D63',
		traits: ['near-monochrome', 'colour-vision-friendly'],
		grounds: [
			{
				id: 'cloud-glass',
				colour: '#E8EEF2',
				pairs: [
					{ primary: '#15334A', secondary: '#3B4E5A' },
					{ primary: '#27333B', secondary: '#405968' }
				]
			},
			{
				id: 'barometer',
				colour: '#111C26',
				pairs: [
					{ primary: '#E7F3FA', secondary: '#B8D0DC' },
					{ primary: '#F2F5F6', secondary: '#A9CAD8' }
				]
			}
		]
	},
	{
		id: 'vermilion-archive',
		name: 'Vermilion Archive',
		description: 'Warm paper, sealing red, and disciplined blue-black marks.',
		walls: ['#E5D8C7', '#D9C8B4'],
		frames: [
			{ outer: '#4A251F', inner: '#A27562' },
			{ outer: '#263342', inner: '#8994A0' }
		],
		mats: ['#F4E7D6', '#D9C6AF'],
		labelInk: '#2D2420',
		accent: '#671B18',
		grounds: [
			{
				id: 'archive-paper',
				colour: '#F5E9D9',
				pairs: [
					{ primary: '#671B18', secondary: '#223147' },
					{ primary: '#3A281A', secondary: '#4B2A5D' }
				]
			},
			{
				id: 'seal-shadow',
				colour: '#2B1718',
				pairs: [
					{ primary: '#FFE9D3', secondary: '#FFB4A2' },
					{ primary: '#E6F2F7', secondary: '#B7D99A' }
				]
			}
		]
	},
	{
		id: 'silt-map',
		name: 'Silt Map',
		description: 'River silt, survey green, and old cadastral brown.',
		walls: ['#DDD4C1', '#CEC3AD'],
		frames: [
			{ outer: '#354038', inner: '#879183' },
			{ outer: '#4A3829', inner: '#9A8465' }
		],
		mats: ['#F0E7D5', '#D1C5AE'],
		labelInk: '#28302A',
		accent: '#5D2A24',
		traits: ['colour-vision-friendly', 'pale-paper'],
		grounds: [
			{
				id: 'dry-silt',
				colour: '#EEE4CF',
				pairs: [
					{ primary: '#304036', secondary: '#5D2A24' },
					{ primary: '#1D3B51', secondary: '#56365C' }
				]
			},
			{
				id: 'wet-silt',
				colour: '#22241F',
				pairs: [
					{ primary: '#F0E6CF', secondary: '#E3C474' },
					{ primary: '#DDEDE7', secondary: '#F0B3A7' }
				]
			}
		]
	},
	{
		id: 'night-museum',
		name: 'Night Museum',
		description: 'Black walls, luminous paper, museum teal, and restrained rose.',
		walls: ['#101218', '#1A1D25'],
		frames: [
			{ outer: '#08090C', inner: '#555A65' },
			{ outer: '#263C3A', inner: '#839C97' }
		],
		mats: ['#E7E0D2', '#B7B8BB'],
		labelInk: '#F6EEDB',
		accent: '#F5D77A',
		traits: ['dark-wall'],
		grounds: [
			{
				id: 'gallery-night',
				colour: '#17191F',
				pairs: [
					{ primary: '#F6EEDB', secondary: '#8EDFD0' },
					{ primary: '#E8EDF7', secondary: '#FFB8C9' }
				]
			},
			{
				id: 'moon-paper',
				colour: '#EEE9DC',
				pairs: [
					{ primary: '#232630', secondary: '#61294E' },
					{ primary: '#173D3B', secondary: '#6D3219' }
				]
			}
		]
	},
	{
		id: 'brass-current',
		name: 'Brass Current',
		description: 'Brass instrument paper, blue-green current, and dark metal.',
		walls: ['#DED3BC', '#CFC1A5'],
		frames: [
			{ outer: '#40351F', inner: '#9B8554' },
			{ outer: '#183940', inner: '#76969A' }
		],
		mats: ['#F1E6CC', '#D2C4A5'],
		labelInk: '#2B271E',
		accent: '#6B4719',
		traits: ['colour-vision-friendly'],
		grounds: [
			{
				id: 'instrument-paper',
				colour: '#F3E8CF',
				pairs: [
					{ primary: '#3C2E18', secondary: '#173C46' },
					{ primary: '#5B1C2A', secondary: '#263447' }
				]
			},
			{
				id: 'dark-brass',
				colour: '#211D17',
				pairs: [
					{ primary: '#F7E7B2', secondary: '#87D5DD' },
					{ primary: '#F2E8DD', secondary: '#FFAE9B' }
				]
			}
		]
	}
] as const satisfies readonly PaletteFamily[];

export const PALETTES = PALETTE_FAMILIES;

export function getPalette(id: string): PaletteFamily {
	return PALETTE_FAMILIES.find((palette) => palette.id === id) ?? PALETTE_FAMILIES[0];
}

export function getGround(palette: PaletteFamily, id: string): PaletteGround {
	return palette.grounds.find((ground) => ground.id === id) ?? palette.grounds[0];
}

export function choosePalettePair(
	palette: PaletteFamily,
	seed: string | number
): Readonly<{ ground: PaletteGround; pair: InkPair }> {
	const random = new SeededRandom(seed);
	const ground = random.pick(palette.grounds);
	const pairIndex = random.weightedIndex(ground.pairs.map((pair) => pair.weight ?? 1));
	return { ground, pair: ground.pairs[pairIndex] };
}
