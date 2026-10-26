import { renderPortrait } from './render';
import type { EssayDocument } from './types';

const filename = (document: EssayDocument) =>
	`${document.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 90) || 'essay'}-anatomy`;

function download(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const link = window.document.createElement('a');
	link.href = url;
	link.download = name;
	window.document.body.append(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportPortrait(
	document: EssayDocument,
	format: 'svg' | 'png' | 'social'
): Promise<void> {
	const social = format === 'social';
	const width = social ? 1200 : 1600,
		height = social ? 630 : 2000;
	const source = renderPortrait(document, { social, width, height });
	const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
	if (format === 'svg') {
		download(blob, `${filename(document)}.svg`);
		return;
	}
	const sourceUrl = URL.createObjectURL(blob);
	try {
		const image = new Image();
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () =>
				reject(new Error('The portrait could not be prepared. Try the SVG export.'));
			image.src = sourceUrl;
		});
		const canvas = window.document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('PNG export is unavailable in this browser. Try the SVG export.');
		context.drawImage(image, 0, 0, width, height);
		const png = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(value) =>
					value
						? resolve(value)
						: reject(new Error('The PNG could not be encoded. Try the SVG export.')),
				'image/png'
			)
		);
		download(png, `${filename(document)}${social ? '-social' : ''}.png`);
	} finally {
		URL.revokeObjectURL(sourceUrl);
	}
}
