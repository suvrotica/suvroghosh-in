import * as THREE from 'three';
import { tissueSupply } from './core';
import type { ElevatorRenderer, RenderState } from './types';

/** Browser-only, demand-rendered atlas. Scene coordinates are local, never metres. */
const INK = 0x0a1723;
const CYAN = 0x82f4ed;
const IVORY = 0xdedbca;
const CORAL = 0xef927d;
const AMBER = 0xeac376;
const BLUE = 0x749abb;
const SLATE = 0x334959;
const TAU = Math.PI * 2;
const oxygenColour = new THREE.Color(CYAN);
type Point = [number, number, number?];
type SceneEntry = { group: THREE.Group; step: (state: RenderState) => void };
type Packet = { group: THREE.Group; curve: THREE.Curve<THREE.Vector3>; phase: number };

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = (value: number) => value * value * (3 - 2 * value);
const vec = ([x, y, z = 0]: Point) => new THREE.Vector3(x, y, z);

function material(colour: number, opacity = 1, emissive = false) {
	const result = new THREE.MeshStandardMaterial({
		color: colour,
		roughness: 0.65,
		metalness: 0.08,
		emissive: emissive ? colour : 0x000000,
		emissiveIntensity: emissive ? 0.35 : 0,
		transparent: true,
		opacity,
		depthWrite: opacity > 0.85,
		side: THREE.DoubleSide
	});
	result.userData.baseOpacity = opacity;
	return result;
}

function sphere(parent: THREE.Object3D, at: Point, radius: number, colour: number, opacity = 1) {
	const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 12), material(colour, opacity));
	mesh.position.copy(vec(at));
	parent.add(mesh);
	return mesh;
}

function box(parent: THREE.Object3D, at: Point, size: Point, colour: number, opacity = 1) {
	const mesh = new THREE.Mesh(
		new THREE.BoxGeometry(size[0], size[1], size[2] ?? 0.15),
		material(colour, opacity)
	);
	mesh.position.copy(vec(at));
	parent.add(mesh);
	return mesh;
}

function rod(
	parent: THREE.Object3D,
	start: Point,
	end: Point,
	radius: number,
	colour: number,
	opacity = 1
) {
	const a = vec(start);
	const b = vec(end);
	const direction = b.clone().sub(a);
	const mesh = new THREE.Mesh(
		new THREE.CylinderGeometry(radius, radius, direction.length(), 9),
		material(colour, opacity)
	);
	mesh.position.copy(a.add(b).multiplyScalar(0.5));
	mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
	parent.add(mesh);
	return mesh;
}

function line(parent: THREE.Object3D, points: Point[], colour = IVORY, opacity = 0.45) {
	const lineMaterial = new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity });
	lineMaterial.userData.baseOpacity = opacity;
	const result = new THREE.Line(
		new THREE.BufferGeometry().setFromPoints(points.map(vec)),
		lineMaterial
	);
	parent.add(result);
	return result;
}

function curveFor(points: Point[], closed = false) {
	return new THREE.CatmullRomCurve3(points.map(vec), closed, 'catmullrom', 0.35);
}

function tube(
	parent: THREE.Object3D,
	points: Point[],
	radius: number,
	colour: number,
	opacity = 1,
	closed = false
) {
	const curve = curveFor(points, closed);
	const mesh = new THREE.Mesh(
		new THREE.TubeGeometry(curve, Math.max(32, points.length * 8), radius, 7, closed),
		material(colour, opacity)
	);
	parent.add(mesh);
	return { curve, mesh };
}

function ring(
	parent: THREE.Object3D,
	at: Point,
	radius: number,
	colour: number,
	opacity = 0.5,
	scaleY = 1
) {
	const points: Point[] = Array.from({ length: 97 }, (_, index) => {
		const angle = (index / 96) * TAU;
		return [
			at[0] + Math.cos(angle) * radius,
			at[1] + Math.sin(angle) * radius * scaleY,
			at[2] ?? 0
		];
	});
	return line(parent, points, colour, opacity);
}

function oxygen(parent: THREE.Object3D, radius = 0.085) {
	const group = new THREE.Group();
	sphere(group, [-radius * 0.73, 0, 0], radius, CYAN);
	sphere(group, [radius * 0.73, 0, 0], radius, CYAN);
	rod(group, [-radius * 0.65, 0, 0], [radius * 0.65, 0, 0], radius * 0.33, IVORY);
	parent.add(group);
	return group;
}

function packets(
	parent: THREE.Object3D,
	points: Point[],
	count = 8,
	radius = 0.06,
	phase = 0
): Packet[] {
	const curve = curveFor(points);
	const result: Packet[] = [];
	for (let index = 0; index < count; index++) {
		result.push({ group: oxygen(parent, radius), curve, phase: index / count + phase });
	}
	return result;
}

const packetPoint = new THREE.Vector3();
const packetTangent = new THREE.Vector3();
function movePackets(items: Packet[], time: number, speed = 0.06, visible = 1) {
	for (const [index, packet] of items.entries()) {
		const progress = (((packet.phase + time * speed) % 1) + 1) % 1;
		packet.curve.getPointAt(progress, packetPoint);
		packet.group.position.copy(packetPoint);
		packet.curve.getTangentAt(progress, packetTangent);
		packet.group.rotation.z = Math.atan2(packetTangent.y, packetTangent.x);
		packet.group.visible = index / items.length < visible;
	}
}

function ruler(parent: THREE.Object3D, x = -4.8, y = -2.8, width = 2.1) {
	line(
		parent,
		[
			[x, y],
			[x + width, y]
		],
		IVORY,
		0.7
	);
	for (let tick = 0; tick <= 10; tick++) {
		const at = x + (tick / 10) * width;
		line(
			parent,
			[
				[at, y],
				[at, y + (tick % 5 === 0 ? 0.15 : 0.07)]
			],
			IVORY,
			0.6
		);
	}
}

