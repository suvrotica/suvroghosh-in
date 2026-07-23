import { SvelteDate, SvelteMap, SvelteSet } from 'svelte/reactivity';
import { boundsFromPoints, documentBounds, objectBounds, simplifyStroke, snap } from './geometry';
import { DocumentHistory } from './history';
import {
	DEFAULT_BRUSHES,
	cloneDocument,
	cloneSceneValue,
	createId,
	isDrawingTool,
	type BrushStyle,
	type CanvasObject,
	type DrawingTool,
	type ImageObject,
	type InkPoint,
	type NoteDocument,
	type PaperStyle,
	type ShapeObject,
	type StrokeObject,
	type TileObject,
	type Tool,
	type Viewport
} from './model';
import { normalizeStrokePoints } from './strokes';
import { canvasObjectSchema } from './schema';

type ChangeReason =
	| 'draw'
	| 'insert'
	| 'delete'
	| 'transform'
	| 'style'
	| 'history'
	| 'import'
	| 'settings';

type ChangeListener = (document: NoteDocument, reason: ChangeReason) => void;

export class InkEditorState {
	document = $state<NoteDocument>(undefined!);
	viewport = $state<Viewport>({ x: 0, y: 0, zoom: 1 });
	selectedIds = $state<string[]>([]);
	tool = $state<Tool>('charcoal');
	brushes = $state<Record<DrawingTool, BrushStyle>>(structuredClone(DEFAULT_BRUSHES));
	showMinimap = $state(true);
	distractionFree = $state(false);
	fingerInkEnabled = $state(false);
	editTileContents = $state(false);
	canUndo = $state(false);
	canRedo = $state(false);
	visibleObjectCount = $state(0);
	alignmentGuides = $state<{ x?: number; y?: number }>({});
	activeTileId = $state<string | null>(null);
	#history = new DocumentHistory(100);
	#listener?: ChangeListener;
	#transformBase: NoteDocument | null = null;
	#transformChanged = false;
	#clipboard: CanvasObject[] = [];

	constructor(document: NoteDocument, listener?: ChangeListener) {
		this.document = cloneDocument(document);
		this.viewport = { ...document.viewport };
		this.#listener = listener;
	}

	get selectedSet() {
		return new SvelteSet(this.selectedIds);
	}

	get selectedObjects() {
		const selected = this.selectedSet;
		return this.document.objects.filter((object) => selected.has(object.id));
	}

	get activeBrush() {
		return isDrawingTool(this.tool) ? this.brushes[this.tool] : this.brushes.charcoal;
	}

	get objectCount() {
		return this.document.objects.length;
	}

	setTool(tool: Tool) {
		this.tool = tool;
	}

	setViewport(viewport: Viewport) {
		this.viewport = viewport;
	}

	checkpoint() {
		this.#history.checkpoint(this.document);
		this.#syncHistoryFlags();
	}

