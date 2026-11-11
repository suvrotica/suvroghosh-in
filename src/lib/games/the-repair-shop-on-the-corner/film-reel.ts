import { SCREENING_DURATION_SECONDS } from './state';

/**
 * Draws the 8mm optical focus test target onto a 2D canvas (used on the 3D workbench test card).
 * `sharpness` is 0..1 where 1.0 is crisp focal lock.
 */
export function drawProjectorTestCard(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	sharpness: number,
	lampLit: boolean
): void {
	ctx.save();
	ctx.clearRect(0, 0, width, height);

	if (!lampLit) {
		ctx.fillStyle = '#dbd1be';
		ctx.fillRect(0, 0, width, height);
		ctx.strokeStyle = '#b5a890';
		ctx.lineWidth = 4;
		ctx.strokeRect(10, 10, width - 20, height - 20);
		ctx.fillStyle = '#6f6353';
		ctx.font = '600 18px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText('BENCH FOCUS CARD (LAMP OFF)', width * 0.5, height * 0.52);
		ctx.restore();
		return;
	}

	// Warm tungsten illuminated card surface
	const grad = ctx.createRadialGradient(
		width * 0.5,
		height * 0.5,
		width * 0.08,
		width * 0.5,
		height * 0.5,
		width * 0.65
	);
	grad.addColorStop(0, '#fff9e6');
	grad.addColorStop(0.75, '#f6e7c4');
	grad.addColorStop(1, '#dec698');
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, width, height);

	// Defocus simulation: draw crisp vector pattern with multi-offset ghosting when out of focus
	const blurPx = Math.max(0, (1 - sharpness) * 9.5);
	const passes: [number, number, number][] =
		blurPx < 0.65
			? [[0, 0, 1]]
			: [
					[-blurPx, -blurPx * 0.6, 0.2],
					[blurPx, -blurPx * 0.5, 0.2],
					[-blurPx * 0.6, blurPx, 0.2],
					[blurPx * 0.8, blurPx * 0.7, 0.2],
					[0, 0, 0.35]
				];

	for (const [ox, oy, alpha] of passes) {
		ctx.save();
		ctx.translate(ox, oy);
		ctx.globalAlpha = alpha;
		ctx.strokeStyle = '#251d16';
		ctx.fillStyle = '#251d16';

		// Outer registration frame
		ctx.lineWidth = 3;
		ctx.strokeRect(18, 18, width - 36, height - 36);

		// Center crosshairs
		const cx = width * 0.5;
		const cy = height * 0.52;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(32, cy);
		ctx.lineTo(width - 32, cy);
		ctx.moveTo(cx, 36);
		ctx.lineTo(cx, height - 30);
		ctx.stroke();

		// Concentric resolution rings
		for (const r of [24, 48, 76, 104]) {
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.stroke();
		}

		// Corner resolution bars
		for (const [bx, by] of [
			[40, 44],
			[width - 84, 44],
			[40, height - 74],
			[width - 84, height - 74]
		]) {
			for (let i = 0; i < 5; i += 1) {
				ctx.fillRect(bx + i * 9, by, 4, 28);
			}
		}

		// Title & calibration lettering
		ctx.font = 'bold 17px serif';
		ctx.textAlign = 'center';
		ctx.fillText('KUSUMTALA FILM CLUB · 8MM', cx, 44);
		ctx.font = '600 13px monospace';
		ctx.fillText(sharpness >= 0.86 ? 'FOCUS SHARP' : 'ADJUST LENS BARREL', cx, height - 28);
		ctx.restore();
	}

	ctx.restore();
}

/**
 * Renders a frame of the original self-hosted short animated film onto the 3D courtyard cloth screen.
 */