function cross(parent: THREE.Object3D, x: number, y: number, size = 0.2, colour = IVORY) {
	box(parent, [x, y, 0.45], [size * 2.7, size * 0.72, 0.04], colour);
	box(parent, [x, y, 0.46], [size * 0.72, size * 2.7, 0.04], colour);
}

function haem(parent: THREE.Object3D, x: number, y: number, scale = 1, detailed = true) {
	const group = new THREE.Group();
	group.position.set(x, y, 0);
	group.scale.setScalar(scale);
	parent.add(group);
	for (let quadrant = 0; quadrant < 4; quadrant++) {
		const angle = quadrant * Math.PI * 0.5 + Math.PI * 0.25;
		const centreX = Math.cos(angle) * 1.42;
		const centreY = Math.sin(angle) * 1.42;
		const nodes: Point[] = [];
		for (let index = 0; index < 5; index++) {
			const a = angle + Math.PI + (index / 5) * TAU;
			nodes.push([centreX + Math.cos(a) * 0.72, centreY + Math.sin(a) * 0.72, 0.04]);
		}
		for (let index = 0; index < 5; index++) {
			rod(group, nodes[index], nodes[(index + 1) % 5], 0.046, IVORY, 0.8);
			sphere(group, nodes[index], index === 0 ? 0.12 : 0.075, index === 0 ? BLUE : CORAL);
		}
		rod(group, nodes[0], [0, 0, 0.05], 0.032, BLUE, 0.55);
		const outer: Point = [Math.cos(angle) * 2.36, Math.sin(angle) * 2.36, 0.02];
		rod(group, [centreX, centreY, 0], outer, 0.04, IVORY, 0.6);
		if (detailed) {
			sphere(group, outer, 0.085, CORAL);
			const branch: Point = [
				outer[0] + Math.cos(angle + 0.45) * 0.45,
				outer[1] + Math.sin(angle + 0.45) * 0.45,
				0
			];
			rod(group, outer, branch, 0.04, IVORY, 0.6);
			sphere(group, branch, 0.075, CORAL);
		}
	}
	for (let index = 0; index < 4; index++) {
		const angle = index * Math.PI * 0.5;
		rod(
			group,
			[Math.cos(angle - 0.24) * 1.75, Math.sin(angle - 0.24) * 1.75],
			[Math.cos(angle + 0.24) * 1.75, Math.sin(angle + 0.24) * 1.75],
			0.045,
			IVORY,
			0.8
		);
	}
	sphere(group, [0, 0, 0.1], 0.26, AMBER);
	ring(group, [0, 0, 0.15], 0.42, AMBER, 0.55);
	return group;
}

function ionScene(): SceneEntry {
	const group = new THREE.Group();
	haem(group, -0.65, 0, 1.05);
	ring(group, [-0.65, 0, -0.3], 3.04, BLUE, 0.22);
	ring(group, [-0.65, 0, -0.3], 3.2, BLUE, 0.12);
	for (let index = 0; index < 36; index++) {
		const angle = (index / 36) * TAU;
		line(
			group,
			[
				[-0.65 + Math.cos(angle) * 3.04, Math.sin(angle) * 3.04],
				[-0.65 + Math.cos(angle) * 3.15, Math.sin(angle) * 3.15]
			],
			IVORY,
			0.25
		);
	}
	const molecule = oxygen(group, 0.23);
	const approach: Point[] = [
		[4.8, 2.3, 0.4],
		[3.2, 1.6, 0.4],
		[1.6, 1, 0.4],
		[-0.38, 0.36, 0.65]
	];
	line(group, approach, CYAN, 0.28);
	const trail = packets(group, approach, 5, 0.055);
	line(
		group,
		[
			[-0.65, 0],
			[0.8, -1.65],
			[2.3, -1.65]
		],
		AMBER,
		0.45
	);
	line(
		group,
		[
			[1.3, 1.05],
			[2.5, 2.5],
			[4, 2.5]
		],
		CYAN,
		0.35
	);
	ruler(group);
	return {
		group,
		step: (state) => {
			const bound = state.control >= 0.5;
			molecule.position.set(
				bound ? -0.38 : 2.8 + Math.sin(state.time * 0.6) * 0.2,
				bound ? 0.37 : 1.56,
				0.6
			);
			molecule.rotation.z = bound ? 0.85 : -0.5;
			movePackets(trail, state.time, 0.035);
		}
	};
}

function moleculeScene(): SceneEntry {
	const group = new THREE.Group();
	const locations: Point[] = [
		[-1.65, 1.35],
		[1.65, 1.35],
		[-1.65, -1.35],
		[1.65, -1.35]
	];
	const sites: THREE.Group[] = [];
	for (const [index, location] of locations.entries()) {
		const subunit = new THREE.Group();
		subunit.position.set(location[0], location[1], 0);
		subunit.rotation.z = index % 2 === 0 ? -0.2 : 0.2;
		group.add(subunit);
		const colour = [CORAL, BLUE, AMBER, 0xa6a2c7][index];
		const ribbon: Point[] = [];
		for (let point = 0; point < 100; point++) {
			const t = point / 99;
			const angle = t * TAU * 3.1;
			ribbon.push([
				Math.cos(angle) * (0.45 + Math.sin(t * Math.PI) * 0.5),
				(t - 0.5) * 2.65,
				Math.sin(angle) * 0.35 - 0.15
			]);
		}
		tube(subunit, ribbon, 0.075, colour, 0.7);
		ring(subunit, [0, 0, -0.2], 1.25, colour, 0.14, 1.2);
		haem(subunit, 0, 0, 0.32, false);
		const bound = oxygen(subunit, 0.115);
		bound.position.set(0.1, 0.22, 0.5);
		bound.rotation.z = 0.8;
		sites.push(bound);
	}
	const motion = packets(
		group,
		[
			[-5, 2.7, 0.4],
			[-3.6, 2.4, 0.4],
			[-2.9, 1.7, 0.4],
			[-1.5, 1.5, 0.5]
		],
		6,
		0.07
	);
	line(
		group,
		[
			[3, 1.4],
			[4, 2],
			[4.9, 2]
		],
		IVORY,
		0.5
	);
	line(
		group,
		[
			[3, -1.3],
			[4, -2.2],
			[4.9, -2.2]
		],
		IVORY,
		0.5
	);
	ruler(group);
	return {
		group,
		step: (state) => {
			sites.forEach((site, index) => {
				site.visible = index < state.model.boundSites;
			});
			movePackets(motion, state.time, 0.045);
		}
	};
}

