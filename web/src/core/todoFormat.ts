/**
 * The To-Dos panel's pure helpers: dates (toISODate, parseISODate, dueDatePreset, nextRepeatDate,
 * fmtDue, dueShort, isOverdue), repeat labels, links (normalizeLinkUrl, fmtLink), search
 * (taskMatchesSearch) and the history summary. Moved here unchanged from inside the To-Dos panel's
 * closure in index.html (2026-10-25, step 5 of the owner's "standard, unified and elegant" plan);
 * none of them read the panel's state, and no other code in index.html uses these names. Spliced
 * back in just above the panel by the generator's `todoFormat` block.
 *
 * Types are loose (`any`) on purpose: this is a move, not a rewrite.
 */
declare function isWaiting(t: any): boolean;
declare function waitingLabel(t: any): string;

export function nextRepeatDate(fromDateStr: any, repeat: any){
  const parsed=parseISODate(fromDateStr);
  let d;
  if(parsed){ d=new Date(parsed.getTime()); }
  else { d=new Date(); d.setHours(0,0,0,0); }
  if(repeat==='daily'){ d.setDate(d.getDate()+1); }
  else if(repeat==='weekly'){ d.setDate(d.getDate()+7); }
  else if(repeat==='weekdays'){ do{ d.setDate(d.getDate()+1); } while(d.getDay()===0||d.getDay()===6); }
  return toISODate(d);
}
export function repeatLabel(r: any){ return r==='daily'?'Daily':r==='weekdays'?'Weekdays':r==='weekly'?'Weekly':'Repeat'; }
export function repeatTitle(r: any){ return r?('Repeats '+repeatLabel(r).toLowerCase()):'Set repeat'; }
// Bare domains/paths ("example.com/x") are treated as https:// links so the chip
// can always open them; anything already carrying its own scheme (mailto:, http:,
// a custom app scheme, etc.) is left untouched.
export function normalizeLinkUrl(raw: any){
  const trimmed=String(raw||'').trim();
  if(!trimmed) return null;
  if(/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed.slice(0,2000);
  return ('https://'+trimmed).slice(0,2000);
}
export function taskMatchesSearch(t: any, query: any){
  const q=String(query||'').trim().toLowerCase();
  if(!q) return true;
  if(String(t.text||'').toLowerCase().includes(q)) return true;
  if(isWaiting(t)&&waitingLabel(t).toLowerCase().includes(q)) return true;
  if(t.dueDate){
    if(t.dueDate.toLowerCase().includes(q)) return true;
    const fmted=fmtDue(t.dueDate);
    if(fmted&&fmted.toLowerCase().includes(q)) return true;
  }
  if(t.repeat&&repeatLabel(t.repeat).toLowerCase().includes(q)) return true;
  if(t.link&&t.link.toLowerCase().includes(q)) return true;
  if(t.linkLabel&&t.linkLabel.toLowerCase().includes(q)) return true;
  return false;
}
export function fmtDue(dateStr: any){
  if(!dateStr) return '';
  const d=new Date(dateStr+'T00:00:00');
  const today=new Date(); today.setHours(0,0,0,0);
  const diffDays=Math.round(((d as any)-(today as any))/86400000);
  if(diffDays===0) return 'Today';
  if(diffDays===1) return 'Tomorrow';
  if(diffDays===-1) return 'Yesterday';
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
export function isOverdue(dateStr: any, done: any){
  if(!dateStr||done) return false;
  const d=new Date(dateStr+'T00:00:00'); const today=new Date(); today.setHours(0,0,0,0);
  return d<today;
}
export function fmtLink(url: any){
  if(!url) return '';
  try{
    const u=new URL(url);
    return u.hostname.replace(/^www\./,'') || url;
  }catch(e){
    return String(url).replace(/^https?:\/\//,'').slice(0,30);
  }
}
// The date in a few characters: Today / Tomorrow / Yesterday, a weekday within the coming week,
// otherwise "Oct 2".
export function dueShort(dateStr: any){
  const d=parseISODate(dateStr); if(!d) return '';
  const today=new Date(); today.setHours(0,0,0,0);
  const diff=Math.round(((d as any)-(today as any))/86400000);
  if(diff>=2&&diff<=6) return d.toLocaleDateString(undefined,{weekday:'short'});
  return fmtDue(dateStr);
}
export function toISODate(d: any){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
export function dueDatePreset(daysFromToday: any){
  const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+daysFromToday);
  return toISODate(d);
}
export function parseISODate(s: any){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s||'')) return null;
  const [y,m,d]=s.split('-').map(Number);
  return new Date(y,m-1,d);
}
export function todosHistorySummary(list: any){
  if(!Array.isArray(list)||!list.length)return 'empty';
  const open=list.filter(t=>!t.done).length; const done=list.length-open;
  return open+' open, '+done+' done';
}
