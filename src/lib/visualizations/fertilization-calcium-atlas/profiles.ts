import type {
	CalciumProfile,
	Evidence,
	EvidenceStatus,
	MeasurementRow,
	SpatialSnapshot
} from './types';

const TAYLOR_1993 = 'https://doi.org/10.1093/oxfordjournals.humrep.a137999';
const FAURE_1999 = 'https://doi.org/10.1006/dbio.1999.9388';
const DEGUCHI_2000 = 'https://doi.org/10.1006/dbio.1999.9573';
const MIYAZAKI_1986 = 'https://doi.org/10.1016/0012-1606(86)90093-X';
const BUSA_1985 = 'https://doi.org/10.1083/jcb.100.4.1325';
const SPEKSNIJDER_1989 = 'https://doi.org/10.1016/0012-1606(89)90168-1';
const SWANN_1986 = 'https://doi.org/10.1083/jcb.103.6.2333';
export const ATLAS_METHOD_URL = '#fertilization-calcium-method';

const schematic = <T>(value: T, note: string): Evidence<T> => ({
	value,
	status: 'schematic',
	sourceLabel: 'Atlas method note',
	sourceUrl: ATLAS_METHOD_URL,
	note
});

const humanSample =
	'11 zona-intact and 15 zona-free IVF oocytes were exposed to sperm; transients were recorded in 3 and 7 respectively.';
const humanMethod =
	'Aequorin was microinjected and luminescence was measured with a photomultiplier system.';

const mouseFrequencySample =
	'Late oscillations in 55 monospermic zona-free mouse eggs; mean ± SEM.';
const mouseFrequencyMethod = 'Calcium recordings during in-vitro fertilization.';
const mouseWaveMethod = 'High-speed calcium imaging of monospermic fertilized mouse eggs.';

const ascidianSample = 'Single eggs of Phallusia mammillata and Ciona intestinalis.';
const ascidianMethod = 'Injected aequorin with single-egg chemiluminescence recording.';

const profileSource = (label: string, sourceUrl: string) => ({ sourceLabel: label, sourceUrl });

