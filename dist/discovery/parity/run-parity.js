import { DEFAULT_PARITY_CASES } from "./cases.js";
import { executePythonParityCase } from "./python-reference.js";
import { executeTsParityCase } from "./ts-reference.js";
export async function runParityHarness(options = {}) {
    const cases = options.cases ?? DEFAULT_PARITY_CASES;
    const executeTsCase = options.executeTsCase ?? executeTsParityCase;
    const executePythonCase = options.executePythonCase ?? executePythonParityCase;
    const results = [];
    for (const parityCase of cases) {
        let tsOutput = null;
        let pythonOutput = null;
        let tsError = null;
        let pythonError = null;
        try {
            tsOutput = await executeTsCase(parityCase);
        }
        catch (error) {
            tsError = error;
        }
        try {
            pythonOutput = await executePythonCase(parityCase);
        }
        catch (error) {
            pythonError = error;
        }
        results.push(createParityResult({
            parityCase,
            tsOutput,
            pythonOutput,
            tsError,
            pythonError,
        }));
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
function createParityResult(options) {
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
function isParityEqual(left, right) {
    return stableStringify(left) === stableStringify(right);
}
function formatExecutorError(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
function formatParityDiff(tsOutput, pythonOutput) {
    return [
        "TS output:",
        JSON.stringify(sortParityValue(tsOutput), null, 2),
        "Python output:",
        JSON.stringify(sortParityValue(pythonOutput), null, 2),
    ].join("\n");
}
function stableStringify(value) {
    return JSON.stringify(sortParityValue(value));
}
function sortParityValue(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => sortParityValue(entry));
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entry]) => [key, sortParityValue(entry)]));
    }
    return value;
}
