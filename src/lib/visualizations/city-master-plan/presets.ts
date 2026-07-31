import { cloneCityConfig } from './engine/anchors';
import { DEFAULT_CITY_CONFIG } from './engine/constants';
import type { CityConfig, GuidedTrial } from './engine/types';

function trialConfig(overrides: Partial<CityConfig> & { anchor?: Partial<CityConfig['anchor']> }) {
	const config = cloneCityConfig(DEFAULT_CITY_CONFIG);
	return {
		...config,
		...overrides,
		anchor: { ...config.anchor, ...overrides.anchor }
	} as CityConfig;
}

export const GUIDED_TRIALS: readonly GuidedTrial[] = [
	{
		id: 'sweet-shop-attractor',
		title: 'The sweet-shop attractor',
		description: 'Put one sweet shop near the middle and watch frontage choices spread outward.',
		learningPoint: 'One frontage requirement begins a cascade of local choices.',
		config: trialConfig({
			seed: 'sweet-shop-attractor-184',
			size: 'standard',
			civicPatience: 'familiar',
			density: 'balanced',
			anchor: { id: 'sweet-shop', x: 12, y: 9, rotation: 0 }
		})
	},
	{
		id: 'tram-versus-garage',
		title: 'Tram versus garage',
		description: 'Start tram infrastructure near the northern edge with very little paperwork.',
		learningPoint: 'Long-range continuity is difficult to obtain from local compatibility alone.',
		config: trialConfig({
			seed: 'tram-versus-garage-62',
			civicPatience: 'impulsive',
			tramPreference: 'high',
			anomalyAppetite: 'enthusiastic',
			anchor: { id: 'tram-stop', x: 7, y: 1, rotation: 0 }
		}),
		challenge: 'calamity'
	},
	{
		id: 'pond-in-the-middle',
		title: 'Pond in the middle',
		description: 'Reserve a pond footprint in the centre of a dense neighbourhood.',
		learningPoint: 'A large excluded region changes lanes, frontage, and drainage around it.',
		config: trialConfig({
			seed: 'pond-in-the-middle-417',
			density: 'dense',
			anchor: { id: 'pond', x: 11, y: 7, rotation: 0 }
		})
	},
	{
		id: 'flyover-precedent',
		title: 'Flyover precedent',
		description: 'Ask dense buildings to negotiate around one very settled pillar.',
		learningPoint:
			'The infrastructure survey records any concrete pillar-and-building collision as an explicit exception.',
		config: trialConfig({
			seed: 'flyover-precedent-91',
			civicPatience: 'impulsive',
			density: 'dense',
			anomalyAppetite: 'enthusiastic',
			anchor: { id: 'flyover-pillar', x: 12, y: 9, rotation: 0 }
		}),
		challenge: 'calamity'
	},
	{
		id: 'immortal-sand-pile',
		title: 'The immortal sand pile',
		description: 'Place one obstruction where a guaranteed local route wants to pass.',
		learningPoint: 'One harmless-looking obstruction can reorganise an entire movement network.',
		config: trialConfig({
			seed: 'immortal-sand-pile-37',
			minimumGuarantees: true,
			anomalyAppetite: 'enthusiastic',
			anchor: { id: 'sand-pile', x: 12, y: 9, rotation: 0 }
		}),
		challenge: 'calamity'
	}
];
