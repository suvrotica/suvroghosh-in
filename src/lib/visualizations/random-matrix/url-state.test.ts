import { describe, expect, it } from 'vitest';
import {
	DEFAULT_RANDOM_MATRIX_STATE,
	MAX_MATRIX_DIMENSION,
	MAX_SEED_LENGTH,
	MIN_MATRIX_DIMENSION,
	maximumEnsembleSamples
} from './constants';
import {
	normalizeRandomMatrixState,
	parseRandomMatrixState,
	RANDOM_MATRIX_URL_STATE_VERSION,
	serializeRandomMatrixState
} from './url-state';

describe('random-matrix URL state', () => {
	it('round-trips every field exactly and emits one canonical ordering', () => {
		const state = normalizeRandomMatrixState({
			...DEFAULT_RANDOM_MATRIX_STATE,
			seed: 'College Street rain 2026',
			preset: 'wishart-ridge',
			dimension: 48,
			aspectRatio: 1.2345678901234567,
			distribution: 'uniform',
			mean: -1.2345678901234567,
			scale: 3.141592653589793,
			normalization: 'unscaled',
			symmetry: 'symmetric',
			sparsity: 0.42,
			signalType: 'toeplitz',
			signalStrength: 2.75,
			lens: 'ensemble-laboratory',
			mode: 'ensemble',
			sampleCount: 173,
			theory: false,
			colorScale: 'absolute',
			highContrast: true
		});
		const serialized = serializeRandomMatrixState(state);
		const parsed = parseRandomMatrixState(serialized);

		expect(parsed).toEqual(state);
		expect(serializeRandomMatrixState(parsed).toString()).toBe(serialized.toString());
		expect([...serialized.keys()]).toEqual([
			'rmv',
			'seed',
			'preset',
			'n',
			'gamma',
			'dist',
			'mean',
			'scale',
			'norm',
			'sym',
			'sparse',
			'signal',
			'strength',
			'lens',
			'mode',
			'samples',
			'theory',
			'colour',
			'contrast'
		]);
	});

	it('omits default fields but keeps the namespaced schema marker', () => {
		expect(serializeRandomMatrixState({ ...DEFAULT_RANDOM_MATRIX_STATE }).toString()).toBe(
			`rmv=${RANDOM_MATRIX_URL_STATE_VERSION}`
		);
		expect(parseRandomMatrixState('')).toEqual(DEFAULT_RANDOM_MATRIX_STATE);
	});

	it('fails closed on unsupported or malformed schema versions', () => {
		expect(parseRandomMatrixState('?rmv=2&n=32&dist=uniform')).toEqual(DEFAULT_RANDOM_MATRIX_STATE);
		expect(parseRandomMatrixState('?rmv=not-a-version&n=32')).toEqual(DEFAULT_RANDOM_MATRIX_STATE);
	});

	it('fails closed on pathologically long or hostile query input', () => {
		expect(parseRandomMatrixState(`?rmv=1&seed=${'x'.repeat(5_000)}&n=32`)).toEqual(
			DEFAULT_RANDOM_MATRIX_STATE
		);

		const hostile = new Proxy(new URLSearchParams('rmv=1&n=32'), {
			get() {
				throw new Error('query access should be contained');
			}
		});
		expect(parseRandomMatrixState(hostile)).toEqual(DEFAULT_RANDOM_MATRIX_STATE);
	});

	it('accepts a full URL, strips its fragment and ignores unrelated fields', () => {
		const parsed = parseRandomMatrixState(
			'https://example.test/matrix?n=32&dist=rademacher&theory=0#not-query&n=200'
		);

		expect(parsed.dimension).toBe(32);
		expect(parsed.distribution).toBe('rademacher');
		expect(parsed.theory).toBe(false);
		expect(parsed.preset).toBe(DEFAULT_RANDOM_MATRIX_STATE.preset);
	});

	it('clamps bounded numbers and restores malformed values', () => {
		const parsed = parseRandomMatrixState(
			new URLSearchParams({
				seed: '\u0000   ',
				preset: 'unknown-preset',
				dimension: '9999',
				aspectRatio: '-5',
				distribution: 'triangular',
				mean: 'Infinity',
				scale: '-7',
				normalization: 'mystery',
				symmetry: 'Hermitian',
				sparsity: '9',
				signalType: 'unknown',
				signalStrength: '-1',
				lens: 'telescope',
				mode: 'many',
				sampleCount: '9999',
				theory: 'FALSE',
				colorScale: 'rainbow',
				highContrast: 'true'
			})
		);

		expect(parsed).toEqual({
			...DEFAULT_RANDOM_MATRIX_STATE,
			dimension: MAX_MATRIX_DIMENSION,
			aspectRatio: 0.25,
			scale: 0.01,
			sparsity: 0.98,
			sampleCount: maximumEnsembleSamples(MAX_MATRIX_DIMENSION),
			highContrast: true
		});
	});

	it('normalizes unknown objects without trusting their shape or getters', () => {
		expect(normalizeRandomMatrixState(null)).toEqual(DEFAULT_RANDOM_MATRIX_STATE);
		expect(normalizeRandomMatrixState(['not', 'state'])).toEqual(DEFAULT_RANDOM_MATRIX_STATE);

		const hostile = new Proxy(
			{},
			{
				get() {
					throw new Error('getter should be contained');
				}
			}
		);
		expect(normalizeRandomMatrixState(hostile)).toEqual(DEFAULT_RANDOM_MATRIX_STATE);

		const revoked = Proxy.revocable({}, {});
		revoked.revoke();
		expect(normalizeRandomMatrixState(revoked.proxy)).toEqual(DEFAULT_RANDOM_MATRIX_STATE);
	});

	it('rounds integers, applies dimension-dependent sample caps and sanitizes seeds', () => {
		const normalized = normalizeRandomMatrixState({
			dimension: MIN_MATRIX_DIMENSION - 100,
			sampleCount: 999,
			seed: `  ${'x'.repeat(MAX_SEED_LENGTH + 20)}\u0007  `
		});

		expect(normalized.dimension).toBe(MIN_MATRIX_DIMENSION);
		expect(normalized.sampleCount).toBe(maximumEnsembleSamples(MIN_MATRIX_DIMENSION));
		expect(normalized.seed).toHaveLength(MAX_SEED_LENGTH);
		expect([...normalized.seed].some((character) => character.charCodeAt(0) <= 0x1f)).toBe(false);
	});

	it('canonicalizes fixed ensemble symmetry and safe spectral-radius size limits', () => {
		expect(
			normalizeRandomMatrixState({
				...DEFAULT_RANDOM_MATRIX_STATE,
				preset: 'wigner-moonrise',
				symmetry: 'none'
			}).symmetry
		).toBe('symmetric');
		expect(
			normalizeRandomMatrixState({
				...DEFAULT_RANDOM_MATRIX_STATE,
				preset: 'non-normal-trap',
				symmetry: 'symmetric'
			}).symmetry
		).toBe('none');
		expect(
			normalizeRandomMatrixState({
				...DEFAULT_RANDOM_MATRIX_STATE,
				dimension: 256,
				normalization: 'spectral-radius',
				symmetry: 'none'
			}).dimension
		).toBe(128);
	});

	it('canonicalizes contradictory preset controls from a URL', () => {
		const nonNormal = parseRandomMatrixState(
			'?rmv=1&preset=non-normal-trap&sym=symmetric&mean=1&sparse=.8&strength=5&norm=variance-1%2Fn'
		);
		expect(nonNormal).toMatchObject({
			preset: 'non-normal-trap',
			symmetry: 'none',
			mean: 0,
			sparsity: 0,
			signalStrength: 0,
			normalization: 'unscaled'
		});
		const sparse = parseRandomMatrixState('?rmv=1&preset=sparse-galaxy&sym=none&dist=gaussian');
		expect(sparse.symmetry).toBe('symmetric');
		expect(sparse.distribution).toBe('rademacher');
	});
});
