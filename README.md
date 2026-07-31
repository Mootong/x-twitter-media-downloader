# Media Downloader for X

这是一个非官方 Manifest V3 Chrome 扩展，用于按用户和日期范围扫描、预览并下载用户有权保存的 X 图片与视频。

## 离线安装

1. 打开 Chrome，访问 `chrome://extensions`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录 `x-twitter-media-downloader`。
5. 登录 `https://x.com`，打开任意 X 页面后点击扩展图标。

下载内容默认保存到浏览器下载目录中的：

`<用户名>/`

请仅下载你拥有或获准保存的媒体，并遵守适用法律及 X 的服务条款。本扩展与
X Corp. 无关联，也未获得其认可。

## 当前能力

- 根据 Chrome 界面语言提供英语、简体中文、日语、韩语和西班牙语界面。
- 指定用户名。
- 保存最近使用的用户名并支持下拉选择。
- 指定开始和结束日期（均包含当天）。
- 自动打开目标用户的媒体页面。
- 自动滚动并扫描一定数量的推文。
- 严格校验媒体所属作者和推文 ID，排除转推及引用内容。
- 图片使用 `name=orig` 请求原始尺寸。
- 在页面主世界拦截 `fetch`/XHR，解析 X GraphQL 响应中的完整媒体列表和视频 variants。
- 自动选择码率最高的 MP4。
- MP4 不存在时识别 HLS (`m3u8`) 或 DASH (`mpd`)。
- 扫描后进入独立预览页，可全选、全不选或逐项勾选。
- 导出 UTF-8 CSV 或 JSON 下载报告。
- 记住上次输入和扫描状态。

## HLS/DASH 辅助服务

HLS/DASH 分片不能直接通过 Chrome 下载 API 合并。扩展附带一个仅监听
`127.0.0.1:17863` 的 Python 辅助服务，它调用 FFmpeg 合并分片。

1. 安装 Python 3。
2. 安装 FFmpeg，并确保命令行执行 `ffmpeg -version` 成功。
3. 双击 `helper/start-helper.cmd`。
4. 保持命令窗口运行，然后在预览页下载 HLS/DASH 项。

辅助服务仅接受来源为 `chrome-extension://` 的请求，只允许 X 媒体域名，
并将结果写入 `Downloads/<用户名>/`。

首次下载 HLS/DASH 项目时，Chrome 会单独请求访问本机
`127.0.0.1:17863` 的可选权限。拒绝该权限不会影响图片和 MP4 下载。

也可手动启动：

```powershell
python helper/media_helper.py
```

## 工作原理

1. 打开 `x.com/<用户名>/media`，由页面天然限定目标用户。
2. 页面主世界脚本只读取 X 返回的 GraphQL JSON，不修改响应，并缓存完整媒体列表。
3. 内容脚本再次校验作者、日期和推文 ID，并排除引用推文中的媒体。
4. 按推文 ID 将完整图片列表和视频 variants 与页面中的推文关联。
5. MP4 按 `bitrate` 降序选择第一项；否则保留 HLS/DASH 清单地址。
6. 扫描结果写入扩展本地存储并打开预览页。

## 已知限制

- X 的页面结构不是公开稳定 API，网站改版后选择器可能需要更新。
- 媒体页从最新内容开始加载；扫描很早的日期范围时需要滚动更久。
- GraphQL 响应结构是 X 的内部实现，未来改版后解析逻辑可能需要更新。
- 只有扫描期间加载到的 GraphQL 响应能被捕获；已经在启动扫描前加载的推文可能只有 DOM 媒体信息。
- FFmpeg 是否能合并取决于清单是否仍有效，以及 X 是否要求额外请求头或 Cookie。
- 媒体页内容是否完整加载由 X 决定；受登录状态、账户权限、限流、删除/保护推文等影响。
- 扩展只处理当前账户有权浏览的内容，不绕过登录、隐私或访问控制。
- 浏览器可能一次触发大量下载；如果 Chrome 询问是否允许多个文件，请选择允许。

## 下一步建议

若需要调试，可在 X 页面开发者工具中查看内容脚本日志，并打开
`http://127.0.0.1:17863/health` 检查辅助服务和 FFmpeg 状态。

请遵守 X 的服务条款、内容版权和当地法律，不要高频抓取或转载无权使用的内容。

## 项目开发

项目维护入口：

- `docs/ARCHITECTURE.md`：组件边界与数据流。
- `docs/ROADMAP.md`：后续功能优先级。
- `docs/SECURITY.md`：权限和本地服务安全边界。
- `PRIVACY.md`：公开隐私政策。
- `docs/CHROME_WEB_STORE.md`：商店文案、披露和审核测试步骤。
- `docs/STORE_LISTING_LOCALIZATIONS.md`：五种语言的商店详情文案。
- `CONTRIBUTING.md`：分支、提交、验证和发布约定。
- `CHANGELOG.md`：版本变更记录。

安装 Node.js 18 或更高版本后执行：

```powershell
npm run validate
npm run package
```

发布包生成到 `dist/`。版本号必须同时出现在 `manifest.json` 与
`package.json`，可使用 `npm run release:patch`、`release:minor` 或
`release:major` 更新。
