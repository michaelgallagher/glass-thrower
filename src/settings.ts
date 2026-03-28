import { App, PluginSettingTab, Setting } from "obsidian";
import type SwipeSidebarPlugin from "./main";

export interface SwipeSidebarSettings {
	enabled: boolean;
	deltaXThreshold: number;
	animationDurationMs: number;
	horizontalRatio: number;
	cooldownMs: number;
}

export const DEFAULT_SETTINGS: SwipeSidebarSettings = {
	enabled: true,
	deltaXThreshold: 80,
	animationDurationMs: 150,
	horizontalRatio: 2.0,
	cooldownMs: 600,
};

export class SwipeSidebarSettingTab extends PluginSettingTab {
	plugin: SwipeSidebarPlugin;

	constructor(app: App, plugin: SwipeSidebarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Enable swipe gesture")
			.setDesc("Toggle two-finger swipe detection on or off.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enabled)
					.onChange(async (value) => {
						this.plugin.settings.enabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sensitivity")
			.setDesc(
				"How much horizontal swipe is needed to trigger. Lower = more sensitive."
			)
			.addSlider((slider) =>
				slider
					.setLimits(30, 200, 10)
					.setValue(this.plugin.settings.deltaXThreshold)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.deltaXThreshold = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Animation speed (ms)")
			.setDesc("Duration of the sidebar slide animation.")
			.addSlider((slider) =>
				slider
					.setLimits(100, 500, 25)
					.setValue(this.plugin.settings.animationDurationMs)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.animationDurationMs = value;
						await this.plugin.saveSettings();
						this.plugin.updateAnimationDuration();
					})
			);

		containerEl.createEl("h3", { text: "Advanced" });

		new Setting(containerEl)
			.setName("Horizontal ratio")
			.setDesc(
				"Minimum ratio of horizontal to vertical movement. Higher = stricter horizontal requirement."
			)
			.addSlider((slider) =>
				slider
					.setLimits(1, 5, 0.5)
					.setValue(this.plugin.settings.horizontalRatio)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.horizontalRatio = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Cooldown (ms)")
			.setDesc("Minimum time between consecutive swipe triggers.")
			.addSlider((slider) =>
				slider
					.setLimits(200, 1500, 50)
					.setValue(this.plugin.settings.cooldownMs)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.cooldownMs = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
