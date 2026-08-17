export const CITY_OPTIONS_BY_COUNTRY = {
	india: ['kolkata', 'delhi', 'mumbai', 'bengaluru', 'chennai'],
	bangladesh: ['dhaka'],
	'united-kingdom': ['london'],
	'united-states': ['new-york'],
	bhutan: [],
	nepal: [],
	pakistan: [],
	'sri-lanka': [],
	elsewhere: [],
	'prefer-not-to-say': []
} as const;

export const UNIVERSAL_PLACE_OPTIONS = [
	'another-city',
	'town',
	'rural-area',
	'moves-between-places',
	'prefer-not-to-say'
] as const;
