"use strict";

GameGlobal.guangAllId = {
  wxAppId: "wx2c1444ff13ec908c",
  rewardIds: ["adunit-b27d9579814391a6"],
  interIds: ["adunit-cf4e98263657fb65"],
  bannerIds: ["adunit-a2056110450543ba"],
  showInterAdMaxTime: 1,
  showInterAdInterval: 1,
  isLog: false
};

// Keep an entry marker outside the adapter so device-only startup failures do
// not disappear before the normal runtime diagnostics are installed.
try { dlog(1,"[Plonky] game entry start"); } catch (eEntryLog) {}

// ---- diagnostic levels -------------------------------------------------------
// Set from the DevTools or 真机调试 console: GameGlobal.__plonkyDiag = 2
//   0 = only real problems (default on devices)
//   1 = + startup / layout / capability state (default in DevTools)
//   2 = + per-texture and per-layout traces
// Info and warnings use console.log/console.warn so the DevTools does not attach a
// stack trace to every diagnostic line.
function diagLevel() {
  var lv = GameGlobal.__plonkyDiag;
  if (lv === undefined) { try { lv = (typeof window !== 'undefined') ? window.__plonkyDiag : undefined; } catch (eD0) {} }
  if (lv === undefined) { try { lv = (typeof globalThis !== 'undefined') ? globalThis.__plonkyDiag : undefined; } catch (eD1) {} }
  if (lv === false) return 0;
  if (typeof lv === 'number') return lv;
  // Quiet by default. Set GameGlobal.__plonkyDiag = 1 (state) or 2 (per-frame traces) if needed.
  return 0;
}
function dlog(level) {
  if (diagLevel() < level) return;
  try { console.log.apply(console, Array.prototype.slice.call(arguments, 1)); } catch (e) {}
}
function dwarn(level) {
  if (diagLevel() < level) return;
  try { console.warn.apply(console, Array.prototype.slice.call(arguments, 1)); } catch (e) {}
}

// Hide the "no ads" purchase button (object "no_ads_btn" - the red crossed-out ADS icon)
// wherever it appears: the main menu and the in-game pause / options menu.
// Hidden at the *instance* level (SetVisible is intercepted, so no event can bring it back)
// and re-applied by a watchdog, because the project re-shows it from its events and builds
// the pause menu inside a container. Pure runtime change; data.json is untouched.
// Set GameGlobal.__plonkyHideNoAds = false to get the button back.
// Hide the round plate(s) that sit under the hidden no-ads icon (same coordinates).
function hidePlatesBehind(rt, iconInstances) {
  try {
    var pts = [];
    for (var i = 0; i < iconInstances.length; i++) {
      var ins = iconInstances[i];
      try {
        if (ins && typeof ins.GetX === "function") pts.push([ins.GetX(), ins.GetY()]);
      } catch (eP) {}
    }
    if (!pts.length) return 0;
    var names = ["tlacko", "tlacko_ibaobr", "obdlznik_btn"];
    var hiddenPlates = 0;
    for (var n = 0; n < names.length; n++) {
      var oc = null;
      try { oc = rt.GetObjectClassByName ? rt.GetObjectClassByName(names[n]) : null; } catch (eOc) {}
      if (!oc || typeof oc.GetInstances !== "function") continue;
      var list = oc.GetInstances();
      for (var k = 0; k < list.length; k++) {
        var plate = list[k];
        try {
          if (typeof plate.GetX !== "function") continue;
          var px = plate.GetX(), py = plate.GetY();
          for (var p = 0; p < pts.length; p++) {
            if (Math.abs(px - pts[p][0]) <= 8 && Math.abs(py - pts[p][1]) <= 8) {
              lockNoAdsVisible(plate);
              try {
                if (typeof plate.GetWorldInfo === "function") lockNoAdsVisible(plate.GetWorldInfo());
              } catch (ePlateWi) {}
              try { plate.SetVisible(false); } catch (ePlateVis) {}
              hiddenPlates++;
              break;
            }
          }
        } catch (ePlate) {}
      }
    }
    if (hiddenPlates && GameGlobal.__plonkyPlateCount !== hiddenPlates) {
      GameGlobal.__plonkyPlateCount = hiddenPlates;
      dlog(1, "[Plonky] hid the round plate(s) under the no-ads icon: " + hiddenPlates);
    }
    return hiddenPlates;
  } catch (ePlates) { return 0; }
}

// Force an object (plugin instance or its WorldInfo) permanently invisible: SetVisible is
// replaced with a wrapper that always passes false, and the prototype is wrapped too so other
// wrappers (e.g. Construct's plugin-level event action) are intercepted as well.
function lockNoAdsVisible(obj) {
  if (!obj || obj.__plonkyNoAdsLocked) return false;
  obj.__plonkyNoAdsLocked = true;
  try {
    obj.__plonkyNoAdsOrigSetVisible = obj.SetVisible;
    obj.SetVisible = function () {
      try { return this.__plonkyNoAdsOrigSetVisible.call(this, false); } catch (eOwn) {}
    };
  } catch (eOwnAssign) {}
  try {
    var proto = Object.getPrototypeOf(obj);
    if (proto && !proto.__plonkyNoAdsProtoLocked) {
      proto.__plonkyNoAdsProtoLocked = true;
      var origProto = proto.SetVisible;
      if (typeof origProto === "function") {
        proto.SetVisible = function (v) {
          if (this && this.__plonkyNoAdsLocked) {
            try { return this.__plonkyNoAdsOrigSetVisible.call(this, false); } catch (eForce) {}
          }
          return origProto.apply(this, arguments);
        };
      }
    }
  } catch (eProto) {}
  return true;
}

function findNoAdsObjectClass(rt) {
  try {
    if (rt && typeof rt.GetObjectClassByName === "function") {
      var byName = rt.GetObjectClassByName("no_ads_btn");
      if (byName) return byName;
    }
  } catch (eByName) {}
  try {
    if (rt && typeof rt.GetObjectClassByIndex === "function") {
      for (var i = 0; i < 1024; i++) {
        var oc = null;
        try { oc = rt.GetObjectClassByIndex(i); } catch (eIdx) { break; }
        if (!oc) break;
        var nm = "";
        try { nm = String(oc.GetName ? oc.GetName() : ""); } catch (eNm) {}
        if (/no[_-]?ads/i.test(nm)) {
          dlog(1, "[Plonky] no-ads object found by index: " + nm);
          return oc;
        }
      }
    }
  } catch (eWalk) {}
  return null;
}

function hideNoAdsButton(rt) {
  if (GameGlobal.__plonkyHideNoAds === false) return 0;
  try {
    if (!rt) return 0;
    var oc = findNoAdsObjectClass(rt);
    if (!oc) {
      if (!GameGlobal.__plonkyNoAdsMissing) {
        GameGlobal.__plonkyNoAdsMissing = true;
        dwarn(1, "[Plonky] no-ads button object not found (its instances were removed, this is expected)");
      }
      return 0;
    }
    var insts = typeof oc.GetInstances === "function" ? oc.GetInstances() : [];
    var seen = 0;
    for (var i = 0; i < insts.length; i++) {
      var inst = insts[i];
      if (!inst) continue;
      try {
        lockNoAdsVisible(inst);
        try {
          if (typeof inst.GetWorldInfo === "function") lockNoAdsVisible(inst.GetWorldInfo());
        } catch (eWi) {}
        try { inst.SetVisible(false); } catch (eVis) {}
        seen++;
      } catch (eInst) {}
    }
    if (!GameGlobal.__plonkyNoAdsProbe) {
      GameGlobal.__plonkyNoAdsProbe = true;
      var probeInst = insts[0] || null;
      var probeWi = null;
      try { probeWi = probeInst && probeInst.GetWorldInfo ? probeInst.GetWorldInfo() : null; } catch (eProbeWi) {}
      dwarn(1, "[Plonky] no-ads probe: class=" + (oc ? "found(" + (oc.GetName ? oc.GetName() : "?") + ")" : "MISSING")
        + " instances=" + insts.length
        + " inst.SetVisible=" + (probeInst ? typeof probeInst.SetVisible : "n/a")
        + " worldInfo=" + (probeWi ? "yes" : "no"));
    }
    // The icon is one object; the orange round plate behind it is a generic button object.
    // Hide any plate instance that shares the icon's position so the whole button disappears
    // (buttons are ~90 units apart, the tolerance is 8, so neighbours are safe).
    hidePlatesBehind(rt, insts);

    if (seen && GameGlobal.__plonkyNoAdsCount !== seen) {
      GameGlobal.__plonkyNoAdsCount = seen;
      dlog(1, "[Plonky] no-ads button locked hidden (" + seen + " instance(s))");
    }
    return seen;
  } catch (eNoads) { return 0; }
}

function instXY(inst) {
  try { if (inst && typeof inst.GetX === "function") return [inst.GetX(), inst.GetY()]; } catch (e0) {}
  try {
    var wi = inst && inst.GetWorldInfo ? inst.GetWorldInfo() : null;
    if (wi && typeof wi.GetX === "function") return [wi.GetX(), wi.GetY()];
  } catch (e1) {}
  return null;
}

function fontTextOf(inst) {
  var t = "";
  try { if (inst && inst._text != null) t = String(inst._text); } catch (e0) {}
  try { if (!t && inst && typeof inst.GetText === "function") t = String(inst.GetText()); } catch (e1) {}
  try {
    if (!t && inst && inst._sdkInst) {
      var sdk = inst._sdkInst;
      if (sdk._text != null) t = String(sdk._text);
      else if (sdk._str != null) t = String(sdk._str);
    }
  } catch (e2) {}
  return t;
}

function lockAndHideInst(inst) {
  if (!inst) return false;
  try { lockNoAdsVisible(inst); } catch (eL) {}
  try { if (typeof inst.GetWorldInfo === "function") lockNoAdsVisible(inst.GetWorldInfo()); } catch (eW) {}
  try { if (typeof inst.SetVisible === "function") inst.SetVisible(false); } catch (eV) {}
  try {
    var wi = inst.GetWorldInfo ? inst.GetWorldInfo() : null;
    if (wi) {
      try { if (typeof wi.SetVisible === "function") wi.SetVisible(false); } catch (eV2) {}
      try { wi.isVisible = false; } catch (eV3) {}
    }
  } catch (eWi) {}
  return true;
}

// Hide the original in-game "REVIVE" + camera-icon video button. Our overlay owns revive now.
// Set GameGlobal.__plonkyHideOrigRevive = false to show it again.
function hideOriginalReviveButton(rt) {
  if (GameGlobal.__plonkyHideOrigRevive === false) return 0;
  try {
    if (!rt || typeof rt.GetObjectClassByName !== "function") return 0;
    function hasReviveTag(inst) {
      try { if (inst && typeof inst.HasTag === "function" && inst.HasTag("revive_btn")) return true; } catch (e0) {}
      try {
        var tags = inst && inst._tagsSet;
        if (tags && typeof tags.has === "function" && tags.has("revive_btn")) return true;
        if (tags && tags.revive_btn) return true;
      } catch (e1) {}
      try {
        var arr = inst && inst._tags;
        if (arr && arr.indexOf && arr.indexOf("revive_btn") >= 0) return true;
      } catch (e2) {}
      return false;
    }
    function isReviveFont(inst) {
      if (/revive/i.test(fontTextOf(inst))) return true;
      try {
        var v = inst && inst._instVarValues;
        if (v && /revive/i.test(String(v[0] || ""))) return true;
      } catch (eV) {}
      return false;
    }
    var hid = 0;
    var pts = [];
    function consider(inst, force) {
      if (!inst) return;
      if (!force && !hasReviveTag(inst)) return;
      if (lockAndHideInst(inst)) hid++;
      var xy = instXY(inst);
      if (xy) pts.push(xy);
    }
    var names = ["video", "obdlznik_btn", "font1", "tlacko", "tlacko_ibaobr"];
    for (var n = 0; n < names.length; n++) {
      var oc = null;
      try { oc = rt.GetObjectClassByName(names[n]); } catch (eN) {}
      if (!oc) continue;
      var list = [];
      try { if (typeof oc.GetInstances === "function") list = oc.GetInstances() || []; } catch (eG) {}
      if (!list.length) { try { if (typeof oc._GetInstances === "function") list = oc._GetInstances() || []; } catch (eG2) {} }
      for (var i = 0; i < list.length; i++) {
        var inst = list[i];
        if (hasReviveTag(inst) || (names[n] === "font1" && isReviveFont(inst))) consider(inst, true);
      }
    }
    if (pts.length) {
      // Only the camera plate / icon. Do NOT hide nearby `tlacko` — the pause
      // menu puts 重来 / 下一关 next to the video button; locking those
      // makes the restart tap fall through to goto_next_level.
      var nearNames = ["video", "obdlznik_btn", "font1"];
      for (var n2 = 0; n2 < nearNames.length; n2++) {
        var oc2 = null;
        try { oc2 = rt.GetObjectClassByName(nearNames[n2]); } catch (eN2) {}
        if (!oc2) continue;
        var list2 = [];
        try { if (typeof oc2.GetInstances === "function") list2 = oc2.GetInstances() || []; } catch (eG3) {}
        if (!list2.length) { try { if (typeof oc2._GetInstances === "function") list2 = oc2._GetInstances() || []; } catch (eG4) {} }
        for (var k = 0; k < list2.length; k++) {
          var inst2 = list2[k];
          var p = instXY(inst2);
          if (!p) continue;
          for (var t = 0; t < pts.length; t++) {
            var dx = p[0] - pts[t][0], dy = p[1] - pts[t][1];
            if (dx * dx + dy * dy <= 120 * 120) {
              lockAndHideInst(inst2);
              hid++;
              break;
            }
          }
        }
      }
    }
    if (hid && GameGlobal.__plonkyOrigReviveCount !== hid) {
      GameGlobal.__plonkyOrigReviveCount = hid;
      dwarn(1, "[Plonky] hid original REVIVE video button (" + hid + " instance(s))");
    }
    return hid;
  } catch (eRev) { return 0; }
}

function instHasTag(inst, tag) {
  try { if (inst && typeof inst.HasTag === "function" && inst.HasTag(tag)) return true; } catch (e0) {}
  try {
    var tags = inst && inst._tagsSet;
    if (tags && typeof tags.has === "function" && tags.has(tag)) return true;
    if (tags && tags[tag]) return true;
  } catch (e1) {}
  try {
    var arr = inst && inst._tags;
    if (arr && arr.indexOf && arr.indexOf(tag) >= 0) return true;
  } catch (e2) {}
  return false;
}

function instAnimName(inst) {
  try {
    var an = inst && inst.GetAnimation && inst.GetAnimation();
    var nm = an && (an.GetName ? an.GetName() : an.name || an._name);
    if (nm) return String(nm);
  } catch (e0) {}
  try { if (inst && inst._animationName) return String(inst._animationName); } catch (e1) {}
  return "";
}

function instNameOf(inst) {
  var n = "";
  try { if (inst && typeof inst.GetInstanceName === "function") n = String(inst.GetInstanceName() || ""); } catch (e0) {}
  if (!n) { try { n = String(inst._instanceName || inst._instName || inst._name || ""); } catch (e1) {} }
  return n;
}

function instAnimNameDeep(inst) {
  var n = instAnimName(inst);
  if (n) return n;
  try {
    var sdk = inst && (inst.GetSdkInstance ? inst.GetSdkInstance() : inst._sdkInst);
    if (sdk) {
      if (typeof sdk.GetCurrentAnimationName === "function") n = String(sdk.GetCurrentAnimationName() || "");
      if (!n && typeof sdk.GetAnimationName === "function") n = String(sdk.GetAnimationName() || "");
      if (!n && sdk._currentAnimation) {
        n = String(sdk._currentAnimation._name || (sdk._currentAnimation.GetName && sdk._currentAnimation.GetName()) || "");
      }
    }
  } catch (eS) {}
  return n || "";
}

function instLooksPrivacy(inst) {
  if (!inst) return false;
  if (instHasTag(inst, "privacy_btn")) return true;
  if (/privacy/i.test(instNameOf(inst))) return true;
  if (/privacy/i.test(instAnimNameDeep(inst))) return true;
  try {
    var wi = inst.GetWorldInfo ? inst.GetWorldInfo() : null;
    var kids = wi && (typeof wi.GetChildren === "function" ? wi.GetChildren() : wi._children);
    if (kids && kids.length) {
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        var ki = k && (k.GetInstance ? k.GetInstance() : k._inst || k);
        if (ki && ki !== inst && (/privacy/i.test(instAnimNameDeep(ki)) || /privacy/i.test(instNameOf(ki)))) return true;
      }
    }
  } catch (eC) {}
  return false;
}

// Pause/options "隐私政策" round button (named instance privacy_btn + tlacko_ibaobr anim privacy_zh).
function hidePrivacyButton(rt) {
  if (GameGlobal.__plonkyHidePrivacy === false) return 0;
  try {
    if (!rt || typeof rt.GetObjectClassByName !== "function") return 0;
    var hid = 0;
    function consider(inst) {
      if (!inst) return;
      if (lockAndHideInst(inst)) hid++;
      try {
        var wi = inst.GetWorldInfo ? inst.GetWorldInfo() : null;
        var par = wi && (typeof wi.GetParent === "function" ? wi.GetParent() : wi._parent);
        var pi = par && (par.GetInstance ? par.GetInstance() : par._inst || par);
        if (pi && pi !== inst) lockAndHideInst(pi);
      } catch (eP) {}
    }
    try {
      if (typeof rt.GetInstanceByName === "function") consider(rt.GetInstanceByName("privacy_btn"));
    } catch (eNm) {}
    var names = ["tlacko", "tlacko_ibaobr", "obdlznik_btn"];
    for (var n = 0; n < names.length; n++) {
      var oc = null;
      try { oc = rt.GetObjectClassByName(names[n]); } catch (eN) {}
      if (!oc) continue;
      var list = [];
      try { if (typeof oc.GetInstances === "function") list = oc.GetInstances() || []; } catch (eG) {}
      if (!list.length) { try { if (typeof oc._GetInstances === "function") list = oc._GetInstances() || []; } catch (eG2) {} }
      for (var i = 0; i < list.length; i++) {
        if (instLooksPrivacy(list[i])) consider(list[i]);
      }
    }
    if (hid && GameGlobal.__plonkyPrivacyCount !== hid) {
      GameGlobal.__plonkyPrivacyCount = hid;
      dwarn(1, "[Plonky] hid privacy policy button (" + hid + " instance(s))");
    }
    return hid;
  } catch (ePr) { return 0; }
}

(function captureWasm() {
  function usable(wa) {
    return !!(wa && wa !== GameGlobal.WXWebAssembly && typeof wa.instantiate === "function" && typeof wa.Memory === "function");
  }
  var wa = null;
  var tag = "none";
  try {
    if (usable(typeof WebAssembly === "object" ? WebAssembly : null)) {
      wa = WebAssembly;
      tag = "free";
    }
  } catch (e) {}
  try {
    if (!wa && usable(GameGlobal.WebAssembly)) {
      wa = GameGlobal.WebAssembly;
      tag = "GameGlobal";
    }
  } catch (e2) {}
  if (!wa) {
    try {
      var stolen = Function("return typeof WebAssembly!=='undefined'&&WebAssembly")();
      if (usable(stolen)) {
        wa = stolen;
        tag = "Function";
      }
    } catch (e3) {}
  }
  if (wa) GameGlobal.__NativeWebAssembly = wa;
})();

function trace(msg) {
  if (GameGlobal.__plonkyReady) return;
  try {
    wx.showLoading({ title: String(msg).slice(0, 12), mask: false });
  } catch (e3) {}
}

try {
  wx.onError(function (res) {
    console.error("[Plonky] wx.onError", res && (res.message || res));
  });
} catch (e) {}
try {
  wx.onUnhandledRejection(function (res) {
    console.error("[Plonky] unhandledRejection", res && (res.reason || res));
  });
} catch (e) {}

trace("game.js 开始");
try {
  require("./adapter/index.js");
} catch (adapterError) {
  try { console.error("[Plonky] adapter load failed", adapterError && (adapterError.stack || adapterError.message || adapterError)); } catch (eAdapterLog) {}
  try { wx.showModal({ title: "启动失败", content: String(adapterError && (adapterError.message || adapterError)).slice(0, 180), showCancel: false }); } catch (eAdapterModal) {}
  throw adapterError;
}
trace("adapter 完成");
try {
  if (GameGlobal.guangAllId) {
    try { GameGlobal.window && (GameGlobal.window.guangAllId = GameGlobal.guangAllId); } catch (eW0) {}
    try { if (typeof window !== "undefined" && window) window.guangAllId = GameGlobal.guangAllId; } catch (eW1) {}
  }
} catch (eSync) {}
try {
  require("./iyySdk.js");
  var _iyy = GameGlobal.iyySdk && GameGlobal.iyySdk.Ins;
  if (_iyy) {
    _iyy.init(GameGlobal.guangAllId);
  }
} catch (eSdk) {
  console.warn("[Plonky] iyySdk load failed - " + (eSdk && eSdk.message));
}
GameGlobal.__plonkyPlayReward = function (onEnded) {
  var cb = typeof onEnded === "function" ? onEnded : function () {};
  if (GameGlobal.__plonkyRewardShowing) {
    if (!GameGlobal.__plonkyRewardWaiters) GameGlobal.__plonkyRewardWaiters = [];
    GameGlobal.__plonkyRewardWaiters.push(cb);
    return;
  }
  GameGlobal.__plonkyRewardShowing = true;
  GameGlobal.__plonkyRewardWaiters = [];
  var finished = false;
  function finish(ended) {
    if (finished) return;
    finished = true;
    GameGlobal.__plonkyRewardShowing = false;
    try { GameGlobal.__plonkyRewardActiveUntil = 0; } catch (eActiveEnd) {}
    var extra = GameGlobal.__plonkyRewardWaiters || [];
    GameGlobal.__plonkyRewardWaiters = [];
    try { cb(!!ended); } catch (eCb) {}
    for (var i = 0; i < extra.length; i++) {
      try { extra[i](!!ended); } catch (eW) {}
    }
  }
  try {
    var sdk = GameGlobal.iyySdk && GameGlobal.iyySdk.Ins;
    if (!sdk || typeof sdk.showAd !== "function") { finish(false); return; }
    sdk.showAd("reward", 0, finish);
  } catch (eR) {
    finish(false);
  }
};
GameGlobal.__plonkyPlayInter = function () {
  try {
    var sdk = GameGlobal.iyySdk && GameGlobal.iyySdk.Ins;
    if (!sdk || typeof sdk.showAd !== "function") return;
    sdk.showAd("inter", 0);
  } catch (eI) {}
};

GameGlobal.__runJobWorker = function () {
  require("./scripts/jobworker.js");
};
GameGlobal.__runDispatchWorker = function () {
  require("./scripts/dispatchworker.js");
};

(function bindHostDocument() {
  var fake = GameGlobal.__document || GameGlobal.document;
  if (!fake || typeof fake.querySelector !== "function") return;
  var host = null;
  try { host = document; } catch (e) {}
  if (!host || host === fake) return;
  var names = [
    "querySelector", "querySelectorAll", "createElement", "createElementNS", "createTextNode",
    "getElementById", "getElementsByTagName", "getElementsByClassName", "createEvent",
    "addEventListener", "removeEventListener", "dispatchEvent", "hasFocus", "exitFullscreen",
    "elementFromPoint", "appendChild", "removeChild"
  ];
  for (var i = 0; i < names.length; i++) {
    var n = names[i];
    if (typeof fake[n] === "function") {
      try {
        Object.defineProperty(host, n, {
          configurable: true,
          writable: true,
          value: fake[n].bind(fake)
        });
      } catch (e) {
        try { host[n] = fake[n].bind(fake); } catch (e2) {}
      }
    }
  }
  try { host.documentElement = fake.documentElement; } catch (e) {}
  try { host.body = fake.body; } catch (e) {}
  try { host.head = fake.head; } catch (e) {}
  try { host.readyState = "complete"; } catch (e) {}
  try { host.location = fake.location; } catch (e) {}
})();

(function bindHostWindowFocus() {
  function safeFocus() {}
  function safeBlur() {}
  var targets = [];
  try { targets.push(GameGlobal); } catch (e) {}
  try { if (typeof window !== "undefined") targets.push(window); } catch (e2) {}
  try { if (typeof self !== "undefined") targets.push(self); } catch (e3) {}
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    if (!t) continue;
    try {
      Object.defineProperty(t, "focus", { configurable: true, writable: true, enumerable: true, value: safeFocus });
    } catch (e4) {
      try { t.focus = safeFocus; } catch (e5) {}
    }
    try {
      Object.defineProperty(t, "blur", { configurable: true, writable: true, enumerable: true, value: safeBlur });
    } catch (e6) {
      try { t.blur = safeBlur; } catch (e7) {}
    }
  }
})();

(function bindHostWindowEvents() {
  var src = GameGlobal;
  var host = null;
  try { host = window; } catch (e) {}
  if (!host) return;
  // On device, window and GameGlobal can be reciprocal proxies. Forwarding
  // event methods between them recurses; this bridge is only for DevTools.
  if (!isDevtools()) return;
  try { GameGlobal.__hostWindow = host; } catch (e0) {}
  if (host === src) return;

  // Keep listeners on the object C3 actually uses (host window).
  try {
    Object.defineProperty(host, "addEventListener", {
      configurable: true, writable: true, enumerable: true,
      value: function (type, fn, opt) { return src.addEventListener.call(host, type, fn, opt); }
    });
  } catch (e4) {
    try { host.addEventListener = function (type, fn, opt) { return src.addEventListener.call(host, type, fn, opt); }; } catch (e5) {}
  }
  try {
    Object.defineProperty(host, "removeEventListener", {
      configurable: true, writable: true, enumerable: true,
      value: function (type, fn, opt) { return src.removeEventListener.call(host, type, fn, opt); }
    });
  } catch (e6) {
    try { host.removeEventListener = function (type, fn, opt) { return src.removeEventListener.call(host, type, fn, opt); }; } catch (e7) {}
  }
  try {
    Object.defineProperty(host, "dispatchEvent", {
      configurable: true, writable: true, enumerable: true,
      value: function (ev) { return src.dispatchEvent.call(host, ev); }
    });
  } catch (e8) {
    try { host.dispatchEvent = function (ev) { return src.dispatchEvent.call(host, ev); }; } catch (e9) {}
  }

  // Unity/Laya/Cocos DevTools inject: copy adapter globals onto real window.
  var keys = [
    "canvas", "screencanvas", "document", "navigator", "location", "Image", "ImageData",
    "Audio", "AudioContext", "webkitAudioContext", "URL", "atob", "btoa", "fetch", "XMLHttpRequest",
    "Worker", "requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout",
    "setInterval", "clearInterval", "innerWidth", "innerHeight", "devicePixelRatio",
    "performance", "localStorage", "indexedDB", "WebAssembly", "HTMLElement",
    "HTMLCanvasElement", "HTMLImageElement", "OffscreenCanvas", "focus", "blur"
  ];
  for (var i = 0; i < keys.length; i++) {
    var n = keys[i];
    var val = src[n];
    if (val === undefined) continue;
    try {
      var desc = Object.getOwnPropertyDescriptor(host, n);
      if (desc && desc.configurable === false) continue;
      Object.defineProperty(host, n, {
        configurable: true, writable: true, enumerable: true, value: val
      });
    } catch (e10) {
      try { host[n] = val; } catch (e11) {}
    }
  }
  try { host.parent = host; } catch (eP) {}
  try { host.top = host; } catch (eT) {}
  try {
    dlog(1,"[Plonky] host window inject canvas=", !!(host.canvas), "doc=", !!(host.document));
  } catch (eLog) {}
})();

// ---------------------------------------------------------------------------
// Death-signal + controls watcher (top level, independent of the runtime hooks).
// Prints one liveness line, then one line per state change. GameGlobal.__plonkyWatch = false disables it.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Death guard: dying makes the project re-enter the level layout (instances are rebuilt), which is why
// hiding-hooks and polling both missed it. The layout change itself is the interception point: while the
// on-screen controls are hidden, the change is held so the death frame stays on screen.
// ---------------------------------------------------------------------------
(function plonkyDeathGuard() {
  if (GameGlobal.__plonkyDeathFreeze === false) return;
  function rt() {
    try { if (GameGlobal.__plonkyRuntime) return GameGlobal.__plonkyRuntime; } catch (e0) {}
    try { if (typeof getLocalRuntime === 'function') return getLocalRuntime(window.c3_runtimeInterface); } catch (e1) {}
    try { if (self.c3_runtimeInterface && self.c3_runtimeInterface._localRuntime) return self.c3_runtimeInterface._localRuntime; } catch (e2) {}
    return null;
  }
  function controlsHidden(r) {
    try {
      var oc = r.GetObjectClassByName ? r.GetObjectClassByName('controls') : null;
      if (!oc) return false;
      var list = (typeof oc._GetInstances === 'function' ? oc._GetInstances() : []) || [];
      if (!list.length) return false;
      var hidden = 0;
      for (var i = 0; i < list.length; i++) {
        var wi = null;
        try { wi = list[i].GetWorldInfo ? list[i].GetWorldInfo() : null; } catch (eW) {}
        if (wi && typeof wi.IsVisible === 'function' && !wi.IsVisible()) hidden++;
      }
      return hidden >= Math.max(1, list.length - 1);   // all (or all but one) hidden = death
    } catch (eC) { return false; }
  }
  var held = null, lastLayoutRestart = null, installed = false, reports = 0, origChange = null;
  function install() {
    if (installed) return true;
    var r = rt();
    if (!r) return false;
    var proto = null;
    try { proto = Object.getPrototypeOf(r); } catch (eP) {}
    if (!proto || typeof proto._DoChangeLayout !== 'function') return false;
    var orig = proto._DoChangeLayout;
    origChange = orig;
    proto._DoChangeLayout = function () {
      try {
        var dialogUp = false;
        try { dialogUp = !!(GameGlobal.__plonkyDialogIsOpen && GameGlobal.__plonkyDialogIsOpen()); } catch (eD) {}
        var deathPending = false;
        try { deathPending = !!GameGlobal.__plonkyDeathPending; } catch (ePend) {}
        var ignore = false;
        try { ignore = !!(GameGlobal.__plonkyIgnoreRestartHook); } catch (eIg) {}
        // Original death flow is restart_level -> fade -> Wait 5 -> RestartLayout.
        // Hold that RestartLayout (not the restart_level call) so the wait actually runs,
        // then show the overlay at the original restart moment.
        if (!ignore && (dialogUp || deathPending)) {
          held = { args: arguments, self: this };
          lastLayoutRestart = { args: arguments, self: this };
          GameGlobal.__plonkyDeathHold = true;
          try {
            var lm = this.GetLayoutManager ? this.GetLayoutManager() : null;
            if (lm && typeof lm.ClearPendingChangeLayout === 'function') lm.ClearPendingChangeLayout();
          } catch (eClr) {}
          if (!dialogUp && deathPending) {
            if (reports < 8) { reports++; console.warn('[Plonky] death: RestartLayout held - auto in-place revive then dialog'); }
            try {
              if (GameGlobal.__plonkyAutoReviveThenShow) GameGlobal.__plonkyAutoReviveThenShow();
              else if (GameGlobal.__plonkyShowDialog) GameGlobal.__plonkyShowDialog('original restart timing');
            } catch (eS) {}
          } else if (reports < 8) {
            reports++;
            console.warn('[Plonky] death: layout change held while dialog is open');
          }
          return Promise.resolve();
        }
      } catch (eG) {}
      GameGlobal.__plonkyDeathHold = false;
      held = null;
      var ret = orig.apply(this, arguments);
      try {
        if (ret && typeof ret.then === 'function') {
          return ret.then(function (v) {
            try { if (GameGlobal.__plonkyUncoverTick) GameGlobal.__plonkyUncoverTick(); } catch (eU) {}
            return v;
          });
        }
      } catch (eThen) {}
      try { if (GameGlobal.__plonkyUncoverTick) GameGlobal.__plonkyUncoverTick(); } catch (eU2) {}
      return ret;
    };
    installed = true;
    console.warn('[Plonky] death-guard: installed on _DoChangeLayout');
    return true;
  }
  function dropHold() {
    GameGlobal.__plonkyDeathHold = false;
    held = null;
  }
  function applyHold() {
    var h = held;
    dropHold();
    if (!h || !origChange) return false;
    try {
      var ret = origChange.apply(h.self, h.args);
      try { GameGlobal.__plonkyHeldLayoutPromise = ret; } catch (eP) {}
      try {
        var rTs = rt();
        if (rTs && typeof rTs.SetTimeScale === 'function') rTs.SetTimeScale(1);
      } catch (eTs) {}
      console.warn('[Plonky] death: applying held RestartLayout');
      return true;
    } catch (eA) {
      try { GameGlobal.__plonkyHeldLayoutPromise = null; } catch (eP2) {}
      console.warn('[Plonky] death: apply held layout failed - ' + (eA && eA.message));
      return false;
    }
  }
  function restartSameLayout() {
    var h = lastLayoutRestart;
    if (!h || !origChange) return false;
    try {
      var ret = origChange.apply(h.self, h.args);
      try { GameGlobal.__plonkyHeldLayoutPromise = ret; } catch (eP) {}
      try {
        var rTs = rt();
        if (rTs && typeof rTs.SetTimeScale === 'function') rTs.SetTimeScale(1);
      } catch (eTs) {}
      console.warn('[Plonky] death: RestartLayout again after overlay closed');
      return true;
    } catch (eA) {
      try { GameGlobal.__plonkyHeldLayoutPromise = null; } catch (eP2) {}
      console.warn('[Plonky] death: post-dialog RestartLayout failed - ' + (eA && eA.message));
      return false;
    }
  }
  GameGlobal.__plonkyDropHeldLayout = dropHold;
  GameGlobal.__plonkyApplyHeldLayout = applyHold;
  GameGlobal.__plonkyRestartSameLayout = restartSameLayout;
  GameGlobal.__plonkyRevive = function () {
    dropHold();
    return true;
  };
  GameGlobal.__plonkyGiveUp = function () {
    return applyHold();
  };
  function callGlobal(name, arg) {
    try {
      var fn = GameGlobal[name];
      if (typeof fn === 'function') { fn(arg); return true; }
    } catch (e) { try { console.error('##### call ' + name + ' failed: ' + (e && e.message)); } catch (e2) {} }
    return false;
  }
  var tickCount2 = 0;
  function tick() {
    tickCount2++;
    callGlobal('__plonkyGlOverlayTick', undefined);
    callGlobal('__plonkyUncoverTick', undefined);
    callGlobal('__plonkySelfHeal', undefined);
    callGlobal('__plonkyFlagTrigger', undefined);
    if (tickCount2 % 5 === 0) callGlobal('__plonkyPublishHelpers', undefined);
    callGlobal('__plonkyStamp', 'tick#' + tickCount2);
    callGlobal('__plonkyAutoProbeFn', undefined);
    callGlobal('__plonkyAutoDialogTestFn', undefined);
    try { install(); } catch (eT) {}
    try { setTimeout(tick, 500); } catch (eN) {}
  }
  try { setTimeout(tick, 900); } catch (eS) {}
})();

