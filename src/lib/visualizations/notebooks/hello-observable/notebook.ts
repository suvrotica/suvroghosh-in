import type { Module, Runtime } from '@observablehq/runtime';
import type { ObservableNotebookDefinition } from '$lib/visualizations/observable';

type D3 = typeof import('d3');

type WaveControls = {
	amplitude: number;
	frequency: number;
	speed: number;
	samples: number;
	animate: boolean;
};

type WaveDatum = {
	x: number;
	y: number;
};

let chartId = 0;

function nextChartId(prefix: string) {
	chartId += 1;
	return `${prefix}-${chartId}`;
}

function svgFrame(d3: D3, height: number, title: string, description: string) {
	const width = 720;
	const titleId = nextChartId('wave-title');
	const descriptionId = nextChartId('wave-description');
	const svg = d3
		.create('svg')
		.attr('viewBox', `0 0 ${width} ${height}`)
		.attr('role', 'img')
		.attr('aria-labelledby', `${titleId} ${descriptionId}`)
		.style('background', 'var(--observable-surface)')
		.style('color', 'var(--observable-axis)');

	svg.append('title').attr('id', titleId).text(title);
	svg.append('desc').attr('id', descriptionId).text(description);
	return { svg, width };
}

function firstSvg(d3: D3) {
	const { svg, width } = svgFrame(
		d3,
		180,
		'An empty SVG coordinate space',
		'A responsive rectangular SVG frame with a faint border and centre guides.'
	);

	svg
		.append('rect')
		.attr('x', 1)
		.attr('y', 1)
		.attr('width', width - 2)
		.attr('height', 178)
		.attr('fill', 'none')
		.attr('stroke', 'var(--observable-grid)');
	svg
		.append('path')
		.attr('d', `M ${width / 2} 0 V 180 M 0 90 H ${width}`)
		.attr('stroke', 'var(--observable-grid)')
		.attr('stroke-dasharray', '5 7');

	return svg.node();
}

function firstMark(d3: D3) {
	const { svg, width } = svgFrame(
		d3,
		180,
		'One SVG circle',
		'A cyan circle marks the centre of a responsive SVG coordinate space.'
	);

	svg
		.append('circle')
		.attr('cx', width / 2)
		.attr('cy', 90)
		.attr('r', 24)
		.attr('fill', 'var(--observable-ink)');

	return svg.node();
}

function sampleWave(samples: number, frequency: number, amplitude: number, phase = 0) {
	return Array.from({ length: samples }, (_, index) => {
		const x = (index / (samples - 1)) * Math.PI * 2;
		return { x, y: Math.sin(x * frequency + phase) * amplitude };
	});
}

function dataMarks(d3: D3) {
	const { svg, width } = svgFrame(
		d3,
		220,
		'Data-driven wave marks',
		'Twenty-four orange circles form a sine wave because each datum becomes one SVG circle.'
	);
	const data = sampleWave(24, 1, 64);
	const x = d3.scaleLinear([0, Math.PI * 2], [36, width - 36]);
	const y = d3.scaleLinear([-80, 80], [190, 30]);

	svg
		.selectAll('circle')
		.data(data)
		.join('circle')
		.attr('cx', (datum) => x(datum.x))
		.attr('cy', (datum) => y(datum.y))
		.attr('r', 5)
		.attr('fill', 'var(--observable-point)');

	return svg.node();
}

function scaledWave(d3: D3) {
	const { svg, width } = svgFrame(
		d3,
		320,
		'A scaled and labelled sine wave',
		'D3 scales map mathematical x and y values into SVG pixels; an axis and line make the mapping visible.'
	);
	const margin = { top: 24, right: 24, bottom: 50, left: 58 };
	const data = sampleWave(80, 1, 1);
	const x = d3.scaleLinear([0, Math.PI * 2], [margin.left, width - margin.right]);
	const y = d3.scaleLinear([-1.2, 1.2], [320 - margin.bottom, margin.top]);
	const line = d3
		.line<WaveDatum>()
		.x((datum) => x(datum.x))
		.y((datum) => y(datum.y));

	svg
		.append('g')
		.attr('transform', `translate(0,${y(0)})`)
		.call(
			d3
				.axisBottom(x)
				.ticks(5)
				.tickFormat((value) => `${Number(value).toFixed(1)}`)
		)
		.call((axis) => axis.select('.domain').attr('stroke', 'var(--observable-axis)'))
		.call((axis) => axis.selectAll('line').attr('stroke', 'var(--observable-grid)'))
		.call((axis) => axis.selectAll('text').attr('fill', 'var(--observable-axis)'));
	svg
		.append('g')
		.attr('transform', `translate(${margin.left},0)`)
		.call(d3.axisLeft(y).ticks(5))
		.call((axis) => axis.select('.domain').attr('stroke', 'var(--observable-axis)'))
		.call((axis) => axis.selectAll('line').attr('stroke', 'var(--observable-grid)'))
		.call((axis) => axis.selectAll('text').attr('fill', 'var(--observable-axis)'));
	svg
		.append('path')
		.datum(data)
		.attr('fill', 'none')
		.attr('stroke', 'var(--observable-ink)')
		.attr('stroke-width', 4)
		.attr('stroke-linecap', 'round')
		.attr('d', line);
	svg
		.append('text')
		.attr('x', width - margin.right)
		.attr('y', 306)
		.attr('text-anchor', 'end')
		.attr('fill', 'var(--observable-axis)')
		.attr('font-size', 12)
		.text('angle (radians)');

	return svg.node();
}

