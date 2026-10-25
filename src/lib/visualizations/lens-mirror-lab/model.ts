export type EffectId =
	| 'original'
	| 'barrel'
	| 'pincushion'
	| 'moustache'
	| 'fisheye'
	| 'tangential'
	| 'flat'
	| 'convex'
	| 'concave'
	| 'cylindrical'
	| 'funhouse';

export const effects: {
	id: EffectId;
	family: 'lens' | 'mirror' | 'original';
	label: string;
	description: string;
	notice: string;
}[] = [
	{
		id: 'original',
		family: 'original',
		label: 'Original',
		description: 'The prepared source image, with no added distortion.',
		notice: 'Use this view to inspect the source before adding a transformation.'
	},
	{
		id: 'barrel',
		family: 'lens',
		label: 'Barrel distortion',
		description: 'A radial warp that bows straight lines outward.',
		notice: 'Watch a line near the edge: its middle bows away from the centre.'
	},
	{
		id: 'pincushion',
		family: 'lens',
		label: 'Pincushion distortion',
		description: 'A radial warp that pulls straight lines inward.',
		notice: 'Outer grid lines bend towards the centre, opposite to barrel distortion.'
	},
	{
		id: 'moustache',
		family: 'lens',
		label: 'Moustache distortion',
		description: 'A radial warp whose curvature changes between the centre and edges.',
		notice: 'Follow a long grid line through its change in curvature.'
	},
	{
		id: 'fisheye',
		family: 'lens',
		label: 'Equidistant fisheye',
		description: 'An angular projection remapped from the available photograph.',
		notice: 'The view compresses towards the edge. It cannot reveal scenery outside the source.'
	},
	{
		id: 'tangential',
		family: 'lens',
		label: 'Tangential distortion',
		description: 'An asymmetric Brown–Conrady decentring model.',
		notice: 'The grid loses radial symmetry as the two decentring terms move it differently.'
	},
	{
		id: 'flat',
		family: 'mirror',
		label: 'Flat mirror',
		description: 'A horizontal reflection with no added curvature.',
		notice: 'Read the asymmetric lettering: it is reflected exactly once.'
	},
	{
		id: 'convex',
		family: 'mirror',
		label: 'Convex appearance',
		description: 'A compressive 2D approximation of a convex mirror.',
		notice: 'The middle of the image becomes smaller within the curved region.'
	},
	{
		id: 'concave',
		family: 'mirror',
		label: 'Concave appearance',
		description: 'A magnifying 2D approximation of a nearby concave mirror.',
		notice: 'The central region grows. Real concave mirrors also depend on object distance.'
	},
	{
		id: 'cylindrical',
		family: 'mirror',
		label: 'Cylindrical appearance',
		description: 'A 2D mirror approximation curved along one axis.',
		notice: 'Compare horizontal and vertical features: only the selected axis is curved.'
	},
	{
		id: 'funhouse',
		family: 'mirror',
		label: 'Funhouse mirror',
		description: 'A smooth wave displacement across one axis.',
		notice: 'Repeated lines reveal alternating stretching and compression.'
	}
];

export interface Parameters {
	strength: number;
	centerX: number;
	centerY: number;
	radius: number;
	scale: number;
	axis: 'horizontal' | 'vertical';
	wavelength: number;
	phase: number;
	mirror: boolean;
	k1: number;
	k2: number;
	k3: number;
	p1: number;
	p2: number;
	advanced: boolean;
}

export const parameterBounds = {
	strength: [0, 1, 0.01],
	centerX: [0, 1, 0.01],
	centerY: [0, 1, 0.01],
	radius: [0.2, 1.5, 0.01],
	scale: [0.6, 1.5, 0.01],
	wavelength: [0.2, 2, 0.01],
	phase: [0, Math.PI * 2, 0.01],
	k1: [-0.12, 0.12, 0.001],
	k2: [-0.02, 0.02, 0.001],
	k3: [-0.002, 0.002, 0.0001],
	p1: [-0.04, 0.04, 0.001],
	p2: [-0.04, 0.04, 0.001]
} as const;

export function defaultParameters(effect: EffectId = 'barrel'): Parameters {
	return {
		strength: effect === 'flat' || effect === 'original' ? 0 : 0.6,
		centerX: 0.5,
		centerY: 0.5,
		radius: 0.72,
		scale: 1,
		axis: 'horizontal',
		wavelength: 0.8,
		phase: 0,
		mirror: ['flat', 'convex', 'concave', 'cylindrical', 'funhouse'].includes(effect),
		k1: 0,
		k2: 0,
		k3: 0,
		p1: 0.025,
		p2: -0.015,
		advanced: false
	};
}

export function sanitiseParameters(
	input: Partial<Parameters>,
	effect: EffectId = 'barrel'
): Parameters {
	const result = defaultParameters(effect);
	for (const key of Object.keys(parameterBounds) as (keyof typeof parameterBounds)[]) {
		const value = input[key];
		if (typeof value === 'number' && Number.isFinite(value))
			result[key] = Math.min(parameterBounds[key][1], Math.max(parameterBounds[key][0], value));
	}
	result.axis = input.axis === 'vertical' ? 'vertical' : 'horizontal';
	result.mirror = typeof input.mirror === 'boolean' ? input.mirror : result.mirror;
	result.advanced = input.advanced === true;
	return result;
}

