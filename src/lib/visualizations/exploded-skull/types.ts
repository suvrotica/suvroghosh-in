export type Vec3 = [number, number, number];

export type BoneCategory = 'neurocranium' | 'viscerocranium' | 'mandible' | 'associated';

export type BoneSide = 'left' | 'right' | 'midline';

export type BoneId =
	| 'frontal'
	| 'parietal-left'
	| 'parietal-right'
	| 'temporal-left'
	| 'temporal-right'
	| 'occipital'
	| 'sphenoid'
	| 'ethmoid'
	| 'nasal-left'
	| 'nasal-right'
	| 'maxilla-left'
	| 'maxilla-right'
	| 'zygomatic-left'
	| 'zygomatic-right'
	| 'lacrimal-left'
	| 'lacrimal-right'
	| 'palatine-left'
	| 'palatine-right'
	| 'inferior-nasal-concha-left'
	| 'inferior-nasal-concha-right'
	| 'vomer'
	| 'mandible'
	| 'hyoid';

export type ExplosionDirectionMode =
	| 'anatomical'
	| 'radial'
	| 'superior-inferior'
	| 'anterior-posterior'
	| 'left-right'
	| 'custom';

export type ExplosionPresetId =
	| 'assembled'
	| 'slight'
	| 'cranial-vault'
	| 'facial-skeleton'
	| 'cranial-base'
	| 'mandible'
	| 'museum-exploded'
	| 'custom';

export type CameraPresetId =
	| 'three-quarter'
	| 'anterior'
	| 'posterior'
	| 'left-lateral'
	| 'right-lateral'
	| 'superior'
	| 'inferior'
	| 'basal';

export type MaterialPresetId =
	| 'museum-ivory'
	| 'aged-osteology'
	| 'bleached-specimen'
	| 'porcelain-cast'
	| 'translucent-study';

export type BackgroundThemeId =
	| 'museum-charcoal'
	| 'obsidian-vault'
	| 'midnight-slate'
	| 'warm-parchment';

export type LabelDensity = 'selected-and-key' | 'all-visible';

export interface PresetBoneDelta {
	direction?: Vec3;
	distance?: number;
	rotationXDeg?: number;
	opacity?: number;
	visible?: boolean;
}

export interface SkullBoneMetadata {
	readonly id: BoneId;
	readonly bp3dPartId: string;
	readonly fmaId: string;
	readonly name: string;
	readonly shortName: string;
	readonly commonName?: string;
	readonly latinName: string;
	readonly category: BoneCategory;
	readonly side: BoneSide;
	readonly pairedGroup?: string;
	readonly isMajorLandmark: boolean;
	/** Assembled centroid in skull-centered coordinates (1 unit = 100 mm). */
	readonly anatomicalPosition: Vec3;
	readonly boundsMin: Vec3;
	readonly boundsMax: Vec3;
	/** Default unit anatomical explosion direction in skull-centered space. */
	readonly explosionDirection: Vec3;
	/** Default Beauchene displacement distance (in scene units, 1 unit = 100 mm). */
	readonly explosionDistance: number;
	readonly location: string;
	readonly functions: readonly string[];
	readonly articulations: readonly string[];
	readonly landmarks: readonly string[];
	readonly clinicalSignificance: string;
}

export interface BoneOverrideState {
	visible: boolean;
	opacity: number;
	/** Multiplier on the bone's explosion distance (1 = default preset distance). */
	explosionDistance: number;
	/** Additional directional offset in scene units (1 unit = 100 mm). */
	customOffset: Vec3;
}

export interface AppearanceSettings {
	materialPreset: MaterialPresetId;
	boneColor: string;
	roughness: number;
	backgroundTheme: BackgroundThemeId;
	showSutures: boolean;
	wireframe: boolean;
	showDentition: boolean;
	showHyoid: boolean;
	showGhostReference: boolean;
	showArmatureFilaments: boolean;
}

export interface DisplaySettings {
	showLabels: boolean;
	showBoneNames: boolean;
	labelDensity: LabelDensity;
	showAxisIndicator: boolean;
	showCoordinateGrid: boolean;
	showBoneList: boolean;
	showInfoPanel: boolean;
}

export interface RotationSettings {
	xDeg: number;
	yDeg: number;
	zDeg: number;
	autoRotate: boolean;
	autoRotateSpeed: number;
}

export interface SkullViewerState {
	version: 1;
	presetId: ExplosionPresetId;
	globalExplosion: number; // 0..1
	directionMode: ExplosionDirectionMode;
	animationSpeed: number; // 0.25..2.5
	globalVisible: boolean;
	compareAssembled: boolean;
	selectedBoneIds: BoneId[];
	isolatedBoneIds: BoneId[];
	boneOverrides: Record<BoneId, BoneOverrideState>;
	rotation: RotationSettings;
	cameraPreset: CameraPresetId;
	appearance: AppearanceSettings;
	display: DisplaySettings;
}

export interface SavedSkullConfiguration {
	id: string;
	name: string;
	savedAt: string;
	camera?: { position: Vec3; target: Vec3 };
	state: SkullViewerState;
}

export interface ComputedBoneTransform {
	boneId: BoneId;
	position: Vec3;
	rotationRad: Vec3;
	visible: boolean;
	opacity: number;
	displacementMm: number;
}

export interface ProjectedBoneLabel {
	boneId: BoneId;
	label: string;
	shortName: string;
	category: BoneCategory;
	side: BoneSide;
	anchorX: number;
	anchorY: number;
	labelX: number;
	labelY: number;
	depth: number;
	selected: boolean;
	hovered: boolean;
	displacementMm: number;
}

export interface ExplosionPresetDefinition {
	id: ExplosionPresetId;
	name: string;
	subtitle: string;
	description: string;
	defaultExplosion: number;
	directionMode: ExplosionDirectionMode;
	defaultCamera: CameraPresetId;
	showHyoidByDefault?: boolean;
	overrides?: Partial<Record<BoneId, PresetBoneDelta>>;
}

export interface CameraPresetDefinition {
	id: CameraPresetId;
	label: string;
	shortLabel: string;
	anatomicalAspect: string;
	description: string;
	direction: Vec3;
	up: Vec3;
	distance: number;
}