function sliderControl(
	name: keyof Omit<WaveControls, 'animate'>,
	label: string,
	min: number,
	max: number,
	step: number,
	value: number,
	unit = ''
) {
	const wrapper = document.createElement('label');
	wrapper.className = 'observable-control';
	const row = document.createElement('span');
	row.className = 'observable-control-row';
	const labelText = document.createElement('span');
	labelText.textContent = label;
	const output = document.createElement('output');
	output.dataset.outputFor = name;
	output.textContent = `${value}${unit}`;
	const input = document.createElement('input');
	input.type = 'range';
	input.name = name;
	input.min = String(min);
	input.max = String(max);
	input.step = String(step);
	input.value = String(value);
	input.setAttribute('aria-label', label);
	input.dataset.unit = unit;
	row.append(labelText, output);
	wrapper.append(row, input);
	return wrapper;
}

function controlsForm(reducedMotion: boolean, invalidation: Promise<void>) {
	const form = document.createElement('form');
	form.className = 'observable-controls';
	form.setAttribute('aria-label', 'Wave generator controls');
	const preventSubmit = (event: SubmitEvent) => event.preventDefault();
	form.addEventListener('submit', preventSubmit);
	void invalidation.then(() => form.removeEventListener('submit', preventSubmit));
	form.append(
		sliderControl('amplitude', 'Amplitude', 10, 90, 1, 58, ' px'),
		sliderControl('frequency', 'Frequency', 1, 6, 0.25, 2, '×'),
		sliderControl('speed', 'Speed', 0.1, 2, 0.1, 0.7, '×'),
		sliderControl('samples', 'Sample points', 16, 96, 4, 48),
		Object.assign(document.createElement('label'), { className: 'observable-toggle' })
	);

	const toggle = form.lastElementChild as HTMLLabelElement;
	const checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.name = 'animate';
	checkbox.checked = !reducedMotion;
	const toggleText = document.createElement('span');
	toggleText.textContent = reducedMotion
		? 'Animate wave (off because reduced motion is preferred)'
		: 'Animate wave';
	toggle.append(checkbox, toggleText);
	return form;
}

function readControls(form: HTMLFormElement): WaveControls {
	const formData = new FormData(form);
	return {
		amplitude: Number(formData.get('amplitude')),
		frequency: Number(formData.get('frequency')),
		speed: Number(formData.get('speed')),
		samples: Number(formData.get('samples')),
		animate: formData.get('animate') === 'on'
	};
}

function updateControlOutputs(form: HTMLFormElement) {
	for (const input of form.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
		const output = form.querySelector<HTMLOutputElement>(`[data-output-for="${input.name}"]`);
		if (output) output.textContent = `${input.value}${input.dataset.unit ?? ''}`;
	}
}

async function* observeControls(form: HTMLFormElement, invalidation: Promise<void>) {
	let stopped = false;
	let pending = false;
	let wake: (() => void) | null = null;
	const signal = () => {
		pending = true;
		wake?.();
		wake = null;
		updateControlOutputs(form);
	};
	const stop = () => {
		stopped = true;
		form.removeEventListener('input', signal);
		wake?.();
		wake = null;
	};

	form.addEventListener('input', signal);
	updateControlOutputs(form);
	void invalidation.then(stop);

	try {
		yield readControls(form);
		while (!stopped) {
			if (!pending) await new Promise<void>((resolve) => (wake = resolve));
			if (stopped) break;
			pending = false;
			yield readControls(form);
		}
	} finally {
		stop();
	}
}

function waveData(controls: WaveControls) {
	return sampleWave(controls.samples, controls.frequency, controls.amplitude);
}

