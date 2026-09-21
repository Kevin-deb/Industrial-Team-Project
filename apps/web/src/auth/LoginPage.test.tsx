import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../shared/i18n';
import { LoginPage } from './LoginPage';

describe('verified clinician login', () => {
  beforeEach(() => localStorage.clear());

  it('requires password, email code and an explicitly labelled demo photo check', async () => {
    const user = userEvent.setup();
    const begin = vi.fn().mockResolvedValue({ challengeId: 'challenge', emailHint: 'l***@carelink.demo' });
    const verify = vi.fn().mockResolvedValue({ photoTicket: 'ticket' });
    const complete = vi.fn().mockResolvedValue(undefined);
    render(
      <I18nProvider>
        <LoginPage beginLogin={begin} verifyEmail={verify} completePhotoCheck={complete} />
      </I18nProvider>,
    );
    await user.type(screen.getByLabelText('账号或邮箱'), 'lin.zhiyuan');
    await user.clear(screen.getByLabelText('密码'));
    await user.type(screen.getByLabelText('密码'), '123456');
    await user.click(screen.getByRole('button', { name: '继续' }));
    expect(await screen.findByText(/l\*\*\*@carelink.demo/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('邮箱验证码'), '123456');
    await user.click(screen.getByRole('button', { name: '验证邮箱' }));
    expect(await screen.findByText('演示拍照核验')).toBeInTheDocument();
    expect(screen.getByText(/不执行真实人脸识别/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '完成演示核验' })).toBeDisabled();
  });

  it('uses the shared English language setting', () => {
    localStorage.setItem('carelink-language', 'en');
    render(
      <I18nProvider>
        <LoginPage beginLogin={vi.fn()} verifyEmail={vi.fn()} completePhotoCheck={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Sign in to CareLink' })).toBeInTheDocument();
    expect(screen.getByLabelText('Account or email')).toBeInTheDocument();
  });
});
