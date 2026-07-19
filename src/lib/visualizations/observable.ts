import type { Define } from '@observablehq/runtime';

export type ObservableCellDescription = {
	name: string;
	label: string;
	description: string;
	kind?: 'control' | 'visual' | 'value';
};

export type ObservableNotebookDefinition = {
	id: string;
	title: string;
	description: string;
	cells: readonly ObservableCellDescription[];
	define: Define;
};
