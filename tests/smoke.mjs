import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await testBackgroundScanHandoff();
await testPopupRestoresOnlyRunningProgress();
await testDownloadCompletionTracking();
testMediaMergeAndDeduplication();
testHandleDetection();
console.log("Smoke tests passed.");

async function testBackgroundScanHandoff() {
  const stored = {};
  let scanMessage;
  let determiningFilename;
  const context = {
    URL,
    Date,
    Map,
    Set,
    String,
    JSON,
    chrome: {
      i18n: {
        getMessage(key, substitutions) {
          return `${key}${substitutions ? `:${[].concat(substitutions).join(",")}` : ""}`;
        }
      },
      downloads: {
        onDeterminingFilename: {
          addListener(listener) {
            determiningFilename = listener;
          }
        },
        async download(options) {
          determiningFilename(
            { id: 7, url: options.url, finalUrl: options.url },
            (suggestion) => {
              if (suggestion?.filename !== "Adaxhl/media.jpg") {
                throw new Error("download subdirectory was not preserved");
              }
            }
          );
          return 7;
        }
      },
      runtime: {
        onMessage: { addListener() {} },
        sendMessage: async () => ({ ok: true }),
        getURL: (value) => value
      },
      storage: {
        local: {
          async get(key) {
            return typeof key === "string" ? { [key]: stored[key] } : { ...stored };
          },
          async set(values) {
            Object.assign(stored, values);
          },
          async remove(key) {
            delete stored[key];
          }
        }
      },
      tabs: {
        onUpdated: { addListener() {} },
        async update(tabId, options) {
          return { id: tabId, url: options.url };
        },
        async sendMessage(tabId, message) {
          scanMessage = { tabId, message };
          return { ok: true };
        },
        create() {}
      }
    },
    fetch() {}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "background.js"), "utf8"), context);

  await vm.runInContext(
    "startScanNavigation({tabId:42,url:'https://x.com/Adaxhl/media',options:{handle:'Adaxhl',maxTweets:10}})",
    context
  );
  await vm.runInContext(
    "resumePendingScan(42,{url:'https://x.com/adaxhl/media/'})",
    context
  );
  if (scanMessage?.message.type !== "START_SCAN") {
    throw new Error("background did not resume the scan after navigation");
  }

  const downloadId = await vm.runInContext(
    "downloadWithFilename('https://pbs.twimg.com/media/A.jpg','Adaxhl/media.jpg')",
    context
  );
  if (downloadId !== 7) throw new Error("download smoke test failed");
}

async function testPopupRestoresOnlyRunningProgress() {
  let stored = {
    lastProgress: {
      phase: "completed",
      message: "old completed scan",
      stats: { tweets: 100, images: 129, videos: 20, skippedVideos: 0 }
    }
  };
  const elements = new Map();
  const element = (id = "") => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: "",
        textContent: "",
        className: "",
        hidden: id === "stats" || id === "handleHistoryLabel",
        selectedIndex: 0,
        children: [],
        addEventListener() {},
        append(...children) { this.children.push(...children); },
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...children) { this.children = [...children]; }
      });
    }
    return elements.get(id);
  };
  const context = {
    URL,
    Number,
    String,
    window: {
      xmdI18n: {
        t(key) { return key; },
        localizeDocument() {}
      },
      xmdUrlHandle: { detectHandleFromUrl() { return ""; } }
    },
    document: {
      getElementById: element,
      createElement() { return element(`created-${elements.size}`); }
    },
    chrome: {
      storage: {
        local: {
          async get() { return stored; },
          async set(values) { stored = { ...stored, ...values }; }
        }
      },
      tabs: {
        async query() { return [{ id: 1, url: "https://x.com/home" }]; },
        onActivated: { addListener() {} },
        onUpdated: { addListener() {} },
        async sendMessage() { return { ok: true }; },
        create() {}
      },
      runtime: {
        onMessage: { addListener() {} },
        async sendMessage() { return { ok: true }; },
        getURL(value) { return value; }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "popup.js"), "utf8"), context);
  await new Promise((resolve) => setTimeout(resolve, 0));

  if (element("status").textContent || !element("stats").hidden) {
    throw new Error("completed scan progress was restored in a newly opened side panel");
  }

  stored.lastProgress = {
    phase: "running",
    message: "scan in progress",
    stats: { tweets: 1, images: 2, videos: 0, skippedVideos: 0 }
  };
  await vm.runInContext("restoreForm()", context);
  if (element("status").textContent !== "scan in progress" || element("stats").hidden) {
    throw new Error("running scan progress was not restored in a newly opened side panel");
  }
}

