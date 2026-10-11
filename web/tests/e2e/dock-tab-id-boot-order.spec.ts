import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// 'Failed to register a ServiceWorker...null origin' is a file://-protocol testing artifact
// (no ServiceWorker support under a null origin) that has nothing to do with app code -- it
// does not happen in the real deployed app over https. Every other uncaught error is real.
function isTestEnvironmentNoise(message: string): boolean {
  return message.includes('ServiceWorker');
}

async function gotoWithErrorCapture(page: import('@playwright/test').Page, setup: () => void) {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.addInitScript(setup);
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
    document.getElementById('welcome-overlay')?.remove();
  });
  await page.waitForTimeout(800);
  return pageErrors.filter(e => !isTestEnvironmentNoise(e));
}

// (History, kept for context:) DOCK_TAB_PANEL_ID/MAXIMIZE_ID/MAXICON_ID/CLOSE_ID and dockActiveTab used to be declared only
// once script execution reached the "Dock panel tab strip orchestration" module, hundreds of
// lines after the Hub panel modules (at the time Todos/Meetings/Journal/Recap) that each call their own
// (only To-Dos remains now, and only dockActiveTab is still hoisted)
// applyXLocation() at their own top-level boot time -- which closes that panel via
// closeXPanel() -> dockSyncRailVisibility() -> dockPanelIsOpen() whenever that feature is
// disabled in settings. dockPanelIsOpen() reads DOCK_TAB_PANEL_ID, and dockSyncRailVisibility()
// itself reads/writes dockActiveTab. Disabling any one of those panel features therefore
// crashed on load with "Cannot access ... before initialization", aborting the rest of boot.
//
// This surfaced in two separate rounds: fixing DOCK_TAB_PANEL_ID alone (moving just the four
// id-map consts) looked complete and had a test asserting no error containing the literal
// string "DOCK_TAB_PANEL_ID" -- but the very next live report, still with Meetings disabled,
// hit dockSyncRailVisibility's OTHER uninitialized reference (dockActiveTab) and threw a
// different message that narrow assertion never would have caught. Asserting on zero uncaught
// errors at all (below), not on one specific error string, is what actually would have caught
// the second crash immediately instead of needing a second live report.
test.describe('No panel module throws an uncaught TDZ error when disabled at boot', () => {
  test('disabling the To-Dos feature (the only remaining dock panel) does not throw any uncaught error on load', async ({ page }) => {
    const errors = await gotoWithErrorCapture(page, () => {
      try {
        const raw = localStorage.getItem('sakura_todos_settings_v1');
        const obj = raw ? JSON.parse(raw) : {};
        obj.featureEnabled = false;
        localStorage.setItem('sakura_todos_settings_v1', JSON.stringify(obj));
      } catch {}
    });
    expect(errors).toEqual([]);
  });
});

// Meeting Notes, Journal, Library, and Recap were all removed outright (not hidden behind a
// flag). Anyone upgrading still has their old keys sitting in localStorage — settings blobs, a
// remembered dock tab pointing at a tab that no longer exists, custom shortcuts for removed
// actions, and to-dos that were promoted from a meeting action item (carrying a meetingRef).
// All of that must be silently ignored on boot: no uncaught error, nothing deleted out from
// under the person, and the surviving To-Dos still render.
test.describe('Leftover Meetings/Journal/Library/Recap data from before their removal is harmlessly ignored', () => {
  for (const lastTab of ['meetings', 'journal', 'library', 'report']) {
    test(`boots cleanly and the launcher still opens To-Dos with stale keys present (remembered tab: ${lastTab})`, async ({ page }) => {
      await page.addInitScript((tab) => { try { localStorage.setItem('sakura_dock_last_tab', tab); } catch {} }, lastTab);
      const errors = await gotoWithErrorCapture(page, () => {
        try {
          localStorage.setItem('sakura_meetings_settings_v1', JSON.stringify({ featureEnabled: false, expiryDays: 7, capMax: 10, pastCollapsedByDefault: true }));
          localStorage.setItem('sakura_journal_settings_v1', JSON.stringify({ featureEnabled: false }));
          localStorage.setItem('sakura_library_settings_v1', JSON.stringify({ featureEnabled: false }));
          localStorage.setItem('sakura_report_settings_v1', JSON.stringify({ featureEnabled: false }));
          localStorage.setItem('sakura_meetings_v1', JSON.stringify([{ id: 'mnold', title: 'Old meeting', date: '2026-01-01' }]));
          localStorage.setItem('sakura_journal_v1', JSON.stringify([{ id: 'jnold', date: '2026-01-01', body: 'old entry' }]));
          localStorage.setItem('sakura_library_v1', JSON.stringify([{ id: 'libold', title: 'Old library note', body: '' }]));
          localStorage.setItem('sakura-shortcut-overrides', JSON.stringify({ toggleMeetings: 'mod+shift+y', toggleJournal: 'mod+shift+u' }));
          localStorage.setItem('sakura_todos_v1', JSON.stringify([
            { id: 'todo-from-meeting', text: 'Follow up from meeting', done: false, createdAt: 1, completedAt: null, priority: 'none', status: 'none', dueDate: null, link: null, linkLabel: null, nodeRef: null, meetingRef: { meetingId: 'mnold', title: 'Old meeting' }, repeat: null, subtasks: [], subtasksOpen: true }
          ]));
        } catch {}
      });
      expect(errors).toEqual([]);

      const state = await page.evaluate(() => {
        document.getElementById('dock-panel-appbar-toggle')?.click();
        return {
          // @ts-expect-error — bare globals from index.html
          active: dockActiveTab,
          // @ts-expect-error
          open: dockPanelIsOpen(),
          removedPanels: ['meetings-panel', 'journal-panel', 'library-panel', 'report-panel', 'dock-tabstrip'].filter((id) => !!document.getElementById(id)),
          todoText: document.getElementById('todos-body')?.textContent || '',
          meetingChip: !!document.querySelector('.todo-meeting-chip'),
          stored: ['sakura_meetings_v1', 'sakura_journal_v1', 'sakura_library_v1', 'sakura_report_settings_v1'].map((k) => localStorage.getItem(k) !== null)
        };
      });
      expect(state.removedPanels).toEqual([]);
      // A remembered tab that no longer exists is simply ignored: the launcher opens To-Dos.
      expect(state.active).toBe('todos');
      expect(state.open).toBe(true);
      expect(state.todoText).toContain('Follow up from meeting');
      expect(state.meetingChip).toBe(false);
      // Old data is left alone, never proactively deleted.
      expect(state.stored).toEqual([true, true, true, true]);
    });
  }
});
