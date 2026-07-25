import { getFoodModifiers } from './food';
import { WORLD, ZONES } from './game-data';
import type { GameSettings } from './settings';
import type { StreetSimulation } from './simulation';
import type { StreetEntity } from './runtime-types';

type ScreenPoint = { x: number; y: number; scale: number };

const SIGN_WORDS = [
	'CHA',
	'BHAAT',
	'XEROX',
	'MOBILE REPAIR',
	'FRESH FISH',
	'COACHING',
	'NO PARKING',
	'PARKING'
];

function rgba(hex: string, alpha: number): string {
	const value = hex.replace('#', '');
	const normalized =
		value.length === 3
			? value
					.split('')
					.map((character) => character + character)
					.join('')
			: value;
	const number = Number.parseInt(normalized, 16);
	return `rgb(${(number >> 16) & 255} ${(number >> 8) & 255} ${number & 255} / ${alpha})`;
}

function hash(value: number): number {
	const x = Math.sin(value * 91.345 + 17.12) * 47_823.392;
	return x - Math.floor(x);
}

export class StreetRenderer {
	private canvas: HTMLCanvasElement;
	private context: CanvasRenderingContext2D;
	private settings: GameSettings;
	private width = 1;
	private height = 1;
	private dpr = 1;
	private portrait = false;
	private cameraX = 0;
	private screenScale = 1;
	private frameTime = 0;
	private destroyed = false;

	constructor(canvas: HTMLCanvasElement, settings: GameSettings) {
		const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
		if (!context) throw new Error('Canvas 2D is not available in this browser.');
		this.canvas = canvas;
		this.context = context;
		this.settings = { ...settings };
	}

	setSettings(settings: GameSettings): void {
		this.settings = { ...settings };
	}

