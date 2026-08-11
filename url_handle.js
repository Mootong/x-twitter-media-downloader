(() => {
  const reservedRoutes = new Set([
    "bookmarks",
    "communities",
    "compose",
    "explore",
    "help",
    "home",
    "i",
    "intent",
    "jobs",
    "lists",
    "messages",
    "notifications",
    "privacy",
    "search",
    "settings",
    "share",
    "tos"
  ]);

  function detectHandleFromUrl(value) {
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
      if (url.protocol !== "https:" || !["x.com", "twitter.com"].includes(hostname)) {
        return "";
      }

      const firstSegment = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] || "");
      if (reservedRoutes.has(firstSegment.toLowerCase())) return "";
      return /^[A-Za-z0-9_]{1,15}$/.test(firstSegment) ? firstSegment : "";
    } catch (_) {
      return "";
    }
  }

  window.xmdUrlHandle = { detectHandleFromUrl };
})();
