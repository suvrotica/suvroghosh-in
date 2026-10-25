<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import DistributionChart from './DistributionChart.svelte';
	import RelationshipChart from './RelationshipChart.svelte';
	import CategoryChart from './CategoryChart.svelte';
	import ParameterFields from './ParameterFields.svelte';
	import SummaryPanel from './SummaryPanel.svelte';
	import DomainFigure from './DomainFigure.svelte';
	import {
		defaultConfig,
		loadPreset,
		presetDefinitions,
		variable
	} from '$lib/synthetic-data-lab/presets';
	import {
		getCapabilities,
		previewExperiment,
		createJob,
		getJob,
		cancelJob,
		downloadUrl,
		validateExperiment,
		getResultTable,
		saveTextFile
	} from '$lib/synthetic-data-lab/client';
	import type {
		Capabilities,
		ExperimentConfig,
		GenerationJob,
		GenerationResult,
		Cell,
		Variable
	} from '$lib/synthetic-data-lab/types';
	import './lab.css';
	import { isMassColumn } from '$lib/synthetic-data-lab/chart-series';

	let config = $state<ExperimentConfig>(defaultConfig());
	let capabilities = $state<Capabilities>({ distributions: [], modules: [] });
	let result = $state<GenerationResult | null>(null);
	let baseline = $state<GenerationResult | null>(null);
	let job = $state<GenerationJob | null>(null);
	let generationPending = $state(false),
		generationCancelling = $state(false);
	let fullResult = $state<GenerationResult | null>(null);
	let selectedId = $state('x');
	let tab = $state<'explore' | 'compare' | 'validate' | 'export'>('explore');
	let selectedPreset = $state('');
	let displayColumn = $state('');
	let updating = $state(false),
		mounted = $state(false),
		error = $state(''),
		notice = $state('');
	let bins = $state(32),
		tablePage = $state(0),
		tableFilter = $state(''),
		safeCSV = $state(false);
	let scatterX = $state(''),
		scatterY = $state('');
	let compareParameter = $state(''),
		sweepStart = $state(-2),
		sweepEnd = $state(2),
		sweepSteps = $state(5);
	let sweep = $state<{ parameter: number; mean: number; std: number }[]>([]),
		sweeping = $state(false);
	let jsonOpen = $state(false),
		jsonText = $state(''),
		jsonError = $state('');
	let jsonSaving = $state(false),
		includeTruth = $state(false),
		coverageQuery = $state(''),
		coverageStatus = $state('all'),
		tableName = $state('main');
	let jsonDialog = $state<HTMLDialogElement>();
	let secondaryData = $state<
		Record<
			string,
			{ columns: GenerationResult['columns']; rows: Record<string, Cell>[]; row_count: number }
		>
	>({});
	let importInput: HTMLInputElement;
	let controller: AbortController | undefined,
		requestVersion = 0,
		pollTimer: ReturnType<typeof setTimeout> | undefined,
		sweepController: AbortController | undefined,
		generationController: AbortController | undefined,
		generationVersion = 0;
	const tabs = [
		{ id: 'explore', label: 'Explore', icon: '◈' },
		{ id: 'compare', label: 'Compare', icon: '⇄' },
		{ id: 'validate', label: 'Validate', icon: '✓' },
		{ id: 'export', label: 'Export', icon: '↗' }
	] as const;
	const accents = ['#087f80', '#d8916e', '#8d9b69', '#7f88ad', '#af7e99'];
	let serialized = $derived(JSON.stringify(config));
	let selected = $derived(config.variables.find((v) => v.id === selectedId) ?? config.variables[0]);
	let definition = $derived(
		selected && ['id', 'datetime', 'text', 'derived'].includes(selected.kind)
			? {
					id: selected.kind,
					label: selected.kind,
					kind: selected.kind,
					description:
						selected.kind === 'id'
							? 'Unique identifiers include the replication number.'
							: selected.kind === 'datetime'
								? 'Uniform timestamps inside an explicit UTC interval.'
								: selected.kind === 'text'
									? 'Synthetic text sampled from the supplied vocabulary.'
									: 'A deterministic mathematical expression based on existing variable IDs.',
					parameters: Object.entries(selected.parameters).map(([name, value]) => ({
						name,
						label: name.replaceAll('_', ' '),
						default: value,
						step: typeof value === 'number' && Number.isInteger(value) ? 1 : 0.1
					}))
				}
			: capabilities.distributions.find((d) => d.id === selected?.distribution)
	);
	let numericNames = $derived(
		result?.columns
			.filter((c) => result?.rows.some((row) => typeof row[c.name] === 'number'))
			.map((c) => c.name) ?? []
	);
	let column = $derived(
		result?.columns.some((c) => c.name === displayColumn)
			? displayColumn
			: selected && result?.columns.some((c) => c.name === selected.name)
				? selected.name
				: (numericNames[0] ?? result?.columns[0]?.name ?? '')
	);
	let plottedModel = $derived.by(() => {
		if (!result) return '';
		const source = result.config;
		if (column === 'interarrival' && source.event.enabled) {
			if (source.event.process === 'nonhomogeneous')
				return 'Interarrival times · time-varying Poisson intensity';
			if (source.event.process === 'poisson')
				return 'Interarrival times · exponential gaps from homogeneous Poisson arrivals';
			const family =
				capabilities.distributions.find((d) => d.id === source.event.distribution)?.label ??
				source.event.distribution;
			return `Interarrival times · ${family} renewal process`;
		}
		const variable = source.variables.find(
			(v) =>
				v.name === column ||
				(Array.isArray(v.parameters.names) && v.parameters.names.includes(column))
		);
		if (variable) {
			const family =
				capabilities.distributions.find((d) => d.id === variable.distribution)?.label ??
				variable.kind;
			return `${variable.name} · ${family}${variable.name !== column ? ' vector component' : ''}`;
		}
		if (source.outcome.task !== 'none' && column === source.outcome.name)
			return `Generated target · ${source.outcome.task}`;
		const descriptor = result.columns.find((c) => c.name === column);
		return `${column} · ${descriptor?.role ?? 'generated field'}${descriptor?.units ? ` · ${descriptor.units}` : ''}`;
	});
	let values = $derived(
		(result?.rows
			.map((r) => r[column])
			.filter((v) => typeof v === 'number' && Number.isFinite(v)) ?? []) as number[]
	);
	let baselineValues = $derived(
		(baseline?.rows
			.map((r) => r[column])
			.filter((v) => typeof v === 'number' && Number.isFinite(v)) ?? []) as number[]
	);
	let massMode = $derived(
		isMassColumn(
			result?.stats[column]?.density_kind,
			result?.columns.find((c) => c.name === column)?.type,
			values
		)
	);
	let baselineMassMode = $derived(
		isMassColumn(
			baseline?.stats[column]?.density_kind,
			baseline?.columns.find((c) => c.name === column)?.type,
			baselineValues
		)
	);
	let comparableBaseline = $derived(
		baselineValues.length && massMode === baselineMassMode ? baselineValues : []
	);
	let generationSizeLabel = $derived(
		config.event.enabled
			? config.event.stop === 'count'
				? `${config.event.count.toLocaleString()} requested events`
				: `${config.event.window.toLocaleString()}-second window · stochastic event count`
			: `${config.rows.toLocaleString()} requested rows`
	);
	let categorical = $derived(
		result?.rows.some((r) => typeof r[column] === 'string') ?? selected?.kind === 'categorical'
	);
	let xName = $derived(numericNames.includes(scatterX) ? scatterX : (numericNames[0] ?? ''));
	let yName = $derived(
		numericNames.includes(scatterY) ? scatterY : (numericNames.find((n) => n !== xName) ?? xName)
	);
	let cleanChecks = $derived(result?.validation.filter((v) => v.status === 'pass').length ?? 0);
	let problemChecks = $derived(
		result?.validation.filter((v) => v.status === 'fail' || v.status === 'warning').length ?? 0
	);
	let inspectedTable = $derived(
		tableName === 'main' || !result?.tables?.[tableName]
			? {
					columns: result?.columns ?? [],
					rows: result?.rows ?? [],
					row_count: result?.row_count ?? 0
				}
			: (secondaryData[tableName] ?? { ...result.tables[tableName], rows: [] })
	);
	let filteredRows = $derived(
		inspectedTable.rows.filter(
			(row) =>
				!tableFilter ||
				Object.values(row).some((v) =>
					String(v ?? '')
						.toLowerCase()
						.includes(tableFilter.toLowerCase())
				)
		) ?? []
	);
	let tableRows = $derived(filteredRows.slice(tablePage * 15, tablePage * 15 + 15));
	let jobRunning = $derived(
		generationPending ||
			(!!job && !['completed', 'failed', 'cancelled', 'expired'].includes(job.status))
	);
	let numericVariables = $derived(
		config.variables.filter(
			(v) =>
				v.kind === 'numeric' &&
				capabilities.distributions.find((d) => d.id === v.distribution)?.kind !== 'vector'
		)
	);
	let eventDefinition = $derived(
		capabilities.distributions.find((d) => d.id === config.event.distribution)
	);
	let sweepParameters = $derived(
		definition?.parameters.filter((p) => typeof p.default === 'number') ?? []
	);
	let activeSweepParameter = $derived(
		sweepParameters.find((p) => p.name === compareParameter) ?? sweepParameters[0]
	);
	let coverageFactors = $derived(
		(capabilities.factor_coverage ?? []).filter(
			(f) =>
				(coverageStatus === 'all' || f.status === coverageStatus) &&
				`${f.id} ${f.requirement} ${f.module} ${f.config_path}`
					.toLowerCase()
					.includes(coverageQuery.toLowerCase())
		)
	);
	let domainDefinition = $derived(
		config.domain
			? {
					id: config.domain.type,
					label: config.domain.type,
					kind: 'domain',
					description: 'Explicit parametric domain settings',
					parameters: Object.entries(config.domain.parameters).map(([name, value]) => ({
						name,
						label: name.replaceAll('_', ' '),
						default: value,
						step: typeof value === 'number' && Number.isInteger(value) ? 1 : 0.1
					}))
				}
			: undefined
	);
	$effect(() => {
		if (jsonOpen && jsonDialog && !jsonDialog.open) jsonDialog.showModal();
	});

	$effect(() => {
		const snapshot = serialized;
		if (!mounted) return;
		const timer = setTimeout(() => runPreview(JSON.parse(snapshot)), 260);
		return () => clearTimeout(timer);
	});

	onMount(() => {
		mounted = true;
		getCapabilities()
			.then((data) => (capabilities = data))
			.catch((e) => (error = message(e)));
	});
	onDestroy(() => {
		controller?.abort();
		sweepController?.abort();
		generationController?.abort();
		generationVersion++;
		clearTimeout(pollTimer);
	});

	function message(e: unknown) {
		return e instanceof Error ? e.message : String(e);
	}
	function number(value: unknown, digits = 3) {
		return typeof value === 'number' && Number.isFinite(value)
			? new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(value)
			: '—';
	}
	function cell(value: Cell | undefined) {
		return value === null || value === undefined
			? '∅'
			: typeof value === 'number'
				? number(value, 6)
				: String(value);
	}
	function clone<T>(value: T): T {
		return JSON.parse(JSON.stringify(value));
	}
	async function runPreview(snapshot: ExperimentConfig) {
		controller?.abort();
		controller = new AbortController();
		const version = ++requestVersion;
		updating = true;
		error = '';
		try {
			const next = await previewExperiment(snapshot, controller.signal);
			if (version === requestVersion) {
				result = next;
				const available = next.columns
					.filter((c) => next.rows.some((row) => typeof row[c.name] === 'number'))
					.map((c) => c.name);
				if (!available.includes(scatterX)) scatterX = available[0] ?? '';
				if (!available.includes(scatterY))
					scatterY = available.find((name) => name !== scatterX) ?? scatterX;
				tablePage = 0;
				tableName = 'main';
				secondaryData = {};
				void loadSecondaryTables(next);
			}
		} catch (e) {
			if (version === requestVersion && !(e instanceof DOMException && e.name === 'AbortError'))
				error = message(e);
		} finally {
			if (version === requestVersion) updating = false;
		}
	}
	async function loadSecondaryTables(source: GenerationResult) {
		for (const name of Object.keys(source.tables ?? {})) {
			try {
				const page = await getResultTable(source.result_id, name);
				if (result?.result_id === source.result_id)
					secondaryData = {
						...secondaryData,
						[name]: { columns: page.columns, rows: page.rows, row_count: page.row_count }
					};
			} catch (e) {
				if (result?.result_id === source.result_id)
					notice = `Secondary table could not load: ${message(e)}`;
			}
		}
	}
	function changeVariable(patch: Partial<Variable>) {
		if (!selected) return;
		config = {
			...config,
			variables: config.variables.map((v) => (v.id === selected.id ? { ...v, ...patch } : v))
		};
		selectedPreset = '';
	}
	function changeParameter(name: string, value: unknown) {
		changeVariable({ parameters: { ...selected.parameters, [name]: value } });
	}
	function distributionChanged(id: string) {
		const d = capabilities.distributions.find((d) => d.id === id);
		if (!d) return;
		const previous = selected;
		changeVariable({
			distribution: id,
			parameters: Object.fromEntries(d.parameters.map((p) => [p.name, clone(p.default)])),
			kind: d.kind === 'categorical' ? 'categorical' : 'numeric'
		});
		if (d.kind === 'categorical' || d.kind === 'vector') removeScalarReferences(previous);
	}
	function removeScalarReferences(previous: Variable) {
		const coefficients = { ...config.outcome.coefficients };
		delete coefficients[previous.id];
		delete coefficients[previous.name];
		const removesCopula = config.dependence.columns.some(
			(column) => column === previous.id || column === previous.name
		);
		config = {
			...config,
			outcome: { ...config.outcome, coefficients },
			dependence: removesCopula
				? { mode: 'independent', columns: [], matrix: [] }
				: config.dependence
		};
	}
	function kindChanged(kind: Variable['kind']) {
		const previous = selected;
		const parameters: Record<string, unknown> =
			kind === 'id'
				? { prefix: 'row_' }
				: kind === 'datetime'
					? { start: '2026-01-01T00:00:00Z', end: '2027-01-01T00:00:00Z' }
					: kind === 'text'
						? { vocabulary: ['synthetic', 'sample', 'record', 'observation'], words: 4 }
						: kind === 'categorical'
							? { categories: ['A', 'B', 'C'], probabilities: [0.5, 0.3, 0.2] }
							: kind === 'derived'
								? {}
								: { mean: 0, std: 1 };
		changeVariable({
			kind,
			parameters,
			distribution: kind === 'categorical' ? 'categorical' : 'normal',
			expression: kind === 'derived' ? '0' : undefined,
			role: kind === 'id' ? 'identifier' : 'feature',
			noise: 0,
			truncate: undefined,
			clip: undefined
		});
		if (!['numeric', 'derived'].includes(kind)) {
			removeScalarReferences(previous);
		}
	}
	function addVariable() {
		const id = `v${Date.now().toString(36)}`;
		config = {
			...config,
			variables: [...config.variables, variable(id, `feature_${config.variables.length + 1}`)]
		};
		selectedId = id;
	}
	function removeVariable() {
		if (config.variables.length < 2) return;
		config = {
			...config,
			variables: config.variables.filter((v) => v.id !== selectedId),
			dependence: { mode: 'independent', columns: [], matrix: [] },
			outcome: {
				...config.outcome,
				coefficients: Object.fromEntries(
					Object.entries(config.outcome.coefficients).filter(([key]) => key !== selectedId)
				)
			}
		};
		selectedId = config.variables[0].id;
	}
	function resample() {
		config = { ...config, seed: crypto.getRandomValues(new Uint32Array(1))[0] };
		notice = 'New random seed. The generating model is unchanged.';
	}
	function preset(id: string) {
		config = loadPreset(id);
		selectedId = config.variables[0].id;
		displayColumn = config.event.enabled ? 'interarrival' : '';
		selectedPreset = id;
		baseline = null;
		sweep = [];
		tab = 'explore';
	}
	function setMode(mode: string) {
		displayColumn = mode === 'events' ? 'interarrival' : '';
		config = {
			...config,
			event: { ...config.event, enabled: mode === 'events' },
			timeseries: {
				...config.timeseries,
				enabled: mode === 'timeseries',
				column: numericVariables[0]?.id ?? 'x'
			}
		};
		if (mode !== 'tabular' && config.domain) {
			const next = { ...config };
			delete next.domain;
			config = next;
		}
	}
	function setEventProcess(process: ExperimentConfig['event']['process']) {
		config = {
			...config,
			event: {
				...config.event,
				process,
				...(process !== 'renewal'
					? {
							distribution: 'exponential',
							parameters: { rate: Number(config.event.parameters.rate ?? 1) }
						}
					: {})
			}
		};
	}
	function setRows(rows: number) {
		config = {
			...config,
			rows,
			event: {
				...config.event,
				...(config.event.enabled && config.event.stop === 'count' ? { count: rows } : {})
			}
		};
	}
	function eventDistribution(id: string) {
		const d = capabilities.distributions.find((d) => d.id === id);
		config = {
			...config,
			event: {
				...config.event,
				distribution: id,
				parameters: Object.fromEntries(d?.parameters.map((p) => [p.name, clone(p.default)]) ?? [])
			}
		};
	}
	function setCorrelation(value: number) {
		const cols = numericVariables.slice(0, 2).map((v) => v.id);
		config = {
			...config,
			dependence: {
				mode: 'gaussian_copula',
				columns: cols,
				matrix: [
					[1, value],
					[value, 1]
				]
			}
		};
	}
	function saveLocal() {
		try {
			localStorage.setItem('synthetic-data-lab-config-v1', JSON.stringify(config));
			notice = 'Experiment saved in this browser.';
		} catch {
			error = 'This browser could not save the configuration.';
		}
	}
	async function restoreLocal() {
		try {
			const saved = localStorage.getItem('synthetic-data-lab-config-v1');
			if (!saved) {
				notice = 'No saved experiment in this browser yet.';
				return;
			}
			await applyImported(JSON.parse(saved));
			notice = 'Saved experiment restored.';
		} catch (e) {
			error = message(e);
		}
	}
	async function applyImported(value: unknown) {
		if (
			!value ||
			typeof value !== 'object' ||
			!('version' in value) ||
			value.version !== 1 ||
			!('variables' in value) ||
			!Array.isArray(value.variables)
		)
			throw new Error('Import a version 1 Synthetic Data Lab configuration.');
		const input = value as ExperimentConfig;
		const check = await validateExperiment(input);
		if (!check.valid)
			throw new Error(
				(check.errors ?? [])
					.map((item) => (typeof item === 'object' && item ? JSON.stringify(item) : String(item)))
					.join('; ') || 'The configuration is invalid.'
			);
		const defaults = defaultConfig();
		config = clone({
			...defaults,
			...input,
			variables: input.variables.map((v) => ({
				...variable(v.id ?? v.name, v.name),
				...v,
				parameters: v.parameters ?? {}
			})),
			dependence: { ...defaults.dependence, ...input.dependence },
			outcome: { ...defaults.outcome, ...input.outcome },
			event: { ...defaults.event, ...input.event },
			timeseries: { ...defaults.timeseries, ...input.timeseries },
			quality: { ...defaults.quality, ...input.quality },
			split: { ...defaults.split, ...input.split }
		});
		selectedId = config.variables[0]?.id ?? '';
		displayColumn = config.event.enabled ? 'interarrival' : '';
		selectedPreset = '';
		baseline = null;
	}
	async function importFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			if (file.size > 1000000) throw new Error('Configuration files must be smaller than 1 MB.');
			await applyImported(JSON.parse(await file.text()));
			notice = 'Configuration imported. Preview is updating.';
		} catch (e) {
			error = message(e);
		}
		importInput.value = '';
	}
	function openJSON() {
		jsonText = JSON.stringify(config, null, 2);
		jsonError = '';
		jsonOpen = true;
	}
	async function applyJSON() {
		jsonSaving = true;
		try {
			await applyImported(JSON.parse(jsonText));
			jsonOpen = false;
		} catch (e) {
			jsonError = message(e);
		} finally {
			jsonSaving = false;
		}
	}
	async function generateFull() {
		if (jobRunning) return;
		const version = ++generationVersion;
		generationController = new AbortController();
		generationPending = true;
		job = null;
		clearTimeout(pollTimer);
		error = '';
		notice = '';
		tab = 'export';
		try {
			const next = await createJob(clone(config), generationController.signal);
			if (version !== generationVersion) return;
			generationPending = false;
			updateJob(next);
			if (jobRunning) void poll(version);
		} catch (e) {
			if (version === generationVersion) error = message(e);
		} finally {
			if (version === generationVersion) {
				generationPending = false;
				generationController = undefined;
			}
		}
	}
	function updateJob(next: GenerationJob) {
		job = next;
		if (next.status === 'completed') {
			if (next.result) fullResult = next.result;
			notice = 'Full generation complete. Downloads preserve this exact result.';
		} else if (next.status === 'failed') error = next.error ?? 'Generation failed.';
		else if (next.status === 'cancelled') notice = 'Generation cancelled.';
	}
	async function poll(version = generationVersion) {
		if (!job || version !== generationVersion) return;
		const id = job.job_id;
		try {
			const next = await getJob(id);
			if (version !== generationVersion || job?.job_id !== id) return;
			updateJob(next);
			if (jobRunning) pollTimer = setTimeout(() => void poll(version), 800);
		} catch (e) {
			if (version === generationVersion) error = message(e);
		}
	}
	async function stopJob() {
		if (generationPending) {
			generationVersion++;
			generationController?.abort();
			generationController = undefined;
			generationPending = false;
			notice = 'Generation request cancelled.';
			return;
		}
		if (!job || generationCancelling) return;
		const id = job.job_id;
		const version = ++generationVersion;
		generationCancelling = true;
		clearTimeout(pollTimer);
		try {
			const next = await cancelJob(id);
			if (version !== generationVersion) return;
			updateJob(next);
			if (jobRunning) void poll(version);
		} catch (e) {
			if (version === generationVersion) {
				error = message(e);
				void poll(version);
			}
		} finally {
			generationCancelling = false;
		}
	}
	function pinBaseline() {
		if (!result) return;
		baseline = clone(result);
		notice = `Pinned ${result.config.name}, seed ${result.config.seed}.`;
	}
	async function runSweep() {
		if (!selected || !activeSweepParameter || sweeping) return;
		const source = clone(config),
			variableId = selectedId,
			variableName = selected.name,
			parameterName = activeSweepParameter.name;
		const start = sweepStart,
			end = sweepEnd,
			steps = Math.max(2, Math.min(9, Math.round(sweepSteps)));
		sweeping = true;
		sweep = [];
		error = '';
		sweepController = new AbortController();
		try {
			for (let i = 0; i < steps; i++) {
				const value = start + ((end - start) * i) / Math.max(1, steps - 1);
				const candidate = clone(source);
				candidate.rows = Math.min(1000, source.rows);
				candidate.variables.find((v) => v.id === variableId)!.parameters[parameterName] = value;
				const next = await previewExperiment(candidate, sweepController.signal);
				const stats = next.stats[variableName];
				sweep = [
					...sweep,
					{
						parameter: value,
						mean: typeof stats?.mean === 'number' ? stats.mean : NaN,
						std: typeof stats?.std === 'number' ? stats.std : NaN
					}
				];
			}
		} catch (e) {
			if (!(e instanceof DOMException && e.name === 'AbortError')) error = message(e);
		} finally {
			sweeping = false;
		}
	}
