import type {
	BodyPlate,
	CreaturePhenotype,
	CreaturePose,
	ExhibitState,
	LimbPhenotype,
	LimbPose,
	PaletteDefinition,
	SurfaceSample,
	Vec2,
	ViewMode
} from './types';

const TAU = Math.PI * 2;
const MAX_FALLBACK_PLATES = 384;
const MAX_FALLBACK_LIMBS = 256;
const MAX_FALLBACK_SURFACE_MARKS = 1_500;
const MAX_FALLBACK_FLEXIBLE_CHAINS = 96;

export interface FallbackBounds {
	readonly minX: number;
	readonly minY: number;
	readonly maxX: number;
	readonly maxY: number;
}

export interface FallbackProjection {
	readonly centerX: number;
	readonly centerY: number;
	readonly pixelsPerWorld: number;
	readonly width: number;
	readonly height: number;
}

export interface FallbackRenderOptions {
	readonly palette: PaletteDefinition;
	/** CSS-pixel output dimensions. Defaults to the context backing size. */
	readonly width?: number;
	readonly height?: number;
	/** Backing-store scale. Set this explicitly for high-resolution exports. */
	readonly pixelRatio?: number;
	readonly padding?: number;
	readonly selectedSegment?: number;
	readonly includeLabel?: boolean;
	readonly includeOverlays?: boolean;
	readonly transparent?: boolean;
	readonly clear?: boolean;
	/** Avoids blur/filter effects whose rasterization varies between browsers. */
	readonly exportSafe?: boolean;
	readonly label?: string;
	readonly time?: number;
}

export interface FallbackRenderStats {
	readonly width: number;
	readonly height: number;
	readonly pixelRatio: number;
	readonly plates: number;
	readonly limbs: number;
	readonly eyes: number;
	readonly surfaceMarks: number;
}

interface ResolvedFallbackOptions {
	readonly palette: PaletteDefinition;
	readonly width: number;
	readonly height: number;
	readonly pixelRatio: number;
	readonly padding: number;
	readonly selectedSegment: number;
	readonly includeLabel: boolean;
	readonly includeOverlays: boolean;
	readonly transparent: boolean;
	readonly clear: boolean;
	readonly exportSafe: boolean;
	readonly label: string | undefined;
	readonly time: number;
}

interface ScreenPoint {
	readonly x: number;
	readonly y: number;
}

interface DrawEnvironment {
	readonly context: CanvasRenderingContext2D;
	readonly phenotype: CreaturePhenotype;
	readonly pose: CreaturePose;
	readonly state: ExhibitState;
	readonly options: ResolvedFallbackOptions;
	readonly projection: FallbackProjection;
	readonly colours: FallbackColours;
}

interface FallbackColours {
	readonly background: string;
	readonly chamber: string;
	readonly shellA: string;
	readonly shellB: string;
	readonly membrane: string;
	readonly emission: string;
	readonly eye: string;
	readonly corrosion: string;
}

const DEFAULT_FALLBACK_BOUNDS: FallbackBounds = Object.freeze({
	minX: -1,
	minY: -0.65,
	maxX: 1,
	maxY: 0.65
});

/**
 * Pure generalized-superellipse sampler used by both drawing and Node tests.
 * The returned point is in plate-local, unit-radius coordinates.
 */
export function generalizedSuperellipsePoint(
	angle: number,
	exponent: number,
	lobeAmplitude: number,
	lobeCount: number,
	seed: number
): Vec2 {
	const power = clamp(finite(exponent, 2), 0.72, 8);
	const cosine = Math.cos(angle);
	const sine = Math.sin(angle);
	const baseX = Math.sign(cosine) * Math.abs(cosine) ** (2 / power);
	const baseY = Math.sign(sine) * Math.abs(sine) ** (2 / power);
	const lobes = Math.max(1, Math.round(Math.abs(finite(lobeCount, 1))));
	const amplitude = clamp(finite(lobeAmplitude), -0.24, 0.24);
	const modulation = 1 + amplitude * Math.cos(lobes * angle + fract(finite(seed)) * TAU);
	return { x: baseX * modulation, y: baseY * modulation };
}

