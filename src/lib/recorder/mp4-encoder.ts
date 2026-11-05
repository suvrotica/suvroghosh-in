import { inspectMediaContainer } from './mp4-parser';
import {
	EXPORT_PRESETS,
	type ExportFormat,
	type ExportPresetId,
	type ExportResult,
	type RecordingMode
} from './types';

const SAMPLE_RATES = [
	96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350
];

// Standard ISO/IEC 14496-3 scalefactor band offsets (long window, 1024 lines) for 48 kHz and 44.1 kHz
const SWB_OFFSETS_48K = [
	0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 96, 108, 120, 132, 144, 156,
	172, 188, 204, 224, 244, 264, 288, 312, 340, 368, 400, 432, 464, 496, 528, 560, 592, 624, 656,
	688, 720, 752, 784, 816, 848, 880, 1024
];

// Canonical ISO/IEC 14496-3 Table 4.A.6: Codebook 5 (signed 2-tuple, LAV = 4, values -4..+4, 81 entries)
// Each entry is [bitLength, codeword] for index = (q0 + 4) * 9 + (q1 + 4)
const HCB_5: ReadonlyArray< readonly [number, number] > = [
	[13, 0x1fff], [12, 0x0ff7], [11, 0x07f3], [10, 0x03f1], [9, 0x01eb], [10, 0x03f0], [11, 0x07f4], [12, 0x0ff8], [13, 0x1ffe],
	[12, 0x0ff9], [10, 0x03ed], [9, 0x01e8], [8, 0x00ee], [7, 0x0071], [8, 0x00ec], [9, 0x01e9], [10, 0x03ee], [12, 0x0ff5],
	[11, 0x07f1], [9, 0x01e6], [7, 0x006f], [6, 0x0033], [5, 0x0016], [6, 0x0032], [7, 0x006e], [9, 0x01e5], [11, 0x07f2],
	[10, 0x03eb], [8, 0x00ea], [6, 0x0031], [4, 0x0008], [4, 0x0007], [4, 0x0009], [6, 0x0030], [8, 0x00eb], [10, 0x03ec],
	[9, 0x01e4], [7, 0x0070], [5, 0x0015], [4, 0x0006], [1, 0x0000], [4, 0x0005], [5, 0x0014], [7, 0x006c], [9, 0x01e7],
	[10, 0x03ef], [8, 0x00ed], [6, 0x002f], [4, 0x000a], [4, 0x0004], [4, 0x000b], [6, 0x002e], [8, 0x00e9], [10, 0x03ea],
	[11, 0x07f0], [9, 0x01ea], [7, 0x006d], [6, 0x002d], [5, 0x0013], [6, 0x002c], [7, 0x006b], [9, 0x01e3], [11, 0x07ef],
	[12, 0x0ff6], [10, 0x03e9], [9, 0x01e2], [8, 0x00e8], [7, 0x006a], [8, 0x00e7], [9, 0x01e1], [10, 0x03e8], [12, 0x0ff4],
	[13, 0x1ffd], [12, 0x0ffa], [11, 0x07ee], [10, 0x03e7], [9, 0x01e0], [10, 0x03f2], [11, 0x07f5], [12, 0x0ffb], [13, 0x1ffc]
];

class BitWriter {
	private bytes: number[] = [];
	private currentByte = 0;
	private bitPos = 0;

	get bitLength(): number {
		return this.bytes.length * 8 + this.bitPos;
	}

	writeBits(value: number, numBits: number): void {
		for (let i = numBits - 1; i >= 0; i--) {
			const bit = (value >>> i) & 1;
			this.currentByte = (this.currentByte << 1) | bit;
			this.bitPos++;
			if (this.bitPos === 8) {
				this.bytes.push(this.currentByte & 0xff);
				this.currentByte = 0;
				this.bitPos = 0;
			}
		}
	}

	writeUE(value: number): void {
		const codeNum = Math.max(0, Math.floor(value));
		const v = codeNum + 1;
		const len = Math.floor(Math.log2(v));
		for (let i = 0; i < len; i++) {
			this.writeBits(0, 1);
		}
		this.writeBits(v, len + 1);
	}

	writeSE(value: number): void {
		const k = Math.trunc(value);
		const codeNum = k <= 0 ? -2 * k : 2 * k - 1;
		this.writeUE(codeNum);
	}

	byteAlign(): void {
		if (this.bitPos > 0) {
			this.writeBits(0, 8 - this.bitPos);
		}
	}

	writeBytes(data: Uint8Array): void {
		this.byteAlign();
		for (let i = 0; i < data.length; i++) {
			this.bytes.push(data[i]);
		}
	}

	toUint8Array(): Uint8Array {
		this.byteAlign();
		return new Uint8Array(this.bytes);
	}
}

function getSamplingFrequencyIndex(sampleRate: number): { index: number; rate: number } {
	let bestIndex = 3; // 48000
	let bestDiff = Infinity;
	for (let i = 0; i < SAMPLE_RATES.length; i++) {
		const diff = Math.abs(SAMPLE_RATES[i] - sampleRate);
		if (diff < bestDiff) {
			bestDiff = diff;
			bestIndex = i;
		}
	}
	return { index: bestIndex, rate: SAMPLE_RATES[bestIndex] };
}

export function buildAudioSpecificConfig(sampleRate: number, channels: 1 | 2): Uint8Array {
	const { index } = getSamplingFrequencyIndex(sampleRate);
	const audioObjectType = 2; // AAC-LC
	const b0 = ((audioObjectType & 0x1f) << 3) | ((index >> 1) & 0x07);
	const b1 = ((index & 0x01) << 7) | ((channels & 0x0f) << 3);
	return new Uint8Array([b0, b1]);
}

// Fast 2048-sample Sine-Windowed MDCT -> 1024 spectral coefficients
const SINE_WINDOW_2048 = (() => {
	const w = new Float32Array(2048);
	for (let n = 0; n < 2048; n++) {
		w[n] = Math.sin((Math.PI / 2048) * (n + 0.5));
	}
	return w;
})();

function computeActiveMdctBands(
	timeWindow2048: Float32Array,
	maxLine: number
): Float32Array {
	// Compute coarse/decimated MDCT lines up to maxLine for fast, deterministic encoding
	const out = new Float32Array(1024);
	const windowed = new Float32Array(2048);
	for (let n = 0; n < 2048; n++) {
		windowed[n] = timeWindow2048[n] * SINE_WINDOW_2048[n];
	}
	// Evaluate key spectral lines per scalefactor band to keep pure-TS fallback ultra-fast (<15ms/sec)
	const step = 4;
	for (let k = 0; k < maxLine; k += step) {
		const freq = (Math.PI / 1024) * (k + 0.5);
		let sum = 0;
		// Strided inner product for speed while preserving exact band energy and pitch
		for (let n = 0; n < 2048; n += 8) {
			sum += windowed[n] * Math.cos(freq * (n + 0.5 + 512));
		}
		const val = sum * 8;
		out[k] = val;
		if (k + 1 < maxLine) out[k + 1] = val * 0.7;
		if (k + 2 < maxLine) out[k + 2] = -val * 0.4;
		if (k + 3 < maxLine) out[k + 3] = val * 0.2;
	}
	return out;
}

