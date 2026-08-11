let items = [];
let typeFilter = "all";
const rows = document.getElementById("rows");
const { t, localizeDocument } = window.xmdI18n;
localizeDocument();

async function load() {
  const data = await chrome.storage.local.get(["scanResults", "scanMeta", "scanSavedAt"]);
  items = data.scanResults || [];
  const { imageCount, videoCount } = countMediaTypes(items);
  document.getElementById("summary").textContent = data.scanSavedAt
    ? t("summaryWithDate", [
      items.length,
      imageCount,
      videoCount,
      new Date(data.scanSavedAt).toLocaleString(chrome.i18n.getUILanguage().replace("_", "-"))
    ])
    : t("summaryNoDate", [items.length, imageCount, videoCount]);
  document.getElementById("helper").textContent = items.some((item) => item.kind === "hls" || item.kind === "dash")
    ? t("helperNeeded")
    : t("browserDownloadsAll");
  render();
}

function countMediaTypes(mediaItems) {
  const imageCount = mediaItems.filter((item) => item.kind === "image").length;
  return { imageCount, videoCount: mediaItems.length - imageCount };
}

function render() {
  rows.textContent = "";
  items.forEach((item, index) => {
    if (!matchesTypeFilter(item)) return;
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
      <td class="media-info">${escapeHtml(formatMediaInfo(item))}</td>
      <td class="url"><a href="${escapeHtml(item.tweetUrl)}" target="_blank">${escapeHtml(item.tweetId)}</a></td>
      <td class="status">${escapeHtml(t("pending"))}</td>`;
    tr.querySelector(".pick").addEventListener("change", (event) => {
      items[index].selected = event.target.checked;
      updateToggleAll();
    });
    rows.appendChild(tr);
    if (item.kind === "image" && (!item.width || !item.height)) {
      const image = tr.querySelector("img");
      const rememberLoadedResolution = () => {
        if (!image.naturalWidth || !image.naturalHeight) return;
        item.width = image.naturalWidth;
        item.height = image.naturalHeight;
        tr.querySelector(".media-info").textContent = formatMediaInfo(item);
      };
      if (image.complete) rememberLoadedResolution();
      else image.addEventListener("load", rememberLoadedResolution, { once: true });
    }
  });
  updateToggleAll();
}

document.getElementById("selectAll").addEventListener("click", () => setSelection(true));
document.getElementById("selectNone").addEventListener("click", () => setSelection(false));
document.getElementById("toggleAll").addEventListener("change", (event) => setSelection(event.target.checked));
document.getElementById("typeFilter").addEventListener("change", (event) => {
  typeFilter = event.target.value;
  render();
});

document.getElementById("download").addEventListener("click", async () => {
  const downloadButton = document.getElementById("download");
  const selected = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => matchesTypeFilter(item) && item.selected !== false);
  if (selected.length === 0) {
    showDownloadSummary(t("noItemsSelected"), "error");
    return;
  }

  downloadButton.disabled = true;
  showDownloadSummary(t("downloadsInProgress", [0, selected.length]));
  const needsHelper = selected.some(({ item }) => item.kind === "hls" || item.kind === "dash");
  let helperPermissionGranted = true;
  if (needsHelper) {
    helperPermissionGranted = await chrome.permissions.request({
      origins: ["http://127.0.0.1:17863/*"]
    }).catch(() => false);
  }

  let finished = 0;
  try {
    const outcomes = await Promise.all(selected.map(async ({ item, index }) => {
      const status = rows.querySelector(`tr[data-index="${index}"] .status`);
      try {
        if ((item.kind === "hls" || item.kind === "dash") && !helperPermissionGranted) {
          setRowStatus(status, t("helperPermissionDenied"), "error");
          return false;
        }

        setRowStatus(status, t("processing"));
        const result = await chrome.runtime.sendMessage({ type: "DOWNLOAD_ITEM", item });
        if (!result?.ok) throw new Error(result?.error || t("unknownError"));

        setRowStatus(status, result.helper ? t("helperDownloadRunning") : t("downloadInProgress"));
        if (result.helper) await waitForHelperDownload(result.jobId);
        else await waitForBrowserDownload(result.downloadId);

        setRowStatus(status, t("downloadCompleted"), "ok");
        return true;
      } catch (error) {
        setRowStatus(status, t("failedWithError", error.message || t("unknownError")), "error");
        return false;
      } finally {
        finished++;
        showDownloadSummary(t("downloadsInProgress", [finished, selected.length]));
      }
    }));

    const completed = outcomes.filter(Boolean).length;
    const failed = outcomes.length - completed;
    if (failed === 0) {
      hideDownloadSummary();
      showDownloadCompleteDialog(completed);
    } else {
      showDownloadSummary(t("downloadsCompletedWithFailures", [completed, failed]), "error");
    }
  } finally {
    downloadButton.disabled = false;
  }
});

function setRowStatus(element, text, state = "") {
  if (!element) return;
  element.textContent = text;
  element.className = `status${state ? ` ${state}` : ""}`;
}

function showDownloadSummary(text, state = "") {
  const summary = document.getElementById("downloadSummary");
  summary.textContent = text;
  summary.className = `download-summary${state ? ` ${state}` : ""}`;
  summary.hidden = false;
}

function hideDownloadSummary() {
  document.getElementById("downloadSummary").hidden = true;
}

function showDownloadCompleteDialog(completed) {
  const dialog = document.getElementById("downloadCompleteDialog");
  document.getElementById("downloadCompleteMessage").textContent = t("allDownloadsCompleted", completed);
  document.getElementById("rateExtension").href =
    `https://chrome.google.com/webstore/detail/${chrome.runtime.id}/reviews`;
  if (!dialog.open) dialog.showModal();
}

document.getElementById("rateExtension").addEventListener("click", () => {
  document.getElementById("downloadCompleteDialog").close();
});

function waitForBrowserDownload(downloadId) {
  return new Promise((resolve, reject) => {
    if (!Number.isInteger(downloadId)) {
      reject(new Error(t("unknownError")));
      return;
    }

    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      chrome.downloads.onChanged.removeListener(onChanged);
      if (error) reject(error);
      else resolve();
    };
    const inspectState = (state, error) => {
      if (state === "complete") finish();
      else if (state === "interrupted") finish(new Error(error || t("downloadInterrupted")));
    };
    const onChanged = (delta) => {
      if (delta.id !== downloadId) return;
      inspectState(delta.state?.current, delta.error?.current);
    };

    chrome.downloads.onChanged.addListener(onChanged);
    chrome.downloads.search({ id: downloadId }).then(
      ([download]) => download
        ? inspectState(download.state, download.error)
        : finish(new Error(t("unknownError"))),
      (error) => finish(error)
    );
  });
}

async function waitForHelperDownload(jobId) {
  if (!jobId) throw new Error(t("unknownError"));
  while (true) {
    const response = await fetch(`http://127.0.0.1:17863/jobs/${encodeURIComponent(jobId)}`, {
      cache: "no-store"
    });
    const job = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(job.error || t("helperHttpError", response.status));
    if (job.status === "completed") return;
    if (job.status === "failed") throw new Error(job.error || t("unknownError"));
    await delay(1000);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

document.getElementById("exportJson").addEventListener("click", () => {
  exportBlob("x-media-report.json", JSON.stringify(items, null, 2), "application/json");
  closeExportMenu();
});

document.getElementById("exportCsv").addEventListener("click", () => {
  const columns = [
    "selected", "handle", "date", "tweetId", "kind", "width", "height",
    "bitrate", "tweetUrl", "url", "filename"
  ];
  const csv = [
    columns.join(","),
    ...items.map((item) => columns.map((column) => csvCell(item[column])).join(","))
  ].join("\r\n");
  exportBlob("x-media-report.csv", `\uFEFF${csv}`, "text/csv;charset=utf-8");
  closeExportMenu();
});

function setSelection(selected) {
  items.filter(matchesTypeFilter).forEach((item) => { item.selected = selected; });
  document.querySelectorAll(".pick").forEach((input) => { input.checked = selected; });
  updateToggleAll();
}

function matchesTypeFilter(item) {
  if (typeFilter === "image") return item.kind === "image";
  if (typeFilter === "video") return item.kind !== "image";
  return true;
}

function updateToggleAll() {
  const visibleItems = items.filter(matchesTypeFilter);
  const selectedCount = visibleItems.filter((item) => item.selected !== false).length;
  const toggle = document.getElementById("toggleAll");
  toggle.checked = visibleItems.length > 0 && selectedCount === visibleItems.length;
  toggle.indeterminate = selectedCount > 0 && selectedCount < visibleItems.length;
}

function formatMediaInfo(item) {
  if (item.kind === "image") {
    return item.width && item.height ? `${item.width} × ${item.height}` : "—";
  }
  return item.bitrate ? `${Math.round(item.bitrate / 1000)} kbps` : "—";
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
