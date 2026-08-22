import { viewportBounds } from './viewport';
import type { ExplorerState } from './types';

export type PngExportOptions = {
	source: HTMLCanvasElement;
	state: ExplorerState;
	functionLabel: string;
	heightDefinition: string;
	domainLabel?: string;
	viewLegend?: string;
	sheetColourLabel?: string;
	width?: number;
	height?: number;
};

function format(value: number) {
	return Math.abs(value) >= 1e4 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)
		? value.toExponential(2)
		: Number(value.toFixed(3)).toString();
}

export type PngMetadata = {
	functionLabel: string;
	domainLabel: string;
	heightDefinition: string;
	viewLegend?: string;
};

export function pngMetadata(options: PngExportOptions): PngMetadata {
	const bounds = viewportBounds(options.state.viewport);
	return {
		functionLabel: options.functionLabel,
		domainLabel:
			options.domainLabel ??
			`Re ${format(bounds.minRe)}…${format(bounds.maxRe)} · Im ${format(bounds.minIm)}…${format(bounds.maxIm)}`,
		heightDefinition: options.heightDefinition,
		viewLegend: options.viewLegend
	};
}

type TextMeasure = (text: string) => number;

/** Wrap bounded export captions and ellipsize the final line when the allotted lines are full. */
export function wrapPngText(
	text: string,
	maxWidth: number,
	measure: TextMeasure,
	maxLines: number
): string[] {
	if (maxLines <= 0 || maxWidth <= 0) return [];
	let remaining = Array.from(text.replace(/\s+/g, ' ').trim());
	if (remaining.length === 0) return [];
	const lines: string[] = [];

	for (let lineIndex = 0; lineIndex < maxLines && remaining.length > 0; lineIndex += 1) {
		const complete = remaining.join('');
		if (measure(complete) <= maxWidth) {
			lines.push(complete);
			break;
		}

		const finalLine = lineIndex === maxLines - 1;
		let fit = 0;
		for (let index = 1; index <= remaining.length; index += 1) {
			const candidate = `${remaining.slice(0, index).join('')}${finalLine ? '…' : ''}`;
			if (measure(candidate) > maxWidth) break;
			fit = index;
		}
		if (fit === 0) {
			lines.push('…');
			break;
		}

		if (finalLine) {
			lines.push(`${remaining.slice(0, fit).join('').trimEnd()}…`);
			break;
		}

		let breakAt = fit;
		const earliestPreferredBreak = Math.max(1, Math.floor(fit * 0.55));
		for (let index = fit - 1; index >= earliestPreferredBreak; index -= 1) {
			if (/[\s,;:+\-*/=)]/.test(remaining[index])) {
				breakAt = index + 1;
				break;
			}
		}
		const line = remaining.slice(0, breakAt).join('').trimEnd();
		lines.push(line || remaining.slice(0, fit).join(''));
		remaining = remaining.slice(breakAt);
		while (remaining[0] === ' ') remaining.shift();
	}

	return lines;
}