// ---------------------------------------------------------------------------
// Revive dialog (additive, minimal risk): draws the panel + two choices into the presented frame and
// owns the touch input while it is up. Nothing in the game or its events is modified.
// ---------------------------------------------------------------------------
(function plonkyReviveDialog() {
  if (GameGlobal.__plonkyReviveDialog === false) return;
  var PATHS = { bg: 'pkg-res/images/revive_bg.png', yes: 'pkg-res/images/revive_yes.png', no: 'pkg-res/images/revive_no.png' };
  var pics = {}, shown = false, lastState = '', ready = false, notes = 0;
  var reviveInterTimer = null, chooseBusy = false;
  var nativeUp = false;
  var glDrawOk = 0;          // incremented by glOverlayTick for every successful WebGL draw
  var glDrawFail = 0;
  // ---- native dialog (wx.showModal) ------------------------------------------------------------
  // `alert` is only a console stub in the mini-game; wx.showModal is the real platform dialog. It is
  // drawn by the platform itself, so it also works where the custom canvas overlay has no 2D present
  // surface (the adapter's `sole-webgl` mode on devices).
  function platformName() {
    try { if (GameGlobal.__plonkyPlatform) return GameGlobal.__plonkyPlatform; } catch (eP0) {}
    try {
      var info = null;
      if (typeof wx !== 'undefined') {
        if (typeof wx.getDeviceInfo === 'function') info = wx.getDeviceInfo();
        else if (typeof wx.getSystemInfoSync === 'function') info = wx.getSystemInfoSync();
      }
      var p = info && (info.platform || info.system);
      if (p) { GameGlobal.__plonkyPlatform = String(p).toLowerCase(); return GameGlobal.__plonkyPlatform; }
    } catch (eP1) {}
    return '';
  }
  function isSimulator() {
    var p = platformName();
    if (p) return p.indexOf('devtools') >= 0;
    return !!GameGlobal.__usePresentBlit;      // fall back to the render path when unknown
  }
  function dialogMode() {
    return 'artwork';
  }
  GameGlobal.__plonkyPlatformName = platformName;
  function showNativeDialog() {
    return false;
  }
  GameGlobal.__plonkyDialogMode = dialogMode;
  GameGlobal.__plonkyNativeUp = function () { return nativeUp; };
  function loadViaImage(path) {
    // platform image loader -> offscreen 2D canvas -> RGBA. This is the only route that works on devices,
    // where the packaged files are not reachable through readFileSync at all.
    return new Promise(function (resolve) {
      try {
        if (typeof wx === 'undefined' || typeof wx.createImage !== 'function') return resolve({ error: 'no wx.createImage' });
        var img = wx.createImage();
        var done = false;
        var timer = setTimeout(function () {
          if (!done) { done = true; resolve({ error: 'image load timed out' }); }
        }, 4000);
        img.onload = function () {
          if (done) return;
          done = true;
          try { clearTimeout(timer); } catch (eT) {}
          resolve({ width: img.width, height: img.height, source: img, path: path });
        };
        img.onerror = function () {
          if (done) return;
          done = true;
          try { clearTimeout(timer); } catch (eT2) {}
          resolve({ error: 'image load failed' });
        };
        img.src = path;
      } catch (e) { resolve({ error: (e && e.message) || String(e) }); }
    });
  }
  function decodeDirect(path) {
    // fallback loader: read the file with the mini-game API and decode with the adapter's decoder
    try {
      if (typeof wx === 'undefined' || !wx.getFileSystemManager) return null;
      var fsm = wx.getFileSystemManager();
      var data = fsm.readFileSync(path);
      var u8 = null;
      if (data instanceof ArrayBuffer) u8 = new Uint8Array(data);
      else if (data && data.buffer instanceof ArrayBuffer) u8 = new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength || 0);
      if (!u8 || !u8.length) return null;
      var dec = GameGlobal.__plonkyDecodePng;
      if (typeof dec !== 'function') return null;
      var out = dec(u8);
      return (out && out.then) ? out : Promise.resolve(out);
    } catch (eD) {
      return Promise.resolve({ error: 'direct read failed: ' + (eD && (eD.errMsg || eD.message)) });
    }
  }
  function loadOne(key, path) {
    var file = String(path).replace(/^.*\//, '');
    var attempts = [
      { how: 'image', arg: 'images/' + file },
      { how: 'image', arg: path },
      { how: 'image', arg: '/pkg-res/images/' + file },
      { how: 'adapter', arg: path },
      { how: 'adapter', arg: '/pkg-res/images/' + file },
      { how: 'direct', arg: path },
      { how: 'direct', arg: '/pkg-res/images/' + file },
      { how: 'direct', arg: 'pkg-res/images/' + file },
      { how: 'direct', arg: 'images/' + file },
      { how: 'direct', arg: '/images/' + file }
    ];
    var i = 0;
    function next() {
      if (i >= attempts.length) {
        if (notes < 12) { notes++; console.warn('[Plonky] dialog: gave up on ' + key + ' (all ' + attempts.length + ' attempts failed)'); }
        return;
      }
      var at = attempts[i++];
      var p = null;
      try {
        if (at.how === 'adapter') {
          var loader = GameGlobal.__plonkyLoadPngImage;
          p = (typeof loader === 'function') ? Promise.resolve(loader(at.arg)) : Promise.resolve({ error: 'no adapter loader' });
        } else if (at.how === 'image') {
          p = loadViaImage(at.arg);
        } else {
          p = decodeDirect(at.arg);
          if (!p) p = Promise.resolve({ error: 'not attempted' });
        }
      } catch (eA) { p = Promise.resolve({ error: (eA && eA.message) || String(eA) }); }
      Promise.resolve(p).then(function (res) {
        if (res && res.width && (res.data || res.source)) {
          pics[key] = res;
          if (notes < 12) { notes++; console.warn('[Plonky] dialog: loaded ' + key + ' ' + res.width + 'x' + res.height + ' via ' + at.how + ' <- ' + at.arg); }
          try { if (shown) spawnC3Dialog(); } catch (eSp) {}
        } else {
          if (notes < 12) { notes++; console.warn('[Plonky] dialog: ' + key + ' attempt ' + at.how + ' ' + at.arg + ' -> ' + ((res && res.error) || 'no result')); }
          next();
        }
      }, function (err) {
        if (notes < 12) { notes++; console.warn('[Plonky] dialog: ' + key + ' attempt ' + at.how + ' threw - ' + ((err && err.message) || err)); }
        next();
      });
    }
    next();
  }
  try { loadOne('bg', PATHS.bg); loadOne('yes', PATHS.yes); loadOne('no', PATHS.no); ready = !!(pics.bg); } catch (eL) {}
  if (!ready) { try { console.warn('[Plonky] dialog: no bg image - decoder=' + (typeof GameGlobal.__plonkyDecodePng) + ', will draw plain panel'); } catch (eN2) {} }
  function rt() {
    try { if (GameGlobal.__plonkyRuntime) return GameGlobal.__plonkyRuntime; } catch (e0) {}
    try { if (typeof getLocalRuntime === 'function') return getLocalRuntime(window.c3_runtimeInterface); } catch (e1) {}
    try { if (self.c3_runtimeInterface && self.c3_runtimeInterface._localRuntime) return self.c3_runtimeInterface._localRuntime; } catch (e2) {}
    return null;
  }
  var seen = { n: 0, controlsHidden: 0, panel: -1, lastWhy: '' };
  function instancesOf(r, name) {
    try {
      var oc = r.GetObjectClassByName ? r.GetObjectClassByName(name) : null;
      if (!oc) return [];
      return (typeof oc._GetInstances === 'function' ? oc._GetInstances() : []) || [];
    } catch (e) { return []; }
  }
  function detect(r) {
    // signal A: the on-screen controls are all hidden
    var hid = 0, tot = 0;
    try {
      var list = instancesOf(r, 'controls');
      tot = list.length;
      for (var i = 0; i < list.length; i++) {
        var wi = null; try { wi = list[i].GetWorldInfo ? list[i].GetWorldInfo() : null; } catch (eW) {}
        if (wi && typeof wi.IsVisible === 'function' && !wi.IsVisible()) hid++;
      }
    } catch (eA) {}
    seen.controlsHidden = hid;
    if (tot && hid >= Math.max(1, tot - 1)) return 'controls hidden (' + hid + '/' + tot + ')';
    // signal B: the project moved its own failure-panel button into view (parked at x~4588)
    try {
      var btns = instancesOf(r, 'restart_btn');
      if (btns.length) {
        var x = -1;
        try { var w2 = btns[0].GetWorldInfo ? btns[0].GetWorldInfo() : null; if (w2) x = w2.GetX(); } catch (eX) {}
        seen.panel = x;
        if (x >= 0 && x < 1500) return 'failure panel shown (restart_btn x=' + Math.round(x) + ')';
      }
    } catch (eB) {}
    return '';
  }
  var suspended = false, lastChoiceAt = 0, savedTimeScale = null;
  function runtimeRef() { return rt(); }
  function callRt(r, names, arg) {
    for (var i = 0; i < names.length; i++) {
      try {
        if (r && typeof r[names[i]] === 'function') { r[names[i]](arg); return names[i]; }
      } catch (eC) {}
    }
    return '';
  }
  function suspendGame() {
    try {
      var r = runtimeRef();
      if (!r) {
        console.warn('[Plonky] dialog: runtime missing - cannot freeze yet');
        return;
      }
      if (!suspended) {
        try {
          if (typeof r.GetTimeScale === 'function') savedTimeScale = r.GetTimeScale();
          else if ('_timeScale' in r) savedTimeScale = r._timeScale;
        } catch (eTs) { savedTimeScale = 1; }
        // Do not SetSuspended: that cancels C3's RAF, so neither the original
        // revive sprites nor our C3 copies can paint. Freeze with timescale only.
        callRt(r, ['SetTimeScale', 'setTimeScale'], 0);
        try { if (typeof r._timeScale === 'number') r._timeScale = 0; } catch (eDt) {}
        suspended = true;
        console.warn('[Plonky] dialog: runtime FROZEN via timescale (C3 still renders)' +
          ' suspendCount=' + (typeof r.IsSuspended === 'function' ? r.IsSuspended() : '?') +
          ' ts=' + (typeof r.GetTimeScale === 'function' ? r.GetTimeScale() : r._timeScale));
      } else {
        try { if (typeof r._timeScale === 'number' && r._timeScale !== 0) r._timeScale = 0; } catch (eTs2) {}
        callRt(r, ['SetTimeScale', 'setTimeScale'], 0);
      }
    } catch (e) { console.warn('[Plonky] dialog: suspend failed - ' + (e && e.message)); }
  }
  function resetC3Renderer(r) {
    try {
      if (!r) r = runtimeRef();
      if (!r) return false;
      var rnd = null;
      try { if (typeof r.GetRenderer === 'function') rnd = r.GetRenderer(); } catch (eG) {}
      if (!rnd) {
        try {
          var cm = r._canvasManager || (typeof r.GetCanvasManager === 'function' && r.GetCanvasManager());
          if (cm && typeof cm.GetRenderer === 'function') rnd = cm.GetRenderer();
          if (!rnd && cm) rnd = cm._renderer;
        } catch (eC) {}
      }
      if (!rnd) { try { rnd = r._renderer; } catch (eR) {} }
      if (!rnd) return false;
      try { if (typeof rnd.EndBatch === 'function') rnd.EndBatch(); } catch (eE) {}
      try {
        var bs = rnd._batchState;
        if (bs) {
          bs.currentShader = null;
          bs.currentFramebuffer = null;
        }
      } catch (eBs) {}
      try { rnd._lastProgram = null; } catch (eP) {}
      try { rnd._currentStateGroup = null; } catch (eS) {}
      try { rnd._topOfBatch = 0; } catch (eT) {}
      try { rnd._batchPtr = 0; } catch (eB) {}
      try { rnd._currentRenderTarget = null; } catch (eRt) {}
      try {
        if (GameGlobal.__plonkyRestoreC3Attribs && GameGlobal.__plonkyGl) {
          GameGlobal.__plonkyRestoreC3Attribs(GameGlobal.__plonkyGl);
        }
      } catch (eRa) {}
      console.warn('[Plonky] gl: C3 renderer batch reset');
      return true;
    } catch (e) {
      console.warn('[Plonky] gl: renderer reset failed - ' + (e && e.message));
      return false;
    }
  }
  function releaseStuckInput() {
    try {
      var r = rt(); if (!r) return 0;
      var released = 0;
      var classes = [];
      try { if (r._allObjectClasses && r._allObjectClasses.length) classes = r._allObjectClasses; } catch (eA) {}
      try {
        if (typeof r.GetObjectClassByName === 'function') {
          var touchCls = r.GetObjectClassByName('Touch');
          if (touchCls) classes = classes.concat([touchCls]);
          var mouseCls = r.GetObjectClassByName('Mouse');
          if (mouseCls) classes = classes.concat([mouseCls]);
        }
      } catch (eNm) {}
      for (var i = 0; i < classes.length; i++) {
        var oc = classes[i], list = [];
        try {
          var nm = oc && typeof oc.GetName === 'function' ? oc.GetName() : null;
          if (nm && typeof r.GetObjectClassByName === 'function') {
            var byName = r.GetObjectClassByName(nm);
            if (byName) oc = byName;
          }
        } catch (eN) {}
        try { if (oc && typeof oc._GetInstances === 'function') list = oc._GetInstances() || []; } catch (eI) {}
        if (!list.length) { try { if (oc && typeof oc.GetInstances === 'function') list = oc.GetInstances() || []; } catch (eI2) {} }
        for (var j = 0; j < list.length; j++) {
          var sdk = null;
          try { sdk = list[j] && list[j]._sdkInst ? list[j]._sdkInst : null; } catch (eS) {}
          if (!sdk) { try { if (list[j] && typeof list[j].GetSdkInstance === 'function') sdk = list[j].GetSdkInstance(); } catch (eG) {} }
          if (!sdk) continue;
          try { if (sdk._isMouseDown) { sdk._isMouseDown = false; released++; } } catch (eM) {}
          var touches = null;
          try { touches = sdk._touches; } catch (eT) {}
          if (!touches || typeof touches.forEach !== 'function') continue;
          var ids = [];
          try { touches.forEach(function (info, id) { ids.push(id); }); } catch (eF) {}
          for (var k = 0; k < ids.length; k++) {
            var info = null;
            try { info = touches.get(ids[k]); } catch (eGet) {}
            try { if (info && typeof info.Release === 'function') info.Release(); } catch (eRel) {}
            try { touches.delete(ids[k]); released++; } catch (eDel) {}
          }
          try { if (typeof touches.clear === 'function') touches.clear(); } catch (eC) {}
        }
      }
      if (released) console.warn('[Plonky] input: released ' + released + ' stuck pointer(s)');
      return released;
    } catch (e) {
      console.warn('[Plonky] input: release failed - ' + (e && e.message));
      return 0;
    }
  }
  function resumeGame(why) {
    if (!suspended) return;
    suspended = false;
    try {
      var r = runtimeRef();
      var ts = (savedTimeScale == null || savedTimeScale === 0) ? 1 : savedTimeScale;
      savedTimeScale = null;
      if (r) {
        callRt(r, ['SetTimeScale', 'setTimeScale'], ts);
        try { if (typeof r._timeScale === 'number') r._timeScale = ts; } catch (eDt) {}
        var n = 0;
        while (n < 8) {
          var still = false;
          try { still = !!(typeof r.IsSuspended === 'function' && r.IsSuspended()); } catch (eIs) {}
          if (!still) break;
          callRt(r, ['SetSuspended', 'setSuspended'], false);
          n++;
        }
        try { resetC3Renderer(r); } catch (eRs) {}
        try { releaseStuckInput(); } catch (eIn) {}
      }
      console.warn('[Plonky] dialog: runtime RESUMED (' + why + ')');
    } catch (e) { console.warn('[Plonky] dialog: resume failed - ' + (e && e.message)); }
  }
  GameGlobal.__plonkySuspend = suspendGame;
  GameGlobal.__plonkyResumeGame = resumeGame;
  GameGlobal.__plonkyShowDialog = function (why) {
    if (shown) return false;
    shown = true;
    try { console.warn('[Plonky] dialog: shown (' + (why || 'requested') + ')'); } catch (e) {}
    try { console.warn('[Plonky] dialog: advert state at show - ' + advertStateText()); } catch (eAS) {}
    try { captureCheckpoint(); } catch (eCap) {}
    console.warn('[Plonky] dialog: mode=artwork (platform ' + (platformName() || '?') + ')');
    if (!pics.bg) console.warn('[Plonky] dialog: artwork images unavailable - overlay will show the scrim only');
    ovDirty = true;
    try {
      var sz = GameGlobal.__plonkyGlSize ? GameGlobal.__plonkyGlSize() : null;
      if (sz && sz.w && sz.h) layout = computeLayout(sz.w, sz.h);
    } catch (eLay) {}
    try { spawnC3Dialog(); } catch (eSp) { console.warn('[Plonky] dialog: spawn C3 sprites failed - ' + (eSp && eSp.message)); }
    try {
      setTimeout(function () { if (shown) spawnC3Dialog(); }, 50);
      setTimeout(function () { if (shown) spawnC3Dialog(); }, 200);
    } catch (eT) {}
    try {
      if (reviveInterTimer) { clearTimeout(reviveInterTimer); reviveInterTimer = null; }
      reviveInterTimer = setTimeout(function () {
        reviveInterTimer = null;
        try {
          if (shown && GameGlobal.__plonkyPlayInter) GameGlobal.__plonkyPlayInter();
        } catch (eIn) {}
      }, 700);
    } catch (eT2) {}
    return true;
  };
  function hide() {
    shown = false;
    try {
      if (reviveInterTimer) { clearTimeout(reviveInterTimer); reviveInterTimer = null; }
    } catch (eTm) {}
    try { destroyC3Dialog(); } catch (eDs) {}
    try { GameGlobal.__plonkyOvBlitOk = false; } catch (eBlit) {}
    try { GameGlobal.__plonkyHoldScreen = false; } catch (eHold) {}
    try {
      if (ovRaf) {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(ovRaf);
        else clearTimeout(ovRaf);
        ovRaf = null;
      }
    } catch (eRaf) {}
    try { releaseStuckInput(); } catch (eIn) {}
    try { console.warn('[Plonky] dialog: hidden'); } catch (e) {}
  }
  // ---- advert state reset -------------------------------------------------------------------
  // CreateRewarded() starts with `if (null == this.rewardedState && null == this.videoState)`, so a
  // state left as "loaded"/"shown" makes every later request a silent no-op and the dialog never
  // appears again. The SDK instance is not reachable through GetObjectClassByName('MobileAdvert'),
  // so scan every object class the runtime holds and pick the instance that has an _sdkInst.
  function eachObjectClass(r) {
    var out = [];
    try { if (r && r._allObjectClasses && r._allObjectClasses.length) return r._allObjectClasses; } catch (eA) {}
    try {
      if (r && r._objectClasses) {
        for (var k in r._objectClasses) { try { out.push(r._objectClasses[k]); } catch (eK) {} }
      }
    } catch (eO) {}
    return out;
  }
  function advertSdkInstances() {
    var r = rt(); if (!r) return { classes: 0, insts: 0, sdks: [] };
    var classes = eachObjectClass(r), insts = 0, sdks = [];
    for (var i = 0; i < classes.length; i++) {
      var oc = classes[i], list = [];
      // _allObjectClasses entries hand back no instances - resolve the class by name first
      try {
        var nm = (oc && typeof oc.GetName === 'function') ? oc.GetName() : null;
        if (nm && typeof r.GetObjectClassByName === 'function') {
          var byName = r.GetObjectClassByName(nm);
          if (byName) oc = byName;
        }
      } catch (eNm2) {}
      try { if (oc && typeof oc._GetInstances === 'function') list = oc._GetInstances() || []; } catch (eI) {}
      if (!list.length) { try { if (oc && typeof oc.GetInstances === 'function') list = oc.GetInstances() || []; } catch (eI2) {} }
      insts += list.length;
      for (var j = 0; j < list.length; j++) {
        var sdk = null;
        try { sdk = list[j] && list[j]._sdkInst ? list[j]._sdkInst : null; } catch (eS) {}
        if (!sdk) { try { if (list[j] && typeof list[j].GetSdkInstance === 'function') sdk = list[j].GetSdkInstance(); } catch (eG) {} }
        if (!sdk) continue;
        if (!('rewardedState' in sdk) && !('videoState' in sdk) && !('rewardedInterstitialState' in sdk)) continue;
        sdks.push(sdk);
      }
    }
    return { classes: classes.length, insts: insts, sdks: sdks };
  }
  function advertStateText() {
    try {
      var f = advertSdkInstances();
      if (!f.sdks.length) return 'no advert sdk instance (classes=' + f.classes + ' instances=' + f.insts + ')';
      var parts = [];
      for (var i = 0; i < f.sdks.length; i++) {
        var sdk = f.sdks[i];
        parts.push('rewarded=' + String(sdk.rewardedState) + ' video=' + String(sdk.videoState) +
          ' rewardedInterstitial=' + String(sdk.rewardedInterstitialState));
      }
      return parts.join(' | ');
    } catch (eT) { return 'state read failed: ' + (eT && eT.message); }
  }
  GameGlobal.__plonkyAdvertState = advertStateText;
  function isBlockedAdToastText(s) {
    var t = String(s || '').replace(/\s+/g, ' ');
    var u = t.toUpperCase();
    if (!u) return false;
    if (u.indexOf('REWARDED') >= 0 || u.indexOf('NOT AVAILABLE') >= 0) return true;
    if (u.indexOf('NO INTERNET') >= 0 || (u.indexOf('CONNECTION') >= 0 && u.indexOf('NO') >= 0)) return true;
    if (u.indexOf('PURCHASE') >= 0 && u.indexOf('FAIL') >= 0) return true;
    if (t.indexOf('失败') >= 0 || t.indexOf('无法') >= 0 || t.indexOf('暂无') >= 0) return true;
    if (t.indexOf('没有网络') >= 0 || t.indexOf('无网络') >= 0) return true;
    return false;
  }
  function wrapAdToastText() {
    try {
      var C3 = self.C3;
      var plugins = C3 && C3.Plugins;
      if (!plugins) return;
      var names = Object.keys(plugins);
      for (var i = 0; i < names.length; i++) {
        var Acts = plugins[names[i]] && plugins[names[i]].Acts;
        if (!Acts) continue;
        ['SetText', 'SetValue'].forEach(function (an) {
          if (typeof Acts[an] !== 'function' || Acts[an].__plonkyToastSkip) return;
          var orig = Acts[an];
          Acts[an] = function (v) {
            try { if (isBlockedAdToastText(v)) return; } catch (eS) {}
            return orig.apply(this, arguments);
          };
          Acts[an].__plonkyToastSkip = true;
        });
      }
    } catch (eW) {}
  }
  function hideAdToast(runtime) {
    try {
      var r = runtime || rt();
      if (!r || typeof r.GetObjectClassByName !== 'function') return 0;
      var hid = 0;
      var names = ['font1', 'font2', 'textik'];
      for (var n = 0; n < names.length; n++) {
        var oc = null;
        try { oc = r.GetObjectClassByName(names[n]); } catch (eN) {}
        if (!oc) continue;
        var list = [];
        try { if (typeof oc.GetInstances === 'function') list = oc.GetInstances() || []; } catch (eG) {}
        if (!list.length) { try { if (typeof oc._GetInstances === 'function') list = oc._GetInstances() || []; } catch (eG2) {} }
        for (var i = 0; i < list.length; i++) {
          var inst = list[i];
          var txt = '';
          try {
            var sdk = inst.GetSdkInstance ? inst.GetSdkInstance() : inst._sdkInst;
            if (sdk && typeof sdk.GetText === 'function') txt = sdk.GetText();
            else if (inst.GetText) txt = inst.GetText();
            else if (inst._text) txt = inst._text;
          } catch (eT) {}
          if (!isBlockedAdToastText(txt)) continue;
          try { if (typeof inst.SetVisible === 'function') inst.SetVisible(false); } catch (eV) {}
          hid++;
        }
      }
      try {
        var oc2 = r.GetObjectClassByName('tlacko_ibaobr');
        var list2 = [];
        if (oc2) {
          try { if (typeof oc2.GetInstances === 'function') list2 = oc2.GetInstances() || []; } catch (eG3) {}
          if (!list2.length) { try { if (typeof oc2._GetInstances === 'function') list2 = oc2._GetInstances() || []; } catch (eG4) {} }
        }
        for (var k = 0; k < list2.length; k++) {
          var inst2 = list2[k];
          var anim = String(animNameOf(inst2) || '').toLowerCase();
          if (anim !== 'ad_zh_rewarded' && anim !== 'ad_zh_inter') continue;
          var wi2 = inst2.GetWorldInfo && inst2.GetWorldInfo();
          var x2 = wi2 && typeof wi2.GetX === 'function' ? wi2.GetX() : -1;
          var y2 = wi2 && typeof wi2.GetY === 'function' ? wi2.GetY() : 9999;
          if (!(x2 >= 0 && x2 < 900 && y2 < 140)) continue;
          try { if (typeof inst2.SetVisible === 'function') inst2.SetVisible(false); } catch (eV2) {}
          hid++;
        }
      } catch (eZh) {}
      return hid;
    } catch (eH) { return 0; }
  }
  GameGlobal.__plonkyHideAdToastNow = hideAdToast;
  function animNameOf(inst) {
    try {
      var sdk = inst && (inst._sdkInst || (inst.GetSdkInstance && inst.GetSdkInstance()));
      if (sdk) {
        if (sdk._currentAnimation) {
          var a0 = sdk._currentAnimation;
          return String((a0.GetName && a0.GetName()) || a0._name || a0.name || "");
        }
        if (typeof sdk.GetAnimation === "function") {
          var a1 = sdk.GetAnimation();
          if (a1) return String((a1.GetName && a1.GetName()) || a1._name || "");
        }
      }
    } catch (e0) {}
    return "";
  }
  function instIsVisible(inst) {
    try {
      var wi = inst && inst.GetWorldInfo && inst.GetWorldInfo();
      if (wi && typeof wi.IsVisible === "function" && !wi.IsVisible()) return false;
      if (wi && wi.isVisible === false) return false;
    } catch (eV) {}
    return true;
  }
  function canvasHitsWatchLabel(runtime, cssX, cssY) {
    try {
      if (!runtime || typeof runtime.GetObjectClassByName !== "function") return false;
      var oc = runtime.GetObjectClassByName("tlacko_ibaobr");
      if (!oc) return false;
      var list = [];
      try { if (typeof oc.GetInstances === "function") list = oc.GetInstances() || []; } catch (eG) {}
      if (!list.length) { try { if (typeof oc._GetInstances === "function") list = oc._GetInstances() || []; } catch (eG2) {} }
      for (var i = 0; i < list.length; i++) {
        var inst = list[i];
        if (!instIsVisible(inst)) continue;
        var anim = animNameOf(inst).toLowerCase();
        if (anim !== "ad_zh_watch" && anim !== "ad_zh_unlocklev") continue;
        if (anim === "ad_zh_watch" && !GameGlobal.__plonkySkinMenuOpen) continue;
        if (anim === "ad_zh_unlocklev" && !GameGlobal.__plonkyWellDoneOpen) continue;
        var wi = inst.GetWorldInfo && inst.GetWorldInfo();
        if (!wi) continue;
        try {
          var sw = wi.GetWidth(), sh = wi.GetHeight();
          if (sw > 700 || sh > 400) continue;
        } catch (eSz) {}
        var lx = cssX, ly = cssY;
        try {
          var layer = wi.GetLayer && wi.GetLayer();
          if (layer && typeof layer.CanvasCssToLayer === "function") {
            var pt = layer.CanvasCssToLayer(cssX, cssY);
            if (pt) {
              if (typeof pt.x === "number") { lx = pt.x; ly = pt.y; }
              else if (pt.length >= 2) { lx = pt[0]; ly = pt[1]; }
            }
          } else if (layer && typeof layer.CssPxToLayer === "function") {
            var pt2 = layer.CssPxToLayer(cssX, cssY);
            if (pt2) {
              if (typeof pt2.x === "number") { lx = pt2.x; ly = pt2.y; }
              else if (pt2.length >= 2) { lx = pt2[0]; ly = pt2[1]; }
            }
          }
        } catch (eC) {}
        try {
          if (typeof wi.ContainsPoint === "function" && wi.ContainsPoint(lx, ly)) return true;
        } catch (eP) {}
        try {
          var x = wi.GetX(), y = wi.GetY(), w = wi.GetWidth(), h = wi.GetHeight();
          var ox = 0.5, oy = 0.5;
          try { ox = wi.GetOriginX(); oy = wi.GetOriginY(); } catch (eO) {}
          var l = x - w * ox, t = y - h * oy;
          if (lx >= l && lx <= l + w && ly >= t && ly <= t + h) return true;
        } catch (eB) {}
      }
    } catch (eH) {}
    return false;
  }
  function skinVideoTargetAt(runtime, cssX, cssY) {
    try {
      if (!runtime) return "";
      function instances(className) {
        try {
          var objectClass = runtime.GetObjectClassByName && runtime.GetObjectClassByName(className);
          if (!objectClass) return [];
          var list = [];
          try { if (typeof objectClass.GetInstances === "function") list = objectClass.GetInstances() || []; } catch (eGet) {}
          if (!list.length) { try { if (typeof objectClass._GetInstances === "function") list = objectClass._GetInstances() || []; } catch (ePrivate) {} }
          return list;
        } catch (eClass) { return []; }
      }
      function position(instance) {
        try {
          var wi = instance && instance.GetWorldInfo && instance.GetWorldInfo();
          return wi ? { x: wi.GetX(), y: wi.GetY() } : null;
        } catch (ePosition) { return null; }
      }
      function name(instance) {
        try { if (typeof instance.GetInstanceVariableValue === "function") return String(instance.GetInstanceVariableValue(12) || ""); } catch (ePublic) {}
        try { return String((instance._instVarValues || [])[12] || ""); } catch (ePrivate) { return ""; }
      }
      var videos = instances("video"), skins = instances("tlacko");
      for (var i = 0; i < videos.length; i++) {
        var video = videos[i];
        if (!instIsVisible(video)) continue;
        var vwi = video.GetWorldInfo && video.GetWorldInfo();
        if (!vwi) continue;
        var lx = cssX, ly = cssY;
        try {
          var layer = vwi.GetLayer && vwi.GetLayer();
          if (layer && typeof layer.CanvasCssToLayer === "function") {
            var pt = layer.CanvasCssToLayer(cssX, cssY);
            if (pt) { lx = typeof pt.x === "number" ? pt.x : pt[0]; ly = typeof pt.y === "number" ? pt.y : pt[1]; }
          } else if (layer && typeof layer.CssPxToLayer === "function") {
            var pt2 = layer.CssPxToLayer(cssX, cssY);
            if (pt2) { lx = typeof pt2.x === "number" ? pt2.x : pt2[0]; ly = typeof pt2.y === "number" ? pt2.y : pt2[1]; }
          }
        } catch (eConvert) {}
        var hit = false;
        try { if (typeof vwi.ContainsPoint === "function") hit = !!vwi.ContainsPoint(lx, ly); } catch (ePoint) {}
        if (!hit) {
          try {
            var vx = vwi.GetX(), vy = vwi.GetY(), vw = vwi.GetWidth(), vh = vwi.GetHeight();
            hit = lx >= vx - vw * 0.5 && lx <= vx + vw * 0.5 && ly >= vy - vh * 0.5 && ly <= vy + vh * 0.5;
          } catch (eBounds) {}
        }
        if (!hit) continue;
        var vp = position(video), best = "", bestDist = Infinity;
        for (var j = 0; j < skins.length; j++) {
          var id = name(skins[j]), sp = position(skins[j]);
          if (!/^typek\d+$/i.test(id) || !vp || !sp) continue;
          var dx = sp.x - vp.x, dy = sp.y - vp.y, dist = dx * dx + dy * dy;
          if (Math.abs(dx) <= 90 && dy > -30 && dy <= 180 && dist < bestDist) {
            bestDist = dist;
            best = id;
          }
        }
        if (best) { console.warn("[Plonky] skin-video-hit skin=" + best); return best; }
      }
    } catch (eHit) {}
    return "";
  }
  if (GameGlobal.__plonkySkinMenuOpen && GameGlobal.__plonkySkinTouchLogAt !== Math.floor(Date.now() / 1000)) {
    GameGlobal.__plonkySkinTouchLogAt = Math.floor(Date.now() / 1000);
    console.warn("[Plonky] skin-touch handler active");
  }
  function hideSkinRewardPrompt(runtime) {
    try {
      if (!runtime || typeof runtime.GetObjectClassByName !== "function") return;
      function instances(className) {
        try {
          var objectClass = runtime.GetObjectClassByName(className);
          if (!objectClass) return [];
          var list = [];
          try { if (typeof objectClass.GetInstances === "function") list = objectClass.GetInstances() || []; } catch (eGet) {}
          if (!list.length) { try { if (typeof objectClass._GetInstances === "function") list = objectClass._GetInstances() || []; } catch (ePrivate) {} }
          return list;
        } catch (eClass) { return []; }
      }
      function hide(instance) {
        try { if (instance && typeof instance.SetVisible === "function") instance.SetVisible(false); } catch (eInst) {}
        try { var wi = instance && instance.GetWorldInfo && instance.GetWorldInfo(); if (wi && typeof wi.SetVisible === "function") wi.SetVisible(false); } catch (eWorld) {}
      }
      instances("tlacko_ibaobr").forEach(function (instance) {
        if (animNameOf(instance).toLowerCase() === "ad_zh_watch") hide(instance);
      });
      instances("obdlznik_btn").forEach(function (instance) {
        var name = "";
        try { name = typeof instance.GetInstanceVariableValue === "function" ? String(instance.GetInstanceVariableValue(12) || "") : String((instance._instVarValues || [])[12] || ""); } catch (eName) {}
        if (name === "video_btn" && !instance.__plonkySkinButtonClone) hide(instance);
      });
    } catch (eHide) {}
  }
  function fireWatchUnlockReward(targetSkinId) {
    if (GameGlobal.__plonkyUnlockTapLock) return;
    var skinRewardId = targetSkinId || "";
    try {
      if (GameGlobal.__plonkySkinMenuOpen && GameGlobal.__plonkyCurrentSkinReward) {
        if (!skinRewardId) skinRewardId = GameGlobal.__plonkyCurrentSkinReward() || "";
      }
    } catch (eSkinId) {}
    console.warn("[Plonky] skin-video-reward request skin=" + (skinRewardId || "unknown"));
    if (skinRewardId) {
      try { hideSkinRewardPrompt(rt()); } catch (eHidePrompt) {}
      try {
        [0, 80, 300, 1000].forEach(function (delay) {
          setTimeout(function () { try { hideSkinRewardPrompt(rt()); } catch (eHideLater) {} }, delay);
        });
      } catch (eHideTimers) {}
    }
    GameGlobal.__plonkyUnlockTapLock = true;
    try { setTimeout(function () { GameGlobal.__plonkyUnlockTapLock = false; }, 1600); } catch (eT) {}
    try { GameGlobal.__plonkyInUkazRewarded = true; } catch (eF) {}
    try { markRewardedLoaded(); } catch (eM) {}
    try {
      if (typeof GameGlobal.__plonkyPlayReward === "function") {
        GameGlobal.__plonkyPlayReward(function (ended) {
          if (!ended) return;
          if (skinRewardId) {
            try {
              if (GameGlobal.__plonkyGrantSkinReward && GameGlobal.__plonkyGrantSkinReward(skinRewardId)) return;
            } catch (eSkinGrant) {}
          }
          if (GameGlobal.__plonkyInUkazRewardedCall) return;
          try { GameGlobal.__plonkyRewardGrantOnly = true; } catch (eG) {}
          try {
            var r = rt();
            if (r && typeof r.callFunction === "function") r.callFunction("ukaz_rewarded", "");
          } catch (eC) {}
          try { setTimeout(function () { GameGlobal.__plonkyRewardGrantOnly = false; }, 800); } catch (eG2) {}
        });
      }
    } catch (eR) {}
  }
  function watchPointerCss(touchSdk, data) {
    var rt0 = (touchSdk && (touchSdk._runtime || (touchSdk.GetRuntime && touchSdk.GetRuntime()))) || rt();
    var pageX = data && (data.pageX != null ? data.pageX : data.clientX);
    var pageY = data && (data.pageY != null ? data.pageY : data.clientY);
    var ox = 0, oy = 0;
    try { if (rt0 && typeof rt0.GetCanvasClientX === "function") ox = rt0.GetCanvasClientX(); } catch (eX) {}
    try { if (rt0 && typeof rt0.GetCanvasClientY === "function") oy = rt0.GetCanvasClientY(); } catch (eY) {}
    return { rt: rt0, x: pageX - ox, y: pageY - oy };
  }
  var watchTapWrapped = false;
  function wrapWatchUnlockTap() {
    if (watchTapWrapped) return true;
    try {
      var C3 = self.C3;
      var TouchInst = C3 && C3.Plugins && C3.Plugins.Touch && C3.Plugins.Touch.Instance;
      var proto = TouchInst && TouchInst.prototype;
      if (!proto || typeof proto._OnPointerDown !== "function") return false;
      function maybeFire(sdk, data) {
        if (!data) return;
        var p = watchPointerCss(sdk, data);
        var target = skinVideoTargetAt(p.rt, p.x, p.y);
        if (target) fireWatchUnlockReward(target);
        else if (canvasHitsWatchLabel(p.rt, p.x, p.y)) fireWatchUnlockReward();
      }
      var origDown = proto._OnPointerDown;
      proto._OnPointerDown = function (data) {
        try { maybeFire(this, data); } catch (eD) {}
        return origDown.apply(this, arguments);
      };
      watchTapWrapped = true;
      return true;
    } catch (eW) { return false; }
  }
  var wxWatchTap = false;
  function wrapWxWatchTap() {
    if (wxWatchTap) return true;
    try {
      if (typeof wx === "undefined" || typeof wx.onTouchStart !== "function") return false;
      wx.onTouchStart(function (e) {
        try {
          if (GameGlobal.__plonkyDialogIsOpen && GameGlobal.__plonkyDialogIsOpen()) return;
          var t = e && ((e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]));
          if (!t) return;
          var touchX = t.clientX != null ? t.clientX : (t.pageX != null ? t.pageX : t.x);
          var touchY = t.clientY != null ? t.clientY : (t.pageY != null ? t.pageY : t.y);
          if (touchX == null || touchY == null) return;
          var runtime = rt(), target = skinVideoTargetAt(runtime, touchX, touchY);
          if (target) fireWatchUnlockReward(target);
          else if (canvasHitsWatchLabel(runtime, touchX, touchY)) fireWatchUnlockReward();
        } catch (eT) {}
      });
      wxWatchTap = true;
      return true;
    } catch (eW) { return false; }
  }
  // Wrap the plugin's own action: `this` is the SDK instance, so we can clear the stale state that
  // makes `if (null == this.rewardedState && null == this.videoState)` skip every later request.
  var actsWrapped = false;
  function wrapAdvertCreate() {
    try { wrapAudioVolume(); } catch (eAud) {}
    try { wrapWatchUnlockTap(); } catch (eTap) {}
    try { wrapWxWatchTap(); } catch (eWx) {}
    if (actsWrapped) return true;
    try {
      var C3 = self.C3;
      var Acts = C3 && C3.Plugins && C3.Plugins.advert && C3.Plugins.advert.Acts;
      var Cnds = C3 && C3.Plugins && C3.Plugins.advert && C3.Plugins.advert.Cnds;
      if (!Acts || typeof Acts.CreateRewarded !== 'function') return false;
      var orig = Acts.CreateRewarded;
      Acts.CreateRewarded = function (tag, autoShow) {
        try {
          if (this && this.rewardedState != null && this.videoState == null) {
            console.warn('[Plonky] ad: clearing stale rewardedState=' + this.rewardedState + ' before create');
            this.rewardedState = null;
          }
        } catch (eClr) {}
        return orig.apply(this, arguments);
      };
      if (typeof Acts.ShowRewarded === 'function' && !Acts.ShowRewarded.__plonkyWrap) {
        var origShow = Acts.ShowRewarded;
        Acts.ShowRewarded = function () {
          try { if (this && this.rewardedState !== 'loaded') this.rewardedState = 'loaded'; } catch (eLd) {}
          return origShow.apply(this, arguments);
        };
        Acts.ShowRewarded.__plonkyWrap = true;
      }
      if (Cnds && typeof Cnds.IsRewardedLoaded === 'function' && !Cnds.IsRewardedLoaded.__plonkyWrap) {
        Cnds.IsRewardedLoaded = function () { return true; };
        Cnds.IsRewardedLoaded.__plonkyWrap = true;
      }
      wrapAdToastText();
      wrapAudioVolume();
      actsWrapped = true;
      console.warn('[Plonky] ad: CreateRewarded wrapped (stale state will be cleared automatically)');
      return true;
    } catch (eW) { console.warn('[Plonky] ad: wrap failed - ' + (eW && eW.message)); return false; }
  }
  function getAudioDom() {
    try {
      var ri = (typeof window !== 'undefined' && window.c3_runtimeInterface) || self.c3_runtimeInterface;
      var list = ri && ri._domHandlers;
      if (!list || !list.length) return null;
      for (var i = 0; i < list.length; i++) {
        var id = '';
        try { id = list[i].GetComponentID ? String(list[i].GetComponentID()) : String(list[i]._componentId || ''); } catch (eI) {}
        if (id === 'audio') return list[i];
      }
    } catch (e) {}
    return null;
  }
  function classInstances(name) {
    var out = [];
    try {
      var r = rt(); if (!r || typeof r.GetObjectClassByName !== 'function') return out;
      var oc = r.GetObjectClassByName(name);
      if (!oc) return out;
      try { if (typeof oc.GetInstances === 'function') out = oc.GetInstances() || []; } catch (eG) {}
      if (!out.length) { try { if (typeof oc._GetInstances === 'function') out = oc._GetInstances() || []; } catch (eG2) {} }
    } catch (e) {}
    return out || [];
  }
  function gloInst() {
    var list = instancesByName('glo');
    return list && list[0] ? list[0] : null;
  }
  function readGloAudioFlags() {
    var musicOn = true, soundOn = true;
    try {
      if (GameGlobal.__plonkyMusicOn != null) musicOn = !!GameGlobal.__plonkyMusicOn;
      if (GameGlobal.__plonkySoundOn != null) soundOn = !!GameGlobal.__plonkySoundOn;
    } catch (eG) {}
    try {
      var g0 = gloInst();
      if (g0 && g0._instVarValues) {
        if (g0._instVarValues[5] != null) musicOn = Number(g0._instVarValues[5]) > 0.5;
        if (g0._instVarValues[6] != null) soundOn = Number(g0._instVarValues[6]) > 0.5;
      }
    } catch (eR) {}
    return { musicOn: musicOn, soundOn: soundOn };
  }
  function writeGloAudioFlags(musicOn, soundOn) {
    musicOn = !!musicOn; soundOn = !!soundOn;
    try { GameGlobal.__plonkyMusicOn = musicOn; GameGlobal.__plonkySoundOn = soundOn; } catch (eG) {}
    try {
      var g0 = gloInst();
      if (g0 && g0._instVarValues) {
        g0._instVarValues[5] = musicOn ? 1 : 0;
        g0._instVarValues[6] = soundOn ? 1 : 0;
      }
    } catch (eW) {}
    try {
      if (typeof wx !== 'undefined' && typeof wx.setStorageSync === 'function') {
        wx.setStorageSync('plonky_music', musicOn ? 1 : 0);
        wx.setStorageSync('plonky_sound', soundOn ? 1 : 0);
      }
    } catch (eS) {}
  }
  function setSpriteAnimName(inst, anim) {
    if (!inst || !anim) return false;
    var sdk = null;
    try { sdk = inst.GetSdkInstance ? inst.GetSdkInstance() : inst._sdkInst; } catch (eS) {}
    try { if (sdk && typeof sdk.SetAnim === 'function') { sdk.SetAnim(anim, true); return true; } } catch (e0) {}
    try { if (sdk && typeof sdk.SetAnimation === 'function') { sdk.SetAnimation(anim); return true; } } catch (e1) {}
    try { if (typeof inst.SetAnim === 'function') { inst.SetAnim(anim, true); return true; } } catch (e2) {}
    try { if (typeof inst.SetAnimation === 'function') { inst.SetAnimation(anim); return true; } } catch (e3) {}
    return false;
  }
  function syncAudioToggleButtons(musicOn, soundOn) {
    function paint(name, on) {
      var list = classInstances(name);
      var anim = on ? 'on' : 'off';
      for (var i = 0; i < list.length; i++) {
        try { setSpriteAnimName(list[i], anim); } catch (eA) {}
      }
    }
    paint('toggle_music', musicOn);
    paint('toggle_sound', soundOn);
  }
  function applyGloAudioMute(opts) {
    try {
      var flags = readGloAudioFlags();
      var musicOn = flags.musicOn, soundOn = flags.soundOn;
      try { GameGlobal.__plonkyMusicOn = musicOn; GameGlobal.__plonkySoundOn = soundOn; } catch (eCache) {}
      if (!opts || opts.buttons !== false) syncAudioToggleButtons(musicOn, soundOn);
      var dom = getAudioDom();
      var insts = (dom && (dom._audioInstances || dom._instances)) || [];
      for (var i = 0; i < insts.length; i++) {
        var a = insts[i];
        var looping = false;
        try { looping = !!(a.IsLooping && a.IsLooping()); } catch (eL0) {}
        try { if (a._isLooping) looping = true; } catch (eL1) {}
        try {
          var tags = String(a._tags || a._tag || '');
          if (/music|melod|bgm|song/i.test(tags)) looping = true;
        } catch (eT) {}
        var on = looping ? musicOn : soundOn;
        try { if (typeof a.SetMuted === 'function') a.SetMuted(!on); } catch (eM) {}
        try { a._isMuted = !on; } catch (eM2) {}
        try {
          var el = a.GetAudioElement && a.GetAudioElement();
          if (el) { el.muted = !on; if ('volume' in el) el.volume = on ? 1 : 0; }
        } catch (eEl) {}
        try {
          if (a._gainNode && a._gainNode.gain) {
            var vol = on ? 1 : 0;
            try { if (on && typeof a.GetOutputVolume === 'function') vol = a.GetOutputVolume(); } catch (eV) {}
            a._gainNode.gain.value = vol;
          }
        } catch (eG) {}
      }
      try {
        if (typeof GameGlobal.__plonkyApplyInnerAudioMute === 'function') {
          GameGlobal.__plonkyApplyInnerAudioMute(musicOn, soundOn);
        }
      } catch (eIn) {}
    } catch (eA) {}
  }
  GameGlobal.__plonkyApplyGloAudio = applyGloAudioMute;
  function wrapAudioVolume() {
    try {
      var C3 = self.C3;
      var Acts = C3 && C3.Plugins && C3.Plugins.Audio && C3.Plugins.Audio.Acts;
      if (Acts && typeof Acts.SetVolume === 'function' && !Acts.SetVolume.__plonkyVol) {
        var origVol = Acts.SetVolume;
        Acts.SetVolume = function (tag, db) {
          try {
            var flags = readGloAudioFlags();
            var t = String(tag || '');
            var isMusic = /music|melod|bgm|song/i.test(t);
            if (typeof db === 'number' && (db === 0 || db === 1)) {
              db = db > 0.5 ? 0 : -80;
            }
            if (isMusic && !flags.musicOn) db = -80;
            else if (!isMusic && t && !flags.soundOn) db = -80;
          } catch (eDb) {}
          var ret = origVol.call(this, tag, db);
          try { applyGloAudioMute({ buttons: false }); } catch (eAp) {}
          return ret;
        };
        Acts.SetVolume.__plonkyVol = true;
        console.warn('[Plonky] audio: SetVolume maps glo.music/sound 0/1 to mute/full');
      }
      var H = self.AudioDOMHandler;
      if (H && H.prototype && typeof H.prototype._Play === 'function' && !H.prototype._Play.__plonkyMute) {
        var origPlay = H.prototype._Play;
        H.prototype._Play = function () {
          var r = origPlay.apply(this, arguments);
          try { applyGloAudioMute({ buttons: false }); } catch (eP) {}
          return r;
        };
        H.prototype._Play.__plonkyMute = true;
      }
      var AudioCnds = C3 && C3.Plugins && C3.Plugins.Audio && C3.Plugins.Audio.Cnds;
      if (AudioCnds && typeof AudioCnds.IsTagPlaying === 'function' && !AudioCnds.IsTagPlaying.__plonkyTag) {
        var origTag = AudioCnds.IsTagPlaying;
        AudioCnds.IsTagPlaying = function (tag) {
          try { if (origTag.call(this, tag)) return true; } catch (e0) {}
          try {
            // layout002 巨石：gombik 弹起要 IsTagPlaying("sound-switch") 才会把
            // prismatak.cas 置 0，石头才下降。微信 InnerAudio/静音桩经常不回写
            // isPlaying，按钮会卡在 on，石头就只升不降。
            if (String(tag || '') === 'sound-switch') return true;
          } catch (e1) {}
          return false;
        };
        AudioCnds.IsTagPlaying.__plonkyTag = true;
        console.warn('[Plonky] audio: IsTagPlaying(sound-switch) fallback for gombik unpress');
      }
      var AudioActs = C3 && C3.Plugins && C3.Plugins.Audio && C3.Plugins.Audio.Acts;
      if (AudioActs && typeof AudioActs._DoPlay === 'function' && !AudioActs._DoPlay.__plonkySilentMark) {
        var origDoPlay = AudioActs._DoPlay;
        AudioActs._DoPlay = function (file, loop, vol, pan, tags, pos) {
          try {
            if (this && this._isSilent && typeof this._MaybeMarkAsPlaying === 'function') {
              this._MaybeMarkAsPlaying(file && file[0], tags, file && file[1], loop !== 0, 0);
            }
          } catch (eM) {}
          return origDoPlay.apply(this, arguments);
        };
        AudioActs._DoPlay.__plonkySilentMark = true;
      }
    } catch (eA) {}
  }
  GameGlobal.__plonkyWrapAdvertCreate = wrapAdvertCreate;
  var restartWrapped = false, ignoreRestartHook = false, deathArmAt = 0;
  function functionNameOf(block) {
    var cands = [];
    try { cands.push(block); } catch (e0) {}
    try { if (block && block._scopeParent) cands.push(block._scopeParent); } catch (e1) {}
    try { if (block && typeof block.GetScopeParent === "function") cands.push(block.GetScopeParent()); } catch (e2) {}
    try { if (block && block._parent) cands.push(block._parent); } catch (e3) {}
    try { if (block && typeof block.GetParent === "function") cands.push(block.GetParent()); } catch (e4) {}
    try { if (block && block._functionBlock) cands.push(block._functionBlock); } catch (e5) {}
    for (var i = 0; i < cands.length; i++) {
      var sp = cands[i];
      if (!sp) continue;
      try {
        if (typeof sp.GetFunctionName === "function") {
          var n0 = sp.GetFunctionName();
          if (n0) return String(n0);
        }
      } catch (eN) {}
      try { if (sp._functionName) return String(sp._functionName); } catch (eF) {}
    }
    return "";
  }
  function coverBlocked() {
    try { if (GameGlobal.__plonkyKeepCover === true) return false; } catch (eK) {}
    try { if (shown) return true; } catch (eS) {}
    try { if (GameGlobal.__plonkyDeathPending) return true; } catch (eP) {}
    try {
      var until = GameGlobal.__plonkySkipCoverUntil || 0;
      if (until && Date.now() < until) return true;
    } catch (eU) {}
    return false;
  }
  function markRewardedLoaded() {
    try {
      var f = advertSdkInstances();
      var sdks = (f && f.sdks) || [];
      for (var i = 0; i < sdks.length; i++) {
        if (sdks[i] && sdks[i].rewardedState !== 'loaded') sdks[i].rewardedState = 'loaded';
      }
    } catch (eM) {}
  }
  function shouldSkipProjectCall(name) {
    var n = String(name || "").toLowerCase();
    if (n === "zakrytie_fade_in") return coverBlocked();
    if (n === "ukaz_info_txt") return true;
    return false;
  }
  function shouldSkipFadeIn(name) {
    return shouldSkipProjectCall(name);
  }
  // Original death always runs failed_prid, even when the rewarded ad is already
  // "loaded" and CreateRewarded is skipped. Arm the dialog from that function so
  // leftover glo.revive / a stubbed ad cannot silently RestartLayout.
  function noteDeathFunction(name) {
    var n = String(name || '').toLowerCase();
    if (n !== 'failed_prid') return;
    try { if (GameGlobal.__plonkyIgnoreRestartHook) return; } catch (eIg) {}
    try { GameGlobal.__plonkyDeathPending = true; } catch (eP) {}
    try { setGloRevive(false); } catch (eRv) {}
    try { console.warn('[Plonky] death: failed_prid armed (dialog waits for RestartLayout)'); } catch (eL) {}
  }
  function onProjectFunction(name) {
    noteDeathFunction(name);
    var n = String(name || '').toLowerCase();
    if (n === 'well_done_prid') {
      try { GameGlobal.__plonkyWellDoneOpen = true; } catch (eWd) {}
    }
    if (n === 'goto_next_level' || n === 'goto_main_menu' || n === 'well_done_odid' || n === 'restart_level') {
      try { GameGlobal.__plonkyWellDoneOpen = false; } catch (eWd2) {}
    }
    if (n === 'skiny_prid' || n === 'odomkni_menu_prid') {
      try { GameGlobal.__plonkySkinMenuOpen = true; } catch (eSk) {}
    }
    if (n === 'skiny_odid' || n === 'odomkni_menu_odid') {
      try { GameGlobal.__plonkySkinMenuOpen = false; } catch (eSk2) {}
    }
    if (n === 'ukaz_rewarded') {
      try { GameGlobal.__plonkyRewardActiveUntil = Date.now() + 65000; } catch (eUntil) {}
      try { GameGlobal.__plonkyInUkazRewarded = true; } catch (eU) {}
      try { GameGlobal.__plonkyInUkazRewardedCall = true; } catch (eU2) {}
      try { markRewardedLoaded(); } catch (eLd) {}
      try { wrapAdvertCreate(); } catch (eW) {}
    }
    if (n === 'options_menu_prid' || n === 'paused_menu_prid') {
      try { GameGlobal.__plonkyPauseOpen = true; } catch (ePo) {}
      try { GameGlobal.__plonkySkipCoverUntil = 0; } catch (eSkip) {}
      try { restorePauseCover(); } catch (ePc) {}
    }
    if (n === 'options_menu_odid' || n === 'paused_menu_odid') {
      try { GameGlobal.__plonkyPauseOpen = false; } catch (ePc2) {}
      try { uncoverGame(); } catch (eUg) {}
    }
    if (n === 'restart_level') {
      try {
        if (GameGlobal.__plonkyIgnoreRestartHook) return;
        if (GameGlobal.__plonkyDeathPending) return;
        if (shown) return;
        sendToLevelStart();
        console.warn('[Plonky] pause-restart: reset to current level start');
      } catch (eRs) {}
    }
    if (n === 'menu_prid' || n === 'options_menu_prid' || n === 'paused_menu_prid'
      || n === 'levelky_prid' || n === 'skiny_prid' || n === 'tutorial_menu_prid'
      || n === 'goto_next_level' || n === 'goto_main_menu' || n === 'well_done_prid' || n === 'ukaz_reklamu') {
      try { if (GameGlobal.__plonkyPlayInter) GameGlobal.__plonkyPlayInter(); } catch (eIn) {}
    }
  }
  function afterProjectFunction(name) {
    var n = String(name || '').toLowerCase();
    if (n === 'options_menu_prid' || n === 'nastav_options_menu') {
      try { hidePrivacyButton(rt()); } catch (eH) {}
      try { setTimeout(function () { try { hidePrivacyButton(rt()); } catch (eH2) {} }, 50); } catch (eT) {}
    }
    if (n === 'nastav_options_menu' || n === 'options_menu_prid') {
      try { applyGloAudioMute(); } catch (eA) {}
      try { setTimeout(function () { try { applyGloAudioMute(); } catch (eA2) {} }, 50); } catch (eT2) {}
    } else if (n === 'nastav_vsetky_zvuky' || n === 'nastav_soundy' || n === 'uloz_storage') {
      try { applyGloAudioMute({ buttons: false }); } catch (eA) {}
    }
    if (n === 'ukaz_rewarded') {
      try { GameGlobal.__plonkyRewardActiveUntil = Date.now() + 65000; } catch (eUntil) {}
      try {
        setTimeout(function () {
          try { GameGlobal.__plonkyInUkazRewarded = false; } catch (eU) {}
          try { GameGlobal.__plonkyInUkazRewardedCall = false; } catch (eU2) {}
        }, 2500);
      } catch (eClr) {}
    }
  }
  function wrapRestartIntercept() {
    if (restartWrapped) return true;
    try {
      var r = rt(); if (!r) return false;
      function wrapCall(obj, label) {
        if (!obj || typeof obj.callFunction !== 'function' || obj.__plonkyFadeSkipWrap) return;
        var orig = obj.callFunction.bind(obj);
        obj.callFunction = function (name) {
          onProjectFunction(name);
          if (shouldSkipProjectCall(name)) {
            if (String(name || '').toLowerCase() === 'zakrytie_fade_in') {
              try {
                var rTs = rt();
                if (rTs) callRt(rTs, ['SetTimeScale', 'setTimeScale'], 1);
              } catch (eTs) {}
            }
            try { if (String(name || '').toLowerCase() === 'ukaz_info_txt') hideAdToast(); } catch (eHt) {}
            return;
          }
          var ret = orig.apply(obj, arguments);
          afterProjectFunction(name);
          return ret;
        };
        obj.__plonkyFadeSkipWrap = true;
      }
      wrapCall(r, 'runtime');
      try { wrapCall(r._iRuntime, 'iRuntime'); } catch (eI) {}
      try {
        var TweenActs = self.C3 && self.C3.Behaviors && self.C3.Behaviors.Tween && self.C3.Behaviors.Tween.Acts;
        if (TweenActs && typeof TweenActs.TweenOneProperty === 'function' && !TweenActs.__plonkyFadeSkip) {
          var origTween = TweenActs.TweenOneProperty;
          TweenActs.TweenOneProperty = function () {
            try {
              var instTw = this && (this._inst || (this.GetObjectInstance && this.GetObjectInstance()) || (this.GetInstance && this.GetInstance()));
              var ocTw = instTw && (instTw.GetObjectClass ? instTw.GetObjectClass() : instTw._objectClass);
              var tnm = ocTw && ocTw.GetName ? String(ocTw.GetName()) : '';
              if (coverBlocked() && tnm.toLowerCase() === 'zakrytie_sprite') {
                console.warn('[Plonky] skip zakrytie tween during death-restart');
                return;
              }
              if (GameGlobal.__plonkySuppressAdTips !== false && tnm.toLowerCase() === 'font1') {
                var prop = '';
                try { prop = String(arguments[0] || ''); } catch (eP) {}
                if (/offset/i.test(prop)) {
                  try { hideAdToast(); } catch (eH) {}
                  return;
                }
              }
            } catch (eTw) {}
            return origTween.apply(this, arguments);
          };
          TweenActs.__plonkyFadeSkip = true;
          console.warn('[Plonky] dialog: TweenOneProperty fade-skip installed');
        }
      } catch (eTween) {}
      try {
        var esm = (typeof r.GetEventSheetManager === 'function') ? r.GetEventSheetManager() : r._eventSheetManager;
        function wrapRunAsProto(proto) {
          if (!proto || typeof proto.RunAsFunctionCall !== 'function' || proto.__plonkyFadeSkipWrap) {
            return !!(proto && proto.__plonkyFadeSkipWrap);
          }
          var origRun = proto.RunAsFunctionCall;
          proto.RunAsFunctionCall = function () {
            var nm = functionNameOf(this);
            onProjectFunction(nm);
            if (shouldSkipProjectCall(nm)) {
              if (String(nm || '').toLowerCase() === 'zakrytie_fade_in') {
                try {
                  var rTs2 = rt();
                  if (rTs2) callRt(rTs2, ['SetTimeScale', 'setTimeScale'], 1);
                } catch (eTs2) {}
              }
              try { if (String(nm || '').toLowerCase() === 'ukaz_info_txt') hideAdToast(); } catch (eHt) {}
              return;
            }
            var ret = origRun.apply(this, arguments);
            afterProjectFunction(nm);
            return ret;
          };
          if (typeof proto.DebugRunAsFunctionCall === 'function') {
            var origDbg = proto.DebugRunAsFunctionCall;
            proto.DebugRunAsFunctionCall = function () {
              var nm2 = functionNameOf(this);
              onProjectFunction(nm2);
              if (shouldSkipProjectCall(nm2)) {
                if (String(nm2 || '').toLowerCase() === 'zakrytie_fade_in') {
                  try {
                    var rTs3 = rt();
                    if (rTs3) callRt(rTs3, ['SetTimeScale', 'setTimeScale'], 1);
                  } catch (eTs3) {}
                }
                try { if (String(nm2 || '').toLowerCase() === 'ukaz_info_txt') hideAdToast(); } catch (eHt) {}
                return;
              }
              var ret2 = origDbg.apply(this, arguments);
              afterProjectFunction(nm2);
              return ret2;
            };
          }
          proto.__plonkyFadeSkipWrap = true;
          return true;
        }
        var wrappedRun = false;
        try {
          var C3scan = self.C3;
          if (C3scan) {
            var c3keys = [];
            try { c3keys = Object.getOwnPropertyNames(C3scan); } catch (eK) { try { c3keys = Object.keys(C3scan); } catch (eK2) {} }
            for (var ki = 0; ki < c3keys.length; ki++) {
              var cls = null;
              try { cls = C3scan[c3keys[ki]]; } catch (eCls) {}
              if (cls && cls.prototype && typeof cls.prototype.RunAsFunctionCall === "function") {
                wrappedRun = wrapRunAsProto(cls.prototype) || wrappedRun;
              }
            }
          }
        } catch (eScan) {}
        try { wrappedRun = wrapRunAsProto(self.C3 && self.C3.EventBlock && self.C3.EventBlock.prototype) || wrappedRun; } catch (eEb) {}
        try {
          if (esm && esm._functionBlocksByName && typeof esm._functionBlocksByName.forEach === "function") {
            esm._functionBlocksByName.forEach(function (fbMap) {
              try {
                var ebMap = fbMap && (fbMap._eventBlock || (typeof fbMap.GetEventBlock === "function" && fbMap.GetEventBlock()));
                if (ebMap) {
                  var pMap = Object.getPrototypeOf(ebMap);
                  if (pMap && typeof pMap.RunAsFunctionCall === "function") wrappedRun = wrapRunAsProto(pMap) || wrappedRun;
                }
              } catch (eFb) {}
            });
          }
        } catch (eMap) {}
        var fb = null;
        if (esm && typeof esm.GetFunctionBlockByName === 'function') {
          var fnames = ['ukaz_rewarded', 'ukaz_reklamu', 'menu_prid', 'well_done_prid', 'goto_next_level',
            'zakrytie_fade_in', 'restart_level', 'failed_prid', 'paused_menu_prid', 'skiny_prid'];
          for (var fi = 0; fi < fnames.length && !fb; fi++) {
            try { fb = esm.GetFunctionBlockByName(fnames[fi]); } catch (eFn) { fb = null; }
          }
        }
        var eb = fb && (fb._eventBlock || (typeof fb.GetEventBlock === 'function' && fb.GetEventBlock()));
        if (eb) {
          var proto = Object.getPrototypeOf(eb);
          if (proto && proto !== eb && typeof proto.RunAsFunctionCall === 'function') {
            wrappedRun = wrapRunAsProto(proto) || wrappedRun;
          }
        }
        try { wrapCoverSkip(r); } catch (eCs) {}
        if (wrappedRun) {
          restartWrapped = true;
          return true;
        }
      } catch (eRun) {}
      return false;
    } catch (eW) {
      console.warn('[Plonky] dialog: restart intercept failed - ' + (eW && eW.message));
      return false;
    }
  }
  GameGlobal.__plonkyOnProjectFunction = onProjectFunction;
  var uiAdPrev = { well: false, menu: false, pause: false, skin: false, levels: false };
  function classVisible(r, name) {
    try {
      var oc = r.GetObjectClassByName(name);
      if (!oc) return false;
      var list = [];
      try { if (typeof oc.GetInstances === "function") list = oc.GetInstances() || []; } catch (eG) {}
      if (!list.length) { try { if (typeof oc._GetInstances === "function") list = oc._GetInstances() || []; } catch (eG2) {} }
      for (var i = 0; i < list.length; i++) {
        var inst = list[i];
        try {
          var wi = inst.GetWorldInfo && inst.GetWorldInfo();
          if (wi && typeof wi.IsVisible === "function" && wi.IsVisible()) return true;
          if (wi && wi.isVisible === true) return true;
        } catch (eV) {}
      }
    } catch (e) {}
    return false;
  }
  function tickUiInterAds() {
    try {
      if (shown) return;
      if (!GameGlobal.__plonkyPlayInter) return;
      var r = rt(); if (!r) return;
      var well = classVisible(r, "well_done");
      var skin = classVisible(r, "skiny") || !!GameGlobal.__plonkySkinMenuOpen;
      var levels = classVisible(r, "levelky");
      var pause = !!GameGlobal.__plonkyPauseOpen;
      var menu = false;
      try {
        var lm = r.GetLayoutManager && r.GetLayoutManager();
        var lay = lm && lm.GetMainRunningLayout && lm.GetMainRunningLayout();
        var nm = lay && (lay.GetName ? String(lay.GetName()) : "");
        menu = nm === "menu_layout";
      } catch (eL) {}
      if (well && !uiAdPrev.well) GameGlobal.__plonkyPlayInter();
      if (pause && !uiAdPrev.pause) GameGlobal.__plonkyPlayInter();
      if (menu && !uiAdPrev.menu) GameGlobal.__plonkyPlayInter();
      if (skin && !uiAdPrev.skin) GameGlobal.__plonkyPlayInter();
      if (levels && !uiAdPrev.levels) GameGlobal.__plonkyPlayInter();
      uiAdPrev.well = well;
      uiAdPrev.pause = pause;
      uiAdPrev.menu = menu;
      uiAdPrev.skin = skin;
      uiAdPrev.levels = levels;
    } catch (eT) {}
  }
  GameGlobal.__plonkyArmDeathDialog = function () {
    deathArmAt = Date.now();
    wrapRestartIntercept();
  };
  function rewardAdvertIsActive(now) {
    try { return (GameGlobal.__plonkyRewardActiveUntil || 0) > (now || Date.now()); } catch (eActive) { return false; }
  }  function resetAdvertState() {
    try {
      if (rewardAdvertIsActive(Date.now())) {
        console.warn('[Plonky] dialog: advert reset deferred while rewarded video is active');
        return;
      }
      var f = advertSdkInstances();
      var cleared = 0;
      for (var i = 0; i < f.sdks.length; i++) {
        var sdk = f.sdks[i];
        var had = false;
        if ('rewardedState' in sdk) { if (sdk.rewardedState != null) had = true; sdk.rewardedState = null; }
        if ('videoState' in sdk) { if (sdk.videoState != null) had = true; sdk.videoState = null; }
        if ('rewardedInterstitialState' in sdk) { if (sdk.rewardedInterstitialState != null) had = true; sdk.rewardedInterstitialState = null; }
        if (had) cleared++;
      }
      console.warn('[Plonky] dialog: advert scan classes=' + f.classes + ' instances=' + f.insts +
        ' sdk=' + f.sdks.length + ' cleared=' + cleared + ' - now ' + advertStateText());
    } catch (eR) { console.warn('[Plonky] dialog: advert state reset failed - ' + (eR && eR.message)); }
  }
  GameGlobal.__plonkyResetAdvertState = resetAdvertState;
  // ---- checkpoint control -------------------------------------------------------------------
  // The project stores its respawn point in `checkpoint_nr` on the `checkpoints` object (and a copy on
  // `panko_revive`). Setting it to 0 makes the project's own restart start at the beginning of the level.
  // ---- project globals ------------------------------------------------------------------------
  // Read a project global (e.g. `failed_vybehnute`, the "failure panel is up" flag) so an advert
  // request from the pause menu is not mistaken for a death.
  // ---- project function calls -----------------------------------------------------------------
  // IRuntime.callFunction(name, ...args) is the engine's own entry point (it looks the function up in
  // the event-sheet manager's _functionBlocksByName map) - that is what the game's own menu buttons use.
  // ---- glo variables (level/checkpoint state) ---------------------------------------------------
  // indices are the object's *declaration order*: 18 = checkpoint, 19 = checkpoint_revive, 20 = revive.
  // goto_main_menu writes checkpoint = 1 / checkpoint_revive = 1 / revive = 0, and 1 means "the first
  // checkpoint", i.e. the beginning of the level.
  function instancesByName(name) {
    var out = [];
    try {
      var r = rt(); if (!r) return out;
      var real = null;
      try { if (typeof r.GetObjectClassByName === 'function') real = r.GetObjectClassByName(name); } catch (e0) {}
      var list = [];
      try { if (real && typeof real._GetInstances === 'function') list = real._GetInstances() || []; } catch (e1) {}
      if (!list.length) { try { if (real && typeof real.GetInstances === 'function') list = real.GetInstances() || []; } catch (e2) {} }
      for (var i = 0; i < list.length; i++) if (list[i] && list[i]._instVarValues) out.push(list[i]);
    } catch (e) {}
    return out;
  }
  function sendToLevelStart() {
    var done = 0;
    try {
      var list = instancesByName('glo');
      for (var i = 0; i < list.length; i++) {
        var v = list[i]._instVarValues;
        console.warn('[Plonky] start: glo checkpoint ' + v[18] + ' -> 1, checkpoint_revive ' + v[19] + ' -> 1, revive ' + v[20] + ' -> 0');
        v[18] = 1; v[19] = 1; v[20] = 0;
        done++;
      }
      if (!done) console.warn('[Plonky] start: no glo instance found (nothing reset)');
    } catch (e) { console.warn('[Plonky] start: failed - ' + (e && e.message)); }
    return done;
  }
  GameGlobal.__plonkyLevelStart = sendToLevelStart;

  // ---- ACE id probe: the runtime keeps the real ACE function name on every action object (_func.name),
  // so dump "Object#aceId = FuncName" for the spine actions and the numeric ids finally have names.
  var ACE_TARGETS = [
    [192076180862844, 'System#37'],
    [578653019841732, 'System#38'],
    [856748309320654, 'System#43'],
    [414049573524957, 'System#49'],
    [897431020445999, 'System#71'],
    [272855407917758, 'System#76'],
    [361083704852339, 'System#126'],
    [338984833440276, 'System#142'],
    [476051415921059, 'System#143'],
    [584620138609807, 'System#248'],
    [497361304214376, 'System#276'],
    [280474048493659, 'System#311'],
    [311216582295676, 'System#313'],
    [373839857374521, 'System#321'],
    [971527584147774, 'System#324'],
    [592517318332800, 'System#325'],
    [329346701046314, 'System#348'],
    [967438462735532, 'System#371'],
    [753501628378371, 'System#423'],
    [602086936540454, 'System#450'],
    [842486590946853, 'panko1#53'],
    [450733718125878, 'panko1#54'],
    [419423430497320, 'panko1#55'],
    [258866997069368, 'panko1#57'],
    [513013400745561, 'panko1#59'],
    [645853429429296, 'panko1#61'],
    [439436613784490, 'panko1#62'],
    [710921398576038, 'panko1#101'],
    [854310445451972, 'panko1#129'],
    [190795483117390, 'panko1#132'],
    [602347042523807, 'panko1#175'],
    [224859427974399, 'panko1#176'],
    [289053890339424, 'panko1#177'],
    [161318228218997, 'panko1#208'],
    [252849802186425, 'panko1#315'],
    [511406767513584, 'panko1#317'],
    [639577306263420, 'panko1#345'],
    [783597434625113, 'panko1#346'],
    [392610408775724, 'panko1#349'],
    [323157947924041, 'home_btn#81'],
    [643200730090817, 'nevidko_btn#74'],
    [409407319024001, 'nevidko_btn#134'],
    [285777175180896, 'obdlznik_btn#81'],
    [397343137669599, 'tlacko#48'],
    [405236153225003, 'tlacko#74'],
    [129040428731255, 'tlacko#81'],
    [672146366886522, 'tlacko#85'],
    [132218035867289, 'tlacko#134'],
    [413078991969450, 'tlacko#181'],
    [328757340667430, 'tlacko#320'],
    [842603915758010, 'helper#48'],
    [395042261811359, 'helper#66'],
    [718255237081944, 'helper#85'],
    [938685351738291, 'helper#181'],
    [706854487585453, 'helper#312'],
    [378692308576753, 'Audio#240'],
    [587494908338390, 'Audio#241'],
    [197278309067509, 'Audio#243'],
    [459800292787012, 'Audio#244'],
    [377474110184618, 'Audio#245'],
    [338230473023656, 'Audio#299'],
    [617629551369478, 'Audio#366'],
    [269776135825924, 'Audio#369'],
    [605908509279850, 'Audio#370'],
    [518110779235800, 'Audio#381'],
    [146870129988631, 'LocalStorage#356'],
    [592013849222184, 'LocalStorage#385'],
    [472974056706097, 'LocalStorage#394'],
    [403883479222110, 'StorageData#387'],
    [106814005133144, 'StorageData#392'],
    [297680645050490, 'Mouse#352'],
    [954168678137714, 'zakrytie_sprite#81'],
    [877915783763693, 'zakrytie_sprite#85'],
    [952340669617698, 'zakrytie_sprite#181'],
    [973373090175709, 'zakrytie_sprite#225'],
    [904623197982026, 'zakrytie_sprite#312'],
    [781738327187668, 'glo#44'],
    [798792629152439, 'glo#73'],
    [831419343829741, 'glo#323'],
    [842384089882593, 'AJAX#437'],
    [152892945239879, 'jsonko#439'],
    [283656377538556, 'jsonko#444'],
    [348383663866464, 'Browser#39'],
    [623799155404716, 'Browser#357'],
    [139956894490809, 'Browser#412'],
    [483515472966352, 'Browser#422'],
    [449844857639771, 'Browser#430'],
    [397474765772970, 'Browser#431'],
    [588935107798507, 'Browser#449'],
    [198228875788599, 'MobileAdvert#359'],
    [611193602455378, 'MobileAdvert#399'],
    [819793455760783, 'MobileAdvert#405'],
    [188279506416867, 'MobileAdvert#406'],
    [382553808553796, 'MobileAdvert#421'],
    [402989566986767, 'MobileIAP#407'],
    [426387995549617, 'MobileIAP#408'],
    [566547882078823, 'MobileIAP#420'],
    [916665119403682, 'checkpoints#66']
  ];
  var CND_TARGETS = [
    [887674342204964, 'System#36'],
    [0, 'System#40'],
    [239296988597982, 'System#41'],
    [470300745263869, 'System#45'],
    [820761996118312, 'System#46'],
    [808609751151692, 'System#50'],
    [262434708257509, 'System#60'],
    [413334652554822, 'System#68'],
    [573363321231136, 'System#87'],
    [222632251499830, 'System#100'],
    [915884950024125, 'System#106'],
    [300608570318016, 'System#140'],
    [686384959307946, 'System#162'],
    [627485783032426, 'System#166'],
    [772250876363917, 'System#249'],
    [774686374298027, 'System#269'],
    [831435776488814, 'System#272'],
    [585521560270491, 'System#341'],
    [686685405249957, 'System#378'],
    [891622128854088, 'System#451'],
    [393910717585311, 'panko1#56'],
    [885701672120011, 'panko1#58'],
    [628239467494108, 'panko1#89'],
    [418560852095511, 'panko1#99'],
    [443668762168050, 'panko1#104'],
    [421846416928949, 'panko1#105'],
    [286188011504680, 'panko1#145'],
    [786801488680139, 'panko1#153'],
    [969409834694373, 'panko1#160'],
    [913395053053978, 'panko1_Player_p_torso_idle#108'],
    [173474008168975, 'panko1_Player_p_torso_idle#113'],
    [180742259873618, 'panko1_Player_p_torso_idle#144'],
    [557223347130652, 'panko1_Player_p_torso_idle#163'],
    [212146382888213, 'panko1_Player_p_torso_idle#164'],
    [414092613004946, 'panko1_Player_p_torso_idle#184'],
    [408901714935791, 'panko1_Player_p_torso_idle#319'],
    [710278197236975, 'nevidko_btn#91'],
    [667347223746928, 'nevidko_btn#108'],
    [425782863080710, 'obdlznik_btn#79'],
    [890284588370500, 'obdlznik_btn#91'],
    [984452742799716, 'obdlznik_btn#108'],
    [385293813121591, 'tlacko#79'],
    [438796008381133, 'tlacko#91'],
    [738287070145485, 'tlacko#108'],
    [431803446704920, 'tlacko#158'],
    [406138638705419, 'tlacko#234'],
    [351095254244257, 'well_done#64'],
    [332141303514025, 'helper#64'],
    [799767640174451, 'helper#91'],
    [632897360321050, 'helper#108'],
    [757096014441905, 'helper#144'],
    [602587663008436, 'helper#185'],
    [343592596545337, 'helper#338'],
    [339610590962437, 'Audio#220'],
    [492087176394820, 'Keyboard#428'],
    [605586136554013, 'Keyboard#433'],
    [982886287483851, 'LocalStorage#386'],
    [575350821984135, 'LocalStorage#391'],
    [491208158553423, 'Touch#351'],
    [835136942339520, 'Touch#353'],
    [748056150716694, 'Touch#354'],
    [222907297869497, 'Touch#417'],
    [680269685692112, 'Mouse#414'],
    [222020449571158, 'zakrytie_sprite#64'],
    [363569169639855, 'glo#47'],
    [393394065599588, 'glo#72'],
    [891002622301845, 'Browser#342'],
    [153180393464935, 'Browser#400'],
    [809685767733195, 'Browser#429'],
    [389265870984268, 'MobileAdvert#355'],
    [917360276295733, 'MobileAdvert#396'],
    [326373538520622, 'MobileAdvert#397'],
    [247333385984079, 'MobileAdvert#401'],
    [413657614851366, 'MobileAdvert#402'],
    [136111125960520, 'MobileAdvert#403'],
    [442804268513738, 'MobileAdvert#404'],
    [892250462447614, 'MobileIAP#409'],
    [175457413435868, 'MobileIAP#410'],
    [181774411915314, 'MobileIAP#411']
  ];
  GameGlobal.__plonkyCndMap = function () {
    try {
      var r = rt(); if (!r) { console.warn('[Plonky] CNDMAP: no runtime'); return; }
      var esm = (typeof r.GetEventSheetManager === 'function') ? r.GetEventSheetManager() : r._eventSheetManager;
      if (!esm || typeof esm.GetConditionBySID !== 'function') { console.warn('[Plonky] CNDMAP: no GetConditionBySID'); return; }
      var lines = [], missing = 0, unnamed = 0;
      for (var i = 0; i < CND_TARGETS.length; i++) {
        var sid = CND_TARGETS[i][0], label = CND_TARGETS[i][1], name = '?';
        try {
          var c = esm.GetConditionBySID(sid);
          if (!c) { missing++; continue; }
          var cand = [];
          try { if (c._func && c._func.name) cand.push(c._func.name); } catch (e1) {}
          try { if (c.Run && c.Run.name) cand.push(String(c.Run.name).replace('bound ', '')); } catch (e2) {}
          for (var k = 0; k < cand.length; k++) {
            var cn = cand[k];
            if (!cn || /^_?RunObject/.test(cn) || cn === 'RunAsFunctionCall' || cn === 'sI' || /^_DebugRun/.test(cn)) continue;
            name = cn; break;
          }
          if (name === '?') unnamed++;
        } catch (eC) { name = 'ERR ' + (eC && eC.message); }
        lines.push(label + ' = ' + name);
      }
      console.warn('[Plonky] CNDMAP begin (' + lines.length + ' entries, ' + missing + ' missing, ' + unnamed + ' unnamed)');
      for (var j = 0; j < lines.length; j += 6) console.warn('[Plonky] CNDMAP ' + lines.slice(j, j + 6).join(' | '));
      console.warn('[Plonky] CNDMAP end');
    } catch (e) { console.warn('[Plonky] CNDMAP failed - ' + (e && e.message)); }
  };

  GameGlobal.__plonkyAceMap = function () {
    try {
      var r = rt(); if (!r) { console.warn('[Plonky] ACEMAP: no runtime'); return; }
      var esm = (typeof r.GetEventSheetManager === 'function') ? r.GetEventSheetManager() : r._eventSheetManager;
      if (!esm || typeof esm.GetActionBySID !== 'function') { console.warn('[Plonky] ACEMAP: no GetActionBySID'); return; }
      var lines = [], missing = 0;
      for (var i = 0; i < ACE_TARGETS.length; i++) {
        var sid = ACE_TARGETS[i][0], label = ACE_TARGETS[i][1], name = '?';
        try {
          var a = esm.GetActionBySID(sid);
          if (!a) { missing++; continue; }
          var cand = [];
          try { if (a._func && a._func.name) cand.push(a._func.name); } catch (e1) {}
          try { if (a.Run && a.Run.name) cand.push(String(a.Run.name).replace('bound ', '')); } catch (e2) {}
          try { if (a._callFunctionName) cand.push('fn:' + a._callFunctionName); } catch (e3) {}
          for (var c = 0; c < cand.length; c++) {
            var cn = cand[c];
            if (!cn || /^_?RunObject/.test(cn) || cn === 'RunAsFunctionCall' || cn === 'sI' || /^_DebugRun/.test(cn)) continue;
            name = cn; break;
          }
        } catch (eA) { name = 'ERR ' + (eA && eA.message); }
        lines.push(label + ' = ' + name);
      }
      console.warn('[Plonky] ACEMAP begin (' + lines.length + ' entries, ' + missing + ' missing)');
      for (var k = 0; k < lines.length; k += 6) console.warn('[Plonky] ACEMAP ' + lines.slice(k, k + 6).join(' | '));
      console.warn('[Plonky] ACEMAP end');
    } catch (e) { console.warn('[Plonky] ACEMAP failed - ' + (e && e.message)); }
  };

  // Calls a project function by name, e.g. restart_level / goto_main_menu / uloz_storage.
  // The engine exposes callFunction(name, ...args) which resolves via GetFunctionBlockByName (lower-cased).
  function projectCall(name, arg) {
    var hasArg = arguments.length > 1;
    try {
      var r = rt();
      if (!r) { console.warn('[Plonky] call ' + name + ': no runtime'); return false; }
      var ir = null;
      try { ir = r._iRuntime || null; } catch (e0) {}
      if (ir && typeof ir.callFunction === 'function') {
        if (hasArg) ir.callFunction(name, arg); else ir.callFunction(name);
        console.warn('[Plonky] call ' + name + (hasArg ? '(' + arg + ')' : '()') + ' via _iRuntime.callFunction');
        return true;
      }
      if (typeof r.callFunction === 'function') {
        if (hasArg) r.callFunction(name, arg); else r.callFunction(name);
        console.warn('[Plonky] call ' + name + (hasArg ? '(' + arg + ')' : '()') + ' via runtime.callFunction');
        return true;
      }
      var host = null;
      try { if (typeof window !== 'undefined' && window.c3_runtimeInterface) host = window.c3_runtimeInterface; } catch (e1) {}
      if (!host) { try { if (typeof self !== 'undefined' && self.c3_runtimeInterface) host = self.c3_runtimeInterface; } catch (e2) {} }
      if (host && typeof host.callFunction === 'function') {
        if (hasArg) host.callFunction(name, arg); else host.callFunction(name);
        console.warn('[Plonky] call ' + name + (hasArg ? '(' + arg + ')' : '()') + ' via c3_runtimeInterface.callFunction');
        return true;
      }
      var exists = false;
      try {
        var esm = (typeof r.GetEventSheetManager === 'function') ? r.GetEventSheetManager() : r._eventSheetManager;
        if (esm && typeof esm.GetFunctionBlockByName === 'function') exists = !!esm.GetFunctionBlockByName(String(name).toLowerCase());
      } catch (e3) {}
      console.warn('[Plonky] call ' + name + ': no callFunction on runtime (function block exists=' + exists + ')');
    } catch (e) { console.warn('[Plonky] call ' + name + ' failed - ' + (e && e.message)); }
    return false;
  }
  GameGlobal.__plonkyCallFunction = projectCall;
  function globalVarObj(name) {
    try {
      var r = rt(); if (!r) return null;
      var esm = null;
      try { if (typeof r.GetEventSheetManager === 'function') esm = r.GetEventSheetManager(); } catch (e0) {}
      if (!esm) { try { esm = r._eventSheetManager; } catch (e1) {} }
      if (!esm || typeof esm.GetAllGlobalVariables !== 'function') return null;
      var list = esm.GetAllGlobalVariables() || [];
      for (var i = 0; i < list.length; i++) {
        var v = list[i], nm = null;
        try { if (typeof v.GetName === 'function') nm = v.GetName(); } catch (e2) {}
        if (nm == null) { try { nm = v._name; } catch (e3) {} }
        if (nm === name) return v;
      }
    } catch (e) {}
    return null;
  }
  function readGlobal(name) {
    try {
      var v = globalVarObj(name);
      if (!v) return undefined;
      if (typeof v.GetValue === 'function') return v.GetValue();
      if ('_value' in v) return v._value;
    } catch (e) {}
    return undefined;
  }
  function writeGlobal(name, val) {
    try {
      var v = globalVarObj(name);
      if (!v) {
        console.warn('[Plonky] write ' + name + ': not found');
        return false;
      }
      if (typeof v.SetValue === 'function') v.SetValue(val);
      else v._value = val;
      console.warn('[Plonky] write ' + name + ' = ' + val);
      return true;
    } catch (eW) {
      console.warn('[Plonky] write ' + name + ' failed - ' + (eW && eW.message));
      return false;
    }
  }
  function setGloRevive(on) {
    var n = 0;
    try {
      var list = instancesByName('glo');
      var flag = on ? 1 : 0;
      for (var i = 0; i < list.length; i++) {
        var v = list[i]._instVarValues;
        if (!v) continue;
        console.warn('[Plonky] revive: glo.revive ' + v[20] + ' -> ' + flag);
        v[20] = flag;
        n++;
      }
      if (!n) console.warn('[Plonky] revive: no glo instance for revive flag');
    } catch (eR) {
      console.warn('[Plonky] revive: glo.revive write failed - ' + (eR && eR.message));
    }
    return n;
  }
  function deathRequest() {
    try { if (shown) return true; } catch (eS) {}
    try { if (GameGlobal.__plonkyDeathPending) return true; } catch (eP) {}
    try { if (GameGlobal.__plonkyInUkazRewarded) return false; } catch (eU) {}
    var failed = readGlobal('failed_vybehnute');
    return failed === true || failed === 1;
  }
  GameGlobal.__plonkyReadGlobal = readGlobal;
  GameGlobal.__plonkyDeathRequest = deathRequest;
  var cpCaptured = [];      // { name, inst, before } captured while the level is loaded
  var CP_NAMES = ['checkpoints', 'panko_revive'];
  function scanCheckpointInstances() {
    var r = rt(); if (!r) return [];
    var out = [];
    var classes = [];
    try { if (r._allObjectClasses && r._allObjectClasses.length) classes = r._allObjectClasses; } catch (eA) {}
    if (!classes.length) { for (var k = 0; k < CP_NAMES.length; k++) { try { var c0 = r.GetObjectClassByName(CP_NAMES[k]); if (c0) classes.push(c0); } catch (e0) {} } }
    for (var i = 0; i < classes.length; i++) {
      var oc = classes[i], nm = null;
      try { nm = (oc && typeof oc.GetName === 'function') ? oc.GetName() : null; } catch (eN) {}
      if (nm && CP_NAMES.indexOf(nm) < 0) continue;
      var real = oc;
      try { if (nm && typeof r.GetObjectClassByName === 'function') { var byName = r.GetObjectClassByName(nm); if (byName) real = byName; } } catch (eR2) {}
      var list = [];
      try { if (real && typeof real._GetInstances === 'function') list = real._GetInstances() || []; } catch (eI) {}
      if (!list.length) { try { if (real && typeof real.GetInstances === 'function') list = real.GetInstances() || []; } catch (eI2) {} }
      for (var j = 0; j < list.length; j++) {
        var inst = list[j];
        if (!inst || !inst._instVarValues) continue;
        out.push({ name: (nm || 'checkpoint-ish'), inst: inst });
      }
    }
    return out;
  }
  function captureCheckpoint() {
    try {
      var found = scanCheckpointInstances();
      cpCaptured = found;
      var desc = found.map(function (f) { return f.name + '=' + f.inst._instVarValues[0]; }).join(', ');
      console.warn('[Plonky] restart: captured ' + found.length + ' checkpoint instance(s)' + (desc ? ' [' + desc + ']' : ''));
      return found.length;
    } catch (eC) { console.warn('[Plonky] restart: capture failed - ' + (eC && eC.message)); return 0; }
  }
  function setCheckpoint(nr) {
    try {
      var used = 0;
      for (var i = 0; i < cpCaptured.length; i++) {
        var vals = cpCaptured[i].inst && cpCaptured[i].inst._instVarValues;
        if (!vals) continue;
        console.warn('[Plonky] restart: ' + cpCaptured[i].name + ' checkpoint_nr ' + vals[0] + ' -> ' + nr);
        vals[0] = nr;
        used++;
      }
      if (!used) {
        var fresh = scanCheckpointInstances();
        for (var k = 0; k < fresh.length; k++) {
          var v2 = fresh[k].inst._instVarValues;
          console.warn('[Plonky] restart: (fresh) ' + fresh[k].name + ' checkpoint_nr ' + v2[0] + ' -> ' + nr);
          v2[0] = nr; used++;
        }
      }
      if (!used) console.warn('[Plonky] restart: no checkpoint instances available (nothing reset)');
      return used;
    } catch (e) { console.warn('[Plonky] restart: write failed - ' + (e && e.message)); return 0; }
  }
  GameGlobal.__plonkyCaptureCheckpoint = captureCheckpoint;
  GameGlobal.__plonkySetCheckpoint = setCheckpoint;
  function runningLayout(r) {
    try {
      var lm = r && r.GetLayoutManager ? r.GetLayoutManager() : null;
      if (lm && lm.GetMainRunningLayout) return lm.GetMainRunningLayout();
    } catch (e) {}
    try {
      if (r && r._layoutManager && r._layoutManager.GetMainRunningLayout) return r._layoutManager.GetMainRunningLayout();
    } catch (e2) {}
    try { if (r && r.layout) return r.layout; } catch (e3) {}
    return null;
  }
  function coverLayerName(nm) {
    var n = String(nm || '').toLowerCase();
    return n === 'zakrytie';
  }
  function eachCoverLayer(r, fn) {
    var lay = runningLayout(r);
    if (!lay) return 0;
    var n = 0, seen = [];
    function use(L) {
      if (!L) return;
      for (var s = 0; s < seen.length; s++) if (seen[s] === L) return;
      var nm = '';
      try { nm = String(L.GetName ? L.GetName() : (L.name || L._name || '')); } catch (eN) {}
      if (!coverLayerName(nm)) return;
      seen.push(L);
      n++;
      try { fn(L, nm); } catch (eF) {}
    }
    try { if (typeof lay.GetLayerByName === 'function') use(lay.GetLayerByName('zakrytie')); } catch (eB) {}
    try { if (typeof lay.GetLayerByName === 'function') use(lay.GetLayerByName('b')); } catch (eB2) {}
    var layers = null;
    try { if (typeof lay.GetLayers === 'function') layers = lay.GetLayers(); } catch (eG) {}
    if (!layers) { try { layers = lay._allLayersFlat; } catch (eF2) {} }
    if (layers && layers.length) {
      for (var j = 0; j < layers.length; j++) use(layers[j]);
    }
    var count = 0;
    try { count = typeof lay.GetLayerCount === 'function' ? lay.GetLayerCount() : 0; } catch (eC) {}
    for (var i = 0; i < count; i++) {
      try { use(lay.GetLayer(i)); } catch (eL) {}
    }
    return n;
  }
  var eachZakrytieLayer = eachCoverLayer;
  function hideOneLayer(L) {
    try { if (typeof L.SetVisible === 'function') L.SetVisible(false); } catch (eV) {}
    try { L.isVisible = false; } catch (eV2) {}
    try { L._isVisible = false; } catch (eV3) {}
    try { if (typeof L.SetOpacity === 'function') L.SetOpacity(0); } catch (eO) {}
    try { L.opacity = 0; } catch (eO2) {}
  }
  function showOneLayer(L) {
    try { if (typeof L.SetVisible === 'function') L.SetVisible(true); } catch (eV) {}
    try { L.isVisible = true; } catch (eV2) {}
    try { L._isVisible = true; } catch (eV3) {}
    try { if (typeof L.SetOpacity === 'function') L.SetOpacity(1); } catch (eO) {}
    try { L.opacity = 1; } catch (eO2) {}
  }
  function wrapCoverSkip(r) {
    if (!r) return;
    try {
      var proto = Object.getPrototypeOf(r);
      if (proto && typeof proto.Render === 'function' && !proto.Render.__plonkyCover) {
        var origRender = proto.Render;
        proto.Render = function () {
          try { uncoverTick(); } catch (eU) {}
          try {
            if (GameGlobal.__plonkyDialogIsOpen && GameGlobal.__plonkyDialogIsOpen() && GameGlobal.__plonkyEnsureC3Dialog) {
              GameGlobal.__plonkyEnsureC3Dialog();
            }
          } catch (eOv) {}
          return origRender.apply(this, arguments);
        };
        proto.Render.__plonkyCover = true;
        console.warn('[Plonky] cover: Runtime.Render skip installed');
      }
    } catch (eR) {}
  }
  var uncoverLog = 0;
  function instIsDeathCover(inst) {
    if (!inst) return false;
    try { if (instHasTag(inst, 'hlavne_zakrytie')) return true; } catch (eT) {}
    try {
      var wi = inst.GetWorldInfo ? inst.GetWorldInfo() : null;
      var lay = wi && (typeof wi.GetLayer === 'function' ? wi.GetLayer() : wi._layer);
      var nm = '';
      try { nm = String(lay && (lay.GetName ? lay.GetName() : (lay._name || ''))); } catch (eN) {}
      if (nm.toLowerCase() !== 'zakrytie') return false;
      var w = 0, h = 0;
      try { w = typeof wi.GetWidth === 'function' ? wi.GetWidth() : (wi._width || 0); } catch (eW) {}
      try { h = typeof wi.GetHeight === 'function' ? wi.GetHeight() : (wi._height || 0); } catch (eH) {}
      return w > 600 && h > 300;
    } catch (e) {}
    return false;
  }
  function setZakrytieLayerVisible(on) {
    var r = rt(); if (!r) return 0;
    var n = eachZakrytieLayer(r, on ? showOneLayer : hideOneLayer);
    try { if (typeof r.UpdateRender === 'function') r.UpdateRender(); } catch (eU) {}
    if (uncoverLog < 8) {
      console.warn('[Plonky] revive: zakrytie layer ' + (on ? 'shown' : 'hidden') + ' n=' + n);
    }
    return n;
  }
  function hideCoverSprite() {
    try {
      var r = rt(); if (!r) {
        console.warn('[Plonky] revive: hide cover skipped - no runtime');
        return;
      }
      var hid = 0;
      var classes = [];
      try { if (r._allObjectClasses && r._allObjectClasses.length) classes = r._allObjectClasses.slice(); } catch (eA) {}
      try {
        if (typeof r.GetObjectClassByName === 'function') {
          var named = r.GetObjectClassByName('zakrytie_sprite');
          if (named) classes.push(named);
        }
      } catch (eNm) {}
      for (var c = 0; c < classes.length; c++) {
        var oc = classes[c];
        var nm = '';
        try { nm = oc && oc.GetName ? String(oc.GetName()) : ''; } catch (eN) {}
        if (nm.toLowerCase().indexOf('zakrytie') < 0) continue;
        var list = [];
        try { if (typeof oc.GetInstances === 'function') list = oc.GetInstances() || []; } catch (eI) {}
        if (!list.length) { try { if (typeof oc._GetInstances === 'function') list = oc._GetInstances() || []; } catch (eI2) {} }
        for (var i = 0; i < list.length; i++) {
          var inst = list[i];
          if (!instIsDeathCover(inst)) continue;
          try {
            var behaviors = typeof inst.GetBehaviorInstances === 'function' ? inst.GetBehaviorInstances() : [];
            for (var b = 0; behaviors && b < behaviors.length; b++) {
              var sdk = null;
              try { sdk = behaviors[b].GetSdkInstance ? behaviors[b].GetSdkInstance() : behaviors[b]._sdkInst; } catch (eS) {}
              if (!sdk) continue;
              try { if (typeof sdk.StopAllTweens === 'function') sdk.StopAllTweens(); } catch (eT) {}
              try { if (typeof sdk.PauseAllTweens === 'function') sdk.PauseAllTweens(); } catch (eT2) {}
            }
          } catch (eB) {}
          var wi = null;
          try { wi = inst.GetWorldInfo ? inst.GetWorldInfo() : null; } catch (eW) {}
          if (wi) {
            try { if (typeof wi.SetOpacity === 'function') wi.SetOpacity(0); } catch (eO) {}
            try { wi.opacity = 0; } catch (eO2) {}
            try { if (typeof wi.SetVisible === 'function') wi.SetVisible(false); } catch (eV) {}
            try { wi.isVisible = false; } catch (eV2) {}
            try { wi._isVisible = false; } catch (eV3) {}
            try { if (typeof wi.SetCollisionEnabled === 'function') wi.SetCollisionEnabled(false); } catch (eC) {}
          }
          try {
            var spr = inst.GetSdkInstance ? inst.GetSdkInstance() : inst._sdkInst;
            if (spr && typeof spr.SetCollisions === 'function') spr.SetCollisions(false);
          } catch (eSc) {}
          try { if (typeof inst.SetVisible === 'function') inst.SetVisible(false); } catch (eIV) {}
          hid++;
        }
      }
      if (uncoverLog < 8) {
        uncoverLog++;
        console.warn('[Plonky] revive: hid ' + hid + ' cover sprite(s)');
      }
    } catch (eH) {
      console.warn('[Plonky] revive: hide cover failed - ' + (eH && eH.message));
    }
  }
  function restorePauseCover() {
    var n = setZakrytieLayerVisible(true);
    try {
      var r = rt();
      if (r && typeof r.GetObjectClassByName === 'function') {
        var oc = r.GetObjectClassByName('zakrytie_sprite');
        var list = [];
        try { if (oc && typeof oc.GetInstances === 'function') list = oc.GetInstances() || []; } catch (eG) {}
        if (!list.length) { try { if (oc && typeof oc._GetInstances === 'function') list = oc._GetInstances() || []; } catch (eG2) {} }
        for (var i = 0; i < list.length; i++) {
          if (instIsDeathCover(list[i])) continue;
          try {
            var wi = list[i].GetWorldInfo ? list[i].GetWorldInfo() : null;
            if (wi && typeof wi.SetCollisionEnabled === 'function') wi.SetCollisionEnabled(true);
          } catch (eC) {}
          try {
            var spr = list[i].GetSdkInstance ? list[i].GetSdkInstance() : list[i]._sdkInst;
            if (spr && typeof spr.SetCollisions === 'function') spr.SetCollisions(true);
          } catch (eSc) {}
        }
      }
    } catch (eHeal) {}
    try { console.warn('[Plonky] pause: restored zakrytie overlay layer n=' + n); } catch (eL) {}
    return n;
  }
  function uncoverGame() {
    try { projectCall('zakrytie_fade_out'); } catch (eFO) {}
    hideCoverSprite();
    kickRender();
  }
  function uncoverTick() {
    try {
      wrapCoverSkip(rt());
      if (GameGlobal.__plonkyPauseOpen) return;
      hideCoverSprite();
    } catch (eU) {}
  }
  GameGlobal.__plonkyShowCoverLayer = function () { return setZakrytieLayerVisible(true); };
  GameGlobal.__plonkyHideCoverLayer = function () { hideCoverSprite(); };
  GameGlobal.__plonkyUncoverTick = uncoverTick;
  function kickRender() {
    try {
      var r = rt();
      if (!r) return;
      try { if (typeof r.SetNeedsRedraw === 'function') r.SetNeedsRedraw(); } catch (eNeed) {}
      try { r._needsRedraw = true; } catch (eNeed2) {}
      try { if (typeof r.UpdateRender === 'function') r.UpdateRender(); } catch (eUp) {}
      try {
        var cm = r._canvasManager || (typeof r.GetCanvasManager === 'function' && r.GetCanvasManager());
        if (cm && typeof cm._MaybeRedraw === 'function') cm._MaybeRedraw();
      } catch (eCm) {}
    } catch (eK) {}
  }
  function applyRestart(total, why) {
    ignoreRestartHook = true;
    GameGlobal.__plonkyIgnoreRestartHook = true;
    var applied = false;
    try { if (GameGlobal.__plonkyApplyHeldLayout) applied = !!GameGlobal.__plonkyApplyHeldLayout(); } catch (eAH) {
      console.warn('[Plonky] ' + why + ': apply held layout failed - ' + (eAH && eAH.message));
    }
    if (!applied) {
      console.warn('[Plonky] ' + why + ': no held RestartLayout, falling back to restart_level(' + total + ')');
      try { projectCall('restart_level', total); } catch (eRL) {
        console.warn('[Plonky] ' + why + ': restart_level failed - ' + (eRL && eRL.message));
      }
    }
    ignoreRestartHook = false;
    GameGlobal.__plonkyIgnoreRestartHook = false;
    return applied;
  }
  function autoReviveThenShow() {
    if (shown) return false;
    try { captureCheckpoint(); } catch (eCap) {}
    setGloRevive(true);
    ignoreRestartHook = true;
    GameGlobal.__plonkyIgnoreRestartHook = true;
    var applied = false;
    try { applied = !!(GameGlobal.__plonkyApplyHeldLayout && GameGlobal.__plonkyApplyHeldLayout()); } catch (eAH) {
      console.warn('[Plonky] auto-revive: apply held layout failed - ' + (eAH && eAH.message));
    }
    if (!applied) {
      try { projectCall('restart_level', false); } catch (eRL) {
        console.warn('[Plonky] auto-revive: restart_level(false) failed - ' + (eRL && eRL.message));
      }
    }
    var p = null;
    try { p = GameGlobal.__plonkyHeldLayoutPromise; } catch (eP) {}
    function afterLive() {
      ignoreRestartHook = false;
      GameGlobal.__plonkyIgnoreRestartHook = false;
      try { GameGlobal.__plonkyDeathPending = false; } catch (eD) {}
      try {
        setTimeout(function () { setGloRevive(false); }, 120);
        setTimeout(function () { setGloRevive(false); }, 400);
      } catch (eClr) {}
      try { GameGlobal.__plonkyShowDialog('auto in-place revive'); } catch (eS) {}
    }
    if (p && typeof p.then === 'function') {
      try { p.then(afterLive, afterLive); } catch (eThen) { afterLive(); }
    } else {
      try { setTimeout(afterLive, 0); } catch (eT) { afterLive(); }
    }
    console.warn('[Plonky] death: auto in-place revive applied=' + applied + ', dialog after layout');
    return true;
  }
  GameGlobal.__plonkyAutoReviveThenShow = autoReviveThenShow;
  function applyChoose(ok) {
    lastChoiceAt = Date.now();
    chooseBusy = false;
    try { GameGlobal.__plonkyDeathPending = false; } catch (eP) {}
    hide();
    try { GameGlobal.__plonkySkipCoverUntil = Date.now() + 5000; } catch (eSkip) {}
    try { GameGlobal.__plonkyPassAdsUntil = Date.now() + 4000; } catch (ePass) {}
    writeGlobal('failed_vybehnute', false);
    ignoreRestartHook = true;
    GameGlobal.__plonkyIgnoreRestartHook = true;
    try { if (GameGlobal.__plonkyCancelAd) GameGlobal.__plonkyCancelAd(); } catch (eCA) {}
    try { resetAdvertState(); } catch (eRAS) {}
    if (ok) {
      try { if (GameGlobal.__plonkyDropHeldLayout) GameGlobal.__plonkyDropHeldLayout(); } catch (eDrop) {}
      setGloRevive(true);
      var restarted = false;
      try { restarted = !!(GameGlobal.__plonkyRestartSameLayout && GameGlobal.__plonkyRestartSameLayout()); } catch (eRS) {
        console.warn('[Plonky] dialog: YES RestartLayout failed - ' + (eRS && eRS.message));
      }
      if (!restarted) {
        try { projectCall('restart_level', false); } catch (eRL) {
          console.warn('[Plonky] dialog: YES restart_level(false) failed - ' + (eRL && eRL.message));
        }
      }
      try {
        var rYes = rt();
        if (rYes) callRt(rYes, ['SetTimeScale', 'setTimeScale'], 1);
      } catch (eTs) {}
      try { releaseStuckInput(); } catch (eInY) {}
      console.warn('[Plonky] dialog: YES - overlay closed, clean in-place RestartLayout applied=' + restarted);
      try {
        setTimeout(function () { setGloRevive(false); }, 120);
        setTimeout(function () { setGloRevive(false); }, 400);
      } catch (eClrY) {}
    } else {
      setGloRevive(false);
      try { sendToLevelStart(); } catch (eStart) {}
      try { if (GameGlobal.__plonkyDropHeldLayout) GameGlobal.__plonkyDropHeldLayout(); } catch (eDrop2) {}
      var restartedNo = false;
      try { restartedNo = !!(GameGlobal.__plonkyRestartSameLayout && GameGlobal.__plonkyRestartSameLayout()); } catch (eRSN) {
        console.warn('[Plonky] dialog: NO RestartLayout failed - ' + (eRSN && eRSN.message));
      }
      if (!restartedNo) applyRestart(true, 'restart');
      try {
        var rNo = rt();
        if (rNo) callRt(rNo, ['SetTimeScale', 'setTimeScale'], 1);
      } catch (eTsN) {}
      try {
        setTimeout(function () { setGloRevive(false); }, 120);
        setTimeout(function () { setGloRevive(false); }, 400);
      } catch (eClrN) {}
      console.warn('[Plonky] dialog: NO - current-level RestartLayout applied=' + restartedNo);
    }
    ignoreRestartHook = false;
    GameGlobal.__plonkyIgnoreRestartHook = false;
    try { hideOriginalReviveButton(rt()); } catch (eHideR) {}
    uncoverGame();
    try {
      setTimeout(uncoverGame, 50);
      setTimeout(uncoverGame, 200);
      setTimeout(uncoverGame, 600);
      setTimeout(uncoverGame, 1200);
    } catch (eUnc) {}
    var layoutP = null;
    try { layoutP = GameGlobal.__plonkyHeldLayoutPromise; GameGlobal.__plonkyHeldLayoutPromise = null; } catch (eLP) {}
    if (layoutP && typeof layoutP.then === 'function') {
      try { layoutP.then(function () { uncoverGame(); }, function () { uncoverGame(); }); } catch (eThen) {}
    }
    try { setTimeout(resetAdvertState, 700); } catch (eRA2) {}
    try { console.warn('[Plonky] dialog: chose ' + (ok ? 'YES (in-place revive)' : 'NO (restart level)')); } catch (e) {}
  }
  function choose(ok) {
    if (ok) {
      if (chooseBusy) return;
      chooseBusy = true;
      try {
        if (reviveInterTimer) { clearTimeout(reviveInterTimer); reviveInterTimer = null; }
      } catch (eTm) {}
      try {
        if (typeof GameGlobal.__plonkyPlayReward === "function") {
          GameGlobal.__plonkyPlayReward(function (ended) {
            chooseBusy = false;
            if (ended) applyChoose(true);
          });
          try { setTimeout(function () { chooseBusy = false; }, 1800); } catch (eUnlock) {}
          return;
        }
      } catch (eR) {}
      chooseBusy = false;
    } else {
      try {
        if (reviveInterTimer) { clearTimeout(reviveInterTimer); reviveInterTimer = null; }
      } catch (eTm2) {}
      try { if (GameGlobal.__plonkyPlayInter) GameGlobal.__plonkyPlayInter(); } catch (eIn) {}
    }
    applyChoose(ok);
  }
  function blit(buf, w, h, img, dx, dy, dw, dh) {
    if (!img) return;
    for (var y = 0; y < dh; y++) {
      var sy = Math.floor(y * img.height / dh);
      var ty = dy + y; if (ty < 0 || ty >= h) continue;
      for (var x = 0; x < dw; x++) {
        var sx = Math.floor(x * img.width / dw);
        var tx = dx + x; if (tx < 0 || tx >= w) continue;
        var si = (sy * img.width + sx) * 4, di = (ty * w + tx) * 4;
        var al = img.data[si + 3] / 255;
        if (al <= 0.003) continue;
        buf[di] = Math.round(img.data[si] * al + buf[di] * (1 - al));
        buf[di + 1] = Math.round(img.data[si + 1] * al + buf[di + 1] * (1 - al));
        buf[di + 2] = Math.round(img.data[si + 2] * al + buf[di + 2] * (1 - al));
        buf[di + 3] = 255;
      }
    }
  }
  function shade(buf, w, h, x, y, dw, dh, k) {
    for (var yy = 0; yy < dh; yy++) {
      var ty = y + yy; if (ty < 0 || ty >= h) continue;
      for (var xx = 0; xx < dw; xx++) {
        var tx = x + xx; if (tx < 0 || tx >= w) continue;
        var di = (ty * w + tx) * 4;
        buf[di] = (buf[di] * k) | 0;
        buf[di + 1] = (buf[di + 1] * k) | 0;
        buf[di + 2] = (buf[di + 2] * k) | 0;
      }
    }
  }
  var layout = null;
  // ---- WebGL overlay (devices run sole-webgl: no 2D present canvas, so we draw it ourselves) ----
  var ovBuf = null, ovW = 0, ovH = 0, ovDirty = true, ovLog = 0;
  var c3DlgInsts = [];
  function blitOv(buf, w, h, img, dx, dy, dw, dh, dim) {
    if (!img) return;
    for (var y = 0; y < dh; y++) {
      var sy = Math.floor(y * img.height / dh);
      var ty = dy + y; if (ty < 0 || ty >= h) continue;
      for (var x = 0; x < dw; x++) {
        var sx = Math.floor(x * img.width / dw);
        var tx = dx + x; if (tx < 0 || tx >= w) continue;
        var si = (sy * img.width + sx) * 4, di = (ty * w + tx) * 4;
        var al = (img.data[si + 3] / 255) * (dim || 1);
        if (al <= 0.004) continue;
        var dr = img.data[si], dg = img.data[si + 1], db = img.data[si + 2];
        var da = buf[di + 3] / 255;
        var oa = al + da * (1 - al);
        buf[di] = Math.round((dr * al + buf[di] * da * (1 - al)) / (oa || 1));
        buf[di + 1] = Math.round((dg * al + buf[di + 1] * da * (1 - al)) / (oa || 1));
        buf[di + 2] = Math.round((db * al + buf[di + 2] * da * (1 - al)) / (oa || 1));
        buf[di + 3] = Math.round(oa * 255);
      }
    }
  }
  // Shared layout: original scrim + centred revive_bg + yes/no row centred in the panel.
  // yes = revive_yes.png (视频复活), no = revive_no.png (重来).
  function computeLayout(w, h) {
    var panelW = pics.bg ? pics.bg.width : 854;
    var panelH = pics.bg ? pics.bg.height : 429;
    var yesW = pics.yes ? pics.yes.width : 398;
    var yesH = pics.yes ? pics.yes.height : 132;
    var noW = pics.no ? pics.no.width : 275;
    var noH = pics.no ? pics.no.height : 132;
    var btnGap = 24;
    // Keep original pixel size. Only uniform-scale down if the panel cannot fit.
    var maxW = Math.round(w * 0.92), maxH = Math.round(h * 0.92);
    var scale = 1;
    if (panelW > maxW) scale = Math.min(scale, maxW / panelW);
    if (panelH > maxH) scale = Math.min(scale, maxH / panelH);
    if (scale < 1) {
      panelW = Math.round(panelW * scale);
      panelH = Math.round(panelH * scale);
      yesW = Math.round(yesW * scale);
      yesH = Math.round(yesH * scale);
      noW = Math.round(noW * scale);
      noH = Math.round(noH * scale);
      btnGap = Math.round(btnGap * scale);
    }
    var bx = Math.round((w - panelW) / 2);
    var by = Math.max(0, Math.round((h - panelH) / 2));
    var total = yesW + btnGap + noW;
    var x0 = Math.round(bx + (panelW - total) / 2);
    var y0 = Math.round(by + panelH * 0.52);
    return {
      bx: bx, by: by, bw: panelW, bh: panelH,
      x0: x0, y0: y0, yw: yesW, yh: yesH,
      nx: x0 + yesW + btnGap, ny: y0, nw: noW, nh: noH,
      gap: btnGap, w: w, h: h
    };
  }
  function destroyC3Dialog() {
    var r = rt();
    for (var i = 0; i < c3DlgInsts.length; i++) {
      var rec = c3DlgInsts[i];
      var inst = rec && rec.inst;
      if (!inst) continue;
      try { if (GameGlobal.__plonkyReleaseC3SpriteTex) GameGlobal.__plonkyReleaseC3SpriteTex(inst); } catch (eRel) {}
      try {
        if (r && typeof r.DestroyInstance === 'function') r.DestroyInstance(inst);
        else if (typeof inst.Destroy === 'function') inst.Destroy();
      } catch (eD) {
        try { if (typeof inst.Destroy === 'function') inst.Destroy(); } catch (eD2) {}
      }
    }
    c3DlgInsts = [];
  }
  function dbToLayer(layer, x, y) {
    try {
      if (layer && typeof layer.DrawSurfaceToLayer === 'function') {
        var p = layer.DrawSurfaceToLayer(x, y, 0);
        if (p && p.length >= 2) return { x: +p[0], y: +p[1] };
        if (p && p.x != null) return { x: +p.x, y: +p.y };
      }
    } catch (e0) {}
    try {
      if (layer && typeof layer.CanvasToLayer === 'function') {
        var p2 = layer.CanvasToLayer(x, y, 0);
        if (p2 && p2.length >= 2) return { x: +p2[0], y: +p2[1] };
      }
    } catch (e1) {}
    return { x: x, y: y };
  }
  function placeC3Inst(inst, layer, dbx, dby, dbw, dbh, opt) {
    if (!inst) return false;
    var a = dbToLayer(layer, dbx, dby);
    var b = dbToLayer(layer, dbx + dbw, dby + dbh);
    var w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    var lx = Math.min(a.x, b.x), ly = Math.min(a.y, b.y);
    var wi = null;
    try { wi = inst.GetWorldInfo ? inst.GetWorldInfo() : null; } catch (eW) {}
    if (!wi) return false;
    var ox = 0.5, oy = 0.5;
    try { if (typeof wi.GetOriginX === 'function') ox = wi.GetOriginX(); } catch (eOx) {}
    try { if (typeof wi.GetOriginY === 'function') oy = wi.GetOriginY(); } catch (eOy) {}
    try { if (typeof wi.SetSize === 'function') wi.SetSize(w, h); } catch (eS) {}
    try { if (typeof wi.SetXY === 'function') wi.SetXY(lx + w * ox, ly + h * oy); }
    catch (eXy) {
      try { wi.SetX(lx + w * ox); wi.SetY(ly + h * oy); } catch (eXy2) {}
    }
    try { if (typeof wi.SetAngle === 'function') wi.SetAngle(0); } catch (eA) {}
    var op = (opt && opt.opacity != null) ? opt.opacity : 1;
    try { if (typeof wi.SetOpacity === 'function') wi.SetOpacity(op); } catch (eO) {}
    if (opt && opt.color && opt.color.length >= 3) {
      var cr = +opt.color[0], cg = +opt.color[1], cb = +opt.color[2];
      try { if (typeof wi.SetUnpremultipliedColor === 'function') wi.SetUnpremultipliedColor(cr, cg, cb); } catch (eC0) {}
      try { if (typeof wi.SetColorRgb === 'function') wi.SetColorRgb(cr, cg, cb); } catch (eC1) {}
      try {
        var col = wi._unpremultipliedColor || wi._color;
        if (col) {
          if (typeof col.setRgb === 'function') col.setRgb(cr, cg, cb);
          else if (typeof col.set === 'function') col.set(cr, cg, cb);
        }
      } catch (eC2) {}
    }
    try { if (typeof wi.SetVisible === 'function') wi.SetVisible(true); } catch (eV) {}
    try { if (typeof wi.SetBboxChanged === 'function') wi.SetBboxChanged(); } catch (eB) {}
    disarmC3Inst(inst);
    try { if (typeof wi.MoveToTop === 'function') wi.MoveToTop(); } catch (eZ) {}
    return true;
  }
  function disarmC3Inst(inst) {
    if (!inst) return;
    try {
      var sdk = null;
      try { sdk = inst.GetSdkInstance ? inst.GetSdkInstance() : inst._sdkInst; } catch (eS) {}
      if (sdk && typeof sdk.SetCollisions === 'function') sdk.SetCollisions(false);
    } catch (e0) {}
    try {
      var wi2 = inst.GetWorldInfo ? inst.GetWorldInfo() : null;
      if (wi2 && typeof wi2.SetCollisionEnabled === 'function') wi2.SetCollisionEnabled(false);
    } catch (e1) {}
    try {
      var beh = typeof inst.GetBehaviorInstances === 'function' ? inst.GetBehaviorInstances() : [];
      for (var i = 0; i < (beh && beh.length || 0); i++) {
        var nm = '';
        try {
          var bt = beh[i] && beh[i].GetBehaviorType && beh[i].GetBehaviorType();
          nm = String((bt && bt.GetName && bt.GetName()) || '');
        } catch (eN) {}
        if (!/solid|physics|platform|car/i.test(nm)) continue;
        try {
          var bsdk = beh[i].GetSdkInstance ? beh[i].GetSdkInstance() : beh[i]._sdkInst;
          if (bsdk && typeof bsdk.SetEnabled === 'function') bsdk.SetEnabled(false);
        } catch (eE) {}
      }
    } catch (eB) {}
  }
  function paintC3Inst(rec) {
    if (!rec || !rec.inst) return;
    if (rec.key === 'scrim') return;
    if (rec.texBusy) return;
    if (rec.texApplied && rec.imgUsed === rec.img) return;
    var img = rec.img;
    if (img && (img.source || img.data) && typeof GameGlobal.__plonkyC3ImageTexture === 'function' && typeof GameGlobal.__plonkyAssignC3SpriteTex === 'function') {
      try {
        var tex = GameGlobal.__plonkyC3ImageTexture(rec.key, img);
        if (tex && GameGlobal.__plonkyAssignC3SpriteTex(rec.inst, tex)) {
          rec.texApplied = true;
          rec.imgUsed = img;
          console.warn('[Plonky] own-art: assigned decoded ' + rec.key + ' ' + img.width + 'x' + img.height + ' source=' + !!img.source);
          return;
        }
      } catch (eAs) {
        console.warn('[Plonky] own-art: assign decoded ' + rec.key + ' failed - ' + (eAs && eAs.message));
      }
    }
    var url = (img && img.path) || PATHS[rec.key];
    if (!url || typeof GameGlobal.__plonkyLoadSpriteImage !== 'function') return;
    rec.texBusy = true;
    Promise.resolve(GameGlobal.__plonkyLoadSpriteImage(rec.inst, url)).then(function (ok) {
      rec.texBusy = false;
      rec.texApplied = rec.texApplied || !!ok;
      if (ok) rec.imgUsed = img;
      if (!ok && img && img.path && img.path !== url) {
        rec.texBusy = true;
        return Promise.resolve(GameGlobal.__plonkyLoadSpriteImage(rec.inst, img.path));
      }
      return ok;
    }).then(function (ok) {
      rec.texBusy = false;
      rec.texApplied = rec.texApplied || !!ok;
      if (ok) rec.imgUsed = img;
    }, function () { rec.texBusy = false; });
  }
  function layoutC3Dialog() {
    if (!c3DlgInsts.length) return false;
    var r = rt();
    var lay = r && runningLayout(r);
    var layer = null;
    try { if (lay && typeof lay.GetLayerByName === 'function') layer = lay.GetLayerByName('UI_game'); } catch (eL) {}
    if (!layer) try { layer = c3DlgInsts[0].inst.GetWorldInfo().GetLayer(); } catch (eL2) {}
    var size = GameGlobal.__plonkyGlSize ? GameGlobal.__plonkyGlSize() : null;
    var dw = size && size.w, dh = size && size.h;
    if (!dw || !dh || !layer) return false;
    layout = computeLayout(dw, dh);
    for (var i = 0; i < c3DlgInsts.length; i++) {
      var rec = c3DlgInsts[i];
      var box = null;
      if (rec.key === 'scrim') box = { x: 0, y: 0, w: dw, h: dh, opacity: 0.4, color: [1, 1, 1] };
      else if (rec.key === 'bg') box = { x: layout.bx, y: layout.by, w: layout.bw, h: layout.bh };
      else if (rec.key === 'yes') box = { x: layout.x0, y: layout.y0, w: layout.yw, h: layout.yh };
      else if (rec.key === 'no') box = { x: layout.nx, y: layout.ny, w: layout.nw, h: layout.nh };
      if (box) placeC3Inst(rec.inst, layer, box.x, box.y, box.w, box.h, box);
      paintC3Inst(rec);
    }
    function raiseKey(key) {
      for (var z = 0; z < c3DlgInsts.length; z++) {
        if (c3DlgInsts[z].key !== key) continue;
        try {
          var wiZ = c3DlgInsts[z].inst.GetWorldInfo();
          if (wiZ && typeof wiZ.MoveToTop === 'function') wiZ.MoveToTop();
        } catch (eZ2) {}
      }
    }
    raiseKey('scrim');
    raiseKey('bg');
    raiseKey('yes');
    raiseKey('no');
    return true;
  }
  function spawnC3Dialog() {
    if (!shown) return false;
    var r = rt();
    if (!r || typeof r.CreateInstance !== 'function') {
      if (ovLog < 4) { ovLog++; console.warn('[Plonky] dialog: C3 CreateInstance missing'); }
      return false;
    }
    var lay = runningLayout(r);
    if (!lay) return false;
    var layer = null;
    try { if (typeof lay.GetLayerByName === 'function') layer = lay.GetLayerByName('UI_game'); } catch (eL) {}
    if (!layer) {
      try { if (typeof lay.GetLayer === 'function') layer = lay.GetLayer(lay.GetLayerCount() - 2); } catch (eL2) {}
    }
    if (!layer) return false;
    var oc = null;
    var names = ['tlacko_ibaobr', 'obdlznik_btn', 'tlacko'];
    for (var n = 0; n < names.length && !oc; n++) {
      try { oc = r.GetObjectClassByName(names[n]); } catch (eN) {}
    }
    if (!oc) {
      if (ovLog < 4) { ovLog++; console.warn('[Plonky] dialog: no sprite class to spawn'); }
      return false;
    }
    function make(key, img, classNames) {
      for (var i = 0; i < c3DlgInsts.length; i++) {
        if (c3DlgInsts[i].key === key) {
          c3DlgInsts[i].img = img || c3DlgInsts[i].img;
          return c3DlgInsts[i];
        }
      }
      var names2 = classNames || names;
      var oc2 = null;
      for (var n2 = 0; n2 < names2.length && !oc2; n2++) {
        try { oc2 = r.GetObjectClassByName(names2[n2]); } catch (eN2) {}
      }
      if (!oc2) oc2 = oc;
      if (!oc2) return null;
      var inst = r.CreateInstance(oc2, layer, 0, 0);
      if (!inst) return null;
      try { disarmC3Inst(inst); } catch (eDis) {}
      try { if (layer && typeof layer.SortAndAddInstancesByZIndex === 'function') layer.SortAndAddInstancesByZIndex(inst); } catch (eZ) {}
      var rec = { inst: inst, key: key, img: img };
      c3DlgInsts.push(rec);
      return rec;
    }
    var before = c3DlgInsts.length;
    make('scrim', null, ['zakrytie_sprite', 'tlacko_ibaobr', 'obdlznik_btn', 'tlacko']);
    make('bg', pics.bg || null);
    make('yes', pics.yes || null);
    make('no', pics.no || null);
    if (c3DlgInsts.length !== before) {
      console.warn('[Plonky] dialog: spawned ' + c3DlgInsts.length + ' C3 sprites on UI_game own-art scrim/bg/yes/no bg=' + !!(pics.bg) + ' yes=' + !!(pics.yes) + ' no=' + !!(pics.no));
    }
    try { if (typeof r.SetNeedsRedraw === 'function') r.SetNeedsRedraw(); } catch (eNeed) {}
    return layoutC3Dialog();
  }
  function ensureC3Dialog() {
    if (!shown) return;
    if (!c3DlgInsts.length) return;
    layoutC3Dialog();
  }
  function composeOverlay(w, h) {
    if (!ovBuf || ovW !== w || ovH !== h) { ovBuf = new Uint8Array(w * h * 4); ovW = w; ovH = h; }
    var buf = ovBuf;
    // Opaque scrim: Android presents C3's white clear behind a translucent overlay.
    for (var i = 0; i < buf.length; i += 4) { buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 255; }
    layout = computeLayout(w, h);
    blitOv(buf, w, h, pics.bg, layout.bx, layout.by, layout.bw, layout.bh, 1);
    blitOv(buf, w, h, pics.yes, layout.x0, layout.y0, layout.yw, layout.yh, pressed === 'yes' ? 0.82 : 1);
    blitOv(buf, w, h, pics.no, layout.nx, layout.ny, layout.nw, layout.nh, pressed === 'no' ? 0.82 : 1);
    try { GameGlobal.__plonkyGlOvGen = (GameGlobal.__plonkyGlOvGen | 0) + 1; } catch (eGen) {}
    return layout;
  }
  // ---- self-heal -------------------------------------------------------------------------------
  // If the plugin is left holding a non-null rewardedState while no dialog is up and nothing is held,
  // every later advert request is ignored by the plugin's own guard and the dialog would never appear.
  // ---- failure-flag trigger ---------------------------------------------------------------------
  // The advert request is not the only way into a death, so poll the project's own `failed_vybehnute`
  // flag as well (it is set when the failure panel appears). Independent of the advert, a level must be
  // running and no dialog may be up.
  var flagAt = 0, flagLog = 0;
  function levelRunning() {
    try {
      var r = rt(); if (!r) return false;
      var lm = r.GetLayoutManager ? r.GetLayoutManager() : null;
      var lay = lm && lm.GetMainRunningLayout ? lm.GetMainRunningLayout() : null;
      var nm = lay && lay.GetName ? String(lay.GetName()) : '';
      return !!nm && nm !== 'menu_layout' && nm !== 'loader_layout';
    } catch (e) { return false; }
  }
  function flagTrigger() {
    try {
      var now = Date.now();
      if (now - flagAt < 300) return;
      flagAt = now;
      if (shown || nativeUp) return;
      if (now - lastChoiceAt < 2500) return;
      if (!levelRunning()) return;
      var failed = readGlobal('failed_vybehnute');
      if (failed !== true) return;
      if (flagLog < 8) { flagLog++; console.warn('[Plonky] dialog: failed flag is up - waiting for death animation'); }
    } catch (e) {}
  }
  GameGlobal.__plonkyFlagTrigger = flagTrigger;
  var healAt = 0, healLog = 0;
  function selfHeal() {
    try {
      var now = Date.now();
      if (now - healAt < 2000) return;
      healAt = now;
      if (shown) return;
       if (rewardAdvertIsActive(now)) return;
      try { if (GameGlobal.__plonkyHeldAd && GameGlobal.__plonkyHeldAd()) return; } catch (eH) {}
      var f = advertSdkInstances();
      var dirty = 0;
      for (var i = 0; i < f.sdks.length; i++) {
        var sdk = f.sdks[i];
        if (sdk.rewardedState != null || sdk.videoState != null || sdk.rewardedInterstitialState != null) dirty++;
      }
      if (!dirty) return;
      if (healLog < 6) { healLog++; console.warn('[Plonky] heal: stale advert state found (' + advertStateText() + ') - clearing'); }
      resetAdvertState();
    } catch (e) {}
  }
  GameGlobal.__plonkySelfHeal = selfHeal;
  var ovRaf = null, ovDirty = true, ovLoopLog = 0, ovDbg = 0, tickCount = 0;
  function ovSchedule() {
    if (!shown || nativeUp) return;
    if (GameGlobal.__usePresentBlit) return;
    try {
      var raf = null;
      if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame;
      else if (typeof wx !== 'undefined' && typeof wx.requestAnimationFrame === 'function') raf = wx.requestAnimationFrame.bind(wx);
      if (raf) ovRaf = raf(function () { ovRaf = null; ovFrame(); });
      else ovRaf = setTimeout(ovFrame, 100);
    } catch (e) { ovRaf = setTimeout(ovFrame, 100); }
  }
  function overlayPixels() {
    var size = GameGlobal.__plonkyGlSize ? GameGlobal.__plonkyGlSize() : null;
    var w = size && size.w, h = size && size.h;
    if (!w || !h) return null;
    if (ovDirty || !ovBuf || ovW !== w || ovH !== h) {
      composeOverlay(w, h);
      ovDirty = false;
    }
    return { buf: ovBuf, w: w, h: h };
  }
  function ovFrame() {
    if (!shown || nativeUp) return;
    if (GameGlobal.__usePresentBlit) return;
    try {
      var draw = GameGlobal.__plonkyGlOverlayDraw;
      if (ovDbg < 3) {
        ovDbg++;
        console.warn('[Plonky] gl-overlay: frame draw=' + typeof draw + ' blit=' + !!GameGlobal.__usePresentBlit);
      }
      if (typeof draw !== 'function') return;
      if (!pics.bg) { ovSchedule(); return; }
      var px = overlayPixels();
      if (px && draw(px.buf, px.w, px.h)) {
        if (glDrawOk === 0 && ovLoopLog < 3) { ovLoopLog++; console.warn('[Plonky] gl-overlay: first draw ok'); }
        glDrawOk++;
      } else {
        glDrawFail++;
      }
    } catch (e) {
      if (ovLoopLog < 3) { ovLoopLog++; console.warn('[Plonky] gl-overlay: frame error - ' + (e && e.message)); }
    }
    ovSchedule();
  }
  GameGlobal.__plonkyGlOverlayFrame = ovFrame;
  function glOverlayTick() {
    if (!shown || nativeUp) return;
    ensureC3Dialog();
  }
  // ---- publish the helpers on every global object ----------------------------------------------
  // In this mini-game environment GameGlobal is NOT the object the DevTools console evaluates against,
  // so helpers only attached there are invisible in the console. Attach them everywhere.
  function publishOn(name, val) {
    var ok = [];
    function put(target, label) {
      try {
        if (!target) return;
        target[name] = val;
        if (target[name] === val) ok.push(label);          // read back: only count it if it stuck
      } catch (e) {}
    }
    put(GameGlobal, 'GameGlobal');
    try { put(typeof globalThis !== 'undefined' ? globalThis : null, 'globalThis'); } catch (e1) {}
    try { put(typeof window !== 'undefined' ? window : null, 'window'); } catch (e2) {}
    try { put(typeof self !== 'undefined' ? self : null, 'self'); } catch (e3) {}
    try { put(typeof wx !== 'undefined' ? wx : null, 'wx'); } catch (e4) {}
    return ok;
  }
  var PUBLISH_NAMES = [
    '__plonkyShowDialog', '__plonkyClickButton', '__plonkyDialogIsOpen', '__plonkyOverlayTouch',
    '__plonkyAutoReviveThenShow', '__plonkyReleaseAd', '__plonkyCancelAd', '__plonkyHeldAd', '__plonkyResetAdvertState',
    '__plonkyAdvertState', '__plonkyReadGlobal', '__plonkyDeathRequest', '__plonkyCallFunction',
    '__plonkyLevelStart', '__plonkySetCheckpoint', '__plonkyCaptureCheckpoint', '__plonkySelfHeal',
    '__plonkyFlagTrigger', '__plonkyAceMap', '__plonkyCndMap', '__plonkySuspend', '__plonkyResumeGame',
    '__plonkyGlOverlayTick', '__plonkyGlOverlayFrame', '__plonkyComposeOverlay', '__plonkyDialogMode',
    '__plonkyNativeUp', '__plonkyPlatformName', '__plonkyWrapAdvertCreate', '__plonkyRuntime',
    '__plonkyUncoverTick'
  ];
  var pubDone = false;
  var pubTick = 0, autoProbed = false;
  // Runs the ACE probe once, a few seconds after the first level starts, so the id -> name table can be
  // measured from a plain log paste (the vConsole input cannot reach the game's globals in this build).
  var probeAt = 0;
  function autoAceProbe() {
    try {
      if (autoProbed || GameGlobal.__plonkyAutoProbe !== true) return;
      if (typeof GameGlobal.__plonkyAceMap !== 'function') return;
      if (!levelRunning()) {
        if (!autoProbed && GameGlobal.__plonkyAutoProbeLogged !== true) {
          GameGlobal.__plonkyAutoProbeLogged = true;
          console.error('##### auto-probe armed (BUILD rev121-ad-quiet) - waiting for a level');
        }
        probeAt = 0; return;
      }
      var now = Date.now();
      if (!probeAt) { probeAt = now; console.error('##### auto-probe: level detected, probing in 4s'); return; }
      if (now - probeAt < 4000) return;
      autoProbed = true;
      console.error('##### auto-probe: running the ACE name map');
      if (GameGlobal.__plonkyAceMap) GameGlobal.__plonkyAceMap();
      if (GameGlobal.__plonkyCndMap) GameGlobal.__plonkyCndMap();
    } catch (e) { console.error('##### auto-probe failed - ' + (e && e.message)); }
  }
  // Opens the revive dialog automatically a few seconds into a level (dev aid: no death needed).
  var dlgTestAt = 0, dlgTestDone = false;
  function autoDialogTest() {
    try {
      if (dlgTestDone || GameGlobal.__plonkyAutoDialogTest !== true) return;
      if (!levelRunning()) { dlgTestAt = 0; return; }
      var now = Date.now();
      if (!dlgTestAt) { dlgTestAt = now; console.error('##### dialog test: level detected, opening the panel in 6s'); return; }
      if (now - dlgTestAt < 6000) return;
      dlgTestDone = true;
      console.error('##### dialog test: opening the revive dialog now (no death needed) - tap 是的 or 重来');
      if (GameGlobal.__plonkyShowDialog) GameGlobal.__plonkyShowDialog('auto-test (no death needed)');
      else console.error('##### dialog test: __plonkyShowDialog missing');
    } catch (e) { console.error('##### dialog test failed - ' + (e && e.message)); }
  }
  GameGlobal.__plonkyAutoDialogTestFn = autoDialogTest;
  var stampCount = 0;
  function buildStamp(where) {}

  function publishAll() {
    var ns = {}, count = 0, where = null;
    for (var i = 0; i < PUBLISH_NAMES.length; i++) {
      var n = PUBLISH_NAMES[i], v = undefined;
      try { v = GameGlobal[n]; } catch (e) {}
      if (v === undefined || v === null) continue;
      ns[n] = v;
      ns[n.replace('__plonky', '')] = v;                   // __plonky.aceProbe(25) style
      ns[n.replace('__plonky', '').charAt(0).toLowerCase() + n.replace('__plonky', '').slice(1)] = v;
      count++;
      var ok = publishOn(n, v);
      if (!where && ok.length) where = ok;
    }
    publishOn('__plonky', ns);
    publishOn('plonky', ns);
    if (!pubDone && count) {
      pubDone = true;
    }
    return count;
  }
  publishAll();
  GameGlobal.__plonkyStamp = buildStamp;
  GameGlobal.__plonkyPublishHelpers = publishAll;
  GameGlobal.__plonkyAutoProbeFn = autoAceProbe;   // (the boolean knob stays __plonkyAutoProbe)
  GameGlobal.__plonkyGlOverlayTickFn = glOverlayTick;
  GameGlobal.__plonkyComposeOverlay = composeOverlay;
  GameGlobal.__plonkyGlOverlayTick = glOverlayTick;
  GameGlobal.__plonkyEnsureC3Dialog = ensureC3Dialog;
  GameGlobal.__plonkyOverlaySpec = function () {
    if (!shown || nativeUp || !pics.bg) return null;
    var size = GameGlobal.__plonkyGlSize ? GameGlobal.__plonkyGlSize() : null;
    if (!size || !size.w || !size.h) return null;
    layout = computeLayout(size.w, size.h);
    return {
      w: size.w, h: size.h,
      bg: pics.bg, yes: pics.yes, no: pics.no,
      layout: layout,
      pressed: pressed
    };
  };
  GameGlobal.__plonkyOverlayComposite = function (buf, w, h) {
    if (!shown || nativeUp) return false;
    try {
      // dark scrim
      for (var i = 0; i < buf.length; i += 4) {
        buf[i] = (buf[i] * 0.35) | 0; buf[i + 1] = (buf[i + 1] * 0.35) | 0; buf[i + 2] = (buf[i + 2] * 0.35) | 0; buf[i + 3] = 255;
      }
      layout = computeLayout(w, h);
      blit(buf, w, h, pics.bg, layout.bx, layout.by, layout.bw, layout.bh);
      blit(buf, w, h, pics.yes, layout.x0, layout.y0, layout.yw, layout.yh);
      blit(buf, w, h, pics.no, layout.nx, layout.ny, layout.nw, layout.nh);
      if (pressed === 'yes') shade(buf, w, h, layout.x0, layout.y0, layout.yw, layout.yh, 0.82);
      if (pressed === 'no') shade(buf, w, h, layout.nx, layout.ny, layout.nw, layout.nh, 0.82);
      return true;
    } catch (eC) { return false; }
  };
  // ------------------------------------------------------------------ button clicks
  var pressed = '';        // 'yes' | 'no' | '' - which button the finger is down on
  function hitTest(px, py) {
    if (!layout) {
      var size = GameGlobal.__plonkyGlSize ? GameGlobal.__plonkyGlSize() : null;
      if (size && size.w && size.h) layout = computeLayout(size.w, size.h);
    }
    if (!layout) return '';
    var pad = 16;
    if (px >= layout.x0 - pad && px <= layout.x0 + layout.yw + pad &&
        py >= layout.y0 - pad && py <= layout.y0 + layout.yh + pad) return 'yes';
    if (px >= layout.nx - pad && px <= layout.nx + layout.nw + pad &&
        py >= layout.ny - pad && py <= layout.ny + layout.nh + pad) return 'no';
    return '';
  }
  function fireButton(which) {
    var ok = which === 'yes';
    console.warn('[Plonky] dialog: button ' + (ok ? 'YES (是 的)' : 'NO (重 来)') + ' clicked');
    // A caller-supplied handler wins, so the behaviour can be replaced without touching this module:
    //   GameGlobal.__plonkyOnRevive  = function () { ... }   // 是的
    //   GameGlobal.__plonkyOnRestart = function () { ... }   // 重来
    var hook = ok ? GameGlobal.__plonkyOnRevive : GameGlobal.__plonkyOnRestart;
    if (typeof hook === 'function') {
      try {
        hook();
        console.warn('[Plonky] dialog: handled by GameGlobal.' + (ok ? '__plonkyOnRevive' : '__plonkyOnRestart'));
        hide();
        return;
      } catch (eH) {
        console.warn('[Plonky] dialog: handler threw - ' + (eH && eH.message) + ' (falling back to default)');
      }
    }
    choose(ok);
  }
  GameGlobal.__plonkyClickButton = function (which) {
    if (!shown) { console.warn('[Plonky] dialog: click ignored, dialog is closed'); return false; }
    if (which !== 'yes' && which !== 'no') { console.warn('[Plonky] dialog: click needs yes|no'); return false; }
    fireButton(which);
    return true;
  };
  GameGlobal.__plonkyDialogIsOpen = function () { return !!shown; };
  // down + up inside the same button = one click; dragging off cancels it
  GameGlobal.__plonkyOverlayTouch = function (cx, cy, type) {
    if (!shown) return false;
    if (nativeUp) return true;   // the platform modal owns its own input
    try {
      if (!layout) {
        var size0 = GameGlobal.__plonkyGlSize ? GameGlobal.__plonkyGlSize() : null;
        if (size0 && size0.w && size0.h) layout = computeLayout(size0.w, size0.h);
      }
      var hit = hitTest(cx, cy);
      if (GameGlobal.__plonkyTapLog == null) GameGlobal.__plonkyTapLog = 0;
      if (GameGlobal.__plonkyTapLog < 12) {
        GameGlobal.__plonkyTapLog++;
        console.warn('[Plonky] dialog: tap #' + GameGlobal.__plonkyTapLog + ' ' + type
          + ' xy=' + Math.round(cx) + ',' + Math.round(cy)
          + ' layout=' + (layout ? (layout.w + 'x' + layout.h) : 'none')
          + ' yes=' + (layout ? (layout.x0 + ',' + layout.y0 + ' ' + layout.yw + 'x' + layout.yh) : '-')
          + ' no=' + (layout ? (layout.nx + ',' + layout.ny + ' ' + layout.nw + 'x' + layout.nh) : '-')
          + ' hit=' + (hit || 'none'));
      }
      if (type === 'pointerdown') {
        pressed = hit;
        if (pressed) { console.warn('[Plonky] dialog: button ' + pressed + ' pressed'); ovDirty = true; }
        if (pressed === 'yes') fireButton('yes');
      } else if (type === 'pointermove') {
        if (hit !== pressed) {
          if (pressed && !hit) console.warn('[Plonky] dialog: button ' + pressed + ' released outside (cancelled)');
          ovDirty = true;
          pressed = hit;
        }
      } else if (type === 'pointerup') {
        var down = pressed;
        pressed = '';
        if (hit && hit === down && hit !== 'yes') fireButton(hit);
      } else if (type === 'pointercancel') {
        pressed = '';
      }
    } catch (eT) { pressed = ''; }
    return true;   // modal: the dialog swallows every event while it is open
  };
  var aliveLogged = false;
  function tick() {
    try {
      wrapAdvertCreate();
      wrapRestartIntercept();
      try { tickUiInterAds(); } catch (eUi) {}
      var r = rt();
      if (!aliveLogged) {
        aliveLogged = true;
        var okPics = (pics.bg ? 'bg' : '') + (pics.yes ? ',yes' : '') + (pics.no ? ',no' : '');
        console.warn('[Plonky] dialog: alive, runtime=' + (r ? 'ok' : 'MISSING') + ' images=[' + (okPics || 'none') + ']' +
          ' decode=' + (typeof GameGlobal.__plonkyDecodePng));
      }
      if (r) {
        var why = detect(r);
        var st = why ? 'dead' : 'alive';
        if (st !== lastState) {
          lastState = st;
          console.warn('[Plonky] dialog: state ' + st + (why ? ' (' + why + ')' : ''));
        }
      }
    } catch (e) { try { console.warn('[Plonky] dialog: tick error ' + (e && e.message)); } catch (e2) {} }
    try { setTimeout(tick, 150); } catch (eN) {}
  }
  try { setTimeout(tick, 900); } catch (eS) {}
})();

