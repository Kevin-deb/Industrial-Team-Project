import { useI18n } from '../../shared/i18n';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
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
import type { Session } from '@doctor/contracts';
import { requestApi, useApi } from '../../shared/api';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Button, Card, LoadingState, PageHeader } from '../../shared/ui';
import { FeatureDialog, LinkAction, PersonAvatar, ReadOnlyNote, SectionTitle } from '../ui';
import { useCommunityPreference } from '../preferences';

const PROFILE_STORAGE_KEY = 'carelink-doctor-profile-overrides';
const NOTIFICATION_STORAGE_KEY = 'carelink-workspace-notification-preferences';

type DoctorProfileDraft = {
  email: string;
  phone: string;
  specialty: string;
  outpatientLocation: string;
  bio: string;
};

type NotificationPreferences = {
  encounter: boolean;
  followUp: boolean;
  browser: boolean;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
};

const defaultNotifications: NotificationPreferences = {
  encounter: true,
  followUp: true,
  browser: false,
  quietHours: true,
  quietStart: '21:00',
  quietEnd: '08:00',
};

function readStoredProfile(): Partial<DoctorProfileDraft> {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) ?? '{}') as Partial<DoctorProfileDraft>;
  } catch {
    return {};
  }
}

function readStoredNotifications(): NotificationPreferences {
  try {
    return {
      ...defaultNotifications,
      ...(JSON.parse(localStorage.getItem(NOTIFICATION_STORAGE_KEY) ?? '{}') as Partial<NotificationPreferences>),
    };
  } catch {
    return defaultNotifications;
  }
}

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
    description: '密码、邮箱、拍照步骤和医生—患者授权共同控制访问。',
    status: '已启用',
  },
] as const;

