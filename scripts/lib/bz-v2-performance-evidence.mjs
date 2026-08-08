const ROOT_KEYS = Object.freeze([
	'schemaVersion',
	'kind',
	'engineVersion',
	'displayVersion',
	'measuredAt',
	'reports'
]);

const REPORT_KEYS = Object.freeze([
	'browser',
	'gpu',
	'stateGrid',
	'displayResolution',
	'durationSeconds',
	'medianFps',
	'medianStepsPerSecond',
	'telemetryHz',
	'fullStateReadbacks',
	'scientificTextureBytes',
	'displayTextureBytes',
	'notes'
]);

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function record(value, label) {
	assert(
		value !== null && typeof value === 'object' && !Array.isArray(value),
		`${label} must be an object.`
	);
	return value;
}

function exactKeys(value, expected, label) {
	const actual = Object.keys(value).sort();
	const keys = [...expected].sort();
	assert(
		actual.length === keys.length && actual.every((key, index) => key === keys[index]),
		`${label} keys differ from the versioned contract.`
	);
}

function text(value, label) {
	assert(typeof value === 'string' && value.trim().length > 0, `${label} must be non-empty text.`);
	return value;
}

function finite(value, label, minimum = 0) {
	assert(
		typeof value === 'number' && Number.isFinite(value) && value >= minimum,
		`${label} must be finite and >= ${minimum}.`
	);
	return value;
}

function safeInteger(value, label, minimum = 0) {
	assert(
		Number.isSafeInteger(value) && value >= minimum,
		`${label} must be a safe integer >= ${minimum}.`
	);
	return value;
}

function isoTimestamp(value, label) {
	const result = text(value, label);
	assert(
		Number.isFinite(Date.parse(result)) && new Date(result).toISOString() === result,
		`${label} must be an ISO-8601 UTC timestamp.`
	);
	return result;
}

function performanceReport(value, index) {
	const label = `BZ V2 performance report ${index}`;
	const source = record(value, label);
	exactKeys(source, REPORT_KEYS, label);
	const report = {
		browser: text(source.browser, `${label} browser`),
		gpu: text(source.gpu, `${label} GPU`),
		stateGrid: safeInteger(source.stateGrid, `${label} state grid`, 2),
		displayResolution: text(source.displayResolution, `${label} display resolution`),
		durationSeconds: finite(source.durationSeconds, `${label} duration`, 30),
		medianFps: finite(source.medianFps, `${label} median FPS`),
		medianStepsPerSecond: finite(source.medianStepsPerSecond, `${label} median steps per second`),
		telemetryHz: finite(source.telemetryHz, `${label} telemetry frequency`),
		fullStateReadbacks: safeInteger(source.fullStateReadbacks, `${label} full-state readbacks`),
		scientificTextureBytes: safeInteger(
			source.scientificTextureBytes,
			`${label} scientific texture bytes`
		),
		displayTextureBytes: safeInteger(source.displayTextureBytes, `${label} display texture bytes`),
		notes: text(source.notes, `${label} notes`)
	};
	return report;
}

/**
 * Validate the explicit browser measurement envelope consumed by the V2
 * manifest generator. Unknown or missing fields are rejected deliberately.
 */
export function validateBZV2PerformanceEvidence(value, expected) {
	const source = record(value, 'BZ V2 performance evidence');
	exactKeys(source, ROOT_KEYS, 'BZ V2 performance evidence');
	assert(source.schemaVersion === 1, 'BZ V2 performance evidence schema version differs.');
	assert(source.kind === 'bz-v2-browser-performance', 'BZ V2 performance evidence kind differs.');
	assert(
		source.engineVersion === expected.engineVersion,
		'BZ V2 performance evidence engine version differs.'
	);
	assert(
		source.displayVersion === expected.displayVersion,
		'BZ V2 performance evidence display version differs.'
	);
	const measuredAt = isoTimestamp(source.measuredAt, 'BZ V2 performance measurement time');
	assert(Array.isArray(source.reports), 'BZ V2 performance reports must be an array.');
	assert(source.reports.length > 0, 'BZ V2 performance evidence must contain a measured report.');
	const reports = source.reports.map(performanceReport);
	const signatures = new Set();
	for (const report of reports) {
		const signature = `${report.browser}\0${report.gpu}\0${report.stateGrid}\0${report.displayResolution}`;
		assert(!signatures.has(signature), 'BZ V2 performance evidence duplicates a measured runtime.');
		signatures.add(signature);
	}
	return { measuredAt, reports };
}

export const BZ_V2_PERFORMANCE_REPORT_KEYS = REPORT_KEYS;