(function plonkyWatch() {
  if (GameGlobal.__plonkyWatch !== true) return;
  function grabRuntime() {
    try { if (GameGlobal.__plonkyRuntime) return GameGlobal.__plonkyRuntime; } catch (e0) {}
    try { if (typeof getLocalRuntime === 'function') return getLocalRuntime(window.c3_runtimeInterface); } catch (e1) {}
    try { if (self.c3_runtimeInterface && self.c3_runtimeInterface._localRuntime) return self.c3_runtimeInterface._localRuntime; } catch (e2) {}
    return null;
  }
  var W_VARS = ['revive', 'checkpoint', 'checkpoint_revive', 'pocet_zivotov', 'pocet_restartov'];
  var W_CTRL = ['controls', 'arrow_key', 'mobile', 'home_btn', 'restart_btn', 'well_done'];
  var W_COUNT = ['panko1', 'panko_revive', 'helper', 'chodec', 'panko1_Player_hlava'];
  var lastSig = '', lines = 0, alive = false;
  function readVars(r) {
    var out = [];
    var srcs = [['globalVars', r.globalVars], ['_globalVars', r._globalVars], ['_globalVarValues', r._globalVarValues]];
    for (var i = 0; i < srcs.length; i++) {
      var src = srcs[i][1];
      if (!src) continue;
      var keys = [];
      try { keys = Object.keys(src); } catch (eK) {}
      out.push(srcs[i][0] + '=' + keys.length + 'keys');
      for (var v = 0; v < W_VARS.length; v++) {
        var nm = W_VARS[v], raw;
        try { raw = src[nm]; } catch (e1) {}
        if (raw === undefined && typeof src.get === 'function') { try { raw = src.get(nm); } catch (e2) {} }
        if (raw === undefined || raw === null) continue;
        var val = raw;
        try { if (typeof raw.GetValue === 'function') val = raw.GetValue(); } catch (e3) {}
        out.push(nm + '=' + val);
      }
      break;
    }
    return out;
  }
  function countOf(r, cn) {
    try {
      var oc = r.GetObjectClassByName ? r.GetObjectClassByName(cn) : null;
      if (!oc) return cn + '#-';
      var list = (typeof oc._GetInstances === 'function' ? oc._GetInstances()
        : (typeof oc.GetInstances === 'function' ? oc.GetInstances() : [])) || [];
      var out = cn + '#' + list.length;
      for (var k = 0; k < list.length && k < 4; k++) {
        var wi = null;
        try { wi = list[k].GetWorldInfo ? list[k].GetWorldInfo() : null; } catch (eW) {}
        if (!wi) { out += '(no-wi)'; continue; }
        var x = '?', y = '?', v = '?';
        try { x = Math.round(wi.GetX()); y = Math.round(wi.GetY()); } catch (eXY) {}
        try { if (typeof wi.IsVisible === 'function') v = wi.IsVisible() ? 1 : 0; } catch (eVis) {}
        out += '(' + x + ',' + y + ',v' + v + ')';
      }
      return out;
    } catch (eC) { return cn + '#err'; }
  }
  function tick() {
    try {
      if (lines < 150) {
        var r = grabRuntime();
        if (!r) {
          if (!alive) { alive = true; lines++; console.warn('[Plonky] watch: alive, runtime not available yet'); }
        } else {
          var parts = [];
          if (!alive) {
            alive = true;
            var api = [];
            try { api.push('objClasses=' + (typeof r.GetAllObjectClasses === 'function' ? (r.GetAllObjectClasses() || []).length : 'n/a')); } catch (eA) {}
            try { api.push('runtimeVarKeys=' + Object.keys(r).filter(function (k) { return /var/i.test(k); }).join(',')); } catch (eRK) {}
            try {
              var all = (typeof r.GetAllObjectClasses === 'function' ? r.GetAllObjectClasses() : []) || [];
              var ctrl = [];
              for (var a = 0; a < all.length; a++) {
                var nm2 = ''; try { nm2 = all[a].GetName ? all[a].GetName() : ''; } catch (eNm) {}
                if (/ctrl|arrow|mobile|joystick|ovlad|smer|tlacid/i.test(nm2)) ctrl.push(nm2);
              }
              api.push('controlish=[' + ctrl.join(',') + ']');
            } catch (eAll) {}
            parts.push('LIVENESS:', api.join(' '));
          }
          var vv = readVars(r);
          for (var i2 = 0; i2 < vv.length; i2++) parts.push(vv[i2]);
          for (var c = 0; c < W_CTRL.length; c++) parts.push(countOf(r, W_CTRL[c]));
          for (var q = 0; q < W_COUNT.length; q++) parts.push(countOf(r, W_COUNT[q]).split('(')[0]);
          var sig = parts.join(' ');
          if (sig !== lastSig) {
            lastSig = sig;
            lines++;
            console.warn('[Plonky] watch[' + lines + ']: ' + sig);
          }
        }
      }
    } catch (eT) {}
    try { setTimeout(tick, 500); } catch (eN) {}
  }
  try { setTimeout(tick, 1500); } catch (eS) {}
})();