export function renderLaboratoryPng(options: PngExportOptions) {
	const width = Math.max(800, Math.round(options.width ?? 1_600));
	const height = Math.max(560, Math.round(options.height ?? 1_000));
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('The browser could not create the export canvas.');
	context.fillStyle = '#080d17';
	context.fillRect(0, 0, width, height);
	const margin = Math.round(width * 0.035);
	const footerHeight = Math.max(168, Math.round(height * 0.3));
	const availableWidth = width - margin * 2;
	const availableHeight = height - margin * 2 - footerHeight;
	const sourceRatio = options.source.width / Math.max(1, options.source.height);
	let drawWidth = availableWidth;
	let drawHeight = drawWidth / sourceRatio;
	if (drawHeight > availableHeight) {
		drawHeight = availableHeight;
		drawWidth = drawHeight * sourceRatio;
	}
	const drawX = (width - drawWidth) / 2;
	const drawY = margin + (availableHeight - drawHeight) / 2;
	context.drawImage(options.source, drawX, drawY, drawWidth, drawHeight);
	context.strokeStyle = 'rgba(226,232,240,.45)';
	context.lineWidth = 2;
	context.strokeRect(drawX, drawY, drawWidth, drawHeight);

	const metadata = pngMetadata(options);
	const footerY = height - footerHeight;
	context.fillStyle = '#101827';
	context.fillRect(0, footerY, width, footerHeight);
	const legendX = width - margin - Math.round(width * 0.25);
	const legendWidth = Math.round(width * 0.25);
	const textWidth = Math.max(120, legendX - margin - Math.round(width * 0.025) - margin);
	const titleSize = Math.max(14, Math.round(width * 0.018));
	const bodySize = Math.max(10, Math.round(width * 0.011));
	const titleLineHeight = Math.round(titleSize * 1.25);
	const bodyLineHeight = Math.round(bodySize * 1.4);
	let textY = footerY + Math.max(14, Math.round(footerHeight * 0.12));
	context.textBaseline = 'top';
	context.textAlign = 'left';
	context.fillStyle = '#f8fafc';
	context.font = `600 ${titleSize}px system-ui, sans-serif`;
	for (const line of wrapPngText(
		metadata.functionLabel,
		textWidth,
		(value) => context.measureText(value).width,
		2
	)) {
		context.fillText(line, margin, textY, textWidth);
		textY += titleLineHeight;
	}
	textY += Math.round(bodyLineHeight * 0.2);
	context.fillStyle = '#b7c2d5';
	context.font = `500 ${bodySize}px ui-monospace, monospace`;
	const captionGroups: Array<[string | undefined, number]> = [
		[metadata.domainLabel, 2],
		[metadata.heightDefinition, 3],
		[metadata.viewLegend, 1]
	];
	for (const [caption, maxLines] of captionGroups) {
		if (!caption) continue;
		for (const line of wrapPngText(
			caption,
			textWidth,
			(value) => context.measureText(value).width,
			maxLines
		)) {
			context.fillText(line, margin, textY, textWidth);
			textY += bodyLineHeight;
		}
	}

	const legendY = footerY + Math.round(footerHeight * 0.28);
	const legendHeight = Math.round(height * 0.025);
	const gradient = context.createLinearGradient(legendX, 0, legendX + legendWidth, 0);
	for (let step = 0; step <= 12; step += 1) {
		const fraction = step / 12;
		const hue = options.sheetColourLabel ? (0.73 - fraction * 0.36) * 360 : fraction * 360;
		gradient.addColorStop(
			fraction,
			`hsl(${hue} ${options.sheetColourLabel ? 72 : 84}% ${options.sheetColourLabel ? 54 : 60}%)`
		);
	}
	context.fillStyle = gradient;
	context.fillRect(legendX, legendY, legendWidth, legendHeight);
	context.fillStyle = '#dbe5f2';
	context.font = `500 ${Math.max(9, Math.round(width * 0.01))}px system-ui, sans-serif`;
	context.textBaseline = 'alphabetic';
	context.fillText(
		options.sheetColourLabel ? `lower ${options.sheetColourLabel}` : 'phase −π',
		legendX,
		legendY + legendHeight + Math.round(height * 0.025)
	);
	context.textAlign = 'right';
	context.fillText(
		options.sheetColourLabel ? `higher ${options.sheetColourLabel}` : '+π · cyclic',
		legendX + legendWidth,
		legendY + legendHeight + Math.round(height * 0.025)
	);
	context.fillText(
		'suvroghosh.in · complex-function laboratory',
		width - margin,
		footerY + Math.round(footerHeight * 0.84)
	);
	context.textAlign = 'left';
	return canvas;
}

export async function exportLaboratoryPng(options: PngExportOptions) {
	const canvas = renderLaboratoryPng(options);
	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(value) => (value ? resolve(value) : reject(new Error('PNG encoding failed.'))),
			'image/png'
		);
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `complex-function-${options.state.presetId ?? 'custom'}-${options.state.viewMode}.png`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
	return { blob, width: canvas.width, height: canvas.height };
}