function finalWave(d3: D3, controls: WaveControls, data: WaveDatum[], invalidation: Promise<void>) {
	const height = 400;
	const { svg, width } = svgFrame(
		d3,
		height,
		'Living D3 wave generator',
		`A sine wave with amplitude ${controls.amplitude} pixels, frequency ${controls.frequency}, and ${controls.samples} visible sample points. Sliders change the chart reactively.`
	);
	const margin = { top: 34, right: 28, bottom: 54, left: 58 };
	const x = d3.scaleLinear([0, Math.PI * 2], [margin.left, width - margin.right]);
	const y = d3.scaleLinear([-100, 100], [height - margin.bottom, margin.top]);
	const line = d3
		.line<WaveDatum>()
		.x((datum) => x(datum.x))
		.y((datum) => y(datum.y))
		.curve(d3.curveCatmullRom.alpha(0.5));

	const grid = svg.append('g').attr('aria-hidden', 'true');
	grid
		.selectAll('line')
		.data(y.ticks(5))
		.join('line')
		.attr('x1', margin.left)
		.attr('x2', width - margin.right)
		.attr('y1', (tick) => y(tick))
		.attr('y2', (tick) => y(tick))
		.attr('stroke', 'var(--observable-grid)')
		.attr('stroke-dasharray', '3 6');

	svg
		.append('g')
		.attr('transform', `translate(0,${y(0)})`)
		.call(
			d3
				.axisBottom(x)
				.ticks(7)
				.tickFormat((value) => `${Number(value).toFixed(1)}`)
		)
		.call((axis) => axis.select('.domain').attr('stroke', 'var(--observable-axis)'))
		.call((axis) => axis.selectAll('line').attr('stroke', 'var(--observable-axis)'))
		.call((axis) => axis.selectAll('text').attr('fill', 'var(--observable-axis)'));
	svg
		.append('g')
		.attr('transform', `translate(${margin.left},0)`)
		.call(d3.axisLeft(y).ticks(5))
		.call((axis) => axis.select('.domain').attr('stroke', 'var(--observable-axis)'))
		.call((axis) => axis.selectAll('line').attr('stroke', 'var(--observable-axis)'))
		.call((axis) => axis.selectAll('text').attr('fill', 'var(--observable-axis)'));

	const path = svg
		.append('path')
		.attr('fill', 'none')
		.attr('stroke', 'var(--observable-ink)')
		.attr('stroke-width', 4)
		.attr('stroke-linecap', 'round')
		.attr('stroke-linejoin', 'round');
	const points = svg.append('g').attr('aria-hidden', 'true');
	const phaseLabel = svg
		.append('text')
		.attr('x', width - margin.right)
		.attr('y', margin.top)
		.attr('text-anchor', 'end')
		.attr('fill', 'var(--observable-accent)')
		.attr('font-family', 'ui-monospace, monospace')
		.attr('font-size', 12);

	function update(phase: number) {
		const nextData = data.map((datum) => ({
			x: datum.x,
			y: Math.sin(datum.x * controls.frequency + phase) * controls.amplitude
		}));
		path.datum(nextData).attr('d', line);
		points
			.selectAll('circle')
			.data(nextData)
			.join('circle')
			.attr('cx', (datum) => x(datum.x))
			.attr('cy', (datum) => y(datum.y))
			.attr('r', 3.2)
			.attr('fill', 'var(--observable-point)');
		phaseLabel.text(`phase ${phase.toFixed(2)} rad`);
	}

	update(0);
	if (controls.animate) {
		const timer = d3.timer((elapsed) => update((elapsed / 1000) * controls.speed * Math.PI));
		void invalidation.then(() => timer.stop());
	}

	return svg.node();
}

function define(runtime: Runtime, observer: Parameters<ObservableNotebookDefinition['define']>[1]) {
	const main = runtime.module();
	main.variable(observer('firstSvg')).define('firstSvg', ['d3'], firstSvg);
	main.variable(observer('firstMark')).define('firstMark', ['d3'], firstMark);
	main.variable(observer('dataMarks')).define('dataMarks', ['d3'], dataMarks);
	main.variable(observer('scaledWave')).define('scaledWave', ['d3'], scaledWave);
	main
		.variable(observer('viewof controls'))
		.define('viewof controls', ['reducedMotion', 'invalidation'], controlsForm);
	main
		.variable(observer('controls'))
		.define('controls', ['viewof controls', 'invalidation'], observeControls);
	main.variable(observer('waveData')).define('waveData', ['controls'], waveData);
	main
		.variable(observer('finalWave'))
		.define('finalWave', ['d3', 'controls', 'waveData', 'invalidation'], finalWave);
	return main as Module;
}

export const helloObservableNotebook: ObservableNotebookDefinition = {
	id: 'hello-observable',
	title: 'Hello, Observable — a living sine wave',
	description:
		'Named reactive cells turn numbers into SVG marks, then rebuild a D3 wave whenever a control changes.',
	cells: [
		{
			name: 'firstSvg',
			label: 'Cell: firstSvg',
			description: 'The responsive SVG coordinate space before it contains data.',
			kind: 'visual'
		},
		{
			name: 'firstMark',
			label: 'Cell: firstMark',
			description: 'One visual mark with position, radius, and colour attributes.',
			kind: 'visual'
		},
		{
			name: 'dataMarks',
			label: 'Cell: dataMarks',
			description: 'A D3 data join turns every sampled number pair into a circle.',
			kind: 'visual'
		},
		{
			name: 'scaledWave',
			label: 'Cell: scaledWave',
			description: 'Scales, axes, and a line generator translate mathematics into a chart.',
			kind: 'visual'
		},
		{
			name: 'viewof controls',
			label: 'Cell: viewof controls',
			description: 'Native inputs expose amplitude, frequency, speed, sample count, and motion.',
			kind: 'control'
		},
		{
			name: 'finalWave',
			label: 'Cell: finalWave',
			description:
				'The polished wave reacts to controls and disposes its D3 timer when invalidated.',
			kind: 'visual'
		}
	],
	define
};
