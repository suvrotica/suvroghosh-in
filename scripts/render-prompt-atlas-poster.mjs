import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import sharp from 'sharp';

// The preview uses the real analysis and SVG projection, with a publication-sized editor frame.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
	const { analyzePrompt } = await server.ssrLoadModule(
		'/src/lib/visualizations/prompt-atlas/analysis.ts'
	);
	const { countText } = await server.ssrLoadModule(
		'/src/lib/visualizations/prompt-atlas/statistics.ts'
	);
	const { projectOntology } = await server.ssrLoadModule(
		'/src/lib/visualizations/prompt-atlas/projection.ts'
	);
	const { exportDiagramSvg } = await server.ssrLoadModule(
		'/src/lib/visualizations/prompt-atlas/export.ts'
	);
	const text = 'Write a kind story about a robot gardener. Keep it under 100 words.';
	const diagram = projectOntology(analyzePrompt(text), 'mindmap');
	const drawing = exportDiagramSvg(diagram)
		.replace(/<text x="26"[^>]*>[^<]*<\/text>/g, '')
		.replace('translate(0 44)', 'translate(0 0)')
		.replace('<svg ', '<svg x="525" y="240" ')
		.replace(`width="${diagram.width}" height="${diagram.height + 76}"`, 'width="610" height="335"')
		.replace(
			`viewBox="0 0 ${diagram.width} ${diagram.height + 76}"`,
			`viewBox="0 0 ${diagram.width} ${diagram.height}"`
		);
	const image = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#f4f2ea"/><path d="M32 28H1168" stroke="#182e32" stroke-width="5"/>
<g fill="#182e32" font-family="Arial, sans-serif"><text x="55" y="65" font-size="12" letter-spacing="2">FIELD TOOLS / 001</text><text x="915" y="65" font-size="12">VIZ / APPS · LOCAL ANALYSIS</text>
<text x="55" y="145" font-size="67" letter-spacing="-3">Prompt <tspan font-family="Georgia, serif" font-style="italic" fill="#14635c">Atlas</tspan><tspan font-size="38" fill="#a54e32"> ↗</tspan></text><text x="57" y="178" font-size="19" fill="#4b6063">Put your words on the map.</text>
<rect x="55" y="215" width="425" height="350" fill="#fbfaf6" stroke="#bdc8c5"/><text x="77" y="248" font-size="15">01 / YOUR PROMPT</text>
<rect x="77" y="270" width="381" height="130" rx="3" fill="#fffefa" stroke="#8fa49f"/><text x="94" y="305" font-size="17"><tspan x="94">Write a kind story about a robot</tspan><tspan x="94" dy="28">gardener. Keep it under 100 words.</tspan></text>
<text x="80" y="447" font-size="35" font-family="monospace">${countText(text).characters}</text><text x="145" y="445" font-size="12" fill="#4b6063">Characters including spaces</text>
<rect x="77" y="472" width="381" height="48" rx="3" fill="#14635c"/><text x="96" y="502" font-size="16" fill="white">Analyze prompt</text><text x="419" y="503" font-size="22" fill="white">↗</text>
<text x="78" y="545" font-size="11" fill="#4b6063">Your prompt stays in this browser.</text>
<text x="550" y="225" font-size="15">02 / THE MAP</text>
</g>${drawing}<path d="M55 592H1145" stroke="#bdc8c5"/><text x="55" y="614" fill="#4b6063" font-family="Arial,sans-serif" font-size="11">ONE INTERPRETATION. MANY VIEWS.</text><text x="1004" y="614" fill="#4b6063" font-family="Arial,sans-serif" font-size="11">SUVROGHOSH.IN</text></svg>`;
	const output = fileURLToPath(
		new URL('../static/images/visualizations/prompt-atlas/social.png', import.meta.url)
	);
	await mkdir(
		fileURLToPath(new URL('../static/images/visualizations/prompt-atlas/', import.meta.url)),
		{ recursive: true }
	);
	await sharp(Buffer.from(image)).png().toFile(output);
	process.stdout.write(`Prompt Atlas poster: ${output}\n`);
} finally {
	await server.close();
}
