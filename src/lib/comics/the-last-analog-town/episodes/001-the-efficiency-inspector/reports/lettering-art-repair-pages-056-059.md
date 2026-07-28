# Crop-specific lettering art-repair brief: pages 56–59

Coordinates are normalized to the final printed panel crop, not the uncropped source image. Reserve
sizes are the minimum boxes already proven readable at 16 px or larger by the deterministic
lettering fitter. Preserve the listed story facts and visible props; the repair may restage figures
within the crop to create the stated negative space. Do not add text or balloons to the art.

## p56-02

- **Exact obstruction:** the 4:3 art is vertically cropped into a shallow panel, lifting Riju's head
  into the upper band. Cecil and Riju block the left reserve; Ila and her appeal cards block the
  right. The terminal and linked decision routes occupy `x .28–.71, y .42–.93`, while Ila's appeal
  cards and red ledger close the only cross-panel tail route.
- **Minimum empty reserves:** Riju `x .02–.54, y .02–.41` (`.52 × .39`); Ila
  `x .56–.98, y .02–.34` (`.42 × .32`).
- **Keep fixed:** Riju centre-left operating the terminal; Ila at right with the red ledger and two
  appeal cards; Cecil at left; the terminal, linked decision cards/routes and ledger all fully
  visible.
- **Tail corridors:** short downward corridor from the left reserve to Riju; separate downward-right
  corridor from the right reserve to Ila. Lower the three heads below `y .43` without changing their
  left/centre/right order.

## p56-03

- **Exact obstruction:** Ananya's face closes the upper-left edge, Vale's face and five fanned panes
  close the upper-right, Cecil closes the centre, and the reason trail plus life-domain cards occupy
  the lower two-thirds. The two readable boxes require `.48 × .23` and `.60 × .30`; no two such
  rectangles remain disjoint in the printed crop.
- **Minimum empty reserves:** Ananya `x .02–.50, y .02–.25` (`.48 × .23`); Vale
  `x .38–.98, y .28–.58` (`.60 × .30`).
- **Keep fixed:** Ananya left with the signed reason line, Cecil centre with stamp arm, Vale right
  with five separate life-domain panes; the reason trail and all five cards must remain complete and
  countable.
- **Tail corridors:** clear vertical drop from Ananya's reserve to her face; clear right-edge route
  from Vale's reserve to his face. Restage the faces and fanned panes below/around the two reserves
  while keeping the evidence on the table.

## p56-04

- **Exact obstruction:** the crop pushes Babul, Riju and Ila across the whole upper band. The route
  terminal fills the centre, landmark packets fill the lower-left/centre, and language sheets plus
  Ila's ledger fill the lower-right. Readable boxes require `.46 × .375` and `.47 × .30`.
- **Minimum empty reserves:** Babul `x .02–.48, y .02–.395` (`.46 × .375`); Ila
  `x .51–.98, y .02–.32` (`.47 × .30`).
- **Keep fixed:** Babul left with landmark parcels and document tube; Riju centred at the route
  terminal; Ila right with language sheets and red ledger; both parcels and both sheets visible.
- **Tail corridors:** direct downward tails from each reserve to its same-side speaker. Lower the
  ensemble below `y .42`; do not move a speaker across the centre line.

## p56-06

- **Exact obstruction:** six principals span the upper crop. Vale's current upper-right balloon
  covers Babul's head; every lower placement covers the paper routes, three ink pads, field kit,
  tablet or ledger. Cecil's lower-centre tail must cross the ink-pad evidence and his own body.
- **Minimum empty reserves:** Vale `x .70–.99, y .01–.23` (`.29 × .22`); Cecil
  `x .64–.98, y .27–.41` (`.34 × .14`).
- **Keep fixed:** all six principals; Vale's tablet; Cecil and his stamp arm; the field kit, paper
  routes, exactly three ink-pad positions, Babul's document/tube and Ila's ledger.
- **Tail corridors:** Vale's tail descends left to her face without crossing Babul; Cecil's descends
  left to his head without entering the tablet or ink-pad zones. Restage Babul and Vale below/right
  of the two reserves while retaining the ensemble order.

