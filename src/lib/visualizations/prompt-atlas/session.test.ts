import { describe, expect, it } from 'vitest';
import { analyzePrompt } from './analysis';
import { createReport, createSession, MAX_SESSION_BYTES, parseSession } from './session';

describe('Prompt Atlas portable sessions', () => {
	it('round-trips source, model and confirmed corrections', () => {
		const ontology = analyzePrompt('Write a bedtime story about a robot.');
		ontology.nodes[0].label = 'A corrected request';
		ontology.nodes[0].provenance = 'user-confirmed';
		const session = createSession(ontology, 'mindmap');
		expect(parseSession(JSON.stringify(session))).toEqual(session);
	});
	it('redacts source and evidence quotes from reports and distinguishes them from sessions', () => {
		const ontology = analyzePrompt('Write a bedtime story about a robot.');
		const report = createReport(ontology, 'mindmap');
		expect(report).not.toHaveProperty('source');
		expect(report.nodes.every((node) => node.evidence.length === 0)).toBe(true);
		expect(() => parseSession(JSON.stringify(report))).toThrow('supported Prompt Atlas session');
	});
	it('retains the specified database target in source-redacted reports', () => {
		const ontology = analyzePrompt('PostgreSQL: users have UUID id primary key.');
		expect(createReport(ontology, 'physical')).toMatchObject({
			databaseTarget: 'PostgreSQL',
			sourceIncluded: false
		});
	});
	it('rejects unknown versions, oversized files, mismatching evidence and missing targets', () => {
		const session = createSession(analyzePrompt('Write a bedtime story about a robot.'), 'mindmap');
		expect(() => parseSession(JSON.stringify({ ...session, version: 999 }))).toThrow();
		expect(() => parseSession(' '.repeat(MAX_SESSION_BYTES + 1))).toThrow('512 KiB');
		session.ontology.source.text = 'Changed source';
		expect(() => parseSession(JSON.stringify(session))).toThrow('evidence');
	});
	it('refuses to create a session that its importer would reject, including repeated source evidence', () => {
		const text = `PostgreSQL: users have ${Array.from({ length: 80 }, (_, index) => `field_${'a'.repeat(72)}${index} text`).join(', ')}.`;
		const ontology = analyzePrompt(text);
		expect(ontology.nodes[0].attributes).toHaveLength(80);
		expect(Array.from(text).length).toBeLessThan(20_000);
		expect(() => createSession(ontology, 'physical')).toThrow('exceeds 512 KiB after formatting');
	});
	it('checks pretty JSON size so both compact saves and formatted exports remain restorable', () => {
		const session = createSession(
			analyzePrompt('PostgreSQL: users have UUID id primary key and email text.'),
			'physical'
		);
		expect(
			new TextEncoder().encode(JSON.stringify(session, null, 2)).byteLength
		).toBeLessThanOrEqual(MAX_SESSION_BYTES);
		expect(parseSession(JSON.stringify(session))).toEqual(session);
		expect(parseSession(JSON.stringify(session, null, 2))).toEqual(session);
	});
});
