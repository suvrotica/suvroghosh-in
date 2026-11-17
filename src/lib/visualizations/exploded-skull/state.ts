import { BONE_BY_ID, SKULL_BONE_IDS } from './bones';
import {
	BACKGROUND_THEMES,
	CAMERA_PRESET_BY_ID,
	EXPLOSION_DIRECTION_MODES,
	EXPLOSION_PRESETS,
	MATERIAL_PRESETS,
	PRESET_BY_ID
} from './presets';
import { clamp } from './transforms';
import type {
	AppearanceSettings,
	BackgroundThemeId,
	BoneId,
	BoneOverrideState,
	CameraPresetId,
	DisplaySettings,
	ExplosionDirectionMode,
	ExplosionPresetId,
	LabelDensity,
	MaterialPresetId,
	RotationSettings,
	SavedSkullConfiguration,
	SkullViewerState,
	Vec3
} from './types';

export const SKULL_CONFIG_STORAGE_KEY = 'suvroghosh:exploded-human-skull:configs:v1';
export const SKULL_MAX_SAVED_CONFIGS = 16;

const VALID_BONE_SET = new Set<string>(SKULL_BONE_IDS);
const VALID_PRESET_SET = new Set<string>(EXPLOSION_PRESETS.map((p) => p.id));
const VALID_DIRECTION_SET = new Set<string>(EXPLOSION_DIRECTION_MODES.map((m) => m.id));
const VALID_CAMERA_SET = new Set<string>(Object.keys(CAMERA_PRESET_BY_ID));
const VALID_MATERIAL_SET = new Set<string>(MATERIAL_PRESETS.map((m) => m.id));
const VALID_BACKGROUND_SET = new Set<string>(BACKGROUND_THEMES.map((b) => b.id));
const VALID_LABEL_DENSITY_SET = new Set<string>(['selected-and-key', 'all-visible']);

function ownValue<T extends object>(record: T, key: string): unknown {
	if (!Object.prototype.hasOwnProperty.call(record, key)) {
		return undefined;
	}
	return (record as Record<string, unknown>)[key];
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback;
	}
	return clamp(value, min, max);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

export function normalizeHexColor(value: unknown, fallback: string): string {
	if (typeof value !== 'string') return fallback;
	const trimmed = value.trim();
	if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
		return trimmed.toLowerCase();
	}
	return fallback;
}

export function normalizeBoneId(value: unknown): BoneId | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return VALID_BONE_SET.has(trimmed) ? (trimmed as BoneId) : null;
}

function normalizeBoneIdList(value: unknown, maxItems = SKULL_BONE_IDS.length): BoneId[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<BoneId>();
	const out: BoneId[] = [];
	for (const entry of value) {
		const id = normalizeBoneId(entry);
		if (id && !seen.has(id)) {
			seen.add(id);
			out.push(id);
			if (out.length >= maxItems) break;
		}
	}
	return out;
}

function normalizeVec3(value: unknown, fallback: Vec3, absLimit: number): Vec3 {
	if (!Array.isArray(value) || value.length !== 3) {
		return [...fallback];
	}
	return [
		asFiniteNumber(value[0], fallback[0], -absLimit, absLimit),
		asFiniteNumber(value[1], fallback[1], -absLimit, absLimit),
		asFiniteNumber(value[2], fallback[2], -absLimit, absLimit)
	];
}

export function createDefaultBoneOverride(visible = true): BoneOverrideState {
	return {
		visible,
		opacity: 1,
		explosionDistance: 1,
		customOffset: [0, 0, 0]
	};
}

export function createDefaultBoneOverrides(): Record<BoneId, BoneOverrideState> {
	const record = {} as Record<BoneId, BoneOverrideState>;
	for (const boneId of SKULL_BONE_IDS) {
		record[boneId] = createDefaultBoneOverride(true);
	}
	return record;
}

