export const samples = [
	{
		id: 'calibration',
		label: 'Calibration',
		file: 'calibration.png',
		detail: 'Numbered lines, circles and an asymmetric R reveal curvature and reversal.',
		alt: 'Optical calibration chart with numbered grid intersections, concentric circles, an asymmetric R and coloured markers.'
	},
	{
		id: 'facade',
		label: 'Architecture',
		file: 'facade.png',
		detail: 'Follow the window frames. Their repeated straight edges make bending easy to see.',
		alt: 'Original illustration of a building façade with repeated windows and straight architectural lines.'
	},
	{
		id: 'portrait',
		label: 'Portrait',
		file: 'portrait.png',
		detail: 'Watch familiar facial proportions change as the centre moves.',
		alt: 'Original illustrated portrait with balanced facial features and a geometric background.'
	},
	{
		id: 'corridor',
		label: 'Corridor',
		file: 'corridor.png',
		detail: 'Perspective is already present. The effect adds curvature to its straight lines.',
		alt: 'Original illustration of a long corridor with strong perspective and repeated door frames.'
	},
	{
		id: 'typography',
		label: 'Type & colour',
		file: 'typography.png',
		detail: 'Asymmetric letters reveal reflection; colour blocks reveal edge sampling.',
		alt: 'Original optical typography chart with asymmetric letters, arrows and colour swatches.'
	}
] as const;

export type SampleId = (typeof samples)[number]['id'];
export const assetRoot = '/images/visualizations/through-a-different-glass/';
