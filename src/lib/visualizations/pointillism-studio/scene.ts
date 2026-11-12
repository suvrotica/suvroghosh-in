import { createStreamRng } from './prng.ts';
import { FieldBuilder, lerp, lerpRgb, scaleRgb, type RgbTuple } from './scene-primitives.ts';
import type {
	FigurePose,
	FocalArea,
	SceneFamilyId,
	SceneFigure,
	SceneMetadataSummary,
	SceneModel
} from './types.ts';

const SHIRT_PALETTE: readonly RgbTuple[] = [
	[218, 92, 68], // warm terracotta-coral
	[62, 114, 168], // cobalt workshirt blue
	[238, 228, 204], // natural cream linen
	[218, 174, 72], // sunlitochre mustard
	[74, 134, 116], // sage-teal cotton
	[176, 78, 96], // muted berry rose
	[112, 144, 184], //chambray sky blue
	[228, 142, 86] // warm apricot
];

const LOWER_PALETTE: readonly RgbTuple[] = [
	[54, 72, 98], // indigo denim
	[168, 152, 126], // khaki stone chinos
	[68, 74, 78], // charcoal trousers
	[92, 108, 86], // olive utility pants
	[196, 184, 162], // light sand linen
	[76, 94, 124] // faded mid-blue jeans
];

const SKIN_PALETTE: readonly RgbTuple[] = [
	[214, 166, 134],
	[184, 132, 98],
	[142, 96, 68],
	[226, 182, 152],
	[164, 114, 82],
	[116, 78, 56]
];

const HAIR_PALETTE: readonly RgbTuple[] = [
	[42, 34, 30],
	[68, 50, 38],
	[98, 72, 48],
	[52, 48, 48],
	[214, 198, 164] // straw sun hat / cap
];

const ACCENT_PALETTE: readonly RgbTuple[] = [
	[196, 146, 88], // canvas tote / kraft bag
	[72, 124, 142], // teal frame / pack
	[184, 78, 64], // terracotta bicycle / tote
	[224, 210, 178], // woven basket / cloth
	[92, 128, 84] // olive pack
];

function makeFigure(
	placementRng: ReturnType<typeof createStreamRng>,
	fb: FieldBuilder,
	opts: {
		pose: FigurePose;
		activityLabel: string;
		footX: number;
		footY: number;
		height: number;
		depth: number;
		facing?: 1 | -1;
		inShade: boolean;
		isFocal?: boolean;
		propKind?: SceneFigure['propKind'];
		preferredShirtIdx?: number;
	}
): SceneFigure {
	const shirtRgb =
		opts.preferredShirtIdx !== undefined
			? SHIRT_PALETTE[opts.preferredShirtIdx % SHIRT_PALETTE.length]!
			: placementRng.pick(SHIRT_PALETTE);
	const lowerRgb = placementRng.pick(LOWER_PALETTE);
	const skinRgb = placementRng.pick(SKIN_PALETTE);
	const hairRgb = placementRng.pick(HAIR_PALETTE);
	const accentRgb = placementRng.pick(ACCENT_PALETTE);

	return {
		id: fb.allocId(),
		pose: opts.pose,
		activityLabel: opts.activityLabel,
		footX: opts.footX,
		footY: opts.footY,
		height: opts.height,
		depth: opts.depth,
		facing: opts.facing ?? (placementRng.chance(0.5) ? 1 : -1),
		inShade: opts.inShade,
		shirtRgb,
		lowerRgb,
		skinRgb,
		hairRgb,
		accentRgb,
		isFocal: Boolean(opts.isFocal),
		propKind: opts.propKind
	};
}

