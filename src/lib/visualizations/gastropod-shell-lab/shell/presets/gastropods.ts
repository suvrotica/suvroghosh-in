import {
	APERTURE_CAMERA,
	CHARACTER_CAMERA,
	SIDE_CAMERA,
	TOP_CAMERA,
	definePreset,
	expansionExponent
} from './types';

const GASTROPOD_NOTE =
	'Morphological archetype only; its parameters were not fitted to a specimen or a species.';

export const GASTROPOD_PRESETS = [
	definePreset({
		id: 'turritella-turret',
		title: 'Turritella-like turret',
		shelf: 'gastropod-archetypes',
		scopeBadge: 'Gastropod archetype',
		taxonomicClass: 'Gastropoda',
		morphologicalNote:
			'A tall, many-whorled turret with a narrow aperture and restrained axial ribs.',
		scientificNote: GASTROPOD_NOTE,
		viewHint: 'The side view reveals the high cone-similar spire and repeated whorls.',
		cameraHint: SIDE_CAMERA,
		seed: 0x10a7e11a,
		patch: {
			coiling: {
				turns: 9.2,
				whorlExpansion: 1.48,
				axial: { mode: 'cone-similar', coneSpireRatio: 2.65 }
			},
			aperture: {
				scale: 0.19,
				scaleExponent: expansionExponent(1.48),
				aspectRatio: 1.42,
				profile: 'ellipse'
			},
			ornament: {
				ribs: { enabled: true, countPerTurn: 19, amplitude: 0.085, sharpness: 4.5 }
			}
		}
	}),
	definePreset({
		id: 'conus-body-whorl',
		title: 'Conus-like body whorl',
		shelf: 'gastropod-archetypes',
		scopeBadge: 'Gastropod archetype',
		taxonomicClass: 'Gastropoda',
		morphologicalNote: 'A low spire gives way to a broad, tapering conical adult body whorl.',
		scientificNote: GASTROPOD_NOTE,
		viewHint: 'A three-quarter aperture view shows both the shoulder and long body whorl.',
		cameraHint: APERTURE_CAMERA,
		seed: 0xc0a05eed,
		patch: {
			coiling: {
				turns: 4.1,
				whorlExpansion: 3.3,
				axial: { mode: 'cone-similar', coneSpireRatio: 0.48 }
			},
			aperture: {
				profile: 'superellipse',
				scale: 0.61,
				scaleExponent: expansionExponent(3.3),
				aspectRatio: 2.15,
				superellipseExponent: 3.1,
				eccentricity: -0.12
			},
			ornament: { cords: { enabled: true, count: 12, amplitude: 0.018 } }
		}
	}),
	definePreset({
		id: 'architectonica-sundial',
		title: 'Architectonica-like sundial',
		shelf: 'gastropod-archetypes',
		scopeBadge: 'Gastropod archetype',
		taxonomicClass: 'Gastropoda',
		morphologicalNote: 'A low discoidal coil leaves a conspicuous central umbilicus.',
		scientificNote: GASTROPOD_NOTE,
		viewHint: 'The top view makes the open umbilicus and spiral cords legible.',
		cameraHint: TOP_CAMERA,
		seed: 0xa7c417ec,
		patch: {
			coiling: {
				turns: 7,
				whorlExpansion: 1.56,
				axial: { mode: 'cone-similar', coneSpireRatio: 0.08 }
			},
			aperture: {
				profile: 'ellipse',
				scale: 0.27,
				scaleExponent: expansionExponent(1.56),
				aspectRatio: 0.72
			},
			ornament: {
				cords: { enabled: true, count: 8, amplitude: 0.07, sharpness: 5 },
				ribs: { enabled: true, countPerTurn: 21, amplitude: 0.035 }
			}
		}
	}),
	definePreset({
		id: 'naticid-moon',
		title: 'Moon-snail-like globe',
		shelf: 'gastropod-archetypes',
		scopeBadge: 'Gastropod archetype',
		taxonomicClass: 'Gastropoda',
		morphologicalNote:
			'Rapid expansion and a generous rounded aperture produce a globose body whorl.',
		scientificNote: GASTROPOD_NOTE,
		viewHint: 'The aperture view emphasizes the swollen final whorl and short spire.',
		cameraHint: APERTURE_CAMERA,
		seed: 0x6d00a511,
		patch: {
			coiling: {
				turns: 3.7,
				whorlExpansion: 3.85,
				axial: { mode: 'cone-similar', coneSpireRatio: 0.22 }
			},
			aperture: {
				profile: 'ellipse',
				scale: 0.82,
				scaleExponent: expansionExponent(3.85),
				aspectRatio: 1.14,
				eccentricity: 0.08
			},
			appearance: { roughness: 0.48, microdetail: 0.08 }
		}
	}),
	definePreset({
		id: 'littorina-periwinkle',
		title: 'Littorina-like periwinkle',
		shelf: 'gastropod-archetypes',
		scopeBadge: 'Gastropod archetype',
		taxonomicClass: 'Gastropoda',
		morphologicalNote:
			'A compact familiar spire balances moderate expansion with a rounded-oval opening.',
		scientificNote: GASTROPOD_NOTE,
		viewHint: 'A classic three-quarter view shows the compact spire-to-aperture balance.',
		cameraHint: CHARACTER_CAMERA,
		seed: 0x117701aa,
		patch: {
			coiling: {
				turns: 5.35,
				whorlExpansion: 2.18,
				axial: { mode: 'cone-similar', coneSpireRatio: 0.82 }
			},
			aperture: {
				scale: 0.47,
				scaleExponent: expansionExponent(2.18),
				aspectRatio: 1.32
			},
			ornament: { ribs: { enabled: true, countPerTurn: 27, amplitude: 0.028 } }
		}
	}),
	definePreset({
		id: 'epitonium-wentletrap',
		title: 'Epitonium-like wentletrap',
		shelf: 'gastropod-archetypes',
		scopeBadge: 'Gastropod archetype',
		taxonomicClass: 'Gastropoda',
		morphologicalNote:
			'Strong, regularly repeated axial ribs bridge a slender staircase of whorls.',
		scientificNote: GASTROPOD_NOTE,
		viewHint: 'The side view silhouettes the tall spire and high-relief rib rhythm.',
		cameraHint: SIDE_CAMERA,
		seed: 0xe9170a0f,
		patch: {
			coiling: {
				turns: 7.6,
				whorlExpansion: 1.38,
				axial: { mode: 'cone-similar', coneSpireRatio: 1.62 }
			},
			aperture: {
				scale: 0.24,
				scaleExponent: expansionExponent(1.38),
				aspectRatio: 1.15
			},
			ornament: {
				ribs: { enabled: true, countPerTurn: 14, amplitude: 0.3, sharpness: 11 }
			}
		}
	}),
	definePreset({
		id: 'whelk-shoulder',
		title: 'Whelk-like shoulder',
		shelf: 'gastropod-archetypes',
		scopeBadge: 'Gastropod archetype',
		taxonomicClass: 'Gastropoda',
		morphologicalNote: 'A shouldered body whorl carries nodules where ribs meet spiral cords.',
		scientificNote: GASTROPOD_NOTE,
		viewHint: 'The aperture-side three-quarter view catches the shoulder nodules in profile.',
		cameraHint: CHARACTER_CAMERA,
		seed: 0x0b7e1c55,
		patch: {
			coiling: {
				turns: 5,
				whorlExpansion: 2.42,
				axial: { mode: 'cone-similar', coneSpireRatio: 0.88 }
			},
			aperture: {
				profile: 'lobed',
				scale: 0.55,
				scaleExponent: expansionExponent(2.42),
				aspectRatio: 1.46,
				lobes: 4,
				lobeAmplitude: 0.11
			},
			ornament: {
				ribs: { enabled: true, countPerTurn: 11, amplitude: 0.09, sharpness: 6 },
				cords: { enabled: true, count: 5, amplitude: 0.055 },
				nodules: { enabled: true, amplitude: 0.18, interactionPower: 1.6 }
			}
		}
	}),
	definePreset({
		id: 'bolinus-murex-varices',
		title: 'Bolinus/Murex-like varices',
		shelf: 'gastropod-archetypes',
		scopeBadge: 'Gastropod archetype',
		taxonomicClass: 'Gastropoda',
		morphologicalNote: 'Three episodic varices per turn carry long, smoothly tapered spine rows.',
		scientificNote: GASTROPOD_NOTE,
		viewHint: 'A character view separates the three varix wings and their longest spines.',
		cameraHint: CHARACTER_CAMERA,
		seed: 0xb011a5a3,
		patch: {
			coiling: {
				turns: 4.55,
				whorlExpansion: 2.24,
				axial: { mode: 'cone-similar', coneSpireRatio: 0.57 }
			},
			aperture: {
				profile: 'lobed',
				scale: 0.54,
				scaleExponent: expansionExponent(2.24),
				aspectRatio: 1.48,
				lobes: 6,
				lobeAmplitude: 0.08
			},
			ornament: {
				varices: { enabled: true, countPerTurn: 3, amplitude: 0.42, width: 0.075 },
				spines: {
					enabled: true,
					countAroundAperture: 5,
					length: 1.55,
					width: 0.09,
					taper: 0.9,
					recurvature: 0.22,
					selectedVarices: [0, 1, 2]
				}
			}
		}
	}),
	definePreset({
		id: 'chicoreus-hierarchy',
		title: 'Chicoreus-like hierarchy',
		shelf: 'gastropod-archetypes',
		scopeBadge: 'Gastropod archetype',
		taxonomicClass: 'Gastropoda',
		morphologicalNote:
			'Three primary varices accompany three finite Gaussian-peak levels at progressively finer, evenly spaced base phases.',
		scientificNote: `${GASTROPOD_NOTE} The deterministic multilevel surrogate adds bounded seeded phase jitter; it is finite and fractal-like, not a recursive insertion process or an unbounded hierarchy.`,
		viewHint: 'The oblique character view makes primary, secondary, and tertiary peaks separable.',
		cameraHint: CHARACTER_CAMERA,
		seed: 0xc41c0e05,
		patch: {
			coiling: {
				turns: 4.75,
				whorlExpansion: 2.02,
				axial: { mode: 'cone-similar', coneSpireRatio: 0.68 }
			},
			aperture: {
				profile: 'lobed',
				scale: 0.52,
				scaleExponent: expansionExponent(2.02),
				aspectRatio: 1.52,
				lobes: 6,
				lobeAmplitude: 0.09
			},
			ornament: {
				varices: { enabled: true, countPerTurn: 3, amplitude: 0.34, width: 0.085 },
				spines: {
					enabled: true,
					countAroundAperture: 6,
					length: 1.08,
					width: 0.075,
					recurvature: 0.3,
					selectedVarices: [0, 1, 2]
				},
				hierarchy: {
					enabled: true,
					depth: 3,
					parentChildScale: 0.43,
					insertionBias: 0.18,
					amplitude: 0.34
				}
			}
		}
	}),
	definePreset({
		id: 'bubble-shell-inflated',
		title: 'Bubble-shell-like inflation',
		shelf: 'gastropod-archetypes',
		scopeBadge: 'Gastropod archetype',
		taxonomicClass: 'Gastropoda',
		morphologicalNote:
			'An aperture-dominant, thin-looking envelope nearly hides the reduced spire.',
		scientificNote: GASTROPOD_NOTE,
		viewHint: 'The aperture view emphasizes how the adult opening dominates the shell envelope.',
		cameraHint: APERTURE_CAMERA,
		seed: 0xb0bb1e55,
		patch: {
			coiling: {
				turns: 3.05,
				whorlExpansion: 4.45,
				axial: { mode: 'cone-similar', coneSpireRatio: 0.07 }
			},
			aperture: {
				profile: 'superellipse',
				scale: 1.05,
				scaleExponent: 0.31,
				aspectRatio: 1.62,
				superellipseExponent: 2.6,
				eccentricity: 0.16
			},
			appearance: { roughness: 0.38, microdetail: 0.03 }
		}
	}),
	definePreset({
		id: 'cowrie-late-lip',
		title: 'Cowrie-like late lip',
		shelf: 'gastropod-archetypes',
		scopeBadge: 'Gastropod archetype',
		taxonomicClass: 'Gastropoda',
		morphologicalNote:
			'A smooth inflated shell receives a strong late narrowing and flared adult lip.',
		scientificNote: `${GASTROPOD_NOTE} Real cowrie mantle and lip modification exceeds the simplest swept-aperture description.`,
		viewHint: 'The aperture view puts the deliberately late adult lip modification in front.',
		cameraHint: APERTURE_CAMERA,
		seed: 0xc0a71e12,
		patch: {
			coiling: {
				turns: 3.25,
				whorlExpansion: 5.15,
				axial: { mode: 'cone-similar', coneSpireRatio: 0.04 }
			},
			aperture: {
				profile: 'superellipse',
				scale: 1.12,
				scaleExponent: expansionExponent(5.15),
				aspectRatio: 1.58,
				superellipseExponent: 3.5,
				lipFlare: {
					type: 'keyframes',
					interpolation: 'smooth',
					points: [
						{ age: 0, value: 0 },
						{ age: 0.82, value: 0 },
						{ age: 1, value: 1.15 }
					]
				}
			},
			appearance: { roughness: 0.32, microdetail: 0.02 }
		}
	})
] as const;
