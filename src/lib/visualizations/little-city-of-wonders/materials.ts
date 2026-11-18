import * as THREE from 'three';
import { clamp, createRng, fbm2D } from './prng';

export interface CityMaterialLibrary {
	// Stucco & Plaster
	plasterPeelingBrick: THREE.MeshStandardMaterial;
	plasterCream: THREE.MeshStandardMaterial;
	plasterDustyPink: THREE.MeshStandardMaterial;
	plasterMustard: THREE.MeshStandardMaterial;
	plasterCoral: THREE.MeshStandardMaterial;
	plasterOchre: THREE.MeshStandardMaterial;
	plasterSage: THREE.MeshStandardMaterial;
	plasterWeatheredBlue: THREE.MeshStandardMaterial;

	// Wood & Planks
	woodTurquoise: THREE.MeshStandardMaterial;
	woodDarkCharred: THREE.MeshStandardMaterial;
	woodWarmOak: THREE.MeshStandardMaterial;
	woodHoney: THREE.MeshStandardMaterial;
	woodWalnutPlinth: THREE.MeshStandardMaterial;
	woodBlueDoor: THREE.MeshStandardMaterial;
	woodRedDoor: THREE.MeshStandardMaterial;

	// Roofs & Awnings
	roofTerracotta: THREE.MeshStandardMaterial;
	roofVermilion: THREE.MeshStandardMaterial;
	roofSlateBlue: THREE.MeshStandardMaterial;
	roofCharcoalShingle: THREE.MeshStandardMaterial;
	roofCorrugatedTeal: THREE.MeshStandardMaterial;
	roofCorrugatedJade: THREE.MeshStandardMaterial;
	fabricStripedAwning: THREE.MeshStandardMaterial;
	fabricBalloonStripe: THREE.MeshStandardMaterial;

	// Ceramics & Stoneware (Teapot Quarter)
	ceramicSlateBlue: THREE.MeshStandardMaterial;
	ceramicTerracotta: THREE.MeshStandardMaterial;
	ceramicCream: THREE.MeshStandardMaterial;
	ceramicCeladon: THREE.MeshStandardMaterial;

	// Stone, Terrain & Water
	stoneCliff: THREE.MeshStandardMaterial;
	stoneDarkCrag: THREE.MeshStandardMaterial;
	stoneCobble: THREE.MeshStandardMaterial;
	stoneTravertine: THREE.MeshStandardMaterial;
	mossyGrass: THREE.MeshStandardMaterial;
	autumnGrass: THREE.MeshStandardMaterial;
	coastalSand: THREE.MeshStandardMaterial;
	waterSurface: THREE.MeshPhysicalMaterial;

	// Metals & Props
	metalIron: THREE.MeshStandardMaterial;
	metalCopper: THREE.MeshStandardMaterial;
	metalBrass: THREE.MeshStandardMaterial;
	metalAgedTin: THREE.MeshStandardMaterial;
	vendingOrangeBody: THREE.MeshStandardMaterial;
	vendingWhiteBody: THREE.MeshStandardMaterial;
	clayFoliage: THREE.MeshStandardMaterial;
	claySteam: THREE.MeshStandardMaterial;
	catBlack: THREE.MeshStandardMaterial;
	catGinger: THREE.MeshStandardMaterial;
	gullWhite: THREE.MeshStandardMaterial;

	// Dynamic Glowing Windows & Lanterns
	windowWarmMullion: THREE.MeshStandardMaterial;
	windowAmberPane: THREE.MeshStandardMaterial;
	lanternGlass: THREE.MeshStandardMaterial;
	paperLanternRed: THREE.MeshStandardMaterial;
	paperLanternCream: THREE.MeshStandardMaterial;
	neonOrangeKanji: THREE.MeshStandardMaterial;
	vendingDisplayGlow: THREE.MeshStandardMaterial;
	fireflyJarGlow: THREE.MeshStandardMaterial;
	lighthouseBeamMat: THREE.MeshBasicMaterial;

