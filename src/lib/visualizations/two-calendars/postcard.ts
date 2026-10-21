import {
	eventsForYear,
	formatHistoricalDate,
	getDateBounds,
	relationshipLabel
} from './chronology';
import type { HistoricalConnection, HistoricalEvent, HistoricalSource } from './types';

export interface PostcardInput {
	year: number;
	left: HistoricalEvent | null;
	right: HistoricalEvent | null;
	connection: HistoricalConnection | null;
	sources: readonly HistoricalSource[];
	url: string;
}

export const POSTCARD_WIDTH = 1600;
export const POSTCARD_HEIGHT = 1000;

/** Keep complete authored sentences; shortening must not turn a qualified comparison into equivalence. */
export function postcardExcerpt(
	value: string,
	budget = 145,
	preserveQualification = false
): string {
	const sentences: string[] = [];
	let pending = '';
	for (const { segment } of new Intl.Segmenter('en', { granularity: 'sentence' }).segment(value)) {
		pending = [pending, segment.trim()].filter(Boolean).join(' ');
		// Sentence segmentation alone treats A. Philip Randolph and Brown v. Board as stops.
		if (/(?:\b[A-Za-z]|\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr))\.$/.test(pending)) continue;
		if (pending) sentences.push(pending);
		pending = '';
	}
	if (pending) sentences.push(pending);
	if (!sentences.length) return '';
	const firstTwo = sentences.slice(0, 2).join(' ');
	if (firstTwo.length <= budget) return firstTwo;
	if (preserveQualification) {
		const qualification = sentences.find((sentence) =>
			/\b(?:not equivalent|not a causal|neither|not merely|no claimed|without making)\b/i.test(
				sentence
			)
		);
		if (qualification && qualification.length <= budget) {
			const withOpening = `${sentences[0]} ${qualification}`;
			return qualification === sentences[0] || withOpening.length > budget
				? qualification
				: withOpening;
		}
	}
	return sentences[0];
}

function xml(value: unknown): string {
	return String(value).replace(
		/[&<>"']/g,
		(character) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&apos;'
			})[character]!
	);
}

function safeUrl(value: string): string {
	try {
		const url = new URL(value);
		return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '#';
	} catch {
		return '#';
	}
}

/** Conservative character wrapping keeps the standalone SVG independent of web fonts or a DOM. */
export function wrapPostcardText(value: string, columns: number, maxLines = 20): string[] {
	const words = value.trim().split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		if (line && `${line} ${word}`.length > columns) {
			lines.push(line);
			line = word;
		} else line = line ? `${line} ${word}` : word;
	}
	if (line) lines.push(line);
	if (lines.length <= maxLines) return lines;
	const selected = lines.slice(0, maxLines);
	selected[maxLines - 1] = `${selected[maxLines - 1].replace(/[\s,;:.]+$/, '')}…`;
	return selected;
}

function textLines(
	value: string,
	x: number,
	y: number,
	columns: number,
	lineHeight: number,
	maxLines: number
): string {
	return wrapPostcardText(value, columns, maxLines)
		.map((line, index) => `<tspan x="${x}" y="${y + index * lineHeight}">${xml(line)}</tspan>`)
		.join('');
}

function postcardSources(input: PostcardInput): HistoricalSource[] {
	const ids = new Set([
		...(input.left?.sourceIds ?? []),
		...(input.right?.sourceIds ?? []),
		...(input.connection?.sourceIds ?? [])
	]);
	return input.sources.filter((source) => ids.has(source.id));
}

function eventColumn(
	event: HistoricalEvent | null,
	x: number,
	colour: string,
	place: string
): string {
	const date = event ? formatHistoricalDate(event.date) : 'No record selected for this year';
	const observation = postcardExcerpt(
		event?.summary ??
			'No event has been substituted from a neighbouring date. Explore another year to continue the comparison.'
	);
	const longer = wrapPostcardText(observation, 50).length > 3;
	return `<g fill="${colour}">
		<text x="${x}" y="280" font-family="Arial, sans-serif" font-size="19" letter-spacing="6">${xml(place.toUpperCase())}</text>
		<text x="${x}" y="492" font-family="Arial, sans-serif" font-size="20">${textLines(date, x, 492, 52, 25, 2)}</text>
		<text x="${x}" y="552" font-size="39">${textLines(event?.title ?? 'An honest space in the record', x, 552, 31, 45, 2)}</text>
		<text x="${x}" y="657" font-family="Arial, sans-serif" font-size="16" letter-spacing="1">${textLines(event?.scope ?? 'This is a curated selection.', x, 657, 60, 21, 1)}</text>
		<text x="${x}" y="698" fill="#4e514c" font-family="Arial, sans-serif" font-size="${longer ? 22 : 23}">${textLines(observation, x, 698, longer ? 55 : 50, longer ? 27 : 31, longer ? 4 : 3)}</text>
	</g>`;
}

