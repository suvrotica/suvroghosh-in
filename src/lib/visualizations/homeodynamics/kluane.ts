import kluaneArchive from '$lib/data/static-equilibrium-illusion/kluane-control.json';
import type { EvidenceKind } from './types';

export type KluaneControlDatum = {
	occasion: string;
	year: number;
	density: number;
	lower95: number;
	upper95: number;
};

export type KluaneTreatmentSummary = {
	id: 'control' | 'predator-exclosure' | 'food' | 'food-exclosure';
	label: string;
	ratio: number;
	ratioLabel: string;
	kind: EvidenceKind;
	uncertainty: string;
	note: string;
};

export const KLUANE_PROVENANCE = kluaneArchive.provenance;

export const KLUANE_CONTROL_SERIES: readonly KluaneControlDatum[] = kluaneArchive.controlSeries;

export const KLUANE_SPRING_CONTROL_SERIES: readonly KluaneControlDatum[] =
	KLUANE_CONTROL_SERIES.filter((datum) => datum.occasion.startsWith('Spring'));

export const KLUANE_RELATED_SYNTHESIS_URL = 'https://doi.org/10.1111/1365-2656.12720';

export const KLUANE_TREATMENT_SUMMARIES: readonly KluaneTreatmentSummary[] = [
	{
		id: 'control',
		label: 'Control',
		ratio: 1,
		ratioLabel: '1× reference',
		kind: 'measured-summary',
		uncertainty: 'Reference condition; not a treatment-effect estimate.',
		note: 'Ratios compare treatment density with control density at the same time.'
	},
	{
		id: 'predator-exclosure',
		label: 'Mammalian-predator exclosure',
		ratio: 2,
		ratioLabel: 'about 2×',
		kind: 'measured-summary',
		uncertainty: 'No confidence interval reported for this aggregate ratio.',
		note: 'Average reported across peak and decline phases; raptors could still enter.'
	},
	{
		id: 'food',
		label: 'Food addition',
		ratio: 3,
		ratioLabel: 'about 3×',
		kind: 'measured-summary',
		uncertainty: 'No confidence interval reported for this aggregate ratio.',
		note: 'Average reported across peak and decline phases.'
	},
	{
		id: 'food-exclosure',
		label: 'Food + exclosure',
		ratio: 11,
		ratioLabel: 'about 11×',
		kind: 'measured-summary',
		uncertainty: 'No confidence interval reported for this aggregate ratio.',
		note: 'More-than-additive average; the paper reports a late-decline maximum near 36×.'
	}
] as const;

export const KLUANE_PAPER_URL = 'https://doi.org/10.1126/science.269.5227.1112';
export const KLUANE_HIGHER_DIMENSIONAL_URL = 'https://doi.org/10.1073/pnas.94.10.5147';

export const KLUANE_LIMITATIONS = [
	'The experiment concerned hares, a predator guild and food availability—not a simple lynx–hare pair.',
	'Raptors could enter the mammalian-predator exclosures.',
	'Hares could cross treatment boundaries.',
	'Costly exclosure and food-plus-exclosure treatments were not fully replicated.',
	'Predation, food, movement, weather and other factors remained entangled.',
	'Density and survival effects did not necessarily combine in the same way.'
] as const;
