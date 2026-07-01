// The evaluative layer (brief Part 5 and 11): a six-criterion governance-credibility reading
// per country, each axis scored 0 to 2 from the sources, carried as a six-axis profile rather
// than a single number. Seeded from data/evaluations.json (first pass; reviewer reconciliation
// pending), loaded directly by the pages because it is a nested object the Notion pipeline does
// not carry.

export type Confidence = 'High' | 'Medium' | 'Low';

export interface SubScore {
  key: string;
  label: string;
  score: number | null;
  reason?: string;
  sourceUrl?: string;
}

export interface AxisEval {
  score: number | null;
  confidence: Confidence;
  subScores: SubScore[];
}

export type CriterionKey =
  | 'relevance'
  | 'coherence'
  | 'effectiveness'
  | 'efficiency'
  | 'governance'
  | 'impact';

export type Evaluation = Record<CriterionKey, AxisEval>;

/** The six criteria, in gauge order (top, then clockwise), with display labels. */
export const CRITERIA: { key: CriterionKey; label: string; short: string }[] = [
  { key: 'relevance', label: 'Relevance', short: 'Rel' },
  { key: 'coherence', label: 'Coherence', short: 'Coh' },
  { key: 'effectiveness', label: 'Effectiveness', short: 'Eff' },
  { key: 'efficiency', label: 'Efficiency', short: 'Eff.' },
  { key: 'governance', label: 'Governance', short: 'Gov' },
  { key: 'impact', label: 'Impact', short: 'Imp' },
];

export const MAX_SCORE = 2;
