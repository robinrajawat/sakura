import { useRef, useState, type ReactNode } from 'react';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { TrashIcon } from '../icons';

/**
 * §6.5 slice (docs/phase6-full-parity-plan.md), Mobile Hub. Direct port of legacy's real
 * `initSwipeList`/`swipeRowShell` gesture engine (legacy/hub.html:903-1016) as a reusable React
 * component -- same pointer-event state machine, same tuning constants (`OPEN`/`LONG_PRESS_MS`/
 * `PRESS_VISUAL_DELAY`/`DECIDE_PX`), same tap-vs-horizontal-swipe-vs-vertical-scroll
 * disambiguation (a confirmed vertical scroll never fires `onTap`, even after release -- the bug
 * legacy's own header comment on `initSwipeList` documents fixing).
 *
 * Ported behavior: swipe left reveals a delete action (always, if `onSwipeLeft` is given);
 * swipe right reveals a complete action (only when `onSwipeRight` is given, e.g. To-Dos, not
 * Journal -- matches legacy's own per-list opt-in, since `initSwipeList` itself declines to open
 * a direction with no handler rather than treating it as a dead gesture); a stationary release
 * fires `onTap`; a long-press (550ms, if `onLongPress` is given) fires without any swipe.
 *
 * Deliberately not ported: the one-time "nudge" animation teaching the swipe gesture on first
 * use (legacy/hub.html:1017-1027, `nudgeFirstRowOnce`) and haptic feedback
 * (`navigator.vibrate`) on long-press -- both cosmetic polish on top of the real interaction,
 * not the interaction itself, deferred as a real, separately-scoped follow-up rather than
 * silently dropped.
 */
export function SwipeRow({
  id,
  children,
  onTap,
  onSwipeLeft,
  onSwipeRight,
  onLongPress
}: {
  id: string;
  children: ReactNode;
  onTap?: (id: string) => void;
  onSwipeLeft?: (id: string) => void;
  onSwipeRight?: (id: string) => void;
  onLongPress?: (id: string) => void;
}) {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  const OPEN = 76;
  const LONG_PRESS_MS = 550;
  const PRESS_VISUAL_DELAY = 120;
  const DECIDE_PX = 11;

  const contentRef = useRef<HTMLDivElement>(null);
  const [x, setXState] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [pressing, setPressing] = useState(false);

  const stateRef = useRef<{
    startX: number;
    startY: number;
    decided: 'h' | 'v' | null;
    baseX: number;
    wasOpen: boolean;
    lastX: number;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    pressVisualTimer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  function cancelLongPress() {
    const s = stateRef.current;
    if (!s) return;
    if (s.pressVisualTimer) clearTimeout(s.pressVisualTimer);
    if (s.longPressTimer) clearTimeout(s.longPressTimer);
    s.pressVisualTimer = null;
    s.longPressTimer = null;
    setPressing(false);
  }

  function closeRow() {
    setXState(0);
  }

  function onPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('[data-swipe-action]')) return;
    const baseX = x;
    stateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      decided: null,
      baseX,
      wasOpen: baseX !== 0,
      lastX: baseX,
      longPressTimer: null,
      pressVisualTimer: null
    };
    if (onLongPress && baseX === 0) {
      const s = stateRef.current;
      s.pressVisualTimer = setTimeout(() => {
        if (stateRef.current !== s || s.decided) return;
        setPressing(true);
      }, PRESS_VISUAL_DELAY);
      s.longPressTimer = setTimeout(() => {
        if (stateRef.current !== s || s.decided) return;
        stateRef.current = null;
        setPressing(false);
        onLongPress(id);
      }, LONG_PRESS_MS);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = stateRef.current;
    if (!s) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.decided) {
      if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
      s.decided = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      cancelLongPress();
    }
    if (s.decided !== 'h') return;
    const minX = onSwipeLeft ? -(OPEN + 24) : 0;
    const maxX = onSwipeRight ? OPEN + 24 : 0;
    const next = Math.max(minX, Math.min(maxX, s.baseX + dx));
    setDragging(true);
    setXState(next);
    s.lastX = next;
  }

  function finish() {
    const s = stateRef.current;
    if (!s) return;
    stateRef.current = null;
    cancelLongPress();
    setDragging(false);
    if (s.decided === 'h') {
      if (s.lastX <= -OPEN / 2 && onSwipeLeft) setXState(-OPEN);
      else if (s.lastX >= OPEN / 2 && onSwipeRight) setXState(OPEN);
      else closeRow();
    } else {
      if (s.wasOpen) closeRow();
      else if (!s.decided && onTap) onTap(id);
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 12,
        background: t.editBg,
        boxShadow: '0 1px 2px rgba(0,0,0,.06)',
        marginBottom: 8
      }}
    >
      {onSwipeRight && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingLeft: 20,
            background: '#27824f',
            opacity: x > 0 ? 1 : 0,
            transition: dragging ? 'none' : 'opacity .15s'
          }}
        >
          <button
            type="button"
            data-swipe-action="complete"
            onClick={() => {
              onSwipeRight(id);
              closeRow();
            }}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}
            aria-label="Complete"
          >
            ✓
          </button>
        </div>
      )}
      {onSwipeLeft && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 20,
            background: '#c0392b',
            opacity: x < 0 ? 1 : 0,
            transition: dragging ? 'none' : 'opacity .15s'
          }}
        >
          <button
            type="button"
            data-swipe-action="delete"
            onClick={() => {
              onSwipeLeft(id);
              closeRow();
            }}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
            aria-label="Delete"
          >
            <TrashIcon width={18} height={18} strokeWidth={1.8} />
          </button>
        </div>
      )}
      <div
        ref={contentRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        style={{
          position: 'relative',
          background: t.editBg,
          transform: x ? `translateX(${x}px)` : undefined,
          transition: dragging ? 'none' : 'transform .22s cubic-bezier(.2,.8,.2,1)',
          scale: pressing ? '0.97' : '1',
          touchAction: 'pan-y'
        }}
      >
        {children}
      </div>
    </div>
  );
}
