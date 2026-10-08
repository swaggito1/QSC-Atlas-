// The frame's one door to the routes-gates contracts (spec 21.2): sections, a page's trail (no
// longer drawn as a breadcrumb since the minimal pass, but still the page's name and parents),
// the Prepare side menu, view switches and whether a page's gate is public. Thin wrappers, so the
// frame's components read one module and the tests of gates.ts, routes.ts and nav.ts cover
// the rules themselves.

import { gatePublic, pageHref as gatesPageHref, productionBuild } from '../../../lib/site/gates';
import { builtPage, cleanPath as routesCleanPath, sectionMenu as routesSectionMenu } from '../../../lib/site/routes';
import type { SitePage } from '../../../lib/site/routes';
import { viewSwitch as navViewSwitch } from '../../../lib/site/nav';
import type { LoadOptions } from '../../../lib/lab/load';
import type { LabTool } from '../../../lib/lab/types';

export type Section = 'countries' | 'standards' | 'prepare';

export interface Crumb {
  label: string;
  href: string | null; // null renders the label as plain text
}
export interface LinkItem {
  label: string;
  href: string | null; // null: the destination is not built, and the item is not rendered
}
export interface MenuItem {
  label: string;
  href: string;
  current: boolean;
  note?: string;
}
export interface SwitchItem {
  label: string;
  href: string;
  current: boolean;
}

export const SECTION_LABEL: Record<Section, string> = {
  countries: 'Countries',
  standards: 'Standards',
  prepare: 'Prepare',
};
const SECTION_ROOT: Record<Section, string> = {
  countries: '/countries',
  standards: '/standards',
  prepare: '/prepare',
};

// The methodology anchor each tool's method link points at (spec 10). The anchors are written
// by the about-method package, each only when its tool is shown; until then the link opens the
// methodology at the top.
const METHOD_ANCHOR: Record<string, string> = {
  readiness: 'prepare',
  inventory: 'prepare',
  approach: 'prepare',
  suppliers: 'prepare',
  exposure: 'exposure',
  rulebook: 'eu-rules',
  cascade: 'standards',
  dates: 'target-dates',
};

export const cleanPath = routesCleanPath;

export function toolSection(tool: Pick<LabTool, 'id' | 'section'>): Section | null {
  const s = tool.section;
  return s && s in SECTION_LABEL ? (s as Section) : null;
}

export function methodAnchorFor(toolId: string): string | null {
  return METHOD_ANCHOR[toolId] ?? null;
}

/** The path when that page is built in this build (static or gated), else null. */
export function pageHref(path: string, opts?: LoadOptions): string | null {
  return gatesPageHref(path, opts);
}

/** The section's own page, when it is built: /countries, /standards or /prepare. */
export function sectionRootHref(section: Section, opts?: LoadOptions): string | null {
  return pageHref(SECTION_ROOT[section], opts);
}

/** A tool's trail: its section, then its title ("Prepare › Exposure Clock"). Not drawn; the
 *  frame names the page from its last label when no title is given. */
export function toolCrumbs(tool: LabTool, opts?: LoadOptions): Crumb[] {
  const section = toolSection(tool);
  const crumbs: Crumb[] = [];
  if (section) crumbs.push({ label: SECTION_LABEL[section], href: sectionRootHref(section, opts) });
  crumbs.push({ label: tool.title, href: null });
  return crumbs;
}

/**
 * The trail of any page of the manifest (not drawn since the minimal pass), from its section
 * root down its parents:
 * "Prepare › The guides › NCSC timelines". A section root is named by its section and has no
 * breadcrumb of its own; a parent that is not built shows as plain text.
 */
export function pageCrumbs(page: Pick<SitePage, 'title' | 'parent' | 'section'>, opts?: LoadOptions): Crumb[] {
  const section = page.section in SECTION_LABEL ? (page.section as Section) : null;
  if (!page.parent) {
    if (!section || page.title === SECTION_LABEL[section]) return [];
    return [
      { label: SECTION_LABEL[section], href: sectionRootHref(section, opts) },
      { label: page.title, href: null },
    ];
  }
  const chain: Crumb[] = [{ label: page.title, href: null }];
  const seen = new Set<string>();
  let parent: string | null = page.parent;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const p = builtPage(parent, opts);
    const root = (Object.keys(SECTION_ROOT) as Section[]).find((k) => SECTION_ROOT[k] === parent);
    chain.unshift({ label: root ? SECTION_LABEL[root] : (p?.title ?? parent), href: pageHref(parent, opts) });
    parent = root ? null : (p?.parent ?? null);
  }
  return chain;
}

/** The Prepare side menu, built pages only, current page marked (routes.sectionMenu). */
export function sectionMenu(section: Section, current: string, opts?: LoadOptions): MenuItem[] {
  if (section !== 'prepare') return [];
  return routesSectionMenu('prepare', current, opts);
}

/** The view switch of a section (nav.viewSwitch): List, Map, Target dates; or List, Cascade. */
export function viewSwitch(section: 'countries' | 'standards', pathname: string, opts?: LoadOptions): SwitchItem[] {
  return navViewSwitch(section, pathname, opts);
}

/** The preview line and noindex: any page whose gate is not public, in any non-production build. */
export function isPreviewPage(gate: string | null | undefined, opts?: LoadOptions): boolean {
  return !productionBuild(opts) && !gatePublic(gate ?? null, opts);
}
