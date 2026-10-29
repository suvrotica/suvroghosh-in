import { describe, expect, it } from 'vitest';
import { createExampleProject } from './example';
import { createPublicSnapshot, snapshotForDisplay, validatePublicSnapshot } from './exports';
import { LIMITS, validateProject } from './model';

describe('Published mind-map boundary', () => {
	it('validates a source-free snapshot while preserving the author’s classifications', () => {
		const snapshot = createPublicSnapshot(createExampleProject());
		const loaded = validatePublicSnapshot(JSON.stringify(snapshot));
		expect(loaded).toEqual(snapshot);
		const display = snapshotForDisplay(loaded);
		expect(display.sources).toEqual([]);
		expect(display.nodes.every((node) => !node.notes && !node.evidence.length)).toBe(true);
		expect(display.nodes[0].status).toBe('explicit');
		expect(() => validateProject(display)).toThrow('readonlySnapshot');
	});
	it('rejects private fields rather than accidentally carrying them into publication', () => {
		const snapshot = createPublicSnapshot(createExampleProject());
		expect(() => validatePublicSnapshot({ ...snapshot, sources: ['private material'] })).toThrow(
			'sources'
		);
		const contaminated = structuredClone(snapshot);
		Object.assign(contaminated.nodes[1], { notes: 'An unpublished personal note.' });
		expect(() => validatePublicSnapshot(contaminated)).toThrow('notes');
	});
	it('rejects malformed, oversized and executable-style inputs', () => {
		expect(() => validatePublicSnapshot('{')).toThrow('not valid JSON');
		expect(() => validatePublicSnapshot(' '.repeat(LIMITS.importBytes + 1))).toThrow('2 MiB');
		const snapshot = createPublicSnapshot(createExampleProject());
		snapshot.nodes[1].color = 'url(javascript:alert(1))';
		expect(() => validatePublicSnapshot(snapshot)).toThrow('color');
	});
	it('rejects dangling endpoints, disconnected roots and hierarchy cycles', () => {
		const dangling = createPublicSnapshot(createExampleProject());
		dangling.edges[0].to = 'missing';
		expect(() => validatePublicSnapshot(dangling)).toThrow('invalid endpoints');
		const disconnected = createPublicSnapshot(createExampleProject());
		disconnected.nodes[1].parentId = null;
		expect(() => validatePublicSnapshot(disconnected)).toThrow('missing parent');
		const cycle = createPublicSnapshot(createExampleProject());
		cycle.nodes.find((node) => node.id === 'notice')!.parentId = 'notice-detail';
		expect(() => validatePublicSnapshot(cycle)).toThrow('cycle');
	});
	it('preserves source-free content as plain text, never interpreting markup as instructions', () => {
		const snapshot = createPublicSnapshot(createExampleProject());
		snapshot.nodes[0].label = '<script>alert("quoted text")</script>';
		const loaded = validatePublicSnapshot(snapshot);
		expect(loaded.nodes[0].label).toBe(snapshot.nodes[0].label);
		expect(snapshotForDisplay(loaded).nodes[0].label).toBe(snapshot.nodes[0].label);
	});
});
