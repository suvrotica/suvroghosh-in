# 0021 — Durable resource admission for optional public Chatterbox TTS

- Date: 28 October 2026
- Status: Accepted for implementation; hosted activation requires separate verification
- Canonical reference: [Security, errors and validation](../ARCHITECTURE.md#9-security-errors-and-validation)

## Context

The optional public Chatterbox route accepted anonymous same-origin requests whenever a
provider endpoint was configured. Its byte limits, deadlines, and process-local rate limiter
bounded individual workers, but separate instances did not share an aggregate usage limit.
Origin checks do not authenticate scripts outside a browser. Provider error text was also
copied into public error responses. Static article narration and device speech are separate
features and do not require this endpoint.

## Decision

Preserve anonymous optional narration, with explicit private activation and durable admission
in the existing Supabase database. `CHATTERBOX_TTS_ENABLED=true`, a configured provider,
`CHATTERBOX_TTS_RATE_LIMIT_SALT` of at least 32 random characters, the existing private Supabase
service credentials, and an available quota RPC are all required. Missing configuration,
an unavailable trusted client address, a failed RPC, an uncertain reservation, or an invalid
receipt fails closed before a provider request. The browser-visible flag remains UI only.

Migration `202610280001_chatterbox_usage.sql` adds a private reservation table and one
service-role-only `SECURITY DEFINER` RPC with an empty search path, a one-second lock timeout,
and a transaction-wide advisory lock shared by all application instances. All
direct table and sequence grants are revoked, including service-role grants. Anonymous and
authenticated users cannot call the RPC.

Hard ceilings are 100 calls and 60,000 normalized text characters per UTC day globally,
three calls per keyed client identity per UTC hour, and two starts per 150 seconds globally.
The server submits a daily rotating HMAC of the adapter's client address and the normalized
text length. The database receives no text or raw address. Denied calls allocate no new
identity rows. Expired rows are removed in batches of at most 128 after 48 hours.

Reservations are consumed before transport and never refunded. Start slots are not released
early after success, failure, cancellation, or a crash. This deliberately conservative policy
keeps an ambiguous provider/RPC outcome from reopening capacity and requires no completion
RPC. The five-second quota deadline plus 120-second provider deadline fit within the
150-second start window. This bounds admitted starts; a remote provider that ignores an abort
must enforce its own execution deadline. Application timeouts cannot prove remote work ended.
The SQL work and cleanup are bounded by the admission ceilings. A function-local
`statement_timeout` does not arm a deadline for the statement already running, so this
migration does not claim one; a hosted query deadline requires independently verified
role/session configuration.

Keep the existing 64 KiB/10-second streamed request limit, 3,000-character normalized text
limit, 32 MiB audio cap, process-local guard, and exact Origin/media-type checks. Provider and
quota transports reject redirects. Hosted endpoints require HTTPS; explicit loopback HTTP
URLs remain usable for local self-hosted testing. Provider failures return generic no-store
errors. Logs contain fixed reason labels and, for an HTTP failure, numeric status only;
they do not include provider response bodies, credentials, addresses, or submitted prose.

## Alternatives and consequences

Origin or process-local rate limits alone do not establish shared resource protection.
Requiring owner login would change the public product policy. A new Redis service is
unnecessary because the project already uses atomic Supabase quotas for Prompt Atlas.
Refunds/early release increase throughput but make unknown outcomes and crashes harder to
bound. The modest optional workload permits conservative fixed windows.

These request/character limits are a resource budget, not a monetary spending guarantee.
An operator must independently verify backend billing and configure a provider-side hard
spending limit where available before enabling paid generation. Public clients can still
consume the entire permitted daily budget, and users behind one address share a client
allowance. Changing the ceilings or anonymous policy requires a separate documented review.

Deploy the additive migration through the authorized migration process and verify grants,
then deploy compatible application code and configure the private switch and salt. Without
those steps Chatterbox remains unavailable and device speech/static narration remain usable.
This change does not apply a hosted migration, set hosted variables, or verify live billing.

## Verification

Focused route tests cover private enablement, unavailable quota, exhausted admission,
normalized work accounting, generic provider errors, cancellation, and preserved successful
audio responses. Quota-helper tests exercise receipt validation, transport/body deadlines,
response caps, redirect policy, and keyed identity rotation.

`supabase/tests/chatterbox-usage.integration.test.mjs` executes the migration and role-denial,
aggregate-budget, start-window, cleanup, rollback, and migration-rerun cases in disposable
PGlite PostgreSQL. PGlite queues one database connection, so this verifies transaction and
SQL behavior but does not establish multi-session lock contention, hosted PostgREST grants,
or production deployment. Those remain explicit release verification items.
