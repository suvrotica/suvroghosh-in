import type {
	CellCoordinate,
	CityResult,
	CityTile,
	Direction,
	EdgeSignature,
	InfrastructureDetail,
	MunicipalPatch,
	Passage
} from '../engine/types';
import { cityPalette, type CityPalette } from './palette';
import { cityMicroDetails, type CityMicroDetails } from './microDetails';
import {
	CITY_TILE_SIZE,
	type CityExportDimensions,
	type CityExportOptions,
	type CityPlacementPreview,
	type CityRenderOptions,
	type CitySocialExportOptions,
	type CityTileRenderInput
} from './types';

type FabricKind =
	| 'parcel'
	| 'open'
	| 'tree-patch'
	| 'footpath'
	| 'lane'
	| 'road'
	| 'tram'
	| 'pond'
	| 'pond-bank'
	| 'unknown';

type OccupationKind =
	| 'empty'
	| 'partial'
	| 'house'
	| 'crumbling-house'
	| 'verandah-house'
	| 'balcony-house'
	| 'corner-house'
	| 'sweet-shop'
	| 'tea-stall'
	| 'garage'
	| 'workshop'
	| 'temple'
	| 'tree'
	| 'sand'
	| 'pillar'
	| 'tram-stop'
	| 'ghat'
	| 'unknown';

interface RenderTile {
	tile: CityTile;
	token: string;
	fabricKind: FabricKind;
	occupationKind: OccupationKind;
	details: CityMicroDetails;
}

interface RenderCell {
	index: number;
	x: number;
	y: number;
	fabric: RenderTile | null;
	occupation: RenderTile | null;
}

interface CityRenderModel {
	cells: readonly RenderCell[];
	infrastructureByCell: readonly (readonly InfrastructureDetail[] | undefined)[];
	patchesByCell: readonly (readonly MunicipalPatch[] | undefined)[];
}

const modelCache = new WeakMap<CityResult, CityRenderModel>();
const EMPTY_EDGES: readonly [EdgeSignature, EdgeSignature, EdgeSignature, EdgeSignature] = [
	{ passage: 'closed', water: 'dry', drain: 'none', face: 'neutral', clearance: 0 },
	{ passage: 'closed', water: 'dry', drain: 'none', face: 'neutral', clearance: 0 },
	{ passage: 'closed', water: 'dry', drain: 'none', face: 'neutral', clearance: 0 },
	{ passage: 'closed', water: 'dry', drain: 'none', face: 'neutral', clearance: 0 }
];

function tileToken(tile: CityTile): string {
	return `${tile.renderer} ${tile.id} ${tile.prototypeId} ${tile.tags.join(' ')}`.toLowerCase();
}

function hasToken(token: string, value: string): boolean {
	return token.includes(value);
}

function fabricKindFor(tile: CityTile, token = tileToken(tile)): FabricKind {
	const renderer = (tile.renderer || tile.prototypeId).toLowerCase();
	if (renderer.startsWith('pond-interior')) return 'pond';
	if (renderer.startsWith('pond-bank') || renderer.startsWith('pond-corner')) {
		return 'pond-bank';
	}
	if (renderer.startsWith('tram-road')) return 'tram';
	if (renderer.startsWith('road') || renderer === 'lane-road-transition') return 'road';
	if (renderer.startsWith('lane')) return 'lane';
	if (renderer.startsWith('footpath')) return 'footpath';
	if (renderer === 'tree-patch') return 'tree-patch';
	if (renderer === 'open-patch') return 'open';
	if (renderer === 'parcel') return 'parcel';
	if (hasToken(token, 'pond-bank')) return 'pond-bank';
	if (hasToken(token, 'pond') || hasToken(token, ' water')) return 'pond';
	if (hasToken(token, 'tram')) return 'tram';
	if (hasToken(token, 'road')) return 'road';
	if (hasToken(token, 'lane')) return 'lane';
	if (hasToken(token, 'footpath') || hasToken(token, ' foot')) return 'footpath';
	if (hasToken(token, 'tree-patch')) return 'tree-patch';
	if (hasToken(token, 'courtyard') || hasToken(token, ' open')) return 'open';
	if (hasToken(token, 'parcel') || hasToken(token, 'buildable')) return 'parcel';
	return 'unknown';
}

function occupationKindFor(tile: CityTile, token = tileToken(tile)): OccupationKind {
	const renderer = (tile.renderer || tile.prototypeId).toLowerCase();
	switch (renderer) {
		case 'empty':
			return 'empty';
		case 'partial-parcel':
			return 'partial';
		case 'old-house':
			return 'house';
		case 'crumbling-house':
			return 'crumbling-house';
		case 'verandah-house':
			return 'verandah-house';
		case 'balcony-house':
			return 'balcony-house';
		case 'corner-house':
			return 'corner-house';
		case 'sweet-shop':
			return 'sweet-shop';
		case 'tea-stall':
			return 'tea-stall';
		case 'garage':
			return 'garage';
		case 'workshop':
			return 'workshop';
		case 'temple':
			return 'temple';
		case 'tree':
			return 'tree';
		case 'permanent-sand-pile':
			return 'sand';
		case 'flyover-pillar':
			return 'pillar';
		case 'tram-stop':
			return 'tram-stop';
		case 'pond-ghat':
			return 'ghat';
	}
	if (hasToken(token, 'sweet-shop')) return 'sweet-shop';
	if (hasToken(token, 'tea-stall')) return 'tea-stall';
	if (hasToken(token, 'crumbling')) return 'crumbling-house';
	if (hasToken(token, 'verandah')) return 'verandah-house';
	if (hasToken(token, 'balcony')) return 'balcony-house';
	if (hasToken(token, 'corner-house')) return 'corner-house';
	if (hasToken(token, 'house')) return 'house';
	if (hasToken(token, 'garage')) return 'garage';
	if (hasToken(token, 'workshop')) return 'workshop';
	if (hasToken(token, 'temple')) return 'temple';
	if (hasToken(token, 'tram-stop')) return 'tram-stop';
	if (hasToken(token, 'ghat')) return 'ghat';
	if (hasToken(token, 'pillar')) return 'pillar';
	if (hasToken(token, 'sand')) return 'sand';
	if (hasToken(token, 'tree')) return 'tree';
	if (hasToken(token, 'partial')) return 'partial';
	if (hasToken(token, 'empty')) return 'empty';
	return 'unknown';
}

function renderTile(
	tile: CityTile | undefined,
	citySeed: string,
	x: number,
	y: number,
	pass: 'fabric' | 'occupation'
): RenderTile | null {
	if (!tile) return null;
	const token = tileToken(tile);
	const details = cityMicroDetails(citySeed, x, y, tile.id || tile.prototypeId);
	return {
		tile,
		token,
		fabricKind: pass === 'fabric' ? fabricKindFor(tile, token) : 'unknown',
		occupationKind: pass === 'occupation' ? occupationKindFor(tile, token) : 'unknown',
		details
	};
}

function appendIndexed<T extends { cell: CellCoordinate }>(
	indexed: (T[] | undefined)[],
	item: T,
	width: number,
	height: number
): void {
	const { x, y } = item.cell;
	if (x < 0 || y < 0 || x >= width || y >= height) return;
	const index = y * width + x;
	const bucket = indexed[index] ?? [];
	bucket.push(item);
	indexed[index] = bucket;
}

function cityRenderModel(result: CityResult): CityRenderModel {
	const cached = modelCache.get(result);
	if (cached) return cached;

	const count = result.width * result.height;
	const cells = new Array<RenderCell>(count);
	const infrastructureByCell = new Array<InfrastructureDetail[] | undefined>(count);
	const patchesByCell = new Array<MunicipalPatch[] | undefined>(count);
	for (let index = 0; index < count; index += 1) {
		const x = index % result.width;
		const y = Math.floor(index / result.width);
		cells[index] = {
			index,
			x,
			y,
			fabric: renderTile(result.fabricTiles[index], result.seed, x, y, 'fabric'),
			occupation: renderTile(result.occupationTiles[index], result.seed, x, y, 'occupation')
		};
	}
	for (const detail of result.infrastructure) {
		appendIndexed(infrastructureByCell, detail, result.width, result.height);
	}
	for (const patch of result.municipalPatches) {
		appendIndexed(patchesByCell, patch, result.width, result.height);
	}

	const model: CityRenderModel = {
		cells,
		infrastructureByCell,
		patchesByCell
	};
	modelCache.set(result, model);
	return model;
}

function isFabricRevealed(options: CityRenderOptions, index: number): boolean {
	const overlay = options.overlay;
	return (overlay?.revealedFabricCells ?? overlay?.revealedCells)?.[index] !== false;
}

function isOccupationRevealed(options: CityRenderOptions, index: number): boolean {
	const overlay = options.overlay;
	return (overlay?.revealedOccupationCells ?? overlay?.revealedCells)?.[index] !== false;
}

function isRevealed(options: CityRenderOptions, index: number): boolean {
	return isFabricRevealed(options, index) || isOccupationRevealed(options, index);
}

function withTileRotation(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	rotation: number,
	draw: () => void
): void {
	const centreX = x * CITY_TILE_SIZE + CITY_TILE_SIZE / 2;
	const centreY = y * CITY_TILE_SIZE + CITY_TILE_SIZE / 2;
	context.save();
	context.translate(centreX, centreY);
	context.rotate((rotation * Math.PI) / 2);
	draw();
	context.restore();
}

function applyInk(context: CanvasRenderingContext2D, palette: CityPalette, width = 1.6): void {
	context.strokeStyle = palette.ink;
	context.lineWidth = width;
	context.lineJoin = 'round';
	context.lineCap = 'round';
}

function drawGround(
	context: CanvasRenderingContext2D,
	cell: RenderCell,
	palette: CityPalette,
	elevation: number | undefined
): void {
	const details = cell.fabric?.details ?? cell.occupation?.details;
	const x = cell.x * CITY_TILE_SIZE;
	const y = cell.y * CITY_TILE_SIZE;
	const groundIndex = details?.groundIndex ?? (cell.x + cell.y) % palette.parcel.length;
	context.fillStyle = palette.parcel[groundIndex];
	context.fillRect(x, y, CITY_TILE_SIZE, CITY_TILE_SIZE);

	if (typeof elevation === 'number' && Number.isFinite(elevation)) {
		const alpha = Math.min(0.1, Math.abs(elevation) * 0.018);
		if (alpha > 0.004) {
			context.fillStyle =
				elevation > 0 ? `rgba(255, 244, 209, ${alpha})` : `rgba(40, 53, 45, ${alpha})`;
			context.fillRect(x, y, CITY_TILE_SIZE, CITY_TILE_SIZE);
		}
	}

	context.strokeStyle = palette.grid;
	context.lineWidth = 0.7;
	context.strokeRect(x + 0.35, y + 0.35, CITY_TILE_SIZE - 0.7, CITY_TILE_SIZE - 0.7);
	if (!details) return;

	context.save();
	context.fillStyle = palette.inkSoft;
	context.globalAlpha = 0.1;
	for (let index = 0; index < 4; index += 1) {
		const value = details.stains[index];
		const stainX = x + 7 + ((value * 47 + index * 13) % 48);
		const stainY = y + 8 + ((value * 31 + index * 19) % 45);
		context.beginPath();
		context.ellipse(
			stainX,
			stainY,
			1.1 + value * 2.8,
			0.7 + value * 1.5,
			value * 4,
			0,
			Math.PI * 2
		);
		context.fill();
	}
	context.restore();

	if (details.stains[0] > 0.46) {
		context.strokeStyle = palette.inkSoft;
		context.globalAlpha = 0.22;
		context.lineWidth = 0.65;
		context.beginPath();
		const startX = x + 9 + details.stains[1] * 23;
		const startY = y + 10 + details.stains[2] * 34;
		context.moveTo(startX, startY);
		context.lineTo(startX + 6 + details.crackBias * 3, startY + 5);
		context.lineTo(startX + 3 - details.crackBias * 2, startY + 11);
		context.lineTo(startX + 9, startY + 15);
		context.stroke();
		context.globalAlpha = 1;
	}
}

