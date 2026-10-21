import { matrixColor } from './colors';
import { MODEL_VERSION, type Experiment, type ScenarioId } from './types';

const ARTICLE_URL = 'https://www.suvroghosh.in/blog/visualizations/the-music-of-missing-data';
const DISCLOSURE = 'Describes this pattern; does not establish why values are missing.';
const SCENARIOS: Record<ScenarioId, string> = {
	mcar: 'Missing completely at random',
	mar: 'Missing depending on observed information',
	mnar: 'Missing depending on the missing value itself',
	dropout: 'Dropout over time',
	variables: 'Entire missing variables',
	instrument: 'Failed instruments',
	nonresponse: 'Selective nonresponse'
};
const METHODS = {
	none: 'Leave missing · uncertainty not estimated',
	mean: 'Column means · uncertainty not estimated',
	predictive: 'Conditional predictive draw · halo = predictive standard deviation'
};

function nullable(value: number): number | null {
	return Number.isFinite(value) ? value : null;
}

/** No complete cell values enter the report unless the reader has revealed truth. */
export function fingerprintReport(experiment: Experiment) {
	const { settings, data, observed, completion, summary, order } = experiment;
	return {
		schemaVersion: 1,
		modelVersion: MODEL_VERSION,
		title: 'The Music of Missing Data',
		canonicalUrl: ARTICLE_URL,
		disclosure: DISCLOSURE,
		seed: settings.seed,
		scenario: { id: settings.scenario, label: SCENARIOS[settings.scenario] },
		parameters: { ...settings },
		dimensions: { rows: data.rows, columns: data.cols, view: data.view },
		variables: data.columns.map((name, column) => ({
			name,
			unit: data.unit,
			missing: summary.columnMissing[column],
			missingRate: summary.columnMissing[column] / data.rows
		})),
		actual: {
			missingCells: summary.missing,
			totalCells: data.rows * data.cols,
			missingRate: summary.rate,
			completeCases: summary.completeCases,
			missingPerRow: [...summary.rowMissing],
			frequentPatterns: summary.patterns.map((pattern) => ({ ...pattern })),
			patternEncoding: '1 = missing; 0 = measured; columns in original variable order',
			coMissing: summary.coMissing.map((row) => [...row])
		},
		ordering: {
			method: settings.ordering,
			displayedToOriginalRow: [...order],
			indexBase: 0
		},
		imputation: {
			method: settings.imputation,
			label: METHODS[settings.imputation],
			draw: settings.draw,
			sensitivityShift: settings.delta,
			unestimableColumns: [...completion.unestimable],
			assumption:
				settings.imputation === 'predictive'
					? 'A linear conditional model fitted only to available outcomes and the fully observed predictor, with Gaussian residual predictive draws. The sensitivity shift expresses an additional assumption about missing outcomes.'
					: settings.imputation === 'mean'
						? 'Available values within each column supply its mean. Uncertainty is not estimated; observed values are preserved.'
						: 'Missing values remain absent.',
			haloMeaning:
				settings.imputation === 'predictive'
					? 'Conditional predictive standard deviation in score points; model-dependent, not a guarantee of coverage.'
					: null
		},
		matrix: {
			layout: 'Row-major, original row order',
			missingMask: Array.from(observed.mask),
			observedValues: Array.from(observed.values, nullable),
			completedValues: Array.from(completion.values, nullable),
			predictiveStandardDeviation: Array.from(completion.spread, nullable),
			...(settings.reveal ? { revealedSyntheticTruth: Array.from(data.truth) } : {})
		},
		colourScale: {
			minimum: 14,
			midpoint: 50,
			maximum: 86,
			unit: data.unit,
			normalisation: '(score - 50) / 12, with a fixed displayed range of -3 to +3',
			clipping: 'Colour only'
		}
	};
}

