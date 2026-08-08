import { assertValidBZFieldState } from '../initial-conditions';
import { orderedBZInterventions } from '../interventions';
import type { BZFieldState, BZIntervention, BZSetup } from '../types';
import { assertValidBZSetup, cloneBZSetup } from '../validation';
import {
	BZ_V2_CHECKPOINT_VERSION,
	BZ_V2_ENGINE_VERSION,
	type BZCheckpointDescriptorV2
} from '../v2-types';

/**
 * BZCP v1 binary layout (all multi-byte scalars are little-endian):
 *
 *   0..7    magic: `BZCP\r\n\x1a\n`
 *   8..9    codec version (uint16)
 *   10..11  fixed-header byte length (uint16)
 *   12..15  endian marker 0x01020304 (uint32)
 *   16..19  canonical provenance JSON byte length (uint32)
 *   20..23  field payload byte length (uint32)
 *   24..27  width (uint32)
 *   28..31  height (uint32)
 *   ...     UTF-8 canonical provenance JSON
 *   ...     row-major u float32, v float32, domainMask uint8, activeMask uint8
 *   ...     SHA-256(header + metadata + payload), 32 raw bytes
 *
 * The trailer authenticates the complete stored representation. The metadata
 * also carries hashes of every field and of the canonical setup/intervention
 * documents so a decoder can report a provenance mismatch independently from
 * file corruption. No native typed-array byte order is used by the codec.
 */

export const BZ_CHECKPOINT_ENCODING_V1 = 'bzcp-f32le-v1' as const;
export const BZ_CHECKPOINT_HEADER_BYTES = 32 as const;
export const BZ_CHECKPOINT_TRAILER_BYTES = 32 as const;
export const BZ_CHECKPOINT_ENDIAN_MARKER = 0x01020304 as const;
export const BZ_CHECKPOINT_MAX_METADATA_BYTES = 1_000_000 as const;

export const BZ_CHECKPOINT_MAGIC = Object.freeze([
	0x42, 0x5a, 0x43, 0x50, 0x0d, 0x0a, 0x1a, 0x0a
] as const);

const CHECKPOINT_METADATA_SCHEMA = 'bz-checkpoint-provenance-v1' as const;
const CHECKSUM_ALGORITHM = 'sha256' as const;
const CPU_STATE_CHECKSUM_ALGORITHM = 'sha256-f64le-state-v1' as const;
const BROWSER_STATE_CHECKSUM_ALGORITHM = 'sha256-f32le-state-v1' as const;
const CANONICAL_JSON_CHECKSUM_ALGORITHM = 'sha256-canonical-json-v1' as const;
const HEX_SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;

export interface BZStoredCheckpointStateV1 {
	readonly width: number;
	readonly height: number;
	readonly u: Float32Array;
	readonly v: Float32Array;
	readonly domainMask: Uint8Array;
	readonly activeMask: Uint8Array;
}

export interface BZCheckpointChecksumsV1 {
	readonly algorithm: typeof CHECKSUM_ALGORITHM;
	readonly cpuFloat64State: string;
	readonly browserFloat32State: string;
	readonly u: string;
	readonly v: string;
	readonly domainMask: string;
	readonly activeMask: string;
	readonly setupCanonicalJson: string;
	readonly interventionLogCanonicalJson: string;
}

export interface BZCheckpointMetadataV1 {
	readonly schema: typeof CHECKPOINT_METADATA_SCHEMA;
	readonly version: typeof BZ_V2_CHECKPOINT_VERSION;
	readonly encoding: typeof BZ_CHECKPOINT_ENCODING_V1;
	readonly checkpointId: string;
	readonly sourcePresetId: string;
	readonly width: number;
	readonly height: number;
	readonly setup: BZSetup;
	readonly seed: string;
	readonly interventions: readonly BZIntervention[];
	readonly warmupStep: number;
	readonly modelTime: number;
	readonly engineVersion: typeof BZ_V2_ENGINE_VERSION;
	readonly modelVersion: BZSetup['modelVersion'];
	readonly equationsId: BZSetup['equationsId'];
	readonly validationRecordId: string;
	readonly generatedBy: string;
	readonly generatedAt: string;
	readonly layout: {
		readonly cellOrder: 'row-major';
		readonly fields: readonly ['u', 'v', 'domainMask', 'activeMask'];
		readonly u: 'float32-le';
		readonly v: 'float32-le';
		readonly domainMask: 'uint8';
		readonly activeMask: 'uint8';
	};
	readonly checksumAlgorithms: {
		readonly fileAndFields: typeof CHECKSUM_ALGORITHM;
		readonly cpuReferenceState: typeof CPU_STATE_CHECKSUM_ALGORITHM;
		readonly browserState: typeof BROWSER_STATE_CHECKSUM_ALGORITHM;
		readonly canonicalDocuments: typeof CANONICAL_JSON_CHECKSUM_ALGORITHM;
	};
	readonly checksums: BZCheckpointChecksumsV1;
}