## p57-01

- **Exact obstruction:** the very wide crop removes much of the blank wall and lifts Babul, Riju,
  Ananya, the patient, Cecil and Vale into the top band. The terminal, case paper, queue/appeal
  stacks, stamp tray and Vale's tablet occupy the lower band. The readable boxes require
  `.64 × .19` and `.38 × .16`.
- **Minimum empty reserves:** Riju `x .02–.66, y .02–.21` (`.64 × .19`); Ananya
  `x .60–.98, y .24–.40` (`.38 × .16`).
- **Keep fixed:** Babul left with the patient record; Riju and Ananya at the clinic terminal; the
  patient visible in back; Cecil with stamp tray; Vale right with tablet; all queue, appeal and case
  evidence readable.
- **Tail corridors:** downward route from the first reserve to Riju and short down-left route from
  the second to Ananya. Lower the ensemble enough to keep both routes out of neighbouring heads.

## p59-05

- **Exact obstruction:** Vale's face sits between the guidance terminal above and tablet below. The
  laboratory equipment occupies `x .51–.73, y .12–.46`; the guidance terminal occupies
  `x .78–.93, y .17–.36`; the tablet occupies `x .76–.90, y .48–.66`. Together they form a
  continuous barrier between the readable Vale balloon and his face. Ila's short reply is already
  clean.
- **Minimum empty reserve:** retain the Vale box at `.26 × .23`, preferably
  `x .72–.98, y .70–.93`; no additional reserve is needed for Ila.
- **Keep fixed:** Ila left with paper; all three children; the laboratory worker and open equipment
  cabinet; guidance terminal; Vale right with tablet; opportunity books and blank guidance cards.
- **Tail corridor:** create at least `.10` normalized clean width along `x .89–.99, y .34–.72`,
  connecting the lower-right reserve to the outside of Vale's face. Keep the tablet visible but
  move it left of the corridor; move the guidance terminal above or left of Vale's head rather than
  deleting it.

## r2 crop-test disposition

The six supplied candidates were imported without normalization: every source already matched its
canonical opaque 8-bit sRGB PNG dimensions. Raw and approved copies are byte-identical. Acceptance
was judged against the final printed crop after deterministic compilation, collision/tail audit,
page assembly and raster review; the source images were not judged in isolation.

| Panel | SHA-256 | Result | Final-crop finding |
| --- | --- | --- | --- |
| p56-02 | `eaf48f01b42f9a7106c021f48cca8eebf9c383838adfde15bd3f144b64bc5dd0` | Accepted as canonical r2 | Both balloons render at 16.24 px or larger; Riju and Ila have separate, unambiguous tails with clear air before their hair. Cecil, both speakers, the terminal, appeal rails/cards and red ledger remain visible. |
| p56-03 | `1c85383fbe610edbc4350dce2bf7e6a13d22334bc72c41dc7114f04db87f962d` | Rejected r2; temporarily restored to r1, later superseded by accepted r4 | The final wide crop lifts Vale into the only usable upper-right reserve, so the Vale balloon overlaps/covers the top of his head and hair. No second 16 px collision-free position remains while Ananya's balloon and the reason/domain evidence are protected. Both r2 files remain as rejected lineage. **Narrow next edit used:** move Vale and the five fanned cards down by about `0.10–0.12` source-normalized height (roughly 110–130 source pixels), keeping Vale's head below source `y ≈ .38` and leaving the upper balloon band empty; do not remove or merge the five cards. |
| p56-04 | `a3b19061cd67bf2263c5c4cfc5eff4509d932f5fc576f260fd1a80bccf085bd4` | Accepted as canonical r2 | Both balloons render at 16.24 px or larger; their downward tails stop in clear air above Babul's and Ila's hair. Babul, Riju, Ila, parcels, route terminal, language sheets, ledger and document tube remain intact. |
| p56-06 | `8e56391b1757ae6535d4041aaaa4a62e893c675a1aab1b2efa879f77cfd280c8` | Accepted as canonical r2 | Vale and Cecil have clean, separately owned routes and comfortably readable type. All six principals, Cecil, field kit, paper routes, three ink-pad positions, tablet and ledger remain visible. |
| p57-01 | `9fd6d6738319f492fb1711ae4b2743c06f0b1486c50b5ed01db5d41e592b81b9` | Accepted as canonical r2 | Riju and Ananya have direct, head-safe tails and readable type. Babul, the patient, Cecil, Vale, terminal, appeal/case evidence, stamp tray and tablet remain visible. |
| p59-05 | `2f8a12d1980627084bd82e9daed3e6ec5b5ead78c7f91faec4f64901496558f3` | Accepted as canonical r2 | Both balloons render at 16.24 px; the Ila and Vale routes are deterministic-safe and visually unambiguous without face/head contact. Ila, Vale, all three children, the laboratory worker, books/cards, laboratory equipment, guidance terminal and tablet remain intact. |

