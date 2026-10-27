export interface PlantUmlSecurityViolation {
	line: number;
	rule: string;
	message: string;
	snippet: string;
}

export interface PlantUmlSecurityCheckResult {
	safe: boolean;
	violations: PlantUmlSecurityViolation[];
}

const MAX_SOURCE_CHARS = 100_000;
const MAX_SOURCE_LINES = 1_500;

const FORBIDDEN_LINE_PATTERNS: readonly {
	rule: string;
	pattern: RegExp;
	message: string;
}[] = [
	{
		rule: 'preprocessor-include',
		pattern: /^\s*!(include|includeurl|includesub|include_many|include_once|import)\b/i,
		message:
			'Preprocessor file and remote includes (!include, !includeurl, !import) are blocked for security.'
	},
	{
		rule: 'preprocessor-pragma',
		pattern: /^\s*!pragma\b/i,
		message: '!pragma directives are blocked in untrusted PlantUML source.'
	},
	{
		rule: 'builtin-env-or-fs',
		pattern: /%(getenv|file_exists|dirpath|filename|load_json|loadJson)\b/i,
		message:
			'Environment and filesystem inspection functions (%getenv, %file_exists, %load_json) are blocked.'
	},
	{
		rule: 'inline-script-tag',
		pattern: /<\s*\/?\s*(script|iframe|object|embed|foreignObject|link|meta)\b/i,
		message:
			'Executable or active HTML/SVG tags (<script>, <iframe>, <foreignObject>) are not allowed in diagram source.'
	},
	{
		rule: 'inline-event-handler',
		pattern: /\bon(load|error|click|mouseover|focus|blur|mouseenter| submit)\s*=/i,
		message: 'Inline DOM event handler attributes (onload=, onerror=, onclick=) are blocked.'
	},
	{
		rule: 'executable-uri-scheme',
		pattern: /\b(javascript|vbscript|file)\s*:/i,
		message:
			'Executable or local filesystem URI schemes (javascript:, vbscript:, file:) are blocked.'
	},
	{
		rule: 'data-html-uri',
		pattern: /\bdata\s*:\s*text\/html/i,
		message: 'data:text/html URIs are blocked.'
	},
	{
		rule: 'external-network-fetch',
		pattern: /(?:!include|<img\b|\[\[)\s*[^\n]*\bhttps?:\/\//i,
		message:
			'External network fetches and remote image/link directives (http://, https://) are blocked.'
	}
];

export function checkPlantUmlSecurity(source: string): PlantUmlSecurityCheckResult {
	const violations: PlantUmlSecurityViolation[] = [];

	if (typeof source !== 'string') {
		return {
			safe: false,
			violations: [
				{
					line: 1,
					rule: 'invalid-source-type',
					message: 'Diagram source must be a string.',
					snippet: ''
				}
			]
		};
	}

	if (source.length > MAX_SOURCE_CHARS) {
		violations.push({
			line: 1,
			rule: 'source-size-limit',
			message: `Diagram source exceeds the ${MAX_SOURCE_CHARS.toLocaleString()}-character safety limit.`,
			snippet: source.slice(0, 80)
		});
	}

	const lines = source.split(/\r?\n/);
	if (lines.length > MAX_SOURCE_LINES) {
		violations.push({
			line: MAX_SOURCE_LINES,
			rule: 'source-line-limit',
			message: `Diagram source exceeds the ${MAX_SOURCE_LINES.toLocaleString()}-line safety limit.`,
			snippet: lines[MAX_SOURCE_LINES] ?? ''
		});
	}

	const scanLimit = Math.min(lines.length, MAX_SOURCE_LINES);
	for (let i = 0; i < scanLimit; i += 1) {
		const rawLine = lines[i] ?? '';
		for (const check of FORBIDDEN_LINE_PATTERNS) {
			if (check.pattern.test(rawLine)) {
				violations.push({
					line: i + 1,
					rule: check.rule,
					message: check.message,
					snippet: rawLine.trim().slice(0, 120)
				});
			}
		}
	}

	return {
		safe: violations.length === 0,
		violations
	};
}

export function escapeXml(value: string): string {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function sanitizeSvg(svg: string): string {
	if (!svg || typeof svg !== 'string') return '';
	return svg
		.replace(/<\s*(script|iframe|object|embed|foreignObject)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
		.replace(/<\s*(script|iframe|object|embed|foreignObject)\b[^>]*\/?\s*>/gi, '')
		.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
		.replace(/\b(href|xlink:href)\s*=\s*("[^"]*"|'[^']*')/gi, '')
		.replace(/javascript\s*:/gi, 'blocked:')
		.replace(/data\s*:\s*text\/html/gi, 'blocked:text/plain');
}