export interface CreateBZCheckpointV1Options {
	readonly checkpointId: string;
	readonly sourcePresetId: string;
	readonly setup: Readonly<BZSetup>;
	readonly interventions: readonly Readonly<BZIntervention>[];
	readonly warmupStep: number;
	/** Exact Float64 reference state before conversion to the browser representation. */
	readonly cpuFloat64State: Readonly<BZFieldState>;
	readonly validationRecordId: string;
	readonly generatedBy: string;
	readonly generatedAt?: string;
}

export interface EncodedBZCheckpointV1 {
	readonly bytes: Uint8Array;
	readonly sha256: string;
	readonly metadata: BZCheckpointMetadataV1;
	readonly state: BZStoredCheckpointStateV1;
}

export interface BZCheckpointExpectationsV1 {
	readonly checkpointId?: string;
	readonly sourcePresetId?: string;
	readonly setup?: Readonly<BZSetup>;
	readonly interventions?: readonly Readonly<BZIntervention>[];
	readonly engineVersion?: typeof BZ_V2_ENGINE_VERSION;
	readonly validationRecordId?: string;
	readonly cpuFloat64StateSha256?: string;
	readonly fileSha256?: string;
}

export interface DecodedBZCheckpointV1 {
	readonly sha256: string;
	readonly metadata: BZCheckpointMetadataV1;
	readonly state: BZStoredCheckpointStateV1;
}

/**
 * Rich manifest record derived from checkpoint bytes. It extends the shared
 * descriptor with the provenance fields the public calibration document must
 * expose without requiring a browser to parse the binary metadata first.
 */
export interface BZCheckpointProvenanceDescriptorV1 extends BZCheckpointDescriptorV2 {
	readonly sourcePresetId: string;
	readonly setup: BZSetup;
	readonly seed: string;
	readonly interventions: readonly BZIntervention[];
	readonly browserStateSha256: string;
	readonly modelVersion: BZSetup['modelVersion'];
	readonly equationsId: BZSetup['equationsId'];
	readonly validationRecordId: string;
}

interface EncodedPayload {
	readonly bytes: Uint8Array;
	readonly state: BZStoredCheckpointStateV1;
	readonly ranges: {
		readonly u: readonly [number, number];
		readonly v: readonly [number, number];
		readonly domainMask: readonly [number, number];
		readonly activeMask: readonly [number, number];
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertSafeId(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || !SAFE_ID.test(value)) {
		throw new RangeError(`${label} must be a lowercase stable identifier.`);
	}
}

function assertSha256(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || !HEX_SHA256.test(value)) {
		throw new RangeError(`${label} must be a lowercase SHA-256 digest.`);
	}
}

function assertExactKeys(
	value: Readonly<Record<string, unknown>>,
	expected: readonly string[],
	label: string
): void {
	const actual = Object.keys(value).sort();
	const canonical = [...expected].sort();
	if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
		throw new RangeError(`${label} does not match the versioned BZCP contract.`);
	}
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
	if (
		typeof value !== 'string' ||
		!Number.isFinite(Date.parse(value)) ||
		new Date(value).toISOString() !== value
	) {
		throw new RangeError(`${label} must be an ISO-8601 UTC timestamp.`);
	}
}

function canonicalize(value: unknown, ancestors: ReadonlySet<object> = new Set()): unknown {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
	if (typeof value === 'number') {
		if (!Number.isFinite(value))
			throw new RangeError('Canonical JSON cannot contain non-finite numbers.');
		return Object.is(value, -0) ? 0 : value;
	}
	if (typeof value !== 'object') {
		throw new TypeError('Canonical JSON contains an unsupported value.');
	}
	if (ancestors.has(value)) throw new TypeError('Canonical JSON cannot contain cycles.');
	const nextAncestors = new Set(ancestors);
	nextAncestors.add(value);
	if (Array.isArray(value)) return value.map((entry) => canonicalize(entry, nextAncestors));
	const source = value as Record<string, unknown>;
	const result: Record<string, unknown> = {};
	for (const key of Object.keys(source).sort()) {
		const entry = source[key];
		if (entry === undefined)
			throw new TypeError('Canonical JSON cannot contain undefined properties.');
		result[key] = canonicalize(entry, nextAncestors);
	}
	return result;
}

