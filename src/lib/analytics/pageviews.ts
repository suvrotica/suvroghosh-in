/** Per-document navigation state only: no visitor identifier or persisted history. */
export function createPageviewLedger() {
	let path = '';
	let visit = 0;
	let recorded = -1;
	return {
		navigate(nextPath: string) {
			if (nextPath !== path) {
				path = nextPath;
				visit += 1;
			}
		},
		take(eligible: boolean): string | null {
			if (!eligible || !path || recorded === visit) return null;
			recorded = visit;
			return path;
		}
	};
}
