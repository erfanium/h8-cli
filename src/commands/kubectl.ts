import { Command, Flags } from "@oclif/core";
import { getConfig } from "../lib/config.js";
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { load, dump } from "js-yaml";

const ISSUER = "https://api.console.hamravesh.ir/openid";
const CLIENT_ID = "kubernetes";
const TOKEN_DIR = join(tmpdir(), "h8");

function tokenFile(refreshToken: string): string {
  const h = createHash("sha256").update(refreshToken).digest("hex").slice(0, 16);
  return join(TOKEN_DIR, `token_${h}`);
}

function readTokenFromCache(refreshToken: string): string | null {
  try {
    const path = tokenFile(refreshToken);
    if (!existsSync(path)) return null;
    const token = readFileSync(path, "utf-8").trim();
    if (!token || isTokenExpired(token)) return null;
    return token;
  } catch {
    return null;
  }
}

function writeTokenToCache(refreshToken: string, idToken: string): void {
  mkdirSync(TOKEN_DIR, { recursive: true });
  writeFileSync(tokenFile(refreshToken), idToken, "utf-8");
}

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return true;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return (payload.exp * 1000) < Date.now() + 30_000;
  } catch {
    return true;
  }
}

async function refreshToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  });
  const res = await fetch(`${ISSUER}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { id_token: string; refresh_token: string };
  const newRt = data.refresh_token || refreshToken;
  writeTokenToCache(newRt, data.id_token);
  return data.id_token;
}

export default class Kubectl extends Command {
  static description = "Run kubectl against your Darkube namespace";
  static strict = false as false;
  static flags = {
    cluster: Flags.string({ description: "Target cluster name", char: "c" }),
    namespace: Flags.string({ description: "Target namespace", char: "n" }),
  };

  async run() {
    let flags: { cluster?: string; namespace?: string };
    try {
      ({ flags } = await this.parse(Kubectl));
    } catch {
      // oclif strict=false throws anyway — extract flags from raw argv
      flags = {};
      const raw = process.argv.slice(3);
      for (let i = 0; i < raw.length; i++) {
        if ((raw[i] === "-c" || raw[i] === "--cluster") && raw[i + 1]) {
          flags.cluster = raw[i + 1];
        }
        if ((raw[i] === "-n" || raw[i] === "--namespace") && raw[i + 1]) {
          flags.namespace = raw[i + 1];
        }
      }
    }
    const config = getConfig();
    const org = config.organization || process.env.H8_ORGANIZATION || "";
    if (!org) throw new Error("H8_ORGANIZATION not set.");

    // Resolve token: cached → refresh via H8_KUBECTL_REFRESH_TOKEN → env H8_KUBECTL_TOKEN
    let token: string | null = null;
    const rt = process.env.H8_KUBECTL_REFRESH_TOKEN?.trim();
    if (rt) {
      token = readTokenFromCache(rt);
      if (!token) {
        try {
          token = await refreshToken(rt);
        } catch (e) {
          this.log("Token refresh failed. Run: h8 login kubectl");
          this.log(String((e as Error).message));
          return;
        }
      }
    }
    if (!token) {
      token = process.env.H8_KUBECTL_TOKEN ?? null;
    }
    if (!token) {
      this.log("No kubectl token available.");
      this.log("Set H8_KUBECTL_REFRESH_TOKEN after running: h8 login kubectl");
      return;
    }

    const headers: Record<string, string> = {
      "Authorization": `Api-key ${config.api_key}`,
      "x-organization": org,
    };
    const res = await fetch(`${config.base_url}/api/v1/darkube/kubeconfig/generate/`, { headers });
    if (!res.ok) throw new Error(`Failed to fetch kubeconfig: ${res.status}`);

    const kcfg = load(await res.text()) as Record<string, unknown>;

    // Replace OIDC exec with static token
    const users = kcfg.users as Array<Record<string, unknown>>;
    for (const u of users) {
      if (u.user && typeof u.user === "object") {
        const user = u.user as Record<string, unknown>;
        delete user.exec;
        user.token = token;
      }
    }

    if (flags.cluster || flags.namespace) {
      const contexts = kcfg.contexts as Array<{ name: string; context: { cluster: string; namespace?: string } }> | undefined;
      let ctxName: string | undefined;
      if (flags.cluster) {
        const match = contexts?.find((c) => c.context.cluster === flags.cluster);
        if (!match) {
          const names = contexts?.map((c) => c.context.cluster).join(", ") ?? "(none)";
          throw new Error(`Cluster "${flags.cluster}" not found in kubeconfig. Available: ${names}`);
        }
        ctxName = match.name;
        kcfg["current-context"] = ctxName;
      }
      if (flags.namespace) {
        ctxName = ctxName ?? (kcfg["current-context"] as string);
        const ctx = contexts?.find((c) => c.name === ctxName);
        if (ctx) ctx.context.namespace = flags.namespace;
      }
    }

    const tmpFile = join(tmpdir(), `h8-kubeconfig-${Date.now()}.yaml`);
    writeFileSync(tmpFile, dump(kcfg, { lineWidth: -1 }), "utf-8");

    try {
      const args = process.argv.slice(3).filter((a, i, arr) => {
        if (a === "-c" || a === "--cluster" || a === "-n" || a === "--namespace") {
          arr[i + 1] = "__skip__"; // mark next arg (the value) for skip
          return false;
        }
        return a !== "__skip__";
      });
      if (args.length === 0) {
        this.log("Usage: h8 kubectl <kubectl-args>");
        this.log("Examples:");
        this.log("  h8 kubectl get pods");
        this.log("  h8 kubectl logs <pod-name>");
        return;
      }

      const result = spawnSync("kubectl", args, {
        stdio: "inherit",
        env: { ...process.env, KUBECONFIG: tmpFile },
      });

      if (result.error) throw result.error;
      if (result.status !== 0) process.exitCode = result.status ?? 1;
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  }
}