/** Stable JSON used by both checkpoint provenance and calibration tooling. */
export function canonicalBZJSONStringify(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

function utf8(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}

function bytesToHex(bytes: Uint8Array): string {
	let result = '';
	for (const byte of bytes) result += byte.toString(16).padStart(2, '0');
	return result;
}

async function sha256Digest(bytes: Uint8Array): Promise<Uint8Array> {
	if (!globalThis.crypto?.subtle) {
		throw new Error('Web Crypto SHA-256 is required for BZ checkpoint verification.');
	}
	// A fresh ArrayBuffer avoids SharedArrayBuffer/BufferSource incompatibilities
	// and makes the digest independent of the caller's subsequent mutations.
	const stable = Uint8Array.from(bytes);
	return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', stable));
}

export async function sha256BZBytes(bytes: Uint8Array): Promise<string> {
	return bytesToHex(await sha256Digest(bytes));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
	return difference === 0;
}

function encodeReferenceStateF64(state: Readonly<BZFieldState>): Uint8Array {
	assertValidBZFieldState(state);
	const cells = state.size * state.size;
	const bytes = new Uint8Array(cells * 18);
	const view = new DataView(bytes.buffer);
	for (let index = 0; index < cells; index += 1) {
		const u = state.u[index];
		const v = state.v[index];
		if (!Number.isFinite(u) || !Number.isFinite(v)) {
			throw new RangeError('A checkpoint cannot contain non-finite field values.');
		}
		view.setFloat64(index * 8, u, true);
		view.setFloat64(cells * 8 + index * 8, v, true);
	}
	bytes.set(state.domainMask, cells * 16);
	bytes.set(state.mask, cells * 17);
	return bytes;
}

/** SHA-256 over row-major u/v Float64LE followed by domain/active uint8 masks. */
export async function checksumBZFloat64State(state: Readonly<BZFieldState>): Promise<string> {
	return sha256BZBytes(encodeReferenceStateF64(state));
}

function encodeBrowserPayload(state: Readonly<BZFieldState>): EncodedPayload {
	assertValidBZFieldState(state);
	const width = state.size;
	const height = state.size;
	const cells = width * height;
	const uStart = 0;
	const vStart = cells * 4;
	const domainStart = cells * 8;
	const activeStart = cells * 9;
	const bytes = new Uint8Array(cells * 10);
	const view = new DataView(bytes.buffer);
	const u = new Float32Array(cells);
	const v = new Float32Array(cells);
	for (let index = 0; index < cells; index += 1) {
		const sourceU = state.u[index];
		const sourceV = state.v[index];
		if (!Number.isFinite(sourceU) || !Number.isFinite(sourceV)) {
			throw new RangeError('A checkpoint cannot contain non-finite field values.');
		}
		u[index] = Math.fround(sourceU);
		v[index] = Math.fround(sourceV);
		view.setFloat32(uStart + index * 4, u[index], true);
		view.setFloat32(vStart + index * 4, v[index], true);
	}
	const domainMask = new Uint8Array(state.domainMask);
	const activeMask = new Uint8Array(state.mask);
	bytes.set(domainMask, domainStart);
	bytes.set(activeMask, activeStart);
	return {
		bytes,
		state: { width, height, u, v, domainMask, activeMask },
		ranges: {
			u: [uStart, vStart],
			v: [vStart, domainStart],
			domainMask: [domainStart, activeStart],
			activeMask: [activeStart, bytes.length]
		}
	};
}

function assertStoredState(state: Readonly<BZStoredCheckpointStateV1>): void {
	if (!Number.isInteger(state.width) || !Number.isInteger(state.height) || state.width < 2) {
		throw new RangeError('Checkpoint dimensions are invalid.');
	}
	if (state.width !== state.height) {
		throw new RangeError('The BZ reference engine requires a square checkpoint.');
	}
	const cells = state.width * state.height;
	if (
		state.u.length !== cells ||
		state.v.length !== cells ||
		state.domainMask.length !== cells ||
		state.activeMask.length !== cells
	) {
		throw new RangeError('Checkpoint field arrays do not match its dimensions.');
	}
	for (let index = 0; index < cells; index += 1) {
		if (!Number.isFinite(state.u[index]) || !Number.isFinite(state.v[index])) {
			throw new RangeError('Checkpoint fields contain a non-finite value.');
		}
		if (state.domainMask[index] > 1 || state.activeMask[index] > 1) {
			throw new RangeError('Checkpoint masks must contain only zero or one.');
		}
		if (state.activeMask[index] && !state.domainMask[index]) {
			throw new RangeError('Checkpoint active mask extends outside the domain mask.');
		}
	}
}

function checkpointLayout(): BZCheckpointMetadataV1['layout'] {
	return {
		cellOrder: 'row-major',
		fields: ['u', 'v', 'domainMask', 'activeMask'],
		u: 'float32-le',
		v: 'float32-le',
		domainMask: 'uint8',
		activeMask: 'uint8'
	};
}

function checksumAlgorithms(): BZCheckpointMetadataV1['checksumAlgorithms'] {
	return {
		fileAndFields: CHECKSUM_ALGORITHM,
		cpuReferenceState: CPU_STATE_CHECKSUM_ALGORITHM,
		browserState: BROWSER_STATE_CHECKSUM_ALGORITHM,
		canonicalDocuments: CANONICAL_JSON_CHECKSUM_ALGORITHM
	};
}

export async function encodeBZCheckpointV1(
	options: Readonly<CreateBZCheckpointV1Options>
): Promise<EncodedBZCheckpointV1> {
	assertSafeId(options.checkpointId, 'Checkpoint id');
	assertSafeId(options.sourcePresetId, 'Source preset id');
	assertSafeId(options.validationRecordId, 'Validation record id');
	assertValidBZSetup(options.setup);
	if (!Number.isSafeInteger(options.warmupStep) || options.warmupStep < 0) {
		throw new RangeError('Checkpoint warmup step must be a non-negative safe integer.');
	}
	if (
		typeof options.generatedBy !== 'string' ||
		options.generatedBy.length < 1 ||
		options.generatedBy.length > 256
	) {
		throw new RangeError('Checkpoint generator identity is invalid.');
	}
	const generatedAt = options.generatedAt ?? new Date().toISOString();
	assertTimestamp(generatedAt, 'Checkpoint generation time');
	assertValidBZFieldState(options.cpuFloat64State);
	if (options.cpuFloat64State.size !== options.setup.gridSize) {
		throw new RangeError('Checkpoint reference state and setup grid sizes differ.');
	}
	const setup = cloneBZSetup(options.setup);
	const interventions = orderedBZInterventions(options.interventions);
	const payload = encodeBrowserPayload(options.cpuFloat64State);
	const setupBytes = utf8(canonicalBZJSONStringify(setup));
	const interventionBytes = utf8(canonicalBZJSONStringify(interventions));
	const [
		cpuFloat64State,
		browserFloat32State,
		u,
		v,
		domainMask,
		activeMask,
		setupCanonicalJson,
		interventionLogCanonicalJson
	] = await Promise.all([
		checksumBZFloat64State(options.cpuFloat64State),
		sha256BZBytes(payload.bytes),
		sha256BZBytes(payload.bytes.subarray(...payload.ranges.u)),
		sha256BZBytes(payload.bytes.subarray(...payload.ranges.v)),
		sha256BZBytes(payload.bytes.subarray(...payload.ranges.domainMask)),
		sha256BZBytes(payload.bytes.subarray(...payload.ranges.activeMask)),
		sha256BZBytes(setupBytes),
		sha256BZBytes(interventionBytes)
	]);
	const metadata: BZCheckpointMetadataV1 = {
		schema: CHECKPOINT_METADATA_SCHEMA,
		version: BZ_V2_CHECKPOINT_VERSION,
		encoding: BZ_CHECKPOINT_ENCODING_V1,
		checkpointId: options.checkpointId,
		sourcePresetId: options.sourcePresetId,
		width: payload.state.width,
		height: payload.state.height,
		setup,
		seed: setup.seed,
		interventions,
		warmupStep: options.warmupStep,
		modelTime: options.warmupStep * setup.timestep,
		engineVersion: BZ_V2_ENGINE_VERSION,
		modelVersion: setup.modelVersion,
		equationsId: setup.equationsId,
		validationRecordId: options.validationRecordId,
		generatedBy: options.generatedBy,
		generatedAt,
		layout: checkpointLayout(),
		checksumAlgorithms: checksumAlgorithms(),
		checksums: {
			algorithm: CHECKSUM_ALGORITHM,
			cpuFloat64State,
			browserFloat32State,
			u,
			v,
			domainMask,
			activeMask,
			setupCanonicalJson,
			interventionLogCanonicalJson
		}
	};
	const metadataBytes = utf8(canonicalBZJSONStringify(metadata));
	if (metadataBytes.length > BZ_CHECKPOINT_MAX_METADATA_BYTES) {
		throw new RangeError('Checkpoint metadata exceeds the supported size.');
	}
	const trailerOffset = BZ_CHECKPOINT_HEADER_BYTES + metadataBytes.length + payload.bytes.length;
	const bytes = new Uint8Array(trailerOffset + BZ_CHECKPOINT_TRAILER_BYTES);
	bytes.set(BZ_CHECKPOINT_MAGIC, 0);
	const header = new DataView(bytes.buffer, 0, BZ_CHECKPOINT_HEADER_BYTES);
	header.setUint16(8, BZ_V2_CHECKPOINT_VERSION, true);
	header.setUint16(10, BZ_CHECKPOINT_HEADER_BYTES, true);
	header.setUint32(12, BZ_CHECKPOINT_ENDIAN_MARKER, true);
	header.setUint32(16, metadataBytes.length, true);
	header.setUint32(20, payload.bytes.length, true);
	header.setUint32(24, payload.state.width, true);
	header.setUint32(28, payload.state.height, true);
	bytes.set(metadataBytes, BZ_CHECKPOINT_HEADER_BYTES);
	bytes.set(payload.bytes, BZ_CHECKPOINT_HEADER_BYTES + metadataBytes.length);
	const digest = await sha256Digest(bytes.subarray(0, trailerOffset));
	bytes.set(digest, trailerOffset);
	return { bytes, sha256: bytesToHex(digest), metadata, state: payload.state };
}

function decodeMetadata(bytes: Uint8Array): BZCheckpointMetadataV1 {
	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		throw new TypeError('Checkpoint metadata is not valid UTF-8.');
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new TypeError('Checkpoint metadata is not valid JSON.');
	}
	if (!isRecord(parsed)) throw new TypeError('Checkpoint metadata must be an object.');
	if (canonicalBZJSONStringify(parsed) !== text) {
		throw new RangeError('Checkpoint metadata is not canonical JSON.');
	}
	assertExactKeys(
		parsed,
		[
			'schema',
			'version',
			'encoding',
			'checkpointId',
			'sourcePresetId',
			'width',
			'height',
			'setup',
			'seed',
			'interventions',
			'warmupStep',
			'modelTime',
			'engineVersion',
			'modelVersion',
			'equationsId',
			'validationRecordId',
			'generatedBy',
			'generatedAt',
			'layout',
			'checksumAlgorithms',
			'checksums'
		],
		'Checkpoint metadata'
	);
	if (
		parsed.schema !== CHECKPOINT_METADATA_SCHEMA ||
		parsed.version !== BZ_V2_CHECKPOINT_VERSION ||
		parsed.encoding !== BZ_CHECKPOINT_ENCODING_V1
	) {
		throw new RangeError('Checkpoint metadata version is unsupported.');
	}
	assertSafeId(parsed.checkpointId, 'Checkpoint id');
	assertSafeId(parsed.sourcePresetId, 'Source preset id');
	assertSafeId(parsed.validationRecordId, 'Validation record id');
	const width = parsed.width;
	const height = parsed.height;
	if (
		typeof width !== 'number' ||
		typeof height !== 'number' ||
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width < 2
	) {
		throw new RangeError('Checkpoint metadata dimensions are invalid.');
	}
	if (!isRecord(parsed.setup)) throw new TypeError('Checkpoint setup is missing.');
	const setup = parsed.setup as unknown as BZSetup;
	assertValidBZSetup(setup);
	if (setup.gridSize !== width || width !== height) {
		throw new RangeError('Checkpoint setup and metadata dimensions differ.');
	}
	if (parsed.seed !== setup.seed) throw new RangeError('Checkpoint seed does not match its setup.');
	if (!Array.isArray(parsed.interventions)) {
		throw new TypeError('Checkpoint intervention log is missing.');
	}
	const interventions = orderedBZInterventions(parsed.interventions as unknown as BZIntervention[]);
	if (canonicalBZJSONStringify(interventions) !== canonicalBZJSONStringify(parsed.interventions)) {
		throw new RangeError('Checkpoint interventions are not in canonical application order.');
	}
	if (!Number.isSafeInteger(parsed.warmupStep) || (parsed.warmupStep as number) < 0) {
		throw new RangeError('Checkpoint warmup step is invalid.');
	}
	const warmupStep = parsed.warmupStep as number;
	if (
		typeof parsed.modelTime !== 'number' ||
		!Number.isFinite(parsed.modelTime) ||
		!Object.is(parsed.modelTime, warmupStep * setup.timestep)
	) {
		throw new RangeError('Checkpoint model time is inconsistent with step × timestep.');
	}
	if (
		parsed.engineVersion !== BZ_V2_ENGINE_VERSION ||
		parsed.modelVersion !== setup.modelVersion ||
		parsed.equationsId !== setup.equationsId
	) {
		throw new RangeError('Checkpoint engine or model provenance is inconsistent.');
	}
	if (
		typeof parsed.generatedBy !== 'string' ||
		parsed.generatedBy.length < 1 ||
		parsed.generatedBy.length > 256
	) {
		throw new RangeError('Checkpoint generator identity is invalid.');
	}
	assertTimestamp(parsed.generatedAt, 'Checkpoint generation time');
	if (!isRecord(parsed.layout)) throw new TypeError('Checkpoint layout is missing.');
	assertExactKeys(
		parsed.layout,
		['cellOrder', 'fields', 'u', 'v', 'domainMask', 'activeMask'],
		'Checkpoint layout'
	);
	if (
		parsed.layout.cellOrder !== 'row-major' ||
		!Array.isArray(parsed.layout.fields) ||
		parsed.layout.fields.length !== 4 ||
		parsed.layout.fields.some(
			(field, index) => field !== ['u', 'v', 'domainMask', 'activeMask'][index]
		) ||
		parsed.layout.u !== 'float32-le' ||
		parsed.layout.v !== 'float32-le' ||
		parsed.layout.domainMask !== 'uint8' ||
		parsed.layout.activeMask !== 'uint8'
	) {
		throw new RangeError('Checkpoint field layout is unsupported.');
	}
	if (!isRecord(parsed.checksumAlgorithms)) {
		throw new TypeError('Checkpoint checksum algorithm declaration is missing.');
	}
	assertExactKeys(
		parsed.checksumAlgorithms,
		['fileAndFields', 'cpuReferenceState', 'browserState', 'canonicalDocuments'],
		'Checkpoint checksum algorithms'
	);
	if (
		parsed.checksumAlgorithms.fileAndFields !== CHECKSUM_ALGORITHM ||
		parsed.checksumAlgorithms.cpuReferenceState !== CPU_STATE_CHECKSUM_ALGORITHM ||
		parsed.checksumAlgorithms.browserState !== BROWSER_STATE_CHECKSUM_ALGORITHM ||
		parsed.checksumAlgorithms.canonicalDocuments !== CANONICAL_JSON_CHECKSUM_ALGORITHM
	) {
		throw new RangeError('Checkpoint checksum algorithms are unsupported.');
	}
	if (!isRecord(parsed.checksums)) throw new TypeError('Checkpoint checksums are missing.');
	assertExactKeys(
		parsed.checksums,
		[
			'algorithm',
			'cpuFloat64State',
			'browserFloat32State',
			'u',
			'v',
			'domainMask',
			'activeMask',
			'setupCanonicalJson',
			'interventionLogCanonicalJson'
		],
		'Checkpoint checksums'
	);
	if (parsed.checksums.algorithm !== CHECKSUM_ALGORITHM) {
		throw new RangeError('Checkpoint field checksum algorithm is unsupported.');
	}
	for (const field of [
		'cpuFloat64State',
		'browserFloat32State',
		'u',
		'v',
		'domainMask',
		'activeMask',
		'setupCanonicalJson',
		'interventionLogCanonicalJson'
	] as const) {
		assertSha256(parsed.checksums[field], `Checkpoint ${field} checksum`);
	}
	return {
		...(parsed as unknown as BZCheckpointMetadataV1),
		setup: cloneBZSetup(setup),
		interventions
	};
}

