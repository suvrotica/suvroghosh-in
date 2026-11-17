import type { BoneCategory, BoneId, SkullBoneMetadata, Vec3 } from './types';

function norm(x: number, y: number, z: number): Vec3 {
	const len = Math.hypot(x, y, z) || 1;
	return [Number((x / len).toFixed(5)), Number((y / len).toFixed(5)), Number((z / len).toFixed(5))];
}

export const SKULL_BONES: readonly SkullBoneMetadata[] = [
	{
		id: 'frontal',
		bp3dPartId: 'FJ3200',
		fmaId: 'FMA52734',
		name: 'Frontal bone',
		shortName: 'Frontal',
		commonName: 'Forehead bone',
		latinName: 'Os frontale',
		category: 'neurocranium',
		side: 'midline',
		isMajorLandmark: true,
		anatomicalPosition: [0.01061, 0.32552, 0.52543],
		boundsMin: [-0.62641, -0.0802, 0.20289],
		boundsMax: [0.62654, 1.0097, 0.90969],
		explosionDirection: norm(0.0, 0.58, 0.81),
		explosionDistance: 0.72,
		location: 'Anterior and anterosuperior portion of the neurocranium.',
		functions: [
			'Forms the forehead (frontal squama) and protects the frontal lobes of the brain.',
			'Forms the superior orbital margins and most of the orbital roofs.',
			'Contributes to the floor of the anterior cranial fossa.'
		],
		articulations: [
			'Left and right parietal bones via the coronal suture',
			'Sphenoid bone (greater and lesser wings)',
			'Ethmoid bone (along the ethmoidal notch)',
			'Left and right nasal bones via the frontonasal suture',
			'Left and right maxillae, lacrimal bones, and zygomatic bones'
		],
		landmarks: [
			'Frontal squama and frontal eminences',
			'Glabella and superciliary arches',
			'Supraorbital margin with supraorbital notch or foramen',
			'Zygomatic process of the frontal bone',
			'Orbital plates and frontal sinuses (internal)'
		],
		clinicalSignificance:
			'The supraorbital notch transmits the supraorbital nerve (CN V1) and vessels; the frontal sinus sits immediately deep to the glabella and superciliary arches and drains into the middle nasal meatus.'
	},
	{
		id: 'parietal-left',
		bp3dPartId: 'FJ3274',
		fmaId: 'FMA52789',
		name: 'Left parietal bone',
		shortName: 'L. Parietal',
		commonName: 'Left cranial vault plate',
		latinName: 'Os parietale sinistrum',
		category: 'neurocranium',
		side: 'left',
		pairedGroup: 'parietal',
		isMajorLandmark: true,
		anatomicalPosition: [0.23696, 0.66417, -0.37564],
		boundsMin: [-0.07206, -0.1112, -1.01246],
		boundsMax: [0.75519, 1.0726, 0.4525],
		explosionDirection: norm(0.56, 0.74, -0.36),
		explosionDistance: 0.84,
		location: 'Left superolateral wall and roof of the cranial vault (calvaria).',
		functions: [
			'Forms the greater part of the left side and roof of the neurocranium.',
			'Protects the left parietal lobe and adjacent cerebral cortex.',
			'Provides broad attachment for the temporalis muscle along the temporal lines.'
		],
		articulations: [
			'Right parietal bone across the midline sagittal suture',
			'Frontal bone anteriorly via the coronal suture',
			'Occipital bone posteriorly via the lambdoid suture',
			'Left temporal bone inferiorly via the squamous suture',
			'Greater wing of sphenoid at the pterion'
		],
		landmarks: [
			'Parietal eminence (tuber)',
			'Superior and inferior temporal lines',
			'Parietal foramen (near the sagittal border)',
			'Internal grooves for the middle meningeal vessels'
		],
		clinicalSignificance:
			'The anteroinferior (sphenoidal) angle meets the frontal, sphenoid, and temporal bones at the pterion—the thinnest region of the lateral skull overlying the anterior branch of the middle meningeal artery.'
	},
	{
		id: 'parietal-right',
		bp3dPartId: 'FJ3380',
		fmaId: 'FMA52788',
		name: 'Right parietal bone',
		shortName: 'R. Parietal',
		commonName: 'Right cranial vault plate',
		latinName: 'Os parietale dextrum',
		category: 'neurocranium',
		side: 'right',
		pairedGroup: 'parietal',
		isMajorLandmark: true,
		anatomicalPosition: [-0.29108, 0.62025, -0.32565],
		boundsMin: [-0.75519, -0.1104, -1.01197],
		boundsMax: [0.0548, 1.0729, 0.41415],
		explosionDirection: norm(-0.56, 0.74, -0.36),
		explosionDistance: 0.84,
		location: 'Right superolateral wall and roof of the cranial vault (calvaria).',
		functions: [
			'Forms the greater part of the right side and roof of the neurocranium.',
			'Protects the right parietal lobe and adjacent cerebral hemisphere.',
			'Anchors the superior attachment of the right temporalis muscle and fascia.'
		],
		articulations: [
			'Left parietal bone across the midline sagittal suture',
			'Frontal bone anteriorly via the coronal suture',
			'Occipital bone posteriorly via the lambdoid suture',
			'Right temporal bone inferiorly via the squamous suture',
			'Greater wing of sphenoid at the right pterion'
		],
		landmarks: [
			'Parietal eminence (tuber)',
			'Superior and inferior temporal lines',
			'Parietal foramen',
			'Endocranial grooves for the middle meningeal arterial branches'
		],
		clinicalSignificance:
			'Endocranial vascular grooves along the inner table trace the middle meningeal artery; trauma crossing the pterion risks epidural haematoma formation.'
	},
	{
		id: 'temporal-left',
		bp3dPartId: 'FJ3281',
		fmaId: 'FMA52739',
		name: 'Left temporal bone',
		shortName: 'L. Temporal',
		commonName: 'Left temple & ear bone',
		latinName: 'Os temporale sinistrum',
		category: 'neurocranium',
		side: 'left',
		pairedGroup: 'temporal',
		isMajorLandmark: true,
		anatomicalPosition: [0.49724, -0.16432, -0.03227],
		boundsMin: [0.12286, -0.5344, -0.51346],
		boundsMax: [0.73219, 0.2254, 0.47151],
		explosionDirection: norm(0.95, -0.16, -0.06),
		explosionDistance: 0.86,
		location: 'Left inferior-lateral wall and floor (middle cranial fossa) of the cranium.',
		functions: [
			'Houses the organs of hearing and balance within its dense petrous part.',
			'Forms the mandibular fossa for the left temporomandibular joint (TMJ).',
			'Completes the posterior portion of the left zygomatic arch.'
		],
		articulations: [
			'Left parietal bone via the squamous and parietomastoid sutures',
			'Occipital bone via the occipitomastoid suture',
			'Sphenoid bone anteriorly',
			'Left zygomatic bone via the zygomaticotemporal suture',
			'Mandibular condyle at the temporomandibular joint'
		],
		landmarks: [
			'Squamous, tympanic, mastoid, and petrous parts',
			'External acoustic meatus and mastoid process',
			'Zygomatic process and mandibular (glenoid) fossa',
			'Styloid process, carotid canal, and internal acoustic meatus'
		],
		clinicalSignificance:
			'The petrous temporal bone encloses the cochlea, vestibule, semicircular canals, and facial nerve canal (CN VII); the internal carotid artery enters through the carotid canal on its inferior surface.'
	},
	{
		id: 'temporal-right',
		bp3dPartId: 'FJ3386',
		fmaId: 'FMA52738',
		name: 'Right temporal bone',
		shortName: 'R. Temporal',
		commonName: 'Right temple & ear bone',
		latinName: 'Os temporale dextrum',
		category: 'neurocranium',
		side: 'right',
		pairedGroup: 'temporal',
		isMajorLandmark: true,
		anatomicalPosition: [-0.49737, -0.16219, -0.02883],
		boundsMin: [-0.73327, -0.5335, -0.51403],
		boundsMax: [-0.12033, 0.226, 0.4732],
		explosionDirection: norm(-0.95, -0.16, -0.06),
		explosionDistance: 0.86,
		location: 'Right inferior-lateral wall and floor (middle cranial fossa) of the cranium.',
		functions: [
			'Protects the right middle and inner ear structures inside the petrous pyramid.',
			'Forms the articular socket (mandibular fossa) for the right TMJ.',
			'Provides leverage and attachment for neck muscles (sternocleidomastoid on the mastoid process).'
		],
		articulations: [
			'Right parietal bone via the squamous and parietomastoid sutures',
			'Occipital bone via the occipitomastoid suture',
			'Sphenoid bone anteriorly',
			'Right zygomatic bone via the zygomaticotemporal suture',
			'Mandibular condyle at the right temporomandibular joint'
		],
		landmarks: [
			'External acoustic meatus and articular tubercle',
			'Mastoid process and styloid process',
			'Petrous ridge dividing middle and posterior cranial fossae',
			'Internal acoustic meatus and jugular fossa'
		],
		clinicalSignificance:
			'The mastoid air cells communicate with the middle ear cavity; the stylomastoid foramen between the styloid and mastoid processes is the exit point of the facial nerve (CN VII).'
	},
	{
		id: 'occipital',
		bp3dPartId: 'FJ3309',
		fmaId: 'FMA52735',
		name: 'Occipital bone',
		shortName: 'Occipital',
		commonName: 'Back & base of skull',
		latinName: 'Os occipitale',
		category: 'neurocranium',
		side: 'midline',
		isMajorLandmark: true,
		anatomicalPosition: [0.00162, -0.07686, -0.59847],
		boundsMin: [-0.61299, -0.5115, -1.04417],
		boundsMax: [0.61367, 0.5559, 0.14543],
		explosionDirection: norm(0.0, -0.18, -0.98),
		explosionDistance: 0.84,
		location: 'Posterior wall and posterior inferior floor of the neurocranium.',
		functions: [
			'Forms the posterior cranial fossa housing the cerebellum and brainstem.',
			'Transmits the spinal cord and vertebral arteries through the foramen magnum.',
			'Articulates with the first cervical vertebra (atlas) via the occipital condyles for head nodding.'
		],
		articulations: [
			'Left and right parietal bones via the lambdoid suture',
			'Left and right temporal bones via the occipitomastoid sutures',
			'Sphenoid bone anteriorly at the spheno-occipital synchondrosis (clivus)',
			'Atlas (C1 vertebra) at the paired atlanto-occipital joints'
		],
		landmarks: [
			'Foramen magnum',
			'Paired occipital condyles and hypoglossal canals',
			'External occipital protuberance (inion) and superior/inferior nuchal lines',
			'Basilar part (clivus) and internal cruciform eminence'
		],
		clinicalSignificance:
			'The foramen magnum is the largest cranial opening, transmitting the transition between medulla oblongata and spinal cord, spinal accessory nerve roots (CN XI), and vertebral arteries.'
	},
	{
		id: 'sphenoid',
		bp3dPartId: 'FJ3394',
		fmaId: 'FMA52736',
		name: 'Sphenoid bone',
		shortName: 'Sphenoid',
		commonName: 'Cranial base keystone',
		latinName: 'Os sphenoidale',
		category: 'neurocranium',
		side: 'midline',
		isMajorLandmark: true,
		anatomicalPosition: [0.00076, -0.13145, 0.30303],
		boundsMin: [-0.55658, -0.5001, 0.03997],
		boundsMax: [0.55695, 0.1954, 0.58603],
		explosionDirection: norm(0.0, -0.45, 0.18),
		explosionDistance: 0.24,
		location:
			'Central midline wedge of the cranial base, bridging the anterior and middle cranial fossae and posterior orbits.',
		functions: [
			'Serves as the structural keystone articulating with all other cranial bones.',
			'Houses the pituitary gland within the sella turcica (hypophyseal fossa).',
			'Forms the posterior orbital walls and transmits major cranial nerves through paired canals and fissures.'
		],
		articulations: [
			'Frontal, parietal, temporal, occipital, and ethmoid bones (neurocranium)',
			'Vomer, palatine, zygomatic, and maxillary bones (viscerocranium)'
		],
		landmarks: [
			'Body with sphenoidal sinuses and sella turcica',
			'Lesser wings and optic canals (CN II)',
			'Greater wings with foramen rotundum, foramen ovale, and foramen spinosum',
			'Superior orbital fissure and medial/lateral pterygoid plates'
		],
		clinicalSignificance:
			'The sphenoid transmits cranial nerves II through VI via the optic canal, superior orbital fissure, foramen rotundum (V2), and foramen ovale (V3); the sella turcica protects the pituitary gland.'
	},
	{
		id: 'ethmoid',
		bp3dPartId: 'FJ3199',
		fmaId: 'FMA52740',
		name: 'Ethmoid bone',
		shortName: 'Ethmoid',
		commonName: 'Spongy nasal-roof bone',
		latinName: 'Os ethmoidale',
		category: 'neurocranium',
		side: 'midline',
		isMajorLandmark: true,
		anatomicalPosition: [-0.00024, -0.15419, 0.56053],
		boundsMin: [-0.20832, -0.3164, 0.33409],
		boundsMax: [0.20787, 0.0342, 0.80782],
		explosionDirection: norm(0.0, 0.08, 0.99),
		explosionDistance: 0.36,
		location:
			'Midline anterior cranial base between the two orbits, forming the roof of the nasal cavity and upper nasal septum.',
		functions: [
			'Transmits olfactory nerve filaments (CN I) through the perforated cribriform plate.',
			'Forms the superior half of the bony nasal septum via its perpendicular plate.',
			'Forms the medial orbital walls (orbital plates) and the superior and middle nasal conchae.'
		],
		articulations: [
			'Frontal bone (in the ethmoidal notch)',
			'Sphenoid bone posteriorly',
			'Vomer inferiorly along the nasal septum',
			'Nasal, lacrimal, maxillary, palatine, and inferior nasal concha bones'
		],
		landmarks: [
			'Crista galli (attachment for the falx cerebri)',
			'Cribriform plate with olfactory foramina',
			'Perpendicular plate',
			'Ethmoidal labyrinths (air cells), orbital plates, superior and middle nasal conchae'
		],
		clinicalSignificance:
			'Because the cribriform plate is thin and perforated by olfactory axons, anterior skull-base fractures here can tear the dura and cause cerebrospinal fluid (CSF) rhinorrhoea or anosmia.'
	},
	{
		id: 'nasal-left',
		bp3dPartId: 'FJ3272',
		fmaId: 'FMA53648',
		name: 'Left nasal bone',
		shortName: 'L. Nasal',
		commonName: 'Left nasal bridge bone',
		latinName: 'Os nasale sinistrum',
		category: 'viscerocranium',
		side: 'left',
		pairedGroup: 'nasal',
		isMajorLandmark: false,
		anatomicalPosition: [0.01872, -0.09635, 0.91972],
		boundsMin: [-0.0186, -0.2707, 0.82874],
		boundsMax: [0.07862, 0.0457, 1.03051],
		explosionDirection: norm(0.18, 0.28, 0.94),
		explosionDistance: 0.94,
		location: 'Left half of the superior bony bridge of the external nose.',
		functions: [
			'Forms the left side of the bony nasal bridge.',
			'Provides structural attachment for the lateral nasal cartilages below.'
		],
		articulations: [
			'Right nasal bone across the internasal suture',
			'Frontal bone superiorly via the frontonasal suture',
			'Frontal process of the left maxilla laterally',
			'Perpendicular plate of the ethmoid posteriorly'
		],
		landmarks: [
			'Internasal border and frontonasal margin',
			'Inferior notch supporting the lateral nasal cartilage',
			'Internal groove for the anterior ethmoidal nerve'
		],
		clinicalSignificance:
			'Because the nasal bones project anteriorly as thin plates above cartilage, they are among the most frequently fractured bones of the facial skeleton.'
	},
	{
		id: 'nasal-right',
		bp3dPartId: 'FJ3378',
		fmaId: 'FMA53647',
		name: 'Right nasal bone',
		shortName: 'R. Nasal',
		commonName: 'Right nasal bridge bone',
		latinName: 'Os nasale dextrum',
		category: 'viscerocranium',
		side: 'right',
		pairedGroup: 'nasal',
		isMajorLandmark: false,
		anatomicalPosition: [-0.03493, -0.11115, 0.92934],
		boundsMin: [-0.08487, -0.2775, 0.83169],
		boundsMax: [-0.00079, 0.0427, 1.04417],
		explosionDirection: norm(-0.18, 0.28, 0.94),
		explosionDistance: 0.94,
		location: 'Right half of the superior bony bridge of the external nose.',
		functions: [
			'Forms the right side of the bony nasal bridge.',
			'Protects the superior nasal aperture and anchors nasal cartilage.'
		],
		articulations: [
			'Left nasal bone across the internasal suture',
			'Frontal bone superiorly via the frontonasal suture',
			'Frontal process of the right maxilla laterally',
			'Perpendicular plate of the ethmoid posteriorly'
		],
		landmarks: [
			'Internasal suture margin',
			'Inferior border forming the superior rim of the piriform aperture'
		],
		clinicalSignificance:
			'The nasion—where the internasal and frontonasal sutures intersect—is a key craniometric landmark in anthropology and facial reconstruction.'
	},
	{
		id: 'maxilla-left',
		bp3dPartId: 'FJ3269',
		fmaId: 'FMA53650',
		name: 'Left maxilla',
		shortName: 'L. Maxilla',
		commonName: 'Left upper jawbone',
		latinName: 'Maxilla sinistra',
		category: 'viscerocranium',
		side: 'left',
		pairedGroup: 'maxilla',
		isMajorLandmark: true,
		anatomicalPosition: [0.17722, -0.4639, 0.70749],
		boundsMin: [-0.02406, -0.6493, 0.40398],
		boundsMax: [0.4638, 0.0437, 0.96464],
		explosionDirection: norm(0.32, -0.48, 0.82),
		explosionDistance: 0.82,
		location: 'Left half of the central midface, upper jaw, hard palate, and orbital floor.',
		functions: [
			'Supports the left upper dental arch (eight alveoli; seven teeth modeled here).',
			'Forms the anterior two-thirds of the left hard palate and floor of the nasal cavity.',
			'Forms most of the floor of the left orbit and houses the large maxillary sinus.'
		],
		articulations: [
			'Right maxilla across the intermaxillary suture',
			'Frontal, nasal, lacrimal, zygomatic, ethmoid, palatine, vomer, and inferior concha bones'
		],
		landmarks: [
			'Alveolar process supporting maxillary dentition',
			'Palatine process, frontal process, and zygomatic process',
			'Infraorbital margin and infraorbital foramen (CN V2)',
			'Anterior nasal spine and piriform aperture margin'
		],
		clinicalSignificance:
			'The infraorbital foramen transmits the infraorbital nerve (a branch of the maxillary nerve, CN V2); the roots of the upper premolars and molars lie close beneath the floor of the maxillary sinus.'
	},
	{
		id: 'maxilla-right',
		bp3dPartId: 'FJ3375',
		fmaId: 'FMA53649',
		name: 'Right maxilla',
		shortName: 'R. Maxilla',
		commonName: 'Right upper jawbone',
		latinName: 'Maxilla dextra',
		category: 'viscerocranium',
		side: 'right',
		pairedGroup: 'maxilla',
		isMajorLandmark: true,
		anatomicalPosition: [-0.18219, -0.45604, 0.69575],
		boundsMin: [-0.46895, -0.6493, 0.42958],
		boundsMax: [0.00411, 0.0443, 0.97613],
		explosionDirection: norm(-0.32, -0.48, 0.82),
		explosionDistance: 0.82,
		location: 'Right half of the central midface, upper jaw, hard palate, and orbital floor.',
		functions: [
			'Supports the right upper dental arch and anchors the upper alveolar ridge.',
			'Forms the right anterior hard palate and lateral wall of the nasal cavity.',
			'Forms the medial-inferior orbital rim and orbital floor.'
		],
		articulations: [
			'Left maxilla across the intermaxillary suture',
			'Frontal, nasal, lacrimal, zygomatic, ethmoid, palatine, vomer, and inferior concha bones'
		],
		landmarks: [
			'Alveolar process with dental sockets',
			'Infraorbital foramen and orbital surface',
			'Palatine process and incisive canal margin',
			'Maxillary tuberosity posteriorly'
		],
		clinicalSignificance:
			'Midfacial fractures are classically categorized using the Le Fort I, II, and III planes passing through predictable lines of maxillary weakness.'
	},
	{
		id: 'zygomatic-left',
		bp3dPartId: 'FJ3287',
		fmaId: 'FMA52893',
		name: 'Left zygomatic bone',
		shortName: 'L. Zygomatic',
		commonName: 'Left cheekbone',
		latinName: 'Os zygomaticum sinistrum',
		category: 'viscerocranium',
		side: 'left',
		pairedGroup: 'zygomatic',
		isMajorLandmark: true,
		anatomicalPosition: [0.46387, -0.22155, 0.57264],
		boundsMin: [0.32555, -0.483, 0.35327],
		boundsMax: [0.63906, 0.0782, 0.75016],
		explosionDirection: norm(0.84, -0.14, 0.52),
		explosionDistance: 0.92,
		location: 'Left lateral prominence of the cheek and inferolateral orbital rim.',
		functions: [
			'Forms the prominence of the left cheek and lateral orbital wall.',
			'Bridges the maxilla and temporal bone to form the left zygomatic arch.',
			'Provides origin for the masseter muscle.'
		],
		articulations: [
			'Frontal bone superiorly via the frontozygomatic suture',
			'Left maxilla medially via the zygomaticomaxillary suture',
			'Left temporal bone posteriorly via the zygomaticotemporal suture',
			'Greater wing of the sphenoid within the orbit'
		],
		landmarks: [
			'Frontal, temporal, and maxillary processes',
			'Zygomaticofacial and zygomaticotemporal foramina',
			'Lateral orbital margin'
		],
		clinicalSignificance:
			'Blunt trauma to the cheek commonly produces a zygomaticomaxillary complex ("tripod") fracture involving the zygomatic arch, lateral orbital rim, and orbital floor.'
	},
	{
		id: 'zygomatic-right',
		bp3dPartId: 'FJ3392',
		fmaId: 'FMA52892',
		name: 'Right zygomatic bone',
		shortName: 'R. Zygomatic',
		commonName: 'Right cheekbone',
		latinName: 'Os zygomaticum dextrum',
		category: 'viscerocranium',
		side: 'right',
		pairedGroup: 'zygomatic',
		isMajorLandmark: true,
		anatomicalPosition: [-0.45866, -0.24433, 0.5775],
		boundsMin: [-0.63916, -0.4828, 0.35358],
		boundsMax: [-0.32573, 0.0772, 0.75037],
		explosionDirection: norm(-0.84, -0.14, 0.52),
		explosionDistance: 0.92,
		location: 'Right lateral prominence of the cheek and inferolateral orbital rim.',
		functions: [
			'Forms the right cheek prominence and lateral orbital margin.',
			'Joins the zygomatic process of the right temporal bone to form the right zygomatic arch.',
			'Transmits masticatory forces from the maxilla and masseter to the cranial vault.'
		],
		articulations: [
			'Frontal bone via the right frontozygomatic suture',
			'Right maxilla via the zygomaticomaxillary suture',
			'Right temporal bone via the zygomaticotemporal suture',
			'Sphenoid bone (greater wing)'
		],
		landmarks: [
			'Frontal, temporal, and maxillary processes',
			'Zygomaticofacial foramen',
			'Orbital surface'
		],
		clinicalSignificance:
			'The zygomatic arch frames the temporal fossa superficially and allows passage of the temporalis tendon beneath it toward the coronoid process of the mandible.'
	},
	{
		id: 'lacrimal-left',
		bp3dPartId: 'FJ3265',
		fmaId: 'FMA53646',
		name: 'Left lacrimal bone',
		shortName: 'L. Lacrimal',
		commonName: 'Left tear-duct bone',
		latinName: 'Os lacrimale sinistrum',
		category: 'viscerocranium',
		side: 'left',
		pairedGroup: 'lacrimal',
		isMajorLandmark: false,
		anatomicalPosition: [0.12274, -0.18479, 0.70964],
		boundsMin: [0.07981, -0.3105, 0.64348],
		boundsMax: [0.18593, -0.0204, 0.78316],
		explosionDirection: norm(0.46, 0.14, 0.88),
		explosionDistance: 0.74,
		location: 'Anterior portion of the medial wall of the left orbit.',
		functions: [
			'Forms the posterior half of the lacrimal groove housing the lacrimal sac.',
			'Separates the left orbit from the anterior ethmoidal air cells and nasal cavity.'
		],
		articulations: [
			'Frontal bone superiorly',
			'Ethmoid bone posteriorly',
			'Left maxilla anteriorly and inferiorly',
			'Left inferior nasal concha inferiorly'
		],
		landmarks: [
			'Posterior lacrimal crest',
			'Lacrimal sulcus (groove for the lacrimal sac)',
			'Lacrimal hamulus'
		],
		clinicalSignificance:
			'The lacrimal bone is the smallest and most fragile bone of the facial skeleton; its groove joins the maxilla to form the fossa for the lacrimal sac draining tears into the nasolacrimal duct.'
	},
	{
		id: 'lacrimal-right',
		bp3dPartId: 'FJ3371',
		fmaId: 'FMA53645',
		name: 'Right lacrimal bone',
		shortName: 'R. Lacrimal',
		commonName: 'Right tear-duct bone',
		latinName: 'Os lacrimale dextrum',
		category: 'viscerocranium',
		side: 'right',
		pairedGroup: 'lacrimal',
		isMajorLandmark: false,
		anatomicalPosition: [-0.10858, -0.13977, 0.71914],
		boundsMin: [-0.1738, -0.2704, 0.64531],
		boundsMax: [-0.06824, -0.0157, 0.79094],
		explosionDirection: norm(-0.46, 0.14, 0.88),
		explosionDistance: 0.74,
		location: 'Anterior portion of the medial wall of the right orbit.',
		functions: [
			'Forms part of the medial orbital wall and posterior wall of the nasolacrimal fossa.',
			'Supports the lacrimal sac and medial palpebral drainage pathway.'
		],
		articulations: [
			'Frontal bone superiorly',
			'Ethmoid bone posteriorly',
			'Right maxilla anteriorly and inferiorly',
			'Right inferior nasal concha inferiorly'
		],
		landmarks: ['Posterior lacrimal crest', 'Lacrimal groove', 'Descending process'],
		clinicalSignificance:
			'During dacryocystorhinostomy, surgeons open a window through the thin lacrimal bone to restore tear drainage into the nasal cavity.'
	},
	{
		id: 'palatine-left',
		bp3dPartId: 'FJ3273',
		fmaId: 'FMA53656',
		name: 'Left palatine bone',
		shortName: 'L. Palatine',
		commonName: 'Left posterior palate bone',
		latinName: 'Os palatinum sinistrum',
		category: 'viscerocranium',
		side: 'left',
		pairedGroup: 'palatine',
		isMajorLandmark: false,
		anatomicalPosition: [0.13417, -0.37431, 0.43483],
		boundsMin: [-0.00881, -0.5876, 0.16906],
		boundsMax: [0.2812, -0.1555, 0.63546],
		explosionDirection: norm(0.54, -0.68, 0.18),
		explosionDistance: 0.62,
		location:
			'Deep L-shaped bone between the left maxilla and the sphenoid pterygoid process, forming the back of the hard palate and lateral nasal wall.',
		functions: [
			'Forms the posterior quarter of the hard palate (horizontal plate).',
			'Contributes to the lateral wall of the nasal cavity (perpendicular plate) and a small portion of the orbital floor.',
			'Forms the medial boundary of the pterygopalatine fossa.'
		],
		articulations: [
			'Right palatine bone across the median palatine suture',
			'Left maxilla anteriorly',
			'Sphenoid bone posteriorly and superiorly',
			'Ethmoid, vomer, and left inferior nasal concha'
		],
		landmarks: [
			'Horizontal plate and posterior nasal spine contribution',
			'Perpendicular plate',
			'Greater and lesser palatine foramina',
			'Orbital, sphenoidal, and pyramidal processes'
		],
		clinicalSignificance:
			'The greater palatine foramen transmits the greater palatine nerve and vessels supplying the hard palate mucosa; the sphenopalatine notch forms the sphenopalatine foramen with the sphenoid.'
	},
	{
		id: 'palatine-right',
		bp3dPartId: 'FJ3379',
		fmaId: 'FMA53655',
		name: 'Right palatine bone',
		shortName: 'R. Palatine',
		commonName: 'Right posterior palate bone',
		latinName: 'Os palatinum dextrum',
		category: 'viscerocranium',
		side: 'right',
		pairedGroup: 'palatine',
		isMajorLandmark: false,
		anatomicalPosition: [-0.13329, -0.37684, 0.43747],
		boundsMin: [-0.28148, -0.5847, 0.16897],
		boundsMax: [0.00809, -0.1558, 0.63491],
		explosionDirection: norm(-0.54, -0.68, 0.18),
		explosionDistance: 0.62,
		location: 'Deep L-shaped bone between the right maxilla and the sphenoid pterygoid process.',
		functions: [
			'Completes the right posterior hard palate and nasal cavity floor.',
			'Forms the posterior lateral nasal wall and part of the pterygopalatine fossa.',
			'Contributes a minute orbital process at the posterior orbital floor.'
		],
		articulations: [
			'Left palatine bone across the midline',
			'Right maxilla anteriorly',
			'Sphenoid bone posteriorly',
			'Ethmoid, vomer, and right inferior nasal concha'
		],
		landmarks: [
			'Horizontal plate and perpendicular plate',
			'Greater palatine groove and foramen',
			'Sphenopalatine notch'
		],
		clinicalSignificance:
			'Regional dental nerve blocks target the greater palatine nerve emerging at the junction of the horizontal palatine plate and maxillary alveolar ridge.'
	},
	{
		id: 'inferior-nasal-concha-left',
		bp3dPartId: 'FJ3263',
		fmaId: 'FMA54738',
		name: 'Left inferior nasal concha',
		shortName: 'L. Inf. Concha',
		commonName: 'Left lower nasal scroll bone',
		latinName: 'Concha nasalis inferior sinistra',
		category: 'viscerocranium',
		side: 'left',
		pairedGroup: 'concha',
		isMajorLandmark: false,
		anatomicalPosition: [0.11159, -0.3851, 0.68143],
		boundsMin: [0.05253, -0.4626, 0.47535],
		boundsMax: [0.16602, -0.3087, 0.83064],
		explosionDirection: norm(0.48, -0.36, 0.8),
		explosionDistance: 0.66,
		location: 'Along the lower lateral wall of the left nasal cavity.',
		functions: [
			'Forms the bony core of the left inferior turbinate, increasing mucosal surface area.',
			'Creates turbulent airflow to warm, humidify, and filter inspired air.',
			'Roofs the left inferior nasal meatus where the nasolacrimal duct opens.'
		],
		articulations: [
			'Left maxilla laterally',
			'Left lacrimal bone anterosuperiorly',
			'Ethmoid bone (uncinate process)',
			'Left palatine bone posteriorly'
		],
		landmarks: ['Curved scroll-like body', 'Lacrimal, maxillary, and ethmoidal processes'],
		clinicalSignificance:
			'Unlike the superior and middle nasal conchae (which are parts of the ethmoid), the inferior nasal concha is an independent bone; the nasolacrimal duct drains beneath it into the inferior meatus.'
	},
	{
		id: 'inferior-nasal-concha-right',
		bp3dPartId: 'FJ3369',
		fmaId: 'FMA54737',
		name: 'Right inferior nasal concha',
		shortName: 'R. Inf. Concha',
		commonName: 'Right lower nasal scroll bone',
		latinName: 'Concha nasalis inferior dextra',
		category: 'viscerocranium',
		side: 'right',
		pairedGroup: 'concha',
		isMajorLandmark: false,
		anatomicalPosition: [-0.11182, -0.38616, 0.64769],
		boundsMin: [-0.1587, -0.504, 0.43545],
		boundsMax: [-0.06026, -0.3044, 0.79911],
		explosionDirection: norm(-0.48, -0.36, 0.8),
		explosionDistance: 0.66,
		location: 'Along the lower lateral wall of the right nasal cavity.',
		functions: [
			'Supports the right inferior turbinate mucosa to condition inhaled air.',
			'Partially shields the opening of the right nasolacrimal duct in the inferior meatus.'
		],
		articulations: [
			'Right maxilla laterally',
			'Right lacrimal bone anterosuperiorly',
			'Ethmoid bone (uncinate process)',
			'Right palatine bone posteriorly'
		],
		landmarks: ['Scrolled spongy lamina', 'Lacrimal, maxillary, and ethmoidal processes'],
		clinicalSignificance:
			'Hypertrophy of the erectile mucosa covering the inferior nasal conchae is a common contributor to reversible nasal airway obstruction.'
	},
	{
		id: 'vomer',
		bp3dPartId: 'FJ3395',
		fmaId: 'FMA9710',
		name: 'Vomer',
		shortName: 'Vomer',
		commonName: 'Plowshare septum bone',
		latinName: 'Vomer',
		category: 'viscerocranium',
		side: 'midline',
		isMajorLandmark: false,
		anatomicalPosition: [0.00005, -0.33654, 0.481],
		boundsMin: [-0.05449, -0.5433, 0.24331],
		boundsMax: [0.05473, -0.1081, 0.79385],
		explosionDirection: norm(0.0, -0.56, 0.82),
		explosionDistance: 0.56,
		location: 'Posteroinferior midline of the nasal cavity, forming the lower bony nasal septum.',
		functions: [
			'Forms the posteroinferior part of the bony nasal septum dividing the left and right choanae.',
			'Supports the perpendicular plate of the ethmoid and septal nasal cartilage.'
		],
		articulations: [
			'Sphenoid bone superiorly via its two alae (wings)',
			'Ethmoid perpendicular plate anterosuperiorly',
			'Left and right maxillae and palatine bones inferiorly along the nasal crest'
		],
		landmarks: [
			'Alae (wings) of the vomer clasping the sphenoidal rostrum',
			'Posterior free border separating the posterior nasal apertures (choanae)',
			'Nasopalatine groove'
		],
		clinicalSignificance:
			'Lateral bowing or spurs along the vomer–ethmoid–septal cartilage junction are frequent anatomical causes of deviated nasal septum.'
	},
	{
		id: 'mandible',
		bp3dPartId: 'FJ3289',
		fmaId: 'FMA52748',
		name: 'Mandible',
		shortName: 'Mandible',
		commonName: 'Lower jawbone',
		latinName: 'Mandibula',
		category: 'mandible',
		side: 'midline',
		isMajorLandmark: true,
		anatomicalPosition: [0.00353, -0.67479, 0.45093],
		boundsMin: [-0.53184, -1.0729, 0.03438],
		boundsMax: [0.53173, -0.2282, 0.8735],
		explosionDirection: norm(0.0, -0.88, 0.48),
		explosionDistance: 1.02,
		location: 'Inferior anterior facial skeleton, forming the lower jaw.',
		functions: [
			'Only freely movable bone of the skull proper, articulating at the bilateral temporomandibular joints (TMJ).',
			'Supports the lower dental arch (fourteen permanent teeth modeled here).',
			'Provides powerful leverage for the muscles of mastication and anchors floor-of-mouth muscles.'
		],
		articulations: [
			'Left and right temporal bones (mandibular fossae) at the paired temporomandibular joints'
		],
		landmarks: [
			'Body, mental protuberance, and mental foramina (CN V3)',
			'Mandibular angle, ramus, coronoid process, and condylar process (head and neck)',
			'Alveolar part and mandibular foramen (medial ramus)',
			'Mylohyoid line'
		],
		clinicalSignificance:
			'The inferior alveolar nerve (CN V3) enters the mandibular foramen on the inner ramus and exits anteriorly at the mental foramen as the mental nerve supplying the lower lip and chin.'
	},
	{
		id: 'hyoid',
		bp3dPartId: 'FJ3201',
		fmaId: 'FMA52749',
		name: 'Hyoid bone',
		shortName: 'Hyoid',
		commonName: 'Tongue bone (associated)',
		latinName: 'Os hyoideum',
		category: 'associated',
		side: 'midline',
		isMajorLandmark: false,
		anatomicalPosition: [0.00131, -0.96412, 0.27595],
		boundsMin: [-0.18862, -1.0655, 0.08019],
		boundsMax: [0.18913, -0.8806, 0.42584],
		explosionDirection: norm(0.0, -0.98, 0.16),
		explosionDistance: 1.18,
		location:
			'Associated U-shaped bone suspended in the anterior neck at roughly the C3 vertebral level, inferior to the mandible and superior to the thyroid cartilage.',
		functions: [
			'Serves as a mobile muscular anchor for the tongue, floor of mouth, pharynx, and larynx during swallowing and speech.',
			'Maintains upper airway patency without forming a direct bony joint with the skull.'
		],
		articulations: [
			'No direct osseous articulation; suspended from the temporal styloid processes via the stylohyoid ligaments and anchored by suprahyoid and infrahyoid muscles'
		],
		landmarks: [
			'Central body (corpus)',
			'Paired greater horns (cornua majora)',
			'Paired lesser horns (cornua minora)'
		],
		clinicalSignificance:
			'Because the hyoid bone is anatomically associated with the skull via ligaments and muscles rather than being part of the skull proper, it is displayed as an optional associated structure. In forensic osteology, hyoid integrity is closely examined in neck-trauma investigations.'
	}
] as const;

