/**
 * The app's dialog engine: the one modal box (#sakura-modal-overlay) behind sakuraConfirm,
 * sakuraPrompt and sakuraPasswordPrompt, with its Enter/Esc keys, Tab focus trap and backdrop
 * click, plus onOverlayBackdropClick for the other overlays. Moved here unchanged from index.html
 * (2026-10-25, step 5 of the owner's "standard, unified and elegant" plan); spliced back in by the
 * generator's `dialogs` block at the same place, so every caller keeps working as before.
 *
 * Types are loose (`any`) on purpose: this is a move, not a rewrite.
 */
declare function el(id: string): any;

/* === Sakura Modal Engine === */
let _modalResolve: any=null;
export function _openModal({icon='',title='',body='',warning='',inputValue=null,inputLabel='',inputPlaceholder='',inputValue2=null,inputLabel2='',inputPlaceholder2='',buttons=[],iconClass=''}: any){
  return new Promise((resolve: any)=>{
    _modalResolve=resolve;
    const overlay=el('sakura-modal-overlay');
    el('sakura-modal-icon').innerHTML=icon;
    el('sakura-modal-icon').style.display=icon?'block':'none';
    el('sakura-modal-icon').className=iconClass;
    el('sakura-modal-title').textContent=title;
    el('sakura-modal-body').textContent=body;
    const warnEl=el('sakura-modal-warning'); if(warnEl){ warnEl.textContent=warning||''; warnEl.hidden=!warning; }
    const inputWrap=el('sakura-modal-input-wrap');
    const input=el('sakura-modal-input');
    const inputLabelEl=el('sakura-modal-input-label');
    const inputWrap2=el('sakura-modal-input2-wrap');
    const input2=el('sakura-modal-input2');
    const inputLabelEl2=el('sakura-modal-input2-label');
    if(inputValue!==null){
      inputWrap.style.display='block'; input.value=inputValue; input.placeholder=inputPlaceholder||'';
      if(inputLabel){inputLabelEl.textContent=inputLabel; inputLabelEl.style.display='block'} else {inputLabelEl.style.display='none'}
      setTimeout(()=>{input.focus(); input.select()},80);
    }
    else{inputWrap.style.display='none'}
    if(inputValue2!==null){
      inputWrap2.style.display='block'; input2.value=inputValue2; input2.placeholder=inputPlaceholder2||'';
      if(inputLabel2){inputLabelEl2.textContent=inputLabel2; inputLabelEl2.style.display='block'} else {inputLabelEl2.style.display='none'}
    } else {inputWrap2.style.display='none'}
    const actions=el('sakura-modal-actions');
    actions.innerHTML='';
    buttons.forEach(({label,cls,key}: any)=>{
      const btn=document.createElement('button');
      btn.className='smodal-btn '+(cls||'');
      btn.textContent=label;
      btn.addEventListener('click',()=>_closeModal(key));
      actions.appendChild(btn);
    });
    overlay.classList.add('open');
    input.addEventListener('keydown',_modalInputKey);
    input2.addEventListener('keydown',_modalInputKey);
    overlay.addEventListener('keydown',_modalOverlayKey);
    // focus first non-cancel button or cancel
    requestAnimationFrame(()=>{
      if(inputValue===null){const primary=actions.querySelector('.primary,.danger'); if(primary)primary.focus();}
    });
  });
}
export function _modalInputKey(e: any){if(e.key==='Enter'){e.preventDefault(); _closeModal('confirm')} else if(e.key==='Escape'){e.preventDefault(); _closeModal('cancel')}}
export function _modalOverlayKey(e: any){
  if(e.key==='Escape'){e.preventDefault(); _closeModal('cancel'); return}
  if(e.key==='Tab'){
    const focusable=[...el('sakura-modal').querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((el: any)=>!el.disabled);
    if(!focusable.length)return;
    e.preventDefault();
    const idx=focusable.indexOf(document.activeElement);
    const next=e.shiftKey?(idx<=0?focusable.length-1:idx-1):(idx>=focusable.length-1?0:idx+1);
    focusable[next].focus();
  }
}
export function _closeModal(key: any){
  const overlay=el('sakura-modal-overlay');
  const input=el('sakura-modal-input');
  const input2=el('sakura-modal-input2');
  input.removeEventListener('keydown',_modalInputKey);
  input2.removeEventListener('keydown',_modalInputKey);
  overlay.removeEventListener('keydown',_modalOverlayKey);
  const resolve=_modalResolve; _modalResolve=null;
  overlay.classList.add('closing');
  setTimeout(()=>{overlay.classList.remove('open','closing'); if(resolve)resolve({key,inputValue:input.value,inputValue2:input2.value})},180);
}
// Clicking the backdrop (not the modal box itself) cancels — but the same drag-select issue
// fixed on the note panel applies here too: selecting text in the input/textarea and releasing
// the mouse past the modal box's edge lands the eventual click's target on the overlay itself
// (the nearest common ancestor of the mousedown and mouseup points), which used to read as "the
// user clicked the backdrop" and cancel the dialog mid-selection. Only treat it as a genuine
// backdrop click if the mousedown that started the gesture was ALSO directly on the backdrop.
let _modalOverlayMouseDownOnBackdrop=false;
el('sakura-modal-overlay').addEventListener('mousedown',(e: any)=>{
  _modalOverlayMouseDownOnBackdrop=(e.target===el('sakura-modal-overlay'));
});
el('sakura-modal-overlay').addEventListener('click',(e: any)=>{
  if(e.target===el('sakura-modal-overlay')&&_modalOverlayMouseDownOnBackdrop)_closeModal('cancel');
});
// Shared version of the same fix for the several other overlays below (Version History, Demo,
// the consolidated Settings sub-modals, the Shortcuts cheatsheet, To-Dos History) that each close on a backdrop click the same way — factored out here so each call
// site is one line instead of repeating the mousedown-tracking flag by hand.
export function onOverlayBackdropClick(overlay: any,closeFn: any){
  if(!overlay)return;
  let mouseDownOnBackdrop=false;
  overlay.addEventListener('mousedown',(e: any)=>{ mouseDownOnBackdrop=(e.target===overlay); });
  overlay.addEventListener('click',(e: any)=>{ if(e.target===overlay&&mouseDownOnBackdrop)closeFn(); });
}

export async function sakuraConfirm({icon,title,body,warning='',confirmLabel='OK',confirmCls='primary',cancelLabel='Cancel'}: any){
  const res: any=await _openModal({icon,title,body,warning,inputValue:null,buttons:[{label:cancelLabel,cls:'',key:'cancel'},{label:confirmLabel,cls:confirmCls,key:'confirm'}]});
  return res.key==='confirm';
}
export async function sakuraPrompt({icon,title,body,defaultValue='',confirmLabel='Rename',cancelLabel='Cancel'}: any){
  const res: any=await _openModal({icon,title,body,inputValue:defaultValue,buttons:[{label:cancelLabel,cls:'',key:'cancel'},{label:confirmLabel,cls:'primary',key:'confirm'}]});
  if(res.key!=='confirm')return null;
  return res.inputValue;
}
export async function sakuraPasswordPrompt({icon,title,body,confirmLabel='OK',cancelLabel='Cancel'}: any){
  const input=el('sakura-modal-input');
  // CSS-masked rather than type="password" — a real password-type input appearing on the
  // page, followed shortly by an AI fetch() call once unlocked, is exactly the pattern that
  // triggers Chrome's save-password heuristic (no <form> required), which then misattributes
  // whatever text field was last edited — e.g. the node being rewritten — as the "username."
  // Masking visually via CSS instead means no input[type=password] element ever exists here.
  if(input)input.classList.add('key-masked');
  try{
    return await sakuraPrompt({icon,title,body,confirmLabel,cancelLabel});
  }finally{
    if(input)input.classList.remove('key-masked');
  }
}
