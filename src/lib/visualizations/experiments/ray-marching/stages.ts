import fragmentTemplate from './fragment.frag?raw';
import { extractShaderExcerpt } from './source-markers';
import type { RayMarchingStageDefinition, RayMarchingStageId } from './types';

export type RayMarchingStage = RayMarchingStageDefinition & {
	slug: string;
	stage: RayMarchingStageId;
	label: string;
	shortExplanation: string;
	callout: string;
	sourceMarker: string;
	filename: 'fragment.frag';
	language: 'glsl';
	code: string;
};

function stage(
	definition: Omit<
		RayMarchingStage,
		| 'id'
		| 'label'
		| 'summary'
		| 'sourceFilename'
		| 'sourceExcerpt'
		| 'filename'
		| 'language'
		| 'code'
	>
): RayMarchingStage {
	const sourceExcerpt = extractShaderExcerpt(fragmentTemplate, definition.sourceMarker);
	return {
		...definition,
		id: definition.stage,
		label: String(definition.stage).padStart(2, '0'),
		summary: definition.shortExplanation,
		sourceFilename: 'fragment.frag',
		sourceExcerpt,
		filename: 'fragment.frag',
		language: 'glsl',
		code: sourceExcerpt
	};
}

export const rayMarchingStages = [
	stage({
		slug: 'camera-rays',
		stage: 1,
		title: 'Camera rays',
		shortExplanation:
			'Turn each aspect-correct screen coordinate into a direction from one camera.',
		explanation:
			'The camera has an origin and an orthonormal forward, right, and up basis. Focal length weights the forward vector before the screen coordinate is added, so every fragment receives a different direction without moving the underlying rectangle.',
		callout:
			'The RGB view encodes ray direction: both hue and brightness change as the direction changes.',
		sourceMarker: 'camera-rays'
	}),
	stage({
		slug: 'one-distance',
		stage: 2,
		title: 'One distance',
		shortExplanation: 'Ask one exact sphere SDF how far a sample lies from its surface.',
		explanation:
			'For a sphere, length(point − centre) − radius is positive outside, zero on the surface, and negative inside. The stage uses that same running function to produce a deliberately plain silhouette before adding lighting or architecture.',
		callout: 'At this stage the distance is exact Euclidean signed distance.',
		sourceMarker: 'one-distance'
	}),
	stage({
		slug: 'walking-loop',
		stage: 3,
		title: 'The walking loop',
		shortExplanation:
			'Advance by a conservative fraction of the returned distance until a hit or miss.',
		explanation:
			'This is sphere tracing inside the broader family of ray-marching methods. A distance-aware epsilon defines a hit, the finite far clip defines a miss, and the fixed tier budget bounds the work; colour and luminance reveal how much of that budget each ray spends.',
		callout:
			'The 0.8 safety factor matters once composed scene functions are conservative bounds rather than exact SDFs.',
		sourceMarker: 'walking-loop'
	}),
	stage({
		slug: 'surface-direction',
		stage: 4,
		title: 'Surface direction',
		shortExplanation: 'Estimate the distance-field gradient only after the marcher confirms a hit.',
		explanation:
			'Four tetrahedrally arranged distance queries estimate how the field changes around the hit point. Normalising that gradient produces a surface direction for lighting; it is calculated from the field, not fetched from a mesh.',
		callout:
			'RGB encodes the estimated normal components, making discontinuities immediately visible.',
		sourceMarker: 'surface-direction'
	}),
	stage({
		slug: 'constructive-geometry',
		stage: 5,
		title: 'Constructive geometry',
		shortExplanation:
			'Combine a plane, rounded boxes, capped pillars, and a subtracted arch into one bay.',
		explanation:
			'Union chooses the nearer bound; subtraction cuts the inner radius from the outer arch before extrusion. A restrained smooth union joins only same-material column parts, so the material ID remains stable through the blend.',
		callout:
			'The visible surfaces are implicit in mapScene; p5 still rasterises one ordinary host rectangle underneath.',
		sourceMarker: 'constructive-geometry'
	}),
	stage({
		slug: 'fold-space',
		stage: 6,
		title: 'Fold space',
		shortExplanation: 'Reuse one architectural distance question across seven bounded depth cells.',
		explanation:
			'Centred coordinate repetition maps several world-space depths into one local bay without allocating objects. Clamping the cell index keeps the hall finite, generous empty margins avoid modulo-boundary artefacts, and a small rigid per-cell rotation creates a slow impossible twist.',
		callout: 'Only the architecture repeats; the focal orb and floor remain in world space.',
		sourceMarker: 'fold-space'
	}),
	stage({
		slug: 'believable-light',
		stage: 7,
		title: 'Make light believable',
		shortExplanation:
			'Layer material, hemisphere fill, diffuse, restrained highlights, AO, and soft shadow.',
		explanation:
			'Lighting work begins only after a confirmed hit. High and Balanced compile AO and shadow loops with different fixed budgets; Saver replaces both features at compile time, retaining direct and hemispheric light without paying for hidden samples.',
		callout:
			'The wet-looking floor uses specular and Fresnel terms only—there is no reflected second scene.',
		sourceMarker: 'believable-light'
	}),
	stage({
		slug: 'lose-horizon',
		stage: 8,
		title: 'Lose the horizon',
		shortExplanation:
			'Add stable seams, the surface pulse, depth fog, tone mapping, gamma, and dithering.',
		explanation:
			'The pulse compares world-space distance from the orb with a JavaScript-controlled radius and adds a narrow illumination band at confirmed surface hits. Exponential fog conceals the finite far clip; tone mapping, gamma encoding, and static coordinate dithering finish the bounded image without temporal flicker.',
		callout:
			'The pulse changes illumination, not geometry, and is not a physical simulation of light, sound, water, or material motion.',
		sourceMarker: 'lose-horizon'
	})
] as const satisfies readonly RayMarchingStage[];
