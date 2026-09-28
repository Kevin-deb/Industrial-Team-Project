import { test, expect } from './fixtures.js';

test('saved encounter preferences immediately update the doctor notification panel', async ({
  page,
  request,
}) => {
  const original = (await (await request.get('/api/v1/settings/notifications')).json()).data;
  const enabled = { ...original, encounter: true };
  expect((await request.put('/api/v1/settings/notifications', { data: enabled })).ok()).toBe(true);
  try {
    const initial = (await (await request.get('/api/v1/notifications')).json()).data;
    expect(initial.encounters.length).toBeGreaterThan(0);
    await page.goto('/settings');
    const encounterSwitch = page.getByRole('switch', { name: '接诊提醒', exact: true });
    await expect(encounterSwitch).toHaveAttribute('aria-checked', 'true');
    await encounterSwitch.click();
    await page.getByRole('button', { name: '保存通知偏好' }).click();
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^通知中心/ }).click();
    const panel = page.getByRole('region', { name: '诊疗工作提醒' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('待处理问诊', { exact: false })).toHaveCount(0);
    const updated = (await (await request.get('/api/v1/notifications')).json()).data;
    expect(updated.preferences.encounter).toBe(false);
    expect(updated.encounters).toEqual([]);
    await expect(panel.getByRole('button', { name: /^患者测试收件箱/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await encounterSwitch.click();
    await page.getByRole('button', { name: '保存通知偏好' }).click();
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^通知中心/ }).click();
    await expect(panel.getByText('待处理问诊', { exact: false })).toHaveCount(
      Math.min(initial.encounters.length, 10),
    );
  } finally {
    await request.put('/api/v1/settings/notifications', { data: original });
  }
});
