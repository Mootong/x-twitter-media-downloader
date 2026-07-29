let items = [];
const rows = document.getElementById("rows");

async function load() {
  const data = await chrome.storage.local.get(["scanResults", "scanMeta", "scanSavedAt"]);
  items = data.scanResults || [];
  document.getElementById("summary").textContent =
    `${items.length} 个媒体项目 · ${data.scanSavedAt ? new Date(data.scanSavedAt).toLocaleString() : "无扫描时间"}`;
  document.getElementById("helper").textContent = items.some((item) => item.kind === "hls" || item.kind === "dash")
    ? "检测到 HLS/DASH：下载前请运行 helper/media_helper.py，并确保 FFmpeg 可用。"
    : "全部项目均可由浏览器直接下载。";
  render();
}

function render() {
  rows.textContent = "";
  items.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.dataset.index = index;
    const preview = item.kind === "image"
      ? `<img class="thumb" src="${escapeHtml(item.url)}" loading="lazy">`
      : `<video class="thumb" src="${escapeHtml(item.kind === "mp4" ? item.url : "")}" muted preload="metadata"></video>`;
    tr.innerHTML = `
      <td><input class="pick" type="checkbox" ${item.selected !== false ? "checked" : ""}></td>
      <td>${preview}</td>
      <td>${escapeHtml(item.date)}</td>
      <td>${escapeHtml(item.kind)}</td>
      <td>${item.bitrate ? `${Math.round(item.bitrate / 1000)} kbps` : "—"}</td>
      <td class="url"><a href="${escapeHtml(item.tweetUrl)}" target="_blank">${escapeHtml(item.tweetId)}</a></td>
      <td class="status">待处理</td>`;
    tr.querySelector(".pick").addEventListener("change", (event) => {
      items[index].selected = event.target.checked;
    });
    rows.appendChild(tr);
  });
}

document.getElementById("selectAll").addEventListener("click", () => setSelection(true));
document.getElementById("selectNone").addEventListener("click", () => setSelection(false));
document.getElementById("toggleAll").addEventListener("change", (event) => setSelection(event.target.checked));

document.getElementById("download").addEventListener("click", async () => {
  const selected = items.map((item, index) => ({ item, index })).filter(({ item }) => item.selected !== false);
  for (const { item, index } of selected) {
    const status = rows.querySelector(`tr[data-index="${index}"] .status`);
    status.textContent = "处理中…";
    status.className = "status";
    const result = await chrome.runtime.sendMessage({ type: "DOWNLOAD_ITEM", item });
    status.textContent = result?.ok ? (result.helper ? "已提交辅助服务" : "已开始下载") : `失败：${result?.error || "未知错误"}`;
    status.className = `status ${result?.ok ? "ok" : "error"}`;
  }
});

document.getElementById("exportJson").addEventListener("click", () => {
  exportBlob("x-media-report.json", JSON.stringify(items, null, 2), "application/json");
});

document.getElementById("exportCsv").addEventListener("click", () => {
  const columns = ["selected", "handle", "date", "tweetId", "kind", "bitrate", "tweetUrl", "url", "filename"];
  const csv = [
    columns.join(","),
    ...items.map((item) => columns.map((column) => csvCell(item[column])).join(","))
  ].join("\r\n");
  exportBlob("x-media-report.csv", `\uFEFF${csv}`, "text/csv;charset=utf-8");
});

function setSelection(selected) {
  items.forEach((item) => { item.selected = selected; });
  document.querySelectorAll(".pick").forEach((input) => { input.checked = selected; });
  document.getElementById("toggleAll").checked = selected;
}

function exportBlob(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

load();
