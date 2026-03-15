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

  it("retries one time for transient 429 responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new HttpClient({
      rateLimiter: { wait: async () => {} },
      retryDelayMs: 1,
    });

    const response = await client.getText("https://example.com/jobs");

    expect(response).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
