import * as THREE from 'three';
import type { WorldQualityTier } from '../world/AssetGrammar';

const DPR_CAP: Readonly<Record<WorldQualityTier, number>> = {
	high: 1.5,
	balanced: 1.25,
	battery: 1
};

const CONTOUR_WIDTH: Readonly<Record<WorldQualityTier, number>> = {
	high: 1.35,
	balanced: 1,
	battery: 0.7
};

export interface CharcoalPipelineMetrics {
	readonly drawCalls: number;
	readonly triangles: number;
}

const COMPOSITE_VERTEX = /* glsl */ `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = vec4(position.xy, 0.0, 1.0);
	}
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
	#include <common>
	uniform sampler2D tColor;
	uniform sampler2D tNormal;
	uniform sampler2D tDepth;
	uniform vec2 uPixel;
	uniform float uLineWidth;
	uniform float uGrain;
	uniform vec3 uInk;
	varying vec2 vUv;

	float depthAt(vec2 uv) {
		return texture2D(tDepth, clamp(uv, vec2(0.0), vec2(1.0))).x;
	}

	vec3 normalAt(vec2 uv) {
		return texture2D(tNormal, clamp(uv, vec2(0.0), vec2(1.0))).xyz * 2.0 - 1.0;
	}

	float paperNoise(vec2 p) {
		return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453);
	}

	void main() {
		vec2 stepSize = uPixel * clamp(uLineWidth, 0.7, 2.5);
		float centreDepth = depthAt(vUv);
		float depthDifference = 0.0;
		float normalDifference = 0.0;
		vec3 centreNormal = normalAt(vUv);
		vec2 offsets[4];
		offsets[0] = vec2(stepSize.x, 0.0);
		offsets[1] = vec2(-stepSize.x, 0.0);
		offsets[2] = vec2(0.0, stepSize.y);
		offsets[3] = vec2(0.0, -stepSize.y);
		for (int index = 0; index < 4; index++) {
			float nearbyDepth = depthAt(vUv + offsets[index]);
			depthDifference = max(depthDifference, abs(centreDepth - nearbyDepth));
			normalDifference = max(normalDifference, length(centreNormal - normalAt(vUv + offsets[index])));
		}
		float exterior = smoothstep(0.00032, 0.0024, depthDifference);
		float internal = smoothstep(0.31, 0.84, normalDifference) * 0.56;
		float contour = clamp(max(exterior, internal), 0.0, 0.9);
		vec3 color = texture2D(tColor, vUv).rgb;
		color = mix(color, uInk, contour);
		float grain = (paperNoise(gl_FragCoord.xy * 0.68) - 0.5) * uGrain;
		gl_FragColor = vec4(color + grain, 1.0);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/**
 * Optional depth-and-normal contour pass. Battery quality bypasses it entirely;
 * surface hatching still comes from CharcoalMaterial.
 */
export class CharcoalPipeline {
	private readonly colorTarget: THREE.WebGLRenderTarget;
	private readonly normalTarget: THREE.WebGLRenderTarget;
	private readonly normalMaterial = new THREE.MeshNormalMaterial();
	private readonly compositeScene = new THREE.Scene();
	private readonly compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private readonly compositeGeometry = new THREE.PlaneGeometry(2, 2);
	private readonly compositeMaterial: THREE.ShaderMaterial;
	private readonly compositeQuad: THREE.Mesh;
	private quality: WorldQualityTier;
	private width = 1;
	private height = 1;
	private pixelRatio = 1;
	private readonly metrics = { drawCalls: 0, triangles: 0 };
	private disposed = false;

	constructor(quality: WorldQualityTier = 'balanced') {
		this.quality = quality;
		const depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
		depthTexture.format = THREE.DepthFormat;
		this.colorTarget = new THREE.WebGLRenderTarget(1, 1, {
			depthBuffer: true,
			stencilBuffer: false,
			depthTexture
		});
		this.colorTarget.texture.colorSpace = THREE.SRGBColorSpace;
		this.normalTarget = new THREE.WebGLRenderTarget(1, 1, {
			depthBuffer: true,
			stencilBuffer: false
		});
		this.compositeMaterial = new THREE.ShaderMaterial({
			name: 'KagojerDanaCharcoalComposite',
			vertexShader: COMPOSITE_VERTEX,
			fragmentShader: COMPOSITE_FRAGMENT,
			uniforms: {
				tColor: { value: this.colorTarget.texture },
				tNormal: { value: this.normalTarget.texture },
				tDepth: { value: depthTexture },
				uPixel: { value: new THREE.Vector2(1, 1) },
				uLineWidth: { value: CONTOUR_WIDTH[quality] },
				uGrain: { value: quality === 'high' ? 0.022 : 0.014 },
				uInk: { value: new THREE.Color('#202323') }
			},
			depthTest: false,
			depthWrite: false,
			toneMapped: true
		});
		this.compositeQuad = new THREE.Mesh(this.compositeGeometry, this.compositeMaterial);
		this.compositeQuad.frustumCulled = false;
		this.compositeScene.add(this.compositeQuad);
	}

	setQuality(quality: WorldQualityTier): void {
		if (this.disposed || quality === this.quality) return;
		this.quality = quality;
		this.compositeMaterial.uniforms.uLineWidth.value = CONTOUR_WIDTH[quality];
		this.compositeMaterial.uniforms.uGrain.value = quality === 'high' ? 0.022 : 0.014;
		this.resize(this.width, this.height, this.pixelRatio);
	}

	resize(width: number, height: number, devicePixelRatio = 1): void {
		if (this.disposed) return;
		this.width = Math.max(1, Math.round(width));
		this.height = Math.max(1, Math.round(height));
		this.pixelRatio = Math.max(0.5, Math.min(DPR_CAP[this.quality], devicePixelRatio));
		const targetWidth = Math.max(1, Math.round(this.width * this.pixelRatio));
		const targetHeight = Math.max(1, Math.round(this.height * this.pixelRatio));
		this.colorTarget.setSize(targetWidth, targetHeight);
		this.normalTarget.setSize(targetWidth, targetHeight);
		(this.colorTarget.depthTexture as THREE.DepthTexture).image.width = targetWidth;
		(this.colorTarget.depthTexture as THREE.DepthTexture).image.height = targetHeight;
		this.compositeMaterial.uniforms.uPixel.value.set(1 / targetWidth, 1 / targetHeight);
	}

	render(
		renderer: THREE.WebGLRenderer,
		scene: THREE.Scene,
		camera: THREE.Camera
	): CharcoalPipelineMetrics {
		if (this.disposed) {
			this.metrics.drawCalls = 0;
			this.metrics.triangles = 0;
			return this.metrics;
		}
		if (this.quality === 'battery') {
			renderer.render(scene, camera);
			this.metrics.drawCalls = renderer.info.render.calls;
			this.metrics.triangles = renderer.info.render.triangles;
			return this.metrics;
		}

		let drawCalls = 0;
		let triangles = 0;
		const previousTarget = renderer.getRenderTarget();
		const previousOverride = scene.overrideMaterial;
		const previousAutoClear = renderer.autoClear;
		renderer.autoClear = true;
		try {
			renderer.setRenderTarget(this.colorTarget);
			renderer.clear();
			renderer.render(scene, camera);
			drawCalls += renderer.info.render.calls;
			triangles += renderer.info.render.triangles;

			scene.overrideMaterial = this.normalMaterial;
			renderer.setRenderTarget(this.normalTarget);
			renderer.clear();
			renderer.render(scene, camera);
			drawCalls += renderer.info.render.calls;
			triangles += renderer.info.render.triangles;

			scene.overrideMaterial = previousOverride;
			renderer.setRenderTarget(previousTarget);
			renderer.clear();
			renderer.render(this.compositeScene, this.compositeCamera);
			drawCalls += renderer.info.render.calls;
			triangles += renderer.info.render.triangles;
		} finally {
			scene.overrideMaterial = previousOverride;
			renderer.setRenderTarget(previousTarget);
			renderer.autoClear = previousAutoClear;
		}
		this.metrics.drawCalls = drawCalls;
		this.metrics.triangles = triangles;
		return this.metrics;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.compositeScene.clear();
		this.colorTarget.dispose();
		this.normalTarget.dispose();
		this.normalMaterial.dispose();
		this.compositeMaterial.dispose();
		this.compositeGeometry.dispose();
	}
}
