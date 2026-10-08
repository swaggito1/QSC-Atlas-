// QSC Atlas: invariants for the Readiness Check.

const FILE = 'data/lab/readiness/readiness.json';
const COPY = 'data/lab/readiness/copy.json';

/** The kinds of date the Atlas uses (spec section 13), each with a label in copy.kindLabel. */
const KINDS = ['plan', 'priority', 'complete', 'procurement', 'other'];

/** Every string value in a copy file, with its key, nested records included. */
function copyStrings(copy) {
  const out = [];
  for (const [k, v] of Object.entries(copy ?? {})) {
    if (typeof v === 'string') out.push([k, v]);
    else if (v && typeof v === 'object') for (const [k2, v2] of Object.entries(v)) if (typeof v2 === 'string') out.push([`${k}.${k2}`, v2]);
  }
  return out;
}

export default [
  {
    id: 'readiness-due-refs',
    describe: 'Every dueBy names an existing framework and one of its milestones, and every action, stance and entry names an existing source and domain.',
    appliesTo: (rel) => rel === FILE,
    check({ data }) {
      const out = [];
      const milestones = new Map((data.frameworks ?? []).map((f) => [f.id, new Set((f.milestones ?? []).map((m) => m.id))]));
      const domains = new Set((data.domains ?? []).map((d) => d.id));
      (data.actions ?? []).forEach((a, i) => {
        if (!milestones.has(a.source)) out.push({ path: ['actions', i, 'source'], message: `source "${a.source}" is not a framework` });
        if (!domains.has(a.domain)) out.push({ path: ['actions', i, 'domain'], message: `domain "${a.domain}" is not defined` });
        (a.dueBy ?? []).forEach((d, j) => {
          const at = ['actions', i, 'dueBy', j];
          if (!milestones.has(d.framework)) out.push({ path: at, message: `framework "${d.framework}" does not exist` });
          else if (!milestones.get(d.framework).has(d.milestone)) out.push({ path: at, message: `milestone "${d.milestone}" is not a milestone of ${d.framework}` });
        });
      });
      (data.positions ?? []).forEach((p, i) =>
        (p.stances ?? []).forEach((s, j) => {
          if (!milestones.has(s.framework)) out.push({ path: ['positions', i, 'stances', j], message: `framework "${s.framework}" does not exist` });
        }),
      );
      if (data.entry && !milestones.has(data.entry.source)) out.push({ path: ['entry', 'source'], message: `source "${data.entry.source}" is not a framework` });
      return out;
    },
  },
  {
    id: 'readiness-own-milestone',
    describe: 'A dated action is due by at least one milestone of its own source; another source\'s milestone may be added, never used alone.',
    appliesTo: (rel) => rel === FILE,
    check({ data }) {
      return (data.actions ?? []).flatMap((a, i) =>
        (a.dueBy ?? []).length && !(a.dueBy ?? []).some((d) => d.framework === a.source)
          ? [{ path: ['actions', i, 'dueBy'], message: `dated only by other sources' milestones; add one from ${a.source} or leave it undated` }]
          : [],
      );
    },
  },
  {
    id: 'readiness-extras',
    describe: 'The fields the tool reads beyond the shared schema hold their shape: each document date quotes its own document and is cited somewhere in the file, recurs is "yearly", and each entry outcome carries its own excerpt.',
    appliesTo: (rel) => rel === FILE,
    check({ data }) {
      const out = [];
      const cited = new Set();
      const visit = (v) => {
        if (Array.isArray(v)) return v.forEach(visit);
        if (v && typeof v === 'object') {
          if (typeof v.url === 'string' && typeof v.excerpt === 'string') cited.add(v.url);
          Object.entries(v).forEach(([k, x]) => k !== 'documents' && visit(x));
        }
      };
      visit(data);
      const seen = new Set();
      (data.documents ?? []).forEach((d, i) => {
        const at = ['documents', i];
        if (seen.has(d.url)) out.push({ path: at, message: `a second date record for ${d.url}` });
        seen.add(d.url);
        if (!cited.has(d.url)) out.push({ path: at, message: `${d.url} is not quoted anywhere else in the file` });
        if (!(d.provenance ?? []).length || (d.provenance ?? []).some((p) => p.url !== d.url)) out.push({ path: [...at, 'provenance'], message: 'the date must be quoted from the document it dates' });
        if (!d.date || !d.precision) out.push({ path: at, message: 'a document record needs a date and its precision' });
      });
      (data.frameworks ?? []).forEach((f, i) =>
        (f.milestones ?? []).forEach((m, j) => {
          if (m.recurs !== undefined && m.recurs !== null && m.recurs !== 'yearly') out.push({ path: ['frameworks', i, 'milestones', j, 'recurs'], message: `recurs "${m.recurs}" is not "yearly"` });
        }),
      );
      if (data.entry) {
        for (const k of ['yesProvenance', 'noProvenance']) {
          const list = data.entry.outcome?.[k] ?? [];
          if (!list.length || list.some((p) => !String(p.excerpt ?? '').trim())) out.push({ path: ['entry', 'outcome', k], message: 'each outcome is quoted from the source, with its own excerpt and locator' });
        }
      }
      return out;
    },
  },
  {
    id: 'readiness-targets-only',
    describe: 'Every framework is published guidance or soft law, so the page can call each milestone a target; a binding instrument needs its own treatment first.',
    appliesTo: (rel) => rel === FILE,
    check({ data }) {
      const out = [];
      (data.frameworks ?? []).forEach((f, i) => {
        if (!['published', 'superseded'].includes(f.status)) out.push({ path: ['frameworks', i, 'status'], message: `status "${f.status}" is not a soft instrument's status` });
        if (!['guidance', 'soft-law'].includes(f.bindingness)) out.push({ path: ['frameworks', i, 'bindingness'], message: `"${f.bindingness}" would make a milestone a legal deadline; the page words every date as a target` });
      });
      return out;
    },
  },
  {
    id: 'readiness-copy-vocabulary',
    describe: 'The Check words every date as a target: "clock" only in the Exposure Clock\'s name, "deadline" only in "not a legal deadline", no score, total or percentage, and the word "target" in each action\'s target line.',
    appliesTo: (rel) => rel === COPY,
    check({ data }) {
      const out = [];
      if (!/\btarget\b/.test(String(data.copy?.targetBy ?? ''))) out.push({ path: ['copy', 'targetBy'], message: 'an action\'s date must say it is a target, so read alone it never passes for a deadline' });
      for (const [k, v] of copyStrings(data.copy)) {
        if (/\bclocks?\b/i.test(v.replace(/Exposure Clock/g, ''))) out.push({ path: ['copy', ...k.split('.')], message: '"clock" outside the Exposure Clock\'s name; say "target date"' });
        if (/deadline/i.test(v.replace(/not a legal deadline|None is a legal deadline/g, ''))) out.push({ path: ['copy', ...k.split('.')], message: '"deadline" outside "not a legal deadline"; every date here is a target' });
        if (/%|per cent|your score|progress bar/i.test(v)) out.push({ path: ['copy', ...k.split('.')], message: 'score, total or percentage wording' });
      }
      return out;
    },
  },
  {
    id: 'readiness-kinds',
    describe: 'Every milestone is one of the five kinds of date (plan, priority systems, completion, procurement, other), and the copy labels each kind, so no raw data key reaches a visitor.',
    appliesTo: (rel) => rel === FILE || rel === COPY,
    check({ rel, data }) {
      const out = [];
      if (rel === FILE) {
        (data.frameworks ?? []).forEach((f, i) =>
          (f.milestones ?? []).forEach((m, j) => {
            if (!KINDS.includes(m.kind)) out.push({ path: ['frameworks', i, 'milestones', j, 'kind'], message: `kind "${m.kind}" is not one of ${KINDS.join(', ')}` });
          }),
        );
      } else {
        for (const k of KINDS) {
          if (!String(data.copy?.kindLabel?.[k] ?? '').trim()) out.push({ path: ['copy', 'kindLabel', k], message: `no label for the kind "${k}"` });
        }
      }
      return out;
    },
  },
];
