export type SketchOrientation = 'portrait' | 'landscape' | 'square';
export type SketchCanvasMode = 'ink' | 'original';

export interface SketchVariant {
	src: string;
	width: number;
	height: number;
	bytes: number;
}

export interface SketchArtwork {
	slug: string;
	title: string;
	description: string;
	alt: string;
	date: string | null;
	medium: string | null;
	orientation: SketchOrientation;
	room: string | null;
	featured: boolean;
	needsMetadata: boolean;
	canvasMode: SketchCanvasMode;
	source: {
		src: string;
		width: number;
		height: number;
		bytes: number;
	};
	variants: {
		thumbnail: SketchVariant;
		preview: SketchVariant;
		museum: SketchVariant;
		detail: SketchVariant;
	};
}
