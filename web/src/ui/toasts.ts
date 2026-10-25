/**
 * The app's toasts: showToast (a short message, optionally marked as from Quick Assist) and
 * showActionToast (a message with one button, usually Undo, which Ctrl/Cmd+Z also triggers while
 * it shows). Moved here unchanged from index.html (2026-10-25, step 5 of the owner's "standard,
 * unified and elegant" plan); spliced back in by the generator's `toasts` block at the same place.
 *
 * Types are loose (`any`) on purpose: this is a move, not a rewrite.
 */
declare function el(id: string): any;
declare function matchesShortcut(e: any, action: string): boolean;

// Reuses the exact glyph from the header Quick Assist box (qa-input-row) so a toast
// badge and the feature it names always look like the same thing.
export const QA_TOAST_ICON_SVG='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2M6.1 6.1l2.3 2.3M15.6 15.6l2.3 2.3M17.9 6.1l-2.3 2.3M8.4 15.6l-2.3 2.3"/></svg>';
// A toast that offers Undo stays long enough to read and act on (owner, 2026-10-20: 1.6s was too fast).
export const TOAST_UNDO_MS=4000;
export function showToast(msg: any,type?: any,fromQa?: any,durationMs?: any){const t=el('toast'); t.classList.remove('with-action','toast-success'); t.innerHTML=''; if(fromQa){const icon=document.createElement('span'); icon.className='toast-qa-icon'; icon.innerHTML=QA_TOAST_ICON_SVG; icon.dataset.tip='From Quick Assist'; t.appendChild(icon)} const span=document.createElement('span'); span.textContent=msg; t.appendChild(span); if(type==='success')t.classList.add('toast-success'); t.classList.add('show'); clearTimeout((showToast as any)._tm); (showToast as any)._tm=setTimeout(()=>t.classList.remove('show'),durationMs||(/undo/i.test(msg)?TOAST_UNDO_MS:1600))}
// Tracks the undo callback for whichever action-toast (see showActionToast) is currently
// visible, so Ctrl/Cmd+Z can trigger it — see the capture-phase listener just below.
let _actionToastUndo: any=null;
export function showActionToast(msg: any, actionLabel: any, onAction: any, duration=5000, fromQa=false){
  const t=el('toast'); if(!t) return;
  clearTimeout((showToast as any)._tm);
  t.innerHTML=''; t.classList.add('with-action');
  if(fromQa){const icon=document.createElement('span'); icon.className='toast-qa-icon'; icon.innerHTML=QA_TOAST_ICON_SVG; icon.dataset.tip='From Quick Assist'; t.appendChild(icon)}
  const span=document.createElement('span'); span.textContent=msg; t.appendChild(span);
  const btn=document.createElement('button'); btn.className='toast-action-btn'; btn.textContent=actionLabel;
  btn.addEventListener('click',()=>{ t.classList.remove('show','with-action'); _actionToastUndo=null; onAction(); });
  t.appendChild(btn);
  t.classList.add('show');
  _actionToastUndo=onAction;
  (showToast as any)._tm=setTimeout(()=>{ t.classList.remove('show'); _actionToastUndo=null; setTimeout(()=>{ if(!t.classList.contains('show')) t.classList.remove('with-action'); },200); },duration);
}
// Every "X deleted, Undo" toast in the app (diagrams, Q&A rows, folders,
// documents moved to Trash, etc.) previously only offered its Undo via clicking the toast
// itself — Ctrl/Cmd+Z did nothing for these, or worse, silently undid something unrelated on
// the outline's own undo stack, since none of these are recorded there. Capture-phase so this
// runs before any of the other, more narrowly-scoped Ctrl+Z listeners (outline, Pad, Note, Code,
// decision fields, To-Dos) get a chance — while a toast with an undo action is visible, it's
// almost always what the very next Ctrl/Cmd+Z is meant for, regardless of where focus happens
// to be. Self-clears once used, clicked, or the toast's own timeout elapses.
document.addEventListener('keydown',e=>{
  if(!_actionToastUndo)return;
  if(!matchesShortcut(e,'undo'))return;
  const t=el('toast'); if(!t||!t.classList.contains('show'))return;
  e.preventDefault(); e.stopPropagation();
  const fn=_actionToastUndo; _actionToastUndo=null;
  t.classList.remove('show','with-action');
  fn();
},true);
