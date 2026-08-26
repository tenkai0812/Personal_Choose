/**
 * oklch.js — 色彩空間轉換與 WCAG 對比計算
 *
 * 開發期工具,不是頁面資源。index.html 不會載入這支檔案。
 * 零依賴,直接 node 跑。
 *
 * 轉換矩陣出自 Björn Ottosson 的 OKLab 定義:
 * https://bottosson.github.io/posts/oklab/
 *
 * 為什麼用 OKLCH 而不是 HSL:HSL 的 L 不是感知亮度,同一個 L
 * 在黃色和藍色看起來差很多,拿它生色階中間階會發灰。
 * OKLab 的 L 是感知均勻的,鎖住 H 掃 L 才會得到平順的色階。
 */
"use strict";

// --- sRGB 傳遞函數 ---------------------------------------------------------
const srgbToLinear = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const linearToSrgb = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

// --- hex <-> rgb(0–1) ------------------------------------------------------
function hexToRgb(hex) {
  const h = String(hex).trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error("不是合法的 hex 色碼:" + hex);
  }
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
}

function rgbToHex(rgb) {
  return (
    "#" +
    rgb
      .map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

// --- rgb <-> OKLab ---------------------------------------------------------
function rgbToOklab([r, g, b]) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ];
}

function oklabToRgb([L, A, B]) {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.2914855480 * B;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
  ];
}

// --- OKLCH -----------------------------------------------------------------
function toOklch(hex) {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  return {
    L,
    C: Math.hypot(a, b),
    H: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360
  };
}

function fromOklch({ L, C, H }) {
  const rad = H * Math.PI / 180;
  return oklabToRgb([L, C * Math.cos(rad), C * Math.sin(rad)]);
}

const inGamut = rgb => rgb.every(v => v >= -0.0005 && v <= 1.0005);

/**
 * 超出 sRGB 色域時,保持亮度與色相不動、二分收斂彩度。
 * 先犧牲彩度而不是亮度,色階的 L 曲線才不會被打斷。
 */
function clampChroma({ L, C, H }) {
  if (inGamut(fromOklch({ L, C, H }))) return { L, C, H };
  let lo = 0, hi = C;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(fromOklch({ L, C: mid, H }))) lo = mid;
    else hi = mid;
  }
  return { L, C: lo, H };
}

const oklchToHex = o => rgbToHex(fromOklch(clampChroma(o)));

const formatOklch = o =>
  `oklch(${(o.L * 100).toFixed(1)}% ${o.C.toFixed(3)} ${o.H.toFixed(1)})`;

// --- WCAG ------------------------------------------------------------------
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

module.exports = {
  hexToRgb, rgbToHex,
  toOklch, fromOklch, oklchToHex, clampChroma, formatOklch, inGamut,
  luminance, contrast
};
