export const ATLAS_ANNOUNCEMENT_MILESTONES = [25, 50, 75] as const;

/**
 * Returns only the coarsest newly crossed milestone. Visual progress may update
 * continuously; this deliberately bounds assistive-technology announcements.
 */
export function nextAtlasAnnouncementMilestone(
	progress: number,
	lastAnnounced = 0
): (typeof ATLAS_ANNOUNCEMENT_MILESTONES)[number] | null {
	if (!Number.isFinite(progress)) return null;
	const percent = Math.max(0, Math.min(100, progress * 100));
	let crossed: (typeof ATLAS_ANNOUNCEMENT_MILESTONES)[number] | null = null;
	for (const milestone of ATLAS_ANNOUNCEMENT_MILESTONES) {
		if (milestone > lastAnnounced && milestone <= percent) crossed = milestone;
	}
	return crossed;
}
