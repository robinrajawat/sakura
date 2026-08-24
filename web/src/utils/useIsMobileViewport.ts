import { useEffect, useState } from 'react';

/**
 * §6.5 slice (docs/phase6-full-parity-plan.md), Mobile Hub. `web/` has no client-side routing
 * (a deliberate Phase 0 decision, docs/framework-migration-plan.md's decision #3) and no
 * existing responsive-breakpoint system anywhere -- legacy's own Mobile Hub instead exists as a
 * wholly separate page (`hub.html`) that IS the mobile experience, never squeezed-down desktop
 * chrome. Since this project has one SPA with no page boundary to split on, a live viewport-width
 * breakpoint is the closest honest equivalent: narrow enough that `App.tsx` swaps in
 * `MobileHub.tsx` entirely, the same "wholly separate, focused experience" feel legacy's own
 * `hub.html` has, rather than legacy's real chrome (account menu, search bar, offline banner)
 * getting a second, redundant copy here.
 *
 * 640px matches neither a legacy nor an industry-standard-mandated number -- there is no
 * breakpoint in legacy to port, since it never had a desktop/mobile split within one page --
 * chosen as a common "phone portrait width and narrower" cutoff (Tailwind's own `sm` breakpoint
 * uses the same value) that comfortably covers real phone viewports without also catching a
 * narrowed desktop browser window, which the existing desktop Hub layout already handles fine.
 */
const MOBILE_BREAKPOINT_PX = 640;

export function useIsMobileViewport(breakpoint: number = MOBILE_BREAKPOINT_PX): boolean {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return isMobile;
}
