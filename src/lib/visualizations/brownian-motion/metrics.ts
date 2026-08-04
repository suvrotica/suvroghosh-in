import type { BoundaryCondition, ParticleArrays, SimulationMetrics } from './types';

/** Population moments over living particles, using unwrapped periodic coordinates for displacement. */
export function calculateSimulationMetrics(
	state: ParticleArrays,
	boundary: BoundaryCondition,
	simulationTime: number
): SimulationMetrics {
	if (!Number.isFinite(simulationTime) || simulationTime < 0) {
		throw new RangeError('Metric time must be finite and non-negative.');
	}
	const useUnwrapped = boundary.mode === 'periodic';
	let aliveCount = 0;
	let meanX = 0;
	let meanY = 0;
	let secondMomentX = 0;
	let secondMomentY = 0;
	let covariance = 0;
	let displacementX = 0;
	let displacementY = 0;

	for (let index = 0; index < state.count; index += 1) {
		if (state.alive[index] === 0) continue;
		const x = useUnwrapped ? state.unwrappedX[index] : state.x[index];
		const y = useUnwrapped ? state.unwrappedY[index] : state.y[index];
		const originX = useUnwrapped ? state.originUnwrappedX[index] : state.originX[index];
		const originY = useUnwrapped ? state.originUnwrappedY[index] : state.originY[index];
		aliveCount += 1;

		const deltaXFromMean = x - meanX;
		const deltaYFromMean = y - meanY;
		meanX += deltaXFromMean / aliveCount;
		meanY += deltaYFromMean / aliveCount;
		secondMomentX += deltaXFromMean * (x - meanX);
		secondMomentY += deltaYFromMean * (y - meanY);
		covariance += deltaXFromMean * (y - meanY);

		const dx = x - originX;
		const dy = y - originY;
		displacementX += dx * dx;
		displacementY += dy * dy;
	}

	const absorbedCount = state.count - aliveCount;
	if (aliveCount === 0) {
		return {
			simulationTime,
			particleCount: state.count,
			aliveCount,
			absorbedCount,
			survivalFraction: 0,
			mean: null,
			variance: null,
			covarianceXY: null,
			meanSquareDisplacement: null,
			meanSquareDisplacementByAxis: null,
			rootMeanSquareDisplacement: null
		};
	}

	const msdX = displacementX / aliveCount;
	const msdY = displacementY / aliveCount;
	const msd = msdX + msdY;
	return {
		simulationTime,
		particleCount: state.count,
		aliveCount,
		absorbedCount,
		survivalFraction: aliveCount / state.count,
		mean: { x: meanX, y: meanY },
		variance: { x: secondMomentX / aliveCount, y: secondMomentY / aliveCount },
		covarianceXY: covariance / aliveCount,
		meanSquareDisplacement: msd,
		meanSquareDisplacementByAxis: { x: msdX, y: msdY },
		rootMeanSquareDisplacement: Math.sqrt(msd)
	};
}
