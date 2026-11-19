import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { renderPixelDensity } from '$lib/visualizations/webgl';
import { computeSmartCameraPose, type CameraPose } from './camera';
import { computeMorphMatrix3, dot, matVec, norm, padToVec3, subVec } from './math';
import { effectiveInputVector } from './state';
import type {
	OrientationSnapshot,
	ProjectedLabel,
	StudioTheme,
	SubspaceAnalysis,
	SubspaceViewerState,
	Vec,
	Vec3
} from './types';

export type StageRole = 'domain' | 'codomain' | 'superimposed';

export interface CameraSnapshot {
	position: Vec3;
	target: Vec3;
	up: Vec3;
}

export interface StageCallbacks {
	onCameraOrbit?: (snapshot: CameraSnapshot) => void;
	onLabelsUpdate?: (labels: ProjectedLabel[]) => void;
	onOrientationUpdate?: (orientation: OrientationSnapshot) => void;
	onContextLossChange?: (lost: boolean) => void;
}

export interface SubspaceStageHandle {
	update(state: SubspaceViewerState, analysis: SubspaceAnalysis, role?: StageRole): void;
	applyCameraPose(pose: CameraPose, instant?: boolean): void;
	applySmartCamera(
		analysis: SubspaceAnalysis,
		preset: SubspaceViewerState['cameraPreset'],
		instant?: boolean
	): void;
	syncCameraFrom(snapshot: CameraSnapshot): void;
	getCameraSnapshot(): CameraSnapshot;
	orbitBy(dAzimuthRad: number, dElevationRad: number): void;
	zoomStep(factor: number): void;
	setAxisView(axis: Vec3): void;
	setPaused(paused: boolean): void;
	renderOnce(): void;
	getCanvas(): HTMLCanvasElement;
	dispose(): void;
}

interface ThemePalette {
	bg: number;
	grid: number;
	axis: number;
	axisMuted: number;
	slateFill: number;
	slateBorder: number;
	row: number;
	rowCss: string;
	null: number;
	nullCss: string;
	col: number;
	colCss: string;
	leftNull: number;
	leftNullCss: string;
	inputX: number;
	inputXCss: string;
	outputAx: number;
	outputAxCss: string;
	targetB: number;
	targetBCss: string;
	xPlus: number;
	xPlusCss: string;
	sphere: number;
	ellipsoid: number;
	rightAngle: number;
}

const DARK_PALETTE: ThemePalette = {
	bg: 0x0d1117,
	grid: 0x263142,
	axis: 0x64748b,
	axisMuted: 0x334155,
	slateFill: 0x161f2e,
	slateBorder: 0x475569,
	row: 0x2dd4bf,
	rowCss: '#5eead4',
	null: 0xf59e0b,
	nullCss: '#fbbf24',
	col: 0x60a5fa,
	colCss: '#93c5fd',
	leftNull: 0xf472b6,
	leftNullCss: '#f9a8d4',
	inputX: 0xf8fafc,
	inputXCss: '#f8fafc',
	outputAx: 0xfde047,
	outputAxCss: '#fde047',
	targetB: 0xc4b5fd,
	targetBCss: '#ddd6fe',
	xPlus: 0x38bdf8,
	xPlusCss: '#7dd3fc',
	sphere: 0x94a3b8,
	ellipsoid: 0x60a5fa,
	rightAngle: 0xf8fafc
};

const LIGHT_PALETTE: ThemePalette = {
	bg: 0xf5f2ea,
	grid: 0xd6cfc2,
	axis: 0x64748b,
	axisMuted: 0xcbd5e1,
	slateFill: 0xeae4d7,
	slateBorder: 0x94a3b8,
	row: 0x0f766e,
	rowCss: '#0f766e',
	null: 0xb45309,
	nullCss: '#b45309',
	col: 0x1d4ed8,
	colCss: '#1d4ed8',
	leftNull: 0xbe185d,
	leftNullCss: '#be185d',
	inputX: 0x18181b,
	inputXCss: '#18181b',
	outputAx: 0xa16207,
	outputAxCss: '#854d0e',
	targetB: 0x6d28d9,
	targetBCss: '#6d28d9',
	xPlus: 0x0369a1,
	xPlusCss: '#0369a1',
	sphere: 0x64748b,
	ellipsoid: 0x2563eb,
	rightAngle: 0x1e293b
};

interface AnchorSpec {
	id: string;
	text: string;
	color: string;
	worldPos: THREE.Vector3;
}

function toVec3(v: Vec): THREE.Vector3 {
	const [x, y, z] = padToVec3(v);
	return new THREE.Vector3(x, y, z);
}

function disposeObjectTree(root: THREE.Object3D): void {
	root.traverse((obj) => {
		const mesh = obj as THREE.Mesh;
		if (mesh.geometry) {
			mesh.geometry.dispose();
		}
		const mat = mesh.material;
		if (Array.isArray(mat)) {
			for (const m of mat) m.dispose();
		} else if (mat) {
			mat.dispose();
		}
	});
	while (root.children.length > 0) {
		root.remove(root.children[0]);
	}
}

function buildArrow(
	from: THREE.Vector3,
	to: THREE.Vector3,
	color: number,
	radius = 0.038,
	opacity = 1
): THREE.Group {
	const group = new THREE.Group();
	const delta = new THREE.Vector3().subVectors(to, from);
	const length = delta.length();
	if (length < 1e-4) return group;

	const headLen = Math.min(0.28, Math.max(0.12, length * 0.24));
	const headRadius = radius * 2.75;
	const shaftLen = Math.max(0.001, length - headLen);
	const dir = delta.clone().normalize();
	const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

	const mat = new THREE.MeshStandardMaterial({
		color,
		roughness: 0.35,
		metalness: 0.08,
		transparent: opacity < 1,
		opacity
	});

	const shaftGeo = new THREE.CylinderGeometry(radius, radius, shaftLen, 14);
	const shaft = new THREE.Mesh(shaftGeo, mat);
	shaft.position.copy(from).addScaledVector(dir, shaftLen * 0.5);
	shaft.quaternion.copy(quat);
	group.add(shaft);

	const headGeo = new THREE.ConeGeometry(headRadius, headLen, 16);
	const head = new THREE.Mesh(headGeo, mat.clone());
	head.position.copy(from).addScaledVector(dir, shaftLen + headLen * 0.5);
	head.quaternion.copy(quat);
	group.add(head);

	return group;
}

function buildDashedSegment(
	from: THREE.Vector3,
	to: THREE.Vector3,
	color: number,
	opacity = 0.72,
	dashSize = 0.14,
	gapSize = 0.09
): THREE.Line {
	const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
	const mat = new THREE.LineDashedMaterial({
		color,
		dashSize,
		gapSize,
		transparent: true,
		opacity
	});
	const line = new THREE.Line(geo, mat);
	line.computeLineDistances();
	return line;
}