function membraneScene(): SceneEntry {
	const group = new THREE.Group();
	box(group, [-2.8, 0, -0.5], [4.55, 5.7, 0.02], BLUE, 0.055);
	box(group, [2.8, 0, -0.5], [4.55, 5.7, 0.02], CYAN, 0.035);
	const lipids = new THREE.Group();
	group.add(lipids);
	for (let side = -1; side <= 1; side += 2) {
		for (let index = 0; index < 21; index++) {
			const y = -2.8 + index * 0.28;
			sphere(lipids, [side * 0.48, y, 0.04], 0.105, AMBER);
			line(
				lipids,
				[
					[side * 0.41, y - 0.03],
					[side * 0.25, y - 0.08],
					[side * 0.06, y - 0.05]
				],
				IVORY,
				0.6
			);
			line(
				lipids,
				[
					[side * 0.41, y + 0.03],
					[side * 0.25, y + 0.08],
					[side * 0.06, y + 0.05]
				],
				IVORY,
				0.6
			);
		}
	}
	const tracks: Packet[] = [];
	for (let index = 0; index < 7; index++) {
		const y = (index - 3) * 0.7;
		tracks.push(
			...packets(
				group,
				[
					[-4.8, y + 0.12],
					[-2, y - 0.1],
					[0, y, 0.2],
					[2, y + 0.1],
					[4.8, y - 0.15]
				],
				6,
				0.065,
				index * 0.073
			)
		);
	}
	line(
		group,
		[
			[-0.48, -3.05],
			[0.48, -3.05]
		],
		AMBER,
		0.85
	);
	line(
		group,
		[
			[-0.48, -2.9],
			[-0.48, -3.18]
		],
		AMBER,
		0.8
	);
	line(
		group,
		[
			[0.48, -2.9],
			[0.48, -3.18]
		],
		AMBER,
		0.8
	);
	const arrow = tube(
		group,
		[
			[-3.2, 2.5],
			[-1.8, 2.5]
		],
		0.025,
		CYAN,
		0.75
	).mesh;
	line(
		group,
		[
			[-2.1, 2.7],
			[-1.8, 2.5],
			[-2.1, 2.3]
		],
		CYAN,
		0.9
	);
	return {
		group,
		step: (state) => {
			movePackets(tracks, state.time, 0.035 + state.model.gradient * 0.04);
			arrow.scale.x = 0.6 + state.control * 0.6;
		}
	};
}

function mitochondrion(parent: THREE.Object3D, x: number, y: number, angle: number, scale = 1) {
	const group = new THREE.Group();
	group.position.set(x, y, 0.35);
	group.rotation.z = angle;
	group.scale.setScalar(scale);
	parent.add(group);
	tube(
		group,
		[
			[-0.8, -0.25],
			[-0.9, 0.1],
			[-0.45, 0.45],
			[0.15, 0.43],
			[0.7, 0.2],
			[0.85, -0.2],
			[0.4, -0.42],
			[-0.3, -0.4]
		],
		0.052,
		CORAL,
		0.9,
		true
	);
	const cristae: Point[] = [];
	for (let index = 0; index < 15; index++) {
		const xAt = -0.66 + index * 0.09;
		cristae.push([xAt, Math.sin(index * 2.1) * 0.24, 0.03]);
	}
	tube(group, cristae, 0.027, AMBER, 0.9);
	return group;
}

function cellScene(): SceneEntry {
	const group = new THREE.Group();
	const cell = sphere(group, [0.65, 0, -0.3], 1, BLUE, 0.1);
	cell.scale.set(4.05, 2.75, 0.16);
	ring(group, [0.65, 0, 0], 4.05, IVORY, 0.6, 2.75 / 4.05);
	ring(group, [0.65, 0, 0], 3.95, BLUE, 0.25, 2.65 / 3.95);
	const nucleus = sphere(group, [-0.75, -0.25, 0], 0.94, 0x807e9d, 0.35);
	nucleus.scale.set(1.02, 1.12, 0.3);
	ring(group, [-0.75, -0.25, 0.35], 0.95, 0xa7a5bf, 0.65, 1.12);
	sphere(group, [-0.9, -0.17, 0.4], 0.22, 0xb9b6d3, 0.6);
	mitochondrion(group, 1.4, 1.24, -0.22, 1);
	mitochondrion(group, 2.65, -0.9, 0.55, 0.86);
	mitochondrion(group, 0.15, -1.75, -0.35, 0.75);
	mitochondrion(group, 2.9, 0.8, 0.65, 0.65);
	const rbc = sphere(group, [-4.65, 0.3, 0], 0.65, CORAL, 0.9);
	rbc.scale.set(1, 0.75, 0.22);
	ring(group, [-4.65, 0.3, 0.25], 0.38, 0x943d3f, 0.6, 0.75);
	const paths: Packet[] = [];
	paths.push(
		...packets(
			group,
			[
				[-4.5, 0.6],
				[-3.2, 1.25],
				[-1.8, 1.75],
				[0, 1.7],
				[1.3, 1.2]
			],
			8,
			0.063
		)
	);
	paths.push(
		...packets(
			group,
			[
				[-4.35, 0.1],
				[-3, -1.2],
				[-2.3, -2.1],
				[-0.3, -2],
				[0.2, -1.65]
			],
			7,
			0.058,
			0.09
		)
	);
	for (let index = 0; index < 22; index++) {
		const angle = index * 2.399;
		const radius = 1.1 + ((index * 7) % 13) / 6;
		sphere(
			group,
			[0.7 + Math.cos(angle) * radius, Math.sin(angle) * radius * 0.63, -0.05],
			0.033,
			IVORY,
			0.4
		);
	}
	ruler(group);
	return {
		group,
		step: (state) => movePackets(paths, state.time, 0.027 + state.model.uptake * 0.025)
	};
}

