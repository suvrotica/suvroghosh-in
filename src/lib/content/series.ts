export type SeriesDefinition = {
	id: string;
	title: string;
	eyebrow: string;
	description: string;
	featuredOnHome: boolean;
};

export const seriesDefinitions = [
	{
		id: 'patient-through-machine',
		title: 'The Patient Through the Machine',
		eyebrow: 'Ongoing series · Healthcare systems',
		description:
			'A visual series following one fictional patient through the policies, software, queues, and human decisions between an order and care.',
		featuredOnHome: true
	}
] as const satisfies readonly SeriesDefinition[];

export const featuredSeriesDefinitions: readonly SeriesDefinition[] = seriesDefinitions.filter(
	(series) => series.featuredOnHome
);

const seriesDefinitionsById = new Map<string, SeriesDefinition>(
	seriesDefinitions.map((series) => [series.id, series])
);

export function getSeriesDefinition(id: string): SeriesDefinition | undefined {
	return seriesDefinitionsById.get(id);
}
