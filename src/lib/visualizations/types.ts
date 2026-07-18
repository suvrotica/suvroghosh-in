export type VisualizationValue = number | boolean | string;

export type VisualizationParameters = Record<string, VisualizationValue>;

type ParameterBase = {
	id: string;
	label: string;
	description: string;
};

export type RangeParameter = ParameterBase & {
	type: 'range';
	defaultValue: number;
	min: number;
	max: number;
	step: number;
	unit?: string;
};

export type NumberParameter = ParameterBase & {
	type: 'number';
	defaultValue: number;
	min: number;
	max: number;
	step: number;
	unit?: string;
};

export type ToggleParameter = ParameterBase & {
	type: 'toggle';
	defaultValue: boolean;
};

export type SelectParameter = ParameterBase & {
	type: 'select';
	defaultValue: string;
	options: readonly {
		label: string;
		value: string;
	}[];
};

export type VisualizationParameter =
	| RangeParameter
	| NumberParameter
	| ToggleParameter
	| SelectParameter;

export type VisualizationPreset = {
	id: string;
	label: string;
	description: string;
	values: VisualizationParameters;
};

export type UniformValue = number | boolean | readonly number[];

export type VisualizationFrame = {
	time: number;
	resolution: readonly [number, number];
	pointer: readonly [number, number];
	parameters: VisualizationParameters;
};

export type VisualizationSourceFile = {
	id: string;
	label: string;
	filename: string;
	language: 'javascript' | 'glsl';
	source: string;
};

export type VisualizationStage = {
	id: string;
	label: string;
	title: string;
	explanation: string;
	callout: string;
	filename: string;
	language: 'javascript' | 'glsl';
	code: string;
	previewFragmentSource: string;
};

export type VisualizationDefinition = {
	id: string;
	title: string;
	description: string;
	subjects: readonly string[];
	poster: string;
	posterAlt: string;
	vertexSource: string;
	fragmentSource: string;
	parameters: readonly VisualizationParameter[];
	presets: readonly VisualizationPreset[];
	stages: readonly VisualizationStage[];
	sourceFiles: readonly VisualizationSourceFile[];
	uniforms: (frame: VisualizationFrame) => Record<string, UniformValue>;
};

export function defaultParameters(definition: VisualizationDefinition): VisualizationParameters {
	return Object.fromEntries(
		definition.parameters.map((parameter) => [parameter.id, parameter.defaultValue])
	);
}

export function coerceParameterValue(
	parameter: VisualizationParameter,
	value: VisualizationValue
): VisualizationValue {
	if (parameter.type === 'toggle') return Boolean(value);
	if (parameter.type === 'select') {
		const candidate = String(value);
		return parameter.options.some((option) => option.value === candidate)
			? candidate
			: parameter.defaultValue;
	}

	const numericValue = Number(value);
	if (!Number.isFinite(numericValue)) return parameter.defaultValue;
	return Math.min(parameter.max, Math.max(parameter.min, numericValue));
}
