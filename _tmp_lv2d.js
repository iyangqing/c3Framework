const fs = require("fs");
const ROOT = "D:/GitWork/iyy/xiaolaodi/xiaolaodibest/wechat-minigame/";
const src = fs.readFileSync(ROOT + "scripts/c3main.js", "utf8");
const project = JSON.parse(fs.readFileSync(ROOT + "pkg-data/data.json", "utf8")).project;
const OBJECTS = project[3].map((o) => o && o[0]);

function splitTop(arr) {
  const out = [];
  let start = 1, d = 0, inStr = false, strQ = "", esc = false;
  for (let k = 1; k < arr.length - 1; k++) {
    const ch = arr[k];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === strQ) inStr = false;
      continue;
    }
    if (ch === "'" || ch === "\"" || ch === "`") { inStr = true; strQ = ch; continue; }
    if (ch === "{" || ch === "(" || ch === "[") d++;
    else if (ch === "}" || ch === ")" || ch === "]") d--;
    else if (ch === "," && d === 0) { out.push(arr.slice(start, k).trim()); start = k + 1; }
  }
  out.push(arr.slice(start, arr.length - 1).trim());
  return out;
}
const i0 = src.indexOf("self.C3_ExpressionFuncs=");
let i = i0 + "self.C3_ExpressionFuncs=".length;
let depth = 0, end = -1;
for (let k = i; k < src.length; k++) {
  if (src[k] === "[") depth++;
  else if (src[k] === "]") { depth--; if (depth === 0) { end = k; break; } }
}
const funcs = splitTop(src.slice(i, end + 1));
[532,533,534,535,536,537,538,539,540,68,396,472].forEach((id) => {
  console.log("EXPR", id, (funcs[id] || "").slice(0, 200));
});

const l2 = project[5].find((l) => l[0] === "layout002");
const gi = OBJECTS.indexOf("gombik");
const pi = OBJECTS.indexOf("prismatak");
console.log("\n===== layout002 gombik/prismatak full instance =====");
(l2[9] || []).forEach((layer, li) => {
  (layer[14] || []).forEach((inst, ii) => {
    if (!Array.isArray(inst)) return;
    if (inst[1] !== gi && inst[1] !== pi) return;
    console.log("\nL"+li+"#"+ii, OBJECTS[inst[1]]);
    console.log(JSON.stringify(inst).slice(0, 900));
  });
});
