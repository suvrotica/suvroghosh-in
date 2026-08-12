import {
	APERTURE_CAMERA,
	CHARACTER_CAMERA,
	SIDE_CAMERA,
	TOP_CAMERA,
	definePreset,
	expansionExponent
} from './types';

const EXPERIMENT_NOTE =
	'This is a deterministic mathematical experiment, not a biological taxon or a claim about a developmental mechanism.';

export const EXPERIMENT_PRESETS = [
	definePreset({
		id: 'oscillating-twist',
		title: 'Oscillating twist',
		shelf: 'mathematical-experiments',
		scopeBadge: 'Mathematical experiment',
		taxonomicClass: 'Mathematical model',
		morphologicalNote:
			'A sinusoidal roll rate rotates an elliptical aperture back and forth during growth.',
		scientificNote: `${EXPERIMENT_NOTE} Its lecture lift has a self-similar top view, but the complete lifted 3D curve is not strictly self-similar.`,
		viewHint:
			'The oblique character view reveals the aperture roll while retaining the lifted axis.',
		cameraHint: CHARACTER_CAMERA,
		seed: 0x05c111a7,
		patch: {
			coiling: {
				whorlExpansion: 2.1,
				axial: { mode: 'lecture-lift', risePerTurn: 0.46 }
			},
			aperture: {
				profile: 'ellipse',
				scale: 0.46,
				scaleExponent: expansionExponent(2.1),
				aspectRatio: 2.05
			},
			twist: {
				rate: { type: 'sinusoid', offset: 0, amplitude: 9.5, cycles: 3.5, phase: 0.35 }
			}
		}
	}),
	definePreset({
		id: 'switching-chirality',
		title: 'Alternating winding sense',
		shelf: 'mathematical-experiments',
		scopeBadge: 'Mathematical experiment',
		taxonomicClass: 'Mathematical model',
		morphologicalNote:
			'A smooth authored control law reverses the centreline winding direction twice.',
		scientificNote: `${EXPERIMENT_NOTE} This is an authored path control, not a claim that an organism reverses biological chirality.`,
		viewHint: 'The top view makes both authored reversals in winding direction easiest to trace.',
		cameraHint: TOP_CAMERA,
		seed: 0x5a17c411,
		patch: {
			engine: 'accretion',
			coiling: {
				turns: 6.2,
				whorlExpansion: 1.82,
				handednessLaw: {
					type: 'keyframes',
					interpolation: 'smooth',
					points: [
						{ age: 0, value: 1 },
						{ age: 0.32, value: 1 },
						{ age: 0.48, value: -1 },
						{ age: 0.7, value: -1 },
						{ age: 0.86, value: 1 },
						{ age: 1, value: 1 }
					]
				},
				axial: { mode: 'keyframed' }
			},
			aperture: { scale: 0.25, scaleExponent: expansionExponent(1.82) }
		}
	}),
	definePreset({
		id: 'meandering-centerline',
		title: 'Meandering centerline',
		shelf: 'mathematical-experiments',
		scopeBadge: 'Mathematical experiment',
		taxonomicClass: 'Mathematical model',
		morphologicalNote:
			'Coupled curvature laws make the aperture wander through a broad three-dimensional path.',
		scientificNote: `${EXPERIMENT_NOTE} The engine is a local kinematic frame model, not a tissue mechanics solver.`,
		viewHint: 'A wide character view preserves the full spatial excursion.',
		cameraHint: CHARACTER_CAMERA,
		seed: 0x6ea0de12,
		patch: {
			engine: 'accretion',
			coiling: {
				turns: 5.4,
				whorlExpansion: 1.72,
				axial: { mode: 'keyframed' },
				meander: {
					radialAmplitude: 0.92,
					axialAmplitude: 0.78,
					cycles: 1.8,
					phase: 0.8
				}
			},
			aperture: { profile: 'circle', scale: 0.2, scaleExponent: expansionExponent(1.72) },
			kinematics: {
				curvature1: {
					type: 'sinusoid',
					offset: 0.42,
					amplitude: 0.75,
					cycles: 1.8,
					phase: 0.8
				},
				curvature2: {
					type: 'sinusoid',
					offset: 0.12,
					amplitude: 0.62,
					cycles: 2.4,
					phase: 0.1
				}
			}
		}
	}),
	definePreset({
		id: 'open-loose-coil',
		title: 'Open loose coil',
		shelf: 'mathematical-experiments',
		scopeBadge: 'Mathematical experiment',
		taxonomicClass: 'Mathematical model',
		morphologicalNote:
			'Expansion stays close to the circle limit while a small aperture leaves large gaps between turns.',
		scientificNote: EXPERIMENT_NOTE,
		viewHint: 'The top view exposes the unusual near-constant-radius spacing.',
		cameraHint: TOP_CAMERA,
		seed: 0x1005ec01,
		safety: 'warning',
		expectedDiagnosticCodes: ['whorl-expansion-unsafe-range'],
		patch: {
			coiling: {
				turns: 10.5,
				whorlExpansion: 1.015,
				axial: { mode: 'planispiral' }
			},
			aperture: {
				profile: 'circle',
				scale: 0.13,
				scaleExponent: expansionExponent(1.015),
				aspectRatio: 1
			}
		}
	}),
	definePreset({
		id: 'cathedral-spire',
		title: 'Cathedral spire',
		shelf: 'mathematical-experiments',
		scopeBadge: 'Mathematical experiment',
		taxonomicClass: 'Mathematical model',
		morphologicalNote:
			'An extreme cone-similar lift stretches nested whorls into a needle-like tower.',
		scientificNote: EXPERIMENT_NOTE,
		viewHint: 'A low side view fits the tall strict cone-similar construction.',
		cameraHint: SIDE_CAMERA,
		seed: 0xca7edaa1,
		safety: 'warning',
		expectedDiagnosticCodes: ['cone-spire-unsafe-range'],
		patch: {
			coiling: {
				turns: 8.8,
				whorlExpansion: 1.62,
				axial: { mode: 'cone-similar', coneSpireRatio: 4.45 }
			},
			aperture: { scale: 0.14, scaleExponent: expansionExponent(1.62), aspectRatio: 1.75 },
			ornament: { ribs: { enabled: true, countPerTurn: 9, amplitude: 0.09 } }
		}
	}),
	definePreset({
		id: 'extreme-lip-flare',
		title: 'Extreme lip flare',
		shelf: 'mathematical-experiments',
		scopeBadge: 'Mathematical experiment',
		taxonomicClass: 'Mathematical model',
		morphologicalNote:
			'Almost all aperture flare is deferred to the final eight per cent of growth.',
		scientificNote: EXPERIMENT_NOTE,
		viewHint: 'The aperture view centers the sudden adult terminal expansion.',
		cameraHint: APERTURE_CAMERA,
		seed: 0xf1a4e801,
		patch: {
			coiling: {
				turns: 4.2,
				whorlExpansion: 2.75,
				axial: { mode: 'cone-similar', coneSpireRatio: 0.52 }
			},
			aperture: {
				profile: 'superellipse',
				scale: 0.48,
				scaleExponent: expansionExponent(2.75),
				aspectRatio: 1.85,
				lipFlare: {
					type: 'keyframes',
					interpolation: 'smooth',
					points: [
						{ age: 0, value: 0 },
						{ age: 0.88, value: 0 },
						{ age: 0.96, value: 1.25 },
						{ age: 1, value: 2.8 }
					]
				}
			}
		}
	}),
	definePreset({
		id: 'nested-ribs',
		title: 'Nested ribs',
		shelf: 'mathematical-experiments',
		scopeBadge: 'Mathematical experiment',
		taxonomicClass: 'Mathematical model',
		morphologicalNote:
			'Coarse ribs, fine cords, and two evenly phased Gaussian-peak levels create a finite multiscale rhythm.',
		scientificNote: `${EXPERIMENT_NOTE} The Gaussian-peak hierarchy uses evenly spaced base phases with bounded seeded jitter; it is finite and fractal-like, not recursive insertion or an unbounded hierarchy.`,
		viewHint: 'A close character view separates the coarse and fine ornament scales.',
		cameraHint: CHARACTER_CAMERA,
		seed: 0xae57ed12,
		patch: {
			coiling: { whorlExpansion: 2.05, axial: { mode: 'cone-similar', coneSpireRatio: 0.76 } },
			aperture: { scale: 0.42, scaleExponent: expansionExponent(2.05), aspectRatio: 1.38 },
			ornament: {
				ribs: { enabled: true, countPerTurn: 52, amplitude: 0.095, sharpness: 8 },
				cords: { enabled: true, count: 13, amplitude: 0.04, sharpness: 6 },
				hierarchy: {
					enabled: true,
					depth: 2,
					parentChildScale: 0.34,
					insertionBias: -0.2,
					amplitude: 0.16
				}
			}
		}
	}),
	definePreset({
		id: 'finite-fractal-like-murex',
		title: 'Finite fractal-like murex',
		shelf: 'mathematical-experiments',
		scopeBadge: 'Mathematical experiment',
		taxonomicClass: 'Mathematical model',
		morphologicalNote:
			'Six explicitly finite Gaussian-peak levels at progressively finer, evenly spaced base phases accompany three primary varices.',
		scientificNote: `${EXPERIMENT_NOTE} “Fractal-like” refers to a capped multilevel surrogate with bounded seeded phase jitter, not recursive insertion or a mathematically infinite construction.`,
		viewHint: 'The oblique view reads the hierarchy from primary fins down to the smallest peaks.',
		cameraHint: CHARACTER_CAMERA,
		seed: 0xf12ac7a1,
		safety: 'warning',
		expectedDiagnosticCodes: ['hierarchy-depth-unsafe-range'],
		patch: {
			coiling: {
				turns: 4.4,
				whorlExpansion: 1.96,
				axial: { mode: 'cone-similar', coneSpireRatio: 0.63 }
			},
			aperture: {
				profile: 'lobed',
				scale: 0.48,
				scaleExponent: expansionExponent(1.96),
				lobes: 7,
				lobeAmplitude: 0.11
			},
			ornament: {
				varices: { enabled: true, countPerTurn: 3, amplitude: 0.38, width: 0.07 },
				spines: { enabled: true, countAroundAperture: 7, length: 1.35, width: 0.06 },
				hierarchy: {
					enabled: true,
					depth: 6,
					parentChildScale: 0.31,
					insertionBias: 0.24,
					amplitude: 0.38
				}
			}
		}
	}),
	definePreset({
		id: 'alternating-spine-rows',
		title: 'Alternating spine rows',
		shelf: 'mathematical-experiments',
		scopeBadge: 'Mathematical experiment',
		taxonomicClass: 'Mathematical model',
		morphologicalNote:
			'A changing spine phase alternates two rows across successive varix episodes.',
		scientificNote: EXPERIMENT_NOTE,
		viewHint: 'The aperture-side view separates alternating rows along the final whorl.',
		cameraHint: APERTURE_CAMERA,
		seed: 0xa17e2a7e,
		patch: {
			coiling: {
				turns: 4.8,
				whorlExpansion: 2.12,
				axial: { mode: 'cone-similar', coneSpireRatio: 0.72 }
			},
			aperture: { scale: 0.5, scaleExponent: expansionExponent(2.12), aspectRatio: 1.42 },
			twist: { rate: { type: 'sinusoid', offset: 0, amplitude: 3.1, cycles: 6, phase: 0 } },
			ornament: {
				varices: { enabled: true, countPerTurn: 4, amplitude: 0.24, width: 0.06 },
				spines: {
					enabled: true,
					countAroundAperture: 4,
					length: 1.28,
					width: 0.08,
					recurvature: -0.25,
					selectedVarices: [0, 2]
				}
			}
		}
	}),
	definePreset({
		id: 'allometric-giant-body-whorl',
		title: 'Allometric giant body whorl',
		shelf: 'mathematical-experiments',
		scopeBadge: 'Mathematical experiment',
		taxonomicClass: 'Mathematical model',
		morphologicalNote:
			'The aperture exponent exceeds the centerline exponent, so the adult opening outruns the coil.',
		scientificNote: `${EXPERIMENT_NOTE} It is explicitly allometric because aperture and centerline growth rates differ.`,
		viewHint: 'The aperture view makes the disproportionate adult body whorl unmistakable.',
		cameraHint: APERTURE_CAMERA,
		seed: 0xa1106e7c,
		patch: {
			coiling: {
				turns: 4.6,
				whorlExpansion: 2.2,
				axial: { mode: 'cone-similar', coneSpireRatio: 0.58 }
			},
			aperture: {
				profile: 'ellipse',
				scale: 0.86,
				scaleExponent: 0.39,
				aspectRatio: 1.65,
				scaleModulation: {
					type: 'hermite',
					start: 0.62,
					end: 1.18,
					startSlope: 0,
					endSlope: 0,
					clampOvershoot: true
				}
			}
		}
	}),
	definePreset({
		id: 'forbidden-self-intersection',
		title: 'Forbidden self-intersecting shell',
		shelf: 'mathematical-experiments',
		scopeBadge: 'Mathematical experiment',
		taxonomicClass: 'Mathematical model',
		morphologicalNote:
			'A huge aperture on a slowly expanding coil deliberately crosses earlier growth strips.',
		scientificNote: `${EXPERIMENT_NOTE} It is intentionally outside the safe morphospace and should report likely self-intersection without crashing.`,
		viewHint: 'The top view reveals where non-adjacent aperture histories collide.',
		cameraHint: TOP_CAMERA,
		seed: 0xf0ab1dde,
		safety: 'intentional-invalid',
		expectedDiagnosticCodes: ['aperture-axis-ratio-unsafe-range', 'self-intersection-likely'],
		patch: {
			coiling: { turns: 5.8, whorlExpansion: 1.18, axial: { mode: 'planispiral' } },
			aperture: {
				profile: 'circle',
				scale: 1.34,
				scaleExponent: expansionExponent(1.18),
				aspectRatio: 1
			},
			ornament: { ribs: { enabled: true, countPerTurn: 7, amplitude: 0.06 } }
		}
	}),
	definePreset({
		id: 'seeded-asymmetrical-mutant',
		title: 'Seeded asymmetrical mutant',
		shelf: 'mathematical-experiments',
		scopeBadge: 'Mathematical experiment',
		taxonomicClass: 'Mathematical model',
		morphologicalNote:
			'Band-limited seeded imperfection offsets growth and ornament without becoming a generic noise knob.',
		scientificNote: `${EXPERIMENT_NOTE} The fixed seed reproduces the same bounded asymmetry at every quality.`,
		viewHint: 'The character view shows asymmetric departures on both silhouette and ornament.',
		cameraHint: CHARACTER_CAMERA,
		seed: 0x5eededaa,
		patch: {
			coiling: {
				turns: 5.1,
				whorlExpansion: 2.34,
				axial: { mode: 'cone-similar', coneSpireRatio: 0.93 }
			},
			aperture: {
				profile: 'fourier',
				scale: 0.47,
				scaleExponent: expansionExponent(2.34),
				fourier: [
					{ harmonic: 2, cos: 0.11, sin: -0.04 },
					{ harmonic: 5, cos: -0.025, sin: 0.045 }
				]
			},
			ornament: {
				ribs: { enabled: true, countPerTurn: 17, amplitude: 0.08, phase: 0.4 },
				imperfection: {
					enabled: true,
					amplitude: 0.22,
					bandLimit: 7,
					timingJitter: 0.13
				}
			}
		}
	})
] as const;
