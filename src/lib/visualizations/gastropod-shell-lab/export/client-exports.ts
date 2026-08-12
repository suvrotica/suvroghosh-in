import type { ShellGenerationResult } from '$lib/visualizations/gastropod-shell-lab/shell/engine';
import type { ShellRecipe } from '$lib/visualizations/gastropod-shell-lab/shell/model';
import { serializeShellRecipe } from '$lib/visualizations/gastropod-shell-lab/shell/serialization';

export function slugifyRecipeName(name: string): string {
	return (
		name
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 72) || 'living-aperture'
	);
}

export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(
	text: string,
	filename: string,
	type = 'text/plain;charset=utf-8'
): void {
	downloadBlob(new Blob([text], { type }), filename);
}

export function downloadRecipeJson(recipe: ShellRecipe): void {
	downloadText(
		serializeShellRecipe(recipe),
		`${slugifyRecipeName(recipe.name)}.shell.json`,
		'application/json;charset=utf-8'
	);
}

export function ringHistoryToCsv(recipe: ShellRecipe, result: ShellGenerationResult): string {
	const rows = [
		[
			'ring',
			'age',
			'theta',
			'center_x',
			'center_y',
			'center_z',
			'scale',
			'tangent_x',
			'tangent_y',
			'tangent_z',
			'frame_e1_x',
			'frame_e1_y',
			'frame_e1_z',
			'frame_e2_x',
			'frame_e2_y',
			'frame_e2_z',
			'whorl_expansion',
			'aperture_exponent',
			'rib_amplitude',
			'varix_amplitude',
			'spine_length',
			'seed'
		].join(',')
	];
	for (let ring = 0; ring < result.history.ringCount; ring += 1) {
		const offset = ring * 3;
		rows.push(
			[
				ring,
				result.history.ages[ring],
				result.history.thetas[ring],
				result.history.centers[offset],
				result.history.centers[offset + 1],
				result.history.centers[offset + 2],
				result.history.scales[ring],
				result.history.tangents[offset],
				result.history.tangents[offset + 1],
				result.history.tangents[offset + 2],
				result.history.frameE1[offset],
				result.history.frameE1[offset + 1],
				result.history.frameE1[offset + 2],
				result.history.frameE2[offset],
				result.history.frameE2[offset + 1],
				result.history.frameE2[offset + 2],
				recipe.coiling.whorlExpansion,
				recipe.aperture.scaleExponent,
				recipe.ornament.ribs.amplitude,
				recipe.ornament.varices.amplitude,
				recipe.ornament.spines.length,
				recipe.seed
			].join(',')
		);
	}
	return rows.join('\n');
}

export function downloadRingHistoryCsv(recipe: ShellRecipe, result: ShellGenerationResult): void {
	downloadText(
		ringHistoryToCsv(recipe, result),
		`${slugifyRecipeName(recipe.name)}-aperture-history.csv`,
		'text/csv;charset=utf-8'
	);
}

export interface RecipeSheetData {
	imageDataUrl?: string;
	classification: string;
	diagnostics: string[];
}

function describeLaw(law: ShellRecipe['kinematics']['speed']): string {
	switch (law.type) {
		case 'constant':
			return `constant ${law.value.toPrecision(5)}`;
		case 'linear':
			return `linear ${law.start.toPrecision(5)} → ${law.end.toPrecision(5)}`;
		case 'hermite':
			return `Hermite ${law.start.toPrecision(5)} → ${law.end.toPrecision(5)}`;
		case 'step':
			return `base ${law.base.toPrecision(5)}; ${law.episodes.length} episode${law.episodes.length === 1 ? '' : 's'}`;
		case 'sinusoid':
			return `sinusoid offset ${law.offset.toPrecision(5)}, amplitude ${law.amplitude.toPrecision(5)}, ${law.cycles.toPrecision(4)} cycles`;
		case 'keyframes':
			return `${law.points.length} ${law.interpolation} keyframe${law.points.length === 1 ? '' : 's'}`;
	}
}

