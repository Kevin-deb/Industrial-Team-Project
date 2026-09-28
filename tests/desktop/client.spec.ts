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
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  env.CARELINK_TEST_MODE = '1';
  env.CARELINK_USER_DATA = profile;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CARELINK_PROFILE_PATH;
  for (const key of Object.keys(env)) if (key.startsWith('CARELINK_SMTP_')) delete env[key];
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
  await expect(page.locator('main')).toBeVisible();
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible()),
  ).toBe(false);
  return page;
}
async function login(page: Page, account = 'lin.zhiyuan') {
  await expect(page.locator('.auth-page')).toBeVisible();
  await page.locator('input[autocomplete="username"]').fill(account);
  await page.locator('input[autocomplete="current-password"]').fill('123456');
  const result = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/auth/password-login'),
  );
  await page.locator('.auth-primary').click();
  expect((await result).status()).toBe(201);
  await expect(page.locator('.auth-page')).toHaveCount(0);
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('.loading-state')).toHaveCount(0);
}
async function navigate(page: Page, path: string) {
  await page.goto('carelink://app' + path);
  await expect(page.locator('.auth-page')).toHaveCount(0);
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('.loading-state')).toHaveCount(0);
}
async function api(page: Page, path: string, token?: string) {
  return page.evaluate(
    async ({ path, suppliedToken }) => {
      const currentToken = suppliedToken ?? localStorage.getItem('carelink-session-token');
      const response = await fetch('/api/v1' + path, {
        headers: currentToken ? { authorization: 'Bearer ' + currentToken } : {},
      });
      return { status: response.status, body: await response.json() };
    },
    { path, suppliedToken: token },
  );
}

test('hidden desktop authenticates real users, isolates the renderer and revokes old sessions', async () => {
  const app = await launch(await profile());
  try {
    const page = await ready(app);
    expect(page.url()).toBe('carelink://app/');
    expect((await api(page, '/patients')).status).toBe(401);
    const preferences = await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents as unknown as {
        getLastWebPreferences(): {
          sandbox: boolean;
          nodeIntegration: boolean;
          contextIsolation: boolean;
        };
      };
      const prefs = contents.getLastWebPreferences();
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
    const externalBlocked = await page.evaluate(async () => {
      try {
        await fetch('https://example.com/');
        return false;
      } catch {
        return true;
      }
    });
    expect(externalBlocked).toBe(true);
    await login(page);
    const patients = await api(page, '/patients');
    expect(patients.status).toBe(200);
    expect(patients.body.data).toHaveLength(8);
    const oldToken = await page.evaluate(() => localStorage.getItem('carelink-session-token')!);
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(page.locator('.auth-page')).toBeVisible();
    expect((await api(page, '/patients', oldToken)).status).toBe(401);
    await login(page, 'liang.ruochuan');
    const scopedPatients = await api(page, '/patients');
    expect(scopedPatients.body.data.map((patient: { id: string }) => patient.id)).toEqual([
      'PAT-006',
      'PAT-007',
    ]);
    expect((await api(page, '/patients/PAT-001')).status).toBe(404);
  } finally {
    await app.close();
  }
});

