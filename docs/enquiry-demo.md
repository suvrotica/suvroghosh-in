# Stop losing customer enquiries

A working prototype with simulated messaging for the ClinConsult portfolio. The fictional
business, **Example Office Services**, handles office-maintenance enquiries in Kolkata and
Dubai. All sample names, job references and addresses are invented.

> Demonstration only. Please use fictional details. No real emails are sent.

## Public visitor version

The canonical public visitor route is
[https://www.suvroghosh.in/demos/customer-enquiries](https://www.suvroghosh.in/demos/customer-enquiries).
Follow the hosted activation and acceptance procedure below for each release.

When enabled, public mode gives each visitor a private, temporary demonstration. It creates data only
after a customer or staff entry POST. The server owns an opaque session cookie; a public scope
key only separates browser receipts and submission identifiers. Each workspace has its own 30
sample enquiries, notes, routing, message attempts, reminders, demo clock, failure controls and
reset operation. A reference such as `EOS-00031` can exist independently in two workspaces.

Choose **Open my demonstration staff desk** to handle your own fictional enquiries. There is no
shared public staff password. This grants only an eight-hour role within your workspace; it is
not authentication to a real company's records. Workspaces expire after 24 real hours. Advancing
demo time never extends either expiry. Refreshing preserves committed work within that period;
after expiry, start a fresh demonstration. A browser that loses its cookie cannot recover that
temporary workspace.

Public persistence is a private Supabase JSONB snapshot with a checked revision. The server
restores it into the tested SQLite engine, runs the operation, then saves the complete result
with compare-and-swap. A success response follows that durable commit. Function memory and
serverless disk are not persistence. Concurrent saves reload and replay at most four times.
Snapshots contain no authentication tokens or provider credentials.

The supplied hosted worker runs separately from the browser. After activation, an idle-aware
database cron job checks every minute, cleans expired data and invokes the protected Vercel
worker when work is due. A claim
and completion are saved separately; an interrupted claim leaves a recoverable lease. Queue
backlogs, hosted storage outages and function limits can delay processing. A retry reuses the
existing enquiry and job. There is no actual email transport.

Public limits are deliberate: 100 enquiries and 3,000 history events per workspace, 512 KiB
compact snapshot size, 200 active workspaces and 32 MiB total stored state. Creation is limited
to eight workspaces per salted address/hour key and 120 globally per hour. Admission stores a
domain-separated HMAC, not the raw address, and old counters are removed. API admission also has
bounded process-local controls; these are demonstration safeguards, not a production security claim.

## Hosted activation and verification

Use the existing `suvroghoshin` Supabase project and Vercel `suvroghosh-in` project, Node 24.

1. Apply `supabase/migrations/202610260001_enquiry_demo_workspaces.sql` once through the privileged
   migration connection. Keep its ledger record with the exact source. The migration contains no
   seed data or worker activation. Verify forced RLS, denied browser/table access, and storage RPC
   access only for `service_role`.
2. Reuse the existing private `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
   `NOTES_RATE_LIMIT_SALT` (at least 32 characters). Set `ENQUIRY_DEMO_PUBLIC_ENABLED=1` only for
   the intended hosted deployment. Generate a private worker credential, store it in Vercel as
   `ENQUIRY_DEMO_WORKER_SECRET` and in Supabase Vault as `enquiry_demo_worker_secret`.
3. Publish the reviewed source. Confirm the canonical public page and two isolated visitor
   sessions before activating `supabase/enquiry-demo-cron.sql`. That file updates one named job;
   it preserves the separate comment-notification worker and its credentials.
4. Verify `process-enquiry-demonstrations` is active with a minutely schedule. Record a successful
   run and a successful HTTP result, then verify a queued simulated acknowledgement finishes while
   its browser is closed. A saved schedule or successful build alone does not prove the worker ran.

The migration was applied to the existing project `daggtcjyyyznnmvmmfpi` and recorded as
`202610260001`, name `enquiry_demo_workspaces`, on 26 October 2026. Hosted readback confirmed both
tables have forced RLS; `anon`, `authenticated` and direct `service_role` table access are denied;
only the service role can execute the storage RPCs. Record per-release deployment and scheduler
acceptance in the task handoff, using live readback from the reviewed release.

Public-mode tests use the actual SQL through a **loopback-only** PostgreSQL test bridge. The
bridge refuses Vercel execution, has no real credentials and is never an application route.

```sh
npm install --prefix .codex-artifacts/enquiry-demo-sql-runtime --no-save --ignore-scripts @electric-sql/pglite@0.5.11
node node_modules/vitest/vitest.mjs run --config vitest.enquiry-demo.config.ts src/lib/server/enquiry-demo/public-workspaces.test.ts src/lib/server/enquiry-demo/public-snapshot.test.ts src/lib/server/enquiry-demo/public-runtime.test.ts src/lib/server/enquiry-demo/public-repository.test.ts
node --test supabase/tests/enquiry-demo-workspaces.integration.test.mjs
node node_modules/@playwright/test/cli.js test --config playwright.enquiry-demo-public.config.ts
```

The two-case public browser suite uses two independent contexts to check enquiry, note, clock,
failure, retry, reminder, reset and expiry isolation. Its reset-capable configuration rejects a
non-loopback URL. Keep that restriction; live acceptance uses newly created disposable workspaces
and never resets another visitor's data. Network deadlines cancel further storage calls; an
already in-flight commit may have completed, so refresh before retrying an uncertain result.

## Run locally

Use **Node.js 24.11.1** (the verified runtime) and the committed npm lockfile. The prototype uses
Node's built-in SQLite driver and the existing SvelteKit stack; it needs no extra service,
email account, API key or paid AI.

`node:sqlite` is experimental in the verified Node version and prints an experimental-feature
warning. Dependency versions are retained by the existing committed npm lockfile; this feature
adds no package dependency.

From the repository root:

```sh
npm ci
npm run enquiry-demo:setup
npm run enquiry-demo:password
npm run enquiry-demo:dev
```

Open `http://127.0.0.1:4321/demos/customer-enquiries`. The launcher binds only to the local
computer. Use the password printed by the password command to sign in to the staff desk.
The dedicated local Vite configuration inherits the normal application configuration while
disabling the automatic cold-start scan across unrelated portfolio routes.
It excludes local authoring caches, service environments, databases and test output from file
watching, while retaining the application sources and public assets.
Keep that password local. Setup is repeatable and leaves existing sample work intact.

In a second terminal, start the independent worker:

```sh
npm run enquiry-demo:worker
```

Keep the worker running to process waiting acknowledgements, recover expired processing
leases and create overdue reminders. The sandbox also lets an authenticated demonstrator
run one worker pass without starting the continuous process. The browser does not own jobs.

To replace fictional enquiry data with the original 30 cases and reset demo time:

```sh
npm run enquiry-demo:reset -- --confirm
```

The browser reset requires typing `RESET DEMO`. Reset changes the fictional database, so stop
other walkthroughs before using it. Setup stores the database and generated local password
under the ignored `.data/enquiry-demo/` directory. Sessions are stored separately beside the
enquiry database. Do not commit those files.

Private optional environment values:

| Variable                 | Purpose                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `ENQUIRY_DEMO_ENABLED=1` | Enables interactive handlers for loopback requests. The launcher sets it.                           |
| `ENQUIRY_DEMO_DB`        | Absolute or repository-relative path to a local SQLite file. App and worker must use the same path. |
| `ENQUIRY_DEMO_PASSWORD`  | Optional local staff password of at least 16 characters, instead of the generated file.             |
| `ENQUIRY_DEMO_PORT`      | Optional local launcher port; defaults to `4321`.                                                   |

The **local-mode** handlers reject non-loopback URLs and Vercel execution. They are disabled in
ordinary site runs unless explicitly enabled. These guardrails supplement the loopback binding;
they do not make the prototype production-secure.

The interactive screens require JavaScript. Native form fallbacks use POST so a staff password
cannot be placed in a query string before hydration; the JSON-only API safely rejects a native
form request rather than claiming that a change was saved.

## What the saved records mean

An **enquiry** is the customer's saved request, reference, assigned person, work status and
response deadline. Its database transaction also inserts one **acknowledgement job**, so a
receipt is shown only after both records commit. A failed acknowledgement cannot remove the
enquiry. The form identifier prevents the same submission from creating another enquiry;
starting a new form allows a genuinely new request from the same fictional person.

The acknowledgement job contains a stored **message preview**, in the local SQLite database or
the visitor's private hosted snapshot. Each processing attempt
is recorded separately. A simulated success means the fake adapter completed; it does not mean
an external email was sent or delivered. The adapter never contacts an email provider.

A **first response** is an authenticated staff member manually recording that they contacted
the customer. It records the actor and time. Viewing a request or choosing “In progress” does
not count. Recording a response clears the overdue-response warning and leaves the work status
unchanged. Resolving the work is a separate action.

A **reminder** records one overdue first-response event. Its unique enquiry/event key prevents
refreshes or repeated worker passes from creating the same reminder again. Historical reminders
remain in the activity record after contact has been recorded.

## Routing, time and retry rules

The visible routing table maps city and enquiry type to fictional staff. Kolkata quotation
requests reach Mira Sen; Dubai quotation requests reach Leila Noor. Kolkata general enquiries
have no matching rule. Dubai general enquiries point to an unavailable person. Both cases
reach the **Office coordinator** queue with an explanation.

Every new enquiry is due **four elapsed hours** after submission, not business hours. It is
overdue only after that deadline and only while no first response is recorded. Database times
are UTC. The interface labels `Asia/Kolkata` or `Asia/Dubai` local time. The sandbox advances a
persisted offset used by both app and worker; it never changes the computer's clock. Tests use
the same store clock with a fixed injected base time.

The fake adapter supports succeeding, failing the next attempt, or continuing to fail. Temporary
failures retry after one minute and then five minutes, up to three attempts per automatic cycle.
After that, the job needs attention. Staff can manually queue the same job again; the lifetime
attempt count remains visible and no additional enquiry is created.

Worker claims last 60 seconds. A replacement worker recovers an expired claim and schedules
the same job for retry. SQLite transactions and lease tokens prevent two live workers from
completing the same current claim. A future real provider can accept a message just before a
worker crashes, leaving an uncertain outcome; this design does **not** guarantee exactly-once
external email delivery.

## Two-minute demonstration

1. **0:00–0:20:** Show the introduction and safety notice. Choose “Try as a customer”, fill
   sample details and submit a Kolkata quotation. Point out the saved reference and the precise
   acknowledgement wording: a saved enquiry is a different fact from an email send.
2. **0:20–0:40:** Open your demonstration staff desk (or sign in with the local password when
   running locally). Open the new reference and show its assigned
   quotation owner, four-hour deadline, message preview and activity history. Open seeded
   `EOS-00002` to show an unavailable owner's request reaching the Office coordinator.
3. **0:40–1:05:** In the demonstration panel choose “Fail next attempt”. Submit another
   fictional enquiry, then run one worker pass. Show its failed acknowledgement while its
   enquiry remains saved and usable. Record the reference and attempt count.
4. **1:05–1:25:** Choose successful simulated sending and retry that acknowledgement, then
   run one worker pass. Show the same reference, same job and simulated success with a larger
   attempt count. Refresh the page to show persistence.
5. **1:25–1:45:** Advance demo time by 241 minutes and run the worker twice. Show the enquiry's
   overdue warning and exactly one reminder for it. Choose “In progress” and explain that this
   does not record customer contact.
6. **1:45–2:00:** Record first response. Show that the overdue warning clears while the work
   stays in progress. Add a fictional note, then resolve the work separately.

For a **local** worker-restart extension, stop the worker, create another enquiry, close and reopen the
browser, then restart the worker. Its committed pending job remains available. The automated
restart test additionally leaves a job in Processing and proves lease-expiry recovery.

## Checks and evidence

```sh
npm run enquiry-demo:test
npm run enquiry-demo:browser:test
npm run check
npm run test:critical
npm run build:full
git diff --check
```

The focused unit suite covers validation, both fallback reasons, atomic rollback, idempotent
submission, exact time boundaries, staff contact independent of resolution, reminder uniqueness,
retry delays/limits, manual recovery, competing leases, stale claims and database restart.
HTTP tests check authorization and request controls. The browser suite uses a separate fictional
test database and blocks service workers. Screenshots are written under `artifacts/enquiry-demo/`.

Interactive forms require JavaScript. Their native fallback uses POST and is safely rejected
without authenticating or putting entered details into a URL; the browser suite verifies this
for staff sign-in with JavaScript disabled.

`enquiry-demo:test` also launches actual independent worker processes. It stops one after claiming
a message, restarts another after the lease expires, advances the persisted demo clock, and
proves the existing enquiry and message recover with a second attempt.

For browser verification against an already running loopback production preview, set
`PLAYWRIGHT_REUSE_SERVER=1`, `ENQUIRY_DEMO_BASE_URL` to its loopback origin and
`ENQUIRY_DEMO_BROWSER_PASSWORD` to its local staff password. Never target a public URL: these
tests intentionally reset fictional data. The default browser command starts a local dev
server with a separate test database; no credentials are taken from a live account.

Only successful command results establish verification. A build does not prove public hosting,
visitor isolation, real email delivery or production readiness. See the task handoff for actual
commands run and any unrelated repository failures.

The earlier **local-mode** implementation was verified on **26 October 2026**: 26 domain/HTTP tests passed, the separate-process worker
restart test passed, and all four Chromium browser cases passed against the compiled loopback
production preview. The browser checks also reported no uncaught page errors and verified a
390-pixel phone layout without horizontal overflow. Repeated full suites within one minute can
hit the real local admission limit; let that window expire before another complete walkthrough.

For that earlier local implementation, the production build and rendered discoverability check passed, as did `npm run check`
(zero errors and warnings), `npm run test:critical`, and the link collector's 28 regression
fixtures. The full feature lane's artifact checks and notebook preparation passed; after the
link collector correction, the production build and final Barnum route-asset audit were run
explicitly. That audit passed against the repository's applicable route-asset budget. The supplied development launcher
also served the demo successfully after its watcher exclusions were applied.

Those results establish local behavior; they do not verify the added public persistence,
visitor isolation, a deployed public page or an activated hosted worker.

The **public-mode source checks on 26 October 2026** recorded:

| Check                                                                   | Recorded result                                                                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Public repository/runtime/snapshot/workspace unit tests                 | 24 passed                                                                                          |
| Actual migration SQL under the local PostgreSQL-compatible test runtime | 7 passed; no hosted database contacted by these tests                                              |
| Two-case public browser isolation suite                                 | 2 passed against the compiled loopback preview and actual-SQL test bridge; no uncaught page errors |
| `npm run check`                                                         | Zero errors and warnings                                                                           |
| `npm run test:critical`                                                 | 330 passed                                                                                         |
| SEO regression tests                                                    | 57 passed                                                                                          |
| `npm run build:full`, final compiler and Vercel adapter                 | Passed, exit code 0; current main's route-asset budget unchanged                                   |

Local tests and builds establish source behavior. Each hosted release also needs the acceptance
readback required in the activation procedure:

| Hosted acceptance                                                                     | Evidence location                             |
| ------------------------------------------------------------------------------------- | --------------------------------------------- |
| Canonical public page and two isolated visitor workspaces                             | Record per-release checks in the task handoff |
| Active schedule, successful worker HTTP invocation and browser-closed acknowledgement | Record per-release checks in the task handoff |

A successful build alone does not establish the state of a deployed public page or scheduler.

Nine reviewed **local-mode** captures show the [introduction](../artifacts/enquiry-demo/01-introduction.png),
[saved receipt](../artifacts/enquiry-demo/02-customer-receipt.png),
[staff handling](../artifacts/enquiry-demo/03-staff-handling.png),
[simulated failure](../artifacts/enquiry-demo/04-simulated-failure.png),
[recovery](../artifacts/enquiry-demo/05-simulated-recovery.png),
[one overdue reminder](../artifacts/enquiry-demo/06-overdue-reminder.png),
[phone detail screen](../artifacts/enquiry-demo/07-mobile-detail.png),
[sample customer form](../artifacts/enquiry-demo/08-customer-form.png) and
[staff desk with saved enquiry counts](../artifacts/enquiry-demo/09-staff-desk.png).

## Architecture handoff

Architecture impact: yes

Architecture rationale: the canonical architecture was reviewed and updated for per-visitor
Supabase snapshot persistence, scoped staff grants, real-time expiry and a separate protected
hosted worker. [ADR 0017](architecture/decisions/0017-local-enquiry-demo.md) continues to describe
local operation; [ADR 0018](architecture/decisions/0018-public-enquiry-sandboxes.md) records the
public-mode trade-off. Source verification and required hosted-release acceptance are documented
separately above; each release's live evidence belongs in its task handoff.

## Before real customer information or public use

The legacy local mode uses one shared fictional database and **must never be exposed as an
interactive public dashboard**. Public mode supplies the visitor isolation above; it still handles
fictional examples only. Do not enable a shared staff password or point public mode at local files.

Real use would need a reviewed identity/role model, protected hosted persistence, tenant scoping,
durable distributed admission controls, operational backups and recovery, retention/deletion
rules, privacy review, abuse monitoring and accessible operations. The local limiter and honeypot
are basic demonstration measures. Authentication uses one local staff role, not individual staff
accounts or a production account-recovery system. The public staff grant identifies ownership
of a fictional temporary workspace, not a real employee.

Connecting real email is a new integration requiring explicit authorization and credentials.
It would need a server-only provider adapter, provider idempotency where supported, delivery
events, monitoring and a documented policy for uncertain results. Keep the current fake adapter
incapable of sending. Do not substitute the site's existing contact-email integration.

## Portfolio description

**Stop losing customer enquiries** is a working prototype with simulated messaging, built for
the ClinConsult portfolio. It shows how a small business can save each website request, give it
a clear owner and follow up even when an acknowledgement fails. Staff can see overdue first
responses, record customer contact and resolve work separately. Automated tests demonstrate
that repeat submissions do not create duplicate requests, failures preserve saved enquiries,
retries reuse the same message and a stopped worker can recover outstanding jobs. The example
uses fictional data and sends no real emails; it makes no claim about real business results.