function passageWidth(passage: Passage): number {
	switch (passage) {
		case 'foot':
			return 17;
		case 'lane':
			return 28;
		case 'road':
			return 43;
		case 'tram':
			return 46;
		default:
			return 0;
	}
}

function passageColour(passage: Passage, palette: CityPalette): string {
	switch (passage) {
		case 'foot':
			return palette.footpath;
		case 'lane':
			return palette.lane;
		case 'road':
		case 'tram':
			return palette.road;
		default:
			return palette.courtyard;
	}
}

function drawPassageBranch(
	context: CanvasRenderingContext2D,
	direction: Direction,
	width: number,
	colour: string,
	palette: CityPalette
): void {
	if (width <= 0) return;
	const half = width / 2;
	const outline = 1.25;
	context.fillStyle = palette.inkSoft;
	switch (direction) {
		case 0:
			context.fillRect(-half - outline, -32, width + outline * 2, 33 + outline);
			context.fillStyle = colour;
			context.fillRect(-half, -32, width, 33);
			break;
		case 1:
			context.fillRect(-outline, -half - outline, 33 + outline, width + outline * 2);
			context.fillStyle = colour;
			context.fillRect(0, -half, 32, width);
			break;
		case 2:
			context.fillRect(-half - outline, -outline, width + outline * 2, 33 + outline);
			context.fillStyle = colour;
			context.fillRect(-half, 0, width, 32);
			break;
		case 3:
			context.fillRect(-32, -half - outline, 33 + outline, width + outline * 2);
			context.fillStyle = colour;
			context.fillRect(-32, -half, 32, width);
			break;
	}
}

function drawRoadMark(
	context: CanvasRenderingContext2D,
	direction: Direction,
	passage: Passage,
	palette: CityPalette
): void {
	if (passage !== 'road' && passage !== 'tram') return;
	context.save();
	context.strokeStyle = palette.yellow;
	context.globalAlpha = passage === 'tram' ? 0.28 : 0.5;
	context.lineWidth = 1.1;
	context.setLineDash([6, 6]);
	context.beginPath();
	switch (direction) {
		case 0:
			context.moveTo(0, -32);
			context.lineTo(0, -2);
			break;
		case 1:
			context.moveTo(2, 0);
			context.lineTo(32, 0);
			break;
		case 2:
			context.moveTo(0, 2);
			context.lineTo(0, 32);
			break;
		case 3:
			context.moveTo(-32, 0);
			context.lineTo(-2, 0);
			break;
	}
	context.stroke();
	context.restore();
}

function drawPassageSurface(
	context: CanvasRenderingContext2D,
	tile: CityTile,
	palette: CityPalette,
	kind: FabricKind,
	details: CityMicroDetails
): void {
	const edges = tile.edges ?? EMPTY_EDGES;
	let maximumWidth = kind === 'open' || kind === 'tree-patch' ? 22 : 0;
	let centreColour = kind === 'open' || kind === 'tree-patch' ? palette.courtyard : palette.lane;
	for (let direction = 0; direction < 4; direction += 1) {
		const passage = edges[direction].passage;
		const width = passageWidth(passage);
		if (width >= maximumWidth) {
			maximumWidth = width;
			centreColour = passageColour(passage, palette);
		}
	}
	if (maximumWidth <= 0 && (kind === 'lane' || kind === 'footpath')) maximumWidth = 24;
	if (maximumWidth <= 0 && (kind === 'road' || kind === 'tram')) maximumWidth = 42;
	if (maximumWidth <= 0) return;

	for (let direction = 0; direction < 4; direction += 1) {
		const passage = edges[direction].passage;
		const width = passageWidth(passage);
		if (width > 0) {
			drawPassageBranch(
				context,
				direction as Direction,
				width,
				passageColour(passage, palette),
				palette
			);
		}
	}
	context.fillStyle = palette.inkSoft;
	context.fillRect(
		-maximumWidth / 2 - 1.25,
		-maximumWidth / 2 - 1.25,
		maximumWidth + 2.5,
		maximumWidth + 2.5
	);
	context.fillStyle = centreColour;
	context.fillRect(-maximumWidth / 2, -maximumWidth / 2, maximumWidth, maximumWidth);

	for (let direction = 0; direction < 4; direction += 1) {
		drawRoadMark(context, direction as Direction, edges[direction].passage, palette);
	}

	context.save();
	context.globalAlpha = 0.17;
	context.strokeStyle = palette.ink;
	context.lineWidth = 0.65;
	const gritCount = kind === 'road' || kind === 'tram' ? 7 : 5;
	for (let index = 0; index < gritCount; index += 1) {
		const value = details.stains[index % 4];
		const gritX =
			-maximumWidth / 2 + 4 + ((value * 37 + index * 9) % Math.max(5, maximumWidth - 8));
		const gritY =
			-maximumWidth / 2 + 4 + ((value * 23 + index * 11) % Math.max(5, maximumWidth - 8));
		context.beginPath();
		context.moveTo(gritX, gritY);
		context.lineTo(gritX + 1.8 + value * 2, gritY + details.crackBias * 1.2);
		context.stroke();
	}
	context.restore();
}

function drawOpenPatch(
	context: CanvasRenderingContext2D,
	kind: FabricKind,
	palette: CityPalette,
	details: CityMicroDetails
): void {
	context.fillStyle = kind === 'tree-patch' ? palette.openGround : palette.courtyard;
	context.beginPath();
	context.roundRect(-27, -27, 54, 54, 5);
	context.fill();
	applyInk(context, palette, 1);
	context.globalAlpha = 0.4;
	context.stroke();
	context.globalAlpha = 1;
	context.strokeStyle = palette.inkSoft;
	context.lineWidth = 0.7;
	for (let index = -2; index <= 2; index += 1) {
		const offset = details.crackBias * 2;
		context.beginPath();
		context.moveTo(-22, index * 10 + offset);
		context.lineTo(22, index * 10 - offset);
		context.stroke();
	}
}

function drawPondSurface(
	context: CanvasRenderingContext2D,
	kind: FabricKind,
	palette: CityPalette,
	details: CityMicroDetails
): void {
	const bank = kind === 'pond-bank';
	context.fillStyle = palette.algae;
	context.fillRect(-32, -32, 64, 64);
	context.fillStyle = palette.pond;
	context.beginPath();
	context.roundRect(
		bank ? -24 : -32,
		bank ? -24 : -32,
		bank ? 48 : 64,
		bank ? 48 : 64,
		bank ? 12 : 2
	);
	context.fill();
	context.strokeStyle = palette.pondDeep;
	context.lineWidth = bank ? 2.5 : 1.1;
	context.stroke();

	context.save();
	context.globalAlpha = 0.18;
	context.strokeStyle = palette.ink;
	context.lineWidth = 0.8;
	for (let index = 0; index < 4; index += 1) {
		const phase = details.stains[index] * Math.PI * 2;
		const centreX = Math.cos(phase) * (bank ? 13 : 22);
		const centreY = Math.sin(phase) * (bank ? 13 : 22);
		context.beginPath();
		context.ellipse(
			centreX,
			centreY,
			4 + details.stains[index] * 6,
			1.7,
			phase * 0.2,
			0,
			Math.PI * 2
		);
		context.stroke();
	}
	context.restore();
}

function drawFabricSurface(
	context: CanvasRenderingContext2D,
	cellX: number,
	cellY: number,
	tile: CityTile,
	palette: CityPalette,
	details: CityMicroDetails
): void {
	const kind = fabricKindFor(tile);
	withTileRotation(context, cellX, cellY, 0, () => {
		switch (kind) {
			case 'pond':
			case 'pond-bank':
				drawPondSurface(context, kind, palette, details);
				break;
			case 'open':
			case 'tree-patch':
				drawOpenPatch(context, kind, palette, details);
				drawPassageSurface(context, tile, palette, kind, details);
				break;
			case 'footpath':
			case 'lane':
			case 'road':
			case 'tram':
				drawPassageSurface(context, tile, palette, kind, details);
				break;
			case 'parcel':
			case 'unknown':
				break;
		}
	});
}

function drawRailBranch(
	context: CanvasRenderingContext2D,
	direction: Direction,
	palette: CityPalette
): void {
	context.strokeStyle = palette.ink;
	context.lineWidth = 2.3;
	for (const offset of [-6, 6]) {
		context.beginPath();
		switch (direction) {
			case 0:
				context.moveTo(offset, 2);
				context.lineTo(offset, -32);
				break;
			case 1:
				context.moveTo(-2, offset);
				context.lineTo(32, offset);
				break;
			case 2:
				context.moveTo(offset, -2);
				context.lineTo(offset, 32);
				break;
			case 3:
				context.moveTo(2, offset);
				context.lineTo(-32, offset);
				break;
		}
		context.stroke();
		context.strokeStyle = palette.steel;
		context.lineWidth = 1.25;
		context.stroke();
		context.strokeStyle = palette.ink;
		context.lineWidth = 2.3;
	}

	context.strokeStyle = palette.inkSoft;
	context.lineWidth = 0.8;
	for (let sleeper = 8; sleeper <= 30; sleeper += 8) {
		context.beginPath();
		switch (direction) {
			case 0:
				context.moveTo(-9, -sleeper);
				context.lineTo(9, -sleeper);
				break;
			case 1:
				context.moveTo(sleeper, -9);
				context.lineTo(sleeper, 9);
				break;
			case 2:
				context.moveTo(-9, sleeper);
				context.lineTo(9, sleeper);
				break;
			case 3:
				context.moveTo(-sleeper, -9);
				context.lineTo(-sleeper, 9);
				break;
		}
		context.stroke();
	}
}

