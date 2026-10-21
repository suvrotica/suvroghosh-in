import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleTTSError } from './google-tts.mjs';

const PACIFIC = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'America/Los_Angeles',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});
const DEFAULT_SLEEP = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const MAX_DAILY_LIMIT = 10;
const MIN_INTERVAL_MS = 65_000;

export class NarrationQuotaError extends GoogleTTSError {
	constructor(code, message, nextResetAt = null) {
		super(code, message);
		this.name = 'NarrationQuotaError';
		this.nextResetAt = nextResetAt;
	}
}

function timestamp(value) {
	if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000)
		throw new NarrationQuotaError(
			'STATE',
			'Narration quota timestamps must be valid milliseconds.'
		);
	return value;
}

export function pacificDateKey(value) {
	const parts = PACIFIC.formatToParts(new Date(timestamp(value)));
	const part = (type) => parts.find((entry) => entry.type === type)?.value;
	return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Find the next local midnight without assuming that a Pacific day is 24 hours. */
export function nextPacificMidnight(value) {
	const start = timestamp(value);
	const day = pacificDateKey(start);
	let lower = start + 1;
	let upper = start + 27 * 60 * 60 * 1000;
	while (lower < upper) {
		const middle = Math.floor((lower + upper) / 2);
		if (pacificDateKey(middle) === day) lower = middle + 1;
		else upper = middle;
	}
	return lower;
}

function validDay(value) {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = Date.parse(`${value}T00:00:00.000Z`);
	return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function count(value) {
	return Number.isInteger(value) && value >= 0 && value <= MAX_DAILY_LIMIT;
}

function validateState(state) {
	try {
		if (
			!state ||
			typeof state !== 'object' ||
			Array.isArray(state) ||
			state.version !== 1 ||
			!validDay(state.day) ||
			!count(state.used) ||
			!state.initialUsage ||
			!validDay(state.initialUsage.day) ||
			!count(state.initialUsage.used)
		)
			throw new Error('Invalid schema.');
		for (const field of ['createdAt', 'updatedAt', 'blockedUntil']) timestamp(state[field]);
		if (state.lastRequestAt !== null) timestamp(state.lastRequestAt);
		if (
			state.createdAt > state.updatedAt ||
			(state.lastRequestAt !== null && state.lastRequestAt > state.updatedAt) ||
			pacificDateKey(state.updatedAt) !== state.day ||
			(state.blockedUntil !== 0 && state.blockedUntil !== nextPacificMidnight(state.updatedAt)) ||
			(state.initialUsage.day === state.day && state.used < state.initialUsage.used)
		)
			throw new Error('Inconsistent state.');
		return state;
	} catch {
		throw new NarrationQuotaError(
			'STATE',
			'Narration quota state is malformed or inconsistent. No request was reserved; inspect the local ledger before resuming.'
		);
	}
}

async function atomicSave(file, state) {
	const temporary = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
	try {
		await fs.mkdir(path.dirname(file), { recursive: true });
		await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' });
		await fs.rename(temporary, file);
	} catch {
		throw new NarrationQuotaError(
			'STATE',
			'Could not persist the narration quota reservation. No provider request should be made.'
		);
	} finally {
		await fs.rm(temporary, { force: true }).catch(() => {});
	}
}

/**
 * One caller must hold the repository generation lock throughout use. All catalogue and synthesis
 * attempts reserve quota before transport, including failed/aborted calls. This local conservative
 * ledger cannot detect other clients' usage or establish a project's billing tier.
 */
export function createNarrationQuota({
	stateFile,
	dailyLimit = MAX_DAILY_LIMIT,
	minIntervalMs = MIN_INTERVAL_MS,
	initialUsed = 0,
	initialUsedDate,
	now = Date.now,
	sleep = DEFAULT_SLEEP,
	onProgress = () => {}
} = {}) {
	if (typeof stateFile !== 'string' || !path.isAbsolute(stateFile))
		throw new NarrationQuotaError(
			'CONFIG',
			'Narration quota requires an absolute state file path.'
		);
	if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > MAX_DAILY_LIMIT)
		throw new NarrationQuotaError(
			'CONFIG',
			'Narration daily request cap must be an integer from 1 to 10.'
		);
	if (!Number.isSafeInteger(minIntervalMs) || minIntervalMs < MIN_INTERVAL_MS)
		throw new NarrationQuotaError(
			'CONFIG',
			'Narration requests must be spaced at least 65000 ms apart.'
		);
	if (!count(initialUsed) || (initialUsed > 0 && !validDay(initialUsedDate)))
		throw new NarrationQuotaError(
			'CONFIG',
			'Initial usage requires a count from 0 to 10 and its verified Pacific date.'
		);
	if (typeof now !== 'function' || typeof sleep !== 'function' || typeof onProgress !== 'function')
		throw new NarrationQuotaError(
			'CONFIG',
			'Narration quota clock, sleep and progress hooks must be functions.'
		);

	const report = (event) => {
		try {
			onProgress(event);
		} catch {
			// Optional logging must not invalidate an already persisted quota reservation.
		}
	};
	const clock = () => timestamp(now());
	async function load() {
		const current = clock();
		const day = pacificDateKey(current);
		let state;
		try {
			state = validateState(JSON.parse(await fs.readFile(stateFile, 'utf8')));
		} catch (error) {
			if (error.code !== 'ENOENT') {
				if (error instanceof NarrationQuotaError) throw error;
				throw new NarrationQuotaError(
					'STATE',
					'Could not read valid narration quota state. No request was reserved; inspect the local ledger before resuming.'
				);
			}
			state = {
				version: 1,
				day,
				used: initialUsedDate === day ? initialUsed : 0,
				createdAt: current,
				updatedAt: current,
				lastRequestAt: null,
				blockedUntil: 0,
				initialUsage: {
					day: initialUsedDate ?? day,
					used: initialUsed
				}
			};
			await atomicSave(stateFile, state);
		}
		if (day < state.day || current < state.updatedAt)
			throw new NarrationQuotaError(
				'STATE',
				'The narration quota clock moved backwards. No request was reserved; verify the clock and local ledger.'
			);
		if (day !== state.day) {
			state.day = day;
			state.used = 0;
			state.blockedUntil = 0;
			state.updatedAt = current;
			await atomicSave(stateFile, state);
		}
		return state;
	}
	function status(state, current = clock()) {
		return {
			day: state.day,
			used: state.used,
			dailyLimit,
			remaining: Math.max(0, dailyLimit - state.used),
			lastRequestAt: state.lastRequestAt,
			nextRequestAt: state.lastRequestAt !== null ? state.lastRequestAt + minIntervalMs : current,
			nextResetAt: nextPacificMidnight(current),
			blockedUntil: state.blockedUntil || null
		};
	}
	async function inspect() {
		return status(await load());
	}
	async function beforeRequest() {
		while (true) {
			const state = await load();
			const current = clock();
			const nextResetAt = nextPacificMidnight(current);
			if (state.blockedUntil > current)
				throw new NarrationQuotaError(
					'QUOTA_BLOCKED',
					`Google quota previously stopped narration. Resume after ${new Date(state.blockedUntil).toISOString()} (Pacific midnight).`,
					state.blockedUntil
				);
			if (state.used >= dailyLimit)
				throw new NarrationQuotaError(
					'DAILY_LIMIT',
					`Narration's conservative daily cap of ${dailyLimit} calls is reached. Resume after ${new Date(nextResetAt).toISOString()} (Pacific midnight).`,
					nextResetAt
				);
			const remainingMs =
				state.lastRequestAt !== null ? state.lastRequestAt + minIntervalMs - current : 0;
			if (remainingMs > 0) {
				const waitMs = Math.min(remainingMs, 60_000);
				report({ type: 'wait', waitMs, remainingMs, day: state.day, used: state.used });
				await sleep(waitMs);
				continue;
			}
			state.used += 1;
			state.lastRequestAt = current;
			state.updatedAt = current;
			await atomicSave(stateFile, state);
			const reserved = status(state, current);
			report({ type: 'reserved', ...reserved });
			return reserved;
		}
	}
	async function markQuota() {
		const state = await load();
		const current = clock();
		state.blockedUntil = nextPacificMidnight(current);
		state.updatedAt = current;
		await atomicSave(stateFile, state);
		const blocked = status(state, current);
		report({ type: 'quota', ...blocked });
		return blocked;
	}
	return { inspect, beforeRequest, markQuota };
}