function buildRiverPathScene(
	fb: FieldBuilder,
	seed: number,
	w: number,
	h: number
): { focalArea: FocalArea; figures: SceneFigure[]; summary: SceneMetadataSummary } {
	const sceneRng = createStreamRng(seed, 'scene');
	const placeRng = createStreamRng(seed, 'placement');

	const templateIdx = sceneRng.int(0, 2); // 0: bridge & shaded walk, 1: riparian cycling & walk, 2: stepped stone landing
	const lightDirX = sceneRng.chance(0.65) ? -0.68 : 0.68;

	// Clear San Antonio daylight sky
	fb.fillSkyGradient([106, 162, 216], [218, 232, 238], 0.44, seed);
	fb.drawCloudBank(w * sceneRng.range(0.24, 0.44), h * 0.14, w * 0.17, h * 0.055, [248, 245, 236], [192, 206, 220], lightDirX, sceneRng);
	fb.drawCloudBank(w * sceneRng.range(0.64, 0.82), h * 0.18, w * 0.14, h * 0.045, [246, 243, 234], [196, 208, 222], lightDirX, sceneRng);

	// Distant warm urban/terrace backdrop glimpsed between trees
	const horizonY = h * 0.38;
	fb.fillPolygon(
		[
			[0, horizonY - h * 0.04],
			[w, horizonY - h * 0.03],
			[w, h * 0.56],
			[0, h * 0.56]
		],
		{
			depthTop: 0.88,
			depthBottom: 0.78,
			category: 'wall',
			colorTop: [216, 202, 178],
			colorBottom: [182, 168, 146],
			lit: 0.76,
			noiseSeed: seed + 3,
			noiseAmount: 8
		}
	);

	// Far riverside planted bank & limestone retaining wall
	const bridgeSpanY = h * 0.47;
	const waterFarLeftX = w * 0.34;
	const waterFarRightX = w * 0.76;
	const waterNearLeftX = w * (templateIdx === 1 ? 0.42 : 0.38);
	const waterNearRightX = w * 1.04;

	// Far vegetated slope
	fb.fillPolygon(
		[
			[0, h * 0.39],
			[w, h * 0.38],
			[w, h * 0.58],
			[0, h * 0.58]
		],
		{
			depthTop: 0.76,
			depthBottom: 0.66,
			category: 'terrain',
			colorTop: [122, 148, 92],
			colorBottom: [92, 118, 76],
			lit: 0.74,
			noiseSeed: seed + 5,
			noiseAmount: 9
		}
	);

	// Far cut-limestone embankment along river
	fb.fillPolygon(
		[
			[waterFarLeftX - w * 0.04, bridgeSpanY - h * 0.02],
			[w, bridgeSpanY + h * 0.01],
			[w, h * 0.62],
			[waterFarLeftX - w * 0.02, h * 0.55]
		],
		{
			depthTop: 0.65,
			depthBottom: 0.58,
			category: 'limestone',
			colorTop: [224, 210, 184],
			colorBottom: [176, 164, 142],
			lit: 0.8,
			noiseSeed: seed + 7,
			noiseAmount: 10
		}
	);

	// Near-bank planted terrace & wide limestone River Walk pedestrian path
	fb.fillPolygon(
		[
			[0, h * 0.47],
			[waterFarLeftX + w * 0.02, bridgeSpanY],
			[waterNearLeftX + w * 0.04, h],
			[0, h]
		],
		{
			depthTop: 0.62,
			depthBottom: 0.16,
			category: 'path',
			colorTop: [218, 204, 180],
			colorBottom: [198, 182, 158],
			lit: 0.84,
			angleRad: 0.12,
			anisotropy: 0.28,
			noiseSeed: seed + 11,
			noiseAmount: 11
		}
	);

	// Planted edge bed along the left side of the walkway (ferns, sedges, warm retaining stone)
	fb.fillPolygon(
		[
			[0, h * 0.46],
			[w * 0.16, h * 0.48],
			[w * 0.12, h],
			[0, h]
		],
		{
			depthTop: 0.58,
			depthBottom: 0.15,
			category: 'terrain',
			colorTop: [84, 118, 72],
			colorBottom: [62, 92, 58],
			lit: 0.58,
			noiseSeed: seed + 13,
			noiseAmount: 12
		}
	);

	// Cut Texas limestone curb wall separating near walkway from river water
	fb.fillPolygon(
		[
			[waterFarLeftX - w * 0.01, bridgeSpanY],
			[waterFarLeftX + w * 0.028, bridgeSpanY + h * 0.015],
			[waterNearLeftX + w * 0.045, h],
			[waterNearLeftX - w * 0.015, h]
		],
		{
			depthTop: 0.59,
			depthBottom: 0.18,
			category: 'limestone',
			colorTop: [228, 216, 190],
			colorBottom: [172, 158, 138],
			lit: 0.78,
			angleRad: 1.25,
			anisotropy: 0.35,
			noiseSeed: seed + 17,
			noiseAmount: 8
		}
	);

	// River channel polygon (spanned coherently between left curb and right bank)
	fb.fillPolygon(
		[
			[waterFarLeftX + w * 0.02, bridgeSpanY + h * 0.01],
			[waterFarRightX + w * 0.24, bridgeSpanY + h * 0.04],
			[waterNearRightX, h],
			[waterNearLeftX + w * 0.035, h]
		],
		{
			depthTop: 0.6,
			depthBottom: 0.22,
			category: 'water',
			colorTop: [68, 116, 112],
			colorBottom: [52, 96, 98],
			lit: 0.72,
			angleRad: 0,
			anisotropy: 0.55
		}
	);

	// Far right lush bank foliage & cypresses overhanging the river
	fb.drawTree({
		species: 'pecan',
		baseX: w * 0.86,
		baseY: bridgeSpanY + h * 0.06,
		height: h * 0.44,
		canopyWidth: w * 0.3,
		depth: 0.61,
		lightDirX,
		rng: sceneRng
	});
	fb.drawTree({
		species: 'bald-cypress',
		baseX: w * 0.73,
		baseY: bridgeSpanY + h * 0.04,
		height: h * 0.46,
		canopyWidth: w * 0.2,
		depth: 0.59,
		lightDirX,
		rng: sceneRng
	});

	// Coherent arched limestone footbridge OR riverside railing connecting plausible banks
	let structureSummary = 'an arched limestone footbridge and waterside railing';
	if (templateIdx !== 1) {
		const bridgeLeftX = waterFarLeftX - w * 0.03;
		const bridgeRightX = waterFarRightX + w * 0.06;
		const bridgeDeckY = bridgeSpanY - h * 0.045;
		const bridgeId = fb.allocId();

		// Warm ashlar sandstone/limestone bridge spandrel wall spanning bank-to-bank
		fb.fillPolygon(
			[
				[bridgeLeftX, bridgeDeckY],
				[bridgeRightX, bridgeDeckY + h * 0.008],
				[bridgeRightX, bridgeSpanY + h * 0.038],
				[bridgeLeftX, bridgeSpanY + h * 0.028]
			],
			{
				depthTop: 0.57,
				id: bridgeId,
				category: 'limestone',
				colorTop: [198, 172, 138],
				colorBottom: [158, 136, 108],
				lit: 0.78,
				noiseSeed: seed + 19,
				noiseAmount: 9
			}
		);
		// Bright cut-limestone parapet coping cap along top of bridge deck
		fb.fillPolygon(
			[
				[bridgeLeftX - w * 0.005, bridgeDeckY - h * 0.012],
				[bridgeRightX + w * 0.005, bridgeDeckY - h * 0.004],
				[bridgeRightX + w * 0.005, bridgeDeckY + h * 0.01],
				[bridgeLeftX - w * 0.005, bridgeDeckY + h * 0.002]
			],
			{
				depthTop: 0.567,
				id: bridgeId,
				category: 'limestone',
				colorTop: [242, 232, 208],
				colorBottom: [218, 204, 178],
				lit: 0.92
			}
		);
		// Cut-stone arch ring + shaded arch opening over the water channel
		const archCenterX = (bridgeLeftX + bridgeRightX) * 0.52;
		const archRx = (bridgeRightX - bridgeLeftX) * 0.31;
		const archRy = h * 0.052;
		fb.fillShadedEllipse(
			archCenterX,
			bridgeSpanY + h * 0.032,
			archRx + w * 0.018,
			archRy + h * 0.014,
			0.569,
			bridgeId,
			'limestone',
			[236, 224, 198],
			[196, 180, 154],
			lightDirX,
			-0.5,
			0.88
		);
		fb.fillShadedEllipse(
			archCenterX,
			bridgeSpanY + h * 0.034,
			archRx,
			archRy,
			0.568,
			fb.allocId(),
			'structure',
			[62, 78, 84],
			[38, 50, 56],
			lightDirX,
			-0.3,
			0.36
		);
		// Iron parapet railing along bridge deck
		const railId = fb.allocId();
		fb.fillCapsule(
			bridgeLeftX,
			bridgeDeckY - h * 0.032,
			bridgeRightX,
			bridgeDeckY - h * 0.024,
			2.5,
			0.565,
			railId,
			'structure',
			[62, 68, 74],
			[40, 44, 50],
			lightDirX,
			0.52
		);
		for (let i = 0; i <= 8; i++) {
			const rx = lerp(bridgeLeftX + 8, bridgeRightX - 8, i / 8);
			const ry = lerp(bridgeDeckY - h * 0.008, bridgeDeckY, i / 8);
			fb.fillCapsule(rx, ry, rx, ry - h * 0.025, 1.8, 0.566, railId, 'structure', [66, 72, 78], undefined, lightDirX, 0.5);
		}
	} else {
		structureSummary = 'a limestone river embankment and waterside railing';
	}

	// Mature foreground/midground left-bank live oak & bald cypress casting dappled shade across the walkway
	fb.drawTree({
		species: 'bald-cypress',
		baseX: w * 0.365,
		baseY: h * 0.545,
		height: h * 0.5,
		canopyWidth: w * 0.21,
		depth: 0.53,
		lightDirX,
		rng: sceneRng
	});
	fb.drawTree({
		species: 'live-oak',
		baseX: w * 0.085,
		baseY: h * 0.68,
		height: h * 0.62,
		canopyWidth: w * 0.45,
		depth: 0.36,
		lightDirX,
		rng: sceneRng
	});

	// Broad dappled shade cast across upper-left portion of pedestrian path
	fb.applyGroundShadowEllipse(w * 0.19, h * 0.73, w * 0.2, h * 0.11, 0.22, 0.32);

	// Waterside wrought-iron safety railing segment in midground
	const nearRailId = fb.allocId();
	const rX0 = lerp(waterFarLeftX, waterNearLeftX, 0.34);
	const rY0 = lerp(bridgeSpanY, h, 0.34);
	const rX1 = lerp(waterFarLeftX, waterNearLeftX, 0.74);
	const rY1 = lerp(bridgeSpanY, h, 0.74);
	fb.fillCapsule(rX0, rY0 - h * 0.065, rX1, rY1 - h * 0.075, 2.5, 0.34, nearRailId, 'structure', [66, 74, 78], [42, 48, 52], lightDirX, 0.55);
	for (let p = 0; p <= 4; p++) {
		const px = lerp(rX0, rX1, p / 4);
		const py = lerp(rY0, rY1, p / 4);
		const pd = lerp(0.46, 0.29, p / 4);
		fb.fillCapsule(px, py, px, py - h * 0.07, 2.2, pd, nearRailId, 'structure', [64, 70, 74], undefined, lightDirX, 0.52);
	}

	// Stone riverside bench in dappled live-oak shade on left edge of path
	const benchX = w * 0.165;
	const benchY = h * 0.745;
	const benchId = fb.allocId();
	fb.applyGroundShadowEllipse(benchX, benchY + 6, w * 0.065, h * 0.022, 0.28, 0.32);
	fb.fillPolygon(
		[
			[benchX - w * 0.048, benchY - h * 0.042],
			[benchX + w * 0.048, benchY - h * 0.038],
			[benchX + w * 0.05, benchY - h * 0.022],
			[benchX - w * 0.046, benchY - h * 0.026]
		],
		{
			depthTop: 0.32,
			id: benchId,
			category: 'furniture',
			colorTop: [198, 182, 156],
			colorBottom: [148, 134, 114],
			lit: 0.62
		}
	);
	fb.fillCapsule(benchX - w * 0.036, benchY - h * 0.024, benchX - w * 0.036, benchY, 3.5, 0.322, benchId, 'furniture', [132, 120, 106], undefined, lightDirX, 0.5);
	fb.fillCapsule(benchX + w * 0.036, benchY - h * 0.02, benchX + w * 0.036, benchY + 2, 3.5, 0.322, benchId, 'furniture', [132, 120, 106], undefined, lightDirX, 0.5);

	// Grounded contemporary people on the walkway
	const figures: SceneFigure[] = [];
	let activitySummary = 'walkers passing a seated person beside the shaded river path';
	let focalX = 0.31;
	let focalY = 0.68;

	if (templateIdx === 1) {
		activitySummary = 'a cyclist and walkers sharing a shaded riverside trail';
		const cyclist = makeFigure(placeRng, fb, {
			pose: 'cycling',
			activityLabel: 'cycling along the river path',
			footX: w * 0.3,
			footY: h * 0.79,
			height: h * 0.24,
			depth: 0.25,
			facing: 1,
			inShade: false,
			isFocal: true,
			propKind: 'bicycle',
			preferredShirtIdx: 0
		});
		const walker1 = makeFigure(placeRng, fb, {
			pose: 'walking',
			activityLabel: 'walking beside the river',
			footX: w * 0.23,
			footY: h * 0.65,
			height: h * 0.165,
			depth: 0.41,
			facing: -1,
			inShade: true,
			preferredShirtIdx: 2
		});
		const sitter = makeFigure(placeRng, fb, {
			pose: 'sitting',
			activityLabel: 'sitting on a stone bench in shade',
			footX: benchX + w * 0.012,
			footY: benchY + h * 0.008,
			height: h * 0.185,
			depth: 0.31,
			facing: 1,
			inShade: true,
			propKind: 'book',
			preferredShirtIdx: 1
		});
		figures.push(walker1, sitter, cyclist);
		focalX = cyclist.footX / w;
		focalY = (cyclist.footY - cyclist.height * 0.48) / h;
	} else {
		// Focal sunlit walker along the riverside path + companion + seated figure in shade (+ distant bridge walker)
		const seated = makeFigure(placeRng, fb, {
			pose: 'sitting',
			activityLabel: 'sitting in live-oak shade on a riverside bench',
			footX: benchX + w * 0.012,
			footY: benchY + h * 0.008,
			height: h * 0.19,
			depth: 0.31,
			facing: 1,
			inShade: true,
			propKind: 'book',
			preferredShirtIdx: 1
		});
		const focalWalker = makeFigure(placeRng, fb, {
			pose: 'walking',
			activityLabel: 'walking along the sunlit river path',
			footX: w * 0.292,
			footY: h * 0.815,
			height: h * 0.245,
			depth: 0.23,
			facing: 1,
			inShade: false,
			isFocal: true,
			propKind: 'bag',
			preferredShirtIdx: 0
		});
		const waterWatcher = makeFigure(placeRng, fb, {
			pose: templateIdx === 2 ? 'leaning' : 'walking',
			activityLabel:
				templateIdx === 2 ? 'looking out toward the river' : 'strolling near the water',
			footX: w * 0.242,
			footY: h * 0.635,
			height: h * 0.165,
			depth: 0.42,
			facing: 1,
			inShade: false,
			preferredShirtIdx: 2
		});
		figures.push(waterWatcher, seated, focalWalker);
		focalX = focalWalker.footX / w;
		focalY = (focalWalker.footY - focalWalker.height * 0.52) / h;
	}

	// Draw figures back-to-front by depth
	for (const fig of [...figures].sort((a, b) => b.depth - a.depth)) {
		fb.drawFigure(fig, lightDirX);
	}

	// Reflect trees, limestone walls, bridge arch, and riverside figures into the river water!
	fb.applyWaterReflections({
		waterBodyRgb: [64, 114, 108],
		waterDeepRgb: [42, 82, 86],
		sunShimmerRgb: [228, 224, 192],
		seed,
		reflectivity: 0.56
	});

	return {
		focalArea: {
			x: focalX,
			y: focalY,
			radius: 0.22,
			subjectLabel: 'riverside walker, limestone path, and reflected river canopy'
		},
		figures,
		summary: {
			sceneFamily: 'river-path',
			templateName:
				templateIdx === 1 ? 'riparian-trail' : templateIdx === 2 ? 'river-landing' : 'river-bridge',
			activitySummary,
			treeSummary: 'bald cypress, live oak, and pecan trees',
			structureSummary,
			waterPresent: true,
			season: 'warm-daylight',
			signText: null,
			peopleCount: figures.length,
			lightDirectionX: lightDirX
		}
	};
}

