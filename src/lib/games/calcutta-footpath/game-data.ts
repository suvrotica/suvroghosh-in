import type { EntityKind, PedestrianArchetype } from './runtime-types';

export const WORLD = {
	width: 14_400,
	height: 720,
	startX: 170,
	destinationX: 14_160,
	minY: 205,
	maxY: 642,
	laneY: [254, 352, 450, 548, 620],
	viewWidth: 1_280,
	viewHeight: 720
} as const;

export const ZONES = [
	{
		id: 'lane',
		name: 'Cramped residential lane',
		start: 0,
		end: 1_850,
		wall: '#a55f48',
		accent: '#e0b36d',
		density: 0.58
	},
	{
		id: 'pavement',
		name: 'Broken pavement beside the main road',
		start: 1_850,
		end: 3_750,
		wall: '#b17b58',
		accent: '#40696c',
		density: 0.74
	},
	{
		id: 'bazaar',
		name: 'Bazaar frontage',
		start: 3_750,
		end: 5_650,
		wall: '#8e544c',
		accent: '#e1a94d',
		density: 0.9
	},
	{
		id: 'tea',
		name: 'Tea-stall bottleneck',
		start: 5_650,
		end: 7_250,
		wall: '#6e6351',
		accent: '#d7863c',
		density: 0.96
	},
	{
		id: 'crowd',
		name: 'School and office crowd',
		start: 7_250,
		end: 9_150,
		wall: '#9b6557',
		accent: '#47777b',
		density: 1.08
	},
	{
		id: 'rain',
		name: 'Rain-flooded crossing',
		start: 9_150,
		end: 10_950,
		wall: '#586265',
		accent: '#c5a866',
		density: 1.02
	},
	{
		id: 'construction',
		name: 'Construction patch',
		start: 10_950,
		end: 12_400,
		wall: '#a06d4d',
		accent: '#d5b44f',
		density: 1.12
	},
	{
		id: 'final',
		name: 'The annoyingly visible final stretch',
		start: 12_400,
		end: WORLD.width,
		wall: '#8b5145',
		accent: '#efb84e',
		density: 1.22
	}
] as const;

export type ZoneId = (typeof ZONES)[number]['id'];

export const PEDESTRIAN_ARCHETYPES: readonly PedestrianArchetype[] = [
	'phone-stop',
	'phone-walker',
	'diagonal',
	'family',
	'elderly',
	'commuter',
	'school-group',
	'large-bags',
	'conversation',
	'same-side',
	'reverser',
	'umbrella'
];

export const PEDESTRIAN_LABELS: Record<PedestrianArchetype, string> = {
	'phone-stop': 'urgent phone call',
	'phone-walker': 'phone-guided navigation',
	diagonal: 'diagonal policy',
	family: 'family formation',
	elderly: 'measured reconsideration',
	commuter: 'office urgency',
	'school-group': 'school cluster',
	'large-bags': 'bag-based expansion',
	conversation: 'conversational barricade',
	'same-side': 'synchronised sidestep',
	reverser: 'forgotten item',
	umbrella: 'umbrella jurisdiction'
};

export const REACTIONS = [
	'Dada, dekhe!',
	'Oi dike noy.',
	'Ektu daran.',
	'Ki korchhen?',
	'Aste!',
	'Arrey baba.',
	'Hoye gechhe.',
	'Side diye jaan!',
	'Ei je!',
	'Chokh khola ache?',
	'Apni agey jaan. Na, apni.',
	'Footpath bolchhen?'
] as const;

export const FOOD_MESSAGES = {
	fuchka: 'Fuchka: stamina restored. A small crowd has materialised.',
	mishti: 'Mishti: morale restored. Dignified chewing in progress.',
	tea: 'Chaa: warnings arrive earlier. Hands may develop opinions.',
	ghugni: 'Roadside ghugni: consequence pending municipal approval.'
} as const;

