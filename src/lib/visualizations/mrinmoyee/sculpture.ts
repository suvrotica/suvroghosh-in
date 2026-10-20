import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AtelierDesign, Vec3 } from './types';

/** A composed ten-arm interpretation, rather than a claim of a universal ritual arrangement. */
export const ARM_LAYOUT = [
	{ side: -1, attribute: 'discus', elbow: [-0.91, 5.36, -0.08], hand: [-1.23, 6.02, 0.18] },
	{ side: -1, attribute: 'conch', elbow: [-1.24, 4.98, -0.18], hand: [-1.94, 5.52, 0.26] },
	{ side: -1, attribute: 'bow', elbow: [-1.49, 4.55, -0.24], hand: [-2.44, 4.76, 0.34] },
	{ side: -1, attribute: 'shield', elbow: [-1.45, 3.97, -0.17], hand: [-2.31, 3.83, 0.42] },
	{ side: -1, attribute: 'lotus', elbow: [-1.03, 3.47, 0.01], hand: [-1.72, 3.12, 0.64] },
	{ side: 1, attribute: 'trident', elbow: [0.92, 5.37, -0.12], hand: [1.28, 6.03, 0.17] },
	{ side: 1, attribute: 'sword', elbow: [1.26, 4.99, -0.13], hand: [1.96, 5.53, 0.3] },
	{ side: 1, attribute: 'arrow', elbow: [1.49, 4.54, -0.21], hand: [2.42, 4.77, 0.39] },
	{ side: 1, attribute: 'axe', elbow: [1.43, 3.96, -0.13], hand: [2.28, 3.86, 0.44] },
	{ side: 1, attribute: 'mace', elbow: [1.0, 3.46, 0.03], hand: [1.73, 3.12, 0.65] }
] as const;

type Material = THREE.MeshStandardMaterial;
type Region = 'face' | 'crown' | 'dress' | 'ornament' | 'lion';
type Ring = [y: number, xRadius: number, zRadius: number, xOffset?: number, zOffset?: number];
const TAU = Math.PI * 2;
const v = (p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]);

