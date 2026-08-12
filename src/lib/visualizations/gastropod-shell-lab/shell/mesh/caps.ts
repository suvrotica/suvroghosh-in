/**
 * Append a triangle fan for a ring. `reverse` is used for the adult end;
 * the visual shell normally caps only its protoconch and leaves the aperture open.
 */
export function appendRingCapIndices(
	target: number[],
	ringStart: number,
	centerIndex: number,
	samplesPerRing: number,
	reverse = false
): void {
	for (let sample = 0; sample < samplesPerRing; sample += 1) {
		const current = ringStart + sample;
		const next = ringStart + ((sample + 1) % samplesPerRing);
		if (reverse) target.push(centerIndex, current, next);
		else target.push(centerIndex, next, current);
	}
}

export function ringCentroid(
	positions: ArrayLike<number>,
	ringStartVertex: number,
	samplesPerRing: number
): [number, number, number] {
	let x = 0;
	let y = 0;
	let z = 0;
	for (let sample = 0; sample < samplesPerRing; sample += 1) {
		const offset = (ringStartVertex + sample) * 3;
		x += positions[offset];
		y += positions[offset + 1];
		z += positions[offset + 2];
	}
	return [x / samplesPerRing, y / samplesPerRing, z / samplesPerRing];
}
