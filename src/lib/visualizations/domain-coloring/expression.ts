import type { ComplexFunctionName, ExpressionNode } from './types';

type TokenKind = 'number' | 'identifier' | 'operator' | 'left-paren' | 'right-paren' | 'end';

type Token = {
	kind: TokenKind;
	text: string;
	value?: number;
	position: number;
};

const supportedFunctions = new Set<ComplexFunctionName>([
	'exp',
	'log',
	'sin',
	'cos',
	'tan',
	'sqrt',
	'abs',
	'conj',
	'sinc'
]);
const supportedConstants = new Set(['z', 'i', 'e', 'pi']);
const maximumExpressionLength = 180;
const maximumNodes = 128;

export class ExpressionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ExpressionError';
	}
}

function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let position = 0;

	while (position < source.length) {
		const character = source[position];
		if (/\s/.test(character)) {
			position += 1;
			continue;
		}

		if (
			/[0-9]/.test(character) ||
			(character === '.' && /[0-9]/.test(source[position + 1] ?? ''))
		) {
			const match = source.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
			if (!match)
				throw new ExpressionError(`The number near position ${position + 1} is incomplete.`);
			const value = Number(match[0]);
			if (!Number.isFinite(value)) {
				throw new ExpressionError('Please use finite numerical constants.');
			}
			tokens.push({ kind: 'number', text: match[0], value, position });
			position += match[0].length;
			continue;
		}

		if (/[A-Za-z]/.test(character)) {
			const match = source.slice(position).match(/^[A-Za-z]+/);
			const text = match?.[0].toLowerCase() ?? character.toLowerCase();
			tokens.push({ kind: 'identifier', text, position });
			position += match?.[0].length ?? 1;
			continue;
		}

		if ('+-*/^'.includes(character)) {
			tokens.push({ kind: 'operator', text: character, position });
			position += 1;
			continue;
		}

		if (character === '(') {
			tokens.push({ kind: 'left-paren', text: character, position });
			position += 1;
			continue;
		}

		if (character === ')') {
			tokens.push({ kind: 'right-paren', text: character, position });
			position += 1;
			continue;
		}

		throw new ExpressionError(
			`“${character}” is not part of the supported function notation. Use numbers, z, i, operators, and parentheses.`
		);
	}

	tokens.push({ kind: 'end', text: '', position: source.length });
	return tokens;
}

class Parser {
	private index = 0;
	private nodeCount = 0;

	constructor(private readonly tokens: Token[]) {}

	parse(): ExpressionNode {
		const expression = this.parseAddition();
		const token = this.peek();
		if (token.kind !== 'end') {
			if (token.kind === 'number' || token.kind === 'identifier' || token.kind === 'left-paren') {
				throw new ExpressionError(
					`Add an operator before “${token.text}”; implicit multiplication is not supported.`
				);
			}
			if (token.kind === 'right-paren') {
				throw new ExpressionError('There is an extra closing parenthesis.');
			}
			throw new ExpressionError(`The expression stops unexpectedly near “${token.text}”.`);
		}
		return expression;
	}

	private parseAddition(): ExpressionNode {
		let left = this.parseMultiplication();
		while (this.matchesOperator('+') || this.matchesOperator('-')) {
			const operator = this.consume().text as '+' | '-';
			const right = this.parseMultiplication();
			left = this.node({ kind: 'binary', operator, left, right });
		}
		return left;
	}

	private parseMultiplication(): ExpressionNode {
		let left = this.parseUnary();
		while (this.matchesOperator('*') || this.matchesOperator('/')) {
			const operator = this.consume().text as '*' | '/';
			const right = this.parseUnary();
			left = this.node({ kind: 'binary', operator, left, right });
		}
		return left;
	}

	private parseUnary(): ExpressionNode {
		if (this.matchesOperator('+') || this.matchesOperator('-')) {
			const operator = this.consume().text as '+' | '-';
			return this.node({ kind: 'unary', operator, value: this.parseUnary() });
		}
		return this.parsePower();
	}

	private parsePower(): ExpressionNode {
		const left = this.parsePrimary();
		if (!this.matchesOperator('^')) return left;
		this.consume();
		return this.node({
			kind: 'binary',
			operator: '^',
			left,
			right: this.parseUnary()
		});
	}

