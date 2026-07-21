import type {
	DecodedProject,
	ProjectFieldData,
	SavedProjectMetadata,
	SimulationSettings
} from './types';
import { PIGMENTS } from './colors';
import {
	ART_MODES,
	BACKGROUND_MODES,
	BRUSH_TYPES,
	COLOR_MODES,
	PHYSICS_OVERLAYS,
	QUALITY_LEVELS
} from './types';

const MAGIC = 'LPIGv1\n';
const HEADER_BYTES = 4;
export const MAX_PROJECT_BYTES = 52 * 1_024 * 1_024;
const COLOR_HARMONIES = ['analogous', 'earth', 'monsoon', 'complementary', 'quiet'] as const;
const PIGMENT_IDS = new Set([...PIGMENTS.map((pigment) => pigment.id), 'custom']);
const SETTING_RANGES = {
	brushSize: [4, 140],
	pigmentAmount: [0, 1],
	transparency: [0, 1],
	waterAmount: [0, 1],
	diffusion: [0, 1],
	surfaceMoisture: [0, 1],
	dryingSpeed: [0, 1],
	viscosity: [0, 1],
	flowStrength: [0, 1],
	turbulence: [0, 1],
	granulation: [0, 1],
	edgeDarkening: [0, 1],
	mixingStrength: [0, 1],
	textureStrength: [0, 1],
	simulationSpeed: [0.1, 3],
	eraserStrength: [0, 1],
	eraserSoftness: [0, 1]
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isListed(value: unknown, options: readonly string[]) {
	return typeof value === 'string' && options.includes(value);
}

function isHex(value: unknown) {
	return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function isFiniteBetween(value: unknown, minimum: number, maximum: number) {
	return (
		typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
	);
}

function isSimulationSettings(value: unknown): value is SimulationSettings {
	if (!isRecord(value) || !isRecord(value.background)) return false;
	for (const [key, [minimum, maximum]] of Object.entries(SETTING_RANGES)) {
		if (!isFiniteBetween(value[key], minimum, maximum)) return false;
	}
	const background = value.background;
	return (
		isListed(value.mode, ART_MODES) &&
		isListed(value.brush, BRUSH_TYPES) &&
		isListed(value.quality, QUALITY_LEVELS) &&
		isListed(value.overlay, PHYSICS_OVERLAYS) &&
		isListed(value.colorMode, COLOR_MODES) &&
		typeof value.wetLifting === 'boolean' &&
		typeof value.primaryPigmentId === 'string' &&
		PIGMENT_IDS.has(value.primaryPigmentId) &&
		typeof value.secondaryPigmentId === 'string' &&
		PIGMENT_IDS.has(value.secondaryPigmentId) &&
		Array.isArray(value.paletteIds) &&
		value.paletteIds.length > 0 &&
		value.paletteIds.length <= 32 &&
		value.paletteIds.every((id) => typeof id === 'string' && PIGMENT_IDS.has(id)) &&
		isListed(background.mode, BACKGROUND_MODES) &&
		isListed(background.harmony, COLOR_HARMONIES) &&
		Number.isInteger(background.seed) &&
		isFiniteBetween(background.seed, 0, 4_294_967_295) &&
		Number.isInteger(background.regions) &&
		isFiniteBetween(background.regions, 1, 12) &&
		isFiniteBetween(background.moisture, 0, 1) &&
		isFiniteBetween(background.turbulence, 0, 1) &&
		isFiniteBetween(background.scale, 0.4, 2.5) &&
		isFiniteBetween(background.symmetry, 0, 1) &&
		isFiniteBetween(background.intensity, 0, 1) &&
		isHex(background.customColor)
	);
}

function blobBuffer(bytes: Uint8Array) {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function readLimitedStream(stream: ReadableStream<Uint8Array>) {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			total += value.byteLength;
			if (total > MAX_PROJECT_BYTES) {
				await reader.cancel();
				throw new Error('The project file expands beyond the supported size limit.');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const output = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}

export function createArtworkFilename(
	extension: 'png' | 'jpeg' | 'webp' | 'livingpigment' = 'png',
	date = new Date()
) {
	const pad = (value: number) => String(value).padStart(2, '0');
	const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
	return `living-pigment-art-${stamp}.${extension}`;
}

export function isShortcutInput(target: EventTarget | null) {
	if (!target || typeof target !== 'object') return false;
	const candidate = target as EventTarget & { tagName?: unknown; isContentEditable?: unknown };
	if (candidate.isContentEditable === true) return true;
	return (
		typeof candidate.tagName === 'string' &&
		['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'SUMMARY'].includes(candidate.tagName.toUpperCase())
	);
}

export function encodeProject(metadata: SavedProjectMetadata, fields: ProjectFieldData) {
	const expectedLength = metadata.width * metadata.height * 4;
	for (const [name, field] of Object.entries(fields)) {
		if (field.length !== expectedLength) {
			throw new Error(`${name} field does not match the saved simulation resolution.`);
		}
	}

	const encoder = new TextEncoder();
	const magic = encoder.encode(MAGIC);
	const header = encoder.encode(JSON.stringify(metadata));
	const output = new Uint8Array(
		magic.length + HEADER_BYTES + header.length + expectedLength * Object.keys(fields).length
	);
	output.set(magic, 0);
	new DataView(output.buffer).setUint32(magic.length, header.length, true);
	let offset = magic.length + HEADER_BYTES;
	output.set(header, offset);
	offset += header.length;
	for (const field of [fields.state, fields.deposit, fields.flow]) {
		output.set(field, offset);
		offset += field.length;
	}
	return output;
}

export function decodeProject(input: ArrayBuffer | Uint8Array): DecodedProject {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	const decoder = new TextDecoder();
	const magicBytes = new TextEncoder().encode(MAGIC);
	if (bytes.length < magicBytes.length + HEADER_BYTES)
		throw new Error('The project file is incomplete.');
	if (decoder.decode(bytes.slice(0, magicBytes.length)) !== MAGIC) {
		throw new Error('This is not a Living Pigment Studio project file.');
	}
	const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
		magicBytes.length,
		true
	);
	const headerStart = magicBytes.length + HEADER_BYTES;
	const headerEnd = headerStart + headerLength;
	if (headerEnd > bytes.length) throw new Error('The project header is corrupt.');

	let parsedMetadata: unknown;
	try {
		parsedMetadata = JSON.parse(decoder.decode(bytes.slice(headerStart, headerEnd)));
	} catch {
		throw new Error('The project metadata could not be read.');
	}
	if (!isRecord(parsedMetadata)) {
		throw new Error('The project metadata contains unsupported values.');
	}
	const metadata = parsedMetadata as unknown as SavedProjectMetadata;
	if (
		metadata.version !== 1 ||
		!Number.isInteger(metadata.width) ||
		!Number.isInteger(metadata.height) ||
		metadata.width < 32 ||
		metadata.height < 32 ||
		metadata.width > 2_048 ||
		metadata.height > 2_048 ||
		typeof metadata.createdAt !== 'string' ||
		metadata.createdAt.length > 80 ||
		!isSimulationSettings(metadata.settings) ||
		(metadata.customColor !== undefined && !isHex(metadata.customColor))
	) {
		throw new Error('The project metadata contains unsupported values.');
	}

	const fieldLength = metadata.width * metadata.height * 4;
	if (bytes.length !== headerEnd + fieldLength * 3) {
		throw new Error('The project texture data is incomplete or has been altered.');
	}
	return {
		metadata,
		fields: {
			state: bytes.slice(headerEnd, headerEnd + fieldLength),
			deposit: bytes.slice(headerEnd + fieldLength, headerEnd + fieldLength * 2),
			flow: bytes.slice(headerEnd + fieldLength * 2, headerEnd + fieldLength * 3)
		}
	};
}

export async function compressProject(bytes: Uint8Array) {
	if (typeof CompressionStream === 'undefined') {
		return new Blob([blobBuffer(bytes)], { type: 'application/octet-stream' });
	}
	const stream = new Blob([blobBuffer(bytes)]).stream().pipeThrough(new CompressionStream('gzip'));
	return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' });
}

export async function decompressProject(file: Blob) {
	if (file.size > MAX_PROJECT_BYTES) {
		throw new Error('The project file exceeds the supported size limit.');
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
	if (!isGzip) return bytes;
	if (typeof DecompressionStream === 'undefined') {
		throw new Error('This browser cannot open compressed project files.');
	}
	const stream = new Blob([blobBuffer(bytes)])
		.stream()
		.pipeThrough(new DecompressionStream('gzip'));
	return readLimitedStream(stream);
}

export function preferenceSubset(settings: SimulationSettings) {
	return {
		brush: settings.brush,
		primaryPigmentId: settings.primaryPigmentId,
		quality: settings.quality,
		colorMode: settings.colorMode
	};
}
