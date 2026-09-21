import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubPath = path.resolve(__dirname, '../../hub.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource|Firebase|firestore/i;

// Third Hub feature-domain slice: subtask CRUD (toggleSubtaskCore/removeSubtaskCore/
// addSubtaskCore, src/state/hubSubtasks.ts). Unlike prior slices, the logic here lives inside
// anonymous DOM event-listener callbacks rather than named wrapper functions — so this test
// drives the REAL UI (opening the task detail sheet, typing into the real subtask input and
// pressing Enter, clicking the real toggle/remove buttons) rather than calling a wrapper
// directly, proving the extracted core is wired correctly into the real listeners.
test.describe('generated hubSubtasks block (src/state/hubSubtasks.ts spliced into hub.html)', () => {
  test('add/toggle/remove subtask all work through the real DOM event listeners and persist via saveTodos', async ({ page }) => {
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!KNOWN_NOISE.test(err.message)) unexpectedErrors.push('pageerror: ' + err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) {
        unexpectedErrors.push('console.error: ' + msg.text());
      }
    });

    await page.goto('file://' + hubPath);
    await page.waitForTimeout(300);

    // Seed one real todo with a repeat already set (to prove addSubtaskCore's repeat-clearing
    // behavior fires through the real listener), then open its detail sheet via the real
    // openTaskDetail() entry point.
    const taskId = await page.evaluate(() => {
      // @ts-expect-error — bare globals from hub.html
      localStorage.removeItem('sakura_todos_v1');
      // @ts-expect-error
      const t = newTodo('Plan launch');
      // @ts-expect-error
      t.repeat = 'weekly';
      // @ts-expect-error
      todos = [t];
      // @ts-expect-error
      saveTodos();
      // @ts-expect-error
      openTaskDetail(t.id);
      return t.id;
    });

    // Real keydown-Enter on the real subtask input — exercises the actual listener, not a
    // direct core call.
    const subtaskInput = page.locator('#task-subtask-input');
    await subtaskInput.fill('  Draft announcement  ');
    await subtaskInput.press('Enter');

    const afterAdd = await page.evaluate((id) => {
      // @ts-expect-error
      const t = findTodo(id);
      return {
        subtaskCount: t.subtasks.length,
        text: t.subtasks[0].text,
        done: t.subtasks[0].done,
        repeat: t.repeat,
        // Confirm the real localStorage entry reflects the add — proves saveTodos() actually
        // ran from inside the listener, not just an in-memory mutation.
        // @ts-expect-error
        persisted: JSON.parse(localStorage.getItem('sakura_todos_v1'))[0].subtasks.length,
        inputCleared: (document.getElementById('task-subtask-input') as HTMLInputElement).value,
      };
    }, taskId);

    expect(afterAdd.subtaskCount).toBe(1);
    // Trimmed, matching addSubtaskCore's own trim behavior.
    expect(afterAdd.text).toBe('Draft announcement');
    expect(afterAdd.done).toBe(false);
    // Adding a subtask clears repeat — the real business rule, fired through the real listener.
    expect(afterAdd.repeat).toBeNull();
    expect(afterAdd.persisted).toBe(1);
    expect(afterAdd.inputCleared).toBe('');

    // Real click on the real toggle button, rendered by renderTaskSubtasks() from the add above.
    const toggleBtn = page.locator('#task-detail-subtasks .todo-subtask-check').first();
    await toggleBtn.click();

    const afterToggle = await page.evaluate((id) => {
      // @ts-expect-error
      const t = findTodo(id);
      return {
        done: t.subtasks[0].done,
        // @ts-expect-error
        persistedDone: JSON.parse(localStorage.getItem('sakura_todos_v1'))[0].subtasks[0].done,
      };
    }, taskId);
    expect(afterToggle.done).toBe(true);
    expect(afterToggle.persistedDone).toBe(true);

    // Real click on the real remove button.
    const removeBtn = page.locator('#task-detail-subtasks .todo-subtask-remove').first();
    await removeBtn.click();

    const afterRemove = await page.evaluate((id) => {
      // @ts-expect-error
      const t = findTodo(id);
      return {
        subtaskCount: t.subtasks.length,
        // @ts-expect-error
        persistedCount: JSON.parse(localStorage.getItem('sakura_todos_v1'))[0].subtasks.length,
        rowsInDom: document.querySelectorAll('#task-detail-subtasks .todo-subtask-row').length,
      };
    }, taskId);
    expect(afterRemove.subtaskCount).toBe(0);
    expect(afterRemove.persistedCount).toBe(0);
    expect(afterRemove.rowsInDom).toBe(0);

    // Pressing Enter with an empty/whitespace-only input adds nothing and doesn't touch repeat.
    await subtaskInput.fill('   ');
    await subtaskInput.press('Enter');
    const afterEmptyAdd = await page.evaluate((id) => {
      // @ts-expect-error
      const t = findTodo(id);
      return { subtaskCount: t.subtasks.length };
    }, taskId);
    expect(afterEmptyAdd.subtaskCount).toBe(0);

    // Proof the rest of hub.html's script still runs — an unrelated, physically-distant
    // function is still callable, same "entire script silently died" check as every other
    // cutover.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof todayStr === 'function' && typeof esc === 'function' && typeof jnUid === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });
});
