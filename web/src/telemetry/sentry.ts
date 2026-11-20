/**
 * Loads Sentry and sends error reports (settings and scrubbing: ./sentryConfig.ts). Built by Vite into
 * its own file (vite.config.js, entry "sentry") and added by index.html's first script, on the live
 * site only, so tests, local copies and previews never load it.
 */
import { init, captureException } from '@sentry/browser';
import { SENTRY_DSN, MAX_VALUE_LENGTH, EXCLUDED_INTEGRATIONS, reportingEnabled, scrubEvent, bootErrorToException, type BootError } from './sentryConfig';

const w = window as unknown as { __sakuraBootErrors?: BootError[]; __sakuraEarlyRejections?: BootError[]; __sakuraSentryTestDsn?: string; __sakuraErrorReportsOn?: () => boolean };
// tests/e2e/error-reports.spec.ts sends to a stand-in Sentry it intercepts. Only a script already
// running on the page could set this, and such a script controls the page anyway.
const dsn = w.__sakuraSentryTestDsn || SENTRY_DSN;

if (reportingEnabled(location.origin, dsn)) {
  const release = document.getElementById('about-version')?.dataset.version || undefined;
  init({
    dsn,
    release,
    // Nothing about the person or their requests: no user, cookies, headers, bodies, query values or
    // local variables (the Sentry project also has "Prevent Storing of IP Addresses" on).
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, stackFrameVariables: false },
    maxValueLength: MAX_VALUE_LENGTH,
    // No breadcrumbs of clicks, console output or network requests: they can carry a person's words.
    // No session records either: they'd go out on every page load, and privacy.html promises a report
    // only when something goes wrong.
    integrations: (defaults) => defaults.filter((i) => !EXCLUDED_INTEGRATIONS.includes(i.name)),
    beforeBreadcrumb: () => null,
    // Settings → About → Error reports can turn them off while the page is open.
    beforeSend: (event) => (w.__sakuraErrorReportsOn?.() === false ? null : scrubEvent(event))
  });
  // Errors from before the SDK arrived (the first script keeps them), startup failures above all.
  for (const b of [...(w.__sakuraBootErrors || []), ...(w.__sakuraEarlyRejections || [])]) {
    captureException(bootErrorToException(b), { tags: { phase: b.beforeStart ? 'startup' : 'early' } });
  }
}
