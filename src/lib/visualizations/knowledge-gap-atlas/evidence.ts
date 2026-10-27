import type { EvidenceRef } from './types';

/** Choose distinct reading locations, alternating sources before adding more from one source. */
export function selectEvidencePassages(
	refs: EvidenceRef[],
	limit = 6,
	context = 160
): EvidenceRef[] {
	const groups = new Map<string, EvidenceRef[]>();
	for (const ref of refs) {
		const group = groups.get(ref.sourceId) ?? [];
		if (!group.some((other) => other.start === ref.start && other.end === ref.end)) group.push(ref);
		groups.set(ref.sourceId, group);
	}
	const selected: EvidenceRef[] = [];
	const queues = [...groups.values()];
	while (selected.length < limit && queues.some((queue) => queue.length)) {
		for (const queue of queues) {
			let next: EvidenceRef | undefined;
			while (queue.length && !next) {
				const candidate = queue.shift()!;
				const overlaps = selected.some(
					(other) =>
						other.sourceId === candidate.sourceId &&
						candidate.start < other.end + context &&
						candidate.end + context > other.start
				);
				if (!overlaps) next = candidate;
			}
			if (next) selected.push(next);
			if (selected.length >= limit) break;
		}
	}
	return selected;
}