function tissueScene(): SceneEntry {
	const group = new THREE.Group();
	const locations: Point[] = [];
	const cells = new THREE.InstancedMesh(
		new THREE.SphereGeometry(0.27, 12, 8),
		material(0xffffff, 0.38),
		112
	);
	const transform = new THREE.Object3D();
	const outlines: number[] = [];
	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 14; col++) {
			const x = (col - 6.5) * 0.68 + (row % 2) * 0.33;
			const y = (row - 3.5) * 0.66;
			transform.position.set(x, y, -0.1);
			transform.scale.set(1, 1, 0.25);
			transform.updateMatrix();
			cells.setMatrixAt(row * 14 + col, transform.matrix);
			cells.setColorAt(row * 14 + col, oxygenColour);
			locations.push([x, y]);
			for (let edge = 0; edge < 24; edge++) {
				for (const endpoint of [edge, edge + 1]) {
					const angle = (endpoint / 24) * TAU;
					outlines.push(x + Math.cos(angle) * 0.29, y + Math.sin(angle) * 0.29, 0);
				}
			}
		}
	}
	group.add(cells);
	const boundaryMaterial = new THREE.LineBasicMaterial({
		color: IVORY,
		transparent: true,
		opacity: 0.12
	});
	boundaryMaterial.userData.baseOpacity = 0.12;
	group.add(
		new THREE.LineSegments(
			new THREE.BufferGeometry().setAttribute(
				'position',
				new THREE.Float32BufferAttribute(outlines, 3)
			),
			boundaryMaterial
		)
	);
	const cellColour = new THREE.Color();
	const vessel: Point[] = Array.from({ length: 20 }, (_, index) => {
		const x = -5 + index * (10 / 19);
		return [x, Math.sin(x * 0.65) * 0.65, 0.2];
	});
	const vesselSegments = [tube(group, vessel, 0.15, CORAL, 0.85).curve.getPoints(120)];
	const paths = packets(group, vessel, 18, 0.07);
	for (let index = 0; index < 6; index++) {
		const x = -3.8 + index * 1.5;
		const y = Math.sin(x * 0.65) * 0.65;
		const targetY = index % 2 ? 2.7 : -2.7;
		const branch: Point[] = [
			[x, y, 0.2],
			[x + 0.35, y + (targetY - y) * 0.5, 0.25],
			[x + 0.7, targetY, 0.2]
		];
		vesselSegments.push(tube(group, branch, 0.055, CORAL, 0.6).curve.getPoints(48));
		paths.push(...packets(group, branch, 3, 0.044, index * 0.13));
		line(
			group,
			[
				[x + 0.4, y + 0.12],
				[x + 0.4, y + (targetY > 0 ? 1.1 : -1.1)]
			],
			IVORY,
			0.25
		);
	}
	// The authored field references every displayed vessel, rather than only the trunk.
	// Sample the same centreline curves used by TubeGeometry, then measure in the view plane.
	const distances = locations.map(([x, y]) => {
		let nearest = Infinity;
		for (const points of vesselSegments) {
			for (let index = 1; index < points.length; index++) {
				const a = points[index - 1];
				const b = points[index];
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const lengthSquared = dx * dx + dy * dy;
				const along = lengthSquared ? clamp(((x - a.x) * dx + (y - a.y) * dy) / lengthSquared) : 0;
				nearest = Math.min(nearest, Math.hypot(x - a.x - along * dx, y - a.y - along * dy));
			}
		}
		return nearest;
	});
	ruler(group);
	return {
		group,
		step: (state) => {
			movePackets(paths, state.time, 0.025 + state.model.perfusion * 0.025);
			for (const [index, distance] of distances.entries()) {
				const available = clamp(tissueSupply(distance, state.model.perfusion));
				cells.setColorAt(index, cellColour.setHex(0xa16359).lerp(oxygenColour, available));
			}
			if (cells.instanceColor) cells.instanceColor.needsUpdate = true;
		}
	};
}

function heartShape() {
	const shape = new THREE.Shape();
	shape.moveTo(0, -2.4);
	shape.bezierCurveTo(-0.8, -1.5, -2.15, -0.5, -2.05, 0.9);
	shape.bezierCurveTo(-2.04, 2.7, -0.55, 2.7, 0.05, 1.65);
	shape.bezierCurveTo(0.45, 2.85, 2.3, 2.55, 2.15, 0.8);
	shape.bezierCurveTo(2.1, -0.4, 0.9, -1.5, 0, -2.4);
	return shape;
}

