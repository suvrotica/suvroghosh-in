import fragmentTemplate from './fragment.frag?raw';
import qualitySource from './quality.ts?raw';
import sketchSource from './sketch.ts?raw';
import stagesSource from './stages.ts?raw';
import vertexSource from './vertex.vert?raw';
import { rayMarchingMetadata } from './metadata';
import { rayMarchingStages } from './stages';

export { rayMarchingMetadata } from './metadata';
export { extractShaderExcerpt } from './source-markers';
export { rayMarchingStages, type RayMarchingStage } from './stages';

export { fragmentTemplate, vertexSource };

export const rayMarchingSourceFiles = [
	{
		id: 'sketch',
		label: 'p5 sketch adapter',
		filename: 'sketch.ts',
		language: 'typescript',
		source: sketchSource
	},
	{
		id: 'vertex',
		label: 'Vertex shader',
		filename: 'vertex.vert',
		language: 'glsl',
		source: vertexSource
	},
	{
		id: 'fragment',
		label: 'Fragment shader template',
		filename: 'fragment.frag',
		language: 'glsl',
		source: fragmentTemplate
	},
	{
		id: 'stages',
		label: 'Stage definitions',
		filename: 'stages.ts',
		language: 'typescript',
		source: stagesSource
	},
	{
		id: 'quality',
		label: 'Quality policy',
		filename: 'quality.ts',
		language: 'typescript',
		source: qualitySource
	}
] as const;

/**
 * Shader/source package consumed by the dedicated Cathedral host. It deliberately
 * contains no illustrative stand-in host: every exported GLSL excerpt comes from
 * the same fragment template that buildFragmentSource() compiles for the canvas.
 */
export const rayMarchingCathedral = {
	...rayMarchingMetadata,
	vertexSource,
	fragmentTemplate,
	stages: rayMarchingStages,
	sourceFiles: rayMarchingSourceFiles
} as const;
