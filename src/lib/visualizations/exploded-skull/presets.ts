import type {
	BackgroundThemeId,
	CameraPresetDefinition,
	CameraPresetId,
	ExplosionDirectionMode,
	ExplosionPresetDefinition,
	ExplosionPresetId,
	MaterialPresetId
} from './types';

export const EXPLOSION_PRESETS: readonly ExplosionPresetDefinition[] = [
	{
		id: 'assembled',
		name: 'Complete Skull',
		subtitle: '0% · Anatomical articulation',
		description:
			'All 22 cranial and facial bones seated in their exact sutural articulations, with the mandible aligned at the temporomandibular joints.',
		defaultExplosion: 0,
		directionMode: 'anatomical',
		defaultCamera: 'three-quarter'
	},
	{
		id: 'slight',
		name: 'Slightly Exploded',
		subtitle: '18% · Sutural relief',
		description:
			'Gentle separation across cranial and facial sutures so interlocking coronal, sagittal, lambdoid, and squamous seams become legible.',
		defaultExplosion: 0.18,
		directionMode: 'anatomical',
		defaultCamera: 'three-quarter'
	},
	{
		id: 'cranial-vault',
		name: 'Cranial Vault',
		subtitle: 'Calvaria separation',
		description:
			'Elevates and opens the frontal, parietal, occipital, and temporal vault bones to expose the endocranial cavity, sphenoid, and ethmoid.',
		defaultExplosion: 0.85,
		directionMode: 'anatomical',
		defaultCamera: 'three-quarter',
		overrides: {
			frontal: { direction: [0, 0.72, 0.69], distance: 0.82 },
			'parietal-left': { direction: [0.58, 0.76, -0.28], distance: 0.92 },
			'parietal-right': { direction: [-0.58, 0.76, -0.28], distance: 0.92 },
			occipital: { direction: [0, 0.22, -0.97], distance: 0.88 },
			'temporal-left': { direction: [0.97, -0.05, -0.22], distance: 0.68 },
			'temporal-right': { direction: [-0.97, -0.05, -0.22], distance: 0.68 },
			sphenoid: { distance: 0.04 },
			ethmoid: { distance: 0.04 },
			'nasal-left': { distance: 0 },
			'nasal-right': { distance: 0 },
			'maxilla-left': { distance: 0 },
			'maxilla-right': { distance: 0 },
			'zygomatic-left': { distance: 0 },
			'zygomatic-right': { distance: 0 },
			'lacrimal-left': { distance: 0 },
			'lacrimal-right': { distance: 0 },
			'palatine-left': { distance: 0 },
			'palatine-right': { distance: 0 },
			'inferior-nasal-concha-left': { distance: 0 },
			'inferior-nasal-concha-right': { distance: 0 },
			vomer: { distance: 0 },
			mandible: { distance: 0 },
			hyoid: { distance: 0 }
		}
	},
	{
		id: 'facial-skeleton',
		name: 'Facial Skeleton',
		subtitle: 'Viscerocranium cascade',
		description:
			'Projects the 14 facial bones forward in tiered anatomical strata—nasals, lacrimals, zygomatics, maxillae, palatines, conchae, vomer, and mandible—from an intact braincase.',
		defaultExplosion: 0.88,
		directionMode: 'anatomical',
		defaultCamera: 'three-quarter',
		overrides: {
			frontal: { distance: 0.05 },
			'parietal-left': { distance: 0 },
			'parietal-right': { distance: 0 },
			'temporal-left': { distance: 0 },
			'temporal-right': { distance: 0 },
			occipital: { distance: 0 },
			sphenoid: { distance: 0 },
			ethmoid: { direction: [0, 0.08, 0.99], distance: 0.34 },
			'nasal-left': { direction: [0.16, 0.34, 0.93], distance: 1.05 },
			'nasal-right': { direction: [-0.16, 0.34, 0.93], distance: 1.05 },
			'lacrimal-left': { direction: [0.46, 0.14, 0.88], distance: 0.84 },
			'lacrimal-right': { direction: [-0.46, 0.14, 0.88], distance: 0.84 },
			'zygomatic-left': { direction: [0.82, -0.06, 0.56], distance: 0.96 },
			'zygomatic-right': { direction: [-0.82, -0.06, 0.56], distance: 0.96 },
			'maxilla-left': { direction: [0.3, -0.34, 0.89], distance: 0.88 },
			'maxilla-right': { direction: [-0.3, -0.34, 0.89], distance: 0.88 },
			'palatine-left': { direction: [0.48, -0.52, 0.42], distance: 0.68 },
			'palatine-right': { direction: [-0.48, -0.52, 0.42], distance: 0.68 },
			'inferior-nasal-concha-left': { direction: [0.42, -0.24, 0.87], distance: 0.72 },
			'inferior-nasal-concha-right': { direction: [-0.42, -0.24, 0.87], distance: 0.72 },
			vomer: { direction: [0, -0.45, 0.89], distance: 0.64 },
			mandible: { direction: [0, -0.78, 0.62], distance: 0.98, rotationXDeg: 10 },
			hyoid: { direction: [0, -0.92, 0.38], distance: 1.06 }
		}
	},
	{
		id: 'cranial-base',
		name: 'Cranial Base',
		subtitle: 'Basicranium & deep midline',
		description:
			'Drops and separates the sphenoid, ethmoid, occipital, temporal, palatine, and vomer bones while rendering the superior vault softly translucent to reveal the skull base.',
		defaultExplosion: 0.85,
		directionMode: 'anatomical',
		defaultCamera: 'basal',
		overrides: {
			frontal: { direction: [0, 0.86, 0.5], distance: 0.64, opacity: 0.24 },
			'parietal-left': { direction: [0.48, 0.86, -0.18], distance: 0.7, opacity: 0.2 },
			'parietal-right': { direction: [-0.48, 0.86, -0.18], distance: 0.7, opacity: 0.2 },
			occipital: { direction: [0, -0.46, -0.88], distance: 0.78 },
			'temporal-left': { direction: [0.92, -0.38, -0.08], distance: 0.76 },
			'temporal-right': { direction: [-0.92, -0.38, -0.08], distance: 0.76 },
			sphenoid: { direction: [0, -0.72, 0.08], distance: 0.54 },
			ethmoid: { direction: [0, -0.34, 0.94], distance: 0.48 },
			'palatine-left': { direction: [0.45, -0.82, 0.35], distance: 0.74 },
			'palatine-right': { direction: [-0.45, -0.82, 0.35], distance: 0.74 },
			vomer: { direction: [0, -0.88, 0.46], distance: 0.66 },
			'nasal-left': { distance: 0.14, opacity: 0.45 },
			'nasal-right': { distance: 0.14, opacity: 0.45 },
			'lacrimal-left': { distance: 0.18, opacity: 0.45 },
			'lacrimal-right': { distance: 0.18, opacity: 0.45 },
			'inferior-nasal-concha-left': { distance: 0.25, opacity: 0.55 },
			'inferior-nasal-concha-right': { distance: 0.25, opacity: 0.55 },
			'maxilla-left': { distance: 0.22, opacity: 0.35 },
			'maxilla-right': { distance: 0.22, opacity: 0.35 },
			'zygomatic-left': { distance: 0.28, opacity: 0.35 },
			'zygomatic-right': { distance: 0.28, opacity: 0.35 },
			mandible: { direction: [0, -0.95, 0.32], distance: 0.86, opacity: 0.28 },
			hyoid: { distance: 0.9, opacity: 0.28 }
		}
	},
	{
		id: 'mandible',
		name: 'Mandible Separation',
		subtitle: 'TMJ & lower jaw study',
		description:
			'Depresses and advances the mandible smoothly around the temporomandibular hinge while keeping the cranium assembled for occlusal and condylar inspection.',
		defaultExplosion: 0.85,
		directionMode: 'anatomical',
		defaultCamera: 'three-quarter',
		showHyoidByDefault: true,
		overrides: {
			frontal: { distance: 0 },
			'parietal-left': { distance: 0 },
			'parietal-right': { distance: 0 },
			'temporal-left': { distance: 0 },
			'temporal-right': { distance: 0 },
			occipital: { distance: 0 },
			sphenoid: { distance: 0 },
			ethmoid: { distance: 0 },
			'nasal-left': { distance: 0 },
			'nasal-right': { distance: 0 },
			'maxilla-left': { distance: 0 },
			'maxilla-right': { distance: 0 },
			'zygomatic-left': { distance: 0 },
			'zygomatic-right': { distance: 0 },
			'lacrimal-left': { distance: 0 },
			'lacrimal-right': { distance: 0 },
			'palatine-left': { distance: 0 },
			'palatine-right': { distance: 0 },
			'inferior-nasal-concha-left': { distance: 0 },
			'inferior-nasal-concha-right': { distance: 0 },
			vomer: { distance: 0 },
			mandible: { direction: [0, -0.84, 0.54], distance: 0.85, rotationXDeg: 14 },
			hyoid: { direction: [0, -0.97, 0.24], distance: 1.05 }
		}
	},
	{
		id: 'museum-exploded',
		name: 'Maximum Museum Exploded View',
		subtitle: '100% · Beauchene osteological spread',
		description:
			'Full Beauchene-style museum presentation dispersing all cranial vault, cranial base, deep nasal, facial, mandibular, and hyoid elements into readable 3D strata.',
		defaultExplosion: 1.0,
		directionMode: 'anatomical',
		defaultCamera: 'three-quarter',
		showHyoidByDefault: true
	},
	{
		id: 'custom',
		name: 'Custom Arrangement',
		subtitle: 'User-tuned offsets & distances',
		description:
			'Combines the global explosion scale with your per-bone distances, directional mode, and manual offsets.',
		defaultExplosion: 0.65,
		directionMode: 'anatomical',
		defaultCamera: 'three-quarter'
	}
] as const;

