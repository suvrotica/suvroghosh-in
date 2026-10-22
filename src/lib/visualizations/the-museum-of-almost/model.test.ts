import { describe, expect, it } from 'vitest';
import { ARCHIVE } from './fixtures';
import {
	CLOSED_SELECTION,
	collectionLabel,
	collectionTally,
	decodeSelection,
	encodeSelection,
	formatCost,
	illustrationForSpecimen,
	normaliseSelection,
	selectSpecimen,
	validateArchive,
	type Archive
} from './model';

function fixture(): Archive {
	return structuredClone(ARCHIVE);
}
describe('the fictional museum archive', () => {
	it('derives the exact default tally from record status and outcomes', () => {
		expect(collectionTally(ARCHIVE)).toEqual({
			total: 4,
			demonstration: 4,
			verified: 0,
			testedReuse: 1,
			untestedPossibilities: 1,
			closedWithoutReuse: 1,
			unresolvedWithoutReuse: 1,
			withoutDemonstratedReuse: 2
		});
	});
	it('derives mixed verified/demonstration counts without rebranding fictional records', () => {
		const mixed = fixture();
		for (const index of [1, 2]) {
			Object.assign(mixed.specimens[index], {
				contentStatus: 'verified',
				provenance: [
					{
						id: 'public-record',
						summary: 'Public source test fixture',
						permission: 'public',
						source: 'https://example.invalid/public-record'
					}
				]
			});
			for (const evidence of mixed.specimens[index].evidence)
				Object.assign(evidence, { status: 'documented', provenanceIds: ['public-record'] });
		}
		expect(() => validateArchive(mixed)).not.toThrow();
		expect(collectionTally(mixed)).toEqual({
			total: 4,
			demonstration: 2,
			verified: 2,
			testedReuse: 1,
			untestedPossibilities: 1,
			closedWithoutReuse: 1,
			unresolvedWithoutReuse: 1,
			withoutDemonstratedReuse: 2
		});
		expect(collectionLabel(mixed)).toContain('Mixed collection');
	});
	it('binds a replacement stable record ID to its existing illustration slot', () => {
		const replacement = fixture();
		Object.assign(replacement.specimens[1], { id: 'my-pocket-recorder' });
		expect(() => validateArchive(replacement)).not.toThrow();
		const selection = selectSpecimen(replacement, 'my-pocket-recorder');
		expect(selection.selectedSpecimenId).toBe('my-pocket-recorder');
		expect(illustrationForSpecimen(replacement, selection.selectedSpecimenId)).toBe('recorder');
		expect(illustrationForSpecimen(replacement, 'unknown')).toBeNull();
	});
	it('rejects over-capacity, duplicate illustration slots and incompatible trouble-spot bindings', () => {
		const over = fixture();
		Object.assign(over, {
			specimens: [...over.specimens, { ...over.specimens[1], id: 'extra-recorder' }]
		});
		const duplicate = fixture();
		Object.assign(duplicate.specimens[1], { illustration: 'lamp', partId: 'lamp-connector' });
		const wrongPart = fixture();
		Object.assign(wrongPart.specimens[1], { partId: 'lamp-connector' });
		for (const archive of [over, duplicate, wrongPart])
			expect(() => validateArchive(archive)).toThrow();
	});
	it('retains four different endings and one tested onward journey', () => {
		expect(ARCHIVE.specimens.map((record) => record.outcome)).toEqual([
			'tested-reuse',
			'untested',
			'closed',
			'unresolved'
		]);
		expect(
			ARCHIVE.specimens
				.flatMap((record) => record.onwardLinks)
				.filter((link) => link.status === 'tested')
		).toHaveLength(1);
		expect(ARCHIVE.specimens.every((record) => record.contentStatus === 'demonstration')).toBe(
			true
		);
		expect(collectionLabel(ARCHIVE)).toContain('fictional');
	});
	it('keeps missing costs unknown, including a relative over-budget decision', () => {
		for (const record of ARCHIVE.specimens)
			for (const kind of ['time', 'money', 'material'] as const)
				expect(formatCost(record, kind)).toBe('Unknown');
		expect(ARCHIVE.specimens[2].decision).toContain('exceeded');
	});
	it('requires evidence, target identity and an exact transferred element', () => {
		for (const patch of [
			{ targetId: 'missing' },
			{ targetId: 'lamp' },
			{ targetId: 'recorder' },
			{ element: '' },
			{ evidenceIds: ['absent'] },
			{ evidenceIds: [] }
		]) {
			const archive = fixture();
			Object.assign(archive.specimens[0].onwardLinks[0], patch);
			expect(() => validateArchive(archive)).toThrow();
		}
	});
	it('cannot turn an observation into proof of a tested improvement', () => {
		const archive = fixture();
		Object.assign(archive.specimens[0].onwardLinks[0], { evidenceIds: ['lamp-assembly'] });
		expect(() => validateArchive(archive)).toThrow('follow-up');
	});
	it('rejects missing evidence, duplicate IDs, invalid costs and invented verification', () => {
		const missing = fixture();
		Object.assign(missing.specimens[0].observations[0], { evidenceIds: ['missing'] });
		const duplicate = fixture();
		Object.assign(duplicate.specimens[1], { id: 'lamp' });
		const badCost = fixture();
		Object.assign(badCost.specimens[2], {
			costs: [{ kind: 'money', value: NaN, unit: 'GBP', provenanceId: 'absent' }]
		});
		const verified = fixture();
		Object.assign(verified.specimens[0], { contentStatus: 'verified' });
		for (const archive of [missing, duplicate, badCost, verified])
			expect(() => validateArchive(archive)).toThrow();
		expect(() => validateArchive(null as unknown as Archive)).toThrow();
	});
	it('refuses cycles through specimen targets and private verified provenance', () => {
		const cycle = fixture();
		Object.assign(cycle.specimens[0].onwardLinks[0], { targetId: 'recorder' });
		expect(() => validateArchive(cycle)).toThrow();
		const privateRecord = fixture();
		Object.assign(privateRecord.specimens[0], {
			contentStatus: 'verified',
			provenance: [{ id: 'private', summary: 'Private notes', permission: 'private' }]
		});
		expect(() => validateArchive(privateRecord)).toThrow();
	});
	it('labels a mixed collection without presenting the fictional records as verified', () => {
		const mixed = fixture();
		Object.assign(mixed.specimens[0], { contentStatus: 'verified' });
		expect(collectionLabel(mixed)).toContain('Mixed');
		expect(collectionLabel(mixed)).toContain('fictional');
	});
	it('requires an explicit public source for each documented evidence record', () => {
		const archive = fixture();
		const provenance = [
			{
				id: 'public-source',
				summary: 'Test source fixture',
				permission: 'public',
				source: 'https://example.invalid/record'
			}
		];
		Object.assign(archive.specimens[0], { contentStatus: 'verified', provenance });
		Object.assign(archive.targets[0], { contentStatus: 'verified', provenance });
		for (const evidence of archive.specimens[0].evidence)
			Object.assign(evidence, { status: 'documented', provenanceIds: [] });
		expect(() => validateArchive(archive)).toThrow('unsourced');
		for (const evidence of archive.specimens[0].evidence)
			Object.assign(evidence, { provenanceIds: ['public-source'] });
		expect(() => validateArchive(archive)).not.toThrow();
		Object.assign(archive.specimens[0].evidence[0], {
			provenanceIds: ['unrelated-missing-source']
		});
		expect(() => validateArchive(archive)).toThrow('source reference');
	});
	it('rejects private or unlocatable source material even in a demonstration record', () => {
		for (const source of [
			{
				id: 'private',
				summary: 'Private material',
				permission: 'private',
				source: 'https://example.invalid/private'
			},
			{ id: 'missing', summary: 'A summary without a source', permission: 'public', source: '' },
			{
				id: 'traversal',
				summary: 'Invalid repository path',
				permission: 'public',
				source: 'repo:../secret'
			}
		]) {
			const archive = fixture();
			Object.assign(archive.specimens[0], { provenance: [source] });
			expect(() => validateArchive(archive)).toThrow();
		}
	});
	it('rejects absent arrays and malformed authoring records explicitly', () => {
		for (const field of [
			'observations',
			'interpretations',
			'alternatives',
			'unknowns',
			'evidence',
			'costs',
			'onwardLinks',
			'provenance'
		]) {
			const archive = fixture();
			Object.assign(archive.specimens[0], { [field]: undefined });
			expect(() => validateArchive(archive)).toThrow();
		}
		const archive = fixture();
		Object.assign(archive.specimens[0], { evidence: [null] });
		expect(() => validateArchive(archive)).toThrow();
	});
});