function buildNeighborhoodStreetScene(
	fb: FieldBuilder,
	seed: number,
	w: number,
	h: number
): { focalArea: FocalArea; figures: SceneFigure[]; summary: SceneMetadataSummary } {
	const sceneRng = createStreamRng(seed, 'scene');
	const placeRng = createStreamRng(seed, 'placement');

	const templateIdx = sceneRng.int(0, 1); // 0: residential porches & grocery walk, 1: corner tienda/panaderia & residential row
	const lightDirX = -0.65;

	fb.fillSkyGradient([112, 166, 218], [224, 234, 238], 0.46, seed);
	fb.drawCloudBank(w * 0.68, h * 0.16, w * 0.19, h * 0.055, [248, 244, 236], [196, 208, 222], lightDirX, sceneRng);

	// Ground plane: sunlit yard / planted strip, concrete sidewalk, and asphalt street in perspective
	const vanishX = w * 0.88;
	const vanishY = h * 0.52;

	// Background greenery / distant houses near vanishing horizon
	fb.fillPolygon(
		[
			[0, h * 0.44],
			[w, h * 0.44],
			[w, h * 0.62],
			[0, h * 0.62]
		],
		{
			depthTop: 0.82,
			depthBottom: 0.68,
			category: 'terrain',
			colorTop: [126, 148, 96],
			colorBottom: [104, 126, 82],
			lit: 0.74,
			noiseSeed: seed + 21,
			noiseAmount: 8
		}
	);

	// Front lawn & planted border between porches and sidewalk
	fb.fillPolygon(
		[
			[0, h * 0.55],
			[vanishX, vanishY + h * 0.03],
			[w, h * 0.66],
			[0, h * 0.78]
		],
		{
			depthTop: 0.64,
			depthBottom: 0.34,
			category: 'terrain',
			colorTop: [132, 156, 94],
			colorBottom: [112, 138, 80],
			lit: 0.78,
			noiseSeed: seed + 23,
			noiseAmount: 10
		}
	);

	// Concrete neighborhood sidewalk running cleanly across midground/foreground
	fb.fillPolygon(
		[
			[0, h * 0.74],
			[w, h * 0.62],
			[w, h * 0.74],
			[0, h * 0.9]
		],
		{
			depthTop: 0.48,
			depthBottom: 0.2,
			category: 'path',
			colorTop: [222, 212, 194],
			colorBottom: [204, 194, 178],
			lit: 0.86,
			angleRad: -0.1,
			anisotropy: 0.34,
			noiseSeed: seed + 29,
			noiseAmount: 9
		}
	);

	// Planted parkway strip & curb + neighborhood asphalt roadway in foreground
	fb.fillPolygon(
		[
			[0, h * 0.88],
			[w, h * 0.72],
			[w, h * 0.77],
			[0, h * 0.94]
		],
		{
			depthTop: 0.34,
			depthBottom: 0.16,
			category: 'terrain',
			colorTop: [116, 142, 84],
			colorBottom: [92, 118, 68],
			lit: 0.76,
			noiseSeed: seed + 31,
			noiseAmount: 9
		}
	);
	fb.fillPolygon(
		[
			[0, h * 0.93],
			[w, h * 0.76],
			[w, h],
			[0, h]
		],
		{
			depthTop: 0.28,
			depthBottom: 0.1,
			category: 'path',
			colorTop: [118, 118, 124],
			colorBottom: [94, 96, 104],
			lit: 0.68,
			angleRad: -0.11,
			anisotropy: 0.42,
			noiseSeed: seed + 37,
			noiseAmount: 8
		}
	);

	let signText: string | null = null;
	let structureSummary = 'clapboard and stucco houses with shaded front porches';

	// Building 1 (Left-center primary building: either bungalow with deep porch OR corner neighborhood tienda/bakery)
	if (templateIdx === 0) {
		// Lived-in San Antonio craftsman bungalow with covered front porch & steps meeting a front walk
		const houseLeft = w * 0.06;
		const houseRight = w * 0.46;
		const eaveY = h * 0.34;
		const baseLeftY = h * 0.68;
		const baseRightY = h * 0.64;

		// Gabled roof
		fb.fillPolygon(
			[
				[houseLeft - w * 0.02, eaveY],
				[(houseLeft + houseRight) * 0.48, h * 0.22],
				[houseRight + w * 0.02, eaveY + h * 0.01]
			],
			{
				depthTop: 0.56,
				category: 'roof',
				colorTop: [142, 96, 78],
				colorBottom: [112, 74, 62],
				lit: 0.8
			}
		);
		// Sunlit upper wall & shaded porch recess
		fb.fillPolygon(
			[
				[houseLeft, eaveY],
				[houseRight, eaveY + h * 0.01],
				[houseRight, baseRightY],
				[houseLeft, baseLeftY]
			],
			{
				depthTop: 0.55,
				category: 'wall',
				colorTop: [228, 218, 194],
				colorBottom: [198, 188, 168],
				lit: 0.82,
				noiseSeed: seed + 41,
				noiseAmount: 7
			}
		);
		// Deep shaded porch interior
		const porchTopY = h * 0.43;
		fb.fillPolygon(
			[
				[houseLeft + w * 0.02, porchTopY],
				[houseRight - w * 0.03, porchTopY + h * 0.008],
				[houseRight - w * 0.03, baseRightY - h * 0.03],
				[houseLeft + w * 0.02, baseLeftY - h * 0.03]
			],
			{
				depthTop: 0.53,
				category: 'wall',
				colorTop: [118, 118, 118],
				colorBottom: [92, 92, 96],
				lit: 0.42
			}
		);
		// Warm wood front door & windows inside porch
		fb.fillPolygon(
			[
				[w * 0.24, porchTopY + h * 0.04],
				[w * 0.285, porchTopY + h * 0.04],
				[w * 0.285, baseLeftY - h * 0.035],
				[w * 0.24, baseLeftY - h * 0.035]
			],
			{
				depthTop: 0.525,
				category: 'structure',
				colorTop: [148, 92, 64],
				colorBottom: [114, 68, 48],
				lit: 0.48
			}
		);
		// Porch roof fascia & crisp white square columns + porch deck & steps + walkway to sidewalk
		const colId = fb.allocId();
		for (const cx of [houseLeft + w * 0.03, w * 0.21, houseRight - w * 0.04]) {
			fb.fillCapsule(cx, porchTopY, cx, baseLeftY - h * 0.03, 5.2, 0.51, colId, 'structure', [242, 236, 224], [182, 178, 172], lightDirX, 0.86, 0.55);
		}
		// Porch deck & steps connecting to concrete front walk
		fb.fillPolygon(
			[
				[houseLeft + w * 0.01, baseLeftY - h * 0.035],
				[houseRight - w * 0.02, baseRightY - h * 0.035],
				[houseRight - w * 0.015, baseRightY + h * 0.01],
				[houseLeft + w * 0.005, baseLeftY + h * 0.01]
			],
			{
				depthTop: 0.5,
				category: 'limestone',
				colorTop: [188, 176, 158],
				colorBottom: [152, 142, 128],
				lit: 0.68
			}
		);
		fb.fillPolygon(
			[
				[w * 0.21, baseLeftY],
				[w * 0.29, baseLeftY - h * 0.005],
				[w * 0.33, h * 0.77],
				[w * 0.23, h * 0.79]
			],
			{
				depthTop: 0.49,
				depthBottom: 0.38,
				category: 'path',
				colorTop: [214, 204, 188],
				colorBottom: [202, 192, 176],
				lit: 0.8
			}
		);
	} else {
		// Small neighborhood corner store (warm stucco parapet, shaded cloth awning, painted sign shape)
		signText = sceneRng.chance(0.5) ? 'PANADERÍA' : 'MERCADO';
		structureSummary = `a corner neighborhood shop (${signText}) and neighboring porch houses`;
		const shopLeft = w * 0.05;
		const shopRight = w * 0.45;
		const parapetY = h * 0.27;
		const shopBaseY = h * 0.68;

		fb.fillPolygon(
			[
				[shopLeft, parapetY],
				[shopRight, parapetY + h * 0.015],
				[shopRight, shopBaseY - h * 0.02],
				[shopLeft, shopBaseY]
			],
			{
				depthTop: 0.55,
				category: 'wall',
				colorTop: [232, 210, 178],
				colorBottom: [204, 182, 152],
				lit: 0.84,
				noiseSeed: seed + 43,
				noiseAmount: 8
			}
		);
		// Painted sign board above awning (clean painted shape, no garbled tiny text)
		fb.fillPolygon(
			[
				[shopLeft + w * 0.05, parapetY + h * 0.045],
				[shopRight - w * 0.06, parapetY + h * 0.055],
				[shopRight - w * 0.06, parapetY + h * 0.105],
				[shopLeft + w * 0.05, parapetY + h * 0.095]
			],
			{
				depthTop: 0.54,
				category: 'sign',
				colorTop: [54, 92, 118],
				colorBottom: [42, 74, 98],
				lit: 0.78
			}
		);
		// Striped/solid terracotta cloth awning casting cool shade below
		fb.fillPolygon(
			[
				[shopLeft + w * 0.02, h * 0.42],
				[shopRight - w * 0.02, h * 0.43],
				[shopRight, h * 0.49],
				[shopLeft, h * 0.48]
			],
			{
				depthTop: 0.51,
				category: 'stall',
				colorTop: [194, 86, 66],
				colorBottom: [152, 62, 48],
				lit: 0.82
			}
		);
		// Lower stucco wall under awning + framed display windows and wooden shop entrance door
		fb.fillPolygon(
			[
				[shopLeft + w * 0.015, h * 0.485],
				[shopRight - w * 0.015, h * 0.492],
				[shopRight - w * 0.015, shopBaseY - h * 0.02],
				[shopLeft + w * 0.015, shopBaseY]
			],
			{
				depthTop: 0.535,
				category: 'wall',
				colorTop: [192, 174, 148],
				colorBottom: [168, 152, 128],
				lit: 0.56
			}
		);
		// Left & right bakery/shop display windows with warm interior glow
		for (const [wx0, wx1] of [
			[shopLeft + w * 0.04, w * 0.195],
			[w * 0.295, shopRight - w * 0.04]
		] as const) {
			fb.fillPolygon(
				[
					[wx0, h * 0.51],
					[wx1, h * 0.514],
					[wx1, h * 0.605],
					[wx0, h * 0.608]
				],
				{
					depthTop: 0.53,
					category: 'structure',
					colorTop: [176, 152, 114],
					colorBottom: [118, 108, 96],
					lit: 0.62
				}
			);
		}
		// Recessed wooden shop entrance door meeting entry walk
		fb.fillPolygon(
			[
				[w * 0.22, h * 0.508],
				[w * 0.275, h * 0.51],
				[w * 0.275, shopBaseY - h * 0.012],
				[w * 0.22, shopBaseY - h * 0.008]
			],
			{
				depthTop: 0.528,
				category: 'structure',
				colorTop: [128, 78, 54],
				colorBottom: [96, 58, 40],
				lit: 0.52
			}
		);
		fb.fillPolygon(
			[
				[w * 0.18, shopBaseY - h * 0.01],
				[w * 0.34, shopBaseY - h * 0.018],
				[w * 0.38, h * 0.76],
				[w * 0.16, h * 0.79]
			],
			{
				depthTop: 0.47,
				depthBottom: 0.35,
				category: 'path',
				colorTop: [216, 206, 190],
				colorBottom: [202, 192, 176],
				lit: 0.78
			}
		);
	}

	// Building 2 (Midground neighbor cottage in soft sage-green or dusty blue with pitched roof & porch)
	const b2Left = w * 0.5;
	const b2Right = w * 0.79;
	fb.fillPolygon(
		[
			[b2Left - w * 0.015, h * 0.39],
			[(b2Left + b2Right) * 0.5, h * 0.28],
			[b2Right + w * 0.015, h * 0.4]
		],
		{
			depthTop: 0.64,
			category: 'roof',
			colorTop: [138, 102, 86],
			colorBottom: [106, 78, 66],
			lit: 0.78
		}
	);
	fb.fillPolygon(
		[
			[b2Left, h * 0.39],
			[b2Right, h * 0.4],
			[b2Right, h * 0.61],
			[b2Left, h * 0.63]
		],
		{
			depthTop: 0.63,
			category: 'wall',
			colorTop: [188, 204, 186],
			colorBottom: [158, 176, 160],
			lit: 0.8,
			noiseSeed: seed + 47,
			noiseAmount: 7
		}
	);
	// Windows on Building 2
	for (const wx of [w * 0.545, w * 0.635, w * 0.715]) {
		fb.fillPolygon(
			[
				[wx, h * 0.45],
				[wx + w * 0.038, h * 0.45],
				[wx + w * 0.038, h * 0.54],
				[wx, h * 0.54]
			],
			{
				depthTop: 0.625,
				category: 'structure',
				colorTop: [74, 94, 108],
				colorBottom: [54, 70, 84],
				lit: 0.52
			}
		);
	}

	// Mature live oak on right parkway & crape myrtle near front yard
	fb.drawTree({
		species: 'crape-myrtle',
		baseX: w * 0.46,
		baseY: h * 0.65,
		height: h * 0.33,
		canopyWidth: w * 0.18,
		depth: 0.5,
		lightDirX,
		rng: sceneRng
	});
	fb.drawTree({
		species: 'live-oak',
		baseX: w * 0.91,
		baseY: h * 0.73,
		height: h * 0.56,
		canopyWidth: w * 0.38,
		depth: 0.32,
		lightDirX,
		rng: sceneRng
	});
	fb.applyGroundShadowEllipse(w * 0.76, h * 0.74, w * 0.18, h * 0.07, 0.2, 0.3);

	// Everyday neighborhood people & activities
	const figures: SceneFigure[] = [];
	let activitySummary = 'a resident reading on a shaded porch while a neighbor carries groceries along the sidewalk';
	let focalX = 0.42;
	let focalY = 0.7;

	if (templateIdx === 0) {
		const porchReader = makeFigure(placeRng, fb, {
			pose: 'sitting',
			activityLabel: 'reading on a shaded front porch',
			footX: w * 0.16,
			footY: h * 0.66,
			height: h * 0.165,
			depth: 0.49,
			facing: 1,
			inShade: true,
			propKind: 'book',
			preferredShirtIdx: 2
		});
		const groceryWalker = makeFigure(placeRng, fb, {
			pose: 'carrying',
			activityLabel: 'carrying groceries along the sunlit sidewalk',
			footX: w * 0.42,
			footY: h * 0.8,
			height: h * 0.245,
			depth: 0.24,
			facing: -1,
			inShade: false,
			isFocal: true,
			propKind: 'groceries',
			preferredShirtIdx: 1
		});
		const distantWalker = makeFigure(placeRng, fb, {
			pose: 'walking',
			activityLabel: 'walking under live-oak shade down the block',
			footX: w * 0.71,
			footY: h * 0.71,
			height: h * 0.175,
			depth: 0.35,
			facing: -1,
			inShade: true,
			preferredShirtIdx: 3
		});
		figures.push(porchReader, distantWalker, groceryWalker);
		focalX = groceryWalker.footX / w;
		focalY = (groceryWalker.footY - groceryWalker.height * 0.5) / h;
	} else {
		activitySummary = 'two neighbors talking outside a corner shop as a shopper passes with groceries';
		const talkerA = makeFigure(placeRng, fb, {
			pose: 'standing',
			activityLabel: 'talking outside the corner shop',
			footX: w * 0.21,
			footY: h * 0.78,
			height: h * 0.205,
			depth: 0.31,
			facing: 1,
			inShade: false,
			preferredShirtIdx: 1
		});
		const talkerB = makeFigure(placeRng, fb, {
			pose: 'standing',
			activityLabel: 'talking outside the corner shop',
			footX: w * 0.305,
			footY: h * 0.775,
			height: h * 0.208,
			depth: 0.3,
			facing: -1,
			inShade: false,
			propKind: 'bag',
			preferredShirtIdx: 3
		});
		const focalShopper = makeFigure(placeRng, fb, {
			pose: 'carrying',
			activityLabel: 'walking past with a bag of groceries',
			footX: w * 0.52,
			footY: h * 0.785,
			height: h * 0.24,
			depth: 0.25,
			facing: 1,
			inShade: false,
			isFocal: true,
			propKind: 'groceries',
			preferredShirtIdx: 0
		});
		figures.push(talkerA, talkerB, focalShopper);
		focalX = 0.38;
		focalY = 0.66;
	}

	for (const fig of [...figures].sort((a, b) => b.depth - a.depth)) {
		fb.drawFigure(fig, lightDirX);
	}

	return {
		focalArea: {
			x: focalX,
			y: focalY,
			radius: 0.23,
			subjectLabel: 'sidewalk pedestrian, shaded porch entrance, and street trees'
		},
		figures,
		summary: {
			sceneFamily: 'neighborhood-street',
			templateName: templateIdx === 0 ? 'porch-bungalows' : 'corner-shop-street',
			activitySummary,
			treeSummary: 'live oak and crape myrtle street trees',
			structureSummary,
			waterPresent: false,
			season: 'warm-daylight',
			signText,
			peopleCount: figures.length,
			lightDirectionX: lightDirX
		}
	};
}

