export type Vec3 = [number, number, number];
export type CameraBookmark = 'whole' | 'face' | 'crown' | 'three-quarter';
export type DesignGroup = 'face' | 'pose' | 'dress' | 'ornament' | 'setting';
export type MaterialId = 'painted-clay' | 'clay' | 'terracotta' | 'bronze' | 'brass' | 'stone';
export type CameraView = { position: Vec3; target: Vec3 };

export interface AtelierDesign {
	version: 1;
	seed: string;
	presetId: string;
	face: 'serene' | 'resolute' | 'gentle';
	faceWidth: number;
	eyeScale: number;
	headTilt: number;
	pose: 'classic' | 'open';
	material: MaterialId;
	skinColor: string;
	sariColor: string;
	borderColor: string;
	blouseColor: string;
	sariPattern: 'lotus' | 'vine' | 'chevron';
	crown: 'shola' | 'gold' | 'silver';
	crownScale: number;
	ornamentDensity: number;
	garland: 'marigold' | 'jasmine' | 'hibiscus';
	flowers: boolean;
	halo: 'lotus' | 'sunburst' | 'arch';
	backdrop: 'charcoal' | 'atelier' | 'indigo' | 'pandal';
	lamps: boolean;
	lampIntensity: number;
	lightWarmth: number;
	lightAngle: number;
	exposure: number;
	atmosphere: number;
	stage: number;
	bells: boolean;
	lion: boolean;
	camera: CameraView;
}

export interface AtelierPreset {
	id: string;
	name: string;
	description: string;
	colours: [string, string, string];
	design: AtelierDesign;
}

export interface SavedDesign {
	id: string;
	name: string;
	savedAt: string;
	thumbnail?: string;
	design: AtelierDesign;
}

export type DesignLocks = Record<DesignGroup, boolean>;
export type ExportOptions = {
	width: number;
	height: number;
	transparent: boolean;
	title?: string;
	signature?: string;
};

export interface AtelierViewportHandle {
	exportImage: (options: ExportOptions) => Promise<Blob>;
	thumbnail: () => string | undefined;
	ringBell: () => void;
}
