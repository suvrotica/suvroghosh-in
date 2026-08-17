/** Keyword lint is deliberately conservative and is only a backstop for editorial review. */
export const FORBIDDEN_CORPUS_TOPIC_PATTERNS = [
	/\b(?:suicid(?:e|al)|self-harm)\b/i,
	/\b(?:diagnos(?:is|e|ed)|mental illness|psychiatr(?:y|ic))\b/i,
	/\b(?:trauma|abuse|addiction|bereavement)\b/i,
	/\b(?:pregnan(?:cy|t)|fertility|disabilit(?:y|ies))\b/i,
	/\b(?:caste|race|ethnicity|religion|politics|criminality)\b/i,
	/\b(?:income|debt|migration status|legal status)\b/i,
	/\b(?:intelligence quotient|iq score|employability)\b/i,
	/\b(?:sexuality|sexual orientation)\b/i,
	/\b(?:terminal illness|disease|disorder)\b/i,
	/\b(?:health|medical|medicine|medication|doctor|hospital|symptom|surgery|chronic pain)\b/i,
	/\b(?:crime|criminal|police|prison|arrest|conviction)\b/i,
	/\b(?:death|dead|dying|funeral|grief|grieving)\b/i,
	/\b(?:money|financial|finance|wealth|rich|investment|bankruptcy)\b/i,
	/\b(?:destiny|fate|secret enemy|hidden childhood)\b/i,
	/\b(?:you will|you are going to|soon you|next (?:week|month|year) you)\b/i
] as const;