export const GHUGNI_MESSAGES: Record<string, string> = {
	'enormous-stamina-boost': 'The ghugni was structurally miraculous.',
	'speed-burst': 'Sudden purpose has entered the legs.',
	'stomach-warning': 'A private memorandum has arrived from the stomach.',
	'reversed-controls': 'Left and right have entered a temporary dispute.',
	'urgent-destination': 'The destination has become personally urgent.',
	'duplicate-potholes': 'Some potholes may now be theoretical.',
	'confidence-boost': 'Unfounded confidence: +16 morale.',
	'morale-immunity': 'Humiliation is briefly somebody else’s problem.',
	'wake-nearby-dogs': 'The ghugni has issued a canine press release.',
	'ominous-nothing': 'Nothing happened. This is somehow worse.'
};

export type LossContext = EntityKind | 'stamina' | 'morale' | 'crowd' | 'boundary' | 'generic';

export const GAME_OVER_MESSAGES: Record<LossContext, readonly string[]> = {
	pothole: [
		'The pothole had a basement.',
		'Your footwear has resigned without notice.',
		'The puddle was deeper than municipal records suggested.'
	],
	drain: [
		'The drain has accepted your application.',
		'You approached the edge. The edge reciprocated.',
		'The board over the drain was largely conceptual.'
	],
	dog: [
		'Random canine policy has been enforced.',
		'The dog woke up and your route went to sleep.',
		'Your snack declared the wrong allegiance.'
	],
	cow: [
		'The cow remains unharmed and legally blameless.',
		'You have offended a neutral diplomatic mission.',
		'The cow has reviewed the incident and blamed you.'
	],
	rickshaw: [
		'The rickshaw turned slowly and occupied history.',
		'You misunderstood the rickshaw’s extended geometry.',
		'Reverse was apparently the forward plan.'
	],
	motorbike: [
		'A motorbike has discovered your constitutional weakness.',
		'The supplementary highway was exactly where you stood.',
		'The horn was brief. The consequences were thorough.'
	],
	pedestrian: [
		'You both stepped aside with perfect mutual error.',
		'The conversation has acquired permanent right of way.',
		'You paused for half a second. Calcutta did not.'
	],
	hawker: [
		'Your route has become a retail establishment.',
		'The pavement has been reassigned to seasonal inventory.',
		'The safe gap now sells excellent tea.'
	],
	debris: [
		'The warning barrier was installed just after the hazard.',
		'One loose brick has completed its strategic objective.',
		'Temporary construction has achieved permanence.'
	],
	food: ['You nearly reached the tea stall. History will remember this.'],
	warning: ['The warning was technically visible.'],
	stamina: [
		'Your legs have submitted a joint resignation.',
		'Stamina has left by the nearest available lane.',
		'The heat has won on points.'
	],
	morale: [
		'Morale has left by the nearest available lane.',
		'One humiliation too many has completed the paperwork.',
		'You are physically present but civically defeated.'
	],
	crowd: [
		'You have been returned to your approximate starting point.',
		'The crowd has revised your direction of travel.',
		'Forward progress was not on today’s agenda.'
	],
	boundary: [
		'There was no correct side of the road.',
		'You selected a side. The city selected another.'
	],
	generic: [
		'The pavement has been reassigned.',
		'Normal civic life has completed the encounter.',
		'Your plausible route has been withdrawn.'
	]
};

export const CIVIC_RATINGS = [
	{ minimum: 0, title: 'Footpath Apprentice' },
	{ minimum: 2_500, title: 'Side-Diye Specialist' },
	{ minimum: 4_500, title: 'Municipal Acrobat' },
	{ minimum: 6_500, title: 'Pavement Diplomat' },
	{ minimum: 8_500, title: 'Cow-Negotiation Officer' },
	{ minimum: 10_500, title: 'Grandmaster of Approximate Passage' }
] as const;

export const TUTORIAL_CUES = [
	{ progress: 0.012, text: 'Walk with WASD, arrow keys, a stick, or your thumb.' },
	{ progress: 0.045, text: 'Shift or Space gives one short, expensive squeeze.' },
	{ progress: 0.085, text: 'Striped warnings mean something fast has selected your lane.' },
	{ progress: 0.13, text: 'Approach a food stall. Snacks are mechanics, not coins.' },
	{ progress: 0.18, text: 'Stamina is physical. Morale is Calcutta keeping score.' }
] as const;
