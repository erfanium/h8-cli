import { Command, Args, Flags } from "@oclif/core";
import { api } from "../../lib/api.js";
import { printJSON, stateIcon } from "../../lib/format.js";

const PAAS = "darkube";

interface Resolved {
  orgId: number;
  clusterId: number;
  nsId: number;
  planId: string;
}

async function resolveDefaults(clusterName: string, nsName: string, planId: string | undefined): Promise<Resolved> {
  const profile = await api<{
    id: number;
    organizations: Array<{
      id: number;
      available_clusters: Array<{ id: number; name: string }>;
    }>;
  }>("/api/v2/users/profile");
  const orgId = profile.organizations[0]?.id;
  if (!orgId) throw new Error("No organizations found");

  const clusters = profile.organizations[0].available_clusters;
  const c = clusters.find((x) => x.name === clusterName);
  if (!c) throw new Error(`Cluster "${clusterName}" not found. Available: ${clusters.map((x) => x.name).join(", ")}`);

  const nsRes = await api<{ results: Array<{ id: number; name: string }> }>(
    `/api/v1/${PAAS}/namespaces/`,
  );
  const ns = nsRes.results.find((x) => x.name === nsName);
  if (!ns) throw new Error(`Namespace "${nsName}" not found. Available: ${nsRes.results.map((x) => x.name).join(", ")}`);

  let finalPlanId: string;
  if (planId) {
    finalPlanId = planId;
  } else {
    const plans = await api<{ results: Array<{ id: string; plan_type: string; detail: { cpu_request: number; ram_limit: number } }> }>(
      `/api/v1/${PAAS}/plans/`,
    );
    const appPlans = plans.results.filter((x) => x.plan_type === "app" && x.detail?.cpu_request);
    appPlans.sort((a, b) => (a.detail.cpu_request ?? 0) - (b.detail.cpu_request ?? 0));
    const p = appPlans[0];
    if (!p) throw new Error("No app plans found");
    finalPlanId = p.id;
  }

  return { orgId, clusterId: c.id, nsId: ns.id, planId: finalPlanId };
}

function parsePort(raw: string): { name: string; protocol: string; servicePort: number; containerPort: number } {
  const [left, right] = raw.split(":");
  if (!left || !right) throw new Error(`Invalid port format: "${raw}". Use servicePort:containerPort (e.g. 80:3000)`);
  return {
    name: left === "80" || left === "443" ? "main" : `port-${left}`,
    protocol: "TCP",
    servicePort: parseInt(left, 10),
    containerPort: parseInt(right, 10),
  };
}

function parseImage(raw: string): { repo: string; tag: string } {
  const idx = raw.lastIndexOf(":");
  if (idx === -1) return { repo: raw, tag: "latest" };
  const tag = raw.slice(idx + 1);
  if (tag.includes("/")) return { repo: raw, tag: "latest" };
  return { repo: raw.slice(0, idx), tag };
}

export default class AppCreate extends Command {
  static description = "Create a new app";
  static args = { name: Args.string({ description: "App name", required: true }) };
  static flags = {
    image: Flags.string({ description: "Docker image (repo:tag)", required: true }),
    port: Flags.string({ description: "Port mapping (svcPort:containerPort)", multiple: true, required: true }),
    env: Flags.string({ description: "Environment variable (KEY=VALUE)", multiple: true }),
    cluster: Flags.string({ description: "Cluster name", required: true }),
    namespace: Flags.string({ description: "Namespace name", required: true }),
    subdomain: Flags.string({ description: "Custom subdomain (.darkube.ir)", required: true }),
    plan: Flags.string({ description: "Plan ID (default: 250m/500M app plan)" }),
    ssl: Flags.boolean({ description: "Enable SSL", default: true, allowNo: true }),
    replicas: Flags.integer({ description: "Replica count", default: 1 }),
    json: Flags.boolean({ description: "JSON output" }),
  };

  async run() {
    const { args, flags } = await this.parse(AppCreate);
    const r = await resolveDefaults(flags.cluster, flags.namespace, flags.plan);
    const img = parseImage(flags.image);
    const subdomain = flags.subdomain;

    // Check subdomain availability
    try {
      await api(`/${PAAS}/apps/check_subdomain/`, { method: "POST", body: { subdomain } });
    } catch (e) {
      if (e instanceof Error && e.message.includes("400")) {
        this.error(`Subdomain "${subdomain}" is already taken. Use --subdomain to pick another.`);
      }
      throw e;
    }

    const ports: Record<string, unknown> = {};
    for (const p of flags.port) {
      const parsed = parsePort(p);
      ports[parsed.name] = { protocol: parsed.protocol, servicePort: parsed.servicePort, containerPort: parsed.containerPort };
    }

    const appConfig: Record<string, unknown> = {
      name: args.name,
      creation_method: "docker_image",
      namespace: r.nsId,
      cluster: r.clusterId,
      plan: r.planId,
      organization: r.orgId,
      image_repo: img.repo,
      image_tag: img.tag,
      replicas: flags.replicas,
      enable_SSL: flags.ssl,
      custom_subdomain_addr: subdomain,
      builder: "dockerfile",
      svc: { type: "ClusterIP", ports },
      envs: (flags.env ?? []).map((e) => {
        const eq = e.indexOf("=");
        if (eq === -1) throw new Error(`Invalid env format: "${e}"`);
        return { name: e.slice(0, eq), value: e.slice(eq + 1) };
      }),
    };

    const result = await api<Record<string, unknown>>(`/api/v1/${PAAS}/apps/`, { method: "POST", body: appConfig });

    if (flags.json) { this.log(printJSON(result)); return; }
    this.log(`Created "${result.name}":`);
    this.log(`  ID:      ${result.id}`);
    this.log(`  Domain:  ${result.custom_domain_address ?? ""}`);
    this.log(`  Mirror:  ${result.mirror_custom_domain_address ?? ""}`);
    const s = (result.state as Record<string, unknown>) ?? {};
    this.log(`  State:   ${stateIcon(s)} ${s.text ?? ""}`);
  }
}
