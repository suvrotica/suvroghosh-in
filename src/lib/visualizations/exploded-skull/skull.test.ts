import { describe, expect, it } from 'vitest';
import {
	BONE_BY_ID,
	EXPLOSION_DIRECTION_MODES,
	EXPLOSION_PRESETS,
	SKULL_BONES,
	SKULL_BONE_IDS,
	applyExplosionPreset,
	boneBoundsOverlapCount,
	bonesByCategory,
	computeAllBoneTransforms,
	computeBoneTargetTransform,
	createDefaultState,
	decodeStateFromSearch,
	encodeStateToQuery,
	exportConfigJson,
	normalizeState,
	parseImportedConfigJson,
	readSavedConfigurations,
	resolveLabelCollisions,
	writeSavedConfigurations,
	type BoneId,
	type ProjectedBoneLabel,
	type SavedSkullConfiguration
} from './index';

describe('Exploded Human Skull anatomy catalog', () => {
	it('represents all 8 neurocranial, 14 facial (13 viscerocranial + mandible), and 1 associated hyoid bone', () => {
		expect(bonesByCategory('neurocranium')).toHaveLength(8);
		expect(bonesByCategory('viscerocranium')).toHaveLength(13);
		expect(bonesByCategory('mandible')).toHaveLength(1);
		expect(bonesByCategory('associated')).toHaveLength(1);
		expect(SKULL_BONES).toHaveLength(23);
		expect(SKULL_BONE_IDS).toHaveLength(23);
	});

	it('has unique IDs, FMA IDs, BP3D IDs, unit-length explosion vectors, and complete metadata', () => {
		const fmaSet = new Set<string>();
		const bp3dSet = new Set<string>();
		for (const bone of SKULL_BONES) {
			expect(BONE_BY_ID[bone.id]).toBe(bone);
			expect(fmaSet.has(bone.fmaId)).toBe(false);
			expect(bp3dSet.has(bone.bp3dPartId)).toBe(false);
			fmaSet.add(bone.fmaId);
			bp3dSet.add(bone.bp3dPartId);
			expect(bone.functions.length).toBeGreaterThanOrEqual(1);
			expect(bone.articulations.length).toBeGreaterThanOrEqual(1);
			expect(bone.landmarks.length).toBeGreaterThanOrEqual(1);
			expect(bone.clinicalSignificance.length).toBeGreaterThan(20);
			const dirMag = Math.hypot(...bone.explosionDirection);
			expect(dirMag).toBeCloseTo(1, 1);
			expect(bone.explosionDistance).toBeGreaterThan(0);
		}
	});

	it('assigns symmetric left/right signs matching BodyParts3D +X anatomical left convention', () => {
		expect(BONE_BY_ID['parietal-left'].anatomicalPosition[0]).toBeGreaterThan(0);
		expect(BONE_BY_ID['parietal-right'].anatomicalPosition[0]).toBeLessThan(0);
		expect(BONE_BY_ID['zygomatic-left'].explosionDirection[0]).toBeGreaterThan(0);
		expect(BONE_BY_ID['zygomatic-right'].explosionDirection[0]).toBeLessThan(0);
	});
});

