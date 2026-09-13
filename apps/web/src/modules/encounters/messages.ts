/** Owned by the encounters module. Keep source keys stable and translate at render time. */
export const encountersMessages: Record<string, string> = {
  '· 尚未上线': '· Coming soon',
  待接诊: 'Waiting',
  已预约: 'Booked',
  '有序接诊，从容沟通。让优质的医疗服务跨越距离。':
    'Stay organized and communicate with confidence, bringing quality care closer.',
  预约管理: 'Manage appointments',
  演示接诊安排: 'Demo appointments',
  查看当前工作队列: 'Your current work queue',
  等待接诊: 'Awaiting care',
  包含待响应与已约定时段: 'Includes pending responses and agreed time windows',
  接诊功能尚未接入: 'Care workflow not yet connected',
  视频预约: 'Video appointments',
  音视频服务将在后续接入: 'Audio and video services are planned',
  已完成记录: 'Completed visits',
  虚构历史诊疗安排: 'Fictional historical appointments',
  全部接诊: 'All appointments',
  搜索患者或就诊原因: 'Search patient or visit reason',
  搜索患者或接诊编号: 'Search patient or appointment ID',
  就诊方式: 'Visit type',
  视频问诊: 'Video consultation',
  图文问诊: 'Text consultation',
  预约时间: 'Appointment time',
  接诊时段: 'Care window',
  接诊日期: 'Date',
  接诊时间: 'Time',
  服务规则: 'Service rule',
  '就诊事由：': 'Visit reason: ',
  '预计 {minutes} 分钟': 'Estimated {minutes} minutes',
  '48小时内最多20条消息': 'Up to 20 messages within 48 hours',
  按时段接诊: 'Time-slot visit',
  '图文问诊将在服务窗口内沟通，患者与医生按消息条数完成交流。':
    'Text consultations happen within the service window, with patient and doctor communicating by message quota.',
  '视频问诊按约定时段进入诊室，改期需先通知患者并等待确认。':
    'Video consultations use an agreed time slot. Rescheduling starts with a patient notification and confirmation.',
  查看接诊详情: 'View appointment',
  没有符合条件的接诊安排: 'No matching appointments',
  '调整筛选条件查看其他演示记录。': 'Adjust your filters to view other demo records.',
  '更自然的在线沟通，即将到来': 'More natural online conversations, coming soon',
  '图文消息、视频通话、经授权的录音录像及诊后随访已纳入开发计划。当前可浏览演示接诊安排。':
    'Text and image messaging, video calls, authorized recording, and follow-up are planned. You can currently browse demo appointments.',
  接诊详情: 'Appointment details',
  '{value0} · 演示安排': '{value0} · Demo appointment',
  预约时长: 'Duration',
  '{value0} 分钟': '{value0} minutes',
  预约日期: 'Appointment date',
  就诊事由: 'Visit reason',
  视频诊室: 'Video consultation room',
  图文诊室: 'Text consultation room',
  'RTC 服务、设备检测、患者知情同意与诊室访问控制将在后续接入。':
    'Real-time communication, device checks, patient consent, and consultation-room access controls will be added in a later iteration.',
  '消息发送、附件上传、送达状态与离线提醒将在后续接入。':
    'Messaging, attachments, delivery status, and offline notifications will be added in a later iteration.',
  '当前页面用于浏览预约信息，不会发起通话或发送诊疗消息。':
    'This page displays appointment information. It does not start calls or send clinical messages.',
  'Iteration 1 实现基础图文接诊，Iteration 3 接入图像、视频与会诊协作。预约管理聚焦设置可接诊时段、患者通知与改期确认；医生不确认预约人选。':
    'Iteration 1 delivers basic text consultations; Iteration 3 adds images, video, and specialist collaboration. Appointment management focuses on availability, patient notifications, and reschedule confirmation; doctors do not approve which patients can book.',
  '医生发起改期通知后，由患者确认是否接受；双方达成一致后，平台自动调整接诊时段并留下审计记录。':
    'After a doctor sends a reschedule notice, the patient confirms whether to accept it. Once both sides agree, the platform updates the care window and records an audit event.',
  '图文与视频诊疗使用统一接诊编号，与病历、知情同意及审计记录关联。第三方通信服务通过独立适配器接入。':
    'Text and video visits share a common encounter ID linked to records, consent, and audit events. Independent adapters will connect external communication services.',
};
