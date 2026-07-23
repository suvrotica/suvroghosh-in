import { documentBounds, objectBounds, viewportBounds, type Bounds } from './geometry';
import type {
	CanvasObject,
	ImageObject,
	NoteDocument,
	ShapeObject,
	StickyObject,
	StrokeObject,
	TextObject,
	TileObject,
	Viewport
} from './model';
import { getStrokeOutline, outlineToSvgPath } from './strokes';
import { SpatialIndex } from './spatial-index';

type RenderOptions = {
	width: number;
	height: number;
	devicePixelRatio?: number;
	selectedIds?: ReadonlySet<string>;
	previewObject?: CanvasObject | null;
	guides?: { x?: number; y?: number };
	readOnly?: boolean;
};

type ImageCacheEntry = {
	image: HTMLImageElement;
	listeners: Set<() => void>;
	lastUsed: number;
	failedAt?: number;
};

const imageCache = new Map<string, ImageCacheEntry>();
const preloadImagePins = new Set<string>();
const pathCache = new Map<string, Path2D>();
const pathKeyByObject = new Map<string, string>();
const MAX_PATH_CACHE = 6_000;
const MAX_IMAGE_CACHE = 48;
const MAX_IMAGE_CACHE_BYTES = 192 * 1024 * 1024;

function seededNumber(seed: string) {
	let value = 2166136261;
	for (let index = 0; index < seed.length; index += 1) {
		value ^= seed.charCodeAt(index);
		value = Math.imul(value, 16777619);
	}
	return () => {
		value += 0x6d2b79f5;
		let current = value;
		current = Math.imul(current ^ (current >>> 15), current | 1);
		current ^= current + Math.imul(current ^ (current >>> 7), current | 61);
		return ((current ^ (current >>> 14)) >>> 0) / 4_294_967_296;
	};
}

function drawPaper(
	context: CanvasRenderingContext2D,
	note: NoteDocument,
	viewport: Viewport,
	width: number,
	height: number
) {
	context.save();
	context.fillStyle = note.backgroundColor;
	context.fillRect(0, 0, width, height);
	if (note.background === 'blank') {
		context.restore();
		return;
	}

	context.translate(viewport.x, viewport.y);
	context.scale(viewport.zoom, viewport.zoom);
	const bounds = viewportBounds(viewport, width, height, 0);
	let spacing = note.gridSize;
	while (spacing * viewport.zoom < 12) spacing *= 2;
	const startX = Math.floor(bounds.minX / spacing) * spacing;
	const startY = Math.floor(bounds.minY / spacing) * spacing;
	const endX = Math.ceil(bounds.maxX / spacing) * spacing;
	const endY = Math.ceil(bounds.maxY / spacing) * spacing;
	context.strokeStyle = 'rgba(65, 76, 68, 0.16)';
	context.fillStyle = 'rgba(65, 76, 68, 0.24)';
	context.lineWidth = 1 / viewport.zoom;

	if (note.background === 'dots') {
		const radius = Math.max(0.75, 1.1 / viewport.zoom);
		for (let x = startX; x <= endX; x += spacing) {
			for (let y = startY; y <= endY; y += spacing) {
				context.beginPath();
				context.arc(x, y, radius, 0, Math.PI * 2);
				context.fill();
			}
		}
	} else {
		context.beginPath();
		if (note.background === 'grid') {
			for (let x = startX; x <= endX; x += spacing) {
				context.moveTo(x, bounds.minY);
				context.lineTo(x, bounds.maxY);
			}
		}
		for (let y = startY; y <= endY; y += spacing) {
			context.moveTo(bounds.minX, y);
			context.lineTo(bounds.maxX, y);
		}
		context.stroke();
	}
	context.restore();
}

function withObjectTransform(
	context: CanvasRenderingContext2D,
	object: CanvasObject,
	draw: () => void
) {
	context.save();
	const centerX = object.width / 2;
	const centerY = object.height / 2;
	context.globalAlpha *= object.opacity;
	context.translate(object.x + centerX, object.y + centerY);
	context.rotate((object.rotation * Math.PI) / 180);
	context.translate(-centerX, -centerY);
	draw();
	context.restore();
}

