import { beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../../../src/discovery/utils/rate-limit.js";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses crawler-aligned defaults", () => {
    const limiter = new RateLimiter();

    expect(limiter.minDelay).toBe(1.2);
    expect(limiter.maxDelay).toBe(1.8);
  });

  it("does not sleep before the first request", async () => {
    const sleepSpy = vi.spyOn(globalThis, "setTimeout");
    const limiter = new RateLimiter({ random: () => 0.5 });

    await limiter.wait();

    expect(sleepSpy).not.toHaveBeenCalled();
  });

  it("sleeps within the configured jitter window after the first request", async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ minDelay: 1.2, maxDelay: 1.8, random: () => 0.5 });

    await limiter.wait();
    const secondWait = limiter.wait();

    await vi.advanceTimersByTimeAsync(1499);
    let done = false;
    void secondWait.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await secondWait;
    expect(done).toBe(true);
  });
});
