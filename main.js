var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SwipeSidebarPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/gesture-detector.ts
var DEFAULT_GESTURE_CONFIG = {
  deltaXThreshold: 80,
  horizontalRatio: 2,
  cooldownMs: 600,
  accumulationWindowMs: 300,
  idleResetMs: 150
};
var GestureDetector = class {
  constructor(config, callback) {
    this.config = config;
    this.callback = callback;
    this.accumulatedDeltaX = 0;
    this.accumulatedAbsDeltaY = 0;
    this.windowStart = null;
    this.cooldownUntil = 0;
    this.idleTimer = null;
  }
  handleWheel(event) {
    if (event.ctrlKey) return;
    const now = Date.now();
    if (now < this.cooldownUntil) return;
    if (this.windowStart === null || now - this.windowStart > this.config.accumulationWindowMs) {
      this.reset();
      this.windowStart = now;
    }
    this.accumulatedDeltaX += event.deltaX;
    this.accumulatedAbsDeltaY += Math.abs(event.deltaY);
    this.scheduleIdleReset();
    const absDeltaX = Math.abs(this.accumulatedDeltaX);
    if (absDeltaX >= this.config.deltaXThreshold && absDeltaX >= this.config.horizontalRatio * this.accumulatedAbsDeltaY) {
      const direction = this.accumulatedDeltaX > 0 ? "collapse" : "expand";
      this.cooldownUntil = now + this.config.cooldownMs;
      this.reset();
      this.callback(direction);
    }
  }
  updateConfig(config) {
    this.config = config;
  }
  destroy() {
    this.clearIdleTimer();
  }
  reset() {
    this.accumulatedDeltaX = 0;
    this.accumulatedAbsDeltaY = 0;
    this.windowStart = null;
    this.clearIdleTimer();
  }
  scheduleIdleReset() {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.reset();
    }, this.config.idleResetMs);
  }
  clearIdleTimer() {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
};

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  enabled: true,
  deltaXThreshold: 80,
  animationDurationMs: 150,
  horizontalRatio: 2,
  cooldownMs: 600
};
var SwipeSidebarSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Enable swipe gesture").setDesc("Toggle two-finger swipe detection on or off.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
        this.plugin.settings.enabled = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Sensitivity").setDesc(
      "How much horizontal swipe is needed to trigger. Lower = more sensitive."
    ).addSlider(
      (slider) => slider.setLimits(30, 200, 10).setValue(this.plugin.settings.deltaXThreshold).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.deltaXThreshold = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Animation speed (ms)").setDesc("Duration of the sidebar slide animation.").addSlider(
      (slider) => slider.setLimits(100, 500, 25).setValue(this.plugin.settings.animationDurationMs).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.animationDurationMs = value;
        await this.plugin.saveSettings();
        this.plugin.updateAnimationDuration();
      })
    );
    containerEl.createEl("h3", { text: "Advanced" });
    new import_obsidian.Setting(containerEl).setName("Horizontal ratio").setDesc(
      "Minimum ratio of horizontal to vertical movement. Higher = stricter horizontal requirement."
    ).addSlider(
      (slider) => slider.setLimits(1, 5, 0.5).setValue(this.plugin.settings.horizontalRatio).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.horizontalRatio = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Cooldown (ms)").setDesc("Minimum time between consecutive swipe triggers.").addSlider(
      (slider) => slider.setLimits(200, 1500, 50).setValue(this.plugin.settings.cooldownMs).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.cooldownMs = value;
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/main.ts
var ANIMATION_CLASS = "swipe-sidebar-animating";
var CSS_VAR_DURATION = "--swipe-sidebar-duration";
function getElectronWindow() {
  var _a, _b;
  try {
    const electron = window.require("electron");
    return (_b = (_a = electron == null ? void 0 : electron.remote) == null ? void 0 : _a.getCurrentWindow()) != null ? _b : null;
  } catch (e) {
    return null;
  }
}
var SwipeSidebarPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.gestureDetector = null;
    this.animating = false;
    this.savedSidebarWidth = null;
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SwipeSidebarSettingTab(this.app, this));
    if (import_obsidian2.Platform.isDesktop) {
      this.initGestureDetector();
    }
    this.updateAnimationDuration();
    this.addCommand({
      id: "toggle-left-sidebar-animated",
      name: "Toggle left sidebar (animated)",
      callback: () => {
        const collapsed = this.app.workspace.leftSplit.collapsed;
        this.animatedToggle(collapsed ? "expand" : "collapse");
      }
    });
  }
  onunload() {
    var _a;
    (_a = this.gestureDetector) == null ? void 0 : _a.destroy();
    this.gestureDetector = null;
    document.body.classList.remove(ANIMATION_CLASS);
    const sidebarEl = this.getLeftSplitEl();
    sidebarEl == null ? void 0 : sidebarEl.classList.remove(ANIMATION_CLASS);
    document.body.style.removeProperty(CSS_VAR_DURATION);
  }
  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }
  async saveSettings() {
    var _a;
    await this.saveData(this.settings);
    (_a = this.gestureDetector) == null ? void 0 : _a.updateConfig(this.buildGestureConfig());
  }
  updateAnimationDuration() {
    document.body.style.setProperty(
      CSS_VAR_DURATION,
      `${this.settings.animationDurationMs}ms`
    );
  }
  initGestureDetector() {
    this.gestureDetector = new GestureDetector(
      this.buildGestureConfig(),
      (direction) => {
        if (this.settings.enabled) {
          this.animatedToggle(direction);
        }
      }
    );
    this.registerDomEvent(
      document,
      "wheel",
      (evt) => {
        var _a;
        (_a = this.gestureDetector) == null ? void 0 : _a.handleWheel(evt);
      },
      { passive: true }
    );
  }
  buildGestureConfig() {
    return {
      ...DEFAULT_GESTURE_CONFIG,
      deltaXThreshold: this.settings.deltaXThreshold,
      horizontalRatio: this.settings.horizontalRatio,
      cooldownMs: this.settings.cooldownMs
    };
  }
  animatedToggle(direction) {
    var _a;
    const leftSplit = this.app.workspace.leftSplit;
    if (direction === "collapse" && leftSplit.collapsed) return;
    if (direction === "expand" && !leftSplit.collapsed) return;
    if (this.animating) return;
    const sidebarEl = this.getLeftSplitEl();
    const editorEl = this.getEditorEl();
    if (!sidebarEl) {
      if (direction === "collapse") {
        leftSplit.collapse();
      } else {
        leftSplit.expand();
      }
      return;
    }
    this.animating = true;
    const originalSidebarWidth = sidebarEl.offsetWidth;
    if (direction === "collapse") {
      this.savedSidebarWidth = originalSidebarWidth;
    }
    const restoreWidth = (_a = this.savedSidebarWidth) != null ? _a : originalSidebarWidth;
    const win = getElectronWindow();
    const bounds = win == null ? void 0 : win.getBounds();
    const duration = this.settings.animationDurationMs;
    if (editorEl) {
      const editorWidth = editorEl.offsetWidth;
      editorEl.style.minWidth = editorWidth + "px";
      editorEl.style.maxWidth = editorWidth + "px";
    }
    if (direction === "expand" && win && bounds) {
      win.setSize(
        Math.round(bounds.width + restoreWidth),
        bounds.height
      );
    }
    sidebarEl.classList.add(ANIMATION_CLASS);
    document.body.classList.add(ANIMATION_CLASS);
    if (direction === "collapse") {
      leftSplit.collapse();
    } else {
      leftSplit.expand();
    }
    const safetyTimeout = duration + 100;
    const cleanup = () => {
      if (direction === "collapse" && win && bounds) {
        win.setSize(
          Math.round(bounds.width - originalSidebarWidth),
          bounds.height
        );
      }
      if (editorEl) {
        editorEl.style.minWidth = "";
        editorEl.style.maxWidth = "";
      }
      sidebarEl.classList.remove(ANIMATION_CLASS);
      document.body.classList.remove(ANIMATION_CLASS);
      this.animating = false;
    };
    let cleaned = false;
    const onTransitionEnd = () => {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(fallbackTimer);
      cleanup();
    };
    sidebarEl.addEventListener("transitionend", onTransitionEnd, {
      once: true
    });
    const fallbackTimer = setTimeout(() => {
      if (cleaned) return;
      cleaned = true;
      sidebarEl.removeEventListener("transitionend", onTransitionEnd);
      cleanup();
    }, safetyTimeout);
  }
  getLeftSplitEl() {
    return document.querySelector(
      ".workspace-split.mod-left-split"
    );
  }
  getEditorEl() {
    return document.querySelector(
      ".workspace-split.mod-root"
    );
  }
};