function buildPlazaMarketScene(
	fb: FieldBuilder,
	seed: number,
	w: number,
	h: number
): { focalArea: FocalArea; figures: SceneFigure[]; summary: SceneMetadataSummary } {
	const sceneRng = createStreamRng(seed, 'scene');
	const placeRng = createStreamRng(seed, 'placement');

	const isMarket = sceneRng.chance(0.58); // Coherent market arrangement OR park picnic arrangement
	const lightDirX = sceneRng.chance(0.5) ? -0.62 : 0.62;

	fb.fillSkyGradient([108, 164, 218], [222, 232, 236], 0.44, seed);
	fb.drawCloudBank(w * 0.35, h * 0.15, w * 0.18, h * 0.05, [248, 245, 236], [194, 206, 220], lightDirX, sceneRng);

	// Low warm limestone arcade / civic wall with terracotta roof cap across far edge of plaza/park
	fb.fillPolygon(
		[
			[0, h * 0.39],
			[w, h * 0.39],
			[w, h * 0.425],
			[0, h * 0.425]
		],
		{
			depthTop: 0.81,
			depthBottom: 0.8,
			category: 'roof',
			colorTop: [172, 98, 76],
			colorBottom: [142, 78, 60],
			lit: 0.8
		}
	);
	fb.fillPolygon(
		[
			[0, h * 0.42],
			[w, h * 0.42],
			[w, h * 0.54],
			[0, h * 0.54]
		],
		{
			depthTop: 0.8,
			depthBottom: 0.72,
			category: 'limestone',
			colorTop: [224, 206, 178],
			colorBottom: [188, 172, 146],
			lit: 0.78,
			noiseSeed: seed + 51,
			noiseAmount: 8
		}
	);
	for (let a = 0; a < 6; a++) {
		const ax = lerp(w * 0.14, w * 0.86, a / 5);
		fb.fillShadedEllipse(
			ax,
			h * 0.525,
			w * 0.036,
			h * 0.048,
			0.74,
			fb.allocId(),
			'structure',
			[108, 102, 96],
			[78, 74, 72],
			lightDirX,
			-0.3,
			0.48
		);
	}

	const figures: SceneFigure[] = [];
	let signText: string | null = null;
	let activitySummary = '';
	let structureSummary = '';
	let focalX = 0.46;
	let focalY = 0.66;

	if (isMarket) {
		signText = 'FRUTAS';
		structureSummary = 'shaded canvas market stalls and warm stone plaza paving';
		activitySummary = 'a vendor arranging produce at a shaded outdoor stall while shoppers browse nearby';

		// Open warm stone-paved plaza with generous breathing room
		fb.fillPolygon(
			[
				[0, h * 0.52],
				[w, h * 0.52],
				[w, h],
				[0, h]
			],
			{
				depthTop: 0.68,
				depthBottom: 0.14,
				category: 'path',
				colorTop: [222, 208, 184],
				colorBottom: [198, 182, 158],
				lit: 0.84,
				angleRad: 0,
				anisotropy: 0.25,
				noiseSeed: seed + 53,
				noiseAmount: 10
			}
		);

		// Mature pecan & live oak trees framing the plaza
		fb.drawTree({
			species: 'live-oak',
			baseX: w * 0.14,
			baseY: h * 0.58,
			height: h * 0.5,
			canopyWidth: w * 0.38,
			depth: 0.58,
			lightDirX,
			rng: sceneRng
		});
		fb.drawTree({
			species: 'pecan',
			baseX: w * 0.86,
			baseY: h * 0.57,
			height: h * 0.48,
			canopyWidth: w * 0.34,
			depth: 0.59,
			lightDirX,
			rng: sceneRng
		});

		// Two well-spaced outdoor market stalls (left-midground primary stall, right-background stall)
		const drawStall = (
			sx: number,
			sy: number,
			sw: number,
			sh: number,
			sd: number,
			canopyColor: RgbTuple,
			hasSign: boolean
		) => {
			const stallId = fb.allocId();
			fb.applyGroundShadowEllipse(sx, sy + 6, sw * 0.62, sh * 0.14, sd - 0.02, 0.34);
			// Posts
			for (const px of [sx - sw * 0.46, sx + sw * 0.46]) {
				fb.fillCapsule(px, sy, px, sy - sh * 0.84, 3.2, sd + 0.004, stallId, 'structure', [118, 96, 76], undefined, lightDirX, 0.55);
			}
			// Pitched cream/terracotta canvas canopy
			fb.fillPolygon(
				[
					[sx - sw * 0.52, sy - sh * 0.82],
					[sx, sy - sh * 1.04],
					[sx + sw * 0.52, sy - sh * 0.82],
					[sx + sw * 0.5, sy - sh * 0.72],
					[sx - sw * 0.5, sy - sh * 0.72]
				],
				{
					depthTop: sd - 0.002,
					id: stallId,
					category: 'stall',
					colorTop: canopyColor,
					colorBottom: scaleRgb(canopyColor, 0.8, 0.2),
					lit: 0.86
				}
			);
			if (hasSign) {
				fb.fillPolygon(
					[
						[sx - sw * 0.24, sy - sh * 0.8],
						[sx + sw * 0.24, sy - sh * 0.8],
						[sx + sw * 0.24, sy - sh * 0.71],
						[sx - sw * 0.24, sy - sh * 0.71]
					],
					{
						depthTop: sd - 0.003,
						category: 'sign',
						colorTop: [54, 96, 82],
						colorBottom: [42, 78, 66],
						lit: 0.76
					}
				);
			}
			// Display table & colorful produce crates (citrus, greens, tomatoes/peaches)
			const tableY = sy - sh * 0.34;
			fb.fillPolygon(
				[
					[sx - sw * 0.44, tableY],
					[sx + sw * 0.44, tableY],
					[sx + sw * 0.42, sy - sh * 0.08],
					[sx - sw * 0.42, sy - sh * 0.08]
				],
				{
					depthTop: sd + 0.001,
					category: 'furniture',
					colorTop: [192, 156, 112],
					colorBottom: [142, 112, 78],
					lit: 0.66
				}
			);
			const crateColors: readonly RgbTuple[] = [
				[224, 134, 58],
				[96, 152, 74],
				[206, 74, 68],
				[232, 194, 72]
			];
			for (let c = 0; c < 4; c++) {
				const cx = lerp(sx - sw * 0.32, sx + sw * 0.32, c / 3);
				fb.fillShadedEllipse(
					cx,
					tableY - sh * 0.045,
					sw * 0.095,
					sh * 0.06,
					sd,
					fb.allocId(),
					'prop',
					crateColors[c]!,
					scaleRgb(crateColors[c]!, 0.74, 0.2),
					lightDirX,
					-0.6,
					0.78
				);
			}
		};

		drawStall(w * 0.32, h * 0.71, w * 0.26, h * 0.25, 0.36, [72, 126, 168], true);
		drawStall(w * 0.73, h * 0.64, w * 0.21, h * 0.2, 0.48, [214, 118, 86], false);

		const vendor = makeFigure(placeRng, fb, {
			pose: 'leaning',
			activityLabel: 'arranging goods at a market stall',
			footX: w * 0.28,
			footY: h * 0.705,
			height: h * 0.195,
			depth: 0.38,
			facing: 1,
			inShade: true,
			propKind: 'crate',
			preferredShirtIdx: 2
		});
		const focalShopper = makeFigure(placeRng, fb, {
			pose: 'carrying',
			activityLabel: 'shopping with a canvas tote on the plaza',
			footX: w * 0.47,
			footY: h * 0.78,
			height: h * 0.235,
			depth: 0.26,
			facing: -1,
			inShade: false,
			isFocal: true,
			propKind: 'bag',
			preferredShirtIdx: 1
		});
		const distantBrowser = makeFigure(placeRng, fb, {
			pose: 'standing',
			activityLabel: 'browsing a neighboring stall',
			footX: w * 0.68,
			footY: h * 0.67,
			height: h * 0.17,
			depth: 0.45,
			facing: 1,
			inShade: false,
			preferredShirtIdx: 3
		});
		figures.push(distantBrowser, vendor, focalShopper);
		focalX = 0.4;
		focalY = 0.66;
	} else {
		structureSummary = 'shaded park lawns, stone walkways, and wooden benches';
		activitySummary = 'two people sharing a picnic in live-oak shade while walkers cross the park path';

		// Lush park lawn + curving pale stone walkway preserving generous space between groups
		fb.fillPolygon(
			[
				[0, h * 0.51],
				[w, h * 0.51],
				[w, h],
				[0, h]
			],
			{
				depthTop: 0.68,
				depthBottom: 0.18,
				category: 'terrain',
				colorTop: [128, 158, 92],
				colorBottom: [96, 128, 72],
				lit: 0.8,
				noiseSeed: seed + 57,
				noiseAmount: 11
			}
		);
		fb.fillPolygon(
			[
				[w * 0.52, h * 0.515],
				[w * 0.64, h * 0.515],
				[w * 0.96, h],
				[w * 0.66, h]
			],
			{
				depthTop: 0.65,
				depthBottom: 0.13,
				category: 'path',
				colorTop: [222, 210, 188],
				colorBottom: [202, 188, 166],
				lit: 0.86,
				angleRad: 0.45,
				anisotropy: 0.3
			}
		);

		fb.drawTree({
			species: 'live-oak',
			baseX: w * 0.24,
			baseY: h * 0.65,
			height: h * 0.56,
			canopyWidth: w * 0.44,
			depth: 0.44,
			lightDirX,
			rng: sceneRng
		});
		fb.drawTree({
			species: 'pecan',
			baseX: w * 0.84,
			baseY: h * 0.59,
			height: h * 0.48,
			canopyWidth: w * 0.32,
			depth: 0.54,
			lightDirX,
			rng: sceneRng
		});

		// Woven picnic blanket in dappled oak shade + basket
		fb.applyGroundShadowEllipse(w * 0.32, h * 0.77, w * 0.22, h * 0.08, 0.22, 0.28);
		fb.fillPolygon(
			[
				[w * 0.24, h * 0.77],
				[w * 0.45, h * 0.76],
				[w * 0.49, h * 0.84],
				[w * 0.21, h * 0.85]
			],
			{
				depthTop: 0.29,
				category: 'prop',
				colorTop: [218, 198, 168],
				colorBottom: [188, 166, 138],
				lit: 0.72
			}
		);
		fb.fillShadedEllipse(w * 0.35, h * 0.79, w * 0.032, h * 0.025, 0.27, fb.allocId(), 'prop', [196, 148, 92], [142, 102, 58], lightDirX, -0.6, 0.76);

		const picnickerA = makeFigure(placeRng, fb, {
			pose: 'sitting',
			activityLabel: 'sharing a picnic on a blanket',
			footX: w * 0.29,
			footY: h * 0.815,
			height: h * 0.2,
			depth: 0.26,
			facing: 1,
			inShade: true,
			isFocal: true,
			preferredShirtIdx: 0
		});
		const picnickerB = makeFigure(placeRng, fb, {
			pose: 'sitting',
			activityLabel: 'sharing a picnic on a blanket',
			footX: w * 0.41,
			footY: h * 0.81,
			height: h * 0.195,
			depth: 0.265,
			facing: -1,
			inShade: false,
			preferredShirtIdx: 2
		});
		const parkWalker = makeFigure(placeRng, fb, {
			pose: 'walking',
			activityLabel: 'walking along the park path',
			footX: w * 0.72,
			footY: h * 0.72,
			height: h * 0.185,
			depth: 0.36,
			facing: -1,
			inShade: false,
			preferredShirtIdx: 4
		});
		figures.push(parkWalker, picnickerB, picnickerA);
		focalX = 0.35;
		focalY = 0.74;
	}

	for (const fig of [...figures].sort((a, b) => b.depth - a.depth)) {
		fb.drawFigure(fig, lightDirX);
	}

	return {
		focalArea: {
			x: focalX,
			y: focalY,
			radius: 0.24,
			subjectLabel: isMarket
				? 'shaded market stall, produce display, and plaza shoppers'
				: 'shaded park picnic and stone walkway'
		},
		figures,
		summary: {
			sceneFamily: 'plaza-market',
			templateName: isMarket ? 'plaza-market-stalls' : 'park-picnic-lawn',
			activitySummary,
			treeSummary: 'mature live oak and pecan shade trees',
			structureSummary,
			waterPresent: false,
			season: 'warm-daylight',
			signText,
			peopleCount: figures.length,
			lightDirectionX: lightDirX
		}
	};
}

