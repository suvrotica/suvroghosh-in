import {
	CURATED_STUDY_SEEDS,
	PALETTE,
	type DepositionPass,
	type DripPaintingState,
	type PaintingModel,
	type PigmentId,
	type StudyId,
	type StudySpec
} from './types.ts';

export const STUDY_SPECS: Readonly<Record<StudyId, StudySpec>> = {
	'pending-file': {
		id: 'pending-file',
		label: 'Pending File',
		shortLabel: 'Pending File',
		description:
			'Measured looping circuits that stall near interior hubs, forming matte pools where red-oxide and carbon-black knot over ochre and raw cloth.',
		defaultSeed: CURATED_STUDY_SEEDS['pending-file'],
		kinematics: {
			hubCountRange: [3, 5],
			hubInset: 0.22,
			gestureWeights: { orbital: 0.58, arc: 0.26, whip: 0.16, veil: 0.0 },
			baseSpeedScale: 0.78,
			stallStrength: 0.86,
			whipSharpness: 0.42,
			poolPropensity: 1.38,
			spatterPropensity: 0.88,
			ribbonWidthScale: 1.04
		},
		layerAffinities: {
			1: {
				'ledger-ochre': 0.46,
				'road-tar-umber': 0.24,
				'carbon-black': 0.2,
				'carbon-indigo': 0.1
			},
			2: {
				'ledger-ochre': 0.34,
				'file-tape-red': 0.3,
				'carbon-black': 0.24,
				'road-tar-umber': 0.12
			},
			3: {
				'file-tape-red': 0.38,
				'carbon-black': 0.36,
				'ledger-ochre': 0.16,
				'carbon-indigo': 0.1
			},
			4: {
				'carbon-black': 0.28,
				'file-tape-red': 0.26,
				'lime-whitewash': 0.32,
				'road-tar-umber': 0.14
			},
			5: {
				'lime-whitewash': 0.62,
				'carbon-black': 0.14,
				'file-tape-red': 0.14,
				'ledger-ochre': 0.1
			},
			6: {
				'lime-whitewash': 0.7,
				'ledger-ochre': 0.12,
				'carbon-black': 0.1,
				'file-tape-red': 0.08
			}
		}
	},
	'public-works-tenders': {
		id: 'public-works-tenders',
		label: 'Public Works & Tenders',
		shortLabel: 'Public Works',
		description:
			'Broad full-canvas arcs in tar-umber, carbon-black, and ochre, veiled beneath thick late passes of chalky lime-whitewash.',
		defaultSeed: CURATED_STUDY_SEEDS['public-works-tenders'],
		kinematics: {
			hubCountRange: [2, 3],
			hubInset: 0.14,
			gestureWeights: { orbital: 0.14, arc: 0.62, whip: 0.0, veil: 0.24 },
			baseSpeedScale: 1.15,
			stallStrength: 0.54,
			whipSharpness: 0.28,
			poolPropensity: 1.16,
			spatterPropensity: 0.92,
			ribbonWidthScale: 1.18
		},
		layerAffinities: {
			1: {
				'road-tar-umber': 0.44,
				'carbon-black': 0.32,
				'ledger-ochre': 0.24
			},
			2: {
				'road-tar-umber': 0.34,
				'ledger-ochre': 0.34,
				'carbon-black': 0.22,
				'file-tape-red': 0.1
			},
			3: {
				'carbon-black': 0.3,
				'road-tar-umber': 0.3,
				'ledger-ochre': 0.26,
				'file-tape-red': 0.14
			},
			4: {
				'lime-whitewash': 0.44,
				'ledger-ochre': 0.24,
				'road-tar-umber': 0.2,
				'carbon-black': 0.12
			},
			5: {
				'lime-whitewash': 0.72,
				'ledger-ochre': 0.16,
				'road-tar-umber': 0.12
			},
			6: {
				'lime-whitewash': 0.74,
				'ledger-ochre': 0.16,
				'road-tar-umber': 0.1
			}
		}
	},
	'counter-middleman': {
		id: 'counter-middleman',
		label: 'Counter & Middleman',
		shortLabel: 'Counter & Middleman',
		description:
			'Brisk, tight, restless passes with sharp directional whips and frequent tangential spatter halos.',
		defaultSeed: CURATED_STUDY_SEEDS['counter-middleman'],
		kinematics: {
			hubCountRange: [4, 7],
			hubInset: 0.18,
			gestureWeights: { orbital: 0.27, arc: 0.15, whip: 0.58, veil: 0.0 },
			baseSpeedScale: 1.34,
			stallStrength: 0.34,
			whipSharpness: 0.9,
			poolPropensity: 0.68,
			spatterPropensity: 1.52,
			ribbonWidthScale: 0.8
		},
		layerAffinities: {
			1: {
				'carbon-black': 0.34,
				'file-tape-red': 0.26,
				'road-tar-umber': 0.22,
				'carbon-indigo': 0.18
			},
			2: {
				'carbon-black': 0.34,
				'file-tape-red': 0.26,
				'road-tar-umber': 0.22,
				'carbon-indigo': 0.18
			},
			3: {
				'file-tape-red': 0.34,
				'carbon-black': 0.3,
				'ledger-ochre': 0.2,
				'carbon-indigo': 0.16
			},
			4: {
				'file-tape-red': 0.34,
				'carbon-black': 0.3,
				'ledger-ochre': 0.2,
				'carbon-indigo': 0.16
			},
			5: {
				'carbon-black': 0.3,
				'lime-whitewash': 0.26,
				'file-tape-red': 0.24,
				'ledger-ochre': 0.2
			},
			6: {
				'carbon-black': 0.3,
				'lime-whitewash': 0.28,
				'file-tape-red': 0.24,
				'ledger-ochre': 0.18
			}
		}
	},
	'whitewash-record': {
		id: 'whitewash-record',
		label: 'Whitewash & Record',
		shortLabel: 'Whitewash & Record',
		description:
			'Dense foundation networks of carbon-indigo and red-oxide veiled beneath broad chalk-white coats with dark loops surfacing through breaks.',
		defaultSeed: CURATED_STUDY_SEEDS['whitewash-record'],
		kinematics: {
			hubCountRange: [3, 4],
			hubInset: 0.16,
			gestureWeights: { orbital: 0.36, arc: 0.32, whip: 0.04, veil: 0.28 },
			baseSpeedScale: 0.92,
			stallStrength: 0.48,
			whipSharpness: 0.45,
			poolPropensity: 0.96,
			spatterPropensity: 1.0,
			ribbonWidthScale: 1.08
		},
		layerAffinities: {
			1: {
				'carbon-indigo': 0.44,
				'file-tape-red': 0.34,
				'carbon-black': 0.22
			},
			2: {
				'carbon-indigo': 0.44,
				'file-tape-red': 0.34,
				'carbon-black': 0.22
			},
			3: {
				'carbon-indigo': 0.36,
				'file-tape-red': 0.28,
				'road-tar-umber': 0.2,
				'carbon-black': 0.16
			},
			4: {
				'lime-whitewash': 0.48,
				'ledger-ochre': 0.24,
				'carbon-indigo': 0.18,
				'file-tape-red': 0.1
			},
			5: {
				'lime-whitewash': 0.74,
				'ledger-ochre': 0.16,
				'carbon-indigo': 0.1
			},
			6: {
				'lime-whitewash': 0.78,
				'ledger-ochre': 0.14,
				'carbon-indigo': 0.08
			}
		}
	}
} as const;

