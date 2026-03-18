export type AtsProviderName = "greenhouse" | "lever";
export type AtsProviderStatus = "active";

export interface AtsProviderDefinition {
  name: AtsProviderName;
  status: AtsProviderStatus;
}

const ATS_PROVIDER_DEFINITIONS: ReadonlyArray<AtsProviderDefinition> = [
  { name: "greenhouse", status: "active" },
  { name: "lever", status: "active" },
];

export const ATS_PROVIDER_NAMES = ATS_PROVIDER_DEFINITIONS.map(
  (definition) => definition.name,
);

export function getAtsProviderDefinition(
  name: AtsProviderName,
): AtsProviderDefinition {
  const definition = ATS_PROVIDER_DEFINITIONS.find(
    (candidate) => candidate.name === name,
  );
  if (!definition) {
    throw new Error(`Unsupported ATS provider: ${name}`);
  }
  return definition;
}

export function getAllAtsProviderDefinitions(): ReadonlyArray<AtsProviderDefinition> {
  return ATS_PROVIDER_DEFINITIONS;
}
