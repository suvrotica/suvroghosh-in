import type { CellCoordinate, GenerationEvent } from '../engine/types';
import type { CityEventOverlay } from './types';

const EMPTY_CELLS: readonly CellCoordinate[] = Object.freeze([]);

export function overlayFromGenerationEvent(
	event: GenerationEvent | null | undefined
): CityEventOverlay {
	if (!event) {
		return { currentCell: null, propagationCells: EMPTY_CELLS, eventKind: null };
	}

	switch (event.type) {
		case 'observe':
		case 'contradiction':
		case 'backtrack':
			return {
				currentCell: event.cell,
				propagationCells: EMPTY_CELLS,
				eventKind: event.type
			};
		case 'propagate':
			return {
				currentCell: null,
				propagationCells: event.changedCells,
				eventKind: event.type
			};
		case 'patch':
			return {
				currentCell: event.patch.cell,
				propagationCells: EMPTY_CELLS,
				eventKind: event.type
			};
		default:
			return { currentCell: null, propagationCells: EMPTY_CELLS, eventKind: event.type };
	}
}