describe('Exploded Human Skull deterministic transforms & presets', () => {
	it('places every bone at its exact zero reference position when assembled (0%) or comparing assembled', () => {
		const base = applyExplosionPreset(createDefaultState(), 'assembled');
		const assembledTransforms = computeAllBoneTransforms(base);
		for (const bone of SKULL_BONES) {
			const tr = assembledTransforms[bone.id];
			expect(tr.position).toEqual([0, 0, 0]);
			expect(tr.rotationRad).toEqual([0, 0, 0]);
			expect(tr.displacementMm).toBe(0);
		}

		// Compare-assembled override snaps target positions to [0,0,0] without losing user explosion state
		const exploded = applyExplosionPreset(createDefaultState(), 'museum-exploded');
		exploded.boneOverrides.frontal.customOffset = [0.4, 0.2, 0.1];
		exploded.compareAssembled = true;
		const comparedTransforms = computeAllBoneTransforms(exploded);
		expect(comparedTransforms.frontal.position).toEqual([0, 0, 0]);
		expect(comparedTransforms.mandible.rotationRad).toEqual([0, 0, 0]);
	});

	it('significantly reduces inter-bone spatial overlap in museum-exploded view relative to assembled', () => {
		const assembled = applyExplosionPreset(createDefaultState(), 'assembled');
		assembled.appearance.showHyoid = true;
		const assembledOverlaps = boneBoundsOverlapCount(computeAllBoneTransforms(assembled));

		const museum = applyExplosionPreset(createDefaultState(), 'museum-exploded');
		museum.appearance.showHyoid = true;
		const museumOverlaps = boneBoundsOverlapCount(computeAllBoneTransforms(museum));

		expect(assembledOverlaps).toBeGreaterThan(15);
		expect(museumOverlaps).toBeLessThan(6);
	});

	it('supports all 8 explosion presets and all 6 explosion direction modes', () => {
		const state = createDefaultState();
		for (const preset of EXPLOSION_PRESETS) {
			const next = applyExplosionPreset(state, preset.id);
			const transforms = computeAllBoneTransforms(next);
			if (preset.id === 'mandible') {
				expect(transforms.mandible.displacementMm).toBeGreaterThan(30);
				expect(transforms.mandible.rotationRad[0]).toBeGreaterThan(0.15);
				expect(transforms['parietal-left'].displacementMm).toBe(0);
			}
			if (preset.id === 'cranial-vault') {
				expect(transforms['parietal-left'].displacementMm).toBeGreaterThan(50);
				expect(transforms['maxilla-left'].displacementMm).toBe(0);
			}
		}

		for (const mode of EXPLOSION_DIRECTION_MODES) {
			const next = applyExplosionPreset(state, 'museum-exploded');
			next.directionMode = mode.id;
			const tr = computeAllBoneTransforms(next);
			if (mode.id === 'left-right') {
				expect(tr['parietal-left'].position[0]).toBeGreaterThan(0.3);
				expect(tr['parietal-right'].position[0]).toBeLessThan(-0.3);
				expect(tr.frontal.position).toEqual([0, 0, 0]);
			}
			if (mode.id === 'superior-inferior') {
				expect(tr['parietal-left'].position[1]).toBeGreaterThan(0);
				expect(tr.mandible.position[1]).toBeLessThan(0);
			}
		}
	});

	it('enforces bone isolation, visibility, hyoid optional visibility, and per-bone overrides', () => {
		const state = createDefaultState();
		// Hyoid hidden by default unless explicitly shown or isolated
		expect(computeBoneTargetTransform(BONE_BY_ID.hyoid, state).visible).toBe(false);

		state.isolatedBoneIds = ['sphenoid'];
		const isolatedTransforms = computeAllBoneTransforms(state);
		expect(isolatedTransforms.sphenoid.visible).toBe(true);
		expect(isolatedTransforms.frontal.visible).toBe(false);
		expect(isolatedTransforms.hyoid.visible).toBe(false);

		state.isolatedBoneIds = ['hyoid'];
		expect(computeBoneTargetTransform(BONE_BY_ID.hyoid, state).visible).toBe(true);

		state.isolatedBoneIds = [];
		state.boneOverrides.vomer.visible = false;
		state.boneOverrides.frontal.opacity = 0.35;
		state.boneOverrides.frontal.customOffset = [0, 0.5, 0];
		const customTr = computeAllBoneTransforms(state);
		expect(customTr.vomer.visible).toBe(false);
		expect(customTr.frontal.opacity).toBeCloseTo(0.35, 2);
		expect(customTr.frontal.position[1]).toBeGreaterThan(0.5);
	});
});