export function createDefaultAppearance(): AppearanceSettings {
	const defaultMaterial = MATERIAL_PRESETS[0];
	return {
		materialPreset: defaultMaterial.id,
		boneColor: defaultMaterial.color,
		roughness: defaultMaterial.roughness,
		backgroundTheme: 'museum-charcoal',
		showSutures: true,
		wireframe: false,
		showDentition: true,
		showHyoid: false,
		showGhostReference: false,
		showArmatureFilaments: false
	};
}

export function createDefaultDisplay(): DisplaySettings {
	return {
		showLabels: false,
		showBoneNames: true,
		labelDensity: 'selected-and-key',
		showAxisIndicator: true,
		showCoordinateGrid: false,
		showBoneList: true,
		showInfoPanel: true
	};
}

export function createDefaultRotation(): RotationSettings {
	return {
		xDeg: 0,
		yDeg: 0,
		zDeg: 0,
		autoRotate: false,
		autoRotateSpeed: 0.45
	};
}

export function createDefaultState(): SkullViewerState {
	const defaultPreset = PRESET_BY_ID.slight;
	return {
		version: 1,
		presetId: defaultPreset.id,
		globalExplosion: defaultPreset.defaultExplosion,
		directionMode: defaultPreset.directionMode,
		animationSpeed: 1,
		globalVisible: true,
		compareAssembled: false,
		selectedBoneIds: [],
		isolatedBoneIds: [],
		boneOverrides: createDefaultBoneOverrides(),
		rotation: createDefaultRotation(),
		cameraPreset: defaultPreset.defaultCamera,
		appearance: createDefaultAppearance(),
		display: createDefaultDisplay()
	};
}

export function cloneSkullState(state: SkullViewerState): SkullViewerState {
	const clonedOverrides = {} as Record<BoneId, BoneOverrideState>;
	for (const boneId of SKULL_BONE_IDS) {
		const ov = state.boneOverrides[boneId];
		clonedOverrides[boneId] = {
			visible: ov.visible,
			opacity: ov.opacity,
			explosionDistance: ov.explosionDistance,
			customOffset: [ov.customOffset[0], ov.customOffset[1], ov.customOffset[2]]
		};
	}
	return {
		...state,
		selectedBoneIds: [...state.selectedBoneIds],
		isolatedBoneIds: [...state.isolatedBoneIds],
		boneOverrides: clonedOverrides,
		rotation: { ...state.rotation },
		appearance: { ...state.appearance },
		display: { ...state.display }
	};
}

/**
 * Applies a curated anatomical explosion preset while keeping the model reference-anchored.
 */
export function applyExplosionPreset(
	current: SkullViewerState,
	presetId: ExplosionPresetId
): SkullViewerState {
	const preset = PRESET_BY_ID[presetId];
	if (!preset) return current;

	const next = cloneSkullState(current);
	next.presetId = presetId;
	next.compareAssembled = false;

	if (presetId !== 'custom') {
		next.globalExplosion = preset.defaultExplosion;
		next.directionMode = preset.directionMode;
		next.boneOverrides = createDefaultBoneOverrides();
		if (preset.showHyoidByDefault !== undefined) {
			next.appearance.showHyoid = preset.showHyoidByDefault;
		}
	}

	return next;
}

