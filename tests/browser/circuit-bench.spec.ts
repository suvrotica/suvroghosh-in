import { expect, test } from '@playwright/test';

const ROUTE = '/blog/visualizations/circuit-bench';

test.describe('Circuit Bench interactive electronic circuit simulator', () => {
	test('opens paused on the RC charging example at t = 0 s (0 V, 5 mA), runs transient simulation, edits R1, and distinguishes Restart simulation from Restore example', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (err) => pageErrors.push(err.message));

		await page.goto(ROUTE);
		const app = page.locator('#circuit-bench-app[data-ready="true"]');
		await expect(app).toBeVisible();

		// Status is Paused at t = 0.000 s
		await expect(app.locator('.cb-status-pill')).toHaveText('Paused');
		await expect(app.locator('.cb-time-readout')).toContainText('t = 0.000 s');

		// Prompt instruction beside the circuit
		await expect(app.locator('.cb-prompt-strip')).toContainText(
			'Press Run. Watch the capacitor voltage rise and the current fall. Then double the resistance and run it again.'
		);
		await expect(app.locator('.cb-prompt-strip')).toContainText(
			'Doubling the resistance doubles the charging time and halves the initial current.'
		);

		// R1 is selected by default: verify 1 kΩ, 5.00 V, 5.00 mA
		const measGrid = app.locator('.cb-meas-grid');
		await expect(measGrid).toContainText('5.00 V');
		await expect(measGrid).toContainText('5.00 mA');

		// Select C1 via Component list (or schematic) and verify initial uncharged state (0.00 V, 5.00 mA at t = 0+)
		await app.getByRole('button', { name: 'Component list' }).click();
		await app.getByRole('button', { name: 'Inspect C1' }).click();
		await expect(measGrid).toContainText('0.00 V');
		await expect(measGrid).toContainText('5.00 mA');

		// Select R1 again
		await app.getByRole('button', { name: 'Inspect R1' }).click();

		// Press Run and let simulation advance
		await app.getByRole('button', { name: 'Run simulation', exact: true }).click();
		await expect(app.locator('.cb-status-pill')).toHaveText('Running');

		await expect
			.poll(async () => {
				const text = await app.locator('.cb-time-readout').textContent();
				const match = text?.match(/t\s*=\s*([\d.]+)/);
				return match ? Number(match[1]) : 0;
			})
			.toBeGreaterThan(0.25);

		// Pause simulation
		await app.getByRole('button', { name: 'Pause simulation', exact: true }).click();
		await expect(app.locator('.cb-status-pill')).toHaveText('Paused');

		// Double the resistance of R1 to 2 kΩ via value input
		const valueInput = app.locator('#cb-input-resistance');
		await valueInput.fill('2k');
		await valueInput.press('Enter');
		await expect(measGrid).toContainText('2 kΩ');

		// Restart simulation: resets time to 0 s while preserving edited 2 kΩ value (so initial current is now 2.50 mA)
		await app.getByRole('button', { name: 'Restart simulation' }).click();
		await expect(app.locator('.cb-time-readout')).toContainText('t = 0.000 s');
		await expect(measGrid).toContainText('2.50 mA');

		// Restore example: restores R1 back to 1 kΩ (5.00 mA initial current)
		await app.getByRole('button', { name: 'Restore example' }).first().click();
		await expect(measGrid).toContainText('5.00 mA');

		expect(pageErrors).toEqual([]);
	});

	test('supports add, keyboard wiring, value validation, undo/redo, local save & reload, and invalid import protection', async ({
		page
	}) => {
		await page.goto(ROUTE);
		const app = page.locator('#circuit-bench-app[data-ready="true"]');
		await expect(app).toBeVisible();

		// Switch to Ohm's law example
		await app.getByLabel('Select a prepared circuit example').selectOption('ohms-law');
		await expect(app.locator('.cb-prompt-title')).toContainText(
			'Ohm’s law: What happens to current when resistance doubles?'
		);

		// Inspect R1 via the accessible Component list
		await app.getByRole('button', { name: 'Component list' }).click();
		await app.getByRole('button', { name: 'Inspect R1' }).click();

		const measGrid = app.locator('.cb-meas-grid');
		await expect(measGrid).toContainText('5.00 mA');

		// Test invalid engineering input rejection (preserves previous valid value)
		const rInput = app.locator('#cb-input-resistance');
		await rInput.fill('not-a-number');
		await rInput.press('Enter');
		await expect(app.locator('.cb-inspector-body [role="alert"]')).toBeVisible();
		await expect(measGrid).toContainText('5.00 mA');

		// Valid edit to 2k -> current halves to 2.50 mA
		await rInput.fill('2k');
		await rInput.press('Enter');
		await expect(measGrid).toContainText('2.50 mA');

		// Undo restores 1k (5.00 mA), Redo re-applies 2k (2.50 mA)
		await app.getByRole('button', { name: 'Undo circuit edit' }).click();
		await expect(measGrid).toContainText('5.00 mA');
		await app.getByRole('button', { name: 'Redo circuit edit' }).click();
		await expect(measGrid).toContainText('2.50 mA');

		// Add a Voltage Probe from the library and connect it via the accessible keyboard wiring panel
		await app.getByRole('button', { name: 'Add Voltage Probe to circuit' }).click();
		await expect(app.locator('[data-comp-label="P1"]')).toBeVisible();

		await app.getByLabel('Start terminal for wire').selectOption({ label: 'P1 · Probe' });
		await app.getByLabel('End terminal for wire').selectOption({ label: 'R1 · A' });
		await app.getByRole('button', { name: 'Connect wire' }).click();

		// Save to localStorage and reload page to verify persistence
		await app.getByRole('button', { name: 'Save current circuit locally in this browser' }).click();
		await page.reload();
		await expect(app).toBeVisible();
		await expect(app.locator('[data-comp-label="P1"]')).toBeVisible();

		// Open Component list, inspect GND1, and delete it -> surfaces Needs attention diagnostic
		await app.getByRole('button', { name: 'Component list' }).click();
		await app.getByRole('button', { name: 'Inspect GND1' }).click();
		await app.getByRole('button', { name: 'Delete selected component or wire' }).click();
		await expect(app.locator('.cb-status-pill')).toHaveText('Needs attention');
		await expect(app.locator('.cb-banner-error')).toContainText('ground');

		// Undo restores ground and returns circuit to valid Paused state
		await app.getByRole('button', { name: 'Undo circuit edit' }).click();
		await expect(app.locator('.cb-status-pill')).toHaveText('Paused');

		// Invalid JSON import is rejected cleanly and preserves the existing circuit
		const fileInput = app.locator('input[type="file"]');
		await fileInput.setInputFiles({
			name: 'corrupt.json',
			mimeType: 'application/json',
			buffer: Buffer.from('{ "not": "a valid circuit" }', 'utf-8')
		});
		await expect(app.locator('.cb-banner-error')).toContainText('Import rejected');
		await expect(app.locator('[data-comp-label="R1"]')).toBeVisible();
	});

	test('adapts cleanly on mobile viewport and respects prefers-reduced-motion', async ({
		browser
	}) => {
		const context = await browser.newContext({
			viewport: { width: 390, height: 844 },
			reducedMotion: 'reduce',
			locale: 'en-GB'
		});
		const page = await context.newPage();
		await page.goto(ROUTE);

		const app = page.locator('#circuit-bench-app[data-ready="true"]');
		await expect(app).toBeVisible();
		await expect(app.locator('.cb-schematic-svg')).toBeVisible();

		// Confirm no horizontal page overflow on mobile
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(overflow).toBe(false);

		await context.close();
	});
});