(function normalizeHostLocation() {
  var hostLocation = null;
  var fallback = GameGlobal.location || {};
  try { hostLocation = window && window.location; } catch (e) {}
  if (!hostLocation || hostLocation === fallback) return;
  ["search", "hash", "pathname"].forEach(function (name) {
    if (typeof hostLocation[name] === "string") return;
    var value = typeof fallback[name] === "string" ? fallback[name] : "";
    try {
      Object.defineProperty(hostLocation, name, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: value
      });
    } catch (e2) {
      try { hostLocation[name] = value; } catch (e3) {}
    }
  });
})();

function isDevtools() {
  try {
    if (typeof __wxConfig !== "undefined" && __wxConfig && __wxConfig.platform === "devtools") {
      return true;
    }
  } catch (e) {}
  try {
    if (typeof wx.getDeviceInfo === "function") {
      var d = wx.getDeviceInfo();
      if (d && d.platform === "devtools") return true;
    }
  } catch (e) {}
  return false;
}

function useWasm2jsFallback() {
  if (isDevtools()) return true;
  try {
    if (!GameGlobal.__NativeWebAssembly || typeof GameGlobal.__NativeWebAssembly.instantiate !== "function") {
      return true;
    }
  } catch (e0) {
    return true;
  }
  try {
    if (wx.getDeviceInfo) {
      var device = wx.getDeviceInfo();
      var platform = device && String(device.platform).toLowerCase();
      // Native WASM implementations vary across device engines. The older
      // Emscripten Box2D glue is stable with wasm2js on all physical devices.
      return platform === "android" || platform === "ios" || platform === "ohos" || platform === "harmonyos";
    }
  } catch (e) {}
  try {
    if (wx.getSystemInfoSync) {
      var system = wx.getSystemInfoSync();
      var systemPlatform = system && String(system.platform).toLowerCase();
      return systemPlatform === "android" || systemPlatform === "ios" || systemPlatform === "ohos" || systemPlatform === "harmonyos";
    }
  } catch (e2) {}
  return false;
}

