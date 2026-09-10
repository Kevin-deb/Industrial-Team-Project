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
  '资料编辑将支持更新联系信息与工作资料。机构、科室、职称及执业资质变更需要配置相应的验证和审批流程，当前演示资料不可修改。':
    'Profile editing will support contact and professional details. Institution, department, title, and qualification changes will require verification and approval workflows. The demo profile cannot be edited.',
  '资料编辑 · 尚未上线': 'Edit profile · Coming soon',
  工作台偏好: 'Workspace preferences',
  'PREFERENCES · 当前设备本地保存': 'PREFERENCES · Saved on this device',
  '关闭后隐藏侧边栏入口，诊疗功能保持可用。':
    'Turn off to hide the sidebar entry. Clinical features remain available.',
  '消息服务尚未启用。': 'Messaging is not active.',
  界面主题: 'Appearance',
  '当前采用适合医疗工作台的浅色风格。': 'A light theme designed for a medical workspace.',
  浅色: 'Light',
  通知偏好: 'Notification preferences',
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
  '语言与社区入口偏好可以实际保存；医生资料、身份验证和通知设置均为规划入口。':
    'Language and community-entry preferences can be saved locally. Profile editing, authentication, and notifications are planned features.',
};