function strokeGeometryHash(object: StrokeObject) {
	let hash = 2166136261;
	const add = (value: string | number | undefined) => {
		const text = value === undefined ? '_' : String(value);
		for (let index = 0; index < text.length; index += 1) {
			hash ^= text.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		hash ^= 124;
		hash = Math.imul(hash, 16777619);
	};
	add(object.tool);
	add(object.width);
	add(object.height);
	add(object.sourceWidth);
	add(object.sourceHeight);
	add(object.style.size);
	add(object.style.pressure);
	add(object.style.pressureCurve);
	add(object.style.smoothing);
	for (const point of object.points) {
		add(point.x);
		add(point.y);
		add(point.pressure);
		add(point.tiltX);
		add(point.tiltY);
		add(point.altitudeAngle);
	}
	return (hash >>> 0).toString(36);
}

function strokePath(object: StrokeObject) {
	if (object.id.startsWith('preview-')) {
		return new Path2D(outlineToSvgPath(getStrokeOutline(object)));
	}
	const cacheKey = `${object.id}:${strokeGeometryHash(object)}`;
	const cached = pathCache.get(cacheKey);
	if (cached) return cached;
	const path = new Path2D(outlineToSvgPath(getStrokeOutline(object)));
	const previousKey = pathKeyByObject.get(object.id);
	if (previousKey && previousKey !== cacheKey) pathCache.delete(previousKey);
	if (pathCache.size >= MAX_PATH_CACHE) {
		const first = pathCache.keys().next().value;
		if (typeof first === 'string') {
			pathCache.delete(first);
			for (const [objectId, key] of pathKeyByObject) {
				if (key === first) pathKeyByObject.delete(objectId);
			}
		}
	}
	pathCache.set(cacheKey, path);
	pathKeyByObject.set(object.id, cacheKey);
	return path;
}

function drawStroke(context: CanvasRenderingContext2D, object: StrokeObject) {
	const path = strokePath(object);
	context.save();
	context.fillStyle = object.style.color;
	context.globalAlpha *= object.style.opacity;
	if (object.tool === 'highlighter') context.globalCompositeOperation = 'multiply';
	context.fill(path);

	if (object.style.texture > 0 && object.tool !== 'highlighter') {
		const random = seededNumber(object.id);
		const stylusPoint = object.points.find(
			(point) =>
				point.azimuthAngle !== undefined || point.tiltX !== undefined || point.tiltY !== undefined
		);
		const stylusAngle =
			stylusPoint?.azimuthAngle ?? Math.atan2(stylusPoint?.tiltY ?? 0, stylusPoint?.tiltX ?? 1);
		const count = Math.min(
			220,
			Math.max(8, Math.round(object.points.length * object.style.texture * 0.65))
		);
		context.clip(path);
		context.globalAlpha *= 0.15 + object.style.texture * 0.2;
		context.fillStyle = object.style.color;
		for (let index = 0; index < count; index += 1) {
			const x = random() * Math.max(object.width, 1);
			const y = random() * Math.max(object.height, 1);
			const radius = 0.25 + random() * object.style.size * 0.18;
			context.beginPath();
			context.ellipse(
				x,
				y,
				radius * (0.5 + random()),
				radius,
				stylusAngle + (random() - 0.5) * 0.45,
				0,
				Math.PI * 2
			);
			context.fill();
		}
	}
	context.restore();
}

function drawShape(context: CanvasRenderingContext2D, object: ShapeObject) {
	context.save();
	context.strokeStyle = object.stroke;
	context.fillStyle = object.fill ?? 'transparent';
	context.lineWidth = object.strokeWidth;
	context.lineCap = 'round';
	context.lineJoin = 'round';
	context.setLineDash(object.dash ?? []);
	context.beginPath();
	switch (object.shape) {
		case 'rectangle':
			context.rect(0, 0, object.width, object.height);
			break;
		case 'ellipse':
			context.ellipse(
				object.width / 2,
				object.height / 2,
				Math.abs(object.width / 2),
				Math.abs(object.height / 2),
				0,
				0,
				Math.PI * 2
			);
			break;
		case 'line':
		case 'arrow': {
			context.moveTo(object.from.x, object.from.y);
			context.lineTo(object.to.x, object.to.y);
			if (object.shape === 'arrow') {
				const angle = Math.atan2(object.to.y - object.from.y, object.to.x - object.from.x);
				const head = Math.min(22, Math.max(10, object.strokeWidth * 4));
				context.moveTo(object.to.x, object.to.y);
				context.lineTo(
					object.to.x - head * Math.cos(angle - Math.PI / 6),
					object.to.y - head * Math.sin(angle - Math.PI / 6)
				);
				context.moveTo(object.to.x, object.to.y);
				context.lineTo(
					object.to.x - head * Math.cos(angle + Math.PI / 6),
					object.to.y - head * Math.sin(angle + Math.PI / 6)
				);
			}
			break;
		}
	}
	if (object.fill && (object.shape === 'rectangle' || object.shape === 'ellipse')) context.fill();
	context.stroke();
	context.restore();
}

function wrapLines(
	context: CanvasRenderingContext2D,
	text: string,
	width: number,
	maxLines = Number.POSITIVE_INFINITY
) {
	const lines: string[] = [];
	for (const paragraph of text.split('\n')) {
		const words = paragraph.split(/\s+/);
		let line = '';
		for (const word of words) {
			const candidate = line ? `${line} ${word}` : word;
			if (line && context.measureText(candidate).width > width) {
				lines.push(line);
				line = word;
				if (lines.length >= maxLines) return lines;
			} else {
				line = candidate;
			}
		}
		lines.push(line);
		if (lines.length >= maxLines) return lines;
	}
	return lines;
}

function fontFamily(value: TextObject['fontFamily']) {
	if (value === 'serif') return '"Source Serif 4 Variable", Georgia, serif';
	if (value === 'mono') return 'ui-monospace, "Cascadia Code", monospace';
	return '"Roboto Variable", system-ui, sans-serif';
}

function drawText(context: CanvasRenderingContext2D, object: TextObject) {
	context.save();
	context.fillStyle = object.color;
	context.font = `${object.fontSize}px ${fontFamily(object.fontFamily)}`;
	context.textAlign = object.align;
	context.textBaseline = 'top';
	const x =
		object.align === 'left' ? 0 : object.align === 'center' ? object.width / 2 : object.width;
	const lineHeight = object.fontSize * 1.25;
	const lines = wrapLines(context, object.text, object.width);
	lines.forEach((line, index) => context.fillText(line, x, index * lineHeight, object.width));
	context.restore();
}

function drawSticky(context: CanvasRenderingContext2D, object: StickyObject) {
	context.save();
	context.fillStyle = object.color;
	context.shadowColor = 'rgba(35, 29, 21, 0.14)';
	context.shadowBlur = 12;
	context.shadowOffsetY = 5;
	context.fillRect(0, 0, object.width, object.height);
	context.shadowColor = 'transparent';
	context.fillStyle = object.textColor;
	context.font = `${object.fontSize}px "Source Serif 4 Variable", Georgia, serif`;
	context.textBaseline = 'top';
	const padding = Math.min(22, object.width * 0.09);
	const lineHeight = object.fontSize * 1.3;
	const maxLines = Math.max(1, Math.floor((object.height - padding * 2) / lineHeight));
	const lines = wrapLines(context, object.text, object.width - padding * 2, maxLines);
	lines.forEach((line, index) =>
		context.fillText(line, padding, padding + index * lineHeight, object.width - padding * 2)
	);
	context.restore();
}

function drawTile(context: CanvasRenderingContext2D, object: TileObject) {
	context.save();
	context.shadowColor = 'rgba(35, 29, 21, 0.13)';
	context.shadowBlur = 18;
	context.shadowOffsetY = 7;
	context.fillStyle = object.color;
	context.beginPath();
	context.roundRect(0, 0, object.width, object.height, 12);
	context.fill();
	context.shadowColor = 'transparent';
	context.strokeStyle = object.borderColor;
	context.lineWidth = 1.5;
	context.stroke();
	context.fillStyle = 'rgba(43, 36, 28, 0.58)';
	context.font = '600 12px "Roboto Variable", system-ui, sans-serif';
	context.textBaseline = 'middle';
	context.fillText(object.title || 'Canvas tile', 18, 20, Math.max(1, object.width - 58));
	context.fillStyle = 'rgba(43, 36, 28, 0.34)';
	for (let index = 0; index < 3; index += 1) {
		context.beginPath();
		context.arc(object.width - 20 + index * 4, 20, 1.1, 0, Math.PI * 2);
		context.fill();
	}
	context.restore();
}

function pruneImageCache(force = false) {
	const now = Date.now();
	let decodedBytes = [...imageCache.values()].reduce(
		(total, entry) => total + entry.image.naturalWidth * entry.image.naturalHeight * 4,
		0
	);
	if (imageCache.size <= MAX_IMAGE_CACHE && decodedBytes <= MAX_IMAGE_CACHE_BYTES) return;
	const completed = [...imageCache.entries()]
		.filter(
			([src, entry]) =>
				entry.image.complete &&
				!preloadImagePins.has(src) &&
				(force || now - entry.lastUsed >= 1_000)
		)
		.sort((left, right) => left[1].lastUsed - right[1].lastUsed);
	for (const [src, entry] of completed) {
		if (imageCache.size <= MAX_IMAGE_CACHE && decodedBytes <= MAX_IMAGE_CACHE_BYTES) break;
		decodedBytes -= entry.image.naturalWidth * entry.image.naturalHeight * 4;
		entry.image.onload = null;
		entry.image.onerror = null;
		entry.listeners.clear();
		imageCache.delete(src);
	}
}

function getImage(object: ImageObject, requestRender: () => void) {
	let cached = imageCache.get(object.src);
	if (cached?.failedAt && Date.now() - cached.failedAt >= 10_000) {
		imageCache.delete(object.src);
		cached = undefined;
	}
	if (cached) {
		cached.lastUsed = Date.now();
		if (!cached.image.complete) cached.listeners.add(requestRender);
		return cached.image;
	}
	const image = new Image();
	const entry: ImageCacheEntry = {
		image,
		listeners: new Set([requestRender]),
		lastUsed: Date.now()
	};
	image.decoding = 'async';
	if (
		/^https:\/\//i.test(object.src) &&
		!object.src.startsWith(globalThis.location?.origin ?? '')
	) {
		image.crossOrigin = 'anonymous';
	}
	const notify = (failed = false) => {
		const notifiedAt = Date.now();
		const listeners = [...entry.listeners];
		entry.lastUsed = notifiedAt;
		entry.failedAt = failed ? notifiedAt : undefined;
		for (const listener of listeners) listener();
		entry.listeners.clear();
		pruneImageCache();
		if (failed) {
			setTimeout(() => {
				const current = imageCache.get(object.src);
				if (current !== entry || current.failedAt !== notifiedAt) return;
				current.image.onload = null;
				current.image.onerror = null;
				imageCache.delete(object.src);
				for (const listener of listeners) listener();
			}, 10_050);
		}
	};
	image.onload = () => notify(false);
	image.onerror = () => notify(true);
	image.src = object.src;
	imageCache.set(object.src, entry);
	pruneImageCache();
	return image;
}

export async function preloadNoteImages(note: NoteDocument) {
	const images = [
		...new Map(
			note.objects
				.filter((object): object is ImageObject => object.type === 'image')
				.map((object) => [object.src, object])
		).values()
	];
	for (const object of images) preloadImagePins.add(object.src);
	let decodedBytes = 0;
	let preloadCompleted = false;
	try {
		for (let index = 0; index < images.length; index += 4) {
			const batch = images.slice(index, index + 4);
			await Promise.all(
				batch.map(async (object) => {
					const image = getImage(object, () => undefined);
					if (image.complete) {
						if (image.naturalWidth <= 0)
							throw new Error(`The image “${object.alt || object.id}” could not be loaded.`);
						return;
					}
					try {
						await image.decode();
					} catch {
						throw new Error(
							`The image “${object.alt || object.id}” could not be decoded for export.`
						);
					}
				})
			);
			decodedBytes += batch.reduce((total, object) => {
				const image = imageCache.get(object.src)?.image;
				return total + (image?.naturalWidth ?? 0) * (image?.naturalHeight ?? 0) * 4;
			}, 0);
			if (decodedBytes > MAX_IMAGE_CACHE_BYTES) {
				throw new Error(
					'This note contains too many decoded image pixels for a safe single-page browser export. Export a smaller selection or reduce the image count first.'
				);
			}
		}
		preloadCompleted = true;
	} finally {
		for (const object of images) preloadImagePins.delete(object.src);
		if (!preloadCompleted) pruneImageCache(true);
	}
}

function drawImage(
	context: CanvasRenderingContext2D,
	object: ImageObject,
	requestRender: () => void
) {
	const image = getImage(object, requestRender);
	if (image.complete && image.naturalWidth > 0) {
		context.drawImage(image, 0, 0, object.width, object.height);
		return;
	}
	context.fillStyle = 'rgba(120, 110, 96, 0.12)';
	context.fillRect(0, 0, object.width, object.height);
	context.strokeStyle = 'rgba(80, 70, 58, 0.35)';
	context.strokeRect(0, 0, object.width, object.height);
}

function drawObject(
	context: CanvasRenderingContext2D,
	object: CanvasObject,
	requestRender: () => void
) {
	if (object.hidden) return;
	withObjectTransform(context, object, () => {
		switch (object.type) {
			case 'stroke':
				drawStroke(context, object);
				break;
			case 'shape':
				drawShape(context, object);
				break;
			case 'text':
				drawText(context, object);
				break;
			case 'sticky':
				drawSticky(context, object);
				break;
			case 'image':
				drawImage(context, object, requestRender);
				break;
			case 'tile':
				drawTile(context, object);
				break;
		}
	});
}

function drawSelection(
	context: CanvasRenderingContext2D,
	object: CanvasObject,
	viewport: Viewport
) {
	drawSelectionBounds(context, objectBounds(object), viewport, object.locked);
}

function drawSelectionBounds(
	context: CanvasRenderingContext2D,
	bounds: Bounds,
	viewport: Viewport,
	locked: boolean
) {
	context.save();
	context.strokeStyle = '#276b63';
	context.fillStyle = '#fbf7ec';
	context.lineWidth = 1.5 / viewport.zoom;
	context.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);
	context.strokeRect(
		bounds.minX,
		bounds.minY,
		bounds.maxX - bounds.minX,
		bounds.maxY - bounds.minY
	);
	context.setLineDash([]);
	const radius = 4.5 / viewport.zoom;
	for (const [x, y] of [
		[bounds.minX, bounds.minY],
		[bounds.maxX, bounds.minY],
		[bounds.maxX, bounds.maxY],
		[bounds.minX, bounds.maxY]
	]) {
		context.beginPath();
		context.arc(x, y, radius, 0, Math.PI * 2);
		context.fill();
		context.stroke();
	}
	if (locked) {
		context.fillStyle = '#276b63';
		context.font = `${14 / viewport.zoom}px system-ui`;
		context.fillText('Locked', bounds.minX, bounds.minY - 10 / viewport.zoom);
	}
	context.restore();
}

