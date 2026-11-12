# Bengali Life Through Impressionist Brushstrokes

From the repository root, install dependencies with `npm ci` if needed, then start the site with
`npm run dev -- --host 127.0.0.1 --port 4198`. Open
[the painting studio](http://127.0.0.1:4198/blog/visualizations/bengali-life-through-impressionist-brushstrokes)
or its [companion article](http://127.0.0.1:4198/blog/visualizations/bengali-life-through-impressionist-brushstrokes-essay).
The studio renders locally in Canvas 2D. The article uses the regular published blog route. Its
editable source is [the Markdown essay](../../src/lib/posts/bengali-life-through-impressionist-brushstrokes-essay.md).

## Reproduce the paintings

These examples are 1200 × 800 and use version 1 with the full 3:2 landscape view. All five
use Stroke density 65%, Light warmth 58%, Edge softness 35%, Paint texture 55%, and Painting
time 10 seconds. The article's example gallery links straight to each scene and its settings.

| Example                                                                                    | Scene                  | Seed          | Brush size |
| ------------------------------------------------------------------------------------------ | ---------------------- | ------------- | ---------- |
| [Finer street](../../static/images/visualizations/bengali-impressionism/street-fine.webp)  | Calcutta street        | `calcutta-27` | 45%        |
| [Broad street](../../static/images/visualizations/bengali-impressionism/street-broad.webp) | Calcutta street        | `calcutta-27` | 78%        |
| [Riverside](../../static/images/visualizations/bengali-impressionism/landing.webp)         | Hooghly-side landing   | `landing-12`  | 45%        |
| [Courtyard](../../static/images/visualizations/bengali-impressionism/courtyard.webp)       | Courtyard and veranda  | `veranda-18`  | 45%        |
| [Pond](../../static/images/visualizations/bengali-impressionism/pond.webp)                 | Pond, path, and fields | `pond-32`     | 45%        |

The query accepts `v`, `scene`, `seed`, `brush`, `density`, `warmth`, `softness`, `texture`,
`time`, and `view`. Use `view=landscape` for the full scene or `view=portrait` for a fixed 3:4
crop. The default view fills the current window around the scene's focal area. Use the same
view or viewport aspect when reproducing a crop. Add `resume=1` to open the finished painting.
On a portrait phone, opening **Controls** reframes the same scene in the space above the sheet.

**Save image** offers PNGs with a 2048- or 4096-pixel long edge, with a 1024-pixel option
for smaller devices. The menu gives the exact dimensions for the current view.

## Browser verification

With a local server running, use `npx playwright test --config playwright.bengali-impressionism.config.ts`.
Set `BENGALI_PAINTING_BASE_URL` to use a different loopback preview. The suite blocks service
workers and compares finished pixels across direct rendering, replay, Finish now, and an
equally sized PNG. It also checks larger PNG dimensions, scene and settings restoration,
keyboard operation, reduced motion, and portrait, short landscape, tablet, desktop, and
narrow viewports.

Run `node scripts/verify-bengali-brushwork.mjs` for browser-level checks of stable stroke
anchors, density subsets, framing, and pixel agreement. Run
`npx vitest run --config vitest.bengali-impressionism.config.ts --maxWorkers=2` for the seeded
scene and figure-placement checks.
