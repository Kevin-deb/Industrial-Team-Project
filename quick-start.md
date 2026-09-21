# CareLink 本地快速启动

以下命令都在项目根目录执行。这里只启动本地开发版，不会打包，也不会上传 GitHub。

## macOS：当前电脑直接复制

```bash
cd "/Users/panjingyu/Documents/ChatGPT/Industrial-Proj/Industrial-Team-Project"
export PATH="/Users/panjingyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
npm run dev
```

`npm run dev` 会先重新构建前端、API 和桌面端，然后打开 CareLink 窗口。平时改完代码后，优先用这一条。

## 本地演示登录

登录需要依次完成密码、邮箱验证码和演示拍照三个步骤。邮箱验证码会显示在本地演示界面中；拍照步骤可以使用摄像头或上传 PNG/JPEG，但不会执行真实的人脸匹配或活体检测。

所有演示医生的初始密码均为：`123456`。这是课程演示账号的统一初始密码，不应在生产环境使用。

| 账号 | 工作邮箱 | 身份 |
| --- | --- | --- |
| `lin.zhiyuan` | `lin.zhiyuan@carelink.demo` | 林知远 |
| `zhou.ming` | `zhou.ming@carelink.demo` | 周明 |
| `xu.qing` | `xu.qing@carelink.demo` | 许清 |
| `liang.ruochuan` | `liang.ruochuan@carelink.demo` | 梁若川 |
| `shen.anning` | `shen.anning@carelink.demo` | 沈安宁 |

五名医生绑定了不同的患者授权范围，不能通过修改请求头访问其他医生的患者。所有账号、证件、患者及临床数据均为虚构数据。

### 启用真实 SMTP 邮件

未配置 SMTP 时，验证码显示在本地演示登录页。配置以下环境变量后，验证码会通过 SMTP 发送，登录页不再显示验证码：

```bash
export CARELINK_SMTP_HOST="smtp.qq.com"
export CARELINK_SMTP_PORT="465"
export CARELINK_SMTP_SECURE="true"
export CARELINK_SMTP_USER="你的QQ邮箱@qq.com"
export CARELINK_SMTP_PASS="QQ邮箱生成的SMTP授权码"
export CARELINK_SMTP_FROM="CareLink <你的QQ邮箱@qq.com>"
npm run dev
```

QQ 邮箱使用 `smtp.qq.com:465` 和 TLS。`CARELINK_SMTP_PASS` 必须填写 QQ 邮箱生成的 SMTP 授权码，而不是 QQ 登录密码。授权码只通过环境变量提供，不写入代码或数据库。`CARELINK_SMTP_USER`/`FROM` 是系统发件邮箱；验证码的收件地址始终来自当前用户注册并验证的邮箱。

修改密码和找回密码均支持“邮箱验证码”或“演示拍照”作为第二步。修改密码还必须先验证旧密码；找回密码不要求旧密码。成功设置新密码后，该账号此前的全部登录会话都会失效。新密码要求 10–72 位，同时包含大写字母、小写字母、数字和特殊字符，并拒绝 `123456`、`password`、`qwerty` 等常见弱密码。

如果刚刚已经构建完成，只想更快地再次打开：

```bash
npm start
```

## 第一次在新电脑运行

需要 Node.js `24.14.0` 或更高的 24.x 版本。不要使用 Node 25。

```bash
node --version
npm ci
npm run dev
```

`npm ci` 第一次运行需要联网下载依赖和 Electron；以后正常启动不需要重复安装依赖。

## Windows PowerShell

先把路径替换成 Windows 上实际的项目位置：

```powershell
Set-Location "C:\path\to\Industrial-Team-Project"
node --version
npm ci
npm run dev
```

依赖已经安装且项目已经构建时，可以只运行：

```powershell
npm start
```

## 启动前做完整检查（可选）

```bash
npm run check
```

该命令会检查模块边界、TypeScript、自动化测试，并重新构建项目。它不会打包或上传代码。
