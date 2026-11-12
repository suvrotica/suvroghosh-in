import { DEFAULT_STATE, type StudioState } from './studio-state';

function example(file: string, title: string, alt: string, changes: Partial<StudioState>) {
	return { file, title, alt, state: { ...DEFAULT_STATE, ...changes, view: 'landscape' as const } };
}

export const EXAMPLES = [
	example(
		'street-fine',
		'Calcutta street, finer brushwork',
		'A person with a bag passing a shaded produce stall in a Calcutta lane',
		{}
	),
	example(
		'street-broad',
		'Calcutta street, broad brushwork',
		'The same pedestrian and stall painted with broader marks',
		{ brushSize: 78 }
	),
	example(
		'landing',
		'Hooghly-side landing',
		'Steps and figures beside the Hooghly, with a moored boat and its broken reflection',
		{ family: 'landing', seed: 'landing-12' }
	),
	example(
		'courtyard',
		'Courtyard and veranda',
		'A sunlit floor, plants and figures beside a shaded veranda',
		{ family: 'courtyard', seed: 'veranda-18' }
	),
	example(
		'pond',
		'Pond, path, and fields',
		'A person on a path between the pond bank and cultivated fields',
		{ family: 'pond', seed: 'pond-32' }
	)
];
