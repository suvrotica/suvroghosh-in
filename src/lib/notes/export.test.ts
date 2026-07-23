import { describe, expect, it } from 'vitest';
import { parseEditableSource, serializeEditableNote, toSvg } from './export';
import { createEmptyDocument, type TextObject } from './model';

const timestamp = '2026-07-23T12:00:00.000Z';

function textObject(): TextObject {
	return {
		id: 'text-export',
		type: 'text',
		x: 0,
		y: 0,
		width: 240,
		height: 80,
		rotation: 0,
		opacity: 1,
		locked: false,
		hidden: false,
		zIndex: 1,
		createdAt: timestamp,
		updatedAt: timestamp,
		text: '<script>alert("no")</script> & notes',
		color: '#222222',
		fontSize: 18,
		fontFamily: 'serif',
		align: 'left'
	};
}

describe('editable and SVG exports', () => {
	it('round-trips the editable versioned format', () => {
		const note = createEmptyDocument('Export', 'note-export');
		note.objects = [textObject()];
		expect(parseEditableSource(serializeEditableNote(note))).toEqual(note);
	});

	it('rejects unsupported or malformed editable imports', () => {
		const note = createEmptyDocument('Export', 'note-export');
		expect(() =>
			parseEditableSource(
				JSON.stringify({ format: 'suvroghosh-ink-note', formatVersion: 2, document: note })
			)
		).toThrow(/version is not supported/);
		expect(() =>
			parseEditableSource(
				JSON.stringify({
					format: 'suvroghosh-ink-note',
					formatVersion: 1,
					document: { ...note, backgroundColor: 'url(javascript:alert(1))' }
				})
			)
		).toThrow(/invalid/);
	});

	it('escapes user text in SVG output', () => {
		const note = createEmptyDocument('SVG <title>', 'note-svg');
		note.objects = [textObject()];
		const svg = toSvg(note);
		expect(svg).not.toContain('<script>');
		expect(svg).toContain('&lt;script&gt;');
		expect(svg).toContain('SVG &lt;title&gt;');
	});
});
