#!/usr/bin/env node
import { execute } from "@oclif/core";

try {
  await execute({
    type: "module",
    dir: import.meta.url,
    development: true,
  });
} catch (err) {
  const error = err as Error & { oclif?: { exit?: number } };
  console.error(error.message);
  process.exit(error.oclif?.exit ?? 2);
}
