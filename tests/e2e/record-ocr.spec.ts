import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures.js';
import { observeLocalOcr, recognizeSyntheticRecord } from '../helpers/record-ocr.js';

test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test('paper record OCR runs locally, preserves manual fields and saves through normal record versions', async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const requests = await observeLocalOcr(page.context(), new URL(baseURL!).origin);
  await page.goto('/records');
  await page.getByRole('button', { name: '新建病历', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(page.getByTestId('record-photo-open')).toBeDisabled();
  await dialog.getByLabel('选择患者').selectOption('PAT-001');
  await dialog.getByLabel('选择关联问诊').selectOption('ENC-001');
  const title = 'OCR 浏览器手动核对 ' + randomUUID().slice(0, 8);
  await dialog.getByLabel('病历标题', { exact: true }).fill(title);
  await dialog.getByLabel('诊断', { exact: true }).fill('手动诊断应保留');
  const before = (await (await request.get('/api/v1/records')).json()).data.length;
  const photo = await recognizeSyntheticRecord(page);
  await test.info().attach('synthetic-paper-record', { body: photo, contentType: 'image/png' });
  await page
    .locator('.record-photo-panel')
    .screenshot({ path: 'test-results/record-ocr-preview.png' });
  await page.getByTestId('record-photo-confirm').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/record-ocr-candidates.png' });
  await expect(page.getByTestId('record-photo-select-title')).not.toBeChecked();
  await expect(page.getByTestId('record-photo-select-diagnosis')).not.toBeChecked();
  await expect(page.getByTestId('record-photo-select-chiefComplaint')).toBeChecked();
  await expect(page.getByTestId('record-photo-apply')).toBeDisabled();
  expect((await (await request.get('/api/v1/records')).json()).data).toHaveLength(before);
  await page.getByTestId('record-photo-confirm').check();
  await page.getByTestId('record-photo-apply').click();
  await expect(dialog.getByLabel('病历标题', { exact: true })).toHaveValue(title);
  await expect(dialog.getByLabel('诊断', { exact: true })).toHaveValue('手动诊断应保留');
  await expect(dialog.getByRole('textbox', { name: '主诉', exact: true })).toHaveValue(/咳\s*嗽/);
  await expect(dialog.getByLabel('选择患者')).toHaveValue('PAT-001');
  await expect(dialog.getByLabel('选择关联问诊')).toHaveValue('ENC-001');
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/records') && response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: '保存草稿', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const record = (await response.json()).data;
  expect(record.title).toBe(title);
  expect(record.diagnosis).toBe('手动诊断应保留');
  expect(record.body.chiefComplaint).toMatch(/咳\s*嗽/);
  expect(response.request().postData()).not.toContain('data:image');
  await expect(dialog).toContainText('草稿已保存到本地数据库');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload();
  await page.getByLabel('搜索患者、病历编号或标题').fill(title);
  await page.getByRole('button', { name: '查看记录', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: '主诉', exact: true })).toHaveValue(
    record.body.chiefComplaint,
  );
  await expect(dialog.getByLabel('诊断', { exact: true })).toHaveValue('手动诊断应保留');
  const persisted = (await (await request.get('/api/v1/records/' + record.id)).json()).data;
  expect(persisted.body.chiefComplaint).toBe(record.body.chiefComplaint);
  expect(persisted.version).toBe(1);
  expect(requests.external).toEqual([]);
  expect(
    requests.assets.some((url) => url.includes('chi_sim') && url.includes('traineddata')),
  ).toBe(true);
  expect(requests.assets.some((url) => url.includes('wasm'))).toBe(true);
});

test('submitted records expose no OCR editing action', async ({ page, request }) => {
  const templates = (await (await request.get('/api/v1/record-templates')).json()).data as Array<{
    id: string;
    fields: Array<{ key: string }>;
  }>;
  const template = templates.find((item) => item.id === 'outpatient')!;
  const created = await request.post('/api/v1/records', {
    data: {
      patientId: 'PAT-001',
      templateId: template.id,
      title: 'OCR 只读保护 ' + randomUUID().slice(0, 8),
      diagnosis: '合成测试诊断',
      body: Object.fromEntries(template.fields.map((field) => [field.key, '合成测试内容'])),
    },
  });
  expect(created.status()).toBe(201);
  const record = (await created.json()).data;
  const submitted = await request.post('/api/v1/records/' + record.id + '/submit', {
    headers: { 'If-Match': '"record-v' + record.version + '"', 'Idempotency-Key': randomUUID() },
    data: {},
  });
  expect(submitted.status()).toBe(200);
  await page.goto('/records');
  await page.getByLabel('搜索患者、病历编号或标题').fill(record.title);
  await page.getByRole('button', { name: '查看记录', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('病历标题', { exact: true })).toBeDisabled();
  await expect(page.getByTestId('record-photo-open')).toHaveCount(0);
});

test.describe('record photo camera compatibility', () => {
  test('camera capture creates a photo, releases the camera and fits a small viewport', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['camera']);
    await page.addInitScript(() => {
      const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await getUserMedia(constraints);
        (window as unknown as { ocrTestTracks: MediaStreamTrack[] }).ocrTestTracks =
          stream.getTracks();
        return stream;
      };
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/records');
    await page.getByRole('button', { name: '新建病历', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('选择患者').selectOption('PAT-001');
    await dialog.getByLabel('病历标题', { exact: true }).fill('拍照前的手动标题');
    await page.getByTestId('record-photo-open').click();
    await page.getByRole('button', { name: '打开摄像头', exact: true }).click();
    await expect(page.getByRole('button', { name: '拍摄病历', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '拍摄病历', exact: true }).click();
    await expect(page.getByRole('img', { name: '病历原图', exact: true })).toBeVisible();
    await expect(page.getByTestId('record-photo-recognize')).toBeEnabled();
    expect(
      await page.evaluate(() =>
        (window as unknown as { ocrTestTracks: MediaStreamTrack[] }).ocrTestTracks.every(
          (track) => track.readyState === 'ended',
        ),
      ),
    ).toBe(true);
    expect(
      await page
        .locator('.record-photo-panel')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.getByTestId('record-photo-close').click();
    await expect(dialog.getByLabel('病历标题', { exact: true })).toHaveValue('拍照前的手动标题');
    await page.getByTestId('language-select').selectOption('en', { force: true });
    await expect(page.getByTestId('record-photo-open')).toHaveText('Import record photo');
    await page.getByTestId('record-photo-open').click();
    await expect(page.getByRole('button', { name: 'Open camera', exact: true })).toBeVisible();
    await expect(page.getByLabel('Upload record image', { exact: true })).toBeEnabled();
  });
});

test('camera permission failure keeps the manual draft and offers local image upload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Test permission denied', 'NotAllowedError');
    };
  });
  await page.goto('/records');
  await page.getByRole('button', { name: '新建病历', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('选择患者').selectOption('PAT-001');
  await dialog.getByLabel('病历标题', { exact: true }).fill('权限拒绝时保留草稿');
  await page.getByTestId('record-photo-open').click();
  await page.getByRole('button', { name: '打开摄像头', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('无法使用摄像头');
  await expect(page.getByTestId('record-photo-file')).toBeEnabled();
  await page.getByTestId('record-photo-close').click();
  await expect(dialog.getByLabel('病历标题', { exact: true })).toHaveValue('权限拒绝时保留草稿');
});
