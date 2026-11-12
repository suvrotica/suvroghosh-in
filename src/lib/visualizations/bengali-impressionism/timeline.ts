import {
	paintStroke,
	paintSurface,
	prepareCanvas,
	strokeIntersectsFrame,
	transformToFrame,
	type Frame,
	type Painting
} from './brush';
import { clamp } from './brush-random';

const REVEAL_SPAN = 54;

/** Retains finished marks offscreen while the leading marks advance along their bristles. */
export class PaintingTimeline {
	private readonly context: CanvasRenderingContext2D | null;
	private readonly retained: CanvasRenderingContext2D | null;
	private committed = 0;
	private previous = -1;

	constructor(
		canvas: HTMLCanvasElement,
		private readonly painting: Painting,
		private readonly frame: Frame
	) {
		this.context = canvas.getContext('2d');
		const backing = canvas.ownerDocument.createElement('canvas');
		backing.width = canvas.width;
		backing.height = canvas.height;
		this.retained = backing.getContext('2d');
		if (this.retained) prepareCanvas(this.retained, frame);
	}

	draw(progress: number): void {
		const { context, retained, painting, frame } = this;
		const position = clamp(progress);
		if (!context || !retained || position === this.previous) return;

		const strokes = painting.strokes;
		const limit = position * (strokes.length + REVEAL_SPAN - 1);
		const complete = Math.min(strokes.length, Math.max(0, Math.floor(limit - REVEAL_SPAN) + 1));
		const leading = Math.min(strokes.length, Math.ceil(limit));
		if (complete < this.committed) {
			prepareCanvas(retained, frame);
			this.committed = 0;
		}

		for (let index = this.committed; index < complete; index += 1) {
			const stroke = strokes[index];
			if (strokeIntersectsFrame(stroke, frame)) paintStroke(retained, stroke);
		}
		this.committed = complete;

		context.resetTransform();
		context.drawImage(retained.canvas, 0, 0);
		transformToFrame(context, frame);
		for (let index = complete; index < leading; index += 1) {
			const stroke = strokes[index];
			if (strokeIntersectsFrame(stroke, frame)) {
				paintStroke(context, stroke, (limit - index) / REVEAL_SPAN);
			}
		}
		paintSurface(context, painting, frame);
		this.previous = position;
	}
}