export const PRESET_BY_ID: Readonly<Record<ExplosionPresetId, ExplosionPresetDefinition>> =
	Object.fromEntries(EXPLOSION_PRESETS.map((preset) => [preset.id, preset])) as Record<
		ExplosionPresetId,
		ExplosionPresetDefinition
	>;

export const EXPLOSION_DIRECTION_MODES: readonly {
	id: ExplosionDirectionMode;
	label: string;
	description: string;
}[] = [
	{
		id: 'anatomical',
		label: 'Anatomical (Beauchene)',
		description: 'Per-bone curated museum vectors radiating cleanly along suture planes.'
	},
	{
		id: 'radial',
		label: 'Radial from center',
		description: 'Uniform outward displacement from the anatomical centroid of the skull.'
	},
	{
		id: 'superior-inferior',
		label: 'Superior / Inferior (Y)',
		description: 'Separates cranial vault, midface, mandible, and hyoid along the vertical axis.'
	},
	{
		id: 'anterior-posterior',
		label: 'Anterior / Posterior (Z)',
		description: 'Separates nasal, facial, central base, and occipital structures front-to-back.'
	},
	{
		id: 'left-right',
		label: 'Left / Right (X)',
		description: 'Separates paired bones laterally across the midsagittal plane.'
	},
	{
		id: 'custom',
		label: 'Custom offsets',
		description: 'Applies your individual bone vector offsets alongside anatomical baselines.'
	}
] as const;

