# A 设置功能交接

更新日期：2026-09-28。此文描述已实现的设置接口、页面和通知中心消费方式，测试结果见末尾。

## 改了什么

医生资料和通知偏好现在保存到当前医生对应的 SQLite 记录，重新登录、关闭重开后保留。前端不再读取或写入旧的固定资料/通知 localStorage 键，因此切换医生不会继承前一位医生的资料。旧缓存不自动迁移，避免无法确定其所属账号时写错人。

联系方式、专业方向、门诊地点和简介可编辑。绑定邮箱只读，保持与登录、验证码邮件使用的邮箱一致。机构、科室、职称、执业资质不在本次接口的可写范围。

## 文件与注册

- 契约：`packages/contracts/src/preferences.ts`。
- 迁移：`apps/api/src/platform/settings-migration.ts`，版本 33，增加 doctors.outpatient_location、doctors.bio 和 doctor_notification_preferences。
- 存储与接口：同目录 settings-repository.ts、settings-routes.ts。
- 页面与中英文：`apps/web/src/modules/settings/`。
- 集成由 A 在 contracts/platform barrel、数据库迁移表、app.ts 中注册。

注册签名：

```ts
const settings = new SqliteSettingsRepository(db);
registerSettingsRoutes(app, settings, context);
```

无需单独复制迁移 SQL。使用当前代码启动时，统一数据库入口追加执行新迁移；不修改旧版本迁移。

## 接口

所有接口均要求有效会话，身份来自会话。以下路径均以 `/api/v1` 开头。

| 方法和路径                  | 用途                                 |
| --------------------------- | ------------------------------------ |
| GET /settings/profile       | 获取当前医生资料                     |
| PUT /settings/profile       | 保存全部四个可写资料字段             |
| GET /settings/notifications | 获取当前医生提醒偏好，首次返回默认值 |
| PUT /settings/notifications | 保存全部六个偏好字段                 |

资料更新示例：

```json
{
  "phone": "13800000099",
  "specialty": "心血管慢病管理",
  "outpatientLocation": "线上诊室 2",
  "bio": "合成演示医生资料"
}
```

响应为标准 `{data,meta}`，data 包括以上字段及 identityId、email、emailVerifiedAt、updatedAt。phone 可空，否则为 6–20 位电话字符；specialty 去除首尾空白后不能为空、最多 120 字符；门诊地点最多 200 字符，简介最多 2000 字符。身份、邮箱等额外写入字段返回 400，不能借请求体或 x-actor-id 修改其他医生。

通知偏好示例：

```json
{
  "encounter": true,
  "followUp": true,
  "browser": false,
  "quietHours": true,
  "quietStart": "21:00",
  "quietEnd": "08:00"
}
```

默认值同示例。时间使用北京时间，格式 HH:mm；开始等于结束表示全天免打扰。服务端校验时间格式，不接受 24:00。GET 响应 data 是偏好对象本身。

401 表示无有效会话；400 表示字段格式/额外字段无效；404 SETTINGS_NOT_FOUND 表示当前医生资料不存在。页面保存失败会保留输入并允许重试，只有收到成功响应才提示保存成功。

## 提醒消费者怎样接入

服务端读取 `settings.notificationPreferences(actorId)`；前端读取 GET /settings/notifications。encounter、followUp 控制医生侧提醒展示；browser 和 quietHours 控制设备弹窗。免打扰时仍保留站内提醒。医生偏好不取消发给患者的任务，也不修改 reminder_tasks。

保存通知偏好成功后页面派发：

```ts
new CustomEvent('carelink-notification-preferences-changed', {
  detail: { identityId, preferences },
});
```

通知中心已经监听该事件并立即重新读取 GET /notifications；如果请求正在进行，会在当前请求结束后补取最新状态。切换账号时立即清空旧数据、取消旧请求，并忽略迟到的旧账号回包。社区通知继续使用原有社区偏好接口，不混入这里的六字段对象。

用户开启 browser 时页面申请 Notification 权限；设备拒绝或不支持时明确说明只保留站内提醒，不宣称已获准弹窗。browser=true 是账号偏好，并不代表每台设备均已授权。

## 审计

资料保存产生 settings.profile.update；偏好保存产生 settings.notifications.update。targetType 为 doctor_settings，targetId 为当前医生身份。修改和审计在同一事务中：审计写入失败会回滚业务修改。日志仅记录动作元数据，不包含手机号、邮箱或简介正文。

## 怎样验证

1. 医生甲登录，打开设置，修改电话和简介并保存；刷新、关闭重开后仍显示新值。
2. 注销后用医生乙登录，其资料和通知偏好不变；甲的旧本地缓存不影响乙。
3. 尝试在资料 PUT 中加入 email 或 identityId，预期 400；不带令牌访问设置，预期 401。
4. 调整提醒开关，保存后打开通知中心观察对应变化；患者已安排任务仍存在。
5. 拒绝设备通知权限，设置页应显示只保留站内提醒。
6. 模拟保存失败，输入保留且不显示已保存；恢复后重试成功。
7. 改密采用演示照片时选择超过 2 MiB 文件，页面在读取和提交前拒绝；PNG/JPEG 限制与公共照片契约一致。

已执行结果：API 设置测试 3/3 通过，界面测试 5/5 通过，web TypeScript 检查通过。API 测试使用独立临时库/内存库，覆盖真实会话、身份隔离、非法字段、重启持久化、患者任务不受偏好影响及审计失败回滚。界面测试覆盖保存失败重试、旧缓存不消费、设备拒绝或权限 API 抛错提示、切换账号、中英文和超限照片。通知中心生命周期另有 5/5 界面测试通过，覆盖旧账号异步回包隔离、偏好变更立即刷新、免打扰/关闭设备通知保留收件箱，以及设备弹窗失败不影响站内数据。

可复跑入口：

```powershell
npx tsx --test apps/api/test/settings.test.ts
npm run test -w @doctor/web -- src/modules/settings/settings.test.tsx src/shared/workspace-notifications.test.tsx
npm run typecheck -w @doctor/web
```

真实会话浏览器回归已 19/19 通过，包含保存设置后通知中心立即更新、患者测试收件箱仍可见。社区实时链路回归 10/10 通过（含父测试统计）：双医生评论/回复通知矩阵，以及匿名 WebSocket 拒绝、注销后已有连接关闭 1008 且停止接收。安装包行为以全组最终回归为准，单独设置测试不替代安装包验收。

## 限制与回退

当前仍为本机合成数据环境。绑定邮箱变更需要另外设计验证码确认流程；演示照片不执行人脸匹配。通知中心已按以上规则接入，并受设备权限影响；系统弹窗异常只影响弹窗，不阻断站内提醒与患者测试收件箱。

版本 33 新增数据库结构。回退代码前先关闭软件并保留当前库与媒体副本；旧版可能拒绝读取较新迁移记录，应配套使用升级前的独立演示数据备份，不手改 schema_migrations。