/** Forward Brown–Conrady point mapping, used by the advanced inverse solver. */
export function brownConrady(x: number, y: number, p: Parameters): [number, number] {
	const r2 = x * x + y * y;
	const scale = 1 + p.k1 * r2 + p.k2 * r2 * r2 + p.k3 * r2 * r2 * r2;
	return [
		x * scale + 2 * p.p1 * x * y + p.p2 * (r2 + 2 * x * x),
		y * scale + p.p1 * (r2 + 2 * y * y) + 2 * p.p2 * x * y
	];
}

function inverseBrown(x: number, y: number, p: Parameters): [number, number] {
	let sx = x,
		sy = y;
	for (let i = 0; i < 10; i++) {
		const r2 = sx * sx + sy * sy;
		const radial = 1 + p.k1 * r2 + p.k2 * r2 * r2 + p.k3 * r2 * r2 * r2;
		const derivative = p.k1 + 2 * p.k2 * r2 + 3 * p.k3 * r2 * r2;
		const a = radial + 2 * sx * sx * derivative + 2 * p.p1 * sy + 6 * p.p2 * sx;
		const b = 2 * sx * sy * derivative + 2 * p.p1 * sx + 2 * p.p2 * sy;
		const d = radial + 2 * sy * sy * derivative + 6 * p.p1 * sy + 2 * p.p2 * sx;
		const determinant = a * d - b * b;
		if (determinant < 0.08) return [99, 99];
		const [fx, fy] = brownConrady(sx, sy, p);
		const ex = fx - x,
			ey = fy - y;
		sx -= Math.max(-0.3, Math.min(0.3, (d * ex - b * ey) / determinant));
		sy -= Math.max(-0.3, Math.min(0.3, (a * ey - b * ex) / determinant));
	}
	const [fx, fy] = brownConrady(sx, sy, p);
	return Math.hypot(fx - x, fy - y) < 0.002 ? [sx, sy] : [99, 99];
}

/**
 * Reverse lookup: output UV -> source UV. UV origin is top left. Coordinates use
 * half the long image edge as one isotropic unit. Presets use bounded reverse
 * radial maps (not camera calibration coefficients); Advanced uses inversion of
 * the forward Brown–Conrady model. Rejected/non-invertible regions sample outside.
 */
export function mapPoint(
	u: number,
	v: number,
	aspect: number,
	effect: EffectId,
	input: Parameters
): [number, number] {
	if (effect === 'original') return [u, v];
	const p = sanitiseParameters(input, effect);
	const ax = Math.min(1, Math.max(0.0001, aspect));
	const ay = Math.min(1, 1 / Math.max(0.0001, aspect));
	let x = ((u - p.centerX) * 2 * ax) / p.scale;
	let y = ((v - p.centerY) * 2 * ay) / p.scale;
	const r2 = x * x + y * y;
	const t = r2 / (p.radius * p.radius + r2);
	if (p.advanced && ['barrel', 'pincushion', 'moustache', 'tangential'].includes(effect)) {
		[x, y] = inverseBrown(x, y, p);
	} else if (effect === 'barrel') {
		const s = 1 + 0.9 * p.strength * t;
		x *= s;
		y *= s;
	} else if (effect === 'pincushion') {
		const s = 1 / (1 + 0.9 * p.strength * t);
		x *= s;
		y *= s;
	} else if (effect === 'moustache') {
		const s = 1 + 0.85 * p.strength * t * (1 - 1.7 * t);
		x *= s;
		y *= s;
	} else if (effect === 'fisheye') {
		const theta = Math.sqrt(r2) * 0.52;
		const s = theta > 0.00001 ? 1 + p.strength * (Math.tan(Math.min(theta, 1.5)) / theta - 1) : 1;
		x *= s;
		y *= s;
	} else if (effect === 'tangential') {
		[x, y] = inverseBrown(x, y, {
			...p,
			k1: 0,
			k2: 0,
			k3: 0,
			p1: p.p1 * p.strength,
			p2: p.p2 * p.strength
		});
	} else if (effect === 'convex' || effect === 'concave' || effect === 'cylindrical') {
		const s = 1 + 1.2 * p.strength * Math.exp(-r2 / (p.radius * p.radius));
		if (effect === 'concave') {
			x /= s;
			y /= s;
		} else if (effect === 'cylindrical') {
			if (p.axis === 'horizontal') x *= s;
			else y *= s;
		} else {
			x *= s;
			y *= s;
		}
	} else if (effect === 'funhouse') {
		if (p.axis === 'horizontal')
			x += 0.16 * p.strength * Math.sin((2 * Math.PI * y) / p.wavelength + p.phase);
		else y += 0.16 * p.strength * Math.sin((2 * Math.PI * x) / p.wavelength + p.phase);
	}
	let su = x / (2 * ax) + p.centerX;
	const sv = y / (2 * ay) + p.centerY;
	if (p.mirror && ['flat', 'convex', 'concave', 'cylindrical', 'funhouse'].includes(effect))
		su = 1 - su;
	return [su, sv];
}

