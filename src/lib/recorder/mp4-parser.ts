import type { Mp4InspectionResult } from './types';

const SAMPLE_RATE_TABLE = [
	96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350
];

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
	let out = '';
	const end = Math.min(bytes.length, offset + length);
	for (let i = offset; i < end; i++) {
		out += String.fromCharCode(bytes[i]);
	}
	return out;
}

function readUint32BE(view: DataView, offset: number): number {
	return view.getUint32(offset, false);
}

function readUint16BE(view: DataView, offset: number): number {
	return view.getUint16(offset, false);
}

interface BoxSpan {
	type: string;
	start: number;
	headerSize: number;
	contentStart: number;
	end: number;
}

function iterateBoxes(bytes: Uint8Array, start: number, end: number): BoxSpan[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const boxes: BoxSpan[] = [];
	let offset = start;
	while (offset + 8 <= end) {
		const size32 = readUint32BE(view, offset);
		const type = readAscii(bytes, offset + 4, 4);
		let headerSize = 8;
		let boxEnd = offset + size32;
		if (size32 === 1) {
			if (offset + 16 > end) break;
			const high = readUint32BE(view, offset + 8);
			const low = readUint32BE(view, offset + 12);
			headerSize = 16;
			boxEnd = offset + high * 4294967296 + low;
		} else if (size32 === 0) {
			boxEnd = end;
		}
		if (boxEnd < offset + headerSize || boxEnd > end) {
			break;
		}
		boxes.push({
			type,
			start: offset,
			headerSize,
			contentStart: offset + headerSize,
			end: boxEnd
		});
		offset = boxEnd;
	}
	return boxes;
}

function parseEsdsBox(
	bytes: Uint8Array,
	contentStart: number,
	end: number
): {
	objectTypeIndication: number;
	audioObjectType: number;
	sampleRate: number;
	channels: number;
} | null {
	let pos = contentStart + 4;
	let objectTypeIndication = 0;
	let audioObjectType = 0;
	let sampleRate = 0;
	let channels = 0;

	const readDescriptorLength = (): number => {
		let len = 0;
		for (let i = 0; i < 4 && pos < end; i++) {
			const b = bytes[pos++];
			len = (len << 7) | (b & 0x7f);
			if ((b & 0x80) === 0) break;
		}
		return len;
	};

	while (pos < end) {
		const tag = bytes[pos++];
		const len = readDescriptorLength();
		if (tag === 0x03) {
			if (pos + 3 > end) break;
			const flags = bytes[pos + 2];
			pos += 3;
			if (flags & 0x80) pos += 2;
			if (flags & 0x40) {
				const urlLen = bytes[pos++];
				pos += urlLen;
			}
			if (flags & 0x20) pos += 2;
		} else if (tag === 0x04) {
			if (pos + 13 > end) break;
			objectTypeIndication = bytes[pos];
			pos += 13;
		} else if (tag === 0x05) {
			if (pos + 2 <= end && len >= 2) {
				const b0 = bytes[pos];
				const b1 = bytes[pos + 1];
				audioObjectType = (b0 >> 3) & 0x1f;
				const freqIdx = ((b0 & 0x07) << 1) | ((b1 >> 7) & 0x01);
				if (freqIdx === 0x0f && pos + 5 <= end) {
					sampleRate =
						((b1 & 0x7f) << 17) |
						(bytes[pos + 2] << 9) |
						(bytes[pos + 3] << 1) |
						((bytes[pos + 4] >> 7) & 0x01);
					channels = (bytes[pos + 4] >> 3) & 0x0f;
				} else {
					sampleRate = SAMPLE_RATE_TABLE[freqIdx] ?? 0;
					channels = (b1 >> 3) & 0x0f;
				}
			}
			pos += len;
		} else {
			pos += len;
		}
	}

	if (objectTypeIndication === 0 && audioObjectType === 0) return null;
	return { objectTypeIndication, audioObjectType, sampleRate, channels };
}

