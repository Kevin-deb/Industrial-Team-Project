import { useI18n } from '../../shared/i18n';
import { useCallback, useState, type FormEvent } from 'react';
import {
  Bell,
  Fingerprint,
  Mail,
  MessageCircle,
  Settings2,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { Session } from '@doctor/contracts';
import { requestApi, useApi } from '../../shared/api';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Card, LoadingState, PageHeader } from '../../shared/ui';
import { FeatureDialog, LinkAction, PersonAvatar, PlannedDialog, ReadOnlyNote, SectionTitle } from '../ui';
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
    description: '密码、邮箱、拍照步骤和医生—患者授权共同控制访问。',
    status: '已启用',
  },
] as const;

export function SettingsPage() {
  const { t, language, setLanguage } = useI18n();
  const { data, loading, error, reload } = useApi<Session>('/session');
  const { enabled, toggle, saveError } = useCommunityPreference();
  const [planned, setPlanned] = useState<{ title: string; description: string } | null>(null);
  const [changePassword, setChangePassword] = useState(false);
  const close = useCallback(() => setPlanned(null), []);
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
                  { label: '专业方向', value: data.doctor.specialty ?? '—' },
                  { label: '工作邮箱', value: data.doctor.email ?? '—' },
                  { label: '联系电话', value: data.doctor.phone ?? '—' },
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
                <LinkAction
                  onClick={() =>
                    setPlanned({
                      title: '编辑医生资料',
                      description:
                        '资料编辑将支持更新联系信息与工作资料。机构、科室、职称及执业资质变更需要配置相应的验证和审批流程，当前演示资料不可修改。',
                    })
                  }
                >
                  {t('资料编辑 · 尚未上线')}
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
                    <p>{t('接诊、随访与社区通知的独立偏好将在后续接入。')}</p>
                  </div>
                  <LinkAction
                    onClick={() =>
                      setPlanned({
                        title: '通知偏好',
                        description:
                          '接诊安排、健康随访与社区消息将使用独立通知类型。您可以单独管理接收方式及社区消息总开关；当前没有发送站内、短信或邮件通知。',
                      })
                    }
                  >
                    {t('查看规划')}
                  </LinkAction>
                </div>
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
      {planned && (
        <PlannedDialog
          title={planned.title}
          iteration={planned.title === '通知偏好' ? 'Iteration 2' : 'Iteration 1'}
          onClose={close}
        >
          <p>{t(planned.description)}</p>
        </PlannedDialog>
      )}
      {changePassword && <ChangePasswordDialog onClose={() => setChangePassword(false)} />}
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
