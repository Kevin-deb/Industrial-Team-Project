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
  await expect(page.getByRole('textbox', { name: '搜索患者姓名、编号或症状' })).toHaveValue(
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

test('community is a forum workspace with persistent opt-in', async ({ page }) => {
  await page.goto('/community');
  await expect(page.getByRole('heading', { name: '社区首页' })).toBeVisible();
  await expect(page.getByRole('link', { name: '专科圈子' })).toBeVisible();
  await expect(page.getByRole('link', { name: '同行私信' })).toBeVisible();
  await page.getByRole('link', { name: '社区设置' }).click();
  const control = page.getByRole('switch').first();
  await expect(control).toHaveAttribute('aria-checked', 'true');
  await control.click();
  await expect(page.locator('nav').getByRole('link', { name: /同行协作/ })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('nav').getByRole('link', { name: /同行协作/ })).toHaveCount(0);
  await page.goto('/settings');
  await page.getByRole('switch').click();
  await expect(page.locator('nav').getByRole('link', { name: /同行协作/ })).toBeVisible();
});

test('E health workflow searches one patient and updates only its local panel', async ({
  page,
  request,
}) => {
  const patient = (await (await request.get('/api/v1/patients?pageSize=1')).json()).data[0];
  const planTitle = `E2E 居家记录计划 ${Date.now()}`;
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  await page.goto('/health');
  navigations = 0;
  await page.getByRole('searchbox', { name: '搜索健康管理患者' }).fill(patient.id);
  await page.getByRole('button', { name: new RegExp(patient.id) }).click();
  await expect(page.getByText(patient.name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(`${patient.age} 岁 · ${patient.gender}`)).toBeVisible();
  await page.getByRole('button', { name: '管理计划' }).click();
  await expect(page.getByRole('heading', { name: '管理计划' })).toBeVisible();
  await page.getByRole('button', { name: '新建计划' }).click();
  await page.getByLabel('计划名称').fill(planTitle);
  await page.getByLabel('计划目标').fill('每天记录一次\n下次随访时复核');
  await page.getByRole('button', { name: '保存计划' }).click();
  await expect(page.getByRole('heading', { name: planTitle })).toBeVisible();
  expect(navigations).toBe(0);
});

test('E community separates feed, forum, personal activity and scrollable direct messages', async ({
  page,
}) => {
  const suffix = Date.now();
  const postTitle = `E2E 社区流程测试主题 ${suffix}`;
  const replyBody = `已核对流程，建议保留复核记录。${suffix}`;
  const messageBody = `E2E 私信发送测试 ${suffix}`;
  await page.goto('/community');
  await expect(page.getByRole('button', { name: /我的帖子/ })).toBeVisible();
  await page.getByRole('link', { name: '专科圈子' }).click();
  await expect(page.getByRole('button', { name: '加入圈子' })).toHaveCount(1);
  await page.getByRole('button', { name: '加入圈子' }).click();
  await expect(page.getByRole('button', { name: '退出圈子' })).toHaveCount(6);
  await page.getByRole('link', { name: '进入论坛' }).first().click();
  await expect(page.getByRole('button', { name: '发布主题' })).toBeVisible();
  await expect(page.getByRole('group', { name: '标签筛选' })).toBeVisible();
  await page.getByRole('button', { name: '发布主题' }).click();
  await page.getByLabel('主题标题').fill(postTitle);
  await page.getByLabel('讨论内容').fill('这是一段不含真实患者资料的合成讨论内容。');
  await page.getByRole('group', { name: '标签', exact: true }).getByRole('button').first().click();
  await page.getByRole('button', { name: '确认发布' }).click();
  await page.getByRole('heading', { name: postTitle }).click();
  await expect(page).toHaveURL(/\/community\/posts\//);
  const thread = page.locator('.community-thread-post');
  await thread.getByRole('button', { name: /^点赞/ }).click();
  await expect(thread.getByRole('button', { name: /^取消点赞/ })).toBeVisible();
  await thread.getByRole('button', { name: /^收藏/ }).click();
  await expect(thread.getByRole('button', { name: /^取消收藏/ })).toBeVisible();
  await expect(thread.getByRole('button', { name: '举报' })).toBeVisible();
  await page.getByRole('textbox', { name: '回复内容' }).fill(replyBody);
  await page.getByRole('button', { name: '发表回复' }).click();
  await expect(page.getByText(replyBody, { exact: true })).toBeVisible();
  const reply = page.locator('.community-comments article').filter({ hasText: replyBody });
  await reply.getByRole('button', { name: '点赞回复', exact: true }).click();
  await expect(reply.getByRole('button', { name: '取消点赞回复', exact: true })).toContainText('1');
  await reply.getByRole('button', { name: '收藏回复', exact: true }).click();
  await expect(reply.getByRole('button', { name: '取消收藏回复', exact: true })).toContainText('1');
  await thread.getByRole('button', { name: '举报' }).click();
  await expect(page.getByRole('dialog', { name: '举报主题' })).toBeVisible();
  await page.getByRole('button', { name: '提交举报' }).click();
  await expect(page.getByRole('dialog', { name: '举报主题' })).toHaveCount(0);
  await page.getByRole('link', { name: '社区首页' }).click();
  for (const label of ['我的点赞', '我的收藏', '我的帖子', '我的消息']) {
    await expect(page.getByRole('button', { name: new RegExp(label) })).toBeVisible();
  }
  for (const entry of [
    ['我的点赞', 'likes'],
    ['我的收藏', 'bookmarks'],
    ['我的帖子', 'posts'],
  ] as const) {
    await page.getByRole('button', { name: new RegExp(entry[0]) }).click();
    await expect(page).toHaveURL(new RegExp(`/community/me/${entry[1]}$`));
    await expect(page.getByRole('heading', { name: entry[0] })).toBeVisible();
    await page.getByRole('link', { name: '返回社区首页' }).click();
  }
  await page.getByRole('button', { name: /我的消息/ }).click();
  await expect(page.getByRole('dialog', { name: '我的消息' })).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('link', { name: '同行私信' }).click();
  await expect(page.locator('.community-message-scroll')).toHaveCSS('overflow-y', 'auto');
  await expect(page.locator('.community-message-scroll article')).toHaveCount(30);
  await page.getByRole('button', { name: '加载更早消息' }).click();
  await expect(page.locator('.community-message-scroll article')).toHaveCount(36);
  await page.getByRole('textbox', { name: '私信内容' }).fill(messageBody);
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText(messageBody, { exact: true })).toBeVisible();
});

test('E tab navigation and panel origins remain stable across short and long views', async ({
  page,
  request,
}) => {
  await page.goto('/community');
  await expect(page.locator('.community-view')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.community-view-heading').evaluate((el) => el.getBoundingClientRect().y),
    )
    .toBeGreaterThan(100);
  const origin = await page.locator('.community-tabs').boundingBox();
  const panel = await page
    .locator('.community-view-heading')
    .evaluate((el) => ({ y: el.getBoundingClientRect().y }));
  for (const name of ['专科圈子', '同行私信', '社区设置', '社区首页', '同行私信', '社区首页']) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.locator('.community-view-heading h2')).toHaveText(name);
    await expect(page.locator('.community-view')).toBeVisible();
    const next = await page.locator('.community-tabs').boundingBox();
    const nextPanel = await page
      .locator('.community-view-heading')
      .evaluate((el) => ({ y: el.getBoundingClientRect().y }));
    expect(Math.abs(next!.x - origin!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(next!.y - origin!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(nextPanel!.y - panel!.y)).toBeLessThanOrEqual(1);
  }
  const patient = (await (await request.get('/api/v1/patients?pageSize=1')).json()).data[0];
  await page.goto('/health');
  await page.getByRole('searchbox', { name: '搜索健康管理患者' }).fill(patient.id);
  await page.getByRole('button', { name: new RegExp(patient.id) }).click();
  await expect(page.locator('.health-panel')).toBeVisible();
  const tabs = await page.locator('.health-tabs').boundingBox();
  const healthPanel = await page.locator('.health-panel').boundingBox();
  for (const name of ['管理计划', '健康评估', '随访提醒', '管理计划', '健康观测']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.health-panel')).toBeVisible();
    const next = await page.locator('.health-tabs').boundingBox();
    const nextPanel = await page.locator('.health-panel').boundingBox();
    expect(Math.abs(next!.x - tabs!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(next!.y - tabs!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(nextPanel!.y - healthPanel!.y)).toBeLessThanOrEqual(1);
  }
});

test('E content editor and deletion confirmations persist through the API', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/v1/social/posts', {
    data: {
      commandId: `edit-test-${Date.now()}`,
      groupId: 'GROUP-GERIATRICS',
      displayMode: 'anonymous',
      title: '界面编辑测试',
      body: '编辑前',
      tags: ['随访管理'],
      containsCaseMaterial: false,
      deidentificationConfirmed: false,
    },
  });
  expect(created.status()).toBe(201);
  const post = (await created.json()).data;
  await page.goto(`/community/posts/${post.id}`);
  const thread = page.locator('.community-thread-post');
  await thread.getByRole('button', { name: '编辑', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑内容' });
  await editor.getByLabel('主题标题').fill('编辑后的标题');
  await editor.getByLabel('内容', { exact: true }).fill('编辑后的正文');
  await expect(editor.getByLabel('操作原因（留痕）')).toHaveCount(0);
  await editor.getByRole('button', { name: '确认', exact: true }).click();
  await expect(thread.getByRole('heading', { name: '编辑后的标题' })).toBeVisible();
  await page.getByRole('textbox', { name: '回复内容' }).fill('待删除评论');
  await page.getByRole('button', { name: '发表回复' }).click();
  const reply = page.locator('.community-comments article').filter({ hasText: '待删除评论' });
  await reply.getByRole('button', { name: '点赞回复', exact: true }).click();
  await reply.getByRole('button', { name: '删除', exact: true }).click();
  const remove = page.getByRole('dialog', { name: '删除内容' });
  await expect(remove.getByLabel('操作原因（留痕）')).toHaveCount(0);
  await remove.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByText('该评论已被删除', { exact: true })).toBeVisible();
  await thread.getByRole('button', { name: '删除帖子', exact: true }).click();
  await remove.getByRole('button', { name: '确认', exact: true }).click();
  await expect(thread.getByRole('heading', { name: '该帖子已被删除' })).toBeVisible();
  await expect(page.locator('.community-comments')).toHaveCount(0);
  const history = (await (await request.get(`/api/v1/social/posts/${post.id}/history`)).json())
    .data;
  expect(history.map((item: { action: string }) => item.action)).toEqual(['edit', 'delete']);
  expect(history[0].before_json).toContain('编辑前');
  expect(history[0].after_json).toContain('编辑后的正文');
  expect(history[1].before_json).toContain('编辑后的正文');
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
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
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
