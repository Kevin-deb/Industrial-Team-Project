import { expect, test } from '@playwright/test';

test('dashboard and all doctor modules load with local API data', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1080 });
  const response = await request.get('/api/v1/dashboard');
  expect(response.ok()).toBeTruthy();
  const { data } = await response.json();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '工作台概览' })).toBeVisible();
  await expect(page.locator('.metric-value').first()).toContainText(
    data.stats.patients.toString().padStart(2, '0'),
  );
  await expect(page.getByText('当前为框架演示，数据均为虚构')).toBeVisible();
  await expect(page.getByRole('img', { name: '患者最近七次模拟收缩压趋势' })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  for (const route of [
    '/patients',
    '/encounters',
    '/records',
    '/consultations',
    '/health',
    '/audit',
    '/community',
    '/settings',
  ]) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.getByText('暂时无法加载数据')).toHaveCount(0);
    await expect(page.locator('.loading-state')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});

test('global search, scoped detail and upcoming actions behave honestly', async ({
  page,
  request,
}) => {
  const body = await (await request.get('/api/v1/patients?pageSize=100')).json();
  const patient = body.data[0];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('textbox', { name: '全局患者搜索' }).fill(patient.name);
  await page.getByRole('textbox', { name: '全局患者搜索' }).press('Enter');
  await expect(page.getByRole('textbox', { name: '搜索患者姓名、编号或疾病' })).toHaveValue(
    patient.name,
  );
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '查看档案' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText(patient.id);
  await page.getByRole('button', { name: '病史与过敏' }).click();
  await expect(page.getByRole('dialog')).toContainText('过敏史');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /患者建档/ }).click();
  await expect(page.getByRole('dialog')).toContainText('尚未上线');
  await expect(page.getByRole('dialog')).toContainText('不会创建诊疗记录');
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: '全局患者搜索' }).fill('不存在的患者');
  await page.getByRole('textbox', { name: '全局患者搜索' }).press('Enter');
  await expect(page.getByText('未找到符合条件的患者')).toBeVisible();
});

test('community visibility is an actual persistent preference', async ({ page }) => {
  await page.goto('/community');
  const control = page.getByRole('switch');
  await expect(control).toHaveAttribute('aria-checked', 'true');
  await control.click();
  await expect(page.locator('nav').getByRole('link', { name: /同行协作/ })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('nav').getByRole('link', { name: /同行协作/ })).toHaveCount(0);
  await page.goto('/settings');
  await page.getByRole('switch').click();
  await expect(page.locator('nav').getByRole('link', { name: /同行协作/ })).toBeVisible();
});

test('API failure is visible and recoverable', async ({ page }) => {
  await page.route('**/api/v1/dashboard', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '暂时无法加载数据' })).toBeVisible();
  await page.unroute('**/api/v1/dashboard');
  await page.getByRole('button', { name: '重新加载' }).click();
  await expect(page.getByRole('heading', { name: '工作台概览' })).toBeVisible();
});

test('medical record drafts create, version and remain bilingual', async ({ page }) => {
  await page.goto('/records');
  await page.getByRole('button', { name: '新建病历' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('选择患者').selectOption('PAT-001');
  await dialog.getByLabel('选择关联问诊').selectOption('ENC-001');
  await dialog.getByLabel('选择病历模板').selectOption('followup');
  await dialog.getByLabel('病历标题').fill('端到端演示草稿');
  await dialog.getByLabel('诊断').fill('合成测试诊断');
  await dialog.getByLabel('本次随访目的').fill('验证本地持久化');
  await dialog.getByRole('button', { name: '保存草稿' }).click();
  await expect(dialog).toContainText('草稿已保存到本地数据库');
  await expect(dialog).toContainText('v1.0');

  await dialog.getByLabel('本次随访目的').fill('验证第二个版本');
  await dialog.getByRole('button', { name: '保存草稿' }).click();
  await expect(dialog).toContainText('v2.0');
  await page.getByTestId('language-select').selectOption('en', { force: true });
  await expect(dialog.getByLabel('Follow-up purpose')).toHaveValue('验证第二个版本');
  await expect(dialog.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('端到端演示草稿')).toBeVisible();
});

test('mobile navigation and help dialog remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '工作台概览' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '展开导航' }).click();
  await page.locator('nav').getByRole('link', { name: '患者管理' }).click();
  await expect(page.locator('main h1')).toHaveText('患者管理');
  await expect(page.locator('.sidebar')).not.toHaveClass(/is-open/);
  for (const route of [
    '/encounters',
    '/records',
    '/consultations',
    '/health',
    '/audit',
    '/community',
    '/settings',
  ]) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('.loading-state')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '使用帮助' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
