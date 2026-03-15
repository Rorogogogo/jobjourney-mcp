import type { EmploymentTypeResult, ExperienceLevelResult, JobAnalysisResult, TechStackResult, WorkArrangementResult } from "./types.js";
export declare function detectWorkArrangement(text: string): WorkArrangementResult;
export declare function detectEmploymentType(text: string): EmploymentTypeResult;
export declare function detectExperienceLevel(text: string): ExperienceLevelResult;
export declare function extractExperienceYears(text: string): number | null;
export declare function extractTechStack(text: string): TechStackResult;
export declare function analyzeJobDescription(text: string): JobAnalysisResult;