function drawDrainBranch(
	context: CanvasRenderingContext2D,
	direction: Direction,
	palette: CityPalette,
	culvert: boolean
): void {
	context.save();
	context.strokeStyle = palette.ink;
	context.lineWidth = culvert ? 6 : 5;
	context.setLineDash(culvert ? [4, 3] : []);
	context.beginPath();
	switch (direction) {
		case 0:
			context.moveTo(0, 2);
			context.lineTo(0, -32);
			break;
		case 1:
			context.moveTo(-2, 0);
			context.lineTo(32, 0);
			break;
		case 2:
			context.moveTo(0, -2);
			context.lineTo(0, 32);
			break;
		case 3:
			context.moveTo(2, 0);
			context.lineTo(-32, 0);
			break;
	}
	context.stroke();
	context.strokeStyle = culvert ? palette.steel : palette.drain;
	context.lineWidth = culvert ? 2.8 : 2.4;
	context.stroke();
	context.restore();
}

function drawFabricInfrastructure(
	context: CanvasRenderingContext2D,
	cellX: number,
	cellY: number,
	tile: CityTile,
	palette: CityPalette
): void {
	withTileRotation(context, cellX, cellY, 0, () => {
		const edges = tile.edges ?? EMPTY_EDGES;
		for (let direction = 0; direction < 4; direction += 1) {
			const edge = edges[direction];
			if (edge.passage === 'tram') {
				drawRailBranch(context, direction as Direction, palette);
			}
			if (edge.drain !== 'none') {
				drawDrainBranch(context, direction as Direction, palette, edge.drain === 'culvert');
			}
		}
	});
}

function drawStructureFootprint(
	context: CanvasRenderingContext2D,
	cell: RenderCell,
	palette: CityPalette
): void {
	if (!cell.occupation) return;
	const kind = cell.occupation.occupationKind;
	const rotation = cell.occupation.tile.rotation;
	withTileRotation(context, cell.x, cell.y, rotation, () => {
		context.fillStyle = palette.shadow;
		switch (kind) {
			case 'house':
			case 'crumbling-house':
			case 'verandah-house':
			case 'balcony-house':
			case 'corner-house':
			case 'sweet-shop':
			case 'garage':
			case 'workshop':
			case 'temple':
				context.beginPath();
				context.roundRect(-25 + 4, -25 + 5, 50, 50, 4);
				context.fill();
				context.fillStyle = palette.inkSoft;
				context.fillRect(-25, -24, 50, 49);
				break;
			case 'tea-stall':
			case 'tram-stop':
			case 'partial':
				context.beginPath();
				context.ellipse(3, 13, 25, 10, 0, 0, Math.PI * 2);
				context.fill();
				break;
			case 'tree':
				context.beginPath();
				context.ellipse(3, 10, 22, 12, 0, 0, Math.PI * 2);
				context.fill();
				break;
			case 'sand':
				context.beginPath();
				context.ellipse(4, 8, 25, 13, -0.08, 0, Math.PI * 2);
				context.fill();
				break;
			case 'pillar':
				context.beginPath();
				context.ellipse(5, 9, 13, 9, 0, 0, Math.PI * 2);
				context.fill();
				break;
			case 'ghat':
			case 'empty':
			case 'unknown':
				break;
		}
	});
}

function drawRoofTexture(
	context: CanvasRenderingContext2D,
	palette: CityPalette,
	details: CityMicroDetails,
	corrugated = false
): void {
	context.save();
	context.strokeStyle = palette.inkSoft;
	context.globalAlpha = 0.45;
	context.lineWidth = 0.65;
	if (corrugated) {
		for (let x = -20; x <= 20; x += 5) {
			context.beginPath();
			context.moveTo(x, -21);
			context.lineTo(x + details.crackBias * 2, 15);
			context.stroke();
		}
	} else {
		for (let index = 0; index < 4; index += 1) {
			const value = details.stains[index];
			context.beginPath();
			context.moveTo(-18 + index * 11, -16 + value * 6);
			context.lineTo(-13 + index * 10, -11 + value * 4);
			context.lineTo(-15 + index * 10, -5 + value * 3);
			context.stroke();
		}
	}
	context.restore();
}

function drawWindow(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	open: boolean,
	palette: CityPalette
): void {
	context.fillStyle = palette.glass;
	context.strokeStyle = palette.ink;
	context.lineWidth = 1.1;
	context.fillRect(x, y, width, height);
	context.strokeRect(x, y, width, height);
	context.fillStyle = palette.wood;
	if (open) {
		context.fillRect(x - 3, y, 2.5, height);
		context.fillRect(x + width + 0.5, y, 2.5, height);
	} else {
		context.fillRect(x + width / 2 - 0.7, y, 1.4, height);
	}
}

function drawWaterTank(
	context: CanvasRenderingContext2D,
	palette: CityPalette,
	details: CityMicroDetails
): void {
	if (!details.hasTank) return;
	context.fillStyle = details.paintIndex % 2 === 0 ? palette.tarpaulin : palette.inkSoft;
	context.strokeStyle = palette.ink;
	context.lineWidth = 1.1;
	context.beginPath();
	context.ellipse(11, -18, 6, 2.2, 0, Math.PI, Math.PI * 2);
	context.lineTo(17, -11);
	context.ellipse(11, -11, 6, 2.2, 0, 0, Math.PI);
	context.closePath();
	context.fill();
	context.stroke();
}

function drawLaundry(
	context: CanvasRenderingContext2D,
	palette: CityPalette,
	details: CityMicroDetails,
	y = 17
): void {
	if (!details.hasLaundry) return;
	context.strokeStyle = palette.ink;
	context.lineWidth = 0.7;
	context.beginPath();
	context.moveTo(-17, y);
	context.quadraticCurveTo(0, y + 3, 17, y);
	context.stroke();
	context.fillStyle = palette.oxide;
	context.fillRect(-11, y + 1, 5, 5);
	context.fillStyle = palette.mint;
	context.fillRect(-1, y + 2, 6, 4);
	context.fillStyle = palette.yellow;
	context.fillRect(9, y + 1, 4, 6);
}

function drawCracks(
	context: CanvasRenderingContext2D,
	palette: CityPalette,
	details: CityMicroDetails
): void {
	context.save();
	context.strokeStyle = palette.inkSoft;
	context.lineWidth = 0.8;
	context.beginPath();
	context.moveTo(-17 + details.crackBias * 3, -13);
	context.lineTo(-11, -6);
	context.lineTo(-14 + details.crackBias * 4, 1);
	context.lineTo(-8, 7);
	context.moveTo(16, -8);
	context.lineTo(11 + details.crackBias * 2, -2);
	context.lineTo(15, 5);
	context.stroke();
	context.restore();
}

function drawAwning(
	context: CanvasRenderingContext2D,
	palette: CityPalette,
	details: CityMicroDetails,
	width = 43,
	y = 13
): void {
	context.fillStyle = details.awningPattern % 2 === 0 ? palette.oxide : palette.tarpaulin;
	context.strokeStyle = palette.ink;
	context.lineWidth = 1.2;
	context.beginPath();
	context.moveTo(-width / 2, y);
	context.lineTo(width / 2, y);
	context.lineTo(width / 2 - 3, y + 10);
	context.lineTo(-width / 2 + 3, y + 10);
	context.closePath();
	context.fill();
	context.stroke();
	context.save();
	context.globalAlpha = 0.78;
	context.strokeStyle = details.awningPattern % 2 === 0 ? palette.plaster[0] : palette.yellow;
	context.lineWidth = 2.2;
	for (let x = -width / 2 + 5; x < width / 2 - 2; x += 8) {
		context.beginPath();
		context.moveTo(x, y + 1);
		context.lineTo(x + 1, y + 8);
		context.stroke();
	}
	context.restore();
}

function drawSign(
	context: CanvasRenderingContext2D,
	text: string,
	palette: CityPalette,
	details: CityMicroDetails,
	y = 6
): void {
	context.fillStyle = details.signShape === 2 ? palette.yellow : palette.oxide;
	context.strokeStyle = palette.ink;
	context.lineWidth = 1;
	context.beginPath();
	if (details.signShape === 1) {
		context.roundRect(-15, y - 6, 30, 10, 3);
	} else {
		context.rect(-16, y - 6, 32, 10);
	}
	context.fill();
	context.stroke();
	context.fillStyle = palette.ink;
	context.font = '700 5.5px ui-serif, Georgia, serif';
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.fillText(text, 0, y - 1, 27);
}

function drawHouse(
	context: CanvasRenderingContext2D,
	kind: OccupationKind,
	palette: CityPalette,
	details: CityMicroDetails
): void {
	const plaster = palette.plaster[details.paintIndex % palette.plaster.length];
	const roof = palette.roof[details.roofIndex % palette.roof.length];
	context.fillStyle = plaster;
	context.strokeStyle = palette.ink;
	context.lineWidth = 1.5;
	context.fillRect(-24, -22, 48, 46);
	context.strokeRect(-24, -22, 48, 46);

	context.fillStyle = roof;
	context.beginPath();
	context.moveTo(-25, -22);
	context.lineTo(-21 + details.crackBias, -26);
	context.lineTo(22, -25);
	context.lineTo(25, -20);
	context.lineTo(22, 14);
	context.lineTo(-23, 15);
	context.closePath();
	context.fill();
	context.stroke();
	drawRoofTexture(context, palette, details, kind === 'workshop');

	context.fillStyle = plaster;
	context.fillRect(-22, 14, 44, 9);
	context.strokeRect(-22, 14, 44, 9);
	drawWindow(context, -17, 16, 8, 6, details.shutterState % 2 === 0, palette);
	drawWindow(context, 9, 16, 8, 6, details.shutterState > 1, palette);

	context.fillStyle = palette.wood;
	context.fillRect(-4, 13, 8, 10);
	context.strokeRect(-4, 13, 8, 10);

	if (kind === 'crumbling-house') drawCracks(context, palette, details);
	if (kind === 'verandah-house' || kind === 'balcony-house') {
		context.fillStyle = palette.shadow;
		context.fillRect(-22, 19, 44, 8);
		context.strokeStyle = palette.ink;
		context.lineWidth = 1.1;
		context.strokeRect(-22, 17, 44, 8);
		for (let x = -18; x <= 18; x += 9) {
			context.beginPath();
			context.moveTo(x, 18);
			context.lineTo(x, 27);
			context.stroke();
		}
	}
	if (kind === 'balcony-house') {
		context.strokeStyle = palette.ink;
		context.lineWidth = 1.1;
		context.strokeRect(-17, 7, 34, 8);
		for (let x = -14; x <= 14; x += 7) {
			context.beginPath();
			context.moveTo(x, 8);
			context.lineTo(x, 15);
			context.stroke();
		}
		drawLaundry(context, palette, details, 8);
	}
	if (kind === 'corner-house') {
		drawWindow(context, 18, -9, 6, 9, details.shutterState !== 3, palette);
	}
	drawWaterTank(context, palette, details);
}

