# 0017: Keep the local customer-enquiry prototype transactional

- Date: 26 October 2026
- Status: Accepted for local operation; hosted visitor isolation is added by ADR 0018

## Context

The ClinConsult portfolio needs a working example of an enquiry surviving an email failure.
The repository already uses SvelteKit. A separate CRM, real email provider or hosted database
would add cost and credentials without improving the demonstration. Browser-only storage would
not prove independent worker recovery or server-side staff authorization.

## Decision

Add `/demos/customer-enquiries` to the existing application. Use the Node 24 built-in SQLite
driver in a server-only feature module. One local database stores enquiries, acknowledgement
jobs, individual attempts, reminders, activity and a controllable demo-clock offset. Enquiry
creation, responsibility assignment, deadline and acknowledgement insertion commit in one
transaction. A unique submission identifier makes retries of the same form idempotent.

Run the fake-message worker separately from the browser and application. Claim each message
under a short database lease in an immediate transaction. Expired processing leases become
retryable failures; a token check prevents an old worker from completing a replacement claim.
Persist attempts and bounded retry delays. A unique enquiry/event constraint prevents duplicate
overdue reminders. These are local SQLite coordination guarantees, not a promise of exactly-once
delivery to an external email system.

The fake adapter writes only local preview/attempt data and has no outbound email capability.
Staff sign-in uses a locally generated secret and a server-side session database. Keep secrets
and SQLite files ignored. Enable the interactive demo only through explicit private configuration
and a loopback URL; disable it on Vercel. Bind the supplied launcher to `127.0.0.1`.

Visitor isolation is intentionally outside this small local mode. Do not deploy its
interactive shared staff desk. [ADR 0018](0018-public-enquiry-sandboxes.md) adds a separate public
mode that isolates each visitor's records, sessions, clock, failure controls and reset operations;
it does not turn the local shared database or password into a public service.

## Alternatives

- Browser storage would make a simpler mock-up, but would not demonstrate transactional server
  persistence, protected staff actions or an independent worker.
- Reusing the site's Supabase deployment would require provisioned schema and authorization
  changes for fictional demo data. Local SQLite keeps the prototype self-contained.
- Adding a mail provider would need credentials and could send real messages, contrary to the
  brief. The adapter is intentionally incapable of sending.

## Consequences and verification

Node 24.11.1 is the verified runtime; no Faker, Python service or extra database dependency is
needed. One SQLite file and a small worker are suitable for a demonstration on one computer.
This is not a hosted persistence architecture or production security assurance.

The tests cover validation, routing and fallback, atomic rollback, repeated submission IDs,
elapsed-time boundaries, explicit first-response recording, bounded retries, reminder uniqueness,
leases, restart recovery, persistence and HTTP authorization. Browser tests exercise customer
submission, staff handling and failure recovery. Record actual runs and limitations in
[the demo guide](../../enquiry-demo.md). The canonical architecture is reviewed and updated in
the same change under [the architecture change gate](../../../CONTRIBUTING.md#architecture-change-gate).
