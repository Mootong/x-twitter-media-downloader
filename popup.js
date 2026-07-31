const $ = (id) => document.getElementById(id);
const { t, localizeDocument } = window.xmdI18n;
localizeDocument();

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setStatus(text) {
  $("status").textContent = text;
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
  const data = await chrome.storage.local.get([
    "handle", "handleHistory", "startDate", "endDate", "maxTweets", "lastProgress"
  ]);
  $("handle").value = data.handle || "";
  renderHandleHistory(data.handleHistory || []);
  $("startDate").value = data.startDate || "";
  $("endDate").value = data.endDate || "";
  $("maxTweets").value = data.maxTweets || 100;
  if (data.lastProgress) {
    setStatus(data.lastProgress.message);
    $("stats").textContent = JSON.stringify(data.lastProgress.stats || {}, null, 2);
  }
}

$("start").addEventListener("click", async () => {
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
  $("stats").textContent = JSON.stringify(message.stats || {}, null, 2);
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
