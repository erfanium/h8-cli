import { getConfig } from "./config.js";
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { load, dump } from "js-yaml";

const ISSUER = "https://api.console.hamravesh.ir/openid";
const CLIENT_ID = "kubernetes";
const ACCESS_TOKEN_DIR = join(tmpdir(), "h8");
const KUBECTL_DIR = join(homedir(), ".config", "h8");
const KUBECTL_FILE = join(KUBECTL_DIR, "kubectl.json");

type RefreshTokenMap = Record<string, string>;

function readRefreshTokenMap(): RefreshTokenMap {
  try {
    if (!existsSync(KUBECTL_FILE)) return {};
    return JSON.parse(readFileSync(KUBECTL_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeRefreshTokenMap(map: RefreshTokenMap): void {
  mkdirSync(KUBECTL_DIR, { recursive: true });
  writeFileSync(KUBECTL_FILE, JSON.stringify(map, null, 2) + "\n", "utf-8");
}

export function saveRefreshToken(org: string, refreshToken: string): void {
  const map = readRefreshTokenMap();
  map[org] = refreshToken;
  writeRefreshTokenMap(map);
}

function accessTokenCacheFile(refreshToken: string): string {
  const h = createHash("sha256").update(refreshToken).digest("hex").slice(0, 16);
  return join(ACCESS_TOKEN_DIR, `accessToken_${h}`);
}

export function readAccessTokenFromCache(refreshToken: string): string | null {
  try {
    const path = accessTokenCacheFile(refreshToken);
    if (!existsSync(path)) return null;
    const accessToken = readFileSync(path, "utf-8").trim();
    if (!accessToken || isAccessTokenExpired(accessToken)) return null;
    return accessToken;
  } catch {
    return null;
  }
}

export function writeAccessTokenToCache(refreshToken: string, accessToken: string): void {
  mkdirSync(ACCESS_TOKEN_DIR, { recursive: true });
  writeFileSync(accessTokenCacheFile(refreshToken), accessToken, "utf-8");
}

export function isAccessTokenExpired(accessToken: string): boolean {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return true;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return (payload.exp * 1000) < Date.now() + 30_000;
  } catch {
    return true;
  }
}

export async function refreshAccessToken(refreshToken: string, org?: string): Promise<string> {
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
    throw new Error(`Failed to refresh access token (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { id_token: string; refresh_token: string };
  const newRefreshToken = data.refresh_token || refreshToken;
  writeAccessTokenToCache(newRefreshToken, data.id_token);
  if (data.refresh_token && org) {
    saveRefreshToken(org, data.refresh_token);
  }
  return data.id_token;
}

export async function resolveAccessToken(org: string, log?: (msg: string) => void): Promise<string> {
  const map = readRefreshTokenMap();
  const refreshToken = map[org] || map["default"];
  if (refreshToken) {
    const cached = readAccessTokenFromCache(refreshToken);
    if (cached) return cached;
    try {
      return await refreshAccessToken(refreshToken, org);
    } catch (e) {
      if (log) log(`Failed to refresh access token: ${(e as Error).message}`);
    }
  }

  throw new Error("No kubectl access token available. Run: h8 login kubectl");
}

export async function prepareKubeconfig(opts?: { cluster?: string; namespace?: string; log?: (msg: string) => void }): Promise<{ path: string; cleanup: () => void }> {
  const config = getConfig();
  const org = config.organization || process.env.H8_ORGANIZATION || "";
  if (!org) throw new Error("H8_ORGANIZATION not set.");

  const accessToken = await resolveAccessToken(org, opts?.log);

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
      user.token = accessToken;
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
