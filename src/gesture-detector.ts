export type SwipeDirection = "collapse" | "expand";
export type SwipeCallback = (direction: SwipeDirection) => void;

export interface GestureConfig {
	deltaXThreshold: number;
	horizontalRatio: number;
	cooldownMs: number;
	accumulationWindowMs: number;
	idleResetMs: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
	deltaXThreshold: 80,
	horizontalRatio: 2.0,
	cooldownMs: 600,
	accumulationWindowMs: 300,
	idleResetMs: 150,
};

export class GestureDetector {
	private accumulatedDeltaX = 0;
	private accumulatedAbsDeltaY = 0;
	private windowStart: number | null = null;
	private cooldownUntil = 0;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private config: GestureConfig,
		private callback: SwipeCallback
	) {}

	handleWheel(event: WheelEvent): void {
		// Ignore pinch-to-zoom gestures
		if (event.ctrlKey) return;

		const now = Date.now();

		// Ignore during cooldown
		if (now < this.cooldownUntil) return;

		// Reset if outside accumulation window
		if (
			this.windowStart === null ||
			now - this.windowStart > this.config.accumulationWindowMs
		) {
			this.reset();
			this.windowStart = now;
		}

		// Accumulate deltas
		this.accumulatedDeltaX += event.deltaX;
		this.accumulatedAbsDeltaY += Math.abs(event.deltaY);

		// Schedule idle reset
		this.scheduleIdleReset();

		// Check trigger conditions
		const absDeltaX = Math.abs(this.accumulatedDeltaX);
		if (
			absDeltaX >= this.config.deltaXThreshold &&
			absDeltaX >= this.config.horizontalRatio * this.accumulatedAbsDeltaY
		) {
			const direction: SwipeDirection =
				this.accumulatedDeltaX > 0 ? "collapse" : "expand";

			this.cooldownUntil = now + this.config.cooldownMs;
			this.reset();
			this.callback(direction);
		}
	}

	updateConfig(config: GestureConfig): void {
		this.config = config;
	}

	destroy(): void {
		this.clearIdleTimer();
	}

	private reset(): void {
		this.accumulatedDeltaX = 0;
		this.accumulatedAbsDeltaY = 0;
		this.windowStart = null;
		this.clearIdleTimer();
	}

	private scheduleIdleReset(): void {
		this.clearIdleTimer();
		this.idleTimer = setTimeout(() => {
			this.reset();
		}, this.config.idleResetMs);
	}

	private clearIdleTimer(): void {
		if (this.idleTimer !== null) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
	}
}
