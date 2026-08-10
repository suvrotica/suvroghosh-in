import * as THREE from 'three';
import {
	DISTRICT_CHUNK_LENGTH_M,
	generateDistrictChunk,
	type DistrictChunkBlueprint,
	type WorldQualityTier
} from './AssetGrammar';
import { collisionShapesForChunk, type WorldCollisionShape } from './CollisionGrammar';
import type { DistrictRoute } from './DistrictGraph';

export interface ChunkVisualFactory {
	populate(target: THREE.Group, blueprint: DistrictChunkBlueprint): void;
	clear(target: THREE.Group): void;
	setQuality?(quality: WorldQualityTier): void;
	dispose(): void;
}

export interface ActiveDistrictChunk {
	readonly index: number;
	readonly blueprint: DistrictChunkBlueprint;
	readonly object: THREE.Group;
	/** Physics-space colliders, including the chunk's global Z offset. */
	readonly colliders: readonly WorldCollisionShape[];
}

export interface ChunkManagerOptions {
	readonly route: DistrictRoute;
	readonly parent: THREE.Group;
	readonly visualFactory: ChunkVisualFactory;
	readonly quality?: WorldQualityTier;
	/** Use zero for a curated opening; omit for unbounded free flight. */
	readonly minimumChunkIndex?: number;
	readonly onActivate?: (chunk: ActiveDistrictChunk) => void;
	readonly onDeactivate?: (chunk: ActiveDistrictChunk) => void;
}

const STREAM_RADIUS: Readonly<
	Record<
		WorldQualityTier,
		{ readonly behind: number; readonly ahead: number; readonly pool: number }
	>
> = {
	high: { behind: 2, ahead: 4, pool: 8 },
	balanced: { behind: 1, ahead: 3, pool: 6 },
	battery: { behind: 0, ahead: 1, pool: 3 }
};

function offsetPoint(
	point: { readonly x: number; readonly y: number; readonly z: number },
	zOffset: number
): { x: number; y: number; z: number } {
	return { x: point.x, y: point.y, z: point.z + zOffset };
}

function offsetCollider(collider: WorldCollisionShape, zOffset: number): WorldCollisionShape {
	switch (collider.shape) {
		case 'aabb':
			return {
				...collider,
				min: offsetPoint(collider.min, zOffset),
				max: offsetPoint(collider.max, zOffset)
			};
		case 'capsule':
			return {
				...collider,
				start: offsetPoint(collider.start, zOffset),
				end: offsetPoint(collider.end, zOffset)
			};
		case 'sphere':
			return { ...collider, center: offsetPoint(collider.center, zOffset) };
	}
}

/**
 * Deterministic, pooled visual streaming. The manager never owns renderer state
 * and only rebuilds when the player crosses a chunk boundary or quality changes.
 */
export class DistrictChunkManager {
	private route: DistrictRoute;
	private readonly parent: THREE.Group;
	private readonly visualFactory: ChunkVisualFactory;
	private readonly onActivate?: (chunk: ActiveDistrictChunk) => void;
	private readonly onDeactivate?: (chunk: ActiveDistrictChunk) => void;
	private readonly minimumChunkIndex: number | null;
	private readonly active = new Map<number, ActiveDistrictChunk>();
	private readonly pool: THREE.Group[] = [];
	private quality: WorldQualityTier;
	private centreIndex = Number.NaN;
	private visualOriginX = 0;
	private visualOriginZ = 0;
	private disposed = false;

	constructor(options: ChunkManagerOptions) {
		this.route = options.route;
		this.parent = options.parent;
		this.visualFactory = options.visualFactory;
		this.quality = options.quality ?? 'balanced';
		this.minimumChunkIndex =
			options.minimumChunkIndex !== undefined && Number.isFinite(options.minimumChunkIndex)
				? Math.floor(options.minimumChunkIndex)
				: null;
		this.onActivate = options.onActivate;
		this.onDeactivate = options.onDeactivate;
	}

	get activeChunkCount(): number {
		return this.active.size;
	}

	get currentChunkIndex(): number {
		return Number.isFinite(this.centreIndex) ? this.centreIndex : 0;
	}

