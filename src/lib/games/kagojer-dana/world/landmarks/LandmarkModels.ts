import * as THREE from 'three';
import type { LandmarkBlueprint, WorldQualityTier } from '../AssetGrammar';

export interface LandmarkMaterials {
	readonly steel: THREE.Material;
	readonly steelDark: THREE.Material;
	readonly cable: THREE.Material;
	readonly marble: THREE.Material;
	readonly marbleShadow: THREE.Material;
	readonly brick: THREE.Material;
	readonly glass: THREE.Material;
	readonly ink: THREE.Material;
}

export interface LandmarkModel {
	readonly object: THREE.Group;
	readonly authoredGeometries: readonly THREE.BufferGeometry[];
}

interface Beam {
	readonly start: THREE.Vector3;
	readonly end: THREE.Vector3;
	readonly radius: number;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TEMP_DIRECTION = new THREE.Vector3();
const TEMP_MIDPOINT = new THREE.Vector3();
const TEMP_QUATERNION = new THREE.Quaternion();
const TEMP_SCALE = new THREE.Vector3();
const TEMP_MATRIX = new THREE.Matrix4();

function mesh(
	geometry: THREE.BufferGeometry,
	material: THREE.Material,
	position: readonly [number, number, number] = [0, 0, 0]
): THREE.Mesh {
	const result = new THREE.Mesh(geometry, material);
	result.position.set(...position);
	result.castShadow = true;
	result.receiveShadow = true;
	return result;
}

function instancedBeams(
	beams: readonly Beam[],
	material: THREE.Material,
	geometries: THREE.BufferGeometry[]
): THREE.InstancedMesh {
	const geometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);
	geometries.push(geometry);
	const result = new THREE.InstancedMesh(geometry, material, beams.length);
	for (let index = 0; index < beams.length; index += 1) {
		const beam = beams[index];
		TEMP_DIRECTION.subVectors(beam.end, beam.start);
		const length = TEMP_DIRECTION.length();
		TEMP_MIDPOINT.copy(beam.start).add(beam.end).multiplyScalar(0.5);
		TEMP_QUATERNION.setFromUnitVectors(
			Y_AXIS,
			TEMP_DIRECTION.multiplyScalar(1 / Math.max(length, 0.001))
		);
		TEMP_SCALE.set(beam.radius, length, beam.radius);
		TEMP_MATRIX.compose(TEMP_MIDPOINT, TEMP_QUATERNION, TEMP_SCALE);
		result.setMatrixAt(index, TEMP_MATRIX);
	}
	result.instanceMatrix.needsUpdate = true;
	result.castShadow = true;
	result.receiveShadow = true;
	return result;
}

function addBeam(beams: Beam[], start: THREE.Vector3, end: THREE.Vector3, radius: number): void {
	beams.push({ start: start.clone(), end: end.clone(), radius });
}

/**
 * Rabindra Setu / Howrah Bridge: a balanced cantilever through-truss. There are
 * explicitly no suspension cables or cable towers in this model.
 */
