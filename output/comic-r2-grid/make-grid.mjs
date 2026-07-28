import path from 'node:path';
import sharp from 'sharp';

const outputDirectory = process.argv[2];
const files = JSON.parse(process.argv[3]);

for (const [id, filename] of files) {
	const metadata = await sharp(filename).metadata();
	let grid = '';
	let labels = '';
	for (let index = 1; index < 10; index += 1) {
		const x = Math.round((metadata.width * index) / 10);
		const y = Math.round((metadata.height * index) / 10);
		grid += `<line x1="${x}" y1="0" x2="${x}" y2="${metadata.height}"/>`;
		grid += `<line x1="0" y1="${y}" x2="${metadata.width}" y2="${y}"/>`;
		labels += `<text x="${x + 5}" y="25">.${index}</text>`;
		labels += `<text x="5" y="${y - 5}">.${index}</text>`;
	}
	const overlay = `<svg width="${metadata.width}" height="${metadata.height}" xmlns="http://www.w3.org/2000/svg">
		<g stroke="#00ffff" stroke-width="3" opacity=".8">${grid}</g>
		<g fill="#00ffff" font-family="Arial" font-size="24" font-weight="bold">${labels}</g>
	</svg>`;
	await sharp(filename)
		.composite([{ input: Buffer.from(overlay) }])
		.png()
		.toFile(path.join(outputDirectory, `${id}-grid.png`));
}
