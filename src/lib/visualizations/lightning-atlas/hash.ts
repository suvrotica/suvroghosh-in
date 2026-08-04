import type { LightningFlash, TerrainData } from './types';

function mix(hash: number, value: number): number {
	hash ^= value | 0;
	hash = Math.imul(hash, 0x01000193);
	return hash >>> 0;
}

export function hashFloatArray(values: ArrayLike<number>, precision = 1000): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < values.length; index += 1) {
		hash = mix(hash, Math.round(values[index] * precision));
	}
	return hash.toString(16).padStart(8, '0');
}

export function terrainHash(terrain: TerrainData): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < terrain.heights.length; index += 1) {
		hash = mix(hash, Math.round(terrain.heights[index] * 10));
		hash = mix(hash, terrain.waterMask[index]);
	}
	return hash.toString(16).padStart(8, '0');
}

export function flashHash(flash: Pick<LightningFlash, 'segments' | 'attachment' | 'type'>): string {
	let hash = 0x811c9dc5;
	for (const character of flash.type) hash = mix(hash, character.charCodeAt(0));
	for (const segment of flash.segments) {
		for (const value of [
			segment.start.x,
			segment.start.y,
			segment.start.z,
			segment.end.x,
			segment.end.y,
			segment.end.z
		]) {
			hash = mix(hash, Math.round(value * 10));
		}
		hash = mix(hash, segment.parentIndex);
		hash = mix(hash, segment.branchDepth);
		for (const character of segment.channelClass) hash = mix(hash, character.charCodeAt(0));
		hash = mix(hash, segment.hierarchyDepth);
		hash = mix(hash, Math.round(segment.relativeThickness * 1_000));
		hash = mix(hash, Math.round(segment.relativeBrightness * 1_000));
		hash = mix(hash, Math.round(segment.persistence * 1_000));
	}
	if (flash.attachment) {
		for (const character of flash.attachment.candidateId) hash = mix(hash, character.charCodeAt(0));
	}
	return hash.toString(16).padStart(8, '0');
}
