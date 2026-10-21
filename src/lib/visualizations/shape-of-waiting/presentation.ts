import { DEFAULT_SETTINGS } from './presets';
import type { Settings } from './types';

/** A deliberately overloaded afternoon makes the opening queue's tail visible. */
export const OPENING_SETTINGS: Settings = { ...DEFAULT_SETTINGS, arrivalRate: 60, window: 180 };
