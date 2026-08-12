import {
	CHARACTER_CAMERA,
	SIDE_CAMERA,
	TOP_CAMERA,
	definePreset,
	expansionExponent
} from './types';

export const COMPARATIVE_PRESETS = [
	definePreset({
		id: 'nautilus-planispiral',
		title: 'Nautilus-like planispiral',
		shelf: 'comparative-molluscs',
		scopeBadge: 'Comparative mollusc · cephalopod',
		taxonomicClass: 'Cephalopoda',
		morphologicalNote:
			'A smooth, tightly coiled planispiral comparison with nearly circular aperture.',
		scientificNote:
			'This is a cephalopod-inspired mathematical comparison, not a gastropod and not a specimen reconstruction.',
		viewHint: 'The top view makes the planispiral geometry and central coiling axis explicit.',
		cameraHint: TOP_CAMERA,
		seed: 0x0a071105,
		patch: {
			coiling: {
				turns: 7.4,
				whorlExpansion: 1.36,
				axial: { mode: 'planispiral', coneSpireRatio: 0 }
			},
			aperture: {
				profile: 'circle',
				scale: 0.21,
				scaleExponent: expansionExponent(1.36),
				aspectRatio: 1
			},
			appearance: { roughness: 0.44, microdetail: 0.04 }
		}
	}),
	definePreset({
		id: 'ammonite-ribbed',
		title: 'Ribbed ammonite-like planispiral',
		shelf: 'comparative-molluscs',
		scopeBadge: 'Comparative mollusc · extinct cephalopod',
		taxonomicClass: 'Cephalopoda',
		morphologicalNote: 'Dense comarginal ribs articulate an otherwise regular planispiral coil.',
		scientificNote:
			'Ammonites were extinct cephalopods, not a gastropod lineage; this is a broad morphological inspiration only.',
		viewHint: 'A near-side view keeps the planispiral silhouette while raking across the ribs.',
		cameraHint: SIDE_CAMERA,
		seed: 0xa660117e,
		patch: {
			coiling: {
				turns: 8.1,
				whorlExpansion: 1.29,
				axial: { mode: 'planispiral', coneSpireRatio: 0 }
			},
			aperture: {
				profile: 'ellipse',
				scale: 0.195,
				scaleExponent: expansionExponent(1.29),
				aspectRatio: 0.84
			},
			ornament: {
				ribs: { enabled: true, countPerTurn: 31, amplitude: 0.12, sharpness: 5.5 }
			}
		}
	}),
	definePreset({
		id: 'nipponites-heteromorph',
		title: 'Nipponites-inspired heteromorph',
		shelf: 'comparative-molluscs',
		scopeBadge: 'Comparative mollusc · extinct cephalopod',
		taxonomicClass: 'Cephalopoda',
		morphologicalNote: 'A local-frame path loops and meanders away from regular planar coiling.',
		scientificNote:
			'Nipponites was an extinct heteromorph ammonite—a cephalopod, explicitly not a gastropod; this path is only inspired by its unusual coiling.',
		viewHint: 'The wide character view keeps the complete meandering centerline inside the frame.',
		cameraHint: CHARACTER_CAMERA,
		seed: 0x71a0017e,
		patch: {
			engine: 'accretion',
			coiling: {
				turns: 5.8,
				whorlExpansion: 1.68,
				axial: { mode: 'keyframed' },
				meander: {
					radialAmplitude: 0.78,
					axialAmplitude: 0.68,
					cycles: 2.7,
					phase: 0.45
				}
			},
			aperture: {
				profile: 'circle',
				scale: 0.17,
				scaleExponent: expansionExponent(1.68),
				aspectRatio: 1
			},
			kinematics: {
				speed: { type: 'sinusoid', offset: 1, amplitude: 0.16, cycles: 2, phase: 0.2 },
				curvature1: {
					type: 'sinusoid',
					offset: 0.35,
					amplitude: 0.82,
					cycles: 2.7,
					phase: 0.4
				},
				curvature2: {
					type: 'sinusoid',
					offset: 0,
					amplitude: 0.68,
					cycles: 1.35,
					phase: 1.1
				},
				twistRate: {
					type: 'sinusoid',
					offset: 0.18,
					amplitude: 0.32,
					cycles: 2.7,
					phase: 0
				}
			},
			ornament: { ribs: { enabled: true, countPerTurn: 22, amplitude: 0.055 } }
		}
	})
] as const;
