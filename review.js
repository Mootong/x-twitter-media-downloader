let items = [];
const rows = document.getElementById("rows");
const { t, localizeDocument } = window.xmdI18n;
localizeDocument();

async function load() {
  const data = await chrome.storage.local.get(["scanResults", "scanMeta", "scanSavedAt"]);
  items = data.scanResults || [];
  document.getElementById("summary").textContent = data.scanSavedAt
    ? t("summaryWithDate", [
      items.length,
      new Date(data.scanSavedAt).toLocaleString(chrome.i18n.getUILanguage().replace("_", "-"))
    ])
    : t("summaryNoDate", items.length);
  document.getElementById("helper").textContent = items.some((item) => item.kind === "hls" || item.kind === "dash")
    ? t("helperNeeded")
    : t("browserDownloadsAll");
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
      <td class="status">${escapeHtml(t("pending"))}</td>`;
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
  const needsHelper = selected.some(({ item }) => item.kind === "hls" || item.kind === "dash");
  let helperPermissionGranted = true;
  if (needsHelper) {
    helperPermissionGranted = await chrome.permissions.request({
      origins: ["http://127.0.0.1:17863/*"]
    }).catch(() => false);
  }
  for (const { item, index } of selected) {
    const status = rows.querySelector(`tr[data-index="${index}"] .status`);
    if ((item.kind === "hls" || item.kind === "dash") && !helperPermissionGranted) {
      status.textContent = t("helperPermissionDenied");
      status.className = "status error";
      continue;
    }
    status.textContent = t("processing");
    status.className = "status";
    const result = await chrome.runtime.sendMessage({ type: "DOWNLOAD_ITEM", item });
    status.textContent = result?.ok
      ? (result.helper ? t("submittedHelper") : t("downloadStarted"))
      : t("failedWithError", result?.error || t("unknownError"));
    status.className = `status ${result?.ok ? "ok" : "error"}`;
  }
});

document.getElementById("exportJson").addEventListener("click", () => {
  exportBlob("x-media-report.json", JSON.stringify(items, null, 2), "application/json");
  closeExportMenu();
});

document.getElementById("exportCsv").addEventListener("click", () => {
  const columns = ["selected", "handle", "date", "tweetId", "kind", "bitrate", "tweetUrl", "url", "filename"];
  const csv = [
    columns.join(","),
    ...items.map((item) => columns.map((column) => csvCell(item[column])).join(","))
  ].join("\r\n");
  exportBlob("x-media-report.csv", `\uFEFF${csv}`, "text/csv;charset=utf-8");
  closeExportMenu();
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

function closeExportMenu() {
  document.querySelector(".export-menu").removeAttribute("open");
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
