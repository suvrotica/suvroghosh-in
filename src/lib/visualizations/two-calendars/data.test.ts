import { describe, expect, it } from 'vitest';
import { chapters, connections, events, sources } from './data';
import { FIRST_YEAR, LAST_YEAR, getDateBounds } from './chronology';
import type { HistoricalDate } from './types';

const datePattern = {
	day: /^\d{4}-\d{2}-\d{2}$/u,
	month: /^\d{4}-\d{2}$/u,
	year: /^\d{4}$/u
};

function dateValues(date: HistoricalDate): string[] {
	if (date.kind === 'point') return [date.value];
	if (date.kind === 'duration') return [date.start, date.end];
	return [date.earliest, date.latest];
}

function assertUniqueIds(records: readonly { id: string }[], kind: string): void {
	expect(new Set(records.map((record) => record.id)).size, `${kind} IDs must be unique`).toBe(
		records.length
	);
	for (const record of records)
		expect(record.id, `${kind} IDs must be stable public-link identifiers`).toMatch(
			/^[a-z0-9][a-z0-9-]{0,99}$/u
		);
}

describe('historical dataset integrity', () => {
	it('contains a deliberately bounded selection with unique public identities', () => {
		expect(events.length).toBeGreaterThanOrEqual(24);
		expect(events.length).toBeLessThanOrEqual(36);
		assertUniqueIds(events, 'Record');
		assertUniqueIds(sources, 'Source');
		assertUniqueIds(connections, 'Comparison');
		assertUniqueIds(chapters, 'Chapter');
		expect(events.some((event) => event.side === 'calcutta')).toBe(true);
		expect(events.some((event) => event.side === 'america')).toBe(true);
	});

	it('keeps source references resolvable and historical claims scoped', () => {
		const sourceIds = new Set(sources.map((source) => source.id));
		for (const source of sources) {
			const url = new URL(source.url);
			expect(url.protocol, `${source.id} must use HTTPS`).toBe('https:');
			expect(source.title.trim(), `${source.id} needs a specific source title`).not.toBe('');
			expect(source.institution.trim(), `${source.id} needs source attribution`).not.toBe('');
		}
		for (const event of events) {
			expect(event.scope.trim(), `${event.id} needs geographic scope`).not.toBe('');
			expect(event.title.trim(), `${event.id} needs a headline`).not.toBe('');
			expect(event.summary.trim(), `${event.id} needs readable historical context`).not.toBe('');
			expect(event.theme.trim(), `${event.id} needs an editorial theme`).not.toBe('');
			expect(event.sourceIds.length, `${event.id} needs supporting evidence`).toBeGreaterThan(0);
			for (const id of event.sourceIds)
				expect(sourceIds.has(id), `${event.id} references unknown source ${id}`).toBe(true);
		}
	});

	it('retains civil-date precision and separates point, duration and uncertain records', () => {
		const earliest = Date.UTC(FIRST_YEAR, 0, 1);
		const latest = Date.UTC(LAST_YEAR + 1, 0, 1);
		for (const event of events) {
			for (const value of dateValues(event.date))
				expect(value, `${event.id} must retain its actual civil-date precision`).toMatch(
					datePattern[event.date.precision]
				);
			const bounds = getDateBounds(event.date);
			expect(bounds.start, `${event.id} begins before the atlas`).toBeGreaterThanOrEqual(earliest);
			expect(bounds.end, `${event.id} ends after the atlas`).toBeLessThanOrEqual(latest);
			expect(bounds.end, `${event.id} needs ordered, nonempty precision bounds`).toBeGreaterThan(
				bounds.start
			);
			expect(bounds.kind).toBe(event.date.kind);
			if (event.date.kind === 'point') {
				expect(event.date).not.toHaveProperty('start');
				expect(event.date).not.toHaveProperty('end');
				expect(event.date).not.toHaveProperty('earliest');
			} else if (event.date.kind === 'duration') {
				expect(event.date).not.toHaveProperty('value');
				expect(event.date).not.toHaveProperty('earliest');
			} else {
				expect(event.date.note.trim(), `${event.id} needs an uncertainty explanation`).not.toBe('');
				expect(event.date).not.toHaveProperty('start');
				expect(event.date).not.toHaveProperty('end');
			}
		}
	});

	it('connects the correct geographic ribbons and labels the evidence for every relationship', () => {
		const sourceIds = new Set(sources.map((source) => source.id));
		for (const connection of connections) {
			const left = events.find((event) => event.id === connection.leftId);
			const right = events.find((event) => event.id === connection.rightId);
			expect(left?.side, `${connection.id} must begin at the Calcutta ribbon`).toBe('calcutta');
			expect(right?.side, `${connection.id} must end at the American ribbon`).toBe('america');
			expect(connection.rationale.trim(), `${connection.id} needs an editorial rationale`).not.toBe(
				''
			);
			expect(['shared-time', 'thematic', 'documented']).toContain(connection.kind);
			for (const id of connection.sourceIds ?? [])
				expect(sourceIds.has(id), `${connection.id} references unknown source ${id}`).toBe(true);
			if (connection.kind === 'documented')
				expect(
					connection.sourceIds?.length ?? 0,
					`${connection.id} needs evidence for its actual relationship`
				).toBeGreaterThan(0);
			if (connection.kind === 'shared-time' && left && right) {
				const a = getDateBounds(left.date);
				const b = getDateBounds(right.date);
				const aFirstYear = new Date(a.start).getUTCFullYear();
				const aLastYear = new Date(a.end - 1).getUTCFullYear();
				const bFirstYear = new Date(b.start).getUTCFullYear();
				const bLastYear = new Date(b.end - 1).getUTCFullYear();
				expect(
					Math.max(aFirstYear, bFirstYear),
					`${connection.id} must share at least a historical year`
				).toBeLessThanOrEqual(Math.min(aLastYear, bLastYear));
			}
		}
	});

	it('keeps chapter links valid within the published historical window', () => {
		expect(chapters.length).toBeGreaterThanOrEqual(4);
		expect(chapters.length).toBeLessThanOrEqual(5);
		const connectionIds = new Set(connections.map((connection) => connection.id));
		for (const chapter of chapters) {
			expect(chapter.startYear).toBeGreaterThanOrEqual(FIRST_YEAR);
			expect(chapter.endYear).toBeLessThanOrEqual(LAST_YEAR);
			expect(chapter.startYear).toBeLessThanOrEqual(chapter.endYear);
			expect(
				chapter.connectionIds.length,
				`${chapter.id} needs a readable comparison`
			).toBeGreaterThan(0);
			for (const id of chapter.connectionIds)
				expect(connectionIds.has(id), `${chapter.id} references unknown comparison ${id}`).toBe(
					true
				);
		}
	});
});
