# Between a click and a page: physical instrument

Size: **Anatomy Hero**, planned as approximately 130 physical solids. The object is a tabletop dispatch and reassembly instrument, not a literal model of the internet's equipment.

One sentence: a request is looked up in a card index, passes through fitted connection couplings and the server workbench, and returns as byte ranges on a guide track before the receiving trays release an ordered document to the browser's easel.

The index, couplings, guide tracks, trays, rack and easel are bolted to one bench. Their working areas are spatially distinct. An optional runtime highlight chooses one area at a time. There are no floating labels or arrows; surrounding exposition supplies names and explains the metaphor's limits.

## Parts planned before geometry

- Bench (15): four foot flanges, four feet, one thick instrument plate, four corner screws, one engraved plate, one measuring strip. The feet touch the plate's underside and are the only grounded objects.
- Address index (20): floor, two cheeks, back, retaining lip, six standing index cards, six fitted card tabs, two handle mounts and one handle bar. The taller cards are behind the shorter ones; all cards stand on the box floor.
- Connection beds (14): two mounting beds, four bearing cheeks, four keyed plug halves, two lock bridges and two knurled thumb knobs. The two neighbouring beds explain two different agreements, TCP and TLS, without suggesting that TCP itself encrypts traffic.
- Transport (16): two channel floors, four guide rails, four end stops, two ruler strips and four fitted channel screws. Both tracks rest on the bench. Each token's footprint fits between the rails.
- Receive buffer (24): four tray floors, eight side rails, four rear stops, four front retaining lips and four received cards. The four slots make a missing byte range visible as a gap. Every card rests on its tray floor.
- Server (about 26): rack floor, four corner posts, far cheek, two rear ties, two shelves, cap, two supported work drawers with front faces and pull handles, listener plinth, listener body and its key. The open near side exposes the work; the drawer levels distinguish parsing and handling rather than depicting required software layers.
- Browser (about 14): easel base, two back posts, backing board, retaining lip, paper, two clips, image block and body strips. All paper elements lie on the backing and remain within its perimeter.

## Geometric and motion contract

The generator vendors no local skill imports. It uses the repository's MIT Anatomy kit and audit helpers. Every physical static part is recorded with the same real slab or cylinder shape used to draw it. `A.settle` measures painter order; `A.auditOrExit` checks static supports, clearance, representation coverage and depth.

The response-token SVG is a small solid built around a screen-space anchor. Its straight path lies on the low return-channel floor, at the floor's top surface, with clearance from both side rails and stops. Runtime delivery hides a travelling token and reveals its corresponding resting receiving card. It does not portray an unaudited diagonal transfer through the bench. Static receiving cards are part of the ordinary geometry audit. The moving token and its route bounds receive a separate explicit world-coordinate clearance check; this is not a full per-frame Anatomy audit of runtime motion.

All engraved rules representing printed words are marked `data-free`; every other detail line is either closed or terminates on an outline. Screenshots and line checks are retained under `.codex-artifacts/http-geometry/` as review evidence, outside the published content.

## Completed instrument and verification

The finished Hero has **145 recorded physical solids**: 15 bench, 20 address-index, 22 coupling, 16 transport, 28 receiving-buffer, 28 server and 16 browser parts. The extra fitted fasteners arose from the 4× detail review; each holds a mounting bed, cap, tray lip or easel base. The server's side panel has closed cooling slots, and the browser's printed image terminates on its frame.

`node src/lib/visualizations/between-a-click-and-a-page/generate-geometry.mjs --check --audit` checks both generated-file freshness and the real static geometry. The settled instrument has 522 measured overlaps and 522 order rules; the audit reports zero unsupported solids, sunk pairs, depth-order problems, uncovered stand-in drawings, crowding and line-route failures. The instrument does not explode, so there are no separate apart poses or replayed motion frames.

Both standalone themes passed the installed Anatomy line checker with zero floating ends. Six 4× close-ups per theme cover the index cards and handle, lock bridges and knobs, channel guides and stops, receiving trays, rack shelves and vent panel, and easel/clip/paper assembly. Those twelve images were inspected. A 390-pixel-wide overview was also captured without horizontal overflow; the published component uses measured per-area crops to keep small mechanisms readable on a phone. Component controls, runtime timing, accessibility and motion checks are recorded by the feature's integration verification rather than inferred from this static geometry audit.

The runtime data contract includes `parts[{id,area,svg}]`, per-area `markers` and `crops`, `projection`, an origin-anchored `token.svg`, two-point `responsePath` and `requestPath`, and four `bufferSlots`. `buffer.card-0` through `buffer.card-3` are the actual supported receiving cards; `browser.page*` identifies the visible page and its content. After drawing response tokens, redraw the parts named by `tokenOccluderIds` so the near channel's guide lip occludes the bottoms correctly.