### p56-03 follow-up lineage and final r4 crop

The r2 defect triggered two narrow image-generation revisions rather than broad alternatives.
The first follow-up, preserved as r3 (`call_mlNZ…`,
`aa221a4dbf499caafcc56b97e7a7af96b84c4ad5178228de1ed173c9db8f6232`), lowered Vale and
retained the five fanned domain cards, but its five connected lower cards fell outside the
production 16:9 crop. It was rejected without deletion. The second follow-up
(`call_hmqEhw8Q7OE5sjwwvkAzrPKo.png`) supplied all five fanned cards and all five connected
lower cards. No third image call was made.

The accepted r4 was derived deterministically from that second 1448×1086 source: crop
`left 0, top 155, width 1448, height 869`, then mirror-extend 48 px on each horizontal side to
1544×869. Raw and approved r4 are byte-identical with SHA-256
`3a2cc4c8d812461b9a11c00b63227e422f576c5298d80136204b5e419961ea7a`.
The crop ends at source row 1023, about 20 source pixels below the lower-card border
(about 6.3 px in the assembled panel before its frame), so every lower card remains countable.
Ananya's dark hair begins around r4 row 243; the upper Vale balloon body ends around row 223,
leaving about 20 source pixels of clear air. Vale has substantially more head clearance.

The final two-line Vale balloon and four-line Ananya balloon both render at 16.24 px. Their
speaker routes are deterministic-safe and visually unambiguous, neither balloon touches a face or
head, and all five fanned plus all five connected cards remain visible. p56-03 is therefore
canonical r4 and its geometry is approved.

Two inherited lettering holds were also repaired without changing locked dialogue. `p30-04-d02`
now uses a three-line 16.24 px balloon with a clear Ananya route, and `p58-03-d02` uses a three-line
16.24 px lower-right balloon with a narrow, head-safe route to Vale. Their protected geometry was
refined to the visible evidence rather than broad proxy rectangles.

## Deterministic verification

- **Historical checkpoint:** the counts below originally described this bounded repair pass.
  The current final album supersedes the old test and prompt-hold state: 15/15 Node tests and
  8/8 bundled-Python exporter tests pass, including the ReportLab PDF test; prompt regeneration
  is current; full validation reports 0 errors and 0 warnings.
- The canonical 62-page compile completed, followed by a strict lettering audit with
  `0` missing geometry records, `0` awaiting approval, `0` structure findings and
  `0` collision/routing findings.
- Pages 30, 56, 57, 58 and 59 were reassembled and rerendered. A targeted SVG assertion confirmed
  every repaired balloon at 16.24 px or larger with `data-route-safe="true"`.
- At this historical checkpoint the then-current suite passed 14/14 Node tests and 7/7 runnable
  exporter tests; those counts are retained only as repair lineage and are not the final release
  totals stated above.
- Provenance was regenerated after canonical promotion. The p56-03 r4 source/final paths and
  identical SHA-256 are present. Publication remains gated because human rights fields were
  deliberately not changed in this lettering/art-repair pass.
- The temporary `prompt-manifest-stale` and `prompt-content-stale` findings from this checkpoint
  were later cleared by deterministic prompt regeneration. They are not current findings.
