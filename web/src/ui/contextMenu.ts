/**
 * The app's one menu: right-click menus, ⋯ menus and toolbar dropdowns (showSbContextMenu,
 * openSbMenuUnder), with submenus, fold rows, icon rows, tiles and choices, arrow-key and Enter/Esc
 * handling, and height fitting. Moved here unchanged from index.html (2026-10-25, step 3 of the
 * owner's "standard, unified and elegant" plan); spliced back in by the generator's `contextMenu`
 * block, so index.html's ~200 call sites and its reads of _sbContextEl keep working as before.
 *
 * State is module-level `let`s shared with the rest of index.html's script (the splice keeps one
 * scope). Types are loose (`any`) on purpose: this is a move, not a rewrite.
 */
declare function closeMoveMenu(): void;
declare function hideLinkCard(): void;
declare function esc(value: unknown): string;
declare const closeAllPanelsExceptGlobalSearch: (() => void) | undefined;

// --- Sidebar context menu (right-click) ---
let _sbContextEl: any = null;
let _sbContextButtons: any = [];
let _sbContextActiveIndex: any = -1;
let _sbSubEl: any = null, _sbSubParent: any = null;
let _sbAnchorBtn: any = null, _sbAnchorJustClosed: any = null;
let _sbMenuOpener: any = null, _sbClosedFrom: any = null;
export function _sbContextUpdateHighlight(){ _sbContextButtons.forEach((b: any,i: number)=>b.classList.toggle('sb-context-active',i===_sbContextActiveIndex)); }
export function _sbContextKeyHandler(e: any){
  if(!_sbContextEl||!_sbContextButtons.length)return;
  // Handled keys stop here (this runs in the capture phase): an open menu owns them, so e.g. Esc
  // closing a table cell's menu doesn't also end that table's editing session, and arrows don't
  // move the caret between cells underneath it.
  if(e.key==='ArrowDown'||e.key==='ArrowUp'||e.key==='Escape'||e.key==='ArrowRight'||e.key==='ArrowLeft'||(e.key==='Enter'&&_sbContextActiveIndex>=0))e.stopPropagation();
  // Submenus: → opens the highlighted item's flyout and moves the highlight into it; ← or Esc
  // closes the flyout and returns to its parent item.
  if(e.key==='ArrowRight'){ const b=_sbContextButtons[_sbContextActiveIndex]; if(b&&b._sbSubmenu&&!_sbSubParent){ e.preventDefault(); _sbOpenSubmenu(b,true); } return; }
  if((e.key==='ArrowLeft'||e.key==='Escape')&&_sbSubParent){ e.preventDefault(); _sbCloseSubmenu(); return; }
  if(e.key==='ArrowDown'){ e.preventDefault(); _sbContextActiveIndex=(_sbContextActiveIndex+1+_sbContextButtons.length)%_sbContextButtons.length; _sbContextUpdateHighlight(); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); _sbContextActiveIndex=(_sbContextActiveIndex-1+_sbContextButtons.length)%_sbContextButtons.length; _sbContextUpdateHighlight(); }
  else if(e.key==='Enter'){ if(_sbContextActiveIndex>=0){ e.preventDefault(); _sbContextButtons[_sbContextActiveIndex].click(); } }
  else if(e.key==='Escape'){ e.preventDefault(); const a=_sbAnchorBtn; closeSbContextMenu(); a?.focus(); }
}
export function closeSbContextMenu(e?: any){
  // A click on a submenu's own parent item opens that submenu, and a fold row unfolds in place,
  // instead of closing everything.
  if(e&&e.type==='click'&&e.target?.closest?.('.sb-context-submenu-trigger, .sb-context-fold, .sb-context-keep'))return;
  // A right-click inside the menu (e.g. on a quick-row icon) is handled there and keeps it open.
  if(e&&e.type==='contextmenu'&&_sbContextEl&&_sbContextEl.contains(e.target))return;
  // Closing a dropdown by clicking its own button again: note it, so that click doesn't reopen it.
  if(_sbAnchorBtn){ if(e&&e.type==='click'&&_sbAnchorBtn.contains(e.target)){ _sbAnchorJustClosed=_sbAnchorBtn; setTimeout(()=>{ _sbAnchorJustClosed=null; },0); } _sbAnchorBtn.setAttribute('aria-expanded','false'); _sbAnchorBtn.classList.remove('menu-open'); _sbAnchorBtn=null; }
  if(_sbContextEl){ _sbClosedFrom=_sbMenuOpener; _sbMenuOpener=null; setTimeout(()=>{ _sbClosedFrom=null; },0); _sbContextEl.remove(); _sbContextEl=null;} _sbContextButtons=[]; _sbContextActiveIndex=-1; _sbSubParent=null; _sbSubEl=null; document.removeEventListener('click', closeSbContextMenu, true); document.removeEventListener('contextmenu', closeSbContextMenu, true); document.removeEventListener('keydown', _sbContextKeyHandler, true); }