function loadSubpackage(name) {
  return new Promise(function (resolve) {
    // DevTools exposes subpackage files to local fetch immediately, but its
    // loadSubpackage task may never settle and monopolises the RAF fallback.
    if (isDevtools()) {
      dwarn(1,"[Plonky] 开发者工具跳过分包任务", name);
      resolve();
      return;
    }
    if (typeof wx.loadSubpackage !== "function") {
      dwarn(1,"[Plonky] 不支持分包加载，继续启动", name);
      resolve();
      return;
    }
    var settled = false;
    var timeoutMs = isDevtools() ? 3000 : 15000;
    var timer = setTimeout(function () {
      dwarn(1,"[Plonky] 分包加载超时，继续启动", name, timeoutMs + "ms");
      finish("timeout");
    }, timeoutMs);
    function finish(source) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      dlog(1,"[Plonky] 分包完成", name, source || "complete");
      resolve();
    }
    try {
      dlog(1,"[Plonky] 加载分包", name);
      wx.loadSubpackage({
        name: name,
        success: function () { finish("success"); },
        fail: function (err) {
          console.error("[Plonky] 分包加载失败", name, err && (err.errMsg || err));
          finish("fail");
        },
        complete: function () { finish("complete"); }
      });
    } catch (e) {
      console.error("[Plonky] 分包加载异常", name, e && (e.message || e));
      finish("exception");
    }
  });
}

