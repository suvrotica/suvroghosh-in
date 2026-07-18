import fragmentSource from './fragment.glsl?raw';
import vertexSource from './vertex.glsl?raw';
import { helloFragmentUniforms } from './sketch';
import { helloFragmentStages } from './stages';
import { helloFragmentMetadata, helloFragmentParameters, helloFragmentPresets } from './metadata';
import type { VisualizationDefinition } from '../../types';

const completeSketchSource = `import p5 from 'p5';
import vertexSource from './vertex.glsl?raw';
import fragmentSource from './fragment.glsl?raw';

new p5((p) => {
  let shaderProgram;

  p.setup = () => {
    p.createCanvas(720, 405, p.WEBGL);
    p.noStroke();
    shaderProgram = p.createShader(vertexSource, fragmentSource);
  };

  p.draw = () => {
    const density = p.pixelDensity();
    shaderProgram.setUniform('u_resolution', [p.width * density, p.height * density]);
    shaderProgram.setUniform('u_mouse', [p.mouseX * density, (p.height - p.mouseY) * density]);
    shaderProgram.setUniform('u_time', p.millis() / 1000);
    shaderProgram.setUniform('u_speed', 0.72);
    shaderProgram.setUniform('u_scale', 1.15);
    shaderProgram.setUniform('u_rings', 18.0);
    shaderProgram.setUniform('u_warp', 0.65);
    shaderProgram.setUniform('u_glow', 1.1);
    shaderProgram.setUniform('u_palette', 1.0);
    shaderProgram.setUniform('u_cellular', false);

    p.shader(shaderProgram);
    p.rect(-p.width / 2, -p.height / 2, p.width, p.height);
  };
});`;

export const helloFragment: VisualizationDefinition = {
	...helloFragmentMetadata,
	vertexSource,
	fragmentSource,
	parameters: helloFragmentParameters,
	presets: helloFragmentPresets,
	stages: helloFragmentStages,
	sourceFiles: [
		{
			id: 'sketch',
			label: 'p5 sketch',
			filename: 'sketch.js',
			language: 'javascript',
			source: completeSketchSource
		},
		{
			id: 'vertex',
			label: 'Vertex shader',
			filename: 'vertex.glsl',
			language: 'glsl',
			source: vertexSource
		},
		{
			id: 'fragment',
			label: 'Fragment shader',
			filename: 'fragment.glsl',
			language: 'glsl',
			source: fragmentSource
		}
	],
	uniforms: helloFragmentUniforms
};
