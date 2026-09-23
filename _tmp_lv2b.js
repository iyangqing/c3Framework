const fs = require("fs");
const vm = require("vm");
const ROOT = "D:/GitWork/iyy/xiaolaodi/xiaolaodibest/wechat-minigame/";
const project = JSON.parse(fs.readFileSync(ROOT + "pkg-data/data.json", "utf8")).project;
const OBJECTS = project[3].map((o) => o && o[0]);

const l2 = project[5].find((l) => l[0] === "layout002");
const want = ["limitko_horny", "limitko_dolny", "zabijak", "protizabijak", "zemina_krabica", "bedna", "zabrana_piest"];
want.forEach((name) => {
  const idx = OBJECTS.indexOf(name);
  console.log("\n-- " + name + " #" + idx);
  (l2[9] || []).forEach((layer, li) => {
    (layer[14] || []).forEach((inst, ii) => {
      if (!Array.isArray(inst) || inst[1] !== idx) return;
      const w = inst[0];
      console.log("  L" + li + "#" + ii,
        "x,y", Number(w[0]).toFixed(1), Number(w[1]).toFixed(1),
        "wh", Number(w[3]).toFixed(1) + "x" + Number(w[4]).toFixed(1),
        "ang", ((w[6] || 0) * 180 / Math.PI).toFixed(1),
        "iv", JSON.stringify(inst[3]));
    });
  });
});

console.log("\n===== zemina1 family def =====");
const fam = project[4][0];
console.log(JSON.stringify(fam).slice(0, 800));

console.log("\n===== zemina_piest type behaviors =====");
console.log(JSON.stringify(project[3][172][8]));
console.log("===== zemina1 type (234) =====");
const z = project[3][234];
if (z) {
  console.log("name", z[0], "len", z.length);
  z.forEach((v, i) => console.log(i, Array.isArray(v) ? ("arr"+v.length+" "+JSON.stringify(v).slice(0, 200)) : JSON.stringify(v).slice(0, 80)));
}
