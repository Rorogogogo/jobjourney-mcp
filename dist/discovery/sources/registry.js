const DISCOVERY_SOURCE_DEFINITIONS = [
    { name: "linkedin", transport: "http", status: "active" },
    { name: "seek", transport: "browser", status: "active" },
    { name: "indeed", transport: "browser", status: "planned" },
    { name: "jora", transport: "browser", status: "planned" },
];
export const DISCOVERY_SOURCE_NAMES = DISCOVERY_SOURCE_DEFINITIONS.map((definition) => definition.name);
export function getDiscoverySourceDefinition(name) {
    const definition = DISCOVERY_SOURCE_DEFINITIONS.find((candidate) => candidate.name === name);
    if (!definition) {
        throw new Error(`Unsupported discovery source: ${name}`);
    }
    return definition;
}
export function getAllDiscoverySourceDefinitions() {
    return DISCOVERY_SOURCE_DEFINITIONS;
}
