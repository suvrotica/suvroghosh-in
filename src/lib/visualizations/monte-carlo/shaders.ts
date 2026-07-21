export const fieldVertexShader = `#version 300 es
precision highp float;

out vec2 v_coordinate;

void main() {
	vec2 positions[3] = vec2[3](
		vec2(-1.0, -1.0),
		vec2(3.0, -1.0),
		vec2(-1.0, 3.0)
	);
	vec2 position = positions[gl_VertexID];
	v_coordinate = position;
	gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const fieldFragmentShader = `#version 300 es
precision highp float;

in vec2 v_coordinate;
out vec4 out_colour;

uniform int u_pass;
uniform bool u_show_grid;
uniform bool u_show_circle;
uniform vec3 u_background;
uniform vec3 u_field;
uniform vec3 u_grid;
uniform vec3 u_axis;
uniform vec3 u_boundary;

float lineAt(float distanceFromLine, float width) {
	return 1.0 - smoothstep(width, width * 2.2, distanceFromLine);
}

void main() {
	vec2 coordinate = v_coordinate;
	vec2 derivative = fwidth(coordinate);
	float pixel = max(derivative.x, derivative.y);
	float circleDistance = abs(length(coordinate) - 1.0);
	float circleLine = lineAt(circleDistance, pixel * 1.35);
	float frameDistance = min(abs(abs(coordinate.x) - 1.0), abs(abs(coordinate.y) - 1.0));
	float frameLine = lineAt(frameDistance, pixel * 1.2);

	if (u_pass == 1) {
		float boundary = max(frameLine, u_show_circle ? circleLine : 0.0);
		if (boundary < 0.01) discard;
		out_colour = vec4(u_boundary, boundary * 0.96);
		return;
	}

	float vignette = smoothstep(1.55, 0.25, length(coordinate));
	vec3 colour = mix(u_background, u_field, 0.82 + 0.12 * vignette);

	if (u_show_grid) {
		vec2 gridPosition = abs(fract((coordinate + 0.125) / 0.25) - 0.5) * 0.25;
		float gridDistance = min(gridPosition.x, gridPosition.y);
		float gridLine = lineAt(gridDistance, pixel * 0.48);
		float axisDistance = min(abs(coordinate.x), abs(coordinate.y));
		float axisLine = lineAt(axisDistance, pixel * 0.72);
		colour = mix(colour, u_grid, gridLine * 0.28);
		colour = mix(colour, u_axis, axisLine * 0.48);
	}

	out_colour = vec4(colour, 1.0);
}
`;

export const pointVertexShader = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in float a_inside;

uniform float u_point_size;

flat out float v_inside;

void main() {
	gl_Position = vec4(a_position, 0.0, 1.0);
	gl_PointSize = u_point_size;
	v_inside = a_inside;
}
`;

export const pointFragmentShader = `#version 300 es
precision highp float;

flat in float v_inside;
out vec4 out_colour;

uniform bool u_show_outside;
uniform float u_opacity;
uniform vec3 u_inside_colour;
uniform vec3 u_outside_colour;

void main() {
	bool inside = v_inside > 0.5;
	if (!inside && !u_show_outside) discard;

	vec2 centred = gl_PointCoord - vec2(0.5);
	float radialDistance = length(centred);
	float diamondDistance = abs(centred.x) + abs(centred.y);
	float signedDistance = inside ? radialDistance : diamondDistance * 0.76;
	float alpha = 1.0 - smoothstep(0.36, 0.5, signedDistance);
	float core = 1.0 - smoothstep(0.0, 0.32, radialDistance);
	vec3 colour = inside ? u_inside_colour : u_outside_colour;
	float shapeOpacity = inside ? 1.0 : 0.72;

	out_colour = vec4(colour + core * 0.08, alpha * u_opacity * shapeOpacity);
}
`;
