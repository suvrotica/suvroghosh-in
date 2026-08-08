import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const workspace = process.cwd();
const outputDirectory = path.join(
	workspace,
	'static',
	'images',
	'weather-inside-nucleus',
	'portrait'
);
const widths = [360, 390, 412, 540, 824, 1080];

const svg = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <defs>
    <radialGradient id="bg" cx="56%" cy="32%" r="82%">
      <stop offset="0" stop-color="#1c1d3d"/>
      <stop offset=".52" stop-color="#090b1c"/>
      <stop offset="1" stop-color="#03050d"/>
    </radialGradient>
    <radialGradient id="nucleus" cx="44%" cy="33%" r="70%">
      <stop offset="0" stop-color="#595382" stop-opacity=".36"/>
      <stop offset=".72" stop-color="#17172f" stop-opacity=".82"/>
      <stop offset="1" stop-color="#080914" stop-opacity=".96"/>
    </radialGradient>
    <linearGradient id="membrane" x1="0" x2="1">
      <stop offset="0" stop-color="#66758d" stop-opacity=".08"/>
      <stop offset=".5" stop-color="#d2dbe5" stop-opacity=".78"/>
      <stop offset="1" stop-color="#77849a" stop-opacity=".08"/>
    </linearGradient>
    <radialGradient id="activity">
      <stop offset="0" stop-color="#ffd58a" stop-opacity=".82"/>
      <stop offset=".34" stop-color="#eaa85a" stop-opacity=".24"/>
      <stop offset="1" stop-color="#eaa85a" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="13" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="soft" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="34"/>
    </filter>
    <pattern id="chromatin" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="5" cy="7" r="1.5" fill="#d1cbed" fill-opacity=".16"/>
      <circle cx="17" cy="18" r="1" fill="#a9a2d0" fill-opacity=".1"/>
    </pattern>
    <pattern id="off" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="4" height="12" fill="#ffd166" fill-opacity=".22"/>
    </pattern>
  </defs>

  <rect width="1080" height="1440" fill="url(#bg)"/>

  <!-- Boundary: EGF remains outside the curved membrane. -->
  <path d="M-50 0 H360 C478 142 503 312 443 486 C418 559 379 622 328 690 H-50 Z" fill="#122036" fill-opacity=".36"/>
  <path d="M346 -38 C485 137 505 313 440 492 C415 563 375 628 321 700" fill="none" stroke="url(#membrane)" stroke-width="24"/>
  <path d="M371 -43 C507 139 526 317 462 499 C436 570 396 635 345 709" fill="none" stroke="#77869e" stroke-opacity=".34" stroke-width="6"/>
  <g transform="translate(326 278)" filter="url(#glow)">
    <path d="M-42 -9 L-19 -42 L24 -36 L45 -2 L24 38 L-20 43 L-48 14 Z" fill="#d9f8ff" stroke="#8deafa" stroke-width="6"/>
    <circle r="57" fill="none" stroke="#8deafa" stroke-opacity=".26" stroke-width="4"/>
  </g>
  <g filter="url(#glow)">
    <path d="M388 291 C407 250 435 231 468 225 M390 293 C419 327 439 343 468 354" fill="none" stroke="#f6ca78" stroke-width="18" stroke-linecap="round"/>
    <path d="M470 228 C498 270 505 313 493 359 M470 353 C504 386 518 422 508 462" fill="none" stroke="#efb75e" stroke-width="18" stroke-linecap="round"/>
    <path d="M382 286 L352 257 M397 277 L399 237" stroke="#ffe2a0" stroke-width="10" stroke-linecap="round"/>
    <circle cx="510" cy="432" r="11" fill="#ffe3a1"/>
    <circle cx="516" cy="460" r="9" fill="#ffe3a1" fill-opacity=".78"/>
  </g>
  <text x="72" y="90" fill="#c8d0dd" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">OUTSIDE THE CELL</text>
  <text x="576" y="90" fill="#c8d0dd" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">CELL INTERIOR</text>
  <text x="103" y="363" fill="#d9f8ff" font-family="Arial, sans-serif" font-size="25" font-weight="700">outside signal · EGF</text>
  <text x="540" y="276" fill="#ffe0a0" font-family="Arial, sans-serif" font-size="25" font-weight="700">surface receptor · EGFR</text>

  <!-- Separate local response regions; no arrow or traveling object. -->
  <g>
    <ellipse cx="610" cy="450" rx="155" ry="115" fill="url(#activity)" filter="url(#soft)"/>
    <path d="M555 424 C588 394 636 398 661 435 C682 466 666 503 631 518 C588 535 541 503 537 463 C535 447 542 433 555 424 Z" fill="#c48842" fill-opacity=".15" stroke="#ffd58a" stroke-opacity=".52" stroke-width="4"/>
    <ellipse cx="770" cy="535" rx="130" ry="98" fill="url(#activity)" opacity=".48"/>
    <path d="M728 517 C755 496 794 504 811 531 C824 555 811 581 783 589 C750 597 716 575 713 546 C711 533 717 523 728 517 Z" fill="#c48842" fill-opacity=".11" stroke="#ffd58a" stroke-opacity=".36" stroke-width="3"/>
  </g>
  <text x="548" y="625" fill="#d6c5a1" font-family="Arial, sans-serif" font-size="22" font-weight="600">local activity changes · many steps omitted</text>

  <!-- Atmospheric nucleus. -->
  <ellipse cx="710" cy="806" rx="362" ry="316" fill="url(#nucleus)" stroke="#a9a5d1" stroke-opacity=".58" stroke-width="5"/>
  <ellipse cx="710" cy="806" rx="342" ry="296" fill="none" stroke="#77739f" stroke-opacity=".3" stroke-width="3" stroke-dasharray="3 16"/>
  <path d="M456 760 C510 635 654 619 751 688 C830 745 806 844 706 858 C608 871 525 817 456 760 Z" fill="#8781ac" fill-opacity=".08" stroke="#aaa4ce" stroke-opacity=".18" stroke-width="3"/>
  <path d="M650 625 C810 573 957 674 958 817 C959 924 863 959 762 913 C676 874 622 760 650 625 Z" fill="url(#chromatin)" stroke="#817ba7" stroke-opacity=".2" stroke-width="3"/>
  <text x="575" y="718" fill="#d8d4ed" font-family="Arial, sans-serif" font-size="24" font-weight="700">nuclear activity proxy</text>

  <!-- Editorial scale cut and enlarged synthetic locus. -->
  <rect x="82" y="984" width="916" height="72" rx="36" fill="#050711" fill-opacity=".88" stroke="#c8c5df" stroke-opacity=".34"/>
  <text x="540" y="1017" text-anchor="middle" fill="#f7f5ff" font-family="Arial, sans-serif" font-size="25" font-weight="800" letter-spacing="4">CELL → NUCLEUS → LOCUS</text>
  <text x="540" y="1043" text-anchor="middle" fill="#aaa7bc" font-family="Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="2">MODEL VIEW CUT · NOT A CONTINUOUS ZOOM</text>

  <g transform="translate(0 72)">
    <path d="M106 1110 C214 1046 319 1151 412 1088 C500 1028 602 1135 694 1074 C786 1013 884 1099 985 1048" fill="none" stroke="#bbb6cf" stroke-opacity=".62" stroke-width="17" stroke-linecap="round"/>
    <path d="M106 1110 C214 1046 319 1151 412 1088 C500 1028 602 1135 694 1074 C786 1013 884 1099 985 1048" fill="none" stroke="#26263d" stroke-opacity=".88" stroke-width="4" stroke-dasharray="5 18"/>
    <g filter="url(#glow)">
      <path d="M354 1088 L304 1166 L404 1166 Z" fill="#68e1ee" stroke="#d9fbff" stroke-width="5"/>
      <path d="M354 1108 L333 1142 L375 1142 Z" fill="#14343b"/>
    </g>
    <g filter="url(#glow)">
      <rect x="650" y="1064" width="96" height="96" rx="22" fill="url(#off)" stroke="#ffba6a" stroke-width="12"/>
      <circle cx="698" cy="1112" r="14" fill="#080914" stroke="#ffe1a0" stroke-width="4"/>
    </g>
    <path d="M410 1136 Q528 1059 641 1103" fill="none" stroke="#88eef5" stroke-opacity=".28" stroke-width="32" stroke-linecap="round"/>
    <path d="M410 1136 Q528 1059 641 1103" fill="none" stroke="#c9c4e6" stroke-opacity=".55" stroke-width="5" stroke-dasharray="5 18" stroke-linecap="round"/>
    <text x="286" y="1212" fill="#9bf3f7" font-family="Arial, sans-serif" font-size="21" font-weight="700">enhancer</text>
    <text x="642" y="1212" fill="#ffd38a" font-family="Arial, sans-serif" font-size="21" font-weight="700">promoter · model OFF</text>
  </g>

  <!-- Countable field: silent marks and burst marks coexist. -->
  <g transform="translate(85 1314)">
    ${Array.from({ length: 48 }, (_, index) => {
			const column = index % 8;
			const row = Math.floor(index / 8);
			const x = column * 112;
			const y = row * 16;
			const burst = (index * 17 + 5) % 11 < 7;
			return burst
				? `<path d="M${x} ${y} h22 l7 -7 l8 11 l8 -4 h35" fill="none" stroke="#fff1cf" stroke-width="3" stroke-linecap="round"/>`
				: `<path d="M${x} ${y} h80" stroke="#6f7184" stroke-width="3" stroke-linecap="round"/><path d="M${x + 35} ${y - 5} l10 10 M${x + 45} ${y - 5} l-10 10" stroke="#a3a5b5" stroke-width="2"/>`;
		}).join('')}
  </g>
</svg>`;

await mkdir(outputDirectory, { recursive: true });

for (const width of widths) {
	const height = Math.round((width * 4) / 3);
	const input = sharp(Buffer.from(svg)).resize(width, height, { fit: 'fill' });
	await Promise.all([
		input
			.clone()
			.avif({ quality: 72, effort: 7, chromaSubsampling: '4:4:4' })
			.toFile(path.join(outputDirectory, `weather-nucleus-${width}.avif`)),
		input
			.clone()
			.webp({ quality: 84, effort: 6, smartSubsample: true })
			.toFile(path.join(outputDirectory, `weather-nucleus-${width}.webp`))
	]);
}

for (const width of widths) {
	const avif = await stat(path.join(outputDirectory, `weather-nucleus-${width}.avif`));
	const webp = await stat(path.join(outputDirectory, `weather-nucleus-${width}.webp`));
	console.log(
		`${width}px: AVIF ${(avif.size / 1024).toFixed(1)} kB · WebP ${(webp.size / 1024).toFixed(1)} kB`
	);
}
