const t = window.xmdI18n.t;
let stopRequested = false;
let running = false;
const capturedVideoVariants = new Map();
const capturedImages = new Map();

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  if (event.data?.source !== "x-media-downloader-main" || event.data.type !== "CAPTURED_MEDIA") return;
  for (const media of event.data.media || []) {
    if (!media.tweetId) continue;
    if (media.type === "image" && media.url) {
      const existing = capturedImages.get(media.tweetId) || [];
      capturedImages.set(
        media.tweetId,
        uniqueBy([...existing, originalImageUrl(media.url)], imageIdentity)
      );
    }
    if (Array.isArray(media.variants)) {
      const existing = capturedVideoVariants.get(media.tweetId) || [];
      capturedVideoVariants.set(
        media.tweetId,
        uniqueBy([...existing, ...media.variants], (item) => item.url)
      );
    }
  }
});
requestCapturedMedia();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "STOP_SCAN") {
    stopRequested = true;
    sendResponse({ ok: true });
    return;
  }
  if (message.type === "START_SCAN") {
    if (running) {
      sendResponse({ ok: false, error: t("scanAlreadyRunning") });
      return;
    }
    runScan(message.options).catch((error) => {
      report(t("scanFailed", error.message), { error: error.message });
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
    skippedVideos: 0
  };
  let stagnantRounds = 0;

  report(t("loadingMedia"), stats);
  requestCapturedMedia();
  await sleep(2200);

  while (!stopRequested && stats.tweets < options.maxTweets && stagnantRounds < 8) {
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    const visibleTweets = [
      ...articles.map((article) => parseTweet(article, options)),
      ...parseMediaGrid(options)
    ];
    let newTweets = 0;

    for (const tweet of visibleTweets) {
      if (stopRequested || stats.tweets >= options.maxTweets) break;
      if (!tweet || seenTweets.has(tweet.id)) continue;
      seenTweets.add(tweet.id);
      newTweets++;

      if (!tweet.inRange) continue;
      stats.tweets++;

      const mediaList = enrichMedia(tweet);
      for (const [mediaIndex, media] of mediaList.entries()) {
        const mediaKey = mediaIdentity(media);
        if (!media.url || seenUrls.has(mediaKey)) continue;
        seenUrls.add(mediaKey);
        const filename = makeFilename(options.handle, tweet, media, mediaIndex);
        const item = {
          id: `${tweet.id}-${items.length + 1}`,
          selected: true,
          tweetId: tweet.id,
          tweetUrl: `https://x.com/${tweet.author}/status/${tweet.id}`,
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

      }

      stats.skippedVideos += tweet.skippedVideos && !capturedVideoVariants.has(tweet.id) ? tweet.skippedVideos : 0;
      report(t("scannedProgress", [stats.tweets, options.maxTweets]), stats);
    }

    stagnantRounds = newTweets === 0 ? stagnantRounds + 1 : 0;
    window.scrollBy({ top: Math.max(700, window.innerHeight * 0.85), behavior: "smooth" });
    await sleep(1400);
  }

  const reason = stopRequested
    ? t("scanStopped")
    : stagnantRounds >= 8
      ? t("endReached")
      : t("maxReached");
  await chrome.runtime.sendMessage({
    type: "SAVE_RESULTS",
    items,
    meta: { options, stats, finishedAt: new Date().toISOString() },
    openReview: items.length > 0
  });
  report(
    `${reason} ${t("foundMedia", [stats.images, stats.videos])}${items.length > 0 ? t("reviewOpened") : ""}`,
    stats
  );
  running = false;
}

function parseTweet(article, options) {
  const statusLinks = [...article.querySelectorAll('time')]
    .map((time) => time.closest('a[href*="/status/"]'))
    .filter(Boolean);
  // The first timestamp belongs to the outer tweet. Later timestamps may be
  // quoted tweets and must never be promoted to the scan result.
  const link = statusLinks[0];
  const href = link?.getAttribute("href") || "";
  const permalink = parseStatusPermalink(href);
  const isoTime = link?.querySelector("time")?.getAttribute("datetime");
  if (!permalink || !isoTime) return null;
  const { author, id } = permalink;

  const date = isoTime.slice(0, 10);
  const inRange =
    (!options.startDate || date >= options.startDate) &&
    (!options.endDate || date <= options.endDate);
  if (author.toLowerCase() !== options.handle.toLowerCase()) {
    return null;
  }
  const media = [];

  for (const img of article.querySelectorAll('img[src*="pbs.twimg.com/media/"]')) {
    if (!belongsToTweet(img, id)) continue;
    media.push({ type: "image", url: originalImageUrl(img.src) });
  }

  let skippedVideos = 0;
  for (const video of article.querySelectorAll("video")) {
    if (!belongsToTweet(video, id)) continue;
    const url = video.currentSrc || video.src;
    if (/^https:\/\/video\.twimg\.com\/.+\.mp4(?:\?|$)/i.test(url)) {
      media.push({ type: "video", kind: "mp4", url });
    } else {
      skippedVideos++;
    }
  }

  return { id, author, date, isoTime, media, skippedVideos, inRange };
}

function parseMediaGrid(options) {
  const tweets = new Map();
  const mediaSelector = [
    'img[src*="pbs.twimg.com/media/"]',
    'img[src*="pbs.twimg.com/ext_tw_video_thumb/"]',
    'img[src*="pbs.twimg.com/amplify_video_thumb/"]',
    'img[src*="pbs.twimg.com/tweet_video_thumb/"]',
    "video"
  ].join(",");

  for (const link of document.querySelectorAll('a[href*="/status/"]')) {
    if (!link.querySelector(mediaSelector)) continue;
    const permalink = parseStatusPermalink(link.getAttribute("href") || "");
    if (!permalink || permalink.author.toLowerCase() !== options.handle.toLowerCase()) continue;

    let tweet = tweets.get(permalink.id);
    if (!tweet) {
      const isoTime = isoTimeFromTweetId(permalink.id);
      if (!isoTime) continue;
      const date = isoTime.slice(0, 10);
      tweet = {
        ...permalink,
        date,
        isoTime,
        media: [],
        skippedVideos: 0,
        inRange:
          (!options.startDate || date >= options.startDate) &&
          (!options.endDate || date <= options.endDate)
      };
      tweets.set(permalink.id, tweet);
    }

    for (const img of link.querySelectorAll('img[src*="pbs.twimg.com/media/"]')) {
      const url = originalImageUrl(img.src);
      if (!tweet.media.some((item) => item.url === url)) {
        tweet.media.push({ type: "image", url });
      }
    }
    for (const video of link.querySelectorAll("video")) {
      const url = video.currentSrc || video.src;
      if (/^https:\/\/video\.twimg\.com\/.+\.mp4(?:\?|$)/i.test(url) &&
          !tweet.media.some((item) => item.url === url)) {
        tweet.media.push({ type: "video", kind: "mp4", url });
      } else if (url) {
        tweet.skippedVideos++;
      }
    }
  }
  return [...tweets.values()];
}

function parseStatusPermalink(href) {
  const match = href.match(/^(?:https?:\/\/(?:x|twitter)\.com)?\/([^/?#]+)\/status\/(\d+)/i);
  if (!match || /^(?:i|home|explore|search|notifications|messages)$/i.test(match[1])) {
    return null;
  }
  return { author: match[1], id: match[2] };
}

function isoTimeFromTweetId(tweetId) {
  try {
    const twitterEpoch = 1288834974657n;
    return new Date(Number((BigInt(tweetId) >> 22n) + twitterEpoch)).toISOString();
  } catch (_) {
    return "";
  }
}

function belongsToTweet(element, tweetId) {
  const enclosingLink = element.closest('a[href*="/status/"]');
  if (!enclosingLink) return true;
  const permalink = parseStatusPermalink(enclosingLink.getAttribute("href") || "");
  return !permalink || permalink.id === tweetId;
}

function enrichMedia(tweet) {
  const images = uniqueBy([
    ...tweet.media.filter((media) => media.type === "image"),
    ...(capturedImages.get(tweet.id) || []).map((url) => ({ type: "image", url }))
  ], mediaIdentity);
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

function imageIdentity(value) {
  try {
    const url = new URL(value);
    const mediaId = url.pathname.split("/").pop().replace(/\.(?:jpe?g|png|webp|gif)$/i, "");
    return `${url.hostname.toLowerCase()}:${mediaId}`;
  } catch (_) {
    return String(value);
  }
}

function mediaIdentity(media) {
  return media.type === "image" ? `image:${imageIdentity(media.url)}` : `${media.kind || media.type}:${media.url}`;
}

function makeFilename(handle, tweet, media, mediaIndex) {
  const index = mediaIndex + 1;
  const ext = media.type === "image"
    ? new URL(media.url).searchParams.get("format") || "jpg"
    : media.kind === "hls" ? "m3u8" : media.kind === "dash" ? "mpd" : "mp4";
  return `${sanitize(handle)}/${tweet.date}_${tweet.id}_${index}.${sanitize(ext)}`;
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

function requestCapturedMedia() {
  window.postMessage({
    source: "x-media-downloader-content",
    type: "REQUEST_CAPTURED_MEDIA"
  }, location.origin);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
