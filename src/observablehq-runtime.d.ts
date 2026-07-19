declare module '@observablehq/runtime' {
	export type Observer = {
		pending?: () => void;
		fulfilled?: (value: unknown, name?: string | null) => void;
		rejected?: (error: unknown, name?: string | null) => void;
	};

	export type Variable = {
		define: {
			(definition: unknown): Variable;
			(name: string, definition: unknown): Variable;
			<TDefinition extends (...inputs: never[]) => unknown>(
				inputs: readonly string[],
				definition: TDefinition
			): Variable;
			<TDefinition extends (...inputs: never[]) => unknown>(
				name: string,
				inputs: readonly string[],
				definition: TDefinition
			): Variable;
		};
	};

	export type Module = {
		variable: (observer?: Observer | null | boolean) => Variable;
		redefine: (name: string, definition: unknown) => Variable;
		value: (name: string) => Promise<unknown>;
	};

	export type Define = (runtime: Runtime, observer: (name: string) => Observer | null) => Module;

	export class Runtime {
		constructor(builtins?: Record<string, unknown>, global?: (name: string) => unknown);
		module(): Module;
		module(define: Define, observer?: (name: string) => Observer | null): Module;
		dispose(): void;
	}
}
