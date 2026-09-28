export const platformMessages: Record<string, string> = {
  '照片读取失败，请重新选择': 'The photo could not be read. Please select it again.',
  '您有一条随访提醒，请与负责医生确认后续随访安排。':
    'You have a follow-up reminder. Contact your doctor to confirm the next appointment.',
  '请按既定健康计划记录本次健康数据，并在需要时联系负责医生。':
    'Please record your health data according to your existing care plan and contact your doctor if needed.',
  '请选择 PNG 或 JPEG 图片': 'Choose a PNG or JPEG image',
  '照片不能超过 2 MiB，请压缩后重试':
    'Photos must be 2 MiB or smaller. Compress the image and try again.',
  诊疗工作提醒: 'Clinical work notifications',
  工作提醒暂时无法加载: 'Work notifications could not be loaded',
  '当前为免打扰时段，站内提醒仍保留。':
    'Quiet hours are active. In-app notifications are still available.',
  暂无诊疗工作提醒: 'No clinical work notifications',
  本地提醒已送达: 'Reminder delivered locally',
  患者测试收件箱: 'Patient test inbox',
  '仅在本机投递，不向真实患者发送短信或邮件。医生提醒开关不影响患者任务投递。':
    'Delivery stays on this computer. No real patient receives SMS or email. Doctor notification preferences do not cancel patient delivery.',
  测试收件箱暂无消息: 'The test inbox is empty',
  模拟通道: 'Simulated channel',
  '本地业务演示 · 合成数据': 'Local workflow demo · Synthetic data',
  本地业务演示: 'Local workflow demonstration',
  当前账号的问诊安排: 'Appointments for this account',
  按实际预约日期排序: 'Sorted by appointment date',
  接诊与记录保存已接通: 'Encounters and record saving are connected',
  浏览工作流程: 'Explore workflows',
  '通过患者、问诊、病历和健康页面完成本地业务操作。':
    'Use patients, encounters, records and health pages to complete local workflows.',
  本地服务状态: 'Local service capabilities',
  '登录、业务保存和审计在本机运行；照片为演示核验，患者提醒进入测试收件箱。视频通话与真实人脸识别仍未接入。':
    'Login, persistence and auditing run locally. Photos use demo verification and reminders go to the test inbox. Video calls and biometric face matching are not connected.',
  '本机测试通道会在到期后投递，可在通知中心查看患者测试收件箱。':
    'The local test channel delivers due reminders. Open the patient test inbox in Notifications.',
  本地测试收件箱已收到: 'Received in the local test inbox',
  '保存后到期自动投递到本机测试收件箱，不发送真实短信或邮件。':
    'Saved reminders are delivered to the local test inbox when due. No real SMS or email is sent.',
  医生资料与提醒偏好: 'Doctor profile and notification preferences',
  '按当前登录医生的授权范围汇总患者、问诊、病历和健康任务。':
    'Patient, encounter, record and health summaries for the signed-in doctor.',
  '支持授权范围内的检索、疾病和状态筛选与分页。':
    'Scoped patient search with condition/status filters and pagination.',
  '密码、测试邮箱验证码、会话撤销和患者范围已接通；照片仅演示采集核验，未接入人脸识别或短信验证码。':
    'Password and test-email sign-in, session revocation and patient scope are connected. Photos are a capture demonstration; biometric matching and SMS codes are not connected.',
  '合成患者建档、保存、历史、分组、批量状态、归档与转交。':
    'Synthetic patient registration, saving, history, grouping, batch status, archiving and transfer.',
  '本地接诊、图文消息、状态保存与会话文本导出；不代表已连接真实患者客户端。':
    'Local encounter messages, saved states and text export; no real patient client is connected.',
  '当前只有本机摄像头预览；双端音视频、录制存储和回放尚未实现，不标记媒体已保存。':
    'Local camera preview only. Two-party calls, recording and playback are unfinished; media is not marked saved.',
  '本地提交、审核、归档、修订、医嘱及固定病历版本的会诊材料引用。':
    'Local record submission, review, archiving, correction, orders and versioned consultation references.',
  '创建、受邀讨论、报告汇编、成员鉴权及完成后撤权已接通；病历选段正文阅读和真实媒体仍待 C/D 完善。':
    'Consultation creation, discussion, report compilation, membership checks and completion revocation work locally. Shared record sections and real media remain unfinished.',
  '合成观察值、趋势、计划版本与评估可保存；真实医院和设备数据未接入。':
    'Synthetic observations, trends, plan versions and assessments persist. Real hospital and device data are not connected.',
  '到期任务自动进入持久化本地患者测试收件箱；短信和邮件为本地模拟通道，不向真实患者发送。':
    'Due reminders reach a persistent local patient test inbox. SMS and email are simulated locally, with no real patient delivery.',
  '当前医生的真实访问与操作记录，支持服务端筛选、分页及 CSV 导出。':
    'The current doctor’s access and operation records with server filtering, pagination and CSV export.',
  '医生资料和通知偏好按账号保存在数据库；免打扰控制设备弹窗，站内记录仍保留。':
    'Profile and notification preferences persist per account. Quiet hours suppress device popups while retaining in-app records.',
  '可选本地社区支持内容、回复和实时通知，保留独立启用开关，不自动共享临床数据。':
    'Optional local community with posts, replies, realtime notifications and a separate opt-in; clinical data is not shared automatically.',
};