function buildHillCountryCreekScene(
	fb: FieldBuilder,
	seed: number,
	w: number,
	h: number
): { focalArea: FocalArea; figures: SceneFigure[]; summary: SceneMetadataSummary } {
	const sceneRng = createStreamRng(seed, 'scene');
	const placeRng = createStreamRng(seed, 'placement');

	// Explicit seasonal treatment: wildflowers appear only in 'spring-bloom' (~25% of seeds), not every painting!
	const springBloom = sceneRng.chance(0.26);
	const lightDirX = sceneRng.chance(0.6) ? -0.7 : 0.7;

	fb.fillSkyGradient([98, 158, 216], [220, 232, 238], 0.42, seed);
	fb.drawCloudBank(w * 0.58, h * 0.14, w * 0.21, h * 0.052, [248, 245, 238], [190, 204, 220], lightDirX, sceneRng);

	// Rolling Texas Hill Country karst ridges in background (blue-sage juniper hills, not sandy desert!)
	fb.fillPolygon(
		[
			[0, h * 0.33],
			[w * 0.24, h * 0.25],
			[w * 0.54, h * 0.31],
			[w * 0.82, h * 0.24],
			[w, h * 0.28],
			[w, h * 0.5],
			[0, h * 0.5]
		],
		{
			depthTop: 0.9,
			depthBottom: 0.8,
			category: 'distant-hill',
			colorTop: [108, 136, 146],
			colorBottom: [88, 118, 108],
			lit: 0.78,
			noiseSeed: seed + 61,
			noiseAmount: 7
		}
	);

	// Midground rolling oak-juniper savanna slope & pale Cretaceous limestone bluff
	fb.fillPolygon(
		[
			[0, h * 0.42],
			[w * 0.45, h * 0.38],
			[w, h * 0.43],
			[w, h * 0.68],
			[0, h * 0.68]
		],
		{
			depthTop: 0.76,
			depthBottom: 0.58,
			category: 'terrain',
			colorTop: [148, 158, 98],
			colorBottom: [124, 138, 82],
			lit: 0.8,
			noiseSeed: seed + 67,
			noiseAmount: 11
		}
	);

	// Pale stepped Cretaceous limestone bluff & creek ledges on right/midground + left outcrop
	fb.fillPolygon(
		[
			[w * 0.4, h * 0.45],
			[w, h * 0.42],
			[w, h * 0.58],
			[w * 0.38, h * 0.56]
		],
		{
			depthTop: 0.66,
			depthBottom: 0.56,
			category: 'limestone',
			colorTop: [232, 222, 200],
			colorBottom: [182, 174, 156],
			lit: 0.86,
			angleRad: 0.04,
			anisotropy: 0.38,
			noiseSeed: seed + 71,
			noiseAmount: 10
		}
	);

	// Left-side grassy slope, limestone slabs, and pale caliche/limestone trail
	fb.fillPolygon(
		[
			[0, h * 0.52],
			[w * 0.52, h * 0.54],
			[w * 0.46, h],
			[0, h]
		],
		{
			depthTop: 0.61,
			depthBottom: 0.19,
			category: 'terrain',
			colorTop: [154, 162, 98],
			colorBottom: [128, 140, 80],
			lit: 0.82,
			noiseSeed: seed + 73,
			noiseAmount: 12
		}
	);

	// Pale crushed-limestone walking trail winding along left bank (strictly closer than grassy slope)
	fb.fillPolygon(
		[
			[w * 0.16, h * 0.54],
			[w * 0.25, h * 0.54],
			[w * 0.33, h],
			[w * 0.13, h]
		],
		{
			depthTop: 0.57,
			depthBottom: 0.13,
			category: 'path',
			colorTop: [228, 216, 192],
			colorBottom: [212, 198, 172],
			lit: 0.88,
			angleRad: 0.35,
			anisotropy: 0.3,
			noiseSeed: seed + 79,
			noiseAmount: 9
		}
	);

	// Flat pale limestone creek-bank shelf between trail and spring-fed stream
	fb.fillPolygon(
		[
			[w * 0.39, h * 0.545],
			[w * 0.52, h * 0.555],
			[w * 0.56, h],
			[w * 0.41, h]
		],
		{
			depthTop: 0.56,
			depthBottom: 0.14,
			category: 'limestone',
			colorTop: [226, 218, 200],
			colorBottom: [188, 180, 164],
			lit: 0.85,
			noiseSeed: seed + 83,
			noiseAmount: 10
		}
	);

	// Spring-fed clear Hill Country creek flowing over limestone bed
	fb.fillPolygon(
		[
			[w * 0.47, h * 0.55],
			[w, h * 0.56],
			[w, h],
			[w * 0.51, h]
		],
		{
			depthTop: 0.565,
			depthBottom: 0.15,
			category: 'water',
			colorTop: [74, 134, 124],
			colorBottom: [56, 110, 108],
			lit: 0.78,
			angleRad: 0,
			anisotropy: 0.55
		}
	);

	// Exposed flat limestone stepping slabs in shallow creek water
	for (const [sx, sy, srx, sry, sd] of [
		[w * 0.64, h * 0.72, w * 0.065, h * 0.022, 0.36],
		[w * 0.78, h * 0.82, w * 0.08, h * 0.026, 0.28]
	] as const) {
		fb.fillShadedEllipse(sx, sy, srx, sry, sd, fb.allocId(), 'limestone', [228, 220, 202], [168, 164, 152], lightDirX, -0.5, 0.84, 0, 0.42);
	}

	// Explicit spring wildflower patches ONLY when season === 'spring-bloom'
	if (springBloom) {
		const flowerId = fb.allocId();
		for (let p = 0; p < 7; p++) {
			const px = sceneRng.range(w * 0.04, w * 0.18);
			const py = sceneRng.range(h * 0.64, h * 0.92);
			const isBluebonnet = p % 3 !== 2;
			const litF: RgbTuple = isBluebonnet ? [78, 104, 188] : [214, 92, 62];
			const shadeF: RgbTuple = isBluebonnet ? [52, 72, 142] : [162, 62, 44];
			fb.fillShadedEllipse(px, py, w * 0.036, h * 0.018, 0.28, flowerId, 'foliage', litF, shadeF, lightDirX, -0.6, 0.84);
		}
	}

	// Ashe juniper ("cedar") mottes on limestone bluff + gnarled Hill Country live oaks
	fb.drawTree({
		species: 'ashe-juniper',
		baseX: w * 0.62,
		baseY: h * 0.48,
		height: h * 0.22,
		canopyWidth: w * 0.18,
		depth: 0.64,
		lightDirX,
		rng: sceneRng
	});
	fb.drawTree({
		species: 'ashe-juniper',
		baseX: w * 0.84,
		baseY: h * 0.47,
		height: h * 0.25,
		canopyWidth: w * 0.21,
		depth: 0.62,
		lightDirX,
		rng: sceneRng
	});
	fb.drawTree({
		species: 'live-oak',
		baseX: w * 0.1,
		baseY: h * 0.62,
		height: h * 0.48,
		canopyWidth: w * 0.36,
		depth: 0.46,
		lightDirX,
		rng: sceneRng
	});

	// Modest human activity: trail walkers & creekside rest on limestone ledge
	const restingHiker = makeFigure(placeRng, fb, {
		pose: 'sitting',
		activityLabel: 'resting on a streamside limestone ledge',
		footX: w * 0.465,
		footY: h * 0.745,
		height: h * 0.185,
		depth: 0.34,
		facing: 1,
		inShade: false,
		preferredShirtIdx: 1
	});
	const trailWalker = makeFigure(placeRng, fb, {
		pose: 'walking',
		activityLabel: 'walking along a Hill Country limestone creek trail',
		footX: w * 0.235,
		footY: h * 0.81,
		height: h * 0.235,
		depth: 0.24,
		facing: 1,
		inShade: false,
		isFocal: true,
		propKind: 'bag',
		preferredShirtIdx: 0
	});
	const figures = [restingHiker, trailWalker];
	for (const fig of [...figures].sort((a, b) => b.depth - a.depth)) {
		fb.drawFigure(fig, lightDirX);
	}

	// Reflect limestone bluff, Ashe junipers, sky, and streamside figure in clear spring creek
	fb.applyWaterReflections({
		waterBodyRgb: [72, 132, 122],
		waterDeepRgb: [48, 98, 96],
		sunShimmerRgb: [234, 230, 204],
		seed,
		reflectivity: 0.5
	});

	return {
		focalArea: {
			x: 0.36,
			y: 0.7,
			radius: 0.23,
			subjectLabel: 'trail walker, pale limestone creek bank, and clear spring-fed stream'
		},
		figures,
		summary: {
			sceneFamily: 'hill-country-creek',
			templateName: springBloom ? 'limestone-creek-spring' : 'limestone-creek-summer',
			activitySummary:
				'a walker on a pale limestone trail and a person resting beside a clear Hill Country creek',
			treeSummary: 'Hill Country live oak and Ashe juniper cover',
			structureSummary: 'exposed Cretaceous limestone ledges and a crushed-stone trail',
			waterPresent: true,
			season: springBloom ? 'spring-bloom' : 'warm-daylight',
			signText: null,
			peopleCount: figures.length,
			lightDirectionX: lightDirX
		}
	};
}