</script>

<div class="synthetic-lab" data-testid="synthetic-data-lab">
	<div class="lab-masthead">
		<a href="/blog/visualizations" class="back-link">← All visualizations</a><span
			><i></i> AN INTERACTIVE DATA WORKBENCH <span class="edition">/ 01</span></span
		>
	</div>
	<header class="lab-header">
		<div class="title-group">
			<p class="eyebrow">SYNTHETIC DATA LAB</p>
			<h1>Make the data.<br /><em>Know its shape.</em></h1>
			<p class="lede">
				Build a dataset from first principles. Change the inputs,<br class="desktop-break" /> watch the
				patterns move, and take the data with you.
			</p>
		</div>
		<div class="header-art" aria-hidden="true">
			<svg viewBox="0 0 350 140"
				><defs
					><linearGradient id="lab-fill" x1="0" y1="0" x2="0" y2="1"
						><stop offset="0" stop-color="#67a49a" stop-opacity=".28" /><stop
							offset="1"
							stop-color="#67a49a"
							stop-opacity="0"
						/></linearGradient
					></defs
				><path
					d="M8 117C57 117 63 112 87 84S121 9 160 9 206 117 252 117H342"
					fill="none"
					stroke="#087f80"
					stroke-width="2"
				/><path
					d="M8 117C57 117 63 112 87 84S121 9 160 9 206 117 252 117H342V130H8Z"
					fill="url(#lab-fill)"
				/><path
					d="M8 117C70 117 91 106 120 76S163 34 193 36 225 98 251 108 292 118 342 117"
					fill="none"
					stroke="#d7987a"
					stroke-width="1.5"
					stroke-dasharray="5 5"
				/><line
					x1="8"
					x2="342"
					y1="118"
					y2="118"
					stroke="#c6d6cb"
				/>{#each [42, 87, 132, 177, 222, 267, 312] as x}<line
						x1={x}
						x2={x}
						y1="118"
						y2="124"
						stroke="#a8bcae"
					/>{/each}<text
					x="160"
					y="137"
					text-anchor="middle"
					fill="#8b9a8d"
					font-size="8"
					letter-spacing="2">A WORLD OF POSSIBLE SHAPES</text
				></svg
			>
		</div>
	</header>

	<div class="experiment-bar">
		<label class="experiment-name"
			><span>EXPERIMENT</span><input aria-label="Experiment name" bind:value={config.name} /></label
		>
		<div class="experiment-actions">
			<button onclick={saveLocal} title="Save configuration in this browser">↓ Save</button><button
				onclick={restoreLocal}
				title="Restore the configuration saved in this browser">Restore</button
			><button onclick={() => importInput.click()}>Import</button><button
				class="primary small"
				onclick={generateFull}
				disabled={jobRunning}
				>{jobRunning ? 'Generating…' : 'Generate dataset'} <span>↗</span></button
			>
		</div>
		<input
			class="visually-hidden"
			type="file"
			accept="application/json,.json"
			bind:this={importInput}
			onchange={importFile}
			aria-label="Import experiment configuration"
		/>
	</div>

	<div class="preset-strip" aria-label="Dataset presets">
		<span class="strip-label">START WITH<br />A SCENARIO</span>{#each presetDefinitions as p}<button
				class:chosen={selectedPreset === p.id}
				onclick={() => preset(p.id)}
				title={p.description}
				><span
					>{p.id === 'events'
						? '↦'
						: p.id === 'timeseries'
							? '∿'
							: p.id === 'quality'
								? '⠿'
								: p.id === 'classification'
									? '◒'
									: p.id === 'regression'
										? '↗'
										: '⌁'}</span
				>{p.label}</button
			>{/each}
	</div>

	{#if notice}<div class="notice" role="status">
			{notice}<button aria-label="Dismiss notification" onclick={() => (notice = '')}>×</button>
		</div>{/if}
	{#if error}<div class="error-banner" role="alert">
			<strong>Preview needs attention</strong><span>{error}</span><button
				onclick={() => runPreview(clone(config))}>Retry</button
			>
		</div>{/if}

	<div class="workbench">
		<aside class="design-panel">
			<div class="section-label">
				<span>01 / DESIGN YOUR DATA</span><button
					class="icon-button"
					onclick={openJSON}
					title="Edit complete configuration JSON"
					aria-label="Edit configuration JSON">{'{ }'}</button
				>
			</div>
			<div class="size-row">
				<label
					>{config.event.enabled ? 'Event rows' : 'Rows'}<input
						type="number"
						min="10"
						max="100000"
						step="100"
						value={config.event.enabled ? config.event.count : config.rows}
						disabled={config.event.enabled && config.event.stop === 'window'}
						onchange={(e) => setRows(Number(e.currentTarget.value))}
					/></label
				><label>Seed<input type="number" min="0" step="1" bind:value={config.seed} /></label>
			</div>
			{#if config.event.enabled && config.event.stop === 'window'}<p class="hint">
					Event count is stochastic. Set the observation window in Event arrivals below.
				</p>{/if}
			<div class="mode-select" aria-label="Generator mode">
				<button
					class:active={!config.event.enabled && !config.timeseries.enabled}
					onclick={() => setMode('tabular')}>Tabular</button
				><button class:active={config.event.enabled} onclick={() => setMode('events')}
					>Events</button
				><button class:active={config.timeseries.enabled} onclick={() => setMode('timeseries')}
					>Time series</button
				>
			</div>
			<div class="field-heading">
				<span>YOUR VARIABLES <small>{config.variables.length}</small></span><button
					onclick={addVariable}
					disabled={config.variables.length >= 30}
					aria-label="Add variable">＋</button
				>
			</div>
			<div class="variable-list">
				{#each config.variables as v, i}<button
						class:selected={v.id === selectedId}
						onclick={() => {
							selectedId = v.id;
							displayColumn = v.name;
						}}
						><span class="variable-dot" style={`background:${accents[i % accents.length]}`}
						></span><span
							><strong>{v.name}</strong><small
								>{capabilities.distributions.find((d) => d.id === v.distribution)?.label ??
									v.distribution}</small
							></span
						><span class="variable-kind">{v.kind === 'categorical' ? 'abc' : '123'}</span></button
					>{/each}
			</div>
			{#if selected}<div class="variable-editor">
					<div class="editor-title">
						<span>EDIT VARIABLE</span><button
							disabled={config.variables.length < 2}
							onclick={removeVariable}
							aria-label={`Remove ${selected.name}`}
							title="Remove variable">− Remove</button
						>
					</div>
					<label class="field-label"
						>Column name<input
							value={selected.name}
							onchange={(e) => changeVariable({ name: e.currentTarget.value })}
						/></label
					>
					<label class="field-label"
						>Field type<select
							value={selected.kind}
							onchange={(e) => kindChanged(e.currentTarget.value as Variable['kind'])}
							><option value="numeric">Numerical</option><option value="categorical"
								>Categorical</option
							><option value="id">Unique identifier</option><option value="datetime"
								>Date / time</option
							><option value="text">Dictionary text</option><option value="derived"
								>Derived formula</option
							></select
						></label
					>
					{#if selected.kind === 'numeric' || selected.kind === 'categorical'}
						<label class="field-label"
							>Distribution<select
								value={selected.distribution}
								onchange={(e) => distributionChanged(e.currentTarget.value)}
								>{#if !capabilities.distributions.length}<option value="normal">Normal</option
									>{/if}{#each capabilities.distributions as d}<option value={d.id}
										>{d.label}{d.kind === 'vector' ? ' · vector' : ''}</option
									>{/each}</select
							></label
						>
					{/if}
					{#if selected.kind === 'derived'}<label class="field-label"
							>Expression<input
								value={selected.expression ?? '0'}
								onchange={(e) => changeVariable({ expression: e.currentTarget.value })}
							/></label
						>
						<p class="hint">
							Use variable IDs: {config.variables
								.filter((v) => v.id !== selectedId)
								.map((v) => v.id)
								.join(', ')}. Functions include sin, exp, log, sqrt, where.
						</p>{/if}
					{#if definition}<p class="distribution-help">{definition.description}</p>{/if}
					<ParameterFields
						{definition}
						parameters={selected.parameters}
						onchange={changeParameter}
					/>
					<details class="advanced">
						<summary>Precision & observation</summary>
						<div class="advanced-fields">
							<label class="field-label"
								>Decimal places<input
									type="number"
									min="0"
									max="12"
									value={selected.decimals}
									onchange={(e) => changeVariable({ decimals: Number(e.currentTarget.value) })}
								/></label
							><label class="field-label"
								>Missing probability<input
									type="number"
									min="0"
									max="1"
									step=".01"
									value={selected.missing}
									onchange={(e) => changeVariable({ missing: Number(e.currentTarget.value) })}
								/></label
							><label class="field-label"
								>Measurement noise, σ<input
									type="number"
									min="0"
									step=".1"
									value={selected.noise}
									onchange={(e) => changeVariable({ noise: Number(e.currentTarget.value) })}
								/></label
							><label class="field-label"
								>Observed bounds<select
									value={selected.truncate ? 'truncate' : selected.clip ? 'clip' : 'none'}
									onchange={(e) =>
										changeVariable(
											e.currentTarget.value === 'truncate'
												? { truncate: { lower: 0, upper: 10 }, clip: undefined }
												: e.currentTarget.value === 'clip'
													? { clip: { lower: 0, upper: 10 }, truncate: undefined }
													: { clip: undefined, truncate: undefined }
										)}
									><option value="none">Unbounded observations</option><option value="truncate"
										>Truncate: sample inside bounds</option
									><option value="clip">Clip: replace with boundaries</option></select
								></label
							>{#if selected.truncate || selected.clip}{@const bounds =
									selected.truncate ?? selected.clip!}
								<div class="size-row">
									<label
										>Lower<input
											type="number"
											value={bounds.lower}
											onchange={(e) =>
												changeVariable(
													selected.truncate
														? { truncate: { ...bounds, lower: Number(e.currentTarget.value) } }
														: { clip: { ...bounds, lower: Number(e.currentTarget.value) } }
												)}
										/></label
									><label
										>Upper<input
											type="number"
											value={bounds.upper}
											onchange={(e) =>
												changeVariable(
													selected.truncate
														? { truncate: { ...bounds, upper: Number(e.currentTarget.value) } }
														: { clip: { ...bounds, upper: Number(e.currentTarget.value) } }
												)}
										/></label
									>
								</div>{/if}
						</div>
					</details>
				</div>{/if}
			{#if config.domain && domainDefinition}<details class="control-block" open>
					<summary>{config.domain.type.replaceAll('_', ' ')} model</summary>
					<div class="advanced-fields">
						<ParameterFields
							definition={domainDefinition}
							parameters={config.domain.parameters}
							onchange={(name, value) => {
								if (config.domain)
									config = {
										...config,
										domain: {
											...config.domain,
											parameters: { ...config.domain.parameters, [name]: value }
										}
									};
							}}
						/>
						<p class="hint">
							These parameters define an explicit simulation model. Assumptions appear in Validate.
						</p>
						<button
							class="text-button"
							onclick={() => {
								const next = { ...config };
								delete next.domain;
								config = next;
							}}>Remove domain model</button
						>
					</div>
				</details>{/if}
			{#if config.event.enabled}<details class="control-block" open>
					<summary>Event arrivals</summary>
					<div class="advanced-fields">
						<label class="field-label"
							>Process<select
								value={config.event.process}
								onchange={(e) =>
									setEventProcess(e.currentTarget.value as ExperimentConfig['event']['process'])}
								><option value="renewal">Renewal process</option><option value="poisson"
									>Homogeneous Poisson</option
								><option value="nonhomogeneous">Time-varying Poisson</option></select
							></label
						><label class="field-label"
							>Stopping rule<select bind:value={config.event.stop}
								><option value="count">Fixed event count</option><option value="window"
									>Fixed observation window</option
								></select
							></label
						>{#if config.event.stop === 'count'}<label class="field-label"
								>Number of events<input
									type="number"
									min="10"
									max="100000"
									value={config.event.count}
									onchange={(e) => setRows(Number(e.currentTarget.value))}
								/></label
							>{:else}<label class="field-label"
								>Window, seconds<input
									type="number"
									min="1"
									bind:value={config.event.window}
								/></label
							>{/if}<label class="field-label"
							>Interarrival distribution<select
								value={config.event.distribution}
								disabled={config.event.process !== 'renewal'}
								onchange={(e) => eventDistribution(e.currentTarget.value)}
								>{#each capabilities.distributions.filter( (d) => ['exponential', 'gamma', 'weibull', 'lognormal', 'constant'].includes(d.id) ) as d}<option
										value={d.id}>{d.label}</option
									>{/each}</select
							></label
						><ParameterFields
							definition={eventDefinition}
							parameters={config.event.parameters}
							onchange={(name, value) =>
								(config = {
									...config,
									event: {
										...config.event,
										parameters: { ...config.event.parameters, [name]: value }
									}
								})}
						/>{#if config.event.process === 'nonhomogeneous'}<label class="field-label"
								>Intensity amplitude<input
									type="number"
									min="0"
									max=".99"
									step=".05"
									bind:value={config.event.intensity_amplitude}
								/></label
							><label class="field-label"
								>Intensity period, seconds<input
									type="number"
									min="1"
									bind:value={config.event.period}
								/></label
							>{/if}<label class="field-label"
							>Event duration, seconds<input
								type="number"
								min="0"
								step=".1"
								bind:value={config.event.duration}
							/></label
						>
						<p class="hint">
							Counts fluctuate in a fixed window. Arrival gaps and event duration have separate
							meanings.
						</p>
					</div>
				</details>{/if}
			{#if config.timeseries.enabled}<details class="control-block" open>
					<summary>Temporal structure</summary>
					<div class="advanced-fields">
						<label class="field-label"
							>Series variable<select bind:value={config.timeseries.column}
								>{#each numericVariables as v}<option value={v.id}>{v.name}</option>{/each}</select
							></label
						><label class="field-label"
							>Trend per observation<input
								type="number"
								step=".001"
								bind:value={config.timeseries.trend}
							/></label
						><label class="field-label"
							>Seasonal period<input
								type="number"
								min="2"
								bind:value={config.timeseries.seasonal_period}
							/></label
						><label class="field-label"
							>Seasonal amplitude<input
								type="number"
								min="0"
								step=".1"
								bind:value={config.timeseries.amplitude}
							/></label
						><label class="field-label"
							>Autoregressive coefficient<input
								type="number"
								min="-.99"
								max=".99"
								step=".05"
								bind:value={config.timeseries.ar}
							/></label
						>
					</div>
				</details>{/if}
			<details class="control-block">
				<summary>Relationships & ML target</summary>
				<div class="advanced-fields">
					<label class="field-label"
						>Feature dependence<select
							value={config.dependence.mode}
							onchange={(e) =>
								e.currentTarget.value === 'independent'
									? (config = {
											...config,
											dependence: { mode: 'independent', columns: [], matrix: [] }
										})
									: setCorrelation(0.5)}
							disabled={numericVariables.length < 2}
							><option value="independent">Independent features</option><option
								value="gaussian_copula">Gaussian copula · first two features</option
							></select
						></label
					>{#if config.dependence.mode === 'gaussian_copula'}<label class="field-label"
							>Latent correlation · {number(config.dependence.matrix[0]?.[1])}<input
								type="range"
								min="-.99"
								max=".99"
								step=".01"
								value={config.dependence.matrix[0]?.[1] ?? 0.5}
								oninput={(e) => setCorrelation(Number(e.currentTarget.value))}
							/></label
						>
						<p class="hint">
							Output Pearson correlation can differ for non-normal marginals.
						</p>{/if}<label class="field-label"
						>Outcome<select bind:value={config.outcome.task}
							><option value="none">No generated target</option><option value="regression"
								>Regression</option
							><option value="classification">Binary classification</option></select
						></label
					>{#if config.outcome.task !== 'none'}<label class="field-label"
							>Target column<input bind:value={config.outcome.name} /></label
						>{#each numericVariables as v}<label class="field-label"
								>Coefficient · {v.name}<input
									type="number"
									step=".1"
									value={config.outcome.coefficients[v.id] ?? 0}
									onchange={(e) =>
										(config = {
											...config,
											outcome: {
												...config.outcome,
												coefficients: {
													...config.outcome.coefficients,
													[v.id]: Number(e.currentTarget.value)
												}
											}
										})}
								/></label
							>{/each}<label class="field-label"
							>Intercept<input
								type="number"
								step=".1"
								bind:value={config.outcome.intercept}
							/></label
						><label class="field-label"
							>Outcome noise<input
								type="number"
								min="0"
								step=".1"
								bind:value={config.outcome.noise}
							/></label
						>{#if config.outcome.task === 'classification'}<label class="field-label"
								>Label-noise probability<input
									type="number"
									min="0"
									max="1"
									step=".01"
									bind:value={config.outcome.label_noise}
								/></label
							>{/if}{/if}
				</div>
			</details>
			<details class="control-block">
				<summary>Missingness & anomalies</summary>
				<div class="advanced-fields">
					<label class="field-label"
						>Missingness mechanism<select bind:value={config.quality.missingness}
							><option value="mcar">MCAR · random omissions</option><option value="mar"
								>MAR · observed-driver dependent</option
							><option value="mnar">MNAR · value dependent</option></select
						></label
					><label class="field-label"
						>Missing probability<input
							type="number"
							min="0"
							max=".95"
							step=".01"
							bind:value={config.quality.rate}
						/></label
					>{#if config.quality.missingness === 'mar'}<label class="field-label"
							>Observed driver<select bind:value={config.quality.driver}
								>{#each numericVariables as v}<option value={v.id}>{v.name}</option>{/each}</select
							></label
						>{/if}<label class="field-label"
						>Injected anomaly proportion<input
							type="number"
							min="0"
							max=".5"
							step=".005"
							bind:value={config.quality.outlier_rate}
						/></label
					><label class="field-label"
						>Anomaly scale<input
							type="number"
							min="1"
							step=".5"
							bind:value={config.quality.outlier_scale}
						/></label
					><label class="field-label"
						>Duplicate proportion<input
							type="number"
							min="0"
							max=".5"
							step=".01"
							bind:value={config.quality.duplicate_rate}
						/></label
					>
				</div>
			</details>
			<details class="control-block">
				<summary>Train / validation / test</summary>
				<div class="advanced-fields">
					<label class="field-label"
						>Split strategy<select bind:value={config.split.mode}
							><option value="none">One unsplit dataset</option><option value="random"
								>Random</option
							><option value="stratified">Stratified by target</option><option value="temporal"
								>Temporal / row order</option
							><option value="group">Group / entity</option></select
						></label
					>{#if config.split.mode !== 'none'}<label class="field-label"
							>Training fraction<input
								type="number"
								min=".1"
								max=".9"
								step=".05"
								bind:value={config.split.train}
							/></label
						><label class="field-label"
							>Validation fraction<input
								type="number"
								min="0"
								max=".8"
								step=".05"
								bind:value={config.split.validation}
							/></label
						>
						<p class="hint">
							Test fraction: {number(1 - config.split.train - config.split.validation, 2)}. Split
							labels are exported with the data.
						</p>
						{#if config.split.mode === 'group'}<label class="field-label"
								>Group column<select bind:value={config.split.group_column}
									>{#each config.variables as v}<option value={v.id}>{v.name}</option
										>{/each}</select
								></label
							>{/if}{/if}
				</div>
			</details>
			<button class="json-link" onclick={openJSON}
				>Edit complete configuration <span>↗</span></button
			>
		</aside>

		<div class="main-panel">
			<nav class="workspace-tabs" aria-label="Workspace">
				{#each tabs as t}<button class:active={tab === t.id} onclick={() => (tab = t.id)}
						><span>{t.icon}</span>{t.label}{#if t.id === 'validate' && problemChecks}<small
								>{problemChecks}</small
							>{/if}</button
					>{/each}
				<div class="live-status" class:working={updating}>
					<i></i>{updating ? 'Updating…' : 'Live preview'}
				</div>
			</nav>
			{#if tab === 'explore'}
				<div class="explore-grid">
					<section class="plots">
						<div class="plot-title">
							<div>
								<span class="section-label">02 / WATCH THE SHAPE</span>
								<h2>
									{categorical ? 'Every category has a story.' : 'A distribution, made visible.'}
								</h2>
							</div>
							<button class="subtle" onclick={resample} disabled={updating}>↻ Resample</button>
						</div>
						{#if result?.domain}<DomainFigure {result} {secondaryData} />{/if}
						<div class="plot-toolbar">
							<div>
								<span class="legend-dot"></span>{#if result}<select
										class="plot-column"
										aria-label="Plot column"
										value={column}
										onchange={(event) => (displayColumn = event.currentTarget.value)}
										>{#each result.columns as field}<option value={field.name}>{field.name}</option
											>{/each}</select
									>{:else}<strong>{column || selected?.name}</strong>{/if}<span class="observations"
									>{result ? result.row_count.toLocaleString() : '—'} preview rows</span
								>
							</div>
							{#if !categorical && !massMode}<label
									>Bins <input type="range" min="10" max="70" step="1" bind:value={bins} /><span
										>{bins}</span
									></label
								>{/if}
						</div>
						{#if plottedModel}<p class="plot-context">{plottedModel}</p>{/if}
						<div class="main-chart" class:updating aria-busy={updating}>
							{#if categorical}<CategoryChart
									values={result?.rows.map((r) => r[column]) ?? []}
									name={column}
								/>{:else}<DistributionChart
									{values}
									name={column}
									{bins}
									density={result?.stats[column]?.density ?? []}
									mass={massMode}
								/>{/if}{#if updating && !result}<div class="loading-chart">
									<span></span>Sampling your first dataset…
								</div>{/if}
						</div>
						<div class="chart-caption">
							<span><i class="legend-dot"></i> Generated observations</span
							>{#if result?.stats[column]?.density?.length}<span
									><i class="dash-line"></i> {massMode ? 'Model PMF' : 'Model density'}</span
								>{/if}<span class="caption-right">Fixed seed while editing</span>
						</div>
						<div class="secondary-plots">
							<section>
								<div class="mini-title">
									<h3>
										{config.event.enabled
											? 'Cumulative arrivals'
											: config.timeseries.enabled
												? 'Sequence over time'
												: 'Empirical cumulative distribution'}
									</h3>
									<span
										>{config.event.enabled
											? 'EVENTS'
											: config.timeseries.enabled
												? 'TIME'
												: 'ECDF'}</span
									>
								</div>
								{#if config.event.enabled || config.timeseries.enabled}<RelationshipChart
										xValues={result?.rows.map((r, i) =>
											config.event.enabled ? Number(r.elapsed) : i
										) ?? []}
										yValues={result?.rows.map((r, i) =>
											config.event.enabled ? i + 1 : Number(r[column])
										) ?? []}
										xName={config.event.enabled ? 'elapsed seconds' : 'observation index'}
										yName={config.event.enabled ? 'cumulative event count' : column}
										mode="line"
									/>{:else}<RelationshipChart xValues={values} xName={column} mode="cdf" />{/if}
							</section>
							<section>
								<div class="mini-title">
									<h3>Relationships</h3>
									<span>PAIRS</span>
								</div>
								<div class="pair-select">
									<select aria-label="Scatter horizontal column" bind:value={scatterX}
										>{#each numericNames as name}<option value={name}>{name}</option>{/each}</select
									><span>×</span><select aria-label="Scatter vertical column" bind:value={scatterY}
										>{#each numericNames as name}<option value={name}>{name}</option>{/each}</select
									>
								</div>
								<RelationshipChart
									xValues={result?.rows.map((r) =>
										typeof r[xName] === 'number' ? Number(r[xName]) : NaN
									) ?? []}
									yValues={result?.rows.map((r) =>
										typeof r[yName] === 'number' ? Number(r[yName]) : NaN
									) ?? []}
									{xName}
									{yName}
									colorValues={result?.rows.map((r) => r.segment) ?? []}
								/>
							</section>
						</div>
						<div class="explore-note">
							<span>↳</span>
							<p>
								Move a parameter to see the mechanism change. <strong>Resample</strong> draws new observations
								from the same model.
							</p>
							<button
								onclick={() => {
									pinBaseline();
									tab = 'compare';
								}}>Pin & compare →</button
							>
						</div>
					</section>
					<SummaryPanel {result} {column} {baseline} />
				</div>
			{:else if tab === 'compare'}
				<section class="workspace-content">
					<div class="workspace-heading">
						<div>
							<span class="section-label">COMPARE EXPERIMENTS</span>
							<h2>See what your choices change.</h2>
						</div>
						<button class="primary small" onclick={pinBaseline} disabled={!result}
							>{baseline ? 'Replace baseline' : 'Pin current preview'}</button
						>
					</div>
					<p class="workspace-intro">
						Pin a result, then vary the generating parameters. Shared axes keep the two
						distributions comparable.
					</p>
					<div class="compare-key">
						<span><i class="legend-dot"></i>Current · seed {result?.config.seed ?? '—'}</span><span
							><i class="legend-dot coral"></i>{baseline
								? `Baseline · seed ${baseline.config.seed}`
								: 'No baseline pinned'}</span
						>{#if baseline}<button onclick={() => (baseline = null)}>Clear baseline</button>{/if}
					</div>
					{#if baselineValues.length && massMode !== baselineMassMode}<p class="hint">
							The current result and baseline use different probability scales (density versus point
							mass), so their shapes are not overlaid. Choose matching measurement types to compare
							shapes on one axis.
						</p>{/if}
					{#if categorical}<CategoryChart
							values={result?.rows.map((r) => r[column]) ?? []}
							name={column}
						/>{:else}<DistributionChart
							{values}
							baseline={comparableBaseline}
							mass={massMode}
							name={column}
							{bins}
						/>{/if}{#if baseline}<div class="comparison-metrics">
							{#each ['mean', 'std', 'median'] as metric}<div>
									<span>{metric === 'std' ? 'Standard deviation' : metric}</span><strong
										>{number(result?.stats[column]?.[metric as 'mean'])}</strong
									><small>Baseline {number(baseline.stats[column]?.[metric as 'mean'])}</small>
								</div>{/each}
						</div>{/if}
					<div class="sweep-section">
						<div class="workspace-heading">
							<div>
								<span class="section-label">PARAMETER SWEEP</span>
								<h3>One parameter. Several possible worlds.</h3>
							</div>
							<button class="subtle" onclick={runSweep} disabled={sweeping || !activeSweepParameter}
								>{sweeping ? `Running ${sweep.length}/${sweepSteps}…` : 'Run sweep →'}</button
							>
						</div>
						<p class="hint">
							Uses the same seed and up to 1,000 rows per step. Sample mean and spread are recorded
							at each setting.
						</p>
						<div class="sweep-controls">
							<label
								>Parameter<select bind:value={compareParameter}
									>{#each sweepParameters as p}<option value={p.name}>{p.label}</option
										>{/each}</select
								></label
							><label>From<input type="number" step="any" bind:value={sweepStart} /></label><label
								>To<input type="number" step="any" bind:value={sweepEnd} /></label
							><label>Steps<input type="number" min="2" max="9" bind:value={sweepSteps} /></label>
						</div>
						{#if sweep.length}<RelationshipChart
								xValues={sweep.map((s) => s.parameter)}
								yValues={sweep.map((s) => s.mean)}
								xName={activeSweepParameter?.label ?? 'parameter'}
								yName="observed sample mean"
								mode="line"
							/>
							<div class="sweep-values">
								{#each sweep as s}<div>
										<span>{number(s.parameter)}</span><strong>μ {number(s.mean)}</strong><small
											>σ {number(s.std)}</small
										>
									</div>{/each}
							</div>{/if}
					</div>
				</section>
			{:else if tab === 'validate'}
				<section class="workspace-content">
					<div class="workspace-heading">
						<div>
							<span class="section-label">VALIDATE THE RESULT</span>
							<h2>Know what the data actually did.</h2>
						</div>
						<span class="validation-badge">{cleanChecks} passed · {problemChecks} need review</span>
					</div>
					<p class="workspace-intro">
						Checks apply to result {result?.result_id.slice(0, 8) ?? '—'}. Statistical targets allow
						for finite-sample variation; preview-only checks are identified.
					</p>
					<div class="validation-list">
						{#each result?.validation ?? [] as check}<article class={`check ${check.status}`}>
								<span class="check-symbol"
									>{check.status === 'pass'
										? '✓'
										: check.status === 'fail'
											? '×'
											: check.status === 'warning'
												? '!'
												: '–'}</span
								>
								<div>
									<h3>{check.name.replaceAll('_', ' ')}</h3>
									<p>{check.message}</p>
									{#if check.target !== undefined || check.actual !== undefined}<small
											>{check.target !== undefined
												? `Target: ${typeof check.target === 'object' ? JSON.stringify(check.target) : check.target}`
												: ''}
											{check.actual !== undefined
												? ` · Observed: ${typeof check.actual === 'object' ? JSON.stringify(check.actual) : check.actual}`
												: ''}</small
										>{/if}
								</div>
								<span class="check-status">{check.status.replaceAll('_', ' ')}</span>
							</article>{/each}{#if !result}<p>
								Generate a preview to inspect validation results.
							</p>{/if}
					</div>
					{#if result?.warnings.length}<div class="warning-list">
							<h3>Model and preview limitations</h3>
							{#each result.warnings as warning}<p>↳ {warning}</p>{/each}
						</div>{/if}
					{#if result?.correlation?.columns.length}<div class="correlation-panel">
							<h3>Observed Pearson correlation</h3>
							<div class="correlation-scroll">
								<table>
									<thead
										><tr
											><th></th>{#each result.correlation.columns as name}<th>{name}</th>{/each}</tr
										></thead
									><tbody
										>{#each result.correlation.matrix as row, i}<tr
												><th>{result.correlation.columns[i]}</th>{#each row as r}<td
														style={`background:${typeof r === 'number' ? `rgba(8,127,128,${Math.abs(r) * 0.2})` : '#f3f4ef'}`}
														>{number(r, 2)}</td
													>{/each}</tr
											>{/each}</tbody
									>
								</table>
							</div>
							<p class="hint">
								These are achieved sample correlations. Latent copula parameters describe a
								different quantity.
							</p>
						</div>{/if}
					<details class="capability-details">
						<summary>Available engines & capability boundaries</summary
						>{#each capabilities.modules as m}<div>
								<strong>{m.label}</strong><span>{m.status}</span>
								<p>{m.description}</p>
							</div>{/each}
					</details>
					<details class="capability-coverage">
						<summary
							>Complete factor coverage · {capabilities.factor_coverage?.length ?? 0} requirements</summary
						>
						<p class="hint">
							The complete original inventory remains traceable. Implemented factors may have
							explicit combination limits; planned and unsupported entries are labelled.
						</p>
						<div class="coverage-controls">
							<input
								aria-label="Search capability factors"
								placeholder="Search factors, e.g. interarrival or privacy…"
								bind:value={coverageQuery}
							/><select aria-label="Filter capability status" bind:value={coverageStatus}
								><option value="all">All statuses</option><option value="implemented"
									>Implemented</option
								><option value="planned">Planned</option><option value="unsupported"
									>Unsupported</option
								></select
							>
						</div>
						<div class="coverage-results">
							{#each coverageFactors as factor}<article>
									<div>
										<strong>{factor.requirement}</strong><span
											class={`coverage-status ${factor.status}`}>{factor.status}</span
										>
									</div>
									<code>{factor.config_path}</code>
									<p>{factor.implementation}</p>
									{#if factor.limitations}<p class="factor-limitation">{factor.limitations}</p>{/if}
								</article>{/each}{#if !coverageFactors.length}<p class="hint">
									No matching factors.
								</p>{/if}
						</div>
					</details>
				</section>
			{:else}
				<section class="workspace-content">
					<div class="workspace-heading">
						<div>
							<span class="section-label">TAKE YOUR DATA WITH YOU</span>
							<h2>Ready for your next analysis.</h2>
						</div>
						<span class="csv-mark">CSV</span>
					</div>
					<p class="workspace-intro">
						Generate the full dataset, then download that exact result. The preview and full
						generation have independent result IDs.
					</p>
					<div class="export-options">
						<article>
							<span class="export-step">01</span>
							<h3>Generate the full dataset</h3>
							<p>
								<strong>{generationSizeLabel}</strong>, {config.variables.length} configured variables,
								seed {config.seed}.
							</p>
							<button class="primary" onclick={generateFull} disabled={jobRunning}
								>{jobRunning ? 'Generation in progress…' : 'Generate dataset ↗'}</button
							>{#if generationPending}<div class="job-progress" aria-live="polite">
									<progress
										aria-label="Full dataset generation in progress"
										style="width:100%; accent-color:#087f80"
									></progress>
									<p>
										Generating and saving the complete dataset… Duration depends on the rows and
										modules selected.
									</p>
									<button class="text-button" onclick={stopJob}>Cancel request</button>
								</div>{:else if job}<div class="job-progress" aria-live="polite">
									<div class="progress-track">
										<span
											style={`width:${Math.min(100, job.progress <= 1 ? job.progress * 100 : job.progress)}%`}
										></span>
									</div>
									<p>{job.stage} · {job.status}</p>
									{#if jobRunning}<button
											class="text-button"
											onclick={stopJob}
											disabled={generationCancelling}
											>{generationCancelling ? 'Cancelling…' : 'Cancel generation'}</button
										>{/if}{#if job.error}<p class="inline-error">{job.error}</p>{/if}
								</div>{/if}
						</article>
						<article>
							<span class="export-step">02</span>
							<h3>Download the completed result</h3>
							{#if fullResult || job?.status === 'completed'}{@const id =
									fullResult?.result_id ?? job?.result_id ?? ''}
								<p>
									<strong>{fullResult?.row_count.toLocaleString() ?? 'Completed'} rows</strong> · {fullResult
										?.config.name ?? config.name}<br />Result {id.slice(0, 12)}
								</p>
								<div class="download-buttons">
									<a class="primary" href={downloadUrl(id, 'csv', safeCSV)} download
										>↓ Dataset CSV</a
									><a
										class="secondary"
										href={downloadUrl(id, 'zip', safeCSV, includeTruth)}
										download>↓ Complete bundle</a
									>
								</div>
								<label class="checkbox-label"
									><input type="checkbox" bind:checked={safeCSV} /> Spreadsheet-safe string cells</label
								>
								<label class="checkbox-label"
									><input type="checkbox" bind:checked={includeTruth} /> Include clean values and diagnostic
									labels in the bundle</label
								>
								<p class="hint">
									The bundle includes the schema, configuration, summaries, validation and
									reproducibility manifest.
								</p>{:else}<p>
									Completed data will appear here, together with its validation and generation
									metadata.
								</p>
								<div class="empty-export">Your dataset is one generation away.</div>{/if}
						</article>
					</div>
					<div class="export-bottom">
						<div>
							<h3>Just exploring?</h3>
							<p>
								Download the exact visible preview or keep the configuration for another session.
							</p>
						</div>
						<div class="download-buttons">
							{#if result}<a
									class="secondary"
									href={downloadUrl(result.result_id, 'csv', safeCSV)}
									download>↓ Preview CSV</a
								>{/if}<button
								class="secondary"
								onclick={() =>
									saveTextFile('synthetic-data-config.json', JSON.stringify(config, null, 2))}
								>↓ Configuration JSON</button
							>
						</div>
					</div>
					{#if fullResult}<details class="manifest-details">
							<summary>Generation provenance</summary>
							<pre>{JSON.stringify(
									{
										result_id: fullResult.result_id,
										config_hash: fullResult.config_hash,
										rows: fullResult.row_count,
										seed: fullResult.config.seed,
										engine: fullResult.engine_version,
										created_at: fullResult.created_at
									},
									null,
									2
								)}</pre>
						</details>{/if}
				</section>
			{/if}

			<section class="data-section">
				<div class="data-heading">
					<div>
						<span class="section-label">03 / INSPECT THE OBSERVATIONS</span>
						<h3>Your generated data <span>{inspectedTable.columns.length} columns</span></h3>
						{#if Object.keys(result?.tables ?? {}).length}<div class="table-tabs">
								<button
									class:active={tableName === 'main'}
									onclick={() => {
										tableName = 'main';
										tablePage = 0;
										tableFilter = '';
									}}>Main table</button
								>{#each Object.keys(result?.tables ?? {}) as name}<button
										class:active={tableName === name}
										onclick={() => {
											tableName = name;
											tablePage = 0;
											tableFilter = '';
										}}
										>{name}
										<small>{result?.tables?.[name].row_count.toLocaleString()}</small></button
									>{/each}
							</div>{/if}
					</div>
					<div class="data-actions">
						<label class="table-search"
							><span>⌕</span><input
								aria-label="Filter preview rows"
								placeholder="Filter rows…"
								bind:value={tableFilter}
								oninput={() => (tablePage = 0)}
							/></label
						>{#if result}<a
								href={downloadUrl(result.result_id, 'csv', false, false, tableName)}
								download
								title="Download this exact preview">↓ CSV</a
							>{/if}
					</div>
				</div>
				<div class="data-scroll">
					<table>
						<thead
							><tr
								><th class="row-index">#</th>{#each inspectedTable.columns as c}<th
										><span class="column-type"
											>{c.type.includes('str') || c.type === 'categorical' ? 'abc' : '123'}</span
										>{c.name}<small>{c.role}</small></th
									>{/each}</tr
							></thead
						><tbody
							>{#each tableRows as row, i}<tr
									><td class="row-index">{tablePage * 15 + i + 1}</td
									>{#each inspectedTable.columns as c}<td
											class:null-cell={row[c.name] === null}
											class:target-cell={c.role === 'target'}>{cell(row[c.name])}</td
										>{/each}</tr
								>{/each}{#if !tableRows.length}<tr
									><td colspan={inspectedTable.columns.length + 1} class="table-empty"
										>{updating ? 'Generating observations…' : 'No matching observations.'}</td
									></tr
								>{/if}</tbody
						>
					</table>
				</div>
				<div class="table-footer">
					<span
						>{result
							? `${filteredRows.length.toLocaleString()} displayed ${tableName === 'main' ? 'preview' : tableName} rows${tableFilter ? ' matching filter' : ''} of ${inspectedTable.row_count.toLocaleString()} · null = ∅`
							: 'Waiting for the generator'}</span
					>
					<div>
						<button
							aria-label="Previous data page"
							disabled={!tablePage}
							onclick={() => tablePage--}>←</button
						><span>{tablePage + 1} / {Math.max(1, Math.ceil(filteredRows.length / 15))}</span
						><button
							aria-label="Next data page"
							disabled={(tablePage + 1) * 15 >= filteredRows.length}
							onclick={() => tablePage++}>→</button
						>
					</div>
				</div>
			</section>
		</div>
	</div>
	<footer class="lab-footer">
		<span><strong>SYNTHETIC DATA LAB</strong> / Designed for experiments that you can explain.</span
		><span>Seeded generation <i>·</i> Visible assumptions <i>·</i> Portable data</span>
	</footer>
</div>

{#if jsonOpen}
	<dialog
		bind:this={jsonDialog}
		class="json-dialog"
		aria-modal="true"
		aria-labelledby="json-title"
		oncancel={() => (jsonOpen = false)}
	>
		<div class="workspace-heading">
			<div>
				<span class="section-label">VERSIONED EXPERIMENT SPECIFICATION</span>
				<h2 id="json-title">Edit configuration</h2>
			</div>
			<button
				class="icon-button"
				aria-label="Close configuration editor"
				onclick={() => (jsonOpen = false)}>×</button
			>
		</div>
		<p class="hint">
			Every supported setting is recorded here. The generator validates the configuration before
			sampling.
		</p>
		<textarea aria-label="Experiment configuration JSON" bind:value={jsonText} spellcheck="false"
		></textarea>{#if jsonError}<p class="inline-error">{jsonError}</p>{/if}
		<div class="dialog-actions">
			<button class="secondary" onclick={() => (jsonOpen = false)}>Cancel</button><button
				class="primary"
				disabled={jsonSaving}
				onclick={applyJSON}>{jsonSaving ? 'Validating…' : 'Apply configuration'}</button
			>
		</div>
	</dialog>
{/if}
