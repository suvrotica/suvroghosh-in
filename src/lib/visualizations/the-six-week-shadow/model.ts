/** A fictional dependency schedule. All quantities are teaching assumptions. */
export const MODEL_VERSION = 'six-week-shadow/1';
export type TaskId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';
export type TaskKind = 'work' | 'wait';
export type Scenario = 'prototype' | 'batch';
export interface Task {
	id: string;
	label: string;
	description: string;
	dependencies: readonly string[];
	durationWorkingDays: number;
	effortPersonDays: number;
	kind: TaskKind;
}
export interface ScheduledTask extends Task {
	start: number;
	finish: number;
	controlsCompletion: boolean;
}
export interface Schedule {
	tasks: readonly ScheduledTask[];
	elapsedWorkingDays: number;
	activeEffortPersonDays: number;
	controllingPath: readonly string[];
}
export interface Settings {
	changed: boolean;
	scenario: Scenario;
	supplierWait: number;
	productionWait: number;
}
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
	changed: true,
	scenario: 'batch',
	supplierWait: 10,
	productionWait: 5
});

/** Stable Kahn traversal: task declaration order resolves ties, including ties on the path. */
export function scheduleTasks(tasks: readonly Task[], releaseId: string): Schedule {
	if (!Array.isArray(tasks) || !tasks.length) throw new Error('A schedule needs tasks.');
	const byId = new Map<string, Task>();
	for (const task of tasks) {
		if (!task.id || byId.has(task.id)) throw new Error('Duplicate or empty task ID.');
		if (!['work', 'wait'].includes(task.kind)) throw new Error('Unknown task kind.');
		if (
			!Number.isFinite(task.durationWorkingDays) ||
			task.durationWorkingDays < 0 ||
			!Number.isFinite(task.effortPersonDays) ||
			task.effortPersonDays < 0
		)
			throw new Error('Task values must be finite and nonnegative.');
		if (new Set(task.dependencies).size !== task.dependencies.length)
			throw new Error('Duplicate dependency.');
		byId.set(task.id, task);
	}
	if (!byId.has(releaseId)) throw new Error('Unknown release task.');
	for (const task of tasks) {
		if (task.dependencies.some((id: string) => !byId.has(id)))
			throw new Error('Unknown dependency.');
	}
	const remaining = new Set(tasks.map((task) => task.id));
	const scheduled = new Map<string, ScheduledTask>();
	const previous = new Map<string, string>();
	while (remaining.size) {
		const next = tasks.find(
			(task) => remaining.has(task.id) && task.dependencies.every((id: string) => scheduled.has(id))
		);
		if (!next) throw new Error('Cyclic task dependencies.');
		let start = 0;
		let predecessor: string | undefined;
		// Declaration order rather than dependency-array order gives deterministic ties.
		for (const task of tasks) {
			if (!next.dependencies.includes(task.id)) continue;
			const finish = scheduled.get(task.id)!.finish;
			if (predecessor === undefined || finish > start) {
				start = finish;
				predecessor = task.id;
			}
		}
		if (predecessor) previous.set(next.id, predecessor);
		scheduled.set(next.id, {
			...next,
			dependencies: Object.freeze([...next.dependencies]),
			start,
			finish: start + next.durationWorkingDays,
			controlsCompletion: false
		});
		remaining.delete(next.id);
	}
	const path: string[] = [];
	for (let id: string | undefined = releaseId; id; id = previous.get(id)) path.unshift(id);
	return Object.freeze({
		tasks: Object.freeze(
			[...scheduled.values()].map((task) =>
				Object.freeze({ ...task, controlsCompletion: path.includes(task.id) })
			)
		),
		elapsedWorkingDays: scheduled.get(releaseId)!.finish,
		activeEffortPersonDays: tasks.reduce((total, task) => total + task.effortPersonDays, 0),
		controllingPath: Object.freeze(path)
	});
}

export function validateSettings(input: Settings): Settings {
	if (typeof input.changed !== 'boolean' || !['prototype', 'batch'].includes(input.scenario))
		throw new Error('Unknown scenario.');
	for (const [value, max] of [
		[input.supplierWait, 20],
		[input.productionWait, 15]
	]) {
		if (!Number.isInteger(value) || value < 0 || value > max)
			throw new Error('Wait outside the allowed whole-day range.');
	}
	return { ...input };
}