function drawShop(
	context: CanvasRenderingContext2D,
	kind: 'sweet-shop' | 'garage' | 'workshop',
	palette: CityPalette,
	details: CityMicroDetails
): void {
	drawHouse(context, kind === 'workshop' ? 'workshop' : 'house', palette, details);
	if (kind === 'garage') {
		context.fillStyle = palette.steel;
		context.strokeStyle = palette.ink;
		context.lineWidth = 1.2;
		context.fillRect(-17, 10, 34, 13);
		context.strokeRect(-17, 10, 34, 13);
		context.strokeStyle = palette.inkSoft;
		for (let y = 13; y <= 21; y += 3) {
			context.beginPath();
			context.moveTo(-16, y);
			context.lineTo(16, y);
			context.stroke();
		}
		drawSign(context, 'GARAGE', palette, details, 3);
		return;
	}
	drawAwning(context, palette, details, kind === 'workshop' ? 39 : 45, 12);
	drawSign(context, kind === 'sweet-shop' ? 'MISTI' : 'WORKS', palette, details, 4);
}

function drawTeaStall(
	context: CanvasRenderingContext2D,
	palette: CityPalette,
	details: CityMicroDetails
): void {
	context.fillStyle = palette.wood;
	context.strokeStyle = palette.ink;
	context.lineWidth = 1.4;
	context.fillRect(-20, 5, 40, 17);
	context.strokeRect(-20, 5, 40, 17);
	context.fillStyle = details.awningPattern % 2 === 0 ? palette.tarpaulin : palette.oxide;
	context.beginPath();
	context.moveTo(-25, 3);
	context.lineTo(-18, -17);
	context.lineTo(18, -16);
	context.lineTo(25, 3);
	context.closePath();
	context.fill();
	context.stroke();
	context.strokeStyle = palette.ink;
	for (const x of [-19, 19]) {
		context.beginPath();
		context.moveTo(x, 3);
		context.lineTo(x, 24);
		context.stroke();
	}
	context.fillStyle = palette.steel;
	context.beginPath();
	context.ellipse(8, 2, 5, 2.4, 0, 0, Math.PI * 2);
	context.fill();
	context.stroke();
	drawSign(context, 'CHA', palette, details, -4);
}

function drawTemple(
	context: CanvasRenderingContext2D,
	palette: CityPalette,
	details: CityMicroDetails
): void {
	const plaster = palette.plaster[details.paintIndex % palette.plaster.length];
	context.fillStyle = plaster;
	context.strokeStyle = palette.ink;
	context.lineWidth = 1.5;
	context.beginPath();
	context.roundRect(-21, -15, 42, 38, 3);
	context.fill();
	context.stroke();
	context.fillStyle = palette.roof[details.roofIndex % palette.roof.length];
	context.beginPath();
	context.moveTo(-24, -14);
	context.lineTo(0, -27);
	context.lineTo(24, -14);
	context.closePath();
	context.fill();
	context.stroke();
	context.fillStyle = palette.wood;
	context.fillRect(-5, 7, 10, 16);
	context.strokeRect(-5, 7, 10, 16);
	context.strokeStyle = palette.yellow;
	context.lineWidth = 2;
	context.strokeRect(-17, -8, 34, 25);
}

function drawTree(
	context: CanvasRenderingContext2D,
	palette: CityPalette,
	details: CityMicroDetails
): void {
	context.strokeStyle = palette.wood;
	context.lineWidth = 5;
	context.beginPath();
	context.moveTo(0, 18);
	context.lineTo(details.crackBias * 3, -4);
	context.stroke();
	context.fillStyle = palette.treeDark;
	for (let index = 0; index < 5; index += 1) {
		const angle = details.detailAngle + index * 1.25;
		context.beginPath();
		context.arc(
			Math.cos(angle) * 9,
			-6 + Math.sin(angle) * 7,
			10 + (index % 2) * 2,
			0,
			Math.PI * 2
		);
		context.fill();
	}
	context.fillStyle = palette.tree;
	for (let index = 0; index < 4; index += 1) {
		const angle = details.detailAngle * 0.7 + index * 1.55;
		context.beginPath();
		context.arc(
			Math.cos(angle) * 8,
			-8 + Math.sin(angle) * 6,
			7 + details.stains[index] * 2,
			0,
			Math.PI * 2
		);
		context.fill();
	}
	context.strokeStyle = palette.ink;
	context.lineWidth = 1.1;
	context.beginPath();
	context.arc(0, -7, 20, 0, Math.PI * 2);
	context.stroke();
}

function drawSand(
	context: CanvasRenderingContext2D,
	palette: CityPalette,
	details: CityMicroDetails
): void {
	context.fillStyle = palette.sand;
	context.strokeStyle = palette.ink;
	context.lineWidth = 1.4;
	context.beginPath();
	context.moveTo(-25, 18);
	context.quadraticCurveTo(-14, -8, details.crackBias * 5, -15);
	context.quadraticCurveTo(15, -7, 25, 18);
	context.closePath();
	context.fill();
	context.stroke();
	context.strokeStyle = palette.inkSoft;
	context.lineWidth = 0.7;
	for (let index = 0; index < 6; index += 1) {
		const y = -4 + index * 4;
		const half = 7 + index * 2.2;
		context.beginPath();
		context.moveTo(-half, y);
		context.lineTo(half, y + details.crackBias);
		context.stroke();
	}
}

function drawPillar(context: CanvasRenderingContext2D, palette: CityPalette): void {
	context.fillStyle = palette.road;
	context.strokeStyle = palette.ink;
	context.lineWidth = 1.6;
	context.beginPath();
	context.ellipse(0, 15, 11, 5, 0, 0, Math.PI * 2);
	context.lineTo(9, -18);
	context.ellipse(0, -18, 9, 4, 0, Math.PI * 2, 0, true);
	context.closePath();
	context.fill();
	context.stroke();
	context.fillStyle = palette.steel;
	context.fillRect(-15, -24, 30, 7);
	context.strokeRect(-15, -24, 30, 7);
	context.strokeStyle = palette.yellow;
	context.lineWidth = 2;
	context.beginPath();
	context.moveTo(-8, 4);
	context.lineTo(8, 4);
	context.stroke();
}

function drawTramStop(
	context: CanvasRenderingContext2D,
	palette: CityPalette,
	details: CityMicroDetails
): void {
	context.strokeStyle = palette.ink;
	context.lineWidth = 1.6;
	for (const x of [-17, 17]) {
		context.beginPath();
		context.moveTo(x, -9);
		context.lineTo(x, 23);
		context.stroke();
	}
	context.fillStyle = details.awningPattern % 2 === 0 ? palette.yellow : palette.tarpaulin;
	context.beginPath();
	context.moveTo(-23, -9);
	context.lineTo(-17, -18);
	context.lineTo(18, -17);
	context.lineTo(23, -8);
	context.closePath();
	context.fill();
	context.stroke();
	context.fillStyle = palette.wood;
	context.fillRect(-16, 13, 32, 5);
	context.strokeRect(-16, 13, 32, 5);
	drawSign(context, 'TRAM', palette, details, 3);
}

function drawPartialParcel(
	context: CanvasRenderingContext2D,
	palette: CityPalette,
	details: CityMicroDetails
): void {
	context.fillStyle = palette.tarpaulin;
	context.strokeStyle = palette.ink;
	context.lineWidth = 1.2;
	context.beginPath();
	context.moveTo(-23, 15);
	context.lineTo(-18, -15);
	context.lineTo(17, -12 + details.crackBias * 2);
	context.lineTo(24, 17);
	context.closePath();
	context.fill();
	context.stroke();
	context.fillStyle = palette.oxide;
	for (let index = 0; index < 5; index += 1) {
		const x = -19 + (index % 3) * 9;
		const y = 17 - Math.floor(index / 3) * 5;
		context.fillRect(x, y, 8, 4);
		context.strokeRect(x, y, 8, 4);
	}
}

function drawGhat(context: CanvasRenderingContext2D, palette: CityPalette): void {
	context.fillStyle = palette.plaster[1];
	context.strokeStyle = palette.ink;
	context.lineWidth = 1.1;
	for (let index = 0; index < 5; index += 1) {
		const width = 42 - index * 6;
		const y = -4 + index * 6;
		context.fillRect(-width / 2, y, width, 5);
		context.strokeRect(-width / 2, y, width, 5);
	}
	context.strokeStyle = palette.yellow;
	context.lineWidth = 2;
	context.beginPath();
	context.moveTo(-23, -7);
	context.lineTo(-23, 25);
	context.moveTo(23, -7);
	context.lineTo(23, 25);
	context.stroke();
}

function drawOccupationDetails(
	context: CanvasRenderingContext2D,
	cellX: number,
	cellY: number,
	tile: CityTile,
	palette: CityPalette,
	details: CityMicroDetails
): void {
	const kind = occupationKindFor(tile);
	withTileRotation(context, cellX, cellY, tile.rotation, () => {
		switch (kind) {
			case 'house':
			case 'crumbling-house':
			case 'verandah-house':
			case 'balcony-house':
			case 'corner-house':
				drawHouse(context, kind, palette, details);
				break;
			case 'sweet-shop':
			case 'garage':
			case 'workshop':
				drawShop(context, kind, palette, details);
				break;
			case 'tea-stall':
				drawTeaStall(context, palette, details);
				break;
			case 'temple':
				drawTemple(context, palette, details);
				break;
			case 'tree':
				drawTree(context, palette, details);
				break;
			case 'sand':
				drawSand(context, palette, details);
				break;
			case 'pillar':
				drawPillar(context, palette);
				break;
			case 'tram-stop':
				drawTramStop(context, palette, details);
				break;
			case 'partial':
				drawPartialParcel(context, palette, details);
				break;
			case 'ghat':
				drawGhat(context, palette);
				break;
			case 'empty':
			case 'unknown':
				if (details.hasPlant) {
					context.fillStyle = palette.tree;
					context.beginPath();
					context.arc(18, 17, 3.5, 0, Math.PI * 2);
					context.fill();
				}
				break;
		}
	});
}

function directionPoint(direction: Direction, length = 25): CellCoordinate {
	switch (direction) {
		case 0:
			return { x: 0, y: -length };
		case 1:
			return { x: length, y: 0 };
		case 2:
			return { x: 0, y: length };
		case 3:
			return { x: -length, y: 0 };
	}
}

function drawInfrastructureUnderlay(
	context: CanvasRenderingContext2D,
	cell: RenderCell,
	detail: InfrastructureDetail,
	palette: CityPalette
): void {
	withTileRotation(context, cell.x, cell.y, 0, () => {
		switch (detail.kind) {
			case 'drain':
			case 'culvert': {
				const from = detail.from ?? 0;
				const to = detail.to ?? (((from + 2) % 4) as Direction);
				drawDrainBranch(context, from, palette, detail.kind === 'culvert');
				drawDrainBranch(context, to, palette, detail.kind === 'culvert');
				if (detail.uphill) {
					context.fillStyle = palette.oxide;
					context.beginPath();
					context.moveTo(-3, -5);
					context.lineTo(5, 0);
					context.lineTo(-3, 5);
					context.closePath();
					context.fill();
				}
				break;
			}
			case 'bridge':
				context.fillStyle = palette.plaster[1];
				context.strokeStyle = palette.ink;
				context.lineWidth = 1.4;
				context.fillRect(-25, -10, 50, 20);
				context.strokeRect(-25, -10, 50, 20);
				for (let x = -20; x <= 20; x += 8) {
					context.beginPath();
					context.moveTo(x, -9);
					context.lineTo(x, 9);
					context.stroke();
				}
				break;
			case 'steps':
			case 'ghat':
				drawGhat(context, palette);
				break;
			default:
				break;
		}
	});
}

