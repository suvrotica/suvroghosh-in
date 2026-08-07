import { findFrameAtPoint } from './layouts';
import { traceMaskPath } from './masks';
import { getPalette } from './palettes';
import { generateArtworkPaths } from './paths';
import { SeededRandom } from './prng';
import type {
	ArtworkRecipe,
	Canvas2DContext,
	ExhibitionRecipe,
	GeneratedPath,
	Orientation,
	RenderOptions
} from './types';
function resolvedOrientation(recipe: ExhibitionRecipe, options: RenderOptions): Orientation {
	if (options.orientation) return options.orientation;
	if (recipe.orientation !== 'auto') return recipe.orientation;
	return options.width >= options.height ? 'landscape' : 'portrait';
}

function wallColour(recipe: ExhibitionRecipe, override?: string): string {
	if (override) return override;
	const palette = getPalette(recipe.paletteId);
	return palette.walls[new SeededRandom(`${recipe.seed}:wall-variant`).int(0, 1)];
}

function drawWall(
	context: Canvas2DContext,
	recipe: ExhibitionRecipe,
	width: number,
	height: number,
	override?: string
): void {
	const palette = getPalette(recipe.paletteId);
	context.fillStyle = wallColour(recipe, override);
	context.fillRect(0, 0, width, height);
	if (!palette.traits?.includes('dark-wall')) return;

	const centreX = width * 0.5;
	const centreY = height * 0.3;
	const radius = Math.max(width, height) * 0.72;
	const spotlight = context.createRadialGradient(centreX, centreY, 0, centreX, centreY, radius);
	spotlight.addColorStop(0, 'rgba(255, 239, 205, 0.14)');
	spotlight.addColorStop(0.46, 'rgba(255, 239, 205, 0.045)');
	spotlight.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
	context.fillStyle = spotlight;
	context.fillRect(0, 0, width, height);
}

function galleryMaterials(recipe: ExhibitionRecipe) {
	const palette = getPalette(recipe.paletteId);
	const random = new SeededRandom(`${recipe.seed}:${recipe.frameFamily}:gallery-materials`);
	return {
		frame: palette.frames[random.int(0, Math.max(0, palette.frames.length - 1))] ?? {
			outer: '#4A3829',
			inner: '#C7B99E'
		},
		mat: palette.mats[random.int(0, Math.max(0, palette.mats.length - 1))] ?? '#E8DFCE',
		labelInk: palette.labelInk,
		accent: palette.accent ?? palette.labelInk
	};
}

function boundedCacheSet(
	cache: Map<string, readonly GeneratedPath[]>,
	key: string,
	value: readonly GeneratedPath[]
): void {
	while (cache.size >= 48) {
		const oldest = cache.keys().next().value as string | undefined;
		if (oldest === undefined) break;
		cache.delete(oldest);
	}
	cache.set(key, value);
}

function pathsForArtwork(
	artwork: ArtworkRecipe,
	phase: number,
	pathBudget: number,
	cache?: Map<string, readonly GeneratedPath[]>
): readonly GeneratedPath[] {
	const stablePhase = Number(phase.toFixed(4));
	const key = `${artwork.seed}:${stablePhase}:${pathBudget}`;
	const cached = cache?.get(key);
	if (cached) return cached;
	const generated = generateArtworkPaths(artwork, { phase: stablePhase, maxPaths: pathBudget });
	if (cache) boundedCacheSet(cache, key, generated);
	return generated;
}

function drawPaperGrain(
	context: Canvas2DContext,
	width: number,
	height: number,
	seed: string,
	amount: number,
	colour: string
): void {
	const areaScale = Math.max(0.45, Math.min(8, (width * height) / (430 * 430)));
	const count = Math.round(Math.max(0, Math.min(1, amount)) * 180 * areaScale);
	if (count === 0) return;
	const random = new SeededRandom(`${seed}:grain`);
	context.save();
	context.fillStyle = colour;
	context.globalAlpha = 0.035 + amount * 0.055;
	for (let index = 0; index < count; index += 1) {
		const radius = random.float(0.25, 1.2) * Math.max(0.7, Math.min(width, height) / 500);
		context.beginPath();
		context.arc(random.float(0, width), random.float(0, height), radius, 0, Math.PI * 2);
		context.fill();
	}
	context.restore();
}

