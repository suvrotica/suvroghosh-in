import {
	DEFAULT_GRID_SIZE,
	MaterialId,
	type BrushSegmentPaint,
	type CirclePaint,
	type EllipsePaint,
	type Phantom,
	type PhantomPresetId
} from './types';

function assertSize(size: number): void {
	if (!Number.isInteger(size) || size < 8 || size > 1024) {
		throw new RangeError('Phantom size must be an integer from 8 through 1024.');
	}
}

function safeDensity(value: number | undefined): number {
	if (value === undefined) return 1;
	if (!Number.isFinite(value)) throw new RangeError('Material density must be finite.');
	return Math.max(0, Math.min(4, value));
}

function assertMaterial(material: MaterialId): void {
	if (!Number.isInteger(material) || material < MaterialId.Air || material > MaterialId.Metal) {
		throw new RangeError(`Unknown CT material identifier: ${material}.`);
	}
}

export function createBlankPhantom(
	size = DEFAULT_GRID_SIZE,
	material: MaterialId = MaterialId.Air
): Phantom {
	assertSize(size);
	assertMaterial(material);
	const length = size * size;
	const materials = new Uint8Array(length);
	materials.fill(material);
	const density = new Float32Array(length);
	density.fill(material === MaterialId.Air ? 0 : 1);
	return { size, materials, density, revision: 0 };
}

export function clonePhantom(phantom: Phantom): Phantom {
	validatePhantom(phantom);
	return {
		size: phantom.size,
		materials: new Uint8Array(phantom.materials),
		density: new Float32Array(phantom.density),
		revision: phantom.revision
	};
}

export function validatePhantom(phantom: Phantom): void {
	assertSize(phantom.size);
	const expectedLength = phantom.size * phantom.size;
	if (!(phantom.materials instanceof Uint8Array) || phantom.materials.length !== expectedLength) {
		throw new RangeError('Phantom material grid does not match its declared size.');
	}
	if (!(phantom.density instanceof Float32Array) || phantom.density.length !== expectedLength) {
		throw new RangeError('Phantom density grid does not match its declared size.');
	}
}

function paintPredicate(
	phantom: Phantom,
	material: MaterialId,
	density: number,
	predicate: (x: number, y: number) => boolean
): Phantom {
	validatePhantom(phantom);
	assertMaterial(material);
	const appliedDensity = material === MaterialId.Air ? 0 : safeDensity(density);
	const size = phantom.size;
	for (let row = 0; row < size; row += 1) {
		const y = 1 - ((row + 0.5) * 2) / size;
		for (let column = 0; column < size; column += 1) {
			const x = ((column + 0.5) * 2) / size - 1;
			if (!predicate(x, y)) continue;
			const index = row * size + column;
			phantom.materials[index] = material;
			phantom.density[index] = appliedDensity;
		}
	}
	phantom.revision += 1;
	return phantom;
}

export function paintCircle(phantom: Phantom, paint: CirclePaint): Phantom {
	if (!Number.isFinite(paint.radius) || paint.radius <= 0) {
		throw new RangeError('Circle radius must be positive and finite.');
	}
	const radiusSquared = paint.radius * paint.radius;
	return paintPredicate(
		phantom,
		paint.material,
		safeDensity(paint.density),
		(x, y) =>
			(x - paint.centerX) * (x - paint.centerX) + (y - paint.centerY) * (y - paint.centerY) <=
			radiusSquared
	);
}

export function paintEllipse(phantom: Phantom, paint: EllipsePaint): Phantom {
	if (
		!Number.isFinite(paint.radiusX) ||
		!Number.isFinite(paint.radiusY) ||
		paint.radiusX <= 0 ||
		paint.radiusY <= 0
	) {
		throw new RangeError('Ellipse radii must be positive and finite.');
	}
	const rotation = paint.rotation ?? 0;
	const cosine = Math.cos(rotation);
	const sine = Math.sin(rotation);
	return paintPredicate(phantom, paint.material, safeDensity(paint.density), (x, y) => {
		const dx = x - paint.centerX;
		const dy = y - paint.centerY;
		const localX = cosine * dx + sine * dy;
		const localY = -sine * dx + cosine * dy;
		return (
			(localX * localX) / (paint.radiusX * paint.radiusX) +
				(localY * localY) / (paint.radiusY * paint.radiusY) <=
			1
		);
	});
}

