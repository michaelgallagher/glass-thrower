import { Platform, Plugin } from "obsidian";
import {
	GestureDetector,
	DEFAULT_GESTURE_CONFIG,
	type SwipeDirection,
	type GestureConfig,
} from "./gesture-detector";
import {
	DEFAULT_SETTINGS,
	SwipeSidebarSettingTab,
	type SwipeSidebarSettings,
} from "./settings";

const ANIMATION_CLASS = "swipe-sidebar-animating";
const CSS_VAR_DURATION = "--swipe-sidebar-duration";

function getElectronWindow(): any | null {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const electron = (window as any).require("electron");
		return electron?.remote?.getCurrentWindow() ?? null;
	} catch {
		return null;
	}
}

export default class SwipeSidebarPlugin extends Plugin {
	settings: SwipeSidebarSettings = DEFAULT_SETTINGS;
	private gestureDetector: GestureDetector | null = null;
	private animating = false;
	private savedSidebarWidth: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new SwipeSidebarSettingTab(this.app, this));

		if (Platform.isDesktop) {
			this.initGestureDetector();
		}

		this.updateAnimationDuration();

		this.addCommand({
			id: "toggle-left-sidebar-animated",
			name: "Toggle left sidebar (animated)",
			callback: () => {
				const collapsed = (this.app.workspace.leftSplit as any)
					.collapsed;
				this.animatedToggle(collapsed ? "expand" : "collapse");
			},
		});
	}

	onunload(): void {
		this.gestureDetector?.destroy();
		this.gestureDetector = null;

		// Defensive cleanup of animation classes
		document.body.classList.remove(ANIMATION_CLASS);
		const sidebarEl = this.getLeftSplitEl();
		sidebarEl?.classList.remove(ANIMATION_CLASS);

		// Remove CSS custom property
		document.body.style.removeProperty(CSS_VAR_DURATION);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Update gesture detector config when settings change
		this.gestureDetector?.updateConfig(this.buildGestureConfig());
	}

	updateAnimationDuration(): void {
		document.body.style.setProperty(
			CSS_VAR_DURATION,
			`${this.settings.animationDurationMs}ms`
		);
	}

	private initGestureDetector(): void {
		this.gestureDetector = new GestureDetector(
			this.buildGestureConfig(),
			(direction: SwipeDirection) => {
				if (this.settings.enabled) {
					this.animatedToggle(direction);
				}
			}
		);

		this.registerDomEvent(
			document,
			"wheel",
			(evt: WheelEvent) => {
				this.gestureDetector?.handleWheel(evt);
			},
			{ passive: true }
		);
	}

	private buildGestureConfig(): GestureConfig {
		return {
			...DEFAULT_GESTURE_CONFIG,
			deltaXThreshold: this.settings.deltaXThreshold,
			horizontalRatio: this.settings.horizontalRatio,
			cooldownMs: this.settings.cooldownMs,
		};
	}

	private animatedToggle(direction: SwipeDirection): void {
		const leftSplit = this.app.workspace.leftSplit as any;

		// Guard: already in desired state
		if (direction === "collapse" && leftSplit.collapsed) return;
		if (direction === "expand" && !leftSplit.collapsed) return;

		// Guard: animation in progress
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
		const restoreWidth = this.savedSidebarWidth ?? originalSidebarWidth;

		const win = getElectronWindow();
		const bounds = win?.getBounds();
		const duration = this.settings.animationDurationMs;

		// Clamp the editor pane so it never changes width during animation.
		// This is the key to avoiding jitter — the editor stays rock-solid
		// while only the sidebar and window size change.
		if (editorEl) {
			const editorWidth = editorEl.offsetWidth;
			editorEl.style.minWidth = editorWidth + "px";
			editorEl.style.maxWidth = editorWidth + "px";
		}

		if (direction === "expand" && win && bounds) {
			// EXPAND: grow window instantly BEFORE the sidebar transition starts.
			// The editor is clamped, so the extra space is just app background
			// on the right. The sidebar then slides in and fills it.
			win.setSize(
				Math.round(bounds.width + restoreWidth),
				bounds.height
			);
		}

		// Add animation classes — CSS transition handles the sidebar slide
		sidebarEl.classList.add(ANIMATION_CLASS);
		document.body.classList.add(ANIMATION_CLASS);

		// Trigger sidebar collapse/expand (CSS transition animates it)
		if (direction === "collapse") {
			leftSplit.collapse();
		} else {
			leftSplit.expand();
		}

		// Clean up after CSS transition completes
		const safetyTimeout = duration + 100;

		const cleanup = () => {
			// COLLAPSE: shrink window instantly AFTER the sidebar transition ends.
			// The sidebar is now gone, editor is clamped at original width,
			// and there's empty space on the right. Snap it away.
			if (direction === "collapse" && win && bounds) {
				win.setSize(
					Math.round(bounds.width - originalSidebarWidth),
					bounds.height
				);
			}

			// Remove editor clamp
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
			once: true,
		});

		const fallbackTimer = setTimeout(() => {
			if (cleaned) return;
			cleaned = true;
			sidebarEl.removeEventListener("transitionend", onTransitionEnd);
			cleanup();
		}, safetyTimeout);
	}

	private getLeftSplitEl(): HTMLElement | null {
		return document.querySelector<HTMLElement>(
			".workspace-split.mod-left-split"
		);
	}

	private getEditorEl(): HTMLElement | null {
		return document.querySelector<HTMLElement>(
			".workspace-split.mod-root"
		);
	}
}
