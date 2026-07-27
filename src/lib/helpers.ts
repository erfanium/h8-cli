import { api } from "./api.js";

const PAAS = "darkube";

export function guardDestructive(): void {
  if (process.env.H8_ALLOW_DESTRUCTIVE !== "true") {
    throw new Error("Destructive commands are disabled. Set H8_ALLOW_DESTRUCTIVE=true to enable.");
  }
}

export async function resolveAppId(nameOrId: string): Promise<string> {
  if (nameOrId.includes("-") && nameOrId.length > 30) return nameOrId;
  const res = await api<{ results: Array<{ id: string; name: string }> }>(
    `/api/v2/${PAAS}/apps/?limit=500&offset=0&fields=id,name`,
  );
  const match = res.results.find((a) => a.name === nameOrId || a.id === nameOrId);
  if (!match) throw new Error(`App "${nameOrId}" not found`);
  return match.id;
}

const READONLY = new Set([
  "id", "state", "token", "custom_domain_address", "mirror_custom_domain_address",
  "cpu_request", "ram_limit", "is_enabled", "enable_ssl", "ssl_issuer",
  "created_at", "updated_at", "share_link",
]);

interface NestedId { id: number | string }

const NESTED_KEYS = new Set(["namespace", "cluster", "plan", "organization"]);

export interface AppConfig extends Record<string, unknown> {
  name: string;
  creation_method: string;
  namespace: number;
  cluster: number;
  plan: string;
  organization: number;
  image_repo: string;
  image_tag: string;
  replicas: number;
  enable_SSL: boolean;
  custom_subdomain_addr: string;
  svc: Record<string, unknown>;
  builder: string;
  envs: Array<{ name: string; value: string }>;
}

export async function getWritable(appId: string): Promise<AppConfig> {
  const raw = await api<Record<string, unknown>>(`/api/v1/${PAAS}/apps/${appId}/`);
  const config: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (!READONLY.has(key)) {
      config[key] = raw[key];
    }
  }
  for (const key of NESTED_KEYS) {
    if (config[key] && typeof config[key] === "object") {
      config[key] = (config[key] as NestedId).id;
    }
  }
  return config as unknown as AppConfig;
}

export async function putAppConfig(appId: string, config: AppConfig) {
  return api(`/api/v1/${PAAS}/apps/${appId}/`, { method: "PUT", body: config });
}
