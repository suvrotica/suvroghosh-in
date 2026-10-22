import { DEFAULT_SETTINGS, validateSettings, type Settings } from './model';
const KEY = 'shadow';
/** Only explicit settings travel; a URL can never supply calculated values or markup. */
export function encodeSettings(settings: Settings): string {
	const s = validateSettings(settings);
	return new URLSearchParams({
		[KEY]: `1.${s.changed ? 1 : 0}.${s.scenario === 'batch' ? 'b' : 'p'}.${s.supplierWait}.${s.productionWait}`
	}).toString();
}
export function decodeSettings(search: string): Settings | null {
	if (search.length > 512) return null;
	const params = new URLSearchParams(search);
	if (!params.has(KEY)) return null;
	const values = params.getAll(KEY);
	if (values.length !== 1 || !/^1\.[01]\.[bp]\.\d{1,2}\.\d{1,2}$/.test(values[0]))
		return { ...DEFAULT_SETTINGS };
	const [, changed, scenario, supplier, production] = values[0].split('.');
	try {
		return validateSettings({
			changed: changed === '1',
			scenario: scenario === 'b' ? 'batch' : 'prototype',
			supplierWait: Number(supplier),
			productionWait: Number(production)
		});
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}
