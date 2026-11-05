import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const outDir = path.join(process.cwd(), 'static', 'images', 'visualizations', 'binaural-acoustic-soundboard');
const outFile = path.join(outDir, 'social.png');

await mkdir(outDir, { recursive: true });

const fromScreenshotIdx = process.argv.indexOf('--from-screenshot');
if (fromScreenshotIdx !== -1 && process.argv[fromScreenshotIdx + 1]) {
	const screenshotPath = process.argv[fromScreenshotIdx + 1];
	await sharp(screenshotPath)
		.resize(1200, 630, {
			fit: 'cover',
			position: 'north'
		})
		.png({ compressionLevel: 9, palette: true, quality: 88 })
		.toFile(outFile);
	console.log(`Generated social.png from rendered screenshot: ${outFile}`);
	process.exit(0);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
	<rect width="1200" height="630" fill="#111315"/>
	<rect x="28" y="24" width="1144" height="582" rx="14" fill="#1a1c1f" stroke="#2d3137" stroke-width="2"/>
	<!-- Header -->
	<text x="60" y="68" fill="#d46a2e" font-family="monospace" font-size="13" letter-spacing="2">ACOUSTIC MIXER · STEREO SYNTHESIS</text>
	<text x="60" y="102" fill="#f2ede4" font-family="Arial, sans-serif" font-size="28" font-weight="700">Binaural Acoustic Soundboard</text>
	<text x="60" y="128" fill="#a8a39b" font-family="Arial, sans-serif" font-size="15">Mix rain, a fan, soft noise and optional binaural tones. Save a mix you like, or set it to stop after 15, 30 or 60 minutes.</text>
	<!-- Status Display -->
	<rect x="60" y="148" width="1080" height="62" rx="8" fill="#0d0f11" stroke="#262a2f" stroke-width="1.5"/>
	<circle cx="88" cy="179" r="6" fill="#e07434"/>
	<text x="106" y="185" fill="#f2ede4" font-family="Arial, sans-serif" font-size="18" font-weight="600">Playing · Reading</text>
	<text x="540" y="185" fill="#f2a359" font-family="monospace" font-size="17" font-weight="600">Stops in 24:18</text>
	<text x="900" y="184" fill="#8b877f" font-family="monospace" font-size="13">OUTPUT</text>
	<rect x="970" y="174" width="120" height="10" rx="5" fill="#181b1f"/>
	<rect x="970" y="174" width="56" height="10" rx="5" fill="#d46a2e"/>
	<!-- Five Channel Strips -->
	<g transform="translate(60, 228)">
		<!-- Rain -->
		<rect x="0" y="0" width="144" height="346" rx="10" fill="#212428" stroke="#30343b"/>
		<text x="16" y="28" fill="#f2ede4" font-family="Arial, sans-serif" font-size="15" font-weight="600">Rain</text>
		<text x="128" y="28" text-anchor="end" fill="#f2a359" font-family="monospace" font-size="14" font-weight="700">30%</text>
		<rect x="68" y="54" width="8" height="210" rx="4" fill="#101215"/>
		<rect x="68" y="197" width="8" height="67" rx="4" fill="#d46a2e"/>
		<rect x="54" y="190" width="36" height="16" rx="4" fill="#3a3f47" stroke="#f2a359" stroke-width="1.5"/>
		<rect x="16" y="294" width="112" height="34" rx="6" fill="#181b1f" stroke="#30343b"/>
		<text x="72" y="316" text-anchor="middle" fill="#cfc9bf" font-family="Arial, sans-serif" font-size="13" font-weight="600">Mute</text>

		<!-- Fan -->
		<g transform="translate(158, 0)">
			<rect x="0" y="0" width="144" height="346" rx="10" fill="#212428" stroke="#30343b"/>
			<text x="16" y="28" fill="#f2ede4" font-family="Arial, sans-serif" font-size="15" font-weight="600">Fan</text>
			<text x="128" y="28" text-anchor="end" fill="#f2a359" font-family="monospace" font-size="14" font-weight="700">15%</text>
			<rect x="68" y="54" width="8" height="210" rx="4" fill="#101215"/>
			<rect x="68" y="232" width="8" height="32" rx="4" fill="#d46a2e"/>
			<rect x="54" y="225" width="36" height="16" rx="4" fill="#3a3f47" stroke="#f2a359" stroke-width="1.5"/>
			<rect x="16" y="294" width="112" height="34" rx="6" fill="#181b1f" stroke="#30343b"/>
			<text x="72" y="316" text-anchor="middle" fill="#cfc9bf" font-family="Arial, sans-serif" font-size="13" font-weight="600">Mute</text>
		</g>

		<!-- Distant city -->
		<g transform="translate(316, 0)">
			<rect x="0" y="0" width="144" height="346" rx="10" fill="#212428" stroke="#30343b"/>
			<text x="16" y="28" fill="#f2ede4" font-family="Arial, sans-serif" font-size="15" font-weight="600">Distant city</text>
			<text x="128" y="28" text-anchor="end" fill="#8b877f" font-family="monospace" font-size="14" font-weight="700">0%</text>
			<rect x="68" y="54" width="8" height="210" rx="4" fill="#101215"/>
			<rect x="54" y="254" width="36" height="16" rx="4" fill="#3a3f47"/>
			<rect x="16" y="294" width="112" height="34" rx="6" fill="#181b1f" stroke="#30343b"/>
			<text x="72" y="316" text-anchor="middle" fill="#cfc9bf" font-family="Arial, sans-serif" font-size="13" font-weight="600">Mute</text>
		</g>

		<!-- Soft noise -->
		<g transform="translate(474, 0)">
			<rect x="0" y="0" width="144" height="346" rx="10" fill="#212428" stroke="#30343b"/>
			<text x="16" y="28" fill="#f2ede4" font-family="Arial, sans-serif" font-size="15" font-weight="600">Soft noise</text>
			<text x="128" y="28" text-anchor="end" fill="#f2a359" font-family="monospace" font-size="14" font-weight="700">10%</text>
			<rect x="68" y="54" width="8" height="175" rx="4" fill="#101215"/>
			<rect x="68" y="210" width="8" height="19" rx="4" fill="#d46a2e"/>
			<rect x="54" y="203" width="36" height="16" rx="4" fill="#3a3f47" stroke="#f2a359" stroke-width="1.5"/>
			<rect x="16" y="246" width="54" height="28" rx="5" fill="#2c221d" stroke="#d46a2e"/>
			<text x="43" y="264" text-anchor="middle" fill="#f5b378" font-family="Arial, sans-serif" font-size="12" font-weight="700">Brown</text>
			<rect x="74" y="246" width="54" height="28" rx="5" fill="#181b1f" stroke="#30343b"/>
			<text x="101" y="264" text-anchor="middle" fill="#b8b3aa" font-family="Arial, sans-serif" font-size="12">Pink</text>
			<rect x="16" y="294" width="112" height="34" rx="6" fill="#181b1f" stroke="#30343b"/>
			<text x="72" y="316" text-anchor="middle" fill="#cfc9bf" font-family="Arial, sans-serif" font-size="13" font-weight="600">Mute</text>
		</g>

		<!-- Binaural tones -->
		<g transform="translate(632, 0)">
			<rect x="0" y="0" width="154" height="346" rx="10" fill="#212428" stroke="#30343b"/>
			<text x="16" y="28" fill="#f2ede4" font-family="Arial, sans-serif" font-size="15" font-weight="600">Binaural tones</text>
			<text x="138" y="28" text-anchor="end" fill="#8b877f" font-family="monospace" font-size="14" font-weight="700">Off</text>
			<rect x="73" y="54" width="8" height="175" rx="4" fill="#101215"/>
			<rect x="59" y="220" width="36" height="16" rx="4" fill="#3a3f47"/>
			<text x="77" y="265" text-anchor="middle" fill="#f2a359" font-family="monospace" font-size="12">Alpha · 10 Hz</text>
			<rect x="16" y="294" width="122" height="34" rx="6" fill="#181b1f" stroke="#30343b"/>
			<text x="77" y="316" text-anchor="middle" fill="#cfc9bf" font-family="Arial, sans-serif" font-size="13" font-weight="600">Mute</text>
		</g>

		<!-- Master & Sleep Timer -->
		<g transform="translate(804, 0)">
			<rect x="0" y="0" width="276" height="346" rx="10" fill="#1f2226" stroke="#30343b"/>
			<text x="138" y="30" text-anchor="middle" fill="#f2ede4" font-family="Arial, sans-serif" font-size="15" font-weight="600">Master volume</text>
			<circle cx="138" cy="112" r="56" fill="#121417" stroke="#2c3036" stroke-width="2"/>
			<circle cx="138" cy="112" r="42" fill="#272b31" stroke="#3e434c" stroke-width="1.5"/>
			<line x1="138" y1="112" x2="162" y2="82" stroke="#f2a359" stroke-width="4" stroke-linecap="round"/>
			<text x="138" y="186" text-anchor="middle" fill="#f2a359" font-family="monospace" font-size="16" font-weight="700">65%</text>
			<rect x="20" y="204" width="144" height="44" rx="8" fill="#d46a2e"/>
			<text x="92" y="231" text-anchor="middle" fill="#14100d" font-family="Arial, sans-serif" font-size="16" font-weight="700">Stop</text>
			<rect x="174" y="204" width="82" height="44" rx="8" fill="#171a1e" stroke="#32373f"/>
			<text x="215" y="231" text-anchor="middle" fill="#d7d1c7" font-family="Arial, sans-serif" font-size="13" font-weight="600">Mute</text>
			<text x="20" y="278" fill="#e6e0d6" font-family="Arial, sans-serif" font-size="13" font-weight="600">Sleep timer</text>
			<text x="256" y="278" text-anchor="end" fill="#8f8a81" font-family="monospace" font-size="11">10 s fade</text>
			<rect x="20" y="290" width="54" height="36" rx="6" fill="#16191d" stroke="#2e333a"/>
			<text x="47" y="313" text-anchor="middle" fill="#c7c1b7" font-family="monospace" font-size="12">Off</text>
			<rect x="80" y="290" width="54" height="36" rx="6" fill="#16191d" stroke="#2e333a"/>
			<text x="107" y="313" text-anchor="middle" fill="#c7c1b7" font-family="monospace" font-size="12">15m</text>
			<rect x="140" y="290" width="54" height="36" rx="6" fill="#2c211b" stroke="#d46a2e"/>
			<text x="167" y="313" text-anchor="middle" fill="#f7b77e" font-family="monospace" font-size="12" font-weight="700">30m</text>
			<rect x="200" y="290" width="56" height="36" rx="6" fill="#16191d" stroke="#2e333a"/>
			<text x="228" y="313" text-anchor="middle" fill="#c7c1b7" font-family="monospace" font-size="12">60m</text>
		</g>
	</g>
</svg>`;

await sharp(Buffer.from(svg))
	.resize(1200, 630)
	.png({ compressionLevel: 9, palette: true, quality: 90 })
	.toFile(outFile);

console.log(`Generated initial social.png: ${outFile}`);
