import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await testBackgroundScanHandoff();
testMediaMergeAndDeduplication();
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
        { tweetId: "1", type: "image", url: "https://pbs.twimg.com/media/A.jpg" },
        { tweetId: "1", type: "image", url: "https://pbs.twimg.com/media/B.png" },
        {
          tweetId: "1",
          type: "video",
          variants: [
            {
              url: "https://video.twimg.com/x.mp4",
              bitrate: 100,
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
  if (result.length !== 3 || result.filter((item) => item.type === "image").length !== 2) {
    throw new Error("media merge or cover deduplication failed");
  }
}
