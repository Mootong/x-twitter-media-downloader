(() => {
  if (window.__xMediaInterceptorInstalled) return;
  window.__xMediaInterceptorInstalled = true;

  const publish = (value) => {
    try {
      const videos = [];
      walk(value, videos, new WeakSet());
      if (videos.length) {
        window.postMessage({
          source: "x-media-downloader-main",
          type: "VIDEO_VARIANTS",
          videos
        }, location.origin);
      }
    } catch (_) {
      // Never interfere with X if its response format changes.
    }
  };

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
      if (!Array.isArray(variants) || !variants.length) continue;
      output.push({
        tweetId: id,
        mediaKey: media.media_key || media.id_str || "",
        variants: variants.map((variant) => ({
          url: variant.url,
          bitrate: Number(variant.bitrate || 0),
          contentType: variant.content_type || ""
        })).filter((variant) => /^https?:/.test(variant.url || ""))
      });
    }

    for (const value of Object.values(node)) walk(value, output, seen);
  }
})();
