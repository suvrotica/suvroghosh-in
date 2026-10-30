import assert from 'node:assert/strict';
import test from 'node:test';
import { auditDependencies, interpretAudit } from './security-audit.mjs';

test('only a completed zero-finding audit passes', () => {
	const clean = JSON.stringify({
		metadata: { vulnerabilities: { total: 0 } },
		vulnerabilities: {}
	});
	assert.equal(interpretAudit({ status: 0, stdout: clean }).ok, true);
	assert.equal(interpretAudit({ status: 1, stdout: clean }).ok, false);
	assert.equal(interpretAudit({ status: 0, stdout: '{}' }).ok, false);
	assert.equal(interpretAudit({ status: 0, stdout: 'not json' }).ok, false);
	assert.equal(
		interpretAudit({ status: 1, stdout: JSON.stringify({ error: { code: 'EAI_AGAIN' } }) }).ok,
		false
	);
	assert.equal(interpretAudit({ status: null, signal: 'SIGTERM', stdout: clean }).ok, false);
	assert.equal(interpretAudit({ status: null, error: new Error('unavailable') }).ok, false);
});

test('unpatched low severity advisories are reported and fail the audit', () => {
	const report = interpretAudit({
		status: 1,
		stdout: JSON.stringify({
			metadata: { vulnerabilities: { total: 1, low: 1 } },
			vulnerabilities: {
				example: {
					severity: 'low',
					fixAvailable: false,
					via: [{ url: 'https://example.test/advisory' }]
				}
			}
		})
	});
	assert.equal(report.ok, false);
	assert.deepEqual(report.findings, [
		{ name: 'example', severity: 'low', advisories: ['https://example.test/advisory'] }
	]);
});

test('audit uses the lockfile, includes development dependencies, and bounds tool execution', () => {
	let called = false;
	auditDependencies((command, args, options) => {
		called = true;
		assert.ok(command);
		assert.ok(args.includes('audit') && args.includes('--json'));
		assert.ok(!args.some((arg) => arg.includes('omit') || arg === '--production'));
		assert.equal(options.shell, false);
		assert.equal(options.timeout, 120_000);
		return { status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } }) };
	});
	assert.equal(called, true);
});