function worldToObjectPoint(object: CanvasObject, point: { x: number; y: number }) {
	const centerX = object.x + object.width / 2;
	const centerY = object.y + object.height / 2;
	const radians = (-object.rotation * Math.PI) / 180;
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	const deltaX = point.x - centerX;
	const deltaY = point.y - centerY;
	return {
		x: deltaX * cosine - deltaY * sine + object.width / 2,
		y: deltaX * sine + deltaY * cosine + object.height / 2
	};
}

function distanceToSegmentSquared(
	point: { x: number; y: number },
	start: { x: number; y: number },
	end: { x: number; y: number }
) {
	const deltaX = end.x - start.x;
	const deltaY = end.y - start.y;
	const lengthSquared = deltaX * deltaX + deltaY * deltaY;
	if (lengthSquared === 0) return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
	const progress = Math.max(
		0,
		Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared)
	);
	const x = start.x + progress * deltaX;
	const y = start.y + progress * deltaY;
	return (point.x - x) ** 2 + (point.y - y) ** 2;
}

function containsObjectPoint(
	object: CanvasObject,
	point: { x: number; y: number },
	tolerance: number
) {
	if (object.hidden) return false;
	const local = worldToObjectPoint(object, point);
	const insideRectangle =
		local.x >= -tolerance &&
		local.y >= -tolerance &&
		local.x <= object.width + tolerance &&
		local.y <= object.height + tolerance;
	if (!insideRectangle) return false;

	if (object.type === 'stroke') {
		const scaleX = object.width / Math.max(1, object.sourceWidth);
		const scaleY = object.height / Math.max(1, object.sourceHeight);
		const threshold = tolerance + object.style.size / 2;
		for (let index = 1; index < object.points.length; index += 1) {
			const previous = object.points[index - 1];
			const current = object.points[index];
			if (
				distanceToSegmentSquared(
					local,
					{ x: previous.x * scaleX, y: previous.y * scaleY },
					{ x: current.x * scaleX, y: current.y * scaleY }
				) <=
				threshold * threshold
			) {
				return true;
			}
		}
		return object.points.length === 1;
	}

	if (object.type === 'shape') {
		if (object.shape === 'line' || object.shape === 'arrow') {
			const threshold = tolerance + object.strokeWidth / 2;
			return distanceToSegmentSquared(local, object.from, object.to) <= threshold * threshold;
		}
		if (object.shape === 'ellipse') {
			const radiusX = Math.max(1, object.width / 2);
			const radiusY = Math.max(1, object.height / 2);
			const normalizedRadius = Math.sqrt(
				((local.x - object.width / 2) / radiusX) ** 2 +
					((local.y - object.height / 2) / radiusY) ** 2
			);
			if (object.fill && normalizedRadius <= 1) return true;
			if (normalizedRadius === 0) return false;
			const threshold = tolerance + object.strokeWidth / 2;
			const distanceFromCenter = Math.hypot(
				local.x - object.width / 2,
				local.y - object.height / 2
			);
			const boundaryDistance = distanceFromCenter / normalizedRadius;
			return Math.abs(distanceFromCenter - boundaryDistance) <= threshold;
		}
		if (object.shape === 'rectangle' && !object.fill) {
			const thresholdSquared = (tolerance + object.strokeWidth / 2) ** 2;
			const topLeft = { x: 0, y: 0 };
			const topRight = { x: object.width, y: 0 };
			const bottomRight = { x: object.width, y: object.height };
			const bottomLeft = { x: 0, y: object.height };
			return (
				distanceToSegmentSquared(local, topLeft, topRight) <= thresholdSquared ||
				distanceToSegmentSquared(local, topRight, bottomRight) <= thresholdSquared ||
				distanceToSegmentSquared(local, bottomRight, bottomLeft) <= thresholdSquared ||
				distanceToSegmentSquared(local, bottomLeft, topLeft) <= thresholdSquared
			);
		}
	}

	return true;
}