export const calciumProfiles: readonly CalciumProfile[] = [
	{
		id: 'human',
		commonName: 'Human',
		scientificName: 'Homo sapiens',
		pattern: 'repetitive-waves',
		peakUM: {
			value: 2.5,
			status: 'reported-maximum',
			...profileSource('Taylor et al. (1993)', TAYLOR_1993),
			sample: humanSample,
			method: humanMethod,
			note: 'The paper reports amplitudes up to 2.5 µM; this is not a population mean.'
		},
		intervalMin: {
			value: [10, 35],
			status: 'reported-range',
			...profileSource('Taylor et al. (1993)', TAYLOR_1993),
			sample: humanSample,
			method: humanMethod,
			note: 'Reported interval between observed transients.'
		},
		transientSec: {
			value: 120,
			status: 'reported',
			...profileSource('Taylor et al. (1993)', TAYLOR_1993),
			sample: humanSample,
			method: humanMethod,
			note: 'Reported transient duration.'
		},
		methodSummary: humanMethod,
		sampleSummary: humanSample,
		caveats: [
			'Historical, small IVF-oocyte study; responses were observed in only a subset of exposed oocytes.',
			'The 2.5 µM value is a reported maximum, not an average.',
			'Do not read the response subset as a fertilization-success rate.',
			'The cited experiment did not map a propagating human wave; the egg panel therefore uses whole-cell schematic brightening.'
		],
		visualModel: {
			windowSec: schematic(4_200, 'A 70-minute viewing window chosen to show several pulses.'),
			curve: {
				kind: 'pulse-train',
				startSec: 180,
				intervalSec: 1_050,
				pulseWidthSec: 120,
				pulseCount: 4
			},
			spatialMode: 'whole-cell-schematic',
			spatialDirection: 'left-to-right',
			basis: schematic(
				'Deterministic pulse train',
				'Pulse widths follow the reported 120-second summary; pulse placement within the reported 10–35-minute interval range is illustrative.'
			)
		}
	},
	{
		id: 'mouse',
		commonName: 'Mouse',
		scientificName: 'Mus musculus',
		pattern: 'repetitive-waves',
		spikeFrequencyPerHour: {
			value: { mean: 5.2, sem: 0.3 },
			status: 'reported',
			...profileSource('Faure et al. (1999)', FAURE_1999),
			sample: mouseFrequencySample,
			method: mouseFrequencyMethod,
			note: 'Frequency of late oscillations in monospermic eggs.'
		},
		intervalMin: {
			value: 60 / 5.2,
			status: 'derived',
			...profileSource('Derived from Faure et al. (1999)', FAURE_1999),
			sample: mouseFrequencySample,
			method: '60 minutes divided by the reported mean of 5.2 spikes per hour.',
			note: 'Approximately 11.5 minutes; a conversion, not a separately measured interval.'
		},
		waveSpeedUMs: {
			value: 20,
			status: 'reported',
			...profileSource('Deguchi et al. (2000)', DEGUCHI_2000),
			sample: 'Monospermic fertilized mouse eggs; the abstract describes this speed in most eggs.',
			method: mouseWaveMethod,
			note: 'Approximate first-wave speed; the first step crossed the egg in 4–5 seconds.'
		},
		waveCrossSec: {
			value: [4, 5],
			status: 'reported-range',
			...profileSource('Deguchi et al. (2000)', DEGUCHI_2000),
			sample: 'Monospermic fertilized mouse eggs; the abstract describes this timing in most eggs.',
			method: mouseWaveMethod,
			note: 'The first wave travelled from the sperm-fusion site to the antipode in 4–5 seconds.'
		},
		laterWaveSpeedUMs: {
			value: [80, 100],
			status: 'reported-range',
			...profileSource('Deguchi et al. (2000)', DEGUCHI_2000),
			sample: 'Monospermic fertilized mouse eggs during progressing oscillations.',
			method: mouseWaveMethod,
			note: 'Later waves accelerated to 80–100 µm/s or more.'
		},
		methodSummary:
			'The cadence and propagation summaries come from two separate mouse experiments: calcium recording and high-speed imaging.',
		sampleSummary:
			'Faure: 55 monospermic eggs for the late-frequency mean. Deguchi: monospermic eggs imaged through the oscillation train.',
		caveats: [
			'The frequency and wave-speed measurements come from separate experiments and are not one raw trace.',
			'The 11.5-minute interval is derived from 5.2 spikes/hour.',
			'Absolute calcium amplitude is not encoded from these papers; the chart uses relative signal.',
			'Oscillations ceased around pronuclear formation, approximately three hours after fertilization in the Deguchi study.'
		],
		visualModel: {
			windowSec: schematic(
				3_600,
				'A one-hour window matching the unit used for the reported late-oscillation frequency.'
			),
			curve: {
				kind: 'pulse-train',
				startSec: 60,
				intervalSec: (60 / 5.2) * 60,
				pulseWidthSec: 70,
				pulseCount: 6
			},
			spatialMode: 'propagating-wave',
			spatialDirection: 'left-to-right',
			spatialCrossSec: schematic(
				4.5,
				'The first replay uses the midpoint of the reported 4–5-second crossing range.'
			),
			laterSpatialCrossSec: schematic(
				1,
				'A one-second later crossing is an explanatory interpolation reflecting the reported acceleration, not a measured crossing duration.'
			),
			basis: schematic(
				'Deterministic late-hour cadence with a wavefront inset',
				'Cadence is anchored to Faure; spatial behaviour is separately anchored to Deguchi. Their synchronization here is explanatory, not an experimental recording.'
			)
		}
	},
	{
		id: 'hamster',
		commonName: 'Golden hamster',
		scientificName: 'Mesocricetus auratus',
		pattern: 'repetitive-waves',
		onsetSec: {
			value: [10, 30],
			status: 'reported-range',
			...profileSource('Miyazaki et al. (1986)', MIYAZAKI_1986),
			sample: 'Single zona-free, aequorin-injected eggs inseminated by a single sperm.',
			method: 'Aequorin luminescence recorded with a supersensitive television camera system.',
			note: 'Delay from observed sperm attachment to the first response.'
		},
		waveCrossSec: {
			value: [4, 7],
			status: 'reported-range',
			...profileSource('Miyazaki et al. (1986)', MIYAZAKI_1986),
			sample: 'First response in single-sperm, zona-free eggs.',
			method: 'Spatial aequorin imaging.',
			note: 'Time for the first calcium rise to spread over the egg.'
		},
		transientSec: {
			value: [12, 17],
			status: 'reported-range',
			...profileSource('Miyazaki et al. (1986)', MIYAZAKI_1986),
			sample: 'First response in single-sperm, zona-free eggs.',
			method: 'Spatial aequorin imaging.',
			note: 'The first response ceased within this range.'
		},
		laterWaveCrossSec: {
			value: 2,
			status: 'reported',
			...profileSource('Miyazaki et al. (1986)', MIYAZAKI_1986),
			sample: 'Second and sometimes third response.',
			method: 'Spatial aequorin imaging.',
			note: 'Approximately two seconds to spread across the egg; this is a crossing time, not µm/s.'
		},
		methodSummary: 'Aequorin luminescence imaged with a supersensitive television camera.',
		sampleSummary: 'Single zona-free eggs inseminated by a single sperm.',
		caveats: [
			'The actual-time chart encodes only the first response; the source reports later waves but does not provide a recurrence interval to encode here.',
			'The second and sometimes third waves crossed the egg in about two seconds; this is kept separate from the first 4–7-second crossing.',
			'No absolute calcium amplitude is borrowed from another species.'
		],
		visualModel: {
			windowSec: schematic(
				45,
				'A 45-second window around sperm attachment and the first response.'
			),
			curve: { kind: 'single-wave', onsetSec: 20, riseEndSec: 26, returnEndSec: 36 },
			spatialMode: 'propagating-wave',
			spatialDirection: 'left-to-right',
			spatialCrossSec: schematic(
				5.5,
				'The replay uses the midpoint of the reported 4–7-second first-crossing range.'
			),
			basis: schematic(
				'First-response interpolation',
				'Onset, crossing, and cessation are placed within their published ranges; recurrence is deliberately omitted.'
			)
		}
	},
	{
		id: 'xenopus',
		commonName: 'Frog',
		scientificName: 'Xenopus laevis',
		pattern: 'single-wave',
		baselineUM: {
			value: 0.4,
			status: 'reported',
			...profileSource('Busa & Nuccitelli (1985)', BUSA_1985),
			sample: 'Fertilized eggs measured in the animal hemisphere.',
			method: 'Calcium-selective microelectrodes.',
			note: 'Subcortical cytosolic concentration before the rise.'
		},
		peakUM: {
			value: 1.2,
			status: 'reported',
			...profileSource('Busa & Nuccitelli (1985)', BUSA_1985),
			sample: 'Fertilized eggs measured in the animal hemisphere.',
			method: 'Calcium-selective microelectrodes.',
			note: 'Reported concentration reached over about two minutes.'
		},
		riseSec: {
			value: 120,
			status: 'reported',
			...profileSource('Busa & Nuccitelli (1985)', BUSA_1985),
			sample: 'Seven eggs from seven females for the concentration measurements.',
			method: 'Calcium-selective microelectrodes.',
			note: 'Approximate time for the measured rise from 0.4 to 1.2 µM.'
		},
		recoverySec: {
			value: 600,
			status: 'reported',
			...profileSource('Busa & Nuccitelli (1985)', BUSA_1985),
			sample: 'Seven eggs from seven females for the concentration measurements.',
			method: 'Calcium-selective microelectrodes.',
			note: 'Approximate recovery time following the two-minute rise.'
		},
		waveSpeedUMs: {
			value: 9.7,
			status: 'reported',
			...profileSource('Busa & Nuccitelli (1985)', BUSA_1985),
			sample: 'Four wave-speed experiments at a mean temperature of 22 °C.',
			method: 'Two-site calcium-selective microelectrode recording.',
			note: 'Mean ± SEM was 9.7 ± 1.5 µm/s across the animal hemisphere.'
		},
		methodSummary:
			'Calcium-selective microelectrodes, including paired electrodes for propagation.',
		sampleSummary:
			'Concentration: seven eggs from seven females. Spatial lag: eight eggs from eight females. Wave speed: four experiments.',
		caveats: [
			'This is the counterexample to “all fertilized eggs oscillate”: no further calcium changes were detected through first cleavage.',
			'The concentration record was subcortical, not a whole-volume reconstruction.',
			'The wave-speed estimate applies across the animal hemisphere.'
		],
		visualModel: {
			windowSec: {
				value: 720,
				status: 'reported',
				...profileSource('Busa & Nuccitelli (1985)', BUSA_1985),
				note: 'Two-minute rise plus the following ten-minute return toward baseline.'
			},
			curve: { kind: 'single-wave', onsetSec: 0, riseEndSec: 120, returnEndSec: 720 },
			spatialMode: 'propagating-wave',
			spatialDirection: 'top-to-bottom',
			spatialCrossSec: schematic(
				114,
				'The replay uses the reported 1.9-minute mean lag between animal and vegetal electrode sites as a timing proxy; the drawing is not a measured whole-egg movie.'
			),
			basis: schematic(
				'Smooth interpolation between reported endpoints',
				'The curve connects published summary concentrations and durations; it is not digitized electrode data.'
			)
		}
	},
	{
		id: 'phallusia',
		commonName: 'Ascidian — Phallusia',
		scientificName: 'Phallusia mammillata',
		pattern: 'rapid-pulses',
		baselineUM: {
			value: 0.09,
			status: 'reported',
			...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
			sample: ascidianSample,
			method: ascidianMethod,
			note: 'About 90 nM in the unfertilized egg.'
		},
		peakUM: {
			value: 7,
			status: 'reported',
			...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
			sample: 'Phallusia mammillata eggs.',
			method: ascidianMethod,
			note: 'Approximate peak of the initial fertilization transient.'
		},
		laterPeakUM: {
			value: [1, 4],
			status: 'reported-range',
			...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
			sample: ascidianSample,
			method: ascidianMethod,
			note: 'Peak range of the briefer post-fertilization pulses across the studied ascidians.'
		},
		intervalMin: {
			value: [1, 3],
			status: 'reported-range',
			...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
			sample: ascidianSample,
			method: ascidianMethod,
			note: 'Regular interval during completion of meiosis.'
		},
		transientSec: {
			value: [120, 180],
			status: 'reported-range',
			...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
			sample: ascidianSample,
			method: ascidianMethod,
			note: 'Total duration of the initial fertilization transient.'
		},
		pulseCount: {
			value: [12, 25],
			status: 'reported-range',
			...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
			sample: ascidianSample,
			method: ascidianMethod,
			note: 'Number of briefer transients following the initial response.'
		},
		stopMin: {
			value: 25,
			status: 'reported',
			...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
			sample: ascidianSample,
			method: ascidianMethod,
			note: 'Pulses stopped when the second polar body formed at about 25 minutes.'
		},
		methodSummary: ascidianMethod,
		sampleSummary: 'Phallusia and Ciona were measured separately in the same study.',
		caveats: [
			'Phallusia and Ciona initial peaks are kept separate; only the shared reported later-pulse range is repeated.',
			'The deterministic 100-second spacing is an illustrative value inside the reported 1–3-minute range.',
			'The cited paper measured whole-egg aequorin light, so spatial propagation is not presented as measured here.'
		],
		visualModel: {
			windowSec: {
				value: 1_500,
				status: 'reported',
				...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
				note: 'Pulses stopped at second polar-body formation at about 25 minutes.'
			},
			curve: {
				kind: 'initial-and-train',
				initialRiseEndSec: 60,
				initialReturnEndSec: 150,
				laterStartSec: 220,
				intervalSec: 100,
				pulseWidthSec: 34,
				pulseCount: 13,
				laterAmplitude: 0.46
			},
			spatialMode: 'whole-cell-schematic',
			spatialDirection: 'left-to-right',
			basis: schematic(
				'Initial transient plus 13 deterministic pulses',
				'Timing and relative heights interpolate published summary ranges; no raw aequorin trace was digitized.'
			)
		}
	},
	{
		id: 'ciona',
		commonName: 'Ascidian — Ciona',
		scientificName: 'Ciona intestinalis',
		pattern: 'rapid-pulses',
		baselineUM: {
			value: 0.09,
			status: 'reported',
			...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
			sample: ascidianSample,
			method: ascidianMethod,
			note: 'About 90 nM in the unfertilized egg.'
		},
		peakUM: {
			value: 10,
			status: 'reported',
			...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
			sample: 'Ciona intestinalis eggs.',
			method: ascidianMethod,
			note: 'Approximate peak of the initial fertilization transient.'
		},
		laterPeakUM: {
			value: [1, 4],
			status: 'reported-range',
			...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
			sample: ascidianSample,
			method: ascidianMethod,
			note: 'Peak range of the briefer post-fertilization pulses across the studied ascidians.'
		},
		intervalMin: {
			value: [1, 3],
			status: 'reported-range',
			...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
			sample: ascidianSample,
			method: ascidianMethod,
			note: 'Regular interval during completion of meiosis.'
		},
		transientSec: {
			value: [120, 180],
			status: 'reported-range',
			...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
			sample: ascidianSample,
			method: ascidianMethod,
			note: 'Total duration of the initial fertilization transient.'
		},
		pulseCount: {
			value: [12, 25],
			status: 'reported-range',
			...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
			sample: ascidianSample,
			method: ascidianMethod,
			note: 'Number of briefer transients following the initial response.'
		},
		stopMin: {
			value: 25,
			status: 'reported',
			...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
			sample: ascidianSample,
			method: ascidianMethod,
			note: 'Pulses stopped when the second polar body formed at about 25 minutes.'
		},
		methodSummary: ascidianMethod,
		sampleSummary: 'Phallusia and Ciona were measured separately in the same study.',
		caveats: [
			'Ciona is not averaged with Phallusia: its approximately 10 µM initial peak remains separate.',
			'The deterministic 100-second spacing is illustrative within the reported 1–3-minute range.',
			'The source notes an exceptional winter pattern in Ciona without enough detail in its public summary to encode it here.',
			'The cited paper measured whole-egg aequorin light, so spatial propagation is not presented as measured here.'
		],
		visualModel: {
			windowSec: {
				value: 1_500,
				status: 'reported',
				...profileSource('Speksnijder et al. (1989)', SPEKSNIJDER_1989),
				note: 'Pulses stopped at second polar-body formation at about 25 minutes.'
			},
			curve: {
				kind: 'initial-and-train',
				initialRiseEndSec: 60,
				initialReturnEndSec: 150,
				laterStartSec: 220,
				intervalSec: 100,
				pulseWidthSec: 34,
				pulseCount: 13,
				laterAmplitude: 0.4
			},
			spatialMode: 'whole-cell-schematic',
			spatialDirection: 'left-to-right',
			basis: schematic(
				'Initial transient plus 13 deterministic pulses',
				'Timing and relative heights interpolate published summary ranges; no raw aequorin trace was digitized.'
			)
		}
	},
	{
		id: 'sea-urchin',
		commonName: 'Sea urchin',
		scientificName: 'Lytechinus pictus',
		pattern: 'single-wave',
		waveSpeedUMs: {
			value: 5,
			status: 'reported',
			...profileSource('Swann & Whitaker (1986)', SWANN_1986),
			sample: 'Six fertilized Lytechinus pictus eggs used for wave imaging.',
			method: 'Injected aequorin recorded with a 128 × 128 imaging photon detector at 16 °C.',
			note: 'Velocity of the peak of the calcium-release wave.'
		},
		methodSummary: 'Injected aequorin recorded with an imaging photon detector.',
		sampleSummary: 'Six jelly-free Lytechinus pictus eggs used for wave imaging at 16 °C.',
		caveats: [
			'The source reports propagation speed but no calcium amplitude used by this atlas.',
			'The chart is therefore a relative single-event schematic.',
			'The 25-second display window is illustrative and is not a reported crossing duration.'
		],
		visualModel: {
			windowSec: schematic(
				25,
				'A short illustrative window; only the 5 µm/s wave speed is treated as measured.'
			),
			curve: { kind: 'single-wave', onsetSec: 0, riseEndSec: 18, returnEndSec: 25 },
			spatialMode: 'propagating-wave',
			spatialDirection: 'left-to-right',
			spatialCrossSec: schematic(
				18,
				'An illustrative crossing duration for the drawing; the source measurement retained by the atlas is the 5 µm/s wave speed.'
			),
			basis: schematic(
				'Relative single-wave interpolation',
				'No amplitude or egg diameter is imported from another species; the drawing is not to scale.'
			)
		}
	}
] as const;

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const smoothstep = (value: number) => {
	const x = clamp01(value);
	return x * x * (3 - 2 * x);
};