async function testDownloadCompletionTracking() {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: "",
        className: "",
        hidden: false,
        checked: false,
        indeterminate: false,
        open: false,
        value: "all",
        addEventListener() {},
        querySelector() { return null; },
        removeAttribute() {},
        showModal() { this.open = true; },
        close() { this.open = false; }
      });
    }
    return elements.get(id);
  };
  let downloadChangedListener;
  let listenerRemoved = false;
  let helperPolls = 0;
  const context = {
    URL,
    Blob,
    Date,
    Number,
    Promise,
    String,
    encodeURIComponent,
    window: {
      xmdI18n: {
        t(key) { return key; },
        localizeDocument() {}
      }
    },
    document: {
      getElementById: element,
      querySelectorAll() { return []; },
      querySelector() { return { removeAttribute() {} }; },
      createElement() { return element(`created-${elements.size}`); }
    },
    chrome: {
      i18n: { getUILanguage: () => "en" },
      storage: { local: { async get() { return {}; } } },
      permissions: { async request() { return true; } },
      runtime: {
        id: "test-extension-id",
        async sendMessage() { return { ok: true, downloadId: 42 }; }
      },
      downloads: {
        onChanged: {
          addListener(listener) { downloadChangedListener = listener; },
          removeListener(listener) {
            if (listener === downloadChangedListener) listenerRemoved = true;
          }
        },
        async search() { return [{ id: 42, state: "in_progress" }]; }
      }
    },
    fetch: async () => {
      helperPolls++;
      return {
        ok: true,
        async json() {
          return { status: helperPolls === 1 ? "running" : "completed" };
        }
      };
    },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "review.js"), "utf8"), context);

  const browserWait = vm.runInContext("waitForBrowserDownload(42)", context);
  await Promise.resolve();
  if (typeof downloadChangedListener !== "function") {
    throw new Error("browser download completion listener was not registered");
  }
  downloadChangedListener({ id: 42, state: { current: "complete" } });
  await browserWait;
  if (!listenerRemoved) throw new Error("browser download completion listener was not removed");

  await vm.runInContext("waitForHelperDownload('job-1')", context);
  if (helperPolls !== 2) throw new Error("helper download completion was not polled correctly");

  const counts = vm.runInContext(
    "countMediaTypes([{kind:'image'},{kind:'mp4'},{kind:'hls'},{kind:'image'}])",
    context
  );
  if (counts.imageCount !== 2 || counts.videoCount !== 2) {
    throw new Error("preview media type counts are incorrect");
  }

  vm.runInContext("showDownloadCompleteDialog(3)", context);
  if (!element("downloadCompleteDialog").open ||
      element("rateExtension").href !==
        "https://chrome.google.com/webstore/detail/test-extension-id/reviews") {
    throw new Error("download completion rating dialog was not configured correctly");
  }
}

function testMediaMergeAndDeduplication() {
  let messageHandler;
  const pageWindow = {
    xmdI18n: {
      t(key, substitutions) {
        return `${key}${substitutions ? `:${[].concat(substitutions).join(",")}` : ""}`;
      }
    },
    addEventListener(type, listener) {
      if (type === "message") messageHandler = listener;
    },
    postMessage() {},
    innerHeight: 900,
    scrollBy() {}
  };
  const context = {
    URL,
    Date,
    BigInt,
    Map,
    Set,
    window: pageWindow,
    location: { origin: "https://x.com" },
    document: { querySelectorAll: () => [] },
    chrome: {
      runtime: {
        onMessage: { addListener() {} },
        sendMessage: async () => ({ ok: true })
      }
    },
    setTimeout
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "content.js"), "utf8"), context);

  messageHandler({
    source: pageWindow,
    origin: "https://x.com",
    data: {
      source: "x-media-downloader-main",
      type: "CAPTURED_MEDIA",
      media: [
        {
          tweetId: "1",
          type: "image",
          url: "https://pbs.twimg.com/media/A.jpg",
          width: 4096,
          height: 2731
        },
        { tweetId: "1", type: "image", url: "https://pbs.twimg.com/media/B.png" },
        {
          tweetId: "1",
          type: "video",
          mediaKey: "video-1",
          variants: [
            {
              url: "https://video.twimg.com/x-low.mp4",
              bitrate: 100,
              contentType: "video/mp4"
            },
            {
              url: "https://video.twimg.com/x-high.mp4",
              bitrate: 500,
              contentType: "video/mp4"
            }
          ]
        },
        {
          tweetId: "1",
          type: "video",
          mediaKey: "video-2",
          variants: [
            {
              url: "https://video.twimg.com/y-low.mp4",
              bitrate: 200,
              contentType: "video/mp4"
            },
            {
              url: "https://video.twimg.com/y-high.mp4",
              bitrate: 800,
              contentType: "video/mp4"
            }
          ]
        }
      ]
    }
  });

  const result = vm.runInContext(
    "enrichMedia({id:'1',media:[{type:'image',url:originalImageUrl('https://pbs.twimg.com/media/A?format=jpg&name=small')}]})",
    context
  );
  if (result.length !== 4 ||
      result.filter((item) => item.type === "image").length !== 2 ||
      result.filter((item) => item.type === "video").length !== 2) {
    throw new Error("media merge or cover deduplication failed");
  }
  const videoUrls = result.filter((item) => item.type === "video").map((item) => item.url);
  if (!videoUrls.includes("https://video.twimg.com/x-high.mp4") ||
      !videoUrls.includes("https://video.twimg.com/y-high.mp4")) {
    throw new Error("multiple videos from one post were not preserved at their best bitrate");
  }
  const firstImage = result.find((item) => item.url.includes("/A"));
  if (firstImage?.width !== 4096 || firstImage?.height !== 2731) {
    throw new Error("original image resolution was not preserved");
  }
}

function testHandleDetection() {
  const pageWindow = {};
  const context = { URL, Set, decodeURIComponent, window: pageWindow };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "url_handle.js"), "utf8"), context);

  const detect = pageWindow.xmdUrlHandle.detectHandleFromUrl;
  const cases = [
    ["https://x.com/Adaxhl/media", "Adaxhl"],
    ["https://x.com/test_user/status/123", "test_user"],
    ["https://twitter.com/AnotherUser", "AnotherUser"],
    ["https://x.com/home", ""],
    ["https://x.com/i/status/123", ""],
    ["https://example.com/Adaxhl", ""]
  ];
  for (const [url, expected] of cases) {
    if (detect(url) !== expected) {
      throw new Error(`username detection failed for ${url}`);
    }
  }
}
