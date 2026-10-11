import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Cutdown item 8b: data backup is simplified. Signed in, Firestore sync is the live copy
// (unchanged). Signed out, backup is fully manual — Settings → Data keeps only "Backup all data",
// "Restore from backup", and "Undo last restore". Removed: Cloud Backup (GitHub Gist + Google
// Drive), Auto-backup to file (+ Backup history), the "Remind me to back up" status-bar chip, the
// "Warn if this session isn't backed up" close-tab prompt, and the automatic Local safety copy.
// These tests pin what's left, that a manual backup round-trips, and that data/prefs written by
// older builds (old backup files, stale localStorage/IndexedDB keys) load harmlessly.

// The welcome modal opens on a ~500ms timer whenever no documents exist yet, so it could appear
// mid-test and intercept clicks. Marking it as already seen before the page loads removes that race.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); } catch { /* storage unavailable */ } });
});

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

function trackErrors(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push('pageerror: ' + err.message); });
  page.on('console', (msg) => { if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) errors.push('console.error: ' + msg.text()); });
  return errors;
}

async function dismissOverlays(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
}

async function setDocText(page: import('@playwright/test').Page, rootText: string) {
  await page.evaluate((text) => {
    // A fresh profile starts with no document open (landing/empty state) — create one to edit.
    // @ts-expect-error -- bare globals from index.html
    ensureDocumentForEditing();
    // @ts-expect-error -- bare globals from index.html
    nodes = [
      { id: 1, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      { id: 2, depth: 1, text: text + ' child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }
    ];
    // @ts-expect-error
    collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 3;
    // @ts-expect-error
    render(); saveToStorage();
  }, rootText);
}

async function docTexts(page: import('@playwright/test').Page): Promise<string[]> {
  // @ts-expect-error -- bare global from index.html
  return page.evaluate(() => nodes.map((n) => n.text));
}

async function openDataSettings(page: import('@playwright/test').Page) {
  // In the default decluttered app bar the Settings button can sit under the account control's
  // hit area, so trigger it through the DOM rather than a pointer click.
  await page.evaluate(() => {
    if (!document.getElementById('settings-panel')?.classList.contains('open')) document.getElementById('settings-toggle')?.click();
    // @ts-expect-error -- bare global from index.html
    applySettingsCategory('data');
  });
  await expect(page.locator('#settings-panel')).toHaveClass(/open/);
}

async function restoreFile(page: import('@playwright/test').Page, file: string) {
  await page.locator('#sakura-import-file-input').setInputFiles(file);
  const confirm = page.locator('#sakura-modal-actions .smodal-btn', { hasText: 'Import' });
  await expect(confirm).toBeVisible();
  await Promise.all([page.waitForEvent('load'), confirm.click()]);
  await dismissOverlays(page);
}

test.describe('Simplified data backup (manual when signed out)', () => {
  test('Settings → Data shows only Backup all data, Restore, Undo last restore (+ note and Reset); no Cloud Backup', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    // "Undo last restore" only appears once a pre-restore snapshot exists — seed one.
    await page.evaluate(async () => {
      // @ts-expect-error -- bare globals from index.html
      await idbSet('preRestoreSnapshot', { payload: await buildFullBackupPayload(), savedAt: Date.now(), reason: 'restore from backup file' });
    });

    await openDataSettings(page);
    const dataSection = page.locator('#settings-panel .settings-section[data-cat="data"]').filter({ has: page.locator('.settings-section-title', { hasText: /^Data$/ }) });
    await expect(dataSection).toBeVisible();
    const rows = dataSection.locator('.settings-list-row .settings-switch-text');
    expect(await rows.allTextContents()).toEqual(['Backup all data', 'Restore from backup', 'Undo last restore', 'Why this matters', 'Reset to default settings']);
    await expect(page.locator('#sb-export-all-btn')).toBeVisible();
    await expect(page.locator('#sb-import-all-btn')).toBeVisible();
    await expect(page.locator('#sb-undo-restore-btn')).toBeVisible();

    const titles = await page.locator('#settings-panel .settings-section[data-cat="data"] .settings-section-title').allTextContents();
    expect(titles).toContain('Secure Storage');
    expect(titles).not.toContain('Cloud Backup');

    // Nothing from the removed features is left in the panel's text or DOM.
    const panelText = (await page.locator('#settings-panel').textContent()) || '';
    for (const gone of ['Gist', 'Google Drive', 'Auto-backup to file', 'Backup history', 'Local safety copy', 'Remind me to back up', "Warn if this session isn't backed up"]) {
      expect(panelText, gone).not.toContain(gone);
    }
    await expect(page.locator('#sb-fs-backup-btn, #sb-idb-restore-btn, #backup-reminder-days-select, #session-backup-mode-select, #cloud-gist-field, #cloud-drive-field, #sbitem-fsstatus')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a manual Backup all data file restores a document (round trip), and Undo last restore reverts it', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setDocText(page, 'Round trip original');

    await openDataSettings(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#sb-export-all-btn').click()]);
    expect(download.suggestedFilename()).toMatch(/^sakura-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const file = test.info().outputPath('backup.json');
    await download.saveAs(file);
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(payload._sakuraExport).toBe(true);
    expect(JSON.stringify(payload.data)).toContain('Round trip original');

    await page.keyboard.press('Escape');
    await setDocText(page, 'Changed after backup');
    expect(await docTexts(page)).toContain('Changed after backup');

    await restoreFile(page, file);
    await expect.poll(() => docTexts(page)).toContain('Round trip original');

    // Undo last restore brings back what was there right before the restore.
    await openDataSettings(page);
    await expect(page.locator('#sb-undo-restore-row')).toBeVisible();
    await page.locator('#sb-undo-restore-btn').click();
    const undo = page.locator('#sakura-modal-actions .smodal-btn', { hasText: 'Undo Restore' });
    await expect(undo).toBeVisible();
    await Promise.all([page.waitForEvent('load'), undo.click()]);
    await dismissOverlays(page);
    await expect.poll(() => docTexts(page)).toContain('Changed after backup');
    expect(errors).toEqual([]);
  });

  test('an OLD-format backup carrying Gist/Drive, FS-backup, reminder and close-warning fields restores without error', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setDocText(page, 'Old format document');
    const payload = await page.evaluate(async () => {
      // @ts-expect-error -- bare global from index.html
      const p = await buildFullBackupPayload();
      const prefs = JSON.parse(p.data.sakura_v001_prefs || '{}');
      Object.assign(prefs, {
        backupReminderDays: 1,
        sessionBackupPromptMode: 'strict',
        statusbarHiddenItems: ['nodecount', 'fsstatus'],
        statusbarRightOrder: ['saved', 'fsstatus', 'backupreminder', 'vault', 'autorewrite']
      });
      p.data.sakura_v001_prefs = JSON.stringify(prefs);
      p.data.sakura_cloud_backup_v1 = JSON.stringify({ gistToken: 'ghp_oldtoken', gistId: 'abc123', gistAutoSync: true, gistConflict: true, driveClientId: 'x.apps.googleusercontent.com', driveAutoSync: true });
      p.data.sakura_fsBackupConnected = '1';
      p.data.sakura_last_fsbackup_v1 = '1';
      p.data.sakura_last_export_v1 = '1';
      return p;
    });
    const file = test.info().outputPath('old-backup.json');
    fs.writeFileSync(file, JSON.stringify(payload));

    await setDocText(page, 'Overwritten');
    await restoreFile(page, file);
    await expect.poll(() => docTexts(page)).toContain('Old format document');

    // Removed status-bar chips never appear; a stale reminder setting can't resurrect one.
    await expect(page.locator('#sb-backup-reminder-chip, #sb-fs-status-chip')).toHaveCount(0);
    const statusText = (await page.locator('#statusbar').textContent()) || '';
    expect(statusText).not.toMatch(/Back up your data|Connect backup|Reconnect backup|Backed up/);

    // Old prefs load harmlessly and the removed keys drop on the next save.
    const saved = await page.evaluate(() => {
      // @ts-expect-error -- bare global from index.html
      savePrefs();
      return JSON.parse(localStorage.getItem('sakura_v001_prefs') || '{}');
    });
    expect(saved).not.toHaveProperty('backupReminderDays');
    expect(saved).not.toHaveProperty('sessionBackupPromptMode');
    expect(saved.statusbarHiddenItems).not.toContain('fsstatus');
    expect(saved.statusbarRightOrder).not.toContain('fsstatus');
    expect(saved.statusbarRightOrder).not.toContain('backupreminder');
    expect(errors).toEqual([]);
  });

  test('booting with stale keys from the removed features (incl. an old IndexedDB file handle) is clean: no errors, prompts, or reminder chip', async ({ page }) => {
    const errors = trackErrors(page);
    const dialogs: string[] = [];
    page.on('dialog', async (d) => { dialogs.push(d.type()); await d.dismiss(); });
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setDocText(page, 'Stale keys document');
    await page.evaluate(async () => {
      localStorage.setItem('sakura_fsBackupConnected', '1');
      localStorage.setItem('sakura_last_fsbackup_v1', '1');
      localStorage.setItem('sakura_cloud_backup_v1', JSON.stringify({ gistToken: 'ghp_stale', gistAutoSync: true, driveAutoSync: true }));
      const prefs = JSON.parse(localStorage.getItem('sakura_v001_prefs') || '{}');
      Object.assign(prefs, { backupReminderDays: 1, sessionBackupPromptMode: 'passive', statusbarHiddenItems: [] });
      localStorage.setItem('sakura_v001_prefs', JSON.stringify(prefs));
      // What the removed features left in IndexedDB: a stored handle record, the safety-copy
      // mirror, and FS backup history. None of it may be read or trigger anything on boot.
      // @ts-expect-error -- bare globals from index.html
      await idbSet('fsHandle', { kind: 'file', name: 'sakura-backup.json' });
      // @ts-expect-error
      await idbSet('localStorageMirror', { payload: { data: {} }, savedAt: 1 });
      // @ts-expect-error
      await idbSet('fsBackupHistory', [{ savedAt: 1, payload: { data: {} } }]);
      // @ts-expect-error
      suppressSaveToStorageOnUnload = true; suppressPrefsSaveOnUnload = true;
    });

    await page.reload();
    await dismissOverlays(page);
    await page.waitForTimeout(800); // the old FS-backup init retried after 150ms and toasted; give anything like it time to fire
    expect(await docTexts(page)).toContain('Stale keys document');
    await expect(page.locator('#sb-backup-reminder-chip, #sb-fs-status-chip')).toHaveCount(0);
    const statusText = (await page.locator('#statusbar').textContent()) || '';
    expect(statusText).not.toMatch(/Back up your data|Connect backup|Reconnect backup/);
    const toastText = await page.evaluate(() => Array.from(document.querySelectorAll('.toast, #toast, .action-toast')).map((t) => t.textContent).join(' '));
    expect(toastText).not.toMatch(/Auto-backup|Gist|Drive/);

    // Hiding the tab (the old Passive close-warning trigger) shows no backup dialog.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(300);
    const modalTitle = (await page.locator('#sakura-modal').textContent().catch(() => '')) || '';
    expect(modalTitle).not.toContain('No backup taken this session');

    // Stale IndexedDB machinery keys stay out of new backup files (and are never deleted).
    const keys = await page.evaluate(async () => {
      // @ts-expect-error -- bare globals from index.html
      const p = await buildFullBackupPayload();
      // @ts-expect-error
      const stillThere = !!(await idbGet('localStorageMirror'));
      return { keys: Object.keys(p.data), stillThere };
    });
    expect(keys.keys).not.toContain('idb::fsHandle');
    expect(keys.keys).not.toContain('idb::localStorageMirror');
    expect(keys.keys).not.toContain('idb::fsBackupHistory');
    expect(keys.stillThere).toBe(true);
    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
  });
});