export function normalizeState(input: unknown): SkullViewerState {
	const defaults = createDefaultState();
	const raw = asRecord(input);
	if (!raw) return defaults;

	const rawPreset = ownValue(raw, 'presetId');
	const presetId: ExplosionPresetId =
		typeof rawPreset === 'string' && VALID_PRESET_SET.has(rawPreset)
			? (rawPreset as ExplosionPresetId)
			: defaults.presetId;

	const rawDir = ownValue(raw, 'directionMode');
	const directionMode: ExplosionDirectionMode =
		typeof rawDir === 'string' && VALID_DIRECTION_SET.has(rawDir)
			? (rawDir as ExplosionDirectionMode)
			: defaults.directionMode;

	const rawCamera = ownValue(raw, 'cameraPreset');
	const cameraPreset: CameraPresetId =
		typeof rawCamera === 'string' && VALID_CAMERA_SET.has(rawCamera)
			? (rawCamera as CameraPresetId)
			: defaults.cameraPreset;

	const boneOverrides = createDefaultBoneOverrides();
	const rawOverrides = asRecord(ownValue(raw, 'boneOverrides'));
	if (rawOverrides) {
		for (const boneId of SKULL_BONE_IDS) {
			const entry = asRecord(ownValue(rawOverrides, boneId));
			if (!entry) continue;
			const def = boneOverrides[boneId];
			boneOverrides[boneId] = {
				visible: asBoolean(ownValue(entry, 'visible'), def.visible),
				opacity: asFiniteNumber(ownValue(entry, 'opacity'), def.opacity, 0.05, 1),
				explosionDistance: asFiniteNumber(
					ownValue(entry, 'explosionDistance'),
					def.explosionDistance,
					0,
					2.5
				),
				customOffset: normalizeVec3(ownValue(entry, 'customOffset'), def.customOffset, 2.5)
			};
		}
	}

	const rawRotation = asRecord(ownValue(raw, 'rotation'));
	const rotation: RotationSettings = rawRotation
		? {
				xDeg: asFiniteNumber(ownValue(rawRotation, 'xDeg'), defaults.rotation.xDeg, -180, 180),
				yDeg: asFiniteNumber(ownValue(rawRotation, 'yDeg'), defaults.rotation.yDeg, -180, 180),
				zDeg: asFiniteNumber(ownValue(rawRotation, 'zDeg'), defaults.rotation.zDeg, -180, 180),
				autoRotate: asBoolean(ownValue(rawRotation, 'autoRotate'), defaults.rotation.autoRotate),
				autoRotateSpeed: asFiniteNumber(
					ownValue(rawRotation, 'autoRotateSpeed'),
					defaults.rotation.autoRotateSpeed,
					0.1,
					3
				)
			}
		: { ...defaults.rotation };

	const rawAppearance = asRecord(ownValue(raw, 'appearance'));
	const rawMat = rawAppearance ? ownValue(rawAppearance, 'materialPreset') : undefined;
	const materialPreset: MaterialPresetId =
		typeof rawMat === 'string' && VALID_MATERIAL_SET.has(rawMat)
			? (rawMat as MaterialPresetId)
			: defaults.appearance.materialPreset;
	const rawBg = rawAppearance ? ownValue(rawAppearance, 'backgroundTheme') : undefined;
	const backgroundTheme: BackgroundThemeId =
		typeof rawBg === 'string' && VALID_BACKGROUND_SET.has(rawBg)
			? (rawBg as BackgroundThemeId)
			: defaults.appearance.backgroundTheme;

	const appearance: AppearanceSettings = rawAppearance
		? {
				materialPreset,
				boneColor: normalizeHexColor(
					ownValue(rawAppearance, 'boneColor'),
					defaults.appearance.boneColor
				),
				roughness: asFiniteNumber(
					ownValue(rawAppearance, 'roughness'),
					defaults.appearance.roughness,
					0.08,
					1
				),
				backgroundTheme,
				showSutures: asBoolean(
					ownValue(rawAppearance, 'showSutures'),
					defaults.appearance.showSutures
				),
				wireframe: asBoolean(ownValue(rawAppearance, 'wireframe'), defaults.appearance.wireframe),
				showDentition: asBoolean(
					ownValue(rawAppearance, 'showDentition'),
					defaults.appearance.showDentition
				),
				showHyoid: asBoolean(ownValue(rawAppearance, 'showHyoid'), defaults.appearance.showHyoid),
				showGhostReference: asBoolean(
					ownValue(rawAppearance, 'showGhostReference'),
					defaults.appearance.showGhostReference
				),
				showArmatureFilaments: asBoolean(
					ownValue(rawAppearance, 'showArmatureFilaments'),
					defaults.appearance.showArmatureFilaments
				)
			}
		: { ...defaults.appearance };

	const rawDisplay = asRecord(ownValue(raw, 'display'));
	const rawDensity = rawDisplay ? ownValue(rawDisplay, 'labelDensity') : undefined;
	const labelDensity: LabelDensity =
		typeof rawDensity === 'string' && VALID_LABEL_DENSITY_SET.has(rawDensity)
			? (rawDensity as LabelDensity)
			: defaults.display.labelDensity;

	const display: DisplaySettings = rawDisplay
		? {
				showLabels: asBoolean(ownValue(rawDisplay, 'showLabels'), defaults.display.showLabels),
				showBoneNames: asBoolean(
					ownValue(rawDisplay, 'showBoneNames'),
					defaults.display.showBoneNames
				),
				labelDensity,
				showAxisIndicator: asBoolean(
					ownValue(rawDisplay, 'showAxisIndicator'),
					defaults.display.showAxisIndicator
				),
				showCoordinateGrid: asBoolean(
					ownValue(rawDisplay, 'showCoordinateGrid'),
					defaults.display.showCoordinateGrid
				),
				showBoneList: asBoolean(
					ownValue(rawDisplay, 'showBoneList'),
					defaults.display.showBoneList
				),
				showInfoPanel: asBoolean(
					ownValue(rawDisplay, 'showInfoPanel'),
					defaults.display.showInfoPanel
				)
			}
		: { ...defaults.display };

	return {
		version: 1,
		presetId,
		globalExplosion: asFiniteNumber(
			ownValue(raw, 'globalExplosion'),
			defaults.globalExplosion,
			0,
			1
		),
		directionMode,
		animationSpeed: asFiniteNumber(
			ownValue(raw, 'animationSpeed'),
			defaults.animationSpeed,
			0.25,
			2.5
		),
		globalVisible: asBoolean(ownValue(raw, 'globalVisible'), defaults.globalVisible),
		compareAssembled: asBoolean(ownValue(raw, 'compareAssembled'), defaults.compareAssembled),
		selectedBoneIds: normalizeBoneIdList(ownValue(raw, 'selectedBoneIds')),
		isolatedBoneIds: normalizeBoneIdList(ownValue(raw, 'isolatedBoneIds')),
		boneOverrides,
		rotation,
		cameraPreset,
		appearance,
		display
	};
}

