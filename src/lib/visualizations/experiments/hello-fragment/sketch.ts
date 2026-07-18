import type { UniformValue, VisualizationFrame, VisualizationParameters } from '../../types';

function numberParameter(parameters: VisualizationParameters, id: string, fallback: number) {
	const value = parameters[id];
	return typeof value === 'number' ? value : fallback;
}

export function helloFragmentUniforms(frame: VisualizationFrame): Record<string, UniformValue> {
	const { parameters } = frame;
	const palettes: Record<string, number> = { calm: 0, electric: 1, cellular: 2 };
	const palette = typeof parameters.palette === 'string' ? parameters.palette : 'electric';

	return {
		u_resolution: frame.resolution,
		u_mouse: frame.pointer,
		u_time: frame.time,
		u_speed: numberParameter(parameters, 'speed', 0.72),
		u_scale: numberParameter(parameters, 'scale', 1.15),
		u_rings: numberParameter(parameters, 'rings', 18),
		u_warp: numberParameter(parameters, 'warp', 0.65),
		u_glow: numberParameter(parameters, 'glow', 1.1),
		u_palette: palettes[palette] ?? 1,
		u_cellular: parameters.cellular === true
	};
}