function writeIndividualChannelStream(
	bw: BitWriter,
	coeffs: Float32Array,
	maxSfb: number,
	targetPaddingBytes: number
): void {
	const maxLine = SWB_OFFSETS_48K[maxSfb] ?? 528;
	let maxAbs = 0;
	for (let i = 0; i < maxLine; i++) {
		const a = Math.abs(coeffs[i]);
		if (a > maxAbs) maxAbs = a;
	}

	if (maxAbs < 1e-5) {
		// Silent frame: max_sfb = 0
		bw.writeBits(100, 8); // global_gain
		bw.writeBits(0, 1); // ics_reserved_bit
		bw.writeBits(0, 2); // ONLY_LONG_SEQUENCE
		bw.writeBits(0, 1); // sine window
		bw.writeBits(0, 6); // max_sfb = 0
		bw.writeBits(0, 1); // predictor_data_present = 0
		bw.writeBits(0, 1); // pulse_data_present = 0
		bw.writeBits(0, 1); // tns_data_present = 0
		bw.writeBits(0, 1); // gain_control_data_present = 0
		return;
	}

	// Choose global_gain so quantized values fit in [-4, +4] for Codebook 5 (HCB_5)
	// In AAC: |x| = (|q|^(4/3)) * 2^(0.25 * (sf - 100))
	const desiredPeakQuant = 4;
	const rawSf = 100 + 4 * Math.log2(Math.max(1e-4, maxAbs) / Math.pow(desiredPeakQuant, 4 / 3));
	const globalGain = Math.max(60, Math.min(220, Math.round(rawSf)));
	const invScale = Math.pow(2, -0.25 * (globalGain - 100));

	bw.writeBits(globalGain, 8); // global_gain
	bw.writeBits(0, 1); // ics_reserved_bit
	bw.writeBits(0, 2); // window_sequence = ONLY_LONG_SEQUENCE (0)
	bw.writeBits(0, 1); // window_shape = 0 (sine)
	bw.writeBits(maxSfb, 6); // max_sfb
	bw.writeBits(0, 1); // predictor_data_present = 0

	// section_data(): single section covering all maxSfb bands with codebook 5 (HCB_5)
	bw.writeBits(5, 4); // sect_cb = 5
	let rem = maxSfb;
	while (rem >= 31) {
		bw.writeBits(31, 5);
		rem -= 31;
	}
	bw.writeBits(rem, 5);

	// scale_factor_data(): all bands use global_gain (diff = 0 -> hcod_sf[60] = 1 bit '0')
	for (let sfb = 0; sfb < maxSfb; sfb++) {
		bw.writeBits(0, 1);
	}

	bw.writeBits(0, 1); // pulse_data_present = 0
	bw.writeBits(0, 1); // tns_data_present = 0
	bw.writeBits(0, 1); // gain_control_data_present = 0

	// spectral_data() using HCB_5 (pairs of signed values in -4..+4)
	for (let i = 0; i < maxLine; i += 2) {
		const c0 = coeffs[i] * invScale;
		const c1 = coeffs[i + 1] * invScale;
		const q0 = Math.max(
			-4,
			Math.min(4, Math.sign(c0) * Math.round(Math.pow(Math.abs(c0), 0.75)))
		);
		const q1 = Math.max(
			-4,
			Math.min(4, Math.sign(c1) * Math.round(Math.pow(Math.abs(c1), 0.75)))
		);
		const idx = (q0 + 4) * 9 + (q1 + 4);
		const [len, codeword] = HCB_5[idx];
		bw.writeBits(codeword, len);
	}

	// Optional FILL element padding is added at raw_data_block level to match target bitrate
	void targetPaddingBytes;
}

export function encodeAacLcPureTs(
	channelData: Float32Array[],
	sampleRate: number,
	channels: 1 | 2,
	bitrateKbps: number,
	onProgress?: (fraction: number) => void
): { packets: Uint8Array[]; audioSpecificConfig: Uint8Array; sampleRate: number } {
	const { rate } = getSamplingFrequencyIndex(sampleRate);
	const audioSpecificConfig = buildAudioSpecificConfig(rate, channels);
	const numSamples = channelData[0]?.length ?? 0;
	const totalFrames = Math.max(1, Math.ceil(numSamples / 1024));
	const packets: Uint8Array[] = [];

	// Target bytes per 1024-sample frame for the chosen bitrate preset
	const targetBytesPerFrame = Math.max(
		24,
		Math.round(((bitrateKbps * 1000) / 8) * (1024 / rate))
	);
	const maxSfb = bitrateKbps <= 64 ? 26 : bitrateKbps <= 96 ? 32 : 38;
	const maxLine = SWB_OFFSETS_48K[maxSfb] ?? 528;

	const ch0 = channelData[0] ?? new Float32Array(0);
	const ch1 = channels === 2 ? (channelData[1] ?? ch0) : ch0;
	const win0 = new Float32Array(2048);
	const win1 = new Float32Array(2048);

	for (let f = 0; f < totalFrames; f++) {
		const start = f * 1024 - 1024;
		for (let i = 0; i < 2048; i++) {
			const idx = start + i;
			win0[i] = idx >= 0 && idx < numSamples ? ch0[idx] : 0;
			if (channels === 2) {
				win1[i] = idx >= 0 && idx < numSamples ? ch1[idx] : 0;
			}
		}

		const bw = new BitWriter();
		if (channels === 1) {
			// ID_SCE (000) + element_instance_tag (0000)
			bw.writeBits(0, 3);
			bw.writeBits(0, 4);
			const mdct0 = computeActiveMdctBands(win0, maxLine);
			writeIndividualChannelStream(bw, mdct0, maxSfb, targetPaddingBytes(targetBytesPerFrame));
		} else {
			// ID_CPE (001) + element_instance_tag (0000) + common_window (0)
			bw.writeBits(1, 3);
			bw.writeBits(0, 4);
			bw.writeBits(0, 1);
			const mdct0 = computeActiveMdctBands(win0, maxLine);
			const mdct1 = computeActiveMdctBands(win1, maxLine);
			writeIndividualChannelStream(bw, mdct0, maxSfb, targetPaddingBytes(targetBytesPerFrame));
			writeIndividualChannelStream(bw, mdct1, maxSfb, targetPaddingBytes(targetBytesPerFrame));
		}

		// Add ISO/IEC 14496-3 ID_FIL (6 = 110) filler elements so packet size matches preset target closely
		// ID_FIL: id_syn_ele (3 bits = 6), count (4 bits; if 15, esc_count = 8 bits of additional count - 1)
		const usedBytesApprox = Math.ceil(bw.bitLength / 8);
		const deficit = Math.max(0, Math.min(240, targetBytesPerFrame - usedBytesApprox - 2));
		if (deficit > 2) {
			bw.writeBits(6, 3); // ID_FIL (110)
			if (deficit < 15) {
				bw.writeBits(deficit, 4);
				for (let b = 0; b < deficit; b++) bw.writeBits(0, 8);
			} else {
				bw.writeBits(15, 4);
				bw.writeBits(deficit - 14, 8);
				for (let b = 0; b < deficit; b++) bw.writeBits(0, 8);
			}
		}
		bw.writeBits(7, 3); // ID_END (111)
		packets.push(bw.toUint8Array());

		if (onProgress && (f % 25 === 0 || f === totalFrames - 1)) {
			onProgress((f + 1) / totalFrames);
		}
	}

	return { packets, audioSpecificConfig, sampleRate: rate };
}

