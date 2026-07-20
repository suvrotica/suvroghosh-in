import { microbeAppearance } from './microbeAppearance';
import type { Organism, Predator, SimulationEvent, SimulationParameters } from './types';

function clamp(value: number, minimum = 0, maximum = 1) {
	return Math.min(maximum, Math.max(minimum, value));
}

function seededUnit(id: number, salt: number) {
	const value = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453;
	return value - Math.floor(value);
}

function traceBody(
	context: CanvasRenderingContext2D,
	length: number,
	width: number,
	curvature: number
) {
	const bend = curvature * width;
	context.beginPath();
	context.moveTo(length * 0.96, bend * 0.2);
	context.bezierCurveTo(
		length * 0.58,
		-width * 1.04 + bend,
		-length * 0.54,
		-width * 0.92 - bend * 0.4,
		-length,
		bend * 0.1
	);
	context.bezierCurveTo(
		-length * 0.58,
		width * 0.92 - bend * 0.4,
		length * 0.58,
		width * 1.04 + bend,
		length * 0.96,
		bend * 0.2
	);
	context.closePath();
}

export function drawMicrobe(
	context: CanvasRenderingContext2D,
	organism: Organism,
	parameters: SimulationParameters,
	simulationTime: number,
	crowdingScale: number,
	reducedMotion: boolean,
	highlighted: boolean
) {
	const appearance = microbeAppearance(organism, parameters, crowdingScale);
	const phase = reducedMotion ? 0 : simulationTime * 4 + organism.id * 0.61;
	const breathing = 1 + Math.sin(phase) * 0.025 * (1 - appearance.elderAmount * 0.55);
	const feedingExpansion = organism.feedingPulse * 0.14;
	const collisionSquash = organism.collisionPulse * 0.17;
	const length = appearance.bodyLength * breathing;
	const width = appearance.bodyWidth * (1 + feedingExpansion);
	const hue = organism.genome.hue;
	const elderDesaturation = appearance.elderAmount * 34;
	const membraneSaturation = 78 - elderDesaturation;

	context.save();
	context.translate(organism.x, organism.y);
	context.rotate(organism.heading);
	context.scale(1 - collisionSquash, 1 + collisionSquash * 0.8);
	context.lineCap = 'round';
	context.lineJoin = 'round';

	if (organism.birthPulse > 0) {
		context.beginPath();
		context.ellipse(0, 0, length + 8, width + 8, 0, 0, Math.PI * 2);
		context.strokeStyle = `hsla(${hue}, 92%, 78%, ${organism.birthPulse * 0.55})`;
		context.lineWidth = 2;
		context.stroke();
	}

	if (organism.collisionPulse > 0) {
		context.beginPath();
		context.ellipse(
			0,
			0,
			length + (1 - organism.collisionPulse) * 9,
			width + (1 - organism.collisionPulse) * 9,
			0,
			0,
			Math.PI * 2
		);
		context.strokeStyle = `rgba(103, 232, 249, ${organism.collisionPulse * 0.58})`;
		context.lineWidth = 1.5;
		context.stroke();
	}

	for (let tail = 0; tail < appearance.flagellaCount; tail += 1) {
		const offset = (tail - (appearance.flagellaCount - 1) / 2) * width * 0.34;
		const wave = reducedMotion ? 0 : Math.sin(phase * 1.35 + tail * 1.8) * width * 0.42;
		context.beginPath();
		context.moveTo(-length * 0.76, offset);
		context.bezierCurveTo(
			-length - appearance.flagellaLength * 0.18,
			offset + wave,
			-length - appearance.flagellaLength * 0.64,
			offset - wave,
			-length - appearance.flagellaLength,
			offset + wave * 0.52
		);
		context.strokeStyle = `hsla(${hue}, 88%, 76%, ${0.48 - appearance.elderAmount * 0.18})`;
		context.lineWidth = Math.max(0.8, width * 0.09);
		context.stroke();
	}

	for (let index = 0; index < appearance.ciliaCount; index += 1) {
		const angle = (index / appearance.ciliaCount) * Math.PI * 2;
		const cosine = Math.cos(angle);
		const sine = Math.sin(angle);
		const baseX = cosine * length * 0.84;
		const baseY = sine * width * 0.88 + appearance.curvature * width * cosine * 0.35;
		const sway = reducedMotion ? 0 : Math.sin(phase + index * 1.7) * 1.3;
		const ciliaLength = appearance.ciliaLength * (1 - appearance.elderAmount * 0.32);
		context.beginPath();
		context.moveTo(baseX, baseY);
		context.lineTo(
			baseX + cosine * ciliaLength - sine * sway,
			baseY + sine * ciliaLength + cosine * sway
		);
		context.strokeStyle = `hsla(${hue}, 72%, 78%, ${0.38 + organism.feedingPulse * 0.18})`;
		context.lineWidth = 0.8;
		context.stroke();
	}

	for (let index = 0; index < appearance.spikeCount; index += 1) {
		const fraction = (index + 1) / (appearance.spikeCount + 1);
		const x = -length * 0.68 + length * 1.25 * fraction;
		const side = index % 2 === 0 ? -1 : 1;
		const y = side * width * (0.74 + Math.sin(fraction * Math.PI) * 0.16);
		context.beginPath();
		context.moveTo(x, y);
		context.lineTo(x - length * 0.08, y + side * (3.5 + appearance.spikeCount * 0.25));
		context.strokeStyle = `hsla(${(hue + 35) % 360}, 74%, 78%, 0.7)`;
		context.lineWidth = 1.1;
		context.stroke();
	}

	traceBody(context, length, width, appearance.curvature);
	const membrane = context.createLinearGradient(-length, -width, length, width);
	membrane.addColorStop(
		0,
		`hsla(${(hue + 24) % 360}, ${membraneSaturation - 8}%, 36%, ${appearance.opacity})`
	);
	membrane.addColorStop(
		0.52,
		`hsla(${hue}, ${membraneSaturation}%, ${56 - appearance.elderAmount * 11}%, ${appearance.opacity})`
	);
	membrane.addColorStop(
		1,
		`hsla(${(hue + 68) % 360}, ${membraneSaturation}%, 67%, ${appearance.opacity * 0.82})`
	);
	context.fillStyle = membrane;
	context.shadowColor = `hsla(${hue}, 88%, 65%, ${0.28 + organism.feedingPulse * 0.3})`;
	context.shadowBlur = 5 + organism.feedingPulse * 10;
	context.fill();
	context.shadowBlur = 0;
	context.strokeStyle = `hsla(${(hue + 28) % 360}, 88%, ${80 - appearance.elderAmount * 18}%, 0.86)`;
	context.lineWidth = Math.max(1.2, width * 0.13);
	context.stroke();

	context.save();
	traceBody(context, length * 0.91, width * 0.84, appearance.curvature);
	context.clip();
	context.fillStyle = `rgba(207, 250, 254, ${0.08 + organism.feedingPulse * 0.08})`;
	context.beginPath();
	context.ellipse(length * 0.05, -width * 0.16, length * 0.7, width * 0.56, 0, 0, Math.PI * 2);
	context.fill();

	for (let index = 0; index < appearance.vacuoleCount; index += 1) {
		const unitX = seededUnit(organism.id, index * 2 + 1) * 1.34 - 0.67;
		const unitY = seededUnit(organism.id, index * 2 + 2) * 1.26 - 0.63;
		const x = unitX * length * 0.66;
		const y = unitY * width * (0.75 - Math.abs(unitX) * 0.35);
		const radius = Math.max(1.1, width * (0.1 + seededUnit(organism.id, index + 19) * 0.09));
		context.beginPath();
		context.arc(x, y, radius, 0, Math.PI * 2);
		context.fillStyle =
			index % 3 === 0
				? `rgba(253, 224, 71, ${0.28 + organism.feedingPulse * 0.42})`
				: `hsla(${(hue + 145 + index * 17) % 360}, 86%, 72%, 0.42)`;
		context.fill();
		context.strokeStyle = 'rgba(236, 254, 255, 0.24)';
		context.lineWidth = 0.65;
		context.stroke();
	}

	for (let index = 0; index < appearance.speckleCount; index += 1) {
		const x = (seededUnit(organism.id, index + 41) * 1.35 - 0.68) * length;
		const y = (seededUnit(organism.id, index + 59) * 1.18 - 0.59) * width;
		context.fillStyle = `hsla(${(hue + index * 47) % 360}, 90%, 78%, 0.54)`;
		context.fillRect(x, y, 1.2, 1.2);
	}

	const nucleusRadius = Math.max(1.9, width * 0.28 * appearance.nucleusScale);
	context.beginPath();
	context.arc(length * 0.14, -width * 0.06, nucleusRadius, 0, Math.PI * 2);
	context.fillStyle = `hsla(${(hue + 175) % 360}, 86%, 32%, 0.78)`;
	context.fill();
	context.strokeStyle = `hsla(${(hue + 205) % 360}, 92%, 82%, 0.7)`;
	context.lineWidth = 1;
	context.stroke();
	context.restore();

	const mouthRadius = Math.max(1.5, width * (0.13 + organism.genome.foodAttraction * 0.025));
	context.beginPath();
	context.arc(length * 0.72, appearance.curvature * width * 0.12, mouthRadius, 0, Math.PI * 2);
	context.fillStyle =
		organism.feedingPulse > 0
			? `rgba(253, 224, 71, ${0.72 + organism.feedingPulse * 0.25})`
			: 'rgba(2, 8, 14, 0.72)';
	context.fill();

	if (appearance.elderAmount > 0) {
		for (let scar = 0; scar < 3; scar += 1) {
			const x = -length * 0.45 + scar * length * 0.32;
			const y = (scar % 2 === 0 ? -1 : 1) * width * 0.34;
			context.beginPath();
			context.moveTo(x, y);
			context.lineTo(x + length * 0.12, y * 0.45);
			context.lineTo(x + length * 0.2, y * 0.72);
			context.strokeStyle = `rgba(226, 232, 240, ${appearance.elderAmount * 0.5})`;
			context.lineWidth = 0.8;
			context.stroke();
		}
	}

	if (highlighted) {
		context.beginPath();
		context.ellipse(0, 0, length + 5, width + 5, 0, 0, Math.PI * 2);
		context.strokeStyle = 'rgba(255, 255, 255, 0.96)';
		context.lineWidth = 1.6;
		context.stroke();
	}

	context.restore();
}

