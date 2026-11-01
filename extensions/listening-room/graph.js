import { EQ_FREQUENCIES, EQ_Q, dbToGain, headroomDb, stereoMatrix } from './dsp.js';
import { soundSettings } from './protocol.js';

/** The source and AudioContext belong to the caller; this object owns only its graph. */
export function createSoundGraph(
	context,
	source,
	initialSettings,
	destination = context.destination
) {
	const trim = context.createGain();
	trim.channelCount = 2;
	trim.channelCountMode = 'explicit';
	trim.channelInterpretation = 'speakers';
	const filters = EQ_FREQUENCIES.map((frequency) => {
		const filter = context.createBiquadFilter();
		filter.type = 'peaking';
		filter.frequency.value = Math.min(frequency, context.sampleRate * 0.49);
		filter.Q.value = EQ_Q;
		return filter;
	});
	const splitter = context.createChannelSplitter(2);
	const merger = context.createChannelMerger(2);
	const matrix = Array.from({ length: 4 }, () => context.createGain());
	const nodes = [trim, ...filters, splitter, ...matrix, merger];
	source.connect(trim);
	let previous = trim;
	for (const filter of filters) {
		previous.connect(filter);
		previous = filter;
	}
	previous.connect(splitter);
	[
		[0, 0],
		[1, 0],
		[0, 1],
		[1, 1]
	].forEach(([input, output], index) => {
		splitter.connect(matrix[index], input);
		matrix[index].connect(merger, 0, output);
	});
	merger.connect(destination);
	let destroyed = false;
	function setSettings(value, immediate = false) {
		if (destroyed) return;
		const settings = soundSettings(value);
		const smooth = (param, target) => {
			const now = context.currentTime;
			if (immediate) return param.setValueAtTime(target, now);
			if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
			else {
				param.cancelScheduledValues(now);
				param.setValueAtTime(param.value, now);
			}
			param.setTargetAtTime(target, now, 0.025);
		};
		smooth(
			trim.gain,
			dbToGain(settings.bypass ? 0 : settings.trimDb + headroomDb(settings, context.sampleRate))
		);
		filters.forEach((filter, index) =>
			smooth(filter.gain, settings.bypass ? 0 : settings.eq[index])
		);
		const values = settings.bypass
			? stereoMatrix(1)
			: stereoMatrix(settings.width, settings.balance, settings.mono);
		[values.ll, values.lr, values.rl, values.rr].forEach((value, index) =>
			smooth(matrix[index].gain, value)
		);
	}
	setSettings(initialSettings, true);
	return {
		setSettings,
		destroy() {
			if (destroyed) return;
			destroyed = true;
			try {
				source.disconnect(trim);
			} catch {
				/* Already detached by the owner. */
			}
			for (const node of nodes) node.disconnect();
		}
	};
}
