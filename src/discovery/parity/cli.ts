import { runParityHarness } from "./run-parity.js";

async function main(): Promise<void> {
  const result = await runParityHarness();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.summary.failedCases > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
