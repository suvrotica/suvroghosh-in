import { documentBounds } from './geometry';
import type { CanvasObject, NoteDocument, ShapeObject, StrokeObject } from './model';
import { CanvasRenderer, fitViewport, preloadNoteImages } from './renderer';
import { noteDocumentSchema } from './schema';
import { getStrokeOutline, outlineToSvgPath } from './strokes';

const MAX_EXPORT_DIMENSION = 8_192;

function safeFilename(title: string) {
	return (
		title
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^\w\s-]/g, '')
			.trim()
			.replace(/[\s_]+/g, '-')
			.slice(0, 100) || 'handwritten-note'
	);
}

function download(blob: Blob, filename: string) {
	const link = globalThis.document.createElement('a');
	const url = URL.createObjectURL(blob);
	link.href = url;
	link.download = filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function escapeXml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function objectTransform(object: CanvasObject) {
	if (object.rotation === 0) return `translate(${object.x} ${object.y})`;
	return `translate(${object.x + object.width / 2} ${object.y + object.height / 2}) rotate(${object.rotation}) translate(${-object.width / 2} ${-object.height / 2})`;
}

function shapeSvg(object: ShapeObject) {
	const common = `stroke="${escapeXml(object.stroke)}" stroke-width="${object.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="${escapeXml(object.fill ?? 'none')}"`;
	if (object.shape === 'rectangle') {
		return `<rect width="${object.width}" height="${object.height}" ${common}/>`;
	}
	if (object.shape === 'ellipse') {
		return `<ellipse cx="${object.width / 2}" cy="${object.height / 2}" rx="${Math.abs(object.width / 2)}" ry="${Math.abs(object.height / 2)}" ${common}/>`;
	}
	const line = `<line x1="${object.from.x}" y1="${object.from.y}" x2="${object.to.x}" y2="${object.to.y}" ${common}/>`;
	if (object.shape === 'line') return line;
	const angle = Math.atan2(object.to.y - object.from.y, object.to.x - object.from.x);
	const head = Math.min(22, Math.max(10, object.strokeWidth * 4));
	const pointA = `${object.to.x - head * Math.cos(angle - Math.PI / 6)},${object.to.y - head * Math.sin(angle - Math.PI / 6)}`;
	const pointB = `${object.to.x},${object.to.y}`;
	const pointC = `${object.to.x - head * Math.cos(angle + Math.PI / 6)},${object.to.y - head * Math.sin(angle + Math.PI / 6)}`;
	return `${line}<polyline points="${pointA} ${pointB} ${pointC}" ${common}/>`;
}

function strokeSvg(object: StrokeObject) {
	const path = outlineToSvgPath(getStrokeOutline(object));
	return `<path d="${path}" fill="${escapeXml(object.style.color)}" fill-opacity="${object.style.opacity}"/>`;
}

function objectSvg(object: CanvasObject) {
	let body = '';
	switch (object.type) {
		case 'stroke':
			body = strokeSvg(object);
			break;
		case 'shape':
			body = shapeSvg(object);
			break;
		case 'text':
			body = `<foreignObject width="${object.width}" height="${object.height}"><div xmlns="http://www.w3.org/1999/xhtml" style="color:${escapeXml(object.color)};font:${object.fontSize}px sans-serif;white-space:pre-wrap;overflow-wrap:anywhere">${escapeXml(object.text)}</div></foreignObject>`;
			break;
		case 'sticky':
			body = `<rect width="${object.width}" height="${object.height}" fill="${escapeXml(object.color)}"/><foreignObject x="16" y="16" width="${Math.max(1, object.width - 32)}" height="${Math.max(1, object.height - 32)}"><div xmlns="http://www.w3.org/1999/xhtml" style="color:${escapeXml(object.textColor)};font:${object.fontSize}px serif;white-space:pre-wrap;overflow-wrap:anywhere">${escapeXml(object.text)}</div></foreignObject>`;
			break;
		case 'image':
			body = `<image href="${escapeXml(object.src)}" width="${object.width}" height="${object.height}" aria-label="${escapeXml(object.alt)}"/>`;
			break;
		case 'tile':
			body = `<rect width="${object.width}" height="${object.height}" rx="12" fill="${escapeXml(object.color)}" stroke="${escapeXml(object.borderColor)}"/><text x="18" y="24" fill="#6b6255" font-family="sans-serif" font-size="12">${escapeXml(object.title)}</text>`;
			break;
	}
	return `<g transform="${objectTransform(object)}" opacity="${object.opacity}">${body}</g>`;
}

export function serializeEditableNote(note: NoteDocument) {
	return JSON.stringify(
		{
			format: 'suvroghosh-ink-note',
			formatVersion: 1,
			exportedAt: new Date().toISOString(),
			document: note
		},
		null,
		2
	);
}

export function downloadEditableSource(note: NoteDocument) {
	download(
		new Blob([serializeEditableNote(note)], { type: 'application/json' }),
		`${safeFilename(note.title)}.ink.json`
	);
}

export function parseEditableSource(source: string): NoteDocument {
	const parsed = JSON.parse(source) as {
		format?: string;
		formatVersion?: number;
		document?: unknown;
	};
	if (parsed.format !== 'suvroghosh-ink-note' || !parsed.document) {
		throw new Error('This file is not a SuvroGhosh handwritten-note export.');
	}
	if (parsed.formatVersion !== 1) {
		throw new Error('This handwritten-note export version is not supported.');
	}
	const result = noteDocumentSchema.safeParse(parsed.document);
	if (!result.success) {
		throw new Error('This handwritten-note export is invalid or exceeds the safe import limits.');
	}
	return result.data;
}

export function toSvg(note: NoteDocument) {
	const bounds = documentBounds(note, 32);
	const width = Math.max(1, bounds.maxX - bounds.minX);
	const height = Math.max(1, bounds.maxY - bounds.minY);
	const objects = note.objects
		.filter((object) => !object.hidden)
		.sort((left, right) => left.zIndex - right.zIndex)
		.map(objectSvg)
		.join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${bounds.minX} ${bounds.minY} ${width} ${height}" role="img" aria-label="${escapeXml(note.title)}"><rect x="${bounds.minX}" y="${bounds.minY}" width="${width}" height="${height}" fill="${escapeXml(note.backgroundColor)}"/>${objects}</svg>`;
}

export function downloadSvg(note: NoteDocument) {
	download(new Blob([toSvg(note)], { type: 'image/svg+xml' }), `${safeFilename(note.title)}.svg`);
}

export async function renderExportCanvas(note: NoteDocument, scale = 2) {
	await preloadNoteImages(note);
	const bounds = documentBounds(note, 48);
	const rawWidth = Math.max(320, bounds.maxX - bounds.minX);
	const rawHeight = Math.max(240, bounds.maxY - bounds.minY);
	const safeScale = Math.min(
		scale,
		MAX_EXPORT_DIMENSION / rawWidth,
		MAX_EXPORT_DIMENSION / rawHeight
	);
	const width = Math.max(1, Math.round(rawWidth * safeScale));
	const height = Math.max(1, Math.round(rawHeight * safeScale));
	const canvas = globalThis.document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas export is not supported in this browser.');
	const renderer = new CanvasRenderer();
	const viewport = fitViewport(note, width, height, 0);
	renderer.render(context, note, viewport, {
		width,
		height,
		devicePixelRatio: 1,
		readOnly: true
	});
	await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	return canvas;
}

export async function downloadPng(note: NoteDocument) {
	const canvas = await renderExportCanvas(note);
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	if (!blob) throw new Error('The browser could not create the PNG file.');
	download(blob, `${safeFilename(note.title)}.png`);
}

export async function downloadPdf(note: NoteDocument) {
	const canvas = await renderExportCanvas(note, 1.5);
	const { jsPDF } = await import('jspdf');
	const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
	const pdf = new jsPDF({
		orientation,
		unit: 'px',
		format: [canvas.width, canvas.height],
		hotfixes: ['px_scaling'],
		compress: true
	});
	pdf.addImage(canvas, 'PNG', 0, 0, canvas.width, canvas.height, undefined, 'FAST');
	pdf.save(`${safeFilename(note.title)}.pdf`);
}