describe('Exploded Human Skull state normalization, URL sync & saved configurations', () => {
	it('sanitizes malformed or prototype-polluting inputs safely', () => {
		const raw = JSON.parse(
			'{"__proto__":{"polluted":true},"globalExplosion":99,"directionMode":"bogus","selectedBoneIds":["frontal","not-a-bone","frontal"],"rotation":{"yDeg":999},"boneOverrides":{"frontal":{"opacity":-4,"customOffset":[100,"NaN",0]}}}'
		);
		const normalized = normalizeState(raw);
		expect(normalized.globalExplosion).toBe(1);
		expect(normalized.directionMode).toBe('anatomical');
		expect(normalized.selectedBoneIds).toEqual(['frontal']);
		expect(normalized.rotation.yDeg).toBe(180);
		expect(normalized.boneOverrides.frontal.opacity).toBe(0.05);
		expect(normalized.boneOverrides.frontal.customOffset).toEqual([2.5, 0, 0]);
		expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
	});

	it('round-trips complex customized viewer state through query parameters', () => {
		const state = applyExplosionPreset(createDefaultState(), 'museum-exploded');
		state.directionMode = 'radial';
		state.cameraPreset = 'basal';
		state.selectedBoneIds = ['sphenoid', 'ethmoid'];
		state.isolatedBoneIds = ['sphenoid', 'ethmoid', 'vomer'];
		state.rotation.xDeg = 18;
		state.rotation.yDeg = -45;
		state.rotation.zDeg = 5;
		state.appearance.backgroundTheme = 'midnight-slate';
		state.appearance.showSutures = false;
		state.appearance.showHyoid = true;
		state.appearance.showArmatureFilaments = true;
		state.display.showLabels = true;
		state.boneOverrides.frontal.visible = false;
		state.boneOverrides.sphenoid.explosionDistance = 1.65;
		state.boneOverrides.sphenoid.opacity = 0.85;
		state.boneOverrides.sphenoid.customOffset = [0.25, -0.1, 0.4];

		const query = encodeStateToQuery(state);
		const decoded = decodeStateFromSearch(query);
		expect(decoded.presetId).toBe('museum-exploded');
		expect(decoded.globalExplosion).toBeCloseTo(1, 2);
		expect(decoded.directionMode).toBe('radial');
		expect(decoded.cameraPreset).toBe('basal');
		expect(decoded.selectedBoneIds).toEqual(['sphenoid', 'ethmoid']);
		expect(decoded.isolatedBoneIds).toEqual(['sphenoid', 'ethmoid', 'vomer']);
		expect(decoded.rotation.xDeg).toBe(18);
		expect(decoded.rotation.yDeg).toBe(-45);
		expect(decoded.rotation.zDeg).toBe(5);
		expect(decoded.appearance.backgroundTheme).toBe('midnight-slate');
		expect(decoded.appearance.showSutures).toBe(false);
		expect(decoded.appearance.showHyoid).toBe(true);
		expect(decoded.appearance.showArmatureFilaments).toBe(true);
		expect(decoded.display.showLabels).toBe(true);
		expect(decoded.boneOverrides.frontal.visible).toBe(false);
		expect(decoded.boneOverrides.sphenoid.explosionDistance).toBeCloseTo(1.65, 2);
		expect(decoded.boneOverrides.sphenoid.opacity).toBeCloseTo(0.85, 2);
		expect(decoded.boneOverrides.sphenoid.customOffset).toEqual([0.25, -0.1, 0.4]);
	});

	it('persists, reads, exports, and imports saved configurations cleanly', () => {
		const backing = new Map<string, string>();
		const mockStorage = {
			getItem: (k: string) => backing.get(k) ?? null,
			setItem: (k: string, v: string) => {
				backing.set(k, v);
			}
		};

		const cfg: SavedSkullConfiguration = {
			id: 'study-1',
			name: 'Sphenoid Orbital Study',
			savedAt: '2026-11-17T10:00:00.000Z',
			camera: { position: [2, 1, 3], target: [0, 0, 0] },
			state: applyExplosionPreset(createDefaultState(), 'cranial-base')
		};
		expect(writeSavedConfigurations(mockStorage, [cfg])).toBe(true);
		const read = readSavedConfigurations(mockStorage);
		expect(read).toHaveLength(1);
		expect(read[0].name).toBe('Sphenoid Orbital Study');
		expect(read[0].state.presetId).toBe('cranial-base');

		const json = exportConfigJson(cfg);
		const imported = parseImportedConfigJson(json);
		expect(imported).not.toBeNull();
		expect(imported?.state.presetId).toBe('cranial-base');
		expect(parseImportedConfigJson('not-json')).toBeNull();
	});

	it('de-overlaps close 2D anatomical labels while keeping them inside viewport bounds', () => {
		const overlapping: ProjectedBoneLabel[] = (
			['nasal-left', 'nasal-right', 'lacrimal-left', 'lacrimal-right', 'vomer'] as BoneId[]
		).map((id, idx) => ({
			boneId: id,
			label: BONE_BY_ID[id].shortName,
			shortName: BONE_BY_ID[id].shortName,
			category: BONE_BY_ID[id].category,
			side: BONE_BY_ID[id].side,
			anchorX: 500 + idx * 2,
			anchorY: 350 + idx * 2,
			labelX: 500,
			labelY: 350,
			depth: idx,
			selected: idx === 0,
			hovered: false,
			displacementMm: 20
		}));

		const resolved = resolveLabelCollisions(overlapping, 1000, 700);
		expect(resolved).toHaveLength(5);
		for (const label of resolved) {
			expect(label.labelX).toBeGreaterThanOrEqual(80);
			expect(label.labelX).toBeLessThanOrEqual(920);
			expect(label.labelY).toBeGreaterThanOrEqual(40);
			expect(label.labelY).toBeLessThanOrEqual(660);
		}
		// Ensure distinct Y separation evolved from collision pass
		const ySpread =
			Math.max(...resolved.map((l) => l.labelY)) - Math.min(...resolved.map((l) => l.labelY));
		expect(ySpread).toBeGreaterThan(40);
	});
});
