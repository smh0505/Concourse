/** Small in-house subsequence fuzzy matcher - not a dependency like Fuse.js, since this only
 *  ever needs to score game titles (a few hundred entries at most) for the quick-launch overlay.
 *  Every character of `query` must appear in `text` in order (not necessarily contiguous);
 *  scores consecutive-run and start-of-string matches higher, same intuition Spotlight/Alfred-
 *  style fuzzy finders use. Returns null when `query` isn't a subsequence of `text` at all. */
export function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 0;

  const q = query.toLowerCase();
  const t = text.toLowerCase();

  let score = 0;
  let queryIndex = 0;
  let consecutiveRun = 0;

  for (let textIndex = 0; textIndex < t.length && queryIndex < q.length; textIndex++) {
    if (t[textIndex] !== q[queryIndex]) {
      consecutiveRun = 0;
      continue;
    }
    consecutiveRun++;
    score += 1 + consecutiveRun; // consecutive runs score higher than scattered matches
    if (textIndex === 0) score += 3; // start-of-string bonus
    queryIndex++;
  }

  return queryIndex === q.length ? score : null;
}

export interface FuzzyMatch<T> {
  item: T;
  score: number;
}

/** Filters+sorts `items` by fuzzy match against `query` (highest score first), extracting the
 *  text to match via `getText`. Items that don't match `query` at all are dropped entirely. */
export function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string): FuzzyMatch<T>[] {
  const matches: FuzzyMatch<T>[] = [];
  for (const item of items) {
    const score = fuzzyScore(query, getText(item));
    if (score !== null) matches.push({ item, score });
  }
  return matches.sort((a, b) => b.score - a.score);
}