	get currentQuality(): WorldQualityTier {
		return this.quality;
	}

	/** Read-only diagnostics; avoid calling in a hot loop. */
	getActiveChunks(): readonly ActiveDistrictChunk[] {
		return [...this.active.values()].sort((left, right) => left.index - right.index);
	}

	setVisualOrigin(x: number, z: number): void {
		if (this.disposed) return;
		const safeX = Number.isFinite(x) ? x : 0;
		const safeZ = Number.isFinite(z) ? z : 0;
		if (safeX === this.visualOriginX && safeZ === this.visualOriginZ) return;
		this.visualOriginX = safeX;
		this.visualOriginZ = safeZ;
		for (const chunk of this.active.values()) this.positionChunk(chunk);
	}

	update(globalPosition: number | { readonly z: number }): void {
		if (this.disposed) return;
		const inputZ = typeof globalPosition === 'number' ? globalPosition : globalPosition.z;
		const z = Number.isFinite(inputZ) ? inputZ : 0;
		const nextCentre = Math.floor((z + DISTRICT_CHUNK_LENGTH_M * 0.5) / DISTRICT_CHUNK_LENGTH_M);
		if (nextCentre === this.centreIndex) return;
		this.centreIndex = nextCentre;
		this.reconcile();
	}

	setQuality(quality: WorldQualityTier): void {
		if (this.disposed || quality === this.quality) return;
		this.quality = quality;
		this.visualFactory.setQuality?.(quality);
		const centre = this.centreIndex;
		this.releaseAll();
		this.centreIndex = centre;
		if (Number.isFinite(centre)) this.reconcile();
	}

	replaceRoute(route: DistrictRoute): void {
		if (this.disposed || route.signature === this.route.signature) return;
		const centre = this.centreIndex;
		this.releaseAll();
		this.route = route;
		this.centreIndex = centre;
		if (Number.isFinite(centre)) this.reconcile();
	}

	forEachActive(visitor: (chunk: ActiveDistrictChunk) => void): void {
		for (const chunk of this.active.values()) visitor(chunk);
	}

	private reconcile(): void {
		const radius = STREAM_RADIUS[this.quality];
		const first =
			this.minimumChunkIndex === null
				? this.centreIndex - radius.behind
				: Math.max(this.minimumChunkIndex, this.centreIndex - radius.behind);
		const last = this.centreIndex + radius.ahead;
		for (const [index, chunk] of this.active) {
			if (index < first || index > last) this.release(chunk);
		}
		for (let index = first; index <= last; index += 1) {
			if (!this.active.has(index)) this.activate(index);
		}
	}

	private activate(index: number): void {
		const object = this.pool.pop() ?? new THREE.Group();
		object.visible = true;
		object.name = `kd-chunk-${index}`;
		const blueprint = generateDistrictChunk(this.route, index, { quality: this.quality });
		this.visualFactory.populate(object, blueprint);
		const zOffset = index * DISTRICT_CHUNK_LENGTH_M;
		const colliders = collisionShapesForChunk(blueprint).map((collider) =>
			offsetCollider(collider, zOffset)
		);
		const chunk: ActiveDistrictChunk = { index, blueprint, object, colliders };
		this.active.set(index, chunk);
		this.positionChunk(chunk);
		this.parent.add(object);
		this.onActivate?.(chunk);
	}

	private positionChunk(chunk: ActiveDistrictChunk): void {
		chunk.object.position.set(
			-this.visualOriginX,
			0,
			chunk.index * DISTRICT_CHUNK_LENGTH_M - this.visualOriginZ
		);
	}

	private release(chunk: ActiveDistrictChunk): void {
		this.onDeactivate?.(chunk);
		this.active.delete(chunk.index);
		this.parent.remove(chunk.object);
		this.visualFactory.clear(chunk.object);
		chunk.object.visible = false;
		const poolLimit = STREAM_RADIUS[this.quality].pool;
		if (this.pool.length < poolLimit) this.pool.push(chunk.object);
	}

	private releaseAll(): void {
		for (const chunk of [...this.active.values()]) this.release(chunk);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.releaseAll();
		this.pool.length = 0;
		this.visualFactory.dispose();
	}
}
