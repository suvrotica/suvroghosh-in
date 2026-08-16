export type ViewportQuality = 'auto' | 'low' | 'balanced' | 'fine';
export type ProjectionMode = 'perspective' | 'orthographic';
export type SurfaceMode = 'solid' | 'wireframe' | 'instability';

export interface OverlayPreferences {
	axis: boolean;
	centerline: boolean;
	aperture: boolean;
	recentRings: boolean;
	historicalApertures: boolean;
	frame: boolean;
	accretionVectors: boolean;
	grid: boolean;
	groundShadow: boolean;
	cutaway: boolean;
}

const STORAGE_KEY = 'living-aperture:preferences:v1';
const QUALITY_VALUES: readonly ViewportQuality[] = ['auto', 'low', 'balanced', 'fine'];
const PROJECTION_VALUES: readonly ProjectionMode[] = ['perspective', 'orthographic'];
const THEME_VALUES = ['dark', 'light'] as const;
const OVERLAY_KEYS: readonly (keyof OverlayPreferences)[] = [
	'axis',
	'centerline',
	'aperture',
	'recentRings',
	'historicalApertures',
	'frame',
	'accretionVectors',
	'grid',
	'groundShadow',
	'cutaway'
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isListedValue<T extends string>(value: unknown, values: readonly T[]): value is T {
	return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export class PreferencesState {
	quality = $state<ViewportQuality>('auto');
	projection = $state<ProjectionMode>('perspective');
	surfaceMode = $state<SurfaceMode>('solid');
	theme = $state<'dark' | 'light'>('dark');
	highContrast = $state(false);
	colourBlindSafe = $state(true);
	reducedMotion = $state(false);
	unsafeRange = $state(false);
	overlays = $state<OverlayPreferences>({
		axis: true,
		centerline: false,
		aperture: true,
		recentRings: true,
		historicalApertures: false,
		frame: false,
		accretionVectors: false,
		grid: false,
		groundShadow: true,
		cutaway: false
	});

	load(): void {
		if (typeof window === 'undefined') return;
		try {
			this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			const saved = window.localStorage.getItem(STORAGE_KEY);
			if (!saved) return;
			const value: unknown = JSON.parse(saved);
			if (!isRecord(value)) return;
			if (isListedValue(value.quality, QUALITY_VALUES)) this.quality = value.quality;
			if (isListedValue(value.projection, PROJECTION_VALUES)) this.projection = value.projection;
			if (value.surfaceMode === 'solid' || value.surfaceMode === 'wireframe') {
				this.surfaceMode = value.surfaceMode;
			} else if (value.surfaceMode === 'instability' || value.surfaceMode === 'curvature') {
				// Migrate the pre-v1 label. The field has always shown an instability proxy,
				// never differential surface curvature.
				this.surfaceMode = 'instability';
			}
			if (isListedValue(value.theme, THEME_VALUES)) this.theme = value.theme;
			if (typeof value.highContrast === 'boolean') this.highContrast = value.highContrast;
			if (typeof value.colourBlindSafe === 'boolean') this.colourBlindSafe = value.colourBlindSafe;
			if (typeof value.reducedMotion === 'boolean') this.reducedMotion = value.reducedMotion;
			if (isRecord(value.overlays)) {
				const overlays = { ...this.overlays };
				for (const key of OVERLAY_KEYS) {
					if (typeof value.overlays[key] === 'boolean') overlays[key] = value.overlays[key];
				}
				this.overlays = overlays;
			}
		} catch {
			// A corrupt local preference is non-fatal; defaults remain authoritative.
		}
	}

	save(): void {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					quality: this.quality,
					projection: this.projection,
					surfaceMode: this.surfaceMode,
					theme: this.theme,
					highContrast: this.highContrast,
					colourBlindSafe: this.colourBlindSafe,
					reducedMotion: this.reducedMotion,
					overlays: this.overlays
				})
			);
		} catch {
			// Storage can be unavailable or full; in-memory preferences still work.
		}
	}

	toggleOverlay(name: keyof OverlayPreferences): void {
		this.overlays = { ...this.overlays, [name]: !this.overlays[name] };
		this.save();
	}
}