/**
 * Encodes non-default viewer state into a concise URL query string (`preset`, `ex`, `dir`, `cam`, etc.)
 * suitable for browser history sync and bookmarking/sharing.
 */
export function encodeStateToQuery(state: SkullViewerState): string {
	const defaults = createDefaultState();
	const params = new URLSearchParams();

	if (state.presetId !== defaults.presetId) {
		params.set('preset', state.presetId);
	}
	const pct = Math.round(clamp(state.globalExplosion, 0, 1) * 100);
	if (Math.round(defaults.globalExplosion * 100) !== pct) {
		params.set('ex', String(pct));
	}
	if (state.directionMode !== defaults.directionMode) {
		params.set('dir', state.directionMode);
	}
	if (state.cameraPreset !== defaults.cameraPreset) {
		params.set('cam', state.cameraPreset);
	}
	if (state.compareAssembled) {
		params.set('cmp', '1');
	}
	if (!state.globalVisible) {
		params.set('vis', '0');
	}
	if (state.selectedBoneIds.length > 0) {
		params.set('sel', state.selectedBoneIds.join(','));
	}
	if (state.isolatedBoneIds.length > 0) {
		params.set('iso', state.isolatedBoneIds.join(','));
	}
	if (
		Math.abs(state.rotation.xDeg) > 0.5 ||
		Math.abs(state.rotation.yDeg) > 0.5 ||
		Math.abs(state.rotation.zDeg) > 0.5
	) {
		params.set(
			'rot',
			`${Math.round(state.rotation.xDeg)},${Math.round(state.rotation.yDeg)},${Math.round(state.rotation.zDeg)}`
		);
	}
	if (state.appearance.materialPreset !== defaults.appearance.materialPreset) {
		params.set('mat', state.appearance.materialPreset);
	}
	if (state.appearance.boneColor !== defaults.appearance.boneColor) {
		params.set('col', state.appearance.boneColor.slice(1));
	}
	if (state.appearance.backgroundTheme !== defaults.appearance.backgroundTheme) {
		params.set('bg', state.appearance.backgroundTheme);
	}
	if (!state.appearance.showSutures) params.set('sut', '0');
	if (state.appearance.wireframe) params.set('wire', '1');
	if (!state.appearance.showDentition) params.set('dent', '0');
	if (state.appearance.showHyoid) params.set('hyoid', '1');
	if (state.appearance.showGhostReference) params.set('ghost', '1');
	if (state.appearance.showArmatureFilaments) params.set('arm', '1');
	if (state.display.showLabels) params.set('lbl', '1');
	if (!state.display.showBoneNames) params.set('names', '0');
	if (state.display.labelDensity !== defaults.display.labelDensity) {
		params.set('ldens', state.display.labelDensity);
	}
	if (!state.display.showAxisIndicator) params.set('axis', '0');
	if (state.display.showCoordinateGrid) params.set('grid', '1');

	const hiddenBones: string[] = [];
	const distBones: string[] = [];
	const alphaBones: string[] = [];
	const offsetBones: string[] = [];

	for (const boneId of SKULL_BONE_IDS) {
		const ov = state.boneOverrides[boneId];
		if (!ov.visible) hiddenBones.push(boneId);
		if (Math.abs(ov.explosionDistance - 1) > 0.01) {
			distBones.push(`${boneId}:${ov.explosionDistance.toFixed(2)}`);
		}
		if (Math.abs(ov.opacity - 1) > 0.01) {
			alphaBones.push(`${boneId}:${ov.opacity.toFixed(2)}`);
		}
		if (
			Math.abs(ov.customOffset[0]) > 0.01 ||
			Math.abs(ov.customOffset[1]) > 0.01 ||
			Math.abs(ov.customOffset[2]) > 0.01
		) {
			offsetBones.push(
				`${boneId}:${ov.customOffset[0].toFixed(2)},${ov.customOffset[1].toFixed(2)},${ov.customOffset[2].toFixed(2)}`
			);
		}
	}

	if (hiddenBones.length > 0) params.set('hide', hiddenBones.join(','));
	if (distBones.length > 0) params.set('bdist', distBones.join(';'));
	if (alphaBones.length > 0) params.set('bop', alphaBones.join(';'));
	if (offsetBones.length > 0) params.set('boff', offsetBones.join(';'));

	return params.toString();
}