export function scenarioTasks(input: Settings): readonly Task[] {
	const settings = validateSettings(input);
	const tasks: Task[] = [
		{
			id: 'A',
			label: 'Review the change',
			description:
				'The designer checks the new opening and internal route. The ten-minute drawing edit sits inside this first day.',
			dependencies: [],
			durationWorkingDays: 1,
			effortPersonDays: 1,
			kind: 'work'
		},
		{
			id: 'B',
			label: 'Build and check a sample',
			description:
				'The sample maker tries the revised base, route and button position before anyone commits to a batch.',
			dependencies: ['A'],
			durationWorkingDays: 4,
			effortPersonDays: 4,
			kind: 'work'
		},
		{
			id: 'C',
			label: 'Wait for supplier slot',
			description:
				'The supplier has the checked sample, but its next preparation slot is not available yet. No labour effort is added during this wait.',
			dependencies: ['B'],
			durationWorkingDays: settings.supplierWait,
			effortPersonDays: 0,
			kind: 'wait'
		},
		{
			id: 'D',
			label: 'Make revised bases',
			description: 'The supplier prepares the revised bases after the booked slot opens.',
			dependencies: ['C'],
			durationWorkingDays: 3,
			effortPersonDays: 3,
			kind: 'work'
		},
		{
			id: 'E',
			label: 'Assemble and check a pilot',
			description:
				'The assembly team tries a small checked group with the new bases before changing the full batch setup.',
			dependencies: ['D'],
			durationWorkingDays: 3,
			effortPersonDays: 3,
			kind: 'work'
		},
		{
			id: 'F',
			label: 'Wait for production slot',
			description: 'The pilot is checked. The batch team waits for its booked production slot.',
			dependencies: ['E'],
			durationWorkingDays: settings.productionWait,
			effortPersonDays: 0,
			kind: 'wait'
		},
		{
			id: 'G',
			label: 'Change batch assembly setup',
			description:
				'The production team fits the revised fixture and updates the batch setup after the slot opens.',
			dependencies: ['F'],
			durationWorkingDays: 2,
			effortPersonDays: 2,
			kind: 'work'
		},
		{
			id: 'H',
			label: 'Pack and release',
			description:
				'The packing team needs the revised setup, finished references and prepared support information before releasing the batch.',
			dependencies: ['G', 'I', 'J'],
			durationWorkingDays: 2,
			effortPersonDays: 2,
			kind: 'work'
		},
		{
			id: 'I',
			label: 'Instructions, photographs and packing references',
			description:
				'A separate person updates the instruction card, product photograph and packing reference after the sample is checked. This work can happen beside the supplier wait.',
			dependencies: ['B'],
			durationWorkingDays: 3,
			effortPersonDays: 3,
			kind: 'work'
		},
		{
			id: 'J',
			label: 'Support preparation',
			description:
				'A separate support colleague prepares answers using the checked pilot. Packing still needs this work to be finished.',
			dependencies: ['E'],
			durationWorkingDays: 2,
			effortPersonDays: 2,
			kind: 'work'
		}
	];
	return settings.scenario === 'prototype' ? tasks.slice(0, 2) : tasks;
}

export function compileScenario(input: Settings): Schedule {
	const settings = validateSettings(input);
	if (!settings.changed)
		return Object.freeze({
			tasks: Object.freeze([]),
			elapsedWorkingDays: 0,
			activeEffortPersonDays: 0,
			controllingPath: Object.freeze([])
		});
	return scheduleTasks(scenarioTasks(settings), settings.scenario === 'prototype' ? 'B' : 'H');
}

/** Whole-day emphasis segments on the controlling chain: no branch effort is added to length. */
export function shadowBands(schedule: Schedule) {
	return schedule.controllingPath.map((id) => schedule.tasks.find((task) => task.id === id)!);
}

export const BEATS = [
	{
		title: 'The edit',
		question: 'What could moving one button wake up?',
		text: 'The suggestion takes ten minutes. Checking its consequences takes longer. The drawing edit belongs inside the first day of review.',
		task: 'A'
	},
	{
		title: 'The first consequence',
		question: 'What has to move underneath?',
		text: 'The button moved. The opening and internal route must move too. A checked physical sample gives the next person something definite to work from.',
		task: 'B'
	},
	{
		title: 'The other people',
		question: 'What happens while nothing moves?',
		text: 'The sample is ready, but the supplier slot is not. Later the checked pilot meets another booking. Some days contain work. Other days contain waiting.',
		task: 'C'
	},
	{
		title: 'The quiet work',
		question: 'Can more work happen in the same days?',
		text: 'Instructions, photographs and packing references can follow the checked sample while the supplier waits. Support preparation follows the pilot. Separate people are assumed available.',
		task: 'I'
	},
	{
		title: 'The same idea, a different moment',
		question: 'Is this a prototype or a promise to a batch?',
		text: 'One workshop prototype stops after review and sample: five working days. The batch must travel through the obligations already attached to it. Change the waits and watch the ending move.',
		task: 'H'
	}
] as const;