function buildRightAngleGlyph(
	corner: THREE.Vector3,
	dirA: THREE.Vector3,
	dirB: THREE.Vector3,
	size: number,
	color: number
): THREE.Group {
	const group = new THREE.Group();
	const a = dirA.clone();
	const b = dirB.clone();
	if (a.lengthSq() < 1e-10 || b.lengthSq() < 1e-10) return group;
	a.normalize().multiplyScalar(size);
	b.normalize().multiplyScalar(size);

	const p1 = corner.clone().add(a);
	const p2 = corner.clone().add(a).add(b);
	const p3 = corner.clone().add(b);

	const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2, p3]);
	const lineMat = new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity: 0.92
	});
	group.add(new THREE.Line(lineGeo, lineMat));

	const quadGeo = new THREE.BufferGeometry();
	const positions = new Float32Array([
		corner.x,
		corner.y,
		corner.z,
		p1.x,
		p1.y,
		p1.z,
		p2.x,
		p2.y,
		p2.z,
		corner.x,
		corner.y,
		corner.z,
		p2.x,
		p2.y,
		p2.z,
		p3.x,
		p3.y,
		p3.z
	]);
	quadGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	const quadMat = new THREE.MeshBasicMaterial({
		color,
		transparent: true,
		opacity: 0.2,
		side: THREE.DoubleSide,
		depthWrite: false
	});
	group.add(new THREE.Mesh(quadGeo, quadMat));

	return group;
}

function buildSubspace0D(color: number, radiusOffset = 0): THREE.Group {
	const group = new THREE.Group();
	const core = new THREE.Mesh(
		new THREE.SphereGeometry(0.095, 18, 18),
		new THREE.MeshStandardMaterial({
			color,
			emissive: color,
			emissiveIntensity: 0.35,
			roughness: 0.3
		})
	);
	group.add(core);

	const ring = new THREE.Mesh(
		new THREE.TorusGeometry(0.24 + radiusOffset, 0.022, 10, 36),
		new THREE.MeshStandardMaterial({
			color,
			emissive: color,
			emissiveIntensity: 0.25,
			roughness: 0.35
		})
	);
	ring.rotation.x = Math.PI / 2;
	group.add(ring);

	return group;
}

function buildSubspace1D(
	direction: Vec,
	color: number,
	extent: number,
	isNullStyle: boolean
): THREE.Group {
	const group = new THREE.Group();
	const dir = toVec3(direction);
	if (dir.lengthSq() < 1e-12) return group;
	dir.normalize();
	const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

	const rodGeo = new THREE.CylinderGeometry(0.036, 0.036, extent * 2, 16);
	const rodMat = new THREE.MeshStandardMaterial({
		color,
		emissive: color,
		emissiveIntensity: 0.22,
		roughness: 0.35,
		metalness: 0.05
	});
	const rod = new THREE.Mesh(rodGeo, rodMat);
	rod.quaternion.copy(quat);
	group.add(rod);

	// Directional tick collars (denser banded collars for nullspace non-color distinction)
	const step = isNullStyle ? 0.65 : 1.0;
	for (let s = -Math.floor(extent / step) * step; s <= extent; s += step) {
		if (Math.abs(s) < 0.2) continue;
		const collar = new THREE.Mesh(
			new THREE.TorusGeometry(isNullStyle ? 0.085 : 0.068, isNullStyle ? 0.02 : 0.014, 8, 20),
			new THREE.MeshStandardMaterial({
				color,
				roughness: 0.4,
				transparent: true,
				opacity: 0.85
			})
		);
		collar.position.copy(dir).multiplyScalar(s);
		collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
		group.add(collar);
	}

	return group;
}

function buildSubspace2D(
	basisA: Vec,
	basisB: Vec,
	color: number,
	radius: number,
	isNullStyle: boolean,
	originOffset?: THREE.Vector3,
	opacityScale = 1
): THREE.Group {
	const group = new THREE.Group();
	const e1 = toVec3(basisA).normalize();
	const e2Raw = toVec3(basisB);
	e2Raw.addScaledVector(e1, -e2Raw.dot(e1));
	if (e2Raw.lengthSq() < 1e-12) return group;
	const e2 = e2Raw.normalize();
	const normal = new THREE.Vector3().crossVectors(e1, e2).normalize();

	const basisMat = new THREE.Matrix4().makeBasis(e1, e2, normal);
	const quat = new THREE.Quaternion().setFromRotationMatrix(basisMat);

	const planeGroup = new THREE.Group();
	planeGroup.quaternion.copy(quat);
	if (originOffset) planeGroup.position.copy(originOffset);

	// Translucent circular disk
	const disk = new THREE.Mesh(
		new THREE.CircleGeometry(radius, 72),
		new THREE.MeshStandardMaterial({
			color,
			transparent: true,
			opacity: (isNullStyle ? 0.16 : 0.22) * opacityScale,
			roughness: 0.65,
			metalness: 0.02,
			side: THREE.DoubleSide,
			depthWrite: false
		})
	);
	planeGroup.add(disk);

	// Crisp perimeter rim
	const rim = new THREE.Mesh(
		new THREE.TorusGeometry(radius, 0.022, 10, 96),
		new THREE.MeshStandardMaterial({
			color,
			emissive: color,
			emissiveIntensity: 0.18,
			roughness: 0.35,
			transparent: true,
			opacity: 0.88 * opacityScale
		})
	);
	planeGroup.add(rim);

	// Internal coordinate grid clipped cleanly inside circle radius
	const gridPts: THREE.Vector3[] = [];
	const spacing = 0.7;
	const maxSteps = Math.floor((radius - 0.1) / spacing);
	for (let k = -maxSteps; k <= maxSteps; k += 1) {
		const d = k * spacing;
		const span = Math.sqrt(Math.max(0, radius * radius - d * d));
		if (span < 0.05) continue;
		if (isNullStyle) {
			// Diagonal hatch motif for nullspace planes (non-color distinction)
			const c = Math.SQRT1_2;
			gridPts.push(new THREE.Vector3(c * (d - span), c * (d + span), 0.002));
			gridPts.push(new THREE.Vector3(c * (d + span), c * (d - span), 0.002));
		} else {
			gridPts.push(new THREE.Vector3(-span, d, 0.002));
			gridPts.push(new THREE.Vector3(span, d, 0.002));
			gridPts.push(new THREE.Vector3(d, -span, 0.002));
			gridPts.push(new THREE.Vector3(d, span, 0.002));
		}
	}
	const gridGeo = new THREE.BufferGeometry().setFromPoints(gridPts);
	const gridMat = new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity: (isNullStyle ? 0.28 : 0.32) * opacityScale
	});
	planeGroup.add(new THREE.LineSegments(gridGeo, gridMat));

	group.add(planeGroup);
	return group;
}