export function drawCourtyardShortFilmFrame(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	elapsedSeconds: number,
	reducedMotion = false
): void {
	ctx.save();

	// Quantize to classic 18 fps 8mm film cadence unless reduced motion is active
	const quantT = reducedMotion ? elapsedSeconds : Math.floor(elapsedSeconds * 18) / 18;
	const loopT =
		((quantT % SCREENING_DURATION_SECONDS) + SCREENING_DURATION_SECONDS) %
		SCREENING_DURATION_SECONDS;

	// Subtle warm tungsten base on cotton cloth
	const bg = ctx.createLinearGradient(0, 0, 0, height);
	bg.addColorStop(0, '#f8e6bf');
	bg.addColorStop(1, '#e6c893');
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, width, height);

	const jitterX = reducedMotion ? 0 : Math.sin(quantT * 37.3) * 0.9;
	const jitterY = reducedMotion ? 0 : Math.cos(quantT * 29.1) * 0.7;
	ctx.translate(jitterX, jitterY);

	if (loopT < 6) {
		// Chapter 1: Title Card
		ctx.strokeStyle = '#3c291b';
		ctx.lineWidth = 4;
		ctx.strokeRect(26, 22, width - 52, height - 44);
		ctx.lineWidth = 1.5;
		ctx.strokeRect(34, 30, width - 68, height - 60);

		ctx.fillStyle = '#3c291b';
		ctx.textAlign = 'center';
		ctx.font = 'bold 16px sans-serif';
		ctx.fillText('KUSUMTALA COURTYARD BIOSCOPE', width * 0.5, height * 0.28);

		ctx.font = 'bold 30px serif';
		ctx.fillText('Afternoon Across the Roofs', width * 0.5, height * 0.5);

		ctx.font = '600 20px serif';
		ctx.fillText('বিকেলের ছাদ', width * 0.5, height * 0.66);

		ctx.font = '14px monospace';
		ctx.fillText('REEL I · RESTORED ON THE CORNER', width * 0.5, height * 0.81);
	} else if (loopT < 15) {
		// Chapter 2: Calcutta Terraces & Kites
		const p = (loopT - 6) / 9;
		const sky = ctx.createLinearGradient(0, 0, 0, height * 0.72);
		sky.addColorStop(0, '#f3d195');
		sky.addColorStop(1, '#e8a864');
		ctx.fillStyle = sky;
		ctx.fillRect(0, 0, width, height);

		// Warm afternoon sun
		ctx.fillStyle = '#fff3cf';
		ctx.beginPath();
		ctx.arc(width * 0.74, height * 0.28 + p * 18, 28, 0, Math.PI * 2);
		ctx.fill();

		// Silhouette parapets, louvred shutters, water tank
		const houses = [
			{ x: 18, w: 105, h: 112 },
			{ x: 132, w: 128, h: 138 },
			{ x: 270, w: 112, h: 98 },
			{ x: 390, w: 108, h: 126 }
		];
		for (const b of houses) {
			ctx.fillStyle = '#5c3b26';
			ctx.fillRect(b.x, height - b.h, b.w, b.h);
			// Parapet railings
			ctx.strokeStyle = '#3c2517';
			ctx.lineWidth = 2;
			ctx.strokeRect(b.x + 4, height - b.h - 10, b.w - 8, 10);
			// Warm lit shuttered windows
			ctx.fillStyle = '#f8d78c';
			ctx.fillRect(b.x + 20, height - b.h + 24, 22, 32);
			ctx.fillRect(b.x + b.w - 44, height - b.h + 24, 22, 32);
		}

		// Two flying diamond kites
		for (const [idx, base] of [
			[0, { x: 150, y: 82, col: '#9e2f24' }],
			[1, { x: 310, y: 66, col: '#285852' }]
		] as const) {
			const kx = base.x + Math.sin(p * Math.PI * 2 + idx) * 28;
			const ky = base.y + Math.cos(p * Math.PI * 3 + idx) * 12;
			ctx.save();
			ctx.translate(kx, ky);
			ctx.rotate(0.22 * Math.sin(p * 6 + idx));
			ctx.fillStyle = base.col;
			ctx.beginPath();
			ctx.moveTo(0, -16);
			ctx.lineTo(13, 0);
			ctx.lineTo(0, 18);
			ctx.lineTo(-13, 0);
			ctx.closePath();
			ctx.fill();
			ctx.restore();

			// Kite string
			ctx.strokeStyle = '#473121';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(kx, ky + 14);
			ctx.quadraticCurveTo(kx - 20, ky + 55, kx - 48, height - 118);
			ctx.stroke();
		}
	} else if (loopT < 24) {
		// Chapter 3: Clay Tea Cups, Radio Waves & Clockwork
		const p = (loopT - 15) / 9;
		ctx.fillStyle = '#ebd2a3';
		ctx.fillRect(0, 0, width, height);

		// Wooden counter line
		ctx.fillStyle = '#6c4429';
		ctx.fillRect(0, height * 0.68, width, height * 0.32);

		// Steaming clay bhaar cup
		ctx.fillStyle = '#b45a35';
		ctx.beginPath();
		ctx.moveTo(118, height * 0.68);
		ctx.lineTo(106, height * 0.46);
		ctx.lineTo(158, height * 0.46);
		ctx.lineTo(146, height * 0.68);
		ctx.closePath();
		ctx.fill();

		// Rising tea steam curls
		ctx.strokeStyle = '#755338';
		ctx.lineWidth = 2.5;
		for (let s = 0; s < 3; s += 1) {
			const sy = height * 0.42 - ((p * 40 + s * 14) % 38);
			ctx.beginPath();
			ctx.arc(122 + s * 10, sy, 7, 0.3, Math.PI * 1.4);
			ctx.stroke();
		}

		// Singing radio on right with expanding concentric music rings
		ctx.fillStyle = '#4a3120';
		ctx.fillRect(280, height * 0.43, 128, 80);
		ctx.fillStyle = '#dec290';
		ctx.fillRect(292, height * 0.48, 66, 48);
		ctx.fillStyle = '#c23b28';
		ctx.beginPath();
		ctx.arc(388, height * 0.51, 5, 0, Math.PI * 2);
		ctx.fill();

		ctx.strokeStyle = '#5c3c24';
		ctx.lineWidth = 2;
		for (let r = 1; r <= 3; r += 1) {
			const rad = 16 + r * 14 + ((p * 26) % 14);
			ctx.beginPath();
			ctx.arc(325, height * 0.44, rad, -Math.PI * 0.85, -Math.PI * 0.15);
			ctx.stroke();
		}
	} else if (loopT < 31.5) {
		// Chapter 4: Evening Tram & Lit Windows
		const p = (loopT - 24) / 7.5;
		const dusk = ctx.createLinearGradient(0, 0, 0, height);
		dusk.addColorStop(0, '#363b54');
		dusk.addColorStop(1, '#7a5848');
		ctx.fillStyle = dusk;
		ctx.fillRect(0, 0, width, height);

		// Overhead tram wire
		ctx.strokeStyle = '#d9c39a';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(0, height * 0.3);
		ctx.lineTo(width, height * 0.3);
		ctx.stroke();

		// Gliding Calcutta tram car
		const tramX = -140 + p * (width + 180);
		ctx.fillStyle = '#c88b3a';
		ctx.fillRect(tramX, height * 0.46, 168, 68);
		ctx.fillStyle = '#3f5f5a';
		ctx.fillRect(tramX, height * 0.58, 168, 28);
		// Warm tram windows
		ctx.fillStyle = '#fff0b8';
		for (let w = 0; w < 5; w += 1) {
			ctx.fillRect(tramX + 14 + w * 30, height * 0.5, 20, 20);
		}
		// Pantograph pole
		ctx.strokeStyle = '#e7d6b4';
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.moveTo(tramX + 84, height * 0.46);
		ctx.lineTo(tramX + 64, height * 0.3);
		ctx.stroke();

		// Street tracks
		ctx.fillStyle = '#262126';
		ctx.fillRect(0, height * 0.74, width, height * 0.26);
	} else {
		// Chapter 5: Warm End Card
		ctx.strokeStyle = '#3c291b';
		ctx.lineWidth = 3.5;
		ctx.strokeRect(30, 26, width - 60, height - 52);

		ctx.fillStyle = '#3c291b';
		ctx.textAlign = 'center';
		ctx.font = 'bold 28px serif';
		ctx.fillText('সমাপ্ত · End of Reel', width * 0.5, height * 0.45);
		ctx.font = '16px serif';
		ctx.fillText('Projected in Kusumtala Courtyard', width * 0.5, height * 0.62);
		ctx.font = '13px monospace';
		ctx.fillText('Radio · Clock · Projector — Working Again', width * 0.5, height * 0.77);
	}

	// Authentic 8mm vignette & rounded gate corners
	const vig = ctx.createRadialGradient(
		width * 0.5,
		height * 0.5,
		width * 0.32,
		width * 0.5,
		height * 0.5,
		width * 0.72
	);
	vig.addColorStop(0, 'rgba(0,0,0,0)');
	vig.addColorStop(1, 'rgba(38, 22, 10, 0.42)');
	ctx.fillStyle = vig;
	ctx.fillRect(0, 0, width, height);

	ctx.strokeStyle = '#1c130d';
	ctx.lineWidth = 10;
	ctx.strokeRect(0, 0, width, height);

	ctx.restore();
}