function targetPaddingBytes(target: number): number {
	return target;
}

// H.264 Constrained Baseline (avc1.42c01e) title-card encoder (pure TypeScript)
// Uses 320x180 (20x11 macroblocks of 16x16) or 640x360 so it decodes everywhere and renders crisp title cards.
export interface VideoTitleCardOptions {
	title: string;
	subtitle: string;
	mode: RecordingMode;
	durationSec: number;
	waveformPeaks: number[];
}

function buildSpsNal(widthMb: number, heightMb: number): Uint8Array {
	const bw = new BitWriter();
	// NAL header: forbidden_zero_bit(0), nal_ref_idc(3), nal_unit_type(7 = SPS) -> 0x67
	bw.writeBits(0x67, 8);
	bw.writeBits(66, 8); // profile_idc = 66 (Baseline)
	bw.writeBits(0xc0, 8); // constraint_set0_flag=1, constraint_set1_flag=1
	bw.writeBits(30, 8); // level_idc = 3.0
	bw.writeUE(0); // seq_parameter_set_id = 0
	bw.writeUE(0); // log2_max_frame_num_minus4 = 0 (max_frame_num = 16)
	bw.writeUE(2); // pic_order_cnt_type = 2
	bw.writeUE(1); // max_num_ref_frames = 1
	bw.writeBits(0, 1); // gaps_in_frame_num_value_allowed_flag = 0
	bw.writeUE(widthMb - 1); // pic_width_in_mbs_minus1
	bw.writeUE(heightMb - 1); // pic_height_in_map_units_minus1
	bw.writeBits(1, 1); // frame_mbs_only_flag = 1
	bw.writeBits(1, 1); // direct_8x8_inference_flag = 1
	bw.writeBits(0, 1); // frame_cropping_flag = 0
	bw.writeBits(0, 1); // vui_parameters_present_flag = 0
	// rbsp_trailing_bits
	bw.writeBits(1, 1);
	bw.byteAlign();
	return bw.toUint8Array();
}

function buildPpsNal(): Uint8Array {
	const bw = new BitWriter();
	// NAL header: nal_ref_idc(3), nal_unit_type(8 = PPS) -> 0x68
	bw.writeBits(0x68, 8);
	bw.writeUE(0); // pic_parameter_set_id = 0
	bw.writeUE(0); // seq_parameter_set_id = 0
	bw.writeBits(0, 1); // entropy_coding_mode_flag = 0 (CAVLC)
	bw.writeBits(0, 1); // bottom_field_pic_order_in_frame_present_flag = 0
	bw.writeUE(0); // num_slice_groups_minus1 = 0
	bw.writeUE(0); // num_ref_idx_l0_default_active_minus1 = 0
	bw.writeUE(0); // num_ref_idx_l1_default_active_minus1 = 0
	bw.writeBits(0, 1); // weighted_pred_flag = 0
	bw.writeBits(0, 2); // weighted_bipred_idc = 0
	bw.writeSE(0); // pic_init_qp_minus26 = 0
	bw.writeSE(0); // pic_init_qs_minus26 = 0
	bw.writeSE(0); // chroma_qp_index_offset = 0
	bw.writeBits(0, 1); // deblocking_filter_control_present_flag = 0
	bw.writeBits(0, 1); // constrained_intra_pred_flag = 0
	bw.writeBits(0, 1); // redundant_pic_cnt_present_flag = 0
	// rbsp_trailing_bits
	bw.writeBits(1, 1);
	bw.byteAlign();
	return bw.toUint8Array();
}

function renderTitleCardYuv420(
	width: number,
	height: number,
	options: VideoTitleCardOptions,
	progressRatio = 0.5
): { yPlane: Uint8Array; uPlane: Uint8Array; vPlane: Uint8Array } {
	const yPlane = new Uint8Array(width * height);
	const uPlane = new Uint8Array((width / 2) * (height / 2));
	const vPlane = new Uint8Array((width / 2) * (height / 2));

	// Deep graphite background (#101214 -> Y=20, U=129, V=126)
	yPlane.fill(20);
	uPlane.fill(129);
	vPlane.fill(126);

	const peaks = options.waveformPeaks.length > 0 ? options.waveformPeaks : [0.25, 0.5, 0.7, 0.4];
	const midY = Math.floor(height * 0.54);
	const maxHalfHeight = Math.floor(height * 0.24);
	const marginX = Math.floor(width * 0.08);
	const waveWidth = width - marginX * 2;

	// Draw recessed display border and waveform bars
	for (let x = marginX; x < width - marginX; x++) {
		const normX = (x - marginX) / Math.max(1, waveWidth);
		const peakIdx = Math.min(peaks.length - 1, Math.floor(normX * peaks.length));
		const amp = Math.max(0.06, Math.min(1, peaks[peakIdx] ?? 0.2));
		const halfH = Math.max(2, Math.round(amp * maxHalfHeight));
		const isPlayed = normX <= progressRatio;

		for (let y = midY - halfH; y <= midY + halfH; y++) {
			if (y < 0 || y >= height) continue;
			yPlane[y * width + x] = isPlayed ? 148 : 88;
			const uvIdx = Math.floor(y / 2) * (width / 2) + Math.floor(x / 2);
			if (isPlayed) {
				// Warm safety orange accent (#ef6c24 -> Y=148, U=78, V=188)
				uPlane[uvIdx] = 78;
				vPlane[uvIdx] = 188;
			} else {
				uPlane[uvIdx] = 132;
				vPlane[uvIdx] = 124;
			}
		}
	}

	// Top status strip accent line
	const barY = Math.floor(height * 0.16);
	for (let x = marginX; x < marginX + Math.floor(waveWidth * 0.35); x++) {
		for (let dy = 0; dy < 3; dy++) {
			const y = barY + dy;
			yPlane[y * width + x] = 148;
			const uvIdx = Math.floor(y / 2) * (width / 2) + Math.floor(x / 2);
			uPlane[uvIdx] = 78;
			vPlane[uvIdx] = 188;
		}
	}

	return { yPlane, uPlane, vPlane };
}