export function drawPredator(
	context: CanvasRenderingContext2D,
	predator: Predator,
	simulationTime: number,
	reducedMotion: boolean
) {
	const phase = reducedMotion ? 0 : simulationTime * 4.8 + predator.id * 1.7;
	const pulse = 1 + predator.feedingPulse * 0.18;
	const radius = predator.radius * pulse;
	context.save();
	context.translate(predator.x, predator.y);
	context.rotate(predator.heading);
	context.lineCap = 'round';

	for (let tentacle = 0; tentacle < 4; tentacle += 1) {
		const y = (tentacle - 1.5) * radius * 0.42;
		const wave = Math.sin(phase + tentacle * 1.4) * radius * 0.36;
		context.beginPath();
		context.moveTo(-radius * 0.65, y);
		context.bezierCurveTo(-radius * 1.2, y + wave, -radius * 1.8, y - wave, -radius * 2.35, y);
		context.strokeStyle = `rgba(251, 113, 133, ${0.46 + predator.feedingPulse * 0.26})`;
		context.lineWidth = 1.5;
		context.stroke();
	}

	context.beginPath();
	context.moveTo(radius * 1.25, 0);
	context.bezierCurveTo(radius * 0.72, -radius * 1.06, -radius * 0.62, -radius, -radius, 0);
	context.bezierCurveTo(-radius * 0.6, radius, radius * 0.72, radius * 1.06, radius * 1.25, 0);
	context.fillStyle = `rgba(225, 29, 72, ${0.68 + predator.feedingPulse * 0.18})`;
	context.fill();
	context.strokeStyle = 'rgba(254, 205, 211, 0.9)';
	context.lineWidth = 2;
	context.stroke();

	context.beginPath();
	context.arc(radius * 0.58, 0, radius * 0.32, -Math.PI * 0.58, Math.PI * 0.58);
	context.strokeStyle = 'rgba(10, 3, 8, 0.9)';
	context.lineWidth = radius * 0.28;
	context.stroke();
	for (const side of [-1, 1]) {
		context.beginPath();
		context.moveTo(radius * 0.48, side * radius * 0.12);
		context.lineTo(radius * 0.78, side * radius * 0.28);
		context.strokeStyle = 'rgba(255, 241, 242, 0.92)';
		context.lineWidth = 1.3;
		context.stroke();
	}

	context.beginPath();
	context.arc(-radius * 0.12, -radius * 0.28, radius * 0.18, 0, Math.PI * 2);
	context.fillStyle = 'rgba(255, 241, 242, 0.9)';
	context.fill();
	context.beginPath();
	context.arc(-radius * 0.06, -radius * 0.28, radius * 0.08, 0, Math.PI * 2);
	context.fillStyle = 'rgba(8, 3, 8, 0.9)';
	context.fill();

	if (predator.feedingPulse > 0) {
		context.beginPath();
		context.arc(-radius * 0.18, radius * 0.14, radius * 0.27, 0, Math.PI * 2);
		context.fillStyle = `rgba(253, 224, 71, ${predator.feedingPulse * 0.82})`;
		context.fill();
	}
	context.restore();
}

