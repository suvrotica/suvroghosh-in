import { describe, expect, it } from 'vitest';
import { InkEditorState } from './editor-state.svelte';
import { createEmptyDocument } from './model';

describe('InkEditorState writing tiles', () => {
	it('authors into an active tile and moves every member with one shared delta', () => {
		const editor = new InkEditorState(createEmptyDocument('Movable tile', 'note-tile'));
		editor.addTile({ x: 300, y: 240 }, 'Writing tile');
		const tile = editor.document.objects.find((object) => object.type === 'tile');
		expect(tile).toBeDefined();

		editor.addStroke([
			{ x: 120, y: 140, pressure: 0.45, time: 1 },
			{ x: 180, y: 190, pressure: 0.7, time: 2 }
		]);
		const stroke = editor.document.objects.find((object) => object.type === 'stroke');
		expect(stroke?.groupId).toBe(tile?.id);

		editor.selectObject(stroke!.id);
		expect(new Set(editor.selectedIds)).toEqual(new Set([tile!.id, stroke!.id]));
		const before = new Map(
			editor.selectedObjects.map((object) => [object.id, { x: object.x, y: object.y }])
		);
		editor.beginTransform();
		editor.moveSelection(37, -19);
		editor.finishTransform();

		for (const object of editor.selectedObjects) {
			expect(object.x - before.get(object.id)!.x).toBe(37);
			expect(object.y - before.get(object.id)!.y).toBe(-19);
		}
	});

	it('keeps locked tiles atomic and dissolves an unlocked tile when ungrouped', () => {
		const editor = new InkEditorState(createEmptyDocument('Tile lock', 'note-tile-lock'));
		editor.addTile({ x: 300, y: 240 }, 'Writing tile');
		editor.addStroke([
			{ x: 120, y: 140, pressure: 0.5, time: 1 },
			{ x: 160, y: 180, pressure: 0.5, time: 2 }
		]);
		const tile = editor.document.objects.find((object) => object.type === 'tile')!;
		const stroke = editor.document.objects.find((object) => object.type === 'stroke')!;
		editor.selectObject(stroke.id);

		editor.toggleLockSelection();
		editor.deleteSelection();
		expect(editor.document.objects.map((object) => object.id).sort()).toEqual(
			[tile.id, stroke.id].sort()
		);

		editor.toggleLockSelection();
		editor.ungroupSelection();
		expect(editor.document.objects.some((object) => object.id === tile.id)).toBe(false);
		expect(
			editor.document.objects.find((object) => object.id === stroke.id)?.groupId
		).toBeUndefined();
	});

	it('toggles an expanded tile selection atomically', () => {
		const editor = new InkEditorState(createEmptyDocument('Tile selection', 'note-tile-select'));
		editor.addTile({ x: 300, y: 240 }, 'Writing tile');
		editor.addStroke([
			{ x: 120, y: 140, pressure: 0.5, time: 1 },
			{ x: 160, y: 180, pressure: 0.5, time: 2 }
		]);
		const tile = editor.document.objects.find((object) => object.type === 'tile')!;
		const stroke = editor.document.objects.find((object) => object.type === 'stroke')!;

		// A newly authored child is selected alone while the tile remains active.
		expect(editor.selectedIds).toEqual([]);
		editor.select([stroke.id], true);
		expect(new Set(editor.selectedIds)).toEqual(new Set([tile.id, stroke.id]));
		editor.select([stroke.id], true);
		expect(editor.selectedIds).toEqual([]);
	});

	it('rearranges a child inside its tile only in tile-item mode', () => {
		const editor = new InkEditorState(createEmptyDocument('Tile items', 'note-tile-items'));
		editor.addTile({ x: 300, y: 240 }, 'Writing tile');
		editor.addStroke([
			{ x: 120, y: 140, pressure: 0.5, time: 1 },
			{ x: 160, y: 180, pressure: 0.5, time: 2 }
		]);
		const tile = editor.document.objects.find((object) => object.type === 'tile')!;
		const stroke = editor.document.objects.find((object) => object.type === 'stroke')!;
		const tileStart = { x: tile.x, y: tile.y };
		const strokeStart = { x: stroke.x, y: stroke.y };

		editor.editTileContents = true;
		editor.selectObject(stroke.id);
		expect(editor.selectedIds).toEqual([stroke.id]);
		editor.beginTransform();
		editor.moveSelection(18, 27);
		editor.finishTransform();

		const movedTile = editor.document.objects.find((object) => object.id === tile.id)!;
		const movedStroke = editor.document.objects.find((object) => object.id === stroke.id)!;
		expect({ x: movedTile.x, y: movedTile.y }).toEqual(tileStart);
		expect({ x: movedStroke.x, y: movedStroke.y }).toEqual({
			x: strokeStart.x + 18,
			y: strokeStart.y + 27
		});
		expect(movedStroke.groupId).toBe(tile.id);
	});

	it('clears stale selection state after undo', () => {
		const editor = new InkEditorState(createEmptyDocument('Undo selection', 'note-tile-undo'));
		editor.addTile({ x: 300, y: 240 }, 'Writing tile');
		expect(editor.selectedIds).toHaveLength(1);
		editor.undo();
		expect(editor.document.objects).toHaveLength(0);
		expect(editor.selectedIds).toEqual([]);
		expect(editor.activeTileId).toBeNull();
	});
});
