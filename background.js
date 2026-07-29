chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "DOWNLOAD_MEDIA") {
    chrome.downloads.download({
      url: message.url,
      filename: message.filename,
      conflictAction: "uniquify",
      saveAs: false
    }).then(
      (downloadId) => sendResponse({ ok: true, downloadId }),
      (error) => sendResponse({ ok: false, error: error.message })
    );
    return true;
  }

  if (message.type === "DOWNLOAD_ITEM") {
    downloadItem(message.item).then(
      (result) => sendResponse(result),
      (error) => sendResponse({ ok: false, error: error.message })
    );
    return true;
  }

  if (message.type === "SAVE_RESULTS") {
    chrome.storage.local.set({
      scanResults: message.items,
      scanMeta: message.meta,
      scanSavedAt: new Date().toISOString()
    }).then(() => {
      if (message.openReview) chrome.tabs.create({ url: chrome.runtime.getURL("review.html") });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "SCAN_PROGRESS") {
    chrome.storage.local.set({ lastProgress: message });
  }
});

async function downloadItem(item) {
  if (item.kind === "image" || item.kind === "mp4") {
    const downloadId = await chrome.downloads.download({
      url: item.url,
      filename: item.filename,
      conflictAction: "uniquify",
      saveAs: false
    });
    return { ok: true, downloadId };
  }

  if (item.kind === "hls" || item.kind === "dash") {
    const response = await fetch("http://127.0.0.1:17863/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: item.url,
        filename: item.filename.replace(/\.(m3u8|mpd)$/i, ".mp4")
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `辅助服务返回 ${response.status}`);
    return { ok: true, helper: true, jobId: payload.jobId };
  }
  throw new Error(`不支持的媒体类型：${item.kind}`);
}
