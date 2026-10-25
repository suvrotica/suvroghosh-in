# 0016: Isolate Synthetic Data Lab scientific computation

- Date: 25 October 2026
- Status: Accepted; hosted implementation added, release verification and activation pending

## Context

The interactive synthetic dataset builder needs validated probability distributions,
dependence, event simulation and reusable CSV results. The existing site is SvelteKit on
Vercel and already has browser-local numerical engines. Introducing an unrelated simplified
JavaScript sampler would split the preview and export semantics. Large scientific dependencies
and long-running generation should not be added to every ordinary article request.

## Decision

Keep the public application in the existing SvelteKit site at `/tools/synthetic-data-lab`.
Use a separate optional FastAPI service with NumPy/SciPy. Both preview and full generation
call the same standalone Python package. Use a narrow, authenticated, same-origin SvelteKit
proxy so service credentials and addresses stay on the server.

Create a random HttpOnly browser-owner capability and scope jobs, results and idempotency
records to it. Protect the service with a separate server-to-server bearer token. Enforce
bounded input, work, output, concurrency, time and retention at both appropriate layers.

Use two explicit execution modes. Local `memory` mode runs one long-lived ASGI process with
bounded expiring memory, queued computation threads and cooperative job cancellation. Restarting
that process loses its results. Keep this supported development/container mode; it is not a
distributed job platform.

Hosted `blob` mode runs as a separate Python Vercel project. The original HTTP request awaits
generation and private result persistence before returning. It does not depend on work continuing
after the response or on a warm instance. The UI displays indeterminate generation and aborts
the original request when cancelled. An individual native numerical operation cannot be forcibly
interrupted; cancellation checks run between bounded engine stages.

Use a dedicated shared Redis control store for atomic admission, expiring leases, owner-scoped
job/result metadata, config-bound idempotency and retained-size accounting. Persist immutable
gzip JSON snapshots in private Vercel Blob. Redis stores owner digests and Blob paths; visitors
receive only owner-authorized result IDs through the proxy. Neither a Blob URL nor a deployment
protection bypass is a browser credential. The server-only proxy sends the service bearer token
and, when configured, the private deployment's automation bypass header.

Enforce result expiry independently on every read. Index each Blob path for cleanup before upload,
run bounded opportunistic expiration on writes, and declare a daily authenticated `/cleanup`
Cron. Metadata expiry denies access immediately; physical Blob deletion depends on successful
cleanup and may happen later. Preserve service-independent configuration and provenance for
repeat generation and explicitly identify unsupported factors and combinations.

## Alternatives

- Browser-only JavaScript would reduce deployment dependencies but duplicate scientific
  conventions and depart from the requested Python engine.
- Loading a Python runtime into every browser adds a large runtime/download and another
  compatibility/CSP boundary. It is not necessary for this implementation.
- A detached queue/worker could support resumable jobs beyond request duration but adds a worker
  lifecycle and retry/authorization design. Request-bound execution fits the bounded current
  engine; Redis coordinates shared admission without claiming resumable background computation.

## Consequences and verification

The site remains usable without this optional service; the lab reports an actionable unavailable
state. A site build is not evidence that the service, private Blob, Redis, protection bypass or
Cron has been activated. Hosted mode requires all of those connections and fails closed when
private storage configuration is absent. Full generation has a 120-second compute budget;
hosted previews have 20 seconds, with a further bounded storage-commit window. The proxy allows
150 seconds for full generation, 40 seconds for previews and 30 seconds for other operations;
both route deployments declare 180-second duration limits. JSON/CSV/ZIP responses stream through
the proxy with an actual-byte 64 MiB ceiling. A limit encountered after headers begin terminates
the stream and can produce a partial download; the client must treat a failed transfer as failed.

Shared generation admission is two concurrent requests globally and per owner, using 180-second
leases and minute request quotas. Retention is 30 minutes, at most 24 results and 256 MiB of
serialized result data globally, with 128 MiB per result. These are application accounting limits,
not process resident-memory limits or a platform billing guarantee. Reference-model privacy
requires its own implementation.

Verify the configuration -> browser preview -> API -> Python -> immutable CSV flow, owner
isolation, bounded input/output and cancellation, seeded reproducibility, independent statistical
contracts, and the existing SvelteKit build. Record actual verification in the feature guide.
Also verify two independent service instances against shared state, config-bound retries, failed
and interrupted commits, private snapshot reads, expiry/cleanup, deployment protection and an
export above the platform's ordinary buffered-response threshold. Existing local measurements
do not establish hosted success. Hosted tests and production acceptance remain pending until
their results are recorded. The canonical architecture was reviewed and updated in the same change.

See [architecture sections 1, 6 and 9](../ARCHITECTURE.md) and the
[mandatory change gate](../../../CONTRIBUTING.md#architecture-change-gate).
