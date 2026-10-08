// QSC Atlas Labs: invariants for Rulebook in Motion (prompt 03).

const WORDS = { 1: 'one', 2: 'two', 4: 'four' };
/** "24 hours", "one month", "four hours", "14 days": the limit as the law might write it. */
export function limitPhrases(within, unit) {
  const singular = unit.replace(/s$/, '');
  const n = [String(within), WORDS[within]].filter(Boolean);
  return n.flatMap((x) => [`${x} ${unit}`, `${x} ${singular}`]);
}

export default [
  {
    id: 'regime-quote-number',
    describe: "Every reporting step's quote contains its number and unit as the text writes them, so a digit cannot drift from the law.",
    appliesTo: (rel) => rel === 'data/lab/rulebook/regimes.json',
    check({ data }) {
      const out = [];
      (data.regimes ?? []).forEach((r, i) =>
        r.steps.forEach((s, j) => {
          if (!limitPhrases(s.within, s.unit).some((p) => s.quote.includes(p))) out.push({ path: ['regimes', i, 'steps', j], message: `the quote does not contain "${s.within} ${s.unit}" as written` });
        }),
      );
      return out;
    },
  },
  {
    id: 'proposal-never-law',
    describe: 'Every record in proposals.json has the status proposal and no date of application.',
    appliesTo: (rel) => rel === 'data/lab/rulebook/proposals.json',
    check({ data }) {
      return (data.proposals ?? []).flatMap((p, i) => (p.status !== 'proposal' || p.appliesFrom ? [{ path: ['proposals', i], message: 'a proposal is shown with a status or date of law' }] : []));
    },
  },
];