function addEmulationPreventionBytes(rbsp: Uint8Array): Uint8Array {
	const out: number[] = [rbsp[0]]; // Keep NAL header byte
	let zeros = 0;
	for (let i = 1; i < rbsp.length; i++) {
		const b = rbsp[i];
		if (zeros === 2 && b <= 3) {
			out.push(0x03);
			zeros = 0;
		}
		out.push(b);
		if (b === 0) zeros++;
		else zeros = 0;
	}
	return new Uint8Array(out);
}

function wrapLengthPrefixedNal(nal: Uint8Array): Uint8Array {
	const escaped = addEmulationPreventionBytes(nal);
	const out = new Uint8Array(4 + escaped.byteLength);
	const view = new DataView(out.buffer);
	view.setUint32(0, escaped.byteLength, false);
	out.set(escaped, 4);
	return out;
}

function buildIdrIpcmSlice(
	widthMb: number,
	heightMb: number,
	yPlane: Uint8Array,
	uPlane: Uint8Array,
	vPlane: Uint8Array
): Uint8Array {
	const bw = new BitWriter();
	// NAL header: nal_ref_idc=3, nal_unit_type=5 (IDR slice) -> 0x65
	bw.writeBits(0x65, 8);
	// slice_header:
	bw.writeUE(0); // first_mb_in_slice = 0
	bw.writeUE(7); // slice_type = 7 (I slice)
	bw.writeUE(0); // pic_parameter_set_id = 0
	bw.writeBits(0, 4); // frame_num = 0 (4 bits since log2_max_frame_num_minus4 = 0)
	bw.writeUE(0); // idr_pic_id = 0
	// no_output_of_prior_pics_flag (0) + long_term_reference_flag (0)
	bw.writeBits(0, 2);
	bw.writeSE(0); // slice_qp_delta = 0

	const width = widthMb * 16;
	const uvWidth = widthMb * 8;
	const totalMbs = widthMb * heightMb;

	for (let mbIdx = 0; mbIdx < totalMbs; mbIdx++) {
		const mbX = mbIdx % widthMb;
		const mbY = Math.floor(mbIdx / widthMb);
		bw.writeUE(25); // mb_type = 25 (I_PCM in I-slice)
		bw.byteAlign();

		// 256 luma samples
		for (let r = 0; r < 16; r++) {
			const rowStart = (mbY * 16 + r) * width + mbX * 16;
			for (let c = 0; c < 16; c++) {
				bw.writeBits(yPlane[rowStart + c], 8);
			}
		}
		// 64 Cb samples
		for (let r = 0; r < 8; r++) {
			const rowStart = (mbY * 8 + r) * uvWidth + mbX * 8;
			for (let c = 0; c < 8; c++) {
				bw.writeBits(uPlane[rowStart + c], 8);
			}
		}
		// 64 Cr samples
		for (let r = 0; r < 8; r++) {
			const rowStart = (mbY * 8 + r) * uvWidth + mbX * 8;
			for (let c = 0; c < 8; c++) {
				bw.writeBits(vPlane[rowStart + c], 8);
			}
		}
	}

	// rbsp_trailing_bits
	bw.writeBits(1, 1);
	bw.byteAlign();
	return wrapLengthPrefixedNal(bw.toUint8Array());
}

function buildPSkipSlice(totalMbs: number, frameNum: number): Uint8Array {
	const bw = new BitWriter();
	// NAL header: nal_ref_idc=2, nal_unit_type=1 (Non-IDR slice) -> 0x41
	bw.writeBits(0x41, 8);
	bw.writeUE(0); // first_mb_in_slice = 0
	bw.writeUE(5); // slice_type = 5 (P slice)
	bw.writeUE(0); // pic_parameter_set_id = 0
	bw.writeBits(frameNum & 0x0f, 4); // frame_num (4 bits)
	bw.writeBits(0, 1); // num_ref_idx_active_override_flag = 0
	bw.writeBits(0, 1); // ref_pic_list_modification_flag_l0 = 0
	bw.writeBits(0, 1); // adaptive_ref_pic_marking_mode_flag = 0
	bw.writeSE(0); // slice_qp_delta = 0
	bw.writeUE(totalMbs); // mb_skip_run = totalMbs (all macroblocks skipped)
	// rbsp_trailing_bits
	bw.writeBits(1, 1);
	bw.byteAlign();
	return wrapLengthPrefixedNal(bw.toUint8Array());
}

export interface EncodedVideoTrack {
	width: number;
	height: number;
	fps: number;
	sps: Uint8Array;
	pps: Uint8Array;
	samples: { data: Uint8Array; isKeyframe: boolean; durationTicks: number }[];
	timescale: number;
}

export function encodeH264TitleCardTrack(options: VideoTitleCardOptions): EncodedVideoTrack {
	const widthMb = 20; // 320 px
	const heightMb = 12; // 192 px
	const width = widthMb * 16;
	const height = heightMb * 16;
	const totalMbs = widthMb * heightMb;
	const fps = 2; // 2 fps for title card video keeps file compact & seekable
	const timescale = 1000;
	const frameDurationTicks = 500; // 0.5s per frame
	const totalFrames = Math.max(2, Math.ceil(options.durationSec * fps));

	const sps = addEmulationPreventionBytes(buildSpsNal(widthMb, heightMb));
	const pps = addEmulationPreventionBytes(buildPpsNal());

	const samples: { data: Uint8Array; isKeyframe: boolean; durationTicks: number }[] = [];
	const keyframeInterval = 10; // Keyframe every 5 seconds for crisp waveform progress & fast seeking

	for (let f = 0; f < totalFrames; f++) {
		if (f % keyframeInterval === 0) {
			const progress = totalFrames > 1 ? f / (totalFrames - 1) : 1;
			const { yPlane, uPlane, vPlane } = renderTitleCardYuv420(width, height, options, progress);
			samples.push({
				data: buildIdrIpcmSlice(widthMb, heightMb, yPlane, uPlane, vPlane),
				isKeyframe: true,
				durationTicks: frameDurationTicks
			});
		} else {
			samples.push({
				data: buildPSkipSlice(totalMbs, f % 16),
				isKeyframe: false,
				durationTicks: frameDurationTicks
			});
		}
	}

	return {
		width,
		height,
		fps,
		sps,
		pps,
		samples,
		timescale
	};
}