function drawPole(context: CanvasRenderingContext2D, palette: CityPalette, large = false): void {
	context.fillStyle = palette.shadow;
	context.beginPath();
	context.ellipse(4, 7, large ? 8 : 6, 3, 0.2, 0, Math.PI * 2);
	context.fill();
	context.strokeStyle = palette.ink;
	context.lineWidth = large ? 4 : 3;
	context.beginPath();
	context.moveTo(0, 9);
	context.lineTo(0, -17);
	context.stroke();
	context.strokeStyle = palette.steel;
	context.lineWidth = large ? 2.2 : 1.6;
	context.stroke();
	context.strokeStyle = palette.ink;
	context.lineWidth = 1.3;
	context.beginPath();
	context.moveTo(-8, -14);
	context.lineTo(8, -14);
	context.stroke();
	for (const x of [-6, 6]) {
		context.fillStyle = palette.plaster[0];
		context.beginPath();
		context.arc(x, -14, 1.7, 0, Math.PI * 2);
		context.fill();
		context.stroke();
	}
}

function drawWire(
	context: CanvasRenderingContext2D,
	from: Direction,
	to: Direction,
	palette: CityPalette,
	offset = 0
): void {
	const start = directionPoint(from, 32);
	const end = directionPoint(to, 32);
	context.strokeStyle = palette.ink;
	context.lineWidth = 1.1;
	context.beginPath();
	context.moveTo(start.x, start.y);
	context.quadraticCurveTo(offset, 5 + offset * 0.3, end.x, end.y);
	context.stroke();
}

function drawInfrastructureDetails(
	context: CanvasRenderingContext2D,
	cell: RenderCell,
	detail: InfrastructureDetail,
	palette: CityPalette
): void {
	withTileRotation(context, cell.x, cell.y, 0, () => {
		switch (detail.kind) {
			case 'electric-pole':
				drawPole(context, palette);
				break;
			case 'overhead-wire':
			case 'tram-wire':
				drawWire(
					context,
					detail.from ?? 3,
					detail.to ?? 1,
					palette,
					detail.kind === 'tram-wire' ? -2 : 2
				);
				break;
			default:
				break;
		}
	});
}

function drawPatchGeometry(
	context: CanvasRenderingContext2D,
	patch: MunicipalPatch,
	palette: CityPalette
): void {
	switch (patch.anomalyType) {
		case 'balcony-over-lane':
			context.fillStyle = palette.oxide;
			context.fillRect(-27, -7, 54, 14);
			context.strokeRect(-27, -7, 54, 14);
			for (let x = -22; x <= 22; x += 8) {
				context.beginPath();
				context.moveTo(x, -6);
				context.lineTo(x + 4, 6);
				context.stroke();
			}
			break;
		case 'lane-through-bedroom':
			context.fillStyle = palette.lane;
			context.fillRect(-32, -9, 64, 18);
			context.strokeRect(-32, -9, 64, 18);
			drawWindow(context, -19, -7, 8, 12, true, palette);
			drawWindow(context, 11, -7, 8, 12, true, palette);
			break;
		case 'pole-through-verandah':
			drawPole(context, palette, true);
			break;
		case 'uphill-drain':
			context.strokeStyle = palette.drain;
			context.lineWidth = 5;
			context.beginPath();
			context.moveTo(0, 27);
			context.lineTo(0, -27);
			context.stroke();
			context.fillStyle = palette.oxide;
			context.beginPath();
			context.moveTo(0, -25);
			context.lineTo(-7, -14);
			context.lineTo(7, -14);
			context.closePath();
			context.fill();
			break;
		case 'tram-through-garage':
			drawRailBranch(context, 0, palette);
			drawRailBranch(context, 2, palette);
			context.strokeStyle = palette.oxide;
			context.lineWidth = 3;
			context.strokeRect(-19, -21, 38, 42);
			break;
		case 'pond-lane-bridge':
			context.fillStyle = palette.plaster[1];
			context.fillRect(-32, -10, 64, 20);
			context.strokeRect(-32, -10, 64, 20);
			break;
		case 'permanent-sand-occupation':
			drawSand(context, palette, cityMicroDetails(patch.id, patch.cell.x, patch.cell.y, patch.id));
			break;
		case 'building-around-pillar':
			drawPillar(context, palette);
			context.strokeStyle = palette.oxide;
			context.lineWidth = 3;
			context.strokeRect(-23, -23, 46, 46);
			break;
		case 'construction-tarpaulin':
			context.fillStyle = palette.tarpaulin;
			context.globalAlpha = 0.74;
			context.fillRect(-28, -28, 56, 56);
			context.globalAlpha = 1;
			for (let x = -24; x <= 24; x += 8) {
				context.beginPath();
				context.moveTo(x, -28);
				context.lineTo(x + 5, 28);
				context.stroke();
			}
			break;
	}
}

function drawMunicipalPatch(
	context: CanvasRenderingContext2D,
	patch: MunicipalPatch,
	palette: CityPalette
): void {
	withTileRotation(context, patch.cell.x, patch.cell.y, 0, () => {
		context.save();
		applyInk(context, palette, 1.3);
		drawPatchGeometry(context, patch, palette);
		context.globalAlpha = 0.94;
		context.strokeStyle = palette.oxide;
		context.lineWidth = 2.2;
		context.setLineDash([7, 4, 2, 4]);
		context.strokeRect(-28, -28, 56, 56);
		context.setLineDash([]);
		context.rotate(-0.08);
		context.fillStyle = palette.paper;
		context.strokeStyle = palette.oxide;
		context.lineWidth = 1.3;
		context.fillRect(-23, 19, 46, 10);
		context.strokeRect(-23, 19, 46, 10);
		context.fillStyle = palette.oxide;
		context.font = '800 4.7px ui-monospace, Consolas, monospace';
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillText('RETROSPECTIVE PERMISSION', 0, 24, 42);
		context.restore();
	});
}

function transformToWorld(context: CanvasRenderingContext2D, options: CityRenderOptions): void {
	context.translate(options.viewportWidth / 2, options.viewportHeight / 2);
	context.scale(options.camera.zoom, options.camera.zoom);
	context.translate(-options.camera.x, -options.camera.y);
}

function prepareContext(
	context: CanvasRenderingContext2D,
	options: CityRenderOptions,
	clear: boolean
): void {
	const pixelRatio = options.pixelRatio ?? 1;
	context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
	if (clear) context.clearRect(0, 0, options.viewportWidth, options.viewportHeight);
	context.imageSmoothingEnabled = true;
	context.lineCap = 'round';
	context.lineJoin = 'round';
}

function drawMapBacking(
	context: CanvasRenderingContext2D,
	options: CityRenderOptions,
	palette: CityPalette
): void {
	const width = options.result.width * CITY_TILE_SIZE;
	const height = options.result.height * CITY_TILE_SIZE;
	context.save();
	context.shadowColor = palette.shadow;
	context.shadowBlur = options.appearance === 'high-contrast' ? 0 : 22 / options.camera.zoom;
	context.shadowOffsetY = 5 / options.camera.zoom;
	context.fillStyle = palette.paper;
	context.fillRect(0, 0, width, height);
	context.restore();
	context.strokeStyle = palette.paperEdge;
	context.lineWidth = 3 / options.camera.zoom;
	context.strokeRect(0, 0, width, height);
}

/**
 * Draw ordered passes 1–7: ground, surfaces, infrastructure, footprints,
 * structures, street details, and municipal exceptions.
 */
export function renderCityBase(
	context: CanvasRenderingContext2D,
	options: CityRenderOptions
): void {
	const appearance = options.appearance ?? 'paper';
	const palette = cityPalette(appearance);
	const model = cityRenderModel(options.result);
	prepareContext(context, options, true);
	context.fillStyle = palette.canvas;
	context.fillRect(0, 0, options.viewportWidth, options.viewportHeight);
	context.save();
	transformToWorld(context, options);
	drawMapBacking(context, options, palette);
	context.beginPath();
	context.rect(0, 0, options.result.width * CITY_TILE_SIZE, options.result.height * CITY_TILE_SIZE);
	context.clip();

	// Pass 1: municipal paper, ground, parcels, and elevation wash.
	for (const cell of model.cells) {
		drawGround(context, cell, palette, options.result.elevation[cell.index]);
	}

	// Pass 2: pond, lane, road, footpath, tram-road, and courtyard surfaces.
	for (const cell of model.cells) {
		if (!isFabricRevealed(options, cell.index) || !cell.fabric) continue;
		const input: CityTileRenderInput = {
			context,
			x: cell.x,
			y: cell.y,
			tile: cell.fabric.tile,
			rotation: cell.fabric.tile.rotation,
			citySeed: options.result.seed,
			microSeed: cell.fabric.details.microSeed,
			appearance,
			time: options.time ?? 0,
			mode: options.mode ?? 'interactive'
		};
		renderFabricTile(input, 'surface');
	}

	// Pass 3: drains, culverts, tram rails, bridges, steps, and ghats.
	for (const cell of model.cells) {
		if (!isFabricRevealed(options, cell.index)) continue;
		if (cell.fabric) {
			const input: CityTileRenderInput = {
				context,
				x: cell.x,
				y: cell.y,
				tile: cell.fabric.tile,
				rotation: cell.fabric.tile.rotation,
				citySeed: options.result.seed,
				microSeed: cell.fabric.details.microSeed,
				appearance,
				time: options.time ?? 0,
				mode: options.mode ?? 'interactive'
			};
			renderFabricTile(input, 'infrastructure');
		}
		const details = model.infrastructureByCell[cell.index];
		if (details) {
			for (const detail of details) drawInfrastructureUnderlay(context, cell, detail, palette);
		}
	}

	// Pass 4: shadows and structure footprints.
	for (const cell of model.cells) {
		if (isOccupationRevealed(options, cell.index)) {
			drawStructureFootprint(context, cell, palette);
		}
	}

	// Pass 5: roofs, walls, balconies, awnings, shutters, pillars, and stalls.
	for (const cell of model.cells) {
		if (!isOccupationRevealed(options, cell.index) || !cell.occupation) continue;
		const input: CityTileRenderInput = {
			context,
			x: cell.x,
			y: cell.y,
			tile: cell.occupation.tile,
			rotation: cell.occupation.tile.rotation,
			citySeed: options.result.seed,
			microSeed: cell.occupation.details.microSeed,
			appearance,
			time: options.time ?? 0,
			mode: options.mode ?? 'interactive'
		};
		renderOccupationTile(input);
	}

	// Pass 6: electrical poles and overhead utility wires.
	for (const cell of model.cells) {
		if (!isFabricRevealed(options, cell.index)) continue;
		const details = model.infrastructureByCell[cell.index];
		if (!details) continue;
		for (const detail of details) drawInfrastructureDetails(context, cell, detail, palette);
	}

	// Pass 7: visibly taped and stamped municipal exceptions.
	for (const cell of model.cells) {
		if (!isRevealed(options, cell.index)) continue;
		const patches = model.patchesByCell[cell.index];
		if (!patches) continue;
		for (const patch of patches) drawMunicipalPatch(context, patch, palette);
	}

	context.fillStyle = palette.wash;
	context.fillRect(
		0,
		0,
		options.result.width * CITY_TILE_SIZE,
		options.result.height * CITY_TILE_SIZE
	);
	context.restore();
}