function createHowrahBridge(materials: LandmarkMaterials): LandmarkModel {
	const object = new THREE.Group();
	const geometries: THREE.BufferGeometry[] = [];
	const deckY = 25;
	const halfWidth = 11;
	const xNodes = [-327, -280, -230, -180, -125, -75, -28, 28, 75, 125, 180, 230, 280, 327];
	const topOffsets = [16, 29, 43, 52, 43, 31, 19, 19, 31, 43, 52, 43, 29, 16];
	const beams: Beam[] = [];
	for (const side of [-1, 1]) {
		const z = side * halfWidth;
		for (let index = 0; index < xNodes.length; index += 1) {
			const x = xNodes[index];
			const bottom = new THREE.Vector3(x, deckY + 1, z);
			const top = new THREE.Vector3(x, deckY + topOffsets[index], z);
			addBeam(beams, bottom, top, 0.75);
			if (index === xNodes.length - 1) continue;
			const nextBottom = new THREE.Vector3(xNodes[index + 1], deckY + 1, z);
			const nextTop = new THREE.Vector3(xNodes[index + 1], deckY + topOffsets[index + 1], z);
			addBeam(beams, bottom, nextBottom, 0.8);
			addBeam(beams, top, nextTop, 0.86);
			addBeam(beams, index % 2 === 0 ? bottom : top, index % 2 === 0 ? nextTop : nextBottom, 0.68);
		}
	}
	for (let index = 0; index < xNodes.length; index += 2) {
		const x = xNodes[index];
		const topY = deckY + topOffsets[index];
		addBeam(
			beams,
			new THREE.Vector3(x, deckY + 1, -halfWidth),
			new THREE.Vector3(x, deckY + 1, halfWidth),
			0.72
		);
		addBeam(
			beams,
			new THREE.Vector3(x, topY, -halfWidth),
			new THREE.Vector3(x, topY, halfWidth),
			0.65
		);
	}
	object.add(instancedBeams(beams, materials.steel, geometries));
	const deckGeometry = new THREE.BoxGeometry(655, 2.8, 22);
	geometries.push(deckGeometry);
	object.add(mesh(deckGeometry, materials.steelDark, [0, deckY, 0]));
	const roadwayGeometry = new THREE.BoxGeometry(655, 0.5, 17.5);
	geometries.push(roadwayGeometry);
	object.add(mesh(roadwayGeometry, materials.ink, [0, deckY + 1.65, 0]));
	object.userData.landmarkId = 'howrah-bridge';
	object.userData.structuralType = 'balanced-cantilever-through-truss';
	object.userData.hasMainSuspensionCables = false;
	object.userData.sourceDimensions = {
		overallLengthM: 655,
		mainSpanM: 457.2,
		suspendedCentralSpanM: 171.9
	};
	object.userData.authoredTrussMemberCount = beams.length;
	return { object, authoredGeometries: geometries };
}

/** Vidyasagar Setu: two cable planes with tall steel pylons and fan stays. */
function createVidyasagarSetu(
	materials: LandmarkMaterials,
	quality: WorldQualityTier
): LandmarkModel {
	const object = new THREE.Group();
	const geometries: THREE.BufferGeometry[] = [];
	const deckY = 28;
	const halfWidth = 17.5;
	const pylonX = 228.6;
	const pylonTopY = 127.62;
	const beams: Beam[] = [];
	for (const x of [-pylonX, pylonX]) {
		for (const z of [-halfWidth * 0.78, halfWidth * 0.78]) {
			addBeam(beams, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, pylonTopY, z), 2.25);
		}
		for (const y of [deckY + 15, deckY + 54, pylonTopY - 4]) {
			addBeam(
				beams,
				new THREE.Vector3(x, y, -halfWidth * 0.78),
				new THREE.Vector3(x, y, halfWidth * 0.78),
				1.5
			);
		}
	}
	object.add(instancedBeams(beams, materials.steel, geometries));

	const stays: Beam[] = [];
	const staysPerFan = quality === 'high' ? 14 : quality === 'balanced' ? 9 : 6;
	for (const towerX of [-pylonX, pylonX]) {
		for (const cablePlaneZ of [-halfWidth * 0.72, halfWidth * 0.72]) {
			for (const direction of [-1, 1]) {
				for (let index = 1; index <= staysPerFan; index += 1) {
					const reach = (index / staysPerFan) * (direction === Math.sign(towerX) ? 176 : 212);
					const anchorX = towerX + direction * reach;
					const attachY = pylonTopY - (index / staysPerFan) * 36;
					addBeam(
						stays,
						new THREE.Vector3(towerX, attachY, cablePlaneZ),
						new THREE.Vector3(anchorX, deckY + 1.5, cablePlaneZ),
						0.105
					);
				}
			}
		}
	}
	object.add(instancedBeams(stays, materials.cable, geometries));
	const deckGeometry = new THREE.BoxGeometry(823, 2.6, 35);
	geometries.push(deckGeometry);
	object.add(mesh(deckGeometry, materials.steelDark, [0, deckY, 0]));
	const roadwayGeometry = new THREE.BoxGeometry(823, 0.45, 29);
	geometries.push(roadwayGeometry);
	object.add(mesh(roadwayGeometry, materials.ink, [0, deckY + 1.5, 0]));
	object.userData.landmarkId = 'vidyasagar-setu';
	object.userData.structuralType = 'cable-stayed-fan';
	object.userData.sourceDimensions = {
		overallLengthM: 823,
		mainSpanM: 457,
		sideSpanM: 183,
		widthM: 35,
		pylonHeightM: 127.62,
		actualStayCount: 121
	};
	object.userData.renderedStayCount = stays.length;
	return { object, authoredGeometries: geometries };
}

