const ATS_PROVIDER_DEFINITIONS = [
    { name: "greenhouse", status: "active" },
    { name: "lever", status: "active" },
];
export const ATS_PROVIDER_NAMES = ATS_PROVIDER_DEFINITIONS.map((definition) => definition.name);
export function getAtsProviderDefinition(name) {
    const definition = ATS_PROVIDER_DEFINITIONS.find((candidate) => candidate.name === name);
    if (!definition) {
        throw new Error(`Unsupported ATS provider: ${name}`);
    }
    return definition;
}
export function getAllAtsProviderDefinitions() {
    return ATS_PROVIDER_DEFINITIONS;
}