export function renderFabricTile(
	input: CityTileRenderInput,
	pass: 'surface' | 'infrastructure' = 'surface'
): void {
	const palette = cityPalette(input.appearance);
	const details = cityMicroDetails(input.citySeed, input.x, input.y, input.tile.id);
	if (pass === 'surface') {
		drawFabricSurface(input.context, input.x, input.y, input.tile, palette, details);
	} else {
		drawFabricInfrastructure(input.context, input.x, input.y, input.tile, palette);
	}
}

export function renderOccupationTile(input: CityTileRenderInput): void {
	const palette = cityPalette(input.appearance);
	const details = cityMicroDetails(input.citySeed, input.x, input.y, input.tile.id);
	drawOccupationDetails(input.context, input.x, input.y, input.tile, palette, details);
}

function entropyMaximum(values: readonly (number | null | undefined)[] | undefined): number {
	if (!values) return 1;
	let maximum = 0;
	for (const value of values) {
		if (typeof value === 'number' && Number.isFinite(value)) maximum = Math.max(maximum, value);
	}
	return Math.max(1e-9, maximum);
}

function drawHatching(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
	colour: string,
	spacing = 9
): void {
	context.save();
	context.beginPath();
	context.rect(x, y, size, size);
	context.clip();
	context.strokeStyle = colour;
	context.lineWidth = 1;
	for (let offset = -size; offset <= size * 2; offset += spacing) {
		context.beginPath();
		context.moveTo(x + offset, y);
		context.lineTo(x + offset - size, y + size);
		context.stroke();
	}
	context.restore();
}

function drawUnresolvedAndEntropy(
	context: CanvasRenderingContext2D,
	options: CityRenderOptions,
	palette: CityPalette
): void {
	const overlay = options.overlay;
	if (!overlay) return;
	const maximum = entropyMaximum(overlay.entropy);
	const count = options.result.width * options.result.height;
	for (let index = 0; index < count; index += 1) {
		const x = (index % options.result.width) * CITY_TILE_SIZE;
		const y = Math.floor(index / options.result.width) * CITY_TILE_SIZE;
		const isHidden =
			(overlay.revealedFabricCells ?? overlay.revealedCells)?.[index] === false &&
			(overlay.revealedOccupationCells ?? overlay.revealedCells)?.[index] === false;
		const entropy = overlay.entropy?.[index];
		const candidates = overlay.candidateCounts?.[index];
		if (isHidden) {
			context.fillStyle = palette.paper;
			context.globalAlpha = 0.8;
			context.fillRect(x, y, CITY_TILE_SIZE, CITY_TILE_SIZE);
			context.globalAlpha = 0.46;
			drawHatching(context, x, y, CITY_TILE_SIZE, palette.ink, 10);
			context.globalAlpha = 1;
		}
		if (overlay.showEntropy && typeof entropy === 'number' && Number.isFinite(entropy)) {
			const normalised = Math.max(0, Math.min(1, entropy / maximum));
			const paletteIndex = Math.min(4, Math.floor(normalised * 5));
			context.fillStyle = palette.entropy[paletteIndex];
			context.fillRect(x, y, CITY_TILE_SIZE, CITY_TILE_SIZE);
			const hatchSpacing = 15 - paletteIndex * 2;
			context.globalAlpha = 0.25 + paletteIndex * 0.05;
			drawHatching(context, x, y, CITY_TILE_SIZE, palette.ink, hatchSpacing);
			context.globalAlpha = 1;
		}
		if (
			overlay.showEntropy &&
			typeof candidates === 'number' &&
			Number.isFinite(candidates) &&
			candidates > 1
		) {
			context.fillStyle = palette.ink;
			context.font = '700 10px ui-monospace, Consolas, monospace';
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			context.fillText(String(Math.round(candidates)), x + 32, y + 32);
		}
	}
}

function drawGrid(
	context: CanvasRenderingContext2D,
	result: CityResult,
	palette: CityPalette
): void {
	context.strokeStyle = palette.grid;
	context.lineWidth = 0.8;
	context.beginPath();
	for (let x = 0; x <= result.width; x += 1) {
		const coordinate = x * CITY_TILE_SIZE;
		context.moveTo(coordinate, 0);
		context.lineTo(coordinate, result.height * CITY_TILE_SIZE);
	}
	for (let y = 0; y <= result.height; y += 1) {
		const coordinate = y * CITY_TILE_SIZE;
		context.moveTo(0, coordinate);
		context.lineTo(result.width * CITY_TILE_SIZE, coordinate);
	}
	context.stroke();
}

function socketSymbol(edge: EdgeSignature): string {
	if (edge.water === 'pond') return '≈';
	if (edge.water === 'bank') return '∿';
	if (edge.passage === 'tram') return 'Ⅱ';
	if (edge.passage === 'road') return '═';
	if (edge.passage === 'lane') return '─';
	if (edge.passage === 'foot') return '·';
	if (edge.drain !== 'none') return '⌁';
	if (edge.face === 'entrance') return '⌂';
	if (edge.face === 'shopfront') return '▤';
	if (edge.face === 'garage-door') return '▥';
	if (edge.face === 'wall') return '┃';
	return '×';
}

function drawSockets(
	context: CanvasRenderingContext2D,
	result: CityResult,
	palette: CityPalette
): void {
	context.fillStyle = palette.ink;
	context.strokeStyle = palette.paper;
	context.lineWidth = 2.5;
	context.font = '700 7px ui-monospace, Consolas, monospace';
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	for (let index = 0; index < result.fabricTiles.length; index += 1) {
		const tile = result.fabricTiles[index];
		if (!tile) continue;
		const x = (index % result.width) * CITY_TILE_SIZE;
		const y = Math.floor(index / result.width) * CITY_TILE_SIZE;
		const positions = [
			{ x: x + 32, y: y + 4 },
			{ x: x + 60, y: y + 32 },
			{ x: x + 32, y: y + 60 },
			{ x: x + 4, y: y + 32 }
		] as const;
		for (let direction = 0; direction < 4; direction += 1) {
			const symbol = socketSymbol(tile.edges[direction]);
			const position = positions[direction];
			context.strokeText(symbol, position.x, position.y);
			context.fillText(symbol, position.x, position.y);
		}
	}
}

function cellKey(cell: CellCoordinate, width: number): number {
	return cell.y * width + cell.x;
}

function drawCellOutline(
	context: CanvasRenderingContext2D,
	cell: CellCoordinate,
	colour: string,
	style: 'solid' | 'dashed' | 'corners',
	width = 2.5
): void {
	const x = cell.x * CITY_TILE_SIZE;
	const y = cell.y * CITY_TILE_SIZE;
	context.save();
	context.strokeStyle = colour;
	context.lineWidth = width;
	context.setLineDash(style === 'dashed' ? [7, 5] : []);
	if (style !== 'corners') {
		context.strokeRect(x + 3, y + 3, CITY_TILE_SIZE - 6, CITY_TILE_SIZE - 6);
	} else {
		const inset = 4;
		const arm = 13;
		context.beginPath();
		context.moveTo(x + inset, y + inset + arm);
		context.lineTo(x + inset, y + inset);
		context.lineTo(x + inset + arm, y + inset);
		context.moveTo(x + CITY_TILE_SIZE - inset - arm, y + inset);
		context.lineTo(x + CITY_TILE_SIZE - inset, y + inset);
		context.lineTo(x + CITY_TILE_SIZE - inset, y + inset + arm);
		context.moveTo(x + CITY_TILE_SIZE - inset, y + CITY_TILE_SIZE - inset - arm);
		context.lineTo(x + CITY_TILE_SIZE - inset, y + CITY_TILE_SIZE - inset);
		context.lineTo(x + CITY_TILE_SIZE - inset - arm, y + CITY_TILE_SIZE - inset);
		context.moveTo(x + inset + arm, y + CITY_TILE_SIZE - inset);
		context.lineTo(x + inset, y + CITY_TILE_SIZE - inset);
		context.lineTo(x + inset, y + CITY_TILE_SIZE - inset - arm);
		context.stroke();
	}
	context.restore();
}

function rotatedOffset(dx: number, dy: number, rotation: number): CellCoordinate {
	switch (((rotation % 4) + 4) % 4) {
		case 1:
			return { x: -dy, y: dx };
		case 2:
			return { x: -dx, y: -dy };
		case 3:
			return { x: dy, y: -dx };
		default:
			return { x: dx, y: dy };
	}
}

function placementColour(preview: CityPlacementPreview, palette: CityPalette): string {
	switch (preview.validity) {
		case 'invalid':
			return palette.invalid;
		case 'conditional':
			return palette.conditional;
		default:
			return palette.valid;
	}
}

function drawPlacement(
	context: CanvasRenderingContext2D,
	preview: CityPlacementPreview,
	palette: CityPalette
): void {
	if (!preview.active || !preview.origin) return;
	const colour = placementColour(preview, palette);
	const footprint =
		preview.footprint && preview.footprint.length > 0
			? preview.footprint
			: [{ dx: 0, dy: 0, role: 'anchor' }];
	context.save();
	for (const footprintCell of footprint) {
		const offset = rotatedOffset(footprintCell.dx, footprintCell.dy, preview.rotation);
		const x = (preview.origin.x + offset.x) * CITY_TILE_SIZE;
		const y = (preview.origin.y + offset.y) * CITY_TILE_SIZE;
		context.fillStyle = colour;
		context.globalAlpha = 0.23;
		context.fillRect(x + 2, y + 2, CITY_TILE_SIZE - 4, CITY_TILE_SIZE - 4);
		context.globalAlpha = 0.8;
		drawHatching(context, x + 2, y + 2, CITY_TILE_SIZE - 4, colour, 9);
		context.globalAlpha = 1;
		context.strokeStyle = colour;
		context.lineWidth = 3;
		context.setLineDash(preview.validity === 'conditional' ? [8, 4] : []);
		context.strokeRect(x + 3, y + 3, CITY_TILE_SIZE - 6, CITY_TILE_SIZE - 6);
		context.setLineDash([]);
		if (preview.validity === 'invalid') {
			context.lineWidth = 4;
			context.beginPath();
			context.moveTo(x + 12, y + 12);
			context.lineTo(x + CITY_TILE_SIZE - 12, y + CITY_TILE_SIZE - 12);
			context.moveTo(x + CITY_TILE_SIZE - 12, y + 12);
			context.lineTo(x + 12, y + CITY_TILE_SIZE - 12);
			context.stroke();
		} else if (preview.validity === 'valid') {
			context.lineWidth = 4;
			context.beginPath();
			context.moveTo(x + 14, y + CITY_TILE_SIZE * 0.52);
			context.lineTo(x + CITY_TILE_SIZE * 0.42, y + CITY_TILE_SIZE - 14);
			context.lineTo(x + CITY_TILE_SIZE - 12, y + 12);
			context.stroke();
		}
	}
	context.restore();
}

