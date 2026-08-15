export function extractShaderExcerpt(source: string, marker: string): string {
	const startMarker = `// @excerpt ${marker}:start`;
	const endMarker = `// @excerpt ${marker}:end`;
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker);

	if (start < 0 || end < 0 || end <= start) {
		throw new Error(`Missing or invalid shader excerpt markers for “${marker}”.`);
	}

	return source.slice(start + startMarker.length, end).trim();
}
