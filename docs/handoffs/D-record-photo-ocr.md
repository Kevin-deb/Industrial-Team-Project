# 纸质病历拍照识别：使用与交接

本次只扩展电子病历编辑器，以及该功能必需的前端依赖、离线资源构建和桌面资源权限。没有修改患者管理、问诊、医嘱、认证等业务逻辑；不新增数据库字段或迁移，现有数据与 API 保持兼容。

## 用户怎么使用

1. 打开「电子病历」，新建病历或进入有编辑权限的草稿，选择正确的患者和模板。
2. 点击「拍照识别病历」，允许摄像头后拍摄；也可上传 JPG、PNG、WebP 图片（最大 12 MB）。摄像头不可用时直接上传。
3. 图片保持文字朝上、完整、清晰；必要时点击顺时针旋转。点击「开始识别」，等待本机识别完成。可随时取消或关闭。
4. 对照原图核对「识别原文」和「待填入内容」。原文改正后点击「重新提取字段」。门诊、随访、会诊模板均支持明确的字段标题。
5. 默认只选择原表单为空且识别有结果的字段。覆盖已有内容必须逐项勾选；超长内容需手动精简后才能填入，不会静默截断。
6. 勾选「我已核对当前患者及识别内容」，点击「填入病历草稿」，最后使用原有「保存草稿」。填入不会自动保存、提交审核或开立医嘱。

识别只读取纸上内容，不生成诊断或用药建议，不自动选择患者。清晰中英文印刷体是本轮验证范围；手写、反光、模糊和复杂表格可能识别不准。没有明确标题的文字保留在识别原文，可人工复制或补充。

演示可使用 [合成纸质病历图片](../demo-assets/ocr-synthetic-record.png)：直接上传，或先打印再用摄像头拍摄。示例不含真实患者身份信息，开始前仍须手动选择演示患者。

## 成员 D 接手时需要知道

- 入口在 apps/web/src/modules/records/RecordEditor.tsx，仅可编辑且未保存中的病历显示。新组件 RecordPhotoImport.tsx 管理拍照、图片、核对和填入；只通过 onApply 返回标题、诊断、body 部分字段。
- 患者 ID、就诊关联、模板、权限和保存接口由原编辑器继续管理。切换患者、模板、病历或版本会卸载识别状态，终止识别和摄像头，避免内容串到其他病历。
- 已手填字段默认不选中；用户手动改变原字段后，旧的替换授权失效，并要求重新核对。
- ocr/parse-record-text.ts 只做明确标题匹配，模板目录中的字段优先。添加模板字段时可在解析器添加常用纸面别名，并补解析测试。不要在解析器推断诊断、剂量或否定词。
- 图片、识别原文仅在页面内存中使用；关闭识别后释放，不保存在数据库、浏览器存储或日志。只有确认填入并按原流程保存的病历字段持久化，继续享有原有权限、版本与审计。

## 成员 A 的构建与桌面兼容说明

安装依赖仍使用仓库原有 npm ci；开发 npm run dev:web、完整构建 npm run build、目录包 npm run package:dir 均走原入口。首次安装依赖需要获取 npm 包，运行时不需要网络或 OCR 密钥。

apps/web 的 predev/prebuild 自动从锁定版本 npm 包复制 worker、WASM 的基线/SIMD/relaxed SIMD 版本及中英文模型到 public/ocr；该生成目录不入 Git，构建后进入 dist，桌面构建照常复制完整 renderer。不要单独复制 exe 或仅更新主 JS 而漏掉 ocr 目录。

识别使用 Tesseract.js 7.0.0，模型为 @tesseract.js-data/chi_sim 和 eng 1.0.0；workerPath、corePath、langPath 均指定本地资源，禁用模型缓存和外网回退。资源路径设计参考 [Tesseract.js 官方本地加载说明](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)。

桌面协议只增加同源 Worker 和 WASM MIME；仅 /ocr/worker.min.js 响应允许 wasm-unsafe-eval，普通页面保留原脚本限制，没有开放远程网络、Node 集成或任意脚本执行。

图片预处理限制解码后 4,000 万像素、最长边 2,400 像素，再送入独立 worker。整个流程有 120 秒超时；取消、超时、错误、切换患者和关闭面板均清理工作线程或忽略失效结果。摄像头仅请求视频，不请求麦克风。

## 复测入口

- 前端 npm run test -w @doctor/web，新增解析、识别取消与资源限制、核对界面和编辑器上下文测试。
- 桌面 npm run test -w @doctor/desktop，新增 OCR 专属 CSP 与 WASM MIME 检查。
- 构建后 npm run test:e2e -- tests/e2e/record-ocr.spec.ts，使用合成中文病历图片跑真实识别、保存重开、手填保护、只读限制、摄像头抓帧及拒绝回退。
- 构建后 npm run test:desktop -- tests/desktop/record-ocr.spec.ts，验证 carelink:// 自定义协议下真实识别及应用重启持久化；设置 CARELINK_TEST_EXECUTABLE 可复测目录包。

本次实际验收结果见 [OCR 验收记录](../test-reports/record-photo-ocr-2026-09-28.md)。
