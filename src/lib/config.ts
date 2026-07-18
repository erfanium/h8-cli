import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".h8");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface Config {
  api_key: string;
  organization: string;
  base_url: string;
}

let cached: Config | null = null;

export function getConfig(): Config {
  if (cached) return cached;
  const envKey = process.env.H8_API_KEY;
  if (envKey) {
    cached = {
      api_key: envKey,
      organization: process.env.H8_ORGANIZATION ?? "",
      base_url: "https://api.hamravesh.com",
    };
    return cached;
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    cached = JSON.parse(raw) as Config;
    return cached;
  } catch {
    throw new Error(
      "No API key found. Set H8_API_KEY env var or run: h8 login <api-key>"
    );
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
  cached = config;
}