export const BONE_BY_ID: Readonly<Record<BoneId, SkullBoneMetadata>> = Object.fromEntries(
	SKULL_BONES.map((bone) => [bone.id, bone])
) as Record<BoneId, SkullBoneMetadata>;

export const SKULL_BONE_IDS: readonly BoneId[] = SKULL_BONES.map((bone) => bone.id);

export const BONE_CATEGORY_META: Record<
	BoneCategory,
	{ label: string; subtitle: string; boneCountLabel: string }
> = {
	neurocranium: {
		label: 'Neurocranium',
		subtitle: 'Cranial vault & cranial base (8 bones)',
		boneCountLabel: '8 bones'
	},
	viscerocranium: {
		label: 'Viscerocranium',
		subtitle: 'Upper facial skeleton (13 paired & midline bones)',
		boneCountLabel: '13 bones'
	},
	mandible: {
		label: 'Mandible',
		subtitle: 'Mobile lower jaw (1 bone)',
		boneCountLabel: '1 bone'
	},
	associated: {
		label: 'Associated structures',
		subtitle: 'Suspended neck skeleton (optional hyoid)',
		boneCountLabel: '1 associated bone'
	}
};

export function bonesByCategory(category: BoneCategory): SkullBoneMetadata[] {
	return SKULL_BONES.filter((bone) => bone.category === category);
}

/** Mandible temporomandibular condyle hinge axis in skull-centered scene units. */
export const MANDIBLE_TMJ_PIVOT: Vec3 = [0, -0.27, 0.08];

export const DENTITION_INFO = {
	maxillaLeft: 'Left maxillary alveolar arch (7 permanent teeth modeled in BodyParts3D)',
	maxillaRight: 'Right maxillary alveolar arch (7 permanent teeth modeled in BodyParts3D)',
	mandible: 'Mandibular alveolar arch (14 permanent teeth modeled in BodyParts3D)'
} as const;
