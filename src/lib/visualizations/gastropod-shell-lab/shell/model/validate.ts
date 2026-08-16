import type { GrowthLaw } from './growth-law';
import { growthLawRange } from './growth-law';
import { ShellRecipeSchema, radialExpansionExponent, type ShellRecipe } from './recipe-schema';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface RecipeDiagnostic {
	code: string;
	severity: DiagnosticSeverity;
	message: string;
	path: string;
	repair?: string;
}

export type SimilarityClassification =
	| 'exact-self-similar'
	| 'top-view-self-similar'
	| 'allometric'
	| 'generalized';

export interface RecipeClassification {
	similarity: SimilarityClassification;
	label: string;
	reason: string;
	/** Similarity badge scope; finite caps and truncation are never included. */
	appliesTo: 'underlying-base-growth-law';
	/** True only for the centerline/lift/aperture-scalar law, not proof for a swept surface. */
	strictlySelfSimilarIn3d: boolean;
	/** Finite renderings include an apex, adult truncation, and may include changing detail. */
	finiteRenderedShellStrictlySimilar: false;
}

export interface RecipeValidation {
	structurallyValid: boolean;
	semanticallyValid: boolean;
	safe: boolean;
	canGenerate: boolean;
	diagnostics: RecipeDiagnostic[];
	classification?: RecipeClassification;
	recipe?: ShellRecipe;
}

function diagnostic(
	code: string,
	severity: DiagnosticSeverity,
	message: string,
	path: string,
	repair?: string
): RecipeDiagnostic {
	return { code, severity, message, path, ...(repair ? { repair } : {}) };
}

function isConstant(law: GrowthLaw, value: number, tolerance = 1e-10): boolean {
	return law.type === 'constant' && Math.abs(law.value - value) <= tolerance;
}

/**
 * Classify the base swept geometry. Ornament mechanisms are deliberately outside
 * this label; their finite episodes can break similarity even when the base is exact.
 */
export function classifyShellRecipe(recipe: ShellRecipe): RecipeClassification {
	if (recipe.engine === 'accretion') {
		return {
			similarity: 'generalized',
			label: 'local kinematic frame model',
			reason:
				'The accretion engine integrates authored local-frame laws rather than assuming a globally similar sweep.',
			appliesTo: 'underlying-base-growth-law',
			strictlySelfSimilarIn3d: false,
			finiteRenderedShellStrictlySimilar: false
		};
	}
	if (recipe.coiling.curve !== 'logarithmic') {
		return {
			similarity: 'generalized',
			label: 'generalized growth path',
			reason: 'An Archimedean centreline has additive rather than multiplicative radial spacing.',
			appliesTo: 'underlying-base-growth-law',
			strictlySelfSimilarIn3d: false,
			finiteRenderedShellStrictlySimilar: false
		};
	}

	const radialExponent = radialExpansionExponent(recipe);
	if (Math.abs(radialExponent - recipe.aperture.scaleExponent) > 1e-10) {
		return {
			similarity: 'allometric',
			label: 'allometric shell',
			reason: 'Centerline radius and aperture size have different exponential growth rates.',
			appliesTo: 'underlying-base-growth-law',
			strictlySelfSimilarIn3d: false,
			finiteRenderedShellStrictlySimilar: false
		};
	}

	if (
		recipe.coiling.meander.radialAmplitude !== 0 ||
		recipe.coiling.meander.axialAmplitude !== 0 ||
		recipe.coiling.axial.mode === 'keyframed' ||
		!isConstant(recipe.coiling.handednessLaw, 1) ||
		!isConstant(recipe.aperture.scaleModulation, 1) ||
		!isConstant(recipe.aperture.lipFlare, 0) ||
		!isConstant(recipe.twist.rate, 0)
	) {
		return {
			similarity: 'generalized',
			label: 'generalized growth path',
			reason:
				'The selected centerline, age-varying winding, aperture modulation, lip flare, or authored profile roll is not a single repeating logarithmic similarity law.',
			appliesTo: 'underlying-base-growth-law',
			strictlySelfSimilarIn3d: false,
			finiteRenderedShellStrictlySimilar: false
		};
	}

	if (recipe.coiling.axial.mode === 'lecture-lift') {
		return {
			similarity: 'top-view-self-similar',
			label: 'base growth law: self-similar top view',
			reason:
				'Radius grows exponentially while height rises linearly, so the full lifted 3D curve is not invariant under uniform scaling.',
			appliesTo: 'underlying-base-growth-law',
			strictlySelfSimilarIn3d: false,
			finiteRenderedShellStrictlySimilar: false
		};
	}

	return {
		similarity: 'exact-self-similar',
		label: 'base growth law: exactly self-similar in 3D',
		reason:
			recipe.coiling.axial.mode === 'cone-similar'
				? 'Centerline radius, cone lift, and aperture scale share the same per-turn factor. The finite cap, truncation, ontogenetic changes, and episodic ornament are outside this badge.'
				: 'The planispiral centerline radius and aperture scale share the same per-turn factor. The finite cap, truncation, ontogenetic changes, and episodic ornament are outside this badge.',
		appliesTo: 'underlying-base-growth-law',
		strictlySelfSimilarIn3d: true,
		finiteRenderedShellStrictlySimilar: false
	};
}

