import {
	BoxGeometry,
	CanvasTexture,
	Color,
	DataTexture,
	ExtrudeGeometry,
	Group,
	LinearFilter,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	Path,
	RGBAFormat,
	Shape,
	SRGBColorSpace,
	Texture,
	Vector2
} from 'three';
import type { SketchCanvasMode } from '$lib/sketches/types';
import type { FrameDimensions, MuseumQuality } from './museum-types';
import { calculatePlaqueLayout } from './museum-layout';

export const CANVAS_SHADER_SETTINGS = {
	nearWhiteThresholdLow: 0.72,
	nearWhiteThresholdHigh: 0.97,
	canvasTextureStrength: 0.055,
	roughness: 0.88,
	normalMapIntensity: 0.12,
	inkContrast: 1.04
} as const;

const walnut = new MeshStandardMaterial({
	color: new Color('#2b160e'),
	roughness: 0.43,
	metalness: 0.06
});
const carvedWalnut = new MeshStandardMaterial({
	color: new Color('#3a1f13'),
	roughness: 0.5,
	metalness: 0.04
});
const restrainedGilt = new MeshStandardMaterial({
	color: new Color('#8f743d'),
	roughness: 0.48,
	metalness: 0.48
});
const plaqueBronze = new MeshStandardMaterial({
	color: new Color('#665334'),
	roughness: 0.58,
	metalness: 0.42
});

let sharedNormalMap: DataTexture | undefined;

function createCanvasNormalMap() {
	if (sharedNormalMap) return sharedNormalMap;
	const size = 64;
	const pixels = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const offset = (y * size + x) * 4;
			const warp = Math.sin((x / size) * Math.PI * 32) * 0.09;
			const weft = Math.sin((y / size) * Math.PI * 28) * 0.08;
			pixels[offset] = Math.round((0.5 + warp) * 255);
			pixels[offset + 1] = Math.round((0.5 + weft) * 255);
			pixels[offset + 2] = 250;
			pixels[offset + 3] = 255;
		}
	}
	sharedNormalMap = new DataTexture(pixels, size, size, RGBAFormat);
	sharedNormalMap.wrapS = sharedNormalMap.wrapT = 1000;
	sharedNormalMap.repeat.set(5, 7);
	sharedNormalMap.minFilter = LinearFilter;
	sharedNormalMap.magFilter = LinearFilter;
	sharedNormalMap.needsUpdate = true;
	return sharedNormalMap;
}

export function prepareSketchTexture(texture: Texture) {
	texture.colorSpace = SRGBColorSpace;
	texture.minFilter = LinearFilter;
	texture.magFilter = LinearFilter;
	texture.generateMipmaps = true;
	texture.needsUpdate = true;
	return texture;
}

export function createMountedSketchMaterial(
	texture: Texture,
	mode: SketchCanvasMode,
	quality: MuseumQuality
) {
	const material = new MeshStandardMaterial({
		color: 0xffffff,
		map: texture,
		roughness: mode === 'ink' ? CANVAS_SHADER_SETTINGS.roughness : 0.8,
		metalness: 0,
		normalMap: quality === 'low' ? null : createCanvasNormalMap(),
		normalScale: new Vector2(
			quality === 'high' ? CANVAS_SHADER_SETTINGS.normalMapIntensity : 0.07,
			quality === 'high' ? CANVAS_SHADER_SETTINGS.normalMapIntensity : 0.07
		)
	});

	if (mode === 'ink') {
		material.onBeforeCompile = (shader) => {
			shader.uniforms.sketchWhiteLow = {
				value: CANVAS_SHADER_SETTINGS.nearWhiteThresholdLow
			};
			shader.uniforms.sketchWhiteHigh = {
				value: CANVAS_SHADER_SETTINGS.nearWhiteThresholdHigh
			};
			shader.uniforms.canvasStrength = {
				value: quality === 'low' ? 0.025 : CANVAS_SHADER_SETTINGS.canvasTextureStrength
			};
			shader.uniforms.inkContrast = { value: CANVAS_SHADER_SETTINGS.inkContrast };
			shader.fragmentShader = shader.fragmentShader.replace(
				'uniform vec3 diffuse;',
				`uniform vec3 diffuse;
				uniform float sketchWhiteLow;
				uniform float sketchWhiteHigh;
				uniform float canvasStrength;
				uniform float inkContrast;`
			);
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <map_fragment>',
				`#ifdef USE_MAP
					vec4 sampledDiffuseColor = texture2D(map, vMapUv);
					#ifdef DECODE_VIDEO_TEXTURE
						sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
					#endif
					float sketchLuminance = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
					float inkMask = 1.0 - smoothstep(sketchWhiteLow, sketchWhiteHigh, sketchLuminance);
					inkMask = clamp(inkMask * inkContrast, 0.0, 1.0);
					float warp = sin(vMapUv.x * 1256.0) * 0.5 + sin(vMapUv.y * 1099.0) * 0.5;
					float diagonalThread = sin((vMapUv.x + vMapUv.y) * 413.0) * 0.22;
					float weave = (warp + diagonalThread) * canvasStrength;
					vec3 canvasSurface = vec3(0.90, 0.875, 0.82) + vec3(weave);
					vec3 mountedSketch = mix(canvasSurface, sampledDiffuseColor.rgb, inkMask);
					diffuseColor *= vec4(mountedSketch, sampledDiffuseColor.a);
				#endif`
			);
		};
		material.customProgramCacheKey = () =>
			`sketch-canvas-${mode}-${quality}-${CANVAS_SHADER_SETTINGS.nearWhiteThresholdLow}`;
	}

	return material;
}

