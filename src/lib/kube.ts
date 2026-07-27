import { getConfig } from "./config.js";
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

export function readTokenFromCache(refreshToken: string): string | null {
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

export function writeTokenToCache(refreshToken: string, idToken: string): void {
  mkdirSync(TOKEN_DIR, { recursive: true });
  writeFileSync(tokenFile(refreshToken), idToken, "utf-8");
}

export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return true;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return (payload.exp * 1000) < Date.now() + 30_000;
  } catch {
    return true;
  }
}

export async function refreshToken(refreshToken: string): Promise<string> {
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

export async function resolveToken(log?: (msg: string) => void): Promise<string> {
  const rt = process.env.H8_KUBECTL_REFRESH_TOKEN?.trim();
  if (rt) {
    const cached = readTokenFromCache(rt);
    if (cached) return cached;
    try {
      return await refreshToken(rt);
    } catch (e) {
      const msg = `Token refresh failed: ${(e as Error).message}`;
      if (log) log(msg);
    }
  }
  const idToken = process.env.H8_KUBECTL_TOKEN?.trim();
  if (idToken) return idToken;
  throw new Error("No kubectl token available. Run: h8 login kubectl\nThen: export H8_KUBECTL_REFRESH_TOKEN=\"<token>\"");
}

export async function prepareKubeconfig(opts?: { cluster?: string; namespace?: string; log?: (msg: string) => void }): Promise<{ path: string; cleanup: () => void }> {
  const config = getConfig();
  const org = config.organization || process.env.H8_ORGANIZATION || "";
  if (!org) throw new Error("H8_ORGANIZATION not set.");

  const token = await resolveToken(opts?.log);

  const headers: Record<string, string> = {
    "Authorization": `Api-key ${config.api_key}`,
    "x-organization": org,
  };
  const res = await fetch(`${config.base_url}/api/v1/darkube/kubeconfig/generate/`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch kubeconfig: ${res.status}`);

  const kcfg = load(await res.text()) as Record<string, unknown>;

  const users = kcfg.users as Array<Record<string, unknown>>;
  for (const u of users) {
    if (u.user && typeof u.user === "object") {
      const user = u.user as Record<string, unknown>;
      delete user.exec;
      user.token = token;
    }
  }

  if (opts?.cluster || opts?.namespace) {
    const contexts = kcfg.contexts as Array<{ name: string; context: { cluster: string; namespace?: string } }> | undefined;
    let ctxName: string | undefined;
    if (opts.cluster) {
      const match = contexts?.find((c) => c.context.cluster === opts.cluster);
      if (!match) {
        const names = contexts?.map((c) => c.context.cluster).join(", ") ?? "(none)";
        throw new Error(`Cluster "${opts.cluster}" not found in kubeconfig. Available: ${names}`);
      }
      ctxName = match.name;
      kcfg["current-context"] = ctxName;
    }
    if (opts.namespace) {
      ctxName = ctxName ?? (kcfg["current-context"] as string);
      const ctx = contexts?.find((c) => c.name === ctxName);
      if (ctx) ctx.context.namespace = opts.namespace;
    }
  }

  const tmpFile = join(tmpdir(), `h8-kubeconfig-${Date.now()}.yaml`);
  writeFileSync(tmpFile, dump(kcfg, { lineWidth: -1 }), "utf-8");
  return { path: tmpFile, cleanup: () => { try { unlinkSync(tmpFile); } catch {} } };
}

export function runKubectl(args: string[], kubeconfigPath: string): number {
  const result = spawnSync("kubectl", args, {
    stdio: "inherit",
    env: { ...process.env, KUBECONFIG: kubeconfigPath },
  });
  if (result.error) throw result.error;
  return result.status ?? 0;
}
