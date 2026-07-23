import type { CanvasObject } from './model';
import { intersects, objectBounds, type Bounds } from './geometry';

/**
 * A dynamic uniform-grid index. Infinite canvases tend to contain locally clustered,
 * similarly-sized marks, which makes this simpler and cheaper to update than an R-tree.
 */
export class SpatialIndex {
	readonly cellSize: number;
	#cells = new Map<string, Set<string>>();
	#objects = new Map<string, CanvasObject>();
	#memberships = new Map<string, string[]>();
	#largeObjects = new Map<string, CanvasObject>();

	constructor(cellSize = 512) {
		this.cellSize = cellSize;
	}

	rebuild(objects: readonly CanvasObject[]) {
		this.clear();
		for (const object of objects) this.insert(object);
	}

	clear() {
		this.#cells.clear();
		this.#objects.clear();
		this.#memberships.clear();
		this.#largeObjects.clear();
	}

	insert(object: CanvasObject) {
		this.remove(object.id);
		this.#objects.set(object.id, object);
		const keys = this.#keysForBounds(objectBounds(object));
		if (keys.length > 256) {
			this.#largeObjects.set(object.id, object);
			this.#memberships.set(object.id, []);
			return;
		}
		this.#memberships.set(object.id, keys);
		for (const key of keys) {
			const cell = this.#cells.get(key) ?? new Set<string>();
			cell.add(object.id);
			this.#cells.set(key, cell);
		}
	}

	remove(id: string) {
		for (const key of this.#memberships.get(id) ?? []) {
			const cell = this.#cells.get(key);
			cell?.delete(id);
			if (cell?.size === 0) this.#cells.delete(key);
		}
		this.#memberships.delete(id);
		this.#objects.delete(id);
		this.#largeObjects.delete(id);
	}

	search(bounds: Bounds): CanvasObject[] {
		const ids = new Set<string>();
		for (const key of this.#keysForBounds(bounds)) {
			for (const id of this.#cells.get(key) ?? []) ids.add(id);
		}
		for (const [id, object] of this.#largeObjects) {
			if (!object.hidden && intersects(objectBounds(object), bounds)) ids.add(id);
		}
		return [...ids]
			.map((id) => this.#objects.get(id))
			.filter((object): object is CanvasObject =>
				Boolean(object && !object.hidden && intersects(objectBounds(object), bounds))
			);
	}

	#keysForBounds(bounds: Bounds) {
		const startX = Math.floor(bounds.minX / this.cellSize);
		const endX = Math.floor(bounds.maxX / this.cellSize);
		const startY = Math.floor(bounds.minY / this.cellSize);
		const endY = Math.floor(bounds.maxY / this.cellSize);
		const keys: string[] = [];
		for (let x = startX; x <= endX; x += 1) {
			for (let y = startY; y <= endY; y += 1) keys.push(`${x}:${y}`);
		}
		return keys;
	}
}
