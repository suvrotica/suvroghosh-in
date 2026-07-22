import vertexSource from './fullscreen.vert?raw';
import commonSource from './common.glsl?raw';
import skySource from './sky.glsl?raw';
import mainSource from './main.frag?raw';

export const SPACETIME_VERTEX_SOURCE = vertexSource;
export const SPACETIME_FRAGMENT_SOURCE = `#version 300 es\n${commonSource}\n${skySource}\n${mainSource}`;
