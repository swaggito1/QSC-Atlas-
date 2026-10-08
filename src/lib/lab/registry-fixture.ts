// QSC Atlas tests: a project root whose tools registry keeps every tool private, as the Atlas was
// until 8 October 2026 (stage 0, spec 14.2).
//
// Since 8 October 2026 the real registry (data/lab/tools.json) makes the six Atlas tools public. A
// test whose subject is the all-private behaviour (no gated page in a production build, a header
// of Countries, Documents, Methodology and About, a note hidden while its pages are private) or a
// flag state built on it ("the Exposure Clock alone", through ATLAS_FORCE_PUBLIC) reads this root
// instead, passed as `root` in LoadOptions. Everything in it is the repository itself, linked entry
// by entry, except data/lab/tools.json: the real registry with each public entry made private
// again (public false, status preview, its release gate back, no publishedAt). The ids, routes,
// sections, sites and requirements stay the real ones, so a flag state reads exactly as it did
// when the real registry was all private.
//
// The real registry holds no tool of site "ai" or "research". A test of the rule that no build
// shows an ai tool, and that only a build on Swann's machine shows a research tool, reads
// otherSitesRoot() instead: the real registry with one fixture entry of each of those sites added
// (SITE_FIXTURES).
//
// For tests only: no page, script or build imports this module.

import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { projectRoot } from './load';

const TOOLS = 'data/lab/tools.json';

type RegistryFile = { _about?: string; tools: Record<string, unknown>[] };

/** The real registry with every entry private, read from `from` (the repository by default). */
export function allPrivateRegistry(from: string = projectRoot()): RegistryFile {
  const file = JSON.parse(readFileSync(join(from, TOOLS), 'utf8')) as RegistryFile;
  return {
    ...file,
    tools: file.tools.map((t) => {
      if (t.public !== true) return t;
      const { publishedAt: _published, ...rest } = t;
      return { ...rest, public: false, status: 'preview', gates: ['lorenzo-no-objection'] };
    }),
  };
}

/**
 * Writes the all-private registry into a fixture root that holds its own copy of the data (a test
 * that copies data/lab with cpSync). Refuses to write through a link or into the repository, so
 * the real registry is never touched.
 */
export function writeAllPrivateRegistry(root: string, from: string = projectRoot()): void {
  const target = join(root, TOOLS);
  mkdirSync(dirname(target), { recursive: true });
  if (realpathSync(dirname(target)) === realpathSync(join(from, 'data', 'lab'))) throw new Error(`writeAllPrivateRegistry: ${root} is the repository itself`);
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error(`writeAllPrivateRegistry: ${target} is a link into the repository`);
  writeFileSync(target, JSON.stringify(allPrivateRegistry(from), null, 2));
}

const SHARED = Symbol.for('qsc-atlas.all-private-root');
type Holder = { [SHARED]?: string };

/**
 * A root that is the repository linked entry by entry, with the all-private registry in place of
 * data/lab/tools.json. Made once per test process and removed when the process ends.
 */
export function allPrivateRoot(): string {
  const holder = globalThis as Holder;
  const made = holder[SHARED];
  if (made && existsSync(join(made, TOOLS))) return made;
  const from = projectRoot();
  const root = linkedRoot('qsc-all-private-', from);
  writeAllPrivateRegistry(root, from);
  holder[SHARED] = root;
  return root;
}

/**
 * A temporary root that is the repository linked entry by entry, with no data/lab/tools.json yet.
 * Removed when the process ends.
 */
function linkedRoot(prefix: string, from: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  // the same links the Standards fixtures make (src/lib/site/standards.test.ts), one level deeper
  for (const entry of readdirSync(from)) {
    if (entry === 'data' || entry === 'node_modules' || entry.startsWith('.')) continue;
    symlinkSync(join(from, entry), join(root, entry));
  }
  mkdirSync(join(root, 'data', 'lab'), { recursive: true });
  for (const entry of readdirSync(join(from, 'data'))) if (entry !== 'lab') symlinkSync(join(from, 'data', entry), join(root, 'data', entry));
  for (const entry of readdirSync(join(from, 'data', 'lab'))) if (entry !== 'tools.json') symlinkSync(join(from, 'data', 'lab', entry), join(root, 'data', 'lab', entry));
  // rmSync removes the links themselves and never follows them into the repository
  process.once('exit', () => rmSync(root, { recursive: true, force: true }));
  return root;
}

/** One registry entry of site "ai" and one of site "research", shaped as data/lab/tools.json holds them. */
export const SITE_FIXTURES = [
  {
    id: 'fixture-ai',
    title: 'AI Fixture',
    site: 'ai',
    route: '/lab/fixture-ai',
    legacyRoutes: [],
    requires: [],
    byline: 'Swann Ashworth',
    public: false,
    status: 'planned',
    gates: ['lorenzo-no-objection'],
  },
  {
    id: 'fixture-research',
    title: 'Research Fixture',
    site: 'research',
    route: '/research/fixture-research',
    legacyRoutes: [],
    requires: [],
    byline: 'Swann Ashworth',
    public: false,
    status: 'planned',
    gates: ['lorenzo-no-objection'],
  },
];

const SITES_SHARED = Symbol.for('qsc-atlas.other-sites-root');
type SitesHolder = { [SITES_SHARED]?: string };

/**
 * A root that is the repository linked entry by entry, with the real registry plus SITE_FIXTURES
 * in place of data/lab/tools.json. Made once per test process and removed when the process ends.
 */
export function otherSitesRoot(): string {
  const holder = globalThis as SitesHolder;
  const made = holder[SITES_SHARED];
  if (made && existsSync(join(made, TOOLS))) return made;
  const from = projectRoot();
  const root = linkedRoot('qsc-other-sites-', from);
  const file = JSON.parse(readFileSync(join(from, TOOLS), 'utf8')) as RegistryFile;
  writeFileSync(join(root, TOOLS), JSON.stringify({ ...file, tools: [...file.tools, ...SITE_FIXTURES] }, null, 2));
  holder[SITES_SHARED] = root;
  return root;
}