export function decodeStateFromSearch(search: string, _hash = ''): SkullViewerState {
	const defaults = createDefaultState();
	const hashFallback = _hash.startsWith('#?') ? _hash.slice(2) : '';
	const trimmed = (search.startsWith('?') ? search.slice(1) : search) || hashFallback;
	if (!trimmed) return defaults;

	const params = new URLSearchParams(trimmed);
	const draft = createDefaultState();

	const presetParam = params.get('preset');
	if (presetParam && VALID_PRESET_SET.has(presetParam)) {
		const applied = applyExplosionPreset(draft, presetParam as ExplosionPresetId);
		Object.assign(draft, applied);
	}

	const exParam = params.get('ex');
	if (exParam !== null) {
		const parsed = Number(exParam);
		if (Number.isFinite(parsed)) {
			draft.globalExplosion = clamp(parsed / 100, 0, 1);
		}
	}

	const dirParam = params.get('dir');
	if (dirParam && VALID_DIRECTION_SET.has(dirParam)) {
		draft.directionMode = dirParam as ExplosionDirectionMode;
	}

	const camParam = params.get('cam');
	if (camParam && VALID_CAMERA_SET.has(camParam)) {
		draft.cameraPreset = camParam as CameraPresetId;
	}

	if (params.get('cmp') === '1') draft.compareAssembled = true;
	if (params.get('vis') === '0') draft.globalVisible = false;

	const selParam = params.get('sel');
	if (selParam) {
		draft.selectedBoneIds = normalizeBoneIdList(selParam.split(','));
	}

	const isoParam = params.get('iso');
	if (isoParam) {
		draft.isolatedBoneIds = normalizeBoneIdList(isoParam.split(','));
	}

	const rotParam = params.get('rot');
	if (rotParam) {
		const parts = rotParam.split(',').map((n) => Number(n));
		if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
			draft.rotation.xDeg = clamp(parts[0], -180, 180);
			draft.rotation.yDeg = clamp(parts[1], -180, 180);
			draft.rotation.zDeg = clamp(parts[2], -180, 180);
		}
	}

	const matParam = params.get('mat');
	if (matParam && VALID_MATERIAL_SET.has(matParam)) {
		const preset = MATERIAL_PRESETS.find((m) => m.id === matParam);
		if (preset) {
			draft.appearance.materialPreset = preset.id;
			draft.appearance.boneColor = preset.color;
			draft.appearance.roughness = preset.roughness;
		}
	}

	const colParam = params.get('col');
	if (colParam) {
		draft.appearance.boneColor = normalizeHexColor(
			`#${colParam.replace(/^#/, '')}`,
			draft.appearance.boneColor
		);
	}

	const bgParam = params.get('bg');
	if (bgParam && VALID_BACKGROUND_SET.has(bgParam)) {
		draft.appearance.backgroundTheme = bgParam as BackgroundThemeId;
	}

	if (params.get('sut') === '0') draft.appearance.showSutures = false;
	if (params.get('wire') === '1') draft.appearance.wireframe = true;
	if (params.get('dent') === '0') draft.appearance.showDentition = false;
	if (params.get('hyoid') === '1') draft.appearance.showHyoid = true;
	if (params.get('ghost') === '1') draft.appearance.showGhostReference = true;
	if (params.get('arm') === '1') draft.appearance.showArmatureFilaments = true;
	if (params.get('lbl') === '1') draft.display.showLabels = true;
	if (params.get('names') === '0') draft.display.showBoneNames = false;
	const ldens = params.get('ldens');
	if (ldens && VALID_LABEL_DENSITY_SET.has(ldens)) {
		draft.display.labelDensity = ldens as LabelDensity;
	}
	if (params.get('axis') === '0') draft.display.showAxisIndicator = false;
	if (params.get('grid') === '1') draft.display.showCoordinateGrid = true;

	const hideParam = params.get('hide');
	if (hideParam) {
		for (const rawId of hideParam.split(',')) {
			const id = normalizeBoneId(rawId);
			if (id) draft.boneOverrides[id].visible = false;
		}
	}

	const bdistParam = params.get('bdist');
	if (bdistParam) {
		for (const item of bdistParam.split(';')) {
			const [rawId, rawVal] = item.split(':');
			const id = normalizeBoneId(rawId);
			const val = Number(rawVal);
			if (id && Number.isFinite(val)) {
				draft.boneOverrides[id].explosionDistance = clamp(val, 0, 2.5);
			}
		}
	}

	const bopParam = params.get('bop');
	if (bopParam) {
		for (const item of bopParam.split(';')) {
			const [rawId, rawVal] = item.split(':');
			const id = normalizeBoneId(rawId);
			const val = Number(rawVal);
			if (id && Number.isFinite(val)) {
				draft.boneOverrides[id].opacity = clamp(val, 0.05, 1);
			}
		}
	}

	const boffParam = params.get('boff');
	if (boffParam) {
		for (const item of boffParam.split(';')) {
			const [rawId, rawCoords] = item.split(':');
			const id = normalizeBoneId(rawId);
			if (!id || !rawCoords) continue;
			const parts = rawCoords.split(',').map((n) => Number(n));
			if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
				draft.boneOverrides[id].customOffset = [
					clamp(parts[0], -2.5, 2.5),
					clamp(parts[1], -2.5, 2.5),
					clamp(parts[2], -2.5, 2.5)
				];
			}
		}
	}

	return normalizeState(draft);
}