function buildSubspace3D(color: number, halfExtent: number, isNullStyle: boolean): THREE.Group {
	const group = new THREE.Group();
	const boxGeo = new THREE.BoxGeometry(halfExtent * 2, halfExtent * 2, halfExtent * 2);
	const edges = new THREE.LineSegments(
		new THREE.EdgesGeometry(boxGeo),
		new THREE.LineBasicMaterial({
			color,
			transparent: true,
			opacity: isNullStyle ? 0.34 : 0.4
		})
	);
	group.add(edges);

	const tint = new THREE.Mesh(
		boxGeo,
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.045,
			side: THREE.BackSide,
			depthWrite: false
		})
	);
	group.add(tint);

	return group;
}

function buildAmbientFrame(
	ambientDim: 1 | 2 | 3,
	extent: number,
	palette: ThemePalette
): THREE.Group {
	const group = new THREE.Group();

	const axisDirs: [THREE.Vector3, number][] = [
		[new THREE.Vector3(1, 0, 0), palette.axis],
		[new THREE.Vector3(0, 1, 0), palette.axis],
		[new THREE.Vector3(0, 0, 1), palette.axis]
	];

	for (let i = 0; i < ambientDim; i += 1) {
		const [dir, col] = axisDirs[i];
		const neg = dir.clone().multiplyScalar(-extent);
		const pos = dir.clone().multiplyScalar(extent);
		const geo = new THREE.BufferGeometry().setFromPoints([neg, pos]);
		const line = new THREE.Line(
			geo,
			new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.55 })
		);
		group.add(line);

		// Small positive axis tip cone
		const tip = new THREE.Mesh(
			new THREE.ConeGeometry(0.055, 0.16, 10),
			new THREE.MeshBasicMaterial({ color: col })
		);
		tip.position.copy(pos);
		tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
		group.add(tip);

		// Unit tick marks
		const tickStep = 1;
		const tickDir = i === 0 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
		for (let t = -Math.floor(extent); t <= Math.floor(extent); t += tickStep) {
			if (t === 0) continue;
			const center = dir.clone().multiplyScalar(t);
			const tGeo = new THREE.BufferGeometry().setFromPoints([
				center.clone().addScaledVector(tickDir, -0.06),
				center.clone().addScaledVector(tickDir, 0.06)
			]);
			group.add(
				new THREE.Line(
					tGeo,
					new THREE.LineBasicMaterial({ color: palette.axis, transparent: true, opacity: 0.4 })
				)
			);
		}
	}

	if (ambientDim === 2) {
		// Explicit 2D ambient coordinate slate so ℝ² is visually unmistakable from a subspace of ℝ³
		const size = extent * 1.9;
		const slate = new THREE.Mesh(
			new THREE.PlaneGeometry(size, size),
			new THREE.MeshBasicMaterial({
				color: palette.slateFill,
				transparent: true,
				opacity: 0.42,
				side: THREE.DoubleSide,
				depthWrite: false
			})
		);
		slate.position.z = -0.015;
		group.add(slate);

		const border = new THREE.LineLoop(
			new THREE.BufferGeometry().setFromPoints([
				new THREE.Vector3(-size / 2, -size / 2, -0.01),
				new THREE.Vector3(size / 2, -size / 2, -0.01),
				new THREE.Vector3(size / 2, size / 2, -0.01),
				new THREE.Vector3(-size / 2, size / 2, -0.01)
			]),
			new THREE.LineBasicMaterial({
				color: palette.slateBorder,
				transparent: true,
				opacity: 0.65
			})
		);
		group.add(border);

		const gridPts: THREE.Vector3[] = [];
		const half = Math.floor(size / 2);
		for (let k = -half; k <= half; k += 1) {
			if (k === 0) continue;
			gridPts.push(new THREE.Vector3(-size / 2, k, -0.012));
			gridPts.push(new THREE.Vector3(size / 2, k, -0.012));
			gridPts.push(new THREE.Vector3(k, -size / 2, -0.012));
			gridPts.push(new THREE.Vector3(k, size / 2, -0.012));
		}
		group.add(
			new THREE.LineSegments(
				new THREE.BufferGeometry().setFromPoints(gridPts),
				new THREE.LineBasicMaterial({
					color: palette.grid,
					transparent: true,
					opacity: 0.45
				})
			)
		);
	} else if (ambientDim === 3) {
		// Faint equatorial reference grid on x1-x3 plane for spatial depth cues
		const half = Math.floor(extent);
		const gridPts: THREE.Vector3[] = [];
		for (let k = -half; k <= half; k += 1) {
			gridPts.push(new THREE.Vector3(-half, 0, k));
			gridPts.push(new THREE.Vector3(half, 0, k));
			gridPts.push(new THREE.Vector3(k, 0, -half));
			gridPts.push(new THREE.Vector3(k, 0, half));
		}
		group.add(
			new THREE.LineSegments(
				new THREE.BufferGeometry().setFromPoints(gridPts),
				new THREE.LineBasicMaterial({
					color: palette.grid,
					transparent: true,
					opacity: 0.25
				})
			)
		);
	}

	return group;
}

function buildMappedUnitShape(
	domainDim: 1 | 2 | 3,
	transformPoint: (p: Vec) => Vec3,
	color: number,
	isTransformed: boolean
): THREE.Group {
	const group = new THREE.Group();

	if (domainDim === 1) {
		const pNeg = toVec3(transformPoint([-1]));
		const pPos = toVec3(transformPoint([1]));
		const geo = new THREE.BufferGeometry().setFromPoints([pNeg, pPos]);
		group.add(
			new THREE.Line(
				geo,
				new THREE.LineBasicMaterial({
					color,
					transparent: true,
					opacity: isTransformed ? 0.9 : 0.65
				})
			)
		);
		for (const pt of [pNeg, pPos]) {
			const bead = new THREE.Mesh(
				new THREE.SphereGeometry(0.065, 12, 12),
				new THREE.MeshBasicMaterial({ color })
			);
			bead.position.copy(pt);
			group.add(bead);
		}
		return group;
	}

	if (domainDim === 2) {
		const segs = 72;
		const pts: THREE.Vector3[] = [];
		for (let i = 0; i <= segs; i += 1) {
			const theta = (i / segs) * Math.PI * 2;
			pts.push(toVec3(transformPoint([Math.cos(theta), Math.sin(theta)])));
		}
		group.add(
			new THREE.Line(
				new THREE.BufferGeometry().setFromPoints(pts),
				new THREE.LineBasicMaterial({
					color,
					transparent: true,
					opacity: isTransformed ? 0.85 : 0.55
				})
			)
		);
		return group;
	}

	// domainDim === 3: smooth geodesic mesh + 3 principal meridian loops
	const sphereGeo = new THREE.SphereGeometry(1, 24, 16);
	const posAttr = sphereGeo.attributes.position;
	for (let i = 0; i < posAttr.count; i += 1) {
		const px = posAttr.getX(i);
		const py = posAttr.getY(i);
		const pz = posAttr.getZ(i);
		const [tx, ty, tz] = transformPoint([px, py, pz]);
		posAttr.setXYZ(i, tx, ty, tz);
	}
	posAttr.needsUpdate = true;
	sphereGeo.computeVertexNormals();

	const shell = new THREE.Mesh(
		sphereGeo,
		new THREE.MeshStandardMaterial({
			color,
			transparent: true,
			opacity: isTransformed ? 0.14 : 0.06,
			roughness: 0.5,
			metalness: 0.05,
			side: THREE.DoubleSide,
			depthWrite: false
		})
	);
	group.add(shell);

	// 3 great-circle wireframe loops
	const loopSegs = 64;
	const loops: ((t: number) => Vec)[] = [
		(t) => [Math.cos(t), Math.sin(t), 0],
		(t) => [Math.cos(t), 0, Math.sin(t)],
		(t) => [0, Math.cos(t), Math.sin(t)]
	];
	for (const fn of loops) {
		const pts: THREE.Vector3[] = [];
		for (let i = 0; i <= loopSegs; i += 1) {
			const theta = (i / loopSegs) * Math.PI * 2;
			pts.push(toVec3(transformPoint(fn(theta))));
		}
		group.add(
			new THREE.Line(
				new THREE.BufferGeometry().setFromPoints(pts),
				new THREE.LineBasicMaterial({
					color,
					transparent: true,
					opacity: isTransformed ? 0.62 : 0.34
				})
			)
		);
	}

	return group;
}