export class CanvasRenderer {
	#index = new SpatialIndex();
	#objectsReference: CanvasObject[] | null = null;
	#indexedObjects = new Map<string, CanvasObject>();
	#frame = 0;
	#latest:
		| {
				context: CanvasRenderingContext2D;
				note: NoteDocument;
				viewport: Viewport;
				options: RenderOptions;
		  }
		| undefined;
	#rerender = () => {
		if (!this.#latest) return;
		const { context, note, viewport, options } = this.#latest;
		this.render(context, note, viewport, options);
	};
	onRender?: (visibleObjectCount: number) => void;

	invalidate() {
		this.#objectsReference = null;
		this.#indexedObjects.clear();
		this.#index.clear();
	}

	#syncIndex(objects: CanvasObject[]) {
		if (this.#objectsReference === objects) return;
		const next = new Map<string, CanvasObject>();
		for (const object of objects) {
			next.set(object.id, object);
			if (this.#indexedObjects.get(object.id) !== object) this.#index.insert(object);
		}
		for (const id of this.#indexedObjects.keys()) {
			if (!next.has(id)) this.#index.remove(id);
		}
		this.#indexedObjects = next;
		this.#objectsReference = objects;
	}

	dispose() {
		cancelAnimationFrame(this.#frame);
		for (const entry of imageCache.values()) entry.listeners.delete(this.#rerender);
		this.#latest = undefined;
		this.onRender = undefined;
	}

	render(
		context: CanvasRenderingContext2D,
		note: NoteDocument,
		viewport: Viewport,
		options: RenderOptions
	) {
		this.#latest = { context, note, viewport, options };
		cancelAnimationFrame(this.#frame);
		this.#frame = requestAnimationFrame(() => {
			const dpr = options.devicePixelRatio ?? window.devicePixelRatio ?? 1;
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			context.clearRect(0, 0, options.width, options.height);
			drawPaper(context, note, viewport, options.width, options.height);

			this.#syncIndex(note.objects);
			const visibleBounds = viewportBounds(viewport, options.width, options.height);
			const visible = this.#index
				.search(visibleBounds)
				.sort((left, right) => left.zIndex - right.zIndex);

			context.save();
			context.translate(viewport.x, viewport.y);
			context.scale(viewport.zoom, viewport.zoom);
			for (const object of visible) drawObject(context, object, this.#rerender);
			if (options.previewObject) drawObject(context, options.previewObject, () => undefined);
			if (!options.readOnly && options.selectedIds) {
				const selectionGroups = new Map<string, CanvasObject[]>();
				for (const object of note.objects) {
					if (object.hidden || !options.selectedIds.has(object.id)) continue;
					const groupKey =
						object.type === 'tile'
							? `group:${object.id}`
							: object.groupId
								? `group:${object.groupId}`
								: `object:${object.id}`;
					const group = selectionGroups.get(groupKey) ?? [];
					group.push(object);
					selectionGroups.set(groupKey, group);
				}
				for (const group of selectionGroups.values()) {
					if (group.length === 1) {
						drawSelection(context, group[0], viewport);
						continue;
					}
					const bounds = group.map(objectBounds).reduce((aggregate, current) => ({
						minX: Math.min(aggregate.minX, current.minX),
						minY: Math.min(aggregate.minY, current.minY),
						maxX: Math.max(aggregate.maxX, current.maxX),
						maxY: Math.max(aggregate.maxY, current.maxY)
					}));
					drawSelectionBounds(
						context,
						bounds,
						viewport,
						group.some((object) => object.locked)
					);
				}
			}
			if (
				!options.readOnly &&
				options.guides &&
				(options.guides.x !== undefined || options.guides.y !== undefined)
			) {
				context.save();
				context.strokeStyle = '#b55d36';
				context.lineWidth = 1 / viewport.zoom;
				context.setLineDash([5 / viewport.zoom, 4 / viewport.zoom]);
				context.beginPath();
				if (options.guides.x !== undefined) {
					context.moveTo(options.guides.x, visibleBounds.minY);
					context.lineTo(options.guides.x, visibleBounds.maxY);
				}
				if (options.guides.y !== undefined) {
					context.moveTo(visibleBounds.minX, options.guides.y);
					context.lineTo(visibleBounds.maxX, options.guides.y);
				}
				context.stroke();
				context.restore();
			}
			context.restore();
			this.onRender?.(visible.length);
		});
	}

	hitTest(note: NoteDocument, point: { x: number; y: number }, tolerance: number) {
		this.#syncIndex(note.objects);
		const matches = this.#index
			.search({
				minX: point.x - tolerance,
				minY: point.y - tolerance,
				maxX: point.x + tolerance,
				maxY: point.y + tolerance
			})
			.filter((object) => containsObjectPoint(object, point, tolerance))
			.sort((left, right) => right.zIndex - left.zIndex);
		return matches[0] ?? null;
	}

	search(bounds: Bounds) {
		return this.#index.search(bounds);
	}
}

export function fitViewport(
	note: NoteDocument,
	width: number,
	height: number,
	padding = 48
): Viewport {
	const bounds = documentBounds(note, 0);
	const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
	const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
	const zoom = Math.min(
		3,
		Math.max(
			0.1,
			Math.min((width - padding * 2) / contentWidth, (height - padding * 2) / contentHeight)
		)
	);
	return {
		zoom,
		x: (width - contentWidth * zoom) / 2 - bounds.minX * zoom,
		y: (height - contentHeight * zoom) / 2 - bounds.minY * zoom
	};
}
