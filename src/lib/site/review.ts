// qscatlas.org: source words are for review, not for visitors (Swann, 2 October 2026).
//
// The verbatim words of a source (excerpts, quotes, "the guide says") stay in the data so Swann can
// check every label against its source, but a visitor never sees them. A production build leaves
// them out of the HTML entirely. A local or preview build includes them, hidden, and shows them
// when the page is opened with ?review=1 (for example /prepare/check?review=1).
//
// Astro pages and components use <SourceWords> (src/components/site/frame/SourceWords.astro).
// React islands receive sourceWordsAvailable (= sourceWordsInBuild() from review-build.ts, server
// only) as a prop and call reviewRequested() after mounting, so the server render and the first
// client render agree. This file is safe in the browser: it imports nothing.

/** The query parameter that reveals source words in a local or preview build. */
export const REVIEW_PARAM = 'review';

/** In the browser: true when the page was opened with ?review=1. Always false on the server. */
export function reviewRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has(REVIEW_PARAM);
  } catch {
    return false;
  }
}
