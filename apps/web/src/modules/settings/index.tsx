import { useI18n } from '../../shared/i18n';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Bell,
  BellRing,
  CalendarCheck,
  Edit3,
  Fingerprint,
  Mail,
  MessageCircle,
  Save,
  Settings2,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import {
  DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES,
  MAX_PHOTO_BYTES,
  type DoctorNotificationPreferences,
  type DoctorProfile,
  type Session,
  type UpdateDoctorProfileInput,
} from '@doctor/contracts';
import { requestApi, useApi } from '../../shared/api';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Button, Card, LoadingState, PageHeader } from '../../shared/ui';
import { FeatureDialog, LinkAction, PersonAvatar, ReadOnlyNote, SectionTitle } from '../ui';
import { useCommunityPreference } from '../preferences';

const securityFeatures = [
  {
    icon: Mail,
    title: '邮箱验证',
    description: '通过已绑定邮箱完成身份核验与账号恢复。',
    status: '已启用',
  },
  {
    icon: Fingerprint,
    title: '演示拍照核验',
    description: '登录时采集一张演示照片；不执行人脸匹配或活体检测。',
    status: '演示功能',
  },
  {
    icon: ShieldCheck,
    title: '会话与访问范围',
    description: '当前会话和医生—患者授权共同控制访问。',
    status: '已启用',
  },
] as const;

