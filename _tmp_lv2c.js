const fs = require("fs");
const vm = require("vm");
const ROOT = "D:/GitWork/iyy/xiaolaodi/xiaolaodibest/wechat-minigame/";
const src = fs.readFileSync(ROOT + "scripts/c3main.js", "utf8");
const project = JSON.parse(fs.readFileSync(ROOT + "pkg-data/data.json", "utf8")).project;
const OBJECTS = project[3].map((o) => o && o[0]);
const FAMILIES = (project[4] || []).map((o) => o && o[0]);
const SHEETS = project[6];

function loadRefs() {
  const anchor = "self.C3_GetObjectRefTable=function(){return[";
  let i = src.indexOf(anchor) + anchor.length - 1;
  let depth = 0, end = -1;
  for (let k = i; k < src.length; k++) {
    if (src[k] === "[") depth++;
    else if (src[k] === "]") { depth--; if (depth === 0) { end = k; break; } }
  }
  function proxy(path) {
    const fn = function () {};
    return new Proxy(fn, {
      get(t, key) {
        if (key === "__path") return path;
        if (typeof key === "symbol") return undefined;
        if (key === "toString" || key === "valueOf" || key === "name") return () => path;
        return proxy(path + "." + key);
      },
      apply() { return proxy(path); }
    });
  }
  const p = proxy("C3");
  const sandbox = { self: { C3: p }, C32: p, C3: p, console };
  vm.createContext(sandbox);
  return vm.runInContext(src.slice(i, end + 1), sandbox)
    .map((v) => String((v && v.__path) || v).replace(/^C3\./, "").replace(/^C32\./, ""));
}
const refs = loadRefs();
function objName(i) {
  if (i === -1) return "System";
  if (i === -2) return "Script";
  if (OBJECTS[i] !== undefined) return OBJECTS[i];
  if (FAMILIES[i] !== undefined) return "Family:" + FAMILIES[i];
  return "obj#" + i;
}
function ace(i) { return (refs[i] || ("ref#" + i)).replace(/^Plugins\./, "").replace(/^Behaviors\./, "Beh."); }

const sidName = new Map();
(project[3] || []).forEach((o) => {
  if (!o || !Array.isArray(o[3])) return;
  o[3].forEach((iv) => {
    if (Array.isArray(iv) && typeof iv[2] === "string") sidName.set(iv[0], o[0] + "." + iv[2]);
  });
});

function decExpr(e, d) {
  if (d > 8 || !Array.isArray(e)) return JSON.stringify(e);
  const t = e[0];
  if (t === 2 && e.length >= 4) return objName(e[1]) + ".ivar" + e[3];
  if (t === 1) return objName(e[1]) + ".exp" + e[2];
  if (t === 0 && e.length === 2 && typeof e[1] === "number") return "num" + e[1];
  if (t === 6) return JSON.stringify(e[1]);
  const parts = e.slice(1).map((x) => decExpr(x, d + 1));
  return "op" + t + "(" + parts.join(",") + ")";
}
function decParam(p) {
  if (!Array.isArray(p)) return JSON.stringify(p);
  const t = p[0], v = p[1];
  if (t === 6) return JSON.stringify(v);
  if (t === 7) return decExpr(v, 0);
  if (t === 16) return String(v);
  if (t === 1 || t === 4 || t === 5) return "@" + objName(Array.isArray(v) ? v[0] : v);
  if (t === 10) return "ivar#" + v;
  if (t === 3) return "b" + v;
  if (t === 0) return Array.isArray(v) ? decExpr(v, 0) : String(v);
  if (t === 8) return "cmp" + v;
  return "t" + t + ":" + JSON.stringify(p).slice(0, 80);
}
function condParams(c) {
  for (const idx of [9, 8]) {
    const cand = c[idx];
    if (Array.isArray(cand) && cand.length && Array.isArray(cand[0])) return cand;
  }
  return [];
}
function actParams(a) {
  if (Array.isArray(a[6]) && a[6].length && Array.isArray(a[6][0])) return a[6];
  return a.slice(6).filter(Array.isArray);
}
function dumpEv(ev, indent) {
  const pad = "  ".repeat(indent);
  const cnds = (ev[6] || []).filter(Array.isArray);
  const acts = (ev[7] || []).filter(Array.isArray);
  const inv = (c) => (c[4] ? "NOT " : "");
  console.log(pad + "WHEN " + (cnds.map((c) => inv(c) + objName(c[0]) + (c[2] ? "." + c[2] : "") + "." + ace(c[1]) + "(" + condParams(c).map(decParam).join(", ") + ")").join(" && ") || "ALWAYS"));
  acts.forEach((a) => {
    const name = a[0] === -2 ? "CALL " + a[1] : objName(a[0]) + (a[2] ? "." + a[2] : "") + "." + ace(a[1]);
    console.log(pad + "  DO " + name + "(" + actParams(a).map(decParam).join(", ") + ")");
  });
  if (Array.isArray(ev[8])) ev[8].forEach((ch) => dumpEv(ch, indent + 1));
}
function findGroup(list, name, acc) {
  for (const ev of list || []) {
    if (!Array.isArray(ev)) continue;
    if (ev[0] === 3) {
      const info = Array.isArray(ev[1]) ? ev[1] : [true, String(ev[1])];
      if (String(info[1]).toLowerCase() === name.toLowerCase()) acc.push(ev);
      findGroup(ev[8], name, acc);
    } else if (ev[0] === 4 || ev[0] === 0) {
      if (Array.isArray(ev[8])) findGroup(ev[8], name, acc);
    }
  }
  return acc;
}

const sheet = SHEETS.find((s) => s[0] === "game_sheet");
for (const name of ["gombik", "menic", "prismatak"]) {
  const gs = findGroup(sheet[1], name, []);
  console.log("\n\n========== " + name + " ==========");
  gs.forEach((g) => dumpEv(g, 0));
}
