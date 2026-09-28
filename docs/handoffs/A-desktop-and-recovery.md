# 成员 A 交接：桌面验证与资料备份恢复

本次修改由成员 A 负责桌面运行、内部传输、演示验证和恢复工具。没有修改 B 的患者业务规则，也没有修改 C/D/E 的业务页面。桌面冒烟测试通过公开页面和 API 验证跨模块连接。

## 改了什么

- 认证照片上传与共享契约保持一致：原图最大 2 MiB；协议按 Base64 后长度加 16 KiB JSON 余量处理。仅照片核验、照片改密及照片找回密码三个 POST 接口采用该限额，普通请求仍限制 1 MiB。请求体按流计数，超限即停止读取。
- 实时通知在每次发送前重新验证会话；注销、改密、过期后停止投递并退订，快速切换账号只保留最后一次选择。
- 桌面通知权限只允许来自应用自己的页面；外部来源、其他未授权权限继续拒绝，通知开关由用户在设置中主动启用。
- 桌面测试使用真实账号密码登录，验证权限隔离、资料保存、患者建档、审计、注销后旧令牌失效、完整重启后数据保留、中英文切换。全部使用独立资料目录，窗口始终隐藏；不写日常数据库。
- 浏览器测试服务使用独立端口 3109 和内存数据库，以公开健康检查判断启动完成，不复用已启动的日常服务。
- 新增备份、校验和恢复工具。SQLite 使用自带一致性备份 API，包含已提交 WAL 数据；不复制活动数据库的单一主文件。备份包含数据库及社区媒体，清单记录每个文件的大小和 SHA-256。
- 桌面与备份工具使用共同的资料目录锁。请先退出 CareLink 再备份；应用仍运行时工具拒绝备份。崩溃遗留锁只在确认原进程已不存在时自动清理。
- 恢复前检查文件清单、校验和、数据库完整性、外键及媒体引用。只能恢复到不存在或空的独立目录，保留原资料目录；不会覆盖原库或合并现有资料。

## 今天怎么验证

在仓库根目录运行，先完成依赖安装和构建：

```powershell
npm run check
npm run test:desktop
node --import tsx --test tests/integration/backup-profile.test.ts
```

桌面测试会在 `runtime/desktop-test-*` 下创建独立测试资料，可在测试结束后人工检查。它不会打开用户可见窗口，不会截取需显示窗口的截图。不要把自动生成的测试目录提交到 Git。

备份测试已经实际验证：有活动 WAL 的 SQLite 快照可恢复、附件逐字节保留、原数据库记录保留、非空目标拒绝、嵌套目录拒绝、清单路径穿越拒绝、文件篡改拒绝、缺失媒体拒绝，以及应用持有资料锁时拒绝备份。

## 备份当前演示数据

先正常退出 CareLink。下例备份输出是新目录；若目录已有内容，请换一个新名称。

```powershell
node --import tsx scripts/backup-profile.ts backup --profile "$env:APPDATA\CareLink Doctor" --output ".\runtime\backups\before-demo"
node --import tsx scripts/backup-profile.ts verify --backup ".\runtime\backups\before-demo"
```

若通过 `CARELINK_PROFILE_PATH` 使用独立演示资料，请把 `--profile` 改成该资料目录。工具输出 `status: verified` 才表示全部检查完成。备份内容：

- `data/doctor.sqlite`：数据库一致性快照。
- `data/social-media/`：社区图片和音频。
- `manifest.json`：版本、时间、范围及文件校验值。

备份范围是业务数据库和社区媒体。界面语言、浏览器缓存、浏览器登录缓存不在此范围内，恢复后重新登录并选择语言。备份包含演示账号数据，应与项目数据一样妥善保存。

## 恢复到独立目录并检查

```powershell
node --import tsx scripts/backup-profile.ts restore --backup ".\runtime\backups\before-demo" --target ".\runtime\restored-demo"
$env:CARELINK_PROFILE_PATH = (Resolve-Path ".\runtime\restored-demo").Path
npm start
```

这是用户主动打开独立恢复资料的正常桌面启动。确认能登录、患者记录存在、社区图片/音频正常后，正常退出应用。之后在 PowerShell 中取消覆盖即可回到日常资料：

```powershell
Remove-Item Env:CARELINK_PROFILE_PATH
```

这里仅取消环境变量，不删除任何文件。原资料和备份都保留。不要使用 `CARELINK_TEST_MODE` 做日常启动，它会隐藏窗口。

## 给其他成员的接口说明

- B：桌面测试新增真实患者建档，用公开接口和页面验证；患者授权、版本和归属仍由 B 的服务决定。
- C/D：内部协议继续原样传递 Authorization、If-Match、Idempotency-Key；普通请求上限没有改变。
- E：社区附件独立上传上限保持原值。备份会同时检查数据库中的媒体记录和实际附件，缺失附件会明确失败，避免产生“能恢复数据库但图片丢失”的假成功。
- 后续新增持久文件：若数据放在 `data/social-media` 之外，需要同步扩展备份范围、清单版本和恢复测试。

## 验证记录

2026-09-28，Node.js 24.14.0：

- 桌面协议与实时订阅单元测试：15 / 15 通过，包含每次事件重新验会话、注销/改密/过期退订及快速切账号竞态。
- 备份恢复集成测试：5 / 5 通过，包含真实 CLI 往返，以及完整 CareLink 资料恢复后的真实登录、资料、授权患者和受保护媒体读取。
- 桌面 TypeScript 检查：通过。
- 源代码构建的隐藏窗口桌面冒烟：3 / 3 通过，43.6 秒；另补真实 CSV 下载用例单独通过。
- 最终 Windows 目录包真实可执行文件：3 / 3 通过，46.4 秒；真实登录、资料与患者保存、审计、真实 CSV 下载并读取文件内容、注销撤销、跨医生范围、关闭重开和中英文导航均已验证。

## 本机压力验证

`scripts/platform-load-test.ts` 只使用独立内存 SQLite，扩充到 1,000 条合成患者和 10,000 条初始审计记录，通过真实密码登录取得令牌，再调用本地服务。它不打开网络端口、不接触日常库，也不发送邮件。

```powershell
node --import tsx scripts/platform-load-test.ts
```

默认依次运行 1 / 5 / 10 并发，每段 60 秒；每个工作任务请求后等待 20 毫秒。请求约 80% 为患者分页、15% 为审计分页、5% 为医生资料保存。保存后检查返回内容、最终资料及写入审计数量。快速检查可用：

```powershell
node --import tsx scripts/platform-load-test.ts --seconds 0.4 --output runtime/platform-load-quick.json
```

完整报告默认保存为 `runtime/platform-load-report.json`，包含机器规格、代码提交与是否有未提交修改、数据量、每段 p50/p95、非预期错误、写次数、内存与 CPU。读请求 p95 ≤ 500 毫秒且非预期错误为 0 是本次演示的拟定门槛，不代表医院级容量。此工具有固定请求间隔，使用内存库，结果也不代表桌面界面耗时、磁盘持久化吞吐或最大并发能力。患者/病历的版本冲突保护由另外的功能测试验证。

请在桌面测试和构建结束后单独运行压力验证，避免其他工作干扰测量。短跑结果只能证明工具正常运行，不替代默认三分钟完整验证。

最终目录包通过 `npm run package:dir` 生成，保留完整 `release/win-unpacked/` 目录，不能只复制其中的 exe。安装程序（NSIS）本次未重新生成。
