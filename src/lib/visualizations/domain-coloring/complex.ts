import type { Complex, EvaluationDiagnostic, ExpressionNode } from './types';

const exactZero = (value: Complex) => value.re === 0 && value.im === 0;
const finiteComplex = (value: Complex) => Number.isFinite(value.re) && Number.isFinite(value.im);

export const complex = (re: number, im = 0): Complex => ({ re, im });

export function add(a: Complex, b: Complex): Complex {
	return complex(a.re + b.re, a.im + b.im);
}

export function subtract(a: Complex, b: Complex): Complex {
	return complex(a.re - b.re, a.im - b.im);
}

export function multiply(a: Complex, b: Complex): Complex {
	return complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

export function divide(a: Complex, b: Complex): Complex {
	const denominator = b.re * b.re + b.im * b.im;
	return complex(
		(a.re * b.re + a.im * b.im) / denominator,
		(a.im * b.re - a.re * b.im) / denominator
	);
}

export function magnitude(value: Complex): number {
	return Math.hypot(value.re, value.im);
}

export function argument(value: Complex): number {
	return Math.atan2(value.im, value.re);
}

export function complexExp(value: Complex): Complex {
	const scale = Math.exp(value.re);
	return complex(scale * Math.cos(value.im), scale * Math.sin(value.im));
}

export function complexLog(value: Complex): Complex {
	return complex(Math.log(magnitude(value)), argument(value));
}

export function complexSin(value: Complex): Complex {
	return complex(
		Math.sin(value.re) * Math.cosh(value.im),
		Math.cos(value.re) * Math.sinh(value.im)
	);
}

export function complexCos(value: Complex): Complex {
	return complex(
		Math.cos(value.re) * Math.cosh(value.im),
		-Math.sin(value.re) * Math.sinh(value.im)
	);
}

export function complexTan(value: Complex): Complex {
	return divide(complexSin(value), complexCos(value));
}

export function complexSqrt(value: Complex): Complex {
	const radius = magnitude(value);
	const real = Math.sqrt(Math.max(0, (radius + value.re) / 2));
	const imaginaryMagnitude = Math.sqrt(Math.max(0, (radius - value.re) / 2));
	return complex(real, value.im < 0 ? -imaginaryMagnitude : imaginaryMagnitude);
}

export function complexConjugate(value: Complex): Complex {
	return complex(value.re, -value.im);
}

/** Analytic continuation of sin(z)/z, with a stable shared near-zero series. */
export function complexSinc(value: Complex): Complex {
	if (magnitude(value) >= 1e-3) return divide(complexSin(value), value);
	const z2 = multiply(value, value);
	const z4 = multiply(z2, z2);
	const z6 = multiply(z4, z2);
	return add(
		add(add(complex(1), { re: -z2.re / 6, im: -z2.im / 6 }), { re: z4.re / 120, im: z4.im / 120 }),
		{ re: -z6.re / 5040, im: -z6.im / 5040 }
	);
}

export function integerPower(value: Complex, exponent: number): Complex {
	if (exponent === 0) return complex(1);
	const count = Math.abs(exponent);
	let result = complex(1);
	let base = value;
	let remaining = count;

	while (remaining > 0) {
		if (remaining % 2 === 1) result = multiply(result, base);
		base = multiply(base, base);
		remaining = Math.floor(remaining / 2);
	}

	return exponent < 0 ? divide(complex(1), result) : result;
}

export function complexPower(base: Complex, exponent: Complex): Complex {
	if (exponent.im === 0 && Number.isInteger(exponent.re)) {
		return integerPower(base, exponent.re);
	}
	return complexExp(multiply(exponent, complexLog(base)));
}

function diagnostic(value: Complex, reason?: string): EvaluationDiagnostic {
	if (!finiteComplex(value))
		return { value, status: 'undefined', reason: reason ?? 'non-finite result' };
	return { value, status: exactZero(value) ? 'zero-like' : 'finite', reason };
}

function evaluateNode(node: ExpressionNode, z: Complex): EvaluationDiagnostic {
	switch (node.kind) {
		case 'number':
			return diagnostic(complex(node.value));
		case 'constant':
			if (node.name === 'z') return diagnostic(z);
			if (node.name === 'i') return diagnostic(complex(0, 1));
			if (node.name === 'e') return diagnostic(complex(Math.E));
			return diagnostic(complex(Math.PI));
		case 'unary': {
			const input = evaluateNode(node.value, z);
			if (input.status === 'undefined' || input.status === 'indeterminate') return input;
			return diagnostic(
				node.operator === '-' ? complex(-input.value.re, -input.value.im) : input.value,
				input.reason
			);
		}
		case 'binary': {
			const left = evaluateNode(node.left, z);
			const right = evaluateNode(node.right, z);
			if (left.status === 'indeterminate' || right.status === 'indeterminate') {
				return {
					value: complex(Number.NaN, Number.NaN),
					status: 'indeterminate',
					reason: 'indeterminate subexpression'
				};
			}
			if (left.status === 'undefined' || right.status === 'undefined') {
				return {
					value: complex(Number.NaN, Number.NaN),
					status: 'undefined',
					reason: 'undefined subexpression'
				};
			}
			if (node.operator === '+') return diagnostic(add(left.value, right.value));
			if (node.operator === '-') return diagnostic(subtract(left.value, right.value));
			if (node.operator === '*') return diagnostic(multiply(left.value, right.value));
			if (node.operator === '/') {
				if (exactZero(right.value)) {
					if (exactZero(left.value)) {
						return {
							value: complex(Number.NaN, Number.NaN),
							status: 'indeterminate',
							reason: 'zero divided by zero'
						};
					}
					return {
						value: complex(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
						status: 'pole',
						reason: 'nonzero value divided by zero'
					};
				}
				return diagnostic(divide(left.value, right.value));
			}
			if (exactZero(left.value) && right.value.im === 0 && right.value.re < 0) {
				return {
					value: complex(Number.POSITIVE_INFINITY, Number.NaN),
					status: 'pole',
					reason: 'negative integer power at zero'
				};
			}
			return diagnostic(complexPower(left.value, right.value));
		}
		case 'call': {
			const input = evaluateNode(node.argument, z);
			if (input.status === 'undefined' || input.status === 'indeterminate') return input;
			if (node.name === 'log' && exactZero(input.value)) {
				return {
					value: complex(Number.NEGATIVE_INFINITY, 0),
					status: 'undefined',
					reason: 'principal logarithm is undefined at zero'
				};
			}
			if (node.name === 'exp') return diagnostic(complexExp(input.value));
			if (node.name === 'log') return diagnostic(complexLog(input.value));
			if (node.name === 'sin') return diagnostic(complexSin(input.value));
			if (node.name === 'cos') return diagnostic(complexCos(input.value));
			if (node.name === 'tan') return diagnostic(complexTan(input.value));
			if (node.name === 'sqrt') return diagnostic(complexSqrt(input.value));
			if (node.name === 'abs') return diagnostic(complex(magnitude(input.value)));
			if (node.name === 'conj') return diagnostic(complexConjugate(input.value));
			return diagnostic(complexSinc(input.value));
		}
	}
}

export function evaluateExpressionDiagnostic(
	node: ExpressionNode,
	z: Complex
): EvaluationDiagnostic {
	return evaluateNode(node, z);
}

/** Compatibility value-only evaluator. New UI code should use the diagnostic form. */
export function evaluateExpression(node: ExpressionNode, z: Complex): Complex {
	return evaluateExpressionDiagnostic(node, z).value;
}
