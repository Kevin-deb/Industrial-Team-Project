const demoGroups = [
  [
    '老年医学与连续照护',
    'Geriatrics and continuity of care',
    '老年医学',
    'Geriatrics',
    '讨论多病共存、综合评估与连续照护工作方法。',
    'Discuss multimorbidity, comprehensive assessment, and continuity-of-care workflows.',
  ],
  [
    '心血管临床交流',
    'Cardiovascular clinical exchange',
    '心血管内科',
    'Cardiology',
    '交流随访管理、检查解读与常见临床问题。',
    'Exchange approaches to follow-up, test interpretation, and common clinical questions.',
  ],
  [
    '内分泌与代谢',
    'Endocrinology and metabolism',
    '内分泌科',
    'Endocrinology',
    '围绕糖代谢、生活方式支持和长期随访展开讨论。',
    'Discuss glucose metabolism, lifestyle support, and long-term follow-up.',
  ],
  [
    '全科与基层实践',
    'General and primary care practice',
    '全科医学',
    'General medicine',
    '分享全科门诊、转诊衔接和基层工作经验。',
    'Share experience from general clinics, referral coordination, and primary care.',
  ],
  [
    '呼吸健康管理',
    'Respiratory health management',
    '呼吸内科',
    'Respiratory medicine',
    '讨论慢病随访、健康教育与协作照护。',
    'Discuss chronic-care follow-up, health education, and collaborative care.',
  ],
  [
    '康复医学同行圈',
    'Rehabilitation medicine peer group',
    '康复医学',
    'Rehabilitation medicine',
    '交流功能评估、康复计划与患者沟通经验。',
    'Exchange experience in functional assessment, rehabilitation plans, and patient communication.',
  ],
] as const;

const demoTopicStems = [
  ['门诊随访记录如何更清楚', 'Clearer outpatient follow-up records'],
  ['长期管理中的沟通经验', 'Communication in long-term care'],
  ['跨科协作流程讨论', 'Cross-specialty collaboration workflows'],
  ['健康教育材料怎么写', 'Writing health education materials'],
] as const;

const demoCommunityMessages: Record<string, string> = {
  周: 'Z',
  许: 'X',
  匿: 'A',
  匿名医生: 'Anonymous doctor',
  随访管理: 'Follow-up management',
  同行经验: 'Peer experience',
  '第 1 条同行回复：这个做法在日常工作中比较容易执行。':
    'Peer reply 1: This approach is practical in day-to-day work.',
  '第 2 条同行回复：这个做法在日常工作中比较容易执行。':
    'Peer reply 2: This approach is practical in day-to-day work.',
  '回复上面的观点：可以把流程再拆成记录、确认和复核三步。':
    'Replying to the point above: the workflow can be split into recording, confirmation, and review.',
};

for (const [
  groupName,
  groupEnglish,
  specialty,
  specialtyEnglish,
  description,
  descriptionEnglish,
] of demoGroups) {
  demoCommunityMessages[groupName] = groupEnglish;
  demoCommunityMessages[specialty] = specialtyEnglish;
  demoCommunityMessages[description] = descriptionEnglish;
  for (const [stem, stemEnglish] of demoTopicStems) {
    demoCommunityMessages[`${stem}：${specialty}`] = `${stemEnglish}: ${specialtyEnglish}`;
  }
  demoCommunityMessages[
    `结合日常工作整理了一份${specialty}交流提纲，主要想听听大家在记录、沟通和后续安排方面的做法。内容为合成讨论文本，不含真实患者资料。`
  ] =
    `I put together a ${specialtyEnglish.toLowerCase()} discussion outline from day-to-day practice and would like to hear how colleagues handle records, communication, and follow-up. This is synthetic discussion text with no real patient data.`;
}

for (let index = 1; index <= 36; index += 1) {
  demoCommunityMessages[`第 ${index} 条同行私信演示：围绕科室工作安排进行沟通。`] =
    `Demo peer message ${index}: discussing departmental work arrangements.`;
}

