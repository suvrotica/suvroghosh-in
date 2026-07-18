import type { VisualizationParameter, VisualizationPreset } from '../../types';

export const helloFragmentMetadata = {
	id: 'hello-fragment',
	title: 'Animated interference field',
	description:
		'A luminous field made from overlapping sine waves, distance functions, pointer input, and a small colour palette.',
	subjects: ['Computer Science', 'Mathematics'],
	poster: '/images/visualizations/hello-fragment-poster.jpg',
	posterAlt:
		'Luminous cyan, violet, and gold interference rings flowing across a dark field around a bright focal point'
} as const;

export const helloFragmentParameters: readonly VisualizationParameter[] = [
	{
		id: 'speed',
		label: 'Time speed',
		description: 'How quickly the wave phases change.',
		type: 'range',
		defaultValue: 0.72,
		min: 0,
		max: 1.8,
		step: 0.01,
		unit: '×'
	},
	{
		id: 'scale',
		label: 'Field scale',
		description: 'How much mathematical space fits inside the canvas.',
		type: 'range',
		defaultValue: 1.15,
		min: 0.6,
		max: 2.2,
		step: 0.01,
		unit: '×'
	},
	{
		id: 'rings',
		label: 'Ring frequency',
		description: 'The number of wave ridges packed into the field.',
		type: 'number',
		defaultValue: 18,
		min: 6,
		max: 32,
		step: 1
	},
	{
		id: 'warp',
		label: 'Pointer warp',
		description: 'How strongly the pointer bends nearby coordinates.',
		type: 'range',
		defaultValue: 0.65,
		min: 0,
		max: 1.5,
		step: 0.01,
		unit: '×'
	},
	{
		id: 'glow',
		label: 'Ridge glow',
		description: 'The brightness added where waves nearly cancel.',
		type: 'range',
		defaultValue: 1.1,
		min: 0.2,
		max: 2,
		step: 0.01,
		unit: '×'
	},
	{
		id: 'palette',
		label: 'Colour field',
		description: 'A shader palette selected before the final colour is written.',
		type: 'select',
		defaultValue: 'electric',
		options: [
			{ label: 'Calm cyan', value: 'calm' },
			{ label: 'Electric violet', value: 'electric' },
			{ label: 'Cellular gold', value: 'cellular' }
		]
	},
	{
		id: 'cellular',
		label: 'Cellular modulation',
		description: 'Blend an extra crossed-sine field into the interference pattern.',
		type: 'toggle',
		defaultValue: false
	}
];

export const helloFragmentPresets: readonly VisualizationPreset[] = [
	{
		id: 'calm-field',
		label: 'Calm Field',
		description: 'Wide, slow cyan waves with gentle distortion.',
		values: {
			speed: 0.32,
			scale: 0.82,
			rings: 12,
			warp: 0.25,
			glow: 0.7,
			palette: 'calm',
			cellular: false
		}
	},
	{
		id: 'electric-interference',
		label: 'Electric Interference',
		description: 'Fast, tight violet waves with a bright ridge glow.',
		values: {
			speed: 1.18,
			scale: 1.2,
			rings: 25,
			warp: 0.92,
			glow: 1.5,
			palette: 'electric',
			cellular: false
		}
	},
	{
		id: 'cellular-pulse',
		label: 'Cellular Pulse',
		description: 'A folded gold field where waves begin to resemble living membranes.',
		values: {
			speed: 0.64,
			scale: 1.62,
			rings: 16,
			warp: 1.2,
			glow: 1.12,
			palette: 'cellular',
			cellular: true
		}
	}
];