export const STUDY_LIST: readonly StudySpec[] = [
	STUDY_SPECS['pending-file'],
	STUDY_SPECS['public-works-tenders'],
	STUDY_SPECS['counter-middleman'],
	STUDY_SPECS['whitewash-record']
];

export const STUDY_INDEX: Readonly<Record<StudyId, number>> = {
	'pending-file': 0,
	'public-works-tenders': 1,
	'counter-middleman': 2,
	'whitewash-record': 3
};

export function computePaintingFocalPoint(
	depositionPasses: readonly DepositionPass[],
	artboardWidth: number,
	artboardHeight: number
): { x: number; y: number } {
	let weightSum = 0;
	let wx = 0;
	let wy = 0;

	for (const pass of depositionPasses) {
		for (const pool of pass.pools) {
			const w = pool.radius * pool.thickness * (1 + pass.layerIndex * 0.15);
			wx += pool.x * w;
			wy += pool.y * w;
			weightSum += w;
		}
		const n = pass.pointCount;
		const stride = Math.max(1, Math.floor(n / 12));
		for (let k = 0; k < n; k += stride) {
			const w = pass.halfWidth[k]! * (0.4 + pass.dwell[k]!);
			wx += pass.x[k]! * w;
			wy += pass.y[k]! * w;
			weightSum += w;
		}
	}

	if (
		!Number.isFinite(weightSum) ||
		weightSum <= 0 ||
		!Number.isFinite(artboardWidth) ||
		artboardWidth <= 0 ||
		!Number.isFinite(artboardHeight) ||
		artboardHeight <= 0
	) {
		return { x: 0.5, y: 0.5 };
	}

	const nx = Math.min(0.82, Math.max(0.18, wx / weightSum / artboardWidth));
	const ny = Math.min(0.82, Math.max(0.18, wy / weightSum / artboardHeight));
	return {
		x: Number(nx.toFixed(4)),
		y: Number(ny.toFixed(4))
	};
}