function pulse(timeSec: number, centreSec: number, widthSec: number) {
	const halfWidth = Math.max(0.001, widthSec / 2);
	const distance = Math.abs(timeSec - centreSec) / halfWidth;
	if (distance >= 1) return 0;
	const triangular = 1 - distance;
	return smoothstep(triangular);
}

export function sampleCalcium(profile: CalciumProfile, timeSec: number): number {
	const time = Math.max(0, Math.min(profile.visualModel.windowSec.value, timeSec));
	const curve = profile.visualModel.curve;

	if (curve.kind === 'single-wave') {
		if (time < curve.onsetSec || time > curve.returnEndSec) return 0;
		if (time <= curve.riseEndSec) {
			return smoothstep(
				(time - curve.onsetSec) / Math.max(0.001, curve.riseEndSec - curve.onsetSec)
			);
		}
		return (
			1 -
			smoothstep((time - curve.riseEndSec) / Math.max(0.001, curve.returnEndSec - curve.riseEndSec))
		);
	}

	if (curve.kind === 'pulse-train') {
		let signal = 0;
		for (let index = 0; index < curve.pulseCount; index += 1) {
			signal = Math.max(
				signal,
				pulse(time, curve.startSec + index * curve.intervalSec, curve.pulseWidthSec)
			);
		}
		return clamp01(signal);
	}

	let signal = 0;
	if (time <= curve.initialReturnEndSec) {
		if (time <= curve.initialRiseEndSec) {
			signal = smoothstep(time / Math.max(0.001, curve.initialRiseEndSec));
		} else {
			signal =
				1 -
				smoothstep(
					(time - curve.initialRiseEndSec) /
						Math.max(0.001, curve.initialReturnEndSec - curve.initialRiseEndSec)
				);
		}
	}
	for (let index = 0; index < curve.pulseCount; index += 1) {
		signal = Math.max(
			signal,
			curve.laterAmplitude *
				pulse(time, curve.laterStartSec + index * curve.intervalSec, curve.pulseWidthSec)
		);
	}
	return clamp01(signal);
}

