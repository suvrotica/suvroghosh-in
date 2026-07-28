import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const episodeDirectory = process.argv[2];
const outputDirectory = process.argv[3];
const panels = [
	{ id: 'p30-04', page: 30 },
	{ id: 'p56-02', page: 56 },
	{ id: 'p56-03', page: 56 },
	{ id: 'p56-04', page: 56 },
	{ id: 'p56-06', page: 56 },
	{ id: 'p57-01', page: 57 },
	{ id: 'p58-03', page: 58 },
	{ id: 'p59-05', page: 59 }
];

await fs.mkdir(outputDirectory, { recursive: true });
for (const panel of panels) {
	const pageName = `page-${String(panel.page).padStart(3, '0')}`;
	const svg = await fs.readFile(
		path.join(episodeDirectory, 'pages', 'working', `${pageName}.svg`),
		'utf8'
	);
	const expression = new RegExp(
		`<clipPath id="clip-${panel.id}"><rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"`
	);
	const match = expression.exec(svg);
	if (!match) throw new Error(`Missing placement for ${panel.id}`);
	const left = Math.floor(Number(match[1]));
	const top = Math.floor(Number(match[2]));
	const width = Math.ceil(Number(match[3]));
	const height = Math.ceil(Number(match[4]));
	const preview = path.join(episodeDirectory, 'pages', 'previews', `${pageName}.png`);
	await sharp(preview)
		.extract({ left, top, width, height })
		.resize({ width: width * 3, kernel: sharp.kernel.lanczos3 })
		.png()
		.toFile(path.join(outputDirectory, `${panel.id}__r2-final-crop-3x.png`));
}
