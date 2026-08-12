const $ = (id) => document.getElementById(id);
const { t, localizeDocument } = window.xmdI18n;
const { detectHandleFromUrl } = window.xmdUrlHandle;
localizeDocument();

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setStatus(text) {
  $("status").textContent = text;
}

function renderStats(stats = {}) {
  const container = $("stats");
  const values = {
    tweets: Math.max(0, Number(stats.tweets) || 0),
    images: Math.max(0, Number(stats.images) || 0),
    videos: Math.max(0, Number(stats.videos) || 0),
    skippedVideos: Math.max(0, Number(stats.skippedVideos) || 0)
  };

  container.replaceChildren();
  container.hidden = values.tweets + values.images + values.videos + values.skippedVideos === 0;
  if (container.hidden) return;

  const title = document.createElement("p");
  title.className = "stats-title";
  title.textContent = t("scanSummaryLabel");
  container.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "stats-grid";
  for (const [value, labelKey] of [
    [values.tweets, "scannedPostsLabel"],
    [values.images, "foundImagesLabel"],
    [values.videos, "foundVideosLabel"]
  ]) {
    const item = document.createElement("div");
    item.className = "stat-item";
    const number = document.createElement("strong");
    number.textContent = String(value);
    const label = document.createElement("span");
    label.textContent = t(labelKey);
    item.append(number, label);
    grid.appendChild(item);
  }
  container.appendChild(grid);

  if (values.skippedVideos > 0) {
    const note = document.createElement("p");
    note.className = "stats-note";
    note.textContent = t("skippedVideosSummary", values.skippedVideos);
    container.appendChild(note);
  }
}

async function saveForm() {
  const data = {
    handle: $("handle").value,
    startDate: $("startDate").value,
    endDate: $("endDate").value,
    maxTweets: $("maxTweets").value
  };
  await chrome.storage.local.set(data);
  return data;
}

async function restoreForm() {
  const [data, tab] = await Promise.all([
    chrome.storage.local.get([
      "handle", "handleHistory", "startDate", "endDate", "maxTweets", "lastProgress"
    ]),
    activeTab()
  ]);
  const detectedHandle = detectHandleFromUrl(tab?.url || "");
  $("handle").value = detectedHandle || data.handle || "";
  renderHandleHistory(data.handleHistory || []);
  $("startDate").value = data.startDate || "";
  $("endDate").value = data.endDate || "";
  $("maxTweets").value = data.maxTweets || 100;
  if (data.lastProgress?.phase === "running") {
    setStatus(data.lastProgress.message);
    renderStats(data.lastProgress.stats);
  }
}

async function autoFillHandleFromActiveTab() {
  const tab = await activeTab();
  const detectedHandle = detectHandleFromUrl(tab?.url || "");
  if (detectedHandle) $("handle").value = detectedHandle;
}

$("start").addEventListener("click", async () => {
  renderStats();
  try {
    const data = await saveForm();
    const handle = data.handle.trim().replace(/^@/, "");
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
      setStatus(t("invalidUsername"));
      return;
    }
    if (data.startDate && data.endDate && data.startDate > data.endDate) {
      setStatus(t("invalidDateRange"));
      return;
    }

    const tab = await activeTab();
    if (!tab?.id || !/^https:\/\/(x|twitter)\.com\//.test(tab.url || "")) {
      setStatus(t("loginPrompt"));
      return;
    }

    setStatus(t("openingMediaPage"));
    const url = `https://x.com/${encodeURIComponent(handle)}/media`;
    const result = await chrome.runtime.sendMessage({
      type: "NAVIGATE_AND_START_SCAN",
      tabId: tab.id,
      url,
      options: {
        handle,
        startDate: data.startDate,
        endDate: data.endDate,
        maxTweets: Math.min(1000, Math.max(1, Number(data.maxTweets) || 100))
      }
    });
    if (!result?.ok) throw new Error(result?.error || t("scanCouldNotStart"));
    setStatus(t("scanQueued"));
  } catch (error) {
    setStatus(t("startupFailed", error.message));
  }
});

$("stop").addEventListener("click", async () => {
  const tab = await activeTab();
  if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: "STOP_SCAN" }).catch(() => {});
  setStatus(t("stopRequested"));
});

$("review").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("review.html") });
});

$("handleHistory").addEventListener("change", (event) => {
  if (event.target.value) $("handle").value = event.target.value;
  event.target.selectedIndex = 0;
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "SCAN_PROGRESS") return;
  setStatus(message.message);
  renderStats(message.stats);
});

chrome.tabs.onActivated.addListener(() => {
  autoFillHandleFromActiveTab().catch(() => {});
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === "complete")) {
    autoFillHandleFromActiveTab().catch(() => {});
  }
});

function renderHandleHistory(history) {
  const select = $("handleHistory");
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("historyPlaceholder");
  select.appendChild(placeholder);
  for (const handle of history) {
    const option = document.createElement("option");
    option.value = handle;
    option.textContent = `@${handle}`;
    select.appendChild(option);
  }
  $("handleHistoryLabel").hidden = history.length === 0;
}

restoreForm();