const MAX_GROWTH_LAW_MAGNITUDE = 1_000_000;
const MAX_ACCRETION_GROWTH_EXPONENT = 600;

function growthLawParameterMagnitude(law: GrowthLaw): number {
	switch (law.type) {
		case 'constant':
			return Math.abs(law.value);
		case 'linear':
			return Math.max(Math.abs(law.start), Math.abs(law.end));
		case 'hermite':
			return Math.max(
				Math.abs(law.start),
				Math.abs(law.end),
				Math.abs(law.startSlope),
				Math.abs(law.endSlope)
			);
		case 'step':
			return Math.max(Math.abs(law.base), ...law.episodes.map(({ value }) => Math.abs(value)));
		case 'sinusoid':
			return Math.max(Math.abs(law.offset), Math.abs(law.amplitude));
		case 'keyframes':
			return Math.max(...law.points.map(({ value }) => Math.abs(value)));
	}
}

export function validateRecipeSemantics(recipe: ShellRecipe): RecipeDiagnostic[] {
	const result: RecipeDiagnostic[] = [];
	const warnRange = (
		value: number,
		min: number,
		max: number,
		code: string,
		path: string,
		name: string
	) => {
		if (value < min || value > max) {
			result.push(
				diagnostic(
					code,
					'warning',
					`${name} is outside the interface-safe starting range ${min}–${max}.`,
					path,
					`Move ${name.toLowerCase()} into ${min}–${max}, or knowingly use the unsafe laboratory range.`
				)
			);
		}
	};
	const validateLawMagnitude = (law: GrowthLaw, path: string, name: string) => {
		const range = growthLawRange(law);
		const maximumMagnitude = Math.max(
			Math.abs(range.min),
			Math.abs(range.max),
			growthLawParameterMagnitude(law)
		);
		if (!Number.isFinite(maximumMagnitude) || maximumMagnitude > MAX_GROWTH_LAW_MAGNITUDE) {
			result.push(
				diagnostic(
					'growth-law-numerical-range',
					'error',
					`${name} exceeds the finite numerical range supported by the geometry engine.`,
					path,
					`Keep every value and slope in ${name.toLowerCase()} within ±${MAX_GROWTH_LAW_MAGNITUDE.toLocaleString('en-US')}.`
				)
			);
		}
	};

	const activeLaws: Array<{ law: GrowthLaw; path: string; name: string }> = [
		{
			law: recipe.coiling.handednessLaw,
			path: 'coiling.handednessLaw',
			name: 'Handedness law'
		},
		{
			law: recipe.aperture.scaleModulation,
			path: 'aperture.scaleModulation',
			name: 'Aperture scale modulation'
		},
		{
			law: recipe.aperture.lipFlare,
			path: 'aperture.lipFlare',
			name: 'Aperture lip flare'
		},
		{ law: recipe.twist.rate, path: 'twist.rate', name: 'Profile-roll rate' }
	];
	if (recipe.coiling.axial.mode === 'keyframed') {
		activeLaws.push({
			law: recipe.coiling.axial.keyframed,
			path: 'coiling.axial.keyframed',
			name: 'Keyframed axial height'
		});
	}
	if (recipe.engine === 'accretion') {
		activeLaws.push(
			{ law: recipe.kinematics.speed, path: 'kinematics.speed', name: 'Kinematic speed' },
			{
				law: recipe.kinematics.growthRate,
				path: 'kinematics.growthRate',
				name: 'Kinematic growth rate'
			},
			{
				law: recipe.kinematics.curvature1,
				path: 'kinematics.curvature1',
				name: 'First kinematic curvature'
			},
			{
				law: recipe.kinematics.curvature2,
				path: 'kinematics.curvature2',
				name: 'Second kinematic curvature'
			},
			{
				law: recipe.kinematics.twistRate,
				path: 'kinematics.twistRate',
				name: 'Kinematic frame-twist rate'
			}
		);
	}
	const ornamentLaws = [
		{ key: 'ribs', name: 'Rib onset', module: recipe.ornament.ribs },
		{ key: 'cords', name: 'Cord onset', module: recipe.ornament.cords },
		{ key: 'nodules', name: 'Nodule onset', module: recipe.ornament.nodules },
		{ key: 'varices', name: 'Varix onset', module: recipe.ornament.varices },
		{ key: 'spines', name: 'Spine onset', module: recipe.ornament.spines },
		{ key: 'buckling', name: 'Buckling onset', module: recipe.ornament.buckling },
		{ key: 'hierarchy', name: 'Hierarchy onset', module: recipe.ornament.hierarchy },
		{ key: 'imperfection', name: 'Imperfection onset', module: recipe.ornament.imperfection }
	] as const;
	for (const ornament of ornamentLaws) {
		if (ornament.module.enabled) {
			activeLaws.push({
				law: ornament.module.onset,
				path: `ornament.${ornament.key}.onset`,
				name: ornament.name
			});
		}
	}
	for (const activeLaw of activeLaws) {
		validateLawMagnitude(activeLaw.law, activeLaw.path, activeLaw.name);
	}

	warnRange(recipe.coiling.turns, 2, 12, 'turns-unsafe-range', 'coiling.turns', 'Turns');
	warnRange(
		recipe.coiling.whorlExpansion,
		1.03,
		6,
		'whorl-expansion-unsafe-range',
		'coiling.whorlExpansion',
		'Whorl expansion'
	);
	if (recipe.coiling.axial.mode === 'cone-similar') {
		warnRange(
			recipe.coiling.axial.coneSpireRatio,
			0,
			3,
			'cone-spire-unsafe-range',
			'coiling.axial.coneSpireRatio',
			'Cone spire ratio'
		);
	}
	const apertureAxisRatio = recipe.aperture.scale;
	warnRange(
		apertureAxisRatio,
		0.03,
		1.2,
		'aperture-axis-ratio-unsafe-range',
		'aperture.scale',
		'Aperture semi-width / axis distance'
	);
	warnRange(
		recipe.aperture.aspectRatio,
		0.2,
		5,
		'aperture-aspect-unsafe-range',
		'aperture.aspectRatio',
		'Aperture height/width'
	);
	if (recipe.aperture.profile === 'superellipse') {
		warnRange(
			recipe.aperture.superellipseExponent,
			0.5,
			8,
			'superellipse-unsafe-range',
			'aperture.superellipseExponent',
			'Superellipse exponent'
		);
	}

	const seenHarmonics = new Set<number>();
	for (const [index, term] of recipe.aperture.fourier.entries()) {
		if (seenHarmonics.has(term.harmonic)) {
			result.push(
				diagnostic(
					'fourier-duplicate-harmonic',
					'warning',
					`Harmonic ${term.harmonic} occurs more than once.`,
					`aperture.fourier.${index}`,
					'Combine duplicate coefficients into one Fourier term.'
				)
			);
		}
		seenHarmonics.add(term.harmonic);
		if (Math.abs(term.cos) > 0.25 || Math.abs(term.sin) > 0.25) {
			result.push(
				diagnostic(
					'fourier-coefficient-unsafe-range',
					'warning',
					'An aperture Fourier coefficient exceeds the ordinary ±0.25 range.',
					`aperture.fourier.${index}`,
					'Reduce both coefficients to ±0.25 or validate the profile deliberately.'
				)
			);
		}
		if (term.harmonic >= 32) {
			result.push(
				diagnostic(
					'fourier-sampling-risk',
					'warning',
					`Harmonic ${term.harmonic} requires more than the reference 64 aperture samples.`,
					`aperture.fourier.${index}.harmonic`,
					'Raise aperture tessellation or reduce the harmonic below 32.'
				)
			);
		}
	}

	if (recipe.aperture.profile === 'fourier') {
		if (recipe.aperture.fourier.length === 0) {
			result.push(
				diagnostic(
					'fourier-profile-empty',
					'warning',
					'The selected Fourier aperture has no coefficients and is therefore circular.',
					'aperture.fourier',
					'Add a low harmonic or select the circle profile.'
				)
			);
		}
		let minimumRadius = Number.POSITIVE_INFINITY;
		for (let sample = 0; sample < 512; sample += 1) {
			const angle = (sample / 512) * Math.PI * 2;
			let radius = 1;
			for (const term of recipe.aperture.fourier) {
				radius += term.cos * Math.cos(term.harmonic * angle);
				radius += term.sin * Math.sin(term.harmonic * angle);
			}
			minimumRadius = Math.min(minimumRadius, radius);
		}
		if (minimumRadius <= recipe.qualityIndependent.apexEpsilon) {
			result.push(
				diagnostic(
					'aperture-non-positive',
					'error',
					'The Fourier aperture reaches a non-positive polar radius.',
					'aperture.fourier',
					'Reduce coefficient amplitudes until the entire aperture radius stays positive.'
				)
			);
		}
	}

	if (recipe.aperture.profile === 'drawn') {
		if (recipe.aperture.drawnProfile.length < 8) {
			result.push(
				diagnostic(
					'drawn-profile-too-short',
					'error',
					'A drawn periodic aperture needs at least eight ordered samples.',
					'aperture.drawnProfile',
					'Add samples around the complete aperture or choose a built-in profile.'
				)
			);
		}
		for (let index = 1; index < recipe.aperture.drawnProfile.length; index += 1) {
			if (
				recipe.aperture.drawnProfile[index].angle <= recipe.aperture.drawnProfile[index - 1].angle
			) {
				result.push(
					diagnostic(
						'drawn-profile-unordered',
						'error',
						'Drawn aperture angles must be strictly increasing.',
						`aperture.drawnProfile.${index}.angle`,
						'Reorder or resample the drawn profile by angle.'
					)
				);
				break;
			}
		}
	}

	warnRange(
		recipe.ornament.ribs.countPerTurn,
		0,
		80,
		'rib-frequency-unsafe-range',
		'ornament.ribs.countPerTurn',
		'Ribs per turn'
	);
	warnRange(
		recipe.ornament.varices.countPerTurn,
		0,
		12,
		'varix-frequency-unsafe-range',
		'ornament.varices.countPerTurn',
		'Varices per turn'
	);
	warnRange(
		recipe.ornament.spines.length,
		0,
		2,
		'spine-length-unsafe-range',
		'ornament.spines.length',
		'Spine length'
	);
	warnRange(
		recipe.ornament.hierarchy.depth,
		0,
		5,
		'hierarchy-depth-unsafe-range',
		'ornament.hierarchy.depth',
		'Finite hierarchy depth'
	);

	if (recipe.engine === 'accretion') {
		const speed = growthLawRange(recipe.kinematics.speed);
		if (speed.min <= 0) {
			result.push(
				diagnostic(
					'kinematic-speed-non-positive',
					'error',
					'The local kinematic speed becomes zero or negative.',
					'kinematics.speed',
					'Keep the entire speed law above zero.'
				)
			);
		}
		const growthRate = growthLawRange(recipe.kinematics.growthRate);
		const maximumGrowthExponent =
			Math.max(Math.abs(growthRate.min), Math.abs(growthRate.max)) *
			recipe.coiling.turns *
			Math.PI *
			2;
		if (
			!Number.isFinite(maximumGrowthExponent) ||
			maximumGrowthExponent > MAX_ACCRETION_GROWTH_EXPONENT
		) {
			result.push(
				diagnostic(
					'kinematic-growth-overflow-risk',
					'error',
					'The local kinematic growth law can overflow the finite aperture-scale integration.',
					'kinematics.growthRate',
					'Reduce the growth-rate magnitude or the number of turns.'
				)
			);
		}
	}

	if (
		(apertureAxisRatio > 1.15 && recipe.coiling.whorlExpansion < 1.45) ||
		recipe.coiling.meander.radialAmplitude > 1.2 ||
		recipe.coiling.meander.axialAmplitude > 1.2
	) {
		result.push(
			diagnostic(
				'self-intersection-likely',
				'warning',
				'This parameter combination is likely to make non-adjacent growth strips intersect.',
				'aperture.scale',
				'Increase whorl expansion, reduce aperture size, or reduce centerline meander.'
			)
		);
	}

	return result;
}

export function validateShellRecipe(input: unknown): RecipeValidation {
	const parsed = ShellRecipeSchema.safeParse(input);
	if (!parsed.success) {
		return {
			structurallyValid: false,
			semanticallyValid: false,
			safe: false,
			canGenerate: false,
			diagnostics: parsed.error.issues.map((issue) =>
				diagnostic(
					'schema-invalid',
					'error',
					issue.message,
					issue.path.map(String).join('.') || '(recipe)',
					'Correct the field and import the recipe again.'
				)
			)
		};
	}
	const diagnostics = validateRecipeSemantics(parsed.data);
	const hasError = diagnostics.some((item) => item.severity === 'error');
	return {
		structurallyValid: true,
		semanticallyValid: !hasError,
		safe: diagnostics.length === 0,
		canGenerate: !hasError,
		diagnostics,
		classification: classifyShellRecipe(parsed.data),
		recipe: parsed.data
	};
}