export function inspectMediaContainer(input: ArrayBuffer | Uint8Array): Mp4InspectionResult {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const errors: string[] = [];

	if (bytes.byteLength < 12) {
		return {
			valid: false,
			container: 'unknown',
			majorBrand: '',
			compatibleBrands: [],
			topLevelBoxes: [],
			hasAudio: false,
			hasVideo: false,
			hasAudioTrack: false,
			hasVideoTrack: false,
			audioCodec: null,
			videoCodec: null,
			channels: 0,
			sampleRate: 0,
			durationSec: 0,
			seekable: false,
			sampleCount: 0,
			byteLength: bytes.byteLength,
			errors: ['File is smaller than 12 bytes.']
		};
	}

	// Detect WebM / EBML
	if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
		return {
			valid: false,
			container: 'webm',
			majorBrand: 'EBML',
			compatibleBrands: [],
			topLevelBoxes: ['EBML'],
			hasAudio: true,
			hasVideo: false,
			hasAudioTrack: true,
			hasVideoTrack: false,
			audioCodec: 'opus/webm',
			videoCodec: null,
			channels: 0,
			sampleRate: 0,
			durationSec: 0,
			seekable: false,
			sampleCount: 0,
			byteLength: bytes.byteLength,
			errors: ['Container is WebM (EBML), not an ISO BMFF MP4/M4A file.']
		};
	}

	// Detect Ogg
	if (readAscii(bytes, 0, 4) === 'OggS') {
		return {
			valid: false,
			container: 'ogg',
			majorBrand: 'OggS',
			compatibleBrands: [],
			topLevelBoxes: ['OggS'],
			hasAudio: true,
			hasVideo: false,
			hasAudioTrack: true,
			hasVideoTrack: false,
			audioCodec: 'ogg',
			videoCodec: null,
			channels: 0,
			sampleRate: 0,
			durationSec: 0,
			seekable: false,
			sampleCount: 0,
			byteLength: bytes.byteLength,
			errors: ['Container is Ogg, not an ISO BMFF MP4/M4A file.']
		};
	}

	// Detect WAV (RIFF....WAVE)
	if (readAscii(bytes, 0, 4) === 'RIFF' && readAscii(bytes, 8, 4) === 'WAVE') {
		let channels = 0;
		let sampleRate = 0;
		let bitsPerSample = 16;
		let dataBytes = 0;
		let pos = 12;
		while (pos + 8 <= bytes.byteLength) {
			const chunkId = readAscii(bytes, pos, 4);
			const chunkSize = view.getUint32(pos + 4, true);
			if (chunkId === 'fmt ' && pos + 24 <= bytes.byteLength) {
				channels = view.getUint16(pos + 10, true);
				sampleRate = view.getUint32(pos + 12, true);
				bitsPerSample = view.getUint16(pos + 22, true);
			} else if (chunkId === 'data') {
				dataBytes = chunkSize;
			}
			pos += 8 + chunkSize + (chunkSize % 2);
		}
		const bytesPerSample = Math.max(1, (bitsPerSample / 8) * Math.max(1, channels));
		const durationSec = sampleRate > 0 ? dataBytes / (sampleRate * bytesPerSample) : 0;
		const validWav = channels > 0 && sampleRate > 0 && dataBytes > 0;
		if (!validWav) errors.push('WAV header is incomplete or missing PCM data.');
		return {
			valid: validWav,
			container: 'wav',
			majorBrand: 'WAVE',
			compatibleBrands: ['RIFF'],
			topLevelBoxes: ['RIFF', 'fmt ', 'data'],
			hasAudio: validWav,
			hasVideo: false,
			hasAudioTrack: validWav,
			hasVideoTrack: false,
			audioCodec: 'pcm_s16le',
			videoCodec: null,
			channels,
			sampleRate,
			durationSec,
			seekable: validWav,
			sampleCount: Math.floor(dataBytes / bytesPerSample),
			byteLength: bytes.byteLength,
			errors
		};
	}

	// Parse ISO BMFF (MP4 / M4A)
	const topBoxes = iterateBoxes(bytes, 0, bytes.byteLength);
	const topLevelBoxes = topBoxes.map((b) => b.type);
	const ftyp = topBoxes.find((b) => b.type === 'ftyp');
	const moov = topBoxes.find((b) => b.type === 'moov');
	const mdat = topBoxes.find((b) => b.type === 'mdat');

	if (!ftyp) errors.push('Missing ftyp box.');
	if (!moov) errors.push('Missing moov box.');
	if (!mdat) errors.push('Missing mdat box.');
	if (mdat && mdat.end - mdat.contentStart <= 0) {
		errors.push('mdat box contains 0 payload bytes.');
	}

	let majorBrand = '';
	const compatibleBrands: string[] = [];
	if (ftyp && ftyp.contentStart + 8 <= ftyp.end) {
		majorBrand = readAscii(bytes, ftyp.contentStart, 4);
		for (let p = ftyp.contentStart + 8; p + 4 <= ftyp.end; p += 4) {
			compatibleBrands.push(readAscii(bytes, p, 4));
		}
	}

	let hasAudioTrack = false;
	let hasVideoTrack = false;
	let audioCodec: string | null = null;
	let videoCodec: string | null = null;
	let channels = 0;
	let sampleRate = 0;
	let durationSec = 0;
	let sampleCount = 0;
	let hasStts = false;
	let hasStsc = false;
	let hasStsz = false;
	let hasStco = false;

	if (moov) {
		const moovBoxes = iterateBoxes(bytes, moov.contentStart, moov.end);
		const mvhd = moovBoxes.find((b) => b.type === 'mvhd');
		if (mvhd && mvhd.contentStart + 24 <= mvhd.end) {
			const version = bytes[mvhd.contentStart];
			if (version === 0) {
				const timescale = readUint32BE(view, mvhd.contentStart + 12);
				const duration = readUint32BE(view, mvhd.contentStart + 16);
				if (timescale > 0) durationSec = duration / timescale;
			} else if (version === 1 && mvhd.contentStart + 36 <= mvhd.end) {
				const timescale = readUint32BE(view, mvhd.contentStart + 20);
				const durationHigh = readUint32BE(view, mvhd.contentStart + 24);
				const durationLow = readUint32BE(view, mvhd.contentStart + 28);
				const duration = durationHigh * 4294967296 + durationLow;
				if (timescale > 0) durationSec = duration / timescale;
			}
		} else {
			errors.push('Missing or truncated mvhd box inside moov.');
		}

		const traks = moovBoxes.filter((b) => b.type === 'trak');
		if (traks.length === 0) errors.push('moov contains no trak boxes.');

		for (const trak of traks) {
			const trakBoxes = iterateBoxes(bytes, trak.contentStart, trak.end);
			const mdia = trakBoxes.find((b) => b.type === 'mdia');
			if (!mdia) continue;
			const mdiaBoxes = iterateBoxes(bytes, mdia.contentStart, mdia.end);
			const mdhd = mdiaBoxes.find((b) => b.type === 'mdhd');
			const hdlr = mdiaBoxes.find((b) => b.type === 'hdlr');
			const minf = mdiaBoxes.find((b) => b.type === 'minf');

			let trackTimescale = 0;
			let trackDuration = 0;
			if (mdhd && mdhd.contentStart + 20 <= mdhd.end) {
				const v = bytes[mdhd.contentStart];
				if (v === 0) {
					trackTimescale = readUint32BE(view, mdhd.contentStart + 12);
					trackDuration = readUint32BE(view, mdhd.contentStart + 16);
				} else if (v === 1 && mdhd.contentStart + 32 <= mdhd.end) {
					trackTimescale = readUint32BE(view, mdhd.contentStart + 20);
					trackDuration =
						readUint32BE(view, mdhd.contentStart + 24) * 4294967296 +
						readUint32BE(view, mdhd.contentStart + 28);
				}
			}

			let handlerType = '';
			if (hdlr && hdlr.contentStart + 12 <= hdlr.end) {
				handlerType = readAscii(bytes, hdlr.contentStart + 8, 4);
			}

			if (!minf) continue;
			const minfBoxes = iterateBoxes(bytes, minf.contentStart, minf.end);
			const stbl = minfBoxes.find((b) => b.type === 'stbl');
			if (!stbl) continue;
			const stblBoxes = iterateBoxes(bytes, stbl.contentStart, stbl.end);

			const stsd = stblBoxes.find((b) => b.type === 'stsd');
			const stts = stblBoxes.find((b) => b.type === 'stts');
			const stsc = stblBoxes.find((b) => b.type === 'stsc');
			const stsz = stblBoxes.find((b) => b.type === 'stsz');
			const stco = stblBoxes.find((b) => b.type === 'stco' || b.type === 'co64');

			if (handlerType === 'soun') {
				hasAudioTrack = true;
				if (trackTimescale > 0 && trackDuration > 0 && durationSec === 0) {
					durationSec = trackDuration / trackTimescale;
				}
				if (stts && stts.contentStart + 8 <= stts.end) {
					hasStts = readUint32BE(view, stts.contentStart + 4) > 0;
				}
				if (stsc && stsc.contentStart + 8 <= stsc.end) {
					hasStsc = readUint32BE(view, stsc.contentStart + 4) > 0;
				}
				if (stsz && stsz.contentStart + 12 <= stsz.end) {
					sampleCount = readUint32BE(view, stsz.contentStart + 8);
					hasStsz = sampleCount > 0;
				}
				if (stco && stco.contentStart + 8 <= stco.end) {
					hasStco = readUint32BE(view, stco.contentStart + 4) > 0;
				}
				if (stsd && stsd.contentStart + 16 <= stsd.end) {
					const entries = iterateBoxes(bytes, stsd.contentStart + 8, stsd.end);
					const mp4a = entries.find((e) => e.type === 'mp4a');
					if (mp4a && mp4a.contentStart + 28 <= mp4a.end) {
						channels = readUint16BE(view, mp4a.contentStart + 16);
						sampleRate = readUint32BE(view, mp4a.contentStart + 24) >>> 16;
						const childBoxes = iterateBoxes(bytes, mp4a.contentStart + 28, mp4a.end);
						const esds = childBoxes.find((c) => c.type === 'esds');
						if (esds) {
							const parsedEsds = parseEsdsBox(bytes, esds.contentStart, esds.end);
							if (parsedEsds && parsedEsds.objectTypeIndication === 0x40) {
								audioCodec = `mp4a.40.${parsedEsds.audioObjectType || 2}`;
								if (parsedEsds.sampleRate > 0) sampleRate = parsedEsds.sampleRate;
								if (parsedEsds.channels > 0) channels = parsedEsds.channels;
							} else {
								errors.push('mp4a entry has invalid or non-AAC esds descriptor.');
							}
						} else {
							errors.push('mp4a sample entry is missing esds box.');
						}
					} else {
						errors.push('Audio stsd does not contain a valid mp4a sample entry.');
					}
				}
			} else if (handlerType === 'vide') {
				hasVideoTrack = true;
				if (stsd && stsd.contentStart + 16 <= stsd.end) {
					const entries = iterateBoxes(bytes, stsd.contentStart + 8, stsd.end);
					const avc1 = entries.find((e) => e.type === 'avc1');
					if (avc1 && avc1.contentStart + 78 <= avc1.end) {
						const childBoxes = iterateBoxes(bytes, avc1.contentStart + 78, avc1.end);
						const avcC = childBoxes.find((c) => c.type === 'avcC');
						if (avcC && avcC.contentStart + 4 <= avcC.end) {
							const profile = bytes[avcC.contentStart + 1]
								.toString(16)
								.padStart(2, '0');
							const compat = bytes[avcC.contentStart + 2]
								.toString(16)
								.padStart(2, '0');
							const level = bytes[avcC.contentStart + 3]
								.toString(16)
								.padStart(2, '0');
							videoCodec = `avc1.${profile}${compat}${level}`;
						} else {
							errors.push('avc1 sample entry is missing avcC configuration box.');
						}
					} else {
						errors.push('Video stsd does not contain a valid avc1 sample entry.');
					}
				}
			}
		}
	}

	const seekable = hasStts && hasStsc && hasStsz && hasStco;
	if (hasAudioTrack && !seekable) {
		errors.push('Audio track is missing required seek tables (stts, stsc, stsz, or stco).');
	}
	if (!hasAudioTrack) {
		errors.push('No valid audio track found in MP4/M4A container.');
	}
	if (hasAudioTrack && (!audioCodec || !audioCodec.startsWith('mp4a.40.'))) {
		errors.push(`Expected AAC audio codec (mp4a.40.x), found ${audioCodec ?? 'none'}.`);
	}
	if (durationSec <= 0) {
		errors.push('Container duration must be positive.');
	}

	const container: 'mp4' | 'm4a' | 'unknown' =
		majorBrand.trim() === 'M4A'
			? 'm4a'
			: majorBrand
				? 'mp4'
				: 'unknown';

	return {
		valid: errors.length === 0,
		container,
		majorBrand,
		compatibleBrands,
		topLevelBoxes,
		hasAudio: hasAudioTrack,
		hasVideo: hasVideoTrack,
		hasAudioTrack,
		hasVideoTrack,
		audioCodec,
		videoCodec,
		channels,
		sampleRate,
		durationSec,
		seekable,
		sampleCount,
		byteLength: bytes.byteLength,
		errors
	};
}
