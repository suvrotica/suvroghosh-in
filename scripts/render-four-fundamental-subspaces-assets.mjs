import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;
const outDir = path.join(
	process.cwd(),
	'static',
	'images',
	'visualizations',
	'four-fundamental-subspaces-3d'
);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a) => {
	const n = norm(a) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
};
const cross = (a, b) => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0]
];

const A = [
	[1, -1, 1],
	[1, 1, 3],
	[0, 1, 1]
];
const matVec = (m, v) => m.map((row) => dot(row, v));

// Compute exact singular values of rank-2 matrix A from symmetric Gram matrix A^T A:
// lambda(lambda^2 - tr(G) * lambda + s2(G)) = 0
const gram = [0, 1, 2].map((i) =>
	[0, 1, 2].map((j) => A[0][i] * A[0][j] + A[1][i] * A[1][j] + A[2][i] * A[2][j])
);
const trG = gram[0][0] + gram[1][1] + gram[2][2];
const minorSumG =
	gram[0][0] * gram[1][1] -
	gram[0][1] * gram[1][0] +
	(gram[0][0] * gram[2][2] - gram[0][2] * gram[2][0]) +
	(gram[1][1] * gram[2][2] - gram[1][2] * gram[2][1]);
const discG = Math.sqrt(Math.max(0, trG * trG - 4 * minorSumG));
const sigma1 = Math.sqrt((trG + discG) / 2);
const sigma2 = Math.sqrt(Math.max(0, (trG - discG) / 2));
const sigma3 = 0;

// Exact orthogonal geometry of the Asymmetric Rank-2 Collapse default preset
const nNull = unit([2, 1, -1]);
const v1 = unit([1, -2, 0]);
const v2 = unit(cross(nNull, v1));

const nLeft = unit([1, -1, 2]);
const u1 = unit([1, 1, 0]);
const u2 = unit(cross(nLeft, u1));

const x = [1.5, 1.0, 0.5];
const xNull = scale(nNull, dot(x, nNull));
const xRow = sub(x, xNull);
const ax = matVec(A, x);
// Scale Ax softly to fit nicely on the card frame while preserving exact C(A) membership
const axVis = scale(ax, 0.52);

const b = [1.4, 0.2, 1.8];
const eRes = scale(nLeft, dot(b, nLeft));
const pProj = sub(b, eRes);

function makeOrtho(azDeg, elDeg) {
	const az = (azDeg * Math.PI) / 180;
	const el = (elDeg * Math.PI) / 180;
	const forward = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
	const right = unit(cross([0, 1, 0], forward));
	const up = unit(cross(forward, right));
	return { right, up, forward };
}

function project(pt, basis, cx, cy, sc) {
	return {
		x: cx + dot(pt, basis.right) * sc,
		y: cy - dot(pt, basis.up) * sc
	};
}

function diskSvg(e1, e2, basis, cx, cy, sc, radius, color, gridOpacity = 0.28) {
	const segs = 72;
	const pts = [];
	for (let i = 0; i <= segs; i += 1) {
		const th = (i / segs) * Math.PI * 2;
		const p = add(scale(e1, Math.cos(th) * radius), scale(e2, Math.sin(th) * radius));
		const pr = project(p, basis, cx, cy, sc);
		pts.push(`${i === 0 ? 'M' : 'L'}${pr.x.toFixed(1)},${pr.y.toFixed(1)}`);
	}
	const rimPath = `${pts.join(' ')} Z`;

	const gridLines = [];
	const step = 0.65;
	for (let k = -3; k <= 3; k += 1) {
		const d = k * step;
		const span = Math.sqrt(Math.max(0, radius * radius - d * d));
		if (span < 0.08) continue;
		const a1 = project(add(scale(e1, -span), scale(e2, d)), basis, cx, cy, sc);
		const a2 = project(add(scale(e1, span), scale(e2, d)), basis, cx, cy, sc);
		const b1 = project(add(scale(e1, d), scale(e2, -span)), basis, cx, cy, sc);
		const b2 = project(add(scale(e1, d), scale(e2, span)), basis, cx, cy, sc);
		gridLines.push(
			`<line x1="${a1.x.toFixed(1)}" y1="${a1.y.toFixed(1)}" x2="${a2.x.toFixed(1)}" y2="${a2.y.toFixed(1)}" stroke="${color}" stroke-opacity="${gridOpacity}" stroke-width="1"/>`,
			`<line x1="${b1.x.toFixed(1)}" y1="${b1.y.toFixed(1)}" x2="${b2.x.toFixed(1)}" y2="${b2.y.toFixed(1)}" stroke="${color}" stroke-opacity="${gridOpacity}" stroke-width="1"/>`
		);
	}

	return `
		<path d="${rimPath}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="2.2"/>
		${gridLines.join('\n')}
	`;
}