function rectangularRing(
	outerWidth: number,
	outerHeight: number,
	innerWidth: number,
	innerHeight: number,
	depth: number,
	bevelSize: number
) {
	const shape = new Shape();
	shape.moveTo(-outerWidth / 2, -outerHeight / 2);
	shape.lineTo(outerWidth / 2, -outerHeight / 2);
	shape.lineTo(outerWidth / 2, outerHeight / 2);
	shape.lineTo(-outerWidth / 2, outerHeight / 2);
	shape.closePath();

	const hole = new Path();
	hole.moveTo(-innerWidth / 2, -innerHeight / 2);
	hole.lineTo(-innerWidth / 2, innerHeight / 2);
	hole.lineTo(innerWidth / 2, innerHeight / 2);
	hole.lineTo(innerWidth / 2, -innerHeight / 2);
	hole.closePath();
	shape.holes.push(hole);

	return new ExtrudeGeometry(shape, {
		depth,
		bevelEnabled: true,
		bevelSegments: 2,
		bevelSize,
		bevelThickness: Math.min(depth * 0.35, 0.045),
		curveSegments: 2
	});
}

export function createBaroqueFrame(frame: FrameDimensions) {
	const group = new Group();
	group.name = 'baroque-frame';

	const outerGeometry = rectangularRing(
		frame.outerWidth,
		frame.outerHeight,
		frame.artWidth + 0.08,
		frame.artHeight + 0.08,
		0.18,
		0.045
	);
	outerGeometry.translate(0, 0, -0.04);
	const outer = new Mesh(outerGeometry, walnut);
	outer.castShadow = true;
	outer.receiveShadow = true;
	group.add(outer);

	const linerGeometry = rectangularRing(
		frame.artWidth + 0.12,
		frame.artHeight + 0.12,
		frame.artWidth,
		frame.artHeight,
		0.055,
		0.012
	);
	linerGeometry.translate(0, 0, 0.12);
	const liner = new Mesh(linerGeometry, restrainedGilt);
	liner.castShadow = true;
	group.add(liner);

	const ornamentGeometry = new BoxGeometry(frame.railWidth * 1.45, frame.railWidth * 1.45, 0.11);
	const insetX = frame.outerWidth / 2 - frame.railWidth * 0.72;
	const insetY = frame.outerHeight / 2 - frame.railWidth * 0.72;
	for (const [x, y, rotation] of [
		[-insetX, insetY, Math.PI / 4],
		[insetX, insetY, -Math.PI / 4],
		[-insetX, -insetY, -Math.PI / 4],
		[insetX, -insetY, Math.PI / 4]
	] as const) {
		const ornament = new Mesh(ornamentGeometry, carvedWalnut);
		ornament.position.set(x, y, 0.12);
		ornament.rotation.z = rotation;
		ornament.scale.set(1, 0.52, 1);
		ornament.castShadow = true;
		group.add(ornament);
	}

	return group;
}

export function createArtworkPlaque(frame: FrameDimensions) {
	const layout = calculatePlaqueLayout(frame);
	const plaque = new Mesh(new BoxGeometry(layout.width, layout.height, 0.065), plaqueBronze);
	plaque.position.set(layout.centerX, layout.centerY, 0.055);
	plaque.castShadow = true;
	plaque.name = 'artwork-plaque';
	return plaque;
}

export function createSoftLightPoolTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 128;
	const context = canvas.getContext('2d');
	if (!context) return null;
	const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
	gradient.addColorStop(0, 'rgba(255, 232, 183, 0.30)');
	gradient.addColorStop(0.5, 'rgba(255, 220, 158, 0.12)');
	gradient.addColorStop(1, 'rgba(255, 210, 140, 0)');
	context.fillStyle = gradient;
	context.fillRect(0, 0, 128, 128);
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	return texture;
}

export function createPlaceholderArtwork(width: number, height: number) {
	const canvas = document.createElement('canvas');
	canvas.width = 384;
	canvas.height = Math.max(256, Math.round((384 * height) / width));
	const context = canvas.getContext('2d');
	if (context) {
		context.fillStyle = '#ddd4c2';
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.strokeStyle = '#a99c84';
		context.lineWidth = 3;
		context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
		context.fillStyle = '#5c5143';
		context.font = '600 20px Georgia, serif';
		context.textAlign = 'center';
		context.fillText('Artwork unavailable', canvas.width / 2, canvas.height / 2);
	}
	const texture = new CanvasTexture(canvas);
	return prepareSketchTexture(texture);
}

export function disposeObjectTree(root: Object3D) {
	root.traverse((object) => {
		const mesh = object as Mesh;
		if (mesh.geometry) mesh.geometry.dispose();
		const materials = Array.isArray(mesh.material)
			? mesh.material
			: mesh.material
				? [mesh.material]
				: [];
		for (const material of materials) {
			for (const value of Object.values(material) as unknown[]) {
				if (value instanceof Texture && value !== sharedNormalMap) value.dispose();
			}
			if (
				material !== walnut &&
				material !== carvedWalnut &&
				material !== restrainedGilt &&
				material !== plaqueBronze
			) {
				material.dispose();
			}
		}
	});
}

export function disposeSharedMuseumMaterials() {
	walnut.dispose();
	carvedWalnut.dispose();
	restrainedGilt.dispose();
	plaqueBronze.dispose();
	sharedNormalMap?.dispose();
	sharedNormalMap = undefined;
}
