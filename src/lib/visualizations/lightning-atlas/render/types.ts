import type {
	LightningFlash,
	QualityTier,
	SerializableAtlasState,
	StormPhase,
	TerrainData
} from '../types';

export type RendererPlayback = {
	phase: StormPhase;
	phaseProgress: number;
	time: number;
};

export type LightningRendererCallbacks = {
	onStatus?: (status: 'ready' | 'context-lost' | 'error', message?: string) => void;
	onQualityChange?: (quality: QualityTier, averageFrameMs: number) => void;
	onManualCamera?: () => void;
};

export interface LightningRenderer {
	setScene(state: SerializableAtlasState, terrain: TerrainData): void;
	setFlash(flash: LightningFlash | null): void;
	setPlayback(playback: RendererPlayback): void;
	resize(): void;
	render(deltaSeconds: number, options?: { snapCamera?: boolean }): void;
	pickNormalized(clientX: number, clientY: number): { x: number; z: number } | null;
	captureCanvas(): HTMLCanvasElement;
	dispose(): void;
}