function organScene(): SceneEntry {
	const group = new THREE.Group();
	const heart = new THREE.Mesh(
		new THREE.ExtrudeGeometry(heartShape(), {
			depth: 0.3,
			bevelEnabled: true,
			bevelSize: 0.16,
			bevelThickness: 0.15,
			bevelSegments: 3,
			steps: 1,
			curveSegments: 24
		}),
		material(CORAL, 0.26)
	);
	heart.position.set(-0.3, -0.1, -0.3);
	group.add(heart);
	line(
		group,
		heartShape()
			.getPoints(100)
			.map((p) => [p.x - 0.3, p.y - 0.1, 0.2] as Point),
		CORAL,
		0.8
	);
	const arch: Point[] = [
		[-0.1, 0.3, 0.35],
		[-0.6, 1.5, 0.35],
		[-0.4, 2.6, 0.35],
		[0.75, 2.8, 0.35],
		[1.2, 1.8, 0.35]
	];
	tube(group, arch, 0.2, CORAL, 0.95);
	const branches: Point[][] = [
		[
			[-0.3, 1.55],
			[-1, 0.85],
			[-1.5, -0.1],
			[-0.5, -1.65]
		],
		[
			[0, 1.5],
			[0.65, 0.9],
			[1.15, -0.15],
			[0.2, -1.8]
		],
		[
			[-0.8, 0.9],
			[-0.35, 0.4],
			[-0.35, -1.2]
		]
	];
	const paths: Packet[] = [];
	for (const branch of branches) {
		const raised = branch.map(([x, y]) => [x, y, 0.4] as Point);
		tube(group, raised, 0.075, CYAN, 0.7);
		paths.push(...packets(group, raised, 7, 0.054));
	}
	const regions: THREE.Mesh[] = [];
	for (let index = 0; index < 4; index++) {
		const x = index % 2 ? 0.62 : -1.03;
		const y = 0.82 - Math.floor(index / 2) * 1.43;
		const region = sphere(group, [x, y, 0.1], 0.55, CYAN, 0.13);
		region.scale.set(1, 0.8, 0.15);
		regions.push(region);
	}
	for (let index = 0; index < 3; index++) {
		const x = 3.1 + index * 0.4;
		line(
			group,
			[
				[2.7, -1.6 + index * 1.3],
				[x, -1.6 + index * 1.3]
			],
			IVORY,
			0.5
		);
	}
	line(
		group,
		[
			[1.1, 0.6],
			[2.5, 1.5],
			[4.6, 1.5]
		],
		CYAN,
		0.4
	);
	line(
		group,
		[
			[0.2, -1.8],
			[2.4, -2],
			[4.6, -2]
		],
		CORAL,
		0.4
	);
	ruler(group);
	return {
		group,
		step: (state) => {
			movePackets(paths, state.time, 0.025 + state.model.perfusion * 0.025);
			regions.forEach((region, index) => {
				const regional = state.model.regionalDelivery[index] ?? 0;
				const reference = state.model.regionalDemand[index] ?? 1;
				const regionMaterial = region.material as THREE.MeshStandardMaterial;
				regionMaterial.color
					.setHex(CORAL)
					.lerp(new THREE.Color(CYAN), clamp(regional / Math.max(reference, 0.001)));
				region.scale.x = index === state.selected % 4 ? 1.17 : 1;
			});
		}
	};
}

function personScene(): SceneEntry {
	const group = new THREE.Group();
	const body = new THREE.Group();
	body.position.set(-0.8, 0.05, -0.2);
	group.add(body);
	sphere(body, [0, 2.28, 0], 0.48, IVORY, 0.45);
	rod(body, [0, 1.76], [0, 1.5], 0.23, IVORY, 0.35);
	const shape = new THREE.Shape();
	shape.moveTo(-0.7, 1.6);
	shape.quadraticCurveTo(-0.9, 0.7, -0.5, -0.6);
	shape.lineTo(0.5, -0.6);
	shape.quadraticCurveTo(0.9, 0.7, 0.7, 1.6);
	shape.closePath();
	const trunk = new THREE.Mesh(new THREE.ShapeGeometry(shape), material(IVORY, 0.13));
	body.add(trunk);
	for (const side of [-1, 1]) {
		rod(body, [side * 0.65, 1.38], [side * 1.04, 0.2], 0.18, IVORY, 0.25);
		rod(body, [side * 1.04, 0.2], [side * 0.91, -0.9], 0.14, IVORY, 0.25);
		rod(body, [side * 0.34, -0.5], [side * 0.42, -1.6], 0.23, IVORY, 0.25);
		rod(body, [side * 0.42, -1.6], [side * 0.48, -2.76], 0.17, IVORY, 0.25);
		const lung = sphere(body, [side * 0.35, 0.83, 0.25], 0.42, BLUE, 0.65);
		lung.scale.set(0.68, 1.35, 0.2);
	}
	sphere(body, [0.08, 0.3, 0.42], 0.19, CORAL);
	const circulation: Point[] = [
		[-0.75, 0.35, 0.6],
		[-1.1, 1.2, 0.6],
		[-0.6, 1.65, 0.6],
		[0.1, 1.2, 0.6],
		[0.2, 0, 0.6],
		[-0.1, -1.7, 0.6],
		[-0.7, -2.2, 0.6],
		[-1.3, -1.6, 0.6],
		[-1.65, -0.1, 0.6],
		[-0.75, 0.35, 0.6]
	];
	tube(group, circulation, 0.035, CYAN, 0.65);
	const paths = packets(group, circulation, 18, 0.052);
	const circuit: Point[] = [
		[0.8, 1.65],
		[3.5, 1.65],
		[4.1, 1.1],
		[4.1, -1.2],
		[3.5, -1.8],
		[0.8, -1.8]
	];
	line(group, circuit, CYAN, 0.35);
	for (let row = 0; row < 4; row++) {
		for (let col = 0; col < 5; col++) {
			const cell = sphere(group, [1.5 + col * 0.45, -0.65 + row * 0.45], 0.15, CORAL, 0.4);
			cell.scale.z = 0.3;
		}
	}
	const deliveryPackets = packets(group, circuit, 14, 0.065);
	line(
		group,
		[
			[-0.45, 0.9],
			[0.65, 2.4],
			[2.25, 2.4]
		],
		IVORY,
		0.3
	);
	return {
		group,
		step: (state) => {
			movePackets(paths, state.time, state.model.cardiacOutput * 0.012);
			movePackets(
				deliveryPackets,
				state.time,
				state.model.cardiacOutput * 0.012,
				clamp(state.model.content / 20)
			);
		}
	};
}

function cylinder(parent: THREE.Object3D, x: number, y: number, height = 1.7, radius = 0.28) {
	const mesh = new THREE.Mesh(
		new THREE.CylinderGeometry(radius, radius, height, 20),
		material(BLUE, 0.8)
	);
	mesh.position.set(x, y, 0.1);
	parent.add(mesh);
	sphere(parent, [x, y + height / 2, 0.1], radius, BLUE, 0.8).scale.y = 0.4;
	box(parent, [x, y + height / 2 + 0.16, 0.1], [0.18, 0.24, 0.18], AMBER);
	return mesh;
}

