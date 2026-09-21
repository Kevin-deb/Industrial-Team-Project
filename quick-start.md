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

所有演示医生的密码均为：`CareLink-Demo-2026`

| 账号 | 工作邮箱 | 身份 |
| --- | --- | --- |
| `lin.zhiyuan` | `lin.zhiyuan@carelink.demo` | 林知远 |
| `zhou.ming` | `zhou.ming@carelink.demo` | 周明 |
| `xu.qing` | `xu.qing@carelink.demo` | 许清 |
| `liang.ruochuan` | `liang.ruochuan@carelink.demo` | 梁若川 |
| `shen.anning` | `shen.anning@carelink.demo` | 沈安宁 |

五名医生绑定了不同的患者授权范围，不能通过修改请求头访问其他医生的患者。所有账号、证件、患者及临床数据均为虚构数据。

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
