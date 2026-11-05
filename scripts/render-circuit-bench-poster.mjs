import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import sharp from 'sharp';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
	const { getExampleCircuit } = await server.ssrLoadModule(
		'/src/lib/visualizations/circuit-bench/examples.ts'
	);
	const { evaluateCircuitAtInstant, runSimulationBatch } = await server.ssrLoadModule(
		'/src/lib/visualizations/circuit-bench/solver.ts'
	);

	const doc = getExampleCircuit('rc-charging');
	const init = evaluateCircuitAtInstant(doc, 0);
	if (!init.ok) throw new Error('Failed to evaluate default RC example');

	let snap = init.snapshot;
	const samples = [{ timeSec: 0, ch1: 0, ch2: 0.005 }];
	for (let i = 0; i < 5; i += 1) {
		const b = runSimulationBatch(doc, snap, 500, snap.timeSec);
		if (!b.ok) throw new Error('Batch failed');
		snap = b.snapshot;
		samples.push(...b.samples);
	}

	const plotLeft = 650;
	const plotWidth = 480;
	const ch1Points = samples
		.filter((_, idx) => idx % 4 === 0)
		.map((s) => {
			const x = plotLeft + (s.timeSec / 5) * plotWidth;
			const y = 355 - (s.ch1 / 5.2) * 105;
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(' ');

	const ch2Points = samples
		.filter((_, idx) => idx % 4 === 0)
		.map((s) => {
			const x = plotLeft + (s.timeSec / 5) * plotWidth;
			const y = 505 - (s.ch2 / 0.0055) * 105;
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(' ');

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
	<rect width="1200" height="630" fill="#101214"/>
	<!-- Main Charcoal Enclosure -->
	<rect x="28" y="24" width="1144" height="582" rx="12" fill="#1B1E21" stroke="#3D434A" stroke-width="2"/>
	<!-- Top Instrument Header Bar -->
	<rect x="46" y="42" width="1108" height="56" rx="6" fill="#14171A" stroke="#2F353B"/>
	<rect x="64" y="57" width="12" height="26" rx="2" fill="#EF762F"/>
	<text x="88" y="76" fill="#F1EEE7" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="1.5">CIRCUIT BENCH</text>
	<text x="290" y="75" fill="#B8BFC5" font-family="Arial, sans-serif" font-size="14">How long does a capacitor take to charge?</text>
	<!-- Orange Run Button -->
	<rect x="920" y="51" width="96" height="38" rx="5" fill="#EF762F"/>
	<text x="968" y="75" text-anchor="middle" fill="#101214" font-family="Arial, sans-serif" font-size="15" font-weight="700">Run</text>
	<!-- Status Readout -->
	<rect x="1028" y="51" width="110" height="38" rx="5" fill="#0B0F12" stroke="#2D333A"/>
	<text x="1083" y="75" text-anchor="middle" fill="#9EC985" font-family="monospace" font-size="13" font-weight="700">τ = 1.00 s</text>

	<!-- Left Recessed Schematic Display -->
	<rect x="46" y="114" width="564" height="472" rx="6" fill="#0B0F12" stroke="#2C3238"/>
	<text x="68" y="146" fill="#B8BFC5" font-family="monospace" font-size="13">SCHEMATIC WORKSPACE · 5 V RC CHARGING LOOP</text>

	<!-- Schematic Loop -->
	<path d="M 150 280 L 150 210 L 260 210" fill="none" stroke="#EF762F" stroke-width="3.5"/>
	<path d="M 350 210 L 470 210 L 470 285" fill="none" stroke="#E59A54" stroke-width="3.5"/>
	<path d="M 470 325 L 470 430 L 150 430 L 150 340" fill="none" stroke="#9EC985" stroke-width="3.5"/>
	<line x1="310" y1="430" x2="310" y2="470" stroke="#9EC985" stroke-width="3.5"/>
	<circle cx="310" cy="430" r="5.5" fill="#9EC985"/>

	<!-- V1 5V Source -->
	<circle cx="150" cy="310" r="28" fill="#161A1E" stroke="#F1EEE7" stroke-width="2.5"/>
	<text x="150" y="303" text-anchor="middle" fill="#EF762F" font-family="monospace" font-size="16" font-weight="700">+</text>
	<text x="150" y="326" text-anchor="middle" fill="#5BA4CF" font-family="monospace" font-size="16" font-weight="700">−</text>
	<text x="95" y="315" text-anchor="end" fill="#F1EEE7" font-family="monospace" font-size="15" font-weight="700">V1 · 5 V</text>

	<!-- R1 1k Resistor -->
	<polyline points="260,210 270,196 285,224 300,196 315,224 330,196 340,224 350,210" fill="none" stroke="#F1EEE7" stroke-width="3" stroke-linejoin="round"/>
	<text x="305" y="178" text-anchor="middle" fill="#F1EEE7" font-family="monospace" font-size="15" font-weight="700">R1 · 1 kΩ</text>
	<text x="305" y="246" text-anchor="middle" fill="#B8BFC5" font-family="monospace" font-size="13">1.84 V · 1.84 mA</text>

	<!-- C1 1,000 uF Capacitor -->
	<line x1="448" y1="292" x2="492" y2="292" stroke="#F1EEE7" stroke-width="4"/>
	<line x1="448" y1="312" x2="492" y2="312" stroke="#F1EEE7" stroke-width="4"/>
	<text x="506" y="300" fill="#F1EEE7" font-family="monospace" font-size="15" font-weight="700">C1 · 1,000 µF</text>
	<text x="506" y="322" fill="#EF762F" font-family="monospace" font-size="13">3.16 V @ 1.00 s</text>

	<!-- Ground -->
	<line x1="290" y1="470" x2="330" y2="470" stroke="#9EC985" stroke-width="3"/>
	<line x1="297" y1="478" x2="323" y2="478" stroke="#9EC985" stroke-width="2.5"/>
	<line x1="304" y1="486" x2="316" y2="486" stroke="#9EC985" stroke-width="2"/>
	<text x="310" y="510" text-anchor="middle" fill="#9EC985" font-family="monospace" font-size="13" font-weight="700">GND (0 V)</text>

	<!-- Checkpoints Footer in Schematic -->
	<rect x="68" y="532" width="520" height="36" rx="4" fill="#14181D" stroke="#283038"/>
	<text x="84" y="555" fill="#F1EEE7" font-family="monospace" font-size="12.5">t = 0 s: 0 V, 5 mA   |   t = 1 s: 3.16 V, 1.84 mA   |   t = 5 s: 4.97 V</text>

	<!-- Right Inspector + Oscilloscope Windows -->
	<rect x="626" y="114" width="528" height="106" rx="6" fill="#0B0F12" stroke="#2C3238"/>
	<text x="648" y="142" fill="#B8BFC5" font-family="monospace" font-size="12">INSPECTOR · R1 (1 kΩ) AT t = 1.00 s</text>
	<text x="648" y="174" fill="#F1EEE7" font-family="monospace" font-size="16" font-weight="700">V(R1): 1.84 V   ·   I(R1): 1.84 mA   ·   P: 3.38 mW</text>
	<text x="648" y="200" fill="#EF762F" font-family="Arial, sans-serif" font-size="13">Doubling R1 to 2 kΩ doubles charging time (τ = 2 s) and halves initial current (2.5 mA).</text>

	<!-- Two-Channel Scope Window -->
	<rect x="626" y="232" width="528" height="354" rx="6" fill="#0B0F12" stroke="#2C3238"/>
	<rect x="650" y="250" width="480" height="105" fill="#070A0D" stroke="#222930"/>
	<rect x="650" y="400" width="480" height="105" fill="#070A0D" stroke="#222930"/>
	<text x="660" y="268" fill="#EF762F" font-family="monospace" font-size="12" font-weight="700">CH1 · Capacitor voltage V(C1) (0 V → 4.97 V)</text>
	<text x="660" y="418" fill="#9EC985" font-family="monospace" font-size="12" font-weight="700">CH2 · Resistor current I(R1) (5.00 mA → 0.03 mA)</text>

	<polyline points="${ch1Points}" fill="none" stroke="#EF762F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
	<polyline points="${ch2Points}" fill="none" stroke="#9EC985" stroke-width="3" stroke-dasharray="7 4" stroke-linecap="round" stroke-linejoin="round"/>

	<!-- 1s Time Constant Marker Line -->
	<line x1="746" y1="250" x2="746" y2="505" stroke="#F1EEE7" stroke-width="1.5" stroke-dasharray="3 3"/>
	<circle cx="746" cy="291" r="5" fill="#EF762F" stroke="#0B0F12" stroke-width="1.5"/>
	<circle cx="746" cy="470" r="5" fill="#9EC985" stroke="#0B0F12" stroke-width="1.5"/>
	<text x="754" y="294" fill="#F1EEE7" font-family="monospace" font-size="12">t = 1 s (3.16 V)</text>
	<text x="754" y="474" fill="#F1EEE7" font-family="monospace" font-size="12">1.84 mA</text>

	<text x="650" y="532" fill="#B8BFC5" font-family="monospace" font-size="12">0.0 s</text>
	<text x="890" y="532" text-anchor="middle" fill="#B8BFC5" font-family="monospace" font-size="12">2.5 s</text>
	<text x="1130" y="532" text-anchor="end" fill="#B8BFC5" font-family="monospace" font-size="12">5.0 s</text>
	<text x="650" y="564" fill="#B8BFC5" font-family="Arial, sans-serif" font-size="12">SUVROGHOSH.IN · VIZ / APPS · MODIFIED NODAL ANALYSIS &amp; TRANSIENT SCOPE</text>
</svg>`;

	const dir = fileURLToPath(
		new URL('../static/images/visualizations/circuit-bench/', import.meta.url)
	);
	const output = fileURLToPath(
		new URL('../static/images/visualizations/circuit-bench/social.png', import.meta.url)
	);
	await mkdir(dir, { recursive: true });
	await sharp(Buffer.from(svg)).png().toFile(output);
	process.stdout.write(`Circuit Bench social poster written: ${output}\n`);
} finally {
	await server.close();
}