	undo() {
		if (!this.#history.canUndo) return;
		this.document = this.#history.undo(this.document);
		this.viewport = { ...this.document.viewport };
		this.selectedIds = [];
		this.activeTileId = null;
		this.alignmentGuides = {};
		this.#transformBase = null;
		this.#transformChanged = false;
		this.#syncHistoryFlags();
		this.#notify('history');
	}

	redo() {
		if (!this.#history.canRedo) return;
		this.document = this.#history.redo(this.document);
		this.viewport = { ...this.document.viewport };
		this.selectedIds = [];
		this.activeTileId = null;
		this.alignmentGuides = {};
		this.#transformBase = null;
		this.#transformChanged = false;
		this.#syncHistoryFlags();
		this.#notify('history');
	}

	replaceDocument(document: NoteDocument, reason: ChangeReason = 'import') {
		this.checkpoint();
		this.document = cloneDocument(document);
		this.viewport = { ...document.viewport };
		this.selectedIds = [];
		this.activeTileId = null;
		this.alignmentGuides = {};
		this.#transformBase = null;
		this.#transformChanged = false;
		this.#notify(reason);
	}

	loadCloudDocument(document: NoteDocument) {
		this.document = cloneDocument(document);
		this.viewport = { ...document.viewport };
		this.selectedIds = [];
		this.activeTileId = null;
		this.alignmentGuides = {};
		this.#transformBase = null;
		this.#transformChanged = false;
		this.#history.clear();
		this.#syncHistoryFlags();
	}

	select(ids: string[], additive = false) {
		const expandedIds = this.editTileContents
			? this.#expandExplicitTileIds(ids)
			: this.#expandSelectionIds(ids);
		if (additive) {
			const selected = new SvelteSet(this.selectedIds);
			const removeExpandedSelection = expandedIds.every((id) => selected.has(id));
			for (const id of expandedIds) {
				if (removeExpandedSelection) selected.delete(id);
				else selected.add(id);
			}
			this.selectedIds = [...selected];
		} else {
			this.selectedIds = expandedIds;
		}
		this.#syncActiveTileFromSelection();
	}

	selectObject(id: string, additive = false) {
		const object = this.document.objects.find((candidate) => candidate.id === id);
		if (!object) {
			if (!additive) this.clearSelection();
			return;
		}
		const groupId =
			this.editTileContents && object.type !== 'tile'
				? undefined
				: object.type === 'tile'
					? object.id
					: object.groupId;
		const ids = groupId
			? this.document.objects
					.filter((candidate) => candidate.id === groupId || candidate.groupId === groupId)
					.map((candidate) => candidate.id)
			: [id];
		this.select(ids, additive);
	}

	clearSelection(clearActiveTile = true) {
		this.selectedIds = [];
		if (clearActiveTile) this.activeTileId = null;
	}

	addObject(
		object: CanvasObject,
		reason: ChangeReason = 'insert',
		activeTileOverride?: string | null
	) {
		this.checkpoint();
		const targetTileId = activeTileOverride === undefined ? this.activeTileId : activeTileOverride;
		const activeTile = this.document.objects.find(
			(candidate): candidate is TileObject =>
				candidate.type === 'tile' && candidate.id === targetTileId && !candidate.locked
		);
		const nextObject: CanvasObject =
			activeTile && object.type !== 'tile' && !object.groupId
				? { ...object, groupId: activeTile.id }
				: object;
		this.document = this.#withObjects([...this.document.objects, nextObject]);
		this.selectedIds = [nextObject.id];
		if (nextObject.type === 'tile') this.activeTileId = nextObject.id;
		this.#notify(reason);
	}

	addStroke(points: InkPoint[], tool: DrawingTool = this.tool as DrawingTool) {
		if (points.length === 0 || !isDrawingTool(tool)) return;
		const brush = { ...this.brushes[tool] };
		const simplified = simplifyStroke(points, Math.max(0.12, 0.5 / this.viewport.zoom));
		const padding = brush.size / 2 + 2;
		const bounds = boundsFromPoints(simplified, padding);
		const now = new SvelteDate().toISOString();
		const width = Math.max(1, bounds.maxX - bounds.minX);
		const height = Math.max(1, bounds.maxY - bounds.minY);
		const object: StrokeObject = {
			id: createId('stroke'),
			type: 'stroke',
			tool,
			x: bounds.minX,
			y: bounds.minY,
			width,
			height,
			sourceWidth: width,
			sourceHeight: height,
			rotation: 0,
			opacity: 1,
			locked: false,
			hidden: false,
			zIndex: this.#nextZIndex(),
			createdAt: now,
			updatedAt: now,
			points: normalizeStrokePoints(simplified, bounds.minX, bounds.minY),
			style: brush
		};
		this.addObject(object, 'draw');
		this.clearSelection(false);
	}

	addShape(
		shape: ShapeObject['shape'],
		start: { x: number; y: number },
		end: { x: number; y: number }
	) {
		const grid = this.document.gridSize;
		const snappedStart = this.document.snapToGrid
			? { x: snap(start.x, grid), y: snap(start.y, grid) }
			: start;
		const snappedEnd = this.document.snapToGrid
			? { x: snap(end.x, grid), y: snap(end.y, grid) }
			: end;
		const minX = Math.min(snappedStart.x, snappedEnd.x);
		const minY = Math.min(snappedStart.y, snappedEnd.y);
		const width = Math.max(1, Math.abs(snappedEnd.x - snappedStart.x));
		const height = Math.max(1, Math.abs(snappedEnd.y - snappedStart.y));
		const now = new SvelteDate().toISOString();
		const object: ShapeObject = {
			id: createId('shape'),
			type: 'shape',
			shape,
			x: minX,
			y: minY,
			width,
			height,
			rotation: 0,
			opacity: 1,
			locked: false,
			hidden: false,
			zIndex: this.#nextZIndex(),
			createdAt: now,
			updatedAt: now,
			from: { x: snappedStart.x - minX, y: snappedStart.y - minY },
			to: { x: snappedEnd.x - minX, y: snappedEnd.y - minY },
			stroke: this.activeBrush.color,
			strokeWidth: Math.max(1, this.activeBrush.size * 0.65)
		};
		this.addObject(object);
	}

	addTile(center: { x: number; y: number }, title = 'Canvas tile') {
		const now = new SvelteDate().toISOString();
		const tile: TileObject = {
			id: createId('tile'),
			type: 'tile',
			x: center.x - 260,
			y: center.y - 180,
			width: 520,
			height: 360,
			rotation: 0,
			opacity: 1,
			locked: false,
			hidden: false,
			zIndex: Math.min(...this.document.objects.map((object) => object.zIndex), 0) - 1,
			createdAt: now,
			updatedAt: now,
			title,
			color: '#fffaf0',
			borderColor: '#cfc2ab'
		};
		this.addObject(tile);
	}

	addImage(
		image: { src: string; width: number; height: number; alt: string; mimeType: string },
		center: { x: number; y: number },
		intendedTileId: string | null = this.activeTileId
	) {
		const now = new SvelteDate().toISOString();
		const maxDisplayWidth = 720;
		const scale = Math.min(1, maxDisplayWidth / Math.max(1, image.width));
		const width = Math.max(80, image.width * scale);
		const height = Math.max(60, image.height * scale);
		const object: ImageObject = {
			id: createId('image'),
			type: 'image',
			x: center.x - width / 2,
			y: center.y - height / 2,
			width,
			height,
			rotation: 0,
			opacity: 1,
			locked: false,
			hidden: false,
			zIndex: this.#nextZIndex(),
			createdAt: now,
			updatedAt: now,
			src: image.src,
			alt: image.alt,
			mimeType: image.mimeType
		};
		this.addObject(object, 'insert', intendedTileId);
	}

	makeTileFromSelection(title = 'Canvas tile') {
		const bounds = this.selectionBounds();
		if (!bounds) return;
		if (this.selectedObjects.some((object) => object.locked || object.type === 'tile')) {
			return;
		}
		this.checkpoint();
		const now = new SvelteDate().toISOString();
		const padding = 44;
		const tile: TileObject = {
			id: createId('tile'),
			type: 'tile',
			x: bounds.minX - padding,
			y: bounds.minY - padding - 16,
			width: bounds.maxX - bounds.minX + padding * 2,
			height: bounds.maxY - bounds.minY + padding * 2 + 16,
			rotation: 0,
			opacity: 1,
			locked: false,
			hidden: false,
			zIndex: Math.min(...this.selectedObjects.map((object) => object.zIndex), 0) - 1,
			createdAt: now,
			updatedAt: now,
			title,
			color: '#fffaf0',
			borderColor: '#cfc2ab'
		};
		const selected = this.selectedSet;
		const grouped = this.document.objects.map((object) =>
			selected.has(object.id) && !object.locked
				? { ...object, groupId: tile.id, updatedAt: now }
				: object
		);
		this.document = this.#withObjects([...grouped, tile]);
		this.selectedIds = [
			tile.id,
			...grouped.filter((object) => object.groupId === tile.id).map((object) => object.id)
		];
		this.activeTileId = tile.id;
		this.#notify('insert');
	}

	deleteSelection() {
		if (this.selectedIds.length === 0) return;
		if (this.selectedObjects.some((object) => object.locked)) return;
		const selected = this.selectedSet;
		const removable = this.document.objects.filter((object) => selected.has(object.id));
		if (removable.length === 0) return;
		this.checkpoint();
		this.document = this.#withObjects(
			this.document.objects.filter((object) => !selected.has(object.id))
		);
		this.selectedIds = [];
		if (this.activeTileId && selected.has(this.activeTileId)) this.activeTileId = null;
		this.#notify('delete');
	}

	deleteObject(id: string) {
		const object = this.document.objects.find((candidate) => candidate.id === id);
		if (!object || object.locked) return;
		if (object.type === 'tile') {
			const members = this.document.objects.filter(
				(candidate) => candidate.id === object.id || candidate.groupId === object.id
			);
			if (members.some((candidate) => candidate.locked)) return;
			this.checkpoint();
			const memberIds = new SvelteSet(members.map((candidate) => candidate.id));
			this.document = this.#withObjects(
				this.document.objects.filter((candidate) => !memberIds.has(candidate.id))
			);
			this.selectedIds = this.selectedIds.filter((selectedId) => !memberIds.has(selectedId));
			if (id === this.activeTileId) this.activeTileId = null;
			this.#notify('delete');
			return;
		}
		this.checkpoint();
		this.document = this.#withObjects(
			this.document.objects.filter((candidate) => candidate.id !== id)
		);
		this.selectedIds = this.selectedIds.filter((selectedId) => selectedId !== id);
		if (id === this.activeTileId) this.activeTileId = null;
		this.#notify('delete');
	}

	beginTransform() {
		if (this.#transformBase || this.selectedIds.length === 0) return;
		const expandedIds = this.editTileContents
			? [...this.selectedIds]
			: this.#expandSelectionIds(this.selectedIds);
		const expandedSet = new SvelteSet(expandedIds);
		const expandedObjects = this.document.objects.filter((object) => expandedSet.has(object.id));
		if (expandedObjects.some((object) => object.locked)) return;
		if (this.editTileContents) {
			const lockedTileIds = new SvelteSet(
				this.document.objects
					.filter((object) => object.type === 'tile' && object.locked)
					.map((object) => object.id)
			);
			if (expandedObjects.some((object) => object.groupId && lockedTileIds.has(object.groupId))) {
				return;
			}
		}
		this.selectedIds = expandedIds;
		this.#syncActiveTileFromSelection();
		this.#transformBase = cloneDocument(this.document);
		this.#transformChanged = false;
	}

	moveSelection(deltaX: number, deltaY: number) {
		if (!this.#transformBase) return;
		const selected = this.selectedSet;
		const now = new SvelteDate().toISOString();
		const grid = this.document.gridSize;
		let adjustedDeltaX = deltaX;
		let adjustedDeltaY = deltaY;
		this.alignmentGuides = {};
		const selectedBounds = this.#transformBase.objects
			.filter((object) => selected.has(object.id) && !object.locked)
			.map(objectBounds);
		if (this.document.snapToGrid && selectedBounds.length > 0) {
			const anchorX = Math.min(...selectedBounds.map((bounds) => bounds.minX));
			const anchorY = Math.min(...selectedBounds.map((bounds) => bounds.minY));
			adjustedDeltaX += snap(anchorX + adjustedDeltaX, grid) - (anchorX + adjustedDeltaX);
			adjustedDeltaY += snap(anchorY + adjustedDeltaY, grid) - (anchorY + adjustedDeltaY);
		}
		if (this.document.showGuides && !this.document.snapToGrid) {
			const otherBounds = this.#transformBase.objects
				.filter((object) => !selected.has(object.id) && !object.hidden)
				.map(objectBounds);
			if (selectedBounds.length > 0 && otherBounds.length > 0) {
				const selection = {
					minX: Math.min(...selectedBounds.map((bounds) => bounds.minX)),
					minY: Math.min(...selectedBounds.map((bounds) => bounds.minY)),
					maxX: Math.max(...selectedBounds.map((bounds) => bounds.maxX)),
					maxY: Math.max(...selectedBounds.map((bounds) => bounds.maxY))
				};
				const selectedX = [
					selection.minX + deltaX,
					(selection.minX + selection.maxX) / 2 + deltaX,
					selection.maxX + deltaX
				];
				const selectedY = [
					selection.minY + deltaY,
					(selection.minY + selection.maxY) / 2 + deltaY,
					selection.maxY + deltaY
				];
				const targetX = otherBounds.flatMap((bounds) => [
					bounds.minX,
					(bounds.minX + bounds.maxX) / 2,
					bounds.maxX
				]);
				const targetY = otherBounds.flatMap((bounds) => [
					bounds.minY,
					(bounds.minY + bounds.maxY) / 2,
					bounds.maxY
				]);
				const tolerance = 7 / this.viewport.zoom;
				const xMatch = targetX
					.flatMap((target) => selectedX.map((value) => ({ target, offset: target - value })))
					.filter((match) => Math.abs(match.offset) <= tolerance)
					.sort((left, right) => Math.abs(left.offset) - Math.abs(right.offset))[0];
				const yMatch = targetY
					.flatMap((target) => selectedY.map((value) => ({ target, offset: target - value })))
					.filter((match) => Math.abs(match.offset) <= tolerance)
					.sort((left, right) => Math.abs(left.offset) - Math.abs(right.offset))[0];
				if (xMatch) {
					adjustedDeltaX += xMatch.offset;
					this.alignmentGuides.x = xMatch.target;
				}
				if (yMatch) {
					adjustedDeltaY += yMatch.offset;
					this.alignmentGuides.y = yMatch.target;
				}
			}
		}
		this.document = this.#withObjects(
			this.#transformBase.objects.map((object) => {
				if (!selected.has(object.id) || object.locked) return object;
				const x = object.x + adjustedDeltaX;
				const y = object.y + adjustedDeltaY;
				return {
					...object,
					x,
					y,
					updatedAt: now
				};
			})
		);
		this.#transformChanged =
			Math.abs(adjustedDeltaX) > Number.EPSILON || Math.abs(adjustedDeltaY) > Number.EPSILON;
	}

	finishTransform() {
		if (!this.#transformBase) return;
		const base = this.#transformBase;
		const changed = this.#transformChanged;
		this.#transformBase = null;
		this.#transformChanged = false;
		this.alignmentGuides = {};
		if (!changed) {
			this.document = base;
			return;
		}
		this.#history.checkpoint(base);
		this.#syncHistoryFlags();
		this.#notify('transform');
	}

	cancelTransform() {
		if (!this.#transformBase) return;
		this.document = this.#transformBase;
		this.#transformBase = null;
		this.#transformChanged = false;
		this.alignmentGuides = {};
	}

	updateSelectionTransform(
		values: Partial<Pick<CanvasObject, 'width' | 'height' | 'rotation' | 'opacity'>>
	) {
		if (this.selectedIds.length === 0) return;
		if (this.selectedObjects.some((object) => object.locked)) return;
		this.checkpoint();
		const selected = this.selectedSet;
		const now = new SvelteDate().toISOString();
		this.document = this.#withObjects(
			this.document.objects.map((object) =>
				selected.has(object.id) && !object.locked
					? {
							...object,
							...values,
							width: Math.min(32_768, Math.max(1, values.width ?? object.width)),
							height: Math.min(32_768, Math.max(1, values.height ?? object.height)),
							rotation: Math.max(-360_000, Math.min(360_000, values.rotation ?? object.rotation)),
							opacity: Math.max(0.05, Math.min(1, values.opacity ?? object.opacity)),
							updatedAt: now
						}
					: object
			)
		);
		this.#notify('transform');
	}

	setBrush(tool: DrawingTool, values: Partial<BrushStyle>) {
		this.brushes[tool] = { ...this.brushes[tool], ...values };
	}

	setPaper(background: PaperStyle) {
		this.checkpoint();
		this.document = { ...this.document, background, updatedAt: new SvelteDate().toISOString() };
		this.#notify('settings');
	}

	setCanvasSettings(
		values: Partial<
			Pick<NoteDocument, 'snapToGrid' | 'showGuides' | 'gridSize' | 'backgroundColor'>
		>
	) {
		this.checkpoint();
		this.document = { ...this.document, ...values, updatedAt: new SvelteDate().toISOString() };
		this.#notify('settings');
	}

	setTranscript(transcript: string) {
		this.document = { ...this.document, transcript, updatedAt: new SvelteDate().toISOString() };
		this.#notify('settings');
	}

	async copySelection(cut = false) {
		const selected = this.selectedObjects;
		if (selected.length === 0 || selected.some((object) => object.locked)) return;
		this.#clipboard = cloneSceneValue(selected);
		try {
			await navigator.clipboard.writeText(
				JSON.stringify({ format: 'suvroghosh-ink-clipboard', objects: selected })
			);
		} catch {
			// The internal clipboard remains available when Clipboard API permission is denied.
		}
		if (cut) this.deleteSelection();
	}

	async paste(canApply: () => boolean = () => true) {
		let objects = cloneSceneValue(this.#clipboard);
		try {
			const clipboardText = await navigator.clipboard.readText();
			const parsed = JSON.parse(clipboardText) as { format?: string; objects?: unknown };
			if (parsed.format === 'suvroghosh-ink-clipboard' && Array.isArray(parsed.objects)) {
				const validated = canvasObjectSchema.array().max(1_000).safeParse(parsed.objects);
				if (validated.success) objects = validated.data;
			}
		} catch {
			// Use the internal clipboard fallback.
		}
		if (!canApply()) return;
		this.#pasteObjects(objects);
	}

	duplicateSelection() {
		this.#pasteObjects(this.selectedObjects);
	}

	#pasteObjects(source: CanvasObject[]) {
		const objects = cloneSceneValue(source);
		if (objects.length === 0) return;
		this.checkpoint();
		const now = new SvelteDate().toISOString();
		const offset = 24;
		const idMap = new SvelteMap(objects.map((object) => [object.id, createId(object.type)]));
		const groupMap = new SvelteMap<string, string>();
		const copiedMemberCounts = new SvelteMap<string, number>();
		for (const object of objects) {
			if (object.groupId) {
				copiedMemberCounts.set(object.groupId, (copiedMemberCounts.get(object.groupId) ?? 0) + 1);
			}
		}
		for (const object of objects) {
			if (!object.groupId || groupMap.has(object.groupId)) continue;
			const existingTile = this.document.objects.some(
				(candidate) => candidate.type === 'tile' && candidate.id === object.groupId
			);
			const copiedGroupAnchor = idMap.get(object.groupId);
			const copiedMemberCount = copiedMemberCounts.get(object.groupId) ?? 0;
			if (!copiedGroupAnchor && !existingTile && copiedMemberCount < 2) continue;
			groupMap.set(
				object.groupId,
				copiedGroupAnchor ?? (existingTile ? object.groupId : createId('group'))
			);
		}
		const baseZIndex = this.#nextZIndex();
		const added = objects.map((object, index) => ({
			...cloneSceneValue(object),
			id: idMap.get(object.id)!,
			x: object.x + offset,
			y: object.y + offset,
			zIndex: baseZIndex + index,
			groupId: object.groupId ? groupMap.get(object.groupId) : undefined,
			createdAt: now,
			updatedAt: now
		}));
		this.document = this.#withObjects([...this.document.objects, ...added]);
		this.selectedIds = added.map((object) => object.id);
		this.#syncActiveTileFromSelection();
		this.#notify('insert');
	}

	setSelectedImageAlt(alt: string) {
		const selectedImages = this.selectedObjects.filter(
			(object): object is ImageObject => object.type === 'image'
		);
		if (selectedImages.length !== 1 || selectedImages[0].locked) return;
		const selectedId = selectedImages[0].id;
		this.checkpoint();
		const now = new SvelteDate().toISOString();
		this.document = this.#withObjects(
			this.document.objects.map((object) =>
				object.id === selectedId && object.type === 'image'
					? { ...object, alt: alt.trim().slice(0, 2_000), updatedAt: now }
					: object
			)
		);
		this.#notify('style');
	}

	groupSelection() {
		if (this.selectedIds.length < 2) return;
		if (this.selectedObjects.some((object) => object.locked || object.type === 'tile')) return;
		this.checkpoint();
		const selected = this.selectedSet;
		const groupId = createId('group');
		const now = new SvelteDate().toISOString();
		this.document = this.#withObjects(
			this.document.objects.map((object) =>
				selected.has(object.id) && !object.locked ? { ...object, groupId, updatedAt: now } : object
			)
		);
		this.#notify('style');
	}

	ungroupSelection() {
		if (this.selectedIds.length === 0) return;
		if (this.selectedObjects.some((object) => object.locked)) return;
		this.checkpoint();
		const selected = this.selectedSet;
		const selectedTileIds = new SvelteSet(
			this.selectedObjects.filter((object) => object.type === 'tile').map((object) => object.id)
		);
		const now = new SvelteDate().toISOString();
		this.document = this.#withObjects(
			this.document.objects
				.filter((object) => !selectedTileIds.has(object.id))
				.map((object) =>
					selected.has(object.id) ? { ...object, groupId: undefined, updatedAt: now } : object
				)
		);
		this.selectedIds = this.selectedIds.filter((id) => !selectedTileIds.has(id));
		this.activeTileId = null;
		this.#notify('style');
	}

	leaveActiveTile() {
		this.activeTileId = null;
	}

	toggleLockSelection() {
		if (this.selectedIds.length === 0) return;
		this.checkpoint();
		const selected = this.selectedSet;
		const shouldLock = this.selectedObjects.some((object) => !object.locked);
		const now = new SvelteDate().toISOString();
		this.document = this.#withObjects(
			this.document.objects.map((object) =>
				selected.has(object.id) ? { ...object, locked: shouldLock, updatedAt: now } : object
			)
		);
		if (shouldLock) this.activeTileId = null;
		this.#notify('style');
	}

	reorderSelection(direction: 'front' | 'forward' | 'backward' | 'back') {
		if (this.selectedIds.length === 0) return;
		if (this.selectedObjects.some((object) => object.locked)) return;
		this.checkpoint();
		const selected = this.selectedSet;
		let ordered = [...this.document.objects].sort((left, right) => left.zIndex - right.zIndex);
		if (direction === 'front') {
			ordered = [
				...ordered.filter((object) => !selected.has(object.id)),
				...ordered.filter((object) => selected.has(object.id))
			];
		} else if (direction === 'back') {
			ordered = [
				...ordered.filter((object) => selected.has(object.id)),
				...ordered.filter((object) => !selected.has(object.id))
			];
		} else if (direction === 'forward') {
			for (let index = ordered.length - 2; index >= 0; index -= 1) {
				if (selected.has(ordered[index].id) && !selected.has(ordered[index + 1].id)) {
					[ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]];
				}
			}
		} else {
			for (let index = 1; index < ordered.length; index += 1) {
				if (selected.has(ordered[index].id) && !selected.has(ordered[index - 1].id)) {
					[ordered[index], ordered[index - 1]] = [ordered[index - 1], ordered[index]];
				}
			}
		}
		const now = new SvelteDate().toISOString();
		this.document = this.#withObjects(
			ordered.map((object, zIndex) => ({
				...object,
				zIndex,
				updatedAt: selected.has(object.id) ? now : object.updatedAt
			}))
		);
		this.#notify('style');
	}

	fitToContent(width: number, height: number, padding = 64) {
		const bounds = documentBounds(this.document, 0);
		const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
		const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
		const zoom = Math.min(
			4,
			Math.max(
				0.1,
				Math.min((width - padding * 2) / contentWidth, (height - padding * 2) / contentHeight)
			)
		);
		this.viewport = {
			zoom,
			x: (width - contentWidth * zoom) / 2 - bounds.minX * zoom,
			y: (height - contentHeight * zoom) / 2 - bounds.minY * zoom
		};
	}

	selectionBounds() {
		const selected = this.selectedObjects.map(objectBounds);
		if (selected.length === 0) return null;
		return {
			minX: Math.min(...selected.map((bounds) => bounds.minX)),
			minY: Math.min(...selected.map((bounds) => bounds.minY)),
			maxX: Math.max(...selected.map((bounds) => bounds.maxX)),
			maxY: Math.max(...selected.map((bounds) => bounds.maxY))
		};
	}

	#nextZIndex() {
		return (
			this.document.objects.reduce((highest, object) => Math.max(highest, object.zIndex), 0) + 1
		);
	}

	#expandSelectionIds(ids: string[]) {
		const requested = new SvelteSet(ids);
		const groupIds = new SvelteSet<string>();
		for (const object of this.document.objects) {
			if (!requested.has(object.id)) continue;
			if (object.type === 'tile') groupIds.add(object.id);
			else if (object.groupId) groupIds.add(object.groupId);
		}
		for (const object of this.document.objects) {
			if (
				groupIds.has(object.id) ||
				(object.groupId !== undefined && groupIds.has(object.groupId))
			) {
				requested.add(object.id);
			}
		}
		return [...requested];
	}

	#expandExplicitTileIds(ids: string[]) {
		const requested = new SvelteSet(ids);
		const tileIds = new SvelteSet(
			this.document.objects
				.filter((object) => object.type === 'tile' && requested.has(object.id))
				.map((object) => object.id)
		);
		for (const object of this.document.objects) {
			if (object.groupId && tileIds.has(object.groupId)) requested.add(object.id);
		}
		return [...requested];
	}

	#syncActiveTileFromSelection() {
		const selected = this.selectedSet;
		const tileIds = new SvelteSet<string>();
		const unlockedTileIds = new SvelteSet(
			this.document.objects
				.filter((object) => object.type === 'tile' && !object.locked)
				.map((object) => object.id)
		);
		for (const object of this.document.objects) {
			if (!selected.has(object.id)) continue;
			if (object.type === 'tile' && !object.locked) tileIds.add(object.id);
			else if (object.groupId && unlockedTileIds.has(object.groupId)) {
				tileIds.add(object.groupId);
			}
		}
		this.activeTileId = tileIds.size === 1 ? [...tileIds][0] : null;
	}

	#withObjects(objects: CanvasObject[]): NoteDocument {
		return {
			...this.document,
			objects,
			viewport: { ...this.viewport },
			updatedAt: new SvelteDate().toISOString()
		};
	}

	#notify(reason: ChangeReason) {
		this.#listener?.(cloneDocument(this.document), reason);
	}

	#syncHistoryFlags() {
		this.canUndo = this.#history.canUndo;
		this.canRedo = this.#history.canRedo;
	}
}
