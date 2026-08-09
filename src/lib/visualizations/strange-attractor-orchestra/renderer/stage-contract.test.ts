import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const stage = fs.readFileSync(
	path.join(
		process.cwd(),
		'src',
		'lib',
		'components',
		'visualizations',
		'strange-attractor-orchestra',
		'AttractorStage.svelte'
	),
	'utf8'
);

describe('orchestra stage-to-renderer contract', () => {
	it('feeds the renderer the feature stream projected into [0, 1]', () => {
		expect(stage).toMatch(/rawPositions:\s*currentData\.features\.position01/u);
		expect(stage).toMatch(/warpedPositions:\s*currentData\.features\.warpedPosition01/u);
		expect(stage).toMatch(/pointCount:\s*currentData\.features\.pointCount/u);
		expect(stage).toMatch(/curlAngle01:\s*currentData\.features\.noiseCurlAngle01/u);
		expect(stage).not.toMatch(/rawPositions:\s*currentData\.trajectory\.normalizedPositions/u);
		expect(stage).not.toMatch(/warpedPositions:\s*currentData\.weather\.warpedPositions/u);
	});

	it('keeps stable packet fills and parent reporting out of the animation-frame body', () => {
		const frameBody = stage.match(
			/function render\(now = performance\.now\(\)\): void \{[\s\S]*?\n\t\}\n\n\tfunction requestRender/u
		)?.[0];
		expect(frameBody).toBeTruthy();
		expect(frameBody).not.toMatch(/fillPacket\s*\(/u);
		expect(frameBody).not.toContain('sourcePacket');
		expect(frameBody).not.toContain('onrenderer(');
		expect(stage).toMatch(/function fillStablePacket/u);
		expect(stage).toMatch(/now - lastRendererReportAt >= 800/u);
		expect(frameBody).toMatch(/packet\.simulationTime = currentVisualSimulationTime\(\)/u);
	});

	it('uses raw Svelte state for the renderer and supplies a visible zero-playhead preview', () => {
		expect(stage).toMatch(/renderer = \$state\.raw<OrchestraRenderer \| null>\(null\)/u);
		expect(stage).toMatch(/requestedTrailHead <= 0[\s\S]*?\? 1/u);
		expect(stage).toMatch(/Math\.max\(0\.18, requestedTrailHead\)/u);
	});

	it('maps bounded horizontal conducting to visual weather phase and eases release to baseline', () => {
		expect(stage).toMatch(/const CONDUCT_WEATHER_PHASE_SPAN = 4/u);
		expect(stage).toMatch(
			/function currentVisualSimulationTime\(\)[\s\S]*?conductX[\s\S]*?CONDUCT_WEATHER_PHASE_SPAN[\s\S]*?currentSimulationTime\(\) \+ phaseOffset/u
		);
		expect(stage).toMatch(/const CONDUCT_RELEASE_MS = 280/u);
		expect(stage).toMatch(
			/function advanceConductRelease[\s\S]*?\(1 - progress\) \*\* 3[\s\S]*?conductReleaseFromX \* remaining/u
		);
		expect(stage).toMatch(
			/function releaseConductingHome[\s\S]*?onconduct\(0, 0, false\)[\s\S]*?requestAnimationFrame\(advanceConductRelease\)/u
		);
		expect(stage).not.toMatch(/rawPositions\[[^\]]+\]\s*=/u);
		expect(stage).not.toMatch(/warpedPositions\[[^\]]+\]\s*=/u);
	});
});
