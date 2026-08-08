import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BZExperienceV2 from '$lib/components/visualizations/bz/BZExperienceV2.svelte';

describe('BZ V2 experience tabs', () => {
	it('always renders a tabpanel target for every aria-controls reference', () => {
		const { body } = render(BZExperienceV2);
		for (const layer of ['gallery', 'laboratory', 'proof']) {
			expect(body).toContain(`id="bz-v2-tab-${layer}"`);
			expect(body).toContain(`aria-controls="bz-v2-panel-${layer}"`);
			expect(body).toContain(`id="bz-v2-panel-${layer}"`);
			expect(body).toContain(`aria-labelledby="bz-v2-tab-${layer}"`);
		}
		expect(body.match(/role="tabpanel"/gu)).toHaveLength(3);
		expect(body.match(/data-testid="bz-v2-gallery"/gu)).toHaveLength(1);
		expect(body.match(/data-testid="bz-v2-proof"/gu)).toHaveLength(1);
	});
});