function decodePayload(
	bytes: Uint8Array,
	width: number,
	height: number
): BZStoredCheckpointStateV1 {
	const cells = width * height;
	if (bytes.length !== cells * 10)
		throw new RangeError('Checkpoint payload length is inconsistent.');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const u = new Float32Array(cells);
	const v = new Float32Array(cells);
	for (let index = 0; index < cells; index += 1) {
		u[index] = view.getFloat32(index * 4, true);
		v[index] = view.getFloat32(cells * 4 + index * 4, true);
	}
	const domainStart = cells * 8;
	const activeStart = cells * 9;
	const state: BZStoredCheckpointStateV1 = {
		width,
		height,
		u,
		v,
		domainMask: new Uint8Array(bytes.subarray(domainStart, activeStart)),
		activeMask: new Uint8Array(bytes.subarray(activeStart))
	};
	assertStoredState(state);
	return state;
}

async function assertDecodedChecksums(
	metadata: Readonly<BZCheckpointMetadataV1>,
	payload: Uint8Array,
	state: Readonly<BZStoredCheckpointStateV1>
): Promise<void> {
	const cells = state.width * state.height;
	const [browser, u, v, domain, active, setup, interventions] = await Promise.all([
		sha256BZBytes(payload),
		sha256BZBytes(payload.subarray(0, cells * 4)),
		sha256BZBytes(payload.subarray(cells * 4, cells * 8)),
		sha256BZBytes(payload.subarray(cells * 8, cells * 9)),
		sha256BZBytes(payload.subarray(cells * 9)),
		sha256BZBytes(utf8(canonicalBZJSONStringify(metadata.setup))),
		sha256BZBytes(utf8(canonicalBZJSONStringify(metadata.interventions)))
	]);
	const expected = metadata.checksums;
	for (const [label, actual, declared] of [
		['browser state', browser, expected.browserFloat32State],
		['u field', u, expected.u],
		['v field', v, expected.v],
		['domain mask', domain, expected.domainMask],
		['active mask', active, expected.activeMask],
		['setup', setup, expected.setupCanonicalJson],
		['intervention log', interventions, expected.interventionLogCanonicalJson]
	] as const) {
		if (actual !== declared) throw new RangeError(`Checkpoint ${label} checksum does not match.`);
	}
}

