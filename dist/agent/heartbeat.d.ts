export interface HeartbeatData {
    pid: number;
    updatedAt: string;
}
export declare function writeHeartbeat(homeDir?: string): void;
export declare function readHeartbeat(homeDir?: string): HeartbeatData | null;
export declare function isAgentHealthy(options?: {
    homeDir?: string;
    maxAgeMs?: number;
    now?: string;
}): boolean;