function drawInteractionOverlays(
	context: CanvasRenderingContext2D,
	options: CityRenderOptions,
	palette: CityPalette
): void {
	const overlay = options.overlay;
	if (!overlay) return;
	drawUnresolvedAndEntropy(context, options, palette);
	if (overlay.showGrid) drawGrid(context, options.result, palette);
	if (overlay.showSockets) drawSockets(context, options.result, palette);

	const propagation = new Set<number>();
	for (const cell of overlay.propagationCells ?? []) {
		if (
			cell.x >= 0 &&
			cell.y >= 0 &&
			cell.x < options.result.width &&
			cell.y < options.result.height
		) {
			propagation.add(cellKey(cell, options.result.width));
		}
	}
	for (const index of propagation) {
		drawCellOutline(
			context,
			{ x: index % options.result.width, y: Math.floor(index / options.result.width) },
			palette.propagation,
			'dashed',
			1.7
		);
	}
	if (overlay.currentCell) {
		drawCellOutline(context, overlay.currentCell, palette.current, 'solid', 3.2);
	}
	if (overlay.hoveredCell) {
		drawCellOutline(context, overlay.hoveredCell, palette.inkSoft, 'dashed', 1.4);
	}
	if (overlay.selectedCell) {
		drawCellOutline(context, overlay.selectedCell, palette.selection, 'corners', 3.4);
	}
	if (overlay.placement) drawPlacement(context, overlay.placement, palette);
}

function drawSteam(
	context: CanvasRenderingContext2D,
	cell: RenderCell,
	details: CityMicroDetails,
	palette: CityPalette,
	time: number
): void {
	withTileRotation(context, cell.x, cell.y, cell.occupation?.tile.rotation ?? 0, () => {
		context.save();
		context.strokeStyle = palette.ink;
		context.globalAlpha = 0.28;
		context.lineWidth = 1;
		for (let strand = 0; strand < 2; strand += 1) {
			const phase = time * 0.0012 + details.ripplePhase + strand * 1.7;
			const sway = Math.sin(phase) * 2.5;
			context.beginPath();
			context.moveTo(7 + strand * 4, 0);
			context.bezierCurveTo(4 + sway, -5, 13 - sway, -10, 8 + sway, -15);
			context.stroke();
		}
		context.restore();
	});
}

function drawRipple(
	context: CanvasRenderingContext2D,
	cell: RenderCell,
	details: CityMicroDetails,
	palette: CityPalette,
	time: number
): void {
	const phase = (((time * 0.00018 + details.ripplePhase / (Math.PI * 2)) % 1) + 1) % 1;
	const radius = 4 + phase * 18;
	context.save();
	context.translate(cell.x * CITY_TILE_SIZE + 32, cell.y * CITY_TILE_SIZE + 32);
	context.strokeStyle = palette.ink;
	context.globalAlpha = (1 - phase) * 0.19;
	context.lineWidth = 0.8;
	context.beginPath();
	context.ellipse(0, 0, radius, radius * 0.42, details.detailAngle * 0.2, 0, Math.PI * 2);
	context.stroke();
	context.restore();
}

function drawSwayingWire(
	context: CanvasRenderingContext2D,
	cell: RenderCell,
	detail: InfrastructureDetail,
	details: CityMicroDetails,
	palette: CityPalette,
	time: number
): void {
	withTileRotation(context, cell.x, cell.y, 0, () => {
		const sway = Math.sin(time * 0.0007 + details.wirePhase) * 2;
		context.save();
		context.globalAlpha = 0.42;
		drawWire(context, detail.from ?? 3, detail.to ?? 1, palette, sway);
		context.restore();
	});
}

function drawTramSpark(
	context: CanvasRenderingContext2D,
	cell: RenderCell,
	palette: CityPalette,
	time: number
): void {
	const pulse = (Math.sin(time * 0.006 + cell.index) + 1) / 2;
	if (pulse < 0.83) return;
	const centreX = cell.x * CITY_TILE_SIZE + 32;
	const centreY = cell.y * CITY_TILE_SIZE + 32;
	context.save();
	context.strokeStyle = palette.yellow;
	context.globalAlpha = (pulse - 0.83) * 4;
	context.lineWidth = 1.2;
	context.beginPath();
	context.moveTo(centreX - 3, centreY - 2);
	context.lineTo(centreX + 1, centreY - 7);
	context.lineTo(centreX, centreY - 1);
	context.lineTo(centreX + 5, centreY - 4);
	context.stroke();
	context.restore();
}

function drawAmbient(
	context: CanvasRenderingContext2D,
	options: CityRenderOptions,
	palette: CityPalette
): void {
	if (!options.animate || (options.mode ?? 'interactive') !== 'interactive') return;
	const model = cityRenderModel(options.result);
	const time = options.time ?? 0;
	let ripples = 0;
	let steam = 0;
	let wires = 0;
	let sparks = 0;
	for (const cell of model.cells) {
		if (!isRevealed(options, cell.index)) continue;
		if (
			ripples < 7 &&
			cell.fabric &&
			(cell.fabric.fabricKind === 'pond' || cell.fabric.fabricKind === 'pond-bank') &&
			cell.fabric.details.microSeed % 3 === 0
		) {
			drawRipple(context, cell, cell.fabric.details, palette, time);
			ripples += 1;
		}
		if (
			steam < 5 &&
			cell.occupation?.occupationKind === 'tea-stall' &&
			cell.occupation.details.microSeed % 2 === 0
		) {
			drawSteam(context, cell, cell.occupation.details, palette, time);
			steam += 1;
		}
		if (sparks < 2 && cell.fabric?.fabricKind === 'tram' && cell.index % 11 === 0) {
			drawTramSpark(context, cell, palette, time);
			sparks += 1;
		}
		if (wires < 4) {
			const details = model.infrastructureByCell[cell.index];
			if (details) {
				for (const detail of details) {
					if (wires < 4 && (detail.kind === 'overhead-wire' || detail.kind === 'tram-wire')) {
						const micro =
							cell.occupation?.details ??
							cell.fabric?.details ??
							cityMicroDetails(options.result.seed, cell.x, cell.y, detail.id);
						drawSwayingWire(context, cell, detail, micro, palette, time);
						wires += 1;
					}
				}
			}
		}
		if (ripples >= 7 && steam >= 5 && wires >= 4 && sparks >= 2) break;
	}
}

/**
 * Draw ordered passes 8–9 onto a transparent overlay canvas. Set clear=false
 * when compositing onto a context that already contains renderCityBase().
 */
export function renderCityOverlay(
	context: CanvasRenderingContext2D,
	options: CityRenderOptions,
	clear = true
): void {
	const palette = cityPalette(options.appearance ?? 'paper');
	prepareContext(context, options, clear);
	context.save();
	transformToWorld(context, options);
	context.beginPath();
	context.rect(0, 0, options.result.width * CITY_TILE_SIZE, options.result.height * CITY_TILE_SIZE);
	context.clip();
	drawInteractionOverlays(context, options, palette);
	drawAmbient(context, options, palette);
	context.restore();
}

/** Render all ordered passes to a single context, suitable for print/export. */
export function renderCity(context: CanvasRenderingContext2D, options: CityRenderOptions): void {
	renderCityBase(context, options);
	renderCityOverlay(context, options, false);
}

export function cityExportDimensions(
	result: Pick<CityResult, 'width' | 'height'>,
	options: Pick<CityExportOptions, 'pixelsPerTile' | 'maxDimension' | 'margin'> = {}
): CityExportDimensions {
	const requestedPixelsPerTile = Math.max(32, options.pixelsPerTile ?? 192);
	const maxDimension = Math.max(512, options.maxDimension ?? 8192);
	const margin = Math.max(0, options.margin ?? 44);
	const logicalWidth = result.width * CITY_TILE_SIZE + margin * 2;
	const logicalHeight = result.height * CITY_TILE_SIZE + margin * 2;
	const requestedPixelRatio = requestedPixelsPerTile / CITY_TILE_SIZE;
	const safePixelRatio = Math.min(
		requestedPixelRatio,
		maxDimension / logicalWidth,
		maxDimension / logicalHeight
	);
	const pixelRatio = Math.max(0.25, safePixelRatio);
	return {
		width: Math.max(1, Math.round(logicalWidth * pixelRatio)),
		height: Math.max(1, Math.round(logicalHeight * pixelRatio)),
		pixelRatio,
		pixelsPerTile: CITY_TILE_SIZE * pixelRatio,
		logicalWidth,
		logicalHeight,
		margin
	};
}

/**
 * Dedicated high-resolution browser export. The live Canvas DPR is deliberately
 * unrelated, so a retina phone never needs to keep this large backing store.
 */
function renderMapExportCanvas(
	result: CityResult,
	options: CityExportOptions = {}
): HTMLCanvasElement {
	if (typeof document === 'undefined') {
		throw new Error('City PNG rendering is available only in a browser document.');
	}
	const dimensions = cityExportDimensions(result, options);
	const canvas = document.createElement('canvas');
	canvas.width = dimensions.width;
	canvas.height = dimensions.height;
	const context = canvas.getContext('2d', { alpha: false });
	if (!context) throw new Error('This browser could not create a 2D export canvas.');
	renderCity(context, {
		result,
		viewportWidth: dimensions.logicalWidth,
		viewportHeight: dimensions.logicalHeight,
		pixelRatio: dimensions.pixelRatio,
		camera: {
			x: (result.width * CITY_TILE_SIZE) / 2,
			y: (result.height * CITY_TILE_SIZE) / 2,
			zoom: 1
		},
		appearance: options.appearance ?? 'paper',
		mode: 'export',
		time: options.time ?? 0,
		animate: false,
		overlay: options.overlay
	});
	return canvas;
}

function titleCase(value: string): string {
	return value
		.split('-')
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function wrapText(context: CanvasRenderingContext2D, text: string, maximumWidth: number): string[] {
	const words = text.split(/\s+/);
	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		const candidate = line ? `${line} ${word}` : word;
		if (line && context.measureText(candidate).width > maximumWidth) {
			lines.push(line);
			line = word;
		} else {
			line = candidate;
		}
	}
	if (line) lines.push(line);
	return lines;
}

function drawWrappedText(
	context: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	maximumWidth: number,
	lineHeight: number,
	maximumLines = Number.POSITIVE_INFINITY
): number {
	const lines = wrapText(context, text, maximumWidth).slice(0, maximumLines);
	for (let index = 0; index < lines.length; index += 1) {
		context.fillText(lines[index], x, y + index * lineHeight, maximumWidth);
	}
	return lines.length * lineHeight;
}

