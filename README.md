# X/Twitter Media Downloader

这是一个 Manifest V3 Chrome 扩展，用于按用户和日期范围扫描、预览并下载 X/Twitter 搜索结果中的图片与视频。

## 离线安装

1. 打开 Chrome，访问 `chrome://extensions`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录 `twitter-media-downloader`。
5. 登录 `https://x.com`，打开任意 X 页面后点击扩展图标。

下载内容默认保存到浏览器下载目录中的：

`X-Media/<用户名>/`

## 当前能力

- 指定用户名。
- 指定开始和结束日期（均包含当天）。
- 自动打开 X 的“最新”搜索结果。
- 自动滚动并扫描一定数量的推文。
- 图片使用 `name=orig` 请求原始尺寸。
- 在页面主世界拦截 `fetch`/XHR，解析 X GraphQL 响应中的视频 variants。
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
并将结果写入 `Downloads/X-Media/<用户名>/`。

也可手动启动：

```powershell
python helper/media_helper.py
```

## 工作原理

1. 使用 `from:用户名 since:日期 until:日期 filter:media` 打开最新搜索结果。
2. 页面主世界脚本只读取 X 返回的 GraphQL JSON，不修改响应。
3. 按推文 ID 将 variants 与页面中的推文关联。
4. MP4 按 `bitrate` 降序选择第一项；否则保留 HLS/DASH 清单地址。
5. 扫描结果写入扩展本地存储并打开预览页。

## 已知限制

- X 的页面结构不是公开稳定 API，网站改版后选择器可能需要更新。
- GraphQL 响应结构是 X 的内部实现，未来改版后解析逻辑可能需要更新。
- 只有扫描期间加载到的 GraphQL 响应能被捕获；已经在启动扫描前加载的推文可能只有 DOM 媒体信息。
- FFmpeg 是否能合并取决于清单是否仍有效，以及 X 是否要求额外请求头或 Cookie。
- 搜索结果是否完整由 X 决定；受登录状态、账户权限、限流、删除/保护推文等影响。
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
