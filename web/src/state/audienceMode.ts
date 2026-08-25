/**
 * §6.6 slice (docs/phase6-full-parity-plan.md), Audience View step 2 (see that plan's own §6.6
 * section for the full mechanism this is built toward, and why step 1 -- `usePresenterStore.ts`,
 * #220 -- had to land first). Direct port of legacy's real boot-time detection
 * (legacy/index.html:38969's `SAKURA_AUDIENCE_MODE=/[?&]sakuraAudience=1(&|$)/.test(location.search)`)
 * -- a query PARAM, never a path, so this needs no routing infrastructure at all (see the plan
 * doc's own corrected scoping on why an earlier draft of this plan wrongly thought otherwise).
 * `URLSearchParams` is the same check expressed without a regex -- both only ever match the
 * literal string `'1'`, matching legacy's own real behavior exactly (legacy has no `sakuraAudience=true`
 * or `=yes` variant).
 */
export function isAudienceWindow(search: string): boolean {
  return new URLSearchParams(search).get('sakuraAudience') === '1';
}
