/**
 * Sync subsystem — Phase 4, second slice. `pullAndMergeFromCloud` (in `index.html`) has two
 * near-identical loops — one for docs, one for templates — each deciding "which locally-known
 * ids does the cloud NOT have, so they need pushing up." Real duplication, same shape as
 * `syncApply.ts`'s own rationale for extraction: two independent copies of one decision, not two
 * genuinely different decisions. Everything else in both loops — calling `queueSync`, counting
 * `pushedUpCount`, and the outer `docsFetchOk`/`tplFetchOk`/`justRestored` gating that decides
 * whether to run the loop at all — stays hand-written orchestration; this module only decides
 * WHICH ids are missing.
 */

/** Pure: returns the subset of `localIds` not present in `cloudIds`, preserving `localIds`'
 * original order — matches the original loops' own iteration order (`for(const entry of
 * localIndex)`), so the push order (and therefore `queueSync` call order) stays identical to
 * before. Does not deduplicate `localIds`: if the same id appears twice (not expected from either
 * `loadDocsIndex()` or `loadTemplatesIndex()`, but not this function's job to guard against),
 * it's returned twice, matching the original loop's own behavior of simply iterating the array
 * as given. */
export function findIdsMissingFromCloud(localIds: string[], cloudIds: Set<string>): string[] {
  return localIds.filter((id) => !cloudIds.has(id));
}
