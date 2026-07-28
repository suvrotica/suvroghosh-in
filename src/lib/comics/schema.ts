export const COMIC_PANEL_STATUSES = [
	'missing',
	'draft',
	'needs-review',
	'approved',
	'rejected',
	'final'
] as const;

export type ComicPanelStatus = (typeof COMIC_PANEL_STATUSES)[number];
export type ComicBalloonStyle = 'speech' | 'thought' | 'whisper' | 'robot' | 'system' | 'off-panel';
export type ComicLetteringGeometryStatus = 'needs-review' | 'approved';
export type ComicLetteringProtectedKind =
	| 'face'
	| 'body'
	| 'critical-prop'
	| 'no-balloon'
	| 'no-tail';
export type ComicLetteringProtection = 'balloon' | 'tail' | 'both';

export type NormalizedBox = {
	x: number;
	y: number;
	width: number;
	height: number;
	z: number;
};

export type ComicLetteringPoint = {
	x: number;
	y: number;
};

export type ComicBalloonTailRoute = {
	start: ComicLetteringPoint;
	control: ComicLetteringPoint;
	end: ComicLetteringPoint;
	side: 'up' | 'down' | 'left' | 'right';
	safe: boolean;
};

export type ComicLetteringProtectedZone = {
	id: string;
	kind: ComicLetteringProtectedKind;
	characterId?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	padding?: number;
	protect?: ComicLetteringProtection;
};

export type ComicPanelLetteringGeometry = {
	status: ComicLetteringGeometryStatus;
	speakerAnchors: Record<string, ComicLetteringPoint>;
	protectedZones: ComicLetteringProtectedZone[];
};

export type ComicLetteringGeometry = {
	format: 'suvroghosh-comic-lettering-geometry';
	formatVersion: 1;
	panels: Record<string, ComicPanelLetteringGeometry>;
};

export type ComicCharacterBeat = {
	id: string;
	position: string;
	emotion: string;
	pose: string;
	facing?: 'left' | 'right' | 'front' | 'away';
};

export type ComicBalloon = NormalizedBox & {
	tailTarget?: { x: number; y: number };
	tailDirection?: 'up' | 'down' | 'left' | 'right' | 'none';
	tailRoute?: ComicBalloonTailRoute;
	fontScale?: number;
	manualBreaks?: string[];
	renderScale?: number;
};

export type ComicDialogue = {
	id: string;
	speaker: string;
	text: string;
	style: ComicBalloonStyle;
	readingOrder: number;
	narrationOrder?: number;
	balloon: ComicBalloon;
};

export type ComicSoundEffect = {
	text: string;
	description: string;
	narrationOrder?: number;
	position: Pick<NormalizedBox, 'x' | 'y' | 'z'>;
};

export type ComicTextOverlay = NormalizedBox & {
	id: string;
	signId: string;
	panelId: string;
	placementIndex: number;
	kind: string;
	textVariant: string;
	text: string;
	language: 'en' | 'bn' | 'mixed';
	reviewRequired: boolean;
	reviewState: string;
	publicationAllowed: boolean;
};

export type ComicPanel = {
	id: string;
	panel: number;
	size: 'small' | 'medium' | 'wide' | 'tall' | 'half-page' | 'splash';
	aspectRatio: string;
	camera: string;
	location: string;
	time: string;
	characters: ComicCharacterBeat[];
	props: string[];
	foreground: string;
	middleGround: string;
	background: string;
	action: string;
	dialogue: ComicDialogue[];
	overlays?: ComicTextOverlay[];
	caption?: string | null;
	soundEffects?: ComicSoundEffect[];
	visualJoke?: string | null;
	continuity: string[];
	prompt: {
		lighting: string;
		palette: string;
		composition: string;
		balloonSafeAreas: string[];
		negative: string[];
	};
	accessibility: {
		alt: string;
		description: string;
	};
	art: {
		status: ComicPanelStatus;
		revision: number;
		source?: string | null;
		final?: string | null;
		width?: number | null;
		height?: number | null;
		anchor?: 'top' | 'center' | 'bottom';
	};
};

export type ComicNarrationItem =
	| {
			kind: 'dialogue';
			key: string;
			narrationOrder?: number;
			dialogue: ComicDialogue;
	  }
	| {
			kind: 'sound';
			key: string;
			narrationOrder?: number;
			soundEffect: ComicSoundEffect;
	  };

export function comicPanelNarrationItems(
	panel: Pick<ComicPanel, 'id' | 'dialogue' | 'soundEffects'>
): ComicNarrationItem[] {
	const dialogue = [...panel.dialogue]
		.sort((left, right) => left.readingOrder - right.readingOrder)
		.map((entry) => ({
			kind: 'dialogue' as const,
			key: entry.id,
			narrationOrder: entry.narrationOrder,
			dialogue: entry
		}));
	const soundEffects = (panel.soundEffects ?? []).map((entry, index) => ({
		kind: 'sound' as const,
		key: `${panel.id}-sound-${index + 1}`,
		narrationOrder: entry.narrationOrder,
		soundEffect: entry
	}));
	const combined: ComicNarrationItem[] = [...dialogue, ...soundEffects];
	if (!combined.some((item) => item.narrationOrder !== undefined)) {
		return combined;
	}
	return combined.sort(
		(left, right) =>
			(left.narrationOrder ?? Number.MAX_SAFE_INTEGER) -
				(right.narrationOrder ?? Number.MAX_SAFE_INTEGER) || left.key.localeCompare(right.key)
	);
}

export type ComicPage = {
	page: number;
	title: string;
	purpose: string;
	location: string;
	time: string;
	layout: string;
	panelCount: number;
	dialogueGoal: string;
	pageTurn: string;
	visualMotif: string;
	continuity: string[];
	panels: ComicPanel[];
};

export type ComicEpisodeMetadata = {
	id: string;
	slug: string;
	seriesId: string;
	seriesSlug: string;
	title: string;
	subtitle: string;
	description: string;
	category: 'Comic';
	tags: string[];
	date: string;
	dateModified: string;
	published: boolean;
	productionPreview: boolean;
	storyPageCount: number;
	readingDirection: 'ltr';
	language: 'en';
	contentGuidance: string[];
	credits: { role: string; name: string }[];
	canonicalPath: string;
	transcriptPath: string;
	printPath: string;
	cover?: string | null;
	coverAlt: string;
};

export type ComicEpisode = {
	sourceDigest?: string;
	letteringDigest?: string;
	metadata: ComicEpisodeMetadata;
	pages: ComicPage[];
	frontMatter?: {
		productionEndMatter?: {
			heading: string;
			publicEditionText: string;
			secondAlbumPromise: string;
			hybridRulesHeading: string;
			hybridRules: string[];
		};
		[key: string]: unknown;
	} | null;
	lettering?: {
		format: 'suvroghosh-comic-lettering';
		formatVersion: 1;
		sourceDigest: string;
		entryCount: number;
		entries: ComicTextOverlay[];
	};
	letteringGeometry?: ComicLetteringGeometry;
};
