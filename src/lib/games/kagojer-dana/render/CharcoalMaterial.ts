import * as THREE from 'three';

export interface CharcoalMaterialOptions {
	readonly color: THREE.ColorRepresentation;
	readonly hatchColor?: THREE.ColorRepresentation;
	readonly roughness?: number;
	readonly metalness?: number;
	readonly opacity?: number;
	readonly transparent?: boolean;
	readonly side?: THREE.Side;
	readonly tonalBands?: number;
	readonly quantizeStrength?: number;
	readonly hatchScale?: number;
	readonly hatchStrength?: number;
	readonly distanceEraseStartM?: number;
	readonly distanceEraseEndM?: number;
	readonly seed?: number;
	readonly vertexColors?: boolean;
	readonly depthWrite?: boolean;
}

interface CharcoalUniforms {
	uKdBands: { value: number };
	uKdQuantize: { value: number };
	uKdHatchScale: { value: number };
	uKdHatchStrength: { value: number };
	uKdHatchColor: { value: THREE.Color };
	uKdEraseStart: { value: number };
	uKdEraseEnd: { value: number };
	uKdSeed: { value: number };
	uKdBoil: { value: number };
}

const COMPILED_UNIFORMS = new WeakMap<THREE.Material, CharcoalUniforms>();

const VERTEX_DECLARATIONS = /* glsl */ `
	varying vec3 vKdWorldPosition;
	varying vec3 vKdWorldNormal;
`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
	varying vec3 vKdWorldPosition;
	varying vec3 vKdWorldNormal;
	uniform float uKdBands;
	uniform float uKdQuantize;
	uniform float uKdHatchScale;
	uniform float uKdHatchStrength;
	uniform vec3 uKdHatchColor;
	uniform float uKdEraseStart;
	uniform float uKdEraseEnd;
	uniform float uKdSeed;
	uniform float uKdBoil;

	float kdInkStroke(float coordinate, float phase) {
		float wave = abs(fract(coordinate + phase) - 0.5);
		float width = max(fwidth(coordinate) * 0.75, 0.012);
		return 1.0 - smoothstep(0.035 - width, 0.035 + width, wave);
	}

	float kdSurfaceHatch(vec3 worldPosition, vec3 worldNormal, float darkness) {
		vec3 weight = pow(abs(normalize(worldNormal)), vec3(5.0));
		weight /= max(weight.x + weight.y + weight.z, 0.0001);
		float scale = max(0.08, uKdHatchScale);
		float xy = kdInkStroke((worldPosition.x + worldPosition.y * 0.31) * scale, uKdSeed);
		float yz = kdInkStroke((worldPosition.y + worldPosition.z * 0.29) * scale, uKdSeed * 1.73);
		float xz = kdInkStroke((worldPosition.x - worldPosition.z * 0.37) * scale, uKdSeed * 2.17);
		float primary = xy * weight.z + yz * weight.x + xz * weight.y;
		float crossXy = kdInkStroke((worldPosition.x - worldPosition.y * 0.47) * scale * 0.83, uKdSeed * 0.63);
		float crossYz = kdInkStroke((worldPosition.y - worldPosition.z * 0.43) * scale * 0.83, uKdSeed * 1.31);
		float crossXz = kdInkStroke((worldPosition.x + worldPosition.z * 0.41) * scale * 0.83, uKdSeed * 1.91);
		float secondary = crossXy * weight.z + crossYz * weight.x + crossXz * weight.y;
		return primary * smoothstep(0.22, 0.7, darkness) + secondary * smoothstep(0.58, 0.94, darkness);
	}
`;

const CHARCOAL_FRAGMENT = /* glsl */ `
	float kdLuminance = max(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)), 0.0001);
	float kdBands = max(2.0, uKdBands);
	float kdClampedLight = clamp(kdLuminance, 0.0, 1.25);
	float kdQuantizedLight = floor(kdClampedLight * kdBands + 0.5) / kdBands;
	float kdRatio = kdQuantizedLight / kdLuminance;
	outgoingLight *= mix(1.0, kdRatio, clamp(uKdQuantize, 0.0, 1.0));
	float kdDarkness = 1.0 - clamp(kdQuantizedLight, 0.0, 1.0);
	float kdDistance = distance(cameraPosition, vKdWorldPosition);
	float kdDistanceErase = 1.0 - smoothstep(uKdEraseStart, max(uKdEraseStart + 1.0, uKdEraseEnd), kdDistance);
	float kdHatch = kdSurfaceHatch(vKdWorldPosition, vKdWorldNormal, kdDarkness);
	float kdBoilModulation = 1.0 + uKdBoil * 0.025;
	float kdInkAmount = clamp(kdHatch * uKdHatchStrength * kdDistanceErase * kdBoilModulation, 0.0, 0.78);
	outgoingLight = mix(outgoingLight, uKdHatchColor, kdInkAmount);
