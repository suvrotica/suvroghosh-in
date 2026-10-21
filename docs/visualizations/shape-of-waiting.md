# The Shape of Waiting

The Queue-Distribution Laboratory is an ordinary published Visualizations
article at `/blog/visualizations/the-shape-of-waiting`. It studies synthetic
arrivals, service capacity, scheduling and waiting-time distributions. Its
operational priority classes are independent of the Calcutta Queue game's
social-position mechanics. It introduces no endpoint, real customer data,
account, provider, credential or reader profile.

## Publication boundary

The Markdown post explicitly imports the feature's Svelte shell. The generic
blog route supplies SSR text, article SEO, RSS, sitemap, search, category archive
and navigation. `src/lib/visualizations/registry.ts` holds a lightweight gallery
summary; it does not import the model, worker or Canvas renderer. The shell
retains a model-derived poster and explanatory fallback while its interactive
implementation loads.

| Path                                                  | Responsibility                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/lib/posts/the-shape-of-waiting.md`               | Article, metadata, primary methodological links and JavaScript-free poster.                           |
| `src/lib/components/visualizations/shape-of-waiting/` | Per-mount controls, playback, selection, coordinated views and browser lifecycle.                     |
| `src/lib/visualizations/shape-of-waiting/`            | Pure typed demand, discrete-event simulation, snapshots, summaries, bounded replay state and exports. |
| `static/images/visualizations/shape-of-waiting/`      | Model-derived publication artwork and capture provenance.                                             |
| `tests/browser/shape-of-waiting.spec.ts`              | Production-preview controls, responsive layout, downloads, replay, fallback and accessibility checks. |

## Measurement contract

All engine durations use simulated minutes; arrival rates use arrivals per
simulated hour. Waiting time is service start minus arrival/queue-entry time.
Service duration and time in the system are separate quantities.

Mean, median, p90 and maximum describe tickets whose service has started, with
the denominator shown. Live summaries are provisional. A ticket still waiting
has a current waiting age, a lower bound on its eventual wait; it does not
contribute a fabricated finished wait. The interface retains the unresolved
population and the oldest current waiting age alongside the realised
distribution. The article links the [NIST treatment of right
censoring](https://www.itl.nist.gov/div898/handbook/apr/section1/apr131.htm) for
the lower-bound distinction, without claiming to estimate a survival curve.

Quantiles use Hyndman–Fan type 7: sort the sample and linearly interpolate at
zero-based rank `(n − 1) × p`. Empty samples return no value. Class gaps are
maximum minus minimum p90 among classes with observations; a single observed
class has no defined gap.

Abandonment is a separate observed outcome after queue entry. Its fraction uses
attended arrivals to date as the denominator, and its mean wait until departure
uses only abandoned tickets. No-shows are scheduled demand that never joins;
they are counted separately from attended arrivals and from abandonment.

The fairness view reports served-sample class medians and p90s, a class p90 gap,
and the proportion of service starters overtaken by at least one later arrival.
Those measures expose operational objectives rather than resolving them into
one moral score. The classes are synthetic and contain no demographic effects.

Every final result comes from a finite arrivals window starting with an empty
system. When arrivals stop, queued work drains and active service finishes.
Computation bounds produce an explicit incomplete/limit status with the
stopping time and unresolved counts. The results are finite-session outcomes,
not steady-state estimates or recommendations for a real institution.

## Paired experiments

Each demand identity receives reproducible exogenous randomness for arrivals,
service effort, priority, patience and attendance. A policy-only change
preserves that demand. Increasing service variability changes a positive
service distribution while preserving its configured expectation; a finite
sample's realised mean can still fluctuate.

The deliberately overloaded opening uses `OPENING_SETTINGS` from
`presentation.ts`: bank, first come first served, seed 1847, two counters, 60
arrivals per hour and a 180-minute arrivals window. The initial observation is
78 per cent through that window, at 140.4 simulated minutes. This is an
explicitly seeded provisional demonstration. Selecting the ordinary Bank
preset restores the lighter 30-per-hour, 150-minute configuration.

The comparison retains two settings and uses one observation time, fixed
age-colour mapping and coordinated chart scales. Ticket IDs persist across the
views. The headline mean-versus-tail experiment is a tested deterministic
fixture using seed 1817 with `DEMO_SETTINGS` and the ordinary bank demand. Its
observed relationship is evidence about that finite synthetic
sample, not a policy theorem.

## Engine and presentation clocks

The simulation orders scheduled events by time, explicit event precedence and
a stable insertion-order tie-breaker. At equal times the precedence is service
completion, arrival, batch wake-up, dispatch, then patience expiry. A waiting
ticket therefore may start service exactly at its patience deadline. This is a
discrete-event model: animation frames never
create arrivals, consume model randomness or complete service. The [SimPy
scheduling guide](https://simpy.readthedocs.io/en/latest/topical_guides/time_and_scheduling.html)
provides background on deterministic event ordering; this feature implements
its own TypeScript engine.

The current work bounds are 2,000 jobs, 100,000 events and 10,000 simulated
minutes. The normaliser bounds staff to 1–8, arrivals per hour to 1–240, mean
service to 0.1–120 minutes, service coefficient of variation to 0–3, arrivals
window to 10–360 minutes, batch size to 1–12, formation delay to 0–60 minutes,
setup time to 0–30 minutes, no-shows to 0–0.8, expected patience to 0–240
minutes, priority strength to 0–5 and ageing interval to 1–120 minutes. Zero
patience denotes no abandonment deadline. Seeds are integers 0–2,147,483,647.

Bank, visa, railway, call-centre, emergency and inbox presets use Poisson
arrivals. Clinic appointments use an evenly spaced schedule. Railway bursts
compress each half-hour's arrivals into its first 18 per cent. Service work is
lognormal with the requested expected mean and coefficient of variation; zero
variability produces fixed durations. Patience uses a lognormal distribution
with coefficient of variation 0.5. Class probabilities are 0.12, 0.28 and 0.60.
The classes share one service distribution.

Priority ranks lower class IDs first, with FIFO ties; nonzero strength changes
the score's magnitude without changing pure-priority ordering. Ageing subtracts
waiting age divided by the ageing interval from that priority score. Random
selection uses reproducible job-identity and dispatch-index draws. Its
displayed waiting rank is illustrative because each service selection redraws
the ordering. Missed
clinic appointments consume no capacity. A batch occupies one server for its
setup time plus the sum of the members' work, and all its members start and
finish together. It forms when full or when the oldest waiting member reaches
the formation deadline; the same deadline rule handles a final partial batch.

Playback selects a snapshot from the computed run. Pausing, changing speed,
resizing, changing theme and enabling Still do not change its numerical result.
The browser work remains bounded and feature-local. Worker responses carry run
identity so obsolete requests cannot overwrite a newer configuration.

An in-flight worker cannot reopen a comparison the reader has closed. Leaving
a comparison clamps the scalar clock to the retained run's end time so the
slider, snapshot and serialized observation time agree. A worker failure clears
the prior run and its receipts; baseline and export actions remain unavailable
until a new calculation succeeds. This prevents old results from acquiring a
new configuration label after a failed rerun.

The stage's position expresses queue order, colour expresses waiting age on a
fixed scale, and an additional marker expresses class. Canvas holds the crowd;
HTML/SVG holds controls, summaries, distributions and exact inspection. Text
and a semantic table retain the numerical account without Canvas or colour.
When drawing is aggregated, the model's totals remain exact and the oldest
waiting ticket remains individually visible.

## Reproducible receipts

A frozen settings/run/snapshot record supplies the result PNG, JSON and replay
URL. The record includes the model/schema version, seed, observation time,
arrival window, completion status, sample definitions and counts. Replay
validates bounded settings before rerunning the local engine; selection and
animation frames are not serialized. Unsupported or malformed state receives a
visible explanation and safe defaults rather than executing arbitrary input.

Replay version `waiting-1` uses the `#waiting=` URL fragment and an
URI-encoded JSON envelope containing `version`, `settings`, nullable `baseline`
and `time`. The decoder rejects inputs longer than 6,000 characters, unknown
versions, nonfinite or out-of-bound values, invalid enums and booleans, and
settings that would change when normalised. The fragment remains local to the
browser and is not sent in the article request.

