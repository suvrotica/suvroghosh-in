export interface RingSphere {
	x: number;
	y: number;
	z: number;
	radius: number;
}

export interface IntersectionEstimate {
	likely: boolean;
	/** Conservative envelope candidates, not confirmed surface intersections. */
	pairCount: number;
	checkedPairCount: number;
	excludedNeighborRings: number;
	/** True when the bounded broad phase stopped before checking every eligible pair. */
	truncated: boolean;
	firstPair?: [number, number];
}

/**
 * Conservative broad-phase warning only. Adjacent deposition rings are skipped;
 * positive results are "likely", never a proof of a surface intersection.
 */
export function estimateRingIntersections(
	rings: readonly RingSphere[],
	neighborExclusion = 3,
	maximumPairs = 10_000
): IntersectionEstimate {
	const excludedNeighborRings = Math.max(0, Math.floor(neighborExclusion));
	const pairLimit = Math.max(0, Math.floor(maximumPairs));
	const rowCount = Math.max(0, rings.length - excludedNeighborRings - 1);
	const eligiblePairCount = (rowCount * (rowCount + 1)) / 2;
	let pairCount = 0;
	let checked = 0;
	let firstPair: [number, number] | undefined;

	function checkPair(first: number, second: number): void {
		checked += 1;
		const a = rings[first];
		const b = rings[second];
		const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
		if (distance < a.radius + b.radius) {
			pairCount += 1;
			firstPair ??= [first, second];
		}
	}

	if (eligiblePairCount <= pairLimit) {
		for (let first = 0; first < rowCount; first += 1) {
			for (let second = first + excludedNeighborRings + 1; second < rings.length; second += 1) {
				checkPair(first, second);
			}
		}
	} else {
		// A deterministic row/column grid spans juvenile, middle, and adult pairs
		// without allocating or walking every O(n²) pair. Small budgets sample one
		// pair in each selected row; larger budgets distribute work across √(limit)
		// rows and the full second-ring range of each row.
		const sampledRows = Math.min(
			rowCount,
			pairLimit <= 64 ? pairLimit : Math.max(1, Math.floor(Math.sqrt(pairLimit)))
		);
		for (let rowSample = 0; rowSample < sampledRows; rowSample += 1) {
			const first =
				sampledRows === 1
					? Math.floor((rowCount - 1) / 2)
					: Math.round((rowSample * (rowCount - 1)) / (sampledRows - 1));
			const rowLength = rowCount - first;
			const rowBudget =
				Math.floor(pairLimit / sampledRows) + (rowSample < pairLimit % sampledRows ? 1 : 0);
			const samplesInRow = Math.min(rowLength, rowBudget);
			for (let columnSample = 0; columnSample < samplesInRow; columnSample += 1) {
				const offset =
					samplesInRow === 1
						? Math.floor((rowLength - 1) / 2)
						: Math.round((columnSample * (rowLength - 1)) / (samplesInRow - 1));
				checkPair(first, first + excludedNeighborRings + 1 + offset);
			}
		}
	}
	return {
		likely: pairCount > 0,
		pairCount,
		checkedPairCount: checked,
		excludedNeighborRings,
		truncated: checked < eligiblePairCount,
		firstPair
	};
}