export function SettingsPage() {
  const { t, language, setLanguage } = useI18n();
  const { data, loading, error, reload } = useApi<Session>('/session');
  const { enabled, notificationsEnabled, toggle, setNotificationsEnabled, saveError } =
    useCommunityPreference();
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [notifications, setNotifications] = useState<DoctorNotificationPreferences>(() => ({
    ...DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES,
  }));
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [notificationSaved, setNotificationSaved] = useState(false);
  const [notificationDirty, setNotificationDirty] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [browserNotice, setBrowserNotice] = useState('');
  const [changePassword, setChangePassword] = useState(false);
  const identityId = data?.doctor.id;

  useEffect(() => {
    if (!identityId) return;
    const controller = new AbortController();
    setSettingsLoading(true);
    setSettingsError(null);
    setProfile(null);
    setProfileEditorOpen(false);
    setProfileSaved(false);
    setNotificationSaved(false);
    setNotificationDirty(false);
    setNotificationError('');
    setBrowserNotice('');
    Promise.all([
      requestApi<DoctorProfile>('/settings/profile', { signal: controller.signal }),
      requestApi<DoctorNotificationPreferences>('/settings/notifications', {
        signal: controller.signal,
      }),
    ])
      .then(([currentProfile, currentNotifications]) => {
        if (controller.signal.aborted) return;
        setProfile(currentProfile.data);
        setNotifications(currentNotifications.data);
        if (
          currentNotifications.data.browser &&
          (!('Notification' in window) || Notification.permission !== 'granted')
        )
          setBrowserNotice('此设备尚未允许通知，暂时只显示站内提醒。');
      })
      .catch(() => {
        if (!controller.signal.aborted) setSettingsError('无法加载医生设置，请重试。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettingsLoading(false);
      });
    return () => controller.abort();
  }, [identityId, settingsRevision]);

  async function saveProfile(next: UpdateDoctorProfileInput) {
    const result = await requestApi<DoctorProfile>('/settings/profile', {
      method: 'PUT',
      body: JSON.stringify(next),
    });
    setProfile(result.data);
    setProfileEditorOpen(false);
    setProfileSaved(true);
  }

  function changeNotifications(next: DoctorNotificationPreferences) {
    setNotifications(next);
    setNotificationDirty(true);
    setNotificationSaved(false);
    setNotificationError('');
    if (!next.browser) setBrowserNotice('');
    if (next.browser && !notifications.browser) {
      if (!('Notification' in window)) {
        setBrowserNotice('此设备不支持系统通知，仍可查看站内提醒。');
      } else {
        void (async () => {
          try {
            const permission = await Notification.requestPermission();
            setBrowserNotice(
              permission === 'granted'
                ? '此设备已允许通知；保存偏好后生效。'
                : '此设备未允许通知，暂时只显示站内提醒。',
            );
          } catch {
            setBrowserNotice('无法申请通知权限，暂时只显示站内提醒。');
          }
        })();
      }
    }
  }

  async function saveNotifications() {
    if (notificationBusy) return;
    setNotificationBusy(true);
    setNotificationError('');
    setNotificationSaved(false);
    try {
      const result = await requestApi<DoctorNotificationPreferences>('/settings/notifications', {
        method: 'PUT',
        body: JSON.stringify(notifications),
      });
      setNotifications(result.data);
      setNotificationDirty(false);
      setNotificationSaved(true);
      window.dispatchEvent(
        new CustomEvent('carelink-notification-preferences-changed', {
          detail: { identityId, preferences: result.data },
        }),
      );
    } catch {
      setNotificationError('通知偏好保存失败，请重试。');
    } finally {
      setNotificationBusy(false);
    }
  }
  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="ACCOUNT & PREFERENCES"
        title={t('个人设置')}
        description={t('管理您的医生资料、提醒偏好与账号安全。')}
        action={<Badge tone="teal">{t('演示工作空间')}</Badge>}
      />
      {loading ||
      error ||
      !data ||
      settingsLoading ||
      settingsError ||
      !profile ||
      profile.identityId !== identityId ? (
        <LoadingState
          error={error || settingsError}
          onRetry={() => {
            reload();
            setSettingsRevision((value) => value + 1);
          }}
        />
      ) : (
        <>
          <div className="feature-columns" style={{ marginTop: 26 }}>
            <div className="feature-stack">
              <Card className="feature-card-pad">
                <SectionTitle title={t('医生资料')} subtitle={t('DOCTOR PROFILE · 虚构演示身份')} />
                <div className="settings-profile">
                  <PersonAvatar name={data.doctor.name} size="large" />
                  <div>
                    <h2>{data.doctor.name}</h2>
                    <p>
                      {data.doctor.department} · {data.doctor.title}
                    </p>
                  </div>
                </div>
                {[
                  { label: '所属机构', value: data.doctor.hospital },
                  { label: '所在科室', value: data.doctor.department },
                  { label: '医生职称', value: data.doctor.title },
                  { label: '医生编号', value: data.doctor.id },
                  { label: '执业编号', value: data.doctor.licenseNumber ?? '—' },
                  { label: '专业方向', value: profile?.specialty || '—' },
                  { label: '工作邮箱', value: profile?.email || '—' },
                  { label: '联系电话', value: profile?.phone || '—' },
                  { label: '门诊地点', value: profile?.outpatientLocation || '—' },
                  { label: '身份证件', value: data.doctor.governmentIdMasked ?? '—' },
                  {
                    label: '资质状态',
                    value: data.doctor.credentialStatus === 'verified' ? '已核验' : '待核验',
                  },
                  {
                    label: '人员状态',
                    value: data.doctor.personnelStatus === 'verified' ? '医院人员已审核' : '待审核',
                  },
                  { label: '当前环境', value: '本地合成数据演示' },
                ].map((item) => (
                  <div className="settings-field" key={item.label}>
                    <span>{t(item.label)}</span>
                    <strong>{t(item.value)}</strong>
                  </div>
                ))}
                {profile?.bio && (
                  <div className="settings-profile-bio">
                    <span>{t('个人简介')}</span>
                    <p>{t(profile.bio)}</p>
                  </div>
                )}
                {profileSaved && <p className="settings-save-hint">{t('资料已保存')}</p>}
                <LinkAction
                  onClick={() => {
                    setProfileSaved(false);
                    setProfileEditorOpen(true);
                  }}
                >
                  <Edit3 size={15} />
                  {t('编辑医生资料')}
                </LinkAction>
              </Card>
              <Card className="feature-card-pad">
                <SectionTitle
                  title={t('工作台偏好')}
                  subtitle={t('PREFERENCES · 本地服务持久保存')}
                />
                <div
                  className="settings-preference"
                  style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}
                >
                  <div>
                    <h3 className="feature-inline-icon">
                      <MessageCircle size={15} />
                      {t('显示医生社区入口')}
                    </h3>
                    <p>
                      {t('关闭后隐藏侧边栏入口，诊疗功能保持可用。')}
                      <br />
                      {t('同行私信可在本地演示，未连接外部消息服务。')}
                    </p>
                    {saveError && <p role="alert">{t(saveError)}</p>}
                  </div>
                  <button
                    className="feature-switch"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={t('显示医生社区入口')}
                    onClick={toggle}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-preference settings-language">
                  <div>
                    <h3>{t('界面语言')}</h3>
                    <p>{t('切换中文或英文，即时生效并保存在此设备。')}</p>
                  </div>
                  <select
                    className="feature-select"
                    aria-label={t('界面语言')}
                    value={language}
                    onChange={(event) => setLanguage(event.target.value as 'zh-CN' | 'en')}
                  >
                    <option value="zh-CN">简体中文</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className="settings-preference">
                  <div>
                    <h3 className="feature-inline-icon">
                      <Settings2 size={15} />
                      {t('界面主题')}
                    </h3>
                    <p>{t('当前采用适合医疗工作台的浅色风格。')}</p>
                  </div>
                  <Badge tone="slate">{t('浅色')}</Badge>
                </div>
                <div className="settings-preference">
                  <div>
                    <h3 className="feature-inline-icon">
                      <Bell size={15} />
                      {t('通知偏好')}
                    </h3>
                    <p>{t('按医生账号保存提醒偏好，重新登录后继续生效。')}</p>
                  </div>
                  {notificationSaved && <Badge tone="teal">{t('已保存')}</Badge>}
                </div>
                <fieldset disabled={notificationBusy} style={{ border: 0, padding: 0, margin: 0 }}>
                  <NotificationPreferencePanel
                    value={notifications}
                    onChange={changeNotifications}
                    communityNotificationsEnabled={notificationsEnabled}
                    onCommunityNotificationChange={setNotificationsEnabled}
                  />
                </fieldset>
                <p className="settings-form-note">
                  {t('这些开关控制医生收到的提醒，不取消已经安排给患者的提醒。')}
                </p>
                <p className="settings-form-note">
                  {t('免打扰时间使用北京时间；开始与结束相同表示全天免打扰。')}
                </p>
                {browserNotice && (
                  <p role="status" className="settings-form-note">
                    {t(browserNotice)}
                  </p>
                )}
                {notificationError && (
                  <p role="alert" className="auth-error">
                    {t(notificationError)}
                  </p>
                )}
                <Button
                  disabled={!notificationDirty || notificationBusy}
                  onClick={() => void saveNotifications()}
                >
                  <Save size={15} />
                  {t(notificationBusy ? '正在保存…' : '保存通知偏好')}
                </Button>
              </Card>
            </div>
            <Card className="feature-card-pad">
              <SectionTitle title={t('账号与安全')} subtitle={t('SECURITY · 本地验证与访问控制')} />
              {securityFeatures.map((item) => (
                <div className="settings-feature" key={item.title}>
                  <span className="feature-symbol blue">
                    <item.icon size={19} />
                  </span>
                  <div>
                    <h3>{t(item.title)}</h3>
                    <p>{t(item.description)}</p>
                  </div>
                  <Badge tone={item.status === '已启用' ? 'teal' : 'amber'}>{t(item.status)}</Badge>
                </div>
              ))}
              <div className="feature-notice">
                <UserRound size={17} />
                <span>
                  {t(
                    '当前使用本地合成医生账号、一次性邮箱验证码和演示拍照核验。拍照不等于真实人脸识别。',
                  )}
                </span>
              </div>
              <LinkAction onClick={() => setChangePassword(true)}>{t('修改密码')}</LinkAction>
            </Card>
          </div>
          <ReadOnlyNote>
            {t('资料、偏好、会话与访问范围由本地数据库保存和控制；演示照片不执行真实人脸识别。')}
          </ReadOnlyNote>
        </>
      )}
      {profileEditorOpen && data && profile && (
        <ProfileEditDialog
          doctorName={data.doctor.name}
          value={profile}
          onSave={saveProfile}
          onClose={() => setProfileEditorOpen(false)}
        />
      )}
      {changePassword && <ChangePasswordDialog onClose={() => setChangePassword(false)} />}
    </div>
  );
}

