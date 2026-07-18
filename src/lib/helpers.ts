import { api } from "./api.js";

const PAAS = "darkube";

export async function resolveAppId(nameOrId: string): Promise<string> {
  if (nameOrId.includes("-") && nameOrId.length > 30) return nameOrId;
  const res = await api<{ results: Array<{ id: string; name: string }> }>(
    `/api/v2/${PAAS}/apps/?limit=500&offset=0&fields=id,name`,
  );
  const match = res.results.find((a) => a.name === nameOrId || a.id === nameOrId);
  if (!match) throw new Error(`App "${nameOrId}" not found`);
  return match.id;
}

const WRITABLE = new Set([
  "name", "creation_method", "namespace", "cluster", "plan", "organization",
  "image_repo", "image_tag", "replicas", "enable_SSL", "custom_subdomain_addr",
  "svc", "builder", "envs", "disk",
]);

export interface AppConfig {
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
  for (const key of WRITABLE) {
    if (key in raw) config[key] = raw[key];
  }
  if (typeof config.namespace === "object" && config.namespace)
    config.namespace = (config.namespace as Record<string, unknown>).id;
  if (typeof config.cluster === "object" && config.cluster)
    config.cluster = (config.cluster as Record<string, unknown>).id;
  if (typeof config.plan === "object" && config.plan)
    config.plan = (config.plan as Record<string, unknown>).id;
  if (typeof config.organization === "object" && config.organization)
    config.organization = (config.organization as Record<string, unknown>).id;
  return config as unknown as AppConfig;
}

export async function putAppConfig(appId: string, config: AppConfig) {
  return api(`/api/v1/${PAAS}/apps/${appId}/`, { method: "PUT", body: config });
}
