// qscatlas.org: whether a build may carry source words at all (server only; see review.ts).

import { productionBuild } from './gates';
import type { LoadOptions } from './gates';

/** True in local and preview builds; false in production, which never includes source words. */
export function sourceWordsInBuild(opts: LoadOptions = {}): boolean {
  return !productionBuild(opts);
}