/** Draws one normalized print and can target a visible or offscreen 2D context. */
export function renderArtwork(
	context: Canvas2DContext,
	artwork: ArtworkRecipe,
	options: RenderOptions
): void {
	const width = Math.max(1, options.width);
	const height = Math.max(1, options.height);
	const phase = options.phase ?? 0;
	const pathBudget = Math.max(
		1,
		Math.min(artwork.pathCount, Math.round(options.pathBudget ?? artwork.pathCount))
	);
	context.save();
	context.fillStyle = artwork.ground;
	context.fillRect(0, 0, width, height);
	const inset = Math.max(2, Math.min(width, height) * 0.035);
	traceMaskPath(
		context,
		artwork.mask,
		inset,
		inset,
		Math.max(1, width - inset * 2),
		Math.max(1, height - inset * 2)
	);
	context.clip();
	drawPaperGrain(context, width, height, artwork.seed, artwork.grain, artwork.primaryInk);
	const paths = pathsForArtwork(artwork, phase, pathBudget, options.pathCache);
	const lineScale = Math.max(0.38, Math.min(width, height) / 430);
	context.lineCap = 'round';
	context.lineJoin = 'round';
	for (const path of paths) {
		if (path.points.length < 2) continue;
		context.beginPath();
		path.points.forEach((point, index) => {
			const x = point.x * width;
			const y = point.y * height;
			if (index === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		});
		context.strokeStyle =
			path.ink === 'secondary' && artwork.secondaryInk ? artwork.secondaryInk : artwork.primaryInk;
		context.globalAlpha = path.alpha;
		context.lineWidth = Math.max(0.45, path.width * lineScale);
		context.stroke();
	}
	context.globalAlpha = 1;
	context.restore();
}

function drawGalleryGrain(
	context: Canvas2DContext,
	recipe: ExhibitionRecipe,
	width: number,
	height: number,
	colour: string
): void {
	const areaScale = Math.max(0.5, Math.min(12, (width * height) / (1600 * 1000)));
	const count = Math.round(recipe.grain * 260 * areaScale);
	if (count <= 0) return;
	const random = new SeededRandom(`${recipe.seed}:wall-grain`);
	context.save();
	context.fillStyle = colour;
	context.globalAlpha = 0.035;
	const grainSize = Math.max(0.7, Math.min(width, height) / 1_000);
	for (let index = 0; index < count; index += 1) {
		context.fillRect(random.float(0, width), random.float(0, height), grainSize, grainSize);
	}
	context.restore();
}

/** Draws the entire normalized gallery into a visible canvas or export buffer. */
export function renderGallery(
	context: Canvas2DContext,
	recipe: ExhibitionRecipe,
	options: RenderOptions
): void {
	const width = Math.max(1, options.width);
	const height = Math.max(1, options.height);
	const orientation = resolvedOrientation(recipe, options);
	const frames = orientation === 'landscape' ? recipe.landscapeFrames : recipe.portraitFrames;
	const materials = galleryMaterials(recipe);
	context.save();
	drawWall(context, recipe, width, height, options.background);
	drawGalleryGrain(context, recipe, width, height, materials.labelInk);
	const selected =
		options.selectedArtwork === undefined
			? -1
			: Math.max(0, Math.min(recipe.artworkCount - 1, options.selectedArtwork));
	for (const frame of [...frames].sort((left, right) => left.zIndex - right.zIndex)) {
		const artwork = recipe.artworks[frame.artworkIndex];
		if (!artwork) continue;
		const left = frame.x * width;
		const top = frame.y * height;
		const frameWidth = frame.width * width;
		const frameHeight = frame.height * height;
		const centreX = left + frameWidth / 2;
		const centreY = top + frameHeight / 2;
		const border = Math.max(3, Math.min(frameWidth, frameHeight) * 0.045);
		const mat = Math.max(2, border * 0.58);
		context.save();
		context.translate(centreX, centreY);
		context.rotate(frame.rotation);
		context.translate(-centreX, -centreY);
		context.shadowColor = `rgba(18, 15, 12, ${0.08 + recipe.shadow * 0.34})`;
		context.shadowBlur = Math.max(2, Math.min(width, height) * 0.018 * recipe.shadow);
		context.shadowOffsetX = Math.max(1, width * 0.004 * recipe.shadow);
		context.shadowOffsetY = Math.max(1, height * 0.007 * recipe.shadow);
		context.fillStyle = materials.frame.outer;
		context.fillRect(left, top, frameWidth, frameHeight);
		context.shadowColor = 'rgba(0,0,0,0)';
		context.fillStyle = materials.frame.inner;
		context.fillRect(
			left + border,
			top + border,
			Math.max(1, frameWidth - border * 2),
			Math.max(1, frameHeight - border * 2)
		);
		const artLeft = left + border + mat;
		const artTop = top + border + mat;
		const artWidth = Math.max(1, frameWidth - (border + mat) * 2);
		const artHeight = Math.max(1, frameHeight - (border + mat) * 2);
		const innerRim = Math.max(1, border * 0.16);
		context.fillStyle = materials.mat;
		context.fillRect(
			left + border + innerRim,
			top + border + innerRim,
			Math.max(1, frameWidth - (border + innerRim) * 2),
			Math.max(1, frameHeight - (border + innerRim) * 2)
		);
		context.save();
		context.translate(artLeft, artTop);
		renderArtwork(context, artwork, {
			...options,
			width: artWidth,
			height: artHeight,
			phase: recipe.frozenPhase ?? options.phase ?? 0
		});
		context.restore();
		if (frame.artworkIndex === selected) {
			context.strokeStyle = materials.accent;
			context.lineWidth = Math.max(2, Math.min(width, height) * 0.003);
			context.strokeRect(left - 2, top - 2, frameWidth + 4, frameHeight + 4);
		}
		context.restore();
	}
	context.restore();
}

/** Hit-tests normalized gallery coordinates and returns the stable artwork index. */
export function frameAtPoint(
	recipe: ExhibitionRecipe,
	xNormalized: number,
	yNormalized: number,
	orientation: Orientation
): number | null {
	const frames = orientation === 'landscape' ? recipe.landscapeFrames : recipe.portraitFrames;
	return findFrameAtPoint(frames, xNormalized, yNormalized)?.artworkIndex ?? null;
}

export const renderFocusArtwork = renderArtwork;
