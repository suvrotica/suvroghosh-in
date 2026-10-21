import type {
	CalendarSide,
	DatePrecision,
	HistoricalConnection,
	HistoricalDate,
	HistoricalEvent
} from './types';

export const FIRST_YEAR = 1940;
export const LAST_YEAR = 1959;
export const DEFAULT_YEAR = 1947;

export interface DateBounds {
	/** UTC midnight for the first possible civil date. This is not an event's clock time. */
	start: number;
	/** Exclusive upper boundary of the final date's documented precision. */
	end: number;
	kind: HistoricalDate['kind'];
	precision: DatePrecision;
}

export interface CalendarSelection {
	year: number;
	connectionId: string | null;
	eventId: string | null;
}

export interface HistoricalComparison {
	left: HistoricalEvent | null;
	right: HistoricalEvent | null;
	connection: HistoricalConnection | null;
}

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

function civilDate(value: string, precision: DatePrecision): Date {
	const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);
	if (!match || (precision !== 'year' && !match[2]) || (precision === 'day' && !match[3])) {
		throw new RangeError(`Invalid ${precision}-precision historical date: ${value}`);
	}
	const year = Number(match[1]);
	const suppliedMonth = Number(match[2] ?? 1);
	const suppliedDay = Number(match[3] ?? 1);
	const check = new Date(Date.UTC(year, suppliedMonth - 1, suppliedDay));
	if (
		check.getUTCFullYear() !== year ||
		check.getUTCMonth() !== suppliedMonth - 1 ||
		check.getUTCDate() !== suppliedDay
	)
		throw new RangeError(`Invalid historical civil date: ${value}`);
	return new Date(
		Date.UTC(
			year,
			precision === 'year' ? 0 : suppliedMonth - 1,
			precision === 'day' ? suppliedDay : 1
		)
	);
}

function endOfPrecision(date: Date, precision: DatePrecision): number {
	const next = new Date(date);
	if (precision === 'year') next.setUTCFullYear(next.getUTCFullYear() + 1);
	else if (precision === 'month') next.setUTCMonth(next.getUTCMonth() + 1);
	else next.setUTCDate(next.getUTCDate() + 1);
	return next.getTime();
}

/** Precision windows locate evidence; only kind='duration' describes continuing activity. */
export function getDateBounds(date: HistoricalDate): DateBounds {
	const first =
		date.kind === 'point' ? date.value : date.kind === 'duration' ? date.start : date.earliest;
	const last =
		date.kind === 'point' ? date.value : date.kind === 'duration' ? date.end : date.latest;
	const start = civilDate(first, date.precision).getTime();
	const lastDate = civilDate(last, date.precision);
	if (lastDate.getTime() < start) throw new RangeError('Historical date boundaries are reversed.');
	return {
		start,
		end: endOfPrecision(lastDate, date.precision),
		kind: date.kind,
		precision: date.precision
	};
}

function formatCivilDate(value: string, precision: DatePrecision): string {
	const date = civilDate(value, precision);
	if (precision === 'year') return `${date.getUTCFullYear()}`;
	const month = MONTHS[date.getUTCMonth()];
	return `${precision === 'day' ? `${date.getUTCDate()} ` : ''}${month} ${date.getUTCFullYear()}`;
}

export function formatHistoricalDate(date: HistoricalDate): string {
	getDateBounds(date);
	if (date.kind === 'point') return formatCivilDate(date.value, date.precision);
	if (date.kind === 'uncertain') {
		return `Date uncertain: ${formatCivilDate(date.earliest, date.precision)}–${formatCivilDate(date.latest, date.precision)}`;
	}
	return `${formatCivilDate(date.start, date.precision)}–${formatCivilDate(date.end, date.precision)}`;
}

export function getEventYear(event: HistoricalEvent): number {
	return new Date(getDateBounds(event.date).start).getUTCFullYear();
}

/** The twenty-year axis runs from 1 January 1940 (0) to 1 January 1960 (1). */
export function yearPosition(value: number | HistoricalDate): number {
	let year: number;
	if (typeof value === 'number') year = Number.isFinite(value) ? value : FIRST_YEAR;
	else {
		const epoch = getDateBounds(value).start;
		const civil = new Date(epoch);
		const start = Date.UTC(civil.getUTCFullYear(), 0, 1);
		const end = Date.UTC(civil.getUTCFullYear() + 1, 0, 1);
		year = civil.getUTCFullYear() + (epoch - start) / (end - start);
	}
	return Math.max(0, Math.min(1, (year - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR + 1)));
}

