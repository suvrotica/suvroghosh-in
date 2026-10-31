export const TYPES = ['coin', 'button', 'stone'] as const;
export type ObjectType = (typeof TYPES)[number];
export type TrayObject = { id: number; type: ObjectType; variant: number };
export type TrayState = {
	version: 1;
	objects: TrayObject[];
	sorted: number[];
	sound: boolean;
	reduceMotion: boolean;
};

export const STORAGE_KEY = 'sort-the-tray-v1';

export function newTray(random: () => number = Math.random): TrayState {
	const objects = TYPES.flatMap((type, index) =>
		[0, 1].map((variant) => ({ id: index * 2 + variant, type, variant }))
	);
	for (let i = objects.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[objects[i], objects[j]] = [objects[j], objects[i]];
	}
	return { version: 1, objects, sorted: [], sound: false, reduceMotion: false };
}

function validObject(value: unknown): value is TrayObject {
	if (!value || typeof value !== 'object') return false;
	const object = value as Partial<TrayObject>;
	return (
		typeof object.id === 'number' &&
		Number.isInteger(object.id) &&
		object.id >= 0 &&
		object.id < 6 &&
		object.type === TYPES[Math.floor(object.id / 2)] &&
		object.variant === object.id % 2
	);
}

export function restore(raw: string | null): TrayState | null {
	if (!raw || raw.length > 4096) return null;
	try {
		const value = JSON.parse(raw) as Partial<TrayState> | null;
		if (
			value?.version !== 1 ||
			!Array.isArray(value.objects) ||
			value.objects.length !== 6 ||
			!Array.isArray(value.sorted)
		)
			return null;
		if (
			!value.objects.every(validObject) ||
			new Set(value.objects.map((object) => object.id)).size !== 6
		)
			return null;
		if (
			value.sorted.length > 6 ||
			new Set(value.sorted).size !== value.sorted.length ||
			!value.sorted.every((id) => Number.isInteger(id) && id >= 0 && id < 6)
		)
			return null;
		return {
			version: 1,
			objects: value.objects.map(({ id, type, variant }) => ({ id, type, variant })),
			sorted: [...value.sorted],
			sound: value.sound === true,
			reduceMotion: value.reduceMotion === true
		};
	} catch {
		return null;
	}
}

export function place(state: TrayState, id: number, type: ObjectType): boolean {
	const object = state.objects.find((item) => item.id === id);
	if (!object || object.type !== type || state.sorted.includes(id)) return false;
	state.sorted.push(id);
	return true;
}
