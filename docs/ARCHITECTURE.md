# 架构说明

## 组件

```text
X 页面
  │
  ├─ interceptor.js（MAIN world）
  │    捕获 fetch/XHR GraphQL JSON
  │
  └─ content.js（isolated world）
       扫描推文 DOM、按 tweetId 合并视频 variants
                │
                ▼
background.js（Service Worker）
  ├─ Chrome Downloads：图片、完整 MP4
  ├─ chrome.storage：扫描结果和状态
  └─ localhost helper：HLS/DASH
                │
                ▼
review.html / review.js
  预览、勾选、下载、CSV/JSON 报告
```

## 数据流

1. `popup.js` 生成 X 搜索条件并启动扫描。
2. `interceptor.js` 在主世界读取 GraphQL 响应，通过受来源检查的
   `window.postMessage` 发送视频 variants。
3. `content.js` 从 DOM 得到推文 ID、日期和图片，将 variants 按推文 ID 合并。
4. 对 MP4 按码率降序选取最高质量；没有 MP4 时保留 HLS/DASH 清单。
5. 扫描结果通过 `background.js` 保存并在 `review.html` 展示。
6. 图片和 MP4 使用 Chrome Downloads API；HLS/DASH 发送给回环辅助服务。

## 稳定边界

- Chrome 扩展 API 属于相对稳定边界。
- X DOM 选择器及 GraphQL JSON 属于不稳定边界，应集中在
  `content.js` 和 `interceptor.js` 中维护。
- FFmpeg 命令封装在 `helper/media_helper.py`，扩展不直接执行本地命令。