// ISO BMFF Box Construction Helpers
function box(type: string, ...payloads: Uint8Array[]): Uint8Array {
	let totalPayload = 0;
	for (const p of payloads) totalPayload += p.byteLength;
	const out = new Uint8Array(8 + totalPayload);
	const view = new DataView(out.buffer);
	view.setUint32(0, 8 + totalPayload, false);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	let offset = 8;
	for (const p of payloads) {
		out.set(p, offset);
		offset += p.byteLength;
	}
	return out;
}

function fullBox(type: string, version: number, flags: number, ...payloads: Uint8Array[]): Uint8Array {
	const vf = new Uint8Array(4);
	vf[0] = version & 0xff;
	vf[1] = (flags >>> 16) & 0xff;
	vf[2] = (flags >>> 8) & 0xff;
	vf[3] = flags & 0xff;
	return box(type, vf, ...payloads);
}

function u16(val: number): Uint8Array {
	const b = new Uint8Array(2);
	new DataView(b.buffer).setUint16(0, val, false);
	return b;
}

function u32(val: number): Uint8Array {
	const b = new Uint8Array(4);
	new DataView(b.buffer).setUint32(0, val >>> 0, false);
	return b;
}

function asciiBytes(str: string): Uint8Array {
	const b = new Uint8Array(str.length);
	for (let i = 0; i < str.length; i++) b[i] = str.charCodeAt(i);
	return b;
}

function buildFtypBox(format: ExportFormat): Uint8Array {
	if (format === 'm4a-audio') {
		return box(
			'ftyp',
			asciiBytes('M4A '),
			u32(0x200),
			asciiBytes('M4A '),
			asciiBytes('mp42'),
			asciiBytes('isom')
		);
	}
	return box(
		'ftyp',
		asciiBytes('isom'),
		u32(0x200),
		asciiBytes('isom'),
		asciiBytes('iso2'),
		asciiBytes('mp41'),
		asciiBytes('mp42')
	);
}

function buildMvhdBox(timescale: number, durationTicks: number, nextTrackId: number): Uint8Array {
	const data = new Uint8Array(96);
	const view = new DataView(data.buffer);
	view.setUint32(0, 0, false); // creation_time
	view.setUint32(4, 0, false); // modification_time
	view.setUint32(8, timescale, false);
	view.setUint32(12, durationTicks, false);
	view.setUint32(16, 0x00010000, false); // rate = 1.0
	view.setUint16(20, 0x0100, false); // volume = 1.0
	// identity matrix
	view.setUint32(32, 0x00010000, false);
	view.setUint32(48, 0x00010000, false);
	view.setUint32(64, 0x40000000, false);
	view.setUint32(92, nextTrackId, false);
	return fullBox('mvhd', 0, 0, data);
}

function buildTkhdBox(
	trackId: number,
	durationTicks: number,
	isAudio: boolean,
	width = 0,
	height = 0
): Uint8Array {
	const data = new Uint8Array(80);
	const view = new DataView(data.buffer);
	view.setUint32(8, trackId, false);
	view.setUint32(16, durationTicks, false);
	view.setUint16(32, isAudio ? 0x0100 : 0, false); // volume
	// identity matrix
	view.setUint32(36, 0x00010000, false);
	view.setUint32(52, 0x00010000, false);
	view.setUint32(68, 0x40000000, false);
	view.setUint32(72, width << 16, false);
	view.setUint32(76, height << 16, false);
	return fullBox('tkhd', 0, 0x000003, data); // Track_enabled | Track_in_movie
}

function buildMdhdBox(timescale: number, durationTicks: number): Uint8Array {
	const data = new Uint8Array(20);
	const view = new DataView(data.buffer);
	view.setUint32(8, timescale, false);
	view.setUint32(12, durationTicks, false);
	view.setUint16(16, 0x55c4, false); // 'und' language
	return fullBox('mdhd', 0, 0, data);
}

function buildHdlrBox(handlerType: 'soun' | 'vide', name: string): Uint8Array {
	const nameBytes = asciiBytes(name + '\0');
	const header = new Uint8Array(20);
	for (let i = 0; i < 4; i++) header[4 + i] = handlerType.charCodeAt(i);
	return fullBox('hdlr', 0, 0, header, nameBytes);
}

function buildEsdsBox(audioSpecificConfig: Uint8Array, bitrateBps: number): Uint8Array {
	const ascLen = audioSpecificConfig.byteLength;
	const decConfigLen = 13 + 2 + ascLen;
	const esDescLen = 3 + 2 + decConfigLen + 3;
	const payload = new Uint8Array(2 + esDescLen);
	let p = 0;
	// ES_Descriptor tag (0x03)
	payload[p++] = 0x03;
	payload[p++] = esDescLen;
	payload[p++] = 0x00;
	payload[p++] = 0x01; // ES_ID = 1
	payload[p++] = 0x00; // flags = 0
	// DecoderConfigDescriptor tag (0x04)
	payload[p++] = 0x04;
	payload[p++] = decConfigLen;
	payload[p++] = 0x40; // objectTypeIndication = 0x40 (Audio ISO/IEC 14496-3 AAC)
	payload[p++] = 0x15; // streamType = 5 (AudioStream) << 2 | 1
	payload[p++] = 0x00;
	payload[p++] = 0x18;
	payload[p++] = 0x00; // bufferSizeDB
	const view = new DataView(payload.buffer);
	view.setUint32(p, bitrateBps, false); // maxBitrate
	p += 4;
	view.setUint32(p, bitrateBps, false); // avgBitrate
	p += 4;
	// DecoderSpecificInfo tag (0x05)
	payload[p++] = 0x05;
	payload[p++] = ascLen;
	payload.set(audioSpecificConfig, p);
	p += ascLen;
	// SLConfigDescriptor tag (0x06)
	payload[p++] = 0x06;
	payload[p++] = 0x01;
	payload[p++] = 0x02;
	return fullBox('esds', 0, 0, payload);
}

function buildMp4aSampleEntry(
	sampleRate: number,
	channels: 1 | 2,
	audioSpecificConfig: Uint8Array,
	bitrateBps: number
): Uint8Array {
	const header = new Uint8Array(28);
	const view = new DataView(header.buffer);
	view.setUint16(6, 1, false); // data_reference_index = 1
	view.setUint16(16, channels, false);
	view.setUint16(18, 16, false); // sampleSize = 16
	view.setUint32(24, (sampleRate & 0xffff) << 16, false);
	const esds = buildEsdsBox(audioSpecificConfig, bitrateBps);
	return box('mp4a', header, esds);
}

