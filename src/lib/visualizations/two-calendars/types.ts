export type CalendarSide = 'calcutta' | 'america';
export type DatePrecision = 'day' | 'month' | 'year';

/** Civil chronology: precision is evidence, never an inferred clock time. */
export type HistoricalDate =
	| { kind: 'point'; value: string; precision: DatePrecision }
	| { kind: 'duration'; start: string; end: string; precision: DatePrecision }
	| {
			kind: 'uncertain';
			earliest: string;
			latest: string;
			precision: DatePrecision;
			note: string;
	  };

export interface HistoricalSource {
	id: string;
	title: string;
	institution: string;
	url: string;
	note?: string;
}

export interface HistoricalEvent {
	id: string;
	side: CalendarSide;
	scope: string;
	date: HistoricalDate;
	title: string;
	summary: string;
	theme: string;
	sourceIds: string[];
	qualification?: string;
}

export interface HistoricalConnection {
	id: string;
	leftId: string;
	rightId: string;
	kind: 'shared-time' | 'thematic' | 'documented';
	title: string;
	rationale: string;
	sourceIds?: string[];
}

export interface HistoricalChapter {
	id: string;
	number: string;
	title: string;
	subtitle: string;
	startYear: number;
	endYear: number;
	body: string;
	connectionIds: string[];
}