export function describePaintingAccessible(state: DripPaintingState, model: PaintingModel): string {
	const spec = Object.prototype.hasOwnProperty.call(STUDY_SPECS, state.study)
		? STUDY_SPECS[state.study]
		: STUDY_SPECS['pending-file'];
	const activePasses = model.depositionPasses;
	const passCount = activePasses.length;
	let maxLayer = 0;
	let totalPools = 0;
	let totalDroplets = 0;
	let totalMass = 0;
	let upperWhitewashMass = 0;

	const massByPigment = new Map<PigmentId, number>();

	for (const pass of activePasses) {
		if (pass.layerIndex > maxLayer) maxLayer = pass.layerIndex;
		totalPools += pass.pools.length;
		totalDroplets += pass.droplets.length;

		let meanHalfWidth = 0;
		const n = pass.pointCount;
		for (let i = 0; i < n; i++) {
			meanHalfWidth += pass.halfWidth[i]!;
		}
		meanHalfWidth = n > 0 ? meanHalfWidth / n : 1;
		let passMass = pass.totalArcLength * meanHalfWidth;
		for (const pool of pass.pools) {
			passMass += pool.radius * pool.radius * 0.4;
		}
		totalMass += passMass;
		massByPigment.set(pass.pigmentKey, (massByPigment.get(pass.pigmentKey) ?? 0) + passMass);
		if (pass.pigmentKey === 'lime-whitewash' && pass.layerIndex >= 4) {
			upperWhitewashMass += passMass;
		}
	}

	const topPigments = Array.from(massByPigment.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([id]) => PALETTE[id].label.toLowerCase());

	const flowWord = state.paintFlow <= 30 ? 'thin' : state.paintFlow <= 65 ? 'moderate' : 'heavy';
	const sweepWord = state.sweepWidth <= 40 ? 'tight' : state.sweepWidth <= 75 ? 'balanced' : 'wide';

	const pigmentPhrase =
		topPigments.length >= 2
			? `${topPigments.slice(0, -1).join(', ')}, and ${topPigments[topPigments.length - 1]}`
			: (topPigments[0] ?? 'studio pigments');

	const veilPhrase =
		totalMass > 0 && upperWhitewashMass / totalMass >= 0.12
			? ', with upper lime-whitewash coats veiling lower strata'
			: '';

	const texturePhrase =
		state.paintTexture === 0 ? 'flat untextured ground' : 'unbleached woven cotton-duck canvas';

	return `${spec.label} non-figurative drip study (seed ${state.seed}) on ${texturePhrase}: ${passCount} passes across ${maxLayer} paint layers with ${flowWord} paint flow (${state.paintFlow}%) and ${sweepWord} sweep (${state.sweepWidth}%), forming ${totalPools} matte pools and ${totalDroplets} spatter droplets led by ${pigmentPhrase}${veilPhrase}.`;
}
