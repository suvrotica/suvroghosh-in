import { courtyard } from './scene-courtyard';
import {
	Composition,
	randomStream,
	WORLD_HEIGHT,
	WORLD_WIDTH,
	type Scene,
	type SceneFamily
} from './scene-geometry';
import { landing, pond } from './scene-landscapes';
import { street } from './scene-street';

export { SCENE_FAMILIES, WORLD_HEIGHT, WORLD_WIDTH } from './scene-geometry';
export type { Colour, Material, Point, Scene, SceneFamily, SceneShape } from './scene-geometry';

export const DEFAULT_SEED = 'calcutta-27';

const makeComposition = { street, landing, courtyard, pond };

export function generateScene(family: SceneFamily, seed: string): Scene {
	const key = `${family}/${seed}`;
	const canvas = new Composition(key);
	const composition = randomStream(`${key}/composition`);
	const placement = randomStream(`${key}/placement`);
	const { horizon, vanishing, focal, weather, description } = makeComposition[family](
		canvas,
		composition,
		placement,
		family === 'street' && seed === DEFAULT_SEED
	);
	return {
		family,
		seed,
		width: WORLD_WIDTH,
		height: WORLD_HEIGHT,
		horizon,
		vanishing,
		focal,
		description,
		light: { x: family === 'courtyard' ? 0.7 : -0.76, y: -0.58, weather },
		shapes: canvas.shapes,
		figures: canvas.figures
	};
}
