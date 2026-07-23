export const NOTE_DOCUMENT_VERSION = 1 as const;

export type NoteStatus = 'draft' | 'scheduled' | 'published' | 'archived' | 'private';
export type PaperStyle = 'blank' | 'grid' | 'dots' | 'lined';
export type DrawingTool = 'charcoal' | 'pencil' | 'fountain' | 'marker' | 'highlighter';
export type Tool =
	| DrawingTool
	| 'select'
	| 'lasso'
	| 'hand'
	| 'eraser'
	| 'line'
	| 'arrow'
	| 'rectangle'
	| 'ellipse'
	| 'text'
	| 'sticky'
	| 'tile'
	| 'image';

export type InkPoint = {
	x: number;
	y: number;
	pressure: number;
	time: number;
	tiltX?: number;
	tiltY?: number;
	twist?: number;
	tangentialPressure?: number;
	altitudeAngle?: number;
	azimuthAngle?: number;
};

export type BrushStyle = {
	color: string;
	size: number;
	opacity: number;
	texture: number;
	smoothing: number;
	pressure: number;
	pressureCurve: number;
};

export type CanvasObjectBase = {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	opacity: number;
	locked: boolean;
	hidden: boolean;
	zIndex: number;
	groupId?: string;
	createdAt: string;
	updatedAt: string;
};

export type StrokeObject = CanvasObjectBase & {
	type: 'stroke';
	tool: DrawingTool;
	points: InkPoint[];
	sourceWidth: number;
	sourceHeight: number;
	style: BrushStyle;
};

export type ShapeObject = CanvasObjectBase & {
	type: 'shape';
	shape: 'line' | 'arrow' | 'rectangle' | 'ellipse';
	from: { x: number; y: number };
	to: { x: number; y: number };
	stroke: string;
	fill?: string;
	strokeWidth: number;
	dash?: number[];
};

export type TextObject = CanvasObjectBase & {
	type: 'text';
	text: string;
	color: string;
	fontSize: number;
	fontFamily: 'sans' | 'serif' | 'mono';
	align: 'left' | 'center' | 'right';
};

export type StickyObject = CanvasObjectBase & {
	type: 'sticky';
	text: string;
	color: string;
	textColor: string;
	fontSize: number;
};

export type ImageObject = CanvasObjectBase & {
	type: 'image';
	src: string;
	alt: string;
	mimeType?: string;
};

export type TileObject = CanvasObjectBase & {
	type: 'tile';
	title: string;
	color: string;
	borderColor: string;
};

export type CanvasObject =
	| StrokeObject
	| ShapeObject
	| TextObject
	| StickyObject
	| ImageObject
	| TileObject;

export type Viewport = {
	x: number;
	y: number;
	zoom: number;
};

export type NoteDocument = {
	version: typeof NOTE_DOCUMENT_VERSION;
	id: string;
	title: string;
	background: PaperStyle;
	backgroundColor: string;
	gridSize: number;
	snapToGrid: boolean;
	showGuides: boolean;
	objects: CanvasObject[];
	viewport: Viewport;
	transcript: string;
	createdAt: string;
	updatedAt: string;
};

export type NoteSummary = {
	id: string;
	snapshotId?: string;
	title: string;
	slug: string;
	excerpt: string;
	status: NoteStatus;
	tags: string[];
	category: string | null;
	coverImageUrl: string | null;
	publishedAt: string | null;
	scheduledFor: string | null;
	updatedAt: string;
	revision: number;
	downloadsEnabled: boolean;
};

export type EditableNote = NoteSummary & {
	document: NoteDocument;
	transcript: string;
	seoTitle: string | null;
	seoDescription: string | null;
};

export type PublishedNote = NoteSummary & {
	document: NoteDocument;
	transcript: string;
	seoTitle: string | null;
	seoDescription: string | null;
};

export const DEFAULT_BRUSHES: Record<DrawingTool, BrushStyle> = {
	charcoal: {
		color: '#2b241c',
		size: 8,
		opacity: 0.82,
		texture: 0.72,
		smoothing: 0.62,
		pressure: 0.78,
		pressureCurve: 0.72
	},
	pencil: {
		color: '#3a342d',
		size: 3,
		opacity: 0.72,
		texture: 0.35,
		smoothing: 0.7,
		pressure: 0.62,
		pressureCurve: 0.9
	},
	fountain: {
		color: '#142f38',
		size: 5,
		opacity: 0.96,
		texture: 0.05,
		smoothing: 0.78,
		pressure: 0.9,
		pressureCurve: 1.25
	},
	marker: {
		color: '#20372f',
		size: 12,
		opacity: 0.88,
		texture: 0.08,
		smoothing: 0.68,
		pressure: 0.28,
		pressureCurve: 1
	},
	highlighter: {
		color: '#e2b84f',
		size: 22,
		opacity: 0.28,
		texture: 0,
		smoothing: 0.7,
		pressure: 0.08,
		pressureCurve: 1
	}
};

export function createId(prefix = 'obj') {
	return `${prefix}_${crypto.randomUUID()}`;
}

export function createEmptyDocument(title = 'Untitled note', id = createId('note')): NoteDocument {
	const now = new Date().toISOString();
	return {
		version: NOTE_DOCUMENT_VERSION,
		id,
		title,
		background: 'dots',
		backgroundColor: '#fbf7ec',
		gridSize: 28,
		snapToGrid: false,
		showGuides: true,
		objects: [],
		viewport: { x: 0, y: 0, zoom: 1 },
		transcript: '',
		createdAt: now,
		updatedAt: now
	};
}

export function isDrawingTool(tool: Tool): tool is DrawingTool {
	return (
		tool === 'charcoal' ||
		tool === 'pencil' ||
		tool === 'fountain' ||
		tool === 'marker' ||
		tool === 'highlighter'
	);
}

export function cloneSceneValue<T>(value: T): T {
	// Scene values are deliberately JSON-only. JSON cloning also unwraps Svelte's deep-reactive
	// proxies, which browser structuredClone rejects with DataCloneError.
	return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneDocument(document: NoteDocument): NoteDocument {
	return cloneSceneValue(document);
}