function bed(parent: THREE.Object3D, x: number, y: number, scale = 1) {
	const group = new THREE.Group();
	group.position.set(x, y, 0);
	group.scale.setScalar(scale);
	parent.add(group);
	box(group, [0, 0, 0], [1.1, 1.9, 0.16], BLUE, 0.55);
	box(group, [0, 0.04, 0.12], [0.94, 1.68, 0.16], IVORY, 0.75);
	box(group, [0, 0.64, 0.23], [0.72, 0.34, 0.14], IVORY, 0.95);
	sphere(group, [0, 0.52, 0.4], 0.19, CORAL, 0.9).scale.z = 0.55;
	box(group, [0, -0.22, 0.28], [0.69, 0.93, 0.15], 0x527982, 0.95);
	for (const side of [-1, 1]) {
		rod(group, [side * 0.61, -0.7, 0.2], [side * 0.61, 0.6, 0.2], 0.023, IVORY, 0.75);
	}
	return group;
}

function bedScene(): SceneEntry {
	const group = new THREE.Group();
	const resting = bed(group, -1.1, -0.1, 2.15);
	resting.rotation.z = Math.PI * 0.5;
	for (const x of [-2.55, 0.35]) {
		rod(group, [x, -1.27], [x, -2.07], 0.065, IVORY, 0.7);
		ring(group, [x, -2.12], 0.15, IVORY, 0.7);
	}
	cylinder(group, -4.6, 0.2, 1.95, 0.36);
	const supply: Point[] = [
		[-4.6, 1.35, 0.6],
		[-4.2, 1.65, 0.6],
		[-3.2, 1.4, 0.6],
		[-2.2, 0.25, 0.7]
	];
	tube(group, supply, 0.025, CYAN, 0.9);
	const paths = packets(group, supply, 7, 0.05);
	box(group, [3.3, 0.9, 0], [2.25, 1.75, 0.25], SLATE);
	box(group, [3.3, 0.92, 0.2], [2.02, 1.45, 0.08], 0x07121c);
	rod(group, [3.3, 0], [3.3, -1.85], 0.065, IVORY, 0.65);
	rod(group, [2.7, -1.85], [3.9, -1.85], 0.055, IVORY, 0.65);
	const tracePoints: Point[] = [];
	for (let index = 0; index < 90; index++) {
		const t = index / 89;
		const wave =
			Math.sin(t * TAU * 4) * 0.12 + Math.pow(Math.max(0, Math.sin(t * TAU * 4 - 0.6)), 8) * 0.23;
		tracePoints.push([2.38 + t * 1.84, 1 + wave, 0.35]);
	}
	line(group, tracePoints, CYAN, 0.9);
	line(
		group,
		[
			[-2.2, 0.5],
			[-1.8, 1.7],
			[1.8, 1.7],
			[2.2, 1.1]
		],
		BLUE,
		0.5
	);
	const marker = sphere(group, [2.4, 1, 0.4], 0.065, AMBER);
	line(
		group,
		[
			[-4.95, -2.5],
			[4.9, -2.5]
		],
		IVORY,
		0.16
	);
	return {
		group,
		step: (state) => {
			movePackets(paths, state.time, 0.055);
			marker.position.x = 2.38 + (Math.round(state.control * 11) / 11) * 1.84;
			marker.position.y = 1.33;
		}
	};
}

function wardScene(): SceneEntry {
	const group = new THREE.Group();
	line(
		group,
		[
			[-5.3, -2.95],
			[5.3, -2.95],
			[5.3, 2.95],
			[-5.3, 2.95],
			[-5.3, -2.95]
		],
		IVORY,
		0.4
	);
	line(
		group,
		[
			[-5.3, -0.7],
			[-4.75, -0.7]
		],
		IVORY,
		0.5
	);
	const gauges: THREE.Mesh[] = [];
	const beds: THREE.Group[] = [];
	const path: Point[] = [
		[-5.1, 0, 0.5],
		[5.1, 0, 0.5]
	];
	tube(group, path, 0.045, CYAN, 0.8);
	const flow = packets(group, path, 18, 0.047);
	for (let index = 0; index < 12; index++) {
		const x = -4.4 + (index % 6) * 1.76;
		const y = index < 6 ? 1.65 : -1.65;
		const cell = bed(group, x, y, 0.7);
		if (index >= 6) cell.rotation.z = Math.PI;
		beds.push(cell);
		line(
			group,
			[
				[x, 0, 0.3],
				[x, y > 0 ? 0.8 : -0.8, 0.3]
			],
			CYAN,
			0.5
		);
		const gauge = box(group, [x + 0.53, y, 0.25], [0.09, 0.8, 0.08], CYAN);
		gauges.push(gauge);
		line(
			group,
			[
				[x + 0.68, y - 0.4],
				[x + 0.68, y + 0.4]
			],
			IVORY,
			0.2
		);
	}
	return {
		group,
		step: (state) => {
			movePackets(flow, state.time, 0.035);
			gauges.forEach((gauge, index) => {
				const ward = Math.min(2, Math.floor(state.selected / 12));
				gauge.scale.y = clamp((state.model.bedDemands[ward * 12 + index] ?? 0) / 20, 0.02, 1.8);
				(gauge.material as THREE.MeshStandardMaterial).color.setHex(
					index === state.selected % 12 ? AMBER : CYAN
				);
				beds[index].scale.setScalar(index === state.selected % 12 ? 0.77 : 0.7);
			});
		}
	};
}