function ProfileEditDialog({
  doctorName,
  value,
  onSave,
  onClose,
}: {
  doctorName: string;
  value: DoctorProfile;
  onSave: (value: UpdateDoctorProfileInput) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function update(field: keyof UpdateDoctorProfileInput, next: string) {
    setDraft((current) => ({ ...current, [field]: next }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    const phone = draft.phone.trim();
    if (phone && !/^[0-9+\-\s]{6,20}$/.test(phone)) {
      setError('请输入有效的联系电话');
      return;
    }
    if (!draft.specialty.trim()) {
      setError('请输入专业方向');
      return;
    }
    setBusy(true);
    try {
      await onSave({
        phone,
        specialty: draft.specialty.trim(),
        outpatientLocation: draft.outpatientLocation.trim(),
        bio: draft.bio.trim(),
      });
    } catch {
      setError('医生资料保存失败，请重试。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <FeatureDialog title={t('编辑医生资料')} subtitle={doctorName} onClose={onClose}>
      <form className="settings-edit-form" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: 'contents' }}>
          <label>
            {t('工作邮箱')}
            <input value={value.email} readOnly aria-readonly="true" />
            <small>{t('绑定邮箱用于登录和验证，此处不可修改。')}</small>
          </label>
          <label>
            {t('联系电话')}
            <input
              maxLength={20}
              value={draft.phone}
              onChange={(event) => update('phone', event.target.value)}
            />
          </label>
          <label>
            {t('专业方向')}
            <input
              maxLength={120}
              required
              value={draft.specialty}
              onChange={(event) => update('specialty', event.target.value)}
            />
          </label>
          <label>
            {t('门诊地点')}
            <input
              maxLength={200}
              value={draft.outpatientLocation}
              onChange={(event) => update('outpatientLocation', event.target.value)}
            />
          </label>
          <label>
            {t('个人简介')}
            <textarea
              rows={4}
              maxLength={2000}
              value={draft.bio}
              onChange={(event) => update('bio', event.target.value)}
            />
          </label>
          <p className="settings-form-note">
            {t('机构、科室、职称与执业资质属于审核资料；绑定邮箱保持不变。')}
          </p>
          {error && (
            <p role="alert" className="auth-error">
              {t(error)}
            </p>
          )}
          <div className="settings-form-actions">
            <Button variant="secondary" onClick={onClose}>
              {t('取消')}
            </Button>
            <Button type="submit">
              <Save size={15} />
              {t(busy ? '正在保存…' : '保存资料')}
            </Button>
          </div>
        </fieldset>
      </form>
    </FeatureDialog>
  );
}

function NotificationPreferencePanel({
  value,
  onChange,
  communityNotificationsEnabled,
  onCommunityNotificationChange,
}: {
  value: DoctorNotificationPreferences;
  onChange: (value: DoctorNotificationPreferences) => void;
  communityNotificationsEnabled: boolean;
  onCommunityNotificationChange: (value: boolean) => void;
}) {
  const { t } = useI18n();
  const set = <K extends keyof DoctorNotificationPreferences>(
    key: K,
    next: DoctorNotificationPreferences[K],
  ) => onChange({ ...value, [key]: next });
  return (
    <div className="settings-notification-panel">
      <NotificationRow
        icon={<CalendarCheck size={16} />}
        title="接诊提醒"
        description="显示当前医生的待接诊与预约提醒。"
        checked={value.encounter}
        onChange={(next) => set('encounter', next)}
      />
      <NotificationRow
        icon={<BellRing size={16} />}
        title="随访提醒"
        description="显示当前医生的随访任务和健康异常提醒。"
        checked={value.followUp}
        onChange={(next) => set('followUp', next)}
      />
      <NotificationRow
        icon={<MessageCircle size={16} />}
        title="社区互动通知"
        description="同行评论、私信和社区互动提醒。"
        checked={communityNotificationsEnabled}
        onChange={onCommunityNotificationChange}
      />
      <NotificationRow
        icon={<Bell size={16} />}
        title="浏览器提示"
        description="开启后允许本地桌面提醒，仍需此设备授予通知权限。"
        checked={value.browser}
        onChange={(next) => set('browser', next)}
      />
      <div className="settings-quiet-row">
        <div>
          <h3>{t('免打扰时段')}</h3>
          <p>{t('开启后，该时段内只保留页面内提示。')}</p>
        </div>
        <button
          className="feature-switch"
          role="switch"
          aria-checked={value.quietHours}
          aria-label={t('免打扰时段')}
          onClick={() => set('quietHours', !value.quietHours)}
        >
          <span />
        </button>
      </div>
      <div className="settings-time-range" aria-disabled={!value.quietHours}>
        <label>
          {t('开始')}
          <input
            type="time"
            value={value.quietStart}
            disabled={!value.quietHours}
            onChange={(event) => set('quietStart', event.target.value)}
          />
        </label>
        <label>
          {t('结束')}
          <input
            type="time"
            value={value.quietEnd}
            disabled={!value.quietHours}
            onChange={(event) => set('quietEnd', event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

function NotificationRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="settings-notification-row">
      <span>{icon}</span>
      <div>
        <h3>{t(title)}</h3>
        <p>{t(description)}</p>
      </div>
      <button
        className="feature-switch"
        role="switch"
        aria-checked={checked}
        aria-label={t(title)}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [method, setMethod] = useState<'email' | 'photo'>('email');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function uploadPhoto(file?: File) {
    setError('');
    setPhotoDataUrl('');
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('请选择 PNG 或 JPEG 图片。');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('图片不能超过 2 MiB，请选择较小的图片。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(String(reader.result));
    reader.onerror = () => setError('无法读取图片，请重新选择。');
    reader.readAsDataURL(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      if (!challengeId) {
        const result = await requestApi<{ challengeId: string }>(
          '/auth/password/change-password/start',
          { method: 'POST', body: JSON.stringify({ currentPassword, method }) },
        );
        setChallengeId(result.data.challengeId);
        if (method === 'email') {
          try {
            const mail = await requestApi<{ code: string }>(
              '/auth/demo-email/' + encodeURIComponent(result.data.challengeId),
            );
            setDemoCode(mail.data.code);
          } catch {
            /* SMTP delivery has no local demonstration code. */
          }
        }
      } else {
        await requestApi('/auth/password/change-password/complete', {
          method: 'POST',
          body: JSON.stringify({
            challengeId,
            code,
            photoDataUrl: photoDataUrl || undefined,
            newPassword,
          }),
        });
        await logout();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '验证失败，请重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FeatureDialog
      title={t('修改密码')}
      subtitle={t('旧密码 + 二次验证')}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="auth-settings-form" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: 'contents' }}>
          {!challengeId ? (
            <>
              <label>
                {t('旧密码')}
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
              <label>
                {t('验证方式')}
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value as 'email' | 'photo')}
                >
                  <option value="email">{t('工作邮箱验证码')}</option>
                  <option value="photo">{t('演示拍照核验')}</option>
                </select>
              </label>
            </>
          ) : (
            <>
              {demoCode && (
                <div className="demo-code">
                  {t('本地演示邮件验证码')}：<b>{demoCode}</b>
                </div>
              )}
              {method === 'email' ? (
                <label>
                  {t('邮箱验证码')}
                  <input
                    required
                    inputMode="numeric"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  />
                </label>
              ) : (
                <label className="photo-upload auth-recovery-upload">
                  {photoDataUrl ? t('照片已选择') : t('拍照或上传照片')}
                  <input
                    aria-label={t('验证照片')}
                    type="file"
                    accept="image/png,image/jpeg"
                    capture="user"
                    onChange={(event) => uploadPhoto(event.target.files?.[0])}
                  />
                  <small>{t('仅 PNG/JPEG，最大 2 MiB；演示核验不执行人脸匹配。')}</small>
                </label>
              )}
              <label>
                {t('新密码')}
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={72}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </label>
              <small>{t('至少10位，包含大小写字母、数字和特殊字符')}</small>
            </>
          )}
          {error && (
            <p role="alert" className="auth-error">
              {t(error)}
            </p>
          )}
          <button
            className="auth-primary"
            disabled={busy || Boolean(challengeId && method === 'photo' && !photoDataUrl)}
          >
            {t(busy ? '正在提交…' : challengeId ? '修改密码' : '继续')}
          </button>
        </fieldset>
      </form>
    </FeatureDialog>
  );
}