function eventLabel(event: SimulationEvent) {
	if (event.kind === 'birth') return 'BIRTH';
	if (event.kind === 'feeding') return 'GULP';
	if (event.kind === 'collision') return 'BUMP';
	if (event.cause === 'predation') return 'HUNTED';
	if (event.cause === 'starvation') return 'STARVED';
	if (event.cause === 'age') return 'OLD AGE';
	return 'PRESSURE';
}

export function drawSimulationEvent(context: CanvasRenderingContext2D, event: SimulationEvent) {
	const progress = clamp(event.age / event.duration);
	const alpha = 1 - progress;
	const inward = event.kind === 'feeding' || event.cause === 'predation';
	const radius = inward ? 15 - progress * 9 : 5 + progress * 19;
	const colour =
		event.kind === 'feeding'
			? `rgba(253, 224, 71, ${alpha})`
			: event.kind === 'collision'
				? `rgba(103, 232, 249, ${alpha})`
				: event.kind === 'birth'
					? `hsla(${event.hue}, 92%, 76%, ${alpha})`
					: event.cause === 'predation'
						? `rgba(251, 113, 133, ${alpha})`
						: `rgba(251, 146, 60, ${alpha})`;

	context.save();
	context.translate(event.x, event.y);
	context.beginPath();
	context.arc(0, 0, Math.max(2, radius), 0, Math.PI * 2);
	context.strokeStyle = colour;
	context.lineWidth = event.kind === 'birth' ? 2.4 : 1.6;
	context.stroke();

	const particleCount = event.kind === 'collision' ? 4 : 6;
	for (let particle = 0; particle < particleCount; particle += 1) {
		const angle = (particle / particleCount) * Math.PI * 2 + (event.hue * Math.PI) / 180;
		const distance = inward ? radius + 4 : 4 + progress * 16;
		context.beginPath();
		context.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, 1.2, 0, Math.PI * 2);
		context.fillStyle = colour;
		context.fill();
	}

	if (progress < 0.58) {
		context.font = '500 8px ui-monospace, SFMono-Regular, Menlo, monospace';
		context.textAlign = 'center';
		context.fillStyle = colour;
		context.fillText(eventLabel(event), 0, -18 - progress * 4);
	}
	context.restore();
}