function calendarGrid(x: number, colour: string): string {
	let result = '';
	for (let i = 0; i < 13; i++)
		result += `<path d="M${x + i * 49} 315v115" stroke="${colour}" stroke-opacity="${i % 3 ? '.13' : '.32'}"/>`;
	for (let i = 0; i < 5; i++)
		result += `<path d="M${x} ${315 + i * 28.75}h588" stroke="${colour}" stroke-opacity=".15"/>`;
	for (let i = 0; i < 12; i++)
		result += `<text x="${x + i * 49 + 24}" y="451" text-anchor="middle" fill="${colour}" font-family="Arial, sans-serif" font-size="11">${['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][i]}</text>`;
	return result;
}

function eventMark(
	event: HistoricalEvent | null,
	x: number,
	year: number,
	colour: string
): { svg: string; anchor: number } {
	if (!event) return { svg: '', anchor: x + 294 };
	const bounds = getDateBounds(event.date);
	// If an editorial comparison crosses years, each miniature represents the record's own year.
	const localYear = eventsForYear([event], year).length
		? year
		: new Date(bounds.start).getUTCFullYear();
	const startOfYear = Date.UTC(localYear, 0, 1);
	const endOfYear = Date.UTC(localYear + 1, 0, 1);
	const position = (epoch: number) =>
		x + Math.max(0, Math.min(1, (epoch - startOfYear) / (endOfYear - startOfYear))) * 588;
	const start = position(bounds.start);
	const end = position(bounds.end);
	const anchor = (start + end) / 2;
	const title = xml(
		`${formatHistoricalDate(event.date)} · ${event.date.kind === 'duration' ? 'Documented duration' : event.date.kind === 'uncertain' ? 'Uncertain date window' : `${event.date.precision} precision`}`
	);
	if (event.date.kind === 'duration')
		return {
			anchor,
			svg: `<g><title>${title}</title><rect x="${start}" y="361" width="${Math.max(2, end - start)}" height="22" rx="2" fill="${colour}" fill-opacity=".55"/></g>`
		};
	if (event.date.kind === 'uncertain')
		return {
			anchor,
			svg: `<g><title>${title}</title><rect x="${start}" y="355" width="${Math.max(2, end - start)}" height="34" fill="none" stroke="${colour}" stroke-width="2" stroke-dasharray="3 5"/></g>`
		};
	if (event.date.precision !== 'day')
		return {
			anchor,
			svg: `<g><title>${title}</title><path d="M${start} 358v28M${start} 372H${end}M${end} 358v28" fill="none" stroke="${colour}" stroke-width="2"/><text x="${anchor}" y="340" text-anchor="middle" fill="${colour}" font-family="Arial, sans-serif" font-size="12">${event.date.precision} precision</text></g>`
		};
	return {
		anchor,
		svg: `<g><title>${title}</title><circle cx="${anchor}" cy="372" r="10" fill="#f5f0e3" stroke="${colour}" stroke-width="3"/></g>`
	};
}

function sameSelectedYear(input: PostcardInput): boolean {
	return [input.left, input.right].every(
		(event) => !event || eventsForYear([event], input.year).length > 0
	);
}

function selectionExplanation(input: PostcardInput): string {
	if (!input.left && !input.right)
		return 'No historical records are selected for this year. Gaps reflect the limits of this curated collection.';
	if (!input.left)
		return 'An American record is selected for this year; no Calcutta / India record is selected. The gap reflects the limits of this curated collection.';
	if (!input.right)
		return 'A Calcutta / India record is selected for this year; no American record is selected. The gap reflects the limits of this curated collection.';
	return sameSelectedYear(input)
		? 'Two selections from the same year. Proximity in time does not establish a relationship between events.'
		: 'Two independently selected records have different dates. Their proximity does not establish a relationship between events.';
}

export function postcardCaption(input: PostcardInput): string {
	const complete = Boolean(input.left && input.right);
	const periodDescription =
		!input.left && !input.right
			? 'a gap in the curated selection'
			: !complete
				? 'a partial year selection'
				: sameSelectedYear(input)
					? 'a year in two worlds'
					: 'an editorial comparison across years';
	const observations = [input.left, input.right]
		.filter((event): event is HistoricalEvent => Boolean(event))
		.map(
			(event) =>
				`${event.side === 'calcutta' ? 'Calcutta / India' : 'America'} — ${formatHistoricalDate(event.date)}: ${event.title}.`
		);
	return [
		`Two Calendars, One Life · ${input.year}: ${periodDescription}.`,
		...observations,
		complete && input.connection
			? `${relationshipLabel(input.connection.kind)}: ${input.connection.rationale}`
			: selectionExplanation(input),
		input.url
	].join('\n\n');
}