function drawSocialLegend(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	palette: CityPalette
): void {
	const items = [
		{ label: 'Lane or road', kind: 'road' },
		{ label: 'Pond and bank', kind: 'pond' },
		{ label: 'Occupied parcel', kind: 'building' },
		{ label: 'Municipal exception', kind: 'patch' }
	] as const;
	context.font = '700 17px ui-sans-serif, system-ui, sans-serif';
	context.textAlign = 'left';
	context.textBaseline = 'middle';
	for (let index = 0; index < items.length; index += 1) {
		const itemY = y + index * 36;
		const item = items[index];
		context.save();
		switch (item.kind) {
			case 'road':
				context.strokeStyle = palette.road;
				context.lineWidth = 12;
				context.beginPath();
				context.moveTo(x + 3, itemY);
				context.lineTo(x + 31, itemY);
				context.stroke();
				context.strokeStyle = palette.yellow;
				context.lineWidth = 2;
				context.setLineDash([5, 5]);
				context.stroke();
				break;
			case 'pond':
				context.fillStyle = palette.algae;
				context.fillRect(x, itemY - 11, 34, 22);
				context.fillStyle = palette.pond;
				context.fillRect(x + 5, itemY - 7, 24, 14);
				break;
			case 'building':
				context.fillStyle = palette.plaster[0];
				context.strokeStyle = palette.ink;
				context.lineWidth = 2;
				context.fillRect(x + 3, itemY - 11, 28, 22);
				context.strokeRect(x + 3, itemY - 11, 28, 22);
				context.fillStyle = palette.roof[2];
				context.fillRect(x + 1, itemY - 13, 32, 7);
				break;
			case 'patch':
				context.strokeStyle = palette.oxide;
				context.lineWidth = 3;
				context.setLineDash([5, 3]);
				context.strokeRect(x + 2, itemY - 12, 30, 24);
				break;
		}
		context.restore();
		context.fillStyle = palette.ink;
		context.fillText(item.label, x + 48, itemY, width - 48);
	}
}

function drawScoreCard(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	label: string,
	value: number,
	descriptor: string,
	accent: string,
	palette: CityPalette
): void {
	context.fillStyle = palette.parcel[0];
	context.strokeStyle = palette.paperEdge;
	context.lineWidth = 2;
	context.beginPath();
	context.roundRect(x, y, width, 116, 12);
	context.fill();
	context.stroke();
	context.fillStyle = accent;
	context.fillRect(x, y, 8, 116);
	context.fillStyle = palette.ink;
	context.font = '800 17px ui-sans-serif, system-ui, sans-serif';
	context.textAlign = 'left';
	context.textBaseline = 'alphabetic';
	context.fillText(label.toUpperCase(), x + 24, y + 30, width - 44);
	context.font = '800 48px ui-serif, Georgia, serif';
	context.fillText(String(Math.round(value)), x + 23, y + 81);
	context.font = '650 15px ui-sans-serif, system-ui, sans-serif';
	context.fillText(descriptor, x + 101, y + 76, width - 121);
}

/**
 * Render a metadata-complete 4:3 exhibit card for sharing. The map inset is
 * rendered through the same ordered tile passes as the full-resolution export.
 */
export function renderCitySocialCanvas(
	result: CityResult,
	options: CitySocialExportOptions = { kind: 'social' }
): HTMLCanvasElement {
	if (typeof document === 'undefined') {
		throw new Error('City social-card rendering is available only in a browser document.');
	}
	const width = Math.max(960, Math.round(options.width ?? 1600));
	const height = Math.max(720, Math.round(options.height ?? 1200));
	const scale = Math.min(width / 1600, height / 1200);
	const appearance = options.appearance ?? 'paper';
	const palette = cityPalette(appearance);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d', { alpha: false });
	if (!context) throw new Error('This browser could not create a 2D social-card canvas.');

	context.setTransform(scale, 0, 0, scale, 0, 0);
	const logicalWidth = width / scale;
	const logicalHeight = height / scale;
	context.fillStyle = palette.canvas;
	context.fillRect(0, 0, logicalWidth, logicalHeight);
	context.fillStyle = palette.paper;
	context.fillRect(38, 38, logicalWidth - 76, logicalHeight - 76);
	context.strokeStyle = palette.paperEdge;
	context.lineWidth = 3;
	context.strokeRect(38, 38, logicalWidth - 76, logicalHeight - 76);

	// Fixed, seed-independent survey-paper wear. No topology or score changes.
	context.save();
	context.globalAlpha = 0.08;
	context.strokeStyle = palette.ink;
	context.lineWidth = 1;
	for (let index = 0; index < 26; index += 1) {
		const x = 52 + ((index * 173 + result.width * 29) % 1485);
		const y = 49 + ((index * 97 + result.height * 31) % 1090);
		context.beginPath();
		context.moveTo(x, y);
		context.lineTo(x + 13 + (index % 4) * 7, y + (index % 3) - 1);
		context.stroke();
	}
	context.restore();

	context.fillStyle = palette.oxide;
	context.fillRect(70, 66, 7, 118);
	context.fillStyle = palette.ink;
	context.textAlign = 'left';
	context.textBaseline = 'alphabetic';
	context.font = '800 54px ui-serif, Georgia, serif';
	context.fillText(options.title ?? 'The City That Refuses a Master Plan', 98, 121, 1040);
	context.font = '650 21px ui-sans-serif, system-ui, sans-serif';
	context.fillStyle = palette.inkSoft;
	context.fillText(
		'One anchor. Several hundred local negotiations. No claim of a sensible whole.',
		100,
		164,
		1040
	);

	const mapX = 70;
	const mapY = 218;
	const mapWidth = 1020;
	const mapHeight = 780;
	context.fillStyle = palette.canvas;
	context.fillRect(mapX, mapY, mapWidth, mapHeight);
	context.strokeStyle = palette.paperEdge;
	context.lineWidth = 3;
	context.strokeRect(mapX, mapY, mapWidth, mapHeight);
	const mapPixelsPerTile = Math.max(
		48,
		Math.min(112, (mapWidth / Math.max(1, result.width)) * 1.65)
	);
	const mapCanvas = renderMapExportCanvas(result, {
		kind: 'map',
		appearance,
		pixelsPerTile: mapPixelsPerTile,
		maxDimension: 4096,
		margin: 30,
		time: options.time
	});
	const containScale = Math.min(mapWidth / mapCanvas.width, mapHeight / mapCanvas.height);
	const renderedWidth = mapCanvas.width * containScale;
	const renderedHeight = mapCanvas.height * containScale;
	context.drawImage(
		mapCanvas,
		mapX + (mapWidth - renderedWidth) / 2,
		mapY + (mapHeight - renderedHeight) / 2,
		renderedWidth,
		renderedHeight
	);

	const railX = 1134;
	const railWidth = 390;
	context.fillStyle = palette.ink;
	context.font = '800 32px ui-serif, Georgia, serif';
	const cityNameHeight = drawWrappedText(context, result.cityName, railX, 244, railWidth, 36, 2);
	let railY = 244 + cityNameHeight + 13;
	context.font = '650 16px ui-monospace, Consolas, monospace';
	context.fillStyle = palette.inkSoft;
	context.fillText(`SEED  ${result.seed}`, railX, railY, railWidth);
	railY += 28;
	context.fillText(
		`ANCHOR  ${titleCase(result.anchor.id)} · ${result.anchor.x + 1},${result.anchor.y + 1}`,
		railX,
		railY,
		railWidth
	);
	railY += 45;

	drawScoreCard(
		context,
		railX,
		railY,
		railWidth,
		'Functional',
		result.scores.functional,
		result.scores.functionalLabel,
		palette.mint,
		palette
	);
	railY += 132;
	drawScoreCard(
		context,
		railX,
		railY,
		railWidth,
		'Calamity',
		result.scores.calamity,
		result.scores.calamityLabel,
		palette.oxide,
		palette
	);
	railY += 145;

	context.fillStyle = palette.ink;
	context.font = '800 18px ui-sans-serif, system-ui, sans-serif';
	context.fillText('SURVEY NOTES', railX, railY, railWidth);
	railY += 31;
	context.font = '650 17px ui-sans-serif, system-ui, sans-serif';
	context.fillText(`${result.width} × ${result.height} cells`, railX, railY, railWidth);
	railY += 28;
	context.fillText(
		`${result.municipalPatches.length} municipal exception${result.municipalPatches.length === 1 ? '' : 's'}`,
		railX,
		railY,
		railWidth
	);
	railY += 44;
	drawSocialLegend(context, railX, railY, railWidth, palette);

	const footerY = Math.min(1100, logicalHeight - 83);
	context.strokeStyle = palette.paperEdge;
	context.lineWidth = 2;
	context.beginPath();
	context.moveTo(70, footerY - 30);
	context.lineTo(logicalWidth - 70, footerY - 30);
	context.stroke();
	context.fillStyle = palette.ink;
	context.font = '750 16px ui-sans-serif, system-ui, sans-serif';
	context.textAlign = 'left';
	context.fillText(
		'Fictional neighbourhood generated from local rules. Not a map of a real place.',
		70,
		footerY
	);
	context.font = '700 16px ui-monospace, Consolas, monospace';
	context.fillStyle = palette.inkSoft;
	context.fillText(`FINGERPRINT  ${result.fingerprint}`, 70, footerY + 29);
	context.textAlign = 'right';
	context.fillStyle = palette.ink;
	context.font = '800 19px ui-sans-serif, system-ui, sans-serif';
	context.fillText(options.siteLabel ?? 'suvroghosh.in', logicalWidth - 70, footerY + 29);
	return canvas;
}

/**
 * Export entrypoint. Both public export kinds carry the complete exhibit
 * metadata required to understand an image away from the article. `map` uses
 * twice the social card's linear resolution while retaining the same canonical
 * tile renderer and 4:3 composition.
 */
export function renderCityToCanvas(
	result: CityResult,
	options: CityExportOptions | CitySocialExportOptions = {}
): HTMLCanvasElement {
	if (options.kind === 'social') {
		return renderCitySocialCanvas(result, options as CitySocialExportOptions);
	}
	return renderCitySocialCanvas(result, {
		kind: 'social',
		appearance: options.appearance,
		time: options.time,
		width: 3_200,
		height: 2_400,
		siteLabel: 'suvroghosh.in',
		title: 'The City That Refuses a Master Plan'
	});
}

export async function renderCityToBlob(
	result: CityResult,
	options: CityExportOptions | CitySocialExportOptions = {}
): Promise<Blob> {
	const canvas = renderCityToCanvas(result, options);
	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) resolve(blob);
			else reject(new Error('The city export canvas could not be encoded as PNG.'));
		}, 'image/png');
	});
}

export const renderCityExportCanvas = renderCityToCanvas;
export const renderCityExportBlob = renderCityToBlob;
