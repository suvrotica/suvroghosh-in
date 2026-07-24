import type { SketchArtwork } from '$lib/sketches/types';

export type Vector3Tuple = readonly [number, number, number];
export type MuseumWall = 'north' | 'east' | 'south' | 'west';
export type MuseumQuality = 'high' | 'medium' | 'low';

export interface FrameDimensions {
	artWidth: number;
	artHeight: number;
	outerWidth: number;
	outerHeight: number;
	railWidth: number;
}

export interface RoomConnection {
	wall: MuseumWall;
	toRoomId: string;
}

export interface MuseumRoomLayout {
	id: string;
	name: string;
	index: number;
	center: readonly [number, number];
	width: number;
	depth: number;
	height: number;
	connections: RoomConnection[];
	artworkSlugs: string[];
}

export interface ArtworkPlacement {
	artwork: SketchArtwork;
	roomId: string;
	wall: MuseumWall;
	position: Vector3Tuple;
	rotationY: number;
	viewPosition: Vector3Tuple;
	frame: FrameDimensions;
}

export interface MuseumLayout {
	rooms: MuseumRoomLayout[];
	placements: ArtworkPlacement[];
	startPosition: Vector3Tuple;
}
