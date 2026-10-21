import { describe, expect, it } from 'vitest';
import {
	createSelectionUrl,
	eventsForYear,
	formatHistoricalDate,
	getDateBounds,
	getEventYear,
	parseSelection,
	pickComparison,
	relationshipLabel,
	yearPosition
} from './chronology';
import type { HistoricalConnection, HistoricalEvent } from './types';

const left: HistoricalEvent = {
	id: 'calcutta-1947',
	side: 'calcutta',
	scope: 'Calcutta',
	title: 'A dated record',
	date: { kind: 'point', value: '1947-08-15', precision: 'day' },
	summary: 'First observation.',
	theme: 'Belonging',
	sourceIds: ['archive']
};
const right: HistoricalEvent = {
	...left,
	id: 'america-1947',
	side: 'america',
	scope: 'United States',
	date: { kind: 'point', value: '1947', precision: 'year' }
};
const earlier: HistoricalEvent = {
	...left,
	id: 'calcutta-1941',
	date: { kind: 'point', value: '1941-05', precision: 'month' }
};
const connection: HistoricalConnection = {
	id: 'parallel-belonging',
	leftId: left.id,
	rightId: right.id,
	kind: 'thematic',
	title: 'Two forms of belonging',
	rationale: 'An editorial comparison, without a causal claim.'
};
const events = [left, right, earlier];

describe('historical civil chronology', () => {
	it('uses exclusive precision bounds, including leap days and December rollover', () => {
		expect(getDateBounds({ kind: 'point', value: '1948-02-29', precision: 'day' })).toEqual({
			start: Date.UTC(1948, 1, 29),
			end: Date.UTC(1948, 2, 1),
			kind: 'point',
			precision: 'day'
		});
		expect(getDateBounds({ kind: 'point', value: '1949-12', precision: 'month' }).end).toBe(
			Date.UTC(1950, 0, 1)
		);
		expect(getDateBounds(right.date)).toMatchObject({
			start: Date.UTC(1947, 0, 1),
			end: Date.UTC(1948, 0, 1),
			kind: 'point'
		});
	});

	it('keeps uncertainty and duration separate even when their date windows match', () => {
		const duration = getDateBounds({
			kind: 'duration',
			start: '1942',
			end: '1945',
			precision: 'year'
		});
		const uncertain = getDateBounds({
			kind: 'uncertain',
			earliest: '1942',
			latest: '1945',
			precision: 'year',
			note: 'The surviving record is incomplete.'
		});
		expect(duration.start).toBe(uncertain.start);
		expect(duration.end).toBe(uncertain.end);
		expect(duration.kind).toBe('duration');
		expect(uncertain.kind).toBe('uncertain');
		expect(
			formatHistoricalDate({
				kind: 'uncertain',
				earliest: '1942',
				latest: '1945',
				precision: 'year',
				note: 'Incomplete'
			})
		).toBe('Date uncertain: 1942–1945');
	});

	it('rejects impossible and reversed dates instead of normalising them into another month', () => {
		expect(() => getDateBounds({ kind: 'point', value: '1947-02-29', precision: 'day' })).toThrow(
			RangeError
		);
		expect(() => getDateBounds({ kind: 'point', value: '1947-13', precision: 'month' })).toThrow(
			RangeError
		);
		expect(() => getDateBounds({ kind: 'point', value: '1947', precision: 'day' })).toThrow(
			RangeError
		);
		expect(() =>
			getDateBounds({ kind: 'duration', start: '1950', end: '1949', precision: 'year' })
		).toThrow(RangeError);
	});

	it('uses the same coordinates for both places without inferring clock times', () => {
		expect(yearPosition(1940)).toBe(0);
		expect(yearPosition(1960)).toBe(1);
		expect(yearPosition(1947)).toBe(0.35);
		expect(yearPosition(left.date)).toBeGreaterThan(yearPosition(1947));
		expect(getEventYear(left)).toBe(1947);
		expect(formatHistoricalDate(left.date)).toBe('15 August 1947');
		expect(formatHistoricalDate(earlier.date)).toBe('May 1941');
	});

	it('includes genuine spanning intervals without borrowing nearby point events', () => {
		const span: HistoricalEvent = {
			...left,
			id: 'war-years',
			date: { kind: 'duration', start: '1942-12', end: '1944-01', precision: 'month' }
		};
		expect(eventsForYear([...events, span], 1943).map((event) => event.id)).toEqual(['war-years']);
		expect(eventsForYear(events, 1946)).toEqual([]);
		expect(eventsForYear(events, 1947, 'america')).toEqual([right]);
		expect(eventsForYear(events, 1960)).toEqual([]);
	});
});

