/**
 * palette.js — 色票檢查與色階生成 CLI
 *
 * 開發期工具,頁面不會載入。零依賴。
 *
 *   node tools/palette.js check            驗證 tokens.css 現況的對比與雙主題一致性
 *   node tools/palette.js inspect <hex>    看一個色的 OKLCH 座標與它適合的位置
 *   node tools/palette.js ramp <hex>       用該色生九階,附可貼上的區塊
 *
 * check 會直接讀 styles/tokens.css 並遞迴解析 var() 間接引用,
 * 所以你改了語意層對應(例如把 --primary-soft 指到別階),
 * 檢查會自動跟著走,不需要改這支程式。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { toOklch, oklchToHex, formatOklch, contrast } = require("./oklch");

const TOKENS_PATH = path.join(__dirname, "..", "styles", "tokens.css");

/** 每個模式都要通過的對比檢查。用語意變數表述,對應改了也不用動這裡。 */
const CHECKS = [
  ["內文 / 頁面底",     "--text",            "--bg",            4.5],
  ["次要文字 / 頁面底", "--text-secondary",  "--bg",            4.5],
  ["弱化文字 / 頁面底", "--text-muted",      "--bg",            4.5],
  ["連結 / 頁面底",     "--primary",         "--bg",            4.5],
  ["連結 / 區塊底",     "--primary",         "--surface",       4.5],
  ["按鈕字 / 主色底",   "--text-on-primary", "--primary",       4.5],
  ["按鈕字 / hover 底", "--text-on-primary", "--primary-hover", 4.5],
  ["徽章字 / 主色淡底", "--primary",         "--primary-soft",  4.5],
  ["焦點框 / 頁面底",   "--focus-ring",      "--bg",            3.0]
];

/** 九階的亮度與彩度輪廓。彩度走自然弧線:兩端低、中段峰值。 */
const RAMP_PROFILE = [
  { step: 100, L: 0.956, C: 0.021 },
  { step: 200, L: 0.859, C: 0.036 },
  { step: 300, L: 0.756, C: 0.054 },
  { step: 400, L: 0.691, C: 0.062 },
  { step: 500, L: 0.584, C: 0.090 },
  { step: 600, L: 0.541, C: 0.096 },
  { step: 700, L: 0.465, C: 0.084 },
  { step: 800, L: 0.380, C: 0.069 },
  { step: 900, L: 0.300, C: 0.054 }
];

const ROLE_OF_STEP = {
  100: "淺色淡底",
  200: "淺色分隔線 / 淡底 hover",
  300: "深色 hover",
  400: "深色主色",
  500: "裝飾線 / 焦點框",
  600: "淺色主色",
  700: "淺色 hover",
  800: "深色分隔線 / 淡底 hover",
  900: "深色淡底"
};

// --- CSS 解析 --------------------------------------------------------------

/** 抓出最內層的 `選擇器 { 宣告 }`。tokens.css 的 :root 區塊不含巢狀大括號。 */
function parseBlocks(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    blocks.push({
      selector: m[1].trim().replace(/\s+/g, " ").replace(/^.*\{\s*/, ""),
      declarations: parseDeclarations(m[2])
    });
  }
  return blocks;
}

function parseDeclarations(body) {
  const out = {};
  body.split(";").forEach(chunk => {
    const i = chunk.indexOf(":");
    if (i === -1) return;
    const name = chunk.slice(0, i).trim();
    if (name.startsWith("--")) {
      out[name] = chunk.slice(i + 1).trim().replace(/\s+/g, " ");
    }
  });
  return out;
}

function mergeBlocks(blocks, selectorTest) {
  return blocks
    .filter(b => selectorTest(b.selector))
    .reduce((acc, b) => Object.assign(acc, b.declarations), {});
}

/** 遞迴解開 `var(--x)`,回傳最終字面值。 */
function resolve(name, ctx, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const value = ctx[name];
  if (value === undefined) return null;
  const m = value.match(/^var\((--[\w-]+)\)$/);
  return m ? resolve(m[1], ctx, seen) : value;
}

/**
 * @param {string|null} overridePath 額外疊上去的覆寫檔。用於 A/B 一組還沒進
 *   tokens.css 的候選值(例如中性色冷暖比對),檔內所有區塊一律視為原始層覆寫,
 *   不看選擇器,淺深兩個模式都會吃到。
 */
function loadContexts(overridePath) {
  const blocks = parseBlocks(fs.readFileSync(TOKENS_PATH, "utf8"));
  const light = mergeBlocks(blocks, s => s === ":root");
  if (overridePath) {
    const extra = parseBlocks(fs.readFileSync(overridePath, "utf8"));
    Object.assign(light, mergeBlocks(extra, () => true));
  }
  const darkAttr = mergeBlocks(blocks, s => s === ':root[data-theme="dark"]');
  const darkMedia = mergeBlocks(blocks, s => s.includes('data-theme="light"'));
  return { light, dark: Object.assign({}, light, darkAttr), darkAttr, darkMedia };
}

// --- 指令 ------------------------------------------------------------------

