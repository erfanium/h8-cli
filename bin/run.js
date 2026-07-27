#!/usr/bin/env node
import { execute } from "@oclif/core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const envFileIdx = process.argv.findIndex((a) => a === "--env-file" || a.startsWith("--env-file="));
if (envFileIdx !== -1) {
  const arg = process.argv[envFileIdx];
  const eqIdx = arg.indexOf("=");
  const path = eqIdx !== -1 ? arg.slice(eqIdx + 1) : process.argv[envFileIdx + 1];
  if (path) {
    process.loadEnvFile(path);
  }
  process.argv.splice(envFileIdx, eqIdx !== -1 ? 1 : 2);
}

await execute({
  type: "module",
  dir: root,
});
