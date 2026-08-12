# Chrome Web Store 发布资料

## 基本信息

- 名称：Media Downloader for X
- 默认语言：英语
- 支持语言：英语、简体中文、日语、韩语、西班牙语
- 分类：工具
- 首页：https://github.com/mootong404/x-twitter-media-downloader
- 支持：https://github.com/mootong404/x-twitter-media-downloader/issues
- 隐私政策：https://github.com/mootong404/x-twitter-media-downloader/blob/main/PRIVACY.md

## 简短说明

按用户名和日期扫描 X 上可见的媒体帖子，预览图片与视频，并下载选中的文件。

## 详细说明

Media Downloader for X 是一款非官方浏览器扩展，用于整理和下载你有权保存的
X 媒体内容。

主要功能：

- 通过 Chrome 右侧边栏操作，页面跳转时保持扫描状态可见。
- 从当前 X 用户页、媒体页或帖子地址自动识别用户名。
- 打开指定用户的媒体页面并自动滚动扫描。
- 按起止日期和最大帖子数筛选。
- 获取多图帖子的完整图片列表。
- 为视频选择可用的最高码率 MP4。
- 在独立预览页中逐项选择后下载。
- 按图片或视频过滤预览结果，在媒体信息列显示图片原始分辨率或视频码率。
- 跟踪选中项目的下载完成状态，并在本次下载全部结束后显示结果汇总。
- 将文件保存到以用户名命名的下载子目录。
- 导出 CSV 或 JSON 扫描报告。
- 在本地保存最近使用的用户名和扫描设置。

图片、MP4 和扫描功能无需外部服务。HLS/DASH 合并是可选功能，需要用户自行
运行开源本地辅助程序，并在使用时单独授予 localhost 权限。

扩展不会把扫描结果上传到开发者服务器，不包含广告、跟踪或分析服务。

请仅下载你拥有或获准保存的媒体，并遵守适用法律及来源服务条款。本扩展与
X Corp. 无关联，也未获得其认可。

## 单一用途

扫描用户指定的 X 媒体帖子，供用户预览并下载其选择且有权保存的图片和视频。

## 权限用途

- `downloads`：保存用户在预览页中选择的图片和视频。
- `storage`：在本地保存设置、用户名历史、扫描进度和结果。
- `sidePanel`：在 Chrome 侧边栏中显示扫描设置和进度。
- `x.com`、`twitter.com`：只在 X 页面读取用户主动要求扫描的媒体帖子。
- 可选 `127.0.0.1:17863`：仅在用户选择 HLS/DASH 项目时连接本机辅助程序。

## Privacy Practices 建议

应披露：

- Website content：媒体帖子、作者用户名、帖子 ID、日期及媒体 URL。
- Personally identifiable information：用户输入或页面中出现的用户名。

说明这些数据只在本地处理和存储，不上传开发者服务器，不用于广告、分析、
画像或转售。不要声明读取浏览器历史、身份验证信息或私人通信。

## 审核测试步骤

1. 使用已登录 X 的 Chrome 测试环境。
2. 打开一个公开且媒体页有内容的用户页面，例如 `https://x.com/<用户名>`。
3. 点击扩展图标，确认右侧边栏打开且已自动填入当前页面的用户名。
4. 保持日期留空，将最大帖子数设为 10，点击“开始扫描”。
5. 扩展会打开该用户的 `/media` 页面，右侧边栏保持打开并显示扫描状态。
6. 等待扫描完成并自动打开预览页。
7. 验证多图帖子显示多个媒体项目。
8. 选择一个图片或 MP4 项目并点击下载。
9. 验证文件保存到 `Downloads/<用户名>/`。

HLS/DASH 是依赖外部本地辅助程序的可选功能，不是核心审核步骤。

## 发布前素材

- `store-assets/store-icon-128x128.png`：128×128 商店图标。
- `store-assets/01-side-panel-scan-1280x800.png`：右侧边栏与用户名自动识别。
- `store-assets/02-scan-progress-1280x800.png`：帖子、图片和视频扫描统计。
- `store-assets/03-media-preview-1280x800.png`：媒体数量、类型过滤与媒体信息。
- `store-assets/04-download-complete-1280x800.png`：下载完成与评分提示。
- `store-assets/promo-small-440x280.png`：440×280 小型宣传图。
- `store-assets/promo-marquee-1400x560.png`：1400×560 顶部宣传图。
- `store-assets/product-description-en.txt`：可直接粘贴的英文产品详情描述。

商店后台应为 `en`、`zh_CN`、`ja`、`ko`、`es` 分别填写本地化详细说明和截图。
扩展名称、简短说明和界面字符串已通过 `_locales` 随包提供。
详细说明的五种语言模板位于 `docs/STORE_LISTING_LOCALIZATIONS.md`。
