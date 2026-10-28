declare module '@plantuml/core' {
	export function renderToString(
		lines: string[],
		success: (svg: string) => void,
		failure: (message: string) => void,
		options?: { dark?: boolean; maxSvgSize?: number }
	): void;
}