describe('mount-local selection and bounded replay', () => {
	it('resets incompatible selections immediately when switching drawers', () => {
		const lamp = normaliseSelection(ARCHIVE, {
			selectedSpecimenId: 'lamp',
			activeView: 'aftermath',
			selectedComparisonId: 'lamp-keyed-transfer'
		});
		expect(lamp.selectedComparisonId).toBe('lamp-keyed-transfer');
		expect(selectSpecimen(ARCHIVE, 'recorder')).toEqual({
			...CLOSED_SELECTION,
			selectedSpecimenId: 'recorder'
		});
		expect(
			normaliseSelection(ARCHIVE, { ...lamp, selectedSpecimenId: 'recorder' }).selectedComparisonId
		).toBeNull();
	});
	it('does not retain another drawer’s part, evidence claim or comparison', () => {
		expect(
			normaliseSelection(ARCHIVE, {
				selectedSpecimenId: 'recorder',
				selectedPartId: 'lamp-connector'
			}).selectedPartId
		).toBeNull();
		expect(
			normaliseSelection(ARCHIVE, {
				selectedSpecimenId: 'recorder',
				activeView: 'evidence',
				selectedClaimId: 'lamp-misconnection'
			}).selectedClaimId
		).toBeNull();
		expect(
			normaliseSelection(ARCHIVE, {
				selectedSpecimenId: 'lamp',
				activeView: 'object',
				selectedComparisonId: 'lamp-keyed-transfer'
			}).selectedComparisonId
		).toBeNull();
	});
	it('handles rapid replacement, closing during transition and reset without async content state', () => {
		let state = selectSpecimen(ARCHIVE, 'lamp');
		for (const id of ['page', 'planter', 'recorder', 'lamp']) state = selectSpecimen(ARCHIVE, id);
		expect(state.selectedSpecimenId).toBe('lamp');
		state = selectSpecimen(ARCHIVE, null);
		expect(state).toEqual(CLOSED_SELECTION);
		expect(selectSpecimen(ARCHIVE, 'unknown')).toEqual(CLOSED_SELECTION);
	});
	it.each([
		undefined,
		null,
		'',
		'2.lamp.object',
		'1.missing.evidence',
		'1.lamp.verified',
		'1.lamp.object.more',
		'<script>',
		'x'.repeat(121)
	])('restores a closed safe default for malformed owned state %s', (encoded) => {
		expect(decodeSelection(ARCHIVE, encoded)).toEqual(CLOSED_SELECTION);
	});
	it('round trips an allowlisted record/view without accepting result data', () => {
		const decoded = decodeSelection(ARCHIVE, '1.recorder.aftermath');
		expect(encodeSelection(decoded)).toBe('1.recorder.aftermath');
		expect(ARCHIVE.specimens[1].outcome).toBe('untested');
		expect(decoded.selectedComparisonId).toBeNull();
	});
});
