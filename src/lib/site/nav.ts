// qscatlas.org: the header, footer and view switches, built from what the build shows (spec 3).
//
// Every item comes from pageHref() or link() in gates.ts, so a section, view or column whose
// pages are not built leaves no trace: at stage 0 (nothing public) the header reads Countries,
// Documents, Methodology, About. Labels and questions are the spec's nouns and drafts; Swann
// approves the visible wording (decision 1).
//
// Swann's decision of 5 October 2026 (option c of labs/review/standards-beyond-nist.md):
// "Standards" opens the Standards overview, /standards, built wherever the Cascade is, and the
// view switch "Overview · Cascade" moves between the two. The page of each standard stays on
// Swann's machine and nothing here names it. EU rules left the Atlas for another website, so no
// item names it. About is
// back to its leaner version, whose only anchors are #team and #briefing, and /who is its own
// page again ("How to read the Atlas").
//
// Notes (Swann, 4 October 2026) comes between Documents and Methodology and appears only when the
// build lists a note (notesHref() in notes.ts): a production build shows it from the first note
// published with its page, and until then the header is exactly as it was.

import { CORRECTIONS_EMAIL, GITHUB_URL, ZENODO_URL } from './config';
import { link, pageHref } from './gates';
import type { LoadOptions } from './gates';
import { notesHref } from './notes';
import type { NoteOptions } from './notes';
import { PREPARE_QUESTION, STANDARDS_QUESTION, cleanPath, sectionMenu } from './routes';

export interface NavItem {
  id: 'countries' | 'prepare' | 'standards' | 'documents' | 'notes' | 'methodology' | 'about';
  label: string;
  href: string;
  match: string[]; // paths at which the item is current; each also covers the paths below it
  question: string; // the muted line under the item in the phone menu
}

// Decision 4 (Swann, 1 October 2026): the commentary keeps its page and its race chart, with
// every date corrected in place to the Atlas's own sourced records and drawn by its kind and
// bindingness. It gets its footer link once that correction is merged. The correction belongs to
// the about-method package (wave 2), which does not own this file, so the integrator sets this
// to true in the same merge as the corrected src/pages/commentary.astro; nav.test follows it.
export const COMMENTARY_IN_FOOTER = false;

// The sections in header order (spec 3.1). Prepare, Standards and Notes appear only when built.
// Each item's address is its path through pageHref(), or its tool's route through link() when it
// names a tool: Standards opens the overview, which is built exactly when the Cascade is shown.
// Notes takes its address from notesHref(), since routes.ts never answers for /notes.
const SECTIONS: (NavItem & { path?: string; tool?: string; notes?: true })[] = [
  {
    id: 'countries',
    label: 'Countries',
    path: '/countries',
    href: '/countries',
    match: ['/countries', '/map', '/target-dates'],
    question: 'Which countries are where, and how do I find one?',
  },
  {
    id: 'prepare',
    label: 'Prepare',
    path: '/prepare',
    href: '/prepare',
    match: ['/prepare'],
    question: PREPARE_QUESTION,
  },
  {
    id: 'standards',
    label: 'Standards',
    path: '/standards',
    href: '', // pageHref(path): the overview is built exactly where the Cascade is
    match: ['/standards'],
    question: STANDARDS_QUESTION, // the overview's own question, its H1
  },
  {
    id: 'documents',
    label: 'Documents',
    path: '/documents',
    href: '/documents',
    match: ['/documents'],
    question: 'Where is the primary document I can cite?',
  },
  {
    id: 'notes',
    label: 'Notes',
    notes: true,
    href: '',
    match: ['/notes'],
    question: 'Which pages are new on the Atlas?',
  },
  {
    id: 'methodology',
    label: 'Methodology',
    path: '/methodology',
    href: '/methodology',
    match: ['/methodology'],
    question: 'How is the Atlas built, and where are its limits?',
  },
  {
    id: 'about',
    label: 'About',
    path: '/about',
    href: '/about',
    match: ['/about'],
    // the restored About names the team, the Task Forces and the briefing sentence, nothing more
    question: 'Who is behind the Atlas?',
  },
];

/** The header's section links, in order, for the sections this build has. */
export function primaryNav(opts: NoteOptions = {}): NavItem[] {
  const out: NavItem[] = [];
  for (const { path, tool, notes, ...item } of SECTIONS) {
    const href = tool ? link(tool, {}, opts) : notes ? notesHref(opts) : path ? pageHref(path, opts) : null;
    if (!href) continue;
    out.push({ ...item, href, match: [...item.match] });
  }
  return out;
}

/** Whether a header item is the current section for a pathname (aria-current and the underline). */
export function isCurrent(item: NavItem, pathname: string): boolean {
  const here = cleanPath(pathname).toLowerCase();
  return item.match.some((m) => here === m || here.startsWith(`${m}/`));
}

