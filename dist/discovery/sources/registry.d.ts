import type { DiscoverySourceName } from "../core/types.js";
export type DiscoverySourceTransport = "http" | "browser";
export type DiscoverySourceStatus = "active" | "planned";
export interface DiscoverySourceDefinition {
    name: DiscoverySourceName;
    transport: DiscoverySourceTransport;
    status: DiscoverySourceStatus;
}
export declare const DISCOVERY_SOURCE_NAMES: DiscoverySourceName[];
export declare const ACTIVE_DISCOVERY_SOURCE_NAMES: DiscoverySourceName[];
export declare function getDiscoverySourceDefinition(name: DiscoverySourceName): DiscoverySourceDefinition;
export declare function getAllDiscoverySourceDefinitions(): ReadonlyArray<DiscoverySourceDefinition>;
export declare function getActiveDiscoverySourceNames(): DiscoverySourceName[];
