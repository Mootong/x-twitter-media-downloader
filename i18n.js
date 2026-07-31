(() => {
  function t(key, substitutions) {
    const values = Array.isArray(substitutions)
      ? substitutions.map(String)
      : substitutions == null ? undefined : String(substitutions);
    return chrome.i18n.getMessage(key, values) || key;
  }

  function localizeDocument() {
    document.documentElement.lang = chrome.i18n.getUILanguage().replace("_", "-");
    for (const element of document.querySelectorAll("[data-i18n]")) {
      element.textContent = t(element.dataset.i18n);
    }
  }

  window.xmdI18n = { t, localizeDocument };
})();
