import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const labels = ['Music', 'Films', 'Audiobooks', 'Documentaries', 'Maths', 'Talks'];
const colours = ['#e1eadd', '#ebdfcf', '#dbe5e6', '#e4e2d5', '#e1e7d2', '#e8dfd8'];
const cards = labels
	.map((label, i) => {
		const x = 64 + (i % 3) * 364;
		const y = 230 + Math.floor(i / 3) * 174;
		return `<g transform="translate(${x},${y})"><rect width="340" height="116" rx="12" fill="${colours[i]}"/><rect x="145" y="37" width="50" height="36" rx="9" fill="#246448"/><path d="M166 46 L181 55 L166 64 Z" fill="white"/><text x="0" y="146" font-size="20" font-weight="600" fill="#242920">${label}</text></g>`;
	})
	.join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#f8f7f2"/><g font-family="Arial, sans-serif"><text x="64" y="63" fill="#246448" font-size="14" font-weight="700" letter-spacing="3">SUVRO GHOSH · FROM MY POSTS</text><text x="60" y="135" font-size="62" font-weight="700" fill="#242920">Videos I Like</text><text x="64" y="179" font-size="22" fill="#62675c">Pick a topic. Find something to watch.</text>${cards}<text x="64" y="604" font-size="14" fill="#62675c">VIDEOS · PLAYLISTS · YOUTUBE</text><text x="1136" y="604" text-anchor="end" font-size="14" fill="#246448">suvroghosh.in</text></g></svg>`;
await mkdir('static/images/visualizations/videos-i-like', { recursive: true });
await sharp(Buffer.from(svg)).png().toFile('static/images/visualizations/videos-i-like/social.png');
console.log('Rendered Videos I Like social card (1200 × 630).');