export function spatialSnapshot(profile: CalciumProfile, timeSec: number): SpatialSnapshot {
	const intensity = sampleCalcium(profile, timeSec);
	if (profile.visualModel.spatialMode === 'whole-cell-schematic') {
		return {
			intensity,
			front: 1,
			active: intensity > 0.001,
			label: 'Whole-cell signal view',
			note: 'Brightness is schematic; no measured propagating front is claimed for this profile.'
		};
	}

	const curve = profile.visualModel.curve;
	let front = 0;
	let eventIndex = -1;
	let active = false;
	const firstCrossSec = profile.visualModel.spatialCrossSec?.value ?? 1;
	if (curve.kind === 'single-wave') {
		if (timeSec >= curve.onsetSec && timeSec <= curve.returnEndSec) {
			eventIndex = 0;
			front = smoothstep((timeSec - curve.onsetSec) / Math.max(0.001, firstCrossSec));
			active = timeSec <= curve.onsetSec + firstCrossSec;
		}
	} else if (curve.kind === 'pulse-train') {
		for (let index = 0; index < curve.pulseCount; index += 1) {
			const centre = curve.startSec + index * curve.intervalSec;
			const eventStart = centre - curve.pulseWidthSec / 2;
			const eventEnd = centre + curve.pulseWidthSec / 2;
			if (timeSec >= eventStart && timeSec <= eventEnd) {
				eventIndex = index;
				const crossing =
					index > 0
						? (profile.visualModel.laterSpatialCrossSec?.value ?? firstCrossSec)
						: firstCrossSec;
				front = smoothstep((timeSec - eventStart) / Math.max(0.001, crossing));
				active = timeSec <= eventStart + crossing;
				break;
			}
		}
	} else {
		if (timeSec <= curve.initialReturnEndSec) {
			eventIndex = 0;
			front = smoothstep(timeSec / Math.max(0.001, firstCrossSec));
			active = timeSec <= firstCrossSec;
		}
	}

	const speedNote =
		profile.id === 'mouse'
			? eventIndex < 0
				? 'The first crossing was reported as 4–5 seconds; later wave speeds increased to 80–100 µm/s or more.'
				: eventIndex === 0
					? 'First-wave inset: approximately 20 µm/s in most eggs in Deguchi et al.'
					: 'Later-wave inset: the one-second crossing is schematic; Deguchi et al. reported speeds of 80–100 µm/s or more.'
			: profile.id === 'hamster'
				? 'First wave crossed the egg in 4–7 seconds; the replay uses the 5.5-second midpoint.'
				: profile.id === 'xenopus'
					? 'The 1.9-minute two-site lag drives this schematic; reported wave speed was 9.7 ± 1.5 µm/s.'
					: 'The crossing duration is schematic; reported peak-wave speed was 5 µm/s.';

	return {
		intensity,
		front: clamp01(front),
		active,
		label:
			eventIndex < 0
				? 'Propagating-wave view · between events'
				: `Propagating-wave view${eventIndex > 0 ? ` · pulse ${eventIndex + 1}` : ''}`,
		note: speedNote
	};
}