export function readSavedConfigurations(
	storage: Pick<Storage, 'getItem'> | null | undefined
): SavedSkullConfiguration[] {
	if (!storage) return [];
	try {
		const raw = storage.getItem(SKULL_CONFIG_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const configs: SavedSkullConfiguration[] = [];
		for (const item of parsed) {
			const rec = asRecord(item);
			if (!rec) continue;
			const id =
				typeof ownValue(rec, 'id') === 'string' ? (ownValue(rec, 'id') as string).slice(0, 64) : '';
			const name =
				typeof ownValue(rec, 'name') === 'string'
					? (ownValue(rec, 'name') as string).trim().slice(0, 80)
					: '';
			const savedAt =
				typeof ownValue(rec, 'savedAt') === 'string'
					? (ownValue(rec, 'savedAt') as string).slice(0, 40)
					: new Date().toISOString();
			if (!id || !name) continue;
			const rawCam = asRecord(ownValue(rec, 'camera'));
			const camera = rawCam
				? {
						position: normalizeVec3(ownValue(rawCam, 'position'), [3.1, 0.85, 3.6], 20),
						target: normalizeVec3(ownValue(rawCam, 'target'), [0, 0, 0], 10)
					}
				: undefined;
			configs.push({
				id,
				name,
				savedAt,
				camera,
				state: normalizeState(ownValue(rec, 'state'))
			});
			if (configs.length >= SKULL_MAX_SAVED_CONFIGS) break;
		}
		return configs;
	} catch {
		return [];
	}
}

export function writeSavedConfigurations(
	storage: Pick<Storage, 'setItem'> | null | undefined,
	configs: readonly SavedSkullConfiguration[]
): boolean {
	if (!storage) return false;
	try {
		const sanitized = configs.slice(0, SKULL_MAX_SAVED_CONFIGS).map((cfg) => ({
			id: cfg.id.slice(0, 64),
			name: cfg.name.trim().slice(0, 80) || 'Untitled Study',
			savedAt: cfg.savedAt,
			...(cfg.camera ? { camera: cfg.camera } : {}),
			state: normalizeState(cfg.state)
		}));
		storage.setItem(SKULL_CONFIG_STORAGE_KEY, JSON.stringify(sanitized));
		return true;
	} catch {
		return false;
	}
}

export function exportConfigJson(config: SavedSkullConfiguration): string {
	return JSON.stringify(
		{
			schema: 'suvroghosh.exploded-human-skull.v1',
			name: config.name,
			savedAt: config.savedAt,
			...(config.camera ? { camera: config.camera } : {}),
			state: config.state
		},
		null,
		2
	);
}

export function parseImportedConfigJson(raw: string): SavedSkullConfiguration | null {
	if (!raw || raw.length > 64_000) return null;
	try {
		const parsed = asRecord(JSON.parse(raw));
		if (!parsed) return null;
		const rawName = ownValue(parsed, 'name');
		const name =
			typeof rawName === 'string' && rawName.trim()
				? rawName.trim().slice(0, 80)
				: 'Imported Skull Study';
		const rawState = ownValue(parsed, 'state') ?? parsed;
		const normalizedState = normalizeState(rawState);
		const rawCam = asRecord(ownValue(parsed, 'camera'));
		const camera = rawCam
			? {
					position: normalizeVec3(ownValue(rawCam, 'position'), [3.1, 0.85, 3.6], 20),
					target: normalizeVec3(ownValue(rawCam, 'target'), [0, 0, 0], 10)
				}
			: undefined;
		return {
			id: `import-${Date.now().toString(36)}`,
			name,
			savedAt: new Date().toISOString(),
			camera,
			state: normalizedState
		};
	} catch {
		return null;
	}
}

export function getBoneLabelText(boneId: BoneId, showFullName: boolean): string {
	const meta = BONE_BY_ID[boneId];
	return showFullName ? meta.name : meta.shortName;
}
