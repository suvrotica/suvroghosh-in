import type { AxisDefinition, ContentAxis } from '../core/types';

export const AXIS_REGISTRY = {
	'autonomy-approval': {
		id: 'autonomy-approval',
		poles: ['autonomy', 'approval']
	},
	'company-solitude': {
		id: 'company-solitude',
		poles: ['company', 'solitude']
	},
	'deliberation-spontaneity': {
		id: 'deliberation-spontaneity',
		poles: ['deliberation', 'spontaneity']
	},
	'stability-change': {
		id: 'stability-change',
		poles: ['stability', 'change']
	},
	'reserve-openness': {
		id: 'reserve-openness',
		poles: ['reserve', 'openness']
	},
	'structure-flexibility': {
		id: 'structure-flexibility',
		poles: ['structure', 'flexibility']
	},
	'confidence-doubt': {
		id: 'confidence-doubt',
		poles: ['confidence', 'doubt']
	},
	'patience-urgency': {
		id: 'patience-urgency',
		poles: ['patience', 'urgency']
	},
	'caution-experimentation': {
		id: 'caution-experimentation',
		poles: ['caution', 'experimentation']
	},
	'directness-diplomacy': {
		id: 'directness-diplomacy',
		poles: ['directness', 'diplomacy']
	},
	'expression-restraint': {
		id: 'expression-restraint',
		poles: ['expression', 'restraint']
	},
	'curiosity-focus': {
		id: 'curiosity-focus',
		poles: ['curiosity', 'focus']
	},
	'idealism-practicality': {
		id: 'idealism-practicality',
		poles: ['idealism', 'practicality']
	},
	'independence-collaboration': {
		id: 'independence-collaboration',
		poles: ['independence', 'collaboration']
	},
	'ambition-contentment': {
		id: 'ambition-contentment',
		poles: ['ambition', 'contentment']
	},
	'optimism-realism': {
		id: 'optimism-realism',
		poles: ['optimism', 'realism']
	},
	'persistence-rest': {
		id: 'persistence-rest',
		poles: ['persistence', 'rest']
	},
	'belonging-individuality': {
		id: 'belonging-individuality',
		poles: ['belonging', 'individuality']
	}
} as const satisfies Record<ContentAxis, AxisDefinition>;

export const CONTENT_AXES = Object.keys(AXIS_REGISTRY).sort() as readonly ContentAxis[];
