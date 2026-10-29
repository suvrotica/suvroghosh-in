import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const branches = [
	{
		x: 210,
		y: 225,
		color: '#a76750',
		title: 'Begin with curiosity',
		detail: 'Ask a useful question · Set the boundary'
	},
	{
		x: 210,
		y: 360,
		color: '#69816a',
		title: 'Stay close to evidence',
		detail: 'Read in context · Keep the source'
	},
	{
		x: 210,
		y: 495,
		color: '#b08b3c',
		title: 'Build an explanation',
		detail: 'Name the mechanism · Show assumptions'
	},
	{
		x: 990,
		y: 225,
		color: '#63869b',
		title: 'Test the argument',
		detail: 'Look for objections · Compare accounts'
	},
	{
		x: 990,
		y: 360,
		color: '#92718c',
		title: 'Make understanding useful',
		detail: 'Connect ideas · Teach what you know'
	},
	{
		x: 990,
		y: 495,
		color: '#6d8c83',
		title: 'Leave room to revise',
		detail: 'Mark uncertainty · Ask the next question'
	}
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#d4d8c9"/></pattern></defs>
<rect width="1200" height="630" fill="#f7f3e9"/><rect width="1200" height="630" fill="url(#dots)"/>
<rect width="1200" height="145" fill="#f7f3e9"/><path d="M40 145H1160" stroke="#d7dbcd"/>
<text x="48" y="40" font-family="monospace" font-size="12" letter-spacing="3" fill="#697164">SUVROGHOSH.IN / A FIELD GUIDE TO YOUR IDEAS</text>
<text x="46" y="104" font-family="Georgia,serif" font-size="54" fill="#292d27">Mindmap <tspan font-style="italic" fill="#365849">Studio.</tspan></text>
<text x="1152" y="82" text-anchor="end" font-family="Georgia,serif" font-size="21" font-style="italic" fill="#697164">Read deeply. See the connections.</text>
${branches
	.map((b) => {
		const left = b.x < 600;
		const edge = left ? b.x + 130 : b.x - 130;
		return `<path d="M${left ? 488 : 712} 360 C${left ? 430 : 770} 360 ${left ? 430 : 770} ${b.y} ${edge} ${b.y}" fill="none" stroke="${b.color}" stroke-width="3"/><rect x="${b.x - 145}" y="${b.y - 27}" width="290" height="54" rx="9" fill="#fffdf7" stroke="${b.color}"/><text x="${b.x}" y="${b.y + 6}" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" fill="#292d27">${b.title}</text><text x="${b.x}" y="${b.y + 49}" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#697164">${b.detail}</text>`;
	})
	.join('')}
<rect x="475" y="314" width="250" height="92" rx="16" fill="#365849"/><text x="600" y="351" text-anchor="middle" font-family="Georgia,serif" font-size="25" fill="#fffdf7">How ideas become</text><text x="600" y="383" text-anchor="middle" font-family="Georgia,serif" font-size="27" fill="#fffdf7">knowledge</text>
<path d="M345 217C630 153 730 157 850 217" fill="none" stroke="#92718c" stroke-dasharray="4 5" opacity=".45"/>
<text x="48" y="601" font-family="monospace" font-size="12" fill="#697164">SOURCES → IDEAS → EVIDENCE → CONNECTIONS</text><text x="1152" y="601" text-anchor="end" font-family="Arial,sans-serif" font-size="12" fill="#697164">Mind maps · Knowledge graphs · Your working copy</text></svg>`;
const directory = new URL('../static/images/visualizations/mindmap-studio/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('social.svg', directory), svg);
await sharp(Buffer.from(svg))
	.png({ compressionLevel: 9 })
	.toFile(new URL('social.png', directory).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
console.log('Rendered Mindmap Studio social image (1200×630).');
