import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
	AcknowledgementStatus,
	DashboardCounts,
	DemoSettings,
	EnquiryDetail,
	EnquiryFilters,
	EnquirySummary,
	RoutingRule,
	FailureMode,
	StaffMember,
	StaffUpdate,
	SubmissionInput
} from '../../enquiry-demo/types.js';

export const RESPONSE_HOURS = 4;
export const MAX_ATTEMPTS = 3;
export const LEASE_MS = 60_000;
export class DemoError extends Error {
	status: number;
	fields: Record<string, string>;
	constructor(status: number, message: string, fields: Record<string, string> = {}) {
		super(message);
		this.name = 'DemoError';
		this.status = status;
		this.fields = fields;
	}
}

export function validateSubmission(input: unknown): {
	value?: SubmissionInput;
	errors: Record<string, string>;
} {
	const errors: Record<string, string> = {};
	const source =
		input && typeof input === 'object' && !Array.isArray(input)
			? (input as Record<string, unknown>)
			: {};
	const str = (key: string) =>
		typeof source[key] === 'string' ? (source[key] as string).trim() : '';
	const name = str('name'),
		email = str('email').toLowerCase(),
		city = str('city'),
		type = str('type');
	const description = str('description'),
		jobReference = str('jobReference'),
		submissionId = str('submissionId');
	if (name.length < 2 || name.length > 80)
		errors.name = 'Use a fictional name between 2 and 80 characters.';
	if (email.length > 160 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@example\.(com|org)$/i.test(email))
		errors.email = 'Use a fictional address ending in example.com or example.org.';
	if (!['Kolkata', 'Dubai'].includes(city)) errors.city = 'Choose Kolkata or Dubai.';
	if (!['quotation', 'existing-job', 'general'].includes(type))
		errors.type = 'Choose an enquiry type.';
	if (description.length < 10 || description.length > 1200)
		errors.description = 'Describe the problem in 10 to 1,200 characters.';
	if (jobReference.length > 40 || /[\r\n\u0000]/.test(jobReference))
		errors.jobReference = 'Keep the job reference to 40 characters on one line.';
	if (!/^[a-zA-Z0-9_-]{16,80}$/.test(submissionId))
		errors.submissionId = 'Reload the form to start a new enquiry.';
	if (str('website')) errors.website = 'Please leave the website field empty.';
	for (const key of [
		'name',
		'email',
		'city',
		'type',
		'description',
		'jobReference',
		'submissionId',
		'website'
	]) {
		if (source[key] !== undefined && typeof source[key] !== 'string')
			errors[key] = 'Enter a text value for this field.';
	}
	if (Object.keys(errors).length) return { errors };
	return {
		errors,
		value: { name, email, city, type, description, jobReference, submissionId } as SubmissionInput
	};
}

type Row = Record<string, string | number | null>;
const SNAPSHOT_TABLES = {
	demo_meta: 8,
	demo_staff: 20,
	demo_routing: 20,
	demo_enquiries: 100,
	demo_ack_jobs: 100,
	demo_ack_attempts: 1000,
	demo_history: 3000,
	demo_reminders: 100
} as const;
export type EnquirySnapshot = {
	schemaVersion: 1;
	tables: Record<keyof typeof SNAPSHOT_TABLES, Row[]>;
};
export const MAX_SNAPSHOT_BYTES = 512 * 1024;
export interface ClaimedJob {
	id: number;
	ref: string;
	token: string;
	attempts: number;
}
const iso = (value: number) => new Date(value).toISOString();
const refFor = (id: number) => `EOS-${String(id).padStart(5, '0')}`;

