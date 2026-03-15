const defaultSleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
export class RateLimiter {
    minDelay;
    maxDelay;
    random;
    sleep;
    now;
    lastRequestAt = null;
    constructor(options = {}) {
        const minDelay = options.minDelay ?? 1.2;
        const maxDelay = options.maxDelay ?? 1.8;
        if (minDelay < 0) {
            throw new Error("minDelay must be non-negative");
        }
        if (maxDelay < minDelay) {
            throw new Error("maxDelay must be greater than or equal to minDelay");
        }
        this.minDelay = minDelay;
        this.maxDelay = maxDelay;
        this.random = options.random ?? Math.random;
        this.sleep = options.sleep ?? defaultSleep;
        this.now = options.now ?? (() => Date.now());
    }
    async wait() {
        const currentTime = this.now();
        if (this.lastRequestAt === null) {
            this.lastRequestAt = currentTime;
            return;
        }
        const delayMs = this.computeDelayMs();
        const elapsedMs = currentTime - this.lastRequestAt;
        const remainingMs = delayMs - elapsedMs;
        if (remainingMs > 0) {
            await this.sleep(remainingMs);
        }
        this.lastRequestAt = this.now();
    }
    computeDelayMs() {
        const spread = this.maxDelay - this.minDelay;
        return (this.minDelay + spread * this.random()) * 1000;
    }
}
