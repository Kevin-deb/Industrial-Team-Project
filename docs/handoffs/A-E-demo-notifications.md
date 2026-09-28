# A → E：定时提醒、本地收件箱与实时登录交接

更新：2026-09-28。本次接通 E 已有的提醒任务/发送状态机，由 A 注入本地测试投递器和生命周期调度。没有对外发送真实患者邮件或短信。

## 改了什么

以前在健康页可以保存提醒，但组合入口没有配置发送适配器，后续发送不可用。现在新建提醒记录创建医生，到期由后台复用 HealthService.retryReminder 投递，结果进入持久化患者测试收件箱；关闭重开仍在。界面显示正文、患者 ID、模拟通道、时间和回执，能够核对任务与结果。

健康页默认时间改为当前约 1 分钟后；选择器按浏览器本地时间生成 ISO 时间戳。提醒列表每 5 秒刷新；sent 显示“本地测试收件箱已收到”，不声称真实短信送达。

## 文件与迁移

| 位置                                                       | 用途                                          |
| ---------------------------------------------------------- | --------------------------------------------- |
| apps/api/src/platform/local-notifications.ts               | 本地适配器、权限内收件箱、免打扰计算          |
| apps/api/src/platform/notifications-migration.ts           | v35 回执表：reminder_id 唯一，正文快照        |
| apps/api/src/health/reminder-scheduling-migration.ts       | v36 创建医生、最后尝试时间、到期索引          |
| apps/api/src/health/repository.ts                          | 到期批次查询、中断恢复、尝试时间              |
| apps/api/src/health/service.ts                             | 创建记录 actorId，发送记录最后尝试时间        |
| apps/api/src/app.ts                                        | 注入适配器，启动/停止调度，GET /notifications |
| apps/web/src/shared/workspace-notifications.tsx            | 医生提醒与患者测试收件箱，账号切换清理        |
| apps/web/src/modules/health/RemindersPanel.tsx、queries.ts | 到期时间、真实状态说明及刷新                  |
| packages/contracts/src/notifications.ts                    | 回执/通知中心 DTO                             |

使用当前代码正常启动即可追加迁移，不手工执行单个 SQL。v36 从历史命令回执、计划责任人或患者责任人补齐旧任务创建人；新库的历史样例任务可能没有创建人，不擅自代发，演示请正常创建一条新任务。

## 调度规则

- 仅 local-demo / desktop-demo 运行时启用；测试可传 reminderPollingMs: 0 关闭。
- 启动立即检查，其后默认每 5 秒检查，单进程同一时间只运行一轮。
- 每批最多 25 条到期 planned/failed 任务，最多自动尝试 3 次，相邻失败尝试至少间隔 1 分钟。
- 查询在限制批次前排除不活跃账号、停用医生、已失去患者权限的创建者，防止失权旧任务挤满队列。发送前再次检查权限。
- 超过 5 分钟仍为 pending 的中断尝试标为 failed，再进入可重试流程。
- 关闭应用时停止定时器并等当前轮结束，再关闭数据库。电脑或应用关闭时没有后台常驻发送。
- 回执按 reminder_id 唯一，即使重试更换 commandId 也不会重复生成本地收件记录。外部供应商接入后仍须自行满足持久幂等约定。
- 支持 followup-demo 和 health-record-demo 两个已配置模板；其他模板明确失败，无虚假回执。正文在投递时保存，不随后续模板修改而变化。

创建者失权的任务保留原状态但不发送；本次未实现任务转交界面。如果业务需要转交，请由 E 另行定义授权与责任人转换，勿直接绕过 canReadPatient。

## 接口和偏好

GET /api/v1/notifications 要求真实会话。响应为 {data,meta}，data 含：

- preferences：当前医生的六字段设置。
- quietNow：北京时间当前是否免打扰。
- encounters：按 encounter 开关过滤的授权内待处理问诊。
- reminders：按 followUp 开关过滤的本地送达提醒。
- inbox：授权内最近 100 条患者测试回执，不受医生显示开关影响。

回执字段为 id、reminderId、patientId、channel、templateId、body、deliveredAt、mode；mode 固定 local-test，id 以 LOCAL- 开头。当前模板只包含通用提醒文字，不自动生成临床建议。

医生 browser 与 quietHours 控制设备弹窗，不取消患者任务。免打扰时段跨午夜可用，开始等于结束表示全天。设备弹窗只提示有新工作提醒，不携带患者详情；权限由用户主动开启。社区保留独立通知偏好。

## 浏览器实时通知兼容

浏览器 WebSocket 无法像普通 fetch 一样设置 Authorization 头。现在客户端用子协议 ['carelink','bearer.' + token] 连接 /api/v1/social/events，服务端仅在该端点解析会话凭证，不放入 URL。握手、每次发送、每秒检查都校验会话；注销或到期后以 1008 关闭。Electron 继续使用现有受认证的 IPC 订阅。

请不要恢复测试中的“伪造固定医生”请求头。浏览器回归与回复矩阵已经改为真实密码登录、各自保存会话，方便直接暴露认证集成问题。

## 验证与回退

1. lin.zhiyuan 为 PAT-001 建一分钟后的提醒；到期前收件箱无记录，到期后自动出现一条、状态 sent。
2. 关闭医生 followUp，仍能在患者测试收件箱看到投递，医生提醒列表隐藏。
3. 换 liang.ruochuan，不应看到 PAT-001 的回执；注销后旧会话也不能读取。
4. 关闭重开，回执存在且不重复。失败模板有失败状态，无回执；失权任务不会阻塞后续合法任务。
5. 注销已打开的浏览器实时连接，旧连接关闭且不再收到事件。

自动化证据见 apps/api/test/platform-notifications.test.ts、健康域原有幂等测试、前端通知 hook 测试、真实浏览器回归及 tests/integration/reply-notifications.test.ts。最终数量与结果统一见实施记录。

回退前关闭应用，保留当前库和媒体。v35/v36 已应用的库不可交给旧版强行读取；使用匹配代码与升级前备份。备份/恢复方法见 A-desktop-and-recovery.md。