describe('validated public selections', () => {
	it('ignores malformed or unsupported fields and keeps a stable default', () => {
		for (const search of [
			'',
			'year=1900',
			'year=Infinity',
			'year=1947.5',
			'year=01947',
			'year=1959<script>'
		]) {
			expect(parseSelection(search, events, [connection])).toEqual({
				year: 1947,
				connectionId: null,
				eventId: null
			});
		}
		expect(
			parseSelection('year=1959&connection=missing&event=missing&private=secret', events, [
				connection
			])
		).toEqual({ year: 1959, connectionId: null, eventId: null });
	});

	it('restores a selected event in its real year and discards incompatible pairings', () => {
		expect(
			parseSelection('year=1958&event=calcutta-1941&connection=parallel-belonging', events, [
				connection
			])
		).toEqual({ year: 1941, eventId: earlier.id, connectionId: null });
		expect(parseSelection('year=1945&connection=parallel-belonging', events, [connection])).toEqual(
			{ year: 1947, eventId: null, connectionId: connection.id }
		);
	});

	it('round-trips selected records and removes unrelated query fields and fragments', () => {
		const state = { year: 1947, connectionId: connection.id, eventId: left.id };
		const url = createSelectionUrl(
			'https://suvroghosh.in/visualizations/two-calendars?private=secret#old',
			state
		);
		expect(new URL(url).searchParams.has('private')).toBe(false);
		expect(new URL(url).hash).toBe('');
		expect(parseSelection(new URL(url).searchParams, events, [connection])).toEqual(state);
	});

	it('rejects connections whose ends do not belong to the correct ribbons', () => {
		const invalid = { ...connection, leftId: right.id };
		expect(parseSelection(`connection=${connection.id}`, events, [invalid]).connectionId).toBe(
			null
		);
	});
});

describe('comparison semantics', () => {
	it('requires both records in the chosen year for automatic pairings, while allowing explicit cross-year threads', () => {
		const film: HistoricalEvent = {
			...left,
			id: 'pather-1955',
			date: { kind: 'point', value: '1955', precision: 'year' }
		};
		const television: HistoricalEvent = {
			...right,
			id: 'lucy-1951',
			date: { kind: 'point', value: '1951', precision: 'year' }
		};
		const boycott: HistoricalEvent = {
			...right,
			id: 'parks-1955',
			date: { kind: 'point', value: '1955-12-01', precision: 'day' }
		};
		const acrossYears = {
			...connection,
			id: 'moving-images',
			leftId: film.id,
			rightId: television.id
		};
		expect(pickComparison([film, television, boycott], [acrossYears], 1955)).toEqual({
			left: film,
			right: boycott,
			connection: null
		});
		expect(
			pickComparison([film, television, boycott], [acrossYears], 1955, acrossYears.id)
		).toEqual({ left: film, right: television, connection: acrossYears });
	});

	it('preserves the editorial relationship type', () => {
		expect(pickComparison(events, [connection], 1947)).toEqual({ left, right, connection });
		expect(relationshipLabel('thematic')).toBe('Thematic comparison');
		expect(relationshipLabel('shared-time')).toBe('Shared time');
		expect(relationshipLabel('documented')).toBe('Documented relationship');
	});

	it('keeps unsupported years empty', () => {
		expect(pickComparison(events, [connection], 1946)).toEqual({
			left: null,
			right: null,
			connection: null
		});
	});
});