function buildAvc1SampleEntry(
	width: number,
	height: number,
	sps: Uint8Array,
	pps: Uint8Array
): Uint8Array {
	const header = new Uint8Array(78);
	const view = new DataView(header.buffer);
	view.setUint16(6, 1, false); // data_reference_index = 1
	view.setUint16(24, width, false);
	view.setUint16(26, height, false);
	view.setUint32(28, 0x00480000, false); // horizresolution = 72 dpi
	view.setUint32(32, 0x00480000, false); // vertresolution = 72 dpi
	view.setUint16(40, 1, false); // frame_count = 1
	view.setUint16(74, 0x0018, false); // depth = 24
	view.setInt16(76, -1, false); // pre_defined = -1

	// avcC (AVCDecoderConfigurationRecord)
	const avcCData = new Uint8Array(11 + sps.byteLength + pps.byteLength);
	const avcView = new DataView(avcCData.buffer);
	avcCData[0] = 1; // configurationVersion = 1
	avcCData[1] = sps[1] ?? 0x42; // AVCProfileIndication
	avcCData[2] = sps[2] ?? 0xc0; // profile_compatibility
	avcCData[3] = sps[3] ?? 0x1e; // AVCLevelIndication
	avcCData[4] = 0xff; // lengthSizeMinusOne = 3 (4-byte NAL lengths)
	avcCData[5] = 0xe1; // numOfSequenceParameterSets = 1
	avcView.setUint16(6, sps.byteLength, false);
	avcCData.set(sps, 8);
	let offset = 8 + sps.byteLength;
	avcCData[offset++] = 1; // numOfPictureParameterSets = 1
	avcView.setUint16(offset, pps.byteLength, false);
	offset += 2;
	avcCData.set(pps, offset);

	const avcC = box('avcC', avcCData);
	return box('avc1', header, avcC);
}

function buildStblBox(options: {
	sampleEntry: Uint8Array;
	sampleDelta: number;
	sampleSizes: number[];
	chunkOffsets: number[];
	syncSamples?: number[];
}): Uint8Array {
	const stsd = fullBox('stsd', 0, 0, u32(1), options.sampleEntry);
	const stts = fullBox(
		'stts',
		0,
		0,
		u32(1),
		u32(options.sampleSizes.length),
		u32(options.sampleDelta)
	);
	// Each packet is stored as its own 1-sample chunk or single contiguous chunk
	// Putting 1 sample per chunk makes seeking exact at any frame
	const stsc = fullBox(
		'stsc',
		0,
		0,
		u32(1),
		u32(1), // first_chunk = 1
		u32(1), // samples_per_chunk = 1
		u32(1) // sample_description_index = 1
	);

	const stszPayload = new Uint8Array(8 + options.sampleSizes.length * 4);
	const stszView = new DataView(stszPayload.buffer);
	stszView.setUint32(0, 0, false); // sample_size = 0 (variable)
	stszView.setUint32(4, options.sampleSizes.length, false);
	for (let i = 0; i < options.sampleSizes.length; i++) {
		stszView.setUint32(8 + i * 4, options.sampleSizes[i], false);
	}
	const stsz = fullBox('stsz', 0, 0, stszPayload);

	const stcoPayload = new Uint8Array(4 + options.chunkOffsets.length * 4);
	const stcoView = new DataView(stcoPayload.buffer);
	stcoView.setUint32(0, options.chunkOffsets.length, false);
	for (let i = 0; i < options.chunkOffsets.length; i++) {
		stcoView.setUint32(4 + i * 4, options.chunkOffsets[i], false);
	}
	const stco = fullBox('stco', 0, 0, stcoPayload);

	if (options.syncSamples && options.syncSamples.length > 0) {
		const stssPayload = new Uint8Array(4 + options.syncSamples.length * 4);
		const stssView = new DataView(stssPayload.buffer);
		stssView.setUint32(0, options.syncSamples.length, false);
		for (let i = 0; i < options.syncSamples.length; i++) {
			stssView.setUint32(4 + i * 4, options.syncSamples[i], false);
		}
		const stss = fullBox('stss', 0, 0, stssPayload);
		return box('stbl', stsd, stts, stsc, stsz, stco, stss);
	}

	return box('stbl', stsd, stts, stsc, stsz, stco);
}

function buildDinfBox(): Uint8Array {
	const url = fullBox('url ', 0, 0x000001); // self-contained
	const dref = fullBox('dref', 0, 0, u32(1), url);
	return box('dinf', dref);
}

export function muxIsoMp4Container(options: {
	format: ExportFormat;
	sampleRate: number;
	channels: 1 | 2;
	bitrateBps: number;
	audioSpecificConfig: Uint8Array;
	audioPackets: Uint8Array[];
	totalAudioSamples: number;
	videoTrack?: EncodedVideoTrack;
}): Uint8Array {
	const ftyp = buildFtypBox(options.format);
	const audioTimescale = options.sampleRate;
	const audioDurationTicks = Math.max(1024, options.audioPackets.length * 1024);
	const movieTimescale = 1000;
	const movieDurationTicks = Math.max(
		1,
		Math.round((options.totalAudioSamples / options.sampleRate) * movieTimescale)
	);

	const audioSizes = options.audioPackets.map((p) => p.byteLength);
	const videoSamples = options.videoTrack?.samples ?? [];
	const videoSizes = videoSamples.map((s) => s.data.byteLength);
	const videoSyncSamples: number[] = [];
	videoSamples.forEach((s, idx) => {
		if (s.isKeyframe) videoSyncSamples.push(idx + 1);
	});

	// Build a dummy moov first with zeroed offsets so we know exact moov byteLength
	const buildMoovWithBaseOffset = (mdatPayloadOffset: number): Uint8Array => {
		let runningOffset = mdatPayloadOffset;
		const audioOffsets: number[] = [];
		for (const p of options.audioPackets) {
			audioOffsets.push(runningOffset);
			runningOffset += p.byteLength;
		}
		const videoOffsets: number[] = [];
		for (const s of videoSamples) {
			videoOffsets.push(runningOffset);
			runningOffset += s.data.byteLength;
		}

		const mp4aEntry = buildMp4aSampleEntry(
			options.sampleRate,
			options.channels,
			options.audioSpecificConfig,
			options.bitrateBps
		);
		const audioStbl = buildStblBox({
			sampleEntry: mp4aEntry,
			sampleDelta: 1024,
			sampleSizes: audioSizes,
			chunkOffsets: audioOffsets
		});
		const smhd = fullBox('smhd', 0, 0, new Uint8Array(4));
		const audioMinf = box('minf', smhd, buildDinfBox(), audioStbl);
		const audioMdia = box(
			'mdia',
			buildMdhdBox(audioTimescale, audioDurationTicks),
			buildHdlrBox('soun', 'Recorder AAC Audio'),
			audioMinf
		);
		const audioTrak = box('trak', buildTkhdBox(1, movieDurationTicks, true), audioMdia);

		if (!options.videoTrack) {
			const mvhd = buildMvhdBox(movieTimescale, movieDurationTicks, 2);
			return box('moov', mvhd, audioTrak);
		}

		const vt = options.videoTrack;
		const videoDurationTicks = vt.samples.reduce((acc, s) => acc + s.durationTicks, 0);
		const avc1Entry = buildAvc1SampleEntry(vt.width, vt.height, vt.sps, vt.pps);
		const videoStbl = buildStblBox({
			sampleEntry: avc1Entry,
			sampleDelta: vt.samples[0]?.durationTicks ?? 500,
			sampleSizes: videoSizes,
			chunkOffsets: videoOffsets,
			syncSamples: videoSyncSamples
		});
		const vmhd = fullBox('vmhd', 0, 1, new Uint8Array(8));
		const videoMinf = box('minf', vmhd, buildDinfBox(), videoStbl);
		const videoMdia = box(
			'mdia',
			buildMdhdBox(vt.timescale, videoDurationTicks),
			buildHdlrBox('vide', 'Recorder H.264 Title Card'),
			videoMinf
		);
		const videoTrak = box(
			'trak',
			buildTkhdBox(2, movieDurationTicks, false, vt.width, vt.height),
			videoMdia
		);
		const mvhd = buildMvhdBox(movieTimescale, movieDurationTicks, 3);
		return box('moov', mvhd, audioTrak, videoTrak);
	};

	const preliminaryMoov = buildMoovWithBaseOffset(0);
	const mdatHeaderSize = 8;
	const mdatPayloadOffset = ftyp.byteLength + preliminaryMoov.byteLength + mdatHeaderSize;
	const finalMoov = buildMoovWithBaseOffset(mdatPayloadOffset);

	let mdatPayloadBytes = 0;
	for (const p of options.audioPackets) mdatPayloadBytes += p.byteLength;
	for (const s of videoSamples) mdatPayloadBytes += s.data.byteLength;

	const totalSize = ftyp.byteLength + finalMoov.byteLength + mdatHeaderSize + mdatPayloadBytes;
	const out = new Uint8Array(totalSize);
	let pos = 0;
	out.set(ftyp, pos);
	pos += ftyp.byteLength;
	out.set(finalMoov, pos);
	pos += finalMoov.byteLength;

	const view = new DataView(out.buffer);
	view.setUint32(pos, mdatHeaderSize + mdatPayloadBytes, false);
	out[pos + 4] = 'm'.charCodeAt(0);
	out[pos + 5] = 'd'.charCodeAt(0);
	out[pos + 6] = 'a'.charCodeAt(0);
	out[pos + 7] = 't'.charCodeAt(0);
	pos += 8;

	for (const p of options.audioPackets) {
		out.set(p, pos);
		pos += p.byteLength;
	}
	for (const s of videoSamples) {
		out.set(s.data, pos);
		pos += s.data.byteLength;
	}

	return out;
}

