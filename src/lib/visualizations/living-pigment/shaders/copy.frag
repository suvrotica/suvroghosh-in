#version 300 es

precision highp float;

in vec2 v_uv;
layout(location = 0) out vec4 out_mobile;
layout(location = 1) out vec4 out_deposit;
layout(location = 2) out vec4 out_flow;

uniform sampler2D u_mobile;
uniform sampler2D u_deposit;
uniform sampler2D u_flow;

void main() {
	out_mobile = texture(u_mobile, v_uv);
	out_deposit = texture(u_deposit, v_uv);
	out_flow = texture(u_flow, v_uv);
}
