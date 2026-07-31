import type {
	AnchorFootprintCell,
	AnchorId,
	CellCoordinate,
	CityResult,
	CityTile,
	GenerationEvent,
	Rotation
} from '../engine/types';

export const CITY_TILE_SIZE = 64;

export type CityAppearance = 'paper' | 'light' | 'night' | 'high-contrast';
export type CityRenderMode = 'interactive' | 'export';
export type CityPlacementValidity = 'valid' | 'conditional' | 'invalid';

export interface CityCamera {
	/** World-space coordinate at the centre of the viewport. */
	x: number;
	/** World-space coordinate at the centre of the viewport. */
	y: number;
	/** CSS pixels per world-space drawing unit. */
	zoom: number;
}

export interface CityPlacementPreview {
	active: boolean;
	/** `anchorId` is canonical; `id` is accepted for compact lab state. */
	anchorId?: AnchorId;
	id?: AnchorId;
	rotation: Rotation;
	origin?: CellCoordinate | null;
	footprint?: readonly AnchorFootprintCell[];
	validity?: CityPlacementValidity;
	label?: string;
}

export interface CityRenderOverlay {
	selectedCell?: CellCoordinate | null;
	hoveredCell?: CellCoordinate | null;
	currentCell?: CellCoordinate | null;
	propagationCells?: readonly CellCoordinate[];
	entropy?: readonly (number | null | undefined)[];
	candidateCounts?: readonly (number | null | undefined)[];
	/**
	 * Optional row-major visibility mask used while replaying genuine generation
	 * events. A false entry leaves the final topology hidden beneath hatching.
	 */
	revealedCells?: readonly boolean[];
	/** More precise replay masks; these take precedence over revealedCells. */
	revealedFabricCells?: readonly boolean[];
	revealedOccupationCells?: readonly boolean[];
	placement?: CityPlacementPreview | null;
	showEntropy?: boolean;
	showGrid?: boolean;
	showSockets?: boolean;
}

export interface CityRenderOptions {
	result: CityResult;
	viewportWidth: number;
	viewportHeight: number;
	pixelRatio?: number;
	camera: CityCamera;
	appearance?: CityAppearance;
	mode?: CityRenderMode;
	time?: number;
	animate?: boolean;
	overlay?: CityRenderOverlay;
}

export interface CityExportOptions {
	/**
	 * Both kinds are metadata-complete exhibit posters. `social` defaults to
	 * 1600 × 1200; `map` defaults to a print-friendlier 3200 × 2400.
	 */
	kind?: 'map' | 'social';
	appearance?: CityAppearance;
	/** Requested output density. The default is 192 pixels per city tile. */
	pixelsPerTile?: number;
	/** Safety limit for either output dimension. Defaults to 8192 pixels. */
	maxDimension?: number;
	/** Padding around the city, measured in logical drawing units. */
	margin?: number;
	overlay?: CityRenderOverlay;
	time?: number;
}

export interface CitySocialExportOptions extends CityExportOptions {
	kind: 'social';
	/** Defaults to 1600 × 1200. */
	width?: number;
	height?: number;
	siteLabel?: string;
	title?: string;
}

export interface CityExportDimensions {
	width: number;
	height: number;
	pixelRatio: number;
	pixelsPerTile: number;
	logicalWidth: number;
	logicalHeight: number;
	margin: number;
}

/**
 * Complete input contract for an individual tile drawing operation. Topology
 * comes from CityTile; microSeed is decorative and must never affect the model.
 */
export interface CityTileRenderInput {
	context: CanvasRenderingContext2D;
	x: number;
	y: number;
	tile: CityTile;
	rotation: Rotation;
	citySeed: string;
	microSeed: number;
	appearance: CityAppearance;
	time: number;
	mode: CityRenderMode;
}

export interface CityEventOverlay {
	currentCell: CellCoordinate | null;
	propagationCells: readonly CellCoordinate[];
	eventKind: GenerationEvent['type'] | null;
}
