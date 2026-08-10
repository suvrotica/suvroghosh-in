export type WindMode = 'gentle' | 'calcutta' | 'kalbaishakhi';
export type QualityMode = 'auto' | 'high' | 'balanced' | 'battery';

export interface KagojerDanaSettings {
	version: 1;
	windMode: WindMode;
	quality: QualityMode;
	soundEnabled: boolean;
	soundCaptions: boolean;
	calmFlight: boolean;
	calmCamera: boolean;
	highContrastCorridor: boolean;
	strongWindMarks: boolean;
	invertPitch: boolean;
	sensitivity: number;
	showScore: boolean;
}

export const SETTINGS_STORAGE_KEY = 'kagojer-dana.settings';

export const DEFAULT_SETTINGS: KagojerDanaSettings = {
	version: 1,
	windMode: 'calcutta',
	quality: 'auto',
	soundEnabled: true,
	soundCaptions: false,
	calmFlight: false,
	calmCamera: false,
	highContrastCorridor: false,
	strongWindMarks: false,
	invertPitch: false,
	sensitivity: 1,
	showScore: false
};

const windModes = new Set<WindMode>(['gentle', 'calcutta', 'kalbaishakhi']);
const qualityModes = new Set<QualityMode>(['auto', 'high', 'balanced', 'battery']);

function booleanValue(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

export function parseSettings(raw: string | null | undefined): KagojerDanaSettings {
	if (!raw) return { ...DEFAULT_SETTINGS };
	try {
		const candidate = JSON.parse(raw) as Partial<KagojerDanaSettings>;
		const windMode = windModes.has(candidate.windMode as WindMode)
			? (candidate.windMode as WindMode)
			: DEFAULT_SETTINGS.windMode;
		const quality = qualityModes.has(candidate.quality as QualityMode)
			? (candidate.quality as QualityMode)
			: DEFAULT_SETTINGS.quality;
		const sensitivity = Number.isFinite(candidate.sensitivity)
			? Math.max(0.55, Math.min(1.6, Number(candidate.sensitivity)))
			: DEFAULT_SETTINGS.sensitivity;
		return {
			version: 1,
			windMode,
			quality,
			soundEnabled: booleanValue(candidate.soundEnabled, DEFAULT_SETTINGS.soundEnabled),
			soundCaptions: booleanValue(candidate.soundCaptions, DEFAULT_SETTINGS.soundCaptions),
			calmFlight: booleanValue(candidate.calmFlight, DEFAULT_SETTINGS.calmFlight),
			calmCamera: booleanValue(candidate.calmCamera, DEFAULT_SETTINGS.calmCamera),
			highContrastCorridor: booleanValue(
				candidate.highContrastCorridor,
				DEFAULT_SETTINGS.highContrastCorridor
			),
			strongWindMarks: booleanValue(candidate.strongWindMarks, DEFAULT_SETTINGS.strongWindMarks),
			invertPitch: booleanValue(candidate.invertPitch, DEFAULT_SETTINGS.invertPitch),
			sensitivity,
			showScore: booleanValue(candidate.showScore, DEFAULT_SETTINGS.showScore)
		};
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

export function serializeSettings(settings: KagojerDanaSettings): string {
	return JSON.stringify({ ...settings, version: 1 });
}

export function withReducedMotionDefault(
	settings: KagojerDanaSettings,
	reducedMotion: boolean,
	hadStoredSettings: boolean
): KagojerDanaSettings {
	if (!reducedMotion || hadStoredSettings) return settings;
	return { ...settings, calmFlight: true, calmCamera: true };
}
