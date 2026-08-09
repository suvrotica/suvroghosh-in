# Calcutta Footpath Simulator V2 — street art direction

This is an internal construction guide for one fictional, plausible North Calcutta neighbourhood. It is not a reconstruction of a named street and it is not a tourism collage. Every environment element should reinforce ordinary mixed residential and commercial street life at pedestrian scale.

## Reference observations

The reference family is Shobhabazar, Baghbazar/Bosepara, Hatibagan, Kumartuli-adjacent work lanes and the smaller streets feeding Rabindra Sarani. The useful common morphology is a dense mesh of semi-straight or slightly sinuous lanes, abrupt junctions, narrow frontages and frequent changes in usable width. Baghbazar descriptions explicitly note numerous lanes and bylanes; architectural research describes older northern neighbourhoods as a mesh of semi-straight and sinuous alleys.

Photographic references show ordinary two- to four-storey buildings rather than continuous palaces: peeling plaster beside exposed old brick, timber shutters, barred openings, shallow balconies, later steel grilles and shop insertions, cars or bikes consuming one edge, overhead service wires, repair materials, potted plants and domestic washing. Ornate columns or arches are occasional anchors, not the default façade.

Reference sources consulted on 9 August 2026:

- Kolkata Municipal Corporation, [Heritage Buildings](https://www.kmcgov.in/KMCPortal/jsp/HeritageBuildingHome.jsp) and [graded heritage list](https://www.kmcgov.in/KMCPortal/jsp/HeritageList.jsp), for the distribution of protected building types rather than a single “colonial” style.
- Shivashish Bose, _State and management of architectural heritage in Kolkata_ (Jadavpur University), surfaced through the [paper record](https://www.researchgate.net/publication/301704845_State_and_management_of_architectural_heritage_in_Kolkata), for the mixed indigenous and imported architectural vocabulary and dense semi-straight/sinuous street mesh.
- [Biswakosh Lane and Baghbazar’s lanes](https://getbengal.com/north-kolkatas-biswakosh-lane-and-tale-of-bengals-first-encyclopaedia/), for narrow, serpentine connectors.
- [Rabindra Sarani weathered street frontage](https://reportergurvinderblog.wordpress.com/2017/05/14/239/), for exposed brick, timber shutters, service clutter and an inserted street stall.
- [Pathuriaghata street history and façade](https://indianexpress.com/article/cities/kolkata/streetwise-kolkata-prasanna-kumar-tagore-street-castle-road-6302372/), for irregular old-house frontage within an occupied street.
- Search-reference photographs of Shobhabazar, Hatibagan, Jorasanko and Bagbazar were used only to compare scale, colour, parking, wiring and setback. No photograph is copied or used as a texture.

## Scale and street grammar

- World units are metres. The player is 1.72 m tall; ordinary doors are 2.05–2.2 m; storeys are 3.0–3.4 m.
- Residential and old-house lanes are 2.8–4.6 m wide. Bazaar and workshop passages are 3.2–5.2 m. The mixed neighbourhood spine varies from roughly 4.2 to 6 m. The final larger road is 9–10.5 m.
- Frontages are usually 4.5–8 m wide and 7–14 m tall. Depth, setback and parapet height vary. Later additions may be smaller, plainer volumes sitting slightly out of alignment.
- Roads bend a few degrees, pinch at stalls and parked objects, and open suddenly at junctions. There is no rectangular block grid. Dead ends and courtyard-like pockets make the network legible as a place rather than an efficiency diagram.
- Cars are restricted to the wide road and broadest spine segments. Motorbikes and cycles can use mixed lanes. Handcarts and cycle rickshaws require a plausible clearance. Narrow residential connectors remain pedestrian/cycle territory.

## Building kit

Use shared box and plane geometry with seeded variations:

- Mostly plain plaster volumes in faded lime, dusty ochre, smoke-blue, muted salmon, tired green and warm grey; one restrained red landmark building.
- Dark water staining and moss only near drains, shaded bases and leaking pipes. Upper sun-facing walls receive chalking and small repair patches, not universal grime.
- Timber shutters, steel grilles, old doors, rolling shutters and narrow gated passages. Ground-floor shops are inserted into residences rather than separate retail boxes.
- Shallow slabs and railings form balconies; occasional enclosed balconies, cornices, modest columns and arched openings create rare elaborate accents.
- Add drainpipes, electric-meter boxes, cable runs, awnings, tarpaulin, flowerpots and washing selectively. Wires cross overhead at irregular intervals and sag between attachment points.
- Windows and signs retain human scale. Avoid giant decorative signage and avoid making every façade equally detailed.

## Street surface and edge

The road material combines original procedural colour, roughness and bump variation: old asphalt, repaired seams, aggregate, sparse cracks, dusty edges and darker water channels. Geometry supplies shallow potholes, uneven kerbs, broken paving pieces, drain grilles and a few puddles. Paper, leaves and tyre marks are sparse accents. The environment should look maintained unevenly, not abandoned.

Pavement appears in short runs, narrows behind stalls or steps and sometimes vanishes. Road-edge occupation—parked cycle, sleeping dog, handcart, shop display, customer cluster—is a systemic width change used by navigation and simulation.

## Light and atmosphere

The canonical state is a humid late afternoon: warm neutral sunlight, blue-grey ambient fill, strong shade beneath balconies, bright openings at distant junctions and mild atmospheric haze. Sun colour must not become an orange filter. Contact shadows and restrained rough-surface highlights carry more realism than post-processing.

Rain is a later change to the same place: asphalt darkens, puddles gain reflection, runoff appears at pipes, awnings become louder acoustic surfaces and pedestrians seek cover. No motion blur, chromatic aberration, pervasive bloom or shallow depth of field.

## Signs and language

Only original generic businesses are used. Bengali must be real text rendered by the site’s Bengali-capable font stack, paired selectively with English: `চা` (tea), `মিষ্টি` (sweets), `ওষুধ` (medicine), `দর্জি` (tailor), `ফটোকপি` (photocopy), `বৈদ্যুতিক` (electrical) and `মেরামতি` (repair). Other useful words are English-only where that is visually ordinary. No pseudo-Bengali, brands, political material, random religious symbols or trademark-heavy collage.

## Street life and vehicles

Human figures use plausible adult proportions and ordinary shirts, trousers, kurtas, saris and school clothes in restrained colours. Ambient roles include doorway resident, shopkeeper, tea customer, sweeper, conversation pair, balcony observer, cycle walker and delivery worker. Most people do not react to the player.

Vehicle dimensions stay real: cycle about 1.8 m long, motorbike about 2.0 m, cycle rickshaw about 2.6 m, handcart about 2.0–2.5 m and small car about 3.6–4.1 m. A yellow taxi may appear occasionally on the wide road but is never used as a location label.

## Acceptance checklist

Before accepting a capture, hide the HUD and check:

- Does the camera feel roughly three metres high and a few metres behind a 1.72 m person?
- Do widths and building heights remain plausible in metres?
- Is the far street opening brighter and narrower, with real foreground/middle/far depth?
- Are ordinary façades more common than ornate ones?
- Are colours faded and related, rather than candy-saturated?
- Do service wires, parking, shops and domestic detail occupy space without becoming a stereotype checklist?
- Is dirt contextual and sparse enough that the lane still looks inhabited?
- Could the image be mistaken for a generic “India game”? If yes, improve morphology, mixed-use frontage, lane constriction and ordinary local detail before adding landmarks.

Runtime textures are original procedural canvases plus one text-free generated plaster albedo recorded in the asset manifest. Every texture must be inspected in a runtime capture for tiling, impossible openings, malformed Bengali, baked-in figures, trademarks and perspective errors.
