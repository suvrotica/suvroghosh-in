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

	test('verifies QA audit regressions: case-sensitive SI units, loaded divider switch, 6 s time span, t=0 initial voltage edit, RLC label suppression, and 44px touch targets', async ({
		page
	}) => {
		await page.goto(ROUTE);
		const app = page.locator('#circuit-bench-app[data-ready="true"]');
		await expect(app).toBeVisible();

		// F-04: Analogue meter big readout preserves case-sensitive SI unit prefixes (mV vs MV)
		const readoutTransform = await app
			.locator('.cb-meter-readout-big')
			.evaluate((el) => getComputedStyle(el).textTransform);
		expect(readoutTransform).toBe('none');

		// F-12: Compact toolbar buttons meet >= 44x44 px touch target size
		const restartBox = await app
			.getByRole('button', { name: 'Restart', exact: true })
			.boundingBox();
		expect(restartBox).not.toBeNull();
		expect(restartBox!.height).toBeGreaterThanOrEqual(44);
		expect(restartBox!.width).toBeGreaterThanOrEqual(44);

		// F-08: Editing C1 initialVoltage while paused at t = 0 s updates C1 voltage immediately, and Undo restores 0.00 V on both field and meter
		await app.getByRole('button', { name: 'Component list' }).click();
		await app.getByRole('button', { name: 'Inspect C1' }).click();
		const v0Input = app.locator('#cb-input-initialVoltage');
		await v0Input.fill('2');
		await v0Input.press('Enter');
		await expect(app.locator('.cb-meas-grid')).toContainText('2.00 V');
		await expect(app.locator('.cb-meter-readout-big')).toContainText('2.00 V');
		// Reactive component power label uses Instantaneous/Reactive power, not Power dissipated
		await expect(app.locator('.cb-meas-grid')).not.toContainText('Power dissipated');

		// Undo at t = 0 s restores both the initialVoltage setting and the live electrical state on meter and inspector
		await app.getByRole('button', { name: 'Undo circuit edit' }).click();
		await expect(app.locator('.cb-meas-grid')).toContainText('0.00 V');
		await expect(app.locator('.cb-meter-readout-big')).toContainText('0.00 V');

		// Doubling R1 resistance updates the Expected RC charging checkpoints dynamically (τ = 2.00 s, 2.50 mA, 1.97 V at 1 s)
		await app.getByRole('button', { name: 'Inspect R1' }).click();
		const rInput = app.locator('#cb-input-resistance');
		await rInput.fill('2k');
		await rInput.press('Enter');
		await expect(app.locator('.cb-checkpoints')).toContainText('2.00 s');
		await expect(app.locator('.cb-checkpoints')).toContainText('2.50 mA');
		await expect(app.locator('.cb-checkpoints')).toContainText('1.97 V');

		// Short time-span oscilloscope x-axis ticks never repeat rounded labels
		await app.getByLabel('Oscilloscope visible time span').selectOption('0.01');
		const tickLabels = await app.locator('.cb-scope-svg text').allTextContents();
		const timeTicks = tickLabels.filter((t) => /^\d+\.\d+\s*(ms|s|µs)$/.test(t.trim()));
		expect(new Set(timeTicks).size).toBe(timeTicks.length);

		// F-03: Opening S1 in loaded-divider leaves P1 measuring 2.50 V unloaded divider midpoint
		const exampleSelect = app.getByLabel('Select a prepared circuit example');
		await exampleSelect.selectOption('loaded-divider');
		await app.getByRole('button', { name: 'Inspect S1' }).click();
		await app.getByRole('button', { name: /Switch state:/ }).click();
		await app.getByRole('button', { name: 'Inspect P1' }).click();
		await expect(app.locator('.cb-meas-grid')).toContainText('2.50 V');
		// F-09: Probe mode toggle is exposed in the inspector for voltage probes
		await expect(app.getByRole('button', { name: /Probe mode:/ })).toBeVisible();

		// F-05: rc-charge-discharge selects 6 s time span option cleanly, and flipping S1 to Position B updates checkpoints to 0.00 V · 0.00 A
		await exampleSelect.selectOption('rc-charge-discharge');
		await expect(app.getByLabel('Oscilloscope visible time span')).toHaveValue('6');
		await expect(app.locator('.cb-checkpoints')).toContainText('5.00 mA');
		await app.getByRole('button', { name: 'Inspect S1' }).click();
		await app.getByRole('button', { name: /Active throw:/ }).click();
		await expect(app.locator('.cb-checkpoints')).toContainText('t = 0 s: 0.00 V · 0.00 A');
		await expect(app.locator('.cb-checkpoints')).not.toContainText('5.00 mA');
		await expect(app.locator('.cb-checkpoints')).not.toContainText('3.16 V');

		// F-09: Sine source in rc-low-pass exposes DC offset and Phase angle controls, and C1 = 1 nF at 100 µs exports 0.310817 V and 3.1357 µA
		await exampleSelect.selectOption('rc-low-pass');
		await app.getByRole('button', { name: 'Inspect V1' }).click();
		await expect(app.locator('#cb-input-offset')).toBeVisible();
		await expect(app.locator('#cb-input-phaseDeg')).toBeVisible();
		await app.getByRole('button', { name: 'Inspect C1' }).click();
		const cInput = app.locator('#cb-input-capacitance');
		await cInput.fill('1n');
		await cInput.press('Enter');
		await app.getByLabel('Oscilloscope Channel 2 probe').selectOption('component_current:c1');
		await app.getByRole('button', { name: 'Run simulation', exact: true }).click();
		await expect
			.poll(async () => {
				const text = await app.locator('.cb-time-readout').textContent();
				const match = text?.match(/t\s*=\s*([\d.]+)/);
				return match ? Number(match[1]) : 0;
			})
			.toBeGreaterThan(0.001);
		await app.getByRole('button', { name: 'Pause simulation', exact: true }).click();
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			app.getByRole('button', { name: 'Export recorded oscilloscope samples as CSV' }).click()
		]);
		const csvStream = await download.createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of csvStream) {
			chunks.push(Buffer.from(chunk));
		}
		const csvText = Buffer.concat(chunks).toString('utf8');
		const row100us = csvText
			.split('\n')
			.find((line) => line.startsWith('0.000100,'));
		expect(row100us).toBeDefined();
		const [, v100, i100] = row100us!.split(',').map(Number);
		expect(v100).toBeCloseTo(0.310817, 4);
		expect(i100).toBeCloseTo(3.1357e-6, 8);

		// F-10: Series RLC circuit does not display a misleading first-order RC time constant
		await exampleSelect.selectOption('rlc-response');
		await app.getByRole('button', { name: 'Inspect R1' }).click();
		await expect(app.locator('.cb-meas-grid')).not.toContainText('RC time constant');
	});
});
