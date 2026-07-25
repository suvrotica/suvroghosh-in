export interface RunStats {
	forwardDistance: number;
	retreatDistance: number;
	destinationDistance: number;
	elapsedMs: number;
	won: boolean;
	finalMorale: number;
	nearMisses: number;
	narrowGaps: number;
	usefulSnacks: number;
	collisions: number;
	recklessDashes: number;
	potholesEntered: number;
	dogsAwakened: number;
	cowsOffended: number;
	collisionFreeSections: number;
}

export interface ScoreBreakdown {
	progress: number;
	nearMisses: number;
	morale: number;
	time: number;
	narrowGaps: number;
	strategicFood: number;
	cleanSections: number;
	victory: number;
	retreatPenalty: number;
	collisionPenalty: number;
	recklessDashPenalty: number;
	potholePenalty: number;
	dogPenalty: number;
	cowPenalty: number;
}

export interface ScoreResult {
	total: number;
	breakdown: Readonly<ScoreBreakdown>;
}

export const EMPTY_RUN_STATS: Readonly<RunStats> = {
	forwardDistance: 0,
	retreatDistance: 0,
	destinationDistance: 1_200,
	elapsedMs: 0,
	won: false,
	finalMorale: 100,
	nearMisses: 0,
	narrowGaps: 0,
	usefulSnacks: 0,
	collisions: 0,
	recklessDashes: 0,
	potholesEntered: 0,
	dogsAwakened: 0,
	cowsOffended: 0,
	collisionFreeSections: 0
};

function nonNegative(value: number): number {
	return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function count(value: number): number {
	return Math.floor(nonNegative(value));
}

function round(value: number): number {
	return Math.round(Number.isFinite(value) ? value : 0);
}

export function calculateScore(input: RunStats): ScoreResult {
	const destinationDistance = Math.max(1, nonNegative(input.destinationDistance));
	const forwardDistance = nonNegative(input.forwardDistance);
	const completion = Math.min(1, forwardDistance / destinationDistance);
	const elapsedMs = nonNegative(input.elapsedMs);
	const morale = Math.min(100, nonNegative(input.finalMorale));

	const breakdown: ScoreBreakdown = {
		progress: round(completion * 4_000),
		nearMisses: count(input.nearMisses) * 90,
		morale: round(morale * 8 * completion),
		time:
			input.won && completion >= 1
				? round(Math.max(0, 1_800 - Math.max(0, elapsedMs - 150_000) / 100))
				: 0,
		narrowGaps: count(input.narrowGaps) * 135,
		strategicFood: Math.min(8, count(input.usefulSnacks)) * 80,
		cleanSections: count(input.collisionFreeSections) * 260,
		victory: input.won && completion >= 1 ? 2_000 : 0,
		retreatPenalty: -round(nonNegative(input.retreatDistance) * 3),
		collisionPenalty: -count(input.collisions) * 240,
		recklessDashPenalty: -count(input.recklessDashes) * 75,
		potholePenalty: -count(input.potholesEntered) * 130,
		dogPenalty: -count(input.dogsAwakened) * 95,
		cowPenalty: -count(input.cowsOffended) * 320
	};

	const total = Math.max(
		0,
		round(Object.values(breakdown).reduce((sum, component) => sum + component, 0))
	);
	return { total, breakdown };
}