	updateTimeGlow: (
		windowGlow: number,
		lanternGlow: number,
		waterDeepHex: string,
		waterShallowHex: string
	) => void;
	dispose: () => void;
}

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	return { canvas, ctx };
}

export function createCityMaterials(): CityMaterialLibrary {
	const textures: THREE.Texture[] = [];
	const materials: THREE.Material[] = [];

	const registerTex = (canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1, isColor = true) => {
		const tex = new THREE.CanvasTexture(canvas);
		tex.wrapS = THREE.RepeatWrapping;
		tex.wrapT = THREE.RepeatWrapping;
		tex.repeat.set(repeatX, repeatY);
		if (isColor) {
			tex.colorSpace = THREE.SRGBColorSpace;
		}
		tex.needsUpdate = true;
		textures.push(tex);
		return tex;
	};

	const trackMat = <T extends THREE.Material>(m: T): T => {
		materials.push(m);
		return m;
	};

	// 1. Hand-troweled clay/stucco texture generator
	function buildStuccoPair(
		baseHex: string,
		warmShiftHex: string,
		seed: number,
		repeat = 2
	): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
		const size = 128;
		const { canvas: cCol, ctx: xCol } = makeCanvas(size);
		const { canvas: cBump, ctx: xBump } = makeCanvas(size);
		const rng = createRng(seed);

		xCol.fillStyle = baseHex;
		xCol.fillRect(0, 0, size, size);
		xBump.fillStyle = '#808080';
		xBump.fillRect(0, 0, size, size);

		// Soft sponge/clay mottling
		for (let i = 0; i < 260; i++) {
			const x = rng() * size;
			const y = rng() * size;
			const r = 4 + rng() * 16;
			xCol.globalAlpha = 0.05 + rng() * 0.08;
			xCol.fillStyle = rng() > 0.45 ? warmShiftHex : '#2a221c';
			xCol.beginPath();
			xCol.arc(x, y, r, 0, Math.PI * 2);
			xCol.fill();

			const bVal = Math.floor(105 + rng() * 50);
			xBump.globalAlpha = 0.14;
			xBump.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
			xBump.beginPath();
			xBump.arc(x, y, r * 0.7, 0, Math.PI * 2);
			xBump.fill();
		}

		// Tiny hairline plaster cracks & speckles
		xCol.globalAlpha = 0.14;
		xCol.strokeStyle = '#4a3d33';
		xCol.lineWidth = 1;
		for (let i = 0; i < 14; i++) {
			let cx = rng() * size;
			let cy = rng() * size;
			xCol.beginPath();
			xCol.moveTo(cx, cy);
			for (let s = 0; s < 5; s++) {
				cx += (rng() - 0.5) * 14;
				cy += rng() * 10;
				xCol.lineTo(cx, cy);
			}
			xCol.stroke();
		}

		return {
			map: registerTex(cCol, repeat, repeat, true),
			bump: registerTex(cBump, repeat, repeat, false)
		};
	}

	// 2. Peeling cream plaster exposing warm terracotta brick (Ref 1 Hero!)
	function buildPeelingBrickPlaster(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
		const size = 256;
		const { canvas: cCol, ctx: xCol } = makeCanvas(size);
		const { canvas: cBump, ctx: xBump } = makeCanvas(size);
		const rng = createRng(101);

		// First paint full warm mortar + brick courses
		xCol.fillStyle = '#cfc1ab';
		xCol.fillRect(0, 0, size, size);
		xBump.fillStyle = '#555555';
		xBump.fillRect(0, 0, size, size);

		const rows = 16;
		const cols = 8;
		const bh = size / rows;
		const bw = size / cols;
		const brickPalette = ['#b8523d', '#c76148', '#a34431', '#cb6f52', '#9c402f'];

		for (let r = 0; r < rows; r++) {
			const offset = (r % 2) * (bw * 0.5);
			for (let c = -1; c <= cols; c++) {
				const bx = c * bw + offset + 1.5;
				const by = r * bh + 1.5;
				xCol.fillStyle = brickPalette[Math.floor(rng() * brickPalette.length)];
				xCol.fillRect(bx, by, bw - 3, bh - 3);
				xBump.fillStyle = '#8a8a8a';
				xBump.fillRect(bx, by, bw - 3, bh - 3);
			}
		}

		// Now overlay thick cream plaster where fbm noise says plaster remains intact
		// (more brick exposed near the bottom of UV, plus patches higher up!)
		const block = 4;
		for (let py = 0; py < size; py += block) {
			const vNorm = py / size; // 0 top, 1 bottom
			for (let px = 0; px < size; px += block) {
				const n = fbm2D(px * 0.035, py * 0.035, 3, 77);
				const threshold = vNorm > 0.62 ? 0.12 : -0.26;
				if (n > threshold) {
					const shade = Math.floor(234 + (rng() - 0.5) * 14);
					xCol.fillStyle = `rgb(${shade}, ${shade - 9}, ${shade - 25})`;
					xCol.fillRect(px, py, block, block);
					xBump.fillStyle = '#dcdcdc';
					xBump.fillRect(px, py, block, block);
				}
			}
		}

		return {
			map: registerTex(cCol, 1.5, 1.5, true),
			bump: registerTex(cBump, 1.5, 1.5, false)
		};
	}

	// 3. Painted timber planks
	function buildPlankPair(
		baseHex: string,
		variationHex: string,
		vertical: boolean,
		seed: number,
		repeat = 2
	): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
		const size = 128;
		const { canvas: cCol, ctx: xCol } = makeCanvas(size);
		const { canvas: cBump, ctx: xBump } = makeCanvas(size);
		const rng = createRng(seed);

		xCol.fillStyle = baseHex;
		xCol.fillRect(0, 0, size, size);
		xBump.fillStyle = '#999999';
		xBump.fillRect(0, 0, size, size);

		const planks = 8;
		const step = size / planks;
		for (let i = 0; i < planks; i++) {
			xCol.globalAlpha = 0.08 + rng() * 0.14;
			xCol.fillStyle = rng() > 0.5 ? variationHex : '#1f1a17';
			if (vertical) {
				xCol.fillRect(i * step, 0, step - 1, size);
				xCol.globalAlpha = 0.42;
				xCol.fillStyle = '#1d1916';
				xCol.fillRect(i * step, 0, 1.4, size);
				xBump.fillStyle = '#383838';
				xBump.fillRect(i * step, 0, 1.5, size);
			} else {
				xCol.fillRect(0, i * step, size, step - 1);
				xCol.globalAlpha = 0.42;
				xCol.fillStyle = '#1d1916';
				xCol.fillRect(0, i * step, size, 1.4);
				xBump.fillStyle = '#383838';
				xBump.fillRect(0, i * step, size, 1.5);
			}
		}

		return {
			map: registerTex(cCol, repeat, repeat, true),
			bump: registerTex(cBump, repeat, repeat, false)
		};
	}

	// 4. Scalloped Roof Shingles / Clay Tiles
	function buildShinglePair(
		palette: string[],
		seed: number,
		repeatX = 3,
		repeatY = 3
	): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
		const size = 128;
		const { canvas: cCol, ctx: xCol } = makeCanvas(size);
		const { canvas: cBump, ctx: xBump } = makeCanvas(size);
		const rng = createRng(seed);

		xCol.fillStyle = palette[0];
		xCol.fillRect(0, 0, size, size);
		xBump.fillStyle = '#707070';
		xBump.fillRect(0, 0, size, size);

		const rows = 8;
		const cols = 6;
		const rh = size / rows;
		const cw = size / cols;

		for (let r = 0; r < rows; r++) {
			const off = (r % 2) * (cw * 0.5);
			for (let c = -1; c <= cols; c++) {
				const x = c * cw + off;
				const y = r * rh;
				xCol.fillStyle = palette[Math.floor(rng() * palette.length)];
				xCol.fillRect(x + 1, y + 1, cw - 2, rh - 2);
				xCol.fillStyle = 'rgba(20,16,14,0.32)';
				xCol.fillRect(x, y + rh - 2.2, cw, 2.2);

				const b = Math.floor(135 + rng() * 70);
				xBump.fillStyle = `rgb(${b},${b},${b})`;
				xBump.fillRect(x + 1, y + 1, cw - 2, rh - 3);
				xBump.fillStyle = '#282828';
				xBump.fillRect(x, y + rh - 2.5, cw, 2.5);
			}
		}

		return {
			map: registerTex(cCol, repeatX, repeatY, true),
			bump: registerTex(cBump, repeatX, repeatY, false)
		};
	}

	// 5. Pottery Ceramic Stoneware Glaze (wheel rings + pinholes)
	function buildCeramicPair(baseHex: string, speckHex: string, seed: number) {
		const size = 128;
		const { canvas: cCol, ctx: xCol } = makeCanvas(size);
		const { canvas: cBump, ctx: xBump } = makeCanvas(size);
		const rng = createRng(seed);

		xCol.fillStyle = baseHex;
		xCol.fillRect(0, 0, size, size);
		xBump.fillStyle = '#888888';
		xBump.fillRect(0, 0, size, size);

		// Subtle potter's wheel horizontal throwing ribs
		for (let y = 0; y < size; y += 3) {
			xCol.globalAlpha = 0.04 + rng() * 0.05;
			xCol.fillStyle = y % 6 === 0 ? '#ffffff' : '#1b242c';
			xCol.fillRect(0, y, size, 1.5);
			const b = Math.floor(125 + Math.sin(y * 0.45) * 18);
			xBump.fillStyle = `rgb(${b},${b},${b})`;
			xBump.fillRect(0, y, size, 2);
		}

		// Tiny iron stoneware speckles
		xCol.globalAlpha = 0.28;
		xCol.fillStyle = speckHex;
		for (let i = 0; i < 180; i++) {
			xCol.fillRect(rng() * size, rng() * size, 1.3, 1.3);
		}

		return {
			map: registerTex(cCol, 2, 2, true),
			bump: registerTex(cBump, 2, 2, false)
		};
	}

	// 6. Cobblestone paving
	function buildCobblePair() {
		const size = 128;
		const { canvas: cCol, ctx: xCol } = makeCanvas(size);
		const { canvas: cBump, ctx: xBump } = makeCanvas(size);
		const rng = createRng(512);

		xCol.fillStyle = '#6e6459';
		xCol.fillRect(0, 0, size, size);
		xBump.fillStyle = '#3a3a3a';
		xBump.fillRect(0, 0, size, size);

		const tones = ['#a89c8a', '#968a79', '#b5a894', '#877c6d', '#9e907c'];
		const rows = 10;
		const cols = 10;
		const cw = size / cols;
		const rh = size / rows;
		for (let r = 0; r < rows; r++) {
			const off = (r % 2) * (cw * 0.5);
			for (let c = -1; c <= cols; c++) {
				const cx = c * cw + off + cw * 0.5;
				const cy = r * rh + rh * 0.5;
				xCol.fillStyle = tones[Math.floor(rng() * tones.length)];
				xCol.beginPath();
				xCol.ellipse(cx, cy, cw * 0.42, rh * 0.39, (rng() - 0.5) * 0.3, 0, Math.PI * 2);
				xCol.fill();

				xBump.fillStyle = '#d4d4d4';
				xBump.beginPath();
				xBump.ellipse(cx, cy, cw * 0.4, rh * 0.37, 0, 0, Math.PI * 2);
				xBump.fill();
			}
		}
		return {
			map: registerTex(cCol, 34, 34, true),
			bump: registerTex(cBump, 34, 34, false)
		};
	}

	// 7. Striped fabric texture (café awning & hot-air balloon)
	function buildStripedTex(colorA: string, colorB: string, stripes = 8): THREE.CanvasTexture {
		const { canvas, ctx } = makeCanvas(128);
		const w = 128 / stripes;
		for (let i = 0; i < stripes; i++) {
			ctx.fillStyle = i % 2 === 0 ? colorA : colorB;
			ctx.fillRect(i * w, 0, w + 0.5, 128);
		}
		return registerTex(canvas, 1, 1, true);
	}

	// 8. Mullioned Warm Window Texture
	function buildMullionWindowTex(): THREE.CanvasTexture {
		const { canvas, ctx } = makeCanvas(128);
		const grad = ctx.createLinearGradient(0, 0, 0, 128);
		grad.addColorStop(0, '#ffd88a');
		grad.addColorStop(0.55, '#ffae47');
		grad.addColorStop(1, '#d97828');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, 128, 128);

		// Cozy soft interior silhouette (curtain & plant pot hint)
		ctx.fillStyle = 'rgba(110, 52, 18, 0.25)';
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.quadraticCurveTo(36, 48, 12, 128);
		ctx.lineTo(0, 128);
		ctx.fill();

		// Wooden muntin crossbars
		ctx.fillStyle = '#3b291e';
		ctx.fillRect(0, 0, 128, 7);
		ctx.fillRect(0, 121, 128, 7);
		ctx.fillRect(0, 0, 7, 128);
		ctx.fillRect(121, 0, 7, 128);
		ctx.fillRect(61, 0, 6, 128);
		ctx.fillRect(0, 61, 128, 6);

		return registerTex(canvas, 1, 1, true);
	}

	// 9. Stylized Vertical Neon Shop Sign & Vending Display
	function buildNeonKanjiTex(): THREE.CanvasTexture {
		const { canvas, ctx } = makeCanvas(128);
		ctx.fillStyle = '#f25c19';
		ctx.fillRect(0, 0, 128, 128);
		ctx.strokeStyle = '#fff5dc';
		ctx.lineWidth = 6;
		ctx.strokeRect(8, 8, 112, 112);

		// Stylized handmade brush glyphs (Ramen / Star Noodle bowl icon)
		ctx.lineCap = 'round';
		ctx.lineWidth = 7;
		ctx.beginPath();
		ctx.moveTo(38, 28);
		ctx.lineTo(90, 28);
		ctx.moveTo(34, 46);
		ctx.lineTo(94, 46);
		ctx.quadraticCurveTo(82, 72, 46, 74);
		ctx.stroke();

		// Steaming noodle bowl emblem at bottom
		ctx.fillStyle = '#ffd56b';
		ctx.beginPath();
		ctx.arc(64, 96, 20, 0, Math.PI, false);
		ctx.fill();
		return registerTex(canvas, 1, 1, true);
	}

	function buildVendingDisplayTex(): THREE.CanvasTexture {
		const { canvas, ctx } = makeCanvas(128);
		ctx.fillStyle = '#fff2d6';
		ctx.fillRect(0, 0, 128, 128);
		const canColors = ['#e84a3c', '#3db58a', '#f2b632', '#4a90c9', '#e06d94', '#7cc449'];
		for (let row = 0; row < 3; row++) {
			ctx.fillStyle = '#403832';
			ctx.fillRect(8, 36 + row * 34, 112, 4);
			for (let c = 0; c < 6; c++) {
				ctx.fillStyle = canColors[(row * 6 + c) % canColors.length];
				ctx.fillRect(14 + c * 17, 14 + row * 34, 11, 20);
			}
		}
		return registerTex(canvas, 1, 1, true);
	}

	const brickPlaster = buildPeelingBrickPlaster();
	const creamStucco = buildStuccoPair('#efe6d2', '#e0cfa8', 11, 2);
	const pinkStucco = buildStuccoPair('#df7a99', '#f09cb5', 12, 2);
	const mustardStucco = buildStuccoPair('#ecc032', '#d99e1e', 13, 2);
	const coralStucco = buildStuccoPair('#d9654c', '#e8876b', 14, 2);
	const ochreStucco = buildStuccoPair('#e3b564', '#cfa04c', 15, 2);
	const sageStucco = buildStuccoPair('#7fa38c', '#98baa4', 16, 2);
	const bluePlaster = buildStuccoPair('#486884', '#5c809e', 17, 2);

	const turquoiseWood = buildPlankPair('#3595a3', '#52b2bf', true, 21, 2);
	const charredWood = buildPlankPair('#35302d', '#4d4540', true, 22, 2);
	const oakWood = buildPlankPair('#8c5d38', '#a8754c', false, 23, 2);
	const honeyWood = buildPlankPair('#b87d44', '#cf965b', false, 24, 2);

	const terracottaRoof = buildShinglePair(['#b84e39', '#c95f47', '#9e3f2d', '#d17156'], 31, 3, 3);
	const vermilionRoof = buildShinglePair(['#c94130', '#d9523f', '#ad3324', '#e0634e'], 32, 3, 3);
	const slateBlueRoof = buildShinglePair(['#3f5773', '#4d6988', '#334861', '#5a7796'], 33, 3, 3);
	const charcoalRoof = buildShinglePair(['#33353b', '#41444c', '#292b30', '#4d5059'], 34, 3, 3);
	const tealTinRoof = buildPlankPair('#4b9b99', '#6ac0ba', true, 35, 3);
	const jadeTinRoof = buildPlankPair('#5e9670', '#7db58d', true, 36, 3);

	const blueCeramic = buildCeramicPair('#5883a1', '#2c475c', 41);
	const terraCeramic = buildCeramicPair('#cf7646', '#73381c', 42);
	const creamCeramic = buildCeramicPair('#f0eadb', '#8c7b68', 43);
	const celadonCeramic = buildCeramicPair('#7ca38f', '#3d594b', 44);

	const cliffStone = buildStuccoPair('#948b7a', '#6e6759', 51, 3);
	const darkCragStone = buildStuccoPair('#45423f', '#2d2b29', 52, 3);
	const cobbles = buildCobblePair();

	const mullionTex = buildMullionWindowTex();
	const neonTex = buildNeonKanjiTex();
	const vendingTex = buildVendingDisplayTex();

	const plasterPeelingBrick = trackMat(
		new THREE.MeshStandardMaterial({
			map: brickPlaster.map,
			bumpMap: brickPlaster.bump,
			bumpScale: 0.08,
			roughness: 0.9,
			metalness: 0.02,
			vertexColors: true
		})
	);

	const makeStuccoMat = (pair: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }) =>
		trackMat(
			new THREE.MeshStandardMaterial({
				map: pair.map,
				bumpMap: pair.bump,
				bumpScale: 0.05,
				roughness: 0.88,
				metalness: 0.02,
				vertexColors: true
			})
		);

	const makeWoodMat = (pair: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }) =>
		trackMat(
			new THREE.MeshStandardMaterial({
				map: pair.map,
				bumpMap: pair.bump,
				bumpScale: 0.055,
				roughness: 0.82,
				metalness: 0.03,
				vertexColors: true
			})
		);

	const makeRoofMat = (
		pair: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture },
		doubleSide = false
	) =>
		trackMat(
			new THREE.MeshStandardMaterial({
				map: pair.map,
				bumpMap: pair.bump,
				bumpScale: 0.075,
				roughness: 0.8,
				metalness: 0.05,
				side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
				vertexColors: true
			})
		);

	const makeCeramicMat = (pair: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }) =>
		trackMat(
			new THREE.MeshStandardMaterial({
				map: pair.map,
				bumpMap: pair.bump,
				bumpScale: 0.03,
				roughness: 0.44,
				metalness: 0.06,
				vertexColors: true
			})
		);

	const windowWarmMullion = trackMat(
		new THREE.MeshStandardMaterial({
			map: mullionTex,
			emissiveMap: mullionTex,
			emissive: new THREE.Color('#ffaa3b'),
			emissiveIntensity: 0.65,
			roughness: 0.35,
			metalness: 0.08
		})
	);

	const windowAmberPane = trackMat(
		new THREE.MeshStandardMaterial({
			color: '#ffd075',
			emissive: new THREE.Color('#ff9d2e'),
			emissiveIntensity: 0.75,
			roughness: 0.3,
			metalness: 0.05
		})
	);

	const lanternGlass = trackMat(
		new THREE.MeshStandardMaterial({
			color: '#ffe299',
			emissive: new THREE.Color('#ffaa33'),
			emissiveIntensity: 0.9,
			roughness: 0.25,
			metalness: 0.05
		})
	);

	const paperLanternRed = trackMat(
		new THREE.MeshStandardMaterial({
			color: '#e85238',
			emissive: new THREE.Color('#ff6a33'),
			emissiveIntensity: 0.65,
			roughness: 0.72
		})
	);

	const paperLanternCream = trackMat(
		new THREE.MeshStandardMaterial({
			color: '#faecd2',
			emissive: new THREE.Color('#ffb85c'),
			emissiveIntensity: 0.6,
			roughness: 0.72
		})
	);

	const neonOrangeKanji = trackMat(
		new THREE.MeshStandardMaterial({
			map: neonTex,
			emissiveMap: neonTex,
			emissive: new THREE.Color('#ff7b29'),
			emissiveIntensity: 0.7,
			roughness: 0.4
		})
	);

	const vendingDisplayGlow = trackMat(
		new THREE.MeshStandardMaterial({
			map: vendingTex,
			emissiveMap: vendingTex,
			emissive: new THREE.Color('#ffe0a6'),
			emissiveIntensity: 0.6,
			roughness: 0.3
		})
	);

	const fireflyJarGlow = trackMat(
		new THREE.MeshStandardMaterial({
			color: '#c8f59b',
			emissive: new THREE.Color('#a6f059'),
			emissiveIntensity: 0.85,
			roughness: 0.2,
			transparent: true,
			opacity: 0.9
		})
	);

	const lighthouseBeamMat = trackMat(
		new THREE.MeshBasicMaterial({
			color: '#ffd884',
			transparent: true,
			opacity: 0.14,
			depthWrite: false,
			side: THREE.DoubleSide,
			blending: THREE.AdditiveBlending
		})
	);

	const waterSurface = trackMat(
		new THREE.MeshPhysicalMaterial({
			color: '#2fb3c2',
			emissive: new THREE.Color('#104e5e'),
			emissiveIntensity: 0.42,
			roughness: 0.14,
			metalness: 0.05,
			transparent: true,
			opacity: 0.9,
			clearcoat: 0.85,
			clearcoatRoughness: 0.14
		})
	);

	function updateTimeGlow(
		windowGlow: number,
		lanternGlow: number,
		_waterDeepHex: string,
		waterShallowHex: string
	) {
		const w = clamp(windowGlow, 0.08, 1.8);
		const l = clamp(lanternGlow, 0.05, 2.0);
		windowWarmMullion.emissiveIntensity = 0.25 + w * 1.15;
		windowAmberPane.emissiveIntensity = 0.3 + w * 1.25;
		lanternGlass.emissiveIntensity = 0.35 + l * 1.45;
		paperLanternRed.emissiveIntensity = 0.22 + l * 1.05;
		paperLanternCream.emissiveIntensity = 0.22 + l * 1.0;
		neonOrangeKanji.emissiveIntensity = 0.28 + l * 1.15;
		vendingDisplayGlow.emissiveIntensity = 0.25 + l * 0.95;
		fireflyJarGlow.emissiveIntensity = 0.45 + l * 1.1;
		lighthouseBeamMat.opacity = clamp((l - 0.25) * 0.16, 0.0, 0.2);
		waterSurface.color.set(waterShallowHex);
	}

	function dispose() {
		for (const m of materials) m.dispose();
		for (const t of textures) t.dispose();
	}

	return {
		plasterPeelingBrick,
		plasterCream: makeStuccoMat(creamStucco),
		plasterDustyPink: makeStuccoMat(pinkStucco),
		plasterMustard: makeStuccoMat(mustardStucco),
		plasterCoral: makeStuccoMat(coralStucco),
		plasterOchre: makeStuccoMat(ochreStucco),
		plasterSage: makeStuccoMat(sageStucco),
		plasterWeatheredBlue: makeStuccoMat(bluePlaster),

		woodTurquoise: makeWoodMat(turquoiseWood),
		woodDarkCharred: makeWoodMat(charredWood),
		woodWarmOak: makeWoodMat(oakWood),
		woodHoney: makeWoodMat(honeyWood),
		woodWalnutPlinth: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#3a271c',
				roughness: 0.58,
				metalness: 0.08
			})
		),
		woodBlueDoor: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#46739c',
				roughness: 0.78,
				vertexColors: true
			})
		),
		woodRedDoor: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#c93c2e',
				roughness: 0.74,
				vertexColors: true
			})
		),

		roofTerracotta: makeRoofMat(terracottaRoof, true),
		roofVermilion: makeRoofMat(vermilionRoof, true),
		roofSlateBlue: makeRoofMat(slateBlueRoof, true),
		roofCharcoalShingle: makeRoofMat(charcoalRoof, true),
		roofCorrugatedTeal: makeRoofMat(tealTinRoof, true),
		roofCorrugatedJade: makeRoofMat(jadeTinRoof, true),
		fabricStripedAwning: trackMat(
			new THREE.MeshStandardMaterial({
				map: buildStripedTex('#cf5b43', '#f5ecda', 10),
				roughness: 0.88,
				side: THREE.DoubleSide
			})
		),
		fabricBalloonStripe: trackMat(
			new THREE.MeshStandardMaterial({
				map: buildStripedTex('#4ea6a8', '#f5ecda', 12),
				roughness: 0.76,
				vertexColors: true
			})
		),

		ceramicSlateBlue: makeCeramicMat(blueCeramic),
		ceramicTerracotta: makeCeramicMat(terraCeramic),
		ceramicCream: makeCeramicMat(creamCeramic),
		ceramicCeladon: makeCeramicMat(celadonCeramic),

		stoneCliff: makeStuccoMat(cliffStone),
		stoneDarkCrag: makeStuccoMat(darkCragStone),
		stoneCobble: trackMat(
			new THREE.MeshStandardMaterial({
				map: cobbles.map,
				bumpMap: cobbles.bump,
				bumpScale: 0.06,
				roughness: 0.88,
				vertexColors: true
			})
		),
		stoneTravertine: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#dfd5c0',
				roughness: 0.82,
				vertexColors: true
			})
		),
		mossyGrass: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#638255',
				roughness: 0.92,
				vertexColors: true
			})
		),
		autumnGrass: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#b88644',
				roughness: 0.92,
				vertexColors: true
			})
		),
		coastalSand: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#d8ccb4',
				roughness: 0.92,
				vertexColors: true
			})
		),
		waterSurface,

		metalIron: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#2b2d30',
				roughness: 0.62,
				metalness: 0.65
			})
		),
		metalCopper: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#b86b43',
				roughness: 0.42,
				metalness: 0.72,
				vertexColors: true
			})
		),
		metalBrass: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#cfa14e',
				roughness: 0.38,
				metalness: 0.76
			})
		),
		metalAgedTin: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#aeb5b8',
				roughness: 0.56,
				metalness: 0.48
			})
		),
		vendingOrangeBody: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#ee7424',
				roughness: 0.46,
				metalness: 0.2
			})
		),
		vendingWhiteBody: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#e8e4d8',
				roughness: 0.5,
				metalness: 0.16
			})
		),
		clayFoliage: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#ffffff',
				roughness: 0.88,
				metalness: 0.01,
				vertexColors: true
			})
		),
		claySteam: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#f7f3ea',
				roughness: 0.95,
				metalness: 0.0,
				transparent: true,
				opacity: 0.86
			})
		),
		catBlack: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#1e1d22',
				roughness: 0.85
			})
		),
		catGinger: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#d47434',
				roughness: 0.85
			})
		),
		gullWhite: trackMat(
			new THREE.MeshStandardMaterial({
				color: '#f4f1ea',
				roughness: 0.78
			})
		),

		windowWarmMullion,
		windowAmberPane,
		lanternGlass,
		paperLanternRed,
		paperLanternCream,
		neonOrangeKanji,
		vendingDisplayGlow,
		fireflyJarGlow,
		lighthouseBeamMat,

		updateTimeGlow,
		dispose
	};
}
