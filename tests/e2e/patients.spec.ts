import { test, expect } from '@playwright/test';
import type { PatientArchive } from '@doctor/contracts';

function editable(patient: PatientArchive, careSummary: string) {
  const {
    id: _id,
    canEdit: _canEdit,
    version: _version,
    lastVisit: _last,
    nextFollowUp: _next,
    assignedDoctorId: _doctor,
    ...fields
  } = patient;
  return { ...fields, careSummary, changeReason: 'Synthetic browser concurrency test' };
}

test('batch access failure and stale versions require refresh without overwriting records', async ({
  page,
  request,
}) => {
  await page.goto('/patients?q=PAT-004&groupBy=status');
  await page.getByLabel('选择患者 PAT-004').check();
  await page.getByLabel('批量修改原因').fill('Preserved batch draft');
  await page.route('**/api/v1/patients/batch', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'PATIENT_BATCH_UNAVAILABLE', message: 'unavailable' },
      }),
    }),
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '批量更新状态', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('部分患者已不可用');
  await expect(page.getByRole('alert')).not.toContainText('PAT-004');
  await expect(page.getByLabel('批量修改原因')).toHaveValue('Preserved batch draft');
  await page.unroute('**/api/v1/patients/batch');
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/v1/patients?') && response.status() === 200),
    page.getByRole('button', { name: '刷新患者列表' }).click(),
  ]);
  await expect(page.getByText('已选择 0 位患者', { exact: true })).toBeVisible();
  await page.getByLabel('选择患者 PAT-004').check();
  await expect(page.getByText('已选择 1 位患者', { exact: true })).toBeVisible();
  const latest = await request.get('/api/v1/patients/PAT-004');
  const patient = (await latest.json()).data;
  expect(
    (
      await request.patch('/api/v1/patients/PAT-004', {
        headers: { 'If-Match': latest.headers().etag },
        data: editable(patient, 'Concurrent batch browser revision'),
      })
    ).ok(),
  ).toBe(true);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '批量更新状态', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('本批次未保存任何修改');
  await expect(page.getByLabel('选择患者 PAT-004')).toBeChecked();
  await expect(page.getByRole('button', { name: '批量更新状态', exact: true })).toBeDisabled();
  const after = (await (await request.get('/api/v1/patients/PAT-004')).json()).data;
  expect(after.status).toBe(patient.status);
  expect(after.version).toBe(patient.version + 1);
});

test('grouped multi-select updates statuses and preserves patient history on desktop and mobile', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/patients?groupBy=disease');
  await expect(page.locator('.patients-group-heading').first()).toBeVisible();
  await page.getByLabel('选择患者 PAT-006').check();
  await page.getByLabel('选择患者 PAT-007').check();
  const before = (await (await request.get('/api/v1/patients/PAT-006')).json()).data;
  const target = before.status === 'attention' ? 'stable' : 'attention';
  await page.getByLabel('目标管理状态').selectOption(target);
  await page.getByRole('button', { name: '批量更新状态', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('修改原因不能为空');
  await page.getByLabel('批量修改原因').fill('Synthetic grouped batch review');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '批量更新状态', exact: true }).click();
  await expect(page.getByText('批量更新完成', { exact: true })).toBeVisible();
  await expect(page.getByText('已选择 0 位患者', { exact: true })).toBeVisible();
  const after = (await (await request.get('/api/v1/patients/PAT-006')).json()).data;
  expect(after.status).toBe(target);
  expect(after.version).toBe(before.version + 1);
  const versions = (await (await request.get('/api/v1/patients/PAT-006/versions')).json()).data;
  expect(versions[0].changeReason).toBe('Synthetic grouped batch review');
  await page.getByRole('button', { name: '按状态分组', exact: true }).click();
  await expect(page).toHaveURL(/groupBy=status/);
  await expect(page.locator('.patients-group-heading').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/patients-grouped-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/patients?groupBy=status');
  await expect(page.locator('.patients-group-heading').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/patients-grouped-mobile.png', fullPage: true });
});

test('patient search, durable editing and archive diffs work in the actual browser', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/patients');
  await page.getByRole('textbox', { name: '搜索患者姓名、编号或症状' }).fill('PAT-001');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '查看档案' }).click();
  await page.getByRole('button', { name: '编辑档案' }).click();
  await page
    .getByRole('textbox', { name: '照护摘要', exact: true })
    .fill('Synthetic desktop browser revision');
  await page.getByRole('textbox', { name: '修改原因', exact: true }).fill('Verified desktop save');
  await page.getByRole('button', { name: '保存档案' }).click();
  await expect(page.getByText('档案已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '修改历史' }).click();
  await expect(page.getByText('Verified desktop save', { exact: true })).toBeVisible();
  await expect(page.locator('.patients-diff')).toContainText('Synthetic desktop browser revision');
  const stored = (await (await request.get('/api/v1/patients/PAT-001')).json()).data;
  expect(stored.careSummary).toBe('Synthetic desktop browser revision');
  await page.screenshot({ path: 'test-results/patients-desktop-history.png' });
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: '查看档案' }).click();
  await expect(page.getByText('Synthetic desktop browser revision', { exact: true })).toBeVisible();
});

test('patient directory and editor fit a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/patients?q=PAT-002');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/patients-mobile-directory.png', fullPage: true });
  await page.getByRole('button', { name: '查看档案' }).click();
  await page.getByRole('button', { name: '编辑档案' }).click();
  const dialog = await page.getByRole('dialog').boundingBox();
  expect(dialog!.x).toBeGreaterThanOrEqual(0);
  expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(390);
  expect(
    await page
      .locator('.patients-form-grid')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/patients-mobile-editor.png' });
});

test('stale saving preserves the local draft until the doctor explicitly reloads', async ({
  page,
  request,
}) => {
  await page.goto('/patients?q=PAT-003');
  await page.getByRole('button', { name: '查看档案' }).click();
  await page.getByRole('button', { name: '编辑档案' }).click();
  await page
    .getByRole('textbox', { name: '照护摘要', exact: true })
    .fill('Unsaved local browser draft');
  await page.getByRole('textbox', { name: '修改原因', exact: true }).fill('Local draft correction');
  const latest = await request.get('/api/v1/patients/PAT-003');
  const patient = (await latest.json()).data as PatientArchive;
  const remote = await request.patch('/api/v1/patients/PAT-003', {
    headers: { 'If-Match': latest.headers().etag },
    data: editable(patient, 'Committed remote browser revision'),
  });
  expect(remote.ok()).toBe(true);
  await page.getByRole('button', { name: '保存档案' }).click();
  await expect(page.getByRole('alert')).toContainText('档案已被其他保存更新');
  await expect(page.getByRole('textbox', { name: '照护摘要', exact: true })).toHaveValue(
    'Unsaved local browser draft',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '重新加载档案' }).click();
  await expect(page.getByText('Committed remote browser revision', { exact: true })).toBeVisible();
});
