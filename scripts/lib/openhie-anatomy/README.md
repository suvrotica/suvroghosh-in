# Anatomy build-time subset

The unmodified `iso-kit.mjs`, `lathe.mjs`, `tube.mjs` and `audit.mjs` files are
vendored from [Ryan's Anatomy project](https://github.com/wheresryan22/anatomy),
installed skill snapshot copied on 22 October 2026. They are used only by
`scripts/generate-openhie-instrument.mjs`; the browser receives generated SVG
strings rather than the authoring kit or audit implementation.

Copyright (c) 2026 Ryan. Distributed under the MIT license in `LICENSE`.

The original file contents are retained so the generated geometry and its audit
use the same mathematical definitions. `tube.mjs` and `lathe.mjs` are transitive
dependencies of the audit even though this figure has no pipes or shaders.