export function SettingsPage() {
  const { t, language, setLanguage } = useI18n();
  const { data, loading, error, reload } = useApi<Session>('/session');
  const {
    enabled,
    notificationsEnabled,
    toggle,
    setNotificationsEnabled,
    saveError,
  } = useCommunityPreference();
  const [profileOverrides, setProfileOverrides] = useState<Partial<DoctorProfileDraft>>(() => readStoredProfile());
  const [notifications, setNotifications] = useState<NotificationPreferences>(() => readStoredNotifications());
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [notificationSaved, setNotificationSaved] = useState(false);
  const [changePassword, setChangePassword] = useState(false);
  const notificationsReady = useRef(false);
  useEffect(() => {
    if (!notificationsReady.current) {
      notificationsReady.current = true;
      return undefined;
    }
    try {
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications));
      window.dispatchEvent(new CustomEvent('carelink-notification-preferences-changed'));
      setNotificationSaved(true);
      const timer = window.setTimeout(() => setNotificationSaved(false), 1600);
      return () => window.clearTimeout(timer);
    } catch {
      return undefined;
    }
  }, [notifications]);
  const mergedProfile = data
    ? {
        email: profileOverrides.email ?? data.doctor.email ?? '',
        phone: profileOverrides.phone ?? data.doctor.phone ?? '',
        specialty: profileOverrides.specialty ?? data.doctor.specialty ?? '',
        outpatientLocation: profileOverrides.outpatientLocation ?? '线上诊疗中心 3 诊室',
        bio: profileOverrides.bio ?? '擅长慢病连续管理、在线随访和多学科协作。',
      }
    : null;
  function saveProfile(next: DoctorProfileDraft) {
    setProfileOverrides(next);
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* The visible form still updates for the current session. */
    }
    setProfileEditorOpen(false);
    setProfileSaved(true);
    window.setTimeout(() => setProfileSaved(false), 1800);
  }
  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="ACCOUNT & PREFERENCES"
        title={t('个人设置')}
        description={t('管理您的工作身份、界面偏好与未来的安全设置。')}
        action={<Badge tone="teal">{t('演示工作空间')}</Badge>}
      />
      {loading || error || !data ? (
        <LoadingState error={error} onRetry={reload} />
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
                  { label: '专业方向', value: mergedProfile?.specialty || '—' },
                  { label: '工作邮箱', value: mergedProfile?.email || '—' },
                  { label: '联系电话', value: mergedProfile?.phone || '—' },
                  { label: '门诊地点', value: mergedProfile?.outpatientLocation || '—' },
                  { label: '身份证件', value: data.doctor.governmentIdMasked ?? '—' },
                  { label: '资质状态', value: data.doctor.credentialStatus === 'verified' ? '已核验' : '待核验' },
                  { label: '人员状态', value: data.doctor.personnelStatus === 'verified' ? '医院人员已审核' : '待审核' },
                  { label: '当前环境', value: '本地合成数据演示' },
                ].map((item) => (
                  <div className="settings-field" key={item.label}>
                    <span>{t(item.label)}</span>
                    <strong>{t(item.value)}</strong>
                  </div>
                ))}
                {mergedProfile?.bio && (
                  <div className="settings-profile-bio">
                    <span>{t('个人简介')}</span>
                    <p>{t(mergedProfile.bio)}</p>
                  </div>
                )}
                {profileSaved && <p className="settings-save-hint">{t('资料已保存')}</p>}
                <LinkAction onClick={() => setProfileEditorOpen(true)}>
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
                    <p>{t('按工作类型管理提醒，并保存在当前设备。')}</p>
                  </div>
                  {notificationSaved && <Badge tone="teal">{t('已保存')}</Badge>}
                </div>
                <NotificationPreferencePanel
                  value={notifications}
                  onChange={setNotifications}
                  communityNotificationsEnabled={notificationsEnabled}
                  onCommunityNotificationChange={setNotificationsEnabled}
                />
              </Card>
            </div>
            <Card className="feature-card-pad">
              <SectionTitle
                title={t('账号与安全')}
                subtitle={t('SECURITY · 本地验证与访问控制')}
              />
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
            {t('医生身份、邮箱验证、会话与患者访问范围由本地数据库实际控制；外部邮件和真实生物识别供应商仍需后续接入。')}
          </ReadOnlyNote>
        </>
      )}
      {profileEditorOpen && data && mergedProfile && (
        <ProfileEditDialog
          doctorName={data.doctor.name}
          value={mergedProfile}
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
  value: DoctorProfileDraft;
  onSave: (value: DoctorProfileDraft) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  function update(field: keyof DoctorProfileDraft, next: string) {
    setDraft((current) => ({ ...current, [field]: next }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const email = draft.email.trim();
    const phone = draft.phone.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的工作邮箱');
      return;
    }
    if (phone && !/^[0-9+\-\s]{6,20}$/.test(phone)) {
      setError('请输入有效的联系电话');
      return;
    }
    onSave({
      email,
      phone,
      specialty: draft.specialty.trim(),
      outpatientLocation: draft.outpatientLocation.trim(),
      bio: draft.bio.trim(),
    });
  }
  return (
    <FeatureDialog title={t('编辑医生资料')} subtitle={doctorName} onClose={onClose}>
      <form className="settings-edit-form" onSubmit={submit}>
        <label>
          {t('工作邮箱')}
          <input value={draft.email} onChange={(event) => update('email', event.target.value)} />
        </label>
        <label>
          {t('联系电话')}
          <input value={draft.phone} onChange={(event) => update('phone', event.target.value)} />
        </label>
        <label>
          {t('专业方向')}
          <input value={draft.specialty} onChange={(event) => update('specialty', event.target.value)} />
        </label>
        <label>
          {t('门诊地点')}
          <input
            value={draft.outpatientLocation}
            onChange={(event) => update('outpatientLocation', event.target.value)}
          />
        </label>
        <label>
          {t('个人简介')}
          <textarea rows={4} value={draft.bio} onChange={(event) => update('bio', event.target.value)} />
        </label>
        <p className="settings-form-note">
          {t('机构、科室、职称与执业资质属于审核资料，当前只允许编辑联系方式和工作简介。')}
        </p>
        {error && <p className="auth-error">{t(error)}</p>}
        <div className="settings-form-actions">
          <Button variant="secondary" onClick={onClose}>
            {t('取消')}
          </Button>
          <Button type="submit">
            <Save size={15} />
            {t('保存资料')}
          </Button>
        </div>
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
  value: NotificationPreferences;
  onChange: (value: NotificationPreferences) => void;
  communityNotificationsEnabled: boolean;
  onCommunityNotificationChange: (value: boolean) => void;
}) {
  const { t } = useI18n();
  const set = <K extends keyof NotificationPreferences>(key: K, next: NotificationPreferences[K]) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="settings-notification-panel">
      <NotificationRow
        icon={<CalendarCheck size={16} />}
        title="接诊提醒"
        description="预约前、患者进入诊间和问诊即将超时提醒。"
        checked={value.encounter}
        onChange={(next) => set('encounter', next)}
      />
      <NotificationRow
        icon={<BellRing size={16} />}
        title="随访提醒"
        description="复诊计划、健康指标异常和待处理随访提醒。"
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
        description="允许后在当前浏览器弹出本地提醒。"
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
  const [method, setMethod] = useState<'email'|'photo'>('email');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      if (!challengeId) {
        const result = await requestApi<{challengeId:string}>('/auth/password/change-password/start', { method:'POST', body:JSON.stringify({currentPassword,method}) });
        setChallengeId(result.data.challengeId);
        if(method==='email') try { const mail=await requestApi<{code:string}>('/auth/demo-email/'+encodeURIComponent(result.data.challengeId));setDemoCode(mail.data.code); } catch { /* SMTP */ }
      } else {
        await requestApi('/auth/password/change-password/complete',{method:'POST',body:JSON.stringify({challengeId,code,photoDataUrl:photoDataUrl||undefined,newPassword})});
        await logout();
      }
    } catch(reason) { setError(reason instanceof Error ? reason.message : t('验证失败，请重试。')); }
  }
  return <FeatureDialog title="修改密码" subtitle="旧密码 + 二次验证" onClose={onClose}>
    <form className="auth-settings-form" onSubmit={(e)=>void submit(e)}>
      {!challengeId ? <><label>{t('旧密码')}<input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label><label>{t('验证方式')}<select value={method} onChange={e=>setMethod(e.target.value as 'email'|'photo')}><option value="email">{t('工作邮箱验证码')}</option><option value="photo">{t('演示拍照核验')}</option></select></label></> : <>{demoCode&&<div className="demo-code">{t('本地演示邮件验证码')}：<b>{demoCode}</b></div>}{method==='email'?<label>{t('邮箱验证码')}<input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>:<label className="photo-upload auth-recovery-upload">{photoDataUrl?t('照片已选择'):t('拍照或上传照片')}<input type="file" accept="image/png,image/jpeg" capture="user" onChange={e=>{const file=e.target.files?.[0];if(file){const reader=new FileReader();reader.onload=()=>setPhotoDataUrl(String(reader.result));reader.readAsDataURL(file);}}}/></label>}<label>{t('新密码')}<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><small>{t('至少10位，包含大小写字母、数字和特殊字符')}</small></>}
      {error&&<p role="alert" className="auth-error">{error}</p>}<button className="auth-primary">{challengeId?t('修改密码'):t('继续')}</button>
    </form>
  </FeatureDialog>;
}
