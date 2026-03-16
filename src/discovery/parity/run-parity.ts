import { DEFAULT_PARITY_CASES } from "./cases.js";
import { executePythonParityCase } from "./python-reference.js";
import { executeTsParityCase } from "./ts-reference.js";
import type {
  ParityCase,
  ParityCaseResult,
  ParityHarnessResult,
  RunParityHarnessOptions,
} from "./types.js";

export type { ParityCase } from "./types.js";

export async function runParityHarness(
  options: RunParityHarnessOptions = {},
): Promise<ParityHarnessResult> {
  const cases = options.cases ?? DEFAULT_PARITY_CASES;
  const executeTsCase = options.executeTsCase ?? executeTsParityCase;
  const executePythonCase = options.executePythonCase ?? executePythonParityCase;
  const results: ParityCaseResult[] = [];

  for (const parityCase of cases) {
    let tsOutput: unknown = null;
    let pythonOutput: unknown = null;
    let tsError: unknown = null;
    let pythonError: unknown = null;

    try {
      tsOutput = await executeTsCase(parityCase);
    } catch (error) {
      tsError = error;
    }

    try {
      pythonOutput = await executePythonCase(parityCase);
    } catch (error) {
      pythonError = error;
    }

    results.push(
      createParityResult({
        parityCase,
        tsOutput,
        pythonOutput,
        tsError,
        pythonError,
      }),
    );
  }

  const passedCases = results.filter((result) => result.passed).length;
  return {
    summary: {
      totalCases: results.length,
      passedCases,
      failedCases: results.length - passedCases,
    },
    results,
  };
}

function createParityResult(options: {
  parityCase: ParityCase;
  tsOutput: unknown;
  pythonOutput: unknown;
  tsError: unknown;
  pythonError: unknown;
}): ParityCaseResult {
  const { parityCase, tsOutput, pythonOutput, tsError, pythonError } = options;

  if (tsError || pythonError) {
    const diff = formatExecutorError(tsError ?? pythonError);
    return {
      caseId: parityCase.id,
      kind: parityCase.kind,
      passed: false,
      diff,
      tsOutput,
      pythonOutput,
    };
  }

  if (isParityEqual(tsOutput, pythonOutput)) {
    return {
      caseId: parityCase.id,
      kind: parityCase.kind,
      passed: true,
      diff: "",
      tsOutput,
      pythonOutput,
    };
  }

  return {
    caseId: parityCase.id,
    kind: parityCase.kind,
    passed: false,
    diff: formatParityDiff(tsOutput, pythonOutput),
    tsOutput,
    pythonOutput,
  };
}

function isParityEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function formatExecutorError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function formatParityDiff(tsOutput: unknown, pythonOutput: unknown): string {
  return [
    "TS output:",
    JSON.stringify(sortParityValue(tsOutput), null, 2),
    "Python output:",
    JSON.stringify(sortParityValue(pythonOutput), null, 2),
  ].join("\n");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortParityValue(value));
}

function sortParityValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortParityValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortParityValue(entry)]),
    );
  }

  return value;
}