type FooterLink = { label: string; href: string };

const keep = (links: (FooterLink | null)[]): FooterLink[] => links.filter((l): l is FooterLink => l !== null);
const item = (label: string, href: string | null): FooterLink | null => (href ? { label, href } : null);

/**
 * The footer's links since the minimal pass (labs/review/minimal-spec.md): one calm band with
 * the CEPS logo, "Data as of" and six links at most, in this order: Methodology, About, How to
 * read the Atlas, Report an error, Data downloads, GitHub. A page that is not built is left out.
 * "Report an error" is a bare mailto; the footer adds the page to its subject. The downloads sit
 * on the Documents page, under its heading. No licence is named (decision 5), and the sections
 * are in the header, so none is repeated here.
 */
export function footerLinks(opts: LoadOptions = {}): FooterLink[] {
  return keep([
    item('Methodology', pageHref('/methodology', opts)),
    item('About', pageHref('/about', opts)),
    item('How to read the Atlas', pageHref('/who', opts)),
    { label: 'Report an error', href: `mailto:${CORRECTIONS_EMAIL}` },
    item('Data downloads', pageHref('/documents', opts)),
    { label: 'GitHub', href: GITHUB_URL },
  ]);
}

/**
 * The shell's full index of links, by column: The Atlas, Prepare (only when its hub is built)
 * and About. The footer no longer draws it (it draws footerLinks()); it is kept as the one list
 * the checks read to prove that no shell link names a gated or removed page. "Report an error"
 * is a bare mailto. Standards is the overview and the Cascade (the page of each standard is kept
 * off every column), and EU rules is in none.
 */
export function footerColumns(opts: LoadOptions = {}): { heading: string; links: FooterLink[] }[] {
  const atlas = keep([
    item('Countries', pageHref('/countries', opts)),
    item('Map', pageHref('/map', opts)),
    item('Target dates', link('dates', {}, opts)),
    item('Standards', pageHref('/standards', opts)),
    item('Standards Cascade', link('cascade', {}, opts)),
    item('Documents', pageHref('/documents', opts)),
  ]);

  // Target dates already appears in The Atlas column, so the Prepare column leaves it out
  const prepare = pageHref('/prepare', opts)
    ? sectionMenu('prepare', '', opts)
        .filter((e) => e.href !== link('dates', {}, opts))
        .map((e) => ({ label: e.label, href: e.href }))
    : [];

  // the restored About keeps two anchors only, #team and #briefing, so no link here points into
  // it; how to read the Atlas is /who again, and the downloads sit on the Documents page, under
  // its heading (Download CSV, Download JSON)
  const aboutLinks = keep([
    item('About', pageHref('/about', opts)),
    item('How to read the Atlas', pageHref('/who', opts)),
    item('Methodology', pageHref('/methodology', opts)),
    item('What changed', pageHref('/about/changes', opts)),
    { label: 'Report an error', href: `mailto:${CORRECTIONS_EMAIL}` },
    // decision 5: no licence is stated until Swann and CEPS agree one, so the label names the data only
    item('Data downloads', pageHref('/documents', opts)),
    { label: 'GitHub', href: GITHUB_URL },
    { label: 'Zenodo record', href: ZENODO_URL },
    COMMENTARY_IN_FOOTER ? item('Commentary', pageHref('/commentary', opts)) : null,
  ]);

  return [
    { heading: 'The Atlas', links: atlas },
    { heading: 'Prepare', links: prepare },
    { heading: 'About', links: aboutLinks },
  ].filter((c) => c.links.length > 0);
}

/**
 * The quiet links under the sections in the phone menu (spec 3.2): how to read the Atlas (/who)
 * and Report an error, a bare mailto to which the menu adds the page as the subject.
 */
export function menuLinks(opts: LoadOptions = {}): FooterLink[] {
  return keep([item('How to read the Atlas', pageHref('/who', opts)), { label: 'Report an error', href: `mailto:${CORRECTIONS_EMAIL}` }]);
}

/**
 * The underlined view switch (spec 3.5): "List · Map · Target dates" on the Countries views and
 * "Overview · Cascade" on Standards (5 October 2026), built views only, with the current one
 * marked. One view alone is no switch, so the list is then empty.
 */
export function viewSwitch(
  section: 'countries' | 'standards',
  pathname: string,
  opts: LoadOptions = {},
): { label: string; href: string; current: boolean }[] {
  const here = cleanPath(pathname);
  const views =
    section === 'countries'
      ? keep([item('List', pageHref('/countries', opts)), item('Map', pageHref('/map', opts)), item('Target dates', link('dates', {}, opts))])
      : keep([item('Overview', pageHref('/standards', opts)), item('Cascade', link('cascade', {}, opts))]);
  return views.length > 1 ? views.map((v) => ({ ...v, current: cleanPath(v.href) === here })) : [];
}