export const CAMERA_PRESETS: readonly CameraPresetDefinition[] = [
	{
		id: 'three-quarter',
		label: 'Three-quarter perspective',
		shortLabel: '3/4',
		anatomicalAspect: 'Oblique anterolateral museum view',
		description: 'Balanced oblique perspective showing vault, orbit, zygomatic arch, and jaw.',
		direction: [0.64, 0.22, 0.74],
		up: [0, 1, 0],
		distance: 6.0
	},
	{
		id: 'anterior',
		label: 'Anterior view',
		shortLabel: 'Anterior',
		anatomicalAspect: 'Norma frontalis',
		description: 'Direct frontal face view (anatomical left is on the viewer’s right).',
		direction: [0, 0.04, 1],
		up: [0, 1, 0],
		distance: 4.8
	},
	{
		id: 'posterior',
		label: 'Posterior view',
		shortLabel: 'Posterior',
		anatomicalAspect: 'Norma occipitalis',
		description: 'Occipital aspect showing the lambdoid and sagittal sutures.',
		direction: [0, 0.05, -1],
		up: [0, 1, 0],
		distance: 4.8
	},
	{
		id: 'left-lateral',
		label: 'Left lateral view',
		shortLabel: 'Left',
		anatomicalAspect: 'Norma lateralis sinistra',
		description: 'Anatomical left profile showing pterion, squamous suture, and zygomatic arch.',
		direction: [1, 0.03, 0],
		up: [0, 1, 0],
		distance: 4.9
	},
	{
		id: 'right-lateral',
		label: 'Right lateral view',
		shortLabel: 'Right',
		anatomicalAspect: 'Norma lateralis dextra',
		description: 'Anatomical right profile showing external acoustic meatus and mandibular ramus.',
		direction: [-1, 0.03, 0],
		up: [0, 1, 0],
		distance: 4.9
	},
	{
		id: 'superior',
		label: 'Superior view',
		shortLabel: 'Superior',
		anatomicalAspect: 'Norma verticalis',
		description:
			'Overhead cranial vault aspect highlighting coronal, sagittal, and lambdoid sutures.',
		direction: [0, 1, 0.01],
		up: [0, 0, -1],
		distance: 4.8
	},
	{
		id: 'inferior',
		label: 'Inferior view',
		shortLabel: 'Inferior',
		anatomicalAspect: 'Norma inferior',
		description: 'Direct underside aspect showing mandibular body, hard palate, and skull floor.',
		direction: [0, -1, 0.02],
		up: [0, 0, 1],
		distance: 4.8
	},
	{
		id: 'basal',
		label: 'Basal view',
		shortLabel: 'Basal',
		anatomicalAspect: 'Norma basalis (oblique)',
		description:
			'Inferoposterior oblique angle framing the foramen magnum, occipital condyles, sphenoid, and choanae.',
		direction: [0.18, -0.84, -0.51],
		up: [0, 0, 1],
		distance: 4.9
	}
] as const;