function createAngelGeometry(): THREE.BufferGeometry {
	const positions = [
		-0.5, 0, 0, 0.5, 0, 0, 0, 3.8, 0, 0, 2.8, 0, -3.7, 1.3, 0, -0.7, 0.9, 0, 0, 2.8, 0, 0.7, 0.9, 0,
		3.7, 1.3, 0
	];
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.computeVertexNormals();
	return geometry;
}

function createVictoriaMemorial(materials: LandmarkMaterials): LandmarkModel {
	const object = new THREE.Group();
	const geometries: THREE.BufferGeometry[] = [];
	const terraceGeometry = new THREE.BoxGeometry(112, 2.2, 78);
	const centralGeometry = new THREE.BoxGeometry(46, 27, 38);
	const wingGeometry = new THREE.BoxGeometry(40, 18, 30);
	const drumGeometry = new THREE.CylinderGeometry(14, 15, 8, 24);
	const domeGeometry = new THREE.SphereGeometry(15, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
	const smallDomeGeometry = new THREE.SphereGeometry(5.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
	const towerGeometry = new THREE.CylinderGeometry(4.8, 5.4, 21, 12);
	const columnGeometry = new THREE.CylinderGeometry(0.72, 0.86, 12, 10);
	const pedimentGeometry = new THREE.ConeGeometry(10, 4.5, 3);
	const angelGeometry = createAngelGeometry();
	geometries.push(
		terraceGeometry,
		centralGeometry,
		wingGeometry,
		drumGeometry,
		domeGeometry,
		smallDomeGeometry,
		towerGeometry,
		columnGeometry,
		pedimentGeometry,
		angelGeometry
	);
	object.add(mesh(terraceGeometry, materials.marbleShadow, [0, 1.1, 0]));
	object.add(mesh(centralGeometry, materials.marble, [0, 15.7, 0]));
	object.add(mesh(wingGeometry, materials.marble, [-41, 11.2, 0]));
	object.add(mesh(wingGeometry, materials.marble, [41, 11.2, 0]));
	object.add(mesh(drumGeometry, materials.marble, [0, 33.2, 0]));
	object.add(mesh(domeGeometry, materials.marble, [0, 37.2, 0]));
	for (const x of [-42, 42]) {
		for (const z of [-24, 24]) {
			object.add(mesh(towerGeometry, materials.marble, [x, 13.2, z]));
			object.add(mesh(smallDomeGeometry, materials.marble, [x, 23.7, z]));
		}
	}
	const columns = new THREE.InstancedMesh(columnGeometry, materials.marbleShadow, 16);
	for (let index = 0; index < 16; index += 1) {
		const x = -27 + (index % 8) * 7.7;
		const z = index < 8 ? -19.7 : 19.7;
		TEMP_MATRIX.makeTranslation(x, 9, z);
		columns.setMatrixAt(index, TEMP_MATRIX);
	}
	columns.instanceMatrix.needsUpdate = true;
	columns.castShadow = true;
	object.add(columns);
	const pediment = mesh(pedimentGeometry, materials.marble, [0, 23.2, -21]);
	pediment.rotation.x = Math.PI / 2;
	object.add(pediment);
	const angel = mesh(angelGeometry, materials.ink, [0, 53.5, 0]);
	angel.scale.setScalar(1.25);
	object.add(angel);
	object.userData.landmarkId = 'victoria-memorial';
	object.userData.architecturalSilhouette = 'central-dome-four-subsidiary-domes-renaissance-wings';
	object.userData.hasAngelOfVictory = true;
	return { object, authoredGeometries: geometries };
}

function catenaryArch(
	start: THREE.Vector3,
	middle: THREE.Vector3,
	end: THREE.Vector3,
	material: THREE.Material,
	geometries: THREE.BufferGeometry[]
): THREE.Mesh {
	// An inverted catenary, rather than a generic circular/spline arch. The
	// dimensionless coefficient controls only the visual belly of the curve;
	// the official 55 m crown and four road-quadrant feet remain exact.
	const coefficient = 1.42;
	const denominator = Math.cosh(coefficient) - 1;
	const samples: THREE.Vector3[] = [];
	for (let index = 0; index <= 24; index += 1) {
		const t = index / 24;
		const signedT = t * 2 - 1;
		const rise =
			middle.y * (1 - (Math.cosh(coefficient * signedT) - 1) / Math.max(denominator, 0.001));
		samples.push(start.clone().lerp(end, t).setY(rise));
	}
	const curve = new THREE.CatmullRomCurve3(samples, false, 'centripetal');
	const geometry = new THREE.TubeGeometry(curve, 30, 1.65, 8, false);
	geometries.push(geometry);
	return mesh(geometry, material);
}

function createBiswaBanglaGate(materials: LandmarkMaterials): LandmarkModel {
	const object = new THREE.Group();
	const geometries: THREE.BufferGeometry[] = [];
	object.add(
		catenaryArch(
			new THREE.Vector3(-33, 0, -33),
			new THREE.Vector3(0, 55, 0),
			new THREE.Vector3(33, 0, 33),
			materials.steel,
			geometries
		),
		catenaryArch(
			new THREE.Vector3(-33, 0, 33),
			new THREE.Vector3(0, 55, 0),
			new THREE.Vector3(33, 0, -33),
			materials.steel,
			geometries
		)
	);
	const ringGeometry = new THREE.TorusGeometry(30, 2.2, 8, 64);
	geometries.push(ringGeometry);
	const ring = mesh(ringGeometry, materials.glass, [0, 25, 0]);
	ring.rotation.x = Math.PI / 2;
	object.add(ring);
	const coreGeometry = new THREE.CylinderGeometry(2.1, 2.6, 25, 10);
	geometries.push(coreGeometry);
	for (const x of [-1, 1]) {
		for (const z of [-1, 1]) {
			object.add(mesh(coreGeometry, materials.steelDark, [x * 28, 12.5, z * 28]));
		}
	}
	object.userData.landmarkId = 'biswa-bangla-gate';
	object.userData.structuralType = 'two-intersecting-catenary-arches-with-ring';
	object.userData.archCurve = 'inverted-cosh-catenary';
	object.userData.sourceDimensions = {
		archHeightM: 55,
		ringDiameterM: 60,
		ringHeightM: 25,
		quadrantSupports: 4
	};
	return { object, authoredGeometries: geometries };
}

function createNewMarket(materials: LandmarkMaterials): LandmarkModel {
	const object = new THREE.Group();
	const geometries: THREE.BufferGeometry[] = [];
	const base = new THREE.BoxGeometry(36, 17, 18);
	const tower = new THREE.BoxGeometry(9, 31, 9);
	const roof = new THREE.ConeGeometry(7.2, 10, 4);
	const clock = new THREE.CylinderGeometry(2.2, 2.2, 0.25, 20);
	geometries.push(base, tower, roof, clock);
	object.add(mesh(base, materials.brick, [0, 8.5, 0]));
	object.add(mesh(tower, materials.brick, [0, 25, 0]));
	const roofMesh = mesh(roof, materials.steelDark, [0, 45.5, 0]);
	roofMesh.rotation.y = Math.PI / 4;
	object.add(roofMesh);
	for (const z of [-4.62, 4.62]) {
		const clockMesh = mesh(clock, materials.marble, [0, 32, z]);
		clockMesh.rotation.x = Math.PI / 2;
		object.add(clockMesh);
	}
	object.userData.landmarkId = 'new-market-clock-tower';
	object.userData.architecturalSilhouette = 'red-brick-market-clock-tower';
	return { object, authoredGeometries: geometries };
}

function createShaheedMinar(materials: LandmarkMaterials): LandmarkModel {
	const object = new THREE.Group();
	const geometries: THREE.BufferGeometry[] = [];
	const base = new THREE.CylinderGeometry(8, 10, 5, 18);
	const shaft = new THREE.CylinderGeometry(2.7, 4, 37, 18);
	const crown = new THREE.CylinderGeometry(5.2, 3.5, 5, 18);
	const dome = new THREE.SphereGeometry(4.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
	geometries.push(base, shaft, crown, dome);
	object.add(mesh(base, materials.marbleShadow, [0, 2.5, 0]));
	object.add(mesh(shaft, materials.marble, [0, 23.5, 0]));
	object.add(mesh(crown, materials.marbleShadow, [0, 44.5, 0]));
	object.add(mesh(dome, materials.marble, [0, 47, 0]));
	object.userData.landmarkId = 'shaheed-minar';
	object.userData.architecturalSilhouette = 'tall-fluted-column-with-crowned-top';
	return { object, authoredGeometries: geometries };
}

function createStPauls(materials: LandmarkMaterials): LandmarkModel {
	const object = new THREE.Group();
	const geometries: THREE.BufferGeometry[] = [];
	const nave = new THREE.BoxGeometry(22, 18, 48);
	const tower = new THREE.BoxGeometry(14, 31, 14);
	const spire = new THREE.ConeGeometry(6.5, 22, 4);
	const buttress = new THREE.BoxGeometry(2.2, 14, 3.2);
	geometries.push(nave, tower, spire, buttress);
	object.add(mesh(nave, materials.marbleShadow, [0, 9, 6]));
	object.add(mesh(tower, materials.marble, [0, 15.5, -20]));
	const spireMesh = mesh(spire, materials.marble, [0, 42, -20]);
	spireMesh.rotation.y = Math.PI / 4;
	object.add(spireMesh);
	for (const x of [-12, 12]) {
		for (const z of [-11, 2, 15, 28]) object.add(mesh(buttress, materials.marble, [x, 7, z]));
	}
	object.userData.landmarkId = 'st-pauls-cathedral';
	object.userData.architecturalSilhouette = 'gothic-nave-buttresses-central-spire';
	return { object, authoredGeometries: geometries };
}

export function createLandmarkModel(
	blueprint: LandmarkBlueprint,
	materials: LandmarkMaterials,
	quality: WorldQualityTier = 'balanced'
): LandmarkModel {
	let model: LandmarkModel;
	switch (blueprint.id) {
		case 'howrah-bridge':
			model = createHowrahBridge(materials);
			break;
		case 'vidyasagar-setu':
			model = createVidyasagarSetu(materials, quality);
			break;
		case 'victoria-memorial':
			model = createVictoriaMemorial(materials);
			break;
		case 'biswa-bangla-gate':
			model = createBiswaBanglaGate(materials);
			break;
		case 'new-market-clock-tower':
			model = createNewMarket(materials);
			break;
		case 'shaheed-minar':
			model = createShaheedMinar(materials);
			break;
		case 'st-pauls-cathedral':
			model = createStPauls(materials);
			break;
	}
	model.object.position.set(...blueprint.position);
	model.object.rotation.y = blueprint.rotationY;
	model.object.scale.setScalar(blueprint.scale);
	model.object.userData.prominence = blueprint.prominence;
	model.object.userData.locallyTruthful = true;
	const visibilityAnchor = new THREE.Object3D();
	const visibility: Readonly<
		Record<LandmarkBlueprint['id'], { readonly y: number; readonly radius: number }>
	> = {
		'howrah-bridge': { y: 46, radius: 72 },
		'vidyasagar-setu': { y: 78, radius: 82 },
		'victoria-memorial': { y: 29, radius: 34 },
		'biswa-bangla-gate': { y: 29, radius: 34 },
		'new-market-clock-tower': { y: 29, radius: 22 },
		'shaheed-minar': { y: 28, radius: 17 },
		'st-pauls-cathedral': { y: 26, radius: 25 }
	};
	visibilityAnchor.position.y = visibility[blueprint.id].y;
	visibilityAnchor.name = `${blueprint.id}-visibility-anchor`;
	visibilityAnchor.userData.visibilityRadiusM = visibility[blueprint.id].radius * blueprint.scale;
	model.object.add(visibilityAnchor);
	model.object.userData.visibilityAnchor = visibilityAnchor;
	return model;
}
