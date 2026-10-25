import { effects, fragmentShader, vertexShader, type EffectId, type Parameters } from './model';

export interface RenderOptions {
	effect: EffectId;
	parameters: Parameters;
	sourceGrid: boolean;
	referenceGrid: boolean;
}

export function createRenderer(canvas: HTMLCanvasElement) {
	if (new URLSearchParams(window.location.search).get('webgl') === 'off') {
		throw new Error(
			'WebGL is unavailable in this preview. The static comparison and article remain available.'
		);
	}
	const gl = canvas.getContext('webgl', {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		premultipliedAlpha: false,
		preserveDrawingBuffer: true,
		powerPreference: 'low-power'
	});
	if (!gl)
		throw new Error('WebGL is unavailable. The static comparison and article remain available.');
	const shaders: WebGLShader[] = [];
	let program: WebGLProgram | null = null;
	let buffer: WebGLBuffer | null = null;
	let texture: WebGLTexture | null = null;
	let disposed = false;
	function dispose() {
		if (disposed) return;
		disposed = true;
		if (texture) gl!.deleteTexture(texture);
		if (buffer) gl!.deleteBuffer(buffer);
		if (program) gl!.deleteProgram(program);
		for (const shader of shaders) gl!.deleteShader(shader);
		gl!.getExtension('WEBGL_lose_context')?.loseContext();
	}
	try {
		for (const [type, source] of [
			[gl.VERTEX_SHADER, vertexShader],
			[gl.FRAGMENT_SHADER, fragmentShader]
		] as const) {
			const shader = gl.createShader(type);
			if (!shader) throw new Error('The browser could not create a shader.');
			shaders.push(shader);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
				throw new Error('The distortion shader could not compile.');
		}
		program = gl.createProgram();
		if (!program) throw new Error('The browser could not create a shader program.');
		for (const shader of shaders) gl.attachShader(program, shader);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			throw new Error('The distortion shader could not link.');
		gl.useProgram(program);
		buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
			gl.STATIC_DRAW
		);
		const position = gl.getAttribLocation(program, 'a_position');
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		texture = gl.createTexture();
		if (!texture) throw new Error('The browser could not allocate an image texture.');
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		const uniform = (name: string) => gl.getUniformLocation(program!, name);
		const uniforms = Object.fromEntries(
			[
				'image',
				'resolution',
				'effect',
				'strength',
				'radius',
				'scale',
				'wavelength',
				'phase',
				'center',
				'axis',
				'mirror',
				'advanced',
				'sourceGrid',
				'referenceGrid',
				'radial',
				'tangential'
			].map((name) => [name, uniform(`u_${name}`)])
		);
		return {
			maxTextureSize: Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number),
			setSource(source: HTMLCanvasElement) {
				if (disposed) return;
				const candidate = gl.createTexture();
				if (!candidate) throw new Error('The graphics device could not allocate this image.');
				gl.bindTexture(gl.TEXTURE_2D, candidate);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
				gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
				try {
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
					if (gl.getError() !== gl.NO_ERROR) throw new Error('Texture allocation failed.');
				} catch {
					gl.deleteTexture(candidate);
					gl.bindTexture(gl.TEXTURE_2D, texture);
					throw new Error('The graphics device could not load this image. Try a smaller image.');
				}
				if (texture) gl.deleteTexture(texture);
				texture = candidate;
				canvas.width = source.width;
				canvas.height = source.height;
			},
			draw({ effect, parameters: p, sourceGrid, referenceGrid }: RenderOptions) {
				if (disposed || gl.isContextLost()) return;
				gl.viewport(0, 0, canvas.width, canvas.height);
				gl.useProgram(program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.uniform1i(uniforms.image, 0);
				gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
				gl.uniform1i(
					uniforms.effect,
					effects.findIndex((item) => item.id === effect)
				);
				for (const name of ['strength', 'radius', 'scale', 'wavelength', 'phase'] as const)
					gl.uniform1f(uniforms[name], p[name]);
				gl.uniform2f(uniforms.center, p.centerX, p.centerY);
				gl.uniform1i(uniforms.axis, p.axis === 'horizontal' ? 0 : 1);
				gl.uniform1i(uniforms.mirror, p.mirror ? 1 : 0);
				gl.uniform1i(uniforms.advanced, p.advanced ? 1 : 0);
				gl.uniform1i(uniforms.sourceGrid, sourceGrid ? 1 : 0);
				gl.uniform1i(uniforms.referenceGrid, referenceGrid ? 1 : 0);
				gl.uniform3f(uniforms.radial, p.k1, p.k2, p.k3);
				gl.uniform2f(uniforms.tangential, p.p1, p.p2);
				gl.drawArrays(gl.TRIANGLES, 0, 6);
			},
			dispose
		};
	} catch (error) {
		dispose();
		throw error;
	}
}
