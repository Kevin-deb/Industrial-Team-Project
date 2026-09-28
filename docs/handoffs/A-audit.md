# A 审计功能交接

本次把“最近 100 条日志的前端筛选”和“导出占位按钮”改成了真正的服务端查询、分页和 CSV 文件导出。默认只看当前登录医生，不能指定或冒用别人的身份。

## 展示步骤

1. 登录，访问患者或执行一个操作，然后进入“操作审计”。
2. 填写操作名称、结果、对象类型或本机时间范围，点击“查询”。界面统计为全部匹配日志，不是当前页行数。
3. 使用上一页、下一页或每页 20/50/100 条浏览；后台支持超过 100 条历史记录。
4. 点击“导出日志”，会生成 CSV。导出使用已经点击查询的条件，涵盖所有匹配页。Excel 可以识别中文；危险公式开头会作为文本处理。
5. 重置条件后查询操作名称 audit.export，可以看到这次生成文件的记录。它记录文件生成，不宣称用户已在电脑保存或打开文件。
6. 切换到另一个医生，不能查到前一个医生的日志。

## 接口与兼容

- GET /api/v1/audit：data 仍是 AuditEvent 数组，保留旧响应结构；meta 新增 page、pageSize、total、summary、domains。默认 page=1、pageSize=20，上限 100。
- 筛选 q 为操作、对象编号、事件编号、描述的字面子串；action 为操作名子串；domain 为 targetType 精确匹配；outcome 为 success/denied/planned/failed。多个条件共同生效。
- from、to 必须为包含时区的 ISO 时间，边界包含在内；数据库按真实时间比较，不按文本字面排列。示例：2026-09-28T08:00:00+08:00。
- GET /api/v1/audit/export 使用相同筛选字段，不接受分页字段。返回带 UTF-8 BOM 的 text/csv 和附件文件名。
- 不接受 actorId 等额外参数。数据身份仅来自验证后的 RequestContext。默认查询对象类型选项也只来自当前医生，避免泄露其他账号使用了哪些模块。
- 导出最多 50,000 行；超限返回 413，要求缩小范围，绝不静默截断。
- 成功生成 CSV 后追加 audit.export/success；范围错误或超限为 denied；生成异常尽可能记录 failed。本次导出的审计记录写入在内容快照之后，因此不会出现在同一个文件里。
- ownAudit(actorId) 保留原来的最近 100 条，供仪表盘兼容；完整审计页面使用独立 queryAudit/exportAudit 方法。

## 队友如何记录操作

调用 platform.recordAccess，提供 actorId、action、targetType、targetId、outcome、description；occurredAt 可选，未提供则使用服务端时间。身份从当前会话取，不信任前端传入医生编号。

描述只写必要元数据，例如“会诊材料上传成功”“HTTP 409”“请求编号”，不要存密码、验证码、token、病历正文、聊天全文、邮件正文或图片。业务失败用 failed，权限/范围拒绝用 denied，尚未执行的预留能力用 planned，不要把失败当成功。

A 的公共 C 路由审计由 app.ts 统一接入。审计导出路由已经自行写审计，公共钩子不要再次为同一次导出写入成功记录。B/D/E 原有审计调用兼容。

## 文件和接线

- apps/api/src/platform/repository.ts：分页、筛选、完整导出查询以及 failed 写入。
- apps/api/src/platform/audit-routes.ts：查询/CSV 路由、输入校验、公式防护、导出审计。
- apps/api/src/platform/audit-evolution-migration.ts：迁移 34，保留旧事件，加入 failed 约束和排序索引；勿改写已发布迁移 1。
- packages/contracts/src/audit.ts：共享查询、分页统计契约。原 platform.ts 的 AuditEvent.outcome 增加 failed。
- apps/web/src/modules/audit/：真实查询、下载、详情和中英文界面。
- app.ts 接 registerAuditRoutes(app, { platform, context })，取代旧 GET /audit；数据库迁移列表登记 auditEvolutionMigration；公共 barrel 导出新增契约/迁移/路由。

## 验证结果

专项 API 测试 7 项通过：125 条跨页与准确总数、不同医生隔离、带时区时间边界、非法参数/日期、CSV 全量与公式防护、历史迁移保留、50,001 条超限拒绝、真实会话未登录/退出保护与伪造身份头无效。

前端专项测试 3 项通过：真实请求下一页、提交条件并携带会话导出全部匹配页、失败时不显示成功。API 与 Web 类型检查通过。

复现：node --import tsx --test apps/api/test/audit.test.ts；在 apps/web 运行 vitest run src/modules/audit/audit.test.tsx。

审计说明中的“域”目前表示对象类型 targetType，未另建机构级分类。此功能没有跨医生管理员查询、日志删除或正式合规留存策略。它不能补回过去没有记录的操作；新增公共审计从接线后开始生效。
