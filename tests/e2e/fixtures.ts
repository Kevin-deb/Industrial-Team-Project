import { test as base, expect } from '@playwright/test';

/** Each test receives a real server-issued session shared by its browser and API requests. */
export const test = base.extend<{ authToken: string }>({
  authToken: async ({ playwright, baseURL }, use) => {
    const login = await playwright.request.newContext({ baseURL });
    const response = await login.post('/api/v1/auth/password-login', {
      data: { account: 'lin.zhiyuan', password: '123456' },
    });
    expect(response.status(), await response.text()).toBe(201);
    const token = (await response.json()).data.token as string;
    try {
      await use(token);
    } finally {
      await login.post('/api/v1/auth/logout', { headers: { Authorization: `Bearer ${token}` } });
      await login.dispose();
    }
  },
  storageState: async ({ authToken, baseURL }, use) => {
    if (!baseURL) throw new Error('The authenticated browser fixture requires a baseURL');
    await use({
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [
            { name: 'carelink-session-token', value: authToken },
            { name: 'carelink-language', value: 'zh-CN' },
          ],
        },
      ],
    });
  },
  request: async ({ playwright, baseURL, authToken }, use) => {
    const request = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${authToken}` },
    });
    try {
      await use(request);
    } finally {
      await request.dispose();
    }
  },
});

export { expect };