`;

/**
 * A restrained surface shader: lighting is banded and cross-hatching is tied
 * to world coordinates, so the marks remain attached when the camera moves.
 */
export function createCharcoalMaterial(
	options: CharcoalMaterialOptions
): THREE.MeshStandardMaterial {
	const material = new THREE.MeshStandardMaterial({
		color: options.color,
		roughness: options.roughness ?? 0.9,
		metalness: options.metalness ?? 0.015,
		opacity: options.opacity ?? 1,
		transparent: options.transparent ?? (options.opacity ?? 1) < 1,
		side: options.side ?? THREE.FrontSide,
		vertexColors: options.vertexColors ?? false,
		depthWrite: options.depthWrite ?? true
	});
	const uniforms: CharcoalUniforms = {
		uKdBands: { value: Math.max(4, Math.min(6, Math.round(options.tonalBands ?? 5))) },
		uKdQuantize: { value: options.quantizeStrength ?? 0.72 },
		uKdHatchScale: { value: options.hatchScale ?? 2.2 },
		uKdHatchStrength: { value: options.hatchStrength ?? 0.48 },
		uKdHatchColor: { value: new THREE.Color(options.hatchColor ?? '#242423') },
		uKdEraseStart: { value: options.distanceEraseStartM ?? 90 },
		uKdEraseEnd: { value: options.distanceEraseEndM ?? 360 },
		uKdSeed: { value: ((options.seed ?? 0) % 997) / 997 },
		uKdBoil: { value: 0 }
	};
	COMPILED_UNIFORMS.set(material, uniforms);
	material.userData.kagojerDanaCharcoal = true;
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>\n${VERTEX_DECLARATIONS}`)
			.replace(
				'#include <worldpos_vertex>',
				`#include <worldpos_vertex>
				vec4 kdWorldPosition = vec4(transformed, 1.0);
				#ifdef USE_BATCHING
					kdWorldPosition = batchingMatrix * kdWorldPosition;
				#endif
				#ifdef USE_INSTANCING
					kdWorldPosition = instanceMatrix * kdWorldPosition;
				#endif
				kdWorldPosition = modelMatrix * kdWorldPosition;
				vKdWorldPosition = kdWorldPosition.xyz;
				vKdWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);`
			);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATIONS}`)
			.replace('#include <opaque_fragment>', `${CHARCOAL_FRAGMENT}\n#include <opaque_fragment>`);
	};
	material.customProgramCacheKey = () => 'kagojer-dana-charcoal-v1';
	return material;
}

/**
 * The imperfection changes only at 7 Hz and modulates ink density—not hatch
 * coordinates—so paused frames remain stable and lines never swim over forms.
 */
export function updateCharcoalMaterial(
	material: THREE.Material,
	elapsedSeconds: number,
	calmCamera = false
): void {
	const uniforms = COMPILED_UNIFORMS.get(material);
	if (!uniforms) return;
	if (calmCamera) {
		uniforms.uKdBoil.value = 0;
		return;
	}
	const frame = Math.floor(Math.max(0, elapsedSeconds) * 7);
	uniforms.uKdBoil.value = Math.sin(frame * 12.9898 + uniforms.uKdSeed.value * 78.233) * 0.5;
}

export function setCharcoalDistanceErase(
	material: THREE.Material,
	startM: number,
	endM: number
): void {
	const uniforms = COMPILED_UNIFORMS.get(material);
	if (!uniforms) return;
	uniforms.uKdEraseStart.value = Math.max(0, startM);
	uniforms.uKdEraseEnd.value = Math.max(startM + 1, endM);
}