function wrapBox2D() {
  var raw = self.Box2DWasmModule;
  if (typeof raw !== "function") return;

  function withTimeout(p, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error(label + " 超时"));
      }, ms);
      Promise.resolve(p).then(function (v) {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(v);
      }, function (e) {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(e);
      });
    });
  }

  var WASM_ENV_KEYS = [
    "abort", "enlargeMemory", "getTotalMemory", "abortOnCannotGrowMemory",
    "jsCall_iiii", "jsCall_viifii", "jsCall_viiiii", "jsCall_vi", "jsCall_vii",
    "jsCall_ii", "jsCall_fif", "jsCall_viii", "jsCall_viifi", "jsCall_v",
    "jsCall_viif", "jsCall_viiiiii", "jsCall_iii", "jsCall_iiiiii",
    "jsCall_fiiiif", "jsCall_viiii",
    "_emscripten_asm_const_iiiii", "_emscripten_asm_const_diiiid",
    "_pthread_key_create", "_abort", "_emscripten_asm_const_iiidii",
    "___assert_fail", "___setErrNo", "_emscripten_memcpy_big",
    "_pthread_getspecific", "_pthread_once", "___syscall54",
    "_emscripten_asm_const_iii", "_emscripten_asm_const_iiidi",
    "_pthread_setspecific", "_emscripten_asm_const_iiii",
    "___syscall6", "___syscall140", "___cxa_pure_virtual", "___syscall146",
    "DYNAMICTOP_PTR", "STACKTOP", "STACK_MAX", "tableBase", "memory", "table"
  ];

  function sanitizeImports(imports) {
    var src = (imports && imports.env) || imports || {};
    var env = {};
    var missing = [];
    for (var i = 0; i < WASM_ENV_KEYS.length; i++) {
      var k = WASM_ENV_KEYS[i];
      var v = src[k];
      if (v == null) {
        missing.push(k);
        continue;
      }
      if (k === "memory" || k === "table") env[k] = v;
      else if (typeof v === "function" || typeof v === "number") env[k] = v;
      else missing.push(k + ":" + typeof v);
    }
    return { env: env };
  }

  function normalizeInstance(result) {
    if (!result) return result;
    if (result.instance) return result;
    if (result.exports) return { instance: result, module: result };
    return { instance: result };
  }

  function readWasmBuffer() {
    var fs = wx.getFileSystemManager();
    var paths = ["box2d.wasm", "/box2d.wasm", "game/box2d.wasm"];
    var last = null;
    for (var i = 0; i < paths.length; i++) {
      try {
        var data = fs.readFileSync(paths[i]);
        return data;
      } catch (e) {
        last = e;
      }
    }
    throw last || new Error("找不到 box2d.wasm");
  }

  function callInstantiate(fn, src, imports, label) {
    var ret;
    try {
      ret = fn(src, imports);
    } catch (e) {
      return Promise.reject(e);
    }
    if (ret && typeof ret.then === "function") return ret.then(normalizeInstance);
    if (ret && (ret.instance || ret.exports)) return Promise.resolve(normalizeInstance(ret));
    return Promise.reject(new Error(label + " 返回了 " + typeof ret));
  }

  function instantiateFromBuffer(imports) {
    var native = GameGlobal.__NativeWebAssembly;
    if (!native || typeof native.instantiate !== "function") {
      return Promise.reject(new Error("没有原生 WebAssembly.instantiate"));
    }
    var buf = readWasmBuffer();
    var bytes = buf instanceof ArrayBuffer ? buf : (buf.buffer || buf);
    if (typeof native.compile === "function") {
      return native.compile(bytes).then(function (mod) {
        return native.instantiate(mod, imports);
      }).then(normalizeInstance);
    }
    return callInstantiate(native.instantiate.bind(native), bytes, imports, "native instantiate");
  }

  function probeWasmFiles() {
    var fs = wx.getFileSystemManager();
    var paths = ["box2d.wasm", "/box2d.wasm", "./box2d.wasm", "wasm/box2d.wasm", "/wasm/box2d.wasm"];
    var bits = [];
    for (var i = 0; i < paths.length; i++) {
      try {
        fs.accessSync(paths[i]);
        var size = "?";
        try {
          var st = fs.statSync(paths[i]);
          size = st && (st.size || (st.stats && st.stats.size)) || "ok";
        } catch (e) {}
        bits.push(paths[i] + "=" + size);
      } catch (e2) {
        bits.push(paths[i] + "=NO");
      }
    }
  }

  function instantiateWasm2js(imports) {
    var env = imports.env;
    if (!env || !env.memory || !env.memory.buffer) {
      throw new Error("wasm2js 需要 memory.buffer");
    }
    var table = env.table;
    if (table && !Array.isArray(table)) {
      var n = 1152;
      try {
        if (typeof table.length === "number" && table.length) n = table.length;
      } catch (e) {}
      var arr = new Array(n);
      if (typeof table.get === "function") {
        for (var i = 0; i < n; i++) {
          try { arr[i] = table.get(i); } catch (e2) { arr[i] = null; }
        }
      }
      env.table = arr;
    }
    var factory = require("./box2d.wasm2js.js");
    if (typeof factory !== "function") {
      throw new Error("box2d.wasm2js.js 未导出 instantiate");
    }
    var exports = factory(imports);
    if (!exports) throw new Error("wasm2js 没有 exports");
    return { instance: { exports: exports } };
  }

  function instantiateWx(imports) {
    var wa = GameGlobal.WXWebAssembly;
    if (!wa || typeof wa.instantiate !== "function") {
      return Promise.reject(new Error("没有 WXWebAssembly"));
    }
    probeWasmFiles();
    var paths = ["/box2d.wasm", "box2d.wasm", "./box2d.wasm", "/wasm/box2d.wasm", "wasm/box2d.wasm"];
    var i = 0;
    function nextPath() {
      if (i >= paths.length) {
        dwarn(1,"[Plonky] WX instantiate buffer fallback");
        try {
          var buf = readWasmBuffer();
          return withTimeout(callInstantiate(wa.instantiate.bind(wa), buf, imports, "WX buffer"), 2500, "WX buffer");
        } catch (e) {
          return Promise.reject(e);
        }
      }
      var p = paths[i++];
      dlog(1,"[Plonky] WX instantiate", p);
      return withTimeout(callInstantiate(wa.instantiate.bind(wa), p, imports, "WX " + p), 2500, "WX " + p).catch(function (err) {
        console.error("[Plonky] WX fail", p, err && (err.errMsg || err.message || err));
        return nextPath();
      });
    }
    return nextPath();
  }

  self.Box2DWasmModule = function (opts) {
    opts = opts || {};
    opts.ENVIRONMENT = "WEB";
    delete opts.wasmBinary;
    return new Promise(function (resolve, reject) {
      var settled = false;
      var modRef = null;
      function done(mod) {
        if (settled) return;
        settled = true;
        GameGlobal.__plonkyReady = true;
        try {
          if (mod && typeof mod.then === "function") {
            try { delete mod.then; } catch (eDel) {}
            try { mod.then = void 0; } catch (eThen) {}
          }
        } catch (eStrip) {}
        try { wx.hideLoading(); } catch (e) {}
        resolve(mod);
      }
      function fail(err) {
        if (settled) return;
        settled = true;
        console.error("[Plonky] box2d fail", err);
        try { wx.hideLoading(); } catch (e) {}
        try {
          wx.showModal({
            title: "物理引擎加载失败",
            content: String(err && (err.message || err)).slice(0, 180) + "\nWindows 模拟器经常无法实例化 WASM，请改用真机预览。",
            showCancel: false
          });
        } catch (e2) {}
        reject(err);
      }
      opts.instantiateWasm = function (imports, successCallback) {
        var clean = sanitizeImports(imports);
        function apply(result) {
          var instance = result && result.instance ? result.instance : result;
          successCallback(instance, result && result.module);
          return instance && instance.exports;
        }
        if (useWasm2jsFallback()) {
          try {
            dlog(1,"[Plonky] Box2D 使用 wasm2js 后端");
            return apply(instantiateWasm2js(clean));
          } catch (err) {
            console.error("[Plonky] wasm2js fail", err);
            fail(err);
            return false;
          }
        }
        var chain = instantiateFromBuffer(clean).catch(function (err) {
          console.error("[Plonky] native wasm fail", err && (err.message || err));
          return instantiateWx(clean);
        }).catch(function (err2) {
          console.error("[Plonky] WX fail, wasm2js fallback", err2 && (err2.message || err2));
          return instantiateWasm2js(clean);
        });
        withTimeout(chain, 20000, "instantiateWasm").then(apply).catch(function (err) {
          console.error("[Plonky] instantiateWasm fail", err);
          fail(err);
        });
        return {};
      };
      var prevInit = opts.onRuntimeInitialized;
      opts.onRuntimeInitialized = function () {
        try { if (typeof prevInit === "function") prevInit(); } catch (e) {}
      };
      try {
        modRef = raw(opts);
      } catch (err) {
        fail(err);
        return;
      }
      if (modRef && (modRef.b2World || modRef.calledRun)) {
        done(modRef);
        return;
      }
      if (modRef && typeof modRef.then === "function") {
        try {
          modRef.then(function (m) { done(m || modRef); }, fail);
        } catch (eThen) {
          fail(eThen);
        }
        return;
      }
      setTimeout(function () {
        if (settled) return;
        if (modRef && modRef.b2World) done(modRef);
        else fail(new Error("Box2D wasm 初始化超时"));
      }, 15000);
    });
  };
}

