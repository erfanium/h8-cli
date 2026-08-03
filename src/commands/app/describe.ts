import { Command, Args, Flags } from "@oclif/core";
import { api } from "../../lib/api.js";
import { printJSON, stateIcon } from "../../lib/format.js";

const PAAS = "darkube";

async function resolveAppId(nameOrId: string): Promise<string> {
  if (nameOrId.includes("-") && nameOrId.length > 30) return nameOrId;
  const res = await api<{ results: Array<{ id: string; name: string }> }>(
    `/api/v2/${PAAS}/apps/?limit=500&offset=0&fields=id,name`,
  );
  const match = res.results.find((a) => a.name === nameOrId || a.id === nameOrId);
  if (!match) throw new Error(`App "${nameOrId}" not found`);
  return match.id;
}

export default class AppDescribe extends Command {
  static description = "Show app details";
  static args = { app: Args.string({ description: "App name or ID", required: true }) };
  static flags = { json: Flags.boolean({ description: "JSON output" }) };

  async run() {
    const { args, flags } = await this.parse(AppDescribe);
    const appId = await resolveAppId(args.app);
    const app = await api<Record<string, unknown>>(`/api/v2/${PAAS}/apps/${appId}/`);
    if (flags.json) { this.log(printJSON(app)); return; }
    const s = app.state as Record<string, unknown>;
    const p = app.plan as Record<string, unknown>;
    const d = p?.detail as Record<string, number>;
    const svc = (app.svc ?? {}) as Record<string, unknown>;
    const svcPorts = (svc.ports ?? {}) as Record<string, { nodePort?: number; protocol?: string; servicePort?: number; containerPort?: number }>;
    const portLines = Object.entries(svcPorts).map(
      ([name, port]) =>
        `  ${name}: ${port.servicePort ?? "?"}:${port.containerPort ?? "?"} (${port.protocol ?? "TCP"}${port.nodePort ? `, nodePort ${port.nodePort}` : ""})`,
    );
    this.log([
      `Name:       ${app.name}`,
      `ID:         ${app.id}`,
      `State:      ${stateIcon(s)} ${s.text}`,
      `Type:       ${app.creation_method}`,
      `Plan:       ${d?.cpu_request ?? "?"}m / ${d?.ram_limit ?? "?"}M`,
      `Replicas:   ${app.replicas}`,
      `CPU Req:    ${app.cpu_request ?? "-"}`,
      `RAM Limit:  ${app.ram_limit ?? "-"}`,
      `Enabled:    ${app.is_enabled ? "yes" : "no"}`,
      `SSL:        ${app.enable_SSL ? "enabled" : "disabled"}`,
      `Domain:     ${app.custom_domain_address || "-"}`,
      `Mirror:     ${app.mirror_custom_domain_address || "-"}`,
      `Subdomain:  ${app.custom_subdomain_addr || "-"}`,
      `Cluster:    ${(app.cluster as Record<string, unknown>)?.name ?? "-"}`,
      `Namespace:  ${(app.namespace as Record<string, unknown>)?.name ?? "-"}`,
      `Image:      ${app.image_repo}:${app.image_tag}`,
      `Service:    ${(svc.type as string) ?? "-"}`,
      `ExternalIP: ${(svc.externalIP as string) ?? "-"}`,
      `External:   ${(svc.externalAddress as string) ?? "-"}`,
      `Internal:   ${(svc.internalAddress as string) ?? "-"}`,
      ...(portLines.length > 0 ? [`Ports:` as string, ...portLines] : []),
    ].join("\n"));
  }
}
