export function updateProgressiveSegmentPositions(
	target: Float32Array,
	output: Float32Array,
	progress: number
): void {
	const bounded = Math.max(0, Math.min(1, progress));
	for (let offset = 0; offset + 5 < target.length; offset += 6) {
		const startX = target[offset];
		const startY = target[offset + 1];
		const startZ = target[offset + 2];
		output[offset] = startX;
		output[offset + 1] = startY;
		output[offset + 2] = startZ;
		output[offset + 3] = startX + (target[offset + 3] - startX) * bounded;
		output[offset + 4] = startY + (target[offset + 4] - startY) * bounded;
		output[offset + 5] = startZ + (target[offset + 5] - startZ) * bounded;
	}
}
