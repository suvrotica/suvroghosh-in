import { AUDIT_EXPLANATIONS_EN } from '../data/audit-explanations.en';
import { compileCandidates } from './compile-candidates';

const profile = { sessionSeed: '0000000000000001', selfReports: {} } as const;

// AuditExplanation has no `text`, no approved surface channel, and cannot enter the compiler.
// @ts-expect-error audit-only prose is structurally excluded from surface compilation
compileCandidates(profile, { sentences: AUDIT_EXPLANATIONS_EN });