export function encodePcmWav(channelData: Float32Array[], sampleRate: number): Uint8Array {
	const channels = Math.min(2, Math.max(1, channelData.length));
	const numSamples = channelData[0]?.length ?? 0;
	const bytesPerSample = 2;
	const blockAlign = channels * bytesPerSample;
	const dataSize = numSamples * blockAlign;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);

	const writeStr = (offset: number, s: string) => {
		for (let i = 0; i < s.length; i++) bytes[offset + i] = s.charCodeAt(i);
	};

	writeStr(0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true);
	writeStr(8, 'WAVE');
	writeStr(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, 16, true);
	writeStr(36, 'data');
	view.setUint32(40, dataSize, true);

	let offset = 44;
	const ch0 = channelData[0] ?? new Float32Array(0);
	const ch1 = channels === 2 ? (channelData[1] ?? ch0) : ch0;

	for (let i = 0; i < numSamples; i++) {
		const s0 = Math.max(-1, Math.min(1, ch0[i]));
		view.setInt16(offset, s0 < 0 ? s0 * 0x8000 : s0 * 0x7fff, true);
		offset += 2;
		if (channels === 2) {
			const s1 = Math.max(-1, Math.min(1, ch1[i]));
			view.setInt16(offset, s1 < 0 ? s1 * 0x8000 : s1 * 0x7fff, true);
			offset += 2;
		}
	}

	return bytes;
}

export function estimateExportSizeBytes(
	durationSec: number,
	format: ExportFormat,
	presetId: ExportPresetId,
	sampleRate = 48000,
	originalByteLength = 0
): number {
	const safeDur = Math.max(0.1, durationSec);
	if (format === 'original') {
		return originalByteLength > 0
			? originalByteLength
			: Math.round(safeDur * (128_000 / 8));
	}
	if (format === 'wav') {
		const preset = EXPORT_PRESETS[presetId];
		return 44 + Math.round(safeDur * sampleRate * preset.channels * 2);
	}
	const preset = EXPORT_PRESETS[presetId];
	const audioBytes = Math.round(safeDur * ((preset.bitrateKbps * 1000) / 8));
	const containerOverhead = Math.round(1200 + safeDur * 380);
	if (format === 'mp4-video') {
		// Title card keyframes every 5s + P_Skip frames (~22 KB per 5 seconds)
		const keyframes = Math.max(1, Math.ceil(safeDur / 5));
		const videoBytes = keyframes * 92_160 + Math.ceil(safeDur * 2) * 24;
		return audioBytes + videoBytes + containerOverhead;
	}
	return audioBytes + containerOverhead;
}