function rightAngleSvg(corner, dirA, dirB, basis, cx, cy, sc, size = 0.36) {
	const a = scale(unit(dirA), size);
	const b = scale(unit(dirB), size);
	const p0 = project(corner, basis, cx, cy, sc);
	const p1 = project(add(corner, a), basis, cx, cy, sc);
	const p2 = project(add(add(corner, a), b), basis, cx, cy, sc);
	const p3 = project(add(corner, b), basis, cx, cy, sc);
	return `
		<polygon points="${p0.x.toFixed(1)},${p0.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} ${p3.x.toFixed(1)},${p3.y.toFixed(1)}" fill="#f8fafc" fill-opacity="0.22"/>
		<polyline points="${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} ${p3.x.toFixed(1)},${p3.y.toFixed(1)}" fill="none" stroke="#f8fafc" stroke-width="1.8"/>
	`;
}

function arrowSvg(from, to, basis, cx, cy, sc, color, width = 2.8, dashed = false) {
	const p1 = project(from, basis, cx, cy, sc);
	const p2 = project(to, basis, cx, cy, sc);
	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	const len = Math.hypot(dx, dy) || 1;
	const ux = dx / len;
	const uy = dy / len;
	const headLen = 10;
	const headW = 4.6;
	const bx = p2.x - ux * headLen;
	const by = p2.y - uy * headLen;
	const l = `${(bx - uy * headW).toFixed(1)},${(by + ux * headW).toFixed(1)}`;
	const r = `${(bx + uy * headW).toFixed(1)},${(by - ux * headW).toFixed(1)}`;
	const dashAttr = dashed ? ' stroke-dasharray="6 4"' : '';
	return `
		<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"${dashAttr}/>
		<polygon points="${p2.x.toFixed(1)},${p2.y.toFixed(1)} ${l} ${r}" fill="${color}"/>
	`;
}