/** Owned by the community module. Keep source keys stable and translate at render time. */
export const communityMessages: Record<string, string> = {
  '点赞回复': 'Like reply',
  '取消点赞回复': 'Unlike reply',
  '收藏回复': 'Bookmark reply',
  '取消收藏回复': 'Remove reply bookmark',
  '点赞了你的回复': 'liked your reply',
  '收藏了你的回复': 'bookmarked your reply',
  '主题暂不可用，可能已被处理或无权访问。': 'This topic is unavailable. It may have been moderated or you may not have access.',
  ...demoCommunityMessages,
  同行社区: 'Peer community',
  '面向医生的专业论坛与同行私信，和患者临床资料严格分开。':
    'Professional forums and direct messages for doctors, kept separate from patient clinical data.',
  社区首页: 'Community home',
  专科圈子: 'Specialty groups',
  我的社区: 'My community',
  同行私信: 'Direct messages',
  社区设置: 'Community settings',
  同行社区导航: 'Peer community navigation',
  '请勿发布可识别患者身份的信息；社区讨论不能直接用于临床决策。':
    'Do not publish identifiable patient information. Community discussions must not be used directly for clinical decisions.',
  查看已加入圈子中的最新主题和回复: 'See the latest topics and replies from joined groups',
  搜索社区帖子: 'Search community posts',
  搜索标题或内容: 'Search titles or content',
  '正在加载主题…': 'Loading topics…',
  点赞: 'Like',
  取消点赞: 'Unlike',
  收藏: 'Bookmark',
  取消收藏: 'Remove bookmark',
  查看评论: 'View comments',
  '圈子是按专科组织的论坛，每个圈子都有独立主题列表':
    'Groups are specialty-based forums, each with its own topic list',
  位成员: 'members',
  个主题: 'topics',
  已加入: 'Joined',
  加入圈子: 'Join group',
  退出圈子: 'Leave group',
  进入论坛: 'Open forum',
  搜索专科圈子: 'Search specialty groups',
  输入圈子名称或专科: 'Enter a group name or specialty',
  返回专科圈子: 'Back to specialty groups',
  专科论坛: 'Specialty forum',
  按主题发帖并进行同行回复: 'Publish topics and reply to peers',
  主题排序: 'Topic order',
  最新回复: 'Latest reply',
  最新发布: 'Newest post',
  点赞最多: 'Most liked',
  收藏最多: 'Most bookmarked',
  浏览最多: 'Most viewed',
  浏览量: 'Views',
  标签筛选: 'Filter by tag',
  '正在更新主题…': 'Updating topics…',
  '主题加载失败，请重试。': 'Topics could not be loaded. Please retry.',
  发布主题: 'Publish topic',
  主题标题: 'Topic title',
  讨论内容: 'Discussion content',
  标签: 'Tags',
  '用逗号分隔，最多 5 个': 'Separate with commas, up to 5',
  匿名发布: 'Post anonymously',
  内容包含病例材料: 'Contains case material',
  我已手工去除患者身份及可重新识别的信息:
    'I manually removed patient identity and re-identifiable information',
  '正在发布…': 'Publishing…',
  确认发布: 'Publish',
  返回论坛: 'Back to forum',
  举报: 'Report',
  全部回复: 'All replies',
  回复: 'Reply',
  正在回复一条评论: 'Replying to a comment',
  回复内容: 'Reply content',
  '写下专业、友善的回复…': 'Write a professional and respectful reply…',
  发表回复: 'Post reply',
  编辑: 'Edit',
  删除: 'Delete',
  删除帖子: 'Delete post',
  编辑内容: 'Edit content',
  删除内容: 'Delete content',
  举报主题: 'Report topic',
  举报原因: 'Report reason',
  疑似错误医疗信息: 'Possibly false medical claim',
  广告: 'Advertising',
  不友善内容: 'Harassment',
  其他: 'Other',
  提交举报: 'Submit report',
  我的点赞: 'My likes',
  我的收藏: 'My bookmarks',
  我的帖子: 'My posts',
  我的消息: 'My activity',
  '查看自己的帖子、收藏和社区互动': 'Review your posts, bookmarks, and community activity',
  集中查看自己在社区中的内容与互动: 'Review your community content and interactions in one place',
  '查看别人对你内容的评论、回复、点赞和收藏':
    'See comments, replies, likes, and bookmarks on your content',
  查看互动消息和举报处理进度: 'See interactions and report status updates',
  进入完整列表: 'Open full list',
  评论了你的帖子: 'commented on your post',
  回复了你的评论: 'replied to your comment',
  点赞了你的帖子: 'liked your post',
  收藏了你的帖子: 'bookmarked your post',
  点赞了你的帖子或回复: 'liked your post or reply',
  收藏了你的帖子或回复: 'bookmarked your post or reply',
  你提交的举报已受理: 'your report has been accepted',
  你提交的举报处理成功: 'your report was upheld',
  你提交的举报未通过: 'your report was not upheld',
  你的内容因举报成立已被处理: 'your content was moderated after a report was upheld',
  有一条新的社区消息: 'has a new community update',
  返回我的社区: 'Back to my community',
  返回社区首页: 'Back to community home',
  这里显示完整记录: 'Complete history appears here',
  '私信是独立的一对一交流，不属于圈子论坛':
    'Direct messages are separate one-to-one conversations, not group forums',
  选择一位同行: 'Select a colleague',
  查找同行医生: 'Find a colleague',
  '搜索姓名、科室或职称': 'Search by name, department, or title',
  清空搜索: 'Clear search',
  '正在查找医生…': 'Finding doctors…',
  '医生搜索暂时不可用，请重试。': 'Doctor search is temporarily unavailable. Please retry.',
  没有找到匹配的医生: 'No matching doctors',
  开始私信: 'Start direct message',
  最近私信: 'Recent messages',
  一对一同行私信: 'One-to-one peer message',
  开始一段新私信: 'Start a new direct message',
  '发送第一条消息后，会自动保存到最近私信。':
    'After the first message is sent, the conversation will appear in recent messages.',
  私信内容: 'Direct message',
  '输入私信内容…': 'Type a direct message…',
  发送: 'Send',
  '正在发送…': 'Sending…',
  已保存: 'Saved',
  '输入文字，或添加图片、语音和去标识化医学数据…':
    'Type text or add images, audio, and de-identified medical data…',
  内容工具: 'Content tools',
  添加图片: 'Add image',
  图片: 'Image',
  图片数: 'Images',
  录音或上传音频: 'Record or upload audio',
  语音: 'Audio',
  音频: 'Audio',
  添加表情: 'Add emoji',
  表情: 'Emoji',
  添加医学数据: 'Add medical data',
  医学数据: 'Medical data',
  数据卡: 'Data cards',
  待发送图片: 'Image to send',
  '医学数据 · {count} 项': 'Medical data · {count} measurements',
  '正在上传…': 'Uploading…',
  上传失败: 'Upload failed',
  重试上传: 'Retry upload',
  重试: 'Retry',
  删除附件: 'Remove attachment',
  '图片不能超过 5 MB。': 'Images must be 5 MB or smaller.',
  '音频不能超过 10 MB。': 'Audio must be 10 MB or smaller.',
  '每条内容最多添加 4 张图片。': 'You can add up to 4 images.',
  '每条内容只能添加 1 条音频。': 'You can add only 1 audio recording.',
  '当前环境不能直接录音，请上传已有音频。':
    'Recording is unavailable in this environment. Upload an existing audio file instead.',
  '音频不能超过 10 MB。请缩短录音后重试。':
    'Audio must be 10 MB or smaller. Shorten the recording and try again.',
  '未获得麦克风权限。你仍可上传已有音频文件。':
    'Microphone access was not granted. You can still upload an existing audio file.',
  '录音中 {time}': 'Recording {time}',
  录一段语音: 'Record audio',
  '最长 3 分钟，发送前可以试听和删除':
    'Up to 3 minutes. You can review or remove it before sending.',
  停止录音: 'Stop recording',
  停止: 'Stop',
  开始录音: 'Start recording',
  上传已有音频: 'Upload audio',
  关闭录音工具: 'Close audio recorder',
  '仅分享一次去标识化测量，不关联患者档案':
    'Share one de-identified measurement without linking a patient record',
  测量时间: 'Measurement time',
  指标: 'Metric',
  '删除{metric}': 'Remove {metric}',
  添加指标: 'Add metric',
  数据来源: 'Data source',
  手工录入: 'Manual entry',
  '备注（可选）': 'Notes (optional)',
  '我确认内容中没有姓名、患者编号、联系方式或就诊编号':
    'I confirm this content contains no name, patient ID, contact details, or visit ID',
  '请填写有效数值、避免重复指标，并确认已去除身份信息。':
    'Enter valid values, avoid duplicate metrics, and confirm de-identification.',
  取消: 'Cancel',
  添加到内容: 'Add to content',
  收缩压: 'Systolic pressure',
  舒张压: 'Diastolic pressure',
  心率: 'Heart rate',
  血糖: 'Blood glucose',
  '发送失败，请重试。': 'Send failed. Please retry.',
  加载更早消息: 'Load earlier messages',
  '正在加载更早消息…': 'Loading earlier messages…',
  '私信加载失败，请重试。': 'Messages could not be loaded. Please retry.',
  '正在加载设置…': 'Loading settings…',
  '社区为自愿参与，关闭后不影响诊疗工作':
    'Community participation is optional and does not affect clinical work',
  '社区入口已关闭，可在下方重新开启，不影响诊疗工作。':
    'The community entry is off. You can turn it on below without affecting clinical work.',
  '操作未保存，请重试。': 'The action was not saved. Please retry.',
  使用同行社区: 'Use peer community',
  关闭后将同时关闭社区互动通知: 'Turning it off also disables community interaction notifications',
  社区互动通知: 'Community interaction notifications',
  '包括评论、回复、点赞和收藏': 'Includes comments, replies, likes, and bookmarks',
  包括互动消息和举报处理进度: 'Includes interactions and report status updates',
  搜索本圈主题: 'Search this circle',
  新建标签: 'Create tag',
  输入新标签: 'Enter a new tag',
  添加: 'Add',
  选择标签: 'Choose tags',
  新建: 'Create',
  已选: 'Selected',
  '搜索标题、内容或标签': 'Search titles, content, or tags',
  健康教育: 'Health education',
  专业交流: 'Professional exchange',
  '围绕医学实践交流经验，与同行一起发现新的思路。':
    'Share practical experience and explore new ideas with your peers.',
  '专业交流将支持实名或匿名主题讨论、点赞、评论和内容举报。内容仅供专业交流参考，不提供针对具体患者的诊疗方案。临床档案不会自动同步到社区；发布者需手动去标识化并确认共享范围。':
    'Professional exchange will support named or anonymous discussions, likes, comments, and reporting. Content is for professional reference and does not provide care plans for individual patients. Clinical records will never sync automatically; authors must manually de-identify material and confirm its sharing scope.',
  病例讨论: 'Case discussions',
  '在清晰的共享边界内，开展经过脱敏的病例学习。':
    'Learn from de-identified cases within clearly defined sharing boundaries.',
  '病例讨论将与诊疗系统的数据访问隔离。讨论仅供专业学习参考，不构成针对具体患者的诊断或治疗方案。仅可手动整理经授权、去标识化的材料；系统将增加发布检查、审核与举报机制。':
    'Case discussions will have access controls separate from clinical care. Discussions are for professional learning, not diagnosis or treatment of individual patients. Only manually prepared, authorized, de-identified materials may be shared. Publication checks, moderation, and reporting are planned.',
  学术活动: 'Academic events',
  '查看专业学习与学术交流信息，让学习成为日常。':
    'Discover professional learning opportunities and academic events.',
  '学术活动将展示由合适来源发布的活动信息，支持主题关注和个人收藏。活动数据源及报名接口尚未接入。':
    'Academic events will show information from appropriate sources, with topic following and bookmarks. Event feeds and registration services are not connected yet.',
  同行协作: 'Peer collaboration',
  '以专业主题建立联系，在合适的范围内交换经验。':
    'Connect around professional topics and share experience appropriately.',
  '同行协作将支持专业主题小组、邀请、加入或退出小组及消息偏好。任何专家会诊仍通过专门的会诊授权流程开展，不通过社区共享患者记录。':
    'Peer collaboration will support topic groups, invitations, joining and leaving groups, and message preferences. Specialist consultations will continue through their dedicated authorization workflow; patient records will not be shared through the community.',
  医养经验分享: 'Integrated care insights',
  '交流慢病管理、连续照护与医养协同的实践体会。':
    'Share experience in chronic care, continuity of care, and integrated medical and elder care.',
  '经验分享将提供结构化内容编辑、主题标签、收藏和审核。发布内容需去除患者身份及可重新识别的细节。':
    'Experience sharing will offer structured editing, topic tags, bookmarks, and moderation. Published material must remove patient identifiers and details that could allow re-identification.',
  社区消息: 'Community messages',
  '自主决定参与的程度，也可以完全关闭社区消息。':
    'Choose how you participate, with the option to turn off all community messages.',
  '社区消息将支持同行私信，并可单独关闭评论、邀请、私信与活动提醒，或关闭全部社区消息。当前社区消息服务未启用，本地总开关可立即隐藏入口。':
    'Community messaging will support peer messages and separate controls for comments, invitations, direct messages, and event reminders, plus an overall off switch. Messaging is not active. The local switch immediately hides the community entry.',
  医生社区: 'Doctor community',
  '连接同行，分享经验。一个由您自主选择参与的专业交流空间。':
    'Connect with peers and share experience in a professional space you choose to join.',
  '扩展功能 · 尚未上线': 'Extension · Coming soon',
  '好的照护，源于不断交流与学习': 'Better care grows through learning together',
  '我们为医生设计了独立的交流空间。专业讨论与诊疗工作分开授权，社区参与保持自愿，关闭后不影响诊疗工作。':
    'A dedicated space for doctors, with separate authorization for professional discussion and clinical care. Participation is optional; turning it off does not affect your clinical work.',
  '入口已显示。此开关立即生效，仅保存在当前客户端；消息服务尚未启用。':
    'The community entry is visible. This preference takes effect immediately and is saved in this client. Messaging is not active.',
  '社区入口已隐藏。可在此处或个人设置中重新开启。':
    'The community entry is hidden. Turn it back on here or in Settings.',
  '正式上线后将提供独立的社区消息偏好设置。':
    'Separate community message preferences will be available at launch.',
  '为同行连接，预留更多可能': 'More ways to connect with your peers',
  '以下为设计中的社区功能；目前无法发帖、评论或发送消息。':
    'These community features are planned. Posting, commenting, and messaging are not available yet.',
  查看功能设计: 'Explore feature',
  '您的工作台，由您决定': 'Your workspace, your choice',
  '社区入口已关闭。患者管理、在线诊疗与其他医生服务保持可用。':
    'The community entry is off. Patient management, online care, and other doctor services remain available.',
  '重新开启上方开关即可恢复入口。': 'Turn on the switch above to restore the entry.',
  '专业交流，也尊重信息边界': 'Professional exchange with clear information boundaries',
  患者档案不会自动发布或同步到社区:
    'Patient records are never automatically published or synced to the community',
  '分享前手动去标识化，并确认授权范围':
    'Manually de-identify information and confirm authorization before sharing',
  '讨论仅供专业参考，不提供针对具体患者的诊疗方案':
    'Discussions are for professional reference, not individual patient care plans',
  '内容审核、举报与屏蔽能力已纳入后续计划':
    'Content moderation, reporting, and blocking are planned',
  '社区当前展示功能规划，不包含真实帖子、医生互动或外部消息连接。':
    'This community preview contains planned features only, with no real posts, doctor interactions, or external messaging connections.',
};