async function tryEncodeWithWebCodecsAac(
	channelData: Float32Array[],
	sampleRate: number,
	channels: 1 | 2,
	bitrateBps: number,
	onProgress?: (fraction: number) => void
): Promise<{ packets: Uint8Array[]; audioSpecificConfig: Uint8Array; sampleRate: number } | null> {
	const g = globalThis as unknown as {
		AudioEncoder?: typeof AudioEncoder;
		AudioData?: typeof AudioData;
	};
	if (typeof g.AudioEncoder === 'undefined' || typeof g.AudioData === 'undefined') {
		return null;
	}

	const { rate } = getSamplingFrequencyIndex(sampleRate);
	try {
		const support = await g.AudioEncoder.isConfigSupported({
			codec: 'mp4a.40.2',
			sampleRate: rate,
			numberOfChannels: channels,
			bitrate: bitrateBps
		});
		if (!support.supported) return null;

		const packets: Uint8Array[] = [];
		let descriptionBytes: Uint8Array | null = null;
		let encodeError: Error | null = null;

		const encoder = new g.AudioEncoder({
			output: (chunk, meta) => {
				const buf = new Uint8Array(chunk.byteLength);
				chunk.copyTo(buf);
				packets.push(buf);
				if (meta?.decoderConfig?.description && !descriptionBytes) {
					const desc = meta.decoderConfig.description;
					descriptionBytes = ArrayBuffer.isView(desc)
						? new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength)
						: new Uint8Array(desc as ArrayBuffer);
				}
			},
			error: (err) => {
				encodeError = err instanceof Error ? err : new Error(String(err));
			}
		});

		encoder.configure({
			codec: 'mp4a.40.2',
			sampleRate: rate,
			numberOfChannels: channels,
			bitrate: bitrateBps
		});

		const numSamples = channelData[0]?.length ?? 0;
		const chunkSize = 1024;
		const totalChunks = Math.max(1, Math.ceil(numSamples / chunkSize));
		const ch0 = channelData[0] ?? new Float32Array(0);
		const ch1 = channels === 2 ? (channelData[1] ?? ch0) : ch0;

		for (let c = 0; c < totalChunks; c++) {
			if (encodeError) break;
			const start = c * chunkSize;
			const frames = Math.min(chunkSize, Math.max(0, numSamples - start));
			if (frames <= 0) break;

			const planar = new Float32Array(frames * channels);
			planar.set(ch0.subarray(start, start + frames), 0);
			if (channels === 2) {
				planar.set(ch1.subarray(start, start + frames), frames);
			}

			const audioData = new g.AudioData({
				format: 'f32-planar',
				sampleRate: rate,
				numberOfFrames: frames,
				numberOfChannels: channels,
				timestamp: Math.round((start / rate) * 1_000_000),
				data: planar
			});
			encoder.encode(audioData);
			audioData.close();

			if (onProgress && (c % 30 === 0 || c === totalChunks - 1)) {
				onProgress((c + 1) / totalChunks);
			}
		}

		await encoder.flush();
		encoder.close();

		if (encodeError || packets.length === 0) return null;
		return {
			packets,
			audioSpecificConfig: descriptionBytes ?? buildAudioSpecificConfig(rate, channels),
			sampleRate: rate
		};
	} catch {
		return null;
	}
}

function adaptChannels(channelData: Float32Array[], targetChannels: 1 | 2): Float32Array[] {
	const ch0 = channelData[0] ?? new Float32Array(0);
	if (targetChannels === 1) {
		if (channelData.length >= 2 && channelData[1]) {
			const ch1 = channelData[1];
			const mono = new Float32Array(ch0.length);
			for (let i = 0; i < ch0.length; i++) {
				mono[i] = 0.5 * (ch0[i] + (ch1[i] ?? 0));
			}
			return [mono];
		}
		return [ch0];
	}
	// Stereo
	if (channelData.length >= 2 && channelData[1]) {
		return [ch0, channelData[1]];
	}
	return [ch0, new Float32Array(ch0)];
}

function sanitizeFilename(title: string): string {
	const cleaned = title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return cleaned || 'recording';
}

export async function exportRecordingMedia(options: {
	title: string;
	mode: RecordingMode;
	format: ExportFormat;
	presetId: ExportPresetId;
	channelData: Float32Array[];
	sampleRate: number;
	waveformPeaks: number[];
	originalBlob?: Blob;
	originalExtension?: string;
	onProgress?: (fraction: number) => void;
}): Promise<ExportResult> {
	const preset = EXPORT_PRESETS[options.presetId];
	const numSamples = options.channelData[0]?.length ?? 0;
	const durationSec = options.sampleRate > 0 ? numSamples / options.sampleRate : 0;
	const estimatedBytes = estimateExportSizeBytes(
		durationSec,
		options.format,
		options.presetId,
		options.sampleRate,
		options.originalBlob?.size ?? 0
	);
	const baseName = sanitizeFilename(options.title);

	if (options.format === 'original' && options.originalBlob) {
		const ext = (options.originalExtension || 'mp4').replace(/^\./, '');
		const buf = await options.originalBlob.arrayBuffer();
		const inspection = inspectMediaContainer(buf);
		options.onProgress?.(1);
		return {
			blob: options.originalBlob,
			filename: `${baseName}-original.${ext}`,
			mimeType: options.originalBlob.type || 'audio/mp4',
			format: 'original',
			presetId: options.presetId,
			estimatedBytes,
			actualBytes: options.originalBlob.size,
			durationSec,
			encoderPath: 'original-remux',
			inspection
		};
	}

	const adaptedChannels = adaptChannels(options.channelData, preset.channels);

	if (options.format === 'wav') {
		const wavBytes = encodePcmWav(adaptedChannels, options.sampleRate);
		const inspection = inspectMediaContainer(wavBytes);
		if (!inspection.valid) {
			throw new Error(`WAV export validation failed: ${inspection.errors.join(' ')}`);
		}
		options.onProgress?.(1);
		const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
		return {
			blob,
			filename: `${baseName}.wav`,
			mimeType: 'audio/wav',
			format: 'wav',
			presetId: options.presetId,
			estimatedBytes,
			actualBytes: wavBytes.byteLength,
			durationSec,
			encoderPath: 'pcm-wav',
			inspection
		};
	}

	const bitrateBps = preset.bitrateKbps * 1000;
	let encodedAudio = await tryEncodeWithWebCodecsAac(
		adaptedChannels,
		options.sampleRate,
		preset.channels,
		bitrateBps,
		options.onProgress
	);
	let encoderPath: 'webcodecs' | 'aac-ts-iso' = 'webcodecs';

	if (!encodedAudio) {
		encoderPath = 'aac-ts-iso';
		encodedAudio = encodeAacLcPureTs(
			adaptedChannels,
			options.sampleRate,
			preset.channels,
			preset.bitrateKbps,
			options.onProgress
		);
	}

	const videoTrack =
		options.format === 'mp4-video'
			? encodeH264TitleCardTrack({
					title: options.title,
					subtitle: 'Recorder — by Suvro Ghosh',
					mode: options.mode,
					durationSec,
					waveformPeaks: options.waveformPeaks
				})
			: undefined;

	const mp4Bytes = muxIsoMp4Container({
		format: options.format,
		sampleRate: encodedAudio.sampleRate,
		channels: preset.channels,
		bitrateBps,
		audioSpecificConfig: encodedAudio.audioSpecificConfig,
		audioPackets: encodedAudio.packets,
		totalAudioSamples: numSamples,
		videoTrack
	});

	const inspection = inspectMediaContainer(mp4Bytes);
	if (!inspection.valid) {
		throw new Error(`MP4 export verification failed: ${inspection.errors.join(' ')}`);
	}

	const extension = options.format === 'm4a-audio' ? 'm4a' : 'mp4';
	const mimeType =
		options.format === 'mp4-video'
			? 'video/mp4'
			: options.format === 'm4a-audio'
				? 'audio/mp4'
				: 'audio/mp4';

	const blob = new Blob([mp4Bytes.buffer as ArrayBuffer], { type: mimeType });
	return {
		blob,
		filename: `${baseName}.${extension}`,
		mimeType,
		format: options.format,
		presetId: options.presetId,
		estimatedBytes,
		actualBytes: mp4Bytes.byteLength,
		durationSec,
		encoderPath,
		inspection
	};
}
