import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, readFile, stat, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const repo = process.cwd();
async function launch(profile: string): Promise<ElectronApplication> {
  const env = { ...process.env, CARELINK_TEST_MODE: '1', CARELINK_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    ...(process.env.CARELINK_TEST_EXECUTABLE
      ? { executablePath: resolve(process.env.CARELINK_TEST_EXECUTABLE), args: [] }
      : { args: [resolve(repo, 'apps/desktop')] }),
    env,
  });
}
async function profile(): Promise<string> {
  await mkdir(join(repo, 'runtime'), { recursive: true });
  return mkdtemp(join(repo, 'runtime', 'desktop-test-'));
}
async function ready(app: ElectronApplication) {
  const page = await app.firstWindow();
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('.loading-state')).toHaveCount(0);
  return page;
}
async function navigate(page: Page, path: string) {
  await page.goto(`carelink://app${path}`);
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('.loading-state')).toHaveCount(0);
}
async function untranslated(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const found: string[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || parent.closest('option,script,style')) continue;
      if (/[\u4e00-\u9fff]/.test(node.textContent ?? '') && parent.getClientRects().length)
        found.push(node.textContent!.trim());
    }
    return found;
  });
}

test('native desktop uses bundled services without an HTTP server or renderer Node access', async () => {
  const app = await launch(await profile());
  try {
    const page = await ready(app);
    expect(page.url()).toBe('carelink://app/');
    const preferences = await app.evaluate(({ BrowserWindow }) => {
      const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return {
        sandbox: prefs.sandbox,
        nodeIntegration: prefs.nodeIntegration,
        contextIsolation: prefs.contextIsolation,
      };
    });
    expect(preferences).toEqual({ sandbox: true, nodeIntegration: false, contextIsolation: true });
    expect(
      await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require),
    ).toBe('undefined');
    const result = await page.evaluate(async () => {
      const response = await fetch('/api/v1/patients');
      const body = await response.json();
      const blocked = await fetch('/api/v1/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      let externalBlocked = false;
      try {
        await fetch('https://example.com/');
      } catch {
        externalBlocked = true;
      }
      return { count: body.data.length, status: blocked.status, externalBlocked };
    });
    expect(result.count).toBe(8);
    expect(result.status).toBe(501);
    expect(result.externalBlocked).toBe(true);
    // Hidden Windows windows may not produce compositor frames for a screenshot.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
    await page.screenshot({ path: 'test-results/desktop/client-zh.png', animations: 'disabled' });
  } finally {
    await app.close();
  }
});

test('English covers every page and switching updates an open patient dialog', async () => {
  const app = await launch(await profile());
  try {
    const page = await ready(app);
    await page.getByTestId('language-select').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('main h1')).toHaveText('Workspace overview');
    for (const path of [
      '/',
      '/patients',
      '/encounters',
      '/records',
      '/consultations',
      '/health',
      '/audit',
      '/community',
      '/settings',
    ]) {
      await navigate(page, path);
      expect(await untranslated(page), `Untranslated text on ${path}`).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `Page overflow on ${path}`,
      ).toBe(true);
    }
    await navigate(page, '/patients');
    await page.locator('tbody tr').first().getByRole('button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await untranslated(page)).toEqual([]);
    // Native select remains outside the modal; use its real change path to exercise an open consumer.
    await page.getByTestId('language-select').selectOption('zh-CN', { force: true });
    await expect(page.getByRole('dialog')).toContainText('患者健康档案');
    await page.getByTestId('language-select').selectOption('en', { force: true });
    expect(await untranslated(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await navigate(page, '/');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
    await page.screenshot({ path: 'test-results/desktop/client-en.png', animations: 'disabled' });
  } finally {
    await app.close();
  }
});

test('language, community preference and database survive a complete application restart', async () => {
  const dataPath = await profile();
  let app = await launch(dataPath);
  try {
    let page = await ready(app);
    await page.getByTestId('language-select').selectOption('en');
    await navigate(page, '/settings');
    await page.getByRole('switch').click();
    await navigate(page, '/patients');
    await page.locator('tbody tr').first().getByRole('button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const before = await page.evaluate(async () =>
      (await (await fetch('/api/v1/audit')).json()).data.map((entry: { id: string }) => entry.id),
    );
    await app.close();
    expect((await stat(join(dataPath, 'data/doctor.sqlite'))).size).toBeGreaterThan(0);
    app = await launch(dataPath);
    page = await ready(app);
    await expect(page.getByTestId('language-select')).toHaveValue('en');
    await expect(page.locator('main h1')).toHaveText('Workspace overview');
    await expect(page.locator('nav a[href="/community"]')).toHaveCount(0);
    const after = await page.evaluate(async () =>
      (await (await fetch('/api/v1/audit')).json()).data.map((entry: { id: string }) => entry.id),
    );
    expect(after).toEqual(expect.arrayContaining(before));
    const signature = await readFile(join(dataPath, 'data/doctor.sqlite'));
    expect(signature.subarray(0, 15).toString()).toBe('SQLite format 3');
  } finally {
    await app.close();
  }
});
