import { RateLimiter } from "./rate-limit.js";

export const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export interface RateLimiterLike {
  wait(): Promise<void>;
}

export interface HttpClientOptions {
  rateLimiter?: RateLimiterLike;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export class HttpClient {
  readonly rateLimiter: RateLimiterLike;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly retryDelayMs: number;

  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: HttpClientOptions = {}) {
    this.rateLimiter = options.rateLimiter ?? new RateLimiter();
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.headers = { ...DEFAULT_HEADERS, ...(options.headers ?? {}) };
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async get(
    url: string,
    options: {
      params?: Record<string, string>;
      headers?: Record<string, string>;
    } = {},
  ): Promise<Response> {
    const requestUrl = buildUrl(url, options.params);
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= this.maxRetries) {
      await this.rateLimiter.wait();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchImpl(requestUrl, {
          method: "GET",
          headers: { ...this.headers, ...(options.headers ?? {}) },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (RETRY_STATUS_CODES.has(response.status) && attempt < this.maxRetries) {
          attempt += 1;
          await this.sleep(this.retryDelayMs * Math.pow(2, attempt - 1));
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${requestUrl}`);
        }
        return response;
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
        if (attempt >= this.maxRetries) {
          throw error;
        }
        attempt += 1;
        await this.sleep(this.retryDelayMs * Math.pow(2, attempt - 1));
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Request failed for ${requestUrl}`);
  }

  async getText(
    url: string,
    options: {
      params?: Record<string, string>;
      headers?: Record<string, string>;
    } = {},
  ): Promise<string> {
    const response = await this.get(url, options);
    return response.text();
  }

  async getJson<T>(
    url: string,
    options: {
      params?: Record<string, string>;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const response = await this.get(url, options);
    return (await response.json()) as T;
  }
}

function buildUrl(url: string, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) {
    return url;
  }

  const built = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    built.searchParams.set(key, value);
  }
  return built.toString();
}
