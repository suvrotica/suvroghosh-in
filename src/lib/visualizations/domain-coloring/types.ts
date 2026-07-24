export type Complex = {
	re: number;
	im: number;
};

export type ExpressionNode =
	| { kind: 'number'; value: number }
	| { kind: 'constant'; name: 'z' | 'i' | 'e' | 'pi' }
	| { kind: 'unary'; operator: '+' | '-'; value: ExpressionNode }
	| {
			kind: 'binary';
			operator: '+' | '-' | '*' | '/' | '^';
			left: ExpressionNode;
			right: ExpressionNode;
	  }
	| {
			kind: 'call';
			name: 'exp' | 'log' | 'sin' | 'cos' | 'tan' | 'sqrt' | 'abs';
			argument: ExpressionNode;
	  };

export type DomainColoringPreset = {
	id: string;
	label: string;
	expression: string;
	notation: string;
	summary: string;
	notice: string;
	view: Viewport;
};

export type Viewport = {
	centerRe: number;
	centerIm: number;
	spanIm: number;
};

export type ViewportBounds = {
	minRe: number;
	maxRe: number;
	minIm: number;
	maxIm: number;
};