function wrapText(
	context: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	width: number,
	lineHeight: number
): number {
	let line = '';
	for (const word of text.split(' ')) {
		const next = line ? `${line} ${word}` : word;
		if (line && context.measureText(next).width > width) {
			context.fillText(line, x, y);
			y += lineHeight;
			line = word;
		} else line = next;
	}
	context.fillText(line, x, y);
	return y + lineHeight;
}

/** The editorial export uses the same fixed colour mapping and provenance as the WebGL scene. */
export function renderFingerprint(
	canvas: HTMLCanvasElement,
	experiment: Experiment,
	format: 'full' | 'social' = 'full'
): void {
	const social = format === 'social';
	canvas.width = social ? 1200 : 1800;
	canvas.height = social ? 630 : 1300;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas export is unavailable in this browser.');
	const { data, observed, completion, summary, settings, order } = experiment;
	const w = canvas.width;
	const h = canvas.height;
	const margin = social ? 58 : 96;
	context.fillStyle = '#0b1419';
	context.fillRect(0, 0, w, h);
	context.fillStyle = '#8db8b0';
	context.font = `${social ? 12 : 18}px monospace`;
	context.fillText('A MISSINGNESS–PATTERN EXPLORER', margin, social ? 40 : 65);
	context.fillStyle = '#f1e7cc';
	context.font = `${social ? 47 : 78}px Georgia, serif`;
	context.fillText('The Music of Missing Data', margin, social ? 98 : 156);
	context.fillStyle = '#e9b79b';
	context.font = `${social ? 18 : 29}px Georgia, serif`;
	context.fillText(SCENARIOS[settings.scenario], margin, social ? 137 : 215);
	context.fillStyle = '#b7c8c5';
	context.font = `${social ? 12 : 19}px monospace`;
	context.fillText(
		`${(summary.rate * 100).toFixed(1)}% missing     ${summary.completeCases}/${data.rows} complete rows     seed ${settings.seed}`,
		margin,
		social ? 170 : 263
	);
	const matrix = {
		x: margin,
		y: social ? 210 : 340,
		width: w - margin * 2 - (social ? 34 : 70),
		height: social ? 292 : 650
	};
	const cellWidth = matrix.width / data.cols;
	const cellHeight = matrix.height / data.rows;
	if (!social) {
		context.fillStyle = '#8ea6a5';
		context.font = `${data.cols > 20 ? 12 : 14}px monospace`;
		for (let column = 0; column < data.cols; column++) {
			context.save();
			context.translate(matrix.x + (column + 0.5) * cellWidth, matrix.y - 13);
			context.rotate(-0.16);
			context.textAlign = 'center';
			context.fillText(data.columns[column], 0, 0);
			context.restore();
		}
	}
	for (let displayRow = 0; displayRow < data.rows; displayRow++) {
		const row = order[displayRow];
		for (let column = 0; column < data.cols; column++) {
			const index = row * data.cols + column;
			const missing = observed.mask[index] === 1;
			const filled = missing && !settings.reveal && Number.isFinite(completion.values[index]);
			const x = matrix.x + column * cellWidth + cellWidth * 0.13;
			const y = matrix.y + displayRow * cellHeight + cellHeight * 0.19;
			const cw = cellWidth * 0.74;
			const ch = Math.max(1, cellHeight * 0.62);
			context.save();
			if (missing && !filled && !settings.reveal) {
				context.fillStyle = '#142129';
			} else if (filled) {
				const colour = matrixColor(completion.values[index]).map((channel, i) =>
					Math.round(channel * 0.32 + [186, 158, 242][i] * 0.68)
				);
				context.fillStyle = `rgb(${colour.join(',')})`;
				const spread = completion.spread[index];
				if (spread > 0) {
					context.shadowColor = '#b8a0eb';
					context.shadowBlur = Math.min(14, (spread / 12) * (social ? 3 : 7));
				}
			} else if (missing) {
				const colour = matrixColor(data.truth[index]).map((channel, i) =>
					Math.round(channel * 0.35 + [204, 166, 79][i] * 0.65)
				);
				context.fillStyle = `rgb(${colour.join(',')})`;
			} else {
				const colour = matrixColor(observed.values[index]);
				context.fillStyle = `rgb(${colour.join(',')})`;
			}
			context.globalAlpha = filled ? 0.78 : missing ? 0.72 : 0.88;
			context.fillRect(x, y, cw, ch);
			context.shadowBlur = 0;
			if (filled) {
				context.globalAlpha = 0.9;
				context.strokeStyle = '#e0c9ff';
				context.lineWidth = social ? 0.7 : 1;
				context.beginPath();
				context.moveTo(x + cw * 0.45, y + ch);
				context.lineTo(x + cw * 0.6, y);
				context.stroke();
			}
			if (missing && !filled && settings.reveal) {
				context.strokeStyle = '#ccb063';
				context.setLineDash([2, 2]);
				context.strokeRect(x, y, cw, ch);
			}
			context.restore();
		}
		context.fillStyle = '#f0967d';
		context.globalAlpha = 0.7;
		context.fillRect(
			matrix.x + matrix.width + 10,
			matrix.y + displayRow * cellHeight + cellHeight * 0.19,
			(summary.rowMissing[row] / data.cols) * (social ? 22 : 45),
			Math.max(1, cellHeight * 0.62)
		);
	}
	context.globalAlpha = 1;
	for (let column = 0; column < data.cols; column++) {
		context.fillStyle = '#142129';
		context.fillRect(
			matrix.x + column * cellWidth,
			matrix.y + matrix.height + 9,
			cellWidth * 0.85,
			5
		);
		context.fillStyle = '#f0967d';
		context.fillRect(
			matrix.x + column * cellWidth,
			matrix.y + matrix.height + 9,
			cellWidth * 0.85 * (summary.columnMissing[column] / data.rows),
			5
		);
	}
	const legendY = social ? 551 : 1060;
	const legend = [
		['#70bfb4', 'Measured'],
		['#24323a', 'Missing'],
		['#b8a0eb', 'Imputed /'],
		...(settings.reveal ? [['#b9a05c', 'Revealed truth']] : [])
	];
	context.font = `${social ? 12 : 19}px monospace`;
	let legendX = margin;
	for (const [color, label] of legend) {
		context.fillStyle = color;
		context.fillRect(legendX, legendY - (social ? 9 : 14), social ? 12 : 18, social ? 9 : 14);
		context.fillStyle = '#c6d0cb';
		context.fillText(label, legendX + (social ? 20 : 30), legendY);
		legendX += social ? 150 : 245;
	}
	if (!social) {
		context.fillStyle = '#bdaccf';
		context.font = '20px monospace';
		wrapText(context, METHODS[settings.imputation], margin, 1110, w - margin * 2, 28);
		context.fillStyle = '#a5b5b1';
		context.font = '17px monospace';
		context.fillText(
			`${data.rows} × ${data.cols} · ${data.unit} · order: ${settings.ordering} · ${MODEL_VERSION}`,
			margin,
			1170
		);
		context.fillText(ARTICLE_URL, margin, 1202);
	}
	context.fillStyle = '#d4c7a9';
	context.font = `${social ? 12 : 18}px ${social ? 'Georgia, serif' : 'monospace'}`;
	context.fillText(DISCLOSURE, margin, h - (social ? 29 : 43));
}

function saveBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadFingerprint(experiment: Experiment): Promise<void> {
	const canvas = document.createElement('canvas');
	renderFingerprint(canvas, experiment);
	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(result) => (result ? resolve(result) : reject(new Error('PNG encoding failed.'))),
			'image/png'
		);
	});
	saveBlob(blob, `missingness-${experiment.settings.scenario}-${experiment.settings.seed}.png`);
}

export function downloadJSON(experiment: Experiment): void {
	saveBlob(
		new Blob([JSON.stringify(fingerprintReport(experiment), null, 2)], {
			type: 'application/json'
		}),
		`missingness-${experiment.settings.scenario}-${experiment.settings.seed}.json`
	);
}
