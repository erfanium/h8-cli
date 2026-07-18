#!/usr/bin/env node
import { execute } from "@oclif/core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await execute({
  type: "module",
  dir: root,
});
