import { describe, expect, it } from 'vitest';
import {
	buildReport,
	csvCell,
	parseExportRecord,
	readLines,
	safeFilename,
	validateResultReferences
} from './exports';
import { DEFAULT_SETTINGS, type AnalysisResult, type AtlasProject } from './types';

const project: AtlasProject = {
	id: 'atlas',
	name: 'A <script> atlas',
	createdAt: '2026-10-27',
	updatedAt: '2026-10-27',
	settings: DEFAULT_SETTINGS,
	questions: [],
	dismissed: [],
	pins: [],
	topicNames: {}
};

describe('portable atlas export', () => {
	it('round-trips a versioned header and refuses unknown versions', () => {
		const { questions: _questions, ...header } = project;
		void _questions;
		const record = {
			type: 'atlas',
			format: 'knowledge-gap-atlas',
			version: 1,
			includeSources: false,
			project: header
		};
		expect(parseExportRecord(JSON.stringify(record))).toEqual(record);
		expect(() => parseExportRecord(JSON.stringify({ ...record, version: 2 }))).toThrow();
	});
	it('rejects prototype keys and impossible source offsets', () => {
		const { questions: _questions, ...header } = project;
		void _questions;
		const value = JSON.stringify({
			type: 'atlas',
			format: 'knowledge-gap-atlas',
			version: 1,
			includeSources: false,
			project: header
		}).replace('"aliases":{}', '"aliases":{"__proto__":"unsafe"}');
		expect(() => parseExportRecord(value)).toThrow();
		expect(() =>
			parseExportRecord(
				JSON.stringify({
					type: 'question',
					question: {
						id: 'q',
						text: 'Why?',
						note: '',
						status: 'investigate',
						evidence: [{ sourceId: 's', start: 10, end: 4 }]
					}
				})
			)
		).toThrow();
	});
	it('does not allow CSV cells to become spreadsheet formulas', () => {
		for (const value of ['=1+1', ' +SUM(A1)', '-2+4', '@cmd', '\tformula'])
			expect(csvCell(value)).toMatch(/^"'/);
		expect(csvCell('a "quotation"')).toBe('"a ""quotation"""');
	});
	it('reads a UTF-8 export incrementally without losing a final unterminated record', async () => {
		const values: string[] = [];
		for await (const line of readLines(new Blob(['{"name":"বাংলা"}\n', '\r\n', '{"last":true}'])))
			values.push(line);
		expect(values).toEqual(['{"name":"বাংলা"}', '{"last":true}']);
	});
	it('keeps report markup inert and filenames portable', () => {
		const report = buildReport(project);
		expect(report).toContain('A \\<script\\> atlas');
		expect(report).toContain('not a probability');
		expect(safeFilename('../../atlas / notes')).not.toContain('/');
	});
	it('rejects dangling graph relationships', () => {
		const result: AnalysisResult = {
			version: 1,
			concepts: [],
			edges: [
				{ id: 'e', source: 'a', target: 'b', count: 1, sources: {}, evidence: [], weight: 1 }
			],
			topics: [],
			findings: [],
			settings: DEFAULT_SETTINGS,
			words: 1,
			totalTerms: 0,
			totalEdges: 1,
			analysedAt: '',
			scope: '',
			sources: []
		};
		expect(() => validateResultReferences(result)).toThrow('missing concept');
	});
});
