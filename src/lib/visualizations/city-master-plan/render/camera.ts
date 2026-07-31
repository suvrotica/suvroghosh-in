import type { CellCoordinate, CityResult } from '../engine/types';
import { CITY_TILE_SIZE, type CityCamera } from './types';

export const CITY_CAMERA_MIN_ZOOM = 0.12;
export const CITY_CAMERA_MAX_ZOOM = 5;

export function clampNumber(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

export function fitCityCamera(
	city: Pick<CityResult, 'width' | 'height'>,
	viewportWidth: number,
	viewportHeight: number,
	padding = 28
): CityCamera {
	const worldWidth = Math.max(1, city.width * CITY_TILE_SIZE);
	const worldHeight = Math.max(1, city.height * CITY_TILE_SIZE);
	const availableWidth = Math.max(1, viewportWidth - padding * 2);
	const availableHeight = Math.max(1, viewportHeight - padding * 2);
	const zoom = clampNumber(
		Math.min(availableWidth / worldWidth, availableHeight / worldHeight),
		CITY_CAMERA_MIN_ZOOM,
		CITY_CAMERA_MAX_ZOOM
	);
	return {
		x: worldWidth / 2,
		y: worldHeight / 2,
		zoom
	};
}

export function resetCityCamera(city: Pick<CityResult, 'width' | 'height'>): CityCamera {
	return {
		x: (city.width * CITY_TILE_SIZE) / 2,
		y: (city.height * CITY_TILE_SIZE) / 2,
		zoom: 1
	};
}

export function clampCityCamera(
	camera: CityCamera,
	city: Pick<CityResult, 'width' | 'height'>,
	viewportWidth: number,
	viewportHeight: number
): CityCamera {
	const zoom = clampNumber(camera.zoom, CITY_CAMERA_MIN_ZOOM, CITY_CAMERA_MAX_ZOOM);
	const worldWidth = city.width * CITY_TILE_SIZE;
	const worldHeight = city.height * CITY_TILE_SIZE;
	const halfWidth = viewportWidth / (2 * zoom);
	const halfHeight = viewportHeight / (2 * zoom);
	const margin = CITY_TILE_SIZE * 0.75;

	const horizontalFits = worldWidth <= halfWidth * 2 - margin;
	const verticalFits = worldHeight <= halfHeight * 2 - margin;
	const minimumX = halfWidth - margin;
	const maximumX = worldWidth - halfWidth + margin;
	const minimumY = halfHeight - margin;
	const maximumY = worldHeight - halfHeight + margin;

	return {
		x: horizontalFits
			? worldWidth / 2
			: clampNumber(camera.x, Math.min(minimumX, maximumX), Math.max(minimumX, maximumX)),
		y: verticalFits
			? worldHeight / 2
			: clampNumber(camera.y, Math.min(minimumY, maximumY), Math.max(minimumY, maximumY)),
		zoom
	};
}

export function screenToWorld(
	screenX: number,
	screenY: number,
	camera: CityCamera,
	viewportWidth: number,
	viewportHeight: number
): CellCoordinate {
	return {
		x: camera.x + (screenX - viewportWidth / 2) / camera.zoom,
		y: camera.y + (screenY - viewportHeight / 2) / camera.zoom
	};
}

export function worldToScreen(
	worldX: number,
	worldY: number,
	camera: CityCamera,
	viewportWidth: number,
	viewportHeight: number
): CellCoordinate {
	return {
		x: viewportWidth / 2 + (worldX - camera.x) * camera.zoom,
		y: viewportHeight / 2 + (worldY - camera.y) * camera.zoom
	};
}

export function screenToCityCell(
	screenX: number,
	screenY: number,
	camera: CityCamera,
	viewportWidth: number,
	viewportHeight: number,
	cityWidth: number,
	cityHeight: number
): CellCoordinate | null {
	const world = screenToWorld(screenX, screenY, camera, viewportWidth, viewportHeight);
	const x = Math.floor(world.x / CITY_TILE_SIZE);
	const y = Math.floor(world.y / CITY_TILE_SIZE);
	if (x < 0 || y < 0 || x >= cityWidth || y >= cityHeight) return null;
	return { x, y };
}
