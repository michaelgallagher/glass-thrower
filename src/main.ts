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
		if (!sidebarEl) {
			// Fallback: no animation, just toggle
			if (direction === "collapse") {
				leftSplit.collapse();
			} else {
				leftSplit.expand();
			}
			return;
		}

		this.animating = true;

		// Measure sidebar width before collapsing
		const originalSidebarWidth = sidebarEl.offsetWidth;
		if (direction === "collapse") {
			this.savedSidebarWidth = originalSidebarWidth;
		}

		const win = getElectronWindow();
		const bounds = win?.getBounds();

		// Add animation classes for CSS transition on the sidebar
		sidebarEl.classList.add(ANIMATION_CLASS);
		document.body.classList.add(ANIMATION_CLASS);

		// Trigger the collapse/expand — CSS transition will animate sidebar width
		if (direction === "collapse") {
			leftSplit.collapse();
		} else {
			leftSplit.expand();
		}

		// Drive window resize frame-by-frame in sync with the sidebar CSS transition.
		// Each frame: measure the sidebar's current width, adjust window width so
		// the editor pane never changes size.
		if (win && bounds) {
			const startWindowWidth = bounds.width;
			let rafId: number;

			if (direction === "collapse") {
				const syncFrame = () => {
					const currentSidebarWidth = sidebarEl.offsetWidth;
					const delta = originalSidebarWidth - currentSidebarWidth;
					win.setBounds(
						{
							x: bounds.x,
							y: bounds.y,
							width: startWindowWidth - delta,
							height: bounds.height,
						},
						false
					);
					if (currentSidebarWidth > 0 && this.animating) {
						rafId = requestAnimationFrame(syncFrame);
					}
				};
				rafId = requestAnimationFrame(syncFrame);
			} else {
				const restoreWidth =
					this.savedSidebarWidth ?? originalSidebarWidth;
				const syncFrame = () => {
					const currentSidebarWidth = sidebarEl.offsetWidth;
					win.setBounds(
						{
							x: bounds.x,
							y: bounds.y,
							width: startWindowWidth + currentSidebarWidth,
							height: bounds.height,
						},
						false
					);
					if (
						currentSidebarWidth < restoreWidth &&
						this.animating
					) {
						rafId = requestAnimationFrame(syncFrame);
					}
				};
				rafId = requestAnimationFrame(syncFrame);
			}

			// Stop rAF loop when animation ends
			const stopRaf = () => cancelAnimationFrame(rafId);
			sidebarEl.addEventListener("transitionend", stopRaf, {
				once: true,
			});
		}

		// Clean up after animation completes
		const duration = this.settings.animationDurationMs;
		const safetyTimeout = duration + 100;

		const cleanup = () => {
			sidebarEl.classList.remove(ANIMATION_CLASS);
			document.body.classList.remove(ANIMATION_CLASS);
			this.animating = false;
			// Ensure final window size is exact
			if (win && bounds) {
				const finalWidth =
					direction === "collapse"
						? bounds.width - originalSidebarWidth
						: bounds.width +
							(this.savedSidebarWidth ?? originalSidebarWidth);
				win.setBounds(
					{
						x: bounds.x,
						y: bounds.y,
						width: finalWidth,
						height: bounds.height,
					},
					false
				);
			}
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
}
