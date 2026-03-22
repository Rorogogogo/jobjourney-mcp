import { afterEach, describe, expect, it, vi } from "vitest";
import { startSignalRSupervisor } from "../../src/agent/signalr-supervisor.js";

class FakeConnection {
  private closeHandlers: Array<(error?: Error) => void> = [];
  public stop = vi.fn(async () => {});

  onclose(handler: (error?: Error) => void): void {
    this.closeHandlers.push(handler);
  }

  close(error?: Error): void {
    for (const handler of this.closeHandlers) {
      handler(error);
    }
  }
}

describe("startSignalRSupervisor", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries until the first connection succeeds", async () => {
    vi.useFakeTimers();

    const connection = new FakeConnection();
    const connect = vi
      .fn<() => Promise<FakeConnection>>()
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce(connection);

    const supervisor = startSignalRSupervisor(connect, {
      retryDelayMs: 5_000,
    });

    await vi.runAllTicks();
    expect(connect).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(connect).toHaveBeenCalledTimes(2);

    await supervisor.stop();
  });

  it("reconnects after an established connection closes", async () => {
    vi.useFakeTimers();

    const firstConnection = new FakeConnection();
    const secondConnection = new FakeConnection();
    const connect = vi
      .fn<() => Promise<FakeConnection>>()
      .mockResolvedValueOnce(firstConnection)
      .mockResolvedValueOnce(secondConnection);

    const supervisor = startSignalRSupervisor(connect, {
      retryDelayMs: 5_000,
    });

    await vi.runAllTicks();
    expect(connect).toHaveBeenCalledTimes(1);

    firstConnection.close(new Error("socket closed"));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(connect).toHaveBeenCalledTimes(2);

    await supervisor.stop();
  });
});