export function eventsForYear(
	events: readonly HistoricalEvent[],
	year: number,
	side?: CalendarSide
): HistoricalEvent[] {
	if (!Number.isInteger(year) || year < FIRST_YEAR || year > LAST_YEAR) return [];
	const start = Date.UTC(year, 0, 1);
	const end = Date.UTC(year + 1, 0, 1);
	return events
		.filter((event) => {
			if (side && event.side !== side) return false;
			const bounds = getDateBounds(event.date);
			return bounds.start < end && bounds.end > start;
		})
		.sort((a, b) => getDateBounds(a.date).start - getDateBounds(b.date).start);
}

export function relationshipLabel(kind: HistoricalConnection['kind']): string {
	return kind === 'shared-time'
		? 'Shared time'
		: kind === 'documented'
			? 'Documented relationship'
			: 'Thematic comparison';
}

function validYear(value: string | null): number {
	if (!value || !/^\d{4}$/.test(value)) return DEFAULT_YEAR;
	const year = Number(value);
	return year >= FIRST_YEAR && year <= LAST_YEAR ? year : DEFAULT_YEAR;
}

function validConnection(
	connection: HistoricalConnection | undefined,
	events: readonly HistoricalEvent[]
): connection is HistoricalConnection {
	return Boolean(
		connection &&
		events.some((event) => event.id === connection.leftId && event.side === 'calcutta') &&
		events.some((event) => event.id === connection.rightId && event.side === 'america')
	);
}

/** Ignore unsupported IDs and malformed years; a selected event owns its historical year. */
export function parseSelection(
	search: string | URLSearchParams,
	events: readonly HistoricalEvent[],
	connections: readonly HistoricalConnection[]
): CalendarSelection {
	const params = typeof search === 'string' ? new URLSearchParams(search) : search;
	let year = validYear(params.get('year'));
	const event = events.find((item) => item.id === params.get('event'));
	let connection = connections.find((item) => item.id === params.get('connection'));
	if (!validConnection(connection, events)) connection = undefined;
	if (event) {
		if (!eventsForYear([event], year).length) year = getEventYear(event);
		if (connection && connection.leftId !== event.id && connection.rightId !== event.id)
			connection = undefined;
	} else if (connection) {
		const selectedConnection = connection;
		const pair = events.filter(
			(item) => item.id === selectedConnection.leftId || item.id === selectedConnection.rightId
		);
		if (!eventsForYear(pair, year).length)
			year = getEventYear(pair.find((item) => item.side === 'calcutta')!);
	}
	return { year, connectionId: connection?.id ?? null, eventId: event?.id ?? null };
}

export function createSelectionUrl(base: string | URL, state: CalendarSelection): string {
	const url = new URL(base.toString(), 'https://suvroghosh.in');
	url.search = '';
	url.hash = '';
	url.searchParams.set('year', String(validYear(String(state.year))));
	if (state.connectionId && /^[a-z0-9-]{1,100}$/.test(state.connectionId))
		url.searchParams.set('connection', state.connectionId);
	if (state.eventId && /^[a-z0-9-]{1,100}$/.test(state.eventId))
		url.searchParams.set('event', state.eventId);
	return url.toString();
}

/** A missing year stays empty; nearby events are never silently substituted. */
export function pickComparison(
	events: readonly HistoricalEvent[],
	connections: readonly HistoricalConnection[],
	year: number,
	connectionId?: string | null
): HistoricalComparison {
	const yearEvents = eventsForYear(events, year);
	const yearEventIds = new Set(yearEvents.map((event) => event.id));
	const requested = connections.find((item) => item.id === connectionId);
	const connection = validConnection(requested, events)
		? requested
		: (connections.find(
				(item) =>
					validConnection(item, events) &&
					yearEventIds.has(item.leftId) &&
					yearEventIds.has(item.rightId)
			) ?? null);
	if (connection)
		return {
			left: events.find((event) => event.id === connection.leftId) ?? null,
			right: events.find((event) => event.id === connection.rightId) ?? null,
			connection
		};
	return {
		left: yearEvents.find((event) => event.side === 'calcutta') ?? null,
		right: yearEvents.find((event) => event.side === 'america') ?? null,
		connection: null
	};
}
