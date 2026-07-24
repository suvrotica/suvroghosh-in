import type { Complex, ExpressionNode } from './types';

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

export function evaluateExpression(node: ExpressionNode, z: Complex): Complex {
	switch (node.kind) {
		case 'number':
			return complex(node.value);
		case 'constant':
			if (node.name === 'z') return z;
			if (node.name === 'i') return complex(0, 1);
			if (node.name === 'e') return complex(Math.E);
			return complex(Math.PI);
		case 'unary': {
			const value = evaluateExpression(node.value, z);
			return node.operator === '-' ? complex(-value.re, -value.im) : value;
		}
		case 'binary': {
			const left = evaluateExpression(node.left, z);
			const right = evaluateExpression(node.right, z);
			if (node.operator === '+') return add(left, right);
			if (node.operator === '-') return subtract(left, right);
			if (node.operator === '*') return multiply(left, right);
			if (node.operator === '/') return divide(left, right);
			return complexPower(left, right);
		}
		case 'call': {
			const value = evaluateExpression(node.argument, z);
			if (node.name === 'exp') return complexExp(value);
			if (node.name === 'log') return complexLog(value);
			if (node.name === 'sin') return complexSin(value);
			if (node.name === 'cos') return complexCos(value);
			if (node.name === 'tan') return complexTan(value);
			if (node.name === 'sqrt') return complexSqrt(value);
			return complex(magnitude(value));
		}
	}
}
