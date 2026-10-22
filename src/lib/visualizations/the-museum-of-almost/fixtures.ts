import { validateArchive, type Archive } from './model';

export const ARCHIVE = validateArchive({
	targets: [
		{
			id: 'later-reading-lamp',
			title: 'Later fictional reading lamp',
			contentStatus: 'demonstration',
			summary:
				'A later demonstration object carrying the same one-way keyed connector shape. Only that transferred element is supported by the synthetic follow-up record.',
			provenance: []
		}
	],
	specimens: [
		{
			id: 'lamp',
			title: 'Flat-pack reading lamp',
			version: 'Prototype 03',
			illustration: 'lamp',
			contentStatus: 'demonstration',
			purpose: 'A reading lamp people can assemble from a small box.',
			partId: 'lamp-connector',
			partLabel: 'The similar-looking connectors',
			partExplanation:
				'The original matching-looking parts allow the wrong orientation. The revision has an offset key: the shapes fit together in one direction. The drawing explains the fictional revision; it is not an electrical modification guide.',
			observations: [
				{
					id: 'lamp-misconnection',
					text: 'In a synthetic assembly exercise, people connected two similar-looking parts incorrectly.',
					evidenceIds: ['lamp-assembly']
				}
			],
			interpretations: [
				{
					id: 'lamp-orientation',
					text: 'The connectors may not have communicated orientation clearly.',
					evidenceIds: ['lamp-assembly']
				}
			],
			alternatives: ['The exercise does not isolate every influence on assembly.'],
			unknowns: [
				'Whether the same revision would help other people or other products.',
				'Any real-world safety, reliability or usability outcome.'
			],
			evidence: [
				{
					id: 'lamp-assembly',
					label: 'Synthetic assembly record',
					status: 'fictional',
					purpose: 'observation',
					provenanceIds: [],
					summary:
						'The demonstration record describes wrong connections between similar-looking parts. No measured rate, participant count or universal conclusion is supplied.'
				},
				{
					id: 'lamp-follow-up',
					label: 'Synthetic follow-up assembly record',
					status: 'fictional',
					purpose: 'follow-up',
					provenanceIds: [],
					summary:
						'This fictional follow-up supports the specific one-way keyed connector revision in the later fictional reading lamp. It supports that transfer only, not a universal usability benefit.'
				}
			],
			decision: 'Revise the connector into a keyed shape that fits one way.',
			aftermath:
				'The exact keyed connector shape appears in a later fictional reading lamp. A synthetic follow-up assembly record supports that specific revision.',
			outcome: 'tested-reuse',
			costs: [],
			provenance: [],
			onwardLinks: [
				{
					id: 'lamp-keyed-transfer',
					sourceId: 'lamp',
					targetId: 'later-reading-lamp',
					element: 'The offset one-way keyed connector shape',
					evidenceIds: ['lamp-follow-up'],
					status: 'tested'
				}
			]
		},
		{
			id: 'recorder',
			title: 'Pocket recorder',
			version: 'Prototype 01',
			illustration: 'recorder',
			contentStatus: 'demonstration',
			purpose: 'Capture a spoken thought without looking closely at a screen.',
			partId: 'recorder-controls',
			partLabel: 'The miniature controls',
			partExplanation:
				'The close-set controls are small on the object. An adjacent paper sketch separates and enlarges them. A sketch is a proposal: it has not demonstrated an improvement.',
			observations: [
				{
					id: 'recorder-handling',
					text: 'A synthetic handling exercise found the miniature controls difficult to operate in the intended circumstances.',
					evidenceIds: ['recorder-exercise']
				}
			],
			interpretations: [
				{
					id: 'recorder-layout',
					text: 'The size and arrangement of the controls may have contributed.',
					evidenceIds: ['recorder-exercise']
				}
			],
			alternatives: [
				'The exercise did not isolate control size from control placement or the circumstances of use.'
			],
			unknowns: [
				'Whether larger, separated controls would help.',
				'Whether a later product was built or tested.'
			],
			evidence: [
				{
					id: 'recorder-exercise',
					label: 'Synthetic handling record',
					status: 'fictional',
					purpose: 'observation',
					provenanceIds: [],
					summary:
						'The fictional record describes difficulty operating miniature controls. It does not establish which aspect caused the difficulty or demonstrate a successful revision.'
				}
			],
			decision: 'Sketch larger, separated controls; leave their effect untested.',
			aftermath:
				'An untested layout proposal survives on paper. No later successful product is asserted.',
			outcome: 'untested',
			costs: [],
			onwardLinks: [],
			provenance: []
		},
		{
			id: 'planter',
			title: 'Desk planter',
			version: 'Prototype 04',
			illustration: 'planter',
			contentStatus: 'demonstration',
			purpose: 'A tidy, self-contained object for a desk.',
			partId: 'planter-seam',
			partLabel: 'The leaking seam',
			partExplanation:
				'The seam is the recorded trouble spot. The small detached water mark shows a leak, rather than a measured volume. The repair decision can be explained without inventing a price.',
			observations: [
				{
					id: 'planter-leak',
					text: 'The fictional water-retention record shows a leak at a seam.',
					evidenceIds: ['planter-retention']
				}
			],
			interpretations: [],
			alternatives: [],
			unknowns: [
				'The exact repair estimate and remaining budget.',
				'Any measured leak volume, time spent or material cost.'
			],
			evidence: [
				{
					id: 'planter-retention',
					label: 'Fictional water-retention record',
					status: 'fictional',
					purpose: 'observation',
					provenanceIds: [],
					summary: 'A seam leak is recorded. No quantitative retention measurement is supplied.'
				},
				{
					id: 'planter-stop',
					label: 'Fictional decision record',
					status: 'fictional',
					purpose: 'decision',
					provenanceIds: [],
					summary:
						'The recorded repair estimate exceeded the remaining demonstration-project budget. Neither amount is available.'
				}
			],
			decision:
				'Stop: the recorded repair estimate exceeded the remaining demonstration-project budget.',
			aftermath: 'The record is closed. Nothing is recorded as reused.',
			outcome: 'closed',
			costs: [],
			onwardLinks: [],
			provenance: []
		},
		{
			id: 'page',
			title: 'Subscription-box landing page',
			version: 'Version 02',
			illustration: 'page',
			contentStatus: 'demonstration',
			purpose: 'Explain an offer clearly enough for interested visitors to subscribe.',
			partId: 'page-purchase',
			partLabel: 'The purchase step',
			partExplanation:
				'The page includes an offer and a purchase control. The fictional trial records visits but no subscriptions. That observation cannot tell us which part of the offer or experience mattered.',
			observations: [
				{
					id: 'page-trial',
					text: 'The fictional trial record contains visits but no subscriptions.',
					evidenceIds: ['page-trial-record']
				}
			],
			interpretations: [
				{
					id: 'page-explanations',
					text: 'Visitor intent, the offer, price or purchase friction could each be relevant; these were not isolated.',
					evidenceIds: ['page-trial-record']
				}
			],
			alternatives: ['Visitor intent', 'The offer', 'Price', 'Purchase friction'],
			unknowns: [
				'The reason nobody subscribed in this fictional trial.',
				'The number and origin of visits, trial duration and price.',
				'Any supported lesson or later reuse.'
			],
			evidence: [
				{
					id: 'page-trial-record',
					label: 'Fictional trial record',
					status: 'fictional',
					purpose: 'observation',
					provenanceIds: [],
					summary:
						'Visits are present and subscriptions absent. No count, denominator or controlled comparison is supplied. The record does not identify a cause.'
				}
			],
			decision: 'Archive the trial as inconclusive.',
			aftermath: 'Several explanations remain open. There is no supported lesson or reuse claim.',
			outcome: 'unresolved',
			costs: [],
			onwardLinks: [],
			provenance: []
		}
	]
} satisfies Archive);
