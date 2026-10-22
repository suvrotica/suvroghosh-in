import { describe, expect, it } from 'vitest';
import geometry from './geometry.json';
import { ARCHIVE } from './fixtures';

describe('committed museum geometry hydration contract', () => {
	it('gives every actual generated SVG part a unique each-block and owned-ref key', () => {
		const ids = geometry.parts.map((part) => part.id);
		expect(ids.length).toBe(geometry.metadata.count);
		expect(new Set(ids).size).toBe(ids.length);
	});
	it('keeps each drawer floor distinct from its specimen and retains inspectable trouble spots', () => {
		for (const record of ARCHIVE.specimens) {
			expect(
				geometry.parts.filter((part) => part.id === `${record.illustration}.bottom`)
			).toHaveLength(1);
			expect(
				geometry.parts.some(
					(part) => part.piece === record.illustration && part.part === record.partId
				)
			).toBe(true);
		}
		expect(geometry.parts.filter((part) => part.id === 'planter.object-bottom')).toHaveLength(1);
	});
});
