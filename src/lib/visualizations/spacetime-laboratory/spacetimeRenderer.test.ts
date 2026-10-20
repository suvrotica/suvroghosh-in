import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpacetimeRenderer } from './spacetimeRenderer';

const COMPLETION_STATUS_KHR = 0x91b1;
const LINK_STATUS = 0x8b82;
const ACTIVE_UNIFORMS = 0x8b86;

function rendererFixture({ parallel = true, linked = true } = {}) {
	let complete = false;
	let lost = false;
	const calls: string[] = [];
	const onError = vi.fn();
	const onStatus = vi.fn();
	const deleteShader = vi.fn();
	const deleteProgram = vi.fn();
	const deleteBuffer = vi.fn();
	const deleteVertexArray = vi.fn();
	const loseContext = vi.fn(() => {
		lost = true;
	});
	const getShaderParameter = vi.fn(() => {
		throw new Error('An early compile-status query would block the main thread.');
	});
	const context = {
		VERTEX_SHADER: 0x8b31,
		FRAGMENT_SHADER: 0x8b30,
		LINK_STATUS,
		ACTIVE_UNIFORMS,
		ARRAY_BUFFER: 0x8892,
		STATIC_DRAW: 0x88e4,
		FLOAT: 0x1406,
		getExtension: vi.fn((name: string) =>
			name === 'KHR_parallel_shader_compile'
				? parallel
					? { COMPLETION_STATUS_KHR }
					: null
				: name === 'WEBGL_lose_context'
					? { loseContext }
					: null
		),
		isContextLost: vi.fn(() => lost),
		createShader: vi.fn((type: number) => ({ type })),
		shaderSource: vi.fn(),
		compileShader: vi.fn((shader: { type: number }) => {
			calls.push(`compile:${shader.type}`);
		}),
		getShaderParameter,
		getShaderInfoLog: vi.fn((shader: { type: number }) => `Shader ${shader.type} diagnostic`),
		createProgram: vi.fn(() => ({})),
		attachShader: vi.fn(),
		linkProgram: vi.fn(() => {
			calls.push('link');
		}),
		getProgramParameter: vi.fn((_program: unknown, name: number) => {
			if (name === COMPLETION_STATUS_KHR) {
				calls.push('completion');
				// Khronos specifies that completion becomes true on context loss.
				return complete || lost;
			}
			if (name === LINK_STATUS) {
				calls.push('link-status');
				return linked;
			}
			if (name === ACTIVE_UNIFORMS) return 0;
			throw new Error(`Unexpected program query ${name}`);
		}),
		getProgramInfoLog: vi.fn(() => 'Program link diagnostic'),
		createVertexArray: vi.fn(() => ({})),
		createBuffer: vi.fn(() => ({})),
		bindVertexArray: vi.fn(),
		bindBuffer: vi.fn(),
		bufferData: vi.fn(),
		getAttribLocation: vi.fn(() => 0),
		enableVertexAttribArray: vi.fn(),
		vertexAttribPointer: vi.fn(),
		deleteShader,
		deleteProgram,
		deleteBuffer,
		deleteVertexArray
	};
	const canvas = {
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		getContext: vi.fn(() => context)
	} as unknown as HTMLCanvasElement;
	return {
		renderer: new SpacetimeRenderer(canvas, { onError, onStatus }),
		context,
		calls,
		onError,
		onStatus,
		loseContext,
		finish: () => {
			complete = true;
		},
		lose: () => {
			lost = true;
		}
	};
}

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe('spacetime shader initialization', () => {
	it('submits both compiles and link, then waits for KHR completion before reading link status', async () => {
		vi.useFakeTimers();
		const fixture = rendererFixture();
		const initializing = fixture.renderer.init('vertex', 'fragment');
		expect(fixture.calls.slice(0, 3)).toEqual(['compile:35633', 'compile:35632', 'link']);
		expect(fixture.calls).not.toContain('link-status');
		expect(fixture.renderer.ready).toBe(false);
		await vi.advanceTimersByTimeAsync(32);
		expect(fixture.calls).not.toContain('link-status');
		fixture.finish();
		await vi.advanceTimersByTimeAsync(16);
		expect(await initializing).toBe(true);
		expect(fixture.renderer.ready).toBe(true);
		expect(fixture.calls.at(-1)).toBe('link-status');
		expect(fixture.context.getShaderParameter).not.toHaveBeenCalled();
		expect(fixture.onError).not.toHaveBeenCalled();
		expect(fixture.context.deleteShader).toHaveBeenCalledTimes(2);
		fixture.renderer.destroy();
		expect(fixture.context.deleteProgram).toHaveBeenCalledTimes(1);
	});

	it('yields before the synchronous link check when KHR is unavailable', async () => {
		vi.useFakeTimers();
		const fixture = rendererFixture({ parallel: false });
		const initializing = fixture.renderer.init('vertex', 'fragment');
		expect(fixture.renderer.ready).toBe(false);
		expect(fixture.calls).not.toContain('link-status');
		await vi.advanceTimersByTimeAsync(0);
		expect(await initializing).toBe(true);
		expect(fixture.calls).toContain('link-status');
		expect(fixture.calls).not.toContain('completion');
		expect(fixture.context.getShaderParameter).not.toHaveBeenCalled();
		expect(fixture.onError).not.toHaveBeenCalled();
		fixture.renderer.destroy();
	});

	it('cancels pending compilation and frees partial resources without publishing a failure', async () => {
		vi.useFakeTimers();
		const fixture = rendererFixture();
		const controller = new AbortController();
		const initializing = fixture.renderer.init('vertex', 'fragment', controller.signal);
		controller.abort();
		// Canvas teardown destroys synchronously while initialization unwinds.
		fixture.renderer.destroy();
		expect(await initializing).toBe(false);
		expect(fixture.renderer.ready).toBe(false);
		expect(fixture.onError).not.toHaveBeenCalled();
		expect(fixture.onStatus).not.toHaveBeenCalledWith('The spacetime renderer is ready.');
		expect(fixture.context.deleteShader).toHaveBeenCalledTimes(2);
		expect(fixture.context.deleteProgram).toHaveBeenCalledTimes(1);
		expect(fixture.loseContext).toHaveBeenCalledTimes(1);
		expect(fixture.calls).not.toContain('link-status');
		expect(vi.getTimerCount()).toBe(0);
	});

	it('retains program and shader diagnostics on link failure and releases all partial resources', async () => {
		const fixture = rendererFixture({ linked: false });
		fixture.finish();
		expect(await fixture.renderer.init('bad vertex', 'bad fragment')).toBe(false);
		expect(fixture.onError).toHaveBeenCalledTimes(1);
		expect(fixture.onError.mock.calls[0][0]).toContain('Program link diagnostic');
		expect(fixture.onError.mock.calls[0][0]).toContain('Shader 35633 diagnostic');
		expect(fixture.onError.mock.calls[0][0]).toContain('Shader 35632 diagnostic');
		expect(fixture.context.deleteShader).toHaveBeenCalledTimes(2);
		expect(fixture.context.deleteProgram).toHaveBeenCalledTimes(1);
		expect(fixture.loseContext).toHaveBeenCalledTimes(1);
		expect(fixture.renderer.ready).toBe(false);
	});

	it('stops polling an unfinished compiler at the 15-second deadline', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
		const fixture = rendererFixture();
		const initializing = fixture.renderer.init('vertex', 'fragment');
		await vi.advanceTimersByTimeAsync(14_992);
		expect(fixture.onError).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(16);
		expect(await initializing).toBe(false);
		expect(fixture.onError.mock.calls[0][0]).toContain('within 15 seconds');
		expect(fixture.calls).not.toContain('link-status');
		expect(fixture.context.deleteShader).toHaveBeenCalledTimes(2);
		expect(fixture.context.deleteProgram).toHaveBeenCalledTimes(1);
		expect(fixture.loseContext).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('reports context loss during initialization instead of treating completion as a successful link', async () => {
		vi.useFakeTimers();
		const fixture = rendererFixture();
		const initializing = fixture.renderer.init('vertex', 'fragment');
		fixture.lose();
		await vi.advanceTimersByTimeAsync(16);
		expect(await initializing).toBe(false);
		expect(fixture.onError.mock.calls[0][0]).toContain('context was lost');
		expect(fixture.calls).not.toContain('link-status');
		expect(fixture.renderer.ready).toBe(false);
		expect(fixture.context.deleteShader).toHaveBeenCalledTimes(2);
		expect(fixture.context.deleteProgram).toHaveBeenCalledTimes(1);
	});
});