function assertExpectations(
	metadata: Readonly<BZCheckpointMetadataV1>,
	sha256: string,
	expected: Readonly<BZCheckpointExpectationsV1>
): void {
	for (const [label, actual, declared] of [
		['id', metadata.checkpointId, expected.checkpointId],
		['source preset', metadata.sourcePresetId, expected.sourcePresetId],
		['engine version', metadata.engineVersion, expected.engineVersion],
		['validation record', metadata.validationRecordId, expected.validationRecordId],
		[
			'CPU Float64 state checksum',
			metadata.checksums.cpuFloat64State,
			expected.cpuFloat64StateSha256
		],
		['file checksum', sha256, expected.fileSha256]
	] as const) {
		if (declared !== undefined && actual !== declared) {
			throw new RangeError(`Checkpoint ${label} does not match the requested provenance.`);
		}
	}
	if (
		expected.setup !== undefined &&
		canonicalBZJSONStringify(metadata.setup) !== canonicalBZJSONStringify(expected.setup)
	) {
		throw new RangeError('Checkpoint setup does not match the requested provenance.');
	}
	if (expected.interventions !== undefined) {
		const ordered = orderedBZInterventions(expected.interventions);
		if (canonicalBZJSONStringify(metadata.interventions) !== canonicalBZJSONStringify(ordered)) {
			throw new RangeError('Checkpoint intervention log does not match the requested provenance.');
		}
	}
}

