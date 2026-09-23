const fs = require("fs");
const src = fs.readFileSync("D:/GitWork/iyy/xiaolaodi/wechat-minigame/scripts/c3main.js", "utf8");
const project = JSON.parse(fs.readFileSync("D:/GitWork/iyy/xiaolaodi/xiaolaodibest/wechat-minigame/pkg-data/data.json", "utf8")).project;
const OBJECTS = project[3].map((o) => o && o[0]);
console.log("Audio object index", OBJECTS.indexOf("Audio"));

function walk(list, ctx) {
  for (const ev of list || []) {
    if (!Array.isArray(ev)) continue;
    if (ev[0] === 3) {
      const name = Array.isArray(ev[1]) ? ev[1][1] : ev[1];
      walk(ev[8], ctx + "/" + name);
    } else if (ev[0] === 4) {
      const name = Array.isArray(ev[1]) ? ev[1].find((x) => typeof x === "string") : "";
      walk(ev[8], ctx + "/fn:" + name);
    } else if (ev[0] === 0) {
      (ev[6] || []).forEach((c) => {
        if (Array.isArray(c) && c[0] === 71) {
          console.log(ctx, "Audio ace", c[1], "inv4", c[4], JSON.stringify(c).slice(0, 240));
        }
      });
      if (Array.isArray(ev[8])) walk(ev[8], ctx);
    }
  }
}
walk(project[6].find((s) => s[0] === "game_sheet")[1], "game");

let i = src.indexOf("async _DoPlay");
console.log("\n_DoPlay\n", src.slice(i, i + 1200));
