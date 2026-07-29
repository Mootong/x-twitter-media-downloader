const $ = (id) => document.getElementById(id);

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
    maxTweets: $("maxTweets").value,
    includeRetweets: $("includeRetweets").checked,
    previewOnly: $("previewOnly").checked
  };
  await chrome.storage.local.set(data);
  return data;
}

async function restoreForm() {
  const data = await chrome.storage.local.get([
    "handle", "startDate", "endDate", "maxTweets", "includeRetweets", "previewOnly", "lastProgress"
  ]);
  $("handle").value = data.handle || "";
  $("startDate").value = data.startDate || "";
  $("endDate").value = data.endDate || "";
  $("maxTweets").value = data.maxTweets || 100;
  $("includeRetweets").checked = Boolean(data.includeRetweets);
  $("previewOnly").checked = data.previewOnly !== false;
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
      setStatus("请输入有效的 X 用户名。");
      return;
    }
    if (data.startDate && data.endDate && data.startDate > data.endDate) {
      setStatus("开始日期不能晚于结束日期。");
      return;
    }

    const tab = await activeTab();
    if (!tab?.id || !/^https:\/\/(x|twitter)\.com\//.test(tab.url || "")) {
      setStatus("请先打开并登录 x.com。");
      return;
    }

    setStatus("正在打开搜索页……");
    const query = [
      `from:${handle}`,
      data.startDate ? `since:${data.startDate}` : "",
      // X 的 until 为排他边界；内容脚本仍会按实际时间再次过滤。
      data.endDate ? `until:${nextDay(data.endDate)}` : "",
      data.includeRetweets ? "" : "-filter:retweets",
      "filter:media"
    ].filter(Boolean).join(" ");
    const url = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
    await chrome.tabs.update(tab.id, { url });
    await waitForTab(tab.id);
    await chrome.tabs.sendMessage(tab.id, {
      type: "START_SCAN",
      options: {
        handle,
        startDate: data.startDate,
        endDate: data.endDate,
        maxTweets: Math.min(1000, Math.max(1, Number(data.maxTweets) || 100)),
        includeRetweets: data.includeRetweets,
        previewOnly: data.previewOnly
      }
    });
    setStatus("扫描已开始。关闭弹窗不会中断。");
  } catch (error) {
    setStatus(`启动失败：${error.message}`);
  }
});

$("stop").addEventListener("click", async () => {
  const tab = await activeTab();
  if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: "STOP_SCAN" }).catch(() => {});
  setStatus("已请求停止。");
});

$("review").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("review.html") });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "SCAN_PROGRESS") return;
  setStatus(message.message);
  $("stats").textContent = JSON.stringify(message.stats || {}, null, 2);
});

function nextDay(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function waitForTab(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

restoreForm();