function resolveLabelCollisions(
	raw: ProjectedLabel[],
	width: number,
	height: number
): ProjectedLabel[] {
	interface BoxItem {
		label: ProjectedLabel;
		halfW: number;
		halfH: number;
		x: number;
		y: number;
	}

	const topMargin = 16;
	const bottomMargin = 48; // clear bottom hint badge & compass
	const sideMargin = 10;

	const items: BoxItem[] = raw.map((label) => {
		const halfW = Math.max(16, Math.ceil((label.text.length * 7.2 + 16) / 2));
		const halfH = 12;
		const minX = Math.min(width / 2, halfW + sideMargin);
		const maxX = Math.max(width / 2, width - halfW - sideMargin);
		const minY = Math.min(height / 2, halfH + topMargin);
		const maxY = Math.max(height / 2, height - halfH - bottomMargin);
		return {
			label,
			halfW,
			halfH,
			x: Math.max(minX, Math.min(maxX, label.labelX)),
			y: Math.max(minY, Math.min(maxY, label.labelY))
		};
	});

	for (let iter = 0; iter < 18; iter += 1) {
		let moved = false;
		for (let i = 0; i < items.length; i += 1) {
			for (let j = i + 1; j < items.length; j += 1) {
				const a = items[i];
				const b = items[j];
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const minSepX = a.halfW + b.halfW + 6;
				const minSepY = a.halfH + b.halfH + 4;
				const overlapX = minSepX - Math.abs(dx);
				const overlapY = minSepY - Math.abs(dy);
				if (overlapX > 0 && overlapY > 0) {
					moved = true;
					// Prefer separating along the shorter overlap axis (with slight bias toward vertical)
					if (overlapY <= overlapX * 1.15) {
						const pushY = overlapY * 0.54 + 0.5;
						const dir = dy >= 0 ? 1 : -1;
						a.y -= dir * pushY;
						b.y += dir * pushY;
					} else {
						const pushX = overlapX * 0.54 + 0.5;
						const dir = dx >= 0 ? 1 : -1;
						a.x -= dir * pushX;
						b.x += dir * pushX;
					}
				}
			}
		}

		// Clamp every pill back inside safe viewport bounds after each relaxation pass
		for (const item of items) {
			const minX = Math.min(width / 2, item.halfW + sideMargin);
			const maxX = Math.max(width / 2, width - item.halfW - sideMargin);
			const minY = Math.min(height / 2, item.halfH + topMargin);
			const maxY = Math.max(height / 2, height - item.halfH - bottomMargin);
			item.x = Math.max(minX, Math.min(maxX, item.x));
			item.y = Math.max(minY, Math.min(maxY, item.y));
		}

		if (!moved) break;
	}

	return items.map((item) => ({
		...item.label,
		labelX: item.x,
		labelY: item.y
	}));
}

