import { makeSurfaceText } from '../core/surface-text';
import type { HedgePair } from '../core/types';

export const HEDGE_PAIRS_EN: readonly HedgePair[] = Object.freeze([
	{
		id: 'hedge.choice-worry',
		coreId: 'choice-worry',
		semanticFamilyId: 'deliberation-spontaneity.wrong-choice',
		axis: 'deliberation-spontaneity',
		pole: 'deliberation',
		plain: makeSurfaceText('You worry about making the wrong choice.'),
		hedged: makeSurfaceText('At times, you worry about making the wrong choice.'),
		hedge: 'At times, '
	},
	{
		id: 'hedge.social-quiet',
		coreId: 'social-quiet',
		semanticFamilyId: 'company-solitude.social-quiet',
		axis: 'company-solitude',
		pole: 'solitude',
		plain: makeSurfaceText('You need quiet after a busy social day.'),
		hedged: makeSurfaceText('At times, you need quiet after a busy social day.'),
		hedge: 'At times, '
	},
	{
		id: 'hedge.rethink-choice',
		coreId: 'rethink-choice',
		semanticFamilyId: 'confidence-doubt.rethink-choice',
		axis: 'confidence-doubt',
		pole: 'doubt',
		plain: makeSurfaceText('You rethink choices that felt clear the day before.'),
		hedged: makeSurfaceText('At times, you rethink choices that felt clear the day before.'),
		hedge: 'At times, '
	}
]);

export function getHedgePair(id = 'hedge.choice-worry'): HedgePair {
	const pair = HEDGE_PAIRS_EN.find((candidate) => candidate.id === id);
	if (!pair) throw new RangeError(`Unknown Barnum hedge pair: ${id}`);
	return pair;
}