/** Conservative phenotype/pose bounds; never mutates the procedural model. */
export function deriveFallbackBounds(
	phenotype: CreaturePhenotype,
	pose: CreaturePose
): FallbackBounds {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	const offsetX = finite(pose.bodyOffset.x);
	const offsetY = finite(pose.bodyOffset.y);

	for (const plate of phenotype.plates.slice(0, MAX_FALLBACK_PLATES)) {
		const centerX = finite(plate.center.x) + offsetX;
		const centerY = finite(plate.center.y) + offsetY;
		const radius =
			Math.hypot(Math.abs(finite(plate.width)) * 0.5, Math.abs(finite(plate.height)) * 0.5) *
			(1.08 + Math.min(Math.abs(finite(plate.lobeAmplitude)), 0.24));
		minX = Math.min(minX, centerX - radius);
		minY = Math.min(minY, centerY - radius);
		maxX = Math.max(maxX, centerX + radius);
		maxY = Math.max(maxY, centerY + radius);
	}

	for (const limb of pose.limbs.slice(0, MAX_FALLBACK_LIMBS)) {
		for (const joint of limb.joints) {
			const x = finite(joint.x);
			const y = finite(joint.y);
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
	}

	let flexibleCount = 0;
	for (const chain of pose.flexible.values()) {
		if (flexibleCount >= MAX_FALLBACK_FLEXIBLE_CHAINS) break;
		flexibleCount += 1;
		const pairs = Math.min(Math.floor(chain.positions.length / 2), Math.max(0, chain.count));
		for (let index = 0; index < pairs; index += 1) {
			const x = finite(chain.positions[index * 2]);
			const y = finite(chain.positions[index * 2 + 1]);
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
	}

	if (![minX, minY, maxX, maxY].every(Number.isFinite)) return DEFAULT_FALLBACK_BOUNDS;
	const width = Math.max(maxX - minX, 0.001);
	const height = Math.max(maxY - minY, 0.001);
	const margin = Math.max(width, height) * 0.06;
	return {
		minX: minX - margin,
		minY: minY - margin,
		maxX: maxX + margin,
		maxY: maxY + margin
	};
}

/** Aspect-correct fit used identically for browser and export canvases. */
export function createFallbackProjection(
	bounds: FallbackBounds,
	width: number,
	height: number,
	padding = 0.1
): FallbackProjection {
	const safeWidth = Math.max(1, finite(width, 1));
	const safeHeight = Math.max(1, finite(height, 1));
	const safePadding = clamp(finite(padding, 0.1), 0, 0.42);
	const worldWidth = Math.max(0.001, finite(bounds.maxX) - finite(bounds.minX));
	const worldHeight = Math.max(0.001, finite(bounds.maxY) - finite(bounds.minY));
	const usable = 1 - safePadding * 2;
	return {
		centerX: (finite(bounds.minX) + finite(bounds.maxX)) * 0.5,
		centerY: (finite(bounds.minY) + finite(bounds.maxY)) * 0.5,
		pixelsPerWorld: Math.min(
			(safeWidth * usable) / worldWidth,
			(safeHeight * usable) / worldHeight
		),
		width: safeWidth,
		height: safeHeight
	};
}

/** Projects a world point using the exhibit's restrained 2.5D camera. */
export function projectFallbackPoint(
	point: Vec2,
	depth: number,
	projection: FallbackProjection,
	state: Pick<ExhibitState, 'cameraYaw' | 'cameraPitch' | 'cameraRoll'>
): ScreenPoint {
	const dx = finite(point.x) - projection.centerX;
	const dy = finite(point.y) - projection.centerY;
	const roll = clamp(finite(state.cameraRoll), -0.35, 0.35);
	const cosine = Math.cos(roll);
	const sine = Math.sin(roll);
	let x = dx * cosine - dy * sine;
	let y = dx * sine + dy * cosine;
	const yaw = clamp(finite(state.cameraYaw), -0.7, 0.7);
	const pitch = clamp(finite(state.cameraPitch), -0.5, 0.5);
	x = x * Math.cos(yaw) + finite(depth) * Math.sin(yaw) * 0.22;
	y = y * Math.cos(pitch) + finite(depth) * Math.sin(pitch) * 0.22;
	return {
		x: projection.width * 0.5 + x * projection.pixelsPerWorld,
		y: projection.height * 0.5 - y * projection.pixelsPerWorld
	};
}

/**
 * Paints the same phenotype, live pose and exhibit view used by WebGL. It is
 * deterministic, has no DOM dependency, and is safe to call on an export
 * canvas when width/height/pixelRatio are supplied explicitly.
 */
export function renderFallbackFrame(
	context: CanvasRenderingContext2D,
	phenotype: CreaturePhenotype,
	pose: CreaturePose,
	state: ExhibitState,
	options: FallbackRenderOptions
): FallbackRenderStats {
	const resolved = resolveOptions(context, pose, options);
	const colours = resolveColours(resolved.palette);
	const projection = createFallbackProjection(
		deriveFallbackBounds(phenotype, pose),
		resolved.width,
		resolved.height,
		resolved.padding
	);
	const environment: DrawEnvironment = {
		context,
		phenotype,
		pose,
		state,
		options: resolved,
		projection,
		colours
	};

	context.save();
	context.setTransform(resolved.pixelRatio, 0, 0, resolved.pixelRatio, 0, 0);
	if (resolved.clear) context.clearRect(0, 0, resolved.width, resolved.height);
	drawChamber(environment);
	drawWings(environment);
	drawBodyAxis(environment);

	const phenotypeLimbs = new Map(phenotype.limbs.map((limb) => [limb.id, limb]));
	const posedLimbs = pose.limbs
		.slice(0, MAX_FALLBACK_LIMBS)
		.map((limbPose) => ({ limbPose, limb: phenotypeLimbs.get(limbPose.id) }))
		.filter(
			(entry): entry is { limbPose: LimbPose; limb: LimbPhenotype } => entry.limb !== undefined
		)
		.sort((left, right) => left.limb.depth - right.limb.depth);
	const split = posedLimbs.findIndex((entry) => entry.limb.depth >= 0);
	const farEnd = split < 0 ? posedLimbs.length : split;
	for (let index = 0; index < farEnd; index += 1) drawLimb(environment, posedLimbs[index]);
	drawFlexibleAppendages(environment);

	const plates = phenotype.plates
		.slice(0, MAX_FALLBACK_PLATES)
		.map((plate, index) => ({ plate, index }))
		.sort((left, right) => left.plate.depth - right.plate.depth);
	for (const entry of plates) drawPlate(environment, entry.plate);
	for (let index = farEnd; index < posedLimbs.length; index += 1)
		drawLimb(environment, posedLimbs[index]);

	drawSurfaceMarks(environment);
	drawEyes(environment);
	if (resolved.includeOverlays) drawViewOverlay(environment);
	if (resolved.includeLabel) drawSpecimenLabel(environment);
	context.restore();

	return {
		width: resolved.width,
		height: resolved.height,
		pixelRatio: resolved.pixelRatio,
		plates: plates.length,
		limbs: posedLimbs.length,
		eyes: phenotype.eyes.length,
		surfaceMarks: Math.min(phenotype.surfaceSamples.length, MAX_FALLBACK_SURFACE_MARKS)
	};
}

/** Small owner for an on-page fallback canvas; export code can use the pure function. */
export class FallbackRenderer {
	readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;
	private cssWidth = 1;
	private cssHeight = 1;
	private pixelRatio = 1;
	private disposed = false;

	constructor(canvas: HTMLCanvasElement) {
		const context = canvas.getContext('2d', { alpha: true });
		if (!context) throw new Error('Canvas2D is unavailable for the Chitin fallback renderer.');
		this.canvas = canvas;
		this.context = context;
	}

	setSize(cssWidth: number, cssHeight: number, pixelRatio = 1): boolean {
		if (this.disposed) return false;
		const width = Math.max(0, finite(cssWidth));
		const height = Math.max(0, finite(cssHeight));
		if (width < 2 || height < 2) return false;
		const ratio = clamp(finite(pixelRatio, 1), 0.5, 4);
		const backingWidth = Math.round(width * ratio);
		const backingHeight = Math.round(height * ratio);
		const changed = this.canvas.width !== backingWidth || this.canvas.height !== backingHeight;
		this.cssWidth = width;
		this.cssHeight = height;
		this.pixelRatio = ratio;
		if (changed) {
			this.canvas.width = backingWidth;
			this.canvas.height = backingHeight;
		}
		return changed;
	}

	render(
		phenotype: CreaturePhenotype,
		pose: CreaturePose,
		state: ExhibitState,
		options: FallbackRenderOptions
	): FallbackRenderStats {
		if (this.disposed) throw new Error('Cannot render with a disposed Chitin fallback renderer.');
		return renderFallbackFrame(this.context, phenotype, pose, state, {
			...options,
			width: options.width ?? this.cssWidth,
			height: options.height ?? this.cssHeight,
			pixelRatio: options.pixelRatio ?? this.pixelRatio
		});
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.context.setTransform(1, 0, 0, 1, 0, 0);
		this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.canvas.width = 1;
		this.canvas.height = 1;
	}
}

function resolveOptions(
	context: CanvasRenderingContext2D,
	pose: CreaturePose,
	options: FallbackRenderOptions
): ResolvedFallbackOptions {
	const pixelRatio = clamp(finite(options.pixelRatio, 1), 0.5, 4);
	return {
		palette: options.palette,
		width: Math.max(1, finite(options.width, context.canvas.width / pixelRatio || 1)),
		height: Math.max(1, finite(options.height, context.canvas.height / pixelRatio || 1)),
		pixelRatio,
		padding: clamp(finite(options.padding, 0.1), 0, 0.42),
		selectedSegment: Math.floor(finite(options.selectedSegment, -1)),
		includeLabel: options.includeLabel ?? true,
		includeOverlays: options.includeOverlays ?? true,
		transparent: options.transparent ?? false,
		clear: options.clear ?? true,
		exportSafe: options.exportSafe ?? false,
		label: options.label,
		time: finite(options.time, finite(pose.time))
	};
}

function resolveColours(palette: PaletteDefinition): FallbackColours {
	return {
		background: cssColour(palette.background),
		chamber: cssColour(palette.chamber),
		shellA: cssColour(palette.shellA),
		shellB: cssColour(palette.shellB),
		membrane: cssColour(palette.membrane),
		emission: cssColour(palette.emission),
		eye: cssColour(palette.eye),
		corrosion: cssColour(palette.corrosion)
	};
}

function drawChamber(environment: DrawEnvironment): void {
	const { context, options, colours } = environment;
	if (!options.transparent) {
		context.fillStyle = colours.background;
		context.fillRect(0, 0, options.width, options.height);
		const glow = context.createRadialGradient(
			options.width * 0.5,
			options.height * 0.44,
			0,
			options.width * 0.5,
			options.height * 0.44,
			Math.max(options.width, options.height) * 0.72
		);
		glow.addColorStop(0, withAlpha(colours.chamber, 0.58));
		glow.addColorStop(1, withAlpha(colours.background, 0));
		context.fillStyle = glow;
		context.fillRect(0, 0, options.width, options.height);
	}

	const inset = Math.max(10, Math.min(options.width, options.height) * 0.032);
	context.fillStyle = withAlpha(colours.chamber, options.transparent ? 0.08 : 0.16);
	context.strokeStyle = withAlpha(colours.emission, 0.2);
	context.lineWidth = 1;
	traceRoundedRect(
		context,
		inset,
		inset,
		options.width - inset * 2,
		options.height - inset * 2,
		14
	);
	context.fill();
	context.stroke();

	context.strokeStyle = withAlpha(colours.chamber, 0.22);
	context.lineWidth = 0.65;
	for (let column = 1; column < 12; column += 1) {
		const x = inset + ((options.width - inset * 2) * column) / 12;
		context.beginPath();
		context.moveTo(x, inset);
		context.lineTo(x, options.height - inset);
		context.stroke();
	}
	for (let row = 1; row < 7; row += 1) {
		const y = inset + ((options.height - inset * 2) * row) / 7;
		context.beginPath();
		context.moveTo(inset, y);
		context.lineTo(options.width - inset, y);
		context.stroke();
	}
}

function drawWings(environment: DrawEnvironment): void {
	const { context, phenotype, pose, state, projection, colours } = environment;
	for (const wing of phenotype.wings) {
		if (wing.outline.length < 3) continue;
		const rootPlate = phenotype.plates.find(
			(candidate) => candidate.segmentIndex === wing.rootSegment
		);
		if (!rootPlate) continue;
		context.beginPath();
		wing.outline.forEach((point, index) => {
			const screen = projectFallbackPoint(
				plateLocalWorldPoint(rootPlate, pose, point),
				wing.depth,
				projection,
				state
			);
			if (index === 0) context.moveTo(screen.x, screen.y);
			else context.lineTo(screen.x, screen.y);
		});
		context.closePath();
		context.fillStyle = withAlpha(colours.membrane, state.view === 'fluorescence' ? 0.18 : 0.12);
		context.strokeStyle = withAlpha(colours.emission, 0.24);
		context.lineWidth = 1;
		context.fill();
		context.stroke();
	}
}

function drawBodyAxis(environment: DrawEnvironment): void {
	const { context, phenotype, pose, state, projection, colours } = environment;
	if (phenotype.axis.length < 2 || state.view === 'silhouette') return;
	context.beginPath();
	phenotype.axis.forEach((axisPoint, index) => {
		const point = projectFallbackPoint(
			{
				x: axisPoint.position.x + pose.bodyOffset.x,
				y: axisPoint.position.y + pose.bodyOffset.y
			},
			axisPoint.depth - 0.02,
			projection,
			state
		);
		if (index === 0) context.moveTo(point.x, point.y);
		else context.lineTo(point.x, point.y);
	});
	context.strokeStyle = withAlpha(
		state.view === 'fluorescence' ? colours.emission : colours.membrane,
		state.view === 'anatomy' ? 0.72 : 0.46
	);
	context.lineWidth = Math.max(1, projection.pixelsPerWorld * 0.018);
	context.lineCap = 'round';
	context.lineJoin = 'round';
	context.stroke();
}

function drawLimb(
	environment: DrawEnvironment,
	entry: { readonly limbPose: LimbPose; readonly limb: LimbPhenotype }
): void {
	const { context, state, projection, colours } = environment;
	const { limb, limbPose } = entry;
	const colour = limbColour(state.view, colours, limb.depth, limbPose.planted);
	for (let index = 0; index + 1 < limbPose.joints.length; index += 1) {
		const start = projectFallbackPoint(limbPose.joints[index], limb.depth, projection, state);
		const end = projectFallbackPoint(limbPose.joints[index + 1], limb.depth, projection, state);
		const radiusStart =
			Math.max(0.001, finite(limb.thicknesses[index], limb.thicknesses.at(-1) ?? 0.01)) *
			projection.pixelsPerWorld;
		const radiusEnd =
			Math.max(
				0.001,
				finite(limb.thicknesses[index + 1], radiusStart / projection.pixelsPerWorld)
			) * projection.pixelsPerWorld;
		drawTaperedSegment(context, start, end, radiusStart, radiusEnd, colour);
	}
	for (const joint of limbPose.joints.slice(1, -1)) {
		const screen = projectFallbackPoint(joint, limb.depth, projection, state);
		context.beginPath();
		context.arc(screen.x, screen.y, Math.max(1.2, projection.pixelsPerWorld * 0.008), 0, TAU);
		context.fillStyle = colour;
		context.fill();
	}
}

function drawFlexibleAppendages(environment: DrawEnvironment): void {
	const { context, pose, state, projection, colours } = environment;
	let count = 0;
	for (const chain of pose.flexible.values()) {
		if (count >= MAX_FALLBACK_FLEXIBLE_CHAINS) break;
		count += 1;
		const pairs = Math.min(Math.floor(chain.positions.length / 2), Math.max(0, chain.count));
		if (pairs < 2) continue;
		context.beginPath();
		for (let index = 0; index < pairs; index += 1) {
			const screen = projectFallbackPoint(
				{ x: chain.positions[index * 2], y: chain.positions[index * 2 + 1] },
				0.05,
				projection,
				state
			);
			if (index === 0) context.moveTo(screen.x, screen.y);
			else context.lineTo(screen.x, screen.y);
		}
		context.strokeStyle = withAlpha(colours.shellB, 0.78);
		context.lineWidth = Math.max(1, projection.pixelsPerWorld * 0.008);
		context.lineCap = 'round';
		context.lineJoin = 'round';
		context.stroke();
	}
}

function drawPlate(environment: DrawEnvironment, plate: BodyPlate): void {
	const { context, pose, state, projection, colours, options } = environment;
	const points = plateOutline(plate, pose, state, projection);
	if (points.length < 3) return;
	context.beginPath();
	points.forEach((point, index) => {
		if (index === 0) context.moveTo(point.x, point.y);
		else context.lineTo(point.x, point.y);
	});
	context.closePath();

	const selected = plate.selected || plate.segmentIndex === options.selectedSegment;
	if (state.view === 'silhouette') {
		context.fillStyle = '#050708';
	} else if (state.view === 'fluorescence') {
		context.fillStyle = withAlpha(colours.background, 0.94);
	} else if (state.view === 'depth') {
		context.fillStyle = depthColour(plate.depth);
	} else if (state.view === 'anatomy') {
		context.fillStyle = anatomyColour(plate.region);
	} else {
		const first = points[0];
		const opposite = points[Math.floor(points.length * 0.5)];
		const gradient = context.createLinearGradient(first.x, first.y, opposite.x, opposite.y);
		gradient.addColorStop(0, colours.shellA);
		gradient.addColorStop(0.52, colours.shellB);
		gradient.addColorStop(1, colours.shellA);
		context.fillStyle = gradient;
	}
	if (state.view === 'fluorescence' && !options.exportSafe) {
		context.shadowColor = colours.emission;
		context.shadowBlur = Math.min(14, Math.max(2, state.bloom * 10));
	}
	context.fill();
	context.shadowBlur = 0;
	context.strokeStyle = selected ? colours.emission : withAlpha(colours.shellB, 0.78);
	context.lineWidth = selected ? 2 : 0.85;
	context.stroke();

	if (plate.ridge > 0.04 && state.view !== 'silhouette') {
		const start = normalizedPlatePoint(plate, pose, { x: -0.68, y: 0 });
		const end = normalizedPlatePoint(plate, pose, { x: 0.68, y: 0 });
		const screenStart = projectFallbackPoint(start, plate.depth + 0.01, projection, state);
		const screenEnd = projectFallbackPoint(end, plate.depth + 0.01, projection, state);
		context.beginPath();
		context.moveTo(screenStart.x, screenStart.y);
		context.lineTo(screenEnd.x, screenEnd.y);
		context.strokeStyle = withAlpha(
			state.view === 'fluorescence' ? colours.emission : colours.shellA,
			0.26 + clamp(plate.ridge, 0, 1) * 0.44
		);
		context.lineWidth = Math.max(0.7, plate.ridge * 2.4);
		context.stroke();
	}
}

function drawSurfaceMarks(environment: DrawEnvironment): void {
	const { context, phenotype, pose, state, projection, colours } = environment;
	if (state.view === 'silhouette' || state.view === 'depth') return;
	const samples = phenotype.surfaceSamples.slice(0, MAX_FALLBACK_SURFACE_MARKS);
	for (const sample of samples) {
		const plate = phenotype.plates[sample.plateIndex];
		if (!plate) continue;
		drawSurfaceMark(context, sample, plate, pose, state, projection, colours);
	}
}

function drawSurfaceMark(
	context: CanvasRenderingContext2D,
	sample: SurfaceSample,
	plate: BodyPlate,
	pose: CreaturePose,
	state: ExhibitState,
	projection: FallbackProjection,
	colours: FallbackColours
): void {
	const world = plateLocalWorldPoint(plate, pose, sample.local);
	const point = projectFallbackPoint(world, plate.depth + 0.012, projection, state);
	const markWorldScale =
		Math.min(Math.abs(finite(plate.width)), Math.abs(finite(plate.height))) *
		0.04 *
		Math.abs(finite(sample.scale, 0.5));
	const scale = Math.max(0.6, markWorldScale * projection.pixelsPerWorld);
	context.strokeStyle = withAlpha(
		state.view === 'fluorescence' ? colours.emission : colours.corrosion,
		state.view === 'surface' ? 0.8 : 0.44
	);
	context.fillStyle = context.strokeStyle;
	context.lineWidth = Math.max(0.6, scale * 0.28);
	if (sample.kind === 'bristle' || sample.kind === 'spine') {
		const length = scale * (sample.kind === 'spine' ? 2.8 : 1.7);
		context.beginPath();
		context.moveTo(point.x, point.y);
		context.lineTo(
			point.x + Math.cos(sample.angle) * length,
			point.y - Math.sin(sample.angle) * length
		);
		context.stroke();
	} else {
		context.beginPath();
		context.arc(point.x, point.y, scale * (sample.kind === 'pit' ? 0.56 : 0.34), 0, TAU);
		if (sample.kind === 'pit') context.stroke();
		else context.fill();
	}
}

function drawEyes(environment: DrawEnvironment): void {
	const { context, phenotype, pose, state, projection, colours, options } = environment;
	for (const eye of phenotype.eyes) {
		const plate = phenotype.plates.find((candidate) => candidate.segmentIndex === eye.segmentIndex);
		if (!plate) continue;
		const world = plateLocalWorldPoint(plate, pose, eye.local);
		const point = projectFallbackPoint(world, eye.depth, projection, state);
		const radius = Math.max(1.2, Math.abs(finite(eye.radius)) * projection.pixelsPerWorld);
		context.beginPath();
		context.arc(point.x, point.y, radius, 0, TAU);
		context.fillStyle = state.view === 'depth' ? depthColour(eye.depth) : colours.eye;
		if (state.view === 'fluorescence' && !options.exportSafe) {
			context.shadowColor = colours.emission;
			context.shadowBlur = Math.min(12, radius * 1.4);
		}
		context.fill();
		context.shadowBlur = 0;
		context.strokeStyle = withAlpha(colours.emission, 0.62);
		context.lineWidth = Math.max(0.7, radius * 0.14);
		context.stroke();
		context.beginPath();
		context.arc(point.x - radius * 0.25, point.y - radius * 0.28, radius * 0.18, 0, TAU);
		context.fillStyle = 'rgba(255,255,255,0.78)';
		context.fill();
	}
}

function drawViewOverlay(environment: DrawEnvironment): void {
	const { context, phenotype, pose, state, projection, colours, options } = environment;
	if (state.view === 'anatomy') {
		context.beginPath();
		phenotype.axis.forEach((axisPoint, index) => {
			const point = projectFallbackPoint(
				{
					x: axisPoint.position.x + pose.bodyOffset.x,
					y: axisPoint.position.y + pose.bodyOffset.y
				},
				axisPoint.depth + 0.04,
				projection,
				state
			);
			if (index === 0) context.moveTo(point.x, point.y);
			else context.lineTo(point.x, point.y);
		});
		context.strokeStyle = withAlpha(colours.emission, 0.72);
		context.lineWidth = 1.2;
		context.setLineDash([5, 4]);
		context.stroke();
		context.setLineDash([]);
	} else if (state.view === 'gait') {
		for (const limb of pose.limbs.slice(0, MAX_FALLBACK_LIMBS)) {
			const target = projectFallbackPoint(limb.target, 0.1, projection, state);
			context.beginPath();
			context.arc(target.x, target.y, limb.planted ? 4.2 : 2.8, 0, TAU);
			context.strokeStyle = limb.planted ? colours.emission : withAlpha(colours.shellB, 0.62);
			context.lineWidth = 1;
			context.stroke();
		}
	} else if (state.view === 'depth') {
		const gradient = context.createLinearGradient(options.width - 132, 0, options.width - 28, 0);
		gradient.addColorStop(0, '#111827');
		gradient.addColorStop(1, '#f8fafc');
		context.fillStyle = gradient;
		context.fillRect(options.width - 132, 24, 104, 6);
	}

	if (state.scannerIntensity > 0 && state.view !== 'silhouette') {
		const scanY = options.height * fract(options.time * 0.08 + 0.15);
		context.strokeStyle = withAlpha(colours.emission, clamp(state.scannerIntensity, 0, 1) * 0.52);
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(18, scanY);
		context.lineTo(options.width - 18, scanY);
		context.stroke();
	}

	context.fillStyle = withAlpha(colours.emission, 0.76);
	context.font = '600 10px ui-monospace, SFMono-Regular, Consolas, monospace';
	context.textAlign = 'right';
	context.textBaseline = 'top';
	context.fillText(viewLabel(state.view), options.width - 22, 38);
	context.textAlign = 'start';
}

function drawSpecimenLabel(environment: DrawEnvironment): void {
	const { context, phenotype, options, colours } = environment;
	const label = options.label?.trim() || phenotype.archiveDesignation || phenotype.informalName;
	const inset = Math.max(18, Math.min(options.width, options.height) * 0.045);
	context.fillStyle = withAlpha(colours.background, 0.72);
	context.fillRect(
		inset,
		options.height - inset - 38,
		Math.min(options.width - inset * 2, 420),
		38
	);
	context.fillStyle = withAlpha(colours.emission, 0.88);
	context.font = '600 11px ui-monospace, SFMono-Regular, Consolas, monospace';
	context.textAlign = 'start';
	context.textBaseline = 'top';
	context.fillText(label.toUpperCase(), inset + 10, options.height - inset - 29);
	context.fillStyle = withAlpha(colours.shellB, 0.76);
	context.font = '400 9px ui-monospace, SFMono-Regular, Consolas, monospace';
	context.fillText(
		`SIMPLIFIED CANVAS2D SPECIMEN · ${phenotype.fingerprint.slice(0, 16)}`,
		inset + 10,
		options.height - inset - 14
	);
}

function plateOutline(
	plate: BodyPlate,
	pose: CreaturePose,
	state: ExhibitState,
	projection: FallbackProjection
): readonly ScreenPoint[] {
	const sampleCount = 64;
	const points: ScreenPoint[] = [];
	for (let index = 0; index < sampleCount; index += 1) {
		const local = generalizedSuperellipsePoint(
			(index / sampleCount) * TAU,
			plate.exponent,
			plate.lobeAmplitude,
			plate.lobeCount,
			plate.seed
		);
		points.push(
			projectFallbackPoint(normalizedPlatePoint(plate, pose, local), plate.depth, projection, state)
		);
	}
	return points;
}

function normalizedPlatePoint(plate: BodyPlate, pose: CreaturePose, local: Vec2): Vec2 {
	return plateLocalWorldPoint(plate, pose, {
		x: finite(local.x) * Math.abs(finite(plate.width)) * 0.5,
		y: finite(local.y) * Math.abs(finite(plate.height)) * 0.5
	});
}

function plateLocalWorldPoint(plate: BodyPlate, pose: CreaturePose, local: Vec2): Vec2 {
	const x = finite(local.x);
	const y = finite(local.y);
	const cosine = Math.cos(finite(plate.rotation));
	const sine = Math.sin(finite(plate.rotation));
	return {
		x: finite(plate.center.x) + pose.bodyOffset.x + x * cosine - y * sine,
		y: finite(plate.center.y) + pose.bodyOffset.y + x * sine + y * cosine
	};
}

function drawTaperedSegment(
	context: CanvasRenderingContext2D,
	start: ScreenPoint,
	end: ScreenPoint,
	radiusStart: number,
	radiusEnd: number,
	colour: string
): void {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const length = Math.max(0.001, Math.hypot(dx, dy));
	const nx = -dy / length;
	const ny = dx / length;
	context.beginPath();
	context.moveTo(start.x + nx * radiusStart, start.y + ny * radiusStart);
	context.lineTo(end.x + nx * radiusEnd, end.y + ny * radiusEnd);
	context.lineTo(end.x - nx * radiusEnd, end.y - ny * radiusEnd);
	context.lineTo(start.x - nx * radiusStart, start.y - ny * radiusStart);
	context.closePath();
	context.fillStyle = colour;
	context.fill();
	context.beginPath();
	context.arc(start.x, start.y, radiusStart, 0, TAU);
	context.arc(end.x, end.y, radiusEnd, 0, TAU);
	context.fill();
}

function limbColour(
	view: ViewMode,
	colours: FallbackColours,
	depth: number,
	planted: boolean
): string {
	if (view === 'silhouette') return '#050708';
	if (view === 'fluorescence') return withAlpha(colours.emission, 0.58);
	if (view === 'depth') return depthColour(depth);
	if (view === 'gait') return planted ? colours.emission : withAlpha(colours.shellB, 0.72);
	if (view === 'anatomy') return '#3f9fa8';
	return depth < 0 ? withAlpha(colours.shellA, 0.58) : colours.shellB;
}

function anatomyColour(region: number): string {
	const colours = ['#3eb4be', '#b99738', '#b84f5a', '#786bb8'];
	const index = Math.abs(Math.floor(finite(region))) % colours.length;
	return colours[index];
}

function depthColour(depth: number): string {
	const channel = Math.round(clamp(finite(depth) * 0.35 + 0.5, 0, 1) * 255);
	return `rgb(${channel} ${channel} ${channel})`;
}

function viewLabel(view: ViewMode): string {
	return `${view.toUpperCase()} CHANNEL`;
}

function traceRoundedRect(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
): void {
	const r = Math.min(Math.max(0, radius), Math.abs(width) * 0.5, Math.abs(height) * 0.5);
	context.beginPath();
	context.moveTo(x + r, y);
	context.lineTo(x + width - r, y);
	context.quadraticCurveTo(x + width, y, x + width, y + r);
	context.lineTo(x + width, y + height - r);
	context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
	context.lineTo(x + r, y + height);
	context.quadraticCurveTo(x, y + height, x, y + height - r);
	context.lineTo(x, y + r);
	context.quadraticCurveTo(x, y, x + r, y);
	context.closePath();
}

function cssColour(colour: readonly [number, number, number]): string {
	const divisor = Math.max(...colour.map((channel) => Math.abs(finite(channel)))) > 1 ? 255 : 1;
	const channels = colour.map((channel) =>
		Math.round(clamp(finite(channel) / divisor, 0, 1) * 255)
	);
	return `rgb(${channels[0]} ${channels[1]} ${channels[2]})`;
}

function withAlpha(colour: string, alpha: number): string {
	const channels = colour.match(/[\d.]+/g)?.slice(0, 3) ?? ['255', '255', '255'];
	return `rgb(${channels.join(' ')} / ${clamp(finite(alpha), 0, 1)})`;
}

function fract(value: number): number {
	return value - Math.floor(value);
}

function finite(value: number | undefined, fallback = 0): number {
	return Number.isFinite(value) ? (value as number) : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}