const sceneCache = new Map<string, SceneModel>();
const MAX_SCENE_CACHE = 8;

export function buildSceneModel(
	seed: number,
	sceneFamily: SceneFamilyId,
	artboardWidth: number,
	artboardHeight: number
): SceneModel {
	const cacheKey = `${seed}:${sceneFamily}:${artboardWidth}x${artboardHeight}`;
	const cached = sceneCache.get(cacheKey);
	if (cached) return cached;

	const fb = new FieldBuilder(artboardWidth, artboardHeight);
	let built: { focalArea: FocalArea; figures: SceneFigure[]; summary: SceneMetadataSummary };

	switch (sceneFamily) {
		case 'river-path':
			built = buildRiverPathScene(fb, seed, artboardWidth, artboardHeight);
			break;
		case 'neighborhood-street':
			built = buildNeighborhoodStreetScene(fb, seed, artboardWidth, artboardHeight);
			break;
		case 'plaza-market':
			built = buildPlazaMarketScene(fb, seed, artboardWidth, artboardHeight);
			break;
		case 'hill-country-creek':
			built = buildHillCountryCreekScene(fb, seed, artboardWidth, artboardHeight);
			break;
	}

	const fields = fb.finalize(built.focalArea);

	// Quiet, fully covered primed linen ground (no hidden scene shapes!)
	const groundTintRgb: RgbTuple =
		sceneFamily === 'hill-country-creek' ? [228, 220, 200] : [230, 222, 204];
	const groundSkyWarmthRgb: RgbTuple = [234, 228, 214];

	const model: SceneModel = {
		seed,
		sceneFamily,
		artboardWidth,
		artboardHeight,
		focalArea: built.focalArea,
		figures: built.figures,
		summary: built.summary,
		groundTintRgb,
		groundSkyWarmthRgb,
		fields
	};

	if (sceneCache.size >= MAX_SCENE_CACHE) {
		const oldest = sceneCache.keys().next().value;
		if (oldest !== undefined) sceneCache.delete(oldest);
	}
	sceneCache.set(cacheKey, model);
	return model;
}

export function describeSceneAccessible(scene: SceneModel, activeMarkCount: number): string {
	const { summary } = scene;
	const familyLead =
		summary.sceneFamily === 'river-path'
			? 'An interpreted San Antonio river path scene'
			: summary.sceneFamily === 'neighborhood-street'
				? 'An interpreted San Antonio neighborhood street scene'
				: summary.sceneFamily === 'plaza-market'
					? 'An interpreted Texas public plaza and park scene'
					: 'An interpreted Texas Hill Country creek and trail scene';

	const reflClause = summary.waterPresent ? ', water reflections,' : '';
	const seasonClause =
		summary.season === 'spring-bloom' ? ' with seasonal spring wildflowers,' : '';

	return `${familyLead} showing ${summary.activitySummary}, with ${summary.structureSummary}${reflClause} and ${summary.treeSummary}${seasonClause} rendered in ${activeMarkCount.toLocaleString('en-US')} small colored paint marks.`;
}
