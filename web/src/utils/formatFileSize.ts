/**
 * Phase 6.3 slice, item 11 (docs/phase6-full-parity-plan.md, Files real upload/storage). Direct
 * port of legacy's own `formatAttachSize` (legacy/index.html:41873-41877) -- three tiers (bytes,
 * KB, MB), KB/MB rounded to one decimal place, no tier above MB since the 5MB attachment cap
 * (see `PAD_ATTACH_MAX_BYTES` in padStore.ts) means nothing this app stores ever needs one.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
