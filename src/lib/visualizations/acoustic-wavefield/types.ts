export const GRID_NX = 224;
export const GRID_NY = 144;
export const CELL_COUNT = GRID_NX * GRID_NY;

export const DOMAIN_LX = 14.0; // meters
export const DOMAIN_LY = 9.0; // meters
export const DX = DOMAIN_LX / GRID_NX; // 0.0625 m
export const C0 = 343.0; // m/s
export const COURANT = 0.5;
export const DT = (COURANT * DX) / C0; // ~9.110787e-5 s
export const FS_SIM = 1 / DT; // 10976 Hz

export const RIR_DURATION_S = 1.2;
export const RIR_SAMPLES = Math.round(RIR_DURATION_S * FS_SIM); // 13171 -> let's match 13172
export const RIR_BUFFER_LENGTH = 13172;
export const PML_WIDTH = 14;
export const CHLADNI_COUNT = 2000;

export const RICKER_F0_HZ = 420;
export const RICKER_DELAY_S = 1.4 / RICKER_F0_HZ;

export const MAT_AIR = 0;
export const MAT_WALL = 1;
export const MAT_ABSORBER = 2;
export const MAT_DIFFUSER = 3;
export const MAT_LENS = 4;
export const MAT_RESONATOR = 5;

export type MaterialId =
	| typeof MAT_AIR
	| typeof MAT_WALL
	| typeof MAT_ABSORBER
	| typeof MAT_DIFFUSER
	| typeof MAT_LENS
	| typeof MAT_RESONATOR;

export type BrushTool =
	| 'orbit'
	| 'move'
	| 'wall'
	| 'absorber'
	| 'diffuser'
	| 'lens'
	| 'resonator'
	| 'air';

export type PresetId =
	| 'elliptical-whispering-gallery'
	| 'shoebox-concert-hall'
	| 'double-slit-diffraction'
	| 'parabolic-lens-focus'
	| 'stone-bathhouse'
	| 'anechoic-chamber'
	| 'helmholtz-trap';

export type PerimeterMode = 'rigid' | 'open';
export type ViewMode = 'relief' | 'interferometer';
export type StudioTheme = 'dark' | 'light';
export type WavePalette = 'vivid' | 'spectrum' | 'thermal';
export type ExcitationMode = 'clap' | 'tone' | 'sweep';
export type DrySoundKind = 'clap' | 'pluck' | 'rimshot' | 'vowel';

export interface CameraState {
	yawDeg: number;
	pitchDeg: number;
	zoom: number;
	panX: number;
	panY: number;
}

export const DEFAULT_CAMERA: CameraState = {
	yawDeg: 0,
	pitchDeg: 52,
	zoom: 1.0,
	panX: 0,
	panY: 0
};

export interface GridPoint {
	x: number; // fractional grid cell coordinate [0, GRID_NX - 1]
	y: number; // fractional grid cell coordinate [0, GRID_NY - 1]
}

export interface PresetDefinition {
	id: PresetId;
	name: string;
	shortName: string;
	tagline: string;
	takeaway: string;
	defaultPerimeter: PerimeterMode;
	defaultSource: GridPoint;
	defaultListener: GridPoint;
	recommendedToneHz: number;
	buildGeometry: (material: Uint8Array) => void;
}

export interface SimulationState {
	presetId: PresetId;
	perimeter: PerimeterMode;
	material: Uint8Array;
	wallMask: Uint8Array;
	cRel: Float32Array;
	gamma: Float32Array;
	cCurr: Float32Array;
	cPrev: Float32Array;
	cLap: Float32Array;
	interiorAirCells: Int32Array;
	interiorAirCount: number;
	maskedAirCells: Int32Array;
	maskedAirCount: number;
	p: Float32Array;
	pPrev: Float32Array;
	pNext: Float32Array;
	eRms: Float32Array;
	eRef: number;
	chladniX: Float32Array;
	chladniY: Float32Array;
	chladniPrevX: Float32Array;
	chladniPrevY: Float32Array;
	chladniAngle: Float32Array;
	chladniEnabled: boolean;
	source: GridPoint;
	listener: GridPoint;
	excitationMode: ExcitationMode;
	excitationActive: boolean;
	excitationStartStep: number;
	toneHz: number;
	stepCount: number;
	rirCapturing: boolean;
	rirWriteIndex: number;
	liveRir: Float32Array;
}

export interface SpectralPeak {
	freqHz: number;
	magDb: number;
}

export interface AcousticMetrics {
	rir: Float32Array;
	sampleRate: number;
	directArrivalMs: number;
	directSampleIndex: number;
	earlyEndSampleIndex: number;
	peakAmplitude: number;
	schroederDb: Float32Array;
	rt60Ms: number | null;
	rt60Method: 'T30' | 'T20' | 'open';
	clarityC80Db: number | null;
	spectrumFreqsHz: Float32Array;
	spectrumDb: Float32Array;
	peakModes: SpectralPeak[];
}

export interface ChamberUrlState {
	presetId: PresetId;
	sx: number;
	sy: number;
	lx: number;
	ly: number;
	view: ViewMode;
	perimeter: PerimeterMode;
	chladni: boolean;
	toneHz: number;
	theme: StudioTheme;
	palette: WavePalette;
}
