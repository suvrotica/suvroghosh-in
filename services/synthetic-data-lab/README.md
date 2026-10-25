# Synthetic Data Lab service

This FastAPI service runs the same NumPy/SciPy engine for previews, full jobs,
validation and exports. The SvelteKit route proxies it through a private server
boundary. Local mode retains generated data in one service process; hosted mode
persists private result snapshots in Vercel Blob with shared Redis control state.
It is not sent to an external model or written into the repository. Hosted code
is implemented; deployment activation and live verification remain pending.

## Run locally

The repository's `npm run synthetic-data:setup` installs the engine as an editable
package in its dedicated virtual environment, so exported `reproduce.py` scripts
can import it from any folder. Use the Synthetic Data Lab launcher to run the
application. To run this service by itself from this directory:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m pip install --no-deps -e .
# Set SYNTHETIC_DATA_SERVICE_TOKEN to a newly generated random value containing
# at least 24 characters. Use the same value in the private SvelteKit process.
.venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 8765 --workers 1
```

The service refuses startup without `SYNTHETIC_DATA_SERVICE_TOKEN`. Keep that
value out of browser code, public environment variables, command-line arguments,
logs and Git. The SvelteKit server uses `SYNTHETIC_DATA_API_URL` and the service
token to proxy requests. It provides a private owner session using the
`X-Lab-Owner` header. There is deliberately no permissive CORS configuration.

`GET /health` is an unauthenticated liveness response without dataset state. All
ordinary dataset endpoints require `Authorization: Bearer <service token>` and an owner ID
of 16–128 letters, digits, underscores or hyphens in `X-Lab-Owner`.

## HTTP contract

| Endpoint | Behaviour |
| --- | --- |
| `GET /capabilities` | Actual supported distributions, modules and limits |
| `POST /validate` | `{config}` to structured validation errors/warnings |
| `POST /preview` | `{config}` to one bounded, stored preview result |
| `POST /jobs` | `{config, idempotency_key?}`; local queued job or hosted request-bound completed result |
| `GET /jobs/{id}` | Status, progress, stage and completed result metadata |
| `POST /jobs/{id}/cancel` | Local cooperative cancellation (`DELETE` also works); hosted running jobs require aborting the original request |
| `GET /results/{id}?offset=0&limit=200` | Metadata plus a bounded main row page; `table=name` selects a secondary table |
| `GET /results/{id}/download?format=csv` | Exact saved dataset, streamed as CSV |
| `GET /results/{id}/download?format=zip` | Exact dataset plus provenance bundle |
| `GET` or `POST /cleanup` | Hosted only; separate Cron bearer secret, no owner header; not publicly proxied |

`safe=true` enables an explicit spreadsheet protection mode for formula-like
string values. It does not convert negative numeric values to strings. UTF-8 CSV
uses comma separation, CRLF record boundaries and standard quote escaping. Nulls
are empty cells by default; empty strings and nulls are therefore ambiguous in
that mode. Set `null_value` to an explicit nonempty sentinel for unambiguous
missing values. The service rejects a nonempty sentinel that collides with a
serialized non-null value and records its actual encoding in the manifest.
The JSON configuration/schema preserve their declared types and null semantics.

Exports never resample. ZIP files include configuration and effective preview
configuration, schema, a data dictionary, validation, summaries, file checksums,
generator metadata, and a reproduction script. Every secondary table has a named
CSV and schema file under `tables/`, with its row count/file mapping in the
manifest. Preview/result responses include table metadata only; page a selected
table through `table=name`, or download it separately as CSV with that parameter.
Run an extracted bundle's `reproduce.py` with the dedicated virtual environment's
Python. The script resolves files relative to its own location, preserves the
selected spreadsheet-safe and null-sentinel settings, checks generator/NumPy/
SciPy versions before generation, and verifies the regenerated CSV checksum.
Version or checksum mismatches fail with an explicit message. Reproduction needs
the same engine build and supported execution environment as well as these
dependency versions. Reference/empirical values present in the
configuration are included in the bundle, so treat that bundle as potentially
sensitive. Optional diagnostic ground truth is included only if the engine
returns an explicit `ground_truth` artifact and the download requests `truth=true`.
Ordinary preview/results responses omit clean values and diagnostic ground truth.

## Hosted deployment

Deploy this directory as a separate Python Vercel project. Set
`SYNTHETIC_DATA_STORAGE_MODE=blob` (also the automatic default when `VERCEL=1`)
and configure the following private environment values:

- `SYNTHETIC_DATA_SERVICE_TOKEN`: at least 24 random characters, matching the
  SvelteKit server.
- `CRON_SECRET`: a separate random value of at least 24 characters for `/cleanup`.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: a dedicated shared
  Redis control store. `KV_REST_API_URL` and `KV_REST_API_TOKEN` are accepted
  Marketplace aliases. The REST endpoint must use HTTPS.
- A connected **private** Blob store: `BLOB_STORE_ID` and Vercel's injected
  `VERCEL_OIDC_TOKEN`, or a scoped `BLOB_READ_WRITE_TOKEN`.

The SvelteKit server needs only `SYNTHETIC_DATA_API_URL`, the matching service
token and, for a protected deployment, `SYNTHETIC_DATA_DEPLOYMENT_BYPASS`. That
last value becomes the upstream `x-vercel-protection-bypass` header. None of
these values belong in `PUBLIC_` variables or browser code.

Hosted generation stays inside the original request until its cooperative
worker finishes computation and private persistence. It does not depend on
detached post-response work or one warm instance. Full computation has a
120-second budget; hosted previews have 20 seconds, with a bounded 16-second
commit allowance. Native numerical calls cannot be forcibly interrupted. The
UI displays indeterminate progress and Cancel request aborts the original
request; computation does not automatically resume after interruption. Hosted
running-job cancellation by a separate POST returns 409 with that instruction.

Redis Lua admission atomically binds an optional idempotency key to its owner
and configuration, reserves expiring leases, and enforces shared generation,
read and download quotas. At most two generation requests run globally and
per owner; preview and full admission have separate rate buckets. Redis holds
hashed owners, job/result metadata, expiry and retained-size accounting under
`{synthetic-lab-v1}:`. The SvelteKit admission guard remains process-local;
Redis supplies cross-instance backend coordination. This is not a resumable
background queue.

Completed snapshots are gzip JSON at
`synthetic-lab/v1/data/<expiry>/<result-id>.json.gz`, written with explicit
private access and overwrite disabled. Reads require owner-authorized,
unexpired metadata and verify the bounded compressed payload's checksum.
Retained capacity is atomically capped at 24 results/256 MiB of serialized JSON,
128 MiB per result. Capacity pressure can expire the oldest completed result
early; save downloads and configurations for longer use. These do not bound
resident memory or platform charges. Private snapshots can include supplied
empirical values and internal diagnostic truth; ordinary result responses omit
truth, and exports include it only on request.

Every read enforces the 30-minute expiry. Blob deletion is separate: paths are
indexed before upload, generation attempts a bounded opportunistic cleanup
behind a shared one-minute gate, and `vercel.json` declares a daily `/cleanup`
Cron at 03:00 UTC with at most 500 deletions. It requires the separate Cron
bearer secret and is absent from the public proxy allowlist. Expired data is
inaccessible even when physical deletion is delayed or cleanup fails. Verify
actual Cron invocation and private deployment access before claiming activation.

JSON/CSV/ZIP responses stream. Both Vercel routes declare 180 seconds; the
SvelteKit proxy uses deadlines of 150 seconds for full generation, 40 seconds
for previews and 30 seconds otherwise. Its 64 MiB actual-byte response ceiling
continues through streaming. A bound crossed after headers have started errors
the stream and can leave a partial download. Successful site compilation alone
does not verify storage, deployment protection, scheduled cleanup or large
stream delivery.

## Local memory mode and resource limits

Set `SYNTHETIC_DATA_STORAGE_MODE=memory` for a process-local, owner-isolated store
(the default outside Vercel). Run **one long-lived
process with one ASGI worker**. Restarting the service loses jobs/results.
Horizontal scaling and stateless function execution are not supported by this
memory mode; use the hosted adapter above for shared control and snapshots.
Deploy behind the SvelteKit server or another trusted authenticated proxy; do not
expose the shared service token to visitors. A container is supplied for a
long-lived host. Pass its secret through your host's private environment system.

Limits are 100,000 requested rows, 100 columns, two million requested cells,
5,000 preview rows, two computation threads, two active full jobs per owner and
six globally. Jobs use cooperative cancellation and a 120-second generation
budget; preview requests use 28 seconds. The engine checks these cancellation
signals between bounded stages. Threads cannot forcibly interrupt an individual
native numerical operation. Requests have an actual streamed 2 MiB body limit
and a 10-second body-read deadline. The SvelteKit proxy may impose stricter
limits.

At most 24 results and 256 MiB of estimated serialized result data are retained;
each result is capped at 128 MiB. These limits measure serialized JSON size, not
resident process memory: Python objects, working arrays, concurrent jobs and
export buffers add overhead. Limit host memory and concurrent users accordingly.
At most two native generation threads run concurrently. Each CSV/ZIP download
is capped at 64 MiB; an excessive CSV is rejected before response headers rather
than yielding a partial file. ZIP compression often permits larger datasets to
fit within that transfer budget. Completed results/jobs expire after 30 minutes.
The service sweeps expired entries every 30 seconds and on access. Capacity
pressure can evict the oldest completed results sooner; save downloads and
configurations for longer-term use. Results and idempotency keys are isolated by
the proxy-provided owner session. All service responses are private/no-store.

## Tests

```powershell
python -m pytest tests
```

Install `requirements-test.txt` for the hosted Redis fixtures as well as runtime
dependencies. The HTTP tests use deterministic known rows to independently verify CSV quoting,
Unicode and spreadsheet mode; immutable repeat downloads; ZIP checksums and
provenance; owner isolation; config-bound idempotency; body limits; cancellation;
result paging; and retention expiry. Engine tests validate statistical contracts
separately. Hosted tests use separate service instances sharing fake Redis and
private Blob fixtures to cover owner isolation, idempotency, request-bound
execution, retained quotas, expiry and cleanup. Mocked tests do not establish
live infrastructure activation. Record final clean-release test totals and live
acceptance in [the feature guide](../../docs/visualizations/synthetic-data-lab.md).