/** Browser-safe until called. The renderer owns all resulting geometries and material disposal. */
export function buildSculpture(
	design: AtelierDesign,
	quality: 'high' | 'low' = 'high'
): THREE.Group {
	const root = new THREE.Group();
	root.name = 'Mrinmoyee sculptural assembly';
	root.userData.armCount = 10;
	root.userData.armLayout = ARM_LAYOUT.map((arm) => ({ ...arm }));
	const high = quality === 'high';
	const segments = high ? 48 : 28;
	const stage = Math.max(0, Math.min(5, Math.round(design.stage)));
	const earthen = stage < 2 || design.material === 'clay' || design.material === 'terracotta';
	const metal = design.material === 'bronze' || design.material === 'brass';
	const stone = design.material === 'stone';
	const natural = earthen || metal || stone;
	const clayColour = design.material === 'terracotta' ? '#a45133' : '#a68b72';
	const matter =
		stage < 2
			? clayColour
			: design.material === 'bronze'
				? '#77603a'
				: design.material === 'brass'
					? '#c29a4c'
					: stone
						? '#d4cec1'
						: earthen
							? clayColour
							: design.skinColor;
	const material = (colour: string, roughness = 0.65, metalness = 0): Material =>
		new THREE.MeshStandardMaterial({ color: colour, roughness, metalness });
	const body = material(matter, metal ? 0.38 : stone ? 0.72 : 0.79, metal ? 0.82 : 0);
	const bodyShadow = material(
		new THREE.Color(matter).multiplyScalar(0.71).getStyle(),
		metal ? 0.43 : 0.87,
		metal ? 0.76 : 0
	);
	const grain = surfaceGrain(design.seed);
	body.bumpMap = grain;
	body.bumpScale = earthen ? 0.012 : stone ? 0.009 : metal ? 0.004 : 0.0025;
	bodyShadow.bumpMap = grain;
	bodyShadow.bumpScale = body.bumpScale;
	const gold = natural ? body : material(design.borderColor, 0.31, 0.78);
	const goldDark = natural
		? bodyShadow
		: material(new THREE.Color(design.borderColor).multiplyScalar(0.58).getStyle(), 0.48, 0.75);
	const ivory = natural
		? body
		: material(
				design.crown === 'silver' ? '#e4e5e2' : design.crown === 'gold' ? '#e3bb62' : '#fff4d3',
				design.crown === 'shola' ? 0.76 : 0.3,
				design.crown === 'shola' ? 0.02 : 0.72
			);
	const jewel = natural ? bodyShadow : material('#a01d30', 0.23, 0.48);
	const hairMat = natural ? bodyShadow : material('#161014', 0.82);
	const sariMat = natural ? body : material(design.sariColor, 0.85, 0.02);
	const sariShadow = natural
		? bodyShadow
		: material(new THREE.Color(design.sariColor).multiplyScalar(0.64).getStyle(), 0.93);
	const blouse = natural ? body : material(design.blouseColor, 0.8);
	const black = natural ? bodyShadow : material('#211218', 0.78);
	const eyeWhite = natural ? body : material('#fff5dd', 0.45);
	const eyeIris = natural ? bodyShadow : material('#4b251b', 0.37);
	const red = natural ? bodyShadow : material('#aa1f26', 0.66);
	const green = natural ? bodyShadow : material('#4c6240', 0.85);
	const flowers = natural
		? body
		: material(
				design.garland === 'jasmine'
					? '#fff1cf'
					: design.garland === 'hibiscus'
						? '#bc213e'
						: '#ef9b18',
				0.88
			);
	const flowerShade = natural
		? bodyShadow
		: material(
				design.garland === 'jasmine'
					? '#e6d99c'
					: design.garland === 'hibiscus'
						? '#76162e'
						: '#d15d0c',
				0.9
			);
	const sphereGeometry = new THREE.SphereGeometry(1, high ? 24 : 16, high ? 18 : 12);
	const detailSphereGeometry = new THREE.SphereGeometry(1, high ? 12 : 8, high ? 8 : 6);
	const add = (
		parent: THREE.Object3D,
		geometry: THREE.BufferGeometry,
		mat: Material,
		region: Region,
		name?: string
	) => {
		const mesh = new THREE.Mesh(geometry, mat);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.userData.region = region;
		if (name) mesh.name = name;
		parent.add(mesh);
		return mesh;
	};
	const ellipsoid = (
		parent: THREE.Object3D,
		at: Vec3,
		scale: Vec3,
		mat: Material,
		region: Region = 'ornament'
	) => {
		const mesh = add(
			parent,
			Math.max(...scale) <= 0.16 ? detailSphereGeometry : sphereGeometry,
			mat,
			region
		);
		mesh.position.set(...at);
		mesh.scale.set(...scale);
		return mesh;
	};
	const tube = (
		parent: THREE.Object3D,
		points: Vec3[],
		radius: number,
		mat: Material,
		region: Region = 'ornament',
		resolution = 24
	) =>
		add(
			parent,
			new THREE.TubeGeometry(
				new THREE.CatmullRomCurve3(points.map(v)),
				high ? resolution : Math.max(8, Math.round(resolution * 0.6)),
				radius,
				high ? 9 : 6,
				false
			),
			mat,
			region
		);
	const line = (
		parent: THREE.Object3D,
		a: Vec3,
		b: Vec3,
		radius: number,
		mat: Material,
		region: Region = 'ornament'
	) => tube(parent, [a, b], radius, mat, region, 3);
	const ring = (
		parent: THREE.Object3D,
		at: Vec3,
		radius: number,
		thickness: number,
		mat: Material,
		region: Region = 'ornament',
		scale?: Vec3
	) => {
		const mesh = add(
			parent,
			new THREE.TorusGeometry(radius, thickness, high ? 8 : 5, segments),
			mat,
			region
		);
		mesh.position.set(...at);
		if (scale) mesh.scale.set(...scale);
		return mesh;
	};
	const loft = (rings: Ring[], pleats = 0, pleatDepth = 0): THREE.BufferGeometry => {
		const positions: number[] = [],
			uv: number[] = [],
			indices: number[] = [];
		rings.forEach(([y, xr, zr, cx = 0, cz = 0], j) => {
			for (let i = 0; i <= segments; i++) {
				const angle = (i / segments) * TAU;
				const ripple = pleats
					? 1 + Math.cos(angle * pleats + j * 0.13) * pleatDepth * (1 - (j / rings.length) * 0.3)
					: 1;
				positions.push(cx + Math.sin(angle) * xr * ripple, y, cz + Math.cos(angle) * zr * ripple);
				uv.push(i / segments, j / (rings.length - 1));
				if (j > 0 && i > 0) {
					const k = j * (segments + 1) + i;
					indices.push(k, k - 1, k - segments - 2, k, k - segments - 2, k - segments - 1);
				}
			}
		});
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
		geometry.setIndex(indices);
		geometry.computeVertexNormals();
		return geometry;
	};
	const leaf = (
		parent: THREE.Object3D,
		at: Vec3,
		width: number,
		length: number,
		angle: number,
		mat: Material,
		region: Region = 'crown',
		depth = 0.055
	) => {
		const shape = new THREE.Shape();
		shape.moveTo(0, 0);
		shape.bezierCurveTo(-width, length * 0.35, -width * 0.52, length * 0.82, 0, length);
		shape.bezierCurveTo(width * 0.52, length * 0.82, width, length * 0.35, 0, 0);
		const geometry = new THREE.ExtrudeGeometry(shape, {
			depth,
			bevelEnabled: true,
			bevelSegments: 2,
			steps: 1,
			bevelSize: 0.018,
			bevelThickness: 0.015,
			curveSegments: high ? 12 : 6
		});
		const mesh = add(parent, geometry, mat, region);
		mesh.position.set(...at);
		mesh.rotation.z = angle;
		return mesh;
	};
	const floral = (
		parent: THREE.Object3D,
		at: Vec3,
		size: number,
		mat = flowers,
		region: Region = 'ornament',
		petals = 8
	) => {
		ellipsoid(parent, at, [size * 0.62, size * 0.64, size * 0.58], flowerShade, region);
		for (let i = 0; i < petals; i++) {
			const a = (i / petals) * TAU;
			const p = ellipsoid(
				parent,
				[at[0] + Math.cos(a) * size * 0.5, at[1] + Math.sin(a) * size * 0.5, at[2] + size * 0.19],
				[size * 0.48, size * 0.31, size * 0.5],
				mat,
				region
			);
			p.rotation.z = a;
		}
	};
	const beadChain = (
		parent: THREE.Object3D,
		points: Vec3[],
		count: number,
		radius: number,
		mat: Material,
		region: Region = 'ornament'
	) => {
		const curve = new THREE.CatmullRomCurve3(points.map(v));
		for (let i = 0; i < count; i++) {
			const p = curve.getPoint(i / (count - 1));
			ellipsoid(parent, [p.x, p.y, p.z], [radius, radius, radius], mat, region);
		}
	};

	// The raised lotus platform is shared by every construction stage.
	const pedestal = new THREE.Group();
	root.add(pedestal);
	const pedestalMat = material(natural ? matter : '#3c3131', 0.82, metal ? 0.65 : 0.13);
	const pedestalGeometry = new THREE.CylinderGeometry(2.65, 2.8, 0.22, segments);
	const base = add(pedestal, pedestalGeometry, pedestalMat, 'ornament');
	base.position.y = 0.13;
	base.scale.z = 0.7;
	for (let j = 0; j < 3; j++) {
		const platform = add(
			pedestal,
			new THREE.CylinderGeometry(2.38 - j * 0.14, 2.52 - j * 0.13, 0.12, segments),
			j === 1 ? goldDark : pedestalMat,
			'ornament'
		);
		platform.position.y = 0.3 + j * 0.11;
		platform.scale.z = 0.68;
	}
	for (let i = 0; i < 30; i++) {
		const a = (i / 30) * TAU;
		const petal = ellipsoid(
			pedestal,
			[Math.sin(a) * 2.24, 0.46, Math.cos(a) * 1.43],
			[0.21, 0.19, 0.12],
			stage < 4 ? body : goldDark
		);
		petal.rotation.y = a;
	}
	const shapeGroup = new THREE.Group();
	root.add(shapeGroup);
	const hipX = -0.12;
	if (stage === 0) {
		const framework = material('#69503b', 0.9);
		for (const x of [-0.48, 0.48])
			line(shapeGroup, [x, 0.52, 0], [x * 0.65, 4.75, 0], 0.045, framework);
		line(shapeGroup, [0, 3.4, 0], [0, 6.12, 0], 0.07, framework);
		for (let y = 0.8; y < 4.8; y += 0.47) {
			const r = y < 2.9 ? 0.78 - y * 0.06 : y < 4.1 ? 0.45 : 0.57;
			const hoop = ring(shapeGroup, [0, y, 0], r, 0.025, framework);
			hoop.rotation.x = Math.PI / 2;
			hoop.scale.y = 0.62;
		}
		ellipsoid(shapeGroup, [0, 5.65, 0], [0.46, 0.66, 0.34], framework, 'face');
		for (const arm of ARM_LAYOUT)
			tube(
				shapeGroup,
				[[arm.side * 0.44, 4.7, -0.13], [...arm.elbow], [...arm.hand]],
				0.04,
				framework,
				'ornament'
			);
		return consolidate(root);
	}

	// Lofted anatomy keeps continuous contours through the waist, ribcage and neck.
	add(
		shapeGroup,
		loft([
			[2.8, 0.47, 0.3, hipX],
			[3.1, 0.59, 0.35, hipX],
			[3.46, 0.44, 0.29, -0.06],
			[3.78, 0.38, 0.27, 0.02],
			[4.09, 0.47, 0.32, 0.04],
			[4.4, 0.58, 0.34, 0.02],
			[4.65, 0.62, 0.27],
			[4.83, 0.41, 0.24],
			[4.98, 0.2, 0.19],
			[5.22, 0.185, 0.18]
		]),
		body,
		'face'
	);
	for (const side of [-1, 1]) {
		const leg = ellipsoid(
			shapeGroup,
			[side * 0.26 - 0.1, 1.92, 0],
			[0.27, 1.45, 0.28],
			body,
			'face'
		);
		leg.rotation.z = side * 0.085;
		const foot = ellipsoid(
			shapeGroup,
			[side * 0.34 - 0.1, 0.62, 0.31],
			[0.23, 0.14, 0.43],
			body,
			'face'
		);
		foot.rotation.y = side * 0.13;
		if (stage >= 2 && !natural) {
			ellipsoid(shapeGroup, [side * 0.34 - 0.1, 0.595, 0.55], [0.22, 0.075, 0.15], red, 'ornament');
			for (let toe = 0; toe < 5; toe++)
				ellipsoid(
					shapeGroup,
					[side * 0.34 - 0.25 + toe * 0.075, 0.64, 0.62 + Math.sin((toe / 5) * Math.PI) * 0.08],
					[0.042, 0.044, 0.09],
					body,
					'face'
				);
		}
	}

	// Hair is a complete back volume, with combed wave ridges, rather than a flat portrait.
	const head = new THREE.Group();
	head.position.set(0, 5.65, 0.035);
	head.rotation.z = THREE.MathUtils.degToRad(design.headTilt);
	head.scale.x = design.faceWidth;
	shapeGroup.add(head);
	const faceMat = body;
	const hairBack = ellipsoid(
		head,
		[0, -0.02, -0.19],
		[0.53, 0.79, 0.37],
		stage >= 2 ? hairMat : bodyShadow,
		'face'
	);
	hairBack.scale.y *= 1.03;
	for (let side = -1; side <= 1; side += 2) {
		for (let i = 0; i < 7; i++) {
			const x = side * (0.4 + i * 0.035);
			tube(
				head,
				[
					[side * 0.12, 0.65, -0.12],
					[side * 0.49, 0.28, -0.03],
					[x + side * 0.03, -0.34, -0.08],
					[x + side * 0.1, -0.95, -0.14],
					[x + side * 0.03, -1.5, -0.23]
				],
				0.045 + i * 0.005,
				stage >= 2 ? hairMat : bodyShadow,
				'face'
			);
		}
	}
	// A sculpted oval mesh: cheeks, brow ridge, muzzle and chin are part of the surface.
	const headGeometry = new THREE.SphereGeometry(1, high ? 72 : 40, high ? 56 : 32);
	const hp = headGeometry.attributes.position;
	for (let i = 0; i < hp.count; i++) {
		const x = hp.getX(i),
			y = hp.getY(i),
			z = hp.getZ(i);
		const jaw = 0.79 + (0.21 * (y + 1)) / 2;
		const fx = x * 0.47 * jaw;
		const fy = y * 0.65;
		let fz = z * 0.36;
		if (z > 0) {
			const cheek =
				Math.exp(-((Math.abs(fx) - 0.24) ** 2 / 0.022 + (fy + 0.08) ** 2 / 0.055)) * 0.065;
			const brow =
				Math.exp(-((Math.abs(fx) - 0.18) ** 2 / 0.035 + (fy - 0.19) ** 2 / 0.007)) * 0.027;
			const muzzle = Math.exp(-((fx * fx) / 0.03 + (fy + 0.31) ** 2 / 0.025)) * 0.037;
			fz += (cheek + brow + muzzle) * Math.min(1, z * 3);
		}
		hp.setXYZ(i, fx, fy, fz);
	}
	headGeometry.computeVertexNormals();
	add(head, headGeometry, faceMat, 'face', 'continuous sculpted face');
	// The nose is a tapered, blended bridge and a softly modelled tip.
	const nosePoints: Ring[] = [
		[-0.18, 0.052, 0.065, 0, 0.407],
		[-0.13, 0.065, 0.073, 0, 0.415],
		[-0.06, 0.047, 0.064, 0, 0.413],
		[0.06, 0.031, 0.045, 0, 0.38],
		[0.22, 0.017, 0.019, 0, 0.346]
	];
	add(head, loft(nosePoints), body, 'face');
	ellipsoid(head, [0, -0.13, 0.466], [0.048, 0.041, 0.047], body, 'face');
	for (const side of [-1, 1]) {
		ellipsoid(head, [side * 0.055, -0.16, 0.42], [0.037, 0.024, 0.044], body, 'face');
		if (!natural && stage >= 2)
			ellipsoid(head, [side * 0.048, -0.181, 0.446], [0.019, 0.007, 0.008], bodyShadow, 'face');
	}
	const expression = design.face === 'resolute' ? 0.018 : design.face === 'gentle' ? -0.012 : 0;
	const eye = (side: number) => {
		const g = new THREE.Group();
		g.position.set(side * 0.206, 0.054, 0.375);
		g.rotation.y = side * 0.36;
		g.rotation.z = side * (0.1 + expression * 4);
		g.scale.set(design.eyeScale, design.eyeScale, 1);
		head.add(g);
		const width = 0.164,
			h = 0.063;
		const almond = new THREE.Shape();
		almond.moveTo(-width, 0);
		almond.bezierCurveTo(-width * 0.5, h * 1.4, width * 0.5, h * 1.3, width, 0);
		almond.bezierCurveTo(width * 0.5, -h * 0.85, -width * 0.6, -h * 0.85, -width, 0);
		add(g, new THREE.ShapeGeometry(almond, high ? 28 : 16), eyeWhite, 'face');
		ellipsoid(g, [side * -0.018, 0.006, 0.008], [0.049, 0.053, 0.008], eyeIris, 'face');
		ellipsoid(g, [side * -0.018, 0.009, 0.018], [0.025, 0.038, 0.004], black, 'face');
		if (!natural)
			ellipsoid(g, [side * -0.027, 0.031, 0.024], [0.009, 0.01, 0.002], eyeWhite, 'face');
		tube(
			g,
			[
				[-width, 0, 0.011],
				[-width * 0.5, h * 0.91, 0.015],
				[width * 0.45, h, 0.015],
				[width, 0, 0.011]
			],
			0.012,
			black,
			'face',
			28
		);
		tube(
			g,
			[
				[-width, 0, 0.011],
				[-width * 0.45, -h * 0.55, 0.012],
				[width * 0.5, -h * 0.53, 0.012],
				[width, 0, 0.011]
			],
			0.006,
			black,
			'face',
			28
		);
		const corner = side > 0 ? width : -width;
		tube(
			g,
			[
				[corner * 0.7, h * 0.5, 0.012],
				[corner * 1.02, 0.004, 0.011],
				[corner * 1.25, 0.027, 0.003]
			],
			0.009,
			black,
			'face',
			10
		);
		// Conform the painted almond to the curved cheek; flat decals sink into an oval face.
		g.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			object.updateMatrix();
			const geometry = object.geometry.clone();
			geometry.applyMatrix4(object.matrix);
			const positions = geometry.attributes.position;
			for (let i = 0; i < positions.count; i++)
				positions.setZ(i, positions.getZ(i) - 2 * positions.getX(i) ** 2);
			geometry.computeVertexNormals();
			object.geometry = geometry;
			object.position.set(0, 0, 0);
			object.rotation.set(0, 0, 0);
			object.scale.set(1, 1, 1);
		});
		tube(
			head,
			[
				[side * 0.054, 0.219 + expression, 0.36],
				[side * 0.178, 0.267, 0.353],
				[side * 0.338, 0.225 - expression, 0.255]
			],
			0.016,
			stage >= 2 ? black : bodyShadow,
			'face',
			30
		);
	};
	eye(-1);
	eye(1);
	// A separate upright third eye, painted fine rather than oversized ornament.
	const thirdEye = new THREE.Group();
	thirdEye.position.set(0, 0.345, 0.322);
	head.add(thirdEye);
	leaf(thirdEye, [0, -0.073, 0], 0.041, 0.145, 0, eyeWhite, 'face', 0.008);
	ellipsoid(thirdEye, [0, 0, 0.025], [0.017, 0.029, 0.012], black, 'face');
	tube(
		thirdEye,
		[
			[0, -0.074, 0.025],
			[-0.033, -0.014, 0.028],
			[0, 0.075, 0.021],
			[0.033, -0.014, 0.028],
			[0, -0.074, 0.025]
		],
		0.005,
		black,
		'face',
		30
	);
	if (stage >= 2) {
		ellipsoid(head, [0, 0.185, 0.372], [0.026, 0.035, 0.012], red, 'face');
		// Two bow-shaped lip ridges and a fine mouth opening carry the expression.
		const smile = design.face === 'gentle' ? 0.018 : design.face === 'resolute' ? -0.004 : 0.006;
		tube(
			head,
			[
				[-0.115, -0.326 + smile, 0.343],
				[-0.052, -0.311, 0.391],
				[0, -0.324, 0.405],
				[0.049, -0.31, 0.392],
				[0.115, -0.326 + smile, 0.343]
			],
			0.017,
			red,
			'face',
			32
		);
		tube(
			head,
			[
				[-0.106, -0.333 + smile, 0.35],
				[0, -0.354, 0.403],
				[0.106, -0.333 + smile, 0.35]
			],
			0.02,
			red,
			'face',
			24
		);
		tube(
			head,
			[
				[-0.105, -0.328 + smile, 0.365],
				[0, -0.332, 0.419],
				[0.105, -0.328 + smile, 0.365]
			],
			0.004,
			bodyShadow,
			'face'
		);
	}
	for (const side of [-1, 1]) {
		ellipsoid(head, [side * 0.453, -0.055, 0.002], [0.09, 0.15, 0.065], body, 'face');
		if (stage >= 4) {
			ring(head, [side * 0.475, -0.2, 0.092], 0.12, 0.024, gold, 'ornament', [0.75, 1.3, 1]);
			ellipsoid(head, [side * 0.475, -0.394, 0.1], [0.072, 0.101, 0.041], gold);
			ellipsoid(head, [side * 0.475, -0.405, 0.142], [0.033, 0.044, 0.02], jewel);
			for (let j = 0; j < 7; j++) {
				const a = (j / 6) * Math.PI;
				ellipsoid(
					head,
					[side * 0.475 + Math.cos(a) * 0.067, -0.445 - Math.sin(a) * 0.05, 0.12],
					[0.018, 0.022, 0.018],
					ivory
				);
			}
		}
	}
	if (stage >= 4) {
		const nath = ring(head, [-0.12, -0.19, 0.466], 0.094, 0.008, gold, 'ornament', [0.9, 1, 1]);
		nath.rotation.y = -0.25;
		beadChain(
			head,
			[
				[-0.17, -0.12, 0.46],
				[-0.28, -0.06, 0.4],
				[-0.45, -0.12, 0.1]
			],
			16,
			0.009,
			gold
		);
	}

	// Ten independently continuous shoulder–elbow–wrist chains, each with its own grip socket.
	for (const [index, arm] of ARM_LAYOUT.entries()) {
		const open = design.pose === 'open' ? 1.075 : 1;
		const shoulder = new THREE.Vector3(
			arm.side * 0.49,
			4.64 - (index % 5) * 0.055,
			-0.11 - (index % 5) * 0.04
		);
		const elbow = v(arm.elbow);
		elbow.x *= open;
		const hand = v(arm.hand);
		hand.x *= open;
		const path = new THREE.CatmullRomCurve3([
			shoulder,
			shoulder
				.clone()
				.lerp(elbow, 0.45)
				.add(new THREE.Vector3(0, 0.04, -0.025)),
			elbow,
			elbow.clone().lerp(hand, 0.68),
			hand
		]);
		const armGeometry = taperedTube(
			path,
			high ? 36 : 22,
			high ? 12 : 8,
			(t) => 0.147 * (1 - t * 0.48) + Math.sin(t * Math.PI) * 0.025
		);
		add(shapeGroup, armGeometry, body, 'face', `${arm.attribute} arm`);
		if (stage >= 3) {
			const sleeveEnd = path.getPoint(0.19);
			add(
				shapeGroup,
				taperedTube(
					new THREE.CatmullRomCurve3([shoulder, path.getPoint(0.1), sleeveEnd]),
					10,
					12,
					(t) => 0.17 - t * 0.015
				),
				blouse,
				'dress'
			);
		}
		const handGroup = new THREE.Group();
		handGroup.name = `${arm.attribute} grip`;
		handGroup.position.copy(hand);
		handGroup.userData.attribute = arm.attribute;
		shapeGroup.add(handGroup);
		ellipsoid(handGroup, [0, 0.042, 0], [0.102, 0.145, 0.066], body, 'face');
		for (let digit = 0; digit < 4; digit++) {
			const y = 0.005 + digit * 0.045;
			tube(
				handGroup,
				[
					[arm.side * -0.07, y - 0.014, 0.017],
					[arm.side * -0.015, y + 0.006, 0.094],
					[arm.side * 0.08, y + 0.008, 0.08],
					[arm.side * 0.088, y - 0.015, 0.015]
				],
				0.023,
				body,
				'face',
				12
			);
		}
		tube(
			handGroup,
			[
				[arm.side * 0.087, 0.07, -0.013],
				[arm.side * 0.116, 0.14, 0.067],
				[arm.side * 0.035, 0.16, 0.104]
			],
			0.029,
			body,
			'face',
			12
		);
		if (stage >= 4) {
			for (let j = 0; j < 3; j++) {
				const p = path.getPoint(0.85 + j * 0.025);
				const band = ring(
					shapeGroup,
					[p.x, p.y, p.z],
					0.102,
					j === 1 ? 0.026 : 0.013,
					j === 1 ? gold : red
				);
				band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), path.getTangent(0.88));
			}
			const armletPoint = path.getPoint(0.28);
			const armlet = ring(
				shapeGroup,
				[armletPoint.x, armletPoint.y, armletPoint.z],
				0.147,
				0.024,
				gold
			);
			armlet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), path.getTangent(0.28));
			buildAttribute(handGroup, arm.attribute);
		}
	}

	function buildAttribute(parent: THREE.Group, attribute: string) {
		const socketZ = 0.036;
		const shaft = (bottom: number, top: number, radius = 0.024) =>
			line(parent, [0, bottom, socketZ], [0, top, socketZ], radius, goldDark);
		if (attribute === 'trident') {
			shaft(-1.2, 0.91, 0.027);
			tube(
				parent,
				[
					[-0.22, 1.05, socketZ],
					[-0.23, 0.77, socketZ],
					[0, 0.66, socketZ],
					[0.23, 0.77, socketZ],
					[0.22, 1.05, socketZ]
				],
				0.028,
				gold
			);
			for (const x of [-0.22, 0, 0.22])
				leaf(
					parent,
					[x, x === 0 ? 0.9 : 1.0, socketZ - 0.022],
					0.047,
					x === 0 ? 0.33 : 0.22,
					0,
					gold,
					'ornament',
					0.04
				);
			ring(parent, [0, 0.59, socketZ], 0.07, 0.018, gold);
		} else if (attribute === 'sword') {
			shaft(-0.15, 0.25, 0.04);
			const blade = new THREE.Shape();
			blade.moveTo(-0.065, 0.21);
			blade.lineTo(-0.07, 0.95);
			blade.quadraticCurveTo(-0.025, 1.18, 0.15, 1.32);
			blade.quadraticCurveTo(0.1, 1.12, 0.095, 0.94);
			blade.lineTo(0.075, 0.21);
			blade.closePath();
			const mesh = add(
				parent,
				new THREE.ExtrudeGeometry(blade, {
					depth: 0.03,
					bevelEnabled: true,
					bevelSize: 0.012,
					bevelThickness: 0.01,
					bevelSegments: 2,
					steps: 1
				}),
				ivory,
				'ornament'
			);
			mesh.position.z = 0.013;
			ellipsoid(parent, [0, 0.22, socketZ], [0.2, 0.04, 0.055], gold);
			ellipsoid(parent, [0, -0.17, socketZ], [0.07, 0.065, 0.06], gold);
		} else if (attribute === 'discus') {
			shaft(0, 0.26, 0.018);
			ring(parent, [0, 0.43, socketZ], 0.23, 0.039, gold);
			ring(parent, [0, 0.43, socketZ], 0.15, 0.014, ivory);
			for (let i = 0; i < 16; i++) {
				const a = (i / 16) * TAU;
				leaf(
					parent,
					[Math.sin(a) * 0.21, 0.43 + Math.cos(a) * 0.21, 0],
					0.03,
					0.09,
					-a,
					gold,
					'ornament',
					0.03
				);
			}
		} else if (attribute === 'conch') {
			const conch = new THREE.Group();
			conch.position.set(0, 0.26, socketZ);
			conch.rotation.z = 0.4;
			parent.add(conch);
			ellipsoid(conch, [0, 0, 0], [0.14, 0.23, 0.13], ivory);
			ellipsoid(conch, [0.025, 0.18, 0], [0.075, 0.16, 0.08], ivory);
			for (let i = 0; i < 6; i++) {
				const r = 0.13 - i * 0.014;
				const shellRing = ring(conch, [0, -0.02 + i * 0.049, 0], r, 0.01, goldDark);
				shellRing.rotation.x = Math.PI / 2;
				shellRing.rotation.z = 0.15;
			}
			ring(conch, [0, -0.18, 0.055], 0.1, 0.025, ivory, 'ornament', [0.8, 1.2, 1]);
		} else if (attribute === 'bow') {
			tube(
				parent,
				[
					[-0.02, -0.74, socketZ],
					[-0.28, -0.4, socketZ],
					[-0.32, 0.1, socketZ],
					[-0.26, 0.57, socketZ],
					[-0.01, 0.89, socketZ]
				],
				0.033,
				gold
			);
			line(parent, [-0.02, -0.74, socketZ], [-0.01, 0.89, socketZ], 0.006, ivory);
			line(parent, [-0.31, 0.09, socketZ], [0.01, 0.09, socketZ], 0.025, goldDark);
		} else if (attribute === 'arrow') {
			shaft(-0.62, 0.87, 0.015);
			leaf(parent, [0, 0.79, 0.013], 0.064, 0.21, 0, ivory, 'ornament', 0.025);
			for (const side of [-1, 1])
				leaf(parent, [0, -0.58, 0.02], 0.045, 0.24, side * 0.4, gold, 'ornament', 0.02);
		} else if (attribute === 'shield') {
			const shield = ellipsoid(parent, [-0.05, 0.08, 0.14], [0.35, 0.44, 0.09], goldDark);
			shield.rotation.z = -0.15;
			const edge = ring(parent, [-0.05, 0.08, 0.165], 0.35, 0.024, gold, 'ornament', [1, 1.26, 1]);
			edge.rotation.z = -0.15;
			ellipsoid(parent, [-0.05, 0.08, 0.24], [0.11, 0.13, 0.05], gold);
			for (let i = 0; i < 8; i++) {
				const a = (i / 8) * TAU;
				ellipsoid(
					parent,
					[-0.05 + Math.sin(a) * 0.23, 0.08 + Math.cos(a) * 0.29, 0.23],
					[0.025, 0.025, 0.025],
					ivory
				);
			}
		} else if (attribute === 'axe') {
			shaft(-0.61, 0.8, 0.027);
			const blade = new THREE.Shape();
			blade.moveTo(-0.03, 0.44);
			blade.quadraticCurveTo(0.21, 0.47, 0.35, 0.33);
			blade.quadraticCurveTo(0.48, 0.59, 0.3, 0.87);
			blade.quadraticCurveTo(0.2, 0.65, -0.03, 0.72);
			blade.closePath();
			const mesh = add(
				parent,
				new THREE.ExtrudeGeometry(blade, {
					depth: 0.035,
					bevelEnabled: true,
					bevelSize: 0.012,
					bevelThickness: 0.01,
					bevelSegments: 2,
					steps: 1
				}),
				ivory,
				'ornament'
			);
			mesh.position.z = 0.018;
		} else if (attribute === 'mace') {
			shaft(-0.48, 0.65, 0.034);
			ellipsoid(parent, [0, 0.7, socketZ], [0.22, 0.28, 0.22], goldDark);
			for (let i = 0; i < 8; i++) {
				const a = (i / 8) * TAU;
				tube(
					parent,
					[
						[Math.sin(a) * 0.09, 0.47, socketZ + Math.cos(a) * 0.09],
						[Math.sin(a) * 0.22, 0.7, socketZ + Math.cos(a) * 0.22],
						[Math.sin(a) * 0.08, 0.96, socketZ + Math.cos(a) * 0.08]
					],
					0.018,
					gold
				);
			}
			ellipsoid(parent, [0, 1, socketZ], [0.055, 0.095, 0.055], gold);
		} else if (attribute === 'lotus') {
			tube(
				parent,
				[
					[0, -0.27, socketZ],
					[0.035, 0.17, socketZ],
					[-0.04, 0.47, socketZ]
				],
				0.018,
				green
			);
			for (let layer = 0; layer < 2; layer++)
				for (let i = 0; i < 8; i++) {
					const a = ((i + layer * 0.5) / 8) * TAU;
					const petal = leaf(
						parent,
						[-0.04 + Math.sin(a) * 0.05, 0.42, socketZ + Math.cos(a) * 0.05],
						layer ? 0.065 : 0.075,
						layer ? 0.25 : 0.23,
						-Math.sin(a) * (layer ? 0.25 : 0.75),
						natural ? body : material(layer ? '#eb8294' : '#c74364', 0.85),
						'ornament',
						0.025
					);
					petal.rotation.y = a;
				}
		}
	}

	if (stage >= 3) {
		// Pleated, asymmetric drapery has its own volume, double-sided rear and hem.
		add(
			shapeGroup,
			loft(
				[
					[0.69, 0.89, 0.52, -0.1],
					[0.9, 0.92, 0.54, -0.13],
					[1.3, 0.88, 0.52, -0.13],
					[1.82, 0.76, 0.46, -0.1],
					[2.36, 0.64, 0.41, -0.15],
					[2.92, 0.61, 0.39, -0.13],
					[3.25, 0.58, 0.38, -0.08],
					[3.62, 0.405, 0.31, 0.02]
				],
				14,
				0.055
			),
			sariMat,
			'dress'
		);
		add(
			shapeGroup,
			loft([
				[4.13, 0.485, 0.337, 0.04],
				[4.4, 0.605, 0.365, 0.02],
				[4.65, 0.635, 0.291],
				[4.78, 0.46, 0.261],
				[4.87, 0.28, 0.23]
			]),
			blouse,
			'dress'
		);
		const drape = clothRibbon(
			[
				[-0.61, 4.78, 0.13],
				[-0.42, 4.54, 0.4],
				[-0.1, 4.21, 0.48],
				[0.25, 3.88, 0.39],
				[0.43, 3.5, 0.3],
				[0.42, 3.09, 0.35]
			],
			[0.36, 0.42, 0.46, 0.47, 0.41, 0.31],
			7,
			high ? 52 : 30
		);
		add(shapeGroup, drape, sariMat, 'dress');
		for (const side of [-1, 1]) {
			const edge: Vec3[] = [
				[-0.61 + side * 0.18, 4.79, 0.16],
				[-0.42 + side * 0.21, 4.54, 0.44],
				[-0.1 + side * 0.23, 4.21, 0.52],
				[0.25 + side * 0.235, 3.88, 0.43],
				[0.43 + side * 0.205, 3.5, 0.34],
				[0.42 + side * 0.155, 3.09, 0.39]
			];
			tube(shapeGroup, edge, 0.035, gold, 'dress', 48);
			beadChain(shapeGroup, edge, 50, 0.019, goldDark, 'dress');
		}
		// A rear pallu makes orbiting reveal a dressed, finished sculpture.
		add(
			shapeGroup,
			clothRibbon(
				[
					[-0.59, 4.76, -0.1],
					[-0.72, 4.2, -0.37],
					[-0.82, 3.4, -0.45],
					[-0.91, 2.5, -0.4],
					[-1, 1.42, -0.18]
				],
				[0.39, 0.47, 0.55, 0.56, 0.58],
				8,
				high ? 44 : 24
			),
			sariShadow,
			'dress'
		);
		for (let i = 0; i < 14; i++) {
			const a = (i / 14) * TAU;
			const front = Math.cos(a);
			if (front > 0) {
				const px = Math.sin(a) * 0.79 - 0.1;
				tube(
					shapeGroup,
					[
						[px, 0.77, front * 0.54 + 0.018],
						[Math.sin(a) * 0.73 - 0.11, 1.45, front * 0.5 + 0.014],
						[Math.sin(a) * 0.54 - 0.12, 2.64, front * 0.41 + 0.014],
						[Math.sin(a) * 0.47 - 0.06, 3.31, front * 0.35 + 0.013]
					],
					0.012,
					goldDark,
					'dress'
				);
			}
		}
		for (const y of [0.79, 0.87, 1.03]) {
			const hem = ring(shapeGroup, [-0.11, y, 0], 0.9, y === 0.87 ? 0.047 : 0.02, gold, 'dress');
			hem.rotation.x = Math.PI / 2;
			hem.scale.y = 0.61;
		}
		// Motifs are individual relief details in the cloth, deterministic by the supplied seed.
		const random = seeded(design.seed);
		for (let row = 0; row < 6; row++)
			for (let column = 0; column < 7; column++) {
				const y = 1.2 + row * 0.31;
				const a = (column - 3) * 0.27 + (row % 2) * 0.08;
				const radius = 0.88 - row * 0.045;
				const x = Math.sin(a) * radius - 0.11,
					z = Math.cos(a) * (0.53 - row * 0.025) + 0.02;
				const size = 0.035 + random() * 0.015;
				if (design.sariPattern === 'lotus') {
					for (const s of [-1, 0, 1])
						leaf(shapeGroup, [x, y, z], size * 0.52, size * 1.9, s * 0.51, gold, 'dress', 0.008);
				} else if (design.sariPattern === 'chevron') {
					tube(
						shapeGroup,
						[
							[x - size, y + size, z],
							[x, y - size * 0.3, z + 0.004],
							[x + size, y + size, z]
						],
						0.007,
						gold,
						'dress',
						5
					);
				} else {
					tube(
						shapeGroup,
						[
							[x - size, y, z],
							[x, y + size, z + 0.004],
							[x, y + size * 2.2, z]
						],
						0.005,
						gold,
						'dress',
						7
					);
					leaf(shapeGroup, [x, y + size, z], size * 0.4, size, -0.9, gold, 'dress', 0.008);
				}
			}
	}

	if (stage >= 4) {
		// Layers of necklaces follow chest contours and terminate in a supported pendant.
		const density = Math.round(2 + design.ornamentDensity * 3);
		for (let layer = 0; layer < density; layer++) {
			const w = 0.24 + layer * 0.053,
				y = 4.94 - layer * 0.042,
				drop = 0.25 + layer * 0.12;
			const chain: Vec3[] = [
				[-w, y, 0.16],
				[-w * 1.11, y - drop * 0.65, 0.38],
				[0.01, y - drop, 0.45 + layer * 0.008],
				[w * 1.13, y - drop * 0.65, 0.38],
				[w, y, 0.16]
			];
			tube(shapeGroup, chain, layer % 2 === 0 ? 0.018 : 0.012, gold);
			beadChain(
				shapeGroup,
				chain,
				21 + layer * 4,
				layer % 2 === 0 ? 0.029 : 0.023,
				layer % 2 === 0 ? ivory : gold
			);
		}
		leaf(shapeGroup, [0.01, 3.95, 0.54], 0.14, 0.25, 0, gold, 'ornament', 0.04);
		ellipsoid(shapeGroup, [0.01, 4.095, 0.604], [0.055, 0.072, 0.025], jewel);
		const belt = ring(shapeGroup, [0.02, 3.56, 0], 0.43, 0.04, gold, 'ornament', [1, 0.76, 1]);
		belt.rotation.x = Math.PI / 2;
		for (let j = 0; j < 17; j++) {
			const a = (j / 16 - 0.5) * Math.PI;
			ellipsoid(
				shapeGroup,
				[Math.sin(a) * 0.44 + 0.02, 3.54, Math.cos(a) * 0.33],
				[0.036, 0.065, 0.025],
				gold
			);
		}
		for (const side of [-1, 1]) {
			const anklet = ring(
				shapeGroup,
				[side * 0.34 - 0.1, 0.77, 0.09],
				0.19,
				0.027,
				gold,
				'ornament',
				[1, 0.8, 1]
			);
			anklet.rotation.x = Math.PI / 2;
		}
		const crown = new THREE.Group();
		crown.position.set(0, 0.42, -0.035);
		crown.scale.setScalar(design.crownScale);
		head.add(crown);
		const crownBase = add(
			crown,
			new THREE.CylinderGeometry(0.39, 0.53, 0.26, segments, 1, true),
			ivory,
			'crown'
		);
		crownBase.position.y = 0.16;
		crownBase.scale.z = 0.72;
		// A shaped central crest framed by seven layered, carved fan petals.
		leaf(crown, [0, 0.2, 0.015], 0.29, 1.13, 0, ivory, 'crown', 0.08);
		leaf(crown, [0, 0.27, 0.11], 0.2, 0.82, 0, goldDark, 'crown', 0.035);
		leaf(crown, [0, 0.3, 0.17], 0.164, 0.68, 0, ivory, 'crown', 0.04);
		for (const side of [-1, 1])
			for (let j = 0; j < 3; j++) {
				const x = side * (0.17 + j * 0.16),
					height = 0.88 - j * 0.14;
				leaf(
					crown,
					[x, 0.16 - j * 0.025, -0.02 - j * 0.04],
					0.17 - j * 0.018,
					height,
					-side * (0.17 + j * 0.16),
					ivory,
					'crown',
					0.065
				);
				tube(
					crown,
					[
						[x, 0.22, 0.1 - j * 0.04],
						[x + side * 0.08, 0.46, 0.13 - j * 0.04],
						[x + side * (0.14 + j * 0.025), height - 0.01, 0.04 - j * 0.04]
					],
					0.014,
					goldDark,
					'crown'
				);
				// Fine raised lace runs along each feather of the shola-inspired fan.
				const theta = -side * (0.17 + j * 0.16);
				const crestPoint = (u: number, y: number): Vec3 => [
					x + u * Math.cos(theta) - y * Math.sin(theta),
					0.16 - j * 0.025 + u * Math.sin(theta) + y * Math.cos(theta),
					0.071 - j * 0.04
				];
				for (const edge of [-1, 1]) {
					const trace: Vec3[] = [];
					for (let step = 0; step <= 12; step++) {
						const t = step / 12;
						trace.push(
							crestPoint(
								edge * Math.sin(t * Math.PI) * (0.08 - j * 0.009),
								0.07 + t * (height - 0.17)
							)
						);
					}
					tube(crown, trace, 0.008, gold, 'crown', 20);
				}
				for (let dot = 0; dot < 5; dot++) {
					const at = crestPoint(0, 0.17 + (dot * (height - 0.3)) / 5);
					ring(crown, at, 0.027 - j * 0.002, 0.009, ivory, 'crown');
					ellipsoid(crown, [at[0], at[1], at[2] + 0.01], [0.011, 0.013, 0.01], goldDark, 'crown');
				}
			}
		const ornamentCount = Math.round(11 + design.ornamentDensity * 12);
		for (let i = 0; i < ornamentCount; i++) {
			const a = (i / (ornamentCount - 1) - 0.5) * Math.PI * 0.93;
			const x = Math.sin(a) * 0.48,
				z = Math.cos(a) * 0.355;
			ellipsoid(crown, [x, 0.13, z], [0.032, 0.045, 0.025], gold, 'crown');
			ellipsoid(crown, [x * 1.01, 0.045, z], [0.023, 0.031, 0.022], ivory, 'crown');
		}
		for (let j = 0; j < 5; j++) {
			const y = 0.38 + j * 0.125;
			const size = 0.11 - j * 0.012;
			ring(crown, [0, y, 0.235], size, 0.014, gold, 'crown');
			ellipsoid(
				crown,
				[0, y, 0.252],
				[size * 0.41, size * 0.49, 0.018],
				j % 2 ? jewel : ivory,
				'crown'
			);
			for (const side of [-1, 1])
				for (let k = 0; k < 3; k++)
					ellipsoid(
						crown,
						[side * (size + k * 0.022), y - k * 0.012, 0.2],
						[0.012, 0.017, 0.012],
						ivory,
						'crown'
					);
		}
		// Temple pieces connect the crown to the hairline.
		for (const side of [-1, 1]) {
			tube(
				head,
				[
					[side * 0.06, 0.61, 0.25],
					[side * 0.3, 0.49, 0.3],
					[side * 0.46, 0.22, 0.19]
				],
				0.035,
				ivory,
				'crown'
			);
			beadChain(
				head,
				[
					[side * 0.09, 0.54, 0.3],
					[side * 0.29, 0.43, 0.34],
					[side * 0.45, 0.16, 0.22]
				],
				13,
				0.018,
				gold,
				'crown'
			);
		}
	}

	if (stage >= 5) {
		buildHalo();
		if (design.flowers) {
			const curve = new THREE.CatmullRomCurve3([
				v([-0.37, 4.85, 0.28]),
				v([-0.58, 4.29, 0.51]),
				v([-0.44, 3.42, 0.53]),
				v([0.04, 3.07, 0.64]),
				v([0.49, 3.42, 0.54]),
				v([0.62, 4.3, 0.51]),
				v([0.38, 4.85, 0.27])
			]);
			const n = high ? 54 : 40;
			for (let i = 0; i < n; i++) {
				const p = curve.getPoint(i / (n - 1));
				floral(
					shapeGroup,
					[p.x, p.y, p.z],
					0.078 + Math.sin(i * 1.7) * 0.008,
					flowers,
					'ornament',
					high ? 7 : 5
				);
			}
			for (let i = 0; i < 23; i++) {
				const a = (i / 22 - 0.5) * Math.PI * 1.35;
				floral(
					pedestal,
					[Math.sin(a) * 1.8, 0.59, Math.cos(a) * 1.07 + 0.25],
					0.09,
					i % 4 === 0 ? ivory : flowers,
					'ornament',
					7
				);
			}
		}
		if (design.lion) buildLion();
	}

	function buildHalo() {
		const halo = new THREE.Group();
		halo.name = 'layered ornamental aureole';
		halo.position.set(0, 4.3, -0.8);
		root.add(halo);
		const radius = 2.74;
		// An open-backed aureole: physical rails and tracery, no luminous disk hiding the arms.
		if (design.halo === 'arch') {
			for (const r of [2.68, 2.83]) {
				const points: Vec3[] = [];
				for (let j = 0; j <= 44; j++) {
					const a = -Math.PI * 0.5 + (j / 44) * Math.PI * 2;
					points.push([Math.sin(a) * r, Math.cos(a) * r * 1.06, 0]);
				}
				tube(halo, points, r < 2.8 ? 0.047 : 0.025, r < 2.8 ? goldDark : ivory, 'crown', 80);
			}
		} else {
			for (const [r, thickness, mat] of [
				[radius, 0.048, goldDark],
				[radius - 0.12, 0.019, gold],
				[radius + 0.13, 0.022, ivory]
			] as const)
				ring(halo, [0, 0, 0], r, thickness, mat, 'crown');
		}
		const count = design.halo === 'sunburst' ? 52 : 36;
		for (let i = 0; i < count; i++) {
			const a = (i / count) * TAU;
			const at: Vec3 = [Math.sin(a) * (radius + 0.09), Math.cos(a) * (radius + 0.09), 0];
			const length = design.halo === 'sunburst' ? (i % 2 ? 0.2 : 0.31) : 0.3;
			leaf(halo, at, design.halo === 'sunburst' ? 0.04 : 0.1, length, -a, ivory, 'crown', 0.045);
			const x = Math.sin(a) * (radius - 0.02),
				y = Math.cos(a) * (radius - 0.02);
			ellipsoid(halo, [x, y, 0.055], [0.047, 0.047, 0.029], i % 3 === 0 ? jewel : gold, 'crown');
			if (design.ornamentDensity > 0.45) {
				const offset = a + Math.PI / count;
				ring(
					halo,
					[Math.sin(offset) * (radius - 0.2), Math.cos(offset) * (radius - 0.2), 0],
					0.085,
					0.011,
					goldDark,
					'crown'
				);
			}
		}
		// Low stems connect the aureole physically to the pedestal behind the figure.
		for (const s of [-1, 1])
			tube(
				halo,
				[
					[s * 1.64, -2.2, 0],
					[s * 1.56, -2.8, 0.02],
					[s * 1.4, -3.73, 0.06]
				],
				0.07,
				goldDark,
				'crown'
			);
	}

	function buildLion() {
		const lion = new THREE.Group();
		lion.name = 'composed lion';
		lion.position.set(-1.05, 0.66, 0.79);
		lion.rotation.y = -0.2;
		root.add(lion);
		const fur = natural ? body : material('#bc8a45', 0.92);
		const mane = natural ? bodyShadow : material('#5d3825', 0.94);
		const muzzle = natural ? body : material('#d4b479', 0.91);
		ellipsoid(lion, [-0.08, 0.4, -0.29], [0.85, 0.39, 0.39], fur, 'lion');
		ellipsoid(lion, [0.52, 0.34, -0.32], [0.45, 0.3, 0.35], fur, 'lion');
		for (const z of [-0.05, 0.38]) {
			ellipsoid(lion, [-0.34, 0.18, z], [0.22, 0.22, 0.48], fur, 'lion');
			ellipsoid(lion, [-0.34, 0.1, z + 0.31], [0.27, 0.12, 0.27], fur, 'lion');
			for (let i = 0; i < 3; i++)
				line(
					lion,
					[-0.5 + i * 0.14, 0.139, z + 0.39],
					[-0.5 + i * 0.14, 0.14, z + 0.52],
					0.008,
					bodyShadow,
					'lion'
				);
		}
		ellipsoid(lion, [-0.56, 0.7, 0.03], [0.45, 0.49, 0.34], mane, 'lion');
		for (let j = 0; j < 3; j++)
			for (let i = 0; i < (high ? 24 : 18); i++) {
				const count = high ? 24 : 18,
					a = (i / count) * TAU + j * 0.04;
				const hair = ellipsoid(
					lion,
					[
						-0.56 + Math.sin(a) * (0.32 + j * 0.055),
						0.78 + Math.cos(a) * (0.38 + j * 0.04),
						0.15 - j * 0.12
					],
					[0.067, 0.2 + j * 0.02, 0.1],
					j % 2 ? fur : mane,
					'lion'
				);
				hair.rotation.z = -a;
			}
		ellipsoid(lion, [-0.56, 0.85, 0.27], [0.31, 0.33, 0.25], fur, 'lion');
		for (const s of [-1, 1]) {
			ellipsoid(lion, [-0.56 + s * 0.21, 1.1, 0.12], [0.11, 0.13, 0.06], fur, 'lion');
			ellipsoid(lion, [-0.56 + s * 0.125, 0.93, 0.48], [0.067, 0.034, 0.018], black, 'lion');
			ellipsoid(
				lion,
				[-0.56 + s * 0.125, 0.928, 0.496],
				[0.033, 0.025, 0.008],
				natural ? bodyShadow : gold,
				'lion'
			);
			ellipsoid(lion, [-0.56 + s * 0.125, 0.928, 0.505], [0.01, 0.024, 0.005], black, 'lion');
			ellipsoid(lion, [-0.565 + s * 0.125, 0.94, 0.511], [0.005, 0.005, 0.002], ivory, 'lion');
			ellipsoid(lion, [-0.56 + s * 0.09, 0.72, 0.5], [0.12, 0.095, 0.1], muzzle, 'lion');
			for (let j = 0; j < 3; j++)
				tube(
					lion,
					[
						[-0.56 + s * 0.1, 0.73 - j * 0.028, 0.57],
						[-0.56 + s * 0.26, 0.75 - j * 0.037, 0.58],
						[-0.56 + s * 0.34, 0.77 - j * 0.05, 0.54]
					],
					0.004,
					muzzle,
					'lion',
					8
				);
		}
		ellipsoid(lion, [-0.56, 0.79, 0.59], [0.068, 0.045, 0.035], black, 'lion');
		tube(
			lion,
			[
				[-0.67, 0.672, 0.535],
				[-0.56, 0.651, 0.55],
				[-0.45, 0.672, 0.535]
			],
			0.01,
			bodyShadow,
			'lion'
		);
		tube(
			lion,
			[
				[0.61, 0.32, -0.45],
				[0.99, 0.26, -0.65],
				[1.13, 0.43, -0.77],
				[1.02, 0.58, -0.82]
			],
			0.045,
			fur,
			'lion'
		);
		ellipsoid(lion, [1.02, 0.58, -0.82], [0.09, 0.12, 0.08], mane, 'lion');
	}

	return consolidate(root);
}

