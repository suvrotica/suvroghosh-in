// Types for the meaning and connection map visualization

export interface ConceptNode {
  id: string;
  label: string;
  category: NodeCategory;
  level: ConceptLevel;
  /** Plain-English, clear explanation of what this concept means */
  explanation: string;
  /** Concrete everyday example */
  example: string;
  /** Why this concept matters in the larger landscape */
  significance: string;
  /** Atomic decomposition: simpler constituent ideas */
  constituents: string[];
  /** Visual position (assigned by layout) */
  x?: number;
  y?: number;
  /** Cached force position */
  fx?: number | null;
  fy?: number | null;
}

export type NodeCategory =
  | 'foundation'
  | 'thinking-tool'
  | 'social-dynamic'
  | 'systems'
  | 'ai-ml'
  | 'data-engineering'
  | 'software-engineering'
  | 'research-methods';

export type ConceptLevel = 0 | 1 | 2 | 3;
// 0 = atomic / primitive idea
// 1 = mechanism
// 2 = sub-concept
// 3 = high-level concept

export interface ConceptEdge {
  source: string;
  target: string;
  relationship: RelationshipType;
  /** Explanation of why these two concepts are connected */
  explanation: string;
}

export type RelationshipType =
  | 'contains'
  | 'depends-on'
  | 'causes'
  | 'enables'
  | 'constrains'
  | 'is-example-of'
  | 'is-consequence-of'
  | 'is-prerequisite-for'
  | 'contrasts-with'
  | 'reinforces'
  | 'competes-with'
  | 'emerges-from'
  | 'is-measured-by'
  | 'is-confused-with'
  | 'is-special-case-of'
  | 'formalizes'
  | 'provides'
  | 'explains'
  | 'produces'
  | 'exhibits'
  | 'builds'
  | 'augments'
  | 'implements'
  | 'motivates'
  | 'shares-principle-with';

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  'contains': 'contains',
  'depends-on': 'depends on',
  'causes': 'causes',
  'enables': 'enables',
  'constrains': 'constrains',
  'is-example-of': 'is an example of',
  'is-consequence-of': 'is a consequence of',
  'is-prerequisite-for': 'is a prerequisite for',
  'contrasts-with': 'contrasts with',
  'reinforces': 'reinforces',
  'competes-with': 'competes with',
  'emerges-from': 'emerges from',
  'is-measured-by': 'is measured by',
  'is-confused-with': 'is commonly confused with',
  'is-special-case-of': 'is a special case of',
  'formalizes': 'formalizes',
  'provides': 'provides',
  'explains': 'explains',
  'produces': 'produces',
  'exhibits': 'exhibits',
  'builds': 'builds',
  'augments': 'augments',
  'implements': 'implements',
  'motivates': 'motivates',
  'shares-principle-with': 'shares a common principle with'
};

export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  'foundation': '#4A6FA5',
  'thinking-tool': '#6B8E23',
  'social-dynamic': '#B8860B',
  'systems': '#8B4513',
  'ai-ml': '#7B2D8E',
  'data-engineering': '#2E7D32',
  'software-engineering': '#C62828',
  'research-methods': '#00838F'
};

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  'foundation': 'Foundations',
  'thinking-tool': 'Thinking Tools',
  'social-dynamic': 'Social Dynamics',
  'systems': 'Systems',
  'ai-ml': 'AI & Machine Learning',
  'data-engineering': 'Data Engineering',
  'software-engineering': 'Software Engineering',
  'research-methods': 'Research Methods'
};

export interface GraphState {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  selectedNodeId: string | null;
  searchQuery: string;
  visibleCategories: Set<NodeCategory>;
  zoomLevel: number;
}
