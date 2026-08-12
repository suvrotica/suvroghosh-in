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
		this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		try {
			const saved = window.localStorage.getItem(STORAGE_KEY);
			if (!saved) return;
			const value = JSON.parse(saved) as Partial<{
				quality: ViewportQuality;
				projection: ProjectionMode;
				surfaceMode: SurfaceMode;
				theme: 'dark' | 'light';
				highContrast: boolean;
				colourBlindSafe: boolean;
				reducedMotion: boolean;
				overlays: Partial<OverlayPreferences>;
			}>;
			if (value.quality) this.quality = value.quality;
			if (value.projection) this.projection = value.projection;
			if (value.surfaceMode === 'solid' || value.surfaceMode === 'wireframe') {
				this.surfaceMode = value.surfaceMode;
			} else if (
				value.surfaceMode === 'instability' ||
				value.surfaceMode === ('curvature' as SurfaceMode)
			) {
				// Migrate the pre-v1 label. The field has always shown an instability proxy,
				// never differential surface curvature.
				this.surfaceMode = 'instability';
			}
			if (value.theme) this.theme = value.theme;
			if (typeof value.highContrast === 'boolean') this.highContrast = value.highContrast;
			if (typeof value.colourBlindSafe === 'boolean') this.colourBlindSafe = value.colourBlindSafe;
			if (typeof value.reducedMotion === 'boolean') this.reducedMotion = value.reducedMotion;
			if (value.overlays) this.overlays = { ...this.overlays, ...value.overlays };
		} catch {
			// A corrupt local preference is non-fatal; defaults remain authoritative.
		}
	}

	save(): void {
		if (typeof window === 'undefined') return;
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
	}

	toggleOverlay(name: keyof OverlayPreferences): void {
		this.overlays = { ...this.overlays, [name]: !this.overlays[name] };
		this.save();
	}
}
