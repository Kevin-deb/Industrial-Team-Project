import { useI18n } from '../../shared/i18n';
import { useCallback, useState } from 'react';
import {
  Bell,
  Fingerprint,
  Mail,
  MessageCircle,
  Settings2,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react';
import type { Session } from '@doctor/contracts';
import { useApi } from '../../shared/api';
import { Badge, Card, LoadingState, PageHeader } from '../../shared/ui';
import { LinkAction, PersonAvatar, PlannedDialog, ReadOnlyNote, SectionTitle } from '../ui';
import { useCommunityPreference } from '../preferences';

const securityFeatures = [
  {
    icon: Mail,
    title: '邮箱验证',
    description: '通过已绑定邮箱完成身份核验与账号恢复。',
    planned:
      '邮箱验证将使用独立身份服务发送验证邮件，支持验证码有效期、尝试限制与验证审计。当前未绑定邮箱，也不会发送邮件。',
  },
  {
    icon: Smartphone,
    title: '手机验证码',
    description: '短信验证码与多因素验证的预留入口。',
    planned:
      '手机验证码将接入短信服务，启用重放防护、尝试频率限制及验证审计。此版本未连接短信服务，不会发送验证码。',
  },
  {
    icon: Fingerprint,
    title: '人脸身份核验',
    description: '在明确授权后启用可替代的身份核验方式。',
    planned:
      '人脸核验将在明确用户同意、提供替代验证方式及确定数据留存范围后接入。当前没有调用摄像头，也不会采集人脸信息。',
  },
  {
    icon: ShieldCheck,
    title: '多因素验证',
    description: '结合身份、角色与访问范围保护医疗数据。',
    planned:
      '生产环境将增加多因素身份验证、会话管理、角色授权及设备撤销。演示模式使用固定虚构医生身份，不能替代生产身份验证。',
  },
] as const;

export function SettingsPage() {
  const { t, language, setLanguage } = useI18n();
  const { data, loading, error, reload } = useApi<Session>('/session');
  const { enabled, toggle, saveError } = useCommunityPreference();
  const [planned, setPlanned] = useState<{ title: string; description: string } | null>(null);
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
                  { label: '当前环境', value: '本地演示 · 固定虚构身份' },
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
                  subtitle={t('PREFERENCES · 当前设备本地保存')}
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
                      {t('消息服务尚未启用。')}
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
                subtitle={t('SECURITY · 正式身份验证尚未接入')}
              />
              {securityFeatures.map((item) => (
                <div className="settings-feature" key={item.title}>
                  <span className="feature-symbol blue">
                    <item.icon size={19} />
                  </span>
                  <div>
                    <h3>{t(item.title)}</h3>
                    <p>{t(item.description)}</p>
                    <LinkAction
                      onClick={() => setPlanned({ title: item.title, description: item.planned })}
                    >
                      {t('了解接入计划')}
                    </LinkAction>
                  </div>
                  <Badge tone="slate">{t('待上线')}</Badge>
                </div>
              ))}
              <div className="feature-notice">
                <UserRound size={17} />
                <span>
                  {t(
                    '当前固定演示身份用于验证软件结构。邮箱、短信、人脸和生产权限体系均需要独立配置后上线。',
                  )}
                </span>
              </div>
            </Card>
          </div>
          <ReadOnlyNote>
            {t('语言与社区入口偏好可以实际保存；医生资料、身份验证和通知设置均为规划入口。')}
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
    </div>
  );
}
