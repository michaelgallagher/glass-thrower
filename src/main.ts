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

// Approximate cubic-bezier(0.4, 0, 0.2, 1) — Material Design standard easing.
// Attempt to match the CSS transition curve so the window resize tracks it closely.
function easeStandard(t: number): number {
	// Simple cubic approximation that's close enough:
	// fast start, slow finish — matches the bezier shape.
	return t < 0.5
		? 4 * t * t * t
		: 1 - Math.pow(-2 * t + 2, 3) / 2;
}

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

		// Add animation classes for CSS transition on the sidebar
		sidebarEl.classList.add(ANIMATION_CLASS);
		document.body.classList.add(ANIMATION_CLASS);

		// Trigger the collapse/expand — CSS transition animates sidebar width
		if (direction === "collapse") {
			leftSplit.collapse();
		} else {
			leftSplit.expand();
		}

		// Drive window resize using a time-based easing curve that matches the
		// CSS transition. This avoids reading offsetWidth (forced reflow) every
		// frame — we calculate the expected sidebar width mathematically instead.
		if (win && bounds) {
			const startWindowWidth = bounds.width;
			const startTime = performance.now();
			let rafId: number;

			const syncFrame = () => {
				const elapsed = performance.now() - startTime;
				const progress = Math.min(elapsed / duration, 1);
				const eased = easeStandard(progress);

				let targetWidth: number;
				if (direction === "collapse") {
					// Sidebar goes from originalSidebarWidth → 0
					const sidebarDelta = originalSidebarWidth * eased;
					targetWidth = startWindowWidth - sidebarDelta;
				} else {
					// Sidebar goes from 0 → restoreWidth
					const sidebarCurrent = restoreWidth * eased;
					targetWidth = startWindowWidth + sidebarCurrent;
				}

				win.setSize(
					Math.round(targetWidth),
					bounds.height
				);

				if (progress < 1 && this.animating) {
					rafId = requestAnimationFrame(syncFrame);
				}
			};

			rafId = requestAnimationFrame(syncFrame);

			// Stop rAF loop when CSS transition ends (in case it fires before our loop finishes)
			sidebarEl.addEventListener(
				"transitionend",
				() => cancelAnimationFrame(rafId),
				{ once: true }
			);
		}

		// Clean up after animation completes
		const safetyTimeout = duration + 100;

		const cleanup = () => {
			sidebarEl.classList.remove(ANIMATION_CLASS);
			document.body.classList.remove(ANIMATION_CLASS);
			this.animating = false;
			// Snap to exact final size
			if (win && bounds) {
				const finalWidth =
					direction === "collapse"
						? bounds.width - originalSidebarWidth
						: bounds.width + restoreWidth;
				win.setSize(Math.round(finalWidth), bounds.height);
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
