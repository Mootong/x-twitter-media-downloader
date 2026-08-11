(() => {
  if (window.__xMediaInterceptorInstalled) return;
  window.__xMediaInterceptorInstalled = true;
  const capturedMedia = new Map();

  const publish = (value) => {
    try {
      const media = [];
      walk(value, media, new WeakSet());
      remember(media);
      postMedia([...capturedMedia.values()]);
    } catch (_) {
      // Never interfere with X if its response format changes.
    }
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.source !== "x-media-downloader-content" ||
        event.data.type !== "REQUEST_CAPTURED_MEDIA") return;
    postMedia([...capturedMedia.values()]);
  });

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = String(args[0]?.url || args[0] || "");
      if (/graphql|TweetDetail|UserTweets|SearchTimeline/i.test(url)) {
        response.clone().json().then(publish).catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__xmdUrl = String(url);
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (/graphql|TweetDetail|UserTweets|SearchTimeline/i.test(this.__xmdUrl || "")) {
      this.addEventListener("load", () => {
        try { publish(JSON.parse(this.responseText)); } catch (_) {}
      }, { once: true });
    }
    return originalSend.apply(this, args);
  };

  function walk(node, output, seen) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);

    const id = String(node.rest_id || node.id_str || node.tweet_id || "");
    const legacy = node.legacy || node;
    const mediaList = legacy.extended_entities?.media || legacy.entities?.media || [];
    for (const media of mediaList) {
      const variants = media?.video_info?.variants;
      output.push({
        tweetId: id,
        mediaKey: media.media_key || media.id_str || "",
        type: media.type === "photo" ? "image" : "video",
        url: media.media_url_https || media.media_url || "",
        width: Number(media.original_info?.width || 0),
        height: Number(media.original_info?.height || 0),
        variants: (Array.isArray(variants) ? variants : []).map((variant) => ({
          url: variant.url,
          bitrate: Number(variant.bitrate || 0),
          contentType: variant.content_type || ""
        })).filter((variant) => /^https?:/.test(variant.url || ""))
      });
    }

    for (const value of Object.values(node)) walk(value, output, seen);
  }

  function remember(mediaItems) {
    for (const media of mediaItems) {
      if (!media.tweetId || (!media.url && !media.variants.length)) continue;
      const key = `${media.tweetId}:${media.mediaKey || media.url || media.variants[0]?.url}`;
      capturedMedia.set(key, media);
    }
  }

  function postMedia(media) {
    if (!media.length) return;
    window.postMessage({
      source: "x-media-downloader-main",
      type: "CAPTURED_MEDIA",
      media
    }, location.origin);
  }
})();