The PNG is an editorial receipt, not an independently generated illustration.
Publication poster generation uses the actual simulation and rendering state.
Capture provenance records source and output identities so the feature build
can detect stale artwork.

`npm run shape-of-waiting:assets` bundles the actual pure model, opening
settings, shared geometry and receipt exporter for execution in Chromium.
It produces the 1200 × 630 social plate, 1600 × 1000 poster, companion JSON and
`assets.json` provenance. The verification-only command
`npm run shape-of-waiting:assets:check` requires no running site or browser. It
checks normalised-source SHA-256, decoded-pixel hashes, dimensions, seed,
snapshot time and model version. `features:check` includes that command, so
`build:full` rejects stale model-derived publication assets.

## Verification scope

Focused numerical tests cover hand-calculated queues, event ties, deterministic
replay, population conservation, abandonment, no-shows, quantiles, priorities,
ageing, batching, paired demand and bounded serialization. Browser checks run
against loopback with service workers blocked, covering interactive controls,
real downloads and replay, mobile Still mode, JavaScript-free reading,
keyboard inspection and automated accessibility rules.

The browser lifecycle regression gates the real worker script request before
closing a comparison, then verifies that the late result cannot restore it.
It also aborts a real worker request to test stale-result removal and recovery,
and closes a comparison whose slower baseline extends the shared clock beyond
the retained run. Native slider values are checked against preset outputs so
browser step rounding cannot silently display a different configuration.

The final task handoff records the checks actually run and any material
limitations. These fixtures verify the implemented educational model; they do
not calibrate it against an institution or establish full accessibility
conformance.

On 21 October 2026, all ten browser tests passed against the fresh loopback
production preview in Chromium, with service workers blocked. The automated
WCAG A/AA check recorded zero violations and 20 passing rules. Final captures
were visually inspected at desktop, tablet and mobile sizes; the two
comparison captures were repeated with the sticky site header hidden only for
the element screenshot, so it could not cover their title. The
[browser verification receipt](../../artifacts/shape-of-waiting/verification.json),
compact axe report and five adjacent PNG captures record that evidence. The task
handoff separately records numerical tests, type analysis and the feature
build.

Architecture impact: yes

Architecture rationale: The canonical architecture and contribution gate were
reviewed. The feature adds a dedicated per-mount laboratory, a pure
discrete-event model, a browser-worker boundary and a shared snapshot-to-view
and export flow inside the existing ordinary article route. Section 6 of the
canonical architecture documents those owners and data flow. No endpoint,
shared state manager, route convention or foundational rendering decision
changes, so no additional ADR is required.