export async function decodeBZCheckpointV1(
	source: Uint8Array,
	expected: Readonly<BZCheckpointExpectationsV1> = {}
): Promise<DecodedBZCheckpointV1> {
	const bytes = Uint8Array.from(source);
	if (bytes.length < BZ_CHECKPOINT_HEADER_BYTES + BZ_CHECKPOINT_TRAILER_BYTES) {
		throw new RangeError('Checkpoint file is truncated.');
	}
	if (!BZ_CHECKPOINT_MAGIC.every((byte, index) => bytes[index] === byte)) {
		throw new RangeError('Checkpoint magic is invalid.');
	}
	const header = new DataView(bytes.buffer, 0, BZ_CHECKPOINT_HEADER_BYTES);
	if (header.getUint16(8, true) !== BZ_V2_CHECKPOINT_VERSION) {
		throw new RangeError('Checkpoint codec version is unsupported.');
	}
	if (header.getUint16(10, true) !== BZ_CHECKPOINT_HEADER_BYTES) {
		throw new RangeError('Checkpoint fixed-header length is unsupported.');
	}
	if (header.getUint32(12, true) !== BZ_CHECKPOINT_ENDIAN_MARKER) {
		throw new RangeError('Checkpoint endian marker is invalid.');
	}
	const metadataLength = header.getUint32(16, true);
	const payloadLength = header.getUint32(20, true);
	const width = header.getUint32(24, true);
	const height = header.getUint32(28, true);
	if (metadataLength < 2 || metadataLength > BZ_CHECKPOINT_MAX_METADATA_BYTES) {
		throw new RangeError('Checkpoint metadata length is invalid.');
	}
	if (width < 2 || height < 2 || width !== height || payloadLength !== width * height * 10) {
		throw new RangeError('Checkpoint header dimensions or payload length are invalid.');
	}
	const trailerOffset = BZ_CHECKPOINT_HEADER_BYTES + metadataLength + payloadLength;
	if (trailerOffset + BZ_CHECKPOINT_TRAILER_BYTES !== bytes.length) {
		throw new RangeError('Checkpoint file length is inconsistent with its header.');
	}
	const declaredDigest = bytes.subarray(trailerOffset);
	const actualDigest = await sha256Digest(bytes.subarray(0, trailerOffset));
	if (!equalBytes(actualDigest, declaredDigest)) {
		throw new RangeError('Checkpoint file SHA-256 trailer does not match.');
	}
	const sha256 = bytesToHex(actualDigest);
	const metadataStart = BZ_CHECKPOINT_HEADER_BYTES;
	const payloadStart = metadataStart + metadataLength;
	const metadata = decodeMetadata(bytes.subarray(metadataStart, payloadStart));
	if (metadata.width !== width || metadata.height !== height) {
		throw new RangeError('Checkpoint header and metadata dimensions differ.');
	}
	const payload = bytes.subarray(payloadStart, trailerOffset);
	const state = decodePayload(payload, width, height);
	await assertDecodedChecksums(metadata, payload, state);
	assertExpectations(metadata, sha256, expected);
	return { sha256, metadata, state };
}

