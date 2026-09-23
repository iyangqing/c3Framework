"use strict";

/**
 * 微信小游戏 SDK（参考 SdkWeiXin.ts）
 *
 * 用法：
 *   iyySdk.Ins.init();
 *   iyySdk.Ins.showAd("reward", 0, function (ended) { ... });
 *   iyySdk.Ins.showAd("inter", 0);
 *   iyySdk.Ins.showAd("banner", 0);
 *   iyySdk.Ins.hideAd("banner", 0);
 *   iyySdk.Ins.share("标题", "分享图路径");
 *
 * 广告位在 GameGlobal.guangAllId 里配置，例如：
 *   GameGlobal.guangAllId = {
 *     wxAppId: "wx...",
 *     rewardIds: ["adunit-..."],
 *     interIds: ["adunit-..."],
 *     bannerIds: ["adunit-..."],
 *     customIds: [], lineIds: [], columnIds: [], matrixIds: [],
 *     showInterAdMaxTime: 3000,
 *     showInterAdInterval: 1000,
 *     isWuChu: false,
 *     isLog: false
 *   };
 */
(function (root) {
  var g = typeof GameGlobal !== "undefined" ? GameGlobal : root;
  var wxAPI = function () {
    try { if (typeof wx !== "undefined") return wx; } catch (e0) {}
    try { return g.wx || root.wx || null; } catch (e1) { return null; }
  };

  function log() {
    if (!IyySdk._log) return;
    try { console.log.apply(console, ["[iyySdk]"].concat([].slice.call(arguments))); } catch (e) {}
  }

  function safeCall(fn, arg) {
    if (typeof fn !== "function") return;
    try { fn(arg); } catch (e) {}
  }

  function adStyle(style, defW, defH) {
    style = style || {};
    var wxo = wxAPI();
    var sw = 375, sh = 667;
    try {
      var sys = wxo && wxo.getSystemInfoSync && wxo.getSystemInfoSync();
      if (sys) { sw = sys.screenWidth || sw; sh = sys.screenHeight || sh; }
    } catch (eS) {}
    var width = style.width || defW || 375;
    var height = style.height || defH || 120;
    var left = 0, top = 0;
    if (style.isSkew) {
      left = Math.max(0, sw - 1);
      top = Math.max(0, sh - 1);
    } else {
      if (style.hor === 1) left = style.horValue || 0;
      else if (style.hor === -1) left = sw - width + (style.horValue || 0);
      else left = (sw - width) / 2 + (style.horValue || 0);
      if (style.ver === -1) top = style.verValue || 0;
      else if (style.ver === 1) top = sh - height + (style.verValue || 0) - 10;
      else top = (sh - height) / 2 + (style.verValue || 0);
    }
    return { left: left, top: top, width: width };
  }

  function RewardAd(id) {
    this.id = id;
    this.ad = null;
    this._cbShow = null;
    this._cbClose = null;
    this._showing = false;
    this._create();
  }
  RewardAd.prototype._create = function () {
    var wxo = wxAPI();
    if (!wxo || typeof wxo.createRewardedVideoAd !== "function" || !this.id) return;
    try {
      this.ad = wxo.createRewardedVideoAd({ adUnitId: this.id, multiton: true });
    } catch (eC) {
      try { this.ad = wxo.createRewardedVideoAd({ adUnitId: this.id }); } catch (eC2) { this.ad = null; }
    }
    if (!this.ad) return;
    var self = this;
    try {
      this.ad.onError(function () {
        if (!self._showing) return;
        self._showing = false;
        safeCall(self._cbShow, false);
        safeCall(self._cbClose, false);
        self._cbShow = null;
        self._cbClose = null;
      });
    } catch (eE) {}
    try {
      this.ad.onClose(function (res) {
        IyySdk.isUpdate = true;
        self._showing = false;
        var ended = !!(res && res.isEnded) || res === undefined;
        safeCall(self._cbClose, ended);
        self._cbShow = null;
        self._cbClose = null;
        try { if (self.ad && self.ad.load) self.ad.load(); } catch (eLd) {}
      });
    } catch (eCl) {}
    try { if (this.ad.load) this.ad.load(); } catch (eLd0) {}
  };
  RewardAd.prototype.show = function (cbShow, cbClose) {
    this._cbShow = cbShow;
    this._cbClose = cbClose;
    this._showing = true;
    var self = this;
    if (!this.ad) this._create();
    var ad = this.ad;
    if (!ad) {
      this._showing = false;
      safeCall(cbShow, false);
      safeCall(cbClose, false);
      return;
    }
    function shown() {
      IyySdk.isUpdate = false;
      safeCall(self._cbShow, true);
    }
    function failed() {
      self._showing = false;
      safeCall(self._cbShow, false);
      safeCall(self._cbClose, false);
      self._cbShow = null;
      self._cbClose = null;
      try { if (ad.load) ad.load(); } catch (eLd) {}
    }
    var p = null;
    try { p = ad.show(); } catch (eS) { p = Promise.reject(eS); }
    if (p && typeof p.then === "function") {
      p.then(shown).catch(function () {
        return Promise.resolve(ad.load && ad.load()).then(function () { return ad.show(); }).then(shown);
      }).catch(failed);
    }
  };

  function InterAd(id) {
    this.id = id;
    this.ad = null;
    this._create();
  }
  InterAd.prototype._create = function () {
    var wxo = wxAPI();
    if (!wxo || typeof wxo.createInterstitialAd !== "function" || !this.id) return;
    try { this.ad = wxo.createInterstitialAd({ adUnitId: this.id }); } catch (eC) { this.ad = null; }
    if (!this.ad) return;
    try { if (this.ad.load) this.ad.load(); } catch (eLd) {}
    try { this.ad.onError(function (err) { log("inter onError", err); }); } catch (eE) {}
    try {
      this.ad.onClose(function () { IyySdk.isUpdate = true; log("inter onClose"); });
    } catch (eCl) {}
  };
  InterAd.prototype.show = function () {
    var ad = this.ad;
    if (!ad) return;
    var p = ad.load ? ad.load() : Promise.resolve();
    Promise.resolve(p).then(function () { return ad.show(); }).then(function () {
      IyySdk.isUpdate = false;
    }).catch(function () {
      return Promise.resolve(ad.load && ad.load()).then(function () { return ad.show(); }).then(function () {
        IyySdk.isUpdate = false;
      });
    }).catch(function () {});
  };

  function BannerAd(id, style) {
    this.id = id;
    this.style = style || { hor: 0, ver: 1, horValue: 0, verValue: 0 };
    this.ad = null;
    this._create();
  }
  BannerAd.prototype._create = function () {
    var wxo = wxAPI();
    if (!this.id) return;
    var st = adStyle(this.style, 375, 120);
    try {
      if (wxo && typeof wxo.createBannerAd === "function") {
        this.ad = wxo.createBannerAd({
          adUnitId: this.id,
          adIntervals: 30,
          style: { left: st.left, top: st.top, width: st.width }
        });
      } else if (wxo && typeof wxo.createCustomAd === "function") {
        this.ad = wxo.createCustomAd({
          adUnitId: this.id,
          adIntervals: 30,
          style: { left: st.left, top: st.top, width: st.width }
        });
      }
    } catch (eC) { this.ad = null; }
    if (!this.ad) return;
    try { this.ad.onError(function (err) { log("banner onError", err); }); } catch (eE) {}
  };
  BannerAd.prototype.show = function () {
    try { if (this.ad && this.ad.show) this.ad.show(); } catch (eS) { log("banner show fail", eS); }
  };
  BannerAd.prototype.hide = function () {
    try { if (this.ad && this.ad.hide) this.ad.hide(); } catch (eH) {}
  };
  BannerAd.prototype.destroy = function () {
    try { if (this.ad && this.ad.destroy) this.ad.destroy(); } catch (eD) {}
    this.ad = null;
  };

  function CustomAd(id, style, size) {
    this.id = id;
    this.style = style || { hor: 0, ver: 0, horValue: 0, verValue: 0 };
    this.size = size || { w: 375, h: 120 };
    this.ad = null;
    this._create();
  }
  CustomAd.prototype._create = function () {
    var wxo = wxAPI();
    if (!wxo || typeof wxo.createCustomAd !== "function" || !this.id) return;
    var st = adStyle(this.style, this.size.w, this.size.h);
    try {
      this.ad = wxo.createCustomAd({
        adUnitId: this.id,
        adIntervals: 30,
        style: { left: st.left, top: st.top, width: st.width }
      });
    } catch (eC) { this.ad = null; }
    if (!this.ad) return;
    try { this.ad.onError(function (err) { log("custom onError", err); }); } catch (eE) {}
  };
  CustomAd.prototype.show = function () {
    try { if (this.ad && this.ad.show) this.ad.show(); } catch (eS) {}
  };
  CustomAd.prototype.hide = function () {
    try { if (this.ad && this.ad.hide) this.ad.hide(); } catch (eH) {}
  };

  function IyySdk() {
    this._wx = null;
    this.currentPla = "wx";
    this.isShowAd = true;
    this.isShowVideoAd = true;
    this.isLog = false;
    this.startGameTime = 0;
    this.showInterAdMaxTime = 1000;
    this.showInterAdInterval = 1000;
    this.showInterAdCurrentTime = 0;
    this.isWuChu = false;
    this.wxAppId = "";
    this.rewardIds = [];
    this.interIds = [];
    this.bannerIds = [];
    this.customIds = [];
    this.lineIds = [];
    this.columnIds = [];
    this.matrixIds = [];
    this.fromScence = "";
    this._reward = [];
    this._inter = [];
    this._banner = [];
    this._custom = [];
    this._line = [];
    this._column = [];
    this._matrix = [];
    this._clubBtn = null;
    this.bannerStyles = [{ hor: 0, ver: 1, horValue: 0, verValue: 0 }];
    this.customStyles = [{ hor: 0, ver: 0, horValue: 0, verValue: 0, width: 68, height: 106 }];
    this.lineStyles = [{ hor: 0, ver: 1, horValue: 0, verValue: 0, width: 375, height: 84 }];
    this.columnStyles = [{ hor: -1, ver: 0, horValue: 0, verValue: 0, width: 72, height: 250 }];
    this.matrixStyles = [{ hor: 0, ver: 0, horValue: 0, verValue: 0, width: 375, height: 300 }];
  }

  IyySdk._ins = null;
  IyySdk._log = false;
  IyySdk.isLoading = false;
  IyySdk.isUpdate = true;
  Object.defineProperty(IyySdk, "Ins", {
    get: function () {
      if (!IyySdk._ins) IyySdk._ins = new IyySdk();
      return IyySdk._ins;
    }
  });

  IyySdk.prototype._applyCfg = function (cfg) {
    if (!cfg) return;
    var copy = function (key) {
      if (cfg[key] && cfg[key].length) this[key] = cfg[key].slice();
    }.bind(this);
    if (cfg.wxAppId) this.wxAppId = cfg.wxAppId;
    copy("rewardIds"); copy("interIds"); copy("bannerIds");
    copy("customIds"); copy("lineIds"); copy("columnIds"); copy("matrixIds");
    if (cfg.showInterAdMaxTime != null) this.showInterAdMaxTime = Number(cfg.showInterAdMaxTime) || 0;
    if (cfg.showInterAdInterval != null) this.showInterAdInterval = Number(cfg.showInterAdInterval) || 0;
    if (cfg.isWuChu != null) this.isWuChu = !!cfg.isWuChu;
    if (cfg.isLog != null) this.isLog = !!cfg.isLog;
    if (cfg.isShowAd != null) this.isShowAd = !!cfg.isShowAd;
    if (cfg.isShowVideoAd != null) this.isShowVideoAd = !!cfg.isShowVideoAd;
    IyySdk._log = this.isLog;
  };

  IyySdk.prototype.init = function (params) {
    this._wx = wxAPI();
    var cfg = params || g.guangAllId
      || (typeof GameGlobal !== "undefined" && GameGlobal.guangAllId)
      || (typeof window !== "undefined" && window.guangAllId)
      || null;
    this._applyCfg(cfg);
    if (this._inited) {
      if (!this._reward.length && !this._inter.length) this.initAd();
      return this;
    }
    this._inited = true;
    try {
      if (this._wx && this._wx.getLaunchOptionsSync) {
        var opt = this._wx.getLaunchOptionsSync();
        this.fromScence = opt && (opt.scene != null) ? String(opt.scene) : "";
      }
    } catch (eL) {}
    this.startGameTime = Date.now();
    this._applyCfg(cfg);
    try {
      if (this._wx && this._wx.showShareMenu) {
        this._wx.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage", "shareTimeline"] });
      }
    } catch (eM) {
      try { this._wx.showShareMenu({ withShareTicket: true }); } catch (eM2) {}
    }
    try {
      if (this._wx && this._wx.onShareAppMessage) {
        this._wx.onShareAppMessage(function () {
          return { title: "", imageUrl: "" };
        });
      }
    } catch (eS) {}
    this.initAd();
    log("init", this.wxAppId || "(no appid cfg)");
    return this;
  };

  IyySdk.prototype.initAd = function () {
    if (!this.isShowAd) return;
    var i;
    this._reward = [];
    this._inter = [];
    this._banner = [];
    this._custom = [];
    this._line = [];
    this._column = [];
    this._matrix = [];
    for (i = 0; i < this.rewardIds.length; i++) this._reward.push(new RewardAd(this.rewardIds[i]));
    for (i = 0; i < this.interIds.length; i++) this._inter.push(new InterAd(this.interIds[i]));
    for (i = 0; i < this.bannerIds.length; i++) this._banner.push(new BannerAd(this.bannerIds[i], this.bannerStyles[i] || this.bannerStyles[0]));
    for (i = 0; i < this.customIds.length; i++) this._custom.push(new CustomAd(this.customIds[i], this.customStyles[i] || this.customStyles[0], { w: 68, h: 106 }));
    for (i = 0; i < this.lineIds.length; i++) this._line.push(new CustomAd(this.lineIds[i], this.lineStyles[i] || this.lineStyles[0], { w: 375, h: 84 }));
    for (i = 0; i < this.columnIds.length; i++) this._column.push(new CustomAd(this.columnIds[i], this.columnStyles[i] || this.columnStyles[0], { w: 72, h: 250 }));
    for (i = 0; i < this.matrixIds.length; i++) this._matrix.push(new CustomAd(this.matrixIds[i], this.matrixStyles[i] || this.matrixStyles[0], { w: 375, h: 300 }));
  };

  IyySdk.prototype._grantReward = function (cbShow, cbClose) {
    safeCall(cbShow, true);
    safeCall(cbClose, true);
  };

  IyySdk.prototype.showAd = function (adType, adIndex, cbClose, cbShow) {
    adType = String(adType || "");
    adIndex = adIndex || 0;
    if (!this.isShowAd) {
      if (adType === "reward") this._grantReward(cbShow, cbClose);
      return;
    }
    if (adType === "reward") {
      if (!this.isShowVideoAd || !this._reward[adIndex]) {
        this._grantReward(cbShow, cbClose);
        return;
      }
      this._reward[adIndex].show(cbShow, cbClose);
      return;
    }
    if (adType === "inter") {
      if (this._inter[adIndex]) this._inter[adIndex].show();
      return;
    }
    var map = { banner: this._banner, custom: this._custom, line: this._line, column: this._column, matrix: this._matrix };
    var list = map[adType];
    if (list && list[adIndex]) list[adIndex].show();
  };

  IyySdk.prototype.hideAd = function (adType, adIndex) {
    adIndex = adIndex || 0;
    var map = { banner: this._banner, custom: this._custom, line: this._line, column: this._column, matrix: this._matrix };
    var list = map[String(adType || "")];
    if (list && list[adIndex] && list[adIndex].hide) list[adIndex].hide();
  };

  IyySdk.prototype.share = function (msg, url) {
    var wxo = this._wx || wxAPI();
    if (!wxo || typeof wxo.shareAppMessage !== "function") return;
    try { wxo.shareAppMessage({ title: msg || "", imageUrl: url || "" }); } catch (eS) {}
  };

  IyySdk.prototype.playVibrative = function (isShort) {
    var wxo = this._wx || wxAPI();
    if (!wxo) return;
    try {
      if (isShort !== false && wxo.vibrateShort) wxo.vibrateShort({ type: "light" });
      else if (wxo.vibrateLong) wxo.vibrateLong();
    } catch (eV) {}
  };

  IyySdk.prototype.getRightMenu = function () {
    var wxo = this._wx || wxAPI();
    try { return wxo && wxo.getMenuButtonBoundingClientRect ? wxo.getMenuButtonBoundingClientRect() : null; } catch (eR) { return null; }
  };

  IyySdk.prototype.logins = function (callback) {
    var wxo = this._wx || wxAPI();
    if (!wxo || typeof wxo.login !== "function") { safeCall(callback, null); return; }
    wxo.login({
      success: function (res) { log("login", res); safeCall(callback, res); },
      fail: function (err) { log("login fail", err); safeCall(callback, null); }
    });
  };

  IyySdk.prototype.getLaunchOptionsSync = function () {
    var wxo = this._wx || wxAPI();
    try { return wxo && wxo.getLaunchOptionsSync ? wxo.getLaunchOptionsSync() : {}; } catch (e) { return {}; }
  };
  IyySdk.prototype.getSystemInfoSync = function () {
    var wxo = this._wx || wxAPI();
    try { return wxo && wxo.getSystemInfoSync ? wxo.getSystemInfoSync() : {}; } catch (e) { return {}; }
  };
  IyySdk.prototype.getEnterOptionsSync = function () {
    var wxo = this._wx || wxAPI();
    try { return wxo && wxo.getEnterOptionsSync ? wxo.getEnterOptionsSync() : this.getLaunchOptionsSync(); } catch (e) { return {}; }
  };

  IyySdk.prototype.loadSubpackage = function (resList, callback, progressCall) {
    var wxo = this._wx || wxAPI();
    resList = resList || [];
    if (!resList.length || !wxo || typeof wxo.loadSubpackage !== "function") {
      safeCall(callback);
      return;
    }
    var left = resList.length;
    for (var i = 0; i < resList.length; i++) {
      (function (name, idx) {
        wxo.loadSubpackage({
          name: name,
          success: function () {
            safeCall(progressCall, idx);
            left--;
            if (left <= 0) safeCall(callback);
          },
          fail: function () {
            left--;
            if (left <= 0) safeCall(callback);
          }
        });
      })(resList[i], i);
    }
  };

  IyySdk.prototype.navigateToMiniProgram = function (appId, path, successCb, failCb, completeCb) {
    var wxo = this._wx || wxAPI();
    if (!wxo || typeof wxo.navigateToMiniProgram !== "function") { safeCall(failCb); return; }
    wxo.navigateToMiniProgram({
      appId: appId,
      path: path || "",
      extraData: { from: "plonky" },
      success: function (e) { safeCall(successCb, e); },
      fail: function (e) { safeCall(failCb, e); },
      complete: function (e) { safeCall(completeCb, e); }
    });
  };

  IyySdk.prototype.reportData = function () {};

  IyySdk.prototype.showClubBtn = function () {
    var wxo = this._wx || wxAPI();
    if (!wxo || typeof wxo.createGameClubButton !== "function") return;
    try {
      if (!this._clubBtn) {
        this._clubBtn = wxo.createGameClubButton({
          icon: "green",
          style: { left: 10, top: 10, width: 40, height: 40 }
        });
      }
      if (this._clubBtn.show) this._clubBtn.show();
    } catch (eC) {}
  };
  IyySdk.prototype.hideClubBtn = function () {
    try { if (this._clubBtn && this._clubBtn.hide) this._clubBtn.hide(); } catch (eH) {}
  };

  IyySdk.prototype.createRewardedVideoAd = function (adUnitId) {
    var wxo = this._wx || wxAPI();
    if (!wxo || typeof wxo.createRewardedVideoAd !== "function") return null;
    try { return wxo.createRewardedVideoAd({ adUnitId: adUnitId, multiton: true }); } catch (e) {
      try { return wxo.createRewardedVideoAd({ adUnitId: adUnitId }); } catch (e2) { return null; }
    }
  };

  g.iyySdk = IyySdk;
  g.SdkWeiXin = IyySdk;
  try { if (typeof window !== "undefined") { window.iyySdk = IyySdk; window.SdkWeiXin = IyySdk; } } catch (eW) {}
  if (typeof module !== "undefined" && module.exports) module.exports = IyySdk;
})(typeof GameGlobal !== "undefined" ? GameGlobal : (typeof window !== "undefined" ? window : this));