export function openRecipeSheet(recipe: ShellRecipe, data: RecipeSheetData): void {
	// Opening with the `noopener` feature intentionally yields `null` in several browsers,
	// which prevents us from constructing the sheet. Open a same-origin blank document,
	// sever its opener synchronously, then attach behavior from this trusted module.
	const popup = window.open('about:blank', '_blank');
	if (!popup) throw new Error('The browser blocked the recipe-sheet window.');
	popup.opener = null;
	const escape = (value: string) =>
		value.replace(
			/[&<>"]/g,
			(character) =>
				({
					'&': '&amp;',
					'<': '&lt;',
					'>': '&gt;',
					'"': '&quot;'
				})[character] as string
		);
	const commonParameters: Array<[string, string, string]> = [
		['Aperture scale A/R', recipe.aperture.scale.toFixed(5), 'dimensionless'],
		['Profile', recipe.aperture.profile, 'family'],
		['Rib amplitude', recipe.ornament.ribs.amplitude.toFixed(4), 'local radii'],
		['Varix amplitude', recipe.ornament.varices.amplitude.toFixed(4), 'local radii'],
		['Spine length', recipe.ornament.spines.length.toFixed(4), 'local radii'],
		['Finite hierarchy depth', String(recipe.ornament.hierarchy.depth), 'levels'],
		['Seed', String(recipe.seed), 'uint32']
	];
	const parameters: Array<[string, string, string]> =
		recipe.engine === 'accretion'
			? [
					['Integration span N', recipe.coiling.turns.toFixed(3), 'turn-equivalent span'],
					['Centerline speed v(τ)', describeLaw(recipe.kinematics.speed), 'authored law'],
					['Aperture growth g(τ)', describeLaw(recipe.kinematics.growthRate), 'authored law'],
					['Turning rate κ₁(τ)', describeLaw(recipe.kinematics.curvature1), 'authored law'],
					['Turning rate κ₂(τ)', describeLaw(recipe.kinematics.curvature2), 'authored law'],
					['Frame twist ω(τ)', describeLaw(recipe.kinematics.twistRate), 'authored law'],
					...commonParameters
				]
			: [
					['Planar curve', recipe.coiling.curve, 'analytic family'],
					['Whorl expansion W', recipe.coiling.whorlExpansion.toFixed(5), 'dimensionless'],
					['Turns N', recipe.coiling.turns.toFixed(3), 'turns'],
					['Axis distance R', recipe.coiling.axisDistance.toFixed(5), 'model units'],
					['Axial law', recipe.coiling.axial.mode, 'analytic law'],
					[
						recipe.coiling.axial.mode === 'lecture-lift' ? 'Axial rise p' : 'Spire H/R',
						(recipe.coiling.axial.mode === 'lecture-lift'
							? recipe.coiling.axial.risePerTurn
							: recipe.coiling.axial.coneSpireRatio
						).toFixed(5),
						'dimensionless'
					],
					['Aperture exponent b', recipe.aperture.scaleExponent.toFixed(6), 'rad⁻¹'],
					...commonParameters
				];
	const centralEquations =
		recipe.engine === 'accretion'
			? 'C′=vT; T′=κ₁E₁+κ₂E₂; s′=gs; X=C+s(pₓE₁+pᵧE₂)'
			: recipe.coiling.curve === 'archimedean'
				? 'r(θ)=r₀+c(θ−θ₀); X=C+s(pₓE₁+pᵧE₂)'
				: 'r(θ)=rₘₐₓ exp[a(θ−θ₁)]; W=exp(2πa); X=C+s(pₓE₁+pᵧE₂)';
	popup.document
		.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(recipe.name)} — recipe sheet</title><style>
		body{font:15px/1.55 Georgia,serif;color:#20221e;margin:36px auto;max-width:820px;padding:0 24px}h1{font-size:32px;margin:0}h2{font:700 12px/1.2 system-ui;text-transform:uppercase;letter-spacing:.12em;margin-top:28px;border-bottom:1px solid #aaa;padding-bottom:6px}.meta{color:#666;margin-top:4px}.hero{width:100%;max-height:420px;object-fit:contain;background:#101313;margin-top:22px}table{width:100%;border-collapse:collapse;font:13px/1.4 system-ui}th,td{text-align:left;padding:7px;border-bottom:1px solid #ddd}code{font:12px ui-monospace,monospace}.caveat{border-left:3px solid #a96d2c;padding:10px 14px;background:#f5efe5}@media print{body{margin:0}.no-print{display:none}}
	</style></head><body><button id="print-recipe-sheet" class="no-print" type="button">Print / Save PDF</button><h1>${escape(recipe.name)}</h1><p class="meta">The Living Aperture · schema ${recipe.schemaVersion} · engine ${escape(recipe.engineVersion)} · seed ${recipe.seed}</p>
	${data.imageDataUrl ? `<img class="hero" alt="Rendered shell specimen" src="${escape(data.imageDataUrl)}">` : ''}
	<h2>Model classification</h2><p>${escape(data.classification)}</p>
	<h2>Central equations</h2><p><code>${escape(centralEquations)}</code></p>
	<h2>Parameters</h2><table><thead><tr><th>Parameter</th><th>Value</th><th>Unit/status</th></tr></thead><tbody>${parameters.map(([name, value, unit]) => `<tr><th>${escape(name)}</th><td>${escape(value)}</td><td>${escape(unit)}</td></tr>`).join('')}</tbody></table>
	<h2>Diagnostics</h2>${data.diagnostics.length ? `<ul>${data.diagnostics.map((warning) => `<li>${escape(warning)}</li>`).join('')}</ul>` : '<p>No current warnings from conservative checks.</p>'}
	<h2>Scientific scope</h2><p class="caveat">This is a procedural, mathematically grounded shell-design recipe. The analytic engine describes geometry; aperture accretion is kinematic; reduced oscillator, mismatch, stiffness, buckling and hierarchy values are model parameters or proxies. Named forms are morphological archetypes, not specimen reconstructions. The app does not solve biomineralization, gene regulation, full mantle mechanics, or adaptive function.</p></body></html>`);
	popup.document.close();
	popup.document
		.getElementById('print-recipe-sheet')
		?.addEventListener('click', () => popup.print());
	popup.focus();
}
