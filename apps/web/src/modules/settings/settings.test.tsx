import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES,
  MAX_PHOTO_BYTES,
  type DoctorProfile,
  type Session,
} from '@doctor/contracts';
import { I18nProvider } from '../../shared/i18n';
import { SettingsPage } from './index';

vi.mock('../preferences', () => ({
  useCommunityPreference: () => ({
    enabled: true,
    notificationsEnabled: true,
    toggle: vi.fn(),
    setNotificationsEnabled: vi.fn(),
    saveError: null,
  }),
}));
vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

const profile: DoctorProfile = {
  identityId: 'doctor-1',
  email: 'doctor1@example.test',
  emailVerifiedAt: '2026-09-28T01:00:00.000Z',
  phone: '13800000001',
  specialty: 'Cardiology',
  outpatientLocation: 'Room 1',
  bio: 'Synthetic clinician',
  updatedAt: '2026-09-28T01:00:00.000Z',
};
const session: Session = {
  doctor: {
    id: 'doctor-1',
    name: 'Demo Doctor',
    title: 'Physician',
    department: 'Cardiology',
    hospital: 'Demo Hospital',
    avatarInitials: 'DD',
    credentialStatus: 'verified',
    personnelStatus: 'verified',
  },
  mode: 'demo',
  demoDate: '2026-09-28',
  disclaimer: 'Synthetic data',
};

function reply(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(
      status >= 400
        ? { error: { code: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用' } }
        : { data, meta: { mode: 'demo', requestId: 'settings-test' } },
    ),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
function openSettings() {
  return render(
    <I18nProvider>
      <SettingsPage />
    </I18nProvider>,
  );
}

describe('Doctor settings', () => {
  beforeEach(() => localStorage.clear());

  it('ignores legacy shared caches, keeps failed edits, and only confirms persisted profile changes', async () => {
    localStorage.setItem(
      'carelink-doctor-profile-overrides',
      JSON.stringify({ phone: '19999999999' }),
    );
    let savedProfile = { ...profile };
    let failSave = true;
    const submitted: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).endsWith('/session')) return reply(session);
        if (String(url).endsWith('/settings/notifications'))
          return reply(DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES);
        if (init?.method === 'PUT') {
          submitted.push(JSON.parse(String(init.body)));
          if (failSave) return reply(null, 503);
          savedProfile = { ...savedProfile, ...JSON.parse(String(init.body)) };
        }
        return reply(savedProfile);
      }),
    );
    openSettings();
    fireEvent.click(await screen.findByRole('button', { name: '编辑医生资料' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('联系电话')).toHaveValue(profile.phone);
    expect(within(dialog).getByLabelText(/^工作邮箱/)).toHaveAttribute('readonly');
    fireEvent.change(within(dialog).getByLabelText('联系电话'), {
      target: { value: '13800000099' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存资料' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('医生资料保存失败，请重试。');
    expect(within(dialog).getByLabelText('联系电话')).toHaveValue('13800000099');
    expect(screen.queryByText('资料已保存')).not.toBeInTheDocument();
    failSave = false;
    fireEvent.click(within(dialog).getByRole('button', { name: '保存资料' }));
    expect(await screen.findByText('资料已保存')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(savedProfile.phone).toBe('13800000099');
    expect(submitted).toEqual([
      {
        phone: '13800000099',
        specialty: 'Cardiology',
        outpatientLocation: 'Room 1',
        bio: 'Synthetic clinician',
      },
      {
        phone: '13800000099',
        specialty: 'Cardiology',
        outpatientLocation: 'Room 1',
        bio: 'Synthetic clinician',
      },
    ]);
  });

  it('reports denied device permission and emits preference changes only after a successful save', async () => {
    const permission = vi.fn(async () => 'denied');
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: permission });
    let failSave = true;
    let saved = { ...DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).endsWith('/session')) return reply(session);
        if (String(url).endsWith('/settings/profile')) return reply(profile);
        if (init?.method === 'PUT') {
          if (failSave) return reply(null, 503);
          saved = JSON.parse(String(init.body));
        }
        return reply(saved);
      }),
    );
    const changed = vi.fn();
    window.addEventListener('carelink-notification-preferences-changed', changed);
    try {
      openSettings();
      fireEvent.click(await screen.findByRole('switch', { name: '浏览器提示' }));
      expect(permission).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('此设备未允许通知，暂时只显示站内提醒。')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '保存通知偏好' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('通知偏好保存失败，请重试。');
      expect(changed).not.toHaveBeenCalled();
      failSave = false;
      fireEvent.click(screen.getByRole('button', { name: '保存通知偏好' }));
      await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
      expect(saved.browser).toBe(true);
      expect((changed.mock.calls[0]![0] as CustomEvent).detail).toEqual({
        identityId: profile.identityId,
        preferences: saved,
      });
      expect(screen.getByRole('button', { name: '保存通知偏好' })).toBeDisabled();
    } finally {
      window.removeEventListener('carelink-notification-preferences-changed', changed);
    }
  });

  it('keeps settings usable if requesting device permission throws synchronously', async () => {
    vi.stubGlobal('Notification', {
      requestPermission: () => {
        throw new Error('Unavailable device API');
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).endsWith('/session')) return reply(session);
        if (String(url).endsWith('/settings/profile')) return reply(profile);
        return reply(DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES);
      }),
    );
    openSettings();
    fireEvent.click(await screen.findByRole('switch', { name: '浏览器提示' }));
    expect(await screen.findByText('无法申请通知权限，暂时只显示站内提醒。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存通知偏好' })).toBeEnabled();
  });

  it('loads the next doctor independently and fully translates the settings page and editor', async () => {
    localStorage.setItem('carelink-language', 'en');
    let currentProfile = { ...profile };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).endsWith('/session'))
          return reply({
            ...session,
            doctor: { ...session.doctor, id: currentProfile.identityId },
          });
        if (String(url).endsWith('/settings/profile')) return reply(currentProfile);
        return reply(DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES);
      }),
    );
    const first = openSettings();
    await screen.findByRole('button', { name: 'Edit doctor profile' });
    first.unmount();
    currentProfile = {
      ...profile,
      identityId: 'doctor-2',
      email: 'doctor2@example.test',
      phone: '13800000002',
    };
    openSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit doctor profile' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByDisplayValue('13800000002')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('13800000001')).not.toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('doctor2@example.test')).toHaveAttribute('readonly');
    expect(
      screen.getByRole('button', { name: 'Save notification preferences' }),
    ).toBeInTheDocument();
    const translatedPage = document.body.cloneNode(true) as HTMLElement;
    translatedPage.querySelectorAll('option').forEach((option) => option.remove());
    expect(translatedPage.textContent).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it('rejects oversized password-verification photos before reading or submitting them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).endsWith('/session')) return reply(session);
        if (String(url).endsWith('/settings/profile')) return reply(profile);
        if (String(url).includes('/auth/password/change-password/start'))
          return reply({ challengeId: 'photo-test' });
        return reply(DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES);
      }),
    );
    openSettings();
    fireEvent.click(await screen.findByRole('button', { name: '修改密码' }));
    fireEvent.change(screen.getByLabelText('旧密码'), { target: { value: 'old-password' } });
    fireEvent.change(screen.getByLabelText('验证方式'), { target: { value: 'photo' } });
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    const photo = await screen.findByLabelText('验证照片');
    fireEvent.change(photo, {
      target: {
        files: [
          new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], 'large.png', { type: 'image/png' }),
        ],
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('图片不能超过 2 MiB');
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: '修改密码' }),
    ).toBeDisabled();
  });
});
