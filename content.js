let stopRequested = false;
let running = false;
const capturedVideoVariants = new Map();

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  if (event.data?.source !== "x-media-downloader-main" || event.data.type !== "VIDEO_VARIANTS") return;
  for (const video of event.data.videos || []) {
    if (!video.tweetId || !Array.isArray(video.variants)) continue;
    const existing = capturedVideoVariants.get(video.tweetId) || [];
    const merged = [...existing, ...video.variants];
    capturedVideoVariants.set(video.tweetId, uniqueBy(merged, (item) => item.url));
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "STOP_SCAN") {
    stopRequested = true;
    sendResponse({ ok: true });
    return;
  }
  if (message.type === "START_SCAN") {
    if (running) {
      sendResponse({ ok: false, error: "扫描已在运行" });
      return;
    }
    runScan(message.options).catch((error) => {
      report(`扫描失败：${error.message}`, { error: error.message });
    });
    sendResponse({ ok: true });
  }
});

async function runScan(options) {
  running = true;
  stopRequested = false;
  const seenTweets = new Set();
  const seenUrls = new Set();
  const items = [];
  const stats = {
    tweets: 0,
    images: 0,
    videos: 0,
    skippedVideos: 0,
    downloadErrors: 0
  };
  let stagnantRounds = 0;

  report("等待搜索结果加载……", stats);
  await sleep(2200);

  while (!stopRequested && stats.tweets < options.maxTweets && stagnantRounds < 8) {
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    let newTweets = 0;

    for (const article of articles) {
      if (stopRequested || stats.tweets >= options.maxTweets) break;
      const tweet = parseTweet(article, options);
      if (!tweet || seenTweets.has(tweet.id)) continue;
      seenTweets.add(tweet.id);
      newTweets++;

      if (!tweet.inRange || (!options.includeRetweets && tweet.isRetweet)) continue;
      stats.tweets++;

      const mediaList = enrichVideoMedia(tweet);
      for (const media of mediaList) {
        if (!media.url || seenUrls.has(media.url)) continue;
        seenUrls.add(media.url);
        const filename = makeFilename(options.handle, tweet, media);
        const item = {
          id: `${tweet.id}-${items.length + 1}`,
          selected: true,
          tweetId: tweet.id,
          tweetUrl: `https://x.com/${options.handle}/status/${tweet.id}`,
          handle: options.handle,
          date: tweet.date,
          kind: media.kind || media.type,
          bitrate: media.bitrate || 0,
          url: media.url,
          filename
        };
        items.push(item);
        if (media.type === "image") stats.images++;
        else stats.videos++;

        if (!options.previewOnly) {
          const result = await chrome.runtime.sendMessage({ type: "DOWNLOAD_ITEM", item });
          if (!result?.ok) stats.downloadErrors++;
          await sleep(120);
        }
      }

      stats.skippedVideos += tweet.skippedVideos && !capturedVideoVariants.has(tweet.id) ? tweet.skippedVideos : 0;
      report(`已扫描 ${stats.tweets}/${options.maxTweets} 条推文`, stats);
    }

    stagnantRounds = newTweets === 0 ? stagnantRounds + 1 : 0;
    window.scrollBy({ top: Math.max(700, window.innerHeight * 0.85), behavior: "smooth" });
    await sleep(1400);
  }

  const reason = stopRequested
    ? "扫描已停止。"
    : stagnantRounds >= 8
      ? "已到达当前搜索结果末尾。"
      : "已达到最大推文数。";
  await chrome.runtime.sendMessage({
    type: "SAVE_RESULTS",
    items,
    meta: { options, stats, finishedAt: new Date().toISOString() },
    openReview: options.previewOnly && items.length > 0
  });
  report(`${reason} 发现图片 ${stats.images}，视频 ${stats.videos}。${options.previewOnly ? " 已打开预览页。" : ""}`, stats);
  running = false;
}

function parseTweet(article, options) {
  const time = article.querySelector("time");
  const link = time?.closest('a[href*="/status/"]');
  const href = link?.getAttribute("href") || "";
  const id = href.match(/\/status\/(\d+)/)?.[1];
  const isoTime = time?.getAttribute("datetime");
  if (!id || !isoTime) return null;

  const date = isoTime.slice(0, 10);
  const inRange =
    (!options.startDate || date >= options.startDate) &&
    (!options.endDate || date <= options.endDate);
  const isRetweet = /reposted|转推了|已转推/i.test(article.innerText.slice(0, 250));
  const media = [];

  for (const img of article.querySelectorAll('img[src*="pbs.twimg.com/media/"]')) {
    media.push({ type: "image", url: originalImageUrl(img.src) });
  }

  let skippedVideos = 0;
  for (const video of article.querySelectorAll("video")) {
    const url = video.currentSrc || video.src;
    if (/^https:\/\/video\.twimg\.com\/.+\.mp4(?:\?|$)/i.test(url)) {
      media.push({ type: "video", kind: "mp4", url });
    } else {
      skippedVideos++;
    }
  }

  return { id, date, isoTime, media, skippedVideos, inRange, isRetweet };
}

function enrichVideoMedia(tweet) {
  const images = tweet.media.filter((media) => media.type === "image");
  const domVideos = tweet.media.filter((media) => media.type === "video");
  const variants = capturedVideoVariants.get(tweet.id) || [];
  if (!variants.length) return [...images, ...domVideos];

  const bestMp4 = variants
    .filter((variant) => /video\/mp4/i.test(variant.contentType) || /\.mp4(?:\?|$)/i.test(variant.url))
    .sort((a, b) => b.bitrate - a.bitrate)[0];
  if (bestMp4) {
    return [...images, {
      type: "video",
      kind: "mp4",
      url: bestMp4.url,
      bitrate: bestMp4.bitrate
    }];
  }

  const manifest = variants.find((variant) =>
    /mpegurl|m3u8/i.test(`${variant.contentType} ${variant.url}`)
  ) || variants.find((variant) =>
    /dash|mpd/i.test(`${variant.contentType} ${variant.url}`)
  );
  if (manifest) {
    return [...images, {
      type: "video",
      kind: /mpd|dash/i.test(`${manifest.contentType} ${manifest.url}`) ? "dash" : "hls",
      url: manifest.url
    }];
  }
  return [...images, ...domVideos];
}

function originalImageUrl(value) {
  const url = new URL(value);
  const format = url.searchParams.get("format") || extensionFromPath(url.pathname) || "jpg";
  url.search = "";
  url.searchParams.set("format", format);
  url.searchParams.set("name", "orig");
  return url.toString();
}

function extensionFromPath(path) {
  return path.match(/\.(jpe?g|png|webp|gif)$/i)?.[1]?.replace("jpeg", "jpg");
}

function makeFilename(handle, tweet, media) {
  const index = tweet.media.indexOf(media) + 1;
  const ext = media.type === "image"
    ? new URL(media.url).searchParams.get("format") || "jpg"
    : media.kind === "hls" ? "m3u8" : media.kind === "dash" ? "mpd" : "mp4";
  return `X-Media/${sanitize(handle)}/${tweet.date}_${tweet.id}_${index}.${sanitize(ext)}`;
}

function uniqueBy(items, keyFn) {
  return [...new Map(items.map((item) => [keyFn(item), item])).values()];
}

function sanitize(value) {
  return String(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function report(message, stats) {
  const payload = { type: "SCAN_PROGRESS", message, stats: { ...stats } };
  chrome.runtime.sendMessage(payload).catch(() => {});
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