function hospitalScene(): SceneEntry {
	const group = new THREE.Group();
	const wardPanels: THREE.Mesh[] = [];
	const sourceX = -4.8;
	cylinder(group, sourceX, 0.6, 2.1, 0.42);
	cylinder(group, sourceX + 1.0, 0.6, 2.1, 0.32);
	line(
		group,
		[
			[-5.4, -0.8],
			[-3.25, -0.8]
		],
		IVORY,
		0.45
	);
	const main: Point[] = [
		[sourceX + 0.5, 1.9],
		[sourceX + 0.5, 2.45],
		[4.8, 2.45]
	];
	tube(group, main, 0.055, CYAN, 0.85);
	const flow = packets(group, main, 18, 0.055);
	const gauges: THREE.Mesh[] = [];
	const branches: THREE.Mesh[] = [];
	for (let ward = 0; ward < 3; ward++) {
		const x = -1.8 + ward * 2.6;
		const panel = box(group, [x, 0.2, -0.1], [2.15, 3.5, 0.18], SLATE, 0.3);
		wardPanels.push(panel);
		line(
			group,
			[
				[x - 1.08, -1.55],
				[x + 1.08, -1.55],
				[x + 1.08, 1.95],
				[x - 1.08, 1.95],
				[x - 1.08, -1.55]
			],
			IVORY,
			0.35
		);
		cross(group, x, 1.43, 0.14);
		for (let index = 0; index < 12; index++) {
			bed(group, x + ((index % 3) - 1) * 0.62, 0.75 - Math.floor(index / 3) * 0.53, 0.22);
		}
		const branch: Point[] = [
			[x, 2.45, 0.4],
			[x, 1.94, 0.4]
		];
		branches.push(tube(group, branch, ward === 2 ? 0.035 : 0.065, CYAN, 0.8).mesh);
		flow.push(...packets(group, branch, 3, 0.048));
		gauges.push(box(group, [x, -2.05, 0.2], [1.9, 0.12, 0.1], CYAN));
		line(
			group,
			[
				[x - 0.95, -2.3],
				[x + 0.95, -2.3]
			],
			IVORY,
			0.25
		);
	}
	line(
		group,
		[
			[-5.35, -2.65],
			[4.8, -2.65]
		],
		IVORY,
		0.17
	);
	return {
		group,
		step: (state) => {
			movePackets(flow, state.time, 0.033);
			gauges.forEach((gauge, index) => {
				const demand = state.model.wardDemands[index] || 1;
				const ratio = clamp((state.model.wardAllocated[index] ?? 0) / demand);
				gauge.scale.x = Math.max(0.03, ratio);
				(gauge.material as THREE.MeshStandardMaterial).color.setHex(ratio < 0.99 ? AMBER : CYAN);
				(branches[index].material as THREE.MeshStandardMaterial).color.setHex(
					ratio < 0.99 ? AMBER : CYAN
				);
				(wardPanels[index].material as THREE.MeshStandardMaterial).color.setHex(
					ratio < 0.99 ? 0x625037 : SLATE
				);
			});
		}
	};
}

function cityScene(): SceneEntry {
	const group = new THREE.Group();
	const blocks = new THREE.Group();
	group.add(blocks);
	box(blocks, [0, 0, -0.4], [10.8, 6.1, 0.08], BLUE, 0.055);
	for (let street = 0; street < 7; street++) {
		const x = -4.5 + street * 1.5;
		line(
			blocks,
			[
				[x, -2.95, -0.1],
				[x, 2.95, -0.1]
			],
			IVORY,
			0.19
		);
	}
	for (let street = 0; street < 5; street++) {
		const y = -2.4 + street * 1.2;
		line(
			blocks,
			[
				[-5.3, y, -0.1],
				[5.3, y, -0.1]
			],
			IVORY,
			0.19
		);
	}
	for (let index = 0; index < 70; index++) {
		const col = index % 10;
		const row = Math.floor(index / 10);
		const x = -4.9 + col * 1.02 + Math.sin(index * 2.71) * 0.12;
		const y = -2.65 + row * 0.87 + Math.cos(index * 1.73) * 0.1;
		const nearHospital =
			(x < -1.3 && x > -3.1 && y > -0.4 && y < 1.5) ||
			(x > 0.1 && x < 1.7 && y < -0.6) ||
			(x > 2.1 && x < 4.3 && y > 0.4);
		if (nearHospital || (x < -3.2 && y < -1)) continue;
		const width = 0.32 + ((index * 7) % 6) * 0.038;
		const height = 0.15 + ((index * 11) % 7) * 0.07;
		const building = box(
			blocks,
			[x, y, height * 0.5],
			[width, 0.39, height],
			index % 4 === 0 ? 0x586b75 : SLATE,
			0.75
		);
		building.rotation.z = index % 2 ? 0.05 : -0.03;
	}
	const river: Point[] = [
		[-0.2, 3.4, -0.15],
		[-0.6, 2.3, -0.15],
		[-0.1, 1.25, -0.15],
		[-0.4, 0.3, -0.15],
		[-0.1, -0.6, -0.15],
		[-0.55, -1.7, -0.15],
		[-0.15, -3.4, -0.15]
	];
	tube(blocks, river, 0.13, BLUE, 0.25);
	const hospitals: Point[] = [
		[-2.1, 0.7],
		[0.9, -1.7],
		[3.2, 1.4]
	];
	const hospitalGroups: THREE.Group[] = [];
	for (const [x, y] of hospitals) {
		const facility = new THREE.Group();
		facility.position.set(x, y, 0.15);
		group.add(facility);
		box(facility, [0, 0, 0], [1.2, 0.85, 0.3], BLUE, 0.95);
		box(facility, [0, 0, 0.2], [0.47, 1.25, 0.25], IVORY, 0.8);
		cross(facility, 0, 0.04, 0.12, CORAL);
		ring(facility, [0, 0, 0.05], 1.05, CYAN, 0.15, 0.8);
		hospitalGroups.push(facility);
	}
	box(group, [-4.25, -1.9, 0.1], [1.3, 0.85, 0.2], IVORY, 0.65);
	cylinder(group, -4.6, -1.2, 0.82, 0.2);
	cylinder(group, -4.05, -1.2, 0.82, 0.2);
	const routes: Point[][] = [
		[
			[-4.25, -1.5, 0.45],
			[-3, -1.1, 0.45],
			[-3, 0.7, 0.45],
			[-2.1, 0.7, 0.45]
		],
		[
			[-4.25, -2.25, 0.45],
			[-3, -2.5, 0.45],
			[0.9, -2.5, 0.45],
			[0.9, -1.7, 0.45]
		],
		[
			[-4.25, -1.5, 0.45],
			[-3, -0.1, 0.45],
			[1.5, -0.1, 0.45],
			[3.2, 0.2, 0.45],
			[3.2, 1.4, 0.45]
		]
	];
	const flow: Packet[] = [];
	routes.forEach((route, index) => {
		tube(group, route, 0.028, CYAN, 0.55);
		flow.push(...packets(group, route, 7, 0.052, index * 0.11));
	});
	line(
		group,
		[
			[4.9, -2.5],
			[4.9, -1.6]
		],
		IVORY,
		0.5
	);
	line(
		group,
		[
			[4.7, -1.85],
			[4.9, -1.6],
			[5.1, -1.85]
		],
		IVORY,
		0.5
	);
	return {
		group,
		step: (state) => {
			movePackets(
				flow,
				state.time,
				0.018 + clamp(state.model.citySupply / Math.max(state.model.cityDemand, 1)) * 0.025
			);
			hospitalGroups.forEach((facility, index) => {
				facility.scale.setScalar(state.selected % 3 === index ? 1.07 : 1);
			});
		}
	};
}