function runChecks(label, ctx) {
  console.log(`\n【${label}】`);
  let failed = 0;
  CHECKS.forEach(([name, fgName, bgName, min]) => {
    const fg = resolve(fgName, ctx);
    const bg = resolve(bgName, ctx);
    if (!fg || !bg) {
      console.log(`  ${name.padEnd(18)}  解析不到 ${!fg ? fgName : bgName}`);
      failed++;
      return;
    }
    const v = contrast(fg, bg);
    const pass = v >= min;
    if (!pass) failed++;
    console.log(
      `  ${name.padEnd(18)}${v.toFixed(2).padStart(6)}  >=${min.toFixed(1)}  ` +
      `${pass ? "PASS" : "FAIL"}   ${fg} / ${bg}`
    );
  });
  return failed;
}

function cmdCheck(overridePath) {
  const { light, dark, darkAttr, darkMedia } = loadContexts(overridePath);
  console.log("讀取:styles/tokens.css" + (overridePath ? "  +覆寫:" + overridePath : ""));

  let failed = runChecks("淺色模式", light) + runChecks("深色模式", dark);

  // 深色值在 media query 與 [data-theme] 兩處各寫一份,容易改了一邊忘了另一邊
  console.log("\n【雙主題一致性】");
  const names = new Set([...Object.keys(darkAttr), ...Object.keys(darkMedia)]);
  const drift = [...names].filter(n => darkAttr[n] !== darkMedia[n]);
  if (drift.length === 0) {
    console.log(`  深色兩個區塊的 ${names.size} 個宣告完全一致`);
  } else {
    failed += drift.length;
    drift.forEach(n =>
      console.log(`  不一致 ${n}:  [data-theme]=${darkAttr[n]}  media=${darkMedia[n]}`)
    );
  }

  console.log(failed === 0 ? "\n全部通過\n" : `\n共 ${failed} 項未通過\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

function cmdInspect(hex) {
  const o = toOklch(hex);
  console.log(`\n${hex}   ${formatOklch(o)}`);
  console.log(`  L=${o.L.toFixed(4)}  C=${o.C.toFixed(4)}  H=${o.H.toFixed(1)}\n`);

  const nearest = RAMP_PROFILE.reduce((best, p) =>
    Math.abs(p.L - o.L) < Math.abs(best.L - o.L) ? p : best
  );
  console.log(`  最接近的階:${nearest.step}(${ROLE_OF_STEP[nearest.step]})`);
  console.log(`  亮度差距:${Math.abs(nearest.L - o.L).toFixed(3)}\n`);

  const { light, dark } = loadContexts();
  console.log("  直接拿它當主色的話:");
  [
    ["淺色模式 / 頁面底", resolve("--bg", light)],
    ["淺色模式 / 區塊底", resolve("--surface", light)],
    ["深色模式 / 頁面底", resolve("--bg", dark)],
    ["深色模式 / 區塊底", resolve("--surface", dark)]
  ].forEach(([name, bg]) => {
    const v = contrast(hex, bg);
    console.log(`    ${name.padEnd(20)}${v.toFixed(2).padStart(6)}  >=4.5  ${v >= 4.5 ? "PASS" : "FAIL"}`);
  });
  console.log();
}

function cmdRamp(hex) {
  const src = toOklch(hex);
  const anchor = RAMP_PROFILE.reduce((best, p) =>
    Math.abs(p.L - src.L) < Math.abs(best.L - src.L) ? p : best
  );

  console.log(`\n來源:${hex}  ${formatOklch(src)}`);
  console.log(`色相鎖定 H=${src.H.toFixed(1)},原色放在 ${anchor.step} 階(${ROLE_OF_STEP[anchor.step]})\n`);

  const ramp = {};
  RAMP_PROFILE.forEach(p => {
    ramp[p.step] =
      p.step === anchor.step ? hex.toLowerCase() : oklchToHex({ L: p.L, C: p.C, H: src.H });
  });

  let prevL = null;
  Object.entries(ramp).forEach(([step, value]) => {
    const o = toOklch(value);
    const gap = prevL === null ? "" : `  dL=${(prevL - o.L).toFixed(3)}`;
    prevL = o.L;
    console.log(
      `  ${step.padEnd(5)}${value}  ${formatOklch(o).padEnd(28)}${gap}` +
      `${step === String(anchor.step) ? "  <- 原色" : ""}`
    );
  });

  console.log("\n貼進 tokens.css:");
  Object.entries(ramp).forEach(([step, value]) =>
    console.log(`  --c-brand-${step}: ${value};   /* ${ROLE_OF_STEP[step]} */`)
  );
  console.log("\n套用後記得跑:node tools/palette.js check\n");
}

// --- 進入點 ----------------------------------------------------------------

function help() {
  console.log(`
用法:
  node tools/palette.js check [css]    驗證 tokens.css 現況,可加一個覆寫檔一起驗
  node tools/palette.js inspect <hex>  查一個色的 OKLCH 與適合的位置
  node tools/palette.js ramp <hex>     用該色生九階

範例:
  node tools/palette.js inspect "#A692BA"
  node tools/palette.js ramp "#A692BA"
  node tools/palette.js check styles/tokens-cool.css
`);
}

const [command, argument] = process.argv.slice(2);

try {
  if (command === "check") cmdCheck(argument || null);
  else if (command === "inspect" && argument) cmdInspect(argument);
  else if (command === "ramp" && argument) cmdRamp(argument);
  else help();
} catch (error) {
  console.error("錯誤:" + error.message);
  process.exitCode = 1;
}
