/** Owned by the settings module. Keep source keys stable and translate at render time. */
export const settingsMessages: Record<string, string> = {
  邮箱验证: 'Email verification',
  '通过已绑定邮箱完成身份核验与账号恢复。':
    'Verify your identity and recover your account through a linked email address.',
  '邮箱验证将使用独立身份服务发送验证邮件，支持验证码有效期、尝试限制与验证审计。当前未绑定邮箱，也不会发送邮件。':
    'Email verification will use a dedicated identity service, with expiring codes, attempt limits, and audit events. No email is linked, and no message will be sent in this demo.',
  手机验证码: 'SMS verification',
  '短信验证码与多因素验证的预留入口。':
    'A planned entry for SMS codes and multifactor authentication.',
  '手机验证码将接入短信服务，启用重放防护、尝试频率限制及验证审计。此版本未连接短信服务，不会发送验证码。':
    'SMS verification will include replay protection, rate limits, and verification auditing. No SMS service is connected, and this version will not send codes.',
  人脸身份核验: 'Face verification',
  '在明确授权后启用可替代的身份核验方式。':
    'An optional verification method, enabled only with explicit consent.',
  '人脸核验将在明确用户同意、提供替代验证方式及确定数据留存范围后接入。当前没有调用摄像头，也不会采集人脸信息。':
    'Face verification will require explicit consent, alternative methods, and defined data retention. This version does not access your camera or collect facial information.',
  多因素验证: 'Multifactor authentication',
  '结合身份、角色与访问范围保护医疗数据。':
    'Protect medical data through identity, roles, and access scope.',
  '生产环境将增加多因素身份验证、会话管理、角色授权及设备撤销。演示模式使用固定虚构医生身份，不能替代生产身份验证。':
    'Production will add multifactor authentication, session management, role authorization, and device revocation. The fixed fictional demo identity is not production authentication.',
  个人设置: 'Settings',
  '管理您的工作身份、界面偏好与未来的安全设置。':
    'Manage your professional profile, interface preferences, and planned security settings.',
  演示工作空间: 'Demo workspace',
  医生资料: 'Doctor profile',
  'DOCTOR PROFILE · 虚构演示身份': 'DOCTOR PROFILE · Fictional demo identity',
  所属机构: 'Institution',
  所在科室: 'Department',
  医生职称: 'Professional title',
  当前环境: 'Environment',
  '本地演示 · 固定虚构身份': 'Local demo · Fixed fictional identity',
  编辑医生资料: 'Edit doctor profile',
  门诊地点: 'Clinic location',
  个人简介: 'Profile summary',
  资料已保存: 'Profile saved',
  请输入有效的工作邮箱: 'Enter a valid work email',
  请输入有效的联系电话: 'Enter a valid phone number',
  '机构、科室、职称与执业资质属于审核资料，当前只允许编辑联系方式和工作简介。':
    'Institution, department, title, and license credentials require review. Only contact details and profile summary can be edited now.',
  取消: 'Cancel',
  保存资料: 'Save profile',
  '线上诊疗中心 3 诊室': 'Online care center · Room 3',
  '擅长慢病连续管理、在线随访和多学科协作。':
    'Focuses on chronic disease continuity, online follow-up, and multidisciplinary collaboration.',
  '资料编辑将支持更新联系信息与工作资料。机构、科室、职称及执业资质变更需要配置相应的验证和审批流程，当前演示资料不可修改。':
    'Profile editing will support contact and professional details. Institution, department, title, and qualification changes will require verification and approval workflows. The demo profile cannot be edited.',
  '资料编辑 · 尚未上线': 'Edit profile · Coming soon',
  工作台偏好: 'Workspace preferences',
  'PREFERENCES · 本地服务持久保存': 'PREFERENCES · Persisted by the local service',
  '关闭后隐藏侧边栏入口，诊疗功能保持可用。':
    'Turn off to hide the sidebar entry. Clinical features remain available.',
  '同行私信可在本地演示，未连接外部消息服务。':
    'Direct messages work in the local demo; no external messaging service is connected.',
  界面主题: 'Appearance',
  '当前采用适合医疗工作台的浅色风格。': 'A light theme designed for a medical workspace.',
  浅色: 'Light',
  通知偏好: 'Notification preferences',
  已保存: 'Saved',
  '按工作类型管理提醒，并保存在当前设备。':
    'Manage reminders by workflow. Preferences are saved on this device.',
  接诊提醒: 'Consultation reminders',
  '预约前、患者进入诊间和问诊即将超时提醒。':
    'Reminders before appointments, when patients enter the room, and before a consultation times out.',
  随访提醒: 'Follow-up reminders',
  '复诊计划、健康指标异常和待处理随访提醒。':
    'Follow-up plans, abnormal health metrics, and pending follow-up tasks.',
  社区互动通知: 'Community interaction notifications',
  '同行评论、私信和社区互动提醒。': 'Peer comments, direct messages, and community interactions.',
  浏览器提示: 'Browser alerts',
  '允许后在当前浏览器弹出本地提醒。': 'Show local alerts in the current browser when enabled.',
  免打扰时段: 'Quiet hours',
  '开启后，该时段内只保留页面内提示。': 'When enabled, this period only keeps in-page notices.',
  开始: 'Start',
  结束: 'End',
  '接诊、随访与社区通知的独立偏好将在后续接入。':
    'Separate preferences for appointments, follow-up, and community notifications are planned.',
  '接诊安排、健康随访与社区消息将使用独立通知类型。您可以单独管理接收方式及社区消息总开关；当前没有发送站内、短信或邮件通知。':
    'Appointments, health follow-up, and community messages will use separate notification types. Delivery methods and the community switch will be independently configurable. No in-app, SMS, or email notifications are sent now.',
  查看规划: 'View plan',
  账号与安全: 'Account & security',
  'SECURITY · 正式身份验证尚未接入': 'SECURITY · Production authentication not connected',
  了解接入计划: 'Explore planned setup',
  待上线: 'Coming soon',
  '当前固定演示身份用于验证软件结构。邮箱、短信、人脸和生产权限体系均需要独立配置后上线。':
    'The fixed demo identity is used to verify the software structure. Email, SMS, face verification, and production authorization require separate configuration before launch.',
  界面语言: 'Interface language',
  '切换中文或英文，即时生效并保存在此设备。':
    'Choose Chinese or English. Changes apply immediately and are saved on this device.',
  '语言与社区入口偏好可以实际保存；医生资料、身份验证和外部通知设置均为规划入口。':
    'Language and community-entry preferences are saved. Profile editing, authentication, and external notification settings remain planned.',
  '管理您的医生资料、提醒偏好与账号安全。':
    'Manage your doctor profile, reminders, and account security.',
  '按医生账号保存提醒偏好，重新登录后继续生效。':
    'Preferences are saved for your doctor account and remain available after signing in again.',
  '这些开关控制医生收到的提醒，不取消已经安排给患者的提醒。':
    "These switches control the doctor's notices. They do not cancel scheduled patient reminders.",
  '免打扰时间使用北京时间；开始与结束相同表示全天免打扰。':
    'Quiet hours use Beijing time. The same start and end time means quiet hours all day.',
  '无法加载医生设置，请重试。': 'Unable to load your settings. Please retry.',
  '通知偏好保存失败，请重试。': 'Notification preferences could not be saved. Please retry.',
  '医生资料保存失败，请重试。': 'Your profile could not be saved. Please retry.',
  保存通知偏好: 'Save notification preferences',
  '正在保存…': 'Saving…',
  请输入专业方向: 'Enter your specialty',
  '绑定邮箱用于登录和验证，此处不可修改。':
    'Your linked email is used for sign-in and verification and cannot be changed here.',
  '机构、科室、职称与执业资质属于审核资料；绑定邮箱保持不变。':
    'Institution, department, title, and license credentials require review. Your linked email remains unchanged.',
  '此设备尚未允许通知，暂时只显示站内提醒。':
    'Notifications are not permitted on this device. Notices remain available in the app.',
  '此设备不支持系统通知，仍可查看站内提醒。':
    'This device does not support system notifications. Notices remain available in the app.',
  '此设备已允许通知；保存偏好后生效。':
    'This device permits notifications. Save your preferences to apply this change.',
  '此设备未允许通知，暂时只显示站内提醒。':
    'This device has not permitted notifications. Notices remain available in the app.',
  '无法申请通知权限，暂时只显示站内提醒。':
    'Unable to request notification permission. Notices remain available in the app.',
  '开启后允许本地桌面提醒，仍需此设备授予通知权限。':
    'Enable local desktop alerts. Notification permission is also required on this device.',
  '显示当前医生的待接诊与预约提醒。':
    'Show waiting consultations and appointment notices for the current doctor.',
  '显示当前医生的随访任务和健康异常提醒。':
    'Show follow-up tasks and health alerts for the current doctor.',
  演示拍照核验: 'Demo photo check',
  '登录时采集一张演示照片；不执行人脸匹配或活体检测。':
    'Capture a demo photo at sign-in. No face matching or liveness detection is performed.',
  会话与访问范围: 'Session and access scope',
  '当前会话和医生—患者授权共同控制访问。':
    'Your session and doctor–patient authorization determine access.',
  '当前使用本地合成医生账号、一次性邮箱验证码和演示拍照核验。拍照不等于真实人脸识别。':
    'This workspace uses synthetic clinician accounts, one-time email codes, and demo photo checks. A photo check is not facial recognition.',
  '资料、偏好、会话与访问范围由本地数据库保存和控制；演示照片不执行真实人脸识别。':
    'Profiles, preferences, sessions, and access scope are stored and controlled locally. Demo photo checks do not perform facial recognition.',
  'SECURITY · 本地验证与访问控制': 'SECURITY · Local verification and access control',
  已启用: 'Enabled',
  演示功能: 'Demo feature',
  本地合成数据演示: 'Local synthetic data demo',
  医院人员已审核: 'Hospital personnel verified',
  待核验: 'Pending verification',
  待审核: 'Pending review',
  已核验: 'Verified',
  修改密码: 'Change password',
  '旧密码 + 二次验证': 'Current password + verification',
  旧密码: 'Current password',
  新密码: 'New password',
  验证方式: 'Verification method',
  工作邮箱验证码: 'Work email code',
  本地演示邮件验证码: 'Local demo email code',
  邮箱验证码: 'Email code',
  照片已选择: 'Photo selected',
  拍照或上传照片: 'Take or upload a photo',
  验证照片: 'Verification photo',
  '仅 PNG/JPEG，最大 2 MiB；演示核验不执行人脸匹配。':
    'PNG/JPEG only, up to 2 MiB. Demo verification does not perform face matching.',
  '请选择 PNG 或 JPEG 图片。': 'Choose a PNG or JPEG image.',
  '图片不能超过 2 MiB，请选择较小的图片。':
    'Images must be no larger than 2 MiB. Choose a smaller image.',
  '无法读取图片，请重新选择。': 'Unable to read this image. Please choose it again.',
  '至少10位，包含大小写字母、数字和特殊字符':
    'At least 10 characters, including uppercase and lowercase letters, a number, and a symbol',
  '正在提交…': 'Submitting…',
  继续: 'Continue',
  '验证失败，请重试。': 'Verification failed. Please retry.',
  '请检查联系电话、专业方向和资料长度。':
    'Check the phone number, specialty, and profile field lengths.',
  '请检查通知开关和免打扰时间。': 'Check the notification switches and quiet hours.',
  '未找到当前医生资料。': "The current doctor's profile was not found.",
  '旧密码不正确。': 'The current password is incorrect.',
  '新密码至少 10 位，并包含大小写字母、数字和特殊字符，且不能使用常见弱密码。':
    'Use at least 10 characters with uppercase and lowercase letters, numbers, and symbols. Common weak passwords are not allowed.',
  '邮箱验证码不正确。': 'The email code is incorrect.',
  '邮箱验证码已过期。': 'The email code has expired.',
  '邮箱验证码已使用。': 'The email code has already been used.',
  '请先完成邮箱验证和演示拍照核验。': 'Complete email verification and the demo photo check first.',
  '身份验证失败。': 'Identity verification failed.',
  '账号或验证信息不正确。': 'The account or verification details are incorrect.',
  '账号当前不可用。': 'This account is currently unavailable.',
  '请拍摄或上传 PNG/JPEG 图片。': 'Take or upload a PNG/JPEG image.',
};
