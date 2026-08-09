import { describe, expect, it } from 'vitest';
import {
	eventFragmentShader,
	eventVertexShader,
	trajectoryLineFragmentShader,
	trajectoryPointFragmentShader,
	trajectoryVertexShader
} from './shader-sources';

const allSources = [
	trajectoryVertexShader,
	trajectoryLineFragmentShader,
	trajectoryPointFragmentShader,
	eventVertexShader,
	eventFragmentShader
];

describe('orchestra WebGL2 shader source invariants', () => {
	it('uses explicit WebGL2 shaders and high precision throughout', () => {
		for (const source of allSources) {
			expect(source).toMatch(/^#version 300 es/u);
			expect(source).toMatch(/precision highp float;/u);
		}
		expect(trajectoryVertexShader).toMatch(/layout\(location = 0\) in vec3 a_position01/u);
		expect(eventVertexShader).toMatch(/layout\(location = 1\) in vec4 a_eventMeta/u);
	});

	it('declares every fragment varying it consumes and links it to a vertex output', () => {
		for (const [vertex, fragment] of [
			[trajectoryVertexShader, trajectoryLineFragmentShader],
			[trajectoryVertexShader, trajectoryPointFragmentShader],
			[eventVertexShader, eventFragmentShader]
		]) {
			const vertexOutputs = new Set(
				[...vertex.matchAll(/\bout\s+\w+\s+(v_\w+)\s*;/gu)].map((match) => match[1])
			);
			const fragmentInputs = new Set(
				[...fragment.matchAll(/\bin\s+\w+\s+(v_\w+)\s*;/gu)].map((match) => match[1])
			);
			const fragmentVaryings = new Set(
				[...fragment.matchAll(/\b(v_\w+)\b/gu)].map((match) => match[1])
			);
			for (const varying of fragmentVaryings) {
				expect(fragmentInputs, `${varying} must be declared as a fragment input`).toContain(
					varying
				);
				expect(vertexOutputs, `${varying} must be written by the vertex shader`).toContain(varying);
			}
		}
	});

	it('derives opacity from stable trajectory age rather than a frame clock', () => {
		expect(trajectoryVertexShader).toContain('v_age01');
		expect(trajectoryLineFragmentShader).toMatch(/ageOpacity[\s\S]*v_age01/u);
		expect(trajectoryPointFragmentShader).toMatch(/ageOpacity[\s\S]*v_age01/u);
	});

	it('encodes restrained noise colour and curvature highlights', () => {
		for (const source of [trajectoryLineFragmentShader, trajectoryPointFragmentShader]) {
			expect(source).toContain('restrainedMineralColour');
			expect(source).toContain('smokyIndigo');
			expect(source).toContain('oxidizedCopper');
			expect(source).toContain('mineralCyan');
			expect(source).toMatch(/curvature01/u);
			expect(source).not.toMatch(/hsv|rainbow|spectr/iu);
		}
	});

	it('gives density, recurrence, and region distinct visual channels', () => {
		expect(trajectoryVertexShader).toMatch(/v_density01[\s\S]*hazeSize/u);
		expect(trajectoryPointFragmentShader).toMatch(/float haze[\s\S]*v_density01/u);
		expect(trajectoryPointFragmentShader).toMatch(/recurrenceRing[\s\S]*v_recurrence01/u);
		expect(trajectoryPointFragmentShader).toMatch(/regionShape/u);
		expect(trajectoryPointFragmentShader).toMatch(/circleDistance/u);
		expect(trajectoryPointFragmentShader).toMatch(/diamondDistance/u);
		expect(trajectoryPointFragmentShader).toMatch(/squareDistance/u);
		expect(trajectoryLineFragmentShader).toMatch(/regionPattern/u);
	});

	it('caps point and pulse sizes in shader space', () => {
		expect(trajectoryVertexShader).toMatch(/gl_PointSize = clamp\([\s\S]*1\.0, 38\.0\)/u);
		expect(eventVertexShader).toMatch(/gl_PointSize = clamp\([\s\S]*5\.0,[\s\S]*54\.0/u);
		expect(trajectoryVertexShader).toMatch(/u_sampleStride/u);
	});

	it('implements a bounded Wake pass from curl features and packet simulation time', () => {
		expect(trajectoryVertexShader).toContain('u_wakePass');
		expect(trajectoryVertexShader).toContain('u_simulationPhase');
		expect(trajectoryVertexShader).toContain('v_curlAngle01');
		expect(trajectoryVertexShader).toMatch(/wakeDirection[\s\S]*v_curlAngle01/u);
		expect(trajectoryVertexShader).toContain('wakeDirection');
		expect(trajectoryVertexShader).toContain('wakeReach');
		expect(trajectoryVertexShader).toMatch(/gl_VertexID[\s\S]*u_sampleStride/u);
		expect(trajectoryPointFragmentShader).toContain('wakeSpeck');
		expect(trajectoryPointFragmentShader).toContain('wakeLife');
		expect(trajectoryPointFragmentShader).toMatch(/in float v_wakeAge01;/u);
		expect(trajectoryLineFragmentShader).not.toMatch(/in float v_wakeAge01;/u);
		expect(trajectoryPointFragmentShader).toContain('weatherActivation');
	});

	it('uses packet simulation phase for subtle weather modulation while preserving raw marks', () => {
		expect(trajectoryVertexShader).toMatch(/v_weatherPhase01[\s\S]*u_simulationPhase/u);
		expect(trajectoryLineFragmentShader).toMatch(
			/transformed \*= mix\(0\.92, 1\.06, v_weatherPhase01\)[\s\S]*mix\(transformed, raw, u_rawPass\)/u
		);
		expect(trajectoryPointFragmentShader).toMatch(
			/weatherColour[\s\S]*v_weatherPhase01[\s\S]*rawColour[\s\S]*mix\(weatherColour, rawColour, u_rawPass\)/u
		);
	});

	it('renders local event causes as bounded, decaying shapes', () => {
		expect(eventVertexShader).toContain('v_cause');
		expect(eventFragmentShader).toContain('causeShape');
		expect(eventFragmentShader).toMatch(/ring[\s\S]*doubleRing[\s\S]*crossMark[\s\S]*diamond/u);
		expect(eventFragmentShader).toMatch(/1\.0 - v_progress01/u);
		expect(eventFragmentShader).toMatch(/v_intensity01/u);
	});

	it('contains no wall-clock, randomness, audio-analysis, or scientific feedback input', () => {
		for (const source of allSources) {
			expect(source).not.toMatch(/u_time|Date|performance|requestAnimationFrame/iu);
			expect(source).not.toMatch(/random|sampler|texture\s*\(/iu);
			expect(source).not.toMatch(/audio|fft|spectrum|loudness/iu);
			expect(source).not.toMatch(/integration|derivative|trajectoryStep|score/iu);
		}
	});
});
