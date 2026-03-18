import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient, DEFAULT_HEADERS } from "../../../src/discovery/utils/http.js";

describe("HttpClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("applies shared default headers and waits through the limiter", async () => {
    const wait = vi.fn(async () => {});
    const fetchMock = vi.fn(async () =>
      new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new HttpClient({
      rateLimiter: { wait },
      timeoutMs: 2000,
    });

    const response = await client.getText("https://example.com/jobs");

    expect(response).toBe("ok");
    expect(wait).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/jobs");
    expect(init?.headers).toMatchObject(DEFAULT_HEADERS);
  });

  it("retries on transient 429 responses with exponential backoff", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const sleepMock = vi.fn(async () => {});
    const client = new HttpClient({
      rateLimiter: { wait: async () => {} },
      retryDelayMs: 1000,
      maxRetries: 3,
      sleep: sleepMock,
    });

    const response = await client.getText("https://example.com/jobs");

    expect(response).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // First retry: retryDelayMs * 2^0 = 1000
    expect(sleepMock).toHaveBeenCalledWith(1000);
  });

  it("retries up to maxRetries times with increasing delays", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const sleepMock = vi.fn(async () => {});
    const client = new HttpClient({
      rateLimiter: { wait: async () => {} },
      retryDelayMs: 1000,
      maxRetries: 3,
      sleep: sleepMock,
    });

    const response = await client.getText("https://example.com/jobs");

    expect(response).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // Exponential backoff: 1000, 2000, 4000
    expect(sleepMock).toHaveBeenNthCalledWith(1, 1000);
    expect(sleepMock).toHaveBeenNthCalledWith(2, 2000);
    expect(sleepMock).toHaveBeenNthCalledWith(3, 4000);
  });

  it("throws after exhausting all retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("busy", { status: 429 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new HttpClient({
      rateLimiter: { wait: async () => {} },
      retryDelayMs: 1,
      maxRetries: 2,
      sleep: async () => {},
    });

    await expect(client.getText("https://example.com/jobs")).rejects.toThrow("HTTP 429");
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});