export function profileById(id: string): CalciumProfile {
	return calciumProfiles.find((profile) => profile.id === id) ?? calciumProfiles[0];
}

export function intervalMinutesFromFrequency(spikesPerHour: number) {
	return spikesPerHour > 0 ? 60 / spikesPerHour : Number.NaN;
}

export function formatEvidenceStatus(status: EvidenceStatus) {
	return status.replace('-', ' ');
}

function row<T>(label: string, display: string, evidence: Evidence<T>): MeasurementRow {
	return { label, display, evidence };
}

const formatRange = (value: [number, number], unit: string) =>
	`${value[0].toLocaleString('en-GB')}–${value[1].toLocaleString('en-GB')} ${unit}`;

export function measurementRows(profile: CalciumProfile): MeasurementRow[] {
	const rows: MeasurementRow[] = [];
	if (profile.baselineUM)
		rows.push(
			row(
				'Resting calcium',
				`${profile.baselineUM.value.toLocaleString('en-GB')} µM`,
				profile.baselineUM
			)
		);
	if (profile.peakUM)
		rows.push(
			row('Peak calcium', `${profile.peakUM.value.toLocaleString('en-GB')} µM`, profile.peakUM)
		);
	if (profile.laterPeakUM)
		rows.push(
			row('Later pulse peaks', formatRange(profile.laterPeakUM.value, 'µM'), profile.laterPeakUM)
		);
	if (profile.intervalMin) {
		const display = Array.isArray(profile.intervalMin.value)
			? formatRange(profile.intervalMin.value, 'min')
			: `${profile.intervalMin.value.toFixed(1)} min`;
		rows.push(row('Interval', display, profile.intervalMin));
	}
	if (profile.transientSec) {
		const display = Array.isArray(profile.transientSec.value)
			? formatRange(profile.transientSec.value, 's')
			: `${profile.transientSec.value.toLocaleString('en-GB')} s`;
		rows.push(row('Transient duration', display, profile.transientSec));
	}
	if (profile.riseSec) {
		const display = Array.isArray(profile.riseSec.value)
			? formatRange(profile.riseSec.value, 's')
			: `≈${profile.riseSec.value.toLocaleString('en-GB')} s`;
		rows.push(row('Calcium rise', display, profile.riseSec));
	}
	if (profile.recoverySec) {
		const display = Array.isArray(profile.recoverySec.value)
			? formatRange(profile.recoverySec.value, 's')
			: `≈${profile.recoverySec.value.toLocaleString('en-GB')} s`;
		rows.push(row('Recovery after rise', display, profile.recoverySec));
	}
	if (profile.onsetSec) {
		const display = Array.isArray(profile.onsetSec.value)
			? formatRange(profile.onsetSec.value, 's')
			: `${profile.onsetSec.value.toLocaleString('en-GB')} s`;
		rows.push(row('First-response onset', display, profile.onsetSec));
	}
	if (profile.waveCrossSec) {
		const display = Array.isArray(profile.waveCrossSec.value)
			? formatRange(profile.waveCrossSec.value, 's')
			: `${profile.waveCrossSec.value.toLocaleString('en-GB')} s`;
		rows.push(row('First wave crossing', display, profile.waveCrossSec));
	}
	if (profile.laterWaveCrossSec) {
		const display = Array.isArray(profile.laterWaveCrossSec.value)
			? formatRange(profile.laterWaveCrossSec.value, 's')
			: `≈${profile.laterWaveCrossSec.value.toLocaleString('en-GB')} s`;
		rows.push(row('Later wave crossing', display, profile.laterWaveCrossSec));
	}
	if (profile.waveSpeedUMs) {
		const display = Array.isArray(profile.waveSpeedUMs.value)
			? formatRange(profile.waveSpeedUMs.value, 'µm/s')
			: `${profile.waveSpeedUMs.value.toLocaleString('en-GB')} µm/s`;
		rows.push(row('Wave speed', display, profile.waveSpeedUMs));
	}
	if (profile.laterWaveSpeedUMs) {
		const display = Array.isArray(profile.laterWaveSpeedUMs.value)
			? formatRange(profile.laterWaveSpeedUMs.value, 'µm/s')
			: `≈${profile.laterWaveSpeedUMs.value.toLocaleString('en-GB')} µm/s`;
		rows.push(row('Later wave speed', display, profile.laterWaveSpeedUMs));
	}
	if (profile.spikeFrequencyPerHour)
		rows.push(
			row(
				'Late frequency',
				`${profile.spikeFrequencyPerHour.value.mean.toFixed(1)} ± ${profile.spikeFrequencyPerHour.value.sem.toFixed(1)} spikes/h`,
				profile.spikeFrequencyPerHour
			)
		);
	if (profile.pulseCount)
		rows.push(
			row('Later pulse count', formatRange(profile.pulseCount.value, 'pulses'), profile.pulseCount)
		);
	if (profile.stopMin)
		rows.push(row('Signal stops', `≈${profile.stopMin.value} min`, profile.stopMin));
	rows.push(
		row(
			'Viewing window',
			formatElapsed(profile.visualModel.windowSec.value),
			profile.visualModel.windowSec
		)
	);
	if (profile.visualModel.spatialCrossSec)
		rows.push(
			row(
				'Spatial replay crossing',
				`≈${profile.visualModel.spatialCrossSec.value.toLocaleString('en-GB')} s`,
				profile.visualModel.spatialCrossSec
			)
		);
	if (profile.visualModel.laterSpatialCrossSec)
		rows.push(
			row(
				'Later spatial replay crossing',
				`≈${profile.visualModel.laterSpatialCrossSec.value.toLocaleString('en-GB')} s`,
				profile.visualModel.laterSpatialCrossSec
			)
		);
	return rows;
}

export function sourceEvidence(profile: CalciumProfile): Evidence<unknown>[] {
	const evidence = measurementRows(profile).map((item) => item.evidence);
	evidence.push(profile.visualModel.basis);
	const unique = new Map<string, Evidence<unknown>>();
	for (const item of evidence) unique.set(`${item.sourceUrl}|${item.sourceLabel}`, item);
	return [...unique.values()];
}

export function formatElapsed(seconds: number) {
	const safeSeconds = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
	if (safeSeconds < 60) return `${safeSeconds} s`;
	const hours = Math.floor(safeSeconds / 3_600);
	const minutes = Math.floor((safeSeconds % 3_600) / 60);
	const remainder = safeSeconds % 60;
	if (hours > 0)
		return `${hours} h ${minutes.toString().padStart(2, '0')} min ${remainder.toString().padStart(2, '0')} s`;
	return `${minutes} min ${remainder.toString().padStart(2, '0')} s`;
}

export function patternLabel(profile: CalciumProfile) {
	if (profile.pattern === 'single-wave') return 'single event';
	if (profile.pattern === 'rapid-pulses') return 'rapid pulses';
	if (profile.id === 'hamster') return 'repeated responses · first event shown';
	return 'slow train';
}
