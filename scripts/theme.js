/**
 * theme.js — 主題切換
 *
 * 行為:
 *   1. 使用者手動選過 → 用 localStorage 的值,寫入 <html data-theme>
 *   2. 沒選過        → 不寫 data-theme,交給 CSS 的 prefers-color-scheme 決定
 *   3. 沒選過時系統切換 → 即時跟著換(更新 meta theme-color 與按鈕標籤)
 *
 * 本檔在 <head> 同步載入,先於 body 繪製,避免深色模式閃白。
 */
(function () {
  "use strict";

  var STORAGE_KEY = "pc-theme";
  var THEME_LIGHT = "light";
  var THEME_DARK = "dark";

  var root = document.documentElement;
  var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function readStored() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return value === THEME_LIGHT || value === THEME_DARK ? value : null;
    } catch (error) {
      return null; // 無痕模式或封鎖儲存
    }
  }

  function writeStored(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      /* 存不進去不影響當次切換 */
    }
  }

  function systemTheme() {
    return darkQuery.matches ? THEME_DARK : THEME_LIGHT;
  }

  function activeTheme() {
    return root.getAttribute("data-theme") || systemTheme();
  }

  /**
   * 瀏覽器 UI 色。直接讀當前生效的 --bg,色碼不在 JS 裡重複一份。
   */
  function syncMeta() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      return;
    }
    var bg = window.getComputedStyle(root).getPropertyValue("--bg").trim();
    if (bg) {
      meta.setAttribute("content", bg);
    }
  }

  function syncToggle(theme) {
    var toggle = document.querySelector("[data-theme-toggle]");
    if (!toggle) {
      return;
    }
    var isDark = theme === THEME_DARK;
    var label = isDark ? "切換為淺色模式" : "切換為深色模式";
    toggle.setAttribute("aria-pressed", String(isDark));
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("title", label);
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    syncMeta();
    syncToggle(theme);
  }

  // --- 1. 首次繪製前先套用已儲存的選擇 -------------------------------------
  var stored = readStored();
  if (stored) {
    root.setAttribute("data-theme", stored);
  }

  // --- 2. DOM 就緒後接上按鈕 ----------------------------------------------
  function init() {
    var theme = activeTheme();
    syncMeta();
    syncToggle(theme);

    var toggle = document.querySelector("[data-theme-toggle]");
    if (toggle) {
      toggle.addEventListener("click", function () {
        var next = activeTheme() === THEME_DARK ? THEME_LIGHT : THEME_DARK;
        applyTheme(next);
        writeStored(next);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // --- 3. 使用者沒手動選過時,跟隨系統即時切換 ------------------------------
  function onSystemChange() {
    if (!root.hasAttribute("data-theme")) {
      var theme = systemTheme();
      syncMeta();
      syncToggle(theme);
    }
  }

  if (typeof darkQuery.addEventListener === "function") {
    darkQuery.addEventListener("change", onSystemChange);
  } else if (typeof darkQuery.addListener === "function") {
    darkQuery.addListener(onSystemChange); // Safari < 14
  }
})();
