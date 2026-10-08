// qscatlas.org: which component renders each gated page.
//
// src/pages/[...gated].astro generates one page per entry of builtPages() (src/lib/site/routes.ts),
// each at its route in data/lab/tools.json: the Readiness Check at /prepare/check, the Exposure
// Clock at /prepare/exposure, the Standards Cascade at /standards/cascade, Target dates at
// /target-dates. The Rulebook (site "elsewhere", kept for another website) is at
// /elsewhere/eu-rules, built on Swann's machine only. A tool page is rendered by the component
// in src/components/lab/tools/<tool id>/index.astro, registered here under the tool's id; any
// other page (or a tool with no folder there) by src/components/site/pages/<page key>/index.astro;
// with neither, by the plain planned page. Each component receives { tool, page }, plus the
// page's own props ({ guideId } or { standardId }), and renders its own frame.
//
// The two maps come from a module that astro.config.mjs writes for each build: it imports only
// the components of the pages that build generates, so a production build with every tool
// private carries no tool code. A tool of site "ai" is never imported. A tool of site "research"
// and the Rulebook (site "elsewhere") are imported only on Swann's machine.

// @ts-ignore: a virtual module, written by the atlas-gated-components plugin in astro.config.mjs
import { PAGE_COMPONENTS as pages, TOOL_COMPONENTS as tools } from 'virtual:atlas-gated-components';

type Component = (props: any) => any;

export const TOOL_COMPONENTS: Record<string, Component> = tools;
export const PAGE_COMPONENTS: Record<string, Component> = pages;
