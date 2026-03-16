export type ParityCase = {
    id: string;
    kind: "linkedin_search_results";
    input: {
        html: string;
    };
} | {
    id: string;
    kind: "linkedin_job_detail";
    input: {
        html: string;
        jobId: string;
        jobUrl?: string;
    };
} | {
    id: string;
    kind: "ats_detection";
    input: {
        applyUrl: string | null;
        easyApply?: boolean;
    };
} | {
    id: string;
    kind: "salary_normalization";
    input: {
        text: string;
    };
};
export interface ParityCaseResult {
    caseId: string;
    kind: ParityCase["kind"];
    passed: boolean;
    diff: string;
    tsOutput: unknown;
    pythonOutput: unknown;
}
export interface ParityHarnessSummary {
    totalCases: number;
    passedCases: number;
    failedCases: number;
}
export interface ParityHarnessResult {
    summary: ParityHarnessSummary;
    results: ParityCaseResult[];
}
export interface RunParityHarnessOptions {
    cases?: ParityCase[];
    executeTsCase?: (parityCase: ParityCase) => Promise<unknown>;
    executePythonCase?: (parityCase: ParityCase) => Promise<unknown>;
}
export interface PythonParityExecutorOptions {
    referenceRoot?: string;
    pythonExecutable?: string;
    bridgeScriptPath?: string;
}
