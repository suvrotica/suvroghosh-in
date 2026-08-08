<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BZFastCpuSolver,
		BZ_FERROIN_REFERENCE_PROFILE_V2,
		BZ_PHASE_REFERENCE_PROFILE_V2,
		createInitialBZField,
		renderBZPublicationPixelBufferV2,
		type BZFieldState,
		type BZDisplayViewV2,
		type BZRenderProfileV2,
		type BZSetup
	} from '$lib/visualizations/bz';
	import { BZGpuEngine } from '$lib/visualizations/bz/gpu';
	import { BZ_V2_CALIBRATION_MANIFEST } from '$lib/visualizations/bz/calibration/manifest';
	import {
		checkpointStateToBZFieldState,
		decodeBZCheckpointV1
	} from '$lib/visualizations/bz/checkpoints/codec';

	const GRID_SIZE = 64;
	const STEPS = 64;
	const FIELD_MAX_TOLERANCE = 5e-4;
	const FIELD_RMS_TOLERANCE = 5e-5;
	// The scientific and phase paths agree byte-for-byte. The bounded allowance
	// covers the quarter-resolution GPU bloom chain versus the deterministic CPU
	// publication blur; its observed mean error remains below one byte.
	const DISPLAY_BYTE_TOLERANCE = 10;
	const DISPLAY_SIZE = 256;
	const EXPECTED_PRESET_IDS = [
		'classic-target-rings',
		'persistent-single-spiral',
		'spiral-garden'
	] as const;
	const DISPLAY_POINTS = [
		[128, 128],
		[96, 128],
		[160, 128],
		[128, 96],
		[128, 160]
	] as const;
	type FieldError = { maxAbsolute: number; rms: number; samples: number };
	type DisplayError = {
		maximumByteDifference: number;
		meanByteDifference: number;
		samples: number;
	};
	type DisplayCase = {
		readonly id: string;
		readonly profile: Readonly<BZRenderProfileV2>;
		readonly gpuView: 'dish' | 'u';
		readonly cpuView: BZDisplayViewV2;
		readonly palette: 'ferroin' | 'phase-spectrum' | 'scientific';
	};
	type NumericalCase = {
		readonly id: string;
		readonly gridSize: number;
		readonly step: number;
		readonly modelTime: number;
		readonly error: FieldError;
	};

	let canvas: HTMLCanvasElement | undefined = $state();
	let status = $state<'running' | 'complete' | 'failed'>('running');
	let report = $state<Record<string, unknown>>({ status: 'waiting-for-mount' });

	function fieldError(cpu: Readonly<BZFieldState>, gpu: Readonly<BZFieldState>): FieldError {
		let maximum = 0;
		let squared = 0;
		let samples = 0;
		for (let index = 0; index < cpu.u.length; index += 1) {
			if (!cpu.mask[index]) continue;
			for (const difference of [cpu.u[index] - gpu.u[index], cpu.v[index] - gpu.v[index]]) {
				maximum = Math.max(maximum, Math.abs(difference));
				squared += difference * difference;
				samples += 1;
			}
		}
		return { maxAbsolute: maximum, rms: Math.sqrt(squared / Math.max(1, samples)), samples };
	}

	function displaySampleError(
		engine: BZGpuEngine,
		state: Readonly<BZFieldState>,
		setup: Readonly<BZSetup>,
		step: number,
		entry: Readonly<DisplayCase>
	): DisplayError {
		engine.uploadState(state, { step, modelTime: step * setup.timestep });
		engine.setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE, 1);
		engine.render({
			view: entry.gpuView,
			palette: entry.palette,
			diagnosticScale: 1,
			exposure: 1,
			gamma: 1,
			glass: false,
			v2Profile: entry.profile
		});
		engine.gl.finish();
		const cpu = renderBZPublicationPixelBufferV2(state, setup, {
			profile: entry.profile,
			view: entry.cpuView,
			width: DISPLAY_SIZE,
			height: DISPLAY_SIZE,
			interpolation: 'mask-aware-bilinear',
			bloom: true,
			glass: false
		});
		let maximum = 0;
		let total = 0;
		let samples = 0;
		for (const [x, y] of DISPLAY_POINTS) {
			const gpuPixel = new Uint8Array(4);
			engine.gl.readPixels(
				x,
				DISPLAY_SIZE - 1 - y,
				1,
				1,
				engine.gl.RGBA,
				engine.gl.UNSIGNED_BYTE,
				gpuPixel
			);
			const offset = (y * DISPLAY_SIZE + x) * 4;
			for (let channel = 0; channel < 3; channel += 1) {
				const difference = Math.abs(cpu.data[offset + channel] - gpuPixel[channel]);
				maximum = Math.max(maximum, difference);
				total += difference;
				samples += 1;
			}
		}
		return {
			maximumByteDifference: maximum,
			meanByteDifference: total / Math.max(1, samples),
			samples
		};
	}

	function aggregateFieldErrors(values: readonly FieldError[]): FieldError {
		const samples = values.reduce((sum, value) => sum + value.samples, 0);
		return {
			maxAbsolute: Math.max(...values.map((value) => value.maxAbsolute)),
			rms: Math.sqrt(
				values.reduce((sum, value) => sum + value.rms * value.rms * value.samples, 0) /
					Math.max(1, samples)
			),
			samples
		};
	}

	function aggregateDisplayErrors(values: readonly DisplayError[]): DisplayError {
		const samples = values.reduce((sum, value) => sum + value.samples, 0);
		return {
			maximumByteDifference: Math.max(...values.map((value) => value.maximumByteDifference)),
			meanByteDifference:
				values.reduce((sum, value) => sum + value.meanByteDifference * value.samples, 0) /
				Math.max(1, samples),
			samples
		};
	}

	function interventionParityStep(preset: (typeof BZ_V2_CALIBRATION_MANIFEST.presets)[number]) {
		let target = STEPS;
		for (const event of preset.initialInterventions) {
			if (event.kind === 'pacemaker' && event.periodSteps) {
				target = Math.max(target, event.step + event.periodSteps + 2);
			} else if (event.kind !== 'probe') target = Math.max(target, event.step + 2);
		}
		return Math.min(4_096, target);
	}

	async function loadMatureCheckpoint(
		preset: (typeof BZ_V2_CALIBRATION_MANIFEST.presets)[number]
	): Promise<{ state: BZFieldState; step: number; modelTime: number }> {
		const descriptor = preset.optionalCheckpoint;
		if (!descriptor) throw new Error(`${preset.id} has no mature checkpoint.`);
		const response = await fetch(descriptor.path, { cache: 'force-cache' });
		if (!response.ok) {
			throw new Error(`${preset.id} checkpoint request returned HTTP ${response.status}.`);
		}
		const decoded = await decodeBZCheckpointV1(new Uint8Array(await response.arrayBuffer()), {
			checkpointId: descriptor.id,
			sourcePresetId: preset.id,
			setup: preset.setup,
			interventions: preset.initialInterventions,
			engineVersion: BZ_V2_CALIBRATION_MANIFEST.engineVersion,
			validationRecordId: preset.calibrationRecordId,
			cpuFloat64StateSha256: descriptor.fieldSha256F64Reference ?? undefined,
			fileSha256: descriptor.sha256
		});
		return {
			state: checkpointStateToBZFieldState(decoded.state),
			step: descriptor.modelStep,
			modelTime: descriptor.modelTime
		};
	}

	onMount(async () => {
		if (!canvas) return;
		const startedAt = performance.now();
		const records: Record<string, unknown>[] = [];
		try {
			const presets = EXPECTED_PRESET_IDS.map((id) =>
				BZ_V2_CALIBRATION_MANIFEST.presets.find((preset) => preset.id === id)
			);
			if (presets.some((preset) => !preset)) {
				throw new Error('The candidate manifest does not contain all three calibration presets.');
			}
			const scientificProfile = BZ_V2_CALIBRATION_MANIFEST.displayProfiles.find(
				(profile) => profile.id === 'oregonator-scientific-publication-v2'
			);
			if (!scientificProfile) {
				throw new Error('The candidate manifest has no scientific display profile.');
			}
			for (const preset of presets) {
				if (!preset) continue;
				const scheduleSetup = { ...preset.setup, gridSize: GRID_SIZE } as BZSetup;
				const initial = createInitialBZField(scheduleSetup);
				const scheduleCpu = new BZFastCpuSolver(scheduleSetup, {
					interventions: preset.initialInterventions
				});
				const gpu = new BZGpuEngine(canvas);
				try {
					gpu.initialize(scheduleSetup, initial);
					scheduleCpu.step(STEPS);
					gpu.advance(STEPS, preset.initialInterventions);
					const genesisError = fieldError(scheduleCpu.state, gpu.readState('scientific-snapshot'));
					const numericalCases: NumericalCase[] = [
						{
							id: 'genesis-fixed-step-64',
							gridSize: GRID_SIZE,
							step: STEPS,
							modelTime: STEPS * scheduleSetup.timestep,
							error: genesisError
						}
					];
					const scheduledStep = interventionParityStep(preset);
					let scheduleError = genesisError;
					if (scheduledStep > STEPS) {
						const additional = scheduledStep - STEPS;
						scheduleCpu.step(additional);
						gpu.advance(additional, preset.initialInterventions);
						scheduleError = fieldError(scheduleCpu.state, gpu.readState('scientific-snapshot'));
					}
					numericalCases.push({
						id: 'declared-intervention-schedule-64',
						gridSize: GRID_SIZE,
						step: scheduledStep,
						modelTime: scheduledStep * scheduleSetup.timestep,
						error: scheduleError
					});

					const mature = await loadMatureCheckpoint(preset);
					gpu.initialize(preset.setup, mature.state, {
						step: mature.step,
						modelTime: mature.modelTime
					});
					numericalCases.push({
						id: 'mature-checkpoint-upload',
						gridSize: preset.setup.gridSize,
						step: mature.step,
						modelTime: mature.modelTime,
						error: fieldError(mature.state, gpu.readState('scientific-snapshot'))
					});
					const matureCpu = new BZFastCpuSolver(preset.setup, {
						interventions: preset.initialInterventions,
						initialState: mature.state,
						initialStep: mature.step
					});
					matureCpu.step(STEPS);
					gpu.advance(STEPS, preset.initialInterventions);
					const finalStep = mature.step + STEPS;
					const finalModelTime = finalStep * preset.setup.timestep;
					numericalCases.push({
						id: 'mature-checkpoint-continuation',
						gridSize: preset.setup.gridSize,
						step: finalStep,
						modelTime: finalModelTime,
						error: fieldError(matureCpu.state, gpu.readState('scientific-snapshot'))
					});
					const luminousProfile = BZ_V2_CALIBRATION_MANIFEST.displayProfiles.find(
						(profile) => profile.id === preset.displayProfileId
					);
					if (!luminousProfile) throw new Error(`${preset.id} display profile is missing.`);
					const displayCases: DisplayCase[] = [
						{
							id: 'scientific-u',
							profile: scientificProfile,
							gpuView: 'u',
							cpuView: 'u',
							palette: 'scientific'
						},
						{
							id: 'luminous-publication',
							profile: luminousProfile,
							gpuView: 'dish',
							cpuView: 'luminous-composite',
							palette: 'ferroin'
						},
						{
							id: 'ferroin-representative',
							profile: BZ_FERROIN_REFERENCE_PROFILE_V2,
							gpuView: 'dish',
							cpuView: 'ferroin-proxy',
							palette: 'ferroin'
						},
						{
							id: 'phase-spectrum',
							profile: BZ_PHASE_REFERENCE_PROFILE_V2,
							gpuView: 'dish',
							cpuView: 'phase',
							palette: 'phase-spectrum'
						}
					];
					const displayResults = displayCases.map((entry) => ({
						id: entry.id,
						error: displaySampleError(gpu, matureCpu.state, preset.setup, finalStep, entry)
					}));
					const numerical = aggregateFieldErrors(numericalCases.map((entry) => entry.error));
					const display = aggregateDisplayErrors(displayResults.map((entry) => entry.error));
					const pass =
						numerical.maxAbsolute <= FIELD_MAX_TOLERANCE &&
						numerical.rms <= FIELD_RMS_TOLERANCE &&
						display.maximumByteDifference <= DISPLAY_BYTE_TOLERANCE;
					records.push({
						presetId: preset.id,
						gridSize: preset.setup.gridSize,
						steps: finalStep,
						modelTime: finalModelTime,
						textureFormat: gpu.precision.textureFormat,
						numerical,
						numericalCases,
						display,
						displayCases: displayResults,
						fieldMaxTolerance: FIELD_MAX_TOLERANCE,
						fieldRmsTolerance: FIELD_RMS_TOLERANCE,
						displayByteTolerance: DISPLAY_BYTE_TOLERANCE,
						pass
					});
				} finally {
					gpu.dispose();
				}
			}
			const pass = records.every((record) => record.pass === true);
			report = {
				schemaVersion: 1,
				kind: 'bz-v2-browser-cpu-gpu-parity',
				engineVersion: BZ_V2_CALIBRATION_MANIFEST.engineVersion,
				displayVersion: BZ_V2_CALIBRATION_MANIFEST.displayVersion,
				userAgent: navigator.userAgent,
				durationMs: performance.now() - startedAt,
				records,
				pass
			};
			status = pass ? 'complete' : 'failed';
		} catch (error) {
			report = {
				schemaVersion: 1,
				kind: 'bz-v2-browser-cpu-gpu-parity',
				error: error instanceof Error ? error.message : String(error),
				records,
				pass: false
			};
			status = 'failed';
		}
	});
</script>

<section class="parity-probe" data-testid="bz-v2-parity-probe" data-status={status}>
	<h3>V2 browser CPU/GPU parity probe</h3>
	<output data-testid="bz-v2-parity-report">{JSON.stringify(report)}</output>
	<canvas bind:this={canvas} width={DISPLAY_SIZE} height={DISPLAY_SIZE} aria-hidden="true"></canvas>
</section>

<style>
	.parity-probe {
		margin: 1rem;
		border: 1px solid rgb(255 255 255 / 0.18);
		background: #080d0f;
		padding: 0.75rem;
	}
	.parity-probe h3 {
		margin: 0 0 0.5rem;
		font-size: 0.8rem;
	}
	.parity-probe output {
		display: block;
		overflow-wrap: anywhere;
		font:
			0.62rem/1.45 ui-monospace,
			monospace;
	}
	.parity-probe canvas {
		position: absolute;
		width: 1px;
		height: 1px;
		clip-path: inset(50%);
	}
</style>
