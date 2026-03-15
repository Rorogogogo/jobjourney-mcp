export declare const DEFAULT_HEADERS: {
    "User-Agent": string;
    "Accept-Language": string;
};
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
export declare class HttpClient {
    readonly rateLimiter: RateLimiterLike;
    readonly timeoutMs: number;
    readonly maxRetries: number;
    readonly retryDelayMs: number;
    private readonly headers;
    private readonly fetchImpl;
    private readonly sleep;
    constructor(options?: HttpClientOptions);
    get(url: string, options?: {
        params?: Record<string, string>;
        headers?: Record<string, string>;
    }): Promise<Response>;
    getText(url: string, options?: {
        params?: Record<string, string>;
        headers?: Record<string, string>;
    }): Promise<string>;
    getJson<T>(url: string, options?: {
        params?: Record<string, string>;
        headers?: Record<string, string>;
    }): Promise<T>;
}
