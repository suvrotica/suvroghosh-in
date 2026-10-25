export type City = 'Kolkata' | 'Dubai';
export type EnquiryType = 'quotation' | 'existing-job' | 'general';
export type WorkStatus = 'new' | 'in-progress' | 'resolved';
export type AcknowledgementStatus =
	| 'waiting'
	| 'processing'
	| 'succeeded'
	| 'failed'
	| 'needs-attention';
export type FailureMode = 'succeed' | 'fail-next' | 'always-fail';
export interface SubmissionInput {
	submissionId: string;
	name: string;
	email: string;
	city: City;
	type: EnquiryType;
	description: string;
	jobReference?: string;
	website?: string;
}
export interface StaffMember {
	id: string;
	name: string;
	city: City | null;
	available: boolean;
}
export interface RoutingRule {
	city: City;
	type: EnquiryType;
	intendedOwnerName: string | null;
	assignedOwnerName: string;
	reason: string | null;
}
export interface EnquirySummary {
	ref: string;
	name: string;
	email: string;
	city: City;
	type: EnquiryType;
	description: string;
	jobReference: string;
	ownerId: string;
	ownerName: string;
	fallback: boolean;
	fallbackReason: string | null;
	status: WorkStatus;
	createdAt: string;
	deadlineAt: string;
	firstResponseAt: string | null;
	firstResponseBy: string | null;
	overdue: boolean;
	ackStatus: AcknowledgementStatus;
	attempts: number;
	nextRetryAt: string | null;
}
export interface EnquiryDetail extends EnquirySummary {
	ack: {
		id: number;
		to: string;
		subject: string;
		body: string;
		status: AcknowledgementStatus;
		attempts: number;
		nextRetryAt: string | null;
		error: string | null;
	};
	history: { id: number; at: string; actor: string; kind: string; message: string }[];
	reminders: { id: number; at: string; message: string }[];
}
export interface EnquiryFilters {
	city?: string;
	status?: string;
	ownerId?: string;
	ackStatus?: string;
	query?: string;
}
export interface StaffUpdate {
	ownerId?: string;
	status?: WorkStatus;
	note?: string;
	recordResponse?: boolean;
}
export interface DemoSettings {
	mode: FailureMode;
	now: string;
	offsetMinutes: number;
}
export interface DashboardCounts {
	new: number;
	fallback: number;
	overdue: number;
	failed: number;
	total: number;
}
export const CITY_NAMES: City[] = ['Kolkata', 'Dubai'];
export const ENQUIRY_TYPE_LABELS: Record<EnquiryType, string> = {
	quotation: 'Request a quotation',
	'existing-job': 'Question about an existing job',
	general: 'General enquiry'
};
export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
	new: 'New',
	'in-progress': 'In progress',
	resolved: 'Resolved'
};
export const ACK_STATUS_LABELS: Record<AcknowledgementStatus, string> = {
	waiting: 'Waiting to send',
	processing: 'Processing',
	succeeded: 'Simulated send succeeded',
	failed: 'Failed — retry scheduled',
	'needs-attention': 'Needs attention'
};
