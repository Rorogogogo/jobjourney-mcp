export interface PrRequirementResult {
  isPrRequired: boolean;
  securityClearance: string | null;
  confidence: string;
  matchedPatterns: string[];
  reasoning: string;
}

export interface WorkArrangementResult {
  type: string;
  confidence: string;
  reasoning: string;
}

export interface EmploymentTypeResult {
  type: string;
  confidence: string;
  reasoning: string;
}

export interface TechStackResult {
  technologies: string[];
  count: number;
}

export interface ExperienceLevelResult {
  level: string;
  years: number | null;
  confidence: string;
  reasoning: string;
}

export interface JobAnalysisResult {
  workArrangement: WorkArrangementResult;
  employmentType: EmploymentTypeResult;
  experienceLevel: ExperienceLevelResult;
  techStack: TechStackResult;
  prDetection: PrRequirementResult;
}

export interface SalaryNormalizationResult {
  raw: string;
  minimum: string | null;
  maximum: string | null;
  currency: string;
  period: string;
}
