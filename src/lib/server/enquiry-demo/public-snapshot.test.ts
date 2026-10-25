import { describe, expect, test } from 'vitest';
import { EnquiryStore, MAX_SNAPSHOT_BYTES } from './store';

const clock = () => Date.parse('2026-10-26T09:00:00Z');

describe('bounded durable snapshot import', () => {
	test('round-trips all committed records and continues reference numbering', () => {
		const first = new EnquiryStore(':memory:', clock);
		const second = new EnquiryStore(':memory:', clock);
		try {
			first.seed();
			first.sandbox({ advanceMinutes: 17, mode: 'always-fail' });
			first.update('EOS-00001', { note: 'A fictional note that must persist.' }, 'Demo staff');
			const snapshot = first.exportSnapshot();
			second.importSnapshot(snapshot);
			expect(second.list()).toEqual(first.list());
			expect(second.detail('EOS-00001')).toEqual(first.detail('EOS-00001'));
			expect(second.settings()).toEqual(first.settings());
			const saved = second.submit({
				submissionId: 'snapshot-next-submission',
				name: 'Example Visitor',
				email: 'next@example.com',
				city: 'Dubai',
				type: 'quotation',
				description: 'Please quote for our fictional office maintenance visit.'
			});
			expect(saved.enquiry.ref).toBe('EOS-00031');
		} finally {
			first.close();
			second.close();
		}
	});

	test('unrecognized table names, columns and SQL-looking payloads cannot alter the schema or committed state', () => {
		const store = new EnquiryStore(':memory:', clock);
		try {
			store.seed();
			const original = store.exportSnapshot();
			const badTable = structuredClone(original) as unknown as { tables: Record<string, unknown> };
			badTable.tables['demo_staff; DROP TABLE demo_enquiries; --'] = [];
			const badColumn = structuredClone(original);
			Object.assign(badColumn.tables.demo_staff[0], {
				'name); DROP TABLE demo_enquiries; --': 'malicious'
			});
			const badRelationship = structuredClone(original);
			badRelationship.tables.demo_enquiries[0].owner_id = 'missing-staff';
			for (const invalid of [
				null,
				[],
				{},
				{ ...original, schemaVersion: 2 },
				badTable,
				badColumn,
				badRelationship
			]) {
				expect(() => store.importSnapshot(invalid)).toThrow();
				expect(store.exportSnapshot()).toEqual(original);
			}
		} finally {
			store.close();
		}
	});

	test('an oversized snapshot fails before replacing any existing visitor records', () => {
		const store = new EnquiryStore(':memory:', clock);
		try {
			store.seed();
			const before = store.exportSnapshot();
			const oversized = structuredClone(before);
			oversized.tables.demo_enquiries[0].description = 'x'.repeat(MAX_SNAPSHOT_BYTES + 1);
			expect(() => store.importSnapshot(oversized)).toThrow();
			expect(store.exportSnapshot()).toEqual(before);
		} finally {
			store.close();
		}
	});
});
