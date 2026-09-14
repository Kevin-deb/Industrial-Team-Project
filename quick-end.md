# CareLink 本地快速终止

## 1. 正常结束（推荐）

回到运行 `npm run dev` 或 `npm start` 的终端，按：

```text
Control + C
```

终端可能显示 `exited with signal SIGINT` 或 npm 生命周期退出提示。这是手动停止应用时的正常现象，不代表代码出错。

## 2. macOS：确认是否还有本项目进程

```bash
ps -ax -o pid=,command= | grep '[I]ndustrial-Team-Project/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
```

没有输出就表示 CareLink 本地 Electron 进程已经结束。

如果窗口或进程没有正常退出，先发送普通终止信号：

```bash
pkill -TERM -f '/Users/panjingyu/Documents/ChatGPT/Industrial-Proj/Industrial-Team-Project/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
```

再次运行上面的 `ps` 命令确认。只有普通终止无效时，才使用强制终止：

```bash
pkill -KILL -f '/Users/panjingyu/Documents/ChatGPT/Industrial-Proj/Industrial-Team-Project/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
```

`KILL` 会让进程立即退出，可能来不及完成正在进行的本地写入，因此只能作为最后手段。

## 3. Windows PowerShell：只终止本项目 Electron

在项目根目录执行：

```powershell
$ProjectRoot = (Get-Location).Path
$ElectronPath = Join-Path $ProjectRoot 'node_modules\electron\dist\electron.exe'
$CareLinkProcesses = Get-Process electron -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -eq $ElectronPath }
$CareLinkProcesses | Stop-Process
```

确认是否仍有本项目进程：

```powershell
Get-Process electron -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -eq $ElectronPath }
```

如果仍然存在，再执行强制终止：

```powershell
$CareLinkProcesses = Get-Process electron -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -eq $ElectronPath }
$CareLinkProcesses | Stop-Process -Force
```

不要使用 `pkill Electron`、`killall Electron` 或 `taskkill /IM electron.exe`。这些命令可能同时关闭 VS Code、Teams 或其他 Electron 软件。