	private parsePrimary(): ExpressionNode {
		const token = this.consume();

		if (token.kind === 'number') {
			return this.node({ kind: 'number', value: token.value ?? 0 });
		}

		if (token.kind === 'identifier') {
			if (supportedConstants.has(token.text)) {
				return this.node({
					kind: 'constant',
					name: token.text as 'z' | 'i' | 'e' | 'pi'
				});
			}

			if (!supportedFunctions.has(token.text as ComplexFunctionName)) {
				throw new ExpressionError(
					`“${token.text}” is not available. Try exp, log, sin, cos, tan, sqrt, abs, conj, or sinc.`
				);
			}

			if (this.peek().kind !== 'left-paren') {
				throw new ExpressionError(`Put the argument to ${token.text} inside parentheses.`);
			}
			this.consume();
			const argument = this.parseAddition();
			if (this.peek().kind !== 'right-paren') {
				throw new ExpressionError(`Add a closing parenthesis after ${token.text}(...).`);
			}
			this.consume();
			return this.node({
				kind: 'call',
				name: token.text as ComplexFunctionName,
				argument
			});
		}

		if (token.kind === 'left-paren') {
			const expression = this.parseAddition();
			if (this.peek().kind !== 'right-paren') {
				throw new ExpressionError('Add a closing parenthesis.');
			}
			this.consume();
			return expression;
		}

		if (token.kind === 'right-paren') {
			throw new ExpressionError('There is a closing parenthesis without an expression before it.');
		}

		throw new ExpressionError('The expression needs another number, z, i, or function.');
	}

	private matchesOperator(operator: string): boolean {
		const token = this.peek();
		return token.kind === 'operator' && token.text === operator;
	}

	private peek(): Token {
		return this.tokens[this.index];
	}

	private consume(): Token {
		const token = this.peek();
		this.index += 1;
		return token;
	}

	private node<T extends ExpressionNode>(node: T): T {
		this.nodeCount += 1;
		if (this.nodeCount > maximumNodes) {
			throw new ExpressionError(
				'This function is too long for the live explorer. Try a simpler form.'
			);
		}
		return node;
	}
}

export function parseExpression(source: string): ExpressionNode {
	const trimmed = source.trim();
	if (!trimmed) {
		throw new ExpressionError('Enter a function, for example z^2 - 1.');
	}
	if (trimmed.length > maximumExpressionLength) {
		throw new ExpressionError(
			`Keep the function under ${maximumExpressionLength} characters for reliable live rendering.`
		);
	}
	return new Parser(tokenize(trimmed)).parse();
}

function glslNumber(value: number): string {
	if (Number.isInteger(value)) return `${value.toFixed(1)}`;
	const encoded = value.toPrecision(12).replace(/(?:\.0+|(\.\d+?)0+)(e|$)/i, '$1$2');
	return encoded.includes('.') || /e/i.test(encoded) ? encoded : `${encoded}.0`;
}

function integerExponent(node: ExpressionNode): number | null {
	if (node.kind === 'number' && Number.isInteger(node.value) && Math.abs(node.value) <= 16) {
		return node.value;
	}
	if (
		node.kind === 'unary' &&
		node.operator === '-' &&
		node.value.kind === 'number' &&
		Number.isInteger(node.value.value) &&
		Math.abs(node.value.value) <= 16
	) {
		return -node.value.value;
	}
	return null;
}

export function expressionToGlsl(node: ExpressionNode): string {
	switch (node.kind) {
		case 'number':
			return `vec2(${glslNumber(node.value)}, 0.0)`;
		case 'constant':
			if (node.name === 'z') return 'z';
			if (node.name === 'i') return 'vec2(0.0, 1.0)';
			if (node.name === 'e') return 'vec2(2.718281828459045, 0.0)';
			return 'vec2(3.141592653589793, 0.0)';
		case 'unary':
			return node.operator === '-'
				? `(-${expressionToGlsl(node.value)})`
				: expressionToGlsl(node.value);
		case 'binary': {
			const left = expressionToGlsl(node.left);
			const right = expressionToGlsl(node.right);
			if (node.operator === '+') return `(${left} + ${right})`;
			if (node.operator === '-') return `(${left} - ${right})`;
			if (node.operator === '*') return `c_mul(${left}, ${right})`;
			if (node.operator === '/') return `c_div(${left}, ${right})`;
			const exponent = integerExponent(node.right);
			return exponent === null ? `c_pow(${left}, ${right})` : `c_powi(${left}, ${exponent})`;
		}
		case 'call': {
			const argument = expressionToGlsl(node.argument);
			if (node.name === 'abs') return `vec2(length(${argument}), 0.0)`;
			return `c_${node.name}(${argument})`;
		}
	}
}