/** Converts the exact stored Float32 representation into the Float64 CPU state API. */
export function checkpointStateToBZFieldState(
	state: Readonly<BZStoredCheckpointStateV1>
): BZFieldState {
	assertStoredState(state);
	return {
		size: state.width,
		u: Float64Array.from(state.u),
		v: Float64Array.from(state.v),
		domainMask: new Uint8Array(state.domainMask),
		mask: new Uint8Array(state.activeMask)
	};
}

export function checkpointDescriptorV2(
	encoded: Readonly<EncodedBZCheckpointV1>,
	path: string
): BZCheckpointProvenanceDescriptorV1 {
	if (typeof path !== 'string' || !path.startsWith('/') || path.includes('..')) {
		throw new RangeError('Checkpoint public path must be absolute and traversal-free.');
	}
	const metadata = encoded.metadata;
	return {
		id: metadata.checkpointId,
		version: BZ_V2_CHECKPOINT_VERSION,
		path,
		encoding: BZ_CHECKPOINT_ENCODING_V1,
		losslessForStoredRepresentation: true,
		width: metadata.width,
		height: metadata.height,
		modelStep: metadata.warmupStep,
		modelTime: metadata.modelTime,
		byteLength: encoded.bytes.length,
		sha256: encoded.sha256,
		fieldSha256F64Reference: metadata.checksums.cpuFloat64State,
		setupChecksum: metadata.checksums.setupCanonicalJson,
		interventionLogChecksum: metadata.checksums.interventionLogCanonicalJson,
		engineVersion: metadata.engineVersion,
		generatedBy: metadata.generatedBy,
		generatedAt: metadata.generatedAt,
		sourcePresetId: metadata.sourcePresetId,
		setup: cloneBZSetup(metadata.setup),
		seed: metadata.seed,
		interventions: orderedBZInterventions(metadata.interventions),
		browserStateSha256: metadata.checksums.browserFloat32State,
		modelVersion: metadata.modelVersion,
		equationsId: metadata.equationsId,
		validationRecordId: metadata.validationRecordId
	};
}
