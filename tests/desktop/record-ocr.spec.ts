import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { observeLocalOcr, recognizeSyntheticRecord } from '../helpers/record-ocr.js';

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
      : { args: [resolve(process.cwd(), 'apps/desktop')] }),
    env,
  });
}

async function ready(app: ElectronApplication) {
  const page = await app.firstWindow();
  await expect(page.locator('main')).toBeVisible();
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible()),
  ).toBe(false);
  return page;
}

test('offline Chinese OCR works over the desktop protocol and survives a full application restart', async () => {
  test.setTimeout(180000);
  await mkdir(join(process.cwd(), 'runtime'), { recursive: true });
  const profile = await mkdtemp(join(process.cwd(), 'runtime', 'desktop-ocr-'));
  let app = await launch(profile);
  try {
    let page = await ready(app);
    const requests = await observeLocalOcr(page.context());
    // Keep the whole session offline; custom carelink:// resources and the local API must work.
    await app.evaluate(({ session }) =>
      session.defaultSession.enableNetworkEmulation({ offline: true }),
    );
    await page.locator('input[autocomplete="username"]').fill('lin.zhiyuan');
    await page.locator('input[autocomplete="current-password"]').fill('123456');
    await page.locator('.auth-primary').click();
    await expect(page.locator('.auth-page')).toHaveCount(0);
    await page.goto('carelink://app/records');
    await page.getByRole('button', { name: '新建病历', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('选择患者').selectOption('PAT-001');
    const title = '桌面离线识别测试';
    await dialog.getByLabel('病历标题', { exact: true }).fill(title);
    const photo = await recognizeSyntheticRecord(page);
    await test.info().attach('synthetic-paper-record', { body: photo, contentType: 'image/png' });
    await expect(page.getByTestId('record-photo-select-title')).not.toBeChecked();
    await expect(page.getByTestId('record-photo-select-diagnosis')).toBeChecked();
    await page.getByTestId('record-photo-confirm').check();
    await page.getByTestId('record-photo-apply').click();
    await expect(dialog.getByLabel('病历标题', { exact: true })).toHaveValue(title);
    await expect(dialog.getByLabel('诊断', { exact: true })).toHaveValue(/上\s*呼\s*吸\s*道/);
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/records') && response.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: '保存草稿', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const record = (await response.json()).data;
    expect(record.body.chiefComplaint).toMatch(/咳\s*嗽/);
    expect(requests.external).toEqual([]);
    await expect(dialog).toContainText('草稿已保存到本地数据库');
    await app.close();

    app = await launch(profile);
    page = await ready(app);
    await expect(page.locator('.auth-page')).toHaveCount(0);
    await page.goto('carelink://app/records');
    await page.getByLabel('搜索患者、病历编号或标题').fill(title);
    await page.getByRole('button', { name: '查看记录', exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('病历标题', { exact: true })).toHaveValue(title);
    await expect(dialog.getByLabel('诊断', { exact: true })).toHaveValue(record.diagnosis);
    await expect(dialog.getByRole('textbox', { name: '主诉', exact: true })).toHaveValue(
      record.body.chiefComplaint,
    );
    await expect(dialog).toContainText('v1.0');
  } finally {
    await app.close();
  }
});