const builders = [
	ionScene,
	moleculeScene,
	membraneScene,
	cellScene,
	tissueScene,
	organScene,
	personScene,
	bedScene,
	wardScene,
	hospitalScene,
	cityScene
];

function disposeGroup(group: THREE.Group) {
	const geometries = new Set<THREE.BufferGeometry>();
	const materials = new Set<THREE.Material>();
	group.traverse((object) => {
		if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
			geometries.add(object.geometry);
			for (const item of Array.isArray(object.material) ? object.material : [object.material])
				materials.add(item);
		}
	});
	geometries.forEach((geometry) => geometry.dispose());
	materials.forEach((item) => item.dispose());
	group.removeFromParent();
}

function fade(group: THREE.Group, amount: number) {
	group.traverse((object) => {
		if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
		for (const item of Array.isArray(object.material) ? object.material : [object.material]) {
			item.opacity = (item.userData.baseOpacity ?? 1) * amount;
			item.depthWrite = amount > 0.94 && (item.userData.baseOpacity ?? 1) > 0.85;
		}
	});
}

export function createElevatorRenderer(
	canvas: HTMLCanvasElement,
	onError: (message: string) => void
): ElevatorRenderer {
	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: false,
		powerPreference: 'low-power'
	});
	renderer.setClearColor(INK, 1);
	renderer.setPixelRatio(
		Math.min(
			window.devicePixelRatio || 1,
			window.matchMedia('(max-width: 640px)').matches ? 1 : 1.5
		)
	);
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	const scene = new THREE.Scene();
	scene.add(new THREE.AmbientLight(0xdceaf2, 2));
	const light = new THREE.DirectionalLight(0xfff0d5, 2.2);
	light.position.set(-4, 7, 12);
	scene.add(light);
	const fill = new THREE.DirectionalLight(0x80c8df, 0.9);
	fill.position.set(5, -4, 8);
	scene.add(fill);
	const camera = new THREE.OrthographicCamera(-6.2, 6.2, 3.8, -3.8, 0.1, 100);
	camera.position.set(0, 0, 25);
	const cache = new Map<number, SceneEntry>();
	let lastState: RenderState | undefined;
	let disposed = false;
	let lost = false;

	function entry(index: number) {
		let current = cache.get(index);
		if (!current) {
			current = builders[index]();
			cache.set(index, current);
			scene.add(current.group);
		}
		return current;
	}

	function update(state: RenderState) {
		if (disposed || lost) return;
		lastState = state;
		const progress = clamp(Number.isFinite(state.progress) ? state.progress : 0, 0, 10);
		const lower = Math.floor(progress);
		const upper = Math.min(lower + 1, 10);
		const t = smooth(progress - lower);
		const active = new Set([lower, upper]);
		const prefetch = t > 0.5 ? upper + 1 : lower - 1;
		if (prefetch >= 0 && prefetch <= 10) active.add(prefetch);
		for (const [index, cached] of cache) {
			if (!active.has(index)) {
				disposeGroup(cached.group);
				cache.delete(index);
			}
		}
		for (const index of active) {
			const current = entry(index);
			const isLower = index === lower;
			const isUpper = index === upper && lower !== upper;
			current.group.visible = isLower || isUpper;
			if (!current.group.visible) continue;
			current.step(state);
			// Outgoing detail contracts into the incoming context; never convert units here.
			const scale = isLower ? Math.exp(-t * 1.1) : Math.exp((1 - t) * 0.7);
			current.group.scale.setScalar(lower === upper ? 1 : scale);
			current.group.position.set(
				isLower ? -t * 0.55 : (1 - t) * 0.65,
				isLower ? t * 0.3 : -(1 - t) * 0.25,
				isLower ? 0.4 : -0.4
			);
			fade(
				current.group,
				lower === upper
					? 1
					: isLower
						? 1 - smooth(clamp(t * 1.65 - 0.15))
						: smooth(clamp(t * 1.65 - 0.25))
			);
		}
		renderer.render(scene, camera);
	}

	function resize() {
		if (disposed || lost) return;
		const width = Math.max(canvas.clientWidth, 1);
		const height = Math.max(canvas.clientHeight, 1);
		const aspect = width / height;
		const halfWidth = Math.max(6.2, 3.8 * aspect);
		const halfHeight = Math.max(3.8, 6.2 / aspect);
		camera.left = -halfWidth;
		camera.right = halfWidth;
		camera.top = halfHeight;
		camera.bottom = -halfHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(width, height, false);
		if (lastState) update(lastState);
	}

	const observer = new ResizeObserver(resize);
	observer.observe(canvas);
	const contextLost = (event: Event) => {
		event.preventDefault();
		lost = true;
		onError(
			'The graphics context was interrupted. The scale ledger and scientific readings remain available.'
		);
	};
	canvas.addEventListener('webglcontextlost', contextLost);
	resize();
	return {
		update,
		dispose() {
			if (disposed) return;
			disposed = true;
			observer.disconnect();
			canvas.removeEventListener('webglcontextlost', contextLost);
			for (const current of cache.values()) disposeGroup(current.group);
			cache.clear();
			renderer.renderLists.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
		}
	};
}
