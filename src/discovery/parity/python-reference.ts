import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import type { ParityCase, PythonParityExecutorOptions } from "./types.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(MODULE_DIR, "../../..");
const DEFAULT_REFERENCE_ROOT = resolve(PLUGIN_ROOT, "../../scrpaing_testing");
const DEFAULT_BRIDGE_SCRIPT_PATH = resolve(PLUGIN_ROOT, "scripts/python_parity_bridge.py");

export async function executePythonParityCase(
  parityCase: ParityCase,
  options: PythonParityExecutorOptions = {},
): Promise<unknown> {
  const referenceRoot = options.referenceRoot ?? DEFAULT_REFERENCE_ROOT;
  const pythonExecutable =
    options.pythonExecutable ??
    (existsSync(resolve(referenceRoot, ".venv/bin/python"))
      ? resolve(referenceRoot, ".venv/bin/python")
      : "python3");
  const bridgeScriptPath = options.bridgeScriptPath ?? DEFAULT_BRIDGE_SCRIPT_PATH;

  return new Promise<unknown>((resolveResult, reject) => {
    const child = spawn(pythonExecutable, [bridgeScriptPath], {
      cwd: referenceRoot,
      env: {
        ...process.env,
        DISCOVERY_PYTHON_REFERENCE_ROOT: referenceRoot,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            normalizeProcessError(
              stderr || stdout || `python parity bridge exited with code ${code ?? "unknown"}`,
            ),
          ),
        );
        return;
      }

      try {
        resolveResult(JSON.parse(stdout));
      } catch (error) {
        reject(
          new Error(
            `Unable to parse python parity output: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });

    child.stdin.write(JSON.stringify(parityCase));
    child.stdin.end();
  });
}

function normalizeProcessError(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
