(() => {
	const root = document.documentElement;
	const preferences = ['system', 'paper', 'light', 'night', 'high-contrast'];
	const aliases = { sepia: 'paper', dark: 'night' };
	let preference = 'night';

	try {
		const stored = window.localStorage.getItem('site-theme');
		const normalized = aliases[stored] ?? stored;
		if (normalized && preferences.includes(normalized)) preference = normalized;
	} catch {
		// Keep the Night default when browser storage is unavailable.
	}

	const resolved =
		preference === 'system'
			? window.matchMedia('(prefers-color-scheme: dark)').matches
				? 'night'
				: 'light'
			: preference;

	root.dataset.themePreference = preference;
	root.dataset.theme = resolved;
	root.classList.toggle('dark', resolved === 'night');
	root.style.colorScheme = resolved === 'night' ? 'dark' : 'light';
	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute(
			'content',
			{ paper: '#f7f2e7', light: '#fbfaf7', night: '#171512', 'high-contrast': '#ffffff' }[
				resolved
			]
		);

	const motionPreferences = ['system', 'still', 'gentle', 'alive'];
	let motionPreference = 'system';
	let reducedMotion = false;

	try {
		const storedMotion = window.localStorage.getItem('site-motion');
		if (storedMotion && motionPreferences.includes(storedMotion)) {
			motionPreference = storedMotion;
		}
	} catch {
		// Keep the system default when browser storage is unavailable.
	}

	try {
		reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	} catch {
		// A missing media-query implementation resolves system motion to gentle.
	}

	const resolvedMotion = reducedMotion
		? 'still'
		: motionPreference === 'system'
			? 'gentle'
			: motionPreference;

	root.dataset.motionPreference = motionPreference;
	root.dataset.motion = resolvedMotion;
})();

// Responsive image requests can fail before Svelte hydrates (for example in a local production
// preview or if the deploy-time optimiser is temporarily unavailable). Capture that early error
// and retry the original asset immediately.
document.addEventListener(
	'error',
	(event) => {
		const image = event.target;
		if (!(image instanceof HTMLImageElement)) return;
		const original = image.dataset.originalSrc;
		if (!original || image.dataset.originalFallback === 'true') return;

		image.dataset.originalFallback = 'true';
		// Preserve the server-rendered node tree until Svelte hydrates. Removing the <source> here
		// makes the hydrator encounter <img> where it expects <source>.
		image
			.closest('picture')
			?.querySelectorAll('source[data-responsive-image]')
			.forEach((source) => source.removeAttribute('srcset'));
		image.removeAttribute('srcset');
		image.src = original;
	},
	true
);
