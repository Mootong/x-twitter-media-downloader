const pendingDownloadFilenames = new Map();
const PENDING_SCAN_KEY = "pendingScan";
const startingScanTabs = new Set();

configureSidePanel();

function configureSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.warn("Could not configure the side panel:", error));
}

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  const filename = takePendingFilename(downloadItem.url) ||
    takePendingFilename(downloadItem.finalUrl);
  if (filename) {
    suggest({ filename, conflictAction: "uniquify" });
  } else {
    suggest();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "NAVIGATE_AND_START_SCAN") {
    startScanNavigation(message).then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: error.message })
    );
    return true;
  }

  if (message.type === "DOWNLOAD_MEDIA") {
    downloadWithFilename(message.url, message.filename).then(
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  resumePendingScan(tabId, tab).catch((error) => {
    saveScanStartupError(error);
  });
});

async function startScanNavigation(message) {
  if (!message.tabId || !message.url || !message.options) {
    throw new Error(t("scanArgsIncomplete"));
  }
  const data = await chrome.storage.local.get("handleHistory");
  const handle = String(message.options.handle || "").trim().replace(/^@/, "");
  const handleHistory = [
    handle,
    ...(data.handleHistory || []).filter(
      (item) => item.toLowerCase() !== handle.toLowerCase()
    )
  ].slice(0, 20);
  await chrome.storage.local.set({
    handle,
    handleHistory,
    [PENDING_SCAN_KEY]: {
      tabId: message.tabId,
      url: message.url,
      options: message.options,
      requestedAt: new Date().toISOString()
    }
  });
  await chrome.tabs.update(message.tabId, { url: message.url });
}

async function resumePendingScan(tabId, tab) {
  if (startingScanTabs.has(tabId)) return;
  startingScanTabs.add(tabId);
  try {
    const data = await chrome.storage.local.get(PENDING_SCAN_KEY);
    const pending = data[PENDING_SCAN_KEY];
    if (!pending || pending.tabId !== tabId) return;
    if (!samePage(tab?.url || "", pending.url)) {
      await chrome.storage.local.remove(PENDING_SCAN_KEY);
      throw new Error(t("mediaPageOpenFailed"));
    }

    await chrome.storage.local.remove(PENDING_SCAN_KEY);
    const result = await chrome.tabs.sendMessage(tabId, {
      type: "START_SCAN",
      options: pending.options
    });
    if (!result?.ok) throw new Error(result?.error || t("contentScanStartFailed"));
  } finally {
    startingScanTabs.delete(tabId);
  }
}

function samePage(actual, expected) {
  try {
    const actualUrl = new URL(actual);
    const expectedUrl = new URL(expected);
    return actualUrl.hostname === expectedUrl.hostname &&
      actualUrl.pathname.replace(/\/+$/, "").toLowerCase() ===
        expectedUrl.pathname.replace(/\/+$/, "").toLowerCase();
  } catch (_) {
    return false;
  }
}

async function saveScanStartupError(error) {
  const message = t("startupFailed", error.message);
  await chrome.storage.local.set({
    lastProgress: {
      type: "SCAN_PROGRESS",
      message,
      stats: { error: error.message },
      phase: "failed"
    }
  });
  chrome.runtime.sendMessage({
    type: "SCAN_PROGRESS",
    message,
    stats: { error: error.message },
    phase: "failed"
  }).catch(() => {});
}

async function downloadItem(item) {
  const filename = downloadFilename(item);
  if (item.kind === "image" || item.kind === "mp4") {
    const downloadId = await downloadWithFilename(item.url, filename);
    return { ok: true, downloadId };
  }

  if (item.kind === "hls" || item.kind === "dash") {
    const response = await fetch("http://127.0.0.1:17863/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: item.url,
        filename: filename.replace(/\.(m3u8|mpd)$/i, ".mp4")
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || t("helperHttpError", response.status));
    return { ok: true, helper: true, jobId: payload.jobId };
  }
  throw new Error(t("unsupportedMediaType", item.kind));
}

function downloadFilename(item) {
  const handle = sanitizePathSegment(item.handle || "unknown");
  const basename = sanitizePathSegment(
    String(item.filename || `${item.tweetId || "media"}.${item.kind === "image" ? "jpg" : "mp4"}`)
      .split(/[\\/]/)
      .pop()
  );
  return `${handle}/${basename}`;
}

function sanitizePathSegment(value) {
  return String(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

async function downloadWithFilename(url, filename) {
  rememberPendingFilename(url, filename);
  try {
    return await chrome.downloads.download({
      url,
      filename,
      conflictAction: "uniquify",
      saveAs: false
    });
  } catch (error) {
    removePendingFilename(url, filename);
    throw error;
  }
}

function rememberPendingFilename(url, filename) {
  const queue = pendingDownloadFilenames.get(url) || [];
  queue.push(filename);
  pendingDownloadFilenames.set(url, queue);
}

function takePendingFilename(url) {
  const queue = pendingDownloadFilenames.get(url);
  if (!queue?.length) return "";
  const filename = queue.shift();
  if (!queue.length) pendingDownloadFilenames.delete(url);
  return filename;
}

function removePendingFilename(url, filename) {
  const queue = pendingDownloadFilenames.get(url);
  if (!queue?.length) return;
  const index = queue.indexOf(filename);
  if (index >= 0) queue.splice(index, 1);
  if (!queue.length) pendingDownloadFilenames.delete(url);
}

function t(key, substitutions) {
  const values = Array.isArray(substitutions)
    ? substitutions.map(String)
    : substitutions == null ? undefined : String(substitutions);
  return chrome.i18n.getMessage(key, values) || key;
}
