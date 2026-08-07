import { describe, expect, it } from 'vitest';
import { ATLAS_ANNOUNCEMENT_MILESTONES, nextAtlasAnnouncementMilestone } from './atlas-progress';

describe('morphospace atlas progress announcements', () => {
	it('announces only quarter milestones while visual progress remains continuous', () => {
		let last = 0;
		const announcements: number[] = [];
		for (let percent = 0; percent <= 99; percent += 1) {
			const milestone = nextAtlasAnnouncementMilestone(percent / 100, last);
			if (milestone === null) continue;
			announcements.push(milestone);
			last = milestone;
		}
		expect(announcements).toEqual(ATLAS_ANNOUNCEMENT_MILESTONES);
	});

	it('coalesces skipped progress and ignores invalid or repeated values', () => {
		expect(nextAtlasAnnouncementMilestone(Number.NaN)).toBeNull();
		expect(nextAtlasAnnouncementMilestone(0.24)).toBeNull();
		expect(nextAtlasAnnouncementMilestone(0.8)).toBe(75);
		expect(nextAtlasAnnouncementMilestone(0.8, 75)).toBeNull();
		expect(nextAtlasAnnouncementMilestone(2, 50)).toBe(75);
	});
});