export const CAMERA_PRESET_BY_ID: Readonly<Record<CameraPresetId, CameraPresetDefinition>> =
	Object.fromEntries(CAMERA_PRESETS.map((preset) => [preset.id, preset])) as Record<
		CameraPresetId,
		CameraPresetDefinition
	>;

export const MATERIAL_PRESETS: readonly {
	id: MaterialPresetId;
	label: string;
	color: string;
	roughness: number;
	metalness: number;
	baseOpacity: number;
	description: string;
}[] = [
	{
		id: 'museum-ivory',
		label: 'Museum Ivory',
		color: '#dfd3b8',
		roughness: 0.58,
		metalness: 0.02,
		baseOpacity: 1,
		description: 'Warm natural mineral ivory calibrated for osteological contrast.'
	},
	{
		id: 'aged-osteology',
		label: 'Aged Specimen',
		color: '#ccb68e',
		roughness: 0.68,
		metalness: 0.02,
		baseOpacity: 1,
		description: 'Historical cabinet patina with matte dry trabecular character.'
	},
	{
		id: 'bleached-specimen',
		label: 'Laboratory Bleached',
		color: '#eeeae0',
		roughness: 0.46,
		metalness: 0.01,
		baseOpacity: 1,
		description: 'High-albedo prepared study bone for bright anatomical legibility.'
	},
	{
		id: 'porcelain-cast',
		label: 'Porcelain Cast',
		color: '#e5e2db',
		roughness: 0.28,
		metalness: 0.04,
		baseOpacity: 1,
		description: 'Smooth glazed anatomical museum replica finish.'
	},
	{
		id: 'translucent-study',
		label: 'Translucent Study',
		color: '#dbd3c1',
		roughness: 0.42,
		metalness: 0.03,
		baseOpacity: 0.42,
		description:
			'Semi-translucent bone shell allowing internal cranial structures to shine through.'
	}
] as const;

export const BACKGROUND_THEMES: readonly {
	id: BackgroundThemeId;
	label: string;
	hex: string;
	radialCenter: string;
	isLight: boolean;
}[] = [
	{
		id: 'museum-charcoal',
		label: 'Museum Charcoal',
		hex: '#0e0f12',
		radialCenter: '#1b1d22',
		isLight: false
	},
	{
		id: 'obsidian-vault',
		label: 'Obsidian Vitrine',
		hex: '#060709',
		radialCenter: '#121318',
		isLight: false
	},
	{
		id: 'midnight-slate',
		label: 'Midnight Blue',
		hex: '#0b1220',
		radialCenter: '#16233b',
		isLight: false
	},
	{
		id: 'warm-parchment',
		label: 'Study Parchment',
		hex: '#e7e0d3',
		radialCenter: '#f3eee4',
		isLight: true
	}
] as const;
