export type AtsProviderName = "greenhouse" | "lever";
export type AtsProviderStatus = "active";
export interface AtsProviderDefinition {
    name: AtsProviderName;
    status: AtsProviderStatus;
}
export declare const ATS_PROVIDER_NAMES: AtsProviderName[];
export declare function getAtsProviderDefinition(name: AtsProviderName): AtsProviderDefinition;
export declare function getAllAtsProviderDefinitions(): ReadonlyArray<AtsProviderDefinition>;
