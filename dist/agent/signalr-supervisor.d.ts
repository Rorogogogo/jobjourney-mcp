export interface SignalRConnectionLike {
    onclose(handler: (error?: Error) => void): void;
    stop(): Promise<void>;
}
interface SignalRSupervisorOptions {
    retryDelayMs?: number;
    logError?: (error: unknown) => void;
}
export interface SignalRSupervisor {
    stop(): Promise<void>;
}
export declare function startSignalRSupervisor(connect: () => Promise<SignalRConnectionLike>, options?: SignalRSupervisorOptions): SignalRSupervisor;
export {};
