import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('B patient details open E with the same selected patient and reject unavailable links', async ({
  page,
}) => {
  await page.goto('/patients');
  await page.getByRole('textbox', { name: '搜索患者姓名、编号或症状' }).fill('PAT-001');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '查看档案' }).click();
  await page.getByRole('button', { name: '健康管理', exact: true }).click();
  await expect(page).toHaveURL(/health\?patientId=PAT-001/);
  await expect(page.locator('.health-patient-summary')).toContainText('PAT-001');
  await expect(page.getByRole('button', { name: '管理计划', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.health-patient-summary')).toContainText('PAT-001');
  await page.goto('/health?patientId=PAT-RESTRICTED');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.health-patient-summary')).toHaveCount(0);
});

test('B editing invalidates the cached E patient summary without reloading the application', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/v1/patients', {
    headers: { 'Idempotency-Key': randomUUID() },
    data: {
      name: '独立联动测试',
      gender: '男',
      age: 40,
      phone: '',
      diagnosis: '合成病例',
      tags: [],
      status: 'follow-up',
      symptoms: [],
      allergies: [],
      allergyStatus: 'unknown',
      medicalHistory: [],
      careSummary: '',
      changeReason: '建立隔离测试数据',
    },
  });
  expect(created.status()).toBe(201);
  const patientId = (await created.json()).data.id;
  await page.goto('/health?patientId=' + patientId);
  await expect(page.locator('.health-patient-summary')).toContainText(patientId);
  await page.getByRole('link', { name: '患者管理', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索患者姓名、编号或症状' }).fill(patientId);
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '查看档案' }).click();
  await page.getByRole('button', { name: '编辑档案' }).click();
  await page.getByRole('textbox', { name: '姓名', exact: true }).fill('联动测试患者');
  await page.getByRole('textbox', { name: '修改原因', exact: true }).fill('验证 B 和 E 同步');
  await page.getByRole('button', { name: '保存档案' }).click();
  await expect(page.getByText('档案已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '健康管理', exact: true }).click();
  await expect(page.locator('.health-patient-summary')).toContainText('联动测试患者');
});