	resize(width: number, height: number): void {
		this.width = Math.max(1, Math.floor(width));
		this.height = Math.max(1, Math.floor(height));
		this.portrait = this.height > this.width * 1.12;
		const lowDetail =
			this.settings.detailLevel === 'low' ||
			(this.settings.detailLevel === 'auto' &&
				(this.width < 520 || (navigator.hardwareConcurrency ?? 4) <= 4));
		const cap = lowDetail ? 1.25 : this.width >= 2_200 ? 1.5 : 1.75;
		this.dpr = Math.min(window.devicePixelRatio || 1, cap);
		const pixelWidth = Math.max(1, Math.round(this.width * this.dpr));
		const pixelHeight = Math.max(1, Math.round(this.height * this.dpr));
		if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
			this.canvas.width = pixelWidth;
			this.canvas.height = pixelHeight;
		}
	}

	private project(x: number, y: number): ScreenPoint {
		if (this.portrait) {
			const lateralWidth = WORLD.maxY - WORLD.minY + 82;
			const scale = this.width / lateralWidth;
			const screenX = (y - WORLD.minY + 41) * scale;
			const bottomAnchor = this.height * 0.7;
			const screenY = bottomAnchor - (x - this.cameraX) * scale;
			return { x: screenX, y: screenY, scale };
		}

		const scale = Math.min(this.height / WORLD.viewHeight, this.width / 1_050);
		const screenX = (x - this.cameraX) * scale + this.width * 0.26;
		const screenY = y * scale + (this.height - WORLD.viewHeight * scale) / 2;
		return { x: screenX, y: screenY, scale };
	}

	private visible(entity: StreetEntity): boolean {
		const point = this.project(entity.x, entity.y);
		const margin = Math.max(130, entity.radius * point.scale * 2);
		return (
			point.x > -margin &&
			point.x < this.width + margin &&
			point.y > -margin &&
			point.y < this.height + margin
		);
	}

	private drawBackground(simulation: StreetSimulation): void {
		const context = this.context;
		const zone = simulation.zone;
		context.fillStyle = '#2f3434';
		context.fillRect(0, 0, this.width, this.height);

		if (this.portrait) {
			const leftEdge = this.project(this.cameraX, WORLD.minY).x;
			const rightEdge = this.project(this.cameraX, WORLD.maxY).x;
			context.fillStyle = '#3f403c';
			context.fillRect(leftEdge, 0, rightEdge - leftEdge, this.height);
			context.fillStyle = zone.wall;
			context.fillRect(0, 0, Math.max(0, leftEdge + 13), this.height);
			context.fillStyle = rgba(zone.accent, 0.78);
			context.fillRect(rightEdge - 7, 0, this.width - rightEdge + 7, this.height);
			this.drawPortraitSegments(simulation);
		} else {
			const top = this.project(this.cameraX, WORLD.minY).y;
			const bottom = this.project(this.cameraX, WORLD.maxY).y;
			context.fillStyle = zone.wall;
			context.fillRect(0, 0, this.width, Math.max(0, top));
			context.fillStyle = '#8d836e';
			context.fillRect(0, top, this.width, bottom - top);
			context.fillStyle = '#353a3a';
			context.fillRect(0, bottom, this.width, this.height - bottom);
			context.fillStyle = rgba(zone.accent, 0.55);
			context.fillRect(0, top - 9, this.width, 13);
			this.drawLandscapeSegments(simulation);
		}

		if (simulation.weather !== 'dry') {
			context.fillStyle =
				simulation.weather === 'rain' ? 'rgb(51 72 78 / 0.18)' : 'rgb(54 72 74 / 0.1)';
			context.fillRect(0, 0, this.width, this.height);
		}
	}

	private drawLandscapeSegments(simulation: StreetSimulation): void {
		const context = this.context;
		const segmentStart = Math.floor((this.cameraX - 500) / 220) * 220;
		for (let x = segmentStart; x < this.cameraX + 1_700; x += 220) {
			const seed = Math.floor(x / 220);
			const zone =
				ZONES.find((candidate) => x >= candidate.start && x < candidate.end) ?? simulation.zone;
			const topPoint = this.project(x, WORLD.minY);
			const bottomPoint = this.project(x, WORLD.maxY);
			const next = this.project(x + 220, WORLD.minY);
			const segmentWidth = next.x - topPoint.x;

			context.strokeStyle = 'rgb(52 45 38 / 0.34)';
			context.lineWidth = Math.max(1, topPoint.scale * 2);
			context.beginPath();
			context.moveTo(topPoint.x, topPoint.y);
			context.lineTo(topPoint.x, bottomPoint.y);
			context.stroke();

			if (seed % 2 === 0) {
				const signWidth = Math.max(50, Math.abs(segmentWidth) * 0.58);
				const signY = Math.max(23, topPoint.y - 64 * topPoint.scale);
				context.save();
				context.translate(topPoint.x + segmentWidth * 0.18, signY);
				context.rotate((hash(seed) - 0.5) * 0.06);
				context.fillStyle = rgba(zone.accent, 0.9);
				context.fillRect(0, 0, signWidth, 35 * topPoint.scale);
				context.strokeStyle = 'rgb(43 33 27 / 0.8)';
				context.lineWidth = 2;
				context.strokeRect(0, 0, signWidth, 35 * topPoint.scale);
				context.fillStyle = '#2f251f';
				context.font = `800 ${Math.max(8, 12 * topPoint.scale)}px Roboto, sans-serif`;
				context.textAlign = 'center';
				context.textBaseline = 'middle';
				context.fillText(
					SIGN_WORDS[Math.abs(seed) % SIGN_WORDS.length],
					signWidth / 2,
					17 * topPoint.scale,
					signWidth - 8
				);
				context.restore();
			}

			context.strokeStyle = 'rgb(45 42 38 / 0.28)';
			context.lineWidth = Math.max(1, topPoint.scale * 1.3);
			context.beginPath();
			const crackY = this.project(x, WORLD.laneY[2] + (hash(seed + 7) - 0.5) * 90).y;
			context.moveTo(topPoint.x - 32 * topPoint.scale, crackY);
			context.lineTo(topPoint.x + 24 * topPoint.scale, crackY + 11 * topPoint.scale);
			context.lineTo(topPoint.x + 51 * topPoint.scale, crackY - 7 * topPoint.scale);
			context.stroke();
		}

		this.drawWires(false);
		this.drawDestination();
	}

	private drawPortraitSegments(simulation: StreetSimulation): void {
		const context = this.context;
		const scale = this.project(this.cameraX, WORLD.minY).scale;
		const visibleForward = this.height / scale;
		const segmentStart = Math.floor((this.cameraX - 500) / 210) * 210;
		for (let x = segmentStart; x < this.cameraX + visibleForward + 500; x += 210) {
			const seed = Math.floor(x / 210);
			const left = this.project(x, WORLD.minY);
			const right = this.project(x, WORLD.maxY);
			context.strokeStyle = 'rgb(35 32 28 / 0.32)';
			context.lineWidth = 2;
			context.beginPath();
			context.moveTo(left.x, left.y);
			context.lineTo(right.x, right.y);
			context.stroke();
			if (seed % 3 === 0) {
				context.save();
				context.translate(9, left.y - 54 * scale);
				context.rotate(-Math.PI / 2);
				context.fillStyle = rgba(simulation.zone.accent, 0.9);
				context.fillRect(0, 0, 95 * scale, 31 * scale);
				context.fillStyle = '#2c211c';
				context.font = `800 ${Math.max(8, 11 * scale)}px Roboto, sans-serif`;
				context.textAlign = 'center';
				context.textBaseline = 'middle';
				context.fillText(
					SIGN_WORDS[Math.abs(seed) % SIGN_WORDS.length],
					47 * scale,
					15 * scale,
					88 * scale
				);
				context.restore();
			}
		}
		this.drawWires(true);
		this.drawDestination();
	}

	private drawWires(portrait: boolean): void {
		const context = this.context;
		context.save();
		context.strokeStyle = 'rgb(35 29 26 / 0.56)';
		context.lineWidth = 1.5;
		for (let index = 0; index < 4; index += 1) {
			context.beginPath();
			if (portrait) {
				const x = 16 + index * 7;
				context.moveTo(x, -20);
				context.bezierCurveTo(
					x + 42,
					this.height * 0.3,
					x - 32,
					this.height * 0.68,
					x + 12,
					this.height + 20
				);
			} else {
				const y = 28 + index * 12;
				context.moveTo(-20, y);
				context.bezierCurveTo(
					this.width * 0.28,
					y + 34,
					this.width * 0.66,
					y - 23,
					this.width + 20,
					y + 20
				);
			}
			context.stroke();
		}
		context.restore();
	}

	private drawDestination(): void {
		const point = this.project(WORLD.destinationX, WORLD.laneY[2]);
		if (
			point.x < -200 ||
			point.x > this.width + 200 ||
			point.y < -200 ||
			point.y > this.height + 200
		) {
			return;
		}
		const context = this.context;
		const size = point.scale;
		context.save();
		context.translate(point.x, point.y);
		context.strokeStyle = '#f5c85e';
		context.lineWidth = Math.max(3, 8 * size);
		context.beginPath();
		if (this.portrait) {
			context.moveTo(-185 * size, 0);
			context.lineTo(185 * size, 0);
			context.moveTo(-185 * size, -25 * size);
			context.lineTo(-185 * size, 28 * size);
			context.moveTo(185 * size, -25 * size);
			context.lineTo(185 * size, 28 * size);
		} else {
			context.moveTo(0, -170 * size);
			context.lineTo(0, 170 * size);
			context.moveTo(-25 * size, -170 * size);
			context.lineTo(28 * size, -170 * size);
			context.moveTo(-25 * size, 170 * size);
			context.lineTo(28 * size, 170 * size);
		}
		context.stroke();
		context.fillStyle = '#291f18';
		context.strokeStyle = '#f5c85e';
		context.lineWidth = 3;
		context.beginPath();
		context.roundRect(-83 * size, -27 * size, 166 * size, 54 * size, 8 * size);
		context.fill();
		context.stroke();
		context.fillStyle = '#fff4d5';
		context.font = `900 ${Math.max(11, 18 * size)}px Roboto, sans-serif`;
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillText('DESTINATION', 0, 0, 150 * size);
		context.restore();
	}

	private entityTransform(
		entity: StreetEntity,
		draw: (context: CanvasRenderingContext2D, scale: number) => void
	): void {
		const point = this.project(entity.x, entity.y);
		const context = this.context;
		context.save();
		context.translate(point.x, point.y);
		const visualScale = point.scale;
		context.rotate(
			entity.kind === 'rickshaw' || entity.kind === 'motorbike'
				? entity.rotation * 0.18
				: entity.rotation
		);
		context.globalAlpha = entity.state === 'yielding' ? 0.68 : 1;
		draw(context, visualScale);
		context.restore();
	}

	private drawPothole(entity: StreetEntity): void {
		this.entityTransform(entity, (context, scale) => {
			const width = (entity.width ?? entity.radius * 2) * scale;
			const height = (entity.height ?? entity.radius) * scale;
			context.fillStyle = entity.wet ? '#32494d' : '#393936';
			context.strokeStyle = entity.hidden ? 'rgb(46 45 40 / 0.45)' : '#242523';
			context.lineWidth = Math.max(1.5, 4 * scale);
			context.beginPath();
			context.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
			context.fill();
			context.stroke();
			if (entity.wet) {
				context.strokeStyle = 'rgb(196 215 207 / 0.58)';
				context.lineWidth = Math.max(1, 2 * scale);
				context.beginPath();
				context.ellipse(
					-width * 0.08,
					-height * 0.1,
					width * 0.27,
					height * 0.18,
					0,
					0,
					Math.PI * 1.7
				);
				context.stroke();
			}
		});
	}

	private drawDrain(entity: StreetEntity): void {
		this.entityTransform(entity, (context, scale) => {
			const width = (entity.width ?? 110) * scale;
			const height = (entity.height ?? 32) * scale;
			context.fillStyle = '#171c1b';
			context.strokeStyle = '#5f5c4e';
			context.lineWidth = Math.max(2, 5 * scale);
			context.beginPath();
			context.roundRect(-width / 2, -height / 2, width, height, 5 * scale);
			context.fill();
			context.stroke();
			context.strokeStyle = 'rgb(139 115 75 / 0.75)';
			context.lineWidth = Math.max(3, 8 * scale);
			for (let x = -width * 0.34; x <= width * 0.35; x += width * 0.34) {
				context.beginPath();
				context.moveTo(x - 13 * scale, -height * 0.68);
				context.lineTo(x + 12 * scale, height * 0.68);
				context.stroke();
			}
			if (entity.hidden) {
				context.fillStyle = 'rgb(102 83 56 / 0.88)';
				context.save();
				context.rotate(-0.08);
				context.fillRect(-width * 0.42, -height * 0.34, width * 0.84, height * 0.42);
				context.restore();
				context.fillStyle = '#4d5747';
				context.beginPath();
				context.arc(width * 0.28, height * 0.08, 8 * scale, 0, Math.PI * 2);
				context.fill();
			}
		});
	}

	private drawPedestrian(entity: StreetEntity): void {
		this.entityTransform(entity, (context, scale) => {
			const bob =
				entity.state === 'idle' || this.settings.reducedMotion
					? 0
					: Math.sin(this.frameTime * 0.008 + entity.phase! * 9) * 2.2 * scale;
			const umbrella = entity.subtype === 'umbrella' && entity.radius > 25;
			context.fillStyle = 'rgb(26 24 21 / 0.28)';
			context.beginPath();
			context.ellipse(0, 17 * scale, entity.radius * scale * 0.75, 8 * scale, 0, 0, Math.PI * 2);
			context.fill();
			context.strokeStyle = '#2d2925';
			context.lineWidth = Math.max(2, 6 * scale);
			context.lineCap = 'round';
			context.beginPath();
			context.moveTo(-5 * scale, 14 * scale + bob);
			context.lineTo(-8 * scale, 34 * scale + bob);
			context.moveTo(5 * scale, 14 * scale + bob);
			context.lineTo(10 * scale, 34 * scale + bob);
			context.stroke();
			context.fillStyle = entity.color ?? '#536a49';
			context.strokeStyle = '#332c27';
			context.lineWidth = Math.max(1.5, 3 * scale);
			context.beginPath();
			context.roundRect(-14 * scale, -17 * scale + bob, 28 * scale, 36 * scale, 8 * scale);
			context.fill();
			context.stroke();
			context.fillStyle = '#9c6849';
			context.beginPath();
			context.arc(0, -27 * scale + bob, 10 * scale, 0, Math.PI * 2);
			context.fill();
			if (entity.subtype === 'phone-stop' || entity.subtype === 'phone-walker') {
				context.fillStyle = '#171819';
				context.fillRect(9 * scale, -26 * scale + bob, 6 * scale, 12 * scale);
			}
			if (entity.subtype === 'large-bags') {
				context.fillStyle = '#ad813e';
				context.fillRect(-28 * scale, -2 * scale + bob, 15 * scale, 25 * scale);
				context.fillRect(15 * scale, -1 * scale + bob, 17 * scale, 27 * scale);
			}
			if (umbrella) {
				context.strokeStyle = '#332c27';
				context.lineWidth = Math.max(1, 2.5 * scale);
				context.beginPath();
				context.moveTo(0, -21 * scale);
				context.lineTo(0, -59 * scale);
				context.stroke();
				context.fillStyle = rgba(entity.color ?? '#315e67', 0.96);
				context.beginPath();
				context.arc(0, -56 * scale, 35 * scale, Math.PI, 0);
				context.closePath();
				context.fill();
				context.stroke();
			}
		});
	}

	private drawDog(entity: StreetEntity): void {
		this.entityTransform(entity, (context, scale) => {
			const sleeping = entity.state === 'sleeping';
			context.fillStyle = 'rgb(24 21 18 / 0.26)';
			context.beginPath();
			context.ellipse(0, 13 * scale, 29 * scale, 8 * scale, 0, 0, Math.PI * 2);
			context.fill();
			context.fillStyle = entity.color ?? '#8a603d';
			context.strokeStyle = '#3b2d23';
			context.lineWidth = Math.max(1.5, 3 * scale);
			context.beginPath();
			context.ellipse(
				0,
				0,
				(sleeping ? 28 : 24) * scale,
				(sleeping ? 14 : 17) * scale,
				0,
				0,
				Math.PI * 2
			);
			context.fill();
			context.stroke();
			context.beginPath();
			context.arc(23 * scale, (sleeping ? 2 : -8) * scale, 11 * scale, 0, Math.PI * 2);
			context.fill();
			context.stroke();
			context.beginPath();
			context.moveTo(19 * scale, -14 * scale);
			context.lineTo(14 * scale, -24 * scale);
			context.lineTo(26 * scale, -17 * scale);
			context.fill();
			if (sleeping) {
				context.fillStyle = '#f4dfb3';
				context.font = `800 ${Math.max(8, 13 * scale)}px Roboto, sans-serif`;
				context.fillText('z', 29 * scale, -19 * scale);
			}
		});
	}

	private drawCow(entity: StreetEntity): void {
		this.entityTransform(entity, (context, scale) => {
			context.fillStyle = 'rgb(24 21 18 / 0.31)';
			context.beginPath();
			context.ellipse(0, 27 * scale, 57 * scale, 15 * scale, 0, 0, Math.PI * 2);
			context.fill();
			context.fillStyle = entity.color ?? '#d6c7a2';
			context.strokeStyle = '#4b4034';
			context.lineWidth = Math.max(2, 4 * scale);
			context.beginPath();
			context.ellipse(-7 * scale, 0, 50 * scale, 32 * scale, 0, 0, Math.PI * 2);
			context.fill();
			context.stroke();
			context.beginPath();
			context.ellipse(42 * scale, -8 * scale, 25 * scale, 21 * scale, -0.18, 0, Math.PI * 2);
			context.fill();
			context.stroke();
			context.strokeStyle = '#4b4034';
			context.lineWidth = Math.max(2, 7 * scale);
			context.lineCap = 'round';
			for (const x of [-38, -8, 22, 43]) {
				context.beginPath();
				context.moveTo(x * scale, 21 * scale);
				context.lineTo((x + (x % 2 ? 3 : -2)) * scale, 51 * scale);
				context.stroke();
			}
			context.lineWidth = Math.max(1.5, 3 * scale);
			context.beginPath();
			context.moveTo(30 * scale, -25 * scale);
			context.lineTo(25 * scale, -42 * scale);
			context.moveTo(52 * scale, -24 * scale);
			context.lineTo(60 * scale, -40 * scale);
			context.stroke();
			context.fillStyle = '#241f1b';
			context.beginPath();
			context.arc(50 * scale, -9 * scale, 2.5 * scale, 0, Math.PI * 2);
			context.fill();
		});
	}

	private drawRickshaw(entity: StreetEntity): void {
		this.entityTransform(entity, (context, scale) => {
			context.fillStyle = 'rgb(20 18 17 / 0.28)';
			context.beginPath();
			context.ellipse(0, 22 * scale, 55 * scale, 13 * scale, 0, 0, Math.PI * 2);
			context.fill();
			context.strokeStyle = '#202422';
			context.lineWidth = Math.max(2, 7 * scale);
			for (const x of [-36, 38]) {
				context.beginPath();
				context.arc(x * scale, 19 * scale, 22 * scale, 0, Math.PI * 2);
				context.stroke();
			}
			context.fillStyle = entity.color ?? '#38656b';
			context.strokeStyle = '#2c2925';
			context.lineWidth = Math.max(1.5, 3 * scale);
			context.beginPath();
			context.roundRect(-43 * scale, -31 * scale, 67 * scale, 54 * scale, 9 * scale);
			context.fill();
			context.stroke();
			context.fillStyle = '#d8b24f';
			context.beginPath();
			context.moveTo(-43 * scale, -28 * scale);
			context.lineTo(-31 * scale, -49 * scale);
			context.lineTo(24 * scale, -47 * scale);
			context.lineTo(27 * scale, -28 * scale);
			context.closePath();
			context.fill();
			context.stroke();
			context.strokeStyle = '#2c2925';
			context.lineWidth = Math.max(2, 5 * scale);
			context.beginPath();
			context.moveTo(22 * scale, 8 * scale);
			context.lineTo(69 * scale, -3 * scale);
			context.lineTo(82 * scale, 12 * scale);
			context.stroke();
		});
	}

	private drawMotorbike(entity: StreetEntity): void {
		this.entityTransform(entity, (context, scale) => {
			if (entity.state === 'warning') {
				const pulse = this.settings.reducedMotion
					? 1
					: 0.75 + Math.sin(this.frameTime * 0.02) * 0.22;
				context.strokeStyle = this.settings.highContrastWarnings ? '#fff' : '#ffbf3f';
				context.lineWidth = Math.max(3, 7 * scale);
				context.setLineDash([12 * scale, 8 * scale]);
				context.beginPath();
				context.arc(0, 0, 45 * scale * pulse, 0, Math.PI * 2);
				context.stroke();
				context.setLineDash([]);
				context.fillStyle = this.settings.highContrastWarnings ? '#000' : '#a93426';
				context.beginPath();
				context.moveTo(0, -31 * scale);
				context.lineTo(22 * scale, 14 * scale);
				context.lineTo(-22 * scale, 14 * scale);
				context.closePath();
				context.fill();
				context.fillStyle = '#fff';
				context.font = `900 ${Math.max(10, 19 * scale)}px Roboto, sans-serif`;
				context.textAlign = 'center';
				context.textBaseline = 'middle';
				context.fillText('!', 0, 1 * scale);
				return;
			}
			context.fillStyle = 'rgb(20 18 17 / 0.3)';
			context.beginPath();
			context.ellipse(0, 19 * scale, 48 * scale, 11 * scale, 0, 0, Math.PI * 2);
			context.fill();
			context.strokeStyle = '#202221';
			context.lineWidth = Math.max(2, 7 * scale);
			for (const x of [-31, 31]) {
				context.beginPath();
				context.arc(x * scale, 18 * scale, 16 * scale, 0, Math.PI * 2);
				context.stroke();
			}
			context.fillStyle = entity.color ?? '#b13f30';
			context.strokeStyle = '#292521';
			context.lineWidth = Math.max(1.5, 3 * scale);
			context.beginPath();
			context.moveTo(-26 * scale, 10 * scale);
			context.lineTo(-5 * scale, -16 * scale);
			context.lineTo(28 * scale, 8 * scale);
			context.lineTo(5 * scale, 15 * scale);
			context.closePath();
			context.fill();
			context.stroke();
			context.fillStyle = '#9b6746';
			context.beginPath();
			context.arc(0, -38 * scale, 10 * scale, 0, Math.PI * 2);
			context.fill();
			context.fillStyle = '#3d554d';
			context.beginPath();
			context.roundRect(-11 * scale, -30 * scale, 25 * scale, 28 * scale, 6 * scale);
			context.fill();
		});
	}

	private drawHawker(entity: StreetEntity): void {
		this.entityTransform(entity, (context, scale) => {
			const width = entity.radius * 1.8 * scale;
			const height = 61 * scale;
			context.fillStyle = 'rgb(22 19 17 / 0.3)';
			context.beginPath();
			context.ellipse(0, height * 0.48, width * 0.58, 11 * scale, 0, 0, Math.PI * 2);
			context.fill();
			context.fillStyle = '#49342a';
			context.fillRect(-width / 2, -height * 0.1, width, height * 0.56);
			context.fillStyle = entity.color ?? '#b76d39';
			context.strokeStyle = '#382a23';
			context.lineWidth = Math.max(1.5, 3 * scale);
			context.beginPath();
			context.moveTo(-width * 0.62, -height * 0.1);
			context.lineTo(-width * 0.43, -height * 0.65);
			context.lineTo(width * 0.45, -height * 0.62);
			context.lineTo(width * 0.62, -height * 0.08);
			context.closePath();
			context.fill();
			context.stroke();
			context.fillStyle = '#d8b151';
			for (let index = 0; index < 5; index += 1) {
				context.beginPath();
				context.arc(-width * 0.34 + index * width * 0.17, height * 0.06, 5 * scale, 0, Math.PI * 2);
				context.fill();
			}
		});
	}

	private drawDebris(entity: StreetEntity): void {
		this.entityTransform(entity, (context, scale) => {
			const width = (entity.width ?? 80) * scale;
			const height = (entity.height ?? 44) * scale;
			context.fillStyle = entity.subtype === 'sand' ? '#b89968' : (entity.color ?? '#a1784e');
			context.strokeStyle = '#5a4635';
			context.lineWidth = Math.max(1.5, 3 * scale);
			if (entity.subtype === 'bamboo') {
				context.lineWidth = Math.max(4, 9 * scale);
				for (let index = -1; index <= 1; index += 1) {
					context.beginPath();
					context.moveTo(-width / 2, index * 10 * scale);
					context.lineTo(width / 2, (index - 0.5) * 8 * scale);
					context.stroke();
				}
			} else if (entity.subtype === 'sand') {
				context.beginPath();
				context.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
				context.fill();
				context.stroke();
			} else {
				for (let index = 0; index < 5; index += 1) {
					const x = -width * 0.42 + (index % 3) * width * 0.34;
					const y = -height * 0.25 + Math.floor(index / 3) * height * 0.44;
					context.fillRect(x, y, width * 0.27, height * 0.28);
					context.strokeRect(x, y, width * 0.27, height * 0.28);
				}
			}
		});
	}

	private drawFood(entity: StreetEntity): void {
		this.entityTransform(entity, (context, scale) => {
			const width = 76 * scale;
			context.fillStyle = 'rgb(20 18 17 / 0.28)';
			context.beginPath();
			context.ellipse(0, 30 * scale, width * 0.55, 9 * scale, 0, 0, Math.PI * 2);
			context.fill();
			context.fillStyle = '#3d2c24';
			context.fillRect(-width / 2, -4 * scale, width, 37 * scale);
			context.fillStyle = entity.color ?? '#b25f32';
			context.beginPath();
			context.moveTo(-width * 0.62, -5 * scale);
			context.lineTo(-width * 0.44, -47 * scale);
			context.lineTo(width * 0.44, -47 * scale);
			context.lineTo(width * 0.62, -5 * scale);
			context.closePath();
			context.fill();
			context.strokeStyle = '#382820';
			context.lineWidth = Math.max(1.5, 3 * scale);
			context.stroke();
			context.fillStyle = '#f4dfae';
			context.font = `900 ${Math.max(8, 12 * scale)}px Roboto, sans-serif`;
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			context.fillText(
				entity.consumed ? 'SOLD' : String(entity.subtype).toLocaleUpperCase('en'),
				0,
				-23 * scale,
				width * 0.85
			);
			if (entity.subtype === 'tea' && !entity.consumed) {
				context.strokeStyle = 'rgb(244 232 205 / 0.65)';
				context.lineWidth = Math.max(1, 2 * scale);
				for (let index = -1; index <= 1; index += 1) {
					const sway = this.settings.reducedMotion
						? 0
						: Math.sin(this.frameTime * 0.002 + index) * 5;
					context.beginPath();
					context.moveTo(index * 13 * scale, -2 * scale);
					context.bezierCurveTo(
						(index * 13 + sway) * scale,
						-18 * scale,
						(index * 13 - sway) * scale,
						-27 * scale,
						index * 13 * scale,
						-39 * scale
					);
					context.stroke();
				}
			}
		});
	}

	private drawPlayer(simulation: StreetSimulation): void {
		const player = simulation.player;
		const point = this.project(player.x, player.y);
		const context = this.context;
		const scale = point.scale;
		const bob =
			this.settings.reducedMotion || Math.hypot(player.vx, player.vy) < 5
				? 0
				: Math.sin(this.frameTime * (player.dashing ? 0.018 : 0.012)) * 2.7 * scale;
		context.save();
		context.translate(point.x, point.y);
		context.fillStyle = 'rgb(15 13 12 / 0.36)';
		context.beginPath();
		context.ellipse(0, 19 * scale, 22 * scale, 8 * scale, 0, 0, Math.PI * 2);
		context.fill();
		if (player.dashing) {
			context.strokeStyle = '#f0bd4f';
			context.lineWidth = Math.max(2, 4 * scale);
			context.setLineDash([8 * scale, 5 * scale]);
			context.beginPath();
			context.arc(0, 0, 29 * scale, 0, Math.PI * 2);
			context.stroke();
			context.setLineDash([]);
		}
		context.strokeStyle = '#2b2723';
		context.lineWidth = Math.max(2, 6 * scale);
		context.lineCap = 'round';
		context.beginPath();
		context.moveTo(-5 * scale, 14 * scale + bob);
		context.lineTo(-10 * scale, 38 * scale + bob);
		context.moveTo(5 * scale, 14 * scale + bob);
		context.lineTo(11 * scale, 38 * scale + bob);
		context.stroke();
		context.fillStyle = '#d6a64b';
		context.strokeStyle = '#2b2723';
		context.lineWidth = Math.max(1.5, 3 * scale);
		context.beginPath();
		context.roundRect(-16 * scale, -20 * scale + bob, 32 * scale, 39 * scale, 8 * scale);
		context.fill();
		context.stroke();
		context.fillStyle = '#8f5c40';
		context.beginPath();
		context.arc(0, -31 * scale + bob, 11 * scale, 0, Math.PI * 2);
		context.fill();
		context.stroke();
		context.fillStyle = '#20201e';
		context.beginPath();
		context.arc(-4 * scale, -33 * scale + bob, 1.6 * scale, 0, Math.PI * 2);
		context.arc(4 * scale, -33 * scale + bob, 1.6 * scale, 0, Math.PI * 2);
		context.fill();
		if (player.muddyShoe) {
			context.fillStyle = '#3b342c';
			context.beginPath();
			context.ellipse(11 * scale, 39 * scale + bob, 9 * scale, 4 * scale, 0, 0, Math.PI * 2);
			context.fill();
		}
		context.restore();
	}

	private drawRain(simulation: StreetSimulation): void {
		if (simulation.weather !== 'rain') return;
		const context = this.context;
		const lowDetail =
			this.settings.detailLevel === 'low' ||
			(this.settings.detailLevel === 'auto' && this.width < 560);
		const count = this.settings.reducedMotion ? 28 : lowDetail ? 48 : 95;
		context.save();
		context.strokeStyle = 'rgb(207 226 222 / 0.34)';
		context.lineWidth = 1.2;
		for (let index = 0; index < count; index += 1) {
			const x = hash(index * 7.3 + 2) * this.width;
			const baseY = hash(index * 11.7 + 9) * this.height;
			const movement = this.settings.reducedMotion
				? 0
				: (this.frameTime * (0.22 + hash(index))) % this.height;
			const y = (baseY + movement) % this.height;
			context.beginPath();
			context.moveTo(x, y);
			context.lineTo(x - 5, y + (this.settings.reducedMotion ? 8 : 16));
			context.stroke();
		}
		context.restore();
	}

	private drawHallucinations(simulation: StreetSimulation): void {
		const modifiers = getFoodModifiers(simulation.food, simulation.elapsedMs);
		if (!modifiers.hallucinatedPotholes) return;
		const context = this.context;
		context.save();
		context.globalAlpha = 0.26;
		for (const entity of simulation.entities) {
			if (entity.kind !== 'pothole' || !this.visible(entity)) continue;
			const point = this.project(entity.x + 55, entity.y + 35);
			context.fillStyle = '#222a2a';
			context.beginPath();
			context.ellipse(
				point.x,
				point.y,
				entity.radius * point.scale,
				entity.radius * point.scale * 0.48,
				0,
				0,
				Math.PI * 2
			);
			context.fill();
		}
		context.restore();
	}

	render(simulation: StreetSimulation, frameTime: number): void {
		if (this.destroyed) return;
		this.frameTime = frameTime;
		const desiredCamera = simulation.player.x;
		this.cameraX += (desiredCamera - this.cameraX) * (this.settings.reducedMotion ? 0.22 : 0.1);
		this.cameraX = Math.max(0, Math.min(WORLD.destinationX, this.cameraX));
		this.screenScale = this.project(this.cameraX, WORLD.laneY[2]).scale;
		const context = this.context;
		context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		context.clearRect(0, 0, this.width, this.height);
		context.save();
		if (simulation.cameraShake > 0 && !this.settings.reducedMotion) {
			const amount = simulation.cameraShake * 7;
			context.translate(
				Math.sin(frameTime * 0.057) * amount,
				Math.cos(frameTime * 0.073) * amount * 0.6
			);
		}
		if (simulation.nearMissPulse > 0 && !this.settings.reducedMotion) {
			const zoom = 1 + simulation.nearMissPulse * 0.012;
			context.translate(this.width / 2, this.height / 2);
			context.scale(zoom, zoom);
			context.translate(-this.width / 2, -this.height / 2);
		}
		this.drawBackground(simulation);

		const visibleEntities = simulation.entities
			.filter((entity) => entity.active && this.visible(entity))
			.sort((left, right) => left.y - right.y || left.x - right.x);
		for (const entity of visibleEntities) {
			switch (entity.kind) {
				case 'pothole':
					this.drawPothole(entity);
					break;
				case 'drain':
					this.drawDrain(entity);
					break;
				case 'pedestrian':
					this.drawPedestrian(entity);
					break;
				case 'dog':
					this.drawDog(entity);
					break;
				case 'cow':
					this.drawCow(entity);
					break;
				case 'rickshaw':
					this.drawRickshaw(entity);
					break;
				case 'motorbike':
					this.drawMotorbike(entity);
					break;
				case 'hawker':
					this.drawHawker(entity);
					break;
				case 'debris':
					this.drawDebris(entity);
					break;
				case 'food':
					this.drawFood(entity);
					break;
			}
		}
		this.drawHallucinations(simulation);
		this.drawPlayer(simulation);
		this.drawRain(simulation);
		if (simulation.splashVeil > 0) {
			context.fillStyle = `rgb(72 92 94 / ${Math.min(0.22, simulation.splashVeil * 0.2)})`;
			context.fillRect(0, 0, this.width, this.height);
			context.strokeStyle = `rgb(220 229 219 / ${simulation.splashVeil * 0.35})`;
			context.lineWidth = 2;
			for (let index = 0; index < 9; index += 1) {
				const x = ((index * 167 + frameTime * 0.08) % (this.width + 80)) - 40;
				const y = ((index * 83 + 47) % Math.max(1, this.height - 30)) + 15;
				context.beginPath();
				context.arc(x, y, 5 + (index % 3) * 4, 0.2, Math.PI * 1.7);
				context.stroke();
			}
		}
		context.restore();
	}

	destroy(): void {
		this.destroyed = true;
		this.context.setTransform(1, 0, 0, 1, 0, 0);
		this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
	}
}