// One level of submenu for showSbContextMenu: an item with `submenu:[...items]` renders as a parent
// row with a chevron and opens a flyout beside it on hover, click, or →. The flyout is a child of
// the menu element, so closing the menu always closes it too.
export function _sbBuildItemButton(it: any, container: any, list: any){
  if(it.divider){ const d=document.createElement('div'); d.className='sb-context-divider'; container.appendChild(d); return null; }
  // A quiet line of help text at the end of a list (e.g. "Type to find more…"); not an item.
  if(it.hint){ const h=document.createElement('div'); h.className='sb-context-hint'; h.textContent=it.hint; container.appendChild(h); return null; }
  // A small section heading, and a compact grid of icon-only tiles (name on hover) — used by the
  // card icon picker so two dozen icons fit in one short submenu.
  if(it.heading){
    const h=document.createElement('div'); h.className='sb-context-heading'; h.textContent=it.heading; container.appendChild(h);
    // Optional small icon button at the heading's right end (e.g. a group's filter toggle); it is
    // part of the arrow-key order like any item.
    if(it.action){
      h.classList.add('has-action');
      const a=document.createElement('button'); a.type='button'; a.className='sb-context-item sb-context-heading-action'+(it.action.active?' on':'');
      a.innerHTML=it.action.icon||''; a.dataset.tip=it.action.label; a.setAttribute('aria-label',it.action.label); a.setAttribute('aria-pressed',String(!!it.action.active));
      a.addEventListener('click',async e=>{ e.stopPropagation(); closeSbContextMenu(); await it.action.onClick(); });
      a.addEventListener('mouseenter',()=>{ _sbContextActiveIndex=list.indexOf(a); _sbContextUpdateHighlight(); });
      h.appendChild(a); list.push(a);
    }
    return null;
  }
  if(it.choices){
    const grid=document.createElement('div'); grid.className='sb-context-choices'; container.appendChild(grid);
    if(it.cols)grid.style.gridTemplateColumns='repeat('+it.cols+',auto)';
    it.choices.forEach((t: any)=>{
      const b=document.createElement('button'); b.type='button'; b.className='sb-context-item sb-context-choice'+(t.current?' current':'');
      if(t.color)b.style.setProperty('--choice-color',t.color);
      b.innerHTML=(t.icon||'')+'<span class="sb-context-label"></span>'; (b.querySelector('.sb-context-label') as HTMLElement).textContent=t.label;
      if(t.tip)b.dataset.tip=t.tip; b.setAttribute('aria-pressed',String(!!t.current));
      b.addEventListener('click',async e=>{ e.stopPropagation(); closeSbContextMenu(); await t.onClick(); });
      b.addEventListener('mouseenter',()=>{ _sbContextActiveIndex=_sbContextButtons.indexOf(b); _sbContextUpdateHighlight(); });
      grid.appendChild(b); list.push(b);
    });
    return null;
  }
  // A row of small icon buttons, optionally labelled ("Move  ↑ ↓"); {sep:true} draws a divider.
  // The node menu's quick row and its Add / Move / Sort rows use it.
  if(it.iconRow){
    const row=document.createElement('div'); row.className='sb-context-iconrow'+(it.cls?' '+it.cls:''); if(it.id)row.id=it.id; row.setAttribute('role','group');
    const openLater: any[]=[];
    if(it.label){ const l=document.createElement('span'); l.className='sb-context-iconrow-label'; l.textContent=it.label; row.appendChild(l); row.setAttribute('aria-label',it.label); }
    it.iconRow.forEach((t: any)=>{
      if(t.sep){ const sp=document.createElement('span'); sp.className='pv-qm-sep'; row.appendChild(sp); return; }
      const b=document.createElement('button'); b.type='button'; b.className='pv-qm-btn sb-context-iconbtn'+(t.cls?' '+t.cls:'')+(t.current?' active':'')+(t.danger?' pv-qm-danger':'');
      b.innerHTML=t.icon||''; b.dataset.tip=t.label; b.setAttribute('aria-label',t.label); b.setAttribute('role','menuitem');
      if(t.action)b.dataset.action=t.action; if(t.data)Object.assign(b.dataset,t.data);
      row.appendChild(b);
      // An icon with `fold:[...]` (the node menu's ⋯) unfolds its items under the row, like a fold row.
      if(t.fold){
        if(t.id)b.id=t.id; b.classList.add('sb-context-keep'); b.setAttribute('aria-haspopup','true');
        const f=_sbFoldToggle(b, row, t, list);
        b.addEventListener('click',e=>{ e.stopPropagation(); f.toggle(); });
        b.addEventListener('mouseenter',()=>{ if(container===_sbContextEl&&_sbSubEl)_sbCloseSubmenu(false); _sbContextActiveIndex=list.indexOf(b); _sbContextUpdateHighlight(); });
        list.push(b); if(t.open)openLater.push(f.unfold);
        return;
      }
      if(t.disabled){ b.disabled=true; return; }
      b.addEventListener('click',async e=>{ e.stopPropagation(); closeSbContextMenu(); await t.onClick(); });
      b.addEventListener('mouseenter',()=>{ if(container===_sbContextEl&&_sbSubEl)_sbCloseSubmenu(false); _sbContextActiveIndex=list.indexOf(b); _sbContextUpdateHighlight(); });
      if(t.init)t.init(b);
      list.push(b);
    });
    container.appendChild(row); openLater.forEach(f=>f());
    return null;
  }
  if(it.tiles){
    const grid=document.createElement('div'); grid.className='sb-context-tiles'; container.appendChild(grid);
    it.tiles.forEach((t: any)=>{
      const b=document.createElement('button'); b.type='button'; b.className='sb-context-item sb-context-tile'+(t.current?' current':''); b.innerHTML=t.icon||''; b.dataset.tip=t.label; b.setAttribute('aria-label',t.label+(t.current?' (current)':''));
      b.addEventListener('click',async e=>{ e.stopPropagation(); closeSbContextMenu(); await t.onClick(); });
      b.addEventListener('mouseenter',()=>{ _sbContextActiveIndex=_sbContextButtons.indexOf(b); _sbContextUpdateHighlight(); });
      grid.appendChild(b); list.push(b);
    });
    return null;
  }
  // A row that unfolds its items in place, below it (folded by default) — for a list that is
  // useful but shouldn't lengthen the menu until asked for. Its items join the arrow-key order.
  if(it.fold){
    const t=document.createElement('button'); t.type='button'; t.className='sb-context-item sb-context-fold'; t.setAttribute('aria-expanded','false'); if(it.id)t.id=it.id;
    t.innerHTML='<span class="sb-context-icon">'+(it.icon||'')+'</span><span class="sb-context-label">'+esc(it.label)+'</span><svg class="sb-context-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>';
    const f=_sbFoldToggle(t, t, it, list);
    t.addEventListener('click',e=>{ e.stopPropagation(); f.toggle(); });
    t.addEventListener('mouseenter',()=>{ if(container===_sbContextEl&&_sbSubEl)_sbCloseSubmenu(false); _sbContextActiveIndex=list.indexOf(t); _sbContextUpdateHighlight(); });
    container.appendChild(t); list.push(t);
    if(it.open)f.unfold();
    return t;
  }
  const btn: any=document.createElement('button'); btn.className='sb-context-item'+(it.danger?' danger':'')+(it.disabled?' disabled':'')+(it.submenu?' sb-context-submenu-trigger':'');
  btn.innerHTML='<span class="sb-context-icon">'+(it.icon||'')+'</span><span class="sb-context-label">'+esc(it.label)+(it.sub?'<span class="sb-context-sub">'+esc(it.sub)+'</span>':'')+'</span>'+(it.meta?'<span class="sb-context-meta">'+esc(it.meta)+'</span>':'')+(it.checked?'<svg class="sb-context-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>':'')+(it.submenu?'<svg class="sb-context-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>':'');
  if(it.action)btn.dataset.action=it.action; if(it.data)Object.assign(btn.dataset,it.data); if(it.id)btn.id=it.id;
  if(it.checked!==undefined){ btn.setAttribute('role','menuitemradio'); btn.setAttribute('aria-checked',String(!!it.checked)); }
  if(it.disabled){ if(it.title)btn.title=it.title; btn.disabled=true; container.appendChild(btn); return null; }
  // A hint on an item shows in the app's tooltip, like everywhere else.
  if(it.title)btn.dataset.tip=it.title;
  // A small button at the item's right end that acts without closing the menu (e.g. "Add to quick row").
  if(it.trail){
    const tr=document.createElement('span'); tr.className='sb-context-trail sb-context-keep'+(it.trail.cls?' '+it.trail.cls:''); tr.setAttribute('role','button');
    tr.innerHTML=it.trail.icon||''; tr.dataset.tip=it.trail.label; tr.setAttribute('aria-label',it.trail.label); if(it.trail.data)Object.assign(tr.dataset,it.trail.data);
    tr.addEventListener('click',(e: any)=>{ e.stopPropagation(); it.trail.onClick(); });
    btn.appendChild(tr);
  }
  if(it.submenu){
    btn._sbSubmenu=it.submenu; btn._sbSubmenuId=it.submenuId||''; btn.setAttribute('aria-haspopup','menu');
    btn.addEventListener('click',(e: any)=>{ e.stopPropagation(); _sbOpenSubmenu(btn,false); });
    btn.addEventListener('mouseenter',()=>{ _sbContextActiveIndex=_sbContextButtons.indexOf(btn); _sbContextUpdateHighlight(); _sbOpenSubmenu(btn,false); });
  } else {
    btn.addEventListener('click',async (e: any)=>{ e.stopPropagation(); closeSbContextMenu(); await it.onClick(); });
    btn.addEventListener('mouseenter',()=>{
      // Hovering a plain top-level item closes any open flyout.
      if(container===_sbContextEl&&_sbSubEl)_sbCloseSubmenu(false);
      _sbContextActiveIndex=_sbContextButtons.indexOf(btn); _sbContextUpdateHighlight();
    });
  }
  container.appendChild(btn); list.push(btn);
  return btn;
}
// Unfolds `it.fold` items in a body placed after `after`; their buttons join the arrow-key order
// right after `trigger`. Shared by fold rows and icon-row buttons with a fold.
export function _sbFoldToggle(trigger: any, after: any, it: any, list: any){
  let box: any=null, kids: any[]=[];
  const unfold=()=>{
    box=document.createElement('div'); box.className='sb-context-fold-body'; if(it.bodyId)box.id=it.bodyId;
    kids=[]; it.fold.forEach((f: any)=>_sbBuildItemButton(f, box, kids));
    after.after(box); list.splice(list.indexOf(trigger)+1,0,...kids); trigger.setAttribute('aria-expanded','true');
  };
  const toggle=()=>{
    if(box){ box.remove(); box=null; kids.forEach((k: any)=>{ const i=list.indexOf(k); if(i>=0)list.splice(i,1); }); kids=[]; trigger.setAttribute('aria-expanded','false'); return; }
    unfold(); const m=trigger.closest('.sb-context-menu'); if(m)_sbRefitMenu(m); box.scrollIntoView({block:'nearest'});
  };
  trigger.setAttribute('aria-expanded','false');
  return {unfold, toggle};
}
export function _sbOpenSubmenu(trigger: any, viaKeyboard: any){
  if(_sbSubEl&&_sbSubEl._trigger===trigger){ if(viaKeyboard)_sbFocusSubmenu(); return; }
  _sbCloseSubmenu(false);
  const sub: any=document.createElement('div'); sub.className='sb-context-menu sb-context-submenu'; sub.setAttribute('role','menu'); sub._trigger=trigger;
  const subButtons: any[]=[];
  if(trigger._sbSubmenuId)sub.id=trigger._sbSubmenuId;
  trigger._sbSubmenu.forEach((it: any)=>_sbBuildItemButton(it, sub, subButtons));
  sub._buttons=subButtons;
  _sbContextEl.appendChild(sub);
  trigger.classList.add('sb-context-submenu-open'); trigger.setAttribute('aria-expanded','true');
  const r=trigger.getBoundingClientRect(); const mw=sub.offsetWidth, mh=sub.offsetHeight;
  let left=r.right+2; if(left+mw>window.innerWidth-8)left=Math.max(8,r.left-mw-2);
  const top=Math.max(8,Math.min(r.top-5, window.innerHeight-mh-8));
  sub.style.left=left+'px'; sub.style.top=top+'px';
  _sbSubEl=sub;
  if(viaKeyboard)_sbFocusSubmenu();
}
export function _sbFocusSubmenu(){
  if(!_sbSubEl||!_sbSubEl._buttons.length)return;
  _sbSubParent={buttons:_sbContextButtons, index:_sbContextActiveIndex};
  _sbContextButtons=_sbSubEl._buttons; _sbContextActiveIndex=0; _sbContextUpdateHighlight();
}
export function _sbCloseSubmenu(restoreFocus: any = true){
  if(!_sbSubEl)return;
  const trigger=_sbSubEl._trigger;
  _sbSubEl.remove(); _sbSubEl=null;
  trigger?.classList.remove('sb-context-submenu-open'); trigger?.setAttribute('aria-expanded','false');
  if(_sbSubParent){ _sbContextButtons=_sbSubParent.buttons; _sbContextActiveIndex=_sbSubParent.index; _sbSubParent=null; if(restoreFocus)_sbContextUpdateHighlight(); }
}
// A menu that grew (a fold unfolding) moves up to fit in the window; it only scrolls when it is
// taller than the window itself.
export function _sbRefitMenu(menu: any){
  menu.style.maxHeight='none';
  const top=parseFloat(menu.style.top)||menu.getBoundingClientRect().top;
  menu.style.top=Math.max(8,Math.min(top, window.innerHeight-menu.offsetHeight-8))+'px';
  _sbFitMenuHeight(menu);
}
// Caps only a menu taller than the room below its top. A menu that fits is left uncapped: with
// fractional sizes (display scaling, browser zoom) a cap equal to its own height rounds a pixel
// short and shows a scrollbar on a menu that has nothing to scroll (owner, 2026-10-23: diagram
// thumbnail menu opened low on the page).
export function _sbFitMenuHeight(menu: any){
  const top=parseFloat(menu.style.top)||menu.getBoundingClientRect().top;
  const room=window.innerHeight-top-8;
  menu.style.maxHeight='none';
  menu.style.maxHeight=menu.scrollHeight<=room+2?'none':Math.max(120,Math.floor(room))+'px';
}
// A dropdown is the same menu opened under its button (toolbar, chips, panel headers): left-aligned
// to it, or right-aligned with {alignRight:true}. A second click on the button closes it.
export function openSbMenuUnder(btn: any, items: any, opts: any = {}){
  if(!btn)return;
  if(_sbAnchorJustClosed===btn){ _sbAnchorJustClosed=null; return; }
  if(_sbAnchorBtn===btn&&_sbContextEl){ closeSbContextMenu(); return; }
  closeAllPanelsExceptGlobalSearch?.();
  const r=btn.getBoundingClientRect();
  showSbContextMenu(r.left,r.bottom+4,items,opts);
  const m=_sbContextEl; if(!m)return;
  m.classList.add('sb-dropdown');
  if(opts.alignRight)m.style.left=Math.max(8,Math.min(r.right-m.offsetWidth,window.innerWidth-m.offsetWidth-8))+'px';
  _sbAnchorBtn=btn; btn.setAttribute('aria-expanded','true'); btn.classList.add('menu-open');
  // Opened from the keyboard, the first item is highlighted so arrows and Enter work at once.
  if(opts.keyboard&&_sbContextButtons.length){ _sbContextActiveIndex=0; _sbContextUpdateHighlight(); }
}
// What had focus when the menu opened (the ⋯ button, a row). A popover opened from one of the menu's
// items gets it back on Escape: sbMenuOpener() returns it only while that item's click runs.
export function sbMenuOpener(){ const o=_sbClosedFrom; return o&&o.isConnected&&o!==document.body?o:null; }
export function showSbContextMenu(x: any, y: any, items: any, opts?: any){
  const opener=_sbContextEl&&_sbContextEl.contains(document.activeElement)?_sbMenuOpener:document.activeElement;
  closeSbContextMenu(); closeMoveMenu(); hideLinkCard();
  _sbMenuOpener=opener;
  const menu=document.createElement('div'); menu.className='sb-context-menu'; _sbContextEl=menu; menu.setAttribute('role','menu');
  if(opts&&opts.id)menu.id=opts.id; if(opts&&opts.label)menu.setAttribute('aria-label',opts.label);
  _sbContextButtons=[];
  items.forEach((it: any)=>_sbBuildItemButton(it, menu, _sbContextButtons));
  document.body.appendChild(menu);
  // Position with a rough guess first (avoids a layout flash), then correct against the
  // menu's actual rendered size. The guess alone isn't reliably screen-aware: item labels
  // like "Move to '<folder name>'" (sbDocContextItems) have no max-width and can render
  // wider than the 200px estimate, especially indented sub-folder entries — so a menu opened
  // near the right or bottom edge could still overflow off-screen using the guess alone.
  const estW=200, estH=Math.min(320, items.length*34+10);
  menu.style.left=Math.max(8,Math.min(x, window.innerWidth-estW-8))+'px';
  menu.style.top=Math.max(8,Math.min(y, window.innerHeight-estH-8))+'px';
  const rect=menu.getBoundingClientRect();
  const mw=rect.width||estW, mh=rect.height||estH;
  menu.style.left=Math.max(8,Math.min(x, window.innerWidth-mw-8))+'px';
  menu.style.top=Math.max(8,Math.min(y, window.innerHeight-mh-8))+'px';
  // Cap the height to the space below the menu's top edge (not the whole window); a menu that grows
  // after opening (a fold unfolding) first moves up (_sbRefitMenu) and only scrolls past that.
  _sbFitMenuHeight(menu);
  // Click/contextmenu closers wait a tick so the event that opened the menu doesn't close it; the
  // key handler doesn't need to (no keydown opened it), and registering it at once means an Esc
  // pressed right away closes this menu rather than reaching what's underneath (e.g. ending a
  // table editing session).
  document.addEventListener('keydown', _sbContextKeyHandler, true);
  const openedMenu=menu;
  setTimeout(()=>{ if(_sbContextEl!==openedMenu)return; document.addEventListener('click', closeSbContextMenu, true); document.addEventListener('contextmenu', closeSbContextMenu, true); },0);
}
