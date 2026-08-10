import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import type { LandmarkBlueprint } from '../AssetGrammar';
import { createLandmarkModel, type LandmarkMaterials } from './LandmarkModels';

const material = new THREE.MeshBasicMaterial({ color: '#777777' });
const materials: LandmarkMaterials = {
	steel: material,
	steelDark: material,
	cable: material,
	marble: material,
	marbleShadow: material,
	brick: material,
	glass: material,
	ink: material
};

function blueprint(id: LandmarkBlueprint['id']): LandmarkBlueprint {
	return { id, prominence: 'hero', position: [0, 0, 0], rotationY: 0, scale: 1 };
}

function dispose(model: ReturnType<typeof createLandmarkModel>): void {
	for (const geometry of model.authoredGeometries) geometry.dispose();
}

afterAll(() => material.dispose());

describe('locally truthful landmark geometry', () => {
	it('models Howrah as a monumental cantilever through-truss without suspension cables', () => {
		const model = createLandmarkModel(blueprint('howrah-bridge'), materials, 'balanced');
		expect(model.object.userData.structuralType).toBe('balanced-cantilever-through-truss');
		expect(model.object.userData.hasMainSuspensionCables).toBe(false);
		expect(model.object.userData.sourceDimensions.mainSpanM).toBeCloseTo(457.2, 1);
		expect(model.object.userData.authoredTrussMemberCount).toBeGreaterThan(70);
		expect(model.object.children.some((child) => child instanceof THREE.InstancedMesh)).toBe(true);
		dispose(model);
	});

	it('models Vidyasagar with tall pylons and separate fan-like stays', () => {
		const model = createLandmarkModel(blueprint('vidyasagar-setu'), materials, 'balanced');
		expect(model.object.userData.structuralType).toBe('cable-stayed-fan');
		expect(model.object.userData.sourceDimensions.pylonHeightM).toBeCloseTo(127.62, 2);
		expect(model.object.userData.sourceDimensions.actualStayCount).toBe(121);
		expect(model.object.userData.renderedStayCount).toBeGreaterThan(60);
		dispose(model);
	});

	it('gives Victoria its central dome, four subsidiary domes, and victory figure', () => {
		const model = createLandmarkModel(blueprint('victoria-memorial'), materials, 'balanced');
		expect(model.object.userData.architecturalSilhouette).toBe(
			'central-dome-four-subsidiary-domes-renaissance-wings'
		);
		expect(model.object.userData.hasAngelOfVictory).toBe(true);
		expect(model.object.children.length).toBeGreaterThan(12);
		dispose(model);
	});

	it('gives Biswa Bangla Gate four supports, intersecting arches, and its elevated ring', () => {
		const model = createLandmarkModel(blueprint('biswa-bangla-gate'), materials, 'balanced');
		expect(model.object.userData.structuralType).toBe('two-intersecting-catenary-arches-with-ring');
		expect(model.object.userData.archCurve).toBe('inverted-cosh-catenary');
		expect(model.object.userData.sourceDimensions).toMatchObject({
			archHeightM: 55,
			ringDiameterM: 60,
			ringHeightM: 25,
			quadrantSupports: 4
		});
		expect(
			model.authoredGeometries.filter((geometry) => geometry.type === 'TubeGeometry')
		).toHaveLength(2);
		dispose(model);
	});
});