/** SQLite state engine. Callers own durable storage; this engine never contacts an email provider. */
export class EnquiryStore {
	readonly db: DatabaseSync;
	private clock: () => number;
	private transactionDepth = 0;
	constructor(path: string, clock: () => number = Date.now) {
		if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
		this.clock = clock;
		this.db = new DatabaseSync(path);
		this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;
		CREATE TABLE IF NOT EXISTS demo_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		INSERT OR IGNORE INTO demo_meta VALUES ('offset_ms','0'),('failure_mode','succeed');
		CREATE TABLE IF NOT EXISTS demo_staff (id TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT, available INTEGER NOT NULL);
		CREATE TABLE IF NOT EXISTS demo_routing (city TEXT NOT NULL, type TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES demo_staff(id), PRIMARY KEY(city,type));
		CREATE TABLE IF NOT EXISTS demo_enquiries (
		 id INTEGER PRIMARY KEY AUTOINCREMENT, submission_id TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
		 name TEXT NOT NULL, email TEXT NOT NULL, city TEXT NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL,
		 job_reference TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES demo_staff(id), fallback INTEGER NOT NULL,
		 fallback_reason TEXT, status TEXT NOT NULL CHECK(status IN ('new','in-progress','resolved')),
		 created_at TEXT NOT NULL, deadline_at TEXT NOT NULL, first_response_at TEXT, first_response_by TEXT);
		CREATE TABLE IF NOT EXISTS demo_ack_jobs (
		 id INTEGER PRIMARY KEY AUTOINCREMENT, enquiry_id INTEGER NOT NULL UNIQUE REFERENCES demo_enquiries(id) ON DELETE CASCADE,
		 recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
		 status TEXT NOT NULL CHECK(status IN ('waiting','processing','succeeded','failed','needs-attention')),
		 attempts INTEGER NOT NULL DEFAULT 0, cycle_attempts INTEGER NOT NULL DEFAULT 0, next_retry_at TEXT,
		 lease_token TEXT, lease_until TEXT, last_error TEXT);
		CREATE TABLE IF NOT EXISTS demo_ack_attempts (
		 id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL REFERENCES demo_ack_jobs(id) ON DELETE CASCADE,
		 number INTEGER NOT NULL, at TEXT NOT NULL, finished_at TEXT, outcome TEXT NOT NULL, explanation TEXT,
		 UNIQUE(job_id,number));
		CREATE TABLE IF NOT EXISTS demo_history (
		 id INTEGER PRIMARY KEY AUTOINCREMENT, enquiry_id INTEGER NOT NULL REFERENCES demo_enquiries(id) ON DELETE CASCADE,
		 at TEXT NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS demo_reminders (
		 id INTEGER PRIMARY KEY AUTOINCREMENT, enquiry_id INTEGER NOT NULL REFERENCES demo_enquiries(id) ON DELETE CASCADE,
		 event TEXT NOT NULL, at TEXT NOT NULL, message TEXT NOT NULL, UNIQUE(enquiry_id,event));
		CREATE INDEX IF NOT EXISTS demo_ack_due ON demo_ack_jobs(status,next_retry_at);
		CREATE INDEX IF NOT EXISTS demo_response_due ON demo_enquiries(first_response_at,deadline_at);`);
		this.tx(() => this.initializeStaff());
	}
	private initializeStaff() {
		for (const person of [
			['kol-quote', 'Mira Sen', 'Kolkata', 1],
			['kol-job', 'Arun Das', 'Kolkata', 1],
			['dub-quote', 'Leila Noor', 'Dubai', 1],
			['dub-job', 'Omar Sami', 'Dubai', 1],
			['dub-general', 'Nadia Khan', 'Dubai', 0],
			['coordinator', 'Office coordinator', null, 1]
		] as const)
			this.run('INSERT OR IGNORE INTO demo_staff VALUES (?,?,?,?)', ...person);
		for (const rule of [
			['Kolkata', 'quotation', 'kol-quote'],
			['Kolkata', 'existing-job', 'kol-job'],
			['Dubai', 'quotation', 'dub-quote'],
			['Dubai', 'existing-job', 'dub-job'],
			['Dubai', 'general', 'dub-general']
		] as const)
			this.run('INSERT OR IGNORE INTO demo_routing VALUES (?,?,?)', ...rule);
	}
	private all(sql: string, ...values: SQLInputValue[]) {
		return this.db.prepare(sql).all(...values) as Row[];
	}
	private one(sql: string, ...values: SQLInputValue[]) {
		return this.db.prepare(sql).get(...values) as Row | undefined;
	}
	private run(sql: string, ...values: SQLInputValue[]) {
		return this.db.prepare(sql).run(...values);
	}
	private tx<T>(fn: () => T): T {
		if (this.transactionDepth) return fn();
		this.db.exec('BEGIN IMMEDIATE');
		this.transactionDepth++;
		try {
			const result = fn();
			this.db.exec('COMMIT');
			return result;
		} catch (error) {
			this.db.exec('ROLLBACK');
			throw error;
		} finally {
			this.transactionDepth--;
		}
	}
	private setting(key: string) {
		return String(this.one('SELECT value FROM demo_meta WHERE key=?', key)?.value ?? '');
	}
	private set(key: string, value: string) {
		this.run(
			'INSERT INTO demo_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
			key,
			value
		);
	}
	now() {
		return this.clock() + Number(this.setting('offset_ms'));
	}
	settings(): DemoSettings {
		return {
			mode: this.setting('failure_mode') as FailureMode,
			now: iso(this.now()),
			offsetMinutes: Number(this.setting('offset_ms')) / 60_000
		};
	}
	staff(): StaffMember[] {
		return this.all(
			"SELECT * FROM demo_staff ORDER BY CASE WHEN id='coordinator' THEN 1 ELSE 0 END,name"
		).map((row) => ({
			id: String(row.id),
			name: String(row.name),
			city: row.city as StaffMember['city'],
			available: Boolean(row.available)
		}));
	}
	routingRules(): RoutingRule[] {
		return this.all(
			`WITH cities(city) AS (VALUES ('Kolkata'),('Dubai')),
			types(type) AS (VALUES ('quotation'),('existing-job'),('general'))
			SELECT cities.city,types.type,s.name intended_owner_name,s.available,
				(SELECT name FROM demo_staff WHERE id='coordinator') coordinator_name
			FROM cities CROSS JOIN types
			LEFT JOIN demo_routing r ON r.city=cities.city AND r.type=types.type
			LEFT JOIN demo_staff s ON s.id=r.owner_id`
		).map((row) => ({
			city: row.city as RoutingRule['city'],
			type: row.type as RoutingRule['type'],
			intendedOwnerName: row.intended_owner_name as string | null,
			assignedOwnerName: String(
				row.intended_owner_name && row.available ? row.intended_owner_name : row.coordinator_name
			),
			reason: !row.intended_owner_name
				? 'No matching routing rule. The Office coordinator will assign someone.'
				: !row.available
					? `${row.intended_owner_name} is unavailable. The Office coordinator will assign someone.`
					: null
		}));
	}
	private history(
		id: number,
		kind: string,
		message: string,
		actor = 'System',
		at = iso(this.now())
	) {
		this.run(
			'INSERT INTO demo_history(enquiry_id,at,actor,kind,message) VALUES (?,?,?,?,?)',
			id,
			at,
			actor,
			kind,
			message
		);
	}
	private id(ref: string) {
		if (!/^EOS-\d{5,9}$/.test(ref)) throw new DemoError(404, 'This enquiry could not be found.');
		return Number(ref.slice(4));
	}
	private require(ref: string) {
		const id = this.id(ref);
		if (!this.one('SELECT id FROM demo_enquiries WHERE id=?', id))
			throw new DemoError(404, 'This enquiry could not be found.');
		return id;
	}
	submit(raw: unknown): { enquiry: EnquirySummary; duplicate: boolean } {
		const { value: input, errors } = validateSubmission(raw);
		if (!input) throw new DemoError(400, 'Check the highlighted fields.', errors);
		const { submissionId, ...content } = input;
		const fingerprint = createHash('sha256').update(JSON.stringify(content)).digest('hex');
		const result = this.tx(() => {
			const existing = this.one(
				'SELECT id,fingerprint FROM demo_enquiries WHERE submission_id=?',
				submissionId
			);
			if (existing) {
				if (existing.fingerprint !== fingerprint)
					throw new DemoError(
						409,
						'This form was already used with different details. Start a new enquiry.'
					);
				return { id: Number(existing.id), duplicate: true };
			}
			const route = this.one(
				'SELECT s.* FROM demo_routing r JOIN demo_staff s ON s.id=r.owner_id WHERE r.city=? AND r.type=?',
				input.city,
				input.type
			);
			const fallback = !route || !route.available;
			const reason = !route
				? 'No matching routing rule. The Office coordinator will assign someone.'
				: !route.available
					? `${route.name} is unavailable. The Office coordinator will assign someone.`
					: null;
			const now = this.now(),
				at = iso(now);
			const inserted = this.run(
				`INSERT INTO demo_enquiries(submission_id,fingerprint,name,email,city,type,description,job_reference,owner_id,fallback,fallback_reason,status,created_at,deadline_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'new',?,?)`,
				submissionId,
				fingerprint,
				input.name,
				input.email,
				input.city,
				input.type,
				input.description,
				input.jobReference ?? '',
				fallback ? 'coordinator' : String(route!.id),
				Number(fallback),
				reason,
				at,
				iso(now + RESPONSE_HOURS * 3_600_000)
			);
			const id = Number(inserted.lastInsertRowid),
				ref = refFor(id);
			this.run(
				`INSERT INTO demo_ack_jobs(enquiry_id,recipient,subject,body,status,next_retry_at) VALUES (?,?,?,?,'waiting',?)`,
				id,
				input.email,
				`We have saved your enquiry ${ref}`,
				`Hello ${input.name},\n\nExample Office Services has saved your enquiry as ${ref}. Our team aims to record a first response within four elapsed hours, not business hours.\n\nYour message:\n${input.description}\n\nDemonstration only. This preview is saved in the demonstration. No real email is sent.`,
				at
			);
			this.history(
				id,
				'submitted',
				'Enquiry saved and acknowledgement queued in the same transaction.',
				'Customer',
				at
			);
			this.history(
				id,
				'assigned',
				fallback
					? `Assigned to Office coordinator. ${reason}`
					: `Assigned to ${route!.name} using the ${input.city} ${input.type} rule.`,
				'System',
				at
			);
			return { id, duplicate: false };
		});
		return { enquiry: this.detail(refFor(result.id))!, duplicate: result.duplicate };
	}
	list(filters: EnquiryFilters = {}): EnquirySummary[] {
		const values: SQLInputValue[] = [],
			where: string[] = [];
		for (const [key, column] of [
			['city', 'e.city'],
			['status', 'e.status'],
			['ownerId', 'e.owner_id'],
			['ackStatus', 'a.status']
		] as const) {
			if (filters[key]) {
				where.push(`${column}=?`);
				values.push(String(filters[key]).slice(0, 80));
			}
		}
		if (filters.query) {
			const query = `%${filters.query.slice(0, 120).replace(/[\\%_]/g, '\\$&')}%`;
			where.push(
				"(e.name LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\' OR ('EOS-' || printf('%05d',e.id)) LIKE ? ESCAPE '\\')"
			);
			values.push(query, query, query);
		}
		return this.all(
			`SELECT e.*,s.name owner_name,a.status ack_status,a.attempts,a.next_retry_at FROM demo_enquiries e JOIN demo_staff s ON s.id=e.owner_id JOIN demo_ack_jobs a ON a.enquiry_id=e.id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.id DESC LIMIT 500`,
			...values
		).map((row) => this.summary(row));
	}
	private summary(row: Row): EnquirySummary {
		return {
			ref: refFor(Number(row.id)),
			name: String(row.name),
			email: String(row.email),
			city: row.city as EnquirySummary['city'],
			type: row.type as EnquirySummary['type'],
			description: String(row.description),
			jobReference: String(row.job_reference),
			ownerId: String(row.owner_id),
			ownerName: String(row.owner_name),
			fallback: Boolean(row.fallback),
			fallbackReason: row.fallback_reason as string | null,
			status: row.status as EnquirySummary['status'],
			createdAt: String(row.created_at),
			deadlineAt: String(row.deadline_at),
			firstResponseAt: row.first_response_at as string | null,
			firstResponseBy: row.first_response_by as string | null,
			overdue: !row.first_response_at && this.now() > Date.parse(String(row.deadline_at)),
			ackStatus: row.ack_status as AcknowledgementStatus,
			attempts: Number(row.attempts),
			nextRetryAt: row.next_retry_at as string | null
		};
	}
	detail(ref: string): EnquiryDetail | null {
		const id = this.id(ref);
		const row = this.one(
			'SELECT e.*,s.name owner_name,a.status ack_status,a.attempts,a.next_retry_at FROM demo_enquiries e JOIN demo_staff s ON s.id=e.owner_id JOIN demo_ack_jobs a ON a.enquiry_id=e.id WHERE e.id=?',
			id
		);
		if (!row) return null;
		const ack = this.one('SELECT * FROM demo_ack_jobs WHERE enquiry_id=?', id)!;
		return {
			...this.summary(row),
			ack: {
				id: Number(ack.id),
				to: String(ack.recipient),
				subject: String(ack.subject),
				body: String(ack.body),
				status: ack.status as AcknowledgementStatus,
				attempts: Number(ack.attempts),
				nextRetryAt: ack.next_retry_at as string | null,
				error: ack.last_error as string | null
			},
			history: this.all('SELECT * FROM demo_history WHERE enquiry_id=? ORDER BY at,id', id).map(
				(h) => ({
					id: Number(h.id),
					at: String(h.at),
					actor: String(h.actor),
					kind: String(h.kind),
					message: String(h.message)
				})
			),
			reminders: this.all('SELECT * FROM demo_reminders WHERE enquiry_id=? ORDER BY id', id).map(
				(r) => ({ id: Number(r.id), at: String(r.at), message: String(r.message) })
			)
		};
	}
	dashboard(): DashboardCounts {
		const row = this.one(
			`SELECT count(*) total,sum(e.status='new') new_count,sum(e.fallback=1) fallback_count,sum(e.first_response_at IS NULL AND e.deadline_at < ?) overdue_count,sum(a.status IN ('failed','needs-attention')) failed_count FROM demo_enquiries e JOIN demo_ack_jobs a ON a.enquiry_id=e.id`,
			iso(this.now())
		)!;
		return {
			total: Number(row.total),
			new: Number(row.new_count ?? 0),
			fallback: Number(row.fallback_count ?? 0),
			overdue: Number(row.overdue_count ?? 0),
			failed: Number(row.failed_count ?? 0)
		};
	}
	update(ref: string, patch: StaffUpdate, actor: string): EnquiryDetail {
		if (!patch || typeof patch !== 'object' || Array.isArray(patch))
			throw new DemoError(400, 'Choose a staff action.');
		if (patch.status !== undefined && !['new', 'in-progress', 'resolved'].includes(patch.status))
			throw new DemoError(400, 'Choose New, In progress or Resolved.');
		if (
			patch.note !== undefined &&
			(typeof patch.note !== 'string' || patch.note.trim().length < 1 || patch.note.length > 1000)
		)
			throw new DemoError(400, 'Write a note between 1 and 1,000 characters.', {
				note: 'Write a note between 1 and 1,000 characters.'
			});
		if (patch.recordResponse !== undefined && typeof patch.recordResponse !== 'boolean')
			throw new DemoError(400, 'Choose whether a first response was recorded.');
		this.tx(() => {
			const id = this.require(ref),
				row = this.one('SELECT * FROM demo_enquiries WHERE id=?', id)!;
			if (patch.ownerId !== undefined && patch.ownerId !== row.owner_id) {
				const owner = this.one('SELECT * FROM demo_staff WHERE id=?', String(patch.ownerId));
				if (!owner || !owner.available)
					throw new DemoError(400, 'Choose an available member of staff.');
				this.run(
					'UPDATE demo_enquiries SET owner_id=?,fallback=?,fallback_reason=? WHERE id=?',
					patch.ownerId,
					Number(patch.ownerId === 'coordinator'),
					patch.ownerId === 'coordinator'
						? 'Placed in the Office coordinator queue by a staff member.'
						: null,
					id
				);
				this.history(id, 'assigned', `Assigned to ${owner.name}.`, actor);
			}
			if (patch.note !== undefined) this.history(id, 'note', patch.note.trim(), actor);
			if (patch.recordResponse && !row.first_response_at) {
				const at = iso(this.now());
				this.run(
					'UPDATE demo_enquiries SET first_response_at=?,first_response_by=? WHERE id=? AND first_response_at IS NULL',
					at,
					actor,
					id
				);
				this.history(
					id,
					'first-response',
					'Staff recorded contacting the customer. This manual record is not proof of external delivery.',
					actor,
					at
				);
			}
			if (patch.status !== undefined && patch.status !== row.status) {
				this.run('UPDATE demo_enquiries SET status=? WHERE id=?', patch.status, id);
				this.history(
					id,
					patch.status === 'resolved' ? 'resolved' : 'status',
					`Work status changed to ${patch.status === 'in-progress' ? 'In progress' : patch.status === 'resolved' ? 'Resolved' : 'New'}.`,
					actor
				);
			}
		});
		return this.detail(ref)!;
	}
	sandbox(input: { mode?: FailureMode; advanceMinutes?: number }): DemoSettings {
		if (!input || typeof input !== 'object' || Array.isArray(input))
			throw new DemoError(400, 'Choose a sandbox control.');
		if (input.mode !== undefined && !['succeed', 'fail-next', 'always-fail'].includes(input.mode))
			throw new DemoError(400, 'Choose an available simulated sending mode.');
		if (
			input.advanceMinutes !== undefined &&
			(!Number.isInteger(input.advanceMinutes) ||
				input.advanceMinutes < 1 ||
				input.advanceMinutes > 1440)
		)
			throw new DemoError(400, 'Advance demo time by 1 to 1,440 whole minutes.');
		this.tx(() => {
			if (input.mode !== undefined) this.set('failure_mode', input.mode);
			if (input.advanceMinutes !== undefined)
				this.set(
					'offset_ms',
					String(Number(this.setting('offset_ms')) + input.advanceMinutes * 60_000)
				);
		});
		return this.settings();
	}
	retry(ref: string, actor: string): EnquiryDetail {
		this.tx(() => {
			const id = this.require(ref),
				ack = this.one('SELECT * FROM demo_ack_jobs WHERE enquiry_id=?', id)!;
			if (!['failed', 'needs-attention'].includes(String(ack.status)))
				throw new DemoError(409, 'Only a failed acknowledgement can be retried.');
			this.run(
				"UPDATE demo_ack_jobs SET status='waiting',cycle_attempts=0,next_retry_at=?,last_error=NULL,lease_token=NULL,lease_until=NULL WHERE id=?",
				iso(this.now()),
				ack.id
			);
			this.history(
				id,
				'manual-retry',
				'Manual retry queued for the existing acknowledgement. No new enquiry was created.',
				actor
			);
		});
		return this.detail(ref)!;
	}
	private maintenance(): { reminders: number; recovered: number } {
		const at = iso(this.now());
		let reminders = 0,
			recovered = 0;
		for (const row of this.all(
			"SELECT * FROM demo_ack_jobs WHERE status='processing' AND lease_until<=?",
			at
		)) {
			const exhausted = Number(row.cycle_attempts) >= MAX_ATTEMPTS;
			this.run(
				'UPDATE demo_ack_jobs SET status=?,next_retry_at=?,lease_token=NULL,lease_until=NULL,last_error=? WHERE id=?',
				exhausted ? 'needs-attention' : 'failed',
				exhausted ? null : iso(this.now() + 60_000),
				'A stopped worker left this attempt unfinished. The saved enquiry is safe.',
				row.id
			);
			this.run(
				"UPDATE demo_ack_attempts SET outcome='interrupted',finished_at=?,explanation=? WHERE job_id=? AND number=?",
				at,
				'Worker lease expired before completion.',
				row.id,
				row.attempts
			);
			this.history(
				Number(row.enquiry_id),
				'ack-recovered',
				exhausted
					? 'Stopped worker recovered. Acknowledgement needs attention.'
					: 'Stopped worker recovered. Acknowledgement scheduled to retry in one minute.'
			);
			recovered++;
		}
		for (const row of this.all(
			'SELECT id FROM demo_enquiries WHERE first_response_at IS NULL AND deadline_at < ?',
			at
		)) {
			const result = this.run(
				"INSERT OR IGNORE INTO demo_reminders(enquiry_id,event,at,message) VALUES (?,'first-response-overdue',?,'First response overdue. Contact the customer and record the response.')",
				row.id,
				at
			);
			if (result.changes) {
				reminders++;
				this.history(Number(row.id), 'reminder', 'One overdue first-response reminder created.');
			}
		}
		return { reminders, recovered };
	}
	/** Exposed for restart/concurrency tests and the optional crash simulation CLI. */
	claim(workerId: string = randomUUID()): ClaimedJob | null {
		return this.tx(() => {
			const at = iso(this.now());
			const job = this.one(
				"SELECT * FROM demo_ack_jobs WHERE status IN ('waiting','failed') AND next_retry_at<=? AND cycle_attempts<? ORDER BY next_retry_at,id LIMIT 1",
				at,
				MAX_ATTEMPTS
			);
			if (!job) return null;
			const token = `${workerId.slice(0, 80)}:${randomUUID()}`;
			this.run(
				"UPDATE demo_ack_jobs SET status='processing',attempts=attempts+1,cycle_attempts=cycle_attempts+1,lease_token=?,lease_until=?,next_retry_at=NULL WHERE id=?",
				token,
				iso(this.now() + LEASE_MS),
				job.id
			);
			this.run(
				"INSERT INTO demo_ack_attempts(job_id,number,at,outcome) VALUES (?,?,?,'processing')",
				job.id,
				Number(job.attempts) + 1,
				at
			);
			this.history(
				Number(job.enquiry_id),
				'ack-attempt',
				`Simulated acknowledgement attempt ${Number(job.attempts) + 1} started.`
			);
			return {
				id: Number(job.id),
				ref: refFor(Number(job.enquiry_id)),
				token,
				attempts: Number(job.attempts) + 1
			};
		});
	}
	complete(claim: ClaimedJob): boolean {
		return this.tx(() => {
			const job = this.one(
				"SELECT * FROM demo_ack_jobs WHERE id=? AND status='processing' AND lease_token=? AND lease_until>?",
				claim.id,
				claim.token,
				iso(this.now())
			);
			if (!job) return false;
			const mode = this.setting('failure_mode'),
				failed = mode !== 'succeed';
			if (mode === 'fail-next') this.set('failure_mode', 'succeed');
			const exhausted = Number(job.cycle_attempts) >= MAX_ATTEMPTS;
			const status = !failed ? 'succeeded' : exhausted ? 'needs-attention' : 'failed';
			const next =
				failed && !exhausted
					? iso(this.now() + (Number(job.cycle_attempts) === 1 ? 60_000 : 300_000))
					: null;
			const explanation = failed
				? 'The demonstration email service simulated a temporary failure. No real email was attempted.'
				: null;
			this.run(
				'UPDATE demo_ack_jobs SET status=?,next_retry_at=?,lease_token=NULL,lease_until=NULL,last_error=? WHERE id=?',
				status,
				next,
				explanation,
				job.id
			);
			this.run(
				'UPDATE demo_ack_attempts SET outcome=?,finished_at=?,explanation=? WHERE job_id=? AND number=?',
				failed ? 'failed' : 'succeeded',
				iso(this.now()),
				explanation,
				job.id,
				job.attempts
			);
			this.history(
				Number(job.enquiry_id),
				'ack-result',
				failed
					? exhausted
						? 'Simulated send failed. Automatic retry limit reached; needs attention.'
						: 'Simulated send failed. An automatic retry is scheduled; see the acknowledgement for its local retry time.'
					: 'Simulated send succeeded. The preview stays in the demonstration; no real email was sent.'
			);
			return true;
		});
	}
	tick(workerId: string = randomUUID()): {
		processed: number;
		reminders: number;
		recovered: number;
	} {
		const maintenance = this.tx(() => this.maintenance());
		let processed = 0;
		for (let i = 0; i < 20; i++) {
			const job = this.claim(workerId);
			if (!job) break;
			if (this.complete(job)) processed++;
		}
		return { processed, ...maintenance };
	}
	/** A separately committed worker pass can persist recovery/reminders before claiming. */
	maintenanceOnly(): { reminders: number; recovered: number } {
		return this.tx(() => this.maintenance());
	}
	/** Convert business-clock deadlines back to wall time for an unattended scheduler. */
	nextDueAt(): string | null {
		const row = this.one(`SELECT min(due) due FROM (
			SELECT next_retry_at due FROM demo_ack_jobs WHERE status IN ('waiting','failed')
			UNION ALL SELECT lease_until due FROM demo_ack_jobs WHERE status='processing'
			UNION ALL SELECT deadline_at due FROM demo_enquiries e WHERE first_response_at IS NULL
				AND NOT EXISTS (SELECT 1 FROM demo_reminders r WHERE r.enquiry_id=e.id AND r.event='first-response-overdue')
		)`);
		if (!row?.due) return null;
		// Overdue starts strictly after the deadline; avoid an exact-boundary spin.
		return iso(Date.parse(String(row.due)) - Number(this.setting('offset_ms')) + 1);
	}
	exportSnapshot(): EnquirySnapshot {
		const tables = {} as EnquirySnapshot['tables'];
		for (const [table, limit] of Object.entries(SNAPSHOT_TABLES)) {
			const rows = this.all(`SELECT * FROM ${table} ORDER BY rowid`);
			if (rows.length > limit)
				throw new DemoError(
					429,
					'This temporary demonstration is full. Reset the sample data to continue.'
				);
			tables[table as keyof typeof tables] = rows;
		}
		const snapshot: EnquirySnapshot = { schemaVersion: 1, tables };
		if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_SNAPSHOT_BYTES)
			throw new DemoError(
				429,
				'This temporary demonstration is full. Reset the sample data to continue.'
			);
		return snapshot;
	}
	/** Restore only the known schema; persisted values never become SQL identifiers. */
	importSnapshot(raw: unknown): void {
		const invalid = () =>
			new DemoError(
				503,
				'This demonstration session could not be loaded safely. Start a new session.'
			);
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid();
		const snapshot = raw as Record<string, unknown>;
		if (
			Object.keys(snapshot).sort().join(',') !== 'schemaVersion,tables' ||
			snapshot.schemaVersion !== 1 ||
			!snapshot.tables ||
			typeof snapshot.tables !== 'object' ||
			Array.isArray(snapshot.tables)
		)
			throw invalid();
		const tables = snapshot.tables as Record<string, unknown>;
		const names = Object.keys(SNAPSHOT_TABLES);
		if (Object.keys(tables).sort().join(',') !== [...names].sort().join(',')) throw invalid();
		let encoded: string;
		try {
			encoded = JSON.stringify(snapshot);
		} catch {
			throw invalid();
		}
		if (Buffer.byteLength(encoded, 'utf8') > MAX_SNAPSHOT_BYTES) throw invalid();
		for (const table of names) {
			const rows = tables[table];
			if (
				!Array.isArray(rows) ||
				rows.length > SNAPSHOT_TABLES[table as keyof typeof SNAPSHOT_TABLES]
			)
				throw invalid();
			const columns = this.all(`PRAGMA table_info(${table})`);
			const keys = columns.map((column) => String(column.name));
			for (const row of rows) {
				if (
					!row ||
					typeof row !== 'object' ||
					Array.isArray(row) ||
					Object.keys(row).sort().join(',') !== [...keys].sort().join(',')
				)
					throw invalid();
				for (const column of columns) {
					const value = row[String(column.name)];
					if (value === null) {
						if (column.notnull || column.pk) throw invalid();
						continue;
					}
					if (
						column.type === 'INTEGER' &&
						(!Number.isSafeInteger(value) || (column.pk && value < 1))
					)
						throw invalid();
					if (column.type === 'TEXT' && typeof value !== 'string') throw invalid();
					if (typeof value !== 'number' && typeof value !== 'string') throw invalid();
					if (
						(String(column.name) === 'at' || /_(?:at|until)$/.test(String(column.name))) &&
						(typeof value !== 'string' ||
							!Number.isFinite(Date.parse(value)) ||
							new Date(value).toISOString() !== value)
					)
						throw invalid();
				}
			}
		}
		try {
			this.tx(() => {
				for (const table of [...names].reverse()) this.db.exec(`DELETE FROM ${table}`);
				this.db.exec(
					"DELETE FROM sqlite_sequence WHERE name IN ('demo_enquiries','demo_ack_jobs','demo_ack_attempts','demo_history','demo_reminders')"
				);
				for (const table of names) {
					const rows = tables[table] as Row[];
					if (!rows.length) continue;
					const columns = this.all(`PRAGMA table_info(${table})`).map((column) =>
						String(column.name)
					);
					const statement = this.db.prepare(
						`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`
					);
					for (const row of rows) statement.run(...columns.map((column) => row[column]));
				}
				if (
					!/^\d+$/.test(this.setting('offset_ms')) ||
					!Number.isSafeInteger(Number(this.setting('offset_ms'))) ||
					!['succeed', 'fail-next', 'always-fail'].includes(this.setting('failure_mode'))
				)
					throw invalid();
				if (!this.one("SELECT id FROM demo_staff WHERE id='coordinator' AND available=1"))
					throw invalid();
				if (
					this.one(
						'SELECT e.id FROM demo_enquiries e LEFT JOIN demo_ack_jobs a ON a.enquiry_id=e.id WHERE a.id IS NULL LIMIT 1'
					)
				)
					throw invalid();
			});
		} catch {
			throw invalid();
		}
	}
	seed() {
		if (!this.one('SELECT id FROM demo_enquiries LIMIT 1')) this.reset();
	}
	reset() {
		this.tx(() => this.resetInternal());
	}
	private resetInternal() {
		// Exactly 30 deterministic cases relative to the reset minute; no faker or random names.
		this.tx(() => {
			this.db.exec(
				'DELETE FROM demo_reminders; DELETE FROM demo_history; DELETE FROM demo_ack_attempts; DELETE FROM demo_ack_jobs; DELETE FROM demo_enquiries; DELETE FROM demo_routing; DELETE FROM demo_staff;'
			);
			this.run(
				"DELETE FROM sqlite_sequence WHERE name IN ('demo_enquiries','demo_ack_jobs','demo_ack_attempts','demo_history','demo_reminders')"
			);
			this.set('offset_ms', '0');
			this.set('failure_mode', 'succeed');
			this.initializeStaff();
		});
		const base = Math.floor(this.now() / 60_000) * 60_000;
		const names = [
			'Anika Bose',
			'Kabir Roy',
			'Meera Dutt',
			'Rafiq Ali',
			'Tara Shah',
			'Dev Nair',
			'Nila Paul',
			'Samir Gill',
			'Isha Dean',
			'Rehan Saha'
		];
		const types = ['quotation', 'general', 'existing-job'] as const;
		for (let i = 0; i < 30; i++) {
			const city = i % 2 === 0 ? 'Kolkata' : 'Dubai';
			const type = types[i % 3];
			const { enquiry } = this.submit({
				submissionId: `sample-enquiry-${String(i + 1).padStart(4, '0')}`,
				name: names[i % names.length],
				email: `sample${i + 1}@example.com`,
				city,
				type,
				description:
					type === 'quotation'
						? `Please quote for weekly office maintenance at fictional ${city} workspace ${i + 1}.`
						: type === 'existing-job'
							? `Please check the maintenance visit for fictional workspace ${i + 1}; the meeting room light needs attention.`
							: `Could you explain the available maintenance hours for fictional workspace ${i + 1}?`,
				jobReference: type === 'existing-job' ? `JOB-DEMO-${i + 1}` : ''
			});
			this.tx(() => {
				const id = this.id(enquiry.ref),
					created = base - ((i % 10) + 1) * 3_600_000;
				const status = i % 5 === 4 ? 'resolved' : i % 3 === 2 ? 'in-progress' : 'new';
				const responded = i % 4 === 0 || status === 'resolved';
				this.run(
					'UPDATE demo_enquiries SET created_at=?,deadline_at=?,status=?,first_response_at=?,first_response_by=? WHERE id=?',
					iso(created),
					iso(created + 4 * 3_600_000),
					status,
					responded ? iso(created + 45 * 60_000) : null,
					responded ? 'Mira Sen (sample)' : null,
					id
				);
				this.run('UPDATE demo_history SET at=? WHERE enquiry_id=?', iso(created), id);
				if (responded)
					this.history(
						id,
						'first-response',
						'Sample staff record of customer contact. This is not proof of email delivery.',
						'Mira Sen (sample)',
						iso(created + 45 * 60_000)
					);
				if (status !== 'new')
					this.history(
						id,
						status === 'resolved' ? 'resolved' : 'status',
						`Sample work status: ${status}.`,
						'Office coordinator (sample)',
						iso(created + 50 * 60_000)
					);
				const failed = i === 2 || i === 11;
				const attempts = failed ? 3 : 1;
				this.run(
					'UPDATE demo_ack_jobs SET status=?,attempts=?,cycle_attempts=?,next_retry_at=NULL,last_error=? WHERE enquiry_id=?',
					failed ? 'needs-attention' : 'succeeded',
					attempts,
					attempts,
					failed
						? 'Seeded simulated failure: automatic retry limit reached. The enquiry is safe.'
						: null,
					id
				);
				const job = this.one('SELECT id FROM demo_ack_jobs WHERE enquiry_id=?', id)!;
				for (let attempt = 1; attempt <= attempts; attempt++)
					this.run(
						'INSERT INTO demo_ack_attempts(job_id,number,at,finished_at,outcome,explanation) VALUES (?,?,?,?,?,?)',
						job.id,
						attempt,
						iso(created + attempt * 60_000),
						iso(created + attempt * 60_000),
						failed ? 'failed' : 'succeeded',
						'Reproducible sample attempt; no real email sent.'
					);
				this.history(
					id,
					'ack-result',
					failed
						? 'Seeded simulated acknowledgement failures reached the retry limit; needs attention.'
						: 'Seeded simulated send succeeded; no real email sent.',
					'System',
					iso(created + attempts * 60_000)
				);
			});
		}
		this.tx(() => this.maintenance());
	}
	close() {
		this.db.close();
	}
}
