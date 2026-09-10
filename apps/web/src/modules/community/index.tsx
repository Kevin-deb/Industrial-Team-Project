import { useI18n } from '../../shared/i18n';
import { useCallback, useState } from 'react';
import {
  BookOpen,
  Check,
  GraduationCap,
  HeartHandshake,
  MessageCircle,
  MessageSquare,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { Badge, Card, PageHeader } from '../../shared/ui';
import { LinkAction, PlannedDialog, ReadOnlyNote, SectionTitle } from '../ui';
import { useCommunityPreference } from '../preferences';

const features = [
  {
    icon: MessageSquare,
    title: '专业交流',
    copy: '围绕医学实践交流经验，与同行一起发现新的思路。',
    tone: 'teal',
    details:
      '专业交流将支持实名或匿名主题讨论、点赞、评论和内容举报。内容仅供专业交流参考，不提供针对具体患者的诊疗方案。临床档案不会自动同步到社区；发布者需手动去标识化并确认共享范围。',
  },
  {
    icon: BookOpen,
    title: '病例讨论',
    copy: '在清晰的共享边界内，开展经过脱敏的病例学习。',
    tone: 'blue',
    details:
      '病例讨论将与诊疗系统的数据访问隔离。讨论仅供专业学习参考，不构成针对具体患者的诊断或治疗方案。仅可手动整理经授权、去标识化的材料；系统将增加发布检查、审核与举报机制。',
  },
  {
    icon: GraduationCap,
    title: '学术活动',
    copy: '查看专业学习与学术交流信息，让学习成为日常。',
    tone: 'amber',
    details:
      '学术活动将展示由合适来源发布的活动信息，支持主题关注和个人收藏。活动数据源及报名接口尚未接入。',
  },
  {
    icon: UsersRound,
    title: '同行协作',
    copy: '以专业主题建立联系，在合适的范围内交换经验。',
    tone: 'rose',
    details:
      '同行协作将支持专业主题小组、邀请、加入或退出小组及消息偏好。任何专家会诊仍通过专门的会诊授权流程开展，不通过社区共享患者记录。',
  },
  {
    icon: HeartHandshake,
    title: '医养经验分享',
    copy: '交流慢病管理、连续照护与医养协同的实践体会。',
    tone: 'teal',
    details:
      '经验分享将提供结构化内容编辑、主题标签、收藏和审核。发布内容需去除患者身份及可重新识别的细节。',
  },
  {
    icon: MessageCircle,
    title: '社区消息',
    copy: '自主决定参与的程度，也可以完全关闭社区消息。',
    tone: 'blue',
    details:
      '社区消息将支持同行私信，并可单独关闭评论、邀请、私信与活动提醒，或关闭全部社区消息。当前社区消息服务未启用，本地总开关可立即隐藏入口。',
  },
] as const;

export function CommunityPage() {
  const { t } = useI18n();
  const { enabled, toggle, saveError } = useCommunityPreference();
  const [selected, setSelected] = useState<(typeof features)[number] | null>(null);
  const close = useCallback(() => setSelected(null), []);
  return (
    <div className="feature-page">
      <PageHeader
        eyebrow="PROFESSIONAL COMMUNITY"
        title={t('医生社区')}
        description={t('连接同行，分享经验。一个由您自主选择参与的专业交流空间。')}
        action={<Badge tone="amber">{t('扩展功能 · 尚未上线')}</Badge>}
      />
      <div className="feature-hero-note">
        <div>
          <span className="feature-eyebrow">KNOWLEDGE GROWS WHEN SHARED</span>
          <h2>{t('好的照护，源于不断交流与学习')}</h2>
          <p>
            {t(
              '我们为医生设计了独立的交流空间。专业讨论与诊疗工作分开授权，社区参与保持自愿，关闭后不影响诊疗工作。',
            )}
          </p>
        </div>
        <HeartHandshake size={60} />
      </div>
      <Card className="community-preference">
        <div>
          <h3>{t('显示医生社区入口')}</h3>
          <p>
            {enabled
              ? t('入口已显示。此开关立即生效，仅保存在当前客户端；消息服务尚未启用。')
              : t('社区入口已隐藏。可在此处或个人设置中重新开启。')}
            <br />
            {t('正式上线后将提供独立的社区消息偏好设置。')}
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
      </Card>
      {enabled ? (
        <>
          <SectionTitle
            title={t('为同行连接，预留更多可能')}
            subtitle={t('以下为设计中的社区功能；目前无法发帖、评论或发送消息。')}
          />
          <div className="feature-card-grid">
            {features.map((item) => (
              <Card className="feature-service-card" key={item.title}>
                <div className="feature-service-top">
                  <span className={`feature-symbol ${item.tone}`}>
                    <item.icon size={21} />
                  </span>
                  <Badge tone="slate">{t('规划中')}</Badge>
                </div>
                <h3>{t(item.title)}</h3>
                <p>{t(item.copy)}</p>
                <LinkAction onClick={() => setSelected(item)}>{t('查看功能设计')}</LinkAction>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card className="community-empty">
          <span className="feature-symbol">
            <MessageCircle size={25} />
          </span>
          <h3>{t('您的工作台，由您决定')}</h3>
          <p>
            {t('社区入口已关闭。患者管理、在线诊疗与其他医生服务保持可用。')}
            <br />
            {t('重新开启上方开关即可恢复入口。')}
          </p>
        </Card>
      )}
      <div className="audit-protection">
        <ShieldCheck size={27} />
        <div>
          <h3>{t('专业交流，也尊重信息边界')}</h3>
          <ul className="feature-check-list" style={{ marginBottom: 0 }}>
            <li>
              <Check />
              {t('患者档案不会自动发布或同步到社区')}
            </li>
            <li>
              <Check />
              {t('分享前手动去标识化，并确认授权范围')}
            </li>
            <li>
              <Check />
              {t('讨论仅供专业参考，不提供针对具体患者的诊疗方案')}
            </li>
            <li>
              <Check />
              {t('内容审核、举报与屏蔽能力已纳入后续计划')}
            </li>
          </ul>
        </div>
      </div>
      <ReadOnlyNote>
        {t('社区当前展示功能规划，不包含真实帖子、医生互动或外部消息连接。')}
      </ReadOnlyNote>
      {selected && (
        <PlannedDialog title={t(selected.title)} iteration="Iteration 5" onClose={close}>
          <p>{t(selected.details)}</p>
        </PlannedDialog>
      )}
    </div>
  );
}
