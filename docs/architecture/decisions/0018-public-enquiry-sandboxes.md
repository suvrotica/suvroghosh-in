# 0018: Publish isolated temporary enquiry demonstrations

- Date: 26 October 2026
- Status: Accepted

## Context

The user requested a live interactive version of the local ClinConsult enquiry prototype.
Publishing its shared local SQLite file and staff password would expose visitors to one another.
Vercel functions also cannot use their local filesystem as durable shared storage. The existing
site already has a private Supabase connection, so another paid service is unnecessary.

## Decision

Keep SvelteKit, Node 24 and the tested synchronous SQLite domain engine. A public visitor receives
an unpredictable HttpOnly session cookie for a private, 24-hour workspace. Only its SHA-256 digest
is stored. A separate random scope key namespaces browser receipt and submission storage; it
never authorizes a server operation. Public staff access is an explicit, server-recorded grant to
that visitor's own fictional workspace, lasting at most eight hours. The public version never
accepts the local shared staff password or a client-supplied tenant identity.

Supabase stores a bounded JSONB snapshot for each workspace. The server validates and restores a
snapshot into an in-memory SQLite database, executes the existing transaction, and atomically
saves the new snapshot using its expected revision. A conflict reloads and replays the local
operation, at most four times. A successful response follows the durable compare-and-swap commit.
The snapshot is authoritative; function memory and local disk are not persistence.

Each snapshot owns enquiries, acknowledgements, attempts, history, reminders, routing, staff,
failure controls, reset state and demo-clock offset. Snapshot validation limits compact state to
512 KiB, 100 enquiries and 3,000 history events. SQL additionally caps active workspaces and total
state size, serializes quota decisions, limits workspace creation durably and denies browser roles
all direct table and RPC access. Only server-role storage RPCs execute.

A database cron job checks for due work every minute. It removes expired snapshots and, only when
work exists, invokes a bearer-protected Vercel worker. Claims and completions are separate durable
revision updates. Expired leases recover stopped workers, and each overdue event retains its
unique reminder. Delivery remains entirely simulated: this path has no email transport.

The four-hour response deadline uses the visitor's controllable demo clock. Cookie/workspace
expiry, staff grants, quotas and cleanup use real UTC time. Advancing demo time cannot extend
authorization. Every browser mutation retains exact-origin checks, a streamed body limit, a read
deadline and bounded admission; hosted storage calls have independent deadlines and size limits.

## Alternatives and consequences

- A shared local SQLite deployment would neither isolate visitors nor survive serverless restarts.
- Moving every domain table to asynchronous PostgreSQL RPCs would duplicate the tested enquiry
  transaction and worker state machine. Bounded per-visitor snapshots preserve those semantics
  for this small demonstration, at the cost of serializing writes within each workspace.
- Cloudflare Durable Objects could host an isolated SQLite engine and alarm per visitor, but would
  introduce a new deployment and storage-driver boundary instead of reusing the existing site.

This is a fictional portfolio demonstration, not a production customer database. Its public role
is sandbox ownership, not a real staff identity system. Server keys, the worker credential and
private snapshots must never reach client bundles. No real emails, business savings or delivery
guarantees are claimed. A real service would need a separate reviewed identity, data model,
retention, recovery and operational design.

## Verification and activation

Domain, HTTP, repository, migration and two-browser-context tests exercise isolation, expiry,
staff permission, admission, CAS conflicts, resets and restart recovery. The two public browser
cases use separate contexts against a compiled loopback preview and the actual-SQL test bridge.
The runbook records source-check results separately from the acceptance required for each hosted
release. Earlier local-mode browser results alone do not establish public-mode isolation.

The local-only test bridge runs the actual SQL under a PostgreSQL-compatible test runtime and
is rejected on Vercel. The hosted migration has been applied and its role/RLS restrictions read
back. A hosted release requires private flags/worker configuration, deployment of the exact
reviewed source and acceptance with fresh isolated sessions at
`https://www.suvroghosh.in/demos/customer-enquiries`. Worker activation additionally requires a
successful scheduled invocation and acknowledgement processing while its browser is closed.
Record those live readbacks in the release's task handoff; source tests and build success do not
replace them.

See [the canonical architecture](../ARCHITECTURE.md#customer-enquiry-demonstration),
[local implementation decision](0017-local-enquiry-demo.md) and [runbook](../../enquiry-demo.md).