function boot() {
  if (GameGlobal.__plonkyBootStarted) return;
  GameGlobal.__plonkyBootStarted = true;
  GameGlobal.__plonkyDevtools = isDevtools();
  trace("boot box2d");
  window.C3_Is_Supported = true;
  window.C3_ModernJSSupport_OK = true;
  require("./box2d.wasm.js");
  wrapBox2D();
  trace("boot c3main");
  require("./scripts/c3main.js");
  // Wrap C3_InitRuntime before the DOM side creates the runtime so the switch
  // diagnostics are in place *before* the first layout is loaded. Installing them
  // from a timer is too late: the loader -> menu switch has already begun.
  (function hookRuntimeCreation() {
    try {
      var origInitRuntime = self.C3_InitRuntime;
      if (typeof origInitRuntime !== "function" || origInitRuntime.__plonkyWrapped) return;
      self.C3_InitRuntime = function (runtime, opts) {
        try { installSwitchDiagnostics(runtime); } catch (eHook) {}
        return origInitRuntime.apply(this, arguments);
      };
      self.C3_InitRuntime.__plonkyWrapped = true;
      dlog(1,"[Plonky] diag: C3_InitRuntime hooked");
    } catch (eHookInit) {
      console.error("[Plonky] diag: C3_InitRuntime hook failed", eHookInit && (eHookInit.message || eHookInit));
    }
  })();
  trace("boot main");
  require("./scripts/main.js");
  // Disable Construct Mobile Advert / web ads in WeChat (no adsbygoogle).
  (function stubAdvert() {
    var utils = self.C3AdUtils;
    function ok(cb, msg) {
      try {
        if (utils && typeof utils.Success === "function") return utils.Success(cb, msg || "ok");
      } catch (e) {}
      try { if (typeof cb === "function") cb(null, msg || "ok"); } catch (e2) {}
    }
    function wrap(name, msg) {
      return function () {
        var args = arguments;
        var cb = args[args.length - 1];
        ok(cb, msg || name);
      };
    }
    self.C3MobileAdvertsAPI = self.C3MobileAdvertsAPI || {};
    var web = self.C3MobileAdvertsAPI.web = self.C3MobileAdvertsAPI.web || {};
    web.webAdsScriptLoaded = true;
    web.__plonkyAdsStub = true;
    // --- held rewarded advert -------------------------------------------------------------
    // The project asks for a rewarded video when the player dies; completing it instantly makes the
    // player revive immediately (that is why death looked like an auto-revive). While a level is
    // running, hold the request so the game's own revive prompt stays on screen, then release it
    // (GameGlobal.__plonkyReleaseAd()) or fail it (GameGlobal.__plonkyCancelAd()).
    var heldAd = null;
    function fail(cb, msg) {
      try {
        if (utils && typeof utils.Failure === "function") return utils.Failure(cb, msg || "cancelled");
      } catch (eF) {}
      try { if (typeof cb === "function") cb(msg || "cancelled"); } catch (eF2) {}
    }
    var adNotes = 0;
    function note(name, extra) {}
    function levelActive() {
      try {
        var r = GameGlobal.__plonkyRuntime;
        if (!r && typeof getLocalRuntime === "function") r = getLocalRuntime(window.c3_runtimeInterface);
        if (!r) return false;
        var lm = r.GetLayoutManager && r.GetLayoutManager();
        var lay = lm && lm.GetMainRunningLayout && lm.GetMainRunningLayout();
        var nm = lay && lay.GetName ? String(lay.GetName()) : "";
        return !!nm && nm !== "menu_layout" && nm !== "loader_layout";
      } catch (eL) { return false; }
    }
    function settleAd(reward) {
      if (!heldAd) return false;
      var h = heldAd;
      heldAd = null;
      try { if (h.timer) clearTimeout(h.timer); } catch (eT) {}
      try {
        if (reward) ok(h.cb, JSON.stringify(["Reward", 1]));
        else fail(h.cb, "rewarded advert unavailable");
        console.warn("[Plonky] ad: " + (reward ? "released (revive)" : "cancelled (no reward)"));
      } catch (eS) {}
      return true;
    }
    GameGlobal.__plonkyReleaseAd = function () { return settleAd(true); };
    GameGlobal.__plonkyCancelAd = function () { return settleAd(false); };
    GameGlobal.__plonkyHeldAd = function () { return !!heldAd; };
    [
      "Configure", "RequestConsent", "StatusUpdate", "RequestIDFA",
      "CreateBannerAdvert", "ShowBannerAdvert", "HideBannerAdvert",
      "CreateInterstitialAdvert", "ShowInterstitialAdvert",
      "CreateVideoAdvert", "ShowVideoAdvert",
      "CreateRewardedAdvert", "ShowRewardedAdvert",
      "CreateRewardedInterstitialAdvert", "ShowRewardedInterstitialAdvert",
      "SetMaxAdContentRating", "TagForChildDirectedTreatment", "TagForUnderAgeOfConsent"
    ].forEach(function (n) {
      // On death the project only *creates* a rewarded advert and then revives when the plugin
      // reports it created - so the create call is the one that has to be held.
      var isCreateRewarded = n === "CreateRewardedAdvert" || n === "CreateRewardedInterstitialAdvert"
        || n === "CreateVideoAdvert";
      var isShowRewarded = n === "ShowRewardedAdvert" || n === "ShowRewardedInterstitialAdvert"
        || n === "ShowVideoAdvert";
      var isCreateInter = n === "CreateInterstitialAdvert";
      var isShowInter = n === "ShowInterstitialAdvert";
      if (isCreateRewarded || isShowRewarded) {
        web[n] = function () {
          var args = arguments;
          var cb = args[args.length - 1];
          note(n, "level=" + levelActive() + " cb=" + typeof cb);
          var isDeath = false;
          try { if (GameGlobal.__plonkyDeathRequest) isDeath = GameGlobal.__plonkyDeathRequest(); } catch (eDR) {}
          var passUntil = 0;
          try { passUntil = GameGlobal.__plonkyPassAdsUntil || 0; } catch (ePU) {}
          if (passUntil && Date.now() < passUntil && isCreateRewarded) {
            return ok(cb, n + " created");
          }
          if (GameGlobal.__plonkyHoldAds !== false && isCreateRewarded && levelActive() && isDeath && !GameGlobal.__plonkyInUkazRewarded) {
            settleAd(false) || 0;
            heldAd = { cb: cb, name: n, timer: null };
            try {
              heldAd.timer = setTimeout(function () {
                settleAd(false);
              }, 60000);
            } catch (eTimer) {}
            try { GameGlobal.__plonkyDeathPending = true; } catch (ePend) {}
            try { if (GameGlobal.__plonkyHideCoverLayer) GameGlobal.__plonkyHideCoverLayer(); } catch (eLay) {}
            try { if (GameGlobal.__plonkyArmDeathDialog) GameGlobal.__plonkyArmDeathDialog(); } catch (eArm) {}
            return;
          }
          if (isCreateRewarded) {
            return ok(cb, n + " created");
          }
          if (GameGlobal.__plonkyRewardGrantOnly) {
            return ok(cb, JSON.stringify(["Reward", 1]));
          }
          try {
            if (typeof GameGlobal.__plonkyPlayReward === "function") {
              GameGlobal.__plonkyPlayReward(function (ended) {
                if (ended) ok(cb, JSON.stringify(["Reward", 1]));
                else fail(cb, "rewarded skipped");
              });
              return;
            }
          } catch (eSdkAd) {}
          return ok(cb, JSON.stringify(["Reward", 1]));
        };
        return;
      }
      if (isCreateInter || isShowInter) {
        web[n] = function () {
          var cb = arguments[arguments.length - 1];
          note(n);
          if (isShowInter) {
            try { if (GameGlobal.__plonkyPlayInter) GameGlobal.__plonkyPlayInter(); } catch (eIn) {}
          }
          return ok(cb, n + " ok");
        };
        return;
      }
      web[n] = (function (nm, msg) {
        return function () {
          note(nm);
          return ok(arguments[arguments.length - 1], msg);
        };
      })(n, (n === "Configure" || n === "RequestConsent" || n === "StatusUpdate")
        ? "UNKNOWN&&not-determined&&true"
        : n + " stub");
    });
    self.adBreak = function (opts) {
      try {
        var typ = String((opts && opts.type) || "");
        if (typ === "reward" || typ === "rewarded") {
          if (typeof GameGlobal.__plonkyPlayReward === "function") {
            try { if (opts && typeof opts.beforeAd === "function") opts.beforeAd(); } catch (eB) {}
            GameGlobal.__plonkyPlayReward(function (ended) {
              try {
                if (ended && opts && typeof opts.adViewed === "function") opts.adViewed();
                else if (opts && typeof opts.adDismissed === "function") opts.adDismissed();
              } catch (eV) {}
              try {
                if (opts && typeof opts.adBreakDone === "function") {
                  opts.adBreakDone({ breakStatus: ended ? "viewed" : "dismissed" });
                }
              } catch (eD) {}
              try { if (opts && typeof opts.afterAd === "function") opts.afterAd(); } catch (eA) {}
            });
            return;
          }
        }
        if (opts && typeof opts.adBreakDone === "function") opts.adBreakDone({ breakStatus: "dismissed" });
        if (opts && typeof opts.afterAd === "function") opts.afterAd();
        if (opts && typeof opts.adViewed === "function") opts.adViewed();
      } catch (e2) {}
    };
    self.adConfig = function () {};
    dlog(1,"[Plonky] advert stubs active");
  })();
  trace("C3_CreateRuntime=" + typeof self.C3_CreateRuntime);
  trace("runtimeInterface=" + typeof window.c3_runtimeInterface);
  trace("boot ready");
  var started = false;
  function fireDeviceReady() {
    var EventCtor = typeof Event === "function" ? Event : function (type) { this.type = type; };
    var ev = new EventCtor("deviceready");
    var targets = [
      GameGlobal.__document,
      GameGlobal.document,
      typeof document !== "undefined" ? document : null,
      GameGlobal
    ];
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!t) continue;
      try {
        if (typeof t.dispatchEvent === "function") t.dispatchEvent(ev);
      } catch (e) {}
      try {
        if (typeof t.addEventListener === "function" && t.onready) t.onready(ev);
      } catch (e2) {}
    }
  }
  function getLocalRuntime(ri) {
    try {
      return ri._localRuntime
        || (typeof ri._GetLocalRuntime === "function" && ri._GetLocalRuntime())
        || null;
    } catch (e) {
      return null;
    }
  }

  // The grey screen happens when Construct tears down the loader layout and then
  // never finishes loading the next one: _StopRunning() clears the main running
  // layout, then Layout._Load() (layout textures) either rejects or never settles.
  // These hooks report exactly which asset/layout is responsible.
  // Each hook family is guarded separately: at C3_InitRuntime time the runtime
  // exists but its layouts do not, so the layout hooks are re-attempted by a short
  // poll until GetAllLayouts() is populated.
  function installSwitchDiagnostics(target) {
    var C3 = null;
    try { C3 = self.C3; } catch (eC3) {}
    var rt = null;
    try {
      rt = target && target.GetLayoutManager ? target : getLocalRuntime(target);
    } catch (eRt) {}
    if (!C3 || !rt) return;
    GameGlobal.__plonkyTextureFailures = GameGlobal.__plonkyTextureFailures || [];

    if (!GameGlobal.__plonkyDiagInfo) {
      try {
        dlog(1,"[Plonky] diag: runtime present");
        try { if (GameGlobal.__plonkySplashMark) GameGlobal.__plonkySplashMark("c3-init"); } catch (eMarkC3) {}
        GameGlobal.__plonkyDiagInfo = true;
      } catch (eInfo) {}
    }

    // Construct does NOT clear with gl.clear: ClearRgba() draws a full-screen quad instead
    // (ClearRgba -> PushBatch().InitClearSurface2). Its loading screen therefore clears the surface
    // to transparent, which a mini game composites as BLACK - that is the "dark green -> black"
    // phase the owner reported. While the game has not started, substitute the splash colour so the
    // whole boot shows the game colour. Restores itself as soon as __plonkyGameReady is set.
    if (!GameGlobal.__plonkyClearRgbaHooked && C3 && C3.Gfx) {
      try {
        var gfxNames = Object.keys(C3.Gfx);
        for (var gi = 0; gi < gfxNames.length; gi++) {
          var gcls = null;
          try { gcls = C3.Gfx[gfxNames[gi]]; } catch (eGcls) { continue; }
          if (!gcls || !gcls.prototype || typeof gcls.prototype.ClearRgba !== "function") continue;
          var proto = gcls.prototype;
          var origClearRgba = proto.ClearRgba;
          proto.ClearRgba = function (r, g2, b, a) {
            try {
              if (GameGlobal.__plonkySplash !== false && !GameGlobal.__plonkyGameReady) {
                return origClearRgba.call(this, 0.0627, 0.1294, 0.1451, 1);
              }
            } catch (eCr) {}
            return origClearRgba.apply(this, arguments);
          };
          GameGlobal.__plonkyClearRgbaHooked = true;
          dwarn(0, "[Plonky] splash: clear override installed on " + gfxNames[gi] + ".ClearRgba");
          break;
        }
        if (!GameGlobal.__plonkyClearRgbaHooked) {
          GameGlobal.__plonkyClearRgbaHooked = true;
          dwarn(0, "[Plonky] splash: no ClearRgba found on C3.Gfx (loading screen left as-is)");
        }
      } catch (eClearPath) {
        console.error("[Plonky] diag: splash clear override failed", eClearPath && (eClearPath.message || eClearPath));
      }
    }

    // Font text reader v2. Construct's SpriteFont keeps its string in the instance's own _text
    // property (see _UpdateSettings in the runtime), so runtime-written labels can be observed by
    // reading instances instead of intercepting SetText (the plugin classes are not reachable).
    if (diagLevel() >= 2 && !GameGlobal.__plonkyFontReader) {
      GameGlobal.__plonkyFontReader = true;
      (function fontReader() {
        var seen = {};
        var ticks = 0;
        function rt() {
          try { if (GameGlobal.__plonkyRuntime) return GameGlobal.__plonkyRuntime; } catch (e0) {}
          try { if (typeof getLocalRuntime === "function") return getLocalRuntime(window.c3_runtimeInterface); } catch (e1) {}
          try { if (self.c3_runtimeInterface && typeof self.c3_runtimeInterface._localRuntime !== "undefined") return self.c3_runtimeInterface._localRuntime; } catch (e2) {}
          return null;
        }
        function classList(r) {
          var list = [];
          try { if (typeof r.GetAllObjectClasses === "function") list = r.GetAllObjectClasses() || []; } catch (eAll) {}
          if (!list.length) {
            ["font1", "font2", "textik"].forEach(function (n) {
              try { var oc = r.GetObjectClassByName(n); if (oc) list.push(oc); } catch (eN) {}
            });
          }
          return list;
        }
        var lastInsts = 0;
        var insts2 = 0;
        var keysDumped = {};
        function scan() {
          var r = rt();
          if (!r) return 0;
          var classes = classList(r);
          var found = 0;
          var totalInsts = 0;
          lastInsts = 0;
          for (var c = 0; c < classes.length; c++) {
            var oc = classes[c];
            var nm = "?"; try { nm = oc.GetName ? oc.GetName() : nm; } catch (eNm) {}
            var insts = [];
            try { if (typeof oc._GetInstances === "function") insts = oc._GetInstances() || []; } catch (eI1) {}
            if (!insts.length) { try { if (typeof oc.GetInstances === "function") insts = oc.GetInstances() || []; } catch (eI2) {} }
            if (!insts.length) { try { if (typeof oc.getAllInstances === "function") insts = oc.getAllInstances() || []; } catch (eI3) {} }
            totalInsts += insts.length;
            for (var i = 0; i < insts.length; i++) {
              var inst = insts[i];
              // once per class: dump the instance's own property names so the text field is identifiable
              if (!keysDumped[nm]) {
                keysDumped[nm] = 1;
                try {
                  var own = Object.keys(inst);
                  dwarn(2, "[Plonky] font inst keys " + nm + " iid=" + (inst.GetInstanceID ? inst.GetInstanceID() : "?") + ": " + own.join(",").slice(0, 400));
                } catch (eOwn) {}
              }
              // any non-empty string property (bounded, deduped) - this is how the field is found
              try {
                var own2 = Object.keys(inst);
                for (var q = 0; q < own2.length; q++) {
                  var v2 = inst[own2[q]];
                  if (typeof v2 !== "string" || !v2 || v2.length > 64) continue;
                  var k2 = nm + "." + own2[q] + "=" + v2;
                  if (seen[k2]) continue;
                  seen[k2] = 1;
                  dwarn(2, "[Plonky] font prop " + nm + " iid=" + (inst.GetInstanceID ? inst.GetInstanceID() : "?") + " " + own2[q] + "=" + JSON.stringify(v2));
                }
              } catch (eProps) {}
              var txt = null;
              try { txt = inst._text; } catch (eT) {}
              if (typeof txt !== "string" || !txt) {
                try { var w = inst._spriteFontText; if (w && typeof w._text === "string") txt = w._text; } catch (eW2) {}
              }
              if (typeof txt !== "string" || !txt) {
                try { var gt = inst.GetText; if (typeof gt === "function") txt = gt.call(inst); } catch (eGt) {}
              }
              if (typeof txt !== "string" || !txt || txt.length > 64) continue;
              found++;
              var iid = "?"; try { iid = inst.GetInstanceID ? inst.GetInstanceID() : iid; } catch (eId) {}
              var pos = "?";
              try { var wi = inst.GetWorldInfo ? inst.GetWorldInfo() : null; if (wi) pos = Math.round(wi.GetX()) + "," + Math.round(wi.GetY()); } catch (eWi) {}
              var key = nm + "#" + iid + "=" + txt;
              if (seen[key]) continue;
              seen[key] = 1;
              dwarn(2, "[Plonky] font _text: " + nm + " iid=" + iid + " value=" + JSON.stringify(txt) + " pos=" + pos);
            }
          }
          insts2 = totalInsts;
          return classes.length;
        }
        var sched = (typeof setTimeout === "function") ? setTimeout : (typeof scheduleTimeout === "function" ? scheduleTimeout : null);
        if (!sched) { dwarn(2, "[Plonky] font reader: no timer available"); return; }
        sched(function first() {
          var r = rt();
          var n = 0;
          try { n = r ? classList(r).length : 0; } catch (eC) {}
          dwarn(2, "[Plonky] font reader start: runtime=" + (r ? "ok" : "MISSING") + " classes=" + n);
          function tick() {
            ticks++;
            var c = 0;
            try { c = scan(); } catch (eScan) {}
            if (ticks % 25 === 0) dwarn(2, "[Plonky] font reader alive: tick=" + ticks + " classes=" + c + " instances=" + insts2 + " seen=" + Object.keys(seen).length);
            if (ticks < 300) { try { sched(tick, 400); } catch (eNext) {} }
          }
          tick();
        }, 800);
      })();
    }

    // Keep the skin reward button visible independently of the legacy MobileAdvert ready flag.
    function animNameOf(inst) {
      try {
        var sdk = inst && (inst._sdkInst || (inst.GetSdkInstance && inst.GetSdkInstance()));
        if (sdk) {
          if (sdk._currentAnimation) {
            var current = sdk._currentAnimation;
            return String((current.GetName && current.GetName()) || current._name || current.name || "");
          }
          if (typeof sdk.GetAnimation === "function") {
            var animation = sdk.GetAnimation();
            if (animation) return String((animation.GetName && animation.GetName()) || animation._name || animation.name || "");
          }
        }
      } catch (eAnimation) {}
      return "";
    }
    function skinRewardInstances(runtime, className) {
      try {
        var objectClass = runtime && runtime.GetObjectClassByName && runtime.GetObjectClassByName(className);
        if (!objectClass) return [];
        var instances = [];
        try { if (typeof objectClass.GetInstances === "function") instances = objectClass.GetInstances() || []; } catch (eGet) {}
        if (!instances.length) { try { if (typeof objectClass._GetInstances === "function") instances = objectClass._GetInstances() || []; } catch (eGetPrivate) {} }
        return instances;
      } catch (eClass) { return []; }
    }
    function skinName(instance) {
    try {
      if (typeof instance.GetInstanceVariableValue === "function") return String(instance.GetInstanceVariableValue(12) || "");
    } catch (ePublic) {}
    try { return String((instance._instVarValues || [])[12] || ""); } catch (ePrivate) { return ""; }
  }
  function skinIsUnlocked(runtime, skinId) {
    if (!skinId) return false;
    if (skinId.toLowerCase() === "typek1") return true;
    try {
      var unlocks = getSkinUnlockArray(runtime, "pole_typci");
      if (!unlocks) return false;
      for (var i = 0, width = skinArrayWidth(unlocks); i < width; i++) {
        if (String(skinArrayGet(unlocks, i)).toLowerCase() === skinId.toLowerCase()) return true;
      }
    } catch (eUnlock) {}
    return false;
  }
    function skinRewardButtonName(instance) {
      try {
        if (typeof instance.GetInstanceVariableValue === "function") return String(instance.GetInstanceVariableValue(12) || "");
      } catch (ePublic) {}
      try { return String((instance._instVarValues || [])[12] || ""); } catch (ePrivate) { return ""; }
    }
    function showSkinRewardInstance(instance) {
      try { if (instance && typeof instance.SetVisible === "function") instance.SetVisible(true); } catch (eInst) {}
      try {
        var worldInfo = instance && instance.GetWorldInfo && instance.GetWorldInfo();
        if (worldInfo && typeof worldInfo.SetVisible === "function") worldInfo.SetVisible(true);
        if (worldInfo && typeof worldInfo.SetOpacity === "function") worldInfo.SetOpacity(1);
        if (worldInfo) { worldInfo.isVisible = true; worldInfo.opacity = 1; }
      } catch (eWorld) {}
      // video_btn uses the shared button variables: active, active backup, and disabled.
      try {
        if (skinRewardButtonName(instance) === "video_btn" && instance._instVarValues) {
          instance._instVarValues[3] = 1;
          instance._instVarValues[4] = 1;
          instance._instVarValues[5] = 0;
        }
      } catch (eButton) {}
    }
    function skinRewardPosition(instance) {
      try {
        var worldInfo = instance && instance.GetWorldInfo && instance.GetWorldInfo();
        if (!worldInfo) return null;
        return { x: worldInfo.GetX(), y: worldInfo.GetY() };
      } catch (ePosition) { return null; }
    }
    function skinUiSnapshot(runtime) {
      function describe(className, includeName) {
        return skinRewardInstances(runtime, className).map(function (instance) {
          var p = skinRewardPosition(instance);
          var name = includeName ? skinRewardButtonName(instance) : animNameOf(instance).toLowerCase();
          return name + "@" + (p ? Math.round(p.x) + "," + Math.round(p.y) : "?");
        });
      }
      return {
        menu: !!GameGlobal.__plonkySkinMenuOpen,
        videoButtons: describe("obdlznik_btn", true).filter(function (v) { return v.indexOf("video_btn@") === 0; }),
        labels: describe("tlacko_ibaobr", false),
        plates: describe("tlacko", false),
        portraits: skinRewardInstances(runtime, "typek_obr").length,
        lockButtons: skinRewardInstances(runtime, "nevidko_btn").length,
        pending: currentSkinRewardId(runtime)
      };
    }
    GameGlobal.__plonkySkinUiSnapshot = function () { return skinUiSnapshot(rt); };
    function ensureSkinRewardButton(runtime, video) {
      try {
        if (!runtime || !video) return null;
        if (video.__plonkySkinButtonClone) {
          var existing = video.__plonkySkinButtonClone;
          var existingWi = existing.GetWorldInfo && existing.GetWorldInfo();
          var currentVideoWi = video.GetWorldInfo && video.GetWorldInfo();
          if (existingWi && currentVideoWi) {
            if (typeof existingWi.SetXY === "function") existingWi.SetXY(currentVideoWi.GetX(), currentVideoWi.GetY());
            if (typeof existingWi.SetSize === "function") existingWi.SetSize(currentVideoWi.GetWidth(), currentVideoWi.GetHeight());
          }
          return existing;
        }
        var objectClass = runtime.GetObjectClassByName && runtime.GetObjectClassByName("obdlznik_btn");
        var videoWi = video.GetWorldInfo && video.GetWorldInfo();
        var layer = videoWi && videoWi.GetLayer && videoWi.GetLayer();
        if (!objectClass || !videoWi || !layer || typeof runtime.CreateInstance !== "function") return null;
        var clone = runtime.CreateInstance(objectClass, layer, videoWi.GetX(), videoWi.GetY());
        if (!clone) return null;
        video.__plonkySkinButtonClone = clone;
        clone.__plonkySkinButtonClone = true;
        try {
          if (clone._instVarValues) {
            clone._instVarValues[3] = 1;
            clone._instVarValues[4] = 1;
            clone._instVarValues[5] = 0;
            clone._instVarValues[12] = "video_btn";
          }
        } catch (eVars) {}
        try {
          var cloneWi = clone.GetWorldInfo && clone.GetWorldInfo();
          if (cloneWi && typeof cloneWi.SetXY === "function") cloneWi.SetXY(videoWi.GetX(), videoWi.GetY());
          if (cloneWi && typeof cloneWi.SetSize === "function") cloneWi.SetSize(videoWi.GetWidth(), videoWi.GetHeight());
          if (cloneWi && typeof cloneWi.SetVisible === "function") cloneWi.SetVisible(true);
        } catch (eWorld) {}
        try { if (layer && typeof layer.SortAndAddInstancesByZIndex === "function") layer.SortAndAddInstancesByZIndex(clone); } catch (eZ) {}
        console.warn("[Plonky] skin-video-button created");
        return clone;
      } catch (eCreate) { return null; }
    }
    function showSkinRewardButtons(runtime) {
      if (GameGlobal.__plonkyForceSkinRewardButton === false) return 0;
      var skinMenuOpen = !!GameGlobal.__plonkySkinMenuOpen;
      if (!skinMenuOpen) {
        skinRewardInstances(runtime, "skiny").forEach(function (instance) {
          try {
            var worldInfo = instance.GetWorldInfo && instance.GetWorldInfo();
            if (worldInfo && (!worldInfo.IsVisible || worldInfo.IsVisible())) skinMenuOpen = true;
          } catch (eSkinMenu) {}
        });
      }
      if (!skinMenuOpen) {
        ["video", "typek_obr"].forEach(function (className) {
          skinRewardInstances(runtime, className).forEach(function (instance) {
            try {
              var worldInfo = instance.GetWorldInfo && instance.GetWorldInfo();
              if (worldInfo && (!worldInfo.IsVisible || worldInfo.IsVisible())) skinMenuOpen = true;
            } catch (eSkinChild) {}
          });
        });
      }
      if (!skinMenuOpen) return 0;
      skinRewardInstances(runtime, "nevidko_btn").forEach(hideSkinLockMask);
      skinRewardInstances(runtime, "tlacko").forEach(function (instance) {
        if (animNameOf(instance).toLowerCase() === "nevid") hideSkinLockMask(instance);
      });
      skinRewardInstances(runtime, "typek_obr").forEach(showSkinRewardInstance);
      // Every locked skin has a matching video icon. Keep those icons visible and clickable,
      // even though the original event sheet only exposes the shared button for one entry.
      var skinVideos = skinRewardInstances(runtime, "video");
      var skinEntries = skinRewardInstances(runtime, "tlacko").filter(function (instance) {
        return /^typek\d+$/i.test(skinName(instance));
      });
      skinVideos.forEach(function (video) {
        var vp = skinRewardPosition(video), best = "", bestDist = Infinity;
        for (var i = 0; i < skinEntries.length; i++) {
          var sp = skinRewardPosition(skinEntries[i]);
          if (!vp || !sp) continue;
          var dx = sp.x - vp.x, dy = sp.y - vp.y, dist = dx * dx + dy * dy;
          if (Math.abs(dx) <= 90 && dy > -30 && dy <= 180 && dist < bestDist) {
            bestDist = dist;
            best = skinName(skinEntries[i]);
          }
        }
        if (best && !skinIsUnlocked(runtime, best)) {
          showSkinRewardInstance(video);
          var buttonClone = ensureSkinRewardButton(runtime, video);
          if (buttonClone) showSkinRewardInstance(buttonClone);
        }
        else {
          try {
            var oldButton = video.__plonkySkinButtonClone;
            if (oldButton && typeof oldButton.SetVisible === "function") oldButton.SetVisible(false);
            var oldButtonWi = oldButton && oldButton.GetWorldInfo && oldButton.GetWorldInfo();
            if (oldButtonWi && typeof oldButtonWi.SetVisible === "function") oldButtonWi.SetVisible(false);
          } catch (eHideButton) {}
          try { if (typeof video.SetVisible === "function") video.SetVisible(false); } catch (eHideVideo) {}
          try { var vwi = video.GetWorldInfo && video.GetWorldInfo(); if (vwi && typeof vwi.SetVisible === "function") vwi.SetVisible(false); } catch (eHideVideoWorld) {}
        }
      });
      var buttons = skinRewardInstances(runtime, "obdlznik_btn").filter(function (instance) {
        return skinRewardButtonName(instance) === "video_btn";
      });
      var snapshot = skinUiSnapshot(runtime);
      var snapshotText = JSON.stringify(snapshot);
      if (GameGlobal.__plonkySkinUiLastLog !== snapshotText) {
        GameGlobal.__plonkySkinUiLastLog = snapshotText;
        console.warn("[Plonky] skin-ui " + snapshotText);
      }      if (!buttons.length) return 0;

      var anchors = buttons.map(skinRewardPosition).filter(Boolean);
      buttons.forEach(showSkinRewardInstance);
      ["video", "font1", "tlacko_ibaobr"].forEach(function (className) {
        skinRewardInstances(runtime, className).forEach(function (instance) {
          if (className === "tlacko_ibaobr" && animNameOf(instance).toLowerCase() !== "ad_zh_watch") return;
          var position = skinRewardPosition(instance);
          if (!position) return;
          for (var i = 0; i < anchors.length; i++) {
            var dx = position.x - anchors[i].x, dy = position.y - anchors[i].y;
            if (dx * dx + dy * dy <= 160000) { showSkinRewardInstance(instance); break; }
          }
        });
      });
      return buttons.length;
    }
    GameGlobal.__plonkyShowSkinRewardButtons = function () { return showSkinRewardButtons(rt); };
    if (!GameGlobal.__plonkySkinButtonWatchdog) {
      GameGlobal.__plonkySkinButtonWatchdog = true;
      var skinButtonTick = function () {
        try { showSkinRewardButtons(rt); } catch (eSkinButtons) {
          if (!GameGlobal.__plonkySkinButtonWatchdogError) {
            GameGlobal.__plonkySkinButtonWatchdogError = true;
            console.warn("[Plonky] skin-button watchdog failed: " + (eSkinButtons && eSkinButtons.message));
          }
        }
        try { setTimeout(skinButtonTick, 350); } catch (eNextSkinButtons) {}
      };
      skinButtonTick();
    }
    function hideSkinLockMask(instance) {
      if (!instance) return;
      // C3 reapplies the lock mask from its event sheet; intercept later attempts to show it.
      try {
        if (!instance.__plonkySkinMaskLocked && typeof instance.SetVisible === "function") {
          instance.__plonkySkinMaskLocked = true;
          instance.__plonkySkinMaskSetVisible = instance.SetVisible;
          instance.SetVisible = function () { return this.__plonkySkinMaskSetVisible.call(this, false); };
        }
      } catch (eInstWrap) {}
      try { if (typeof instance.SetVisible === "function") instance.SetVisible(false); } catch (eInst) {}
      try {
        var worldInfo = instance.GetWorldInfo && instance.GetWorldInfo();
        if (worldInfo && !worldInfo.__plonkySkinMaskLocked && typeof worldInfo.SetVisible === "function") {
          worldInfo.__plonkySkinMaskLocked = true;
          worldInfo.__plonkySkinMaskSetVisible = worldInfo.SetVisible;
          worldInfo.SetVisible = function () { return this.__plonkySkinMaskSetVisible.call(this, false); };
        }
        if (worldInfo && typeof worldInfo.SetVisible === "function") worldInfo.SetVisible(false);
        if (worldInfo) worldInfo.isVisible = false;
      } catch (eWorld) {}
    }
    function getSkinUnlockArray(runtime, objectName) {
      var instance = skinRewardInstances(runtime, objectName)[0];
      if (!instance) return null;
      var candidates = [instance];
      try { if (typeof instance.GetSdkInstance === "function") candidates.push(instance.GetSdkInstance()); } catch (eSdk) {}
      try { if (instance._sdkInst) candidates.push(instance._sdkInst); } catch (ePrivate) {}
      for (var i = 0; i < candidates.length; i++) {
        var candidate = candidates[i];
        if (!candidate) continue;
        if ((typeof candidate.getAt === "function" || typeof candidate.At === "function") && (typeof candidate.setAt === "function" || typeof candidate.Set === "function")) return candidate;
      }
      return null;
    }
    function skinArrayWidth(array) {
      try { if (typeof array.width === "number") return array.width; } catch (eWidth) {}
      try { if (typeof array._width === "number") return array._width; } catch (ePrivateWidth) {}
      try { if (typeof array.GetWidth === "function") return array.GetWidth(); } catch (eGetWidth) {}
      try { if (typeof array.GetSize === "function") return array.GetSize(); } catch (eGetSize) {}
      return 0;
    }
    function skinArrayGet(array, index) {
      try { if (typeof array.getAt === "function") return array.getAt(index, 0, 0); } catch (eGetAt) {}
      try { if (typeof array.At === "function") return array.At(index, 0, 0); } catch (eAt) {}
      try { if (typeof array.GetAt === "function") return array.GetAt(index, 0, 0); } catch (eGetAtPublic) {}
      return undefined;
    }
    function skinArraySet(array, index, value) {
      try { if (typeof array.setAt === "function") { array.setAt(value, index, 0, 0); return true; } } catch (eSetAt) {}
      try { if (typeof array.Set === "function") { array.Set(index, 0, 0, value); return true; } } catch (eSet) {}
      try { if (typeof array.SetAt === "function") { array.SetAt(index, 0, 0, value); return true; } } catch (eSetAtPublic) {}
      return false;
    }
    function skinArrayPush(array, value) {
      var width = skinArrayWidth(array);
      try { if (typeof array.setSize === "function" && typeof array.setAt === "function") { array.setSize(width + 1, 1, 1); array.setAt(value, width, 0, 0); return true; } } catch (ePublic) {}
      try { if (typeof array.Push === "function") { array.Push(0, value, 0); return true; } } catch (ePush) {}
      try { if (typeof array.Push === "function") { array.Push(value); return true; } } catch (ePushSimple) {}
      try { if (typeof array.SetSize === "function" && typeof array.Set === "function") { array.SetSize(width + 1, 1, 1); array.Set(width, 0, 0, value); return true; } } catch (eInternal) {}
      return false;
    }
    function currentSkinRewardId(runtime) {
      var globals = getSkinUnlockArray(runtime, "glo");
      var value = globals ? skinArrayGet(globals, 25) : null;
      var match = String(value == null ? "" : value).match(/(?:typek)?(\d+)/i);
      return match ? "typek" + match[1] : "";
    }
    function grantSkinReward(runtime, skinId) {
      if (!skinId) return false;
      var unlocks = getSkinUnlockArray(runtime, "pole_typci");
      if (!unlocks) { console.warn("[Plonky] skin-grant array missing skin=" + skinId); return false; }
      var width = skinArrayWidth(unlocks);
      for (var i = 0; i < width; i++) if (String(skinArrayGet(unlocks, i)).toLowerCase() === String(skinId).toLowerCase()) return true;
      console.warn("[Plonky] skin-grant push skin=" + skinId + " width=" + width);
      if (!skinArrayPush(unlocks, skinId)) { console.warn("[Plonky] skin-grant push failed skin=" + skinId); return false; }
      var afterWidth = skinArrayWidth(unlocks), stored = false;
      for (var j = 0; j < afterWidth; j++) if (String(skinArrayGet(unlocks, j)).toLowerCase() === String(skinId).toLowerCase()) { stored = true; break; }
      console.warn("[Plonky] skin-grant stored=" + stored + " width=" + afterWidth);
      if (!stored) return false;
      try { if (runtime && typeof runtime.callFunction === "function") runtime.callFunction("uloz_storage"); } catch (eSave) {}
      try { if (runtime && typeof runtime.callFunction === "function") runtime.callFunction("nastav_skiny"); } catch (eRefresh) {}
      return true;
    }
    GameGlobal.__plonkyCurrentSkinReward = function () { return currentSkinRewardId(rt); };
    GameGlobal.__plonkyGrantSkinReward = function (skinId) { return grantSkinReward(rt, skinId || currentSkinRewardId(rt)); };
    GameGlobal.__plonkySkinRewardDebug = function () {
      var runtime = rt();
      var masks = skinRewardInstances(runtime, "nevidko_btn");
      var buttons = skinRewardInstances(runtime, "obdlznik_btn").filter(function (instance) {
        return skinRewardButtonName(instance) === "video_btn";
      });

      return {
        skinMenu: !!GameGlobal.__plonkySkinMenuOpen,
        pendingSkin: currentSkinRewardId(runtime),
        rewardButtons: buttons.length,
        lockMasks: masks.length,
        unlockArrayFound: !!getSkinUnlockArray(runtime, "pole_typci")
      };
    };
    // Keep the "no ads" button hidden even if the project's events show it again, and catch
    // instances that a container creates when the pause menu opens.
    if (!GameGlobal.__plonkyNoAdsWatchdog) {
      GameGlobal.__plonkyNoAdsWatchdog = true;
      try {
        var noAdsTick = function () {
          try { hideNoAdsButton(rt); hideOriginalReviveButton(rt); hidePrivacyButton(rt); if (GameGlobal.__plonkyHideAdToastNow) GameGlobal.__plonkyHideAdToastNow(rt); } catch (eTick) {}
          try { showSkinRewardButtons(rt); } catch (eSkinReward) {}
          try { if (GameGlobal.__plonkyApplyGloAudio) GameGlobal.__plonkyApplyGloAudio(); } catch (eAud) {}
          try { setTimeout(noAdsTick, 1000); } catch (eNext) {}
        };
        noAdsTick();
        dlog(1, "[Plonky] diag: no-ads watchdog installed");
      } catch (eWatch) {}
    }

    if (!GameGlobal.__plonkyTextureDiag) {
      try {
        var IA = C3.ImageAsset;
        if (IA && IA.prototype) {
          var origLoadStaticTexture = IA.prototype.LoadStaticTexture;
          IA.prototype.LoadStaticTexture = function () {
            var p = origLoadStaticTexture.apply(this, arguments);
            var url = "(?)";
            try { url = this.GetURL ? this.GetURL() : "(?)"; } catch (eU) {}
            try {
              if (p && typeof p.then === "function") {
                p.then(function () {
                  GameGlobal.__plonkyTextureOk = (GameGlobal.__plonkyTextureOk || 0) + 1;
                  if (GameGlobal.__plonkyTextureOk <= 40) dlog(2,"[Plonky] texture ok", url);
                }, function (err) {
                  GameGlobal.__plonkyTextureFailures.push(url);
                  console.error("[Plonky] TEXTURE LOAD FAILED", url, err && (err.stack || err.message || err));
                });
              }
            } catch (eT) {}
            return p;
          };
          GameGlobal.__plonkyTextureDiag = true;
          dlog(1,"[Plonky] diag: texture hooks installed");
        }
      } catch (eIA) {
        console.error("[Plonky] diag: texture hooks failed", eIA && (eIA.message || eIA));
      }
    }

    if (!GameGlobal.__plonkyLayoutDiag) {
      try {
        var allLayouts = rt.GetLayoutManager().GetAllLayouts();
        var layoutProto = allLayouts && allLayouts.length ? Object.getPrototypeOf(allLayouts[0]) : null;
        if (layoutProto) {
          ["_Load", "_StartRunning"].forEach(function (method) {
            var orig = layoutProto[method];
            if (typeof orig !== "function") return;
            layoutProto[method] = function () {
              var name = "(?)";
              try { name = this.GetName ? this.GetName() : "(?)"; } catch (eN) {}
              dlog(2,"[Plonky] layout." + method, name, "begin");
              var r;
              try {
                r = orig.apply(this, arguments);
              } catch (thrown) {
                console.error("[Plonky] layout." + method, name, "THREW", thrown && (thrown.stack || thrown.message || thrown));
                throw thrown;
              }
              if (r && typeof r.then === "function") {
                return r.then(function (v) {
                  dlog(2,"[Plonky] layout." + method, name, "done");
                  return v;
                }, function (err) {
                  console.error("[Plonky] layout." + method, name, "FAILED", err && (err.stack || err.message || err));
                  throw err;
                });
              }
              dlog(2,"[Plonky] layout." + method, name, "sync");
              return r;
            };
          });
          GameGlobal.__plonkyLayoutDiag = true;
          dlog(1,"[Plonky] diag: layout hooks installed (" + allLayouts.length + " layouts)");
        }
      } catch (eL) {
        console.error("[Plonky] diag: layout hooks failed", eL && (eL.message || eL));
      }
    }

    // Scene/state hook. Every state change in this project goes through a Construct
    // *function* call (the "-2" pseudo-object in data.json), and the runtime dispatches
    // them through Runtime#callFunction, so wrapping it gives one place to observe the
    // game's states:
    //   failed_prid       player died          well_done_prid   level completed
    //   restart_level     retry                goto_next_level  next level
    //   goto_main_menu    back to menu         options_menu_prid/odid  pause open/close
    // Set GameGlobal.__plonkyOnState = function (fn, state, args) { ... } to receive them
    // (ads/analytics/vibration), or GameGlobal.__plonkyDiag = 2 / 1 to just log them.
    if (!GameGlobal.__plonkyStateHook) {
      try {
        var STATE_NAMES = {
          failed_prid: "player-died",
          well_done_prid: "level-complete",
          restart_level: "level-restart",
          goto_next_level: "next-level",
          goto_main_menu: "back-to-home",
          options_menu_prid: "pause-open",
          options_menu_odid: "pause-close",
          nacitaj_storage: "storage-load",
          uloz_storage: "storage-save"
        };
        if (typeof rt.callFunction === "function") {
          var origCallFunction = rt.callFunction.bind(rt);
          rt.callFunction = function (name) {
            if (String(name || '').toLowerCase() === 'ukaz_info_txt') {
              try { if (GameGlobal.__plonkyHideAdToastNow) GameGlobal.__plonkyHideAdToastNow(rt); } catch (eHt) {}
              return;
            }
            var args = Array.prototype.slice.call(arguments, 1);
            var state = STATE_NAMES[name] || null;
            if (state || GameGlobal.__plonkyDiag >= 2) {
              dlog(1, "[Plonky] state " + (state || "(fn)") + " fn=" + name
                + (args.length ? " args=" + JSON.stringify(args).slice(0, 120) : ""));
            }
            var cb = GameGlobal.__plonkyOnState;
            if (typeof cb === "function") {
              try { cb(name, state, args); } catch (eCb) {}
            }
            var callResult = origCallFunction.apply(null, arguments);
            try {
              if (GameGlobal.__plonkyOnProjectFunction) GameGlobal.__plonkyOnProjectFunction(name);
            } catch (eFn) {}
            try {
              if (/menu/i.test(String(name))) {
                hideNoAdsButton(rt); hideOriginalReviveButton(rt); hidePrivacyButton(rt);
                try { if (GameGlobal.__plonkyHideAdToastNow) GameGlobal.__plonkyHideAdToastNow(rt); } catch (eHt1) {}
              }
            } catch (eHide1) {}
            return callResult;
          };
          GameGlobal.__plonkyStateHook = true;
          dlog(1, "[Plonky] diag: state hook installed (callFunction)");
        } else {
          dlog(1, "[Plonky] diag: state hook skipped (no Runtime#callFunction)");
        }
      } catch (eState) {
        console.error("[Plonky] diag: state hook failed", eState && (eState.message || eState));
      }
    }

    if (!GameGlobal.__plonkyChangeLayoutDiag) {
      try {
        var runtimeProto = Object.getPrototypeOf(rt);
        if (runtimeProto && typeof runtimeProto._DoChangeLayout === "function") {
          var origDoChangeLayout = runtimeProto._DoChangeLayout;
          runtimeProto._DoChangeLayout = function (layout) {
            var name = "(?)";
            try { name = layout && layout.GetName ? layout.GetName() : "(?)"; } catch (eN2) {}
            dlog(1,"[Plonky] _DoChangeLayout begin", name);
            return origDoChangeLayout.apply(this, arguments).then(function (v) {
              dlog(1,"[Plonky] _DoChangeLayout done", name);
              // Scene entry: loader_layout -> menu_layout -> layoutNNN (the 64 levels).
              var scene = /^layout\d+$/.test(name) ? "level-start"
                : name === "menu_layout" ? "menu-open"
                : name === "loader_layout" ? "loading" : null;
              if (scene === "menu-open") {
                try { if (GameGlobal.__plonkyPlayInter) GameGlobal.__plonkyPlayInter(); } catch (eIn) {}
              }
              if (scene) {
                try { if (GameGlobal.__plonkyStamp) GameGlobal.__plonkyStamp("state:" + scene); } catch (eBss) {}
                var sceneCb = GameGlobal.__plonkyOnState;
                if (typeof sceneCb === "function") {
                  try { sceneCb(scene, scene, [name]); } catch (eSceneCb) {}
                }
                if (scene !== "loading") GameGlobal.__plonkyGameReady = true;
              }
              try { hideNoAdsButton(rt); hideOriginalReviveButton(rt); hidePrivacyButton(rt); } catch (eHide2) {}
              return v;
            }, function (err) {
              console.error("[Plonky] _DoChangeLayout FAILED", name, err && (err.stack || err.message || err));
              throw err;
            });
          };
          GameGlobal.__plonkyChangeLayoutDiag = true;
          dlog(1,"[Plonky] diag: change-layout hooks installed");
        }
      } catch (eDo) {
        console.error("[Plonky] diag: change-layout hooks failed", eDo && (eDo.message || eDo));
      }
    }

    // WebGL1 + TiledBackground is the remaining trap: C3.Plugins.TiledBg defaults to
    // wrapX/wrapY = "repeat", repeat on a non-power-of-two texture is an incomplete
    // (black) texture, and C3's fallback is to stretch the image into a power-of-two
    // *canvas* and upload that canvas. This device has no wx.createOffscreenCanvas and
    // its native canvas uploads never reach the GPU - the sky is exactly such a
    // texture (100x100 -> canvas 128x128 -> black) - while plain image uploads work.
    // Forcing NPOT tiles to clamp keeps the texture complete and lets C3 upload the
    // image directly; only the repetition is lost, which is invisible on smooth
    // background images.
    if (!GameGlobal.__plonkyTileClamp) {
      try {
        var Gfx = C3.Gfx;
        var infoProto = Gfx && Gfx.ImageInfo && Gfx.ImageInfo.prototype;
        if (infoProto && typeof infoProto.LoadStaticTexture === "function") {
          var origLoadStatic = infoProto.LoadStaticTexture;
          infoProto.LoadStaticTexture = function (renderer, opts) {
            try {
              if (opts && GameGlobal.__forceClampNpotTiles !== false && !isDevtools()) {
                var tiled = (opts.wrapX && opts.wrapX !== "clamp-to-edge") || (opts.wrapY && opts.wrapY !== "clamp-to-edge");
                if (tiled) {
                  var iw = this.GetWidth ? this.GetWidth() : 0;
                  var ih = this.GetHeight ? this.GetHeight() : 0;
                  var potSize = iw > 0 && ih > 0 && (iw & (iw - 1)) === 0 && (ih & (ih - 1)) === 0;
                  if (!potSize) {
                    var patched = {};
                    for (var k in opts) patched[k] = opts[k];
                    patched.wrapX = "clamp-to-edge";
                    patched.wrapY = "clamp-to-edge";
                    opts = patched;
                    if (!GameGlobal.__plonkyClampLog) {
                      GameGlobal.__plonkyClampLog = true;
                      dwarn(0,"[Plonky] NPOT tiled texture forced to clamp (" + iw + "x" + ih + ") to avoid the canvas->POT upload this platform cannot do");
                    }
                  }
                }
              }
            } catch (eClamp) {}
            return origLoadStatic.call(this, renderer, opts);
          };
          GameGlobal.__plonkyTileClamp = true;
          dlog(1,"[Plonky] diag: NPOT tiled-texture clamp hook installed");
        }
      } catch (eTile) {
        console.error("[Plonky] diag: tiled clamp hook failed", eTile && (eTile.message || eTile));
      }
    }
  }

  function failedAssetSummary() {
    var out = [];
    try {
      var a = GameGlobal.__adapterFailedAssets || [];
      var b = GameGlobal.__plonkyTextureFailures || [];
      for (var i = 0; i < a.length; i++) if (out.indexOf(a[i]) < 0) out.push(a[i]);
      for (var j = 0; j < b.length; j++) if (out.indexOf(b[j]) < 0) out.push(b[j]);
    } catch (e) {}
    return out;
  }

  function reportLayoutState(ri, delay) {
    try {
      var rt = getLocalRuntime(ri);
      if (!rt) {
        dlog(1,"[Plonky] layout-state", delay, "no runtime yet");
        return;
      }
      installSwitchDiagnostics(rt);
      var lm = rt.GetLayoutManager && rt.GetLayoutManager();
      var layout = lm && lm.GetMainRunningLayout && lm.GetMainRunningLayout();
      var name = layout && layout.GetName ? layout.GetName() : "(none)";
      var loading = rt.IsLoading ? rt.IsLoading() : "?";
      var pending = lm && lm.IsPendingChangeMainLayout ? !!lm.IsPendingChangeMainLayout() : "?";
      var failed = failedAssetSummary();
      // Canvas identity: a mini game presents whatever canvas the engine exposes as
      // GameGlobal.screencanvas/canvas, so if our WebGL surface is a different object
      // the game can run perfectly while the screen stays grey.
      var ownCanvas = GameGlobal.__mainCanvas || GameGlobal.canvas || null;
      var engineCanvas = GameGlobal.screencanvas || null;
      var canvasInfo = "main=" + (ownCanvas ? ownCanvas.width + "x" + ownCanvas.height : "none")
        + " engine=" + (engineCanvas ? engineCanvas.width + "x" + engineCanvas.height : "none")
        + " same=" + (!!ownCanvas && !!engineCanvas && ownCanvas === engineCanvas)
        + " win=" + (typeof innerWidth === "number" ? innerWidth : "?") + "x" + (typeof innerHeight === "number" ? innerHeight : "?")
        + "@" + (typeof devicePixelRatio === "number" ? devicePixelRatio : "?");
      if (ownCanvas && engineCanvas && ownCanvas !== engineCanvas) {
        dwarn(0,"[Plonky] WARNING: rendering into a canvas the engine does not present", canvasInfo);
      }
      dlog(1,
        "[Plonky] layout-state", delay,
        "layout=" + name,
        "loading=" + loading,
        "pending=" + pending,
        "texturesOk=" + (GameGlobal.__plonkyTextureOk || 0),
        "failed=" + (failed.length ? failed.join(",") : "none"),
        canvasInfo
      );
      // One always-on line: proves the game reached a running layout and reports the
      // failure counts, without flooding the console (set __plonkyDiag = 2 for traces).
      var isLoadingNow = loading === true || loading === "true" || loading === 1;
      if (!GameGlobal.__plonkyReadyReported && name !== "(none)" && !isLoadingNow
          && !!ownCanvas && ownCanvas === engineCanvas) {
        GameGlobal.__plonkyReadyReported = true;
        GameGlobal.__plonkyGameReady = true;
        try { if (GameGlobal.__plonkySplashMark) GameGlobal.__plonkySplashMark("game-ready"); } catch (eMarkR) {}
        dwarn(1, "[Plonky] ready layout=" + name
          + " textures=" + (GameGlobal.__plonkyTextureOk || 0)
          + " failed=" + failed.length
          + " diag=" + diagLevel()
          + " (set GameGlobal.__plonkyDiag=2 for full traces)");
      }
      try { hideNoAdsButton(rt); hideOriginalReviveButton(rt); hidePrivacyButton(rt); } catch (eHide3) {}
      // Recovery is only meaningful when the runtime is idle *and* the switch was
      // never scheduled. If a texture load already failed, retrying the same
      // layout will fail again -- report it instead of looping.
      if (delay >= 2500 && !GameGlobal.__plonkyInitialLayout && name === "(none)" && lm) {
        var isLoading = loading === true || loading === "true" || loading === 1;
        var available = [];
        try {
          var allLayouts = lm.GetAllLayouts && lm.GetAllLayouts();
          if (allLayouts) available = allLayouts.map(function (item) { return item && item.GetName ? item.GetName() : "?"; });
        } catch (eAllLayouts) {}
        var initial = lm.GetLayoutByName && (lm.GetLayoutByName("menu_layout") || lm.GetLayoutByName("layout001"));
        dlog(1,
          "[Plonky] layout-recovery check",
          "loading=" + isLoading,
          "pending=" + pending,
          "target=" + !!initial,
          "available=" + available.slice(0, 8).join(",") + (available.length > 8 ? ",..." : "")
        );
        if (!isLoading && !pending && initial && !failed.length) {
          GameGlobal.__plonkyInitialLayout = true;
          lm.ChangeMainLayout(initial);
          dwarn(0,"[Plonky] recovered initial layout", initial.GetName ? initial.GetName() : "menu_layout");
        }
      }
    } catch (eLayoutState) {
      dwarn(0,"[Plonky] layout-state fail", delay, eLayoutState && (eLayoutState.message || eLayoutState));
    }
  }

  function startRuntime() {
    if (started) return;
    started = true;
    trace("deviceready");
    try {
      fireDeviceReady();
      trace("deviceready 返回");
      var ri = window.c3_runtimeInterface;
      if (ri) {
        trace("hasRuntime=" + !!ri._localRuntime + " init=" + !!ri.__plonkyInit);
        installSwitchDiagnostics(ri);
        // The runtime's layout objects only exist once it starts initialising, so
        // keep retrying the (individually guarded) hooks for the first few seconds
        // instead of relying on a single early attempt.
        var diagTries = 0;
        var diagTimer = setInterval(function () {
          diagTries++;
          var rtNow = getLocalRuntime(ri);
          if (rtNow) installSwitchDiagnostics(rtNow);
          if (diagTries >= 120 || (GameGlobal.__plonkyLayoutDiag && GameGlobal.__plonkyChangeLayoutDiag)) {
            clearInterval(diagTimer);
          }
        }, 50);
        // A stalled menu_layout texture load leaves the runtime with no running
        // layout ("layout=(none)"). Probe several times: the DevTools simulator
        // decodes every PNG in JavaScript, so a slow boot must not be mistaken
        // for a broken one.
        [1000, 3000, 6000, 10000, 15000, 25000].forEach(function (delay) {
          setTimeout(function () { reportLayoutState(ri, delay); }, delay);
        });
      } else {
        console.error("[Plonky] 没有 c3_runtimeInterface");
        try {
          wx.showModal({
            title: "启动异常",
            content: "c3_runtimeInterface 未创建",
            showCancel: false
          });
        } catch (e3) {}
      }
    } catch (err) {
      console.error("[Plonky] deviceready", err);
      try {
        wx.showModal({
          title: "启动异常",
          content: String(err && (err.message || err)),
          showCancel: false
        });
      } catch (e2) {}
    }
  }

  function startDevtoolsFramePump() {
    if (!isDevtools() || GameGlobal.__plonkyDevtoolsFramePump) return;
    GameGlobal.__plonkyDevtoolsFramePump = setInterval(function () {
      if (GameGlobal.__plonkyDialogIsOpen && GameGlobal.__plonkyDialogIsOpen()) return;
      var ri = window.c3_runtimeInterface;
      if (!ri || !ri._rafCallbacks || ri._rafCallbacks.size === 0) return;
      try {
        var rtNow = getLocalRuntime(ri);
        if (rtNow && typeof rtNow.IsSuspended === 'function' && rtNow.IsSuspended()) return;
      } catch (eSus) {}
      try { ri._OnRAFCallback(); } catch (e) {}
    }, 16);
  }

  startDevtoolsFramePump();
  Promise.resolve().then(startRuntime);
  if (typeof wx.nextTick === "function") wx.nextTick(startRuntime);
  setTimeout(startRuntime, 0);
  setTimeout(startRuntime, 50);
  setTimeout(function () {
    var ri = window.c3_runtimeInterface;
    if (!ri) {
      console.error("[Plonky] 8s 仍无 runtimeInterface");
      return;
    }
    if (!ri._localRuntime) {
      console.error("[Plonky] 8s 仍未 C3_CreateRuntime, init=" + !!ri.__plonkyInit);
      try {
        wx.showModal({
          title: "启动卡住",
          content: "引擎已进 _Init 但还没创建 runtime。请把控制台里 [Plonky] _Init / [adapter] fetch 日志发过来。",
          showCancel: false
        });
      } catch (e) {}
    }
  }, 8000);
}

trace("加载资源");
try {
  var resourceLoads = Promise.all([
    loadSubpackage("pkg-data"),
    loadSubpackage("pkg-res")
  ]);
  resourceLoads.then(function () {
    dlog(1,"[Plonky] 分包就绪");
    boot();
  }, function (err) {
    console.error("[Plonky] 分包失败", err && (err.errMsg || err.message || err));
    boot();
  });
  if (isDevtools()) {
    // DevTools may never settle loadSubpackage even though local files are readable.
    dlog(1,"[Plonky] 开发者工具直接启动，分包在后台预加载");
    boot();
  }
} catch (e) {
  console.error("[Plonky] 分包加载异常", e && (e.message || e));
  boot();
}