/** Variable-radius Frenet sweep gives limbs a joined, tapered sculptural surface. */
function taperedTube(
	path: THREE.CatmullRomCurve3,
	length: number,
	radial: number,
	radius: (t: number) => number
): THREE.BufferGeometry {
	const frames = path.computeFrenetFrames(length, false),
		positions: number[] = [],
		uvs: number[] = [],
		indices: number[] = [];
	for (let i = 0; i <= length; i++) {
		const t = i / length,
			centre = path.getPoint(t),
			r = radius(t);
		for (let j = 0; j <= radial; j++) {
			const a = (j / radial) * TAU;
			const p = centre
				.clone()
				.addScaledVector(frames.normals[i], Math.cos(a) * r)
				.addScaledVector(frames.binormals[i], Math.sin(a) * r);
			positions.push(p.x, p.y, p.z);
			uvs.push(j / radial, t);
			if (i && j) {
				const k = i * (radial + 1) + j;
				indices.push(k, k - 1, k - radial - 2, k, k - radial - 2, k - radial - 1);
			}
		}
	}
	const result = new THREE.BufferGeometry();
	result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
	result.setIndex(indices);
	result.computeVertexNormals();
	return result;
}

/** Cloth draped over a smooth centreline, with real surface folds and a finished reverse. */
function clothRibbon(
	points: Vec3[],
	widths: number[],
	folds: number,
	steps: number
): THREE.BufferGeometry {
	const curve = new THREE.CatmullRomCurve3(points.map(v));
	const positions: number[] = [],
		uvs: number[] = [],
		indices: number[] = [];
	const across = 20;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps,
			p = curve.getPoint(t),
			section = t * (widths.length - 1),
			low = Math.min(widths.length - 2, Math.floor(section)),
			f = section - low,
			width = widths[low] * (1 - f) + widths[low + 1] * f;
		for (let j = 0; j <= across; j++) {
			const u = j / across;
			positions.push(
				p.x + (u - 0.5) * width,
				p.y + Math.sin(u * Math.PI) * 0.012,
				p.z + Math.sin(u * Math.PI * folds * 2 + t * 0.4) * 0.018 + Math.sin(u * Math.PI) * 0.025
			);
			uvs.push(u, t);
			if (i && j) {
				const k = i * (across + 1) + j;
				indices.push(k, k - across - 2, k - 1, k, k - across - 1, k - across - 2);
			}
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	// Add the reverse explicitly to avoid changing shared material-side settings.
	const reverse = geometry.clone();
	const index = reverse.index!;
	for (let i = 0; i < index.count; i += 3) {
		const a = index.getX(i);
		index.setX(i, index.getX(i + 2));
		index.setX(i + 2, a);
	}
	reverse.computeVertexNormals();
	const merged = mergeGeometries([geometry, reverse])!;
	geometry.dispose();
	reverse.dispose();
	return merged;
}

function seeded(seed: string) {
	let state = 2166136261;
	for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
	return () => {
		state += 0x6d2b79f5;
		let x = Math.imul(state ^ (state >>> 15), 1 | state);
		x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
		return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
	};
}

/** A small local height field gives clay pores and cast metal grain without remote assets. */
function surfaceGrain(seed: string): THREE.DataTexture {
	const random = seeded(`${seed}-surface`);
	const size = 64,
		data = new Uint8Array(size * size * 4);
	for (let index = 0; index < size * size; index++) {
		const intensity = Math.round(95 + random() * 65 + (random() > 0.975 ? 45 : 0));
		data[index * 4] = intensity;
		data[index * 4 + 1] = intensity;
		data[index * 4 + 2] = intensity;
		data[index * 4 + 3] = 255;
	}
	const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(9, 9);
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.needsUpdate = true;
	return texture;
}

/** Batch by material and selectable region: ornate detail without thousands of draw calls. */
function consolidate(root: THREE.Group): THREE.Group {
	root.updateMatrixWorld(true);
	const batches = new Map<
		string,
		{ material: Material; region: string; geometries: THREE.BufferGeometry[] }
	>();
	const sourceGeometries = new Set<THREE.BufferGeometry>();
	root.traverse((object) => {
		if (
			!(object instanceof THREE.Mesh) ||
			!object.visible ||
			!object.geometry.attributes.position.count
		)
			return;
		const mat = object.material as Material,
			region = object.userData.region ?? 'ornament';
		const key = `${mat.uuid}:${region}`;
		if (!batches.has(key)) batches.set(key, { material: mat, region, geometries: [] });
		const geometry = object.geometry.clone();
		geometry.applyMatrix4(object.matrixWorld);
		// Keep shared vertices: unindexing every bead needlessly quadruples ornate geometry.
		if (!geometry.index)
			geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
		batches.get(key)!.geometries.push(geometry);
		sourceGeometries.add(object.geometry);
	});
	root.clear();
	for (const { material, region, geometries } of batches.values()) {
		const geometry = mergeGeometries(geometries);
		for (const entry of geometries) entry.dispose();
		if (!geometry) continue;
		geometry.computeBoundingSphere();
		const mesh = new THREE.Mesh(geometry, material);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.userData.region = region;
		mesh.name = `${region} sculptural detail`;
		root.add(mesh);
	}
	for (const geometry of sourceGeometries) geometry.dispose();
	return root;
}
