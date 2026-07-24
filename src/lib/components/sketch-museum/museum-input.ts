const MOVEMENT_KEYS = new Set([
	'w',
	'a',
	's',
	'd',
	'arrowup',
	'arrowdown',
	'arrowleft',
	'arrowright',
	'shift'
]);

interface MuseumMovementKeyContext {
	insideMuseum: boolean;
	typingTarget: boolean;
}

export function isMuseumMovementKey(key: string) {
	return MOVEMENT_KEYS.has(key.toLowerCase());
}

export function shouldHandleMuseumMovementKey(
	key: string,
	{ insideMuseum, typingTarget }: MuseumMovementKeyContext
) {
	return insideMuseum && !typingTarget && isMuseumMovementKey(key);
}