export const vertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); v_uv = vec2((a_position.x+1.0)*0.5, (1.0-a_position.y)*0.5); }
`;

export const fragmentShader = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform int u_effect;
uniform float u_strength, u_radius, u_scale, u_wavelength, u_phase;
uniform vec2 u_center;
uniform int u_axis;
uniform bool u_mirror, u_advanced, u_sourceGrid, u_referenceGrid;
uniform vec3 u_radial;
uniform vec2 u_tangential;
vec2 brown(vec2 q, vec3 k, vec2 p) {
 float r=dot(q,q); float s=1.0+k.x*r+k.y*r*r+k.z*r*r*r;
 return q*s+vec2(2.0*p.x*q.x*q.y+p.y*(r+2.0*q.x*q.x),p.x*(r+2.0*q.y*q.y)+2.0*p.y*q.x*q.y);
}
vec2 inverseBrown(vec2 target, vec3 k, vec2 p) {
 vec2 q=target;
 for(int i=0;i<10;i++) {
  float r=dot(q,q), s=1.0+k.x*r+k.y*r*r+k.z*r*r*r;
  float d=k.x+2.0*k.y*r+3.0*k.z*r*r;
  float a=s+2.0*q.x*q.x*d+2.0*p.x*q.y+6.0*p.y*q.x;
  float b=2.0*q.x*q.y*d+2.0*p.x*q.x+2.0*p.y*q.y;
  float c=s+2.0*q.y*q.y*d+6.0*p.x*q.y+2.0*p.y*q.x;
  float det=a*c-b*b;
  if(det<0.08) return vec2(99.0);
  vec2 e=brown(q,k,p)-target;
  q-=clamp(vec2(c*e.x-b*e.y,a*e.y-b*e.x)/det,vec2(-0.3),vec2(0.3));
 }
 if(length(brown(q,k,p)-target)>0.002) return vec2(99.0);
 return q;
}
vec2 sourceUV(vec2 uv) {
 if(u_effect==0) return uv;
 float aspect=u_resolution.x/max(u_resolution.y,1.0);
 vec2 aspectScale=vec2(min(1.0,aspect),min(1.0,1.0/aspect));
 vec2 q=(uv-u_center)*2.0*aspectScale/u_scale;
 float r=dot(q,q), t=r/(u_radius*u_radius+r);
 if(u_advanced && u_effect>=1 && u_effect<=5 && u_effect!=4) q=inverseBrown(q,u_radial,u_tangential);
 else if(u_effect==1) q*=1.0+0.9*u_strength*t;
 else if(u_effect==2) q/=1.0+0.9*u_strength*t;
 else if(u_effect==3) q*=1.0+0.85*u_strength*t*(1.0-1.7*t);
 else if(u_effect==4) { float theta=sqrt(r)*0.52; if(theta>0.00001) q*=1.0+u_strength*(tan(min(theta,1.5))/theta-1.0); }
 else if(u_effect==5) q=inverseBrown(q,vec3(0.0),u_tangential*u_strength);
 else if(u_effect>=7 && u_effect<=9) {
  float s=1.0+1.2*u_strength*exp(-r/(u_radius*u_radius));
  if(u_effect==8) q/=s; else if(u_effect==9) { if(u_axis==0) q.x*=s; else q.y*=s; } else q*=s;
 } else if(u_effect==10) {
  if(u_axis==0) q.x+=0.16*u_strength*sin(6.28318530718*q.y/u_wavelength+u_phase);
  else q.y+=0.16*u_strength*sin(6.28318530718*q.x/u_wavelength+u_phase);
 }
 vec2 result=q/(2.0*aspectScale)+u_center;
 if(u_mirror && u_effect>=6) result.x=1.0-result.x;
 return result;
}
float grid(vec2 uv) {
 float aspect=u_resolution.x/max(u_resolution.y,1.0);
 vec2 g=abs(fract(uv*vec2(max(aspect,1.0),max(1.0/aspect,1.0))*10.0+0.5)-0.5);
 return 1.0-smoothstep(0.012,0.025,min(g.x,g.y));
}
void main() {
 vec2 uv=sourceUV(v_uv);
 vec2 cell=floor(v_uv*u_resolution/14.0);
 float checker=mod(cell.x+cell.y,2.0);
 vec3 background=mix(vec3(0.90,0.91,0.88),vec3(0.83,0.85,0.82),checker);
 vec4 colour=vec4(background,1.0);
 if(uv.x>=0.0 && uv.y>=0.0 && uv.x<=1.0 && uv.y<=1.0) {
  vec4 source=texture2D(u_image,uv);
  colour=vec4(mix(background,source.rgb,source.a),1.0);
  if(u_sourceGrid) colour.rgb=mix(colour.rgb,vec3(0.06,0.52,0.43),grid(uv)*0.55);
 }
 if(u_referenceGrid) colour.rgb=mix(colour.rgb,vec3(0.83,0.36,0.12),grid(v_uv)*0.5);
 gl_FragColor=colour;
}
`;