/** All text, annotations and source links are escaped; no foreignObject or remote font is needed. */
export function renderPostcardSvg(input: PostcardInput): string {
	const sources = postcardSources(input);
	const complete = Boolean(input.left && input.right);
	const relationship =
		complete && input.connection
			? relationshipLabel(input.connection.kind)
			: complete
				? 'A curated year'
				: input.left || input.right
					? 'A partial selection'
					: 'A gap in the selection';
	const explanation =
		complete && input.connection ? input.connection.rationale : selectionExplanation(input);
	const shortExplanation = postcardExcerpt(explanation, 230, true);
	const description = postcardCaption(input);
	const sourceList = sources
		.map((source, index) => `[${index + 1}] ${source.institution}`)
		.join('  ·  ');
	const dash =
		input.connection?.kind === 'thematic'
			? 'stroke-dasharray="8 9"'
			: input.connection?.kind === 'shared-time'
				? 'stroke-dasharray="2 7"'
				: '';
	const metadata = sources
		.map((source) => `${source.institution}: ${source.title} — ${source.url}`)
		.join('\n');
	const leftMark = eventMark(input.left, 104, input.year, '#303852');
	const rightMark = eventMark(input.right, 908, input.year, '#21575b');
	const drawThread = Boolean(input.left && input.right);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTCARD_WIDTH}" height="${POSTCARD_HEIGHT}" viewBox="0 0 ${POSTCARD_WIDTH} ${POSTCARD_HEIGHT}" role="img" aria-labelledby="postcard-title postcard-description">
	<title id="postcard-title">Two Calendars, One Life — ${xml(input.year)}</title>
	<desc id="postcard-description">${xml(description)}\nSources:\n${xml(metadata)}</desc>
	<metadata>${xml(metadata)}</metadata>
	<rect width="1600" height="1000" fill="#f5f0e3"/>
	<path d="M40 40H1560V960H40Z" fill="none" stroke="#253d49" stroke-opacity=".3"/>
	<path d="M55 55H1545V945H55Z" fill="none" stroke="#253d49" stroke-opacity=".12"/>
	<g font-family="Georgia, 'Times New Roman', serif">
		<text x="104" y="105" fill="#9d4233" font-family="Arial, sans-serif" font-size="16" letter-spacing="5">AN ATLAS OF PARALLEL LIVES · 1940–1959</text>
		<text x="100" y="181" fill="#222e37" font-size="66">Two Calendars, One Life</text>
		<text x="104" y="223" fill="#5c615b" font-size="26" font-style="italic">The same years, different worlds.</text>
		<text x="1498" y="182" text-anchor="end" fill="#9d4233" font-size="81">${xml(input.year)}</text>
		<path d="M104 245H1496" stroke="#233c4b" stroke-opacity=".36"/>
		${calendarGrid(104, '#303852')}
		${calendarGrid(908, '#21575b')}
		${drawThread ? `<path d="M${leftMark.anchor} 372C650 372 625 322 800 372S950 422 ${rightMark.anchor} 372" fill="none" stroke="#ac5b3e" stroke-width="3" ${dash}/>` : ''}
		${leftMark.svg}
		${rightMark.svg}
		<rect x="729" y="350" width="142" height="42" fill="#f5f0e3"/>
		<text x="800" y="377" text-anchor="middle" fill="#9d4233" font-size="23" font-style="italic">Meanwhile…</text>
		${eventColumn(input.left, 104, '#303852', 'Calcutta / India')}
		${eventColumn(input.right, 908, '#21575b', 'America')}
		<path d="M104 800H1496" stroke="#233c4b" stroke-opacity=".3"/>
		<text x="104" y="833" fill="#9d4233" font-family="Arial, sans-serif" font-size="14" letter-spacing="3">${xml(relationship.toUpperCase())}</text>
		<text x="104" y="868" fill="#3e4647" font-size="23">${textLines(shortExplanation, 104, 868, 125, 29, 2)}</text>
		<text x="104" y="918" fill="#5e625c" font-family="Arial, sans-serif" font-size="13">${textLines(`Sources: ${sourceList || 'No event selected. See the atlas for the full source record.'}`, 104, 918, 183, 16, 1)}</text>
		<a href="${xml(safeUrl(input.url))}"><text x="104" y="940" fill="#303852" font-family="Arial, sans-serif" font-size="12">${xml(input.url.replace(/^https?:\/\//, ''))}</text></a>
		<text x="1496" y="940" text-anchor="end" fill="#303852" font-family="Arial, sans-serif" font-size="14">SUVRO GHOSH · ${sameSelectedYear(input) ? 'A YEAR IN TWO WORLDS' : 'AN EDITORIAL COMPARISON'}</text>
	</g>
	</svg>`;
}

function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadPostcardSvg(input: PostcardInput): void {
	downloadBlob(
		new Blob([renderPostcardSvg(input)], { type: 'image/svg+xml;charset=utf-8' }),
		`two-calendars-${input.year}.svg`
	);
}

export async function downloadPostcardPng(input: PostcardInput): Promise<void> {
	const svg = renderPostcardSvg(input);
	const image = new Image();
	const loaded = new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () =>
			reject(new Error('The postcard image could not be rendered. Try the SVG download.'));
	});
	image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	await loaded;
	const canvas = document.createElement('canvas');
	canvas.width = POSTCARD_WIDTH;
	canvas.height = POSTCARD_HEIGHT;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('PNG export is unavailable. Try the SVG download.');
	context.fillStyle = '#f5f0e3';
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.drawImage(image, 0, 0);
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	if (!blob) throw new Error('The browser could not create a PNG. Try the SVG download.');
	downloadBlob(blob, `two-calendars-${input.year}.png`);
}