test('profile and patient saves reach SQLite and audit, then survive a full desktop restart', async () => {
  const dataPath = await profile();
  let app = await launch(dataPath);
  try {
    let page = await ready(app);
    await login(page);
    await navigate(page, '/settings');
    await page.getByRole('button', { name: '编辑医生资料', exact: true }).click();
    const profileDialog = page.getByRole('dialog');
    await profileDialog.getByLabel('联系电话', { exact: true }).fill('13800009999');
    const profileSaved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/settings/profile') &&
        response.request().method() === 'PUT',
    );
    await profileDialog.getByRole('button', { name: '保存资料', exact: true }).click();
    expect((await profileSaved).status()).toBe(200);
    await expect(profileDialog).toHaveCount(0);
    expect((await api(page, '/settings/profile')).body.data.phone).toBe('13800009999');

    await navigate(page, '/patients');
    await page.getByRole('button', { name: '患者建档', exact: true }).click();
    const registration = page.getByRole('dialog');
    await registration.getByLabel('姓名', { exact: true }).fill('Desktop synthetic patient');
    await registration.getByRole('combobox', { name: /性别/ }).selectOption('男');
    await registration.getByLabel('年龄', { exact: true }).fill('40');
    await registration.getByLabel('健康分类', { exact: true }).fill('Synthetic condition');
    await registration
      .getByLabel('建档原因', { exact: true })
      .fill('Desktop persistence smoke test');
    const patientSaved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/patients') && response.request().method() === 'POST',
    );
    await registration.getByRole('button', { name: '创建档案', exact: true }).click();
    const savedResponse = await patientSaved;
    expect(savedResponse.status()).toBe(201);
    const patient = (await savedResponse.json()).data as { id: string };
    await expect(page.getByRole('dialog')).toContainText('Desktop synthetic patient');
    await page.keyboard.press('Escape');
    await navigate(page, '/audit');
    const audit = (await api(page, '/audit')).body.data as Array<{
      id: string;
      action: string;
      targetId: string;
    }>;
    expect(audit.some((event) => event.action === 'settings.profile.update')).toBe(true);
    expect(audit.some((event) => event.targetId === patient.id)).toBe(true);
    const auditIds = audit.map((event) => event.id);
    const profileAuditId = audit.find((entry) => entry.action === 'settings.profile.update')!.id;
    const downloadPath = join(dataPath, 'downloads', 'audit.csv');
    await mkdir(join(dataPath, 'downloads'), { recursive: true });
    await app.evaluate(({ session }, destination) => {
      const state = globalThis as unknown as {
        carelinkTestDownload: { state: string; filename?: string };
      };
      state.carelinkTestDownload = { state: 'waiting' };
      session.defaultSession.once('will-download', (_event, item) => {
        item.setSavePath(destination);
        state.carelinkTestDownload = { state: 'started', filename: item.getFilename() };
        item.once('done', (_event, result) => {
          state.carelinkTestDownload = { state: result, filename: item.getFilename() };
        });
      });
    }, downloadPath);
    await page.getByRole('button', { name: '导出日志', exact: true }).click();
    await expect
      .poll(
        () =>
          app.evaluate(
            () =>
              (globalThis as unknown as { carelinkTestDownload: { state: string } })
                .carelinkTestDownload.state,
          ),
        { timeout: 15000 },
      )
      .toBe('completed');
    const csv = await readFile(downloadPath, 'utf8');
    expect(csv).toContain(profileAuditId);
    expect(csv).toContain('settings.profile.update');
    expect(csv).toContain(patient.id);
    expect(csv).not.toContain('doctor-demo-004');
    await page.getByTestId('language-select').selectOption('en');
    await app.close();
    expect((await stat(join(dataPath, 'data/doctor.sqlite'))).size).toBeGreaterThan(0);

    app = await launch(dataPath);
    page = await ready(app);
    await expect(page.locator('.auth-page')).toHaveCount(0);
    await expect(page.getByTestId('language-select')).toHaveValue('en');
    expect((await api(page, '/settings/profile')).body.data.phone).toBe('13800009999');
    expect((await api(page, '/patients/' + patient.id)).body.data.name).toBe(
      'Desktop synthetic patient',
    );
    const reopenedAudit = (await api(page, '/audit')).body.data as Array<{ id: string }>;
    expect(reopenedAudit.map((event) => event.id)).toEqual(expect.arrayContaining(auditIds));
    const signature = await readFile(join(dataPath, 'data/doctor.sqlite'));
    expect(signature.subarray(0, 15).toString()).toBe('SQLite format 3');
  } finally {
    await app.close();
  }
});

test('Chinese and English navigation and settings remain usable after authenticated launch', async () => {
  const app = await launch(await profile());
  try {
    const page = await ready(app);
    await login(page);
    await page.getByTestId('language-select').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await navigate(page, '/');
    await expect(page.locator('main h1')).toHaveText('Workspace overview');
    for (const path of [
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
      await expect(page.getByText('暂时无法加载数据')).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Page overflow on ' + path,
      ).toBe(true);
    }
    await page.getByTestId('language-select').selectOption('zh-CN');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('main h1')).toHaveText('个人设置');
  } finally {
    await app.close();
  }
});
