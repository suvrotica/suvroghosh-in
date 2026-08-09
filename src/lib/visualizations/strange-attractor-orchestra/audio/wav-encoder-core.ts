import { clamp } from './safety';

export const WAV_HEADER_BYTES = 44;
export const WAV_PCM_BITS_PER_SAMPLE = 16;

export type PcmChannelData = readonly Float32Array[];

export type WavPcmFormat = Readonly<{
	sampleRate: number;
	channels: number;
	frames: number;
	bytesPerFrame: number;
	dataBytes: number;
	totalBytes: number;
}>;

export function inspectPcmInput(sampleRate: number, channelData: PcmChannelData): WavPcmFormat {
	if (channelData.length < 1 || channelData.length > 2) {
		throw new RangeError('WAV export supports one or two channels.');
	}
	const safeSampleRate = Math.round(clamp(sampleRate, 8_000, 96_000));
	const frames = channelData[0].length;
	if (!Number.isSafeInteger(frames) || frames < 1) {
		throw new RangeError('WAV export requires at least one PCM frame.');
	}
	for (const channel of channelData) {
		if (!(channel instanceof Float32Array) || channel.length !== frames) {
			throw new RangeError('Every WAV channel must be Float32 PCM with the same frame count.');
		}
	}
	const bytesPerFrame = channelData.length * (WAV_PCM_BITS_PER_SAMPLE / 8);
	const dataBytes = frames * bytesPerFrame;
	const totalBytes = WAV_HEADER_BYTES + dataBytes;
	if (!Number.isSafeInteger(totalBytes) || dataBytes > 0xffff_ffff - 36) {
		throw new RangeError('The requested WAV exceeds the RIFF 32-bit size limit.');
	}
	return {
		sampleRate: safeSampleRate,
		channels: channelData.length,
		frames,
		bytesPerFrame,
		dataBytes,
		totalBytes
	};
}

function writeAscii(view: DataView, offset: number, value: string): void {
	for (let index = 0; index < value.length; index += 1) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
}

export function writeWavHeader(view: DataView, format: WavPcmFormat): void {
	if (view.byteLength < WAV_HEADER_BYTES) throw new RangeError('WAV header buffer is too small.');
	writeAscii(view, 0, 'RIFF');
	view.setUint32(4, format.dataBytes + 36, true);
	writeAscii(view, 8, 'WAVE');
	writeAscii(view, 12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, format.channels, true);
	view.setUint32(24, format.sampleRate, true);
	view.setUint32(28, format.sampleRate * format.bytesPerFrame, true);
	view.setUint16(32, format.bytesPerFrame, true);
	view.setUint16(34, WAV_PCM_BITS_PER_SAMPLE, true);
	writeAscii(view, 36, 'data');
	view.setUint32(40, format.dataBytes, true);
}

function pcm16(sample: number): number {
	const safe = Number.isFinite(sample) ? clamp(sample, -1, 1) : 0;
	return safe < 0 ? Math.round(safe * 32_768) : Math.round(safe * 32_767);
}

/** Writes an end-exclusive range of interleaved frames into a pre-headered WAV buffer. */
export function writePcm16Frames(
	view: DataView,
	channelData: PcmChannelData,
	startFrame: number,
	endFrame: number
): void {
	const format = inspectPcmInput(48_000, channelData);
	const start = Math.max(0, Math.min(format.frames, Math.floor(startFrame)));
	const end = Math.max(start, Math.min(format.frames, Math.floor(endFrame)));
	if (view.byteLength < WAV_HEADER_BYTES + format.dataBytes) {
		throw new RangeError('WAV output buffer is too small for the supplied PCM.');
	}
	let byteOffset = WAV_HEADER_BYTES + start * format.bytesPerFrame;
	for (let frame = start; frame < end; frame += 1) {
		for (let channel = 0; channel < format.channels; channel += 1) {
			view.setInt16(byteOffset, pcm16(channelData[channel][frame]), true);
			byteOffset += 2;
		}
	}
}

/** Pure, deterministic PCM encoder used by tests and chunked by the dedicated worker. */
export function encodePcm16Wav(sampleRate: number, channelData: PcmChannelData): ArrayBuffer {
	const format = inspectPcmInput(sampleRate, channelData);
	const output = new ArrayBuffer(format.totalBytes);
	const view = new DataView(output);
	writeWavHeader(view, format);
	writePcm16Frames(view, channelData, 0, format.frames);
	return output;
}
