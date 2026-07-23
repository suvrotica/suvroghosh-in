import fs from 'node:fs';
import path from 'node:path';

const cssFile = path.join(process.cwd(), 'src', 'app.css');
const css = fs.readFileSync(cssFile, 'utf8');
const errors = [];

function luminance(hex) {
	const channels = hex
		.slice(1)
		.match(/.{2}/g)
		.map((value) => Number.parseInt(value, 16) / 255)
		.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
	const first = luminance(foreground);
	const second = luminance(background);
	return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function variablesFromBlock(pattern, label) {
	const block = css.match(pattern)?.[1];
	if (!block) {
		errors.push(`Could not find ${label} token block.`);
		return {};
	}
	return Object.fromEntries(
		Array.from(block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi), ([, key, value]) => [
			key,
			value.toLowerCase()
		])
	);
}

function assertRatio(label, foreground, background, minimum) {
	if (!foreground || !background) {
		errors.push(`${label} is missing a hex token required for contrast validation.`);
		return;
	}
	const ratio = contrast(foreground, background);
	if (ratio < minimum) {
		errors.push(`${label} is ${ratio.toFixed(2)}:1; expected at least ${minimum.toFixed(1)}:1.`);
	}
}

const themes = ['paper', 'light', 'night', 'high-contrast'];
for (const theme of themes) {
	const tokens = variablesFromBlock(
		new RegExp(`\\[data-theme=['"]${theme}['"]\\]\\s*\\{([\\s\\S]*?)\\n\\}`),
		`${theme} theme`
	);
	for (const token of ['ink', 'ink-muted', 'ink-faint', 'accent']) {
		assertRatio(`${theme} --${token} on --paper`, tokens[token], tokens.paper, 4.5);
	}
	assertRatio(`${theme} --control-border on --paper`, tokens['control-border'], tokens.paper, 3);
}

const inkFamilies = ['red', 'amber', 'green', 'blue', 'violet', 'brown', 'neutral'];
const paperTokens = variablesFromBlock(
	/\[data-theme=['"]paper['"]\]\s*\{([\s\S]*?)\n\}/,
	'paper theme'
);
const lightTokens = variablesFromBlock(
	/\[data-theme=['"]light['"]\]\s*\{([\s\S]*?)\n\}/,
	'light theme'
);
const nightTokens = variablesFromBlock(
	/\[data-theme=['"]night['"]\]\s*\{([\s\S]*?)\n\}/,
	'night theme'
);

for (const family of inkFamilies) {
	const paperInk = variablesFromBlock(
		new RegExp(`\\[data-essay-ink=['"]${family}['"]\\]\\s*\\{([\\s\\S]*?)\\n\\}`),
		`${family} paper ink`
	)['essay-ink'];
	const nightInk = variablesFromBlock(
		new RegExp(
			`\\[data-theme=['"]night['"]\\] \\[data-essay-ink=['"]${family}['"]\\]\\s*\\{([\\s\\S]*?)\\n\\}`
		),
		`${family} night ink`
	)['essay-ink'];

	assertRatio(`${family} essay ink on paper`, paperInk, paperTokens.paper, 4.5);
	assertRatio(`${family} essay ink on light`, paperInk, lightTokens.paper, 4.5);
	assertRatio(`${family} essay ink on night`, nightInk, nightTokens.paper, 4.5);
}

if (!/a:not\(\[class\]\):hover\s*\{\s*color:\s*var\(--ink\)/m.test(css)) {
	errors.push('Unclassed link hover must retain the high-contrast --ink text colour.');
}

if (errors.length > 0) {
	console.error(`Contrast validation failed with ${errors.length} issue(s):`);
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log(
	`Contrast validation passed: ${themes.length} themes and ${inkFamilies.length} essay inks.`
);
