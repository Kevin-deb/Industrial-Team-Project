import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../shared/i18n';
import { LoginPage } from './LoginPage';

describe('verified clinician login', () => {
  beforeEach(() => localStorage.clear());

  const props = {
    beginLogin: vi.fn(),
    beginPhotoLogin: vi.fn(),
    verifyEmail: vi.fn(),
    completePhotoCheck: vi.fn(),
    beginRecovery: vi.fn(),
    completeRecovery: vi.fn(),
  };

  it('offers password and demo face sign-in without public registration', async () => {
    const user = userEvent.setup();
    render(<I18nProvider><LoginPage {...props} /></I18nProvider>);

    expect(screen.getByRole('tab', { name: '账号密码' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '人脸验证' })).toBeInTheDocument();
    expect(screen.queryByText('注册')).not.toBeInTheDocument();
    expect(screen.getByText('账号由医院管理员审核并分配')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '人脸验证' }));
    expect(screen.getByLabelText('医生账号')).toBeInTheDocument();
    expect(screen.getByText(/课程演示仅采集照片/)).toBeInTheDocument();
  });

  it('allows returning from the demo face capture step', async () => {
    const user = userEvent.setup();
    const beginPhotoLogin = vi.fn().mockResolvedValue({ photoTicket: 'face-ticket', demoOnly: true });
    render(<I18nProvider><LoginPage {...props} beginPhotoLogin={beginPhotoLogin} /></I18nProvider>);

    await user.click(screen.getByRole('tab', { name: '人脸验证' }));
    await user.click(screen.getByRole('button', { name: '开始人脸验证' }));
    expect(await screen.findByRole('button', { name: '返回登录方式' })).toBeInTheDocument();
  });

  it('shows a localized recovery message when camera permission is denied', async () => {
    const user = userEvent.setup();
    const beginPhotoLogin = vi.fn().mockResolvedValue({ photoTicket: 'face-ticket', demoOnly: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')) },
    });
    render(<I18nProvider><LoginPage {...props} beginPhotoLogin={beginPhotoLogin} /></I18nProvider>);

    await user.click(screen.getByRole('tab', { name: '人脸验证' }));
    await user.click(screen.getByRole('button', { name: '开始人脸验证' }));
    await user.click(await screen.findByRole('button', { name: '打开摄像头' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('无法使用摄像头，请在系统设置中允许摄像头权限，或直接上传照片。');
    expect(screen.queryByText('Permission denied')).not.toBeInTheDocument();
  });

  it('requires password, email code and an explicitly labelled demo photo check', async () => {
    const user = userEvent.setup();
    const begin = vi.fn().mockResolvedValue({ challengeId: 'challenge', emailHint: 'l***@carelink.demo' });
    const verify = vi.fn().mockResolvedValue({ photoTicket: 'ticket' });
    const complete = vi.fn().mockResolvedValue(undefined);
    render(
      <I18nProvider>
        <LoginPage {...props} beginLogin={begin} verifyEmail={verify} completePhotoCheck={complete} />
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
        <LoginPage {...props} />
      </I18nProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Sign in to CareLink' })).toBeInTheDocument();
    expect(screen.getByLabelText('Account or email')).toBeInTheDocument();
  });
});
