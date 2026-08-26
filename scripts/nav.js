/**
 * nav.js — 窄螢幕漢堡選單
 *
 * 設計要點:
 *   - 漸進增強:CSS 預設藏起漢堡鈕,本檔載入後才補上 .nav--js。
 *     沒有 JS 時看不到漢堡鈕,選單連結維持展開可用。
 *   - 收合時用 hidden 屬性(不是只把高度歸零),確保連結同時
 *     退出 Tab 序與無障礙樹。
 *   - 只在窄螢幕收合;跨過斷點時會重設狀態,寬螢幕永遠不留 hidden。
 */
(function () {
  "use strict";

  // 必須與 styles/main.css 的窄螢幕斷點一致
  var NARROW = "(max-width: 40rem)";

  var nav = document.querySelector("[data-nav]");
  if (!nav) {
    return;
  }

  var burger = nav.querySelector("[data-nav-burger]");
  var menu = nav.querySelector("[data-nav-menu]");
  if (!burger || !menu) {
    return;
  }

  var narrowQuery = window.matchMedia(NARROW);

  nav.classList.add("nav--js");

  function isOpen() {
    return burger.getAttribute("aria-expanded") === "true";
  }

  function setOpen(open) {
    var label = open ? "關閉選單" : "開啟選單";
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", label);
    burger.setAttribute("title", label);
    nav.classList.toggle("is-open", open);
    menu.hidden = !open;
  }

  function openMenu() {
    setOpen(true);
    var firstLink = menu.querySelector("a");
    if (firstLink) {
      firstLink.focus();
    }
  }

  function closeMenu(returnFocus) {
    if (!isOpen()) {
      return;
    }
    setOpen(false);
    if (returnFocus) {
      burger.focus();
    }
  }

  /**
   * 跨斷點時重設:窄螢幕預設收合,寬螢幕一定要把 hidden 拿掉,
   * 否則使用者從窄拉寬之後連結會整組消失。
   */
  function syncToViewport() {
    if (narrowQuery.matches) {
      setOpen(false);
      return;
    }
    burger.setAttribute("aria-expanded", "false");
    nav.classList.remove("is-open");
    menu.hidden = false;
  }

  burger.addEventListener("click", function () {
    if (isOpen()) {
      closeMenu(true);
    } else {
      openMenu();
    }
  });

  // Esc:關閉並把焦點交還漢堡鈕
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && isOpen()) {
      closeMenu(true);
    }
  });

  // 點選單內的錨點連結後收合
  menu.addEventListener("click", function (event) {
    if (event.target.closest("a")) {
      closeMenu(false);
    }
  });

  // 點導覽列外面收合(焦點留在使用者點的地方)
  document.addEventListener("pointerdown", function (event) {
    if (isOpen() && !nav.contains(event.target)) {
      closeMenu(false);
    }
  });

  // Tab 走出導覽列就收合。
  // relatedTarget 為 null 代表焦點離開整份文件(切換分頁 / 視窗失焦),
  // 那不是使用者要關選單,維持展開。
  nav.addEventListener("focusout", function (event) {
    if (isOpen() && event.relatedTarget && !nav.contains(event.relatedTarget)) {
      closeMenu(false);
    }
  });

  syncToViewport();

  if (typeof narrowQuery.addEventListener === "function") {
    narrowQuery.addEventListener("change", syncToViewport);
  } else if (typeof narrowQuery.addListener === "function") {
    narrowQuery.addListener(syncToViewport); // Safari < 14
  }
})();
