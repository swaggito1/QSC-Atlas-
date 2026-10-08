import { describe, expect, it } from 'vitest';
import { sourceWordsInBuild } from './review-build';
import { REVIEW_PARAM, reviewRequested } from './review';

describe('source words for review', () => {
  it('are never in a production build', () => {
    expect(sourceWordsInBuild({ env: { VERCEL_ENV: 'production', VERCEL: '1' } })).toBe(false);
  });
  it('are in preview and local builds', () => {
    expect(sourceWordsInBuild({ env: { VERCEL_ENV: 'preview', VERCEL: '1' } })).toBe(true);
    expect(sourceWordsInBuild({ env: {} })).toBe(true);
  });
  it('are never requested on the server', () => {
    expect(REVIEW_PARAM).toBe('review');
    expect(reviewRequested()).toBe(false);
  });
});
