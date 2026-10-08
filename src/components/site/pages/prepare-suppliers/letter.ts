// The supplier letter's client logic, kept pure so the page's script and
// src/lib/site/prepare-elements.test.ts share it (spec 5.2): which guides the letter draws on, read
// from ?f= as the Readiness Check writes it, and the letter as plain text for Copy as text and
// Download .txt. No route strings, no storage, no network: the covering paragraph a visitor edits
// is passed in and goes nowhere but the clipboard or a file the visitor saves.

/**
 * The guides chosen when the page opens: the ids in ?f= that the letter knows, in the letter's
 * order; the defaults when ?f= is absent or names none of them (a guide with no supplier questions,
 * such as the Dutch Handbook, chosen in the Check, leaves the letter on its defaults).
 */
export function readSources(search: string, known: string[], defaults: string[]): string[] {
  let f: string | null = null;
  try {
    f = new URLSearchParams(search).get('f');
  } catch {
    f = null;
  }
  const asked = (f ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const chosen = known.filter((id) => asked.includes(id));
  return chosen.length ? chosen : known.filter((id) => defaults.includes(id));
}

/** The query value for the chosen guides, in the letter's order: "eu-roadmap,ncsc-timelines". */
export function sourcesValue(chosen: string[], known: string[]): string {
  return known.filter((id) => chosen.includes(id)).join(',');
}

export interface LetterGroup {
  head: string;
  questions: { label: string; tag: string }[];
}

export interface LetterInput {
  paragraph: string;
  groups: LetterGroup[];
  sourcesHead: string;
  sources: { label: string; url: string }[];
}

/**
 * The letter as plain text: the covering paragraph, then each group head with its questions
 * numbered in one run across the groups, each followed by its source in brackets, then the
 * sources with their addresses. No sender, no address and no sign-off: those are the visitor's.
 */
export function letterText(input: LetterInput): string {
  const out: string[] = [];
  const para = input.paragraph.trim();
  if (para) out.push(para, '');
  let n = 0;
  for (const g of input.groups) {
    if (!g.questions.length) continue;
    out.push(g.head, '');
    for (const q of g.questions) {
      n += 1;
      out.push(`${n}. ${q.label} ${q.tag}`);
    }
    out.push('');
  }
  if (input.sources.length) {
    out.push(input.sourcesHead, '');
    for (const s of input.sources) out.push(`${s.label}: ${s.url}`);
    out.push('');
  }
  return out.join('\n').replace(/\n+$/, '\n');
}
