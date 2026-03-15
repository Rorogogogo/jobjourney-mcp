export interface SleepFn {
    (ms: number): Promise<void>;
}
export interface RandomFn {
    (): number;
}
export interface NowFn {
    (): number;
}
export interface RateLimiterOptions {
    minDelay?: number;
    maxDelay?: number;
    random?: RandomFn;
    sleep?: SleepFn;
    now?: NowFn;
}
export declare class RateLimiter {
    readonly minDelay: number;
    readonly maxDelay: number;
    private readonly random;
    private readonly sleep;
    private readonly now;
    private lastRequestAt;
    constructor(options?: RateLimiterOptions);
    wait(): Promise<void>;
    private computeDelayMs;
}
