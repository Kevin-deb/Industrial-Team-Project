import { test, expect } from '@playwright/test';

test('registers a synthetic patient and opens the saved first-version archive', async ({
  page,
}) => {
  await page.goto('/patients');
  await page.getByRole('button', { name: '患者建档', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const nameInput = dialog.getByLabel('姓名', { exact: true });
  await nameInput.click();
  await page.keyboard.type('Synthetic name');
  await expect(nameInput).toHaveValue('Synthetic name');
  await expect(nameInput).toBeFocused();
  await dialog.getByLabel('姓名', { exact: true }).fill('Synthetic registration E2E');
  await dialog.getByRole('combobox', { name: /性别/ }).selectOption('男');
  await dialog.getByLabel('年龄', { exact: true }).fill('40');
  await dialog.getByLabel('健康分类', { exact: true }).fill('Synthetic condition');
  await dialog.getByLabel('建档原因', { exact: true }).fill('Synthetic initial registration');
  await page.screenshot({ path: 'test-results/registration-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByLabel('姓名', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/registration-mobile.png', fullPage: true });
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/patients'),
  );
  await dialog.getByRole('button', { name: '创建档案', exact: true }).click();
  const saved = await response;
  expect(saved.status()).toBe(201);
  const patient = (await saved.json()).data;
  expect(patient.version).toBe(1);
  expect(patient.lastVisit).toBe('');
  await expect(page.getByRole('dialog')).toContainText('Synthetic registration E2E');
  await expect(page.getByRole('button', { name: '编辑档案', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('选择患者 ' + patient.id, { exact: true })).toBeVisible();
});
