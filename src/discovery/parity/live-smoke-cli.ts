import { runLiveParitySmoke } from "./live-smoke.js";

async function main(): Promise<void> {
  const result = await runLiveParitySmoke();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