export function createSubspaceStageRenderer(
	canvas: HTMLCanvasElement,
	initialRole: StageRole,
	callbacks: StageCallbacks = {}
): SubspaceStageHandle {
	let role: StageRole = initialRole;
	let disposed = false;
	let paused = false;
	let syncingExternal = false;
	let suppressOrbitEmit = false;
	let needsRender = true;
	let frameId: number | null = null;
	let currentTheme: StudioTheme = 'dark';
	let currentAnchors: AnchorSpec[] = [];
	let currentLabelEnabled = true;

	// Camera tween state
	let tweenStartPos: THREE.Vector3 | null = null;
	let tweenEndPos: THREE.Vector3 | null = null;
	let tweenStartUp: THREE.Vector3 | null = null;
	let tweenEndUp: THREE.Vector3 | null = null;
	let tweenStartTime = 0;
	const tweenDurationMs = 420;

	const prefersReducedMotion = () =>
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: false,
		preserveDrawingBuffer: true
	});
	renderer.setPixelRatio(renderPixelDensity());
	renderer.outputColorSpace = THREE.SRGBColorSpace;

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(DARK_PALETTE.bg);

	const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 160);
	camera.position.set(4.9, 3.6, 5.7);
	camera.lookAt(0, 0, 0);

	// Calm studio lighting
	scene.add(new THREE.AmbientLight(0xffffff, 0.92));
	const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
	keyLight.position.set(7, 10, 8);
	scene.add(keyLight);
	const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.35);
	rimLight.position.set(-7, -5, -6);
	scene.add(rimLight);

	const dynamicGroup = new THREE.Group();
	scene.add(dynamicGroup);

	const controls = new OrbitControls(camera, canvas);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.enablePan = true;
	controls.minDistance = 2.6;
	controls.maxDistance = 38;
	controls.target.set(0, 0, 0);

	const emitCameraAndOverlays = () => {
		if (disposed) return;

		// Emit orientation snapshot for 3D compass
		if (callbacks.onOrientationUpdate) {
			const invQuat = camera.quaternion.clone().invert();
			const rx = new THREE.Vector3(1, 0, 0).applyQuaternion(invQuat);
			const ry = new THREE.Vector3(0, 1, 0).applyQuaternion(invQuat);
			const rz = new THREE.Vector3(0, 0, 1).applyQuaternion(invQuat);
			callbacks.onOrientationUpdate({
				right: [rx.x, rx.y, rx.z],
				up: [ry.x, ry.y, ry.z],
				forward: [rz.x, rz.y, rz.z]
			});
		}

		// Project 3D label anchors
		if (callbacks.onLabelsUpdate) {
			if (!currentLabelEnabled || currentAnchors.length === 0) {
				callbacks.onLabelsUpdate([]);
			} else {
				const width = canvas.clientWidth || 1;
				const height = canvas.clientHeight || 1;
				const raw: ProjectedLabel[] = [];
				for (const anchor of currentAnchors) {
					const proj = anchor.worldPos.clone().project(camera);
					if (proj.z < -1 || proj.z > 1) continue;
					const sx = (proj.x * 0.5 + 0.5) * width;
					const sy = (-proj.y * 0.5 + 0.5) * height;
					if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) continue;
					raw.push({
						id: anchor.id,
						text: anchor.text,
						color: anchor.color,
						anchorX: sx,
						anchorY: sy,
						labelX: sx + 12,
						labelY: sy - 14,
						stage: role
					});
				}
				callbacks.onLabelsUpdate(resolveLabelCollisions(raw, width, height));
			}
		}
	};

	const onControlsChange = () => {
		needsRender = true;
		// Never broadcast programmatic smart-camera tweens or external syncs as user orbit drags
		if (!syncingExternal && !suppressOrbitEmit && tweenEndPos === null && callbacks.onCameraOrbit) {
			callbacks.onCameraOrbit({
				position: [camera.position.x, camera.position.y, camera.position.z],
				target: [controls.target.x, controls.target.y, controls.target.z],
				up: [camera.up.x, camera.up.y, camera.up.z]
			});
		}
	};

	const onControlsStart = () => {
		// Cancel automatic camera tween immediately if user grabs the stage
		tweenEndPos = null;
		suppressOrbitEmit = false;
	};

	controls.addEventListener('change', onControlsChange);
	controls.addEventListener('start', onControlsStart);

	const onContextLost = (ev: Event) => {
		ev.preventDefault();
		callbacks.onContextLossChange?.(true);
	};
	const onContextRestored = () => {
		callbacks.onContextLossChange?.(false);
		needsRender = true;
	};
	canvas.addEventListener('webglcontextlost', onContextLost);
	canvas.addEventListener('webglcontextrestored', onContextRestored);

	const resizeToContainer = () => {
		if (disposed) return;
		const rect = canvas.getBoundingClientRect();
		const width = Math.max(1, Math.round(rect.width));
		const height = Math.max(1, Math.round(rect.height));
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		needsRender = true;
	};

	const resizeObserver = new ResizeObserver(() => resizeToContainer());
	resizeObserver.observe(canvas);
	resizeToContainer();

	const renderFrame = (now: number) => {
		if (disposed) return;
		frameId = window.requestAnimationFrame(renderFrame);
		if (paused) return;

		let wasTweening = false;
		if (tweenEndPos && tweenStartPos && tweenStartUp && tweenEndUp) {
			wasTweening = true;
			const elapsed = now - tweenStartTime;
			const u = Math.min(1, elapsed / tweenDurationMs);
			const ease = 1 - (1 - u) ** 3;
			camera.position.lerpVectors(tweenStartPos, tweenEndPos, ease);
			camera.up.lerpVectors(tweenStartUp, tweenEndUp, ease).normalize();
			controls.target.set(0, 0, 0);
			camera.lookAt(0, 0, 0);
			needsRender = true;
			if (u >= 1) {
				tweenEndPos = null;
			}
		}

		if (wasTweening) suppressOrbitEmit = true;
		const dampingMoved = controls.update();
		if (wasTweening) suppressOrbitEmit = false;
		if (needsRender || dampingMoved) {
			renderer.render(scene, camera);
			emitCameraAndOverlays();
			needsRender = false;
		}
	};

	frameId = window.requestAnimationFrame(renderFrame);

	const rebuildScene = (state: SubspaceViewerState, analysis: SubspaceAnalysis) => {
		disposeObjectTree(dynamicGroup);
		currentAnchors = [];
		currentLabelEnabled = state.layers.showLabels;
		currentTheme = state.studioTheme;
		const palette = currentTheme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
		scene.background = new THREE.Color(palette.bg);

		const layers = state.layers;
		const xEff = effectiveInputVector(state, analysis);
		const axEff = matVec(analysis.matrix, xEff);

		// Compute comfortable scene extent based on active vectors & singular values
		const maxVec = Math.max(
			norm(xEff),
			norm(axEff),
			norm(analysis.target.b),
			norm(analysis.target.xPlus),
			analysis.svd.singularValues[0] ?? 1
		);
		const planeRadius = Math.min(5.8, Math.max(2.75, Math.min(maxVec, 5.6) * 1.02));
		const lineExtent = planeRadius + 0.45;

		const addAnchor = (id: string, text: string, color: string, pos: THREE.Vector3) => {
			currentAnchors.push({ id, text, color, worldPos: pos.clone() });
		};

		const renderSubspace = (
			key: 'row' | 'null' | 'col' | 'leftNull',
			color: number,
			cssColor: string,
			isNullStyle: boolean,
			opacityScale = 1
		) => {
			const info = analysis.subspaces[key];
			const svdBasis = info.svdBasis;
			const displayBasis = state.basisMode === 'svd' ? info.svdBasis : info.rrefBasis;

			if (info.dimension === 0) {
				dynamicGroup.add(buildSubspace0D(color, isNullStyle ? 0.05 : 0));
				addAnchor(
					`sub-${key}`,
					`${info.symbol} = {0}`,
					cssColor,
					new THREE.Vector3(0, isNullStyle ? -0.35 : 0.35, 0)
				);
			} else if (info.dimension === 1 && svdBasis.length >= 1) {
				dynamicGroup.add(buildSubspace1D(svdBasis[0], color, lineExtent, isNullStyle));
				const anchorPt = toVec3(svdBasis[0])
					.normalize()
					.multiplyScalar(planeRadius * 0.84);
				addAnchor(`sub-${key}`, `${info.symbol} (1D)`, cssColor, anchorPt);
			} else if (info.dimension === 2 && svdBasis.length >= 2) {
				dynamicGroup.add(
					buildSubspace2D(
						svdBasis[0],
						svdBasis[1],
						color,
						planeRadius,
						isNullStyle,
						undefined,
						opacityScale
					)
				);
				const anchorPt = toVec3(svdBasis[0])
					.normalize()
					.multiplyScalar(planeRadius * 0.72)
					.addScaledVector(toVec3(svdBasis[1]).normalize(), planeRadius * 0.48);
				addAnchor(`sub-${key}`, `${info.symbol} (2D)`, cssColor, anchorPt);
			} else if (info.dimension === 3) {
				dynamicGroup.add(buildSubspace3D(color, planeRadius * 0.9, isNullStyle));
				// Anchor at outer upper-left corner of the volume so it stays clear of origin vectors
				addAnchor(
					`sub-${key}`,
					`${info.symbol} = ℝ³`,
					cssColor,
					new THREE.Vector3(-planeRadius * 0.76, planeRadius * 0.76, planeRadius * 0.52)
				);
			}

			// Basis vector arrows (SVD orthonormal vs RREF / Pivot)
			if (layers.showBasisVectors && displayBasis.length > 0) {
				const prefix =
					state.basisMode === 'svd'
						? key === 'row' || key === 'null'
							? 'v'
							: 'u'
						: key === 'row'
							? 'r'
							: key === 'null'
								? 'n'
								: key === 'col'
									? 'c'
									: 'y';
				const startIndex =
					state.basisMode === 'svd' && (key === 'null' || key === 'leftNull') ? analysis.rank : 0;

				for (let idx = 0; idx < displayBasis.length; idx += 1) {
					const vec = displayBasis[idx];
					const len = norm(vec);
					if (len < 1e-8) continue;
					const clampedScale = len > planeRadius * 0.95 ? (planeRadius * 0.95) / len : 1;
					const tip = toVec3(vec).multiplyScalar(clampedScale);
					dynamicGroup.add(buildArrow(new THREE.Vector3(), tip, color, 0.044, 0.96));
					addAnchor(
						`basis-${key}-${idx}`,
						`${prefix}${startIndex + idx + 1}`,
						cssColor,
						tip.clone().multiplyScalar(1.08)
					);
				}
			}
		};

		const addOriginRightAngles = (basisA: Vec[], basisB: Vec[]) => {
			if (!layers.showRightAngles || basisA.length === 0 || basisB.length === 0) return;
			const origin = new THREE.Vector3();
			const size = 0.42;
			// Show perpendicular brackets between leading basis vectors (up to 2 brackets when 2D ⊥ 1D)
			const aCount = Math.min(2, basisA.length);
			const bCount = Math.min(2, basisB.length);
			for (let i = 0; i < aCount; i += 1) {
				for (let j = 0; j < bCount; j += 1) {
					if (i === 1 && j === 1) continue;
					dynamicGroup.add(
						buildRightAngleGlyph(
							origin,
							toVec3(basisA[i]),
							toVec3(basisB[j]),
							size,
							palette.rightAngle
						)
					);
				}
			}
		};

		if (role === 'domain') {
			if (layers.showGridAxes) {
				dynamicGroup.add(buildAmbientFrame(analysis.n, lineExtent, palette));
			}
			if (layers.showRowSpace) {
				renderSubspace('row', palette.row, palette.rowCss, false);
			}
			if (layers.showNullspace) {
				renderSubspace('null', palette.null, palette.nullCss, true);
			}
			if (layers.showRowSpace && layers.showNullspace) {
				addOriginRightAngles(analysis.subspaces.row.svdBasis, analysis.subspaces.null.svdBasis);
			}

			if (layers.showUnitSphere) {
				dynamicGroup.add(
					buildMappedUnitShape(analysis.n, (p) => padToVec3(p), palette.sphere, false)
				);
			}

			// Input vector x = x_r + x_n
			const xVec3 = toVec3(xEff);
			const xRow3 = toVec3(analysis.input.xRow);
			const xNull3 = xVec3.clone().sub(xRow3);

			if (layers.showInputVector && xVec3.length() > 1e-4) {
				dynamicGroup.add(buildArrow(new THREE.Vector3(), xVec3, palette.inputX, 0.052));
				addAnchor('vec-x', 'x', palette.inputXCss, xVec3);
			}

			if (layers.showInputSplit) {
				if (xRow3.length() > 1e-4) {
					dynamicGroup.add(buildArrow(new THREE.Vector3(), xRow3, palette.row, 0.036, 0.92));
					addAnchor('vec-xr', 'xᵣ', palette.rowCss, xRow3);
				}
				if (xNull3.length() > 1e-4) {
					dynamicGroup.add(buildArrow(new THREE.Vector3(), xNull3, palette.null, 0.036, 0.92));
					addAnchor('vec-xn', 'xₙ', palette.nullCss, xNull3);
				}
				if (xRow3.length() > 0.06 && xNull3.length() > 0.06) {
					dynamicGroup.add(buildDashedSegment(xRow3, xVec3, palette.null, 0.85));
					dynamicGroup.add(buildDashedSegment(xNull3, xVec3, palette.row, 0.65));
					if (layers.showRightAngles) {
						dynamicGroup.add(
							buildRightAngleGlyph(xRow3, xRow3.clone().negate(), xNull3, 0.3, palette.rightAngle)
						);
					}
				}
			}

			// Affine solution fiber x_r + N(A)
			if (layers.showAffineFiber && analysis.subspaces.null.dimension > 0) {
				const nullBasis = analysis.subspaces.null.svdBasis;
				if (nullBasis.length === 1) {
					const dir = toVec3(nullBasis[0]).normalize();
					const fA = xRow3.clone().addScaledVector(dir, -2.5);
					const fB = xRow3.clone().addScaledVector(dir, 2.5);
					dynamicGroup.add(buildDashedSegment(fA, fB, palette.null, 0.92, 0.18, 0.08));
					const bead = new THREE.Mesh(
						new THREE.SphereGeometry(0.11, 16, 16),
						new THREE.MeshStandardMaterial({
							color: palette.null,
							emissive: palette.null,
							emissiveIntensity: 0.45
						})
					);
					bead.position.copy(xVec3);
					dynamicGroup.add(bead);
					addAnchor('fiber-x', 'xᵣ + N(A)', palette.nullCss, fB);
				} else if (nullBasis.length === 2) {
					dynamicGroup.add(
						buildSubspace2D(nullBasis[0], nullBasis[1], palette.null, 1.85, true, xRow3, 0.7)
					);
					addAnchor(
						'fiber-x',
						'xᵣ + N(A)',
						palette.nullCss,
						xRow3.clone().addScaledVector(toVec3(nullBasis[0]).normalize(), 1.55)
					);
				}
			}

			// Pseudoinverse minimum-norm solution x^+ = A^+ b and solution family x^+ + N(A)
			if (layers.showPseudoinverse) {
				const xp3 = toVec3(analysis.target.xPlus);
				if (xp3.length() > 1e-4) {
					dynamicGroup.add(buildArrow(new THREE.Vector3(), xp3, palette.xPlus, 0.04, 0.95));
				}
				const marker = new THREE.Mesh(
					new THREE.OctahedronGeometry(0.13, 0),
					new THREE.MeshStandardMaterial({
						color: palette.xPlus,
						emissive: palette.xPlus,
						emissiveIntensity: 0.4,
						roughness: 0.25
					})
				);
				marker.position.copy(xp3);
				dynamicGroup.add(marker);
				addAnchor(
					'vec-xplus',
					'x⁺ = A⁺b',
					palette.xPlusCss,
					xp3.clone().add(new THREE.Vector3(0, 0.2, 0))
				);

				if (analysis.subspaces.null.dimension === 1) {
					const dir = toVec3(analysis.subspaces.null.svdBasis[0]).normalize();
					dynamicGroup.add(
						buildDashedSegment(
							xp3.clone().addScaledVector(dir, -2.3),
							xp3.clone().addScaledVector(dir, 2.3),
							palette.xPlus,
							0.78,
							0.14,
							0.1
						)
					);
				} else if (
					analysis.subspaces.null.dimension === 2 &&
					analysis.subspaces.null.svdBasis.length >= 2
				) {
					dynamicGroup.add(
						buildSubspace2D(
							analysis.subspaces.null.svdBasis[0],
							analysis.subspaces.null.svdBasis[1],
							palette.xPlus,
							1.55,
							true,
							xp3,
							0.55
						)
					);
				}
			}
		} else if (role === 'codomain') {
			if (layers.showGridAxes) {
				dynamicGroup.add(buildAmbientFrame(analysis.m, lineExtent, palette));
			}
			if (layers.showColSpace) {
				renderSubspace('col', palette.col, palette.colCss, false);
			}
			if (layers.showLeftNullspace) {
				renderSubspace('leftNull', palette.leftNull, palette.leftNullCss, true);
			}
			if (layers.showColSpace && layers.showLeftNullspace) {
				addOriginRightAngles(analysis.subspaces.col.svdBasis, analysis.subspaces.leftNull.svdBasis);
			}

			// Transformed unit sphere -> Ellipsoid A(S^{n-1})
			if (layers.showUnitSphere && analysis.rank > 0) {
				dynamicGroup.add(
					buildMappedUnitShape(
						analysis.n,
						(p) => padToVec3(matVec(analysis.matrix, p)),
						palette.ellipsoid,
						true
					)
				);
			}

			// Output Ax
			const ax3 = toVec3(axEff);
			if (layers.showInputVector) {
				if (ax3.length() > 1e-4) {
					dynamicGroup.add(buildArrow(new THREE.Vector3(), ax3, palette.outputAx, 0.052));
					addAnchor('vec-ax', 'Ax', palette.outputAxCss, ax3);
				} else {
					const dotZero = new THREE.Mesh(
						new THREE.SphereGeometry(0.11, 14, 14),
						new THREE.MeshBasicMaterial({ color: palette.outputAx })
					);
					dynamicGroup.add(dotZero);
					addAnchor('vec-ax', 'Ax = 0', palette.outputAxCss, new THREE.Vector3(0, 0.35, 0));
				}
			}

			// Target b = p + e
			const b3 = toVec3(analysis.target.b);
			const p3 = toVec3(analysis.target.projection);
			const e3 = toVec3(analysis.target.residual);

			if (layers.showTargetVector && b3.length() > 1e-4) {
				dynamicGroup.add(buildArrow(new THREE.Vector3(), b3, palette.targetB, 0.048));
				addAnchor('vec-b', 'b', palette.targetBCss, b3);
			}

			if (layers.showTargetSplit) {
				if (p3.length() > 1e-4) {
					dynamicGroup.add(buildArrow(new THREE.Vector3(), p3, palette.col, 0.038, 0.95));
					addAnchor('vec-p', 'p = proj(b)', palette.colCss, p3);
				}
				if (e3.length() > 0.03) {
					// Draw residual drop arrow from p -> b and dashed copy from 0 -> e
					dynamicGroup.add(buildArrow(p3, b3, palette.leftNull, 0.034, 0.95));
					dynamicGroup.add(buildDashedSegment(new THREE.Vector3(), e3, palette.leftNull, 0.55));
					const midE = p3.clone().lerp(b3, 0.52);
					addAnchor('vec-e', 'e = b − p', palette.leftNullCss, midE);

					if (layers.showRightAngles) {
						const refInCol =
							p3.length() > 0.08
								? p3.clone().negate()
								: analysis.subspaces.col.svdBasis.length > 0
									? toVec3(analysis.subspaces.col.svdBasis[0])
									: null;
						if (refInCol) {
							dynamicGroup.add(buildRightAngleGlyph(p3, refInCol, e3, 0.32, palette.rightAngle));
						}
					}
				}
			}
		} else {
			// Superimposed / Morph View (m = n)
			if (layers.showGridAxes) {
				dynamicGroup.add(buildAmbientFrame(analysis.n, lineExtent, palette));
			}
			if (layers.showRowSpace) {
				renderSubspace('row', palette.row, palette.rowCss, false, 0.72);
			}
			if (layers.showNullspace) {
				renderSubspace('null', palette.null, palette.nullCss, true, 0.85);
			}
			if (layers.showColSpace) {
				renderSubspace('col', palette.col, palette.colCss, false, 0.88);
			}
			if (layers.showLeftNullspace) {
				renderSubspace('leftNull', palette.leftNull, palette.leftNullCss, true, 0.85);
			}
			if (layers.showRowSpace && layers.showNullspace) {
				addOriginRightAngles(analysis.subspaces.row.svdBasis, analysis.subspaces.null.svdBasis);
			}
			if (layers.showColSpace && layers.showLeftNullspace) {
				addOriginRightAngles(analysis.subspaces.col.svdBasis, analysis.subspaces.leftNull.svdBasis);
			}

			const { matrix3 } = computeMorphMatrix3(analysis, state.morphT, state.morphMode);
			const applyMorph = (p: Vec): Vec3 => {
				const p3 = padToVec3(p);
				const out = matVec(matrix3, p3);
				return [out[0] ?? 0, out[1] ?? 0, out[2] ?? 0];
			};

			// Ghost reference unit sphere + live morphed sphere/ellipsoid
			if (layers.showUnitSphere) {
				dynamicGroup.add(
					buildMappedUnitShape(analysis.n, (p) => padToVec3(p), palette.sphere, false)
				);
				dynamicGroup.add(buildMappedUnitShape(analysis.n, applyMorph, palette.ellipsoid, true));
			}

			// Morphed input vector M(t)x + trajectory path from x -> Ax
			if (layers.showInputVector) {
				const x0 = toVec3(xEff);
				const xt = toVec3(applyMorph(xEff));
				const x1 = toVec3(axEff);

				// Faint trajectory curve
				const trailPts: THREE.Vector3[] = [];
				for (let step = 0; step <= 24; step += 1) {
					const s = step / 24;
					const ms = computeMorphMatrix3(analysis, s, state.morphMode).matrix3;
					trailPts.push(toVec3(matVec(ms, padToVec3(xEff))));
				}
				dynamicGroup.add(
					new THREE.Line(
						new THREE.BufferGeometry().setFromPoints(trailPts),
						new THREE.LineBasicMaterial({
							color: palette.outputAx,
							transparent: true,
							opacity: 0.48
						})
					)
				);

				if (x0.length() > 1e-4) {
					dynamicGroup.add(buildArrow(new THREE.Vector3(), x0, palette.inputX, 0.032, 0.45));
					addAnchor('morph-x0', 'x', palette.inputXCss, x0);
				}
				if (xt.length() > 1e-4) {
					dynamicGroup.add(buildArrow(new THREE.Vector3(), xt, palette.outputAx, 0.056, 1));
					addAnchor(
						'morph-xt',
						state.morphT < 0.02
							? 'M(0)x = x'
							: state.morphT > 0.98
								? 'Ax'
								: `M(${state.morphT.toFixed(2)})x`,
						palette.outputAxCss,
						xt
					);
				} else if (x1.length() <= 1e-4 && state.morphT > 0.95) {
					addAnchor('morph-xt', 'Ax = 0', palette.outputAxCss, new THREE.Vector3(0, 0.35, 0));
				}
			}

			// Target b, projection p, and pseudoinverse x^+ remain inspectable in superimposed view
			if (layers.showTargetVector) {
				const b3 = toVec3(analysis.target.b);
				const p3 = toVec3(analysis.target.projection);
				if (b3.length() > 1e-4) {
					dynamicGroup.add(buildArrow(new THREE.Vector3(), b3, palette.targetB, 0.04, 0.85));
					addAnchor('vec-b', 'b', palette.targetBCss, b3);
				}
				if (
					layers.showTargetSplit &&
					norm(subVec(analysis.target.b, analysis.target.projection)) > 0.04
				) {
					dynamicGroup.add(buildArrow(p3, b3, palette.leftNull, 0.032, 0.85));
				}
			}
			if (layers.showPseudoinverse) {
				const xp3 = toVec3(analysis.target.xPlus);
				const marker = new THREE.Mesh(
					new THREE.OctahedronGeometry(0.12, 0),
					new THREE.MeshStandardMaterial({
						color: palette.xPlus,
						emissive: palette.xPlus,
						emissiveIntensity: 0.4,
						roughness: 0.25
					})
				);
				marker.position.copy(xp3);
				dynamicGroup.add(marker);
				addAnchor(
					'vec-xplus',
					'x⁺ = A⁺b',
					palette.xPlusCss,
					xp3.clone().add(new THREE.Vector3(0, 0.2, 0))
				);
			}
		}

		needsRender = true;
	};

	const applyCameraPose = (pose: CameraPose, instant = false) => {
		const targetPos = new THREE.Vector3(...pose.position);
		const targetUp = new THREE.Vector3(...pose.up).normalize();
		if (instant || prefersReducedMotion()) {
			tweenEndPos = null;
			suppressOrbitEmit = true;
			camera.position.copy(targetPos);
			camera.up.copy(targetUp);
			controls.target.set(...pose.target);
			camera.lookAt(...pose.target);
			controls.update();
			suppressOrbitEmit = false;
			needsRender = true;
			return;
		}
		tweenStartPos = camera.position.clone();
		tweenEndPos = targetPos;
		tweenStartUp = camera.up.clone();
		tweenEndUp = targetUp;
		tweenStartTime = performance.now();
		needsRender = true;
	};

	return {
		update(state, analysis, nextRole) {
			if (nextRole) role = nextRole;
			rebuildScene(state, analysis);
		},
		applyCameraPose,
		applySmartCamera(analysis, preset, instant = false) {
			const maxVec = Math.max(
				2.75,
				norm(analysis.input.x),
				norm(analysis.input.ax),
				norm(analysis.target.b),
				norm(analysis.target.xPlus),
				analysis.svd.singularValues[0] ?? 1
			);
			const planeRadius = Math.min(5.8, Math.max(2.75, Math.min(maxVec, 5.6) * 1.02));
			const distance = Math.min(24, Math.max(9.6, (planeRadius + 0.45) * 3.05));
			const pose = computeSmartCameraPose(analysis, preset, role, distance);
			applyCameraPose(pose, instant);
		},
		syncCameraFrom(snapshot) {
			syncingExternal = true;
			tweenEndPos = null;
			camera.position.set(...snapshot.position);
			camera.up.set(...snapshot.up);
			controls.target.set(...snapshot.target);
			camera.lookAt(...snapshot.target);
			controls.update();
			needsRender = true;
			syncingExternal = false;
		},
		getCameraSnapshot() {
			return {
				position: [camera.position.x, camera.position.y, camera.position.z],
				target: [controls.target.x, controls.target.y, controls.target.z],
				up: [camera.up.x, camera.up.y, camera.up.z]
			};
		},
		orbitBy(dAzimuthRad, dElevationRad) {
			tweenEndPos = null;
			suppressOrbitEmit = false;
			const offset = camera.position.clone().sub(controls.target);
			const spherical = new THREE.Spherical().setFromVector3(offset);
			spherical.theta += dAzimuthRad;
			spherical.phi = Math.max(0.08, Math.min(Math.PI - 0.08, spherical.phi + dElevationRad));
			offset.setFromSpherical(spherical);
			camera.position.copy(controls.target).add(offset);
			camera.up.set(0, 1, 0);
			camera.lookAt(controls.target);
			controls.update();
			needsRender = true;
			onControlsChange();
		},
		zoomStep(factor) {
			tweenEndPos = null;
			suppressOrbitEmit = false;
			const offset = camera.position.clone().sub(controls.target);
			const nextLen = Math.max(
				controls.minDistance,
				Math.min(controls.maxDistance, offset.length() * factor)
			);
			offset.setLength(nextLen);
			camera.position.copy(controls.target).add(offset);
			controls.update();
			needsRender = true;
			onControlsChange();
		},
		setAxisView(axis) {
			const dist = camera.position.distanceTo(controls.target) || 9.6;
			const raw = new THREE.Vector3(...axis).normalize();
			// Avoid exact polar singularity on +Y/-Y so OrbitControls stays smooth with up = (0,1,0)
			if (Math.abs(dot(axis, [0, 1, 0])) > 0.99) {
				raw.z += 0.006;
				raw.normalize();
			}
			applyCameraPose(
				{
					position: [raw.x * dist, raw.y * dist, raw.z * dist],
					target: [0, 0, 0],
					up: [0, 1, 0],
					note: 'Axis view'
				},
				false
			);
		},
		setPaused(nextPaused) {
			paused = nextPaused;
			if (!paused) {
				resizeToContainer();
				needsRender = true;
			}
		},
		renderOnce() {
			if (disposed) return;
			renderer.render(scene, camera);
			emitCameraAndOverlays();
		},
		getCanvas() {
			return canvas;
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			if (frameId !== null) window.cancelAnimationFrame(frameId);
			resizeObserver.disconnect();
			controls.removeEventListener('change', onControlsChange);
			controls.removeEventListener('start', onControlsStart);
			controls.dispose();
			canvas.removeEventListener('webglcontextlost', onContextLost);
			canvas.removeEventListener('webglcontextrestored', onContextRestored);
			disposeObjectTree(dynamicGroup);
			renderer.dispose();
		}
	};
}