export function paintBrushSegment(phantom: Phantom, paint: BrushSegmentPaint): Phantom {
	if (!Number.isFinite(paint.radius) || paint.radius <= 0) {
		throw new RangeError('Brush radius must be positive and finite.');
	}
	const dx = paint.toX - paint.fromX;
	const dy = paint.toY - paint.fromY;
	const lengthSquared = dx * dx + dy * dy;
	const radiusSquared = paint.radius * paint.radius;
	return paintPredicate(phantom, paint.material, safeDensity(paint.density), (x, y) => {
		const fraction =
			lengthSquared === 0
				? 0
				: Math.max(
						0,
						Math.min(1, ((x - paint.fromX) * dx + (y - paint.fromY) * dy) / lengthSquared)
					);
		const closestX = paint.fromX + fraction * dx;
		const closestY = paint.fromY + fraction * dy;
		return (x - closestX) ** 2 + (y - closestY) ** 2 <= radiusSquared;
	});
}

function headBase(size: number): Phantom {
	const phantom = createBlankPhantom(size);
	paintEllipse(phantom, {
		centerX: 0,
		centerY: 0,
		radiusX: 0.76,
		radiusY: 0.9,
		material: MaterialId.Bone
	});
	paintEllipse(phantom, {
		centerX: 0,
		centerY: 0,
		radiusX: 0.68,
		radiusY: 0.81,
		material: MaterialId.SoftTissue
	});
	paintEllipse(phantom, {
		centerX: -0.2,
		centerY: 0.06,
		radiusX: 0.2,
		radiusY: 0.31,
		rotation: -0.12,
		material: MaterialId.LesionLow
	});
	paintEllipse(phantom, {
		centerX: 0.22,
		centerY: 0.04,
		radiusX: 0.18,
		radiusY: 0.29,
		rotation: 0.1,
		material: MaterialId.SoftTissue,
		density: 1.08
	});
	return phantom;
}

export function createPresetPhantom(
	preset: PhantomPresetId = 'head',
	size = DEFAULT_GRID_SIZE
): Phantom {
	switch (preset) {
		case 'blank':
			return createBlankPhantom(size);
		case 'simple-circles': {
			const phantom = createBlankPhantom(size);
			paintCircle(phantom, {
				centerX: 0,
				centerY: 0,
				radius: 0.72,
				material: MaterialId.SoftTissue
			});
			paintCircle(phantom, {
				centerX: -0.28,
				centerY: 0.18,
				radius: 0.18,
				material: MaterialId.Bone
			});
			paintCircle(phantom, {
				centerX: 0.3,
				centerY: -0.2,
				radius: 0.13,
				material: MaterialId.LesionLow
			});
			return phantom;
		}
		case 'head':
			return headBase(size);
		case 'hidden-lesion': {
			const phantom = headBase(size);
			paintCircle(phantom, {
				centerX: 0.27,
				centerY: -0.2,
				radius: 0.085,
				material: MaterialId.LesionHigh
			});
			return phantom;
		}
		case 'lungs': {
			const phantom = createBlankPhantom(size);
			paintEllipse(phantom, {
				centerX: 0,
				centerY: 0,
				radiusX: 0.82,
				radiusY: 0.72,
				material: MaterialId.SoftTissue
			});
			for (const centerX of [-0.31, 0.31]) {
				paintEllipse(phantom, {
					centerX,
					centerY: 0.03,
					radiusX: 0.25,
					radiusY: 0.46,
					material: MaterialId.Air
				});
			}
			paintCircle(phantom, {
				centerX: 0,
				centerY: -0.05,
				radius: 0.12,
				material: MaterialId.Bone
			});
			return phantom;
		}
		case 'abdomen': {
			const phantom = createBlankPhantom(size);
			paintEllipse(phantom, {
				centerX: 0,
				centerY: 0,
				radiusX: 0.88,
				radiusY: 0.7,
				material: MaterialId.SoftTissue
			});
			paintEllipse(phantom, {
				centerX: -0.27,
				centerY: 0.08,
				radiusX: 0.31,
				radiusY: 0.2,
				rotation: -0.18,
				material: MaterialId.SoftTissue,
				density: 1.15
			});
			paintCircle(phantom, {
				centerX: 0,
				centerY: -0.28,
				radius: 0.13,
				material: MaterialId.Bone
			});
			return phantom;
		}
		case 'sparse': {
			const phantom = createBlankPhantom(size);
			paintCircle(phantom, {
				centerX: -0.43,
				centerY: 0.29,
				radius: 0.16,
				material: MaterialId.Bone
			});
			paintEllipse(phantom, {
				centerX: 0.3,
				centerY: -0.25,
				radiusX: 0.12,
				radiusY: 0.3,
				rotation: 0.45,
				material: MaterialId.SoftTissue
			});
			return phantom;
		}
		case 'metal': {
			const phantom = headBase(size);
			paintEllipse(phantom, {
				centerX: 0.28,
				centerY: -0.15,
				radiusX: 0.08,
				radiusY: 0.22,
				rotation: -0.36,
				material: MaterialId.Metal
			});
			return phantom;
		}
		default: {
			const exhaustive: never = preset;
			throw new RangeError(`Unknown phantom preset: ${String(exhaustive)}.`);
		}
	}
}
