import { escapeXml } from './security';

export interface HighlightedPlantUmlLine {
	lineNumber: number;
	html: string;
	hasError: boolean;
}

export function highlightPlantUmlSource(
	sourceCode: string,
	errorLine?: number
): HighlightedPlantUmlLine[] {
	const lines = (sourceCode ?? '').split(/\r?\n/);

	return lines.map((rawLine, idx) => {
		const lineNumber = idx + 1;
		const trimmed = rawLine.trim();

		if (trimmed.startsWith("'")) {
			return {
				lineNumber,
				html: `<span class="puml-tok-comment">${escapeXml(rawLine)}</span>`,
				hasError: errorLine === lineNumber
			};
		}

		let html = escapeXml(rawLine);

		// Directives @startuml / @enduml / @0
		html = html.replace(
			/^(\s*)(@(?:startuml|enduml|[0-9A-Za-z_.:+-]+))/i,
			'$1<span class="puml-tok-directive">$2</span>'
		);

		// Stereotypes &lt;&lt;...&gt;&gt;
		html = html.replace(/(&lt;&lt;[^&]+&gt;&gt;)/g, '<span class="puml-tok-stereo">$1</span>');

		// Quoted strings &quot;...&quot;
		html = html.replace(/(&quot;[^&]*&quot;)/g, '<span class="puml-tok-string">$1</span>');

		// PlantUML keywords at start of line
		html = html.replace(
			/^(\s*)(title|caption|class|interface|object|package|component|portin|portout|node|device|database|cloud|executionEnvironment|artifact|actor|usecase|rectangle|state|participant|agent|robust|concise|partition|start|stop|if|then|else|elseif|endif|fork|again|end|note|as|is)\b/i,
			'$1<span class="puml-tok-kw">$2</span>'
		);

		return {
			lineNumber,
			html: html || '&nbsp;',
			hasError: errorLine === lineNumber
		};
	});
}
