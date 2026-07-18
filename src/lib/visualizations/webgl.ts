export function supportsWebGL() {
	if (typeof document === 'undefined') return false;
	if (new URLSearchParams(window.location.search).get('webgl') === 'off') return false;

	const canvas = document.createElement('canvas');
	const context =
		canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ??
		canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true });

	if (!context) return false;
	context.getExtension('WEBGL_lose_context')?.loseContext();
	return true;
}

export function renderPixelDensity() {
	if (typeof window === 'undefined') return 1;

	const deviceDensity = window.devicePixelRatio || 1;
	const lowPowerDevice =
		window.matchMedia('(max-width: 48rem)').matches ||
		(typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4);

	return Math.min(deviceDensity, lowPowerDevice ? 1 : 1.5);
}