function buildPlateSvg(isSocial) {
	const basis = makeOrtho(52, 24);
	const sc = 72;
	const domCx = 278;
	const domCy = 370;
	const codCx = 922;
	const codCy = 370;

	// Axes helper
	const axesSvg = (cx, cy, prefix) =>
		[
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1]
		]
			.map((dir, i) => {
				const a = project(scale(dir, -2.55), basis, cx, cy, sc);
				const bPt = project(scale(dir, 2.55), basis, cx, cy, sc);
				return `
					<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${bPt.x.toFixed(1)}" y2="${bPt.y.toFixed(1)}" stroke="#475569" stroke-opacity="0.55" stroke-width="1.2"/>
					<text x="${(bPt.x + 6).toFixed(1)}" y="${(bPt.y + 4).toFixed(1)}" fill="#94a3b8" font-size="12" font-family="ui-monospace, SFMono-Regular, monospace">${prefix}${i + 1}</text>
				`;
			})
			.join('\n');

	// Nullspace & Left Nullspace lines
	const n1A = project(scale(nNull, -2.65), basis, domCx, domCy, sc);
	const n1B = project(scale(nNull, 2.65), basis, domCx, domCy, sc);
	const n2A = project(scale(nLeft, -2.65), basis, codCx, codCy, sc);
	const n2B = project(scale(nLeft, 2.65), basis, codCx, codCy, sc);

	// Affine fiber x_r + N(A)
	const fibA = project(add(xRow, scale(nNull, -1.9)), basis, domCx, domCy, sc);
	const fibB = project(add(xRow, scale(nNull, 1.9)), basis, domCx, domCy, sc);

	// Transformed unit sphere ellipse inside C(A)
	const ellPts = [];
	for (let i = 0; i <= 72; i += 1) {
		const th = (i / 72) * Math.PI * 2;
		const pDomain = add(scale(v1, Math.cos(th)), scale(v2, Math.sin(th)));
		const mapped = scale(matVec(A, pDomain), 0.45);
		const pr = project(mapped, basis, codCx, codCy, sc);
		ellPts.push(`${i === 0 ? 'M' : 'L'}${pr.x.toFixed(1)},${pr.y.toFixed(1)}`);
	}
	const ellPath = `${ellPts.join(' ')} Z`;

	// Unit sphere circle in domain C(A^T)
	const sphPts = [];
	for (let i = 0; i <= 72; i += 1) {
		const th = (i / 72) * Math.PI * 2;
		const pDomain = add(scale(v1, Math.cos(th)), scale(v2, Math.sin(th)));
		const pr = project(pDomain, basis, domCx, domCy, sc);
		sphPts.push(`${i === 0 ? 'M' : 'L'}${pr.x.toFixed(1)},${pr.y.toFixed(1)}`);
	}
	const sphPath = `${sphPts.join(' ')} Z`;

	const pX = project(x, basis, domCx, domCy, sc);
	const pXr = project(xRow, basis, domCx, domCy, sc);
	const pAx = project(axVis, basis, codCx, codCy, sc);
	const pB = project(b, basis, codCx, codCy, sc);
	const pP = project(pProj, basis, codCx, codCy, sc);

	const subtitle = isSocial
		? 'Interactive 3D Linear Algebra Laboratory · Orbit, Slice, Morph &amp; Verify All 4 Perpendicular Subspaces'
		: 'Asymmetric Rank-2 Collapse (3×3): Distinct Tilted Row &amp; Column Planes with Exact 90° Orthogonal Complements';

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
	<defs>
		<radialGradient id="bgGlow" cx="50%" cy="45%" r="68%">
			<stop offset="0%" stop-color="#141c28"/>
			<stop offset="100%" stop-color="#0a0e14"/>
		</radialGradient>
	</defs>
	<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGlow)"/>

	<!-- Header -->
	<text x="46" y="54" fill="#f8fafc" font-size="30" font-weight="700" font-family="Georgia, 'Times New Roman', serif">The Four Fundamental Subspaces in 3D</text>
	<text x="46" y="82" fill="#94a3b8" font-size="14.5" font-family="system-ui, -apple-system, sans-serif">${subtitle}</text>

	<!-- Domain Panel Frame -->
	<rect x="34" y="106" width="486" height="492" rx="14" fill="#0d131c" stroke="#263244" stroke-width="1.5"/>
	<text x="54" y="136" fill="#f1f5f9" font-size="14.5" font-weight="700" font-family="system-ui, sans-serif">INPUT SPACE ℝ³</text>
	<rect x="286" y="119" width="106" height="24" rx="12" fill="rgba(45,212,191,0.14)" stroke="#2dd4bf" stroke-width="1"/>
	<text x="339" y="135" text-anchor="middle" fill="#5eead4" font-size="11.5" font-weight="700" font-family="ui-monospace, monospace">C(Aᵀ) · 2D</text>
	<rect x="402" y="119" width="100" height="24" rx="12" fill="rgba(245,158,11,0.15)" stroke="#f59e0b" stroke-width="1"/>
	<text x="452" y="135" text-anchor="middle" fill="#fbbf24" font-size="11.5" font-weight="700" font-family="ui-monospace, monospace">N(A) · 1D</text>

	<!-- Codomain Panel Frame -->
	<rect x="680" y="106" width="486" height="492" rx="14" fill="#0d131c" stroke="#263244" stroke-width="1.5"/>
	<text x="700" y="136" fill="#f1f5f9" font-size="14.5" font-weight="700" font-family="system-ui, sans-serif">OUTPUT SPACE ℝ³</text>
	<rect x="932" y="119" width="102" height="24" rx="12" fill="rgba(96,165,250,0.16)" stroke="#60a5fa" stroke-width="1"/>
	<text x="983" y="135" text-anchor="middle" fill="#93c5fd" font-size="11.5" font-weight="700" font-family="ui-monospace, monospace">C(A) · 2D</text>
	<rect x="1044" y="119" width="106" height="24" rx="12" fill="rgba(244,114,182,0.16)" stroke="#f472b6" stroke-width="1"/>
	<text x="1097" y="135" text-anchor="middle" fill="#f9a8d4" font-size="11.5" font-weight="700" font-family="ui-monospace, monospace">N(Aᵀ) · 1D</text>

	<!-- Center Action Bridge -->
	<rect x="534" y="176" width="132" height="346" rx="12" fill="#131b26" stroke="#2e3b4e" stroke-width="1.2"/>
	<text x="600" y="208" text-anchor="middle" fill="#f8fafc" font-size="14" font-weight="700" font-family="ui-monospace, monospace">A : ℝ³ → ℝ³</text>
	<text x="600" y="229" text-anchor="middle" fill="#94a3b8" font-size="12" font-family="ui-monospace, monospace">Rank r = 2</text>

	<rect x="546" y="250" width="108" height="108" rx="8" fill="#0d131c" stroke="#2dd4bf" stroke-opacity="0.5"/>
	<text x="600" y="274" text-anchor="middle" fill="#5eead4" font-size="12.5" font-weight="700" font-family="ui-monospace, monospace">C(Aᵀ) ≅ C(A)</text>
	<text x="600" y="295" text-anchor="middle" fill="#cbd5e1" font-size="11" font-family="ui-monospace, monospace">σ₁ = ${sigma1.toFixed(3)}</text>
	<text x="600" y="314" text-anchor="middle" fill="#cbd5e1" font-size="11" font-family="ui-monospace, monospace">σ₂ = ${sigma2.toFixed(3)}</text>
	<text x="600" y="333" text-anchor="middle" fill="#fbbf24" font-size="11" font-family="ui-monospace, monospace">σ₃ = ${sigma3.toFixed(3)}</text>

	<rect x="546" y="374" width="108" height="62" rx="8" fill="#0d131c" stroke="#f59e0b" stroke-opacity="0.55"/>
	<text x="600" y="400" text-anchor="middle" fill="#fbbf24" font-size="12.5" font-weight="700" font-family="ui-monospace, monospace">N(A) → {0}</text>
	<text x="600" y="420" text-anchor="middle" fill="#cbd5e1" font-size="10.5" font-family="system-ui, sans-serif">1D line crushed</text>

	<rect x="546" y="448" width="108" height="60" rx="8" fill="#0d131c" stroke="#f472b6" stroke-opacity="0.55"/>
	<text x="600" y="472" text-anchor="middle" fill="#f9a8d4" font-size="12" font-weight="700" font-family="ui-monospace, monospace">e ∈ N(Aᵀ)</text>
	<text x="600" y="492" text-anchor="middle" fill="#cbd5e1" font-size="10.5" font-family="system-ui, sans-serif">Aᵀe = 0 (90°)</text>

	<!-- Domain Geometry -->
	${axesSvg(domCx, domCy, 'x')}
	${diskSvg(v1, v2, basis, domCx, domCy, sc, 2.35, '#2dd4bf', 0.25)}
	<path d="${sphPath}" fill="none" stroke="#94a3b8" stroke-opacity="0.55" stroke-width="1.5" stroke-dasharray="4 3"/>
	<line x1="${n1A.x.toFixed(1)}" y1="${n1A.y.toFixed(1)}" x2="${n1B.x.toFixed(1)}" y2="${n1B.y.toFixed(1)}" stroke="#f59e0b" stroke-width="3.4" stroke-dasharray="9 5"/>
	${rightAngleSvg([0, 0, 0], v1, nNull, basis, domCx, domCy, sc, 0.38)}
	<line x1="${fibA.x.toFixed(1)}" y1="${fibA.y.toFixed(1)}" x2="${fibB.x.toFixed(1)}" y2="${fibB.y.toFixed(1)}" stroke="#fbbf24" stroke-opacity="0.72" stroke-width="1.8" stroke-dasharray="5 3"/>
	<line x1="${pXr.x.toFixed(1)}" y1="${pXr.y.toFixed(1)}" x2="${pX.x.toFixed(1)}" y2="${pX.y.toFixed(1)}" stroke="#fbbf24" stroke-width="2" stroke-dasharray="4 3"/>
	${arrowSvg([0, 0, 0], xRow, basis, domCx, domCy, sc, '#5eead4', 2.6)}
	${arrowSvg([0, 0, 0], xNull, basis, domCx, domCy, sc, '#fbbf24', 2.4)}
	${arrowSvg([0, 0, 0], x, basis, domCx, domCy, sc, '#f8fafc', 3.2)}
	<rect x="${(pX.x + 12).toFixed(1)}" y="${(pX.y - 42).toFixed(1)}" width="92" height="22" rx="5" fill="#0a0e14" fill-opacity="0.92" stroke="#334155"/>
	<text x="${(pX.x + 58).toFixed(1)}" y="${(pX.y - 27).toFixed(1)}" text-anchor="middle" fill="#f8fafc" font-size="12.5" font-weight="700" font-family="ui-monospace, monospace">x = xᵣ + xₙ</text>
	<rect x="${(n1B.x + 8).toFixed(1)}" y="${(n1B.y - 10).toFixed(1)}" width="48" height="20" rx="5" fill="#0a0e14" fill-opacity="0.92" stroke="#f59e0b" stroke-opacity="0.55"/>
	<text x="${(n1B.x + 32).toFixed(1)}" y="${(n1B.y + 4).toFixed(1)}" text-anchor="middle" fill="#fbbf24" font-size="12" font-weight="700" font-family="ui-monospace, monospace">N(A)</text>
	<text x="58" y="576" fill="#94a3b8" font-size="12" font-family="ui-monospace, monospace">dim C(Aᵀ) + dim N(A) = 2 + 1 = 3 · max|vᵣ·vₙ| = 0</text>

	<!-- Codomain Geometry -->
	${axesSvg(codCx, codCy, 'y')}
	${diskSvg(u1, u2, basis, codCx, codCy, sc, 2.35, '#60a5fa', 0.25)}
	<path d="${ellPath}" fill="#60a5fa" fill-opacity="0.14" stroke="#93c5fd" stroke-width="2"/>
	<line x1="${n2A.x.toFixed(1)}" y1="${n2A.y.toFixed(1)}" x2="${n2B.x.toFixed(1)}" y2="${n2B.y.toFixed(1)}" stroke="#f472b6" stroke-width="3.4" stroke-dasharray="9 5"/>
	${rightAngleSvg([0, 0, 0], u1, nLeft, basis, codCx, codCy, sc, 0.38)}
	${rightAngleSvg(pProj, scale(pProj, -1), eRes, basis, codCx, codCy, sc, 0.32)}
	${arrowSvg([0, 0, 0], pProj, basis, codCx, codCy, sc, '#60a5fa', 2.5)}
	${arrowSvg(pProj, b, basis, codCx, codCy, sc, '#f472b6', 2.5)}
	${arrowSvg([0, 0, 0], b, basis, codCx, codCy, sc, '#ddd6fe', 2.9)}
	${arrowSvg([0, 0, 0], axVis, basis, codCx, codCy, sc, '#fde047', 3.2)}
	<rect x="${(pAx.x - 44).toFixed(1)}" y="${(pAx.y - 24).toFixed(1)}" width="34" height="20" rx="5" fill="#0a0e14" fill-opacity="0.92" stroke="#fde047" stroke-opacity="0.55"/>
	<text x="${(pAx.x - 27).toFixed(1)}" y="${(pAx.y - 10).toFixed(1)}" text-anchor="middle" fill="#fde047" font-size="12.5" font-weight="700" font-family="ui-monospace, monospace">Ax</text>
	<rect x="${(pB.x - 94).toFixed(1)}" y="${(pB.y + 8).toFixed(1)}" width="80" height="22" rx="5" fill="#0a0e14" fill-opacity="0.92" stroke="#c4b5fd" stroke-opacity="0.55"/>
	<text x="${(pB.x - 54).toFixed(1)}" y="${(pB.y + 23).toFixed(1)}" text-anchor="middle" fill="#ddd6fe" font-size="12.5" font-weight="700" font-family="ui-monospace, monospace">b = p + e</text>
	<rect x="${(pP.x + 12).toFixed(1)}" y="${(pP.y - 22).toFixed(1)}" width="24" height="20" rx="5" fill="#0a0e14" fill-opacity="0.92" stroke="#60a5fa" stroke-opacity="0.55"/>
	<text x="${(pP.x + 24).toFixed(1)}" y="${(pP.y - 8).toFixed(1)}" text-anchor="middle" fill="#93c5fd" font-size="12" font-weight="700" font-family="ui-monospace, monospace">p</text>
	<rect x="${(n2A.x + 12).toFixed(1)}" y="${(n2A.y - 11).toFixed(1)}" width="54" height="20" rx="5" fill="#0a0e14" fill-opacity="0.92" stroke="#f472b6" stroke-opacity="0.55"/>
	<text x="${(n2A.x + 39).toFixed(1)}" y="${(n2A.y + 3).toFixed(1)}" text-anchor="middle" fill="#f9a8d4" font-size="12" font-weight="700" font-family="ui-monospace, monospace">N(Aᵀ)</text>
	<text x="704" y="576" fill="#94a3b8" font-size="12" font-family="ui-monospace, monospace">dim C(A) + dim N(Aᵀ) = 2 + 1 = 3 · Least-Squares e ⊥ C(A)</text>
</svg>`;
}

await fs.mkdir(outDir, { recursive: true });

for (const [filename, isSocial] of [
	['social.png', true],
	['poster.png', false]
]) {
	const svg = buildPlateSvg(isSocial);
	const dest = path.join(outDir, filename);
	await sharp(Buffer.from(svg))
		.png({ compressionLevel: 9, palette: true, quality: 92 })
		.toFile(dest);
	const stat = await fs.stat(dest);
	console.log(
		`Generated ${path.relative(process.cwd(), dest)} (${(stat.size / 1024).toFixed(1)} kB)`
	);
	if (stat.size >= 750 * 1024) {
		throw new Error(`${filename} exceeds 750 kB budget (${stat.size} bytes)`);
	}
}
